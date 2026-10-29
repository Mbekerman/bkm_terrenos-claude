// Aprovação formal da tarefa (bloco 3): selo no cartão, aprovar em sequência, conclusão automática, reabrir invalida,
// bloqueio por checklist e por aprovação (botão e arrastar), recusa com justificativa e aviso, superior decide no lugar,
// paralelo/sequência no cartão, regra do checklist em Configurações; prints em claro, escuro e celular.
const path=require('path'),fs=require('fs'),{chromium}=require('playwright');
const F=path.join(__dirname,'..','saida','bkm-terrenos.html'),L=path.join(__dirname,'..','libs','l')+'/',O=path.join(__dirname,'..','saida','t_aprovacao')+'/';fs.mkdirSync(O,{recursive:true});
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
{const {ctx,p}=await abre(1440,900,'claro');
let s=await est(p);const t0=s.terrenos[0];await ficha(p,t0.id);await p.waitForTimeout(400);
ok(await p.$eval('.tk[aria-label="Estudo de viabilidade"]',x=>!!x.querySelector('.ap-selo')),'cartão aguardando aprovação mostra o selo na frente');
await p.evaluate(()=>document.querySelector('.tk[aria-label="Estudo de viabilidade"]').scrollIntoView({block:'center'}));await p.screenshot({path:O+'1_selo_quadro.png'});
await abreCartao(p,'Estudo de viabilidade');
ok(await p.$eval('.ap-bloco',x=>x.textContent.includes('Aguardando aprovação')&&x.textContent.includes('Aprovou')&&x.textContent.includes('Na vez')&&x.textContent.includes('Premissas conferidas')),
  'bloco Aprovação mostra quem aprovou, a justificativa e quem está na vez');
ok(await p.$eval('[data-a=tkc-concluir].tkm-done',x=>x.title==='Aguardando aprovação'),'o círculo de concluir diz "Aguardando aprovação"');
await p.evaluate(()=>document.querySelector('.ap-bloco').scrollIntoView({block:'center'}));await p.screenshot({path:O+'2_cartao_na_vez.png'});
await clica(p,'[data-a=ap-aprovar]');await p.waitForTimeout(250);
s=await est(p);let k=tar(s,0,'Estudo de viabilidade');
ok(k.aps.at(-1).sit==='aprovada'&&k.feita&&s.terrenos[0].listas.find(l=>l.id===k.lista).tipo==='conclui','o último aprovou: aprovada e a tarefa vai sozinha para Feito');
ok(s.notifs.some(n=>n.para==='Rafael Souza'&&n.tipo==='aprovacao_decidida'&&n.txt.includes('aprovada')),'quem pediu é avisado da aprovação');
await clica(p,'[data-a=tkc-concluir].tkm-done');await p.waitForTimeout(200);
s=await est(p);k=tar(s,0,'Estudo de viabilidade');ok(!k.feita&&k.aps.at(-1).sit==='invalidada','reabrir invalida a aprovação');
ok(await p.$eval('[data-a=tkc-concluir].tkm-done',x=>x.title==='Pedir aprovação'),'reaberta, o concluir volta a ser "Pedir aprovação"');
await fecha(p);
// analista: checklist em aberto bloqueia; pede a aprovação; arrastar para Feito não conclui
await papel(p,'Analista');await p.waitForTimeout(200);
await abreCartao(p,'Levar ao comitê');
await clica(p,'[data-a=tkc-concluir].tkm-done');await p.waitForTimeout(200);
s=await est(p);ok(!(tar(s,0,'Levar ao comitê').aps||[]).length&&(await toast(p)).includes('checklist'),'com item do checklist em aberto, não pede aprovação');
await p.evaluate(()=>document.querySelectorAll('[data-tkc=item-feito]').forEach(x=>{if(!x.checked)x.click()}));await p.waitForTimeout(250);
await clica(p,'[data-a=tkc-concluir].tkm-done');await p.waitForTimeout(250);
s=await est(p);k=tar(s,0,'Levar ao comitê');ok(k.aps?.at(-1)?.sit==='pendente'&&!k.feita,'"Pedir aprovação" cria o pedido e a tarefa segue aberta');
ok(s.notifs.some(n=>n.para==='Moisés'&&n.tipo==='aprovacao_pendente'&&n.txt.includes('Levar ao comitê')),'o aprovador é avisado do pedido');
await muda(p,'.tkm-lsel','Feito');await p.waitForTimeout(200);
s=await est(p);ok(!tar(s,0,'Levar ao comitê').feita&&(await toast(p)).includes('aguardando aprovação'),'levar para Feito sem aprovação não conclui');
await fecha(p);
// gestor que não é aprovador nem superior do aprovador não decide
await papel(p,'Gestor');await p.waitForTimeout(200);await abreCartao(p,'Levar ao comitê');
ok(!(await p.$('[data-a=ap-aprovar]')),'quem não é aprovador (nem superior dele) não vê Aprovar');await fecha(p);
// diretor recusa com justificativa
await papel(p,'Diretor');await p.waitForTimeout(200);await abreCartao(p,'Levar ao comitê');
await clica(p,'[data-a=ap-recusar]');await p.waitForTimeout(150);
await envia(p,'[data-form=ap-recusa]');await p.waitForTimeout(150);
s=await est(p);ok(tar(s,0,'Levar ao comitê').aps.at(-1).sit==='pendente','recusar sem justificativa não passa');
await preenche(p,'[data-form=ap-recusa] textarea','Falta a viabilidade aprovada');await p.screenshot({path:O+'3_recusa.png'});
await envia(p,'[data-form=ap-recusa]');await p.waitForTimeout(250);
s=await est(p);k=tar(s,0,'Levar ao comitê');ok(k.aps.at(-1).sit==='recusada'&&k.aps.at(-1).votos[0].just==='Falta a viabilidade aprovada'&&!k.feita,'recusa com justificativa encerra o pedido');
ok(s.notifs.some(n=>n.para==='Rafael Souza'&&n.tipo==='aprovacao_decidida'&&n.txt.includes('Falta a viabilidade')),'quem pediu recebe a recusa com a justificativa');
ok(await p.$eval('.ap-bloco',x=>x.textContent.includes('Recusada')&&x.textContent.includes('Pedir de novo')),'o cartão mostra a recusa e "Pedir de novo"');
await p.evaluate(()=>document.querySelector('.ap-bloco').scrollIntoView({block:'center'}));await p.screenshot({path:O+'4_recusada.png'});await fecha(p);
// superior decide no lugar; paralelo / sequência
await abreCartao(p,'Estudo de massa');
await muda(p,'[data-tkc=add-aprov]','Camila Torres');await p.waitForTimeout(150);await muda(p,'[data-tkc=add-aprov]','Ana Prado');await p.waitForTimeout(150);
ok(await p.$('.ap-modo')!==null,'com dois aprovadores, o cartão escolhe em paralelo ou em sequência');
await clica(p,'[data-a=ap-modo][data-v=sequencia]');await p.waitForTimeout(150);
await clica(p,'[data-a=ap-pedir]');await p.waitForTimeout(200);
ok(await p.$eval('[data-a=ap-aprovar]',x=>x.textContent.includes('no lugar de Camila')),'o diretor aprova no lugar de quem está abaixo dele, na vez');
await clica(p,'[data-a=ap-aprovar]');await p.waitForTimeout(200);
s=await est(p);k=tar(s,0,'Estudo de massa');ok(k.aps.at(-1).modo==='sequencia'&&k.aps.at(-1).votos[0].por==='Moisés'&&k.aps.at(-1).votos[0].user==='Camila Torres'&&k.aps.at(-1).sit==='pendente','o voto guarda quem decidiu e passa a vez');
ok(await p.$eval('.ap-bloco',x=>x.textContent.includes('por Moisés')),'o cartão mostra "por Moisés" no voto');
await p.evaluate(()=>document.querySelector('.ap-bloco').scrollIntoView({block:'center'}));await p.screenshot({path:O+'5_sequencia_superior.png'});await fecha(p);
// configuração da regra do checklist
await p.evaluate(()=>history.replaceState(null,'','#/configuracoes/tarefas'));await p.reload();await p.waitForTimeout(400);
ok(await p.$eval('[data-a=ap-regra]',x=>x.checked),'a regra do checklist vem ligada');
await clica(p,'[data-a=ap-regra]');await p.waitForTimeout(150);s=await est(p);ok(s.tkRegras?.checklist===false,'o administrador desliga a regra do checklist');
await p.evaluate(()=>document.querySelector('[data-a=ap-regra]').closest('.sec').scrollIntoView({block:'center'}));await p.screenshot({path:O+'6_config.png'});
await ctx.close()}
{const {ctx,p}=await abre(1440,900,'escuro');const s=await est(p);await ficha(p,s.terrenos[0].id);await p.waitForTimeout(400);
await abreCartao(p,'Estudo de viabilidade');await p.evaluate(()=>document.querySelector('.ap-bloco').scrollIntoView({block:'center'}));await p.screenshot({path:O+'7_escuro.png'});await ctx.close()}
{const {ctx,p}=await abre(390,844,'claro');const s=await est(p);await ficha(p,s.terrenos[0].id);await p.waitForTimeout(400);
await abreCartao(p,'Estudo de viabilidade');await p.evaluate(()=>document.querySelector('.ap-bloco').scrollIntoView({block:'start'}));
const larg=await p.evaluate(()=>document.querySelector('#modal .dialog').scrollWidth<=document.querySelector('#modal .dialog').clientWidth+1);ok(larg,'celular: o cartão não rola de lado');
await p.screenshot({path:O+'8_celular.png'});await ctx.close()}
ok(!erros.length,'sem erro de JavaScript '+erros.join(' | '));
await b.close();console.log(falhas.length?`\n${falhas.length} FALHA(S)`:'\nTUDO OK');process.exit(falhas.length?1:0)})();
