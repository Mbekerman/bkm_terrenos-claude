/* =====================================================================
   Funil da negociação: etapas, subetapas, status, pré-requisitos,
   aprovações por hierarquia, notificações e Configurações › Funil.
   Espelha as RPCs do banco (app._passagem, app.decidir_aprovacao,
   app.encerrar_processo, app.retomar_processo, app.rotina_diaria).
   Injetado no mesmo escopo do protótipo.
   ===================================================================== */

/* ---------- equipe e hierarquia (no banco: membros.papel, superior_id, administrador) ---------- */
const NIVEL={diretor:3,gestor:2,analista:1,leitura:0};
const PAPEL_N={diretor:'Diretor',gestor:'Gestor',analista:'Analista',leitura:'Leitura'};
const NIV_N={2:'gestor',3:'diretor'};
const membro=n=>(S.membros||[]).find(m=>m.nome===n)||{nome:n,papel:'leitura',sup:null,admin:false};
const nivelDe=n=>NIVEL[membro(n).papel]||0;
const ehAdmin=n=>!!membro(n).admin;
const ehSuperior=(chefe,m)=>{let x=membro(m).sup,i=0;while(x&&i++<10){if(x===chefe)return true;x=membro(x).sup}return false};
/* aprovador previsto: quem, subindo a hierarquia de quem pediu, tem o papel do nível */
const aprovadorPrevisto=(quem,nv)=>{let x=membro(quem).sup,i=0;while(x&&i++<10){if(nivelDe(x)===nv)return x;x=membro(x).sup}return null};

/* ---------- configuração ---------- */
const subCfg=k=>cfg().subs.find(s=>s.k===k);
const destinoCfg=(tipo,k)=>tipo==='etapa'?etapaCfg(k):tipo==='subetapa'?subCfg(k):cfg().status[k];
const destinoNome=(tipo,k)=>tipo==='etapa'?SN(k):tipo==='subetapa'?subN(k):STATUS_N[k]||k;
function syncCfg(){STAGES.splice(0,STAGES.length,...cfg().etapas.map(e=>[e.k,e.nome]))}
/* dados carregados ou restaurados: garante configuração, equipe e avisos dos pedidos de exemplo */
function prepararDados(){if(!S.cfg)S.cfg=CFG_PADRAO();if(!S.cfg.fases)S.cfg.fases=FASES_PADRAO();if(!S.cfg.deps)S.cfg.deps=DEPS_PADRAO();if(!S.membros)S.membros=MEMBROS_PADRAO();if(!S.notifs)S.notifs=[];syncCfg();partesPreparar();
  if(!S.pedidosAvisados){S.terrenos.forEach(t=>{if(t.neg?.pedido)avisarAprovadores(t)});S.pedidosAvisados=true}}

/* ---------- regras da passagem ---------- */
const passouPor=(n,sub)=>n.sub===sub||(n.trilha||[]).some(x=>x.paraSub===sub||x.deSub===sub);
const diasSub=n=>n.subDesde?diff(n.subDesde,HOJE):null;
const subAtrasada=n=>{const c=subCfg(n.sub);return !!(n.status==='ativo'&&c&&c.prazo&&diasSub(n)>c.prazo)};
const etapaAtrasada=n=>{const c=etapaCfg(n.etapa);return !!(n.status==='ativo'&&c&&c.sla&&diff(n.desde,HOJE)>c.sla)};
/* pendências para chegar ao destino: pré-requisitos configurados; ao sair de uma etapa, o checklist dela; na compra, diligência impeditiva */
function pendencias(t,tipo,dest){const n=t.neg,L=[];
  cfg().prereq.filter(p=>p.alvoTipo===tipo&&p.alvo===dest).forEach(p=>{const ok=passouPor(n,p.req);
    L.push({ok,txt:ok?`Passou por ${subN(p.req)}`:`Passar antes por ${subN(p.req)} (${SN(subCfg(p.req)?.etapa)})`,fix:null})});
  const saindo=((tipo==='etapa'&&SIDX(dest)>SIDX(n.etapa))||(tipo==='status'&&dest==='comprado'))&&!(!t._parte&&dividida(t));
  if(saindo){(cfg().checklist[n.etapa]||[]).filter(c=>c.obrig).forEach(({doc})=>{const st=docSt(t.docs.find(d=>d.tipo===doc));
      L.push({ok:st==='validado',txt:TIPOS_DOC[doc][0]+(st==='validado'?' validado':st==='pendente'?': não enviado':st==='recebido'?': aguardando validação':': '+st),fix:st==='validado'?null:['tab:documentos','Ver documentos']})})}
  if(tipo==='status'&&dest==='comprado'&&!t._parte)t.dilig.filter(d=>d.sit==='impeditiva').forEach(d=>L.push({ok:false,txt:'Diligência impeditiva: '+d.titulo,fix:['tab:documentos','Ver diligências']}));
  return L.concat(pendPartes(t,tipo,dest))}
/* aprovações exigidas, menos os níveis que quem move já tem */
function aprovExig(tipo,dest,ator){const c=destinoCfg(tipo,dest)||{},nv=[];if(c.g)nv.push(2);if(c.d)nv.push(3);
  const q=nivelDe(ator);return {niveis:nv.filter(x=>x>q),modo:c.modo||'sequencia'}}
const proxDestino=n=>{const i=SIDX(n.etapa);return STAGES[i+1]?['etapa',STAGES[i+1][0]]:['status','comprado']};
/* quadro de avanço: próximo destino, pendências e aprovações (mesmo formato usado nas Ações do painel) */
function checkAdv(t){const n=t.neg;if(!n||n.status!=='ativo')return null;
  const [tipo,dest]=proxDestino(n),items=pendencias(t,tipo,dest),b=items.filter(x=>!x.ok);
  return {next:[dest,destinoNome(tipo,dest)],tipo,dest,items,ok:!b.length,forcar:!!b.length&&!b.some(x=>x.trava)&&nivelDe(me())>=2,aprov:aprovExig(tipo,dest,me()),compra:tipo==='status'}}
const naVez=p=>{const pend=p.niveis.filter(r=>r.status==='pendente');if(!pend.length)return [];const o=Math.min(...pend.map(r=>r.ordem));return pend.filter(r=>r.ordem===o)};
const podeDecidir=(r,u)=>nivelDe(u)>=r.nivel&&(!r.previsto||r.previsto===u||ehSuperior(u,r.previsto));
const possoDecidir=t=>{const p=t.neg?.pedido;return !!p&&naVez(p).some(r=>podeDecidir(r,me()))};
const quemFalta=p=>naVez(p).map(r=>r.previsto?`${r.previsto} (${NIV_N[r.nivel]})`:`um ${NIV_N[r.nivel]}`).join(' e ');

/* mesmo caminho de app._passagem: pendências travam (gestor ou diretor força com justificativa); aprovações viram pedido; sem pedido, executa */
function moverPara(t,tipo,dest,o={}){const n=t.neg,eu=me(),mp=movePartes(t,tipo,dest);
  if(mp)return {erro:mp};
  if(n.pedido)return {erro:`Há um pedido de aprovação aberto para ${destinoNome(n.pedido.tipo,n.pedido.dest)}. Decida ou cancele antes.`};
  const pend=pendencias(t,tipo,dest).filter(x=>!x.ok);
  if(pend.some(x=>x.trava))return {bloq:true,pend,podeForcar:false};
  if(pend.length&&!o.forcar)return {bloq:true,pend,podeForcar:nivelDe(eu)>=2};
  const dados={...(o.dados||{}),forcado:pend.length?o.just:null};
  const ap=aprovExig(tipo,dest,eu);
  if(ap.niveis.length){
    n.pedido={id:uid(),tipo,dest,modo:ap.modo,por:eu,em:agora(),dados,niveis:ap.niveis.map((nv,i)=>({nivel:nv,ordem:ap.modo==='sequencia'?i+1:1,previsto:aprovadorPrevisto(eu,nv),status:'pendente'}))};
    log(t,`Pedido de aprovação: ${destinoNome(tipo,dest)} (${ap.niveis.map(x=>NIV_N[x]).join(ap.modo==='sequencia'?', depois ':' e ')})${dados.forcado?' · sem requisitos: '+dados.forcado:''}`);
    avisarAprovadores(t);return {pedido:true,msg:`Pedido enviado. Aguardando ${quemFalta(n.pedido)}.`}}
  executar(t,tipo,dest,dados);return {ok:true}}
