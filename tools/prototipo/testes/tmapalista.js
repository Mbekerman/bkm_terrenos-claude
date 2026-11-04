/* lista do mapa: largura arrastável (mínima = só as bolinhas), bolinha com o código do terreno e concorrência em quadrado */
const {chromium}=require('playwright');const path=require('path');
const L=path.join(__dirname,'..','libs','l')+'/';const F=path.join(__dirname,'..','saida','bkm-terrenos.html'),D=path.join(__dirname,'..','saida','dados')+'/';
const SHOT=process.env.SHOT||'';
let falhas=0;const ok=(c,m)=>{console.log((c?'ok  ':'FALHOU ')+m);if(!c)falhas++};
(async()=>{const b=await chromium.launch();const erros=[];
const rota=r=>{const u=r.request().url();if(u.startsWith('file://')){const m=u.match(/\/dados\/([^?#]+)/);return m?r.fulfill({path:D+m[1],contentType:'application/json'}):r.fulfill({path:F,contentType:'text/html; charset=utf-8'})}
  if(/leaflet.js|jszip/.test(u))return r.fulfill({path:L+(u.includes('leaflet')?'leaflet.js':'jszip.min.js'),contentType:'application/javascript'});
  if(/cartocdn|openstreetmap|arcgisonline/.test(u))return r.fulfill({path:path.join(__dirname,'tile.png'),contentType:'image/png'});return r.abort()};
for(const tema of ['claro','escuro']){
const ctx=await b.newContext({viewport:{width:1440,height:900},deviceScaleFactor:SHOT?2:1});await ctx.route('**/*',rota);
const p=await ctx.newPage();p.on('pageerror',e=>erros.push(e.message));await p.goto('file:///x/a.html');
await p.evaluate(t=>{localStorage.clear();sessionStorage.clear();localStorage.setItem('bkm-terrenos-tema',t)},tema);await p.reload();await p.waitForTimeout(300);
await p.evaluate(()=>document.querySelector('[data-a=nav][data-r=mapa]').click());await p.waitForTimeout(1500);
const cods=await p.$$eval('.mapa-lado .mp-it .mp-cod',x=>x.map(e=>e.textContent));
ok(cods.length>0&&cods.every(c=>/^[A-HJ-NP-Z]\d{3}$/.test(c)),`${tema}: bolinhas com o código do terreno (${cods.slice(0,4).join(', ')}…)`);
const cores=await p.$$eval('.mapa-lado .mp-it .mp-cod',x=>new Set(x.map(e=>e.style.background)).size);ok(cores>1,`${tema}: cores diferentes pelo nível (${cores})`);
const h=await p.$('.mp-redim');ok(!!h,'alça entre a lista e o mapa');
ok(await h.evaluate(e=>getComputedStyle(e).cursor)==='grab',`cursor de mãozinha na alça`);
const w0=await p.$eval('.mapa-lado',e=>e.getBoundingClientRect().width);const bb=await h.boundingBox();
if(tema==='claro'&&SHOT)await p.screenshot({path:SHOT+'/1_lista_padrao.png'});
await p.mouse.move(bb.x+8,bb.y+bb.height/2);await p.mouse.down();await p.mouse.move(bb.x+208,bb.y+bb.height/2,{steps:6});
ok(await p.evaluate(()=>document.body.classList.contains('mp-arrastando')),'arrastando: mão fechada');
await p.mouse.up();const w1=await p.$eval('.mapa-lado',e=>e.getBoundingClientRect().width);ok(Math.abs(w1-w0-200)<4,`puxar 200 px alarga a lista (${Math.round(w0)} → ${Math.round(w1)})`);
if(SHOT)await p.screenshot({path:SHOT+`/2_lista_larga_${tema}.png`});
const bb2=await h.boundingBox();await p.mouse.move(bb2.x+8,bb2.y+300);await p.mouse.down();await p.mouse.move(bb2.x-900,bb2.y+300,{steps:6});await p.mouse.up();await p.waitForTimeout(200);
const wm=await p.$eval('.mapa-lado',e=>e.getBoundingClientRect().width);ok(wm>=70&&wm<=80,`mínima: ${Math.round(wm)} px`);
const est=await p.$$eval('.mapa-lado .mp-it',x=>x.map(e=>{const c=e.querySelector('.mp-cod').getBoundingClientRect(),l=e.closest('.mapa-lado').getBoundingClientRect();return c.width>0&&c.left>=l.left-1&&c.right<=l.right+1&&!e.querySelector('.mp-it-t').offsetWidth}));
ok(est.length&&est.every(Boolean),'na mínima as bolinhas cabem inteiras e o nome some');
ok(await p.$eval('.mapa-lado',e=>e.scrollWidth<=e.clientWidth+1),'sem rolagem lateral na lista estreita');
if(SHOT)await p.screenshot({path:SHOT+`/3_lista_minima_${tema}.png`});
await p.reload();await p.waitForTimeout(300);await p.evaluate(()=>document.querySelector('[data-a=nav][data-r=mapa]').click());await p.waitForTimeout(500);
ok(Math.abs(await p.$eval('.mapa-lado',e=>e.getBoundingClientRect().width)-wm)<2,'largura guardada ao recarregar');
const mpPad=360;await p.dblclick('.mp-redim');ok(Math.abs(await p.$eval('.mapa-lado',e=>e.getBoundingClientRect().width)-mpPad)<2,'dois cliques voltam ao padrão');
await p.focus('.mp-redim');await p.keyboard.press('ArrowRight');ok(Math.abs(await p.$eval('.mapa-lado',e=>e.getBoundingClientRect().width)-mpPad-20)<2,'seta do teclado muda a largura');
// concorrência: quadrado com prédio na legenda (e no canvas do Leaflet sem erro)
await p.waitForTimeout(1500);ok(await p.$eval('.lg-i[data-a=mp-merc] .mk-b',e=>getComputedStyle(e).borderRadius!=='50%'&&!!e.querySelector('svg')).catch(()=>false),'legenda da concorrência com quadrado e prédio');
if(SHOT){await p.waitForTimeout(800);await p.screenshot({path:SHOT+`/4_concorrencia_${tema}.png`})}
await ctx.close()}
// celular: sem alça, lista embaixo do mapa
const c2=await b.newContext({viewport:{width:390,height:844},hasTouch:true});await c2.route('**/*',rota);const m=await c2.newPage();m.on('pageerror',e=>erros.push(e.message));
await m.goto('file:///x/a.html#/mapa');await m.waitForTimeout(800);ok(await m.$eval('.mp-redim',e=>getComputedStyle(e).display==='none'),'celular: sem alça');
ok(await m.$$eval('.mapa-lado .mp-cod',x=>x.length>0&&x.every(e=>e.getBoundingClientRect().width>=40)),'celular: bolinhas com o código');
if(SHOT)await m.screenshot({path:SHOT+'/5_celular.png',fullPage:false});
ok(!erros.length,'sem erros: '+erros.join(' | '));await b.close();process.exit(falhas?1:0)})();
