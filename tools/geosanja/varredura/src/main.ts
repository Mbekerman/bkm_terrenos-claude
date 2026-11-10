import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { criarBanco } from './banco.ts';
import { carregarSetores, celulasUrbanas } from './celulas.ts';
import { ClienteGeoSanja } from './cliente.ts';
import { prazoDaNoite } from './horario.ts';
import { rodarNoite } from './noite.ts';

function num(nome: string, padrao: number) {
  const v = process.env[nome];
  if (v == null || v === '') return padrao;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`Variável ${nome} inválida`);
  return n;
}

function caminhoSetores() {
  if (process.env.VARREDURA_SETORES) return process.env.VARREDURA_SETORES;
  const candidatos = [
    '/app/setores-3549904-2022.json',
    fileURLToPath(new URL('../../../../docs/dados/setores-3549904-2022.json', import.meta.url)),
  ];
  return candidatos.find((p) => existsSync(p)) ?? candidatos[0];
}

async function main() {
  const empresa = process.env.VARREDURA_EMPRESA_ID || '';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(empresa)) {
    throw new Error('Defina VARREDURA_EMPRESA_ID com o uuid da empresa (select id from app.empresas where nome = \'BKM\').');
  }
  const url = process.env.SUPABASE_URL || '';
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !chave) throw new Error('Faltam SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.');
  const min = num('VARREDURA_INTERVALO_MIN_MS', 2000);
  const max = num('VARREDURA_INTERVALO_MAX_MS', 3000);
  if (min < 1000) throw new Error('VARREDURA_INTERVALO_MIN_MS não pode ser menor que 1000.');
  if (max < min) throw new Error('VARREDURA_INTERVALO_MAX_MS é menor que o mínimo.');
  const margem = num('VARREDURA_MARGEM_MIN', 5);
  const fora = process.env.VARREDURA_FORA_DA_JANELA === '1';
  const limite = prazoDaNoite(new Date(), { margemMin: margem, foraDaJanela: fora });
  if (!limite || limite.getTime() <= Date.now()) {
    console.log(limite
      ? 'O limite das 07:00 já passou. Nada a fazer.'
      : 'Fora da janela (22h–7h, America/Sao_Paulo). De dia, VARREDURA_FORA_DA_JANELA=1 varre até a próxima 07:00.');
    return 0;
  }
  const banco = criarBanco(url, chave, empresa, process.env.VARREDURA_BASE || 'geosanja');
  if (!await banco.tabelasLotes()) {
    console.error('Faltam app.lotes_prefeitura e app.quadras_prefeitura. Aplique a migration do PR 290 e a 20261015001900 antes.');
    return 1;
  }
  const celulas = celulasUrbanas(carregarSetores(caminhoSetores()));
  console.log(`células na grade: ${celulas.length}; para até ${limite.toISOString()}`);
  let sinal = false;
  process.on('SIGTERM', () => { sinal = true; console.log('SIGTERM: para ao fim do pedido em curso'); });
  const deveParar = () => sinal || Date.now() >= limite.getTime();
  const cliente = new ClienteGeoSanja({
    base: process.env.GEOSANJA_BASE || 'https://geo.sjc.sp.gov.br/v1/',
    intervaloMin: min, intervaloMax: max, deveParar,
    errosSeguidos: num('VARREDURA_ERROS_SEGUIDOS', 5),
    backoffInicialMs: num('VARREDURA_BACKOFF_INICIAL_MS', 15_000),
    backoffTetoMs: num('VARREDURA_BACKOFF_TETO_MS', 300_000),
  });
  const r = await rodarNoite({ banco, cliente, celulas, deveParar });
  console.log(`motivo=${r.motivo} consultas=${r.stats.consultas} lotes_novos=${r.stats.novos} atualizados=${r.stats.atualizados} apagados=${r.stats.apagados} quadras=${r.stats.quadras} celulas=${r.stats.celulas} ${r.detalhe}`);
  return r.motivo === 'bloqueio' || r.motivo === 'erros' ? 1 : 0;
}

main().then((code) => process.exit(code), (e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
