// Mercado (monitor de mercado, retrato em docs/dados/mercado.json): pinos no mapa, legenda liga e desliga, janela com os
// números, filtro do mercado (unidade dentro de todos os filtros de unidade ao mesmo tempo; programa social; incorporadora;
// datas com "Incluir sem informação"), Esc fecha, e a ficha (aba Entorno) com R$/m² médio e VSO médio a 1, 2 e 3 km.
// Claro, escuro e celular. Prints em saida/t_merc.
const path=require('path'),fs=require('fs');
const TMP=path.join(__dirname,'..','saida')+'/';const OUT=TMP+'t_merc/';fs.mkdirSync(OUT,{recursive:true});
const {chromium,devices}=require('playwright');
const L=path.join(__dirname,'..','libs','l')+'/';const F=path.join(__dirname,'..','..','..','docs','prototipo.html');const DADOS=path.join(__dirname,'..','..','..','docs','dados')+'/';
const MERC=JSON.parse(fs.readFileSync(DADOS+'mercado.json','utf8'));
// tabela completa vinda do banco do monitor (im_tabela_empreendimento), simulada: 2 à venda, 1 reservada, 1 vendida
const TAB=id=>({empreendimento:{id,nome:'Residencial Teste',incorporadora:'Incorporadora Teste',cnpj:'12.345.678/0001-90',endereco:'Rua Teste, 100',bairro:'Centro',torres:2,tipo:'vertical',finalidade:'residencial',situacao:'em_obras',lancamento:'2025-09-01',entrega:'2028-12-30',programa_social:'sim',link:'https://www.orulo.com.br/buildings/1',unidades:4},
  unidades:[{torre:'A',numero:'101',andar:1,dormitorios:2,suites:1,vagas:1,area:40.31,tipo:'apartamento',situacao:'disponivel',preco:300000,primeiro_preco:280000,primeiro_preco_em:'2025-10-01'},
    {torre:'A',numero:'102',andar:1,dormitorios:2,suites:0,vagas:0,area:40.31,tipo:'apartamento',situacao:'disponivel',preco:310000},
    {torre:'B',numero:'201',andar:2,dormitorios:1,suites:0,vagas:0,area:30,tipo:'studio',situacao:'reservada',preco:250000},
    {torre:'B',numero:'202',andar:2,dormitorios:3,suites:1,vagas:1,area:60,tipo:'garden',situacao:'vendida',preco:null,primeiro_preco:500000,vendida_de:'2026-10-24',vendida_ate:'2026-11-01'}]});
