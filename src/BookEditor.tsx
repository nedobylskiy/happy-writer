import { useEffect, useRef, useState } from 'react'
import { Bold, ChevronDown, Code, Footprints, Heading2, Italic, Minus, Redo2, Undo2 } from 'lucide-react'

function escapeHtml(text: string) {
  return text.replace(/[&<>]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[char]!))
}

function inlineToHtml(text: string) {
  let html = escapeHtml(text)
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>')
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2">$1</a>')
  return html
}

function sourceToHtml(source: string) {
  const lines = source.replace(/\r\n/g, '\n').split('\n')
  const blocks: string[] = []
  let paragraph: string[] = []
  let inCode = false
  let codeLanguage = ''
  let code: string[] = []

  const flush = () => {
    if (!paragraph.length) return
    blocks.push(`<p>${inlineToHtml(paragraph.join('\n')).replace(/\n/g, '<br>')}</p>`)
    paragraph = []
  }

  for (const line of lines) {
    const fence = line.match(/^```([^`]*)$/)
    if (fence) {
      if (inCode) {
        blocks.push(`<pre data-language="${escapeHtml(codeLanguage)}"><code>${escapeHtml(code.join('\n'))}</code></pre>`)
        code = []
        codeLanguage = ''
        inCode = false
      } else {
        flush()
        inCode = true
        codeLanguage = fence[1].trim()
      }
      continue
    }
    if (inCode) { code.push(line); continue }
    if (line === '---') {
      flush()
      blocks.push('<div class="scene-break" data-scene-break="true" contenteditable="false"><span>• • •</span><small>разрыв сцены</small></div>')
      continue
    }
    const footnote = line.match(/^\[\^([^\]]+)\]:\s*(.*)$/)
    if (footnote) {
      flush()
      blocks.push(`<div class="footnote-def" data-footnote-def="${escapeHtml(footnote[1])}"><span contenteditable="false">[^${escapeHtml(footnote[1])}]:</span> ${inlineToHtml(footnote[2])}</div>`)
      continue
    }
    const heading = line.match(/^(#{2,6})\s+(.+)$/)
    if (heading) {
      flush()
      const level = heading[1].length
      blocks.push(`<h${level}>${inlineToHtml(heading[2])}</h${level}>`)
      continue
    }
    if (!line.trim()) { flush(); continue }
    paragraph.push(line)
  }
  flush()
  if (inCode) blocks.push(`<pre data-language="${escapeHtml(codeLanguage)}"><code>${escapeHtml(code.join('\n'))}</code></pre>`)
  return blocks.join('') || '<p><br></p>'
}

function inlineFromNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent || ''
  if (!(node instanceof HTMLElement)) return ''
  const inner = Array.from(node.childNodes).map(inlineFromNode).join('')
  const tag = node.tagName.toLowerCase()
  if (tag === 'strong' || tag === 'b') return `**${inner}**`
  if (tag === 'em' || tag === 'i') return `*${inner}*`
  if (tag === 'code') return `\`${inner}\``
  if (tag === 'a') return `[${inner}](${node.getAttribute('href') || ''})`
  if (tag === 'br') return '\n'
  return inner
}

function htmlToSource(root: HTMLElement) {
  const blocks: string[] = []
  for (const node of Array.from(root.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent?.trim()
      if (text) blocks.push(text)
      continue
    }
    if (!(node instanceof HTMLElement)) continue
    if (node.dataset.sceneBreak === 'true') { blocks.push('---'); continue }
    if (node.dataset.footnoteDef) {
      const id = node.dataset.footnoteDef
      const parts = Array.from(node.childNodes).slice(1).map(inlineFromNode).join('').trimStart()
      blocks.push(`[^${id}]: ${parts}`)
      continue
    }
    const tag = node.tagName.toLowerCase()
    if (tag === 'pre') {
      const language = node.dataset.language || ''
      blocks.push(`\`\`\`${language}\n${node.textContent || ''}\n\`\`\``)
      continue
    }
    const heading = tag.match(/^h([2-6])$/)
    if (heading) {
      blocks.push(`${'#'.repeat(Number(heading[1]))} ${Array.from(node.childNodes).map(inlineFromNode).join('')}`)
      continue
    }
    const text = Array.from(node.childNodes).map(inlineFromNode).join('')
    if (text.trim()) blocks.push(text)
  }
  return `${blocks.join('\n\n').trim()}\n`
}

