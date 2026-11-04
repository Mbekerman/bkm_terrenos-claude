/* =====================================================================
   Vistas Lista e Calendário da página Tarefas e da seção Tarefas da ficha
   (decisões do Moisés, 30/out/2026, sobre a simulação no estilo do ClickUp
   com o visual Google).
   - Lista (/tarefas/lista): grupos que abrem e fecham, por status (a lista
     do quadro), terreno ou responsável; a subtarefa vem recuada embaixo da
     tarefa mãe; o círculo conclui; a linha abre o cartão.
   - Calendário (/tarefas/calendario): o mês no desenho do Google Agenda,
     cada tarefa no dia do prazo, na cor do status (vermelha quando
     atrasada); arrastar para outro dia muda o prazo (o cronograma refaz as
     sucessoras); "Sem prazo" ao lado, de onde se arrasta para um dia.
   Valem os filtros da página. Injetado no mesmo escopo.
   ===================================================================== */
P.cal='M4 6h16v14H4zM4 10h16M8 3v4M16 3v4';P.subt='M7 5v8a3 3 0 0 0 3 3h9M15 12l4 4-4 4';
UI.tl=Object.assign({agr:'status',fech:{}},UI.tl||{});
UI.tc=UI.tc||{};
/* o calendário começa na semana de hoje (simulação G_Calendario aprovada): Mês mostra 5 semanas, Semana uma; as setas andam 4 semanas ou 1 */
const tcDom=d=>addD(d,-pd(d).getDay());
const tkAnel=(t,k)=>{const c=tkStCls(tkLista(t,k)),pode=vzEdita(t,k)&&!k.arq&&!k.modelo;
  return pode?`<button class="tk-anel st-${c}" data-a="tl-feito" data-id="${t.id}" data-tk="${k.id}" aria-label="${k.feita?'Reabrir':'Concluir'} ${escT(k.titulo)}" title="${esc(tkLista(t,k).nome)} · ${k.feita?'reabrir':'concluir'}">${k.feita?ic('check',12):''}</button>`
    :`<span class="tk-anel st-${c}" title="${esc(tkLista(t,k).nome)}">${k.feita?ic('check',12):''}</span>`};
const tkPrazoChip=k=>k.prazo?`<span class="tl-pz ${k.feita?'ok':tkAtras(k)?'atras':''}">${ic(k.feita?'check':'clock',14)}${fd(k.prazo)}</span>`:'<span class="faint">—</span>';
const tkPrioChip=k=>`<span class="tl-pr ${k.prio}">${OPT.prioTar[k.prio]||'—'}</span>`;

/* ---------- Lista ---------- */
function tlGrupos(itens,ficha){const g=new Map(),add=(key,nome,cls,x)=>{if(!g.has(key))g.set(key,{key,nome,cls,itens:[]});g.get(key).itens.push(x)};
  const agr=ficha?(UI.tl.agrF||'status'):UI.tl.agr;
  itens.forEach(x=>{const {t,k}=x;
    if(agr==='terreno')add('t:'+t.id,`${t.codigo} · ${t.nome}`,'',x);
    else if(agr==='resp')add('r:'+(k.resp||''),k.resp||'Sem responsável','',x);
    else if(agr==='etapa')add('e:'+(k.etapa?k.fase+'|'+k.etapa:''),k.etapa?`${faseN(k.fase)} › ${etNomeE(k.fase,k.etapa)}`:'Sem etapa','',x);
    else{const l=tkLista(t,k),c=tkStCls(l);add('s:'+(ficha?l.id:l.nome),l.nome,c,x)}});
  const ordemSt=['fazendo','aguardando','fazer','pausa','feito'];
  const ordemE=x=>{if(x.key==='e:')return 9e9;const [f,e]=x.key.slice(2).split('|');return fIdx(f)*1000+etIx(f,e)};
  return [...g.values()].sort((a,b)=>agr==='status'?(ordemSt.indexOf(a.cls)-ordemSt.indexOf(b.cls))||(a.nome==='Backlog')-(b.nome==='Backlog'):agr==='etapa'?ordemE(a)-ordemE(b):a.nome.localeCompare(b.nome))}
