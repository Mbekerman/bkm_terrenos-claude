/* ---------- Partes, matrículas e SQLs (decisões do Moisés, 4/nov/2026) ----------
   Todo terreno tem pelo menos uma parte (nasce "Vendedor 1"), com contato opcional: pessoa principal, telefone,
   e-mail, CPF ou CNPJ e observação. Matrículas e SQLs entram no terreno como etiquetas (matrícula amarela, SQL
   roxa) e são arrastadas para o quadro da parte a que pertencem; sem parte, ficam no quadro de cima. Não há mais
   lote (matrícula com os seus SQLs; decisão do Moisés de 4/nov/2026, 17h30): a área da parte é a soma das
   matrículas dela (sem matrícula com área, a dos SQLs) e a divergência Matrícula × Prefeitura é conferida por parte.
   Cada SQL incluído ou excluído refaz a poligonal do terreno pela soma dos lotes da prefeitura; a desenhada fica
   guardada e volta quando não sobra SQL com lote. IPTU e valor venal: só o exercício mais recente.
   No banco: matriculas.parte_id, inscricoes_municipais.parte_id (escrita direta, conferida por t_parte),
   app.v_partes (área, divergência e zonas da parte), oferta_partes.forma_pagamento. */

/* deixa o terreno no modelo novo: uma parte pelo menos; matrícula e SQL ligados direto à parte (ou a nenhuma) */
function lotesNorm(t){if(!t)return;const P=partesDe(t);
  if(!P.some(p=>p.ativa))P.push({id:uid(),ativa:true,neg:null,propostas:[],nome:'Vendedor 1',essencial:true,area:null});
  const ativa=id=>!!id&&parteDe(t,id)?.ativa;
  t.mats.forEach(m=>{if(!m.id)m.id=uid()});t.insc.forEach(i=>{if(!i.id)i.id=uid()});
  /* dados do modelo de lotes (lote = matrícula + SQLs): a parte do lote passa para a matrícula e para os SQLs */
  if(t.lotes){t.lotes.forEach(l=>{const m=t.mats.find(x=>x.lote===l.id);
      if(m)Object.assign(m,{parte:l.parte,criDig:!!l.criDig});else if(l.num)t.mats.push({id:l.id,num:l.num,cri:l.cri,criDig:!!l.criDig,area:l.area??null,data:l.data||null,parte:l.parte});
      l.ins.forEach(id=>{const i=t.insc.find(x=>x.id===id);if(i&&!i.parte)i.parte=l.parte})});
    delete t.lotes}
  t.mats.forEach(m=>{delete m.lote;if(!ativa(m.parte))m.parte=null;if(!m.criDig&&t.cri)m.cri=t.cri});
  t.insc.forEach(i=>{delete i.solto;if(!ativa(i.parte))i.parte=null})}

const soma=v=>v.reduce((s,x)=>s+x,0);
/* área da parte: a soma das matrículas (todas com área); sem isso, a dos SQLs (todos com área cadastral) */
function ptAreaInfo(t,pa){const ms=matsParte(t,pa),is=inscParte(t,pa);
  if(ms.length&&ms.every(m=>m.area!=null))return {area:soma(ms.map(m=>m.area)),fonte:'matrículas'};
  if(!ms.length&&is.length&&is.every(i=>i.area!=null))return {area:soma(is.map(i=>i.area)),fonte:'SQLs'};
  return {area:null,fonte:null}}
const ptArea=(t,pa)=>ptAreaInfo(t,pa).area;
/* Matrícula × Prefeitura da parte: área cadastral dos SQLs contra a das matrículas, em % da matrícula */
function ptDiv(t,pa){const ms=matsParte(t,pa),is=inscParte(t,pa);if(!ms.length||!is.length||ms.some(m=>m.area==null)||is.some(i=>i.area==null))return null;
  const a=soma(ms.map(m=>m.area)),b=soma(is.map(i=>i.area));return a?Math.round((b-a)/a*1000)/10:null}
const ptZonas=(t,pa)=>{const a=analiseVig(t);if(!a)return [];const ds=inscParte(t,pa).map(i=>digits(i.sql));
  return [...new Set(a.zonas.filter(z=>{const k=digits(zIns(t,z)||'');return k&&ds.includes(k)}).map(z=>z.sigla))]};
const ptVazia=(t,pa)=>!matsParte(t,pa).length&&!inscParte(t,pa).length&&!pa.neg&&!(pa.propostas||[]).length&&!t.pessoas.some(p=>p.parte===pa.id)&&!t.corretores.some(x=>(x.partes||[]).includes(pa.id))
  &&!t.ofertas.some(o=>o.partes&&pa.id in o.partes)&&!['pessoa','tel','email','doc','obs'].some(k=>pa[k]);


/* ---------- valor venal e IPTU somados (pedido do Moisés, 4/nov/2026): ficam gravados por SQL e aparecem
   somados na parte e no terreno. SQL sem IPTU lançado não conta como zero: o total diz quantos faltam. ---------- */
function iptuVig(ins){const v=(ins.valores||[]).filter(x=>x.vig).sort((a,b)=>b.ex-a.ex)[0];if(!v)return null;const ise=v.sit==='isento';
  const venal=v.vt!=null&&v.vc!=null?v.vt+v.vc:(v.venal??v.vt??null);
  const anual=ise?0:v.iptu??(v.mensal!=null&&v.parc?v.mensal*v.parc:null),mensal=ise?0:v.mensal??(v.iptu!=null&&v.parc?v.iptu/v.parc:null);
  return {ex:v.ex,venal,anual,mensal,isento:ise}}
function iptuSoma(lista){const vs=lista.map(iptuVig),com=vs.filter(Boolean),tot=k=>com.some(v=>v[k]!=null)?soma(com.map(v=>v[k]||0)):null;
  return {n:lista.length,com:com.length,faltam:lista.length-com.length,venal:tot('venal'),anual:tot('anual'),mensal:tot('mensal'),ex:com.length?Math.max(...com.map(v=>v.ex)):null}}
function iptuResumo(r,rotulo){if(!r.n)return '';if(!r.com)return `<span class="iptu-r faint">${rotulo?esc(rotulo)+': ':''}sem IPTU lançado</span>`;
  const it=[['Venal',r.venal,brl],['IPTU anual',r.anual,brl],['IPTU mensal',r.mensal,brl2]].filter(x=>x[1]!=null).map(([l,v,f])=>`<span><span class="faint">${l}</span> ${f(v)}</span>`).join('');
  return `<span class="iptu-r">${rotulo?`<b>${esc(rotulo)}</b>`:''}${it}${r.faltam?`<span class="chip warn" title="SQL sem IPTU lançado não entra como zero">${r.faltam} de ${r.n} SQLs sem IPTU</span>`:''}</span>`}

