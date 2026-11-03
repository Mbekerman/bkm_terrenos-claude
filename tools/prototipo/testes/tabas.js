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
const p=await ctx.newPage();const erros=[];p.on('pageerror',e=>erros.push(e.message));
await p.goto('file:///x/a.html');await p.evaluate(t=>{localStorage.clear();localStorage.setItem('bkm-terrenos-tema',t)},tema);
await p.goto('file:///x/a.html#/terrenos/TER-000123');await p.reload();await p.waitForTimeout(500);
const n=await p.$$eval('.fi-abas button',x=>x.map(y=>y.dataset.t));ok(ABAS.every(a=>n.includes(a)),'abas: '+n.join(','));
ok(!(await p.$('.bl-seta')),'sem setas de abrir e fechar');
const meta=await p.$eval('.fi-meta',x=>x.textContent);ok(/Novos Negócios/.test(meta)&&/Cadastrado em/.test(meta),'topo: '+meta);
if(!cel){const g=await p.$eval('.geral',x=>getComputedStyle(x).gridTemplateColumns.split(' ').map(parseFloat));ok(g.length===2&&Math.abs(g[0]-g[1])<2,'duas metades '+g)}
const res=await p.$eval('.g-res',x=>x.textContent);for(const r of ['Endereço','Município e região','Zoneamento','Área adotada','Unidades do estudo válido','VGV do estudo válido','Distância do metrô','Valor pedido na entrada','Perfil topográfico','Corretor'])ok(res.includes(r),'resumo sem '+r);
await p.screenshot({path:`${TMP}t_abas/${w}_${tema}_geral.png`,fullPage:!cel});
for(const a of ABAS.slice(1)){await p.evaluate(a=>document.querySelector(`.fi-abas [data-t="${a}"]`).click(),a);await p.waitForTimeout(250);
  ok(await p.$eval('.fi-abas [aria-selected="true"]',x=>x.dataset.t)===a,'aba ativa '+a);
  ok((await p.evaluate(()=>location.hash)).endsWith('/'+a),'endereço da aba '+a);
  const sc=await p.evaluate(()=>document.documentElement.scrollWidth-innerWidth);ok(sc<=1,'rolagem lateral em '+a+' '+sc);
  await p.screenshot({path:`${TMP}t_abas/${w}_${tema}_${a}.png`,fullPage:!cel})}
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
await ctx.close()}
await b.close();console.log(falhas?falhas+' falha(s)':'ok')})();
