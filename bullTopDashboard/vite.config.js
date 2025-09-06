import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3001,
    open: true
  },
  // 确保静态资源正确服务
  publicDir: 'public',
  build: {
    // 确保构建时正确处理静态资源
    assetsDir: 'assets'
  }
})
