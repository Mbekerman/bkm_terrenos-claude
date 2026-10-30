/* =====================================================================
   Apontamento de horas (bloco 4; decisão do Moisés, 30/out/2026: sem
   aprovação). Espelha fluxo.apontamentos, tarefas.estimativa_min e
   fluxo.v_tarefa_horas. Cada pessoa aponta o próprio tempo (data, tempo,
   nota); quem edita o cartão aponta; só o autor ou o administrador mudam
   e apagam; nada no futuro nem mais de 24 h por pessoa no mesmo dia.
   Tempo aceita "1h30", "1:30", "1,5", "90 min" ou "45m". Injetado no
   mesmo escopo.
   ===================================================================== */
function hrMin(v){const s=String(v||'').trim().toLowerCase().replace(/\s/g,'');if(!s)return null;let m;
  if((m=/^(\d+)h(\d{1,2})?(min|m)?$/.exec(s)))return +m[1]*60+(+m[2]||0);
  if((m=/^(\d+):(\d{2})$/.exec(s)))return +m[1]*60+ +m[2];
  if((m=/^(\d+)(min|m)$/.exec(s)))return +m[1];
  if((m=/^(\d+(?:[.,]\d+)?)h?$/.exec(s)))return Math.round(parseFloat(m[1].replace(',','.'))*60);return NaN}
function hrTxt(min){if(min==null)return '—';const h=Math.floor(min/60),m=min%60;return h?`${h}h${m?String(m).padStart(2,'0'):''}`:`${m} min`}
const hrAps=k=>k.horas||(k.horas=[]);
const hrTotal=k=>(k.horas||[]).reduce((s,a)=>s+a.min,0);
const hrPode=(a)=>a.por===me()||ehAdmin(me());
/* frente do cartão: apontado / estimado */
function hrSelo(k){const tot=hrTotal(k);if(!tot&&!k.estim)return '';const est=k.estim,ac=est&&tot>est;
  return `<span class="tk-b ${ac?'hr-acima':''}" title="Horas apontadas${est?' / estimadas':''}">${ic('clock',14)}${hrTxt(tot)}${est?'/'+hrTxt(est):''}</span>`}
/* bloco do cartão */
function hrBlocoHtml(t,k,ro){const L=hrAps(k);if(!L.length&&!k.estim&&!UI.hrNovo)return '';const tot=hrTotal(k),est=k.estim,eu=me();
  const porP={};L.forEach(a=>porP[a.por]=(porP[a.por]||0)+a.min);
  const lin=L.slice().sort((a,b)=>b.data.localeCompare(a.data)||b.em.localeCompare(a.em)).map(a=>`<div class="hr-l"><span class="tkm-coa">${av(a.por,'sm')}</span>
    <span class="hr-lt"><b>${hrTxt(a.min)}</b> <span class="faint">· ${esc(a.por)} · ${fd(a.data)}</span>${a.nota?`<span class="hr-n">${esc(a.nota)}</span>`:''}</span>
    ${!ro&&hrPode(a)?`<button class="tkm-btn sm" data-a="hr-x" data-v="${a.id}" aria-label="Apagar o apontamento de ${hrTxt(a.min)} de ${fd(a.data)}">Apagar</button>`:''}</div>`).join('');
  const pct=est?Math.min(100,Math.round(tot/est*100)):0;
  return `<div class="tkm-bloco">${tkSecH('clock','Horas',ro||UI.hrNovo?'':`<button class="tkm-btn" data-a="hr-novo">Apontar</button>`)}<div class="tkm-in">
    <div class="hr-res"><span><b>${hrTxt(tot)}</b> apontadas</span>
      <label class="hr-est">Estimativa <input class="tkm-pill" data-hr="estim" value="${est?hrTxt(est):''}" placeholder="—" aria-label="Estimativa de horas" ${ro?'disabled':''}></label>
      ${est?`<span class="${tot>est?'hr-acima':'faint'}">${tot>est?`${hrTxt(tot-est)} acima`:`faltam ${hrTxt(est-tot)}`}</span>`:''}</div>
    ${est?`<div class="hr-bar ${tot>est?'acima':''}" role="img" aria-label="${pct}% da estimativa"><span style="width:${pct}%"></span></div>`:''}
    ${Object.keys(porP).length>1?`<div class="hr-pp">${Object.entries(porP).map(([u,m])=>`<span>${av(u,'sm')} ${hrTxt(m)}</span>`).join('')}</div>`:''}
    ${UI.hrNovo&&!ro?`<form class="hr-f" data-form="hr-novo"><input name="tempo" required placeholder="Tempo (1h30)" aria-label="Tempo" autocomplete="off"><input name="data" type="date" value="${HOJE}" max="${HOJE}" required aria-label="Data"><input name="nota" placeholder="O que foi feito (opcional)" aria-label="Nota"><button class="tkm-ok" type="submit">Apontar</button><button class="tkm-btn" type="button" data-a="hr-cancela">Cancelar</button></form>`:''}
    ${lin}</div></div>`}

