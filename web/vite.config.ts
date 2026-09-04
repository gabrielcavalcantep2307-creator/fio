import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwind from '@tailwindcss/vite'

// O site é publicado em .github.io/fio/, então tudo pende de /fio/.
// Em desenvolvimento, a raiz.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/fio/' : '/',
  plugins: [react(), tailwind()],
  build: { outDir: 'dist', assetsDir: 'ativos' },
}))
