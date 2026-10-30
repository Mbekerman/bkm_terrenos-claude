// Recorrência (bloco 4): exemplo com 2 ocorrências criadas na data (a anterior aberta), bloco da ocorrência apontando a origem,
// criar a série num cartão, mudar frequência, dias e fim, parar e retomar, próxima nunca hoje ou antes; prints.
const path=require('path'),fs=require('fs'),{chromium}=require('playwright');
const F=path.join(__dirname,'..','saida','bkm-terrenos.html'),L=path.join(__dirname,'..','libs','l')+'/',O=path.join(__dirname,'..','saida','t_recorr')+'/';fs.mkdirSync(O,{recursive:true});
const falhas=[];const ok=(c,m)=>{console.log((c?'ok   ':'FALHA ')+m);if(!c)falhas.push(m)};
const est=p=>p.evaluate(()=>JSON.parse(localStorage.getItem('bkm-terrenos-prototipo-v9')));
const clica=(p,sel,txt)=>p.evaluate(([s,t])=>{const el=[...document.querySelectorAll(s)].find(x=>!t||x.textContent.includes(t));if(!el)throw new Error('não achei '+s+' '+(t||''));el.click()},[sel,txt||null]);
const muda=(p,sel,v)=>p.evaluate(([s,v])=>{const el=document.querySelector(s);if(!el)throw new Error('não achei '+s);if(el.tagName==='SELECT'&&![...el.options].some(o=>o.value===v)){const o=[...el.options].find(o=>o.textContent.includes(v));if(o)v=o.value}el.value=v;el.dispatchEvent(new Event('change',{bubbles:true}))},[sel,v]);
const preenche=(p,sel,v)=>p.evaluate(([s,v])=>{const el=document.querySelector(s);if(!el)throw new Error('não achei '+s);el.value=v},[sel,v]);
const envia=(p,sel)=>p.evaluate(s=>{const f=document.querySelector(s);if(!f)throw new Error('não achei '+s);f.requestSubmit()},sel);
const papel=(p,v)=>p.evaluate(v=>{const a=document.createElement('button');a.dataset.a='role';a.dataset.v=v;document.body.appendChild(a);a.click();a.remove()},v);
const ficha=(p,id)=>p.evaluate(id=>{const a=document.createElement('button');a.dataset.a='abrir';a.dataset.id=id;a.dataset.tab='tarefas';document.body.appendChild(a);a.click();a.remove()},id);
const toast=p=>p.evaluate(()=>document.querySelector('.toast')?.textContent||'');
const tar=(s,i,tit)=>s.terrenos[i].tarefas.find(k=>k.titulo===tit);
const addD=(d,n)=>{const x=new Date(d+'T12:00:00');x.setDate(x.getDate()+n);return x.toISOString().slice(0,10)};
(async()=>{const b=await chromium.launch(),erros=[];
const abre=async(w,h,tema)=>{const ctx=await b.newContext({viewport:{width:w,height:h},deviceScaleFactor:1});
  await ctx.route('**/*',r=>{const u=r.request().url();if(u.startsWith('file://'))return r.fulfill({path:F,contentType:'text/html; charset=utf-8'});if(/leaflet.js|jszip/.test(u))return r.fulfill({path:L+(u.includes('leaflet')?'leaflet.js':'jszip.min.js'),contentType:'application/javascript'});return r.abort()});
  const p=await ctx.newPage();p.on('pageerror',e=>erros.push(e.message));await p.goto('file:///x/a.html');await p.evaluate(t=>{localStorage.clear();localStorage.setItem('bkm-terrenos-tema',t)},tema);await p.reload();await p.waitForTimeout(400);return {ctx,p}};
const abreCartao=async(p,tit)=>{await clica(p,'.tk',tit);await p.waitForTimeout(250)};
const fecha=async p=>{await clica(p,'#modal [data-a=close]');await p.waitForTimeout(150)};
const lista=(s,i,k)=>s.terrenos[i].listas.find(l=>l.id===k.lista);
const dow=d=>new Date(d+'T12:00:00').getDay();
{const {ctx,p}=await abre(1440,900,'claro');
let s=await est(p);const t0=s.terrenos[0],HOJE=await p.evaluate(()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`});
const o=tar(s,0,'Relatório semanal ao comitê'),oc=s.terrenos[0].tarefas.filter(k=>k.serie===o.id).sort((a,b)=>a.inicio<b.inicio?-1:1);
ok(oc.length===2&&oc.every(k=>dow(k.inicio)===1&&k.prazo===addD(k.inicio,2)),'o exemplo tem 2 ocorrências, nas segundas, com prazo 2 dias depois');
ok(!oc[0].feita&&oc[1].inicio<=HOJE&&o.rec.prox>HOJE,'a segunda nasceu mesmo com a primeira aberta; a próxima é depois de hoje');
ok(oc.every(k=>k.criadoPor==='Ana Prado'&&k.resp==='Rafael Souza'&&k.acomp.includes('Ana Prado')&&k.checklists[0].itens.every(i=>!i.feito)),'a ocorrência copia pessoas e checklist em aberto');
await ficha(p,t0.id);await p.waitForTimeout(400);
ok(await p.$$eval('.tk',xs=>xs.filter(x=>x.getAttribute('aria-label')==='Relatório semanal ao comitê'&&x.querySelector('.tk-b [d^="M17 2l4"]')).length>=2),'a frente dos cartões da série mostra o ícone de recorrência');
await p.evaluate(()=>document.querySelector('.tk-board').scrollIntoView({block:'center'}));await p.screenshot({path:O+'1_quadro.png'});
// ocorrência aponta a origem
await p.evaluate(id=>{const c=document.querySelector(`.tk[data-tk="${id}"]`);c.click()},oc[0].id);await p.waitForTimeout(250);
ok(await p.evaluate(()=>[...document.querySelectorAll('.rc-in')].some(x=>x.textContent.includes('pela série'))),'a ocorrência diz de que série veio');
ok(!(await p.$('#modal [data-a=rc-nova]')),'ocorrência não ganha outra recorrência');
await clica(p,'#modal [data-a=rc-origem]');await p.waitForTimeout(250);
ok(await p.$eval('#modal .tkm-tit',x=>x.value)==='Relatório semanal ao comitê'&&!!(await p.$('#rc-freq')),'o link abre o cartão de origem com a regra');
await p.evaluate(()=>document.querySelector('.rc-in').scrollIntoView({block:'center'}));await p.screenshot({path:O+'2_origem.png'});await fecha(p);
// criar a série num cartão comum
s=await est(p);const kk=s.terrenos[0].tarefas.find(k=>!k.feita&&!k.arq&&!k.rec&&!k.serie&&(!k.vis||k.vis==='publico'));
await abreCartao(p,kk.titulo);await clica(p,'#modal [data-a=rc-nova]');await p.waitForTimeout(200);
s=await est(p);let r=s.terrenos[0].tarefas.find(k=>k.id===kk.id).rec;
ok(r&&r.freq==='semanal'&&r.ativa&&r.prox>HOJE&&r.dias.length===1,`"Recorrência" cria a série semanal, próxima ${r?.prox}`);
await muda(p,'#rc-freq','diaria');await p.waitForTimeout(150);s=await est(p);r=s.terrenos[0].tarefas.find(k=>k.id===kk.id).rec;
ok(r.freq==='diaria'&&r.prox===addD(HOJE,1),'diária: a próxima é amanhã, nunca hoje');
await muda(p,'#rc-freq','semanal');await p.waitForTimeout(150);
const d0=(dow(HOJE)+3)%7;await clica(p,`#modal [data-a=rc-dia][data-v="${d0}"]`);await p.waitForTimeout(150);s=await est(p);r=s.terrenos[0].tarefas.find(k=>k.id===kk.id).rec;
ok(r.dias.includes(d0)&&r.prox>HOJE&&r.prox<=addD(HOJE,7),'marcar outro dia da semana recalcula a próxima');
await muda(p,'#rc-ft','vezes');await p.waitForTimeout(150);await muda(p,'#rc-max','5');await p.waitForTimeout(150);s=await est(p);r=s.terrenos[0].tarefas.find(k=>k.id===kk.id).rec;
ok(r.max===5&&!r.fim,'termina depois de N vezes');
await clica(p,'#modal [data-a=rc-ativa]');await p.waitForTimeout(150);s=await est(p);ok(!s.terrenos[0].tarefas.find(k=>k.id===kk.id).rec.ativa,'Parar encerra a série');
await clica(p,'#modal [data-a=rc-ativa]');await p.waitForTimeout(150);s=await est(p);r=s.terrenos[0].tarefas.find(k=>k.id===kk.id).rec;ok(r.ativa&&r.prox>HOJE,'Retomar volta de amanhã em diante');
await p.evaluate(()=>document.querySelector('.rc-in').scrollIntoView({block:'center'}));await p.screenshot({path:O+'3_regra.png'});await fecha(p);
await papel(p,'Leitura');await p.waitForTimeout(200);await abreCartao(p,'Relatório semanal ao comitê');
ok(await p.$$eval('.rc-in select, .rc-in input',xs=>xs.every(x=>x.disabled)),'Leitura só vê a regra');
await ctx.close()}
{const {ctx,p}=await abre(1440,900,'escuro');const s=await est(p);await ficha(p,s.terrenos[0].id);await p.waitForTimeout(400);
const o=tar(s,0,'Relatório semanal ao comitê');await p.evaluate(id=>document.querySelector(`.tk[data-tk="${id}"]`)?.click(),o.id);await p.waitForTimeout(250);
await p.evaluate(()=>document.querySelector('.rc-in').scrollIntoView({block:'center'}));await p.screenshot({path:O+'4_escuro.png'});await ctx.close()}
{const {ctx,p}=await abre(390,844,'claro');const s=await est(p);await ficha(p,s.terrenos[0].id);await p.waitForTimeout(400);
const o=tar(s,0,'Relatório semanal ao comitê');await p.evaluate(id=>document.querySelector(`.tk[data-tk="${id}"]`)?.click(),o.id);await p.waitForTimeout(250);
await p.evaluate(()=>document.querySelector('.rc-in').scrollIntoView({block:'start'}));
ok(await p.evaluate(()=>{const d=document.querySelector('#modal .dialog');return d.scrollWidth<=d.clientWidth+1}),'celular: o cartão não rola de lado');
await p.screenshot({path:O+'5_celular.png'});await ctx.close()}
ok(!erros.length,'sem erro de JavaScript '+erros.join(' | '));
await b.close();console.log(falhas.length?`\n${falhas.length} FALHA(S)`:'\nTUDO OK');process.exit(falhas.length?1:0)})();
