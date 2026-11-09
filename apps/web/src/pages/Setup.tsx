import { Marca } from '../components/ui';

/** Mostrado quando o .env não foi preenchido. */
export default function Setup() {
  return (
    <div className="setup card card-b">
      <div className="brand"><Marca /></div>
      <h1>Falta configurar o Supabase</h1>
      <p>Crie <code>apps/web/.env.local</code> a partir de <code>apps/web/.env.example</code> com a URL e a chave publicável do projeto
        (Supabase → Project Settings → API) e reinicie o <code>npm run dev</code>.</p>
      <p className="muted">No Cloud Run, os valores vêm das variáveis SUPABASE_URL e SUPABASE_KEY do serviço.</p>
    </div>
  );
}
