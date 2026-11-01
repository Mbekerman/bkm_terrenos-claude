/* =====================================================================
   Tarefas da etapa (ligação funil × quadros, lote B; decisões do Moisés,
   31/out/2026; simulação "Funil e quadros"). Espelha app.etapa_regras,
   app.tarefas_etapa, app._trava_tarefa, app._tarefas_travando,
   app._tarefas_ao_entrar / _ao_voltar / _ao_encerrar / _ao_retomar e o
   aviso "pode avançar" (app.tg_tarefa_pode_avancar).
   - Configurações › Funil › Tarefas da etapa (só administrador): regras por
     fase e etapa; cada uma diz quando (ao entrar na etapa ou numa subetapa
     dela), o quê (modelo de tarefas da empresa ou uma tarefa só), a
     condição "Vale quando" e se trava o avanço (desligado por padrão).
   - Ao entrar, as tarefas nascem com prazo contado do dia da entrada; o
     "responsável do terreno" é o do terreno naquele dia. Nada duplica: a
     regra que já criou a tarefa neste processo não cria de novo.
   - Trava: as abertas de uma regra que trava viram pendência do avanço
     (analista vê a lista; gestor e diretor passam com justificativa).
     Regra da subetapa trava sair da subetapa; da etapa, sair da etapa.
     Tarefa à mão trava quando a etapa dela tem regra da etapa que trava.
   - Cartão: "Etapa do funil" (nasce na etapa atual; "Nenhuma" tira).
   - Stand By pausa as tarefas abertas da fase sem pedido; retomar devolve
     e empurra o prazo pelos dias parados. Perdido e Descartado perguntam:
     arquivar as tarefas (padrão) ou manter abertas. Concluir não mexe.
   - Voltar etapa: sem trabalho, arquiva sozinha; com trabalho, fica com o
     selo "Etapa deixada", não trava e o responsável é avisado. Ao entrar
     de novo, as arquivadas sozinhas voltam (mesmo código, prazos refeitos).
   - Condição que deixa de valer: "Não se aplica mais" (fica, não trava).
   - A última tarefa que trava concluída avisa o responsável do terreno:
     "TER-x pode avançar". O sistema nunca avança sozinho.
   Injetado no mesmo escopo, depois de proto_auto.js.
   ===================================================================== */
AU_GAT.etapa='Terreno entrou na etapa';
const etRegras=()=>cfg().regrasEtapa||(cfg().regrasEtapa=[]);
const etRegraDe=k=>k.regra?etRegras().find(r=>r.id===k.regra):null;
/* o processo da fase: na entrada, a negociação (t.neg); nas outras, o aberto (ou o último) */
const etProc=(t,f)=>f===faseEnt()?t.neg:(procAberto(t,f)||ultimoProc(t,f));
const etPid=(t,f,p)=>{p=p||etProc(t,f);return p?(f===faseEnt()?p.codigo:p.id):null};
const etIx=(f,e)=>etapasF(f).findIndex(x=>x.k===e);
const etSubIx=(f,e,s)=>(etapaF(f,e)?.subs||[]).findIndex(x=>x.k===s);
const etNomeE=(f,e)=>etapaF(f,e)?.nome||e||'';
const etNomeS=(f,s)=>subF(f,s)?.nome||s||'';
const etDoProc=(t,f,pid)=>(t.tarefas||[]).filter(k=>k.fase===f&&k.etProc===pid&&!k.modelo);

/* situação da tarefa na etapa: nivel (o que trava), sit (ativa, deixada, arqAuto, nao_se_aplica) e trava (no banco: app._trava_tarefa) */
function etTrava(t,k){if(!k||!k.etapa||!k.fase)return null;const r=etRegraDe(k);let nivel=null,sit='ativa';
  if(r&&r.ativo!==false&&r.fase===k.fase&&r.etapa===k.etapa&&(r.sub||null)===(k.sub||null)){if(r.trava)nivel=r.sub?'subetapa':'etapa';
    if(!itCondVale(t,r.cond)||!itCondVale(t,k.etCond))sit='nao_se_aplica'}
  else if(etRegras().some(g=>g.ativo!==false&&g.fase===k.fase&&g.etapa===k.etapa&&!g.sub&&g.trava))nivel='etapa';  // à mão: trava se a etapa trava
  if(k.etSit==='deixada'||k.etSit==='arqAuto')sit=k.etSit;
  return {nivel,sit,trava:!!nivel&&sit==='ativa'}}
/* abertas que travam a saída (saida: etapa ou subetapa) do processo da fase */
function etTravando(t,f,p,saida){const pid=etPid(t,f,p);if(!p||!pid)return [];
  return etDoProc(t,f,pid).filter(k=>tkAberta(k)&&k.etapa===p.etapa).filter(k=>{const j=etTrava(t,k);if(!j?.trava)return false;
    return saida==='subetapa'?j.nivel==='subetapa'&&k.sub===p.sub:j.nivel==='etapa'||(j.nivel==='subetapa'&&k.sub===p.sub)})
    .sort((a,b)=>String(a.prazo||'9').localeCompare(String(b.prazo||'9'))||a.codigo.localeCompare(b.codigo))}
const etItem=(t,k)=>({ok:false,tipo:'tarefa',tarefa:k.id,txt:`Tarefa ${k.codigo}: ${vzPapel(t,k)?k.titulo:'restrita'}${tkAtras(k)?' (atrasada)':''}`,fix:['tab:tarefas','Ver tarefas']});
/* a saída da passagem: etapa (para frente ou concluir), subetapa (para frente) ou nada */
function etSaida(f,p,tipo,dest){if(tipo==='etapa')return etIx(f,dest)>etIx(f,p.etapa)?'etapa':null;
  if(tipo==='subetapa')return etSubIx(f,p.etapa,dest)>etSubIx(f,p.etapa,p.sub)?'subetapa':null;
  return (dest==='comprado'||dest==='concluido')?'etapa':null}

