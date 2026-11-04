/* =====================================================================
   Tarefas pelo funil (bloco 4; OBS 3 do modelo de quadros): vista Funil
   da página Tarefas, só de leitura (nada se arrasta: mover cartão nunca
   move o terreno). Espelha app.v_tarefas_funil. Uma tabela por fase
   ativa; "Ver por etapa" desce para as etapas daquela fase e depois para
   as subetapas da etapa, com trilha e seta para subir, como o quadro das
   Fases. Em cada tabela, uma linha por terreno que está ali, com as
   tarefas dele na seta da linha; o terreno em duas fases aparece nas duas.
   Valem os filtros da página.
   Modelos de cartão e tarefas concluídas ficam de fora. Injetado no mesmo escopo.
   ===================================================================== */
function tfNivel(){const z=UI.tf||(UI.tf={f:null,e:null});if(z.f&&!faseCfg(z.f))z.f=z.e=null;if(z.e&&!etapaF(z.f,z.e))z.e=null;return z}
function tfColunas(){const z=tfNivel();
  if(!z.f)return fasesL().filter(f=>f.ativo!==false).map(f=>({k:f.k,nome:f.nome,desce:etapasF(f.k).length?f.k:null,em:(t)=>!!procDaFase(t,f.k)}));
  if(!z.e)return etapasF(z.f).map(e=>({k:e.k,nome:e.nome,desce:e.subs.length?z.f+'|'+e.k:null,em:(t)=>procDaFase(t,z.f)?.etapa===e.k}));
  return (etapaF(z.f,z.e)?.subs||[]).map(s=>({k:s.k,nome:s.nome,desce:null,em:(t)=>{const p=procDaFase(t,z.f);return p?.etapa===z.e&&p.sub===s.k}}))}
function tfTrilha(){const z=tfNivel(),it=[{l:'Funil',v:''}];if(z.f)it.push({l:faseN(z.f),v:z.f});if(z.f&&z.e)it.push({l:etapaF(z.f,z.e)?.nome||z.e,v:z.f+'|'+z.e});
  const volta=it[it.length-2];
  return `<div class="tf-trilha">${volta?`<button class="iconbtn sm" data-a="tf-nivel" data-v="${esc(volta.v)}" aria-label="Voltar para ${esc(volta.l)}" title="Voltar para ${esc(volta.l)}">${ic('back',18).replace(P.back,'M15 6l-6 6 6 6')}</button>`:''}
    <ol class="drill-t" aria-label="Nível do funil">${it.map((x,i)=>i===it.length-1?`<li aria-current="page"><b>${esc(x.l)}</b></li>`:`<li><button class="linkbtn" data-a="tf-nivel" data-v="${esc(x.v)}">${esc(x.l)}</button></li>`).join('')}</ol>
    <span class="tf-leg" title="Andamento pelas tarefas. Só leitura: mover a tarefa não move o terreno.">${[['feito','Feito'],['fazendo','Fazendo'],['aguardando','Aguardando retorno'],['fazer','Fazer']].map(([c,n])=>`<span><i class="st-${c}"></i>${n}</span>`).join('')}</span></div>`}
/* formato Monday (decisão do Moisés, 30/out/2026): uma tabela por coluna do nível (fase, etapa ou subetapa), uma linha por terreno
   com a etapa ou subetapa dele, o responsável, os dias na etapa contra o SLA, abertas, atrasadas, a próxima tarefa e o andamento
   (barra pelas tarefas do terreno, na cor do status); a seta da linha abre as tarefas; o nome da tabela desce de nível */
