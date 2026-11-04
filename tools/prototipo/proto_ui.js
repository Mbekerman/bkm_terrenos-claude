/* ===================== máscaras de número ao digitar ===================== */
/* Todo campo de número (inputmode decimal, ou data-fmt) se formata enquanto se digita:
   separador de milhar com ponto, vírgula decimal, e o R$ ou o % dentro do campo.
     data-fmt="moeda"  R$ na frente, até 2 casas      data-fmt="pct"  % no fim, até 4 casas
     data-fmt="num"    número com até 3 casas          data-fmt="int"  número inteiro
     data-fmt="none"   não mexe (ex.: filtros que aceitam "12 mi")
   Sem data-fmt, o tipo sai do rótulo do campo: "(R$)" vira moeda, "(%)" vira pct (e o
   rótulo perde o parêntese, porque o campo já mostra a unidade). data-dec muda as casas.
   O valor continua lido por lerNum (ponto de milhar e vírgula decimal). */
const FMT_DEC={moeda:2,pct:4,num:3,int:0};
const fmtRot=el=>{const id=el.id&&document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
  const l=id||el.closest('label')||el.closest('.field')?.querySelector('label');return l};
function fmtTipo(el){if(el.dataset.fmt)return el.dataset.fmt;
  if(el.closest('#fx-dr')||el.classList.contains('fx-in'))return 'none';
  const l=fmtRot(el),t=((l?.textContent||'')+' '+(el.getAttribute('aria-label')||'')+' '+(el.placeholder||''));
  return /R\$/.test(t)?'moeda':/%/.test(t)?'pct':'num'}
function fmtVivo(el){const t=el.dataset.fmt;if(!FMT_DEC.hasOwnProperty(t))return;
  const dec=el.dataset.dec!=null?+el.dataset.dec:FMT_DEC[t],v=el.value,c=el.selectionStart??v.length;
  if(/\d\s*(m|mi|mil|b|bi|k)\s*$/i.test(v))return;  // atalhos como "270 mil" e "12 mi" ficam como digitados (lerNum entende)
  const sig=s=>(s.match(/[\d,]/g)||[]).length;let antes=sig(v.slice(0,c));
  const neg=el.dataset.neg!=null&&/^\s*-/.test(v);
  let s=v.replace(/[^\d,]/g,'');const i=s.indexOf(',');
  let int=i<0?s:s.slice(0,i),fr=i<0||dec===0?null:s.slice(i+1).replace(/,/g,'').slice(0,dec);
  const z=int.length;int=int.replace(/^0+(?=\d)/,'');antes-=Math.min(antes,z-int.length);
  if(int===''&&fr!=null){int='0';antes++}
  const novo=(neg?'-':'')+int.replace(/\B(?=(\d{3})+(?!\d))/g,'.')+(fr!=null?','+fr:'');
  if(novo===v)return;el.value=novo;
  let n=0,p=neg?1:0;while(p<novo.length&&n<antes){if(/[\d,]/.test(novo[p]))n++;p++}
  try{el.setSelectionRange(p,p)}catch(e){}}
function fmtPrepara(el){el.dataset.fmtOk='1';const t=fmtTipo(el);el.dataset.fmt=t;if(t==='none')return;
  if(t==='moeda'||t==='pct'){const l=fmtRot(el);
    if(l){const w=document.createTreeWalker(l,NodeFilter.SHOW_TEXT);let n;while((n=w.nextNode()))n.nodeValue=n.nodeValue.replace(/\s*\((R\$|%)\)/,'')}
    if(!el.parentElement.classList.contains('adorno')){const w=document.createElement('span');w.className='adorno '+t;
      el.replaceWith(w);w.append(el);w.insertAdjacentHTML('beforeend',`<span class="adorno-t" aria-hidden="true">${t==='moeda'?'R$':'%'}</span>`)}}}
