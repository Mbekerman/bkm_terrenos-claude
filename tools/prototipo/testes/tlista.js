// Mapa sem balão; linha com etapa; Pontos de interesse na legenda: clicar no pino destaca o terreno na lista lateral (número do pino, nome, área, lupa);
// no celular aparece o cartão sobre o mapa; a lupa abre a ficha. Prints em saida/t_lista.
const TMP=require('path').join(__dirname,'..','saida')+'/';const OUT=TMP+'t_lista/';require('fs').mkdirSync(OUT,{recursive:true});
const {chromium,devices}=require('playwright');
const L=require('path').join(__dirname,'..','libs','l')+'/';const F=require('path').join(__dirname,'..','..','..','docs','prototipo.html');
(async()=>{const b=await chromium.launch();const errs=[];const ok=(c,m)=>{console.log((c?'ok  ':'FALHA ')+m);if(!c)errs.push(m)};
for(const [modo,tema] of [['desktop','claro'],['desktop','escuro'],['celular','claro']]){const tag=modo+'_'+tema;
const ctx=await b.newContext(modo==='desktop'?{viewport:{width:1440,height:900},deviceScaleFactor:2}:{...devices['Pixel 7']});
await ctx.route('**/*',r=>{const u=r.request().url();if(u.startsWith('file://'))return r.fulfill({path:F,contentType:'text/html; charset=utf-8'});if(/leaflet.js|jszip/.test(u))return r.fulfill({path:L+(u.includes('leaflet')?'leaflet.js':'jszip.min.js'),contentType:'application/javascript'});if(/cartocdn|openstreetmap|arcgisonline/.test(u))return r.fulfill({path:require('path').join(__dirname,'tile.png'),contentType:'image/png'});return r.abort()});
const p=await ctx.newPage();p.on('pageerror',e=>errs.push(tag+': '+e.message));
await p.goto('file:///x/a.html');await p.evaluate(t=>{localStorage.clear();localStorage.setItem('bkm-terrenos-tema',t)},tema);await p.reload();await p.waitForTimeout(400);
await p.evaluate(()=>document.querySelector('[data-a=nav][data-r=mapa]').click());await p.waitForTimeout(900);
const linhas=await p.$$eval('.mp-it',e=>e.map(x=>x.innerText.replace(/\s+/g,' ').trim()));console.log('   linhas:',JSON.stringify(linhas.slice(0,3)));
ok(linhas.length>0&&!linhas.some(l=>/R\$/.test(l))&&linhas.some(l=>/m² · Negociação/.test(l)),tag+' linhas com número, nome, área e etapa');
ok(!(await p.$('.mp-acoes [data-a=mp-poi]')),tag+' sem botão Pontos de interesse na barra');
await p.evaluate(()=>{const l=document.querySelector('.mp-legenda');if(l)l.open=true;const b=document.querySelector('#mp-leg [data-a=mp-arv]');if(b&&b.getAttribute('aria-expanded')!=='true')b.click()});await p.waitForTimeout(200);
const leg=await p.$eval('#mp-leg',x=>x.textContent.replace(/\s+/g,' '));ok(/Comprado\s*\d+.*Perdido\s*\d+.*Pontos de interesse\s*\d+/.test(leg),tag+' legenda: '+leg.slice(-60));
if(modo==='desktop'){const n0=await p.$$eval('#mapa .poi',e=>e.length);await p.click('#mp-leg [data-a=mp-poi]');await p.waitForTimeout(300);const n1=await p.$$eval('#mapa .poi',e=>e.length);
  await p.screenshot({path:OUT+tag+'_legenda_poi_off.png',clip:{x:640,y:520,width:300,height:380}});await p.click('#mp-leg [data-a=mp-poi]');await p.waitForTimeout(300);const n2=await p.$$eval('#mapa .poi',e=>e.length);
  ok(n0>0&&n1===0&&n2===n0,tag+' legenda liga/desliga os pontos ('+n0+'→'+n1+'→'+n2+')')}
// clicar no pino do Itapura
await p.evaluate(()=>document.querySelector('.mapa').scrollIntoView({block:'start'}));await p.waitForTimeout(300);
const alvo=await p.evaluate(()=>{const pins=[...document.querySelectorAll('#mapa .leaflet-marker-icon.pin')];const e=pins.find(x=>x.title==='Terreno Rua Itapura')||pins[0];e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,t:e.title}});
await p.waitForTimeout(300);const a2=await p.evaluate(t=>{const e=[...document.querySelectorAll('#mapa .leaflet-marker-icon.pin')].find(x=>x.title===t);const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}},alvo.t);
if(modo==='desktop')await p.mouse.click(a2.x,a2.y);else await p.touchscreen.tap(a2.x,a2.y);await p.waitForTimeout(600);
ok(!(await p.$('.leaflet-popup')),tag+' sem balão');
const sel=await p.$eval('#mp-lista .mp-it.sel',x=>x.querySelector('.t1').textContent).catch(()=>null);ok(sel===alvo.t,tag+' linha destacada: '+sel);
ok(await p.evaluate(t=>[...document.querySelectorAll('#mapa .leaflet-marker-icon.pin.sel')].map(x=>x.title).join()===t,alvo.t),tag+' só esse pino aceso');
if(modo==='desktop'){ok(await p.evaluate(()=>{const l=document.querySelector('.mapa-lado').getBoundingClientRect(),r=document.querySelector('#mp-lista .mp-it.sel').getBoundingClientRect();return r.top>=l.top&&r.bottom<=l.bottom}),tag+' linha visível na lista');
  await p.screenshot({path:OUT+tag+'_sel.png'})}
else{const c=await p.$eval('#mp-cartao',x=>x.innerText.replace(/\s+/g,' ').trim()).catch(()=>'');ok(c.includes(alvo.t),tag+' cartão sobre o mapa: '+c);await p.screenshot({path:OUT+tag+'_sel.png'})}
if(modo==='celular')ok(await p.$eval('.fab',x=>getComputedStyle(x).display==='none'),tag+' sem o botão + Novo terreno no Mapa');
// lupa abre a ficha num painel sobre o mapa, sem o mapa dentro
await p.click((modo==='desktop'?'#mp-lista':'#mp-cartao')+' .mp-it.sel .mp-lupa');await p.waitForTimeout(800);
const fs=await p.evaluate(()=>{const e=document.querySelector('#ficha-sheet');if(!e)return null;return {h:e.querySelector('h2').textContent,mapaDentro:!!e.querySelector('#mini-mapa,.g-loc'),lapis:[...e.querySelectorAll('.kv-ed')].filter(x=>x.offsetParent).length,mapa:!!document.querySelector('#mapa .leaflet-pane'),secoes:[...e.querySelectorAll('.sec-h h2')].map(x=>x.textContent.trim()).join(' | ')}});
console.log('   painel:',JSON.stringify(fs));ok(fs&&fs.h===alvo.t&&!fs.mapaDentro&&fs.lapis===0&&fs.mapa,tag+' lupa abre a ficha em painel, sem mapa, mapa continua atrás');
await p.screenshot({path:OUT+tag+'_ficha.png'});
await p.click('#ficha-sheet [data-a=fs-fechar]');await p.waitForTimeout(300);ok(!(await p.$('#ficha-sheet')),tag+' fechar tira o painel');
await p.click((modo==='desktop'?'#mp-lista':'#mp-cartao')+' .mp-it.sel .mp-lupa');await p.waitForTimeout(500);
if(modo==='desktop'){await p.keyboard.press('Escape');await p.waitForTimeout(300);ok(!(await p.$('#ficha-sheet')),tag+' Esc fecha o painel');await p.click('#mp-lista .mp-it.sel .mp-lupa');await p.waitForTimeout(500)}
await p.click('#ficha-sheet [data-a=abrir]');await p.waitForTimeout(800);
ok(await p.evaluate(t=>document.querySelector('h1')?.textContent.includes(t),alvo.t)&&!(await p.$('#ficha-sheet')),tag+' Abrir ficha completa vai para a ficha e fecha o painel');
await ctx.close()}
console.log('ERROS',JSON.stringify(errs));await b.close()})();
