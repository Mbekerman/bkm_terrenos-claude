/* ---------- Partes e Lotes (lote 5 da ficha em abas; decisões do Moisés, 4/nov/2026) ----------
   Todo terreno tem pelo menos uma parte (nasce "Vendedor 1"), com contato opcional: pessoa principal, telefone,
   e-mail, CPF ou CNPJ e observação. Cada lote é uma matrícula com um ou mais SQLs e pertence a uma parte.
   O mesmo SQL pode estar em dois lotes quando cobre duas matrículas: a divergência de área é conferida no grupo
   de lotes que dividem o SQL. A matrícula mora no lote; t.mats é derivada dos lotes (lotesNorm), e a parte da
   inscrição vem dos lotes dela. IPTU e valor venal: só o exercício mais recente.
   No banco: app.terreno_lotes, app.lote_inscricoes, app.salvar_lote, app.excluir_lote, app.excluir_parte,
   app.v_lotes, app.v_partes (área e zonas dos lotes), oferta_partes.forma_pagamento. */

const LT_FONTE={documental:'Matrícula',cadastral:'SQLs',informada:'Informada'};
const ltDe=(t,id)=>(t.lotes||[]).find(l=>l.id===id);
const ltDaParte=(t,pa)=>(t.lotes||[]).filter(l=>l.parte===pa.id);
const ltIns=(t,l)=>l.ins.map(id=>t.insc.find(i=>i.id===id)).filter(Boolean);
const ltOutros=(t,l,ins)=>(t.lotes||[]).filter(x=>x!==l&&x.ins.includes(ins.id));
function ltTitulo(t){let n=(t.lotes||[]).length+1;while((t.lotes||[]).some(l=>l.titulo.trim().toLowerCase()==='lote '+n))n++;return 'Lote '+n}
const ltNovo=(t,parte,extra)=>Object.assign({id:uid(),titulo:ltTitulo(t),parte,num:'',cri:t.cri||'',criDig:false,area:null,data:null,ins:[],fonte:'documental',areaInf:null},extra||{});

/* deixa o terreno no modelo novo: uma parte pelo menos, matrículas e SQLs dentro de lotes */
function lotesNorm(t){if(!t)return;const P=partesDe(t);
  if(!P.some(p=>p.ativa))P.push({id:uid(),ativa:true,neg:null,propostas:[],nome:'Vendedor 1',essencial:true,area:null});
  const p1=partesAtivas(t)[0].id,ativa=id=>!!id&&parteDe(t,id)?.ativa;
  t.insc.forEach(i=>{if(!i.id)i.id=uid()});
  if(!t.lotes)t.lotes=[];
  /* a parte trocada na matrícula por outra tela (Editar parte) vale para o lote */
  t.mats.forEach(m=>{const l=m.lote&&ltDe(t,m.lote);if(l&&m.parte&&m.parte!==l.parte&&ativa(m.parte))l.parte=m.parte});
  /* matrícula que não veio de um lote (dados antigos, Novo terreno, Incluir matrícula na parte) vira lote */
  t.mats.filter(m=>!m.lote||!ltDe(t,m.lote)).forEach(m=>{t.lotes.push(ltNovo(t,ativa(m.parte)?m.parte:p1,{num:m.num||'',cri:m.cri||t.cri||'',criDig:!!m.cri&&m.cri!==t.cri,area:m.area??null,data:m.data||null}))});
  /* SQL sem lote: entra no primeiro lote da parte dele que ainda não tem SQL, senão no último; sem lote, num lote novo */
  const em=new Set(t.lotes.flatMap(l=>l.ins));
  /* o SQL do mapa de lotes da prefeitura fica solto até alguém escolhê-lo num lote (proto_lotesgeo.js) */
  t.insc.forEach(i=>{if(i.solto&&em.has(i.id))delete i.solto});
  t.insc.filter(i=>!em.has(i.id)&&!i.solto).forEach(i=>{const pa=ativa(i.parte)?i.parte:null,c=t.lotes.filter(l=>!pa||l.parte===pa);
    let alvo=c.find(l=>!l.ins.length)||c[c.length-1];if(!alvo){alvo=ltNovo(t,pa||p1);t.lotes.push(alvo)}alvo.ins.push(i.id)});
  t.lotes.forEach(l=>{l.ins=l.ins.filter(id=>t.insc.some(i=>i.id===id));if(!ativa(l.parte))l.parte=p1;if(!l.criDig&&t.cri)l.cri=t.cri});
  t.mats=t.lotes.filter(l=>l.num).map(l=>({id:l.id,lote:l.id,num:l.num,cri:l.cri,area:l.area,data:l.data,parte:l.parte}));
  t.insc.forEach(i=>{const ps=[...new Set(t.lotes.filter(l=>l.ins.includes(i.id)).map(l=>l.parte))];i.parte=ps.length===1?ps[0]:null})}

