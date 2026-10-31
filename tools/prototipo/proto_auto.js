/* =====================================================================
   Automações (bloco 5a; 30/out/2026): "quando acontecer X, se Y, faça Z",
   no modelo do Butler do Trello. Espelha fluxo.automacoes,
   fluxo.automacao_execucoes e fluxo.disparar_automacoes.
   - Regra do quadro: de quem edita o terreno (botão Automações na seção
     Tarefas), com as listas do quadro; só toca cartões que o dono vê.
   - Regra da empresa: do administrador (Configurações › Tarefas), vale em
     todos os quadros, com as listas pelo nome.
   - Cada regra tem dono e se desliga; cada execução fica registrada (ok ou
     erro). O que uma regra faz não dispara outra regra. Modelo de cartão e
     cartão arquivado não disparam. Regra que já rodou não se apaga.
   - Prazo vencendo em N dias e prazo vencido rodam na rotina diária, uma
     vez por prazo; pausada não conta.
   - Bloco 5b (30/out): "Botão no cartão" vira um botão nos cartões que
     passam nas condições, para quem edita o cartão (fluxo.botoes_cartao,
     fluxo.apertar_botao); "Agendamento" roda na rotina diária, todo dia,
     na semana nos dias marcados ou no mês no dia (o último dia quando o mês
     não tem), em cada cartão que passa nas condições, uma vez por dia
     (fluxo.automacoes_agenda); a regra agendada precisa de condição.
     Condição Situação: aberta, atrasada ou concluída.
   Injetado no mesmo escopo.
   ===================================================================== */
P.raio='M13 2L4 14h7l-1 8 9-12h-7z';
const AU_GAT={criada:'Cartão criado',entrou_lista:'Cartão entra numa lista',concluida:'Tarefa concluída',etiqueta:'Etiqueta adicionada',
  campo:'Campo personalizado alterado',checklist_completo:'Checklist completo',prazo_antes:'Prazo vence em N dias',prazo_venceu:'Prazo vencido',botao:'Botão no cartão',agenda:'Agendamento'};
const AU_COND={situacao:'Situação',lista:'Está na lista',etiqueta:'Etiqueta',prioridade:'Prioridade',campo:'Campo personalizado'};
const AU_ACAO={avisar:'Avisar',mover:'Mover para a lista',etiqueta:'Pôr ou tirar etiqueta',responsavel:'Trocar o responsável',prioridade:'Mudar a prioridade',
  adiar:'Adiar o prazo',checklist:'Adicionar checklist',arquivar:'Arquivar'};
const AU_SIT={aberta:'Aberta',atrasada:'Atrasada',concluida:'Concluída'},AU_FREQ={diaria:'Todo dia',semanal:'Toda semana',mensal:'Todo mês'};
const AU_PARA={responsavel:'Responsável',executores:'Executores',aprovadores:'Aprovadores',acompanham:'Quem acompanha',solicitante:'Quem pediu',gestor:'Gestor do responsável'};
const auRegras=()=>S.automacoes||(S.automacoes=[]);
const auExecs=()=>S.autoExec||(S.autoExec=[]);
const auDoQuadro=t=>auRegras().filter(r=>r.tid===t.id&&!r.kid);
const auDoCartao=k=>auRegras().filter(r=>r.kid===k.id);   // regra só de um cartão (30/out): o quadro é o do cartão
const auDaEmpresa=()=>auRegras().filter(r=>!r.tid);
const auPodeMudar=r=>tkEd()&&(ehAdmin(me())||(r.dono===me()&&!!r.tid));
const auRodou=r=>auExecs().some(x=>x.aid===r.id);
const auNomeL=n=>(n||'').trim().toLowerCase();
/* lista da regra no quadro do cartão: pelo id (regra do quadro) ou pelo nome (regra da empresa) */
function auLista(t,r,v){const L=tkL(t);return r.tid?L.find(l=>l.id===v):L.filter(l=>auNomeL(l.nome)===auNomeL(v)).sort((a,b)=>(a.oculta?1:0)-(b.oculta?1:0))[0]}
function auNomeLista(r,v){if(!r.tid)return v||'';const l=tkL(T(r.tid)).find(x=>x.id===v);return l?l.nome:'(lista removida)'}
function auDonoVale(r){const m=membro(r.dono);if(r.kid){const {t,k}=tkAcha(r.tid,r.kid);if(!k||vzNiv(vzPapel(t,k,r.dono))<3)return false}return r.tid?m.papel!=='leitura':!!m.admin}

/* ---------- motor ---------- */
function auCondOk(t,r,k){return (r.conds||[]).every(c=>{
  if(c.tipo==='lista'){const l=tkLista(t,k);return r.tid?(c.v||[]).includes(l.id):(c.v||[]).some(n=>auNomeL(n)===auNomeL(l.nome))}
  if(c.tipo==='etiqueta')return (k.etq||[]).includes(c.v)===(c.tem!==false);
  if(c.tipo==='prioridade')return (c.v||[]).includes(k.prio);
  if(c.tipo==='situacao'){const v=c.v||[];return (!k.feita&&v.includes('aberta'))||(!!k.feita&&v.includes('concluida'))||(v.includes('atrasada')&&tkAtras(k))}
  if(c.tipo==='campo'){const x=k.campos?.[c.campo],f=cpoCampos().find(y=>y.id===c.campo);if(c.op==='vazio')return x==null;if(c.op==='preenchido')return x!=null;if(x==null||!f)return false;
    if(f.tipo==='texto')return auNomeL(x)===auNomeL(c.valor);if(f.tipo==='numero')return Number(x)===cpoNum(String(c.valor));if(f.tipo==='caixa')return x===(c.valor==='1'||c.valor===true);return x===c.valor}
  return true})}
function auDest(t,k,a){const P=a.para||[],s=new Set();
  if(P.includes('responsavel'))s.add(k.resp);if(P.includes('solicitante'))s.add(k.solic);
  if(P.includes('executores'))(k.exec||[]).forEach(u=>s.add(u));if(P.includes('aprovadores'))(k.aprov||[]).forEach(u=>s.add(u));if(P.includes('acompanham'))(k.acomp||[]).forEach(u=>s.add(u));
  if(P.includes('gestor')&&k.resp)s.add(membro(k.resp).sup);(a.pessoas||[]).forEach(u=>s.add(u));
  return [...s].filter(u=>u&&vzPapel(t,k,u))}   // só avisa quem vê o cartão
