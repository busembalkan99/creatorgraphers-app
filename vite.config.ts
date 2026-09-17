import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Yayın adresi: https://creatorgraphers.com (GitHub Pages, public/CNAME). Kökte çalışır.
export default defineConfig({
  plugins: [react()],
})
