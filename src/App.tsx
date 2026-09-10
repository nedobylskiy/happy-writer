import { useEffect, useMemo, useRef, useState } from 'react'
import { BookOpen, ChevronLeft, LogOut, Menu, Plus, RefreshCw, Search } from 'lucide-react'
import { BookEditor } from './BookEditor'
import { Chapter, createChapter, createGithub, discoverProjects, loadChapters, loadProject, Project, saveChapter } from './github'
import { storage } from './storage'

type SyncState = 'idle' | 'local' | 'syncing' | 'synced' | 'error'

function nextChapterName(chapters: Chapter[]) {
  const max = chapters.reduce((value, chapter) => {
    const match = chapter.name.match(/^(\d+)/)
    return Math.max(value, match ? Number(match[1]) : 0)
  }, 0)
  return `${max + 1}. Новая глава.md`
}

export default function App() {
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
  const [drawer, setDrawer] = useState(false)
  const [manualRepo, setManualRepo] = useState('')
  const touchStart = useRef<{ x: number; y: number } | null>(null)

  const activeChapter = chapters.find((chapter) => chapter.path === activePath) || null

  const refreshProjects = async () => {
    if (!octokit) return
    setBusy(true)
    setError('')
    try {
      const found = await discoverProjects(octokit)
      setProjects(found)
      storage.setProjects(found.map((item) => item.fullName))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось получить проекты')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (!octokit || project) return
    const cached = storage.getProjects()
    if (!cached.length) {
      void refreshProjects()
      return
    }
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
    setBusy(true)
    setError('')
    try {
      const remote = await loadChapters(octokit, selected)
      const merged = remote.map((chapter) => {
        const local = storage.getDraft(selected.fullName, chapter.path)
        if (local?.dirty) return { ...chapter, content: local.content }
        storage.setDraft(selected.fullName, chapter.path, { content: chapter.content, baseSha: chapter.sha, dirty: false, updatedAt: Date.now() })
        return chapter
      })
      setProject(selected)
      setChapters(merged)
      setActivePath(merged[0]?.path || '')
      setContent(merged[0]?.content || '')
      setSync('idle')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось открыть книгу')
    } finally {
      setBusy(false)
    }
  }

  const openManualProject = async () => {
    if (!octokit || !manualRepo.trim()) return
    setBusy(true)
    setError('')
    try {
      const loaded = await loadProject(octokit, manualRepo.trim())
      const next = [loaded, ...projects.filter((item) => item.fullName !== loaded.fullName)]
      setProjects(next)
      storage.setProjects(next.map((item) => item.fullName))
      setManualRepo('')
      await openProject(loaded)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Репозиторий не похож на book-framework проект')
      setBusy(false)
    }
  }

  const selectChapter = (chapter: Chapter) => {
    setActivePath(chapter.path)
    const local = project ? storage.getDraft(project.fullName, chapter.path) : null
    setContent(local?.content ?? chapter.content)
    setDrawer(false)
    setSync(local?.dirty ? 'local' : 'idle')
  }

  const edit = (next: string) => {
    if (!project || !activeChapter) return
    setContent(next)
    setSync('local')
    storage.setDraft(project.fullName, activeChapter.path, {
      content: next,
      baseSha: activeChapter.sha,
      dirty: true,
      updatedAt: Date.now(),
    })
    setChapters((items) => items.map((item) => item.path === activeChapter.path ? { ...item, content: next } : item))
  }

  useEffect(() => {
    if (!octokit || !project || !activeChapter || sync !== 'local') return
    const timer = window.setTimeout(async () => {
      setSync('syncing')
      try {
        const sha = await saveChapter(octokit, project, activeChapter, content)
        setChapters((items) => items.map((item) => item.path === activeChapter.path ? { ...item, sha, content } : item))
        storage.setDraft(project.fullName, activeChapter.path, { content, baseSha: sha, dirty: false, updatedAt: Date.now() })
        setSync('synced')
      } catch {
        setSync('error')
      }
    }, 1600)
    return () => window.clearTimeout(timer)
  }, [content, sync, octokit, project, activeChapter])

  const addChapter = async () => {
    if (!octokit || !project) return
    const suggestion = nextChapterName(chapters)
    const name = window.prompt('Имя файла новой главы', suggestion)?.trim()
    if (!name) return
    const normalized = /\.(md|txt)$/i.test(name) ? name : `${name}.md`
    setBusy(true)
    try {
      const chapter = await createChapter(octokit, project, normalized, '')
      const next = [...chapters, chapter].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
      setChapters(next)
      storage.setDraft(project.fullName, chapter.path, { content: '', baseSha: chapter.sha, dirty: false, updatedAt: Date.now() })
      selectChapter(chapter)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось создать главу')
    } finally {
      setBusy(false)
    }
  }

  const logout = () => {
    storage.clearToken()
    setToken('')
    setTokenDraft('')
    setProject(null)
    setProjects([])
  }

  const handleTouchStart = (event: React.TouchEvent) => {
    const touch = event.touches[0]
    if (drawer || touch.clientX < 28) touchStart.current = { x: touch.clientX, y: touch.clientY }
  }

  const handleTouchEnd = (event: React.TouchEvent) => {
    if (!touchStart.current) return
    const touch = event.changedTouches[0]
    const dx = touch.clientX - touchStart.current.x
    const dy = Math.abs(touch.clientY - touchStart.current.y)
    if (dy < 80 && dx > 70) setDrawer(true)
    if (dy < 80 && dx < -70) setDrawer(false)
    touchStart.current = null
  }

  if (!token) {
    return (
      <main className="auth-page">
        <section className="auth-card">
          <div className="brand-mark"><BookOpen /></div>
          <h1>happy-writer</h1>
          <p>Редактор книг, которые живут в GitHub и собираются через book-framework.</p>
          <label>GitHub token</label>
          <input type="password" value={tokenDraft} onChange={(e) => setTokenDraft(e.target.value)} placeholder="github_pat_…" />
          <button className="primary" onClick={() => { storage.setToken(tokenDraft.trim()); setToken(tokenDraft.trim()) }} disabled={!tokenDraft.trim()}>Открыть библиотеку</button>
          <small>Токен хранится только в localStorage этого браузера. Для private-репозиториев ему нужен доступ Contents: read/write.</small>
        </section>
      </main>
    )
  }

  if (!project) {
    return (
      <main className="projects-page">
        <header className="projects-header"><div><h1>happy-writer</h1><span>Книги</span></div><button className="icon-button" onClick={logout} title="Выйти"><LogOut size={18} /></button></header>
        <section className="project-actions">
          <div className="repo-input"><Search size={18} /><input value={manualRepo} onChange={(e) => setManualRepo(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void openManualProject()} placeholder="owner/repository" /><button onClick={() => void openManualProject()}>Открыть</button></div>
          <button className="secondary" onClick={() => void refreshProjects()} disabled={busy}><RefreshCw size={17} className={busy ? 'spin' : ''} /> Найти book-framework репозитории</button>
        </section>
        {error && <div className="error-box">{error}</div>}
        <div className="project-grid">
          {projects.map((item) => <button className="project-card" key={item.fullName} onClick={() => void openProject(item)}><BookOpen /><strong>{item.title}</strong><span>{item.fullName}</span></button>)}
          {!projects.length && !busy && <div className="empty">Проекты не найдены. Можно открыть репозиторий вручную или запустить поиск.</div>}
        </div>
      </main>
    )
  }

  return (
    <div className="writer" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
      {drawer && <button className="drawer-scrim" onClick={() => setDrawer(false)} aria-label="Закрыть меню" />}
      <aside className={`sidebar ${drawer ? 'open' : ''}`}>
        <div className="sidebar-head">
          <button className="back-button" onClick={() => { setProject(null); setDrawer(false) }}><ChevronLeft size={18} /> К книгам</button>
          <h2>{project.title}</h2>
          <span>{project.fullName}</span>
        </div>
        <div className="chapter-list">
          {chapters.map((chapter) => <button className={chapter.path === activePath ? 'active' : ''} key={chapter.path} onClick={() => selectChapter(chapter)}><span>{chapter.title || chapter.name}</span><small>{chapter.name}</small></button>)}
        </div>
        <button className="add-chapter" onClick={() => void addChapter()}><Plus size={18} /> Новая глава</button>
      </aside>

      <section className="workspace">
        <header className="mobile-header">
          <button className="icon-button" onClick={() => setDrawer(true)}><Menu /></button>
          <div><strong>{activeChapter?.title || project.title}</strong><span>{project.title}</span></div>
        </header>
        {error && <div className="error-box editor-error">{error}</div>}
        {activeChapter ? <BookEditor value={content} onChange={edit} /> : <div className="empty editor-empty">В книге пока нет глав. Создай первую через меню.</div>}
        <div className={`sync-state ${sync}`}>
          {sync === 'local' && 'Сохранено локально · отправка…'}
          {sync === 'syncing' && 'Отправляю в GitHub…'}
          {sync === 'synced' && 'GitHub синхронизирован'}
          {sync === 'error' && 'Не удалось синхронизировать · локальная копия сохранена'}
        </div>
      </section>
    </div>
  )
}