/* grupos de lotes que dividem um SQL (app.v_lotes) */
function ltGrupos(t){const L=t.lotes||[],pai=new Map(L.map(l=>[l.id,l.id])),raiz=x=>pai.get(x)===x?x:raiz(pai.get(x));
  L.forEach(a=>L.forEach(b=>{if(a!==b&&a.ins.some(i=>b.ins.includes(i)))pai.set(raiz(a.id),raiz(b.id))}));
  const g={};L.forEach(l=>(g[raiz(l.id)]=g[raiz(l.id)]||[]).push(l));return id=>g[raiz(id)]}
function ltInfo(t,l){const ins=ltIns(t,l),comp=ins.some(i=>ltOutros(t,l,i).length),cad=ins.length&&ins.every(i=>i.area!=null)?ins.reduce((s,i)=>s+i.area,0):null;
  const adot=l.fonte==='documental'?l.area:l.fonte==='cadastral'?(comp?null:cad):l.areaInf;
  const grupo=ltGrupos(t)(l.id),gIns=[...new Set(grupo.flatMap(x=>x.ins))].map(id=>t.insc.find(i=>i.id===id)).filter(Boolean);
  const gMat=grupo.every(x=>x.area!=null)?grupo.reduce((s,x)=>s+x.area,0):null,gCad=gIns.length&&gIns.every(i=>i.area!=null)?gIns.reduce((s,i)=>s+i.area,0):null;
  const div=gMat&&gCad!=null?Math.round((gCad-gMat)/gMat*1000)/10:null;
  return {ins,comp,cad:comp?null:cad,adot,grupo,div}}
