"""Monta docs/dados/mercado.json: os empreendimentos (exportar.sql) com o resumo do empreendimento (grupos.sql).

Os grupos vêm prontos do banco do monitor (im_grupos e im_unidade_grupos; regra do Moisés de 4/nov/2026, estável:
unidade já agrupada não muda de grupo). Os limites ficam em im_mercado_config.

Uso: python3 tools/mercado/montar.py EMPS.json GRUPOS.json CONFIG.json docs/dados/mercado.json
  EMPS.json: saída de exportar.sql (o objeto "dados")
  GRUPOS.json: {id do empreendimento: g de grupos.sql}
  CONFIG.json: a linha de im_mercado_config
"""
import json
import sys

CAMPOS_GRUPO = ['dorm', 'vagas', 'area_min', 'area_max', 'unidades', 'estoque', 'vendas', 'preco_estoque', 'area_estoque',
                'preco_primeiro', 'area_primeiro', 'pequeno']
PARAMS = ['area_mediana_pct', 'salto_preco_andar_pct', 'salto_preco_mesmo_andar_pct', 'min_unidades_grupo']


def main(emps_arq, grupos_arq, cfg_arq, saida):
    dados = json.load(open(emps_arq, encoding='utf-8'))
    grupos = json.load(open(grupos_arq, encoding='utf-8'))
    cfg = json.load(open(cfg_arq, encoding='utf-8'))
    iid = dados['campos'].index('id')
    for e in dados['emps']:
        e.append(grupos.get(e[iid]) or [])
    dados['campos'] = dados['campos'] + ['grupos']
    dados['campos_grupo'] = CAMPOS_GRUPO
    dados['agrupamento'] = {k: cfg[k] for k in PARAMS}
    json.dump(dados, open(saida, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))


if __name__ == '__main__':
    main(*sys.argv[1:5])
