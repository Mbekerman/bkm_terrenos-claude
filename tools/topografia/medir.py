# Mede KMZs pelo laser 2020 do GeoSampa (São Paulo), com a mesma conta da ficha:
# declividade média, inclinação do plano, terra mexida e desnível. Usado na calibração
# da classificação topográfica (4/nov/2026). Uso: python3 -I tools/topografia/medir.py a.kmz b.kmz
# Precisa de: pip install laspy lazrs pyproj shapely numpy. Folhas guardadas em CACHE.
import sys,re,zipfile,io,json,os,urllib.request,urllib.parse
import numpy as np, laspy
from pyproj import Transformer
from shapely.geometry import Polygon, Point
from shapely import contains_xy
CACHE=os.environ.get('CACHE','/tmp/laser-cache'); os.makedirs(CACHE,exist_ok=True)
tr=Transformer.from_crs('EPSG:4326','EPSG:31983',always_xy=True)
def kml_coords(p):
    z=zipfile.ZipFile(p); k=[n for n in z.namelist() if n.endswith('.kml')][0]; s=z.read(k).decode('utf8','replace')
    polys=[]
    for m in re.findall(r'<coordinates>(.*?)</coordinates>',s,re.S):
        pts=[tuple(map(float,c.split(',')[:2])) for c in m.split()]
        if len(pts)>=3: polys.append([tr.transform(lo,la) for lo,la in pts])
    return polys
def get(url):
    r=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0'})
    return urllib.request.urlopen(r,timeout=120).read()
def folha(q):
    f=f'{CACHE}/{q}.laz'
    if not os.path.exists(f):
        z=zipfile.ZipFile(io.BytesIO(get('https://novogeosampa.prefeitura.sp.gov.br/Download/File/125?key=cd_quadricula&value='+urllib.parse.quote(q))))
        n=[x for x in z.namelist() if x.lower().endswith('.laz')][0]; open(f,'wb').write(z.read(n))
    return laspy.read(f)
def medir(path):
    P=kml_coords(path); poly=Polygon(P[0]); area=poly.area
    s=2 if area>40000 else 1; m=4
    x0,y0,x1,y1=[round(v) for v in (poly.bounds[0]-m,poly.bounds[1]-m,poly.bounds[2]+m,poly.bounds[3]+m)]
    u='https://geoserver.geosampa.prefeitura.sp.gov.br/geoserver/geoportal/ows?'+urllib.parse.urlencode({'service':'WFS','version':'2.0.0','request':'GetFeature','outputFormat':'application/json','srsName':'EPSG:31983','typeNames':'geoportal:quadricula_folha_mdt_mds_2020','bbox':f'{x0},{y0},{x1},{y1},urn:ogc:def:crs:EPSG::31983'})
    fol=[f['properties']['cd_quadricula'] for f in json.loads(get(u))['features']]
    nx=int((x1-x0)/s)+1; ny=int((y1-y0)/s)+1; S=np.zeros((ny,nx)); N=np.zeros((ny,nx))
    for q in fol:
        L=folha(q); x=np.asarray(L.x); y=np.asarray(L.y); z=np.asarray(L.z)
        gi=np.round((x-x0)/s).astype(int); gj=np.round((y-y0)/s).astype(int); k=(gi>=0)&(gj>=0)&(gi<nx)&(gj<ny)
        np.add.at(S,(gj[k],gi[k]),z[k]); np.add.at(N,(gj[k],gi[k]),1)
    Z=np.where(N>0,S/np.maximum(N,1),np.nan)
    # preenche buracos e suaviza (como o sistema)
    for _ in range(40):
        if not np.isnan(Z).any(): break
        P2=np.pad(Z,1,constant_values=np.nan); st=np.stack([P2[1+b:1+b+ny,1+a:1+a+nx] for b in (-1,0,1) for a in (-1,0,1)])
        with np.errstate(all="ignore"): mn=np.nanmean(st,axis=0)
        Z=np.where(np.isnan(Z),mn,Z)
    w=np.array([1,2,1,2,4,2,1,2,1],float)
    for _ in range(4):
        P2=np.pad(Z,1,constant_values=np.nan); st=np.stack([P2[1+b:1+b+ny,1+a:1+a+nx] for b in (-1,0,1) for a in (-1,0,1)])
        ww=w[:,None,None]*~np.isnan(st); Z=np.nansum(np.nan_to_num(st)*w[:,None,None],axis=0)/ww.sum(0)
    XX,YY=np.meshgrid(x0+np.arange(nx)*s,y0+np.arange(ny)*s)
    inn=contains_xy(poly,XX,YY)&~np.isnan(Z)
    X=XX[inn];Y=YY[inn];ZZ=Z[inn]; A=np.c_[X-X.mean(),Y-Y.mean(),np.ones_like(X)]
    c,*_=np.linalg.lstsq(A,ZZ,rcond=None); res=ZZ-A@c
    gy,gx=np.gradient(Z,s); dec=np.hypot(gx,gy)[inn]*100
    incl=np.hypot(c[0],c[1])*100; terra=np.abs(res).mean()
    return dict(nome=os.path.basename(path),area=round(area),incl=round(incl,2),terra=round(terra,3),desnivel=round(ZZ.max()-ZZ.min(),2),
                p95res=round(np.percentile(np.abs(res),95),2),decl_media=round(float(np.mean(dec)),1),decl_p90=round(float(np.percentile(dec,90)),1),acima15=round(float((dec>15).mean()*100)),acima30=round(float((dec>30).mean()*100)),n=int(inn.sum()),folhas=fol)
if __name__=='__main__':
    for p in sys.argv[1:]:
        try: print(json.dumps(medir(p),ensure_ascii=False))
        except Exception as e: print(json.dumps({'nome':p,'erro':repr(e)}))
