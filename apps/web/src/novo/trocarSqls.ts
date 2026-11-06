/* "Selecionar lotes" na edição da poligonal (pedido do Moises, 6/nov/2026): como no cadastro, os lotes marcados passam a
   ser o terreno. Os SQLs que já estavam e continuam marcados ficam como estão (parte, IPTU, zonas); os que ficaram de fora
   saem do terreno (e, com isso, das partes); os novos entram sem parte, com a consulta do GeoSampa. A poligonal vira a
   soma dos lotes. O Ctrl+Z volta o terreno como estava: os SQLs tirados voltam com o mesmo id, as partes (inscricao_partes) com o percentual, o IPTU e as
   zonas, os incluídos saem e a poligonal volta a de antes. */
import { supabase } from '../lib/supabase';
import { consultarTerreno } from './consulta';
import { centroPoly, fixa, geojson, lotesUniao, type P } from './geo';
import { digitos, type LoteSql } from './geosampa';

type R = Record<string, any>;
type Aviso = (m: string, erro?: boolean) => void;

const GERADAS_INSC = ['inscricao_norm'];
const sem = (r: R, ks: string[]) => Object.fromEntries(Object.entries(r).filter(([k]) => !ks.includes(k)));

interface Antes { terreno: R; insc: R[]; valores: R[]; zonas: R[]; partes: R[]; consultas: { id: string; inscricao_id: string }[] }

async function fotografar(id: string, ids: string[]): Promise<Antes> {
  const [{ data: t, error }, ins, val, zon, con, pts] = await Promise.all([
    supabase.from('terrenos').select('poligono_geojson,poligono_desenhado_geojson,latitude,longitude,precisao_localizacao').eq('id', id).single(),
    ids.length ? supabase.from('inscricoes_municipais').select('*').in('id', ids) : Promise.resolve({ data: [] as R[] }),
    ids.length ? supabase.from('inscricao_valores').select('*').in('inscricao_id', ids).order('criado_em') : Promise.resolve({ data: [] as R[] }),
    ids.length ? supabase.from('analise_zoneamentos').select('*').in('inscricao_id', ids) : Promise.resolve({ data: [] as R[] }),
    ids.length ? supabase.from('consultas_lote').select('id,inscricao_id').in('inscricao_id', ids) : Promise.resolve({ data: [] as R[] }),
    ids.length ? supabase.from('inscricao_partes').select('id,empresa_id,terreno_id,inscricao_id,parte_id,percentual').in('inscricao_id', ids) : Promise.resolve({ data: [] as R[] }),
  ]);
  if (error || !t) throw error ?? new Error('Terreno não encontrado');
  return { terreno: t, insc: (ins.data ?? []) as R[], valores: (val.data ?? []) as R[], zonas: (zon.data ?? []) as R[], partes: (pts.data ?? []) as R[], consultas: (con.data ?? []) as any };
}

async function salvarT(id: string, d: R) {
  const { data: t, error: e1 } = await supabase.from('terrenos').select('versao').eq('id', id).single();
  if (e1 || !t) throw e1 ?? new Error('Terreno não encontrado');
  const { error } = await supabase.rpc('salvar_terreno', { p_terreno: id, p_versao: t.versao, p_dados: d });
  if (error) throw error;
}

