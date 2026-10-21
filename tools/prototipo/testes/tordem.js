const TMP=require('path').join(__dirname,'..','saida')+'/';require('fs').mkdirSync(TMP+'t_single',{recursive:true});
const {chromium}=require('playwright');
const L=require('path').join(__dirname,'..','libs','l')+'/';const F=require('path').join(__dirname,'..','saida','bkm-terrenos.html');
(async()=>{const b=await chromium.launch();const erros=[];
for(const [w,h] of [[1440,900],[1280,900],[1024,768],[390,844]]){const ctx=await b.newContext({viewport:{width:w,height:h},deviceScaleFactor:1.5,isMobile:w<700,hasTouch:w<700});
await ctx.route('**/*',r=>{const u=r.request().url();if(u.startsWith('file://'))return r.fulfill({path:F,contentType:'text/html; charset=utf-8'});if(/leaflet.js|jszip/.test(u))return r.fulfill({path:L+(u.includes('leaflet')?'leaflet.js':'jszip.min.js'),contentType:'application/javascript'});if(/cartocdn|openstreetmap|arcgisonline/.test(u))return r.fulfill({path:require('path').join(__dirname,'tile.png'),contentType:'image/png'});return r.abort()});
const p=await ctx.newPage();p.on('pageerror',e=>erros.push(e.message));await p.goto('file:///x/a.html');await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForTimeout(300);
await p.evaluate(()=>document.querySelector('[data-a=nav][data-r=terrenos]').click());await p.waitForTimeout(100);
await p.evaluate(()=>[...document.querySelectorAll('[data-a=abrir]')].find(x=>x.textContent.includes('Barão')).click());await p.waitForTimeout(500);
const r=await p.evaluate(()=>{const secs=[...document.querySelectorAll('.geral .sec')].map(s=>({t:s.querySelector('h2')?.textContent.trim().slice(0,22),y:Math.round(s.getBoundingClientRect().top),x:Math.round(s.getBoundingClientRect().left)}));secs.sort((a,b)=>a.y-b.y||a.x-b.x);return secs.map(s=>s.t).join(' | ')});
console.log(w,r);
await p.evaluate(()=>{document.querySelector('.geral').scrollIntoView({block:'start'});scrollBy(0,-90)});await p.waitForTimeout(400);await p.screenshot({path:`${TMP}t_single/ordem_${w}.png`});await ctx.close()}
console.log('ERROS',erros);await b.close()})();
