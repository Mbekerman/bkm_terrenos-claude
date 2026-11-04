"""Perímetros de qualificação ambiental (PA 1 a PA 13) da Quota Ambiental de São Paulo.

Fonte: Mapa 3 da Lei 16.402/2016 (LPUOS), em SHP, publicado pela SMUL em
gestaourbana.prefeitura.sp.gov.br (o GeoSampa não tem esta camada). O SHP vem
por quadra (62 mil polígonos, SAD69 UTM 23S, campo PQA); aqui ele é juntado por
PA, as ruas entre quadras são fechadas (12 m), simplificado em 4 m e passado
para WGS84. Saída: docs/dados/quota-ambiental-3550308.json, lida pelo
protótipo para dizer a qual PA o terreno pertence (pela poligonal).

Uso: python3 tools/parametros/gerar_quota_ambiental.py [pasta de trabalho]
Precisa de: pip install pyshp shapely pyproj
"""
import io, json, os, sys, urllib.request, zipfile
import numpy as np, pyproj, shapefile, shapely
from shapely.geometry import mapping, shape
from shapely.ops import unary_union

URL = 'https://gestaourbana.prefeitura.sp.gov.br/wp-content/uploads/2015/06/QA.zip'
RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SAIDA = os.path.join(RAIZ, 'docs', 'dados', 'quota-ambiental-3550308.json')

def main():
    pasta = sys.argv[1] if len(sys.argv) > 1 else os.path.join(RAIZ, 'tools', 'parametros', '.qa')
    os.makedirs(pasta, exist_ok=True)
    if not os.path.exists(os.path.join(pasta, 'QA.shp')):
        zipfile.ZipFile(io.BytesIO(urllib.request.urlopen(URL, timeout=300).read())).extractall(pasta)
    r = shapefile.Reader(os.path.join(pasta, 'QA.shp'))
    por = {}
    for sr in r.iterShapeRecords():
        g = shape(sr.shape.__geo_interface__)
        por.setdefault(sr.record[0].strip(), []).append(g if g.is_valid else g.buffer(0))
    # SAD69 (elipsoide GRS67 truncado) para WGS84
    src = pyproj.CRS('+proj=utm +zone=23 +south +ellps=aust_SA +towgs84=-67.35,3.88,-38.22 +units=m')
    tr = pyproj.Transformer.from_crs(src, 'EPSG:4326', always_xy=True)
    feats = []
    for k, v in sorted(por.items(), key=lambda x: int(x[0].split()[1])):
        u = unary_union([g.buffer(12, quad_segs=2) for g in v]).buffer(-12, quad_segs=2).simplify(4)
        limpa = lambda p: shapely.Polygon(p.exterior, [h for h in p.interiors if shapely.Polygon(h).area > 10000])
        ps = [limpa(p) for p in (u.geoms if u.geom_type == 'MultiPolygon' else [u]) if p.area > 2000]
        w = shapely.transform(shapely.MultiPolygon(ps), lambda c: np.column_stack(tr.transform(c[:, 0], c[:, 1])))
        feats.append({'type': 'Feature', 'properties': {'pa': k.replace(' ', '-')}, 'geometry': mapping(shapely.set_precision(w, 1e-5))})
        print(k, len(ps), flush=True)
    json.dump({'fonte': 'Lei 16.402/2016, Mapa 3 (Quota Ambiental): perímetros de qualificação ambiental, SMUL (gestaourbana.prefeitura.sp.gov.br)',
               'type': 'FeatureCollection', 'features': feats}, open(SAIDA, 'w'), separators=(',', ':'))
    print(SAIDA, os.path.getsize(SAIDA))

if __name__ == '__main__':
    main()
