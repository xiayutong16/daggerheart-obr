import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'
import { resolve } from 'node:path'

// Standalone character sheet page (not an Owlbear extension of its own).
// Opened by the right-rail tool, or directly at /char/index.html.
export default defineConfig({
  publicDir: 'char-public',
  base: './',
  plugins: [viteSingleFile()],
  build: {
    outDir: 'docs/char',
    emptyOutDir: true,
    assetsInlineLimit: 100000000,
    chunkSizeWarningLimit: 100000000,
    cssCodeSplit: false,
    rollupOptions: {
      input: resolve(process.cwd(), 'char/index.html'),
    },
  },
})
