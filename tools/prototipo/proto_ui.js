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
  const nomes=[...hd.children].map(x=>x.textContent.trim());[...r.children].forEach((c,i)=>{if(!i||!nomes[i]||!c.matches('input:not([type=checkbox]),select'))return;
    const w=document.createElement('label');w.className='cfg-cel';c.replaceWith(w);w.innerHTML=`<span class="cfg-cl">${nomes[i].replace(/[<&]/g,'')}</span>`;w.append(c)})})}
const _fmtVarre=fmtVarre;fmtVarre=function(){_fmtVarre();uiRotulos();uiThNum();uiInline();uiCfgCel()};
/* Legenda do mapa: lembra se ficou aberta ou fechada */
document.addEventListener('toggle',e=>{if(e.target.classList?.contains('mp-legenda'))UI.mpLeg=e.target.open},true);