const ltZonas=(t,l)=>{const a=analiseVig(t);if(!a)return [];const ds=ltIns(t,l).map(i=>digits(i.sql));return [...new Set(a.zonas.filter(z=>{const k=digits(zIns(t,z)||'');return k&&ds.includes(k)}).map(z=>z.sigla))]};
const ptArea=(t,pa)=>{const v=ltDaParte(t,pa).map(l=>ltInfo(t,l).adot).filter(v=>v!=null);return v.length?v.reduce((a,b)=>a+b,0):null};
const ptZonas=(t,pa)=>[...new Set(ltDaParte(t,pa).flatMap(l=>ltZonas(t,l)))];
const ptVazia=(t,pa)=>!ltDaParte(t,pa).length&&!pa.neg&&!(pa.propostas||[]).length&&!t.pessoas.some(p=>p.parte===pa.id)&&!t.corretores.some(x=>(x.partes||[]).includes(pa.id))
  &&!t.ofertas.some(o=>o.partes&&pa.id in o.partes)&&!['pessoa','tel','email','doc','obs'].some(k=>pa[k]);

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
    <div class="pt2-lista">${P.map(pa=>{const nl=ltDaParte(t,pa).length;return `<article class="pt2" id="pt2-${pa.id}">
      <div class="pt2-h">${ro?`<b>${esc(pa.nome)}</b>`:`<input class="pt2-tit" data-ch="pt2" data-k="nome" data-p="${pa.id}" value="${esc(pa.nome)}" aria-label="Título da parte">`}
        <span class="chip ${nl?'good':''}">${nl?nl+(nl>1?' lotes':' lote'):'sem lote'}</span>${pa.neg?`<span class="chip">${esc(pa.neg.codigo)}</span>`:''}
        ${!ro&&P.length>1?`<button class="btn text sm pt2-x" data-a="pt2-excluir" data-p="${pa.id}">${ic('lixo',16)}Excluir parte</button>`:''}</div>
      <div class="pt2-g">${inp(pa,'pessoa','Nome completo da pessoa principal')}${inp(pa,'tel','Telefone','inputmode="tel" data-mask="telefone" placeholder="(11) 98765-4321"')}${inp(pa,'email','E-mail','type="email" placeholder="nome@email.com"')}${inp(pa,'doc','CPF ou CNPJ','inputmode="numeric" data-doc="1"')}
        <label class="field pt2-obs"><span class="lbl-f">Observação</span>${ro?`<span class="v">${esc(pa.obs||'')||'<span class="ni">Não informada</span>'}</span>`:`<textarea data-ch="pt2" data-k="obs" data-p="${pa.id}" rows="1">${esc(pa.obs||'')}</textarea>`}</label></div></article>`}).join('')}</div>
    ${ro?'':`<button class="btn text sm qd-add" data-a="pt2-mais">${ic('add',16)}Adicionar parte</button>`}</div></section>`}

/* ---------- aba Terreno: Lotes (matrícula + SQLs) ---------- */
/* detalhes do SQL abertos continuam abertos ao redesenhar a ficha */
const LT_DET=new Set();
document.addEventListener('toggle',e=>{const d=e.target;if(d.classList?.contains('lt-det')&&d.dataset.det){d.open?LT_DET.add(d.dataset.det):LT_DET.delete(d.dataset.det)}},true);
function ltSqlLinha(t,l,ins,ro){const i=t.insc.indexOf(ins),c=CIDADES_INSC[insCid(ins)],out=ltOutros(t,l,ins);
  const vs=ins.valores.filter(v=>v.vig).sort((a,b)=>b.ex-a.ex),v=vs[0],venal=v?(v.vt!=null&&v.vc!=null?v.vt+v.vc:(v.venal??v.vt??null)):null;
  return `<div class="lt-sql" id="lt-ins-${ins.id}"><div class="lt-sql-h"><b class="num">${esc(ins.sql)}</b><span class="faint">${c.rotulo}</span>
      <span class="muted">área cadastral ${ins.area!=null?m2(ins.area):'não informada'}</span>${out.length?`<span class="chip warn" title="O SQL cobre mais de uma matrícula">também em ${esc(out.map(x=>x.titulo).join(', '))}</span>`:''}
      ${v?`<span class="muted">IPTU ${v.ex}: ${v.sit==='isento'?'isento':brl2(v.iptu)}${venal!=null?` · venal ${mi(venal)}`:''}</span>`:''}
      ${ro?'':`<button class="iconbtn sm lixo" data-a="lt-sql-tira" data-l="${l.id}" data-i="${ins.id}" aria-label="Tirar o SQL ${esc(ins.sql)} do lote" title="Tirar do lote">${ic('lixo',18)}</button>`}</div>
    <details class="details lt-det" data-det="${ins.id}" ${LT_DET.has(ins.id)||LOTE_BUSCANDO===t.id+':'+i?'open':''}><summary>Prefeitura, valor venal e IPTU</summary>${loteQuadro(t,ins,i)}
      ${v?`<div class="tblwrap"><table class="mini-tbl vv"><thead><tr><th>Exercício</th><th class="r">Venal terreno</th><th class="r">Venal construção</th><th class="r">Venal do imóvel</th><th>IPTU</th><th class="r">Anual</th><th class="r">Parcela</th><th>Fonte</th></tr></thead><tbody>
        <tr><td><b>${v.ex}</b>${v.rev>1?`<span class="faint"> · rev. ${v.rev}</span>`:''}</td><td class="r">${brl(v.vt)}</td><td class="r">${brl(v.vc)}</td><td class="r"><b>${brl(venal)}</b></td><td>${v.sit==='isento'?'<span class="chip good">Isento</span>':OPT.sitIptu[v.sit]}</td>
        <td class="r">${v.sit==='isento'?'—':brl2(v.iptu)}</td><td class="r">${v.iptu!=null&&v.parc&&v.sit!=='isento'?`${brl2(v.iptu/v.parc)} <span class="faint">× ${v.parc}</span>`:'—'}</td><td class="muted vv-f">${esc(v.fonte||'—')}</td></tr></tbody></table></div>`:'<div class="muted">Sem IPTU lançado.</div>'}
      ${ro?'':`<form class="inline-form" data-form="iptu" data-i="${i}" style="border:0;padding-top:4px">
        <div class="field" style="flex:0 1 96px"><label for="v-e${i}">Exercício</label><input id="v-e${i}" name="ex" inputmode="numeric" value="${Math.max(new Date().getFullYear(),v?.ex||0)}" required></div>
        <div class="field"><label for="v-vt${i}">Venal terreno (R$)</label><input id="v-vt${i}" name="vt" inputmode="decimal"></div><div class="field"><label for="v-vc${i}">Venal construção (R$)</label><input id="v-vc${i}" name="vc" inputmode="decimal"></div>
        <div class="field"><label for="v-s${i}">Situação do IPTU</label><select id="v-s${i}" name="sit">${Object.entries(OPT.sitIptu).map(([k,x])=>`<option value="${k}" ${k==='tributado'?'selected':''}>${x}</option>`).join('')}</select></div>
        <div class="field"><label for="v-i${i}">IPTU anual (R$)</label><input id="v-i${i}" name="iptu" inputmode="decimal"></div><div class="field" style="flex:0 1 86px"><label for="v-p${i}">Parcelas</label><input id="v-p${i}" name="parc" inputmode="numeric" value="10"></div>
        <div class="field"><label for="v-m${i}">IPTU mensal informado (R$)</label><input id="v-m${i}" name="mensal" inputmode="decimal" placeholder="se a fonte trouxer"></div>
        <div class="field grow"><label for="v-f${i}">Fonte</label><input id="v-f${i}" name="fonte" placeholder="Carnê, certidão de dados cadastrais..." required></div>
        <button class="btn sm">${ic('add',16)}${v?'Atualizar IPTU':'Lançar IPTU'}</button></form><div class="hint">Só vale o exercício mais recente: lançar o ano novo substitui o anterior.</div>`}</details></div>`}
function ltCard(t,l,ro){const P=partesAtivas(t),inf=ltInfo(t,l),cid=cidDoTerreno(t),c=CIDADES_INSC[cid]||CIDADES_INSC.sp;
  const criOrig=l.criDig?'digitado':t.criFonte==='prefeitura'&&l.cri===t.cri?'pela poligonal, GeoSampa':'do terreno';
  const crIs=Array.from({length:18},(_,i)=>`${i+1}º CRI`);if(l.cri&&!crIs.includes(l.cri))crIs.unshift(l.cri);
  const lin=(lab,campo)=>`<label class="field"><span class="lbl-f">${lab}</span>${campo}</label>`;
  const val=(k,x)=>ro?`<span class="v">${x}</span>`:'';
  const divTxt=inf.div!=null&&Math.abs(inf.div)>=1?`<span class="chip ${Math.abs(inf.div)>5?'crit':'warn'}" title="Área cadastral dos SQLs comparada com a da matrícula${inf.grupo.length>1?' (no grupo de lotes que dividem o SQL)':''}">Matrícula × Prefeitura ${inf.div>0?'+':''}${num(inf.div,1)}%${inf.grupo.length>1?` · grupo ${esc(inf.grupo.map(x=>x.titulo).join(' + '))}`:''}</span>`:'';
  return `<article class="lt" id="lt-${l.id}"><div class="lt-h">${ro?`<b>${esc(l.titulo)}</b>`:`<input class="pt2-tit" data-ch="lt" data-k="titulo" data-l="${l.id}" value="${esc(l.titulo)}" aria-label="Título do lote">`}
      ${l.num?'':'<span class="chip warn">sem matrícula</span>'}${divTxt}${ro?'':`<button class="btn text sm pt2-x" data-a="lt-excluir" data-l="${l.id}">${ic('lixo',16)}Excluir lote</button>`}</div>
    <div class="pt2-g">
      ${lin('Parte',ro?val('',esc(parteDe(t,l.parte)?.nome||'—')):`<select data-ch="lt" data-k="parte" data-l="${l.id}">${P.map(pa=>`<option value="${pa.id}" ${pa.id===l.parte?'selected':''}>${esc(pa.nome)}${pa.pessoa?' · '+esc(pa.pessoa):''}</option>`).join('')}</select>`)}
      ${lin('Matrícula <span class="faint">(uma por lote)</span>',ro?val('',esc(l.num||'—')):`<input data-ch="lt" data-k="num" data-l="${l.id}" inputmode="numeric" value="${esc(l.num)}" placeholder="Nº da matrícula">`)}
      ${lin(`Cartório <span class="faint">(${criOrig})</span>`,ro?val('',esc(l.cri||'—')):`<select data-ch="lt" data-k="cri" data-l="${l.id}"><option value="">Não informado</option>${crIs.map(x=>`<option ${x===l.cri?'selected':''}>${esc(x)}</option>`).join('')}</select>`)}
      ${lin('Área da matrícula (m²)',ro?val('',l.area!=null?m2(l.area):'—'):`<input data-ch="lt" data-k="area" data-l="${l.id}" inputmode="decimal" value="${l.area!=null?num(l.area,2):''}" placeholder="m²">`)}
      ${lin('Certidão de',ro?val('',l.data?fd(l.data):'—'):`<input type="date" data-ch="lt" data-k="data" data-l="${l.id}" value="${esc(l.data||'')}">`)}
      ${lin('Área adotada vem de',ro?val('',LT_FONTE[l.fonte]):`<select data-ch="lt" data-k="fonte" data-l="${l.id}">${Object.entries(LT_FONTE).map(([k,x])=>`<option value="${k}" ${k===l.fonte?'selected':''}>${x}</option>`).join('')}</select>`)}
      ${l.fonte==='informada'?lin('Área informada (m²)',ro?val('',m2(l.areaInf)):`<input data-ch="lt" data-k="areaInf" data-l="${l.id}" inputmode="decimal" value="${l.areaInf!=null?num(l.areaInf,2):''}">`):''}
      <div class="field"><span class="lbl-f">Área adotada</span><span class="v lt-adot">${inf.adot!=null?m2(inf.adot):`<span class="ni">${l.fonte==='cadastral'&&inf.comp?'SQL dividido com outro lote: escolha outra fonte':'Não informada'}</span>`}</span></div>
      <div class="field"><span class="lbl-f">Zoneamento</span><span class="v">${esc(ltZonas(t,l).join(' / '))||'<span class="ni">—</span>'}</span></div></div>
    <div class="lt-sqls"><div class="lbl-f">${c.rotulo}${inf.ins.length>1?'s':''}</div>${inf.ins.map(ins=>ltSqlLinha(t,l,ins,ro)).join('')||'<div class="muted">Nenhum ainda.</div>'}
      ${ro?'':`<form class="inline-form lt-add" data-form="lt-sql" data-l="${l.id}">${ltSoltoSel(t,l)}${campoInsc('ls-'+l.id,cid,lgSoltos(t).length?'Ou um novo':null,!lgSoltos(t).length)}<div class="field" style="flex:0 1 150px"><label for="ls-a-${l.id}">Área cadastral (m²)</label><input id="ls-a-${l.id}" name="area" inputmode="decimal"></div><button class="btn sm">${ic('add',16)}Adicionar</button></form>`}</div></article>`}
/* SQLs soltos (do mapa de lotes da prefeitura) para escolher no lote; escolhido, o campo do SQL novo some */
function ltSoltoSel(t,l){const S0=lgSoltos(t);if(!S0.length)return '';
  return `<div class="field grow lt-solto"><label for="lsp-${l.id}">SQL pré-cadastrado</label><select id="lsp-${l.id}" name="solto" data-ch="lt-solto"><option value="">Digitar um SQL novo</option>${S0.map(i=>`<option value="${i.id}">${esc(i.sql)}${i.endPref?' · '+esc(i.endPref):''}${i.area!=null?' · '+m2(i.area):''}</option>`).join('')}</select></div>`}
document.addEventListener('change',e=>{const s=e.target.closest('[data-ch=lt-solto]');if(!s)return;const f=s.form;f.querySelectorAll('.field').forEach(x=>{if(x!==s.closest('.field'))x.hidden=!!s.value})});
function secLotes(t){const ro=UI.role==='Leitura',L=t.lotes||[];
  return `<section class="sec" id="sec-lotes"><div class="sec-h"><h2>Lotes <span class="h-n">${L.length}</span></h2>${lgPode(t)?`<button class="btn sm text" data-a="lg-abrir">${ic('layers',16)}Lotes da prefeitura</button>`:''}${!ro&&lotesInsc(t).length?`<button class="btn sm text" data-a="lotes-poly" ${LOTES_BUSCANDO?'disabled':''}>${ic('layers',16)}${LOTES_BUSCANDO?'Buscando os lotes...':'Usar a poligonal dos lotes'}</button>`:''}</div><div class="sec-b">
    <div class="hint" style="margin:0 0 12px">Cada lote é uma matrícula, com um ou mais SQLs, e pertence a uma parte. O cartório vem da localização da poligonal; trocado à mão, vale o digitado.</div>
    ${lgSoltosHtml(t,ro)}
    <div class="lt-lista">${L.map(l=>ltCard(t,l,ro)).join('')||'<div class="muted">Nenhum lote ainda.</div>'}</div>
    ${ro?'':`<button class="btn text sm qd-add" data-a="lt-novo">${ic('add',16)}Adicionar lote</button>`}</div></section>`}

/* ---------- aba Comercial: a oferta de cada parte ---------- */
const ptValor=(o,pa,um)=>!o?null:um?o.valor:o.partes&&pa.id in o.partes?o.partes[pa.id]:null;
const ptForma=(o,pa,um)=>!o?null:um?o.forma:o.partesForma?.[pa.id]??o.forma;
function secPartesCom(t){const P=partesAtivas(t),o=ofertaRef(t),um=P.length===1,ro=UI.role==='Leitura'||!o;
  const L=(x)=>`<span class="lbl-f ptcom-ml">${x}</span>`;
  const linhas=P.map(pa=>{const ls=ltDaParte(t,pa),a=ptArea(t,pa),v=ptValor(o,pa,um),fm=ptForma(o,pa,um);
    return `<div class="ptcom-r"><div class="ptcom-p"><b>${esc(pa.nome)}</b>${pa.pessoa?` <span class="faint">${esc(pa.pessoa)}</span>`:''}<div class="faint">${ls.length?ls.map(l=>esc(l.titulo)+(l.num?` (mat. ${esc(l.num)})`:'')).join(' · '):'sem lote'}</div></div>
      <div class="ptcom-c">${L('Área adotada')}<span>${a!=null?m2(a):'—'}</span></div>
      <div class="ptcom-c">${L('Zoneamento')}<span>${esc(ptZonas(t,pa).join(' / '))||'—'}</span></div>
      <div class="ptcom-c field">${L('Valor pedido')}${ro?`<span>${v!=null?brl(v):'—'}</span>`:`<input class="ptc-n" data-ch="ptc" data-k="valor" data-p="${pa.id}" inputmode="decimal" value="${v!=null?num(v):''}" placeholder="R$" aria-label="Valor pedido de ${esc(pa.nome)}">`}</div>
      <div class="ptcom-c field">${L('Valor por m²')}${ro?`<span>${v!=null&&a?brl(v/a):'—'}</span>`:`<input class="ptc-n" data-ch="ptc" data-k="m2" data-p="${pa.id}" inputmode="decimal" value="${v!=null&&a?num(v/a):''}" placeholder="${a?'R$/m²':'sem área'}" ${a?'':'disabled'} aria-label="Valor por m² de ${esc(pa.nome)}">`}</div>
      <div class="ptcom-c field">${L('Condição de pagamento')}${ro?`<span>${fm?OPT.forma[fm]:'—'}</span>`:`<select data-ch="ptc" data-k="forma" data-p="${pa.id}" aria-label="Condição de pagamento de ${esc(pa.nome)}"><option value="">Não informada</option>${Object.entries(OPT.forma).map(([k,x])=>`<option value="${k}" ${k===fm?'selected':''}>${x}</option>`).join('')}</select>`}</div></div>`}).join('');
  const aT=P.reduce((s,pa)=>s+(ptArea(t,pa)||0),0),vs=P.map(pa=>ptValor(o,pa,um)),vT=vs.some(v=>v!=null)?vs.reduce((s,v)=>s+(v||0),0):null;
  const aCom=P.filter(pa=>ptValor(o,pa,um)!=null).reduce((s,pa)=>s+(ptArea(t,pa)||0),0),falta=vs.filter(v=>v==null).length;
  return `<section class="sec" id="sec-partes-com"><div class="sec-h"><h2>Partes <span class="h-n">${P.length}</span></h2>${o?`<span class="faint" style="font-size:12px">oferta de ${fd(o.data)}</span>`:''}</div><div class="sec-b">
    ${o?'':`<div class="muted" style="margin-bottom:10px">Registre a oferta para informar o valor pedido de cada parte. <button class="btn sm" data-a="nova-oferta">${ic('add',16)}Registrar oferta</button></div>`}
    <div class="ptcom"><div class="ptcom-r ptcom-th"><span>Parte e lotes</span><span>Área adotada</span><span>Zoneamento</span><span>Valor pedido</span><span>Valor por m²</span><span>Condição de pagamento</span></div>${linhas}
    ${P.length>1?`<div class="ptcom-r ptcom-tot"><div class="ptcom-p"><b>Total</b></div><div class="ptcom-c">${L('Área adotada')}<span>${aT?m2(aT):'—'}</span></div><div class="ptcom-c"></div><div class="ptcom-c">${L('Valor pedido')}<span>${vT!=null?brl(vT)+(falta?` <span class="faint">(faltam ${falta})</span>`:''):'—'}</span></div><div class="ptcom-c">${L('Valor por m²')}<span>${vT!=null&&aCom?brl(vT/aCom):'—'}</span></div><div class="ptcom-c"></div></div>`:''}</div>
    <div class="hint">Digite o total ou o valor por m²: o outro se calcula pela área adotada dos lotes da parte. Área e zoneamento vêm da aba Terreno. As propostas da BKM ficam no quadro Propostas.</div></div></section>`}

/* ---------- eventos ---------- */
function ltRender(t){lotesNorm(t);save();render()}
document.addEventListener('input',e=>{const el=e.target;if(el.dataset?.doc){const n=ptDocFmt(el.value);if(n!==el.value)el.value=n}},true);
document.addEventListener('change',e=>{const el=e.target.closest('[data-ch]');if(!el||UI.route!=='terreno')return;const ch=el.dataset.ch,t=T(UI.id);if(!t||!['pt2','pt2-n','lt','ptc'].includes(ch))return;
  if(ch==='pt2-n'){ptQtd(t,parseInt(el.value,10));return}
  if(ch==='pt2'){const pa=parteDe(t,el.dataset.p),k=el.dataset.k;if(!pa)return;let v;
    try{v=k==='nome'?el.value.trim():ptValida(k,el.value)}catch(err){toast(err.message,true);el.focus();return}
    if(k==='nome'){if(!v){toast('A parte precisa de um título.',true);el.value=pa.nome;return}if(partesAtivas(t).some(x=>x!==pa&&x.nome.trim().toLowerCase()===v.toLowerCase())){toast('Já existe uma parte com este título.',true);el.value=pa.nome;return}}
    if((pa[k]||null)===v)return;pa[k]=v;ltRender(t);return}
  if(ch==='lt'){const l=ltDe(t,el.dataset.l),k=el.dataset.k;if(!l)return;let v=el.value;
    if(k==='titulo'){v=v.trim();if(!v||t.lotes.some(x=>x!==l&&x.titulo.trim().toLowerCase()===v.toLowerCase())){toast(v?'Já existe um lote com este título.':'O lote precisa de um título.',true);el.value=l.titulo;return}}
    if(k==='num'){v=v.trim();const o=v&&t.lotes.find(x=>x!==l&&digits(x.num)===digits(v)&&criIgual(x.cri,l.cri));if(o){toast(`A matrícula ${v} já está no ${o.titulo}.`,true);el.value=l.num;return}
      const ou=v&&dupOutroTerreno(t,{num:v,cri:l.cri});if(ou){el.value=l.num;ltDupAbrir(ou,`A matrícula ${v}`);return}}
    if(k==='area'||k==='areaInf')v=lerNum(v);
    if(k==='cri'){l.criDig=!!v&&v!==t.cri}
    if(k==='fonte'&&v==='informada'&&l.areaInf==null)l.areaInf=ltInfo(t,l).adot;
    l[k]=v;ltRender(t);return}
  if(ch==='ptc'){const o=ofertaRef(t),pa=parteDe(t,el.dataset.p),k=el.dataset.k,um=partesAtivas(t).length===1;if(!o||!pa)return;
    if(k==='forma'){if(um)o.forma=el.value||null;else{o.partesForma=o.partesForma||{};o.partesForma[pa.id]=el.value||null;o.partes=o.partes||{};if(!(pa.id in o.partes))o.partes[pa.id]=null}save();render();return}
    const a=ptArea(t,pa);let v=lerNum(el.value);if(k==='m2')v=v!=null&&a?Math.round(v*a):null;
    if(um)o.valor=v;else{o.partes=o.partes||{};o.partes[pa.id]=v;const vs=partesAtivas(t).map(x=>o.partes[x.id]).filter(x=>x!=null);if(vs.length)o.valor=vs.reduce((s,x)=>s+x,0)}
    save();render();return}});
function ptQtd(t,n){const P=partesAtivas(t);n=Math.max(1,Math.min(30,n||1));
  while(partesAtivas(t).length<n)ptNova(t);
  if(n<P.length){const sai=partesAtivas(t).slice(n).reverse();for(const pa of sai){if(!ptVazia(t,pa)){toast(`${pa.nome} já tem dados ou lotes: use Excluir parte.`,true);break}t.partes.splice(t.partes.indexOf(pa),1)}}
  if(t.neg&&typeof abrirPartes==='function')abrirPartes(t);ltRender(t)}
function ptNova(t){let n=partesAtivas(t).length+1;while(partesAtivas(t).some(p=>p.nome.trim().toLowerCase()==='vendedor '+n))n++;
  const pa={id:uid(),ativa:true,neg:null,propostas:[],nome:'Vendedor '+n,essencial:true,area:null};partesDe(t).push(pa);return pa}
document.addEventListener('click',e=>{const a=e.target.closest('[data-a]');if(!a||UI.route!=='terreno')return;const A=a.dataset.a;if(!['pt2-mais','pt2-menos','pt2-excluir','lt-novo','lt-excluir','lt-sql-tira'].includes(A))return;
  const t=T(UI.id);if(!t||UI.role==='Leitura')return;
  if(A==='pt2-mais'){const pa=ptNova(t);if(t.neg&&typeof abrirPartes==='function')abrirPartes(t);ltRender(t);setTimeout(()=>document.querySelector(`#pt2-${pa.id} [data-k=pessoa]`)?.focus(),30);return}
  if(A==='pt2-menos'){ptQtd(t,partesAtivas(t).length-1);return}
  if(A==='pt2-excluir'){const pa=parteDe(t,a.dataset.p);if(!pa)return;
    if(partesAtivas(t).length<2){toast('O terreno precisa de pelo menos uma parte.',true);return}
    if(ltDaParte(t,pa).length){toast(`${pa.nome} tem lotes: passe os lotes para outra parte antes.`,true);return}
    if(pa.neg||(pa.propostas||[]).length||t.pessoas.some(p=>p.parte===pa.id)||t.ofertas.some(o=>o.partes&&pa.id in o.partes&&o.partes[pa.id]!=null)){partesClick('pt-remover',a,t);return}
    t.partes.splice(t.partes.indexOf(pa),1);t.corretores.forEach(x=>{if(x.partes)x.partes=x.partes.filter(id=>id!==pa.id)});log(t,`Parte excluída: ${pa.nome}`);ltRender(t);toast(`${pa.nome} excluída.`);return}
  if(A==='lt-novo'){const l=ltNovo(t,partesAtivas(t)[0].id);t.lotes.push(l);ltRender(t);setTimeout(()=>document.querySelector(`#lt-${l.id} [data-k=num]`)?.focus(),30);return}
  if(A==='lt-excluir'){const l=ltDe(t,a.dataset.l);if(!l)return;
    const sos=l.ins.filter(id=>!t.lotes.some(x=>x!==l&&x.ins.includes(id)));t.lotes.splice(t.lotes.indexOf(l),1);t.mats=t.mats.filter(m=>m.lote!==l.id);
    t.insc.forEach(i=>{if(sos.includes(i.id)&&i.origem==='mapa_prefeitura')i.solto=true});
    t.insc=t.insc.filter(i=>!sos.includes(i.id)||i.valores.length||i.solto);log(t,`Lote excluído: ${l.titulo}${l.num?` (matrícula ${l.num})`:''}`);ltRender(t);toast(`${l.titulo} excluído.`);return}
  if(A==='lt-sql-tira'){const l=ltDe(t,a.dataset.l),id=a.dataset.i;if(!l)return;l.ins=l.ins.filter(x=>x!==id);
    const ins=t.insc.find(i=>i.id===id);if(ins&&!t.lotes.some(x=>x.ins.includes(id))&&ins.origem==='mapa_prefeitura'){ins.solto=true;toast(`${ins.sql} voltou para os SQLs sem lote.`)}
    else if(ins&&!t.lotes.some(x=>x.ins.includes(id))&&!ins.valores.length)t.insc.splice(t.insc.indexOf(ins),1);
    else if(ins&&!t.lotes.some(x=>x.ins.includes(id)))l.ins.push(id),toast('O SQL tem IPTU lançado: fica no lote.',true);ltRender(t)}});
