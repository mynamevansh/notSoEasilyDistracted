import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { resolve } from 'node:path'

const projectRoot = import.meta.dirname

export default defineConfig({
  plugins: [react()],
  base: './',
  root: resolve(projectRoot, 'src'),
  publicDir: resolve(projectRoot, 'public'),
  build: {
    outDir: resolve(projectRoot, 'dist'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: 'popup/index.html',
        dashboard: 'dashboard/index.html',
        blocked: 'blocked/index.html',
        background: 'background/index.ts',
      },
      output: {
        entryFileNames: (chunk) =>
          chunk.name === 'background' ? 'background.js' : 'assets/[name].js',
      },
    },
  },
})
