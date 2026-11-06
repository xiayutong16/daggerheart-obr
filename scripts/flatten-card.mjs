// Vite keeps the input HTML's folder ("card/index.html") under outDir.
// The extension manifest expects docs/card/index.html, so flatten it.
import fs from 'node:fs';
import path from 'node:path';

const dir = path.resolve('docs/card');
const nestedDir = path.join(dir, 'card');
const nested = path.join(nestedDir, 'index.html');
if (fs.existsSync(nested)) {
  fs.copyFileSync(nested, path.join(dir, 'index.html'));
  fs.rmSync(nestedDir, { recursive: true, force: true });
  console.log('card: flattened to docs/card/index.html');
} else {
  console.log('card: nothing to flatten');
}
