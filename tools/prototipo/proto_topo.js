// ---------------------------------------------------------------------
// Topográfico preliminar do terreno (decisão do Moisés, 26/out/2026).
// Contorno: a soma dos lotes da prefeitura quando todas as inscrições com base
// (GeoSampa, GeoSanja) têm o lote; senão, a poligonal desenhada. O levantamento
// cobre a área até 30 m em volta do contorno.
// Cotas: em São Paulo, o laser de 2020 da prefeitura (MDT 1:1000 do GeoSampa,
// folhas .laz lidas aqui com o laz-perf); fora dele, o Google Elevation numa
// grade de 5 m. A grade de origem do Google tem 9,5 m: medir mais denso só
// encarece (a grade de 10 m reproduz a de 1 m com 9 cm de diferença) e, contra
// o laser, o Google erra 3,7 m em média (medido em 26/out/2026).
// Curvas de 1 em 1 m (mestra de 5 em 5) por quadrados marchantes numa grade de 1 m.
// Imagem: ortofoto da prefeitura (SP 2023/24, SJC nov/2025); fora delas, Google
// (Maps Static) ou Esri. Vias, calçadas, córregos e melhoramentos: GeoSampa e
// GeoSanja. Saídas: PDF A3 (página em imagem) e ZIP com DXF 2000 (curvas com a
// cota como elevação, malha de pontos cotados, camadas da prefeitura) e a
// ortofoto como imagem referenciada (o DXF aponta para o JPG ao lado; o mesmo
// vale para um DWG salvo no AutoCAD: imagem nunca vai dentro do desenho).
// No banco: documentos topo_pdf e topo_dxf, com versão, quando as cotas são da
// prefeitura (os termos do Google pedem não guardar dados de elevação).
// ---------------------------------------------------------------------
const TOPO_FOLGA=30,TOPO_PASSO_G=5,TOPO_DPI=160;
const TOPO_LAZ=(()=>{const m=document.querySelector('meta[name="lazperf-url"]');return m&&m.content?m.content:'https://cdn.jsdelivr.net/npm/laz-perf@0.0.7/lib/web/'})();
// download das folhas do MDT: Novo GeoSampa, pelo mesmo repasse do Caddy (/geosampa)
const TOPO_MDT=()=>GEO_BASE?GEO_BASE.replace(/geoserver\/geoportal\/$/,'')+'Download/File/125?key=cd_quadricula&value=':null;
const TOPO={};      // resultado da sessão por terreno: {pdf, zip, previa, resumo}
let TOPO_EM=null;   // geração em andamento: {tid, passos:[[texto, estado]]}

// --- contorno: lotes da prefeitura ou poligonal desenhada
async function topoContorno(t){const L=lotesInsc(t),polys=[],faltam=[];
  for(const x of L){let p=(x.ins.geo||[])[0]?.poly||null;const c=CIDADES_INSC[x.cid];
    if(!p&&LOTE_ADAPT[x.cid].url())try{p=await LOTE_ADAPT[x.cid].poligono(x.ins.sql)}catch(e){console.warn(e)}
    if(p)polys.push(p);else faltam.push(`${c.rotulo} ${x.ins.sql}`)}
  if(L.length&&!faltam.length){const u=lotesUniao(polys);return {polys:u?[u]:polys,fonte:'lotes',n:polys.length,lotes:polys,faltam}}
  if(t.poly&&t.poly.length>=3)return {polys:[t.poly],fonte:'desenhada',n:0,lotes:polys,faltam};
  return polys.length?{polys:[lotesUniao(polys)||polys[0]],fonte:'lotes',n:polys.length,lotes:polys,faltam}:null}

// --- grade de 1 m sobre a área do levantamento; D = distância ao contorno (0 dentro)
function topoGrade(P,bb,passo){const nx=Math.ceil((bb[2]-bb[0])/passo)+1,ny=Math.ceil((bb[3]-bb[1])/passo)+1,D=new Float32Array(nx*ny),ed=[];
  P.forEach(r=>r.forEach((p,i)=>ed.push([p,r[(i+1)%r.length]])));
  for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){const pt=[bb[0]+i*passo,bb[1]+j*passo];let d=Infinity;
    if(!P.some(r=>geoNoAnel(pt,r)))for(const [a,b] of ed){const v=distSeg(pt,a,b);if(v<d)d=v}else d=0;D[j*nx+i]=d}
  return {nx,ny,x0:bb[0],y0:bb[1],s:passo,D,Z:new Float32Array(nx*ny).fill(NaN)}}

// --- cotas pelo Google: grade de 5 m (até 512 pontos por pedido) e interpolação bicúbica para 1 m
async function topoGoogle(G,l0,av){if(!GG||!window.google?.maps?.ElevationService)throw new Error('as cotas fora de São Paulo vêm do Google, que só funciona na versão publicada no Railway.');
  const k=Math.round(TOPO_PASSO_G/G.s),cx=Math.ceil((G.nx-1)/k)+3,cy=Math.ceil((G.ny-1)/k)+3,C=new Float32Array(cx*cy).fill(NaN),pts=[];
  for(let j=0;j<cy;j++)for(let i=0;i<cx;i++){const x=G.x0+(i-1)*TOPO_PASSO_G,y=G.y0+(j-1)*TOPO_PASSO_G,gi=Math.min(G.nx-1,Math.max(0,Math.round((x-G.x0)/G.s))),gj=Math.min(G.ny-1,Math.max(0,Math.round((y-G.y0)/G.s)));
    if(G.D[gj*G.nx+gi]<=TOPO_FOLGA+3*TOPO_PASSO_G)pts.push([j*cx+i,utmLatLng(x,y,l0)])}
  const svc=new google.maps.ElevationService(),lotes=[];for(let i=0;i<pts.length;i+=512)lotes.push(pts.slice(i,i+512));let feitos=0,res=0;
  const pedir=async lt=>{for(let tent=0;;tent++){try{const {results}=await svc.getElevationForLocations({locations:lt.map(p=>({lat:p[1][0],lng:p[1][1]}))});
      results.forEach((r,q)=>{C[lt[q][0]]=r.elevation;res=Math.max(res,r.resolution||0)});return}
    catch(e){if(tent>=3||!/OVER_QUERY_LIMIT|UNKNOWN_ERROR/.test(e.code||e.message||''))throw e;await new Promise(ok=>setTimeout(ok,800*(tent+1)))}}};
  for(let i=0;i<lotes.length;i+=3){await Promise.all(lotes.slice(i,i+3).map(pedir));feitos=Math.min(lotes.length,i+3);av(`${feitos} de ${lotes.length} pedidos ao Google`)}
  // Catmull-Rom nas duas direções (as células sem os 16 vizinhos ficam de fora)
  const cr=(p0,p1,p2,p3,t)=>p1+.5*t*(p2-p0+t*(2*p0-5*p1+4*p2-p3+t*(3*(p1-p2)+p3-p0)));
  for(let j=0;j<G.ny;j++)for(let i=0;i<G.nx;i++){const u=(G.x0+i*G.s-(G.x0-TOPO_PASSO_G))/TOPO_PASSO_G,v=(G.y0+j*G.s-(G.y0-TOPO_PASSO_G))/TOPO_PASSO_G,iu=Math.floor(u),iv=Math.floor(v);
    if(iu<1||iv<1||iu>cx-3||iv>cy-3)continue;const lin=[];
    for(let m=-1;m<=2;m++){const r=(iv+m)*cx;lin.push(cr(C[r+iu-1],C[r+iu],C[r+iu+1],C[r+iu+2],u-iu))}
    const z=cr(lin[0],lin[1],lin[2],lin[3],v-iv);if(z===z)G.Z[j*G.nx+i]=z}
  return {fonte:'google',n:pts.length,pedidos:lotes.length,res:res||9.5}}

// --- cotas pelo laser de 2020 (São Paulo): folhas que tocam a área, média por célula, buracos preenchidos e leve suavização
let TOPO_LZ=null;
async function topoLazPerf(){if(TOPO_LZ)return TOPO_LZ;
  if(!window.createLazPerf)await new Promise((ok,erro)=>{const s=document.createElement('script');s.src=TOPO_LAZ+'laz-perf.js';s.onload=ok;s.onerror=()=>erro(new Error('Não foi possível carregar o leitor do laser.'));document.head.appendChild(s)});
  TOPO_LZ=await window.createLazPerf({locateFile:f=>TOPO_LAZ+f});return TOPO_LZ}
