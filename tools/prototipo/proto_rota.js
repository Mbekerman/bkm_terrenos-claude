/* ===================== endereço da página ===================== */
/* Cada tela tem endereço próprio, que abre direto quando o link é enviado:
     /                                  Início
     /terrenos                          Terrenos          /terrenos/novo        Novo terreno
     /terrenos/TER-000123               ficha             /terrenos/TER-000123/negociacao  ficha com a seção aberta
     /terrenos/TER-000123/viabilidade/2 segundo estudo de viabilidade do terreno, no popup
     /mapa  /mapa/TER-000123 (selecionado)  /mapa/TER-000123/ficha (com a ficha no painel)
     /fases  /fases/aprovacao  /fases/aprovacao/projeto   (os três níveis do quadro)
     /tarefas  /tarefas/lista  /tarefas/calendario  /tarefas/cronograma  /tarefas/funil  /tarefas/TAR-000123 (a janela do cartão)   /dashboard   /configuracoes/etapas ...
   Na versão publicada vai no caminho (/prototipo/terrenos/...; o Caddy devolve a página para qualquer caminho);
   aberto como arquivo ou no artifact, depois do # (#/terrenos/...). Os filtros seguem em f=.
   Troca de tela entra no histórico (voltar e avançar do navegador); seção aberta, terreno
   selecionado no mapa e vista das tarefas só atualizam o endereço. O terreno vai pelo código. */
const RT_BASE=location.pathname.startsWith('/prototipo')?'/prototipo':null;
const RT_SEC=['cadastro','comercial','negociacao','fases','tarefas','urbanismo','documentos','historico'];
const RT_CFG={fases:'fases',funil:'etapas',prereq:'pre-requisitos',status:'status',checklist:'checklist',etapaTar:'tarefas-da-etapa',jornada:'jornada',notif:'notificacoes',equipe:'equipe',viab:'viabilidade',zonas:'parametros',campos:'campos',tarefas:'tarefas'};
const rtCod=id=>T(id)?.codigo||null;
const rtId=c=>c&&S.terrenos.find(t=>(t.codigo||'').toUpperCase()===c.toUpperCase())?.id||null;
const rtViabs=id=>(S.viabs||[]).filter(v=>v.tid===id);
/* [caminho, chave]: a chave muda quando a tela muda (vira entrada nova no histórico) */
function rtCaminho(){const r=UI.route;
  if(UI.modal==='novo')return ['/terrenos/novo','novo'];
  if(r==='terrenos')return ['/terrenos','terrenos'];
  if(r==='terreno'){const c=rtCod(UI.id);if(!c)return ['/terrenos','terrenos'];const p='/terrenos/'+c;
    const vs=rtViabs(UI.id),n=UI.vbPop?vs.findIndex(v=>v.id===UI.vbPop):-1;
    if(n>=0)return [p+'/viabilidade/'+(n+1),'t:'+c+':v'+n];
    return [RT_SEC.includes(UI.tab)?p+'/'+UI.tab:p,'t:'+c]}
  if(r==='mapa'){const f=rtCod(UI.fichaSheet),s=rtCod(UI.mpSel);return [f?'/mapa/'+f+'/ficha':s?'/mapa/'+s:'/mapa','mapa']}
  if(r==='negociacoes'){const p='/fases'+(UI.negFase?'/'+UI.negFase+(UI.negEtapa?'/'+UI.negEtapa:''):'');return [p,p]}
  if(r==='tarefas')return [UI.tk?.vista&&UI.tk.vista!=='quadro'?'/tarefas/'+UI.tk.vista:'/tarefas','tarefas'];
  if(r==='dashboard')return ['/dashboard','dashboard'];
  if(r==='config'){const p='/configuracoes'+(UI.cfgAba&&UI.cfgAba!=='fases'?'/'+RT_CFG[UI.cfgAba]:'');return [p,p]}
  return ['/','inicio']}
function rtLer(){const p=RT_BASE?location.pathname.slice(RT_BASE.length):location.hash.startsWith('#/')?location.hash.slice(1).split(/[?&]/)[0]:'/';
  return p.split('/').filter(Boolean).map(x=>{try{return decodeURIComponent(x)}catch(e){return x}})}