function auAcoes(t,r,k,exec,ref){const feito=[];
  for(const a of r.acoes){
    if(a.tipo==='avisar'){const ds=auDest(t,k,a);ds.forEach(u=>notificar(u,'automacao',`${(a.texto||'').trim()||r.nome}: ${k.titulo}`,t,ref?exec:null,tkIr(k)));feito.push(`avisou ${ds.length} ${ds.length===1?'pessoa':'pessoas'}`)}
    else if(a.tipo==='mover'){const l=auLista(t,r,a.lista);if(!l)throw new Error(`O quadro não tem a lista ${a.lista}`);
      if(l.id!==k.lista){if(l.tipo==='conclui'&&!k.feita){const m=apBloqueio(t,k);if(m)throw new Error(m)}k.pos=Date.now();if(tkMover(t,k,l.id)===false)throw new Error('O cartão não pôde ir para '+l.nome);feito.push('moveu para '+l.nome)}}
    else if(a.tipo==='etiqueta'){const e=S.etiquetas.find(x=>x.id===a.v),tem=(k.etq||[]).includes(a.v);if(!e)throw new Error('Etiqueta não existe mais');
      if(a.por!==false&&!tem){k.etq=[...(k.etq||[]),a.v];feito.push('pôs a etiqueta '+e.nome)}else if(a.por===false&&tem){k.etq=k.etq.filter(x=>x!==a.v);feito.push('tirou a etiqueta '+e.nome)}}
    else if(a.tipo==='responsavel'){if(k.resp!==a.v){const antes={resp:k.resp};k.resp=a.v;vzAjustar(t,k);notifTarefa(t,k,antes);feito.push('trocou o responsável')}}
    else if(a.tipo==='prioridade'){if(k.prio!==a.v){k.prio=a.v;feito.push('prioridade '+OPT.prioTar[a.v].toLowerCase())}}
    else if(a.tipo==='adiar'){if(!k.feita){k.prazo=crSomar(k.prazo||HOJE,+a.dias);if(k.inicio&&k.inicio>k.prazo)k.inicio=k.prazo;if(k.inicio)k.dur=crDur(k.inicio,k.prazo);feito.push(`adiou o prazo em ${a.dias} dias`)}}
    else if(a.tipo==='checklist'){k.checklists.push({id:uid(),nome:a.nome,esconder:false,itens:(a.itens||[]).filter(x=>x.trim()).map(x=>({id:uid(),texto:x.trim(),resp:null,prazo:null,feito:null}))});feito.push('adicionou o checklist '+a.nome)}
    else if(a.tipo==='arquivar'){if(!k.arq){k.arq=HOJE;feito.push('arquivou')}}}
  return feito.join('; ')||'nada a mudar'}
function auExecutar(t,r,k,ref){const id=uid();let res='ok',det;UI.auRodando=true;
  try{det=auAcoes(t,r,k,id,ref)}catch(e){res='erro';det=e.message}finally{UI.auRodando=false}
  auExecs().unshift({id,aid:r.id,tid:t.id,kid:k.id,gat:r.gat,ref:ref||null,por:ref?null:me(),em:agora(),res,det});
  log(t,`Automação "${r.nome}" em ${k.codigo}: ${res==='ok'?det:'erro: '+det}`)}
/* o que aconteceu no cartão: roda as regras ligadas que passam nas condições */
function auEvento(t,k,gat,x={}){if(UI.auRodando||!k||k.modelo||k.arq)return 0;let n=0;
  const rs=auRegras().filter(r=>r.ativa&&r.gat===gat&&(!r.tid||r.tid===t.id)&&(!r.kid||r.kid===k.id)).sort((a,b)=>(a.tid?1:0)-(b.tid?1:0)||(a.kid?1:0)-(b.kid?1:0));
  for(const r of rs){if(k.arq)break;
    if(gat==='entrou_lista'&&r.gLista&&auLista(t,r,r.gLista)?.id!==x.lista)continue;
    if(gat==='etiqueta'&&r.gEtq&&r.gEtq!==x.etq)continue;
    if(gat==='campo'&&r.gCampo&&r.gCampo!==x.campo)continue;
    if(gat==='etapa'&&r.gEtapa&&r.gEtapa!==x.etapa)continue;
    if(x.ref&&auExecs().some(e=>e.aid===r.id&&e.kid===k.id&&e.ref===x.ref))continue;
    if(!auDonoVale(r)||(r.tid&&!vzPapel(t,k,r.dono))||!auCondOk(t,r,k))continue;
    auExecutar(t,r,k,x.ref);n++}
  return n}
/* rotina diária: prazo vencendo e vencido, uma vez por prazo */
function auRotina(){let n=0;(S.terrenos||[]).forEach(t=>(t.tarefas||[]).forEach(k=>{if(!k.prazo||k.feita||k.arq||k.modelo||(k.pausas||[]).some(z=>z.sit==='ativa'))return;
  const venc=k.prazo<HOJE;if(venc)n+=auEvento(t,k,'prazo_venceu',{ref:k.prazo});
  else auRegras().filter(r=>r.ativa&&r.gat==='prazo_antes'&&(!r.tid||r.tid===t.id)&&(!r.kid||r.kid===k.id)&&addD(k.prazo,-r.gDias)<=HOJE).forEach(r=>{
    if(auExecs().some(e=>e.aid===r.id&&e.kid===k.id&&e.ref===k.prazo)||!auDonoVale(r)||(r.tid&&!vzPapel(t,k,r.dono))||!auCondOk(t,r,k))return;auExecutar(t,r,k,k.prazo);n++})}));
  n+=auAgenda(HOJE);S.auDia=HOJE;return n}
/* a regra agendada roda hoje? mensal no dia 31 roda no último dia dos meses mais curtos (no banco: fluxo.agenda_hoje) */
function auAgendaHoje(r,d){const dt=new Date(d+'T12:00:00'),dia=dt.getDate(),ult=new Date(dt.getFullYear(),dt.getMonth()+1,0).getDate(),D=r.aDias||[];
  return r.aFreq==='diaria'||(r.aFreq==='semanal'&&D.includes(dt.getDay()))||(r.aFreq==='mensal'&&(D.includes(dia)||(dia===ult&&D.some(x=>x>dia))))}
