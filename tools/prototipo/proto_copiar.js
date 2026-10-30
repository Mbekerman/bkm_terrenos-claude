/* =====================================================================
   Copiar cartão e modelo de cartão (bloco 4; 30/out/2026). Espelha
   fluxo.copiar_tarefa e tarefas.modelo.
   - Copiar (Ações do cartão): título, terreno e lista aberta de destino e
     o que vai junto (checklists em aberto, etiquetas, pessoas, campos,
     anexos). Quem copia passa a ser quem criou e quem pediu; visibilidade
     e acessos vão juntos; datas, comentários, horas e aprovações não.
   - Modelo de cartão: "Tornar modelo" deixa o cartão no quadro como base,
     com o selo Modelo; não conclui nem atrasa; "Usar este modelo" copia.
     Na Nova tarefa, "Usar um modelo" lista os modelos que a pessoa vê.
   Injetado no mesmo escopo.
   ===================================================================== */
const CX_ITENS={checklists:'Checklists',etiquetas:'Etiquetas',pessoas:'Pessoas',campos:'Campos personalizados',anexos:'Anexos',automacoes:'Automações do cartão'};
function cxModelos(){return todasTarefas().filter(({k})=>k.modelo&&!k.arq)}
function cxCopiar(t,k,dest,lid,titulo,itens){const l=tkL(dest).find(x=>x.id===lid&&x.tipo==='aberta');if(!l){toast('A cópia vai para uma lista aberta.',true);return null}
  const tem=x=>itens.includes(x),eu=me();
  const n=tkNorm(dest,{id:uid(),titulo:(titulo||'').trim()||k.titulo,desc:k.desc||'',resultado:'',resp:tem('pessoas')?k.resp:null,solic:eu,criadoPor:eu,vis:k.vis||'publico',acessos:JSON.parse(JSON.stringify(k.acessos||[])),
    prazo:null,prio:k.prio,capa:k.capa||null,apModo:k.apModo,lista:l.id,pos:Date.now(),estim:k.estim||null,
    exec:tem('pessoas')?[...(k.exec||[])]:[],aprov:tem('pessoas')?[...(k.aprov||[])]:[],acomp:tem('pessoas')?[...(k.acomp||[])]:[],etq:tem('etiquetas')?[...(k.etq||[])]:[],
    checklists:tem('checklists')?(k.checklists||[]).map(c=>({id:uid(),nome:c.nome,esconder:c.esconder,itens:c.itens.filter(i=>!i.virou).map(i=>({id:uid(),texto:i.texto,resp:tem('pessoas')?i.resp:null,prazo:null,feito:null}))})):[],
    campos:tem('campos')?Object.fromEntries(Object.entries(k.campos||{}).filter(([cid,v])=>{const c=cpoCampos().find(x=>x.id===cid);return c&&c.ativo!==false&&(c.tipo!=='lista'||(c.opcoes||[]).some(o=>o.id===v&&o.ativo!==false))})):{},
    anexos:tem('anexos')?(k.anexos||[]).filter(a=>!a.removido).map(a=>({...a,id:uid()})):[]});
  vzAjustar(dest,n);dest.tarefas.push(n);notifTarefa(dest,n,null);log(dest,`Tarefa criada como cópia de ${k.codigo}${k.modelo?' (modelo)':''}: ${n.titulo}`);return n}
/* quadro de copiar (popover da coluna de ações) */
function cxPopHtml(t,k){const f=UI.cx||(UI.cx={ter:t.id,lista:null,itens:Object.keys(CX_ITENS)}),dest=T(f.ter)||t,abertas=tkL(dest).filter(l=>l.tipo==='aberta'&&!l.oculta);
  const lv=abertas.some(l=>l.id===f.lista)?f.lista:(abertas.find(l=>l.id===k.lista)||abertas[0])?.id;
  return `<div class="tkm-pop cx-pop" role="group" aria-label="${k.modelo?'Usar este modelo':'Copiar cartão'}"><div class="tkm-poph">${k.modelo?'Usar este modelo':'Copiar cartão'}<button class="iconbtn sm" data-a="tkc-pop" data-v="copiar" aria-label="Fechar">${ic('close',16)}</button></div>
    <form class="tkm-nf vert" data-form="cx-copiar"><label class="cx-l" for="cx-t">Título</label><textarea id="cx-t" name="titulo" rows="2" required>${esc(f.titulo??k.titulo)}</textarea>
      <span class="cx-l">Manter</span>${Object.entries(CX_ITENS).map(([x,n])=>`<label class="chk"><input type="checkbox" name="it" value="${x}" ${f.itens.includes(x)?'checked':''}>${n}</label>`).join('')}
      <label class="cx-l" for="cx-ter">Terreno</label><select id="cx-ter" class="tkm-pill" data-cx="ter">${ativosBanco().filter(x=>x.tarefas).map(x=>`<option value="${x.id}" ${x.id===dest.id?'selected':''}>${x.codigo} · ${esc(x.nome)}</option>`).join('')}</select>
      <label class="cx-l" for="cx-l">Lista</label><select id="cx-l" name="lista" class="tkm-pill">${abertas.map(l=>`<option value="${l.id}" ${l.id===lv?'selected':''}>${esc(l.nome)}</option>`).join('')}</select>
      <button class="tkm-ok" type="submit">Criar cartão</button></form></div>`}