function executar(t,tipo,dest,d){const n=t.neg,ev={em:agora(),user:me(),deEtapa:n.etapa,deSub:n.sub};n.trilha=n.trilha||[];
  if(tipo==='etapa'){const volta=SIDX(dest)<SIDX(n.etapa);n.etapa=dest;n.sub=subInicial(dest);n.desde=HOJE;n.subDesde=HOJE;ev.ev=volta?'retorno':'avanco';
    log(t,`${volta?'Voltou':'Avançou'} para ${SN(dest)}${n.sub?' · '+subN(n.sub):''}${d.forcado?' sem requisitos: '+d.forcado:''}${volta&&d.motivo?': '+d.motivo:''}`)}
  else if(tipo==='subetapa'){n.sub=dest;n.subDesde=HOJE;ev.ev='subetapa';log(t,`Subetapa: ${subN(dest)}${d.forcado?' sem requisitos: '+d.forcado:''}`)}
  else{n.status=dest;n.encerradoEm=HOJE;ev.ev={comprado:'compra',perdido:'perda',descartado:'descarte',stand_by:'stand_by'}[dest];
    if(dest==='comprado')Object.assign(n,{relato:d.relato,pontos:d.pontos});
    if(dest==='perdido'||dest==='descartado')Object.assign(n,{motivo:d.motivo,detalhe:d.detalhe});
    if(dest==='stand_by')Object.assign(n,{retomar:d.retomar,detalhe:d.detalhe});
    log(t,`Status: ${STATUS_N[dest]}${d.motivo?' · '+motivoN(dest,d.motivo):''}${dest==='stand_by'?' até '+fd(d.retomar):''}${d.forcado?' · sem requisitos: '+d.forcado:''}`)}
  Object.assign(ev,{paraEtapa:n.etapa,paraSub:n.sub,status:n.status});n.trilha.push(ev);
  if(t._parte){sincPrincipal(terrenoDe(t));return}
  if(tipo==='etapa')abrirPartes(t);
  if(tipo==='status'&&['perdido','descartado','stand_by'].includes(dest))encerrarPartes(t,dest,d);
  if(tipo==='status')abrirLiberadas(t)}
function decidir(t,aprovar,coment){const n=t.neg,p=n.pedido,eu=me();if(!p)return null;
  if(!naVez(p).some(r=>podeDecidir(r,eu)))return {erro:`Este pedido aguarda ${quemFalta(p)}.`};
  if(!aprovar){p.niveis.forEach(r=>{if(r.status==='pendente')r.status='cancelado'});n.pedido=null;
    log(t,`Pedido recusado: ${destinoNome(p.tipo,p.dest)} · ${coment}`);notificar(p.por,'aprovacao_decidida',`${eu} recusou ${destinoNome(p.tipo,p.dest)}: ${coment}`,t);return {ok:true,msg:'Pedido recusado.'}}
  /* quem está acima aprova também os níveis seguintes que alcança (diretor que aprova pelo gestor cobre os dois) */
  let mud=true;while(mud){mud=false;naVez(p).forEach(r=>{if(podeDecidir(r,eu)){Object.assign(r,{status:'aprovado',por:eu,em:agora(),coment});mud=true}})}
  if(p.niveis.every(r=>r.status==='aprovado')){n.pedido=null;log(t,`Aprovado: ${destinoNome(p.tipo,p.dest)}${coment?' · '+coment:''}`);
    executar(t,p.tipo,p.dest,p.dados);notificar(p.por,'aprovacao_decidida',`${eu} aprovou ${destinoNome(p.tipo,p.dest)}`,t);return {ok:true,msg:`Aprovado: ${destinoNome(p.tipo,p.dest)}.`}}
  log(t,`Aprovação de ${eu} registrada; falta ${quemFalta(p)}`);avisarAprovadores(t);return {ok:true,msg:`Aprovação registrada. Falta ${quemFalta(p)}.`}}
function cancelarPedido(t){const p=t.neg.pedido;if(!p)return;p.niveis.forEach(r=>{if(r.status==='pendente')r.status='cancelado'});t.neg.pedido=null;log(t,`Pedido de aprovação cancelado: ${destinoNome(p.tipo,p.dest)}`)}
/* retomar: o tempo parado não conta no prazo da etapa nem da subetapa */
function retomar(t){const n=t.neg,parado=n.encerradoEm?diff(n.encerradoEm,HOJE):0;
  n.status='ativo';n.desde=addD(n.desde,parado);n.subDesde=n.subDesde?addD(n.subDesde,parado):HOJE;n.retomar=null;n.encerradoEm=null;
  (n.trilha=n.trilha||[]).push({em:agora(),user:me(),ev:'retomada',deEtapa:n.etapa,deSub:n.sub,paraEtapa:n.etapa,paraSub:n.sub,status:'ativo'});log(t,'Negociação retomada');
  if(!t._parte)retomarPartes(t)}
/* kanban: para frente passa por cada etapa (só a última pode esperar aprovação); falhou uma, nada muda */
function levarAte(t,alvo,o={}){const snap=JSON.stringify(t.neg),h=t.hist.length,nt=S.notifs.length;
  const desfaz=()=>{t.neg=JSON.parse(snap);t.hist.length=h;S.notifs.splice(0,S.notifs.length-nt)};
  while(SIDX(t.neg.etapa)<SIDX(alvo)){const prox=STAGES[SIDX(t.neg.etapa)+1][0],ult=prox===alvo;
    if(!ult&&aprovExig('etapa',prox,me()).niveis.length){desfaz();return {erro:`${SN(prox)} pede aprovação. Leve uma etapa por vez.`}}
    const r=moverPara(t,'etapa',prox,o);
    if(r.bloq||r.erro){desfaz();return {...r,etapa:prox}}
    if(r.pedido)return r}
  return {ok:true}}

/* ---------- notificações (no banco: notificacoes, lembretes, rotina_diaria) ---------- */
function notificar(para,tipo,txt,t,chave){const c=cfg().notif[tipo];if(!para||!c||!c.ativo)return;
  if(!chave&&para===me())return;
  const k=chave?`${tipo}|${chave}|${para}`:null;if(k&&S.notifs.some(x=>x.chave===k))return;
  S.notifs.unshift({id:uid(),para,tipo,txt,tid:t?t.id:null,em:agora(),lida:false,chave:k,autor:chave?null:me()})}
function avisarAprovadores(t){const p=t.neg.pedido;if(!p)return;
  naVez(p).forEach(r=>{const dest=r.previsto?[r.previsto]:S.membros.filter(m=>NIVEL[m.papel]===r.nivel).map(m=>m.nome);
    dest.forEach(u=>notificar(u,'aprovacao_pendente',`${p.por} pede aprovação para ${destinoNome(p.tipo,p.dest)}`,t,p.id+':'+r.nivel))})}
const quando=d=>{const x=diff(HOJE,d);return x===0?'hoje':x===1?'amanhã':x>1?`em ${x} dias`:`há ${-x} dia${x<-1?'s':''}`};
/* rotina diária: prazos de tarefa, tarefa atrasada, subetapa estourada, retomada de stand by, documento vencendo, reunião */
function rotinaNotif(){const N=cfg().notif,dentro=(data,tipo)=>(N[tipo].dias||[]).filter(d=>data>=HOJE&&diff(HOJE,data)<=d);
  S.terrenos.forEach(t=>{
    abertas(t).forEach(k=>{if(k.prazo<HOJE)notificar(k.resp,'tarefa_atrasada',`Tarefa atrasada: ${k.titulo} (venceu ${fd(k.prazo)})`,t,k.id+':'+k.prazo);
      else dentro(k.prazo,'tarefa_prazo').forEach(d=>notificar(k.resp,'tarefa_prazo',`Tarefa vence ${quando(k.prazo)}: ${k.titulo}`,t,k.id+':'+k.prazo+':'+d))});
    const n=t.neg;if(!n)return;
    if(subAtrasada(n))notificar(t.resp,'subetapa_prazo',`${subN(n.sub)} passou do prazo de ${subCfg(n.sub).prazo} dias`,t,n.codigo+':'+n.sub+':'+n.subDesde);
    if(n.status==='stand_by'&&n.retomar)dentro(n.retomar,'stand_by_retomar').forEach(d=>notificar(t.resp,'stand_by_retomar',`Revisitar o stand by ${quando(n.retomar)}`,t,n.codigo+':'+n.retomar+':'+d));
    if(n.status!=='ativo')return;
    t.docs.forEach(d=>{const v=docVal(d);if(v)dentro(v,'documento_vencendo').forEach(x=>notificar(t.resp,'documento_vencendo',`${TIPOS_DOC[d.tipo][0]} vence ${quando(v)}`,t,d.tipo+':'+v+':'+x))});
    (t.reunioes||[]).filter(r=>r.status==='agendada').forEach(r=>dentro(r.data,'reuniao_agendada').forEach(x=>notificar(t.resp,'reuniao_agendada',`Reunião ${quando(r.data)}${r.hora?' às '+r.hora:''}`,t,r.id+':'+r.data+':'+x)))})}
/* tarefa criada ou editada: avisa o responsável e quem foi marcado */
function notifTarefa(t,k,antes){if(k.resp!==antes?.resp)notificar(k.resp,'tarefa_atribuida',`${me()} atribuiu a você: ${k.titulo}`,t);
  (k.marcados||[]).filter(u=>!(antes?.marcados||[]).includes(u)&&u!==k.resp).forEach(u=>notificar(u,'tarefa_marcado',`${me()} marcou você na tarefa: ${k.titulo}`,t))}