/* rotina diária: regras agendadas para hoje, em cada cartão do escopo que passa nas condições, uma vez por dia */
function auAgenda(d){let n=0;auRegras().filter(r=>r.ativa&&r.gat==='agenda'&&auAgendaHoje(r,d)&&auDonoVale(r)).sort((a,b)=>(a.tid?1:0)-(b.tid?1:0)||(a.kid?1:0)-(b.kid?1:0)).forEach(r=>
  (S.terrenos||[]).filter(t=>!r.tid||r.tid===t.id).forEach(t=>(t.tarefas||[]).forEach(k=>{if(k.arq||k.modelo||(r.kid&&r.kid!==k.id))return;
    if(auExecs().some(e=>e.aid===r.id&&e.kid===k.id&&e.ref===d)||(r.tid&&!vzPapel(t,k,r.dono))||!auCondOk(t,r,k))return;auExecutar(t,r,k,d);n++})));
  return n}
/* botões do cartão: ligados, do escopo, com o dono valendo e as condições; só para quem edita o cartão (no banco: fluxo.botoes_cartao) */
function auBotoes(t,k){if(!k||k.arq||k.modelo||!vzEdita(t,k))return [];
  return auRegras().filter(r=>r.ativa&&r.gat==='botao'&&(!r.tid||r.tid===t.id)&&(!r.kid||r.kid===k.id)&&auDonoVale(r)&&(!r.tid||vzPapel(t,k,r.dono))&&auCondOk(t,r,k))
    .sort((a,b)=>(a.tid?1:0)-(b.tid?1:0)||(a.kid?1:0)-(b.kid?1:0)||a.nome.localeCompare(b.nome))}
function auBotoesHtml(t,k,ro){if(ro)return '';const B=auBotoes(t,k);if(!B.length)return '';
  return `<div class="tkm-bts" role="group" aria-label="Botões do cartão">${B.map(r=>`<button class="btn sm tkm-bt" data-a="au-botao" data-v="${r.id}" title="${esc(auFaca(r))}">${ic('raio',16)}${esc(r.nome)}</button>`).join('')}</div>`}

/* ganchos nas mudanças do cartão (no banco: os gatilhos t_auto) */
{const mover=tkMover;tkMover=function(t,k,lid,pos){const de=k.lista,fe=k.feita,r=mover(t,k,lid,pos);
  if(r!==false&&k.lista!==de){auEvento(t,k,'entrou_lista',{lista:k.lista});if(k.feita&&!fe)auEvento(t,k,'concluida')}return r}}
{const criar=tkCriar;tkCriar=function(t,d){const k=criar(t,d);auEvento(t,k,'criada');return k}}
/* regras do cartão vão junto na cópia e nas ocorrências da série (no banco: fluxo._copiar_automacoes); em outro quadro, a lista
   pelo nome, e a regra cuja lista não existe lá fica de fora; quem copia vira o dono, a série mantém o dono */
function auCopiarCartao(t,k,dest,n,dono){const ml=id=>{if(!id)return '';if(dest.id===t.id)return id;const l=tkL(t).find(x=>x.id===id);return l?tkL(dest).find(x=>auNomeL(x.nome)===auNomeL(l.nome))?.id||null:null};
  auDoCartao(k).forEach(r=>{const c=JSON.parse(JSON.stringify(r));c.id=uid();c.tid=dest.id;c.kid=n.id;c.dono=dono||r.dono;c.em=agora();
    if(c.gLista&&!(c.gLista=ml(c.gLista)))return;let ok=true;
    c.conds.forEach(x=>{if(x.tipo==='lista'){x.v=(x.v||[]).map(ml);if(x.v.some(v=>!v))ok=false}});
    c.acoes.forEach(x=>{if(x.tipo==='mover'&&!(x.lista=ml(x.lista)))ok=false});
    if(ok&&vzNiv(vzPapel(dest,n,c.dono))>=3)auRegras().push(c)})}
{const copiar=cxCopiar;cxCopiar=function(...a){const n=copiar(...a);if(n){if(a[5].includes('automacoes'))auCopiarCartao(a[0],a[1],a[2],n,me());auEvento(a[2],n,'criada')}return n}}
{const ocorr=rcCopiar;rcCopiar=function(t,k,r,data){const n=ocorr(t,k,r,data);if(n)auCopiarCartao(t,k,t,n,null);return n}}
{const gravar=cpoGravar;cpoGravar=function(t,k,c,raw){const r=gravar(t,k,c,raw);if(r)auEvento(t,k,'campo',{campo:c.id});return r}}
function auItemFeito(t,k){const its=(k.checklists||[]).flatMap(c=>c.itens).filter(i=>!i.virou);if(its.length&&its.every(i=>i.feito))auEvento(t,k,'checklist_completo')}

/* ---------- frases ---------- */
function auQuando(r){const g=AU_GAT[r.gat];
  if(r.gat==='entrou_lista')return r.gLista?`Quando o cartão entrar em ${auNomeLista(r,r.gLista)}`:'Quando o cartão mudar de lista';
  if(r.gat==='etiqueta')return r.gEtq?`Quando puserem a etiqueta ${S.etiquetas.find(e=>e.id===r.gEtq)?.nome||'?'}`:'Quando puserem uma etiqueta';
  if(r.gat==='campo')return r.gCampo?`Quando mudar o campo ${cpoCampos().find(c=>c.id===r.gCampo)?.nome||'?'}`:'Quando mudar um campo personalizado';
  if(r.gat==='botao')return 'Ao apertar o botão no cartão';
  if(r.gat==='agenda')return auQuandoAgenda(r);
  if(r.gat==='prazo_antes')return r.gDias?`Quando faltarem ${r.gDias} ${r.gDias===1?'dia':'dias'} para o prazo`:'No dia do prazo';
  return {criada:'Quando o cartão for criado',concluida:'Quando a tarefa for concluída',checklist_completo:'Quando o checklist ficar completo',prazo_venceu:'Quando o prazo vencer'}[r.gat]||g}
const AU_SEM=['domingo','segunda','terça','quarta','quinta','sexta','sábado'];
const auE=a=>a.length>1?a.slice(0,-1).join(', ')+' e '+a[a.length-1]:a[0]||'?';
function auQuandoAgenda(r){const D=[...(r.aDias||[])].sort((a,b)=>a-b);
  if(r.aFreq==='semanal')return D.length===7?'Todo dia':'Toda '+auE(D.map(d=>AU_SEM[d]));
  if(r.aFreq==='mensal')return `Todo dia ${auE(D.map(String))} do mês`;return 'Todo dia'}
