/* =====================================================================
   Recorrência (bloco 4; decisões do Moisés, 30/out/2026).
   Espelha fluxo.recorrencias, fluxo.proxima_ocorrencia e
   fluxo.gerar_recorrencias. O cartão de origem é o modelo e a primeira
   ocorrência; cada ocorrência nasce na data agendada, mesmo com a anterior
   aberta, copiando o cartão de origem como ele está (pessoas, etiquetas,
   prioridade, visibilidade e checklists em aberto), com início na data e
   prazo N dias depois. Campos personalizados não vão. Termina numa data,
   depois de N ocorrências (com a de origem) ou quando alguém para a série.
   Data de hoje ou que já passou não gera atrasados (segue de amanhã). Injetado no mesmo escopo.
   ===================================================================== */
P.repete='M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3';
const RC_FREQ={diaria:'Diária',semanal:'Semanal',mensal:'Mensal',anual:'Anual'};
const RC_UN={diaria:['dia','dias'],semanal:['semana','semanas'],mensal:['mês','meses'],anual:['ano','anos']};
const RC_DIAS=['D','S','T','Q','Q','S','S'],RC_DIAS_N=['domingo','segunda','terça','quarta','quinta','sexta','sábado'];
const rcDow=d=>new Date(d+'T12:00:00').getDay();
function rcAddM(d,m,dia){const x=new Date(d+'T12:00:00');x.setDate(1);x.setMonth(x.getMonth()+m);const ult=new Date(x.getFullYear(),x.getMonth()+1,0).getDate();x.setDate(Math.min(dia,ult));return x.toISOString().slice(0,10)}
/* próxima data depois de "de" (no banco: fluxo.proxima_ocorrencia) */
function rcProx(r,de){if(r.freq==='diaria')return addD(de,r.int);
  if(r.freq==='anual')return rcAddM(de,12*r.int,+de.slice(8));
  if(r.freq==='mensal')return rcAddM(de,r.int,r.diaMes||+de.slice(8));
  if(!r.dias?.length)return addD(de,7*r.int);
  const ini=addD(de,-rcDow(de));for(let i=1;i<=7*r.int+7;i++){const d=addD(de,i),sem=Math.round((new Date(addD(d,-rcDow(d))+'T12:00:00')-new Date(ini+'T12:00:00'))/864e5/7);
    if(sem%r.int===0&&r.dias.includes(rcDow(d)))return d}return null}
const rcBase=k=>k.inicio||k.prazo||HOJE;
function rcAjustar(r){if(r.ativa)while(r.prox<=HOJE)r.prox=rcProx(r,r.prox)}  // hoje ou antes: segue de amanhã, sem atrasados
function rcOrigem(t,k){return k.serie?t.tarefas.find(x=>x.id===k.serie):null}
function rcResumo(r){const un=RC_UN[r.freq][r.int>1?1:0],cada=r.int>1?`a cada ${r.int} ${un}`:{diaria:'todo dia',semanal:'toda semana',mensal:'todo mês',anual:'todo ano'}[r.freq];
  const det=r.freq==='semanal'&&r.dias?.length?`, ${r.dias.slice().sort().map(d=>RC_DIAS_N[d]).join(', ')}`:r.freq==='mensal'?`, dia ${r.diaMes}`:'';return cada+det}