async function topoLaser(G,bb,av){if(!TOPO_MDT())throw new Error('sem repasse do GeoSampa');
  const fol=await geoWfs({typeNames:'geoportal:quadricula_folha_mdt_mds_2020',bbox:bb.join(',')+',urn:ogc:def:crs:EPSG::31983'});if(!fol.length)throw new Error('sem folha do laser');
  if(!window.JSZip)throw new Error('biblioteca de compactação indisponível');const M=await topoLazPerf(),S=new Float64Array(G.nx*G.ny),N=new Uint16Array(G.nx*G.ny);let k=0;
  for(const f of fol){const q=f.properties.cd_quadricula;av(`folha ${++k} de ${fol.length} do laser (${q})`);
    const r=await fetch(TOPO_MDT()+encodeURIComponent(q));if(!r.ok)throw new Error('GeoSampa respondeu '+r.status);
    const z=await JSZip.loadAsync(await r.arrayBuffer()),arq=Object.values(z.files).find(x=>/\.laz$/i.test(x.name));if(!arq)throw new Error('folha sem .laz');
    const buf=await arq.async('uint8array'),dv=new DataView(buf.buffer,buf.byteOffset,buf.byteLength),sx=dv.getFloat64(131,true),sy=dv.getFloat64(139,true),sz=dv.getFloat64(147,true),ox=dv.getFloat64(155,true),oy=dv.getFloat64(163,true),oz=dv.getFloat64(171,true);
    const p=M._malloc(buf.length);M.HEAPU8.set(buf,p);const lz=new M.LASZip();
    try{lz.open(p,buf.length);const n=lz.getCount(),len=lz.getPointLength(),pp=M._malloc(len);
      try{for(let i=0;i<n;i++){lz.getPoint(pp);const d=new DataView(M.HEAPU8.buffer,pp,len),x=d.getInt32(0,true)*sx+ox,y=d.getInt32(4,true)*sy+oy;
        const gi=Math.round((x-G.x0)/G.s),gj=Math.round((y-G.y0)/G.s);if(gi<0||gj<0||gi>=G.nx||gj>=G.ny)continue;const c=gj*G.nx+gi;S[c]+=d.getInt32(8,true)*sz+oz;N[c]++}}
      finally{M._free(pp)}}finally{lz.delete();M._free(p)}}
  const Z=G.Z;for(let c=0;c<Z.length;c++)if(N[c])Z[c]=S[c]/N[c];
  const viz=(A,i,j,f)=>{let s=0,n=0;for(let b=-1;b<=1;b++)for(let a=-1;a<=1;a++){const x=i+a,y=j+b;if(x<0||y<0||x>=G.nx||y>=G.ny)continue;const v=A[y*G.nx+x];if(v===v){s+=v*(f?f[(b+1)*3+a+1]:1);n+=f?f[(b+1)*3+a+1]:1}}return n?s/n:NaN};
  for(let it=0;it<40;it++){const B=Z.slice();let falta=0;for(let j=0;j<G.ny;j++)for(let i=0;i<G.nx;i++){const c=j*G.nx+i;if(Z[c]===Z[c]||G.D[c]>TOPO_FOLGA+2)continue;const v=viz(B,i,j);if(v===v)Z[c]=v;else falta++}if(!falta)break}
  const ker=[1,2,1,2,4,2,1,2,1];for(let it=0;it<4;it++){const B=Z.slice();for(let j=0;j<G.ny;j++)for(let i=0;i<G.nx;i++){const c=j*G.nx+i;if(B[c]===B[c])Z[c]=viz(B,i,j,ker)}}
  let ok=0,tot=0;for(let c=0;c<Z.length;c++)if(G.D[c]<=TOPO_FOLGA){tot++;if(Z[c]===Z[c])ok++}
  if(ok<tot*.97)throw new Error('o laser não cobre a área toda');
  return {fonte:'laser',folhas:fol.map(f=>f.properties.cd_quadricula)}}

// --- curvas de nível: quadrados marchantes nível a nível, segmentos encadeados em linhas
function topoIsolinhas(nx,ny,x0,y0,s,V,niveis){const out=[];
  for(const L of niveis){const segs=[],porChave=new Map();
    for(let j=0;j<ny-1;j++)for(let i=0;i<nx-1;i++){const a=V[j*nx+i],b=V[j*nx+i+1],c=V[(j+1)*nx+i+1],d=V[(j+1)*nx+i];
      if(!(a===a&&b===b&&c===c&&d===d)||L<Math.min(a,b,c,d)||L>=Math.max(a,b,c,d))continue;
      const X=v=>x0+v*s,Y=v=>y0+v*s,cr=[];
      if((a>=L)!==(b>=L))cr.push(['h'+i+'_'+j,[X(i+(L-a)/(b-a)),Y(j)]]);
      if((b>=L)!==(c>=L))cr.push(['v'+(i+1)+'_'+j,[X(i+1),Y(j+(L-b)/(c-b))]]);
      if((d>=L)!==(c>=L))cr.push(['h'+i+'_'+(j+1),[X(i+(L-d)/(c-d)),Y(j+1)]]);
      if((a>=L)!==(d>=L))cr.push(['v'+i+'_'+j,[X(i),Y(j+(L-a)/(d-a))]]);
      const par=(p,q)=>{const n=segs.length;segs.push([p[0],p[1],q[0],q[1]]);[p[0],q[0]].forEach(k=>(porChave.get(k)||porChave.set(k,[]).get(k)).push(n))};
      if(cr.length===2)par(cr[0],cr[1]);
      else if(cr.length===4){const m=(a+b+c+d)/4;if((m>=L)===(a>=L)){par(cr[0],cr[1]);par(cr[2],cr[3])}else{par(cr[3],cr[0]);par(cr[1],cr[2])}}}
    const usado=new Uint8Array(segs.length);
    for(let n=0;n<segs.length;n++){if(usado[n])continue;usado[n]=1;const [k1,p1,k2,p2]=segs[n],linha=[p1,p2];
      for(const [fim,lado] of [[k2,1],[k1,0]]){let k=fim;for(;;){const prox=(porChave.get(k)||[]).find(m=>!usado[m]);if(prox==null)break;usado[prox]=1;const sg=segs[prox],o=sg[0]===k?[sg[2],sg[3]]:[sg[0],sg[1]];
        lado?linha.push(o[1]):linha.unshift(o[1]);k=o[0]}}
      if(linha.length>=3)out.push({z:L,pts:topoSimplifica(linha,.12)})}}
  return out}
function topoSimplifica(P,tol){if(P.length<3)return P;const ok=new Uint8Array(P.length);ok[0]=ok[P.length-1]=1;const pilha=[[0,P.length-1]];
  while(pilha.length){const [a,b]=pilha.pop();let m=-1,dm=tol;for(let i=a+1;i<b;i++){const d=distSeg(P[i],P[a],P[b]);if(d>dm){dm=d;m=i}}if(m>0){ok[m]=1;pilha.push([a,m],[m,b])}}
  return P.filter((p,i)=>ok[i])}

// --- camadas da prefeitura: [camada, layer, tipo da geometria] (GeoSampa por WFS; GeoSanja pelo GetFeatureInfo)
const TOPO_SP=[['lote_cidadao','LOTES'],['quadra_viaria_editada','QUADRAS'],['calcada','CALCADAS'],['v_logradouro_segmento','EIXO_VIAS'],['edificacao_v3','EDIFICACOES'],
  ['drenagem','CORREGOS'],['hidrografia_poligono_v2','MASSA_DAGUA'],['massa_d_agua','MASSA_DAGUA'],['represa_v2','MASSA_DAGUA'],['geoconvias_lei_melhoramento_vigente','MELHORAMENTO_VIARIO']];
const TOPO_SJC=[['arruamentos','EIXO_VIAS'],['anexo_16','CURSO_DAGUA_FAIXA'],['curva_igc_1_1000','CURVAS_PREFEITURA']];
async function topoCamadas(cid,bb,l0){const out={},erros=[];
  if(cid==='sp'&&GEO_BASE)await Promise.all(TOPO_SP.map(async([c,ly])=>{try{const fs=await geoWfs({typeNames:'geoportal:'+c,bbox:bb.join(',')+',urn:ogc:def:crs:EPSG::31983',count:3000});
    (out[ly]=out[ly]||[]).push(...fs.filter(f=>f.geometry).map(f=>({g:f.geometry,p:f.properties,c})))}catch(e){erros.push(c)}}));
  if(cid==='sjc'&&GSJ_BASE){const a=utmLatLng(bb[0],bb[1],l0),b=utmLatLng(bb[2],bb[3],l0),bbg=[a[1],a[0],b[1],b[0]];
    await Promise.all(TOPO_SJC.map(async([c,ly])=>{try{const fs=await gsjInfo(c,bbg);(out[ly]=out[ly]||[]).push(...fs.filter(f=>f.geometry).map(f=>({g:geoMapa(f.geometry,([x,y])=>latLngUtm(y,x,l0)),p:f.properties,c})))}catch(e){erros.push(c)}}))}
  // tudo recortado no quadro (algumas feições, como melhoramentos e córregos, seguem por quilômetros)
  Object.keys(out).forEach(ly=>{out[ly]=out[ly].map(f=>({...f,g:topoRecorte(f.g,bb)})).filter(f=>f.g)});
  // córrego canalizado (trecho fechado) vai para outra layer, tracejada
  if(out.CORREGOS){out.CORREGOS_CANALIZADOS=out.CORREGOS.filter(f=>/fechado|subterr/i.test((f.p.nm_tipo_trecho||'')+(f.p.nm_tipo_curso_hidrografia||'')));out.CORREGOS=out.CORREGOS.filter(f=>!out.CORREGOS_CANALIZADOS.includes(f))}
  return {camadas:out,erros}}
