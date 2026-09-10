import { useEffect, useMemo, useRef, useState } from 'react'
import { BookOpen, ChevronLeft, LogOut, Menu, Moon, Pencil, Plus, RefreshCw, Search, Sun, Trash2 } from 'lucide-react'
import { BookEditor } from './BookEditor'
import { Chapter, createChapter, createGithub, deleteChapter, discoverProjects, loadChapter, loadChapters, loadProject, Project, renameChapter, saveChapter } from './github'
import { storage } from './storage'

type SyncState = 'idle' | 'local' | 'syncing' | 'synced' | 'error'

function nextChapterName(chapters: Chapter[]) {
  const max = chapters.reduce((value, chapter) => {
    const match = chapter.name.match(/^(\d+)/)
    return Math.max(value, match ? Number(match[1]) : 0)
  }, 0)
  return `${max + 1}. Новая глава.txt`
}

function normalizeChapterName(name: string) {
  return /\.(md|txt)$/i.test(name) ? name : `${name}.txt`
}

export default function App() {
  const [theme, setTheme] = useState(storage.getTheme())
  const [token, setToken] = useState(storage.getToken())
  const [tokenDraft, setTokenDraft] = useState(token)
  const octokit = useMemo(() => token ? createGithub(token) : null, [token])
  const [projects, setProjects] = useState<Project[]>([])
  const [project, setProject] = useState<Project | null>(null)
  const [chapters, setChapters] = useState<Chapter[]>([])
  const [activePath, setActivePath] = useState('')
  const [content, setContent] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sync, setSync] = useState<SyncState>('idle')
  const [countdown, setCountdown] = useState<number | null>(null)
  const [drawer, setDrawer] = useState(false)
  const [manualRepo, setManualRepo] = useState('')
  const touchStart = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.documentElement.style.colorScheme = theme
    storage.setTheme(theme)
  }, [theme])

  const toggleTheme = () => setTheme((current) => current === 'light' ? 'dark' : 'light')
  const themeIcon = theme === 'light' ? <Moon size={18} /> : <Sun size={18} />
  const themeTitle = theme === 'light' ? 'Тёмная тема' : 'Светлая тема'
  const activeChapter = chapters.find((chapter) => chapter.path === activePath) || null

  const refreshProjects = async () => {
    if (!octokit) return
    setBusy(true); setError('')
    try {
      const found = await discoverProjects(octokit)
      setProjects(found)
      storage.setProjects(found.map((item) => item.fullName))
    } catch (e) { setError(e instanceof Error ? e.message : 'Не удалось получить проекты') }
    finally { setBusy(false) }
  }

  useEffect(() => {
    if (!octokit || project) return
    const cached = storage.getProjects()
    if (!cached.length) { void refreshProjects(); return }
    let cancelled = false
    setBusy(true)
    Promise.allSettled(cached.map((name) => loadProject(octokit, name))).then((results) => {
      if (cancelled) return
      setProjects(results.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []))
      setBusy(false)
    })
    return () => { cancelled = true }
  }, [octokit, project])

  const openProject = async (selected: Project) => {
    if (!octokit) return
    setBusy(true); setError('')
    try {
      const remote = await loadChapters(octokit, selected)
      const merged = remote.map((chapter) => {
        const local = storage.getDraft(selected.fullName, chapter.path)
        if (local?.dirty) return { ...chapter, content: local.content }
        storage.setDraft(selected.fullName, chapter.path, { content: chapter.content, baseSha: chapter.sha, dirty: false, updatedAt: Date.now() })
        return chapter
      })
      setProject(selected); setChapters(merged); setActivePath(merged[0]?.path || ''); setContent(merged[0]?.content || ''); setSync('idle'); setCountdown(null)
    } catch (e) { setError(e instanceof Error ? e.message : 'Не удалось открыть книгу') }
    finally { setBusy(false) }
  }

  const openManualProject = async () => {
    if (!octokit || !manualRepo.trim()) return
    setBusy(true); setError('')
    try {
      const loaded = await loadProject(octokit, manualRepo.trim())
      const next = [loaded, ...projects.filter((item) => item.fullName !== loaded.fullName)]
      setProjects(next); storage.setProjects(next.map((item) => item.fullName)); setManualRepo(''); await openProject(loaded)
    } catch (e) { setError(e instanceof Error ? e.message : 'Репозиторий не похож на book-framework проект'); setBusy(false) }
  }

  const selectChapter = (chapter: Chapter) => {
    setActivePath(chapter.path)
    const local = project ? storage.getDraft(project.fullName, chapter.path) : null
    setContent(local?.content ?? chapter.content); setDrawer(false); setSync(local?.dirty ? 'local' : 'idle'); setCountdown(local?.dirty ? 60 : null)
  }

  const edit = (next: string) => {
    if (!project || !activeChapter) return
    setContent(next); setSync('local'); setCountdown(60)
    storage.setDraft(project.fullName, activeChapter.path, { content: next, baseSha: activeChapter.sha, dirty: true, updatedAt: Date.now() })
    setChapters((items) => items.map((item) => item.path === activeChapter.path ? { ...item, content: next } : item))
  }

  const syncCurrentChapter = async (checkRemote = false) => {
    if (!octokit || !project || !activeChapter) return
    setSync('syncing'); setCountdown(null); setError('')
    try {
      let current = activeChapter
      if (checkRemote) {
        const remote = await loadChapter(octokit, project, activeChapter.path)
        const local = storage.getDraft(project.fullName, activeChapter.path)
        if (remote.sha !== activeChapter.sha && local?.dirty) {
          setSync('local'); setCountdown(60)
          setError('В GitHub есть более новая версия этой главы. Локальный текст не отправлен, чтобы не перезаписать чужие изменения.')
          return
        }
        if (remote.sha !== activeChapter.sha && !local?.dirty) {
          setChapters((items) => items.map((item) => item.path === remote.path ? remote : item))
          setContent(remote.content)
          storage.setDraft(project.fullName, remote.path, { content: remote.content, baseSha: remote.sha, dirty: false, updatedAt: Date.now() })
          setSync('synced')
          return
        }
        current = remote
      }
      const local = storage.getDraft(project.fullName, activeChapter.path)
      if (!local?.dirty && content === current.content) { setSync('synced'); return }
      const sha = await saveChapter(octokit, project, current, content)
      const saved = { ...current, sha, content }
      setChapters((items) => items.map((item) => item.path === saved.path ? saved : item))
      storage.setDraft(project.fullName, saved.path, { content, baseSha: sha, dirty: false, updatedAt: Date.now() })
      if (checkRemote) {
        const verified = await loadChapter(octokit, project, saved.path)
        setChapters((items) => items.map((item) => item.path === verified.path ? verified : item))
        storage.setDraft(project.fullName, verified.path, { content: verified.content, baseSha: verified.sha, dirty: false, updatedAt: Date.now() })
        setContent(verified.content)
      }
      setSync('synced')
    } catch (e) {
      setSync('error')
      setError(e instanceof Error ? e.message : 'Не удалось синхронизировать главу')
    }
  }

  const pullCurrentChapter = async () => {
    if (!octokit || !project || !activeChapter) return
    const local = storage.getDraft(project.fullName, activeChapter.path)
    if (local?.dirty && !window.confirm('Есть несинхронизированные локальные изменения. Скачать версию из GitHub и заменить ими локальный текст?')) return
    setSync('syncing'); setCountdown(null); setError('')
    try {
      const remote = await loadChapter(octokit, project, activeChapter.path)
      setChapters((items) => items.map((item) => item.path === remote.path ? remote : item))
      setContent(remote.content)
      storage.setDraft(project.fullName, remote.path, { content: remote.content, baseSha: remote.sha, dirty: false, updatedAt: Date.now() })
      setSync('synced')
    } catch (e) {
      setSync('error')
      setError(e instanceof Error ? e.message : 'Не удалось скачать главу из GitHub')
    }
  }

  useEffect(() => {
    if (!octokit || !project || !activeChapter || sync !== 'local') { setCountdown(null); return }
    const deadline = Date.now() + 60_000
    setCountdown(60)
    const interval = window.setInterval(() => {
      const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000))
      setCountdown(left)
      if (left <= 0) {
        window.clearInterval(interval)
        void syncCurrentChapter(false)
      }
    }, 250)
    return () => window.clearInterval(interval)
  }, [content, sync, octokit, project, activePath])

  const addChapter = async () => {
    if (!octokit || !project) return
    const name = window.prompt('Имя файла новой главы', nextChapterName(chapters))?.trim()
    if (!name) return
    setBusy(true)
    try {
      const chapter = await createChapter(octokit, project, normalizeChapterName(name), '')
      const next = [...chapters, chapter].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
      setChapters(next)
      storage.setDraft(project.fullName, chapter.path, { content: '', baseSha: chapter.sha, dirty: false, updatedAt: Date.now() })
      selectChapter(chapter)
    } catch (e) { setError(e instanceof Error ? e.message : 'Не удалось создать главу') }
    finally { setBusy(false) }
  }

  const rename = async (chapter: Chapter) => {
    if (!octokit || !project) return
    const entered = window.prompt('Новое имя файла главы', chapter.name)?.trim()
    if (!entered) return
    const newName = normalizeChapterName(entered)
    if (newName === chapter.name) return
    setBusy(true); setError('')
    try {
      const renamed = await renameChapter(octokit, project, { ...chapter, content: chapter.path === activePath ? content : chapter.content }, newName)
      storage.moveDraft(project.fullName, chapter.path, renamed.path, { content: renamed.content, baseSha: renamed.sha, dirty: false, updatedAt: Date.now() })
      const next = chapters.map((item) => item.path === chapter.path ? renamed : item).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
      setChapters(next)
      if (activePath === chapter.path) setActivePath(renamed.path)
    } catch (e) { setError(e instanceof Error ? e.message : 'Не удалось переименовать главу') }
    finally { setBusy(false) }
  }

  const remove = async (chapter: Chapter) => {
    if (!octokit || !project) return
    if (!window.confirm(`Удалить главу «${chapter.title || chapter.name}»?`)) return
    if (!window.confirm(`Точно удалить ${chapter.name}? Это удалит файл из GitHub.`)) return
    setBusy(true); setError('')
    try {
      await deleteChapter(octokit, project, chapter)
      storage.removeDraft(project.fullName, chapter.path)
      const next = chapters.filter((item) => item.path !== chapter.path)
      setChapters(next)
      if (activePath === chapter.path) {
        const replacement = next[0] || null
        setActivePath(replacement?.path || '')
        setContent(replacement?.content || '')
        setSync('idle'); setCountdown(null)
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'Не удалось удалить главу') }
    finally { setBusy(false) }
  }

  const logout = () => { storage.clearToken(); setToken(''); setTokenDraft(''); setProject(null); setProjects([]) }
  const handleTouchStart = (event: React.TouchEvent) => { const touch = event.touches[0]; if (drawer || touch.clientX < 28) touchStart.current = { x: touch.clientX, y: touch.clientY } }
  const handleTouchEnd = (event: React.TouchEvent) => {
    if (!touchStart.current) return
    const touch = event.changedTouches[0]; const dx = touch.clientX - touchStart.current.x; const dy = Math.abs(touch.clientY - touchStart.current.y)
    if (dy < 80 && dx > 70) setDrawer(true)
    if (dy < 80 && dx < -70) setDrawer(false)
    touchStart.current = null
  }

  if (!token) return <main className="auth-page"><button className="icon-button theme-floating" onClick={toggleTheme} title={themeTitle}>{themeIcon}</button><section className="auth-card"><div className="brand-mark"><BookOpen /></div><h1>happy-writer</h1><p>Редактор книг, которые живут в GitHub и собираются через book-framework.</p><label>GitHub token</label><input type="password" value={tokenDraft} onChange={(e) => setTokenDraft(e.target.value)} placeholder="github_pat_…" /><button className="primary" onClick={() => { storage.setToken(tokenDraft.trim()); setToken(tokenDraft.trim()) }} disabled={!tokenDraft.trim()}>Открыть библиотеку</button><small>Токен хранится только в localStorage этого браузера. Для private-репозиториев ему нужен доступ Contents: read/write.</small></section></main>

  if (!project) return <main className="projects-page"><header className="projects-header"><div><h1>happy-writer</h1><span>Книги</span></div><div className="header-actions"><button className="icon-button" onClick={toggleTheme} title={themeTitle}>{themeIcon}</button><button className="icon-button" onClick={logout} title="Выйти"><LogOut size={18} /></button></div></header><section className="project-actions"><div className="repo-input"><Search size={18} /><input value={manualRepo} onChange={(e) => setManualRepo(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void openManualProject()} placeholder="owner/repository" /><button onClick={() => void openManualProject()}>Открыть</button></div><button className="secondary" onClick={() => void refreshProjects()} disabled={busy}><RefreshCw size={17} className={busy ? 'spin' : ''} /> Найти book-framework репозитории</button></section>{error && <div className="error-box">{error}</div>}<div className="project-grid">{projects.map((item) => <button className="project-card" key={item.fullName} onClick={() => void openProject(item)}><BookOpen /><strong>{item.title}</strong><span>{item.fullName}</span></button>)}{!projects.length && !busy && <div className="empty">Проекты не найдены. Можно открыть репозиторий вручную или запустить поиск.</div>}</div></main>

  return <div className="writer" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>{drawer && <button className="drawer-scrim" onClick={() => setDrawer(false)} aria-label="Закрыть меню" />}<aside className={`sidebar ${drawer ? 'open' : ''}`}><div className="sidebar-head"><div className="sidebar-actions"><button className="back-button" onClick={() => { setProject(null); setDrawer(false) }}><ChevronLeft size={18} /> К книгам</button><button className="sidebar-theme" onClick={toggleTheme} title={themeTitle}>{themeIcon}</button></div><h2>{project.title}</h2><span>{project.fullName}</span></div><div className="chapter-list">{chapters.map((chapter) => <div className={`chapter-row ${chapter.path === activePath ? 'active' : ''}`} key={chapter.path}><button className="chapter-select" onClick={() => selectChapter(chapter)}><span>{chapter.title || chapter.name}</span><small>{chapter.name}</small></button><div className="chapter-actions"><button onClick={() => void rename(chapter)} title="Переименовать"><Pencil size={15} /></button><button onClick={() => void remove(chapter)} title="Удалить"><Trash2 size={15} /></button></div></div>)}</div><button className="add-chapter" onClick={() => void addChapter()}><Plus size={18} /> Новая глава</button></aside><section className="workspace"><header className="mobile-header"><button className="icon-button" onClick={() => setDrawer(true)}><Menu /></button><div><strong>{activeChapter?.title || project.title}</strong><span>{project.title}</span></div><button className="icon-button mobile-add" onClick={() => void addChapter()} title="Новая глава"><Plus size={18} /></button><button className="icon-button mobile-theme" onClick={toggleTheme} title={themeTitle}>{themeIcon}</button></header>{error && <div className="error-box editor-error">{error}</div>}{activeChapter ? <BookEditor value={content} onChange={edit} unsynced={sync === 'local' || sync === 'syncing'} syncing={sync === 'syncing'} countdown={sync === 'local' ? countdown : null} onPull={() => void pullCurrentChapter()} onSync={() => void syncCurrentChapter(true)} /> : <div className="empty editor-empty">В книге пока нет глав. Создай первую через меню.</div>}<div className={`sync-state ${sync}`}>{sync === 'local' && `Сохранено локально · автоотправка через ${countdown ?? 60} сек.`}{sync === 'syncing' && 'Синхронизация с GitHub…'}{sync === 'synced' && 'GitHub синхронизирован'}{sync === 'error' && 'Не удалось синхронизировать · локальная копия сохранена'}</div></section></div>
}
