// Tarefas pelo funil (bloco 4): vista Funil da página Tarefas, só leitura; colunas por fase, descida para etapas e subetapas,
// trilha para subir, tarefas agrupadas pelo terreno, nada arrastável, modelos fora, filtros valem; prints.
const path=require('path'),fs=require('fs'),{chromium}=require('playwright');
const F=path.join(__dirname,'..','saida','bkm-terrenos.html'),L=path.join(__dirname,'..','libs','l')+'/',O=path.join(__dirname,'..','saida','t_funil')+'/';fs.mkdirSync(O,{recursive:true});
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
const cols=p=>p.$$eval('.tf-col',xs=>xs.map(x=>({nome:x.querySelector('.tkl-h span')?.textContent.trim(),n:+x.querySelector('.tkl-h .n').textContent,ters:[...x.querySelectorAll('.tf-th .num')].map(y=>y.textContent)})));
{const {ctx,p}=await abre(1440,900,'claro');
await p.evaluate(()=>history.replaceState(null,'','#/tarefas/funil'));await p.reload();await p.waitForTimeout(500);
ok(await p.$eval('[data-a=tk-vista][data-v=funil]',x=>x.getAttribute('aria-pressed'))==='true','o endereço /tarefas/funil abre a vista Funil');
let c=await cols(p);ok(c.length>=3&&c[0].nome==='Novos Negócios','colunas pelas fases: '+c.map(x=>x.nome+'('+x.n+')').join(', '));
ok(c.some(x=>x.n>0),'há tarefas nas fases');
ok(await p.$$eval('.tf-board .tk',xs=>xs.length>0&&xs.every(x=>x.getAttribute('draggable')==='false')),'nenhum cartão se arrasta');
ok(!(await p.$$eval('.tf-board .tk',xs=>xs.some(x=>x.querySelector('.cx-selo')))),'modelos de cartão ficam de fora');
await p.screenshot({path:O+'1_fases.png'});
await clica(p,'.tf-col .col-ab');await p.waitForTimeout(300);c=await cols(p);
ok(await p.$eval('.tf-trilha',x=>x.textContent.includes('Fases')&&x.textContent.includes('Novos Negócios')),'desce para as etapas, com a trilha');
const tot0=c.reduce((s,x)=>s+x.n,0);ok(c.length>=3,'colunas pelas etapas: '+c.map(x=>x.nome+'('+x.n+')').join(', '));
await p.screenshot({path:O+'2_etapas.png'});
const comSub=await p.$$eval('.tf-col',xs=>xs.findIndex(x=>x.querySelector('.col-ab')&&+x.querySelector('.n').textContent>0));
if(comSub>=0){await p.evaluate(i=>document.querySelectorAll('.tf-col')[i].querySelector('.col-ab').click(),comSub);await p.waitForTimeout(300);
  c=await cols(p);ok(c.length>=1&&await p.$$eval('.tf-trilha li',x=>x.length)===3,'desce para as subetapas: '+c.map(x=>x.nome+'('+x.n+')').join(', '));
  await p.screenshot({path:O+'3_subetapas.png'});
  await clica(p,'.tf-trilha [data-a=tf-nivel]');await p.waitForTimeout(300);ok((await p.$$eval('.tf-trilha li',x=>x.length))===2,'a seta sobe um nível')}
await clica(p,'.tf-trilha .linkbtn','Fases');await p.waitForTimeout(300);c=await cols(p);ok(c[0].nome==='Novos Negócios'&&!(await p.$('.tf-trilha [data-a=tf-nivel].iconbtn')),'a trilha volta às fases');
// filtro de terreno vale
const ter=c.find(x=>x.ters.length)?.ters[0];const s=await est(p);const tid=s.terrenos.find(t=>t.codigo===ter).id;
await muda(p,'#tk-ter',tid);await p.waitForTimeout(300);c=await cols(p);ok(c.every(x=>x.ters.every(y=>y===ter)),'o filtro de terreno vale na vista Funil');
await muda(p,'#tk-ter','');await p.waitForTimeout(200);
// abrir o cartão pela vista
await clica(p,'.tf-board .tk');await p.waitForTimeout(250);ok(!!(await p.$('#modal .tkm-tit')),'o cartão abre pela vista Funil');
await ctx.close()}
{const {ctx,p}=await abre(1440,900,'escuro');await p.evaluate(()=>history.replaceState(null,'','#/tarefas/funil'));await p.reload();await p.waitForTimeout(500);await p.screenshot({path:O+'4_escuro.png'});await ctx.close()}
{const {ctx,p}=await abre(390,844,'claro');await p.evaluate(()=>history.replaceState(null,'','#/tarefas/funil'));await p.reload();await p.waitForTimeout(500);
ok(await p.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'celular: a página não rola de lado');await p.screenshot({path:O+'5_celular.png'});await ctx.close()}
ok(!erros.length,'sem erro de JavaScript '+erros.join(' | '));
await b.close();console.log(falhas.length?`\n${falhas.length} FALHA(S)`:'\nTUDO OK');process.exit(falhas.length?1:0)})();
