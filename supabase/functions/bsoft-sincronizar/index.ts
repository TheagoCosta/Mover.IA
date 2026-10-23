// =====================================================================
// MOVER.IA — Edge Function "bsoft-sincronizar" (integração com o Bsoft TMS)
//
// Lê os MDF-e (manifestos) emitidos no Bsoft, acha o motorista no MOVER.IA (pelo CPF ou pela
// placa do conjunto), cria a viagem no app dele e anexa os PDFs do DAMDFE e dos DACTE — o
// motorista recebe o aviso e pode baixar/compartilhar. SÓ LÊ do Bsoft (a API não tem ambiente
// de testes; nada é gravado lá). Documentação: https://docs.bsoft.app
//
// Credenciais do Bsoft = segredos desta função, cadastrados pelo Thiago no painel do Supabase
// (Edge Functions → Secrets): BSOFT_DOMINIO (só o começo de xxx.bsoft.app), BSOFT_USUARIO
// (usuário com perfil de integração) e BSOFT_SENHA. Nunca no banco nem no código.
//
// Quem pode chamar (verify_jwt = false; a função confere):
//   • o escritório logado (gestão da transportadora com a integração habilitada)
//   • o agendamento do banco (pg_cron), com o segredo da tabela integracao_segredo
// Ações: status | testar | previa (mostra o que seria importado, sem gravar) | sincronizar
// =====================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const PAPEIS_GESTAO = ['admin_transportadora', 'gestor', 'admin_mover_ia'];
const MAX_NOVAS_POR_RODADA = 30;     // o resto fica para a próxima rodada (limite de tempo da função)
const MAX_CTES_POR_MANIFESTO = 10;

function jsonResponse(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' },
  });
}
function iguais(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
const digitos = (s: unknown) => String(s ?? '').replace(/\D/g, '');
const placaNorm = (s: unknown) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const b64utf8 = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s)));
const nomeArquivo = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '_').slice(0, 80);

