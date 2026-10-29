/* =====================================================================
   Aprovação formal da tarefa (bloco 3; decisões do Moisés, 29/out/2026).
   Espelha o banco (fluxo.aprovacoes, fluxo.aprovacao_votos, fluxo.regras):
   - quem aprova são os aprovadores do cartão (k.aprov, na ordem da lista);
     um superior de um aprovador decide no lugar dele e o voto guarda quem;
   - com aprovador, Concluir vira "Pedir aprovação": o cartão ganha o selo
     "Aguardando aprovação" e fica na lista; aprovado por todos, vai sozinho
     para a lista que conclui;
   - em paralelo (padrão) todos aprovam em qualquer ordem; em sequência,
     cada um na sua vez; recusar exige justificativa e encerra o pedido;
   - reabrir um cartão aprovado invalida a aprovação;
   - bloqueio de conclusão: sem aprovação, ou com item de checklist em
     aberto quando a regra da empresa vale (Configurações › Tarefas).
   Injetado no mesmo escopo do protótipo, depois de proto_cronograma.js.
   ===================================================================== */
const apAps=k=>k.aps||(k.aps=[]);
const apPend=k=>apAps(k).find(a=>a.sit==='pendente');
const apUltima=k=>apAps(k).at(-1);
const apPrecisa=k=>(k.aprov||[]).length>0&&!apAps(k).some(a=>a.sit==='aprovada');
const apRegraCk=()=>S.tkRegras?.checklist!==false;
const apCkAberto=k=>(k.checklists||[]).some(c=>c.itens.some(i=>!i.feito&&!i.virou));
/* o que impede concluir agora (null = nada) */
function apBloqueio(t,k){if(apPrecisa(k))return apPend(k)?'A tarefa está aguardando aprovação.':'A tarefa precisa ser aprovada antes de concluir. Use "Pedir aprovação".';
  if(apRegraCk()&&apCkAberto(k))return 'Conclua os itens do checklist antes de concluir a tarefa.';return null}
/* votos que esperam decisão agora (em sequência, só o da vez) */
function apDaVez(a){if(!a||a.sit!=='pendente')return [];const ab=a.votos.filter(v=>!v.dec);if(a.modo==='paralelo')return ab;const m=Math.min(...ab.map(v=>v.ordem));return ab.filter(v=>v.ordem===m)}
/* o voto que essa pessoa decide: o dela ou, como superior, o de um aprovador abaixo */
function apMeuVoto(a,u){const vz=apDaVez(a);return vz.find(v=>v.user===u)||vz.find(v=>ehSuperior(u,v.user))||null}
function apAvisarVez(t,k,a){apDaVez(a).forEach(v=>notificar(v.user,'aprovacao_pendente',`Aprovar a tarefa: ${k.titulo}`,t,a.id+':'+v.user,tkIr(k)))}
function apPedir(t,k,motivo){if(!(k.aprov||[]).length){toast('A tarefa não tem aprovador.',true);return}
  if(apRegraCk()&&apCkAberto(k)){toast('Conclua os itens do checklist antes de pedir a aprovação.',true);return}
  const p=apPend(k);if(p){p.sit='cancelada';p.decEm=agora()}const eu=me();
  const a={id:uid(),modo:k.apModo||'paralelo',sit:'pendente',motivo:motivo||null,por:eu,em:agora(),votos:k.aprov.map((u,i)=>({user:u,ordem:i+1,dec:null,por:null,em:null,just:null}))};
  apAps(k).push(a);const v=a.votos.find(x=>x.user===eu);if(v){v.dec='aprovou';v.por=eu;v.em=agora()}
  log(t,`Tarefa "${k.titulo}": aprovação pedida (${a.modo==='paralelo'?'em paralelo':'em sequência'})`);
  if(apFechar(t,k,a))toast('Tarefa aprovada e concluída.');else{apAvisarVez(t,k,a);toast('Aprovação pedida. O cartão fica com o selo "Aguardando aprovação".')}}
function apFechar(t,k,a){if(a.votos.some(v=>v.dec!=='aprovou'))return false;a.sit='aprovada';a.decEm=agora();
  UI.apAprovando=true;try{tkConcluir(t,k,true)}finally{UI.apAprovando=false}
  log(t,`Tarefa "${k.titulo}": aprovada`);[a.por,k.resp].filter((u,i,x)=>u&&x.indexOf(u)===i).forEach(u=>notificar(u,'aprovacao_decidida',`Tarefa aprovada: ${k.titulo}`,t,a.id,tkIr(k)));return true}
