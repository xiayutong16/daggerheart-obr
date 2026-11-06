// Vite keeps the input HTML's folder ("char/index.html") under outDir.
// The right-rail tool opens /char/index.html, so flatten it.
import fs from 'node:fs';
import path from 'node:path';

const dir = path.resolve('docs/char');
const nestedDir = path.join(dir, 'char');
const nested = path.join(nestedDir, 'index.html');
if (fs.existsSync(nested)) {
  fs.copyFileSync(nested, path.join(dir, 'index.html'));
  fs.rmSync(nestedDir, { recursive: true, force: true });
  console.log('char: flattened to docs/char/index.html');
} else {
  console.log('char: nothing to flatten');
}
