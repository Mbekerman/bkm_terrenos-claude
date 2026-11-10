# Provas da avaliação de segurança (8/nov/2026)

Scripts SQL que reproduzem os achados de [../banco.md](../banco.md) num Postgres 16 temporário, sem tocar no Supabase. Cada `.sql` tem ao lado a saída `.out` do dia da avaliação.

```bash
bash docs/tecnico/seguranca/provas/subir.sh          # sobe o banco na porta 54340 (precisa de postgresql-16 e postgresql-16-postgis-3, rodando como root)
cd docs/tecnico/seguranca/provas                      # os scripts fazem \i comum.sql, rode daqui
psql -h /tmp -p 54340 -U postgres -d postgres -q -f p04_auditoria_vaza.sql
```

`comum.sql` define `pg_temp.como(email)`, que simula o usuário logado como o shim do `run.sh`. Quando um achado for corrigido, a prova correspondente deve passar a falhar (ou mostrar 0 linhas): transforme-a num teste em `supabase/tests/regras.sql` e marque o achado como resolvido em `../../seguranca.md`.

| Script | Achado |
| --- | --- |
| `p01_tarefa_datas` | BD-M6 data de conclusão vinda do cliente |
| `p02_cartao_restrito` | BD-M2 oráculo sobre cartão Restrito |
| `p03_reuniao_convite` | BD-M4 convite da Agenda pela conta do organizador |
| `p04_auditoria_vaza` | BD-M1 log mostra o que a RLS esconde |
| `p05_metadados_usuario` | BD-M3 nome e foto trocados pelo próprio usuário |
| `p06*` | BD-M7 quadro de outra empresa apontando para terreno da BKM |
| `fuzz_intruso*`, `fuzz_deputado`, `fuzz_anon` | todas as funções chamadas por intrusos (outra empresa, `anon`); base de BD-B1 e BD-B2 |