/* contato: telefone e CPF/CNPJ só com dígitos, e-mail em minúsculas (fluxo.validar_formato no banco) */
const ptDocFmt=v=>{const d=fmDig(v);return d?fmParcial(d.length>11?'cnpj':'cpf',d):''};
function ptValida(k,v){if(k==='tel')return fmValida('telefone',v);if(k==='email')return fmValida('email',v);
  if(k==='doc'){const d=fmDig(v);return d?fmValida(d.length>11?'cnpj':'cpf',d):null}return String(v||'').trim()||null}

/* ---------- aba Terreno: Partes ---------- */
function secPartesTer(t){const P=partesAtivas(t),ro=UI.role==='Leitura';
  const v=(pa,k)=>esc(k==='tel'?fmParcial('telefone',pa.tel||''):k==='doc'?ptDocFmt(pa.doc):pa[k]||'');
  const inp=(pa,k,l,x='')=>`<label class="field"><span class="lbl-f">${l}</span>${ro?`<span class="v">${v(pa,k)||'<span class="ni">Não informado</span>'}</span>`:`<input data-ch="pt2" data-k="${k}" data-p="${pa.id}" value="${v(pa,k)}" ${x}>`}</label>`;
  return `<section class="sec" id="sec-partes-cad"><div class="sec-h"><h2>Partes <span class="h-n">${P.length}</span></h2></div><div class="sec-b">
    ${ro?'':`<div class="pt2-qtd"><label for="pt2-n">Quantas partes vendem?</label><span class="pt2-passo"><button type="button" class="iconbtn sm" data-a="pt2-menos" aria-label="Uma parte a menos" ${P.length<2?'disabled':''}>−</button><input id="pt2-n" data-ch="pt2-n" inputmode="numeric" value="${P.length}" aria-label="Quantidade de partes"><button type="button" class="iconbtn sm" data-a="pt2-mais" aria-label="Uma parte a mais">+</button></span><span class="faint">Todo terreno nasce com uma parte. Os dados da parte são opcionais.</span></div>`}
    <div class="pt2-lista">${P.map(pa=>{const nm=matsParte(t,pa).length,ni=inscParte(t,pa).length;return `<article class="pt2" id="pt2-${pa.id}">
      <div class="pt2-h">${ro?`<b>${esc(pa.nome)}</b>`:`<input class="pt2-tit" data-ch="pt2" data-k="nome" data-p="${pa.id}" value="${esc(pa.nome)}" aria-label="Título da parte">`}
        <span class="chip ${nm||ni?'good':''}">${nm||ni?[nm&&nm+(nm>1?' matrículas':' matrícula'),ni&&ni+(ni>1?' SQLs':' SQL')].filter(Boolean).join(' · '):'sem matrícula nem SQL'}</span>${pa.neg?`<span class="chip">${esc(pa.neg.codigo)}</span>`:''}
        ${!ro&&P.length>1?`<button class="btn text sm pt2-x" data-a="pt2-excluir" data-p="${pa.id}">${ic('lixo',16)}Excluir parte</button>`:''}</div>
      <div class="pt2-g">${inp(pa,'pessoa','Nome completo da pessoa principal')}${inp(pa,'tel','Telefone','inputmode="tel" data-mask="telefone" placeholder="(11) 98765-4321"')}${inp(pa,'email','E-mail','type="email" placeholder="nome@email.com"')}${inp(pa,'doc','CPF ou CNPJ','inputmode="numeric" data-doc="1"')}
        <label class="field pt2-obs"><span class="lbl-f">Observação</span>${ro?`<span class="v">${esc(pa.obs||'')||'<span class="ni">Não informada</span>'}</span>`:`<textarea data-ch="pt2" data-k="obs" data-p="${pa.id}" rows="1">${esc(pa.obs||'')}</textarea>`}</label></div></article>`}).join('')}</div>
    ${ro?'':`<button class="btn text sm qd-add" data-a="pt2-mais">${ic('add',16)}Adicionar parte</button>`}</div></section>`}

/* ---------- aba Terreno: Matrículas e SQLs em etiquetas, arrastadas para as partes ---------- */
const ETQ_FECHADAS=new Set();   // partes com o quadro recolhido (a seta recolhe a linha inteira)
const etqCris=t=>{const c=Array.from({length:18},(_,i)=>`${i+1}º CRI`);if(t.cri&&!c.includes(t.cri))c.unshift(t.cri);return c};
const etqRot=t=>(CIDADES_INSC[cidDoTerreno(t)]||CIDADES_INSC.sp).rotulo;
/* IPTU do ano dentro da etiqueta do SQL (R$ 45,3 mil) */
const milAbr=v=>v>=1e6?mi(v):'R$\u00a0'+(v/1e3).toLocaleString('pt-BR',{maximumFractionDigits:1})+'\u00a0mil';
function etqIptuTxt(ins){const v=iptuVig(ins);if(!v)return '';return `<span class="etq-i" title="IPTU ${v.ex}${v.anual!=null&&!v.isento?': '+brl(v.anual)+' por ano':''}">${v.isento?'isento':v.anual!=null?milAbr(v.anual):'venal '+milAbr(v.venal)}</span>`}
function etqHtml(t,tipo,x,ro){const k=tipo+':'+x.id,n=tipo==='m'?x.num:x.sql,nome=tipo==='m'?'matrícula':etqRot(t);
  return `<span class="etq ${tipo}" data-etq="${k}" ${ro?'':'tabindex="0"'} aria-label="${tipo==='m'?'Matrícula':esc(nome)} ${esc(n)}"><button type="button" class="etq-n num" data-a="etq-ver" data-k="${k}" title="Ver e editar">${esc(n)}${tipo==='s'?etqIptuTxt(x):''}</button>${ro?'':`<button type="button" class="etq-x" data-a="etq-x" data-k="${k}" aria-label="Excluir ${tipo==='m'?'a matrícula':'o '+esc(nome)} ${esc(n)}" title="Excluir">${ic('close',14)}</button>`}</span>`}
function etqPool(t,tipo,ro){const L=tipo==='m'?t.mats.filter(m=>!m.parte):t.insc.filter(i=>!i.parte),todos=tipo==='m'?t.mats.length:t.insc.length;
  return `<div class="etq-pool" data-drop="pool" data-tipo="${tipo}">${L.map(x=>etqHtml(t,tipo,x,ro)).join('')||`<span class="etq-vazio">${todos?'Todas já estão numa parte.':tipo==='m'?'Nenhuma matrícula ainda.':'Nenhum '+esc(etqRot(t))+' ainda.'}</span>`}</div>`}
