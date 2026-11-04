/* =====================================================================
   Visibilidade por cartão (bloco 3; decisões do Moisés, 29/out/2026).
   Espelha fluxo.papel_cartao, fluxo.tarefa_acessos e fluxo.grupos.
   Ao criar, a pessoa escolhe Público, Individual ou Restrito (o
   formulário vem marcado com a última escolha dela). Acima de tudo vale o
   teto do terreno: quem não vê o terreno não vê os cartões dele (hoje,
   todos da empresa veem todos os terrenos; os perfis de acesso virão).
   Público: todos que veem o terreno, com o papel do sistema, que o cartão
   pode subir. Individual: só quem criou (e o administrador do sistema; o
   diretor não). Restrito: quem criou, quem está no cartão, as pessoas e
   os grupos liberados e o diretor; exceção tira uma pessoa de um grupo.
   Papel no cartão: Leitor, Comentarista, Editor, Administrador, que pode
   passar o do sistema. Quem dá acesso: administrador do cartão, do
   sistema ou diretor. Injetado no mesmo escopo do protótipo.
   ===================================================================== */
const VZ_N={publico:'Público',individual:'Individual',restrito:'Restrito'};
const VZ_D={publico:'Todos que veem o terreno',individual:'Só você',restrito:'Só quem você liberar e quem está no cartão'};
const VZ_IC={publico:'olho',individual:'lock',restrito:'lock'};
const PAPEL_C={leitor:'Leitor',comentarista:'Comentarista',editor:'Editor',administrador:'Administrador'};
function vzNiv(p){return ({leitor:1,comentarista:2,editor:3,administrador:4})[p]||0}
function vzVis(k){return k.vis||'publico'}
function vzCriador(k){return k.criadoPor||k.solic||k.resp}
function vzGrupos(){return S.grupos||(S.grupos=[])}
function vzGrupo(id){return vzGrupos().find(g=>g.id===id)}
function vzEnv(k,u){return u===k.resp||u===k.solic||['exec','aprov','acomp'].some(p=>(k[p]||[]).includes(u))}
/* o papel de quem está usando no cartão; nulo = não vê */
function vzPapel(t,k,u=me()){if(ehAdmin(u))return 'administrador';if(vzCriador(k)===u)return 'administrador';const v=vzVis(k);if(v==='individual')return null;
  const sis=nivelDe(u)>=1?'editor':'leitor',ac=k.acessos||[],exc=ac.some(a=>a.u===u&&a.excl);
  const dir=ac.find(a=>a.u===u&&!a.excl),gr=ac.filter(a=>a.g&&!exc&&(vzGrupo(a.g)?.membros||[]).includes(u)).sort((a,b)=>vzNiv(b.papel)-vzNiv(a.papel))[0];
  const card=dir?dir.papel:gr?.papel;
  if(v==='publico')return vzNiv(card)>vzNiv(sis)?card:sis;
  if(card)return card;if(vzEnv(k,u))return 'editor';if(membro(u).papel==='diretor')return 'editor';return null}
function vzVe(t,k){return !!vzPapel(t,k)}
function vzEdita(t,k){return vzNiv(vzPapel(t,k))>=3}
function vzComenta(t,k){return vzNiv(vzPapel(t,k))>=2}
function vzGerencia(t,k){const p=vzPapel(t,k);return p==='administrador'||(!!p&&membro(me()).papel==='diretor')}
function vzTarefas(t){return (t.tarefas||[]).filter(k=>vzVe(t,k))}
/* individual com outra pessoa no cartão vira restrito, com ela */
function vzAjustar(t,k){if(vzVis(k)!=='individual')return;const c=vzCriador(k),o=[k.resp,k.solic,...['exec','aprov','acomp'].flatMap(p=>k[p]||[])].find(u=>u&&u!==c);
  if(!o)return;k.vis='restrito';setTimeout(save,0);log(t,`Tarefa "${k.titulo}": passou a Restrito, porque ${o} está no cartão`);toast(`O cartão passou a Restrito: ${o} está nele e passa a vê-lo.`)}
