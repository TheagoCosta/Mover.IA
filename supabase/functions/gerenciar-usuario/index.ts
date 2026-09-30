// =====================================================================
// MOVER.IA — Edge Function "gerenciar-usuario"
//
// Ações do escritório sobre o login de um motorista/mecânico que precisam
// da chave de acesso total (service role) e por isso rodam no servidor:
//   • resetar_senha → gera nova senha temporária (o usuário troca no 1º acesso)
//   • desativar     → marca inativo e bloqueia o login
//   • reativar      → desfaz o bloqueio
//
// Regras: só gestão (admin_transportadora, gestor, admin_mover_ia) da MESMA
// transportadora; ninguém mexe em si mesmo; gestor não mexe em administrador.
// Publicada pelo Claude via conector do Supabase (verify_jwt = true).
// =====================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const PAPEIS_GESTAO = ['admin_transportadora', 'gestor', 'admin_mover_ia'];

function jsonResponse(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    },
  });
}

function gerarSenhaTemporaria(): string {
  const alfabeto = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const aleatorios = crypto.getRandomValues(new Uint8Array(10));
  let senha = '';
  for (let i = 0; i < 10; i++) senha += alfabeto[aleatorios[i] % alfabeto.length];
  return senha;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return jsonResponse({ ok: true });
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return jsonResponse({ error: 'Não autenticado.' }, 401);
    const supabaseAuth = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: quemChama, error: erroAuth } = await supabaseAuth.auth.getUser();
    if (erroAuth || !quemChama?.user) return jsonResponse({ error: 'Sessão inválida.' }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { data: chamador } = await admin.from('usuario').select('id, papel, transportadora_id, ativo').eq('id', quemChama.user.id).single();
    if (!chamador || !chamador.ativo || !PAPEIS_GESTAO.includes(chamador.papel)) {
      return jsonResponse({ error: 'Sem permissão.' }, 403);
    }

    const body = await req.json();
    const acao: string = body?.acao;

    // Cadastro de usuário do escritório (papel gestor): login = e-mail real
    // da pessoa + senha temporária (troca no 1º acesso). Só o administrador.
    if (acao === 'criar_escritorio') {
      if (!['admin_transportadora', 'admin_mover_ia'].includes(chamador.papel)) return jsonResponse({ error: 'Só o administrador cadastra usuários do escritório.' }, 403);
      const nome = String(body?.nome || '').trim().replace(/\s+/g, ' ');
      const email = String(body?.email || '').trim().toLowerCase();
      if (nome.split(' ').length < 2) return jsonResponse({ error: 'Informe nome e sobrenome.' }, 400);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.endsWith('@motoristas.moveria.app')) return jsonResponse({ error: 'E-mail inválido.' }, 400);
      const { data: existe } = await admin.from('usuario').select('id').eq('email', email).limit(1);
      if (existe && existe.length) return jsonResponse({ error: 'Já existe um usuário com esse e-mail.' }, 400);
      const senhaTemporaria = gerarSenhaTemporaria();
      const { data: novo, error: erroCriar } = await admin.auth.admin.createUser({ email, password: senhaTemporaria, email_confirm: true, user_metadata: { nome } });
      if (erroCriar || !novo?.user) return jsonResponse({ error: 'Erro ao criar login: ' + (erroCriar?.message || 'desconhecido') }, 400);
      const { error: erroPerfil } = await admin.from('usuario').insert({ id: novo.user.id, transportadora_id: chamador.transportadora_id, papel: 'gestor', nome, email, senha_temporaria: true });
      if (erroPerfil) { await admin.auth.admin.deleteUser(novo.user.id); return jsonResponse({ error: 'Erro ao criar o perfil: ' + erroPerfil.message }, 400); }
      return jsonResponse({ usuarioId: novo.user.id, login: email, senhaTemporaria });
    }

    const usuarioId: string = body?.usuario_id;
    if (!usuarioId) return jsonResponse({ error: 'Usuário não informado.' }, 400);
    if (usuarioId === chamador.id) return jsonResponse({ error: 'Você não pode fazer isso com o seu próprio usuário.' }, 400);

    const { data: alvo } = await admin.from('usuario').select('id, nome, email, papel, transportadora_id').eq('id', usuarioId).single();
    if (!alvo || alvo.transportadora_id !== chamador.transportadora_id) return jsonResponse({ error: 'Usuário não encontrado.' }, 404);
    if (PAPEIS_GESTAO.includes(alvo.papel) && chamador.papel !== 'admin_transportadora' && chamador.papel !== 'admin_mover_ia') {
      return jsonResponse({ error: 'Só o administrador pode alterar outro usuário do escritório.' }, 403);
    }

    if (acao === 'resetar_senha') {
      const senhaTemporaria = gerarSenhaTemporaria();
      const { error } = await admin.auth.admin.updateUserById(usuarioId, { password: senhaTemporaria });
      if (error) return jsonResponse({ error: 'Erro ao gerar senha: ' + error.message }, 400);
      await admin.from('usuario').update({ senha_temporaria: true }).eq('id', usuarioId);
      const login = String(alvo.email || '').endsWith('@motoristas.moveria.app') ? alvo.email.split('@')[0] : alvo.email;
      return jsonResponse({ login, senhaTemporaria });
    }
    if (acao === 'desativar' || acao === 'reativar') {
      const desativar = acao === 'desativar';
      // ~100 anos = bloqueado; 'none' = libera
      const { error } = await admin.auth.admin.updateUserById(usuarioId, { ban_duration: desativar ? '876000h' : 'none' });
      if (error) return jsonResponse({ error: 'Erro ao alterar o acesso: ' + error.message }, 400);
      await admin.from('usuario').update({ ativo: !desativar }).eq('id', usuarioId);
      if (desativar) await admin.from('conjunto').update({ motorista_id: null }).eq('motorista_id', usuarioId);
      return jsonResponse({ ok: true });
    }
    return jsonResponse({ error: 'Ação desconhecida.' }, 400);
  } catch (e) {
    return jsonResponse({ error: 'Erro inesperado: ' + String(e) }, 500);
  }
});
