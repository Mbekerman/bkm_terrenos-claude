/* =====================================================================
   Fases acima das etapas (no banco: fases_modelo, fase_dependencias,
   processos.fase, app._abrir_fases_liberadas, app.abrir_fase). Cada fase é
   um processo do terreno; a de entrada (Novos Negócios) é a negociação de
   sempre (t.neg); as outras ficam em t.procs. Injetado no mesmo escopo.
   ===================================================================== */
const etx=(L)=>L.map(([k,nome,sla,subs])=>({k,nome,sla,subs:subs.map(([k,nome])=>({k,nome}))}));
const FASES_PADRAO=()=>[
  {k:'novos_negocios',nome:'Novos Negócios',prefixo:'NEG',entrada:true,ativo:true,conc:'Comprado',descarta:true},
  {k:'aprovacao',nome:'Aprovação de Projetos',prefixo:'APR',ativo:true,conc:'Aprovado',descarta:true,etapas:etx([
    ['projeto','Projeto',60,[['estudo_implantacao','Estudo de Implantação'],['projeto_legal','Projeto Legal']]],
    ['prefeitura','Análise na Prefeitura',120,[['protocolado','Protocolado'],['comunique_se','Comunique-se']]],
    ['alvaras','Alvarás',30,[['alvara_aprovacao','Alvará de Aprovação'],['alvara_execucao','Alvará de Execução']]]])},
  {k:'incorporacao',nome:'Registro de Incorporação',prefixo:'INC',ativo:true,conc:'Incorporação registrada',descarta:true,etapas:etx([
    ['memorial','Memorial e Certidões',30,[['memorial_incorporacao','Memorial de Incorporação'],['certidoes','Certidões']]],
    ['cartorio','Cartório',45,[['prenotado','Prenotado'],['exigencias','Exigências do Cartório']]]])},
  {k:'caixa',nome:'Contratação Caixa',prefixo:'CEF',ativo:true,conc:'Contratado',descarta:true,etapas:etx([
    ['analise','Análise Caixa',60,[['engenharia','Engenharia'],['juridico','Jurídico'],['risco','Risco']]],
    ['contratacao','Contratação',30,[['demanda_minima','Demanda Mínima'],['assinatura','Assinatura']]]])},
  {k:'lancamento',nome:'Lançamento',prefixo:'LAN',ativo:true,conc:'Lançado',descarta:true,etapas:etx([
    ['preparacao','Preparação',60,[['produto','Produto e Tabela'],['stand','Stand e Decorado']]],
    ['vendas','Vendas Iniciais',60,[['evento','Evento de Lançamento'],['vendas_iniciais','Vendas Iniciais']]]])},
  {k:'obras',nome:'Obras',prefixo:'OBR',ativo:true,conc:'Obra entregue',descarta:true,etapas:etx([
    ['inicio','Início',60,[['mobilizacao','Mobilização'],['fundacao','Fundação']]],
    ['execucao','Execução',540,[['estrutura','Estrutura'],['vedacoes','Vedações e Instalações'],['acabamento','Acabamento']]],
    ['entrega','Entrega',60,[['habite_se','Vistoria e Habite-se'],['entrega_chaves','Entrega das Chaves']]]])},
  {k:'entregue',nome:'Entregue',prefixo:'ENT',ativo:true,conc:'Garantia encerrada',descarta:false,etapas:etx([
    ['pos_entrega','Pós-entrega',null,[['assistencia_tecnica','Assistência Técnica'],['garantia','Em Garantia']]]])}];
/* cada fase abre quando a anterior é concluída */
const DEPS_PADRAO=()=>[['aprovacao','novos_negocios'],['incorporacao','aprovacao'],['caixa','incorporacao'],['lancamento','caixa'],['obras','lancamento'],['entregue','obras']]
  .map(([fase,reqFase],i)=>({id:'fd'+i,fase,reqFase,tipo:'conclusao',req:null}));

const fasesL=()=>cfg().fases||[];
const faseCfg=k=>fasesL().find(f=>f.k===k);
const faseN=k=>faseCfg(k)?.nome||k||'';
const faseEnt=()=>(fasesL().find(f=>f.entrada)||{}).k;
const fIdx=k=>fasesL().findIndex(f=>f.k===k);
/* etapas da fase (a de entrada usa o funil de sempre) */
const etapasF=k=>k===faseEnt()?cfg().etapas.map(e=>({k:e.k,nome:e.nome,sla:e.sla,subs:subsDe(e.k).map(s=>({k:s.k,nome:s.nome}))})):(faseCfg(k)?.etapas||[]);
const etapaF=(f,e)=>etapasF(f).find(x=>x.k===e);
const subF=(f,s)=>etapasF(f).flatMap(e=>e.subs).find(x=>x.k===s);
const procsDe=t=>t.procs||(t.procs=[]);
const aberto=p=>p&&['ativo','stand_by'].includes(p.status);
const procAberto=(t,f)=>procsDe(t).find(p=>p.fase===f&&aberto(p));
const ultimoProc=(t,f)=>procsDe(t).filter(p=>p.fase===f).slice(-1)[0];
const teveFase=(t,f)=>f===faseEnt()?!!t.neg:procsDe(t).some(p=>p.fase===f);
const concluiu=(t,f)=>f===faseEnt()?t.neg?.status==='comprado':procsDe(t).some(p=>p.fase===f&&p.status==='concluido');
const passou=(t,f,tipo,k)=>{if(concluiu(t,f))return true;const L=f===faseEnt()?(t.neg?[t.neg]:[]):procsDe(t).filter(p=>p.fase===f);
  return L.some(p=>(tipo==='etapa'?p.etapa===k:p.sub===k)||(p.trilha||[]).some(x=>(tipo==='etapa'?x.paraEtapa:x.paraSub)===k))};
