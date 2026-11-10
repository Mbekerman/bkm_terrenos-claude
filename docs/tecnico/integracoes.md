# Integrações e ferramentas de dados

Este arquivo descreve cada serviço externo que o BKM Terrenos usa (ou vai usar) e as ferramentas de `tools/` que geram os dados de `docs/dados/`. Para cada serviço: para que serve, onde está no código, qual credencial usa e onde ela fica, custo conhecido, limites e o que fazer quando quebra.

Retrato de **8 de novembro de 2026**. "React" é o sistema real (`apps/web`); "protótipo" é `tools/prototipo/` (ver [prototipo.md](prototipo.md)). Custos: só os que o projeto registrou; o resto está marcado "a conferir" e deve ser lido na tabela de preços do Google Maps Platform antes de qualquer decisão.

---

## 1. Visão geral

| Serviço | Para quê | React | Protótipo | Credencial |
| --- | --- | --- | --- | --- |
| Google Maps JavaScript API | mapa, satélite, pinos, poligonais, Street View | sim | sim (com Leaflet de reserva) | `GOOGLE_MAPS_KEY` |
| Places API (New) | busca de endereço, lugares do mapa, pontos de interesse do entorno | sim | sim | `GOOGLE_MAPS_KEY` |
| Routes API (matriz a pé) e Distance Matrix | distância a pé até os pontos de interesse | sim | sim (e rota no mapa) | `GOOGLE_MAPS_KEY` |
| Geocoding | endereço a partir do ponto (Novo terreno, troca de endereço) | sim | sim | `GOOGLE_MAPS_KEY` |
| Elevation | cotas fora de São Paulo (relevo, topográfico) | sim (topográfico) | sim | `GOOGLE_MAPS_KEY` |
| Street View | ver a rua | sim | sim | `GOOGLE_MAPS_KEY` |
| Maps Static API | imagem por baixo do topográfico fora de São Paulo (no sistema real, satélite com nomes de rua, sem reserva; no protótipo, sem ela, Esri) | sim | sim | `GOOGLE_MAPS_KEY` |
| People API | foto do Google da pessoa logada | sim | não | token OAuth da própria pessoa |
| Google OAuth (login) | entrar com a conta @bkm.com.br | sim | não | app OAuth "Interno" no GCP, configurado no Supabase |
| GeoSampa (Prefeitura de SP) | lote pelo SQL, camadas urbanísticas, mapa de lotes | sim | sim | nenhuma (repasse do Caddy `/geosampa`) |
| Laser 2020 / MDT (GeoSampa) | cotas do terreno em São Paulo | não | sim | nenhuma (repasse `/geosampa/Download/File/125`) |
| GeoSanja (Prefeitura de SJC) | lote pela inscrição, camadas | sim | sim | token de visitante (repasse `/geosanja`) |
| IBGE (Censo 2022) | setores censitários: renda, densidade, perfil | sim (arquivos) | sim (arquivos) | nenhuma (FTP público, só na geração) |
| Monitor de mercado (Órulo) | concorrência no mapa e no entorno | sim | sim | chave publicável do Supabase |
| Supabase | banco, login, Realtime | sim | não | `SUPABASE_URL`, `SUPABASE_KEY` (publicável) |
| Google Agenda, Meet, Gmail, Drive | reuniões, e-mail pela bkm@, arquivos | planejado | simulado | refresh token no Vault (a fazer) |

As variáveis do serviço Cloud Run e o caminho do deploy estão em [deploy-e-ambientes.md](deploy-e-ambientes.md).

---

## 2. A chave do Google (`GOOGLE_MAPS_KEY`)

- **Uma chave só** para todos os serviços do Google que rodam no navegador (decisão do dono, a rever). É uma chave do projeto GCP `bkm-terrenos`, a mesma nos dois serviços Cloud Run.
- **Onde fica:** variável `GOOGLE_MAPS_KEY` do serviço Cloud Run. **Nunca** vai para o repositório. O Caddy a injeta na meta `gmaps-key` da página (template `{% env "GOOGLE_MAPS_KEY" %}`, em `apps/web/index.html` e no `docs/prototipo.html` gerado). No `npm run dev`, `VITE_GMAPS_KEY` do `.env.local`.
- **Como o código lê:** `apps/web/src/lib/config.ts` (`GMAPS_KEY`, só aceita o formato `AIza…` com 20+ caracteres; senão fica vazia) e `tools/prototipo/proto_gmap.js:8` (`GKEY`).
- **Por que ela aparece no navegador:** o Maps JS exige a chave na página. A proteção é a **restrição no Cloud Console**: por domínio (HTTP referrer: os dois endereços `*.run.app` e, para desenvolvimento local, `localhost`) e por API (só as APIs desta lista). Sem a restrição, qualquer um copia a chave e gasta na conta da BKM.
- **Qual chave:** a "BKM Terrenos Maps" (restrita por site e por API; desde 9/nov/2026 com 8 APIs, a Maps Static incluída). Conferido em 9/nov/2026: a chave servida em produção, em desenvolvimento e no protótipo é a mesma, recusada vinda de outro site. A "Maps Platform API Key", criada sozinha pelo Google ao ativar o Maps, não é usada por nada do sistema e pode ser excluída.
- **Pendente:** separar em chave de navegador + chave de servidor (CLAUDE.md, Decisões em aberto). Hoje não há chamada de servidor ao Google.

**Quando quebra** (o mapa diz "O Google recusou a chave do mapa (domínio ou API não liberados)"): o Maps JS chamou `gm_authFailure` (`mapa/google.ts`). Causas, em ordem de probabilidade: o domínio não está na restrição da chave (endereço novo, `localhost`); a API usada não está liberada na chave ou não está ativada no projeto; faturamento suspenso no GCP; chave apagada ou trocada sem atualizar a variável do Cloud Run. Confira no Cloud Console › APIs e serviços › Credenciais e no console do navegador (a mensagem do Google diz o motivo, por exemplo `RefererNotAllowedMapError` ou `ApiNotActivatedMapError`).

---

## 3. Google Maps JavaScript API

**Para quê.** O mapa da página Mapa, o mini-mapa da Visão geral, pinos (`AdvancedMarkerElement`), poligonais, desenho e edição da poligonal, régua, Street View, e os lugares clicáveis do próprio Google.

