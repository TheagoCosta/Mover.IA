// =====================================================================
// MOVER.IA — Edge Function "bsoft-explorar" (diagnóstico, SÓ LEITURA, só GET; 04/11/2026)
//
// Descobre onde o Bsoft guarda os arquivos das pessoas (aba Arquivos do motorista e da
// transportadora) e os "Documentos dos Equipamentos" (que não estão na documentação oficial).
// Devolve só nomes de campos, descrição/tipo dos arquivos e o tamanho — nunca o conteúdo nem
// CPF/CNPJ. Não grava nada no Bsoft nem no MOVER.IA.
// Só o banco chama (segredo da tabela integracao_segredo); verify_jwt = false.
// Credenciais: os mesmos segredos BSOFT_* do projeto (cadastrados pelo Thiago).
// =====================================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } });
const digitos = (s: unknown) => String(s ?? '').replace(/\D/g, '');
const b64utf8 = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s)));
function iguais(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
// esconde CPF/CNPJ e troca textos longos (base64 dos arquivos) pelo tamanho
const mascara = (v: unknown): unknown => typeof v === 'string'
  ? (v.length > 120 ? `[texto com ${v.length} caracteres]` : v.replace(/\d{3}\.?\d{3}\.?\d{3}-?\d{2}|\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/g, '[doc]'))
  : Array.isArray(v) ? v.slice(0, 8).map(mascara)
  : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, mascara(x)])) : v;

