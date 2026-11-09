/* eslint-disable @typescript-eslint/no-explicit-any */
// Como cada camada do GeoSampa aparece para o usuário (proto_geosampa.js › GEO_CAMADAS: tema, texto de cada feição e
// gravidade; geoVals e geoLinhas). As camadas consultadas e os atributos guardados estão em novo/consulta.ts.
type Fmt = (p: any) => string | null | undefined;
const nf = (v: unknown, d = 0) => (v == null || v === '' ? '' : Number(v).toLocaleString('pt-BR', { maximumFractionDigits: d }));
export const geoTit = (s: unknown) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim()
  .replace(/(^|\s)(\S)/g, (_m, a, b) => a + b.toUpperCase()).replace(/\b(De|Da|Do|Das|Dos|E)\b/g, (x) => x.toLowerCase());
const j = (...xs: unknown[]) => xs.filter(Boolean).join(' · ');
/** a distância medida até o terreno (ou lote) e a área que a faixa atinge, quando a consulta guardou */
const dist = (p: any) => (p._dist_m == null ? '' : p._dist_m === 0 ? 'encosta no terreno' : 'a ' + nf(p._dist_m, 1) + ' m');
const atinge = (p: any) => (p._area_m2 == null ? '' : p._area_m2 > 0 ? 'atinge ' + nf(p._area_m2) + ' m²' : 'só encosta na divisa');