**Onde.**
- React: `apps/web/src/mapa/google.ts` (carregador), `mapa/motor.ts` (classe `Motor`, tudo dentro do mapa), `ficha/MiniMapa.tsx`.
- Protótipo: `tools/prototipo/proto_gmap.js` (`carregarGoogle`, `G_initMapa`, `G_initMini`...).

**Como carrega.** O bootstrap oficial (`importLibrary`) com `v: 'weekly'`, `language: 'pt-BR'`, `region: 'BR'`. O React importa as bibliotecas `maps`, `marker`, `geometry`, `places` e `streetView` (`google.ts`); o protótipo também `elevation` e `geocoding` (`proto_gmap.js:19`).

**Map ID.** `DEMO_MAP_ID` (`motor.ts:77`), o de demonstração do Google, exigido pelo `AdvancedMarker`. Criar um Map ID próprio está em aberto (CLAUDE.md). O Moisés dispensou um Map ID "sem lugares" (os lugares do Google ficam sempre ligados, decisão de 23/out/2026).

**Custo.** Carregamentos de mapa (Dynamic Maps) e Street View têm cota grátis mensal e depois cobram por mil carregamentos; valores **a conferir** na tabela do Google.

**Reserva sem Google.** Só no protótipo: sem chave ou com a chave recusada, cai no **Leaflet** com ladrilhos da Esri (satélite e cinza-escuro) e do OpenStreetMap (`proto_mod.js:239-243`), e a busca de endereço vai ao **Nominatim** do OpenStreetMap (`proto_novo.js:69`, `:196`). O React **não** tem reserva: mostra a mensagem de erro no lugar do mapa (`pages/Mapa.tsx:435-439`).

**Quando quebra.** Ver a seção 2. Se o mapa aparece mas os pinos não: `AdvancedMarker` precisa de Map ID; confira se o `DEMO_MAP_ID` continua aceito.

---

## 4. Places API (New)

**Para quê e onde.**

| Uso | Chamada | Onde |
| --- | --- | --- |
| Busca de endereço na barra do mapa | `Place.searchByText` (Text Search New), 5 resultados, viés na região | `mapa/motor.ts:172` |
| Quadro do lugar ao tocar num comércio, escola etc. do mapa | `new Place({ id }).fetchFields(['displayName','formattedAddress','rating','userRatingCount','reviews','googleMapsURI'])` (Place Details) | `mapa/motor.ts:214-223` (`lugarAbrir`) |
| Pontos de interesse do terreno (aba Entorno) | `Place.searchNearby` por categoria, `includedPrimaryTypes`, até 20 por categoria, ordenado por distância | `ficha/entorno.ts` (`buscarEntorno`) |
| Autocompletar endereço na ficha | `PlaceAutocompleteElement` | `ficha/edicao.tsx:358` (`CamposEndereco`); **sem uso** desde que o endereço passou a vir só do mapa (6/nov/2026) |

**Regras do entorno** (decisões do Moisés de 3 e 4/nov/2026). As categorias vêm do banco (`app.entorno_categorias`: tipos do Google, raio a pé, `min_avaliacoes`, `isento_nomes`, `excluir_nomes`, `um_por_local_m`). A busca roda **uma vez por localização**: `app.salvar_entorno` guarda a coordenada, e só um terreno que mudou de lugar busca de novo. O que foi excluído continua excluído quando a busca é refeita.

**Custo.**
- Place Details com avaliações cai no SKU **Enterprise + Atmosphere**: cerca de **US$ 25 por mil toques além dos 1.000 grátis por mês** (CLAUDE.md, Página Mapa). Por isso o resultado fica em memória na sessão (`LUGARES` em `motor.ts`).
- Nearby Search e Text Search: **a conferir**. O entorno faz uma busca por categoria (8 categorias na lista do CLAUDE.md; a lista real é a do banco) por terreno localizado, uma vez por localização.

**Quando quebra.** "Google indisponível" no Entorno: a chave não libera a Places API (New) ou a biblioteca `places` não carregou. Resultado estranho (lojas no lugar de escolas): ajuste os filtros da categoria no banco (`entorno_categorias`), não no código.

---

## 5. Routes API e Distance Matrix (distância a pé)

**Para quê.** A distância **sempre a pé** de cada ponto de interesse ao terreno (decisão do Moisés, 4/nov/2026), e a da estação mais próxima no Resumo da Visão geral.

**Onde.** `ficha/entorno.ts`, função `matriz`:
1. Primeiro a **Routes API**, `POST https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix` (`entorno.ts:42`), em lotes de 25 destinos, com `X-Goog-Api-Key` (a mesma chave) e `X-Goog-FieldMask`.
2. Se ela falhar ou não devolver nenhuma rota, o `DistanceMatrixService` do Maps JS (a API antiga, de reserva).
3. Se as duas falharem, a **linha reta** (haversine, `distM`), avisada como tal (`rota_a_pe = false` em `salvar_entorno`).

**Rota desenhada no mapa** (React desde 9/nov/2026, "Traçar rota a partir daqui"): `mapa/rota.ts`, `POST https://routes.googleapis.com/directions/v2:computeRoutes`, um pedido por origem × modo, com `routingPreference: TRAFFIC_UNAWARE` em carro e moto (com trânsito o pedido vira o SKU Pro). Modos: `DRIVE`, `TWO_WHEELER` (Brasil está na lista de cobertura de duas rodas do Google, conferida em 9/nov/2026; a documentação diz que é cobrado mais caro), `WALK`, `BICYCLE` e `TRANSIT` (testado em São Paulo em 9/nov: ônibus e metrô). Reserva: `DirectionsService` do Maps JS (só se a Directions API estiver ativada; não tem moto). A origem vem do `AutocompleteSuggestion` (Places novo, token de sessão; um `fetchFields(['location'])` ao escolher), com `Place.searchByText` de reserva, ou do clique no mapa: num lugar do Google, `Place.fetchFields(['displayName'])` (um Place Details por clique); num ponto qualquer, o `Geocoder` do Maps JS (Geocoding API, reverso; se não estiver liberada na chave, o nome fica "Ponto no mapa" e a rota sai igual). O protótipo tem a mesma rota em `proto_gmap.js:139-146`.