// Recorte no retângulo: polígonos por Sutherland-Hodgman, linhas em pedaços (cada pedaço que fica dentro).
function topoRecorte(g,bb){const dentro=p=>p[0]>=bb[0]&&p[0]<=bb[2]&&p[1]>=bb[1]&&p[1]<=bb[3];
  if(/Polygon/.test(g.type)){const lados=[[0,1,bb[0]],[0,-1,bb[2]],[1,1,bb[1]],[1,-1,bb[3]]],an=[];
    for(const r0 of geoAneis(g)){let r=r0;for(const [e,sg,v] of lados){const ok=p=>sg*(p[e]-v)>=0,n=[];
        r.forEach((p,i)=>{const q=r[(i+1)%r.length];if(ok(p))n.push(p);if(ok(p)!==ok(q)){const t=(v-p[e])/(q[e]-p[e]);n.push([p[0]+t*(q[0]-p[0]),p[1]+t*(q[1]-p[1])])}});r=n;if(!r.length)break}
      if(r.length>=3)an.push(r)}
    return an.length?{type:'MultiPolygon',coordinates:an.map(r=>[r])}:null}
  // ponto de fora logo antes do primeiro de dentro: o trecho fica inteiro até a borda (o canvas e o CAD recortam o resto)
  const out=[];for(const L of geoAneis(g)){let cur=[];for(let i=0;i<L.length;i++){const p=L[i];if(dentro(p)){if(!cur.length&&i>0)cur.push(L[i-1]);cur.push(p)}else if(cur.length){cur.push(p);out.push(cur);cur=[]}}if(cur.length>1)out.push(cur)}
  return out.length?{type:'MultiLineString',coordinates:out}:null}
// Largura da via: do eixo, uma perpendicular para cada lado até as calçadas; a primeira borda é o meio-fio e a segunda, o alinhamento.
function topoLarguras(cam,P){const eixos=cam.EIXO_VIAS||[],calc=(cam.CALCADAS||[]).flatMap(f=>geoAneis(f.g)),res=[];if(!calc.length)return res;
  const corta=(o,d,a,b)=>{const ex=b[0]-a[0],ey=b[1]-a[1],den=d[0]*ey-d[1]*ex;if(Math.abs(den)<1e-9)return null;const t=((a[0]-o[0])*ey-(a[1]-o[1])*ex)/den,u=((a[0]-o[0])*d[1]-(a[1]-o[1])*d[0])/den;return t>0&&u>=0&&u<=1?t:null};
  const lado=(o,d)=>{const ts=[];calc.forEach(r=>r.forEach((p,i)=>{const t=corta(o,d,p,r[(i+1)%r.length]);if(t!=null&&t<40)ts.push(t)}));return ts.sort((a,b)=>a-b)};
  const perto=pt=>Math.min(...P.flatMap(r=>r.map((p,i)=>distSeg(pt,p,r[(i+1)%r.length]))));
  for(const e of eixos){const L=geoAneis(e.g)[0];if(!L||L.length<2)continue;const comp=L.slice(1).reduce((s,p,i)=>s+Math.hypot(p[0]-L[i][0],p[1]-L[i][1]),0);if(comp<15)continue;
    let acc=0,o=null,dir=null;for(let i=1;i<L.length;i++){const sg=Math.hypot(L[i][0]-L[i-1][0],L[i][1]-L[i-1][1]);if(acc+sg>=comp/2){const f=(comp/2-acc)/sg;o=[L[i-1][0]+f*(L[i][0]-L[i-1][0]),L[i-1][1]+f*(L[i][1]-L[i-1][1])];dir=[(L[i][0]-L[i-1][0])/sg,(L[i][1]-L[i-1][1])/sg];break}acc+=sg}
    if(!o||perto(o)>TOPO_FOLGA+10)continue;const n=[-dir[1],dir[0]],a=lado(o,n),b=lado(o,[-n[0],-n[1]]);if(a.length<2||b.length<2)continue;
    // meio-fio dos dois lados a distâncias parecidas do eixo e calçadas de 0,8 a 8 m; senão, a medida não é confiável
    const leito=a[0]+b[0],via=a[1]+b[1],ca=a[1]-a[0],cb=b[1]-b[0];if(leito<4||via>60||ca<.8||cb<.8||ca>8||cb>8||Math.max(a[0],b[0])>2.2*Math.min(a[0],b[0]))continue;
    res.push({o,dir,leito,via,ca,cb,nome:topoNomeVia(e.p)})}
  return res}
const topoNomeVia=p=>p?[p.cd_tipo_logradouro,p.cd_titulo_logradouro,p.tx_preposicao_logradouro,p.nm_logradouro].filter(Boolean).join(' ').trim():'';

// --- imagem: ortofoto da prefeitura no próprio UTM; fora de SP e SJC, Google (Maps Static) ou Esri, ajustada ao UTM
async function topoImagem(cid,bb,w,h,l0,epsg){const bm=async u=>{const r=await fetch(u,{signal:AbortSignal.timeout(30000)});if(!r.ok||!/image/.test(r.headers.get('content-type')||''))throw new Error('imagem '+r.status);return createImageBitmap(await r.blob())};
  const wms=(base,ly,extra)=>{const u=new URL(base);Object.entries({SERVICE:'WMS',VERSION:'1.1.1',REQUEST:'GetMap',LAYERS:ly,STYLES:'',SRS:'EPSG:'+epsg,BBOX:bb.join(','),WIDTH:w,HEIGHT:h,FORMAT:'image/jpeg',...extra}).forEach(([k,v])=>u.searchParams.set(k,v));return u};
  if(cid==='sp'&&GEO_BASE&&epsg===31983)try{return {img:await bm(wms(GEO_BASE+'ows','Orto_IGC_2023')),fonte:'Ortofoto 2023/2024 da Prefeitura de São Paulo (GeoSampa)'}}catch(e){console.warn(e)}
  if(cid==='sjc'&&GSJ_BASE&&epsg===31983)try{return {img:await bm(wms(GSJ_BASE+'proxy','geoSJC:pm_sjc_ortomosaico_8cm_nov25',{authToken:await gsjToken()})),fonte:'Ortofoto 8 cm (nov/2025) da Prefeitura de São José dos Campos (GeoSanja)'}}catch(e){console.warn(e)}
  if(GKEY)try{return await topoImgGoogle(bb,w,h,l0)}catch(e){console.warn('Google Maps Static indisponível',e)}
  try{const u=new URL('https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export');
    Object.entries({bbox:bb.join(','),bboxSR:epsg,imageSR:epsg,size:w+','+h,format:'jpg',f:'image'}).forEach(([k,v])=>u.searchParams.set(k,v));return {img:await bm(u),fonte:'Imagem Esri World Imagery'}}
  catch(e){console.warn(e);return {img:null,fonte:'Sem imagem de fundo (nenhuma fonte respondeu)'}}}
