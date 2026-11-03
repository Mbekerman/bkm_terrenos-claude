// Campos do terreno no cartão, regra se em branco por item, aba Configuração, condição com grupo, justificativa e diretor (31/out/2026); prints.
const path=require('path'),fs=require('fs'),{chromium}=require('playwright');
const F=path.join(__dirname,'..','saida','bkm-terrenos.html'),L=path.join(__dirname,'..','libs','l')+'/',O=path.join(__dirname,'..','saida','t_itens')+'/';fs.mkdirSync(O,{recursive:true});
const falhas=[];const ok=(c,m)=>{console.log((c?'ok   ':'FALHA ')+m);if(!c)falhas.push(m)};
const est=p=>p.evaluate(()=>JSON.parse(localStorage.getItem('bkm-terrenos-prototipo-v9')));
const clica=(p,sel,txt)=>p.evaluate(([s,t])=>{let el=[...document.querySelectorAll(s)].find(x=>!t||x.textContent.includes(t));if(!el&&window.__tkAcha)el=window.__tkAcha(s,t);if(!el)throw new Error('não achei '+s+' '+(t||''));el.click()},[sel,txt||null]);
const muda=(p,sel,v)=>p.evaluate(([s,v])=>{let el=document.querySelector(s);if(!el&&window.__tkAcha)el=window.__tkAcha(s);if(!el)throw new Error('não achei '+s);if(el.tagName==='SELECT'&&![...el.options].some(o=>o.value===v)){const o=[...el.options].find(o=>o.textContent.includes(v));if(o)v=o.value}el.value=v;el.dispatchEvent(new Event('change',{bubbles:true}))},[sel,v]);
const preenche=(p,sel,v)=>p.evaluate(([s,v])=>{let el=document.querySelector(s);if(!el&&window.__tkAcha)el=window.__tkAcha(s);if(!el)throw new Error('não achei '+s);el.value=v},[sel,v]);
const incluir=async(p,dest)=>{if(!(await p.$('#modal [data-a=fm-nova]'))){await clica(p,'#modal [data-a=fm-modo][data-v=montar]');await p.waitForTimeout(100)}await clica(p,'#modal [data-a=fm-nova]');await p.waitForTimeout(100);await p.click('#fme-d');await p.waitForTimeout(80);await p.click(`#modal [data-gvv="${dest}"]`);await p.waitForTimeout(100);await clica(p,'#modal [data-a=fm-salva]');await p.waitForTimeout(120);await clica(p,'#modal [data-a=fm-modo][data-v=responder]');await p.waitForTimeout(120)};
const envia=(p,sel)=>p.evaluate(s=>{let f=document.querySelector(s);if(!f&&window.__tkAcha)f=window.__tkAcha(s);if(!f)throw new Error('não achei '+s);f.requestSubmit()},sel);
const papel=(p,v)=>p.evaluate(v=>{const a=document.createElement('button');a.dataset.a='role';a.dataset.v=v;document.body.appendChild(a);a.click();a.remove()},v);
const ficha=(p,id)=>p.evaluate(id=>{const a=document.createElement('button');a.dataset.a='abrir';a.dataset.id=id;a.dataset.tab='tarefas';document.body.appendChild(a);a.click();a.remove();document.querySelector('#bl-tarefas [data-a=cr-vista][data-v=quadro][aria-pressed=false]')?.click()},id);  // roteiro escrito sobre o quadro; a ficha abre na Lista
const toast=p=>p.evaluate(()=>document.querySelector('.toast')?.textContent||'');
const tar=(s,i,tit)=>s.terrenos[i].tarefas.find(k=>k.titulo===tit);
const addD=(d,n)=>{const x=new Date(d+'T12:00:00');x.setDate(x.getDate()+n);return x.toISOString().slice(0,10)};
const TK_ACHA=()=>{window.__tkAcha=(s,t)=>{for(const v of [...document.querySelectorAll('#modal [data-a=tkc-aba]')].map(x=>x.dataset.v)){document.querySelector(`#modal [data-a=tkc-aba][data-v=${v}]`)?.click();const el=[...document.querySelectorAll(s)].find(x=>!t||x.textContent.includes(t));if(el)return el}return null}};  // cartão com abas: procura o elemento nas abas

