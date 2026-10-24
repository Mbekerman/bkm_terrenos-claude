"""Setores censitários do IBGE (Censo 2022) para o mapa e o banco.

Baixa do FTP do IBGE (guardando numa pasta de cache), confere e grava:
  docs/dados/setores-<municipio>-2022.json   arquivo do protótipo (geometria simplificada, ~1 m, e os valores do IBGE como vieram)
  tools/setores/saida/setores.csv            carga do banco: app.setores_censitarios (geometria oficial, sem simplificar)
  tools/setores/saida/valores.csv            carga do banco: app.setor_valores
  docs/dados/demografia-<municipio>-2022.json arquivo do protótipo: idade e sexo, domicílios por tamanho e espécie,
                                              vagos e de uso ocasional (variáveis de demografia.json, como vieram)
  tools/setores/saida/carga.sql              \\copy dos dois arquivos (psql)

Nada aqui calcula renda estimada: o arquivo leva os valores originais e a metodologia
(metodologia_renda.json); o protótipo e a visão app.setores_renda fazem a conta.

Uso: python3 tools/setores/gerar.py [--cache PASTA] [--municipio 3550308]
Precisa de: geopandas, pandas, openpyxl, shapely (pip install geopandas openpyxl).
"""
import argparse, csv, io, json, os, sys, urllib.request, zipfile

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.abspath(os.path.join(AQUI, '..', '..'))
FTP = 'https://ftp.ibge.gov.br/Censos/Censo_Demografico_2022'
ARQ = {
    # malha oficial com atributos básicos (V0001 pessoas, V0007 domicílios particulares ocupados)
    'malha': FTP + '/Agregados_por_Setores_Censitarios/malha_com_atributos/setores/gpkg/UF/{uf}/{uf}_setores_CD2022.gpkg',
    'renda': FTP + '/Agregados_por_Setores_Censitarios_Rendimento_do_Responsavel/Agregados_por_setores_renda_responsavel_BR_20260508_csv.zip',
    'demografia': FTP + '/Agregados_por_Setores_Censitarios/Agregados_por_Setor_csv/Agregados_por_setores_demografia_BR.zip',
    'domicilio1': FTP + '/Agregados_por_Setores_Censitarios/Agregados_por_Setor_csv/Agregados_por_setores_caracteristicas_domicilio1_BR_20261021.zip',
    'basico': FTP + '/Agregados_por_Setores_Censitarios/Agregados_por_Setor_csv/Agregados_por_setores_basico_BR_20260520.zip',
    'composicao': FTP + '/Microdados_e_Areas_de_Ponderacao/Documentacao/%c3%81reas%20de%20pondera%c3%a7%c3%a3o/Composi%c3%a7%c3%a3o%20das%20%c3%81reas%20de%20Pondera%c3%a7%c3%a3o.xlsx',
}
UFS = {'35': 'SP'}
# variáveis guardadas (código do IBGE → de onde vem)
VAR_MALHA = ['V0001', 'V0007']
VAR_RENDA = ['V06001', 'V06002', 'V06004', 'V06006']
DEMO = json.load(open(os.path.join(AQUI, 'demografia.json'), encoding='utf-8'))


def variaveis_demografia():
    """variáveis do IBGE que o perfil do entorno usa, na ordem do arquivo do protótipo"""
    vs = [DEMO['sexo']['homens'], DEMO['sexo']['mulheres']]
    for g in DEMO['idade']:
        vs += g['total'] + g['homens'] + g['mulheres']
    vs += list(DEMO['moradores'].values()) + [t['var'] for t in DEMO['tamanho']] + [e['var'] for e in DEMO['especie']]
    vs += [DEMO['usoOcasional'], DEMO['vagos']]
    return list(dict.fromkeys(vs))


VAR_DEMO = variaveis_demografia()
SITUACAO = {'': 'divulgado', 'X': 'sigilo', '.': 'sem_valor'}


