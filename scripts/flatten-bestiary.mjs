// Vite keeps the input HTML's folder ("bestiary/index.html") under outDir.
// The extension manifest expects docs/bestiary/index.html, so flatten it.
import fs from 'node:fs';
import path from 'node:path';

const dir = path.resolve('docs/bestiary');
const nestedDir = path.join(dir, 'bestiary');
const nested = path.join(nestedDir, 'index.html');
if (fs.existsSync(nested)) {
  fs.copyFileSync(nested, path.join(dir, 'index.html'));
  fs.rmSync(nestedDir, { recursive: true, force: true });
  console.log('bestiary: flattened to docs/bestiary/index.html');
} else {
  console.log('bestiary: nothing to flatten');
}