document.addEventListener('change',e=>{const el=e.target;if(el.dataset?.hr!=='estim')return;e.stopImmediatePropagation();const {t,k}=tkAtual();if(!k||!vzEdita(t,k))return;
  const v=hrMin(el.value);if(Number.isNaN(v)||v===0){toast('Estimativa inválida. Use, por exemplo, 8h ou 1h30.',true);el.value=k.estim?hrTxt(k.estim):'';return}
  if((v||null)===(k.estim||null))return;log(t,`Tarefa "${k.titulo}": estimativa de ${hrTxt(k.estim)} para ${hrTxt(v)}`);k.estim=v||null;tkRe()},true);
document.addEventListener('click',e=>{const a=e.target.closest('[data-a^="hr-"]');if(!a)return;e.preventDefault();e.stopImmediatePropagation();const {t,k}=tkAtual();if(!k||!vzEdita(t,k))return;
  if(a.dataset.a==='hr-novo'){UI.hrNovo=true;tkRe();setTimeout(()=>document.querySelector('[data-form=hr-novo] [name=tempo]')?.focus(),0);return}
  if(a.dataset.a==='hr-cancela'){UI.hrNovo=false;tkRe();return}
  if(a.dataset.a==='hr-x'){const x=hrAps(k).find(y=>y.id===a.dataset.v);if(!x||!hrPode(x))return;if(!confirm(`Apagar o apontamento de ${hrTxt(x.min)} de ${fd(x.data)}?`))return;
    k.horas=hrAps(k).filter(y=>y!==x);log(t,`Tarefa "${k.titulo}": apontamento de ${hrTxt(x.min)} (${fd(x.data)}) apagado`);tkRe()}},true);
document.addEventListener('submit',e=>{const f=e.target;if(f.dataset?.form!=='hr-novo')return;e.preventDefault();e.stopImmediatePropagation();const {t,k}=tkAtual();if(!k||!vzEdita(t,k))return;
  const F=Object.fromEntries(new FormData(f)),m=hrMin(F.tempo),eu=me();
  if(!m||Number.isNaN(m)){toast('Tempo inválido. Use, por exemplo, 1h30, 45 min ou 1,5.',true);return}
  if(F.data>HOJE){toast('Não se apontam horas no futuro.',true);return}
  const dia=S.terrenos.flatMap(x=>x.tarefas||[]).flatMap(x=>x.horas||[]).filter(a=>a.por===eu&&a.data===F.data).reduce((s,a)=>s+a.min,0);
  if(dia+m>1440){toast('Mais de 24 horas apontadas no mesmo dia.',true);return}
  hrAps(k).push({id:uid(),por:eu,data:F.data,min:m,nota:F.nota.trim()||null,em:agora()});UI.hrNovo=false;
  log(t,`Tarefa "${k.titulo}": ${hrTxt(m)} apontadas por ${eu} (${fd(F.data)})`);toast(`${hrTxt(m)} apontadas.`);tkRe()},true);

/* exemplo: estimativa e horas apontadas em "Estudo de massa" */
(()=>{if(S.hrExemplo)return;S.hrExemplo=true;const t=S.terrenos?.[0];const k=t?.tarefas?.find(x=>x.titulo==='Estudo de massa');if(!k)return;
  k.estim=12*60;k.horas=[{id:uid(),por:'Ana Prado',data:addD(HOJE,-3),min:240,nota:'Implantação e cálculo de áreas',em:addD(HOJE,-3)+'T18:00'},
    {id:uid(),por:'Rafael Souza',data:addD(HOJE,-2),min:150,nota:'Conferência com o zoneamento',em:addD(HOJE,-2)+'T17:00'},{id:uid(),por:'Ana Prado',data:addD(HOJE,-1),min:90,nota:null,em:addD(HOJE,-1)+'T12:00'}]})();