function secLotes(t){const ro=UI.role==='Leitura',P=partesAtivas(t),cid=cidDoTerreno(t),rot=etqRot(t),sp=cid==='sp';
  const soltos=t.mats.filter(m=>!m.parte).length+t.insc.filter(i=>!i.parte).length;
  const cs=LG_CONS&&LG_CONS.tid===t.id?`<span class="chip blue lg-cons">Consultando o GeoSampa: ${LG_CONS.feitos} de ${LG_CONS.total}</span>`:ETQ_POLY===t.id?'<span class="chip blue">Refazendo a poligonal pelos lotes...</span>':'';
  const box=pa=>{const ms=matsParte(t,pa),is=inscParte(t,pa),fe=ETQ_FECHADAS.has(pa.id),ai=ptAreaInfo(t,pa),dv=ptDiv(t,pa);
    return `<article class="etq-pt${fe?' fechado':''}" data-drop="parte" data-p="${pa.id}">
      <button type="button" class="etq-pt-h" data-a="etq-linha" data-p="${pa.id}" aria-expanded="${!fe}" title="${fe?'Abrir':'Recolher'} a linha">${ic('chev',18)}<b>${esc(pa.nome)}</b><span class="faint">${ms.length} mat. · ${is.length} ${esc(rot)}</span></button>
      <div class="etq-pt-b"><div class="etq-pt-l">${ms.length?`<div class="etq-pt-g m">${ms.map(m=>etqHtml(t,'m',m,ro)).join('')}</div>`:''}${is.length?`<div class="etq-pt-g s">${is.map(i=>etqHtml(t,'s',i,ro)).join('')}</div>`:(!ms.length?`<span class="etq-vazio">${ro?'Sem matrícula nem SQL.':'Arraste para cá as matrículas e os SQLs desta parte.'}</span>`:'')}</div>
        ${ai.area!=null||dv!=null?`<div class="etq-pt-r">${ai.area!=null?`<span>${m2(ai.area)} <span class="faint">pelas ${ai.fonte}</span></span>`:''}${dv!=null&&Math.abs(dv)>=1?`<span class="chip ${Math.abs(dv)>5?'crit':'warn'}" title="Área cadastral dos SQLs da parte comparada com a das matrículas dela">Matrícula × Prefeitura ${dv>0?'+':''}${num(dv,1)}%</span>`:''}</div>`:''}
        ${is.length?`<div class="etq-pt-r etq-pt-iptu">${iptuResumo(iptuSoma(is))}</div>`:''}</div></article>`};
  return `<section class="sec" id="sec-lotes"><div class="sec-h"><h2>Matrículas e ${esc(rot)}s</h2>${cs}</div><div class="sec-b">
    <div class="etq-top">
      <div class="etq-col"><div class="etq-ct"><span class="etq-sw m"></span><b>Matrículas</b> <span class="h-n">${t.mats.length}</span></div>
        ${ro?'':`<form class="etq-form" data-form="etq-mat"><div class="field"><label for="em-n">Nº da matrícula</label><input id="em-n" name="num" inputmode="numeric" required autocomplete="off"></div>
          <div class="field"><label for="em-c">Cartório</label>${sp?`<select id="em-c" name="cri"><option value="">Não informado</option>${etqCris(t).map(x=>`<option ${x===t.cri?'selected':''}>${esc(x)}</option>`).join('')}</select>`:`<input id="em-c" name="cri" value="${esc(t.cri||'')}">`}</div>
          <div class="field"><label for="em-a">Área registrada</label><input id="em-a" name="area" inputmode="decimal" placeholder="m²"></div><button class="btn sm">${ic('add',16)}Incluir</button></form>`}
        ${etqPool(t,'m',ro)}</div>
      <div class="etq-col"><div class="etq-ct"><span class="etq-sw s"></span><b>${esc(rot)}s</b> <span class="h-n">${t.insc.length}</span></div>
        ${ro?'':`<form class="etq-form" data-form="etq-sql">${campoInsc('es',cid,null,true)}<button class="btn sm">${ic('add',16)}Incluir</button>${lgPode(t)?`<button type="button" class="btn sm text" data-a="lg-abrir">${ic('layers',16)}Escolher no mapa</button>`:''}</form>`}
        ${etqPool(t,'s',ro)}</div></div>
    <div class="etq-ph"><b>Partes</b>${!ro&&P.length===1&&soltos?`<button class="btn sm" data-a="etq-tudo">${ic('fwd',16)}Enviar tudo para ${esc(P[0].nome)}</button>`:''}${ro?'':`<span class="faint">${TOQUE()?'Toque e segure a etiqueta para arrastá-la até a parte.':'Arraste as etiquetas para a parte certa, ou de uma parte para outra.'}</span>`}</div>
    <div class="etq-partes">${P.map(box).join('')}</div>
    ${t.insc.length?`<div class="etq-tot">${iptuResumo(iptuSoma(t.insc),'Terreno')}${t.insc.some(i=>!i.parte)&&P.length?'<span class="faint">inclui SQLs sem parte</span>':''}</div>`:''}</div></section>`}

