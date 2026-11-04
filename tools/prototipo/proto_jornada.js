/* =====================================================================
   Jornada do terreno (decisões do Moisés, 1/nov/2026; simulação "Jornada do
   terreno"). Espelha app.jornada_itens, app.jornada_regras,
   app.campos_terreno / terreno_valores, a regra do checklist e do
   pré-requisito e app._jornada_pendencias / _jornada_pede.
   - Configurações › Funil › Jornada (só administrador): por fase e etapa,
     num lugar só, o que a etapa e cada subetapa pedem para avançar:
     perguntas e campos, documentos, pré-requisitos e tarefas (as Tarefas da
     etapa, o Checklist e os Pré-requisitos deixaram de ser abas próprias).
   - Cada pergunta diz onde grava: um campo do terreno (catálogo) ou um campo
     novo do terreno, criado ali. Fonte única: a resposta é o próprio campo,
     que a ficha, o cartão da tarefa e a jornada leem e gravam.
   - Cada item tem a regra se estiver em branco (não avança sem, avança com
     justificativa, pode avançar) e o "Vale quando": fora da condição, não
     aparece nem trava.
   - Regras pelo valor da resposta: quando a condição vale, não avança, pede
     aprovação do gestor ou do diretor, ou só avisa.
   - No quadro de avanço da ficha, o bloco "O que esta etapa pede" com as
     perguntas para responder ali mesmo; "avança com justificativa" deixa o
     analista passar justificando; "não avança sem", só gestor e diretor.
   - Item da etapa vale para sair da etapa; item de uma subetapa, para sair
     dela (e da etapa). Voltar não exige nada.
   Injetado no mesmo escopo, depois de proto_etapa.js.
   ===================================================================== */
IT_ORIG.personalizado='Campo novo do terreno';
const jnItens=()=>cfg().jornada||(cfg().jornada=[]);
const jnRegrasV=()=>cfg().jornadaRegras||(cfg().jornadaRegras=[]);
const jnCampos=()=>S.camposTer||(S.camposTer=[]);
const JN_REGRA={bloqueia:'Não avança sem',justifica:'Avança com justificativa',livre:'Pode avançar'};
const JN_REGRA_F={bloqueia:'não avança',justifica:'avança com justificativa',livre:'pode avançar'};
/* regra em branco: única ou condicional (rc = [{cond, regra}], a primeira que vale decide; como app._regra_branco) */
const jnRegraEf=(t,base,rc)=>{for(const x of rc||[])if(x.cond&&itCondVale(t,x.cond))return x.regra;return base};
const jnRcFrase=(rc,base)=>rc&&rc.length?rc.map(x=>`${JN_REGRA_F[x.regra]} quando ${itCondFrase(x.cond)}`).join('; ')+`; nos demais casos, ${JN_REGRA_F[base]}`:'';
/* base de cada tipo de item (pergunta, documento, pré-requisito, tarefa) */
const jnBaseCk=c=>c.regra||(!c.obrig?'livre':c.just?'justifica':'bloqueia');
const jnBasePr=p=>p.regra||(p.just?'justifica':'bloqueia');
const jnBaseTar=r=>r.regra||(r.trava?'bloqueia':'livre');
const JN_SELO={bloqueia:'necessário',justifica:'pede justificativa'};
const JN_ACAO={bloqueia:'Não avança',diretor:'Pede aprovação do diretor',gestor:'Pede aprovação do gestor',avisa:'Só avisa'};
const JN_TIPO={texto:'Texto',numero:'Número',data:'Data',lista:'Lista de opções',sim_nao:'Sim ou não'};
const JN_UN={'':'Sem unidade','m²':'m²',m:'m','R$':'R$ (moeda)','%':'% (percentual)'};

/* campo novo do terreno vira um campo do catálogo (condição, cartão, jornada, Configurações › Campos) */
function jnRegistra(c){const ch='personalizado.'+c.codigo,i=IT_CAT.findIndex(x=>x.chave===ch),on=c.ativo!==false;
  const d={chave:ch,origem:'personalizado',coluna:c.codigo,titulo:c.titulo,tipo:c.tipo,un:c.unidade||null,
    opcoes:c.tipo==='lista'?()=>Object.fromEntries((c.opcoes||[]).map(o=>[o,o])):null,vazio:null,editavel:on,condicao:on,cartao:on,
    ler:t=>(t.cpers||{})[c.codigo],gravar:(t,v)=>{t.cpers=t.cpers||{};if(v==null||v==='')delete t.cpers[c.codigo];else t.cpers[c.codigo]=v},
    formato:c.unidade==='R$'?'moeda':c.unidade==='%'?'percentual':null};
  if(i>=0)IT_CAT[i]=d;else IT_CAT.push(d)}

/* ---------- regras: o que vale na passagem (como app._jornada_na_saida) ---------- */
function jnNaSaida(f,p,tipo,dest,x){if(!p||x.etapa!==p.etapa)return false;
  if(tipo==='status')return dest==='comprado'||dest==='concluido';
  if(tipo==='etapa')return etIx(f,dest)>etIx(f,p.etapa);
  if(tipo==='subetapa'){if(!x.sub)return false;const a=etSubIx(f,p.etapa,x.sub);return a>=etSubIx(f,p.etapa,p.sub)&&a<etSubIx(f,p.etapa,dest)}
  return false}
const jnTxt=i=>i.pergunta||itTit(i.campo);
const jnVale=(t,x)=>itCondVale(t,x.cond);
function jnPend(t,f,p,tipo,dest){const L=[];
  jnItens().filter(i=>i.fase===f&&i.ativo!==false&&itDef(i.campo)&&jnNaSaida(f,p,tipo,dest,i)&&jnVale(t,i)).forEach(i=>{const rg=jnRegraEf(t,i.regra,i.rc);if(rg==='livre')return;const ok=itVal(t,i.campo)!=null;
    L.push({ok,txt:jnTxt(i)+(ok?'':': não informado'),just:rg==='justifica',jn:i.id,fix:ok||f!==faseEnt()?null:['jn-ir','Responder']})});
  jnRegrasV().filter(r=>r.fase===f&&r.ativo!==false&&(r.acao==='bloqueia'||r.acao==='avisa')&&jnNaSaida(f,p,tipo,dest,r)&&jnVale(t,r))
    .forEach(r=>L.push({ok:r.acao==='avisa',aviso:r.acao==='avisa',txt:r.msg}));
  return L}
/* regra pelo valor que pede aprovação (entra em aprovExig) */
function jnPede(t,tipo,dest,nivel){if(!t||t._parte||!t.neg)return false;const f=faseEnt();
  return jnRegrasV().some(r=>r.fase===f&&r.ativo!==false&&r.acao===nivel&&jnNaSaida(f,t.neg,tipo,dest,r)&&jnVale(t,r))}