function apDecidir(t,k,aprovar,just){const a=apPend(k),eu=me(),v=apMeuVoto(a,eu);if(!v){toast('Você não decide este pedido agora.',true);return false}
  if(!aprovar&&!just?.trim()){toast('Diga por que a tarefa foi recusada.',true);return false}
  v.dec=aprovar?'aprovou':'recusou';v.por=eu;v.em=agora();v.just=just?.trim()||null;
  if(!aprovar){a.sit='recusada';a.decEm=agora();log(t,`Tarefa "${k.titulo}": recusada por ${eu} (${v.just})`);
    [a.por,k.resp].filter((u,i,x)=>u&&x.indexOf(u)===i).forEach(u=>notificar(u,'aprovacao_decidida',`Tarefa recusada: ${k.titulo} (${v.just})`,t,a.id,tkIr(k)));toast('Tarefa recusada.');return true}
  log(t,`Tarefa "${k.titulo}": aprovada por ${eu}${v.user!==eu?` no lugar de ${v.user}`:''}`);
  if(apFechar(t,k,a))toast('Tarefa aprovada por todos e concluída.');else{apAvisarVez(t,k,a);toast('Seu voto foi registrado.')}return true}
function apInvalidar(t,k){const a=apAps(k).find(x=>x.sit==='aprovada');if(a){a.sit='invalidada';log(t,`Tarefa "${k.titulo}": reaberta; a aprovação deixou de valer`)}}

/* ---------- no cartão ---------- */
const AP_SIT={pendente:'Aguardando aprovação',aprovada:'Aprovada',recusada:'Recusada',cancelada:'Pedido cancelado',invalidada:'Aprovação invalidada (reaberta)'};
function apBlocoHtml(t,k,ro){const ap=k.aprov||[];if(!ap.length&&!apAps(k).length)return '';
  const a=apPend(k)||apUltima(k),eu=me(),meu=a&&a.sit==='pendente'&&!ro&&apMeuVoto(a,eu),vz=apDaVez(a).map(v=>v.user);
  const modo=ro||ap.length<2||apPend(k)?`<span class="faint">${(k.apModo||'paralelo')==='paralelo'?'Em paralelo: todos aprovam, em qualquer ordem':'Em sequência: cada um na sua vez'}</span>`
    :`<div class="seg sm ap-modo" role="group" aria-label="Como aprovam">${[['paralelo','Em paralelo'],['sequencia','Em sequência']].map(([v,n])=>`<button data-a="ap-modo" data-v="${v}" aria-pressed="${(k.apModo||'paralelo')===v}">${n}</button>`).join('')}</div>`;
  const votos=a?a.votos.map(v=>`<div class="ap-v"><span class="ap-n num">${a.modo==='sequencia'?v.ordem:''}</span>${av(v.user,'sm')}<span class="ap-u">${esc(v.user)}</span>
      <span class="ap-st ${v.dec==='aprovou'?'ok':v.dec==='recusou'?'erro':vz.includes(v.user)?'vez':''}">${v.dec==='aprovou'?'Aprovou':v.dec==='recusou'?'Recusou':a.sit!=='pendente'?'—':vz.includes(v.user)?'Na vez':'Aguardando'}</span>
      ${v.por&&v.por!==v.user?`<span class="faint">por ${esc(v.por)}</span>`:''}${v.em?`<span class="faint num">${fd(v.em.slice(0,10))}</span>`:''}${v.just?`<div class="ap-j">“${esc(v.just)}”</div>`:''}</div>`).join(''):'';
  return `<div class="tkm-bloco ap-bloco">${tkSecH('check','Aprovação',a?`<span class="chip ${a.sit==='aprovada'?'good':a.sit==='pendente'?'warn':a.sit==='recusada'?'crit':''}">${AP_SIT[a.sit]}</span>`:'')}<div class="tkm-in">
    ${modo}
    ${a?`<div class="ap-vs">${votos}</div><div class="faint ap-ped">Pedida por ${esc(a.por)} em ${fd(a.em.slice(0,10))}${a.motivo?`: ${esc(a.motivo)}`:''}</div>`:`<div class="faint">Aprovadores: ${ap.map(esc).join(', ')}. A tarefa só conclui depois da aprovação.</div>`}
    ${meu?(UI.apRecusa===k.id?`<form class="ap-rf" data-form="ap-recusa"><textarea name="just" required placeholder="Por que a tarefa foi recusada? (obrigatório)" aria-label="Justificativa da recusa"></textarea><div class="tkm-acs"><button class="tkm-ok ap-rec" type="submit">Recusar</button><button class="tkm-btn" type="button" data-a="ap-recusa-cancela">Cancelar</button></div></form>`
      :`<div class="tkm-acs"><button class="tkm-ok" data-a="ap-aprovar">${meu.user!==eu?`Aprovar no lugar de ${esc(meu.user.split(' ')[0])}`:'Aprovar'}</button><button class="tkm-btn" data-a="ap-recusar">Recusar</button></div>`):''}
    ${!ro&&!k.feita&&!k.arq?(apPend(k)?`<button class="tkm-btn ap-canc" data-a="ap-cancelar">Cancelar pedido</button>`:apPrecisa(k)?`<button class="tkm-btn" data-a="ap-pedir">${a?'Pedir de novo':'Pedir aprovação'}</button>`:''):''}
  </div></div>`}
