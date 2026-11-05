import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'
import { resolve } from 'node:path'

// Second, independent Owlbear extension: the GM's adversary compendium.
// Built to docs/bestiary/ so GitHub Pages serves it at /daggerheart-obr/bestiary/.
export default defineConfig({
  publicDir: 'bestiary-public',
  base: './',
  plugins: [viteSingleFile()],
  build: {
    outDir: 'docs/bestiary',
    emptyOutDir: true,
    assetsInlineLimit: 100000000,
    chunkSizeWarningLimit: 100000000,
    cssCodeSplit: false,
    rollupOptions: {
      input: resolve(process.cwd(), 'bestiary/index.html'),
    },
  },
})
