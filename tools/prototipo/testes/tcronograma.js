// Cronograma (bloco 2) e modelos de tarefas: predecessoras TI/II/TT/IT com defasagem e cascata, duração no cartão,
// aviso de II+TT com durações diferentes, círculo recusado, linha de base (analista pede, gestor aprova, atraso aparece),
// Leitura só vê, modelos (aplicar, salvar o quadro, padrão no terreno novo), calendário de dias úteis;
// prints em claro, escuro e celular.
const path=require('path'),fs=require('fs'),{chromium}=require('playwright');
const F=path.join(__dirname,'..','saida','bkm-terrenos.html'),L=path.join(__dirname,'..','libs','l')+'/',O=path.join(__dirname,'..','saida','t_cronograma')+'/';fs.mkdirSync(O,{recursive:true});
const falhas=[];const ok=(c,m)=>{console.log((c?'ok   ':'FALHA ')+m);if(!c)falhas.push(m)};
const est=p=>p.evaluate(()=>JSON.parse(localStorage.getItem('bkm-terrenos-prototipo-v9')));
const clica=(p,sel,txt)=>p.evaluate(([s,t])=>{let el=[...document.querySelectorAll(s)].find(x=>!t||x.textContent.includes(t));if(!el&&window.__tkAcha)el=window.__tkAcha(s,t);if(!el)throw new Error('não achei '+s+' '+(t||''));el.click()},[sel,txt||null]);
const muda=(p,sel,v)=>p.evaluate(([s,v])=>{let el=document.querySelector(s);if(!el&&window.__tkAcha)el=window.__tkAcha(s);if(!el)throw new Error('não achei '+s);if(el.tagName==='SELECT'&&![...el.options].some(o=>o.value===v)){const o=[...el.options].find(o=>o.textContent.includes(v));if(o)v=o.value}el.value=v;el.dispatchEvent(new Event('change',{bubbles:true}))},[sel,v]);
const preenche=(p,sel,v)=>p.evaluate(([s,v])=>{let el=document.querySelector(s);if(!el&&window.__tkAcha)el=window.__tkAcha(s);if(!el)throw new Error('não achei '+s);el.value=v},[sel,v]);
const envia=(p,sel)=>p.evaluate(s=>{let f=document.querySelector(s);if(!f&&window.__tkAcha)f=window.__tkAcha(s);if(!f)throw new Error('não achei '+s);f.requestSubmit()},sel);
const papel=(p,v)=>p.evaluate(v=>{const a=document.createElement('button');a.dataset.a='role';a.dataset.v=v;document.body.appendChild(a);a.click();a.remove()},v);
const ficha=(p,id)=>p.evaluate(id=>{const a=document.createElement('button');a.dataset.a='abrir';a.dataset.id=id;a.dataset.tab='tarefas';document.body.appendChild(a);a.click();a.remove()},id);
const toast=p=>p.evaluate(()=>document.querySelector('.toast')?.textContent||'');
const tar=(s,i,tit)=>s.terrenos[i].tarefas.find(k=>k.titulo===tit);
const addD=(d,n)=>{const x=new Date(d+'T12:00:00');x.setDate(x.getDate()+n);return x.toISOString().slice(0,10)};
const KML=Buffer.from('<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Placemark><name>Quadra</name><Polygon><outerBoundaryIs><LinearRing><coordinates>-46.6304,-23.6096 -46.6296,-23.6096 -46.6296,-23.6104 -46.6304,-23.6104 -46.6304,-23.6096</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark></kml>');
const TK_ACHA=()=>{window.__tkAcha=(s,t)=>{for(const v of [...document.querySelectorAll('#modal [data-a=tkc-aba]')].map(x=>x.dataset.v)){document.querySelector(`#modal [data-a=tkc-aba][data-v=${v}]`)?.click();const el=[...document.querySelectorAll(s)].find(x=>!t||x.textContent.includes(t));if(el)return el}return null}};  // cartão com abas: procura o elemento nas abas
(async()=>{const b=await chromium.launch(),erros=[];
const abre=async(w,h,tema)=>{const ctx=await b.newContext({viewport:{width:w,height:h},deviceScaleFactor:1});
  await ctx.route('**/*',r=>{const u=r.request().url();if(u.startsWith('file://'))return r.fulfill({path:F,contentType:'text/html; charset=utf-8'});if(/leaflet.js|jszip/.test(u))return r.fulfill({path:L+(u.includes('leaflet')?'leaflet.js':'jszip.min.js'),contentType:'application/javascript'});return r.abort()});
  const p=await ctx.newPage();await p.addInitScript(TK_ACHA);p.on('pageerror',e=>erros.push(e.message));await p.goto('file:///x/a.html');await p.evaluate(t=>{localStorage.clear();localStorage.setItem('bkm-terrenos-tema',t)},tema);await p.reload();await p.waitForTimeout(400);return {ctx,p}};
// ---------- desktop claro ----------
{const {ctx,p}=await abre(1440,900,'claro');
let s=await est(p);const t0=s.terrenos[0],HOJE=await p.evaluate(()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')});
const jur=tar(s,0,'Análise jurídica da matrícula'),mat=tar(s,0,'Pedir matrícula atualizada'),com=tar(s,0,'Levar ao comitê'),via=tar(s,0,'Estudo de viabilidade');
ok(s.modelos?.filter(m=>m.padrao&&!m.dono).length===1,'há um modelo da empresa marcado como padrão');
ok(jur&&jur.inicio===addD(mat.prazo,1),'TI: a análise jurídica começa no dia seguinte ao fim da matrícula');
ok(com.inicio===addD([jur.prazo,via.prazo].sort().at(-1),1),'com duas predecessoras, começa depois da que termina por último');
ok(com.resp===t0.resp&&(com.acomp||[]).includes(t0.resp),'"responsável do terreno" do modelo vira o responsável do terreno');
ok(t0.lbs?.[0]?.sit==='aprovada'&&t0.lbs[0].n===1,'exemplo com a linha de base 1 aprovada');
await ficha(p,t0.id);await p.waitForTimeout(400);
await clica(p,'[data-a=cr-vista][data-v=crono]');await p.waitForTimeout(250);
ok(await p.$('.cr-g')!==null&&(await p.$$('.cr-bar')).length>=6,'a seção Tarefas mostra o cronograma com as barras');
ok((await p.$$('.cr-base')).length>=6&&(await p.$$('.cr-bar.desvio')).length>=1,'a linha de base aparece embaixo e a tarefa atrasada em relação a ela fica vermelha');
ok(await p.$eval('.cr-lbb',x=>x.textContent.includes('Linha de base 1')&&x.textContent.includes('depois da base')),'faixa diz a linha de base e quantas tarefas passaram dela');
await p.evaluate(()=>document.querySelector('.cr-g').scrollIntoView({block:'center'}));await p.screenshot({path:O+'1_cronograma_ficha.png'});
// cartão: duração e predecessoras
await clica(p,'.cr-l','Estudo de massa');await p.waitForTimeout(250);await p.evaluate(()=>document.querySelector('#modal [data-a=tkc-aba][data-v=prazos]').click());await p.waitForTimeout(100);
ok(await p.$('#tkc-dur')!==null&&await p.$eval('.tkm',x=>x.textContent.includes('Predecessoras')&&x.textContent.includes('Consultar zoneamento')),'cartão mostra duração e predecessoras');
ok(await p.$eval('.tkm-lb',x=>x.textContent.startsWith('Base:')),'cartão mostra as datas da linha de base');
const antesCom=com.inicio;await muda(p,'#tkc-dur','8');await p.waitForTimeout(250);
s=await est(p);ok(tar(s,0,'Estudo de viabilidade').inicio===addD(tar(s,0,'Estudo de massa').prazo,1)&&tar(s,0,'Levar ao comitê').inicio>antesCom,'esticar a duração empurra as sucessoras em cascata');
ok(s.terrenos[0].hist.some(h=>h.txt.includes('Estudo de massa')&&h.txt.includes('datas')),'a mudança de datas fica no histórico com o usuário');
// defasagem
await muda(p,'[data-tkc=pred-def][data-i="0"]','2');await p.waitForTimeout(250);
s=await est(p);ok(tar(s,0,'Estudo de massa').inicio===addD(tar(s,0,'Consultar zoneamento e parâmetros').prazo,3),'defasagem de 2 dias atrasa o início em 2 dias');
await p.screenshot({path:O+'2_cartao.png'});
// mover o início para antes do que o vínculo deixa não funciona; para depois, move a tarefa inteira
const ini0=tar(s,0,'Estudo de massa').inicio,dur0=tar(s,0,'Estudo de massa').dur;
await muda(p,'#tkc-ini',addD(ini0,-5));await p.waitForTimeout(200);s=await est(p);ok(tar(s,0,'Estudo de massa').inicio===ini0,'início antes do que a predecessora deixa volta para o mais cedo possível');
await muda(p,'#tkc-ini',addD(ini0,4));await p.waitForTimeout(200);s=await est(p);ok(tar(s,0,'Estudo de massa').inicio===addD(ini0,4)&&tar(s,0,'Estudo de massa').dur===dur0,'início depois move a tarefa e mantém a duração');
await clica(p,'[data-a=close]');await p.waitForTimeout(150);
// II + TT com durações diferentes: aviso
await clica(p,'.cr-l','Estudo de viabilidade');await p.waitForTimeout(250);
await clica(p,'[data-a=cr-pred-novo]');await p.waitForTimeout(100);await muda(p,'[data-form=cr-pred] select[name=id]','Análise jurídica');await muda(p,'[data-form=cr-pred] select[name=tipo]','II');await envia(p,'[data-form=cr-pred]');await p.waitForTimeout(200);
await clica(p,'[data-a=cr-pred-novo]');await p.waitForTimeout(100);await muda(p,'[data-form=cr-pred] select[name=id]','Análise jurídica');await muda(p,'[data-form=cr-pred] select[name=tipo]','TT');await envia(p,'[data-form=cr-pred]');await p.waitForTimeout(200);
ok(await p.$('.cr-aviso')!==null,'II e TT com a mesma predecessora e durações diferentes abrem o aviso');
await p.screenshot({path:O+'3_aviso_ii_tt.png'});
await clica(p,'[data-a=cr-av-esticar]');await p.waitForTimeout(200);
s=await est(p);ok(tar(s,0,'Estudo de viabilidade').dur===tar(s,0,'Análise jurídica da matrícula').dur&&!(await p.$('.cr-aviso')),'"Esticar" iguala a duração e fecha o aviso');
await clica(p,'[data-a=close]');await p.waitForTimeout(150);
// círculo
await clica(p,'.cr-l','Pedir matrícula');await p.waitForTimeout(250);
await clica(p,'[data-a=cr-pred-novo]');await p.waitForTimeout(100);await muda(p,'[data-form=cr-pred] select[name=id]','Levar ao comitê');await envia(p,'[data-form=cr-pred]');await p.waitForTimeout(200);
s=await est(p);ok((await toast(p)).includes('círculo')&&!(tar(s,0,'Pedir matrícula atualizada').preds||[]).length,'vínculo que fecharia um círculo é recusado');
await clica(p,'[data-a=close]');await p.waitForTimeout(150);
// linha de base: analista pede, gestor aprova
await papel(p,'Analista');await p.waitForTimeout(200);
ok(await p.$eval('[data-a=cr-lb-enviar]',x=>x.textContent.includes('Pedir nova linha de base')),'analista vê "Pedir nova linha de base"');
await clica(p,'[data-a=cr-lb-enviar]');await p.waitForTimeout(150);await preenche(p,'#cr-mot','Cartório pediu mais prazo');await envia(p,'[data-form=cr-motivo]');await p.waitForTimeout(200);
s=await est(p);ok(s.terrenos[0].lbs.some(b=>b.sit==='pendente'&&b.por==='Rafael Souza')&&s.notifs.some(n=>n.para==='Ana Prado'&&n.txt.includes('cronograma')),'pedido fica aguardando e o gestor é avisado');
ok(!(await p.$('[data-a=cr-lb-aprovar]'))&&await p.$('[data-a=cr-lb-desistir]')!==null,'quem pediu não aprova, só cancela');
await papel(p,'Gestor');await p.waitForTimeout(200);
await p.screenshot({path:O+'4_aprovar_linha_base.png'});
await clica(p,'[data-a=cr-lb-aprovar]');await p.waitForTimeout(200);
s=await est(p);const lb=s.terrenos[0].lbs;ok(lb.find(b=>b.sit==='aprovada').n===2&&lb.find(b=>b.n===1).sit==='substituida','gestor aprova: linha de base 2 vale, a 1 fica substituída');
ok(s.terrenos[0].hist.some(h=>h.txt.includes('Linha de base 2 aprovada')&&h.user==='Ana Prado'),'a troca da linha de base fica no histórico');
ok((await p.$$('.cr-bar.desvio')).length===0,'com a base nova, nenhuma barra atrasada em relação a ela');
await clica(p,'[data-a=cr-lb-hist]');await p.waitForTimeout(150);ok((await p.$$('.cr-hr')).length===lb.length,'histórico das linhas de base lista todas');await clica(p,'[data-a=close]');await p.waitForTimeout(100);
// Leitura só vê
await papel(p,'Leitura');await p.waitForTimeout(200);
ok(!(await p.$('[data-a=cr-lb-enviar]'))&&!(await p.$('[data-a=cr-modelos]')),'Leitura não pede linha de base nem aplica modelo');
await clica(p,'.cr-l','Estudo de massa');await p.waitForTimeout(200);await p.evaluate(()=>document.querySelector('#modal [data-a=tkc-aba][data-v=prazos]').click());await p.waitForTimeout(100);ok(await p.$eval('#tkc-dur',x=>x.disabled)&&!(await p.$('[data-a=cr-pred-novo]')),'Leitura vê duração e predecessoras sem editar');
await clica(p,'[data-a=close]');await p.waitForTimeout(100);
// modelos: aplicar no segundo terreno e salvar o quadro
await papel(p,'Analista');await p.waitForTimeout(150);
const t1=s.terrenos[1];await ficha(p,t1.id);await p.waitForTimeout(300);
const n1=t1.tarefas.length;await clica(p,'[data-a=cr-modelos]');await p.waitForTimeout(200);
await preenche(p,'#cr-data',HOJE);await p.screenshot({path:O+'5_modelos.png'});
await clica(p,'[data-a=cr-mod-aplicar]');await p.waitForTimeout(250);
s=await est(p);const ts=s.terrenos[1].tarefas;ok(ts.length===n1+6&&ts.filter(k=>(k.preds||[]).length).length===4,'aplicar o modelo cria as 6 tarefas com as predecessoras ligadas');
ok(tar(s,1,'Pedir matrícula atualizada').inicio===HOJE&&(tar(s,1,'Pedir matrícula atualizada').aprov||[]).includes('Ana Prado'),'datas contadas da data escolhida e aprovador do modelo');
await clica(p,'[data-a=cr-modelos]');await p.waitForTimeout(150);ok(!(await p.$('[data-form=cr-mod-salvar] input[name=emp]')),'analista não salva modelo da empresa');
await preenche(p,'[data-form=cr-mod-salvar] input[name=nome]','Meu modelo de diligência');await envia(p,'[data-form=cr-mod-salvar]');await p.waitForTimeout(200);
s=await est(p);const mm=s.modelos.find(m=>m.nome==='Meu modelo de diligência');ok(mm&&mm.dono==='Rafael Souza'&&mm.tarefas.some(x=>x.preds.length)&&mm.tarefas.some(x=>x.resp==='@terreno'||x.resp===null||x.resp),'salvar o quadro guarda um modelo só seu, com as predecessoras');
await papel(p,'Gestor');await p.waitForTimeout(150);await clica(p,'[data-a=close]');await clica(p,'[data-a=cr-modelos]');await p.waitForTimeout(150);
ok(!(await p.$$eval('.cr-m b',x=>x.map(y=>y.textContent))).includes('Meu modelo de diligência'),'o modelo de uma pessoa não aparece para as outras');
await clica(p,'[data-a=close]');await p.waitForTimeout(100);
// Configurações › Tarefas: calendário e modelos da empresa
await papel(p,'Diretor');await p.evaluate(()=>history.replaceState(null,'','#/configuracoes/tarefas'));await p.reload();await p.waitForTimeout(400);
ok(await p.$('[data-a=cr-cal]')!==null&&(await p.$$('[name=cr-padrao]')).length>=1,'Configurações › Tarefas tem o calendário e os modelos da empresa');
await p.evaluate(()=>[...document.querySelectorAll('[data-a=cr-cal]')].find(x=>x.dataset.v==='true').click());await p.waitForTimeout(200);
s=await est(p);ok(s.calUteis===true&&s.terrenos[1].tarefas.filter(k=>k.inicio&&k.prazo&&!k.arq).every(k=>![0,6].includes(new Date(k.prazo+'T12:00:00').getDay())),'com dias úteis, nenhum prazo cai em fim de semana');
await p.evaluate(()=>[...document.querySelectorAll('[data-a=cr-cal]')].find(x=>x.dataset.v==='false').click());await p.waitForTimeout(150);
await clica(p,'[data-a=cr-mod-editar]');await p.waitForTimeout(200);ok((await p.$$('.cr-mr')).length===6,'editor do modelo mostra as 6 tarefas');
await muda(p,'.cr-mr:nth-child(2) [data-crm=dur]','4');await p.waitForTimeout(150);s=await est(p);ok(s.modelos[0].tarefas[1].dur===4,'editar a duração no modelo grava');
await p.screenshot({path:O+'6_editor_modelo.png'});await clica(p,'[data-a=close]');await p.waitForTimeout(100);
await p.evaluate(()=>document.querySelector('[data-a=cr-cal]').closest('.sec').nextElementSibling.scrollIntoView());await p.screenshot({path:O+'7_config.png'});
// terreno novo recebe o modelo padrão
await p.evaluate(()=>history.replaceState(null,'','#/terrenos'));await p.reload();await p.waitForTimeout(400);
await p.evaluate(()=>document.querySelector('[data-a=novo]').click());await p.waitForTimeout(200);
const [fc]=await Promise.all([p.waitForEvent('filechooser'),p.click('[data-a=nv-kmz]')]);await fc.setFiles({name:'quadra.kml',mimeType:'application/vnd.google-earth.kml+xml',buffer:KML});
await p.waitForSelector('#f-novo');await p.waitForTimeout(400);if(await p.$('#n-mun'))await p.fill('#n-mun','São Paulo · SP');await p.fill('#n-nome','Terreno do modelo');
await p.evaluate(()=>{document.querySelector('#f-novo [name=tipoEmp][value=mercado]')?.click();document.getElementById('f-novo').requestSubmit()});await p.waitForTimeout(400);
s=await est(p);const tn=s.terrenos.find(t=>t.nome==='Terreno do modelo');ok(tn&&tn.tarefas.length===6&&tn.tarefas.some(k=>(k.preds||[]).length),'terreno novo já nasce com as tarefas do modelo padrão');
await ctx.close()}
// ---------- escuro ----------
{const {ctx,p}=await abre(1440,900,'escuro');const s=await est(p);await ficha(p,s.terrenos[0].id);await p.waitForTimeout(400);
await clica(p,'[data-a=cr-vista][data-v=crono]');await p.waitForTimeout(250);await p.evaluate(()=>document.querySelector('.cr-g').scrollIntoView({block:'center'}));
await p.screenshot({path:O+'8_escuro.png'});
await clica(p,'.cr-l','Análise jurídica');await p.waitForTimeout(250);await p.screenshot({path:O+'9_escuro_cartao.png'});await ctx.close()}
// ---------- celular ----------
{const {ctx,p}=await abre(390,844,'claro');const s=await est(p);await ficha(p,s.terrenos[0].id);await p.waitForTimeout(400);
await clica(p,'[data-a=cr-vista][data-v=crono]');await p.waitForTimeout(250);await p.evaluate(()=>document.querySelector('.cr-g').scrollIntoView({block:'start'}));
const larg=await p.evaluate(()=>document.documentElement.scrollWidth);ok(larg<=390,`celular sem rolagem lateral da página (${larg})`);
await p.screenshot({path:O+'10_celular.png'});
await p.evaluate(()=>history.replaceState(null,'','#/tarefas/cronograma'));await p.reload();await p.waitForTimeout(400);
ok(await p.$('.cr-g')!==null,'/tarefas/cronograma abre a página no cronograma');await p.screenshot({path:O+'11_celular_pagina.png'});await ctx.close()}
// página Tarefas no cronograma, desktop
{const {ctx,p}=await abre(1440,900,'claro');await p.evaluate(()=>history.replaceState(null,'','#/tarefas/cronograma'));await p.reload();await p.waitForTimeout(400);
ok((await p.$$('.cr-gr')).length>=2,'página Tarefas agrupa o cronograma por terreno');await p.screenshot({path:O+'12_pagina.png'});await ctx.close()}
ok(!erros.length,'sem erro de JavaScript '+erros.join(' | '));
await b.close();console.log(falhas.length?`\n${falhas.length} FALHA(S)`:'\nTUDO OK');process.exit(falhas.length?1:0)})();