/** [camada, tema, texto da feição, gravidade (chip): '', 'warn' ou 'crit'] */
export const CAMADAS_TEMA: [string, string, Fmt, string][] = [
  ['perimetro_zona_lei_18081_24', 'Zona (LPUOS)', (p) => p.cd_zoneamento_perimetro, ''],
  ['perimetro_zona_lei_18177_24', 'Zona (Lei 18.177/2024)', (p) => p.cd_zoneamento_perimetro, ''],
  ['pde2014_v_zeis_04_map_v2', 'ZEIS 1', (p) => p.cd_zoneamento_perimetro || 'ZEIS-1', 'warn'],
  ['pde2014_v_zeis_04a_map_v2', 'ZEIS 2 a 5', (p) => p.cd_zoneamento_perimetro, 'warn'],
  ['pde2014_v_eetr_03_map_v2', 'Eixo de estruturação', (p) => p.nm_perimetro_divisao_pde || 'Eixo', ''],
  ['pde2014_v_eixo_prv_03a_map_v2', 'Eixo previsto', (p) => p.nm_perimetro_divisao_pde || 'Eixo previsto', ''],
  ['eixo_ativado_decreto', 'Eixo ativado por decreto', (p) => j(p.nm_eixo_ativado_decreto, p.tx_decreto), ''],
  ['pde_macroarea_lei_18209', 'Macroárea', (p) => `${p.sg_macroarea} · ${p.nm_macroarea}`, ''],
  ['pde_fator_planejamento_residencial', 'Fator de planejamento residencial', (p) => p.tx_fator_planejamento_residencial, ''],
  ['operacao_urbana', 'Operação urbana', (p) => p.nm_operacao_urbana, 'warn'],
  ['subsetor_operacao_urbana', 'Setor da operação urbana', (p) => j(p.nm_setor_operacao_urbana, p.nm_subsetor_operacao_urbana), ''],
  ['manancial_guarapiranga', 'Manancial Guarapiranga', (p) => p.dc_classe || 'Guarapiranga', 'crit'],
  ['manancial_billings', 'Manancial Billings', (p) => p.dc_classe || 'Billings', 'crit'],
  ['manancial_juquery', 'Manancial Alto Juquery', (p) => p.dc_classe || 'Alto Juquery', 'crit'],
  ['patrimonio_cultural_bem_tombado', 'Bem tombado', (p) => p.nm_area_tombada, 'crit'],
  ['patrimonio_cultural_area_envoltoria_CONPRESP', 'Área envoltória Conpresp', (p) => `${p.nm_area} (${p.tx_resolucao_conpresp})`, 'warn'],
  ['patrimonio_cultural_area_envoltoria_CONDEPHAAT', 'Área envoltória Condephaat', (p) => `${p.nm_area} (${p.tx_resolucao_condephaat})`, 'warn'],
  ['patrimonio_cultural_area_envoltoria_IPHAN', 'Área envoltória Iphan', (p) => `${p.nm_area} (${p.tx_resolucao_iphan})`, 'warn'],
  ['zona_especial_preservacao_cultural_apc', 'ZEPEC-APC', (p) => p.nm_area || p.tx_nome || 'ZEPEC-APC', 'warn'],
  ['patrimonio_cultural_area_arqueologica', 'Interesse arqueológico', (p) => p.nm_area || p.nm_area_arqueologica || 'Área de interesse arqueológico', 'warn'],
  ['area_contaminada_reabilitada_svma', 'Área contaminada ou reabilitada', (p) => j(p.dc_classificacao_area_contaminada, p.tx_contaminante), 'crit'],
  ['GEOSAMPA_area_contaminada_sigac', 'Suspeita de contaminação', (p) => j(p.dc_tipo_situacao, p.dc_atividade), 'crit'],
  ['geoconvias_lei_melhoramento_vigente', 'Melhoramento viário', (p) => j(`Lei ${p.cd_numero_lei_vigente}/${p.an_lei_melhoramento_vigente}`, p.tx_descricao_tipo_melhoramento, atinge(p)), 'warn'],
  ['geoconvias_faixa_nao_edificavel', 'Faixa não edificável', (p) => j(+p.qt_metro_largura_faixa > 0 && `faixa de ${nf(p.qt_metro_largura_faixa, 2)} m`, `Lei ${p.cd_numero_lei_vigente}${p.an_lei_melhoramento_vigente ? '/' + p.an_lei_melhoramento_vigente : ''}`, atinge(p)), 'warn'],
  ['drenagem', 'Córrego a até 30 m', (p) => j(p.nm_acidente || p.nm_descritivo || 'Córrego', p.nm_tipo_curso_hidrografia || p.nm_tipo_trecho, dist(p)), 'warn'],
  ['area_risco_geologico_v2', 'Risco geológico', (p) => j(p.tx_grau_de_risco_geologico, p.tx_tipo_processo_geologico), 'crit'],
  ['restricao_geotecnica', 'Restrição geotécnica', (p) => p.nm_perimetro, 'warn'],
  ['mancha_inundacao_5', 'Mancha de inundação (5 anos)', (p) => p.nm_bacia_hidrografica, 'crit'],
  ['mancha_inundacao_25', 'Mancha de inundação (25 anos)', (p) => p.nm_bacia_hidrografica, 'warn'],
  ['mancha_inundacao_100', 'Mancha de inundação (100 anos)', (p) => p.nm_bacia_hidrografica, 'warn'],
  ['area_influencia_metro', 'Influência do Metrô', () => 'Consultar o Metrô antes de projetar', 'warn'],
  ['area_influencia_trem', 'Influência da CPTM', () => 'Consultar a CPTM antes de projetar', 'warn'],
  ['GEOSAMPA_cgpabi_vegetacao_significativa', 'Vegetação significativa', (p) => j(p.tx_tema || 'Vegetação significativa', p.an_vegetacao_significativa), 'warn'],
  ['area_contaminada_reabilitada_svma@30', 'Área contaminada ou reabilitada a até 30 m', (p) => j(p.dc_classificacao_area_contaminada, p.tx_contaminante) || 'Área contaminada', 'warn'],
  ['GEOSAMPA_area_contaminada_sigac@30', 'Suspeita de contaminação a até 30 m', (p) => j(p.dc_tipo_situacao, p.dc_atividade) || 'Suspeita de contaminação', 'warn'],
  ['GEOSAMPA_cadparcs_parque_unidade_conservacao', 'Parque ou unidade de conservação', (p) => j(p.nm_area, p.tx_tipo_categoria), 'warn'],
  ['pde_outra_unidade_conservacao', 'Unidade de conservação (PDE)', (p) => j(p.nm_unidade_conservacao, p.tx_tipo_categoria_parque_unidade_conservacao), 'warn'],
  ['arvore_v2', 'Árvores na calçada a até 30 m', () => 'Árvore', ''],
  ['classificacao_viaria_cet', 'Classificação viária (CET)', (p) => `${geoTit(p.nm_logradouro_completo)}: ${p.dc_tipo_classificacao_viaria || 'sem classificação'}`
    + (p.outras_classificacoes?.length ? ` (trecho ${p.outras_classificacoes.join(', ')})` : ''), ''],
  ['enquadramento_vila', 'Vila a até 20 m', (p) => j(p.tx_indicador_enquadramento_vila || 'Vila', dist(p)), 'warn'],
  ['rua_sem_saida', 'Rua sem saída', (p) => `${geoTit(p.logradouro)}: ${p.pedestre ? 'só passagem de pedestres' : 'sem saída'}`, 'warn'],
  ['linha_alta_tensao_v2', 'Linha aérea de alta tensão a até 30 m', (p) => j('Linha aérea', dist(p)), 'warn'],
  ['linha_subterranea_alta_tensao', 'Linha subterrânea de alta tensão a até 30 m', (p) => j(p.nm_linha_subterranea_alta_tensao || 'Linha subterrânea', dist(p)), 'warn'],
  ['ferrovia_mdc_v2', 'Ferrovia a até 30 m', (p) => j('Ferrovia', dist(p)), 'warn'],
  ['rede_comgas', 'Rede da Comgás a até 100 m', (p) => 'a ' + nf(p._dist_m) + ' m', ''],
  ['zona_fiscal', 'Zona fiscal', (p) => p.sg_zona_fiscal, ''],
  ['cartorio_registro_imovel', 'Cartório de registro de imóveis', (p) => j(p.cd_numero_cartorio && p.cd_numero_cartorio + ' CRI', p.nm_subdistrito), ''],
];
export const CAMADA = Object.fromEntries(CAMADAS_TEMA.map((c) => [c[0], c]));