def baixar(url, pasta):
    os.makedirs(pasta, exist_ok=True)
    nome = os.path.join(pasta, urllib.request.unquote(url.rsplit('/', 1)[1]))
    if not os.path.exists(nome):
        print('baixando', url)
        tmp = nome + '.parcial'
        with urllib.request.urlopen(url, timeout=600) as r, open(tmp, 'wb') as f:
            while True:
                b = r.read(1 << 20)
                if not b:
                    break
                f.write(b)
        os.replace(tmp, nome)
    return nome


def num(v):
    """valor do CSV do IBGE: número, ou None com a situação ('X' sigilo, '.' sem valor)."""
    v = (v or '').strip().strip('"')
    if v in ('X', '.'):
        return None, SITUACAO[v]
    return float(v), 'divulgado'


def ler_agregado(arq, mun):
    """CSV de um agregado por setor do IBGE (zip): {setor: {variável: texto}}, só o município; colunas em maiúsculas"""
    with zipfile.ZipFile(arq) as z:
        nome = [n for n in z.namelist() if n.lower().endswith('.csv')][0]
        txt = io.TextIOWrapper(z.open(nome), encoding='latin-1')
        r = csv.reader(txt, delimiter=';')
        cab = [c.strip().upper() for c in next(r)]
        return {l[0]: dict(zip(cab, l)) for l in r if l and l[0].startswith(mun)}


