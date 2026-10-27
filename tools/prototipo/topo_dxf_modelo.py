"""Gera topo_modelo.dxf: o esqueleto DXF 2000 do topográfico preliminar.

O navegador não tem biblioteca de DXF; o proto_topo.js parte deste arquivo
(feito pelo ezdxf, que o AutoCAD aceita) e só troca os marcadores da imagem e
acrescenta as entidades (curvas, textos, pontos) antes do fim de ENTITIES.
DXF 2000 porque o R12 não tem imagem referenciada (IMAGE/IMAGEDEF).

    pip install ezdxf && python3 tools/prototipo/topo_dxf_modelo.py
"""
import os
import ezdxf

AQUI = os.path.dirname(os.path.abspath(__file__))
# [layer, cor ACI, tipo de linha] — os mesmos nomes do TOPO_LAYERS do proto_topo.js
LAYERS = [
    ('TERRENO', 4, 'CONTINUOUS'), ('FOLGA_30M', 8, 'DASHED'), ('MEDIDAS', 1, 'CONTINUOUS'),
    ('CURVA_MESTRA', 190, 'CONTINUOUS'), ('CURVA_INTERMEDIARIA_1', 102, 'CONTINUOUS'), ('CURVA_INTERMEDIARIA_2', 3, 'CONTINUOUS'),
    ('CURVA_INTERMEDIARIA_3', 80, 'CONTINUOUS'), ('CURVA_INTERMEDIARIA_4', 71, 'CONTINUOUS'), ('COTA_CURVA', 190, 'CONTINUOUS'),
    ('MALHA_COTAS', 9, 'CONTINUOUS'), ('LOTES', 252, 'CONTINUOUS'), ('LOTES_QUADRA', 7, 'CONTINUOUS'), ('NUMERO_LOTES', 7, 'CONTINUOUS'), ('QUADRAS', 8, 'CONTINUOUS'),
    ('CALCADAS', 4, 'CONTINUOUS'), ('EIXO_VIAS', 7, 'DASHED'), ('TEXTO_VIAS', 7, 'CONTINUOUS'),
    ('LARGURA_VIAS', 2, 'CONTINUOUS'), ('EDIFICACOES', 253, 'CONTINUOUS'), ('CORREGOS', 5, 'CONTINUOUS'),
    ('CORREGOS_CANALIZADOS', 5, 'DASHED'), ('MASSA_DAGUA', 5, 'CONTINUOUS'), ('CURSO_DAGUA_FAIXA', 141, 'DASHED'),
    ('MELHORAMENTO_VIARIO', 6, 'DASHED'), ('CURVAS_PREFEITURA', 8, 'CONTINUOUS'), ('IMAGEM', 7, 'CONTINUOUS'),
]

doc = ezdxf.new('R2000', setup=['linetypes'])
doc.units = ezdxf.units.M
doc.header['$INSUNITS'] = 6
doc.styles.add('BKM', font='arial.ttf')
# espessura de cada layer em centésimos de mm, nas convenções usuais de desenho
# topográfico (decisão do Moisés, 27/out/2026): divisa do terreno 0,50; mestra
# 0,35; intermediárias 0,13; quadras 0,25; lotes, calçadas e edificações 0,18;
# córregos 0,35; o resto 0,13 (textos sem espessura). O PDF usa as suas próprias.
ESPESSURA = {
    'TERRENO': 50, 'CURVA_MESTRA': 35, 'QUADRAS': 25, 'CORREGOS': 35, 'CORREGOS_CANALIZADOS': 25,
    'MASSA_DAGUA': 25, 'LOTES': 18, 'LOTES_QUADRA': 18, 'CALCADAS': 18, 'EDIFICACOES': 13,
    'MELHORAMENTO_VIARIO': 25, 'FOLGA_30M': 18, 'CURSO_DAGUA_FAIXA': 18,
}
for nome, cor, lt in LAYERS:
    doc.layers.add(nome, color=cor, linetype=lt, lineweight=ESPESSURA.get(nome, 13))
doc.header['$LWDISPLAY'] = 1  # mostra as espessuras na tela
msp = doc.modelspace()
# marcadores trocados pelo proto_topo.js (valores impossíveis de aparecer por acaso)
imgdef = doc.add_image_def(filename='__IMAGEM__.jpg', size_in_pixel=(7771, 7772))
msp.add_image(imgdef, insert=(911111.25, 922222.25), size_in_units=(7771 * 0.125, 7772 * 0.125), dxfattribs={'layer': 'IMAGEM'})
# vista do Model: sem ela o AutoCAD abre o Model centrado em 0,0 e parece vazio
doc.set_modelspace_vport(height=99999.25, center=(977777.25, 988888.25))
doc.header['$EXTMIN'] = (933333.25, 944444.25, 0)
doc.header['$EXTMAX'] = (955555.25, 966666.25, 0)
saida = os.path.join(AQUI, 'topo_modelo.dxf')
doc.saveas(saida)
print(saida, os.path.getsize(saida))