const minhasNotifs=()=>S.notifs.filter(x=>x.para===me());
let sinoAberto=false;
const IC_SINO='<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0"/></svg>';
function renderSino(){const el=document.getElementById('sino');if(!el)return;const L=minhasNotifs(),nl=L.filter(x=>!x.lida).length;
  el.innerHTML=`<button class="sino-btn" data-a="sino" aria-haspopup="true" aria-expanded="${sinoAberto}" aria-label="Notificações${nl?`, ${nl} não lidas`:''}" title="Notificações">${IC_SINO}${nl?`<span class="sino-n">${nl>9?'9+':nl}</span>`:''}</button>`+
  (sinoAberto?`<div class="sino-menu" role="dialog" aria-label="Notificações"><div class="sino-h"><span>Notificações</span>${nl?'<button class="linkbtn" data-a="notif-lidas">Marcar todas como lidas</button>':''}</div>
  <div class="sino-l">${L.slice(0,30).map(x=>{const t=x.tid?T(x.tid):null;return `<button class="sino-i ${x.lida?'':'nova'}" data-a="notif" data-v="${x.id}"><span class="sino-d"></span><span class="sino-c"><span class="sino-t">${esc(x.txt)}</span><span class="sino-s">${t?esc(t.codigo+' · '+t.nome)+' · ':''}${fd(x.em.slice(0,10))}${x.autor?' · '+esc(x.autor):''}</span></span></button>`}).join('')||'<div class="empty" style="padding:24px 16px">Nada por aqui.</div>'}</div>
  ${ehAdmin(me())?'<div class="sino-f"><button class="linkbtn" data-a="nav" data-r="config" data-cfg="notif">Configurar notificações</button></div>':''}</div>`:'')}

/* ---------- desenho: chip, linha do tempo, quadro de avanço ---------- */
function chipNeg(t){
  if(!t.neg)return '<span class="chip">Sem negociação</span>';
  const n=t.neg;
  if(n.status==='perdido')return `<span class="chip crit"><span class="d"></span>Perdido</span>`;
  if(n.status==='descartado')return `<span class="chip"><span class="d"></span>Descartado</span>`;
  if(n.status==='stand_by')return '<span class="chip warn"><span class="d"></span>Stand By</span>';
  if(n.status==='comprado')return '<span class="chip good"><span class="d"></span>Comprado</span>';
  return `<span class="chip fase">${SN(n.etapa)}</span>${n.sub?`<span class="chip sub ${subAtrasada(n)?'warn':''}">${esc(subN(n.sub))}</span>`:''}${n.pedido?'<span class="chip blue">Aguardando aprovação</span>':''}`}
/* entrada de cada etapa: última passagem para ela na trilha */
const entrouEm=(n,e)=>{const x=(n.trilha||[]).filter(v=>v.paraEtapa===e&&v.deEtapa!==e).pop();return x?x.em.slice(0,10):n.etapa===e?n.desde:null};
function linhaEtapas(t){const n=t.neg;if(!n)return '';const idx=SIDX(n.etapa),fim=n.status==='comprado';
  return `<nav class="tl-topo" aria-label="Etapas da negociação"><ol class="stepper">${STAGES.map((s,i)=>{const st=i<idx||fim?'done':i===idx?'cur':'fut',em=i<=idx?entrouEm(n,s[0]):null;
    return `<li class="step ${st}" ${i===idx&&!fim?'aria-current="step"':''}><span class="dot">${st==='done'?ic('check',14):i+1}</span><span class="sl-w"><span class="sl" title="${esc(s[1])}">${esc(s[1])}</span>${em?`<span class="sd">${st==='cur'&&n.sub?esc(subN(n.sub))+' · ':''}${fd(em)}</span>`:''}</span></li>`}).join('')}${fim?`<li class="step done"><span class="dot">${ic('check',14)}</span><span class="sl-w"><span class="sl">Comprado</span><span class="sd">${fd(n.encerradoEm)}</span></span></li>`:''}</ol></nav>`}
/* trilha com datas: tempo em cada etapa e subetapa (no banco: v_periodos_processo, v_tempo_subetapas) */
function trilhaHtml(t){const n=t.neg;if(!n)return '';const ev=(n.trilha||[]).slice().sort((a,b)=>a.em.localeCompare(b.em));
  const per=[];ev.forEach((x,i)=>{const fim=ev[i+1]?ev[i+1].em.slice(0,10):n.status==='ativo'?HOJE:null;if(x.status!=='ativo')return;per.push({e:x.paraEtapa,s:x.paraSub,ini:x.em.slice(0,10),fim,user:x.user,ev:x.ev})});
  const porEtapa=STAGES.map(([k,l])=>{const ps=per.filter(p=>p.e===k);if(!ps.length)return '';const dias=ps.reduce((a,p)=>a+(p.fim?diff(p.ini,p.fim):0),0),c=etapaCfg(k);
    return `<li class="tr-e"><div class="tr-eh"><b>${esc(l)}</b><span class="faint">${fd(ps[0].ini)} · ${dias} d${c?.sla?` de ${c.sla}`:''}</span>${c?.sla&&dias>c.sla?'<span class="chip warn">acima do SLA</span>':''}</div><ul>${ps.map(p=>`<li><span>${esc(subN(p.s)||'—')}</span><span class="faint">${fd(p.ini)}${p.fim?' → '+fd(p.fim):''} · ${p.fim?diff(p.ini,p.fim)+' d':''} · ${esc(p.user||'')}</span></li>`).join('')}</ul></li>`}).join('');
  const enc=n.status!=='ativo'?`<li class="tr-e"><div class="tr-eh"><b>${STATUS_N[n.status]}</b><span class="faint">${fd(n.encerradoEm)}</span></div></li>`:'';
  return `<section class="sec"><div class="sec-h"><h2>Linha do tempo</h2><span class="faint" style="font-size:13px">Tempo em cada etapa e subetapa</span></div><div class="sec-b"><ol class="trilha">${porEtapa}${enc}</ol></div></section>`}
