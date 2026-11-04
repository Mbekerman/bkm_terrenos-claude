// SLA com pausa aprovada (bloco 3): selo no cartão, gestor aprova a pausa, analista pede (motivo obrigatório), levar para Pausadas pede
// o motivo, recusa com motivo, Retomar volta para a lista e empurra o prazo, pausada não atrasa, tempo líquido, regra em Configurações;
// prints em claro, escuro e celular.
const path=require('path'),fs=require('fs'),{chromium}=require('playwright');
const F=path.join(__dirname,'..','saida','bkm-terrenos.html'),L=path.join(__dirname,'..','libs','l')+'/',O=path.join(__dirname,'..','saida','t_pausa')+'/';fs.mkdirSync(O,{recursive:true});
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
const abreCartao=async(p,tit)=>{await clica(p,'.tk',tit);await p.waitForTimeout(250);await p.evaluate(()=>document.querySelector('#modal [data-a=tkc-aba][data-v=prazos]')?.click());await p.waitForTimeout(100)};
const fecha=async p=>{await clica(p,'#modal [data-a=close]');await p.waitForTimeout(150)};
const lista=(s,i,k)=>s.terrenos[i].listas.find(l=>l.id===k.lista);
{const {ctx,p}=await abre(1440,900,'claro');
let s=await est(p);const t0=s.terrenos[0];await ficha(p,t0.id);await p.waitForTimeout(400);
ok(await p.$eval('.tk[aria-label="Orçar demolição do galpão"]',x=>x.closest('.tk-col').dataset.tkcol==='Pausadas'&&x.textContent.includes('Pausada')),'a tarefa pausada fica em Pausadas, com o selo');
ok(await p.$eval('.tk[aria-label="Cobrar resposta da proposta v3"]',x=>x.textContent.includes('Pausa pedida')),'o pedido de pausa aparece como selo no cartão');
await p.evaluate(()=>document.querySelector('.tk-board').scrollIntoView({block:'center'}));await p.screenshot({path:O+'1_quadro.png'});
// gestor aprova a pausa do analista
await papel(p,'Gestor');await p.waitForTimeout(200);await abreCartao(p,'Cobrar resposta da proposta v3');
ok(await p.$('[data-a=pz-aprovar]')!==null,'o gestor de quem pediu vê "Aprovar a pausa"');
await p.evaluate(()=>document.querySelector('.pz-bloco').scrollIntoView({block:'center'}));await p.screenshot({path:O+'2_pedido.png'});
await clica(p,'[data-a=pz-aprovar]');await p.waitForTimeout(250);
s=await est(p);let k=tar(s,0,'Cobrar resposta da proposta v3');
ok(lista(s,0,k).tipo==='pausa'&&k.pausas.at(-1).sit==='ativa','aprovada, a pausa começa e o cartão vai para Pausadas');
ok(s.notifs.some(n=>n.para==='Rafael Souza'&&n.tipo==='aprovacao_decidida'&&n.txt.includes('Pausa aprovada')),'quem pediu é avisado da aprovação');
await fecha(p);
ok(await p.$eval('.tk[aria-label="Cobrar resposta da proposta v3"]',x=>!x.querySelector('.tk-prazo.atras')),'pausada, o prazo vencido não aparece como atrasado');
// sair de Pausadas arrastando não vale
await abreCartao(p,'Cobrar resposta da proposta v3');await muda(p,'.tkm-lsel','Fazer');await p.waitForTimeout(200);
s=await est(p);ok(lista(s,0,tar(s,0,'Cobrar resposta da proposta v3')).tipo==='pausa'&&(await toast(p)).includes('Retomar'),'tirar de Pausadas sem Retomar é recusado');await fecha(p);
// analista pede pausa pelo botão; motivo obrigatório
await papel(p,'Analista');await p.waitForTimeout(200);await abreCartao(p,'Análise jurídica');
await clica(p,'[data-a=pz-form]');await p.waitForTimeout(150);
ok(await p.$eval('.pz-bloco',x=>x.textContent.includes('precisa da aprovação de um gestor')),'o analista é avisado de que a pausa precisa do gestor');
await envia(p,'[data-form=pz-pedir]');await p.waitForTimeout(150);s=await est(p);ok(!(tar(s,0,'Análise jurídica da matrícula').pausas||[]).length,'sem motivo, não pede');
await preenche(p,'[data-form=pz-pedir] textarea','Esperando a certidão de ônus');await envia(p,'[data-form=pz-pedir]');await p.waitForTimeout(200);
s=await est(p);k=tar(s,0,'Análise jurídica da matrícula');
ok(k.pausas.at(-1).sit==='pendente'&&lista(s,0,k).tipo!=='pausa','analista pede: fica pendente e o cartão não muda de lista');
ok(s.notifs.some(n=>n.para==='Ana Prado'&&n.tipo==='aprovacao_pendente'&&n.txt.includes('pausa')),'o gestor é avisado do pedido de pausa');
await fecha(p);
// levar para Pausadas pede o motivo
await abreCartao(p,'Estudo de massa');await muda(p,'.tkm-lsel','Pausadas');await p.waitForTimeout(300);
s=await est(p);ok(lista(s,0,tar(s,0,'Estudo de massa')).tipo!=='pausa'&&await p.$('[data-form=pz-pedir]')!==null,'levar para Pausadas abre o pedido de motivo e não move sozinho');
await p.evaluate(()=>document.querySelector('.pz-bloco').scrollIntoView({block:'center'}));await p.screenshot({path:O+'3_motivo.png'});await fecha(p);
// gestor recusa com motivo
await papel(p,'Gestor');await p.waitForTimeout(200);await abreCartao(p,'Análise jurídica');
await clica(p,'[data-a=pz-recusar]');await p.waitForTimeout(150);await envia(p,'[data-form=pz-recusa]');await p.waitForTimeout(150);
s=await est(p);ok(tar(s,0,'Análise jurídica da matrícula').pausas.at(-1).sit==='pendente','recusar a pausa sem motivo não passa');
await preenche(p,'[data-form=pz-recusa] textarea','Cobre o cartório por telefone');await envia(p,'[data-form=pz-recusa]');await p.waitForTimeout(200);
s=await est(p);ok(tar(s,0,'Análise jurídica da matrícula').pausas.at(-1).sit==='recusada'&&await p.$eval('.pz-bloco',x=>x.textContent.includes('Cobre o cartório')),'recusada com motivo, fica no histórico de pausas');
await fecha(p);
// retomar empurra o prazo pelos dias pausados
await papel(p,'Diretor');await p.waitForTimeout(200);s=await est(p);const pz0=tar(s,0,'Orçar demolição do galpão').prazo;
await abreCartao(p,'Orçar demolição');
ok(await p.$eval('.pz-sla',x=>/3\s*pausada/.test(x.textContent)),'o cartão mostra os dias pausada e o tempo líquido');
await p.evaluate(()=>document.querySelector('.pz-bloco').scrollIntoView({block:'center'}));await p.screenshot({path:O+'4_pausada.png'});
await clica(p,'[data-a=pz-retomar]');await p.waitForTimeout(250);
s=await est(p);k=tar(s,0,'Orçar demolição do galpão');
ok(lista(s,0,k).nome==='Fazendo'&&k.prazo===addD(pz0,3)&&k.pausas.at(-1).dias===3,'Retomar volta para a lista de antes e empurra o prazo 3 dias');
ok(s.terrenos[0].hist.some(h=>h.txt.includes('retomada depois de 3 dias')),'a retomada fica no histórico');
await p.evaluate(()=>document.querySelector('.pz-bloco').scrollIntoView({block:'center'}));await p.screenshot({path:O+'5_retomada.png'});await fecha(p);
// regra: ninguém aprova = pausa na hora
await p.evaluate(()=>history.replaceState(null,'','#/configuracoes/tarefas'));await p.reload();await p.waitForTimeout(400);
await muda(p,'#pz-regra','ninguem');await p.waitForTimeout(200);s=await est(p);ok(s.tkRegras?.pausa==='ninguem','o administrador escolhe quem aprova a pausa');
await p.evaluate(()=>document.querySelector('#pz-regra').closest('.sec').scrollIntoView({block:'center'}));await p.screenshot({path:O+'6_config.png'});
await p.evaluate(()=>history.replaceState(null,'','#/terrenos'));await p.reload();await p.waitForTimeout(300);
await papel(p,'Analista');await ficha(p,t0.id);await p.waitForTimeout(400);await abreCartao(p,'Análise jurídica');
await clica(p,'[data-a=pz-form]');await preenche(p,'[data-form=pz-pedir] textarea','Chuva');await envia(p,'[data-form=pz-pedir]');await p.waitForTimeout(200);
s=await est(p);k=tar(s,0,'Análise jurídica da matrícula');ok(k.pausas.at(-1).sit==='ativa'&&lista(s,0,k).tipo==='pausa','com a regra "ninguém", a pausa vale na hora');
await fecha(p);await papel(p,'Leitura');await p.waitForTimeout(200);await abreCartao(p,'Análise jurídica');
ok(!(await p.$('[data-a=pz-retomar]'))&&!(await p.$('[data-a=pz-form]')),'Leitura não pausa nem retoma');
await ctx.close()}
{const {ctx,p}=await abre(1440,900,'escuro');const s=await est(p);await ficha(p,s.terrenos[0].id);await p.waitForTimeout(400);
await abreCartao(p,'Orçar demolição');await p.evaluate(()=>document.querySelector('.pz-bloco').scrollIntoView({block:'center'}));await p.screenshot({path:O+'7_escuro.png'});await ctx.close()}
{const {ctx,p}=await abre(390,844,'claro');const s=await est(p);await ficha(p,s.terrenos[0].id);await p.waitForTimeout(400);
await abreCartao(p,'Orçar demolição');await p.evaluate(()=>document.querySelector('.pz-bloco').scrollIntoView({block:'start'}));
ok(await p.evaluate(()=>{const d=document.querySelector('#modal .dialog');return d.scrollWidth<=d.clientWidth+1}),'celular: o cartão não rola de lado');
await p.screenshot({path:O+'8_celular.png'});await ctx.close()}
ok(!erros.length,'sem erro de JavaScript '+erros.join(' | '));
await b.close();console.log(falhas.length?`\n${falhas.length} FALHA(S)`:'\nTUDO OK');process.exit(falhas.length?1:0)})();