/* ---------- ganchos ---------- */
{const pd=pendencias;pendencias=function(t,tipo,dest){const L=pd(t,tipo,dest);if(t._parte||!t.neg)return L;return L.concat(jnPend(t,faseEnt(),t.neg,tipo,dest))}}
/* fases depois da entrada: a jornada trava também (analista justifica só o que pede justificativa) */
{const pi=procIr;procIr=function(t,p,tipo,dest,d={}){if(!d.forcado){const L=jnPend(t,p.fase,p,tipo,dest).filter(x=>!x.ok);
    if(L.length){UI.jnFz={tid:t.id,pid:p.id,tipo,dest,itens:L};UI.alvo=t.id;UI.modal=nivelDe(me())>=2||L.every(x=>x.just)?'jn-forcar':'jn-bloq';setTimeout(renderModal,0);return false}}
  return pi(t,p,tipo,dest,d)}}

/* ---------- quadro de avanço: o que esta etapa pede ---------- */
function jnInfo(t,i){const d=itDef(i.campo);if(!d)return null;const o=d.opcoes?d.opcoes():null;
  return {tipo:d.tipo,formato:d.formato,opcoes:o&&d.tipo!=='pessoa'?Object.entries(o):null,pessoas:d.tipo==='pessoa'?Object.keys(o||{}):null,titulo:d.titulo,editavel:d.editavel,valor:itVal(t,i.campo),un:d.un}}
function jnControle(t,i,ro){const f=jnInfo(t,i);if(!f)return '';
  return fmControle(t,null,{id:i.id,forma:i.forma},f,ro).replaceAll('data-a="fm-v"','data-a="jn-v"').replaceAll('data-fm=','data-jn=').replaceAll('id="fm-','id="jn-').replaceAll('name="fm-','name="jn-')}
function jnSelo(i,ok,t){const rg=jnRegraEf(t,i.regra,i.rc);if(rg==='livre'||ok)return '';return `<span class="jn-selo ${rg}">${JN_SELO[rg]}</span>`}
function jnBloco(t,f,p){if(!p||p.status!=='ativo')return '';const L=jnItens().filter(i=>i.fase===f&&i.ativo!==false&&i.etapa===p.etapa&&itDef(i.campo))
    .sort((a,b)=>(a.sub?etSubIx(f,p.etapa,a.sub)+1:0)-(b.sub?etSubIx(f,p.etapa,b.sub)+1:0)||(a.ordem||0)-(b.ordem||0));
  const R=jnRegrasV().filter(r=>r.fase===f&&r.ativo!==false&&r.etapa===p.etapa&&jnVale(t,r));if(!L.length&&!R.length)return '';
  const ro=UI.role==='Leitura',vale=L.filter(i=>jnVale(t,i)),fora=L.filter(i=>!jnVale(t,i)),resp=vale.filter(i=>itVal(t,i.campo)!=null).length;
  const grupos=[];vale.forEach(i=>{const k=i.sub||'';let g=grupos.find(x=>x.k===k);if(!g)grupos.push(g={k,itens:[]});g.itens.push(i)});
  const nomeG=k=>k?(k===p.sub?`${etNomeS(f,k)} (subetapa atual)`:etNomeS(f,k)):'Para sair da etapa';
  const linha=i=>{const ok=itVal(t,i.campo)!=null,d=itDef(i.campo);return `<div class="jn-q ${ok?'ok':''}" data-mid="jn-${i.id}" id="jnq-${i.id}"><div class="jn-ql"><label class="jn-qt" for="jn-${i.id}">${esc(jnTxt(i))}</label>${jnSelo(i,ok,t)}</div>
    ${i.ajuda?`<div class="jn-aj faint">${esc(i.ajuda)}</div>`:''}<div class="jn-qc">${jnControle(t,i,ro)}</div>${d.origem==='personalizado'?'':`<div class="jn-dest faint">grava em ${esc(IT_ORIG[d.origem])} › ${esc(d.titulo)}</div>`}</div>`};
  const regras=R.map(r=>`<div class="jn-rv ${r.acao}">${ic(r.acao==='avisa'?'warn':r.acao==='bloqueia'?'block':'check',16)}<span>${esc(r.msg)}${r.acao==='gestor'||r.acao==='diretor'?` <span class="faint">· pede aprovação do ${r.acao}</span>`:r.acao==='bloqueia'?' <span class="faint">· não avança</span>':''}</span></div>`).join('');
  return `<div class="jn-bloco" id="jn-bloco"><div class="jn-h"><b>O que esta etapa pede</b>${vale.length?`<span class="faint">${resp} de ${vale.length}</span><span class="fm-prog" aria-hidden="true"><i style="width:${Math.round(100*resp/vale.length)}%"></i></span>`:''}</div>
    ${regras}${grupos.map(g=>`<div class="jn-g"><div class="jn-gt">${esc(nomeG(g.k))}</div>${g.itens.map(linha).join('')}</div>`).join('')}
    ${fora.length?`<button class="linkbtn jn-fora-b" data-a="jn-fora" aria-expanded="${!!UI.jnFora}">${UI.jnFora?'Ocultar':'Ver'} o que não se aplica agora (${fora.length})</button>${UI.jnFora?`<ul class="jn-fora">${fora.map(i=>`<li><span>${esc(jnTxt(i))}</span><span class="faint">vale quando ${esc(itCondFrase(i.cond))}</span></li>`).join('')}</ul>`:''}`:''}</div>`}
{const pn=painelNeg;painelNeg=function(t){const h=pn(t);const n=t.neg;if(!n||n.status!=='ativo'||dividida(t))return h;const b=jnBloco(t,faseEnt(),n);return b?h.replace(/<\/div><\/section>$/,b+'</div></section>'):h}}
{const pp=painelProc;painelProc=function(t,p){const h=pp(t,p);const b=jnBloco(t,p.fase,p);return b?h.replace(/<\/div><\/section>$/,b+'</div></section>'):h}}

/* gravar a resposta: no próprio campo do terreno, com log */
function jnGravar(t,i,raw){const d=itDef(i.campo);if(!t||!d||!d.editavel||UI.role==='Leitura')return;let v=raw;
  if(v===''||v==null)v=null;
  else if(d.tipo==='sim_nao')v=v===true||v==='s'||v==='1'?true:v===false||v==='n'||v==='0'?false:null;
  else if(d.tipo==='numero'){v=typeof v==='number'?v:cpoNum(v);if(Number.isNaN(v)){toast(`Número inválido em ${jnTxt(i)}.`,true);render();return}}
  else if(d.tipo==='texto'&&d.formato){try{v=fmValida(d.formato,v)}catch(er){toast(er.message,true);render();return}}
  else if(typeof v==='string'&&d.tipo!=='data')v=v.trim()||null;
  const antes=itVal(t,d.chave);if(String(antes??'')===String(v??''))return;
  try{d.gravar(t,v??d.vazio??null)}catch(er){toast(er.message,true);return}
  log(t,`${d.titulo} de ${itTxtVal(d,antes)} para ${itTxtVal(d,v)} (pela jornada)`);save();render()}

