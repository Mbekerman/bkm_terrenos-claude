/* ===================== QUADROS E TAREFAS (bloco 1; decisões do Moisés, 29/out/2026) =====================
   Espelha o esquema fluxo do banco: cada terreno tem o seu quadro (t.listas), com as listas do modelo da
   empresa (S.listasModelo: Backlog, Fazer, Fazendo, Aguardando retorno, Pausadas, Feito; Configurações ›
   Tarefas). O cartão (t.tarefas) tem código TAR, lista, solicitante, responsável, executores, aprovadores,
   quem acompanha, etiquetas da empresa (S.etiquetas), checklists com responsável e prazo por item (item
   vira cartão), comentários com reações, anexos e capa; não se apaga, arquiva. Entrar numa lista do tipo
   "conclui" conclui. A página Tarefas junta os quadros de todos os terrenos, com filtros. */
Object.assign(P,{chat:'M5 5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H10l-4 3v-3H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z',clip:'M16 7l-7 7a2 2 0 0 0 3 3l7-7a4 4 0 0 0-6-6l-7 7a6 6 0 0 0 8 8l6-6',
  olho:'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',etq:'M3 12V4h8l9 9-8 8zM7.5 7.5h.01',arq:'M4 5h16v4H4zM5 9v10h14V9M10 13h4',pessoa:'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 20a8 8 0 0 1 16 0',capa:'M4 5h16v14H4zM4 10h16'});
const LISTAS_PADRAO=()=>[['Backlog','aberta'],['Fazer','aberta'],['Fazendo','aberta'],['Aguardando retorno','aberta'],['Pausadas','pausa'],['Feito','conclui']].map(([nome,tipo],i)=>({id:'lm'+(i+1),nome,tipo,ativo:true}));
const ETIQUETAS_PADRAO=()=>[['Urgente','vermelho'],['Jurídico','roxo'],['Aguardando cliente','amarelo'],['Financeiro','verde'],['Projeto','azul']].map(([nome,cor],i)=>({id:'et'+(i+1),nome,cor}));
const ETQ_CORES={cinza:'Cinza',azul:'Azul',verde:'Verde',amarelo:'Amarelo',laranja:'Laranja',vermelho:'Vermelho',roxo:'Roxo',rosa:'Rosa'};
const TIPO_LISTA={aberta:'Aberta',pausa:'Pausa',conclui:'Conclui a tarefa'};
const PAPEIS_TK=[['exec','Executores'],['aprov','Aprovadores'],['acomp','Acompanham']];
const REACOES=['👍','✅','👀','🎉'];
const DE_STATUS={pendente:'Fazer',em_andamento:'Fazendo',aguardando_terceiro:'Aguardando retorno',concluida:'Feito',cancelada:'Fazer'};
UI.tk=Object.assign({vista:'quadro',q:'',resp:'',ter:'',prio:'',etq:'',atras:false,arq:false},UI.tk||{});delete UI.tk.canc;

/* dados: lista e campos novos nos cartões (inclusive os salvos antes do bloco 1) */
function tkL(t){if(!t.listas)t.listas=(S.listasModelo||LISTAS_PADRAO()).filter(l=>l.ativo).map(l=>({id:uid(),nome:l.nome,tipo:l.tipo,oculta:false}));return t.listas}
function tkNorm(t,k){if(!k.codigo)k.codigo='TAR-'+String(S.tkSeq=(S.tkSeq||0)+1).padStart(6,'0');
  if(!k.lista||!tkL(t).some(l=>l.id===k.lista)){const nm=DE_STATUS[k.status]||'Fazer';k.lista=(tkL(t).find(l=>l.nome===nm)||tkPrim(t,'aberta')).id;
    if(k.status==='concluida'&&!k.feita)k.feita=HOJE;if(k.status==='cancelada'&&!k.arq)k.arq=HOJE}
  delete k.status;if(k.solic===undefined)k.solic=k.resp||null;if(!k.prio)k.prio='media';['exec','aprov','acomp','etq','checklists','coments','anexos'].forEach(c=>{if(!Array.isArray(k[c]))k[c]=[]});return k}
function tkPrep(){if(!S.listasModelo)S.listasModelo=LISTAS_PADRAO();if(!S.etiquetas)S.etiquetas=ETIQUETAS_PADRAO();
  S.terrenos.forEach(t=>{tkL(t);(t.tarefas||[]).forEach(k=>tkNorm(t,k))});
  // exemplo: um cartão completo no primeiro terreno
  const t=S.terrenos[0],k=t?.tarefas[0];if(k&&!S.tkExemplo){S.tkExemplo=true;k.etq=['et1'];k.exec=['Camila Torres'];k.acomp=['Moisés'];k.inicio=addD(HOJE,-3);
    k.checklists=[{id:uid(),nome:'Antes de responder',esconder:false,itens:[{id:uid(),texto:'Conferir a contraproposta com o jurídico',resp:'Camila Torres',prazo:addD(HOJE,1),feito:HOJE,feitoPor:'Camila Torres'},{id:uid(),texto:'Atualizar o estudo com o valor novo',resp:'Rafael Souza',prazo:addD(HOJE,2),feito:null}]}];
    k.coments=[{id:uid(),autor:'Camila Torres',texto:'O jurídico viu a minuta da contraproposta e não tem objeção.',em:addD(HOJE,-1)+' 10:12',reacoes:{'👍':['Ana Prado']}}];
    k.anexos=[{id:uid(),tipo:'link',nome:'Contraproposta (PDF)',url:'https://drive.google.com/'}]}}
const tkLista=(t,k)=>tkL(t).find(l=>l.id===k.lista)||tkL(t)[0];
const tkPrim=(t,tipo)=>tkL(t).filter(l=>!l.oculta).find(l=>l.tipo===tipo)||tkL(t).find(l=>l.tipo===tipo)||tkL(t)[0];
const tkAberta=k=>!k.feita&&!k.arq;
const tkAtras=k=>tkAberta(k)&&!!k.prazo&&k.prazo<HOJE;
const tkPessoas=k=>[...new Set([k.resp,...(k.exec||[])].filter(Boolean))];
const tkEd=()=>UI.role!=='Leitura';
const tkAcha=(tid,kid)=>{const t=T(tid);return {t,k:t?.tarefas.find(x=>x.id===kid)}};
const tkIr=k=>({b:'tarefas',alvo:k.id});
function tkAvisarAcomp(t,k,txt){(k.acomp||[]).forEach(u=>notificar(u,'tarefa_acompanhada',txt,t,null,tkIr(k)))}

/* mudanças (no banco: tg_tarefa_lista, notificações e auditoria) */
function tkMover(t,k,lid,pos){const de=tkLista(t,k),l=tkL(t).find(x=>x.id===lid);if(!l)return;
  if(l.tipo==='conclui'&&!k.feita&&!UI.apAprovando){const m=apBloqueio(t,k);if(m){toast(m,true);return false}}
  if(l.tipo!=='conclui'&&k.feita)apInvalidar(t,k);
  if(pos!=null)k.pos=pos;if(de.id===l.id)return;k.lista=l.id;
  if(l.tipo==='conclui'&&!k.feita){k.feita=HOJE;k.feitaPor=me();tkAvisarAcomp(t,k,`Tarefa concluída: ${k.titulo}`)}else if(l.tipo!=='conclui'){k.feita=null;k.feitaPor=null}
  log(t,`Tarefa "${k.titulo}": ${de.nome} → ${l.nome}`)}
function tkConcluir(t,k,sim){const l=sim?tkPrim(t,'conclui'):tkPrim(t,'aberta');k.pos=Date.now();tkMover(t,k,l.id)}
function tkCriar(t,d){const k=tkNorm(t,{id:uid(),titulo:d.titulo.trim(),desc:d.desc||'',resultado:'',resp:d.resp||null,solic:me(),prazo:d.prazo||null,prio:d.prio||'media',lista:d.lista||tkPrim(t,'aberta').id,pos:Date.now()});
  t.tarefas.push(k);if(tkLista(t,k).tipo==='conclui'){k.feita=HOJE;k.feitaPor=me()}notifTarefa(t,k,null);mencionarTarefa(t,k,'');log(t,`Tarefa criada: ${k.titulo}`);return k}