// Uma imagem do Maps Static (até 1280 px) no nível que cabe; os cantos levados ao UTM fazem o ajuste (afim) para o quadro.
async function topoImgGoogle(bb,w,h,l0){const c=utmLatLng((bb[0]+bb[2])/2,(bb[1]+bb[3])/2,l0),a=utmLatLng(bb[0],bb[1],l0),b=utmLatLng(bb[2],bb[3],l0);
  const merc=(la,lo,z)=>{const s=256*2**z,y=Math.log(Math.tan(Math.PI/4+la*Math.PI/360));return [(lo+180)/360*s,(1-y/Math.PI)/2*s]};
  let z=21;while(z>10){const p=merc(a[0],a[1],z),q=merc(b[0],b[1],z);if(Math.abs(q[0]-p[0])<620&&Math.abs(q[1]-p[1])<620)break;z--}
  const u=`https://maps.googleapis.com/maps/api/staticmap?center=${c[0].toFixed(7)},${c[1].toFixed(7)}&zoom=${z}&size=640x640&scale=2&maptype=satellite&key=${GKEY}`;
  const r=await fetch(u);if(!r.ok)throw new Error('Maps Static respondeu '+r.status);const im=await createImageBitmap(await r.blob()),cv=document.createElement('canvas');cv.width=w;cv.height=h;
  const g=cv.getContext('2d'),m0=merc(c[0],c[1],z),px=(la,lo)=>{const m=merc(la,lo,z);return [(m[0]-m0[0])*2+640,(m[1]-m0[1])*2+640]};
  // três cantos do quadro: pixel da imagem do Google -> pixel do quadro
  const Q=[[bb[0],bb[3],0,0],[bb[2],bb[3],w,0],[bb[0],bb[1],0,h]].map(([x,y,X,Y])=>[...px(...utmLatLng(x,y,l0)),X,Y]);
  const [[u0,v0,X0,Y0],[u1,v1,X1,Y1],[u2,v2,X2,Y2]]=Q,det=(u1-u0)*(v2-v0)-(u2-u0)*(v1-v0),
    A=((X1-X0)*(v2-v0)-(X2-X0)*(v1-v0))/det,C=((X2-X0)*(u1-u0)-(X1-X0)*(u2-u0))/det,B=((Y1-Y0)*(v2-v0)-(Y2-Y0)*(v1-v0))/det,D=((Y2-Y0)*(u1-u0)-(Y1-Y0)*(u2-u0))/det;
  g.setTransform(A,B,C,D,X0-A*u0-C*v0,Y0-B*u0-D*v0);g.drawImage(im,0,0);g.setTransform(1,0,0,1,0,0);
  return {img:cv,fonte:'Imagem de satélite do Google'}}

// --- geração: contorno, cotas, curvas, camadas, imagem, PDF e ZIP
async function topoGerar(t){if(TOPO_EM)return;const passos=[];TOPO_EM={tid:t.id,passos};const cid=cidDoTerreno(t);
  const passo=txt=>{passos.forEach(p=>{if(p[1]==='andando')p[1]='feito'});passos.push([txt,'andando']);renderModal()},av=txt=>{passos[passos.length-1][2]=txt;renderModal()};
  try{passo('Contorno do terreno');const ct=await topoContorno(t);if(!ct)throw new Error('O terreno não tem poligonal nem lote da prefeitura.');
    const c0=centro(ct.polys[0]),zona=Math.floor((c0[1]+180)/6)+1,l0=-183+6*zona,epsg=31960+zona;
    const P=ct.polys.map(r=>r.map(([la,lo])=>latLngUtm(la,lo,l0))),xs=P.flat().map(p=>p[0]),ys=P.flat().map(p=>p[1]);
    const lev=[Math.min(...xs)-TOPO_FOLGA-2,Math.min(...ys)-TOPO_FOLGA-2,Math.max(...xs)+TOPO_FOLGA+2,Math.max(...ys)+TOPO_FOLGA+2].map(v=>Math.round(v));
    const area=(lev[2]-lev[0])*(lev[3]-lev[1]),G=topoGrade(P,lev,area>1.5e6?2:1);
    passo(cid==='sp'?'Cotas pelo laser de 2020 da prefeitura':'Cotas pelo Google (grade de 5 m)');let fz;
    if(cid==='sp'&&epsg===31983)try{fz=await topoLaser(G,lev,av)}catch(e){console.warn(e);G.Z.fill(NaN);passos[passos.length-1][0]=`Laser indisponível (${e.message}); cotas pelo Google`;renderModal()}
    if(!fz)fz=await topoGoogle(G,l0,av);
    for(let c=0;c<G.Z.length;c++)if(G.D[c]>TOPO_FOLGA)G.Z[c]=NaN;
    passo('Curvas de nível');const dentro=[],todas=[];for(let c=0;c<G.Z.length;c++){const z=G.Z[c];if(z!==z)continue;todas.push(z);if(G.D[c]===0)dentro.push(z)}
    if(!todas.length)throw new Error('Nenhuma cota na área do levantamento.');
    const zmin=Math.min(...todas),zmax=Math.max(...todas),iv=zmax-zmin>300?5:zmax-zmin>120?2:1,mestra=iv*5,niveis=[];for(let z=Math.ceil(zmin/iv)*iv;z<=zmax;z+=iv)niveis.push(z);
    const curvas=topoIsolinhas(G.nx,G.ny,G.x0,G.y0,G.s,G.Z,niveis).map(c=>({...c,mestra:Math.abs(c.z/mestra-Math.round(c.z/mestra))<1e-6}));
    const folga=topoIsolinhas(G.nx,G.ny,G.x0,G.y0,G.s,G.D.map(v=>-v),[-TOPO_FOLGA]).map(c=>c.pts);
    let dec=0,nd=0;for(let j=1;j<G.ny-1;j++)for(let i=1;i<G.nx-1;i++){const c=j*G.nx+i;if(G.D[c]!==0)continue;const gx=(G.Z[c+1]-G.Z[c-1])/(2*G.s),gy=(G.Z[c+G.nx]-G.Z[c-G.nx])/(2*G.s),v=Math.hypot(gx,gy);if(v===v){dec+=v;nd++}}
    const dz=dentro.length?{min:Math.min(...dentro),max:Math.max(...dentro)}:{min:zmin,max:zmax};
    passo('Vias, calçadas e córregos da prefeitura');const quadro=topoQuadro(lev),cam=await topoCamadas(cid,quadro.bb,l0);const larg=topoLarguras(cam.camadas,P);
    passo('Imagem de fundo');const im=await topoImagem(cid,quadro.bb,quadro.wi,quadro.hi,l0,epsg);
    passo('PDF e DXF');const nome=`topografico_${t.codigo}`,area0=Math.round(P.reduce((s,r)=>s+geoAreaAnel(r),0));
    const R={t,ct,P,G,curvas,folga,cam:cam.camadas,erros:cam.erros,larg,im,quadro,fz,iv,mestra,zona,epsg,l0,area:area0,dz,dec:nd?dec/nd*100:null,em:new Date()};
    const pg=topoPagina(R),jpg=new Uint8Array(await(await new Promise(ok=>pg.toBlob(ok,'image/jpeg',.88))).arrayBuffer());
    const pdf=pdfImagem(jpg,pg.width,pg.height,1190.55,841.89);
    const zip=await topoZip(R,nome),previa=topoPrevia(pg);
    const resumo={contorno:ct.fonte==='lotes'?`Lotes da prefeitura (${ct.n} inscriç${ct.n>1?'ões':'ão'})`:'Poligonal desenhada'+(ct.faltam.length?` (sem o lote de ${ct.faltam.join(', ')})`:''),
      cotas:topoFonteTxt(fz),imagem:im.fonte,curvas:`de ${iv} em ${iv} m (mestra de ${mestra} em ${mestra} m)`,area:area0,min:dz.min,max:dz.max,dec:nd?dec/nd*100:null,
      vias:larg.length,erros:cam.erros,escala:quadro.esc,guarda:fz.fonte!=='google'};
    TOPO[t.id]={pdf,zip,previa,resumo,nome,em:agora()};
    if(resumo.guarda&&UI.role!=='Leitura'){topoDoc(t,'topo_pdf',nome+'.pdf');topoDoc(t,'topo_dxf',nome+'.zip')}
    log(t,`Topográfico preliminar gerado (${resumo.cotas.split(';')[0]}; contorno: ${resumo.contorno.toLowerCase()})`);
    passos.forEach(p=>p[1]='feito');save()}
  catch(e){console.error(e);passos.forEach(p=>{if(p[1]==='andando')p[1]='erro'});TOPO[t.id]={erro:e.message||String(e)}}
  finally{TOPO_EM=null;render();renderModal()}}
const topoFonteTxt=fz=>fz.fonte==='laser'?`Laser 2020 da Prefeitura de São Paulo (MDT 1:1000, folha${fz.folhas.length>1?'s':''} ${fz.folhas.join(', ')}); diferença típica de 0,2 m nas cotas de esquina da prefeitura`
  :`Google Elevation, ${num(fz.n)} pontos a cada ${TOPO_PASSO_G} m; grade de origem de ${num(fz.res,1)} m e erro típico de 3 a 4 m`;
function topoDoc(t,k,nome){let d=t.docs.find(x=>x.tipo===k);if(!d){d={tipo:k,status:'recebido',emitido:HOJE,versoes:0,nome};t.docs.push(d)}d.versoes++;d.emitido=HOJE;d.nome=nome}