function auSe(r){return (r.conds||[]).map(c=>{
  if(c.tipo==='lista')return `está em ${(c.v||[]).map(v=>auNomeLista(r,v)).join(' ou ')||'?'}`;
  if(c.tipo==='etiqueta')return `${c.tem===false?'não tem':'tem'} a etiqueta ${S.etiquetas.find(e=>e.id===c.v)?.nome||'?'}`;
  if(c.tipo==='situacao')return (c.v||[]).map(v=>AU_SIT[v].toLowerCase()).join(' ou ')||'?';
  if(c.tipo==='prioridade')return `prioridade ${(c.v||[]).map(p=>OPT.prioTar[p].toLowerCase()).join(' ou ')||'?'}`;
  const f=cpoCampos().find(y=>y.id===c.campo),n=f?.nome||'?';
  return c.op==='vazio'?`${n} não informado`:c.op==='preenchido'?`${n} preenchido`:`${n} igual a ${f?cpoTxt(f,f.tipo==='caixa'?c.valor==='1':f.tipo==='numero'?cpoNum(String(c.valor)):c.valor):c.valor}`}).join(' e ')}
function auFaca(r){return r.acoes.map(a=>{
  if(a.tipo==='avisar'){const q=[...(a.para||[]).map(p=>AU_PARA[p].toLowerCase()),...(a.pessoas||[])];return 'avisar '+(q.join(', ')||'?')}
  if(a.tipo==='mover')return 'mover para '+auNomeLista(r,a.lista);
  if(a.tipo==='etiqueta')return `${a.por===false?'tirar':'pôr'} a etiqueta ${S.etiquetas.find(e=>e.id===a.v)?.nome||'?'}`;
  if(a.tipo==='responsavel')return 'responsável: '+(a.v||'?');if(a.tipo==='prioridade')return 'prioridade '+OPT.prioTar[a.v].toLowerCase();
  if(a.tipo==='adiar')return `adiar o prazo em ${a.dias} dias`;if(a.tipo==='checklist')return `adicionar o checklist ${a.nome}`;return 'arquivar'}).join('; ')}
const auFrase=r=>`${auQuando(r)}${r.conds?.length?', se '+auSe(r):''}: ${auFaca(r)}.`;

/* ---------- telas ---------- */
function auLinha(r,origem=''){const pode=auPodeMudar(r),ex=auExecs().filter(x=>x.aid===r.id),err=ex.filter(x=>x.res==='erro').length;
  return `<div class="au-r ${r.ativa?'':'off'}"><div class="au-rt"><b>${esc(r.nome)}</b>${origem}${r.ativa?'':' <span class="chip">Desligada</span>'}</div>
    <div class="au-f">${esc(auFrase(r))}</div>
    <div class="au-rm faint">${esc(r.dono)}${!auDonoVale(r)?' · <span class="au-err">o dono não pode mais ter a regra: ela não roda</span>':''} · ${ex.length?`<button class="linkbtn" data-a="au-exec" data-v="${r.id}">rodou ${ex.length} ${ex.length===1?'vez':'vezes'}${err?`, ${err} com erro`:''}</button>`:'ainda não rodou'}</div>
    ${pode?`<div class="au-ra"><label class="chk au-liga"><input type="checkbox" data-au-liga="${r.id}" ${r.ativa?'checked':''}><span>Ligada</span></label>
      <button class="btn text sm" data-a="au-editar" data-v="${r.id}">Editar</button>${auRodou(r)?'':`<button class="btn text sm" data-a="au-apagar" data-v="${r.id}">Apagar</button>`}</div>`:''}</div>`}
function auRegrasHtml(fechar){const t=T(UI.auQ?.tid);if(!t)return '';const D=auDoQuadro(t),E=auDaEmpresa();
  return `<div class="dh"><div><h2>Automações</h2><div class="muted" style="margin-top:4px">${t.codigo} · ${esc(t.nome)}. Quando acontecer algo num cartão, a regra faz o resto.</div></div>${fechar}</div>
  <div class="au-gh"><h3>Deste quadro</h3>${tkEd()?`<button class="btn text sm" data-a="au-nova" data-v="${t.id}">${ic('add',16)}Nova regra</button>`:''}</div>
  ${D.map(auLinha).join('')||'<p class="faint">Nenhuma regra neste quadro.</p>'}
  ${E.length?`<div class="au-gh"><h3>Da empresa</h3><span class="faint">valem em todos os quadros${ehAdmin(me())?'':' · o administrador muda em Configurações'}</span></div>${E.map(auLinha).join('')}`:''}
  <div class="df"><button class="btn primary" data-a="close">Pronto</button></div>`}
function auCfgHtml(){if(!ehAdmin(me()))return '';const E=auDaEmpresa();
  return `<section class="sec"><div class="sec-h"><h2>Automações da empresa</h2><button class="btn text sm" data-a="au-nova" data-v="">${ic('add',16)}Nova regra</button></div><div class="sec-b">
    <p class="muted" style="margin-top:0">Valem em todos os quadros; as listas são pelo nome. Quem edita um terreno cria as regras do quadro dele.</p>
    ${E.map(auLinha).join('')||'<p class="faint">Nenhuma regra da empresa.</p>'}</div></section>`}
function auExecHtml(fechar){const r=auRegras().find(x=>x.id===UI.auExec);if(!r)return '';const ex=auExecs().filter(x=>x.aid===r.id).slice(0,50);
  return `<div class="dh"><div><h2>${esc(r.nome)}</h2><div class="muted" style="margin-top:4px">Execuções, da mais recente à mais antiga</div></div>${fechar}</div>
  <div class="au-ex">${ex.map(x=>{const {t,k}=tkAcha(x.tid,x.kid);return `<div class="au-exr"><span class="chip ${x.res==='ok'?'st-ok':'st-crit'}">${x.res==='ok'?'Ok':'Erro'}</span>
    <div><div>${k?`<button class="linkbtn" data-a="tk-abrir" data-id="${t.id}" data-tk="${k.id}">${k.codigo} · ${esc(k.titulo)}</button>`:'(cartão indisponível)'}</div>
    <div class="faint">${esc(x.det)} · ${fdh(x.em)} · ${x.por?esc(x.por):'rotina diária'}</div></div></div>`}).join('')||'<p class="faint">Ainda não rodou.</p>'}</div>
  <div class="df"><button class="btn text" data-a="${UI.auQ||UI.auK?'au-voltar':'close'}">${UI.auQ||UI.auK?'Voltar':'Fechar'}</button></div>`}

