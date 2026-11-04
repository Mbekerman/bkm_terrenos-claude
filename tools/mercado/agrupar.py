"""Resumo do empreendimento: agrupa as unidades do monitor de mercado em tipologias parecidas.

Regra do Moisés (4/nov/2026), só na leitura: nada do que foi coletado muda.

1. Semelhança: só ficam juntas unidades com os mesmos dormitórios, a mesma quantidade de vagas (com e sem vaga nunca
   se misturam) e a mesma marca de programa social do Órulo. No monitor essa marca é do empreendimento, então dentro
   de um empreendimento ela não separa nada; separa na soma do entorno.
2. Área: começa pela área mais frequente (a planta-tipo; no empate, a mais perto da mediana de todas) como mediana, junta as unidades a até ±area_mediana_pct dela,
   recalcula a mediana e repete até o grupo parar de mudar; tira o grupo e recomeça com as que sobraram.
3. Preço por m², pelo preco_primeiro (o primeiro preço visto, que não muda):
   - no mesmo andar, unidades a mais de salto_preco_mesmo_andar_pct uma da outra ficam em grupos diferentes
     (frente e fundos, por exemplo): cada andar se divide em faixas;
   - entre andares, as faixas são ordenadas pelo R$/m² típico (a mediana) e uma faixa a mais de
     salto_preco_andar_pct acima da anterior abre um grupo novo; uma rampa pequena e contínua fica junta;
   - duas faixas do mesmo andar nunca caem no mesmo grupo.
4. Casos especiais: unidade sem preço entra no grupo das unidades do mesmo andar no mesmo bloco de área (o maior, se
   houver mais de um); sem nenhuma, no maior grupo do bloco. Área nula fica fora do agrupamento. Grupo com menos de
   min_unidades_grupo unidades só junta a um grupo que difere dele apenas na área (mesma semelhança, outro bloco de
   área e R$/m² a até salto_preco_andar_pct), o de área mais próxima; sem nenhum, fica separado. Nos dois casos fica
   marcado pequeno (decisão do Moisés, 4/nov/2026).

A estabilidade (unidade já agrupada não muda de grupo; "Reagrupar" do administrador) pede guardar o grupo de cada
unidade no banco; este retrato recalcula tudo a cada exportação.

Uso: python3 tools/mercado/agrupar.py EMPS.json UNIDADES.json docs/dados/mercado.json
  EMPS.json: saída de tools/mercado/exportar.sql (o objeto "dados")
  UNIDADES.json: {id do empreendimento: texto de tools/mercado/unidades.sql}
"""
import json
import os
import statistics
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))
CFG = json.load(open(os.path.join(AQUI, 'config.json'), encoding='utf-8'))


def _n(s, f=float):
    return None if s == '' else f(s)


def ler_unidades(texto):
    """'torre,andar,dorm,vagas,area,p1,situacao,preco,vendida' separadas por ';'."""
    us = []
    for s in (texto or '').split(';'):
        if not s:
            continue
        t, an, d, vg, a, p1, sit, pv, vj = s.split(',')
        us.append({'torre': t, 'andar': _n(an, int), 'dorm': _n(d, int), 'vagas': _n(vg, int), 'area': _n(a),
                   'p1': _n(p1), 'sit': sit, 'preco': _n(pv), 'vendida': vj == '1'})
    return us


def blocos_area(us, pct):
    """Área: mediana iterativa a partir da planta-tipo. Devolve listas de unidades (área nula fica fora)."""
    resto = [u for u in us if u['area']]
    blocos = []
    while resto:
        freq = {}
        for u in resto:
            freq[u['area']] = freq.get(u['area'], 0) + 1
        topo = max(freq.values())
        geral = statistics.median(u['area'] for u in resto)
        # planta-tipo: a área mais frequente; no empate, a mais perto da mediana de todas (depois, a menor)
        med = min((a for a in freq if freq[a] == topo), key=lambda a: (abs(a - geral), a))
        grupo = None
        for _ in range(50):
            novo = [u for u in resto if abs(u['area'] - med) <= med * pct / 100 + 1e-9]
            ids = {id(u) for u in novo}
            if grupo is not None and ids == {id(u) for u in grupo}:
                break
            grupo = novo
            med = statistics.median(u['area'] for u in grupo)
        blocos.append(grupo)
        ids = {id(u) for u in grupo}
        resto = [u for u in resto if id(u) not in ids]
    return blocos