// ---------- credenciais e cliente da API ----------
function credenciais() {
  const dominio = String(Deno.env.get('BSOFT_DOMINIO') ?? '').trim().toLowerCase()
    .replace(/^https?:\/\//, '').replace(/\.bsoft\.app.*$/, '').replace(/\/.*$/, '');
  const usuario = String(Deno.env.get('BSOFT_USUARIO') ?? '').trim();
  const senha = String(Deno.env.get('BSOFT_SENHA') ?? '');
  if (!dominio || !usuario || !senha || !/^[a-z0-9-]+$/.test(dominio)) return null;
  return { dominio, usuario, senha };
}

class ErroBsoft extends Error {
  constructor(public status: number, mensagem: string) { super(mensagem); }
}

function criarApi(c: { dominio: string; usuario: string; senha: string }) {
  const base = `https://${c.dominio}.bsoft.app/services/index.php`;
  const auth = 'Basic ' + b64utf8(`${c.usuario}:${c.senha}`);
  async function get(caminho: string, params: Record<string, string> = {}) {
    const qs = Object.entries(params).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v).replace(/%2C/g, ',')}`).join('&');
    let resp: Response;
    try {
      resp = await fetch(base + caminho + (qs ? '?' + qs : ''), { headers: { Authorization: auth, Accept: 'application/json' }, signal: AbortSignal.timeout(30000) });
    } catch (_e) {
      throw new ErroBsoft(0, 'Não consegui falar com o Bsoft. Confira o domínio (BSOFT_DOMINIO) e se a Bsoft libera o acesso da API por endereço IP.');
    }
    const texto = await resp.text();
    let dados: unknown = null;
    try { dados = texto ? JSON.parse(texto) : null; } catch (_e) { dados = null; }
    if (resp.status === 401 || resp.status === 403) throw new ErroBsoft(resp.status, 'O Bsoft recusou o acesso: confira o usuário e a senha, e se o usuário tem o perfil de integração.');
    if (!resp.ok) {
      const msg = dados && typeof dados === 'object' && 'message' in (dados as Record<string, unknown>) ? String((dados as Record<string, unknown>).message) : `erro ${resp.status}`;
      throw new ErroBsoft(resp.status, msg);
    }
    return dados;
  }
  // POST só para CONSULTAS que a API faz por POST (ex.: XML do CT-e) — nada é gravado no Bsoft
  async function consultaPost(caminho: string, corpo: unknown) {
    let resp: Response;
    try {
      resp = await fetch(base + caminho, { method: 'POST', headers: { Authorization: auth, Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify(corpo), signal: AbortSignal.timeout(30000) });
    } catch (_e) {
      throw new ErroBsoft(0, 'Não consegui falar com o Bsoft.');
    }
    const texto = await resp.text();
    let dados: unknown = null;
    try { dados = texto ? JSON.parse(texto) : null; } catch (_e) { dados = null; }
    if (!resp.ok) throw new ErroBsoft(resp.status, dados && typeof dados === 'object' && 'message' in (dados as Record<string, unknown>) ? String((dados as Record<string, unknown>).message) : `erro ${resp.status}`);
    return dados;
  }
  return { get, consultaPost };
}

// ---------- endereços pelo XML do CT-e ----------
const desfazerEntidades = (s: string) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(Number(n)));
function tagXml(xml: string | null, tag: string): string | null {
  if (!xml) return null;
  const m = xml.match(new RegExp(`<(?:\\w+:)?${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?${tag}>`));
  return m ? desfazerEntidades(m[1].trim()) : null;
}
function enderecoXml(bloco: string | null, tagEnder: string): string | null {
  const e = tagXml(bloco, tagEnder);
  if (!e) return null;
  const v = (t: string) => tagXml(e, t);
  const rua = [v('xLgr'), v('nro')].filter(Boolean).join(', ');
  const cep = v('CEP');
  const partes = [rua, v('xCpl'), v('xBairro'), [v('xMun'), v('UF')].filter(Boolean).join('/'), cep ? 'CEP ' + cep.replace(/^(\d{5})(\d{3})$/, '$1-$2') : null].filter(Boolean);
  return partes.length ? partes.join(' - ').slice(0, 300) : null;
}
// coleta = expedidor (se houver) ou remetente; entrega = recebedor (se houver) ou destinatário
function locaisDoCte(xml: string) {
  const exped = tagXml(xml, 'exped'), rem = tagXml(xml, 'rem'), receb = tagXml(xml, 'receb'), dest = tagXml(xml, 'dest');
  const coleta = exped ? { nome: tagXml(exped, 'xNome'), endereco: enderecoXml(exped, 'enderExped') } : { nome: tagXml(rem, 'xNome'), endereco: enderecoXml(rem, 'enderReme') };
  const entrega = receb ? { nome: tagXml(receb, 'xNome'), endereco: enderecoXml(receb, 'enderReceb') } : { nome: tagXml(dest, 'xNome'), endereco: enderecoXml(dest, 'enderDest') };
  return { coleta, entrega };
}
async function lerLocaisViagem(api: ReturnType<typeof criarApi>, chaves: string[]) {
  if (!chaves.length) return null;
  try {
    const r = await api.consultaPost('/eDoc/v1/XMLDocumentosFiscais/CTesEmitidos', { chaveAcesso: chaves.slice(0, 50) });
    const lista = (Array.isArray(r) ? r : []) as { chaveAcesso?: string; xml?: { autorizacao?: string } }[];
    const xmls = chaves.map(c => lista.find(x => x.chaveAcesso === c)?.xml?.autorizacao).filter(Boolean) as string[];
    if (!xmls.length) return null;
    return { coleta: locaisDoCte(xmls[0]).coleta, entrega: locaisDoCte(xmls[xmls.length - 1]).entrega };
  } catch (_e) {
    return null;   // sem XML: fica com os nomes do CT-e
  }
}

// lista vazia quando o Bsoft responde "nada encontrado" (404) em consultas de lista
async function lista(api: ReturnType<typeof criarApi>, caminho: string, params: Record<string, string>) {
  try {
    const d = await api.get(caminho, params);
    return Array.isArray(d) ? d : [];
  } catch (e) {
    if (e instanceof ErroBsoft && e.status === 404) return [];
    throw e;
  }
}

function hojeBrasilia(deslocDias = 0) {
  const d = new Date(Date.now() - 3 * 3600000 - deslocDias * 86400000);
  return d.toISOString().slice(0, 10);
}

// ---------- principal ----------
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return jsonResponse({ ok: true });
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  let tid: string | null = null;
  try {
    const body = await req.json().catch(() => ({}));
    // quem está chamando?
    if (typeof body?.segredo === 'string') {
      const { data: s } = await admin.from('integracao_segredo').select('segredo').eq('id', 1).single();
      if (!s || !iguais(body.segredo, s.segredo)) return jsonResponse({ error: 'Não autorizado.' }, 401);
      tid = String(body.transportadora_id ?? '');
    } else {
      const authHeader = req.headers.get('Authorization');
      if (!authHeader) return jsonResponse({ error: 'Não autenticado.' }, 401);
      const supabaseAuth = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
      const { data: quem, error: erroAuth } = await supabaseAuth.auth.getUser();
      if (erroAuth || !quem?.user) return jsonResponse({ error: 'Sessão inválida.' }, 401);
      const { data: chamador } = await admin.from('usuario').select('papel, transportadora_id, ativo').eq('id', quem.user.id).single();
      if (!chamador || !chamador.ativo || !PAPEIS_GESTAO.includes(chamador.papel)) return jsonResponse({ error: 'Sem permissão.' }, 403);
      tid = chamador.transportadora_id;
    }
    const { data: cfg } = await admin.from('integracao_bsoft').select('*').eq('transportadora_id', tid).maybeSingle();
    if (!cfg) return jsonResponse({ error: 'Integração com o Bsoft não habilitada para esta transportadora.' }, 403);

    const acao = String(body?.acao ?? 'status');
    const cred = credenciais();
    if (acao === 'status') {
      return jsonResponse({ configurado: !!cred, dominio: cred ? `${cred.dominio}.bsoft.app` : null, ativo: cfg.ativo, ultima_execucao: cfg.ultima_execucao, ultimo_status: cfg.ultimo_status, ultimo_resumo: cfg.ultimo_resumo, dias_retroativos: cfg.dias_retroativos });
    }
    if (!cred) {
      return jsonResponse({ configurado: false, error: 'Faltam os dados de acesso do Bsoft (segredos BSOFT_DOMINIO, BSOFT_USUARIO e BSOFT_SENHA no Supabase).' });
    }
    const api = criarApi(cred);

    if (acao === 'testar') {
      const veiculos = await lista(api, '/transporte/v1/veiculos', { limit: '0,1' });
      const manifestos = await lista(api, '/transporte/v1/manifestos', { dtEmissaoInicio: hojeBrasilia(cfg.dias_retroativos), dtEmissaoFim: hojeBrasilia(), limit: '0,50' });
      return jsonResponse({ ok: true, dominio: `${cred.dominio}.bsoft.app`, veiculo_exemplo: veiculos.length > 0, manifestos_periodo: manifestos.length, dias: cfg.dias_retroativos });
    }

    // diagnóstico: só os NOMES dos campos de um CT-e recente (sem valores), para ajustar a leitura de origem/destino
    if (acao === 'campos') {
      const r = await lista(api, '/transporte/v1/conhecimentos', { dataInicio: hojeBrasilia(cfg.dias_retroativos), dataFim: hojeBrasilia(), limit: '0,1' });
      const c = (r[0] ?? {}) as Record<string, unknown>;
      const estrutura: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(c)) estrutura[k] = v && typeof v === 'object' && !Array.isArray(v) ? Object.keys(v as Record<string, unknown>) : typeof v;
      return jsonResponse({ ok: true, estrutura });
    }

    // levantamento (SÓ LEITURA) do que o envio de abastecimento ao Bsoft vai precisar: combustíveis,
    // tipos de documento, rateios, almoxarifados, quantos veículos e motoristas do MOVER.IA existem lá
    if (acao === 'opcoes_abastecimento') {
      const seguro = async (fn: () => Promise<unknown>) => { try { return await fn(); } catch (e) { return { erro: (e as Error).message }; } };
      const todos = async (caminho: string, params: Record<string, string> = {}) => {
        const saida: Record<string, unknown>[] = [];
        for (let p = 0; p < 20; p++) {
          const lote = await lista(api, caminho, { ...params, limit: `${p * 100},100` });
          saida.push(...lote);
          if (lote.length < 100) break;
        }
        return saida;
      };
      const [combustiveis, tiposDoc, rateios, almoxarifados, equipamentos, motoristasBsoft, fornecedores] = await Promise.all([
        seguro(() => lista(api, '/manutencao/v1/combustiveis', {})),
        seguro(() => api.get('/financeiro/v1/tiposDocumentos')),
        seguro(() => todos('/financeiro/v1/rateios')),
        seguro(() => todos('/estoque/v1/almoxarifados')),
        seguro(() => todos('/manutencao/v1/equipamentos')),
        seguro(() => todos('/pessoas/v1/pessoas/fisicas', { grupo: 'motoristas' })),
        seguro(() => todos('/pessoas/v1/pessoas/juridicas', { grupo: 'fornecedores' })),
      ]);
      const [{ data: nossosVeiculos }, { data: nossosPerfis }, { data: nossosMot }] = await Promise.all([
        admin.from('veiculo').select('placa, tipo').eq('transportadora_id', tid).eq('ativo', true),
        admin.from('motorista_perfil').select('usuario_id, cpf'),
        admin.from('usuario').select('id').eq('transportadora_id', tid).eq('papel', 'motorista').eq('ativo', true),
      ]);
      const placasEquip = new Set((Array.isArray(equipamentos) ? equipamentos : []).map(e => placaNorm((e as Record<string, unknown>).equipamento)));
      const cavalos = ((nossosVeiculos ?? []) as { placa: string; tipo: string }[]).filter(v => v.tipo === 'cavalo');
      const cpfsBsoft = new Set((Array.isArray(motoristasBsoft) ? motoristasBsoft : []).map(m => digitos((m as Record<string, unknown>).cpf)));
      const idsMot = new Set(((nossosMot ?? []) as { id: string }[]).map(m => m.id));
      const cpfsNossos = ((nossosPerfis ?? []) as { usuario_id: string; cpf: string | null }[]).filter(p => idsMot.has(p.usuario_id) && digitos(p.cpf).length === 11).map(p => digitos(p.cpf));
      return jsonResponse({
        ok: true,
        combustiveis, tipos_documento: tiposDoc,
        rateios: Array.isArray(rateios) ? (rateios as Record<string, unknown>[]).map(r => ({ cod: r.codRateio, descricao: r.descricao })) : rateios,
        almoxarifados: Array.isArray(almoxarifados) ? (almoxarifados as Record<string, unknown>[]).map(a => ({ id: a.id, descricao: a.descricao ?? a.nome })) : almoxarifados,
        fornecedores: Array.isArray(fornecedores) ? { total: fornecedores.length, nomes: (fornecedores as Record<string, unknown>[]).map(f => f.nomeFantasia || f.razaoSocial).slice(0, 80) } : fornecedores,
        equipamentos_total: Array.isArray(equipamentos) ? equipamentos.length : equipamentos,
        cavalos_mover: cavalos.length, cavalos_achados_no_bsoft: cavalos.filter(v => placasEquip.has(placaNorm(v.placa))).length,
        cavalos_nao_achados: cavalos.filter(v => !placasEquip.has(placaNorm(v.placa))).map(v => v.placa),
        motoristas_mover: cpfsNossos.length, motoristas_achados_no_bsoft: cpfsNossos.filter(c => cpfsBsoft.has(c)).length,
      });
    }

    if (acao !== 'previa' && acao !== 'sincronizar') return jsonResponse({ error: 'Ação inválida.' }, 400);
    const gravar = acao === 'sincronizar';

    // 1) MDF-e do período (paginado)
    const manifestos: Record<string, unknown>[] = [];
    for (let pagina = 0; pagina < 10; pagina++) {
      const lote = await lista(api, '/transporte/v1/manifestos', { dtEmissaoInicio: hojeBrasilia(cfg.dias_retroativos), dtEmissaoFim: hojeBrasilia(), limit: `${pagina * 50},50` });
      manifestos.push(...lote);
      if (lote.length < 50) break;
    }
    // mais NOVO primeiro: os recentes nunca ficam para depois por causa do limite de cada rodada
    const numeroBsoft = (m: Record<string, unknown>) => Number(m.id) || 0;
    manifestos.sort((a, b) => numeroBsoft(b) - numeroBsoft(a));

    // 2) dados do MOVER.IA para achar o motorista
    const [{ data: usuarios }, { data: perfis }, { data: veiculos }, { data: conjuntos }, { data: jaImportadas }] = await Promise.all([
      admin.from('usuario').select('id, nome, ativo').eq('transportadora_id', tid).eq('papel', 'motorista'),
      admin.from('motorista_perfil').select('usuario_id, cpf'),
      admin.from('veiculo').select('id, placa, tipo').eq('transportadora_id', tid),
      admin.from('conjunto').select('motorista_id, conjunto_item(veiculo_id)').eq('transportadora_id', tid).eq('ativo', true),
      admin.from('viagem').select('id, bsoft_manifesto_id, motorista_id, origem, origem_endereco').eq('transportadora_id', tid).not('bsoft_manifesto_id', 'is', null),
    ]);
    type Motorista = { id: string; nome: string; ativo?: boolean };
    const motoristaPorId = new Map<string, Motorista>(((usuarios ?? []) as Motorista[]).filter(u => u.ativo).map(u => [u.id, u]));
    const motoristaPorCpf = new Map<string, Motorista>();
    ((perfis ?? []) as { usuario_id: string; cpf: string | null }[]).forEach(p => { const m = motoristaPorId.get(p.usuario_id); if (m && digitos(p.cpf).length === 11) motoristaPorCpf.set(digitos(p.cpf), m); });
    const veiculoPorPlaca = new Map<string, { id: string; placa: string }>(((veiculos ?? []) as { id: string; placa: string }[]).map(v => [placaNorm(v.placa), v]));
    const motoristaPorVeiculo = new Map<string, string>();
    ((conjuntos ?? []) as { motorista_id: string | null; conjunto_item: { veiculo_id: string }[] }[]).forEach(c => (c.conjunto_item ?? []).forEach((i: { veiculo_id: string }) => { if (c.motorista_id) motoristaPorVeiculo.set(i.veiculo_id, c.motorista_id); }));
    const importadas = (jaImportadas ?? []) as { id: string; bsoft_manifesto_id: string; motorista_id: string | null; origem: string | null; origem_endereco: string | null }[];
    const viagemPorManifesto = new Map<string, string>(importadas.map(v => [String(v.bsoft_manifesto_id), v.id]));
    const semOrigem = new Set(importadas.filter(v => !v.origem || !v.origem_endereco).map(v => v.id));   // importadas antes de ler os endereços
    // MDF-e mais novo já importado de cada motorista (o nº do Bsoft cresce com o tempo)
    const maisNovoPorMotorista = new Map<string, number>();
    importadas.forEach(v => { if (v.motorista_id) maisNovoPorMotorista.set(v.motorista_id, Math.max(maisNovoPorMotorista.get(v.motorista_id) ?? 0, Number(v.bsoft_manifesto_id) || 0)); });
    const inicioRodada = Date.now();

    const achar = (m: Record<string, unknown>): { motorista: Motorista | null; por: string | null } => {
      const porCpf = motoristaPorCpf.get(digitos(m.motoristaDocumento));
      if (porCpf) return { motorista: porCpf, por: 'cpf' };
      for (const campo of ['placa', 'carreta', 'semiReboque', 'quartoVeiculo']) {
        const v = veiculoPorPlaca.get(placaNorm(m[campo]));
        const mid = v ? motoristaPorVeiculo.get(v.id) : null;
        const mot = mid ? motoristaPorId.get(mid) : null;
        if (mot) return { motorista: mot, por: 'placa' };
      }
      return { motorista: null, por: null };
    };

    const resumo = { periodo: `${hojeBrasilia(cfg.dias_retroativos)} a ${hojeBrasilia()}`, manifestos: manifestos.length, criadas: 0, ja_importadas: 0, pdfs: 0, pendentes: 0, sem_motorista: [] as unknown[], erros: [] as string[], itens: [] as unknown[] };
    let novasNestaRodada = 0;

    for (const m of manifestos) {
      const idBsoft = String(m.id ?? '');
      if (!idBsoft) continue;
      const { motorista, por } = achar(m);
      const chaves = ((m.documentos as Record<string, unknown>)?.cte as { chaveAcesso?: string }[] ?? []).map(c => c.chaveAcesso).filter(Boolean).slice(0, MAX_CTES_POR_MANIFESTO) as string[];
      const viagemExistente = viagemPorManifesto.get(idBsoft);
      const situacao = viagemExistente ? 'ja_importada' : motorista ? 'nova' : 'sem_motorista';
      const item = { manifesto: m.nro, emissao: m.dtEmissao, placa: m.placa, motorista: motorista?.nome ?? null, motorista_bsoft: m.motorista ?? null, achado_por: por, ctes: chaves.length, situacao };
      resumo.itens.push(item);
      if (situacao === 'ja_importada') resumo.ja_importadas++;
      if (situacao === 'sem_motorista') resumo.sem_motorista.push({ manifesto: m.nro, placa: m.placa, motorista_bsoft: m.motorista ?? null });
      if (!gravar || situacao === 'sem_motorista') continue;
      if (situacao === 'nova' && novasNestaRodada >= MAX_NOVAS_POR_RODADA) { resumo.pendentes++; continue; }
      if (Date.now() - inicioRodada > 100000) { resumo.pendentes++; continue; }   // perto do limite de tempo: o resto vai na próxima rodada

      try {
        // já importada e com todos os PDFs: nada a fazer (não consulta o Bsoft de novo)
        if (viagemExistente) {
          const { data: d0 } = await admin.from('documento').select('bsoft_ref').eq('referente_a', 'viagem').eq('referente_id', viagemExistente);
          const refs = (d0 ?? []).map(x => String(x.bsoft_ref ?? ''));
          if (refs.includes(`mdfe:${idBsoft}`) && refs.filter(r => r.startsWith('cte:')).length >= chaves.length && !semOrigem.has(viagemExistente)) continue;
        }
        // CT-e do manifesto: número, origem e destino
        const ctes: { id: string; nro: string; origem: string | null; destino: string | null }[] = [];
        for (const chave of chaves) {
          const r = await lista(api, '/transporte/v1/conhecimentos', { chaveAcesso: chave, limit: '0,1' });
          const c = r[0] as Record<string, unknown> | undefined;
          if (!c) continue;
          // cidade/UF quando o Bsoft manda (dados_remetente/dados_destinatario); senão, o nome de quem envia e de quem recebe
          const local = (d: unknown, nome: unknown) => {
            const x = d as Record<string, unknown> | undefined;
            if (x && x.cidade) return `${x.cidade}${x.estado ? '/' + x.estado : ''}`;
            return nome ? String(nome).trim().slice(0, 80) || null : null;
          };
          ctes.push({ id: String(c.id), nro: String(c.nro ?? ''), origem: local(c.dados_remetente, c.remetente), destino: local(c.dados_destinatario, c.recebedor || c.destinatario) });
        }

        // coleta e entrega com endereço completo (XML do CT-e); sem XML, os nomes do CT-e
        const locais = await lerLocaisViagem(api, chaves);
        const dadosLocais = {
          origem: locais?.coleta.nome ?? ctes.find(c => c.origem)?.origem ?? null,
          destino: locais?.entrega.nome ?? [...ctes].reverse().find(c => c.destino)?.destino ?? null,
          origem_endereco: locais?.coleta.endereco ?? null,
          destino_endereco: locais?.entrega.endereco ?? null,
        };
        let viagemId = viagemExistente;
        if (viagemId && semOrigem.has(viagemId) && (ctes.length || locais)) {
          await admin.from('viagem').update(dadosLocais).eq('id', viagemId);
          semOrigem.delete(viagemId);
        }
        if (!viagemId) {
          const cavalo = veiculoPorPlaca.get(placaNorm(m.placa));
          // o MDF-e mais novo do motorista é a viagem atual; um mais antigo entra já concluído (só histórico e PDFs, sem aviso)
          const atual = numeroBsoft(m) > (maisNovoPorMotorista.get(motorista!.id) ?? 0);
          const { data: nova, error } = await admin.from('viagem').insert({
            transportadora_id: tid, motorista_id: motorista!.id, veiculo_id: cavalo?.id ?? null,
            ...dadosLocais,
            cte_numero: ctes.map(c => c.nro).filter(Boolean).join(', ') || null, mdfe_numero: String(m.nro ?? '') || null,
            status: atual ? 'em_andamento' : 'concluida', bsoft_manifesto_id: idBsoft,
          }).select('id').single();
          if (error) throw new Error('viagem: ' + error.message);
          viagemId = (nova as { id: string }).id;
          viagemPorManifesto.set(idBsoft, viagemId);
          novasNestaRodada++; resumo.criadas++;
          if (atual) {
            maisNovoPorMotorista.set(motorista!.id, numeroBsoft(m));
            // as viagens anteriores dele vindas do Bsoft são concluídas
            await admin.from('viagem').update({ status: 'concluida' }).eq('transportadora_id', tid).eq('motorista_id', motorista!.id)
              .eq('status', 'em_andamento').not('bsoft_manifesto_id', 'is', null).neq('id', viagemId);
          }
        }

        // PDFs (o que faltar — tenta de novo na próxima rodada se falhar)
        const { data: docsExistentes } = await admin.from('documento').select('bsoft_ref').eq('referente_a', 'viagem').eq('referente_id', viagemId);
        const tem = new Set((docsExistentes ?? []).map(d => d.bsoft_ref));
        const pdfs = [{ ref: `mdfe:${idBsoft}`, tipo: 'MDF-e', numero: String(m.nro ?? ''), caminho: `/transporte/v1/manifestos/${idBsoft}/obterDAMDFe` },
          ...ctes.map(c => ({ ref: `cte:${c.id}`, tipo: 'CT-e', numero: c.nro, caminho: `/transporte/v1/conhecimentos/${c.id}/obterDacte` }))];
        for (const p of pdfs) {
          if (tem.has(p.ref)) continue;
          try {
            const r = await api.get(p.caminho) as { pdf?: string } | null;
            if (!r?.pdf) throw new Error('PDF vazio');
            const bytes = Uint8Array.from(atob(r.pdf), ch => ch.charCodeAt(0));
            const caminho = `${tid}/viagem/${viagemId}/${nomeArquivo(`${p.tipo}_${p.numero || p.ref}`)}.pdf`;
            const { error: eUp } = await admin.storage.from('documentos').upload(caminho, bytes, { contentType: 'application/pdf', upsert: true });
            if (eUp) throw new Error(eUp.message);
            const { error: eDoc } = await admin.from('documento').insert({ transportadora_id: tid, referente_a: 'viagem', referente_id: viagemId, tipo: p.tipo, numero: p.numero || null, status: 'ok', arquivo_url: caminho, bsoft_ref: p.ref });
            if (eDoc) throw new Error(eDoc.message);
            resumo.pdfs++;
          } catch (e) {
            resumo.erros.push(`MDF-e ${m.nro}: PDF ${p.tipo} ${p.numero} — ${(e as Error).message}`);
          }
        }
      } catch (e) {
        resumo.erros.push(`MDF-e ${m.nro}: ${(e as Error).message}`);
      }
    }

    if (gravar) {
      const status = resumo.erros.length && !resumo.criadas && !resumo.pdfs ? 'erro' : 'ok';
      const guardado = { ...resumo, itens: undefined, sem_motorista: resumo.sem_motorista.slice(0, 30), erros: resumo.erros.slice(0, 30) };
      await admin.from('integracao_bsoft').update({ ultima_execucao: new Date().toISOString(), ultimo_status: status, ultimo_resumo: guardado }).eq('transportadora_id', tid);
      await admin.from('sincronizacao_log').insert({ transportadora_id: tid, status: status === 'ok' ? 'sucesso' : 'erro', registros_processados: resumo.criadas, erro: resumo.erros.length ? resumo.erros.slice(0, 5).join(' | ') : null });
    }
    return jsonResponse({ ok: true, acao, ...resumo });
  } catch (e) {
    const mensagem = e instanceof ErroBsoft ? e.message : 'Erro na integração: ' + (e as Error).message;
    if (tid) {
      await admin.from('integracao_bsoft').update({ ultima_execucao: new Date().toISOString(), ultimo_status: 'erro', ultimo_resumo: { erro: mensagem } }).eq('transportadora_id', tid);
      await admin.from('sincronizacao_log').insert({ transportadora_id: tid, status: 'erro', registros_processados: 0, erro: mensagem.slice(0, 500) });
    }
    return jsonResponse({ ok: false, error: mensagem });
  }
});
