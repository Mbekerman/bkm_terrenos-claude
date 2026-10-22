// ---------------------------------------------------------------------
// GeoSanja (Prefeitura de São José dos Campos) pela inscrição imobiliária.
// Não há serviço público de camadas: usa a API do próprio site
// (geo.sjc.sp.gov.br/v1) com o token de visitante. A busca pela inscrição
// devolve só a poligonal do lote; zona, macrozona, centralidade, riscos e
// restrições vêm das camadas liberadas ao visitante (GetFeatureInfo com raio
// cobrindo o lote, conferido aqui contra a poligonal). Planta (PDF montado
// aqui com ortofoto, curvas e zoneamento) e desenho (DXF) entram como
// documentos com versão. Sem CORS: no Railway passa pelo Caddy em /geosanja.
// No banco: app.registrar_consulta_lote + app.registrar_documento.
// ---------------------------------------------------------------------
const GSJ_BASE=(()=>{const m=document.querySelector('meta[name="geosanja-url"]');if(m&&m.content)return m.content;
  return /^https?:$/.test(location.protocol)&&!/claude\.ai|claudeusercontent|localhost:5173/.test(location.host)?location.origin+'/geosanja/v1/':null})();
// [camada WMS, feição (prefixo do id), tema, como mostrar, gravidade, distância em metros (linhas)]
const GSJ_CAMADAS=[
  ['uso_ocupacao','ZONAS_USO','Zona (LC 623)',p=>p.proposta!=='Bens Preservados'&&p.proposta,''],
  ['uso_ocupacao','ZONAS_USO','Imóvel preservado',p=>p.proposta==='Bens Preservados'&&(p.rotulo||'Bem preservado'),'crit'],
  ['uso_ocupacao','macrozoneamentoUrbano','Macrozona',p=>p.subclasses,''],
  ['uso_ocupacao','macrozoneamentoRural','Macrozona rural',p=>p.rotulo,'warn'],
  ['uso_ocupacao','macroestruturaEconomica','Área de desenvolvimento estratégico',p=>p.polo,''],
  ['uso_ocupacao','CORREDORES','Corredor a até 30 m',p=>p.rotulo||p.corredores,'',30],
  ['uso_ocupacao','recarga_aquifero','Recarga de aquífero',p=>p.nome,'warn'],
  ['anexo_07','centralidade','Centralidade',p=>[p.nome,p.ca_max!=null?`CA máx. ${num(p.ca_max,1)}`:''].filter(Boolean).join(' · '),''],
  ['anexo_04','regioesGeograficas','Região',p=>p.regiao,''],
  ['anexo_05','setorSocioEconomico','Setor socioeconômico',p=>`${p.setor} · ${p.nome}`,''],
  ['subsetor_urbano','subsetor_urbano','Subsetor',p=>`${p.sub_num} · ${p.sub_nom}`,''],
  ['anexo_11','brt','Corredor de transporte público a até 300 m',()=>'Principal corredor','',300],
  ['anexo_13','parquesUrbanos','Parque urbano',p=>p.nome,'warn'],
  ['anexo_14','apaMunicipal','APA municipal',p=>p.nome,'crit'],
  ['anexo_14','parqueNaturalMunicipal','Parque natural municipal',p=>p.nome,'crit'],
  ['pnmBanhado','pnmBanhado','Parque do Banhado',p=>p.nome,'crit'],
  ['zona_de_amortecimento_augusto','zona_de_amortecimento_augusto','Amortecimento do Parque Augusto Ruschi',()=>'Zona de amortecimento','warn'],
  ['anexo_15','nucleosUrbanosInformais','Núcleo informal',p=>p.refname,'warn'],
  ['anexo_16','zdca','Domínio de curso d’água (mapa substituído)',()=>'ZDCA','warn'],
  ['anexo_17','escorregamentoPMRP','Risco de escorregamento',p=>[(p.legenda||'').trim(),p.name].filter(Boolean).join(' · '),'crit'],
  ['pmrr_sjc_2024_setores_final_1','pmrr_sjc_2024_setores_final_1','Plano de redução de riscos (2024)',p=>[p.grau_risco,p.processo].filter(Boolean).join(' · '),'crit'],
  ['linhas_trasmissao','linhas_trasmissao','Faixa de linha de transmissão',()=>'Alta tensão','crit'],
  ['FERROVIA','FERROVIA','Ferrovia a até 30 m',()=>'Linha férrea','warn',30],
];
// Mostradas na lista de dados do lote (as demais vão para "O que toca o lote")
const GSJ_FICHA=['macrozoneamentoUrbano','centralidade','setorSocioEconomico','subsetor_urbano'];
// Desenho (DXF): [chave, layer, cor ACI, campo da cota]
const GSJ_DESENHO=[['lote','LOTE',1],['arruamentos','ARRUAMENTOS',8],['curva_igc_1_1000','CURVAS_IGC_10000',30,'avg_z'],['zonas','ZONAS_LC623',3]];
let GSJ_TOKEN=null;