def grupos_preco(bloco, cfg=CFG):
    """Divide um bloco de área pelo R$/m² do primeiro preço. Devolve [{'us': [...], 'pequeno': bool}]."""
    s_andar, s_mesmo = cfg['salto_preco_andar_pct'], cfg['salto_preco_mesmo_andar_pct']
    com = [u for u in bloco if u['p1']]
    sem = [u for u in bloco if not u['p1']]
    for u in com:
        u['_m2'] = u['p1'] / u['area']
    # faixas de cada andar (mesmo andar: salto acima de s_mesmo separa); sem andar, cada unidade é uma faixa
    faixas = []
    por_andar = {}
    for u in com:
        if u['andar'] is None:
            faixas.append({'andar': None, 'us': [u]})
        else:
            por_andar.setdefault((u['torre'], u['andar']), []).append(u)
    for (t, an), xs in por_andar.items():
        xs.sort(key=lambda u: u['_m2'])
        f = {'andar': (t, an), 'us': [xs[0]]}
        for u in xs[1:]:
            if u['_m2'] > f['us'][-1]['_m2'] * (1 + s_mesmo / 100):
                faixas.append(f)
                f = {'andar': (t, an), 'us': []}
            f['us'].append(u)
        faixas.append(f)
    for f in faixas:
        f['m2'] = statistics.median(u['_m2'] for u in f['us'])
    faixas.sort(key=lambda f: (f['m2'], str(f['andar'])))
    grupos = []
    for f in faixas:
        g = grupos[-1] if grupos else None
        if g is None or f['m2'] > g['ult'] * (1 + s_andar / 100) or (f['andar'] is not None and f['andar'] in g['andares']):
            g = {'us': [], 'andares': set(), 'ult': f['m2']}
            grupos.append(g)
        g['us'] += f['us']
        g['ult'] = f['m2']
        if f['andar'] is not None:
            g['andares'].add(f['andar'])
    # sem preço: grupo do mesmo andar (o maior); senão o maior do bloco
    for u in sem:
        if not grupos:
            grupos.append({'us': [], 'andares': set(), 'ult': None})
        mesmos = [g for g in grupos if u['andar'] is not None and (u['torre'], u['andar']) in g['andares']]
        alvo = max(mesmos or grupos, key=lambda g: len(g['us']))
        alvo['us'].append(u)
    return [{'us': g['us'], 'pequeno': False} for g in grupos if g['us']]


def _m2_medio(g):
    xs = [u for u in g['us'] if u['p1']]
    return sum(u['p1'] for u in xs) / sum(u['area'] for u in xs) if xs else None


def _area_med(g):
    return statistics.median(u['area'] for u in g['us'])


def juntar_pequenos(gs, cfg=CFG):
    """Grupo com menos de min_unidades_grupo junta só a um grupo que difere dele apenas na área: outro bloco de área,
    com R$/m² (primeiro preço) a até salto_preco_andar_pct. Entre os que servem, o de área mais próxima. Sem nenhum,
    fica sozinho. Nos dois casos fica marcado pequeno. Todos os grupos de gs são da mesma semelhança."""
    minimo, salto = cfg['min_unidades_grupo'], cfg['salto_preco_andar_pct']
    feitos = set()
    while True:
        pq = [g for g in gs if len(g['us']) < minimo and id(g) not in feitos]
        if not pq:
            break
        g = min(pq, key=lambda x: (len(x['us']), _area_med(x)))
        m = _m2_medio(g)

        def serve(o):
            if o is g or o['bloco'] == g['bloco']:
                return False
            mo = _m2_medio(o)
            if m is None or mo is None:
                return True
            return max(m, mo) <= min(m, mo) * (1 + salto / 100) + 1e-9
        alvos = [o for o in gs if serve(o)]
        g['pequeno'] = True
        if not alvos:
            feitos.add(id(g))
            continue
        alvo = min(alvos, key=lambda o: (abs(_area_med(o) - _area_med(g)), -len(o['us'])))
        alvo['us'] += g['us']
        alvo['pequeno'] = True
        gs.remove(g)
    return gs


def agrupar(us, prog=None, cfg=CFG):
    """Grupos do empreendimento, ordenados por dormitórios, vagas, área e R$/m²."""
    sem = {}
    for u in us:
        sem.setdefault((u['dorm'], u['vagas'], u.get('prog', prog)), []).append(u)
    saida = []
    for (d, vg, pg), xs in sem.items():
        gs = []
        for i, bloco in enumerate(blocos_area(xs, cfg['area_mediana_pct'])):
            for g in grupos_preco(bloco, cfg):
                g.update(dorm=d, vagas=vg, prog=pg, bloco=i)
                gs.append(g)
        saida += juntar_pequenos(gs, cfg)
    saida.sort(key=lambda g: (g['dorm'] if g['dorm'] is not None else 99, g['vagas'] if g['vagas'] is not None else 99,
                              min(u['area'] for u in g['us']), _m2_medio(g) or 0))
    return saida


def resumo(g):
    """Linha do quadro: dorm, vagas, área mín e máx, unidades, à venda, vendas, soma de preço e área à venda, pequeno."""
    est = [u for u in g['us'] if u['sit'] in ('d', 'r')]
    ep = [u for u in est if u['preco']]
    p1 = [u for u in g['us'] if u['p1']]
    return [g['dorm'], g['vagas'], min(u['area'] for u in g['us']), max(u['area'] for u in g['us']), len(g['us']),
            len(est), sum(1 for u in g['us'] if u['vendida']),
            round(sum(u['preco'] for u in ep)) if ep else None, round(sum(u['area'] for u in ep), 2) if ep else None,
            round(sum(u['p1'] for u in p1)) if p1 else None, round(sum(u['area'] for u in p1), 2) if p1 else None,
            1 if g['pequeno'] else 0]


CAMPOS_GRUPO = ['dorm', 'vagas', 'area_min', 'area_max', 'unidades', 'estoque', 'vendas', 'preco_estoque', 'area_estoque',
                'preco_primeiro', 'area_primeiro', 'pequeno']


def main(emps_arq, un_arq, saida):
    dados = json.load(open(emps_arq, encoding='utf-8'))
    uns = json.load(open(un_arq, encoding='utf-8'))
    c = dados['campos']
    ip, iid = c.index('programa_social'), c.index('id')
    for e in dados['emps']:
        gs = agrupar(ler_unidades(uns.get(e[iid])), e[ip])
        e.append([resumo(g) for g in gs])
    dados['campos'] = c + ['grupos']
    dados['campos_grupo'] = CAMPOS_GRUPO
    dados['agrupamento'] = CFG
    json.dump(dados, open(saida, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))


if __name__ == '__main__':
    main(*sys.argv[1:4])
