// =====================================================================
// MOVER.IA — Edge Function "registrar-abastecimento-interno"
//
// O motorista lança o abastecimento interno (km, litros, odômetro da bomba,
// Arla) e a pessoa do escritório que abasteceu confirma com a PRÓPRIA senha,
// digitada no celular do motorista. A senha é conferida aqui no servidor
// (nunca fica no aparelho) e o registro guarda quem confirmou e quando.
//
// Regras: quem chama tem de ser motorista ativo; o veículo tem de estar no
// conjunto dele; quem confirma tem de ser do escritório (gestão), ativo e
// da mesma transportadora. Publicada pelo Claude via conector (verify_jwt).
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
const numero = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number(v));

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return jsonResponse({ ok: true });
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return jsonResponse({ error: 'Não autenticado.' }, 401);
    const supabaseAuth = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: quemChama, error: erroAuth } = await supabaseAuth.auth.getUser();
    if (erroAuth || !quemChama?.user) return jsonResponse({ error: 'Sessão inválida.' }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { data: motorista } = await admin.from('usuario').select('id, papel, ativo, transportadora_id').eq('id', quemChama.user.id).single();
    if (!motorista || !motorista.ativo || motorista.papel !== 'motorista') return jsonResponse({ error: 'Só motoristas registram abastecimento por aqui.' }, 403);

    const b = await req.json();
    const km = numero(b?.km), litros = numero(b?.litros), odometro = numero(b?.odometro_bomba), arla = numero(b?.arla_litros);
    if (!b?.veiculo_id || !km || km <= 0 || !litros || litros <= 0) return jsonResponse({ error: 'Informe km e litros.' }, 400);
    if (odometro === null || odometro < 0) return jsonResponse({ error: 'Informe o odômetro da bomba.' }, 400);
    if (arla !== null && arla < 0) return jsonResponse({ error: 'Arla inválido.' }, 400);
    if (!b?.confirmador_id || !b?.senha) return jsonResponse({ error: 'Falta a confirmação do escritório.' }, 400);

    // veículo precisa estar no conjunto ativo do motorista
    const { data: itens } = await admin.from('conjunto_item').select('veiculo_id, conjunto:conjunto_id(motorista_id, ativo, transportadora_id)').eq('veiculo_id', b.veiculo_id);
    const doMotorista = (itens || []).some((i: any) => i.conjunto && i.conjunto.ativo && i.conjunto.motorista_id === motorista.id);
    if (!doMotorista) return jsonResponse({ error: 'Este veículo não está no seu conjunto.' }, 403);

    // quem confirma: escritório, ativo, mesma transportadora — e a senha precisa bater
    const { data: confirmador } = await admin.from('usuario').select('id, nome, email, papel, ativo, transportadora_id').eq('id', b.confirmador_id).single();
    if (!confirmador || !confirmador.ativo || !PAPEIS_GESTAO.includes(confirmador.papel) || confirmador.transportadora_id !== motorista.transportadora_id) {
      return jsonResponse({ error: 'Quem confirma precisa ser do escritório desta transportadora.' }, 403);
    }
    const verificador = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: login, error: erroSenha } = await verificador.auth.signInWithPassword({ email: confirmador.email, password: String(b.senha) });
    if (erroSenha || !login?.user || login.user.id !== confirmador.id) return jsonResponse({ error: 'Senha do escritório incorreta.' }, 401);
    // encerra SÓ a sessão criada para conferir a senha ('local'), sem
    // derrubar o login da pessoa do escritório no computador dela
    await verificador.auth.signOut({ scope: 'local' });

    // consumo médio: km rodados desde o abastecimento anterior do veículo ÷ litros
    const { data: anterior } = await admin.from('abastecimento').select('km').eq('veiculo_id', b.veiculo_id).order('data', { ascending: false }).limit(1);
    const media = anterior && anterior[0] && km > Number(anterior[0].km) ? (km - Number(anterior[0].km)) / litros : null;
    // média do Arla (separada): km desde o último abastecimento COM Arla ÷ litros de Arla
    let mediaArla = null;
    if (arla && arla > 0) {
      const { data: antArla } = await admin.from('abastecimento').select('km').eq('veiculo_id', b.veiculo_id).gt('arla_litros', 0).order('data', { ascending: false }).limit(1);
      if (antArla && antArla[0] && km > Number(antArla[0].km)) mediaArla = (km - Number(antArla[0].km)) / arla;
    }

    const agora = new Date().toISOString();
    const { error } = await admin.from('abastecimento').insert({
      transportadora_id: motorista.transportadora_id,
      motorista_id: motorista.id,
      veiculo_id: b.veiculo_id,
      tipo: 'interno',
      data: agora,
      km, litros, odometro_bomba: odometro, arla_litros: arla,
      media_calculada: media,
      media_arla_calculada: mediaArla,
      confirmado_por: confirmador.id,
      confirmado_em: agora,
    });
    if (error) return jsonResponse({ error: 'Erro ao salvar: ' + error.message }, 400);
    return jsonResponse({ ok: true, media, media_arla: mediaArla, confirmado_por: confirmador.nome });
  } catch (e) {
    return jsonResponse({ error: 'Erro inesperado: ' + String(e) }, 500);
  }
});
