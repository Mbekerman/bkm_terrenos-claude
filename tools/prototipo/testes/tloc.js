const TMP=require('path').join(__dirname,'..','saida')+'/';require('fs').mkdirSync(TMP+'t_single',{recursive:true});
const {chromium}=require('playwright');
const L=require('path').join(__dirname,'..','libs','l')+'/';const F=require('path').join(__dirname,'..','saida','bkm-terrenos.html');
(async()=>{const b=await chromium.launch();
for(const w of [1920,1536,1440,1280,1180]){const ctx=await b.newContext({viewport:{width:w,height:900},deviceScaleFactor:1.5});
await ctx.route('**/*',r=>{const u=r.request().url();if(u.startsWith('file://'))return r.fulfill({path:F,contentType:'text/html; charset=utf-8'});if(/leaflet.js|jszip/.test(u))return r.fulfill({path:L+(u.includes('leaflet')?'leaflet.js':'jszip.min.js'),contentType:'application/javascript'});if(/cartocdn|openstreetmap|arcgisonline/.test(u))return r.fulfill({path:require('path').join(__dirname,'tile.png'),contentType:'image/png'});return r.abort()});
const p=await ctx.newPage();await p.goto('file:///x/a.html');await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForTimeout(300);
await p.evaluate(()=>document.querySelector('[data-a=nav][data-r=terrenos]').click());await p.waitForTimeout(100);
await p.evaluate(()=>[...document.querySelectorAll('[data-a=abrir]')].find(x=>x.textContent.includes('Barão')).click());await p.waitForTimeout(400);
// simula o botão Street View do Google
await p.evaluate(()=>{const s=document.querySelector('.mini-pe > span:last-child');const b=document.createElement('button');b.className='btn sm';b.textContent='Street View';s.prepend(b);const sec=[...document.querySelectorAll('.sec')].find(x=>x.textContent.includes('Localização'));const h=sec.querySelector('.sec-h');if(!h.querySelector('a')){const a=document.createElement('a');a.className='btn text sm';a.textContent='Google Maps';h.appendChild(a)}});
const r=await p.evaluate(()=>{const g=document.querySelector('.geral');const cols=getComputedStyle(g).gridTemplateColumns.split(' ').length;const sec=[...document.querySelectorAll('.sec')].find(x=>x.textContent.includes('Localização'));const B=sec.getBoundingClientRect();let vaza=[];sec.querySelectorAll('*').forEach(e=>{const q=e.getBoundingClientRect();if(q.width&&q.right>B.right+1)vaza.push(e.tagName+'.'+e.className.toString().slice(0,25)+'+'+Math.round(q.right-B.right))});
  return {cols,main:Math.round(document.querySelector('.ficha-main').getBoundingClientRect().width),pn:Math.round(document.querySelector('.pn')?.getBoundingClientRect().width||0),loc:Math.round(B.width),vaza,side:Math.round(document.querySelector('.side').getBoundingClientRect().width)}});
console.log(w,JSON.stringify(r));
await p.evaluate(()=>{[...document.querySelectorAll('.sec')].find(x=>x.textContent.includes('Informações do terreno')).scrollIntoView({block:'start'});scrollBy(0,-100)});await p.waitForTimeout(150);
await p.screenshot({path:`${TMP}t_single/geral_${w}.png`});await ctx.close()}
await b.close()})();