/** troca os SQLs do terreno pelos marcados e a poligonal pela soma dos lotes; devolve o que o Ctrl+Z precisa, ou null se nada foi feito */
export async function trocarSqls(id: string, empresa: string, marc: LoteSql[], aviso: Aviso):
  Promise<{ desfazer: () => Promise<boolean>; refazer: () => Promise<boolean> } | null> {
  const u = lotesUniao(marc.map((x) => x.poly));
  if (!u) { aviso('Os lotes marcados não se encostam: o terreno continua como estava.', true); return null; }
  const [{ data: insc, error: e0 }, { data: t0 }] = await Promise.all([
    supabase.from('inscricoes_municipais').select('id,inscricao_norm').eq('terreno_id', id),
    supabase.from('terrenos').select('municipio_id').eq('id', id).single(),
  ]);
  if (e0) { aviso(e0.message, true); return null; }
  const ja = (insc ?? []) as R[], jaD = new Set(ja.map((i) => i.inscricao_norm)), marcD = new Set(marc.map((x) => digitos(x.sql)));
  const tirar = ja.filter((i) => !marcD.has(i.inscricao_norm)).map((i) => i.id as string);
  const novos = marc.filter((x) => !jaD.has(digitos(x.sql)));
  let antes: Antes;
  try { antes = await fotografar(id, tirar); } catch (e: any) { aviso(e?.message ?? String(e), true); return null; }
  let incluidos: string[] = [];

  const aplicar = async (consultar: boolean) => {
    if (tirar.length) { const r = await supabase.from('inscricoes_municipais').delete().in('id', tirar); if (r.error) throw r.error; }
    let ins: R[] = [];
    if (novos.length) {
      const r = await supabase.from('inscricoes_municipais').insert(novos.map((q) => ({ empresa_id: empresa, terreno_id: id, municipio_id: t0?.municipio_id ?? null,
        inscricao: q.sql, area_cadastral_m2: q.area, cib: q.cib, origem: 'mapa_prefeitura', endereco_prefeitura: q.end || null }))).select('id,inscricao');
      if (r.error) throw r.error;
      ins = (r.data ?? []) as R[];
      incluidos = ins.map((x) => x.id);
    }
    const c = centroPoly(u);
    await salvarT(id, { poligono_geojson: geojson(fixa(u)), poligono_desenhado_geojson: antes.terreno.poligono_desenhado_geojson ?? antes.terreno.poligono_geojson ?? null,
      latitude: +c[0].toFixed(7), longitude: +c[1].toFixed(7), precisao_localizacao: 'aproximada' });
    if (consultar && ins.length) consultarTerreno(id, null, ins.map((x) => ({ id: x.id, sql: x.inscricao })), aviso);
  };

  try { await aplicar(true); } catch (e: any) { aviso(e?.message ?? String(e), true); return null; }
  aviso([`Terreno com ${marc.length} lote${marc.length > 1 ? 's' : ''}`, novos.length && `${novos.length} SQL${novos.length > 1 ? 's' : ''} incluído${novos.length > 1 ? 's' : ''}`,
    tirar.length && `${tirar.length} tirado${tirar.length > 1 ? 's' : ''}`].filter(Boolean).join(', ') + '.');

  const desfazer = async () => {
    try {
      if (incluidos.length) { const r = await supabase.from('inscricoes_municipais').delete().in('id', incluidos); if (r.error) throw r.error; }
      if (antes.insc.length) {
        const r = await supabase.from('inscricoes_municipais').insert(antes.insc.map((x) => sem(x, GERADAS_INSC))); if (r.error) throw r.error;
        for (const v of antes.valores) { const r2 = await supabase.from('inscricao_valores').insert(v); if (r2.error) throw r2.error; }
        if (antes.partes.length) { const r4 = await supabase.from('inscricao_partes').insert(antes.partes); if (r4.error) throw r4.error; }
        if (antes.zonas.length) { const r3 = await supabase.from('analise_zoneamentos').insert(antes.zonas); if (r3.error) throw r3.error; }
        for (const c of antes.consultas) await supabase.from('consultas_lote').update({ inscricao_id: c.inscricao_id }).eq('id', c.id);
      }
      const t = antes.terreno;
      await salvarT(id, { poligono_geojson: t.poligono_geojson, poligono_desenhado_geojson: t.poligono_desenhado_geojson, latitude: t.latitude, longitude: t.longitude, precisao_localizacao: t.precisao_localizacao });
      return true;
    } catch (e: any) { aviso(e?.message ?? String(e), true); return false; }
  };
  const refazer = async () => {
    try { await aplicar(true); return true; } catch (e: any) { aviso(e?.message ?? String(e), true); return false; }
  };
  return { desfazer, refazer };
}

export type { P };
