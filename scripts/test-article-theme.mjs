import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const ui=await readFile(new URL('../work-ui.html',import.meta.url),'utf8');
const script=ui.match(/<script>([\s\S]*?)<\/script>/)[1];
function setup(saved,blocked=false){
  const nodes=new Map(),messages=[],writes=[];
  const rootClasses=new Set(),themeAttributes={};
  const document={documentElement:{classList:{toggle(k,on){on?rootClasses.add(k):rootClasses.delete(k);},contains(k){return rootClasses.has(k);}}},querySelector(){return {setAttribute(k,v){themeAttributes[k]=v;}};},getElementById(id){if(!nodes.has(id)){const attributes={},classes=new Set();nodes.set(id,{firstElementChild:{},setAttribute(k,v){attributes[k]=v;},getAttribute(k){return attributes[k];},classList:{toggle(k,on){on?classes.add(k):classes.delete(k);},contains(k){return classes.has(k);}},contentWindow:{postMessage(data){messages.push(data);}}});}return nodes.get(id);}};
  const localStorage={getItem(){if(blocked)throw Error('Unavailable');return saved;},setItem(k,v){if(blocked)throw Error('Unavailable');writes.push([k,v]);}};
  const context=vm.createContext({document,localStorage,console});vm.runInContext(script,context);
  return {context,nodes,messages,writes,document,themeAttributes};
}
const state=setup('true'),button=state.nodes.get('article-theme'),page=state.nodes.get('page');
assert.ok(state.document.documentElement.classList.contains('app-dark'));assert.equal(state.themeAttributes.content,'#1c1d20');assert.ok(!ui.includes('☾')&&!ui.includes('☀'));assert.match(ui,/class="theme-moon"/);assert.match(ui,/class="theme-sun"/);
assert.equal(button.getAttribute('aria-pressed'),'true');assert.ok(page.classList.contains('article-dark'));
vm.runInContext("frameKey='test-channel'",state.context);button.onclick();
assert.ok(!state.document.documentElement.classList.contains('app-dark'));assert.equal(state.themeAttributes.content,'#faf9f6');
assert.equal(button.getAttribute('aria-pressed'),'false');assert.equal(button.getAttribute('aria-label'),'Use dark article mode');assert.ok(!page.classList.contains('article-dark'));
assert.equal(state.messages.at(-1).channel,'test-channel');assert.equal(state.messages.at(-1).dark,false);assert.equal(state.writes.at(-1)[1],'false');
button.onclick();page.onload();assert.equal(state.messages.at(-1).dark,true);assert.equal(page.srcdoc,undefined);
const blocked=setup(null,true);blocked.nodes.get('article-theme').onclick();assert.equal(blocked.nodes.get('article-theme').getAttribute('aria-pressed'),'true');
const listeners={},attrs={},parent={};const window={addEventListener(type,fn){listeners[type]=fn;}};
vm.runInContext("bridgeSource=frameScrollBridge.toString()",state.context);
vm.runInNewContext('('+state.context.bridgeSource+')('+JSON.stringify('test-channel')+')',{window,parent,document:{documentElement:{setAttribute(k,v){attrs[k]=v;}},addEventListener(){}},WeakMap});
const send=(source,channel,dark)=>listeners.message({source,data:{type:'open-page-theme',channel,dark}});
send({},'test-channel',true);assert.deepEqual(attrs,{});send(parent,'wrong',true);assert.deepEqual(attrs,{});send(parent,'test-channel','true');assert.deepEqual(attrs,{});send(parent,'test-channel',true);assert.equal(attrs['data-open-page-dark'],'true');send(parent,'test-channel',false);assert.equal(attrs['data-open-page-dark'],'false');
console.log('Article theme checks passed: saved preference, accessible toggle state, blocked storage, no frame reload, load synchronization, and trusted frame messages.');