/* ---------- Configurações › Funil › Jornada ---------- */
const jnCk=e=>cfg().checklist[e]||(cfg().checklist[e]=[]);
const JN_REGRA_SEL={...JN_REGRA,cond:'Condicional…'};
/* seletor da regra em branco (única ou condicional) e a frase da condicional, pela chave do item */
const jnRegraSel=(k,base,rc,rot)=>jnSel(`data-jnr="${k}"`,rc&&rc.length?'cond':base,JN_REGRA_SEL,rot);
const jnRcLinha=(k,base,rc)=>rc&&rc.length?`<span class="it-vq et-vq jn-rcf">${esc(jnRcFrase(rc,base).replace(/^./,c=>c.toUpperCase()))}. <button class="linkbtn" data-a="jn-rc" data-v="${esc(k)}">Editar</button></span>`:'';
const jnSel=(attr,v,opc,rot)=>`<select class="jn-rs" ${attr} aria-label="${esc(rot)}">${Object.entries(opc).map(([k,n])=>`<option value="${k}" ${k===v?'selected':''}>${esc(n)}</option>`).join('')}</select>`;
function jnLinha(icone,nome,meta,regra,vq,acoes,cls=''){return `<div class="jn-r ${cls}"><span class="jn-ri">${ic(icone,18)}</span><div class="jn-rn"><b>${nome}</b>${meta?`<span class="faint">${meta}</span>`:''}${vq||''}</div><div class="jn-rr">${regra||''}</div><div class="jn-ra">${acoes||''}</div></div>`}
const jnVq=(c,a,v)=>`<span class="it-vq et-vq">${c?'vale quando '+esc(itCondFrase(c)):'<span class="faint">vale sempre</span>'}<button class="linkbtn" data-a="${a}" data-v="${esc(v)}">${c?'Editar':'+ Condição'}</button></span>`;
function jnItemLinha(i){const d=itDef(i.campo),f=d?{tipo:d.tipo,opcoes:d.opcoes?Object.entries(d.opcoes()):null}:null,fs=f?fmFormas(f.tipo,f.opcoes?.length):[];
  const meta=d?`${d.origem==='personalizado'?'Campo novo do terreno':'Grava em '+esc(IT_ORIG[d.origem])+' › '+esc(d.titulo)} · ${esc(IT_TIPO[d.tipo]||d.tipo)}${fs.length>1?' · '+esc(FM_FORMA[fs.includes(i.forma)?i.forma:fs[0]]):''}${d.editavel?'':' · só leitura'}`:'campo removido';
  return jnLinha('edit',esc(jnTxt(i)),meta,jnRegraSel('it:'+i.id,i.regra,i.rc,'Se estiver em branco'),jnVq(i.cond,'jn-cond',i.id)+jnRcLinha('it:'+i.id,i.regra,i.rc),
    `<button class="btn sm text" data-a="jn-ed" data-v="${i.id}">Editar</button><button class="iconbtn sm lixo" data-a="jn-x" data-v="${i.id}" aria-label="Tirar da jornada" title="Tirar da jornada">${ic('lixo',18)}</button>`)}
function jnTarLinha(f,r){const m=r.modelo?crModelos().find(x=>x.id===r.modelo):null;
  return jnLinha('task',r.modelo?`Modelo ${esc(m?.nome||'(removido)')}`:esc(r.titulo),`Tarefa${r.modelo?'s':''} ao entrar${r.sub?' em '+esc(etNomeS(f,r.sub)):' na etapa'}${r.ativo===false?' · desativada':''}`,
    jnRegraSel('tar:'+r.id,jnBaseTar(r),r.rc,'Tarefas abertas'),
    `<span class="it-vq et-vq">${r.cond?'vale quando '+esc(itCondFrase(r.cond)):'<span class="faint">vale sempre</span>'}</span>`+jnRcLinha('tar:'+r.id,jnBaseTar(r),r.rc),
    `<button class="btn sm text" data-a="et-regra-ed" data-v="${r.id}">Editar</button><button class="iconbtn sm lixo" data-a="et-regra-x" data-v="${r.id}" aria-label="Apagar regra" title="Apagar regra">${ic('lixo',18)}</button>`,r.ativo===false?'inativa':'')}
function jnDocLinha(e,c){return jnLinha('doc',esc(TIPOS_DOC[c.doc]?.[0]||c.doc),'Documento validado',jnRegraSel(`doc:${e}:${c.doc}`,jnBaseCk(c),c.rc,'Se faltar'),etVq(`ck:${e}:${c.doc}`,c.cond)+jnRcLinha(`doc:${e}:${c.doc}`,jnBaseCk(c),c.rc),
  `<button class="iconbtn sm lixo" data-a="jn-doc-x" data-e="${e}" data-v="${c.doc}" aria-label="Tirar documento" title="Tirar da jornada">${ic('lixo',18)}</button>`)}
function jnPreLinha(p){return jnLinha('flow',`Ter passado por ${esc(subN(p.req))}`,`Para entrar em ${esc(destinoNome(p.alvoTipo,p.alvo))}`,jnRegraSel('pr:'+p.id,jnBasePr(p),p.rc,'Sem ter passado'),
  etVq('pr:'+p.id,p.cond)+jnRcLinha('pr:'+p.id,jnBasePr(p),p.rc),`<button class="iconbtn sm lixo" data-a="cfg-pre-del" data-v="${p.id}" aria-label="Tirar pré-requisito" title="Tirar da jornada">${ic('lixo',18)}</button>`)}
