import {readFile,writeFile} from 'node:fs/promises';
const root=new URL('../',import.meta.url);
const [backend,page]=await Promise.all([readFile(new URL('work-backend.js',root),'utf8'),readFile(new URL('work-ui.html',root),'utf8')]);
await writeFile(new URL('worker/index.js',root),backend+'\nconst PAGE='+JSON.stringify(page)+';\n');
