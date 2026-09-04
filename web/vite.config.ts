import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwind from '@tailwindcss/vite'

// O site mora na raiz do domínio, servido pelo próprio servidor de contas
// (servidor/api.mjs). Mesma origem para o site e a API é o que faz o cookie
// de sessão funcionar sem exceção nenhuma — e o que dispensa CORS.
export default defineConfig(() => ({
  base: '/',
  plugins: [react(), tailwind()],
  build: { outDir: 'dist', assetsDir: 'ativos' },
}))