function jnAdd(f,e,s,tipos){return `<div class="jn-adds">${tipos.map(([a,l])=>`<button class="tkm-add" data-a="${a}" data-f="${f}" data-e="${e}" data-s="${s||''}">${ic('add',16)}${l}</button>`).join('')}</div>`}
function jnCfgHtml(){const fs=fasesL().filter(f=>f.ativo!==false),f=fs.some(x=>x.k===UI.jnFase)?UI.jnFase:faseEnt(),ent=f===faseEnt(),es=etapasF(f),e=es.some(x=>x.k===UI.jnEtapa)?UI.jnEtapa:es[0]?.k,E=es.find(x=>x.k===e);
  const its=jnItens().filter(i=>i.fase===f),tars=etRegras().filter(r=>r.fase===f),C=cfg();
  const conta=k=>its.filter(i=>i.etapa===k).length+tars.filter(r=>r.etapa===k).length+(ent?jnCk(k).length+C.prereq.filter(p=>p.alvoTipo==='etapa'?p.alvo===k:subCfg(p.alvo)?.etapa===k).length:0)+jnRegrasV().filter(r=>r.fase===f&&r.etapa===k).length;
  const ord=(a,b)=>(a.ordem||0)-(b.ordem||0);
  const docAdd=ent?[['jn-doc','Documento']]:[];
  const corpo=!E?'<p class="faint">Esta fase não tem etapas.</p>':`
    ${ent?`<section class="sec jn-sec"><div class="sec-h"><h2>Para entrar em ${esc(E.nome)}</h2></div><div class="sec-b">${C.prereq.filter(p=>p.alvoTipo==='etapa'?p.alvo===e:subCfg(p.alvo)?.etapa===e).map(jnPreLinha).join('')||'<p class="faint jn-vazio">Entrada livre.</p>'}${jnAdd(f,e,'',[['jn-pre','Pré-requisito']])}</div></section>`:''}
    <section class="sec jn-sec"><div class="sec-h"><h2>Para sair de ${esc(E.nome)}</h2></div><div class="sec-b">
      ${its.filter(i=>i.etapa===e&&!i.sub).sort(ord).map(jnItemLinha).join('')}${ent?jnCk(e).map(c=>jnDocLinha(e,c)).join(''):''}${tars.filter(r=>r.etapa===e&&!r.sub).map(r=>jnTarLinha(f,r)).join('')}
      ${its.some(i=>i.etapa===e&&!i.sub)||(ent&&jnCk(e).length)||tars.some(r=>r.etapa===e&&!r.sub)?'':'<p class="faint jn-vazio">Nada exigido para sair da etapa.</p>'}
      ${jnAdd(f,e,'',[['jn-nova','Pergunta'],...docAdd,['jn-tar','Tarefa']])}</div></section>
    ${E.subs.map(s=>{const a=its.filter(i=>i.etapa===e&&i.sub===s.k).sort(ord),b=tars.filter(r=>r.etapa===e&&r.sub===s.k);
      return `<section class="sec jn-sec"><div class="sec-h"><h2>Para sair de ${esc(s.nome)}</h2><span class="faint">subetapa</span></div><div class="sec-b">${a.map(jnItemLinha).join('')}${b.map(r=>jnTarLinha(f,r)).join('')}${a.length||b.length?'':'<p class="faint jn-vazio">Nada exigido.</p>'}${jnAdd(f,e,s.k,[['jn-nova','Pergunta'],['jn-tar','Tarefa']])}</div></section>`}).join('')}
    <section class="sec jn-sec"><div class="sec-h"><h2>Regras pelo valor da resposta</h2></div><div class="sec-b">
      ${jnRegrasV().filter(r=>r.fase===f&&r.etapa===e).sort(ord).map(r=>jnLinha('raio',esc(r.msg),`${r.sub?'Para sair de '+esc(etNomeS(f,r.sub)):'Para sair da etapa'} · quando ${esc(itCondFrase(r.cond))}`,
        jnSel(`data-jnr="rv:${r.id}"`,r.acao,JN_ACAO,'O que acontece'),'',`<button class="btn sm text" data-a="jn-rv-ed" data-v="${r.id}">Editar</button><button class="iconbtn sm lixo" data-a="jn-rv-x" data-v="${r.id}" aria-label="Apagar regra" title="Apagar regra">${ic('lixo',18)}</button>`)).join('')||'<p class="faint jn-vazio">Nenhuma regra. Exemplo: relevo acidentado crítico pede aprovação do diretor.</p>'}
      ${jnAdd(f,e,'',[['jn-rv-nova','Regra']])}</div></section>`;
  return `<section class="sec"><div class="sec-h"><h2>Jornada</h2></div><div class="sec-b">
    <p class="muted" style="margin-top:0">O que cada etapa e subetapa pede para avançar: perguntas e campos (a resposta grava no próprio campo do terreno), documentos, pré-requisitos e tarefas. Cada item pode ter condição. Não avança sem: gestor e diretor passam com justificativa. Avança com justificativa: qualquer um passa justificando.</p>
    <div class="seg sm et-fases" role="group" aria-label="Fase">${fs.map(x=>`<button data-a="jn-fase" data-v="${x.k}" aria-pressed="${x.k===f}">${esc(x.nome)}</button>`).join('')}</div></div></section>
  <div class="jn-lay"><nav class="jn-et" aria-label="Etapas">${es.map(x=>`<button data-a="jn-etapa" data-v="${x.k}" aria-pressed="${x.k===e}"><span>${esc(x.nome)}</span><span class="faint">${conta(x.k)||''}</span></button>`).join('')}</nav><div class="stack jn-corpo">${corpo}</div></div>`}

/* ---------- editores ---------- */
function jnLugarSel(id,f,e,s){const E=etapaF(f,e);return `<select id="${id}" data-jne="sub"><option value="">${esc(E?.nome||'')} (a etapa toda)</option>${(E?.subs||[]).map(x=>`<option value="${x.k}" ${x.k===s?'selected':''}>${esc(x.nome)}</option>`).join('')}</select>`}
function jnItemHtml(fechar){const E=UI.jnEd;if(!E)return '';const d=E.campo&&E.campo!=='__novo'?itDef(E.campo):null;
  const usados=jnItens().filter(i=>i.id!==E.id&&i.fase===E.fase&&i.etapa===E.etapa&&(i.sub||null)===(E.sub||null)).map(i=>i.campo);
  const grupos=Object.entries(IT_ORIG).map(([o,n])=>{const L=IT_CAT.filter(c=>c.origem===o&&(c.chave===E.campo||!usados.includes(c.chave))&&(itDef(c.chave).editavel||c.chave===E.campo||o!=='personalizado')).map(c=>itDef(c.chave));
    return L.length?`<optgroup label="${esc(n)}">${L.map(c=>`<option value="${c.chave}" ${c.chave===E.campo?'selected':''}>${esc(c.titulo)}${c.editavel?'':' (só leitura)'}</option>`).join('')}</optgroup>`:''}).join('');
  const N=E.novo||{},tipo=d?d.tipo:N.tipo||'texto',nop=d?(d.opcoes?Object.keys(d.opcoes()).length:0):(N.opcoes||'').split('\n').filter(x=>x.trim()).length,formas=fmFormas(tipo,nop);
  return `<div class="dh"><div><h2>${E.id?'Editar pergunta':'Nova pergunta'}</h2><div class="muted" style="margin-top:4px">${esc(faseN(E.fase))} › ${esc(etNomeE(E.fase,E.etapa))}</div></div>${fechar}</div>
  <div class="fields jn-form">
    <div class="field"><label for="jne-s">Vale para sair de</label>${jnLugarSel('jne-s',E.fase,E.etapa,E.sub)}</div>
    <div class="field"><label for="jne-c">Onde grava a resposta</label><select id="jne-c" data-jne="campo"><option value="">Escolha o campo</option>${grupos}<option value="__novo" ${E.campo==='__novo'?'selected':''}>Criar campo novo do terreno…</option></select></div>
    ${E.campo==='__novo'?`<div class="field"><label for="jne-nt">Nome do campo novo</label><input id="jne-nt" data-jne="n.titulo" value="${esc(N.titulo||'')}" placeholder="Ex.: Recuo frontal atende"></div>
      <div class="field"><label for="jne-ny">Tipo</label><select id="jne-ny" data-jne="n.tipo">${Object.entries(JN_TIPO).map(([k,n])=>`<option value="${k}" ${k===(N.tipo||'texto')?'selected':''}>${n}</option>`).join('')}</select></div>
      ${(N.tipo||'texto')==='lista'?`<div class="field full"><label for="jne-no">Opções (uma por linha)</label><textarea id="jne-no" data-jne="n.opcoes" placeholder="Sim&#10;Não&#10;A verificar">${esc(N.opcoes||'')}</textarea></div>`:''}
      ${(N.tipo||'texto')==='numero'?`<div class="field"><label for="jne-nu">Unidade</label><select id="jne-nu" data-jne="n.unidade">${Object.entries(JN_UN).map(([k,n])=>`<option value="${k}" ${k===(N.unidade||'')?'selected':''}>${n}</option>`).join('')}</select></div>`:''}
      <p class="field full faint" style="margin:0">O campo novo entra no terreno: aparece em Configurações › Campos, nas condições e no cartão da tarefa.</p>`:''}
    ${d||E.campo==='__novo'?`<div class="field full"><label for="jne-p">Pergunta</label><input id="jne-p" data-jne="pergunta" value="${esc(E.pergunta||'')}" placeholder="${esc(d?.titulo||N.titulo||'Texto da pergunta')}"></div>
    <div class="field full"><label for="jne-a">Ajuda (opcional)</label><input id="jne-a" data-jne="ajuda" value="${esc(E.ajuda||'')}" placeholder="Uma linha para orientar quem responde"></div>
    ${formas.length>1?`<div class="field"><label for="jne-f">Forma de responder</label><select id="jne-f" data-jne="forma">${formas.map(x=>`<option value="${x}" ${x===(formas.includes(E.forma)?E.forma:formas[0])?'selected':''}>${FM_FORMA[x]}</option>`).join('')}</select></div>`:''}
    ${d&&!d.editavel?'<p class="field full faint" style="margin:0">Campo só de leitura: a pergunta mostra o valor e vale como requisito.</p>':''}`:''}
    ${jnRegraCampo(E.regra||'bloqueia',E.rc,'jn-e-regra')}
    <div class="field full"><span class="lbl-f">Vale quando</span><span class="it-vq">${E.cond?esc(itCondFrase(E.cond)):'<span class="faint">sempre</span>'}<button class="linkbtn" data-a="jn-cond" data-v="__ed">${E.cond?'Editar':'+ Condição'}</button>${E.cond?'<button class="linkbtn" data-a="jn-cond-tira" data-v="__ed">Tirar</button>':''}</span></div></div>
  <div class="df"><button class="btn text" data-a="close">Cancelar</button><button class="btn primary" data-a="jn-salva">Salvar</button></div>`}