/* editor: rascunho em UI.auEd */
function auNovaRegra(tid,kid){return {id:null,nome:'',tid:tid||null,kid:kid||null,gat:'entrou_lista',gLista:'',gEtq:'',gCampo:'',gDias:2,conds:[],acoes:[{tipo:'avisar',para:['responsavel'],pessoas:[],texto:''}],ativa:true,dono:me()}}
function auSelLista(r,sel,attr,multi){const t=r.tid?T(r.tid):null,L=t?tkL(t).filter(l=>l.tipo!=='pausa'||attr.includes('cond')):(S.listasModelo||[]).filter(l=>l.ativo);
  const val=l=>r.tid?l.id:l.nome;const has=v=>multi?(sel||[]).includes(v):sel===v;
  return multi?`<span class="au-chks">${L.map(l=>`<label class="chk"><input type="checkbox" ${attr} value="${esc(val(l))}" ${has(val(l))?'checked':''}>${esc(l.nome)}</label>`).join('')}</span>`
    :`<select class="tkm-pill" ${attr}>${multi?'':''}${L.map(l=>`<option value="${esc(val(l))}" ${has(val(l))?'selected':''}>${esc(l.nome)}</option>`).join('')}</select>`}
const auOpts=(o,sel,vazio)=>(vazio!=null?`<option value="">${vazio}</option>`:'')+Object.entries(o).map(([v,n])=>`<option value="${esc(v)}" ${v===sel?'selected':''}>${esc(n)}</option>`).join('');
const auEtqs=()=>Object.fromEntries(S.etiquetas.map(e=>[e.id,e.nome]));
const auPessoas=()=>Object.fromEntries((S.membros||[]).filter(m=>m.papel!=='leitura').map(m=>[m.nome,m.nome]));
function auGatParam(r){
  if(r.gat==='entrou_lista')return `<span class="au-lbl">Lista</span><select class="tkm-pill" data-au="gLista"><option value="">Qualquer lista</option>${(r.tid?tkL(T(r.tid)):(S.listasModelo||[]).filter(l=>l.ativo)).map(l=>{const v=r.tid?l.id:l.nome;return `<option value="${esc(v)}" ${v===r.gLista?'selected':''}>${esc(l.nome)}</option>`}).join('')}</select>`;
  if(r.gat==='etiqueta')return `<span class="au-lbl">Etiqueta</span><select class="tkm-pill" data-au="gEtq">${auOpts(auEtqs(),r.gEtq,'Qualquer etiqueta')}</select>`;
  if(r.gat==='campo')return `<span class="au-lbl">Campo</span><select class="tkm-pill" data-au="gCampo">${auOpts(Object.fromEntries(cpoAtivos().map(c=>[c.id,c.nome])),r.gCampo,'Qualquer campo')}</select>`;
  if(r.gat==='agenda'){const f=r.aFreq||'semanal',D=r.aDias||[];
    return `<select class="tkm-pill" data-au="aFreq" aria-label="Frequência">${auOpts(AU_FREQ,f)}</select>${f==='semanal'?`<span class="au-chks">${AU_SEM.map((n,i)=>`<label class="chk"><input type="checkbox" data-au-dia value="${i}" ${D.includes(i)?'checked':''}>${n.slice(0,3)}</label>`).join('')}</span>`
      :f==='mensal'?`<span class="au-lbl">Dias</span><input class="tkm-pill au-dm" data-au="aDiasTx" value="${esc(D.join(', '))}" placeholder="1, 15" aria-label="Dias do mês"><span class="faint">o 31 roda no último dia dos meses mais curtos</span>`:''}`}
  if(r.gat==='botao')return '<span class="faint">quem edita o cartão vê o botão e aperta</span>';
  if(r.gat==='prazo_antes')return `<span class="au-lbl">Dias antes</span><input class="tkm-pill au-n" type="number" min="0" max="60" data-au="gDias" value="${r.gDias??2}" aria-label="Dias antes do prazo">`;
  return ''}
function auCondHtml(r,c,i){const x=`data-auc="${i}"`;let h='';
  if(c.tipo==='lista')h=auSelLista(r,c.v,`data-auc="${i}" data-k="v" data-cond`,true);
  else if(c.tipo==='etiqueta')h=`<select class="tkm-pill" ${x} data-k="tem"><option value="1" ${c.tem!==false?'selected':''}>tem</option><option value="0" ${c.tem===false?'selected':''}>não tem</option></select><select class="tkm-pill" ${x} data-k="v">${auOpts(auEtqs(),c.v)}</select>`;
  else if(c.tipo==='situacao')h=`<span class="au-chks">${Object.entries(AU_SIT).map(([v,n])=>`<label class="chk"><input type="checkbox" ${x} data-k="v" value="${v}" ${(c.v||[]).includes(v)?'checked':''}>${n}</label>`).join('')}</span>`;
  else if(c.tipo==='prioridade')h=`<span class="au-chks">${Object.entries(OPT.prioTar).map(([v,n])=>`<label class="chk"><input type="checkbox" ${x} data-k="v" value="${v}" ${(c.v||[]).includes(v)?'checked':''}>${n}</label>`).join('')}</span>`;
  else{const f=cpoCampos().find(y=>y.id===c.campo);h=`<select class="tkm-pill" ${x} data-k="campo">${auOpts(Object.fromEntries(cpoAtivos().map(y=>[y.id,y.nome])),c.campo)}</select>
    <select class="tkm-pill" ${x} data-k="op">${auOpts({igual:'igual a',vazio:'não informado',preenchido:'preenchido'},c.op||'igual')}</select>
    ${(c.op||'igual')==='igual'&&f?(f.tipo==='lista'?`<select class="tkm-pill" ${x} data-k="valor">${auOpts(Object.fromEntries((f.opcoes||[]).filter(o=>o.ativo!==false).map(o=>[o.id,o.nome])),c.valor)}</select>`
      :f.tipo==='caixa'?`<select class="tkm-pill" ${x} data-k="valor">${auOpts({'1':'Sim','0':'Não'},c.valor)}</select>`
      :`<input class="tkm-pill" ${x} data-k="valor" ${f.tipo==='data'?'type="date"':''} value="${esc(c.valor??'')}" aria-label="Valor">`):''}`}
  return `<div class="au-it"><span class="au-lbl">${AU_COND[c.tipo]}</span>${h}<button class="iconbtn sm" data-a="au-tira" data-k="conds" data-v="${i}" aria-label="Tirar condição" title="Tirar">${ic('close',16)}</button></div>`}
