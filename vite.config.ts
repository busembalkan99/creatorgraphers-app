import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// GitHub Pages depo alt yolunda yayınlanıyor: busebalkan99.github.io/creatographers-app/
export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === 'build' ? '/creatographers-app/' : '/',
}))