**Custo.** Cobrança por elemento (origem × destino); **a conferir**. Um terreno com 40 lugares no entorno gera 40 elementos por busca.

**Quando quebra.** A Routes API responde 403 se não estiver ativada no projeto ou liberada na chave; o código cai na reserva sozinho e, no limite, na linha reta. Se todos os terrenos aparecem "em linha reta", é a chave.

> A conferir: o React não importa a biblioteca `routes` nem a `geocoding` explicitamente, mas usa `google.maps.DistanceMatrixService` e `google.maps.Geocoder` (`entorno.ts:53`, `novo/geo.ts:123`). Hoje funciona; se um dia aparecer "is not a constructor", acrescente `'routes'` e `'geocoding'` à lista de `importLibrary` em `mapa/google.ts`.

---

## 6. Geocoding

**Para quê.** Achar o endereço (rua, número, bairro, CEP, município) a partir do ponto da poligonal, no Novo terreno e na troca de endereço depois de editar a poligonal.

**Onde.** React: `novo/geo.ts:123` (`localDoPonto`, `new google.maps.Geocoder().geocode({ location })`). Protótipo: `proto_novo.js:64` (reversa) e `proto_gmap.js:237` (pelo endereço), com o Nominatim de reserva.

**Depois.** O município achado vira `municipio_id` pela RPC `app.municipio_por_nome` (o banco tem os 5.571 municípios do IBGE em `app.municipios`).

**Custo.** A conferir.

**Quando quebra.** O cadastro pede o município à mão quando a localização falha (CLAUDE.md, Novo terreno).

---

## 7. Elevation (Google)

**Para quê.** Cotas do terreno **fora de São Paulo** (em São Paulo, sempre o laser 2020; ver seção 11): relevo da poligonal e o topográfico preliminar.

**Onde.** Só no protótipo: `proto_gmap.js:253` (relevo) e `proto_topo.js:79-85` (grade de 5 m, em lotes de 512 pontos). O React ainda não tem relevo nem topográfico.

**Custo e limites registrados.** A origem do Google tem cerca de 9,5 m de resolução; por isso a grade é de 5 m: os 9 pontos por m² pedidos de início "não acrescentam nada e custariam ~US$ 6 por terreno" (CLAUDE.md, Topográfico preliminar). Validação de 27/out/2026 com 4 levantamentos de campo em SP: laser 6 a 9 cm, curvas antigas da prefeitura 0,2 a 0,4 m, **Google 1,2 a 2,3 m**. Com cotas do Google, o DXF sai sem os pontos do Google, só com as curvas (decisão do Moisés com o advogado).

**Quando quebra.** No protótipo, "as cotas fora de São Paulo vêm do Google, que só funciona na versão publicada". Em São Paulo, o Google **nunca** é usado como reserva do laser (decisão de 27/out/2026).

---

## 8. Street View

**Para quê.** Ver a rua do terreno. No mapa, o bonequinho no canto de baixo; na linha selecionada e no mini-mapa, o botão Street View.

**Onde.** `mapa/motor.ts:183-187` (`svFechar`, `StreetViewService().getPanorama` com raio de 120 m) e `ficha/MiniMapa.tsx:213`.

**Custo.** A conferir (cobrado por carregamento de panorama).

---

## 9. People API e o login do Google