def anel(coords, q=1e5):
    """anel em inteiros de 1e-5 grau (lng, lat), o primeiro absoluto e os demais em diferença"""
    out, px, py = [], 0, 0
    pts = list(coords)[:-1]  # sem o ponto que repete o primeiro
    for x, y in pts:
        ix, iy = round(x * q), round(y * q)
        if out and ix == px and iy == py:
            continue
        out += [ix - px, iy - py]
        px, py = ix, iy
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--cache', default=os.path.join(AQUI, 'cache'))
    ap.add_argument('--municipio', default='3550308')
    ap.add_argument('--tolerancia', type=float, default=1.0, help='simplificação do arquivo do protótipo, em metros')
    a = ap.parse_args()
    import geopandas as gpd, pandas as pd
    mun = a.municipio
    uf = UFS[mun[:2]]
    met = json.load(open(os.path.join(AQUI, 'metodologia_renda.json'), encoding='utf-8'))

    malha = gpd.read_file(baixar(ARQ['malha'].format(uf=uf), a.cache), where=f"CD_MUN='{mun}'")
    malha = malha.sort_values('CD_SETOR').reset_index(drop=True)
    with zipfile.ZipFile(baixar(ARQ['renda'], a.cache)) as z:
        nome = [n for n in z.namelist() if n.lower().endswith('.csv')][0]
        txt = io.TextIOWrapper(z.open(nome), encoding='latin-1')
        renda = {l['CD_SETOR']: l for l in csv.DictReader(txt, delimiter=';') if l['CD_SETOR'].startswith(mun)}
    agreg = {}
    for k in ('demografia', 'domicilio1', 'basico'):
        for c, l in ler_agregado(baixar(ARQ[k], a.cache), mun).items():
            agreg.setdefault(c, {}).update(l)
    falta = [v for v in VAR_DEMO if not any(v in l for l in agreg.values())]
    if falta:
        sys.exit('ERRO: variáveis de demografia.json que não estão nos arquivos do IBGE: ' + ', '.join(falta))
    comp = pd.read_excel(baixar(ARQ['composicao'], a.cache), dtype=str)
    comp.columns = ['setor', 'municipio', 'ap', 'nome']
    comp = dict(comp[comp.municipio == mun][['setor', 'ap']].values)

    # ---------------- conferência ----------------
    cds = list(malha.CD_SETOR)
    erros = []
    if len(set(cds)) != len(cds):
        erros.append('setor repetido na malha')
    fora = set(renda) - set(cds)
    if fora:
        erros.append(f'{len(fora)} setores com renda e sem polígono')
    sem_ap = [c for c in cds if c not in comp]
    if sem_ap:
        erros.append(f'{len(sem_ap)} setores sem área de ponderação')
    sem_renda = [c for c in cds if c not in renda]
    pop_sem_renda = int(malha[malha.CD_SETOR.isin(sem_renda)].v0001.sum())
    sit = {'divulgado': 0, 'sigilo': 0, 'sem_valor': 0}
    vals = []
    for c in cds:
        if c in renda:
            v, s = num(renda[c]['V06004'])
            sit[s] += 1
            if v is not None:
                vals.append(v)
    vals.sort()
    print(f'setores: {len(cds)} | áreas de ponderação: {len(set(comp.values()))} | população: {int(malha.v0001.sum()):,} | domicílios ocupados: {int(malha.v0007.sum()):,}')
    print(f'V06004: {sit["divulgado"]} com valor, {sit["sigilo"]} em sigilo (X), {sit["sem_valor"]} sem valor (.), {len(sem_renda)} sem linha no arquivo (população somada {pop_sem_renda})')
    print(f'V06004 mín R$ {vals[0]:,.2f} | mediana R$ {vals[len(vals)//2]:,.2f} | máx R$ {vals[-1]:,.2f}')
    if pop_sem_renda:
        erros.append(f'setores sem linha de renda têm {pop_sem_renda} moradores')
    if erros:
        sys.exit('ERRO: ' + '; '.join(erros))

    # ---------------- arquivo do protótipo ----------------
    proj = malha.to_crs(31983)
    simp = proj.geometry.simplify(a.tolerancia, preserve_topology=True).to_crs(4674)
    area = proj.geometry.area
    dist = sorted(set(malha.NM_DIST))
    out = {'municipio': mun, 'censoAno': 2022, 'n': len(cds),
           'fontes': {'malha': ARQ['malha'].format(uf=uf), 'renda': ARQ['renda'], 'composicao': ARQ['composicao']},
           'nota': 'Valores do IBGE como vieram. sit: 0 divulgado, 1 sigilo (X), 2 sem valor (.), 3 sem linha no arquivo de renda (setor sem moradores).',
           'metodologia': met, 'distritos': dist,
           'cd': [], 'ap': [], 'di': [], 'area': [], 'pop': [], 'dom': [], 'v1': [], 'v2': [], 'v4': [], 'v6': [], 'sit': [], 'g': []}
    cod_sit = {'divulgado': 0, 'sigilo': 1, 'sem_valor': 2}
    for i, r in malha.iterrows():
        c = r.CD_SETOR
        out['cd'].append(c[len(mun):])
        out['ap'].append(int(comp[c][len(mun):]))
        out['di'].append(dist.index(r.NM_DIST))
        out['area'].append(round(area[i]))
        out['pop'].append(int(r.v0001))
        out['dom'].append(int(r.v0007))
        lr = renda.get(c)
        for k, campo in (('v1', 'V06001'), ('v2', 'V06002'), ('v4', 'V06004'), ('v6', 'V06006')):
            v = num(lr[campo])[0] if lr else None
            out[k].append(None if v is None else (round(v, 2) if k == 'v4' else (int(v) if float(v).is_integer() else v)))
        out['sit'].append(cod_sit[num(lr['V06004'])[1]] if lr else 3)
        g = simp[i]
        out['g'].append([anel(g.exterior.coords)] + [anel(h.coords) for h in g.interiors])
    dest = os.path.join(RAIZ, 'docs', 'dados', f'setores-{mun}-2022.json')
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    with open(dest, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
    print('protótipo:', dest, f'{os.path.getsize(dest)/1e6:.1f} MB')

    # perfil da população: as variáveis como vieram, na ordem de 'vars'; sigilo (X) e sem valor (.) viram null
    def inteiro(c, v):
        x = num(agreg.get(c, {}).get(v, '.'))[0]
        return None if x is None else int(x)
    demo = {'municipio': mun, 'censoAno': 2022, 'n': len(cds), 'cd': out['cd'], 'vars': VAR_DEMO,
            'fontes': {k: ARQ[k] for k in ('demografia', 'domicilio1', 'basico')},
            'nota': 'Valores do IBGE como vieram, um vetor por setor na ordem de vars (mesma ordem de setores do arquivo de setores); null = sigilo (X), sem valor (.) ou setor sem linha no arquivo.',
            'v': [[inteiro(c, v) for v in VAR_DEMO] for c in cds]}
    sem_linha = sum(1 for c in cds if c not in agreg)
    print(f'demografia: {len(VAR_DEMO)} variáveis, {sem_linha} setores sem linha nos agregados')
    dd = os.path.join(RAIZ, 'docs', 'dados', f'demografia-{mun}-2022.json')
    with open(dd, 'w', encoding='utf-8') as f:
        json.dump(demo, f, ensure_ascii=False, separators=(',', ':'))
    print('protótipo:', dd, f'{os.path.getsize(dd)/1e6:.1f} MB')

    # ---------------- carga do banco ----------------
    sd = os.path.join(AQUI, 'saida')
    os.makedirs(sd, exist_ok=True)
    with open(os.path.join(sd, 'setores.csv'), 'w', newline='', encoding='utf-8') as f:
        w = csv.writer(f)
        for i, r in malha.iterrows():
            w.writerow([r.CD_SETOR, comp[r.CD_SETOR], r.NM_DIST, r.AREA_KM2, 'SRID=4674;' + r.geometry.wkt])
    with open(os.path.join(sd, 'valores.csv'), 'w', newline='', encoding='utf-8') as f:
        w = csv.writer(f)
        for _, r in malha.iterrows():
            c = r.CD_SETOR
            for v in VAR_MALHA:
                w.writerow([c, v, int(r[v.lower()]), 'divulgado'])
            for v in VAR_DEMO:
                if v in agreg.get(c, {}):
                    x, s = num(agreg[c][v])
                    w.writerow([c, v, '' if x is None else x, s])
            lr = renda.get(c)
            if lr:
                for v in VAR_RENDA:
                    x, s = num(lr[v])
                    w.writerow([c, v, '' if x is None else x, s])
    with open(os.path.join(sd, 'carga.sql'), 'w', encoding='utf-8') as f:
        f.write("-- psql \"$URL_DO_BANCO\" -f tools/setores/saida/carga.sql  (com a chave de serviço; o front não escreve aqui)\n"
                "begin;\n"
                "create temp table _s (cd_setor text, area_ponderacao text, distrito text, area_km2 numeric, geom text);\n"
                "\\copy _s from 'tools/setores/saida/setores.csv' csv\n"
                "insert into app.setores_censitarios (cd_setor, area_ponderacao, distrito, area_km2, geom, fonte_geometria)\n"
                "  select cd_setor, area_ponderacao, distrito, area_km2, extensions.st_multi(extensions.st_transform(extensions.st_geomfromewkt(geom), 4326)),\n"
                f"         '{os.path.basename(ARQ['malha'].format(uf=uf))}' from _s\n"
                "  on conflict (cd_setor) do update set area_ponderacao = excluded.area_ponderacao, distrito = excluded.distrito, area_km2 = excluded.area_km2, geom = excluded.geom;\n"
                "create temp table _v (cd_setor text, variavel text, valor numeric, situacao text);\n"
                "\\copy _v from 'tools/setores/saida/valores.csv' csv\n"
                "insert into app.setor_valores (cd_setor, variavel, valor, situacao) select * from _v\n"
                "  on conflict (cd_setor, variavel) do update set valor = excluded.valor, situacao = excluded.situacao;\n"
                "commit;\n")
    print('banco:', sd)


if __name__ == '__main__':
    main()
