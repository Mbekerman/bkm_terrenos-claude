// Copiar cartão e modelo de cartão (bloco 4): copiar para outro terreno escolhendo o que vai, modelo com selo e faixa, não conclui nem atrasa,
// "Usar este modelo", Nova tarefa a partir de modelo, Tornar modelo, Leitura sem Copiar; prints.
const path=require('path'),fs=require('fs'),{chromium}=require('playwright');
const F=path.join(__dirname,'..','saida','bkm-terrenos.html'),L=path.join(__dirname,'..','libs','l')+'/',O=path.join(__dirname,'..','saida','t_copiar')+'/';fs.mkdirSync(O,{recursive:true});
const falhas=[];const ok=(c,m)=>{console.log((c?'ok   ':'FALHA ')+m);if(!c)falhas.push(m)};
const est=p=>p.evaluate(()=>JSON.parse(localStorage.getItem('bkm-terrenos-prototipo-v9')));
const clica=(p,sel,txt)=>p.evaluate(([s,t])=>{let el=[...document.querySelectorAll(s)].find(x=>!t||x.textContent.includes(t));if(!el&&window.__tkAcha)el=window.__tkAcha(s,t);if(!el)throw new Error('não achei '+s+' '+(t||''));el.click()},[sel,txt||null]);
const muda=(p,sel,v)=>p.evaluate(([s,v])=>{let el=document.querySelector(s);if(!el&&window.__tkAcha)el=window.__tkAcha(s);if(!el)throw new Error('não achei '+s);if(el.tagName==='SELECT'&&![...el.options].some(o=>o.value===v)){const o=[...el.options].find(o=>o.textContent.includes(v));if(o)v=o.value}el.value=v;el.dispatchEvent(new Event('change',{bubbles:true}))},[sel,v]);
const preenche=(p,sel,v)=>p.evaluate(([s,v])=>{let el=document.querySelector(s);if(!el&&window.__tkAcha)el=window.__tkAcha(s);if(!el)throw new Error('não achei '+s);el.value=v},[sel,v]);
const envia=(p,sel)=>p.evaluate(s=>{let f=document.querySelector(s);if(!f&&window.__tkAcha)f=window.__tkAcha(s);if(!f)throw new Error('não achei '+s);f.requestSubmit()},sel);
const papel=(p,v)=>p.evaluate(v=>{const a=document.createElement('button');a.dataset.a='role';a.dataset.v=v;document.body.appendChild(a);a.click();a.remove()},v);
// a seção Tarefas saiu da ficha (4/nov/2026): o quadro do terreno é a página Tarefas filtrada por ele, na vista Quadro
const filtraTer=(p,id)=>p.evaluate(id=>{const e=document.querySelector('#tk-ter');if(e&&e.value!==id){e.value=id;e.dispatchEvent(new Event('change',{bubbles:true}))}},id);
const ficha=async(p,id)=>{await p.evaluate(()=>document.querySelector('[data-a=nav][data-r=tarefas]').click());await p.waitForTimeout(200);
  await p.evaluate(()=>document.querySelector('[data-a=tk-vista][data-v=quadro][aria-pressed=false]')?.click());await p.waitForTimeout(150);await filtraTer(p,id);await p.waitForTimeout(200)};
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
const lista=(s,i,k)=>s.terrenos[i].listas.find(l=>l.id===k.lista);
const kOf=(s,id)=>{for(const t of s.terrenos)for(const k of (t.tarefas||[]))if(k.id===id)return {t,k};return {}};
{const {ctx,p}=await abre(1440,900,'claro');
let s=await est(p);const t0=s.terrenos[0],m=tar(s,0,'Pedir certidões do imóvel');
ok(m&&m.modelo,'o exemplo tem um modelo de cartão');
await ficha(p,t0.id);await p.waitForTimeout(400);
ok(await p.evaluate(()=>{const c=[...document.querySelectorAll('.tk')].find(x=>x.getAttribute('aria-label')==='Pedir certidões do imóvel');return !!c?.querySelector('.cx-selo')}),'a frente mostra o selo Modelo');
await abreCartao(p,'Pedir certidões do imóvel');
ok(!!(await p.$('#modal .cx-faixa'))&&!(await p.$('#modal [data-a=tkc-concluir]')),'o modelo tem a faixa e não tem Concluir');
await p.screenshot({path:O+'1_modelo.png'});
await clica(p,'.cx-faixa [data-a=tkc-pop]');await p.waitForTimeout(200);ok(!!(await p.$('[data-form=cx-copiar]')),'"Usar este modelo" abre o quadro de copiar');
const outro=s.terrenos.find((x,i)=>i>0&&x.tarefas&&x.situacao!=='arquivado');
await muda(p,'#cx-ter',outro.id);await p.waitForTimeout(200);
ok(await p.$eval('#cx-ter',x=>x.value)===outro.id,'troca o terreno de destino');
await preenche(p,'#cx-t','Pedir certidões do imóvel — Rua Itapura');await envia(p,'[data-form=cx-copiar]');await p.waitForTimeout(250);
s=await est(p);let n=s.terrenos.find(x=>x.id===outro.id).tarefas.find(k=>k.titulo==='Pedir certidões do imóvel — Rua Itapura');
ok(n&&!n.modelo&&n.checklists[0]?.itens.length===4&&n.checklists[0].itens.every(i=>!i.feito)&&n.estim===180&&n.etq.length===1,'a cópia vai para o outro terreno como cartão comum, com checklist em aberto, etiqueta e estimativa');
ok(await p.$eval('#modal .tkm-tit',x=>x.value)==='Pedir certidões do imóvel — Rua Itapura','depois de copiar, abre o cartão novo');
await p.screenshot({path:O+'2_copia.png'});await fecha(p);
// copiar um cartão comum sem pessoas
await ficha(p,t0.id);await p.waitForTimeout(300);s=await est(p);const kc=tar(s,0,'Levar ao comitê');
await abreCartao(p,'Levar ao comitê');await clica(p,'#modal [data-a=tkc-pop][data-v=mais]');await p.waitForTimeout(100);await clica(p,'#modal .tkm-sb[data-v=copiar]');await p.waitForTimeout(200);
await p.$eval('[data-form=cx-copiar] [name=it][value=pessoas]',x=>x.checked=false);await envia(p,'[data-form=cx-copiar]');await p.waitForTimeout(250);
s=await est(p);n=s.terrenos[0].tarefas.filter(k=>k.titulo==='Levar ao comitê'&&k.id!==kc.id)[0];
ok(n&&!n.resp&&!n.exec.length&&!n.prazo&&n.criadoPor!==undefined&&n.checklists.length===kc.checklists.length,'sem "Pessoas", a cópia vem sem responsável; nunca leva datas');
await fecha(p);
// tornar modelo
await abreCartao(p,'Levar ao comitê');await clica(p,'#modal [data-a=tkc-pop][data-v=mais]');await p.waitForTimeout(100);await clica(p,'#modal [data-a=cx-modelo]');await p.waitForTimeout(200);s=await est(p);
ok(kOf(s,kc.id).k.modelo&&!(await p.$('#modal [data-a=tkc-concluir]')),'Tornar modelo: vira modelo e perde o Concluir');
await clica(p,'#modal [data-a=tkc-pop][data-v=mais]');await p.waitForTimeout(100);await clica(p,'#modal [data-a=cx-modelo]');await p.waitForTimeout(200);s=await est(p);ok(!kOf(s,kc.id).k.modelo,'Deixar de ser modelo');await fecha(p);
// nova tarefa a partir de modelo
await p.evaluate(id=>{const a=document.createElement('button');a.dataset.a='tk-nova';a.dataset.id=id;document.body.appendChild(a);a.click();a.remove()},t0.id);await p.waitForTimeout(250);await clica(p,'[data-a=fm-mais]');await p.waitForTimeout(200);
ok(!!(await p.$('#tm-mod')),'a Nova tarefa oferece "Usar um modelo"');
await p.screenshot({path:O+'3_nova.png'});
await muda(p,'#tm-mod',`${t0.id}|${m.id}`);await p.waitForTimeout(250);
ok(!!(await p.$('[data-form=cx-copiar]'))&&await p.$eval('#cx-ter',x=>x.value)===t0.id,'escolher o modelo abre o quadro de copiar, já no terreno da nova tarefa');
await envia(p,'[data-form=cx-copiar]');await p.waitForTimeout(250);s=await est(p);
ok(s.terrenos[0].tarefas.filter(k=>k.titulo==='Pedir certidões do imóvel').length===2,'cria o cartão a partir do modelo');await fecha(p);
await papel(p,'Leitura');await p.waitForTimeout(200);await abreCartao(p,'Levar ao comitê');
ok(!(await p.$('#modal [data-v=copiar]'))&&!(await p.$('#modal [data-a=cx-modelo]')),'Leitura não copia nem cria modelo');
await ctx.close()}
{const {ctx,p}=await abre(390,844,'claro');const s=await est(p);await ficha(p,s.terrenos[0].id);await p.waitForTimeout(400);
await abreCartao(p,'Pedir certidões do imóvel');await clica(p,'.cx-faixa [data-a=tkc-pop]');await p.waitForTimeout(200);
const lg=await p.evaluate(()=>{const d=document.querySelector('#modal .dialog'),W=d.getBoundingClientRect().right;return [d.scrollWidth,d.clientWidth,[...d.querySelectorAll('*')].filter(x=>x.getBoundingClientRect().right>W+1).slice(0,4).map(x=>x.className+':'+Math.round(x.getBoundingClientRect().right))]});
ok(lg[0]<=lg[1]+1,'celular: o cartão não rola de lado '+JSON.stringify(lg));
await p.screenshot({path:O+'4_celular.png'});await ctx.close()}
ok(!erros.length,'sem erro de JavaScript '+erros.join(' | '));
await b.close();console.log(falhas.length?`\n${falhas.length} FALHA(S)`:'\nTUDO OK');process.exit(falhas.length?1:0)})();