**Login.** Google OAuth pelo Supabase Auth, só contas do Workspace @bkm.com.br: app OAuth "Interno" no projeto do Google Cloud da organização (CLAUDE.md, Decisões em aberto). O ID e o segredo do cliente OAuth ficam **no painel do Supabase** (Authentication › Providers › Google), não no repositório. Quem não é do domínio é barrado pelo gancho `app.hook_antes_de_criar_usuario` (`supabase/migrations/20261015001100_usuarios.sql:180`), que precisa estar ligado em Authentication › Hooks. Detalhes do fluxo em [front.md › Sessão e login](front.md#5-sessão-e-login).

**Foto.** `lib/sessao.tsx:60` chama `GET https://people.googleapis.com/v1/people/me?personFields=photos` com o `provider_token` da própria pessoa (só existe logo depois do login) e grava por `app.salvar_minha_foto`. Serve para contas com a foto restrita à organização, que não mandam a foto no login. Requer a People API ativada no projeto do app OAuth (a conferir no console). Falhar não impede nada: fica a inicial.

---

## 10. GeoSampa (Prefeitura de São Paulo)

**Para quê.** Pelo SQL (cadastro do IPTU), trazer o lote, a poligonal, áreas, CIB, zona fiscal, cartório e **tudo que toca o lote** (zonas com a área no lote, ZEIS, eixos, macroárea, operação urbana, mananciais, tombamento, contaminação, melhoramento viário, córrego, risco, inundação, Metrô/CPTM, árvores, alta tensão, ferrovia, Comgás...). Também o mapa de lotes das quadras no cadastro e a consulta "Restrições e entorno" pela poligonal inteira.

**Por que passa pelo Caddy.** O servidor de camadas do GeoSampa só aceita chamada de navegador vinda do próprio Novo GeoSampa (confere origem e referência). O Caddy repassa o pedido **sem** `Origin`, `Referer` e `Cookie`, e tira o `Set-Cookie` e o `Access-Control-Allow-Origin` da resposta. Por isso **só funciona na versão publicada**.

**O que o repasse aceita** (`Caddyfile`, `handle_path /geosampa/*`): só `GET` em

| Caminho na página | Vai para | Para quê |
| --- | --- | --- |
| `/geosampa/geoserver/geoportal/ows` | `https://geoserver.geosampa.prefeitura.sp.gov.br/geoserver/geoportal/ows` | WFS (feições em GeoJSON) |
| `/geosampa/geoserver/geoportal/wms` | idem, `/wms` | WMS (imagens; usado pelo protótipo nas plantas) |
| `/geosampa/Download/File/125` | `https://novogeosampa.prefeitura.sp.gov.br/Download/File/125` | folhas do laser 2020 (seção 11) |

Qualquer outro caminho ou método recebe 404. Isso evita que o repasse vire um proxy aberto para o servidor da prefeitura.

**Onde no código.**
- `novo/geosampa.ts`: `GEO_BASE` (`location.origin + '/geosampa/geoserver/geoportal/'`, ou a meta `geosampa-url` se existir; `null` em `localhost` e `127.0.0.1`), `geoWfs` (WFS 2.0.0, GeoJSON, `srsName EPSG:31983`, **prazo de 30 s**), conversão UTM SIRGAS 2000 fuso 23S ↔ lat/lng, `loteDoSql`.
- `novo/consulta.ts`: a lista `GEO_CAMADAS` (camada, geometria, raio em metros, atributos guardados), `consultarLote` → RPC `app.registrar_consulta_lote` (também completa área, CIB, zona fiscal, cartório e a análise urbanística), `consultarArea` → `app.registrar_consulta_area`, `consultarTerreno` (todos os SQLs, uma nova tentativa, depois a poligonal; andamento "N de M").
- `novo/LotesGeo.tsx`: mapa de lotes das quadras (desenho em SVG; vêm marcados os lotes com 20% ou mais dentro; a quadra só entra com 10 m² ou mais de lote dentro; conferência no banco de quem já está em outro terreno com prazo de 20 s).
- `novo/frentes.ts`: frentes do terreno pela poligonal (`lote_cidadao` num raio de 20 m e `v_logradouro_segmento` num raio de 60 m em volta da poligonal).
- `novo/viasCalc.ts` (usado por `consulta.ts` › `viasDaArea`, no lote e na poligonal): a classificação viária da CET só das ruas de frente, ligadas pelo `codlog`, uma por rua com a mais alta; e a rua sem saída, deduzida da rede de `v_logradouro_segmento` num raio de 400 m (o GeoSampa não tem esse dado pronto). Custa dois pedidos a mais por consulta (lotes a 20 m e eixos a 400 m).
- `lib/camadas.ts`: como cada camada aparece (tema, texto, gravidade).
- Protótipo: `proto_geosampa.js`, `proto_lotesgeo.js`, `proto_restricoes.js` (e a planta em PDF e o DXF do lote, que o React ainda não gera).

**Quota Ambiental (PA).** O GeoSampa não tem a camada do Mapa 3 da Lei 16.402; ela vem de `docs/dados/quota-ambiental-3550308.json` (seção 15), lida por `consulta.ts:96`.

**Custo.** Nenhum (serviço público).

**Limites e riscos.** É uma API **interna da prefeitura**, sem contrato: nomes de camadas e atributos mudam sem aviso (por exemplo, `perimetro_zona_lei_18081_24` e `_18177_24` são as leis de zoneamento de 2024). O servidor é lento em horário de pico.

**Quando quebra.**
1. "O GeoSampa não respondeu em 30 segundos": servidor lento; tente de novo (o código já tenta uma vez).
2. "GeoSampa respondeu 4xx/5xx": abra o mesmo pedido no navegador pelo endereço publicado (`https://<serviço>.run.app/geosampa/geoserver/geoportal/ows?service=WFS&request=GetCapabilities`). 404 do Caddy: o caminho não está na lista acima. 403 do GeoSampa: ele passou a conferir outro cabeçalho; ajuste o repasse no `Caddyfile`.
3. Camada sumiu ou mudou de nome: veja o `GetCapabilities`, atualize `GEO_CAMADAS` (`consulta.ts`) e `CAMADAS_TEMA` (`lib/camadas.ts`), e regrave as respostas dos testes do protótipo (`GRAVAR=1 node tools/prototipo/testes/tgeo.js`, com um Caddy local na porta 8099).
4. "A busca no GeoSampa funciona na versão publicada": você está em `localhost`.

---

## 10b. IPTU de São Paulo (notificação de lançamento)

- **O quê:** valor venal (terreno e construção) e IPTU do exercício de cada SQL, mais o conteúdo do cálculo (NL, áreas, testada, área construída, uso, padrão, ano, valor do m², fatores, alíquota, descontos, impostos predial e territorial, total, vencimento da 1ª prestação). Não traz o **valor venal de referência** (ITBI), que é outro serviço da Prefeitura, nem o valor de cada parcela.
- **Como:** o portal `notcertiptu.prefeitura.sp.gov.br` não tem API. O serviço `services/iptu` (Cloud Run `terrenos-iptu`) abre um Chromium sem tela, entra com a **Senha Web** (CPF ou CNPJ, 11 ou 14 dígitos, e senha em `IPTU_CPF`/`IPTU_SENHA`, do Secret Manager; o portal usa o mesmo campo `#cpfCnpj` e, com CNPJ, também oferece o perfil "Titular : Cnpj"), escolhe o perfil Titular se pedir, consulta SQL e exercício, gera a única notificação "Ativa" com proprietário e compromissário em branco (a via sai com o contribuinte em sigilo fiscal) e baixa o PDF. A sessão do navegador é reaproveitada até 10 min parada; expirada, refaz o login uma vez.
- **Leitura do PDF** (`src/notificacao.js`): pdf.js extrai texto com posição; dados cadastrais = valor à direita do rótulo; tabelas do demonstrativo = valor logo abaixo, na coluna do rótulo mais próximo à esquerda. Rótulo que falta → `PDF_NAO_RECONHECIDO` (o layout mudou). Valor venal = bases de cálculo (terreno incorporado + não incorporado; construção); IPTU anual = total a pagar.
- **Gravação:** em `app.inscricao_valores` com o token de quem pediu (RLS e auditoria normais), `fonte` "Prefeitura de São Paulo: notificação de lançamento NL xx", `data_verificacao` = hoje, `notificacao` = o JSON lido.
- **Limites e riscos:** uma emissão por vez (30 a 60 s); captcha não é resolvido (409); mudança no site quebra a leitura; datacenter do Google pode receber captcha mais vezes; não se sabe ainda se a Senha Web emite para SQL de terceiros (primeiro teste a fazer). Fora de São Paulo, nada (IPTU digitado).
- **Fila em segundo plano** (pedido do Moises, 9/nov/2026): `POST /iptu/fila {inscricao_ids}` (até 60) confere o login, lê as inscrições pela RLS, ignora as de fora de São Paulo, confere a edição e responde 202 na hora; um laço consulta uma por vez (`gravar`, o mesmo de `/consultar`) com o token de quem pôs na fila. A situação de cada SQL (`na_fila`, `consultando`, `ok`, `erro` com a mensagem) fica na memória por 1 hora e sai por `POST /iptu/situacao {inscricao_ids}` (só das inscrições que a RLS mostra). Limitações: memória (uma instância; reinício perde a fila, e a ficha põe de novo o que falta ao abrir), o token vence em cerca de 1 h (SQL que ficou para trás dá erro e a ficha tenta de novo noutra visita), precisa de `--no-cpu-throttling` para o laço andar depois da resposta.
- **Front:** `lib/iptu.ts` (`pedirIptu`, `filaIptu`, `situacaoIptu`). `consultarTerreno` (`novo/consulta.ts`), chamado no Novo terreno, ao incluir SQL e em Selecionar lotes, põe os SQLs na fila. `ficha/Iptu.tsx` põe na fila o SQL de São Paulo sem o IPTU da Prefeitura (uma vez por página), consulta `/situacao` de 4 em 4 s enquanto há pendente e mostra a seção carregando; "Buscar de novo" usa `/iptu/consultar`. Mensal = anual ÷ 10. Em São Paulo o formulário de IPTU da janela do SQL some; fora de São Paulo, `FormIptu` (`ficha/Partes.tsx`) aparece também na seção.
- **Testes:** `cd services/iptu && npm test`.

## 11. Laser 2020 / MDT do GeoSampa

**Para quê.** Cotas de alta precisão (MDT 1:1000 de 2020, folhas `.laz`) para a classificação topográfica em 7 perfis e o topográfico preliminar em São Paulo. É **sempre** a fonte em São Paulo: se falhar, erro com "Tentar de novo", nunca o Google (decisão de 27/out/2026).

**Onde.**
- Protótipo: `proto_topo.js` (`TOPO_MDT`, `:28`: `/geosampa/Download/File/125?key=cd_quadricula&value=<folha>`; as folhas que cobrem a área vêm da camada `geoportal:quadricula_folha_mdt_mds_2020`). As folhas são lidas no navegador pelo **laz-perf 0.0.7** (`https://cdn.jsdelivr.net/npm/laz-perf@0.0.7/lib/web/`, ou a meta `lazperf-url`).
- Ferramenta: `tools/topografia/medir.py` (seção 15).
- Banco: `app.topografia_config`, `app.classificar_topografia`, `app.registrar_topografia`.
- React: o relevo medido sozinho (`topo/relevo.ts` › `medirRelevo`, `cotasLaser` em `topo/gerar.ts`, desde 10/nov/2026). As folhas são lidas pelo **laz-perf 0.0.7 do npm** (versão fixa no `package.json`), empacotado com o app e carregado só quando o laser é usado (o `.wasm` sai em `/assets`): o React não carrega script de CDN. O topográfico de São Paulo ainda não.

**Custo.** Nenhum. **Limites:** cada folha tem vários MB; terreno grande baixa várias.

**Quando quebra.** O caminho `Download/File/125` é o id da camada de articulação do MDT 2020 no Novo GeoSampa; se a prefeitura mudar o id, o download devolve outra coisa. Confira no site do Novo GeoSampa e atualize o `Caddyfile` (lista de caminhos) e o `proto_topo.js`.

---

## 12. GeoSanja (Prefeitura de São José dos Campos)

**Para quê.** O mesmo que o GeoSampa, pela inscrição imobiliária de São José dos Campos: a poligonal do lote (sem área cadastral, uso nem endereço) e, das camadas liberadas, zona da LC 623 com a área no lote e o link da ficha, macrozona, centralidade com CA máximo, setor, riscos e restrições; planta (PDF com ortofoto, curvas e zoneamento) e desenho (DXF).

**Por que passa pelo Caddy.** A API do site (`https://geo.sjc.sp.gov.br/v1`) não tem CORS. O repasse (`Caddyfile`, bloco `(geosanja)` e `handle_path /geosanja/*`) tira `Origin`, `Referer`, `Cookie` e `Set-Cookie`, e aceita só:

| Caminho | Método | Para quê |
| --- | --- | --- |
| `/geosanja/v1/autenticar` | GET | token de visitante (`?token=VISITANTE`) |
| `/geosanja/v1/proxy` | GET | repasse de camadas (WMS) |
| `/geosanja/v1/localizar` | POST | busca pela inscrição |
| `/geosanja/v1/inscricao/bycoord` | GET | a inscrição do lote num ponto (`?x=<latitude>&y=<longitude>`; texto puro, vazio na rua) |

**Onde.** No React, `apps/web/src/novo/geosanja.ts` (porte de `proto_geosanja.js`): `GSJ_BASE` (meta `geosanja-url`, senão `origem/geosanja/v1/`; nulo em `localhost`), `gsjLote` (token de visitante, pede outro no 401), `GSJ_CAMADAS` e `consultarLoteSjc`, que grava por `app.registrar_consulta_lote` com `p_lote = {inscricao}`, a poligonal em graus, as camadas pela chave `camada:n` e as zonas com a área no lote (amostragem em grade, `geoAreaZonas` de `novo/consulta.ts`) e a macrozona (MC, ME, MOC) pela camada `macrozoneamentoUrbano`. Roda sozinha ao incluir a inscrição (`consultarTerreno(..., base)`, que em SJC não faz a consulta pela poligonal nem a fila do IPTU) e no "Buscar no GeoSanja" da etiqueta; em seguida a poligonal do terreno é refeita pela soma dos lotes (`refazerPoligonal` em `ficha/Partes.tsx`). `gsjLinhas` monta a lista "Demais parâmetros e restrições" da aba Terreno. Planta (PDF) e desenho (DXF) ficam para a aba Documentos. Protótipo: `proto_geosanja.js`.

**Lotes da quadra (mapa de lotes de SJC).** O visitante não acessa a camada de lotes (WFS negado; a lista de camadas do perfil, `/v1/config`, não tem nenhuma de lotes). `novo/lotesSjc.ts › quadrasSjc` monta as quadras com `bycoord` e `SearchICTool`: grade sobre a poligonal (passo de 4 a 15 m, pulando o que já caiu num lote achado), quadras = setor e quadra da inscrição dos lotes com 10 m² ou mais dentro, e depois pontos a 1,5 m para fora de cada borda dos lotes (a cada 8 m no máximo) até não aparecer lote novo da mesma quadra; a rua responde vazio, o que faz a busca parar nas ruas. Limites: 300 lotes, 1.500 pontos, 8 pedidos em paralelo. O mapa (`novo/LotesGeo.tsx`, modo `sjc`) põe por baixo o Maps Static híbrido (os arruamentos do GeoSanja não têm nome), com a matriz afim do pixel para o UTM tirada de três cantos.

**Acentos (10/nov/2026).** O GeoSanja devolve "?" no lugar das letras acentuadas ("S?o Jos?"). `novo/acentosSjc.ts` troca a palavra pela da lista (mesmo tamanho, letra acentuada onde veio "?"); a lista saiu das camadas liberadas ao visitante.

**Cartório e Zona pelo pino (10/nov/2026).** `cartorioSjc` (camada `circunscricao` do workspace `geoInterno`, atributo `cartorio` 1 ou 2 → "1º CRI"/"2º CRI") e `zonaSjc` (camada `anexo_04`, atributo `regiao`; São Francisco Xavier fica de fora) fazem GetFeatureInfo no pixel do pino, sem raio. `ficha/CartorioAuto.tsx` chama ao abrir a ficha, como em São Paulo, e grava por `app.cartorio_da_prefeitura` e `app.zona_da_prefeitura`, que nunca trocam o digitado.

**Quadras guardadas (10/nov/2026).** Cada quadra montada fica no banco (`app.lotes_prefeitura` e `app.quadras_prefeitura`, ver [banco.md](banco.md)); `novo/lotesBase.ts › baseLotes(empresa)` lê e grava. `quadrasSjc` recebe a base: os lotes guardados em volta da poligonal (30 m) entram antes da grade e cobrem os pontos dela; a quadra montada há menos de 90 dias vem inteira do banco e não é varrida; no fim, guarda o que veio do GeoSanja e marca as quadras montadas (só quando a varredura não parou no limite). O lote acrescentado pelo clique fora dos lotes também é guardado. Falha do banco é ignorada (segue pelo GeoSanja). Conferido ao vivo, com a base simulada em memória: a quadra 41.0024 com 89 a 96 pedidos na primeira abertura e nenhum na segunda, pela inscrição e pela poligonal.

**Plantas de loteamentos aprovados.** O grupo "14 - LOTEAMENTOS APROVADOS" (513 folhas raster escaneadas, da SEURBS) não traz o retângulo na lista de camadas: `tools/geosanja/loteamentos.py` pergunta cada um em `/v1/camada/capabilities/info?layerId=<id>` (direto no site, fora do Caddy) e grava `apps/web/src/novo/loteamentos-sjc.json` (camada, título, retângulo em graus); rodar de novo quando a prefeitura publicar plantas novas. `plantasNoPonto` filtra pelo retângulo e por uma amostra PNG de 16 × 16 px em volta do ponto (sem pixel opaco, a folha não cobre o terreno); `baixarPlanta` pede a folha inteira por `GetMap` JPEG em blocos de até 4000 px (o GeoServer recusa render acima de 64 MB) e monta até 8000 px num canvas. `GetFeatureInfo` e o `/v1/download/camada` não funcionam para essas camadas.

**Custo.** Nenhum. **Limites:** API interna, pode mudar sem aviso (CLAUDE.md). O token de visitante expira; o código pede outro.

**Varredura da cidade.** O processo `tools/geosanja/varredura` roda numa VPS da Hetzner, com cron às 19:00 `America/Sao_Paulo`, e para às 08:55 (janela padrão 19h–9h, `VARREDURA_INICIO_HORA` e `VARREDURA_FIM_HORA`). O Cloud Run Job `varredura-sjc` e o Scheduler ficam pausados. Uma requisição por vez. A montagem da quadra é a mesma da ficha (`novo/lotesSjcPuro.ts`). Grava por `app.varredura_sjc_guardar`, com a mesma semântica de `app.guardar_lotes_prefeitura` (PR #290): atualiza o que veio, não mexe no lote marcado `da_base` e apaga o que saiu de uma quadra montada por inteiro. Quadra ou lote com menos de 90 dias não é pedido de novo. O progresso é `app.varredura_sjc_relatorio(empresa)`. Deploy, pausa e a estimativa de noites: [tools/geosanja/varredura/README.md](../../tools/geosanja/varredura/README.md). Segredos `varredura-supabase-url` e `varredura-supabase-service-role` no Secret Manager; nada de chave no repositório. 403 ou falha repetida encerra a noite. Não contorna bloqueio.

**Quando quebra.** Teste o token: `https://<serviço>.run.app/geosanja/v1/autenticar?token=VISITANTE`. Respostas gravadas para os testes em `tools/prototipo/testes/geosanja/` (`GRAVAR=1 node tools/prototipo/testes/tgeosjc.js`).

---

## 13. IBGE, setores censitários (Censo 2022)

**Para quê.** As camadas de **renda familiar estimada** e **densidade demográfica bruta** no mapa, e na ficha (aba Entorno) "Renda e população do entorno" e "Perfil da população" por raio (500 m, 1, 2, 3 km e Poligonal). Cidades com dados: São Paulo (`3550308`) e São José dos Campos (`3549904`).

**De onde vem.** O FTP público do IBGE (`https://ftp.ibge.gov.br/Censos/Censo_Demografico_2022`): malha oficial dos setores, agregados de renda do responsável, demografia, domicílios e básico, e a composição das áreas de ponderação. Só a ferramenta de geração fala com o IBGE; o sistema lê arquivos prontos.

**Onde.**
- Arquivos: `docs/dados/setores-<município>-2022.json` (geometria simplificada a ~1 m e valores) e `docs/dados/demografia-<município>-2022.json`, servidos em `/prototipo/dados/` (o `Dockerfile` copia `docs/dados` para `/srv/prototipo/dados`).
- Metodologia (fonte única para protótipo, React e teste do banco): `tools/setores/metodologia_renda.json` (16 faixas, cores, fator familiar 1,6, PNAD 2.148 → 2.956), `metodologia_densidade.json` (10 faixas), `demografia.json` (grupos de idade e domicílio e, em `idadeMedia`, os pontos médios da idade média estimada, só no front).
- React: `mapa/setores.ts` (`SET_MUN`, `:17`; carrega e junta os municípios), `mapa/CamadasSetor.tsx`, `ficha/Entorno.tsx`.
- Protótipo: `proto_setores.js` (`SET_MUN` lá também).
- Banco: `app.setores_censitarios`, `app.setor_valores`, `app.perfil_area`, `app.perfil_terreno` (carga gerada pela mesma ferramenta).

**Regras que não se mudam sem o Moisés.** Faixas fixas, nunca quantis; renda sempre "estimada", com o V06004 original à vista; setor em sigilo fica sem cor, "não divulgado", nunca zero; idade só nos cortes exatos do IBGE (a idade média é a única estimativa, pedida pelo Moisés em 9/nov/2026, e sempre dita "estimada").

**Custo.** Nenhum. **Limites:** a primeira geração de São Paulo baixa cerca de 600 MB. Os arquivos de São Paulo têm 5,2 MB (setores) e 4,4 MB (demografia), e o navegador baixa tudo na primeira vez que liga a camada.

**Quando quebra.** "Camada indisponível": o `fetch` de `/prototipo/dados/...` falhou (no `npm run dev` sempre falha; ver [front.md › Como rodar](front.md#16-como-rodar-checar-tipos-e-gerar-o-build)). Cidade nova: seção 15.

---

## 14. Monitor de mercado (Órulo) e a Concorrência

**Para quê.** Os empreendimentos de outras incorporadoras no mapa (camada Concorrência), o card de cada um com o resumo das tipologias, "Ver tabela completa" com todas as unidades, e o quadro "Concorrência no entorno" da ficha (R$/m² e VSO a 1, 2 e 3 km).

**De onde vem.** O **monitor de mercado** é outro sistema (repositório `Mbekerman/bkm-monitor-mercado`): um coletor que lê o Órulo e grava nas tabelas `public.im_*` do **mesmo projeto Supabase** (BKM_Desenvolvimento_Imobiliario). O agrupamento das unidades em tipologias também mora lá (`im_grupos`, `im_unidade_grupos`, `im_mercado_config`, `im_agrupar`, `im_reagrupar`). O BKM Terrenos **nunca escreve** no esquema `public`.

**Duas formas de leitura.**
1. **Retrato** em `docs/dados/mercado.json` (3,2 MB), gerado por `tools/mercado/` (seção 15). Lido pelo React (`mapa/mercado.ts:47`) e pelo protótipo em `/prototipo/dados/mercado.json`. É o que desenha o mapa e o entorno.
2. **Ao vivo**, só a tabela completa de um empreendimento: a função só de leitura `public.im_tabela_empreendimento(p_id)`, aberta à chave publicável.
   - React: `supabase.schema('public').rpc('im_tabela_empreendimento', { p_id })` (`mapa/Concorrencia.tsx:247`), pelo cliente normal (o esquema `public` precisa estar exposto na API).
   - Protótipo: `fetch` direto em `https://mghqcsycuurjezoiiyfp.supabase.co/rest/v1/rpc/im_tabela_empreendimento` com a chave publicável escrita no código (`proto_mercado.js:307`). Ver [seguranca.md](seguranca.md).

**Credencial.** Do Órulo: só o coletor do monitor tem (fora deste repositório). Do Supabase: a chave publicável.

**Limites.** O VSO conta só as vendas que o monitor viu; em 4/nov/2026 o período era curto (24/10 a 1/11). O retrato fica velho até alguém regerá-lo; não há rotina automática.

**Quando quebra.** Mapa sem concorrência: o `mercado.json` não está em `/prototipo/dados/`. Tabela completa com erro: a função mudou no repositório do monitor ou o esquema `public` deixou de estar exposto.

---

## 15. Ferramentas de dados (`tools/`) e como regenerar `docs/dados/`

| Arquivo em `docs/dados/` | Gerado por | Quando regerar |
| --- | --- | --- |
| `setores-3550308-2022.json`, `setores-3549904-2022.json` | `tools/setores/gerar.py` | nova cidade, mudança de PNAD ou fator |
| `demografia-3550308-2022.json`, `demografia-3549904-2022.json` | `tools/setores/gerar.py` | nova cidade, mudança em `demografia.json` |
| `mercado.json` | `tools/mercado/` (SQL + `montar.py`) | para atualizar o retrato da concorrência |
| `quota-ambiental-3550308.json` | `tools/parametros/gerar_quota_ambiental.py` | se a SMUL publicar outro Mapa 3 |

Outros arquivos de configuração que não ficam em `docs/dados/`:

| Arquivo | Quem lê | Como muda |
| --- | --- | --- |
| `tools/setores/metodologia_renda.json`, `metodologia_densidade.json`, `demografia.json` | protótipo (`build.py`), React (import no build), teste do banco | à mão, junto com a migration `20261015000900_setores.sql` (o teste acusa divergência) |
| `tools/parametros/parametros.json` | protótipo (`build.py`), teste do banco | **exportado do banco** por `tools/parametros/exportar.sh` |
| `tools/viabilidade/despesas.json` | protótipo (`build.py`), teste do banco | à mão, junto com a migration `20261015001000_viabilidade.sql` |

Depois de regerar qualquer um, rode `python3 tools/prototipo/build.py` (copia `docs/dados` para `saida/dados` e embute os JSON de configuração) e commite os arquivos gerados. No Cloud Run, os de `docs/dados/` chegam pelo `Dockerfile`.

### `tools/setores/gerar.py`

```bash
pip install geopandas openpyxl
python3 tools/setores/gerar.py --cache /algum/lugar                      # São Paulo (3550308)
python3 tools/setores/gerar.py --cache /algum/lugar --municipio 3549904  # São José dos Campos
```

Baixa do IBGE, confere (setor repetido, renda sem polígono, setor sem área de ponderação, moradores sem renda) e grava os dois JSON da cidade em `docs/dados/` e a carga do banco em `tools/setores/saida/` (`setores.csv`, `valores.csv`, `carga.sql`, para `app.setores_censitarios` e `app.setor_valores`). **Uma cidade por vez**: cada rodada sobrescreve `saida/`; carregue o `carga.sql` de uma antes de gerar a outra. Cidade nova: depois de gerar, inclua o código do IBGE em `SET_MUN` em **dois lugares**: `tools/prototipo/proto_setores.js` e `apps/web/src/mapa/setores.ts:17`. Detalhes em `tools/setores/README.md`.

### `tools/mercado/` (exportar.sql, grupos.sql, montar.py)

1. Rode `exportar.sql` no Supabase do monitor (só leitura) e salve o objeto `dados` em `emps.json`.
2. Rode `grupos.sql` com `:faixa` em partes (`array['0','1','2','3']`, depois `4`–`7`, `8`–`b`, `c`–`f`) e junte as linhas em `grupos.json` (`{id: g}`).
3. Salve a linha de `im_mercado_config` em `config.json`.
4. `python3 tools/mercado/montar.py emps.json grupos.json config.json docs/dados/mercado.json`.
5. `python3 tools/prototipo/build.py`.

Detalhes em `tools/mercado/README.md`.

### `tools/parametros/`

- `exportar.sh`: sobe um Postgres 16 temporário, aplica as migrations (com o `supabase/tests/shim_supabase.sql`) e grava `tools/parametros/parametros.json` a partir da carga de `20261015000260_parametros_urbanisticos.sql`, pelo `exportar.sql`. Rode depois de mudar o catálogo de parâmetros por zona. Precisa do Postgres 16 em `/usr/lib/postgresql/16/bin` (ou `PGBIN=`).
- `gerar_quota_ambiental.py [pasta]`: baixa o SHP do Mapa 3 da Lei 16.402 (`https://gestaourbana.prefeitura.sp.gov.br/wp-content/uploads/2015/06/QA.zip`), junta por PA, fecha as ruas entre quadras (12 m), simplifica em 4 m, passa para WGS84 e grava `docs/dados/quota-ambiental-3550308.json`. Precisa de `pip install pyshp shapely pyproj`.

### `tools/topografia/medir.py`

Mede KMZs pelo laser 2020 com a mesma conta da ficha (declividade média, inclinação do plano, terra mexida e desnível). Foi usado na calibração da classificação topográfica de 4/nov/2026 (8 terrenos de São Paulo classificados pelo Moisés). Fala direto com o GeoSampa (sem o Caddy, porque roda fora do navegador).

```bash
pip install laspy lazrs pyproj shapely numpy
CACHE=/tmp/laser-cache python3 -I tools/topografia/medir.py a.kmz b.kmz
```

### `tools/viabilidade/despesas.json`

Lista padrão dos itens do estudo de viabilidade estática (grupos e bases), copiada para cada empresa nova. Editada à mão; precisa bater com a migration `20261015001000_viabilidade.sql` (o teste do banco lê o arquivo).

---

## 16. Supabase

O banco, o login, o Realtime e as funções. Tudo está em [banco.md](banco.md) e [deploy-e-ambientes.md](deploy-e-ambientes.md). Do ponto de vista de integração:

- **Credenciais no navegador:** `SUPABASE_URL` e `SUPABASE_KEY` (a chave **publicável**, `sb_publishable_…`), injetadas pelo Caddy. A segurança é a RLS.
- **Credencial de servidor:** `SUPABASE_DB_URL` (a cadeia de conexão com a senha do banco), só como segredo do GitHub Actions, para o workflow "Banco no Supabase" (`.github/workflows/banco.yml`).
- **Esquemas expostos na API:** `app`, `fluxo` e `public` (este por causa do `im_tabela_empreendimento`).
- **Extensões:** `postgis` (no esquema `extensions`) e `pg_cron` (para `app.rotina_diaria()`); a publicação `supabase_realtime` precisa ter `app.notificacoes` para o sino ao vivo.

---

## 17. Google Agenda, Meet, Gmail e Drive (planejados)

Nada disso fala com o Google hoje. O que existe:

| Peça | Situação |
| --- | --- |
| Reuniões com o Google Agenda (evento com convite, Meet, respostas, cancelar; depois gravação, transcrição e Anotações do Gemini virando rascunho de "O que foi tratado" e "Encaminhamentos") | **Banco pronto** (`app.reuniao_agenda`, `v_reuniao_convidados`, `app.agenda_confirmar`, `app.agenda_evento_mudou`, `app.agenda_resposta`, `app.registrar_gravacao`, `app.registrar_resumo_ia`, `app.decidir_resumo_ia`; migration `20261015001600_reunioes_agenda.sql`; ver `docs/modelo.md`, "Reuniões com o Google Agenda"). **Protótipo simula** (`proto_agenda.js`). **React não tem.** |
| Função do servidor que lê a fila e grava no Google | **A fazer** (só `service_role`). |
| "Conectar Agenda e Gmail" depois do login (escopos `calendar.events` e `gmail.send`), com o refresh token no **Vault** do Supabase | **A fazer**; falta o Moisés dizer o que o sistema faz na agenda e no e-mail. |
| E-mail das notificações pela conta bkm@bkm.com.br (preferência por tipo e por pessoa, `preferencias_notificacao`, `email_status`) | Banco pronto; **falta a função que envia**. |
| Drive | A bkm@ é "a conta do sistema (e-mails e Drive)" (CLAUDE.md, Saída do protótipo); documentos em pastas estão no plano. Nada implementado. |
| WhatsApp (uazapi) | Depois. |

Confirmado pelo Moisés (4/nov/2026): o plano do Workspace grava e transcreve no Meet e a sincronização vai e volta. **A conferir** na integração: se a API da Agenda liga as Anotações do Gemini sozinha ao criar o evento.

Quando for implementar: a credencial do Google **nunca** vai para o navegador nem para o repositório; o refresh token fica no Vault e só a função do servidor o lê. Ver [seguranca.md](seguranca.md).

---

## 18. Checklist quando "o mapa / a consulta parou"

1. Está na versão publicada? (`localhost` não tem GeoSampa, GeoSanja nem `/prototipo/dados`.)
2. O console do navegador mostra erro do Google? (chave, domínio, API não ativada, faturamento.)
3. O repasse do Caddy responde? (`/geosampa/...?service=WFS&request=GetCapabilities`, `/geosanja/v1/autenticar?token=VISITANTE`.)
4. O arquivo de dados existe? (`/prototipo/dados/setores-3550308-2022.json`, `mercado.json`.)
5. A função do banco existe no Supabase? (ver [banco.md](banco.md).)
6. Alguém mudou o `Caddyfile`? Os repasses só aceitam os caminhos listados acima.