/* ---------- entrar, voltar, parar e retomar ---------- */
const etTrabalho=(t,k)=>(k.coments||[]).some(c=>!c.apagado)||(k.anexos||[]).some(a=>!a.removido)||(k.checklists||[]).some(c=>c.itens.some(i=>i.feito))
  ||(t.tarefas||[]).some(x=>x.mae===k.id)||Object.values(k.campos||{}).some(v=>v!=null&&v!=='')||!!k.mudouLista;
/* tarefa à mão nasce na etapa atual: o processo aberto da fase mais adiante (ativo antes do stand by) */
function etAtual(t){const L=fasesL().map(f=>({f:f.k,p:f.entrada?t.neg:procAberto(t,f.k)})).filter(x=>x.p&&['ativo','stand_by'].includes(x.p.status));
  return L.filter(x=>x.p.status==='ativo').pop()||L.pop()||null}
function etPor(t,k,f,e,s){if(!f||!e){k.fase=null;k.etapa=null;k.sub=null;k.etProc=null;return}const p=etProc(t,f);k.fase=f;k.etapa=e;k.sub=s||null;k.etProc=etPid(t,f,p)}
function etEntrar(t,f,p,tipo,cod){if(!p||t._parte)return;const pid=etPid(t,f,p),etapa=p.etapa,sub=tipo==='etapa'?p.sub:cod;let nv=0,volt=0;
  /* reentrada: arquivadas sozinhas voltam com as datas refeitas; deixadas voltam a travar */
  etDoProc(t,f,pid).filter(k=>(k.etSit==='arqAuto'||k.etSit==='deixada')&&!k.feita&&k.etapa===etapa&&(tipo==='etapa'?(!k.sub||k.sub===sub):k.sub===cod)).forEach(k=>{
    if(k.etSit==='arqAuto'){if(k.etIni!=null){k.inicio=k.iniMin=crSomar(HOJE,k.etIni);k.prazo=crSomar(k.inicio,(k.etDur||1)-1)}
      else{const d=Math.max(0,diff((k.etSitEm||HOJE).slice(0,10),HOJE));if(k.inicio)k.inicio=addD(k.inicio,d);if(k.prazo)k.prazo=addD(k.prazo,d)}k.arq=null;volt++}
    k.etSit=null;k.etSitEm=null});
  /* regras da etapa (e da subetapa inicial) ou da subetapa */
  etRegras().filter(r=>r.ativo!==false&&r.fase===f&&r.etapa===etapa&&(tipo==='etapa'?(!r.sub||r.sub===sub):r.sub===cod))
    .sort((a,b)=>(a.sub?1:0)-(b.sub?1:0)||(a.ordem||0)-(b.ordem||0)).forEach(r=>{if(!itCondVale(t,r.cond))return;
    const ja=etDoProc(t,f,pid).filter(k=>k.regra===r.id);
    if(r.modelo){const m=crModelos().find(x=>x.id===r.modelo&&x.ativo!==false);if(!m)return;
      const mapa=crAplicar(t,m,HOJE,{pular:new Set(ja.map(k=>k.mt)),existentes:Object.fromEntries(ja.map(k=>[k.mt,k.id])),cond:true,mapa:true,silencio:true});
      Object.entries(mapa).forEach(([mt,k])=>{const x=m.tarefas.find(y=>y.id===mt);Object.assign(k,{fase:f,etapa:r.etapa,sub:r.sub||null,etProc:pid,regra:r.id,mt,etCond:x?.cond?JSON.parse(JSON.stringify(x.cond)):null,etIni:x?.iniD??null,etDur:x?.dur??null});nv++})}
    else{if(ja.length)return;const l=tkL(t).find(y=>y.nome===r.lista&&!y.oculta&&y.tipo==='aberta')||tkPrim(t,'aberta');
      const k=tkCriar(t,{titulo:r.titulo,desc:r.desc||'',prio:r.prio||'media',lista:l.id,resp:!r.resp||r.resp===RESP_OBJ?t.resp||null:r.resp});
      if(r.prazo!=null){k.inicio=k.iniMin=HOJE;k.prazo=crSomar(HOJE,r.prazo);k.dur=r.prazo+1}Object.assign(k,{fase:f,etapa:r.etapa,sub:r.sub||null,etProc:pid,regra:r.id,etIni:r.prazo!=null?0:null,etDur:r.prazo!=null?r.prazo+1:null});nv++}});
  if(nv||volt)log(t,`Tarefas de ${tipo==='etapa'?etNomeE(f,etapa):etNomeS(f,cod)}: ${[nv?`${nv} criada${nv>1?'s':''}`:'',volt?`${volt} voltou${volt>1?'aram':''} do arquivo`:''].filter(Boolean).join(', ')}`);
  /* gatilho "Terreno entrou na etapa", nos cartões abertos da etapa */
  if(tipo==='etapa')etDoProc(t,f,pid).filter(k=>tkAberta(k)&&k.etapa===etapa).forEach(k=>auEvento(t,k,'etapa',{etapa:f+':'+etapa}))}
function etVoltar(t,f,p,ixDest){const pid=etPid(t,f,p);let arq=0,dx=0;
  etDoProc(t,f,pid).filter(k=>tkAberta(k)&&k.etapa&&etIx(f,k.etapa)>ixDest&&k.etSit!=='deixada').forEach(k=>{
    if(etTrabalho(t,k)){k.etSit='deixada';k.etSitEm=agora();dx++;
      notificar(k.resp,'etapa_deixada',`Etapa deixada: "${k.titulo}" é de ${etNomeE(f,k.etapa)}, e ${t.codigo} voltou para ${etNomeE(f,p.etapa)}. A tarefa não trava mais.`,t,'ed:'+k.id+':'+k.etSitEm,tkIr(k))}
    else{k.etSit='arqAuto';k.etSitEm=agora();k.arq=HOJE;arq++}});
  if(arq||dx)log(t,`Volta de etapa: ${[arq?`${arq} tarefa${arq>1?'s':''} sem trabalho arquivada${arq>1?'s':''}`:'',dx?`${dx} com trabalho ficou como "Etapa deixada"`:''].filter(Boolean).join(', ')}`)}
