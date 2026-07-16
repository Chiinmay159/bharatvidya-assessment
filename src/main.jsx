import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { initMonitoring } from './lib/monitoring'
import { registerSW } from 'virtual:pwa-register'

initMonitoring()

// App-shell service worker: reload-resilience on dead networks. Prompt mode
// with no prompt — a new version applies on the next natural page load, so a
// deploy can never force-reload a student mid-exam.
registerSW({ immediate: true })

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
