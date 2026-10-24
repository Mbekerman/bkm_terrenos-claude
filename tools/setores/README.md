# Setores censitários (IBGE, Censo 2022)

`gerar.py` baixa do FTP do IBGE a malha oficial dos setores, o agregado de renda do responsável e a composição oficial das áreas de ponderação, confere (setor repetido, renda sem polígono, setor sem área de ponderação, moradores sem linha de renda) e grava:

- `docs/dados/setores-<município>-2022.json`: arquivo do protótipo (geometria simplificada a ~1 m, valores do IBGE como vieram e a metodologia);
- `saida/setores.csv`, `saida/valores.csv`, `saida/carga.sql`: carga do banco (`app.setores_censitarios`, `app.setor_valores`) com a geometria oficial.

```bash
pip install geopandas openpyxl
python3 tools/setores/gerar.py --cache /algum/lugar   # ~600 MB de downloads na primeira vez
```

`metodologia_renda.json` é a fonte única da metodologia, das 16 faixas e das cores. Mudou a PNAD ou o fator: troque aqui e na migration `20261015000900_setores.sql` (o teste do banco acusa se as duas divergirem), rode o `gerar.py` e o `build.py` do protótipo.

`demografia.json` define o perfil da população do entorno (ficha): os grupos de idade (somas exatas dos grupos do IBGE), tamanho e espécie dos domicílios e as variáveis usadas; o `gerar.py` baixa os agregados de demografia, domicílio (parte 1) e básico e grava `docs/dados/demografia-<município>-2022.json`, com as variáveis como vieram (sigilo = null).

`metodologia_densidade.json` é a fonte das 10 faixas e das cores da densidade demográfica bruta (pessoas ÷ área do setor). Mudou uma faixa: troque aqui e na migration (o teste acusa) e rode o `build.py`; o arquivo de setores não muda.

Nada aqui inventa dado: setor em sigilo fica nulo com a situação, e a renda familiar é sempre chamada de estimada.
