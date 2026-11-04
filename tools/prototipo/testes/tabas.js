/* ficha em abas: todas as abas abrem sem erro, abas fixas no topo ao rolar, links antigos caem na aba nova, Visão geral em duas metades (claro, escuro, celular) */
const TMP=require('path').join(__dirname,'..','saida')+'/';require('fs').mkdirSync(TMP+'t_abas',{recursive:true});
const {chromium,devices}=require('playwright');
const L=require('path').join(__dirname,'..','libs','l')+'/';const F=require('path').join(__dirname,'..','..','..','docs','prototipo.html'); // tem a meta viewport (celular)
const ABAS=['geral','comercial','terreno','parametros','massa','viabilidade','infra','entorno','jornada','documentos'];
let falhas=0;const ok=(c,m)=>{if(!c){falhas++;console.log('FALHOU:',m)}};
(async()=>{const b=await chromium.launch();
for(const [w,h,tema,cel] of [[1440,900,'claro',0],[1440,900,'escuro',0],[390,844,'claro',1]]){
const ctx=await b.newContext(cel?{...devices['Pixel 7']}:{viewport:{width:w,height:h},deviceScaleFactor:1});
await ctx.route('**/*',r=>{const u=r.request().url();if(u.startsWith('file://'))return r.fulfill({path:F,contentType:'text/html; charset=utf-8'});if(/leaflet.js|jszip/.test(u))return r.fulfill({path:L+(u.includes('leaflet')?'leaflet.js':'jszip.min.js'),contentType:'application/javascript'});if(/cartocdn|openstreetmap|arcgisonline/.test(u))return r.fulfill({path:require('path').join(__dirname,'tile.png'),contentType:'image/png'});return r.abort()});
await ctx.addInitScript(()=>{window.__qdReal=true});const p=await ctx.newPage();const erros=[];p.on('pageerror',e=>erros.push(e.message));
await p.goto('file:///x/a.html');await p.evaluate(t=>{localStorage.clear();localStorage.setItem('bkm-terrenos-tema',t)},tema);
await p.goto('file:///x/a.html#/terrenos/TER-000123');await p.reload();await p.waitForTimeout(500);
const n=await p.$$eval('.fi-abas button',x=>x.map(y=>y.dataset.t));ok(ABAS.every(a=>n.includes(a)),'abas: '+n.join(','));
ok(!(await p.$('.bl-seta')),'sem setas de abrir e fechar');
const meta=await p.$eval('.fi-meta',x=>x.textContent);ok(/Novos Negócios/.test(meta)&&/Cadastrado em/.test(meta),'topo: '+meta);
if(!cel){const g=await p.$eval('.geral',x=>getComputedStyle(x).gridTemplateColumns.split(' ').map(parseFloat));ok(g.length===2&&Math.abs(g[0]-g[1])<2,'duas metades '+g);
  const xs=await p.evaluate(()=>[document.querySelector('.g-loc').getBoundingClientRect().left,document.querySelector('.g-res').getBoundingClientRect().left]);ok(xs[0]<xs[1],'mapa à esquerda, resumo à direita '+xs)}
const res=await p.$eval('.g-res',x=>x.textContent);for(const r of ['Endereço','Município e região','Zoneamento','Área adotada','Unidades do estudo válido','VGV do estudo válido','Distância do metrô','Valor pedido na entrada','Perfil topográfico','Corretor'])ok(res.includes(r),'resumo sem '+r);
await p.screenshot({path:`${TMP}t_abas/${w}_${tema}_geral.png`,fullPage:!cel});
for(const a of ABAS.slice(1)){await p.evaluate(a=>document.querySelector(`.fi-abas [data-t="${a}"]`).click(),a);await p.waitForTimeout(250);
  ok(await p.$eval('.fi-abas [aria-selected="true"]',x=>x.dataset.t)===a,'aba ativa '+a);
  ok((await p.evaluate(()=>location.hash)).endsWith('/'+a),'endereço da aba '+a);
  const sc=await p.evaluate(()=>document.documentElement.scrollWidth-innerWidth);ok(sc<=1,'rolagem lateral em '+a+' '+sc);
  await p.screenshot({path:`${TMP}t_abas/${w}_${tema}_${a}.png`,fullPage:!cel})}
// quadros das abas: nascem fechados, só o primeiro aberto; a seta abre e fecha; editar abre
await p.evaluate(()=>document.querySelector('.fi-abas [data-t="terreno"]').click());await p.waitForTimeout(250);
const qs=await p.$$eval('#bl-terreno section.sec[data-q]',x=>x.map(y=>[y.id,y.classList.contains('qd-fechado')]));
ok(qs.length>=5&&!qs[0][1]&&qs.slice(1).every(q=>q[1]),'quadros: só o primeiro aberto '+JSON.stringify(qs));
await p.click('#sec-mats .qd-tg');await p.waitForTimeout(100);ok(!(await p.$eval('#sec-mats',x=>x.classList.contains('qd-fechado'))),'seta abre o quadro');
ok(await p.$eval('#sec-mats .qd-tg',x=>x.getAttribute('aria-expanded'))==='true','aria-expanded');
await p.click('#sec-mats .qd-tg');await p.waitForTimeout(100);ok(await p.$eval('#sec-mats',x=>x.classList.contains('qd-fechado')),'seta fecha o quadro');
ok(await p.$eval('#sec-mats .sec-b',x=>getComputedStyle(x).display)==='none','fechado esconde o corpo');
// cartório na localização
const loc=await p.$eval('#sec-loc',x=>x.textContent);ok(/Cartório de registro de imóveis/.test(loc),'cartório na localização');
if(!cel){await p.evaluate(()=>{const k=Object.keys(localStorage).find(x=>/^bkm-terrenos-prototipo-v/.test(x)),S=JSON.parse(localStorage.getItem(k)),t=S.terrenos.find(x=>x.codigo==='TER-000123');t.cri='13º CRI';t.criFonte='prefeitura';localStorage.setItem(k,JSON.stringify(S))});await p.reload();await p.waitForTimeout(400);
  await p.click('#sec-loc .qd-tg').catch(()=>{});await p.waitForTimeout(100);
  ok(/13º CRI · do GeoSampa/.test(await p.$eval('#sec-loc',x=>x.textContent)),'cartório do GeoSampa marcado');
  await p.evaluate(()=>document.querySelector('#sec-loc [data-a="edit"]').click());await p.waitForTimeout(150);
  await p.selectOption('#f-cri','4º CRI');await p.evaluate(()=>document.querySelector('#sec-loc form button.primary').click());await p.waitForTimeout(150);
  const t2=await p.evaluate(()=>{const k=Object.keys(localStorage).find(x=>/^bkm-terrenos-prototipo-v/.test(x)),t=JSON.parse(localStorage.getItem(k)).terrenos.find(x=>x.codigo==='TER-000123');return [t.cri,t.criFonte]});ok(t2[0]==='4º CRI'&&t2[1]==='digitado','trocar o cartório vira digitado '+t2);
  await p.screenshot({path:`${TMP}t_abas/${w}_${tema}_terreno_quadros.png`,fullPage:true})}
// pontos de interesse numa lista só
await p.evaluate(()=>document.querySelector('.fi-abas [data-t="entorno"]').click());await p.waitForTimeout(250);
const ent=await p.$eval('#ent-card',x=>x.textContent);ok(!/Cadastrados pela empresa/.test(ent),'pontos numa lista só');
ok(!(await p.$eval('#ent-card',x=>x.classList.contains('qd-fechado'))),'primeiro quadro do entorno aberto');
const c=await p.evaluate(()=>document.querySelector('#bl-comercial')?.textContent||'');
// abas fixas ao rolar
await p.evaluate(()=>document.querySelector('.fi-abas [data-t="terreno"]').click());await p.waitForTimeout(200);
await p.evaluate(()=>scrollTo(0,2000));await p.waitForTimeout(200);
const top=await p.$eval('.fi-abas',x=>x.getBoundingClientRect().top);ok(top>=56&&top<=80,'abas fixas no topo: '+top);
const terr=await p.$eval('#bl-terreno',x=>x.textContent);ok(!/Confrontações/.test(terr),'confrontações saiu');
// link antigo
await p.goto('file:///x/a.html#/terrenos/TER-000123/negociacao');await p.waitForTimeout(400);
ok(await p.$eval('.fi-abas [aria-selected="true"]',x=>x.dataset.t)==='comercial','link antigo /negociacao abre Comercial');
const com=await p.$eval('#bl-comercial',x=>x.textContent);for(const r of ['Ofertas recebidas','Propostas','Reuniões','Corretores'])ok(com.includes(r),'comercial sem '+r);
ok(!/Tarefas/.test(await p.$eval('.fi-abas',x=>x.textContent)),'sem aba Tarefas');
ok(!erros.length,'erros: '+erros.join(' | '));
// celular: a tabela de um quadro fechado não perde o "vira lista" quando a barra do navegador redimensiona a tela (resize com o quadro fechado)
if(cel){await p.evaluate(()=>document.querySelector('.fi-abas [data-t="comercial"]').click());await p.waitForTimeout(300);
  await p.evaluate(()=>dispatchEvent(new Event('resize')));await p.waitForTimeout(100);
  await p.evaluate(()=>document.querySelector('section.sec:has(.mini-tbl) .qd-tg').click());await p.waitForTimeout(200);
  const r=await p.evaluate(()=>{const w=document.querySelector('section.sec:has(.mini-tbl) .tblwrap');return [w.classList.contains('empilha'),w.querySelector('table').scrollWidth-w.clientWidth]});
  ok(r[0]&&r[1]<=1,'ofertas no celular viram lista depois de redimensionar '+r);await p.evaluate(()=>document.querySelector('section.sec:has(.mini-tbl)').scrollIntoView({block:'center'}));await p.waitForTimeout(200);await p.screenshot({path:`${TMP}t_abas/cel_ofertas.png`})}
await ctx.close()}
await b.close();console.log(falhas?falhas+' falha(s)':'ok')})();
