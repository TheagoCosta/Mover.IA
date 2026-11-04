// =====================================================================
// MOVER.IA — Edge Function "bsoft-equipamentos" (04/11/2026)
//
// Recebe os "Documentos dos Equipamentos" do Bsoft (Manutenção → Relatórios → Documentos dos
// Equipamentos: AET, cronotacógrafo, CIV, CIPP...) e grava na aba Documentos do veículo.
// Essa tela NÃO existe na API do Bsoft, e o arquivo só baixa com alguém logado no site. Então quem
// lê a tela e baixa os arquivos é o navegador já logado no Bsoft (o Thiago entra; o Claude roda a
// importação na sessão dele) e manda cada documento para cá. A senha do Bsoft nunca passa por aqui.
//
// Autorização: um "ticket" de importação com prazo curto, assinado com o segredo do banco
// (integracao_segredo): sig = hex(hmac_sha256(segredo, "<transportadora_id>|<exp>")), exp em
// segundos (unix). Gerado no banco por quem tem acesso a ele; vale no máximo 2 horas.
// Ações: previa (lista de itens, sem arquivo, não grava) | enviar (um item, com o arquivo em base64).
// Não duplica: documento.bsoft_ref = "equip-arq:<id do arquivo no Bsoft>" (ou "equip-reg:..." sem arquivo).
// De cada tipo por veículo fica só o de renovação mais nova (o mais antigo é substituído).
// =====================================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const TAMANHO_MAX = 15 * 1024 * 1024;

const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), {
  status, headers: {
    'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'content-type',
  },
});
const placaNorm = (s: unknown) => String(s ?? '').toUpperCase().replace(/\/[A-Z]{2}\s*$/, '').replace(/[^A-Z0-9]/g, '');
const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();
const digitosNum = (s: unknown) => String(s ?? '').replace(/[^0-9A-Za-z]/g, '').toUpperCase();
const nomeArquivo = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'arquivo';
// "dd/mm/aaaa" ou "aaaa-mm-dd" → "aaaa-mm-dd"
function data(s: unknown): string | null {
  const t = String(s ?? '').trim();
  let m = t.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}
