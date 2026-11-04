/* =====================================================================
   Filtros de terrenos (decisão do Moisés, 23/out/2026): um painel só, numa
   gaveta à direita (tela cheia no celular), o mesmo em Terrenos, Mapa e Fases,
   com a mesma seleção valendo nas três páginas. Na barra da página: botão
   Filtros com o número de filtros ativos, um chip por filtro (X tira só ele),
   Limpar e as visões salvas (pessoais; as da empresa só o administrador cria).
   Dentro de um filtro as opções somam (ou); entre filtros, todos valem (e).
   "Não informado" não some calado: faixa com mínimo ou máximo deixa de fora o
   terreno sem o dado, com "Incluir sem informação (N)".
   No banco: v_terrenos (uf, vgv, corretor_ids, proposta_ativa_valor, tem_partes,
   zonas_siglas, ultima_movimentacao_em) e app.filtros_salvos.
   ===================================================================== */
P.filtro='M4 6h16M7 12h10M10 18h4';
const FX_KEY='bkm-terrenos-filtros';
/* Pipeline (e Mapa) e Funil têm cada um o seu filtro (pedido do Moisés, 4/nov/2026): ao trocar de página, guarda o da página que sai e põe o da que entra */
const FX_GK=FX_KEY+'-pag',fxGrupo=()=>UI.route==='negociacoes'?'kanban':'pipeline';
const FX_PAG=(()=>{try{return JSON.parse(sessionStorage.getItem(FX_GK)||'{}')||{}}catch(e){return {}}})();
let FX_G=null,FX_ADOTA=false;
UI.fx=UI.fx||(()=>{try{const h=location.hash.match(/[#&?]f=([^&]+)/);if(h){FX_ADOTA=true;return JSON.parse(decodeURIComponent(h[1]))}}catch(e){}return {}})();
const fxGuardaGrupo=()=>{if(FX_G)FX_PAG[FX_G]={f:UI.fx,v:UI.fxVisao||null,m:!!UI.fxVisaoMudou}};
function fxTrocaGrupo(){const g=fxGrupo();if(g===FX_G){FX_ADOTA=false;return}
  if(!FX_ADOTA){fxGuardaGrupo();const x=FX_PAG[g]||{};UI.fx=fxSoValidos(JSON.parse(JSON.stringify(x.f||{})));UI.fxVisao=x.v||null;UI.fxVisaoMudou=!!x.m}
  FX_ADOTA=false;FX_G=g;fxGuardar()}
{const _r=render;render=function(){fxTrocaGrupo();return _r.apply(this,arguments)}}
UI.fxSec=UI.fxSec||'funil';
let FX_ABERTO=false,FX_SO_RESULTADO=false,FX_SEC_TROCOU=false;

/* ---------- valores do terreno usados pelos filtros ---------- */
const STP=['apresentada','em_analise','aceita'];
const propAtiva=L=>(L||[]).filter(p=>STP.includes(p.status)).slice(-1)[0]||null;
/* última proposta ativa; dividido em partes, a soma das partes em aberto (como app.v_terrenos.proposta_ativa_valor) */
function fxProposta(t){const p=propAtiva(t.propostas);if(p)return p.valor;
  if(typeof dividida==='function'&&dividida(t)){const vs=partesAtivas(t).map(pa=>propAtiva(pa.propostas)?.valor).filter(v=>v!=null);return vs.length?vs.reduce((a,b)=>a+b,0):null}return null}
const fxPedido=t=>ofertaRef(t)?.valor??null;
const fxM2=t=>{const v=fxPedido(t),a=areaAdotada(t);return v!=null&&a?v/a:null};
const fxCidade=t=>(t.municipio||'').split(' · ')[0]||null;
const fxUF=t=>(t.municipio||'').split(' · ')[1]||null;
/* parado: última atividade, reunião realizada, passagem do funil ou log */
function fxParadoDias(t){const ds=[t.dataIdent,...(t.reunioes||[]).filter(m=>m.status==='realizada').map(m=>m.data),...(t.neg?.trilha||[]).map(x=>x.em.slice(0,10)),...procsDe(t).flatMap(p=>(p.trilha||[]).map(x=>x.em.slice(0,10))),...(t.hist||[]).map(h=>h.em.slice(0,10))].filter(Boolean).sort();
  return ds.length?diff(ds[ds.length-1],HOJE):null}
/* processos do terreno, cada um com a fase; status do Comprado vira o Concluído da fase de entrada */
const fxProcs=t=>[...(t.neg?[{...t.neg,fase:faseEnt(),_neg:true}]:[]),...procsDe(t)].map(p=>({...p,st:p.status==='comprado'?'concluido':p.status}));
const fxEtapaK=(f,e)=>f+':'+e,fxSubK=(f,s)=>f+':'+s;
const fxCorretores=t=>(t.corretores||[]).map(x=>x.cid);
const fxZonas=t=>{const a=analiseVig(t);return a?[...new Set(a.zonas.map(z=>z.sigla))]:[]};
const fxPctVgv=(v,t)=>{const g=t.neg?.viab?.vgv;return v!=null&&g?v/g*100:null};
const fxDocsVenc=t=>(t.docs||[]).some(d=>docSt(d)==='vencido');

/* ---------- definição dos filtros ----------
   tipo: 'lista' (várias opções; op(): [[valor, rótulo]]; v(t): valor ou lista de valores do terreno),
   'faixa' (mín. e máx.; v(t): número ou null), 'marca' (passa se p(t)), 'periodo' (de/até em datas) */
const FX_GRUPOS=[['funil','Funil'],['comercial','Comercial'],['local','Localização'],['terreno','Terreno'],['gestao','Gestão']];
const FX=[
  {k:'fase',g:'funil',l:'Fase',tipo:'lista',funil:true,op:()=>fasesL().filter(f=>f.ativo).map(f=>[f.k,f.nome])},
  {k:'etapa',g:'funil',l:'Etapa',tipo:'lista',funil:true,op:()=>fxFasesSel().flatMap(f=>etapasF(f).map(e=>[fxEtapaK(f,e.k),e.nome,f])),
    vis:()=>fxFasesSel().length>0,dica:'Marque uma fase para escolher as etapas.'},
  {k:'sub',g:'funil',l:'Subetapa',tipo:'lista',funil:true,op:()=>fxEtapasSel().flatMap(([f,e])=>(etapaF(f,e)?.subs||[]).map(s=>[fxSubK(f,s.k),s.nome,f])),
    vis:()=>fxEtapasSel().length>0,dica:'Marque uma etapa para escolher as subetapas.'},
  /* lista do Moisés (4/nov/2026): só estes filtros; status, prazo, aprovação, dias na etapa, rentabilidade, eixo, vários donos,
     prioridade, parado, pendências e arquivados saíram */
  {k:'temp',g:'comercial',l:'Temperatura',tipo:'lista',op:()=>[['5','5 · '+TEMP[5]],['4','4 · '+TEMP[4]],['3','3'],['2','2'],['1','1'],['na','Não avaliada']],v:t=>t.neg?String(t.neg.temp||'na'):null},
  {k:'preco',g:'comercial',l:'Preço pedido',dica2:'da oferta de referência',tipo:'faixa',un:'R$',v:fxPedido},
  {k:'m2',g:'comercial',l:'Preço pedido por m²',tipo:'faixa',un:'R$',v:fxM2},
  {k:'pvgv',g:'comercial',l:'Preço pedido em % do VGV',dica2:'VGV do estudo válido',tipo:'faixa',un:'%',v:t=>fxPctVgv(fxPedido(t),t)},
  {k:'temProp',g:'comercial',l:'Proposta ativa',dica2:'apresentada, em análise ou aceita',tipo:'lista',op:()=>[['sim','Sim'],['nao','Não']],v:t=>fxProposta(t)!=null?'sim':'nao'},
  {k:'prop',g:'comercial',l:'Proposta ativa: valor',tipo:'faixa',un:'R$',v:fxProposta},
  {k:'propM2',g:'comercial',l:'Proposta ativa: valor por m²',tipo:'faixa',un:'R$',v:t=>{const v=fxProposta(t),a=areaAdotada(t);return v!=null&&a?v/a:null}},
  {k:'propVgv',g:'comercial',l:'Proposta ativa: valor em % do VGV',tipo:'faixa',un:'%',v:t=>fxPctVgv(fxProposta(t),t)},
  {k:'vgv',g:'comercial',l:'VGV estimado',dica2:'do estudo válido',tipo:'faixa',un:'R$',v:t=>t.neg?.viab?.vgv??null},
  {k:'corretor',g:'comercial',l:'Corretor',dica2:'do terreno ou de qualquer parte',tipo:'lista',busca:true,op:()=>S.corretores.map(c=>[c.id,c.nome]),v:fxCorretores},
  {k:'forma',g:'comercial',l:'Forma de pagamento aceita',dica2:'da oferta de referência',tipo:'lista',op:()=>Object.entries(OPT.forma),v:t=>ofertaRef(t)?.forma||null},
  {k:'origem',g:'comercial',l:'Origem do cadastro',tipo:'lista',op:()=>Object.entries(OPT.origem),v:t=>t.origem||null},
  {k:'uf',g:'local',l:'Estado',tipo:'lista',op:()=>fxDistintos(fxUF),v:fxUF},
  {k:'cidade',g:'local',l:'Cidade',tipo:'lista',op:()=>fxDistintos(fxCidade,t=>!fxSel('uf').length||fxSel('uf').includes(fxUF(t))),v:fxCidade},
  {k:'zona',g:'local',l:'Região',tipo:'lista',op:()=>Object.entries(OPT.zona),v:t=>t.zona||null},
  {k:'bairro',g:'local',l:'Bairro',tipo:'lista',busca:true,op:()=>fxDistintos(t=>t.bairro,t=>!fxSel('cidade').length||fxSel('cidade').includes(fxCidade(t))),v:t=>t.bairro||null},
  {k:'zon',g:'terreno',l:'Zoneamento',dica2:'análise vigente',tipo:'lista',busca:true,op:()=>fxDistintos(fxZonas),v:fxZonas},
  {k:'area',g:'terreno',l:'Área',dica2:'área adotada',tipo:'faixa',un:'m²',v:t=>areaAdotada(t)},
  {k:'meus',g:'gestao',l:'Meus terrenos',tipo:'marca',p:t=>t.resp===me()},
  {k:'resp',g:'gestao',l:'Por analista',dica2:'responsável pelo terreno',tipo:'lista',op:()=>USERS.map(u=>[u,u]),v:t=>t.resp||null},
  {k:'ident',g:'gestao',l:'Cadastrado entre',tipo:'periodo',v:t=>t.dataIdent||null},
  {k:'incomp',g:'gestao',l:'Ficha incompleta: menos de',tipo:'numero',un:'%',menor:true,suf:'% preenchida',ph:'Ex.: 50',chip:v=>`Ficha com menos de ${v}% preenchida`,v:t=>completude(t).pct}];
const FXK=Object.fromEntries(FX.map(d=>[d.k,d]));
/* filtros que saíram (guardados na sessão, no endereço ou numa visão) não valem mais */
const fxSoValidos=f=>{Object.keys(f||{}).forEach(k=>{if(!FXK[k])delete f[k]});return f};fxSoValidos(UI.fx);
const fxConcNome=()=>{const fs=fxFasesSel();return fs.length===1?(faseCfg(fs[0])?.conc||'Concluído'):'Concluído (Comprado, Aprovado...)'};
const fxSel=k=>UI.fx[k]||[];
const fxFasesSel=()=>fxSel('fase').filter(f=>faseCfg(f));
const fxEtapasSel=()=>fxSel('etapa').map(x=>x.split(':')).filter(([f,e])=>fxFasesSel().includes(f)&&etapaF(f,e));
function fxDistintos(fv,pre){const m=new Map();S.terrenos.filter(pre||(()=>true)).forEach(t=>{[].concat(fv(t)||[]).forEach(v=>{if(v)m.set(v,v)})});return [...m.keys()].sort((a,b)=>a.localeCompare(b,'pt')).map(v=>[v,v])}

/* ---------- o filtro está ativo? quais valem? ---------- */
const fxTem=(d,f=UI.fx)=>{const v=f[d.k];if(d.tipo==='lista')return Array.isArray(v)&&v.length>0;if(d.tipo==='marca')return !!v;if(d.tipo==='faixa'||d.tipo==='periodo')return !!v&&(v.min!=null||v.max!=null);if(d.tipo==='numero')return v!=null&&v!=='';return false};
/* no quadro das fases, a descida Fases › fase › etapa já é o filtro do funil: fase, etapa e subetapa não valem lá */
const fxValeEm=(d,ctx)=>!(ctx==='kanban'&&d.funil===true)&&(!d.vis||d.vis());
const fxAtivos=ctx=>FX.filter(d=>fxTem(d)&&fxValeEm(d,ctx)&&d.k!=='arq');

/* funil: fase, etapa, subetapa e status juntos sobre o mesmo processo.
   Sem status marcado, valem os processos abertos (ativo ou Stand By). */
function fxFunil(t,f,ctx){const fs=ctx==='kanban'?[]:f.fase||[],es=ctx==='kanban'?[]:(f.etapa||[]).filter(x=>fs.includes(x.split(':')[0])),ss=ctx==='kanban'?[]:(f.sub||[]).filter(x=>es.some(e=>x.startsWith(e.split(':')[0]+':'))),st=f.status||[];
  if(!fs.length&&!st.length)return true;const ps=fxProcs(t);
  if(st.includes('sem')&&!ps.length)return !fs.length;
  const stOk=p=>st.length?st.includes(p.st):['ativo','stand_by'].includes(p.st);
  /* etapa e subetapa só restringem as fases em que o usuário escolheu alguma */
  const etOk=p=>{const daFase=es.filter(x=>x.startsWith(p.fase+':'));if(!daFase.length)return true;if(!daFase.includes(fxEtapaK(p.fase,p.etapa)))return false;
    const subsDaEtapa=ss.filter(x=>{const [ff,sk]=x.split(':');return ff===p.fase&&(etapaF(ff,p.etapa)?.subs||[]).some(s=>s.k===sk)});return !subsDaEtapa.length||subsDaEtapa.includes(fxSubK(p.fase,p.sub))};
  return ps.some(p=>(!fs.length||fs.includes(p.fase))&&stOk(p)&&etOk(p))}
function fxPassaUm(t,d,f){const v=f[d.k];
  if(d.tipo==='marca')return d.k==='arq'?true:!!d.p(t);
  if(d.tipo==='lista'){const tv=[].concat(d.v(t)??[]);return tv.some(x=>v.includes(x))}
  if(d.tipo==='faixa'){const x=d.v(t);if(x==null)return !!v.semInfo;return (v.min==null||x>=v.min)&&(v.max==null||x<=v.max)}
  if(d.tipo==='periodo'){const x=d.v(t);if(!x)return false;return (!v.min||x>=v.min)&&(!v.max||x<=v.max)}
  if(d.tipo==='numero'){const x=d.v(t);return x!=null&&(d.menor?x<Number(v):x>Number(v))}
  return true}
/* passa em tudo, menos (opcional) o filtro `fora` — para as contagens de cada opção */
function fxPassa(t,ctx,fora,f=UI.fx){if(t.situacao==='arquivado'&&!f.arq&&ctx!=='kanban')return false;
  const funFora=fora&&FXK[fora]?.funil;
  if(!funFora){if(!fxFunil(t,f,ctx))return false}else{const g={...f};delete g[fora];if(fora==='fase'){delete g.etapa;delete g.sub}if(!fxFunil(t,g,ctx))return false}
  return FX.every(d=>d.funil===true||d.k==='status'||d.k===fora||!fxTem(d,f)||!fxValeEm(d,ctx)||fxPassaUm(t,d,f))}
const fxCtx=()=>UI.route==='mapa'?'mapa':UI.route==='negociacoes'?'kanban':'terrenos';
const fxLista=(ctx=fxCtx())=>S.terrenos.filter(t=>fxPassa(t,ctx));
/* quantos ficam marcando a opção (com os outros filtros valendo) */
function fxConta(d,val,ctx){const base=S.terrenos.filter(t=>fxPassa(t,ctx,d.k));
  if(d.funil){const g={...UI.fx,[d.k]:[val]};if(d.k==='fase'){delete g.etapa;delete g.sub}return base.filter(t=>fxPassa(t,ctx,null,g)).length}
  return base.filter(t=>[].concat(d.v(t)??[]).includes(val)).length}

/* ---------- mudar o filtro ---------- */
function fxGuardar(){if(!FX_G)FX_G=fxGrupo();fxGuardaGrupo();try{sessionStorage.setItem(FX_GK,JSON.stringify(FX_PAG))}catch(e){}
  if(typeof rtSync==='function')rtSync()}
function fxLimparDependentes(){const fs=fxFasesSel();if(UI.fx.etapa){UI.fx.etapa=UI.fx.etapa.filter(x=>fs.includes(x.split(':')[0]));if(!UI.fx.etapa.length)delete UI.fx.etapa}
  const es=fxEtapasSel();if(UI.fx.sub){UI.fx.sub=UI.fx.sub.filter(x=>{const [f,s]=x.split(':');return es.some(([ff,e])=>ff===f&&(etapaF(f,e)?.subs||[]).some(z=>z.k===s))});if(!UI.fx.sub.length)delete UI.fx.sub}
  Object.keys(UI.fx).forEach(k=>{if(FXK[k]&&!fxTem(FXK[k]))delete UI.fx[k]})}
function fxAplicar(soResultado){fxLimparDependentes();fxGuardar();UI.fxVisaoMudou=!!UI.fxVisao;
  if(UI.route==='mapa'&&typeof mpRefresh==='function'){mpRefresh();const b=$('#fx-barra');if(b)b.outerHTML=fxBarra();if(!soResultado)fxDrawer();else fxRodape();return}
  FX_SO_RESULTADO=!!soResultado;render();FX_SO_RESULTADO=false;if(soResultado)fxRodape()}
const fxTira=k=>{delete UI.fx[k];if(k==='fase'){delete UI.fx.etapa;delete UI.fx.sub}if(k==='etapa')delete UI.fx.sub};

/* ---------- textos dos chips ---------- */
const fxNum=(v,un)=>un==='R$'?mi(v):un==='m²'?m2(v):num(v)+(un?' '+un:'');
function fxChipTxt(d){const v=UI.fx[d.k];
  if(d.tipo==='marca')return d.l;
  if(d.tipo==='lista'){const ops=new Map(d.op().map(o=>[o[0],o[1]]));const ls=v.map(x=>ops.get(x)||x);
    if(d.k==='etapa'||d.k==='sub')return `${d.l}: ${ls.join(', ')}`;
    return `${['status','temp'].includes(d.k)?'':d.l+': '}${ls.length>2?ls.slice(0,2).join(', ')+' +'+(ls.length-2):ls.join(', ')}`}
  if(d.tipo==='faixa'){const a=v.min!=null?fxNum(v.min,d.un):null,b=v.max!=null?fxNum(v.max,d.un):null;return `${d.l} ${a&&b?a+' a '+b:a?'≥ '+a:'até '+b}${v.semInfo?' (com sem informação)':''}`}
  if(d.tipo==='periodo')return `Cadastrado ${v.min&&v.max?fd(v.min)+' a '+fd(v.max):v.min?'desde '+fd(v.min):'até '+fd(v.max)}`;
  if(d.tipo==='numero')return d.chip?d.chip(v):`${d.l} ${v}`;
  return d.l}

/* ---------- barra da página: botão, chips, limpar, visões ---------- */
function fxBarra(ctx=fxCtx()){const at=fxAtivos(ctx),n=at.length+(UI.fx.arq&&ctx!=='kanban'?1:0),vs=fxVisoes(),cur=vs.find(v=>v.id===UI.fxVisao);
  const chips=at.map(d=>`<span class="fx-chip">${esc(fxChipTxt(d))}<button class="fx-cx" data-a="fx-tira" data-v="${d.k}" aria-label="Tirar o filtro ${esc(d.l)}" title="Tirar">${ic('close',16)}</button></span>`).join('');
  const pod=cur&&(cur.dono===me()||(!cur.dono&&ehAdmin(me())));
  return `<div class="fx-barra" id="fx-barra"><button class="fx-btn" data-a="fx-abrir" aria-pressed="${n>0}" aria-expanded="${FX_ABERTO}" aria-controls="fx-dr">${ic('filtro',18)}Filtros${n?`<span class="fx-n">${n}</span>`:''}</button>
    ${chips}${n?'<button class="linkbtn fx-limpar" data-a="fx-limpar">Limpar</button>':''}
    <span class="fx-visw"><label class="fx-vis"><span class="sr-only">Visão</span><select data-ch="fx-visao" aria-label="Visão salva"><option value="">${cur?'Nenhuma':'Visões salvas'}</option>
      ${['empresa','minhas'].map(g=>{const L=vs.filter(v=>g==='empresa'?!v.dono:v.dono);return L.length?`<optgroup label="${g==='empresa'?'Da empresa':'Minhas'}">${L.map(v=>`<option value="${v.id}" ${v.id===UI.fxVisao?'selected':''}>${esc(v.nome)}${v.id===UI.fxVisao&&UI.fxVisaoMudou?' (alterada)':''}</option>`).join('')}</optgroup>`:''}).join('')}</select></label>
    ${pod?`<button class="iconbtn fx-vx" data-a="fx-visao-x" title="Excluir a visão ${esc(cur.nome)}" aria-label="Excluir a visão ${esc(cur.nome)}">${ic('close',18)}</button>`:''}</span></div>`}

/* ---------- visões salvas (no banco: app.filtros_salvos) ---------- */
function fxVisoes(){if(!S.visoes||S.visoesV!==2){const minhas=(S.visoes||[]).filter(v=>v.dono||!/^v[1-5]$/.test(v.id));S.visoes=[{id:'v1',nome:'Meus em negociação',dono:null,f:{meus:true,fase:[faseEnt()]}},{id:'v2',nome:'Quentes (4 e 5)',dono:null,f:{temp:['4','5']}},{id:'v3',nome:'Com proposta ativa',dono:null,f:{temProp:['sim']}},...minhas];S.visoes.forEach(v=>fxSoValidos(v.f));S.visoesV=2}
  return S.visoes.filter(v=>!v.dono||v.dono===me())}

/* ---------- a gaveta ---------- */
function fxCampo(d,ctx){if(!fxValeEm(d,ctx)&&d.vis&&!d.vis())return d.dica?`<div class="fx-c"><div class="fx-l">${esc(d.l)}</div><div class="fx-hint">${esc(d.dica)}</div></div>`:'';
  const v=UI.fx[d.k],dica=d.dica2?`<small>${esc(d.dica2)}</small>`:'';
  if(d.tipo==='marca')return `<button class="fx-op fx-mk" data-a="fx-marca" data-k="${d.k}" aria-pressed="${!!v}">${v?ic('check',16):''}${esc(d.l)}${d.k==='arq'?'':` <span class="q">${fxContaMarca(d,ctx)}</span>`}</button>`;
  if(d.tipo==='lista'){let ops=d.op();const sel=v||[],q=(UI.fxBusca?.[d.k]||'').toLowerCase();
    if(d.k==='etapa'||d.k==='sub'){const fs=[...new Set(ops.map(o=>o[2]))];return `<div class="fx-c"><div class="fx-l">${esc(d.l)}${dica}</div>${fs.map(f=>`${fs.length>1||d.k==='sub'?`<div class="fx-sub">${esc(faseN(f))}</div>`:''}<div class="fx-ops">${ops.filter(o=>o[2]===f).map(o=>fxOp(d,o,sel,ctx)).join('')}</div>`).join('')}</div>`}
    const busca=d.busca&&ops.length>6?`<input class="fx-in" type="search" data-fx-busca="${d.k}" placeholder="Buscar ${esc(d.l.toLowerCase())}…" value="${esc(UI.fxBusca?.[d.k]||'')}" aria-label="Buscar ${esc(d.l.toLowerCase())}">`:'';
    if(q)ops=ops.filter(o=>sel.includes(o[0])||o[1].toLowerCase().includes(q));
    return `<div class="fx-c"><div class="fx-l">${esc(d.l)}${dica}</div>${busca}<div class="fx-ops">${ops.map(o=>fxOp(d,o,sel,ctx)).join('')||'<span class="fx-hint">Nada encontrado.</span>'}</div></div>`}
  if(d.tipo==='faixa'){const w=v||{},sem=S.terrenos.filter(t=>fxPassa(t,ctx,d.k)&&d.v(t)==null).length,fmt=x=>x==null?'':d.un==='R$'?num(x):num(x);
    return `<div class="fx-c"><div class="fx-l">${esc(d.l)}${d.un?' ('+d.un+')':''}${dica}</div><div class="fx-r"><input class="fx-in" inputmode="decimal" data-fx="${d.k}" data-p="min" placeholder="Mínimo" value="${fmt(w.min)}" aria-label="${esc(d.l)} mínimo"><span>até</span><input class="fx-in" inputmode="decimal" data-fx="${d.k}" data-p="max" placeholder="Máximo" value="${fmt(w.max)}" aria-label="${esc(d.l)} máximo"></div>
      ${sem&&fxTem(d)?`<button class="fx-op fx-mk fx-sem" data-a="fx-sem" data-k="${d.k}" aria-pressed="${!!w.semInfo}">${w.semInfo?ic('check',16):''}Incluir sem informação <span class="q">${sem}</span></button>`:''}${d.un==='R$'?'<div class="fx-hint">Aceita "12 mi" ou "800 mil".</div>':''}</div>`}
  if(d.tipo==='periodo'){const w=v||{};return `<div class="fx-c"><div class="fx-l">${esc(d.l)}</div><div class="fx-r"><input class="fx-in" type="date" data-fx="${d.k}" data-p="min" value="${w.min||''}" aria-label="De"><span>e</span><input class="fx-in" type="date" data-fx="${d.k}" data-p="max" value="${w.max||''}" aria-label="Até"></div></div>`}
  if(d.tipo==='numero')return `<div class="fx-c"><div class="fx-l">${esc(d.l)}</div><div class="fx-r1"><input class="fx-in" inputmode="numeric" data-fx="${d.k}" value="${v??''}" placeholder="${esc(d.ph||'')}" aria-label="${esc(d.l)}"><span>${esc(d.suf||'')}</span></div></div>`;
  return ''}
const fxContaMarca=(d,ctx)=>S.terrenos.filter(t=>fxPassa(t,ctx,d.k)&&d.p(t)).length;
function fxOp(d,o,sel,ctx){const on=sel.includes(o[0]),n=fxConta(d,o[0],ctx);
  return `<button class="fx-op" data-a="fx-op" data-k="${d.k}" data-v="${esc(o[0])}" aria-pressed="${on}" ${!on&&!n?'data-zero="1"':''}>${on?ic('check',16):''}${esc(o[1])} <span class="q">${n}</span></button>`}
function fxDrawer(){let el=$('#fx-dr'),sc=$('#fx-scrim');
  if(!FX_ABERTO){el?.remove();sc?.remove();document.body.classList.remove('fx-on');return}
  const ctx=fxCtx(),top=el?.querySelector('.fx-b')?.scrollTop||0;
  if(!el){sc=document.createElement('div');sc.id='fx-scrim';sc.className='fx-scrim';sc.dataset.a='fx-fechar';document.body.appendChild(sc);
    el=document.createElement('aside');el.id='fx-dr';el.className='fx-dr';el.setAttribute('role','dialog');el.setAttribute('aria-label','Filtros');document.body.appendChild(el)}
  document.body.classList.add('fx-on');
  /* uma seção por vez (pedido do Moisés, 4/nov/2026): os botões no cabeçalho trocam a seção e mostram quantos filtros cada uma tem */
  const gs=FX_GRUPOS.map(([g,l])=>{const ds=FX.filter(d=>d.g===g&&!(ctx==='kanban'&&d.funil===true));return {g,l,ds,n:ds.filter(d=>fxTem(d)&&d.k!=='arq').length+(g==='gestao'&&UI.fx.arq&&ctx!=='kanban'?1:0)}});
  if(!gs.some(x=>x.g===UI.fxSec))UI.fxSec=gs[0].g;const cur=gs.find(x=>x.g===UI.fxSec);
  const abas=`<div class="fx-abas" role="tablist" aria-label="Seções dos filtros">${gs.map(x=>`<button role="tab" class="fx-aba" data-a="fx-sec" data-v="${x.g}" aria-selected="${x.g===cur.g}" aria-controls="fx-sec-b"${x.n?` title="${x.n} filtro${x.n>1?'s':''} nesta seção"`:''}>${esc(x.l)}${x.n?`<span class="fx-sn">${x.n}</span>`:''}</button>`).join('')}</div>`;
  const corpo=`<section class="fx-s fx-s1" id="fx-sec-b" role="tabpanel"><div class="fx-sb">${cur.g==='funil'&&ctx==='kanban'?'<div class="fx-hint">No quadro, a fase e a etapa vêm da navegação (Funil › fase › etapa).</div>':''}${fxMarcasJuntas(cur.ds,ctx)}</div></section>`;
  el.innerHTML=`<div class="fx-h"><h2>Filtros</h2>${Object.keys(UI.fx).length?'<button class="linkbtn" data-a="fx-limpar">Limpar tudo</button>':''}<button class="iconbtn" data-a="fx-fechar" aria-label="Fechar filtros" title="Fechar (Esc)">${ic('close',22)}</button></div>
    ${abas}<div class="fx-b">${corpo}</div><div class="fx-f" id="fx-f">${fxRodapeHtml(ctx)}</div>`;
  if(FX_SEC_TROCOU){FX_SEC_TROCOU=false;el.querySelector('.fx-aba[aria-selected=true]')?.scrollIntoView({block:'nearest',inline:'nearest'});el.querySelector('.fx-b').scrollTop=0;return}
  el.querySelector('.fx-b').scrollTop=top}
/* marcas soltas (prazo, aprovação, pendências) ficam juntas numa linha de botões */
function fxMarcasJuntas(ds,ctx){let h='',mk=[];const sai=()=>{if(mk.length){h+=`<div class="fx-ops">${mk.join('')}</div>`;mk=[]}};
  ds.forEach(d=>{if(d.tipo==='marca')mk.push(fxCampo(d,ctx));else{sai();h+=fxCampo(d,ctx)}});sai();return h}
function fxRodapeHtml(ctx=fxCtx()){const n=fxLista(ctx).length,at=fxAtivos(ctx).length;
  return `<span class="fx-tot">${at?at+' filtro'+(at>1?'s':''):'Sem filtros'}</span>${UI.role!=='Leitura'||true?`<button class="btn sm" data-a="fx-salvar" ${at?'':'disabled'}>Salvar visão</button>`:''}<button class="btn primary sm" data-a="fx-fechar">Ver ${n} terreno${n===1?'':'s'}</button>`}
function fxRodape(){const f=$('#fx-f');if(f)f.innerHTML=fxRodapeHtml()}

/* ---------- valores digitados: "12 mi", "800 mil", "1.500.000" ---------- */
function fxLerNum(s){s=String(s||'').trim().toLowerCase().replace(/r\$\s*/,'');if(!s)return null;let mult=1;
  if(/\bmi(lh[õo]es|lhão)?\b|\bmi$/.test(s)){mult=1e6;s=s.replace(/mi.*$/,'')}else if(/\bmil\b/.test(s)){mult=1e3;s=s.replace(/mil.*$/,'')}
  s=s.trim().replace(/\./g,'').replace(',','.');const v=Number(s);return isFinite(v)&&s!==''?v*mult:null}

/* ---------- eventos ---------- */
function fxAcao(a){const k=a.dataset.k,v=a.dataset.v;
  switch(a.dataset.a){
    case 'fx-abrir':FX_ABERTO=!FX_ABERTO;if(FX_ABERTO&&UI.fichaSheet){UI.fichaSheet=null;fichaSheet()}fxDrawer();const b=$('.fx-btn');b?.setAttribute('aria-expanded',FX_ABERTO);if(FX_ABERTO)setTimeout(()=>$('#fx-dr .fx-aba[aria-selected=true]')?.focus(),30);return true;
    case 'fx-fechar':FX_ABERTO=false;fxDrawer();$('.fx-btn')?.setAttribute('aria-expanded','false');return true;
    case 'fx-sec':UI.fxSec=v;FX_SEC_TROCOU=true;fxDrawer();return true;
    case 'fx-op':{const cur=fxSel(k);UI.fx[k]=cur.includes(v)?cur.filter(x=>x!==v):[...cur,v];if(!UI.fx[k].length)fxTira(k);fxAplicar();return true}
    case 'fx-marca':UI.fx[k]=!UI.fx[k];if(!UI.fx[k])delete UI.fx[k];fxAplicar();return true;
    case 'fx-sem':UI.fx[k]={...UI.fx[k],semInfo:!UI.fx[k]?.semInfo};fxAplicar();return true;
    case 'fx-tira':fxTira(v);fxAplicar();return true;
    case 'fx-limpar':UI.fx={};UI.fxVisao=null;UI.fxVisaoMudou=false;fxAplicar();toast('Filtros limpos.');return true;
    case 'fx-salvar':UI.modal='fx-salvar';renderModal();return true;
    case 'fx-visao-x':{const x=S.visoes.find(z=>z.id===UI.fxVisao);if(!x)return true;S.visoes=S.visoes.filter(z=>z!==x);UI.fxVisao=null;save();fxAplicar();toast(`Visão "${x.nome}" excluída.`);return true}
  }return false}
function fxMudou(el){if(el.dataset.ch==='fx-visao'){const x=S.visoes.find(z=>z.id===el.value);UI.fxVisao=x?.id||null;if(x)UI.fx=JSON.parse(JSON.stringify(x.f));fxAplicar();UI.fxVisaoMudou=false;const b=$('#fx-barra');if(b)b.outerHTML=fxBarra();return true}
  if(el.dataset.fx){fxDigitado(el,false);return true}return false}
function fxDigitado(el,soResultado){const d=FXK[el.dataset.fx];if(!d)return;
  if(d.tipo==='numero'){const n=parseInt(el.value,10);if(isFinite(n)&&n>=0)UI.fx[d.k]=n;else delete UI.fx[d.k]}
  else{const w={...(UI.fx[d.k]||{})},p=el.dataset.p,val=d.tipo==='periodo'?(el.value||null):fxLerNum(el.value);w[p]=val;UI.fx[d.k]=w;if(!fxTem(d))delete UI.fx[d.k]}
  fxAplicar(soResultado)}
document.addEventListener('click',e=>{const a=e.target.closest('[data-a^="fx-"]');if(!a)return;if(fxAcao(a)){e.preventDefault();e.stopImmediatePropagation()}},true);
document.addEventListener('change',e=>{const el=e.target;if(el.closest&&(el.closest('#fx-dr')||el.closest('#fx-barra'))&&fxMudou(el)){e.stopImmediatePropagation()}},true);
/* enquanto digita: só o resultado muda (a gaveta não redesenha, para não perder o cursor) */
document.addEventListener('input',e=>{const el=e.target;if(!el.closest||!el.closest('#fx-dr'))return;e.stopImmediatePropagation();
  if(el.dataset.fxBusca){UI.fxBusca={...(UI.fxBusca||{}),[el.dataset.fxBusca]:el.value};const k=el.dataset.fxBusca,pos=el.selectionStart;fxDrawer();const n=$(`#fx-dr [data-fx-busca="${k}"]`);if(n){n.focus();n.setSelectionRange(pos,pos)}return}
  if(el.dataset.fx&&el.type!=='date'){clearTimeout(el._t);el._t=setTimeout(()=>fxDigitado(el,true),250)}},true);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&FX_ABERTO&&!UI.modal){FX_ABERTO=false;fxDrawer();$('.fx-btn')?.setAttribute('aria-expanded','false');e.preventDefault();e.stopImmediatePropagation()}},true);
/* a gaveta acompanha cada redesenho da página (troca de página, de papel...), menos enquanto se digita nela */
const _posRenderFx=posRender;posRender=function(){_posRenderFx.apply(this,arguments);if(!['terrenos','mapa','negociacoes'].includes(UI.route))FX_ABERTO=false;if(!FX_SO_RESULTADO)fxDrawer()};
/* a gaveta e o painel da ficha no mapa não abrem juntos */
const _fichaSheetFx=fichaSheet;fichaSheet=function(){if(UI.fichaSheet&&FX_ABERTO){FX_ABERTO=false;fxDrawer()}return _fichaSheetFx.apply(this,arguments)};

/* ---------- salvar visão ---------- */
function fxSalvarHtml(fechar){const adm=ehAdmin(me());
  return `<div class="dh"><div><h2>Salvar visão</h2><div class="muted" style="margin-top:4px">Guarda os filtros de agora com um nome, para voltar a eles pelo seletor Visão.</div></div>${fechar}</div>
  <form data-form="fx-salvar" id="f-fxs"><div class="fields"><div class="field full"><label for="fxs-n">Nome</label><input id="fxs-n" name="nome" required maxlength="60" placeholder="Ex.: Quentes em São Paulo"></div>
  ${adm?'<label class="chk full"><input type="checkbox" name="empresa">Para toda a empresa (todos veem; só o administrador muda)</label>':''}</div></form>
  <div class="df"><button class="btn text" data-a="close">Cancelar</button><button class="btn primary" type="submit" form="f-fxs">Salvar</button></div>`}
const _renderModalFx=renderModal;renderModal=function(){if(UI.modal==='fx-salvar'){const el=$('#modal'),fechar=`<button class="iconbtn" data-a="close" aria-label="Fechar">${ic('close')}</button>`;
  el.innerHTML=`<div class="scrim" data-a="scrim"><div class="dialog" role="dialog" aria-modal="true">${fxSalvarHtml(fechar)}</div></div>`;setTimeout(()=>$('#fxs-n')?.focus(),30);return}return _renderModalFx.apply(this,arguments)};
document.addEventListener('submit',e=>{const f=e.target;if(f.dataset?.form!=='fx-salvar')return;e.preventDefault();e.stopImmediatePropagation();
  const nome=f.nome.value.trim(),emp=!!f.empresa?.checked,dono=emp?null:me();if(!nome)return;fxVisoes();
  const igual=S.visoes.find(v=>v.nome.toLowerCase()===nome.toLowerCase()&&v.dono===dono);if(igual){toast('Já existe uma visão com esse nome.',true);return}
  const v={id:'v'+Date.now().toString(36),nome,dono,f:JSON.parse(JSON.stringify(UI.fx))};S.visoes.push(v);UI.fxVisao=v.id;UI.fxVisaoMudou=false;save();UI.modal=null;renderModal();
  const b=$('#fx-barra');if(b)b.outerHTML=fxBarra();toast(`Visão "${nome}" salva${emp?' para a empresa':''}.`)},true);