const depTxt=d=>d.tipo==='conclusao'?`${faseCfg(d.reqFase)?.conc||'Concluir'} em ${faseN(d.reqFase)}`:d.tipo==='etapa'?`${faseN(d.reqFase)}: chegar à etapa ${etapaF(d.reqFase,d.req)?.nome||d.req}`:`${faseN(d.reqFase)}: passar por ${subF(d.reqFase,d.req)?.nome||d.req}`;
const depsDe=(t,f)=>(cfg().deps||[]).filter(d=>d.fase===f).map(d=>({ok:passou(t,d.reqFase,d.tipo,d.req)&&(d.tipo!=='conclusao'||concluiu(t,d.reqFase)),txt:depTxt(d)}));
/* fase atual: a aberta mais adiante; sem nenhuma aberta, a última encerrada (no banco: v_terrenos.fase) */
function faseAtual(t){const ent=faseEnt(),abertas=fasesL().filter(f=>f.entrada?aberto(t.neg):procAberto(t,f.k));
  if(abertas.length){const f=abertas[abertas.length-1];return {k:f.k,p:f.entrada?t.neg:procAberto(t,f.k),aberta:true}}
  const teve=fasesL().filter(f=>teveFase(t,f.k));if(!teve.length)return null;const f=teve[teve.length-1];
  return {k:f.k,p:f.entrada?t.neg:ultimoProc(t,f.k),aberta:false}}
const fasesAbertas=t=>fasesL().filter(f=>f.entrada?aberto(t.neg):procAberto(t,f.k)).map(f=>f.k);
const naEntrada=t=>{const a=faseAtual(t);return !a||a.k===faseEnt()};

/* abrir: primeira etapa com subetapa da fase (no banco: app._abrir_processo) */
function abrirFase(t,f,just){const fc=faseCfg(f),e=etapasF(f).find(x=>x.subs.length);if(!fc||!e)return null;
  const p={id:uid(),fase:f,codigo:fc.prefixo+'-'+String(Math.floor(Math.random()*900)+100).padStart(5,'0'),etapa:e.k,sub:e.subs[0].k,status:'ativo',desde:HOJE,subDesde:HOJE,
    trilha:[{em:agora(),user:me(),ev:'abertura',paraEtapa:e.k,paraSub:e.subs[0].k,status:'ativo',forcado:just||null}]};
  procsDe(t).push(p);log(t,`Fase aberta: ${fc.nome} (${p.codigo})${just?' · sem as dependências: '+just:''}`);
  notificar(t.resp,'aprovacao_decidida',`${t.nome} entrou em ${fc.nome}`,t);return p}
/* depois de cada passagem: abre a fase que o terreno nunca teve e cujas dependências se cumpriram */
function abrirLiberadas(t){if(t.situacao==='arquivado')return [];const abertas=[];let mudou=true,n=0;
  while(mudou&&n++<20){mudou=false;fasesL().filter(f=>!f.entrada&&f.ativo&&(cfg().deps||[]).some(d=>d.fase===f.k)&&!teveFase(t,f.k)).forEach(f=>{
    if(depsDe(t,f.k).every(x=>x.ok)&&abrirFase(t,f.k)){abertas.push(f.nome);mudou=true}})}
  if(abertas.length)setTimeout(()=>toast(`${t.nome} entrou em ${abertas.join(' e ')}.`),1200);
  return abertas}

/* passagens do processo de uma fase (etapa, subetapa, status) */
function procIr(t,p,tipo,dest,d={}){const ev={em:agora(),user:me(),deEtapa:p.etapa,deSub:p.sub};const es=etapasF(p.fase),ix=k=>es.findIndex(e=>e.k===k);
  if(tipo==='etapa'){const volta=ix(dest)<ix(p.etapa),e=etapaF(p.fase,dest);p.etapa=dest;p.sub=e.subs[0]?.k||null;p.desde=HOJE;p.subDesde=HOJE;ev.ev=volta?'retorno':'avanco';
    log(t,`${faseN(p.fase)}: ${volta?'voltou':'avançou'} para ${e.nome}${volta&&d.motivo?' · '+d.motivo:''}`)}
  else if(tipo==='subetapa'){p.sub=dest;p.subDesde=HOJE;ev.ev='subetapa';log(t,`${faseN(p.fase)}: ${subF(p.fase,dest)?.nome}`)}
  else{p.status=dest;p.encerradoEm=HOJE;ev.ev={concluido:'conclusao',descartado:'descarte',stand_by:'stand_by'}[dest];Object.assign(p,{relato:d.relato||null,motivo:d.motivo||null,detalhe:d.detalhe||null,retomar:d.retomar||null});
    log(t,`${faseN(p.fase)}: ${procStatusN(p)}${d.motivo?' · '+motivoN(dest,d.motivo):''}${dest==='stand_by'?' até '+fd(d.retomar):''}`)}
  Object.assign(ev,{paraEtapa:p.etapa,paraSub:p.sub,status:p.status});(p.trilha=p.trilha||[]).push(ev);abrirLiberadas(t)}
function procRetomar(t,p){const parado=p.encerradoEm?diff(p.encerradoEm,HOJE):0;p.status='ativo';p.desde=addD(p.desde,parado);p.subDesde=addD(p.subDesde||HOJE,parado);p.retomar=null;p.encerradoEm=null;
  p.trilha.push({em:agora(),user:me(),ev:'retomada',paraEtapa:p.etapa,paraSub:p.sub,status:'ativo'});log(t,`${faseN(p.fase)}: retomada`)}
const procStatusN=p=>p.status==='concluido'?faseCfg(p.fase)?.conc||'Concluído':STATUS_N[p.status]||p.status;
const procAtrasada=p=>{const e=etapaF(p.fase,p.etapa);return !!(p.status==='ativo'&&e?.sla&&diff(p.desde,HOJE)>e.sla)};
const ultimaEtapa=p=>{const es=etapasF(p.fase);return es[es.length-1]?.k===p.etapa};