const advMais=n=>`<div class="adv-mais"><button class="btn adv-mb" data-a="adv-mais" aria-haspopup="menu" aria-expanded="false" aria-label="Mais ações" title="Stand By, Perdido ou Descartado"><svg class="ic" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" d="M12 5.5h.01M12 12h.01M12 18.5h.01"/></svg></button><div class="adv-menu" role="menu"><button role="menuitem" data-a="suspender">${ic('pause',18)}Colocar em Stand By</button><button role="menuitem" class="danger" data-a="perder">${ic('block',18)}Marcar como Perdido</button><button role="menuitem" class="danger" data-a="descartar">${ic('close',18)}Descartar</button></div></div>`;
function painelNeg(t){
  const n=t.neg;if(!n)return '';const ro=UI.role==='Leitura';
  if(n.status==='perdido'||n.status==='descartado')return `<section class="sec sec-adv"><div class="banner ${n.status==='perdido'?'crit':''}">${ic('block')}<div><div class="bt">${STATUS_N[n.status]} em ${SN(n.etapa)} · ${esc(motivoN(n.status,n.motivo))}</div><div>${esc(n.detalhe||'')}</div><div class="faint" style="font-size:12px;margin-top:4px">${fd(n.encerradoEm)}</div></div></div></section>`;
  if(n.status==='comprado')return `<section class="sec sec-adv"><div class="banner good">${ic('check')}<div style="min-width:0"><div class="bt">Comprado em ${fd(n.encerradoEm)}</div><div class="relato">${limpaHtml(n.relato||'')}</div>${n.pontos?`<div style="margin-top:6px"><b>Pontos de sucesso:</b> ${esc(n.pontos)}</div>`:''}</div></div></section>`;
  if(n.status==='stand_by')return `<section class="sec sec-adv"><div class="banner warn" style="justify-content:space-between;flex-wrap:wrap"><span style="display:flex;gap:12px">${ic('pause')}<span><b>Stand By em ${SN(n.etapa)} · revisitar em ${fd(n.retomar)}</b>${n.detalhe?`<br><span>${esc(n.detalhe)}</span>`:''}</span></span>${ro?'':'<button class="btn sm" data-a="retomar">Retomar</button>'}</div></section>`;
  const r=checkAdv(t),pend=r.items.filter(x=>!x.ok),subs=subsDe(n.etapa),p=n.pedido;
  if(dividida(t)&&!r.compra)return `<section class="sec sec-adv"><div class="adv adv-c"><div class="adv-sub"><span>Subetapa</span><b>${esc(subN(n.sub))}</b><span class="faint">${diasSub(n)??'—'} d</span></div>
    <div class="adv-l1"><span class="adv-t">Anda pelas partes · ${esc(resumoPartes(t))}</span></div><div class="faint" style="font-size:12px">O terreno fica na etapa da parte mais atrasada.</div>
    ${ro?'':`<div class="adv-l2"><button class="btn" data-a="tab" data-t="negociacao">Ver partes</button>${advMais(n)}</div>`}</div></section>`;
  const subSel=`<label class="adv-sub"><span>Subetapa</span><select data-ch="sub" ${ro||p?'disabled':''} aria-label="Subetapa">${n.sub&&!subs.some(s=>s.k===n.sub)?`<option value="${n.sub}" selected>${esc(subN(n.sub))} (inativa)</option>`:''}${subs.map(s=>`<option value="${s.k}" ${s.k===n.sub?'selected':''}>${esc(s.nome)}</option>`).join('')}</select><span class="faint">${diasSub(n)??'—'} d${subCfg(n.sub)?.prazo?' de '+subCfg(n.sub).prazo:''}</span>${subAtrasada(n)?'<span class="chip warn">prazo estourado</span>':''}</label>`;
  const ped=p?`<div class="adv-ped"><div class="adv-ped-t">${ic('clock',18)}<span><b>Aguardando aprovação</b> para ${esc(destinoNome(p.tipo,p.dest))}</span></div>
    <ol class="adv-niv">${p.niveis.map(x=>`<li class="${x.status}"><span class="nv-d">${x.status==='aprovado'?ic('check',14):''}</span><span>${PAPEL_N[NIV_N[x.nivel]]}${x.previsto?' · '+esc(x.previsto):''}</span><span class="faint">${x.status==='aprovado'?'aprovou'+(x.por&&x.por!==x.previsto?' ('+esc(x.por)+')':''):naVez(p).includes(x)?'na vez':'depois'}</span></li>`).join('')}</ol>
    <div class="faint" style="font-size:12px">Pedido por ${esc(p.por)} em ${fd(p.em.slice(0,10))}${p.modo==='paralelo'&&p.niveis.length>1?' · em paralelo':''}${p.dados?.forcado?' · sem requisitos: '+esc(p.dados.forcado):''}</div>
    ${ro?'':`<div class="adv-ped-a">${possoDecidir(t)?`<button class="btn primary sm" data-a="aprovar">${ic('check',16)}Aprovar</button><button class="btn sm" data-a="recusar">Recusar</button>`:''}${p.por===me()||nivelDe(me())>nivelDe(p.por)?`<button class="btn text sm" data-a="cancelar-pedido">Cancelar pedido</button>`:''}</div>`}</div>`:'';
  const apTxt=r.aprov.niveis.length?`<span class="adv-ap" title="Aprovação exigida">${ic('check',14)}${r.aprov.niveis.map(x=>NIV_N[x]).join(r.aprov.modo==='sequencia'?' → ':' + ')}</span>`:'';
  return `<section class="sec sec-adv"><div class="adv adv-c">${subSel}
  ${ped||`<div class="adv-l1"><span class="adv-t">${r.compra?'Próxima: concluir como Comprado':'Próxima: '+esc(r.next[1])}</span>${apTxt}${r.items.length?`<button class="adv-st ${pend.length?'adv-st-pend':'adv-st-ok'}" data-a="adv-req" aria-expanded="${ADV_REQ}" title="${ADV_REQ?'Ocultar':'Ver'} requisitos">${pend.length?ic('warn',16)+pend.length+(pend.length>1?' pendências':' pendência'):ic('check',16)+'Requisitos ok'}<svg class="adv-ch" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></button>`:''}</div>
  ${ADV_REQ&&r.items.length?`<ul class="adv-lista">${advItens(r.items)}</ul>`:''}`}
  ${ro?'':`<div class="adv-l2">${p?'':`<button class="btn primary" data-a="adv-ir">${ic(r.compra?'check':'fwd',18)}<span>${r.compra?'Concluir como Comprado':r.aprov.niveis.length?'Pedir aprovação':'Avançar'}</span></button>`}${advMais(n)}</div>`}</div></section>`}

/* ---------- relato com formatação (Comprado) ---------- */
function limpaHtml(h){const tpl=document.createElement('template');tpl.innerHTML=String(h||'');const OK=['B','STRONG','I','EM','U','UL','OL','LI','BR','P','DIV'];
  const limpa=no=>{[...no.childNodes].forEach(c=>{if(c.nodeType===1){if(!OK.includes(c.tagName)){limpa(c);c.replaceWith(...c.childNodes);return}[...c.attributes].forEach(a=>c.removeAttribute(a.name));limpa(c)}else if(c.nodeType!==3)c.remove()})};
  limpa(tpl.content);return tpl.innerHTML}
const textoDe=h=>{const d=document.createElement('div');d.innerHTML=limpaHtml(h);return d.textContent.trim()};

/* ---------- negociações: quadro por etapa e, ao abrir uma etapa, por subetapa ---------- */
function kcardNeg(t,modo){const n=t.neg,o=ofertaRef(t),lp=lastProp(t),pr=proxReuniao(t),sb=n.status==='stand_by';
  return `<button class="kcard ${n.pedido?'aprov':''}" data-a="abrir" data-id="${t.id}" data-from="negociacoes" ${UI.role!=='Leitura'?'draggable="true"':''}><div class="kr"><span class="num faint">${t.codigo}</span>${tempMini(n.temp)}</div><div class="kt">${esc(t.nome)}</div>
  ${modo!=='sub'&&n.sub?`<div class="ksub"><span>${esc(subN(n.sub))}</span><span class="faint">${diasSub(n)} d</span>${subAtrasada(n)?`<span class="flag warn" title="Passou do prazo da subetapa">${ic('clock',14)}</span>`:''}</div>`:''}
  <div class="ks">${esc(t.bairro||'')}${sb?' · parou em '+SN(n.etapa):''}</div>${dividida(t)?`<div class="kpt">${ic('layers',14)}${esc(resumoPartes(t))}</div>`:''}
  <div class="kr"><span>${lp?'Prop. '+mi(lp.valor):'Pedido '+(o?.valor?mi(o.valor):'—')}</span>${atrasadas(t).length?`<span class="flag crit" title="Tarefas atrasadas">${ic('clock',14)}${atrasadas(t).length}</span>`:''}${acimaMax(t)?`<span class="flag warn">${ic('money',14)}</span>`:''}</div>${pr?`<div class="kr"><span class="faint">Reunião ${fd(pr.data)} · ${pr.hora}</span></div>`:''}
  ${n.pedido?`<div class="kped">${ic('clock',14)}Aguardando ${esc(quemFalta(n.pedido))}</div>`:''}
  <div class="kr">${av(t.resp,'sm')}<span class="faint ${!sb&&etapaAtrasada(n)?'katr':''}">${sb?'revisitar '+fd(n.retomar):modo==='sub'?diasSub(n)+' d na subetapa':diff(n.desde,HOJE)+' d na etapa'}</span></div></button>`}
function pgNeg(){if(!UI.negFase||!faseCfg(UI.negFase))return pgFasesBoard();if(UI.negFase!==faseEnt())return pgFaseBoard(UI.negFase);const e=UI.negEtapa&&etapaCfg(UI.negEtapa)?UI.negEtapa:null,ativos=S.terrenos.filter(t=>t.neg?.status==='ativo');
  let cols;
  if(!e)cols=[...STAGES.map(([k,l])=>({k,l,f:t=>t.neg?.status==='ativo'&&t.neg.etapa===k,abre:k,sla:etapaCfg(k)?.sla})),{k:'stand_by',l:'Stand By',f:t=>t.neg?.status==='stand_by',cls:'enc'}];
  else{const subs=subsDe(e);cols=subs.map(s=>({k:'sub:'+s.k,l:s.nome,f:t=>t.neg?.status==='ativo'&&t.neg.etapa===e&&t.neg.sub===s.k,prazo:s.prazo}));
    const orf=ativos.filter(t=>t.neg.etapa===e&&!subs.some(s=>s.k===t.neg.sub));if(orf.length)cols.unshift({k:'sub:',l:'Sem subetapa ativa',f:t=>orf.includes(t),cls:'enc'})}
  return `${negTopo(e?SN(e):faseN(faseEnt()),e?`Subetapas de ${esc(SN(e))}, em ${esc(faseN(faseEnt()))}. Arraste o card para mudar a subetapa.`:'Arraste os cards entre as colunas para mudar a etapa. Clique no nome da etapa para ver as subetapas. Comprados, perdidos e descartados saem do quadro.')}
  <div class="board ${e?'board-sub':''}" id="board">${cols.map(c=>{const ts=fxLista('kanban').filter(c.f);
  return `<section class="col ${c.cls||''}" data-col="${c.k}" aria-label="${esc(c.l)}"><div class="col-h">${c.abre?colDesce('neg-etapa',c.abre,c.l,'Ver subetapas de '+c.l):`<span>${esc(c.l)}</span>`}<span class="n">${ts.length}</span></div>${c.sla||c.prazo?`<div class="col-s faint">${c.sla?'SLA '+c.sla+' d':'Prazo '+c.prazo+' d'}</div>`:''}${ts.map(t=>kcardNeg(t,e?'sub':'')).join('')||'<div class="col-empty">Nenhuma</div>'}</section>`}).join('')}</div>`}