/* cria as ocorrências com data até hoje (no banco: a rotina diária) */
function rcCopiar(t,k,r,data){const desloc=crDias(rcBase(k),data),l=tkL(t).find(x=>x.id===r.lista&&x.tipo==='aberta')||tkPrim(t,'aberta');
  const n=tkNorm(t,{id:uid(),titulo:k.titulo,desc:k.desc||'',resultado:'',resp:k.resp,solic:k.solic,criadoPor:k.criadoPor||k.solic,criadoEm:data,vis:k.vis||'publico',acessos:JSON.parse(JSON.stringify(k.acessos||[])),
    inicio:data,prazo:r.prazoDias!=null?addD(data,r.prazoDias):null,prio:k.prio,capa:k.capa||null,apModo:k.apModo,lista:l.id,pos:Date.now()+Math.random(),
    exec:[...(k.exec||[])],aprov:[...(k.aprov||[])],acomp:[...(k.acomp||[])],etq:[...(k.etq||[])],serie:k.id,
    checklists:(k.checklists||[]).map(c=>({id:uid(),nome:c.nome,esconder:c.esconder,itens:c.itens.filter(i=>!i.virou).map(i=>({id:uid(),texto:i.texto,resp:i.resp,prazo:i.prazo?addD(i.prazo,desloc):null,feito:null,regra:i.regra,cond:i.cond?JSON.parse(JSON.stringify(i.cond)):null}))})),itens:itCopiaItens(k)});
  if(n.prazo){n.dur=crDias(n.inicio,n.prazo)+1}t.tarefas.push(n);notifTarefa(t,n,null);log(t,`Tarefa criada pela recorrência de ${k.codigo}: ${n.titulo} (${fd(data)})`);return n}
function rcGerar(){let n=0;(S.terrenos||[]).forEach(t=>(t.tarefas||[]).forEach(k=>{const r=k.rec;if(!r?.ativa)return;
  while(r.ativa&&r.prox<=HOJE){if((r.fim&&r.prox>r.fim)||(r.max&&r.vezes>=r.max)||k.arq){r.ativa=false;break}
    rcCopiar(t,k,r,r.prox);n++;r.vezes++;r.prox=rcProx(r,r.prox);if(r.max&&r.vezes>=r.max)r.ativa=false}}));return n}

/* frente do cartão: ícone de série */
function rcSelo(k){return k.rec?.ativa||k.serie?`<span class="tk-b" title="${k.serie?'Criada por uma recorrência':'Cartão recorrente'}">${ic('repete',14)}</span>`:''}
/* janela do cartão */
function rcBlocoHtml(t,k,ro){
  if(k.serie){const o=rcOrigem(t,k);return `<div class="tkm-bloco">${tkSecH('repete','Recorrência')}<div class="tkm-in rc-in">
    <p>Criada em ${fd(k.criadoEm||k.inicio)} pela série ${o?`<button class="linkbtn" data-a="rc-origem" data-v="${o.id}">${o.codigo} · ${esc(o.titulo)}</button>`:'(cartão de origem não disponível)'}${o?.rec?`, ${esc(rcResumo(o.rec))}`:''}.</p>
    <p class="faint">A recorrência se muda no cartão de origem.</p></div></div>`}
  const r=k.rec;if(!r)return '';const d=ro?'disabled':'',un=RC_UN[r.freq];
  const abertas=tkL(t).filter(l=>l.tipo==='aberta'&&!l.oculta),fimTipo=r.fim?'data':r.max?'vezes':'nunca';
  const criadas=t.tarefas.filter(x=>x.serie===k.id).length;
  return `<div class="tkm-bloco">${tkSecH('repete','Recorrência',ro?'':`<button class="tkm-btn" data-a="rc-ativa">${r.ativa?'Parar':'Retomar'}</button>`)}<div class="tkm-in rc-in">
    <div class="rc-g">
      <div class="cpo-c"><label for="rc-freq">Repete</label><select id="rc-freq" class="tkm-pill" data-rc="freq" ${d}>${Object.entries(RC_FREQ).map(([x,n])=>`<option value="${x}" ${x===r.freq?'selected':''}>${n}</option>`).join('')}</select></div>
      <div class="cpo-c"><label for="rc-int">A cada</label><span class="rc-un"><input id="rc-int" class="tkm-pill" data-rc="int" type="number" min="1" max="99" value="${r.int}" ${d}><span>${un[r.int>1?1:0]}</span></span></div>
      ${r.freq==='mensal'?`<div class="cpo-c"><label for="rc-dm">No dia</label><input id="rc-dm" class="tkm-pill" data-rc="diaMes" type="number" min="1" max="31" value="${r.diaMes}" ${d}></div>`:''}
      <div class="cpo-c"><label for="rc-pz">Prazo</label><span class="rc-un"><input id="rc-pz" class="tkm-pill" data-rc="prazoDias" type="number" min="0" max="365" value="${r.prazoDias??''}" placeholder="Sem prazo" ${d}><span>dias depois</span></span></div>
    </div>
    ${r.freq==='semanal'?`<div class="rc-dias" role="group" aria-label="Dias da semana">${RC_DIAS.map((x,i)=>`<button class="rc-dia ${r.dias?.includes(i)?'on':''}" data-a="rc-dia" data-v="${i}" aria-pressed="${!!r.dias?.includes(i)}" aria-label="${RC_DIAS_N[i]}" title="${RC_DIAS_N[i]}" ${d}>${x}</button>`).join('')}</div>`:''}
    <div class="rc-g">
      <div class="cpo-c"><label for="rc-l">Nasce na lista</label><select id="rc-l" class="tkm-pill" data-rc="lista" ${d}>${abertas.map(l=>`<option value="${l.id}" ${l.id===r.lista?'selected':''}>${esc(l.nome)}</option>`).join('')}</select></div>
      <div class="cpo-c"><label for="rc-ft">Termina</label><select id="rc-ft" class="tkm-pill" data-rc="fimTipo" ${d}><option value="nunca" ${fimTipo==='nunca'?'selected':''}>Nunca</option><option value="data" ${fimTipo==='data'?'selected':''}>Em uma data</option><option value="vezes" ${fimTipo==='vezes'?'selected':''}>Depois de N vezes</option></select></div>
      ${fimTipo==='data'?`<div class="cpo-c"><label for="rc-fim">Até</label><input id="rc-fim" class="tkm-pill" type="date" data-rc="fim" value="${r.fim}" ${d}></div>`:''}
      ${fimTipo==='vezes'?`<div class="cpo-c"><label for="rc-max">Vezes (com esta)</label><input id="rc-max" class="tkm-pill" type="number" min="2" data-rc="max" value="${r.max}" ${d}></div>`:''}
    </div>
    <p class="rc-res">${r.ativa?`${ic('repete',14)} ${esc(rcResumo(r))}. Próxima: <b>${fd(r.prox)}</b>, mesmo que esta não esteja concluída.`:'<b>Série parada.</b>'} ${criadas?`· ${criadas} ${criadas>1?'criadas':'criada'}`:''}</p>
  </div></div>`}
