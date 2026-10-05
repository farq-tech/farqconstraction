import React from 'react'
import ReactDOM from 'react-dom/client'
import MobileApp from './MobileApp'
import { ErrorBoundary } from '../components/ErrorBoundary'
import '../index.css'
import './mobile.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <MobileApp />
    </ErrorBoundary>
  </React.StrictMode>,
)
