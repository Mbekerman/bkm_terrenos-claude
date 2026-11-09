// Emissão da 2ª via da Notificação de Lançamento do IPTU no portal da Prefeitura de
// São Paulo, com a Senha Web de quem cedeu a credencial (variáveis IPTU_CPF e
// IPTU_SENHA, vindas do Secret Manager; nunca do banco, do repositório ou da tela).
//
// O portal não tem API: um Chromium sem tela faz o caminho de uma pessoa (entrar com
// a Senha Web, digitar o SQL e o exercício, gerar a notificação e baixar o PDF). Os
// tokens do portal ficam dentro do navegador. Captcha não é resolvido: se aparecer,
// a consulta para com erro. Login recusado bloqueia novas tentativas por 30 minutos,
// para não travar a Senha Web por excesso de tentativas.

import { chromium } from 'playwright';

export const PORTAL = 'https://notcertiptu.prefeitura.sp.gov.br/PaginasRestritas/frm001_Gerar_Notif_Lanc.aspx';

export class ErroPortal extends Error {
  constructor(status, code, msg) { super(msg); this.status = status; this.code = code; }
}

const formatarSql = (d) => `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 10)}-${d.slice(10, 11)}`;

let navegador = null, contexto = null, pagina = null, usadoEm = 0, bloqueadoAte = 0;
const OCIOSO_MS = 10 * 60 * 1000;

async function fechar() {
  const n = navegador;
  navegador = contexto = pagina = null;
  await n?.close().catch(() => {});
}
setInterval(() => { if (navegador && Date.now() - usadoEm > OCIOSO_MS) void fechar(); }, 60_000).unref();

async function abrir() {
  if (pagina && !pagina.isClosed() && navegador?.isConnected()) return;
  await fechar();
  navegador = await chromium.launch({ headless: true });
  contexto = await navegador.newContext({ acceptDownloads: true, locale: 'pt-BR' });
  pagina = await contexto.newPage();
  pagina.setDefaultTimeout(20_000);
  pagina.setDefaultNavigationTimeout(40_000);
}

async function irAoFormulario() {
  await pagina.goto(PORTAL, { waitUntil: 'domcontentloaded' });
  if (await pagina.locator('#txt_SQL').isVisible().catch(() => false)) return;
  // Sem sessão: entra com a Senha Web.
  if (Date.now() < bloqueadoAte) throw new ErroPortal(503, 'LOGIN_BLOQUEADO', 'O portal recusou a Senha Web há pouco. Nova tentativa só daqui a alguns minutos, para não bloquear a senha.');
  const cpf = process.env.IPTU_CPF?.replace(/\D/g, ''), senha = process.env.IPTU_SENHA;
  if (!cpf || !senha) throw new ErroPortal(503, 'SEM_CREDENCIAL', 'A Senha Web da Prefeitura não está configurada no servidor.');
  const outras = pagina.getByRole('button', { name: /Outras formas de acesso/i });
  if (await outras.isVisible().catch(() => false)) await outras.click();
  await pagina.locator('#cpfCnpj').fill(cpf);
  await pagina.locator('#password').fill(senha);
  await pagina.getByRole('button', { name: 'Entrar', exact: true }).click({ noWaitAfter: true });
  // Espera um destes: o formulário do IPTU, a escolha de perfil, um erro ou um captcha.
  await pagina.waitForFunction(() => {
    const vis = (e) => !!e && !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length);
    return vis(document.querySelector('#txt_SQL')) || /CarregarDelegado/i.test(location.pathname)
      || [...document.querySelectorAll('.validation-summary-errors, .field-validation-error, [role="alert"]')].some((e) => vis(e) && e.textContent.trim())
      || [...document.querySelectorAll('iframe')].some((e) => vis(e) && /captcha/i.test(e.src));
  }, null, { timeout: 40_000 });
  if (await pagina.locator('#txt_SQL').isVisible().catch(() => false)) return;
  if (/CarregarDelegado/i.test(pagina.url())) {
    const titular = pagina.getByRole('radio', { name: /^Titular/i });
    if (await titular.count() !== 1) throw new ErroPortal(502, 'PERFIL', 'O portal pediu a escolha de perfil e não achei o de titular.');
    await titular.check();
    await pagina.getByRole('button', { name: 'Continuar', exact: true }).click({ noWaitAfter: true });
    await pagina.locator('#txt_SQL').waitFor({ state: 'visible', timeout: 40_000 });
    return;
  }
  if (await pagina.locator('iframe[src*="captcha"]').count()) throw new ErroPortal(409, 'CAPTCHA', 'O portal da Prefeitura pediu captcha. Tente mais tarde.');
  bloqueadoAte = Date.now() + 30 * 60 * 1000;
  throw new ErroPortal(401, 'LOGIN_RECUSADO', 'O portal recusou a Senha Web configurada no servidor.');
}

