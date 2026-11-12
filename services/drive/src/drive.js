// Google Drive pela conta de serviço do próprio Cloud Run: o token vem do servidor de
// metadados (sem chave guardada em lugar nenhum). A conta precisa ser Gerente de conteúdo
// (ou Editor) da pasta-mãe no Drive compartilhado.

const API = 'https://www.googleapis.com/drive/v3/files';
const PASTA = 'application/vnd.google-apps.folder';
const TODOS = 'supportsAllDrives=true&includeItemsFromAllDrives=true';

export class ErroDrive extends Error { constructor(status, code, msg) { super(msg); this.status = status; this.code = code; } }

let tk = null;
async function token() {
  if (tk && tk.vence > Date.now() + 60_000) return tk.valor;
  if (process.env.DRIVE_TOKEN_TESTE) return process.env.DRIVE_TOKEN_TESTE;
  const r = await fetch('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token?scopes=https://www.googleapis.com/auth/drive',
    { headers: { 'Metadata-Flavor': 'Google' }, signal: AbortSignal.timeout(10_000) })
    .catch(() => { throw new ErroDrive(503, 'SEM_CONTA', 'O serviço do Drive não conseguiu a credencial do Google.'); });
  if (!r.ok) throw new ErroDrive(503, 'SEM_CONTA', 'O serviço do Drive não conseguiu a credencial do Google.');
  const j = await r.json();
  tk = { valor: j.access_token, vence: Date.now() + (j.expires_in ?? 600) * 1000 };
  return tk.valor;
}

async function chamar(caminho, init = {}) {
  const r = await fetch(`${API}${caminho}`, {
    ...init,
    headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(30_000),
  }).catch(() => { throw new ErroDrive(503, 'DRIVE_FORA', 'O Google Drive não respondeu.'); });
  if (r.status === 404) return null;
  const j = await r.json().catch(() => ({}));
  if (r.status === 403 || r.status === 401) throw new ErroDrive(502, 'DRIVE_SEM_ACESSO', 'A conta do serviço não tem acesso à pasta do Drive.');
  if (!r.ok) throw new ErroDrive(502, 'DRIVE', `O Google Drive respondeu ${r.status}: ${j?.error?.message ?? ''}`.trim());
  return j;
}

const q = (s) => encodeURIComponent(s);
const aspas = (s) => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");

/** pastas dentro da pasta-mãe (as pastas-modelo: 01) Documentos de Terrenos ...) */
export async function pastasModelo(raiz) {
  const l = [];
  let pg = '';
  do {
    const j = await chamar(`?${TODOS}&pageSize=200&fields=nextPageToken,files(id,name)&q=${q(`'${aspas(raiz)}' in parents and mimeType='${PASTA}' and trashed=false`)}${pg ? '&pageToken=' + q(pg) : ''}`);
    if (!j) throw new ErroDrive(502, 'DRIVE_SEM_RAIZ', 'A pasta-mãe do Drive não foi encontrada.');
    l.push(...j.files);
    pg = j.nextPageToken ?? '';
  } while (pg);
  return l.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

export async function ler(id) {
  return chamar(`/${q(id)}?${TODOS}&fields=id,name,trashed,parents`);
}

/** a pasta do terreno dentro da pasta-modelo, achada pela marca que o serviço põe nela */
export async function acharPorTerreno(mae, terrenoId) {
  const j = await chamar(`?${TODOS}&pageSize=10&fields=files(id,name)&q=${q(`'${aspas(mae)}' in parents and trashed=false and appProperties has { key='bkm_terreno' and value='${aspas(terrenoId)}' }`)}`);
  return j?.files?.[0] ?? null;
}

export async function criar(mae, nome, terrenoId, codigo) {
  return chamar(`?${TODOS}&fields=id,name`, {
    method: 'POST',
    body: JSON.stringify({ name: nome, mimeType: PASTA, parents: [mae], appProperties: { bkm_terreno: terrenoId, bkm_codigo: codigo } }),
  });
}

export async function renomear(id, nome) {
  return chamar(`/${q(id)}?${TODOS}&fields=id,name`, { method: 'PATCH', body: JSON.stringify({ name: nome }) });
}
