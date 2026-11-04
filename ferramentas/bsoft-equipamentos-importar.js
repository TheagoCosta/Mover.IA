// =====================================================================
// MOVER.IA — importador dos "Documentos dos Equipamentos" do Bsoft (04/11/2026)
//
// Roda DENTRO da página do Bsoft (Manutenção → Relatórios → Documentos dos Equipamentos), com
// alguém já logado no Bsoft. Lê a lista inteira (tira o filtro da busca rápida), baixa os arquivos
// pelo link de download da própria tela e manda cada documento para a função
// bsoft-equipamentos do MOVER.IA. Só lê o Bsoft; não grava nada lá. Não usa senha nenhuma.
//
// Uso: definir window.MOVER_TICKET = { tid, exp, sig } (ticket de prazo curto gerado no banco) e
// window.MOVER_URL = 'https://<projeto>.supabase.co/functions/v1/bsoft-equipamentos', colar este
// arquivo no console da página e chamar: await moverImportarEquipamentos({ previa: true }) para ver
// o que viria, e await moverImportarEquipamentos() para importar.
// =====================================================================
async function moverImportarEquipamentos(opcoes = {}) {
  const URL_MOVER = window.MOVER_URL, ticket = window.MOVER_TICKET;
  if (!URL_MOVER || !ticket) throw new Error('Falta MOVER_URL ou MOVER_TICKET.');
  const rotina = 'man_documentosEquipamentos';

  // 1) lista completa: limpa o filtro da busca rápida e pede "mostrar tudo"
  const fd = new FormData();
  for (const k of ['chave', 'detail', 'pop', 'pesquisa_busca_equipamentos_id', 'busca_equipamentos_id',
    'pesquisa_busca_tiposDocumentos_id', 'busca_tiposDocumentos_id', 'busca_nroDoc', 'busca_vencimento']) fd.append(k, '');
  fd.append('rotina', rotina);
  await fetch('executarBuscaRapida.php', { method: 'POST', body: fd });
  const resp = await fetch(`index.php?p=1&mostrartudo=1&pop=&chave=&rotina=${rotina}&detail=`);
  const html = new TextDecoder('iso-8859-1').decode(await resp.arrayBuffer());
  const doc = new DOMParser().parseFromString(html, 'text/html');

  // 2) linhas: [marcar, Equipamento, Tipo, Número, Data, Renovação, ..., download]
  const linhas = [];
  for (const tr of doc.querySelectorAll('tr')) {
    if (!tr.querySelector('input[name=id]')) continue;
    const c = [...tr.children].map(td => td.textContent.replace(/\s+/g, ' ').trim());
    const link = tr.querySelector('a[href*="baixar.php"]');
    const arquivoId = link ? (link.getAttribute('href').match(/[?&]id=(\d+)/) || [])[1] || null : null;
    if (!c[1] || !c[2]) continue;
    linhas.push({ placa: c[1], tipo: c[2], numero: c[3], data: c[4], renovacao: c[5], arquivo_id: arquivoId });
  }
  // 3) de cada tipo por placa, só o de renovação mais nova (com arquivo, se empatar)
  const iso = d => (d || '').split('/').reverse().join('-');
  const melhor = new Map();
  for (const l of linhas) {
    const tipoChave = l.tipo.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/^CIVA?$/, 'CIV').replace(/^CIPPA?$/, 'CIPP');
    const k = l.placa.toUpperCase().replace(/[^A-Z0-9/]/g, '') + '|' + tipoChave;
    const atual = melhor.get(k);
    if (!atual || iso(l.renovacao) > iso(atual.renovacao) || (iso(l.renovacao) === iso(atual.renovacao) && l.arquivo_id && !atual.arquivo_id)) melhor.set(k, l);
  }
  const itens = [...melhor.values()];

  const chamar = async corpo => {
    const r = await fetch(URL_MOVER, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticket, ...corpo }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `MOVER respondeu ${r.status}`);
    return j;
  };
  // 4) prévia no MOVER.IA (o que entra, o que já tem, o que é de placa fora da frota)
  const previa = (await chamar({ acao: 'previa', itens })).itens;
  const resumo = { linhas_no_bsoft: linhas.length, depois_de_tirar_repetidos: itens.length, por_acao: {}, enviados: 0, erros: [] };
  for (const p of previa) resumo.por_acao[p.acao] = (resumo.por_acao[p.acao] || 0) + 1;
  resumo.fora_da_frota = [...new Set(previa.filter(p => p.motivo === 'placa fora da frota do MOVER.IA').map(p => p.placa))];
  if (opcoes.previa) return { ...resumo, itens: previa.map(p => ({ placa: p.placa, tipo: p.tipo, validade: p.validade, arquivo: p.tem_arquivo, acao: p.acao, motivo: p.motivo })) };

  // 5) envia o que precisa (3 de cada vez)
  const paraEnviar = itens.filter((_, i) => ['importar', 'anexar', 'atualizar'].includes(previa[i].acao));
  const paraBase64 = blob => new Promise((ok, erro) => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result)); fr.onerror = erro; fr.readAsDataURL(blob); });
  const fila = [...paraEnviar];
  const trabalhador = async () => {
    for (let it = fila.shift(); it; it = fila.shift()) {
      try {
        const item = { ...it };
        if (it.arquivo_id) {
          const r = await fetch(`/projetos/manutencao/versao1.4/rotinas/equipamentos/arquivos/baixar.php?id=${it.arquivo_id}`);
          if (!r.ok) throw new Error(`download ${r.status}`);
          const nome = ((r.headers.get('content-disposition') || '').match(/filename="?([^";]+)/) || [])[1] || '';
          item.arquivo_b64 = await paraBase64(await r.blob());
          item.nome_arquivo = nome;
        }
        const j = await chamar({ acao: 'enviar', item });
        if (j.feito) resumo.enviados++;
        else if (j.erro || j.error) resumo.erros.push(`${it.placa} ${it.tipo}: ${j.erro || j.error}`);
      } catch (e) { resumo.erros.push(`${it.placa} ${it.tipo}: ${e.message}`); }
    }
  };
  await Promise.all([trabalhador(), trabalhador(), trabalhador()]);
  return resumo;
}