/* janela da etiqueta: os dados da matrícula ou do SQL (prefeitura, valor venal e IPTU) e a parte */
function etqIptu(t,ins,i,ro){const vs=ins.valores.filter(v=>v.vig).sort((a,b)=>b.ex-a.ex),v=vs[0],venal=v?(v.vt!=null&&v.vc!=null?v.vt+v.vc:(v.venal??v.vt??null)):null;
  return `${v?`<div class="tblwrap"><table class="mini-tbl vv"><thead><tr><th>Exercício</th><th class="r">Venal terreno</th><th class="r">Venal construção</th><th class="r">Venal do imóvel</th><th>IPTU</th><th class="r">Anual</th><th class="r">Parcela</th><th>Fonte</th></tr></thead><tbody>
        <tr><td><b>${v.ex}</b>${v.rev>1?`<span class="faint"> · rev. ${v.rev}</span>`:''}</td><td class="r">${brl(v.vt)}</td><td class="r">${brl(v.vc)}</td><td class="r"><b>${brl(venal)}</b></td><td>${v.sit==='isento'?'<span class="chip good">Isento</span>':OPT.sitIptu[v.sit]}</td>
        <td class="r">${v.sit==='isento'?'—':brl2(v.iptu)}</td><td class="r">${v.iptu!=null&&v.parc&&v.sit!=='isento'?`${brl2(v.iptu/v.parc)} <span class="faint">× ${v.parc}</span>`:'—'}</td><td class="muted vv-f">${esc(v.fonte||'—')}</td></tr></tbody></table></div>`:'<div class="muted">Sem IPTU lançado.</div>'}
      ${ro?'':`<details class="details"><summary>${v?'Atualizar IPTU':'Lançar IPTU'}</summary><form class="inline-form" data-form="iptu" data-i="${i}" style="border:0;padding-top:4px">
        <div class="field" style="flex:0 1 96px"><label for="v-e${i}">Exercício</label><input id="v-e${i}" name="ex" inputmode="numeric" value="${Math.max(new Date().getFullYear(),v?.ex||0)}" required></div>
        <div class="field"><label for="v-vt${i}">Venal terreno (R$)</label><input id="v-vt${i}" name="vt" inputmode="decimal"></div><div class="field"><label for="v-vc${i}">Venal construção (R$)</label><input id="v-vc${i}" name="vc" inputmode="decimal"></div>
        <div class="field"><label for="v-s${i}">Situação do IPTU</label><select id="v-s${i}" name="sit">${Object.entries(OPT.sitIptu).map(([k,x])=>`<option value="${k}" ${k==='tributado'?'selected':''}>${x}</option>`).join('')}</select></div>
        <div class="field"><label for="v-i${i}">IPTU anual (R$)</label><input id="v-i${i}" name="iptu" inputmode="decimal"></div><div class="field" style="flex:0 1 86px"><label for="v-p${i}">Parcelas</label><input id="v-p${i}" name="parc" inputmode="numeric" value="10"></div>
        <div class="field"><label for="v-m${i}">IPTU mensal informado (R$)</label><input id="v-m${i}" name="mensal" inputmode="decimal" placeholder="se a fonte trouxer"></div>
        <div class="field grow"><label for="v-f${i}">Fonte</label><input id="v-f${i}" name="fonte" placeholder="Carnê, certidão de dados cadastrais..." required></div>
        <button class="btn sm">${ic('add',16)}${v?'Atualizar IPTU':'Lançar IPTU'}</button></form><div class="hint">Só vale o exercício mais recente: lançar o ano novo substitui o anterior.</div></details>`}`}
const etqAchar=(t,k)=>{const [tipo,id]=(k||'').split(':');const x=tipo==='m'?t.mats.find(m=>m.id===id):t.insc.find(i=>i.id===id);return x?{tipo,x}:null};
function etqJanela(fechar){const t=T(UI.id),e=t&&etqAchar(t,UI.etq);if(!e)return '';const ro=UI.role==='Leitura',{tipo,x}=e,P=partesAtivas(t);
  const lin=(lab,campo)=>`<label class="field"><span class="lbl-f">${lab}</span>${campo}</label>`,val=v=>`<span class="v">${v}</span>`;
  const parte=lin('Parte',ro?val(esc(parteDe(t,x.parte)?.nome||'Sem parte')):`<select data-ch="etq" data-k="parte"><option value="">Sem parte</option>${P.map(pa=>`<option value="${pa.id}" ${pa.id===x.parte?'selected':''}>${esc(pa.nome)}</option>`).join('')}</select>`);
  const pe=`<div class="df"><button class="btn text" data-a="close">Fechar</button>${ro?'':`<button class="btn" data-a="etq-x" data-k="${tipo}:${x.id}">${ic('lixo',16)}Excluir</button>`}</div>`;
  if(tipo==='m'){const cri=etqCris(t);if(x.cri&&!cri.includes(x.cri))cri.unshift(x.cri);
    return `<div class="dh"><div><h2><span class="etq-sw m"></span>Matrícula ${esc(x.num)}</h2></div>${fechar}</div><div class="pt2-g">
      ${lin('Nº da matrícula',ro?val(esc(x.num)):`<input data-ch="etq" data-k="num" inputmode="numeric" value="${esc(x.num)}">`)}
      ${lin(`Cartório <span class="faint">(${x.criDig?'digitado':t.criFonte==='prefeitura'&&x.cri===t.cri?'pela poligonal, GeoSampa':'do terreno'})</span>`,ro?val(esc(x.cri||'—')):cidDoTerreno(t)==='sp'?`<select data-ch="etq" data-k="cri"><option value="">Não informado</option>${cri.map(c=>`<option ${c===x.cri?'selected':''}>${esc(c)}</option>`).join('')}</select>`:`<input data-ch="etq" data-k="cri" value="${esc(x.cri||'')}">`)}
      ${lin('Área registrada (m²)',ro?val(x.area!=null?m2(x.area):'—'):`<input data-ch="etq" data-k="area" inputmode="decimal" value="${x.area!=null?num(x.area,2):''}">`)}
      ${lin('Certidão de',ro?val(x.data?fd(x.data):'—'):`<input type="date" data-ch="etq" data-k="data" value="${esc(x.data||'')}">`)}${parte}</div>${pe}`}
  const i=t.insc.indexOf(x),c=CIDADES_INSC[insCid(x)];
  return `<div class="dh"><div><h2><span class="etq-sw s"></span>${esc(c.rotulo)} ${esc(x.sql)}</h2>${x.endPref?`<div class="faint">${esc(x.endPref)}</div>`:''}</div>${fechar}</div>
    <div class="pt2-g">${lin('Área cadastral (m²)',ro?val(x.area!=null?m2(x.area):'—'):`<input data-ch="etq" data-k="area" inputmode="decimal" value="${x.area!=null?num(x.area,2):''}">`)}${parte}</div>
    <div class="etq-geo">${loteQuadro(t,x,i)}</div><h3 class="etq-h3">Valor venal e IPTU</h3>${etqIptu(t,x,i,ro)}${pe}`}