async function fecharAvisoCookies() {
  const b = pagina.getByText(/^Use somente cookies necessários/i).first();
  if (await b.isVisible().catch(() => false)) await b.click({ noWaitAfter: true }).catch(() => {});
}

/** Emite a notificação do SQL (11 dígitos) no exercício pedido e devolve o PDF. */
async function emitirUmaVez(sql, exercicio) {
  await abrir();
  await irAoFormulario();
  await fecharAvisoCookies();
  await pagina.locator('#txt_SQL').fill(formatarSql(sql));
  await pagina.locator('#txt_Exercicio').fill(String(exercicio));
  await pagina.locator('#btnConsultar').click({ noWaitAfter: true }).catch(async () => {
    await fecharAvisoCookies();
    await pagina.locator('#btnConsultar').click({ noWaitAfter: true });
  });
  const linhas = pagina.locator('#gvDados tr').filter({ has: pagina.locator('input[title="Gerar Notificação"]') });
  try { await linhas.first().waitFor({ state: 'visible', timeout: 30_000 }); }
  catch {
    if (await pagina.locator('#cpfCnpj').isVisible().catch(() => false)) throw new ErroPortal(401, 'SESSAO_EXPIRADA', 'A sessão do portal expirou.');
    throw new ErroPortal(404, 'SEM_NOTIFICACAO', `O portal não tem notificação de ${exercicio} para este SQL.`);
  }
  const ativas = linhas.filter({ has: pagina.getByRole('cell', { name: 'Ativa', exact: true }) });
  const n = await ativas.count();
  if (n !== 1) throw new ErroPortal(n ? 409 : 404, n ? 'VARIAS_NOTIFICACOES' : 'SEM_NOTIFICACAO_ATIVA', n ? 'Há mais de uma notificação ativa: escolha no portal.' : `Não há notificação ativa de ${exercicio} para este SQL.`);
  await ativas.locator('input[title="Gerar Notificação"]').click({ noWaitAfter: true });
  await pagina.locator('#btnOK').waitFor({ state: 'visible' });
  // Sem nome de proprietário ou compromissário: a via sai com os dados do contribuinte sob sigilo fiscal.
  await pagina.locator('#TxtProprietario').fill('').catch(() => {});
  await pagina.locator('#TxtCompromissario').fill('').catch(() => {});
  const [dl] = await Promise.all([pagina.waitForEvent('download', { timeout: 40_000 }), pagina.locator('#btnOK').click({ noWaitAfter: true })]);
  if (await dl.failure()) throw new ErroPortal(502, 'DOWNLOAD', 'O portal não concluiu o download do PDF.');
  const partes = []; let tam = 0;
  const st = await dl.createReadStream();
  try { for await (const c of st) { tam += c.length; if (tam > 15 * 1024 * 1024) throw new ErroPortal(502, 'PDF_GRANDE', 'O PDF passou de 15 MB.'); partes.push(c); } }
  finally { await dl.delete().catch(() => {}); }
  const buf = Buffer.concat(partes);
  if (buf.subarray(0, 5).toString() !== '%PDF-') throw new ErroPortal(502, 'NAO_PDF', 'O portal devolveu um arquivo que não é PDF.');
  usadoEm = Date.now();
  return buf;
}

/** Uma emissão por vez; sessão expirada refaz o login uma vez. Prazo total de 2 minutos. */
let fila = Promise.resolve(), naFila = 0;
export function emitir(sql, exercicio) {
  if (naFila >= 8) return Promise.reject(new ErroPortal(429, 'FILA_CHEIA', 'Muitas consultas na fila. Tente em alguns minutos.'));
  naFila++;
  const tarefa = fila.then(async () => {
    const prazo = new Promise((_, rej) => setTimeout(() => rej(new ErroPortal(504, 'PRAZO', 'O portal da Prefeitura não respondeu em 2 minutos.')), 120_000).unref());
    const vez = async () => {
      try { return await emitirUmaVez(sql, exercicio); }
      catch (e) {
        if (e instanceof ErroPortal && e.code === 'SESSAO_EXPIRADA') { await fechar(); return emitirUmaVez(sql, exercicio); }
        throw e;
      }
    };
    try { return await Promise.race([vez(), prazo]); }
    catch (e) {
      if (!(e instanceof ErroPortal)) { await fechar(); throw new ErroPortal(502, 'PORTAL', 'Não foi possível completar a consulta no portal da Prefeitura.'); }
      if (e.code === 'PRAZO') await fechar();
      throw e;
    }
  });
  fila = tarefa.catch(() => {}).finally(() => { naFila--; });
  return tarefa;
}