function jnSalvar(){const E=UI.jnEd;let campo=E.campo;if(!campo){toast('Escolha onde a resposta grava.',true);return false}
  if(campo==='__novo'){const N=E.novo||{},tit=(N.titulo||'').trim(),tipo=N.tipo||'texto',ops=[...new Set((N.opcoes||'').split('\n').map(x=>x.trim()).filter(Boolean))];
    if(!tit){toast('Dê um nome ao campo novo.',true);return false}
    if(IT_CAT.some(c=>itDef(c.chave).titulo.toLowerCase()===tit.toLowerCase())){toast(`Já existe um campo com o título ${tit}.`,true);return false}
    if(tipo==='lista'&&ops.length<2){toast('A lista precisa de ao menos duas opções.',true);return false}
    const c={id:uid(),codigo:'c'+uid().replace(/[^a-z0-9]/gi,'').toLowerCase().slice(0,10),titulo:tit,tipo,opcoes:tipo==='lista'?ops:null,unidade:tipo==='numero'?N.unidade||null:null,ativo:true};
    jnCampos().push(c);jnRegistra(c);campo='personalizado.'+c.codigo}
  if(jnItens().some(i=>i.id!==E.id&&i.fase===E.fase&&i.etapa===E.etapa&&(i.sub||null)===(E.sub||null)&&i.campo===campo)){toast(`${itTit(campo)} já está neste lugar da jornada.`,true);return false}
  const x={id:E.id||uid(),fase:E.fase,etapa:E.etapa,sub:E.sub||null,campo,pergunta:(E.pergunta||'').trim()||null,ajuda:(E.ajuda||'').trim()||null,forma:E.forma||null,regra:E.regra||'bloqueia',rc:E.rc&&E.rc.length?E.rc:null,cond:E.cond||null,ativo:true,
    ordem:E.ordem??jnItens().filter(i=>i.fase===E.fase&&i.etapa===E.etapa).length};
  const i=jnItens().findIndex(y=>y.id===x.id);if(i>=0)jnItens()[i]=x;else jnItens().push(x);return true}
function jnRvHtml(fechar){const R=UI.jnRv;if(!R)return '';
  return `<div class="dh"><div><h2>${R.id?'Editar regra':'Nova regra pelo valor'}</h2><div class="muted" style="margin-top:4px">${esc(faseN(R.fase))} › ${esc(etNomeE(R.fase,R.etapa))}</div></div>${fechar}</div>
  <div class="fields jn-form">
    <div class="field"><label for="jnr-s">Vale para sair de</label>${jnLugarSel('jnr-s',R.fase,R.etapa,R.sub).replace('data-jne="sub"','data-jnrv="sub"')}</div>
    <div class="field"><label for="jnr-a">O que acontece</label><select id="jnr-a" data-jnrv="acao">${Object.entries(JN_ACAO).map(([k,n])=>`<option value="${k}" ${k===R.acao?'selected':''}>${n}</option>`).join('')}</select></div>
    <div class="field full"><span class="lbl-f">Quando</span><span class="it-vq">${R.cond?esc(itCondFrase(R.cond)):'<span class="faint">escolha a condição</span>'}<button class="linkbtn" data-a="jn-cond" data-v="__rv">${R.cond?'Editar':'+ Condição'}</button></span></div>
    <div class="field full"><label for="jnr-m">Mensagem para quem negocia</label><input id="jnr-m" data-jnrv="msg" value="${esc(R.msg||'')}" placeholder="Ex.: Declive acentuado: o diretor aprova a passagem"></div></div>
  <div class="df"><button class="btn text" data-a="close">Cancelar</button><button class="btn primary" data-a="jn-rv-salva">Salvar regra</button></div>`}
function jnPreHtml(fechar){const P=UI.jnPre;if(!P)return '';const E=etapaF(P.fase,P.etapa),opReq=cfg().etapas.map(e=>`<optgroup label="${esc(e.nome)}">${subsDe(e.k).map(s=>`<option value="${s.k}">${esc(s.nome)}</option>`).join('')}</optgroup>`).join('');
  return `<div class="dh"><div><h2>Novo pré-requisito</h2><div class="muted" style="margin-top:4px">${esc(E?.nome||'')}</div></div>${fechar}</div>
  <form data-form="jn-pre" id="f-jnp"><div class="fields"><div class="field full"><label for="jnp-a">Para entrar em</label><select id="jnp-a" name="alvo"><option value="etapa:${E.k}">${esc(E.nome)} (a etapa)</option>${E.subs.map(s=>`<option value="subetapa:${s.k}">${esc(s.nome)}</option>`).join('')}</select></div>
  <div class="field full"><label for="jnp-r">Precisa ter passado por</label><select id="jnp-r" name="req">${opReq}</select></div></div></form>
  <div class="df"><button class="btn text" data-a="close">Cancelar</button><button class="btn primary" type="submit" form="f-jnp">Adicionar</button></div>`}
