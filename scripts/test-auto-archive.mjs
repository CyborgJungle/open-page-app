import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {DOMParser} from 'linkedom';

const ui=await readFile(new URL('../work-ui.html',import.meta.url),'utf8');
const document=new DOMParser().parseFromString(ui,'text/html');
const navigations=[];let scenario='blocked';const calls=[],browserCalls=[];
const sourceUrl='https://publisher.org/story';
const article='<article><h1>Research page</h1><p>'+('Readable public content. '.repeat(180))+'</p></article>';
function archiveResponse(){
 const original=scenario==='wrong-source'?'https://other.org/story':sourceUrl;
 let html='<input id="SHARE_LONGLINK" value="https://archive.today/2026.10.13-140444/'+original+'"><div id="CONTENT">'+article+'<script>untrustedPublisherScript()</script></div>';
 if(scenario==='challenge')html='<h1>Verify you are human</h1><div id="challenge-form"></div>';
 if(scenario==='large')html='x'.repeat(2*1024*1024+1);
 const response=new Response(html,{status:scenario==='browser-blocked'?429:200,headers:{'content-type':'text/html'}});
 Object.defineProperty(response,'url',{value:'https://archive.ph/Ab123'});return response;
}
const context=vm.createContext({document,DOMParser,URL,AbortController,crypto:webcrypto,console,TextEncoder,TextDecoder,setTimeout,clearTimeout,
 location:{assign:url=>navigations.push(url)},
 fetch:async(url,options)=>{
  if(url.startsWith('https://archive.ph/')){browserCalls.push({url,options});return archiveResponse();}
  const body=JSON.parse(options.body);calls.push(body.mode);
  if(scenario==='abort'){const e=new Error('Canceled');e.name='AbortError';throw e;}
  if(!['readable','archived','partial'].includes(scenario)||body.mode==='archive')return {ok:false,json:async()=>({error:'Archive.today blocked the hosted lookup. '.repeat(5),archiveLookupUrl:scenario==='unsafe'?'https://unrelated.test/newest/'+sourceUrl:'https://archive.today/newest/'+sourceUrl})};
  return {ok:true,json:async()=>({sourceUrl,resolvedUrl:sourceUrl,contentType:'text/html',sourceKind:scenario==='archived'?'archive-today':'live',archiveTimestamp:scenario==='archived'?'20261013140444':null,html:scenario==='partial'?'<article>Dit artikel is alleen voor abonnees.</article>':article})};
 }
});
vm.runInContext(ui.match(/<script>([\s\S]*?)<\/script>/)[1],context);
const input=document.getElementById('url');input.value=sourceUrl;input.blur=()=>{};
async function submit(){await document.getElementById('open-form').onsubmit({preventDefault(){}});assert.deepEqual(navigations,[]);assert.equal(document.querySelector('#status a'),null);assert.equal(document.getElementById('open').textContent,'Open →');}

await submit();assert.equal(document.getElementById('page').hidden,false);assert.equal(document.getElementById('status').textContent,'Archived · 2026-10-13');assert.match(document.getElementById('page').srcdoc,/Research page/);assert.ok(!document.getElementById('page').srcdoc.includes('untrustedPublisherScript'));
assert.equal(browserCalls[0].url,'https://archive.ph/newest/'+sourceUrl);assert.equal(browserCalls[0].options.credentials,'omit');assert.equal(browserCalls[0].options.mode,'cors');
scenario='partial';calls.length=0;await submit();assert.deepEqual(calls,['auto','archive']);assert.equal(document.getElementById('status').textContent,'Archived · 2026-10-13');
for(const value of ['unsafe','wrong-source','challenge','large','browser-blocked']){scenario=value;const previous=document.getElementById('page').srcdoc;await submit();assert.equal(document.getElementById('status').textContent,'Could not load this page.');assert.equal(document.getElementById('page').srcdoc,previous);}
const attempts=browserCalls.length;scenario='readable';await submit();assert.equal(browserCalls.length,attempts);assert.equal(document.getElementById('status').hidden,true);
scenario='archived';await submit();assert.equal(browserCalls.length,attempts);assert.equal(document.getElementById('page').hidden,false);assert.equal(document.getElementById('status').textContent,'Archived · 2026-10-13');
scenario='abort';await submit();assert.equal(browserCalls.length,attempts);assert.equal(document.getElementById('status').hidden,true);
assert.ok(!/location\.(?:assign|replace)|window\.open\(/.test(ui));
console.log('Archive containment checks passed: browser CORS capture renders beneath the toolbar without navigation or cookies, readable/server-archived pages stay in the app, and blocked/challenge/mismatched/oversize responses are rejected.');