let RT_CHAVE=null,RT_PEND=false,RT_TROCA=false;
function rtGravar(){RT_PEND=false;const [p,ch]=rtCaminho(),troca=RT_TROCA;RT_TROCA=false;
  const fx=UI.fx&&Object.keys(UI.fx).length?'f='+encodeURIComponent(JSON.stringify(UI.fx)):'';
  const url=RT_BASE?RT_BASE+p+(fx?'#'+fx:''):location.pathname+location.search+(p==='/'&&!fx?'':'#'+p+(fx?'?'+fx:''));
  const novo=RT_CHAVE!==null&&ch!==RT_CHAVE&&!troca;RT_CHAVE=ch;
  if(url===location.pathname+location.search+location.hash)return;
  try{history[novo?'pushState':'replaceState']({from:UI.from},'',url)}catch(e){}}
/* junta as mudanças do mesmo clique (abrir o terreno e rolar até a seção) numa entrada só */
function rtSync(){if(RT_PEND)return;RT_PEND=true;queueMicrotask(rtGravar)}
/* abre a tela do endereço */
function rtAplicar(s){const [a,b,c,d]=s,limpo={vbPop:null,vbNova:false,fichaSheet:null};RT_TROCA=true;
  if(a==='terrenos'&&b&&b.toLowerCase()!=='novo'){const id=rtId(b);
    if(!id){go('terrenos',limpo);toast(`Terreno ${b} não encontrado.`,true);return}
    const from=history.state?.from||(UI.route==='terreno'&&UI.id===id?UI.from:'terrenos');
    /* link com seção: só ela vem aberta (a Visão geral cresce depois de carregar o mapa e o entorno e empurraria a seção para baixo) */
    const sec=RT_SEC.includes(c)?c:'geral';if(UI.route!=='terreno'||UI.id!==id||sec!=='geral'){BLA={[sec]:true};blId=id;tkRecolhePainel(sec)}
    if(c==='viabilidade'){go('terreno',{...limpo,id,tab:'geral',from});const v=rtViabs(id)[(parseInt(d,10)||1)-1];if(v)vbAbrir(v.id);else toast('Estudo de viabilidade não encontrado.',true);return}
    go('terreno',{...limpo,id,tab:sec,from});if(sec!=='geral')rolarBloco(sec);return}
  if(a==='terrenos'){go('terrenos',limpo);if(b){UI.modal='novo';renderModal()}return}
  if(a==='mapa'){const id=rtId(b);go('mapa',{...limpo,mpSel:id,mpFoco:id});if(id&&c==='ficha'){UI.fichaSheet=id;fichaSheet()}return}
  if(a==='fases'){const f=b&&fIdx(b)>=0?b:null,e=f&&c&&etapaF(f,c)?c:null;go('negociacoes',{...limpo,negFase:f,negEtapa:e});return}
  if(a==='tarefas'){if(UI.tk)UI.tk.vista=b==='tabela'?'lista':['lista','cronograma','calendario','funil'].includes(b)?b:'quadro';go('tarefas',limpo);
    // link de um cartão: /tarefas/TAR-000123 abre a janela dele
    if(/^TAR-\d+$/i.test(b||'')){const x=todasTarefas().find(y=>y.k.codigo===b.toUpperCase());if(x){UI.tkSel={tid:x.t.id,kid:x.k.id};UI.modal='tarefa';renderModal()}else toast('Tarefa não encontrada.',true)}return}
  if(a==='dashboard'){go('dashboard',limpo);return}
  if(a==='configuracoes'){const k=Object.keys(RT_CFG).find(k=>RT_CFG[k]===b);go('config',{...limpo,cfgAba:k||'fases'});return}
  go('inicio',limpo)}
{const _r=render;render=function(){_r.apply(this,arguments);rtSync()};
 const _s=mpSelecionar;mpSelecionar=function(){const x=_s.apply(this,arguments);rtSync();return x};
 const _f=fichaSheet;fichaSheet=function(){const x=_f.apply(this,arguments);rtSync();return x};
 const _m=renderModal;renderModal=function(){const x=_m.apply(this,arguments);rtSync();return x}}
/* voltar, avançar ou endereço trocado à mão: o filtro do endereço vale; sem filtro no endereço, fica o da sessão */
window.addEventListener('popstate',()=>{const h=location.hash.match(/[#&?]f=([^&]+)/);
  if(h)try{UI.fx=JSON.parse(decodeURIComponent(h[1]));sessionStorage.setItem(FX_KEY,JSON.stringify(UI.fx))}catch(e){}
  rtAplicar(rtLer())});
/* link recebido: abre direto na tela (antes, o endereço antigo só com #f= cai no Início) */
{const s=rtLer();if(s.length)rtAplicar(s)}