export function BookEditor({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const lastValue = useRef('')
  const [headingMenu, setHeadingMenu] = useState(false)

  useEffect(() => {
    if (!ref.current || value === lastValue.current) return
    ref.current.innerHTML = sourceToHtml(value)
    lastValue.current = value
  }, [value])

  useEffect(() => {
    const viewport = window.visualViewport
    if (!viewport) return
    const update = () => {
      const keyboard = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)
      document.documentElement.style.setProperty('--keyboard-offset', `${keyboard}px`)
      document.documentElement.style.setProperty('--visual-viewport-top', `${viewport.offsetTop}px`)
      document.documentElement.style.setProperty('--visual-viewport-height', `${viewport.height}px`)
    }
    update()
    viewport.addEventListener('resize', update)
    viewport.addEventListener('scroll', update)
    return () => {
      viewport.removeEventListener('resize', update)
      viewport.removeEventListener('scroll', update)
      document.documentElement.style.removeProperty('--keyboard-offset')
      document.documentElement.style.removeProperty('--visual-viewport-top')
      document.documentElement.style.removeProperty('--visual-viewport-height')
    }
  }, [])

  const emit = () => {
    if (!ref.current) return
    const source = htmlToSource(ref.current)
    lastValue.current = source
    onChange(source)
  }

  const command = (name: string, value?: string) => {
    ref.current?.focus()
    document.execCommand(name, false, value)
    emit()
  }

  const setHeading = (visualLevel: 1 | 2 | 3) => {
    // book-framework starts internal headings at ##, so UI H1/H2/H3 maps to ##/###/####.
    command('formatBlock', `h${visualLevel + 1}`)
    setHeadingMenu(false)
  }

  const insertSceneBreak = () => {
    ref.current?.focus()
    document.execCommand('insertHTML', false, '<div class="scene-break" data-scene-break="true" contenteditable="false"><span>• • •</span><small>разрыв сцены</small></div><p><br></p>')
    emit()
  }

  const insertFootnote = () => {
    if (!ref.current) return
    ref.current.focus()
    const existing = Array.from(ref.current.querySelectorAll<HTMLElement>('[data-footnote-def]')).map((item) => item.dataset.footnoteDef || '')
    let suggested = 'note'
    let counter = 1
    while (existing.includes(suggested)) suggested = `note${++counter}`
    const id = window.prompt('Идентификатор сноски', suggested)?.trim()
    if (!id) return
    const text = window.prompt('Текст сноски', '')
    if (text === null) return

    document.execCommand('insertText', false, `[^${id}]`)
    const duplicate = ref.current.querySelector(`[data-footnote-def="${CSS.escape(id)}"]`)
    if (!duplicate) {
      ref.current.insertAdjacentHTML('beforeend', `<div class="footnote-def" data-footnote-def="${escapeHtml(id)}"><span contenteditable="false">[^${escapeHtml(id)}]:</span> ${inlineToHtml(text)}</div>`)
    }
    emit()
  }

  return (
    <div className="editor-shell">
      <div className="toolbar" aria-label="Форматирование">
        <button onMouseDown={(e) => e.preventDefault()} onClick={() => command('bold')} title="Жирный"><Bold size={18} /></button>
        <button onMouseDown={(e) => e.preventDefault()} onClick={() => command('italic')} title="Курсив"><Italic size={18} /></button>
        <div className="heading-picker">
          <button className="heading-trigger" onMouseDown={(e) => e.preventDefault()} onClick={() => setHeadingMenu((open) => !open)} title="Заголовок" aria-expanded={headingMenu}>
            <Heading2 size={18} /><ChevronDown size={12} />
          </button>
          {headingMenu && (
            <div className="heading-menu" role="menu">
              <button onMouseDown={(e) => e.preventDefault()} onClick={() => setHeading(1)} role="menuitem"><strong>H1</strong><span>##</span></button>
              <button onMouseDown={(e) => e.preventDefault()} onClick={() => setHeading(2)} role="menuitem"><strong>H2</strong><span>###</span></button>
              <button onMouseDown={(e) => e.preventDefault()} onClick={() => setHeading(3)} role="menuitem"><strong>H3</strong><span>####</span></button>
            </div>
          )}
        </div>
        <button onMouseDown={(e) => e.preventDefault()} onClick={() => command('formatBlock', 'pre')} title="Блок кода"><Code size={18} /></button>
        <button onMouseDown={(e) => e.preventDefault()} onClick={insertSceneBreak} title="Разрыв сцены"><Minus size={18} /></button>
        <button onMouseDown={(e) => e.preventDefault()} onClick={insertFootnote} title="Сноска"><Footprints size={18} /></button>
        <span className="toolbar-spacer" />
        <button onMouseDown={(e) => e.preventDefault()} onClick={() => command('undo')} title="Отменить"><Undo2 size={18} /></button>
        <button onMouseDown={(e) => e.preventDefault()} onClick={() => command('redo')} title="Повторить"><Redo2 size={18} /></button>
      </div>
      <div ref={ref} className="editor" contentEditable suppressContentEditableWarning spellCheck onInput={emit} />
    </div>
  )
}