function fmtVarre(){document.querySelectorAll('input[inputmode="decimal"]:not([data-fmt-ok]),input[data-fmt]:not([data-fmt-ok])').forEach(fmtPrepara)}
let FMT_PEND=false;
new MutationObserver(()=>{if(FMT_PEND)return;FMT_PEND=true;queueMicrotask(()=>{FMT_PEND=false;fmtVarre()})}).observe(document.body,{childList:true,subtree:true});
document.addEventListener('input',e=>{const el=e.target;if(el.tagName==='INPUT'&&el.dataset.fmt)fmtVivo(el)},true);
/* Caixas de marcar das linhas de configuração: no celular, sem o cabeçalho da tabela, mostram o nome ao lado */
function uiRotulos(){document.querySelectorAll('.cfg-r:not(.cfg-hd) label.chk:not([data-rot-ok])').forEach(l=>{l.dataset.rotOk='1';
  const i=l.querySelector('input[type=checkbox]');if(!i||l.textContent.trim())return;const r=i.getAttribute('aria-label');if(r)l.insertAdjacentHTML('beforeend',`<span class="chk-rot">${r.replace(/[<&]/g,'')}</span>`)})}
/* Cabeçalho de tabela alinhado como a coluna: coluna de números (td.num) leva o th.num */
function uiThNum(){document.querySelectorAll('table.dt:not([data-th-ok])').forEach(t=>{const r=t.tBodies[0]?.rows[0],h=t.tHead?.rows[0];if(!r||!h)return;t.dataset.thOk='1';
  [...h.cells].forEach((th,i)=>{if(r.cells[i]?.classList.contains('num'))th.classList.add('num')})})}
/* Formulários de inclusão (Nova tarefa, matrícula, confrontação...): fechados atrás de um botão "Adicionar" até o clique */
const IF_ROT={mat:'Adicionar matrícula',insc:'Adicionar inscrição',confr:'Adicionar confrontação',pessoa:'Adicionar proprietário',tarefa:'Nova tarefa',dilig:'Adicionar diligência',
  'cfg-fase':'Nova fase','cfg-dep':'Nova dependência','cfg-fe':'Nova etapa','cfg-sub':'Nova subetapa','cfg-pre':'Novo pré-requisito','cfg-mot':'Novo motivo','vb-cfg-nova':'Novo item'};
const IF_AB=new Set(),ifChave=f=>f.dataset.form+'|'+(f.dataset.e||f.dataset.f||f.dataset.s||'')+'|'+UI.route;
function uiInline(){document.querySelectorAll('form.inline-form:not([data-if-ok])').forEach(f=>{const r=IF_ROT[f.dataset.form];if(!r)return;f.dataset.ifOk='1';
  const b=document.createElement('button');b.type='button';b.className='btn text if-abre';b.innerHTML=ic('add',18)+r;f.before(b);
  const c=document.createElement('button');c.type='button';c.className='btn text if-cancela';c.textContent='Cancelar';
  const env=[...f.querySelectorAll('button')].filter(x=>x.type!=='button').pop();env?env.after(c):f.append(c);
  if(IF_AB.has(ifChave(f)))b.hidden=true;else f.classList.add('if-fechado')})}
document.addEventListener('click',e=>{const b=e.target.closest?.('.if-abre,.if-cancela');if(!b)return;
  if(b.classList.contains('if-abre')){const f=b.nextElementSibling;if(!f)return;f.classList.remove('if-fechado');b.hidden=true;IF_AB.add(ifChave(f));f.querySelector('input:not([type=hidden]):not([type=radio]),select,textarea')?.focus()}
  else{const f=b.closest('form');f.reset();f.classList.add('if-fechado');IF_AB.delete(ifChave(f));const a=f.previousElementSibling;if(a?.classList.contains('if-abre')){a.hidden=false;a.focus()}}},true);
/* Linhas de configuração: no celular (sem o cabeçalho da tabela) cada campo leva o nome da coluna em cima */
function uiCfgCel(){document.querySelectorAll('.cfg-r:not(.cfg-hd):not([data-cel-ok])').forEach(r=>{r.dataset.celOk='1';const hd=r.parentElement?.querySelector(':scope > .cfg-hd');if(!hd)return;
  const nomes=[...hd.children].map(x=>x.textContent.trim()),k=[...r.children],comOrd=hd.children.length>=k.length||!nomes[0];
  (comOrd?k:k.filter(c=>!c.matches('.cfg-ord'))).forEach((c,i)=>{if(!nomes[i]||!c.matches('input:not([type=checkbox]),select,.cfg-ap'))return;
    const w=document.createElement(c.matches('.cfg-ap')?'div':'label');w.className='cfg-cel';c.replaceWith(w);w.innerHTML=`<span class="cfg-cl">${nomes[i].replace(/[<&]/g,'')}</span>`;w.append(c)})})}
