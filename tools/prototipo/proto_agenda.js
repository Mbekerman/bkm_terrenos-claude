/* ===== Reuniões com o Google Agenda (lote 6 da ficha em abas, 4/nov/2026) =====
   Marcar a reunião no sistema cria o evento na agenda de quem marcou, com convite aos participantes
   que têm e-mail e, online, o link do Meet; mudar ou cancelar no sistema muda lá. Depois da reunião
   online, a gravação e a transcrição do Meet chegam e a IA deixa um rascunho do que foi tratado e dos
   encaminhamentos, que quem edita confere. No protótipo o Google é simulado (no banco: reuniao_agenda,
   app.agenda_confirmar, app.registrar_resumo_ia, app.decidir_resumo_ia). */
const AG_RESP={sem_resposta:['Sem resposta',''],aceito:['Aceitou','good'],recusado:['Recusou','bad'],talvez:['Talvez','warn']};
const agEmail=n=>{const u=(n||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().trim().split(/\s+/);return u.length>1?u[0]+'.'+u[u.length-1]+'@bkm.com.br':u[0]+'@bkm.com.br'};
const agId=()=>Math.random().toString(36).slice(2,8);

/* campos a mais no formulário da reunião (só agendada; Meet só online) */
function reuAgendaDur(){return `
    <div class="field" data-so="agendada"><label for="ru-du">Duração</label><select id="ru-du" name="dur">${[[30,'30 min'],[60,'1 h'],[90,'1 h 30 min'],[120,'2 h']].map(([d,l])=>`<option value="${d}" ${d===60?'selected':''}>${l}</option>`).join('')}</select></div>`}
function reuAgendaCampos(){return `
    <div class="field full ag-chks" data-so="agendada"><label class="chk"><input type="checkbox" name="agenda" checked><span>Criar no Google Agenda e convidar os participantes</span></label>
      <label class="chk" data-so="online"><input type="checkbox" name="meet" checked><span>Com link do Meet <small class="faint">(grava e transcreve para o resumo)</small></span></label></div>
    <div class="field full" data-so="agendada" data-so2="agenda"><label for="ru-em">E-mails dos externos <small class="faint">(para o convite)</small></label><input id="ru-em" name="emails" inputmode="email" placeholder="carlos@exemplo.com, juliana@imobiliaria.com"></div>`}

function reuAgendaCriar(t,m,F){m.dur=+F.dur||60;if(F.status!=='agendada'||!F.agenda)return;
  const meet=m.modalidade==='online'&&!!F.meet,emails=(F.emails||'').split(/[,;\s]+/).map(x=>x.trim().toLowerCase()).filter(Boolean);
  const ruins=emails.filter(e=>!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e));if(ruins.length)toast(`E-mail com formato inválido ficou de fora: ${ruins.join(', ')}`,true);
  const bkm=(m.part.bkm||'').split(',').map(x=>x.trim()).filter(Boolean).filter(n=>n!==me());
  const id=agId();
  m.agenda={sit:'sincronizada',org:me(),evento:id,link:`https://calendar.google.com/calendar/event?eid=${id}`,meet:meet?`https://meet.google.com/${id.slice(0,3)}-${id.slice(2,6)}-${id.slice(3,6)}`:null,
    conv:[...bkm.map(n=>({nome:n,email:agEmail(n),resp:'sem_resposta'})),...emails.filter(e=>!ruins.includes(e)).map(e=>({nome:e,email:e,resp:'sem_resposta'}))]};
  log(t,`Reunião de ${fd(m.data)} criada no Google Agenda${meet?' com link do Meet':''}`)}

