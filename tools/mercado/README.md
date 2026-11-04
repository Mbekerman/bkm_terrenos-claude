# Mercado: retrato do monitor para o protótipo

O protótipo não fala com o Supabase. Ele lê `docs/dados/mercado.json`, um retrato do monitor de mercado (tabelas `public.im_*`, projeto BKM_Desenvolvimento_Imobiliario), com um item por empreendimento já somado e o **resumo do empreendimento** (unidades agrupadas em tipologias parecidas).

| Arquivo | O que é |
| --- | --- |
| `exportar.sql` | empreendimentos ativos no filtro do monitor, com estoque, soma de preço e área à venda, vendas do período e as unidades à venda (`dorm,área,preço`) para o filtro do mapa |
| `unidades.sql` | todas as unidades residenciais de cada empreendimento (torre, andar, dormitórios, vagas, área, primeiro preço, situação, preço vigente, vendida no período), para o agrupamento; roda em partes (`:faixa`) |
| `agrupar.py` | a regra do resumo do empreendimento (decisão do Moisés, 4/nov/2026) e a montagem do `mercado.json` |
| `config.json` | parâmetros da regra (no banco, `mercado_config`): `area_mediana_pct` 3, `salto_preco_andar_pct` 3, `salto_preco_mesmo_andar_pct` 2, `min_unidades_grupo` 3 |
| `test_agrupar.py` | os testes mínimos da regra |

## Atualizar o retrato

1. Rodar `exportar.sql` no Supabase do monitor (só leitura) e salvar o objeto `dados` em `emps.json`.
2. Rodar `unidades.sql` para cada `:faixa` (`'0'` a `'f'`) e juntar as linhas em `unidades.json` (`{id: u}`).
3. `python3 tools/mercado/agrupar.py emps.json unidades.json docs/dados/mercado.json`
4. `python3 -m unittest tools/mercado/test_agrupar.py` e `python3 tools/prototipo/build.py`.

Leitura do VSO: vendas ÷ (vendas + à venda), contando só as vendas que o monitor viu (as de antes do monitor ficam fora). O período é o das mensais completas dos últimos 3 meses; enquanto houver só uma, é curto (em 4/nov/2026, 24/10 a 1/11).

O retrato recalcula os grupos a cada exportação. A estabilidade pedida (unidade já agrupada não muda de grupo; "Reagrupar" do administrador; venda antiga mantém o grupo da época) precisa guardar o grupo de cada unidade no banco e entra quando o agrupamento for para o Supabase.