/* ---------- frente do cartão ---------- */
const etqChip=(e,cls='')=>`<span class="etq etq-${e.cor} ${cls}" title="${esc(e.nome)}">${esc(e.nome)}</span>`;
function cardTk({k,t},geral){const at=tkAtras(k),ets=(k.etq||[]).map(id=>S.etiquetas.find(e=>e.id===id)).filter(Boolean);
  const its=(k.checklists||[]).flatMap(c=>c.itens),fe=its.filter(i=>i.feito).length,nc=(k.coments||[]).filter(c=>!c.apagado).length,na=(k.anexos||[]).filter(a=>!a.removido).length;
  const pz=k.prazo?`<span class="tk-b tk-prazo ${k.feita?'feito':at?'atras':''}" title="${k.feita?'Concluída':at?'Atrasada':'Prazo'}">${ic(k.feita?'check':'clock',14)}${fd(k.prazo)}</span>`:'';
  const ind=[apSelo(k),pz,k.desc?`<span class="tk-b" title="Tem descrição">${ic('notas',14)}</span>`:'',
    nc?`<span class="tk-b" title="Comentários">${ic('chat',14)}${nc}</span>`:'',na?`<span class="tk-b" title="Anexos">${ic('clip',14)}${na}</span>`:'',
    its.length?`<span class="tk-b ${fe===its.length?'ok':''}" title="Checklist">${ic('check',14)}${fe}/${its.length}</span>`:'',
    k.prio==='alta'?'<span class="tk-b tk-pr alta" title="Prioridade alta">Alta</span>':k.prio==='baixa'?'<span class="tk-b tk-pr" title="Prioridade baixa">Baixa</span>':''].join(''),avs=tkPessoas(k).slice(0,3);
  return `<article class="tk ${k.feita?'concluida':''} ${k.arq?'arq':''}" draggable="${tkEd()&&!k.arq}" data-tk="${k.id}" data-a="tk-abrir" data-id="${t.id}" data-mid="${k.id}" tabindex="0" aria-label="${escT(k.titulo)}">
  ${k.capa?`<div class="tk-capa etq-${k.capa}"></div>`:''}<div class="tk-c">${ets.length?`<div class="tk-etqs">${ets.map(e=>etqChip(e)).join('')}</div>`:''}
  <div class="tk-t">${escT(k.titulo)}</div>
  ${geral?`<div class="tk-ter"><span class="num">${t.codigo}</span> · ${esc(t.nome).replace(/\b[A-Z]{3}-\d+/g,m=>`<span class="end-p">${m}</span>`)}</div>`:''}
  ${ind||avs.length?`<div class="tk-p">${ind}<span class="tk-avs">${avs.map(u=>av(u,'sm')).join('')}</span></div>`:''}</div></article>`}

/* ---------- quadro (da ficha ou de todos os terrenos) ---------- */
const ordemTk=(a,b)=>(a.k.pos??9e15)-(b.k.pos??9e15)||String(a.k.prazo||'9').localeCompare(String(b.k.prazo||'9'));
function todasTarefas(){return ativosBanco().flatMap(t=>(t.tarefas||[]).map(k=>({k,t})))}
function tkFiltradas(){const f=UI.tk,q=f.q.trim().toLowerCase();
  return todasTarefas().filter(({k,t})=>(f.arq?!!k.arq:!k.arq)&&(!f.resp||k.resp===f.resp||(k.exec||[]).includes(f.resp))&&(!f.ter||t.id===f.ter)&&(!f.prio||k.prio===f.prio)&&(!f.etq||(k.etq||[]).includes(f.etq))&&(!f.atras||tkAtras(k))
    &&(!q||[k.codigo,k.titulo,k.desc,t.nome,t.codigo,...(k.etq||[]).map(id=>S.etiquetas.find(e=>e.id===id)?.nome)].join(' ').toLowerCase().includes(q)))}
/* colunas do quadro geral: pelo nome da lista (a ordem do modelo da empresa e, depois, as criadas nos terrenos) */
function tkColunas(lista){const nomes=[...(S.listasModelo||[]).filter(l=>l.ativo).map(l=>l.nome)];
  lista.forEach(({t})=>tkL(t).forEach(l=>{if(!l.oculta&&!nomes.includes(l.nome))nomes.push(l.nome)}));return nomes}
function tkQuadro(itens,cols,geral,tid,add){
  return `<div class="tkb tk-board">${cols.map(c=>{const ks=itens.filter(x=>tkLista(x.t,x.k).nome===c.nome).sort(ordemTk);
    return `<section class="tk-col" data-tkcol="${esc(c.nome)}" aria-label="${esc(c.nome)}"><div class="tkl-h"><span>${esc(c.nome)}</span><span class="n">${ks.length}</span></div>
    <div class="tk-lista">${ks.map(x=>cardTk(x,geral)).join('')}</div>
    ${tkEd()&&add?`<button class="tk-add" data-a="tk-nova" data-v="${esc(c.nome)}"${tid?` data-id="${tid}"`:''}>${ic('add',16)}Adicionar um cartão</button>`:''}</section>`}).join('')}</div>`}
/* tela cheia do quadro: o quadro cobre a página (acima do menu, abaixo das janelas) e, onde der, o navegador esconde as próprias barras; Esc ou o mesmo botão saem */
const tkCheiaOn=()=>UI.tkCheia&&UI.tkCheia===location.pathname+location.hash.replace(/#f=.*/,'');
const tkCheiaBtn=()=>{const on=tkCheiaOn();return `<button class="btn text sm tk-cheia-b" data-a="tk-cheia" aria-pressed="${on}" title="${on?'Sair da tela cheia (Esc)':'Abrir o quadro em tela cheia'}">${ic(on?'telaSair':'tela',18)}${on?'Sair da tela cheia':'Tela cheia'}</button>`};
let tkCheiaApi=false;
function tkTelaCheia(on){if(on===undefined)on=!tkCheiaOn();UI.tkCheia=on?location.pathname+location.hash.replace(/#f=.*/,''):null;
  if(on){try{const p=document.documentElement.requestFullscreen?.({navigationUI:'hide'});tkCheiaApi=!!p;p?.catch?.(()=>{tkCheiaApi=false})}catch(e){tkCheiaApi=false}}
  else if(document.fullscreenElement&&tkCheiaApi){tkCheiaApi=false;document.exitFullscreen?.().catch?.(()=>{})}
  render()}
document.addEventListener('fullscreenchange',()=>{if(!document.fullscreenElement&&tkCheiaApi){tkCheiaApi=false;if(UI.tkCheia)tkTelaCheia(false)}});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&UI.tkCheia&&!e.defaultPrevented&&!UI.modal&&!document.fullscreenElement&&$('.tk-full.on')){tkTelaCheia(false);e.preventDefault()}});
function pgTarefas(){const f=UI.tk,l=tkFiltradas();
  const opt=(o,v)=>Object.entries(o).map(([k,x])=>`<option value="${k}" ${v===k?'selected':''}>${esc(x)}</option>`).join('');
  const filtros=`<div class="tk-filtros"><label class="search sm" for="tk-q">${bi('busca',24)}<input id="tk-q" type="search" placeholder="Buscar tarefa, código, etiqueta ou terreno" value="${esc(f.q)}" autocomplete="off"></label>
    <div class="tk-fl"><label class="sr-only" for="tk-resp">Pessoa</label><select id="tk-resp" class="fsel-chip${f.resp?' on':''}" data-ch="tk-f" data-k="resp"><option value="">Pessoa</option>${opt(Object.fromEntries(USERS.map(u=>[u,u])),f.resp)}</select>
    <label class="sr-only" for="tk-ter">Terreno</label><select id="tk-ter" class="fsel-chip${f.ter?' on':''}" data-ch="tk-f" data-k="ter"><option value="">Terreno</option>${opt(Object.fromEntries(ativosBanco().map(t=>[t.id,t.codigo+' · '+t.nome])),f.ter)}</select>
    <label class="sr-only" for="tk-etq">Etiqueta</label><select id="tk-etq" class="fsel-chip${f.etq?' on':''}" data-ch="tk-f" data-k="etq"><option value="">Etiqueta</option>${opt(Object.fromEntries(S.etiquetas.map(e=>[e.id,e.nome])),f.etq)}</select>
    <label class="sr-only" for="tk-prio">Prioridade</label><select id="tk-prio" class="fsel-chip${f.prio?' on':''}" data-ch="tk-f" data-k="prio"><option value="">Prioridade</option>${opt(OPT.prioTar,f.prio)}</select>
    <label class="fchk"><input type="checkbox" data-ch="tk-f" data-k="atras" ${f.atras?'checked':''}>${ic('check',16)}Só atrasadas</label>
    <label class="fchk"><input type="checkbox" data-ch="tk-f" data-k="arq" ${f.arq?'checked':''}>${ic('check',16)}Arquivadas</label></div></div>`;
  const t1=f.ter?T(f.ter):null,cols=t1?tkL(t1).filter(x=>!x.oculta):tkColunas(l).map(nome=>({nome}));
  const colsT=[{k:'titulo',l:'Tarefa',cls:'esq',v:({k,t})=>`<div class="t1">${escT(k.titulo)}</div><div class="t2">${k.codigo}</div><div class="t2 so-m">${t.codigo} · ${esc(t.nome)}</div>`,s:({k})=>k.titulo},
    {k:'ter',l:'Terreno',cls:'esq hm tk-ter',v:({t})=>`<div class="t2" style="color:var(--texto)">${t.codigo}</div><div class="t2">${esc(t.nome)}</div>`,s:({t})=>t.codigo},
    {k:'resp',l:'Responsável',cls:'hm',v:({k})=>esc(k.resp||'—'),s:({k})=>k.resp||''},
    {k:'prazo',l:'Prazo',cls:'num',v:({k})=>`<span style="${tkAtras(k)?'color:var(--atraso,#b3261e);font-weight:600':''}">${fd(k.prazo)}</span>`,s:({k})=>(tkAberta(k)?'0':'9')+(k.prazo||'9')},
    {k:'prio',l:'Prioridade',cls:'hm',v:({k})=>OPT.prioTar[k.prio]||'—',s:({k})=>['alta','media','baixa'].indexOf(k.prio)},
    {k:'lista',l:'Lista',v:({k,t})=>`<span class="chip tkst ${k.feita?'concluida':''}">${esc(tkLista(t,k).nome)}</span>`,s:({k,t})=>tkL(t).indexOf(tkLista(t,k))}];
  const ab=todasTarefas().filter(({k})=>tkAberta(k)),atras=ab.filter(({k})=>tkAtras(k)).length;
  return `<div class="page-h"><div><h1>Tarefas</h1><div class="sub">${ab.length+(ab.length===1?' aberta':' abertas')} · ${atras+(atras===1?' atrasada':' atrasadas')} · quadros de ${ativosBanco().length} terrenos</div></div>
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><div class="seg" role="group" aria-label="Visualização">${[['quadro','Quadro'],['tabela','Tabela'],['cronograma','Cronograma']].map(([k,x])=>`<button data-a="tk-vista" data-v="${k}" aria-pressed="${f.vista===k}">${x}</button>`).join('')}</div>
    ${f.vista==='quadro'?tkCheiaBtn():''}${tkEd()?`<button class="btn ed" data-a="tk-nova" data-v="">${ic('add',18)}Nova tarefa</button>`:''}</div></div>
  <div class="tk-full${tkCheiaOn()?' on':''}">${tkCheiaOn()?`<div class="tk-full-h"><h2>Tarefas</h2>${tkCheiaBtn()}</div>`:''}${filtros}${f.vista==='cronograma'?`<section class="sec cr-sec"><div class="sec-b">${crPaginaHtml(l.filter(({k})=>!k.arq))}</div></section>`:f.vista==='tabela'?`<section class="sec"><div class="sec-b">${tabela('tarefas',l,colsT,{attr:({k,t})=>`data-a="tk-abrir" data-tk="${k.id}" data-id="${t.id}" tabindex="0"`,padrao:{k:'prazo',dir:'asc'},vazio:'Nenhuma tarefa com esses filtros.'})}</div></section>`:tkQuadro(l,cols,true,t1?.id,!f.arq)}</div>`}
