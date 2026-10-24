// Servido em http://bkm.test (fetch não lê file://).
// Camada de renda por setor censitário (IBGE 2022): liga na legenda, desenha, clique abre o setor, Esc fecha;
// quadro "Renda e população do entorno" na ficha (raios e poligonal); modal da metodologia. Prints em saida/t_renda.
const path=require('path'),fs=require('fs');const TMP=path.join(__dirname,'..','saida')+'/';const OUT=TMP+'t_renda/';fs.mkdirSync(OUT,{recursive:true});
const {chromium,devices}=require('playwright');
const L=path.join(__dirname,'..','libs','l')+'/';const F=path.join(__dirname,'..','..','..','docs','prototipo.html');const D=path.join(__dirname,'..','..','..','docs','dados','setores-3550308-2022.json');
(async()=>{const b=await chromium.launch();const errs=[];const ok=(c,m)=>{console.log((c?'ok  ':'FALHA ')+m);if(!c)errs.push(m)};
for(const [modo,tema] of [['desktop','claro'],['desktop','escuro'],['celular','claro']]){const tag=modo+'_'+tema;
const ctx=await b.newContext(modo==='desktop'?{viewport:{width:1440,height:900},deviceScaleFactor:1}:{...devices['Pixel 7']});
await ctx.route('**/*',r=>{const u=r.request().url();if(/setores-3550308-2022\.json/.test(u))return r.fulfill({path:D,contentType:'application/json'});if(u.startsWith('http://bkm.test/a.html'))return r.fulfill({path:F,contentType:'text/html; charset=utf-8'});if(/leaflet.js|jszip/.test(u))return r.fulfill({path:L+(u.includes('leaflet')?'leaflet.js':'jszip.min.js'),contentType:'application/javascript'});if(/cartocdn|openstreetmap|arcgisonline/.test(u))return r.fulfill({path:path.join(__dirname,'tile.png'),contentType:'image/png'});return r.abort()});
const p=await ctx.newPage();p.on('pageerror',e=>errs.push(tag+': '+e.message));
await p.goto('http://bkm.test/a.html');await p.evaluate(t=>{localStorage.clear();localStorage.setItem('bkm-terrenos-tema',t)},tema);await p.reload();await p.waitForTimeout(400);
await p.evaluate(()=>document.querySelector('[data-a=nav][data-r=mapa]').click());await p.waitForTimeout(900);
await p.evaluate(()=>document.querySelector('#mp-leg [data-a=mp-renda]').click());
await p.waitForFunction(()=>BKM_TESTE.setores(),null,{timeout:20000}).catch(()=>{});await p.waitForTimeout(1500);
ok(await p.evaluate(()=>BKM_TESTE.setores()),tag+' setores carregados');
const leg=await p.$eval('#rd-leg',x=>x.textContent.replace(/\s+/g,' ')).catch(()=>'');ok(/Até R\$ 2\.000/.test(leg)&&/Acima de R\$ 30\.000/.test(leg),tag+' legenda das 16 faixas');
const tinta=await p.evaluate(()=>{let n=0;for(const c of document.querySelectorAll('#mapa canvas')){if(!c.width)continue;const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;for(let i=3;i<d.length;i+=400)if(d[i]>0)n++}return n});
ok(tinta>100,tag+' ladrilhos pintados ('+tinta+')');
await p.evaluate(()=>document.querySelector('.mapa').scrollIntoView({block:'start'}));await p.waitForTimeout(300);
await p.screenshot({path:OUT+tag+'_camada.png'});
// clique num ponto do mapa sem pino: centro da área do mapa deslocado
const pt=await p.evaluate(()=>{const r=document.querySelector('#mapa').getBoundingClientRect();return {x:r.x+r.width*0.35,y:r.y+r.height*0.4}});
if(modo==='desktop')await p.mouse.click(pt.x,pt.y);else await p.touchscreen.tap(pt.x,pt.y);await p.waitForTimeout(600);
const box=await p.$eval('#rd-box',x=>x.innerText.replace(/\s+/g,' ')).catch(()=>'');console.log('   setor:',box.slice(0,260));
ok(/Renda familiar/.test(box)&&/1,6×/.test(box)&&/3550308\d{8}/.test(box.replace(/\D+/g,m=>m.includes(' ')?' ':'')),tag+' painel do setor com renda, fator e código');
await p.screenshot({path:OUT+tag+'_setor.png'});
await p.keyboard.press('Escape');await p.waitForTimeout(300);ok(!(await p.$('#rd-box')),tag+' Esc fecha o setor');
// ficha do Itapura
await p.evaluate(()=>BKM_TESTE.abrirTerreno('Terreno Rua Itapura'));await p.waitForTimeout(1200);
const card=await p.$eval('#rd-card',x=>x.innerText.replace(/\s+/g,' ')).catch(()=>'');console.log('   ficha:',card.slice(0,300));
ok(/Renda familiar média estimada R\$/.test(card)&&/hab\/km²/.test(card),tag+' quadro na ficha com renda e população');
const vals={};for(const k of ['500','1000','2000','poly']){const bt=await p.$(`#rd-card [data-a=rd-raio][data-v="${k}"]`);if(!bt)continue;await bt.click();await p.waitForTimeout(400);vals[k]=await p.$eval('#rd-corpo .rd-m1 .v',x=>x.textContent).catch(()=>null)}
console.log('   raios:',JSON.stringify(vals));ok(Object.values(vals).filter(v=>v&&/R\$/.test(v)).length>=3,tag+' raios e poligonal calculam');
await p.click('#rd-card [data-a=rd-raio][data-v="1000"]');await p.waitForTimeout(300);
await (await p.$('#rd-card')).screenshot({path:OUT+tag+'_ficha.png'});
await p.click('#rd-card [data-a=rd-met]');await p.waitForTimeout(400);
const met=await p.$eval('#modal',x=>x.innerText.replace(/\s+/g,' ')).catch(()=>'');ok(/Dado oficial/.test(met)&&/Transformação nossa/.test(met)&&/Fator familiar 1,6×/.test(met)&&/× 1,6 ×/.test(met),tag+' metodologia com fator 1,6');
await p.screenshot({path:OUT+tag+'_metodologia.png'});
await ctx.close()}
console.log('ERROS',JSON.stringify(errs));await b.close()})();