function jnDocHtml(fechar){const e=UI.jnDoc,L=jnCk(e),livres=Object.entries(TIPOS_DOC).filter(([k])=>!['foto','planta','ata'].includes(k)&&!L.some(c=>c.doc===k));
  return `<div class="dh"><div><h2>Documento para sair de ${esc(SN(e))}</h2></div>${fechar}</div>
  <div class="jn-docs">${livres.map(([k,[l,g]])=>`<button class="fchip" data-a="jn-doc-add" data-e="${e}" data-v="${k}">${esc(l)} <span class="faint">${esc(g)}</span></button>`).join('')||'<p class="faint">Todos os documentos já estão na etapa.</p>'}</div>
  <div class="df"><button class="btn text" data-a="close">Fechar</button></div>`}
{const fm=funilModal;funilModal=function(M,fechar){
  if(M==='jn-rc')return jnRcHtml(fechar);if(M==='jn-item')return jnItemHtml(fechar);if(M==='jn-rv')return jnRvHtml(fechar);if(M==='jn-pre')return jnPreHtml(fechar);if(M==='jn-doc')return jnDocHtml(fechar);
  if(M==='jn-bloq'||M==='jn-forcar'){const a=UI.jnFz||{},x=T(a.tid),p=x&&procsDe(x).find(y=>y.id===a.pid),nm=p?(a.tipo==='status'?faseCfg(p.fase)?.conc:a.tipo==='etapa'?etNomeE(p.fase,a.dest):etNomeS(p.fase,a.dest)):'';
    if(M==='jn-bloq')return `<div class="dh"><div><h2>Ainda não dá para ir para ${esc(nm)}</h2><p class="muted" style="margin:6px 0 0">Responda o que falta. Gestor e diretor podem passar sem, com justificativa.</p></div>${fechar}</div><ul class="adv-lista adv-modal">${advItens(a.itens||[])}</ul><div class="df"><button class="btn primary" data-a="close">Entendi</button></div>`;
    return `<div class="dh"><div><h2>Ir para ${esc(nm)} sem os requisitos?</h2><ul class="pend">${(a.itens||[]).map(i=>`<li>${ic('close',16)}${esc(i.txt)}</li>`).join('')}</ul></div>${fechar}</div><form data-form="jn-forcar" id="f-jf"><div class="field"><label for="jf-j">Justificativa (vai para o histórico)</label><textarea id="jf-j" name="j" required></textarea></div></form><div class="df"><button class="btn text" data-a="close">Cancelar</button><button class="btn primary" type="submit" form="f-jf">Avançar</button></div>`}
  return fm(M,fechar)}}
/* onde mora a regra em branco de cada item: base, condicional e gravar */
function jnRegraAlvo(k){const [tp,a,b]=k.split(':');
  if(tp==='__ed'){const E=UI.jnEd;return E&&{nome:E.pergunta||itTit(E.campo)||'Pergunta nova',base:()=>E.regra||'bloqueia',rc:()=>E.rc,set:(v,rc)=>{E.regra=v;E.rc=rc&&rc.length?rc:null},voltar:'jn-item'}}
  if(tp==='__et'){const r=UI.etRegra;return r&&{nome:r.titulo||'Tarefa da etapa',base:()=>jnBaseTar(r),rc:()=>r.rc,set:(v,rc)=>{r.regra=v;r.rc=rc&&rc.length?rc:null;r.trava=v!=='livre'||!!r.rc},voltar:'et-regra'}}
  if(tp==='it'){const i=jnItens().find(x=>x.id===a);return i&&{nome:jnTxt(i),base:()=>i.regra,rc:()=>i.rc,set:(v,rc)=>{i.regra=v;i.rc=rc&&rc.length?rc:null}}}
  if(tp==='doc'){const c=jnCk(a).find(x=>x.doc===b);return c&&{nome:TIPOS_DOC[c.doc]?.[0]||c.doc,base:()=>jnBaseCk(c),rc:()=>c.rc,set:(v,rc)=>{c.regra=v;c.rc=rc&&rc.length?rc:null;c.just=v==='justifica';c.obrig=v!=='livre'||!!c.rc}}}
  if(tp==='pr'){const p=cfg().prereq.find(x=>x.id===a);return p&&{nome:`Ter passado por ${subN(p.req)}`,base:()=>jnBasePr(p),rc:()=>p.rc,set:(v,rc)=>{p.regra=v;p.rc=rc&&rc.length?rc:null;p.just=v==='justifica'}}}
  if(tp==='tar'){const r=etRegras().find(x=>x.id===a);return r&&{nome:r.titulo||'Modelo de tarefas',base:()=>jnBaseTar(r),rc:()=>r.rc,set:(v,rc)=>{r.regra=v;r.rc=rc&&rc.length?rc:null;r.trava=v!=='livre'||!!r.rc}}}
  return null}
/* o campo "Se estiver em branco" dos formulários: as 3 opções e Condicional, com a frase */
function jnRegraCampo(base,rc,acao){const on=k=>rc&&rc.length?k==='cond':k===base;
  return `<fieldset class="field full"><legend>Se estiver em branco</legend><span class="fm-seg jn-rg" role="radiogroup">${Object.entries(JN_REGRA_SEL).map(([k,n])=>`<button type="button" role="radio" class="${on(k)?'on':''}" aria-checked="${on(k)}" data-a="${acao}" data-v="${k}">${n.replace('…','')}</button>`).join('')}</span>
    ${rc&&rc.length?`<span class="it-vq jn-rcf">${esc(jnRcFrase(rc,base).replace(/^./,c=>c.toUpperCase()))}. <button type="button" class="linkbtn" data-a="${acao}" data-v="cond">Editar</button></span>`:''}</fieldset>`}
function jnRcAbrir(k){const x=jnRegraAlvo(k);if(!x)return;const rc=JSON.parse(JSON.stringify(x.rc()||[]));
  UI.jnRc={k,nome:x.nome,base:x.base(),linhas:rc.length?rc:[{cond:null,regra:x.base()==='bloqueia'?'justifica':'bloqueia'}],voltar:x.voltar||null};UI.modal='jn-rc';renderModal();
  if(!rc.length)setTimeout(()=>jnRcCond(0),0)}
function jnRcCond(n){const R=UI.jnRc;if(!R)return;const c=R.linhas[n]?.cond;
  UI.itCond={alvo:'__rc',cond:c?JSON.parse(JSON.stringify(c)):itNovaCond(),busca:c?null:'0',q:'',ext:{titulo:`${R.nome}: quando`,salvar:cc=>{R.linhas[n].cond=cc},voltar:()=>{UI.modal='jn-rc';renderModal()}}};UI.modal='it-cond';renderModal()}
function jnRcHtml(fechar){const R=UI.jnRc;if(!R)return '';const sel=(attr,v)=>`<select ${attr}>${Object.entries(JN_REGRA).map(([k,n])=>`<option value="${k}" ${k===v?'selected':''}>${esc(n)}</option>`).join('')}</select>`;
  return `<div class="dh"><div><h2>Se estiver em branco</h2><div class="muted" style="margin-top:4px">${esc(R.nome)}</div></div>${fechar}</div>
  <p class="muted jn-rc-aj">A primeira condição que vale decide. Se nenhuma vale, vale o comportamento de "Nos demais casos".</p>
  <div class="jn-rc">${R.linhas.map((x,n)=>`<div class="jn-rcl"><span class="jn-rcq"><span class="lbl-f">Quando</span><span class="it-vq">${x.cond?esc(itCondFrase(x.cond)):'<span class="faint">escolha a condição</span>'}<button class="linkbtn" data-a="jn-rc-cond" data-v="${n}">${x.cond?'Editar':'+ Condição'}</button></span></span>
      <span class="jn-rcr">${sel(`data-jnrc="${n}" aria-label="Comportamento ${n+1}"`,x.regra)}<button class="iconbtn sm lixo" data-a="jn-rc-x" data-v="${n}" aria-label="Tirar este comportamento" title="Tirar">${ic('lixo',18)}</button></span></div>`).join('')}
    <button class="tkm-add" data-a="jn-rc-mais">${ic('add',16)}Comportamento condicional</button>
    <div class="jn-rcl jn-rcd"><span class="jn-rcq"><span class="lbl-f">Nos demais casos</span></span><span class="jn-rcr">${sel('data-jnrc="base" aria-label="Nos demais casos"',R.base)}</span></div></div>
  <div class="df"><button class="btn text" data-a="${R.voltar?'jn-rc-volta':'close'}">Cancelar</button><button class="btn primary" data-a="jn-rc-salva">Salvar</button></div>`}

