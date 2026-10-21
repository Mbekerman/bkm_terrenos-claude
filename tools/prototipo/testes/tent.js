const TMP=require('path').join(__dirname,'..','saida')+'/';require('fs').mkdirSync(TMP+'t_ent',{recursive:true});
const {chromium}=require('playwright');const fs=require('fs');
const L=require('path').join(__dirname,'..','libs','l')+'/';const OUT=TMP+'t_ent/';fs.mkdirSync(OUT,{recursive:true});
const html=fs.readFileSync(require('path').join(__dirname,'..','saida','bkm-terrenos.html'),'utf8').replace('<title>','<meta name="gmaps-key" content="AIzaTESTETESTETESTETESTETESTE0000"><title>');
(async()=>{const b=await chromium.launch();const errs=[];
for(const modo of ['rotas','sem-rotas']){const ctx=await b.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1.5});let pedido=null;
await ctx.route('**/*',async r=>{const u=r.request().url();if(u.startsWith('file://'))return r.fulfill({body:html,contentType:'text/html; charset=utf-8'});
  if(u.includes('maps.googleapis.com/maps/api/js'))return r.fulfill({path:require('path').join(__dirname,'fake_gmaps2.js'),contentType:'application/javascript'});
  if(u.includes('computeRouteMatrix')){pedido=JSON.parse(r.request().postData());if(modo!=='rotas')return r.fulfill({status:403,body:'{}'});
    const d=[400,0,1700,1450];return r.fulfill({contentType:'application/json',body:JSON.stringify(pedido.destinations.map((_,i)=>({originIndex:0,destinationIndex:i,distanceMeters:d[i]??900,duration:(d[i]??900)/1.3+'s',condition:'ROUTE_EXISTS'})))})}
  if(/leaflet.js|jszip/.test(u))return r.fulfill({path:L+(u.includes('leaflet')?'leaflet.js':'jszip.min.js'),contentType:'application/javascript'});return r.abort()});
const p=await ctx.newPage();p.on('pageerror',e=>errs.push(e.message));await p.goto('file:///x/a.html');await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForTimeout(800);
await p.evaluate(()=>document.querySelector('[data-a=nav][data-r=terrenos]').click());await p.waitForTimeout(100);
await p.evaluate(()=>[...document.querySelectorAll('[data-a=abrir]')].find(x=>x.textContent.includes('Barão')).click());await p.waitForTimeout(1200);
console.log(modo,'buscas:',await p.evaluate(()=>window.__buscas),'destinos enviados:',pedido?.destinations.length,'modo:',pedido?.travelMode);
console.log(modo,'quadro:',await p.$eval('#ent-card',x=>x.innerText.replace(/\s+/g,' ')));
console.log(modo,'log:',await p.$eval('.pn-log',x=>x.innerText.replace(/\s+/g,' ')));
await p.evaluate(()=>{document.getElementById('ent-card').scrollIntoView({block:'center'})});await p.waitForTimeout(200);
await p.screenshot({path:OUT+modo+'.png'});
// reabrir não busca de novo
const n=await p.evaluate(()=>window.__buscas.length);await p.evaluate(()=>document.querySelector('[data-a=nav][data-r=terrenos]').click());await p.waitForTimeout(100);
await p.evaluate(()=>[...document.querySelectorAll('[data-a=abrir]')].find(x=>x.textContent.includes('Barão')).click());await p.waitForTimeout(600);
console.log(modo,'reabrir busca de novo?',(await p.evaluate(()=>window.__buscas.length))!==n);
await ctx.close()}
console.log('ERROS',errs);await b.close()})();