/* ---------- aba Comercial: a oferta de cada parte ---------- */
const ptValor=(o,pa,um)=>!o?null:um?o.valor:o.partes&&pa.id in o.partes?o.partes[pa.id]:null;
const ptForma=(o,pa,um)=>!o?null:um?o.forma:o.partesForma?.[pa.id]??o.forma;
function secPartesCom(t){const P=partesAtivas(t),o=ofertaRef(t),um=P.length===1,ro=UI.role==='Leitura'||!o;
  const L=(x)=>`<span class="lbl-f ptcom-ml">${x}</span>`;
  const linhas=P.map(pa=>{const ms=matsParte(t,pa),is=inscParte(t,pa),a=ptArea(t,pa),v=ptValor(o,pa,um),fm=ptForma(o,pa,um);
    return `<div class="ptcom-r"><div class="ptcom-p"><b>${esc(pa.nome)}</b>${pa.pessoa?` <span class="faint">${esc(pa.pessoa)}</span>`:''}<div class="faint">${ms.length||is.length?[ms.length&&'Mat. '+ms.map(m=>esc(m.num)).join(', '),is.length&&etqRot(t)+' '+is.map(i=>esc(i.sql)).join(', ')].filter(Boolean).join(' · '):'sem matrícula nem SQL'}</div></div>
      <div class="ptcom-c">${L('Área adotada')}<span>${a!=null?m2(a):'—'}</span></div>
      <div class="ptcom-c">${L('Zoneamento')}<span>${esc(ptZonas(t,pa).join(' / '))||'—'}</span></div>
      <div class="ptcom-c field">${L('Valor pedido')}${ro?`<span>${v!=null?brl(v):'—'}</span>`:`<input class="ptc-n" data-ch="ptc" data-k="valor" data-p="${pa.id}" inputmode="decimal" value="${v!=null?num(v):''}" placeholder="R$" aria-label="Valor pedido de ${esc(pa.nome)}">`}</div>
      <div class="ptcom-c field">${L('Valor por m²')}${ro?`<span>${v!=null&&a?brl(v/a):'—'}</span>`:`<input class="ptc-n" data-ch="ptc" data-k="m2" data-p="${pa.id}" inputmode="decimal" value="${v!=null&&a?num(v/a):''}" placeholder="${a?'R$/m²':'sem área'}" ${a?'':'disabled'} aria-label="Valor por m² de ${esc(pa.nome)}">`}</div>
      <div class="ptcom-c field">${L('Condição de pagamento')}${ro?`<span>${fm?OPT.forma[fm]:'—'}</span>`:`<select data-ch="ptc" data-k="forma" data-p="${pa.id}" aria-label="Condição de pagamento de ${esc(pa.nome)}"><option value="">Não informada</option>${Object.entries(OPT.forma).map(([k,x])=>`<option value="${k}" ${k===fm?'selected':''}>${x}</option>`).join('')}</select>`}</div></div>`}).join('');
  const aT=P.reduce((s,pa)=>s+(ptArea(t,pa)||0),0),vs=P.map(pa=>ptValor(o,pa,um)),vT=vs.some(v=>v!=null)?vs.reduce((s,v)=>s+(v||0),0):null;
  const aCom=P.filter(pa=>ptValor(o,pa,um)!=null).reduce((s,pa)=>s+(ptArea(t,pa)||0),0),falta=vs.filter(v=>v==null).length;
  return `<section class="sec" id="sec-partes-com"><div class="sec-h"><h2>Partes <span class="h-n">${P.length}</span></h2>${o?`<span class="faint" style="font-size:12px">oferta de ${fd(o.data)}</span>`:''}</div><div class="sec-b">
    ${o?'':`<div class="muted" style="margin-bottom:10px">Registre a oferta para informar o valor pedido de cada parte. <button class="btn sm" data-a="nova-oferta">${ic('add',16)}Registrar oferta</button></div>`}
    <div class="ptcom"><div class="ptcom-r ptcom-th"><span>Parte</span><span>Área adotada</span><span>Zoneamento</span><span>Valor pedido</span><span>Valor por m²</span><span>Condição de pagamento</span></div>${linhas}
    ${P.length>1?`<div class="ptcom-r ptcom-tot"><div class="ptcom-p"><b>Total</b></div><div class="ptcom-c">${L('Área adotada')}<span>${aT?m2(aT):'—'}</span></div><div class="ptcom-c"></div><div class="ptcom-c">${L('Valor pedido')}<span>${vT!=null?brl(vT)+(falta?` <span class="faint">(faltam ${falta})</span>`:''):'—'}</span></div><div class="ptcom-c">${L('Valor por m²')}<span>${vT!=null&&aCom?brl(vT/aCom):'—'}</span></div><div class="ptcom-c"></div></div>`:''}</div>
    <div class="hint">Digite o total ou o valor por m²: o outro se calcula pela área da parte (soma das matrículas dela). Área e zoneamento vêm da aba Terreno. As propostas da BKM ficam no quadro Propostas.</div></div></section>`}

/* ---------- poligonal pelos SQLs ----------
   Cada SQL incluído ou excluído refaz a poligonal do terreno: a soma dos lotes da prefeitura de todos os SQLs
   com base (GeoSampa, GeoSanja; cada lote cresce 1 cm para os vizinhos se juntarem). A desenhada fica guardada e
   volta quando não sobra SQL com lote. SQL sem lote na prefeitura (ou fora do ar) fica de fora, com aviso. */
function etqTrocar(t,poly,txt){const ant=t.poly?areaPoly(t.poly):null;(t.polyAnt=t.polyAnt||[]).push({em:agora(),user:me(),poly:t.poly});t.poly=poly;const c=centro(poly);t.lat=+c[0].toFixed(7);t.lng=+c[1].toFixed(7);t.precisao='aproximada';
  log(t,`${txt}: ${ant!=null?m2(Math.round(ant))+' → ':''}${m2(Math.round(areaPoly(poly)))}`)}
let ETQ_POLY=null,ETQ_POLY_DE_NOVO=false;
const etqPolyDe=i=>i.polyLote||(i.geo||[])[0]?.poly||null;
async function etqPoly(t,como){if(ETQ_POLY){ETQ_POLY_DE_NOVO=true;return}ETQ_POLY=t.id;
  try{const L=lotesInsc(t),polys=[],fora=[];
    if(!L.length){if(t.polyLotes&&t.polyDesenho){etqTrocar(t,t.polyDesenho,'Poligonal volta a ser a desenhada (sem SQL com lote na prefeitura)');delete t.polyLotes;save();render();toast('Sem SQL com lote: a poligonal voltou a ser a desenhada.')}return}
    if(L.some(x=>!etqPolyDe(x.ins))&&LOTE_ADAPT[L[0].cid].url())render();
    for(const x of L){let p=etqPolyDe(x.ins);
      if(!p&&LOTE_ADAPT[x.cid].url())try{p=await LOTE_ADAPT[x.cid].poligono(x.ins.sql);if(p)x.ins.polyLote=p}catch(e){console.warn(e)}
      if(p)polys.push(p);else fora.push(x.ins.sql)}
    if(!polys.length)return;
    const u=lotesUniao(polys);if(!u){toast('Os lotes dos SQLs não se encostam: a poligonal continua a de antes.',true);return}
    if(t.poly&&JSON.stringify(u)===JSON.stringify(t.poly))return;
    if(!t.polyLotes&&t.poly)t.polyDesenho=t.poly;
    etqTrocar(t,u,`Poligonal refeita pelos lotes da prefeitura (${como}; ${polys.length} SQL${polys.length>1?'s':''})`);t.polyLotes=true;
    const sob=sobreposicoes(u,t.id);if(sob.length)t.sobreAceitas=[...new Set([...(t.sobreAceitas||[]),...sob.map(x=>x.t.id)])];
    save();render();
    toast(`Poligonal refeita pelos lotes: ${m2(Math.round(areaPoly(u)))}.`+(fora.length?` Sem lote na prefeitura: ${fora.join(', ')}.`:'')+(sob.length?` Ocupa parte de ${sob.map(x=>x.t.codigo).join(', ')}.`:''),!!(fora.length||sob.length))}
  finally{ETQ_POLY=null;if(ETQ_POLY_DE_NOVO){ETQ_POLY_DE_NOVO=false;etqPoly(t,como)}else render()}}

