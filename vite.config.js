import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

// Build a single self-contained index.html so the extension can be hosted
// anywhere (or even opened directly) and still work as an Owlbear popover.
export default defineConfig({
  base: './',
  plugins: [viteSingleFile()],
  build: {
    outDir: 'dist',
    assetsInlineLimit: 100000000,
    chunkSizeWarningLimit: 100000000,
    cssCodeSplit: false,
  },
})
