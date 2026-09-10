export type Draft = {
  content: string
  baseSha: string
  dirty: boolean
  updatedAt: number
}

export type Theme = 'light' | 'dark'

const tokenKey = 'happy-writer:github-token'
const projectKey = 'happy-writer:projects'
const themeKey = 'happy-writer:theme'
const autoSyncKey = 'happy-writer:auto-sync'
const draftKey = (project: string, path: string) => `happy-writer:draft:${project}:${path}`
const lastChapterKey = (project: string) => `happy-writer:last-chapter:${project}`
const positionKey = (project: string, path: string) => `happy-writer:position:${project}:${path}`

export const storage = {
  getToken: () => localStorage.getItem(tokenKey) || '',
  setToken: (token: string) => localStorage.setItem(tokenKey, token),
  clearToken: () => localStorage.removeItem(tokenKey),
  getProjects: (): string[] => JSON.parse(localStorage.getItem(projectKey) || '[]'),
  setProjects: (projects: string[]) => localStorage.setItem(projectKey, JSON.stringify(projects)),
  getTheme: (): Theme => localStorage.getItem(themeKey) === 'dark' ? 'dark' : 'light',
  setTheme: (theme: Theme) => localStorage.setItem(themeKey, theme),
  getAutoSync() {
    return localStorage.getItem(autoSyncKey) !== 'false'
  },
  setAutoSync(enabled: boolean) {
    localStorage.setItem(autoSyncKey, String(enabled))
  },
  getLastChapter(project: string) {
    return localStorage.getItem(lastChapterKey(project)) || ''
  },
  setLastChapter(project: string, path: string) {
    if (path) localStorage.setItem(lastChapterKey(project), path)
    else localStorage.removeItem(lastChapterKey(project))
  },
  getPosition(project: string, path: string) {
    const value = Number(localStorage.getItem(positionKey(project, path)) || '0')
    return Number.isFinite(value) && value > 0 ? value : 0
  },
  setPosition(project: string, path: string, position: number) {
    localStorage.setItem(positionKey(project, path), String(Math.max(0, Math.round(position))))
  },
  removePosition(project: string, path: string) {
    localStorage.removeItem(positionKey(project, path))
  },
  movePosition(project: string, oldPath: string, newPath: string) {
    const value = localStorage.getItem(positionKey(project, oldPath))
    if (value !== null) localStorage.setItem(positionKey(project, newPath), value)
    localStorage.removeItem(positionKey(project, oldPath))
  },
  getDraft(project: string, path: string): Draft | null {
    const raw = localStorage.getItem(draftKey(project, path))
    return raw ? JSON.parse(raw) as Draft : null
  },
  setDraft(project: string, path: string, draft: Draft) {
    localStorage.setItem(draftKey(project, path), JSON.stringify(draft))
  },
  removeDraft(project: string, path: string) {
    localStorage.removeItem(draftKey(project, path))
  },
  moveDraft(project: string, oldPath: string, newPath: string, fallback: Draft) {
    const draft = this.getDraft(project, oldPath) || fallback
    this.setDraft(project, newPath, draft)
    this.removeDraft(project, oldPath)
  },
}