function soltar(id,col){if(col.startsWith('fe:')){soltarProc(id,col.slice(3));return}const t=T(id);if(!t||!t.neg||UI.role==='Leitura')return;const n=t.neg;
  if(col==='stand_by'){if(n.status==='ativo'){UI.alvo=id;UI.modal='suspender';renderModal()}return}
  if(col.startsWith('sub:')){const k=col.slice(4);if(!k||n.status!=='ativo'||n.sub===k)return;tentar(t,'subetapa',k);return}
  if(n.status==='stand_by'){retomar(t);if(n.etapa===col){save();render();toast('Negociação retomada.');return}}
  if(n.status!=='ativo'||n.etapa===col){save();render();return}
  if(SIDX(col)<SIDX(n.etapa)){save();render();UI.alvo=id;UI.alvoEtapa=col;UI.modal='retornar';renderModal();return}
  const res=levarAte(t,col);save();render();
  if(res.ok){toast(`${t.nome}: ${SN(col)}.`);return}
  if(res.pedido){toast(res.msg);return}
  if(res.bloq){UI.acao={tid:id,tipo:'etapa',dest:col,pend:res.pend.map(x=>x.txt),items:res.pend};UI.alvo=id;UI.modal=res.podeForcar?'forcar':'adv-bloq';renderModal();return}
  toast(res.erro,true)}
/* tenta a passagem; bloqueada abre a justificativa (gestor/diretor) ou a lista do que falta */
function tentar(t,tipo,dest,dados){const r=moverPara(t,tipo,dest,{dados});save();render();
  if(r.ok){toast(`${t.nome}: ${destinoNome(tipo,dest)}.`);return r}
  if(r.pedido){toast(r.msg);return r}
  if(r.bloq){UI.acao={tid:t.id,tipo,dest,dados,pend:r.pend.map(x=>x.txt),items:r.pend};UI.alvo=t.id;UI.modal=r.podeForcar?'forcar':'adv-bloq';renderModal();return r}
  toast(r.erro,true);return r}

