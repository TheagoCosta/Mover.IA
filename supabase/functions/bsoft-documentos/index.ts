// =====================================================================
// MOVER.IA — Edge Function "bsoft-documentos" (04/11/2026)
//
// Traz para a aba Documentos do MOVER.IA os arquivos do cadastro de Pessoas do Bsoft
// (Pessoas → Visualizar → aba Arquivos): dos motoristas (achados pelo CPF) e da transportadora
// (pelo CNPJ). Arquivo "CRLV <placa>" da transportadora vai para o veículo da placa.
// SÓ LÊ do Bsoft (GET /pessoas/v1/pessoas/{id}/arquivos e /documentos). Os "Documentos dos
// Equipamentos" do Bsoft não existem na API (testado em 04/11) — continuam pelo MOVER.IA.
//
// Não duplica: cada arquivo importado guarda documento.bsoft_ref = "pessoa-arq:<id do Bsoft>".
// CNH, CRLV e Ficha cadastral: se o MOVER.IA já tem esse documento com arquivo, fica o do MOVER.IA.
// Validade: CNH e toxicológico do cadastro da pessoa; ASO e outros da aba Documentos do Bsoft.
//
// Ações: previa (só mostra o que viria, sem gravar) | importar (grava no MOVER.IA; por partes —
// devolve "pendentes" quando o tempo acaba, e a tela chama de novo).
// Quem chama (verify_jwt = false; a função confere): escritório logado (gestão) ou o banco (segredo).
// Credenciais: segredos BSOFT_DOMINIO / BSOFT_USUARIO / BSOFT_SENHA.
// =====================================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const admin = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const PAPEIS_GESTAO = ['admin_transportadora', 'gestor', 'admin_mover_ia'];
const TEMPO_MAX_MS = 100000;