/* ---------- desenho ---------- */
/* chip da situação: na entrada, o de sempre; depois, a fase com a etapa e a subetapa */
function chipFase(t){const a=faseAtual(t);if(!a||a.k===faseEnt())return chipNeg(t);const p=a.p,e=etapaF(p.fase,p.etapa);
  const st=p.status==='ativo'?`<span class="chip sub ${procAtrasada(p)?'warn':''}">${esc(e?.nome||p.etapa)}${p.sub?' · '+esc(subF(p.fase,p.sub)?.nome||''):''}</span>`:`<span class="chip ${p.status==='concluido'?'good':p.status==='stand_by'?'warn':''}"><span class="d"></span>${esc(procStatusN(p))}</span>`;
  const mais=fasesAbertas(t).length>1?`<span class="chip" title="${esc(fasesAbertas(t).map(faseN).join(', '))}">+${fasesAbertas(t).length-1} fase</span>`:'';
  return `<span class="chip fase-n">${esc(faseN(a.k))}</span>${st}${mais}`}
/* linha do tempo do topo: na entrada, as etapas da negociação; depois, as fases */
function linhaTopo(t){if(naEntrada(t))return linhaEtapas(t);const a=faseAtual(t),ia=fIdx(a.k);
  return `<nav class="tl-topo" aria-label="Fases do terreno"><ol class="stepper">${fasesL().filter(f=>f.ativo||teveFase(t,f.k)).map((f,i)=>{const p=f.entrada?t.neg:ultimoProc(t,f.k),fim=concluiu(t,f.k),cur=f.k===a.k&&!fim,st=fim?'done':cur||aberto(p)?'cur':'fut';
    /* atual: a etapa; concluída: a data da conclusão; futuras: só o nome */
    const sd=!p?'':cur||aberto(p)?(f.entrada?SN(p.etapa):etapaF(f.k,p.etapa)?.nome||''):fim?fd(p.encerradoEm):'';
    return `<li class="step ${st}" ${cur?'aria-current="step"':''}><span class="dot">${st==='done'?ic('check',14):i+1}</span><span class="sl-w"><span class="sl" title="${esc(f.nome)}">${esc(f.nome)}</span>${sd?`<span class="sd" title="${esc(sd)}">${esc(sd)}</span>`:''}</span></li>`}).join('')}</ol></nav>`}
/* quadro de avanço do processo de uma fase (a de entrada usa painelNeg) */
function painelProc(t,p){const ro=UI.role==='Leitura',fc=faseCfg(p.fase),es=etapasF(p.fase),e=etapaF(p.fase,p.etapa),ix=es.findIndex(x=>x.k===p.etapa),prox=es[ix+1];
  if(p.status==='stand_by')return `<section class="sec sec-adv"><div class="banner warn" style="justify-content:space-between;flex-wrap:wrap"><span style="display:flex;gap:12px">${ic('pause')}<span><b>${esc(fc.nome)} em Stand By · ${esc(e?.nome||'')} · revisitar em ${fd(p.retomar)}</b>${p.detalhe?`<br><span>${esc(p.detalhe)}</span>`:''}</span></span>${ro?'':`<button class="btn sm" data-a="p-retomar" data-p="${p.id}">Retomar</button>`}</div></section>`;
  if(p.status!=='ativo')return '';
  const subSel=`<label class="adv-sub"><span>${esc(fc.nome)} · ${esc(e?.nome||'')}</span><select data-ch="psub" data-p="${p.id}" ${ro?'disabled':''} aria-label="Subetapa">${(e?.subs||[]).map(s=>`<option value="${s.k}" ${s.k===p.sub?'selected':''}>${esc(s.nome)}</option>`).join('')}</select><span class="faint">${diff(p.subDesde||p.desde,HOJE)} d${e?.sla?` · etapa ${diff(p.desde,HOJE)} de ${e.sla} d`:''}</span>${procAtrasada(p)?'<span class="chip warn">acima do SLA</span>':''}</label>`;
  const menu=`<div class="adv-mais"><button class="btn adv-mb" data-a="adv-mais" aria-haspopup="menu" aria-expanded="false" aria-label="Mais ações" title="Stand By${fc.descarta?' ou Descartado':''}"><svg class="ic" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" d="M12 5.5h.01M12 12h.01M12 18.5h.01"/></svg></button><div class="adv-menu" role="menu"><button role="menuitem" data-a="p-suspender" data-p="${p.id}">${ic('pause',18)}Colocar em Stand By</button>${fc.descarta?`<button role="menuitem" class="danger" data-a="p-descartar" data-p="${p.id}">${ic('close',18)}Descartar</button>`:''}</div></div>`;
  return `<section class="sec sec-adv"><div class="adv adv-c">${subSel}<div class="adv-l1"><span class="adv-t">${prox?'Próxima: '+esc(prox.nome):'Próxima: concluir como '+esc(fc.conc)}</span></div>
    ${ro?'':`<div class="adv-l2"><button class="btn primary" data-a="p-ir" data-p="${p.id}">${ic(prox?'fwd':'check',18)}<span>${prox?'Avançar':'Concluir como '+esc(fc.conc)}</span></button>${menu}</div>`}</div></section>`}
/* quadro de avanço da ficha: o da fase atual, e o de cada outra fase aberta ao mesmo tempo */
function painelAvanco(t){const ab=fasesAbertas(t);if(!ab.length||ab.length===1&&ab[0]===faseEnt())return painelNeg(t);
  return ab.slice().reverse().map(f=>f===faseEnt()?painelNeg(t):painelProc(t,procAberto(t,f))).join('')}
