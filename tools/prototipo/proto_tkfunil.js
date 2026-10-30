/* =====================================================================
   Tarefas pelo funil (bloco 4; OBS 3 do modelo de quadros): vista Funil
   da página Tarefas, só de leitura (nada se arrasta: mover cartão nunca
   move o terreno). Espelha app.v_tarefas_funil. Colunas pelas fases
   ativas; o nome da coluna desce para as etapas daquela fase e depois para
   as subetapas da etapa, com trilha e seta para subir, como o quadro das
   Fases. Em cada coluna, as tarefas agrupadas pelo terreno que está ali;
   o terreno em duas fases aparece nas duas. Valem os filtros da página.
   Modelos de cartão e tarefas concluídas ficam de fora. Injetado no mesmo escopo.
   ===================================================================== */
function tfNivel(){const z=UI.tf||(UI.tf={f:null,e:null});if(z.f&&!faseCfg(z.f))z.f=z.e=null;if(z.e&&!etapaF(z.f,z.e))z.e=null;return z}
function tfColunas(){const z=tfNivel();
  if(!z.f)return fasesL().filter(f=>f.ativo!==false).map(f=>({k:f.k,nome:f.nome,desce:etapasF(f.k).length?f.k:null,em:(t)=>!!procDaFase(t,f.k)}));
  if(!z.e)return etapasF(z.f).map(e=>({k:e.k,nome:e.nome,desce:e.subs.length?z.f+'|'+e.k:null,em:(t)=>procDaFase(t,z.f)?.etapa===e.k}));
  return (etapaF(z.f,z.e)?.subs||[]).map(s=>({k:s.k,nome:s.nome,desce:null,em:(t)=>{const p=procDaFase(t,z.f);return p?.etapa===z.e&&p.sub===s.k}}))}
function tfTrilha(){const z=tfNivel(),it=[{l:'Fases',v:''}];if(z.f)it.push({l:faseN(z.f),v:z.f});if(z.f&&z.e)it.push({l:etapaF(z.f,z.e)?.nome||z.e,v:z.f+'|'+z.e});
  const volta=it[it.length-2];
  return `<div class="tf-trilha">${volta?`<button class="iconbtn sm" data-a="tf-nivel" data-v="${esc(volta.v)}" aria-label="Voltar para ${esc(volta.l)}" title="Voltar para ${esc(volta.l)}">${ic('back',18)}</button>`:''}
    <ol class="drill-t" aria-label="Nível do funil">${it.map((x,i)=>i===it.length-1?`<li aria-current="page"><b>${esc(x.l)}</b></li>`:`<li><button class="linkbtn" data-a="tf-nivel" data-v="${esc(x.v)}">${esc(x.l)}</button></li>`).join('')}</ol>
    <span class="faint tf-dica">${ic('lock',14)} Só leitura: mover a tarefa não move o terreno.</span></div>`}
function tfHtml(itens){const L=itens.filter(({k})=>!k.modelo&&(UI.tk.arq||!k.feita)),cols=tfColunas();
  return `${tfTrilha()}<div class="tkb tk-board tf-board">${cols.map(c=>{const ks=L.filter(({t})=>c.em(t)).sort(ordemTk),porT=new Map();ks.forEach(x=>{if(!porT.has(x.t.id))porT.set(x.t.id,[]);porT.get(x.t.id).push(x)});
    return `<section class="tk-col tf-col" aria-label="${esc(c.nome)}"><div class="tkl-h">${c.desce?`<button class="col-ab" data-a="tf-nivel" data-v="${esc(c.desce)}" title="Ver por ${tfNivel().f?'subetapa':'etapa'}"><span>${esc(c.nome)}</span>${ic('chev',16)}</button>`:`<span>${esc(c.nome)}</span>`}<span class="n">${ks.length}</span></div>
      <div class="tk-lista">${[...porT.values()].map(g=>{const t=g[0].t,p=procDaFase(t,tfNivel().f||c.k);
        return `<div class="tf-ter"><button class="tf-th" data-a="abrir" data-id="${t.id}" data-tab="tarefas" data-from="tarefas"><span class="num">${t.codigo}</span> ${esc(t.nome)}${p?.status==='stand_by'?' <span class="chip st-standby">Stand By</span>':''}</button>
          ${g.map(x=>cardTk(x,false).replace('draggable="true"','draggable="false"')).join('')}</div>`}).join('')||'<div class="tf-vazio faint">Sem tarefas</div>'}</div></section>`}).join('')}</div>`}
document.addEventListener('click',e=>{const a=e.target.closest('[data-a="tf-nivel"]');if(!a)return;e.preventDefault();e.stopImmediatePropagation();
  const [f,et]=(a.dataset.v||'').split('|');UI.tf={f:f||null,e:et||null};render()},true);