document.addEventListener('submit',e=>{const f=e.target;if(f.dataset.form!=='lt-sql')return;e.preventDefault();const t=T(UI.id),l=t&&ltDe(t,f.dataset.l);if(!l)return;
  const F=Object.fromEntries(new FormData(f)),c=CIDADES_INSC[F.mun]||CIDADES_INSC.sp;
  if(F.solto){const i=t.insc.find(x=>x.id===F.solto);if(!i)return;l.ins.push(i.id);delete i.solto;log(t,`${c.rotulo} ${i.sql} (do mapa da prefeitura) posto no ${l.titulo}`);ltRender(t);toast(`${c.rotulo} ${i.sql} no ${l.titulo}.`);return}
  if(!digits(F.sql)){toast(`Escolha um ${c.rotulo} da lista ou digite um novo.`,true);return}
  if(c.mascara&&digits(F.sql).length!==digitosMasc(c.mascara)){toast(`${c.rotulo} incompleto: são ${digitosMasc(c.mascara)} dígitos.`,true);return}
  const ja=t.insc.find(x=>insCid(x)===F.mun&&digits(x.sql)===digits(F.sql)&&(c.mascara||x.sql===F.sql));
  if(!ja){const ou=dupOutroTerreno(t,{sql:F.sql,mun:F.mun});if(ou){ltDupAbrir(ou,`O ${c.rotulo} ${F.sql}`);return}}
  if(ja){if(l.ins.includes(ja.id)){toast('Este SQL já está no lote.',true);return}const out=t.lotes.filter(x=>x.ins.includes(ja.id));l.ins.push(ja.id);
    log(t,`${c.rotulo} ${ja.sql} também no ${l.titulo}`);ltRender(t);toast(`${c.rotulo} ${ja.sql} também está no ${out.map(x=>x.titulo).join(', ')}: a divergência de área passa a ser do grupo.`);return}
  const ins={id:uid(),mun:F.mun,sql:F.sql,area:lerNum(F.area),valores:[]};t.insc.push(ins);l.ins.push(ins.id);
  log(t,`${c.rotulo} ${F.sql} (${c.cidade}) adicionada ao ${l.titulo}`);ltRender(t);if(loteBuscavel(ins))loteBuscar(t,t.insc.indexOf(ins))});

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
