// tools/wiki/check.mjs - drive headless Chrome over the built wiki.
// Needs a server at http://localhost:8765 with the site root.
import { spawn } from 'node:child_process';
import { readdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const shots = process.argv[2];
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const proc = spawn(CHROME, ['--headless=new', '--remote-debugging-port=9333', '--no-first-run',
  '--enable-unsafe-webgpu', '--enable-features=Vulkan,WebGPU', '--use-angle=metal', '--ignore-gpu-blocklist',
  `--user-data-dir=${mkdtempSync(join(tmpdir(), 'wikichk'))}`, 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
await sleep(2000);
const target = (await (await fetch('http://localhost:9333/json/list')).json()).find(t => t.type === 'page');
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
let id = 0; const wait = new Map(); const errors = [];
ws.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.id) { wait.get(m.id)?.(m.result ?? m); wait.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  if (m.method === 'Network.responseReceived' && m.params.response.status >= 400) errors.push(m.params.response.status + ' ' + m.params.response.url);
};
const cmd = (method, params = {}) => new Promise(r => { const i = ++id; wait.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async expr => { const r = await cmd('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); return r.result?.value ?? r.exceptionDetails?.exception?.description; };
const go = async (url, ms = 350) => { await cmd('Page.navigate', { url }); await sleep(ms); };
await cmd('Page.enable'); await cmd('Runtime.enable'); await cmd('Network.enable');
const B = 'http://localhost:8765/docs/';
const pages = readdirSync('docs').filter(f => f.endsWith('.html') && f !== 'random.html');
// 1. Phone width: no horizontal page scroll on any page.
await cmd('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
const wide = [];
for (const p of pages) {
  await go(B + p, 220);
  const w = await ev('document.documentElement.scrollWidth');
  if (w > 391) wide.push(`${p}:${w}`);
}
console.log(`phone: ${pages.length - wide.length} of ${pages.length} pages fit 390px`, wide.slice(0, 12).join(' '));
if (shots) { await go(B + 'squircle.html', 600); const s = await cmd('Page.captureScreenshot'); writeFileSync(join(shots, 'phone.png'), Buffer.from(s.data, 'base64')); }
await cmd('Emulation.setDeviceMetricsOverride', { width: 1400, height: 1000, deviceScaleFactor: 1, mobile: false });
console.log('page errors after crawl:', errors.length, errors.slice(0, 5));
// 2. Search.
await go(B + 'index.html', 500);
const search = async q => ev(`(async()=>{const i=document.querySelector('#q');i.value=${JSON.stringify(q)};i.dispatchEvent(new Event('input'));await new Promise(r=>setTimeout(r,400));return [...document.querySelectorAll('#results a')].slice(0,3).map(a=>a.getAttribute('href')).join(' ')})()`);
for (const q of ['squircle', 'spring', 'Deck::show', 'add_trauma', 'poisson']) console.log('search', q, '->', await search(q));
// 3. Preview and a closed method list opened by a hash link.
console.log('preview:', await ev(`(async()=>{const a=document.querySelector('a[data-slug=squircle]');a.dispatchEvent(new MouseEvent('mouseover',{bubbles:true}));await new Promise(r=>setTimeout(r,700));return document.querySelector('.pop')?.textContent.slice(0,90)||'none'})()`));
await go(B + 'juice.html#sym-Spring-step', 500);
console.log('hash opens list:', await ev(`document.getElementById('sym-Spring-step')?.closest('details')?.open`));
console.log('filter:', await ev(`(async()=>{const i=document.querySelector('.reffilter input');i.value='kick';i.dispatchEvent(new Event('input'));return document.querySelector('.refcount').textContent})()`));
// 4. Demos.
for (const [p, d] of [['juice', 'spring'], ['camera', 'shake'], ['palette-kit', 'harmony'], ['squircle', 'squircle'], ['procgen', 'streams']]) {
  await go(B + p + '.html', 600);
  console.log('demo', d, await ev(`(()=>{const e=document.querySelector('[data-demo=${d}]');return e&&e.children.length>2?'mounted':'EMPTY'})()`));
}
await go(B + 'symbols.html', 900);
console.log('symbols rows:', await ev(`document.querySelectorAll('#symrows tr').length`));
// 5. WebGPU.
await go(B + 'shaderlib.html', 1800);
console.log('gpu:', await ev(`(async()=>{const a=navigator.gpu&&await navigator.gpu.requestAdapter();return a?'adapter ok':'no adapter'})()`));
await ev(`document.querySelector('[data-demo=shaderplay]').scrollIntoView()`);
const n = await ev(`document.querySelectorAll('[data-demo=shaderplay] option').length`);
for (let i = 0; i < n; i++) {
  const r = await ev(`(async()=>{const e=document.querySelector('[data-demo=shaderplay]');const s=e.querySelector('select');delete e.dataset.ok;s.value=${i};s.dispatchEvent(new Event('change'));for(let k=0;k<80;k++){await new Promise(r=>setTimeout(r,100));if(e.dataset.ok==='${i}'||e.querySelector('.bad').textContent)break;}return s.options[s.selectedIndex].text+': '+(e.querySelector('.bad').textContent.slice(0,160)||(e.dataset.ok==='${i}'?'compiled':'timeout'))})()`);
  console.log(' ', r);
  if (shots) { await sleep(500); const s = await cmd('Page.captureScreenshot'); writeFileSync(join(shots, `shader${i}.png`), Buffer.from(s.data, 'base64')); }
}
console.log('errors total:', errors.length, errors.slice(0, 6));
ws.close(); proc.kill(); process.exit(0);
