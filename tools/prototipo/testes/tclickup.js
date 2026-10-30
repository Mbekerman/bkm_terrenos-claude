// Tarefas no estilo ClickUp (30/out): Lista com círculo, subtarefas, automação do cartão, Calendário com arrastar, Funil em tabela, Cronograma com setas, celular.
const path=require('path'),fs=require('fs'),{chromium}=require('playwright');
const F=path.join(__dirname,'..','saida','bkm-terrenos.html'),L=path.join(__dirname,'..','libs','l')+'/',O=path.join(__dirname,'..','saida','t_clickup')+'/';fs.mkdirSync(O,{recursive:true});
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
const TK_ACHA=()=>{window.__tkAcha=(s,t)=>{for(const v of [...document.querySelectorAll('#modal [data-a=tkc-aba]')].map(x=>x.dataset.v)){document.querySelector(`#modal [data-a=tkc-aba][data-v=${v}]`)?.click();const el=[...document.querySelectorAll(s)].find(x=>!t||x.textContent.includes(t));if(el)return el}return null}};  // cartão com abas: procura o elemento nas abas
(async()=>{const b=await chromium.launch(),erros=[];
const abre=async(w,h,tema)=>{const ctx=await b.newContext({viewport:{width:w,height:h},deviceScaleFactor:1});
  await ctx.route('**/*',r=>{const u=r.request().url();if(u.startsWith('file://'))return r.fulfill({path:F,contentType:'text/html; charset=utf-8'});if(/leaflet.js|jszip/.test(u))return r.fulfill({path:L+(u.includes('leaflet')?'leaflet.js':'jszip.min.js'),contentType:'application/javascript'});return r.abort()});
  const p=await ctx.newPage();await p.addInitScript(TK_ACHA);p.on('pageerror',e=>erros.push(e.message));await p.goto('file:///x/a.html');await p.evaluate(t=>{localStorage.clear();localStorage.setItem('bkm-terrenos-tema',t)},tema);await p.reload();await p.waitForTimeout(400);return {ctx,p}};

const abreCartao=async(p,tit)=>{await clica(p,'.tk',tit);await p.waitForTimeout(250)};
const fecha=async p=>{await clica(p,'#modal [data-a=close]');await p.waitForTimeout(150)};
const kOf=(s,id)=>{for(const t of s.terrenos)for(const k of (t.tarefas||[]))if(k.id===id)return {t,k};return {}};
const execs=(s,aid)=>(s.autoExec||[]).filter(x=>!aid||x.aid===aid);
const regra=(s,nome)=>(s.automacoes||[]).find(r=>r.nome===nome);
const moveCartao=async(p,tit,nomeLista)=>{await abreCartao(p,tit);await muda(p,'#modal [data-tkc=lista]',nomeLista);await p.waitForTimeout(250);await fecha(p)};
const nav=async(p,r)=>{await p.evaluate(r=>document.querySelector(`[data-a=nav][data-r=${r}]`).click(),r);await p.waitForTimeout(200)};
const vista=async(p,v)=>{await clica(p,`[data-a=tk-vista][data-v=${v}]`);await p.waitForTimeout(250)};
{const {ctx,p}=await abre(1440,900,'claro');
let s=await est(p);const t0=s.terrenos[0];
// ---------- Lista ----------
await nav(p,'tarefas');await vista(p,'lista');
ok(await p.$$eval('.tl-g',x=>x.length)>=3&&!!(await p.$('.tl-gh .tl-st.st-fazer')),'Lista agrupa por status, com o chip tonal da lista');
await muda(p,'#tl-agr','terreno');await p.waitForTimeout(200);
ok((await p.$$eval('.tl-gh .tl-gn',x=>x.map(y=>y.textContent))).some(x=>x.includes('TER-')),'agrupar por terreno');
await muda(p,'#tl-agr','status');await p.waitForTimeout(200);
const kl=s.terrenos.flatMap(t=>t.tarefas.map(k=>({t,k}))).find(({k})=>!k.feita&&!k.arq&&!k.modelo&&!(k.aprov||[]).length&&!(k.checklists||[]).some(c=>c.itens.some(i=>!i.feito))&&!s.terrenos.some(t=>t.tarefas.some(x=>x.mae===k.id&&!x.feita))&&!(k.campos&&0));
await p.evaluate(([tid,kid])=>document.querySelector(`.tl-r[data-id="${tid}"][data-tk="${kid}"] [data-a=tl-feito]`).click(),[kl.t.id,kl.k.id]);await p.waitForTimeout(200);
s=await est(p);ok(!!kOf(s,kl.k.id).k.feita,'o círculo da linha conclui a tarefa');
await p.evaluate(([tid,kid])=>document.querySelector(`.tl-r[data-id="${tid}"][data-tk="${kid}"] [data-a=tl-feito]`).click(),[kl.t.id,kl.k.id]);await p.waitForTimeout(200);
s=await est(p);ok(!kOf(s,kl.k.id).k.feita,'e reabre');
ok(!(await p.$('#modal .tkm')),'o círculo não abre o cartão');
await p.screenshot({path:O+'1_lista.png'});
// ---------- Subtarefas ----------
await ficha(p,t0.id);await p.waitForTimeout(400);
const mae=s.terrenos[0].tarefas.find(k=>!k.feita&&!k.arq&&!k.modelo&&!k.mae&&!(k.checklists||[]).some(c=>c.itens.some(i=>!i.feito))&&!(k.aprov||[]).length&&s.terrenos[0].tarefas.filter(y=>y.titulo===k.titulo).length===1&&!s.terrenos[0].tarefas.some(x=>x.mae===k.id));
await abreCartao(p,mae.titulo);
await clica(p,'#modal [data-a=tkc-sub-nova]');await p.waitForTimeout(150);
await preenche(p,'[data-form=tkc-sub] input[name=titulo]','Subtarefa de teste');await envia(p,'[data-form=tkc-sub]');await p.waitForTimeout(250);
s=await est(p);const sub=s.terrenos[0].tarefas.find(k=>k.titulo==='Subtarefa de teste');
ok(sub&&sub.mae===mae.id,'a subtarefa nasce ligada à tarefa mãe');
ok((await p.$eval('#modal',x=>x.textContent)).includes('Subtarefa de teste'),'a mãe lista a subtarefa');
await clica(p,'#modal [data-a=tkc-concluir]');await p.waitForTimeout(250);
ok(!kOf(s,mae.id).k.feita&&(await toast(p)).includes('subtarefas'),'a mãe não conclui com subtarefa aberta');
await fecha(p);
ok((await p.$eval('.tk[aria-label="Subtarefa de teste"]',x=>x.textContent)).includes('subtarefa de'),'a frente da subtarefa mostra de quem ela é');
// ---------- Automação do cartão ----------
await abreCartao(p,mae.titulo);await clica(p,'#modal [data-a=tkc-aba][data-v=auto]');await p.waitForTimeout(150);
await clica(p,'#modal [data-a=au-nova]');await p.waitForTimeout(200);
await preenche(p,'#au-nome','Só deste cartão');await p.evaluate(()=>document.querySelector('#au-nome').dispatchEvent(new Event('input',{bubbles:true})));
ok(!(await p.$$eval('#modal select[data-au=gat] option',x=>x.map(o=>o.value))).includes('criada'),'a regra do cartão não oferece "cartão criado"');
await muda(p,'#modal [data-au=gat]','entrou_lista');await p.waitForTimeout(120);await muda(p,'#modal [data-au=gLista]','Fazendo');await p.waitForTimeout(120);
await envia(p,'[data-form=au-salvar]');await p.waitForTimeout(250);
s=await est(p);const rk=regra(s,'Só deste cartão');
ok(rk&&rk.kid===mae.id&&rk.tid===t0.id,'a regra fica presa ao cartão');
ok(!!(await p.$('#modal .tkm')),'salvar volta para o cartão');
await fecha(p);
const outra=s.terrenos[0].tarefas.find(k=>!k.feita&&!k.arq&&!k.modelo&&k.id!==mae.id&&k.id!==sub.id&&s.terrenos[0].tarefas.filter(y=>y.titulo===k.titulo).length===1&&s.terrenos[0].listas.find(l=>l.id===k.lista).nome!=='Fazendo');
await moveCartao(p,outra.titulo,'Fazendo');s=await est(p);
ok(execs(s,rk.id).length===0,'outro cartão entrando em Fazendo não dispara a regra');
await moveCartao(p,mae.titulo,'Fazendo');s=await est(p);
ok(execs(s,rk.id).length===1,'o próprio cartão dispara');
// copiar leva a regra
await abreCartao(p,mae.titulo);await clica(p,'#modal [data-a=tkc-pop][data-v=mais]');await p.waitForTimeout(100);await clica(p,'#modal .tkm-sb[data-v=copiar]');await p.waitForTimeout(200);
ok(await p.$eval('[data-form=cx-copiar] [name=it][value=automacoes]',x=>x.checked),'copiar oferece as automações do cartão, marcadas');
await envia(p,'[data-form=cx-copiar]');await p.waitForTimeout(250);s=await est(p);
const rs=(s.automacoes||[]).filter(r=>r.nome==='Só deste cartão');
ok(rs.length===2&&rs.some(r=>r.kid!==mae.id),'a cópia ganha a sua regra');
await fecha(p);
// ---------- Calendário ----------
await nav(p,'tarefas');await vista(p,'calendario');
ok(!!(await p.$('.tc-d.hoje'))&&await p.$$eval('.tc-ev',x=>x.length)>0,'Calendário mostra o mês com as tarefas no prazo');
s=await est(p);
const kc=s.terrenos.flatMap(t=>t.tarefas.map(k=>({t,k}))).find(({k})=>k.prazo&&!k.feita&&!k.arq&&!k.modelo&&k.prazo.slice(0,7)==='2026-10'&&!k.inicio);
const alvo='2026-10-20';
await p.evaluate(([tid,kid,d])=>{const el=document.querySelector(`.tc-ev[data-tcarr="${tid}|${kid}"]`),dt=new DataTransfer(),c=document.querySelector(`.tc-d[data-tcdia="${d}"]`);
  el.dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer:dt}));c.dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer:dt}));c.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:dt}));el.dispatchEvent(new DragEvent('dragend',{bubbles:true,dataTransfer:dt}))},[kc.t.id,kc.k.id,alvo]);