// --- página A3 deitada a 160 dpi: quadro do mapa à esquerda, legenda e dados à direita
const TOPO_PAG={w:Math.round(420/25.4*TOPO_DPI),h:Math.round(297/25.4*TOPO_DPI),m:44,lat:640};
const TOPO_ESC=[200,250,500,750,1000,1250,1500,2000,2500,3000,4000,5000,7500,10000,15000,20000];
function topoQuadro(lev){const {w,h,m,lat}=TOPO_PAG,fw=w-2*m-lat-28,fh=h-2*m,mm=px=>px/TOPO_DPI*25.4,cx=(lev[0]+lev[2])/2,cy=(lev[1]+lev[3])/2;
  const esc=TOPO_ESC.find(e=>mm(fw)*e/1000>=(lev[2]-lev[0])+16&&mm(fh)*e/1000>=(lev[3]-lev[1])+16)||TOPO_ESC[TOPO_ESC.length-1],gw=mm(fw)*esc/1000,gh=mm(fh)*esc/1000;
  const bb=[cx-gw/2,cy-gh/2,cx+gw/2,cy+gh/2],wi=Math.min(4000,Math.round(fw*1.4));
  return {bb,esc,fx:m,fy:m,fw,fh,wi,hi:Math.round(wi*fh/fw)}}
const TOPO_COR={terreno:'#2ee86b',folga:'#ffffff',inter:'#ffe066',mestra:'#ff9100',calc:'rgba(77,208,225,.8)',quadra:'rgba(255,255,255,.75)',lote:'rgba(255,255,255,.3)',corrego:'#2f8cff',agua:'rgba(47,140,255,.35)',melh:'#ff4fd8',eixo:'rgba(255,255,255,.9)',faixa:'#7fd3ff'};
function topoPagina(R){const {w,h}=TOPO_PAG,Q=R.quadro,cv=document.createElement('canvas');cv.width=w;cv.height=h;const g=cv.getContext('2d'),F='"Google Sans Flex", Arial, sans-serif';
  g.fillStyle='#fff';g.fillRect(0,0,w,h);const X=x=>Q.fx+(x-Q.bb[0])/(Q.bb[2]-Q.bb[0])*Q.fw,Y=y=>Q.fy+(Q.bb[3]-y)/(Q.bb[3]-Q.bb[1])*Q.fh,pxm=Q.fw/(Q.bb[2]-Q.bb[0]);
  g.save();g.beginPath();g.rect(Q.fx,Q.fy,Q.fw,Q.fh);g.clip();g.fillStyle='#2b2b2b';g.fillRect(Q.fx,Q.fy,Q.fw,Q.fh);
  if(R.im.img)g.drawImage(R.im.img,Q.fx,Q.fy,Q.fw,Q.fh);
  // fora da área levantada, a imagem fica mais escura
  const caminho=(L,fechar)=>{g.beginPath();L.forEach(pts=>{pts.forEach((p,i)=>i?g.lineTo(X(p[0]),Y(p[1])):g.moveTo(X(p[0]),Y(p[1])));if(fechar)g.closePath()})};
  g.save();g.beginPath();g.rect(Q.fx,Q.fy,Q.fw,Q.fh);R.folga.forEach(pts=>{pts.forEach((p,i)=>i?g.lineTo(X(p[0]),Y(p[1])):g.moveTo(X(p[0]),Y(p[1])));g.closePath()});g.fillStyle='rgba(0,0,0,.4)';g.fill('evenodd');g.restore();
  const linhas=(ly,cor,lw,dash,fill)=>{(R.cam[ly]||[]).forEach(f=>{const an=geoAneis(f.g),pol=/Polygon/.test(f.g.type);caminho(an,pol);if(fill&&pol){g.fillStyle=fill;g.fill('evenodd')}g.setLineDash(dash||[]);g.strokeStyle=cor;g.lineWidth=lw;g.stroke()});g.setLineDash([])};
  linhas('LOTES',TOPO_COR.lote,1);linhas('CALCADAS',TOPO_COR.calc,1.2,null,'rgba(77,208,225,.14)');linhas('QUADRAS',TOPO_COR.quadra,1.6);
  linhas('MELHORAMENTO_VIARIO',TOPO_COR.melh,2.4,[14,8],'rgba(255,79,216,.12)');linhas('CURSO_DAGUA_FAIXA',TOPO_COR.faixa,2,[10,6],'rgba(127,211,255,.12)');
  linhas('EIXO_VIAS',TOPO_COR.eixo,1.4,[18,8,4,8]);linhas('MASSA_DAGUA',TOPO_COR.corrego,2,null,TOPO_COR.agua);linhas('CORREGOS',TOPO_COR.corrego,4.5);linhas('CORREGOS_CANALIZADOS',TOPO_COR.corrego,3.5,[12,7]);
  // curvas: intermediárias finas, mestras grossas com a cota
  R.curvas.forEach(c=>{caminho([c.pts]);g.strokeStyle=c.mestra?TOPO_COR.mestra:TOPO_COR.inter;g.lineWidth=c.mestra?2.8:1.6;g.stroke()});
  caminho(R.folga);g.setLineDash([16,10]);g.strokeStyle=TOPO_COR.folga;g.lineWidth=2.2;g.stroke();g.setLineDash([]);
  const halo=(txt,x,y,ang,tam,cor,peso)=>{g.save();g.translate(x,y);g.rotate(ang);g.font=`${peso||500} ${tam}px ${F}`;g.textAlign='center';g.textBaseline='middle';g.lineJoin='round';g.lineWidth=Math.max(3,tam/4);g.strokeStyle='rgba(0,0,0,.85)';g.strokeText(txt,0,0);g.fillStyle=cor;g.fillText(txt,0,0);g.restore()};
  const leg=a=>{a=((a%(2*Math.PI))+2*Math.PI)%(2*Math.PI);return a>Math.PI/2&&a<3*Math.PI/2?a-Math.PI:a};
  R.curvas.filter(c=>c.mestra).forEach(c=>{let acc=90;for(let i=1;i<c.pts.length;i++){const a=c.pts[i-1],b=c.pts[i],d=Math.hypot(X(b[0])-X(a[0]),Y(b[1])-Y(a[1]));acc+=d;
    if(acc>=320&&d>8){acc=0;halo(num(c.z,0),(X(a[0])+X(b[0]))/2,(Y(a[1])+Y(b[1]))/2,leg(Math.atan2(Y(b[1])-Y(a[1]),X(b[0])-X(a[0]))),19,'#fff',600)}}});
  // nomes de rua no meio de cada eixo comprido; larguras medidas
  const vistos=new Set();(R.cam.EIXO_VIAS||[]).forEach(f=>{const L=geoAneis(f.g)[0],nome=topoNomeVia(f.p);if(!L||!nome||L.length<2)return;const m=Math.floor((L.length-1)/2),a=L[m],b=L[m+1],d=Math.hypot(X(b[0])-X(a[0]),Y(b[1])-Y(a[1]));
    const cx=(X(a[0])+X(b[0]))/2,cy=(Y(a[1])+Y(b[1]))/2;if(cx<Q.fx||cy<Q.fy||cx>Q.fx+Q.fw||cy>Q.fy+Q.fh||vistos.has(nome+Math.round(cx/300)+Math.round(cy/300)))return;vistos.add(nome+Math.round(cx/300)+Math.round(cy/300));
    halo(nome,cx,cy,leg(Math.atan2(Y(b[1])-Y(a[1]),X(b[0])-X(a[0]))),17,'#fff',500)});
  R.larg.forEach(v=>{const x=X(v.o[0]+v.dir[0]*12),y=Y(v.o[1]+v.dir[1]*12),txt=`via ${num(v.via,1)} m · leito ${num(v.leito,1)} m`;g.font=`600 16px ${F}`;const tw=g.measureText(txt).width;
    g.fillStyle='rgba(255,213,79,.95)';g.fillRect(x-tw/2-8,y-14,tw+16,28);g.fillStyle='#1f1f1f';g.textAlign='center';g.textBaseline='middle';g.fillText(txt,x,y);
    const n=[-v.dir[1],v.dir[0]];g.strokeStyle='rgba(255,213,79,.95)';g.lineWidth=2;g.beginPath();g.moveTo(X(v.o[0]+n[0]*v.via/2),Y(v.o[1]+n[1]*v.via/2));g.lineTo(X(v.o[0]-n[0]*v.via/2),Y(v.o[1]-n[1]*v.via/2));g.stroke()});
  // calçadas que encostam no levantamento: largura média
  const vc=new Set();(R.cam.CALCADAS||[]).forEach(f=>{const r=geoAneis(f.g)[0],lm=f.p.qt_largura_media_trecho;if(!r||lm==null)return;const c=r.reduce((s,p)=>[s[0]+p[0]/r.length,s[1]+p[1]/r.length],[0,0]);
    if(Math.min(...R.P.flatMap(a=>a.map((p,i)=>distSeg(c,p,a[(i+1)%a.length]))))>18)return;const k=f.p.cd_identificador_segmento_logradouro+'';if(vc.has(k))return;vc.add(k);halo(`calçada ${num(lm,1)} m`,X(c[0]),Y(c[1]),0,14,'#b2f5ff',600)});
  // terreno e medidas dos lados
  caminho(R.P,true);g.strokeStyle='rgba(0,0,0,.7)';g.lineWidth=7;g.stroke();g.strokeStyle=TOPO_COR.terreno;g.lineWidth=3.5;g.stroke();
  R.P.forEach(r=>r.forEach((p,i)=>{const q=r[(i+1)%r.length],d=Math.hypot(q[0]-p[0],q[1]-p[1]);if(d<3||d*pxm<70)return;const ang=leg(Math.atan2(Y(q[1])-Y(p[1]),X(q[0])-X(p[0])));
    g.save();g.translate((X(p[0])+X(q[0]))/2,(Y(p[1])+Y(q[1]))/2);g.rotate(ang);g.font=`600 15px ${F}`;const txt=num(d,2)+' m',tw=g.measureText(txt).width;g.fillStyle='#111';g.fillRect(-tw/2-6,-12,tw+12,24);g.fillStyle=TOPO_COR.terreno;g.textAlign='center';g.textBaseline='middle';g.fillText(txt,0,0);g.restore()}));
  // coordenadas UTM nas bordas
  g.restore();const passoC=[10,20,25,50,100,200,250,500,1000].find(s=>s*pxm>=140)||1000;g.font=`13px ${F}`;g.fillStyle='#444746';g.strokeStyle='#1f1f1f';g.lineWidth=1;
  for(let x=Math.ceil(Q.bb[0]/passoC)*passoC;x<Q.bb[2];x+=passoC){const px=X(x);g.beginPath();g.moveTo(px,Q.fy);g.lineTo(px,Q.fy+10);g.moveTo(px,Q.fy+Q.fh);g.lineTo(px,Q.fy+Q.fh-10);g.stroke();g.textAlign='center';g.fillText('E '+num(x,0),px,Q.fy+Q.fh+16)}
  for(let y=Math.ceil(Q.bb[1]/passoC)*passoC;y<Q.bb[3];y+=passoC){const py=Y(y);g.beginPath();g.moveTo(Q.fx,py);g.lineTo(Q.fx+10,py);g.moveTo(Q.fx+Q.fw,py);g.lineTo(Q.fx+Q.fw-10,py);g.stroke();g.save();g.translate(Q.fx-8,py);g.rotate(-Math.PI/2);g.textAlign='center';g.fillText('N '+num(y,0),0,0);g.restore()}
  g.strokeStyle='#1f1f1f';g.lineWidth=2;g.strokeRect(Q.fx,Q.fy,Q.fw,Q.fh);
  topoLateral(g,R,F,pxm);return cv}