/* faixa do modelo dentro do cartão */
function cxFaixa(t,k,ro){return k.modelo?`<div class="cx-faixa">${ic('doc',18)}<span>Este cartão é um <b>modelo</b>: fica no quadro como base e não se conclui.</span>${ro?'':`<button class="tkm-ok" data-a="tkc-pop" data-v="copiar">Usar este modelo</button>`}</div>`:''}
function cxSelo(k){return k.modelo?`<span class="tk-b cx-selo" title="Modelo de cartão">${ic('doc',14)}Modelo</span>`:''}
function cxBotoes(t,k,ro,b){if(ro||k.arq)return '';return b('tkc-pop','doc',k.modelo?'Usar este modelo':'Copiar',`data-v="copiar" aria-expanded="${UI.tkPop==='copiar'}"`)+(UI.tkPop==='copiar'?cxPopHtml(t,k):'')+
  (k.rec||k.serie?'':b('cx-modelo','board',k.modelo?'Desfazer modelo':'Tornar modelo'))}
/* Nova tarefa: começar de um modelo */
function cxNovaHtml(){const M=cxModelos();if(!M.length)return '';
  return `<div class="field full"><label for="tm-mod">Usar um modelo</label><select id="tm-mod" data-cx="modelo"><option value="">Sem modelo</option>${M.map(({k,t})=>`<option value="${t.id}|${k.id}">${esc(k.titulo)} · ${t.codigo}</option>`).join('')}</select></div>`}

document.addEventListener('change',e=>{const el=e.target;if(!el.dataset?.cx)return;e.stopImmediatePropagation();
  if(el.dataset.cx==='ter'){UI.cx.ter=el.value;UI.cx.lista=null;const f=el.closest('form');UI.cx.itens=[...f.querySelectorAll('[name=it]:checked')].map(x=>x.value);UI.cx.titulo=f.querySelector('[name=titulo]').value;tkRe();
    const tt=document.querySelector('#cx-t');if(tt&&UI.cx.titulo!=null)tt.value=UI.cx.titulo;return}
  if(el.dataset.cx==='modelo'&&el.value){const [tid,kid]=el.value.split('|'),dest=UI.tkSel?.tid||document.querySelector('#tm-ter')?.value||tid;
    UI.tkSel={tid,kid};UI.tkPop='copiar';UI.cx={ter:dest,lista:null,itens:Object.keys(CX_ITENS)};UI.modal='tarefa';renderModal()}},true);
document.addEventListener('click',e=>{const a=e.target.closest('[data-a="cx-modelo"]');if(!a)return;e.preventDefault();e.stopImmediatePropagation();const {t,k}=tkAtual();if(!k||!vzEdita(t,k))return;
  if(!k.modelo&&k.feita){toast('Reabra a tarefa antes de torná-la modelo.',true);return}
  UI.tkPop=null;k.modelo=!k.modelo;log(t,`Tarefa "${k.titulo}": ${k.modelo?'virou modelo de cartão':'deixou de ser modelo'}`);toast(k.modelo?'Agora é um modelo: use "Usar este modelo" para criar cartões a partir dele.':'Voltou a ser um cartão comum.');tkRe()},true);
document.addEventListener('submit',e=>{const f=e.target;if(f.dataset?.form!=='cx-copiar')return;e.preventDefault();e.stopImmediatePropagation();const {t,k}=tkAtual();if(!k)return;
  const dest=T(UI.cx?.ter)||t;if(!tkEd()){toast('Você não cria tarefas.',true);return}
  const n=cxCopiar(t,k,dest,f.querySelector('[name=lista]').value,f.querySelector('[name=titulo]').value,[...f.querySelectorAll('[name=it]:checked')].map(x=>x.value));if(!n)return;
  UI.cx=null;UI.tkPop=null;UI.tkSel={tid:dest.id,kid:n.id};save();render();toast(`Cartão ${n.codigo} criado${dest.id!==t.id?` em ${dest.codigo}`:''}.`)},true);

/* exemplo: um modelo de cartão no primeiro terreno */
(()=>{if(S.cxExemplo)return;S.cxExemplo=true;const t=S.terrenos?.[0];if(!t?.tarefas)return;const etq=S.etiquetas?.find(e=>e.nome==='Jurídico');
  t.tarefas.push(tkNorm(t,{id:uid(),titulo:'Pedir certidões do imóvel',desc:'Certidões da matrícula e do proprietário para a diligência.',resultado:'',resp:null,solic:'Ana Prado',criadoPor:'Ana Prado',vis:'publico',acessos:[],prazo:null,prio:'media',
    lista:tkPrim(t,'aberta').id,pos:1,modelo:true,etq:etq?[etq.id]:[],estim:180,checklists:[{id:uid(),nome:'Certidões',esconder:false,itens:['Matrícula atualizada','Ônus reais','Ações reais e pessoais','Débitos de IPTU'].map(x=>({id:uid(),texto:x,resp:null,prazo:null,feito:null}))}]}))})();
