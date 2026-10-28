// Prints de revisão visual: todas as telas, desktop e celular, claro e escuro. Uso: node tshots.js <pasta> [filtro]
const path=require('path'),fs=require('fs');const OUT=(process.argv[2]||path.join(__dirname,'..','saida','t_shots'))+'/';fs.mkdirSync(OUT,{recursive:true});
const FILTRO=process.argv[3]||'';
const {chromium}=require('playwright');
const L=path.join(__dirname,'..','libs','l')+'/';const F=path.join(__dirname,'..','..','..','docs','prototipo.html');const D=path.join(__dirname,'..','..','..','docs','dados')+'/';
const TELAS=[
 ['inicio','/'],['terrenos','/terrenos'],['mapa','/mapa'],['mapa-ficha','/mapa/TER-000123/ficha'],['fases','/fases'],['fases-nn','/fases/novos_negocios'],
 ['tarefas','/tarefas'],['tarefas-tab','/tarefas/tabela'],['dashboard','/dashboard'],
 ['ficha','/terrenos/TER-000123'],['ficha-cadastro','/terrenos/TER-000123/cadastro'],['ficha-comercial','/terrenos/TER-000123/comercial'],
 ['ficha-negociacao','/terrenos/TER-000123/negociacao'],['ficha-fases','/terrenos/TER-000123/fases'],['ficha-tarefas','/terrenos/TER-000123/tarefas'],
 ['ficha-urbanismo','/terrenos/TER-000123/urbanismo'],['ficha-documentos','/terrenos/TER-000123/documentos'],
 ['viab','/terrenos/TER-000123/viabilidade/1'],['novo','/terrenos/novo'],
 ['cfg-fases','/configuracoes'],['cfg-etapas','/configuracoes/etapas'],['cfg-viab','/configuracoes/viabilidade'],['cfg-param','/configuracoes/parametros'],['cfg-equipe','/configuracoes/equipe'],
];
(async()=>{const b=await chromium.launch();const errs=[];
for(const [dev,vp,mob] of [['d',{width:1440,height:900},false],['m',{width:390,height:844},true]])for(const tema of ['claro','escuro']){
 const ctx=await b.newContext({viewport:vp,deviceScaleFactor:1,isMobile:mob,hasTouch:mob});
 await ctx.route('**/*',r=>{const u=r.request().url();
  if(u.includes('leaflet.js'))return r.fulfill({path:L+'leaflet.js'});if(u.includes('leaflet.css'))return r.fulfill({path:L+'leaflet.css'});if(u.includes('jszip'))return r.fulfill({path:L+'jszip.min.js'});
  if(u.includes('fonts.g'))return r.continue();
  if(u.startsWith('http://bkm.test/prototipo/dados/')||u.startsWith('http://bkm.test/dados/')){const n=u.split('/dados/')[1];return fs.existsSync(D+n)?r.fulfill({path:D+n}):r.fulfill({status:404,body:''})}
  if(u.startsWith('http://bkm.test/prototipo'))return r.fulfill({path:F,contentType:'text/html'});
  if(u.startsWith('http://bkm.test/'))return r.fulfill({status:404,body:''});return r.abort()});
 await ctx.addInitScript(t=>{try{localStorage.setItem('bkm-terrenos-tema',t)}catch(e){}},tema);
 const p=await ctx.newPage();p.on('pageerror',e=>errs.push(dev+tema+': '+e.message));
 for(const [n,u] of TELAS){if(FILTRO&&!n.includes(FILTRO))continue;
  await p.goto('http://bkm.test/prototipo'+u);await p.waitForTimeout(n.startsWith('mapa')?1500:700);
  await p.screenshot({path:`${OUT}${n}_${dev}_${tema}.png`,fullPage:!n.startsWith('mapa')&&!n.startsWith('viab')&&!n.startsWith('novo')});
  const ov=await p.evaluate(()=>{const W=document.documentElement.clientWidth;const r=[];document.querySelectorAll('#main *, .modal *, .vb-pop *').forEach(e=>{const b=e.getBoundingClientRect();if(b.width&&b.right>W+1&&getComputedStyle(e).position!=='fixed')r.push((e.className||e.tagName)+'');});
    const t=[];document.querySelectorAll('#main *').forEach(e=>{if(e.children.length)return;if(e.scrollWidth>e.clientWidth+2&&getComputedStyle(e).overflow==='visible'&&e.clientWidth>0)t.push((e.className||e.tagName)+':'+e.textContent.slice(0,30))});return {fora:r.slice(0,5),estoura:t.slice(0,5)}});
  if(ov.fora.length||ov.estoura.length)console.log(n,dev,tema,JSON.stringify(ov));
 }
 await ctx.close()}
console.log('erros:',errs.length?errs:'nenhum');await b.close()})();
