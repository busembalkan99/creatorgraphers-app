import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// GitHub Pages depo alt yolunda yayınlanıyor: busebalkan99.github.io/creatographers-app/
// Yerel geliştirme kökte çalışır; derleme ve önizleme alt yolda.
export default defineConfig(({ command, isPreview }) => ({
  plugins: [react()],
  base: command === 'build' || isPreview ? '/creatographers-app/' : '/',
}))