/* seção Fases da ficha: cada fase com a situação, o processo e o que falta para abrir */
function abaFases(t){const ent=faseEnt(),ro=UI.role==='Leitura';
  return `<section class="sec"><div class="sec-h"><h2>Fases do terreno</h2></div><div class="sec-b"><ul class="fs-lst">${fasesL().filter(f=>f.ativo||teveFase(t,f.k)).map(f=>{
    const p=f.entrada?t.neg:ultimoProc(t,f.k),deps=f.entrada?[]:depsDe(t,f.k),falta=deps.filter(x=>!x.ok);
    const st=!p?`<span class="chip">${f.entrada?'Sem negociação':'Não aberta'}</span>`:f.entrada?chipNeg(t):p.status==='ativo'?`<span class="chip fase">${esc(etapaF(f.k,p.etapa)?.nome||'')}</span><span class="chip sub">${esc(subF(f.k,p.sub)?.nome||'')}</span>`:`<span class="chip ${p.status==='concluido'?'good':p.status==='stand_by'?'warn':''}"><span class="d"></span>${esc(procStatusN(p))}</span>`;
    /* abrir à mão: a próxima fase que falta, fase sem dependência, ou reabrir a descartada */
    const proxima=fasesL().find(x=>x.ativo&&!x.entrada&&!teveFase(t,x.k))?.k===f.k;
    const pode=!f.entrada&&!ro&&(p?p.status==='descartado':f.ativo&&(proxima||!deps.length));
    return `<li class="fs-i ${p&&aberto(p)?'aberta':''}"><div class="fs-it"><b>${esc(f.nome)}</b>${p?`<span class="num faint">${esc(p.codigo)}</span>`:''}<span class="fs-st">${st}</span></div>
      ${p?`<div class="faint fs-d">${fd(p.trilha?.[0]?.em?.slice(0,10)||p.desde)}${p.encerradoEm&&!aberto(p)?' → '+fd(p.encerradoEm):''}${p.relato&&!f.entrada?' · '+esc(textoDe(p.relato)):''}</div>`:''}
      ${!p&&deps.length?`<ul class="fs-deps">${deps.map(x=>`<li class="${x.ok?'ok':'no'}">${ic(x.ok?'check':'close',14)}${esc(x.txt)}</li>`).join('')}</ul>`:''}
      ${!p&&!f.entrada&&!deps.length?'<div class="faint fs-d">Sem dependência: abre à mão.</div>':''}
      ${pode?`<button class="btn sm ${p?'text':''}" data-a="f-abrir" data-v="${f.k}" aria-label="${p?'Reabrir':'Abrir'} ${esc(f.nome)}${falta.length?' antes da hora':''}">${ic('add',16)}${p?'Reabrir':'Abrir'}${falta.length?' antes da hora':''}</button>`:''}</li>`}).join('')}</ul></div></section>`}

/* ---------- kanban em três níveis: fase › etapa › subetapa ----------
   UI.negFase vazio = quadro das fases; com fase = etapas dela; com UI.negEtapa = subetapas.
   O título de cada coluna desce um nível; a seta e a trilha no topo voltam. */
const procDaFase=(t,f)=>f===faseEnt()?(aberto(t.neg)?t.neg:null):procAberto(t,f);
function negTopo(titulo,sub){const f=UI.negFase,e=UI.negEtapa,it=[{l:'Fases',v:''}];
  if(f)it.push({l:faseN(f),v:f});if(f&&e)it.push({l:etapaF(f,e)?.nome||e,v:f+'|'+e});const volta=it[it.length-2];
  return `<div class="page-h"><div class="drill-h">${volta?`<button class="iconbtn drill-v" data-a="neg-nivel" data-v="${esc(volta.v)}" title="Voltar para ${esc(volta.l)}" aria-label="Voltar para ${esc(volta.l)}">${ic('back',22)}</button>`:''}<div>
    ${volta?`<ol class="drill-t" aria-label="Nível do quadro">${it.slice(0,-1).map(x=>`<li><button class="linkbtn" data-a="neg-nivel" data-v="${esc(x.v)}">${esc(x.l)}</button></li>`).join('')}</ol>`:''}
    <h1>${esc(titulo)}</h1>${sub?`<div class="sub">${sub}</div>`:''}</div></div></div>${fxBarra('kanban')}`}
/* título de coluna que desce um nível */
const colDesce=(a,v,l,dica)=>`<button class="col-ab" data-a="${a}" data-v="${esc(v)}" title="${esc(dica)}"><span>${esc(l)}</span>${ic('chev',16)}</button>`;
function kcardFase(t,f,p){const e=etapaF(f,p.etapa),s=p.sub&&subF(f,p.sub),sb=p.status==='stand_by',outras=fasesAbertas(t).filter(x=>x!==f);
  return `<button class="kcard" data-a="abrir" data-id="${t.id}" data-from="negociacoes"><div class="kr"><span class="num faint">${t.codigo}</span>${f===faseEnt()?(p.temp?tempMini(p.temp):''):`<span class="num faint">${esc(p.codigo||'')}</span>`}</div><div class="kt">${esc(t.nome)}</div>
  ${s?`<div class="kfe">${esc(e?.nome||'')}</div>`:''}<div class="ksub"><span>${esc(s?s.nome:(e?.nome||''))}</span>${sb?'<span class="faint">Stand By</span>':''}</div>
  <div class="ks">${esc(t.bairro||'')}${outras.length?' · também em '+esc(outras.map(faseN).join(', ')):''}</div>${f===faseEnt()&&typeof dividida==='function'&&dividida(t)?`<div class="kpt">${ic('layers',14)}${esc(resumoPartes(t))}</div>`:''}
  <div class="kr">${av(t.resp,'sm')}<span class="faint">${sb?'revisitar '+fd(p.retomar):diff(p.desde,HOJE)+' d na etapa'}</span></div></button>`}
function pgFasesBoard(){const F=fasesL().filter(f=>f.ativo);
  return `${negTopo('Fases','')}
  <div class="board board-fases" id="board">${F.map(f=>{const L=fxLista('kanban').map(t=>[t,procDaFase(t,f.k)]).filter(([,p])=>p);
  return `<section class="col" data-fase="${f.k}" aria-label="${esc(f.nome)}"><div class="col-h">${colDesce('neg-fase',f.k,f.nome,'Ver etapas de '+f.nome)}<span class="n">${L.length}</span></div>${L.map(([t,p])=>kcardFase(t,f.k,p)).join('')||'<div class="col-empty">Nenhum</div>'}</section>`}).join('')}</div>`}