/* Abas roláveis de Configurações no celular: a aba ativa aparece */
function uiCfgAba(){const n=document.querySelector('.cfg-nav:not([data-aba-ok])');if(!n)return;n.dataset.abaOk='1';const a=n.querySelector('.cfg-tab[aria-selected="true"]');
  if(a&&n.scrollWidth>n.clientWidth)n.scrollLeft=a.offsetLeft-n.clientWidth/2+a.offsetWidth/2}
/* Quadro (kanban) no celular: uma coluna por vez; pontinhos acima do quadro dizem quantas são e qual está na tela (o toque leva à coluna) */
function uiBoardPontos(){if(innerWidth>599)return;document.querySelectorAll('.board:not([data-pt-ok])').forEach(b=>{const cols=[...b.querySelectorAll(':scope > .col')];if(cols.length<2)return;b.dataset.ptOk='1';if(b.previousElementSibling?.classList.contains('board-pt'))b.previousElementSibling.remove();
  const n=document.createElement('div');n.className='board-pt';n.setAttribute('role','tablist');n.setAttribute('aria-label','Colunas do quadro');
  n.innerHTML=cols.map((c,i)=>`<button type="button" role="tab" aria-label="${(c.getAttribute('aria-label')||'Coluna '+(i+1)).replace(/[<&"]/g,'')}" aria-selected="${i===0}"></button>`).join('');b.before(n);
  const marca=()=>{const w=cols[1].offsetLeft-cols[0].offsetLeft||1,i=Math.min(cols.length-1,Math.round(b.scrollLeft/w));n.querySelectorAll('button').forEach((x,j)=>x.setAttribute('aria-selected',j===i))};
  b.addEventListener('scroll',()=>requestAnimationFrame(marca),{passive:true});marca();
  n.addEventListener('click',e=>{const x=e.target.closest('button');if(!x)return;const i=[...n.children].indexOf(x);b.scrollTo({left:cols[i].offsetLeft-cols[0].offsetLeft,behavior:'smooth'})})})}
/* Botões com ícone nos cabeçalhos de quadro: no celular ficam só com o ícone (o nome vai para o rótulo acessível e a dica) */
function uiHdIc(){document.querySelectorAll(':is(.sec-h,.card-h,.chk-gh) :is(.btn,.linkbtn):not([data-hd-ok])').forEach(b=>{b.dataset.hdOk='1';if(!b.querySelector('svg'))return;
  const t=b.textContent.trim();if(!t||!/^(Adicionar|Nova|Novo|Editar)\b/.test(t))return;b.classList.add('hd-ic');if(!b.getAttribute('aria-label'))b.setAttribute('aria-label',t);if(!b.title)b.title=t})}
/* Campos estreitos das grades (Configurações › Viabilidade): texto inteiro na dica ao passar o mouse */
function uiDicas(){document.querySelectorAll('.vb-cfg-r select, .vb-cfg-r input:not([type=checkbox])').forEach(e=>{const t=e.tagName==='SELECT'?e.selectedOptions[0]?.text||'':e.value;if(e.title!==t)e.title=t})}
/* Quadros que rolam de lado (kanban, abas do estudo): o esmaecido da borda só aparece enquanto há coluna escondida */
function uiRolaFim(){document.querySelectorAll('.board, .vb-nav').forEach(b=>{const marca=()=>b.classList.toggle('fim',b.scrollLeft+b.clientWidth>=b.scrollWidth-24);
  if(!b.dataset.fimOk){b.dataset.fimOk='1';b.addEventListener('scroll',()=>requestAnimationFrame(marca),{passive:true});
    const at=b.querySelector('[aria-current="page"]');if(at&&b.scrollWidth>b.clientWidth){const x=at.offsetLeft-b.clientWidth/2+at.offsetWidth/2;if(x>0)b.scrollLeft=x}}marca()})}