function topoLateral(g,R,F,pxm){const {w,h,m,lat}=TOPO_PAG,x0=w-m-lat,t=R.t;let y=m;
  const txt=(s,tam,cor,peso,lh,larg)=>{g.font=`${peso||400} ${tam}px ${F}`;g.fillStyle=cor||'#1f1f1f';g.textAlign='left';g.textBaseline='top';const pal=String(s).split(' ');let l='';
    for(const p of pal){const tst=l?l+' '+p:p;if(g.measureText(tst).width>(larg||lat)&&l){g.fillText(l,x0,y);y+=lh||tam*1.3;l=p}else l=tst}if(l){g.fillText(l,x0,y);y+=lh||tam*1.3}};
  txt('PLANTA TOPOGRÁFICA PRELIMINAR',30,'#1f1f1f',500);y+=4;txt(`${t.nome} · ${t.codigo}`,20,'#1f1f1f',500);
  txt(`${(t.municipio||'São Paulo · SP').replace(' · ',' - ')} · Área do contorno: ${num(R.area,0)} m²`,16,'#444746');y+=14;
  g.fillStyle='#c4c7c5';g.fillRect(x0,y,lat,1.5);y+=16;
  const kv=(k,v)=>{txt(k,13,'#5f6368',500);y-=2;txt(v,15,'#1f1f1f');y+=6};
  kv('Contorno',R.ct.fonte==='lotes'?`Lotes da prefeitura (${R.ct.n} inscriç${R.ct.n>1?'ões':'ão'})`:'Poligonal desenhada no BKM Terrenos'+(R.ct.faltam.length?` (sem o lote de ${R.ct.faltam.join(', ')})`:''));
  kv('Área levantada',`Contorno + ${TOPO_FOLGA} m em volta`);
  kv('Cotas no terreno',`mínima ${num(R.dz.min,1)} m · máxima ${num(R.dz.max,1)} m · desnível ${num(R.dz.max-R.dz.min,1)} m`+(R.dec!=null?` · declividade média ${num(R.dec,1)}%`:''));
  kv('Fonte das cotas',topoFonteTxt(R.fz));kv('Curvas de nível',`de ${R.iv} em ${R.iv} m; mestra de ${R.mestra} em ${R.mestra} m (laranja, com a cota)`);
  kv('Imagem',R.im.fonte);
  const extras=[R.cam.CALCADAS?.length&&'calçadas',R.cam.EIXO_VIAS?.length&&'eixos de via',R.larg.length&&'largura das vias medida entre as calçadas',(R.cam.CORREGOS?.length||R.cam.CORREGOS_CANALIZADOS?.length)&&'córregos',R.cam.MASSA_DAGUA?.length&&"corpos d'água",R.cam.MELHORAMENTO_VIARIO?.length&&'melhoramento viário',R.cam.CURSO_DAGUA_FAIXA?.length&&"faixa de curso d'água",R.cam.LOTES?.length&&'lotes'].filter(Boolean);
  if(extras.length)kv(R.t&&cidDoTerreno(R.t)==='sjc'?'Do GeoSanja':'Do GeoSampa',extras.join(', ').replace(/^./,c=>c.toUpperCase()));
  kv('Coordenadas',`SIRGAS 2000 / UTM ${R.zona}S (EPSG:${R.epsg}); cotas em metros, altitude ortométrica`);
  y+=4;g.fillStyle='#c4c7c5';g.fillRect(x0,y,lat,1.5);y+=16;txt('Legenda',16,'#1f1f1f',500);y+=4;
  const item=(desenho,rot)=>{g.save();g.translate(x0,y+9);desenho();g.restore();g.font=`14px ${F}`;g.fillStyle='#1f1f1f';g.textBaseline='middle';g.textAlign='left';g.fillText(rot,x0+56,y+9);y+=26};
  const traco=(cor,lw,dash,fundo)=>()=>{if(fundo){g.fillStyle=fundo;g.fillRect(0,-8,44,16)}g.setLineDash(dash||[]);g.strokeStyle=cor;g.lineWidth=lw;g.beginPath();g.moveTo(0,0);g.lineTo(44,0);g.stroke()};
  const fundo='#5d6b63';
  item(()=>{g.fillStyle=fundo;g.fillRect(0,-9,44,18);g.strokeStyle=TOPO_COR.terreno;g.lineWidth=3.5;g.strokeRect(3,-6,38,12)},'Terreno (contorno)');
  item(()=>{g.fillStyle=fundo;g.fillRect(0,-9,44,18);traco(TOPO_COR.folga,2,[8,5])()},`Limite do levantamento (${TOPO_FOLGA} m)`);
  item(()=>{g.fillStyle=fundo;g.fillRect(0,-9,44,18);traco(TOPO_COR.mestra,2.6)()},`Curva mestra (${R.mestra} m)`);
  item(()=>{g.fillStyle=fundo;g.fillRect(0,-9,44,18);traco(TOPO_COR.inter,1.6)()},`Curva intermediária (${R.iv} m)`);
  if(R.cam.CALCADAS?.length)item(()=>{g.fillStyle=fundo;g.fillRect(0,-9,44,18);g.fillStyle='rgba(77,208,225,.35)';g.fillRect(4,-6,36,12);g.strokeStyle=TOPO_COR.calc;g.lineWidth=1.6;g.strokeRect(4,-6,36,12)},'Calçada');
  if(R.cam.QUADRAS?.length)item(()=>{g.fillStyle=fundo;g.fillRect(0,-9,44,18);traco(TOPO_COR.quadra,1.6)()},'Alinhamento da quadra');
  if(R.cam.EIXO_VIAS?.length)item(()=>{g.fillStyle=fundo;g.fillRect(0,-9,44,18);traco(TOPO_COR.eixo,1.4,[10,4,3,4])()},'Eixo da via');
  if(R.cam.LOTES?.length)item(()=>{g.fillStyle=fundo;g.fillRect(0,-9,44,18);traco(TOPO_COR.lote,1.2)()},'Lotes');
  if(R.cam.CORREGOS?.length)item(traco(TOPO_COR.corrego,4.5),'Córrego a céu aberto');
  if(R.cam.CORREGOS_CANALIZADOS?.length)item(traco(TOPO_COR.corrego,3.5,[10,6]),'Córrego canalizado');
  if(R.cam.MASSA_DAGUA?.length)item(()=>{g.fillStyle=TOPO_COR.agua;g.fillRect(0,-8,44,16);g.strokeStyle=TOPO_COR.corrego;g.lineWidth=2;g.strokeRect(0,-8,44,16)},"Corpo d'água");
  if(R.cam.MELHORAMENTO_VIARIO?.length)item(traco(TOPO_COR.melh,2.4,[10,6],'rgba(255,79,216,.15)'),'Melhoramento viário (lei)');
  if(R.cam.CURSO_DAGUA_FAIXA?.length)item(traco(TOPO_COR.faixa,2,[10,6],'rgba(127,211,255,.15)'),"Faixa de curso d'água (PDDI)");
  if(R.larg.length)item(()=>{g.fillStyle='rgba(255,213,79,.95)';g.fillRect(0,-9,44,18)},'Largura da via e do leito (medida)');
  // escala, norte, data e aviso no pé da coluna
  let yb=h-m-250;g.fillStyle='#c4c7c5';g.fillRect(x0,yb,lat,1.5);yb+=18;g.font=`500 16px ${F}`;g.fillStyle='#1f1f1f';g.textAlign='left';g.textBaseline='top';g.fillText(`Escala 1:${num(R.quadro.esc)} (impressão em A3)`,x0,yb);yb+=30;
  const L=[5,10,20,25,50,100,200,250,500].find(s=>s*pxm>=lat*.5/4)||500;for(let i=0;i<4;i++){g.fillStyle=i%2?'#fff':'#1f1f1f';g.fillRect(x0+i*L*pxm,yb,L*pxm,10)}g.strokeStyle='#1f1f1f';g.lineWidth=1;g.strokeRect(x0,yb,4*L*pxm,10);
  g.font=`13px ${F}`;g.fillStyle='#1f1f1f';g.textAlign='center';for(let i=0;i<=4;i++)g.fillText(num(i*L)+(i===4?' m':''),x0+i*L*pxm,yb+16);
  const nx=x0+lat-40,ny=yb-28;g.beginPath();g.moveTo(nx,ny-34);g.lineTo(nx+14,ny+10);g.lineTo(nx,ny);g.closePath();g.fillStyle='#1f1f1f';g.fill();g.beginPath();g.moveTo(nx,ny-34);g.lineTo(nx-14,ny+10);g.lineTo(nx,ny);g.closePath();g.strokeStyle='#1f1f1f';g.lineWidth=1.5;g.stroke();
  g.font=`600 16px ${F}`;g.fillText('N',nx,ny-58);yb+=48;
  g.fillStyle='#fff6e0';g.fillRect(x0,yb,lat,128);g.strokeStyle='#e8c66d';g.strokeRect(x0,yb,lat,128);y=yb+12;const xs=x0;
  g.save();g.translate(14,0);txt('Levantamento preliminar, gerado automaticamente para estudo de viabilidade. Não substitui o levantamento planialtimétrico cadastral feito por profissional habilitado (ART/RRT). Distâncias e cotas podem divergir das medidas de campo.',14,'#5c4300',400,19,lat-28);g.restore();
  g.font=`13px ${F}`;g.fillStyle='#5f6368';g.textAlign='left';g.textBaseline='top';g.fillText(`BKM Terrenos · gerado em ${R.em.toLocaleDateString('pt-BR')} ${R.em.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})} por ${me()}`,xs,h-m-6)}
