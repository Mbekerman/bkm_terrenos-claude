/* =====================================================================
   Pessoa por @ em todo o sistema (decisões do Moisés, 1/nov/2026: "Quero @ em tudo")
   Todo seletor de pessoa (responsável, solicitante, executores, aprovadores, quem acompanha, responsável do item,
   do modelo, da regra da etapa, do Novo terreno...) vira um campo onde se digita @ e o nome: a lista mostra os
   colegas cujo nome ou @ tem as letras na ordem, sem acento nem caixa, os que começam com o digitado primeiro;
   as opções que não são pessoa ("Responsável do terreno", "Sem responsável") entram na mesma busca.
   Setas, Enter ou Tab escolhem; Esc fecha; sair sem escolher volta o que estava; vazio = a opção vazia.
   O <select> continua na página, escondido: a escolha muda o valor dele e dispara o change de sempre.
   Ficam de fora os filtros (chips de filtro e a gaveta), que filtram em vez de atribuir.
   ===================================================================== */
const rpNorm=x=>String(x||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
function rpNota(rot,arr,q){if(!q)return 1;const n=rpNorm(rot),a=arr||'',ws=n.split(/\s+/);
  if((a&&a.startsWith(q))||n.startsWith(q))return 0;if(ws.some(w=>w.startsWith(q))||(a&&a.split('.').some(w=>w.startsWith(q))))return 1;
  if(n.includes(q)||(a&&a.includes(q)))return 2;let i=0;for(const c of n.replace(/\s+/g,''))if(c===q[i])i++;return i===q.length?3:null}
/* itens do seletor: {v, rot, user} */
function rpItens(sel){return [...sel.options].filter(o=>o.value!==''&&!o.disabled).map(o=>({v:o.value,rot:o.textContent.trim(),user:USERS.includes(o.value)}))}
function rpBusca(itens,txt){const q=rpNorm(txt).replace(/^@/,'').trim(),qs=q.replace(/\s+/g,'');
  return itens.map(x=>({x,n:rpNota(x.rot,x.user?arrobaDe(x.v):'',qs)??(q.includes(' ')?rpNota(x.rot,x.user?arrobaDe(x.v):'',q):null)}))
    .filter(r=>r.n!=null).sort((a,b)=>a.n-b.n||(b.x.user?0:1)-(a.x.user?0:1)||a.x.rot.localeCompare(b.x.rot)).slice(0,7).map(r=>r.x)}
function rpTexto(sel){const o=sel.selectedOptions[0];if(!o||o.value==='')return '';return USERS.includes(o.value)?'@'+arrobaDe(o.value):o.textContent.trim()}
function rpVazio(sel){const o=[...sel.options].find(x=>x.value==='');return o&&o.textContent.trim()?o.textContent.trim():'Digite @ e o nome'}
/* o seletor é de pessoa quando quase todas as opções são da equipe */
function rpEhPessoa(sel){if(sel.multiple||sel.dataset.rp==='nao'||sel.classList.contains('fsel-chip')||sel.closest('[data-ch],.flt,.fgav,.fl-gav,#filtros'))return false;
  const it=rpItens(sel),us=it.filter(x=>x.user).length;return us>=Math.min(3,USERS.length)&&it.length-us<=2}
let rpSeq=0;
function rpLiga(sel){sel.dataset.rpOk='1';const sobre=getComputedStyle(sel).opacity==='0';const id=(sel.id||'rp'+(++rpSeq))+'-q';
  const inp=document.createElement('input');inp.id=id;inp.className='rp-q '+(sobre?'rp-flut':[...sel.classList].filter(c=>c!=='rp-hid').join(' '));
  inp.autocomplete='off';inp.setAttribute('role','combobox');inp.setAttribute('aria-autocomplete','list');inp.setAttribute('aria-expanded','false');inp.setAttribute('aria-controls',id.replace(/-q$/,'-l'));
  inp.setAttribute('aria-label',sel.getAttribute('aria-label')||(sel.id&&document.querySelector(`label[for="${sel.id}"]`)?.textContent.trim())||'Pessoa');
  inp.disabled=sel.disabled;inp.value=rpTexto(sel);inp.placeholder=rpVazio(sel);inp.title=sel.selectedOptions[0]?.value?sel.selectedOptions[0].textContent.trim():'';
  inp._rpSel=sel;sel._rpInp=inp;
  if(sobre){/* seletor invisível sobre um botão (+ de pessoas, avatar do item): o toque abre um campo flutuante */
    const alvo=sel.parentElement;sel.style.pointerEvents='none';sel.tabIndex=-1;alvo.classList.add('rp-alvo');alvo.setAttribute('tabindex','0');alvo.setAttribute('role','button');
    alvo.setAttribute('aria-label',inp.getAttribute('aria-label'));inp.hidden=true;document.body.appendChild(inp);alvo._rpInp=inp;inp._rpAlvo=alvo;return}
  const w=document.createElement('span');w.className='rp-w';sel.classList.add('rp-hid');sel.tabIndex=-1;sel.setAttribute('aria-hidden','true');sel.after(w);w.appendChild(inp)}
function rpVarre(raiz){(raiz||document).querySelectorAll?.('select:not([data-rp-ok])').forEach(s=>{if(USERS&&rpEhPessoa(s))rpLiga(s);else s.dataset.rpOk='0'})}
/* campos flutuantes órfãos (o botão saiu da página) saem junto */
function rpLimpa(){document.querySelectorAll('body > input.rp-flut').forEach(i=>{if(!i._rpAlvo?.isConnected)i.remove()})}
new MutationObserver(ms=>{let t=false;for(const m of ms)if(m.addedNodes.length){t=true;break}if(t){rpVarre(document);rpLimpa()}}).observe(document.documentElement,{childList:true,subtree:true});
let RP=null;
function rpPop(){let p=document.getElementById('rp-pop');if(!p){p=document.createElement('div');p.id='rp-pop';p.className='mn-pop rp-pop';p.setAttribute('role','listbox');p.setAttribute('aria-label','Pessoas');document.body.appendChild(p)}return p}
function rpAbrir(inp){const sel=inp._rpSel,l=rpBusca(rpItens(sel),inp.value),p=rpPop();RP={inp,sel,l,i:0};p.dataset.para=inp.id;
  p.innerHTML=l.length?l.map((x,i)=>`<div class="mn-i" role="option" id="rp-o${i}" aria-selected="${i===0}" data-rpo="${i}">${x.user?av(x.v,'sm'):`<span class="rp-ic">${ic(x.v===RESP_OBJ?'flow':'pessoa',16)}</span>`}<span class="mn-n">${esc(x.rot)}</span>${x.user?`<span class="mn-a">@${esc(arrobaDe(x.v))}</span>`:''}</div>`).join('')
    :'<div class="mn-i faint">Ninguém com esse nome</div>';
  p.hidden=false;const r=inp.getBoundingClientRect(),w=Math.max(Math.min(320,window.innerWidth-16),Math.min(r.width,window.innerWidth-16)),h=p.offsetHeight,cima=r.bottom+4+h>window.innerHeight&&r.top-4-h>0;
  Object.assign(p.style,{width:w+'px',left:Math.max(8,Math.min(r.left,window.innerWidth-w-8))+'px',top:(cima?r.top-4-h:r.bottom+4)+'px'});
  inp.setAttribute('aria-expanded','true');if(l.length)inp.setAttribute('aria-activedescendant','rp-o0');else inp.removeAttribute('aria-activedescendant')}
function rpMarca(i){if(!RP||!RP.l.length)return;RP.i=(i+RP.l.length)%RP.l.length;document.querySelectorAll('#rp-pop [data-rpo]').forEach((x,j)=>x.setAttribute('aria-selected',j===RP.i));
  RP.inp.setAttribute('aria-activedescendant','rp-o'+RP.i);document.getElementById('rp-o'+RP.i)?.scrollIntoView({block:'nearest'})}
function rpFecha(){const p=document.getElementById('rp-pop');if(p)p.hidden=true;if(RP){RP.inp.setAttribute('aria-expanded','false');RP.inp.removeAttribute('aria-activedescendant')}RP=null}
function rpPoe(sel,v){const inp=sel._rpInp;if(sel.value!==v){sel.value=v;sel.dispatchEvent(new Event('change',{bubbles:true}))}
  if(inp&&inp.isConnected){inp.value=rpTexto(sel);inp.title=sel.selectedOptions[0]?.value?sel.selectedOptions[0].textContent.trim():''}}
function rpEscolhe(i){if(!RP)return;const x=RP.l[i],{inp,sel}=RP;rpFecha();if(!x)return;const fl=inp.classList.contains('rp-flut');rpPoe(sel,x.v);if(fl){inp.hidden=true;inp._rpAlvo?.focus?.()}}
function rpFlutAbre(alvo){const inp=alvo._rpInp;if(!inp||inp.disabled)return;const r=alvo.getBoundingClientRect(),w=Math.min(240,window.innerWidth-16);
  Object.assign(inp.style,{position:'fixed',zIndex:1001,width:w+'px',left:Math.max(8,Math.min(r.left,window.innerWidth-w-8))+'px',top:r.top+'px'});inp.hidden=false;inp.value='@';inp.focus();inp.setSelectionRange(1,1);rpAbrir(inp)}
document.addEventListener('click',e=>{const a=e.target.closest?.('.rp-alvo');if(a&&a._rpInp){e.preventDefault();e.stopPropagation();rpFlutAbre(a)}},true);
document.addEventListener('keydown',e=>{const a=e.target.closest?.('.rp-alvo');if(a&&a===e.target&&(e.key==='Enter'||e.key===' ')){e.preventDefault();rpFlutAbre(a)}},true);
document.addEventListener('input',e=>{const inp=e.target;if(!inp._rpSel)return;e.stopImmediatePropagation();
  if(!inp.value.trim()&&!inp.classList.contains('rp-flut')){rpPoe(inp._rpSel,[...inp._rpSel.options].some(o=>o.value==='')?'':inp._rpSel.value);rpFecha();return}
  if(!inp.value.startsWith('@')){const c=inp.selectionStart;inp.value='@'+inp.value.trimStart();inp.setSelectionRange(c+1,c+1)}rpAbrir(inp)},true);
document.addEventListener('focusin',e=>{const inp=e.target;if(inp._rpSel&&!inp.classList.contains('rp-flut'))setTimeout(()=>{if(document.activeElement===inp)inp.select()},0)});
document.addEventListener('keydown',e=>{const inp=e.target;if(!inp._rpSel)return;
  if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();const ab=!!RP;rpFecha();if(inp.classList.contains('rp-flut')){inp.hidden=true;inp._rpAlvo?.focus?.()}else if(!ab)inp.blur();return}
  if(!RP||RP.inp!==inp){if(e.key==='ArrowDown'){e.preventDefault();rpAbrir(inp)}return}
  if(e.key==='ArrowDown'){e.preventDefault();rpMarca(RP.i+1)}else if(e.key==='ArrowUp'){e.preventDefault();rpMarca(RP.i-1)}
  else if((e.key==='Enter'||e.key==='Tab')&&RP.l.length){e.preventDefault();e.stopImmediatePropagation();rpEscolhe(RP.i)}
  else if(e.key==='Enter'){e.preventDefault();e.stopImmediatePropagation()}},true);
document.addEventListener('mousedown',e=>{const o=e.target.closest?.('[data-rpo]');if(o&&RP){e.preventDefault();e.stopPropagation();rpEscolhe(+o.dataset.rpo)}},true);
/* sair sem escolher: o @ digitado igual a um colega vale; senão volta o que estava */
document.addEventListener('focusout',e=>{const inp=e.target;if(!inp._rpSel)return;setTimeout(()=>{if(RP&&RP.inp===inp)rpFecha();const sel=inp._rpSel;
  if(inp.classList.contains('rp-flut')){inp.hidden=true;return}if(!inp.isConnected)return;
  const t=rpNorm(inp.value.trim()),ex=rpItens(sel).find(x=>(x.user&&'@'+arrobaDe(x.v)===t.replace(/^@?/,'@'))||rpNorm(x.rot)===t);
  if(!t){rpPoe(sel,[...sel.options].some(o=>o.value==='')?'':sel.value);return}rpPoe(sel,ex?ex.v:sel.value)},0)});
window.addEventListener('scroll',()=>{if(RP)rpAbrir(RP.inp)},true);
