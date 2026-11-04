/* =====================================================================
   SLA com pausa aprovada (bloco 3; decisões do Moisés, 29/out/2026).
   Espelha o banco (fluxo.pausas, fluxo.pausar, fluxo.decidir_pausa,
   fluxo.retomar, fluxo.v_tarefa_sla):
   - o prazo que conta é o do cartão; pausada, a tarefa não fica atrasada;
   - Pausar (botão ou levar para a lista de pausa) pede o motivo; quem
     aprova é o nível escolhido pelo administrador (ninguém, gestor ou
     diretor; padrão gestor): um superior de quem pediu com o nível, ou o
     administrador; quem já tem o nível pausa direto;
   - aprovada, o cartão vai para a lista de pausa; Retomar volta para a lista
     de antes e empurra o prazo pelos dias pausados (o cronograma leva as
     sucessoras junto); concluir uma pausada encerra a pausa;
   - no cartão: dias aberta, dias pausada e tempo líquido.
   Injetado no mesmo escopo do protótipo, depois de proto_aprovacao.js.
   ===================================================================== */
const PZ_NIVEL={ninguem:0,gestor:2,diretor:3};
const pzRegra=()=>S.tkRegras?.pausa||'gestor';
const pzPausas=k=>k.pausas||(k.pausas=[]);
const pzAtiva=k=>(k.pausas||[]).find(z=>z.sit==='ativa');
const pzPend=k=>(k.pausas||[]).find(z=>z.sit==='pendente');
const pzAprova=(u,pedinte)=>{const n=PZ_NIVEL[pzRegra()];return n===0||ehAdmin(u)||(nivelDe(u)>=n&&(u===pedinte||ehSuperior(u,pedinte)))};
const pzListaPausa=t=>tkL(t).find(l=>l.tipo==='pausa'&&!l.oculta)||tkL(t).find(l=>l.tipo==='pausa');
const pzDias=(de,ate)=>{if(!de)return 0;if(!crUteis())return Math.max(0,crDias(de,ate));let n=0,x=de;while(x<ate){if(crUtil(x))n++;x=addD(x,1)}return n};
function pzSla(k){const ini=k.criadoEm||k.inicio||HOJE,fim=k.feita||HOJE,aberta=Math.max(0,crDias(ini,fim));
  const p0=(k.pausas||[]).filter(z=>z.ini).reduce((s,z)=>s+Math.max(0,crDias(z.ini.slice(0,10),(z.fim||agora()).slice(0,10))),0),pausada=Math.min(p0,aberta);return {aberta,pausada,liq:aberta-pausada}}
function pzMover(t,k,lid){UI.pzMovendo=true;try{k.lista=lid;k.pos=Date.now()}finally{UI.pzMovendo=false}}
function pzIniciar(t,k,z){const l=pzListaPausa(t);if(!l){toast('O quadro não tem lista de pausa.',true);return}
  z.sit='ativa';z.ini=agora();z.listaAnt=k.lista;z.decPor=z.decPor||me();z.decEm=z.decEm||agora();pzMover(t,k,l.id);log(t,`Tarefa "${k.titulo}": pausada (${z.motivo})`)}
function pzPausar(t,k,motivo){if(!motivo?.trim()){toast('Diga por que a tarefa vai pausar.',true);return false}
  if(k.feita||k.arq){toast('A tarefa já está concluída ou arquivada.',true);return false}if(pzAtiva(k)){toast('A tarefa já está pausada.',true);return false}
  const p=pzPend(k);if(p){p.sit='cancelada';p.decEm=agora()}const eu=me(),z={id:uid(),sit:'pendente',motivo:motivo.trim(),por:eu,em:agora()};pzPausas(k).push(z);
  if(pzAprova(eu,eu)){pzIniciar(t,k,z);toast('Tarefa pausada. O prazo para de contar.')}
  else{const n=PZ_NIVEL[pzRegra()],g=aprovadorPrevisto(eu,n)||(n<3?aprovadorPrevisto(eu,3):null);if(g)notificar(g,'aprovacao_pendente',`Aprovar a pausa de ${k.titulo}: ${z.motivo}`,t,z.id,tkIr(k));
    log(t,`Tarefa "${k.titulo}": pausa pedida (${z.motivo})`);toast(g?`Pausa pedida para ${g} aprovar.`:'Pausa pedida.')}return true}
function pzDecidir(t,k,aprovar,motivo){const z=pzPend(k),eu=me();if(!z)return false;
  if(!pzAprova(eu,z.por)||eu===z.por){toast('Você não decide esta pausa.',true);return false}
  if(!aprovar&&!motivo?.trim()){toast('Diga por que a pausa foi recusada.',true);return false}
  z.decPor=eu;z.decEm=agora();z.decMotivo=motivo?.trim()||null;
  if(aprovar){pzIniciar(t,k,z);toast('Pausa aprovada.')}else{z.sit='recusada';log(t,`Tarefa "${k.titulo}": pausa recusada (${z.decMotivo})`);toast('Pausa recusada.')}
  [z.por,k.resp].filter((u,i,x)=>u&&x.indexOf(u)===i).forEach(u=>notificar(u,'aprovacao_decidida',`Pausa ${aprovar?'aprovada':'recusada'}: ${k.titulo}${z.decMotivo?` (${z.decMotivo})`:''}`,t,z.id,tkIr(k)));return true}
