// Mercado (camada de exemplo do monitor): pinos por situação, legenda liga e desliga, janela com os números e os grupos
// (regra de 2% por andar, 2% no mesmo andar, 6% sem andar ou com andar inconsistente), Esc e clique no mapa fecham,
// abrir a concorrência fecha a janela, escuro e celular. Prints em saida/t_merc.
const TMP=require('path').join(__dirname,'..','saida')+'/';const OUT=TMP+'t_merc/';require('fs').mkdirSync(OUT,{recursive:true});
const {chromium,devices}=require('playwright');
const L=require('path').join(__dirname,'..','libs','l')+'/';const F=require('path').join(__dirname,'..','..','..','docs','prototipo.html');
(async()=>{const b=await chromium.launch();const errs=[];const ok=(c,m)=>{console.log((c?'ok  ':'FALHA ')+m);if(!c)errs.push(m)};
for(const [modo,tema] of [['desktop','claro'],['desktop','escuro'],['celular','claro']]){const tag=modo+'_'+tema;
const ctx=await b.newContext(modo==='desktop'?{viewport:{width:1440,height:900},deviceScaleFactor:2}:{...devices['Pixel 7']});
await ctx.route('**/*',r=>{const u=r.request().url();if(u.startsWith('file://'))return r.fulfill({path:F,contentType:'text/html; charset=utf-8'});if(/leaflet.js|jszip/.test(u))return r.fulfill({path:L+(u.includes('leaflet')?'leaflet.js':'jszip.min.js'),contentType:'application/javascript'});if(/cartocdn|openstreetmap|arcgisonline/.test(u))return r.fulfill({path:require('path').join(__dirname,'tile.png'),contentType:'image/png'});return r.abort()});
const p=await ctx.newPage();p.on('pageerror',e=>errs.push(tag+': '+e.message));
await p.goto('file:///x/a.html');await p.evaluate(t=>{localStorage.clear();localStorage.setItem('bkm-terrenos-tema',t)},tema);await p.reload();await p.waitForTimeout(400);
await p.evaluate(()=>document.querySelector('[data-a=nav][data-r=mapa]').click());await p.waitForTimeout(900);
await p.evaluate(()=>document.querySelector('.mapa').scrollIntoView({block:'start'}));await p.waitForTimeout(300);
ok(await p.$$eval('#mapa .mk',e=>e.length)===6,tag+' 6 empreendimentos de mercado no mapa');
const leg=await p.$eval('#mp-leg',x=>x.textContent).catch(()=>'');ok(/Mercado \(exemplo\)\s*6/.test(leg),tag+' legenda com Mercado (exemplo) 6');
const abre=async nome=>{await p.evaluate(n=>{const m=[...document.querySelectorAll('#mapa .mk')].find(x=>(x.title||'').startsWith(n));m.dispatchEvent(new MouseEvent('click',{bubbles:true}))},nome);await p.waitForTimeout(300)};
await abre('Vista Prudente Residencial');
const box=await p.$eval('#mk-box',x=>x.textContent.replace(/\s+/g,' ')).catch(()=>'');
ok(/VSO médio/.test(box)&&/Vista Prudente Residencial/.test(box)&&/Lançamento/.test(box)&&/Entrega/.test(box)&&/Unidades\s*320/.test(box)&&/Em estoque/.test(box)&&/VGV lançado/.test(box)&&/VGV em estoque/.test(box),tag+' janela com os números: '+box.slice(0,200));
// a mesma planta de 36,2 m² tem preço com teto na torre B até o 10º andar e salto de 17% depois: vira dois grupos
const g36=await p.$$eval('#mk-box tbody tr',tr=>tr.map(x=>x.textContent.replace(/\s+/g,' ')).filter(t=>/36,2 m²/.test(t)));
ok(g36.length>=2,tag+' planta de 36,2 m² separada pelo teto de preço ('+g36.length+' grupos)');
const vis=await p.$eval('#mk-box .cc-box',x=>{const r=x.getBoundingClientRect(),a=document.querySelector('.mapa-area').getBoundingClientRect();return r.left>=a.left-1&&r.right<=a.right+1&&r.bottom<=a.bottom+1&&r.top>=a.top-1});ok(vis,tag+' janela dentro do mapa');
await p.screenshot({path:OUT+tag+'_1_janela.png'});
await p.evaluate(()=>document.querySelector('#mk-box .cc-box').scrollTop=9999);await p.waitForTimeout(100);await p.screenshot({path:OUT+tag+'_2_grupos.png'});
// rampa fina andar a andar: um grupo só por planta
await abre('Aricanduva Prime');const ar=await p.$$eval('#mk-box tbody tr',tr=>tr.length);ok(ar===2,tag+' rampa de 1,2% por andar: um grupo por planta ('+ar+')');
// sem andar em 30% das unidades: andar inconsistente, regra de 6%
await abre('Estação Penha Studios');const pe=await p.$eval('#mk-box',x=>x.textContent);ok(/andares inconsistentes/.test(pe),tag+' empreendimento com andar inconsistente avisa os 6%');
await p.screenshot({path:OUT+tag+'_3_penha.png'});
await p.keyboard.press('Escape');await p.waitForTimeout(200);ok(!(await p.$('#mk-box .cc-box')),tag+' Esc fecha a janela');
await abre('Parque das Mangueiras');
await p.evaluate(()=>{const m=document.querySelector('#mapa .conc');m.dispatchEvent(new MouseEvent('click',{bubbles:true}))});await p.waitForTimeout(300);
ok(!(await p.$('#mk-box .cc-box'))&&!!(await p.$('#cc-box .cc-box')),tag+' abrir a concorrência fecha a janela de mercado');
await p.keyboard.press('Escape');await p.waitForTimeout(200);
await abre('Vila Ema Garden');await p.waitForTimeout(400);
await p.evaluate(()=>{const lg=document.querySelector('.mp-legenda');if(lg)lg.open=true});
const bt=await p.$('#mp-leg [data-a=mp-merc]');if(bt&&await bt.isVisible()){await bt.click();await p.waitForTimeout(300);
  ok(!(await p.$('#mapa .mk'))&&!(await p.$('#mk-box .cc-box')),tag+' desligar Mercado na legenda tira os pinos e fecha a janela');
  await p.click('#mp-leg [data-a=mp-merc]');await p.waitForTimeout(300);ok(await p.$$eval('#mapa .mk',e=>e.length)===6,tag+' religar volta os pinos')}
else ok(true,tag+' legenda escondida com a janela aberta (celular)');
// ficha do terreno: Mercado na redondeza (seção Comercial), por categoria de produto, raio, com e sem vaga
const ficha=async lat=>{await p.evaluate(()=>document.querySelector('[data-a=nav][data-r=terrenos]').click());await p.waitForTimeout(400);
  await p.evaluate(la=>{const k=Object.keys(localStorage).find(k=>{try{return !!JSON.parse(localStorage.getItem(k)).terrenos}catch(e){return false}});
    const t=JSON.parse(localStorage.getItem(k)).terrenos.find(x=>x.lat===la);document.querySelector(`[data-a=abrir][data-id="${t.id}"]`).click()},lat);await p.waitForTimeout(500);
  await p.evaluate(()=>{const b=document.querySelector('.fi-abas [data-t=entorno]');if(b.getAttribute('aria-selected')!=='true')b.click()});await p.waitForTimeout(400)};
const sec=async()=>p.$eval('.mk-sec',x=>x.textContent.replace(/\s+/g,' ')).catch(()=>'');
await ficha(-23.5868);let tx=await sec();
ok(/Mercado na redondeza/.test(tx)&&/Vista Prudente Residencial/.test(tx)&&/Vila Ema Garden/.test(tx)&&/2 dorms de 34 a 39 m²/.test(tx),tag+' ficha com categorias no raio de 2 km: '+tx.slice(0,220));
ok(/R\$\/m² mediano/.test(tx)&&/VSO médio/.test(tx)&&/\d+,\d%/.test(tx),tag+' R$/m² e VSO médio por categoria');
const nLin=await p.$$eval('.mk-cat tbody tr',t=>t.map(x=>+x.children[2].textContent.replace(/\D/g,'')));ok(nLin.length>0&&nLin.every(n=>n>=20),tag+' só categorias com 20 unidades ou mais ('+nLin.join(',')+')');
await p.evaluate(()=>document.querySelector('.mk-sec').scrollIntoView({block:'start'}));await p.waitForTimeout(200);await p.screenshot({path:OUT+tag+'_4_ficha.png'});
await p.click('.mk-sec [data-a=mk-vaga][data-v=com]');await p.waitForTimeout(300);tx=await sec();
ok(/2 dorms de 45 a 55 m²/.test(tx)&&!/2 dorms de 34 a 39 m²/.test(tx),tag+' Com vaga mostra só as plantas com vaga');
await p.click('.mk-sec [data-a=mk-vaga][data-v=todas]');await p.waitForTimeout(200);
await ficha(-23.538);await p.click('.mk-sec [data-a=mk-raio][data-v="1"]');await p.waitForTimeout(300);tx=await sec();
ok(/Parque das Mangueiras/.test(tx)&&/vaga não preenchida fora do cálculo/.test(tx)&&/Studio|1 dorm de 25 a 32 m²/.test(tx),tag+' 1 km: unidades com vaga não preenchida fora do cálculo');
await p.screenshot({path:OUT+tag+'_5_ficha_1km.png'});
await p.click('.mk-sec [data-a=mk-raio][data-v="2"]');await p.waitForTimeout(200);
await ctx.close()}
await b.close();console.log(errs.length?'\n'+errs.length+' FALHA(S)\n'+errs.join('\n'):'\ntudo ok');process.exit(errs.length?1:0)})();
