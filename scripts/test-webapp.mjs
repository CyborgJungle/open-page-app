import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const source=await readFile(new URL('../worker/index.js',import.meta.url),'utf8');
const {default:worker}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const get=path=>worker.fetch(new Request('https://open.test'+path));
const manifestResponse=await get('/manifest.webmanifest');assert.equal(manifestResponse.status,200);assert.match(manifestResponse.headers.get('content-type'),/manifest/);
const manifest=await manifestResponse.json();assert.equal(manifest.name,'Open Page');assert.equal(manifest.display,'standalone');assert.equal(manifest.start_url,'/');assert.equal(manifest.scope,'/');
for(const [path,size] of [['/icons/icon-192-v3.png',192],['/icons/icon-512-v3.png',512],['/icons/apple-touch-icon-v3.png',180],['/icons/favicon-v3.png',32]]){const r=await get(path);assert.equal(r.status,200);assert.equal(r.headers.get('content-type'),'image/png');const b=Buffer.from(await r.arrayBuffer());assert.equal(b.subarray(1,4).toString(),'PNG');assert.equal(b.readUInt32BE(16),size);assert.equal(b.readUInt32BE(20),size);}
const home=await get('/');const html=await home.text();assert.match(html,/apple-mobile-web-app-capable/);assert.match(html,/apple-touch-icon-v3/);assert.match(html,/viewport-fit=cover/);assert.match(html,/font-size:16px/);assert.match(html,/safe-area-inset/);assert.match(home.headers.get('content-security-policy'),/worker-src 'self'/);
const sw=await get('/sw.js');assert.equal(sw.headers.get('service-worker-allowed'),'/');const text=await sw.text();
const listeners={};const stores=new Map([['open-page-shell-old',new Map()],['unrelated-cache',new Map()]]);let online=true;
const key=input=>new URL(typeof input==='string'?input:input.url,'https://open.test').href;
const cacheApi={async open(name){if(!stores.has(name))stores.set(name,new Map());const store=stores.get(name);return {async addAll(paths){for(const path of paths){const r=await get(path);assert.ok(r.ok);store.set(key(path),r);}},async put(request,response){store.set(key(request),response);}};},async keys(){return [...stores.keys()];},async delete(name){return stores.delete(name);},async match(request){for(const store of stores.values()){const r=store.get(key(request));if(r)return r.clone();}}};
const context=vm.createContext({URL,Response,Request,Promise,caches:cacheApi,fetch:async request=>{if(!online)throw Error('Offline');return worker.fetch(new Request(key(request)));},self:{location:{origin:'https://open.test'},addEventListener:(type,fn)=>listeners[type]=fn,skipWaiting:async()=>{},clients:{claim:async()=>{}}}});
vm.runInContext(text,context);
async function lifecycle(type){const promises=[];listeners[type]({waitUntil:p=>promises.push(p)});await Promise.all(promises);}
await lifecycle('install');await lifecycle('activate');assert.ok(stores.has('unrelated-cache'));assert.ok(!stores.has('open-page-shell-old'));
online=false;let responsePromise;listeners.fetch({request:new Request('https://open.test/'),waitUntil(){},respondWith:p=>responsePromise=p});const offline=await responsePromise;assert.equal(offline.status,200);assert.match(await offline.text(),/Open Page/);
for(const request of [new Request('https://open.test/api/capture',{method:'POST'}),new Request('https://open.test/api/health'),new Request('https://publisher.org/story')]){let intercepted=false;listeners.fetch({request,waitUntil(){},respondWith:()=>intercepted=true});assert.equal(intercepted,false);}
console.log('Web app checks passed: standalone manifest, iPhone icon sizes, safe-area metadata, accessible input sizing, service-worker scope, offline shell, cache cleanup, and uncached API/remote requests.');