function vzAcessosNovos(d){return d.acessos?d.acessos.map(a=>({...a,id:uid()})):(d.vis==='restrito'?(d.lib||[]):[]).map(x=>x.startsWith('g:')?{id:uid(),g:x.slice(2),papel:'editor'}:{id:uid(),u:x,papel:'editor'})}
function vzLembrar(v){if(!v)return;S.vzUlt={...(S.vzUlt||{}),[me()]:v}}
const vzOpcoes=(sel='')=>`<optgroup label="Pessoas">${(S.membros||[]).map(m=>`<option value="${esc(m.nome)}" ${sel===m.nome?'selected':''}>${esc(m.nome)}</option>`).join('')}</optgroup>
  ${vzGrupos().filter(g=>g.ativo!==false).length?`<optgroup label="Grupos">${vzGrupos().filter(g=>g.ativo!==false).map(g=>`<option value="g:${g.id}">${esc(g.nome)}</option>`).join('')}</optgroup>`:''}`;

/* ---------- nova tarefa: escolha obrigatória, marcada com a última da pessoa ---------- */
function vzNovaHtml(){const ult=(S.vzUlt||{})[me()];
  return `<fieldset class="field full vz-esc"><legend>Visibilidade</legend><div class="vz-ops">${Object.keys(VZ_N).map(v=>`<label class="vz-op"><input type="radio" name="vis" value="${v}" required ${ult===v?'checked':''}><span class="vz-opt">${ic(VZ_IC[v],16)}<b>${VZ_N[v]}</b></span><span class="faint">${VZ_D[v]}</span></label>`).join('')}</div>
    <div class="vz-lib"><span class="vz-libt">Liberar para</span><div class="vz-libl">${(S.membros||[]).filter(m=>m.nome!==me()).map(m=>`<label class="chk"><input type="checkbox" name="lib" value="${esc(m.nome)}">${av(m.nome,'sm')} ${esc(m.nome)}</label>`).join('')}
      ${vzGrupos().filter(g=>g.ativo!==false).map(g=>`<label class="chk"><input type="checkbox" name="lib" value="g:${g.id}"><span class="vz-gi">${ic('board',14)}</span> ${esc(g.nome)}</label>`).join('')}</div>
      <span class="faint">Quem estiver no cartão (responsável, executores, aprovadores e quem acompanha) também vê. O diretor e o administrador também.</span></div></fieldset>`}

/* ---------- no cartão ---------- */
function vzDetHtml(t,k){const v=vzVis(k),g=vzGerencia(t,k)&&!k.arq,dentro=`${ic(VZ_IC[v],16)}${VZ_N[v]}`;
  return `<div class="tkm-d"><span class="tkm-dl">Visibilidade</span><div class="tkm-dv">${g?`<button class="tkm-pill vz-pill" data-a="vz-abrir" aria-expanded="${UI.vzAberto===k.id}" title="Quem vê o cartão">${dentro}</button>`:`<span class="tkm-pill vz-pill" title="${esc(VZ_D[v])}">${dentro}</span>`}</div></div>`}