function rcNova(t,k){const b=rcBase(k),l=tkLista(t,k);
  const r={freq:'semanal',int:1,dias:[rcDow(b)],diaMes:+b.slice(8),prox:null,fim:null,max:null,vezes:1,prazoDias:k.inicio&&k.prazo?crDias(k.inicio,k.prazo):null,lista:l.tipo==='aberta'?l.id:tkPrim(t,'aberta').id,ativa:true,por:me(),em:agora()};
  r.prox=rcProx(r,b);rcAjustar(r);k.rec=r;log(t,`Tarefa "${k.titulo}": recorrência ${rcResumo(r)}`)}
/* mudou a regra: recalcula a próxima a partir da última ocorrência */
function rcRecalc(t,k){const r=k.rec,ult=t.tarefas.filter(x=>x.serie===k.id).map(x=>x.inicio).filter(Boolean).sort().at(-1);r.prox=rcProx(r,ult||rcBase(k));rcAjustar(r)}

document.addEventListener('change',e=>{const el=e.target;if(!el.dataset?.rc)return;e.stopImmediatePropagation();const {t,k}=tkAtual();if(!k?.rec||!vzEdita(t,k))return;const r=k.rec,c=el.dataset.rc,v=el.value;
  if(c==='freq'){r.freq=v;if(v==='semanal'&&!r.dias?.length)r.dias=[rcDow(rcBase(k))];rcRecalc(t,k)}
  else if(c==='int'){r.int=Math.min(99,Math.max(1,parseInt(v)||1));rcRecalc(t,k)}
  else if(c==='diaMes'){r.diaMes=Math.min(31,Math.max(1,parseInt(v)||1));rcRecalc(t,k)}
  else if(c==='prazoDias')r.prazoDias=v===''?null:Math.min(365,Math.max(0,parseInt(v)||0));
  else if(c==='lista')r.lista=v;
  else if(c==='fimTipo'){r.fim=v==='data'?addD(r.prox,28):null;r.max=v==='vezes'?Math.max(r.vezes+1,4):null}
  else if(c==='fim'){if(v&&v<r.prox){toast('A série terminaria antes da próxima ocorrência.',true);el.value=r.fim;return}r.fim=v||null}
  else if(c==='max'){r.max=Math.max(2,parseInt(v)||2);if(r.vezes>=r.max)r.ativa=false}
  log(t,`Tarefa "${k.titulo}": recorrência ${r.ativa?rcResumo(r):'parada'}`);tkRe()},true);