function auAcaoHtml(r,a,i){const x=`data-aua="${i}"`;let h='';
  if(a.tipo==='avisar')h=`<span class="au-chks">${Object.entries(AU_PARA).map(([v,n])=>`<label class="chk"><input type="checkbox" ${x} data-k="para" value="${v}" ${(a.para||[]).includes(v)?'checked':''}>${n}</label>`).join('')}</span>
    <span class="au-chks">${(a.pessoas||[]).map(p=>`<span class="cpo-op"><span class="chip">${esc(p)}</span><button class="iconbtn sm" data-a="au-tirap" data-i="${i}" data-v="${esc(p)}" aria-label="Tirar ${esc(p)}">${ic('close',14)}</button></span>`).join('')}
    <select class="tkm-pill" ${x} data-k="pessoa">${auOpts(auPessoas(),'','+ Pessoa')}</select></span>
    <input class="tkm-pill au-tx" ${x} data-k="texto" value="${esc(a.texto||'')}" placeholder="Texto do aviso (padrão: o nome da regra)" aria-label="Texto do aviso">`;
  else if(a.tipo==='mover')h=auSelLista(r,a.lista,`data-aua="${i}" data-k="lista"`,false);
  else if(a.tipo==='etiqueta')h=`<select class="tkm-pill" ${x} data-k="por"><option value="1" ${a.por!==false?'selected':''}>pôr</option><option value="0" ${a.por===false?'selected':''}>tirar</option></select><select class="tkm-pill" ${x} data-k="v">${auOpts(auEtqs(),a.v)}</select>`;
  else if(a.tipo==='responsavel')h=`<select class="tkm-pill" ${x} data-k="v">${auOpts(auPessoas(),a.v)}</select>`;
  else if(a.tipo==='prioridade')h=`<select class="tkm-pill" ${x} data-k="v">${auOpts(OPT.prioTar,a.v)}</select>`;
  else if(a.tipo==='adiar')h=`<input class="tkm-pill au-n" type="number" min="1" max="365" ${x} data-k="dias" value="${a.dias||1}" aria-label="Dias"><span class="faint">${crUteis()?'dias úteis':'dias'}</span>`;
  else if(a.tipo==='checklist')h=`<input class="tkm-pill" ${x} data-k="nome" value="${esc(a.nome||'')}" placeholder="Nome do checklist" aria-label="Nome do checklist"><textarea class="tkm-pill au-tx" ${x} data-k="itens" rows="2" placeholder="Um item por linha" aria-label="Itens">${esc((a.itens||[]).join('\n'))}</textarea>`;
  return `<div class="au-it"><span class="au-lbl">${AU_ACAO[a.tipo]}</span>${h}<button class="iconbtn sm" data-a="au-tira" data-k="acoes" data-v="${i}" aria-label="Tirar ação" title="Tirar">${ic('close',16)}</button></div>`}
function auEdHtml(fechar){const r=UI.auEd;if(!r)return '';
  return `<div class="dh"><div><h2>${r.id?'Editar regra':'Nova regra'}</h2><div class="muted" style="margin-top:4px">${r.kid?`Só no cartão ${esc(tkAcha(r.tid,r.kid).k?.codigo||'')}`:r.tid?`Quadro de ${esc(T(r.tid).codigo)}`:'Empresa toda'} · dono: ${esc(r.dono)}</div></div>${fechar}</div>
  <form class="au-ed" data-form="au-salvar">
    <div class="field full"><label for="au-nome">Nome</label><input id="au-nome" data-au="nome" value="${esc(r.nome)}" required placeholder="Ex.: Avisar o gestor quando entrar em Aguardando retorno"></div>
    <div class="au-bl"><h3>Quando</h3><div class="au-it"><select class="tkm-pill" data-au="gat" aria-label="Quando">${auOpts(r.kid?Object.fromEntries(Object.entries(AU_GAT).filter(([g])=>g!=='criada')):AU_GAT,r.gat)}</select>${auGatParam(r)}</div></div>
    <div class="au-bl"><h3>Se <span class="faint">(${r.gat==='agenda'?'pelo menos uma: diz em que cartões a regra roda':r.gat==='botao'?'opcional: o botão só aparece nos cartões que passam':'opcional'}; todas valem juntas)</span></h3>${r.conds.map((c,i)=>auCondHtml(r,c,i)).join('')}
      <select class="tkm-pill au-add" data-au-add="conds" aria-label="Adicionar condição">${auOpts(AU_COND,'','Adicionar condição…')}</select></div>
    <div class="au-bl"><h3>Faça</h3>${r.acoes.map((a,i)=>auAcaoHtml(r,a,i)).join('')}
      <select class="tkm-pill au-add" data-au-add="acoes" aria-label="Adicionar ação">${auOpts(AU_ACAO,'','Adicionar ação…')}</select></div>
    <div class="au-prev"><span class="faint">Resumo:</span> ${esc(auFrase(r))}</div>
    <div class="df"><button class="btn text" type="button" data-a="${UI.auQ||UI.auK?'au-voltar':'close'}">Cancelar</button><button class="btn primary" type="submit">Salvar regra</button></div></form>`}