/* o que a reunião mostra da Agenda, da gravação e do resumo da IA */
function reuAgendaHtml(t,m){const a=m.agenda;if(!a)return '';const ro=!negAtiva(t)||UI.role==='Leitura';
  const resp=a.conv.length?`<div class="ag-conv">${a.conv.map(c=>`<span class="ag-c" title="${esc(c.email)}">${esc(c.nome)} <span class="chip ${AG_RESP[c.resp][1]}">${AG_RESP[c.resp][0]}</span></span>`).join('')}</div>`:'';
  const topo=`<div class="ag-l">${a.removida?`<span class="chip">Fora da Agenda</span>`:`<span class="chip blue">${ic('clock',14)}${m.status==='cancelada'?'Cancelada na Agenda':'No Google Agenda'}</span>
    <a class="btn text sm" href="${esc(a.link)}" target="_blank" rel="noopener">Abrir na Agenda</a>${a.meet&&m.status==='agendada'?`<a class="btn sm" href="${esc(a.meet)}" target="_blank" rel="noopener">${ic('link',16)}Entrar no Meet</a>`:''}`}
    ${!ro&&m.status==='agendada'?`<button class="btn text sm danger" data-a="ag-cancelar" data-k="${m.id}">Cancelar reunião</button>`:''}</div>`;
  let grav='';
  if(a.grav)grav=`<div class="ag-l ag-grav">${ic('doc',18)}<span>Do Meet:</span><a href="${esc(a.grav)}" target="_blank" rel="noopener">Gravação</a><a href="${esc(a.transc)}" target="_blank" rel="noopener">Transcrição</a></div>`;
  let ia='';
  if(a.ia?.sit==='rascunho'){ia=ro?`<div class="ag-ia"><div class="ag-ia-h">${ic('notas',18)}<b>Resumo da IA para conferir</b></div><div class="muted">Aguardando quem edita conferir.</div></div>`
    :`<form class="ag-ia" data-form="ag-ia" data-k="${m.id}"><div class="ag-ia-h">${ic('notas',18)}<b>Resumo da IA para conferir</b><small class="faint">pela transcrição do Meet; confira e ajuste antes de aceitar</small></div>
      <label class="field"><span class="lbl-f">O que foi tratado</span><textarea name="resumo" rows="4" data-mencao>${esc(a.ia.resumo)}</textarea></label>
      <label class="field"><span class="lbl-f">Encaminhamentos</span><textarea name="enc" rows="3" data-mencao>${esc(a.ia.enc||'')}</textarea></label>
      <div class="ag-ia-b"><button type="button" class="btn text" data-a="ag-ia-desc" data-k="${m.id}">Descartar</button><button class="btn primary">Aceitar resumo</button></div></form>`}
  return `<div class="ag">${topo}${m.status==='agendada'?resp:''}${grav}${ia}</div>`}

/* depois da reunião online: o Meet guarda a gravação e a transcrição e a IA escreve o rascunho (simulado) */
function reuAgendaRealizada(t,m){const a=m.agenda;if(!a||!a.meet||a.grav)return;
  a.grav=`https://drive.google.com/file/d/grav-${a.evento}`;a.transc=`https://docs.google.com/document/d/transc-${a.evento}`;
  const p=m.pauta||'a negociação';
  a.ia={sit:'rascunho',resumo:`Pauta: ${p}.\nO vendedor manteve o pedido e aceitou estudar permuta parcial; ficou de responder à contraproposta até sexta.\nO corretor confirmou que há outro interessado, sem proposta formal.`,
    enc:`${me()}: enviar a contraproposta revisada até amanhã.\nVendedor: responder até sexta.`};
  notificar(a.org,'reuniao_resumo',`Resumo da reunião de ${fd(m.data)} no ${t.codigo} pronto para conferir`,t,null,{b:'comercial',alvo:m.id});
  toast('O Meet guardou a gravação e a transcrição; o resumo da IA está para conferir.')}

document.addEventListener('click',e=>{const a=e.target.closest('[data-a^="ag-"]');if(!a||UI.route!=='terreno')return;const t=T(UI.id);if(!t)return;
  const m=(t.reunioes||[]).find(x=>x.id===a.dataset.k);if(!m)return;e.stopImmediatePropagation();if(UI.role==='Leitura')return;
  if(a.dataset.a==='ag-cancelar'){m.status='cancelada';log(t,`Reunião de ${fd(m.data)} cancelada${m.agenda?' (e na Agenda)':''}`);save();render();toast(m.agenda?'Reunião cancelada; os convidados recebem o cancelamento.':'Reunião cancelada.');return}
  if(a.dataset.a==='ag-ia-desc'){m.agenda.ia.sit='descartado';log(t,`Resumo da IA da reunião de ${fd(m.data)} descartado`);save();render();toast('Rascunho descartado.');return}},true);