/* ---------- Configurações › Funil (só administrador) ---------- */
const TIPOS_NOTIF_N={tarefa_atribuida:'Tarefa atribuída a você',tarefa_marcado:'Marcado em uma tarefa',tarefa_prazo:'Prazo de tarefa chegando',tarefa_atrasada:'Tarefa atrasada',subetapa_prazo:'Subetapa passou do prazo',stand_by_retomar:'Data de retomar um Stand By',documento_vencendo:'Documento vencendo',reuniao_agendada:'Reunião agendada',aprovacao_pendente:'Pedido de aprovação para você',aprovacao_decidida:'Seu pedido foi aprovado ou recusado'};
const apCells=(p,c)=>`<label class="chk"><input type="checkbox" data-ch="cfg" data-p="${p}.g" ${c.g?'checked':''}>Gestor</label><label class="chk"><input type="checkbox" data-ch="cfg" data-p="${p}.d" ${c.d?'checked':''}>Diretor</label>${c.g&&c.d?`<select data-ch="cfg" data-p="${p}.modo" aria-label="Ordem das aprovações"><option value="sequencia" ${c.modo!=='paralelo'?'selected':''}>Em sequência</option><option value="paralelo" ${c.modo==='paralelo'?'selected':''}>Em paralelo</option></select>`:''}`;
const usada=k=>S.terrenos.some(t=>t.neg&&(t.neg.sub===k||(t.neg.trilha||[]).some(x=>x.paraSub===k||x.deSub===k)));
function pgConfig(){
  if(!ehAdmin(me()))return `<div class="page-h"><div><h1><span class="marca"></span>Configurações</h1></div></div><section class="sec"><div class="sec-b"><div class="empty">Só administradores alteram a configuração do funil. Teste como Diretor (Moisés é administrador).</div></div></section>`;
  const C=cfg(),aba=UI.cfgAba||'fases';
  const abas=[['fases','Fases'],['funil','Etapas de '+faseN(faseEnt())],['prereq','Pré-requisitos'],['status','Status e motivos'],['checklist','Checklist'],['notif','Notificações'],['equipe','Equipe'],['viab','Viabilidade'],['zonas','Parâmetros urbanísticos']];
  let corpo='';
  if(aba==='fases')corpo=cfgFasesHtml();
  if(aba==='viab')corpo=cfgViabHtml();
  if(aba==='zonas')corpo=cfgZonasHtml();
  if(aba==='funil')corpo=`<section class="sec"><div class="sec-h"><h2>Etapas de ${esc(faseN(faseEnt()))}</h2><span class="faint" style="font-size:13px">No protótipo, etapa nova só nas outras fases (aba Fases)</span></div><div class="sec-b"><div class="cfg-t">
    <div class="cfg-r cfg-hd"><span>Etapa</span><span>SLA (dias)</span><span>Aprovação para entrar</span></div>
    ${C.etapas.map((e,i)=>`<div class="cfg-r"><input data-ch="cfg" data-p="etapas.${i}.nome" value="${esc(e.nome)}" aria-label="Nome da etapa"><input type="number" min="0" data-ch="cfg" data-p="etapas.${i}.sla" value="${e.sla??''}" aria-label="SLA de ${esc(e.nome)}"><span class="cfg-ap">${apCells('etapas.'+i,e)}</span></div>`).join('')}</div></div></section>
    ${C.etapas.map(e=>{const ss=C.subs.map((s,i)=>[s,i]).filter(([s])=>s.etapa===e.k).sort((a,b)=>a[0].ordem-b[0].ordem);
      return `<section class="sec"><div class="sec-h"><h2>Subetapas · ${esc(e.nome)}</h2></div><div class="sec-b"><div class="cfg-t">
      <div class="cfg-r cfg-hd cfg-sub"><span></span><span>Subetapa</span><span>Prazo (dias)</span><span>Aprovação para entrar</span><span>Ativa</span><span></span></div>
      ${ss.map(([s,i],j)=>`<div class="cfg-r cfg-sub ${s.ativo?'':'inativa'}"><span class="cfg-ord"><button class="iconbtn sm" data-a="cfg-ord" data-i="${i}" data-v="-1" ${j?'':'disabled'} aria-label="Subir">↑</button><button class="iconbtn sm" data-a="cfg-ord" data-i="${i}" data-v="1" ${j<ss.length-1?'':'disabled'} aria-label="Descer">↓</button></span>
        <input data-ch="cfg" data-p="subs.${i}.nome" value="${esc(s.nome)}" aria-label="Nome da subetapa"><input type="number" min="0" data-ch="cfg" data-p="subs.${i}.prazo" value="${s.prazo??''}" placeholder="Sem prazo" aria-label="Prazo de ${esc(s.nome)}">
        <span class="cfg-ap">${apCells('subs.'+i,s)}</span><label class="chk"><input type="checkbox" data-ch="cfg" data-p="subs.${i}.ativo" ${s.ativo?'checked':''} aria-label="Ativa">${j===0&&s.ativo?'<span class="faint" style="font-size:12px">inicial</span>':''}</label>
        <span>${usada(s.k)?'':`<button class="linkbtn danger" data-a="cfg-sub-del" data-i="${i}">Apagar</button>`}</span></div>`).join('')}</div>
      <form class="inline-form" data-form="cfg-sub" data-e="${e.k}"><div class="field grow"><label for="cs-${e.k}">Nova subetapa</label><input id="cs-${e.k}" name="nome" required placeholder="Nome"></div><div class="field" style="flex:0 1 120px"><label for="cp-${e.k}">Prazo (dias)</label><input id="cp-${e.k}" name="prazo" type="number" min="0"></div><button class="btn sm">${ic('add',16)}Adicionar</button></form>
      <div class="hint">A primeira subetapa ativa é a inicial: é onde o card entra na etapa. Subetapa já usada não se apaga; desative.</div></div></section>`}).join('')}`;
  if(aba==='prereq'){const opAlvo=`<optgroup label="Etapas">${C.etapas.map(e=>`<option value="etapa:${e.k}">${esc(e.nome)}</option>`).join('')}</optgroup>${C.etapas.map(e=>`<optgroup label="Subetapas de ${esc(e.nome)}">${subsDe(e.k).map(s=>`<option value="subetapa:${s.k}">${esc(s.nome)}</option>`).join('')}</optgroup>`).join('')}`;
    const opReq=C.etapas.map(e=>`<optgroup label="${esc(e.nome)}">${subsDe(e.k).map(s=>`<option value="${s.k}">${esc(s.nome)}</option>`).join('')}</optgroup>`).join('');
    corpo=`<section class="sec"><div class="sec-h"><h2>Pré-requisitos</h2></div><div class="sec-b"><p class="muted" style="margin-top:0">Para entrar numa etapa ou subetapa, o card precisa ter passado antes pelas subetapas listadas. Sem regra, a passagem é livre. Gestor e diretor podem passar sem os requisitos, com justificativa.</p>
    <ul class="cfg-pre">${C.prereq.map(p=>`<li><span>Para entrar em <b>${esc(destinoNome(p.alvoTipo,p.alvo))}</b>${p.alvoTipo==='etapa'?' (etapa)':''}, precisa ter passado por <b>${esc(subN(p.req))}</b></span><button class="linkbtn danger" data-a="cfg-pre-del" data-v="${p.id}">Remover</button></li>`).join('')||'<li class="faint">Nenhuma regra. Todas as passagens são livres.</li>'}</ul>
    <form class="inline-form" data-form="cfg-pre"><div class="field grow"><label for="pr-a">Para entrar em</label><select id="pr-a" name="alvo" required>${opAlvo}</select></div><div class="field grow"><label for="pr-r">Precisa ter passado por</label><select id="pr-r" name="req" required>${opReq}</select></div><button class="btn sm">${ic('add',16)}Adicionar regra</button></form></div></section>`}
  if(aba==='status')corpo=`<section class="sec"><div class="sec-h"><h2>Status</h2></div><div class="sec-b"><div class="cfg-t"><div class="cfg-r cfg-hd cfg-st"><span>Status</span><span>Aprovação</span></div>
    ${Object.entries(C.status).map(([k,s])=>`<div class="cfg-r cfg-st"><span>${STATUS_N[k]}</span><span class="cfg-ap">${apCells('status.'+k,s)}</span></div>`).join('')}</div>
    <div class="hint">Comprado só sai da última etapa. Quem já tem o nível exigido fica dispensado da aprovação dele.</div></div></section>
    ${['descartado','perdido'].map(st=>`<section class="sec"><div class="sec-h"><h2>Motivos de ${STATUS_N[st]}</h2></div><div class="sec-b"><div class="cfg-t"><div class="cfg-r cfg-hd cfg-mot"><span>Motivo</span><span>Exige texto</span><span>Ativo</span></div>
    ${C.motivos[st].map((m,i)=>`<div class="cfg-r cfg-mot ${m.ativo?'':'inativa'}"><input data-ch="cfg" data-p="motivos.${st}.${i}.nome" value="${esc(m.nome)}" aria-label="Motivo"><label class="chk"><input type="checkbox" data-ch="cfg" data-p="motivos.${st}.${i}.texto" ${m.texto?'checked':''} aria-label="Exige texto"></label><label class="chk"><input type="checkbox" data-ch="cfg" data-p="motivos.${st}.${i}.ativo" ${m.ativo?'checked':''} aria-label="Ativo"></label></div>`).join('')}</div>
    <form class="inline-form" data-form="cfg-mot" data-s="${st}"><div class="field grow"><label for="mt-${st}">Novo motivo</label><input id="mt-${st}" name="nome" required></div><button class="btn sm">${ic('add',16)}Adicionar</button></form></div></section>`).join('')}`;
  if(aba==='checklist')corpo=C.etapas.map(e=>{const L=C.checklist[e.k]||[];return `<section class="sec"><div class="sec-h"><h2>Para sair de ${esc(e.nome)}</h2></div><div class="sec-b"><div class="cfg-docs">${Object.entries(TIPOS_DOC).filter(([k])=>!['foto','planta','ata'].includes(k)).map(([k,[l]])=>{const c=L.find(x=>x.doc===k);
      return `<button class="fchip" data-a="cfg-doc" data-e="${e.k}" data-v="${k}" aria-pressed="${!!c}" title="${c?(c.obrig?'Obrigatório: clique para tornar opcional':'Opcional: clique para tirar'):'Fora do checklist: clique para exigir'}">${c?ic(c.obrig?'check':'clock',16):''}${esc(l)}${c&&!c.obrig?' <span class="faint">(opcional)</span>':''}</button>`}).join('')}</div></div></section>`}).join('')+'<div class="hint" style="margin:0 4px">Clique para alternar: obrigatório, opcional, fora do checklist. O obrigatório trava a saída da etapa (gestor e diretor passam com justificativa).</div>';
  if(aba==='notif')corpo=`<section class="sec"><div class="sec-h"><h2>Notificações</h2></div><div class="sec-b"><div class="cfg-t"><div class="cfg-r cfg-hd cfg-nt"><span>Tipo</span><span>Ativa</span><span>Lembretes (dias antes)</span></div>
    ${Object.entries(C.notif).map(([k,c])=>`<div class="cfg-r cfg-nt"><span>${TIPOS_NOTIF_N[k]||k}</span><label class="chk"><input type="checkbox" data-ch="cfg" data-p="notif.${k}.ativo" ${c.ativo?'checked':''} aria-label="Ativa"></label>${c.dias?`<input data-ch="cfg-dias" data-k="${k}" value="${c.dias.join(', ')}" placeholder="Ex.: 7, 1, 0" aria-label="Lembretes de ${TIPOS_NOTIF_N[k]}">`:'<span class="faint">Na hora</span>'}</div>`).join('')}</div>
    <div class="hint">Por enquanto só no app (sino da barra superior). E-mail fica para depois. Cada pessoa pode mudar os lembretes de um item com data.</div></div></section>`;
  if(aba==='equipe')corpo=`<section class="sec"><div class="sec-h"><h2>Equipe e hierarquia</h2></div><div class="sec-b"><div class="cfg-t"><div class="cfg-r cfg-hd cfg-eq"><span>Pessoa</span><span>Papel</span><span>Superior</span><span>Administrador</span></div>
    ${S.membros.map((m,i)=>{const sups=S.membros.filter(x=>NIVEL[x.papel]===NIVEL[m.papel]+1);return `<div class="cfg-r cfg-eq"><span>${av(m.nome,'sm')} ${esc(m.nome)}</span><select data-ch="cfg-eq" data-i="${i}" data-k="papel" aria-label="Papel de ${esc(m.nome)}">${Object.entries(PAPEL_N).map(([k,l])=>`<option value="${k}" ${m.papel===k?'selected':''}>${l}</option>`).join('')}</select>
      <select data-ch="cfg-eq" data-i="${i}" data-k="sup" aria-label="Superior de ${esc(m.nome)}" ${m.papel==='diretor'||m.papel==='leitura'?'disabled':''}><option value="">—</option>${sups.map(x=>`<option ${m.sup===x.nome?'selected':''}>${esc(x.nome)}</option>`).join('')}</select>
      <label class="chk"><input type="checkbox" data-ch="cfg-eq" data-i="${i}" data-k="admin" ${m.admin?'checked':''} aria-label="Administrador"></label></div>`}).join('')}</div>
    <div class="hint">Analista responde a um gestor; gestor responde a um diretor. Qualquer superior pode aprovar por quem está abaixo dele. Administrador é uma permissão à parte, em qualquer papel.</div></div></section>`;
  return `<div class="page-h"><div><h1><span class="marca"></span>Configurações › ${aba==='viab'?'Viabilidade':'Funil'}</h1><div class="sub">Vale para toda a empresa. Cada mudança fica na auditoria.</div></div><button class="btn" data-a="cfg-padrao">Restaurar padrão</button></div>
  <div class="fchips cfg-abas" role="tablist">${abas.map(([k,l])=>`<button class="fchip" role="tab" data-a="cfg-aba" data-v="${k}" aria-pressed="${aba===k}" aria-selected="${aba===k}">${aba===k?ic('check',16):''}${l}</button>`).join('')}</div><div class="stack">${corpo}</div>`}
function setPath(o,p,v){const k=p.split('.');let x=o;k.slice(0,-1).forEach(c=>{x=x[c]});x[k[k.length-1]]=v}
/* pré-requisito: sem ciclo, sem exigir subetapa de etapa posterior, subetapa inicial não exige irmã */
function validaPre(alvoTipo,alvo,req){const C=cfg(),rs=subCfg(req);if(!rs)return 'Subetapa inválida.';
  const eAlvo=alvoTipo==='etapa'?alvo:subCfg(alvo)?.etapa;
  if(alvoTipo==='subetapa'&&alvo===req)return 'Uma subetapa não pode exigir ela mesma.';
  if(SIDX(rs.etapa)>SIDX(eAlvo)||(alvoTipo==='etapa'&&rs.etapa===alvo))return `${rs.nome} fica depois (ou dentro) de ${destinoNome(alvoTipo,alvo)}.`;
  if(alvoTipo==='subetapa'&&rs.etapa===eAlvo&&subInicial(eAlvo)===alvo)return `${subN(alvo)} é a subetapa inicial: o card entra nela direto.`;
  if(C.prereq.some(p=>p.alvoTipo===alvoTipo&&p.alvo===alvo&&p.req===req))return 'Essa regra já existe.';
  const exige=(s,vis=new Set())=>{if(vis.has(s))return false;vis.add(s);return C.prereq.filter(p=>p.alvoTipo==='subetapa'&&p.alvo===s).some(p=>p.req===alvo||exige(p.req,vis))};
  if(alvoTipo==='subetapa'&&exige(req))return 'Criaria um ciclo de pré-requisitos.';
  return null}