function auModal(M,fechar){if(M==='au-regras')return auRegrasHtml(fechar);if(M==='au-ed')return auEdHtml(fechar);if(M==='au-exec')return auExecHtml(fechar);return ''}
/* o que falta na regra (no banco: fluxo.tg_automacao) */
function auValida(r){if(!r.nome.trim())return 'Dê um nome à regra.';if(r.kid&&r.gat==='criada')return 'Regra do cartão não usa "cartão criado": o cartão já existe.';if(!r.acoes.length)return 'A regra precisa de pelo menos uma ação.';
  if(r.gat==='prazo_antes'&&(r.gDias==null||r.gDias<0||r.gDias>60))return 'Dias antes do prazo: de 0 a 60.';
  if(r.gat==='agenda'){if(r.aFreq!=='diaria'&&!(r.aDias||[]).length)return 'Marque os dias em que a regra roda.';
    if(r.aFreq==='mensal'&&r.aDias.some(d=>!(d>=1&&d<=31)))return 'Dia do mês de 1 a 31.';if(!r.conds.length)return 'Regra agendada precisa de pelo menos uma condição, para dizer em que cartões roda.'}
  for(const c of r.conds){if(c.tipo==='lista'&&!(c.v||[]).length)return 'Marque a lista da condição.';if(c.tipo==='prioridade'&&!(c.v||[]).length)return 'Marque a prioridade da condição.';if(c.tipo==='situacao'&&!(c.v||[]).length)return 'Marque a situação da condição.';
    if(c.tipo==='campo'&&(!c.campo||((c.op||'igual')==='igual'&&(c.valor==null||c.valor==='')))) return 'Complete a condição do campo.'}
  for(const a of r.acoes){if(a.tipo==='avisar'&&!(a.para||[]).length&&!(a.pessoas||[]).length)return 'Diga quem a regra avisa.';
    if(a.tipo==='checklist'&&(!a.nome?.trim()||!(a.itens||[]).some(x=>x.trim())))return 'O checklist precisa de nome e itens.';
    if(a.tipo==='adiar'&&!(a.dias>=1&&a.dias<=365))return 'Adiar de 1 a 365 dias.'}
  return null}
const auNovaCond=(r,tipo)=>({situacao:{tipo,v:['aberta']},lista:{tipo,v:[]},etiqueta:{tipo,v:S.etiquetas[0]?.id,tem:true},prioridade:{tipo,v:['alta']},campo:{tipo,campo:cpoAtivos()[0]?.id,op:'igual',valor:''}}[tipo]);
function auNovaAcao(r,tipo){const L=r.tid?tkL(T(r.tid)).filter(l=>l.tipo!=='pausa'):(S.listasModelo||[]).filter(l=>l.ativo&&l.tipo!=='pausa');
  return {avisar:{tipo,para:['responsavel'],pessoas:[],texto:''},mover:{tipo,lista:L[0]?(r.tid?L[0].id:L[0].nome):''},etiqueta:{tipo,v:S.etiquetas[0]?.id,por:true},
    responsavel:{tipo,v:Object.keys(auPessoas())[0]},prioridade:{tipo,v:'alta'},adiar:{tipo,dias:3},checklist:{tipo,nome:'',itens:[]},arquivar:{tipo}}[tipo]}

document.addEventListener('click',e=>{const a=e.target.closest('[data-a^="au-"]');if(!a)return;e.preventDefault();e.stopImmediatePropagation();const A=a.dataset.a,v=a.dataset.v;
  if(A==='au-botao'){const {t,k}=tkAtual();const r=auRegras().find(x=>x.id===v);if(!k||!r)return;
    if(!auBotoes(t,k).includes(r)){toast('Este botão não vale para este cartão.',true);return}
    auExecutar(t,r,k);const x=auExecs()[0];toast(x.res==='ok'?`${r.nome}: ${x.det}.`:`${r.nome}: erro: ${x.det}`,x.res!=='ok');save();renderModal();render();return}
  if(A==='au-abrir'){UI.auK=null;UI.auQ={tid:v};UI.modal='au-regras';renderModal();return}
  if(A==='au-nova'){if(a.dataset.k){UI.auK={tid:v,kid:a.dataset.k};UI.auQ=null}else if(!UI.auQ)UI.auK=null;UI.auEd=auNovaRegra(v||null,a.dataset.k);if(a.dataset.k)UI.auEd.gat='concluida';UI.modal='au-ed';renderModal();return}
  if(A==='au-editar'){const r=auRegras().find(x=>x.id===v);if(!r||!auPodeMudar(r))return;if(UI.modal==='tarefa'){UI.auK={...UI.tkSel};UI.auQ=null}UI.auEd=JSON.parse(JSON.stringify(r));UI.modal='au-ed';renderModal();return}
  if(A==='au-exec'){if(UI.modal==='tarefa'){UI.auK={...UI.tkSel};UI.auQ=null}UI.auExec=v;UI.modal='au-exec';renderModal();return}
  if(A==='au-voltar'){UI.auEd=null;UI.auExec=null;if(UI.auK){UI.tkSel=UI.auK;UI.auK=null;UI.modal='tarefa'}else UI.modal=UI.auQ?'au-regras':null;renderModal();return}
  if(A==='au-apagar'){const r=auRegras().find(x=>x.id===v);if(!r||!auPodeMudar(r))return;if(auRodou(r)){toast('A regra já rodou: desligue em vez de apagar.',true);return}
    if(!confirm(`Apagar a regra "${r.nome}"?`))return;S.automacoes=auRegras().filter(x=>x!==r);save();if(UI.modal)renderModal();else render();return}
  const r=UI.auEd;if(!r)return;
  if(A==='au-tira'){r[a.dataset.k].splice(+v,1);renderModal();return}
  if(A==='au-tirap'){const x=r.acoes[+a.dataset.i];x.pessoas=(x.pessoas||[]).filter(p=>p!==v);renderModal();return}},true);
