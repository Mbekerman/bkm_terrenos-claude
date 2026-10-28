(function(){
"use strict";
/* ===================== utilidades ===================== */
const HOJE=(()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`})();
const pd=s=>{const [y,m,d]=s.slice(0,10).split('-').map(Number);return new Date(y,m-1,d)};
const iso=x=>`${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`;
const addD=(s,n)=>{const x=pd(s);x.setDate(x.getDate()+n);return iso(x)};
const diff=(a,b)=>Math.round((pd(b)-pd(a))/864e5);
const MES=['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
const fd=s=>{if(!s)return '—';const x=pd(s);return `${x.getDate()} ${MES[x.getMonth()]}${x.getFullYear()!==new Date().getFullYear()?' '+x.getFullYear():''}`};
const mi=v=>v==null?'—':'R$\u00a0'+(v/1e6).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+'\u00a0mi';
const brl=v=>v==null?'—':Number(v).toLocaleString('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0});
const brl2=v=>v==null?'—':Number(v).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const num=(v,d=0)=>v==null?'—':Number(v).toLocaleString('pt-BR',{maximumFractionDigits:d});
const m2=v=>v==null?'—':num(v,2)+'\u00a0m²';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const lerNum=s=>{if(s==null)return null;s=String(s).trim();if(!s)return null;const n=Number(s.replace(/\./g,'').replace(',','.').replace(/[^\d.-]/g,''));return isNaN(n)?null:n};
const digits=s=>String(s||'').replace(/\D/g,'');
const $=s=>document.querySelector(s);
const uid=()=>Math.random().toString(36).slice(2,9);
const P={
  search:'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4',download:'M12 4v11M7 10l5 5 5-5M5 20h14',
  home:'M4 11 12 4l8 7v8a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1z',layers:'M12 4 3 9l9 5 9-5zM3 14l9 5 9-5',
  board:'M4 5h4v14H4zM10 5h4v9h-4zM16 5h4v12h-4z',doc:'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h4',
  add:'M12 5v14M5 12h14',back:'M19 12H5M11 6l-6 6 6 6',check:'M5 12.5 10 17 19 7',
  warn:'M12 4 2.5 20h19zM12 10v4.5M12 17.2v.1',clock:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3.5 2.5',
  upload:'M12 16V4M7 9l5-5 5 5M5 20h14',close:'M6 6l12 12M18 6 6 18',
  chev:'M9 6l6 6-6 6',pause:'M9 5v14M15 5v14',
  block:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM5.6 5.6l12.8 12.8',
  link:'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  fwd:'M5 12h14M13 6l6 6-6 6',edit:'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
  money:'M4 7h16v10H4zM12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM7 10v4M17 10v4',
  recolher:'M13 6l-6 6 6 6M19 6l-6 6 6 6',tela:'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',eu:'M12 5a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM12 2v3M12 19v3M2 12h3M19 12h3',telaSair:'M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5',expandir:'M11 6l6 6-6 6M5 6l6 6-6 6',
  lugar:'M12 21s-6-5.6-6-10.5a6 6 0 0 1 12 0C18 15.4 12 21 12 21zM12 8.5a2 2 0 1 0 0 4 2 2 0 0 0 0-4z',
  rota:'M12 2.8 21.2 12 12 21.2 2.8 12zM9 14v-3h6M12.8 8.8 15 11l-2.2 2.2',lixo:'M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13M10 11v5.5M14 11v5.5',
  task:'M9 4h6v3H9zM9 5.5H6a1 1 0 0 0-1 1V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V6.5a1 1 0 0 0-1-1h-3M8.5 14l2.5 2.5 4.5-5'
};
const ic=(n,s=20)=>`<svg class="ic" viewBox="0 0 24 24" width="${s}" height="${s}" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" d="${P[n]}"/></svg>`;
const BI={
  terrenos:'<path d="M20 14 L76 14 Q82 14 82 20 L82 76 Q82 82 76 82 L20 82 Q14 82 14 76 L14 20 Q14 14 20 14 Z" fill="none" style="stroke:var(--marinho)" stroke-width="3.03" stroke-linecap="round" stroke-linejoin="round"/><path d="M48 14 L48 82" fill="none" style="stroke:var(--marinho)" stroke-width="3.03" stroke-linecap="round" stroke-linejoin="round"/><path d="M14 48 L82 48" fill="none" style="stroke:var(--marinho)" stroke-width="3.03" stroke-linecap="round" stroke-linejoin="round"/><path d="M58 55 L72 55 Q75 55 75 58 L75 72 Q75 75 72 75 L58 75 Q55 75 55 72 L55 58 Q55 55 58 55 Z" fill="none" style="stroke:var(--azul-bkm)" stroke-width="3.03" stroke-linecap="round" stroke-linejoin="round"/>',
  mapa:'<path d="M12 24 L34 16 L62 24 L84 16 L84 72 L62 80 L34 72 L12 80 L12 24" fill="none" style="stroke:var(--marinho)" stroke-width="3.03" stroke-linecap="round" stroke-linejoin="round"/><path d="M34 16 L34 72" fill="none" style="stroke:var(--marinho)" stroke-width="3.03" stroke-linecap="round" stroke-linejoin="round"/><path d="M62 24 L62 80" fill="none" style="stroke:var(--marinho)" stroke-width="3.03" stroke-linecap="round" stroke-linejoin="round"/><path d="M48 54 C45.2 49.68 40 44 40 38 A8 8 0 0 1 56 38 C56 44 50.8 49.68 48 54 Z" fill="none" style="stroke:var(--azul-bkm)" stroke-width="3.03" stroke-linecap="round" stroke-linejoin="round"/><path d="M45 38 A3 3 0 1 0 51 38 A3 3 0 1 0 45 38 Z" fill="none" style="stroke:var(--azul-bkm)" stroke-width="3.03" stroke-linecap="round" stroke-linejoin="round"/>',
  casa:'<path d="M16 43 L48 12 L80 43 L80 73 C80 79 77 82 71 82 L25 82 C19 82 16 79 16 73 L16 43" fill="none" style="stroke:var(--marinho)" stroke-width="3.03" stroke-linecap="round" stroke-linejoin="round"/> <path d="M39 81 L39 57 L57 57 L57 81" fill="none" style="stroke:var(--azul-bkm)" stroke-width="3.03" stroke-linecap="round" stroke-linejoin="round"/>',
  planta:'<path d="M18 52 L18 20 L78 20 L78 80 L18 80 L18 70 M48 20 L48 46 M48 62 L48 80 M48 48 L78 48" fill="none" style="stroke:var(--marinho)" stroke-width="3.03" stroke-linecap="round" stroke-linejoin="round"/> <path d="M18 52 L36 52 C36 62 28 70 18 70" fill="none" style="stroke:var(--azul-bkm)" stroke-width="3.03" stroke-linecap="round" stroke-linejoin="round"/>',
  indicadores:'<path d="M14 15 L14 82 L85 82 M27 81 L27 52 L38 52 L38 81 M65 81 L65 20 L77 20 L77 81" fill="none" style="stroke:var(--marinho)" stroke-width="3.03" stroke-linecap="round" stroke-linejoin="round"/> <path d="M46 81 L46 36 L58 36 L58 81" fill="none" style="stroke:var(--azul-bkm)" stroke-width="3.03" stroke-linecap="round" stroke-linejoin="round"/>',
  documento:'<path d="M24 12 L59 12 L77 30 L77 77 C77 82 74 84 69 84 L27 84 C22 84 19 82 19 77 L19 19 C19 14 21 12 24 12 Z M59 12 L59 31 L77 31" fill="none" style="stroke:var(--marinho)" stroke-width="3.03" stroke-linecap="round" stroke-linejoin="round"/> <path d="M31 46 L65 46 M31 58 L65 58 M31 70 L51 70" fill="none" style="stroke:var(--azul-bkm)" stroke-width="3.03" stroke-linecap="round" stroke-linejoin="round"/>',
  busca:'<path d="M67 40 C67 54.359 55.359 66 41 66 C26.641 66 15 54.359 15 40 C15 25.641 26.641 14 41 14 C55.359 14 67 25.641 67 40 Z" fill="none" style="stroke:var(--marinho)" stroke-width="3.03" stroke-linecap="round" stroke-linejoin="round"/> <path d="M59 59 L83 83" fill="none" style="stroke:var(--marinho)" stroke-width="3.03" stroke-linecap="round" stroke-linejoin="round"/> <path d="M29 29 C32 25 36 23 42 23" fill="none" style="stroke:var(--azul-bkm)" stroke-width="3.03" stroke-linecap="round" stroke-linejoin="round"/>',
  checklist:'<path d="M27 17 L72 17 C75 17 78 20 78 23 L78 77 C78 80 75 83 72 83 L27 83 C24 83 21 80 21 77 L21 23 C21 20 24 17 27 17 Z" fill="none" style="stroke:var(--marinho)" stroke-width="3.03" stroke-linecap="round" stroke-linejoin="round"/> <path d="M40 11 L58 11 C60 11 62 13 62 15 L62 20 C62 22 60 24 58 24 L40 24 C38 24 36 22 36 20 L36 15 C36 13 38 11 40 11 Z" fill="none" style="stroke:var(--marinho)" stroke-width="3.03" stroke-linecap="round" stroke-linejoin="round"/> <path d="M29 41 L33 45 L40 36 M29 61 L33 65 L40 56" fill="none" style="stroke:var(--azul-bkm)" stroke-width="3.03" stroke-linecap="round" stroke-linejoin="round"/> <path d="M48 41 L66 41 M48 61 L66 61" fill="none" style="stroke:var(--marinho)" stroke-width="3.03" stroke-linecap="round" stroke-linejoin="round"/>',
  contrato:'<path d="M50 83 L22 83 C18 83 15 80 15 76 L15 19 C15 15 18 12 22 12 L56 12 L70 26 L70 44 M53 12 L53 29 L70 29 M28 39 L47 39 M28 51 L42 51" fill="none" style="stroke:var(--marinho)" stroke-width="3.03" stroke-linecap="round" stroke-linejoin="round"/> <path d="M43 83 L47 69 L73 43 L83 53 L57 79 L43 83 M67 49 L77 59" fill="none" style="stroke:var(--azul-bkm)" stroke-width="3.03" stroke-linecap="round" stroke-linejoin="round"/>',
  financeiro:'<path d="M14 61 C14 53 45 53 45 61 C45 69 14 69 14 61 L14 75 C14 83 45 83 45 75 L45 61 M14 69 C14 77 45 77 45 69 M51 45 C51 37 82 37 82 45 C82 53 51 53 51 45 L51 74 C51 82 82 82 82 74 L82 45 M51 59 C51 67 82 67 82 59" fill="none" style="stroke:var(--marinho)" stroke-width="3.03" stroke-linecap="round" stroke-linejoin="round"/> <path d="M24 37 L38 23 L52 23 M45 16 L52 23 L45 30" fill="none" style="stroke:var(--azul-bkm)" stroke-width="3.03" stroke-linecap="round" stroke-linejoin="round"/>',
  construcao:'<path d="M30 83 L30 25 L43 25 L43 83 M21 83 L53 83 M15 25 L83 25 L66 12 L30 12 L15 25 M43 13 L43 25 M30 38 L43 51 L30 64 L43 77" fill="none" style="stroke:var(--marinho)" stroke-width="3.03" stroke-linecap="round" stroke-linejoin="round"/> <path d="M73 26 L73 52 C73 61 62 61 62 54" fill="none" style="stroke:var(--azul-bkm)" stroke-width="3.03" stroke-linecap="round" stroke-linejoin="round"/>',
  localizacao:'<path d="M48 83 C42 75 21 53 21 36 C21 21 33 11 48 11 C63 11 75 21 75 36 C75 53 54 75 48 83 Z" fill="none" style="stroke:var(--marinho)" stroke-width="3.03" stroke-linecap="round" stroke-linejoin="round"/> <path d="M58 36 C58 41.523 53.523 46 48 46 C42.477 46 38 41.523 38 36 C38 30.477 42.477 26 48 26 C53.523 26 58 30.477 58 36 Z" fill="none" style="stroke:var(--azul-bkm)" stroke-width="3.03" stroke-linecap="round" stroke-linejoin="round"/>',
  config:'<path d="M14 26 L82 26 M14 48 L82 48 M14 70 L82 70" fill="none" style="stroke:var(--marinho)" stroke-width="3.03" stroke-linecap="round" stroke-linejoin="round"/> <path d="M36 19 A7 7 0 1 0 36 33 A7 7 0 1 0 36 19 Z M62 41 A7 7 0 1 0 62 55 A7 7 0 1 0 62 41 Z M30 63 A7 7 0 1 0 30 77 A7 7 0 1 0 30 63 Z" style="fill:var(--superficie,#fff);stroke:var(--azul-bkm)" stroke-width="3.03" stroke-linecap="round" stroke-linejoin="round"/>',
  tempo:'<path d="M82 48 C82 66.778 66.778 82 48 82 C29.222 82 14 66.778 14 48 C14 29.222 29.222 14 48 14 C66.778 14 82 29.222 82 48 Z" fill="none" style="stroke:var(--marinho)" stroke-width="3.03" stroke-linecap="round" stroke-linejoin="round"/> <path d="M48 26 L48 49 L65 60" fill="none" style="stroke:var(--azul-bkm)" stroke-width="3.03" stroke-linecap="round" stroke-linejoin="round"/> <path d="M48 14 L48 18 M82 48 L78 48 M48 82 L48 78 M14 48 L18 48" fill="none" style="stroke:var(--marinho)" stroke-width="3.03" stroke-linecap="round" stroke-linejoin="round"/>'
};
const bi=(n,s=32)=>`<svg class="bkm-ico" viewBox="0 0 96 96" width="${s}" height="${s}" style="width:${s}px;height:${s}px" aria-hidden="true">${BI[n]}</svg>`;

/* ===================== domínio ===================== */
const OPT={
  zona:{leste:'Leste',oeste:'Oeste',norte:'Norte',sul:'Sul',centro:'Centro',sudeste:'Sudeste',sudoeste:'Sudoeste',nordeste:'Nordeste',noroeste:'Noroeste'},
  prioridade:{baixa:'Baixa',media:'Média',alta:'Alta',estrategica:'Estratégica'},
  origem:{prospeccao:'Prospecção própria',corretor:'Corretor',indicacao:'Indicação',portal:'Portal',proprietario:'Proprietário direto',outro:'Outro'},
  precisao:{nao_informada:'Não informada',aproximada:'Aproximada',conferida:'Conferida'},
  fonteArea:{documental:'Documental (matrícula)',cadastral:'Cadastral (IPTU)',levantamento:'Levantamento topográfico',estimativa:'Estimativa',poligonal:'Poligonal (desenho no mapa)'},
  topografia:{nao_informado:'Não informado',plano:'Plano',aclive:'Aclive',declive:'Declive',irregular:'Irregular'},
  posicao:{nao_informado:'Não informado',meio_quadra:'Meio de quadra',esquina:'Esquina',duas_frentes:'Duas frentes',quadra_inteira:'Quadra inteira'},
  formato:{nao_informado:'Não informado',regular:'Regular',irregular:'Irregular'},
  ocupacao:{nao_informado:'Não informado',vazio:'Vazio',ocupado:'Ocupado',parcialmente_ocupado:'Parcialmente ocupado'},
  demolicao:{nao_avaliada:'Não avaliada',provavel:'Provável',confirmada:'Confirmada',dispensada:'Dispensada'},
  forma:{dinheiro:'Dinheiro',permuta_fisica:'Permuta Física',permuta_financeira:'Permuta Financeira',permuta_geral:'Permuta Geral',permuta_com_torna:'Permuta Com Torna'},
  statusProp:{rascunho:'Rascunho',apresentada:'Apresentada',em_analise:'Em análise',aceita:'Aceita',recusada:'Recusada',expirada:'Expirada',retirada:'Retirada',substituida:'Substituída'},
  statusTar:{pendente:'Pendente',em_andamento:'Em andamento',aguardando_terceiro:'Aguardando terceiro',concluida:'Concluída',cancelada:'Cancelada'},
  prioTar:{baixa:'Baixa',media:'Média',alta:'Alta'},
  papel:{proprietario:'Proprietário',representante:'Representante',procurador:'Procurador',contato:'Contato'},
  tipoPessoa:{PF:'Pessoa física',PJ:'Pessoa jurídica'},
  limite:{nao_informado:'Não informado',limitado:'Limitado',sem_limite:'Sem limite identificado'},
  sitIptu:{nao_informada:'Não informada',tributado:'Tributado',isento:'Isento'},
  confr:{frente:'Frente',lateral_direita:'Lateral direita',lateral_esquerda:'Lateral esquerda',fundos:'Fundos',outro:'Outro'},
  catDil:{documental:'Documental',juridica:'Jurídica',ambiental:'Ambiental',ocupacional:'Ocupacional',tecnica:'Técnica',outra:'Outra'},
  sitDil:{nao_avaliada:'Não avaliada',em_analise:'Em análise',pendente:'Pendente',resolvida:'Resolvida',impeditiva:'Impeditiva'}
};
const TEMP=['','Muito fria','Fria','Morna','Quente','Muito quente'];
/* funil (no banco: etapas_modelo, subetapas_modelo, status_modelo, prerequisitos_modelo, checklist_modelo,
   motivos_encerramento e tipos_notificacao; cada empresa tem a sua cópia, editada em Configurações › Funil) */
const CFG_PADRAO=()=>({
  etapas:[{k:'triagem',nome:'Em Triagem',sla:10,g:false,d:false,modo:'sequencia'},{k:'estudos',nome:'Estudos Preliminares',sla:20,g:false,d:false,modo:'sequencia'},
    {k:'negociacao',nome:'Negociação',sla:60,g:false,d:false,modo:'sequencia'},{k:'contrato',nome:'Contrato',sla:30,g:true,d:false,modo:'sequencia'}],
  subs:[['triagem','aguardando_informacoes','Aguardando Informações'],['triagem','aguardando_documentos','Aguardando Documentos'],['triagem','verificacao_interna','Verificação Interna'],
    ['estudos','estudo_massa','Estudo de Massa'],['estudos','estudo_viabilidade','Estudo de Viabilidade'],['estudos','analise_tecnica','Análise Técnica Preliminar'],
    ['negociacao','aguardando_reuniao','Aguardando Primeira Reunião'],['negociacao','preparando_proposta','Preparando Proposta'],['negociacao','proposta_enviada','Proposta Enviada',15],['negociacao','contra_proposta','Contra Proposta',10],
    ['contrato','em_elaboracao','Em Elaboração'],['contrato','contrato_enviado','Contrato Enviado'],['contrato','em_ajuste','Em Ajuste']]
    .map(([etapa,k,nome,prazo],i)=>({k,etapa,nome,ordem:i+1,prazo:prazo||null,g:false,d:false,modo:'sequencia',ativo:true})),
  status:{comprado:{g:true,d:true,modo:'sequencia'},perdido:{g:false,d:false,modo:'sequencia'},descartado:{g:false,d:false,modo:'sequencia'},stand_by:{g:false,d:false,modo:'sequencia'}},
  prereq:[{id:'pr1',alvoTipo:'etapa',alvo:'negociacao',req:'estudo_viabilidade'}],
  checklist:{contrato:[['matricula',1],['onus',1],['iptu',1],['vend',1],['topo',1],['sond',0],['amb',0],['minuta',1]].map(([doc,o])=>({doc,obrig:!!o}))},
  motivos:{descartado:[['tecnica','Inviabilidade Técnica'],['financeira','Inviabilidade Financeira'],['contratual','Inviabilidade Contratual'],['formato_negocio','Inviabilidade Formato de Negócio'],['garantias','Inviabilidade Garantias'],['urbanistica','Inviabilidade Urbanística'],['documental','Inviabilidade Documental'],['outros','Outros',1]].map(([k,nome,tx])=>({k,nome,texto:!!tx,ativo:true})),
    perdido:[['vendido_terceiro','Vendido para terceiro'],['desistiu_vender','Proprietário desistiu de vender'],['preco_pagamento','Vendedor não aceitou preço ou pagamento'],['formato','Vendedor não aceitou o formato (permuta etc.)'],['garantias','Vendedor não aceitou as garantias'],['sem_retorno','Sem retorno do proprietário'],['outros','Outros',1]].map(([k,nome,tx])=>({k,nome,texto:!!tx,ativo:true}))},
  notif:{tarefa_atribuida:{ativo:true,dias:null},tarefa_marcado:{ativo:true,dias:null},tarefa_prazo:{ativo:true,dias:[0]},tarefa_atrasada:{ativo:true,dias:null},subetapa_prazo:{ativo:true,dias:null},
    stand_by_retomar:{ativo:true,dias:[7,0]},documento_vencendo:{ativo:true,dias:[30,7]},reuniao_agendada:{ativo:true,dias:[1]},aprovacao_pendente:{ativo:true,dias:null},aprovacao_decidida:{ativo:true,dias:null}}
});
const CFG0=CFG_PADRAO();
const cfg=()=>(typeof S!=='undefined'&&S&&S.cfg)||CFG0;
const STAGES=CFG0.etapas.map(e=>[e.k,e.nome]); // sempre igual a cfg().etapas (syncCfg)
const etapaCfg=k=>cfg().etapas.find(e=>e.k===k);
const subsDe=e=>cfg().subs.filter(s=>s.etapa===e&&s.ativo).sort((a,b)=>a.ordem-b.ordem);
const subInicial=e=>subsDe(e)[0]?.k||null;
const subN=k=>(cfg().subs.find(s=>s.k===k)||{}).nome||k||'';
const STATUS_N={ativo:'Ativo',comprado:'Comprado',perdido:'Perdido',descartado:'Descartado',stand_by:'Stand By'};
const motivoN=(st,k)=>((cfg().motivos[st]||[]).find(m=>m.k===k)||{}).nome||k||'';
const SIDX=k=>STAGES.findIndex(s=>s[0]===k);const SN=k=>(STAGES.find(s=>s[0]===k)||[,k])[1];
const INFRA=[['energia','Energia'],['agua','Água'],['esgoto','Esgoto'],['gas','Gás canalizado'],['asfalto','Asfalto'],['drenagem','Drenagem pluvial'],['iluminacao','Iluminação pública'],['calcada','Calçada'],['fibra','Telefonia / fibra óptica']];
const ZONEAMENTOS=['ZEU','ZEUa','ZEUP','ZEUPa','ZEM','ZEMP','ZC','ZCa','ZC-ZEIS','ZCOR-1','ZCOR-2','ZCOR-3','ZM','ZMa','ZMIS','ZMISa','ZEIS-1','ZEIS-2','ZEIS-3','ZEIS-4','ZEIS-5','ZDE-1','ZDE-2','ZPI-1','ZPI-2','ZER-1','ZER-2','ZERa','ZPR','ZEP','ZEPAM','ZPDS','ZOE'];
const TIPOS_DOC={ata:['Ata de reunião','Reuniões',null],matricula:['Matrícula atualizada','Imóvel',30],onus:['Certidão de ônus reais','Imóvel',30],iptu:['Certidão negativa de IPTU','Imóvel',90],vend:['Certidões pessoais do vendedor','Vendedor',30],topo:['Levantamento planialtimétrico','Técnico',null],sond:['Sondagem SPT','Técnico',null],amb:['Avaliação ambiental preliminar','Técnico',null],minuta:['Minuta de promessa de compra e venda','Contratos',null],foto:['Foto','Mídia',null],planta:['Planta ou croqui','Técnico',null],lote_pdf:['Planta do lote da prefeitura (PDF)','Técnico',null],lote_dxf:['Desenho do lote da prefeitura (DXF)','Técnico',null],topo_pdf:['Topográfico preliminar (PDF)','Técnico',null],topo_dxf:['Topográfico preliminar (DXF + imagem)','Técnico',null]};
const CHECK_DIL=[['matricula',1],['onus',1],['iptu',1],['vend',1],['topo',1],['sond',0],['amb',0],['minuta',1]];
const USERS=['Moisés','Ana Prado','Camila Torres','Rafael Souza'];
/* hierarquia: N analistas → 1 gestor; N gestores → 1 diretor. Administrador é permissão à parte */
const MEMBROS_PADRAO=()=>[{nome:'Moisés',papel:'diretor',sup:null,admin:true},{nome:'Ana Prado',papel:'gestor',sup:'Moisés',admin:false},{nome:'Camila Torres',papel:'gestor',sup:'Moisés',admin:false},
  {nome:'Rafael Souza',papel:'analista',sup:'Ana Prado',admin:false},{nome:'Lúcia Mendes',papel:'leitura',sup:null,admin:false}];
const ROLE_USER={Diretor:'Moisés',Gestor:'Ana Prado',Analista:'Rafael Souza',Leitura:'Lúcia Mendes'};
const AVC={'Lúcia Mendes':'--av2','Moisés':'--av1','Ana Prado':'--av2','Rafael Souza':'--av3','Camila Torres':'--av4'};
const ini=n=>String(n||'?').split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase();
const av=(n,c='')=>`<span class="avatar ${c}" style="background:var(${AVC[n]||'--av3'})" title="${esc(n)}">${esc(ini(n))}</span>`;

/* ===================== dados de exemplo ===================== */
let NEG_SEQ=100;
function seed(){
  const H=n=>addD(HOJE,-n);
  const eixos=[{id:'e1',nome:'Eixo Cupecê'},{id:'e2',nome:'Eixo Interlagos'},{id:'e3',nome:'Eixo Radial Leste'},{id:'e4',nome:'Eixo Inajar de Souza'},{id:'e5',nome:'Eixo Raposo Tavares'}];
  const corretores=[{id:'c1',nome:'Marcos Lemos',creci:'123.456-F',imob:'Lemos Imóveis'},{id:'c2',nome:'Juliana Reis',creci:'98.765-F',imob:'Prime Terrenos'},{id:'c3',nome:'Paulo Nunes',creci:'45.210-F',imob:'Zona Leste Áreas'}];
  const base=(o)=>Object.assign({id:uid(),situacao:'ativo',prioridade:null,descricao:'',url:'',obs:'',cep:'',complemento:'',referencia:'',lat:null,lng:null,precisao:'nao_informada',
    municipio:'São Paulo · SP',aDoc:null,aCad:null,aLev:null,aEst:null,fonteArea:null,testada:null,topografia:'nao_informado',desnivel:null,posicao:'nao_informado',formato:'nao_informado',ocupacao:'nao_informado',
    uso:'',aConst:null,aDemolir:null,demolicao:'nao_avaliada',obsFis:'',eixo:null,mats:[],insc:[],confr:[],dilig:[],pessoas:[],corretores:[],infra:{},analises:[],ofertas:[],neg:null,propostas:[],reunioes:[],tarefas:[],docs:[],hist:[]},o);
  /* negociação de exemplo: trilha passando pelas subetapas até a atual (dSub = dias na subetapa atual) */
  const neg=(etapa,sub,dias,extra,dSub)=>{const ix=STAGES.findIndex(s=>s[0]===etapa),tr=[];let pe=null,ps=null;
    for(let i=0;i<=ix;i++){const e=STAGES[i][0],subs=subsDe(e).map(x=>x.k),cur=i===ix,ate=cur?subs.slice(0,subs.indexOf(sub)+1):subs,ini=cur?dias:dias+12*(ix-i),fim=cur?(dSub??Math.min(dias,4)):dias+12*(ix-i-1);
      ate.forEach((s,j)=>{const d=j===0?ini:Math.round(ini-(ini-fim)*j/(cur?Math.max(1,ate.length-1):ate.length));tr.push({em:H(d)+'T09:00:00.000',user:null,ev:j?'subetapa':i?'avanco':'abertura',deEtapa:pe,deSub:ps,paraEtapa:e,paraSub:s,status:'ativo'});pe=e;ps=s})}
    const n=Object.assign({codigo:'NEG-'+String(++NEG_SEQ).padStart(5,'0'),etapa,sub,status:'ativo',desde:H(dias),subDesde:tr[tr.length-1].em.slice(0,10),temp:null,ofRef:null,viab:null,trilha:tr,pedido:null},extra||{});
    if(n.status!=='ativo')tr.push({em:n.encerradoEm+'T10:00:00.000',user:null,ev:{comprado:'compra',perdido:'perda',descartado:'descarte',stand_by:'stand_by'}[n.status],deEtapa:etapa,deSub:sub,paraEtapa:etapa,paraSub:sub,status:n.status});
    return n};
  const infra=(o)=>{const r={};for(const [k,v] of Object.entries(o))r[k]={d:v,data:H(20),fonte:'Visita ao local',obs:''};return r};
  const T=[];
  // 1 — completo, em proposta
  T.push(base({codigo:'TER-000123',nome:'Terreno Av. Cupecê — esquina',descricao:'Esquina com duas frentes, plano, ocupado por galpão a demolir.',prioridade:'alta',resp:'Ana Prado',origem:'corretor',dataIdent:H(62),
    cep:'04366-000',logradouro:'Av. Cupecê',numero:'5.120',bairro:'Cidade Ademar',zona:'sul',eixo:'e1',referencia:'Em frente ao terminal Cidade Ademar',lat:-23.6681,lng:-46.6513,precisao:'conferida',
    aDoc:2000,aCad:1985,aLev:1920,fonteArea:'levantamento',testada:42,topografia:'plano',desnivel:0.8,posicao:'esquina',formato:'regular',ocupacao:'ocupado',uso:'Galpão de depósito',aConst:860,aDemolir:860,demolicao:'confirmada',obsFis:'Galpão com cobertura de fibrocimento: prever destinação adequada na demolição.',
    mats:[{num:'184.552',cri:'11º CRI',area:2000,data:H(40)}],
    insc:[{sql:'089.123.0045-6',area:1985,valores:[{ex:2025,rev:1,vig:true,vt:3300000,vc:500000,sit:'tributado',iptu:41200,parc:10,mensal:null,fonte:'Carnê 2025',data:H(300)},{ex:2026,rev:1,vig:false,vt:3600000,vc:520000,sit:'tributado',iptu:45300,parc:10,mensal:null,fonte:'Carnê 2026',data:H(200)},{ex:2026,rev:2,vig:true,vt:3600000,vc:520000,sit:'tributado',iptu:45300,parc:10,mensal:4530,fonte:'Certidão de dados cadastrais',data:H(20)}]}],
    confr:[{tipo:'frente',m:42,conf:'Av. Cupecê'},{tipo:'lateral_direita',m:48.5,conf:'Rua Benedito Mendes (esquina)'},{tipo:'fundos',m:41,conf:'Lote 12 · matrícula 184.553'},{tipo:'lateral_esquerda',m:47.2,conf:'Lote 08 · matrícula 184.540'}],
    dilig:[{id:uid(),cat:'ambiental',titulo:'Passivo do galpão (fibrocimento) na demolição',sit:'resolvida',resp:'Rafael Souza',prov:'Orçamento de descarte com empresa licenciada.'},{id:uid(),cat:'juridica',titulo:'Procuração do representante da Construpar',sit:'pendente',resp:'Ana Prado',prov:'Pedir procuração atualizada com poderes para vender.'}],
    pessoas:[{nome:'Construpar Participações Ltda.',tipo:'PJ',papel:'proprietario',pct:100,tel:''},{nome:'Dr. Álvaro Mendes',tipo:'PF',papel:'procurador',pct:null,tel:'(11) 98888-1234'}],
    corretores:[{cid:'c1',principal:true},{cid:'c2',principal:false}],
    infra:infra({energia:'sim',agua:'sim',esgoto:'sim',gas:'nao',asfalto:'sim',drenagem:'sim',iluminacao:'sim',calcada:'sim',fibra:'sim'}),
    analises:[{id:uid(),data:H(50),fonte:'GeoSampa',status:'substituida',zonas:[{sigla:'ZM',area:2000,ins:'089.123.0045-6',macro:null,exc:null,obs:''}]},
              {id:uid(),data:H(18),fonte:'Certidão de uso do solo',status:'vigente',zonas:[{sigla:'ZEU',area:1400,ins:'089.123.0045-6',macro:null,exc:null,obs:'Eixo de transformação urbana'},{sigla:'ZM',area:520,ins:'089.123.0045-6',macro:null,exc:null,obs:'Fundos do lote'}]}],
    ofertas:[{id:'o1',cid:'c1',data:H(62),valor:9000000,forma:'permuta_com_torna',obsPag:'60% em dinheiro na escritura; 40% em unidades no próprio empreendimento.',aceita:'Aceita permuta de até 40% em unidades, preferindo 2 dormitórios com vaga.',validade:H(-30),status:'ativa'},
             {id:'o2',cid:'c2',data:H(41),valor:8700000,forma:'dinheiro',obsPag:'À vista, com desconto para pagamento em 60 dias.',aceita:'Não aceita permuta.',validade:null,status:'ativa'}],
    neg:neg('negociacao','proposta_enviada',9,{temp:4,ofRef:'o1',viab:{nome:'Estudo base · 2 dormitórios',vgv:62400000,margem:15.2,em:H(35)}},7),
    propostas:[{v:1,origem:'bkm',data:H(30),validade:H(15),valor:8000000,forma:'dinheiro',cond:'À vista na escritura, condição suspensiva de aprovação do projeto em 180 dias.',status:'recusada'},
               {v:2,origem:'vendedor',data:H(24),validade:H(9),valor:9000000,forma:'permuta_com_torna',cond:'R$ 5,4 mi em dinheiro + 40% em unidades.',status:'recusada'},
               {v:3,origem:'bkm',data:H(8),validade:H(-7),valor:8500000,forma:'permuta_com_torna',cond:'R$ 6 mi em dinheiro + 8% do VGV em permuta física.',status:'em_analise'}],
    reunioes:[{id:uid(),status:'realizada',data:H(27),hora:'10:00',modalidade:'presencial',local:'bkm',endereco:'',part:{bkm:'Moisés, Ana Prado',ext:'Dr. Álvaro Mendes (procurador), Juliana Reis (corretora)'},pauta:'Apresentar a proposta v1 e entender o mínimo do vendedor.',resumo:'Procurador recusou à vista abaixo de R$ 9 mi. Abriu espaço para permuta parcial em unidades.',enc:'BKM estuda permuta física; corretora traz o mix de unidades que o vendedor quer.',ata:{nome:'ata-2026-09-18.pdf',versoes:1}},
              {id:uid(),status:'realizada',data:H(10),hora:'15:30',modalidade:'online',local:null,endereco:'',part:{bkm:'Ana Prado',ext:'Dr. Álvaro Mendes (procurador)'},pauta:'Discutir a v3 (dinheiro + 8% do VGV).',resumo:'Vendedor quer 10% do VGV ou R$ 6,5 mi em dinheiro. Ficou de responder por escrito.',enc:'Rodar cenário com 10% de permuta no BKM.',ata:null},
              {id:uid(),status:'agendada',data:H(-3),hora:'11:00',modalidade:'presencial',local:'externo',endereco:'Escritório do procurador · Av. Paulista, 1.000',part:{bkm:'Moisés, Ana Prado',ext:'Dr. Álvaro Mendes, sócios da Construpar'},pauta:'Fechar condições comerciais.',resumo:'',enc:'',ata:null}],
    tarefas:[{id:uid(),titulo:'Cobrar resposta da proposta v3',desc:'Procurador prometeu retorno até sexta.',resp:'Ana Prado',prazo:H(2),status:'pendente',prio:'alta',resultado:''},
             {id:uid(),titulo:'Orçar demolição do galpão',desc:'',resp:'Rafael Souza',prazo:H(-6),status:'em_andamento',prio:'media',resultado:''},
             {id:uid(),titulo:'Pedir certidão de uso do solo',desc:'',resp:'Ana Prado',prazo:H(25),status:'concluida',prio:'media',resultado:'Recebida e anexada à análise urbanística.'}],
    docs:[{tipo:'matricula',status:'validado',emitido:H(22),versoes:2},{tipo:'onus',status:'validado',emitido:H(22),versoes:1},{tipo:'iptu',status:'validado',emitido:H(34),versoes:1},{tipo:'vend',status:'validado',emitido:H(19),versoes:1},{tipo:'topo',status:'validado',emitido:H(43),versoes:1},{tipo:'foto',status:'recebido',emitido:H(60),versoes:1,nome:'Fachada Av. Cupecê'}]
  }));
  // 2 — diligência travada
  T.push(base({codigo:'TER-000118',nome:'Gleba Estrada do Lajeado',prioridade:'estrategica',resp:'Camila Torres',origem:'proprietario',dataIdent:H(48),
    logradouro:'Estrada do Lajeado Velho',numero:'1.880',bairro:'Guaianases',zona:'leste',eixo:'e3',aDoc:5400,fonteArea:'documental',testada:64,topografia:'declive',desnivel:6,posicao:'meio_quadra',formato:'irregular',ocupacao:'vazio',demolicao:'dispensada',
    mats:[{num:'219.774',cri:'9º CRI',area:5400,data:H(13)}],insc:[{sql:'228.004.0012-1',area:5310,valores:[{ex:2026,rev:1,vig:true,vt:3950000,vc:null,sit:'tributado',iptu:31800,parc:10,mensal:null,fonte:'Portal da Prefeitura',data:H(30)}]}],
    dilig:[{id:uid(),cat:'ambiental',titulo:'Área de preservação no fundo do lote (córrego)',sit:'impeditiva',resp:'Camila Torres',prov:'Levantar APP e área remanescente antes de seguir.'},{id:uid(),cat:'ocupacional',titulo:'Confirmar ausência de ocupação irregular',sit:'em_analise',resp:'Camila Torres',prov:''}],
    pessoas:[{nome:'Lajeado Empreendimentos Ltda.',tipo:'PJ',papel:'proprietario',pct:100,tel:'(11) 3333-1010'}],
    infra:infra({energia:'sim',agua:'sim',esgoto:'nao',asfalto:'sim'}),
    analises:[{id:uid(),data:H(30),fonte:'GeoSampa',status:'vigente',zonas:[{sigla:'ZEIS-2',area:5400,ins:'228.004.0012-1',macro:null,exc:null,obs:''}]}],
    ofertas:[{id:'o3',cid:null,data:H(48),valor:9800000,forma:'dinheiro',obsPag:'Pagamento em 3 parcelas.',aceita:'Aceita conversar sobre permuta financeira.',status:'ativa'}],
    neg:neg('contrato','contrato_enviado',26,{temp:3,ofRef:'o3',viab:{nome:'ZEIS-2 · 2 dormitórios',vgv:78300000,margem:16.2,em:H(30)}},6),
    propostas:[{v:1,origem:'bkm',data:H(40),valor:9200000,forma:'dinheiro',cond:'Três parcelas: 30% na promessa, 70% em duas parcelas condicionadas à aprovação.',status:'aceita'}],
    tarefas:[{id:uid(),titulo:'Contratar levantamento planialtimétrico',desc:'',resp:'Camila Torres',prazo:H(4),status:'pendente',prio:'alta',resultado:''},{id:uid(),titulo:'Cobrar novas certidões do vendedor',desc:'',resp:'Camila Torres',prazo:H(2),status:'aguardando_terceiro',prio:'media',resultado:''}],
    docs:[{tipo:'matricula',status:'validado',emitido:H(13),versoes:1},{tipo:'onus',status:'validado',emitido:H(13),versoes:1},{tipo:'iptu',status:'recebido',emitido:H(55),versoes:1},{tipo:'vend',status:'validado',emitido:H(39),versoes:1}]
  }));
  // 3 — recém-cadastrado, ficha incompleta
  T.push(base({codigo:'TER-000131',nome:'Lote Rua Capitão Ourinhos',resp:'Rafael Souza',origem:'corretor',dataIdent:H(3),logradouro:'Rua Capitão Ourinhos',numero:'330',bairro:'Penha',zona:'leste',
    ofertas:[{id:'o4',cid:'c2',data:H(3),valor:5200000,forma:'permuta_fisica',obsPag:'',aceita:'Quer 6 unidades no térreo.',status:'ativa'},{id:'o5',cid:'c1',data:H(1),valor:5600000,forma:'dinheiro',obsPag:'',aceita:'',status:'ativa'}],
    corretores:[{cid:'c2',principal:true},{cid:'c1',principal:false}],
    neg:neg('triagem','aguardando_informacoes',3,{ofRef:'o4'}),
    tarefas:[{id:uid(),titulo:'Triagem: localização e preço por m²',desc:'',resp:'Rafael Souza',prazo:H(-2),status:'pendente',prio:'media',resultado:''}]}));
  // 4 — viabilidade
  T.push(base({codigo:'TER-000127',nome:'Terreno Rua Pico Alto',resp:'Rafael Souza',origem:'corretor',dataIdent:H(20),logradouro:'Rua Pico Alto',numero:'95',bairro:'Jaraguá',zona:'noroeste',eixo:'e4',aCad:1950,fonteArea:'cadastral',testada:33,topografia:'aclive',
    insc:[{sql:'171.058.0033-9',area:1950,valores:[{ex:2026,rev:1,vig:true,vt:1650000,vc:0,sit:'tributado',iptu:14100,parc:10,mensal:null,fonte:'Carnê 2026',data:H(18)}]}],
    pessoas:[{nome:'Família Moretti (4 herdeiros)',tipo:'PF',papel:'proprietario',pct:null,tel:''}],
    ofertas:[{id:'o6',cid:'c2',data:H(20),valor:3900000,forma:'permuta_geral',obsPag:'Aberto a combinar dinheiro e unidades.',aceita:'Sim, desde que parte em dinheiro.',status:'ativa'}],corretores:[{cid:'c2',principal:true}],
    neg:neg('estudos','estudo_viabilidade',8,{temp:2,ofRef:'o6'},3),
    tarefas:[{id:uid(),titulo:'Montar o estudo de viabilidade',desc:'',resp:'Rafael Souza',prazo:H(-3),status:'em_andamento',prio:'alta',resultado:''}]}));
  // 5 — aprovação interna, acima do teto
  T.push(base({codigo:'TER-000112',nome:'Área Barão do Jequitibá',prioridade:'alta',resp:'Moisés',origem:'corretor',dataIdent:H(121),logradouro:'Rua Barão do Jequitibá',numero:'512',bairro:'Vila Prudente',zona:'sudeste',
    aDoc:2950,aLev:2938,fonteArea:'levantamento',testada:38,topografia:'plano',posicao:'meio_quadra',formato:'regular',ocupacao:'parcialmente_ocupado',aConst:420,aDemolir:420,demolicao:'provavel',
    mats:[{num:'98.442',cri:'6º CRI',area:1500,data:H(14)},{num:'98.443',cri:'6º CRI',area:1450,data:H(14)}],
    pessoas:[{nome:'Têxtil Paulistana S.A.',tipo:'PJ',papel:'proprietario',pct:100,tel:''}],
    infra:infra({energia:'sim',agua:'sim',esgoto:'sim',gas:'sim',asfalto:'sim',drenagem:'sim',iluminacao:'sim',calcada:'sim',fibra:'sim'}),
    analises:[{id:uid(),data:H(80),fonte:'GeoSampa',status:'vigente',zonas:[{sigla:'ZM',area:2950,ins:'171.058.0033-9',macro:null,exc:null,obs:''}]}],
    ofertas:[{id:'o7',cid:'c2',data:H(121),valor:6900000,forma:'dinheiro',status:'ativa',obsPag:'',aceita:''}],corretores:[{cid:'c2',principal:true}],
    neg:neg('negociacao','contra_proposta',30,{temp:5,ofRef:'o7',viab:{nome:'Estudo base',vgv:44200000,margem:14.2,em:H(90)},
      pedido:{id:'ped1',tipo:'etapa',dest:'contrato',modo:'sequencia',por:'Rafael Souza',em:H(1)+'T16:20:00.000',dados:{},niveis:[{nivel:2,ordem:1,previsto:'Ana Prado',status:'pendente'}]}},12),
    propostas:[{v:1,origem:'bkm',data:H(50),valor:5900000,forma:'permuta_com_torna',cond:'R$ 4,5 mi + 6% em permuta.',status:'recusada'},{v:2,origem:'vendedor',data:H(30),valor:6900000,forma:'dinheiro',cond:'À vista.',status:'recusada'},{v:3,origem:'bkm',data:H(10),valor:6500000,forma:'dinheiro',cond:'40% na assinatura, 60% na aprovação.',status:'aceita'}],
    reunioes:[{id:uid(),status:'realizada',data:H(31),hora:'09:30',modalidade:'presencial',local:'externo',endereco:'Sede da Têxtil Paulistana',part:{bkm:'Moisés',ext:'Diretoria financeira da Têxtil'},pauta:'Primeira conversa sobre preço.',resumo:'Querem à vista. Não aceitam permuta.',enc:'',ata:{nome:'ata-textil.pdf',versoes:2}}],
    tarefas:[{id:uid(),titulo:'Levar ao comitê: rentabilidade abaixo da mínima',desc:'',resp:'Moisés',prazo:H(-3),status:'pendente',prio:'alta',resultado:''}],
    docs:['matricula','onus','iptu','vend','topo','sond','amb'].map(t=>({tipo:t,status:'validado',emitido:H(12),versoes:1}))}));
  // 5b — negociação com contraproposta do vendedor
  T.push(base({codigo:'TER-000125',nome:'Terreno Rua Itapura',prioridade:'media',resp:'Ana Prado',origem:'corretor',dataIdent:H(70),logradouro:'Rua Itapura',numero:'1.410',bairro:'Tatuapé',zona:'leste',
    aDoc:1650,fonteArea:'documental',testada:30,topografia:'plano',posicao:'meio_quadra',formato:'regular',ocupacao:'vazio',demolicao:'dispensada',
    pessoas:[{nome:'Espólio de João Ferraz',tipo:'PF',papel:'proprietario',pct:100,tel:''}],
    ofertas:[{id:'o9',cid:'c1',data:H(70),valor:7400000,forma:'dinheiro',obsPag:'',aceita:'Não aceita permuta.',status:'ativa'}],corretores:[{cid:'c1',principal:true}],
    neg:neg('negociacao','contra_proposta',15,{temp:3,ofRef:'o9',viab:{nome:'Estudo base',vgv:52800000,margem:15.8,em:H(40)}},5),
    propostas:[{v:1,origem:'bkm',data:H(30),valor:6800000,forma:'dinheiro',cond:'À vista na escritura.',status:'recusada'},{v:2,origem:'vendedor',data:H(5),validade:H(-10),valor:7300000,forma:'dinheiro',cond:'50% no compromisso, 50% em 90 dias.',status:'apresentada'}],
    tarefas:[{id:uid(),titulo:'Responder contraproposta de R$ 7,3 mi',desc:'',resp:'Ana Prado',prazo:H(-4),status:'pendente',prio:'alta',resultado:''}]}));
  // 6 — perdida
  T.push(base({codigo:'TER-000109',nome:'Terreno Vale do Sabiá',resp:'Camila Torres',origem:'corretor',dataIdent:H(105),logradouro:'Rua Vale do Sabiá',numero:'88',bairro:'Brasilândia',zona:'norte',aDoc:2200,fonteArea:'documental',
    ofertas:[{id:'o8',cid:'c3',data:H(105),valor:4100000,forma:'dinheiro',status:'expirada',obsPag:'',aceita:''}],corretores:[{cid:'c3',principal:true}],
    neg:neg('estudos','analise_tecnica',95,{status:'descartado',temp:1,ofRef:'o8',motivo:'urbanistica',detalhe:'Cerca de 40% do lote em área de proteção ambiental.',encerradoEm:H(90)},92)}));
  // 6b — perdido para outra empresa
  T.push(base({codigo:'TER-000104',nome:'Terreno Av. Sapopemba',resp:'Ana Prado',origem:'corretor',dataIdent:H(80),logradouro:'Av. Sapopemba',numero:'9.400',bairro:'São Mateus',zona:'leste',aDoc:2400,fonteArea:'documental',
    ofertas:[{id:'o10',cid:'c3',data:H(80),valor:6400000,forma:'dinheiro',status:'expirada',obsPag:'',aceita:''}],corretores:[{cid:'c3',principal:true}],
    propostas:[{v:1,origem:'bkm',data:H(35),valor:5600000,forma:'dinheiro',cond:'À vista na escritura.',status:'recusada'}],
    neg:neg('negociacao','proposta_enviada',40,{status:'perdido',temp:3,ofRef:'o10',motivo:'vendido_terceiro',detalhe:'Proprietário fechou com outra incorporadora por R$ 6,1 mi à vista.',encerradoEm:H(18)},30)}));
  // 6c — comprado
  T.push(base({codigo:'TER-000098',nome:'Área Estrada do M\'Boi Mirim',prioridade:'alta',resp:'Moisés',origem:'corretor',dataIdent:H(160),logradouro:"Estrada do M'Boi Mirim",numero:'3.200',bairro:'Jardim Ângela',zona:'sul',aDoc:4100,fonteArea:'documental',topografia:'plano',ocupacao:'vazio',
    ofertas:[{id:'o11',cid:'c1',data:H(160),valor:7800000,forma:'permuta_com_torna',status:'ativa',obsPag:'',aceita:'Aceita 30% em unidades.'}],corretores:[{cid:'c1',principal:true}],
    propostas:[{v:1,origem:'bkm',data:H(70),valor:7200000,forma:'permuta_com_torna',cond:'R$ 5 mi + 7% do VGV em permuta física.',status:'aceita'}],
    docs:['matricula','onus','iptu','vend','topo','minuta'].map(t=>({tipo:t,status:'validado',emitido:H(30),versoes:1})),
    neg:neg('contrato','em_ajuste',45,{status:'comprado',temp:5,ofRef:'o11',encerradoEm:H(20),relato:'<p>Compromisso assinado com a família Albuquerque em <b>permuta com torna</b>: R$ 5 mi em dinheiro e 7% do VGV em unidades.</p><ul><li>Escritura condicionada à aprovação do projeto em 240 dias</li><li>Corretor Marcos Lemos com 4% sobre a parte em dinheiro</li></ul>',pontos:'Visita conjunta logo na primeira semana; proposta com permuta já no primeiro contato; certidões pedidas antes da minuta.'},10)}));
  /* processo numa fase depois de Novos Negócios (no banco: processos.fase); concluídas antes, a atual por último */
  const proc=(fase,pref,etapa,sub,dias,status,extra)=>({id:uid(),fase,codigo:pref+'-'+String(++NEG_SEQ+200).padStart(5,'0'),etapa,sub,status:status||'ativo',desde:H(dias),subDesde:H(Math.min(dias,6)),
    encerradoEm:status==='concluido'?H(Math.max(dias-60,1)):null,trilha:[{em:H(dias)+'T09:00:00.000',user:null,ev:'abertura',paraEtapa:etapa,paraSub:sub,status:'ativo'}],...(extra||{})});
  const fim=(fase,pref,etapa,sub,dias)=>proc(fase,pref,etapa,sub,dias,'concluido',{relato:'Concluída conforme o cronograma.'});
  const comprado=(dias,of)=>neg('contrato','em_ajuste',dias+40,{status:'comprado',temp:5,ofRef:of,encerradoEm:H(dias),relato:'<p>Compra fechada em permuta com torna.</p>',pontos:'Proposta com permuta logo no primeiro contato.'},10);
  T[T.length-1].procs=[proc('aprovacao','APR','prefeitura','protocolado',20,'ativo',{desde:H(8),subDesde:H(8)})];
  // 6e — em obras: passou por todas as fases até Obras
  T.push(base({codigo:'TER-000090',nome:'Gleba Av. Raimundo Pereira de Magalhães',prioridade:'alta',resp:'Moisés',origem:'corretor',dataIdent:H(820),logradouro:'Av. Raimundo Pereira de Magalhães',numero:'8.100',bairro:'Pirituba',zona:'norte',aDoc:9800,fonteArea:'documental',topografia:'plano',ocupacao:'vazio',
    ofertas:[{id:'o12',cid:'c2',data:H(820),valor:12500000,forma:'permuta_com_torna',status:'ativa',obsPag:'',aceita:''}],corretores:[{cid:'c2',principal:true}],
    neg:comprado(700,'o12'),procs:[fim('aprovacao','APR','alvaras','alvara_execucao',700),fim('incorporacao','INC','cartorio','exigencias',480),fim('caixa','CEF','contratacao','assinatura',400),
      fim('lancamento','LAN','vendas','vendas_iniciais',330),proc('obras','OBR','execucao','estrutura',260,'ativo',{desde:H(150),subDesde:H(40)})]}));
  // 6f — entregue: obra entregue, em assistência técnica
  T.push(base({codigo:'TER-000085',nome:'Residencial Itaquera',resp:'Ana Prado',origem:'corretor',dataIdent:H(1500),logradouro:'Rua Gregório Ramalho',numero:'500',bairro:'Itaquera',zona:'leste',aDoc:7200,fonteArea:'documental',topografia:'plano',ocupacao:'vazio',
    ofertas:[{id:'o13',cid:'c3',data:H(1500),valor:9100000,forma:'dinheiro',status:'ativa',obsPag:'',aceita:''}],corretores:[{cid:'c3',principal:true}],
    neg:comprado(1400,'o13'),procs:[fim('aprovacao','APR','alvaras','alvara_execucao',1400),fim('incorporacao','INC','cartorio','exigencias',1150),fim('caixa','CEF','contratacao','assinatura',1060),
      fim('lancamento','LAN','vendas','vendas_iniciais',980),fim('obras','OBR','entrega','entrega_chaves',900),proc('entregue','ENT','pos_entrega','assistencia_tecnica',90)]}));
  // 6d — stand by
  T.push(base({codigo:'TER-000121',nome:'Lote Rua Ipiranguinha',resp:'Rafael Souza',origem:'indicacao',dataIdent:H(50),logradouro:'Rua Ipiranguinha',numero:'210',bairro:'Ipiranga',zona:'sul',aCad:900,fonteArea:'cadastral',
    neg:neg('estudos','estudo_massa',28,{status:'stand_by',temp:2,retomar:H(-5),detalhe:'Proprietários em inventário; retomar depois da partilha.',encerradoEm:H(25)},28)}));
  // 7 — prospecção sem oferta
  T.push(base({codigo:'TER-000132',nome:'Lote vizinho ao TER-000123',resp:'Ana Prado',origem:'prospeccao',dataIdent:H(2),logradouro:'Rua Benedito Mendes',numero:'40',bairro:'Cidade Ademar',zona:'sul',eixo:'e1',insc:[{sql:'089.123.0052-1',area:610,valores:[]}],
    obs:'Abordar para compor a área com o terreno da esquina.',tarefas:[{id:uid(),titulo:'Localizar proprietário pelo SQL',desc:'',resp:'Ana Prado',prazo:H(-5),status:'pendente',prio:'media',resultado:''}]}));
  T.forEach(t=>{if(t.neg)t.neg.trilha.forEach(x=>{x.user=x.user||t.resp});(t.procs||[]).forEach(p=>p.trilha.forEach(x=>{x.user=x.user||t.resp}));t.hist=[{em:t.dataIdent,user:t.resp,txt:'Terreno cadastrado'}];if(t.neg){t.hist.push({em:t.neg.desde,user:t.resp,txt:`Negociação em ${SN(t.neg.etapa)}`})}});
  const COORD={'TER-000123':[-23.66812,-46.65131],'TER-000118':[-23.54480,-46.40660],'TER-000131':[-23.52630,-46.54400],'TER-000127':[-23.45700,-46.74000],
    'TER-000112':[-23.58500,-46.58100],'TER-000125':[-23.53800,-46.57000],'TER-000109':[-23.46300,-46.68700],
    'TER-000104':[-23.61050,-46.47900],'TER-000098':[-23.71000,-46.77000],'TER-000090':[-23.48700,-46.71500],'TER-000085':[-23.54000,-46.45600],'TER-000121':[-23.59500,-46.60200]};
  const POLY={'TER-000123':[[-23.66794,-46.65152],[-23.66792,-46.65111],[-23.66830,-46.65108],[-23.66833,-46.65150]],
    'TER-000112':[[-23.58478,-46.58126],[-23.58476,-46.58072],[-23.58522,-46.58070],[-23.58525,-46.58124]],
    'TER-000118':[[-23.54420,-46.40720],[-23.54410,-46.40590],[-23.54535,-46.40580],[-23.54560,-46.40700],[-23.54500,-46.40740]],
    /* o vizinho encosta na divisa leste do TER-000123: divisa comum não é sobreposição */
    'TER-000132':[[-23.66792,-46.65111],[-23.66790,-46.65072],[-23.66829,-46.65069],[-23.66830,-46.65108]]};
  /* a poligonal é obrigatória: os exemplos sem desenho próprio ganham um quadrado de ~40 m no ponto */
  const quadrado=([la,lo],m=40)=>{const dy=m/2/110574,dx=m/2/(111320*Math.cos(la*Math.PI/180));return [[la+dy,lo-dx],[la+dy,lo+dx],[la-dy,lo+dx],[la-dy,lo-dx]].map(p=>p.map(v=>+v.toFixed(6)))};
  /* pontos de interesse de exemplo (no Google, a busca roda de novo sozinha) */
  const ENTX={'TER-000112':[['metro_trem','Estação Vila Prudente (Linhas 2 e 15)',-23.58380,-46.58130,350,5]],
    'TER-000123':[['hospital','Hospital Municipal Cidade Ademar',-23.67330,-46.64470,1240,17]]};
  T.forEach(t=>{const c=COORD[t.codigo];if(c&&t.lat==null){t.lat=c[0];t.lng=c[1];t.precisao='aproximada'}if(POLY[t.codigo])t.poly=POLY[t.codigo];else if(t.lat!=null)t.poly=quadrado([t.lat,t.lng]);if(t.poly&&t.lat==null){t.lat=+(t.poly.reduce((s,p)=>s+p[0],0)/t.poly.length).toFixed(5);t.lng=+(t.poly.reduce((s,p)=>s+p[1],0)/t.poly.length).toFixed(5);t.precisao="aproximada"}if(ENTX[t.codigo]&&t.lat!=null)t.entorno={lat:t.lat,lng:t.lng,em:H(2),fonte:'exemplo',semPe:false,itens:ENTX[t.codigo].map(([cat,nome,la,lo,pe,min],i)=>({gid:'ex'+t.codigo+'-'+i,cat,nome,lat:la,lng:lo,pe,min}))};t.tarefas.forEach((k,i)=>k.pos=i*1000)});
  const pontos=[{id:'p1',nome:'Terminal Cidade Ademar',cat:'transporte',lat:-23.66720,lng:-46.65220},{id:'p2',nome:'Estação Vila Prudente (Linhas 2 e 15)',cat:'transporte',lat:-23.58380,lng:-46.58130},
    {id:'p3',nome:'Estação Tatuapé (Linha 3)',cat:'transporte',lat:-23.54040,lng:-46.57700},{id:'p4',nome:'Estação Penha (Linha 3)',cat:'transporte',lat:-23.53340,lng:-46.54280},
    {id:'p5',nome:'Estação Guaianases (Linha 11)',cat:'transporte',lat:-23.54200,lng:-46.41440},{id:'p6',nome:'Estação Jaraguá (Linha 7)',cat:'transporte',lat:-23.45610,lng:-46.73980},
    {id:'p7',nome:'Shopping Aricanduva',cat:'comercio',lat:-23.56690,lng:-46.50610},{id:'p8',nome:'Hospital Municipal Cidade Ademar',cat:'saude',lat:-23.67330,lng:-46.64470}];
  /* concorrência de exemplo (empreendimentos de outras empresas; nomes fictícios): proto_concorrencia.js */
  const {E:concEmpresas,C:concorrentes}=ccSeed();
  return {eixos,corretores,terrenos:T,pontos,concorrentes,concEmpresas,areasInteresse:[{id:'ai1',nome:'Área Cupecê A',terrenos:['TER-000123','TER-000132']}],seqT:132,cfg:CFG_PADRAO(),membros:MEMBROS_PADRAO(),notifs:[]};
}

/* ===================== estado ===================== */
const KEY='bkm-terrenos-prototipo-v9';
let S;try{const r=localStorage.getItem(KEY);S=r?JSON.parse(r):null}catch(e){S=null}
if(!S||!S.terrenos)S=seed();
S.terrenos.forEach(t=>(t.docs||[]).forEach(d=>{if(/^geosampa_/.test(d.tipo))d.tipo=d.tipo.replace('geosampa_','lote_')}));
const save=()=>{try{if(typeof audit==='function')audit()}catch(e){console.error(e)}try{localStorage.setItem(KEY,JSON.stringify(S))}catch(e){}};
let menuMin=false;try{menuMin=localStorage.getItem('bkm-terrenos-menu')==='min'}catch(e){}
// Tema: claro, escuro ou auto (segue o sistema). Preferência por navegador.
const TEMAS=[['claro','Claro','#f8fafd'],['escuro','Escuro','linear-gradient(135deg,#3b82f6,#7c5cff)'],['auto','Automático (segue o sistema)','linear-gradient(135deg,#f8fafd 50%,#0d1436 50%)']];
let TEMA='claro';try{TEMA=localStorage.getItem('bkm-terrenos-tema')||'claro'}catch(e){}
if(!['claro','escuro','auto'].includes(TEMA))TEMA='escuro'; // 'marinho' (versão anterior) virou o escuro
const mqEscuro=window.matchMedia?window.matchMedia('(prefers-color-scheme: dark)'):null;
function aplicaTema(){document.documentElement.dataset.tema=TEMA==='auto'?(mqEscuro&&mqEscuro.matches?'escuro':'claro'):TEMA;try{temaMapa()}catch(e){}}
aplicaTema();mqEscuro&&mqEscuro.addEventListener&&mqEscuro.addEventListener('change',()=>{if(TEMA==='auto')aplicaTema()});
let temaMenu=false;
function renderTema(){const el=document.getElementById('tema');if(!el)return;
  const ic=document.documentElement.dataset.tema==='claro'
    ?'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/></svg>'
    :'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z"/></svg>';
  el.innerHTML=`<button class="tema-btn" data-a="tema-menu" aria-haspopup="menu" aria-expanded="${temaMenu}" aria-label="Tema da tela" title="Tema">${ic}</button>`+
   (temaMenu?`<div class="tema-menu" role="menu"><div class="tl">Tema</div>${TEMAS.map(([k,l,c])=>`<button role="menuitemradio" aria-checked="${TEMA===k}" data-a="tema" data-v="${k}"><span class="sw" style="background:${c}"></span>${l}</button>`).join('')}</div>`:'')}

/* papel vem do perfil do usuário (decisão do Moisés, 23/out/2026): a barra mostra só o avatar; trocar de usuário é recurso do protótipo, dentro do menu */
let perfilMenu=false;
function renderPerfil(){const el=document.getElementById('perfil');if(!el)return;const u=ROLE_USER[UI.role];
  el.innerHTML=`<button class="perfil-btn" data-a="perfil-menu" aria-haspopup="menu" aria-expanded="${perfilMenu}" aria-label="${u}, ${UI.role}" title="${u} · ${UI.role}">${u[0]}</button>`+
   (perfilMenu?`<div class="tema-menu" role="menu"><div class="perfil-eu"><b>${u}</b><span>${UI.role}</span></div><div class="tl">Entrar como (protótipo)</div>${['Diretor','Gestor','Analista','Leitura'].map(r=>`<button role="menuitemradio" aria-checked="${UI.role===r}" data-a="role" data-v="${r}"><span class="perfil-av">${ROLE_USER[r][0]}</span>${ROLE_USER[r]} · ${r}</button>`).join('')}<div class="tl"></div><button role="menuitem" data-a="reset">Restaurar dados de exemplo</button></div>`:'')}

const UI={route:'inicio',id:null,tab:'cadastro',from:'terrenos',q:'',role:'Diretor',edit:null,modal:null,upload:null,propForm:false};
const me=()=>ROLE_USER[UI.role];
const T=id=>S.terrenos.find(t=>t.id===id);
const corretor=id=>S.corretores.find(c=>c.id===id);
const eixo=id=>(S.eixos.find(e=>e.id===id)||{}).nome;
/* instante do registro com milissegundos; nunca repete nem volta (dois registros no mesmo milissegundo ficam 1 ms à frente) */
let ultEm=0;
const agora=()=>{let t=Date.now();if(t<=ultEm)t=ultEm+1;ultEm=t;const d=new Date(t),p=(n,k=2)=>String(n).padStart(k,'0');
  return HOJE+'T'+p(d.getHours())+':'+p(d.getMinutes())+':'+p(d.getSeconds())+'.'+p(d.getMilliseconds(),3)};
/* ordem dos logs: do mais recente ao mais antigo; no empate, o gravado depois vem antes */
const histOrd=hist=>(hist||[]).map((h,i)=>[h,i]).sort((a,b)=>b[0].em.localeCompare(a[0].em)||b[1]-a[1]).map(x=>x[0]);
const log=(t,txt)=>t.hist.push({em:agora(),user:me(),txt:(t._parte?`Parte ${t._parte.nome} · `:'')+txt});

/* ===================== regras derivadas ===================== */
/* a área da poligonal não é digitada: sai do desenho, em m² inteiros, e acompanha cada ajuste (pedido do Moisés, 24/out/2026) */
const areaPolT=t=>t.poly&&t.poly.length>=3&&typeof areaPoly==='function'?Math.round(areaPoly(t.poly)):null;
const areaAdotada=t=>t.fonteArea==='poligonal'?areaPolT(t):({documental:t.aDoc,cadastral:t.aCad,levantamento:t.aLev,estimativa:t.aEst})[t.fonteArea]??null;
const ofertaRef=t=>t.ofertas.find(o=>o.id===t.neg?.ofRef)||t.ofertas.filter(o=>o.status==='ativa').sort((a,b)=>b.data.localeCompare(a.data))[0]||t.ofertas[0]||null;
const corrPrincipal=t=>{const c=t.corretores.find(x=>x.principal);return c?corretor(c.cid):null};
const analiseVig=t=>t.analises.find(a=>a.status==='vigente');
const zonasTxt=t=>{const a=analiseVig(t);if(!a)return null;const o={};a.zonas.forEach(z=>o[z.sigla]=(o[z.sigla]||0)+(z.area||0));return Object.entries(o).sort((x,y)=>y[1]-x[1]).map(([s])=>s).join(' / ')};
const caMax=t=>{const r=resumoUrb(t,'mercado');return r&&r.caMax>0?r.caMax:null};  // maior CA máximo de mercado (catálogo + exceções; proto_zonas.js)
const abertas=t=>t.tarefas.filter(k=>k.status!=='concluida'&&k.status!=='cancelada');
const atrasadas=t=>abertas(t).filter(k=>k.prazo<HOJE);
const proxTarefa=t=>abertas(t).sort((a,b)=>a.prazo.localeCompare(b.prazo))[0];
const lastProp=t=>t.propostas[t.propostas.length-1];
const docVal=d=>{const v=TIPOS_DOC[d.tipo][2];return v&&d.emitido?addD(d.emitido,v):null};
const docSt=d=>{if(!d||!d.emitido)return 'pendente';if(d.status==='rejeitado')return 'rejeitado';const v=docVal(d);return v&&v<HOJE?'vencido':d.status};
const negAtiva=t=>t.neg&&t.neg.status==='ativo';
/* rentabilidade abaixo da mínima (decisão do Moisés, 26/out/2026): margem líquida do estudo válido abaixo da mínima da empresa
   (Configurações › Viabilidade; v_terrenos.abaixo_margem_min). Substitui o aviso de proposta acima do preço máximo. */
const abaixoMin=t=>{const m=t.neg?.viab?.margem;return m!=null&&S.vbMargemMin!=null&&m<S.vbMargemMin};
const abaixoMinTxt=t=>`Rentabilidade abaixo da mínima: margem de ${num(t.neg.viab.margem,1)}% no estudo válido, mínima de ${num(S.vbMargemMin,1)}%`;
const infraNV=t=>INFRA.filter(([k])=>!t.infra[k]||t.infra[k].d==='nao_verificado').length;

/* completude: campos que importam para decidir a compra */
function completude(t){
  const c=[
    ['Endereço completo',!!(t.logradouro&&t.numero&&t.bairro),'cadastro','loc'],
    ['Zona',!!t.zona,'cadastro','loc'],
    ['Ponto no mapa',t.lat!=null,'cadastro','loc'],
    ['Área adotada',areaAdotada(t)!=null,'cadastro','areas'],
    ['Testada',t.testada!=null,'cadastro','areas'],
    ['Topografia',t.topografia!=='nao_informado','cadastro','fis'],
    ['Ocupação',t.ocupacao!=='nao_informado','cadastro','fis'],
    ['Matrícula',t.mats.length>0,'cadastro','mats'],
    ['Inscrição e IPTU',t.insc.length>0,'cadastro','insc'],
    ['Proprietário',t.pessoas.some(p=>p.papel==='proprietario'),'cadastro','pessoas'],
    ['Zoneamento',!!analiseVig(t),'urbanismo',null],
    ['Infraestrutura',infraNV(t)===0,'urbanismo',null],
    ['Valor pedido',!!ofertaRef(t)?.valor,'comercial',null],
    ['Temperatura',!!t.neg?.temp,'comercial',null]];
  const ok=c.filter(x=>x[1]).length;
  return {pct:Math.round(ok/c.length*100),faltam:c.filter(x=>!x[1])};
}

/* ===================== componentes ===================== */
function tempPicker(t){
  const v=t.neg?.temp||0,on=!!t.neg&&t.neg.status==='ativo';
  return `<div class="temp" title="Temperatura da negociação"><span class="bars" role="radiogroup" aria-label="Temperatura da negociação">${[1,2,3,4,5].map(n=>`<button type="button" role="radio" aria-checked="${v===n}" aria-label="${n} · ${TEMP[n]}" class="${n<=v?'on':''} t${v}" ${on?`data-a="temp" data-v="${n===v?0:n}"`:'disabled'}></button>`).join('')}</span><span class="tl" style="color:${v?`var(--t${v})`:'var(--texto-suave)'}">${v?`${v} · ${TEMP[v]}`:'Não avaliada'}</span></div>`;
}
const tempMini=v=>v?`<span class="temp-mini t${v}" title="Temperatura ${v} · ${TEMP[v]}">${[1,2,3,4,5].map(n=>`<i class="${n<=v?'on':''}"></i>`).join('')}</span>`:'<span class="faint" style="font-size:12px">—</span>';
const docChip=st=>({pendente:'<span class="chip">Pendente</span>',recebido:'<span class="chip blue">Aguardando validação</span>',validado:'<span class="chip good">Validado</span>',vencido:'<span class="chip crit">Vencido</span>',rejeitado:'<span class="chip crit">Rejeitado</span>'}[st]);
const statusPropChip=s=>`<span class="chip ${({aceita:'good',recusada:'crit',expirada:'crit',retirada:'',substituida:'',rascunho:'',apresentada:'blue',em_analise:'blue'})[s]}">${OPT.statusProp[s]}</span>`;
const ni='<span class="v ni">Não informado</span>';
const optSel=(name,map,val,extra='')=>`<select id="f-${name}" name="${name}" ${extra}><option value="">Não informado</option>${Object.entries(map).map(([k,l])=>`<option value="${k}" ${k===val?'selected':''}>${esc(l)}</option>`).join('')}</select>`;

/* seções editáveis genéricas */
const SECOES={
  ident:{titulo:'Identificação',campos:[['nome','Nome de referência','txt',null,'full'],['descricao','Descrição','area',null,'full'],['prioridade','Prioridade','sel','prioridade'],['resp','Responsável','user'],['origem','Origem do cadastro','sel','origem'],['dataIdent','Identificado em','date'],['url','Link da origem','url',null,'full'],['obs','Observações gerais','area',null,'full']]},
  loc:{titulo:'Endereço e localização',campos:[['cep','CEP','txt'],['logradouro','Logradouro','txt'],['numero','Número','txt'],['complemento','Complemento','txt'],['bairro','Bairro','txt'],['municipio','Município','mun'],['zona','Zona','sel','zona'],['eixo','Eixo comercial','eixo'],['referencia','Referência','txt',null,'full'],['lat','Latitude','dec'],['lng','Longitude','dec'],['precisao','Precisão da localização','sel','precisao']]},
  fis:{titulo:'Características físicas',campos:[['topografia','Topografia','sel','topografia'],['desnivel','Desnível estimado','m'],['posicao','Posição na quadra','sel','posicao'],['formato','Formato','sel','formato'],['ocupacao','Ocupação','sel','ocupacao'],['uso','Uso atual','txt'],['aConst','Área construída existente','m2'],['aDemolir','Área construída a demolir','m2'],['demolicao','Necessidade de demolição','sel','demolicao'],['obsFis','Observações físicas','area',null,'full']]}
};
const NI_OPT=new Set(['nao_informado','nao_informada','nao_avaliada']);
function fmtCampo(t,[k,,tipo,opt]){
  const v=k==='municipio'?(t.municipio||'São Paulo · SP'):t[k];
  if(v==null||v===''||(tipo==='sel'&&NI_OPT.has(v)))return null;
  switch(tipo){case 'sel':return esc(OPT[opt][v]||v);case 'date':return fd(v);case 'm2':return m2(v);case 'm':return num(v,2)+' m';case 'dec':return num(v,6);
    case 'url':return `<a href="${esc(v)}" target="_blank" rel="noopener">${esc(v.replace(/^https?:\/\//,'').slice(0,48))}</a>`;case 'eixo':return esc(eixo(v)||'—');default:return esc(v)}
}
/* campo de edição de uma seção da ficha; usado nos formulários das seções e na edição direta da Visão geral */
function campoInp(t,[k,l,tipo,opt,full]){
    const v=t[k],idf=`f-${k}`;let h;
    if(tipo==='sel')h=optSel(k,OPT[opt],v);
    else if(tipo==='user')h=`<select id="${idf}" name="${k}">${USERS.map(u=>`<option ${u===v?'selected':''}>${u}</option>`).join('')}</select>`;
    else if(tipo==='eixo')h=`<select id="${idf}" name="${k}"><option value="">Nenhum</option>${S.eixos.map(e=>`<option value="${e.id}" ${e.id===v?'selected':''}>${esc(e.nome)}</option>`).join('')}</select>`;
    else if(tipo==='area')h=`<textarea id="${idf}" name="${k}">${esc(v)}</textarea>`;
    else if(tipo==='date')h=`<input id="${idf}" name="${k}" type="date" value="${esc(v)}">`;
    else if(tipo==='fixo')h=`<input id="${idf}" value="São Paulo · SP" disabled>`;
    else if(tipo==='mun')h=`<input id="${idf}" name="municipio" value="${esc(t.municipio||'São Paulo · SP')}" readonly title="Preenchido pela busca de endereço">`;
    else if(['m2','m','dec'].includes(tipo))h=`<input id="${idf}" name="${k}" inputmode="decimal" value="${v==null?'':String(v).replace('.',',')}" placeholder="${tipo==='m2'?'m²':tipo==='m'?'metros':''}">`;
    else h=`<input id="${idf}" name="${k}" ${tipo==='url'?'type="url"':''} value="${esc(v)}" ${k==='nome'?'required':''}>`;
    return `<div class="field ${full||''}"><label for="${idf}">${l}</label>${h}</div>`;
  }
/* busca de endereço do Google: escolher um resultado preenche CEP, logradouro, número, bairro, município e o ponto no mapa */
function buscaEndereco(){return GG?`<div class="gbusca"><div class="gauto" data-gauto></div><div class="hint">Escolha um resultado para preencher CEP, logradouro, número, bairro, município e a localização.</div></div>`
  :`<div class="gbusca off"><div class="hint">Busca de endereço do Google indisponível neste acesso. Preencha os campos à mão.</div></div>`}
/* formulário de endereço: busca do Google; logo abaixo, os campos que o Google não traz (complemento e zona);
   depois, o que a busca preenche, em linhas simples (não parecem campos a preencher). "Corrigir à mão" libera a edição. */
const END_CAMPOS=['cep','logradouro','numero','complemento','bairro','municipio','zona','lat','lng'];
function camposEndereco(t,comCoord){
  const auto=[['cep','CEP'],['logradouro','Logradouro'],['numero','Número'],['bairro','Bairro'],['municipio','Município']];
  const val=k=>k==='municipio'?(t.municipio||'São Paulo · SP'):['lat','lng'].includes(k)?(t[k]==null?'':String(t[k]).replace('.',',')):(t[k]??'');
  const trava=GG;
  return `${buscaEndereco()}<div class="end-manual"><div class="field"><label for="f-complemento">Complemento</label><input id="f-complemento" name="complemento" value="${esc(t.complemento||'')}"></div><div class="field"><label for="f-zona">Zona</label>${optSel('zona',OPT.zona,t.zona)}</div></div>
    <div class="end-auto">${auto.map(([k,l])=>`<div class="field auto-l ${['logradouro','municipio'].includes(k)?'largo':''}"><label for="f-${k}">${l}</label><input id="f-${k}" name="${k}" value="${esc(val(k))}" ${trava?'readonly class="auto-v" placeholder="—"':''}></div>`).join('')}</div>
    ${comCoord?['lat','lng'].map(k=>`<input type="hidden" name="${k}" value="${esc(val(k))}">`).join(''):''}
    ${trava?'<button type="button" class="linkbtn end-corrigir" data-a="end-manual">Corrigir à mão</button>':''}`}
function secaoGenerica(t,id){
  const s=SECOES[id],ed=UI.edit===id;
  if(!ed)return `<section class="sec" id="sec-${id}"><div class="sec-h"><h2>${s.titulo}</h2><button class="btn text sm" data-a="edit" data-s="${id}">${ic('edit',16)}Editar</button></div>
    <div class="sec-b"><div class="kvg">${s.campos.filter(c=>!['lat','lng'].includes(c[0])).map(c=>{const f=fmtCampo(t,c);return `<div class="${c[4]||''}"><div class="k">${c[1]}</div>${f==null?ni:`<div class="v">${f}</div>`}</div>`}).join('')}</div>
    ${id==='fis'&&t.aConst!=null&&t.aDemolir!=null&&t.aDemolir<t.aConst?`<div class="hint" style="margin-top:10px">Demolição parcial: ${m2(t.aConst-t.aDemolir)} permanecem.</div>`:''}</div></section>`;
  const inp=c=>campoInp(t,c);
  return `<section class="sec" id="sec-${id}"><form data-form="sec" data-s="${id}"><div class="sec-h"><h2>${s.titulo}</h2></div>
    <div class="sec-b">${id==='loc'?camposEndereco(t,true):''}<div class="editgrid">${(id==='loc'?s.campos.filter(c=>!END_CAMPOS.includes(c[0])):s.campos).map(inp).join('')}</div>${id==='loc'?'':''}</div>
    <div class="sec-f"><button type="button" class="btn text" data-a="cancel-edit">Cancelar</button><button class="btn primary">Salvar</button></div></form></section>`;
}
function secaoAreas(t){
  const ed=UI.edit==='areas',ad=areaAdotada(t);
  const vals=[['aDoc','Documental','documental','matrícula'],['aCad','Cadastral','cadastral','IPTU'],['aLev','Levantamento','levantamento','topografia'],['aEst','Estimativa','estimativa','sem documento']];
  const apol=areaPolT(t),cards=[...vals.map(([k,l,f,s])=>[t[k],l,f,s]),[apol,'Poligonal','poligonal','desenho']];
  const preench=cards.map(v=>v[0]).filter(v=>v!=null);
  let div='';
  if(preench.length>1){const mx=Math.max(...preench),mn=Math.min(...preench);if((mx-mn)/mx>0.01)div=`<div class="diverg">${ic('warn',16)}Diferença de ${m2(mx-mn)} (${num((mx-mn)/mx*100,1)}%) entre as fontes. Confira qual entra na viabilidade.</div>`}
  if(!ed)return `<section class="sec" id="sec-areas"><div class="sec-h"><h2>Áreas e dimensões</h2><button class="btn text sm" data-a="edit" data-s="areas">${ic('edit',16)}Editar</button></div><div class="sec-b">
    <div class="areas">${cards.map(([v,l,f,s])=>`<div class="area ${t.fonteArea===f?'sel':''}"${f==='poligonal'?' title="Calculada pelo desenho; muda quando a poligonal é ajustada"':''}><div class="al">${l} <span class="faint">· ${s}</span></div><div class="av">${v==null?'<span class="faint" style="font-size:14px;font-style:italic">Não informada</span>':m2(v)}</div>${t.fonteArea===f?'<div class="as">Área adotada</div>':''}</div>`).join('')}</div>
    ${div}<div class="kvg" style="margin-top:14px"><div><div class="k">Área adotada</div>${ad==null?'<span class="v ni">Escolha a fonte</span>':`<div class="v">${m2(ad)}</div>`}</div><div><div class="k">Testada principal</div>${t.testada==null?ni:`<div class="v">${num(t.testada,2)} m</div>`}</div>
    <div><div class="k">Valor pedido por m²</div>${ad&&ofertaRef(t)?.valor?`<div class="v">${brl(ofertaRef(t).valor/ad)}</div>`:ni}</div></div></div></section>`;
  return `<section class="sec" id="sec-areas"><form data-form="areas"><div class="sec-h"><h2>Áreas e dimensões</h2></div><div class="sec-b"><div class="editgrid">
    ${vals.map(([k,l,,s])=>`<div class="field"><label for="f-${k}">${l} (${s})</label><input id="f-${k}" name="${k}" inputmode="decimal" placeholder="m²" value="${t[k]==null?'':String(t[k]).replace('.',',')}"></div>`).join('')}
    <div class="field"><label>Poligonal (desenho no mapa)</label><div class="v" style="padding:10px 0">${apol==null?'<span class="ni">Sem poligonal</span>':m2(apol)} <span class="faint">· calculada</span></div></div>
    <div class="field"><label for="f-fonteArea">Área adotada vem de</label>${optSel('fonteArea',OPT.fonteArea,t.fonteArea)}</div>
    <div class="field"><label for="f-testada">Testada principal (m)</label><input id="f-testada" name="testada" inputmode="decimal" value="${t.testada==null?'':String(t.testada).replace('.',',')}"></div>
    </div></div>
    <div class="sec-f"><button type="button" class="btn text" data-a="cancel-edit">Cancelar</button><button class="btn primary">Salvar</button></div></form></section>`;
}
function secaoMats(t){
  return `<section class="sec" id="sec-mats"><div class="sec-h"><h2>Matrículas</h2><span class="faint" style="font-size:13px">${t.mats.length}</span></div><div class="sec-b">
    ${t.mats.length?`<div class="tblwrap"><table class="mini-tbl"><thead><tr><th>Número</th><th>Cartório</th><th class="r">Área registrada</th><th>Certidão de</th>${partesAtivas(t).length?'<th>Parte</th>':''}<th></th></tr></thead><tbody>${t.mats.map((m,i)=>`<tr><td class="num">${esc(m.num)}</td><td>${esc(m.cri)}</td><td class="r">${m2(m.area)}</td><td>${fd(m.data)}</td>${partesAtivas(t).length?`<td>${selParte(t,'mat-parte',i,m.parte)}</td>`:''}<td class="r"><button class="iconbtn sm lixo" data-a="del-mat" data-i="${i}" aria-label="Remover" title="Remover">${ic('lixo',18)}</button></td></tr>`).join('')}</tbody></table></div>`:'<div class="muted">Nenhuma matrícula. Um terreno pode somar várias.</div>'}
    <form class="inline-form" data-form="mat"><div class="field"><label for="m-n">Número</label><input id="m-n" name="num" required placeholder="184.552"></div>
    <div class="field"><label for="m-c">Cartório</label><select id="m-c" name="cri">${Array.from({length:18},(_,i)=>`<option>${i+1}º CRI</option>`).join('')}</select></div>
    <div class="field"><label for="m-a">Área (m²)</label><input id="m-a" name="area" inputmode="decimal"></div>
    <div class="field"><label for="m-d">Certidão de</label><input id="m-d" name="data" type="date"></div><button class="btn sm">${ic('add',16)}Adicionar</button></form></div></section>`;
}
function secaoInsc(t){
  const vig=ins=>{const r={};ins.valores.filter(v=>v.vig).forEach(v=>{r[v.ex]=v});return Object.values(r).sort((a,b)=>b.ex-a.ex)};
  const venal=v=>v.vt!=null&&v.vc!=null?v.vt+v.vc:(v.venal??v.vt??null);
  return `<section class="sec" id="sec-insc"><div class="sec-h"><h2>Inscrições municipais, valor venal e IPTU</h2>${UI.role!=='Leitura'&&lotesInsc(t).length?`<button class="btn sm text" data-a="lotes-poly" ${LOTES_BUSCANDO?'disabled':''}>${ic('layers',16)}${LOTES_BUSCANDO?'Buscando os lotes...':'Usar a poligonal dos lotes'}</button>`:''}</div><div class="sec-b">
    ${t.insc.length?t.insc.map((ins,i)=>{const vs=vig(ins),revs=ins.valores.filter(v=>!v.vig).length;return `<div style="margin-bottom:18px"><div style="display:flex;gap:10px;align-items:baseline;flex-wrap:wrap;margin-bottom:6px"><b class="num">${CIDADES_INSC[insCid(ins)].rotulo} ${esc(ins.sql)}</b><span class="muted" style="font-size:13px">${esc(CIDADES_INSC[insCid(ins)].cidade)}</span><span class="muted" style="font-size:13px">Área cadastral ${m2(ins.area)}</span>${revs?`<span class="faint" style="font-size:12px">${revs} revis${revs>1?'ões anteriores preservadas':'ão anterior preservada'}</span>`:''}</div>
      ${loteQuadro(t,ins,i)}
      <div class="tblwrap"><table class="mini-tbl vv"><thead><tr><th>Exercício</th><th class="r">Venal terreno</th><th class="r">Venal construção</th><th class="r">Venal do imóvel</th><th>IPTU</th><th class="r">Anual</th><th class="r">Parcela</th><th class="r">Mensal</th><th>Fonte</th></tr></thead><tbody>
      ${vs.map((v,j)=>`<tr><td><b>${v.ex}</b>${v.rev>1?` <span class="faint" style="font-size:11px">rev. ${v.rev}</span>`:''}${j===0?' <span class="tag-ref">atual</span>':''}</td><td class="r">${brl(v.vt)}</td><td class="r">${brl(v.vc)}</td><td class="r"><b>${brl(venal(v))}</b></td>
      <td>${v.sit==='isento'?'<span class="chip good">Isento</span>':OPT.sitIptu[v.sit]}</td><td class="r">${v.sit==='isento'?'—':brl2(v.iptu)}</td><td class="r">${v.iptu!=null&&v.parc&&v.sit!=='isento'?`${brl2(v.iptu/v.parc)} <span class="faint">× ${v.parc}</span>`:'—'}</td>
      <td class="r">${v.sit==='isento'?'—':v.mensal!=null?`${brl2(v.mensal)}<div class="faint" style="font-size:11px">informado</div>`:v.iptu!=null?`${brl2(v.iptu/12)}<div class="faint" style="font-size:11px">anual ÷ 12</div>`:'—'}</td><td class="muted" style="font-size:12px">${esc(v.fonte||'—')}${v.data?`<div>${fd(v.data)}</div>`:''}</td></tr>`).join('')||'<tr><td colspan="9" class="muted">Sem valores lançados.</td></tr>'}</tbody></table></div>
      <details class="details"><summary>Lançar exercício ou corrigir valores</summary><form class="inline-form" data-form="iptu" data-i="${i}" style="border:0;padding-top:4px">
      <div class="field" style="flex:0 1 96px"><label for="v-e${i}">Exercício</label><input id="v-e${i}" name="ex" inputmode="numeric" value="${new Date().getFullYear()}" required></div>
      <div class="field"><label for="v-vt${i}">Venal terreno (R$)</label><input id="v-vt${i}" name="vt" inputmode="decimal"></div><div class="field"><label for="v-vc${i}">Venal construção (R$)</label><input id="v-vc${i}" name="vc" inputmode="decimal"></div>
      <div class="field"><label for="v-s${i}">Situação do IPTU</label><select id="v-s${i}" name="sit">${Object.entries(OPT.sitIptu).map(([k,l])=>`<option value="${k}" ${k==='tributado'?'selected':''}>${l}</option>`).join('')}</select></div>
      <div class="field"><label for="v-i${i}">IPTU anual (R$)</label><input id="v-i${i}" name="iptu" inputmode="decimal"></div><div class="field" style="flex:0 1 86px"><label for="v-p${i}">Parcelas</label><input id="v-p${i}" name="parc" inputmode="numeric" value="10"></div>
      <div class="field"><label for="v-m${i}">IPTU mensal informado (R$)</label><input id="v-m${i}" name="mensal" inputmode="decimal" placeholder="se a fonte trouxer"></div>
      <div class="field grow"><label for="v-f${i}">Fonte</label><input id="v-f${i}" name="fonte" placeholder="Carnê, certidão de dados cadastrais..." required></div>
      <button class="btn sm">${ic('add',16)}Lançar</button></form></details></div>`}).join(''):'<div class="muted" style="margin-bottom:8px">Nenhuma inscrição. O valor venal e o IPTU são lançados por inscrição e por ano.</div>'}
    <form class="inline-form" data-form="insc">${campoInsc('i',cidDoTerreno(t),'Nova inscrição',true)}<div class="field"><label for="i-a">Área cadastral (m²)</label><input id="i-a" name="area" inputmode="decimal"></div><button class="btn sm">${ic('add',16)}Adicionar inscrição</button></form>
    </div></section>`;
}
function secaoConfr(t){
  const tot=t.confr.reduce((a,c)=>a+(c.m||0),0);
  return `<section class="sec" id="sec-confr"><div class="sec-h"><h2>Confrontações</h2><span class="faint" style="font-size:13px">${t.confr.length?`${t.confr.length} segmentos · perímetro ${num(tot,2)} m`:''}</span></div><div class="sec-b">
    ${t.confr.length?`<div class="tblwrap"><table class="mini-tbl"><thead><tr><th>#</th><th>Segmento</th><th class="r">Comprimento</th><th>Confronta com</th><th></th></tr></thead><tbody>${t.confr.map((c,i)=>`<tr><td class="faint">${i+1}</td><td>${OPT.confr[c.tipo]}</td><td class="r">${num(c.m,2)} m</td><td>${esc(c.conf||'—')}</td><td class="r"><button class="iconbtn sm lixo" data-a="del-confr" data-i="${i}" aria-label="Remover" title="Remover">${ic('lixo',18)}</button></td></tr>`).join('')}</tbody></table></div>`:'<div class="muted">Para terrenos irregulares ou com várias frentes: um segmento por linha, na ordem do perímetro.</div>'}
    <form class="inline-form" data-form="confr"><div class="field" style="flex:0 1 160px"><label for="cf-t">Segmento</label><select id="cf-t" name="tipo">${Object.entries(OPT.confr).map(([k,l])=>`<option value="${k}">${l}</option>`).join('')}</select></div>
    <div class="field" style="flex:0 1 120px"><label for="cf-m">Comprimento (m)</label><input id="cf-m" name="m" inputmode="decimal" required></div><div class="field grow"><label for="cf-c">Confronta com</label><input id="cf-c" name="conf" placeholder="Rua, lote vizinho, matrícula"></div><button class="btn sm">${ic('add',16)}Adicionar</button></form></div></section>`;
}
function secaoPessoas(t){
  return `<section class="sec" id="sec-pessoas"><div class="sec-h"><h2>Proprietários e contatos</h2></div><div class="sec-b">
    ${t.pessoas.length?`<div class="tblwrap"><table class="mini-tbl"><thead><tr><th>Nome</th><th>Vínculo</th><th class="r">Participação</th><th>Telefone</th>${partesAtivas(t).length?'<th>Parte</th>':''}<th></th></tr></thead><tbody>${t.pessoas.map((p,i)=>`<tr><td>${esc(p.nome)} <span class="faint" style="font-size:12px">${p.tipo}</span></td><td>${OPT.papel[p.papel]}</td><td class="r">${p.pct!=null?num(p.pct,2)+'%':'—'}</td><td>${esc(p.tel||'—')}</td>${partesAtivas(t).length?`<td>${selParte(t,'pes-parte',i,p.parte)}</td>`:''}<td class="r"><button class="iconbtn sm lixo" data-a="del-pes" data-i="${i}" aria-label="Remover" title="Remover">${ic('lixo',18)}</button></td></tr>`).join('')}</tbody></table></div>`:'<div class="muted">Ninguém vinculado.</div>'}
    <form class="inline-form" data-form="pessoa"><div class="field grow"><label for="p-n">Nome ou razão social</label><input id="p-n" name="nome" required></div><div class="field" style="flex:0 1 120px"><label for="p-t">Tipo</label><select id="p-t" name="tipo"><option value="PF">PF</option><option value="PJ">PJ</option></select></div>
    <div class="field"><label for="p-p">Vínculo</label><select id="p-p" name="papel">${Object.entries(OPT.papel).map(([k,l])=>`<option value="${k}">${l}</option>`).join('')}</select></div><div class="field" style="flex:0 1 110px"><label for="p-pc">% (prop.)</label><input id="p-pc" name="pct" inputmode="decimal"></div>
    <div class="field"><label for="p-tel">Telefone</label><input id="p-tel" name="tel"></div><button class="btn sm">${ic('add',16)}Adicionar</button></form></div></section>`;
}

/* ===================== abas da ficha ===================== */
function abaCadastro(t){
  return `<div class="stack">${secaoGenerica(t,'ident')}${secaoGenerica(t,'loc')}${secaoAreas(t)}${secaoConfr(t)}${secaoGenerica(t,'fis')}${secPartesCad(t)}${secaoMats(t)}${secaoInsc(t)}${secaoPessoas(t)}</div>`;
}
function condicoes(t){
  const o=ofertaRef(t),ad=areaAdotada(t),cp=corrPrincipal(t);
  if(UI.edit==='cond'&&o)return `<section class="sec"><form data-form="cond"><div class="sec-h"><h2>Condições pedidas</h2><span class="faint" style="font-size:12px">editando a oferta de ${fd(o.data)}</span></div><div class="sec-b"><div class="editgrid">
    <div class="field"><label for="c-v">Valor pedido (R$)</label><input id="c-v" name="valor" inputmode="decimal" value="${o.valor==null?'':num(o.valor)}"></div>
    <div class="field"><label for="c-f">Forma de pagamento pedida</label>${optSel('forma',OPT.forma,o.forma).replace('id="f-forma"','id="c-f"')}</div>
    <div class="field"><label for="c-c">Corretor</label><select id="c-c" name="cid"><option value="">Sem corretor</option>${S.corretores.map(c=>`<option value="${c.id}" ${c.id===o.cid?'selected':''}>${esc(c.nome)} · ${esc(c.imob)}</option>`).join('')}</select></div>
    <div class="field"><label for="c-val">Validade da oferta</label><input id="c-val" name="validade" type="date" value="${esc(o.validade||'')}"></div>
    <div class="field full"><label for="c-o">Observação sobre a forma de pagamento</label><textarea id="c-o" name="obsPag">${esc(o.obsPag)}</textarea></div>
    <div class="field full"><label for="c-a">Aceita permuta</label><textarea id="c-a" name="aceita" placeholder="Como o vendedor encara a permuta e em que condições">${esc(o.aceita)}</textarea></div></div></div>
    <div class="sec-f"><button type="button" class="btn text" data-a="cancel-edit">Cancelar</button><button class="btn primary">Salvar</button></div></form></section>`;
  const ni=x=>`<span class="ni">${x}</span>`;
  return `<section class="sec" id="sec-cond"><div class="sec-h"><h2>Condições pedidas</h2><div class="sec-acoes">${t.ofertas.length>1?`<button class="btn text sm" data-a="tab" data-t="comercial">${t.ofertas.length} ofertas</button>`:''}${o?`<button class="btn text sm" data-a="edit" data-s="cond">${ic('edit',16)}Editar</button>`:`<button class="btn sm" data-a="nova-oferta">${ic('add',16)}Registrar oferta</button>`}</div></div>
    <div class="sec-b">${o?`<div class="cond2">
      <div><div class="lbl">Valor pedido</div><div class="big">${o.valor?mi(o.valor):ni('Não informado')}</div></div>
      <div><div class="lbl">Por m²</div><div class="big">${o.valor&&ad?brl(o.valor/ad):ni('—')}</div></div></div>
      <dl class="kvl"><div class="kv"><dt>Forma de pagamento</dt><dd>${o.forma?OPT.forma[o.forma]:ni('Não informada')}</dd></div>
      <div class="kv"><dt>Corretor</dt><dd>${cp?`<span>${esc(cp.nome)}<span class="kv-2">${esc(cp.imob)}</span></span>`:ni('—')}</dd></div>
      <div class="kv"><dt>Aceita permuta</dt><dd>${o.aceita?esc(o.aceita):ni('Não informado')}</dd></div>
      <div class="kv"><dt>Pagamento</dt><dd>${o.obsPag?esc(o.obsPag):ni('Não informado')}</dd></div></dl>`
    :'<div class="muted">Nenhuma oferta registrada.</div>'}</div></section>`;
}
function abaComercial(t){
  const ref=ofertaRef(t);
  return `<div class="stack">${blocoFechado('geral')?condicoes(t):''}
  <section class="sec"><div class="sec-h"><h2>Ofertas recebidas</h2><button class="btn sm" data-a="nova-oferta">${ic('add',16)}Registrar oferta</button></div><div class="sec-b">
  ${t.ofertas.length?`<div class="tblwrap"><table class="mini-tbl"><thead><tr><th>Data</th><th>Corretor</th><th class="r">Valor pedido</th><th>Forma</th><th>Status</th><th></th></tr></thead><tbody>
  ${t.ofertas.slice().sort((a,b)=>a.data.localeCompare(b.data)).map((o,i)=>{const c=corretor(o.cid);return `<tr><td>${fd(o.data)}${i===0&&t.ofertas.length>1?'<div class="tag-ref" style="color:var(--texto-suave)">primeira</div>':''}</td><td class="nw">${c?esc(c.nome)+`<div class="faint" style="font-size:12px">${esc(c.imob)}</div>`:'Direto'}</td><td class="r">${brl(o.valor)}</td><td>${o.forma?OPT.forma[o.forma]:'—'}</td><td><span class="chip ${o.status==='ativa'?'good':''}">${esc(o.status.charAt(0).toUpperCase()+o.status.slice(1))}</span></td>
  <td class="r">${o===ref?'<span class="chip blue">Referência</span>':t.neg?`<button class="btn sm text" data-a="ofref" data-o="${o.id}">Usar como referência</button>`:''}</td></tr>`}).join('')}</tbody></table></div>`:'<div class="muted">Nenhuma oferta.</div>'}
  </div></section>
  <section class="sec"><div class="sec-h"><h2>Corretores do terreno</h2></div><div class="sec-b">
  ${t.corretores.length?t.corretores.map(x=>{const c=corretor(x.cid);return `<div style="display:flex;align-items:center;gap:10px;padding:6px 0"><button class="star ${x.principal?'on':''}" data-a="principal" data-c="${x.cid}" aria-label="Marcar ${esc(c.nome)} como principal" title="${x.principal?'Principal':'Marcar como principal'}">★</button><span><b>${esc(c.nome)}</b> <span class="muted" style="font-size:13px">· ${esc(c.imob)} · CRECI ${esc(c.creci)}</span></span>${x.principal?'<span class="faint" style="font-size:12px;margin-left:auto">Principal</span>':''}</div>`}).join(''):'<div class="muted">Entram automaticamente quando apresentam uma oferta.</div>'}</div></section></div>`;
}
function abaNegociacao(t){
  const n=t.neg;
  if(!n)return `<section class="sec"><div class="sec-b"><div class="empty">Sem negociação aberta. Ela abre quando a primeira oferta é registrada.<br><button class="btn primary sm" style="margin-top:12px" data-a="nova-oferta">${ic('add',16)}Registrar oferta</button></div></div></section>`;
  const chain=t.propostas.slice().reverse();
  const form=UI.propForm?`<section class="sec"><form data-form="prop"><div class="sec-h"><h2>Nova proposta · v${t.propostas.length+1}</h2></div><div class="sec-b"><div class="editgrid">
    <div class="field"><label for="pp-o">Origem</label><select id="pp-o" name="origem"><option value="bkm">BKM</option><option value="vendedor">Vendedor</option></select></div>
    <div class="field"><label for="pp-v">Valor total (R$)</label><input id="pp-v" name="valor" inputmode="decimal" required></div>
    <div class="field"><label for="pp-f">Forma de pagamento</label><select id="pp-f" name="forma">${Object.entries(OPT.forma).map(([k,l])=>`<option value="${k}">${l}</option>`).join('')}</select></div>
    <div class="field"><label for="pp-s">Status</label><select id="pp-s" name="status"><option value="apresentada">Apresentada</option><option value="em_analise">Em análise</option><option value="rascunho">Rascunho</option></select></div>
    <div class="field"><label for="pp-d">Apresentada em</label><input id="pp-d" name="data" type="date" value="${HOJE}"></div>
    <div class="field"><label for="pp-val">Validade</label><input id="pp-val" name="validade" type="date" value="${addD(HOJE,15)}"></div>
    <div class="field full"><label for="pp-c">Condições de pagamento</label><textarea id="pp-c" name="cond" placeholder="Entrada, parcelas, permuta, torna, condição suspensiva"></textarea></div>
    <div class="field full" id="pp-warn">${abaixoMin(t)?`<div class="banner warn">${ic('warn')}<div>${abaixoMinTxt(t)}.</div></div>`:''}</div></div>
    <div class="hint">${t.propostas.length?`Responde à v${t.propostas.length}. Se vier do outro lado, a v${t.propostas.length} vira Recusada; se vier do mesmo lado, vira Substituída.`:'Primeira proposta da negociação.'}</div></div>
    <div class="sec-f"><button type="button" class="btn text" data-a="prop-form">Cancelar</button><button class="btn primary">Registrar</button></div></form></section>`:'';
  return `<div class="stack">${trilhaHtml(t)}
  ${secPartes(t)}
  ${secReunioes(t)}
  ${viabSecao(t)}
  <section class="sec"><div class="sec-h"><h2>Propostas</h2><span class="sec-acoes">${negAtiva(t)&&!UI.propForm?`<button class="btn primary sm" data-a="prop-form">${ic('add',16)}Nova proposta</button>`:''}</span></div><div class="sec-b">
  ${form}
  ${chain.length?`<div class="chain" style="margin-top:${UI.propForm?16:0}px">${chain.map((p,i)=>{return `<div class="pnode ${p.origem}"><span class="pd">v${p.v}</span><div class="pc">
    <div class="ph"><span><span class="pv">${brl(p.valor)}</span> <span class="muted" style="font-size:13px">· ${p.origem==='bkm'?'BKM':'Vendedor'}${p.v>1?` responde à v${p.v-1}`:''}</span></span>
    <span style="display:flex;gap:6px;flex-wrap:wrap">${i===0&&negAtiva(t)?`<select aria-label="Status da proposta" data-ch="prop-status" class="chip" style="border:0;height:26px;cursor:pointer">${Object.entries(OPT.statusProp).filter(([k])=>k!=='substituida').map(([k,l])=>`<option value="${k}" ${k===p.status?'selected':''}>${l}</option>`).join('')}</select>`:statusPropChip(p.status)}</span></div>
    <div class="pm">${OPT.forma[p.forma]} · apresentada ${fd(p.data)}${p.validade?` · válida até ${fd(p.validade)}`:''}</div>${p.cond?`<div class="pt">${esc(p.cond)}</div>`:''}</div></div>`}).join('')}</div>`:'<div class="muted">Nenhuma proposta ainda.</div>'}</div></section></div>`;
}
function abaTarefas(t){
  const lista=t.tarefas.slice().sort((a,b)=>{const fa=['concluida','cancelada'].includes(a.status),fb=['concluida','cancelada'].includes(b.status);return fa-fb||a.prazo.localeCompare(b.prazo)});
  return `<div class="stack"><section class="sec"><div class="sec-h"><h2>Próximos passos</h2><span class="faint" style="font-size:13px">${abertas(t).length} abertas · ${atrasadas(t).length} atrasadas</span></div><div class="sec-b" style="padding-top:4px">
  ${lista.map(k=>{const late=!['concluida','cancelada'].includes(k.status)&&k.prazo<HOJE;return `<div class="task" style="align-items:flex-start;padding:12px 0">
    <span style="flex:none;margin-top:2px">${av(k.resp,'sm')}</span>
    <span class="tt"><div class="t1" style="${k.status==='concluida'||k.status==='cancelada'?'text-decoration:line-through;color:var(--texto-suave)':''}">${esc(k.titulo)} ${k.prio==='alta'?'<span class="chip warn" style="height:20px">Alta</span>':''}</div>
    ${k.desc?`<div class="muted" style="font-size:13px">${esc(k.desc)}</div>`:''}<div class="tm ${late?'late':''}">${esc(k.resp)} · ${late?'atrasada desde ':'prazo '}${fd(k.prazo)}</div>
    ${k.status==='concluida'?`<input aria-label="Resultado" data-ch="tar-res" data-k="${k.id}" value="${esc(k.resultado)}" placeholder="O que foi feito ou obtido" style="margin-top:6px;width:100%;height:34px;border:1px solid var(--linha);border-radius:6px;padding:0 10px;background:var(--superficie)">`:''}</span>
    <select aria-label="Status" data-ch="tar-st" data-k="${k.id}" class="chip chip-sel tkst ${k.status}" style="flex:none">${Object.entries(OPT.statusTar).map(([s,l])=>`<option value="${s}" ${s===k.status?'selected':''}>${l}</option>`).join('')}</select></div>`}).join('')||'<div class="muted lista-vazia">Nenhuma tarefa.</div>'}
  <form class="inline-form" data-form="tarefa"><div class="field grow"><label for="tk-t">Nova tarefa</label><input id="tk-t" name="titulo" required placeholder="Ex.: cobrar contraproposta do proprietário"></div>
  <div class="field"><label for="tk-p">Prazo</label><input id="tk-p" name="prazo" type="date" value="${addD(HOJE,7)}" required></div>
  <div class="field"><label for="tk-r">Responsável</label><select id="tk-r" name="resp">${USERS.map(u=>`<option ${u===t.resp?'selected':''}>${u}</option>`).join('')}</select></div>
  <div class="field" style="flex:0 1 110px"><label for="tk-pr">Prioridade</label><select id="tk-pr" name="prio"><option value="media">Média</option><option value="alta">Alta</option><option value="baixa">Baixa</option></select></div>
  <div class="field full" style="flex-basis:100%"><label for="tk-d">Descrição</label><input id="tk-d" name="desc"></div><button class="btn sm">${ic('add',16)}Adicionar</button></form>
  </div></section></div>`;
}
function abaUrbanismo(t){
  return `<div class="stack">${secAnaliseUrb(t)}
  <section class="sec"><div class="sec-h"><h2>Infraestrutura na porta</h2>${infraNV(t)?`<span class="faint" style="font-size:13px">${infraNV(t)} não verificado${infraNV(t)>1?"s":""}</span>`:""}</div><div style="padding-bottom:6px">
  ${INFRA.map(([k,l])=>{const r=t.infra[k]||{d:'nao_verificado'};return `<div class="infra"><span>${l}</span><span class="seg3" role="group" aria-label="${l}">${[['nao_verificado','Não verificado','nv'],['sim','Sim','sim'],['nao','Não','nao']].map(([v,lb,c])=>`<button type="button" class="${c}" aria-pressed="${r.d===v}" data-a="infra" data-k="${k}" data-v="${v}">${lb}</button>`).join('')}</span>
  <span class="meta">${r.d!=='nao_verificado'?`${fd(r.data)} · <input aria-label="Fonte da verificação de ${l}" data-ch="infra-fonte" data-k="${k}" value="${esc(r.fonte)}" class="infra-f">`:''}</span></div>`}).join('')}</div>
  </section></div>`;
}
const OPT_REU={modalidade:{presencial:'Presencial',online:'Online'},local:{bkm:'Na BKM',externo:'Externa'},status:{realizada:'Realizada',agendada:'Agendada',cancelada:'Cancelada'}};
const proxReuniao=t=>(t.reunioes||[]).filter(m=>m.status==='agendada'&&m.data>=HOJE).sort((a,b)=>(a.data+a.hora).localeCompare(b.data+b.hora))[0];
function secReunioes(t){
  const ms=(t.reunioes||[]).slice().sort((a,b)=>(b.data+b.hora).localeCompare(a.data+a.hora));
  const real=ms.filter(m=>m.status==='realizada').length;
  const form=UI.reuForm?`<form data-form="reuniao" class="reu-form"><div class="editgrid">
    <div class="field"><label for="ru-s">Situação</label><select id="ru-s" name="status"><option value="realizada">Realizada</option><option value="agendada">Agendada</option></select></div>
    <div class="field"><label for="ru-d">Data</label><input id="ru-d" name="data" type="date" value="${HOJE}" required></div>
    <div class="field"><label for="ru-h">Hora</label><input id="ru-h" name="hora" type="time" value="10:00"></div>
    <div class="field"><span class="lbl" id="ru-m-l">Modalidade</span><span class="seg3" role="radiogroup" aria-labelledby="ru-m-l">${Object.entries(OPT_REU.modalidade).map(([k,l],i)=>`<label class="opt-radio"><input type="radio" name="modalidade" value="${k}" ${i===0?'checked':''}>${l}</label>`).join('')}</span></div>
    <div class="field" data-so="presencial"><span class="lbl" id="ru-l-l">Onde</span><span class="seg3" role="radiogroup" aria-labelledby="ru-l-l">${Object.entries(OPT_REU.local).map(([k,l],i)=>`<label class="opt-radio"><input type="radio" name="local" value="${k}" ${i===0?'checked':''}>${l}</label>`).join('')}</span></div>
    <div class="field" data-so="externo"><label for="ru-e">Endereço</label><input id="ru-e" name="endereco" placeholder="Escritório do vendedor, no terreno..."></div>
    <div class="field"><label for="ru-pb">Participantes da BKM</label><input id="ru-pb" name="pbkm" value="${esc(me())}"></div>
    <div class="field"><label for="ru-pe">Participantes externos</label><input id="ru-pe" name="pext" placeholder="Vendedor, corretor, advogado"></div>
    <div class="field full"><label for="ru-p">Pauta</label><input id="ru-p" name="pauta"></div>
    <div class="field full" data-so="realizada"><label for="ru-r">O que foi tratado</label><textarea id="ru-r" name="resumo" placeholder="Posições de cada lado, valores citados, objeções"></textarea></div>
    <div class="field full" data-so="realizada"><label for="ru-n">Encaminhamentos</label><textarea id="ru-n" name="enc" placeholder="Quem faz o quê, até quando"></textarea></div>
    </div><div class="sec-f" style="padding:12px 0 0"><button type="button" class="btn text" data-a="reu-form">Cancelar</button><button class="btn primary">Registrar reunião</button></div></form>`:'';
  return `<section class="sec"><div class="sec-h"><h2>Reuniões${ms.length?` <span class="h-n">${ms.length}</span>`:''}</h2><span class="sec-acoes">${negAtiva(t)&&!UI.reuForm?`<button class="btn primary sm" data-a="reu-form">${ic('add',16)}Registrar reunião</button>`:''}</span></div><div class="sec-b">
  ${form}
  ${ms.length?`<div class="reus">${ms.map(m=>`<article class="reu ${m.status}"><div class="reu-h"><div><div class="reu-t">${fd(m.data)} · ${esc(m.hora||'')}</div><div class="reu-m">${OPT_REU.modalidade[m.modalidade]}${m.modalidade==='presencial'?' · '+OPT_REU.local[m.local]+(m.endereco?' · '+esc(m.endereco):''):''}</div></div>
    <span class="reu-acts">${m.status==='agendada'?`<span class="chip blue">Agendada</span>${negAtiva(t)&&m.data<=HOJE?`<button class="btn sm" data-a="reu-feita" data-k="${m.id}">${ic('check',16)}Marcar realizada</button>`:''}`:m.status==='cancelada'?'<span class="chip">Cancelada</span>':`<span class="chip good">Realizada</span>`}</span></div>
    ${m.part.bkm||m.part.ext?`<div class="reu-p"><span><b>BKM</b> ${esc(m.part.bkm||'—')}</span><span><b>Externos</b> ${esc(m.part.ext||'—')}</span></div>`:''}
    ${m.pauta?`<div class="reu-x"><span class="k">Pauta</span>${esc(m.pauta)}</div>`:''}${m.resumo?`<div class="reu-x"><span class="k">Tratado</span>${esc(m.resumo)}</div>`:''}${m.enc?`<div class="reu-x"><span class="k">Encaminhamentos</span>${esc(m.enc)}</div>`:''}
    ${m.status==='realizada'?`<div class="reu-ata">${m.ata?`${ic('doc',18)}<span><b>Ata</b> · ${esc(m.ata.nome)} · v${m.ata.versoes}</span><button class="btn sm text" data-a="upload" data-k="ata:${m.id}">${ic('upload',16)}Nova versão</button>`:`${ic('doc',18)}<span class="muted">Sem ata</span><button class="btn sm text" data-a="upload" data-k="ata:${m.id}">${ic('upload',16)}Anexar ata</button>`}</div>`:''}
  </article>`).join('')}</div>`:'<div class="muted">Nenhuma reunião registrada.</div>'}
  </div></section>`;
}
function abaDocs(t){
  const ativo=t.neg&&SIDX(t.neg.etapa)>=SIDX('contrato');
  const doc=tp=>t.docs.find(d=>d.tipo===tp);
  const outros=t.docs.filter(d=>!CHECK_DIL.some(([k])=>k===d.tipo));
  const dl=t.dilig.slice().sort((a,b)=>(a.sit==='resolvida')-(b.sit==='resolvida'));
  const corDil={nao_avaliada:'',em_analise:'blue',pendente:'warn',resolvida:'good',impeditiva:'crit'};
  const secDil=`<section class="sec"><div class="sec-h"><h2>Diligências e pendências</h2><span class="faint" style="font-size:13px">${t.dilig.filter(d=>d.sit!=='resolvida').length} em aberto${t.dilig.some(d=>d.sit==='impeditiva')?' · <b style="color:var(--terracota)">há impeditiva</b>':''}</span></div><div class="sec-b" style="padding-top:4px">
    ${dl.map(d=>`<div class="task" style="align-items:flex-start;padding:12px 0"><span class="chip ${corDil[d.sit]}" style="flex:none;margin-top:2px">${OPT.catDil[d.cat]}</span><span class="tt"><div class="t1">${esc(d.titulo)}</div>${d.prov?`<div class="muted" style="font-size:13px">${esc(d.prov)}</div>`:''}<div class="tm">${esc(d.resp)}</div></span>
    <select aria-label="Situação" data-ch="dil-sit" data-k="${d.id}" class="chip chip-sel ${corDil[d.sit]}" style="flex:none">${Object.entries(OPT.sitDil).map(([k,l])=>`<option value="${k}" ${k===d.sit?'selected':''}>${l}</option>`).join('')}</select></div>`).join('')||'<div class="muted lista-vazia">Nenhuma diligência registrada.</div>'}
    <form class="inline-form" data-form="dilig"><div class="field" style="flex:0 1 150px"><label for="dl-c">Categoria</label><select id="dl-c" name="cat">${Object.entries(OPT.catDil).map(([k,l])=>`<option value="${k}">${l}</option>`).join('')}</select></div>
    <div class="field grow"><label for="dl-t">Questão</label><input id="dl-t" name="titulo" required placeholder="Ex.: confirmar inventário concluído"></div>
    <div class="field" style="flex:0 1 150px"><label for="dl-s">Situação</label><select id="dl-s" name="sit">${Object.entries(OPT.sitDil).map(([k,l])=>`<option value="${k}" ${k==='pendente'?'selected':''}>${l}</option>`).join('')}</select></div>
    <div class="field"><label for="dl-r">Responsável</label><select id="dl-r" name="resp">${USERS.map(u=>`<option ${u===t.resp?'selected':''}>${u}</option>`).join('')}</select></div>
    <div class="field full" style="flex-basis:100%"><label for="dl-p">Providência</label><input id="dl-p" name="prov"></div><button class="btn sm">${ic('add',16)}Registrar</button></form>
    </div></section>`;
  return `<div class="stack">${secDil}<section class="sec chk-group"><div class="chk-gh"><span class="gt">Checklist de documentos</span>${ativo?`<span class="progress"><span class="bar"><span style="width:${CHECK_DIL.filter(([k,o])=>o&&docSt(doc(k))==='validado').length/CHECK_DIL.filter(c=>c[1]).length*100}%"></span></span>${CHECK_DIL.filter(([k,o])=>o&&docSt(doc(k))==='validado').length} de ${CHECK_DIL.filter(c=>c[1]).length} obrigatórios</span>`:'<span class="faint" style="font-size:13px">Vale a partir da Diligência</span>'}</div>
  ${CHECK_DIL.map(([k,o])=>{const d=doc(k),st=docSt(d),va=d?docVal(d):null;return `<div class="doc"><span class="di">${ic('doc',18)}</span><div style="min-width:0"><div class="dn">${TIPOS_DOC[k][0]} ${o?'':'<span class="opt">opcional</span>'}</div><div class="ds">${d?`v${d.versoes} · emitido ${fd(d.emitido)}${va?` · ${st==='vencido'?'venceu':'vence'} ${fd(va)}`:''}`:`Validade: ${TIPOS_DOC[k][2]?TIPOS_DOC[k][2]+' dias':'não vence'}`}</div></div>
  <div class="da">${docChip(st)}${st==='recebido'?`<button class="btn sm text" data-a="doc-ok" data-k="${k}">${ic('check',16)}Validar</button>`:''}<button class="btn sm text" data-a="upload" data-k="${k}">${ic('upload',16)}${d?'Nova versão':'Enviar'}</button></div></div>`}).join('')}</section>
  <section class="sec chk-group"><div class="chk-gh"><span class="gt">Fotos, plantas e outros</span><button class="btn sm text" data-a="upload" data-k="foto">${ic('upload',16)}Enviar foto</button></div>
  ${outros.map(d=>`<div class="doc"><span class="di">${ic('doc',18)}</span><div><div class="dn">${esc(d.nome||TIPOS_DOC[d.tipo][0])}</div><div class="ds">${TIPOS_DOC[d.tipo][1]} · ${fd(d.emitido)}</div></div><div class="da">${docChip(docSt(d))}</div></div>`).join('')||'<div class="empty">Nada enviado.</div>'}</section></div>`;
}
function abaHist(t){
  return `<section class="sec"><div class="tl">${histOrd(t.hist).map(h=>`<div class="tli"><span class="ai blue">${ic('fwd',16)}</span><div><div class="tx">${esc(h.txt)}</div><div class="ts">${esc(h.user)}</div></div><span class="when">${fd(h.em)}</span></div>`).join('')}</div></section>`;
}

/* ===================== avanço ===================== */
let ADV_REQ=false;
const advItens=items=>items.map(x=>`<li><span class="${x.ok?'ok':'no'}">${ic(x.ok?'check':'close',16)}</span><span>${esc(x.txt)}${x.fix?` · <button class="linkbtn" data-a="${x.fix[0].startsWith('tab:')?'tab':x.fix[0]}" ${x.fix[0].startsWith('tab:')?`data-t="${x.fix[0].slice(4)}"`:''}>${x.fix[1]}</button>`:''}</span></li>`).join('');
/* ===================== páginas ===================== */
/* ficha em página única: cada seção é um bloco com seta; ao abrir um terreno, só a Visão geral nasce aberta (nada é guardado) */
let BLA={},blId=null;
const blocoFechado=k=>!BLA[k];
const blocoAbre=k=>{BLA[k]=true};
function rolarBloco(k,s){setTimeout(()=>{const el=(s&&document.getElementById('sec-'+s))||document.getElementById('bl-'+k);el&&el.scrollIntoView({behavior:'smooth',block:'start'})},30)}
function pgFicha(){
  if(UI.id!==blId){BLA={geral:true};blId=UI.id}
  const t=T(UI.id),c=completude(t),n=t.neg;
  const endereco=[t.logradouro&&(t.logradouro+(t.numero?', '+t.numero:'')),t.bairro,t.zona&&'Zona '+OPT.zona[t.zona],eixo(t.eixo)].filter(Boolean).join(' · ');
  const zt=zonasTxt(t),ad=areaAdotada(t);
  const tabs=[['geral','Visão geral',''],['cadastro','Cadastro do imóvel',''],['comercial','Comercial',t.ofertas.length],['negociacao','Negociação',t.propostas.length+t.reunioes.length],['fases','Fases',fasesAbertas(t).length],['tarefas','Tarefas',abertas(t).length],['urbanismo','Urbanismo e infraestrutura',''],['documentos','Documentos e diligências',t.docs.length+t.dilig.filter(d=>d.sit!=='resolvida').length],['historico','Histórico','']];
  const FN={geral:abaGeral,cadastro:abaCadastro,comercial:abaComercial,negociacao:abaNegociacao,fases:abaFases,tarefas:abaTarefas,urbanismo:abaUrbanismo,documentos:abaDocs,historico:abaHist};
  const blocos=tabs.map(([k,l,q])=>{const fe=blocoFechado(k);
    return `<section class="bl${k==='historico'?' bl-hist':''}" id="bl-${k}"><h2 class="bl-t"><button class="bl-h" data-a="bloco" data-t="${k}" aria-expanded="${!fe}" aria-controls="blc-${k}"><svg class="bl-seta" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg><span>${l}</span>${q!==''&&q!==0?`<span class="n">${q}</span>`:''}</button></h2>
      <div class="bl-c" id="blc-${k}" ${fe?'hidden':''}>${fe?'':FN[k](t)+`<div class="bl-fim"><button class="bl-rec" data-a="bloco" data-t="${k}" data-fim="1" aria-label="Recolher ${l}" title="Recolher ${l}"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 15l6-6 6 6"/></svg><span>Recolher</span></button></div>`}</div></section>`}).join('');
  return `${linhaTopo(t)}<button class="back" data-a="nav" data-r="${UI.from}">${ic('back',20)}${UI.from==='negociacoes'?'Fases':UI.from==='inicio'?'Início':'Terrenos'}</button>
  <div class="dhead"><div style="min-width:0"><div class="eyebrow"><span class="num">${t.codigo}</span>${n?`<span>·</span><span class="num">${n.codigo}</span>`:''}${fasesAbertas(t).filter(f=>f!==faseEnt()).map(f=>`<span>·</span><span class="num">${procAberto(t,f).codigo}</span>`).join('')}<span>·</span><span>identificado em ${fd(t.dataIdent)}</span>${t.situacao==='arquivado'?'<span class="chip">Arquivado</span>':''}</div>
    <h1>${esc(t.nome)}</h1><div class="muted" style="margin-top:4px">${esc(endereco)||'<span class="faint">Endereço não informado</span>'}</div>
    <div class="dchips">${naEntrada(t)&&t.neg?.status==='ativo'?'':chipFase(t)}${ad!=null?`<span class="chip num">${m2(ad)}</span>`:''}${zt?`<span class="chip">${esc(zt)}</span>`:''}${t.prioridade?`<span class="chip ${t.prioridade==='estrategica'||t.prioridade==='alta'?'warn':''}">Prioridade ${OPT.prioridade[t.prioridade].toLowerCase()}</span>`:''}${atrasadas(t).length?`<span class="chip crit">${atrasadas(t).length} tarefa${atrasadas(t).length>1?'s':''} atrasada${atrasadas(t).length>1?'s':''}</span>`:''}</div></div>
    <div style="display:flex;flex-direction:column;gap:12px;align-items:flex-end"><div style="display:flex;align-items:center;gap:8px">${av(t.resp)}<div><div style="font-weight:500">${esc(t.resp)}</div><div class="faint" style="font-size:12px">Responsável</div></div></div>${n?tempPicker(t):''}</div></div>
  <div class="stack">
  ${c.pct<100?`<div class="complete"><span class="progress"><span class="bar"><span style="width:${c.pct}%"></span></span><b>Ficha ${c.pct}% completa</b></span>${c.faltam.length?`<span class="muted" style="font-size:13px">Falta:</span><span class="missing">${c.faltam.slice(0,6).map(f=>`<button data-a="ir" data-t="${f[2]}" data-s="${f[3]||''}">${f[0]}</button>`).join('')}${c.faltam.length>6?`<span class="faint" style="font-size:12px;align-self:center">+${c.faltam.length-6}</span>`:''}</span>`:''}</div>`:''}
  <div class="adv-main">${painelAvanco(t)}</div>
  </div>
  <div class="blocos">${blocos}</div>`;
}
function bateBusca(t,q){if(!q)return true;q=q.toLowerCase();const hay=[t.codigo,t.nome,t.logradouro,t.numero,t.bairro,OPT.zona[t.zona],eixo(t.eixo),t.resp,...t.mats.map(m=>m.num+' '+digits(m.num)),...t.insc.map(i=>i.sql+' '+digits(i.sql)),...t.ofertas.map(o=>corretor(o.cid)?.nome),...t.pessoas.map(p=>p.nome)].join(' ').toLowerCase();return q.split(/\s+/).every(w=>hay.includes(w))}
/* filtros: gaveta e chips em proto_filtros.js (fxLista, fxBarra) */
function linhas(){
  const l=fxLista('terrenos').filter(t=>bateBusca(t,UI.q)).sort((a,b)=>(b.neg?.temp||0)-(a.neg?.temp||0)||b.codigo.localeCompare(a.codigo));
  return tabela('terrenos',l,COLS_TERRENOS,{cls:'lista-t',attr:attrAbrir('terrenos'),vazio:`Nenhum terreno${UI.q?` para “${esc(UI.q)}”`:''}.<br><button class="btn sm" style="margin-top:12px" data-a="novo">${ic('add',16)}Novo terreno</button>`});
}
function pgTerrenos(){
  return `<div class="page-h"><div><h1>Terrenos</h1><div class="sub">${fxLista('terrenos').length===S.terrenos.length?S.terrenos.length+' terrenos':fxLista('terrenos').length+' de '+S.terrenos.length+' terrenos'}</div></div></div>
  ${fxBarra('terrenos')}
  <section class="sec lista"><div id="rows">${linhas()}</div></section>`;
}
function pgInicio(){
  const h=new Date().getHours(),s=h<12?'Bom dia':h<18?'Boa tarde':'Boa noite';
  const ativos=S.terrenos.filter(t=>t.neg?.status==='ativo');
  const tarefas=S.terrenos.flatMap(t=>atrasadas(t).map(k=>({t,k})));
  const quentes=ativos.filter(t=>(t.neg.temp||0)>=4);
  const incompletos=S.terrenos.filter(t=>t.situacao==='ativo'&&completude(t).pct<50);
  const aprov=S.terrenos.filter(t=>t.neg?.status==='ativo'&&t.neg.pedido&&naVez(t.neg.pedido).some(r=>podeDecidir(r,me())));
  const att=[...aprov.map(t=>({sev:'warn',i:'check',ti:`Aprovar: ${destinoNome(t.neg.pedido.tipo,t.neg.pedido.dest)}`,su:`${t.nome} · pedido por ${t.neg.pedido.por}`,id:t.id,tab:'geral'})),...tarefas.map(({t,k})=>({sev:'crit',i:'clock',ti:k.titulo,su:`${t.nome} · ${k.resp} · venceu ${fd(k.prazo)}`,id:t.id,tab:'tarefas'})),
    ...ativos.filter(abaixoMin).map(t=>({sev:'warn',i:'money',ti:`Rentabilidade abaixo da mínima`,su:`${t.nome} · margem ${num(t.neg.viab.margem,1)}% vs ${num(S.vbMargemMin,1)}%`,id:t.id,tab:'negociacao'})),
    ...ativos.filter(t=>!t.neg.temp).map(t=>({sev:'warn',i:'warn',ti:'Temperatura não avaliada',su:t.nome,id:t.id,tab:'cadastro'}))];
  return `<div class="forma"><div class="page-h"><div><h1>${s}, ${esc(me().split(' ')[0])}</h1><div class="sub">${ativos.length} negociações em andamento</div></div></div>
  <div class="kpis"><button class="kpi" data-a="nav" data-r="negociacoes"><span class="v">${ativos.length}</span><span class="l">Negociações ativas</span></button>
  <button class="kpi" data-a="nav" data-r="terrenos"><span class="v">${quentes.length}</span><span class="l">Quentes (temperatura 4 ou 5)</span></button>
  <button class="kpi ${tarefas.length?'crit':''}" data-a="nav" data-r="terrenos"><span class="v">${tarefas.length}</span><span class="l">Tarefas atrasadas</span></button>
  <button class="kpi ${incompletos.length?'warn':''}" data-a="nav" data-r="terrenos"><span class="v">${incompletos.length}</span><span class="l">Fichas com menos de 50% preenchidas</span></button></div>
  <div class="grid-6040 sect-gap"><section class="card"><div class="card-h"><h2>Precisa de atenção</h2><span class="chip crit">${att.length}</span></div><div class="alist" style="margin-top:8px">${att.map(a=>`<button class="aitem" data-a="abrir" data-id="${a.id}" data-tab="${a.tab}" data-from="inicio"><span class="ai ${a.sev}">${ic(a.i,18)}</span><span><div class="at">${esc(a.ti)}</div><div class="as">${esc(a.su)}</div></span><span class="when">${ic('chev',18)}</span></button>`).join('')||'<div class="empty">Tudo em dia.</div>'}</div></section>
  <section class="card"><div class="card-h"><h2>Mais quentes</h2></div><div class="alist" style="margin-top:8px">${ativos.slice().sort((a,b)=>(b.neg.temp||0)-(a.neg.temp||0)).slice(0,5).map(t=>`<button class="aitem" data-a="abrir" data-id="${t.id}" data-from="inicio"><span style="margin-top:6px">${tempMini(t.neg.temp)}</span><span><div class="at">${esc(t.nome)}</div><div class="as">${SN(t.neg.etapa)}${t.neg.sub?' · '+esc(subN(t.neg.sub)):''} · ${ofertaRef(t)?.valor?mi(ofertaRef(t).valor):'sem valor'}</div></span></button>`).join('')}</div></section></div></div>`;
}

/* ===================== shell ===================== */
const NAV=[['inicio','Início','casa'],['terrenos','Terrenos','terrenos'],['mapa','Mapa','mapa'],['negociacoes','Fases','contrato'],['tarefas','Tarefas','checklist'],['dashboard','Dashboard','indicadores']];
/* Configurações › Funil: só para administrador (no menu lateral; no celular, pelo sino) */
const navSide=()=>ehAdmin(me())?[...NAV,['config','Configurações','config']]:NAV;
function render(){
  if(UI.route!=='mapa'&&document.body.classList.contains('mp-cheia'))mpTelaCheia(false);
  const cur=UI.route==='terreno'?UI.from:UI.route;
  document.body.classList.toggle('menu-min',menuMin);
  $('#side').innerHTML=`<button class="menu-tg" data-a="menu" aria-expanded="${!menuMin}" aria-label="${menuMin?'Expandir menu':'Recolher menu'}" title="${menuMin?'Expandir menu':'Recolher menu'}">${ic(menuMin?'expandir':'recolher',20)}</button><button class="compose" data-a="novo" ${menuMin?'title="Novo terreno" aria-label="Novo terreno"':''}>${ic('add',24)}<span class="rot">Novo terreno</span></button>`+navSide().map(([r,l,i])=>`<button class="nav-item" data-a="nav" data-r="${r}" ${cur===r?'aria-current="page"':''} ${menuMin?`title="${l}" aria-label="${l}"`:''}>${bi(i)}<span class="rot">${l}</span></button>`).join('')+``;
  $('#bnav').innerHTML=NAV.map(([r,l,i])=>`<button data-a="nav" data-r="${r}" ${cur===r?'aria-current="page"':''}><span class="pill">${bi(i,32)}</span>${l}</button>`).join('');
  document.body.classList.toggle('ro',UI.role==='Leitura');
  renderTema();{const n0=S.notifs.length;rotinaNotif();if(S.notifs.length!==n0)save()}renderSino();
  renderPerfil();
  document.body.dataset.rota=UI.route;$('#main').innerHTML=({inicio:pgInicio,terrenos:pgTerrenos,negociacoes:pgNeg,terreno:pgFicha,mapa:pgMapa,dashboard:pgDash,tarefas:pgTarefas,config:pgConfig})[UI.route]();posRender();
  renderModal();
}
let tmr;function toast(m,e){const el=$('#toast');el.textContent=m;el.className='toast show'+(e?' err':'');clearTimeout(tmr);tmr=setTimeout(()=>el.className='toast',2800)}
function go(route,x={}){if(UI.edMini)Object.assign(UI,{edMini:false,mpModo:null,desenho:null,desHist:null,vSel:null,vMenu:false,vMover:false});Object.assign(UI,{route,edit:null,propForm:false,reuForm:false,modal:null},x);render();window.scrollTo({top:0})}

/* ===================== modais ===================== */
function renderModal(){
  const M=UI.modal,el=$('#modal');if(!M){el.innerHTML='';UI.alvo=null;UI.alvoEtapa=null;UI.alvoPend=null;UI.acao=null;UI.nv=null;UI.nvPool=null;UI.nvKmz=null;UI.ofPoly=null;UI.kmzNovo=false;UI.lotes=null;UI.novoPoi=null;UI.novoConc=null;UI.poiVolta=null;UI.kmzItens=null;UI.tkSel=null;UI.grafico=null;UI.geo=null;UI.alvoParte=null;UI.poiExcl=null;return}
  let h='';const fechar=`<button class="iconbtn" data-a="close" aria-label="Fechar">${ic('close')}</button>`;
  h=viabModal(M,fechar)||partesModal(M,fechar)||fasesModal(M,fechar)||funilModal(M,fechar)||setoresModal(M,fechar)||topoModal(M,fechar);
  if(M==='novo')h=UI.nv?nvDadosHtml(fechar):nvPasso1Html(fechar);
  if(M==='novo-sobre')h=nvSobreHtml(fechar);
  if(M==='lotes-poly')h=lotesPolyHtml(fechar);
  if(M==='oferta'){const tt=T(UI.id),pd=UI.ofPoly;h=`<div class="dh"><h2>Registrar oferta</h2>${fechar}</div><form data-form="oferta" id="f-of"><div class="fields">
    ${pd?`<div class="field full"><div class="banner blue">${ic('layers')}<div>Oferta de parte do terreno: ${m2(Math.round(areaPoly(pd)))}${tt?.poly?` de ${m2(Math.round(areaPoly(tt.poly)))} (${num(100*areaPoly(pd)/areaPoly(tt.poly),0)}%)`:''}. O pedaço oferecido fica guardado na oferta.</div></div></div>`:''}
    <div class="field"><label for="o-c">Corretor</label><select id="o-c" name="cid"><option value="">Sem corretor / direto</option>${S.corretores.map(c=>`<option value="${c.id}">${esc(c.nome)} · ${esc(c.imob)}</option>`).join('')}</select></div>
    <div class="field"><label for="o-v">Valor pedido (R$)</label><input id="o-v" name="valor" inputmode="decimal" required></div>
    <div class="field"><label for="o-f">Forma de pagamento pedida</label>${optSel('forma',OPT.forma,null).replace('id="f-forma"','id="o-f"')}</div>
    <div class="field"><label for="o-val">Validade</label><input id="o-val" name="validade" type="date"></div>
    <div class="field full"><label for="o-o">Observação sobre a forma de pagamento</label><input id="o-o" name="obsPag"></div>
    <div class="field full"><label for="o-a">Aceita permuta</label><input id="o-a" name="aceita"></div></div></form>
    <div class="df"><button class="btn text" data-a="close">Cancelar</button><button class="btn primary" type="submit" form="f-of">Registrar</button></div>`}
  if(M==='geo')h=geoModalHtml(fechar);
  if(M==='poi-excl'){const x=UI.poiExcl;h=`<div class="dh"><div><h2>Excluir ${esc(x.nome)}?</h2></div>${fechar}</div>
  <p class="muted" style="margin:0">${x.tp==='g'?'O lugar sai dos pontos de interesse deste terreno e continua fora mesmo se a busca for refeita.':'O ponto é da empresa: sai deste e de todos os terrenos e do mapa.'} Dá para restaurar em “Excluídos”, no fim do quadro.</p>
  <div class="df"><button class="btn text" data-a="close">Cancelar</button><button class="btn primary" data-a="poi-excl-ok">Excluir</button></div>`}
  if(M==='poi')h=`<div class="dh"><div><h2>Novo ponto de interesse</h2><div class="muted" style="margin-top:4px">Serve para medir a distância dos terrenos e traçar rotas.</div></div>${fechar}</div>
  <form data-form="poi" id="f-poi"><div class="fields"><div class="field full"><label for="po-n">Nome</label><input id="po-n" name="nome" required placeholder="Estação, escola, terminal..."></div>
  <div class="field"><label for="po-c">Categoria</label><select id="po-c" name="cat">${Object.entries(CAT_POI).map(([k,l])=>`<option value="${k}">${l}</option>`).join('')}</select></div>
  <div class="field"><span class="lbl-f">Local</span><span class="num muted" style="line-height:44px">${num(UI.novoPoi.lat,5)}, ${num(UI.novoPoi.lng,5)}</span></div></div></form>
  <div class="df"><button class="btn text" data-a="close">Cancelar</button><button class="btn primary" type="submit" form="f-poi">Salvar ponto</button></div>`;
  if(M==='grafico'){const k=UI.grafico;h=`<div class="dh g-exp"><h2>${DIMS[k].l}</h2>${fechar}</div>${grafico(k,true)}<h3 class="lbl-up" style="margin-top:var(--e6)">Dados do gráfico</h3>${tabelaGrafico(k)}`}
  if(M==='tarefa'){const sel=UI.tkSel,t=sel.tid?T(sel.tid):null,k=t?t.tarefas.find(x=>x.id===sel.kid):null,ro=UI.role==='Leitura';
    const o=(obj,v)=>Object.entries(obj).map(([x,l])=>`<option value="${x}" ${v===x?'selected':''}>${esc(l)}</option>`).join('');
    h=`<div class="dh"><div><h2>${k?esc(k.titulo):'Nova tarefa'}</h2>${t?`<div class="muted" style="margin-top:4px">${t.codigo} · ${esc(t.nome)}</div>`:''}</div>${fechar}</div>
    <form data-form="tarefa-m" id="f-tk"><fieldset ${ro?'disabled':''} style="border:0;padding:0;margin:0"><div class="fields">
    <div class="field full"><label for="tm-t">Tarefa</label><input id="tm-t" name="titulo" required value="${esc(k?.titulo||'')}"></div>
    ${k?'':`<div class="field full"><label for="tm-ter">Terreno</label><select id="tm-ter" name="ter" required><option value="">Escolha o terreno</option>${o(Object.fromEntries(ativosBanco().map(x=>[x.id,x.codigo+' · '+x.nome])),UI.tk.ter)}</select></div>`}
    <div class="field"><label for="tm-r">Responsável</label><select id="tm-r" name="resp">${o(Object.fromEntries(USERS.map(u=>[u,u])),k?.resp||me())}</select></div>
    <div class="field"><label for="tm-p">Prazo</label><input id="tm-p" name="prazo" type="date" required value="${k?.prazo||addD(HOJE,3)}"></div>
    <div class="field"><label for="tm-pr">Prioridade</label><select id="tm-pr" name="prio">${o(OPT.prioTar,k?.prio||'media')}</select></div>
    <div class="field"><label for="tm-s">Status</label><select id="tm-s" name="status">${o(OPT.statusTar,k?.status||sel.status||'pendente')}</select></div>
    <div class="field full"><span class="lbl-f">Marcar colegas (recebem notificação)</span><div class="marc">${USERS.map(u=>`<label class="chk"><input type="checkbox" name="marc" value="${esc(u)}" ${(k?.marcados||[]).includes(u)?'checked':''}>${esc(u)}</label>`).join('')}</div></div>
    <div class="field full"><label for="tm-d">Descrição</label><textarea id="tm-d" name="desc">${esc(k?.desc||'')}</textarea></div>
    ${k?`<div class="field full"><label for="tm-res">Resultado</label><textarea id="tm-res" name="resultado" placeholder="O que foi feito ou decidido">${esc(k.resultado||'')}</textarea></div>`:''}</div></fieldset></form>
    <div class="df">${t?`<button class="btn text" data-a="abrir" data-id="${t.id}" data-tab="tarefas" data-from="tarefas">Abrir terreno</button>`:''}<button class="btn text" data-a="close">${ro?'Fechar':'Cancelar'}</button>${ro?'':`<button class="btn primary" type="submit" form="f-tk">${k?'Salvar':'Criar tarefa'}</button>`}</div>`}
  el.innerHTML=`<div class="scrim" data-a="scrim"><div class="dialog" role="dialog" aria-modal="true">${h}</div></div>`;
  if(M==='novo')nvPosRender();
  const f=el.querySelector('input:not([type=hidden]),select');if(f)setTimeout(()=>f.focus(),30);
}
function dedupe(){
  const f=$('#f-novo');if(!f)return;const mun=f.querySelector('[name=mun]:checked')?.value||'sp',cid=CIDADES_INSC[mun],nd=cid.mascara?digitosMasc(cid.mascara):0,mat=digits(f.mat.value),sql=digits(f.sql.value),log=f.logradouro.value.trim().toLowerCase(),nr=f.numero.value.trim().toLowerCase();
  let hit=null,msg='',cert='';const quadra=[];
  for(const t of S.terrenos){
    const ins=sql.length>=6&&t.insc.find(i=>insCid(i)===mun&&digits(i.sql)===sql);
    if(ins){hit=t;cert='certa';msg=`Mesma inscrição ${ins.sql} (${cid.cidade})`;break}
    const m=mat.length>=3&&t.mats.find(x=>digits(x.num)===mat);
    if(m){hit=t;cert=m.cri===f.cri.value?'certa':'provavel';msg=`Mesma matrícula ${m.num}${m.cri===f.cri.value?' no '+m.cri:' em outro cartório ('+m.cri+')'}`;break}
    if(log.length>=4&&(t.logradouro||'').toLowerCase()===log&&(!nr||!t.numero||t.numero.toLowerCase()===nr)){hit=t;cert='possivel';msg='Mesmo endereço'}
    // nos dois cadastros os 6 primeiros dígitos são setor e quadra
    if(nd&&sql.length===nd&&t.situacao==='ativo'){const q=t.insc.find(i=>insCid(i)===mun&&digits(i.sql).length===nd&&digits(i.sql).slice(0,6)===sql.slice(0,6)&&digits(i.sql)!==sql);if(q)quadra.push([t,q])}
  }
  const box=$('#dedupe'),btn=$('#btn-novo');f.dataset.dup=hit&&cert==='certa'?hit.id:'';
  const viz=!hit&&quadra.length?`<div class="banner blue" style="margin-top:8px">${ic('layers')}<div style="flex:1"><div class="bt">${quadra.length} terreno${quadra.length>1?'s':''} na mesma quadra (setor ${mun==='sjc'?sql.slice(0,2):sql.slice(0,3)}, quadra ${mun==='sjc'?sql.slice(2,6):sql.slice(3,6)})</div>
    <div>${quadra.map(([t,q])=>`<button type="button" class="linkbtn" data-a="abrir" data-id="${t.id}">${t.codigo} · ${esc(t.nome)}</button> <span class="faint">(${cid.rotulo} ${esc(q.sql)})</span>`).join('<br>')}</div><div class="hint" style="margin-top:4px">Não é duplicata. Pode valer estudar os lotes juntos numa área de interesse.</div></div></div>`:'';
  if(!hit){box.innerHTML=(sql||mat||log?'<div class="hint">Nenhum cadastro com esta inscrição, matrícula ou endereço. Será criado um terreno novo.</div>':'<div class="hint">Digite a inscrição ou a matrícula. Teste com o SQL 089.123.0045-6 (já cadastrado) ou 089.123.0099-0 (mesma quadra de dois terrenos).</div>')+viz;btn.textContent='Cadastrar terreno';return}
  box.innerHTML=`<div class="banner ${cert==='certa'?'blue':'warn'}">${ic(cert==='certa'?'link':'warn')}<div style="flex:1"><div class="bt">${cert==='certa'?'Este imóvel já está cadastrado':'Possível duplicidade'}: ${hit.codigo} · ${esc(hit.nome)}</div><div>${esc(msg)}. ${cert==='certa'?'Se houver oferta, ela será registrada nesse terreno.':'Confira antes de salvar.'}</div><button type="button" class="btn sm" style="margin-top:8px" data-a="abrir" data-id="${hit.id}">Abrir ficha existente</button></div></div>`;
  btn.textContent=cert==='certa'?'Registrar no terreno existente':'Cadastrar mesmo assim';
}

/* ===================== eventos ===================== */
document.addEventListener('click',e=>{
  if(temaMenu&&!e.target.closest('#tema')){temaMenu=false;renderTema()}
  if(perfilMenu&&!e.target.closest('#perfil')){perfilMenu=false;renderPerfil()}
  if(sinoAberto&&!e.target.closest('#sino')){sinoAberto=false;renderSino()}
  if(!e.target.closest('.adv-mais'))document.querySelectorAll('.adv-mais.aberto').forEach(x=>{x.classList.remove('aberto');x.querySelector('.adv-mb')?.setAttribute('aria-expanded','false')});
  const a=e.target.closest('[data-a]');if(!a)return;const A=a.dataset.a;const t=UI.route==='terreno'?T(UI.id):null;
  if(A==='scrim'){if(e.target===a){UI.modal=null;renderModal()}return}
  if(viabClick(A,a,t||(UI.vbPop?T(VB(UI.vbPop)?.tid):null))||partesClick(A,a,t)||fasesClick(A,a,t)||funilClick(A,a,t)||setoresClick(A,a,t)||zonasClick(A,a,t)||topoClick(A,a,t))return;
  switch(A){
    case 'nav':go(a.dataset.r);break;
    case 'abrir':BLA={geral:true};blId=a.dataset.id;go('terreno',{id:a.dataset.id,tab:a.dataset.tab||'geral',from:a.dataset.from||(UI.route==='terreno'?UI.from:UI.route==='inicio'?'inicio':'terrenos')});if(a.dataset.tab&&a.dataset.tab!=='geral'){blocoAbre(a.dataset.tab);render();rolarBloco(a.dataset.tab)}break;
    case 'tab':if(UI.modal){UI.modal=null;renderModal()}UI.tab=a.dataset.t;blocoAbre(a.dataset.t);render();rolarBloco(a.dataset.t);break;
    case 'bloco':{const k=a.dataset.t,fim=!!a.dataset.fim;if(BLA[k]){delete BLA[k];if(UI.tab===k)UI.tab='geral'}else{BLA[k]=true;UI.tab=k}render();
      /* recolhida pelo fim: traz o título de volta à tela, para não perder o lugar */
      if(!BLA[k]){const h=document.getElementById('bl-'+k);if(h&&(fim||h.getBoundingClientRect().top<72))h.scrollIntoView({block:'start'});document.querySelector(`#bl-${k} .bl-h`)?.focus({preventScroll:true})}break}
    case 'ir':UI.tab=a.dataset.t;blocoAbre(a.dataset.t);UI.edit=a.dataset.s&&SECOES[a.dataset.s]||a.dataset.s==='areas'?a.dataset.s:null;render();rolarBloco(a.dataset.t,a.dataset.s);break;
    case 'role':UI.role=a.dataset.v;perfilMenu=false;render();toast(UI.role==='Leitura'?'Entrou como Lúcia Mendes (Leitura): consulta tudo, não altera nada.':`Entrou como ${ROLE_USER[UI.role]} (${UI.role}).`);break;
    case 'reset':S=seed();prepararDados();save();go('inicio');toast('Dados de exemplo restaurados.');break;
    case 'novo':UI.modal='novo';renderModal();break;
    case 'nova-oferta':UI.modal='oferta';renderModal();break;
    case 'close':UI.modal=null;renderModal();break;
    case 'edit':UI.edit=a.dataset.s;render();setTimeout(()=>document.getElementById('sec-'+a.dataset.s)?.querySelector('input,select,textarea')?.focus(),20);break;
    case 'cancel-edit':UI.edit=null;render();break;
    case 'temp':{const v=Number(a.dataset.v)||null,antes=t.neg.temp;t.neg.temp=v;log(t,`Temperatura: ${antes?antes+'/5':'não informado'} → ${v?v+'/5':'não informado'}`);save();render();toast(v?`Temperatura ${v} · ${TEMP[v]}.`:'Temperatura removida.');break}
    case 'ofref':t.neg.ofRef=a.dataset.o;log(t,'Oferta de referência alterada');save();render();toast('Oferta de referência atualizada.');break;
    case 'principal':t.corretores.forEach(x=>x.principal=x.cid===a.dataset.c);save();render();break;
    case 'del-mat':t.mats.splice(Number(a.dataset.i),1);save();render();break;
    case 'del-pes':t.pessoas.splice(Number(a.dataset.i),1);save();render();break;
    case 'del-confr':t.confr.splice(Number(a.dataset.i),1);save();render();break;
    case 'infra':{const k=a.dataset.k,v=a.dataset.v;t.infra[k]=v==='nao_verificado'?{d:v}:{d:v,data:HOJE,fonte:t.infra[k]?.fonte||'Visita ao local'};save();render();break}
    case 'prop-form':UI.propForm=!UI.propForm;render();break;
    case 'forcar':UI.modal='forcar';renderModal();break;
    case 'ent-buscar':{const x=T(a.dataset.id);if(x)gEntornoTerreno(x);break}
    case 'ent-todos':ENT_TODOS=!ENT_TODOS;render();break;
    case 'poi-excl':{const x=T(a.dataset.id),tp=a.dataset.tp,id=a.dataset.p;if(!x)break;
      const nome=tp==='g'?x.entorno?.itens.find(i=>i.gid===id)?.nome:(S.pontos||[]).find(p=>p.id===id)?.nome;if(!nome)break;
      UI.poiExcl={tid:x.id,tp,id,nome};UI.modal='poi-excl';renderModal();break}
    case 'poi-excl-ok':{const q=UI.poiExcl,x=q&&T(q.tid);if(!x)break;
      if(q.tp==='g'){const it=x.entorno?.itens.find(i=>i.gid===q.id);if(!it)break;it.excl={em:agora(),por:me()}}
      else{const i=(S.pontos||[]).findIndex(p=>p.id===q.id);if(i<0)break;S.pontosExcl=S.pontosExcl||[];S.pontosExcl.push({...S.pontos[i],em:agora(),por:me()});S.pontos.splice(i,1)}
      log(x,`Ponto de interesse excluído: ${q.nome}${q.tp==='g'?' (Google)':''}`);UI.modal=null;renderModal();save();render();toast(`${q.nome} excluído dos pontos de interesse.`);break}
    case 'poi-excl-ver':EXCL_VER=!EXCL_VER;render();break;
    case 'poi-rest':{const x=T(a.dataset.id),id=a.dataset.p;let nome;
      if(a.dataset.tp==='g'){const it=x?.entorno?.itens.find(i=>i.gid===id);if(!it)break;nome=it.nome;delete it.excl}
      else{const i=(S.pontosExcl||[]).findIndex(p=>p.id===id);if(i<0)break;const {em,por,...p}=S.pontosExcl.splice(i,1)[0];nome=p.nome;(S.pontos=S.pontos||[]).push(p)}
      if(x)log(x,`Ponto de interesse restaurado: ${nome}`);save();render();toast(`${nome} voltou aos pontos de interesse.`);break}
    case 'emp-todos':EMP_TODOS=!EMP_TODOS;render();break;
    case 'ent-add-ponto':{const id=a.dataset.id;go('mapa',{mpFoco:id,mpView:null});UI.poiVolta=id;UI.mpModo='poi';mpRefresh();setTimeout(()=>{if(UI.mpModo==='poi')fecharPopup()},400);break}
    case 'adv-req':ADV_REQ=!ADV_REQ;render();break;
    case 'adv-mais':{const w=a.closest('.adv-mais'),ab=!w.classList.contains('aberto');document.querySelectorAll('.adv-mais.aberto').forEach(x=>{x.classList.remove('aberto');x.querySelector('.adv-mb').setAttribute('aria-expanded','false')});if(ab){w.classList.add('aberto');a.setAttribute('aria-expanded','true')}break}
    case 'viab':if(viabsDe(t.id).length){blocoAbre('negociacao');render();rolarBloco('negociacao','viab')}else viabClick('vb-novo',a,t);break;
    case 'sv-fechar':svFechar();break;
    case 'mp-desel':mpSelecionar(null);break;
    case 'mp-eu':mpEu();break;
    case 'mp-cheia':mpTelaCheia();break;
    case 'mp-sv':{const x=T(a.dataset.id);fecharPopup();gStreetView(x,MAPA);break}
    case 'g-sv-mini':{const x=T(a.dataset.id);if(MINI)gStreetView(x,MINI);break}
    case 'mp-entorno':{const x=T(a.dataset.id);fecharPopup();gEntornoDe(x);break}
    case 'mp-entorno-fechar':UI.entorno=null;gSet(gEntorno,null);gEntorno=[];mpRefresh();break;
    case 'mp-entorno-salvar':{const it=UI.entorno?.itens[+a.dataset.i];if(!it)break;S.pontos=S.pontos||[];S.pontos.push({id:uid(),gid:it.gid,nome:it.nome,cat:it.cat,lat:it.lat,lng:it.lng});save();mpRefresh();toast(`${it.nome} salvo nos pontos de interesse.`);break}
    case 'mp-rota':{const x=T(a.dataset.id),pp=(S.pontos||[]).find(q=>q.id===a.dataset.p);fecharPopup();if(x&&pp)gRotaAte(x,pp,a.dataset.m||'DRIVE');break}
    case 'mp-rota-limpar':gLimparRota();break;
    case 'g-relevo':{const x=T(a.dataset.id);a.disabled=true;a.textContent='Consultando o Google...';gRelevo(x);break}
    case 'g-relevo-usar':{const x=T(a.dataset.id);x.desnivel=+x.relevo.desnivel.toFixed(1);log(x,`Desnível estimado: ${num(x.desnivel,1)} m (Google)`);save();render();toast('Desnível estimado atualizado na ficha.');break}
    case 'g-geo-ok':{const g=UI.geo,x=T(g.tid);Object.assign(x,{lat:g.lat,lng:g.lng,precisao:g.exato&&!g.bairroDif?'conferida':'aproximada'});log(x,`Localização pelo endereço (Google): ${g.end}`);UI.modal=null;save();render();toast('Localização gravada.');break}
    case 'g-geo':{const x=T(a.dataset.id);a.disabled=true;gGeocodificar(x);break}
    case 'sort':ordenar(a.dataset.t,a.dataset.k);render();break;
    case 'fs-abrir':{const x=T(a.dataset.id);UI.fichaSheet=a.dataset.id;if(x?.lat!=null)mpSelecionar(x.id);fichaSheet();break}
    case 'fs-fechar':UI.fichaSheet=null;fichaSheet();break;
    case 'mp-foco':{const x=T(a.dataset.id);if(x.lat!=null)focar(x);else if(UI.role!=='Leitura'){UI.mpModo='marcar';UI.mpAlvo=x.id;mpRefresh()}else toast('Terreno sem localização.');break}
    case 'mp-sit':{const v=a.dataset.v,o=UI.mp.ocultas;UI.mp.ocultas=o.includes(v)?o.filter(x=>x!==v):[...o,v];mpRefresh();break}
    case 'mp-limpar':UI.mp={q:'',cor:'',zona:'',f:UI.mp.f,e:UI.mp.e,ocultas:[]};render();break;
    case 'mp-desce':if(UI.mp.f)UI.mp.e=a.dataset.v;else UI.mp.f=a.dataset.v;UI.mp.ocultas=[];mpRefresh();mpEnquadrar();break;
    case 'mp-nivel':UI.mp.f=a.dataset.v||'';UI.mp.e='';UI.mp.ocultas=[];mpRefresh();mpEnquadrar();break;
    case 'mp-base':setBase(a.dataset.v);break;
    case 'lug-fechar':lugarFechar();break;
    case 'mp-modo':UI.mpModo=UI.mpModo===a.dataset.v?null:a.dataset.v;fecharPopup();mpRefresh();break;
    case 'mp-sair':UI.mpModo=null;UI.nvDesenho=false;UI.poiVolta=null;UI.desenho=null;UI.desHist=null;UI.vSel=null;UI.vMenu=false;UI.vMover=false;mpRefresh();break;
    case 'mp-desfazer':{const h=UI.desHist||[];if(h.length){UI.desenho=h.pop();UI.vSel=null;UI.vMenu=false;UI.vMover=false}mpRefresh();break}
    case 'mp-concluir':concluirDesenho();break;
    case 'mp-poi':UI.mpPoi=UI.mpPoi===false;mostrarPois(UI.mpPoi);a.setAttribute('aria-pressed',UI.mpPoi);a.classList.toggle('on',UI.mpPoi);break;
    case 'mp-conc':UI.mpConc=UI.mpConc===false;mostrarConc(UI.mpConc);a.setAttribute('aria-pressed',UI.mpConc);break;
    case 'ctx-terreno':case 'ctx-poi':case 'ctx-conc':ctxAcao(a.dataset.a);break;
    case 'mp-desenhar':{const x=T(a.dataset.id);if(x&&x.poly&&x.poly.length>=3){editarPoligonal(x.id);break}
      UI.mpModo='desenhar';UI.mpAlvo=a.dataset.id;UI.desEditando=false;UI.desenho=[];UI.desHist=[];UI.vSel=null;UI.vMenu=false;fecharPopup();mpRefresh();break}
    case 'mp-marcar':go('mapa',{mpModo:'marcar',mpAlvo:a.dataset.id,mpView:null});break;
    case 'mp-ir':go('mapa',{mpFoco:a.dataset.id,mpView:null});break;
    case 'dash-f':{const d=a.dataset.d,v=a.dataset.v,f=UI.dash.f;const cur=f[d]||[];f[d]=cur.includes(v)?cur.filter(x=>x!==v):[...cur,v];if(!f[d].length)delete f[d];render();break}
    case 'dash-limpar':UI.dash.f={};render();break;
    case 'dash-full':telaCheia();break;
    case 'dash-exp':UI.grafico=a.dataset.k;UI.modal='grafico';renderModal();break;
    case 'tk-abrir':UI.tkSel={tid:a.dataset.id,kid:a.dataset.tk};UI.modal='tarefa';renderModal();break;
    case 'tk-nova':UI.tkSel={status:a.dataset.v};UI.modal='tarefa';renderModal();break;
    case 'tk-vista':UI.tk.vista=a.dataset.v;render();break;
    case 'tema-menu':temaMenu=!temaMenu;renderTema();break;
    case 'perfil-menu':perfilMenu=!perfilMenu;renderPerfil();break;
    case 'tema':TEMA=a.dataset.v;try{localStorage.setItem('bkm-terrenos-tema',TEMA)}catch(e){}temaMenu=false;aplicaTema();renderTema();toast('Tema: '+TEMAS.find(x=>x[0]===TEMA)[1]+'.');break;
    case 'menu':menuMin=!menuMin;try{localStorage.setItem('bkm-terrenos-menu',menuMin?'min':'')}catch(e){}render();break;
    case 'reu-form':UI.reuForm=!UI.reuForm;render();break;
    case 'reu-feita':{const m=t.reunioes.find(x=>x.id===a.dataset.k);if(m.data>HOJE){toast('A data ainda não chegou. Ajuste a data antes de marcar como realizada.',true);break}m.status='realizada';log(t,`Reunião de ${fd(m.data)} marcada como realizada`);save();render();break}
    case 'doc-ok':{const d=t.docs.find(x=>x.tipo===a.dataset.k);d.status='validado';log(t,`${TIPOS_DOC[d.tipo][0]} validado`);save();render();break}
    case 'upload':UI.upload=a.dataset.k;$('#file-in').value='';$('#file-in').click();break;
  }
});
$('#file-in').addEventListener('change',e=>{const f=e.target.files?.[0],t=T(UI.id),k=UI.upload;if(!f||!t)return;
  if(k.startsWith('ata:')){const m=t.reunioes.find(x=>x.id===k.slice(4));m.ata=m.ata?{nome:f.name,versoes:m.ata.versoes+1}:{nome:f.name,versoes:1};log(t,`Ata da reunião de ${fd(m.data)}: versão ${m.ata.versoes}`);save();render();toast('Ata anexada.');return}
  const unico=k!=='foto'&&k!=='planta';let d=unico?t.docs.find(x=>x.tipo===k):null;
  if(!d){d={tipo:k,status:'recebido',emitido:HOJE,versoes:0,nome:unico?null:f.name};t.docs.push(d)}d.versoes++;d.emitido=HOJE;d.status='recebido';log(t,`${TIPOS_DOC[k][0]}: versão ${d.versoes} enviada`);save();render();toast('Arquivo enviado. Falta validar.')});
document.addEventListener('change',e=>{const el=e.target;
  if(viabChange(el)||partesChange(el)||fasesChange(el)||funilChange(el)||zonasChange(el))return;
  if(el.dataset.ch==='mp-cor'){UI.mp.cor=el.value;mpRefresh();return}
  if(el.dataset.ch==='mp-zona'){UI.mp.zona=el.value;mpRefresh();return}
  if(el.dataset.ch==='dash-sel'){const s=UI.dash.sel;UI.dash.sel=el.checked?Object.keys(DIMS).filter(k=>s.includes(k)||k===el.value):s.filter(k=>k!==el.value);render();return}
  if(el.dataset.ch==='tk-f'){UI.tk[el.dataset.k]=el.type==='checkbox'?el.checked:el.value;render();return}
  if(el.id==='kmz-in'){const f=el.files?.[0];if(!f||!UI.kmzNovo)return;UI.kmzNovo=false;lerKmz(f).then(nvKmzLido).catch(err=>toast(err.message,true));return}
  const t=UI.route==='terreno'?T(UI.id):null;if(!t)return;
  if(el.dataset.ch==='tar-st'){const k=t.tarefas.find(x=>x.id===el.dataset.k);k.status=el.value;log(t,`Tarefa "${k.titulo}": ${OPT.statusTar[el.value]}`);save();render()}
  if(el.dataset.ch==='dil-sit'){const d=t.dilig.find(x=>x.id===el.dataset.k);d.sit=el.value;log(t,`Diligência "${d.titulo}": ${OPT.sitDil[el.value]}`);save();render()}
  if(el.dataset.ch==='tar-res'){t.tarefas.find(x=>x.id===el.dataset.k).resultado=el.value;save()}
  if(el.dataset.ch==='infra-fonte'){t.infra[el.dataset.k].fonte=el.value;save()}
  if(el.dataset.ch==='prop-status'){const lp=lastProp(t);lp.status=el.value;log(t,`Proposta v${lp.v}: ${OPT.statusProp[el.value]}`);save();render()}
});
document.addEventListener('input',e=>{const el=e.target;
  if(viabInput(el))return;
  if(el.id==='mp-q'){UI.mp.q=el.value;mpRefresh();return}
  if(el.id==='tk-q'){UI.tk.q=el.value;const p=el.selectionStart;render();const n=$('#tk-q');if(n){n.focus();n.setSelectionRange(p,p)}return}
  if(el.id==='q-top'&&UI.route==='mapa'){UI.mp.q=el.value;mpRefresh();return}
  if(el.id==='q-top'){UI.q=el.value;if(UI.route!=='terrenos'){go('terrenos');$('#q-top').focus()}else{const r=$('#rows');if(r)r.innerHTML=linhas()}}
  if(el.dataset.masc){const m=mascarar(el.value,el.dataset.masc);if(m!==el.value)el.value=m}
  if(el.form?.dataset.form==='novo')dedupe();

});
document.addEventListener('submit',e=>{e.preventDefault();const f=e.target,F=Object.fromEntries(new FormData(f)),t=UI.alvo?T(UI.alvo):UI.route==='terreno'?T(UI.id):null;
  if(viabSubmit(f.dataset.form,F)||partesSubmit(f.dataset.form,F,t,f)||fasesSubmit(f.dataset.form,F,t,f)||funilSubmit(f.dataset.form,F,t,f)||zonasSubmit(f.dataset.form,F,t,f))return;
  switch(f.dataset.form){
    case 'sec':{const s=SECOES[f.dataset.s];s.campos.forEach(([k,,tipo])=>{if(tipo==='fixo'||!(k in F))return;let v=F[k].trim();if(['m2','m','dec'].includes(tipo))v=lerNum(v);else if(tipo==='sel'&&v==='')v=k==='precisao'?'nao_informada':['topografia','posicao','formato','ocupacao'].includes(k)?'nao_informado':k==='demolicao'?'nao_avaliada':null;else if(v==='')v=k==='nome'?t.nome:null;t[k]=v});
      if(t.aDemolir!=null&&t.aConst!=null&&t.aDemolir>t.aConst){toast('A área a demolir não pode passar da área construída.',true);return}
      if(!t.logradouro&&!t.bairro&&t.lat==null){toast('Informe ao menos logradouro, bairro ou ponto no mapa.',true);return}
      UI.edit=null;log(t,`${s.titulo} atualizado`);save();render();toast('Salvo.');break}
    case 'areas':{['aDoc','aCad','aLev','aEst','testada'].forEach(k=>t[k]=lerNum(F[k]));t.fonteArea=F.fonteArea||null;
      if(t.fonteArea&&areaAdotada(t)==null){toast(`Preencha a área ${OPT.fonteArea[t.fonteArea].toLowerCase()} para adotá-la.`,true);return}
      UI.edit=null;log(t,'Áreas atualizadas');save();render();toast('Salvo.');break}
    case 'cond':{const o=ofertaRef(t);Object.assign(o,{valor:lerNum(F.valor),forma:F.forma||null,cid:F.cid||null,validade:F.validade||null,obsPag:F.obsPag,aceita:F.aceita});
      if(o.cid&&!t.corretores.some(x=>x.cid===o.cid))t.corretores.push({cid:o.cid,principal:!t.corretores.some(x=>x.principal)});UI.edit=null;log(t,'Condições pedidas atualizadas');save();render();toast('Salvo.');break}
    case 'mat':t.mats.push({num:F.num,cri:F.cri,area:lerNum(F.area),data:F.data||null});save();render();toast('Matrícula adicionada.');break;
    case 'insc':{const c=CIDADES_INSC[F.mun]||CIDADES_INSC.sp;if(c.mascara&&digits(F.sql).length!==digitosMasc(c.mascara)){toast(`${c.rotulo} incompleto: são ${digitosMasc(c.mascara)} dígitos.`,true);return}
      if(t.insc.some(x=>insCid(x)===F.mun&&digits(x.sql)===digits(F.sql)&&(c.mascara||x.sql===F.sql))){toast('Esta inscrição já está no terreno.',true);return}
      t.insc.push({mun:F.mun,sql:F.sql,area:lerNum(F.area),valores:[]});log(t,`Inscrição ${F.sql} (${c.cidade}) adicionada`);save();render();if(loteBuscavel(t.insc[t.insc.length-1]))loteBuscar(t,t.insc.length-1);break}
    case 'iptu':{const ins=t.insc[Number(f.dataset.i)],ex=Number(F.ex),iptu=lerNum(F.iptu),mensal=lerNum(F.mensal);
      if(F.sit==='isento'&&((iptu||0)>0||(mensal||0)>0)){toast('Imóvel isento não tem IPTU a pagar.',true);return}
      const ant=ins.valores.filter(v=>v.ex===ex);ant.forEach(v=>v.vig=false);
      ins.valores.push({ex,rev:ant.length+1,vig:true,vt:lerNum(F.vt),vc:lerNum(F.vc),sit:F.sit,iptu:F.sit==='isento'?null:iptu,parc:Number(F.parc)||null,mensal:F.sit==='isento'?null:mensal,fonte:F.fonte,data:HOJE});
      log(t,`IPTU ${ex}${ant.length?` revisão ${ant.length+1}`:''} lançado`);save();render();toast(ant.length?`Exercício ${ex}: revisão ${ant.length+1} lançada; a anterior foi preservada.`:`Exercício ${ex} lançado.`);break}
    case 'confr':t.confr.push({tipo:F.tipo,m:lerNum(F.m),conf:F.conf});save();render();break;
    case 'dilig':t.dilig.push({id:uid(),cat:F.cat,titulo:F.titulo,sit:F.sit,resp:F.resp,prov:F.prov});log(t,`Diligência: ${F.titulo}`);save();render();toast('Diligência registrada.');break;
    case 'pessoa':if(F.papel==='proprietario'&&lerNum(F.pct)!=null&&!partesAtivas(t).length){const tot=t.pessoas.filter(p=>p.papel==='proprietario').reduce((a,p)=>a+(p.pct||0),0);if(tot+lerNum(F.pct)>100){toast(`A soma passaria de 100% (já há ${num(tot,2)}% informado).`,true);return}}
      t.pessoas.push({nome:F.nome,tipo:F.tipo,papel:F.papel,pct:F.papel==='proprietario'?lerNum(F.pct):null,tel:F.tel});save();render();break;
    case 'tarefa':t.tarefas.push({id:uid(),titulo:F.titulo,desc:F.desc,resp:F.resp,prazo:F.prazo,status:'pendente',prio:F.prio,resultado:'',marcados:[]});notifTarefa(t,t.tarefas[t.tarefas.length-1],null);log(t,`Tarefa criada: ${F.titulo}`);save();render();toast('Tarefa adicionada.');break;
    case 'poi':{S.pontos=S.pontos||[];S.pontos.push({id:uid(),nome:F.nome.trim(),cat:F.cat,lat:UI.novoPoi.lat,lng:UI.novoPoi.lng});UI.modal=null;save();const volta=UI.poiVolta;UI.poiVolta=null;if(volta&&T(volta))go('terreno',{id:volta,tab:'geral'});else render();toast('Ponto de interesse salvo.');break}
    case 'tarefa-m':{const sel=UI.tkSel;if(sel.tid){const t=T(sel.tid),k=t.tarefas.find(x=>x.id===sel.kid);const de=k.status,antes={resp:k.resp,marcados:(k.marcados||[]).slice()};Object.assign(k,{titulo:F.titulo.trim(),resp:F.resp,prazo:F.prazo,prio:F.prio,status:F.status,desc:F.desc,resultado:F.resultado||'',marcados:new FormData(f).getAll('marc')});notifTarefa(t,k,antes);
        if(de!==k.status)log(t,`Tarefa "${k.titulo}": ${OPT.statusTar[de]} → ${OPT.statusTar[k.status]}`);toast('Tarefa salva.')}
      else{const t=T(F.ter);if(!t){toast('Escolha o terreno da tarefa.',true);return}const irm=todasTarefas().filter(x=>x.k.status===F.status);
        t.tarefas.push({id:uid(),titulo:F.titulo.trim(),desc:F.desc,resp:F.resp,prazo:F.prazo,status:F.status,prio:F.prio,resultado:'',marcados:new FormData(f).getAll('marc'),pos:Math.max(0,...irm.map(x=>x.k.pos||0))+1000});notifTarefa(t,t.tarefas[t.tarefas.length-1],null);log(t,`Tarefa criada: ${F.titulo.trim()}`);toast('Tarefa criada.')}
      UI.modal=null;save();render();break}
    case 'reuniao':{if(F.status==='realizada'&&F.data>HOJE){toast('Reunião realizada não pode ter data futura.',true);return}
      if(F.status==='agendada'&&F.data<HOJE){toast('Para registrar uma reunião passada, escolha Realizada.',true);return}
      const pres=F.modalidade==='presencial';
      t.reunioes.push({id:uid(),status:F.status,data:F.data,hora:F.hora,modalidade:F.modalidade,local:pres?F.local:null,endereco:pres&&F.local==='externo'?F.endereco:'',part:{bkm:F.pbkm,ext:F.pext},pauta:F.pauta,resumo:F.status==='realizada'?F.resumo:'',enc:F.status==='realizada'?F.enc:'',ata:null});
      log(t,`Reunião ${F.status==='realizada'?'realizada':'agendada'} em ${fd(F.data)} (${OPT_REU.modalidade[F.modalidade]}${pres?', '+OPT_REU.local[F.local].toLowerCase():''})`);UI.reuForm=false;save();render();toast('Reunião registrada.');break}
    case 'prop':{const v=lerNum(F.valor);if(!v){toast('Informe o valor.',true);return}const lp=lastProp(t);
      if(lp&&['rascunho','apresentada','em_analise'].includes(lp.status))lp.status=lp.origem===F.origem?'substituida':'recusada';
      t.propostas.push({v:(lp?.v||0)+1,origem:F.origem,data:F.data,validade:F.validade||null,valor:v,forma:F.forma,cond:F.cond,status:F.status});
      log(t,`Proposta v${(lp?.v||0)+1} (${F.origem==='bkm'?'BKM':'Vendedor'}): ${mi(v)}`);UI.propForm=false;save();render();toast('Proposta registrada.');break}
    case 'novo':{const dup=f.dataset.dup;let alvo;if(!UI.nv){toast('Comece pela poligonal do terreno.',true);return}
      if(F.sql&&F.mun!=='outro'&&cidDoNome(F.municipio)!==F.mun){toast(`A inscrição é de ${CIDADES_INSC[F.mun].cidade} e o terreno fica em ${F.municipio.split(' · ')[0]}.`,true);return}
      const nvPt=dup?[]:nvPartesLer(f);
      if(nvPt.some(d=>!d.nome)){toast('Dê um nome a cada parte (ou tire a parte vazia).',true);return}
      if(new Set(nvPt.map(d=>d.nome.toLowerCase())).size<nvPt.length){toast('Duas partes com o mesmo nome.',true);return}
      if(dup){alvo=T(dup)}else{do S.seqT++;while(S.terrenos.some(x=>x.codigo==='TER-'+String(S.seqT).padStart(6,'0')));alvo={...seedVazio(),codigo:'TER-'+String(S.seqT).padStart(6,'0'),nome:F.nome,logradouro:F.logradouro.trim(),numero:F.numero.trim(),bairro:F.bairro.trim(),zona:F.zona||null,resp:F.resp,origem:F.origem,dataIdent:HOJE,
        mats:F.mat?[{num:F.mat,cri:F.cri,area:null,data:null}]:[],insc:F.sql?[{mun:F.mun,sql:F.sql,area:null,valores:[]}]:[]};alvo.hist=[{em:agora(),user:me(),txt:'Terreno cadastrado'}];nvGravar(alvo,F);S.terrenos.push(alvo);
        {const P=UI.nvPool||{};(P.mat||[]).forEach(m=>{if(!alvo.mats.some(x=>digits(x.num)===digits(m.num)))alvo.mats.push({num:m.num,cri:m.cri,area:null,data:null})});
         (P.ins||[]).forEach(s=>{if(!alvo.insc.some(x=>digits(x.sql)===digits(s)))alvo.insc.push({mun:F.mun||cidDoNome(F.municipio)||'outro',sql:s,area:null,valores:[]})});
         (P.pes||[]).forEach(p=>alvo.pessoas.push({nome:p.nome,tipo:'PF',papel:'proprietario',pct:null,tel:p.tel}))}
        nvPt.forEach(d=>gravarParteNova(alvo,{...d,mun:F.mun||cidDoNome(F.municipio)||'outro'}));if(nvPt.length)log(alvo,`${nvPt.length} parte${nvPt.length>1?'s':''} cadastrada${nvPt.length>1?'s':''}: ${nvPt.map(d=>d.nome).join(', ')}`)}
      const val=lerNum(F.valor);
      if(val||F.cid){const o={id:uid(),cid:F.cid||null,data:HOJE,valor:val,forma:F.forma||null,obsPag:F.obsPag,aceita:F.aceita,status:'ativa'};alvo.ofertas.push(o);
        if(o.cid&&!alvo.corretores.some(x=>x.cid===o.cid))alvo.corretores.push({cid:o.cid,principal:!alvo.corretores.some(x=>x.principal)});
        if(!alvo.neg||!['ativo','stand_by'].includes(alvo.neg.status)){alvo.neg=novaNeg(o.id,Number(F.temp)||null);log(alvo,'Negociação aberta')}
        else log(alvo,'Nova oferta registrada')}
      UI.modal=null;UI.nv=null;save();go('terreno',{id:alvo.id,tab:dup?'comercial':'cadastro',from:'terrenos'});toast(dup?'Oferta registrada no terreno existente.':`${alvo.codigo} cadastrado. Complete a ficha quando puder.`);if(!dup&&alvo.insc[0]&&loteBuscavel(alvo.insc[0]))loteBuscar(alvo,0);break}
    case 'oferta':{const o={id:uid(),cid:F.cid||null,data:HOJE,valor:lerNum(F.valor),forma:F.forma||null,obsPag:F.obsPag,aceita:F.aceita,validade:F.validade||null,status:'ativa'};if(UI.ofPoly)o.poly=UI.ofPoly;t.ofertas.push(o);
      if(o.cid&&!t.corretores.some(x=>x.cid===o.cid))t.corretores.push({cid:o.cid,principal:!t.corretores.some(x=>x.principal)});
      if(!t.neg||!['ativo','stand_by'].includes(t.neg.status)){t.neg=novaNeg(o.id,null);log(t,'Negociação aberta')}else log(t,`Nova oferta: ${mi(o.valor)}${o.poly?` (parte do terreno, ${m2(Math.round(areaPoly(o.poly)))})`:''}`);
      UI.modal=null;save();render();toast('Oferta registrada.');break}
  }
});
function novaNeg(ofRef,temp){const e=STAGES[0][0],s=subInicial(e);NEG_SEQ=Math.max(NEG_SEQ,...S.terrenos.map(t=>parseInt((t.neg?.codigo||'').slice(4))||0));return {codigo:'NEG-'+String(++NEG_SEQ).padStart(5,'0'),etapa:e,sub:s,status:'ativo',desde:HOJE,subDesde:HOJE,temp,ofRef,viab:null,pedido:null,trilha:[{em:agora(),user:me(),ev:'abertura',deEtapa:null,deSub:null,paraEtapa:e,paraSub:s,status:'ativo'}]}}
function seedVazio(){return {id:uid(),situacao:'ativo',prioridade:null,descricao:'',url:'',obs:'',cep:'',complemento:'',referencia:'',lat:null,lng:null,precisao:'nao_informada',aDoc:null,aCad:null,aLev:null,aEst:null,fonteArea:null,testada:null,topografia:'nao_informado',desnivel:null,posicao:'nao_informado',formato:'nao_informado',ocupacao:'nao_informado',uso:'',aConst:null,aDemolir:null,demolicao:'nao_avaliada',obsFis:'',eixo:null,mats:[],insc:[],confr:[],dilig:[],pessoas:[],corretores:[],infra:{},analises:[],ofertas:[],neg:null,propostas:[],reunioes:[],tarefas:[],docs:[],hist:[]}}
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&GG&&(svFechar()||lugarFechar())){e.preventDefault();return}if(e.key==='Escape'&&temaMenu){temaMenu=false;renderTema();return}if(e.key==='Escape'&&perfilMenu){perfilMenu=false;renderPerfil();return}if(e.key==='Escape'&&UI.modal){UI.modal=null;renderModal()}});
/* ===================== kanban: arrastar e soltar (regras em proto_funil.js: levarAte, soltar) ===================== */
function posRender(){try{if(MAPA){MAPA.remove()}}catch(e){}MAPA=null;PINS=POIS=DES=BASE=null;try{if(MINI)MINI.remove()}catch(e){}MINI=null;
  if(UI.route==='mapa')initMapa();if(UI.route==='terreno'&&!blocoFechado('geral'))initMini();fichaSheet()}
