// Kanban: arrastando um card, as colunas que aceitam ficam tracejadas, a que está sob o card acende
// (a de origem não) e, fora das colunas, nenhuma; soltar limpa tudo. Negociações e tarefas da ficha.
const path=require('path'),fs=require('fs'),{chromium}=require('playwright');
const F=path.join(__dirname,'..','saida','bkm-terrenos.html'),L=path.join(__dirname,'..','libs','l')+'/',O=path.join(__dirname,'..','saida','t_arrasto')+'/';fs.mkdirSync(O,{recursive:true});
const falhas=[];const ok=(c,m)=>{console.log((c?'ok   ':'FALHA ')+m);if(!c)falhas.push(m)};
(async()=>{const b=await chromium.launch(),erros=[];
for(const tema of ['claro','escuro']){
const ctx=await b.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1.25});
await ctx.route('**/*',r=>{const u=r.request().url();if(u.startsWith('file://'))return r.fulfill({path:F,contentType:'text/html; charset=utf-8'});if(/leaflet.js|jszip/.test(u))return r.fulfill({path:L+(u.includes('leaflet')?'leaflet.js':'jszip.min.js'),contentType:'application/javascript'});return r.abort()});
const p=await ctx.newPage();p.on('pageerror',e=>erros.push(e.message));await p.goto('file:///x/a.html');await p.evaluate(t=>{localStorage.clear();localStorage.setItem('bkm-terrenos-tema',t)},tema);await p.reload();await p.waitForTimeout(400);
const ev=(sel,tipo,dt,i=0)=>p.evaluate(([s,t,i])=>{const el=document.querySelectorAll(s)[i],r=el.getBoundingClientRect();el.dispatchEvent(new DragEvent(t,{bubbles:true,cancelable:true,dataTransfer:window.__dt,clientX:r.x+r.width/2,clientY:r.y+r.height-20}))},[sel,tipo,i]);
const classes=()=>p.evaluate(()=>({dnd:document.body.classList.contains('dnd')||document.body.classList.contains('dnd-tk'),sobre:[...document.querySelectorAll('.sobre')].map(x=>x.dataset.col||x.dataset.tkcol),origem:[...document.querySelectorAll('.col.origem')].map(x=>x.dataset.col)}));
// negociações
await p.evaluate(()=>document.querySelector('[data-a=nav][data-r=negociacoes]').click());await p.waitForTimeout(300);await p.evaluate(()=>document.querySelector('[data-a=neg-fase][data-v=novos_negocios]').click());await p.waitForTimeout(200);
await p.evaluate(()=>{window.__dt=new DataTransfer()});
const orig=await p.evaluate(()=>document.querySelector('.kcard[draggable=true]').closest('.col').dataset.col);
const alvo=await p.evaluate(o=>[...document.querySelectorAll('.col[data-col]')].findIndex(c=>c.dataset.col!==o),orig);
await ev('.kcard[draggable=true]','dragstart');await ev('.col[data-col]','dragover',null,alvo);
let c=await classes();const alvoK=await p.evaluate(i=>document.querySelectorAll('.col[data-col]')[i].dataset.col,alvo);
ok(c.dnd&&c.sobre.length===1&&c.sobre[0]===alvoK&&c.origem[0]===orig,`${tema}: negociações, a coluna sob o card acende (${alvoK}); origem ${orig} marcada`);
await p.waitForTimeout(250);const cor=await p.evaluate(()=>getComputedStyle(document.querySelector('.col.sobre')).backgroundColor);ok(cor!=='rgba(0, 0, 0, 0)',`${tema}: fundo aceso ${cor}`);
await p.screenshot({path:O+tema+'_negociacoes.png'});
await ev('.col.origem','dragover');c=await classes();ok(!c.sobre.length,`${tema}: sobre a própria coluna, nada acende`);
await ev('.topbar, header, body','dragover');c=await classes();ok(!c.sobre.length,`${tema}: fora das colunas, nada acende`);
await ev('.kcard.arrastando','dragend');c=await classes();ok(!c.dnd&&!c.sobre.length&&!c.origem.length,`${tema}: ao soltar fora, tudo limpo`);
// tarefas
await p.evaluate(()=>document.querySelector('[data-a=nav][data-r=tarefas]').click());await p.waitForTimeout(300);
const tem=await p.$('.tk[draggable=true]');
if(tem){await ev('.tk[draggable=true]','dragstart');const n=await p.$$eval('.tk-col',x=>x.length);await ev('.tk-col','dragover',null,n-1);c=await classes();
  ok(c.dnd&&c.sobre.length===1,`${tema}: tarefas, a coluna sob o card acende (${c.sobre[0]})`);
  await p.evaluate(()=>document.querySelector('.tk-col.sobre').scrollIntoView({block:'center'}));await p.screenshot({path:O+tema+'_tarefas.png'});
  await ev('.tk-col','drop',null,n-1);c=await classes();ok(!c.dnd&&!c.sobre.length,`${tema}: tarefas, ao soltar tudo limpo`)}
else ok(false,'sem tarefa arrastável');
// com pendência (checklist em aberto), Feito fica apagada, não acende e não recebe o cartão
{const i=await p.$$eval('.tk[draggable=true]',xs=>xs.findIndex(x=>x.getAttribute('aria-label')==='Levar ao comitê'));const f=await p.$$eval('.tk-col',xs=>xs.findIndex(x=>x.dataset.tkcol==='Feito'));
 ok(i>=0&&f>=0,`${tema}: cartão com checklist em aberto e lista Feito na tela`);
 await p.evaluate(()=>{window.__dt=new DataTransfer()});await ev('.tk[draggable=true]','dragstart',null,i);await ev('.tk-col','dragover',null,f);
 const st=await p.evaluate(()=>({nao:[...document.querySelectorAll('.tk-col.nao')].map(x=>x.dataset.tkcol),sobre:[...document.querySelectorAll('.tk-col.sobre')].map(x=>x.dataset.tkcol)}));
 ok(st.nao.includes('Feito')&&!st.sobre.includes('Feito'),`${tema}: com pendência, Feito fica apagada e não acende`);
 await p.evaluate(()=>document.querySelector('.tk-col.nao').scrollIntoView({block:'center'}));await p.screenshot({path:O+tema+'_pendencia.png'});
 await ev('.tk.arrastando','dragend');const t=await p.evaluate(()=>document.querySelector('.toast')?.textContent||'');
 const col=await p.$$eval('.tk[draggable=true]',xs=>xs.find(x=>x.getAttribute('aria-label')==='Levar ao comitê')?.closest('.tk-col').dataset.tkcol);
 ok(t.includes('antes de concluir')&&col!=='Feito',`${tema}: soltando em Feito, o cartão fica e o aviso diz o que falta (${t})`);
 ok(!(await p.$('.tk-col.nao')),`${tema}: ao soltar, a marca some`)}
await ctx.close()}
console.log('ERROS',erros,falhas);await b.close()})();
