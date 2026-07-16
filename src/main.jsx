import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { initMonitoring } from './lib/monitoring'
import { registerSW } from 'virtual:pwa-register'

initMonitoring()

// App-shell service worker: reload-resilience on dead networks. New versions
// apply immediately EXCEPT inside a live exam — a deploy must never yank a
// student mid-attempt; their client updates on the next natural navigation.
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    if (!window.location.pathname.startsWith('/exam')) updateSW(true)
  },
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
