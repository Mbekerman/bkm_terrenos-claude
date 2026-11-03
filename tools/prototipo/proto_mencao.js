/* ---------- menção com @ e e-mail das notificações (decisão do Moisés, 28/out/2026) ----------
   No banco: app.mencoes e app.tg_mencoes (o @ em tarefas, atividades e reuniões avisa a pessoa),
   preferencias_notificacao e tipos_notificacao.email_padrao. Campo com data-mencao abre a lista dos
   colegas ao digitar @; o texto mostra o @ destacado; o aviso leva ao item. WhatsApp fica para depois. */
function arrobaDe(n){return String(n||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().trim().split(/\s+/).join('.').replace(/[^a-z0-9._-]/g,'')}
function mnEquipe(){return (S.membros||[]).map(m=>({nome:m.nome,arroba:arrobaDe(m.nome)}))}
function mnArrobas(tx){return [...new Set([...String(tx||'').matchAll(/(^|[^A-Za-z0-9._@-])@([A-Za-z0-9][A-Za-z0-9._-]{0,39})/g)].map(m=>m[2].toLowerCase().replace(/[._-]+$/,'')))]}
function mnPessoas(tx){const a=mnArrobas(tx);return mnEquipe().filter(u=>a.includes(u.arroba)).map(u=>u.nome)}
/* texto com os @ da equipe destacados (o resto como escT) */
function escM(tx){const eq=new Set(mnEquipe().map(u=>u.arroba));
  return escT(tx).replace(/(^|[^A-Za-z0-9._@-])@([A-Za-z0-9][A-Za-z0-9._-]{0,39})/g,(m,p,a)=>{const k=a.toLowerCase().replace(/[._-]+$/,'');return eq.has(k)?`${p}<span class="mencao">@${k}</span>${a.slice(k.length)}`:m})}
/* vai por e-mail? a escolha da pessoa vence o padrão do tipo */
function mnEmail(para,tipo){const p=S.prefsNotif?.[para]?.[tipo];return p!=null?p:!!cfg().notif[tipo]?.email}
/* avisa só quem entrou agora no texto, e nunca quem escreveu */
function mencionar(t,antes,depois,onde,ir,pode){const ja=mnPessoas(antes);
  mnPessoas(depois).filter(u=>!ja.includes(u)&&u!==me()&&(!pode||pode(u))).forEach(u=>notificar(u,'mencao',`${me()} mencionou você ${onde}`,t,null,ir))}
function mencionarTarefa(t,k,antes){mencionar(t,antes,(k.desc||'')+'\n'+(k.resultado||''),`na tarefa: ${k.titulo}`,{b:'tarefas',alvo:k.id},u=>!!vzPapel(t,k,u))}
/* num cartão, a lista do @ só traz quem vê o cartão; na tarefa nova, pela visibilidade marcada no formulário */
function mnPodeSer(el,u){const f=el.closest('#f-tk');
  if(f){const v=f.querySelector('input[name=vis]:checked')?.value,resp=f.querySelector('[name=resp]')?.value;if(ehAdmin(u))return true;if(v==='individual')return false;
    if(v==='restrito'){const lib=[...f.querySelectorAll('input[name=lib]:checked')].map(x=>x.value);return u===resp||membro(u).papel==='diretor'||lib.includes(u)||lib.some(x=>x.startsWith('g:')&&(vzGrupo(x.slice(2))?.membros||[]).includes(u))}return true}
  if(UI.modal==='tarefa'&&UI.tkSel?.kid&&el.closest('#modal')){const {t,k}=tkAtual();return !k||!!vzPapel(t,k,u)}return true}
/* do sino ao item: abre o bloco da ficha, rola até o item e acende */
function mnIr(ir){
  /* tarefa: a seção Tarefas saiu da ficha (3/nov/2026); o aviso abre o cartão */
  if(ir.b==='tarefas'){const x=todasTarefas().find(y=>y.k.id===ir.alvo);if(x){UI.tkSel={tid:x.t.id,kid:x.k.id};UI.tkAba='geral';UI.modal='tarefa';renderModal();return}}
  blocoAbre(ir.b);render();setTimeout(()=>{const el=document.querySelector(`[data-mid="${ir.alvo}"]`)||document.getElementById('bl-'+ir.b);if(!el)return;
  el.scrollIntoView({behavior:'smooth',block:'center'});document.querySelectorAll('.pisca').forEach(x=>x.classList.remove('pisca'));
  let feito=false;const acende=()=>{if(feito)return;feito=true;void el.offsetWidth;el.classList.add('pisca');setTimeout(()=>el.classList.remove('pisca'),4200)};
  if('onscrollend' in window){window.addEventListener('scrollend',acende,{once:true});setTimeout(acende,900)}else setTimeout(acende,500)},60)}

/* lista dos colegas ao digitar @ */
let MN=null;
function mnPop(){let el=document.getElementById('mn-pop');if(!el){el=document.createElement('div');el.id='mn-pop';el.className='mn-pop';el.setAttribute('role','listbox');el.setAttribute('aria-label','Colegas');document.body.appendChild(el)}return el}
function mnFechar(){MN=null;const el=document.getElementById('mn-pop');if(el)el.hidden=true}
function mnAbrir(el){const pos=el.selectionStart??el.value.length,m=/(?:^|[^A-Za-z0-9._@-])@([A-Za-z0-9._-]{0,40})$/.exec(el.value.slice(0,pos));
  if(!m){mnFechar();return}
  const q=arrobaDe(m[1]),lista=mnEquipe().filter(u=>u.nome!==me()&&mnPodeSer(el,u.nome)&&(!q||u.arroba.startsWith(q)||u.arroba.split('.').some(w=>w.startsWith(q)))).slice(0,6);
  if(!lista.length){mnFechar();return}
  MN={el,ini:pos-m[1].length-1,fim:pos,lista,i:MN&&MN.el===el?Math.min(MN.i,lista.length-1):0};mnDesenhar()}
function mnDesenhar(){const p=mnPop(),r=MN.el.getBoundingClientRect();
  p.innerHTML=MN.lista.map((u,i)=>`<div class="mn-i" role="option" id="mn-o${i}" aria-selected="${i===MN.i}" data-mn="${i}">${av(u.nome,'sm')}<span class="mn-n">${esc(u.nome)}</span><span class="mn-a">@${esc(u.arroba)}</span></div>`).join('');
  p.hidden=false;const h=p.offsetHeight,w=Math.min(300,window.innerWidth-16),cima=r.bottom+4+h>window.innerHeight&&r.top-4-h>0;
  Object.assign(p.style,{width:w+'px',left:Math.max(8,Math.min(r.left,window.innerWidth-w-8))+'px',top:(cima?r.top-4-h:r.bottom+4)+'px'});
  MN.el.setAttribute('aria-activedescendant','mn-o'+MN.i)}
function mnEscolher(i){const u=MN.lista[i],el=MN.el,v=el.value,ins='@'+u.arroba+' ';
  el.value=v.slice(0,MN.ini)+ins+v.slice(MN.fim);const c=MN.ini+ins.length;el.setSelectionRange(c,c);mnFechar();el.focus();
  el.dispatchEvent(new Event('input',{bubbles:true}))}
document.addEventListener('input',e=>{const el=e.target;if(el.matches?.('[data-mencao]'))mnAbrir(el);else if(MN)mnFechar()});
window.addEventListener('keydown',e=>{if(!MN||e.target!==MN.el)return;
  if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();e.stopImmediatePropagation();MN.i=(MN.i+(e.key==='ArrowDown'?1:-1)+MN.lista.length)%MN.lista.length;mnDesenhar()}
  else if(e.key==='Enter'||e.key==='Tab'){e.preventDefault();e.stopImmediatePropagation();mnEscolher(MN.i)}
  else if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();mnFechar()}},true);
