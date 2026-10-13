import {readFile,writeFile} from 'node:fs/promises';
const root=new URL('../',import.meta.url);
const [backend,page,manifest,serviceWorker]=await Promise.all(['work-backend.js','work-ui.html','app.webmanifest','service-worker.js'].map(path=>readFile(new URL(path,root),'utf8')));
const icons={};for(const file of ['icon-192.png','icon-512.png','apple-touch-icon.png','favicon.png'])icons['/icons/'+file.replace('.png','-v3.png')]=(await readFile(new URL('assets/'+file,root))).toString('base64');
await writeFile(new URL('worker/index.js',root),backend+'\nconst PAGE='+JSON.stringify(page)+';\nconst APP_MANIFEST='+JSON.stringify(manifest)+';\nconst SERVICE_WORKER='+JSON.stringify(serviceWorker)+';\nconst ICONS='+JSON.stringify(icons)+';\n');
