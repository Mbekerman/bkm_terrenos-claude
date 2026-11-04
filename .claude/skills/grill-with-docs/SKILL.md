---
name: grill-with-docs
description: A relentless interview to sharpen a plan or design, which also creates docs (ADR's and glossary) as we go. Use when the user asks to be grilled ("me sabatine", "grill-with-docs") about a plan or design in this repo.
---

Call the Skill tool twice, for "grilling" and "domain-modeling".

## Neste projeto (BKM Terrenos)

- Converse e escreva em português, sem jargão (preferência do Moisés).
- O glossário (`GLOSSARY.md` na raiz) e os ADRs (`docs/adr/`) são escritos em português.
- Antes de propor um termo, confira `CLAUDE.md` e `docs/modelo.md`: o vocabulário que já está lá (terreno, oferta, negociação, fase, processo, etapa, subetapa, parte, Jornada...) vale e não deve ser renomeado sem o Moisés.
- Decisão de produto continua registrada onde o projeto já registra (`CLAUDE.md` e `docs/modelo.md`, com data e "decisão do Moisés"). ADR só para decisão de arquitetura que passa nos três critérios do domain-modeling; não duplique no ADR o que já está no `CLAUDE.md`.
- Nas threads do projeto, cada rodada de perguntas vai numa mensagem ao Moisés; espere a resposta antes da próxima rodada.
