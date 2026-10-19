import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const source=await readFile(new URL('../worker/index.js',import.meta.url),'utf8');
const {default:worker,normalizeUrl,publicIp,robotsAllowed}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
for(const url of ['http://localhost','http://127.0.0.1','http://[::1]','http://0x7f000001','http://user:pass@publisher.org','https://publisher.org:3000','https://publisher.org.'])assert.throws(()=>normalizeUrl(url));
assert.equal(normalizeUrl('example.com/#section').href,'https://example.com/');
for(const ip of ['127.0.0.1','10.1.1.1','169.254.169.254','192.168.1.1','172.16.0.1','100.64.0.1','0.0.0.0','::1','fd00::1','2001:db8::1','2002:7f00::'])assert.equal(publicIp(ip),false,ip);
assert.equal(publicIp('93.184.216.34'),true);assert.equal(publicIp('2606:4700::1111'),true);
assert.equal(robotsAllowed('User-agent: *\nDisallow: /private\nAllow: /private/open','/private/x'),false);
assert.equal(robotsAllowed('User-agent: *\nDisallow: /private\nAllow: /private/open','/private/open'),true);
assert.equal(robotsAllowed('User-agent: *\nDisallow: /\nUser-agent: FolioResearchArchive\nAllow: /','/x'),true);
assert.equal(robotsAllowed('User-agent: *\nDisallow: /*.pdf$','/x.pdf'),false);
let scenario='live',networkCalls=[];const originalFetch=globalThis.fetch;
globalThis.fetch=async(url,opts)=>{url=String(url);networkCalls.push(url);
if(url.startsWith('https://cloudflare-dns.com/')){const q=new URL(url);const privateHost=q.searchParams.get('name')==='private.publisher.org';return Response.json({Status:0,Answer:q.searchParams.get('type')==='A'?[{type:1,data:privateHost?'10.1.2.3':'93.184.216.34'}]:[]});}
if(url.endsWith('/robots.txt'))return new Response(scenario==='robots'?'User-agent: *\nDisallow: /':'User-agent: *\nAllow: /');
if(url.startsWith('https://archive.org/wayback/available'))return Response.json({archived_snapshots:scenario.startsWith('today')?{}:{closest:{available:true,status:'200',timestamp:'20240101010101',url:'http://web.archive.org/web/20240101010101/https://publisher.org/story'}}});
if(url.startsWith('https://web.archive.org/web/'))return new Response('<title>Archived story</title><main><p>A public historical snapshot with useful reading content.</p></main>',{headers:{'content-type':'text/html'}});
if(url.startsWith('https://archive.today/newest/'))return new Response(null,{status:scenario==='today-newest'?302:403,headers:scenario==='today-newest'?{location:'https://archive.ph/Ne123'}:{}});
if(url==='https://archive.ph/Ne123')return new Response('<input id="SHARE_LONGLINK" value="https://archive.today/2026.10.13-140444/https://publisher.org/story"><article>A readable snapshot.</article>',{headers:{'content-type':'text/html'}});
if(url.startsWith('https://archive.ph/https://'))return new Response(scenario==='today-none'?'<main>No results</main>':'<a href="https://archive.ph/Ab123">13 Oct 2026</a>',{status:scenario==='today-blocked'?403:200,headers:{'content-type':'text/html'}});
if(url==='https://archive.ph/Ab123'){
 if(scenario==='today-redirect')return new Response(null,{status:302,headers:{location:'http://127.0.0.1/admin'}});
 const page=scenario==='today-wrong'?'https://publisher.org/other':'https://publisher.org/story';
 return new Response('<input value="http://archive.today/2026.10.13-140444/'+page+'" id="SHARE_LONGLINK"><title>Archived story</title><article>Readable public archived content.</article>',{headers:{'content-type':'text/html'}});
}
if(scenario==='redirect')return new Response(null,{status:302,headers:{location:'http://127.0.0.1/admin'}});
if(scenario==='blocked')return new Response('Subscribe',{status:403});
if(scenario==='large')return new Response('x'.repeat(2*1024*1024+1),{headers:{'content-type':'text/html'}});
if(scenario==='binary')return new Response('pdf',{headers:{'content-type':'application/pdf'}});
if(scenario==='encoding')return new Response(new Uint8Array([99,97,102,233]),{headers:{'content-type':'text/plain; charset=iso-8859-1'}});
return new Response('<title>Research</title><main><p>A readable public page for the archive.</p></main>',{headers:{'content-type':'text/html'}});
};
async function call(mode='live',url='https://publisher.org/story'){const r=await worker.fetch(new Request('https://folio.test/api/capture',{method:'POST',headers:{'content-type':'application/json',origin:'https://folio.test'},body:JSON.stringify({url,mode})}));return {status:r.status,data:await r.json()};}
try{
let r=await call();assert.equal(r.status,200);assert.equal(r.data.sourceKind,'live');assert.equal(r.data.responseSha256,createHash('sha256').update(r.data.html).digest('hex'));
scenario='blocked';r=await call('auto');assert.equal(r.status,200);assert.equal(r.data.sourceKind,'wayback');assert.equal(r.data.archiveTimestamp,'20240101010101');assert.match(r.data.liveError,/403/);
scenario='today';r=await call('archive');assert.equal(r.status,200);assert.equal(r.data.sourceKind,'archive-today');assert.equal(r.data.archiveTimestamp,'20261013140444');assert.equal(r.data.archiveUrl,'https://archive.ph/Ab123');
scenario='today-newest';r=await call('archive');assert.equal(r.status,200);assert.equal(r.data.archiveUrl,'https://archive.ph/Ne123');
for(const s of ['today-wrong','today-none','today-redirect']){scenario=s;r=await call('archive');assert.equal(r.status,422,s);assert.equal(r.data.archiveLookupUrl,'https://archive.today/newest/https://publisher.org/story');}
scenario='today-blocked';r=await call('archive');assert.equal(r.status,422);assert.match(r.data.error,/blocked the hosted lookup \(HTTP 403\)/);assert.equal(r.data.archiveLookupUrl,'https://archive.today/newest/https://publisher.org/story');
r=await call('archive','http://127.0.0.1/');assert.equal(r.status,422);assert.equal(r.data.archiveLookupUrl,null);
scenario='encoding';r=await call();assert.equal(r.data.html,'café');assert.equal(r.data.responseSha256,createHash('sha256').update(Buffer.from([99,97,102,233])).digest('hex'));assert.equal(r.data.responseBytes,4);
for(const s of ['redirect','robots','large','binary']){scenario=s;r=await call();assert.equal(r.status,422,s);}
scenario='live';networkCalls=[];r=await call('live','https://private.publisher.org/');assert.equal(r.status,422);assert.ok(!networkCalls.some(x=>x.startsWith('https://private.publisher.org')));
const canceled=new AbortController();canceled.abort();networkCalls=[];const stopped=await worker.fetch(new Request('https://folio.test/api/capture',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({url:'https://publisher.org/story',mode:'auto'}),signal:canceled.signal}));assert.equal(stopped.status,422);assert.equal(networkCalls.length,0);
const cross=await worker.fetch(new Request('https://folio.test/api/capture',{method:'POST',headers:{origin:'https://evil.test','content-type':'application/json'},body:'{}'}));assert.equal(cross.status,403);
const bad=await worker.fetch(new Request('https://folio.test/api/capture',{method:'GET'}));assert.equal(bad.status,405);
const home=await worker.fetch(new Request('https://folio.test/'));assert.equal(home.status,200);assert.match(home.headers.get('content-security-policy'),/frame-ancestors 'none'/);
const page=await home.text();new Function(page.match(/<script>([\s\S]*?)<\/script>/)[1]);
console.log('Capture checks passed: live, archive fallback, source hashes, encodings, redirects, robots, size/type limits, private hosts, origin guard, and UI syntax.');
}finally{globalThis.fetch=originalFetch;}
