"""Índice das plantas de loteamentos aprovados do GeoSanja (São José dos Campos).

O grupo "14 - LOTEAMENTOS APROVADOS" do GeoSanja tem uma camada raster por folha de planta escaneada (513 em nov/2026),
sem o retângulo de cada uma na lista de camadas. Este script pergunta o retângulo de cada folha (/v1/camada/capabilities/info)
e grava apps/web/src/novo/loteamentos-sjc.json: [[id da camada no GeoServer, título, [oeste, sul, leste, norte]], ...].
A ficha usa o índice para achar a planta do loteamento onde o terreno está ("Planta do loteamento", ficha/Partes.tsx).

Rodar de novo quando a prefeitura publicar plantas novas:  python3 -I tools/geosanja/loteamentos.py
"""
import json, os, sys, urllib.request, concurrent.futures as cf

B = 'https://geo.sjc.sp.gov.br/v1/'
GRUPO = 193  # 14 - LOTEAMENTOS APROVADOS
SAIDA = os.path.join(os.path.dirname(__file__), '..', '..', 'apps', 'web', 'src', 'novo', 'loteamentos-sjc.json')

tk = json.load(urllib.request.urlopen(B + 'autenticar?token=VISITANTE', timeout=60))['token']
H = {'Authorization': 'Bearer ' + tk}
cfg = json.load(urllib.request.urlopen(urllib.request.Request(B + 'config', headers=H), timeout=120))
cams = []
def walk(x):
    if isinstance(x, dict):
        if x.get('grupoId') == GRUPO and 'geoserverId' in x: cams.append(x)
        for v in x.values(): walk(v)
    elif isinstance(x, list):
        for i in x: walk(i)
walk(cfg)

def bbox(c):
    u = B + 'camada/capabilities/info?layerId=' + str(c['id'])
    try:
        j = json.load(urllib.request.urlopen(urllib.request.Request(u, headers=H), timeout=60))
        b = j['bbox']
        return [c['geoserverWorkspace'] + ':' + c['geoserverId'], c['titulo'].strip(), [round(b['minx'], 6), round(b['miny'], 6), round(b['maxx'], 6), round(b['maxy'], 6)]]
    except Exception as e:
        print('sem retângulo:', c['titulo'], e, file=sys.stderr)
        return None

with cf.ThreadPoolExecutor(8) as ex:
    out = [r for r in ex.map(bbox, cams) if r]
out.sort(key=lambda r: r[1])
with open(SAIDA, 'w') as f:
    json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
print(len(cams), 'camadas,', len(out), 'com retângulo ->', os.path.normpath(SAIDA))
