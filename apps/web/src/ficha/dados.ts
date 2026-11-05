import { supabase } from '../lib/supabase';

// Dados da ficha do terreno (porte de pgFicha, abaGeral e completude do protótipo: tools/prototipo/proto.js e proto_mod.js).
// Tudo vem do banco pela RLS da empresa; aqui só se junta o que o topo, as abas e a Visão geral mostram.

type R = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export interface EtapaF { k: string; nome: string; subs: { k: string; nome: string }[] }
export interface FaseF { k: string; nome: string; entrada: boolean; ativo: boolean }
export interface ProcF { id: string; fase: string; etapa: string; sub: string | null; status: string; desde: string | null; encerrado: string | null }
export interface Transicao { processo: string; deEtapa: string | null; paraEtapa: string | null; em: string }

export interface Ficha {
  id: string; codigo: string; nome: string; versao: number;
  logradouro: string | null; numero: string | null; bairro: string | null; municipio: string | null; uf: string | null; zona: string | null;
  lat: number | null; lng: number | null; poly: [number, number][] | null;
  area: number | null; fonteArea: string | null; testada: number | null; ocupacao: string | null;
  dataIdent: string | null; criadoEm: string | null;
  resp: { nome: string; foto: string | null } | null;
  /* processo atual (fase aberta mais adiante) e negociação */
  fase: string | null; faseNome: string | null; etapaNome: string | null; subNome: string | null; status: string | null;
  negId: string | null; negStatus: string | null; temp: number | null;
  zonas: string | null; vgv: number | null; unidades: number | null;
  valorPedido: number | null;
  ofertaEntrada: { valor: number | null; data: string } | null;
  corretor: { nome: string; imob: string | null } | null;
  estacao: { nome: string; pe: number | null; seg: number | null } | null; entornoBuscado: boolean;
  topo: { perfil: string; decl: number | null; desnivel: number | null } | null;
  /* linha do tempo do topo */
  fases: FaseF[]; etapasEnt: EtapaF[]; etapasPorFase: Record<string, EtapaF[]>; procs: ProcF[]; trans: Transicao[];
  /* completude */
  qMat: number; qInsc: number; temProprietario: boolean; infraNV: number;
  /* contagem das abas */
  qComercial: number; qViab: number; qMassa: number; qDocs: number;
}

export const FONTE_AREA: Record<string, string> = {
  documental: 'Documental (matrícula)', cadastral: 'Cadastral (IPTU)', levantamento: 'Levantamento topográfico', estimativa: 'Estimativa', poligonal: 'Poligonal (desenho no mapa)',
};
export const ZONA: Record<string, string> = {
  leste: 'Leste', oeste: 'Oeste', norte: 'Norte', sul: 'Sul', centro: 'Centro', sudeste: 'Sudeste', sudoeste: 'Sudoeste', nordeste: 'Nordeste', noroeste: 'Noroeste',
};
export const TEMP = ['', 'Muito fria', 'Fria', 'Morna', 'Quente', 'Muito quente'];
export const TP_N: Record<string, string> = {
  plano: 'Plano', inclinado: 'Inclinado', acidentado_leve: 'Acidentado leve', acidentado_mediano: 'Acidentado mediano',
  acidentado_intenso: 'Acidentado intenso', acidentado_agudo: 'Acidentado agudo', acidentado_critico: 'Acidentado crítico',
};

function anel(g: unknown): [number, number][] | null {
  const o = g as { type?: string; coordinates?: unknown } | null;
  if (!o?.coordinates) return null;
  const r = (o.type === 'MultiPolygon' ? (o.coordinates as number[][][][])[0]?.[0] : (o.coordinates as number[][][])[0]) ?? [];
  const pts = r.map(([lng, lat]) => [lat, lng] as [number, number]);
  if (pts.length > 1 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]) pts.pop();
  return pts.length >= 3 ? pts : null;
}

const conta = (r: { count: number | null }) => r.count ?? 0;

