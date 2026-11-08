# Protótipo navegável (`tools/prototipo/`)

Este arquivo explica o protótipo do BKM Terrenos: o que é, por que existe, como é gerado, testado, servido e publicado, e a regra que diz quando ele deixa de ser mexido.

Retrato de **8 de novembro de 2026**. O guia operacional (lista de cada fonte e de cada roteiro de teste) é o `tools/prototipo/README.md`; aqui está o porquê e o fluxo, sem repetir as tabelas de lá.

---

## 1. O que é

O protótipo é **uma página HTML única** (`docs/prototipo.html`, cerca de 2,2 MB) que roda o sistema inteiro **no navegador, sem banco**: dados de exemplo, todas as telas (Início, Terrenos, ficha com todas as abas, Mapa, Funil, Tarefas, Dashboard, Configurações, estudo de viabilidade, topográfico...) e as regras escritas em JavaScript. Tudo que a pessoa faz fica no `localStorage` do navegador (chave `bkm-terrenos-prototipo-v9`, `proto.js:281`), e o menu do avatar tem "Entrar como" para testar cada papel.

Ele **não é** o sistema. É a **especificação viva das telas**: o lugar onde o Moisés vê, clica e aprova como cada tela funciona antes de ela existir de verdade.

## 2. Por que existe

- **Validar o fluxo antes de gastar com o banco e o front reais.** De 20/out a 4/nov/2026 o produto foi desenhado no protótipo: cada decisão do Moisés virou uma mudança no protótipo, conferida na tela, e depois registrada no CLAUDE.md com a data.
- **Funcionar em qualquer lugar.** Por ser um arquivo só, abre como arquivo local, no artifact do claude.ai e no Cloud Run (`/prototipo`), sem servidor de aplicação.
- **Espelhar o banco.** Várias regras do protótipo copiam funções do banco (por exemplo `proto_funil.js` espelha `app._passagem`; `proto_viab.js` espelha `app.calcular_viabilidade`) e leem os mesmos JSON de configuração que o teste do banco lê (`tools/setores/*.json`, `tools/parametros/parametros.json`, `tools/viabilidade/despesas.json`). Assim, o que o protótipo mostra é o que o banco fará.

## 3. A regra de congelar tela por tela (ADR 0001)

Decisão do Moisés de 4/nov/2026 (`docs/adr/0001-front-real-reescrito-em-react.md`):

- O front real é **reescrito em React** (`apps/web`), tela por tela, lendo e gravando só pelo Supabase. O protótipo **não** é aproveitado como base de código, porque as regras dele duplicam as do banco (quebraria a regra 2, "regra de negócio mora no banco") e o código não foi feito para durar nem para ser testado.
- **Depois que uma tela é portada, o protótipo daquela tela congela.** Mudança nela vai direto no sistema real (`apps/web`); o protótipo daquela tela fica parado, mesmo que fique para trás.
- **Ideia nova e grande ainda pode nascer no protótipo**, para ser conferida antes de ir para o banco e o React.

