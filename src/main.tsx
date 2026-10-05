import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { ErrorBoundary } from './components/ErrorScreen'
import { requestPersistentStorage } from './lib/db'
import './lib/install'
import { takeSharedTextFromUrl } from './lib/share'
import './styles.css'

requestPersistentStorage()
takeSharedTextFromUrl()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
