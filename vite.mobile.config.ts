import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

// The iPhone app's own screens. Built into mobile/www and shipped inside the
// iOS app; the web app's build and deployment are untouched by this file.
// Build with: npm run build --prefix mobile  (sets VITE_API_BASE_URL)
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  base: './',
  build: {
    outDir: 'mobile/www',
    emptyOutDir: true,
    rollupOptions: { input: { mobile: path.resolve(__dirname, 'mobile.html') } },
  },
})