/* selo na frente do cartão */
const apSelo=k=>apPend(k)?`<span class="tk-b ap-selo" title="Aguardando aprovação">${ic('clock',14)}Aprovação</span>`:'';
/* rótulo do concluir */
const apRotulo=k=>!k.feita&&apPrecisa(k)?(apPend(k)?'Aguardando aprovação':'Pedir aprovação'):null;

/* Configurações › Tarefas: regra de conclusão */
const apCfgHtml=()=>`<section class="sec"><div class="sec-h"><h2>Conclusão da tarefa</h2></div><div class="sec-b">
  <label class="fchk"><input type="checkbox" data-a="ap-regra" ${apRegraCk()?'checked':''}>${ic('check',16)}Concluir exige o checklist completo</label>
  <p class="faint" style="margin:8px 0 0">Tarefa com aprovador só conclui depois de aprovada, sempre.</p>${pzCfgHtml()}</div></section>`;

document.addEventListener('click',e=>{const a=e.target.closest('[data-a^="ap-"]');if(!a)return;const A=a.dataset.a;
  if(A==='ap-regra'){e.stopImmediatePropagation();S.tkRegras={...(S.tkRegras||{}),checklist:a.checked};toast(a.checked?'Concluir exige o checklist completo.':'Concluir não exige mais o checklist completo.');save();render();return}
  e.preventDefault();e.stopImmediatePropagation();const {t,k}=tkAtual();if(!k)return;
  switch(A){
    case 'ap-modo':k.apModo=a.dataset.v;log(t,`Tarefa "${k.titulo}": aprovação ${a.dataset.v==='paralelo'?'em paralelo':'em sequência'}`);break;
    case 'ap-pedir':apPedir(t,k);break;
    case 'ap-aprovar':apDecidir(t,k,true);break;
    case 'ap-recusar':UI.apRecusa=k.id;break;
    case 'ap-recusa-cancela':UI.apRecusa=null;break;
    case 'ap-cancelar':{const p=apPend(k);p.sit='cancelada';p.decEm=agora();log(t,`Tarefa "${k.titulo}": pedido de aprovação cancelado`);toast('Pedido cancelado.');break}
  }tkRe()},true);
document.addEventListener('submit',e=>{const f=e.target;if(f.dataset?.form!=='ap-recusa')return;e.preventDefault();e.stopImmediatePropagation();const {t,k}=tkAtual();
  if(apDecidir(t,k,false,new FormData(f).get('just')))UI.apRecusa=null;tkRe()},true);
/* exemplo: o estudo de viabilidade do primeiro terreno com a aprovação em sequência pela metade (Ana aprovou, falta o Moisés) */
(()=>{const t=S.terrenos[0],k=t?.tarefas.find(x=>x.titulo==='Estudo de viabilidade');if(!k||S.apExemplo)return;S.apExemplo=true;
  k.aprov=['Ana Prado','Moisés'];k.apModo='sequencia';
  apAps(k).push({id:uid(),modo:'sequencia',sit:'pendente',motivo:'Estudo com a margem de 14%',por:'Rafael Souza',em:addD(HOJE,-1)+'T10:00:00',
    votos:[{user:'Ana Prado',ordem:1,dec:'aprovou',por:'Ana Prado',em:addD(HOJE,-1)+'T16:30:00',just:'Premissas conferidas'},{user:'Moisés',ordem:2,dec:null,por:null,em:null,just:null}]})})();
