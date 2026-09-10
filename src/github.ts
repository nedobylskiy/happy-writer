import { Octokit } from '@octokit/rest'

export type Project = {
  owner: string
  repo: string
  fullName: string
  title: string
  defaultBranch: string
}

export type Chapter = {
  path: string
  name: string
  title: string
  sha: string
  content: string
}

export function createGithub(token: string) {
  return new Octokit({ auth: token })
}

function decodeBase64Utf8(value: string) {
  const bytes = Uint8Array.from(atob(value.replace(/\n/g, '')), (c) => c.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

export function encodeBase64Utf8(value: string) {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let cursor = 0
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = cursor++
      if (index >= items.length) break
      out[index] = await fn(items[index])
    }
  }))
  return out
}

function chapterTitle(name: string) {
  return name.replace(/\.(md|txt)$/i, '').replace(/^\d+[. _-]*/, '')
}

export async function discoverProjects(octokit: Octokit): Promise<Project[]> {
  const { data: repos } = await octokit.repos.listForAuthenticatedUser({
    per_page: 100,
    sort: 'updated',
    affiliation: 'owner,collaborator,organization_member',
  })

  const found = await mapLimit(repos, 6, async (repo) => {
    try {
      const { data } = await octokit.repos.getContent({ owner: repo.owner.login, repo: repo.name, path: 'book.config.json' })
      if (Array.isArray(data) || data.type !== 'file' || !('content' in data)) return null
      const config = JSON.parse(decodeBase64Utf8(data.content)) as { title?: string }
      return { owner: repo.owner.login, repo: repo.name, fullName: repo.full_name, title: config.title || repo.name, defaultBranch: repo.default_branch } satisfies Project
    } catch { return null }
  })
  return found.filter((project): project is Project => Boolean(project))
}

export async function loadProject(octokit: Octokit, fullName: string): Promise<Project> {
  const [owner, repo] = fullName.split('/')
  if (!owner || !repo) throw new Error('Используй формат owner/repository')
  const [{ data: meta }, { data: configData }] = await Promise.all([
    octokit.repos.get({ owner, repo }),
    octokit.repos.getContent({ owner, repo, path: 'book.config.json' }),
  ])
  if (Array.isArray(configData) || configData.type !== 'file' || !('content' in configData)) throw new Error('book.config.json не найден')
  const config = JSON.parse(decodeBase64Utf8(configData.content)) as { title?: string }
  return { owner, repo, fullName, title: config.title || repo, defaultBranch: meta.default_branch }
}

export async function loadChapter(octokit: Octokit, project: Project, path: string): Promise<Chapter> {
  const { data: file } = await octokit.repos.getContent({ owner: project.owner, repo: project.repo, path })
  if (Array.isArray(file) || file.type !== 'file' || !('content' in file)) throw new Error(`Не удалось прочитать ${path}`)
  const name = path.split('/').pop() || path
  return { path, name, title: chapterTitle(name), sha: file.sha, content: decodeBase64Utf8(file.content) }
}

export async function loadChapters(octokit: Octokit, project: Project): Promise<Chapter[]> {
  const { data } = await octokit.repos.getContent({ owner: project.owner, repo: project.repo, path: 'manuscript/chapters' })
  if (!Array.isArray(data)) throw new Error('manuscript/chapters должен быть папкой')
  const files = data.filter((item) => item.type === 'file' && /\.(md|txt)$/i.test(item.name)).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }))
  return mapLimit(files, 6, async (item) => loadChapter(octokit, project, item.path))
}

export async function saveChapter(octokit: Octokit, project: Project, chapter: Chapter, content: string) {
  const response = await octokit.repos.createOrUpdateFileContents({ owner: project.owner, repo: project.repo, path: chapter.path, message: `write: update ${chapter.name}`, content: encodeBase64Utf8(content), sha: chapter.sha || undefined })
  return response.data.content?.sha || chapter.sha
}

export async function createChapter(octokit: Octokit, project: Project, name: string, content = ''): Promise<Chapter> {
  const path = `manuscript/chapters/${name}`
  const response = await octokit.repos.createOrUpdateFileContents({ owner: project.owner, repo: project.repo, path, message: `write: add ${name}`, content: encodeBase64Utf8(content) })
  return { path, name, title: chapterTitle(name), sha: response.data.content?.sha || '', content }
}

export async function renameChapter(octokit: Octokit, project: Project, chapter: Chapter, newName: string): Promise<Chapter> {
  const path = `manuscript/chapters/${newName}`
  if (path === chapter.path) return chapter
  const created = await octokit.repos.createOrUpdateFileContents({ owner: project.owner, repo: project.repo, path, message: `write: rename ${chapter.name} to ${newName}`, content: encodeBase64Utf8(chapter.content) })
  await octokit.repos.deleteFile({ owner: project.owner, repo: project.repo, path: chapter.path, message: `write: remove old chapter path ${chapter.name}`, sha: chapter.sha })
  return { ...chapter, path, name: newName, title: chapterTitle(newName), sha: created.data.content?.sha || '' }
}

export async function deleteChapter(octokit: Octokit, project: Project, chapter: Chapter) {
  await octokit.repos.deleteFile({ owner: project.owner, repo: project.repo, path: chapter.path, message: `write: delete ${chapter.name}`, sha: chapter.sha })
}