document.addEventListener('keydown',e=>{if(e.key!=='Enter'&&e.key!==' ')return;const el=e.target;if(!(el instanceof HTMLElement)||el.matches('button,a,input,select,textarea'))return;if(el.matches('[data-a][tabindex]')){e.preventDefault();el.click()}});
let arrastando=null;
document.addEventListener('dragstart',e=>{const c=e.target.closest?.('.kcard[draggable="true"]');if(!c)return;arrastando=c.dataset.id;e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',arrastando);c.classList.add('arrastando');c.closest('.col')?.classList.add('origem');document.body.classList.add('dnd')});
document.addEventListener('dragend',e=>{arrastando=null;document.body.classList.remove('dnd');document.querySelectorAll('.arrastando,.col.sobre,.col.origem').forEach(x=>x.classList.remove('arrastando','sobre','origem'))});
// a coluna sob o card acende (a de origem não: soltar ali não muda nada); fora das colunas, nenhuma
document.addEventListener('dragover',e=>{if(!arrastando)return;const col=e.target.closest?.('.col[data-col]:not(.origem)');if(!col){document.querySelectorAll('.col.sobre').forEach(x=>x.classList.remove('sobre'));return}e.preventDefault();e.dataTransfer.dropEffect='move';
  document.querySelectorAll('.col.sobre').forEach(x=>x!==col&&x.classList.remove('sobre'));col.classList.add('sobre')});
document.addEventListener('drop',e=>{const col=e.target.closest?.('.col[data-col]:not(.origem)');if(!col||!arrastando)return;e.preventDefault();const id=arrastando;arrastando=null;document.body.classList.remove('dnd');document.querySelectorAll('.col.sobre,.col.origem').forEach(x=>x.classList.remove('sobre','origem'));soltar(id,col.dataset.col)});
render();
})();