function vzBlocoHtml(t,k){if(UI.vzAberto!==k.id||!vzGerencia(t,k))return '';const v=vzVis(k),ac=k.acessos||[],lib=ac.filter(a=>!a.excl),exc=ac.filter(a=>a.excl);
  const nome=a=>a.g?`<span class="vz-gi">${ic('board',14)}</span>${esc(vzGrupo(a.g)?.nome||'Grupo')}`:`${av(a.u,'sm')}${esc(a.u)}`;
  const env=[...new Set([vzCriador(k),k.resp,k.solic,...['exec','aprov','acomp'].flatMap(p=>k[p]||[])].filter(Boolean))];
  const gruposLib=lib.filter(a=>a.g).flatMap(a=>vzGrupo(a.g)?.membros||[]).filter((u,i,arr)=>arr.indexOf(u)===i&&!exc.some(x=>x.u===u));
  return `<div class="tkm-bloco vz-bloco">${tkSecH('lock','Quem vê este cartão',`<button class="tkm-btn" data-a="vz-abrir">Fechar</button>`)}<div class="tkm-in">
    <div class="vz-ops vz-ops-c" role="radiogroup" aria-label="Visibilidade">${Object.keys(VZ_N).map(x=>`<button class="vz-op ${x===v?'on':''}" data-a="vz-vis" data-v="${x}" role="radio" aria-checked="${x===v}" ${x==='individual'&&membro(me()).nome!==vzCriador(k)&&!ehAdmin(me())?'disabled title="Só quem criou deixa o cartão individual"':''}><span class="vz-opt">${ic(VZ_IC[x],16)}<b>${VZ_N[x]}</b></span><span class="faint">${x==='individual'?'Só quem criou':VZ_D[x]}</span></button>`).join('')}</div>
    ${v==='individual'?`<p class="faint vz-nota">Só ${esc(vzCriador(k))} vê, e o administrador do sistema. Pôr outra pessoa no cartão o torna restrito.</p>`
    :`<div class="vz-l">${v==='restrito'?`<div class="vz-r"><span class="vz-rn">${env.map(u=>av(u,'sm')).join('')}<span>No cartão</span></span><span class="faint">Editor</span><span></span></div>`:''}
      ${lib.map(a=>`<div class="vz-r"><span class="vz-rn">${nome(a)}</span><select data-ch="vz-papel" data-v="${a.id}" aria-label="Papel de ${esc(a.u||vzGrupo(a.g)?.nome)}">${Object.entries(PAPEL_C).map(([p,n])=>`<option value="${p}" ${a.papel===p?'selected':''}>${n}</option>`).join('')}</select><button class="iconbtn sm" data-a="vz-tira" data-v="${a.id}" aria-label="Tirar o acesso" title="Tirar o acesso">${ic('close',16)}</button></div>`).join('')}
      ${exc.map(a=>`<div class="vz-r vz-exc"><span class="vz-rn">${nome(a)}</span><span class="faint">Fora, mesmo no grupo</span><button class="iconbtn sm" data-a="vz-tira" data-v="${a.id}" aria-label="Desfazer a exceção" title="Desfazer a exceção">${ic('close',16)}</button></div>`).join('')}</div>
      <form class="tkm-nf vz-add" data-form="vz-add"><select name="quem" required aria-label="Pessoa ou grupo"><option value="">${v==='publico'?'Dar um papel a mais a…':'Liberar para…'}</option>${vzOpcoes()}</select><select name="papel" aria-label="Papel">${Object.entries(PAPEL_C).map(([p,n])=>`<option value="${p}" ${p==='editor'?'selected':''}>${n}</option>`).join('')}</select><button class="tkm-ok" type="submit">Adicionar</button></form>
      ${v==='restrito'&&gruposLib.length?`<form class="tkm-nf vz-add" data-form="vz-exc"><select name="quem" required aria-label="Pessoa do grupo"><option value="">Tirar do grupo…</option>${gruposLib.map(u=>`<option>${esc(u)}</option>`).join('')}</select><button class="tkm-btn" type="submit">Tirar</button></form>`:''}
      <p class="faint vz-nota">${v==='publico'?'Todos que veem o terreno veem o cartão, com o papel que têm no sistema; aqui dá para subir o papel de alguém (Leitura como Editor, por exemplo).':'O diretor e o administrador do sistema também veem. O papel dado aqui vale mesmo acima do papel no sistema.'}</p>`}
  </div></div>`}
function vzSelo(k){return vzVis(k)==='publico'?'':`<span class="tk-b" title="${VZ_N[vzVis(k)]}">${ic('lock',14)}</span>`}

/* ---------- Configurações › Equipe: grupos ---------- */
function vzGruposCfgHtml(){const G=vzGrupos(),M=S.membros||[];
  return `<section class="sec" style="margin-top:16px"><div class="sec-h"><h2>Grupos</h2></div><div class="sec-b">
    <p class="faint" style="margin:0 0 12px">Para liberar cartões restritos a um grupo de uma vez.</p>
    ${G.map(g=>`<div class="vz-g ${g.ativo===false?'oculta':''}"><div class="vz-gh"><b>${esc(g.nome)}</b><span class="faint">${g.membros.length} pessoa${g.membros.length===1?'':'s'}</span><button class="linkbtn" data-a="vz-g-ativo" data-v="${g.id}">${g.ativo===false?'Reativar':'Desativar'}</button></div>
      <div class="vz-libl">${M.map(m=>`<label class="chk"><input type="checkbox" data-ch="vz-gm" data-g="${g.id}" value="${esc(m.nome)}" ${g.membros.includes(m.nome)?'checked':''}>${av(m.nome,'sm')} ${esc(m.nome)}</label>`).join('')}</div></div>`).join('')}
    <form class="tkm-nf" data-form="vz-g-novo" style="margin-top:12px"><input name="nome" required placeholder="Nome do grupo (ex.: Jurídico)" aria-label="Nome do grupo"><button class="btn tonal sm" type="submit">Criar grupo</button></form></div></section>`}