/* seção Tarefas da ficha: o quadro do terreno */
function abaTarefas(t){const vc=UI.crVista[t.id]==='crono',arq=!!UI.tkArqFicha&&!vc,its=t.tarefas.filter(k=>arq?k.arq:!k.arq).map(k=>({k,t})),ab=t.tarefas.filter(tkAberta),at=ab.filter(tkAtras).length,na=t.tarefas.filter(k=>k.arq).length;
  const q=vc?crFichaHtml(t):tkQuadro(its,tkL(t).filter(l=>!l.oculta),false,t.id,!arq);
  const seg=`<div class="seg sm" role="group" aria-label="Visualização do quadro">${[['quadro','Quadro'],['crono','Cronograma']].map(([v,n])=>`<button data-a="cr-vista" data-id="${t.id}" data-v="${v}" aria-pressed="${(vc?'crono':'quadro')===v}">${n}</button>`).join('')}</div>`;
  return `<div class="stack"><section class="sec tk-sec tk-full${tkCheiaOn()?' on':''}${vc?' cr-on':''}"><div class="sec-h"><h2>${vc?'Cronograma':'Quadro'} do terreno${tkCheiaOn()?` · ${t.codigo} ${esc(t.nome)}`:''}</h2><span class="faint tk-sub">${ab.length+(ab.length===1?' aberta':' abertas')} · ${at+(at===1?' atrasada':' atrasadas')}</span>
    <span class="tk-sh">${seg}${!vc&&(na||arq)?`<button class="btn text sm" data-a="tk-arqficha">${arq?'Voltar ao quadro':`Arquivadas (${na})`}</button>`:''}${tkEd()?`<button class="btn text sm" data-a="cr-modelos" data-id="${t.id}">Modelos</button>`:''}${tkEd()&&!vc?`<button class="btn text sm" data-a="tk-listas" data-id="${t.id}">Listas</button>`:''}${tkCheiaBtn()}</span></div>
  <div class="sec-b tk-sb">${q}</div></section></div>`}

/* ---------- arrastar (lista e posição) ---------- */
function moverTk(tid,kid,colNome,antesDe){const {t,k}=tkAcha(tid,kid);if(!k)return;const l=tkL(t).find(x=>x.nome===colNome&&!x.oculta)||tkL(t).find(x=>x.nome===colNome);
  if(!l){toast(`${t.codigo} não tem a lista ${colNome}.`,true);return}
  const irmas=t.tarefas.filter(x=>x.lista===l.id&&x.id!==kid&&!x.arq).map(x=>({k:x})).sort(ordemTk),i=antesDe?irmas.findIndex(x=>x.k.id===antesDe):-1,pos=x=>x?.k.pos??0;
  const np=i<0?(irmas.length?pos(irmas.at(-1)):0)+1000:i===0?pos(irmas[0])-1000:(pos(irmas[i-1])+pos(irmas[i]))/2;
  const mudou=k.lista!==l.id;if(tkMover(t,k,l.id,np)===false){render();return}if(mudou)toast(`${k.titulo}: ${l.nome}.`);save();render()}
