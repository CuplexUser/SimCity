import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'

export default defineConfig({
   base: '/SimCity/',  // must match the repo name exactly, case-sensitive
  plugins: [preact()],
})