document.addEventListener('submit',e=>{const f=e.target;if(f.dataset?.form!=='ag-ia')return;e.preventDefault();e.stopImmediatePropagation();const t=T(UI.id);if(!t)return;
  const m=(t.reunioes||[]).find(x=>x.id===f.dataset.k);if(!m?.agenda?.ia)return;
  if(m.status!=='realizada'){toast('Marque a reunião como realizada antes de aceitar o resumo.',true);return}
  const F=Object.fromEntries(new FormData(f));m.resumo=(F.resumo||'').trim()||m.agenda.ia.resumo;m.enc=(F.enc||'').trim()||m.agenda.ia.enc||m.enc;m.agenda.ia.sit='aceito';m.agenda.ia.por=me();
  mencionar(t,'',[m.resumo,m.enc].join('\n'),`na reunião de ${fd(m.data)}`,{b:'comercial',alvo:m.id});
  log(t,`Resumo da reunião de ${fd(m.data)} aceito`);save();render();toast('Resumo aceito.')},true);

/* exemplo: no terreno da primeira negociação ativa, uma reunião online feita ontem com o resumo para conferir
   e outra marcada para daqui a 3 dias, já no Google Agenda com as respostas dos convidados */
function agendaPreparar(){const N=cfg().notif;if(!N.reuniao_resumo)N.reuniao_resumo={ativo:true,dias:null,email:true};
  if(S.agendaEx)return;S.agendaEx=true;const t=S.terrenos.find(x=>negAtiva(x)&&(x.reunioes||[]).length);if(!t)return;
  const ext=(t.reunioes.find(r=>r.part?.ext)?.part.ext)||'Vendedor',bkm=t.resp||USERS[0];
  const r1={id:uid(),status:'realizada',data:addD(HOJE,-1),hora:'15:00',dur:60,modalidade:'online',local:null,endereco:'',part:{bkm,ext},pauta:'Contraproposta e forma de pagamento',resumo:'',enc:'',ata:null};
  const id1=agId();r1.agenda={sit:'sincronizada',org:bkm,evento:id1,link:`https://calendar.google.com/calendar/event?eid=${id1}`,meet:`https://meet.google.com/${id1.slice(0,3)}-${id1.slice(2,6)}-${id1.slice(3,6)}`,conv:[{nome:'carlos@exemplo.com',email:'carlos@exemplo.com',resp:'aceito'}]};
  r1.agenda.grav=`https://drive.google.com/file/d/grav-${id1}`;r1.agenda.transc=`https://docs.google.com/document/d/transc-${id1}`;
  r1.agenda.ia={sit:'rascunho',resumo:'O vendedor baixou o pedido para R$ 2,8 mi e aceita permuta de 10 unidades no lugar de parte do dinheiro.\nPediu o pagamento da entrada na assinatura do compromisso; a BKM propôs 30 dias depois da matrícula atualizada.',
    enc:`${bkm}: mandar a minuta do compromisso até sexta.\nVendedor: trazer a certidão de ônus atualizada.`};
  const id2=agId();const r2={id:uid(),status:'agendada',data:addD(HOJE,3),hora:'10:00',dur:60,modalidade:'online',local:null,endereco:'',part:{bkm:`${bkm}, Camila Torres`,ext},pauta:'Minuta do compromisso',resumo:'',enc:'',ata:null,
    agenda:{sit:'sincronizada',org:bkm,evento:id2,link:`https://calendar.google.com/calendar/event?eid=${id2}`,meet:`https://meet.google.com/${id2.slice(0,3)}-${id2.slice(2,6)}-${id2.slice(3,6)}`,
      conv:[{nome:'Camila Torres',email:agEmail('Camila Torres'),resp:'aceito'},{nome:'carlos@exemplo.com',email:'carlos@exemplo.com',resp:'talvez'},{nome:'juliana@imobiliaria.com',email:'juliana@imobiliaria.com',resp:'sem_resposta'}]}};
  t.reunioes.push(r1,r2)}
const _prepararAg=prepararDados;prepararDados=function(){_prepararAg.apply(this,arguments);agendaPreparar()};
agendaPreparar();
