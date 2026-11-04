/* Mapa: a lupa e o clique no pino abrem a ficha completa na gaveta da direita, com o terreno aceso */
const {chromium}=require('playwright');const path=require('path');
const L=path.join(__dirname,'..','libs','l')+'/';const F=path.join(__dirname,'..','saida','bkm-terrenos.html');const SHOT=process.env.SHOT||'';
let falhas=0;const ok=(c,m)=>{console.log((c?'ok  ':'FALHOU ')+m);if(!c)falhas++};
(async()=>{const b=await chromium.launch();const erros=[];const ctx=await b.newContext({viewport:{width:1440,height:900},deviceScaleFactor:SHOT?2:1});
await ctx.route('**/*',r=>{const u=r.request().url();if(u.startsWith('file://'))return r.fulfill({path:F,contentType:'text/html; charset=utf-8'});if(/leaflet.js|jszip/.test(u))return r.fulfill({path:L+(u.includes('leaflet')?'leaflet.js':'jszip.min.js'),contentType:'application/javascript'});
  if(/cartocdn|openstreetmap|arcgisonline/.test(u))return r.fulfill({path:path.join(__dirname,'tile.png'),contentType:'image/png'});return r.abort()});
const p=await ctx.newPage();p.on('pageerror',e=>erros.push(e.message));await p.goto('file:///x/a.html');await p.evaluate(()=>{localStorage.clear();sessionStorage.clear()});await p.reload();await p.waitForTimeout(300);
await p.evaluate(()=>document.querySelector('[data-a=nav][data-r=mapa]').click());await p.waitForTimeout(800);
const id=await p.$eval('.mapa-lado .mp-it',e=>e.dataset.id),cod=await p.$eval('.mapa-lado .mp-it .mp-cod',e=>e.textContent);
await p.click(`.mapa-lado .mp-it[data-id="${id}"] [data-a=fs-abrir]`);await p.waitForTimeout(700);
ok(!!await p.$('#tgav.tgav-mapa'),'lupa abre a gaveta da ficha completa');ok(!await p.$('#ficha-sheet'),'sem a gaveta resumida');
ok(await p.$eval('#tgav .tgav-h .num',e=>e.textContent)===cod,'gaveta com o terreno clicado ('+cod+')');
ok(await p.$$eval('#tgav .fi-aba, #tgav [data-a=fi-aba], #tgav .fi-abas-w button',x=>x.length)>3,'ficha completa com as abas');
ok(!!await p.$('#mapa .leaflet-container, #mapa.leaflet-container'),'mapa continua atrás');
ok(await p.$eval(`.mapa-lado .mp-it[data-id="${id}"]`,e=>e.classList.contains('sel')),'linha acesa na lista');
ok(await p.$$eval('.leaflet-marker-icon.pin.sel',x=>x.length)===1,'pino aceso no mapa');
ok(/\/mapa\/[A-Z]\d{3}\/ficha/.test(await p.evaluate(()=>location.hash)),'endereço /mapa/'+cod+'/ficha');
const g=await p.$eval('#tgav',e=>e.getBoundingClientRect()),l=await p.$eval('.mapa-lado',e=>e.getBoundingClientRect());ok(g.left>l.right+200&&g.right>=1439,`gaveta à direita, lista e parte do mapa visíveis (${Math.round(g.left)} px)`);
if(SHOT)await p.screenshot({path:SHOT+'/6_gaveta_lupa.png'});
// clique noutro pino troca a gaveta
const outro=await p.evaluate(id=>{const els=[...document.querySelectorAll('.leaflet-marker-icon.pin:not(.sel)')];const g=document.querySelector('#tgav').getBoundingClientRect();const e=els.find(e=>{const r=e.getBoundingClientRect();return r.right<g.left-10&&r.left>document.querySelector('.mapa-lado').getBoundingClientRect().right+10&&r.top>140&&r.bottom<880});if(!e)return null;const r=e.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height-14]},id);
if(outro){await p.mouse.click(outro[0],outro[1]);await p.waitForTimeout(800);const c2=await p.$eval('#tgav .tgav-h .num',e=>e.textContent);ok(c2!==cod,'clique noutro pino troca a gaveta ('+c2+')');
  ok(await p.$$eval('.leaflet-marker-icon.pin.sel',x=>x.length)===1,'só o pino novo aceso')}else ok(false,'sem outro pino visível para clicar');
await p.keyboard.press('Escape');await p.waitForTimeout(400);ok(!await p.$('#tgav')&&await p.evaluate(()=>document.body.dataset.rota)==='mapa','Esc fecha e fica no Mapa');
// pino com a gaveta fechada abre a gaveta
const pin=await p.$('.leaflet-marker-icon.pin');const bb=await pin.boundingBox();await p.mouse.click(bb.x+bb.width/2,bb.y+bb.height-14);await p.waitForTimeout(800);ok(!!await p.$('#tgav.tgav-mapa'),'clique no pino abre a gaveta');
if(SHOT)await p.screenshot({path:SHOT+'/7_gaveta_pino.png'});
// link direto
await p.goto('file:///x/a.html#/mapa/'+cod+'/ficha');await p.waitForTimeout(900);ok(await p.$eval('#tgav .tgav-h .num',e=>e.textContent).catch(()=>'')===cod,'link /mapa/'+cod+'/ficha abre a gaveta');
ok(!erros.length,'sem erros: '+erros.join(' | '));await b.close();process.exit(falhas?1:0)})();