let tkArr=null;
document.addEventListener('dragstart',e=>{const c=e.target.closest?.('.tk[draggable="true"]');if(!c)return;tkArr={kid:c.dataset.tk,tid:c.dataset.id};e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',c.dataset.tk);c.classList.add('arrastando');document.body.classList.add('dnd-tk')});
document.addEventListener('dragend',()=>{tkArr=null;document.body.classList.remove('dnd-tk');document.querySelectorAll('.tk.arrastando,.tk-col.sobre,.tk-marca').forEach(x=>x.classList.contains('tk-marca')?x.remove():x.classList.remove('arrastando','sobre'))});
const tkAntes=(col,y)=>[...col.querySelectorAll('.tk:not(.arrastando)')].find(c=>{const r=c.getBoundingClientRect();return y<r.top+r.height/2});
document.addEventListener('dragover',e=>{if(!tkArr)return;const col=e.target.closest?.('.tk-col');if(!col){document.querySelectorAll('.tk-col.sobre').forEach(x=>x.classList.remove('sobre'));document.querySelector('.tk-marca')?.remove();return}e.preventDefault();e.dataTransfer.dropEffect='move';
  document.querySelectorAll('.tk-col.sobre').forEach(x=>x!==col&&x.classList.remove('sobre'));col.classList.add('sobre');
  let m=document.querySelector('.tk-marca');if(!m){m=document.createElement('div');m.className='tk-marca'}const a=tkAntes(col,e.clientY),lista=col.querySelector('.tk-lista');if(a)lista.insertBefore(m,a);else lista.appendChild(m)});
document.addEventListener('drop',e=>{const col=e.target.closest?.('.tk-col');if(!col||!tkArr)return;e.preventDefault();const a=tkAntes(col,e.clientY),x=tkArr;tkArr=null;document.body.classList.remove('dnd-tk');document.querySelectorAll('.tk-col.sobre').forEach(x=>x.classList.remove('sobre'));document.querySelector('.tk-marca')?.remove();moverTk(x.tid,x.kid,col.dataset.tkcol,a?.dataset.tk)});

/* ---------- janela do cartão ---------- */
const tkSelU=(nm,v,vazio,extra='')=>`<select ${extra} name="${nm}">${vazio!=null?`<option value="">${vazio}</option>`:''}${USERS.map(u=>`<option ${u===v?'selected':''}>${esc(u)}</option>`).join('')}</select>`;
function tkNovaHtml(fechar){const sel=UI.tkSel,t=sel.tid?T(sel.tid):null,opt=(o,v)=>Object.entries(o).map(([x,l])=>`<option value="${x}" ${v===x?'selected':''}>${esc(l)}</option>`).join('');
  const listas=t?tkL(t).filter(l=>!l.oculta).map(l=>l.nome):(S.listasModelo||[]).filter(l=>l.ativo).map(l=>l.nome),lv=sel.lista&&listas.includes(sel.lista)?sel.lista:listas.includes('Fazer')?'Fazer':listas[0];
  return `<div class="dh"><div><h2>Nova tarefa</h2>${t?`<div class="muted" style="margin-top:4px">${t.codigo} · ${esc(t.nome)}</div>`:''}</div>${fechar}</div>
  <form data-form="tarefa-m" id="f-tk"><div class="fields">
  <div class="field full"><label for="tm-t">Tarefa</label><input id="tm-t" name="titulo" required placeholder="Ex.: cobrar a contraproposta do proprietário"></div>
  ${t?'':`<div class="field full"><label for="tm-ter">Terreno</label><select id="tm-ter" name="ter" required><option value="">Escolha o terreno</option>${opt(Object.fromEntries(ativosBanco().map(x=>[x.id,x.codigo+' · '+x.nome])),UI.tk.ter)}</select></div>`}
  <div class="field"><label for="tm-l">Lista</label><select id="tm-l" name="lista">${listas.map(n=>`<option ${n===lv?'selected':''}>${esc(n)}</option>`).join('')}</select></div>
  <div class="field"><label for="tm-r">Responsável</label>${tkSelU('resp',me(),'Sem responsável','id="tm-r"')}</div>
  <div class="field"><label for="tm-p">Prazo</label><input id="tm-p" name="prazo" type="date" value="${addD(HOJE,3)}"></div>
  <div class="field"><label for="tm-pr">Prioridade</label><select id="tm-pr" name="prio">${opt(OPT.prioTar,'media')}</select></div>
  <div class="field full"><label for="tm-d">Descrição</label><textarea id="tm-d" name="desc" data-mencao placeholder="Use @ para avisar um colega"></textarea></div></div></form>
  <div class="df"><button class="btn text" data-a="close">Cancelar</button><button class="btn primary" type="submit" form="f-tk">Criar tarefa</button></div>`}
/* janela do cartão no desenho do Trello (pedido do Moisés, 29/out/2026): capa, círculo de concluir antes do título, "na lista …",
   linha de detalhes (pessoas, etiquetas, datas, prioridade), coluna principal com descrição, anexos, checklists e comentários
   (cada bloco com o ícone na calha da esquerda) e coluna estreita à direita com "Adicionar ao cartão" e "Ações" */
const tkSecH=(icone,titulo,dir='')=>`<div class="tkm-sh"><span class="tkm-gi">${ic(icone,20)}</span><h3>${titulo}</h3>${dir?`<span class="tkm-shd">${dir}</span>`:''}</div>`;
const tkMais=(extra,rot)=>`<label class="tkm-mais" title="${rot}">${ic('add',16)}<select ${extra} aria-label="${rot}"><option value=""></option>${USERS.map(u=>`<option>${esc(u)}</option>`).join('')}</select></label>`;
function tkCartaoHtml(fechar){const {t,k}=tkAcha(UI.tkSel.tid,UI.tkSel.kid);if(!k)return `<div class="dh"><h2>Tarefa não encontrada</h2>${fechar}</div>`;
  const ro=!tkEd(),dis=ro?'disabled':'',l=tkLista(t,k),eu=me(),acompanho=(k.acomp||[]).includes(eu),pop=UI.tkPop,at=tkAtras(k);
  const ets=(k.etq||[]).map(id=>S.etiquetas.find(e=>e.id===id)).filter(Boolean);
  /* linha de detalhes */
  const pessoa=(campo,v,vazio,id)=>`<div class="tkm-d"><label class="tkm-dl" for="${id}">${campo==='resp'?'Responsável':'Solicitante'}</label><div class="tkm-dv">${v?av(v,'sm'):''}<select id="${id}" class="tkm-pill" data-tkc="${campo}" ${dis}>${vazio!=null?`<option value="">${vazio}</option>`:''}${USERS.map(u=>`<option ${u===v?'selected':''}>${esc(u)}</option>`).join('')}</select></div></div>`;
  const grupos=PAPEIS_TK.map(([p,n])=>{const q=k[p]||[];if(ro&&!q.length)return '';
    return `<div class="tkm-d"><span class="tkm-dl">${n}</span><div class="tkm-dv tkm-avs">${q.map(u=>ro?`<span title="${esc(u)}">${av(u,'sm')}</span>`:`<button class="tkm-av" data-a="tkc-tira" data-p="${p}" data-v="${esc(u)}" title="${esc(u)} · clique para tirar" aria-label="Tirar ${esc(u)} de ${n.toLowerCase()}">${av(u,'sm')}<span class="tkm-avx">${ic('close',12)}</span></button>`).join('')}
      ${ro?'':tkMais(`data-tkc="add-${p}"`,`Incluir em ${n.toLowerCase()}`)}</div></div>`}).join('');
  const etqs=ets.length||!ro?`<div class="tkm-d"><span class="tkm-dl">Etiquetas</span><div class="tkm-dv">${ets.map(e=>etqChip(e,'tkm-etq')).join('')}${ro?'':`<button class="tkm-mais" data-a="tkc-pop" data-v="etq" aria-expanded="${pop==='etq'}" title="Etiquetas" aria-label="Escolher etiquetas">${ic('add',16)}</button>`}</div></div>`:'';
  const datas=`<div class="tkm-d"><span class="tkm-dl">Datas</span><div class="tkm-dv tkm-datas"><input id="tkc-ini" type="date" class="tkm-pill" value="${k.inicio||''}" data-tkc="inicio" ${dis} aria-label="Início" title="Início"><span class="faint">→</span>
    <input id="tkc-pz" type="date" class="tkm-pill" value="${k.prazo||''}" data-tkc="prazo" ${dis} aria-label="Prazo" title="Prazo">${crCartaoDatas(t,k,dis)}${k.feita?'<span class="tkm-tag ok">Concluída</span>':at?'<span class="tkm-tag atras">Atrasada</span>':''}</div></div>`;
  const prio=`<div class="tkm-d"><label class="tkm-dl" for="tkc-pr">Prioridade</label><div class="tkm-dv"><select id="tkc-pr" class="tkm-pill prio-${k.prio}" data-tkc="prio" ${dis}>${Object.entries(OPT.prioTar).map(([x,n])=>`<option value="${x}" ${x===k.prio?'selected':''}>${n}</option>`).join('')}</select></div></div>`;
  /* checklists */
  const checks=(k.checklists||[]).map(c=>{const it=c.itens,fe=it.filter(i=>i.feito).length,pc=it.length?Math.round(100*fe/it.length):0;
    return `<div class="tkm-bloco tkm-ck" data-ck="${c.id}"><div class="tkm-sh tkm-ckh"><span class="tkm-gi">${ic('check',20)}</span><h3>${esc(c.nome)}</h3><span class="faint tkm-ckn">${fe}/${it.length}</span>
      <span class="tkm-shd">${fe?`<button class="tkm-btn" data-a="tkc-esconder" data-c="${c.id}">${c.esconder?`Mostrar itens marcados (${fe})`:'Ocultar itens marcados'}</button>`:''}${ro?'':`<button class="tkm-btn" data-a="tkc-ck-x" data-c="${c.id}">Excluir</button>`}</span></div>
      <div class="tkm-prog"><span class="tkm-pc">${pc}%</span><div class="tkm-bar ${pc===100?'ok':''}" role="progressbar" aria-valuenow="${pc}" aria-valuemin="0" aria-valuemax="100" aria-label="${esc(c.nome)}: ${pc}%"><span style="width:${pc}%"></span></div></div>
      ${it.filter(i=>!(c.esconder&&i.feito)).map(i=>`<div class="tkm-it ${i.feito?'feito':''}"><label class="tkm-ch"><input type="checkbox" data-tkc="item-feito" data-c="${c.id}" data-i="${i.id}" ${i.feito?'checked':''} ${dis}><span>${esc(i.texto)}</span></label>
        <span class="tkm-im">${i.virou?`<button class="linkbtn" data-a="tk-abrir" data-id="${t.id}" data-tk="${i.virou}">Virou cartão</button>`:''}
        ${ro?`${i.resp?`<span class="tkm-mini">${av(i.resp,'sm')}</span>`:''}${i.prazo?`<span class="tkm-mini ${!i.feito&&i.prazo<HOJE?'atras':''}">${ic('clock',14)}${fd(i.prazo)}</span>`:''}`
          :`<label class="tkm-mini tkm-mresp ${i.resp?'tem':''}" title="${i.resp?esc(i.resp):'Atribuir'}">${i.resp?av(i.resp,'sm'):ic('pessoa',16)}${tkSelU('',i.resp,'Sem responsável',`data-tkc="item-resp" data-c="${c.id}" data-i="${i.id}" aria-label="Responsável do item"`)}</label>
          <input type="date" class="tkm-mini tkm-mdata ${i.prazo?'tem':''} ${!i.feito&&i.prazo&&i.prazo<HOJE?'atras':''}" value="${i.prazo||''}" data-tkc="item-prazo" data-c="${c.id}" data-i="${i.id}" aria-label="Prazo do item" title="Prazo">
          <span class="tkm-hov">${i.virou?'':`<button class="iconbtn sm" data-a="tkc-item-cartao" data-c="${c.id}" data-i="${i.id}" title="Transformar em cartão" aria-label="Transformar ${esc(i.texto)} em cartão">${ic('fwd',16)}</button>`}<button class="iconbtn sm" data-a="tkc-item-x" data-c="${c.id}" data-i="${i.id}" title="Excluir item" aria-label="Excluir ${esc(i.texto)}">${ic('close',16)}</button></span>`}</span></div>`).join('')}
      ${ro?'':UI.tkItemNovo===c.id?`<form class="tkm-novo" data-form="tkc-item" data-c="${c.id}"><input name="texto" required placeholder="Adicione um item" aria-label="Novo item de ${esc(c.nome)}">
        <div class="tkm-novob"><button class="tkm-ok" type="submit">Adicionar</button><button class="tkm-btn" type="button" data-a="tkc-item-cancela">Cancelar</button><span class="tkm-sp"></span>${tkSelU('resp','','Responsável','class="tkm-pill" aria-label="Responsável do novo item"')}<input type="date" name="prazo" class="tkm-pill" aria-label="Prazo do novo item"></div></form>`
        :`<button class="tkm-btn tkm-additem" data-a="tkc-item-novo" data-c="${c.id}">Adicionar um item</button>`}</div>`}).join('');
  const coms=(k.coments||[]).slice().reverse().map(c=>{const meu=c.autor===eu&&!ro;
    return `<div class="tkm-co ${c.apagado?'apagado':''}" id="co-${c.id}"><span class="tkm-coa">${av(c.autor,'sm')}</span><div class="tkm-cob"><div class="tkm-coh"><b>${esc(c.autor)}</b><span class="faint">${fd(c.em.slice(0,10))} ${esc(c.em.slice(11,16))}${c.editado?' (editado)':''}</span></div>
      ${c.apagado?'<div class="faint">Comentário apagado.</div>':UI.tkEdCom===c.id?`<form data-form="tkc-com-ed" data-v="${c.id}"><textarea name="texto" data-mencao required>${esc(c.texto)}</textarea><div class="tkm-acs"><button class="tkm-ok" type="submit">Salvar</button><button class="tkm-btn" type="button" data-a="tkc-com-cancela">Cancelar</button></div></form>`
        :`<div class="tkm-cot">${escM(c.texto)}</div><div class="tkm-acs">${REACOES.map(r=>{const q=(c.reacoes?.[r]||[]);return q.length||!ro?`<button class="tkm-re ${q.includes(eu)?'on':''} ${q.length?'':'vazia'}" data-a="tkc-reage" data-v="${c.id}" data-r="${r}" ${ro?'disabled':''} aria-label="${r} ${q.length}" title="${esc(q.join(', '))}">${r}${q.length?` ${q.length}`:''}</button>`:''}).join('')}
        ${meu?`<button class="linkbtn" data-a="tkc-com-edita" data-v="${c.id}">Editar</button><button class="linkbtn" data-a="tkc-com-apaga" data-v="${c.id}">Excluir</button>`:''}</div>`}</div></div>`}).join('');
  const anexos=(k.anexos||[]).filter(a=>!a.removido),outros=t.tarefas.filter(x=>x.id!==k.id&&!x.arq);
  const anexosH=anexos.map(a=>`<div class="tkm-an"><span class="tkm-anic">${ic(a.tipo==='tarefa'?'board':'link',20)}</span><div class="tkm-anb">${a.tipo==='tarefa'?`<button class="linkbtn" data-a="tk-abrir" data-id="${t.id}" data-tk="${a.ref}">${esc(a.nome)}</button><span class="faint">Cartão</span>`:`<a href="${esc(a.url)}" target="_blank" rel="noopener">${esc(a.nome)}</a><span class="faint">${esc(String(a.url||'').replace(/^https?:\/\//,'').slice(0,48))}</span>`}</div>
    ${ro?'':`<button class="tkm-btn sm" data-a="tkc-an-x" data-v="${a.id}" aria-label="Remover ${esc(a.nome)}">Remover</button>`}</div>`).join('');
  /* coluna da direita */
  const b=(acao,icone,rot,extra='')=>`<button class="tkm-sb" data-a="${acao}" ${extra}>${ic(icone,16)}<span>${rot}</span></button>`;
  const popEtq=pop==='etq'&&!ro?`<div class="tkm-pop" role="group" aria-label="Etiquetas"><div class="tkm-poph">Etiquetas<button class="iconbtn sm" data-a="tkc-pop" data-v="etq" aria-label="Fechar">${ic('close',16)}</button></div>
      ${S.etiquetas.map(e=>{const on=(k.etq||[]).includes(e.id);return `<button class="tkm-etl ${on?'on':''}" data-a="tkc-etq" data-v="${e.id}" aria-pressed="${on}"><span class="tkm-etbox">${on?ic('check',14):''}</span><span class="etq etq-${e.cor}">${esc(e.nome)}</span></button>`}).join('')}
      ${UI.tkEtqNova?`<form class="tkm-nf vert" data-form="tkc-etq-nova"><input name="nome" required placeholder="Nome da etiqueta" aria-label="Nome da etiqueta"><select name="cor" aria-label="Cor">${Object.entries(ETQ_CORES).map(([c,n])=>`<option value="${c}">${n}</option>`).join('')}</select><button class="tkm-ok" type="submit">Criar</button></form>`:`<button class="tkm-btn tkm-full" data-a="tkc-etq-nova">Criar uma nova etiqueta</button>`}</div>`:'';
  const popCapa=pop==='capa'&&!ro?`<div class="tkm-pop" role="group" aria-label="Capa"><div class="tkm-poph">Capa<button class="iconbtn sm" data-a="tkc-pop" data-v="capa" aria-label="Fechar">${ic('close',16)}</button></div><div class="tkm-capas">${Object.keys(ETQ_CORES).map(c=>`<button class="tkm-capa etq-${c} ${(k.capa||'')===c?'on':''}" data-a="tkc-capa" data-v="${c}" aria-label="${ETQ_CORES[c]}" title="${ETQ_CORES[c]}" aria-pressed="${(k.capa||'')===c}"></button>`).join('')}</div>
      ${k.capa?`<button class="tkm-btn tkm-full" data-a="tkc-capa" data-v="">Remover capa</button>`:''}</div>`:'';
  const popAnexo=pop==='anexo'&&!ro?`<div class="tkm-pop" role="group" aria-label="Anexar"><div class="tkm-poph">Anexar<button class="iconbtn sm" data-a="tkc-pop" data-v="anexo" aria-label="Fechar">${ic('close',16)}</button></div>
      <form class="tkm-nf vert" data-form="tkc-anexo"><input name="url" type="url" required placeholder="Cole um link (https://…)" aria-label="Endereço do link"><input name="nome" required placeholder="Texto a exibir" aria-label="Nome do link"><button class="tkm-ok" type="submit">Anexar link</button></form>
      ${outros.length?`<select data-tkc="ligar" class="tkm-pill tkm-full" aria-label="Ligar a outro cartão"><option value="">Ligar a outro cartão…</option>${outros.map(x=>`<option value="${x.id}">${x.codigo} · ${esc(x.titulo)}</option>`).join('')}</select>`:''}</div>`:'';
  return `<div class="tkm${k.capa?' com-capa':''}">${k.capa?`<div class="tkm-capa-g etq-${k.capa}"></div>`:''}<div class="tkm-x">${fechar}</div>
  <div class="tkm-cab"><span class="tkm-gi">${ro||k.arq?(k.feita?`<span class="tkm-done on" title="Concluída em ${fd(k.feita)}">${ic('check',16)}</span>`:`<span class="tkm-done"></span>`):`<button class="tkm-done ${k.feita?'on':''}" data-a="tkc-concluir" title="${apRotulo(k)||(k.feita?'Reabrir':'Marcar como concluída')}" aria-label="${apRotulo(k)||(k.feita?'Reabrir a tarefa':'Marcar como concluída')}" aria-pressed="${!!k.feita}">${ic('check',16)}</button>`}</span>
    <div class="tkm-hd"><input class="tkm-tit" value="${esc(k.titulo)}" data-tkc="titulo" aria-label="Título da tarefa" ${dis} required>
    <div class="tkm-cod"><span>na lista</span><select class="tkm-lsel" data-tkc="lista" ${dis||(k.arq?'disabled':'')} aria-label="Lista">${tkL(t).map(x=>`<option value="${x.id}" ${x.id===l.id?'selected':''}>${esc(x.nome)}${x.oculta?' (oculta)':''}</option>`).join('')}</select>
      <span class="faint">·</span><span class="num">${k.codigo}</span><span class="faint">·</span><button class="linkbtn" data-a="abrir" data-id="${t.id}" data-tab="tarefas" data-from="tarefas">${t.codigo} · ${esc(t.nome)}</button>
      ${k.feita?`<span class="faint">· concluída em ${fd(k.feita)}${k.feitaPor?' por '+esc(k.feitaPor):''}</span>`:''}</div></div></div>
  ${k.arq?`<div class="tkm-arqb">${ic('arq',18)}<span>Este cartão está arquivado e fica fora dos quadros.</span></div>`:''}
  <div class="tkm-g"><div class="tkm-main">
    <div class="tkm-dets">${pessoa('resp',k.resp,'Sem responsável','tkc-resp')}${pessoa('solic',k.solic,'—','tkc-sol')}${grupos}${etqs}${datas}${prio}</div>
    ${apBlocoHtml(t,k,ro||!!k.arq)}
    <div class="tkm-bloco">${tkSecH('notas','Descrição')}<div class="tkm-in"><textarea id="tkc-d" class="tkm-txt" data-tkc="desc" data-mencao placeholder="Adicione uma descrição mais detalhada: objetivo, instruções e critério de pronto (@ avisa um colega)" ${dis}>${esc(k.desc||'')}</textarea></div></div>
    ${k.feita||k.resultado?`<div class="tkm-bloco">${tkSecH('check','Resultado')}<div class="tkm-in"><textarea id="tkc-r" class="tkm-txt" data-tkc="resultado" data-mencao placeholder="O que foi feito ou decidido" ${dis}>${esc(k.resultado||'')}</textarea></div></div>`:''}
    ${anexos.length?`<div class="tkm-bloco">${tkSecH('clip','Anexos',ro?'':`<button class="tkm-btn" data-a="tkc-pop" data-v="anexo">Adicionar</button>`)}<div class="tkm-in">${anexosH}</div></div>`:''}
    ${UI.tkCkNovo&&!ro?`<div class="tkm-bloco">${tkSecH('check','Novo checklist')}<form class="tkm-in tkm-novo" data-form="tkc-ck"><input name="nome" required placeholder="Título" aria-label="Nome do checklist" value="Checklist"><div class="tkm-novob"><button class="tkm-ok" type="submit">Adicionar</button><button class="tkm-btn" type="button" data-a="tkc-ck-cancela">Cancelar</button></div></form></div>`:''}
    ${crCartaoPreds(t,k,ro||!!k.arq)}
    ${checks}
    <div class="tkm-bloco">${tkSecH('chat','Comentários')}
      ${ro?'':`<form class="tkm-cf" data-form="tkc-com"><span class="tkm-coa">${av(eu,'sm')}</span><div class="tkm-cfb"><textarea name="texto" data-mencao required placeholder="Escrever um comentário… (@ avisa um colega)" aria-label="Novo comentário"></textarea><button class="tkm-ok" type="submit">Salvar</button></div></form>`}
      ${coms||(ro?'<div class="tkm-in faint">Nenhum comentário.</div>':'')}</div>
  </div><aside class="tkm-side">
    ${ro?'':`<div class="tkm-sg"><span class="tkm-sgt">Adicionar ao cartão</span>
      ${b('tkc-pop','etq','Etiquetas',`data-v="etq" aria-expanded="${pop==='etq'}"`)}${popEtq}
      ${b('tkc-ck-novo','check','Checklist')}
      ${b('tkc-pop','clip','Anexo',`data-v="anexo" aria-expanded="${pop==='anexo'}"`)}${popAnexo}
      ${b('tkc-pop','capa','Capa',`data-v="capa" aria-expanded="${pop==='capa'}"`)}${popCapa}</div>`}
    <div class="tkm-sg"><span class="tkm-sgt">Ações</span>
      ${ro||k.arq?'':b('tkc-concluir','check',apRotulo(k)?.replace('Aguardando aprovação','Em aprovação')||(k.feita?'Reabrir':'Concluir'),'data-dup="1"')}
      ${ro?'':b('tkc-acomp','olho',acompanho?'Seguindo ✓':'Acompanhar',`aria-pressed="${acompanho}"`)}
      ${b('tkc-link','link','Copiar link')}
      ${ro?'':b('tkc-arq','arq',k.arq?'Restaurar':'Arquivar')}</div>
  </aside></div>${crAvisoHtml()}</div>`}
/* gerenciar as listas do quadro do terreno */
function tkListasHtml(fechar){const t=T(UI.tkSel.tid),n=k=>t.tarefas.filter(x=>x.lista===k&&!x.arq).length;
  return `<div class="dh"><div><h2>Listas do quadro</h2><div class="muted" style="margin-top:4px">${t.codigo} · ${esc(t.nome)}. Valem só para este terreno.</div></div>${fechar}</div>
  <div class="tkl">${tkL(t).map((l,i)=>`<div class="tkl-r ${l.oculta?'oculta':''}"><input value="${esc(l.nome)}" data-tkl="nome" data-v="${l.id}" aria-label="Nome da lista ${i+1}"><span class="chip">${TIPO_LISTA[l.tipo]}</span><span class="faint num">${n(l.id)}</span>
    <button class="iconbtn sm" data-a="tkl-sobe" data-v="${l.id}" ${i?'':'disabled'} aria-label="Subir ${esc(l.nome)}" title="Subir">${ic('chev',18)}</button>
    <button class="btn text sm" data-a="tkl-oculta" data-v="${l.id}">${l.oculta?'Mostrar':'Ocultar'}</button></div>`).join('')}</div>
  <form class="tkm-nf" data-form="tkl-nova"><input name="nome" required placeholder="Nova lista" aria-label="Nome da nova lista"><select name="tipo" aria-label="Tipo da lista">${Object.entries(TIPO_LISTA).map(([x,n])=>`<option value="${x}">${n}</option>`).join('')}</select><button class="btn tonal sm" type="submit">Criar lista</button></form>
  <div class="df"><button class="btn primary" data-a="close">Pronto</button></div>`}
function quadrosModal(M,fechar){if(M==='tarefa')return UI.tkSel?.kid?tkCartaoHtml(fechar):tkNovaHtml(fechar);if(M==='tk-listas')return tkListasHtml(fechar);return ''}

/* refaz a tela mantendo a rolagem da janela */
function tkRe(){const d=document.querySelector('#modal .dialog'),st=d?d.scrollTop:0;save();render();const n=document.querySelector('#modal .dialog');if(n)n.scrollTop=st}
function tkAtual(){return tkAcha(UI.tkSel?.tid,UI.tkSel?.kid)}
const tkItem=(k,cid,iid)=>{const c=k.checklists.find(x=>x.id===cid);return {c,i:c?.itens.find(x=>x.id===iid)}};
document.addEventListener('click',e=>{const a=e.target.closest('[data-a^="tkc-"],[data-a^="tkl-"],[data-a="tk-listas"],[data-a="tk-arqficha"],[data-a="tk-cheia"],[data-a="tk-nova"],[data-a="tk-abrir"]');if(!a)return;e.preventDefault();e.stopImmediatePropagation();const A=a.dataset.a;
  if(A==='tk-abrir'){UI.tkSel={tid:a.dataset.id,kid:a.dataset.tk};UI.tkEdCom=null;UI.tkCkNovo=false;UI.tkEtqNova=false;UI.tkPop=null;UI.tkItemNovo=null;UI.modal='tarefa';renderModal();return}
  if(A==='tk-nova'){UI.tkSel={tid:a.dataset.id||(UI.route==='terreno'?UI.id:null),lista:a.dataset.v||null};UI.modal='tarefa';renderModal();return}
  if(A==='tk-listas'){UI.tkSel={tid:a.dataset.id};UI.modal='tk-listas';renderModal();return}
  if(A==='tk-cheia'){tkTelaCheia();return}
  if(A==='tk-arqficha'){UI.tkArqFicha=!UI.tkArqFicha;render();return}
  if(A.startsWith('tkl-')){const t=T(UI.tkSel.tid),L=tkL(t),l=L.find(x=>x.id===a.dataset.v);if(!l)return;
    if(A==='tkl-oculta'){if(!l.oculta&&L.filter(x=>!x.oculta).length<2){toast('O quadro precisa de uma lista à mostra.',true);return}if(!l.oculta&&l.tipo==='conclui'&&!L.some(x=>x!==l&&x.tipo==='conclui'&&!x.oculta)){toast('Mantenha uma lista que conclui a tarefa à mostra.',true);return}
      l.oculta=!l.oculta;log(t,`Tarefa: lista ${l.nome} ${l.oculta?'ocultada':'à mostra'}`)}
    if(A==='tkl-sobe'){const i=L.indexOf(l);if(i>0){L.splice(i,1);L.splice(i-1,0,l)}}
    tkRe();return}
  const {t,k}=tkAtual();if(!k)return;const eu=me();
  switch(A){
    case 'tkc-concluir':if(!k.feita&&apPrecisa(k)){if(!apPend(k))apPedir(t,k);else toast('A tarefa está aguardando aprovação.');break}tkConcluir(t,k,!k.feita);break;
    case 'tkc-arq':k.arq=k.arq?null:HOJE;log(t,`Tarefa "${k.titulo}": ${k.arq?'arquivada':'restaurada'}`);toast(k.arq?'Tarefa arquivada.':'Tarefa restaurada.');break;
    case 'tkc-acomp':{const on=k.acomp.includes(eu);k.acomp=on?k.acomp.filter(u=>u!==eu):[...k.acomp,eu];toast(on?'Você deixou de acompanhar.':'Você vai ser avisado dos comentários e da conclusão.');break}
    case 'tkc-link':{const u=RT_BASE?location.origin+RT_BASE+'/tarefas/'+k.codigo:location.href.split('#')[0]+'#/tarefas/'+k.codigo;try{navigator.clipboard?.writeText(u)}catch(_){}toast(`Link de ${k.codigo} copiado.`);return}
    case 'tkc-tira':{const p=a.dataset.p;k[p]=k[p].filter(u=>u!==a.dataset.v);log(t,`Tarefa "${k.titulo}": ${a.dataset.v} saiu de ${PAPEIS_TK.find(x=>x[0]===p)[1].toLowerCase()}`);break}
    case 'tkc-etq':{const v=a.dataset.v,on=k.etq.includes(v);k.etq=on?k.etq.filter(x=>x!==v):[...k.etq,v];log(t,`Tarefa "${k.titulo}": etiqueta ${S.etiquetas.find(x=>x.id===v)?.nome} ${on?'tirada':'posta'}`);break}
    case 'tkc-etq-nova':UI.tkEtqNova=true;break;
    case 'tkc-pop':UI.tkPop=UI.tkPop===a.dataset.v?null:a.dataset.v;UI.tkEtqNova=false;break;
    case 'tkc-item-novo':UI.tkItemNovo=a.dataset.c;setTimeout(()=>document.querySelector(`[data-form="tkc-item"][data-c="${a.dataset.c}"] input[name=texto]`)?.focus(),0);break;
    case 'tkc-item-cancela':UI.tkItemNovo=null;break;
    case 'tkc-capa':k.capa=a.dataset.v||null;UI.tkPop=null;break;
    case 'tkc-ck-novo':UI.tkCkNovo=true;break;
    case 'tkc-ck-cancela':UI.tkCkNovo=false;break;
    case 'tkc-ck-x':{const c=k.checklists.find(x=>x.id===a.dataset.c);k.checklists=k.checklists.filter(x=>x!==c);log(t,`Tarefa "${k.titulo}": checklist ${c.nome} excluído`);break}
    case 'tkc-esconder':{const c=k.checklists.find(x=>x.id===a.dataset.c);c.esconder=!c.esconder;break}
    case 'tkc-item-x':{const {c,i}=tkItem(k,a.dataset.c,a.dataset.i);c.itens=c.itens.filter(x=>x!==i);break}
    case 'tkc-item-cartao':{const {i}=tkItem(k,a.dataset.c,a.dataset.i);const n=tkCriar(t,{titulo:i.texto,resp:i.resp,prazo:i.prazo,desc:`Veio do checklist de ${k.codigo} · ${k.titulo}`});
      n.anexos.push({id:uid(),tipo:'tarefa',nome:`${k.codigo} · ${k.titulo}`,ref:k.id});i.virou=n.id;if(!i.feito){i.feito=HOJE;i.feitoPor=eu}toast(`${n.codigo} criada a partir do item.`);break}
    case 'tkc-com-edita':UI.tkEdCom=a.dataset.v;break;
    case 'tkc-com-cancela':UI.tkEdCom=null;break;
    case 'tkc-com-apaga':{const c=k.coments.find(x=>x.id===a.dataset.v);c.apagado=true;log(t,`Tarefa "${k.titulo}": comentário apagado`);break}
    case 'tkc-reage':{const c=k.coments.find(x=>x.id===a.dataset.v),r=a.dataset.r;c.reacoes=c.reacoes||{};const q=c.reacoes[r]||[];c.reacoes[r]=q.includes(eu)?q.filter(u=>u!==eu):[...q,eu];break}
    case 'tkc-an-x':{const x=k.anexos.find(y=>y.id===a.dataset.v);x.removido=true;log(t,`Tarefa "${k.titulo}": anexo ${x.nome} tirado`);break}
  }tkRe()},true);
document.addEventListener('change',e=>{const el=e.target;
  if(el.dataset?.tkl==='nome'){const t=T(UI.tkSel.tid),l=tkL(t).find(x=>x.id===el.dataset.v),v=el.value.trim();if(!v||tkL(t).some(x=>x!==l&&x.nome===v)){toast(v?'Já existe uma lista com esse nome.':'A lista precisa de nome.',true);el.value=l.nome;return}
    e.stopImmediatePropagation();log(t,`Tarefa: lista ${l.nome} renomeada para ${v}`);l.nome=v;save();setTimeout(tkRe,0);return}
  const c=el.dataset?.tkc;if(!c||c==='dur'||c.startsWith('pred-'))return;e.stopImmediatePropagation();const {t,k}=tkAtual();if(!k)return;const v=el.type==='checkbox'?el.checked:el.value;
  if(c==='titulo'){if(!v.trim()){el.value=k.titulo;return}log(t,`Tarefa "${k.titulo}": título → ${v.trim()}`);k.titulo=v.trim()}
  else if(c==='desc'||c==='resultado'){const antes=(k.desc||'')+'\n'+(k.resultado||'');k[c]=v;mencionarTarefa(t,k,antes)}
  else if(c==='lista'){k.pos=Date.now();tkMover(t,k,v)}
  else if(c==='resp'){const antes={resp:k.resp};k.resp=v||null;notifTarefa(t,k,antes);log(t,`Tarefa "${k.titulo}": responsável ${k.resp||'nenhum'}`)}
  else if(c==='solic')k.solic=v||null;
  else if(c==='prio'){k.prio=v;log(t,`Tarefa "${k.titulo}": prioridade ${OPT.prioTar[v].toLowerCase()}`)}
  else if(c==='inicio'||c==='prazo'){if(crEditar(t,k,c,v)===false){el.value=k[c]||'';return}}
  else if(c.startsWith('add-')){const p=c.slice(4);if(!v)return;k[p]=[...new Set([...(k[p]||[]),v])];log(t,`Tarefa "${k.titulo}": ${v} em ${PAPEIS_TK.find(x=>x[0]===p)[1].toLowerCase()}`);
    if(p==='exec')notificar(v,'tarefa_atribuida',`${me()} incluiu você como executor: ${k.titulo}`,t,null,tkIr(k))}
  else if(c==='item-feito'){const {i}=tkItem(k,el.dataset.c,el.dataset.i);i.feito=v?HOJE:null;i.feitoPor=v?me():null}
  else if(c==='item-resp'){const {i}=tkItem(k,el.dataset.c,el.dataset.i);i.resp=v||null;if(v)notificar(v,'tarefa_atribuida',`Item para você em ${k.titulo}: ${i.texto}`,t,null,tkIr(k))}
  else if(c==='item-prazo'){const {i}=tkItem(k,el.dataset.c,el.dataset.i);i.prazo=v||null}
  else if(c==='ligar'){const o=t.tarefas.find(x=>x.id===v);if(!o)return;k.anexos.push({id:uid(),tipo:'tarefa',nome:`${o.codigo} · ${o.titulo}`,ref:o.id});UI.tkPop=null}
  // o change de texto chega no blur, no meio do clique em outro botão: refaz a tela depois dele
  save();setTimeout(tkRe,0)},true);
document.addEventListener('submit',e=>{const f=e.target,n=f.dataset?.form;if(!n||!(n.startsWith('tkc-')||n==='tkl-nova'||n==='tarefa-m'))return;e.preventDefault();e.stopImmediatePropagation();const F=Object.fromEntries(new FormData(f));
  if(n==='tarefa-m'){const sel=UI.tkSel,t=T(sel.tid||F.ter);if(!t){toast('Escolha o terreno da tarefa.',true);return}if(!F.titulo.trim())return;
    const l=tkL(t).find(x=>x.nome===F.lista&&!x.oculta)||tkPrim(t,'aberta');const k=tkCriar(t,{...F,lista:l.id});toast(`${k.codigo} criada.`);UI.tkSel={tid:t.id,kid:k.id};UI.modal='tarefa';tkRe();return}
  if(n==='tkl-nova'){const t=T(UI.tkSel.tid),v=F.nome.trim();if(tkL(t).some(x=>x.nome===v)){toast('Já existe uma lista com esse nome.',true);return}tkL(t).push({id:uid(),nome:v,tipo:F.tipo,oculta:false});log(t,`Tarefa: lista ${v} criada`);tkRe();return}
  const {t,k}=tkAtual();if(!k)return;const eu=me();
  if(n==='tkc-ck'){const c={id:uid(),nome:F.nome.trim(),esconder:false,itens:[]};k.checklists.push(c);UI.tkCkNovo=false;UI.tkItemNovo=c.id;setTimeout(()=>document.querySelector(`[data-form="tkc-item"][data-c="${c.id}"] input[name=texto]`)?.focus(),0);log(t,`Tarefa "${k.titulo}": checklist ${F.nome.trim()} criado`)}
  if(n==='tkc-item'){const c=k.checklists.find(x=>x.id===f.dataset.c);const i={id:uid(),texto:F.texto.trim(),resp:F.resp||null,prazo:F.prazo||null,feito:null};c.itens.push(i);
    if(i.resp)notificar(i.resp,'tarefa_atribuida',`Item para você em ${k.titulo}: ${i.texto}`,t,null,tkIr(k));setTimeout(()=>document.querySelector(`[data-form="tkc-item"][data-c="${c.id}"] input[name=texto]`)?.focus(),0)}
  if(n==='tkc-com'){const c={id:uid(),autor:eu,texto:F.texto.trim(),em:agora().slice(0,16).replace('T',' '),reacoes:{}};k.coments.push(c);mencionar(t,'',c.texto,`num comentário da tarefa: ${k.titulo}`,tkIr(k));
    tkAvisarAcomp(t,k,`${eu} comentou em ${k.titulo}`);log(t,`Tarefa "${k.titulo}": comentário de ${eu}`)}
  if(n==='tkc-com-ed'){const c=k.coments.find(x=>x.id===f.dataset.v);const antes=c.texto;c.texto=F.texto.trim();c.editado=true;UI.tkEdCom=null;mencionar(t,antes,c.texto,`num comentário da tarefa: ${k.titulo}`,tkIr(k))}
  if(n==='tkc-etq-nova'){const v=F.nome.trim();let x=S.etiquetas.find(y=>y.nome.toLowerCase()===v.toLowerCase());if(!x){x={id:uid(),nome:v,cor:F.cor};S.etiquetas.push(x)}if(!k.etq.includes(x.id))k.etq.push(x.id);UI.tkEtqNova=false}
  if(n==='tkc-anexo'){k.anexos.push({id:uid(),tipo:'link',nome:F.nome.trim(),url:F.url.trim()});UI.tkPop=null;log(t,`Tarefa "${k.titulo}": anexo ${F.nome.trim()}`)}
  tkRe()},true);

/* ---------- Configurações › Tarefas (administrador): listas padrão e etiquetas da empresa ---------- */
function cfgTarefasHtml(){const L=S.listasModelo,E=S.etiquetas;
  return `<section class="sec"><div class="sec-h"><h2>Listas padrão do quadro</h2></div><div class="sec-b"><p class="muted" style="margin-top:0">Valem para os terrenos novos; os quadros que já existem mantêm as suas listas.</p>
    ${L.map((l,i)=>`<div class="tkl-r ${l.ativo?'':'oculta'}"><input value="${esc(l.nome)}" data-tkcfg="nome" data-v="${l.id}" aria-label="Nome da lista ${i+1}">
      <select data-tkcfg="tipo" data-v="${l.id}" aria-label="Tipo de ${esc(l.nome)}">${Object.entries(TIPO_LISTA).map(([x,n])=>`<option value="${x}" ${x===l.tipo?'selected':''}>${n}</option>`).join('')}</select>
      <button class="iconbtn sm" data-a="tkcfg-sobe" data-v="${l.id}" ${i?'':'disabled'} aria-label="Subir ${esc(l.nome)}" title="Subir">${ic('chev',18)}</button>
      <button class="btn text sm" data-a="tkcfg-ativo" data-v="${l.id}">${l.ativo?'Desativar':'Ativar'}</button></div>`).join('')}
    <form class="tkm-nf" data-form="tkcfg-lista"><input name="nome" required placeholder="Nova lista" aria-label="Nome da nova lista padrão"><select name="tipo" aria-label="Tipo">${Object.entries(TIPO_LISTA).map(([x,n])=>`<option value="${x}">${n}</option>`).join('')}</select><button class="btn tonal sm" type="submit">Adicionar lista</button></form></div></section>
  <section class="sec"><div class="sec-h"><h2>Etiquetas da empresa</h2></div><div class="sec-b">
    ${E.map(e=>`<div class="tkl-r">${etqChip(e)}<input value="${esc(e.nome)}" data-tkcfg="etq-nome" data-v="${e.id}" aria-label="Nome da etiqueta"><select data-tkcfg="etq-cor" data-v="${e.id}" aria-label="Cor de ${esc(e.nome)}">${Object.entries(ETQ_CORES).map(([c,n])=>`<option value="${c}" ${c===e.cor?'selected':''}>${n}</option>`).join('')}</select></div>`).join('')}
    <form class="tkm-nf" data-form="tkcfg-etq"><input name="nome" required placeholder="Nova etiqueta" aria-label="Nome da nova etiqueta"><select name="cor" aria-label="Cor">${Object.entries(ETQ_CORES).map(([c,n])=>`<option value="${c}">${n}</option>`).join('')}</select><button class="btn tonal sm" type="submit">Adicionar etiqueta</button></form></div></section>${apCfgHtml()}${crCfgHtml()}`}
const tkCfgOk=L=>L.some(l=>l.ativo&&l.tipo==='conclui');
document.addEventListener('click',e=>{const a=e.target.closest('[data-a^="tkcfg-"]');if(!a)return;e.preventDefault();e.stopImmediatePropagation();const L=S.listasModelo,l=L.find(x=>x.id===a.dataset.v);if(!l)return;
  if(a.dataset.a==='tkcfg-sobe'){const i=L.indexOf(l);L.splice(i,1);L.splice(i-1,0,l)}
  if(a.dataset.a==='tkcfg-ativo'){l.ativo=!l.ativo;if(!tkCfgOk(L)){l.ativo=true;toast('O modelo precisa de uma lista que conclui a tarefa.',true);return}}
  save();render()},true);
document.addEventListener('change',e=>{const el=e.target,c=el.dataset?.tkcfg;if(!c)return;e.stopImmediatePropagation();
  if(c.startsWith('etq-')){const x=S.etiquetas.find(y=>y.id===el.dataset.v);if(c==='etq-nome'){if(!el.value.trim()){el.value=x.nome;return}x.nome=el.value.trim()}else x.cor=el.value}
  else{const l=S.listasModelo.find(x=>x.id===el.dataset.v),ant=l[c];l[c]=c==='nome'?el.value.trim()||ant:el.value;if(!tkCfgOk(S.listasModelo)){l[c]=ant;toast('O modelo precisa de uma lista que conclui a tarefa.',true)}}
  save();render()},true);
document.addEventListener('submit',e=>{const f=e.target,n=f.dataset?.form;if(n!=='tkcfg-lista'&&n!=='tkcfg-etq')return;e.preventDefault();e.stopImmediatePropagation();const F=Object.fromEntries(new FormData(f)),v=F.nome.trim();
  if(n==='tkcfg-lista')S.listasModelo.push({id:uid(),nome:v,tipo:F.tipo,ativo:true});else S.etiquetas.push({id:uid(),nome:v,cor:F.cor});save();render()},true);
tkPrep();
