# Protótipo: fontes, gerador e testes

O `docs/prototipo.html` (servido pelo Railway em `/prototipo`) e o artifact do claude.ai são **gerados** a partir desta pasta. Edite aqui, nunca o HTML gerado.

| Arquivo | O que é |
| --- | --- |
| `proto_body.html` | marcação fixa da página |
| `proto.js` | estado, dados de exemplo, telas, modais e ações (termina em `render();})();`) |
| `proto_mod.js` | mapa (Leaflet), Visão geral, pontos de interesse, poligonal |
| `proto_gmap.js` | tudo que usa o Google (Maps JS, Places, Routes, Geocoding, Elevation) |
| `proto_painel.js` | painel lateral (logs, filtros, ações), tabelas que empilham, ganchos do `posRender` |
| `bkm.pre-painel.css` + `painel.css` | estilos; o `painel.css` tem os blocos mais novos e sobrepõe o anterior |
| `build.py` | junta tudo: grava `docs/prototipo.html`, `saida/bkm-terrenos.html` (artifact e testes) e atualiza `apps/web/src/styles.css` |
| `mkdemo.py` | gera `saida/demo/...` com 6 usuários a mais (usado por `tpisca.js`, `tend2.js`, `tgmock.js`) |
| `testes/` | roteiros Playwright |

## Gerar

```bash
# Leaflet e JSZip locais (só para os testes, que rodam sem CDN)
mkdir -p tools/prototipo/libs/l && git fetch origin libs-prototipo:refs/remotes/origin/libs-prototipo && git archive origin/libs-prototipo | tar -x -C tools/prototipo/libs/l
python3 tools/prototipo/build.py
python3 tools/prototipo/mkdemo.py      # só se for rodar os testes que usam a demo
```

## Testar (Playwright com Chromium; `npm i playwright` ou o global da máquina)

Rodar só o que a mudança toca; a varredura completa (`tvaza` e `tscroll`) ao fechar um lote.

| Roteiro | Cobre |
| --- | --- |
| `tvaza.js` | nada vazando de quadros em 14 larguras, menu aberto e recolhido (lento) |
| `tscroll.js` | nenhuma rolagem horizontal |
| `tloc.js`, `tordem.js` | colunas da Visão geral e mapa primeiro em uma coluna |
| `tinline.js` | edição no lugar na Visão geral |
| `tpisca.js` | clicar no log abre a seção e acende o campo |
| `tend2.js`, `tgmock.js` | endereço pela busca do Google (simulado) |
| `tadv.js` | quadro de avanço compacto e modais |
| `ted2.js` | edição da poligonal (desktop e celular) |
| `tent.js`, `tent2.js`, `tent3.js`, `tentshot.js` | pontos de interesse: busca e rota a pé simuladas, pontos da empresa, adicionar ponto |
| `ticones.js` | prints dos ícones do menu (aberto, recolhido, celular, tema escuro) |

`fake_gmaps.js` / `fake_gmaps2.js` simulam o Google (o 2 também responde `Place.searchNearby`); `tile.png` é o fundo de mapa falso. Prints e saídas vão para `saida/` (fora do git).
