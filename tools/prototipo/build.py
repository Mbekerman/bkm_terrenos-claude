"""Gera o protótipo a partir das fontes desta pasta.

Saídas:
  docs/prototipo.html                  versão do Railway (documento completo, chave do Google injetada pelo Caddy)
  tools/prototipo/saida/bkm-terrenos.html  versão para o artifact do claude.ai e para os testes
"""
import os, re
AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.abspath(os.path.join(AQUI, '..', '..'))
def ler(n): return open(os.path.join(AQUI, n), encoding='utf-8').read()
css = ler('bkm.pre-painel.css') + ler('painel.css')
lpath = os.path.join(AQUI, 'libs', 'l', 'leaflet.css')
lcss = open(lpath, encoding='utf-8').read() if os.path.exists(lpath) else ''
if not lcss: print('aviso: libs/l/leaflet.css ausente (baixe do branch libs-prototipo); o CSS do Leaflet fica de fora')
lcss = re.sub(r'url\([^)]*\)', 'none', lcss)  # ícones padrão do Leaflet não são usados (pins próprios)
body = ler('proto_body.html'); js = ler('proto.js')
mod = ler('proto_mod.js') + '\n' + ler('proto_gmap.js') + '\n' + ler('proto_painel.js') + '\n' + ler('proto_funil.js') + '\n' + ler('proto_lote.js') + '\n' + ler('proto_geosampa.js') + '\n' + ler('proto_geosanja.js') + '\n' + ler('proto_novo.js')
assert js.rstrip().endswith('render();\n})();'), 'fim inesperado'
i = js.rstrip().rindex('render();\n})();')
js = js[:i] + mod + '\n' + js[i:]
libs = '<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js"></script>\n<script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"></script>\n'
FONT = '<link rel="preconnect" href="https://fonts.googleapis.com">\n<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Google+Sans+Flex:opsz,wght@6..144,1..1000&display=swap">\n'
html = '<title>BKM Terrenos</title>\n<meta name="claude:viewport-fit-sides" content="cover">\n' + FONT + '<style>' + lcss + '\n' + css + '</style>' + body + libs + '<script>' + js + '</script>'
os.makedirs(os.path.join(AQUI, 'saida'), exist_ok=True)
open(os.path.join(AQUI, 'saida', 'bkm-terrenos.html'), 'w', encoding='utf-8').write(html)
doc = ('<!doctype html>\n<html lang="pt-BR">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
       '<meta name="gmaps-key" content="{% env "GOOGLE_MAPS_KEY" %}">\n<meta name="bkm-ambiente" content="{% env "AMBIENTE" %}">\n'
       + html.replace('<style>', '</head>\n<body>\n<style>', 1).replace('<title>BKM Terrenos</title>\n<meta name="claude:viewport-fit-sides" content="cover">\n', '<title>BKM Terrenos</title>\n', 1)
       + '\n</body>\n</html>\n')
open(os.path.join(RAIZ, 'docs', 'prototipo.html'), 'w', encoding='utf-8').write(doc)
# estilos do front React: mesmos tokens do protótipo (preserva as 2 últimas linhas do arquivo)
st = os.path.join(RAIZ, 'apps', 'web', 'src', 'styles.css')
cauda = open(st, encoding='utf-8').read().splitlines(keepends=True)[-2:]
open(st, 'w', encoding='utf-8').write(css + '\n' + ''.join(cauda))
print(len(html))
