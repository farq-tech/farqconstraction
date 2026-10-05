import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import './index.css'

// A new version was published while this page was open: the chunk this page
// asks for no longer exists. Reload once to pick up the new version instead
// of failing (for example the booklet reader on upload). Guarded so a real
// outage never loops.
window.addEventListener('vite:preloadError', (event) => {
  try {
    const last = Number(sessionStorage.getItem('farq-stale-reload') || 0)
    if (Date.now() - last < 60_000) return
    sessionStorage.setItem('farq-stale-reload', String(Date.now()))
  } catch {
    /* storage blocked: still reload once */
  }
  event.preventDefault()
  window.location.reload()
})

// Load the booklet reader in the background once the app is up, so a later
// deploy cannot strand this tab without it.
setTimeout(() => {
  void import('./lib/parseBoq').then((m) => m.warmBoqReader()).catch(() => {})
}, 2000)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)