function topoPrevia(pg){const Q=TOPO_PAG,k=900/pg.width,c=document.createElement('canvas');c.width=900;c.height=Math.round(pg.height*k);c.getContext('2d').drawImage(pg,0,0,c.width,c.height);return c.toDataURL('image/jpeg',.82)}

// --- DXF 2000 a partir do modelo (topo_dxf_modelo.py) + imagem ao lado, num ZIP
const TOPO_DXF_MODELO=__TOPO_DXF__;
function topoDxf(R,arqImg,wi,hi){const asc=s=>String(s??'').normalize('NFD').replace(/[^\x20-\x7e]/g,''),f=v=>(+v).toFixed(3),L=[];let hnd=0x100;
  const ent=(tipo,ly,sub,pares)=>{L.push('0',tipo,'5',(hnd++).toString(16).toUpperCase(),'330','17','100','AcDbEntity','8',ly,'100',sub,...pares)};
  const poli=(ly,pts,fech,z)=>{if(pts.length<2)return;ent('LWPOLYLINE',ly,'AcDbPolyline',['90',String(pts.length),'70',fech?'1':'0','38',f(z||0),...pts.flatMap(p=>['10',f(p[0]),'20',f(p[1])])])};
  const texto=(ly,x,y,alt,s,rot)=>ent('TEXT',ly,'AcDbText',['10',f(x),'20',f(y),'30','0','40',f(alt),'1',asc(s),'50',f(rot||0),'7','BKM','72','1','11',f(x),'21',f(y),'31','0','100','AcDbText','73','2']);
  R.P.forEach(r=>poli('TERRENO',r,true));R.folga.forEach(p=>poli('FOLGA_30M',p,false));
  R.P.forEach(r=>r.forEach((p,i)=>{const q=r[(i+1)%r.length],d=Math.hypot(q[0]-p[0],q[1]-p[1]);if(d<3)return;let a=Math.atan2(q[1]-p[1],q[0]-p[0])*180/Math.PI;if(a>90||a<-90)a+=180;texto('MEDIDAS',(p[0]+q[0])/2,(p[1]+q[1])/2,1,num(d,2)+' m',a)}));
  R.curvas.forEach(c=>{poli(c.mestra?'CURVA_MESTRA':'CURVA_INTERMEDIARIA',c.pts,false,c.z);if(c.mestra&&c.pts.length>4){const m=Math.floor(c.pts.length/2),a=c.pts[m-1],b=c.pts[m];let ang=Math.atan2(b[1]-a[1],b[0]-a[0])*180/Math.PI;if(ang>90||ang<-90)ang+=180;texto('COTA_CURVA',(a[0]+b[0])/2,(a[1]+b[1])/2,1.2,num(c.z,0),ang)}});
  const G=R.G,k=Math.round(TOPO_PASSO_G/G.s);for(let j=0;j<G.ny;j+=k)for(let i=0;i<G.nx;i+=k){const z=G.Z[j*G.nx+i];if(z===z)ent('POINT','MALHA_COTAS','AcDbPoint',['10',f(G.x0+i*G.s),'20',f(G.y0+j*G.s),'30',f(z)])}
  Object.entries(R.cam).forEach(([ly,fs])=>fs.forEach(ft=>{const pol=/Polygon/.test(ft.g.type),z=ly==='CURVAS_PREFEITURA'?ft.p.avg_z:0;geoAneis(ft.g).forEach(r=>poli(ly,pol&&r.length>1&&r[0][0]===r[r.length-1][0]&&r[0][1]===r[r.length-1][1]?r.slice(0,-1):r,pol,z))}));
  (R.cam.EIXO_VIAS||[]).forEach(ft=>{const Lh=geoAneis(ft.g)[0],n=topoNomeVia(ft.p);if(!Lh||!n||Lh.length<2)return;const m=Math.floor((Lh.length-1)/2),a=Lh[m],b=Lh[m+1];let ang=Math.atan2(b[1]-a[1],b[0]-a[0])*180/Math.PI;if(ang>90||ang<-90)ang+=180;texto('TEXTO_VIAS',(a[0]+b[0])/2,(a[1]+b[1])/2,2,n,ang)});
  R.larg.forEach(v=>{const n=[-v.dir[1],v.dir[0]];poli('LARGURA_VIAS',[[v.o[0]+n[0]*v.via/2,v.o[1]+n[1]*v.via/2],[v.o[0]-n[0]*v.via/2,v.o[1]-n[1]*v.via/2]]);texto('LARGURA_VIAS',v.o[0]+v.dir[0]*6,v.o[1]+v.dir[1]*6,1.2,`via ${num(v.via,1)} m / leito ${num(v.leito,1)} m`,Math.atan2(n[1],n[0])*180/Math.PI>90?Math.atan2(n[1],n[0])*180/Math.PI-180:Math.atan2(n[1],n[0])*180/Math.PI)});
  const Q=R.quadro.bb,ps=(Q[2]-Q[0])/wi,psy=(Q[3]-Q[1])/hi;let s=TOPO_DXF_MODELO;
  s=s.replace('911111.25',f(Q[0])).replace('922222.25',f(Q[1])).replace('\n 11\n0.125\n',`\n 11\n${ps.toFixed(6)}\n`).replace('\n 22\n0.125\n',`\n 22\n${psy.toFixed(6)}\n`)
    .replace(/7771\.0/g,wi+'.0').replace(/7772\.0/g,hi+'.0').replace('\n7770.5\n',`\n${wi-.5}\n`).replace('\n7771.5\n',`\n${hi-.5}\n`).replace(/__IMAGEM__\.jpg/g,arqImg)
    .replace(/\$EXTMIN\n 10\n[^\n]+\n 20\n[^\n]+/,`$EXTMIN\n 10\n${f(Q[0])}\n 20\n${f(Q[1])}`).replace(/\$EXTMAX\n 10\n[^\n]+\n 20\n[^\n]+/,`$EXTMAX\n 10\n${f(Q[2])}\n 20\n${f(Q[3])}`);
  if(!R.im.img)s=s.replace(/\n {2}0\nIMAGE\n[\s\S]*?(?=\n {2}0\nENDSEC)/,'');
  const i=s.indexOf('\nENTITIES\n'),j=s.indexOf('\n  0\nENDSEC\n',i);s=s.slice(0,j)+'\n'+L.join('\n')+s.slice(j);
  return s.replace(/(\$HANDSEED\n {2}5\n)[0-9A-F]+/,'$1'+hnd.toString(16).toUpperCase()).replace(/\n/g,'\r\n')}
