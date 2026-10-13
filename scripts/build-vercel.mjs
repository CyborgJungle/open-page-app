import './assemble.mjs';
import {mkdir, writeFile} from 'node:fs/promises';
const {default: app} = await import('../worker/index.js');
const output = new URL('../public/', import.meta.url);
await mkdir(new URL('icons/', output), {recursive: true});
for (const path of ['/', '/manifest.webmanifest', '/sw.js', '/icons/icon-192-v3.png', '/icons/icon-512-v3.png', '/icons/apple-touch-icon-v3.png', '/icons/favicon-v3.png']) {
  const response = await app.fetch(new Request('https://open-page.test' + path));
  if (!response.ok) throw new Error('Could not build ' + path);
  await writeFile(new URL(path === '/' ? 'index.html' : path.slice(1), output), Buffer.from(await response.arrayBuffer()));
}
console.log('Prepared the Vercel website and capture function.');
