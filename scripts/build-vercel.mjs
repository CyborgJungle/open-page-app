import './assemble.mjs';
import {mkdir} from 'node:fs/promises';
// All routes use the shared handler so security and PWA headers stay identical.
await mkdir(new URL('../public/', import.meta.url), {recursive: true});
console.log('Prepared the Vercel function.');