document.addEventListener('click',e=>{const a=e.target.closest('[data-a^="vz-"]');if(!a)return;e.preventDefault();e.stopImmediatePropagation();
  if(a.dataset.a==='vz-g-ativo'){const g=vzGrupo(a.dataset.v);g.ativo=g.ativo===false;toast(g.ativo?'Grupo reativado.':'Grupo desativado.');save();render();return}
  const {t,k}=tkAtual();if(!k)return;
  switch(a.dataset.a){
    case 'vz-abrir':UI.vzAberto=UI.vzAberto===k.id?null:k.id;break;
    case 'vz-vis':{const v=a.dataset.v;if(!vzGerencia(t,k)||v===vzVis(k))break;if(v==='individual'&&vzCriador(k)!==me()&&!ehAdmin(me()))break;
      const antes=vzVis(k);k.vis=v;vzAjustar(t,k);log(t,`Tarefa "${k.titulo}": visibilidade de ${VZ_N[antes]} para ${VZ_N[vzVis(k)]}`);break}
    case 'vz-tira':{const x=(k.acessos||[]).find(y=>y.id===a.dataset.v);k.acessos=(k.acessos||[]).filter(y=>y!==x);if(x)log(t,`Tarefa "${k.titulo}": ${x.excl?'exceção desfeita para '+x.u:'acesso tirado de '+(x.u||vzGrupo(x.g)?.nome)}`);break}
  }tkRe()},true);
document.addEventListener('change',e=>{const el=e.target,c=el.dataset?.ch;if(c!=='vz-papel'&&c!=='vz-gm')return;e.stopImmediatePropagation();
  if(c==='vz-gm'){const g=vzGrupo(el.dataset.g);g.membros=el.checked?[...g.membros,el.value]:g.membros.filter(u=>u!==el.value);save();toast('Grupo atualizado.');return}
  const {t,k}=tkAtual(),x=(k?.acessos||[]).find(y=>y.id===el.dataset.v);if(!x)return;x.papel=el.value;log(t,`Tarefa "${k.titulo}": ${x.u||vzGrupo(x.g)?.nome} agora é ${PAPEL_C[x.papel]}`);tkRe()},true);
document.addEventListener('submit',e=>{const f=e.target,n=f.dataset?.form;if(n!=='vz-add'&&n!=='vz-exc'&&n!=='vz-g-novo')return;e.preventDefault();e.stopImmediatePropagation();const F=Object.fromEntries(new FormData(f));
  if(n==='vz-g-novo'){const nm=F.nome.trim();if(vzGrupos().some(g=>g.nome===nm)){toast('Já existe um grupo com esse nome.',true);return}vzGrupos().push({id:uid(),nome:nm,ativo:true,membros:[]});toast(`Grupo ${nm} criado.`);save();render();return}
  const {t,k}=tkAtual();if(!k||!vzGerencia(t,k))return;k.acessos=k.acessos||[];
  if(n==='vz-exc'){k.acessos=k.acessos.filter(a=>a.u!==F.quem);k.acessos.push({id:uid(),u:F.quem,excl:true});log(t,`Tarefa "${k.titulo}": ${F.quem} fora do cartão, mesmo no grupo`);tkRe();return}
  const g=F.quem.startsWith('g:')?F.quem.slice(2):null,u=g?null:F.quem;k.acessos=k.acessos.filter(a=>!(g?a.g===g:a.u===u));
  k.acessos.push({id:uid(),...(g?{g}:{u}),papel:F.papel});log(t,`Tarefa "${k.titulo}": ${u||vzGrupo(g)?.nome} com acesso de ${PAPEL_C[F.papel]}`);tkRe()},true);

/* exemplo: grupos, um cartão individual do Rafael e um restrito ao Jurídico */
(()=>{if(S.vzExemplo)return;S.vzExemplo=true;
  S.grupos=[{id:uid(),nome:'Jurídico',ativo:true,membros:['Camila Torres','Lúcia Mendes']},{id:uid(),nome:'Diretoria',ativo:true,membros:['Moisés']}];
  const t=S.terrenos[0];if(!t||!t.tarefas)return;
  const ind=tkCriar(t,{titulo:'Rascunho da contraproposta',prazo:addD(HOJE,4)});Object.assign(ind,{criadoPor:'Rafael Souza',solic:'Rafael Souza',resp:'Rafael Souza',vis:'individual'});
  const r=t.tarefas.find(x=>x.titulo==='Pedir certidão de uso do solo');
  if(r){r.vis='restrito';r.criadoPor='Ana Prado';r.acessos=[{id:uid(),g:S.grupos[0].id,papel:'editor'}]}})();