async function gsjToken(novo){if(GSJ_TOKEN&&!novo)return GSJ_TOKEN;const r=await fetch(GSJ_BASE+'autenticar?token=VISITANTE');if(!r.ok)throw new Error('GeoSanja respondeu '+r.status);
  GSJ_TOKEN=(await r.json()).token;return GSJ_TOKEN}
async function gsjLote(ic){const ped=async tk=>fetch(GSJ_BASE+'localizar',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+tk},
    body:JSON.stringify({toolId:'SearchICTool',parametros:[{name:'ic',value:ic}]})});
  let r=await ped(await gsjToken());if(r.status===401)r=await ped(await gsjToken(true));if(!r.ok)throw new Error('GeoSanja respondeu '+r.status);
  const j=await r.json();return Array.isArray(j)&&j[0]?.data?.geom?JSON.parse(j[0].data.geom):null}
// Feições da camada dentro do retângulo (graus): um pixel no centro com raio que alcança os cantos.
async function gsjInfo(camada,bb){const u=new URL(GSJ_BASE+'proxy');
  Object.entries({SERVICE:'WMS',VERSION:'1.1.1',REQUEST:'GetFeatureInfo',LAYERS:'geoSJC:'+camada,QUERY_LAYERS:'geoSJC:'+camada,SRS:'EPSG:4326',BBOX:bb.join(','),
    WIDTH:101,HEIGHT:101,X:50,Y:50,BUFFER:75,INFO_FORMAT:'application/json',FEATURE_COUNT:200,authToken:await gsjToken()}).forEach(([k,v])=>u.searchParams.set(k,v));
  const r=await fetch(u);if(!r.ok)throw new Error('GeoSanja respondeu '+r.status);const j=await r.json();if(!j||!Array.isArray(j.features))throw new Error('Resposta inesperada do GeoSanja');return j.features}
async function gsjMapa(camada,bb,w,h,fmt){const u=new URL(GSJ_BASE+'proxy');
  Object.entries({SERVICE:'WMS',VERSION:'1.1.1',REQUEST:'GetMap',LAYERS:'geoSJC:'+camada,STYLES:'',SRS:'EPSG:4326',BBOX:bb.join(','),WIDTH:w,HEIGHT:h,FORMAT:fmt,TRANSPARENT:fmt==='image/png',authToken:await gsjToken()}).forEach(([k,v])=>u.searchParams.set(k,v));
  const r=await fetch(u);if(!r.ok)throw new Error('GeoSanja respondeu '+r.status);return createImageBitmap(await r.blob())}

// --- coordenadas: graus -> metros locais (área e distâncias) e -> UTM 23S SIRGAS 2000 (DXF)
const mapCoord=(c,f)=>!c.length?c:typeof c[0]==='number'?f(c):c.map(x=>mapCoord(x,f));
const geoMapa=(g,f)=>g&&{...g,coordinates:mapCoord(g.coordinates,f)},featMapa=(ft,f)=>({...ft,geometry:geoMapa(ft.geometry,f)});
function latLngUtm(lat,lng){const a=6378137,f=1/298.257222101,k0=.9996,e2=f*(2-f),ep2=e2/(1-e2),p=lat*Math.PI/180,l=(lng+45)*Math.PI/180,s=Math.sin(p),c=Math.cos(p),
  N=a/Math.sqrt(1-e2*s*s),T=Math.tan(p)**2,C=ep2*c*c,A=c*l,
  M=a*((1-e2/4-3*e2*e2/64-5*e2**3/256)*p-(3*e2/8+3*e2*e2/32+45*e2**3/1024)*Math.sin(2*p)+(15*e2*e2/256+45*e2**3/1024)*Math.sin(4*p)-(35*e2**3/3072)*Math.sin(6*p));
  return [5e5+k0*N*(A+(1-T+C)*A**3/6+(5-18*T+T*T+72*C-58*ep2)*A**5/120),
    1e7+k0*(M+N*Math.tan(p)*(A*A/2+(5-T+9*C+4*C*C)*A**4/24+(61-58*T+T*T+600*C-330*ep2)*A**6/720))]}