(async()=>{const b=await chromium.launch();const errs=[];const ok=(c,m)=>{console.log((c?'ok  ':'FALHA ')+m);if(!c)errs.push(m)};
for(const [modo,tema] of [['desktop','claro'],['desktop','escuro'],['celular','claro']]){const tag=modo+'_'+tema;
const ctx=await b.newContext(modo==='desktop'?{viewport:{width:1440,height:900},deviceScaleFactor:1}:{...devices['Pixel 7']});
await ctx.route('**/*',r=>{const u=r.request().url();
  if(/\/dados\//.test(u)){const n=u.split('/dados/')[1];return fs.existsSync(DADOS+n)?r.fulfill({path:DADOS+n,contentType:'application/json'}):r.fulfill({status:404,body:''})}
  if(u.startsWith('http://bkm.test/prototipo'))return r.fulfill({path:F,contentType:'text/html; charset=utf-8'});
  if(/leaflet.js|jszip/.test(u))return r.fulfill({path:L+(u.includes('leaflet')?'leaflet.js':'jszip.min.js'),contentType:'application/javascript'});
  if(/supabase\.co\/rest\/v1\/rpc\/im_tabela_empreendimento/.test(u)){const id=JSON.parse(r.request().postData()).p_id;return r.fulfill({contentType:'application/json',body:JSON.stringify(TAB(id))})}
  if(/cartocdn|openstreetmap|arcgisonline/.test(u))return r.fulfill({path:path.join(__dirname,'tile.png'),contentType:'image/png'});return r.abort()});
const p=await ctx.newPage();p.on('pageerror',e=>errs.push(tag+': '+e.message));
await p.goto('http://bkm.test/prototipo/');await p.evaluate(t=>{localStorage.clear();localStorage.setItem('bkm-terrenos-tema',t)},tema);await p.reload();await p.waitForTimeout(400);
await p.evaluate(()=>document.querySelector('[data-a=nav][data-r=mapa]').click());await p.waitForTimeout(1500);
const total=MERC.emps.length,nPins=()=>p.$eval('.mapa-area',x=>+x.dataset.merc);
ok(await nPins()===total,tag+' '+total+' empreendimentos do monitor no mapa');
const leg=async()=>(await p.$eval('#mp-leg [data-a=mp-merc]',x=>x.textContent).catch(()=>'')).replace(/\D/g,'');
ok(+await leg()===total,tag+' legenda Mercado com '+total);
ok(!(await p.$('#mp-leg [data-a=mp-conc]'))&&!(await p.$('#mapa .conc')),tag+' sem concorrência cadastrada à mão no mapa nem na legenda');
// janela: o empreendimento de mais estoque com preço
const alvo=MERC.emps.filter(e=>e[13]!=null).sort((a,b)=>b[12]-a[12])[0];
await p.evaluate(id=>window.__mkAbrir(id),alvo[0]);await p.waitForTimeout(300);
const box=await p.$eval('#mk-box',x=>x.textContent.replace(/\s+/g,' ')).catch(()=>'');
const m2=Math.round(alvo[13]/alvo[14]).toLocaleString('pt-BR');
ok(box.includes(alvo[1])&&box.includes(m2)&&/Estoque/.test(box)&&/VSO/.test(box)&&/Enquadramento social: (Sim|Não|Não informado)/.test(box)&&!/Programa social/.test(box)&&/Tipologia/.test(box)&&/Monitor de mercado/.test(box),tag+' janela com R$/m² '+m2+': '+box.slice(0,160));
const vis=await p.$eval('#mk-box .cc-box',x=>{const r=x.getBoundingClientRect(),a=document.querySelector('.mapa-area').getBoundingClientRect();return r.left>=a.left-1&&r.right<=a.right+1&&r.bottom<=a.bottom+1&&r.top>=a.top-1});ok(vis,tag+' janela dentro do mapa');
const tipOk=alvo[17].filter(g=>g[4]>=3),foraN=alvo[17].filter(g=>g[4]<3).reduce((s,g)=>s+g[4],0);
const nTip=await p.$$eval('#mk-box .mk-t tbody tr',x=>x.length);ok(nTip===tipOk.length,tag+' card com as '+tipOk.length+' tipologias do resumo (grupos com menos de 3 fora)');
// grupo pequeno que não juntou com nenhum sai do resumo e vira nota de "fora do padrão" (decisão do Moisés, 4/nov/2026)
{const e2=MERC.emps.find(e=>(e[17]||[]).some(g=>g[4]<3)&&(e[17]||[]).some(g=>g[4]>=3)),n2=e2[17].filter(g=>g[4]<3).reduce((s,g)=>s+g[4],0);
 await p.evaluate(id=>window.__mkAbrir(id),e2[0]);await p.waitForTimeout(300);
 const r=await p.$$eval('#mk-box .mk-t tbody tr',x=>x.length),nota=await p.$eval('#mk-box .mk-fora',x=>x.textContent).catch(()=>'');
 ok(r===e2[17].filter(g=>g[4]>=3).length&&nota.includes(n2.toLocaleString('pt-BR')+' unidade'),tag+' '+n2+' unidades fora do padrão saem do resumo: '+nota);
 await p.evaluate(id=>window.__mkAbrir(id),alvo[0]);await p.waitForTimeout(300)}
await p.screenshot({path:OUT+tag+'_1_janela.png'});
// tabela completa no popup (decisão do Moisés, 4/nov/2026)
await p.click('#mk-box [data-a=mk-tabela]');await p.waitForSelector('.mkt-dlg table.mkt',{timeout:5000}).catch(()=>{});
{const t=await p.$eval('.mkt-dlg',x=>x.textContent.replace(/\s+/g,' ')).catch(()=>''),n=await p.$$eval('.mkt-dlg tbody tr',x=>x.length),nm=await p.$$eval('.mkt-dlg .mkt-r',x=>x.length);
 ok(n===4&&nm===4&&/Incorporadora Teste/.test(t)&&/12\.345\.678\/0001-90/.test(t)&&/Enquadramento social\s*Sim/.test(t)&&/Ver no Órulo/.test(t)&&/24\/10\/2026\s*a 01\/11\/2026/.test(t)&&!/6\.946/.test(t)&&/em 01\/10\/2025/.test(t)&&/7\.442/.test(t),tag+' popup com cabeçalho e as 4 unidades: '+t.slice(0,120));
 await p.screenshot({path:OUT+tag+'_3_tabela.png'});
 await p.click('.mkt-dlg [data-f=venda]');await p.waitForTimeout(150);ok(await p.$$eval('.mkt-dlg tbody tr',x=>x.length)===3&&await p.$$eval('.mkt-dlg .mkt-r',x=>x.length)===3,tag+' À venda mostra 3 (disponível e reservada)');
 await p.click('.mkt-dlg [data-f=vendida]');await p.waitForTimeout(150);ok(await p.$$eval('.mkt-dlg tbody tr',x=>x.length)===1,tag+' Vendidas mostra 1');
 const larg=await p.$eval('.mkt-dlg',x=>x.scrollWidth<=x.clientWidth+1&&[...x.querySelectorAll('.mkt-w')].every(w=>w.querySelector('table').getBoundingClientRect().right<=w.getBoundingClientRect().right+1));ok(larg,tag+' popup sem rolagem lateral');
 await p.click('.mkt-dlg [data-a=close]');await p.waitForTimeout(150);ok(!(await p.$('.mkt-dlg')),tag+' X fecha o popup')}
await p.keyboard.press('Escape');await p.waitForTimeout(200);ok(!(await p.$('#mk-box .cc-box')),tag+' Esc fecha a janela');
// filtro: 2 dormitórios até R$ 300 mil, na mesma unidade
await p.click('.mapa-area [data-a=mf-abrir]');await p.waitForTimeout(300);ok(!!(await p.$('#mf-dr')),tag+' botão Mercado abre o filtro');
const esperado=(f)=>MERC.emps.filter(e=>(e[16]||'').split(';').filter(Boolean).some(s=>{const [d,a,pr]=s.split(',').map(x=>x===''?null:+x);return f(d,a,pr)})).length;
const digita=async(k,pp,v)=>{await p.fill(`#mf-dr [data-mf=${k}][data-p=${pp}]`,v);await p.dispatchEvent(`#mf-dr [data-mf=${k}][data-p=${pp}]`,'change');await p.waitForTimeout(250)};
await digita('dorm','min','2');await digita('dorm','max','2');await digita('preco','max','300 mil');
const e1=esperado((d,a,pr)=>d===2&&pr!=null&&pr<=300000),n1=await nPins();
ok(n1===e1&&n1>0&&n1<total,tag+' 2 dorms até 300 mil na mesma unidade: '+n1+' (esperado '+e1+')');
const solto=MERC.emps.filter(e=>{const us=(e[16]||'').split(';').filter(Boolean).map(s=>s.split(',').map(x=>x===''?null:+x));return us.some(u=>u[0]===2)&&us.some(u=>u[2]!=null&&u[2]<=300000)}).length;
ok(solto>n1,tag+' filtro não junta unidades diferentes ('+solto+' passariam juntando)');
ok(/Ver [\d.]+ empreendimento/.test(await p.$eval('#mf-f',x=>x.textContent))&&+(await leg())===n1,tag+' rodapé e legenda com o número filtrado');
await p.screenshot({path:OUT+tag+'_2_filtro.png'});
await digita('m2','min','9.000');const e2=esperado((d,a,pr)=>d===2&&pr!=null&&pr<=300000&&a>0&&pr/a>=9000);ok(await nPins()===e2,tag+' + R$/m² mínimo 9.000: '+e2);
await p.click('#mf-dr [data-a=mf-limpar]');await p.waitForTimeout(300);ok(await nPins()===total,tag+' Limpar tudo volta todos');
await p.click('#mf-dr [data-a=mf-op][data-k=prog][data-v=sim]');await p.waitForTimeout(300);
const eProg=MERC.emps.filter(e=>e[10]==='sim').length;ok(await nPins()===eProg,tag+' programa social Sim: '+eProg);
await p.click('#mf-dr [data-a=mf-op][data-k=prog][data-v=sim]');await p.waitForTimeout(200);
await p.fill('#mf-dr [data-mf-busca]','cury');await p.waitForTimeout(300);
const cury=await p.$$eval('#mf-dr [data-k=inc]',x=>x.map(y=>y.dataset.v));ok(cury.length>0&&cury.every(v=>/cury/i.test(v)),tag+' busca da incorporadora: '+cury.join(', '));
await p.click(`#mf-dr [data-a=mf-op][data-k=inc][data-v="${cury[0]}"]`);await p.waitForTimeout(300);
ok(await nPins()===MERC.emps.filter(e=>e[2]===cury[0]).length,tag+' filtro pela incorporadora '+cury[0]);
await p.click('#mf-dr [data-a=mf-limpar]');await p.waitForTimeout(200);
await digita('ent','max','2026-12-31');const semEnt=MERC.emps.filter(e=>!e[9]).length,e3=MERC.emps.filter(e=>e[9]&&e[9]<='2026-12-31').length;
ok(await nPins()===e3,tag+' entrega até 31/12/2026: '+e3);
if(semEnt){await p.click('#mf-dr [data-a=mf-sem][data-k=ent]');await p.waitForTimeout(300);ok(await nPins()===e3+semEnt,tag+' incluir sem informação soma '+semEnt)}
await p.click('#mf-dr [data-a=mf-limpar]');await p.waitForTimeout(200);
await p.keyboard.press('Escape');await p.waitForTimeout(200);ok(!(await p.$('#mf-dr')),tag+' Esc fecha o filtro');
// legenda desliga
await p.evaluate(()=>{const lg=document.querySelector('.mp-legenda');if(lg)lg.open=true});
const bt=await p.$('#mp-leg [data-a=mp-merc]');if(bt&&await bt.isVisible()){await bt.click();await p.waitForTimeout(300);
  ok(await p.$eval('#mp-leg [data-a=mp-merc]',x=>x.getAttribute('aria-pressed'))==='false',tag+' desligar Mercado na legenda');await p.click('#mp-leg [data-a=mp-merc]');await p.waitForTimeout(300);ok(await p.$eval('#mp-leg [data-a=mp-merc]',x=>x.getAttribute('aria-pressed'))==='true',tag+' religar')}
// ficha: aba Entorno, R$/m² médio e VSO médio a 1, 2 e 3 km
await p.evaluate(()=>document.querySelector('[data-a=nav][data-r=terrenos]').click());await p.waitForTimeout(400);
const t=await p.evaluate(()=>{const k=Object.keys(localStorage).find(k=>{try{return !!JSON.parse(localStorage.getItem(k)).terrenos}catch(e){return false}});
  const t=JSON.parse(localStorage.getItem(k)).terrenos.find(x=>x.lat!=null);document.querySelector(`[data-a=abrir][data-id="${t.id}"]`).click();return {lat:t.lat,lng:t.lng}});await p.waitForTimeout(500);
await p.evaluate(()=>{const b=document.querySelector('.fi-abas [data-t=entorno]');if(b.getAttribute('aria-selected')!=='true')b.click()});await p.waitForTimeout(600);
const linhas=await p.$$eval('.mk-sec .mk-cat tbody tr',tr=>tr.map(x=>[...x.children].map(c=>c.textContent.trim())));
const dk=(a,b,c,d)=>{const r=x=>x*Math.PI/180,R=6371,dl=r(c-a),dg=r(d-b);const h=Math.sin(dl/2)**2+Math.cos(r(a))*Math.cos(r(c))*Math.sin(dg/2)**2;return 2*R*Math.asin(Math.sqrt(h))};
const r2=MERC.emps.filter(e=>dk(t.lat,t.lng,e[5],e[6])<=2),r2c=r2.filter(e=>e[10]==='sim');let sp=0,sa=0;r2c.forEach(e=>{if(e[13]!=null&&e[14]>0){sp+=e[13];sa+=e[14]}});
const m2esp=sa?Math.round(sp/sa).toLocaleString('pt-BR'):'—';
ok(linhas.length===6&&/1 km/.test(linhas[0][0])&&/3 km/.test(linhas[4][0])&&linhas[0][1]==='Com'&&linhas[1][1]==='Sem',tag+' três raios, com e sem programa social: '+linhas.map(l=>l.join(' | ')).join(' / '));
ok(+linhas[2][2].replace(/\D/g,'')+ +linhas[3][2].replace(/\D/g,'')===r2.length&&linhas[2][4].replace(/\D/g,'')===m2esp.replace(/\D/g,''),tag+' 2 km: '+r2.length+' empreend., com programa social R$/m² '+m2esp);
const ne=r2.filter(e=>['lancamento','breve_lancamento','em_obras'].includes(e[7])).length,nit=await p.$$eval('.mk-sec .mk-it',x=>x.length);
ok(nit===ne,tag+' lista dos não entregues a 2 km: '+nit+' (esperado '+ne+')');
if(nit){await p.click('.mk-sec .mk-it summary');await p.waitForTimeout(200);const tb=await p.$$eval('.mk-sec .mk-it[open] .mk-t tbody tr',x=>x.length);ok(tb>0,tag+' abrir mostra o resumo do empreendimento ('+tb+' tipologias)')}
await p.click('.mk-sec [data-a=mk-raio][data-v="1"]');await p.waitForTimeout(300);
const ne1=MERC.emps.filter(e=>dk(t.lat,t.lng,e[5],e[6])<=1&&['lancamento','breve_lancamento','em_obras'].includes(e[7])).length;
ok(await p.$$eval('.mk-sec .mk-it',x=>x.length)===ne1,tag+' raio de 1 km na lista: '+ne1);
await p.click('.mk-sec [data-a=mk-raio][data-v="2"]');await p.waitForTimeout(300);
ok(/VSO médio/.test(await p.$eval('.mk-sec',x=>x.textContent)),tag+' VSO médio na ficha');
await p.evaluate(()=>document.querySelector('.mk-sec').scrollIntoView({block:'start'}));await p.waitForTimeout(200);await p.screenshot({path:OUT+tag+'_3_ficha.png'});
await ctx.close()}
await b.close();console.log(errs.length?'\nFALHAS: '+errs.length+'\n'+errs.join('\n'):'\ntudo ok');process.exit(errs.length?1:0)})();