async function topoZip(R,nome){const Q=R.quadro,z=new JSZip(),arqImg=nome+'_imagem.jpg';let wi=Q.wi,hi=Q.hi;
  if(R.im.img){const c=document.createElement('canvas');c.width=wi;c.height=hi;c.getContext('2d').drawImage(R.im.img,0,0,wi,hi);z.file(arqImg,await new Promise(ok=>c.toBlob(ok,'image/jpeg',.9)));
    const ps=(Q.bb[2]-Q.bb[0])/wi,py=(Q.bb[3]-Q.bb[1])/hi;z.file(nome+'_imagem.jgw',[ps,0,0,-py,Q.bb[0]+ps/2,Q.bb[3]-py/2].map(v=>v.toFixed(6)).join('\r\n')+'\r\n')}
  z.file(nome+'.dxf',topoDxf(R,arqImg,wi,hi));
  z.file('LEIA-ME.txt',[`Topografico preliminar - ${R.t.codigo}`,'',`${nome}.dxf: DXF 2000 em SIRGAS 2000 / UTM ${R.zona}S (EPSG:${R.epsg}), em metros.`,
    '  Curvas com a cota como elevacao (CURVA_MESTRA, CURVA_INTERMEDIARIA), malha de pontos cotados a cada 5 m (MALHA_COTAS),',
    '  terreno, limite do levantamento (30 m) e as camadas da prefeitura (calcadas, eixos, corregos...).',
    R.im.img?`${arqImg}: imagem de fundo, referenciada pelo DXF. Deixe os dois na mesma pasta.`:'Sem imagem de fundo.',
    '','No AutoCAD: abra o DXF e use Salvar como > DWG. A imagem continua como arquivo a parte (o AutoCAD nunca guarda imagem dentro do DWG);',
    'para enviar, use eTransmit, que junta o DWG e a imagem.','',`Fonte das cotas: ${topoFonteTxt(R.fz).normalize('NFD').replace(/[^\x20-\x7e]/g,'')}`,
    'Levantamento preliminar para estudo: nao substitui o levantamento planialtimetrico feito por profissional habilitado.'].join('\r\n'));
  return z.generateAsync({type:'blob'})}

// --- tela: botão na seção Relevo, janela com o andamento, a prévia e os downloads
function topoBotao(t){return t.poly||lotesInsc(t).length?`<button class="btn sm" data-a="topo-abrir">${ic('download',16)}Topográfico</button>`:''}
function topoModal(M,fechar){if(M!=='topo')return '';const t=T(UI.id);if(!t)return '';const R=TOPO[t.id],em=TOPO_EM&&TOPO_EM.tid===t.id?TOPO_EM:null,cid=cidDoTerreno(t);
  const plano=`<ul class="topo-plano"><li>${lotesInsc(t).length?'Contorno pelos lotes da prefeitura (soma das inscrições); sem eles, a poligonal desenhada.':'Contorno pela poligonal desenhada (o terreno não tem inscrição com base da prefeitura).'}</li>
    <li>Levantamento até ${TOPO_FOLGA} m em volta do contorno.</li>
    <li>${cid==='sp'?'Cotas do laser de 2020 da Prefeitura de São Paulo (erro típico de 0,2 m); sem folha do laser, Google.':`Cotas do Google, um ponto a cada ${TOPO_PASSO_G} m (a origem do Google tem 9,5 m; erro típico de 3 a 4 m).`}</li>
    <li>${cid==='sp'?'Ortofoto 2023/2024, calçadas com largura, eixos, quadras, lotes, córregos e melhoramentos do GeoSampa.':cid==='sjc'?'Ortofoto 8 cm de nov/2025, arruamentos, faixas de curso d’água e curvas do IGC do GeoSanja.':'Imagem de satélite do Google (ou Esri).'}</li></ul>${!GEO_BASE&&!GG?'<div class="hint">As bases da prefeitura e o Google só respondem na versão publicada no Railway.</div>':''}`;
  const andamento=em?`<ol class="topo-passos">${em.passos.map(([p,st,det])=>`<li class="${st}">${st==='andando'?'<span class="spin" aria-hidden="true"></span>':st==='erro'?ic('warn',16):ic('check',16)}<span>${esc(p)}${det?` <span class="faint">· ${esc(det)}</span>`:''}</span></li>`).join('')}</ol>`:'';
  const S=R&&R.resumo,res=S?`<img class="topo-previa" src="${R.previa}" alt="Prévia do topográfico">
    <dl class="kvl topo-kv"><div class="kv"><dt>Contorno</dt><dd>${esc(S.contorno)}</dd></div><div class="kv"><dt>Cotas no terreno</dt><dd>${num(S.min,1)} a ${num(S.max,1)} m · desnível ${num(S.max-S.min,1)} m${S.dec!=null?` · declividade média ${num(S.dec,1)}%`:''}</dd></div>
    <div class="kv"><dt>Fonte das cotas</dt><dd>${esc(S.cotas)}</dd></div><div class="kv"><dt>Curvas</dt><dd>${esc(S.curvas)}</dd></div><div class="kv"><dt>Imagem</dt><dd>${esc(S.imagem)}</dd></div>
    ${S.erros.length?`<div class="kv"><dt>Não responderam</dt><dd>${esc(S.erros.join(', '))}</dd></div>`:''}</dl>
    <div class="hint">${S.guarda?(UI.role!=='Leitura'?'Os dois arquivos foram guardados em Documentos, com versão.':''):'Com cotas do Google, os arquivos só são baixados: os termos do Google pedem não guardar dados de elevação.'} O ZIP traz o DXF e a imagem referenciada; no AutoCAD, Salvar como DWG.</div>`
    :R&&R.erro?`<div class="banner warn">${ic('warn')}<div>O topográfico não saiu: ${esc(R.erro)}</div></div>`:'';
  return `<div class="dh"><div><h2>Topográfico preliminar</h2><div class="muted" style="margin-top:4px">${esc(t.nome)}</div></div>${fechar}</div>
    ${em?andamento:res||plano}
    <div class="df">${S&&!em?`<button class="btn text" data-a="topo-gerar">Gerar de novo</button><button class="btn" data-a="topo-baixar" data-k="zip">${ic('download',16)}DXF + imagem (.zip)</button><button class="btn primary" data-a="topo-baixar" data-k="pdf">${ic('download',16)}PDF</button>`
      :em?'':`<button class="btn primary" data-a="topo-gerar">Gerar topográfico</button>`}</div>`}
function topoBaixar(t,k){const R=TOPO[t.id];if(!R||!R[k])return;const url=URL.createObjectURL(R[k]),el=document.createElement('a');el.href=url;el.download=R.nome+'.'+k;document.body.appendChild(el);el.click();el.remove();setTimeout(()=>URL.revokeObjectURL(url),4000)}
function topoClick(A,a,t){if(!A.startsWith('topo-'))return false;if(!t)return true;
  if(A==='topo-abrir'){UI.modal='topo';renderModal()}
  if(A==='topo-gerar'){delete TOPO[t.id];topoGerar(t)}
  if(A==='topo-baixar')topoBaixar(t,a.dataset.k);
  return true}
