import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import app from '../api/index.mjs';
const origin = 'https://open-page.vercel.app';
const rewrite = path => origin + '/api/index?__page_path=' + encodeURIComponent(path.replace(/^\//, ''));
const home = await app.fetch(new Request(rewrite('/')));
assert.equal(home.status, 200);
assert.match(home.headers.get('content-security-policy'), /frame-ancestors 'none'/);
assert.match(await home.text(), /Open Page/);
const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
assert.equal(config.headers.find(entry => entry.source === '/').headers.find(header => header.key === 'Content-Security-Policy').value, home.headers.get('content-security-policy'));
await import('./build-vercel.mjs');
assert.match(await readFile(new URL('../public/index.html', import.meta.url), 'utf8'), /Open Page/);
assert.equal(JSON.parse(await readFile(new URL('../public/manifest.webmanifest', import.meta.url), 'utf8')).display, 'standalone');
for (const path of ['/api/health', '/manifest.webmanifest', '/sw.js', '/icons/icon-192-v3.png']) {
  const response = await app.fetch(new Request(rewrite(path)));
  assert.equal(response.status, 200, path);
}
const response = await app.fetch(new Request(rewrite('/api/capture'), {
  method: 'POST', headers: {'Content-Type': 'application/json', Origin: origin},
  body: JSON.stringify({url: 'http://127.0.0.1/'})
}));
assert.equal(response.status, 422);
assert.match((await response.json()).error, /public/);
const crossOrigin = await app.fetch(new Request(rewrite('/api/capture'), {
  method: 'POST', headers: {'Content-Type': 'application/json', Origin: 'https://other.test'}, body: '{}'
}));
assert.equal(crossOrigin.status, 403);
assert.equal((await app.fetch(new Request(rewrite('/missing')))).status, 404);
console.log('Vercel routing checks passed: app, PWA assets, API body forwarding, origin validation, and missing routes.');
