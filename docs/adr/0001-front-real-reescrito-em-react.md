# Front real reescrito em React, sem reaproveitar o protótipo

O protótipo (`tools/prototipo/`, ~1,5 MB de JavaScript que guarda tudo no navegador) é a especificação das telas, não a base do sistema real. O front real é reescrito em React no `apps/web`, tela por tela, e lê e grava só pelo Supabase. Decisão do Moisés, 4/nov/2026.

## Opções consideradas

- **Aproveitar o protótipo e trocar só o armazenamento** (navegador → banco): parecia mais rápido, mas as regras do protótipo (avanço de etapa, pendências, aprovações, partes...) estão escritas em JavaScript e duplicam as do banco, o que quebra a regra 2 do `CLAUDE.md` (regra de negócio mora no banco), e o código não foi feito para durar nem para ser testado. Recusada.
- **Reescrever em React** (escolhida): mais trabalho no começo, mas a tela só mostra e chama as funções do banco, e cada regra tem um lugar só.

## Consequências

- O `apps/web` atual (escrito para o esquema de outubro) serve de esqueleto (login, sessão, acesso ao banco), não de base das telas.
- O protótipo congela **tela por tela**: depois que uma tela é portada, mudança nela vai direto no sistema real, e o protótipo daquela tela fica parado. Ideia nova e grande ainda pode nascer no protótipo.
