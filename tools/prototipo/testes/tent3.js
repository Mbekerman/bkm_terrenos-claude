const TMP=require('path').join(__dirname,'..','saida')+'/';require('fs').mkdirSync(TMP+'t_ent',{recursive:true});
const {chromium}=require('playwright');
const L=require('path').join(__dirname,'..','libs','l')+'/';const F=require('path').join(__dirname,'..','saida','bkm-terrenos.html');
(async()=>{const b=await chromium.launch();const errs=[];const ctx=await b.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1.5});
await ctx.route('**/*',r=>{const u=r.request().url();if(u.startsWith('file://'))return r.fulfill({path:F,contentType:'text/html; charset=utf-8'});if(/leaflet.js|jszip/.test(u))return r.fulfill({path:L+(u.includes('leaflet')?'leaflet.js':'jszip.min.js'),contentType:'application/javascript'});if(/cartocdn|openstreetmap|arcgisonline/.test(u))return r.fulfill({path:require('path').join(__dirname,'tile.png'),contentType:'image/png'});return r.abort()});
const p=await ctx.newPage();p.on('pageerror',e=>errs.push(e.message));await p.goto('file:///x/a.html');await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForTimeout(300);
await p.evaluate(()=>document.querySelector('[data-a=nav][data-r=terrenos]').click());await p.waitForTimeout(100);
await p.evaluate(()=>[...document.querySelectorAll('[data-a=abrir]')].find(x=>x.textContent.includes('Barão')).click());await p.waitForTimeout(500);
await p.click('[data-a=ent-add-ponto]');await p.waitForTimeout(600);
console.log('rota:',await p.evaluate(()=>document.body.dataset.rota),await p.evaluate(()=>document.querySelector('.mp-modo')?.innerText),await p.evaluate(()=>!!document.querySelector('#mapa .leaflet-container, #mapa.leaflet-container')));await p.screenshot({path:TMP+'t_ent/mapa_poi.png'});
const box=await (await p.$('#mapa')).boundingBox();await p.mouse.click(box.x+box.width-200,box.y+box.height/2+150);await p.waitForTimeout(400);
await p.fill('#modal [name=nome]','Sede BKM (teste)');await p.click('#modal .df .btn.primary');await p.waitForTimeout(600);
console.log('voltou:',await p.evaluate(()=>document.body.dataset.rota),await p.evaluate(()=>document.querySelector('h1')?.innerText));
console.log('quadro:',await p.$eval('#ent-card .ent-emp',x=>x.innerText.replace(/\s+/g,' ')));
// Leitura sem botão
await p.evaluate(()=>[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='Leitura').click());await p.waitForTimeout(200);
console.log('leitura botão visível:',await p.evaluate(()=>{const b=document.querySelector('[data-a=ent-add-ponto]');return !!(b&&b.offsetParent)}));
console.log('ERROS',errs);await b.close()})();