function etEncerrar(t,f,p,st,d={}){const pid=etPid(t,f,p),L=etDoProc(t,f,pid).filter(k=>tkAberta(k));if(!L.length)return;
  if(st==='stand_by'){let n=0;L.forEach(k=>{if(pzAtiva(k))return;const z={id:uid(),sit:'pendente',motivo:'Stand By da fase'+(d.detalhe?': '+d.detalhe:''),por:me(),em:agora(),origem:'stand_by'};
      const pp=pzPend(k);if(pp){pp.sit='cancelada';pp.decEm=agora()}pzPausas(k).push(z);pzIniciar(t,k,z);n++});if(n)log(t,`Stand By: ${n} tarefa${n>1?'s':''} pausada${n>1?'s':''}`)}
  else if(['perdido','descartado'].includes(st)){if((d.tarefas||'arquivar')!=='arquivar'){log(t,`${STATUS_N[st]}: ${L.length} tarefa${L.length>1?'s':''} mantida${L.length>1?'s':''} aberta${L.length>1?'s':''}`);return}
    L.forEach(k=>{const z=pzAtiva(k);if(z){z.sit='encerrada';z.fim=agora();z.dias=0}k.arq=HOJE});log(t,`${STATUS_N[st]}: ${L.length} tarefa${L.length>1?'s':''} arquivada${L.length>1?'s':''}`)}}
function etRetomar(t,f,p){const pid=etPid(t,f,p);UI.etRet=true;try{etDoProc(t,f,pid).forEach(k=>{if(pzAtiva(k)?.origem==='stand_by')pzRetomar(t,k)})}finally{UI.etRet=false}}
/* concluída a última que trava: avisa o responsável do terreno (no banco: t_pode_avancar) */
function etPodeAvancar(t,k){const j=etTrava(t,k);if(!j?.nivel||j.sit!=='ativa')return;const p=etProc(t,k.fase);
  if(!p||p.status!=='ativo'||etPid(t,k.fase,p)!==k.etProc||p.etapa!==k.etapa||(j.nivel==='subetapa'&&p.sub!==k.sub))return;
  if(etTravando(t,k.fase,p,j.nivel).length)return;const nome=j.nivel==='subetapa'?etNomeS(k.fase,k.sub):etNomeE(k.fase,k.etapa);
  notificar(t.resp,'pode_avancar',`${t.codigo} pode avançar. As tarefas de ${nome} estão concluídas.`,t,'pa:'+k.id+':'+k.feita,tkIr(k))}

/* ---------- ganchos no funil, nas fases e nas tarefas ---------- */
{const pend=pendencias;pendencias=function(t,tipo,dest){const L=pend(t,tipo,dest);if(t._parte||!t.neg)return L;const f=faseEnt(),s=etSaida(f,t.neg,tipo,dest);
  if(s)etTravando(t,f,t.neg,s).forEach(k=>L.push(etItem(t,k)));return L}}
{const ex=executar;executar=function(t,tipo,dest,d={}){const n=t.neg,f=faseEnt(),de=n?.etapa;ex(t,tipo,dest,d);if(t._parte||!n)return;
  if(tipo==='etapa'){if(etIx(f,dest)<etIx(f,de))etVoltar(t,f,n,etIx(f,dest));etEntrar(t,f,n,'etapa',dest)}
  else if(tipo==='subetapa')etEntrar(t,f,n,'subetapa',dest);else etEncerrar(t,f,n,dest,d||{})}}
{const rt=retomar;retomar=function(t){rt(t);if(!t._parte)etRetomar(t,faseEnt(),t.neg)}}
{const pr=procRetomar;procRetomar=function(t,p){pr(t,p);etRetomar(t,p.fase,p)}}
{const af=abrirFase;abrirFase=function(t,f,just){const p=af(t,f,just);if(p)etEntrar(t,f,p,'etapa',p.etapa);return p}}
function etAbriu(t){if(t?.neg)etEntrar(t,faseEnt(),t.neg,'etapa',t.neg.etapa)}
/* fases depois da entrada: a trava vale também (analista vê a lista; gestor e diretor passam com justificativa) */
function etBloqProc(t,p,tipo,dest){const s=etSaida(p.fase,p,tipo,dest);if(!s)return false;const L=etTravando(t,p.fase,p,s);if(!L.length)return false;
  UI.etFz={tid:t.id,pid:p.id,tipo,dest,itens:L.map(k=>etItem(t,k))};UI.alvo=t.id;UI.modal=nivelDe(me())>=2?'et-forcar':'et-bloq';setTimeout(renderModal,0);return true}
{const pi=procIr;procIr=function(t,p,tipo,dest,d={}){const f=p.fase,de=p.etapa;if(!d.forcado&&etBloqProc(t,p,tipo,dest))return false;
  pi(t,p,tipo,dest,d);if(d.forcado)log(t,`${faseN(f)}: passou sem as tarefas da etapa · ${d.forcado}`);
  if(tipo==='etapa'){if(etIx(f,dest)<etIx(f,de))etVoltar(t,f,p,etIx(f,dest));etEntrar(t,f,p,'etapa',dest)}else if(tipo==='subetapa')etEntrar(t,f,p,'subetapa',dest);else etEncerrar(t,f,p,dest,d)}}
{const cr=tkCriar;tkCriar=function(t,d){const k=cr(t,d);if(k&&k.etapa===undefined&&!k.modelo){if(d.etapa==='nenhuma')etPor(t,k);else{const a=etAtual(t);a?etPor(t,k,a.f,a.p.etapa,a.p.sub):etPor(t,k)}}return k}}
{const mv=tkMover;tkMover=function(t,k,lid,pos){const antes=k.lista,feita=k.feita,r=mv(t,k,lid,pos);if(k.lista!==antes)k.mudouLista=true;if(!feita&&k.feita&&k.etapa)etPodeAvancar(t,k);return r}}
{const ret=pzRetomar;pzRetomar=function(t,k){const z=pzAtiva(k);if(z?.origem==='stand_by'&&!UI.etRet){toast('Esta pausa é do Stand By da fase: a tarefa volta quando a fase for retomada.',true);return}return ret(t,k)}}
{const tf=tkFiltradas;tkFiltradas=function(){const L=tf(),e=UI.tk.etapa;return e?L.filter(({k})=>e==='-'?!k.etapa:`${k.fase}|${k.etapa}`===e):L}}
/* automações: o parâmetro e a frase do gatilho novo */
{const gp=auGatParam;auGatParam=function(r){if(r.gat!=='etapa')return gp(r);
  return `<span class="au-lbl">Etapa</span><select class="tkm-pill" data-au="gEtapa"><option value="">Qualquer etapa</option>${fasesL().filter(f=>f.ativo).map(f=>`<optgroup label="${esc(f.nome)}">${etapasF(f.k).map(e=>{const v=f.k+':'+e.k;return `<option value="${esc(v)}" ${v===r.gEtapa?'selected':''}>${esc(e.nome)}</option>`}).join('')}</optgroup>`).join('')}</select>`}}
{const aq=auQuando;auQuando=function(r){if(r.gat!=='etapa')return aq(r);if(!r.gEtapa)return 'Quando o terreno entrar numa etapa';const [f,e]=r.gEtapa.split(':');return `Quando o terreno entrar em ${etNomeE(f,e)} (${faseN(f)})`}}