/** os textos de uma camada: árvores pela contagem, Comgás só a mais perto, "a até N m" sem o que já toca o lote */
export function geoVals(k: string, fs: any[] | undefined, fmt?: Fmt): string[] {
  if (!fs || !fs.length) return [];
  if (k === 'arvore_v2') return [fs.length + (fs.length > 1 ? ' árvores' : ' árvore')];
  if (k === 'rede_comgas') return [fs[0]._dist_m === 0 ? 'passa no lote' : 'a ' + nf(fs[0]._dist_m) + ' m'];
  if (/@/.test(k)) { fs = fs.filter((x) => x._dist_m > 0); if (!fs.length) return []; }
  const f = fmt ?? CAMADA[k]?.[2];
  if (!f) return [];
  /* a mesma coisa em vários trechos (a linha de alta tensão, o córrego) aparece uma vez, com a distância do mais perto */
  const txt = (x: any) => { try { return f(x) || null; } catch { return null; } };
  const vistos = new Map<string, string>();
  for (const x of fs) { const t = txt(x), base = txt({ ...x, _dist_m: null }) ?? t; if (t && base && !vistos.has(base)) vistos.set(base, t); }
  return [...vistos.values()];
}

export interface LinhaToca { tema: string; grav: string; erro: boolean; vals: string[] }
/** "O que toca o lote", camada a camada (sem as zonas, que têm quadro próprio) */
export function geoLinhas(camadas: Record<string, any[]>, erros: string[]): LinhaToca[] {
  return [
    ...(camadas.quota_ambiental ? [{ tema: 'Perímetro de qualificação ambiental (Quota Ambiental)', grav: '', erro: false, vals: camadas.quota_ambiental.map((x) => x.pa) }] : []),
    ...CAMADAS_TEMA.filter((c) => !/^zona_fiscal$|^perimetro_zona/.test(c[0]))
      .map(([k, tema, fmt, grav]) => ({ tema, grav, erro: erros.includes(k), vals: geoVals(k, camadas[k], fmt) })),
  ];
}
