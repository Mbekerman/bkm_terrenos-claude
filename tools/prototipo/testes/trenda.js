// Servido em http://bkm.test (fetch não lê file://).
// Camadas por setor censitário (IBGE 2022), renda e densidade: liga pelo botão Camadas da barra, desenha, clique abre o setor, Esc fecha;
// quadro "Renda e população do entorno" na ficha (raios e poligonal); modal da metodologia. Prints em saida/t_renda.
const path=require('path'),fs=require('fs');const TMP=path.join(__dirname,'..','saida')+'/';const OUT=TMP+'t_renda/';fs.mkdirSync(OUT,{recursive:true});
const {chromium,devices}=require('playwright');
const L=path.join(__dirname,'..','libs','l')+'/';const F=path.join(__dirname,'..','..','..','docs','prototipo.html');const D=path.join(__dirname,'..','..','..','docs','dados','setores-3550308-2022.json');const DM=path.join(__dirname,'..','..','..','docs','dados','demografia-3550308-2022.json');
(async()=>{const b=await chromium.launch();const errs=[];const ok=(c,m)=>{console.log((c?'ok  ':'FALHA ')+m);if(!c)errs.push(m)};
for(const [modo,tema] of [['desktop','claro'],['desktop','escuro'],['celular','claro']]){const tag=modo+'_'+tema;
const ctx=await b.newContext(modo==='desktop'?{viewport:{width:1440,height:900},deviceScaleFactor:1}:{...devices['Pixel 7']});
await ctx.route('**/*',r=>{const u=r.request().url();if(/setores-3550308-2022\.json/.test(u))return r.fulfill({path:D,contentType:'application/json'});if(/demografia-3550308-2022\.json/.test(u))return r.fulfill({path:DM,contentType:'application/json'});if(u.startsWith('http://bkm.test/a.html'))return r.fulfill({path:F,contentType:'text/html; charset=utf-8'});if(/leaflet.js|jszip/.test(u))return r.fulfill({path:L+(u.includes('leaflet')?'leaflet.js':'jszip.min.js'),contentType:'application/javascript'});if(/cartocdn|openstreetmap|arcgisonline/.test(u))return r.fulfill({path:path.join(__dirname,'tile.png'),contentType:'image/png'});return r.abort()});
const p=await ctx.newPage();p.on('pageerror',e=>errs.push(tag+': '+e.message));
await p.goto('http://bkm.test/a.html');await p.evaluate(t=>{localStorage.clear();localStorage.setItem('bkm-terrenos-tema',t)},tema);await p.reload();await p.waitForTimeout(400);
await p.evaluate(()=>document.querySelector('[data-a=nav][data-r=mapa]').click());await p.waitForTimeout(900);
const camada=async v=>{await p.click('.mp-barra [data-a=mp-camadas]');await p.waitForTimeout(250);await p.click(`.mp-cam-m [data-a=mp-camada][data-v="${v}"]`);await p.waitForTimeout(300)};
const pintado=()=>p.evaluate(()=>{let n=0;for(const c of document.querySelectorAll('#mapa canvas')){if(!c.width)continue;const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;for(let i=3;i<d.length;i+=400)if(d[i]>0)n++}return n});
ok((await p.$eval('.mp-barra [data-a=mp-camadas]',x=>x.textContent)).includes('Camadas'),tag+' botão Camadas na barra');
await camada('renda');ok((await p.$eval('.mp-barra [data-a=mp-camadas]',x=>x.textContent)).includes('Renda'),tag+' ligado, o botão mostra Renda');
await p.waitForFunction(()=>BKM_TESTE.setores(),null,{timeout:20000}).catch(()=>{});await p.waitForTimeout(1500);
ok(await p.evaluate(()=>BKM_TESTE.setores()),tag+' setores carregados');
const leg=await p.$eval('#rd-leg',x=>x.textContent.replace(/\s+/g,' ')).catch(()=>'');ok(/Até R\$ 2\.000/.test(leg)&&/Acima de R\$ 30\.000/.test(leg),tag+' legenda das 16 faixas');
const tinta=await pintado();
ok(tinta>100,tag+' ladrilhos pintados ('+tinta+')');
await p.evaluate(()=>document.querySelector('.mapa').scrollIntoView({block:'start'}));await p.waitForTimeout(300);
await p.screenshot({path:OUT+tag+'_camada.png'});
if(modo==='celular'){await p.click('#rd-leg summary');await p.waitForTimeout(300);ok(await p.$eval('#rd-leg',x=>x.open),tag+' toque na escala abre as faixas');await p.screenshot({path:OUT+tag+'_faixas.png'});await p.click('#rd-leg summary');await p.waitForTimeout(300)}
// clique num ponto do mapa sem pino: centro da área do mapa deslocado
const pt=await p.evaluate(f=>{const r=document.querySelector('#mapa').getBoundingClientRect();return {x:r.x+r.width*0.35,y:r.y+r.height*f}},modo==='desktop'?0.3:0.4); // fora das legendas
if(modo==='desktop')await p.mouse.click(pt.x,pt.y);else await p.touchscreen.tap(pt.x,pt.y);await p.waitForTimeout(600);
const box=await p.$eval('#rd-box',x=>x.innerText.replace(/\s+/g,' ')).catch(()=>'');console.log('   setor:',box.slice(0,260));
ok(/Renda familiar/.test(box)&&/1,6×/.test(box)&&/3550308\d{8}/.test(box.replace(/\D+/g,m=>m.includes(' ')?' ':'')),tag+' painel do setor com renda, fator e código');
await p.screenshot({path:OUT+tag+'_setor.png'});
await p.keyboard.press('Escape');await p.waitForTimeout(300);ok(!(await p.$('#rd-box')),tag+' Esc fecha o setor');
// densidade: troca pelo mesmo botão, uma camada de cada vez
await p.click('.mp-barra [data-a=mp-camadas]');await p.waitForTimeout(250);await p.screenshot({path:OUT+tag+'_menu.png'});await p.click('.mp-barra [data-a=mp-camadas]');await p.waitForTimeout(200);ok(!(await p.$('.mp-cam-m')),tag+' o botão fecha a lista');
await camada('dens');await p.waitForTimeout(1200);
ok((await p.$eval('.mp-barra [data-a=mp-camadas]',x=>x.textContent)).includes('Densidade'),tag+' botão mostra Densidade');
const legD=await p.$eval('#rd-leg',x=>x.textContent.replace(/\s+/g,' ')).catch(()=>'');ok(/Densidade demográfica/.test(legD)&&/Sem moradores/.test(legD)&&/Acima de 100\.000/.test(legD)&&!/R\$/.test(legD),tag+' legenda da densidade (10 faixas)');
ok(await pintado()>100,tag+' ladrilhos da densidade pintados');
ok(await p.evaluate(()=>document.querySelectorAll('[data-a=mp-renda][aria-pressed=true]').length===0&&document.querySelectorAll('[data-a=mp-dens][aria-pressed=true]').length===1),tag+' só a densidade fica marcada na legenda');
await p.screenshot({path:OUT+tag+'_densidade.png'});
if(modo==='celular'){await p.click('#rd-leg summary');await p.waitForTimeout(300);await p.screenshot({path:OUT+tag+'_densidade_faixas.png'});await p.click('#rd-leg summary');await p.waitForTimeout(300)}
if(modo==='desktop')await p.mouse.click(pt.x,pt.y);else await p.touchscreen.tap(pt.x,pt.y);await p.waitForTimeout(600);
const boxD=await p.$eval('#rd-box',x=>x.innerText.replace(/\s+/g,' ')).catch(()=>'');console.log('   setor (densidade):',boxD.slice(0,260));
ok(/(hab\/km²|sem moradores)/.test(boxD)&&/Pessoas/.test(boxD)&&/Área do setor/.test(boxD),tag+' quadro do setor com densidade, pessoas e área');
await p.screenshot({path:OUT+tag+'_densidade_setor.png'});
await p.click('#rd-box [data-a=ds-met]');await p.waitForTimeout(300);ok(/Metodologia da densidade/.test(await p.$eval('#modal',x=>x.innerText).catch(()=>'')),tag+' metodologia da densidade');
await p.click('#modal [data-a=close]');await p.waitForTimeout(200);
await p.keyboard.press('Escape');await p.waitForTimeout(200);
await camada('');ok(!(await p.$('#rd-leg'))&&(await p.$eval('.mp-barra [data-a=mp-camadas]',x=>x.textContent)).includes('Camadas'),tag+' Nenhuma desliga a camada e a legenda');
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
await p.click('#modal [data-a=close]');await p.waitForTimeout(200);
// perfil da população (idade, sexo, domicílios): mesmo raio do quadro da renda
await p.waitForFunction(()=>/População residente/.test(document.querySelector('#pf-card')?.innerText||''),null,{timeout:20000}).catch(()=>{});
const pf=await p.$eval('#pf-card',x=>x.innerText.replace(/\s+/g,' ')).catch(()=>'');console.log('   perfil:',pf.slice(0,420));
ok(/População residente/.test(pf)&&/Moradores por domicílio \d,\d\d/.test(pf)&&/Homens · Mulheres \d+% · \d+%/.test(pf),tag+' perfil com população, moradores por domicílio e sexo');
ok(await p.$$eval('#pf-card .pf-pr',x=>x.length)===8&&/20 a 29/.test(pf)&&/60 ou mais/.test(pf),tag+' pirâmide com os 8 grupos de idade');
ok(/5 ou mais moradores/.test(pf)&&/Apartamento/.test(pf)&&/vagos/.test(pf),tag+' domicílios por moradores, tipo e vagos');
const pops=await p.evaluate(()=>[document.querySelector('#rd-corpo .rd-m:nth-child(2) .v')?.textContent,document.querySelector('#pf-corpo .rd-m .v')?.textContent]);
ok(pops[0]&&pops[0]===pops[1],tag+' mesma população nos dois quadros ('+pops.join(' / ')+')');
await p.click('#pf-card [data-a=rd-raio][data-v="500"]');await p.waitForTimeout(500);
const pops5=await p.evaluate(()=>[document.querySelector('#rd-corpo .rd-m:nth-child(2) .v')?.textContent,document.querySelector('#pf-corpo .rd-m .v')?.textContent]);
ok(pops5[0]===pops5[1]&&pops5[1]!==pops[1],tag+' trocar o raio no perfil muda os dois quadros ('+pops5.join(' / ')+')');
await p.click('#pf-card [data-a=rd-raio][data-v="1000"]');await p.waitForTimeout(400);
await (await p.$('#pf-card')).screenshot({path:OUT+tag+'_perfil.png'});
await p.click('#pf-card [data-a=pf-met]');await p.waitForTimeout(300);ok(/Sigilo/.test(await p.$eval('#modal',x=>x.innerText).catch(()=>'')),tag+' nota sobre os dados do perfil');
await ctx.close()}
console.log('ERROS',JSON.stringify(errs));await b.close()})();
