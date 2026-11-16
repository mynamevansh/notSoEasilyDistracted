import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import Blocked from './Blocked.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Blocked />
  </StrictMode>,
)