// pontos do lote para conferir o que toca: vértices, bordas a cada metro e grade interna
function gsjAmostra(lote){const r=geoAneis(lote)[0],pts=[];
  r.forEach((p,i)=>{const q=r[(i+1)%r.length],n=Math.max(1,Math.ceil(Math.hypot(q[0]-p[0],q[1]-p[1])));for(let k=0;k<n;k++)pts.push([p[0]+(q[0]-p[0])*k/n,p[1]+(q[1]-p[1])*k/n])});
  const xs=r.map(p=>p[0]),ys=r.map(p=>p[1]),passo=Math.max(.5,Math.sqrt((Math.max(...xs)-Math.min(...xs))*(Math.max(...ys)-Math.min(...ys))/400));
  for(let x=Math.min(...xs)+passo/2;x<Math.max(...xs);x+=passo)for(let y=Math.min(...ys)+passo/2;y<Math.max(...ys);y+=passo)if(geoDentro([x,y],lote))pts.push([x,y]);
  return pts}
const distSeg=(p,a,b)=>{const dx=b[0]-a[0],dy=b[1]-a[1],L=dx*dx+dy*dy,t=L?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/L)):0;return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy)};
function gsjToca(f,lote,amostra,dist){const g=f.geometry;if(!g)return false;
  if(/Polygon/.test(g.type))return amostra.some(p=>geoDentro(p,g))||geoAneis(g).some(r=>r.some(p=>geoDentro(p,lote)));
  if(/LineString/.test(g.type)){const lim=dist||0;return geoAneis(g).some(r=>r.some(p=>geoDentro(p,lote))||amostra.some(p=>r.some((a,i)=>i&&distSeg(p,r[i-1],a)<=lim)))}
  return false}

async function gsjBuscar(t,ins){const llLote=await gsjLote(ins.sql);
  if(!llLote){toast('Inscrição não encontrada no GeoSanja.',true);return}
  const r0=geoAneis(llLote)[0],lon0=r0.reduce((s,p)=>s+p[0],0)/r0.length,lat0=r0.reduce((s,p)=>s+p[1],0)/r0.length,kx=Math.cos(lat0*Math.PI/180)*111319.49,ky=110574.3;
  const loc=([x,y])=>[(x-lon0)*kx,(y-lat0)*ky],lote=geoMapa(llLote,loc),amostra=gsjAmostra(lote);
  const folga=Math.max(...GSJ_CAMADAS.map(c=>c[5]||0))+5,xs=r0.map(p=>p[0]),ys=r0.map(p=>p[1]);
  const bb=[Math.min(...xs)-folga/kx,Math.min(...ys)-folga/ky,Math.max(...xs)+folga/kx,Math.max(...ys)+folga/ky];
  const wms=[...new Set(GSJ_CAMADAS.map(c=>c[0]))],res={},erros=[];
  await Promise.all(wms.map(async k=>{try{res[k]=await gsjInfo(k,bb)}catch(e){erros.push(k)}}));
  const camadas={},zonasF=[];
  GSJ_CAMADAS.forEach(([k,pref,,fmt,,dist],n)=>{if(!res[k])return;const fs=res[k].filter(f=>f.id.split('.')[0]===pref&&gsjToca(featMapa(f,loc),lote,amostra,dist));
    const vals=fs.filter(f=>{try{return fmt(f.properties)}catch(e){return false}});camadas[k+':'+n]=vals.map(f=>f.properties);if(n===0)zonasF.push(...vals.map(f=>featMapa(f,loc)))});
  const zonas=zonasF.length?geoAreaZonas(lote,zonasF,p=>p.proposta):[];
  const areaPol=Math.round(geoAreaAnel(geoAneis(lote)[0])*100)/100,poly=r0.slice(0,-1).map(p=>[+p[1].toFixed(7),+p[0].toFixed(7)]);
  loteRegistrar(t,ins,{lote:{inscricao:ins.sql},poly,areaPol,zonas,erros:GSJ_CAMADAS.map((c,n)=>erros.includes(c[0])?c[0]+':'+n:null).filter(Boolean),camadas,area:null,aConst:null});
  gsjArquivos(t,ins,llLote,res.uso_ocupacao||[])}