function kcardProc(t,p){return `<button class="kcard" data-a="abrir" data-id="${t.id}" data-from="negociacoes" ${UI.role!=='Leitura'?'draggable="true"':''}><div class="kr"><span class="num faint">${esc(p.codigo)}</span><span class="num faint">${t.codigo}</span></div><div class="kt">${esc(t.nome)}</div>
  ${p.sub?`<div class="ksub"><span>${esc(subF(p.fase,p.sub)?.nome||'')}</span><span class="faint">${diff(p.subDesde||p.desde,HOJE)} d</span></div>`:''}
  <div class="ks">${esc(t.bairro||'')}${p.status==='stand_by'?' · parou em '+esc(etapaF(p.fase,p.etapa)?.nome||''):''}${fasesAbertas(t).length>1?' · também em '+esc(fasesAbertas(t).filter(f=>f!==p.fase).map(faseN).join(', ')):''}</div>
  <div class="kr">${av(t.resp,'sm')}<span class="faint ${procAtrasada(p)?'katr':''}">${p.status==='stand_by'?'revisitar '+fd(p.retomar):diff(p.desde,HOJE)+' d na etapa'}</span></div></button>`}
function pgFaseBoard(f){const fc=faseCfg(f),es=etapasF(f),L=fxLista('kanban').map(t=>[t,procAberto(t,f)]).filter(([,p])=>p),e=UI.negEtapa&&etapaF(f,UI.negEtapa);
  const cols=e?e.subs.map(s=>({k:'fe:sub:'+s.k,l:s.nome,f:([,p])=>p.status==='ativo'&&p.etapa===e.k&&p.sub===s.k}))
    :[...es.map(x=>({k:'fe:'+x.k,l:x.nome,sla:x.sla,abre:x.k,f:([,p])=>p.status==='ativo'&&p.etapa===x.k})),{k:'fe:stand_by',l:'Stand By',cls:'enc',f:([,p])=>p.status==='stand_by'}];
  return `${negTopo(e?e.nome:fc.nome,'')}
  <div class="board ${e?'board-sub':''}" id="board">${cols.map(c=>{const ts=L.filter(c.f);
  return `<section class="col ${c.cls||''}" data-col="${c.k}" aria-label="${esc(c.l)}"><div class="col-h">${c.abre?colDesce('neg-etapa',c.abre,c.l,'Ver subetapas de '+c.l):`<span>${esc(c.l)}</span>`}<span class="n">${ts.length}</span></div>${c.sla?`<div class="col-s faint">SLA ${c.sla} d</div>`:''}${ts.map(([t,p])=>kcardProc(t,p)).join('')||'<div class="col-empty">Nenhuma</div>'}</section>`}).join('')}</div>`}
function soltarProc(id,col){const t=T(id),f=UI.negFase,p=t&&procAberto(t,f);if(!p||UI.role==='Leitura')return;
  if(col==='stand_by'){if(p.status==='ativo'){UI.alvo=id;UI.alvoProc=p.id;UI.modal='p-suspender';renderModal()}return}
  if(col.startsWith('sub:')){const k=col.slice(4);if(p.status!=='ativo'||p.etapa!==UI.negEtapa||p.sub===k)return;procIr(t,p,'subetapa',k);save();render();toast(`${t.nome}: ${subF(f,k)?.nome}.`);return}
  if(p.status==='stand_by'){procRetomar(t,p);if(p.etapa===col){save();render();toast('Retomada.');return}}
  if(p.etapa===col){save();render();return}
  const es=etapasF(f),ix=k=>es.findIndex(e=>e.k===k);
  if(ix(col)<ix(p.etapa)){save();render();UI.alvo=id;UI.alvoProc=p.id;UI.alvoEtapa=col;UI.modal='p-retornar';renderModal();return}
  procIr(t,p,'etapa',col);save();render();toast(`${t.nome}: ${etapaF(f,col).nome}.`)}

/* ---------- Configurações › Fases ---------- */
const slug=(nome,usados)=>{let k=nome.normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'')||'x';while(usados.includes(k))k+='_';return k};
const faseUsada=k=>S.terrenos.some(t=>k===faseEnt()?!!t.neg:procsDe(t).some(p=>p.fase===k));
const etapaUsada=(f,e)=>S.terrenos.some(t=>procsDe(t).some(p=>p.fase===f&&(p.etapa===e||(p.trilha||[]).some(x=>x.paraEtapa===e||x.deEtapa===e))));
/* dependência: sem ciclo e sem dependência na fase de entrada (no banco: adicionar_dependencia) */
function validaDep(f,rf){if(f===rf)return 'Uma fase não depende dela mesma.';if(faseCfg(f)?.entrada)return `${faseN(f)} abre pela oferta, sem dependência.`;
  const dep=(x,vis=new Set())=>{if(vis.has(x))return false;vis.add(x);return (cfg().deps||[]).filter(d=>d.fase===x).some(d=>d.reqFase===f||dep(d.reqFase,vis))};
  if(rf===f||dep(rf))return 'Isso cria um ciclo entre as fases.';return null}