/* condição dos itens e das regras (o mesmo painel "Vale quando") */
function jnCondAlvo(v){
  if(v==='__ed')return {nome:`Pergunta: ${UI.jnEd?.pergunta||itTit(UI.jnEd?.campo)||'nova'}`,ler:()=>UI.jnEd.cond,gravar:c=>{UI.jnEd.cond=c},voltar:()=>{UI.modal='jn-item';renderModal()}};
  if(v==='__rv')return {nome:'Regra pelo valor',ler:()=>UI.jnRv.cond,gravar:c=>{UI.jnRv.cond=c},voltar:()=>{UI.modal='jn-rv';renderModal()}};
  const i=jnItens().find(x=>x.id===v);return i&&{nome:`Pergunta: ${jnTxt(i)}`,ler:()=>i.cond,gravar:c=>{i.cond=c;save()},voltar:()=>{UI.modal=null;renderModal();render()}}}

document.addEventListener('click',e=>{const a=e.target.closest?.('[data-a^="jn-"]');if(!a)return;e.preventDefault();e.stopImmediatePropagation();const A=a.dataset.a,t=T(UI.id);
  if(A==='jn-v'){const i=jnItens().find(x=>x.id===a.dataset.i);if(i)jnGravar(t,i,a.dataset.v);return}
  if(A==='jn-fora'){UI.jnFora=!UI.jnFora;render();return}
  if(A==='jn-ir'){UI.modal=null;renderModal();ADV_REQ=false;render();setTimeout(()=>{const el=document.querySelector('#jn-bloco .jn-q:not(.ok)');el?.scrollIntoView({block:'center'});el?.querySelector('input,select,textarea,button')?.focus()},0);return}
  if(!ehAdmin(me()))return;
  switch(A){
    case 'jn-fase':UI.jnFase=a.dataset.v;UI.jnEtapa=null;render();return;
    case 'jn-etapa':UI.jnEtapa=a.dataset.v;render();return;
    case 'jn-nova':UI.jnEd={id:null,fase:a.dataset.f,etapa:a.dataset.e,sub:a.dataset.s||null,campo:'',regra:'bloqueia',cond:null};UI.modal='jn-item';renderModal();return;
    case 'jn-ed':{const i=jnItens().find(x=>x.id===a.dataset.v);if(!i)return;UI.jnEd=JSON.parse(JSON.stringify(i));UI.modal='jn-item';renderModal();return}
    case 'jn-x':{const i=jnItens().find(x=>x.id===a.dataset.v);if(!i)return;cfg().jornada=jnItens().filter(x=>x!==i);save();render();toast(`${jnTxt(i)} saiu da jornada. As respostas ficam no terreno.`);return}
    case 'jn-e-regra':if(a.dataset.v==='cond'){jnRcAbrir('__ed');return}UI.jnEd.regra=a.dataset.v;UI.jnEd.rc=null;renderModal();return;
    case 'jn-rc':jnRcAbrir(a.dataset.v);return;
    case 'jn-rc-cond':jnRcCond(+a.dataset.v);return;
    case 'jn-rc-mais':UI.jnRc.linhas.push({cond:null,regra:'bloqueia'});jnRcCond(UI.jnRc.linhas.length-1);return;
    case 'jn-rc-x':UI.jnRc.linhas.splice(+a.dataset.v,1);renderModal();return;
    case 'jn-rc-volta':{const R=UI.jnRc;UI.jnRc=null;UI.modal=R?.voltar||null;renderModal();return}
    case 'jn-rc-salva':{const R=UI.jnRc,x=R&&jnRegraAlvo(R.k);if(!x)return;const L=R.linhas.filter(y=>y.cond);
      if(R.linhas.some(y=>!y.cond)){toast('Cada comportamento condicional precisa de uma condição.',true);return}
      x.set(R.base,L);UI.jnRc=null;if(R.voltar){UI.modal=R.voltar;renderModal();return}UI.modal=null;save();renderModal();render();toast('Regra da jornada salva.');return}
    case 'jn-salva':if(jnSalvar()){UI.jnEd=null;UI.modal=null;save();renderModal();render();toast('Pergunta salva na jornada.')}return;
    case 'jn-cond':{const x=jnCondAlvo(a.dataset.v);if(!x)return;const c=x.ler();
      UI.itCond={alvo:a.dataset.v,cond:c?JSON.parse(JSON.stringify(c)):itNovaCond(),busca:c?null:'0',q:'',ext:{titulo:x.nome,salvar:x.gravar,voltar:x.voltar}};UI.modal='it-cond';renderModal();return}
    case 'jn-cond-tira':{const x=jnCondAlvo(a.dataset.v);if(!x)return;x.gravar(null);renderModal();return}
    case 'jn-tar':{UI.etRegra=etNovaRegra(a.dataset.f,a.dataset.e);UI.etRegra.sub=a.dataset.s||null;UI.etRegra.tipo='tarefa';UI.modal='et-regra';renderModal();return}
    case 'jn-pre':UI.jnPre={fase:a.dataset.f,etapa:a.dataset.e};UI.modal='jn-pre';renderModal();return;
    case 'jn-doc':UI.jnDoc=a.dataset.e;UI.modal='jn-doc';renderModal();return;
    case 'jn-doc-add':jnCk(a.dataset.e).push({doc:a.dataset.v,obrig:true});save();UI.modal=null;renderModal();render();toast(`${TIPOS_DOC[a.dataset.v][0]} entrou na jornada.`);return;
    case 'jn-doc-x':{const e=a.dataset.e;cfg().checklist[e]=jnCk(e).filter(c=>c.doc!==a.dataset.v);save();render();return}
    case 'jn-rv-nova':UI.jnRv={id:null,fase:a.dataset.f,etapa:a.dataset.e,sub:null,cond:null,acao:'diretor',msg:''};UI.modal='jn-rv';renderModal();return;
    case 'jn-rv-ed':{const r=jnRegrasV().find(x=>x.id===a.dataset.v);if(!r)return;UI.jnRv=JSON.parse(JSON.stringify(r));UI.modal='jn-rv';renderModal();return}
    case 'jn-rv-x':cfg().jornadaRegras=jnRegrasV().filter(x=>x.id!==a.dataset.v);save();render();toast('Regra apagada.');return;
    case 'jn-rv-salva':{const R=UI.jnRv;if(!R.cond){toast('Escolha quando a regra vale.',true);return}if(!(R.msg||'').trim()){toast('Escreva a mensagem.',true);return}
      const x={...R,id:R.id||uid(),msg:R.msg.trim(),ativo:true,ordem:R.ordem??jnRegrasV().length};const i=jnRegrasV().findIndex(y=>y.id===x.id);if(i>=0)jnRegrasV()[i]=x;else jnRegrasV().push(x);
      UI.jnRv=null;UI.modal=null;save();renderModal();render();toast('Regra salva.');return}
  }},true);
