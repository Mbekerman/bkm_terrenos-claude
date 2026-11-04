/* Olhinho e lixeira nos logs (pedido do Moisés, 24/out/2026).
   Valem nas alterações de campos da ficha (não em etapa, subetapa, status, temperatura, propostas, documentos nem itens
   de listas) e só no log mais recente de cada campo: se o campo mudou depois, desfazer aquele log não teria efeito.
   - Olhinho: prévia só para quem olha. A ficha mostra o terreno sem aquela ação e o log fica riscado e apagado; nada
     é gravado. Clicar de novo religa. Qualquer edição na ficha encerra a prévia.
   - Lixeira (quem fez a ação, os superiores dela e o administrador): desfaz de verdade. O terreno volta ao valor de antes, o log original fica riscado com
     "Desfeito por" e entra um log novo "Desfeito: …". O histórico nunca é apagado (app.desfazer_alteracao no banco). */
const LOG_PREV={},LOG_CONF={};let LOG_OK=new Set();
const logK=h=>h.em+'|'+h.txt;
const logClone=v=>v==null?v:JSON.parse(JSON.stringify(v));
function logSet(t,k,v){const [a,b]=k.split('.');if(b){t[a]={...(t[a]||{})};if(v==null)delete t[a][b];else t[a][b]=logClone(v)}else if(v==null)delete t[a];else t[a]=logClone(v)}
/* o pino acompanha a poligonal */
function logPino(t){if(t.poly&&t.poly.length>=3&&typeof centroPoly==='function'){const c=centroPoly(t.poly);t.lat=+c[0].toFixed(7);t.lng=+c[1].toFixed(7)}}
function logDesfazivel(t,h,atual){
  if(!h.ks||!h.ant||!h.dep||h.desfeito||h.desfaz||h.ks.some(k=>/^neg\./.test(k)))return false;
  const a=atual||JSON.parse(retrato(t));return h.ks.every(k=>JSON.stringify(valCampo(a,k))===JSON.stringify(h.dep[k]??null))}
/* lixeira: quem fez a ação, os superiores dessa pessoa e o administrador (decisão do Moisés, 24/out/2026); Leitura nunca */
const logPodeApagar=h=>{const u=me();return UI.role!=='Leitura'&&!!h&&(h.user===u||ehAdmin(u)||ehSuperior(u,h.user))};
function logOffDe(t){const s=LOG_PREV[t.id];if(!s)return [];return t.hist.filter(h=>s.has(logK(h))&&LOG_OK.has(logK(h)))}
/* aplica a prévia (valores de antes das ações desligadas) e devolve o que precisa para restaurar */
function prevAplicar(t,off){const bk={};const guarda=a=>{if(!(a in bk))bk[a]=Object.prototype.hasOwnProperty.call(t,a)?logClone(t[a]):undefined};
  off.forEach(h=>h.ks.forEach(k=>{guarda(k.split('.')[0]);if(k==='poly'){guarda('lat');guarda('lng')}logSet(t,k,h.ant[k]);if(k==='poly')logPino(t)}));return bk}
function prevRestaurar(t,bk){Object.entries(bk).forEach(([a,v])=>{if(v===undefined)delete t[a];else t[a]=v})}
function comPrevia(fn){const t=T(UI.id);if(!t)return fn();const off=logOffDe(t);if(!off.length)return fn();const bk=prevAplicar(t,off);try{return fn()}finally{prevRestaurar(t,bk)}}
const _pgFichaLog=pgFicha;
pgFicha=function(){const t=T(UI.id);if(!t)return _pgFichaLog();const atual=JSON.parse(retrato(t));
  LOG_OK=new Set((t.hist||[]).filter(h=>logDesfazivel(t,h,atual)).map(logK));
  const off=logOffDe(t);if(!off.length)return _pgFichaLog();
  const html=comPrevia(_pgFichaLog);
  const bar=`<div class="log-previa" role="status">${OLHO}<span>Prévia sem ${off.length===1?'1 ação':off.length+' ações'} do histórico. Só você vê; nada foi gravado.</span><button class="btn sm text" data-a="log-prev-limpar">Mostrar tudo</button></div>`;
  return html.replace('<div class="ficha-main">','<div class="ficha-main log-prev-on">'+bar)};