const TF_CORES=['azul','roxo','ambar','verde'];
function tfHtml(itens){const L=itens.filter(({k})=>!k.modelo&&(UI.tk.arq||!k.feita)),cols=tfColunas(),z=tfNivel(),abre=UI.tfAbre||(UI.tfAbre={}),fech=UI.tfFech||(UI.tfFech={});
  const sub=z.e?null:z.f?'Subetapa':'Etapa';
  return `${tfTrilha()}<div class="tf2">${cols.map((c,ci)=>{const ks=L.filter(({t})=>c.em(t)).sort(ordemTk),porT=new Map();ks.forEach(x=>{if(!porT.has(x.t.id))porT.set(x.t.id,[]);porT.get(x.t.id).push(x)});
    const fk=z.f||c.k,e=z.f&&!z.e?etapaF(z.f,c.k):z.e?etapaF(z.f,z.e):null,sla=e?.sla,fe=!!fech[c.k],nT=porT.size;
    const linhas=[...porT.values()].map(g=>{const t=g[0].t,p=procDaFase(t,fk),todas=vzTarefas(t).filter(k=>!k.arq&&!k.modelo),fe2=todas.filter(k=>k.feita).length,pct=todas.length?Math.round(100*fe2/todas.length):0;
      const ab=g.filter(({k})=>!k.feita),at=ab.filter(({k})=>tkAtras(k)).length,prox=ab.slice().sort((a,b)=>String(a.k.prazo||'9').localeCompare(String(b.k.prazo||'9')))[0];
      const cont={};todas.forEach(k=>{const s=k.feita?'feito':tkStCls(tkLista(t,k));cont[s]=(cont[s]||0)+1});
      const et=p?(z.f?etapaF(fk,p.etapa)?.subs?.find(x=>x.k===p.sub)?.nome:etapaF(fk,p.etapa)?.nome):null,dias=p?.desde?diff(p.desde,HOJE):null,slaE=etapaF(fk,p?.etapa)?.sla,id=c.k+'|'+t.id,ab2=!!abre[id];
      return `<div class="tf2-r ${sub?'':'sem-sub'}" role="row"><button class="iconbtn sm" data-a="tf-linha" data-v="${esc(id)}" aria-expanded="${ab2}" aria-label="${ab2?'Fechar':'Ver'} as tarefas de ${t.codigo}">${ic(ab2?'chevD':'chev',18)}</button>
        <button class="linkbtn tf2-ter" data-a="abrir" data-id="${t.id}" data-tab="tarefas" data-from="tarefas"><b class="num">${t.codigo}</b> <span>${esc(t.nome)}</span></button>
        ${sub?`<span>${et?`<span class="tf2-chip c-${TF_CORES[ci%4]}">${esc(et)}</span>`:'—'}${p?.status==='stand_by'?' <span class="chip st-standby">Stand By</span>':''}</span>`:''}
        <span>${t.resp?av(t.resp,'sm'):'—'}</span><span class="num ${slaE&&dias>slaE?'tf2-acima':''}">${dias==null?'—':dias+(slaE?` de ${slaE}`:' d')}</span>
        <span class="num">${ab.length}</span><span>${at?`<span class="tf2-at">${at}</span>`:'<span class="faint">—</span>'}</span>
        <span class="tf2-prox">${prox?`<button class="linkbtn" data-a="tk-abrir" data-id="${t.id}" data-tk="${prox.k.id}">${escT(prox.k.titulo)}</button>${tkPrazoChip(prox.k)}`:'<span class="faint">—</span>'}</span>
        <span class="tf2-and"><span class="tf2-bar" title="${fe2} de ${todas.length} concluídas">${['feito','fazendo','aguardando','fazer','pausa'].map(s=>cont[s]?`<i class="st-${s}" style="flex:${cont[s]}"></i>`:'').join('')}</span><span class="num faint">${pct}%</span></span></div>
        ${ab2?`<div class="tf2-tks">${g.map(({k})=>`<div class="tf2-tk" data-a="tk-abrir" data-id="${t.id}" data-tk="${k.id}" role="button" tabindex="0">${tkAnel(t,k)}<span class="tl-t">${escT(k.titulo)}</span>${k.resp?`${av(k.resp,'sm')}<span class="faint">${esc(k.resp.split(' ')[0])}</span>`:'<span></span><span></span>'}${tkPrazoChip(k)}</div>`).join('')}</div>`:''}`}).join('');
    return `<section class="tf2-g"><div class="tf2-gh"><button class="iconbtn sm" data-a="tf-grupo" data-v="${esc(c.k)}" aria-expanded="${!fe}" aria-label="${fe?'Abrir':'Fechar'} ${esc(c.nome)}">${ic(fe?'chev':'chevD',18)}</button>
      <span class="tf2-chip c-${TF_CORES[ci%4]}">${esc(c.nome)}</span><span class="faint">${nT} ${nT===1?'terreno':'terrenos'}</span><span class="tkm-sp"></span>
      ${(rot=>c.desce?`<button class="tf2-desce" data-a="tf-nivel" data-v="${esc(c.desce)}" title="Ver por ${z.f?'subetapa':'etapa'}">${rot}${ic('chev',18)}</button>`:rot?`<span class="tf2-desce">${rot}</span>`:'')(z.f&&!z.e&&sla?`SLA da etapa: ${sla} dias`:c.desce?`Ver por ${z.f?'subetapa':'etapa'}`:'')}</div>
      ${fe?'':nT?`<div class="tf2-tab" role="table"><div class="tf2-r tf2-h ${sub?'':'sem-sub'}" role="row"><span></span><span>Terreno</span>${sub?`<span>${sub}</span>`:''}<span>Resp.</span><span>Dias na etapa</span><span>Abertas</span><span>Atrasadas</span><span>Próxima tarefa</span><span>Andamento</span></div>${linhas}</div>`
        :'<div class="faint tf2-vazio">Nenhum terreno com tarefas aqui.</div>'}</section>`}).join('')}</div>`}
document.addEventListener('click',e=>{const a=e.target.closest('[data-a="tf-linha"],[data-a="tf-grupo"]');if(!a)return;e.preventDefault();e.stopImmediatePropagation();
  const o=a.dataset.a==='tf-linha'?(UI.tfAbre||(UI.tfAbre={})):(UI.tfFech||(UI.tfFech={}));o[a.dataset.v]=!o[a.dataset.v];render()},true);
document.addEventListener('click',e=>{const a=e.target.closest('[data-a="tf-nivel"]');if(!a)return;e.preventDefault();e.stopImmediatePropagation();
  const [f,et]=(a.dataset.v||'').split('|');UI.tf={f:f||null,e:et||null};render()},true);
