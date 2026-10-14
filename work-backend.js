const MAX_BYTES = 2 * 1024 * 1024;
const UA = 'FolioResearchArchive/1.0';
const dnsCache = new Map();
export function normalizeUrl(value) {
  if (typeof value !== 'string' || value.length > 4096) throw new Error('Enter a valid public webpage URL.');
  const u = new URL(/^https?:\/\//i.test(value.trim()) ? value.trim() : 'https://' + value.trim());
  if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password || (u.port && !['80', '443'].includes(u.port))) throw new Error('Use a public HTTP or HTTPS URL without credentials or a custom port.');
  const h = u.hostname.toLowerCase();
  if (!h.includes('.') || h.endsWith('.') || /^\d/.test(h) && /^[\d.]+$/.test(h) || h.includes(':') || /(?:^|\.)(localhost|local|internal|lan|test|invalid|example)$/.test(h)) throw new Error('Only public website hostnames can be captured.');
  u.hash = ''; return u;
}
export function publicIp(ip) {
  if (ip.includes(':')) return /^[23][0-9a-f]{3}:/i.test(ip) && !/^2001:(?:db8|0|2|10|20):/i.test(ip) && !/^2002:/i.test(ip);
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some(x => !Number.isInteger(x) || x < 0 || x > 255)) return false;
  const [a,b,c] = p;
  return !(a===0 || a===10 || a===127 || a>=224 || a===169&&b===254 || a===172&&b>=16&&b<=31 || a===192&&b===168 || a===100&&b>=64&&b<=127 || a===192&&b===0 || a===192&&b===88&&c===99 || a===192&&b===0&&c===2 || a===198&&(b===18||b===19) || a===198&&b===51&&c===100 || a===203&&b===0&&c===113);
}
async function checkHost(u, signal) {
  const cached = dnsCache.get(u.hostname);
  if (cached && cached > Date.now()) return;
  const answers = await Promise.all(['A','AAAA'].map(async type => {
    const r = await fetch('https://cloudflare-dns.com/dns-query?name=' + encodeURIComponent(u.hostname) + '&type=' + type, {headers:{accept:'application/dns-json'},signal});
    if (!r.ok) throw new Error('Could not verify the public website address.');
    const d = await r.json(); if (d.Status !== 0) throw new Error('Website address could not be resolved.');
    return (d.Answer || []).filter(x => x.type === 1 || x.type === 28).map(x => x.data);
  }));
  const ips = answers.flat();
  if (!ips.length || ips.some(ip => !publicIp(ip))) throw new Error('This address does not resolve to a public website.');
  if (dnsCache.size > 1000) dnsCache.clear(); dnsCache.set(u.hostname, Date.now()+60000);
}
async function boundedText(response, limit = MAX_BYTES, includeBytes = false) {
  if (Number(response.headers.get('content-length')) > limit) { await response.body?.cancel(); throw new Error('Page exceeds the 2 MB capture limit.'); }
  const reader = response.body?.getReader(); if (!reader) return '';
  let total=0; const chunks=[];
  try { while(true) { const {value,done}=await reader.read(); if(done)break; total+=value.length; if(total>limit)throw new Error('Page exceeds the capture size limit.'); chunks.push(value); } }
  catch(e) { await reader.cancel(); throw e; }
  const all=new Uint8Array(total);let at=0;for(const v of chunks){all.set(v,at);at+=v.length;}
  let decoder; try { decoder = new TextDecoder((response.headers.get('content-type')||'').match(/charset=([^; ]+)/i)?.[1]||'utf-8'); } catch { decoder = new TextDecoder(); }
  const text=decoder.decode(all);return includeBytes?{text,bytes:all}:text;
}
export function robotsAllowed(text, path) {
  const groups=[];let agents=[],rules=[],hasRule=false;
  function end(){if(agents.length)groups.push({agents,rules});agents=[];rules=[];hasRule=false;}
  for(const line of text.split(/\r?\n/)){const clean=line.replace(/#.*$/,'').trim();const m=clean.match(/^([^:]+):\s*(.*)$/);if(!m)continue;const k=m[1].toLowerCase().trim(),v=m[2].trim();if(k==='user-agent'){if(hasRule)end();agents.push(v.toLowerCase());}else if(k==='allow'||k==='disallow'){hasRule=true;if(v)rules.push({allow:k==='allow',path:v});}}
  end();const specific=groups.filter(g=>g.agents.some(a=>a!=='*'&&'folioresearcharchive'.includes(a)));const selected=specific.length?specific:groups.filter(g=>g.agents.includes('*'));
  let winner={length:-1,allow:true};for(const rule of selected.flatMap(g=>g.rules)){const end=rule.path.endsWith('$');const base=end?rule.path.slice(0,-1):rule.path;const pattern='^'+base.split('*').map(s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('.*')+(end?'$':'');const length=base.replace(/\*/g,'').length;if(new RegExp(pattern).test(path)&&(length>winner.length||length===winner.length&&rule.allow))winner={length,allow:rule.allow};}return winner.allow;
}
async function plainFetch(url, signal, robots = false) {
  let u=normalizeUrl(url);
  for(let hop=0;hop<6;hop++){
    await checkHost(u,signal);
    if(robots)await checkRobots(u,signal);
    const r=await fetch(u.href,{redirect:'manual',headers:{'User-Agent':UA,Accept:'text/html,application/xhtml+xml,text/plain;q=0.8'},signal});
    if([301,302,303,307,308].includes(r.status)) { const location=r.headers.get('location');await r.body?.cancel();if(!location)throw new Error('Website returned an empty redirect.');u=normalizeUrl(new URL(location,u).href);continue; }
    return {response:r,url:u.href};
  }throw new Error('Website redirects too many times.');
}
async function checkRobots(u, signal) {
  const {response:r}=await plainFetch(u.origin+'/robots.txt',signal,false);
  if(r.status===401||r.status===403){await r.body?.cancel();throw new Error('Website does not allow automated capture.');}
  if(r.ok){const text=await boundedText(r,256*1024);if(!robotsAllowed(text,u.pathname+u.search))throw new Error('Website robots.txt disallows this page.');}else{await r.body?.cancel();if(r.status>=500)throw new Error('Website capture permissions are temporarily unavailable.');}
}
async function captureLive(url, signal, respectRobots=true) {
  const {response:r,url:resolvedUrl}=await plainFetch(url,signal,respectRobots);
  if(!r.ok){await r.body?.cancel();const reasons={401:'Website requires sign-in',402:'Website requires payment for access',403:'Website blocked this request',429:'Website temporarily limited requests'};throw new Error((reasons[r.status]||'Website returned an error')+' (HTTP '+r.status+').');}
  const contentType=r.headers.get('content-type')||'';
  if(!/text\/html|application\/xhtml\+xml|text\/plain/i.test(contentType)){await r.body?.cancel();throw new Error('This URL is not an HTML or text page.');}
  const {text:html,bytes}=await boundedText(r,MAX_BYTES,true);const digest=await crypto.subtle.digest('SHA-256',bytes);
  return {html,resolvedUrl,httpStatus:r.status,contentType,mementoDatetime:r.headers.get('memento-datetime'),responseSha256:[...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join(''),responseBytes:bytes.length};
}
async function captureArchive(url, signal) {
  const r=await fetch('https://archive.org/wayback/available?url='+encodeURIComponent(url),{signal,headers:{Accept:'application/json'}});
  if(!r.ok)throw new Error('Wayback lookup is temporarily unavailable.');
  const data=JSON.parse(await boundedText(r,64*1024));const snapshot=data.archived_snapshots?.closest;
  if(!snapshot?.available||snapshot.status!=='200'||!/^\d{14}$/.test(snapshot.timestamp))throw new Error('No publicly accessible Wayback snapshot was found.');
  const archived=new URL(snapshot.url);if(archived.hostname!=='web.archive.org')throw new Error('Archive returned an unexpected address.');
  // Identity replay returns original document markup without archive toolbar scripts.
  const replay='https://web.archive.org/web/'+snapshot.timestamp+'id_/'+url;
  const content=await captureLive(replay,signal,false);
  if(new URL(content.resolvedUrl).hostname!=='web.archive.org')throw new Error('Archived copy redirected outside Wayback.');
  const actualTimestamp=new URL(content.resolvedUrl).pathname.match(/^\/web\/(\d{14})/)?.[1]||snapshot.timestamp;
  return {...content,sourceKind:'wayback',archiveTimestamp:actualTimestamp,archiveUrl:'https://web.archive.org/web/'+actualTimestamp+'/'+url};
}
function htmlValue(value) {return value.replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#(?:39|x27);/gi,"'").replace(/&lt;/gi,'<').replace(/&gt;/gi,'>');}
function inputValue(html, id) {
  for (const tag of html.match(/<input\b[^>]*>/gi)||[]) {
    const attrs={};for(const match of tag.matchAll(/\b([\w-]+)\s*=\s*(["'])(.*?)\2/g))attrs[match[1].toLowerCase()]=htmlValue(match[3]);
    if(attrs.id===id)return attrs.value||'';
  }return '';
}
function verifiedArchiveToday(content, url) {
  if(!['archive.ph','archive.today','archive.is','archive.li'].includes(new URL(content.resolvedUrl).hostname))throw new Error('Archive.today snapshot redirected outside its archive.');
  const longLink=inputValue(content.html,'SHARE_LONGLINK');
  const match=longLink.match(/^https?:\/\/(?:archive\.today|archive\.ph|archive\.is|archive\.li)\/(\d{4})\.(\d{2})\.(\d{2})-(\d{6})\/(https?:\/\/.*)$/);
  if(!match||normalizeUrl(match[5]).href!==normalizeUrl(url).href)throw new Error('Archive.today snapshot does not match the requested webpage.');
  const timestamp=match.slice(1,5).join('');
  const stamp=new Date(timestamp.slice(0,4)+'-'+timestamp.slice(4,6)+'-'+timestamp.slice(6,8)+'T'+timestamp.slice(8,10)+':'+timestamp.slice(10,12)+':'+timestamp.slice(12,14)+'Z');
  if(!Number.isFinite(stamp.getTime()))throw new Error('Archive.today snapshot has an invalid capture date.');
  return {...content,sourceKind:'archive-today',archiveTimestamp:timestamp,archiveUrl:content.resolvedUrl};
}
async function captureArchiveToday(url, signal) {
  // The archive documents /newest/ as a link to an existing latest snapshot.
  try {return verifiedArchiveToday(await captureLive('https://archive.today/newest/'+url,AbortSignal.any([signal,AbortSignal.timeout(12000)]),false),url);}catch{}
  signal.throwIfAborted();
  const lookup=await plainFetch('https://archive.ph/'+url,signal,false);
  if(!lookup.response.ok){await lookup.response.body?.cancel();throw new Error('Archive.today lookup is temporarily unavailable.');}
  if(new URL(lookup.url).hostname!=='archive.ph'){await lookup.response.body?.cancel();throw new Error('Archive.today returned an unexpected lookup address.');}
  const listing=await boundedText(lookup.response,256*1024);
  let snapshotUrl;
  for(const match of listing.matchAll(/\bhref\s*=\s*(["'])(.*?)\1/gi)){
    try {const candidate=new URL(htmlValue(match[2]),lookup.url);if(candidate.protocol==='https:'&&candidate.hostname==='archive.ph'&&/^\/[a-z0-9]{5}$/i.test(candidate.pathname)&&!candidate.search){snapshotUrl=candidate.href;break;}}catch{}
  }
  if(!snapshotUrl)throw new Error('No publicly accessible Archive.today snapshot was found.');
  const content=await captureLive(snapshotUrl,signal,false);
  return verifiedArchiveToday(content,url);
}
async function capturePublicArchive(url, signal) {
  let waybackError;
  try {return await captureArchive(url,AbortSignal.any([signal,AbortSignal.timeout(8000)]));}catch(e){waybackError=e;}
  signal.throwIfAborted();
  try {return await captureArchiveToday(url,signal);}catch(e){throw new Error((waybackError.name==='TimeoutError'?'Wayback lookup timed out.':waybackError.message)+' '+e.message);}
}
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
function json(data,status=200){return Response.json(data,{status,headers});}
export default {
  async fetch(request) {
    const path=new URL(request.url).pathname;
    if(path==='/manifest.webmanifest')return new Response(APP_MANIFEST,{headers:{'Content-Type':'application/manifest+json','Cache-Control':'no-cache'}});
    if(path==='/sw.js')return new Response(SERVICE_WORKER,{headers:{'Content-Type':'application/javascript','Cache-Control':'no-cache','Service-Worker-Allowed':'/'}});
    if(ICONS[path])return new Response(Uint8Array.from(atob(ICONS[path]),c=>c.charCodeAt(0)),{headers:{'Content-Type':'image/png','Cache-Control':'public, max-age=86400','X-Content-Type-Options':'nosniff'}});
    if(path==='/api/health')return json({ok:true});
    if(path==='/api/capture'){
      if(request.method!=='POST')return json({error:'Use POST to capture a page.'},405);
      const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)return json({error:'Capture requests must come from this site.'},403);
      if(!/application\/json/i.test(request.headers.get('content-type')||''))return json({error:'Send a JSON request.'},415);
      let archiveLookupUrl=null;
      try {
        const body=JSON.parse(await boundedText(request,16*1024));const u=normalizeUrl(body.url);const mode=['auto','live','wayback','archive'].includes(body.mode)?body.mode:'auto';
        archiveLookupUrl='https://archive.today/newest/'+u.href;
        let result,liveError=null;const archiveSignal=()=>AbortSignal.timeout(35000);
        if(mode==='wayback')result=await captureArchive(u.href,archiveSignal());
        else if(mode==='archive')result=await capturePublicArchive(u.href,archiveSignal());
        else { try{result={...await captureLive(u.href,AbortSignal.timeout(20000)),sourceKind:'live',archiveTimestamp:null,archiveUrl:null};}catch(e){liveError=e.message;if(mode==='live')throw e;try{result=await capturePublicArchive(u.href,archiveSignal());}catch(a){throw new Error(liveError+' '+a.message);}} }
        return json({...result,sourceUrl:u.href,capturedAt:new Date().toISOString(),liveError});
      }catch(e){return json({error:e.name==='TimeoutError'||e.name==='AbortError'?'Capture timed out.':e.message||'Capture failed.',archiveLookupUrl},422);}
    }
    if(path!=='/')return new Response('Not found',{status:404,headers});
    return new Response(PAGE,{headers:{'Content-Type':'text/html; charset=utf-8','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; script-src 'self' 'unsafe-inline'; worker-src 'self'; manifest-src 'self'; style-src 'unsafe-inline' https: http:; connect-src 'self'; img-src https: http: data:; font-src https: http: data:; media-src https: http:; frame-src 'self'; base-uri https: http:; frame-ancestors 'none'; form-action 'none'"}});
  }
};