// Planta (PDF montado aqui: ortofoto 8 cm, curvas, zoneamento e o lote) com 40 m de folga e desenho (DXF) com 150 m:
// as curvas do IGC são de 5 em 5 m e num lote plano podem não aparecer perto dele.
async function gsjArquivos(t,ins,llLote,usoOcup){const r=geoAneis(llLote)[0],xs=r.map(p=>p[0]),ys=r.map(p=>p[1]),lat0=(Math.min(...ys)+Math.max(...ys))/2;
  const caixa=m=>{const fx=m/(Math.cos(lat0*Math.PI/180)*111319.49),fy=m/110574.3;return [Math.min(...xs)-fx,Math.min(...ys)-fy,Math.max(...xs)+fx,Math.max(...ys)+fy]},bb=caixa(40),bbD=caixa(150);
  const arq=GEO_ARQ[t.id]=GEO_ARQ[t.id]||{},nomeBase='lote_'+digits(ins.sql);
  try{const w=1400,h=Math.round(w*(bb[3]-bb[1])*110574.3/((bb[2]-bb[0])*Math.cos(lat0*Math.PI/180)*111319.49));
    const [foto,curvas,zonas]=await Promise.all([gsjMapa('pm_sjc_ortomosaico_8cm_nov25',bb,w,h,'image/jpeg'),gsjMapa('curva_igc_1_1000',bb,w,h,'image/png').catch(()=>null),gsjMapa('uso_ocupacao',bb,w,h,'image/png').catch(()=>null)]);
    const cv=document.createElement('canvas');cv.width=w;cv.height=h+56;const g=cv.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,w,h+56);g.drawImage(foto,0,0,w,h);
    if(zonas){g.globalAlpha=.35;g.drawImage(zonas,0,0,w,h);g.globalAlpha=1}if(curvas)g.drawImage(curvas,0,0,w,h);
    g.strokeStyle='#e00';g.lineWidth=3;g.beginPath();r.forEach((p,i)=>{const x=(p[0]-bb[0])/(bb[2]-bb[0])*w,y=(bb[3]-p[1])/(bb[3]-bb[1])*h;i?g.lineTo(x,y):g.moveTo(x,y)});g.closePath();g.stroke();
    g.fillStyle='#1f1f1f';g.font='20px sans-serif';g.fillText(`GeoSanja · Inscrição ${ins.sql} · ${new Date().toLocaleDateString('pt-BR')}`,16,h+24);
    g.font='15px sans-serif';g.fillStyle='#444746';g.fillText('Ortofoto 8 cm (nov/2025), curvas de nível IGC 1:10.000 e zoneamento LC 623 da Prefeitura de São José dos Campos; lote em vermelho.',16,h+46);
    const jpg=new Uint8Array(await(await new Promise(ok=>cv.toBlob(ok,'image/jpeg',.85))).arrayBuffer());
    arq.pdf=new Blob([pdfImagem(jpg,cv.width,cv.height)],{type:'application/pdf'});loteDoc(t,ins,'lote_pdf',nomeBase+'.pdf')}catch(e){console.error(e);toast('A planta em PDF não saiu agora; o desenho segue.',true)}
  try{const utm=g=>geoMapa(g,([x,y])=>latLngUtm(y,x)),[ruas,curv]=await Promise.all([gsjInfo('arruamentos',bbD).catch(()=>[]),gsjInfo('curva_igc_1_1000',bbD).catch(()=>[])]);
    const feic=[[{geometry:llLote,properties:{rotulo:ins.sql}}],ruas,curv,usoOcup.filter(f=>f.id.startsWith('ZONAS_USO.'))].map(fs=>fs.map(f=>({...f,geometry:utm(f.geometry)})));
    const u0=latLngUtm(bbD[1],bbD[0]),u1=latLngUtm(bbD[3],bbD[2]);
    arq.dxf=new Blob([geoDxf(GSJ_DESENHO,feic,[u0[0],u0[1],u1[0],u1[1]],`GeoSanja - Inscricao ${ins.sql}`,(k,p)=>k==='lote'?p.rotulo:k==='zonas'?p.proposta:null)],{type:'application/dxf'});loteDoc(t,ins,'lote_dxf',nomeBase+'.dxf')}
  catch(e){console.error(e);toast('O desenho em DXF não saiu agora.',true)}
  save();render();toast('Planta e desenho do lote guardados nos documentos.')}
