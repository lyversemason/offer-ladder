import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// Served from https://lyversemason.github.io/offer-ladder/ on GitHub Pages.
export default defineConfig({
  base: './',
  plugins: [react()],
  // tests/db needs the local database running (npm run test:db); the rest run anywhere.
  test: { include: ['tests/**/*.test.ts'], exclude: ['tests/db/**', 'node_modules/**'] },
})
