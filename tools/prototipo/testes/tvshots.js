// Prints das abas do estudo de viabilidade. Uso: node tvshots.js <pasta>
const path=require('path'),fs=require('fs');const OUT=process.argv[2]+'/';fs.mkdirSync(OUT,{recursive:true});
const {chromium}=require('playwright');
const L=path.join(__dirname,'..','libs','l')+'/';const F=path.join(__dirname,'..','..','..','docs','prototipo.html');
(async()=>{const b=await chromium.launch();
for(const [dev,vp,mob] of [['d',{width:1440,height:900},false],['m',{width:390,height:844},true]])for(const tema of (process.argv[3]?[process.argv[3]]:['claro','escuro'])){
 const ctx=await b.newContext({viewport:vp,isMobile:mob,hasTouch:mob});
 await ctx.route('**/*',r=>{const u=r.request().url();
  if(u.includes('leaflet.js'))return r.fulfill({path:L+'leaflet.js'});if(u.includes('leaflet.css'))return r.fulfill({path:L+'leaflet.css'});if(u.includes('jszip'))return r.fulfill({path:L+'jszip.min.js'});
  if(u.includes('fonts.g'))return r.continue();if(u.startsWith('http://bkm.test/prototipo')&&!u.includes('/dados/'))return r.fulfill({path:F,contentType:'text/html'});return r.fulfill({status:404,body:''})});
 await ctx.addInitScript(t=>{try{localStorage.setItem('bkm-terrenos-tema',t)}catch(e){}},tema);
 const p=await ctx.newPage();await p.goto('http://bkm.test/prototipo/terrenos/TER-000123/viabilidade/1');await p.waitForTimeout(800);
 const abas=await p.$$eval('.vb-aba',x=>x.map(e=>e.dataset.v));
 for(const a of abas){await p.evaluate(v=>document.querySelector(`.vb-aba[data-v="${v}"]`).click(),a);await p.waitForTimeout(300);
  const h=await p.evaluate(()=>{const s=document.querySelector('.vb-pop .vb-corpo, .vb-pop');return s.scrollHeight});
  await p.evaluate(()=>{const s=[...document.querySelectorAll('.vb-pop *')].find(e=>e.scrollHeight>e.clientHeight+20&&/auto|scroll/.test(getComputedStyle(e).overflowY));window.__s=s});
  for(let i=0;i<4;i++){await p.screenshot({path:`${OUT}viab-${a}_${dev}_${tema}_${i}.png`});const fim=await p.evaluate(()=>{const s=window.__s;if(!s)return true;const y=s.scrollTop;s.scrollTop+=s.clientHeight-120;return s.scrollTop===y});if(fim)break;await p.waitForTimeout(150)}
 }
 await ctx.close()}
await b.close()})();