const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), {
  status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' },
});
const digitos = (s: unknown) => String(s ?? '').replace(/\D/g, '');
const placaNorm = (s: unknown) => String(s ?? '').toUpperCase().replace(/\/[A-Z]{2}\s*$/, '').replace(/[^A-Z0-9]/g, '');
const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
const nomeArquivo = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'arquivo';
const b64utf8 = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s)));
const dataOk = (s: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(String(s ?? '').slice(0, 10)) && !String(s).startsWith('0000') ? String(s).slice(0, 10) : null;
function iguais(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

// tipo do arquivo pelos primeiros bytes
function formato(bytes: Uint8Array) {
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return { ext: 'pdf', tipo: 'application/pdf' };
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return { ext: 'jpg', tipo: 'image/jpeg' };
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return { ext: 'png', tipo: 'image/png' };
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[8] === 0x57) return { ext: 'webp', tipo: 'image/webp' };
  return { ext: 'pdf', tipo: 'application/pdf' };
}
function base64ParaBytes(b64: string) {
  const limpo = b64.replace(/^data:[^,]*,/, '').replace(/\s/g, '');
  const bin = atob(limpo);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// descrição do Bsoft → tipo no MOVER.IA
function classificar(descricao: string, tipoBsoft: string): { tipo: string | null; motivo?: string; placa?: string } {
  const d = semAcento(descricao).trim();
  if (/^FOTO|FOTO PERFIL|^PERFIL/.test(d) || (/IMAGEM/i.test(tipoBsoft) && /FOTO|PERFIL/.test(d))) return { tipo: null, motivo: 'foto de perfil (não é documento)' };
  const crlv = d.match(/\bCRLV\b[\s:-]*([A-Z]{3}[\s-]?\d[A-Z0-9]\d{2})/);
  if (crlv) return { tipo: 'CRLV', placa: placaNorm(crlv[1]) };
  if (/\bCNH\b|HABILITACAO/.test(d)) return { tipo: 'CNH' };
  if (/\bASO\b|SAUDE OCUPACIONAL/.test(d)) return { tipo: 'ASO' };
  if (/TOXICOL/.test(d)) return { tipo: 'Exame toxicológico' };
  if (/COMPROVANTE.*(ENDERECO|RESIDENCIA)|COMP\.? ?(DE )?END/.test(d)) return { tipo: 'Comprovante de endereço' };
  if (/FICHA/.test(d)) return { tipo: 'FICHA CADASTRAL' };
  if (/\bMOPP\b/.test(d)) return { tipo: 'MOPP' };
  if (/\bRG\b|IDENTIDADE/.test(d)) return { tipo: 'RG' };
  if (/CARTAO.*CNPJ|\bCNPJ\b/.test(d)) return { tipo: 'Cartão CNPJ' };
  if (/RNTRC|\bANTT\b/.test(d)) return { tipo: 'ANTT / RNTRC' };
  // o resto: a própria descrição, sem números de controle e datas no fim
  const limpo = descricao.replace(/[\s-]*\d{2}\/\d{2}\/\d{4}.*$/, '').replace(/[\s-]+\d{4,}\s*$/, '').trim();
  return { tipo: (limpo || descricao).slice(0, 60) };
}
const TIPOS_UNICOS = new Set(['CNH', 'CRLV', 'FICHA CADASTRAL']);   // o do MOVER.IA (com arquivo) vale

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return json({ ok: true });
  const inicio = Date.now();
  try {
    const body = await req.json().catch(() => ({}));
    let tid: string | null = null;
    if (typeof body?.segredo === 'string') {
      const { data: s } = await admin.from('integracao_segredo').select('segredo').eq('id', 1).single();
      if (!s || !iguais(body.segredo, s.segredo)) return json({ error: 'Não autorizado.' }, 401);
      tid = String(body.transportadora_id ?? '');
    } else {
      const authHeader = req.headers.get('Authorization');
      if (!authHeader) return json({ error: 'Não autenticado.' }, 401);
      const sbAuth = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
      const { data: quem } = await sbAuth.auth.getUser();
      if (!quem?.user) return json({ error: 'Sessão inválida.' }, 401);
      const { data: chamador } = await admin.from('usuario').select('papel, transportadora_id, ativo').eq('id', quem.user.id).single();
      if (!chamador || !chamador.ativo || !PAPEIS_GESTAO.includes(chamador.papel)) return json({ error: 'Sem permissão.' }, 403);
      tid = chamador.transportadora_id;
    }
    const { data: cfg } = await admin.from('integracao_bsoft').select('transportadora_id').eq('transportadora_id', tid).maybeSingle();
    if (!cfg) return json({ error: 'Integração com o Bsoft não habilitada para esta transportadora.' }, 403);
    const acao = String(body?.acao ?? 'previa');
    if (acao !== 'previa' && acao !== 'importar') return json({ error: 'Ação inválida.' }, 400);
    const gravar = acao === 'importar';

    const dominio = String(Deno.env.get('BSOFT_DOMINIO') ?? '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\.bsoft\.app.*$/, '').replace(/\/.*$/, '');
    const usuario = String(Deno.env.get('BSOFT_USUARIO') ?? '').trim(), senha = String(Deno.env.get('BSOFT_SENHA') ?? '');
    if (!/^[a-z0-9-]+$/.test(dominio) || !usuario || !senha) return json({ ok: false, error: 'Faltam os dados de acesso do Bsoft.' });
    const base = `https://${dominio}.bsoft.app/services/index.php`, auth = 'Basic ' + b64utf8(`${usuario}:${senha}`);
    // SÓ GET: nada é gravado no Bsoft
    const get = async (caminho: string, params: Record<string, string> = {}): Promise<unknown> => {
      const qs = Object.entries(params).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v).replace(/%2C/g, ',')}`).join('&');
      const resp = await fetch(base + caminho + (qs ? '?' + qs : ''), { method: 'GET', headers: { Authorization: auth, Accept: 'application/json' }, signal: AbortSignal.timeout(45000) });
      if (resp.status === 404 || resp.status === 204) return [];
      if (resp.status === 401 || resp.status === 403) throw new Error('O Bsoft recusou o acesso (usuário/senha da integração).');
      const texto = await resp.text();
      if (!resp.ok) throw new Error(`Bsoft respondeu ${resp.status}`);
      try { return texto ? JSON.parse(texto) : []; } catch (_e) { return []; }
    };
    const lista = async (caminho: string, params: Record<string, string> = {}) => { const d = await get(caminho, params); return (Array.isArray(d) ? d : []) as Record<string, unknown>[]; };

    // ---------- quem buscar ----------
    const [{ data: motoristas }, { data: perfis }, { data: transp }, { data: veiculos }, { data: docs }] = await Promise.all([
      admin.from('usuario').select('id, nome').eq('transportadora_id', tid).eq('papel', 'motorista').eq('ativo', true).order('nome'),
      admin.from('motorista_perfil').select('usuario_id, cpf, aso_validade, toxicologico_validade'),
      admin.from('transportadora').select('cnpj, nome').eq('id', tid).single(),
      admin.from('veiculo').select('id, placa').eq('transportadora_id', tid),
      admin.from('documento').select('id, referente_a, referente_id, tipo, arquivo_url, bsoft_ref').eq('transportadora_id', tid).in('referente_a', ['motorista', 'empresa', 'veiculo']),
    ]);
    type Perfil = { usuario_id: string; cpf: string | null; aso_validade: string | null; toxicologico_validade: string | null };
    const perfilDe = new Map(((perfis ?? []) as Perfil[]).map(p => [p.usuario_id, p]));
    const veiculoPorPlaca = new Map(((veiculos ?? []) as { id: string; placa: string }[]).map(v => [placaNorm(v.placa), v]));
    type Doc = { id: string; referente_a: string; referente_id: string; tipo: string; arquivo_url: string | null; bsoft_ref: string | null };
    const documentos = (docs ?? []) as Doc[];
    const importados = new Set(documentos.map(d => d.bsoft_ref).filter(r => r && r.startsWith('pessoa-arq:')));
    const docDoTipo = (ra: string, rid: string, tipo: string) => documentos.filter(d => d.referente_a === ra && d.referente_id === rid && semAcento(d.tipo) === semAcento(tipo));

    type Alvo = { tipo: 'motorista' | 'empresa'; refId: string; nome: string; doc: string };
    const alvos: Alvo[] = [];
    const cnpj = digitos((transp as { cnpj?: string } | null)?.cnpj);
    if (cnpj.length === 14) alvos.push({ tipo: 'empresa', refId: tid!, nome: String((transp as { nome?: string } | null)?.nome ?? 'Transportadora'), doc: cnpj });
    for (const m of (motoristas ?? []) as { id: string; nome: string }[]) {
      const cpf = digitos(perfilDe.get(m.id)?.cpf);
      if (cpf.length === 11) alvos.push({ tipo: 'motorista', refId: m.id, nome: m.nome, doc: cpf });
    }
    const semCpf = ((motoristas ?? []) as { id: string; nome: string }[]).filter(m => digitos(perfilDe.get(m.id)?.cpf).length !== 11).map(m => m.nome);

    const itens: Record<string, unknown>[] = [];
    const resumo = { pessoas: alvos.length, nao_achadas_no_bsoft: [] as string[], sem_cpf: semCpf, arquivos: 0, importados: 0, anexados: 0, ja_no_mover: 0, pulados: 0, pendentes: 0, erros: [] as string[] };
    let acabouTempo = false;
    const vistos = new Set<string>();

    for (const alvo of alvos) {
      if (Date.now() - inicio > TEMPO_MAX_MS) { acabouTempo = true; resumo.pendentes++; continue; }
      let pessoa: Record<string, unknown> | undefined;
      try {
        pessoa = alvo.tipo === 'motorista'
          ? (await lista('/pessoas/v1/pessoas/fisicas', { cpf: alvo.doc, limit: '0,1' })).find(p => digitos(p.cpf) === alvo.doc)
          : (await lista('/pessoas/v1/pessoas/juridicas', { cnpj: alvo.doc, limit: '0,1' })).find(p => digitos(p.cnpj) === alvo.doc);
      } catch (e) { resumo.erros.push(`${alvo.nome}: ${(e as Error).message}`); continue; }
      if (!pessoa?.id) { resumo.nao_achadas_no_bsoft.push(alvo.nome); continue; }
      const pid = encodeURIComponent(String(pessoa.id));
      let arquivos: Record<string, unknown>[] = [], docsBsoft: Record<string, unknown>[] = [];
      try { [arquivos, docsBsoft] = await Promise.all([lista(`/pessoas/v1/pessoas/${pid}/arquivos`), lista(`/pessoas/v1/pessoas/${pid}/documentos`).catch(() => [])]); }
      catch (e) { resumo.erros.push(`${alvo.nome}: ${(e as Error).message}`); continue; }
      arquivos.sort((x, y) => Number(y.id) - Number(x.id));   // mais novo primeiro
      // validade e número da aba "Documentos" do Bsoft, pelo tipo
      const daAbaDocumentos = (tipoMover: string) => {
        const alvoT = semAcento(tipoMover);
        const achados = docsBsoft.filter(d => { const t = semAcento(String((d.tipo as Record<string, unknown> | undefined)?.descricao ?? d.tipo ?? '')); return t && (t.includes(alvoT) || alvoT.includes(t)); })
          .sort((a, b) => String(b.dtValidade ?? b.dtDocumento ?? '').localeCompare(String(a.dtValidade ?? a.dtDocumento ?? '')));
        return achados[0] ? { validade: dataOk(achados[0].dtValidade), numero: String(achados[0].nroDocumento ?? '').trim() || null } : { validade: null, numero: null };
      };

      for (const a of arquivos) {
        resumo.arquivos++;
        const aid = String(a.id ?? ''), descricao = String(a.descricao ?? '').trim(), b64 = String(a.arquivo ?? '');
        const ref = `pessoa-arq:${aid}`;
        const c = classificar(descricao, String(a.tipo ?? ''));
        let referenteA: string = alvo.tipo, referenteId = alvo.refId, destino = alvo.nome;
        const item: Record<string, unknown> = { pessoa: alvo.nome, de: alvo.tipo, descricao, tipo: c.tipo, tamanho_kb: Math.round(b64.length * 0.75 / 1024) };
        if (c.placa) {
          const v = veiculoPorPlaca.get(c.placa);
          if (!v) { item.acao = 'pular'; item.motivo = `placa ${c.placa} não está na frota do MOVER.IA`; resumo.pulados++; itens.push(item); continue; }
          referenteA = 'veiculo'; referenteId = v.id; destino = v.placa;
        }
        item.destino = destino; item.referente_a = referenteA;
        if (importados.has(ref)) { item.acao = 'ja'; item.motivo = 'já importado'; resumo.ja_no_mover++; vistos.add(`${referenteA}|${referenteId}|${semAcento(c.tipo ?? '')}`); itens.push(item); continue; }
        if (!c.tipo) { item.acao = 'pular'; item.motivo = c.motivo; resumo.pulados++; itens.push(item); continue; }
        // o Bsoft lista do mais novo para o mais antigo: do mesmo tipo, só o mais novo
        const chaveTipo = `${referenteA}|${referenteId}|${semAcento(c.tipo)}`;
        if (vistos.has(chaveTipo)) { item.acao = 'pular'; item.motivo = `versão mais antiga de ${c.tipo}`; resumo.pulados++; itens.push(item); continue; }
        vistos.add(chaveTipo);
        if (!aid || b64.length < 100) { item.acao = 'pular'; item.motivo = 'arquivo vazio no Bsoft'; resumo.pulados++; itens.push(item); continue; }
        const existentes = docDoTipo(referenteA, referenteId, c.tipo);
        const comArquivo = existentes.find(d => d.arquivo_url);
        const doBsoftAntigo = existentes.find(d => d.bsoft_ref?.startsWith('pessoa-arq:'));
        let alvoDoc: Doc | undefined;
        if (doBsoftAntigo) { alvoDoc = doBsoftAntigo; item.acao = 'atualizar'; item.motivo = 'versão nova do Bsoft substitui a anterior'; }
        else if (comArquivo && (TIPOS_UNICOS.has(c.tipo) || existentes.length)) { item.acao = 'ja'; item.motivo = `já tem ${c.tipo} no MOVER.IA (fica o do MOVER.IA)`; resumo.ja_no_mover++; itens.push(item); continue; }
        else if (existentes[0]) { alvoDoc = existentes[0]; item.acao = 'anexar'; item.motivo = `${c.tipo} já cadastrado sem arquivo: anexa o do Bsoft`; }
        else item.acao = 'importar';
        // validade / número
        let validade: string | null = null, numero: string | null = null;
        if (referenteA === 'motorista' && c.tipo === 'CNH') validade = dataOk(pessoa!.cnhDtValidade);
        else if (referenteA === 'motorista' && c.tipo === 'Exame toxicológico') validade = dataOk(pessoa!.cnhDtValidadeExameToxicologico);
        else if (referenteA !== 'veiculo') ({ validade, numero } = daAbaDocumentos(c.tipo));
        item.validade = validade;
        itens.push(item);
        if (!gravar) continue;
        if (Date.now() - inicio > TEMPO_MAX_MS) { acabouTempo = true; resumo.pendentes++; item.acao = 'pendente'; continue; }

        // grava: arquivo no Storage + registro em documento
        try {
          const bytes = base64ParaBytes(b64);
          const f = formato(bytes);
          let docId = alvoDoc?.id;
          if (!docId) {
            const { data: novo, error } = await admin.from('documento').insert({ transportadora_id: tid, referente_a: referenteA, referente_id: referenteId, tipo: c.tipo, numero, validade, status: 'ok', bsoft_ref: ref }).select('id').single();
            if (error) throw new Error(error.message);
            docId = novo.id;
          }
          const caminho = `${tid}/${docId}_${Date.now()}_${nomeArquivo(descricao)}.${f.ext}`;
          const { error: eUp } = await admin.storage.from('documentos').upload(caminho, bytes, { contentType: f.tipo, upsert: true });
          if (eUp) throw new Error('Storage: ' + eUp.message);
          const atualiza: Record<string, unknown> = { arquivo_url: caminho, bsoft_ref: ref };
          if (alvoDoc) { if (validade) atualiza.validade = validade; if (numero) atualiza.numero = numero; }
          const { error: eUpd } = await admin.from('documento').update(atualiza).eq('id', docId);
          if (eUpd) throw new Error(eUpd.message);
          if (alvoDoc && alvoDoc.arquivo_url && alvoDoc.arquivo_url !== caminho) await admin.storage.from('documentos').remove([alvoDoc.arquivo_url]);
          importados.add(ref);
          if (alvoDoc) resumo.anexados++; else resumo.importados++;
          // validades do perfil do motorista (só se a do Bsoft for mais nova)
          if (referenteA === 'motorista' && validade && (c.tipo === 'ASO' || c.tipo === 'Exame toxicológico')) {
            const campo = c.tipo === 'ASO' ? 'aso_validade' : 'toxicologico_validade';
            const atual = perfilDe.get(referenteId)?.[campo as 'aso_validade'];
            if (!atual || atual < validade) await admin.from('motorista_perfil').update({ [campo]: validade }).eq('usuario_id', referenteId);
          }
          item.feito = true;
        } catch (e) {
          item.erro = (e as Error).message;
          resumo.erros.push(`${destino} — ${descricao}: ${(e as Error).message}`);
        }
      }
    }
    return json({ ok: true, acao, acabou_tempo: acabouTempo, ...resumo, itens });
  } catch (e) {
    return json({ ok: false, error: (e as Error).message });
  }
});
