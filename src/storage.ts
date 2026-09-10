export type Draft = {
  content: string
  baseSha: string
  dirty: boolean
  updatedAt: number
}

const tokenKey = 'happy-writer:github-token'
const projectKey = 'happy-writer:projects'

export const storage = {
  getToken: () => localStorage.getItem(tokenKey) || '',
  setToken: (token: string) => localStorage.setItem(tokenKey, token),
  clearToken: () => localStorage.removeItem(tokenKey),
  getProjects: (): string[] => JSON.parse(localStorage.getItem(projectKey) || '[]'),
  setProjects: (projects: string[]) => localStorage.setItem(projectKey, JSON.stringify(projects)),
  getDraft(project: string, path: string): Draft | null {
    const raw = localStorage.getItem(`happy-writer:draft:${project}:${path}`)
    return raw ? JSON.parse(raw) as Draft : null
  },
  setDraft(project: string, path: string, draft: Draft) {
    localStorage.setItem(`happy-writer:draft:${project}:${path}`, JSON.stringify(draft))
  },
}
