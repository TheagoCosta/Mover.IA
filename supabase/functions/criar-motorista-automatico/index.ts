// =====================================================================
// MOVER.IA — Função de servidor (Supabase Edge Function) que cria o
// login de um motorista novo automaticamente, quando o escritório envia
// a CNH de alguém que ainda não está cadastrado no app.
//
// Por que isso precisa ser uma função de servidor (e não código direto
// no app, como tudo até aqui): criar um login de verdade exige uma chave
// de acesso total do banco (a "service role key"), que nunca pode ficar
// dentro do site/app (qualquer pessoa poderia abrir o código do site e
// roubar essa chave). Essa função roda dentro do Supabase, tem acesso a
// essa chave com segurança, e o app só conversa com ela por fora — sem
// nunca ver a chave.
//
// COMO PUBLICAR (passo a passo no site do Supabase):
// 1. No painel do Supabase, vá em "Edge Functions" no menu lateral
// 2. Clique em "Create a new function", dê o nome exatamente como:
//      criar-motorista-automatico
// 3. Apague o código de exemplo que vier e cole o conteúdo deste arquivo
//    inteiro
// 4. Clique em "Deploy"
// 5. Pronto — não precisa configurar mais nada (o Supabase já entrega pra
//    essa função, sozinho, a URL do projeto e as chaves que ela precisa)
//
// ATENÇÃO: o domínio "@motoristas.moveria.app" usado abaixo também está no
// index.html (função doLogin), pra o motorista entrar digitando só o login.
// Se mudar aqui, mude lá também.
// =====================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

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

function gerarLoginUnico(nome: string): { primeiro: string; loginBase: string } {
  const semAcento = (nome || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
  const partes = semAcento.trim().split(/\s+/).filter(Boolean);
  const primeiro = (partes[0] || 'motorista').replace(/[^a-z0-9]/g, '');
  const ultimo = partes.length > 1 ? partes[partes.length - 1].replace(/[^a-z0-9]/g, '') : '';
  const loginBase = ultimo ? `${primeiro}.${ultimo}` : primeiro;
  return { primeiro, loginBase };
}

function gerarSenhaTemporaria(): string {
  const alfabeto = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let senha = '';
  const aleatorios = crypto.getRandomValues(new Uint8Array(10));
  for (let i = 0; i < 10; i++) senha += alfabeto[aleatorios[i] % alfabeto.length];
  return senha;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return jsonResponse({ ok: true });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return jsonResponse({ error: 'Não autenticado.' }, 401);

    // Confere quem está chamando (precisa ser um login válido do app)
    const supabaseAuth = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: quemChama, error: erroAuth } = await supabaseAuth.auth.getUser();
    if (erroAuth || !quemChama?.user) return jsonResponse({ error: 'Sessão inválida.' }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Só a gestão da transportadora (admin ou gestor/escritório) pode
    // cadastrar motorista — mesmos papéis da função eh_gestao() do banco.
    const { data: chamador, error: erroChamador } = await admin
      .from('usuario')
      .select('papel, transportadora_id')
      .eq('id', quemChama.user.id)
      .single();
    if (erroChamador || !chamador || !['admin_transportadora', 'gestor', 'admin_mover_ia'].includes(chamador.papel)) {
      return jsonResponse({ error: 'Sem permissão para cadastrar motorista.' }, 403);
    }

    const body = await req.json();
    const nome: string = (body?.nome || '').trim();
    const cpf: string | null = body?.cpf || null;
    // Também cria login de mecânico (cadastrado pelo escritório em Usuários).
    // Mesmo esquema de login interno do motorista (nome.sobrenome).
    const papel: string = body?.papel || 'motorista';
    if (!['motorista', 'mecanico'].includes(papel)) return jsonResponse({ error: 'Papel inválido.' }, 400);
    if (!nome || nome.length < 5) return jsonResponse({ error: 'Nome inválido.' }, 400);

    const { loginBase } = gerarLoginUnico(nome);
    if (!loginBase) return jsonResponse({ error: 'Não consegui gerar um login a partir do nome.' }, 400);

    // Garante login único dentro do domínio interno de login (não é um
    // e-mail real — ninguém recebe nada nele, é só o identificador do login)
    let login = loginBase;
    let sufixo = 1;
    let email = `${login}@motoristas.moveria.app`;
    // deno-lint-ignore no-constant-condition
    while (true) {
      const { data: existentes } = await admin.from('usuario').select('id').eq('email', email);
      if (!existentes || existentes.length === 0) break;
      sufixo += 1;
      login = `${loginBase}${sufixo}`;
      email = `${login}@motoristas.moveria.app`;
    }

    const senhaTemporaria = gerarSenhaTemporaria();

    const { data: novoAuthUser, error: erroCriarAuth } = await admin.auth.admin.createUser({
      email,
      password: senhaTemporaria,
      email_confirm: true,
      user_metadata: { nome },
    });
    if (erroCriarAuth || !novoAuthUser?.user) {
      return jsonResponse({ error: 'Erro ao criar login: ' + (erroCriarAuth?.message || 'desconhecido') }, 400);
    }

    const { error: erroUsuario } = await admin.from('usuario').insert({
      id: novoAuthUser.user.id,
      transportadora_id: chamador.transportadora_id,
      papel,
      nome,
      email,
      senha_temporaria: true,
    });
    if (erroUsuario) {
      // desfaz o login criado, pra não ficar um login órfão sem perfil
      await admin.auth.admin.deleteUser(novoAuthUser.user.id);
      return jsonResponse({ error: 'Erro ao criar o perfil do motorista: ' + erroUsuario.message }, 400);
    }

    if (cpf && papel === 'motorista') {
      await admin.from('motorista_perfil').insert({ usuario_id: novoAuthUser.user.id, cpf });
    }

    return jsonResponse({
      usuarioId: novoAuthUser.user.id,
      login,
      email,
      senhaTemporaria,
    });
  } catch (e) {
    return jsonResponse({ error: 'Erro inesperado: ' + String(e) }, 500);
  }
});