/* ---------- desenho: cartão, lista e filtros ---------- */
const ET_SIT={deixada:'Etapa deixada',arqAuto:'Arquivada na volta de etapa',nao_se_aplica:'Não se aplica mais'};
function etSelo(t,k,frente){const j=etTrava(t,k);if(!j)return '';const cls=frente?'tk-b':'tkm-selo';
  if(j.sit!=='ativa')return `<span class="${cls} et-sit" title="${j.sit==='deixada'?'O terreno voltou de etapa: a tarefa não trava mais':j.sit==='nao_se_aplica'?'A condição da regra deixou de valer: a tarefa não trava':'Arquivada sozinha na volta de etapa; volta se o terreno entrar de novo'}">${ET_SIT[j.sit]}</span>`;
  return j.trava&&tkAberta(k)?`<span class="${cls} et-trava" title="Aberta, trava ${j.nivel==='subetapa'?'sair da subetapa':'sair da etapa'}">${ic('lock',14)}Trava ${j.nivel==='subetapa'?'a subetapa':'a etapa'}</span>`:''}
function etLinha(t,k,bloq,linha){if(k.modelo)return '';const ab=fasesL().filter(f=>f.entrada?aberto(t.neg):procAberto(t,f.k)).map(f=>f.k);if(k.fase&&!ab.includes(k.fase))ab.push(k.fase);
  const v=k.etapa?`${k.fase}|${k.etapa}`:'',r=etRegraDe(k),txt=k.etapa?`${etNomeE(k.fase,k.etapa)}${k.sub?' · '+etNomeS(k.fase,k.sub):''}`:'Nenhuma';
  const sel=bloq?`<span>${esc(txt)}</span>`:`<select id="tkc-et" class="tkm-pill" data-etk="etapa" aria-label="Etapa do funil" title="${esc(txt)}"><option value="">Nenhuma</option>${ab.map(f=>`<optgroup label="${esc(faseN(f))}">${etapasF(f).map(e=>`<option value="${f}|${e.k}" ${v===f+'|'+e.k?'selected':''}>${esc(e.nome)}</option>`).join('')}</optgroup>`).join('')}</select>`;
  const subs=k.etapa?(etapasF(k.fase).find(e=>e.k===k.etapa)?.subs||[]):[];
  const ss=!k.etapa?'':bloq||r?(k.sub?`<span class="faint et-reg">${esc(etNomeS(k.fase,k.sub))}</span>`:''):subs.length?`<select id="tkc-sub" class="tkm-pill" data-etk="sub" aria-label="Subetapa do funil"><option value="">Sem subetapa</option>${subs.map(x=>`<option value="${x.k}" ${k.sub===x.k?'selected':''}>${esc(x.nome)}</option>`).join('')}</select>`:'';
  return linha('flow','Etapa do funil',`${sel}${ss}${r?`<span class="et-regi" title="Nasceu da regra da etapa: ${escT(etRegraNome(r))}">${ic('raio',14)}</span>`:''}`,bloq?null:'tkc-et')}
const etRegraNome=r=>r.modelo?(crModelos().find(m=>m.id===r.modelo)?.nome||'modelo'):r.titulo;
const etOpcoesFiltro=()=>{const s=new Map();todasTarefas().forEach(({k})=>{if(k.etapa)s.set(`${k.fase}|${k.etapa}`,`${faseN(k.fase)} › ${etNomeE(k.fase,k.etapa)}`)});return [...s.entries()].sort((a,b)=>a[1].localeCompare(b[1]))};
const etFiltroHtml=f=>`<label class="sr-only" for="tk-etapa">Etapa</label><select id="tk-etapa" class="fsel-chip${f.etapa?' on':''}" data-ch="tk-f" data-k="etapa"><option value="">Etapa</option><option value="-" ${f.etapa==='-'?'selected':''}>Sem etapa</option>${etOpcoesFiltro().map(([v,n])=>`<option value="${esc(v)}" ${f.etapa===v?'selected':''}>${esc(n)}</option>`).join('')}</select>`;
P.flow='M4 6h6v4H4zM14 14h6v4h-6zM7 10v4h7';

