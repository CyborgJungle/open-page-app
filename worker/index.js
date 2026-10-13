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
  if(!r.ok){await r.body?.cancel();throw new Error('Website returned HTTP '+r.status+'.');}
  const contentType=r.headers.get('content-type')||'';
  if(!/text\/html|application\/xhtml\+xml|text\/plain/i.test(contentType)){await r.body?.cancel();throw new Error('This URL is not an HTML or text page.');}
  const {text:html,bytes}=await boundedText(r,MAX_BYTES,true);const digest=await crypto.subtle.digest('SHA-256',bytes);
  return {html,resolvedUrl,httpStatus:r.status,contentType,responseSha256:[...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join(''),responseBytes:bytes.length};
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
  return {...content,sourceKind:'wayback',archiveTimestamp:snapshot.timestamp,archiveUrl:archived.href.replace(/^http:/,'https:')};
}
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
function json(data,status=200){return Response.json(data,{status,headers});}
export default {
  async fetch(request) {
    const path=new URL(request.url).pathname;
    if(path==='/api/health')return json({ok:true});
    if(path==='/api/capture'){
      if(request.method!=='POST')return json({error:'Use POST to capture a page.'},405);
      const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)return json({error:'Capture requests must come from this site.'},403);
      if(!/application\/json/i.test(request.headers.get('content-type')||''))return json({error:'Send a JSON request.'},415);
      try {
        const body=JSON.parse(await boundedText(request,16*1024));const u=normalizeUrl(body.url);const mode=['auto','live','wayback'].includes(body.mode)?body.mode:'auto';
        const signal=AbortSignal.timeout(45000);let result,liveError=null;
        if(mode==='wayback')result=await captureArchive(u.href,signal);
        else { try{result={...await captureLive(u.href,signal),sourceKind:'live',archiveTimestamp:null,archiveUrl:null};}catch(e){liveError=e.message;if(mode==='live')throw e;try{result=await captureArchive(u.href,signal);}catch(a){throw new Error(liveError+' '+a.message);}} }
        return json({...result,sourceUrl:u.href,capturedAt:new Date().toISOString(),liveError});
      }catch(e){return json({error:e.name==='TimeoutError'||e.name==='AbortError'?'Capture timed out. Try the archived-copy source.':e.message||'Capture failed.'},422);}
    }
    if(path!=='/')return new Response('Not found',{status:404,headers});
    return new Response(PAGE,{headers:{'Content-Type':'text/html; charset=utf-8','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline' https: http:; connect-src 'self'; img-src https: http: data:; font-src https: http: data:; media-src https: http:; frame-src 'self'; base-uri https: http:; frame-ancestors 'none'; form-action 'none'"}});
  }
};

const PAGE="<!doctype html>\n<html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><meta name=\"description\" content=\"Open a webpage from its available HTML or a public archived copy.\"><title>Open Page</title><style>\n*{box-sizing:border-box}body{margin:0;background:#fff;color:#222;font:14px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}.toolbar{display:flex;align-items:center;gap:12px;padding:12px 18px;border-bottom:1px solid #e7e7e7;background:#fff;min-height:66px}.name{font-size:14px;font-weight:600;white-space:nowrap;margin-right:8px}form{display:flex;gap:8px;flex:1;max-width:950px}input{width:100%;min-width:0;height:40px;padding:0 12px;border:1px solid #d5d5d5;border-radius:4px;font:inherit;background:#fff}input:focus{outline:2px solid #999;outline-offset:1px}button{height:40px;padding:0 19px;border:1px solid #202020;border-radius:4px;background:#202020;color:white;font:inherit;cursor:pointer;white-space:nowrap}button:disabled{opacity:.5;cursor:wait}.extra{display:flex;gap:12px;align-items:center;margin-left:auto;white-space:nowrap}.extra button{height:32px;font-size:12px;padding:0 10px;background:white;color:#555;border-color:#ddd}.extra a{font-size:12px;color:#555;text-decoration:none}.status{padding:7px 18px;font-size:12px;color:#666;border-bottom:1px solid #eee;background:#fafafa;overflow-wrap:anywhere}.status.error{color:#a3352d;background:#fff8f7}.status a{color:inherit}iframe{display:block;width:100%;border:0;height:calc(100dvh - 103px);background:white}.empty{height:calc(100dvh - 67px);display:grid;place-items:center;color:#a2a2a2;font-size:14px}[hidden]{display:none!important}@media(max-width:650px){.toolbar{gap:8px;padding:10px}.name{display:none}.extra{gap:8px}.extra a{display:none}.extra button{padding:0 7px}button{padding:0 12px}iframe{height:calc(100dvh - 97px)}.status{padding:7px 10px}}\n</style></head><body>\n<div class=\"toolbar\"><span class=\"name\">Open Page</span><form id=\"open-form\"><input id=\"url\" type=\"text\" inputmode=\"url\" placeholder=\"Paste a webpage URL\" aria-label=\"Webpage URL\" autocomplete=\"url\" required><button id=\"open\" type=\"submit\">Open →</button></form><div class=\"extra\" id=\"actions\" hidden><a id=\"original\" target=\"_blank\" rel=\"noopener noreferrer\">Original ↗</a><button id=\"download\" type=\"button\">Download</button></div></div>\n<div id=\"status\" class=\"status\" role=\"status\" aria-live=\"polite\" hidden></div><div id=\"empty\" class=\"empty\">Paste a link above to open a page.</div><iframe id=\"page\" title=\"Captured webpage\" sandbox=\"allow-popups allow-popups-to-escape-sandbox\" referrerpolicy=\"no-referrer\" hidden></iframe>\n<script>\n'use strict';const $=id=>document.getElementById(id);let snapshot=null,pending=null;\nconst escapeHtml=v=>String(v).replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',\"'\":'&#39;'}[c]));\nfunction message(text,error=false){$('status').textContent=text;$('status').classList.toggle('error',error);$('status').hidden=!text;}\nasync function request(url,mode,signal){const r=await fetch('/api/capture',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url,mode}),signal});const d=await r.json();if(!r.ok)throw new Error(d.error||'Could not open this page.');return d;}\nfunction inspect(d){if(/text\\/plain/.test(d.contentType))return {words:d.html.trim().split(/\\s+/).length,limited:false};const doc=new DOMParser().parseFromString(d.html,'text/html');doc.querySelectorAll('script,style,noscript,nav,header,footer').forEach(n=>n.remove());const root=doc.querySelector('article')||doc.querySelector('main')||doc.body;const text=root.textContent.trim();const words=text?text.split(/\\s+/).length:0;return {words,limited:words<600&&/subscribe to (?:continue|read|unlock)|already a subscriber|subscription required|subscriber[ -]only|sign in to (?:continue|read)|unlock this article|purchase a subscription/i.test(text)};}\nfunction prepare(d){let doc;if(/text\\/plain/.test(d.contentType)){doc=document.implementation.createHTMLDocument('Captured page');const p=doc.createElement('pre');p.textContent=d.html;p.style.whiteSpace='pre-wrap';doc.body.append(p);}else doc=new DOMParser().parseFromString(d.html,'text/html');\nconst title=doc.title||new URL(d.sourceUrl).hostname;\n// Remove static subscription dialogs while retaining the article already present in HTML.\nfor(const gate of doc.querySelectorAll('[role=\"dialog\"],[aria-modal=\"true\"],[class*=\"paywall-overlay\"],[id*=\"paywall-overlay\"],[class*=\"paywall-modal\"],[class*=\"regwall-overlay\"]')){const text=gate.textContent.trim();if(text.length<3000&&/subscribe|subscription|subscriber|sign in to read|unlock (?:this|the) article/i.test(text))gate.remove();}\nif(doc.body)doc.body.style.overflow='auto';\n// The snapshot is isolated; keep static presentation and remove executable content.\ndoc.querySelectorAll('script,noscript,iframe,frame,frameset,object,embed,base,meta[http-equiv],link[rel=\"preload\"][as=\"script\"],link[rel=\"modulepreload\"],#wm-ipp-base').forEach(n=>n.remove());\nfor(const el of doc.querySelectorAll('*')){for(const a of [...el.attributes]){if(/^on/i.test(a.name)||['srcdoc','nonce','integrity'].includes(a.name.toLowerCase()))el.removeAttribute(a.name);}\nfor(const attr of ['href','src','action','formaction','poster','data','xlink:href']){const value=el.getAttribute(attr);if(!value)continue;try{const target=new URL(value,d.sourceKind==='wayback'?d.sourceUrl:d.resolvedUrl);if(['http:','https:'].includes(target.protocol)||attr==='src'&&/^data:image\\//i.test(value))el.setAttribute(attr,target.href);else if(attr==='href'&&value.startsWith('#'))el.setAttribute(attr,value);else el.removeAttribute(attr);}catch{el.removeAttribute(attr);}}\nif(el.hasAttribute('srcset')){const value=el.getAttribute('srcset');if(!/data:/i.test(value))el.setAttribute('srcset',value.split(',').map(part=>{const [url,...desc]=part.trim().split(/\\s+/);try{const u=new URL(url,d.sourceKind==='wayback'?d.sourceUrl:d.resolvedUrl);return ['http:','https:'].includes(u.protocol)?u.href+' '+desc.join(' '):'';}catch{return '';}}).filter(Boolean).join(','));else el.removeAttribute('srcset');}\nif(el.tagName==='A'){el.setAttribute('target','_blank');el.setAttribute('rel','noopener noreferrer');}\nif(el.tagName==='FORM'){el.removeAttribute('action');el.removeAttribute('method');}\n}\nconst base=doc.createElement('base');base.href=d.sourceKind==='wayback'?d.sourceUrl:d.resolvedUrl;doc.head.prepend(base);\nconst csp=doc.createElement('meta');csp.httpEquiv='Content-Security-Policy';csp.content=\"default-src 'none'; script-src 'none'; style-src 'unsafe-inline' https: http:; img-src https: http: data:; font-src https: http: data:; media-src https: http:; base-uri https: http:; form-action 'none'\";doc.head.prepend(csp);\nconst ref=doc.createElement('meta');ref.name='referrer';ref.content='no-referrer';doc.head.prepend(ref);\nif(!doc.querySelector('meta[name=\"viewport\"]')){const v=doc.createElement('meta');v.name='viewport';v.content='width=device-width,initial-scale=1';doc.head.append(v);}\nreturn {title,html:'<!doctype html>\\n'+doc.documentElement.outerHTML};}\n$('open-form').onsubmit=async e=>{e.preventDefault();pending?.abort();pending=new AbortController();const control=pending;$('open').disabled=true;message('Opening page…');try{let d=await request($('url').value.trim(),'auto',control.signal);let info=inspect(d);if(d.sourceKind==='live'&&(info.limited||info.words<10)){message('Checking for an available archived copy…');try{const archived=await request(d.sourceUrl,'wayback',control.signal);const candidate=inspect(archived);if(candidate.words>info.words&&!candidate.limited){d=archived;info=candidate;}}catch(e){if(e.name==='AbortError')throw e;}}\nconst visual=prepare(d);snapshot={...d,...visual,limited:info.limited};$('page').srcdoc=visual.html;$('page').hidden=false;$('empty').hidden=true;$('actions').hidden=false;$('original').href=d.sourceUrl;document.title=visual.title+' · Open Page';let summary='';if(d.sourceKind==='wayback'){const t=d.archiveTimestamp;summary='Archived copy · '+t.slice(0,4)+'-'+t.slice(4,6)+'-'+t.slice(6,8);}else summary='Live page';summary+=info.limited?' · Available content may be incomplete.':' · '+new URL(d.sourceUrl).hostname;message(summary);}\ncatch(e){if(e.name!=='AbortError')message(e.message,true);}finally{if(pending===control){$('open').disabled=false;pending=null;}}};\n$('download').onclick=()=>{if(!snapshot)return;const provenance='<!-- Original URL: '+escapeHtml(snapshot.sourceUrl)+' | Retrieved: '+snapshot.capturedAt+' | Source: '+snapshot.sourceKind+(snapshot.archiveTimestamp?' | Archive timestamp: '+snapshot.archiveTimestamp:'')+' | Response SHA-256: '+snapshot.responseSha256+' -->\\n';const blob=new Blob([provenance+snapshot.html],{type:'text/html'});const a=document.createElement('a');const href=URL.createObjectURL(blob);a.href=href;a.download=(snapshot.title.replace(/[^\\p{L}\\p{N}\\s-]/gu,'').replace(/\\s+/g,'-').slice(0,65)||'page')+'.html';a.click();setTimeout(()=>URL.revokeObjectURL(href),1000);message('Downloaded. Images and styles still use their original web addresses.');};\n</script></body></html>\n";
