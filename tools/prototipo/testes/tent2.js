const TMP=require('path').join(__dirname,'..','saida')+'/';require('fs').mkdirSync(TMP+'t_ent',{recursive:true});
const {chromium}=require('playwright');const fs=require('fs');
const L=require('path').join(__dirname,'..','libs','l')+'/';const OUT=TMP+'t_ent/';
const html=fs.readFileSync(require('path').join(__dirname,'..','saida','bkm-terrenos.html'),'utf8').replace('<title>','<meta name="gmaps-key" content="AIzaTESTETESTETESTETESTETESTE0000"><title>');
(async()=>{const b=await chromium.launch();const errs=[];const ctx=await b.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1.5});const modos=[];
await ctx.route('**/*',async r=>{const u=r.request().url();if(u.startsWith('file://'))return r.fulfill({body:html,contentType:'text/html; charset=utf-8'});
  if(u.includes('maps.googleapis.com/maps/api/js'))return r.fulfill({path:require('path').join(__dirname,'fake_gmaps2.js'),contentType:'application/javascript'});
  if(u.includes('computeRouteMatrix')){const q=JSON.parse(r.request().postData());modos.push(q.travelMode+':'+q.destinations.length);
    return r.fulfill({contentType:'application/json',body:JSON.stringify(q.destinations.map((d,i)=>{const la=d.waypoint.location.latLng;const k=Math.hypot(la.latitude+23.585,la.longitude+46.581)*111000;const m=Math.round(k*(q.travelMode==='WALK'?1.3:1.5));return {originIndex:0,destinationIndex:i,distanceMeters:m,duration:Math.round(q.travelMode==='WALK'?m/1.3:m/8)+'s',condition:'ROUTE_EXISTS'}}))})}
  if(/leaflet.js|jszip/.test(u))return r.fulfill({path:L+(u.includes('leaflet')?'leaflet.js':'jszip.min.js'),contentType:'application/javascript'});return r.abort()});
const p=await ctx.newPage();p.on('pageerror',e=>errs.push(e.message));await p.goto('file:///x/a.html');await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForTimeout(800);
const abrir=async()=>{await p.evaluate(()=>document.querySelector('[data-a=nav][data-r=terrenos]').click());await p.waitForTimeout(100);await p.evaluate(()=>[...document.querySelectorAll('[data-a=abrir]')].find(x=>x.textContent.includes('Barão')).click());await p.waitForTimeout(1200);await p.evaluate(()=>document.querySelector('.fi-abas [data-t="entorno"]').click());await p.waitForTimeout(300);};
await abrir();
console.log('matrizes:',modos.join(' '));
console.log('quadro:',await p.$eval('#ent-card',x=>x.innerText.replace(/\s+/g,' ')));
await p.evaluate(()=>document.getElementById('ent-card').scrollIntoView({block:'start'}));await p.waitForTimeout(150);
const el=await p.$('#ent-card');await el.screenshot({path:OUT+'quadro_empresa.png'});
// adicionar ponto
await p.click('[data-a=ent-add-ponto]');await p.waitForTimeout(500);
console.log('rota:',await p.evaluate(()=>document.body.dataset.rota),'banner:',await p.evaluate(()=>document.querySelector('.mp-modo')?.innerText));
const box=await (await p.$('#mapa')).boundingBox();await p.mouse.click(box.x+box.width/2+30,box.y+box.height/2+30);await p.waitForTimeout(300);
await p.fill('[name=nome]','Sede BKM (teste)');await p.click('.df .btn.primary');await p.waitForTimeout(1200);
console.log('voltou:',await p.evaluate(()=>document.body.dataset.rota),'| matrizes:',modos.join(' '));
console.log('quadro depois:',await p.$eval('#ent-card .ent-l',x=>x.innerText.replace(/\s+/g,' ')).catch(e=>'sem quadro'));
console.log('ERROS',errs);await b.close()})();
