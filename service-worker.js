const SHELL_CACHE='open-page-shell-v14';
const SHELL=['/','/manifest.webmanifest','/icons/icon-192-v3.png','/icons/icon-512-v3.png','/icons/apple-touch-icon-v3.png','/icons/favicon-v3.png'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(SHELL_CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('open-page-shell-')&&key!==SHELL_CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{const url=new URL(event.request.url);if(event.request.method!=='GET'||url.origin!==self.location.origin||!SHELL.includes(url.pathname))return;
event.respondWith(fetch(event.request).then(response=>{if(response.ok){const copy=response.clone();event.waitUntil(caches.open(SHELL_CACHE).then(cache=>cache.put(event.request,copy)));}return response;}).catch(()=>caches.match(event.request).then(cached=>cached||new Response('Connect to the internet to open this app.',{status:503,headers:{'Content-Type':'text/plain'}}))));});