const _initMiniLog=initMini;initMini=function(){return comPrevia(_initMiniLog)};
const OLHO='<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="1.75"/></svg>';
const OLHO_OFF='<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="1.75"/><path stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M4 4l16 16"/></svg>';
const LIXO='<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg>';
/* botões e aspecto de cada log no painel */
function logAcoesHtml(t,h,i){const k=logK(h);
  if(h.desfeito)return `<div class="pn-lx">Desfeito por ${esc(h.desfeito.user)}${hhmm(h.desfeito.em)?` · ${diaRot(h.desfeito.em.slice(0,10)).toLowerCase()}, ${hhmm(h.desfeito.em)}`:''}</div>`;
  if(!LOG_OK.has(k))return '';const off=!!LOG_PREV[t.id]?.has(k);
  if(LOG_CONF[t.id]===k)return `<div class="pn-lconf" role="group" aria-label="Confirmar"><span>Desfazer esta ação? O terreno volta ao que era antes, e fica registrado quem desfez.</span><span class="pn-lconf-b"><button class="btn sm text" data-a="log-apagar-nao">Cancelar</button><button class="btn sm primary crit" data-a="log-apagar-sim" data-i="${i}">Desfazer</button></span></div>`;
  return `<div class="pn-la"><button class="pn-lb ${off?'on':''}" data-a="log-olho" data-i="${i}" aria-pressed="${off}" title="${off?'Religar esta ação na prévia':'Ver o terreno sem esta ação (só você vê)'}" aria-label="${off?'Religar':'Ver sem'} esta ação">${off?OLHO_OFF:OLHO}</button>${logPodeApagar(h)?`<button class="pn-lb" data-a="log-apagar" data-i="${i}" title="Desfazer esta ação" aria-label="Desfazer esta ação">${LIXO}</button>`:''}</div>`}
const logOffCls=(t,h)=>h.desfeito?' desf':LOG_PREV[t.id]?.has(logK(h))&&LOG_OK.has(logK(h))?' off':'';
function logDesfazer(t,h){
  h.ks.forEach(k=>logSet(t,k,h.ant[k]));if(h.ks.includes('poly'))logPino(t);
  h.desfeito={user:me(),em:agora()};log(t,`Desfeito: ${h.txt}`);t.hist[t.hist.length-1].desfaz=logK(h);
  LOG_PREV[t.id]?.delete(logK(h));delete LOG_CONF[t.id];save();render();toast('Ação desfeita. O terreno voltou ao que era antes.')}
document.addEventListener('click',e=>{
  const a=e.target.closest('[data-a]');if(!a)return;const A=a.dataset.a;
  /* editar algo na ficha durante a prévia encerra a prévia antes */
  if(!A.startsWith('log-')&&a.closest('.ficha-main.log-prev-on')&&!['bloco','nav','tab'].includes(A)){const t=T(UI.id);if(t&&LOG_PREV[t.id]?.size){delete LOG_PREV[t.id];toast('Prévia encerrada: a ficha voltou aos dados gravados.')}return}
  if(!A.startsWith('log-'))return;e.stopPropagation();const t=T(UI.id);if(!t)return;const h=t.hist[+a.dataset.i];
  if(A==='log-olho'&&h){const s=LOG_PREV[t.id]=LOG_PREV[t.id]||new Set(),k=logK(h);s.has(k)?s.delete(k):s.add(k);render()}
  else if(A==='log-prev-limpar'){delete LOG_PREV[t.id];render()}
  else if(A==='log-apagar'&&h&&logPodeApagar(h)){LOG_CONF[t.id]=logK(h);render();document.querySelector('[data-a="log-apagar-sim"]')?.focus({preventScroll:true})}
  else if(A==='log-apagar-nao'){delete LOG_CONF[t.id];render()}
  else if(A==='log-apagar-sim'&&h&&logPodeApagar(h)&&logDesfazivel(t,h))logDesfazer(t,h)},true);
/* sem o painel (celular ou tela estreita), a seção Histórico usa os mesmos logs do painel, com filtros, olhinho e lixeira */
abaHist=function(t){return `<section class="sec pn-hist"><div class="sec-b">${pnLogs(t)}</div></section>`};