document.addEventListener('change',e=>{const el=e.target;
  if(el.dataset?.jn){e.stopImmediatePropagation();const i=jnItens().find(x=>x.id===el.dataset.jn);if(i)jnGravar(T(UI.id),i,el.value);return}
  if(el.dataset?.jne){e.stopImmediatePropagation();const E=UI.jnEd;if(!E)return;const k=el.dataset.jne;
    if(k.startsWith('n.')){E.novo=E.novo||{tipo:'texto'};E.novo[k.slice(2)]=el.value;if(k==='n.tipo'||k==='n.opcoes')renderModal();return}
    if(k==='sub')E.sub=el.value||null;else E[k]=el.value;if(k==='campo'){E.forma=null;if(el.value==='__novo')E.novo=E.novo||{tipo:'texto'}}if(k==='campo'||k==='sub')renderModal();return}
  if(el.dataset?.jnrc&&UI.jnRc){e.stopImmediatePropagation();const k=el.dataset.jnrc;if(k==='base')UI.jnRc.base=el.value;else UI.jnRc.linhas[+k].regra=el.value;return}
  if(el.dataset?.jnrv){e.stopImmediatePropagation();const R=UI.jnRv;if(!R)return;const k=el.dataset.jnrv;if(k==='sub')R.sub=el.value||null;else R[k]=el.value;return}
  if(el.dataset?.jnr){e.stopImmediatePropagation();if(!ehAdmin(me()))return;const k=el.dataset.jnr,v=el.value;
    if(k.startsWith('rv:')){const r=jnRegrasV().find(x=>x.id===k.slice(3));if(r)r.acao=v;save();render();toast('Regra da jornada salva.');return}
    const x=jnRegraAlvo(k);if(!x)return;
    if(v==='cond'){jnRcAbrir(k);return}
    x.set(v,null);save();render();toast('Regra da jornada salva.');return}},true);
document.addEventListener('input',e=>{const el=e.target;if(el.dataset?.jne&&UI.jnEd&&el.tagName!=='SELECT'){const k=el.dataset.jne;if(k.startsWith('n.')){UI.jnEd.novo=UI.jnEd.novo||{tipo:'texto'};UI.jnEd.novo[k.slice(2)]=el.value}else UI.jnEd[k]=el.value}
  if(el.dataset?.jnrv==='msg'&&UI.jnRv)UI.jnRv.msg=el.value},true);
document.addEventListener('submit',e=>{const f=e.target;
  if(f.dataset?.form==='jn-pre'){e.preventDefault();e.stopImmediatePropagation();const F=Object.fromEntries(new FormData(f)),[at,al]=F.alvo.split(':'),er=validaPre(at,al,F.req);if(er){toast(er,true);return}
    cfg().prereq.push({id:uid(),alvoTipo:at,alvo:al,req:F.req});UI.modal=null;save();renderModal();render();toast('Pré-requisito adicionado.');return}
  if(f.dataset?.form==='jn-forcar'){e.preventDefault();e.stopImmediatePropagation();const a=UI.jnFz,t=T(a?.tid),p=t&&procsDe(t).find(x=>x.id===a.pid),j=new FormData(f).get('j')?.trim();
    if(!p)return;if(!j){toast('Justifique a passagem.',true);return}UI.jnFz=null;
    if(a.tipo==='status'){UI.etJust=j;UI.alvoProc=p.id;UI.modal='p-concluir';renderModal();return}
    UI.modal=null;renderModal();procIr(t,p,a.tipo,a.dest,{forcado:j});log(t,`${faseN(p.fase)}: passou sem os requisitos da jornada · ${j}`);save();render();toast(`${t.nome}: ${a.tipo==='etapa'?etNomeE(p.fase,a.dest):etNomeS(p.fase,a.dest)}.`)}},true);

/* ---------- dados: campos novos e jornada de exemplo ---------- */
jnCampos().forEach(jnRegistra);
(()=>{if(S.jnExemplo)return;S.jnExemplo=true;const f=faseEnt();
  const rec={id:uid(),codigo:'recuo_frontal',titulo:'Recuo frontal atende',tipo:'lista',opcoes:['Sim','Não','A verificar'],ativo:true};
  const des={id:uid(),codigo:'custo_desocupacao',titulo:'Custo estimado de desocupação',tipo:'numero',unidade:'R$',ativo:true};
  [rec,des].forEach(c=>{if(!jnCampos().some(x=>x.codigo===c.codigo)){jnCampos().push(c);jnRegistra(c)}});
  const ch=c=>'personalizado.'+c.codigo,demol={modo:'todas',itens:[{campo:'terreno.necessidade_demolicao',op:'em',valores:['provavel','confirmada']}]};
  const ocup={modo:'todas',itens:[{campo:'terreno.situacao_ocupacao',op:'em',valores:['ocupado','parcialmente_ocupado']}]};
  const subE=k=>(etapaF(f,'estudos')?.subs||[]).some(s=>s.k===k)?k:null;
  if(!jnItens().length&&etapaF(f,'estudos'))cfg().jornada=[
    {id:uid(),fase:f,etapa:'estudos',sub:null,campo:'terreno.posicao_quadra',pergunta:'Qual a posição do terreno na quadra?',forma:'chips',regra:'bloqueia',cond:null,ordem:0},
    {id:uid(),fase:f,etapa:'estudos',sub:null,campo:'terreno.necessidade_demolicao',pergunta:'Precisa demolir?',forma:'segmentado',regra:'justifica',cond:null,ordem:1},
    {id:uid(),fase:f,etapa:'estudos',sub:null,campo:'terreno.area_construida_demolir_m2',pergunta:'Quanto vai ser demolido?',ajuda:'Área construída a demolir, pela visita ou pela planta.',regra:'justifica',cond:demol,ordem:2},
    {id:uid(),fase:f,etapa:'estudos',sub:subE('estudo_massa'),campo:ch(rec),pergunta:'O recuo frontal atende ao estudo de massa?',forma:'segmentado',regra:'justifica',cond:null,ordem:3},
    {id:uid(),fase:f,etapa:'estudos',sub:subE('estudo_viabilidade'),campo:ch(des),regra:'justifica',cond:ocup,ordem:4}];
  if(!jnRegrasV().length&&etapaF(f,'estudos'))cfg().jornadaRegras=[
    {id:uid(),fase:f,etapa:'estudos',sub:null,cond:{modo:'todas',itens:[{campo:'terreno.topo_perfil',op:'em',valores:['acidentado_critico']}]},acao:'diretor',msg:'Relevo acidentado crítico: o diretor aprova a passagem',ativo:true,ordem:0},
    {id:uid(),fase:f,etapa:'estudos',sub:null,cond:{modo:'todas',itens:[{campo:'terreno.area_construida_demolir_m2',op:'maior',valores:[1000]}]},acao:'avisa',msg:'Demolição acima de 1.000 m²: confira o custo no estudo',ativo:true,ordem:1}];
  save()})();