/* ---------- eventos ---------- */
function ltRender(t){lotesNorm(t);save();render();if(UI.modal==='etq')renderModal()}
const etqNome=(t,tipo,x)=>tipo==='m'?`Matrícula ${x.num}`:`${CIDADES_INSC[insCid(x)]?.rotulo||'SQL'} ${x.sql}`;
/* liga a etiqueta à parte (ou a deixa sem parte) */
function etqParte(t,k,pid){const e=etqAchar(t,k);if(!e)return;const {tipo,x}=e,ant=x.parte||null;pid=pid||null;if(ant===pid)return;
  x.parte=pid;log(t,`${etqNome(t,tipo,x)}: ${pid?`na parte ${parteDe(t,pid).nome}`:'sem parte'}${ant?` (estava em ${parteDe(t,ant)?.nome||'outra parte'})`:''}`);ltRender(t)}
function etqExcluir(t,k){const e=etqAchar(t,k);if(!e)return;const {tipo,x}=e;
  if(tipo==='m')t.mats.splice(t.mats.indexOf(x),1);else t.insc.splice(t.insc.indexOf(x),1);
  log(t,`${etqNome(t,tipo,x)} excluída do terreno`);if(UI.modal==='etq'||UI.modal==='etq-conf'){UI.modal=null;renderModal()}ltRender(t);toast(`${etqNome(t,tipo,x)} excluída.`);
  if(tipo==='s'&&LOTE_ADAPT[insCid(x)]?.poligono)etqPoly(t,`${x.sql} excluído`)}
function etqConfHtml(fechar){const t=T(UI.id),e=t&&etqAchar(t,UI.etqConf);if(!e)return '';
  return `<div class="dh"><h2>Excluir ${esc(etqNome(t,e.tipo,e.x))}?</h2>${fechar}</div><p style="margin:0">Ele tem IPTU lançado, que sai junto. A poligonal é refeita sem o lote dele.</p>
    <div class="df"><button class="btn text" data-a="close">Cancelar</button><button class="btn primary" data-a="etq-x-sim">Excluir</button></div>`}
document.addEventListener('input',e=>{const el=e.target;if(el.dataset?.doc){const n=ptDocFmt(el.value);if(n!==el.value)el.value=n}},true);
document.addEventListener('change',e=>{const el=e.target.closest('[data-ch]');if(!el||UI.route!=='terreno')return;const ch=el.dataset.ch,t=T(UI.id);if(!t||!['pt2','pt2-n','etq','ptc'].includes(ch))return;
  if(ch==='pt2-n'){ptQtd(t,parseInt(el.value,10));return}
  if(ch==='pt2'){const pa=parteDe(t,el.dataset.p),k=el.dataset.k;if(!pa)return;let v;
    try{v=k==='nome'?el.value.trim():ptValida(k,el.value)}catch(err){toast(err.message,true);el.focus();return}
    if(k==='nome'){if(!v){toast('A parte precisa de um título.',true);el.value=pa.nome;return}if(partesAtivas(t).some(x=>x!==pa&&x.nome.trim().toLowerCase()===v.toLowerCase())){toast('Já existe uma parte com este título.',true);el.value=pa.nome;return}}
    if((pa[k]||null)===v)return;pa[k]=v;ltRender(t);return}
  if(ch==='etq'){const e=etqAchar(t,UI.etq),k=el.dataset.k;if(!e)return;const {tipo,x}=e;let v=el.value;
    if(k==='parte'){etqParte(t,UI.etq,v);return}
    if(k==='num'){v=v.trim();if(!v){toast('Informe o número da matrícula.',true);el.value=x.num;return}
      const o=t.mats.find(m=>m!==x&&digits(m.num)===digits(v)&&criIgual(m.cri,x.cri));if(o){toast(`A matrícula ${v} já está no terreno.`,true);el.value=x.num;return}
      const ou=dupOutroTerreno(t,{num:v,cri:x.cri});if(ou){el.value=x.num;ltDupAbrir(ou,`A matrícula ${v}`);return}}
    if(k==='area')v=lerNum(v);if(k==='data')v=v||null;
    if(k==='cri'){x.criDig=!!v&&v!==t.cri}
    const ant=x[k];if(ant===v)return;x[k]=v;log(t,`${etqNome(t,tipo,x)}: ${({num:'número',cri:'cartório',area:tipo==='m'?'área registrada':'área cadastral',data:'data da certidão'})[k]} ${ant??'—'} → ${v??'—'}`);ltRender(t);return}
  if(ch==='ptc'){const o=ofertaRef(t),pa=parteDe(t,el.dataset.p),k=el.dataset.k,um=partesAtivas(t).length===1;if(!o||!pa)return;
    if(k==='forma'){if(um)o.forma=el.value||null;else{o.partesForma=o.partesForma||{};o.partesForma[pa.id]=el.value||null;o.partes=o.partes||{};if(!(pa.id in o.partes))o.partes[pa.id]=null}save();render();return}
    const a=ptArea(t,pa);let v=lerNum(el.value);if(k==='m2')v=v!=null&&a?Math.round(v*a):null;
    if(um)o.valor=v;else{o.partes=o.partes||{};o.partes[pa.id]=v;const vs=partesAtivas(t).map(x=>o.partes[x.id]).filter(x=>x!=null);if(vs.length)o.valor=vs.reduce((s,x)=>s+x,0)}
    save();render();return}});
function ptQtd(t,n){const P=partesAtivas(t);n=Math.max(1,Math.min(30,n||1));
  while(partesAtivas(t).length<n)ptNova(t);
  if(n<P.length){const sai=partesAtivas(t).slice(n).reverse();for(const pa of sai){if(!ptVazia(t,pa)){toast(`${pa.nome} já tem dados, matrículas ou SQLs: use Excluir parte.`,true);break}t.partes.splice(t.partes.indexOf(pa),1)}}
  if(t.neg&&typeof abrirPartes==='function')abrirPartes(t);ltRender(t)}