addEventListener('resize',()=>uiRolaFim());
const _fmtVarre=fmtVarre;fmtVarre=function(){_fmtVarre();uiRotulos();uiThNum();uiInline();uiCfgCel();uiQuadros();uiCfgAba();uiBoardPontos();uiHdIc();uiDicas();uiRolaFim()};
/* Legenda do mapa: lembra se ficou aberta ou fechada */
document.addEventListener('toggle',e=>{if(e.target.classList?.contains('mp-legenda'))UI.mpLeg=e.target.open},true);

/* ===================== botão flutuante do celular ===================== */
/* Padrão Material: o "Novo terreno" estendido vira só o + ao rolar para baixo (cobre menos
   linhas da lista) e volta a mostrar o texto ao rolar para cima ou no topo da página. */
(()=>{let ult=0;const ver=()=>{const y=window.scrollY||document.documentElement.scrollTop||0;
  const min=y>48&&y>ult;if(y<=48||y<ult-4||min)document.body.classList.toggle('fab-min',min);ult=y};
  window.addEventListener('scroll',ver,{passive:true})})();

/* Quadros das abas da ficha (pedido do Moisés, 3/nov/2026): cada quadro abre e fecha pela seta do título e nasce fechado,
   menos o primeiro da aba. A escolha vale na sessão, por aba. Editar, abrir um formulário ou chegar a um item (log, aviso) abre o quadro dele. */
const QD={},QD_SETA='<svg class="bl-seta" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';
const qdCab=s=>s.querySelector(':scope > .sec-h, :scope > form > .sec-h');
function qdLista(){const pn=document.querySelector('.fi-aba .bl-c');if(!pn||UI.route!=='terreno')return [];const aba=abaN(UI.tab);if(aba==='geral'||aba==='historico')return [];
  const qs=[...pn.querySelectorAll('section.sec')].filter(s=>qdCab(s)&&!s.parentElement.closest('section.sec'));return qs.length<2?[]:qs}
function qdPor(s,ab){const b=s.querySelector(':scope .qd-tg');s.classList.toggle('qd-fechado',!ab);if(b)b.setAttribute('aria-expanded',String(ab));
  if(ab&&typeof ajustaTabelas==='function')ajustaTabelas(s)}  // a tabela só se mede aberta: a que não cabe vira lista
function uiQuadros(){const qs=qdLista();if(!qs.length)return;const aba=abaN(UI.tab);
  qs.forEach(s=>{if(!s.dataset.q){const h=qdCab(s).querySelector('h2');s.dataset.q=s.id||('t:'+(h?h.textContent:'').replace(/\d+/g,'').trim())}});
  const st=QD[aba]||(QD[aba]=new Set([qs[0].dataset.q]));
  qs.filter(s=>!s.dataset.qOk).forEach(s=>{s.dataset.qOk='1';const k=s.dataset.q,h2=qdCab(s).querySelector('h2');
    if(h2&&!h2.querySelector('.qd-tg')){const b=document.createElement('button');b.type='button';b.className='qd-tg';b.dataset.q=k;b.innerHTML=QD_SETA+'<span></span>';
      const sp=b.lastChild;while(h2.firstChild)sp.append(h2.firstChild);h2.append(b)}
    /* roteiros de teste antigos (navegador automatizado) mexem em quadros fechados: abrem todos, salvo quem testa os quadros (__qdReal) */
    if(navigator.webdriver&&!window.__qdReal)st.add(k);
    if(UI.edit&&(s.id==='sec-'+UI.edit||s.querySelector('#sec-'+CSS.escape(String(UI.edit)))||s.querySelector('.editando'))||s.querySelector('form[data-if-ok]:not(.if-fechado)'))st.add(k);
    qdPor(s,st.has(k))})}
/* abre o quadro (fechado) em que está o elemento: chamado por quem leva a um item da ficha */
function qdAbrirEl(el){const s=el&&el.closest&&el.closest('section.qd-fechado');if(!s)return;QD[abaN(UI.tab)]?.add(s.dataset.q);qdPor(s,true)}
document.addEventListener('click',e=>{const b=e.target.closest?.('.qd-tg');if(!b)return;e.preventDefault();e.stopPropagation();
  const s=b.closest('section.sec'),aba=abaN(UI.tab),st=QD[aba]||(QD[aba]=new Set()),ab=s.classList.contains('qd-fechado');
  ab?st.add(s.dataset.q):st.delete(s.dataset.q);qdPor(s,ab)},true);