/* ---------- formulários do funil: Stand By, Perdido e Descartado ---------- */
function etAbertasFase(t,f){const pid=etPid(t,f);return pid?etDoProc(t,f,pid).filter(k=>tkAberta(k)):[]}
function etStandByInfo(t,f){const n=etAbertasFase(t,f).length;return n?`<div class="banner blue" style="margin-top:12px">${ic('clock')}<div>As ${n===1?'uma tarefa aberta':n+' tarefas abertas'} da fase ${n===1?'fica pausada':'ficam pausadas'} sem pedido de aprovação. Ao retomar, ${n===1?'volta':'voltam'} e o prazo anda os dias parados.</div></div>`:''}
function etArquivarHtml(t,f){const n=etAbertasFase(t,f).length;if(!n)return '';
  return `<fieldset class="field full et-arq"><legend>Tarefas abertas da fase</legend><label class="fchk"><input type="radio" name="tarefas" value="arquivar" checked>${ic('check',16)}Arquivar ${n===1?'a tarefa':'as '+n+' tarefas'}</label><label class="fchk"><input type="radio" name="tarefas" value="manter">${ic('check',16)}Manter ${n===1?'aberta':'abertas'}</label></fieldset>`}
{const fm=funilModal;funilModal=function(M,fechar){const t=UI.alvo?T(UI.alvo):T(UI.id);
  if(M==='et-regra')return etRegraHtml(fechar);
  if(M==='et-bloq'||M==='et-forcar'){const a=UI.etFz||{},x=T(a.tid),p=x&&procsDe(x).find(y=>y.id===a.pid),nm=p?(a.tipo==='status'?faseCfg(p.fase)?.conc:a.tipo==='etapa'?etNomeE(p.fase,a.dest):etNomeS(p.fase,a.dest)):'';
    if(M==='et-bloq')return `<div class="dh"><div><h2>Ainda não dá para ir para ${esc(nm)}</h2><p class="muted" style="margin:6px 0 0">Conclua as tarefas que travam. Gestor e diretor podem passar sem elas, com justificativa.</p></div>${fechar}</div><ul class="adv-lista adv-modal">${advItens(a.itens||[])}</ul><div class="df"><button class="btn primary" data-a="close">Entendi</button></div>`;
    return `<div class="dh"><div><h2>Ir para ${esc(nm)} sem as tarefas?</h2><ul class="pend">${(a.itens||[]).map(i=>`<li>${ic('close',16)}${esc(i.txt)}</li>`).join('')}</ul></div>${fechar}</div><form data-form="et-forcar" id="f-ef"><div class="field"><label for="ef-j">Justificativa (vai para o histórico)</label><textarea id="ef-j" name="j" required></textarea></div></form><div class="df"><button class="btn text" data-a="close">Cancelar</button><button class="btn primary" type="submit" form="f-ef">Avançar</button></div>`}
  let h=fm(M,fechar);if(!h||!t)return h;const f=faseEnt();
  if(M==='suspender')h=h.replace('</form>',etStandByInfo(t,f)+'</form>');
  if(M==='perder'||M==='descartar')h=h.replace(/(<\/div><\/div>)(<div class="banner blue"|<\/form>)/,(m0,a,b)=>a.replace(/<\/div>$/,etArquivarHtml(t,f)+'</div>')+b);
  return h}}
{const fz=fasesModal;fasesModal=function(M,fechar){let h=fz(M,fechar);if(!h)return h;const t=UI.alvo?T(UI.alvo):T(UI.id),p=t&&procsDe(t).find(x=>x.id===UI.alvoProc);if(!p)return h;
  if(M==='p-suspender')h=h.replace('</form>',etStandByInfo(t,p.fase)+'</form>');
  if(M==='p-descartar')h=h.replace('</div></div></form>','</div>'+etArquivarHtml(t,p.fase)+'</div></form>');
  return h}}

/* ---------- Configurações › Tarefas da etapa ---------- */
function etCfgHtml(){const fs=fasesL().filter(f=>f.ativo!==false),f=fs.some(x=>x.k===UI.etCfgFase)?UI.etCfgFase:faseEnt(),R=etRegras().filter(r=>r.fase===f);
  const linha=r=>{const nt=(S.terrenos||[]).reduce((s,t)=>s+(t.tarefas||[]).filter(k=>k.regra===r.id).length,0),m=r.modelo?crModelos().find(x=>x.id===r.modelo):null;
    return `<div class="et-r ${r.ativo===false?'inativa':''}"><div class="et-rq"><span class="chip">${r.sub?'Ao entrar em '+esc(etNomeS(f,r.sub)):'Ao entrar na etapa'}</span></div>
      <div class="et-ro"><b>${r.modelo?`Modelo ${esc(m?.nome||'(removido)')}`:esc(r.titulo)}</b><span class="faint">${r.modelo?`${m?.tarefas.length||0} tarefa${m?.tarefas.length===1?'':'s'}`:`${r.prazo!=null?`prazo ${r.prazo} dia${r.prazo===1?'':'s'}`:'sem prazo'} · ${r.resp&&r.resp!==RESP_OBJ?esc(r.resp):'responsável do terreno'}`}${r.cond?' · vale quando '+esc(itCondFrase(r.cond)):''}${nt?` · ${nt} tarefa${nt>1?'s':''} criada${nt>1?'s':''}`:''}${r.ativo===false?' · desativada':''}</span></div>
      <span class="et-rt">${r.trava?`<span class="chip warn">${ic('lock',14)}Trava ${r.sub?'a subetapa':'a etapa'}</span>`:'<span class="faint">não trava</span>'}</span>
      <span class="et-ra"><button class="btn sm text" data-a="et-regra-ed" data-v="${r.id}">Editar</button><button class="iconbtn sm lixo" data-a="et-regra-x" data-v="${r.id}" aria-label="${nt?'Desativar':'Apagar'} regra" title="${nt?'Desativar (já criou tarefas)':'Apagar'}">${ic('lixo',18)}</button></span></div>`};
  return `<section class="sec"><div class="sec-h"><h2>Tarefas da etapa</h2></div><div class="sec-b">
    <p class="muted" style="margin-top:0">Ao entrar na etapa (ou numa subetapa dela), as tarefas nascem no quadro do terreno, com prazo contado do dia da entrada. A regra que trava faz das abertas pendência do avanço: o analista vê a lista; gestor e diretor passam com justificativa.</p>
    <div class="seg sm et-fases" role="group" aria-label="Fase">${fs.map(x=>`<button data-a="et-cfg-fase" data-v="${x.k}" aria-pressed="${x.k===f}">${esc(x.nome)}</button>`).join('')}</div></div></section>
  ${etapasF(f).map(e=>{const rs=R.filter(r=>r.etapa===e.k).sort((a,b)=>(a.sub?etSubIx(f,e.k,a.sub)+1:0)-(b.sub?etSubIx(f,e.k,b.sub)+1:0)||(a.ordem||0)-(b.ordem||0));
    return `<section class="sec et-sec"><div class="sec-h"><h2>${esc(e.nome)}</h2><button class="btn text sm" data-a="et-regra-nova" data-f="${f}" data-e="${e.k}">${ic('add',16)}Adicionar regra</button></div><div class="sec-b">${rs.map(linha).join('')||'<p class="faint" style="margin:0">Nenhuma tarefa nasce nesta etapa.</p>'}</div></section>`}).join('')}`}