document.addEventListener('click',e=>{const a=e.target.closest('[data-a^="rc-"]');if(!a)return;e.preventDefault();e.stopImmediatePropagation();const {t,k}=tkAtual();if(!k)return;
  if(a.dataset.a==='rc-origem'){UI.tkSel={...UI.tkSel,kid:a.dataset.v};render();return}
  if(!vzEdita(t,k))return;
  if(a.dataset.a==='rc-nova'){if(k.serie){toast('Esta tarefa é uma ocorrência: mude a recorrência no cartão de origem.',true);return}rcNova(t,k);toast(`Recorrente: a próxima nasce em ${fd(k.rec.prox)}.`)}
  else if(a.dataset.a==='rc-dia'){const r=k.rec,i=+a.dataset.v,ds=new Set(r.dias||[]);if(ds.has(i)){if(ds.size===1){toast('Marque pelo menos um dia.',true);return}ds.delete(i)}else ds.add(i);r.dias=[...ds].sort();rcRecalc(t,k)}
  else if(a.dataset.a==='rc-ativa'){const r=k.rec;r.ativa=!r.ativa;if(r.ativa){if(r.max&&r.vezes>=r.max)r.max=null;if(r.fim&&r.fim<HOJE)r.fim=null;rcAjustar(r)}
    log(t,`Tarefa "${k.titulo}": recorrência ${r.ativa?'retomada':'parada'}`);toast(r.ativa?`Série retomada: próxima em ${fd(r.prox)}.`:'Série parada: nenhuma tarefa nova nasce.')}
  tkRe()},true);

/* exemplo: relatório semanal com duas ocorrências já criadas (a primeira ainda aberta) */
(()=>{const t=S.terrenos?.[0];if(!t?.tarefas)return;if(!S.rcExemplo){S.rcExemplo=true;
  const ini=addD(HOJE,-14-((rcDow(HOJE)+6)%7)),k=tkNorm(t,{id:uid(),titulo:'Relatório semanal ao comitê',desc:'Andamento da negociação, pendências e próximos passos.',resultado:'',resp:'Rafael Souza',solic:'Ana Prado',criadoPor:'Ana Prado',criadoEm:ini,vis:'publico',acessos:[],
    inicio:ini,prazo:addD(ini,2),dur:3,prio:'media',lista:tkPrim(t,'aberta').id,pos:Date.now(),acomp:['Ana Prado'],checklists:[{id:uid(),nome:'Conferir',esconder:false,itens:[{id:uid(),texto:'Atualizar a linha do tempo',resp:'Rafael Souza',prazo:addD(ini,1),feito:ini}]}]});
  k.feita=addD(ini,2);k.feitaPor='Rafael Souza';k.lista=tkPrim(t,'conclui').id;k.checklists[0].itens[0].feitoPor='Rafael Souza';
  k.rec={freq:'semanal',int:1,dias:[1],diaMes:+ini.slice(8),prox:addD(ini,7),fim:null,max:null,vezes:1,prazoDias:2,lista:tkPrim(t,'aberta').id,ativa:true,por:'Ana Prado',em:ini};t.tarefas.push(k)}
  rcGerar()})();