await p.waitForTimeout(250);s=await est(p);
ok(kOf(s,kc.k.id).k.prazo===alvo,'arrastar no calendário muda o prazo');
await clica(p,'[data-a=tc-mes][data-v="1"]');await p.waitForTimeout(150);
ok((await p.$eval('.tc-tit',x=>x.textContent)).includes('novembro'),'próximo mês');
await clica(p,'[data-a=tc-mes][data-v=hoje]');await p.waitForTimeout(150);
await p.screenshot({path:O+'2_calendario.png'});
// ---------- Funil ----------
await vista(p,'funil');
const nl=await p.$$eval('.tf2-r:not(.tf2-h)',x=>x.length);ok(nl>0,'Funil mostra os terrenos por fase, em tabela');
await p.evaluate(()=>document.querySelector('.tf2-r:not(.tf2-h) [data-a=tf-linha]').click());await p.waitForTimeout(200);
ok(await p.$$eval('.tf2-tk',x=>x.length)>0,'a seta da linha abre as tarefas do terreno');
await p.screenshot({path:O+'3_funil.png'});
// ---------- Cronograma ----------
await vista(p,'cronograma');
ok(await p.$$eval('.cr-bar > i',x=>x.length)>0&&await p.$$eval('.cr-setas path',x=>x.length)>0,'Cronograma com barras de andamento e setas das predecessoras');
await p.screenshot({path:O+'4_cronograma.png'});
// ---------- Predecessora pendente ----------
await nav(p,'tarefas');await vista(p,'lista');s=await est(p);
const livre=(t,k)=>!k.feita&&!k.arq&&!k.modelo&&!k.mae&&!(k.aprov||[]).length&&!(k.checklists||[]).some(c=>c.itens.some(i=>!i.feito))&&!t.tarefas.some(x=>x.mae===k.id&&!x.feita)&&!(k.preds||[]).length;
const tp=s.terrenos[0],kpc=tp.tarefas.find(k=>livre(tp,k)),kpr=tp.tarefas.find(k=>k!==kpc&&!k.feita&&!k.arq&&!k.modelo);
// predecessora TI em aberto, posta direto nos dados (o vínculo pela tela já é coberto no tcronograma)
await p.evaluate(([tid,kid,pid])=>{const st=JSON.parse(localStorage.getItem('bkm-terrenos-prototipo-v9'));const k=st.terrenos.find(t=>t.id===tid).tarefas.find(x=>x.id===kid);k.preds=[{id:pid,tipo:'TI',def:0}];localStorage.setItem('bkm-terrenos-prototipo-v9',JSON.stringify(st))},[tp.id,kpc.id,kpr.id]);
await p.reload();await p.waitForTimeout(500);await nav(p,'tarefas');await vista(p,'lista');
const linha=`.tl-r[data-id="${tp.id}"][data-tk="${kpc.id}"] [data-a=tl-feito]`;
await p.evaluate(sel=>document.querySelector(sel).click(),linha);await p.waitForTimeout(200);
ok(!!(await p.$('.pred-aviso-f'))&&(await p.$eval('.pred-aviso-f',x=>x.textContent)).includes('Concluir mesmo assim'),'concluir com predecessora pendente abre o aviso');
await p.screenshot({path:O+'6_aviso_pred.png'});
await p.click('.pred-aviso-f [data-pred=nao]');await p.waitForTimeout(200);s=await est(p);
ok(!kOf(s,kpc.id).k.feita&&!(await p.$('.pred-aviso-f')),'Cancelar não conclui');
await p.evaluate(sel=>document.querySelector(sel).click(),linha);await p.waitForTimeout(200);
await p.click('.pred-aviso-f [data-pred=sim]');await p.waitForTimeout(200);s=await est(p);
ok(!!kOf(s,kpc.id).k.feita&&JSON.stringify(s.terrenos[0].log||s.terrenos[0].hist||'').includes('concluída com predecessora pendente'),'Concluir mesmo assim conclui e fica no histórico');
await p.evaluate(sel=>document.querySelector(sel).click(),linha);await p.waitForTimeout(200);
await p.evaluate(()=>history.replaceState(null,'','#/configuracoes/tarefas'));await p.reload();await p.waitForTimeout(500);
await clica(p,'[data-a=ap-regra-pred]');await p.waitForTimeout(200);s=await est(p);ok(s.tkRegras?.predecessoras===true,'Configurações › Tarefas liga o bloqueio');
await nav(p,'tarefas');await vista(p,'lista');
await p.evaluate(sel=>document.querySelector(sel).click(),linha);await p.waitForTimeout(200);s=await est(p);
ok(!kOf(s,kpc.id).k.feita&&!(await p.$('.pred-aviso-f'))&&(await toast(p)).includes('predecessoras'),'com o bloqueio, não conclui e diz o que falta');
await ctx.close()}
{const {ctx,p}=await abre(390,844,'claro');
await nav(p,'tarefas');
for(const v of ['lista','calendario','funil','cronograma']){await vista(p,v);ok(await p.evaluate(()=>document.documentElement.scrollWidth<=390),'celular sem rolagem lateral: '+v)}
await vista(p,'calendario');await p.evaluate(()=>document.querySelector('.tc-d[data-tcsel="2026-10-28"]').click());await p.waitForTimeout(200);
ok((await p.$eval('.tc-dial',x=>x.textContent)).includes('28 out')&&await p.$$eval('.tc-dial .tc-sp',x=>x.length)>0,'no celular, tocar no dia lista as tarefas dele');
await p.screenshot({path:O+'5_cal_cel.png'});
await ctx.close()}
console.log(erros.length?'ERROS: '+erros.join(' | '):'sem erros de página');
console.log(falhas.length?`${falhas.length} FALHA(S)`:'TUDO OK');await b.close();process.exit(falhas.length||erros.length?1:0)})();