function tlLinha({k,t},geral,sub){const ets=(k.etq||[]).map(id=>S.etiquetas.find(e=>e.id===id)).filter(Boolean),ns=tkSubs(t,k),nf=ns.filter(x=>x.feita).length;
  return `<div class="tl-r ${sub?'sub':''} ${k.feita?'feito':''}" data-a="tk-abrir" data-id="${t.id}" data-tk="${k.id}" data-mid="${k.id}" tabindex="0" role="button" aria-label="${escT(k.titulo)}">
    <span class="tl-c tl-tit">${tkAnel(t,k)}<span class="tl-t">${escT(k.titulo)}</span>${ns.length?`<span class="tl-ns faint" title="Subtarefas concluídas">${ic('subt',14)}${nf}/${ns.length}</span>`:''}${vzSelo(k)}</span>
    ${geral?`<span class="tl-c tl-ter faint"><span class="num">${t.codigo}</span> · ${esc(t.nome)}</span>`:''}
    <span class="tl-c tl-resp">${k.resp?`${av(k.resp,'sm')}<span>${esc(k.resp.split(' ')[0])}</span>`:'<span class="faint">—</span>'}</span>
    <span class="tl-c">${tkPrazoChip(k)}</span><span class="tl-c">${tkPrioChip(k)}</span>
    <span class="tl-c tl-etq">${ets.slice(0,2).map(e=>etqChip(e)).join('')}${ets.length>2?`<span class="faint">+${ets.length-2}</span>`:''}</span></div>`}
function tkListaHtml(itens,ficha){const tid=ficha?ficha.id:null,ids=new Set(itens.map(x=>x.k.id));
  /* a subtarefa vai embaixo da mãe quando a mãe está na lista; senão, aparece sozinha */
  const topo=itens.filter(({k})=>!k.mae||!ids.has(k.mae)),filhas=id=>itens.filter(x=>x.k.mae===id).sort(ordemTk);
  const G=tlGrupos(topo,!!ficha),geral=!ficha;
  if(!G.length)return '<p class="faint" style="padding:16px 0">Nenhuma tarefa com esses filtros.</p>';
  return `<div class="tl ${geral?'':'ficha'}">${G.map(g=>{const fe=!!UI.tl.fech[g.key],n=g.itens.length;
    const cab=`<div class="tl-gh"><button class="iconbtn sm" data-a="tl-grupo" data-v="${esc(g.key)}" aria-expanded="${!fe}" aria-label="${fe?'Abrir':'Fechar'} ${esc(g.nome)}">${ic(fe?'chev':'chevD',18)}</button>
      ${g.cls?`<span class="tl-st st-${g.cls}">${esc(g.nome)}</span>`:`<b class="tl-gn">${esc(g.nome)}</b>`}<span class="faint">${n}</span>
      ${tkEd()&&(ficha?(UI.tl.agrF||'status'):UI.tl.agr)==='status'&&g.cls!=='feito'&&g.cls!=='pausa'?`<button class="tkm-add tl-add" data-a="tk-nova" data-v="${esc(g.nome)}"${tid?` data-id="${tid}"`:''} aria-label="Adicionar tarefa em ${esc(g.nome)}">${ic('add',16)}Adicionar tarefa</button>`:''}</div>`;
    return `<section class="tl-g">${cab}${fe?'':`<div class="tl-tab" role="table"><div class="tl-r tl-h" role="row"><span class="tl-c">Tarefa</span>${geral?'<span class="tl-c">Terreno</span>':''}<span class="tl-c">Responsável</span><span class="tl-c">Prazo</span><span class="tl-c">Prioridade</span><span class="tl-c">Etiquetas</span></div>
      ${g.itens.sort(ordemTk).map(x=>tlLinha(x,geral,false)+filhas(x.k.id).map(y=>tlLinha(y,geral,true)).join('')).join('')}</div>`}</section>`}).join('')}</div>`}
const tlAgrHtml=()=>`<label class="sr-only" for="tl-agr">Agrupar</label><select id="tl-agr" class="fsel-chip on" data-tl="agr">${[['status','Agrupar: Status'],['terreno','Agrupar: Terreno'],['resp','Agrupar: Responsável'],['etapa','Agrupar: Etapa']].map(([v,n])=>`<option value="${v}" ${UI.tl.agr===v?'selected':''}>${n}</option>`).join('')}</select>`;