const it=(s,tit,ch)=>tar(s,0,tit).itens.find(i=>i.chave===ch);
const abas=p=>p.$$eval('#modal [data-a=tkc-aba]',xs=>xs.map(x=>x.dataset.v));
(async()=>{const b=await chromium.launch(),erros=[];
const abre=async(w,h,tema)=>{const ctx=await b.newContext({viewport:{width:w,height:h},deviceScaleFactor:1});
  await ctx.route('**/*',r=>{const u=r.request().url();if(u.startsWith('file://'))return r.fulfill({path:F,contentType:'text/html; charset=utf-8'});if(/leaflet.js|jszip/.test(u))return r.fulfill({path:L+(u.includes('leaflet')?'leaflet.js':'jszip.min.js'),contentType:'application/javascript'});return r.abort()});
  const p=await ctx.newPage();await p.addInitScript(TK_ACHA);p.on('pageerror',e=>erros.push(e.message));await p.goto('file:///x/a.html');await p.evaluate(t=>{localStorage.clear();localStorage.setItem('bkm-terrenos-tema',t)},tema);await p.reload();await p.waitForTimeout(400);return {ctx,p}};
const abreCartao=async(p,tit)=>{await clica(p,'.tk',tit);await p.waitForTimeout(250)};
const fecha=async p=>{await clica(p,'#modal [data-a=close]');await p.waitForTimeout(150)};
const vai=async(p,h)=>{await p.evaluate(h=>history.replaceState(null,'','#'+h),h);await p.reload();await p.waitForTimeout(400)};
const AJ='Análise jurídica da matrícula';
{const {ctx,p}=await abre(1440,900,'claro');
// 1. Configurações › Campos
await vai(p,'/configuracoes/campos');
ok(await p.$eval('.it-tab',x=>x.textContent.includes('area_documental_m2')&&x.textContent.includes('forma_pagamento_vigente')),'Configurações › Campos lista os campos do terreno, da negociação, da oferta, da proposta e os calculados');
await preenche(p,'[data-itcfg=titulo][data-v="terreno.area_documental_m2"]','Área da matrícula');await muda(p,'[data-itcfg=titulo][data-v="terreno.area_documental_m2"]','Área da matrícula');await p.waitForTimeout(150);
let s=await est(p);ok(s.camposEmp['terreno.area_documental_m2'].titulo==='Área da matrícula','o administrador muda o título');
await muda(p,'[data-itcfg=titulo][data-v="terreno.area_cadastral_m2"]','área da matrícula');await p.waitForTimeout(150);s=await est(p);
ok(!s.camposEmp['terreno.area_cadastral_m2']?.titulo&&(await toast(p)).includes('esse título'),'título repetido é recusado');
await p.$eval('[data-itcfg=cartao][data-v="terreno.uso_atual"]',x=>{x.checked=false;x.dispatchEvent(new Event('change',{bubbles:true}))});await p.waitForTimeout(150);
s=await est(p);ok(s.camposEmp['terreno.uso_atual'].cartao===false,'desmarcar "No cartão"');
await p.screenshot({path:O+'1_config_campos.png'});
await vai(p,'/configuracoes/campos');await papel(p,'Analista');await p.waitForTimeout(200);
ok(!(await p.$('[data-itcfg=titulo]:not([disabled])'))||!(await p.$('.it-tab')),'fora do administrador, Configurações não edita os campos');
await papel(p,'Diretor');await vai(p,'/terrenos');
// 2. cartão com campos do terreno (exemplo semeado)
s=await est(p);const t0=s.terrenos[0];await ficha(p,t0.id);await p.waitForTimeout(400);await abreCartao(p,AJ);
ok(await p.$eval('#modal .fm',x=>x.textContent.includes('Área da matrícula')&&x.textContent.includes('Forma de pagamento vigente')),'o cartão mostra os campos do terreno incluídos, com o título da empresa');
ok(await p.$eval('#modal .fm',x=>x.textContent.includes('só leitura')),'campo calculado é só leitura');
const ia=it(s,AJ,'terreno.area_documental_m2');
await preenche(p,`[data-fm="${ia.id}"]`,'2.150');await muda(p,`[data-fm="${ia.id}"]`,'2.150');await p.waitForTimeout(150);s=await est(p);
ok(s.terrenos[0].aDoc===2150,'editar no cartão grava no terreno');ok(s.terrenos[0].hist.some(h=>h.txt.includes('Área da matrícula')&&h.txt.includes('pelo cartão')),'e vai para o histórico do terreno');
await muda(p,`[data-fm="${ia.id}"]`,'');await p.waitForTimeout(150);s=await est(p);ok(s.terrenos[0].aDoc==null,'apagar deixa o campo em branco (nunca zero)');
ok(await p.$eval(`[data-fm="${ia.id}"]`,x=>!!x.closest('.fm-ans.falta')&&x.closest('.fm-ans').textContent.includes('necessário')),'em branco com "não conclui": selo necessário');
await clica(p,'#modal [data-a=fm-modo][data-v=montar]');await p.waitForTimeout(100);await clica(p,'#modal [data-a=fm-nova]');await p.waitForTimeout(100);
ok(await p.$eval('.gv-pop',x=>x.textContent.includes('Terreno')&&x.textContent.includes('Tarefa')&&!x.textContent.includes('Uso atual')),'+ Pergunta lista os campos por origem e respeita "No cartão"');
await p.fill('#fme-d','testada');await p.waitForTimeout(150);
{const a=await p.$$eval('.gv-pop .it-popi:not([data-gvv=cartao])',xs=>xs.map(x=>x.textContent));ok(a.length>=1&&a.every(x=>/testada/i.test(x))&&a.some(x=>x.includes('Testada')),'a busca acha o campo: '+a.join(' | '))}
await p.click('#modal [data-gvv="terreno.testada_principal_m"]');await p.waitForTimeout(100);await clica(p,'#modal [data-a=fm-salva]');await p.waitForTimeout(150);await clica(p,'#modal [data-a=fm-modo][data-v=responder]');await p.waitForTimeout(100);s=await est(p);
ok(!!it(s,AJ,'terreno.testada_principal_m'),'campo incluído no cartão');
await p.evaluate(()=>document.querySelector('#modal .fm').scrollIntoView({block:'center'}));await p.screenshot({path:O+'2_cartao.png'});
// 3. aba Configuração
ok((await abas(p)).includes('config'),'o diretor vê a aba Configuração');
await clica(p,'#modal [data-a=tkc-aba][data-v=config]');await p.waitForTimeout(150);
ok(await p.$eval('.it-ct',x=>x.textContent.includes('Área da matrícula')&&x.textContent.includes('Testada')&&x.textContent.includes('Cartório')),'a aba lista todos os itens incluídos');
const ib=it(s,AJ,'terreno.testada_principal_m');await muda(p,`[data-itr="${ib.id}"]`,'justificativa');await p.waitForTimeout(150);
s=await est(p);ok(it(s,AJ,'terreno.testada_principal_m').regra==='justificativa','regra "conclui com justificativa" no item');
// editor de condição com grupo
await clica(p,`#modal [data-a=it-cond][data-v="i:${ib.id}"]`);await p.waitForTimeout(150);
await clica(p,'#modal [data-a=it-c-campo][data-p="0"][data-v="terreno.tipo_empreendimento"]');await p.waitForTimeout(80);
await clica(p,'#modal [data-a=it-c-val][data-p="0"][data-v="his"]');await clica(p,'#modal [data-a=it-c-val][data-p="0"][data-v="hmp"]');await p.waitForTimeout(80);
await clica(p,'#modal [data-a=it-c-grupo]');await p.waitForTimeout(80);
await clica(p,'#modal [data-a=it-c-campo][data-p="1.0"][data-v="terreno.topografia"]');await clica(p,'#modal [data-a=it-c-val][data-p="1.0"][data-v="aclive"]');
await clica(p,'#modal [data-a=it-c-mais][data-p="1"]');await p.waitForTimeout(80);
await clica(p,'#modal [data-a=it-c-campo][data-p="1.1"][data-v="terreno.necessidade_demolicao"]');await clica(p,'#modal [data-a=it-c-val][data-p="1.1"][data-v="confirmada"]');await p.waitForTimeout(100);
const fr=await p.$eval('.it-frase',x=>x.textContent);
ok(/tipo de empreendimento é HIS ou HMP e \(topografia é Aclive ou precisa demolir é Confirmada\)/.test(fr),'a frase lê a condição com o grupo: '+fr);
await p.screenshot({path:O+'3_condicao.png'});
await clica(p,'#modal [data-a=it-c-salva]');await p.waitForTimeout(150);s=await est(p);
const cd=it(s,AJ,'terreno.testada_principal_m').cond;ok(cd&&cd.itens.length===2&&cd.itens[1].grupo.modo==='qualquer','condição salva com um grupo "qualquer uma"');
ok((await abas(p)).includes('config')&&await p.$eval('.it-ct',x=>x.textContent.includes('HIS ou HMP')),'volta à aba Configuração com a condição');
await p.screenshot({path:O+'4_aba_config.png'});
// grupo dentro de grupo não existe no editor (um nível)
ok(!(await p.$('.it-grp [data-a=it-c-grupo]')),'um nível de grupo só');
await fecha(p);
// 4. Analista: sem a aba, com os selos; regra só pelo criador
await papel(p,'Analista');await p.waitForTimeout(200);await abreCartao(p,AJ);
ok(!(await abas(p)).includes('config'),'o analista que não criou a tarefa não vê a aba Configuração');
ok(await p.$eval('#modal .fm',x=>x.textContent.includes('necessário')),'mas vê o selo');
await clica(p,'#modal [data-a=fm-modo][data-v=montar]');await p.waitForTimeout(100);
ok(await p.$eval(`[data-a=fm-tira][data-v="${ia.id}"]`,x=>x.disabled),'e não tira do cartão o item com regra');
await fecha(p);
// 5. conclusão: um cartão sem aprovador, com item "pede justificativa" e outro "não conclui"
await papel(p,'Diretor');await p.waitForTimeout(150);s=await est(p);
const kk=s.terrenos[0].tarefas.find(k=>!k.feita&&!k.arq&&!k.mae&&!k.modelo&&!(k.aprov||[]).length&&!(k.checklists||[]).some(c=>c.itens.some(i=>!i.feito))&&!s.terrenos[0].tarefas.some(x=>x.mae===k.id&&!x.feita)&&(!k.vis||k.vis==='publico')&&!(k.preds||[]).length&&k.titulo!==AJ);
ok(!!kk,'há um cartão para concluir: '+(kk&&kk.titulo));
await abreCartao(p,kk.titulo);
for(const ch of ['terreno.area_levantamento_m2','terreno.desnivel_estimado_m'])await incluir(p,ch);
await clica(p,'#modal [data-a=tkc-aba][data-v=config]');await p.waitForTimeout(100);s=await est(p);
const ka=tar(s,0,kk.titulo).itens.find(i=>i.chave==='terreno.area_levantamento_m2'),kd=tar(s,0,kk.titulo).itens.find(i=>i.chave==='terreno.desnivel_estimado_m');
await muda(p,`[data-itr="${kd.id}"]`,'justificativa');await p.waitForTimeout(100);
// apaga o valor do terreno para os dois ficarem em branco
await clica(p,'#modal [data-a=tkc-aba][data-v=geral]');await p.waitForTimeout(100);
for(const x of [ka,kd]){if(await p.$(`[data-fm="${x.id}"]`)){await muda(p,`[data-fm="${x.id}"]`,'');await p.waitForTimeout(80)}}
s=await est(p);ok(s.terrenos[0].aLev==null&&s.terrenos[0].desnivel==null,'campos do terreno em branco');
await fecha(p);await papel(p,'Analista');await p.waitForTimeout(150);await abreCartao(p,kk.titulo);
await clica(p,'#modal [data-a=tkc-concluir]');await p.waitForTimeout(200);
ok(!!(await p.$('.it-just-f')),'em branco com "pede justificativa": Concluir abre a justificativa');
ok(await p.$eval('.it-just-f',x=>x.textContent.includes('Desnível estimado')&&!x.textContent.includes('Como diretor')),'a janela diz o que está em branco');
await p.screenshot({path:O+'5_justificativa.png'});
await clica(p,'.it-just-f [type=submit]');await p.waitForTimeout(150);s=await est(p);
ok(!tar(s,0,kk.titulo).feita&&!!(await p.$('.it-just-f')),'sem texto, não conclui');
await preenche(p,'.it-just-f textarea','Desnível só sai com o topográfico.');await clica(p,'.it-just-f [type=submit]');await p.waitForTimeout(250);s=await est(p);
ok(!!tar(s,0,kk.titulo).feita,'com a justificativa, conclui');
ok(s.terrenos[0].hist.some(h=>h.txt.includes('Justificativa: Desnível só sai com o topográfico')),'a justificativa fica no histórico');
// reabre e põe "não conclui" em outro: analista não passa, gestor e diretor passam
await fecha(p);await papel(p,'Diretor');await p.waitForTimeout(150);await abreCartao(p,kk.titulo);await clica(p,'#modal [data-a=tkc-concluir]');await p.waitForTimeout(200);
await clica(p,'#modal [data-a=tkc-aba][data-v=config]');await p.waitForTimeout(100);await muda(p,`[data-itr="${ka.id}"]`,'bloqueia');await p.waitForTimeout(100);
await fecha(p);await papel(p,'Analista');await p.waitForTimeout(150);await abreCartao(p,kk.titulo);
await clica(p,'#modal [data-a=tkc-concluir]');await p.waitForTimeout(200);s=await est(p);
ok(!tar(s,0,kk.titulo).feita&&!(await p.$('.it-just-f'))&&(await toast(p)).includes('Área do levantamento'),'"não conclui" trava o analista e diz o que falta');
await fecha(p);await papel(p,'Gestor');await p.waitForTimeout(150);await abreCartao(p,kk.titulo);
await clica(p,'#modal [data-a=tkc-concluir]');await p.waitForTimeout(200);s=await est(p);
ok(!tar(s,0,kk.titulo).feita&&await p.$eval('.it-just-f',x=>x.textContent.includes('Como gestor')),'o gestor também conclui com justificativa');
await clica(p,'.it-just-f [data-just=nao]');await p.waitForTimeout(150);
await fecha(p);await papel(p,'Diretor');await p.waitForTimeout(150);await abreCartao(p,kk.titulo);
await clica(p,'#modal [data-a=tkc-concluir]');await p.waitForTimeout(200);
ok(await p.$eval('.it-just-f',x=>x.textContent.includes('Como diretor')),'o diretor conclui com justificativa');
await preenche(p,'.it-just-f textarea','Levantamento contratado; o diretor libera.');await clica(p,'.it-just-f [type=submit]');await p.waitForTimeout(250);s=await est(p);
ok(!!tar(s,0,kk.titulo).feita&&tar(s,0,kk.titulo).justs.at(-1).libera===true,'concluiu e a justificativa marca que passou pelo bloqueio');
// 6. condição que não vale não pede nada
await fecha(p);s=await est(p);
ok(s.terrenos[0].tipoEmp!=='his'&&s.terrenos[0].tipoEmp!=='hmp','o terreno não é HIS nem HMP');
await abreCartao(p,AJ);if(await p.$('#modal [data-a=fm-modo][data-v=responder]:not(.on)')){await clica(p,'#modal [data-a=fm-modo][data-v=responder]');await p.waitForTimeout(100)}const tst=it(s,AJ,'terreno.testada_principal_m');
if(await p.$(`[data-fm="${tst.id}"]`)){await muda(p,`[data-fm="${tst.id}"]`,'');await p.waitForTimeout(100)}
ok(await p.$eval(`[data-fm="${tst.id}"]`,x=>!x.closest('.fm-ans').textContent.includes('pede justificativa')),'com a condição sem valer, a testada em branco não pede justificativa');
await ctx.close()}
{const {ctx,p}=await abre(1440,900,'escuro');await vai(p,'/configuracoes/campos');await p.screenshot({path:O+'6_escuro_campos.png'});
const s=await est(p);await vai(p,'/terrenos');await ficha(p,s.terrenos[0].id);await p.waitForTimeout(400);await abreCartao(p,AJ);await clica(p,'#modal [data-a=tkc-aba][data-v=config]');await p.waitForTimeout(150);await p.screenshot({path:O+'7_escuro_config.png'});await ctx.close()}
{const {ctx,p}=await abre(390,844,'claro');await vai(p,'/configuracoes/campos');
ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'celular: Configurações › Campos não rola de lado');await p.screenshot({path:O+'8_celular_campos.png'});
const s=await est(p);await vai(p,'/terrenos');await ficha(p,s.terrenos[0].id);await p.waitForTimeout(400);await abreCartao(p,AJ);await clica(p,'#modal [data-a=tkc-aba][data-v=config]');await p.waitForTimeout(150);
ok(await p.evaluate(()=>{const d=document.querySelector('#modal .dialog');return d.scrollWidth<=d.clientWidth+1}),'celular: a aba Configuração não rola de lado');await p.screenshot({path:O+'9_celular_config.png'});await ctx.close()}
ok(!erros.length,'sem erro de JavaScript '+erros.join(' | '));
await b.close();console.log(falhas.length?`\n${falhas.length} FALHA(S)`:'\nTUDO OK');process.exit(falhas.length?1:0)})();
