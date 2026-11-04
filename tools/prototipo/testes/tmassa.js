// Estudos de massa (lote 4 da ficha em abas): pedido ao arquiteto, ficha com tipologias, áreas e índices, entrega,
// PDF e DWG em Documentos, estudo válido, viabilidade presa ao estudo (fixo ou seguindo o válido) e obra pela área
// construída. Claro, escuro e celular. Prints em saida/t_massa.
//   node tools/prototipo/testes/tmassa.js   (depois de python3 tools/prototipo/build.py)
const path=require('path'),fs=require('fs'),{chromium,devices}=require('playwright');
const OUT=path.join(__dirname,'..','saida','t_massa')+'/';fs.mkdirSync(OUT,{recursive:true});
const L=path.join(__dirname,'..','libs','l')+'/',F=path.join(__dirname,'..','..','..','docs','prototipo.html'),KEY='bkm-terrenos-prototipo-v9';
const TMPF=path.join(OUT,'estudo.pdf');fs.writeFileSync(TMPF,'%PDF-1.4');const TMPD=path.join(OUT,'estudo.dwg');fs.writeFileSync(TMPD,'AC1032');
(async()=>{const b=await chromium.launch();const errs=[];const ok=(c,m)=>{console.log((c?'ok  ':'FALHA ')+m);if(!c)errs.push(m)};
for(const [modo,tema] of [['desktop','claro'],['desktop','escuro'],['celular','claro']]){const tag=modo+'_'+tema,cel=modo==='celular';
const ctx=await b.newContext(cel?{...devices['Pixel 7']}:{viewport:{width:1440,height:900},deviceScaleFactor:2});
await ctx.route('**/*',r=>{const u=r.request().url();if(u.startsWith('file://'))return r.fulfill({path:F,contentType:'text/html; charset=utf-8'});if(/leaflet.js|jszip/.test(u))return r.fulfill({path:L+(u.includes('leaflet')?'leaflet.js':'jszip.min.js'),contentType:'application/javascript'});return r.abort()});
await ctx.addInitScript(()=>{window.__qdReal=true});
const p=await ctx.newPage();p.on('pageerror',e=>errs.push(tag+': '+e.message));
await p.goto('file:///x/a.html');await p.evaluate(t=>{localStorage.clear();localStorage.setItem('bkm-terrenos-tema',t)},tema);await p.reload();await p.waitForTimeout(400);
const D=()=>p.evaluate(k=>JSON.parse(localStorage.getItem(k)),KEY);
const toast=()=>p.$eval('#toast',e=>e.textContent);
const d0=await D(),tid=d0.viabs[0].tid,cod=d0.terrenos.find(t=>t.id===tid).codigo;
ok(d0.massas.length===2&&d0.massas[0].valido&&d0.viabs[0].massa===d0.massas[0].id&&d0.viabs[0].segue,tag+' exemplo: estudo de massa entregue e válido, seguido pelo primeiro estudo de viabilidade, e outro pedido');
await p.evaluate(c=>{location.hash='#/terrenos/'+c+'/massa'},cod);await p.waitForTimeout(500);
ok(await p.$eval('.fi-abas [data-t=massa]',e=>e.getAttribute('aria-selected')==='true'&&/2/.test(e.textContent)),tag+' aba Estudos de massa pelo endereço, com a contagem');
ok((await p.$$('#sec-massa-lista tbody tr')).length===2&&await p.$('#sec-massa-lista .vb-radio input:checked')&&/Estudo de massa 1/.test(await p.$eval('#sec-massa h2',e=>e.textContent)),tag+' lista com o válido marcado; abre a ficha do válido');
const m1=d0.massas[0];
ok(/Eficiência venal/.test(await p.$eval('#sec-massa',e=>e.innerText))&&(await p.$eval('[data-emso=efic]',e=>e.textContent))==='68%'.replace('68',Math.round(m1.tips.reduce((s,x)=>s+x.area*x.qtd,0)/m1.constr*1000)/10+'').replace('.',','),tag+' eficiência = privativa ÷ construída');
if(!cel){await p.evaluate(()=>document.querySelector('#sec-massa-lista').scrollIntoView({block:'start'}));await p.screenshot({path:OUT+tag+'_1aba.png'});
  await p.evaluate(()=>document.querySelector('#sec-massa .ems-tips').scrollIntoView({block:'center'}));await p.screenshot({path:OUT+tag+'_2ficha.png'})}
// pedir um estudo novo
await p.click('#sec-massa-lista [data-a=ems-form]');await p.waitForTimeout(200);
await p.click('[data-form=ems-novo] button.primary');await p.waitForTimeout(150);
ok((await D()).massas.length===2,tag+' sem arquiteto não pede');
const arq=d0.terrenos.find(t=>t.id===tid).resp;
await p.evaluate(a=>{const s=document.getElementById('ems-arq');s.value=a;s.dispatchEvent(new Event('change',{bubbles:true}))},arq);
await p.fill('#ems-brief','Torre única\nStudios no térreo');await p.click('[data-form=ems-novo] button.primary');await p.waitForTimeout(300);
let d=await D();const m3=d.massas.at(-1);
ok(d.massas.length===3&&m3.nome==='Estudo de massa 3'&&m3.sit==='solicitado'&&m3.arq===arq&&/Studios/.test(m3.briefing),tag+' pedido ao arquiteto com o briefing: Estudo de massa 3, Solicitado');
ok(/Estudo de massa 3/.test(await p.$eval('#sec-massa h2',e=>e.textContent))&&/Solicitado/.test(await p.$eval('#sec-massa .sec-h',e=>e.textContent)),tag+' abre a ficha do estudo pedido');
// lançamento do arquiteto
const fill=async(sel,v)=>{const l=p.locator(sel);await l.click();await l.fill(v);await l.press('Tab');await p.waitForTimeout(80)};
await p.click('#sec-massa [data-a=ems-tip-add]');await p.waitForTimeout(200);
d=await D();const tp=d.massas.at(-1).tips[0];
await fill(`[data-emtp="${tp.id}"] [data-k=nome]`,'2 dormitórios');await fill(`[data-emtp="${tp.id}"] [data-k=area]`,'42');await fill(`[data-emtp="${tp.id}"] [data-k=qtd]`,'120');
await p.click('#sec-massa [data-a=ems-tip-add]');await p.waitForTimeout(200);
d=await D();const tp2=d.massas.at(-1).tips[1];
await fill(`[data-emtp="${tp2.id}"] [data-k=nome]`,'Studio');await fill(`[data-emtp="${tp2.id}"] [data-k=area]`,'26');await fill(`[data-emtp="${tp2.id}"] [data-k=qtd]`,'40');
d=await D();ok(d.massas.at(-1).sit==='em_elaboracao'&&(await p.$eval('[data-emso=A]',e=>e.textContent)).replace(/\D/g,'')==='6080'&&(await p.$eval('[data-emso=un]',e=>e.textContent))==='160',
  tag+' tipologias: o primeiro dado põe em elaboração; área privativa total 6.080 m² e 160 unidades');
await p.click('#sec-massa [data-a=ems-entregar]');await p.waitForTimeout(150);
ok(/área construída/.test(await toast())&&(await D()).massas.at(-1).sit==='em_elaboracao',tag+' sem a área construída não entrega');
await fill('#sec-massa [data-ems=campo][data-k=constr]','8.000');await fill('#sec-massa [data-ems=campo][data-k=lct]','250');await fill('#sec-massa [data-ems=campo][data-k=vd]','20');await fill('#sec-massa [data-ems=campo][data-k=caL]','4');
ok((await p.$eval('[data-emso=efic]',e=>e.textContent))==='76%',tag+' eficiência refeita na hora: 6.080 ÷ 8.000 = 76%');
await p.click('#sec-massa [data-a=ems-entregar]');await p.waitForTimeout(250);
d=await D();ok(d.massas.at(-1).sit==='entregue'&&d.massas.at(-1).constr===8000&&d.massas.at(-1).vd===20&&d.massas.at(-1).caL===4,tag+' entregue, com os dados do arquiteto');
// arquivos
await p.setInputFiles('#ems-f-pdf',TMPF);await p.waitForTimeout(250);await p.setInputFiles('#ems-f-pdf',TMPF);await p.waitForTimeout(250);
await p.setInputFiles('#ems-f-dwg',TMPF);await p.waitForTimeout(200);ok(/\.dwg/.test(await toast()),tag+' no lugar do DWG, só .dwg');
await p.setInputFiles('#ems-f-dwg',TMPD);await p.waitForTimeout(250);
d=await D();const docs=d.terrenos.find(t=>t.id===tid).docs.filter(x=>x.ms===m3.id);
ok(docs.length===2&&docs.find(x=>x.tipo==='massa_pdf').versoes===2&&docs.find(x=>x.tipo==='massa_dwg').versoes===1,tag+' PDF e DWG em Documentos; o segundo PDF é a versão 2');
// válido: o estudo de viabilidade que segue o válido troca junto
const v0=d.viabs[0],pu0=v0.tips.find(x=>x.nome==='2 dormitórios')?.pu;
await p.click('#sec-massa [data-a=ems-valido]');await p.waitForTimeout(250);
d=await D();const v0b=d.viabs[0];
ok(d.massas.at(-1).valido&&!d.massas[0].valido&&v0b.massa===m3.id&&v0b.tips.map(x=>x.nome+':'+x.qtd).join()==='2 dormitórios:120,Studio:40'&&v0b.constr===8000&&(pu0==null||v0b.tips[0].pu===pu0),
  tag+' marcou o válido: a viabilidade que segue o válido troca as tipologias (mesmo nome guarda o preço) e a área construída');
// criar estudo de viabilidade preso a este estudo
await p.click('#sec-massa [data-a=ems-viab]');await p.waitForTimeout(200);
ok(!!(await p.$('#modal form[data-form=ems-viab]')),tag+' estudo válido: pergunta se a viabilidade segue o válido ou fica presa a ele');
await p.check('#modal input[name=segue][value=""]');await p.click('#modal form[data-form=ems-viab] button.primary');await p.waitForTimeout(400);
d=await D();const vn=d.viabs.at(-1);
ok(vn.nome==='Viabilidade do Estudo de massa 3'&&vn.massa===m3.id&&!vn.segue&&vn.tips.length===2&&vn.tips.every(x=>x.mt)&&vn.constr===8000,tag+' criou o estudo de viabilidade preso ao estudo de massa, com as tipologias e a área construída');
ok(await p.evaluate(()=>!!document.querySelector('#vb-pop')&&document.querySelector('#vb-pop [data-vb=tp][data-k=nome]').disabled&&!document.querySelector('#vb-pop [data-vb=tp][data-k=pu]').disabled&&!document.querySelector('#vb-pop [data-a=vb-tip-add]')),
  tag+' no popup: título, área e quantidade travados, preço livre, sem incluir tipologia');
ok(await p.$eval('#vb-pop [data-vb=ms]',e=>e.value)===m3.id,tag+' seletor do estudo de massa mostra o estudo preso');
if(!cel)await p.screenshot({path:OUT+tag+'_3viab.png'});
// obra pela área construída
await p.evaluate(()=>document.querySelector('.vb-nav [data-a=vb-aba][data-v=obra]').click());await p.waitForTimeout(150);
await p.evaluate(()=>{let b;while(b=document.querySelector('[data-a=vb-q-tg][aria-expanded=false]'))b.click()});await p.waitForTimeout(120);
await fill('#vb-pop [data-vb=hd][data-k=cm2]','2.000');
await p.selectOption('#vb-pop [data-vb=ob]','construida');await p.waitForTimeout(200);
ok(/16\.000\.000/.test(await p.$eval('[data-vbo=oi]',e=>e.textContent))&&/8\.000\s*m² de área construída/.test(await p.$eval('[data-vbo=oi-b]',e=>e.textContent))&&await p.$eval('#vb-pop [data-k=constr]',e=>e.disabled),
  tag+' obra pela área construída: 2.000/m² × 8.000 m² = 16 mi; a área vem do estudo de massa');
if(!cel)await p.screenshot({path:OUT+tag+'_4obra.png'});
// soltar do estudo de massa
await p.evaluate(()=>document.querySelector('.vb-nav [data-a=vb-aba][data-v=tip]').click());await p.waitForTimeout(150);
await p.selectOption('#vb-pop [data-vb=ms]','');await p.waitForTimeout(200);
d=await D();ok(!d.viabs.at(-1).massa&&d.viabs.at(-1).tips.length===2&&!(await p.$eval('#vb-pop [data-vb=tp][data-k=nome]',e=>e.disabled)),tag+' solto, as tipologias ficam e voltam a se editar');
await p.evaluate(()=>document.querySelector('[data-a=vb-fechar]').click());await p.waitForTimeout(200);
// apagar o não válido sem viabilidade
await p.click('#sec-massa-lista [data-a=ems-sel] >> nth=1');await p.waitForTimeout(250);
await p.click('#sec-massa [data-a=ems-apagar]');await p.waitForTimeout(150);await p.click('#modal [data-a=ems-apagar-ok]');await p.waitForTimeout(250);
ok((await D()).massas.length===2,tag+' apaga o estudo que não é válido nem tem viabilidade');
if(cel){await p.evaluate(()=>document.querySelector('#sec-massa').scrollIntoView({block:'start'}));await p.screenshot({path:OUT+tag+'_ficha.png'});
  await p.evaluate(()=>document.querySelector('#sec-massa .ems-tips').scrollIntoView({block:'center'}));await p.screenshot({path:OUT+tag+'_tips.png'})}
const larg=await p.evaluate(()=>document.documentElement.scrollWidth-innerWidth);ok(larg<=0,tag+' sem rolagem lateral ('+larg+')');
// Leitura só vê
await p.evaluate(()=>window.BKM_TESTE.escopo("()=>{UI.role='Leitura';render()}"));await p.waitForTimeout(250);
ok(await p.evaluate(()=>![...document.querySelectorAll('#sec-massa input,#sec-massa textarea,#sec-massa select')].some(x=>!x.disabled&&x.type!=='radio')&&!document.querySelector('[data-a=ems-form],[data-a=ems-tip-add]')),tag+' Leitura só vê');
await ctx.close()}
await b.close();console.log(errs.length?'\nFALHAS: '+errs.length+'\n'+errs.join('\n'):'\nTUDO OK');process.exit(errs.length?1:0)})();