document.addEventListener('change',e=>{const el=e.target;
  if(el.dataset?.auLiga){e.stopImmediatePropagation();const r=auRegras().find(x=>x.id===el.dataset.auLiga);if(!r||!auPodeMudar(r))return;r.ativa=el.checked;
    if(r.tid)log(T(r.tid),`Automação "${r.nome}" ${r.ativa?'ligada':'desligada'}`);save();if(UI.modal)renderModal();else render();return}
  const r=UI.auEd;if(!r)return;
  if(el.dataset.auDia!=null){e.stopImmediatePropagation();const s=new Set(r.aDias||[]);el.checked?s.add(+el.value):s.delete(+el.value);r.aDias=[...s].sort((a,b)=>a-b);renderModal();return}
  if(el.dataset.au==='aDiasTx'){e.stopImmediatePropagation();r.aDias=el.value.split(/[^0-9]+/).filter(Boolean).map(Number);const pv=el.closest('form')?.querySelector('.au-prev');if(pv)pv.innerHTML=`<span class="faint">Resumo:</span> ${esc(auFrase(r))}`;return}   // sem redesenhar: o foco segue para o próximo campo
  if(el.dataset.au){e.stopImmediatePropagation();const k=el.dataset.au;r[k]=k==='gDias'?(el.value===''?null:+el.value):el.value;
    if(k==='gat'&&r.gat==='agenda'&&!r.aFreq){r.aFreq='semanal';r.aDias=[1];if(!r.conds.length)r.conds.push(auNovaCond(r,'situacao'))}
    if(k==='aFreq')r.aDias=r.aFreq==='semanal'?[1]:r.aFreq==='mensal'?[1]:null;
    if(k!=='nome')renderModal();return}
  if(el.dataset.auAdd){e.stopImmediatePropagation();if(!el.value)return;const g=el.dataset.auAdd;r[g].push(g==='conds'?auNovaCond(r,el.value):auNovaAcao(r,el.value));renderModal();return}
  const ci=el.dataset.auc,ai=el.dataset.aua;if(ci==null&&ai==null)return;e.stopImmediatePropagation();
  const o=ci!=null?r.conds[+ci]:r.acoes[+ai],k=el.dataset.k;
  if(el.type==='checkbox'){const arr=new Set(o[k]||[]);el.checked?arr.add(el.value):arr.delete(el.value);o[k]=[...arr]}
  else if(k==='pessoa'){if(el.value)o.pessoas=[...new Set([...(o.pessoas||[]),el.value])]}
  else if(k==='tem'||k==='por')o[k]=el.value==='1';
  else if(k==='dias')o.dias=+el.value;
  else if(k==='itens')o.itens=el.value.split('\n');
  else{o[k]=el.value;if(k==='campo'){o.valor=''}}
  if(k!=='texto'&&k!=='nome'&&k!=='itens'&&k!=='valor')renderModal()},true);
document.addEventListener('input',e=>{const el=e.target,r=UI.auEd;if(!r)return;if(el.dataset?.au==='nome'){r.nome=el.value;return}
  const ai=el.dataset?.aua;if(ai!=null&&(el.dataset.k==='texto'||el.dataset.k==='nome'))r.acoes[+ai][el.dataset.k]=el.value;
  if(ai!=null&&el.dataset.k==='itens')r.acoes[+ai].itens=el.value.split('\n')},true);
document.addEventListener('submit',e=>{const f=e.target;if(f.dataset?.form!=='au-salvar')return;e.preventDefault();e.stopImmediatePropagation();const r=UI.auEd;if(!r)return;
  r.nome=(f.querySelector('#au-nome')?.value||r.nome).trim();r.acoes.forEach(a=>{if(a.tipo==='checklist')a.itens=(a.itens||[]).map(x=>x.trim()).filter(Boolean)});
  const m=auValida(r);if(m){toast(m,true);return}
  if(r.gat!=='agenda'){r.aFreq=null;r.aDias=null}else if(r.aFreq==='diaria')r.aDias=null;else r.aDias=[...new Set(r.aDias)].sort((a,b)=>a-b);
  if(r.gat!=='entrou_lista')r.gLista='';if(r.gat!=='etiqueta')r.gEtq='';if(r.gat!=='campo')r.gCampo='';if(r.gat!=='prazo_antes')r.gDias=null;if(r.gat!=='etapa')r.gEtapa='';
  if(r.id){const i=auRegras().findIndex(x=>x.id===r.id);if(i>=0)auRegras()[i]=r}else{r.id=uid();r.em=agora();auRegras().push(r)}
  if(r.tid)log(T(r.tid),`Automação "${r.nome}"${r.kid?` em ${tkAcha(r.tid,r.kid).k?.codigo}`:''} salva`);UI.auEd=null;save();toast('Regra salva.');
  if(UI.auK){UI.tkSel=UI.auK;UI.auK=null;UI.modal='tarefa';renderModal();render()}else if(UI.auQ){UI.modal='au-regras';renderModal()}else{UI.modal=null;renderModal();render()}},true);

/* exemplos: uma regra no primeiro terreno e uma da empresa */
(()=>{if(S.auExemplo)return;S.auExemplo=true;const t=S.terrenos?.[0];if(!t)return;const L=tkL(t),ag=L.find(l=>l.nome==='Aguardando retorno');
  if(ag)auRegras().push({id:uid(),nome:'Aguardando retorno avisa o gestor',tid:t.id,gat:'entrou_lista',gLista:ag.id,gEtq:'',gCampo:'',gDias:null,conds:[],
    acoes:[{tipo:'avisar',para:['gestor'],pessoas:[],texto:'Aguardando retorno'},{tipo:'adiar',dias:3}],ativa:true,dono:'Ana Prado',em:agora()});
  const urg=S.etiquetas.find(e=>e.nome==='Urgente');
  if(urg)auRegras().push({id:uid(),nome:'Urgente sobe a prioridade',tid:null,gat:'etiqueta',gLista:'',gEtq:urg.id,gCampo:'',gDias:null,conds:[],acoes:[{tipo:'prioridade',v:'alta'}],ativa:true,dono:'Moisés',em:agora()});
  auRegras().push({id:uid(),nome:'Prazo em 2 dias',tid:null,gat:'prazo_antes',gLista:'',gEtq:'',gCampo:'',gDias:2,conds:[],acoes:[{tipo:'avisar',para:['responsavel'],pessoas:[],texto:'Vence em 2 dias'}],ativa:true,dono:'Moisés',em:agora()});})();
/* exemplos do bloco 5b: um botão no primeiro terreno e um agendamento da empresa */
(()=>{if(S.auExemplo5b)return;S.auExemplo5b=true;const t=S.terrenos?.[0];if(!t)return;const ag=tkL(t).find(l=>l.nome==='Aguardando retorno');
  if(ag)auRegras().push({id:uid(),nome:'Cobrar retorno',tid:t.id,gat:'botao',gLista:'',gEtq:'',gCampo:'',gDias:null,conds:[{tipo:'situacao',v:['aberta']}],
    acoes:[{tipo:'mover',lista:ag.id},{tipo:'adiar',dias:3}],ativa:true,dono:'Ana Prado',em:agora()});
  auRegras().push({id:uid(),nome:'Atrasadas toda segunda',tid:null,gat:'agenda',aFreq:'semanal',aDias:[1],gLista:'',gEtq:'',gCampo:'',gDias:null,conds:[{tipo:'situacao',v:['atrasada']}],
    acoes:[{tipo:'avisar',para:['responsavel','gestor'],pessoas:[],texto:'Tarefa atrasada'}],ativa:true,dono:'Moisés',em:agora()})})();
if(S.auDia!==HOJE){auRotina();save()}