Telas já portadas em 8/nov/2026 (e, portanto, congeladas no protótipo): login e moldura, Mapa (com camadas por setor e Concorrência), Novo terreno (com lotes da prefeitura e GeoSampa), ficha (topo, abas, Visão geral, Terreno, Comercial, Parâmetros, Entorno, painel de Logs e Ações, quadro de avanço) e Funil. A lista do que **não** foi portado está em [front.md › O que ainda não foi portado](front.md#15-o-que-ainda-não-foi-portado-do-protótipo).

Na prática, o que isso significa para quem mexe:

| Você quer mudar... | Onde mexe |
| --- | --- |
| algo numa tela já portada (Mapa, ficha nas abas portadas, Funil, Novo terreno) | `apps/web`; **não** atualize o protótipo |
| algo numa tela ainda não portada (Tarefas, Configurações, Viabilidade...) | no protótipo, se for para conferir com o Moisés; ou já no React, se for portar |
| uma ideia nova e grande, para o Moisés ver | no protótipo |
| o CSS comum | `tools/prototipo/*.css` e rodar o `build.py` (ele também gera `apps/web/src/styles.css`; ver as armadilhas) |

Ainda assim, em 5/nov houve mudanças feitas nos dois lados ao mesmo tempo (por exemplo "Protótipo: concorrência pelo R$/m²" e "Front: concorrência pelo R$/m²"). Na dúvida, o React manda nas telas portadas.

## 4. Como é feito: as fontes

Tudo em `tools/prototipo/`:

- `proto_body.html`: a marcação fixa da página.
- `proto.js`: estado, dados de exemplo, telas, modais e ações; termina em `render();\n})();`.
- `proto_*.js` (45 arquivos): cada assunto num arquivo (mapa, Google, painel, fases, funil, partes, lotes, GeoSampa, GeoSanja, novo terreno, filtros, concorrência, mercado, topográfico, viabilidade, estudos de massa, agenda, zonas, setores, tarefas e suas vistas, jornada, tabela, rotas, acabamentos de interface...). O `README.md` de lá diz o que cada um faz.
- `bkm.pre-painel.css` + `painel.css`: os estilos (o `painel.css` tem os blocos mais novos e sobrepõe o anterior, incluindo os temas Material 3 claro e escuro).
- `topo_dxf_modelo.py` + `topo_modelo.dxf`: esqueleto DXF do topográfico, embutido no `proto_topo.js`.
- `build.py`, `mkdemo.py` e `testes/`.

Tudo roda numa única função (um IIFE): os módulos compartilham as variáveis globais do `proto.js` (`S` com os dados, `UI` com o estado da tela, `render()`).

## 5. Como gerar (`build.py`)

```bash
# 1. Leaflet e JSZip locais: o build exige o leaflet.css (sem ele o mapa quebra)
mkdir -p tools/prototipo/libs/l
git fetch origin libs-prototipo:refs/remotes/origin/libs-prototipo
git archive origin/libs-prototipo | tar -x -C tools/prototipo/libs/l

# 2. Gerar
python3 tools/prototipo/build.py

# 3. Só se for rodar os testes que usam a demo (tpisca, tend2, tgmock)
python3 tools/prototipo/mkdemo.py
```

O que o `build.py` faz, em ordem (`tools/prototipo/build.py`, 44 linhas):

1. Junta o CSS (`bkm.pre-painel.css` + `painel.css`) e embute o `leaflet.css` (com as `url(...)` trocadas por `none`, porque o protótipo não usa os ícones padrão do Leaflet). Sem `libs/l/leaflet.css`, para com erro.
2. Concatena os módulos `proto_*.js` numa ordem fixa e os insere antes do `render();})();` final do `proto.js`.
3. Embute os JSON de configuração por substituição de marcadores: `__METODOLOGIA_RENDA__`, `__METODOLOGIA_DENSIDADE__`, `__DEMOGRAFIA__` (de `tools/setores/`), `__PARAMETROS__` (`tools/parametros/parametros.json`), `__VIAB_DESPESAS__` (`tools/viabilidade/despesas.json`) e `__TOPO_DXF__` (`topo_modelo.dxf`).
4. Põe Leaflet 1.9.4 e JSZip 3.10.1 do cdnjs e a fonte Google Sans Flex.
5. **Recusa gerar** se o HTML tiver `{%` ou `%}`, porque o Caddy lê a página como template com esses delimitadores e o `/prototipo` cairia com erro 500. Se o seu código precisar dessa sequência, quebre-a (`'{'+'%'`).
6. Grava três saídas:
   - `tools/prototipo/saida/bkm-terrenos.html`: versão para o artifact do claude.ai e para os testes (fora do git);
   - `tools/prototipo/saida/dados/`: cópia de `docs/dados/` ao lado da página;
   - `docs/prototipo.html`: a versão publicada, um documento completo com as metas `gmaps-key` e `bkm-ambiente` em forma de template (`{% env "GOOGLE_MAPS_KEY" %}`), que o Caddy preenche.
7. **Reescreve `apps/web/src/styles.css`** com o mesmo CSS, preservando só as duas últimas linhas do arquivo. É o que mantém o React com os mesmos estilos (ver armadilhas).

Regras:

- **Nunca edite `docs/prototipo.html` à mão.** Edite as fontes e rode o `build.py`; commite as fontes **e** o HTML gerado (o Cloud Run serve o arquivo do repositório).
- O CI (`.github/workflows/ci.yml`, job `prototipo`) só confere que o script final do `docs/prototipo.html` compila (`new Function(...)`). Não roda os roteiros Playwright.

## 6. Roteiros de teste (Playwright)

Em `tools/prototipo/testes/` há 83 roteiros Node (8/nov), mais três simuladores do Google, com Playwright e Chromium (`npm i playwright` ou o global da máquina). Cada um é um script solto: `node tools/prototipo/testes/tabas.js`. A tabela completa do que cada um cobre está no `README.md` do protótipo.

Como eles funcionam:

- Abrem a página gerada (`docs/prototipo.html` ou `saida/bkm-terrenos.html`) num endereço falso (`file:///x/a.html` ou `http://bkm.test/...`) e **interceptam todos os pedidos** (`ctx.route('**/*', ...)`): devolvem a página, o Leaflet e o JSZip locais (`libs/l`), os arquivos de `saida/dados` e, conforme o roteiro, um Google simulado (`fake_gmaps.js`, `fake_gmaps2.js`, `fake_gmaps3.js`) ou respostas gravadas do GeoSampa e do GeoSanja (`testes/geosampa/`, `testes/geosanja/`).
- Os que leem JSON usam `http://bkm.test` porque o `fetch` não lê `file://`.
- Rodam em várias larguras (desktop, celular com `devices['Pixel 7']`) e nos temas claro e escuro (gravando `bkm-terrenos-tema` no `localStorage`).
- Contam falhas com `ok(condição, mensagem)` e imprimem `FALHOU: ...`; erros de página (`pageerror`) também contam.
- Prints e saídas vão para `tools/prototipo/saida/` (fora do git).

Quando rodar: **só os roteiros que a mudança toca**; a varredura completa (`tvaza.js`, nada vazando em 14 larguras; `tscroll.js`, nenhuma rolagem horizontal) ao fechar um lote.

Para regravar as respostas reais do GeoSampa ou do GeoSanja: `GRAVAR=1 node tools/prototipo/testes/tgeo.js` (ou `tgeosjc.js`, `tlotesgeo.js`), com um Caddy local na porta 8099 fazendo o repasse. O token de visitante do GeoSanja não é gravado.

O roteiro `ttopo.js` usa os servidores reais (GeoSampa, GeoSanja e Google), servindo a página no endereço publicado para a chave valer; `LAZPERF=` aponta para o `lib/web` do pacote `laz-perf@0.0.7`.

## 7. Onde é servido

| Lugar | Como | Observações |
| --- | --- | --- |
| Cloud Run, `/prototipo` (dev e produção) | O `Dockerfile` copia `docs/prototipo.html` para `/srv/prototipo/index.html` e `docs/dados/` para `/srv/prototipo/dados/`. O Caddy (`handle /prototipo*`) tira o prefixo, aplica `templates` (preenche a chave do Google e o ambiente) e devolve a página para qualquer caminho (`try_files {path} /index.html`). | É onde GeoSampa, GeoSanja, Google e os dados (`/prototipo/dados/*.json`) funcionam de verdade, pelos repasses do Caddy (ver [integracoes.md](integracoes.md)). |
| Raiz `/` sem banco | Com `SUPABASE_URL` vazia no serviço, o Caddy redireciona `/` para `/prototipo/`. | Caso da produção até o primeiro uso. |
| Arquivo local | Abrir `saida/bkm-terrenos.html` ou `docs/prototipo.html` no navegador. | Sem servidor: as rotas vão depois do `#` (`#/terrenos/A123`); `fetch` dos JSON falha em `file://`; GeoSampa e GeoSanja indisponíveis. |
| Artifact do claude.ai | Publicado a partir da `develop` (CLAUDE.md, Ambientes), com o arquivo `saida/bkm-terrenos.html`. | Rotas pelo `#`; sem GeoSampa nem GeoSanja (os repasses do Caddy não existem lá; `proto_geosampa.js:12` desliga em `claude.ai`); o mercado mostra "indisponível" sem os dados. O endereço do artifact do protótipo não está registrado no repositório (a conferir com o Moisés). |

**Endereços dentro do protótipo** (`proto_rota.js`): na versão publicada, no caminho (`/prototipo/terrenos/A123/comercial`); fora dela, depois do `#`. Telas: `/`, `/terrenos`, `/terrenos/novo`, `/terrenos/A123[/aba]`, `/terrenos/A123/gaveta`, `/terrenos/A123/viabilidade/2`, `/mapa[/A123[/ficha]]`, `/fases[/fase[/etapa]]`, `/tarefas[/lista|/calendario|/cronograma|/funil|/TAR-000123]`, `/dashboard`, `/configuracoes/<seção>` (seções em `RT_CFG`, `proto_rota.js:17`). Os filtros vão em `f=`.

**Selo do ambiente**: `proto_funil.js:379-380` lê a meta `bkm-ambiente` e, fora da produção, põe o selo "Desenvolvimento" ao lado do logo e `[DEV]` no título.

## 8. Como publicar uma mudança no protótipo

1. Edite as fontes em `tools/prototipo/`.
2. `python3 tools/prototipo/build.py`.
3. Rode os roteiros que a mudança toca.
4. Confira o `git diff apps/web/src/styles.css` (ver armadilha 1) e commite as fontes, o `docs/prototipo.html` e, se mudou, o `styles.css`.
5. PR para a `develop` (atualizando `apps/web/versao.json`). O Cloud Build publica no `terrenos-web-dev`, em `/prototipo`.
6. Republique o artifact do claude.ai com o `saida/bkm-terrenos.html`, se o Moisés usa o artifact para conferir.
7. Registre a decisão no CLAUDE.md, com a data, como o resto do arquivo faz.

## 9. Armadilhas

1. **O `build.py` reescreve o `styles.css` do React.** Ele guarda só as duas últimas linhas; qualquer ajuste feito à mão no meio do `styles.css` some. Em 8/nov já há ajustes assim (`.pin.pin-ed` e o `:has(... .pin-ed)`; detalhes em [front.md › Armadilhas](front.md#18-armadilhas-conhecidas)). Mova-os para o `app.css` ou para o CSS do protótipo antes de rodar o `build.py`.
2. **`{%` e `%}` derrubam o `/prototipo`.** O `build.py` já recusa; não contorne a checagem.
3. **O protótipo guarda dados no navegador.** Mudou o formato de `S`? Suba a versão da chave (`bkm-terrenos-prototipo-vN`), senão quem já abriu fica com dados velhos e erros estranhos. Os roteiros começam com `localStorage.clear()`.
4. **Chaves de preferência compartilhadas com o React** (`bkm-terrenos-menu`, `-mapa-*`, `-legenda*`, `-painel`...): os dois leem o mesmo `localStorage` no mesmo domínio. Mudar o formato num lado pode quebrar o outro.
5. **O React lê os dados de `/prototipo/dados/`.** Apagar o protótipo do `Dockerfile` ou do Caddy quebra as camadas por setor, o perfil da população, a Concorrência e a Quota Ambiental do sistema real.
6. **Há uma chave publicável do Supabase do monitor no código** (`proto_mercado.js:307`, para a "Ver tabela completa" chamar `im_tabela_empreendimento` sem o cliente do Supabase). É uma chave feita para o navegador e a função é só de leitura, mas ela dá acesso a tudo que a RLS do projeto deixar aberto para o papel anônimo. Avaliação em [seguranca.md](seguranca.md).
7. **Regras duplicadas.** O que o protótipo calcula (funil, viabilidade, filtros) é cópia do banco. Se a regra mudar no banco e o protótipo daquela tela não estiver congelado, ele mente. Para tela congelada, isso é esperado.
