// Topográfico preliminar: gera e baixa o PDF e o ZIP (DXF + imagem) com dados reais.
// Roda contra os servidores de verdade (GeoSampa, GeoSanja e Google), por isso a página
// é servida no endereço do Railway: o Google só aceita a chave vinda de lá, e o /geosanja
// e o /geosampa do Caddy de produção fazem o repasse. O que ainda não está em produção
// (download do laser em /geosampa/Download) vai direto ao Novo GeoSampa.
// Casos: TER-000118 (São Paulo, laser 2020), Paulista 1500 pelo SQL (contorno do lote da
// prefeitura) e um terreno em São José dos Campos (Google). Saídas em saida/t_topo/.
//   node tools/prototipo/testes/ttopo.js   (depois de python3 tools/prototipo/build.py)
const path=require('path'),fs=require('fs'),{chromium}=require('playwright');
// CELULAR=1 roda na largura de celular.
const RAIZ=path.join(__dirname,'..','..','..'),OUT=path.join(__dirname,'..','saida','t_topo')+'/',L=path.join(__dirname,'..','libs','l')+'/';
const LAZ=process.env.LAZPERF||path.join(require('child_process').execSync('npm root -g').toString().trim(),'laz-perf','lib','web')+'/';
fs.mkdirSync(OUT,{recursive:true});
const PROD='https://terrenos-web-production.up.railway.app',PAG=PROD+'/prototipo/__teste_topo';
const SJC=[[-23.227157,-45.848835],[-23.226302,-45.84839],[-23.226398,-45.847316],[-23.227346,-45.847419]];
(async()=>{const b=await chromium.launch(),errs=[];
  const ctx=await b.newContext({viewport:process.env.CELULAR?{width:390,height:844}:{width:1440,height:900},isMobile:!!process.env.CELULAR,hasTouch:!!process.env.CELULAR,deviceScaleFactor:1,acceptDownloads:true});
  // a chave vem da página publicada (não é gravada em lugar nenhum)
  const p0=await ctx.newPage();await p0.goto(PROD+'/prototipo/',{waitUntil:'domcontentloaded'});const chave=await p0.$eval('meta[name="gmaps-key"]',m=>m.content);await p0.close();
  const html=fs.readFileSync(path.join(RAIZ,'docs','prototipo.html'),'utf8').replace('{% env "GOOGLE_MAPS_KEY" %}',chave).replace('{% env "AMBIENTE" %}','dev')
    .replace('<title>',`<meta name="lazperf-url" content="${PROD}/__laz/"><title>`);
  await ctx.route('**/*',async r=>{const u=r.request().url();
    if(u===PAG)return r.fulfill({body:html,contentType:'text/html; charset=utf-8'});
    if(u.startsWith(PROD+'/__laz/'))return r.fulfill({path:LAZ+u.split('/').pop(),contentType:u.endsWith('.wasm')?'application/wasm':'application/javascript'});
    if(/leaflet\.js|jszip/.test(u))return r.fulfill({path:L+(u.includes('leaflet')?'leaflet.js':'jszip.min.js'),contentType:'application/javascript'});
    if(u.startsWith(PROD+'/geosampa/Download/'))return r.fulfill({response:await r.fetch({url:u.replace(PROD+'/geosampa/','https://novogeosampa.prefeitura.sp.gov.br/')})});
    if(/fonts\.(googleapis|gstatic)/.test(u))return r.abort();
    return r.continue()});
  const p=await ctx.newPage();p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()==='error')console.log('console:',m.text().slice(0,200))});
  await p.goto(PAG);await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForFunction(()=>window.google?.maps?.ElevationService,null,{timeout:30000}).catch(()=>console.log('Google não carregou'));
  const KEY='bkm-terrenos-prototipo-v9';
  const mudar=async(cod,fn)=>{await p.evaluate(([k,c,f])=>{const s=JSON.parse(localStorage.getItem(k));const t=s.terrenos.find(x=>x.codigo===c);(new Function('t',f))(t);localStorage.setItem(k,JSON.stringify(s))},[KEY,cod,fn]);await p.reload();await p.waitForTimeout(1500)};
  const abrir=async cod=>{await p.evaluate(()=>document.querySelector('[data-a=nav][data-r=terrenos]').click());await p.waitForTimeout(300);
    await p.evaluate(c=>[...document.querySelectorAll('[data-a=abrir]')].find(x=>x.closest('tr,.card,li,div')?.textContent.includes(c)||x.textContent.includes(c)).click(),cod);await p.waitForTimeout(800)};
  const gerar=async(cod,nome)=>{await abrir(cod);const bt=await p.$('[data-a=topo-abrir]');if(!bt)throw new Error('sem botão Topográfico em '+cod);
    await p.waitForTimeout(1500);await p.$eval('[data-a=topo-abrir]',x=>x.scrollIntoView({block:'center'}));await p.screenshot({path:OUT+nome+'_0_relevo.png'});await p.click('[data-a=topo-abrir]');await p.waitForTimeout(300);await p.screenshot({path:OUT+nome+'_1_plano.png'});
    const t0=Date.now();await p.click('[data-a=topo-gerar]');await p.waitForTimeout(2500);await p.screenshot({path:OUT+nome+'_2_andamento.png'});
    await p.waitForSelector('[data-a=topo-baixar],.dh + .banner.warn',{timeout:240000});console.log(nome,'gerado em',((Date.now()-t0)/1000).toFixed(1),'s');
    await p.screenshot({path:OUT+nome+'_3_pronto.png'});
    for(const k of ['pdf','zip']){const bt2=await p.$(`[data-a=topo-baixar][data-k=${k}]`);if(!bt2){console.log(nome,'sem',k,await p.$eval('#modal',m=>m.innerText.slice(0,400)));continue}
      const [d]=await Promise.all([p.waitForEvent('download'),bt2.click()]);await d.saveAs(OUT+nome+'.'+k)}
    const docs=await p.evaluate(([k,c])=>JSON.parse(localStorage.getItem(k)).terrenos.find(x=>x.codigo===c).docs.filter(d=>d.tipo.startsWith('topo')).map(d=>d.tipo+' v'+d.versoes),[KEY,cod]);
    console.log(nome,'documentos:',docs.join(', ')||'nenhum');await p.click('[data-a=close]');await p.waitForTimeout(200)};
  const caso=process.argv[2]||'todos';
  if(/todos|sp/.test(caso))await gerar('TER-000118','sp_laser');
  if(/todos|sql/.test(caso)){await mudar('TER-000112',"t.insc=[{sql:'009.027.0009-1',mun:'sp'}];t.municipio='São Paulo · SP'");await gerar('TER-000112','sp_sql')}
  if(/todos|sjc/.test(caso)){await mudar('TER-000123',`t.municipio='São José dos Campos · SP';t.insc=[];t.poly=${JSON.stringify(SJC)};t.lat=${SJC[0][0]};t.lng=${SJC[0][1]}`);await gerar('TER-000123','sjc_google')}
  console.log(errs.length?'ERROS: '+errs.join(' | '):'sem erros na página');await b.close()})().catch(e=>{console.error(e);process.exit(1)});
