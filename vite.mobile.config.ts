import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'
import { readFileSync } from 'node:fs'
const iosProject = readFileSync(path.resolve(__dirname, 'mobile/ios/App/App.xcodeproj/project.pbxproj'), 'utf8')
const version = /MARKETING_VERSION = ([^;]+);/.exec(iosProject)?.[1] || 'غير معروف'
const build = /CURRENT_PROJECT_VERSION = ([^;]+);/.exec(iosProject)?.[1] || 'غير معروف'

// The iPhone app's own screens. Built into mobile/www and shipped inside the
// iOS app; the web app's build and deployment are untouched by this file.
// Build with: npm run build --prefix mobile  (sets VITE_API_BASE_URL)
export default defineConfig({
  define: { 'import.meta.env.VITE_APP_VERSION': JSON.stringify(version), 'import.meta.env.VITE_APP_BUILD': JSON.stringify(build) },
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  base: './',
  build: {
    outDir: 'mobile/www',
    emptyOutDir: true,
    rollupOptions: { input: { mobile: path.resolve(__dirname, 'mobile.html') } },
  },
})
