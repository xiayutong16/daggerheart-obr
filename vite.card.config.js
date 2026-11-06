import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'
import { resolve } from 'node:path'

// Third, independent Owlbear extension: the character-card workshop.
// Also usable as a plain standalone web page at /card/index.html.
export default defineConfig({
  publicDir: 'card-public',
  base: './',
  plugins: [viteSingleFile()],
  build: {
    outDir: 'docs/card',
    emptyOutDir: true,
    assetsInlineLimit: 100000000,
    chunkSizeWarningLimit: 100000000,
    cssCodeSplit: false,
    rollupOptions: {
      input: resolve(process.cwd(), 'card/index.html'),
    },
  },
})