function validaEquipe(){const M=S.membros;if(!M.some(m=>m.admin))return 'A empresa precisa de pelo menos um administrador.';
  for(const m of M){if(m.sup){const s=M.find(x=>x.nome===m.sup);if(!s||NIVEL[s.papel]!==NIVEL[m.papel]+1)return `${m.nome}: o superior precisa estar um nível acima.`}}return null}

/* ---------- eventos do funil (chamados antes dos genéricos) ---------- */
function funilClick(A,a,t){
  switch(A){
    case 'sino':sinoAberto=!sinoAberto;renderSino();return true;
    case 'notif':{const x=S.notifs.find(n=>n.id===a.dataset.v);if(!x)return true;x.lida=true;sinoAberto=false;save();renderSino();if(x.tid&&T(x.tid)){BLA={geral:true};blId=x.tid;go('terreno',{id:x.tid,tab:'geral',from:UI.route==='terreno'?UI.from:'inicio'})}return true}
    case 'notif-lidas':minhasNotifs().forEach(x=>x.lida=true);save();renderSino();return true;
    case 'neg-etapa':UI.negEtapa=a.dataset.v||null;render();return true;
    case 'adv-ir':{const r=checkAdv(t);if(!r)return true;const pend=r.items.filter(x=>!x.ok);
      if(r.compra){if(pend.length&&!r.forcar){UI.acao={tid:t.id,tipo:'status',dest:'comprado',pend:pend.map(x=>x.txt),items:pend};UI.modal='adv-bloq'}else{UI.acao={pend:pend.map(x=>x.txt)};UI.modal='comprar'}renderModal();return true}
      tentar(t,'etapa',r.dest);return true}
    case 'perder':UI.modal='perder';renderModal();return true;
    case 'descartar':UI.modal='descartar';renderModal();return true;
    case 'suspender':UI.modal='suspender';renderModal();return true;
    case 'retomar':retomar(t);save();render();toast('Negociação retomada. O tempo parado não conta no prazo.');return true;
    case 'aprovar':{const r=decidir(t,true,'');save();render();toast(r.erro||r.msg,!!r.erro);return true}
    case 'recusar':UI.modal='recusar';renderModal();return true;
    case 'cancelar-pedido':cancelarPedido(t);save();render();toast('Pedido cancelado.');return true;
    case 'rt-bold':case 'rt-ital':case 'rt-list':document.execCommand(A==='rt-bold'?'bold':A==='rt-ital'?'italic':'insertUnorderedList');$('#cp-rel')?.focus();return true;
    case 'cfg-aba':UI.cfgAba=a.dataset.v;render();return true;
    case 'cfg-padrao':if(!confirm('Restaurar a configuração padrão do funil? As subetapas criadas aqui somem.'))return true;S.cfg=CFG_PADRAO();S.cfg.fases=FASES_PADRAO();S.cfg.deps=DEPS_PADRAO();syncCfg();save();render();toast('Configuração padrão restaurada.');return true;
    case 'cfg-ord':{const C=cfg(),s=C.subs[+a.dataset.i],ss=C.subs.filter(x=>x.etapa===s.etapa).sort((x,y)=>x.ordem-y.ordem),j=ss.indexOf(s),o=ss[j+Number(a.dataset.v)];if(!o)return true;[s.ordem,o.ordem]=[o.ordem,s.ordem];save();render();return true}
    case 'cfg-sub-del':{const C=cfg(),s=C.subs[+a.dataset.i];if(usada(s.k)){toast('Subetapa já usada: desative em vez de apagar.',true);return true}C.subs.splice(+a.dataset.i,1);C.prereq=C.prereq.filter(p=>p.req!==s.k&&!(p.alvoTipo==='subetapa'&&p.alvo===s.k));save();render();toast(`${s.nome} apagada.`);return true}
    case 'cfg-pre-del':cfg().prereq=cfg().prereq.filter(p=>p.id!==a.dataset.v);save();render();toast('Regra removida.');return true;
    case 'cfg-doc':{const L=cfg().checklist[a.dataset.e]=cfg().checklist[a.dataset.e]||[],i=L.findIndex(x=>x.doc===a.dataset.v);
      if(i<0)L.push({doc:a.dataset.v,obrig:true});else if(L[i].obrig)L[i].obrig=false;else L.splice(i,1);save();render();return true}
  }
  if(A==='nav'&&a.dataset.cfg){sinoAberto=false;UI.cfgAba=a.dataset.cfg}
  return false}
function funilChange(el){
  if(el.dataset.ch==='sub'){const t=T(UI.id);if(t)tentar(t,'subetapa',el.value);return true}
  if(el.dataset.ch==='cfg'){let v=el.type==='checkbox'?el.checked:el.type==='number'?(el.value===''?null:Number(el.value)):el.value.trim();
    if(el.type!=='checkbox'&&el.type!=='number'&&!v){toast('O nome não pode ficar vazio.',true);render();return true}
    const p=el.dataset.p;
    if(/^subs\.\d+\.ativo$/.test(p)&&!v){const s=cfg().subs[+p.split('.')[1]];if(subsDe(s.etapa).length<=1){toast('A etapa precisa de ao menos uma subetapa ativa.',true);render();return true}
      const n=S.terrenos.filter(t=>t.neg?.status!=='perdido'&&t.neg?.sub===s.k).length;if(n)toast(`${n} card${n>1?'s continuam':' continua'} em ${s.nome} até alguém mudar a subetapa.`)}
    setPath(cfg(),p,v);syncCfg();save();render();return true}
  if(el.dataset.ch==='cfg-dias'){const d=[...new Set(el.value.split(/[,;\s]+/).filter(Boolean).map(Number).filter(x=>Number.isInteger(x)&&x>=0))].sort((a,b)=>b-a);cfg().notif[el.dataset.k].dias=d;save();render();toast('Lembretes salvos.');return true}
  if(el.dataset.ch==='cfg-eq'){const m=S.membros[+el.dataset.i],antes={...m},k=el.dataset.k;
    if(k==='papel'&&S.membros.some(x=>x.sup===m.nome)){toast(`${m.nome} tem subordinados: mude o superior deles antes.`,true);render();return true}
    if(k==='admin')m.admin=el.checked;else if(k==='sup')m.sup=el.value||null;else{m.papel=el.value;m.sup=null}
    const e=validaEquipe();if(e){Object.assign(m,antes);toast(e,true)}else toast('Equipe atualizada.');save();render();return true}
  return false}
function funilSubmit(form,F,t,f){
  switch(form){
    case 'perder':case 'descartar':{const st=form==='perder'?'perdido':'descartado',m=(cfg().motivos[st]||[]).find(x=>x.k===F.motivo);
      if(m?.texto&&!F.detalhe.trim()){toast('Esse motivo pede uma explicação no texto.',true);return true}
      UI.modal=null;tentar(t,'status',st,{motivo:F.motivo,detalhe:F.detalhe.trim()});return true}
    case 'suspender':UI.modal=null;tentar(t,'status','stand_by',{retomar:F.retomar,detalhe:F.detalhe.trim()});return true;
    case 'comprar':{const rel=limpaHtml($('#cp-rel')?.innerHTML||'');if(!textoDe(rel)){toast('Escreva o relato da compra.',true);return true}
      const pend=UI.acao?.pend||[];if(pend.length&&!F.j?.trim()){toast('Justifique a compra sem os requisitos.',true);return true}
      const r=moverPara(t,'status','comprado',{forcar:!!pend.length,just:F.j?.trim(),dados:{relato:rel,pontos:F.pontos.trim()}});UI.modal=null;UI.acao=null;save();render();
      toast(r.ok?'Comprado.':r.pedido?r.msg:r.erro||'Não foi possível concluir.',!!r.erro||!!r.bloq);return true}
    case 'recusar':{const r=decidir(t,false,F.coment.trim());UI.modal=null;save();render();toast(r.erro||r.msg,!!r.erro);return true}
    case 'retornar':UI.modal=null;executar(t,'etapa',UI.alvoEtapa,{motivo:F.motivo});save();render();toast(`Voltou para ${SN(t.neg.etapa)}.`);return true;
    case 'forcar':{const a=UI.acao,x=T(a.tid);let r;
      if(a.tipo==='etapa'&&SIDX(a.dest)>SIDX(x.neg.etapa)+1)r=levarAte(x,a.dest,{forcar:true,just:F.j});else r=moverPara(x,a.tipo,a.dest,{forcar:true,just:F.j,dados:a.dados});
      UI.modal=null;UI.acao=null;save();render();toast(r.ok?`${x.nome}: ${destinoNome(a.tipo,a.dest)}.`:r.msg||r.erro||'Não foi possível.',!!r.erro);return true}
    case 'cfg-sub':{const C=cfg(),e=f.dataset.e,nome=F.nome.trim();if(C.subs.some(s=>s.etapa===e&&s.nome.toLowerCase()===nome.toLowerCase())){toast('Já existe uma subetapa com esse nome nesta etapa.',true);return true}
      let k=nome.normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');while(C.subs.some(s=>s.k===k))k+='_';
      C.subs.push({k,etapa:e,nome,ordem:Math.max(0,...C.subs.filter(s=>s.etapa===e).map(s=>s.ordem))+1,prazo:lerNum(F.prazo),g:false,d:false,modo:'sequencia',ativo:true});save();render();toast(`${nome} adicionada em ${SN(e)}.`);return true}
    case 'cfg-pre':{const [at,al]=F.alvo.split(':'),e=validaPre(at,al,F.req);if(e){toast(e,true);return true}cfg().prereq.push({id:uid(),alvoTipo:at,alvo:al,req:F.req});save();render();toast('Regra adicionada.');return true}
    case 'cfg-mot':{const C=cfg(),st=f.dataset.s,nome=F.nome.trim();let k=nome.normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');while(C.motivos[st].some(m=>m.k===k))k+='_';
      C.motivos[st].push({k,nome,texto:false,ativo:true});save();render();toast('Motivo adicionado.');return true}
  }
  return false}
