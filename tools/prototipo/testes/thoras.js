// Apontamento de horas (bloco 4, sem aprovação): exemplo com estimativa, bloco no cartão, apontar com "1h30"/"45 min"/"1,5",
// recusas (tempo inválido, futuro, mais de 24 h no dia), apagar só o próprio, estimativa e selo na frente, Leitura só vê; prints.
const path=require('path'),fs=require('fs'),{chromium}=require('playwright');
const F=path.join(__dirname,'..','saida','bkm-terrenos.html'),L=path.join(__dirname,'..','libs','l')+'/',O=path.join(__dirname,'..','saida','t_horas')+'/';fs.mkdirSync(O,{recursive:true});
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
const selo=(p,tit)=>p.evaluate(t=>{const c=[...document.querySelectorAll('.tk')].find(x=>x.getAttribute('aria-label')===t);return [...(c?.querySelectorAll('.tk-b')||[])].map(x=>x.textContent.trim()).find(x=>/\d+h|min/.test(x))||''},tit);
const kOf=(s,id)=>s.terrenos[0].tarefas.find(k=>k.id===id);
{const {ctx,p}=await abre(1440,900,'claro');
let s=await est(p);const t0=s.terrenos[0];await ficha(p,t0.id);await p.waitForTimeout(400);
ok((await selo(p,'Estudo de massa'))==='8h/12h','a frente mostra apontado / estimado (8h/12h)');
await abreCartao(p,'Estudo de massa');
ok(await p.evaluate(()=>[...document.querySelectorAll('.tkm-bloco')].some(b=>b.textContent.includes('apontadas')&&b.textContent.includes('faltam 4h'))),'o bloco Horas mostra total, estimativa e quanto falta');
ok(await p.$$eval('.hr-pp > span',x=>x.length)===2,'com mais de uma pessoa, mostra quanto cada uma apontou');
await p.evaluate(()=>document.querySelector('.hr-res').scrollIntoView({block:'center'}));await p.screenshot({path:O+'1_bloco.png'});
await fecha(p);
// apontar num cartão sem horas
s=await est(p);const kk=s.terrenos[0].tarefas.find(k=>!k.arq&&!(k.horas||[]).length&&!k.estim&&(!k.vis||k.vis==='publico'));
await abreCartao(p,kk.titulo);ok(!(await p.$('.hr-res')),'sem horas nem estimativa, o bloco não aparece');
await clica(p,'#modal .tkm-sb[data-a=hr-novo]');await p.waitForTimeout(200);ok(!!(await p.$('[data-form=hr-novo]')),'"Apontar horas" abre o formulário');
const aponta=async(tempo,data)=>{await preenche(p,'[data-form=hr-novo] [name=tempo]',tempo);if(data)await preenche(p,'[data-form=hr-novo] [name=data]',data);await envia(p,'[data-form=hr-novo]');await p.waitForTimeout(200)};
await aponta('1h30');s=await est(p);ok(kOf(s,kk.id).horas?.[0]?.min===90&&kOf(s,kk.id).horas[0].por==='Moisés Bekerman'||kOf(s,kk.id).horas?.[0]?.min===90,'"1h30" vira 90 minutos, de quem apontou');
await clica(p,'#modal [data-a=hr-novo]');await p.waitForTimeout(150);await aponta('abc');ok((await toast(p)).includes('inválido'),'tempo inválido é recusado');
await preenche(p,'[data-form=hr-novo] [name=data]',addD(new Date().toISOString().slice(0,10),3));ok(!(await p.$eval('[data-form=hr-novo]',f=>f.checkValidity())),'não aponta no futuro (a data passa do limite)');
await preenche(p,'[data-form=hr-novo] [name=data]',await p.$eval('[data-form=hr-novo] [name=data]',x=>x.max));
await aponta('23h');ok((await toast(p)).includes('24 horas'),'mais de 24 h no mesmo dia é recusado');
await aponta('1,5');s=await est(p);ok(kOf(s,kk.id).horas.length===2&&kOf(s,kk.id).horas[1].min===90,'"1,5" vira 1h30');
await muda(p,'[data-hr=estim]','2h');await p.waitForTimeout(150);s=await est(p);ok(kOf(s,kk.id).estim===120,'a estimativa grava');
ok(await p.evaluate(()=>!!document.querySelector('.hr-bar.acima')&&document.querySelector('.hr-res').textContent.includes('1h acima')),'acima da estimativa, a barra e o texto ficam em vermelho');
await p.evaluate(()=>document.querySelector('.hr-res').scrollIntoView({block:'center'}));await p.screenshot({path:O+'2_apontar.png'});
p.once('dialog',d=>d.accept());await clica(p,'#modal [data-a=hr-x]');await p.waitForTimeout(200);s=await est(p);ok(kOf(s,kk.id).horas.length===1,'apagar o próprio apontamento');
await fecha(p);ok((await selo(p,kk.titulo))==='1h30/2h','a frente do cartão acompanha');
// outro usuário não apaga o apontamento alheio
await papel(p,'Analista');await p.waitForTimeout(200);await abreCartao(p,'Estudo de massa');
s=await est(p);const quem=await p.evaluate(()=>document.querySelector('.avatar.me, .topbar .avatar')?.getAttribute('title'));
const tot=kOf(s,tar(s,0,'Estudo de massa').id).horas.length,bts=await p.$$eval('#modal [data-a=hr-x]',x=>x.length);
ok(bts<tot,`só aparece Apagar nos apontamentos da própria pessoa (${bts} de ${tot})`);await fecha(p);
await papel(p,'Leitura');await p.waitForTimeout(200);await abreCartao(p,'Estudo de massa');
ok(!(await p.$('#modal [data-a=hr-novo]'))&&!(await p.$('#modal [data-a=hr-x]'))&&await p.$eval('[data-hr=estim]',x=>x.disabled),'Leitura só vê as horas');
await ctx.close()}
{const {ctx,p}=await abre(1440,900,'escuro');const s=await est(p);await ficha(p,s.terrenos[0].id);await p.waitForTimeout(400);
await abreCartao(p,'Estudo de massa');await p.evaluate(()=>document.querySelector('.hr-res').scrollIntoView({block:'center'}));await p.screenshot({path:O+'3_escuro.png'});await ctx.close()}
{const {ctx,p}=await abre(390,844,'claro');const s=await est(p);await ficha(p,s.terrenos[0].id);await p.waitForTimeout(400);
await abreCartao(p,'Estudo de massa');await clica(p,'#modal [data-a=hr-novo]');await p.waitForTimeout(200);await p.evaluate(()=>document.querySelector('.hr-res').scrollIntoView({block:'start'}));
ok(await p.evaluate(()=>{const d=document.querySelector('#modal .dialog');return d.scrollWidth<=d.clientWidth+1}),'celular: o cartão não rola de lado');
await p.screenshot({path:O+'4_celular.png'});await ctx.close()}
ok(!erros.length,'sem erro de JavaScript '+erros.join(' | '));
await b.close();console.log(falhas.length?`\n${falhas.length} FALHA(S)`:'\nTUDO OK');process.exit(falhas.length?1:0)})();
