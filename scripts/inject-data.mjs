// Inlines data/dashboard.json into the built single-file app so dist/index.html works offline.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const PLACEHOLDER = '/*__DATA__*/null';
const template = readFileSync('build/index.html', 'utf8');
const payload = readFileSync('data/dashboard.json', 'utf8').trim();

const at = template.indexOf(PLACEHOLDER);
if (at < 0 || template.indexOf(PLACEHOLDER, at + 1) >= 0) {
  throw new Error('Expected exactly one data placeholder in build/index.html');
}
// The payload already escapes "</" so it cannot close the <script> tag early.
mkdirSync('dist', { recursive: true });
writeFileSync('dist/index.html', template.slice(0, at) + payload + template.slice(at + PLACEHOLDER.length));
console.log('Wrote dist/index.html (' + (Buffer.byteLength(readFileSync('dist/index.html')) / 1e6).toFixed(1) + ' MB)');