Deno.serve(async (req: Request) => {
  const body = await req.json().catch(() => ({}));
  const { data: s } = await admin.from('integracao_segredo').select('segredo').eq('id', 1).single();
  if (typeof body?.segredo !== 'string' || !s || !iguais(body.segredo, s.segredo)) return json({ error: 'Não autorizado.' }, 401);
  const tid = String(body.transportadora_id ?? '');

  const dominio = String(Deno.env.get('BSOFT_DOMINIO') ?? '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\.bsoft\.app.*$/, '').replace(/\/.*$/, '');
  const usuario = String(Deno.env.get('BSOFT_USUARIO') ?? '').trim(), senha = String(Deno.env.get('BSOFT_SENHA') ?? '');
  if (!/^[a-z0-9-]+$/.test(dominio) || !usuario || !senha) return json({ error: 'Sem credenciais do Bsoft.' });
  const base = `https://${dominio}.bsoft.app/services/index.php`, auth = 'Basic ' + b64utf8(`${usuario}:${senha}`);

  // SÓ GET
  const get = async (caminho: string, params: Record<string, string> = {}) => {
    const qs = Object.entries(params).filter(([, v]) => v !== '').map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v).replace(/%2C/g, ',')}`).join('&');
    const resp = await fetch(base + caminho + (qs ? '?' + qs : ''), { method: 'GET', headers: { Authorization: auth, Accept: 'application/json' }, signal: AbortSignal.timeout(30000) });
    const texto = await resp.text();
    let dados: unknown = null;
    try { dados = texto ? JSON.parse(texto) : null; } catch (_e) { dados = texto.slice(0, 200); }
    return { status: resp.status, dados };
  };
  const tentar = async (caminho: string, params: Record<string, string> = {}) => {
    try {
      const { status, dados } = await get(caminho, params);
      const itens = Array.isArray(dados) ? dados : null;
      return { caminho, params: Object.keys(params), status, qtd: itens ? itens.length : null,
        campos: itens && itens[0] && typeof itens[0] === 'object' ? Object.keys(itens[0] as object) : null, amostra: mascara(dados) };
    } catch (e) { return { caminho, params: Object.keys(params), status: 0, erro: String((e as Error).message).slice(0, 160) }; }
  };
  const primeiro = async (caminho: string, params: Record<string, string>) => {
    try { const { dados } = await get(caminho, params); return Array.isArray(dados) ? dados[0] as Record<string, unknown> | undefined : undefined; } catch (_e) { return undefined; }
  };
  const r: Record<string, unknown> = {};

  // motorista: o CPF é lido aqui dentro, não vem na chamada
  const { data: mp } = await admin.from('motorista_perfil').select('cpf, usuario:usuario_id(transportadora_id)').eq('usuario_id', String(body?.motorista_id ?? '')).maybeSingle();
  const cpf = digitos(mp?.cpf);
  if (cpf.length === 11 && (mp?.usuario as { transportadora_id?: string } | null)?.transportadora_id === tid) {
    const pf = await primeiro('/pessoas/v1/pessoas/fisicas', { cpf, limit: '0,1' });
    const id = pf ? String(pf.id ?? '') : '';
    r.motorista_cadastro = pf ? { campos: Object.keys(pf), achou: true } : 'não achei pelo CPF';
    const fmt = cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    r.motorista_arquivos = await Promise.all([
      tentar('/pessoas/v1/pessoas/arquivos', { id }), tentar('/pessoas/v1/pessoas/arquivos', { pessoa: id }),
      tentar('/pessoas/v1/pessoas/arquivos', { documento: cpf }), tentar('/pessoas/v1/pessoas/arquivos', { documento: fmt }),
      tentar(`/pessoas/v1/pessoas/arquivos/${encodeURIComponent(id)}`), tentar(`/pessoas/v1/pessoas/${encodeURIComponent(id)}/arquivos`),
    ]);
    r.motorista_documentos = await Promise.all([
      tentar(`/pessoas/v1/pessoas/${encodeURIComponent(id)}/documentos`), tentar(`/services/pessoas/v1/pessoas/${encodeURIComponent(id)}/documentos`),
    ]);
  } else r.motorista = 'motorista não encontrado nesta transportadora';

  // transportadora
  const { data: tr } = await admin.from('transportadora').select('cnpj').eq('id', tid).single();
  const cnpj = digitos(tr?.cnpj);
  if (cnpj.length === 14) {
    const pj = await primeiro('/pessoas/v1/pessoas/juridicas', { cnpj, limit: '0,1' });
    const id = pj ? String(pj.id ?? '') : '';
    r.empresa_cadastro = pj ? { campos: Object.keys(pj), achou: true } : 'não achei pelo CNPJ';
    r.empresa_arquivos = await Promise.all([
      tentar('/pessoas/v1/pessoas/arquivos', { id }), tentar('/pessoas/v1/pessoas/arquivos', { documento: cnpj }),
      tentar(`/pessoas/v1/pessoas/arquivos/${encodeURIComponent(id)}`), tentar(`/pessoas/v1/pessoas/${encodeURIComponent(id)}/arquivos`),
    ]);
  }

  // documentos dos equipamentos (fora da documentação oficial: tentativas de leitura)
  const placa = String(body?.placa ?? '');
  if (placa) {
    const eq = await primeiro('/manutencao/v1/equipamentos', { equipamento: placa, limit: '0,5' });
    const ve = await primeiro('/transporte/v1/veiculos', { placa, limit: '0,1' });
    const eid = String(eq?.id ?? ''), vid = String(ve?.id ?? '');
    r.equipamento = { achou_manutencao: !!eid, achou_transporte: !!vid };
    r.equipamento_documentos = await Promise.all([
      tentar('/manutencao/v1/documentosEquipamentos', { equipamento: placa }), tentar('/manutencao/v1/equipamentosDocumentos', { equipamento: placa }),
      tentar('/manutencao/v1/equipamentos/documentos', { equipamento: placa }), tentar(`/manutencao/v1/equipamentos/${encodeURIComponent(eid)}/documentos`),
      tentar('/manutencao/v1/documentos', { equipamento: placa }), tentar('/manutencao/v1/documentosEquipamento', { equipamento: placa }),
      tentar(`/transporte/v1/veiculos/${encodeURIComponent(vid)}/documentos`), tentar('/transporte/v1/veiculos/documentos', { placa }),
      tentar(`/transporte/v1/veiculos/${encodeURIComponent(vid)}/arquivos`), tentar('/manutencao/v1/equipamentos/arquivos', { equipamento: placa }),
      tentar(`/manutencao/v1/equipamentos/${encodeURIComponent(eid)}`),
    ]);
  }
  return json({ ok: true, ...r });
});