document.addEventListener('mousedown',e=>{const o=e.target.closest?.('[data-mn]');if(o&&MN){e.preventDefault();mnEscolher(+o.dataset.mn)}},true);
document.addEventListener('focusout',e=>{if(MN&&e.target===MN.el)setTimeout(()=>{if(MN&&document.activeElement!==MN.el)mnFechar()},120)});
window.addEventListener('scroll',()=>{if(MN)mnFechar()},true);window.addEventListener('resize',()=>{if(MN)mnFechar()});

/* Notificações por e-mail, no menu do avatar: cada um escolhe por tipo; o app sempre mostra */
const _renderModalMn=renderModal;renderModal=function(){if(UI.modal!=='mn-prefs')return _renderModalMn.apply(this,arguments);
  const el=$('#modal'),eu=me(),N=cfg().notif,tipos=Object.entries(N).filter(([,c])=>c.ativo);
  el.innerHTML=`<div class="scrim" data-a="scrim"><div class="dialog" role="dialog" aria-modal="true" aria-labelledby="mnp-h"><div class="dh"><div><h2 id="mnp-h">Notificações por e-mail</h2><div class="muted" style="margin-top:4px">Para ${esc(arrobaDe(eu))}@bkm.com.br. No sino aparecem todas.</div></div><button class="iconbtn" data-a="close" aria-label="Fechar">${ic('close')}</button></div>
  <div class="mnp">${tipos.map(([k,c])=>`<label class="mnp-r"><span>${esc(TIPOS_NOTIF_N[k]||k)}</span><input type="checkbox" data-mn-email="${k}" ${mnEmail(eu,k)?'checked':''}></label>`).join('')}</div>
  <div class="df"><button class="btn primary" data-a="close">Pronto</button></div></div></div>`;
  setTimeout(()=>el.querySelector('input')?.focus(),30)};
document.addEventListener('change',e=>{const k=e.target.dataset?.mnEmail;if(!k)return;const eu=me();S.prefsNotif[eu]=S.prefsNotif[eu]||{};
  if(e.target.checked===!!cfg().notif[k]?.email)delete S.prefsNotif[eu][k];else S.prefsNotif[eu][k]=e.target.checked;save();toast(e.target.checked?'Vai também por e-mail.':'Só no sino.')});
document.addEventListener('click',e=>{const a=e.target.closest?.('[data-a="mn-prefs"]');if(!a)return;e.stopImmediatePropagation();perfilMenu=false;renderPerfil();UI.modal='mn-prefs';renderModal()},true);