/* modais do funil */
function funilModal(M,fechar){const t=UI.alvo?T(UI.alvo):T(UI.id);
  const motivos=st=>`<select id="mo-m" name="motivo" required><option value="">Escolha</option>${cfg().motivos[st].filter(m=>m.ativo).map(m=>`<option value="${m.k}">${esc(m.nome)}</option>`).join('')}</select>`;
  const df=(id,l)=>`<div class="df"><button class="btn text" data-a="close">Cancelar</button><button class="btn primary" type="submit" form="${id}">${l}</button></div>`;
  const apInfo=st=>{const ap=aprovExig('status',st,me());return ap.niveis.length?`<div class="banner blue" style="margin-top:12px">${ic('check')}<div>Vai como pedido de aprovação: ${ap.niveis.map(x=>NIV_N[x]).join(ap.modo==='sequencia'?', depois ':' e ')}.</div></div>`:''};
  if(M==='perder')return `<div class="dh"><div><h2>Marcar como Perdido</h2><div class="muted" style="margin-top:4px">O vendedor não quis seguir com a BKM.</div></div>${fechar}</div><form data-form="perder" id="f-p"><div class="fields"><div class="field full"><label for="mo-m">Motivo</label>${motivos('perdido')}</div><div class="field full"><label for="pd-d">Relato</label><textarea id="pd-d" name="detalhe" required placeholder="O que aconteceu, com quem e quando"></textarea></div></div>${apInfo('perdido')}</form>${df('f-p','Marcar como Perdido')}`;
  if(M==='descartar')return `<div class="dh"><div><h2>Descartar</h2><div class="muted" style="margin-top:4px">A BKM decidiu não seguir.</div></div>${fechar}</div><form data-form="descartar" id="f-ds"><div class="fields"><div class="field full"><label for="mo-m">Motivo</label>${motivos('descartado')}</div><div class="field full"><label for="ds-d">Detalhe</label><textarea id="ds-d" name="detalhe" placeholder="Obrigatório quando o motivo é Outros"></textarea></div></div>${apInfo('descartado')}</form>${df('f-ds','Descartar')}`;
  if(M==='suspender')return `<div class="dh"><h2>Colocar em Stand By</h2>${fechar}</div><form data-form="suspender" id="f-s"><div class="fields"><div class="field"><label for="sp-d">Retomar em</label><input id="sp-d" name="retomar" type="date" min="${addD(HOJE,1)}" value="${addD(HOJE,30)}" required></div><div class="field full"><label for="sp-t">Justificativa</label><textarea id="sp-t" name="detalhe" required></textarea></div></div><div class="hint" style="margin-top:8px">O sino avisa o responsável antes da data. O tempo parado não conta no prazo da etapa.</div>${apInfo('stand_by')}</form>${df('f-s','Colocar em Stand By')}`;
  if(M==='comprar'){const pend=UI.acao?.pend||[];return `<div class="dh"><div><h2>Concluir como Comprado</h2><div class="muted" style="margin-top:4px">${esc(t.nome)}</div></div>${fechar}</div><form data-form="comprar" id="f-cp"><div class="fields">
    <div class="field full"><span class="lbl-f" id="cp-l">Relato da compra</span><div class="rt"><div class="rt-bar" role="toolbar" aria-label="Formatação"><button type="button" class="iconbtn sm" data-a="rt-bold" aria-label="Negrito"><b>N</b></button><button type="button" class="iconbtn sm" data-a="rt-ital" aria-label="Itálico"><i>I</i></button><button type="button" class="iconbtn sm" data-a="rt-list" aria-label="Lista">•</button></div><div id="cp-rel" class="rt-ed" contenteditable="true" role="textbox" aria-multiline="true" aria-labelledby="cp-l" data-ph="Como foi a negociação, condições finais, quem participou"></div></div></div>
    <div class="field full"><label for="cp-p">Pontos de sucesso</label><textarea id="cp-p" name="pontos" required placeholder="O que fez a compra dar certo e vale repetir"></textarea></div>
    ${pend.length?`<div class="field full"><div class="banner warn">${ic('warn')}<div><div class="bt">Comprar sem os requisitos</div><ul class="pend">${pend.map(x=>`<li>${ic('close',16)}${esc(x)}</li>`).join('')}</ul></div></div></div><div class="field full"><label for="cp-j">Justificativa (vai para o histórico)</label><textarea id="cp-j" name="j" required></textarea></div>`:''}</div>${apInfo('comprado')}</form>${df('f-cp','Concluir')}`}
  if(M==='recusar'){const p=t.neg.pedido;return `<div class="dh"><div><h2>Recusar ${esc(destinoNome(p.tipo,p.dest))}?</h2><div class="muted" style="margin-top:4px">${esc(p.por)} recebe o motivo no sino.</div></div>${fechar}</div><form data-form="recusar" id="f-rc"><div class="field"><label for="rc-c">Motivo da recusa</label><textarea id="rc-c" name="coment" required></textarea></div></form>${df('f-rc','Recusar')}`}
  if(M==='adv-bloq'){const a=UI.acao||{},pend=a.items||[];return `<div class="dh"><div><h2>Ainda não dá para ${a.dest==='comprado'?'concluir como Comprado':'ir para '+esc(destinoNome(a.tipo,a.dest))}</h2><p class="muted" style="margin:6px 0 0">Resolva o que falta. Gestor e diretor podem passar sem os requisitos, com justificativa.</p></div>${fechar}</div><ul class="adv-lista adv-modal">${advItens(pend)}</ul><div class="df"><button class="btn primary" data-a="close">Entendi</button></div>`}
  if(M==='forcar'){const a=UI.acao||{};return `<div class="dh"><div><h2>Ir para ${esc(destinoNome(a.tipo,a.dest))} sem os requisitos?</h2>${a.pend?.length?`<ul class="pend">${a.pend.map(x=>`<li>${ic('close',16)}${esc(x)}</li>`).join('')}</ul>`:''}</div>${fechar}</div><form data-form="forcar" id="f-fc"><div class="field"><label for="fc-j">Justificativa (vai para o histórico)</label><textarea id="fc-j" name="j" required></textarea></div></form>${df('f-fc','Avançar')}`}
  if(M==='retornar')return `<div class="dh"><div><h2>Voltar para ${SN(UI.alvoEtapa)}?</h2><div class="muted" style="margin-top:4px">${esc(t.nome)} está em ${SN(t.neg.etapa)}. Volta na subetapa inicial.</div></div>${fechar}</div><form data-form="retornar" id="f-rt"><div class="field"><label for="rt-m">Motivo (vai para o histórico)</label><textarea id="rt-m" name="motivo" required placeholder="Ex.: vendedor reabriu o preço"></textarea></div></form>${df('f-rt','Voltar etapa')}`;
  return ''}
prepararDados();
// Ambiente: o Caddy injeta AMBIENTE na meta bkm-ambiente; fora da produção, selo ao lado do logo e prefixo no título
(()=>{const a=(document.querySelector('meta[name="bkm-ambiente"]')?.content||'').trim().toLowerCase();if(!a||a==='producao'||a.includes('{'+'%'))return;const n=a==='dev'?'Desenvolvimento':a;document.title='['+(a==='dev'?'DEV':a.toUpperCase())+'] '+document.title;const b=document.querySelector('.top .brand');if(b){const s=document.createElement('span');s.className='amb-selo';s.title=n;s.innerHTML='<span class="amb-l">'+n+'</span><span class="amb-c">'+(a==='dev'?'DEV':a.slice(0,3).toUpperCase())+'</span>';b.after(s)}})();