const etNovaRegra=(f,e)=>({id:null,fase:f,etapa:e,sub:null,modelo:'',titulo:'',desc:'',prazo:null,lista:'Fazer',prio:'media',resp:RESP_OBJ,cond:null,trava:false,ativo:true,tipo:'modelo'});
function etRegraHtml(fechar){const r=UI.etRegra;if(!r)return '';const f=r.fase,e=etapaF(f,r.etapa),ms=crModelos().filter(m=>!m.dono&&m.ativo!==false),L=(S.listasModelo||[]).filter(l=>l.ativo&&l.tipo==='aberta');
  const o=(obj,v)=>Object.entries(obj).map(([k,n])=>`<option value="${esc(k)}" ${k===v?'selected':''}>${esc(n)}</option>`).join('');
  return `<div class="dh"><div><h2>${r.id?'Editar regra':'Nova regra'}</h2><div class="muted" style="margin-top:4px">${esc(faseN(f))} › ${esc(e?.nome||'')}</div></div>${fechar}</div>
  <div class="fields et-form">
    <div class="field"><label for="etr-q">Quando</label><select id="etr-q" data-etr="sub"><option value="">Ao entrar na etapa</option>${(e?.subs||[]).map(s=>`<option value="${s.k}" ${s.k===r.sub?'selected':''}>Ao entrar em ${esc(s.nome)}</option>`).join('')}</select></div>
    <fieldset class="field full et-tipo"><legend>O que nasce</legend><label class="fchk"><input type="radio" name="etr-tipo" data-etr="tipo" value="modelo" ${r.tipo==='modelo'?'checked':''}>${ic('check',16)}Um modelo de tarefas da empresa</label><label class="fchk"><input type="radio" name="etr-tipo" data-etr="tipo" value="tarefa" ${r.tipo==='tarefa'?'checked':''}>${ic('check',16)}Uma tarefa</label></fieldset>
    ${r.tipo==='modelo'?`<div class="field full"><label for="etr-m">Modelo</label><select id="etr-m" data-etr="modelo"><option value="">Escolha</option>${ms.map(m=>`<option value="${m.id}" ${m.id===r.modelo?'selected':''}>${esc(m.nome)} · ${m.tarefas.length} tarefa${m.tarefas.length===1?'':'s'}</option>`).join('')}</select>
      <p class="faint" style="margin:4px 0 0">Cada tarefa do modelo começa em N dias e tem a duração do modelo, contados do dia da entrada. Tarefa do modelo com condição só nasce quando ela vale.</p></div>`
    :`<div class="field full"><label for="etr-t">Título</label><input id="etr-t" data-etr="titulo" value="${esc(r.titulo||'')}" placeholder="Ex.: Cobrar retorno da proposta"></div>
      <div class="field"><label for="etr-p">Prazo (dias depois da entrada)</label><input id="etr-p" type="number" min="0" data-etr="prazo" value="${r.prazo??''}" placeholder="Sem prazo"></div>
      <div class="field"><label for="etr-l">Lista</label><select id="etr-l" data-etr="lista">${L.map(l=>`<option ${l.nome===r.lista?'selected':''}>${esc(l.nome)}</option>`).join('')}</select></div>
      <div class="field"><label for="etr-pr">Prioridade</label><select id="etr-pr" data-etr="prio">${o(OPT.prioTar,r.prio)}</select></div>
      <div class="field"><label for="etr-r">Responsável</label><select id="etr-r" data-etr="resp"><option value="${RESP_OBJ}" ${!r.resp||r.resp===RESP_OBJ?'selected':''}>Responsável do terreno</option>${USERS.map(u=>`<option ${u===r.resp?'selected':''}>${esc(u)}</option>`).join('')}</select></div>`}
    <div class="field full"><span class="lbl-f">Vale quando</span><span class="it-vq">${r.cond?esc(itCondFrase(r.cond)):'<span class="faint">sempre</span>'}<button class="linkbtn" data-a="et-cond" data-v="regra">${r.cond?'Editar':'+ Condição'}</button>${r.cond?'<button class="linkbtn" data-a="et-cond-tira" data-v="regra">Tirar</button>':''}</span></div>
    <label class="fchk full et-trv"><input type="checkbox" data-etr="trava" ${r.trava?'checked':''}>${ic('check',16)}Trava o avanço: as tarefas abertas desta regra viram pendência para sair ${r.sub?'da subetapa':'da etapa'}</label>
    ${r.id?`<label class="fchk full"><input type="checkbox" data-etr="ativo" ${r.ativo!==false?'checked':''}>${ic('check',16)}Ativa</label>`:''}</div>
  <div class="df"><button class="btn text" data-a="close">Cancelar</button><button class="btn primary" data-a="et-regra-salva">Salvar regra</button></div>`}
