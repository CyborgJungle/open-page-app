import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {DOMParser} from 'linkedom';

const ui=await readFile(new URL('../work-ui.html',import.meta.url),'utf8');
const document=new DOMParser().parseFromString(ui,'text/html');
const navigations=[];let scenario='blocked';const calls=[];
const sourceUrl='https://publisher.org/story';
const context=vm.createContext({document,DOMParser,URL,AbortController,crypto:webcrypto,console,
  location:{assign:url=>navigations.push(url)},
  fetch:async(url,options)=>{
    const body=JSON.parse(options.body);calls.push(body.mode);
    if(scenario==='blocked'||scenario==='unsafe'||body.mode==='archive')return {ok:false,json:async()=>({error:'Archive.today blocked the hosted lookup. '.repeat(5),archiveLookupUrl:scenario==='unsafe'?'https://unrelated.test/newest/'+sourceUrl:'https://archive.today/newest/'+sourceUrl})};
    return {ok:true,json:async()=>({sourceUrl,resolvedUrl:sourceUrl,contentType:'text/html',sourceKind:'live',html:scenario==='partial'?'<article>Dit artikel is alleen voor abonnees.</article>':'<article><h1>Research page</h1><p>'+('Readable public content. '.repeat(180))+'</p></article>'})};
  }
});
vm.runInContext(ui.match(/<script>([\s\S]*?)<\/script>/)[1],context);
const input=document.getElementById('url');input.value=sourceUrl;input.blur=()=>{};
async function submit(){await document.getElementById('open-form').onsubmit({preventDefault(){}});}

await submit();assert.deepEqual(navigations,['https://archive.today/newest/'+sourceUrl]);assert.equal(document.getElementById('status').hidden,true);assert.equal(document.querySelector('#status a'),null);assert.equal(document.getElementById('open').textContent,'Open →');
scenario='partial';calls.length=0;await submit();assert.deepEqual(calls,['auto','archive']);assert.equal(navigations.length,2);assert.equal(document.getElementById('status').hidden,true);
scenario='unsafe';await submit();assert.equal(navigations.length,2);assert.equal(document.getElementById('status').textContent,'Could not open this page.');
scenario='readable';await submit();assert.equal(navigations.length,2);assert.equal(document.getElementById('page').hidden,false);assert.equal(document.getElementById('status').hidden,true);
assert.equal(vm.runInContext("openPublicArchive('https://archive.today/newest/https://other.org/story','https://publisher.org/story')",context),false);
assert.equal(vm.runInContext("openPublicArchive('https://user:pass@archive.today/newest/https://publisher.org/story','https://publisher.org/story')",context),false);
assert.equal(vm.runInContext("openPublicArchive('https://archive.today/newest/https://publisher.org/story','publisher.org/story#section')",context),true);
console.log('Automatic archive checks passed: blocked and partial captures navigate without prompts, readable pages stay in the app, unsafe/mismatched targets are rejected, and loading state resets.');
