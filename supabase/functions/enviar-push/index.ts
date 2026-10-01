// =====================================================================
// MOVER.IA — Edge Function "enviar-push"
//
// Manda a notificação do sino também para o celular (aviso com a tela
// desligada). Quem chama é o próprio banco: o gatilho da tabela
// "notificacao" faz um POST para cá (pg_net) com o segredo guardado em
// push_config — por isso verify_jwt = false, e sem o segredo nada acontece.
//
//   { segredo, notificacao_id }  → envia para os aparelhos da pessoa
//   { segredo, acao:'preparar' } → cria as chaves VAPID (só na 1ª vez)
//
// As chaves VAPID são geradas aqui e ficam só no banco (push_config, sem
// acesso pelo app). Aparelho que não existe mais (404/410) é apagado.
// =====================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { enviarPush, gerarChavesVapid, type ChavesVapid } from './webpush.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CONTATO = 'https://theagocosta.github.io/Mover.IA/';

function jsonResponse(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
}
function iguais(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return jsonResponse({ error: 'Use POST.' }, 405);
  try {
    const b = await req.json();
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { data: config, error: erroConfig } = await admin.from('push_config').select('vapid_publica, vapid_privada, segredo').eq('id', 1).single();
    if (erroConfig || !config) return jsonResponse({ error: 'push_config não encontrado.' }, 500);
    if (typeof b?.segredo !== 'string' || !iguais(b.segredo, config.segredo)) return jsonResponse({ error: 'Não autorizado.' }, 401);

    if (b.acao === 'preparar') {
      if (config.vapid_publica) return jsonResponse({ ok: true, ja_existia: true });
      const chaves = await gerarChavesVapid();
      const { error } = await admin.from('push_config').update({ vapid_publica: chaves.publica, vapid_privada: chaves.privada }).eq('id', 1);
      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ ok: true, criada: true });
    }

    if (!config.vapid_publica) return jsonResponse({ error: 'Chaves VAPID ainda não criadas.' }, 500);
    const chaves: ChavesVapid = { publica: config.vapid_publica, privada: config.vapid_privada };

    const { data: n } = await admin.from('notificacao').select('id, usuario_id, tipo, titulo, mensagem, destino').eq('id', b.notificacao_id).single();
    if (!n) return jsonResponse({ error: 'Notificação não encontrada.' }, 404);
    const { data: inscricoes } = await admin.from('push_inscricao').select('id, endpoint, p256dh, auth').eq('usuario_id', n.usuario_id);
    if (!inscricoes || !inscricoes.length) return jsonResponse({ ok: true, enviados: 0 });

    const mensagem = JSON.stringify({ id: n.id, tipo: n.tipo, titulo: n.titulo, mensagem: (n.mensagem || '').slice(0, 300), destino: n.destino });
    const resultados = await Promise.all(inscricoes.map(async (i: any) => {
      try { return { id: i.id, status: await enviarPush(i, mensagem, chaves, CONTATO) }; }
      catch (e) { return { id: i.id, status: 0, erro: String(e) }; }
    }));
    const mortas = resultados.filter((r) => r.status === 404 || r.status === 410).map((r) => r.id);
    if (mortas.length) await admin.from('push_inscricao').delete().in('id', mortas);
    return jsonResponse({ ok: true, enviados: resultados.filter((r) => r.status >= 200 && r.status < 300).length, removidos: mortas.length, resultados });
  } catch (e) {
    return jsonResponse({ error: 'Erro inesperado: ' + String(e) }, 500);
  }
});
