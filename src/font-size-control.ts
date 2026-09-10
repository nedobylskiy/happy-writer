const STORAGE_KEY = 'happy-writer:editor-font-size'
const MIN = 17
const MAX = 22
const DEFAULT = 19

function clamp(value: number) {
  return Math.min(MAX, Math.max(MIN, value))
}

function readSize() {
  const stored = Number(localStorage.getItem(STORAGE_KEY))
  return Number.isFinite(stored) && stored >= MIN && stored <= MAX ? stored : DEFAULT
}

function applySize(size: number) {
  const value = clamp(size)
  document.documentElement.style.setProperty('--editor-font-size', `${value}px`)
  localStorage.setItem(STORAGE_KEY, String(value))
}

function createControl() {
  const wrapper = document.createElement('div')
  wrapper.className = 'editor-font-size-control'
  wrapper.dataset.fontSizeControl = 'true'

  const label = document.createElement('label')
  label.className = 'editor-font-size-label'
  label.textContent = 'Размер текста'

  const value = document.createElement('span')
  value.className = 'editor-font-size-value'

  const range = document.createElement('input')
  range.type = 'range'
  range.min = String(MIN)
  range.max = String(MAX)
  range.step = '1'
  range.setAttribute('aria-label', 'Размер текста редактора')

  const current = readSize()
  range.value = String(current)
  value.textContent = `${current}px`

  range.addEventListener('input', () => {
    const next = clamp(Number(range.value))
    value.textContent = `${next}px`
    applySize(next)
  })

  const head = document.createElement('div')
  head.className = 'editor-font-size-head'
  head.append(label, value)
  wrapper.append(head, range)
  return wrapper
}

function ensureControl() {
  const sidebar = document.querySelector('.sidebar')
  if (!sidebar || sidebar.querySelector('[data-font-size-control]')) return

  const addChapter = sidebar.querySelector('.add-chapter')
  const control = createControl()
  if (addChapter) sidebar.insertBefore(control, addChapter)
  else sidebar.appendChild(control)
}

export function initEditorFontSizeControl() {
  applySize(readSize())
  ensureControl()

  const observer = new MutationObserver(() => ensureControl())
  observer.observe(document.body, { childList: true, subtree: true })
}
