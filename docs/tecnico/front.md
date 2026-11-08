# Front (`apps/web`)

Este arquivo explica o front real do BKM Terrenos: o aplicativo React em `apps/web`, que lê e grava só pelo Supabase. Ele é para quem vai mexer numa tela, consertar um defeito ou portar uma tela nova do protótipo.

Retrato de **8 de novembro de 2026**, com o código do PR #242 (6/nov/2026). Os números de linha (`arquivo:linha`) valem para esse código; se não baterem, procure pelo nome da função.

> Leia antes: [arquitetura.md](arquitetura.md) (as 11 regras que não se quebram) e o ADR `docs/adr/0001-front-real-reescrito-em-react.md`. Para o protótipo, [prototipo.md](prototipo.md); para Google, GeoSampa e companhia, [integracoes.md](integracoes.md); para o deploy, [deploy-e-ambientes.md](deploy-e-ambientes.md).

---

## 1. O que é o front e de onde ele veio

O front é uma aplicação de página única (SPA) em **React 18 + TypeScript + Vite**, com **TanStack Query** para os dados, **react-router 6** para os endereços e **supabase-js 2** para o banco e o login. Não há biblioteca de componentes: a marcação e as classes são as mesmas do protótipo, e os estilos vêm de `styles.css`, gerado a partir do CSS do protótipo (ver [seção 12](#12-estilos-material-3-tokens-e-onde-mexer)).

Por que é assim:

- O **protótipo** (`tools/prototipo/`, ~1,4 MB de JavaScript que guarda tudo no navegador) é a especificação das telas. Em 4/nov/2026 o Moisés decidiu **reescrever** o front em React tela por tela, em vez de trocar só o armazenamento do protótipo, porque as regras do protótipo duplicam as do banco e quebrariam a regra 2 ("regra de negócio mora no banco"). Ver ADR 0001.
- Para que o usuário não estranhe a troca, cada tela portada copia **a mesma marcação e as mesmas classes** do protótipo. Por isso quase todo componente começa com um comentário do tipo "porte de `proto_mod.js › pgMapa`": ele diz qual função do protótipo é a referência.
- O front **só mostra e chama funções do banco**. Regra de funil, aprovação, pendência, permissão: tudo mora no Postgres (`supabase/migrations/*_regras.sql`). O front pergunta ao banco (por exemplo `app.checar_passagem`) e mostra a resposta.

### Ordem em que as telas foram portadas

O porte aconteceu em 3 dias, do PR #194 ao #242. A ordem explica o estado atual (o que tem e o que falta):

| Data | PR (aprox.) | O que entrou |
| --- | --- | --- |
| 4/nov | #194 | Sabatina "Saída do protótipo": decisões do porte (ADR 0001, recorte da primeira versão) |
| 4–5/nov | #195–#197 | Passo 1: login pelo Google, moldura (barra de cima, menu, sino, perfil) igual à do protótipo, banco aplicado no Supabase, foto do Google pela API People |
| 5/nov | #198–#205 | Mapa (pinos, legenda em árvore, lista), camadas de renda e densidade, Concorrência (monitor de mercado), Novo terreno (poligonal desenhada ou KMZ, sobreposição, passo 2), Novo terreno por SQL, mapa de lotes da prefeitura, consulta completa do GeoSampa, régua |
| 5/nov | #206–#212 | Ficha: topo, abas e Visão geral; aba Terreno (Partes, Matrículas e SQLs); aba Comercial; quadro de avanço e painel de Logs e Ações |
| 6/nov | #213–#218 | Ficha no celular (máscaras, tabela vira lista), abas Parâmetros e Entorno, edição no lugar (sem Editar/Salvar), Funil (fases, etapas, subetapas, arrastar) |
| 6/nov | #219–#226 | Ctrl+Z/Ctrl+Y, edição da poligonal no mapa e no mini-mapa, Selecionar lotes, Filtros no Mapa e no Funil, sino ao vivo, alerta do que falta na barra de abas |
| 6/nov | #227–#242 | Etiquetas de matrícula e SQL com percentual, endereço só pelo mapa, selo com PR e hora do build, ficha numa chamada só (`app.ficha_dados`), prazos no GeoSampa, matrícula como subquadro da parte, rascunho dos formulários no navegador |

Para ver o detalhe: `git log --format='%ad %h %s' --date=short --no-merges 9f3d519 | head -110`.

---

## 2. Estrutura de pastas e o papel de cada arquivo

```
apps/web/
├── index.html            página única; metas que o Caddy preenche (Supabase, chave do Google, ambiente)
├── vite.config.ts        Vite + React; injeta __VERSAO__ (PR e hora do build); libera ../../tools/setores no dev
├── versao.json           { "pr": N } — todo PR atualiza para o número dele
├── .env.example          modelo do .env.local (só para npm run dev)
├── package.json          scripts dev, build, typecheck, preview
├── tsconfig.json         strict, noUnusedLocals, resolveJsonModule (lê os JSON de tools/setores)
├── public/               favicon e marca (bkm-logo.svg, icone-*.svg)
└── src/
    ├── main.tsx          ponto de entrada: QueryClient, BrowserRouter, SessaoProvider, ToastProvider, Desfazer
    ├── App.tsx           portão (configurado? logado? tem empresa?) e as rotas
    ├── styles.css        GERADO pelo tools/prototipo/build.py (CSS do protótipo) — ver seção 12
    ├── app.css           estilos só do React (tela de entrada, foto do perfil, botões m-*)
    ├── versao.d.ts       tipo da constante __VERSAO__
    ├── lib/              infraestrutura sem tela
    ├── components/       peças da moldura e utilitários de interface
    ├── pages/            uma página por rota
    ├── ficha/            ficha do terreno (abas, painel, avanço, edição)
    ├── mapa/             motor do Google, camadas, concorrência
    ├── novo/             Novo terreno, lotes da prefeitura, GeoSampa, geometria
    └── filtros/          painel de filtros de terrenos
```

### `src/lib/` — infraestrutura

| Arquivo | Papel |
| --- | --- |
| `config.ts` | Lê a configuração das metas da página (`supabase-url`, `supabase-key`, `gmaps-key`, `bkm-ambiente`), com as variáveis `VITE_*` como reserva. Exporta `SUPABASE_URL`, `SUPABASE_KEY`, `AMBIENTE`, `EH_DEV`, `DOMINIO` (`bkm.com.br`) e `GMAPS_KEY` (só aceita o formato `AIza…`). |
| `supabase.ts` | Cria o cliente único (`db.schema = 'app'`, sessão persistida, PKCE) e `mensagemErro`, que traduz erros comuns (sem conexão, RLS). `configurado` diz se há URL e chave. |
| `sessao.tsx` | `SessaoProvider` e `useSessao()`: sessão do Supabase, perfil (`app.usuarios`), vínculo com a empresa (`app.membros`), papel, `edita`, `eGestor`; busca a foto do Google pela API People. |
| `types.ts` | Tipos escritos à mão para o **esquema de outubro**. Quase tudo está **desatualizado** (por exemplo `StatusProcesso = 'ativo' \| 'ganha' \| 'perdida' \| 'stand_by'`); só `Papel`, `Membro`, `Usuario` e `Empresa` são usados (pela sessão). As telas novas usam `Record<string, any>` (`R`) e interfaces locais. |
| `format.ts` | Datas (`data`, `hojeISO`, `somarDias`, `diasEntre`), valores (`milhoes`, `reais`, `m2`), rótulos (`FORMA`, `ORIGEM`). Tem sobras da versão de outubro (`lerValor`, `ATIVIDADE`, `MOTIVOS_PERDA`, `SITUACAO_PROPOSTA`) sem uso. |
| `mascara.ts` | Máscaras ao digitar, instaladas uma vez no documento (`instalarMascaras()` em `main.tsx`): milhar com ponto, vírgula decimal, R$, %, metros, telefone, CPF/CNPJ, CEP. O tipo vem de `data-fmt` ou do rótulo do campo. `<Adorno>` põe a unidade dentro do campo. |
| `tabelas.ts` | Tabela que não cabe no quadro vira lista empilhada (classe `empilha`), por observadores de tamanho; instalado em `main.tsx`. |
| `camadas.ts` | Como cada camada do GeoSampa aparece para o usuário (tema, texto, gravidade do chip). As camadas consultadas estão em `novo/consulta.ts`. |
| `icones-prototipo.ts` | Ícones copiados do protótipo (`P`, `BI`, `IC_SINO`). Não editar à mão. |

### `src/components/` — moldura e utilitários

| Arquivo | Papel |
| --- | --- |
| `Moldura.tsx` | Barra superior (logo, selo do ambiente, busca, sino, perfil), menu lateral recolhível, barra inferior do celular, FAB "Novo terreno" e as janelas globais (`NovoTerreno`, `TrocarEndereco`). Passa a busca da barra às telas pelo `Outlet context` (`ContextoMoldura`). Tem também `Ic` e `Bi` (ícones), `SeloAmbiente`, `Logo`, `Perfil` e `Sino`. |
| `ui.tsx` | `Dialogo` (janela modal), `ToastProvider`/`useToast` (aviso de 3,2 s), `Carregando`, `Erro`, `Marca`, `Icon`. Tem sobras de outubro sem uso (`ChipStatus`, `ChipDoc`, `Avatar`). |
| `Desfazer.tsx` | Ctrl+Z / Ctrl+Y globais (ver [seção 7](#7-edição-na-ficha)). |
| `Rascunho.tsx` | Aviso de formulário não registrado e rascunho guardado no navegador (ver [seção 7](#7-edição-na-ficha)). |

### `src/pages/` — uma por rota

| Arquivo | Papel |
| --- | --- |
| `Login.tsx` | Botão "Entrar com o Google"; mostra o erro que o Supabase devolve no endereço (domínio recusado pelo gancho do banco). |
| `SemAcesso.tsx` | Entrou pelo Google mas não está em `app.membros`, ou o vínculo não pôde ser lido (erro). |
| `Setup.tsx` | Mostrado quando não há URL ou chave do Supabase (falta o `.env.local`). |
| `Mapa.tsx` | Página Mapa (1.049 linhas): lista, legenda em árvore, pinos, busca de endereço, desenho e edição da poligonal, régua, camadas por setor, concorrência, gaveta da ficha, filtros. Também atende `/terrenos/novo`. |
| `FichaPagina.tsx` | Ficha em página própria (`/terrenos/A123/<aba>`); código inexistente volta ao mapa com aviso; links antigos viram a aba nova. |
| `Funil.tsx` | Funil em três níveis (fases, etapas, subetapas) com arrastar. |
| `EmPorte.tsx` | Aviso "tela sendo portada" (sem uso no momento). |

### `src/ficha/` — ficha do terreno

| Arquivo | Papel |
| --- | --- |
| `dados.ts` | `carregarFicha(empresa, codigo)`: tenta `app.ficha_dados` (uma chamada) e, se a função não existir no banco, cai nos pedidos separados (`semFuncao`, `dados.ts:105`). Monta o objeto `Ficha` (topo, linha do tempo, contagens, completude). Constantes de rótulo (`FONTE_AREA`, `ZONA`, `TEMP`, `TP_N`). |
| `Ficha.tsx` | Topo (código, nome, fase · etapa · subetapa, temperatura), linha do tempo, barra de abas em "roleta" com inércia e ⋮, Visão geral (mini-mapa e Resumo), alerta do que falta. `useFicha` e `usePreCarregarFicha` (`Ficha.tsx:338`, `:345`). |
| `Gaveta.tsx` | A ficha na gaveta da direita da página Mapa (`/mapa/A123/ficha`), com largura arrastável. |
| `edicao.tsx` | Edição no lugar: `SECOES` (campos de cada quadro), `useSalvar` (fila de gravações por `app.salvar_terreno`), `useVivo`/`Vivo`/`CampoVivo`, `Quadro` (abre e fecha pela seta), `CamposEndereco`, `pedirCampo`/`focar`/`acender` (levar a um campo e acendê-lo). |
| `Terreno.tsx` | Aba Terreno: identificação, localização, áreas (cinco fontes e a adotada). |
| `Partes.tsx` | Partes, Matrículas e SQLs (1.192 linhas): etiquetas arrastáveis, percentual por etiqueta, consulta do GeoSampa por SQL, "Escolher no mapa", proprietários por parte, refazer a poligonal pela soma dos lotes. |
| `Comercial.tsx` | Aba Comercial: negociação, condições pedidas, partes da oferta, ofertas, corretores, propostas e reuniões (sem Google Agenda). |
| `Parametros.tsx` | Aba Parâmetros: zonas por lote, potencial construtivo de Mercado/HIS/HMP, alterar valores no lote, Restrições e entorno, histórico de uso. |
| `Entorno.tsx` + `entorno.ts` | Aba Entorno: pontos de interesse (busca no Google, rota a pé, excluir/restaurar), renda e perfil da população por raio, concorrência no entorno. `entorno.ts` tem a busca e a matriz de rotas. |
| `Painel.tsx` | Painel lateral: quadro de avanço no topo e as abas Ações, Tarefas e Logs (sem olhinho nem lixeira). |
| `Avanco.tsx` | Quadro de avanço: subetapa, prazo, pendências, Avançar / Pedir aprovação / Concluir, Stand By / Perdido / Descartado, aprovar e recusar. Só por RPC. |
| `MiniMapa.tsx` | Mini-mapa da Visão geral, com edição da poligonal no lugar. |
| `Temperatura.tsx` | Os cinco níveis; clicar de novo no marcado volta a "não avaliada". |

### `src/mapa/` — mapa

| Arquivo | Papel |
| --- | --- |
| `google.ts` | Carrega o Maps JS uma vez (bootstrap oficial), com as bibliotecas `maps`, `marker`, `geometry`, `places`, `streetView`; detecta chave recusada (`gm_authFailure`). |
| `motor.ts` | Classe `Motor`: tudo que mexe dentro do contêiner do mapa (pinos, poligonais, desenho, edição, régua, Street View, lugares do Google, ladrilhos dos setores, quadrados da concorrência). Imperativo, como no protótipo. |
| `dados.ts` | Funções puras da legenda e das cores (`itens`, `classe`, `info`, `apagado`, `corSub`) e `carregar(empresa)`, que lê `v_mapa`, fases, etapas, subetapas e processos. |
| `setores.ts` + `CamadasSetor.tsx` | Camadas de renda e densidade por setor censitário (dados e marcação). |
| `mercado.ts` + `Concorrencia.tsx` | Concorrência (monitor de mercado): dados, filtro, card, tabela completa. |
| `MenuPonto.tsx` | Menu do ponto do rascunho (Excluir, Adicionar depois, Desfazer, Cancelar). |

### `src/novo/` — Novo terreno e lotes

| Arquivo | Papel |
| --- | --- |
| `estado.ts` | Store pequeno (`useSyncExternalStore`) do cadastro, lido pela janela e pela página Mapa: poligonal, sobreposição, local, frentes, SQLs, mapa de lotes. |
| `NovoTerreno.tsx` | A janela do cadastro: passo 1 (desenhar, KMZ/KML, por SQL), sobreposição e o que fazer, passo 2 (nome de referência), gravação. |
| `LotesGeo.tsx` | Mapa de lotes da prefeitura (São Paulo), desenhado em SVG a partir do WFS do GeoSampa. Três modos: `nv` (cadastro), `sql` (janela por SQL), `ficha` (Escolher no mapa). |
| `geosampa.ts` | Base do GeoSampa (`GEO_BASE`), `geoWfs` com prazo de 30 s, conversão UTM 23S ↔ lat/lng, máscara do SQL, `loteDoSql`. |
| `consulta.ts` | Consulta completa do GeoSampa em cada SQL e pela poligonal; grava por `app.registrar_consulta_lote` e `app.registrar_consulta_area`; andamento "N de M". |
| `geo.ts` | Geometria (área, centro, ponto dentro, união de lotes), leitura de KMZ/KML (JSZip carregado sob demanda), localização reversa pelo Geocoder, frentes e nome de referência. |
| `TrocarEndereco.tsx` | Depois de editar a poligonal, se a rua não encosta mais, pergunta se troca o endereço. |
| `frentesCalc.ts` / `frentes.ts` | Frentes do terreno pela poligonal (São Paulo): a conta pura (`medirFrentes`: metro a metro da divisa, rua = fora de lote do GeoSampa, nome pelo eixo do logradouro paralelo ou cruzado pelo raio para fora; esquina = duas ruas a até 15 m uma da outra ao longo da divisa) e a consulta + gravação (`atualizarFrentes`: `posicao_quadra`, `testada_principal_m` quando vazia ou medida antes, confrontações de frente com fonte "Medida pela poligonal (GeoSampa)"; não mede duas vezes a mesma poligonal na sessão; avisa a ficha pelo evento `frentes-medidas`). |
| `trocarSqls.ts` | "Selecionar lotes" na edição: troca os SQLs do terreno pelos marcados, com fotografia do antes para o Ctrl+Z. |

### `src/filtros/`

| Arquivo | Papel |
| --- | --- |
| `dados.ts` | Definição dos filtros (`FX`, `GRUPOS`), quem passa (`passa`), contagens, leitura de "12 mi"; `carregarFx` lê os dados que os filtros precisam. |
| `Filtros.tsx` | `useFiltros(ctx)`, a barra (`BarraFx`: botão, chips, Limpar, Visão) e a gaveta (`GavetaFx`). |

---

## 3. Rotas: os endereços de cada tela

As rotas ficam em `src/App.tsx`. Todas moram dentro da `Moldura` (barra e menu).

| Endereço | Tela | Observação |
| --- | --- | --- |
| `/` | redireciona para `/mapa` | Não há página Início no React. |
| `/mapa` | Mapa | |
| `/mapa/A123` | Mapa com o terreno A123 selecionado | O estado `{ centro: {lat, lng, z} }` na navegação centra o mapa (vem do mini-mapa). |
| `/mapa/A123/ficha` | Mapa com a ficha na gaveta da direita | A aba da gaveta **não** vai para o endereço (fica só na gaveta, como no protótipo). |
| `/terrenos/novo` | Mapa com a janela do Novo terreno aberta | Fechar a janela volta para `/mapa`. |
| `/terrenos/A123` | Ficha, aba Visão geral | O código é aceito em minúsculas (vira maiúsculas). |
| `/terrenos/A123/<aba>` | Ficha na aba | Abas: `geral`, `terreno`, `comercial`, `parametros`, `massa`, `viabilidade`, `infra`, `entorno`, `jornada`, `documentos`. Links antigos (`cadastro`, `negociacao`, `urbanismo`, `fases`, `viabilidades`) viram a aba nova (`Ficha.tsx`, `ANTIGA`). |
| `/funil` | Funil, nível das fases | |
| `/funil/<fase>` | Etapas da fase | Ex.: `/funil/novos_negocios` (o código da fase, de `fases_modelo.codigo`). |
| `/funil/<fase>/<etapa>` | Subetapas da etapa | |
| `/fases/*` | redireciona para `/funil` | Perde o resto do caminho (ver armadilhas). |
| qualquer outro | redireciona para `/mapa` | |

Como funciona:

- **Um `BrowserRouter`** em `main.tsx`; o Caddy devolve o `index.html` para qualquer caminho (`try_files {path} /index.html`), então link direto funciona.
- **Portão de entrada** em `App.tsx`: sem Supabase configurado → `Setup`; carregando a sessão → `Carregando`; sem sessão → `Login` **no próprio endereço** (o link continua valendo depois do login, porque o `redirectTo` do OAuth é `window.location.href`); sem empresa → `SemAcesso`.
- **Páginas com sub-rotas** usam `path="mapa/*"` e leem `useParams()['*']` e dividem por `/` (`Mapa.tsx`, `Funil.tsx`, `FichaPagina.tsx`).
- **De onde veio**: abrir a ficha pelo Funil passa `state: { de: 'funil', volta: <caminho> }`; o botão de voltar da ficha usa isso (`FichaPagina.tsx`).
- **Filtros** ficam depois do `#`, como `#f=<json>`, sem entrar no histórico (`history.replaceState`).
- A especificação (CLAUDE.md, "Endereço de cada tela") lista mais endereços (`/terrenos`, `/tarefas/...`, `/dashboard`, `/configuracoes/...`, `/terrenos/A123/viabilidade/2`, `/terrenos/A123/gaveta`); eles existem só no protótipo por enquanto.

---

## 4. Configuração do ambiente: como a página recebe URL, chaves e ambiente

O mesmo build roda no desenvolvimento e na produção. Por isso **nada de ambiente entra no build**: os valores chegam na página.

**No Cloud Run (dev e produção).** O `index.html` tem metas com marcadores de template:

```html
<meta name="supabase-url" content='{% env "SUPABASE_URL" %}' />
<meta name="supabase-key" content='{% env "SUPABASE_KEY" %}' />
<meta name="gmaps-key" content='{% env "GOOGLE_MAPS_KEY" %}' />
<meta name="bkm-ambiente" content='{% env "AMBIENTE" %}' />
```

O Caddy serve o `index.html` com a diretiva `templates` (delimitadores `{% %}`, só para `text/html`; `Caddyfile`, blocos `handle /` e `handle`) e troca cada marcador pela variável do serviço. `lib/config.ts` lê a meta; se ela ainda tem `{%` (não foi trocada), ignora e usa a variável do Vite.

**No `npm run dev`.** O Vite não roda templates; as metas chegam com `{% ... %}` e valem as variáveis do `apps/web/.env.local` (modelo em `.env.example`):

```
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_KEY=sb_publishable_...
VITE_AMBIENTE=dev
VITE_GMAPS_KEY=           # a chave precisa liberar localhost no Cloud Console
```

(`VITE_SUPABASE_ANON_KEY` também é aceita, por compatibilidade.)

**A raiz sem banco.** Se `SUPABASE_URL` estiver vazia no serviço, o Caddy redireciona `/` para `/prototipo/` (`@sem_banco`). É o caso da produção até o primeiro uso.

**Por que a chave do Supabase pode ir para a página:** é a chave **publicável** (`sb_publishable_…`), feita para o navegador; quem protege os dados é a RLS do banco (`app.minhas_empresas()`). A chave do Google também vai para a página, porque o Maps JS exige; a proteção é a restrição por domínio e por API no Cloud Console (ver [integracoes.md](integracoes.md)).

---

## 5. Sessão e login

Arquivos: `lib/supabase.ts`, `lib/sessao.tsx`, `pages/Login.tsx`, `pages/SemAcesso.tsx`.

1. **Entrar.** `Login.tsx` chama `supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.href, queryParams: { hd: 'bkm.com.br', prompt: 'select_account' } } })`. O `hd` só sugere o domínio ao Google; quem **barra** outro domínio é o gancho do banco `app.hook_antes_de_criar_usuario` (`supabase/migrations/20261015001100_usuarios.sql:180`), configurado no Supabase como "Before user created hook". Quando o gancho recusa, o Supabase volta com `error_description` no endereço, e `Login.tsx` mostra "Só entra quem tem e-mail @bkm.com.br."
2. **Fluxo PKCE.** O cliente usa `flowType: 'pkce'` e `detectSessionInUrl: true`: na volta do Google, o supabase-js troca o código pela sessão sozinho e guarda a sessão no `localStorage` (chave padrão do supabase-js, `sb-<projeto>-auth-token`).
3. **Sessão.** `SessaoProvider` ouve `onAuthStateChange` (`sessao.tsx:37`). Com usuário, lê em paralelo `app.usuarios` (nome, foto, @) e `app.membros` com `empresas(id,nome)` (papel, administrador, superior). A BKM é a única empresa; se houvesse mais, vale o vínculo mais antigo (`order('criado_em').limit(1)`).
4. **O que a sessão oferece** (`useSessao()`): `session`, `usuario`, `membro`, `empresa`, `erro`, `recarregar`, `eGestor` (gestor ou diretor) e `edita` (analista, gestor ou diretor). `leitura` e `basico` só consultam. O botão "Sair" chama `supabase.auth.signOut()`.
5. **Foto do Google** (`sessao.tsx:60`). Conta do Workspace com foto restrita à organização não manda a foto no login. Logo depois do login (só aí a sessão tem `provider_token`), o front chama `https://people.googleapis.com/v1/people/me?personFields=photos` com o token da própria pessoa e grava pela RPC `app.salvar_minha_foto`. Falhar aqui não impede nada: fica a inicial.
6. **`edita` no front é conforto, não segurança.** Ele só esconde botões. A permissão de verdade é do banco (`app.exigir_editor()`, RLS). Nunca confie no front para proteger uma escrita.

---

## 6. Acesso a dados: TanStack Query, RPCs e convenções

### O cliente

Um `QueryClient` em `main.tsx` com `staleTime: 30_000`, `retry: 1`, `refetchOnWindowFocus: true`. Isso quer dizer: um dado lido há menos de 30 s não é pedido de novo; ao voltar para a aba do navegador, as consultas velhas recarregam.

O cliente Supabase aponta para o esquema `app` por padrão. Para outro esquema, use `supabase.schema('fluxo')` (tarefas, `Painel.tsx:474`) ou `supabase.schema('public')` (monitor de mercado, `Concorrencia.tsx:247`). Os três precisam estar em **Settings → API → Exposed schemas** do Supabase.

### Ler

- **Tabelas e views** com `supabase.from('<tabela>').select(...)`, sempre filtrando por `empresa_id` quando a tabela tem (a RLS já isola, mas o filtro deixa a consulta barata e explícita).
- **Views principais**: `v_mapa` (pinos), `v_terrenos` (cards do funil, filtros), `v_aprovacoes`, `v_terreno_entorno`, `v_terreno_infraestrutura`, `v_urbanismo_vigente`, `v_lote_zonas`.
- **A ficha numa chamada**: `app.ficha_dados(p_empresa, p_codigo)` devolve tudo que o topo e a Visão geral precisam. Antes eram 24 pedidos em três levas, e a troca de terreno na gaveta passava de 10 s no Supabase (PR #236). Se a função não existir no banco, `carregarFicha` cai nos pedidos separados e não tenta de novo na sessão.
- **Pré-carregar**: parar o mouse sobre o pino, a poligonal ou a linha da lista chama `usePreCarregarFicha` (`prefetchQuery`), para a gaveta abrir na hora.

### Gravar

Regra 2 do CLAUDE.md: **mudança com regra só por RPC**. O front nunca faz `update` em `processos`, `propostas` ou `documentos` (nem tem permissão). As RPCs que o front usa hoje:

| Assunto | RPCs |
| --- | --- |
| Ficha | `salvar_terreno` (sempre com a versão), `definir_temperatura`, `salvar_parte`, `excluir_parte` |
| Funil e avanço | `checar_passagem`, `mover_etapa`, `mover_para_etapa`, `mover_subetapa`, `encerrar_processo`, `retomar_processo`, `decidir_aprovacao`, `cancelar_aprovacao` |
| Comercial | `registrar_oferta`, `definir_oferta_referencia`, `registrar_proposta`, `atualizar_status_proposta` |
| GeoSampa | `registrar_consulta_lote`, `registrar_consulta_area`, `registrar_zonas_lote` |
| Entorno | `salvar_entorno`, `salvar_distancias_pontos`, `excluir_lugar_entorno`, `restaurar_lugar_entorno`, `excluir_ponto_terreno`, `restaurar_ponto_terreno` |
| Cadastro | `terrenos_sobrepostos`, `municipio_por_nome` |
| Sessão e sino | `salvar_minha_foto`, `marcar_notificacao_lida` |
| Monitor (esquema `public`) | `im_tabela_empreendimento` (só leitura) |

Escrita direta (`insert`/`update`/`delete`) acontece só nas tabelas "sem regra" da regra 2: `terrenos` (só o `insert` do Novo terreno; a edição vai por `salvar_terreno`), `matriculas`, `inscricoes_municipais`, `inscricao_valores`, `inscricao_partes`, `matricula_partes`, `terreno_pessoas`, `pessoas`, `terreno_corretores`, `ofertas` (condições pedidas), `oferta_partes`, `reunioes`, `reuniao_participantes`, `confrontacoes`, `analise_zoneamentos`, `consultas_lote` e `filtros_salvos`. Mesmo nelas, os gatilhos do banco auditam e conferem (índice único de matrícula e SQL por empresa, município da inscrição etc.).

Para conferir: `grep -rhoE "rpc\('[a-z_]+'" apps/web/src | sort | uniq -c` e `grep -rnoE "from\('[a-z_]+'\)\.(insert|update|delete|upsert)" apps/web/src`.

### Chaves de consulta e invalidação

A chave começa por um nome curto e depois o que a identifica. Invalidar pelo nome (`invalidateQueries({ queryKey: ['ficha'] })`) recarrega todas as variações.

| Chave | O que guarda | Onde |
| --- | --- | --- |
| `['mapa', empresa]` | pinos, fases, etapas, processos | `pages/Mapa.tsx` |
| `['ficha', empresa, codigo]` | a ficha inteira | `ficha/Ficha.tsx` |
| `['ficha-adv', processo, versão, status, etapa, sub]` | quadro de avanço (passagem, motivos, aprovações) | `ficha/Avanco.tsx` |
| `['ficha-com', ...]` | aba Comercial | `ficha/Comercial.tsx` |
| `['ficha-lotes', ...]` | partes, matrículas, SQLs | `ficha/Partes.tsx` |
| `['ficha-pessoas', ...]` | proprietários e contatos | `ficha/Partes.tsx` |
| `['ficha-logs', ...]`, `['ficha-tarefas', terreno]` | painel lateral | `ficha/Painel.tsx` |
| `['ficha-listas', empresa]` | equipe e eixos para os seletores (5 min) | `ficha/edicao.tsx` |
| `['parametros', ...]`, `['entorno', ...]` | abas Parâmetros e Entorno | `ficha/Parametros.tsx`, `ficha/Entorno.tsx` |
| `['funil', empresa]` | quadro do funil | `pages/Funil.tsx` |
| `['filtros', empresa]`, `['visoes', ...]` | dados dos filtros e visões salvas | `filtros/Filtros.tsx` |
| `['avisos', usuário, empresa]` | sino (recarrega a cada 60 s e pelo Realtime) | `components/Moldura.tsx` |

Convenções que o código segue:

- Depois de uma ação do funil, invalide `funil`, `ficha`, `ficha-adv` e `mapa` juntos (`Funil.tsx`, `recarregar`; `Avanco.tsx`, `useRecarregar`), porque o card, a ficha e a cor do pino mudam.
- Depois de `salvar_terreno`, invalide `ficha` e `mapa` (`edicao.tsx:145`, `gravarTerreno`).
- Nas etiquetas e SQLs, recarregue **só** o que a ação muda (PR #237); recarregar a ficha inteira a cada arraste deixava a tela lenta.
- Erro do banco vira toast com `error.message` (o banco escreve mensagens em português para o usuário).

### Tempo real

Só o sino usa o Supabase Realtime: um canal `sino-<uid>` ouve `postgres_changes` em `app.notificacoes` filtrado pelo destinatário e invalida `['avisos']` (`Moldura.tsx`, `Sino`). A migration põe a tabela na publicação `supabase_realtime` quando ela existe (`20261015000700_notificacoes.sql:524`). Atualizar a ficha entre usuários ao vivo ainda não existe.

---

## 7. Edição na ficha

### Edição no lugar (sem Editar nem Salvar)

Desde 6/nov/2026 (pedido do Moisés) o valor **já é o campo**: grava ao sair dele (texto, número, data) ou ao escolher (lista). Esc volta o valor de antes; Enter passa para o próximo campo do mesmo quadro (`proximoCampo`); quem só lê vê o texto.

Peças, em `ficha/edicao.tsx`:

- `SECOES`: os quadros e os campos `[coluna, rótulo, tipo, opções, largura]`. Tipos: `txt`, `area`, `sel`, `user`, `date`, `m`, `m2`, `dec`, `mun`, `cri`, `url`, `eixo`.
- `useVivo(ini, gravar, opt)` (`edicao.tsx:176`) e o render prop `<Vivo>`: guardam o valor em uso, acompanham o valor gravado (quando a ficha recarrega) sem atropelar o campo em foco, e gravam no `blur`. Se a gravação falha, volta o valor de antes.
- `CampoVivo`: um campo de seção ligado a `useSalvar`.
- `dadosDe` e `valoresDe`: convertem entre o texto do formulário e o que vai ao banco. Número vazio vira `null`; seleção vazia vira `nao_informado` (ou `nao_informada`, `nao_avaliada`) conforme a lista, porque **"não informado" nunca vira zero nem "não"** (regra 7).

### A fila de gravação e a versão

`app.salvar_terreno(id, versao, dados)` recusa versão antiga (regra 11). Na edição no lugar, a pessoa sai de um campo e já sai do próximo; sem cuidado, a segunda gravação esbarraria na versão que a primeira acabou de mudar. Por isso `useSalvar` (`edicao.tsx:122`):

1. põe cada gravação numa **fila** (`FILA`), uma de cada vez;
2. guarda em `VER` a versão que cada gravação devolveu, e a próxima usa a maior entre a da ficha e a guardada;
3. se o banco responde `40001` (versão antiga de verdade: outra pessoa mexeu), apaga a versão guardada e recarrega a ficha.

### Desfazer e refazer (Ctrl+Z, Ctrl+Y)

`components/Desfazer.tsx`. Fora de um campo, Ctrl+Z (⌘Z) desfaz a última alteração **da pessoa nesta sessão**, uma por vez, com o aviso "Desfeito: …"; Ctrl+Y ou Ctrl+Shift+Z refaz. Dentro de um campo vale o desfazer do navegador.

- Quem grava chama `empilhar({ rotulo, fazer, refazer })`. Pilha de até 50; uma alteração nova limpa o refazer.
- Entra na pilha só o que se desfaz sem efeito colateral: campos da ficha (`useSalvar` lê o valor de antes no banco antes de gravar), etiquetas de matrícula e SQL, ajuste da poligonal e "Selecionar lotes" (`trocarSqls.ts` fotografa o antes). Funil, registros (oferta, proposta) e exclusões ficam de fora: têm regra, aprovação e aviso próprios.
- No desenho e na edição da poligonal, o próprio desenho trata o Ctrl+Z antes (desfaz o ponto) e marca o evento (`defaultPrevented`); o ouvinte global vem depois.
- Isto é diferente da **lixeira dos logs** do protótipo (`app.desfazer_alteracao`, que registra "Desfeito por"), que ainda não foi portada.

### Rascunho e aviso de formulário não registrado

`components/Rascunho.tsx`. Formulários de inclusão (proposta, oferta, reunião, pessoa...) não gravam no lugar: têm um botão Registrar. Para não perder o que foi digitado:

- `useRascunho(ref, sujo, nome, descartar)`: com algo digitado e não registrado, se a pessoa clica fora (botão, aba, link, outro campo), aparece "Você não registrou …" com **Continuar preenchendo** e **Sair sem registrar**. Sair da página usa o aviso do próprio navegador (`beforeunload`).
- `useGuardarRasc(chave, valor, temAlgo)`, `comRasc`, `lerRasc`, `apagarRasc`: o que foi digitado fica no `localStorage` em `bkm-terrenos-rasc:<terreno>:<formulário>` e volta preenchido ao reabrir. Só registrar ou **Limpar dados** apagam; não expira.
- Janelas que o formulário abre por cima (o mapa de lotes do "Escolher no mapa") ficam fora da conta pelo atributo `data-rasc-livre`.

### Quadros que abrem e fecham, e "ir ao campo"

- `Quadro` (`edicao.tsx:423`): o quadro da aba nasce fechado, menos o primeiro; a escolha vale na sessão, por aba (`QD`, em memória). `abrirQuadro` e `abrirQuadroJa` abrem por código (o log, o aviso do que falta).
- `pedirCampo({ sec, campo })` dispara o evento `ficha-campo`; a aba que tem a seção atende (`usePedido`), abre o quadro, rola até o campo "na altura dos olhos" (abaixo das abas e do título preso) e acende (`acender`, uma piscada verde-limão de 2,7 s).

---

## 8. Mapa

### Peças

- `pages/Mapa.tsx`: o React desenha a página (lista, legenda, barras, cartões, gavetas) e entrega os dados ao motor.
- `mapa/motor.ts` (`class Motor`, `motor.ts:64`): mexe só dentro do contêiner do mapa do Google. É **imperativo de propósito**, portado de `proto_gmap.js`: o Google Maps tem estado próprio (marcadores, polígonos, Street View) e reconstruir isso a cada render do React seria lento. A página chama métodos (`pinos`, `setBase`, `regua`, `svFechar`...) e recebe eventos pelos `Ganchos` (`pino`, `vazio`, `menu`, `duplo`, `clique`, `editar`, `passar`...).
- `mapa/google.ts`: carrega o Maps JS uma vez; `carregarGoogle()` devolve `false` sem chave, com a chave recusada ou se o script não carrega.

### Comportamentos que valem saber

- **Map ID**: `DEMO_MAP_ID` (`motor.ts:77`), o de demonstração do Google, necessário para `AdvancedMarker`. Criar um Map ID próprio está em aberto.
- **Vista guardada**: centro e zoom em `bkm-terrenos-mapa-vista`; o mapa abre onde a pessoa deixou.
- **Tipo de mapa**: Satélite (`hybrid`, com rótulos) por padrão, ou Mapa (`roadmap`), no menu dos três pontinhos (`BotaoMais`).
- **Sem Leaflet no React.** No protótipo, sem chave ou com a chave recusada, o mapa cai no Leaflet (Esri/OSM). No React, aparece só a mensagem "O Google recusou a chave do mapa (domínio ou API não liberados)" ou "Não foi possível carregar o mapa do Google" (`Mapa.tsx:435-439`). Leaflet não está nem nas dependências.
- **Clique**: no desktop, clique no pino ou na poligonal abre a ficha na gaveta (`/mapa/A123/ficha`); no celular, seleciona e mostra o cartão. Com camada por setor ligada, o clique abre o quadro do setor.
- **Criar**: clique direito (ou dois cliques no vazio, no desktop) abre "Novo terreno aqui", que começa o desenho com o primeiro ponto. Leitura não tem o menu.
- **Desenho e edição da poligonal**: barra pequena no canto (pontos, área, Cancelar, Concluir), menu do ponto (`MenuPonto.tsx`), Enter ou dois cliques salvam, Esc ou dois cliques fora do mapa cancelam, Ctrl+Z/Ctrl+Y por ponto. Ao salvar a edição, o pino vai para o centro da poligonal e, se a rua mudou, abre `TrocarEndereco`. Em São Paulo, "Selecionar lotes" troca os SQLs (`trocarSqls.ts`).
- **Régua**: botão no canto; distância e área; Esc e Del apagam.
- **Lugares do Google**: tocar num comércio ou escola do mapa abre nome, nota e até 3 avaliações (`lugarAbrir`, `motor.ts:214`, `Place.fetchFields` com `reviews`); o resultado fica em memória (`LUGARES`) para não pagar de novo.
- **Street View**: bonequinho no canto de baixo; fecha no X próprio ou Esc.
- **Busca de endereço**: `Place.searchByText` com viés na região (`motor.ts:172`).

### Camadas de renda e densidade (setores censitários)

`mapa/setores.ts` e `mapa/CamadasSetor.tsx`, portados de `proto_setores.js`.

- **Metodologia** (faixas, cores, fatores) vem de `tools/setores/metodologia_renda.json` e `metodologia_densidade.json`, **importados no build** por caminho relativo (`setores.ts:2-3`). É a mesma fonte do protótipo e do teste do banco. Por isso o `Dockerfile` copia esses JSON (e `demografia.json`, que a aba Entorno importa) para dentro da imagem de build, e o `vite.config.ts` libera `../../tools/setores` no servidor de desenvolvimento.
- **Dados dos setores** (geometria e valores) vêm por `fetch` de `/prototipo/dados/setores-<município>-2022.json` (`setores.ts:19`), um por município de `SET_MUN` (São Paulo `3550308` e São José dos Campos `3549904`). O perfil da população usa `/prototipo/dados/demografia-<município>-2022.json`.
- Desenho em ladrilhos de canvas (`desenhaLadrilho`), com índice espacial por grade.
- Uma camada por vez; ligada, o mapa passa para a visão Mapa (a menos que a pessoa troque) e a legenda das cores aparece. A camada escolhida fica guardada, mas se apaga depois de 30 minutos fora da página Mapa (`MP_EXPIRA_MIN`, `Mapa.tsx:55`).

### Concorrência (monitor de mercado)

`mapa/mercado.ts` e `mapa/Concorrencia.tsx`, portados de `proto_mercado.js`.

- O retrato vem de `/prototipo/dados/mercado.json` (`mercado.ts:47`), gerado em `tools/mercado/` (ver [integracoes.md](integracoes.md)).
- No React, a **cor do quadrado é a faixa de R$/m²** (10 faixas, `MK_FX`) e o **desenho dentro é a situação** (estrela, guindaste, prédio; `MK_GLIFO`), desde o PR "concorrência pelo R$/m²" de 5/nov. O CLAUDE.md ainda descreve as cores pela situação (ver incoerências no fim).
- **Tabela completa** do empreendimento: ao vivo, pela RPC `public.im_tabela_empreendimento` do mesmo projeto Supabase (`Concorrencia.tsx:247`). Essa função mora no repositório do monitor (`Mbekerman/bkm-monitor-mercado`), não neste.
- O card fecha 1 s depois de o mouse sair; o olhinho o fixa (`bkm-terrenos-concorrencia-fixa`).

---

## 9. Novo terreno e lotes da prefeitura

Fluxo (decisões do Moisés de 22/out e 4/nov/2026), portado de `proto_novo.js` e `proto_lotesgeo.js`:

1. **Passo 1, a poligonal, sempre.** Três jeitos: desenhar no mapa (a janela se fecha e o desenho acontece na página Mapa, pelo `pedirDesenho` do `estado.ts`), importar KMZ/KML (`geo.ts`, `lerKmz`, com JSZip carregado sob demanda) ou "Incluir por SQL" (São Paulo: a poligonal é a soma dos lotes; `loteDoSql`).
2. **Sobreposição.** Com a área, `app.terrenos_sobrepostos` diz quais terrenos ocupam parte dela (a faixa de até 5 m na divisa não conta, `NV_FOLGA`); a janela pergunta o que fazer (nova oferta, recadastrar, "É outro terreno, cadastrar mesmo assim").
3. **Localização.** `localDoPonto` faz a geocodificação reversa (Google Geocoder) e `frentes` acha as ruas que encostam na poligonal; a pessoa escolhe o acesso principal.
4. **Mapa de lotes (São Paulo).** Abre sozinho uma vez depois da poligonal (`LotesGeo.tsx`): os lotes das quadras que a poligonal ocupa, vindos do WFS do GeoSampa e desenhados em SVG, com os lotes de 20% ou mais dentro já marcados. "Usar N lotes" refaz a poligonal pela soma dos lotes e os SQLs entram sem parte.
5. **Passo 2, só o nome de referência**, que já vem com o logradouro sem o tipo (`nomeBase`, `nomeUnico`).
6. **Gravar.** `insert` em `app.terrenos` com poligonal, ponto, município (`municipio_por_nome`), logradouro, número, bairro, CEP e `sobreposicoes_aceitas` (`NovoTerreno.tsx:143`). O banco gera o código (A001...), a parte "Vendedor 1" e o resto pelos gatilhos. Depois vêm os SQLs e a **consulta completa do GeoSampa** em cada um (`consulta.ts`, `consultarTerreno`), com uma nova tentativa se falhar e o andamento "Consultando o GeoSampa: N de M" (`useConsultaGeo`).

Sem `GEO_BASE` (local ou fora do Caddy), tudo que depende do GeoSampa some ou diz "A busca no GeoSampa funciona na versão publicada".

A planta (PDF) e o desenho (DXF) do lote, que o protótipo guarda em Documentos, ainda **não** são gerados no React (a aba Documentos não foi portada; `consulta.ts`, comentário do topo).

---

## 10. Funil

`pages/Funil.tsx`, portado de `proto_fases.js` e `proto_funil.js`.

- Três níveis no endereço: `/funil` (uma coluna por fase ativa, um card por fase aberta do terreno, sem arrastar), `/funil/<fase>` (etapas e Stand By, arrastar muda a etapa) e `/funil/<fase>/<etapa>` (subetapas, arrastar muda a subetapa).
- Ao soltar um card, o front pergunta ao banco (`checar_passagem`) e, conforme a resposta, move (`mover_etapa`, `mover_para_etapa`, `mover_subetapa`), abre a justificativa (gestor e diretor) ou a lista do que falta. O front **não decide** se pode: só mostra.
- Lê `fases_modelo`, `etapas_modelo`, `subetapas_modelo`, `processos` (só os do terreno, `parte_id is null`, ativos ou em stand by), `v_terrenos` e `v_aprovacoes`.
- Tem o painel de filtros com a seleção própria (`useFiltros('kanban')`).

---

## 11. Filtros de terrenos

`filtros/Filtros.tsx` e `filtros/dados.ts`, portados de `proto_filtros.js`.

- `useFiltros(ctx)` (`Filtros.tsx:35`) com `ctx` `'mapa'` ou `'kanban'`: cada página tem a sua seleção (pedido do Moisés, 4/nov/2026).
- A seleção fica no `sessionStorage` (`bkm-terrenos-filtros-pag`, um objeto por página) e no endereço (`#f=`); o endereço vale primeiro (link recebido abre com o filtro).
- Filtro antigo ou desconhecido é descartado (`soValidos`).
- **Visões salvas** em `app.filtros_salvos`: cada um salva as suas; as da empresa, só o administrador (a RLS confere).
- `ok(id)`: terreno que ainda não está nos dados dos filtros (acabou de entrar) passa, para não sumir logo depois de cadastrado.
- A gaveta dos filtros, a do filtro da concorrência e a da ficha não abrem juntas (`Mapa.tsx:161`).
- A página Pipeline (tabela de Terrenos), que também teria filtro próprio no protótipo, não foi portada.

---

## 12. Estilos: Material 3, tokens e onde mexer

### Dois arquivos

| Arquivo | De onde vem | Quando mexer |
| --- | --- | --- |
| `src/styles.css` (5.038 linhas) | **Gerado** por `tools/prototipo/build.py`: é `bkm.pre-painel.css` + `painel.css` do protótipo, mais as **duas últimas linhas** do próprio arquivo, que o gerador preserva. | Estilo que vale para protótipo e React. Mude em `tools/prototipo/*.css` e rode o `build.py`. |
| `src/app.css` (306 linhas) | Escrito à mão, **não** é gerado. | Estilo que só o React tem (tela de entrada, foto do perfil, botões `m-*`, ajustes de componentes portados). Na dúvida, aqui. |

Por que assim: as telas portadas usam as mesmas classes do protótipo; gerar o CSS do mesmo lugar garante que os dois fiquem iguais enquanto a tela não foi portada. Depois do porte, o protótipo daquela tela congela (ADR 0001) e o estilo próprio do React vai para `app.css`.

### Tokens

- O começo de `styles.css` tem os tokens antigos do Design System BKM (`--marinho`, `--azul-bkm`, `--superficie`...). Por cima, o bloco **"Tema Google (Material 3)"** (`styles.css:681` em diante) redefine os tokens `--m-*` (`--m-primary` `#0b57d0`, `--m-outline`, `--m-on-surface`, `--m-sc-low`...) e sobrepõe muita coisa com `!important` (cerca de 700 ocorrências no arquivo). O CLAUDE.md pede, "no porte do front", reescrever os tokens com os valores do Material 3 e tirar os `!important`; isso ainda **não** foi feito.
- Cores, tipografia (Google Sans Flex, carregada do Google Fonts no `index.html`), botões em cápsula, cards contornados e o resto das regras visuais estão no CLAUDE.md, seção "Visual". Siga-as.
- **Tema escuro**: os tokens existem no CSS (bloco "Tema escuro", ativado por `html[data-tema]`), mas o React **não** tem o seletor de tema; a primeira versão é só tema claro (decisão da rodada 4 da sabatina).

---

## 13. O que o front guarda no navegador

Tudo em `localStorage` (vale entre sessões, por navegador), salvo onde está dito `sessionStorage` (só enquanto a aba está aberta). Toda leitura e escrita está num `try/catch`: navegação privada ou armazenamento bloqueado não quebram a tela, só não lembram.

| Chave | Para quê | Onde |
| --- | --- | --- |
| `bkm-terrenos-menu` | menu lateral aberto (`aberto`) ou recolhido (`min`, padrão) | `Moldura.tsx:22` |
| `bkm-terrenos-mapa-vista` | centro e zoom do mapa | `motor.ts:46` |
| `bkm-terrenos-mapa-lista` | largura da lista do mapa (px) | `Mapa.tsx:37` |
| `bkm-terrenos-mapa-tipo` | Mapa ou Satélite (padrão Satélite) | `Mapa.tsx:37` |
| `bkm-terrenos-legenda` | legenda aberta (`1`) ou fechada | `Mapa.tsx:37` |
| `bkm-terrenos-legenda-fixa` | legenda fixada pelo olhinho (não fecha sozinha) | `Mapa.tsx:37` |
| `bkm-terrenos-mapa-legenda` | o que a legenda apagou (fases/etapas/subetapas), situações e faixas da concorrência desligadas, camada da concorrência ligada | `Mapa.tsx:52` |
| `bkm-terrenos-mapa-camada` | camada por setor ligada (`renda`, `dens` ou vazio); expira | `Mapa.tsx:52` |
| `bkm-terrenos-mapa-filtro-conc` | filtro da concorrência; expira | `Mapa.tsx:55` |
| `bkm-terrenos-mapa-visto` | última vez na página Mapa; passados 30 min fora, camada e filtro da concorrência se apagam | `Mapa.tsx:55` |
| `bkm-terrenos-concorrencia-fixa` | card do empreendimento fixado pelo olhinho | `Concorrencia.tsx:204` |
| `bkm-terrenos-ficha-gaveta` | largura da gaveta da ficha no Mapa | `Gaveta.tsx:10` |
| `bkm-terrenos-painel` | painel lateral da ficha: aberto, aba (Ações, Tarefas, Logs), filtro de usuários e período dos logs | `Painel.tsx:19` |
| `bkm-terrenos-entorno-concorrencia` | raio (1, 2, 3 km) e situações do quadro Concorrência no entorno | `Entorno.tsx:310` |
| `bkm-terrenos-rasc:<terreno>:<formulário>` | rascunho de formulário não registrado | `Rascunho.tsx:114` |
| `bkm-terrenos-filtros-pag` (**sessionStorage**) | seleção de filtros de cada página (`mapa`, `kanban`) e a visão escolhida | `Filtros.tsx:17` |
| `sb-<projeto>-auth-token` | sessão do Supabase (do supabase-js) | automático |

O protótipo usa mais chaves (`bkm-terrenos-prototipo-v9` com todos os dados de exemplo, `bkm-terrenos-tema`, `bkm-terrenos-filtros`). Como protótipo e React servidos no mesmo domínio dividem o `localStorage`, várias chaves de preferência (menu, mapa, legenda) **valem para os dois** ao mesmo tempo. Isso é intencional (mesmo comportamento), mas lembre-se disso ao mudar o formato de uma chave: o outro lado precisa ler o formato novo, ou use uma chave nova.

Nada do que precisa persistir de verdade (dados, visões salvas, preferências de notificação) fica no navegador: vai para o banco.

---

## 14. `versao.json` e o selo do ambiente

- `apps/web/versao.json` tem `{ "pr": N }`. **Todo PR atualiza o número para o dele** (pedido do Moisés, 6/nov/2026; CLAUDE.md, Ambientes).
- `vite.config.ts` lê o arquivo e a hora do build (fuso de São Paulo) e injeta a constante global `__VERSAO__ = { pr, build }` (tipo em `src/versao.d.ts`).
- `SeloAmbiente` (`Moldura.tsx:41`) aparece ao lado do logo quando `AMBIENTE` não é vazio nem `producao`: "Desenvolvimento" (ou o nome do ambiente) e, embaixo, "PR #N · dia hora". O título da aba ganha `[DEV]`. Em produção, nada.
- Serve para saber, olhando a tela, qual versão está no ar no Cloud Run. Se o número não bate com o último merge, o build não terminou ou falhou (ver [deploy-e-ambientes.md](deploy-e-ambientes.md)).

---

## 15. O que ainda não foi portado do protótipo

A primeira versão em uso é, por decisão do Moisés: login, mapa, novo terreno, ficha (Visão geral, Terreno, Comercial) e o funil de Novos Negócios, só para computador e só no tema claro. Parâmetros e Entorno já entraram também. O resto existe **só no protótipo** (que continua sendo a especificação dessas telas):

| Do protótipo | No React | Observação |
| --- | --- | --- |
| Início (indicadores) | não | `/` vai para `/mapa`. |
| Pipeline (tabela de Terrenos, `proto_tabela.js`) e `/terrenos/A123/gaveta` | não | O menu tem só Mapa e Funil. |
| Dashboard | não | |
| Tarefas (Lista, Quadro, Cronograma, Calendário, Funil, cartão, modelos, automações, aprovação, pausa, recorrência) | não | A ficha só **lê** as tarefas abertas do quadro do terreno (`Painel.tsx`, aba Tarefas). As tarefas devem ir para um banco próprio (`bkm_tarefas`, ADR 0002). |
| Configurações (Funil, Jornada, Fases, Campos, Viabilidade, Parâmetros, Topografia, Tarefas, Equipe, Notificações) | não | Ajuste urgente direto no banco, a pedido do Moisés. |
| Abas da ficha Estudos de massa, Viabilidades, Infraestrutura, Jornada, Documentos | não | Mostram "Esta aba entra depois da primeira versão" (`Ficha.tsx`, fim). |
| Estudo de viabilidade (popup, DRE, modelos) | não | |
| Relevo, classificação topográfica e Topográfico preliminar | não | O Resumo mostra o perfil se já estiver gravado (`topo_perfil`). |
| Logs com olhinho e lixeira (`app.desfazer_alteracao`) | não | Logs entram sem eles (decisão da sabatina). |
| Seção Histórico sem painel, quadro de avanço na página no celular | parcial | O celular vem depois do computador. |
| Reuniões com Google Agenda e Meet | não | Reunião fica só no sistema. |
| Menção com @, notificações por e-mail, "Configurar notificações" | não | O sino entra; e-mail depois. |
| Tema escuro e Automático | não | |
| Menu do avatar com "Entrar como" | não | Só no protótipo (é para testar papéis). |
| GeoSanja (São José dos Campos) | não | Só GeoSampa está no React. |
| Mapa alternativo Leaflet sem Google | não | Ver [seção 8](#8-mapa). |
| Planta (PDF) e desenho (DXF) do lote em Documentos | não | Depende da aba Documentos. |
| "Usar a poligonal dos lotes" com a comparação lado a lado | a conferir | O React refaz a poligonal pela soma dos lotes em `Partes.tsx` (`refazerPoligonal`) e no mapa de lotes; a tela de comparação do protótipo não foi encontrada. |
| Concorrência cadastrada à mão | não | Desligada também no protótipo (`CC_MANUAL = false`). |
| Faixa "Protótipo, dados de exemplo" no `/prototipo` | não | Prevista para quando o endereço principal abrir o sistema real. |

Para conferir o que uma tela do protótipo tem, abra o arquivo `proto_*.js` citado no comentário do topo do componente React e compare.

---

## 16. Como rodar, checar tipos e gerar o build

```bash
cd apps/web
npm install                 # Node 22 (o mesmo do CI e do Dockerfile)
cp .env.example .env.local  # e preencha URL e chave publicável do Supabase (e a chave do Google, se quiser o mapa)
npm run dev                 # http://localhost:5173 (host: true, abre também pela rede)
npm run typecheck           # tsc --noEmit
npm run build               # tsc --noEmit && vite build  -> apps/web/dist
npm run preview             # serve o dist
```

- Em 8/nov/2026, `npm install` e `npm run typecheck` passam limpos.
- O CI (`.github/workflows/ci.yml`, job `web`) roda `npm install`, `typecheck` e `build` com URL e chave falsas. **Não há teste automático do React** (nem unitário, nem Playwright): os roteiros Playwright são do protótipo. Confira a tela no ambiente de desenvolvimento.
- Para o login funcionar no `npm run dev`, o endereço `http://localhost:5173` precisa estar nas "Redirect URLs" do Supabase Auth (a conferir no projeto).
- O que **não funciona** no `npm run dev` (só na versão publicada pelo Caddy):
  - GeoSampa e mapa de lotes: `GEO_BASE` é `null` em `localhost` (`geosampa.ts:7-11`);
  - camadas de renda e densidade, perfil da população, Concorrência e a Quota Ambiental: os arquivos vêm de `/prototipo/dados/...`, que o Vite não serve (o pedido cai no `index.html` e a leitura do JSON falha). Para testar local, copie `docs/dados/` para `apps/web/public/prototipo/dados/` (sem commitar) ou rode o container (ver [deploy-e-ambientes.md](deploy-e-ambientes.md)).
  - mapa do Google: só se a chave liberar `localhost`.

---

## 17. Como portar uma tela nova (receita)

1. Leia a tela no protótipo (`tools/prototipo/proto_*.js`) e a descrição no CLAUDE.md.
2. Confira que o banco já tem as tabelas, views e RPCs (`supabase/migrations/`, `docs/modelo.md`). Regra nova vai **no banco**, com teste em `supabase/tests/regras.sql`, nunca no front.
3. Escreva o componente com **a mesma marcação e as mesmas classes** do protótipo; no topo, o comentário "porte de `proto_x.js › função`".
4. Ler: `useQuery` com chave `['<nome>', ...]`. Gravar: RPC quando houver regra; `insert`/`update` direto só nas tabelas sem regra.
5. Depois de gravar, invalide as chaves que mudam (ficha, mapa, funil...). Se a gravação se desfaz sem efeito colateral, `empilhar` para o Ctrl+Z.
6. Formulário de inclusão: `useRascunho` + `useGuardarRasc`. Edição de campo da ficha: `CampoVivo`/`useSalvar`.
7. Estilo só do React em `app.css`.
8. Ligue a rota em `App.tsx` (e o item do menu em `Moldura.tsx`, `NAV`).
9. Atualize `versao.json`, o CLAUDE.md (o que mudou na tela) e este manual (ver [como-manter.md](como-manter.md)). A partir daí, o protótipo daquela tela congela (ADR 0001).

---

## 18. Armadilhas conhecidas

1. **Rodar o `build.py` do protótipo apaga ajustes feitos à mão no `styles.css`.** O gerador sobrescreve o arquivo com o CSS do protótipo e só guarda as **duas últimas linhas**. Em 8/nov, o `styles.css` tem três diferenças em relação ao CSS do protótipo que se perderiam: a linha `.pin.pin-ed { cursor: grab }` (linha 659), o `:not(:has(.v-alvo, .rg-pt, .pin-ed))` (linha 5019, o protótipo não tem `.pin-ed`) e o comentário da régua (o par de linhas final sobrevive). Antes de rodar o `build.py`, mova esses ajustes para `app.css` ou para o CSS do protótipo. Para conferir: `cat tools/prototipo/bkm.pre-painel.css tools/prototipo/painel.css | diff - apps/web/src/styles.css`.
2. **O React depende de arquivos servidos pelo protótipo.** Setores, demografia, mercado e Quota Ambiental vêm de `/prototipo/dados/` (o `Dockerfile` copia `docs/dados` para `/srv/prototipo/dados`). Tirar o protótipo do ar ou mudar esse caminho quebra as camadas e a aba Entorno.
3. **Função nova no banco que ainda não chegou ao Supabase.** As migrations são editadas no lugar (regra que vale até o banco de produção), mas o banco do Supabase foi aplicado em 5/nov pelo workflow "Banco no Supabase", que recusa rodar se o esquema `app` já existe. Uma RPC criada depois pode não existir lá. O front da ficha se protege (`semFuncao` cai nos pedidos separados), mas outras telas não: confira no banco antes de usar uma função nova (ver [banco.md](banco.md) e [deploy-e-ambientes.md](deploy-e-ambientes.md)).
4. **`/fases/...` perde o caminho.** O protótipo e o CLAUDE.md usam `/fases/aprovacao/projeto`; o React usa `/funil/<fase>/<etapa>` e manda qualquer `/fases/*` para `/funil`, sem os níveis.
5. **`types.ts` engana.** Os tipos de processo, proposta e documento são do esquema de outubro. Não use `StatusProcesso` nem `Terreno` desse arquivo para telas novas; leia as colunas reais nas migrations. O comentário cita `npm run gen:types` e um README que não existem; o caminho previsto é `supabase gen types` quando o projeto estiver ligado.
6. **Código morto de outubro.** `ChipStatus`, `ChipDoc`, `Avatar` (`ui.tsx`), `EmPorte.tsx` e parte de `format.ts` não são usados. Não os tome como padrão.
7. **Máscara mexe no valor do campo por fora do React.** `instalarMascaras()` troca o valor pelo setter nativo e dispara o `input`, para o React ver o texto formatado. Ao ler, use `lerNum` (aceita "1.920,5" e "12 mi"). No Esc, a máscara ainda completa casas ao sair; `useVivo` ignora essa mudança.
8. **Gravação da ficha fora da fila.** Chamar `supabase.rpc('salvar_terreno', ...)` direto, sem `useSalvar`, pode esbarrar na versão (erro de edição simultânea) se outra gravação estiver em curso. Use sempre `useSalvar` (ou `gravarTerreno` dentro da `FILA`).
9. **`StrictMode` monta duas vezes no dev.** Efeitos que criam o motor do mapa ou canais do Realtime precisam limpar no retorno (já fazem). Ao escrever um efeito novo, devolva a limpeza.
10. **Template do Caddy.** Qualquer `{%` ou `%}` num HTML servido pelo Caddy é lido como template e pode derrubar a página (erro 500). O `index.html` do React só tem os quatro marcadores de propósito; o `build.py` do protótipo recusa gerar se encontrar a sequência.
11. **Chave do Google no `localhost`.** Sem `localhost` liberado na chave, o mapa diz que a chave foi recusada; não é defeito do código.
12. **O GeoSampa demora.** `geoWfs` desiste em 30 s e a conferência do mapa de lotes no banco em 20 s, com aviso (PRs #237 e #238). Não tire os prazos: sem eles o botão fica esperando para sempre.