function ptNova(t){let n=partesAtivas(t).length+1;while(partesAtivas(t).some(p=>p.nome.trim().toLowerCase()==='vendedor '+n))n++;
  const pa={id:uid(),ativa:true,neg:null,propostas:[],nome:'Vendedor '+n,essencial:true,area:null};partesDe(t).push(pa);return pa}
/* recolher a linha inteira de quadros das partes (os que estão na mesma altura do clicado) */
function etqLinha(pid){const el=document.querySelector(`.etq-pt[data-p="${pid}"]`);if(!el)return;const fechar=!ETQ_FECHADAS.has(pid),y=el.offsetTop;
  document.querySelectorAll('.etq-pt').forEach(b=>{if(Math.abs(b.offsetTop-y)<4){fechar?ETQ_FECHADAS.add(b.dataset.p):ETQ_FECHADAS.delete(b.dataset.p);b.classList.toggle('fechado',fechar);b.querySelector('.etq-pt-h').setAttribute('aria-expanded',String(!fechar))}})}
let ETQ_SOLTOU=0;
document.addEventListener('click',e=>{const a=e.target.closest('[data-a]');if(!a||UI.route!=='terreno')return;const A=a.dataset.a;if(!['pt2-mais','pt2-menos','pt2-excluir','etq-ver','etq-x','etq-x-sim','etq-linha','etq-tudo'].includes(A))return;
  const t=T(UI.id);if(!t)return;
  if(A==='etq-linha'){etqLinha(a.dataset.p);return}
  if(A==='etq-ver'){if(Date.now()-ETQ_SOLTOU<400)return;UI.etq=a.dataset.k;UI.modal='etq';renderModal();return}
  if(UI.role==='Leitura')return;
  if(A==='etq-x'){const e2=etqAchar(t,a.dataset.k);if(!e2)return;if(e2.tipo==='s'&&e2.x.valores.length){UI.etqConf=a.dataset.k;UI.modal='etq-conf';renderModal();return}etqExcluir(t,a.dataset.k);return}
  if(A==='etq-x-sim'){etqExcluir(t,UI.etqConf);return}
  if(A==='etq-tudo'){const pa=partesAtivas(t)[0],n=t.mats.filter(m=>!m.parte).length+t.insc.filter(i=>!i.parte).length;if(!pa||!n)return;
    t.mats.forEach(m=>{if(!m.parte)m.parte=pa.id});t.insc.forEach(i=>{if(!i.parte)i.parte=pa.id});log(t,`${n} etiqueta${n>1?'s':''} (matrículas e SQLs) enviada${n>1?'s':''} para a parte ${pa.nome}`);ltRender(t);toast(`Tudo na parte ${pa.nome}.`);return}
  if(A==='pt2-mais'){const pa=ptNova(t);if(t.neg&&typeof abrirPartes==='function')abrirPartes(t);ltRender(t);setTimeout(()=>document.querySelector(`#pt2-${pa.id} [data-k=pessoa]`)?.focus(),30);return}
  if(A==='pt2-menos'){ptQtd(t,partesAtivas(t).length-1);return}
  if(A==='pt2-excluir'){const pa=parteDe(t,a.dataset.p);if(!pa)return;
    if(partesAtivas(t).length<2){toast('O terreno precisa de pelo menos uma parte.',true);return}
    if(pa.neg||(pa.propostas||[]).length||t.pessoas.some(p=>p.parte===pa.id)||t.ofertas.some(o=>o.partes&&pa.id in o.partes&&o.partes[pa.id]!=null)){partesClick('pt-remover',a,t);return}
    /* as matrículas e os SQLs da parte voltam para o quadro de cima, sem parte */
    const n=matsParte(t,pa).length+inscParte(t,pa).length;t.mats.forEach(m=>{if(m.parte===pa.id)m.parte=null});t.insc.forEach(i=>{if(i.parte===pa.id)i.parte=null});
    t.partes.splice(t.partes.indexOf(pa),1);t.corretores.forEach(x=>{if(x.partes)x.partes=x.partes.filter(id=>id!==pa.id)});log(t,`Parte excluída: ${pa.nome}`);ltRender(t);toast(`${pa.nome} excluída.${n?` ${n} etiqueta${n>1?'s voltaram':' voltou'} para o quadro de cima.`:''}`);return}});
document.addEventListener('submit',e=>{const f=e.target;if(!['etq-mat','etq-sql'].includes(f.dataset.form))return;e.preventDefault();const t=T(UI.id);if(!t||UI.role==='Leitura')return;
  const F=Object.fromEntries(new FormData(f));
  if(f.dataset.form==='etq-mat'){const n=(F.num||'').trim(),cri=(F.cri||'').trim()||t.cri||'';if(!digits(n)){toast('Informe o número da matrícula.',true);return}
    if(t.mats.some(m=>digits(m.num)===digits(n)&&criIgual(m.cri,cri))){toast(`A matrícula ${n} já está no terreno.`,true);return}
    const ou=dupOutroTerreno(t,{num:n,cri});if(ou){ltDupAbrir(ou,`A matrícula ${n}`);return}
    t.mats.push({id:uid(),num:n,cri,criDig:!!cri&&cri!==t.cri,area:lerNum(F.area),data:null,parte:null});log(t,`Matrícula ${n} incluída${cri?` (${cri})`:''}`);ltRender(t);
    setTimeout(()=>$('#em-n')?.focus(),30);return}
  const c=CIDADES_INSC[F.mun]||CIDADES_INSC.sp;
  if(!digits(F.sql)){toast(`Digite o ${c.rotulo}.`,true);return}
  if(c.mascara&&digits(F.sql).length!==digitosMasc(c.mascara)){toast(`${c.rotulo} incompleto: são ${digitosMasc(c.mascara)} dígitos.`,true);return}
  if(t.insc.some(x=>insCid(x)===F.mun&&digits(x.sql)===digits(F.sql)&&(c.mascara||x.sql===F.sql))){toast(`O ${c.rotulo} ${F.sql} já está no terreno.`,true);return}
  const ou=dupOutroTerreno(t,{sql:F.sql,mun:F.mun});if(ou){ltDupAbrir(ou,`O ${c.rotulo} ${F.sql}`);return}
  const ins={id:uid(),mun:F.mun,sql:F.sql,area:null,valores:[],parte:null};t.insc.push(ins);log(t,`${c.rotulo} ${F.sql} (${c.cidade}) incluído`);ltRender(t);setTimeout(()=>$('#es-sql')?.focus(),30);
  /* consulta completa na prefeitura (preenche área, zonas, camadas, planta e desenho) e refaz a poligonal */
  (async()=>{if(loteBuscavel(ins)){await loteBuscar(t,t.insc.indexOf(ins));}if(LOTE_ADAPT[insCid(ins)]?.poligono)etqPoly(t,`${F.sql} incluído`)})()});