function cfgFasesHtml(){const C=cfg(),F=fasesL(),ent=faseEnt();
  const opReq=F.map(f=>`<optgroup label="${esc(f.nome)}"><option value="${f.k}|conclusao|">${esc(f.conc)} (concluir a fase)</option>${etapasF(f.k).map(e=>`<option value="${f.k}|etapa|${e.k}">Chegar à etapa ${esc(e.nome)}</option>${e.subs.map(s=>`<option value="${f.k}|subetapa|${s.k}">Passar por ${esc(s.nome)}</option>`).join('')}`).join('')}</optgroup>`).join('');
  return `<section class="sec"><div class="sec-h"><h2>Fases</h2></div><div class="sec-b"><div class="cfg-t">
    <div class="cfg-r cfg-hd cfg-fase"><span></span><span>Fase</span><span>Prefixo</span><span>Nome do concluído</span><span>Permite descartar</span><span>Ativa</span><span></span></div>
    ${F.map((f,i)=>`<div class="cfg-r cfg-fase ${f.ativo?'':'inativa'}"><span class="cfg-ord"><button class="iconbtn sm" data-a="cfg-fase-ord" data-i="${i}" data-v="-1" ${i?'':'disabled'} aria-label="Subir">↑</button><button class="iconbtn sm" data-a="cfg-fase-ord" data-i="${i}" data-v="1" ${i<F.length-1?'':'disabled'} aria-label="Descer">↓</button></span>
      <input data-ch="cfg" data-p="fases.${i}.nome" value="${esc(f.nome)}" aria-label="Nome da fase"><input data-ch="cfg-prefixo" data-i="${i}" value="${esc(f.prefixo)}" maxlength="5" aria-label="Prefixo de ${esc(f.nome)}">
      <input data-ch="cfg" data-p="fases.${i}.conc" value="${esc(f.conc)}" aria-label="Nome do concluído em ${esc(f.nome)}">
      <label class="chk"><input type="checkbox" data-ch="cfg" data-p="fases.${i}.descarta" ${f.descarta?'checked':''} aria-label="Permite descartar"></label>
      <label class="chk"><input type="checkbox" data-ch="cfg-fase-ativa" data-i="${i}" ${f.ativo?'checked':''} ${f.entrada?'disabled':''} aria-label="Ativa">${f.entrada?'<span class="faint" style="font-size:12px">entrada</span>':''}</label>
      <span>${f.entrada||faseUsada(f.k)?'':`<button class="iconbtn sm lixo" data-a="cfg-fase-del" data-i="${i}" aria-label="Apagar" title="Apagar">${ic('lixo',18)}</button>`}</span></div>`).join('')}</div>
    <form class="inline-form" data-form="cfg-fase"><div class="field grow"><label for="nf-n">Nova fase</label><input id="nf-n" name="nome" required placeholder="Ex.: Regularização"></div><div class="field" style="flex:0 1 110px"><label for="nf-p">Prefixo</label><input id="nf-p" name="prefixo" required maxlength="5" placeholder="REG"></div><button class="btn sm">${ic('add',16)}Adicionar</button></form>
    </div></section>
  <section class="sec"><div class="sec-h"><h2>Dependências</h2></div><div class="sec-b">
    <ul class="cfg-pre">${(C.deps||[]).map(d=>`<li><span><b>${esc(faseN(d.fase))}</b> abre quando: ${esc(depTxt(d))}</span><button class="iconbtn sm lixo" data-a="cfg-dep-del" data-v="${d.id}" aria-label="Remover" title="Remover">${ic('lixo',18)}</button></li>`).join('')||'<li class="faint">Nenhuma dependência. Toda fase abre à mão.</li>'}</ul>
    <form class="inline-form" data-form="cfg-dep"><div class="field grow"><label for="dp-f">Fase</label><select id="dp-f" name="fase" required>${F.filter(f=>!f.entrada).map(f=>`<option value="${f.k}">${esc(f.nome)}</option>`).join('')}</select></div><div class="field grow"><label for="dp-r">Abre quando</label><select id="dp-r" name="req" required>${opReq}</select></div><button class="btn sm">${ic('add',16)}Adicionar</button></form></div></section>
  ${F.filter(f=>!f.entrada).map(f=>{const i=fIdx(f.k);return `<section class="sec"><div class="sec-h"><h2>Etapas · ${esc(f.nome)}</h2></div><div class="sec-b"><div class="cfg-t">
    <div class="cfg-r cfg-hd cfg-fe"><span></span><span>Etapa</span><span>SLA (dias)</span><span>Subetapas</span><span></span></div>
    ${f.etapas.map((e,j)=>`<div class="cfg-r cfg-fe"><span class="cfg-ord"><button class="iconbtn sm" data-a="cfg-fe-ord" data-f="${i}" data-i="${j}" data-v="-1" ${j?'':'disabled'} aria-label="Subir">↑</button><button class="iconbtn sm" data-a="cfg-fe-ord" data-f="${i}" data-i="${j}" data-v="1" ${j<f.etapas.length-1?'':'disabled'} aria-label="Descer">↓</button></span>
      <input data-ch="cfg" data-p="fases.${i}.etapas.${j}.nome" value="${esc(e.nome)}" aria-label="Nome da etapa"><input type="number" min="0" data-ch="cfg" data-p="fases.${i}.etapas.${j}.sla" value="${e.sla??''}" aria-label="SLA de ${esc(e.nome)}">
      <span class="cfg-subs">${e.subs.map((s,m)=>`<span class="chip">${esc(s.nome)}${e.subs.length>1&&!S.terrenos.some(t=>procsDe(t).some(p=>p.fase===f.k&&p.sub===s.k))?`<button class="chip-x" data-a="cfg-fs-del" data-f="${i}" data-i="${j}" data-m="${m}" aria-label="Tirar ${esc(s.nome)}">×</button>`:''}</span>`).join('')}
        <form class="cfg-fs-add" data-form="cfg-fs" data-f="${i}" data-i="${j}"><input name="nome" required placeholder="+ subetapa" aria-label="Nova subetapa em ${esc(e.nome)}"></form></span>
      <span>${etapaUsada(f.k,e.k)||f.etapas.length<2?'':`<button class="iconbtn sm lixo" data-a="cfg-fe-del" data-f="${i}" data-i="${j}" aria-label="Apagar" title="Apagar">${ic('lixo',18)}</button>`}</span></div>`).join('')||'<div class="faint" style="padding:12px 0">Sem etapas: a fase não abre até ter uma.</div>'}</div>
    <form class="inline-form" data-form="cfg-fe" data-f="${i}"><div class="field grow"><label for="fe-${f.k}">Nova etapa</label><input id="fe-${f.k}" name="nome" required></div><div class="field" style="flex:0 1 120px"><label for="fs-${f.k}">SLA (dias)</label><input id="fs-${f.k}" name="sla" type="number" min="0"></div><button class="btn sm">${ic('add',16)}Adicionar</button></form>
    </div></section>`}).join('')}`}

