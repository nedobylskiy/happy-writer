import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'
import './font-overrides.css'
import './enhancements.css'

function updateVisualViewportVars() {
  const viewport = window.visualViewport
  const root = document.documentElement

  if (!viewport) {
    root.style.setProperty('--visual-viewport-top', '0px')
    root.style.setProperty('--visual-viewport-height', `${window.innerHeight}px`)
    root.style.setProperty('--keyboard-offset', '0px')
    return
  }

  const top = viewport.offsetTop
  const height = viewport.height
  const keyboardOffset = Math.max(0, window.innerHeight - height - top)

  root.style.setProperty('--visual-viewport-top', `${top}px`)
  root.style.setProperty('--visual-viewport-height', `${height}px`)
  root.style.setProperty('--keyboard-offset', `${keyboardOffset}px`)
}

updateVisualViewportVars()
window.addEventListener('resize', updateVisualViewportVars)
window.visualViewport?.addEventListener('resize', updateVisualViewportVars)
window.visualViewport?.addEventListener('scroll', updateVisualViewportVars)

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`)
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