function pzRetomar(t,k){const z=pzAtiva(k);if(!z)return;const dias=pzDias(z.ini.slice(0,10),HOJE);
  z.sit='encerrada';z.fim=agora();z.retPor=me();z.dias=dias;
  const l=tkL(t).find(x=>x.id===z.listaAnt&&!x.oculta&&x.tipo==='aberta')||tkPrim(t,'aberta');pzMover(t,k,l.id);
  if(k.prazo&&dias>0)crEditar(t,k,'prazo',crSomar(k.prazo,dias));
  log(t,`Tarefa "${k.titulo}": retomada depois de ${dias} dia${dias===1?'':'s'} de pausa`);toast(dias?`Retomada. O prazo andou ${dias} dia${dias===1?'':'s'}.`:'Retomada.')}
/* chamado pelo tkMover: entrar na lista de pausa pede o motivo; sair só por Retomar (ou concluindo) */
function pzGuarda(t,k,de,l){if(UI.pzMovendo)return true;
  if(l.tipo==='pausa'&&de.tipo!=='pausa'){if(!tkEd())return false;UI.tkSel={tid:t.id,kid:k.id};UI.pzForm=k.id;UI.modal='tarefa';setTimeout(renderModal,0);toast('Diga o motivo da pausa.');return false}
  if(de.tipo==='pausa'&&l.tipo!=='pausa'){if(l.tipo==='conclui'){const z=pzAtiva(k);if(z){z.sit='encerrada';z.fim=agora();z.retPor=me();z.dias=0}return true}
    toast('Para tirar a tarefa da pausa, use Retomar.',true);return false}
  return true}

/* ---------- no cartão ---------- */
function pzBlocoHtml(t,k,ro){const z=pzAtiva(k)||pzPend(k),hist=(k.pausas||[]).filter(x=>x.sit!=='pendente'&&x.sit!=='ativa'),sla=pzSla(k),eu=me();
  const form=UI.pzForm===k.id&&!ro&&!z;if(!z&&!hist.length&&!form&&!sla.pausada)return '';
  const pode=z&&z.sit==='pendente'&&!ro&&eu!==z.por&&pzAprova(eu,z.por);
  return `<div class="tkm-bloco pz-bloco">${tkSecH('clock','Pausa',z?`<span class="chip warn">${z.sit==='ativa'?`Pausada desde ${fd(z.ini.slice(0,10))}`:'Pausa pedida'}</span>`:'')}<div class="tkm-in">
    ${z?`<div class="pz-mot">“${esc(z.motivo)}”<span class="faint"> · ${z.sit==='ativa'?`${z.decPor&&z.decPor!==z.por?`pedida por ${esc(z.por)}, aprovada por ${esc(z.decPor)}`:`por ${esc(z.por)}`}`:`pedida por ${esc(z.por)} em ${fd(z.em.slice(0,10))}`}</span></div>`:''}
    ${form?`<form class="ap-rf" data-form="pz-pedir"><textarea name="motivo" required placeholder="Por que a tarefa vai pausar? (obrigatório)" aria-label="Motivo da pausa"></textarea>
      <div class="faint">${pzAprova(eu,eu)?'A pausa vale na hora.':`A pausa precisa da aprovação de ${pzRegra()==='diretor'?'um diretor':'um gestor'}; até lá, o prazo continua contando.`}</div>
      <div class="tkm-acs"><button class="tkm-ok" type="submit">${pzAprova(eu,eu)?'Pausar':'Pedir a pausa'}</button><button class="tkm-btn" type="button" data-a="pz-form-cancela">Cancelar</button></div></form>`:''}
    ${pode?(UI.pzRecusa===k.id?`<form class="ap-rf" data-form="pz-recusa"><textarea name="motivo" required placeholder="Por que a pausa foi recusada? (obrigatório)" aria-label="Motivo da recusa"></textarea><div class="tkm-acs"><button class="tkm-ok ap-rec" type="submit">Recusar</button><button class="tkm-btn" type="button" data-a="pz-recusa-cancela">Cancelar</button></div></form>`
      :`<div class="tkm-acs"><button class="tkm-ok" data-a="pz-aprovar">Aprovar a pausa</button><button class="tkm-btn" data-a="pz-recusar">Recusar</button></div>`):''}
    ${z&&!ro&&z.sit==='ativa'?`<button class="tkm-ok pz-ret" data-a="pz-retomar">Retomar</button>`:''}
    ${z&&!ro&&z.sit==='pendente'&&z.por===eu?`<button class="tkm-btn ap-canc" data-a="pz-cancelar">Desistir da pausa</button>`:''}
    <div class="pz-sla"><span><b class="num">${sla.aberta}</b> dia${sla.aberta===1?'':'s'} aberta</span><span><b class="num">${sla.pausada}</b> pausada</span><span><b class="num">${sla.liq}</b> líquido${sla.liq===1?'':'s'}</span></div>
    ${hist.length?`<div class="pz-hist">${hist.slice().reverse().map(x=>`<div class="faint">${x.sit==='encerrada'?`Pausada de ${fd(x.ini.slice(0,10))} a ${fd(x.fim.slice(0,10))}${x.dias?` (prazo +${x.dias} d)`:''}`:x.sit==='recusada'?`Pausa recusada por ${esc(x.decPor)}${x.decMotivo?`: ${esc(x.decMotivo)}`:''}`:'Pedido de pausa cancelado'} · “${esc(x.motivo)}”</div>`).join('')}</div>`:''}
  </div></div>`}
