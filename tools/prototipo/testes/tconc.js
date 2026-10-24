// Concorrência: quadro ao tocar no losango (preço por m² ponderado pelo mix, histórico por tipologia), Atualizar preços
// (linha nova, não sobrescreve), cadastro na gaveta pelo clique direito com "Incluir empresa", Esc e clique no mapa fecham,
// Leitura sem botões, escuro e celular. Prints em saida/t_conc.
const TMP=require('path').join(__dirname,'..','saida')+'/';const OUT=TMP+'t_conc/';require('fs').mkdirSync(OUT,{recursive:true});
const {chromium,devices}=require('playwright');
const L=require('path').join(__dirname,'..','libs','l')+'/';const F=require('path').join(__dirname,'..','..','..','docs','prototipo.html');
(async()=>{const b=await chromium.launch();const errs=[];const ok=(c,m)=>{console.log((c?'ok  ':'FALHA ')+m);if(!c)errs.push(m)};
for(const [modo,tema] of [['desktop','claro'],['desktop','escuro'],['celular','claro']]){const tag=modo+'_'+tema;
const ctx=await b.newContext(modo==='desktop'?{viewport:{width:1440,height:900},deviceScaleFactor:2}:{...devices['Pixel 7']});
await ctx.route('**/*',r=>{const u=r.request().url();if(u.startsWith('file://'))return r.fulfill({path:F,contentType:'text/html; charset=utf-8'});if(/leaflet.js|jszip/.test(u))return r.fulfill({path:L+(u.includes('leaflet')?'leaflet.js':'jszip.min.js'),contentType:'application/javascript'});if(/cartocdn|openstreetmap|arcgisonline/.test(u)&&!/nominatim/.test(u))return r.fulfill({path:require('path').join(__dirname,'tile.png'),contentType:'image/png'});
  if(/nominatim/.test(u))return r.fulfill({contentType:'application/json',body:JSON.stringify({address:{road:'Rua do Teste',house_number:'50',suburb:'Vila Teste',city:'São Paulo','ISO3166-2-lvl4':'BR-SP'}})});return r.abort()});
const p=await ctx.newPage();p.on('pageerror',e=>errs.push(tag+': '+e.message));
await p.goto('file:///x/a.html');await p.evaluate(t=>{localStorage.clear();localStorage.setItem('bkm-terrenos-tema',t)},tema);await p.reload();await p.waitForTimeout(400);
await p.evaluate(()=>document.querySelector('[data-a=nav][data-r=mapa]').click());await p.waitForTimeout(900);
await p.evaluate(()=>document.querySelector('.mapa').scrollIntoView({block:'start'}));await p.waitForTimeout(300);
ok(await p.$$eval('#mapa .conc',e=>e.length)===3,tag+' 3 empreendimentos no mapa');
const abre=async nome=>{await p.evaluate(n=>{const m=document.querySelector(`#mapa .conc[title="${n}"]`);m.dispatchEvent(new MouseEvent('click',{bubbles:true}))},nome);await p.waitForTimeout(300)};
await abre('Residencial Jardim Prudente');
const box=await p.$eval('#cc-box',x=>x.textContent.replace(/\s+/g,' ')).catch(()=>'');
// (259.000 × 180 + 345.000 × 60) ÷ (40 × 180 + 48 × 60) = 6.678,57
ok(/Residencial Jardim Prudente/.test(box)&&/6\.679\/m²/.test(box)&&/ponderada/.test(box)&&/apurado em 15\/09\/2026/.test(box),tag+' quadro com o preço por m² ponderado: '+box.slice(0,160));
ok(/HIS 2/.test(box)&&/HMP/.test(box)&&/240 unidades/.test(box),tag+' quadro com unidades e faixas');
const vis=await p.$eval('#cc-box .cc-box',x=>{const r=x.getBoundingClientRect(),a=document.querySelector('.mapa-area').getBoundingClientRect();return r.left>=a.left-1&&r.right<=a.right+1&&r.bottom<=a.bottom+1&&r.top>=a.top-1});ok(vis,tag+' quadro dentro do mapa');
await p.screenshot({path:OUT+tag+'_1_quadro.png'});
await p.click('#cc-box .cc-tr[data-a=cc-hist]');await p.waitForTimeout(200);ok(await p.$$eval('#cc-box .cc-hl li',e=>e.length)===2,tag+' histórico da tipologia com 2 apurações');
await p.click('#cc-box [data-a=cc-precos]');await p.waitForTimeout(300);
ok(await p.$eval('#cc-dr h2',x=>x.textContent).catch(()=>'')==='Atualizar preços'&&!(await p.$('#cc-box')),tag+' Atualizar preços abre a gaveta e fecha o quadro');
await p.screenshot({path:OUT+tag+'_2_atualizar.png'});
await p.fill('#cc-dr .cc-tp [data-k=preco] >> nth=0','270 mil');await p.click('#cc-dr button[type=submit]');await p.waitForTimeout(400);
const box2=await p.$eval('#cc-box',x=>x.textContent.replace(/\s+/g,' ')).catch(()=>'');
ok(/270\.000/.test(box2)&&!(await p.$('#cc-dr')),tag+' preço novo no quadro');
await p.click('#cc-box .cc-tr[data-a=cc-hist]');await p.waitForTimeout(200);ok(await p.$$eval('#cc-box .cc-hl li',e=>e.length)===3,tag+' preço novo vira linha nova (3 apurações)');
await p.keyboard.press('Escape');await p.waitForTimeout(200);ok(!(await p.$('#cc-box')),tag+' Esc fecha o quadro');
await abre('Condomínio Parque Tatuapé');const b3=await p.$eval('#cc-box',x=>x.textContent.replace(/\s+/g,' ')).catch(()=>'');
// um ponto vazio do mapa
const m=await p.$eval('#mapa',x=>{const r=x.getBoundingClientRect();for(const fy of [.2,.25,.3,.42,.5,.58])for(const fx of [.55,.45,.65,.35,.75]){const q={x:r.x+r.width*fx,y:r.y+r.height*fy},e=document.elementFromPoint(q.x,q.y);
  if(e&&!e.closest('.leaflet-interactive,.leaflet-marker-icon,.mp-barra,.mp-legenda,.mp-modo,.leaflet-control,.mp-ctrl,#cc-box')&&!document.elementsFromPoint(q.x-25,q.y-25).concat(document.elementsFromPoint(q.x+25,q.y+25)).some(z=>z.matches('.leaflet-interactive,.leaflet-marker-icon')))return q}return {x:r.x+r.width*.5,y:r.y+r.height*.5}});
// sem unidades por tipologia: média simples de 198.000/32, 262.000/42 e 520.000/64 = 6.850,20
ok(/6\.850\/m²/.test(b3)&&/sem as unidades/.test(b3)&&/mai\/2026 a jul\/2026/.test(b3),tag+' sem o mix, média simples e período: '+b3.slice(0,140));
await p.waitForTimeout(400);await p.mouse.click(m.x,m.y);await p.waitForTimeout(300);ok(!(await p.$('#cc-box')),tag+' clique no mapa fecha o quadro');
if(modo==='desktop'){await p.mouse.click(m.x,m.y,{button:'right'});await p.waitForTimeout(250)}
else{const c=await ctx.newCDPSession(p);await c.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:m.x,y:m.y}]});await p.waitForTimeout(900);await c.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await p.waitForTimeout(400)}
await p.click('.mp-ctx [data-a=ctx-conc]');await p.waitForTimeout(500);
ok(await p.$eval('#cc-dr h2',x=>x.textContent).catch(()=>'')==='Nova concorrência',tag+' clique direito abre a gaveta Nova concorrência');
ok(/Rua do Teste, 50/.test(await p.$eval('#cc-end',x=>x.value)),tag+' endereço pelo ponto');
const dr=await p.$eval('#cc-dr',x=>{const r=x.getBoundingClientRect();return {w:Math.round(r.width),sx:x.scrollWidth<=x.clientWidth+1}});ok(dr.sx&&(modo==='desktop'?dr.w===400:dr.w>=380),tag+' gaveta '+JSON.stringify(dr));
await p.click('#cc-dr [data-a=cc-emp-novo]');await p.waitForTimeout(200);await p.fill('#cce-n','Construtora Nova');await p.click('#cc-emp-dlg button[type=submit]');await p.waitForTimeout(250);
ok(await p.$eval('#cc-emp',x=>x.selectedOptions[0].textContent)==='Construtora Nova',tag+' empresa incluída pelo pop-up e escolhida');
await p.fill('#cc-nome','Residencial Teste');await p.fill('#cc-unid','100');
await p.click('#cc-dr button[type=submit]');await p.waitForTimeout(250);ok(!!(await p.$('#cc-dr')),tag+' sem a área da tipologia não salva');
await p.fill('#cc-dr .cc-tp [data-k=area] >> nth=0','45');await p.fill('#cc-dr .cc-tp [data-k=preco] >> nth=0','300 mil');
await p.click('#cc-dr [data-a=cc-tp-add]');await p.waitForTimeout(150);ok(await p.$$eval('#cc-dr .cc-tp',e=>e.length)===2&&await p.$eval('#cc-nome',x=>x.value)==='Residencial Teste',tag+' adicionar tipologia mantém o digitado');
await p.fill('#cc-dr .cc-tp [data-k=area] >> nth=1','60');await p.selectOption('#cc-dr .cc-tp [data-k=faixa] >> nth=1','hmp');
await p.screenshot({path:OUT+tag+'_3_novo.png'});
await p.click('#cc-dr button[type=submit]');await p.waitForTimeout(500);
const b4=await p.$eval('#cc-box',x=>x.textContent.replace(/\s+/g,' ')).catch(()=>'');
ok(await p.$$eval('#mapa .conc',e=>e.length)===4&&/Residencial Teste/.test(b4)&&/Construtora Nova/.test(b4)&&/6\.667\/m²/.test(b4),tag+' empreendimento novo no mapa e no quadro: '+b4.slice(0,120));
ok(/Concorrência\s*4/.test(await p.$eval('#mp-leg',x=>x.textContent.replace(/\s+/g,' '))),tag+' legenda conta 4');
await p.screenshot({path:OUT+tag+'_4_salvo.png'});
await p.click('#cc-box [data-a=cc-desat]');await p.click('#cc-box [data-a=cc-desat-s]');await p.waitForTimeout(300);ok(await p.$$eval('#mapa .conc',e=>e.length)===3,tag+' desativar tira do mapa');
// Leitura: quadro sem botões
await p.evaluate(()=>{const x=document.createElement('button');x.dataset.a='role';x.dataset.v='Leitura';document.body.appendChild(x);x.click();x.remove()});await p.waitForTimeout(500);
await p.evaluate(()=>document.querySelector('[data-a=nav][data-r=mapa]')?.click());await p.waitForTimeout(700);
await abre('Residencial Jardim Prudente');ok(!!(await p.$('#cc-box'))&&!(await p.$('#cc-box .cc-ac')),tag+' Leitura vê o quadro sem botões');
await ctx.close()}
console.log('ERROS',JSON.stringify(errs));await b.close()})();
