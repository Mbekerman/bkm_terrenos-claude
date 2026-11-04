/* =====================================================================
   "Grava em" em três níveis (pedido do Moisés, 3/nov/2026): Sistema,
   Tabela e Campo, no formulário do cartão e na Jornada.
   - Sistema: BKM Terrenos, já escolhido e travado (preparado para quando o
     módulo de tarefas servir outros sistemas da empresa, com outros bancos).
   - Tabela: Terreno, Negociação, Oferta de referência, Proposta vigente,
     Calculados e, no cartão, Tarefa (campos personalizados e "Só no cartão").
     "Todas as tabelas" é o padrão.
   - Campo: busca direto, em todas as tabelas quando a Tabela está em
     "Todas"; escolher o campo preenche a Tabela sozinha.
   Cada uso registra um espaço (ns) com o estado, a lista e o que fazer ao
   escolher. A lista abre e filtra sem redesenhar a janela.
   Injetado no mesmo escopo do protótipo, depois de proto_itens.js.
   ===================================================================== */
const GV_SIS='BKM Terrenos';
const GV_TAB={terreno:'Terreno',negociacao:'Negociação',oferta:'Oferta de referência',proposta:'Proposta vigente',calculado:'Calculados',tarefa:'Tarefa'};
const gvTabDe=origem=>origem==='personalizado'?'terreno':origem;
const gvNorm=x=>String(x||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
const GV_NS={};
/* ns: {E:()=>estado, itens:()=>[{v,tab,titulo,meta,sempre}], valor:()=>v escolhido, escolher:v=>..., tabela:tab=>... (tirar o campo que não é da tabela)} */
function gvReg(ns,o){GV_NS[ns]=o}
const gvItem=(ns,v)=>v?GV_NS[ns].itens().find(x=>x.v===v):null;
function gvTab(ns){const o=GV_NS[ns],E=o.E();if(E.gvTab!==undefined)return E.gvTab;return gvItem(ns,o.valor())?.tab||''}
function gvHtml(ns,id){const o=GV_NS[ns],it=o.itens(),tab=gvTab(ns),sel=gvItem(ns,o.valor());
  const tabs=Object.keys(GV_TAB).filter(k=>it.some(x=>x.tab===k));
  return `<div class="gv" data-gvns="${ns}">
    <div class="gv-f gv-fs"><label for="${id}-s">Sistema</label><span class="gv-sis" title="Por ora, só o BKM Terrenos"><select id="${id}-s" disabled aria-describedby="${id}-sd"><option>${GV_SIS}</option></select>${ic('lock',16)}</span><span id="${id}-sd" class="sr-only">Por ora, só o BKM Terrenos</span></div>
    <div class="gv-f gv-ft"><label for="${id}-t">Tabela</label><select id="${id}-t" data-gvt="${ns}"><option value="">Todas as tabelas</option>${tabs.map(k=>`<option value="${k}" ${k===tab?'selected':''}>${GV_TAB[k]}</option>`).join('')}</select></div>
    <div class="gv-f gv-fc"><label for="${id}">Campo</label><span class="gv-cw"><input id="${id}" data-gvq="${ns}" role="combobox" aria-expanded="false" aria-autocomplete="list" aria-controls="${id}-l" autocomplete="off" value="${esc(sel?.titulo||'')}" placeholder="Buscar campo${tab?' em '+esc(GV_TAB[tab]):' em todas as tabelas'}">${ic('search',18)}</span><div class="gv-pop" id="${id}-l" role="listbox" aria-label="Campos" hidden></div></div></div>`}
/* lista filtrada pela tabela e pelo texto, agrupada por tabela */
function gvLista(ns,q){const o=GV_NS[ns],tab=gvTab(ns),n=gvNorm(q).trim();
  const L=o.itens().filter(x=>(!tab||x.tab===tab)&&(x.sempre||!n||gvNorm(x.titulo).includes(n)||gvNorm(GV_TAB[x.tab]).includes(n)));
  const ord=Object.keys(GV_TAB);L.sort((a,b)=>ord.indexOf(a.tab)-ord.indexOf(b.tab)||(a.sempre?1:0)-(b.sempre?1:0)||(n?(gvNorm(a.titulo).startsWith(n)?0:1)-(gvNorm(b.titulo).startsWith(n)?0:1):0));return L}
function gvPinta(inp){const ns=inp.dataset.gvq,pop=inp.closest('.gv-fc').querySelector('.gv-pop'),L=gvLista(ns,inp.value===inp.dataset.gvsel?'':inp.value),v=GV_NS[ns].valor();
  let g='';pop.innerHTML=L.length?L.map((x,j)=>{const h=x.tab!==g?`<div class="it-popg" role="presentation">${GV_TAB[x.tab]}</div>`:'';g=x.tab;
    return `${h}<button type="button" class="it-popi gv-op ${j===0?'on':''}" role="option" id="${inp.id}-o${j}" aria-selected="${x.v===v}" data-gvv="${esc(x.v)}" tabindex="-1"><span>${esc(x.titulo)}</span><span class="faint">${x.meta||''}</span></button>`}).join('')
    :`<div class="gv-vz faint">Nenhum campo com "${esc(inp.value)}"${gvTab(ns)?` em ${GV_TAB[gvTab(ns)]}. <button type="button" class="linkbtn" data-gvtodas="${ns}">Buscar em todas as tabelas</button>`:''}</div>`;
  pop.hidden=false;inp.setAttribute('aria-expanded','true');gvAtivo(inp,0)}
function gvAtivo(inp,j){const ops=[...inp.closest('.gv-fc').querySelectorAll('.gv-op')];ops.forEach((x,i)=>x.classList.toggle('on',i===j));
  if(ops[j]){inp.setAttribute('aria-activedescendant',ops[j].id);ops[j].scrollIntoView({block:'nearest'})}else inp.removeAttribute('aria-activedescendant')}
function gvFecha(inp){const pop=inp.closest('.gv-fc')?.querySelector('.gv-pop');if(pop){pop.hidden=true;pop.innerHTML=''}inp.setAttribute('aria-expanded','false');
  const s=gvItem(inp.dataset.gvq,GV_NS[inp.dataset.gvq].valor());inp.value=s?.titulo||''}
function gvEscolhe(ns,v){const o=GV_NS[ns],x=gvItem(ns,v);if(!x)return;o.E().gvTab=x.tab;o.escolher(v)}
window.addEventListener('focusin',e=>{const inp=e.target.closest?.('[data-gvq]');if(!inp)return;inp.dataset.gvsel=inp.value;inp.select();gvPinta(inp)},true);
window.addEventListener('focusout',e=>{const inp=e.target.closest?.('[data-gvq]');if(!inp)return;if(e.relatedTarget&&inp.closest('.gv-fc').contains(e.relatedTarget))return;gvFecha(inp)},true);
window.addEventListener('input',e=>{const inp=e.target.closest?.('[data-gvq]');if(!inp)return;e.stopImmediatePropagation();delete inp.dataset.gvsel;gvPinta(inp)},true);
window.addEventListener('keydown',e=>{const inp=e.target.closest?.('[data-gvq]');if(!inp)return;const ops=[...inp.closest('.gv-fc').querySelectorAll('.gv-op')],j=ops.findIndex(x=>x.classList.contains('on'));
  if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();e.stopImmediatePropagation();if(inp.closest('.gv-fc').querySelector('.gv-pop').hidden){gvPinta(inp);return}gvAtivo(inp,Math.max(0,Math.min(ops.length-1,j+(e.key==='ArrowDown'?1:-1))));return}
  if(e.key==='Enter'){e.preventDefault();e.stopImmediatePropagation();const op=ops[j<0?0:j];if(op){const ns=inp.dataset.gvq;gvFecha(inp);gvEscolhe(ns,op.dataset.gvv)}return}
  if(e.key==='Escape'&&!inp.closest('.gv-fc').querySelector('.gv-pop').hidden){e.preventDefault();e.stopImmediatePropagation();gvFecha(inp)}},true);
