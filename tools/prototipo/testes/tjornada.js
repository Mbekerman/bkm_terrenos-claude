// Jornada do terreno (decisões do Moisés, 1/nov/2026): Configurações › Funil › Jornada (perguntas que gravam no campo do
// terreno, campo novo, documentos, pré-requisitos, tarefas, regra em branco, Vale quando, regras pelo valor) e o bloco
// "O que esta etapa pede" no quadro de avanço da ficha (responder ali, travar, justificar, pedir aprovação); prints.
const path=require('path'),fs=require('fs'),{chromium}=require('playwright');
const F=path.join(__dirname,'..','saida','bkm-terrenos.html'),L=path.join(__dirname,'..','libs','l')+'/',O=path.join(__dirname,'..','saida','t_jornada')+'/';fs.mkdirSync(O,{recursive:true});
const falhas=[];const ok=(c,m)=>{console.log((c?'ok   ':'FALHA ')+m);if(!c)falhas.push(m)};
const clica=(p,sel,txt)=>p.evaluate(([s,t])=>{const el=[...document.querySelectorAll(s)].find(x=>!t||x.textContent.includes(t));if(!el)throw new Error('não achei '+s+' '+(t||''));el.click()},[sel,txt||null]);
const muda=(p,sel,v)=>p.evaluate(([s,v])=>{const el=document.querySelector(s);if(!el)throw new Error('não achei '+s);if(el.type==='checkbox'||el.type==='radio')el.checked=v;else el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}))},[sel,v]);
const papel=(p,v)=>p.evaluate(v=>{const a=document.createElement('button');a.dataset.a='role';a.dataset.v=v;document.body.appendChild(a);a.click();a.remove()},v);
const X=(p,f,arg)=>p.evaluate(([f,a])=>window.BKM_TESTE.escopo(f,a),[f.toString(),arg===undefined?null:arg]);
const ficha=(p,id)=>p.evaluate(id=>{const a=document.createElement('button');a.dataset.a='abrir';a.dataset.id=id;a.dataset.tab='geral';document.body.appendChild(a);a.click();a.remove()},id);
(async()=>{const b=await chromium.launch(),erros=[];
const abre=async(w,h,tema)=>{const ctx=await b.newContext({viewport:{width:w,height:h},deviceScaleFactor:1});
  await ctx.route('**/*',r=>{const u=r.request().url();if(u.startsWith('file://'))return r.fulfill({path:F,contentType:'text/html; charset=utf-8'});if(/leaflet.js|jszip/.test(u))return r.fulfill({path:L+(u.includes('leaflet')?'leaflet.js':'jszip.min.js'),contentType:'application/javascript'});return r.abort()});
  const p=await ctx.newPage();p.on('pageerror',e=>erros.push(e.message));await p.goto('file:///x/a.html');await p.evaluate(t=>{localStorage.clear();localStorage.setItem('bkm-terrenos-tema',t)},tema);await p.reload();await p.waitForTimeout(400);return {ctx,p}};
const vai=async(p,h)=>{await p.evaluate(h=>history.replaceState(null,'','#'+h),h);await p.reload();await p.waitForTimeout(400)};
/* terreno de exemplo em Estudos, com as perguntas em branco */
const prepara=p=>X(p,()=>{const t=S.terrenos.find(x=>x.neg?.status==='ativo'&&x.neg.etapa==='estudos'&&!dividida(x));t.posicao='nao_informado';delete t.topoClass;t.demolicao='nao_avaliada';t.aDemolir=null;t.ocupacao='vazio';t.cpers={};
  t.neg.pedido=null;t.neg.sub=subsDe('estudos')[0].k;(cfg().checklist.estudos||[]).length=0;cfg().prereq=cfg().prereq.filter(x=>!(x.alvoTipo==='etapa'&&x.alvo==='negociacao'));
  etRegras().forEach(r=>{if(r.etapa==='estudos')r.trava=false});save();return t.id});
{const {ctx,p}=await abre(1440,1000,'claro');
// 1. Configurações › Funil › Jornada
await vai(p,'/configuracoes/jornada');
ok(await p.$eval('.cfg-nav',x=>x.textContent.includes('Jornada')&&!x.textContent.includes('Checklist')&&!x.textContent.includes('Pré-requisitos')&&!x.textContent.includes('Tarefas da etapa')),'Configurações tem a aba Jornada no lugar de Checklist, Pré-requisitos e Tarefas da etapa');
await clica(p,'[data-a=jn-etapa][data-v=estudos]');await p.waitForTimeout(150);
const C1=await p.$eval('.jn-corpo',x=>x.textContent);
ok(C1.includes('Qual a posição do terreno na quadra?')&&C1.includes('Grava em Terreno › Posição na quadra')&&C1.includes('Modelo Estudos preliminares')&&C1.includes('Relevo acidentado crítico: o diretor aprova a passagem'),
  'a etapa mostra perguntas (com onde grava), tarefas e regras pelo valor num lugar só');
ok(C1.includes('Para sair de Estudo de Massa')&&C1.includes('O recuo frontal atende ao estudo de massa?')&&C1.includes('vale quando'),'cada subetapa tem o que pede para sair dela, com a condição');
await p.screenshot({path:O+'1_config.png'});
// nova pergunta com campo novo do terreno
await clica(p,'[data-a=jn-nova][data-e=estudos][data-s=""]');await p.waitForTimeout(150);
await muda(p,'#jne-c','__novo');await p.waitForTimeout(100);
await muda(p,'#jne-nt','Tem córrego no terreno');await muda(p,'#jne-ny','lista');await p.waitForTimeout(100);await muda(p,'#jne-no','Sim\nNão\nA verificar');await p.waitForTimeout(100);
await muda(p,'#jne-p','Existe córrego ou nascente?');await muda(p,'#jne-a','Olhe a planta da prefeitura e confirme na visita.');await muda(p,'#jne-f','chips');
await clica(p,'#modal [data-a=jn-e-regra][data-v=justifica]');await p.waitForTimeout(100);
await p.screenshot({path:O+'2_pergunta_nova.png'});
await clica(p,'#modal [data-a=jn-cond][data-v=__ed]');await p.waitForTimeout(150);
ok(await p.$eval('#modal h2',x=>x.textContent.includes('Vale quando')),'"+ Condição" abre o mesmo painel Vale quando');
await clica(p,'#modal [data-a=it-c-cancela]');await p.waitForTimeout(150);
ok(await p.$eval('#jne-p',x=>x.value==='Existe córrego ou nascente?'),'voltar da condição mantém o que foi digitado');
await clica(p,'#modal [data-a=jn-salva]');await p.waitForTimeout(150);
let J=await X(p,()=>{const i=jnItens().find(x=>x.pergunta==='Existe córrego ou nascente?');const d=i&&itDef(i.campo);return i&&{campo:i.campo,regra:i.regra,forma:i.forma,sub:i.sub,d:d&&{tit:d.titulo,tipo:d.tipo,op:Object.keys(d.opcoes()),cond:d.condicao,cart:d.cartao}}});
ok(J&&J.campo.startsWith('personalizado.')&&J.regra==='justifica'&&J.forma==='chips'&&!J.sub&&J.d.tit==='Tem córrego no terreno'&&J.d.op.length===3&&J.d.cond&&J.d.cart,
  'a pergunta cria o campo novo do terreno, que entra nas condições e no cartão');
await vai(p,'/configuracoes/campos');ok(await p.$eval('.cfg-corpo',x=>x.innerHTML.includes('Tem córrego no terreno')&&x.textContent.includes('Campo novo do terreno')),'o campo novo aparece em Configurações › Campos');
await vai(p,'/configuracoes/jornada');await clica(p,'[data-a=jn-etapa][data-v=estudos]');await p.waitForTimeout(150);
// o mesmo campo não entra duas vezes no mesmo lugar
await clica(p,'[data-a=jn-nova][data-e=estudos][data-s=""]');await p.waitForTimeout(150);await muda(p,'#jne-c','terreno.posicao_quadra');await p.waitForTimeout(100);
ok(await p.$eval('#jne-c',x=>x.value!=='terreno.posicao_quadra'),'o campo que já está na etapa não aparece de novo na lista');
await clica(p,'#modal [data-a=close]');await p.waitForTimeout(100);
// regra do item muda no lugar; regra pelo valor nova
const it0=await X(p,()=>jnItens().find(x=>x.campo==='terreno.necessidade_demolicao').id);
await muda(p,`[data-jnr="it:${it0}"]`,'bloqueia');await p.waitForTimeout(100);
ok(await X(p,id=>jnItens().find(x=>x.id===id).regra,it0)==='bloqueia','a regra de cada item muda na própria linha');
await clica(p,'[data-a=jn-rv-nova][data-e=estudos]');await p.waitForTimeout(150);
await X(p,()=>{UI.jnRv.cond={modo:'todas',itens:[{campo:'terreno.situacao_ocupacao',op:'em',valores:['ocupado']}]}});await p.evaluate(()=>{});
await muda(p,'#jnr-a','bloqueia');await muda(p,'#jnr-m','Terreno ocupado: resolver a desocupação antes');
await clica(p,'#modal [data-a=jn-rv-salva]');await p.waitForTimeout(150);
ok(await X(p,()=>jnRegrasV().some(r=>r.msg==='Terreno ocupado: resolver a desocupação antes'&&r.acao==='bloqueia')),'regra pelo valor nova: quando, o que acontece e a mensagem');
// 2. ficha: o bloco "O que esta etapa pede" no quadro de avanço
const tid=await prepara(p);await papel(p,'Analista');await ficha(p,tid);await p.waitForTimeout(400);
ok(await p.$eval('#jn-bloco',x=>x.textContent.includes('O que esta etapa pede')&&x.textContent.includes('Qual a posição do terreno na quadra?')&&x.textContent.includes('necessário')),'o quadro de avanço mostra as perguntas da etapa, com o selo');
ok(!(await p.$eval('#jn-bloco',x=>x.textContent.includes('Quanto vai ser demolido?'))),'pergunta com condição que não vale não aparece');
await p.screenshot({path:O+'3_ficha.png'});
const blk=async n=>{const el=await p.evaluateHandle(()=>[...document.querySelectorAll('.jn-bloco')].find(x=>x.offsetParent));await el.screenshot({path:O+n})};await blk('3b_quadro.png');
// responder no próprio quadro grava no campo do terreno
const iTopo=await X(p,()=>jnItens().find(x=>x.campo==='terreno.posicao_quadra').id);
await clica(p,`#jnq-${iTopo} [data-a=jn-v][data-v=meio_quadra]`);await p.waitForTimeout(150);
let T1=await X(p,id=>{const t=T(id);return {topo:t.posicao,log:t.hist.some(h=>/Posição na quadra de .* para Meio de quadra \(pela jornada\)/.test(h.txt||h.texto||JSON.stringify(h)))}},tid);
ok(T1.topo==='meio_quadra'&&T1.log,'responder grava no próprio terreno (fonte única) e vai para o histórico');
const iDem=await X(p,()=>jnItens().find(x=>x.campo==='terreno.necessidade_demolicao').id);
await clica(p,`#jnq-${iDem} [data-a=jn-v][data-v=confirmada]`);await p.waitForTimeout(150);
ok(await p.$eval('#jn-bloco',x=>x.textContent.includes('Quanto vai ser demolido?')),'a pergunta condicional aparece quando a condição passa a valer');
// analista: item que não avança sem trava; Avançar mostra a lista
await X(p,id=>{const t=T(id);t.posicao='nao_informado';save();render()},tid);await p.waitForTimeout(100);
await clica(p,'[data-a=adv-ir]');await p.waitForTimeout(200);
ok(await X(p,()=>UI.modal)==='adv-bloq'&&await p.$eval('#modal',x=>x.textContent.includes('Precisa demolir?')===false&&x.textContent.includes('Qual a posição do terreno na quadra?')&&x.textContent.includes('Quanto vai ser demolido?')),'analista: um item necessário em branco trava, com a lista do que falta');
await clica(p,'#modal [data-a=close]');await p.waitForTimeout(100);
// responde o que bloqueia; sobra só o que pede justificativa: o analista passa justificando
await X(p,id=>{const t=T(id);t.aDemolir=1500;t.posicao='meio_quadra';save();render()},tid);await p.waitForTimeout(100);
ok(await p.$eval('#jn-bloco',x=>x.textContent.includes('Demolição acima de 1.000 m²')),'a regra que só avisa aparece no quadro');
let P1=await X(p,id=>pendencias(T(id),'etapa','negociacao').filter(x=>!x.ok).map(x=>({txt:x.txt,just:!!x.just})),tid);
ok(P1.length&&P1.every(x=>x.just),'sobram só os itens que pedem justificativa');
await clica(p,'[data-a=adv-ir]');await p.waitForTimeout(200);
ok(await X(p,()=>UI.modal)==='forcar','analista: com só itens que pedem justificativa, Avançar pede a justificativa');
await p.screenshot({path:O+'4_justificar_analista.png'});
await clica(p,'#modal [data-a=close]');await p.waitForTimeout(100);
// regra pelo valor: relevo acidentado crítico pede o diretor
await X(p,id=>{const t=T(id);t.topoClass={key:tpKey(t),perfil:'acidentado_critico',incl:35,terra:1.2,fonte:'laser',em:agora()};save();render()},tid);await p.waitForTimeout(150);
ok(await p.$eval('[data-a=adv-ir]',x=>x.textContent.includes('Pedir aprovação'))&&await p.$eval('#jn-bloco',x=>x.textContent.includes('Relevo acidentado crítico')),'relevo acidentado crítico: a regra pelo valor pede o diretor e o botão vira Pedir aprovação');
// regra pelo valor que bloqueia
await X(p,id=>{const t=T(id);t.ocupacao='ocupado';save();render()},tid);await p.waitForTimeout(100);
let P2=await X(p,id=>pendencias(T(id),'etapa','negociacao').filter(x=>!x.ok).map(x=>x.txt),tid);
ok(P2.includes('Terreno ocupado: resolver a desocupação antes'),'a regra pelo valor que não avança entra nas pendências');
ok(await p.$eval('#jn-bloco',x=>{const g=[...x.querySelectorAll('.jn-g')].find(g=>g.textContent.includes('Custo estimado de desocupação'));return !!g&&g.querySelector('.jn-gt').textContent.includes('Estudo de Viabilidade')}),'a pergunta da subetapa posterior aparece no grupo da própria subetapa quando a condição passa a valer');
// voltar não exige nada
ok(await X(p,id=>jnPend(T(id),faseEnt(),T(id).neg,'etapa','triagem').length,tid)===0,'voltar de etapa não exige a jornada');
// Leitura: só vê
await papel(p,'Leitura');await p.waitForTimeout(200);
ok(!(await p.$('#jn-bloco [data-a=jn-v]'))&&await p.$eval('#jn-bloco',x=>x.textContent.includes('Meio de quadra')),'Leitura vê as respostas sem poder mudar');
await papel(p,'Diretor');await p.waitForTimeout(100);
// gestor passa o que bloqueia com justificativa
await X(p,id=>{const t=T(id);t.ocupacao='vazio';t.posicao='meio_quadra';delete t.topoClass;t.aDemolir=null;save();render()},tid);await papel(p,'Gestor');await p.waitForTimeout(150);
await clica(p,'[data-a=adv-ir]');await p.waitForTimeout(200);ok(await X(p,()=>UI.modal)==='forcar','gestor: o que não avança sem passa com justificativa');
await clica(p,'#modal [data-a=close]');
// subetapa: sair da subetapa pede o item dela
let S1=await X(p,id=>{const t=T(id),s=subsDe('estudos');return pendencias(t,'subetapa',s[1].k).filter(x=>x.jn).map(x=>x.txt)},tid);
ok(S1.length===1&&S1[0].startsWith('O recuo frontal atende ao estudo de massa?'),'sair da subetapa pede só o que é dela');
await ctx.close()}
// regra em branco com as 3 opções em todo item e comportamento condicional (1/nov/2026)
{const {ctx,p}=await abre(1440,1000,'claro');
await vai(p,'/configuracoes/jornada');await clica(p,'[data-a=jn-etapa][data-v=estudos]');await p.waitForTimeout(150);
ok(await p.$$eval('.jn-corpo select.jn-rs',L=>L.filter(x=>!x.dataset.jnr.startsWith('rv:')).every(x=>['bloqueia','justifica','livre','cond'].every(v=>[...x.options].some(o=>o.value===v)))),
  'todo item (pergunta, documento, pré-requisito e tarefa) tem as 3 opções e Condicional');
const iT=await X(p,()=>jnItens().find(x=>x.campo==='terreno.posicao_quadra').id);
await muda(p,`[data-jnr="it:${iT}"]`,'cond');await p.waitForTimeout(200);
ok(await X(p,()=>UI.modal)==='it-cond','escolher Condicional abre o painel da condição do primeiro comportamento');
await X(p,()=>{UI.itCond.ext.salvar({modo:'todas',itens:[{campo:'terreno.situacao_ocupacao',op:'em',valores:['ocupado']}]});UI.itCond.ext.voltar()});await p.waitForTimeout(150);
ok(await X(p,()=>UI.modal)==='jn-rc'&&await p.$eval('#modal',x=>x.textContent.includes('Nos demais casos')&&x.textContent.includes('ocupação é Ocupado')),'a janela mostra o comportamento com a condição e "Nos demais casos"');
await muda(p,'#modal [data-jnrc="0"]','livre');await muda(p,'#modal [data-jnrc="base"]','bloqueia');
await clica(p,'#modal [data-a=jn-rc-mais]');await p.waitForTimeout(150);
await X(p,()=>{UI.itCond.ext.salvar({modo:'todas',itens:[{campo:'terreno.necessidade_demolicao',op:'em',valores:['confirmada']}]});UI.itCond.ext.voltar()});await p.waitForTimeout(150);
await muda(p,'#modal [data-jnrc="1"]','justifica');
await p.screenshot({path:O+'7_condicional.png'});
await clica(p,'#modal [data-a=jn-rc-salva]');await p.waitForTimeout(150);
let RC=await X(p,id=>jnItens().find(x=>x.id===id),iT);
ok(RC.regra==='bloqueia'&&RC.rc.length===2&&RC.rc[0].regra==='livre'&&RC.rc[1].regra==='justifica','o item guarda o comportamento único e os condicionais');
ok(await p.$eval(`[data-jnr="it:${iT}"]`,x=>x.value==='cond')&&await p.$eval('.jn-corpo',x=>x.textContent.includes('Pode avançar quando ocupação é Ocupado')&&x.textContent.includes('nos demais casos, não avança')),
  'a linha mostra "Condicional" e a frase do comportamento');
await p.screenshot({path:O+'8_condicional_linha.png'});
// o comportamento muda com o terreno
const tid=await prepara(p);
const ef=()=>X(p,id=>{const p=pendencias(T(id),'etapa','negociacao').find(x=>x.txt.startsWith('Qual a posição do terreno'));return p?(p.just?'justifica':'bloqueia'):'livre'},tid);
ok(await ef()==='bloqueia','nenhuma condição vale: não avança');
await X(p,id=>{const t=T(id);t.demolicao='confirmada';save()},tid);ok(await ef()==='justifica','a condição que vale decide: avança com justificativa');
await X(p,id=>{const t=T(id);t.ocupacao='ocupado';save()},tid);ok(await ef()==='livre','a primeira condição que vale ganha: pode avançar');
await X(p,id=>{const t=T(id);t.ocupacao='vazio';t.demolicao='confirmada';save()},tid);await papel(p,'Analista');await ficha(p,tid);await p.waitForTimeout(300);
ok(await X(p,id=>{const b=[...document.querySelectorAll('.jn-bloco')].find(x=>x.offsetParent);const q=[...b.querySelectorAll('.jn-q')].find(x=>x.textContent.includes('Qual a posição do terreno'));return q&&q.querySelector('.jn-selo.justifica')},tid),
  'na ficha, o selo segue o comportamento que vale para o terreno');
// voltar para único limpa a condicional
await papel(p,'Diretor');await vai(p,'/configuracoes/jornada');await clica(p,'[data-a=jn-etapa][data-v=estudos]');await p.waitForTimeout(150);
await muda(p,`[data-jnr="it:${iT}"]`,'justifica');await p.waitForTimeout(100);
ok(await X(p,id=>{const i=jnItens().find(x=>x.id===id);return i.regra==='justifica'&&!i.rc},iT),'escolher uma das 3 opções volta ao comportamento único');
// tarefa da etapa com "avança com justificativa": a tarefa aberta pede justificativa
const iR=await X(p,()=>etRegras().find(r=>r.etapa==='estudos'&&!r.sub)?.id);
if(iR){await muda(p,`[data-jnr="tar:${iR}"]`,'justifica');await p.waitForTimeout(100);
  ok(await X(p,id=>{const r=etRegras().find(x=>x.id===id);return r.regra==='justifica'&&r.trava},iR),'a tarefa da etapa pode ser "avança com justificativa"');}
// pré-requisito "pode avançar"
const iP=await X(p,()=>{const c=cfg();if(!c.prereq.length)c.prereq.push({id:uid(),alvoTipo:'etapa',alvo:'negociacao',req:subsDe('estudos')[0].k});save();return c.prereq[0].id});
await vai(p,'/configuracoes/jornada');await X(p,id=>{const pr=cfg().prereq.find(x=>x.id===id);UI.jnEtapa=pr.alvoTipo==='etapa'?pr.alvo:subCfg(pr.alvo).etapa;render()},iP);await p.waitForTimeout(150);
await muda(p,`[data-jnr="pr:${iP}"]`,'livre');await p.waitForTimeout(100);
ok(await X(p,id=>cfg().prereq.find(x=>x.id===id).regra==='livre',iP),'o pré-requisito pode ser "pode avançar"');
await ctx.close()}
{const {ctx,p}=await abre(390,844,'escuro');const tid=await prepara(p);await papel(p,'Analista');await ficha(p,tid);await p.waitForTimeout(400);
  const el=await p.$('#jn-bloco');await el.scrollIntoViewIfNeeded();await p.screenshot({path:O+'5_celular_escuro.png'});
  ok(await p.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'celular: sem rolagem lateral');
  await vai(p,'/configuracoes/jornada');await p.screenshot({path:O+'6_config_celular_escuro.png'});
  ok(await p.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'celular: a Jornada em Configurações sem rolagem lateral');
  await ctx.close()}
ok(!erros.length,'sem erro de JavaScript '+erros.join(' | '));
await b.close();console.log(falhas.length?`${falhas.length} FALHA(S)`:'TUDO OK');process.exit(falhas.length?1:0)})();