// PDF de uma página com a imagem (JPEG), em pontos: 1 px = 0,75 pt.
function pdfImagem(jpg,w,h){const W=(w*.75).toFixed(2),H=(h*.75).toFixed(2),cont=`q ${W} 0 0 ${H} 0 0 cm /Im0 Do Q`,enc=new TextEncoder(),partes=[],offs=[];let n=0;
  const add=x=>{const b=typeof x==='string'?enc.encode(x):x;partes.push(b);n+=b.length};
  add('%PDF-1.4\n');[`<< /Type /Catalog /Pages 2 0 R >>`,`<< /Type /Pages /Kids [3 0 R] /Count 1 >>`,`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`].forEach((o,i)=>{offs.push(n);add(`${i+1} 0 obj\n${o}\nendobj\n`)});
  offs.push(n);add(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.length} >>\nstream\n`);add(jpg);add('\nendstream\nendobj\n');
  offs.push(n);add(`5 0 obj\n<< /Length ${cont.length} >>\nstream\n${cont}\nendstream\nendobj\n`);
  const x=n;add(`xref\n0 6\n0000000000 65535 f \n${offs.map(o=>String(o).padStart(10,'0')+' 00000 n \n').join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${x}\n%%EOF\n`);return new Blob(partes)}

// Quadro na inscrição: última consulta e o que toca o lote.
function gsjQuadro(t,ins,i){const g=(ins.geo||[])[0];
  if(!g)return loteVazio(t,ins,i,'Traz do GeoSanja a poligonal do lote, o zoneamento e as restrições, e guarda a planta (PDF) e o desenho (DXF).');
  const lin=(k,v)=>`<div class="kv"><dt>${k}</dt><dd>${v}</dd></div>`,n=pref=>GSJ_CAMADAS.findIndex(c=>c[1]===pref),cam=n=>g.camadas[GSJ_CAMADAS[n][0]+':'+n]||[];
  const valsDe=n=>[...new Set(cam(n).map(x=>{try{return GSJ_CAMADAS[n][3](x)}catch(e){return null}}).filter(Boolean))];
  const linhas=GSJ_CAMADAS.map(([k,,tema,,grav],j)=>({tema,grav,erro:g.erros.includes(k+':'+j),vals:g.camadas[k+':'+j]?valsDe(j):[],j})).filter(l=>l.j>0&&!GSJ_FICHA.includes(GSJ_CAMADAS[l.j][1]));
  const vals=pref=>valsDe(n(pref)).map(esc).join(', ')||'—';
  const fichas=cam(0).filter(z=>z.link&&z.proposta).reduce((a,z)=>(a[z.proposta]=z.link.trim(),a),{});
  const zonasTxt=g.zonas.map(z=>`${esc(z.sigla)} <span class="faint">${m2(z.area_m2)}</span>${fichas[z.sigla]?` <a class="linkbtn" href="${esc(fichas[z.sigla])}" target="_blank" rel="noopener">ficha da zona</a>`:''}`).join(' + ');
  return `<div class="geo" id="geo-${i}">${loteCab(t,ins,i)}
    <div class="geo-kv">${lin('Área da poligonal',m2(g.areaPol)+(ins.area&&Math.abs(g.areaPol/ins.area-1)>.05?` <span class="chip warn">${g.areaPol>ins.area?'+':''}${num((g.areaPol/ins.area-1)*100,0)}% sobre o cadastro</span>`:''))}
    ${lin('Zona no lote',zonasTxt||'—')}${GSJ_FICHA.map(p=>lin(GSJ_CAMADAS[n(p)][2],vals(p))).join('')}</div>
    ${loteToca(linhas)}
    <div class="hint" style="margin:4px 0 8px">O GeoSanja não informa área cadastral, área construída, uso nem endereço do lote: seguem digitados. Curvas de nível do IGC, em escala 1:10.000.</div>
    ${loteArqBotoes(t)}</div>`}
async function gsjPoligono(ic){const g=await gsjLote(ic);return g?geoAneis(g)[0].slice(0,-1).map(p=>[p[1],p[0]]):null}
LOTE_ADAPT.sjc={url:()=>GSJ_BASE,buscar:gsjBuscar,quadro:gsjQuadro,poligono:gsjPoligono};