/* a lista não tira o foco do campo (Safari não foca botão no clique) */
window.addEventListener('mousedown',e=>{if(e.target.closest?.('.gv-pop'))e.preventDefault()},true);
window.addEventListener('click',e=>{const op=e.target.closest?.('[data-gvv]');const td=e.target.closest?.('[data-gvtodas]');
  if(td){e.preventDefault();e.stopImmediatePropagation();const ns=td.dataset.gvtodas,inp=td.closest('.gv').querySelector('[data-gvq]'),q=inp.value;GV_NS[ns].E().gvTab='';const s=td.closest('.gv').querySelector('[data-gvt]');if(s)s.value='';inp.placeholder='Buscar campo em todas as tabelas';inp.value=q;gvPinta(inp);return}
  const qi=e.target.closest?.('[data-gvq]');if(qi&&qi.closest('.gv-fc').querySelector('.gv-pop').hidden){qi.dataset.gvsel=qi.value;gvPinta(qi);return}
  if(!op)return;e.preventDefault();e.stopImmediatePropagation();const inp=op.closest('.gv').querySelector('[data-gvq]'),ns=inp.dataset.gvq;gvFecha(inp);gvEscolhe(ns,op.dataset.gvv)},true);
window.addEventListener('change',e=>{const s=e.target.closest?.('[data-gvt]');if(!s)return;e.stopImmediatePropagation();const ns=s.dataset.gvt,o=GV_NS[ns],E=o.E();E.gvTab=s.value;
  const x=gvItem(ns,o.valor());o.tabela(s.value,!!(x&&s.value&&x.tab!==s.value));setTimeout(()=>document.querySelector(`[data-gvq="${ns}"]`)?.focus(),0)},true);