/* ---------- eventos (chamados antes dos do funil) ---------- */
function fasesClick(A,a,t){const P=()=>t&&procsDe(t).find(p=>p.id===a.dataset.p);
  switch(A){
    case 'neg-fase':UI.negFase=a.dataset.v;UI.negEtapa=null;render();return true;
    case 'neg-nivel':{const [f,e]=(a.dataset.v||'').split('|');UI.negFase=f||null;UI.negEtapa=e||null;render();return true}
    case 'f-abrir':{const f=a.dataset.v,falta=depsDe(t,f).filter(x=>!x.ok);
      if(!falta.length){abrirFase(t,f);abrirLiberadas(t);save();render();toast(`${faseN(f)} aberta.`);return true}
      UI.acao={fase:f,pend:falta.map(x=>x.txt)};UI.modal=nivelDe(me())>=2?'f-forcar':'f-bloq';renderModal();return true}
    case 'p-ir':{const p=P();if(!p)return true;const es=etapasF(p.fase),ix=es.findIndex(e=>e.k===p.etapa);
      if(es[ix+1]){procIr(t,p,'etapa',es[ix+1].k);save();render();toast(`${t.nome}: ${es[ix+1].nome}.`)}else{UI.alvoProc=p.id;UI.modal='p-concluir';renderModal()}return true}
    case 'p-suspender':UI.alvoProc=a.dataset.p;UI.modal='p-suspender';renderModal();return true;
    case 'p-descartar':UI.alvoProc=a.dataset.p;UI.modal='p-descartar';renderModal();return true;
    case 'p-retomar':{const p=P();if(p){procRetomar(t,p);save();render();toast('Retomada. O tempo parado não conta no prazo.')}return true}
    case 'cfg-fase-ord':{const F=fasesL(),i=+a.dataset.i,j=i+Number(a.dataset.v);if(!F[j])return true;[F[i],F[j]]=[F[j],F[i]];save();render();return true}
    case 'cfg-fase-del':{const F=fasesL(),f=F[+a.dataset.i];if(faseUsada(f.k)){toast('Fase já usada: desative em vez de apagar.',true);return true}
      F.splice(+a.dataset.i,1);cfg().deps=(cfg().deps||[]).filter(d=>d.fase!==f.k&&d.reqFase!==f.k);save();render();toast(`${f.nome} apagada.`);return true}
    case 'cfg-dep-del':cfg().deps=(cfg().deps||[]).filter(d=>d.id!==a.dataset.v);save();render();toast('Dependência removida.');return true;
    case 'cfg-fe-ord':{const L=fasesL()[+a.dataset.f].etapas,i=+a.dataset.i,j=i+Number(a.dataset.v);if(!L[j])return true;[L[i],L[j]]=[L[j],L[i]];save();render();return true}
    case 'cfg-fe-del':{const f=fasesL()[+a.dataset.f],e=f.etapas[+a.dataset.i];
      if(etapaUsada(f.k,e.k)){toast('Etapa já usada: não pode ser apagada.',true);return true}
      if((cfg().deps||[]).some(d=>d.reqFase===f.k&&(d.req===e.k||e.subs.some(s=>s.k===d.req)))){toast('Outra fase depende desta etapa: remova a dependência antes.',true);return true}
      f.etapas.splice(+a.dataset.i,1);save();render();toast(`${e.nome} apagada.`);return true}
    case 'cfg-fs-del':{const e=fasesL()[+a.dataset.f].etapas[+a.dataset.i];e.subs.splice(+a.dataset.m,1);save();render();return true}
  }
  return false}
function fasesChange(el){
  if(el.dataset.ch==='psub'){const t=T(UI.id),p=t&&procsDe(t).find(x=>x.id===el.dataset.p);if(p&&el.value!==p.sub){procIr(t,p,'subetapa',el.value);save();render()}return true}
  if(el.dataset.ch==='cfg-prefixo'){const F=fasesL(),i=+el.dataset.i,v=el.value.trim().toUpperCase();
    if(!/^[A-Z]{2,5}$/.test(v))toast('Prefixo: de 2 a 5 letras.',true);else if(F.some((f,j)=>j!==i&&f.prefixo===v))toast(`O prefixo ${v} já é de outra fase.`,true);else{F[i].prefixo=v;save();toast('Prefixo salvo.')}render();return true}
  if(el.dataset.ch==='cfg-fase-ativa'){const f=fasesL()[+el.dataset.i];
    if(!el.checked&&S.terrenos.some(t=>procAberto(t,f.k))){toast('Há terrenos nesta fase: encerre os processos antes de desativar.',true);render();return true}
    f.ativo=el.checked;save();render();return true}
  return false}
function fasesSubmit(form,F,t,f){const C=cfg();
  switch(form){
    case 'cfg-fase':{const p=F.prefixo.trim().toUpperCase();if(!/^[A-Z]{2,5}$/.test(p)){toast('Prefixo: de 2 a 5 letras.',true);return true}
      if(fasesL().some(x=>x.prefixo===p)){toast(`O prefixo ${p} já é de outra fase.`,true);return true}
      const nome=F.nome.trim(),k=slug(nome,fasesL().map(x=>x.k));
      fasesL().push({k,nome,prefixo:p,ativo:true,conc:'Concluído',descarta:true,etapas:[{k:'andamento',nome:'Em andamento',sla:null,subs:[{k:'andamento',nome:'Em andamento'}]}]});
      save();render();toast(`${nome} criada. Defina as etapas e as dependências dela.`);return true}
    case 'cfg-dep':{const [rf,tipo,req]=F.req.split('|'),e=validaDep(F.fase,rf);if(e){toast(e,true);return true}
      if((C.deps||[]).some(d=>d.fase===F.fase&&d.reqFase===rf&&d.tipo===tipo&&(d.req||'')===req)){toast('Essa dependência já existe.',true);return true}
      (C.deps=C.deps||[]).push({id:uid(),fase:F.fase,reqFase:rf,tipo,req:req||null});
      const n=S.terrenos.filter(x=>abrirLiberadas(x).length).length;save();render();toast(`Dependência adicionada.${n?` ${n} terreno${n>1?'s entraram':' entrou'} na fase.`:''}`);return true}
    case 'cfg-fe':{const fs=fasesL()[+f.dataset.f],nome=F.nome.trim(),k=slug(nome,[...fs.etapas.map(e=>e.k),...fs.etapas.flatMap(e=>e.subs.map(s=>s.k))]);
      fs.etapas.push({k,nome,sla:lerNum(F.sla),subs:[{k,nome:'Em andamento'}]});save();render();toast(`${nome} adicionada em ${fs.nome}.`);return true}
    case 'cfg-fs':{const fs=fasesL()[+f.dataset.f],e=fs.etapas[+f.dataset.i],nome=F.nome.trim();
      if(e.subs.some(s=>s.nome.toLowerCase()===nome.toLowerCase())){toast('Já existe uma subetapa com esse nome.',true);return true}
      e.subs.push({k:slug(nome,fs.etapas.flatMap(x=>[x.k,...x.subs.map(s=>s.k)])),nome});save();render();return true}
    case 'f-forcar':{const a=UI.acao;if(!F.j.trim()){toast('Justifique a abertura antes da hora.',true);return true}abrirFase(t,a.fase,F.j.trim());abrirLiberadas(t);UI.modal=null;UI.acao=null;save();render();toast(`${faseN(a.fase)} aberta.`);return true}
    case 'p-concluir':{const p=procsDe(t).find(x=>x.id===UI.alvoProc);if(!F.relato.trim()){toast('Escreva o relato da conclusão.',true);return true}
      UI.modal=null;procIr(t,p,'status','concluido',{relato:F.relato.trim()});save();render();toast(`${faseN(p.fase)}: ${faseCfg(p.fase).conc}.`);return true}
    case 'p-suspender':{const p=procsDe(t).find(x=>x.id===UI.alvoProc);UI.modal=null;procIr(t,p,'status','stand_by',{retomar:F.retomar,detalhe:F.detalhe.trim()});save();render();toast('Em Stand By.');return true}
    case 'p-descartar':{const p=procsDe(t).find(x=>x.id===UI.alvoProc),m=(C.motivos.descartado||[]).find(x=>x.k===F.motivo);
      if(m?.texto&&!F.detalhe.trim()){toast('Esse motivo pede uma explicação no texto.',true);return true}
      UI.modal=null;procIr(t,p,'status','descartado',{motivo:F.motivo,detalhe:F.detalhe.trim()});save();render();toast(`${faseN(p.fase)}: descartada.`);return true}
    case 'p-retornar':{const p=procsDe(t).find(x=>x.id===UI.alvoProc);UI.modal=null;procIr(t,p,'etapa',UI.alvoEtapa,{motivo:F.motivo});save();render();toast(`Voltou para ${etapaF(p.fase,p.etapa).nome}.`);return true}
  }
  return false}
