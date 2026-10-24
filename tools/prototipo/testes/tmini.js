// Mini-mapa da Visão geral: sem link Google Maps nem coordenadas; "Ver no mapa" só no celular; roda rola a página,
// Shift + roda dá zoom; dois cliques (desktop) fora da poligonal abrem o Mapa centrado no ponto. Prints em saida/t_mini.
const TMP=require('path').join(__dirname,'..','saida')+'/';const OUT=TMP+'t_mini/';require('fs').mkdirSync(OUT,{recursive:true});
const {chromium,devices}=require('playwright');
const L=require('path').join(__dirname,'..','libs','l')+'/';const F=require('path').join(__dirname,'..','..','..','docs','prototipo.html');
(async()=>{const b=await chromium.launch();const errs=[];const ok=(c,m)=>{console.log((c?'ok  ':'FALHA ')+m);if(!c)errs.push(m)};
for(const modo of ['desktop','celular']){
const ctx=await b.newContext(modo==='desktop'?{viewport:{width:1440,height:900},deviceScaleFactor:2}:{...devices['Pixel 7']});
await ctx.route('**/*',r=>{const u=r.request().url();if(u.startsWith('file://'))return r.fulfill({path:F,contentType:'text/html; charset=utf-8'});if(/leaflet.js|jszip/.test(u))return r.fulfill({path:L+(u.includes('leaflet')?'leaflet.js':'jszip.min.js'),contentType:'application/javascript'});if(/cartocdn|openstreetmap|arcgisonline/.test(u))return r.fulfill({path:require('path').join(__dirname,'tile.png'),contentType:'image/png'});return r.abort()});
const p=await ctx.newPage();p.on('pageerror',e=>errs.push(modo+': '+e.message));
await p.goto('file:///x/a.html');await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForTimeout(400);
await p.evaluate(()=>document.querySelector('[data-a=nav][data-r=terrenos]').click());await p.waitForTimeout(200);
await p.evaluate(()=>[...document.querySelectorAll('[data-a=abrir]')].find(x=>x.textContent.includes('Barão')).click());await p.waitForTimeout(900);
const sec=await p.$('.g-loc');await sec.scrollIntoViewIfNeeded();await p.evaluate(()=>scrollBy(0,-120));await p.waitForTimeout(300);
const txt=await sec.innerText();ok(!/Google Maps/.test(txt),modo+' sem link Google Maps');ok(/Ver no mapa/.test(txt)===(modo==='celular'),modo+(modo==='celular'?' com':' sem')+' Ver no mapa');ok(!/-23[,.]\d/.test(txt)&&!/aproximada/i.test(txt),modo+' sem coordenadas nem precisão');console.log('   pé:',JSON.stringify(await p.$eval('.g-loc',x=>x.querySelector('.mini-pe')?.innerText||'(sem pé)')));
await sec.screenshot({path:OUT+modo+'_loc.png'});
const larg=()=>p.$eval('#mini-mapa',m=>{const e=m.querySelector('.leaflet-overlay-pane path');return e?Math.round(e.getBoundingClientRect().width):0});
const mm=await p.$eval('#mini-mapa',m=>{const r=m.getBoundingClientRect();return {x:r.x+r.width*0.7,y:r.y+r.height*0.7}});
if(modo==='desktop'){const w0=await larg(),y0=await p.evaluate(()=>scrollY);
  await p.mouse.move(mm.x,mm.y);await p.mouse.wheel(0,200);await p.waitForTimeout(500);
  ok(await p.evaluate(()=>scrollY)>y0,'roda sozinha rola a página');ok(await larg()===w0,'roda sozinha não dá zoom');
  const m2=await p.$eval('#mini-mapa',m=>{const r=m.getBoundingClientRect();return {x:r.x+r.width*0.5,y:r.y+r.height*0.5}});await p.mouse.move(m2.x,m2.y);
  const y1=await p.evaluate(()=>scrollY);await p.keyboard.down('Shift');await p.mouse.wheel(0,-120);await p.waitForTimeout(600);await p.keyboard.up('Shift');
  ok(await larg()>w0*1.5,'Shift + roda para cima aproxima ('+w0+' → '+await larg()+')');ok(await p.evaluate(()=>scrollY)===y1,'Shift + roda não rola a página');
  const w1=await larg();await p.keyboard.down('Shift');await p.mouse.wheel(0,120);await p.waitForTimeout(600);await p.keyboard.up('Shift');ok(await larg()<w1*0.7,'Shift + roda para baixo afasta');
  /* fora da poligonal (canto de cima à direita): sobre ela, os dois cliques editam (ver tminied.js) */
  const fora=await p.$eval('#mini-mapa',m=>{const r=m.getBoundingClientRect();return {x:r.right-24,y:r.y+24}});await p.mouse.dblclick(fora.x,fora.y);}
else{await p.touchscreen.tap(mm.x,mm.y);await p.waitForTimeout(600);ok(!(await p.$('.mapa-area #mapa')),'celular: toque no mini-mapa não sai da ficha');await p.tap('.mini-ir')}
await p.waitForTimeout(1200);
ok(await p.evaluate(()=>!!document.querySelector('.mapa-area #mapa')),modo+' abriu a página Mapa');
ok(await p.evaluate(()=>!!document.querySelector('#mapa .leaflet-marker-icon.pin.sel')),modo+' terreno selecionado');
const pin=await p.evaluate(()=>{const m=document.querySelector('#mapa').getBoundingClientRect(),e=document.querySelector('#mapa .leaflet-marker-icon.pin.sel').getBoundingClientRect();return {dx:Math.round(e.x+e.width/2-(m.x+m.width/2)),dy:Math.round(e.bottom-(m.y+m.height/2)),dentro:e.x>m.x&&e.right<m.right&&e.y>m.y&&e.bottom<m.bottom}});
console.log('   pino em relação ao centro do mapa:',JSON.stringify(pin));if(modo==='desktop')ok(pin.dentro,modo+' terreno visível no mapa');
await p.screenshot({path:OUT+modo+'_mapa.png'});await ctx.close()}
console.log('ERROS',JSON.stringify(errs));await b.close()})();
