import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
// PWA uchun quyidagi qatorni qo'shamiz:
//import { registerSW } from 'virtual:vite-plugin-pwa/register'

// Ilovani avtomatik yangilaydigan qilib ro'yxatdan o'tkazish
//registerSW({ immediate: true })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)