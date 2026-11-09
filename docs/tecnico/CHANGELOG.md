# Registro de mudanças

Toda mudança que entra na `develop` ganha uma linha aqui, no mesmo PR (ver [como-manter.md](como-manter.md)). Do mais recente ao mais antigo. O que aconteceu antes de 8/nov/2026 está resumido em [historico.md](historico.md).

## 2026-11-09

- #247 Busca da barra superior: `mapa/dados.ts` (`carregar`) passa a ler `terrenos` (logradouro, número, CEP), `matriculas.numero` e `inscricoes_municipais.inscricao` da empresa e `bate()` procura também neles, sem acento, e casa matrícula e SQL só pelos dígitos (palavra só de dígitos e pontuação, 3+ dígitos). `Moldura.tsx` leva ao `/mapa` quando se digita em outra página. Completude (`ficha/dados.ts`): o item "Visita técnica" só conta com `INFRA_PORTADA = true` (hoje `false`, a aba Infraestrutura não foi portada); vale para a ficha, o painel e o filtro "ficha com menos de N%". Por quê: o manual (#244) achou o texto da busca prometendo matrícula e SQL sem procurar, e a ficha presa abaixo de 100%. Sem mudança no banco nem em permissão (as tabelas já eram lidas pela ficha com a mesma RLS).

## 2026-11-08

- #246 Frentes do terreno pela poligonal em São Paulo (`novo/frentesCalc.ts`, `novo/frentes.ts`): metro a metro da divisa, rua = fora de lote do GeoSampa (`lote_cidadao`), nome pelo eixo de `v_logradouro_segmento`; grava `posicao_quadra`, `testada_principal_m` (vazia ou medida antes) e uma `confrontacoes` de frente por rua (fonte "Medida pela poligonal (GeoSampa)"). Medida no cadastro, em `verificarEndereco` (toda poligonal salva) e na aba Terreno. Sem mudança no banco.
- #245 Manual técnico em `docs/tecnico/` (arquitetura, banco, funções, testes, front, protótipo, integrações, deploy, histórico, como manter) e avaliação de segurança de 8/nov (`seguranca.md`). Regra nova no `CLAUDE.md`: toda mudança atualiza este registro e o arquivo do manual do assunto.
