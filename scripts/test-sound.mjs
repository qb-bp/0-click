// Dependency-free regression tests for opt-in audio and the real lookup hooks.
// Run: node scripts/test-sound.mjs
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { test } from 'node:test';
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const sound = html.split('// ========== OPTIONAL SOUND SCORE ==========')[1]
  .split('// ========== ACCESSIBILITY HELPERS')[0];
const lookup = html.slice(html.indexOf('(function _setupLocate(){'),
  html.indexOf('function startGame(){'));
function harness({ unsupported = false, failResume = false, fetchImpl } = {}) {
  const elements = new Map();
  const nodes = [];
  const listeners = {};
  const previews = ['signal', 'rabbit', 'network'].map(name => element(name));
  previews.forEach((b, i) => b.dataset = { soundPreview: ['signal','rabbit','network'][i] });
  function element(id){
    return { id, textContent:'', value:'25', disabled:false, children:[], listeners:{},
      classList:{add(){},remove(){}}, dataset:{},
      addEventListener(name, fn){this.listeners[name] = fn;},
      setAttribute(name, value){this[name] = value;},
      replaceChildren(){this.children = [];}, appendChild(child){this.children.push(child);},
      querySelectorAll(){return previews;}, querySelector(){return element('label');} };
  }
  function audioNode(){
    const param = {value:0,setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}};
    const n = { gain:{...param},frequency:{...param},pan:{...param},stopped:false,
      connect(){},disconnect(){},start(){},stop(){this.stopped=true;} };
    nodes.push(n); return n;
  }
  let contexts = 0;
  class AudioContext {
    constructor(){contexts++;this.state='suspended';this.currentTime=0;this.destination={};}
    async resume(){if(failResume) throw Error('blocked');this.state='running';}
    createGain(){return audioNode();} createOscillator(){return audioNode();}
    createStereoPanner(){return audioNode();}
  }
  const document = {hidden:false, getElementById(id){
    if(!elements.has(id)) elements.set(id,element(id)); return elements.get(id);
  }, createElement:element, addEventListener(name, fn){listeners[name]=fn;} };
  const context = vm.createContext({document, window:unsupported ? {} : {AudioContext},
    performance:{now:()=>100}, console:{log(){}}, AbortController,setTimeout,clearTimeout,
    socEvent(){}, fetch:fetchImpl || (()=>{throw Error('unexpected network');})});
  vm.runInContext(sound,context);
  return {context, document,elements,nodes,listeners,previews,
    contexts:()=>contexts, run:code=>vm.runInContext(code,context),
    snapshot:()=>context.window.synapse.sound.snapshot()};
}

test('silent until explicit opt-in; preview creates no network request', async()=>{
  const h=harness();
  assert.equal(h.contexts(),0);
  h.run("soundEvent('rabbit.revealed','White rabbit appeared on the left.','rabbit',-.65)");
  assert.equal(h.snapshot().events.at(-1).playback,'disabled');
  assert.equal(h.contexts(),0);
  await h.elements.get('sound-toggle').listeners.click();
  assert.equal(h.contexts(),1);
  assert.equal(h.snapshot().enabled,true);
  assert.equal(h.snapshot().events.at(-1).event,'preview.signal');
  assert.equal(h.snapshot().events.at(-1).playback,'scheduled');
  h.previews[2].listeners.click();
  assert.equal(h.snapshot().events.at(-1).event,'preview.network');
});
test('mute cancels cues; volume zero and hidden page suppress scheduling',async()=>{
  const h=harness();await h.run('setSoundEnabled(true)');
  h.elements.get('sound-volume').listeners.input({target:{value:'0'}});
  h.run("soundEvent('rabbit.revealed','left','rabbit')");
  assert.equal(h.snapshot().events.at(-1).playback,'muted');
  h.elements.get('sound-volume').listeners.input({target:{value:'25'}});
  h.document.hidden=true;h.listeners.visibilitychange();
  h.run("soundEvent('rabbit.revealed','left','rabbit')");
  assert.equal(h.snapshot().events.at(-1).playback,'hidden');
  await h.run('setSoundEnabled(false)');
  assert.equal(h.snapshot().enabled,false);
  assert.equal(h.run('soundSources.size'),0);
  assert.equal(h.run('soundMaster.gain.value'),0);
});
test('unsupported and rejected audio leave readable score without enabling audio',async()=>{
  for(const options of [{unsupported:true},{failResume:true}]){
    const h=harness(options);await h.run('setSoundEnabled(true)');
    assert.equal(h.snapshot().enabled,false);
    assert.equal(h.snapshot().events.at(-1).event,'sound.unavailable');
    assert.ok(h.elements.get('sound-score').children.length);
  }
});
test('a delayed enable cannot override a subsequent mute',async()=>{
  const h=harness();const enabling=h.run('setSoundEnabled(true)');
  await h.run('setSoundEnabled(false)');await enabling;
  assert.equal(h.snapshot().enabled,false);
});
test('bounded, detached score stays readable while muted',()=>{
  const h=harness();
  h.run("for(let i=0;i<250;i++) soundEvent('browser.signals.revealed','language','signal')");
  assert.equal(h.snapshot().retainedEvents,200);
  assert.equal(h.snapshot().totalEvents,251);
  assert.equal(h.elements.get('sound-score').children.length,40);
  h.snapshot().events[0].description='tampered';
  assert.equal(h.snapshot().events[0].description,'language');
});
test('real lookup records request then success or failure without copying private values',async()=>{
  for(const ok of [true,false]){
    let calls=0;
    const h=harness({fetchImpl:async()=>{calls++;return {ok,status:429,json:async()=>({ip:'PRIVATE_IP',city:'PRIVATE_CITY'})};}});
    vm.runInContext(lookup,h.context);
    assert.equal(calls,0);
    await h.context.window.synapse.locate();
    const events=h.snapshot().events.filter(e=>e.event.startsWith('lookup.'));
    assert.equal(events[0].event,'lookup.requested');
    assert.equal(events[1].event,ok?'lookup.received':'lookup.failed');
    assert.equal(JSON.stringify(events).includes('PRIVATE'),false);
    assert.equal(calls,1);
  }
});