/* ---------- Calendário ---------- */
const DIAS_SEM=['dom','seg','ter','qua','qui','sex','sáb'];
const MES_LONGO=['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
function tkCalHtml(itens,ficha){const modo=UI.tc.modo==='semana'?'semana':'mes',ini=UI.tc.ini||tcDom(HOJE),dias=Array.from({length:modo==='semana'?7:35},(_,i)=>addD(ini,i));
  const L=itens.filter(({k})=>!k.modelo),porDia=new Map();L.filter(({k})=>k.prazo).forEach(x=>{if(!porDia.has(x.k.prazo))porDia.set(x.k.prazo,[]);porDia.get(x.k.prazo).push(x)});
  const sem=L.filter(({k})=>!k.prazo&&!k.feita),MAX=modo==='semana'?99:3,sel=UI.tc.sel||HOJE,doSel=(porDia.get(sel)||[]).slice().sort(ordemTk);
  const ev=({k,t})=>{const c=k.feita?'feito':tkAtras(k)?'atras':tkStCls(tkLista(t,k)),arr=vzEdita(t,k)&&!k.arq;
    return `<button class="tc-ev st-${c} ${k.feita?'feito':''}" data-a="tk-abrir" data-id="${t.id}" data-tk="${k.id}" ${arr?`draggable="true" data-tcarr="${t.id}|${k.id}"`:''} title="${esc(t.codigo+' · '+k.titulo)}">${ficha?'':`<span class="num">${t.codigo.replace(/^TER-0*/,'')}</span> · `}${escT(k.titulo)}</button>`};
  const a0=pd(dias[0]),a1=pd(dias.at(-1)),tit=a0.getMonth()===a1.getMonth()?`${MES_LONGO[a0.getMonth()]} de ${a0.getFullYear()}`:a0.getFullYear()===a1.getFullYear()?`${MES_LONGO[a0.getMonth()]} – ${MES_LONGO[a1.getMonth()]} de ${a1.getFullYear()}`:`${MES_LONGO[a0.getMonth()]} de ${a0.getFullYear()} – ${MES_LONGO[a1.getMonth()]} de ${a1.getFullYear()}`;
  const passo=modo==='semana'?'1 semana':'4 semanas';
  return `<div class="tc-bar"><button class="btn sm" data-a="tc-mes" data-v="hoje">Hoje</button><button class="iconbtn" data-a="tc-mes" data-v="-1" aria-label="Voltar ${passo}">${ic('back',20).replace(P.back,'M15 6l-6 6 6 6')}</button><button class="iconbtn" data-a="tc-mes" data-v="1" aria-label="Avançar ${passo}">${ic('chev',20)}</button>
    <h2 class="tc-tit">${tit}</h2><span class="tc-leg">${[['fazer','Fazer'],['fazendo','Fazendo'],['aguardando','Aguardando retorno'],['feito','Feito'],['atras','Atrasada']].map(([c,n])=>`<span><i class="st-${c}"></i>${n}</span>`).join('')}</span>
    <div class="seg sm tc-modo" role="group" aria-label="Período">${[['semana','Semana'],['mes','Mês']].map(([v,n])=>`<button data-a="tc-modo" data-v="${v}" aria-pressed="${modo===v}">${n}</button>`).join('')}</div></div>
  <div class="tc ${modo==='semana'?'tc-semana':''}"><div class="tc-mes" role="grid" aria-label="${tit}">${DIAS_SEM.map(d=>`<div class="tc-dh">${d}</div>`).join('')}
    ${dias.map(d=>{const x=pd(d),es=(porDia.get(d)||[]).sort((a,b)=>(a.k.feita?1:0)-(b.k.feita?1:0)||ordemTk(a,b)),abre=UI.tc.dia===d;
      return `<div class="tc-d ${d===HOJE?'hoje':''} ${d===sel?'sel':''}" data-tcdia="${d}" data-tcsel="${d}"><span class="tc-n">${x.getDate()===1?`${x.getDate()} ${MES[x.getMonth()]}`:x.getDate()}</span>
        ${(abre?es:es.slice(0,MAX)).map(ev).join('')}${es.length>MAX&&!abre?`<button class="linkbtn tc-mais" data-a="tc-dia" data-v="${d}">Mais ${es.length-MAX}</button>`:abre&&es.length>MAX?`<button class="linkbtn tc-mais" data-a="tc-dia" data-v="">Menos</button>`:''}</div>`}).join('')}</div>
    <section class="tc-dial" aria-live="polite"><h3>${fd(sel)}</h3>${doSel.map(({k,t})=>`<button class="tc-sp" data-a="tk-abrir" data-id="${t.id}" data-tk="${k.id}">${tkAnel(t,k)}<span class="${k.feita?'feito':''}">${ficha?'':`<span class="num">${t.codigo.replace(/^TER-0*/,'')}</span> · `}${escT(k.titulo)}</span></button>`).join('')||'<p class="faint">Nenhuma tarefa com prazo neste dia.</p>'}</section>
    <aside class="tc-sem" data-tcdia=""><div class="tc-semh"><h3>Sem prazo</h3><span class="tkm-n">${sem.length}</span></div>${sem.length&&tkEd()?'<p class="faint">Arraste para um dia para dar o prazo.</p>':''}
      ${sem.map(({k,t})=>`<button class="tc-sp" data-a="tk-abrir" data-id="${t.id}" data-tk="${k.id}" ${vzEdita(t,k)?`draggable="true" data-tcarr="${t.id}|${k.id}"`:''}><span class="tk-anel st-${tkStCls(tkLista(t,k))}"></span><span>${ficha?'':`<span class="num">${t.codigo.replace(/^TER-0*/,'')}</span> · `}${escT(k.titulo)}</span></button>`).join('')||'<p class="faint">Todas as tarefas abertas têm prazo.</p>'}</aside></div>`}

/* ---------- ações ---------- */
/* no celular o dia mostra só marcas; o toque escolhe o dia e a lista dele aparece embaixo */
window.addEventListener('click',e=>{const d=e.target.closest?.('[data-tcsel]');if(!d||e.target.closest('button')||!matchMedia('(max-width: 899px)').matches)return;e.stopImmediatePropagation();UI.tc.sel=d.dataset.tcsel;render()},true);
window.addEventListener('click',e=>{const a=e.target.closest?.('[data-a="tl-feito"],[data-a="tl-grupo"],[data-a="tc-mes"],[data-a="tc-dia"],[data-a="tc-modo"]');if(!a)return;e.preventDefault();e.stopImmediatePropagation();const A=a.dataset.a;
  if(A==='tl-grupo'){UI.tl.fech[a.dataset.v]=!UI.tl.fech[a.dataset.v];render();return}
  if(A==='tc-mes'){UI.tc.ini=a.dataset.v==='hoje'?tcDom(HOJE):addD(UI.tc.ini||tcDom(HOJE),+a.dataset.v*(UI.tc.modo==='semana'?7:28));UI.tc.dia=null;render();return}
  if(A==='tc-modo'){UI.tc.modo=a.dataset.v;render();return}
  if(A==='tc-dia'){UI.tc.dia=a.dataset.v||null;render();return}
  const {t,k}=tkAcha(a.dataset.id,a.dataset.tk);if(!k||!vzEdita(t,k))return;
  /* concluir pelo círculo: com aprovador, abre o cartão na aba Aprovação */
  if(!k.feita&&apPrecisa(k)){UI.tkSel={tid:t.id,kid:k.id};UI.tkAba='aprov';UI.tkPop=null;UI.modal='tarefa';renderModal();return}
  tkConcluir(t,k,!k.feita);save();render()},true);
document.addEventListener('change',e=>{const el=e.target;if(el.dataset?.tl!=='agr'&&el.dataset?.tl!=='agrF')return;e.stopImmediatePropagation();UI.tl[el.dataset.tl]=el.value;render()},true);
/* arrastar no calendário: muda o prazo (no banco, o mesmo update de prazo, com a cascata do cronograma) */
let tcArr=null;
document.addEventListener('dragstart',e=>{const c=e.target.closest?.('[data-tcarr]');if(!c)return;tcArr=c.dataset.tcarr;e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',tcArr);c.classList.add('arrastando');document.body.classList.add('dnd-tc')});
document.addEventListener('dragend',()=>{tcArr=null;document.body.classList.remove('dnd-tc');document.querySelectorAll('.tc-d.sobre,.tc-sem.sobre,.arrastando').forEach(x=>x.classList.remove('sobre','arrastando'))});
document.addEventListener('dragover',e=>{if(!tcArr)return;const d=e.target.closest?.('[data-tcdia]');document.querySelectorAll('.tc-d.sobre,.tc-sem.sobre').forEach(x=>x!==d&&x.classList.remove('sobre'));if(!d)return;e.preventDefault();d.classList.add('sobre')});
document.addEventListener('drop',e=>{if(!tcArr)return;const d=e.target.closest?.('[data-tcdia]');if(!d)return;e.preventDefault();const [tid,kid]=tcArr.split('|');tcArr=null;tcPrazo(tid,kid,d.dataset.tcdia||null)});
function tcPrazo(tid,kid,dia){const {t,k}=tkAcha(tid,kid);if(!k||!vzEdita(t,k)||(k.prazo||null)===dia)return;
  if(k.feita&&dia){toast('Tarefa concluída não muda de prazo.',true);return}
  /* com início e prazo, a tarefa anda inteira (mantém a duração), como mudar só o início no cronograma */
  const r=dia&&k.inicio&&k.prazo&&k.dur?crEditar(t,k,'inicio',addD(k.inicio,diff(k.prazo,dia))):crEditar(t,k,'prazo',dia||'');if(r===false){render();return}
  toast(dia?`${k.titulo}: prazo em ${fd(k.prazo)}.`:`${k.titulo}: sem prazo.`);save();render()}