/* ---------- arrastar e soltar (mouse e toque: no toque, segurar a etiqueta antes de arrastar) ---------- */
let ETQ_ARR=null;
function etqComecar(){const a=ETQ_ARR;if(!a)return;a.ativo=true;const r=a.el.getBoundingClientRect();a.dx=a.x-r.left;a.dy=a.y-r.top;
  const g=a.el.cloneNode(true);g.classList.add('etq-fantasma');g.style.width=r.width+'px';document.body.appendChild(g);a.g=g;a.el.classList.add('etq-origem');document.body.classList.add('etq-arrastando');
  const tipo=a.k[0],orig=a.el.closest('[data-drop]');
  document.querySelectorAll('#sec-lotes [data-drop]').forEach(d=>{if(d!==orig&&(d.dataset.drop==='parte'||d.dataset.tipo===tipo))d.classList.add('etq-aceita')});
  if(navigator.vibrate&&a.toque)try{navigator.vibrate(15)}catch(e){}etqMover(a.x,a.y)}
function etqMover(x,y){const a=ETQ_ARR;if(!a?.g)return;a.g.style.left=(x-a.dx)+'px';a.g.style.top=(y-a.dy)+'px';
  const d=document.elementFromPoint(x,y)?.closest?.('.etq-aceita');document.querySelectorAll('.etq-sobre').forEach(z=>{if(z!==d)z.classList.remove('etq-sobre')});if(d)d.classList.add('etq-sobre');
  const m=60;if(y<m)scrollBy(0,-14);else if(y>innerHeight-m)scrollBy(0,14)}
function etqFim(soltar,x,y){const a=ETQ_ARR;ETQ_ARR=null;if(!a)return;clearTimeout(a.timer);if(!a.ativo)return;ETQ_SOLTOU=Date.now();
  a.g?.remove();a.el.classList.remove('etq-origem');document.body.classList.remove('etq-arrastando');
  const d=soltar?document.elementFromPoint(x,y)?.closest?.('.etq-aceita'):null;
  document.querySelectorAll('.etq-aceita,.etq-sobre').forEach(z=>z.classList.remove('etq-aceita','etq-sobre'));
  const t=T(UI.id);if(d&&t)etqParte(t,a.k,d.dataset.drop==='parte'?d.dataset.p:null)}
document.addEventListener('pointerdown',e=>{const el=e.target.closest('#sec-lotes .etq[data-etq]');if(!el||e.button>0||UI.role==='Leitura'||e.target.closest('.etq-x'))return;
  ETQ_ARR={el,k:el.dataset.etq,x:e.clientX,y:e.clientY,pid:e.pointerId,toque:e.pointerType!=='mouse',ativo:false};
  if(ETQ_ARR.toque){const a=ETQ_ARR;a.timer=setTimeout(()=>{if(ETQ_ARR===a)etqComecar()},300)}});
document.addEventListener('pointermove',e=>{const a=ETQ_ARR;if(!a||e.pointerId!==a.pid)return;
  if(!a.ativo){const d=Math.hypot(e.clientX-a.x,e.clientY-a.y);if(a.toque){if(d>8){clearTimeout(a.timer);ETQ_ARR=null}return}if(d<5)return;etqComecar()}
  e.preventDefault();etqMover(e.clientX,e.clientY)});
document.addEventListener('touchmove',e=>{if(ETQ_ARR?.ativo)e.preventDefault()},{passive:false});
document.addEventListener('contextmenu',e=>{if(ETQ_ARR||e.target.closest?.('#sec-lotes .etq'))e.preventDefault()});
document.addEventListener('pointerup',e=>{if(ETQ_ARR&&e.pointerId===ETQ_ARR.pid)etqFim(true,e.clientX,e.clientY)});
document.addEventListener('pointercancel',e=>{if(ETQ_ARR&&e.pointerId===ETQ_ARR.pid)etqFim(false)});
/* teclado: Enter abre a etiqueta (lá se escolhe a parte) */
document.addEventListener('keydown',e=>{const el=e.target.closest?.('#sec-lotes .etq[data-etq]');if(el&&e.key==='Enter'&&e.target===el){e.preventDefault();UI.etq=el.dataset.etq;UI.modal='etq';renderModal()}});

/* matrícula ou SQL que já está em outro terreno: o lote não entra; pergunta se quer registrar uma nova oferta
   naquele terreno, e o analista decide lá se segue ou descarta (decisão do Moisés, 4/nov/2026).
   Cartório em branco conta como o mesmo (é o da poligonal, ainda não conhecido). */
const criIgual=(a,b)=>!a||!b||a===b;
function dupOutroTerreno(t,q){return S.terrenos.find(x=>x!==t&&(q.num?x.mats.some(m=>digits(m.num)===digits(q.num)&&criIgual(m.cri,q.cri)):x.insc.some(i=>insCid(i)===q.mun&&digits(i.sql)===digits(q.sql))))}
function ltDupAbrir(ou,oque){UI.ltDup={id:ou.id,oque};UI.modal='lt-dup';renderModal()}
function ltDupHtml(fechar){const d=UI.ltDup,ou=d&&T(d.id);if(!ou)return '';
  return `<div class="dh"><div><h2>${esc(d.oque)} já está em outro terreno</h2></div>${fechar}</div>
  <div class="banner blue">${ic('link')}<div style="flex:1"><div class="bt">${ou.codigo} · ${esc(ou.nome)}</div><div>O lote não é cadastrado de novo. Se chegou uma oferta, registre-a nesse terreno: o analista decide lá se segue a tratativa ou descarta.</div></div></div>
  <div class="df"><button class="btn text" data-a="close">Cancelar</button><button class="btn" data-a="abrir" data-id="${ou.id}">Abrir ${ou.codigo}</button><button class="btn primary" data-a="lt-dup-oferta">Registrar nova oferta no ${ou.codigo}</button></div>`}
document.addEventListener('click',e=>{const a=e.target.closest('[data-a=lt-dup-oferta]');if(!a||!UI.ltDup)return;const ou=T(UI.ltDup.id);UI.ltDup=null;if(ou)nvAbrirOferta(ou,null,`Registre a nova oferta no ${ou.codigo}.`)});