function etRegraErro(r){if(r.tipo==='modelo'&&!crModelos().some(m=>m.id===r.modelo))return 'Escolha o modelo de tarefas.';if(r.tipo==='tarefa'&&!(r.titulo||'').trim())return 'Dê um título à tarefa.';
  if(r.prazo!=null&&(r.prazo<0||r.prazo>365))return 'Prazo: de 0 a 365 dias.';return r.cond?itCondErro(r.cond):null}
/* condição fora do cartão: regra, documento do checklist, pré-requisito e tarefa do modelo (o mesmo painel "Vale quando") */
function etCondAlvo(v){const [tp,a,b]=v.split(':');
  if(tp==='regra')return {nome:`Regra: ${UI.etRegra?.titulo||etRegraNome(UI.etRegra)||'nova'}`,ler:()=>UI.etRegra.cond,gravar:c=>{UI.etRegra.cond=c},voltar:()=>{UI.modal='et-regra';renderModal()}};
  if(tp==='ck'){const it=(cfg().checklist[a]||[]).find(x=>x.doc===b);return it&&{nome:`Checklist de ${SN(a)}: ${TIPOS_DOC[b]?.[0]||b}`,ler:()=>it.cond,gravar:c=>{it.cond=c;save()},voltar:()=>{UI.modal=null;renderModal();render()}}}
  if(tp==='pr'){const it=cfg().prereq.find(x=>x.id===a);return it&&{nome:`Pré-requisito: ${destinoNome(it.alvoTipo,it.alvo)}`,ler:()=>it.cond,gravar:c=>{it.cond=c;save()},voltar:()=>{UI.modal=null;renderModal();render()}}}
  if(tp==='mt'){const m=crModelos().find(x=>x.id===a),x=m?.tarefas.find(y=>y.id===b);return x&&{nome:`${m.nome}: ${x.titulo}`,ler:()=>x.cond,gravar:c=>{x.cond=c;save()},voltar:()=>{UI.modal='cr-modelo-ed';renderModal()}}}
  return null}
const etVq=(alvo,c,ed=true)=>`<span class="it-vq et-vq">${c?'vale quando '+esc(itCondFrase(c)):'<span class="faint">vale sempre</span>'}${ed?`<button class="linkbtn" data-a="et-cond" data-v="${esc(alvo)}">${c?'Editar':'+ Condição'}</button>${c?`<button class="linkbtn" data-a="et-cond-tira" data-v="${esc(alvo)}">Tirar</button>`:''}`:''}</span>`;
function etCkCondHtml(e){const L=(cfg().checklist[e]||[]).filter(c=>c.obrig);if(!L.length)return '';
  return `<ul class="et-cks">${L.map(c=>`<li><span>${esc(TIPOS_DOC[c.doc]?.[0]||c.doc)}</span>${etVq(`ck:${e}:${c.doc}`,c.cond)}</li>`).join('')}</ul>`}

document.addEventListener('click',e=>{const a=e.target.closest?.('[data-a^="et-"]');if(!a)return;e.preventDefault();e.stopImmediatePropagation();const A=a.dataset.a;
  switch(A){
    case 'et-cfg-fase':UI.etCfgFase=a.dataset.v;render();return;
    case 'et-regra-nova':if(!ehAdmin(me()))return;UI.etRegra=etNovaRegra(a.dataset.f,a.dataset.e);UI.modal='et-regra';renderModal();return;
    case 'et-regra-ed':{if(!ehAdmin(me()))return;const r=etRegras().find(x=>x.id===a.dataset.v);if(!r)return;UI.etRegra={...JSON.parse(JSON.stringify(r)),tipo:r.modelo?'modelo':'tarefa'};UI.modal='et-regra';renderModal();return}
    case 'et-regra-x':{if(!ehAdmin(me()))return;const r=etRegras().find(x=>x.id===a.dataset.v);if(!r)return;
      const usada=(S.terrenos||[]).some(t=>(t.tarefas||[]).some(k=>k.regra===r.id));if(usada){r.ativo=false;toast('A regra já criou tarefas: ficou desativada.')}else{cfg().regrasEtapa=etRegras().filter(x=>x!==r);toast('Regra apagada.')}save();render();return}
    case 'et-regra-salva':{const r=UI.etRegra,er=etRegraErro(r);if(er){toast(er,true);return}
      const x={id:r.id||uid(),fase:r.fase,etapa:r.etapa,sub:r.sub||null,modelo:r.tipo==='modelo'?r.modelo:null,titulo:r.tipo==='tarefa'?r.titulo.trim():null,desc:r.desc||'',prazo:r.tipo==='tarefa'?r.prazo:null,
        lista:r.lista,prio:r.prio,resp:r.resp||RESP_OBJ,cond:r.cond||null,trava:!!r.trava,ativo:r.ativo!==false,ordem:r.ordem??etRegras().filter(y=>y.fase===r.fase&&y.etapa===r.etapa).length};
      const i=etRegras().findIndex(y=>y.id===x.id);if(i>=0)etRegras()[i]=x;else etRegras().push(x);UI.etRegra=null;UI.modal=null;save();renderModal();render();toast('Regra salva. Vale para as próximas entradas na etapa.');return}
    case 'et-cond':{const v=a.dataset.v,x=etCondAlvo(v);if(!x||!ehAdmin(me()))return;const c=x.ler();
      UI.itCond={alvo:v,cond:c?JSON.parse(JSON.stringify(c)):itNovaCond(),busca:c?null:'0',q:'',ext:{titulo:x.nome,salvar:x.gravar,voltar:x.voltar}};UI.modal='it-cond';renderModal();return}
    case 'et-cond-tira':{const x=etCondAlvo(a.dataset.v);if(!x||!ehAdmin(me()))return;x.gravar(null);if(a.dataset.v==='regra')renderModal();else{save();render();renderModal()}return}
  }},true);
