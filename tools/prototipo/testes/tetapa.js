// Tarefas da etapa (lote B da ligação funil × quadros, 31/out/2026): regras por etapa e subetapa, trava, aviso pode avançar,
// etapa do funil no cartão, volta de etapa, Stand By, Perdido/Descartado, condições no checklist e nos pré-requisitos, gatilho; prints.
const path=require('path'),fs=require('fs'),{chromium}=require('playwright');
const F=path.join(__dirname,'..','saida','bkm-terrenos.html'),L=path.join(__dirname,'..','libs','l')+'/',O=path.join(__dirname,'..','saida','t_etapa')+'/';fs.mkdirSync(O,{recursive:true});
const falhas=[];const ok=(c,m)=>{console.log((c?'ok   ':'FALHA ')+m);if(!c)falhas.push(m)};
const clica=(p,sel,txt)=>p.evaluate(([s,t])=>{const el=[...document.querySelectorAll(s)].find(x=>!t||x.textContent.includes(t));if(!el)throw new Error('não achei '+s+' '+(t||''));el.click()},[sel,txt||null]);
const muda=(p,sel,v)=>p.evaluate(([s,v])=>{const el=document.querySelector(s);if(!el)throw new Error('não achei '+s);if(el.type==='checkbox'||el.type==='radio')el.checked=v;else el.value=v;el.dispatchEvent(new Event('change',{bubbles:true}))},[sel,v]);
const papel=(p,v)=>p.evaluate(v=>{const a=document.createElement('button');a.dataset.a='role';a.dataset.v=v;document.body.appendChild(a);a.click();a.remove()},v);
const ficha=(p,id,tab)=>p.evaluate(([id,tab])=>{const a=document.createElement('button');a.dataset.a='abrir';a.dataset.id=id;a.dataset.tab=tab||'geral';document.body.appendChild(a);a.click();a.remove()},[id,tab]);
const toast=p=>p.evaluate(()=>document.querySelector('.toast')?.textContent||'');
const X=(p,f,arg)=>p.evaluate(([f,a])=>window.BKM_TESTE.escopo(f,a),[f.toString(),arg===undefined?null:arg]);
(async()=>{const b=await chromium.launch(),erros=[];
const abre=async(w,h,tema)=>{const ctx=await b.newContext({viewport:{width:w,height:h},deviceScaleFactor:1});
  await ctx.route('**/*',r=>{const u=r.request().url();if(u.startsWith('file://'))return r.fulfill({path:F,contentType:'text/html; charset=utf-8'});if(/leaflet.js|jszip/.test(u))return r.fulfill({path:L+(u.includes('leaflet')?'leaflet.js':'jszip.min.js'),contentType:'application/javascript'});return r.abort()});
  const p=await ctx.newPage();p.on('pageerror',e=>erros.push(e.message));await p.goto('file:///x/a.html');await p.evaluate(t=>{localStorage.clear();localStorage.setItem('bkm-terrenos-tema',t)},tema);await p.reload();await p.waitForTimeout(400);return {ctx,p}};
const vai=async(p,h)=>{await p.evaluate(h=>history.replaceState(null,'','#'+h),h);await p.reload();await p.waitForTimeout(400)};
{const {ctx,p}=await abre(1440,900,'claro');
// 1. Configurações › Funil › Tarefas da etapa
// (1/nov/2026: as Tarefas da etapa ficam na Jornada, junto das perguntas, documentos e pré-requisitos)
await vai(p,'/configuracoes/tarefas-da-etapa');
ok(await p.$eval('.cfg-corpo',x=>x.textContent.includes('Jornada')),'o endereço antigo das Tarefas da etapa abre a Jornada');
await clica(p,'[data-a=jn-etapa][data-v=estudos]');await p.waitForTimeout(150);
ok(await p.$eval('.jn-corpo',x=>x.textContent.includes('Modelo Estudos preliminares')),'a Jornada lista a tarefa da etapa de exemplo');
await clica(p,'[data-a=jn-etapa][data-v=negociacao]');await p.waitForTimeout(150);
ok(await p.$eval('.jn-corpo',x=>x.textContent.includes('Cobrar retorno da proposta')),'e a tarefa só da Negociação');
await clica(p,'[data-a=jn-tar][data-e=negociacao][data-s=""]');await p.waitForTimeout(150);
await muda(p,'[data-etr=tipo][value=tarefa]',true);await p.waitForTimeout(100);
await p.fill('#etr-t','Conferir a matrícula atualizada');await muda(p,'#etr-t','Conferir a matrícula atualizada');await muda(p,'#etr-p','3');await muda(p,'[data-etr=trava]',true);
await p.screenshot({path:O+'2_regra_nova.png'});
// condição da regra pelo painel "Vale quando" (o mesmo do cartão) e volta para a regra
await clica(p,'#modal [data-a=et-cond][data-v=regra]');await p.waitForTimeout(150);
ok(await p.$eval('#modal h2',x=>x.textContent.includes('Vale quando'))&&await p.$eval('#modal .muted',x=>x.textContent.includes('Regra')),'"+ Condição" abre o painel Vale quando para a regra');
await clica(p,'#modal [data-a=it-c-cancela]');await p.waitForTimeout(150);
ok(await p.$eval('#modal h2',x=>x.textContent.includes('Nova regra'))&&await p.$eval('#etr-t',x=>x.value==='Conferir a matrícula atualizada'),'Cancelar volta para a regra com o que foi digitado');
await clica(p,'#modal [data-a=et-regra-salva]');await p.waitForTimeout(150);
let R=await X(p,()=>cfg().regrasEtapa.find(r=>r.titulo==='Conferir a matrícula atualizada'));
ok(R&&R.etapa==='negociacao'&&!R.sub&&R.trava&&R.prazo===3&&R.resp==='@terreno','regra salva: etapa Negociação, trava, prazo 3, responsável do terreno');
await p.screenshot({path:O+'1_config.png',fullPage:false});
// as perguntas da jornada de exemplo (Estudos) ficam fora deste roteiro, que é das tarefas (tjornada.js cobre a jornada)
await X(p,()=>{cfg().jornada=[];cfg().jornadaRegras=[];save()});
// 2. o terreno de exemplo em Estudos recebeu as tarefas do modelo
let E=await X(p,()=>{const t=S.terrenos.find(x=>x.neg?.etapa==='estudos'&&x.neg.status==='ativo');return {id:t.id,cod:t.codigo,resp:t.resp,ks:t.tarefas.filter(k=>k.regra==='re-estudos').map(k=>({tit:k.titulo,etapa:k.etapa,fase:k.fase,prazo:k.prazo,preds:(k.preds||[]).length}))}});
ok(E.ks.some(k=>k.tit==='Estudo de massa')&&E.ks.some(k=>k.tit==='Estudo de viabilidade'&&k.preds===1)&&E.ks.every(k=>k.etapa==='estudos'&&k.fase==='novos_negocios'),'entrar em Estudos aplicou o modelo da regra, com as predecessoras e a etapa');
const permuta=await X(p,id=>/permuta/.test(itVal(T(id),'calculado.forma_pagamento_vigente')||''),E.id);
ok(E.ks.some(k=>k.tit==='Minuta de permuta')===permuta,'tarefa do modelo com condição só nasce quando ela vale (forma de pagamento vigente '+(permuta?'com':'sem')+' permuta)');
// 3. entrar em Negociação cria a tarefa da regra nova, com prazo da entrada e o responsável do terreno
await X(p,id=>{const t=T(id);tentar(t,'etapa','negociacao')},E.id);await p.waitForTimeout(150);
let K=await X(p,id=>{const t=T(id),k=t.tarefas.find(x=>x.titulo==='Conferir a matrícula atualizada');return k&&{id:k.id,prazo:k.prazo,resp:k.resp,etapa:k.etapa,cod:k.codigo,hoje:HOJE,tresp:t.resp,trava:etTrava(t,k)}},E.id);
ok(K&&K.etapa==='negociacao'&&K.resp===K.tresp&&K.prazo===await X(p,()=>crSomar(HOJE,3)),'a tarefa nasce na entrada, com prazo de 3 dias e o responsável do terreno');
ok(K?.trava?.trava&&K.trava.nivel==='etapa','e trava a saída da etapa');
// 4. analista: Avançar mostra a tarefa na lista do que falta; gestor: passa com justificativa
await papel(p,'Analista');await ficha(p,E.id);await p.waitForTimeout(400);
await clica(p,'[data-a=adv-ir]');await p.waitForTimeout(200);
ok(await X(p,()=>UI.modal)==='adv-bloq'&&await p.$eval('#modal',(x,c)=>x.textContent.includes(c),K.cod),'analista: Avançar abre a lista do que falta, com a tarefa');
await p.screenshot({path:O+'3_trava_analista.png'});
await clica(p,'#modal [data-a=close]');await papel(p,'Gestor');await p.waitForTimeout(200);await clica(p,'[data-a=adv-ir]');await p.waitForTimeout(200);
ok(await X(p,()=>UI.modal)==='forcar','gestor: Avançar pede a justificativa para passar sem a tarefa');
await p.screenshot({path:O+'4_trava_gestor.png'});
await clica(p,'#modal [data-a=close]');await p.waitForTimeout(100);
// 5. concluir a última tarefa que trava avisa o responsável do terreno; nunca avança sozinho
await papel(p,'Diretor');await X(p,([id,kid])=>{const t=T(id);tkConcluir(t,t.tarefas.find(k=>k.id===kid),true)},[E.id,K.id]);await p.waitForTimeout(100);
let N=await X(p,id=>S.notifs.filter(n=>n.tipo==='pode_avancar'&&n.tid===id).map(n=>({para:n.para,txt:n.txt})),E.id);
ok(N.length===1&&N[0].para===E.resp&&N[0].txt.includes('pode avançar')&&N[0].txt.includes(E.cod),'"TER-x pode avançar" vai para o responsável do terreno');
ok(await X(p,id=>T(id).neg.etapa,E.id)==='negociacao','o terreno não avança sozinho');
// 6. subetapa com regra que trava: sair dela para frente trava; o cartão mostra a etapa e o selo
await X(p,id=>tentar(T(id),'subetapa','proposta_enviada'),E.id);await p.waitForTimeout(100);
let C=await X(p,id=>{const t=T(id),k=t.tarefas.find(x=>x.regra==='re-proposta');return k&&{id:k.id,cod:k.codigo,sub:k.sub,prazo:k.prazo,trava:etTrava(t,k)}},E.id);
ok(C&&C.sub==='proposta_enviada'&&C.trava.nivel==='subetapa','entrar na subetapa cria a tarefa da regra da subetapa');
await papel(p,'Analista');let r=await X(p,id=>moverPara(T(id),'subetapa','contra_proposta'),E.id);
ok(r.bloq&&r.pend.some(x=>x.txt.includes(C.cod)),'analista não sai da subetapa com a tarefa aberta');
r=await X(p,id=>pendencias(T(id),'subetapa','aguardando_reuniao').filter(x=>x.tipo==='tarefa').length,E.id);ok(r===0,'voltar de subetapa não trava');
await ficha(p,E.id,'tarefas');await p.waitForTimeout(300);await p.evaluate(([id,kid])=>{const a=document.createElement('button');a.dataset.a='tk-abrir';a.dataset.id=id;a.dataset.tk=kid;document.body.appendChild(a);a.click();a.remove()},[E.id,C.id]);await p.waitForTimeout(250);
ok(await p.$eval('#modal',x=>x.textContent.includes('Etapa do funil')&&x.textContent.includes('Trava a subetapa')),'o cartão mostra a etapa do funil e o selo da trava');
await p.screenshot({path:O+'5_cartao.png'});
await clica(p,'#modal [data-a=close]');await papel(p,'Diretor');await p.waitForTimeout(100);
// 7. tarefa à mão nasce na etapa atual; "Nenhuma" tira; trava por regra da etapa
let M=await X(p,id=>{const t=T(id),k=tkCriar(t,{titulo:'Visitar o terreno',resp:'Rafael Souza'});k.coments.push({id:uid(),autor:'Rafael Souza',texto:'Marquei com o caseiro.',em:HOJE+' 09:00',reacoes:{}});
  const n=tkCriar(t,{titulo:'Ligar para o corretor',resp:'Rafael Souza'});return {id:k.id,etapa:k.etapa,trava:etTrava(t,k).trava,nid:n.id}},E.id);
ok(M.etapa==='negociacao'&&M.trava,'tarefa à mão nasce na etapa atual e trava, porque a etapa tem regra que trava');
// 8. voltar de etapa: sem trabalho arquiva sozinha; com trabalho fica "Etapa deixada" e avisa o responsável
await X(p,id=>{const t=T(id);UI.alvo=id;UI.alvoEtapa='estudos';funilSubmit('retornar',{motivo:'Vendedor pediu novo estudo'},t)},E.id);await p.waitForTimeout(150);
let V=await X(p,([id,kid,nid,cid])=>{const t=T(id),g=x=>t.tarefas.find(k=>k.id===x);return {m:g(kid).etSit,marq:!!g(kid).arq,n:g(nid).etSit,narq:!!g(nid).arq,c:g(cid).etSit,carq:!!g(cid).arq,cod:g(cid).codigo,
  notif:S.notifs.filter(x=>x.tipo==='etapa_deixada'&&x.tid===id).map(x=>x.para),trava:etTrava(t,g(kid)).trava}},[E.id,M.id,M.nid,C.id]);
ok(V.n==='arqAuto'&&V.narq&&V.c==='arqAuto'&&V.carq,'voltar arquiva sozinhas as tarefas sem trabalho das etapas que ficaram à frente');
ok(V.m==='deixada'&&!V.marq&&!V.trava,'a tarefa com trabalho fica com "Etapa deixada" e não trava');
ok(V.notif.includes('Rafael Souza'),'o responsável da tarefa deixada é avisado');
// 9. reentrar: as arquivadas sozinhas voltam com o mesmo código e o prazo refeito, sem duplicar
await X(p,id=>{const t=T(id);executar(t,'etapa','negociacao',{});executar(t,'subetapa','proposta_enviada',{})},E.id);await p.waitForTimeout(100);
V=await X(p,([id,kid,cid])=>{const t=T(id),c=t.tarefas.find(k=>k.id===cid);return {n:t.tarefas.filter(k=>k.regra==='re-proposta').length,cod:c.codigo,arq:!!c.arq,prazo:c.prazo,esp:crSomar(HOJE,5),m:t.tarefas.find(k=>k.id===kid).etSit,
  conf:t.tarefas.filter(k=>k.titulo==='Conferir a matrícula atualizada').map(k=>!!k.feita)}},[E.id,M.id,C.id]);
ok(V.n===1&&!V.arq&&V.cod===C.cod&&V.prazo===V.esp,'reentrar devolve a arquivada sozinha, mesmo código, prazo refeito e sem duplicar');
ok(V.m==null,'a deixada volta a valer');ok(V.conf.length===1&&V.conf[0],'a concluída continua concluída e não nasce de novo');
// 10. Stand By pausa as tarefas abertas da fase; retomar as devolve
await ficha(p,E.id);await p.waitForTimeout(300);await X(p,()=>{UI.modal='suspender';renderModal()});await p.waitForTimeout(150);
ok(await p.$eval('#modal',x=>x.textContent.includes('ficam pausadas')),'o formulário de Stand By avisa que as tarefas ficam pausadas');
await p.screenshot({path:O+'6_standby.png'});
await p.fill('#sp-t','Vendedor viajou');await p.evaluate(()=>document.querySelector('#f-s').requestSubmit());await p.waitForTimeout(200);
let Z=await X(p,id=>{const t=T(id),ab=etAbertasFase(t,faseEnt());return {st:t.neg.status,n:ab.length,pz:ab.filter(k=>pzAtiva(k)?.origem==='stand_by').length,lista:ab.every(k=>tkLista(t,k).tipo==='pausa')}},E.id);
ok(Z.st==='stand_by'&&Z.n>0&&Z.pz===Z.n&&Z.lista,'Stand By pausou todas as abertas da fase, sem pedido, na lista de pausa');
r=await X(p,([id,kid])=>{const t=T(id),k=t.tarefas.find(x=>x.id===kid);pzRetomar(t,k);return !!pzAtiva(k)},[E.id,C.id]);
ok(r&&(await toast(p)).includes('Stand By'),'a pausa do Stand By não se retoma pelo cartão');
await X(p,id=>{const t=T(id),k=t.tarefas.find(x=>x.regra==='re-proposta');pzAtiva(k).ini=addD(HOJE,-4)+'T09:00:00';retomar(t)},E.id);await p.waitForTimeout(100);
Z=await X(p,id=>{const t=T(id),ab=etAbertasFase(t,faseEnt()),k=t.tarefas.find(x=>x.regra==='re-proposta');return {st:t.neg.status,pz:ab.filter(k=>pzAtiva(k)).length,prazo:k.prazo,esp:crSomar(crSomar(HOJE,5),4),lista:tkLista(t,k).tipo}},E.id);
ok(Z.st==='ativo'&&Z.pz===0&&Z.lista==='aberta','retomar a fase devolve as tarefas');ok(Z.prazo===Z.esp,'e o prazo anda os dias parados');
// 11. Perdido: o formulário pergunta; Manter deixa abertas
await X(p,()=>{UI.modal='perder';renderModal()});await p.waitForTimeout(150);
ok(await p.$$eval('#modal [name=tarefas]',xs=>xs.length===2&&xs.find(x=>x.value==='arquivar').checked),'Perdido pergunta: Arquivar (padrão) ou Manter abertas');
await p.screenshot({path:O+'7_perdido.png'});
await p.selectOption('#mo-m','sem_retorno');await p.fill('#pd-d','Sem resposta há 30 dias');await muda(p,'#modal [name=tarefas][value=manter]',true);await p.evaluate(()=>document.querySelector('#f-p').requestSubmit());await p.waitForTimeout(200);
Z=await X(p,id=>{const t=T(id);return {st:t.neg.status,ab:t.tarefas.filter(k=>k.etProc===t.neg.codigo&&tkAberta(k)).length}},E.id);
ok(Z.st==='perdido'&&Z.ab>0,'Perdido com "Manter abertas" não arquiva');
// Descartado (padrão arquivar) noutro terreno com tarefas
let D=await X(p,()=>{const t=S.terrenos.find(x=>x.neg?.status==='ativo'&&x.neg.etapa==='negociacao'&&!dividida(x));const k=tkCriar(t,{titulo:'Pedir certidões'});const ab=t.tarefas.filter(x=>x.etProc===t.neg.codigo&&tkAberta(x)).length;
  moverPara(t,'status','descartado',{dados:{motivo:'tecnica',detalhe:'',tarefas:'arquivar'}});return {st:t.neg.status,antes:ab,ab:t.tarefas.filter(x=>x.etProc===t.neg.codigo&&tkAberta(x)).length,arq:!!k.arq}});
ok(D.st==='descartado'&&D.antes>0&&D.ab===0&&D.arq,'Descartado arquiva as tarefas abertas da fase (padrão)');
// 12. condição que deixa de valer: "Não se aplica mais", não trava
let Q=await X(p,()=>{const t=S.terrenos.find(x=>x.neg?.status==='ativo'&&x.neg.etapa==='triagem');const f=faseEnt();t.prioridade='alta';
  cfg().regrasEtapa.push({id:'re-teste',fase:f,etapa:'triagem',sub:null,modelo:null,titulo:'Visita prioritária',prazo:2,lista:'Fazer',prio:'alta',resp:'@terreno',cond:{modo:'todas',itens:[{campo:'terreno.prioridade',op:'em',valores:['alta','estrategica']}]},trava:true,ativo:true});
  etEntrar(t,f,t.neg,'etapa','triagem');const k=t.tarefas.find(x=>x.regra==='re-teste');const a=etTrava(t,k),p1=pendencias(t,'etapa','estudos').filter(x=>x.tarefa===k.id).length;
  t.prioridade='baixa';const b=etTrava(t,k),p2=pendencias(t,'etapa','estudos').filter(x=>x.tarefa===k.id).length;return {a,b,p1,p2,id:t.id,kid:k.id}});
ok(Q.a.trava&&Q.p1===1,'com a condição valendo, a tarefa trava');ok(Q.b.sit==='nao_se_aplica'&&!Q.b.trava&&Q.p2===0,'a condição deixou de valer: "Não se aplica mais" e não trava');
await ficha(p,Q.id,'tarefas');await p.waitForTimeout(300);await X(p,()=>{UI.tl.agrF='status'});
ok(await p.$eval('#bl-tarefas',x=>x.textContent.includes('Visita prioritária')),'a tarefa continua no quadro');
// 13. condição no checklist de documentos e no pré-requisito
let K2=await X(p,()=>{const t=S.terrenos.find(x=>x.neg?.status==='ativo'&&x.neg.etapa==='contrato');const it=cfg().checklist.contrato.find(c=>c.doc==='matricula');
  const n0=pendencias(t,'status','comprado').filter(x=>x.txt.startsWith(TIPOS_DOC.matricula[0])).length;it.cond={modo:'todas',itens:[{campo:'terreno.prioridade',op:'em',valores:['estrategica']}]};
  const pr=t.prioridade;t.prioridade='media';const n1=pendencias(t,'status','comprado').filter(x=>x.txt.startsWith(TIPOS_DOC.matricula[0])).length;t.prioridade=pr;save();return {n0,n1,ok0:pendencias(t,'status','comprado').find(x=>x.txt.startsWith(TIPOS_DOC.matricula[0]))?.ok}});
ok(K2.n1===0&&(K2.n0===1||K2.ok0!==false),'documento do checklist com condição que não vale sai das pendências');
let PR=await X(p,()=>{const t=S.terrenos.find(x=>x.neg?.status==='ativo'&&x.neg.etapa==='estudos'&&x.neg.sub!=='estudo_viabilidade'&&!x.neg.trilha?.some(y=>y.paraSub==='estudo_viabilidade'))||S.terrenos.find(x=>x.neg?.status==='ativo'&&x.neg.etapa==='triagem');
  const p1=cfg().prereq.find(x=>x.id==='pr1'),a=pendencias(t,'etapa','negociacao').filter(x=>x.txt.includes('Estudo de Viabilidade')).length;p1.cond={modo:'todas',itens:[{campo:'terreno.prioridade',op:'em',valores:['estrategica']}]};
  const pr=t.prioridade;t.prioridade='baixa';const b=pendencias(t,'etapa','negociacao').filter(x=>x.txt.includes('Estudo de Viabilidade')).length;t.prioridade=pr;save();return {a,b}});
ok(PR.a===1&&PR.b===0,'pré-requisito com condição que não vale não é exigido');
await vai(p,'/configuracoes/checklist');await clica(p,'[data-a=jn-etapa][data-v=contrato]');await p.waitForTimeout(150);
ok(await p.$eval('.jn-corpo',x=>x.textContent.includes('vale quando')),'a Jornada mostra a condição do documento');
await clica(p,'[data-a=et-cond][data-v="ck:contrato:onus"]');await p.waitForTimeout(150);
ok(await p.$eval('#modal .muted',x=>x.textContent.includes('Checklist de Contrato')),'"+ Condição" do documento abre o mesmo painel');
await p.screenshot({path:O+'8_checklist_cond.png'});
await clica(p,'#modal [data-a=it-c-cancela]');await p.waitForTimeout(150);
await vai(p,'/configuracoes/pre-requisitos');await clica(p,'[data-a=jn-etapa][data-v=negociacao]');await p.waitForTimeout(150);
ok(await p.$eval('.jn-corpo',x=>x.textContent.includes('Ter passado por')&&x.textContent.includes('vale quando')),'os pré-requisitos ficam na Jornada, com a condição');
await p.screenshot({path:O+'9_prereq_cond.png'});
// 14. gatilho "Terreno entrou na etapa"
let G=await X(p,()=>{const t=S.terrenos.find(x=>x.neg?.status==='ativo'&&x.neg.etapa==='triagem');const f=faseEnt();
  auRegras().push({id:'au-et',nome:'Entrou em Estudos sobe a prioridade',tid:null,gat:'etapa',gEtapa:f+':estudos',gLista:'',gEtq:'',gCampo:'',gDias:null,conds:[],acoes:[{tipo:'prioridade',v:'alta'}],ativa:true,dono:'Moisés',em:agora()});
  const k=tkCriar(t,{titulo:'Separar a documentação',prio:'baixa'});executar(t,'etapa','estudos',{});return {prio:k.prio,etapa:k.etapa,ex:auExecs().filter(e=>e.aid==='au-et').length,frase:auQuando(auRegras().find(r=>r.id==='au-et'))}});
ok(G.ex>=1&&G.frase.includes('Estudos Preliminares'),'"Terreno entrou na etapa" roda nos cartões abertos da etapa');
// 15. Lista agrupada por etapa e filtro Etapa na página Tarefas
await vai(p,'/tarefas/lista');await muda(p,'#tl-agr','etapa');await p.waitForTimeout(200);
ok(await p.$$eval('.tl-gn',xs=>xs.some(x=>x.textContent.includes('Novos Negócios ›'))),'a Lista agrupa por etapa');
ok(!!await p.$('#tk-etapa'),'filtro Etapa na página Tarefas');
await p.screenshot({path:O+'10_lista_etapa.png'});
const opt=await p.$$eval('#tk-etapa option',xs=>xs.map(x=>x.value).find(v=>v.endsWith('|estudos')));await muda(p,'#tk-etapa',opt);await p.waitForTimeout(200);
ok(await p.$$eval('.tl-gn',xs=>xs.length===1&&xs[0].textContent.includes('Estudos')),'o filtro Etapa deixa só a etapa escolhida');
// 16. fase depois da entrada: a trava vale também
let W=await X(p,()=>{const t=S.terrenos.find(x=>procAberto(x,'aprovacao')?.status==='ativo');if(!t)return null;const pp=procAberto(t,'aprovacao');
  cfg().regrasEtapa.push({id:'re-apr',fase:'aprovacao',etapa:pp.etapa,sub:null,modelo:null,titulo:'Protocolar o projeto',prazo:10,lista:'Fazer',prio:'media',resp:'@terreno',cond:null,trava:true,ativo:true});
  etEntrar(t,'aprovacao',pp,'etapa',pp.etapa);UI.role='Analista';const es=etapasF('aprovacao'),i=es.findIndex(e=>e.k===pp.etapa);const r=es[i+1]?procIr(t,pp,'etapa',es[i+1].k):procIr(t,pp,'status','concluido',{relato:'x'});
  return {r,etapa:pp.etapa,de:es[i].k,modal:UI.modal,id:t.id}});
await p.waitForTimeout(100);
ok(W&&W.r===false&&W.etapa===W.de&&(await X(p,()=>UI.modal))==='et-bloq','Aprovação de Projetos: analista não avança com a tarefa que trava');
await p.screenshot({path:O+'11_fase_trava.png'});
ok(!erros.length,'sem erro de JavaScript '+erros.join(' | '));
await ctx.close()}
// celular e escuro: a regra e o cartão
{const {ctx,p}=await abre(390,844,'escuro');await vai(p,'/configuracoes/tarefas-da-etapa');await p.screenshot({path:O+'12_config_celular_escuro.png',fullPage:false});
  await clica(p,'[data-a=jn-etapa][data-v=negociacao]');await p.waitForTimeout(150);await clica(p,'[data-a=et-regra-ed][data-v=re-proposta]');await p.waitForTimeout(200);ok(await p.$eval('#etr-t',x=>x.value==='Cobrar retorno da proposta'),'celular: editar a regra');
  await p.screenshot({path:O+'13_regra_celular_escuro.png'});
  ok(await p.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'celular: sem rolagem lateral');
  ok(!erros.length,'celular: sem erro de JavaScript '+erros.join(' | '));await ctx.close()}
await b.close();console.log(falhas.length?`FALHAS: ${falhas.length}`:'TUDO OK');process.exit(falhas.length?1:0)})();