/** carrega a ficha pelo código (A123); null = código que não existe na empresa */
export async function carregarFicha(empresa: string, codigo: string): Promise<Ficha | null> {
  const v = await supabase.from('v_terrenos')
    .select('id,codigo,nome,versao,logradouro,numero,bairro,zona,municipio,uf,area_adotada_m2,fonte_area_adotada,data_identificacao,responsavel_id,fase,fase_nome,etapa_nome,subetapa_nome,processo_status,negociacao_id,negociacao_status,temperatura,zonas_siglas,zoneamentos,vgv,valor_pedido,diligencias_abertas')
    .eq('empresa_id', empresa).eq('codigo', codigo).maybeSingle();
  if (v.error) throw v.error;
  if (!v.data) return null;
  const x = v.data as R, id = x.id as string, neg = x.negociacao_id as string | null;
  const cnt = { count: 'exact' as const, head: true };
  const [t, u, of1, cor, est, bus, pn, fs, es, ss, ps, mat, ins, pes, inf, itI, prop, reu, viab, mas, docs] = await Promise.all([
    supabase.from('terrenos').select('latitude,longitude,poligono_geojson,testada_principal_m,situacao_ocupacao,topo_perfil,topo_declividade_pct,topo_desnivel_m,criado_em').eq('id', id).single(),
    x.responsavel_id ? supabase.from('usuarios').select('nome,email,foto_url').eq('user_id', x.responsavel_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    supabase.from('ofertas').select('valor_pedido,data_oferta', { count: 'exact' }).eq('terreno_id', id).order('data_oferta').order('criado_em').limit(1),
    supabase.from('terreno_corretores').select('corretores(imobiliaria,pessoas(nome_razao_social))').eq('terreno_id', id).eq('principal', true).limit(1),
    supabase.from('v_terreno_entorno').select('nome,distancia_pe_m,duracao_pe_s').eq('terreno_id', id).eq('categoria', 'metro_trem').order('distancia_pe_m', { nullsFirst: false }).limit(1),
    supabase.from('terreno_entorno_buscas').select('terreno_id', cnt).eq('terreno_id', id),
    neg ? supabase.from('processos').select('viabilidade_id').eq('id', neg).maybeSingle() : Promise.resolve({ data: null, error: null }),
    supabase.from('fases_modelo').select('codigo,nome,ordem,entrada,ativo').eq('empresa_id', empresa).order('ordem'),
    supabase.from('etapas_modelo').select('fase,codigo,nome,ordem').eq('empresa_id', empresa).order('ordem'),
    supabase.from('subetapas_modelo').select('fase,etapa,codigo,nome,ordem,ativo').eq('empresa_id', empresa).order('ordem'),
    supabase.from('processos').select('id,fase,etapa_atual,subetapa_atual,status,etapa_desde,data_inicio,data_encerramento').eq('terreno_id', id).is('parte_id', null).order('data_inicio'),
    supabase.from('matriculas').select('id', cnt).eq('terreno_id', id),
    supabase.from('inscricoes_municipais').select('id', cnt).eq('terreno_id', id),
    supabase.from('terreno_pessoas').select('id', cnt).eq('terreno_id', id).eq('papel', 'proprietario'),
    supabase.from('v_terreno_infraestrutura').select('item,disponibilidade').eq('terreno_id', id),
    supabase.from('itens_infraestrutura').select('codigo,viabilidade_tecnica'),
    neg ? supabase.from('propostas').select('id', cnt).eq('processo_id', neg) : Promise.resolve({ count: 0, error: null }),
    supabase.from('reunioes').select('id', cnt).eq('terreno_id', id),
    supabase.from('viabilidades').select('id', cnt).eq('terreno_id', id),
    supabase.from('estudos_massa').select('id', cnt).eq('terreno_id', id),
    supabase.from('documentos').select('id', cnt).eq('terreno_id', id),
  ]);
  for (const r of [t, u, of1, cor, est, bus, pn, fs, es, ss, ps, mat, ins, pes, inf, itI, prop, reu, viab, mas, docs]) if (r.error) throw r.error;
  const tr = t.data as R;
  /* unidades do estudo válido: a viabilidade presa à negociação */
  let unidades: number | null = null;
  const vid = (pn.data as R | null)?.viabilidade_id;
  if (vid) {
    const vb = await supabase.from('viabilidades').select('unidades').eq('id', vid).maybeSingle();
    if (vb.error) throw vb.error;
    unidades = (vb.data as R | null)?.unidades ?? null;
  }
  const procs: ProcF[] = (ps.data as R[]).map((p) => ({ id: p.id, fase: p.fase, etapa: p.etapa_atual, sub: p.subetapa_atual, status: p.status, desde: p.etapa_desde, encerrado: p.data_encerramento }));
  const trs = procs.length
    ? await supabase.from('processo_transicoes').select('processo_id,de_etapa,para_etapa,em').in('processo_id', procs.map((p) => p.id)).order('em')
    : { data: [], error: null };
  if (trs.error) throw trs.error;
  const fases: FaseF[] = (fs.data as R[]).map((f) => ({ k: f.codigo, nome: f.nome, entrada: !!f.entrada, ativo: f.ativo !== false }));
  const etapasPorFase: Record<string, EtapaF[]> = {};
  for (const f of fases) etapasPorFase[f.k] = (es.data as R[]).filter((e) => e.fase === f.k).map((e) => ({
    k: e.codigo, nome: e.nome,
    subs: (ss.data as R[]).filter((s) => s.fase === f.k && s.etapa === e.codigo && s.ativo !== false).map((s) => ({ k: s.codigo, nome: s.nome })),
  }));
  const ent = fases.find((f) => f.entrada)?.k;
  const visita = new Set((itI.data as R[]).filter((i) => !i.viabilidade_tecnica).map((i) => i.codigo));
  const o1 = (of1.data as R[])[0];
  const c = ((cor.data as R[])[0]?.corretores ?? null) as R | null;
  const e1 = (est.data as R[])[0];
  const ru = u.data as R | null;
  return {
    id, codigo: x.codigo, nome: x.nome ?? x.codigo, versao: x.versao,
    logradouro: x.logradouro, numero: x.numero, bairro: x.bairro, municipio: x.municipio, uf: x.uf, zona: x.zona,
    lat: tr.latitude, lng: tr.longitude, poly: anel(tr.poligono_geojson),
    area: x.area_adotada_m2, fonteArea: x.fonte_area_adotada, testada: tr.testada_principal_m, ocupacao: tr.situacao_ocupacao,
    dataIdent: x.data_identificacao, criadoEm: tr.criado_em,
    resp: ru ? { nome: ru.nome || ru.email, foto: ru.foto_url } : null,
    fase: x.fase, faseNome: x.fase_nome, etapaNome: x.etapa_nome, subNome: x.subetapa_nome, status: x.processo_status,
    negId: neg, negStatus: x.negociacao_status, temp: x.temperatura,
    zonas: x.zonas_siglas ? (Array.isArray(x.zonas_siglas) ? x.zonas_siglas.join(' / ') : String(x.zonas_siglas)) : null,
    vgv: x.vgv, unidades, valorPedido: x.valor_pedido,
    ofertaEntrada: o1 ? { valor: o1.valor_pedido, data: o1.data_oferta } : null,
    corretor: c?.pessoas ? { nome: (c.pessoas as R).nome_razao_social, imob: c.imobiliaria } : null,
    estacao: e1 ? { nome: e1.nome, pe: e1.distancia_pe_m, seg: e1.duracao_pe_s } : null, entornoBuscado: conta(bus) > 0,
    topo: tr.topo_perfil ? { perfil: tr.topo_perfil, decl: tr.topo_declividade_pct, desnivel: tr.topo_desnivel_m } : null,
    fases, etapasEnt: ent ? etapasPorFase[ent] : [], etapasPorFase, procs,
    trans: (trs.data as R[]).map((r) => ({ processo: r.processo_id, deEtapa: r.de_etapa, paraEtapa: r.para_etapa, em: r.em })),
    qMat: conta(mat), qInsc: conta(ins), temProprietario: conta(pes) > 0,
    infraNV: (inf.data as R[]).filter((i) => visita.has(i.item) && i.disponibilidade === 'nao_verificado').length,
    qComercial: (of1.count ?? 0) + conta(prop as { count: number | null }) + conta(reu), qViab: conta(viab), qMassa: conta(mas),
    qDocs: conta(docs) + (x.diligencias_abertas ?? 0),
  };
}

/** completude: campos que importam para decidir a compra (proto.js › completude); [rótulo, aba] dos que faltam */
export function completude(f: Ficha): { pct: number; faltam: [string, string][] } {
  const c: [string, boolean, string][] = [
    ['Endereço completo', !!(f.logradouro && f.numero && f.bairro), 'terreno'],
    ['Zona', !!f.zona, 'terreno'],
    ['Ponto no mapa', f.lat != null, 'terreno'],
    ['Área adotada', f.area != null, 'terreno'],
    ['Testada', f.testada != null, 'terreno'],
    ['Ocupação', !!f.ocupacao && f.ocupacao !== 'nao_informado', 'terreno'],
    ['Matrícula', f.qMat > 0, 'terreno'],
    ['Inscrição e IPTU', f.qInsc > 0, 'terreno'],
    ['Proprietário', f.temProprietario, 'terreno'],
    ['Zoneamento', !!f.zonas, 'parametros'],
    ['Visita técnica', f.infraNV === 0, 'infra'],
    ['Valor pedido', !!f.valorPedido, 'comercial'],
    ['Temperatura', !!f.temp, 'comercial'],
  ];
  const ok = c.filter((x) => x[1]).length;
  return { pct: Math.round((ok / c.length) * 100), faltam: c.filter((x) => !x[1]).map((x) => [x[0], x[2]]) };
}
