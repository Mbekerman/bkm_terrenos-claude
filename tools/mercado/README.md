# Mercado: retrato do monitor para o protótipo

O protótipo não fala com o Supabase. Ele lê `docs/dados/mercado.json`, um retrato do monitor de mercado (tabelas `public.im_*`, projeto BKM_Desenvolvimento_Imobiliario), com um item por empreendimento já somado e o **resumo do empreendimento** (unidades agrupadas em tipologias parecidas).

| Arquivo | O que é |
| --- | --- |
| `exportar.sql` | empreendimentos ativos no filtro do monitor, com estoque, soma de preço e área à venda, vendas do período e as unidades à venda (`dorm,área,preço`) para o filtro do mapa |
| `grupos.sql` | o resumo do empreendimento: os grupos abertos de cada empreendimento, já somados (unidades, estoque, vendas, preço e área do estoque e do primeiro preço, pequeno); roda em partes (`:faixa`) |
| `montar.py` | junta as duas saídas e os limites de `im_mercado_config` no `mercado.json` |

O agrupamento mora no banco do monitor (Mbekerman/bkm-monitor-mercado, migration `20261104120000_grupos.sql`; regra do Moisés de 4/nov/2026): `im_grupos`, `im_unidade_grupos` e `im_mercado_config`. A unidade já agrupada não muda de grupo; as novas entram pelo `im_agrupar`, que o coletor chama ao fim de cada rodada; `im_reagrupar` refaz tudo e guarda a ligação antiga (a venda fica com o grupo da época). Os testes da regra estão em `supabase/tests/regras.sql` de lá.

## Atualizar o retrato

1. Rodar `exportar.sql` no Supabase do monitor (só leitura) e salvar o objeto `dados` em `emps.json`.
2. Rodar `grupos.sql` com `:faixa` em partes (por exemplo `array['0','1','2','3']`, depois `4`–`7`, `8`–`b`, `c`–`f`) e juntar as linhas em `grupos.json` (`{id: g}`).
3. Salvar a linha de `im_mercado_config` em `config.json` e rodar `python3 tools/mercado/montar.py emps.json grupos.json config.json docs/dados/mercado.json`.
4. `python3 tools/prototipo/build.py`.

Leitura do VSO: vendas ÷ (vendas + à venda), contando só as vendas que o monitor viu (as de antes do monitor ficam fora). O período é o das mensais completas dos últimos 3 meses; enquanto houver só uma, é curto (em 4/nov/2026, 24/10 a 1/11).