document.addEventListener('change',e=>{const el=e.target;
  if(el.dataset?.etr){e.stopImmediatePropagation();const r=UI.etRegra;if(!r)return;const c=el.dataset.etr;
    if(c==='trava'||c==='ativo')r[c]=el.checked;else if(c==='prazo')r.prazo=el.value===''?null:Math.max(0,parseInt(el.value,10)||0);else if(c==='sub')r.sub=el.value||null;else r[c]=el.value;
    if(['tipo','sub'].includes(c))renderModal();return}
  if(el.dataset?.etk==='sub'){e.stopImmediatePropagation();const {t,k}=tkAtual();if(!k||!vzEdita(t,k)||!k.etapa)return;const antes=k.sub?etNomeS(k.fase,k.sub):'nenhuma';k.sub=el.value||null;
    log(t,`Tarefa "${k.titulo}": subetapa do funil ${antes} → ${k.sub?etNomeS(k.fase,k.sub):'nenhuma'}`);tkRe();return}
  if(el.dataset?.etk==='etapa'){e.stopImmediatePropagation();const {t,k}=tkAtual();if(!k||!vzEdita(t,k))return;const [f,et]=(el.value||'').split('|');
    const antes=k.etapa?etNomeE(k.fase,k.etapa):'nenhuma';etPor(t,k,f||null,et||null);k.etSit=null;k.etSitEm=null;k.regra=k.etapa&&etRegraDe(k)?.etapa===k.etapa?k.regra:k.regra;
    log(t,`Tarefa "${k.titulo}": etapa do funil ${antes} → ${k.etapa?etNomeE(k.fase,k.etapa):'nenhuma'}`);tkRe();return}},true);
document.addEventListener('submit',e=>{const f=e.target;if(f.dataset?.form!=='et-forcar')return;e.preventDefault();e.stopImmediatePropagation();const a=UI.etFz,t=T(a?.tid),p=t&&procsDe(t).find(x=>x.id===a.pid),j=new FormData(f).get('j')?.trim();
  if(!p)return;if(!j){toast('Justifique a passagem sem as tarefas.',true);return}UI.etFz=null;
  if(a.tipo==='status'){UI.etJust=j;UI.alvoProc=p.id;UI.modal='p-concluir';renderModal();return}
  UI.modal=null;renderModal();procIr(t,p,a.tipo,a.dest,{forcado:j});save();render();toast(`${t.nome}: ${a.tipo==='etapa'?etNomeE(p.fase,a.dest):etNomeS(p.fase,a.dest)}.`)},true);

/* ---------- dados: regras de exemplo e a etapa das tarefas já existentes ---------- */
(()=>{if(!S.etExemplo){S.etExemplo=true;const ent=faseEnt();
    if(!crModelos().some(m=>m.id==='mod-estudos')){const a=uid(),b=uid(),c=uid();crModelos().push({id:'mod-estudos',nome:'Estudos preliminares',dono:null,padrao:false,ativo:true,tarefas:[
      {id:a,titulo:'Estudo de massa',lista:'Fazer',prio:'alta',iniD:0,dur:5,resp:RESP_OBJ,pessoas:[],etq:['et5'],cks:[],preds:[]},
      {id:b,titulo:'Estudo de viabilidade',lista:'Backlog',prio:'alta',iniD:0,dur:3,resp:RESP_OBJ,pessoas:[{papel:'aprov',user:'Moisés'}],etq:['et4'],cks:[],preds:[{id:a,tipo:'TI',def:0}]},
      {id:c,titulo:'Minuta de permuta',lista:'Backlog',prio:'media',iniD:0,dur:3,resp:'Camila Torres',pessoas:[],etq:['et2'],cks:[],preds:[],cond:{modo:'todas',itens:[{campo:'calculado.forma_pagamento_vigente',op:'em',valores:['permuta_fisica','permuta_financeira','permuta_geral','permuta_com_torna']}]}}]})}
    etRegras().push({id:'re-estudos',fase:ent,etapa:'estudos',sub:null,modelo:'mod-estudos',titulo:null,desc:'',prazo:null,lista:'Fazer',prio:'media',resp:RESP_OBJ,cond:null,trava:false,ativo:true,ordem:0},
      {id:'re-proposta',fase:ent,etapa:'negociacao',sub:'proposta_enviada',modelo:null,titulo:'Cobrar retorno da proposta',desc:'Ligar para o vendedor ou o corretor e registrar a resposta.',prazo:5,lista:'Fazer',prio:'alta',resp:RESP_OBJ,cond:null,trava:true,ativo:true,ordem:0},
      {id:'re-contrato',fase:ent,etapa:'contrato',sub:null,modelo:null,titulo:'Revisar a minuta com o jurídico',desc:'',prazo:7,lista:'Fazer',prio:'alta',resp:'Camila Torres',cond:null,trava:false,ativo:true,ordem:0})}
  /* tarefas de antes do lote B: na etapa atual do terreno (no banco, a tarefa nova já nasce assim) */
  (S.terrenos||[]).forEach(t=>(t.tarefas||[]).forEach(k=>{if(k.etapa!==undefined||k.modelo)return;const a=etAtual(t);a?etPor(t,k,a.f,a.p.etapa):etPor(t,k)}));
  /* exemplo: o terreno em Estudos Preliminares recebe as tarefas da regra da etapa */
  if(!S.etExemplo2){S.etExemplo2=true;const t=(S.terrenos||[]).find(x=>x.neg?.status==='ativo'&&x.neg.etapa==='estudos');if(t)etEntrar(t,faseEnt(),t.neg,'etapa','estudos')}})();
/* roteiros de teste (testes/tetapa.js): rodar uma função no escopo do protótipo */
window.BKM_TESTE=Object.assign(window.BKM_TESTE||{},{escopo:(f,a)=>eval('('+f+')')(a)});
