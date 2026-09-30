import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { surumIzle } from './lib/surum'
import { kaydet } from './lib/bildirim'

surumIzle()
// Bildirimler (karar 120): service worker yalnız push'u gösteriyor, önbellek tutmuyor
kaydet()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