function fasesModal(M,fechar){const t=UI.alvo?T(UI.alvo):T(UI.id),p=t&&procsDe(t).find(x=>x.id===UI.alvoProc);
  const df=(id,l)=>`<div class="df"><button class="btn text" data-a="close">Cancelar</button><button class="btn primary" type="submit" form="${id}">${l}</button></div>`;
  if(M==='f-bloq'){const a=UI.acao||{};return `<div class="dh"><div><h2>${esc(faseN(a.fase))} ainda não abre</h2><p class="muted" style="margin:6px 0 0">Gestor e diretor podem abrir antes da hora, com justificativa.</p></div>${fechar}</div><ul class="adv-lista adv-modal">${(a.pend||[]).map(x=>`<li><span class="no">${ic('close',16)}</span><span>${esc(x)}</span></li>`).join('')}</ul><div class="df"><button class="btn primary" data-a="close">Entendi</button></div>`}
  if(M==='f-forcar'){const a=UI.acao||{};return `<div class="dh"><div><h2>Abrir ${esc(faseN(a.fase))} antes da hora?</h2><ul class="pend">${(a.pend||[]).map(x=>`<li>${ic('close',16)}${esc(x)}</li>`).join('')}</ul></div>${fechar}</div><form data-form="f-forcar" id="f-ff"><div class="field"><label for="ff-j">Justificativa (vai para o histórico)</label><textarea id="ff-j" name="j" required></textarea></div></form>${df('f-ff','Abrir fase')}`}
  if(!p)return '';const fc=faseCfg(p.fase);
  if(M==='p-concluir')return `<div class="dh"><div><h2>Concluir como ${esc(fc.conc)}</h2><div class="muted" style="margin-top:4px">${esc(t.nome)} · ${esc(fc.nome)}</div></div>${fechar}</div><form data-form="p-concluir" id="f-pc"><div class="field"><label for="pc-r">Relato</label><textarea id="pc-r" name="relato" required placeholder="O que foi concluído, datas e documentos"></textarea></div></form>${df('f-pc','Concluir')}`;
  if(M==='p-suspender')return `<div class="dh"><h2>${esc(fc.nome)} em Stand By</h2>${fechar}</div><form data-form="p-suspender" id="f-ps"><div class="fields"><div class="field"><label for="ps-d">Retomar em</label><input id="ps-d" name="retomar" type="date" min="${addD(HOJE,1)}" value="${addD(HOJE,30)}" required></div><div class="field full"><label for="ps-t">Justificativa</label><textarea id="ps-t" name="detalhe" required></textarea></div></div></form>${df('f-ps','Colocar em Stand By')}`;
  if(M==='p-descartar')return `<div class="dh"><div><h2>Descartar ${esc(fc.nome)}</h2><div class="muted" style="margin-top:4px">${esc(t.nome)}</div></div>${fechar}</div><form data-form="p-descartar" id="f-pd"><div class="fields"><div class="field full"><label for="pd-m">Motivo</label><select id="pd-m" name="motivo" required><option value="">Escolha</option>${cfg().motivos.descartado.filter(m=>m.ativo).map(m=>`<option value="${m.k}">${esc(m.nome)}</option>`).join('')}</select></div><div class="field full"><label for="pd-t">Detalhe</label><textarea id="pd-t" name="detalhe" placeholder="Obrigatório quando o motivo é Outros"></textarea></div></div></form>${df('f-pd','Descartar')}`;
  if(M==='p-retornar')return `<div class="dh"><div><h2>Voltar para ${esc(etapaF(p.fase,UI.alvoEtapa)?.nome||'')}?</h2><div class="muted" style="margin-top:4px">${esc(t.nome)} está em ${esc(etapaF(p.fase,p.etapa)?.nome||'')}. Volta na subetapa inicial.</div></div>${fechar}</div><form data-form="p-retornar" id="f-pr"><div class="field"><label for="pr-m">Motivo (vai para o histórico)</label><textarea id="pr-m" name="motivo" required></textarea></div></form>${df('f-pr','Voltar etapa')}`;
  return ''}