function iguais(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
async function hmacHex(chave: string, msg: string) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(chave), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(msg)));
  return [...sig].map(b => b.toString(16).padStart(2, '0')).join('');
}
function formato(bytes: Uint8Array) {
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return { ext: 'pdf', tipo: 'application/pdf' };
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return { ext: 'jpg', tipo: 'image/jpeg' };
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return { ext: 'png', tipo: 'image/png' };
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[8] === 0x57) return { ext: 'webp', tipo: 'image/webp' };
  return null;
}
function base64ParaBytes(b64: string) {
  const bin = atob(b64.replace(/^data:[^,]*,/, '').replace(/\s/g, ''));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
// tipo do Bsoft → nome no MOVER.IA
function tipoMover(tipoBsoft: string) {
  const t = semAcento(tipoBsoft);
  if (/MG/.test(t) && /LICENCA|AET/.test(t)) return 'AET MG';
  if (/LICENCA FEDERAL|AET FEDERAL/.test(t)) return 'AET Federal';
  if (/LICENCA ESTADUAL|AET ESTADUAL/.test(t)) return 'AET Estadual';
  if (/CRONOTAC/.test(t)) return 'Cronotacógrafo';
  if (/^CIV/.test(t)) return 'CIV';
  if (/^CIPP/.test(t)) return 'CIPP';
  if (/CRLV/.test(t)) return 'CRLV';
  return tipoBsoft.trim().slice(0, 60);
}

type Item = { placa: string; tipo: string; numero?: string; data?: string; renovacao?: string; arquivo_id?: string | number | null; arquivo_b64?: string; nome_arquivo?: string };
type Doc = { id: string; referente_id: string; tipo: string; numero: string | null; validade: string | null; arquivo_url: string | null; bsoft_ref: string | null };

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return json({ ok: true });
  try {
    const body = await req.json().catch(() => ({}));
    // ---- ticket ----
    const tk = body?.ticket ?? {};
    const tid = String(tk.tid ?? ''), exp = Number(tk.exp), sig = String(tk.sig ?? '');
    const agora = Math.floor(Date.now() / 1000);
    if (!tid || !Number.isFinite(exp) || exp < agora || exp > agora + 7200 || !/^[0-9a-f]{64}$/.test(sig)) return json({ error: 'Ticket inválido ou vencido.' }, 401);
    const { data: s } = await admin.from('integracao_segredo').select('segredo').eq('id', 1).single();
    if (!s || !iguais(await hmacHex(s.segredo, `${tid}|${exp}`), sig)) return json({ error: 'Ticket inválido.' }, 401);
    const { data: cfg } = await admin.from('integracao_bsoft').select('transportadora_id').eq('transportadora_id', tid).maybeSingle();
    if (!cfg) return json({ error: 'Integração com o Bsoft não habilitada.' }, 403);

    const acao = String(body?.acao ?? '');
    if (acao !== 'previa' && acao !== 'enviar') return json({ error: 'Ação inválida.' }, 400);
    const itens: Item[] = acao === 'previa' ? (Array.isArray(body.itens) ? body.itens.slice(0, 1000) : []) : [body.item ?? {}];

    const [{ data: veiculos }, { data: docs }] = await Promise.all([
      admin.from('veiculo').select('id, placa').eq('transportadora_id', tid),
      admin.from('documento').select('id, referente_id, tipo, numero, validade, arquivo_url, bsoft_ref').eq('transportadora_id', tid).eq('referente_a', 'veiculo'),
    ]);
    const veiculoPorPlaca = new Map(((veiculos ?? []) as { id: string; placa: string }[]).map(v => [placaNorm(v.placa), v]));
    const documentos = (docs ?? []) as Doc[];

    // decide o que fazer com um item (sem gravar)
    const decidir = (it: Item) => {
      const placa = placaNorm(it.placa), tipo = tipoMover(String(it.tipo ?? ''));
      const validade = data(it.renovacao), numero = String(it.numero ?? '').replace(/\s+/g, ' ').trim().slice(0, 80) || null;
      const arqId = it.arquivo_id != null && String(it.arquivo_id).match(/^\d+$/) ? String(it.arquivo_id) : null;
      const ref = arqId ? `equip-arq:${arqId}` : `equip-reg:${placa}|${semAcento(tipo)}|${digitosNum(numero)}`;
      const r: Record<string, unknown> = { placa: it.placa, tipo, numero, validade, tem_arquivo: !!arqId };
      const v = veiculoPorPlaca.get(placa);
      if (!placa || !tipo) return { ...r, acao: 'pular', motivo: 'linha sem placa ou tipo' };
      if (!v) return { ...r, acao: 'pular', motivo: 'placa fora da frota do MOVER.IA' };
      r.veiculo_id = v.id;
      if (documentos.some(d => d.bsoft_ref === ref)) return { ...r, acao: 'ja', motivo: 'já importado' };
      const mesmos = documentos.filter(d => d.referente_id === v.id && semAcento(d.tipo) === semAcento(tipo));
      const mesmoNumero = numero ? mesmos.find(d => digitosNum(d.numero) === digitosNum(numero)) : undefined;
      if (mesmoNumero) {
        if (!mesmoNumero.arquivo_url && arqId) return { ...r, acao: 'anexar', motivo: 'mesmo documento, sem arquivo: anexa', doc_id: mesmoNumero.id, ref };
        return { ...r, acao: 'ja', motivo: 'mesmo documento já está no MOVER.IA' };
      }
      const atual = mesmos.sort((a, b) => String(b.validade ?? '').localeCompare(String(a.validade ?? '')))[0];
      if (atual) {
        if (validade && atual.validade && atual.validade > validade) return { ...r, acao: 'pular', motivo: 'o MOVER.IA já tem um mais novo' };
        if (atual.bsoft_ref?.startsWith('equip-')) return { ...r, acao: 'atualizar', motivo: 'renovação nova substitui a anterior', doc_id: atual.id, ref };
        if (atual.arquivo_url && (!validade || !atual.validade || atual.validade >= validade)) return { ...r, acao: 'ja', motivo: `já tem ${tipo} no MOVER.IA` };
        return { ...r, acao: 'atualizar', motivo: 'renovação nova substitui a anterior', doc_id: atual.id, ref };
      }
      return { ...r, acao: 'importar', ref };
    };

    if (acao === 'previa') return json({ ok: true, acao, itens: itens.map(decidir) });

    // ---- enviar (um item) ----
    const it = itens[0];
    const d = decidir(it) as Record<string, unknown>;
    if (!['importar', 'anexar', 'atualizar'].includes(String(d.acao))) return json({ ok: true, ...d, feito: false });
    let bytes: Uint8Array | null = null, f: { ext: string; tipo: string } | null = null;
    if (d.tem_arquivo) {
      if (!it.arquivo_b64) return json({ ok: false, ...d, erro: 'arquivo não veio' });
      bytes = base64ParaBytes(it.arquivo_b64);
      if (bytes.length > TAMANHO_MAX) return json({ ok: false, ...d, erro: 'arquivo maior que 15 MB' });
      f = formato(bytes);
      if (!f) return json({ ok: false, ...d, erro: 'o arquivo não é PDF nem imagem' });
    }
    let docId = d.doc_id as string | undefined;
    const antigo = docId ? documentos.find(x => x.id === docId) : undefined;
    if (!docId) {
      const { data: novo, error } = await admin.from('documento').insert({
        transportadora_id: tid, referente_a: 'veiculo', referente_id: d.veiculo_id, tipo: d.tipo,
        numero: d.numero, validade: d.validade, status: 'ok', bsoft_ref: d.ref,
      }).select('id').single();
      if (error) return json({ ok: false, ...d, erro: error.message });
      docId = novo.id;
    }
    const atualiza: Record<string, unknown> = { bsoft_ref: d.ref };
    if (antigo) { if (d.numero) atualiza.numero = d.numero; if (d.validade) atualiza.validade = d.validade; }
    if (bytes && f) {
      const caminho = `${tid}/${docId}_${Date.now()}_${nomeArquivo(it.nome_arquivo || `${d.tipo}_${it.placa}`).replace(/\.(pdf|jpe?g|png|webp)$/i, '')}.${f.ext}`;
      const { error: eUp } = await admin.storage.from('documentos').upload(caminho, bytes, { contentType: f.tipo, upsert: true });
      if (eUp) return json({ ok: false, ...d, erro: 'Storage: ' + eUp.message });
      atualiza.arquivo_url = caminho;
    }
    const { error: eUpd } = await admin.from('documento').update(atualiza).eq('id', docId);
    if (eUpd) return json({ ok: false, ...d, erro: eUpd.message });
    // arquivo antigo de um documento que veio do Bsoft: trocado pela renovação
    if (antigo?.bsoft_ref?.startsWith('equip-') && antigo.arquivo_url && atualiza.arquivo_url) await admin.storage.from('documentos').remove([antigo.arquivo_url]);
    return json({ ok: true, ...d, doc_id: docId, feito: true });
  } catch (e) {
    return json({ ok: false, error: (e as Error).message });
  }
});