const pzSelo=k=>pzAtiva(k)?`<span class="tk-b ap-selo" title="Pausada">${ic('clock',14)}Pausada</span>`:pzPend(k)?`<span class="tk-b ap-selo" title="Pausa pedida">${ic('clock',14)}Pausa pedida</span>`:'';
const pzBotao=(k,ro)=>ro||k.feita||k.arq||pzAtiva(k)||pzPend(k)?'':`<button class="tkm-sb" data-a="pz-form">${ic('clock',16)}<span>Pausar</span></button>`;
const pzCfgHtml=()=>`<div class="field" style="max-width:320px;margin-top:12px"><label for="pz-regra">Quem aprova a pausa da tarefa</label><select id="pz-regra" data-ch="pz-regra">${[['ninguem','Ninguém: a pausa vale na hora'],['gestor','Gestor de quem pede (ou acima)'],['diretor','Diretor']].map(([v,n])=>`<option value="${v}" ${pzRegra()===v?'selected':''}>${n}</option>`).join('')}</select></div>
  <p class="faint" style="margin:8px 0 0">Pausada, a tarefa não fica atrasada; ao retomar, o prazo anda os dias da pausa.</p>`;

document.addEventListener('click',e=>{const a=e.target.closest('[data-a^="pz-"]');if(!a)return;e.preventDefault();e.stopImmediatePropagation();const {t,k}=tkAtual();if(!k)return;
  switch(a.dataset.a){
    case 'pz-form':UI.pzForm=k.id;setTimeout(()=>document.querySelector('[data-form="pz-pedir"] textarea')?.focus(),0);break;
    case 'pz-form-cancela':UI.pzForm=null;break;
    case 'pz-aprovar':pzDecidir(t,k,true);break;
    case 'pz-recusar':UI.pzRecusa=k.id;break;
    case 'pz-recusa-cancela':UI.pzRecusa=null;break;
    case 'pz-retomar':pzRetomar(t,k);break;
    case 'pz-cancelar':{const z=pzPend(k);z.sit='cancelada';z.decEm=agora();log(t,`Tarefa "${k.titulo}": pedido de pausa cancelado`);toast('Pedido de pausa cancelado.');break}
  }tkRe()},true);
document.addEventListener('change',e=>{const el=e.target;if(el.dataset?.ch!=='pz-regra')return;e.stopImmediatePropagation();S.tkRegras={...(S.tkRegras||{}),pausa:el.value};toast('Regra da pausa salva.');save();render()},true);
document.addEventListener('submit',e=>{const f=e.target,n=f.dataset?.form;if(n!=='pz-pedir'&&n!=='pz-recusa')return;e.preventDefault();e.stopImmediatePropagation();const {t,k}=tkAtual();const m=new FormData(f).get('motivo');
  if(n==='pz-pedir'){if(pzPausar(t,k,m))UI.pzForm=null}else if(pzDecidir(t,k,false,m))UI.pzRecusa=null;tkRe()},true);

/* exemplo: no primeiro terreno, uma pausa valendo e um pedido esperando o gestor */
(()=>{const t=S.terrenos[0];if(!t||S.pzExemplo)return;S.pzExemplo=true;const L=tkL(t),lp=pzListaPausa(t);
  const a=t.tarefas.find(x=>x.titulo==='Orçar demolição do galpão');if(a&&lp&&!a.feita){a.criadoEm=addD(HOJE,-12);const ini=addD(HOJE,-3)+'T09:00:00';pzPausas(a).push({id:uid(),sit:'ativa',motivo:'Aguardando a vistoria da Defesa Civil',por:'Rafael Souza',em:ini,decPor:'Ana Prado',decEm:ini,ini,listaAnt:a.lista});a.lista=lp.id}
  const b=t.tarefas.find(x=>x.titulo==='Cobrar resposta da proposta v3');if(b&&!b.feita){b.criadoEm=addD(HOJE,-6);pzPausas(b).push({id:uid(),sit:'pendente',motivo:'Proprietário viajando até o dia 5',por:'Rafael Souza',em:addD(HOJE,-1)+'T11:00:00'})}})();
