// MOVER.IA — Viagens do escritório: lista, documentos da viagem, nova viagem, encerrar MDF-e
// (arquivo carregado pelo index.html; todas as funções ficam globais,
// então um arquivo pode chamar funções dos outros normalmente)

// ---------------------------------------------------------------------
// VIAGENS — em andamento e concluídas (manuais e vindas do Bsoft)
// ---------------------------------------------------------------------
let filtroViagens = 'em_andamento';
const ROTULO_VIAGEM = { em_andamento: ['blue', 'Em andamento'], concluida: ['green', 'Concluída'] };

async function secaoViagens(el){
  const [viagens, docs, usuarios] = await Promise.all([
    consultar(sb.from('viagem').select('id, origem, destino, origem_endereco, destino_endereco, cte_numero, mdfe_numero, status, criado_em, bsoft_manifesto_id, bsoft_encerrado_em, bsoft_encerramento_erro, motorista_id, motorista:motorista_id(nome), veiculo:veiculo_id(placa)').order('criado_em', { ascending:false }).limit(500)),
    consultar(sb.from('documento').select('referente_id, tipo').eq('referente_a', 'viagem')),
    qUsuarios(),
  ]);
  const nDocs = {}, comTicket = new Set();
  docs.forEach(d => { nDocs[d.referente_id] = (nDocs[d.referente_id] || 0) + 1; if(d.tipo === 'Ticket de descarga') comTicket.add(d.referente_id); });
  // MDF-e no Bsoft: encerrado, com erro, ou botão para encerrar (viagem do Bsoft concluída com ticket)
  const situacaoMdfe = (v) => {
    if(!v.bsoft_manifesto_id || v.status !== 'concluida') return '';
    if(v.bsoft_encerrado_em) return `<div class="sub" style="margin-top:4px;">MDF-e encerrado ${fmtDataHora(v.bsoft_encerrado_em)}</div>`;
    if(!comTicket.has(v.id)) return `<div class="sub" style="margin-top:4px;">Sem ticket de descarga</div>`;
    return `${v.bsoft_encerramento_erro ? `<div class="sub" style="margin-top:4px; color:var(--signal-red-ink); max-width:220px;" title="${esc(v.bsoft_encerramento_erro)}">Erro ao encerrar: ${esc(v.bsoft_encerramento_erro.slice(0, 80))}</div>` : ''}
      <button class="btn btn-outline btn-sm" data-encerrar-mdfe="${v.id}" style="margin-top:4px;">Encerrar MDF-e</button>`;
  };
  const emAndamento = viagens.filter(v => v.status === 'em_andamento');
  const motoristasEmViagem = new Set(emAndamento.map(v => v.motorista_id).filter(Boolean)).size;
  const doFiltro = filtroViagens === 'todas' ? viagens : viagens.filter(v => v.status === filtroViagens);
  const nomeMot = (v) => v.motorista ? v.motorista.nome : '';
  const ordens = [
    ['recentes', 'Mais recentes primeiro', porData(v => v.criado_em, -1)],
    ['antigas', 'Mais antigas primeiro', porData(v => v.criado_em, 1)],
    ['motorista', 'Motorista de A a Z', (a, b) => porTexto(nomeMot)(a, b) || porData(v => v.criado_em, -1)(a, b)],
    ['placa', 'Placa de A a Z', (a, b) => porTexto(v => v.veiculo ? v.veiculo.placa : 'zzz')(a, b) || porData(v => v.criado_em, -1)(a, b)],
  ];
  const textoViagem = (v) => [nomeMot(v), v.veiculo ? v.veiculo.placa : '', v.origem, v.destino, v.origem_endereco, v.destino_endereco, v.mdfe_numero, v.cte_numero, fmtDataHora(v.criado_em)].join(' ');
  let visiveis = doFiltro;

  el.innerHTML = `
    <div class="kpi-row tres">
      ${kpi(emAndamento.length, 'Viagens em andamento', `${motoristasEmViagem} motorista${motoristasEmViagem === 1 ? '' : 's'} em viagem`)}
      ${kpi(viagens.filter(v => v.bsoft_manifesto_id).length, 'Vindas do Bsoft', 'MDF-e importados com os PDFs')}
      ${kpi(emAndamento.filter(v => !nDocs[v.id]).length, 'Em andamento sem arquivo', 'Anexe o MDF-e/CT-e em Documentos', emAndamento.some(v => !nDocs[v.id]) ? 'ambar' : 'verde')}
    </div>
    <div class="doc-tabs" style="max-width:460px;">
      ${[['em_andamento', 'Em andamento'], ['concluida', 'Concluídas'], ['todas', 'Todas']].map(([k, l]) => `<button class="${filtroViagens === k ? 'active' : ''}" data-filtro-viagem="${k}">${l} (${k === 'todas' ? viagens.length : viagens.filter(v => v.status === k).length})</button>`).join('')}
    </div>
    ${barraLista('viagens', ordens, 'Pesquisar por motorista, placa, MDF-e, CT-e, origem ou destino')}
    <div id="listaViagens"></div>`;

  function desenhar(){
    visiveis = aplicarLista('viagens', doFiltro, ordens, textoViagem);
    const caixa = document.getElementById('listaViagens');
    caixa.innerHTML = painel(`Viagens (${visiveis.length})`,
      visiveis.length ? tabela(['Aberta em', 'Motorista', 'Placa', 'Origem → destino', 'MDF-e', 'CT-e', 'Arquivos', 'Situação', ''],
        visiveis.map(v => { const [cor, txt] = ROTULO_VIAGEM[v.status] || ['grey', v.status]; const n = nDocs[v.id] || 0; return `<tr>
          <td class="sub">${fmtDataHora(v.criado_em)}${v.bsoft_manifesto_id ? '<div class="sub">Bsoft</div>' : ''}</td>
          <td>${esc(nomeMot(v) || '—')}</td>
          <td class="mono">${esc(v.veiculo ? v.veiculo.placa : '—')}</td>
          <td style="max-width:320px;">${esc(v.origem || '?')} → ${esc(v.destino || '?')}
            ${v.origem_endereco ? `<div class="sub">Coleta: ${esc(v.origem_endereco)}</div>` : ''}${v.destino_endereco ? `<div class="sub">Entrega: ${esc(v.destino_endereco)}</div>` : ''}</td>
          <td class="mono">${esc(v.mdfe_numero || '—')}</td>
          <td class="mono" style="max-width:140px;">${esc(v.cte_numero || '—')}</td>
          <td><button class="btn ${n ? 'btn-outline' : 'btn-primary'} btn-sm" data-docs-viagem="${v.id}">${ic('doc', 14)} ${n ? n : 'Anexar'}</button></td>
          <td>${badge(cor, txt)}${situacaoMdfe(v)}</td>
          <td><button class="btn btn-outline btn-sm" data-status-viagem="${v.id}">${v.status === 'em_andamento' ? 'Concluir' : 'Reabrir'}</button></td></tr>`; }))
        : vazio(estadoListas.viagens && estadoListas.viagens.busca ? 'Nenhuma viagem encontrada nesta pesquisa.' : filtroViagens === 'em_andamento' ? 'Nenhuma viagem em andamento.' : 'Nenhuma viagem por aqui.'),
      `<button class="btn btn-primary btn-sm" id="btnNovaViagemSecao">${ic('plus', 15)} Nova viagem</button>${visiveis.length ? botaoExportar('btnCsvViagens') : ''}`);
    caixa.querySelectorAll('[data-docs-viagem]').forEach(b => b.addEventListener('click', () => abrirDocumentosViagem(viagens.find(v => v.id === b.dataset.docsViagem))));
    caixa.querySelectorAll('[data-encerrar-mdfe]').forEach(b => b.addEventListener('click', async () => {
      const v = viagens.find(x => x.id === b.dataset.encerrarMdfe);
      if(!confirm(`Encerrar no Bsoft o MDF-e ${v.mdfe_numero || ''} (${nomeMot(v)})?\n\nO encerramento vai para a SEFAZ e não se desfaz.`)) return;
      b.disabled = true; b.textContent = 'Encerrando...';
      let r;
      try{ r = await chamarBsoft('encerrar_mdfe', { viagem_id: v.id }); } catch(e){ r = { ok: false, error: e.message }; }
      if(!r || !r.ok) alert((r && r.error) || 'Não consegui encerrar.');
      else mostrarToast('✅ MDF-e encerrado no Bsoft');
      secaoViagens(el);
    }));
    caixa.querySelectorAll('[data-status-viagem]').forEach(b => b.addEventListener('click', async () => {
      const v = viagens.find(x => x.id === b.dataset.statusViagem);
      const novo = v.status === 'em_andamento' ? 'concluida' : 'em_andamento';
      if(!confirm(novo === 'concluida' ? `Concluir a viagem de ${nomeMot(v)} (${v.origem || '?'} → ${v.destino || '?'})?` : 'Reabrir esta viagem? Ela volta a aparecer como viagem atual no app do motorista.')) return;
      const { error } = await sb.from('viagem').update({ status: novo }).eq('id', v.id);
      if(error){ alert('Não consegui alterar: ' + error.message); return; }
      if(window.limparCacheTelas) limparCacheTelas();
      mostrarToast(novo === 'concluida' ? '✅ Viagem concluída' : 'Viagem reaberta');
      secaoViagens(el);
    }));
    document.getElementById('btnNovaViagemSecao').addEventListener('click', () => abrirNovaViagem(usuarios.filter(u => u.papel === 'motorista' && u.ativo)));
    const csv = document.getElementById('btnCsvViagens');
    if(csv) csv.addEventListener('click', () => baixarCSV('viagens', ['Aberta em', 'Motorista', 'Placa', 'Origem', 'Destino', 'MDF-e', 'CT-e', 'Arquivos', 'Situação', 'Vinda do Bsoft'],
      visiveis.map(v => [fmtDataHora(v.criado_em), nomeMot(v), v.veiculo ? v.veiculo.placa : '', v.origem || '', v.destino || '', v.mdfe_numero || '', v.cte_numero || '', nDocs[v.id] || 0, (ROTULO_VIAGEM[v.status] || ['', v.status])[1], v.bsoft_manifesto_id ? 'Sim' : 'Não'])));
  }
  desenhar();
  ligarBarraLista(el, 'viagens', desenhar);
  el.querySelectorAll('[data-filtro-viagem]').forEach(b => b.addEventListener('click', () => { filtroViagens = b.dataset.filtroViagem; secaoViagens(el); }));
}

// ---------- documentos da viagem (CT-e, MDF-e, NF-e...) ----------
const TIPOS_DOC_VIAGEM = ['Agendamento', 'CT-e', 'MDF-e', 'NF-e', 'Ordem de coleta', 'Comprovante de entrega', 'Ticket de descarga', 'Outro'];
// palpite do tipo pelo nome do arquivo (ex.: "MDFe_123.pdf" → MDF-e); a pessoa pode trocar
function tipoDocViagemPeloNome(nome){
  const n = String(nome || '').toUpperCase();
  if(/AGEND/.test(n)) return 'Agendamento';
  if(/MDF/.test(n)) return 'MDF-e';
  if(/CT-?E\b|\bCTE|DACTE/.test(n)) return 'CT-e';
  if(/NF-?E|DANFE|NOTA/.test(n)) return 'NF-e';
  if(/COLETA/.test(n)) return 'Ordem de coleta';
  if(/CANHOTO|ENTREGA|COMPROVANTE/.test(n)) return 'Comprovante de entrega';
  return 'Agendamento';   // a maioria dos arquivos extras da viagem é o agendamento
}
async function enviarDocumentosViagem(viagemId, arquivos, tipos, aoProgresso){
  const erros = [];
  for(let i = 0; i < arquivos.length; i++){
    if(aoProgresso) aoProgresso(i + 1, arquivos.length);
    const { error } = await salvarDocumentoNoBanco({ referenteA: 'viagem', referenteId: viagemId, tipo: tipos[i] || tipoDocViagemPeloNome(arquivos[i].name), numero: null, validade: null, file: arquivos[i] });
    if(error) erros.push(`${arquivos[i].name}: ${error.message}`);
  }
  if(window.limparCacheTelas) limparCacheTelas();
  return erros;
}

async function abrirDocumentosViagem(v){
  if(!v) return;
  const { data } = await sb.from('documento').select('id, tipo, arquivo_url, criado_em').eq('referente_a', 'viagem').eq('referente_id', v.id).order('criado_em');
  const docs = data || [];
  const rota = `${v.origem || '?'} → ${v.destino || '?'}`;
  abrirModal(`Documentos da viagem ${rota}`, `
    <div class="l2" style="margin-bottom:10px;">${esc(v.motorista ? v.motorista.nome : '')} vê estes arquivos no app (aba Viagem e Documentos → Viagem) e pode baixar ou compartilhar por WhatsApp.</div>
    ${docs.length ? `<div class="o-table-wrap" style="margin-bottom:14px;"><table class="o-table"><tbody>${docs.map(d => `<tr>
      <td>${esc(d.tipo)}<div class="sub">${fmtDataHora(d.criado_em)}</div></td>
      <td style="text-align:right; white-space:nowrap;">${d.arquivo_url ? `<button class="o-dl-btn" data-ver="${d.id}" title="Ver">${ic('eye', 15)}</button>` : ''}
        <button class="o-dl-btn" data-excluir-doc-viagem="${d.id}" title="Excluir">${ic('x', 15)}</button></td></tr>`).join('')}</tbody></table></div>`
      : '<div class="l2" style="margin-bottom:12px;">Nenhum arquivo anexado ainda.</div>'}
    <div class="field-row" style="margin:0;"><label>Anexar arquivos (PDF ou foto — pode escolher vários)</label>
      <input type="file" id="dvArquivos" accept="application/pdf,image/*" multiple></div>
    <div id="dvTipos"></div>
    <div class="err" id="dvErro"></div>
    <button type="button" id="btnDvEnviar" style="margin-top:12px;" disabled>Anexar</button>`);
  const input = document.getElementById('dvArquivos'), caixaTipos = document.getElementById('dvTipos'), btn = document.getElementById('btnDvEnviar');
  input.addEventListener('change', () => {
    const lista = [...input.files];
    btn.disabled = !lista.length;
    caixaTipos.innerHTML = lista.map((f, i) => `<div class="field-row" style="margin:8px 0 0;"><label>${esc(f.name)}</label>
      <select data-tipo-dv="${i}">${TIPOS_DOC_VIAGEM.map(t => `<option ${t === tipoDocViagemPeloNome(f.name) ? 'selected' : ''}>${t}</option>`).join('')}</select></div>`).join('');
  });
  btn.addEventListener('click', async () => {
    const lista = [...input.files];
    const tipos = lista.map((f, i) => (caixaTipos.querySelector(`[data-tipo-dv="${i}"]`) || {}).value);
    btn.disabled = true;
    const erros = await enviarDocumentosViagem(v.id, lista, tipos, (i, n) => { btn.textContent = `Enviando ${i} de ${n}...`; });
    if(erros.length){ document.getElementById('dvErro').textContent = 'Alguns arquivos não subiram: ' + erros.join(' · '); btn.disabled = false; btn.textContent = 'Anexar'; return; }
    mostrarToast(`✅ ${lista.length} arquivo${lista.length > 1 ? 's anexados' : ' anexado'} à viagem`);
    abrirDocumentosViagem(v);
    if(screen === 'painel' || screen === 'viagens') loadEscritorio();
  });
  document.querySelectorAll('#modalGenerico [data-ver]').forEach(b => b.addEventListener('click', () => verArquivo(b.dataset.ver, docs, 'Viagem ' + rota)));
  document.querySelectorAll('#modalGenerico [data-excluir-doc-viagem]').forEach(b => b.addEventListener('click', async () => {
    const d = docs.find(x => x.id === b.dataset.excluirDocViagem);
    if(!d || !confirm(`Excluir o arquivo ${d.tipo} desta viagem?`)) return;
    if(d.arquivo_url) await sb.storage.from('documentos').remove([d.arquivo_url]);
    const { error } = await sb.from('documento').delete().eq('id', d.id);
    if(error){ alert('Não consegui excluir: ' + error.message); return; }
    if(window.limparCacheTelas) limparCacheTelas();
    abrirDocumentosViagem(v);
  }));
}

function abrirNovaViagem(motoristas){
  abrirModal('Nova viagem', `
    <form id="formNovaViagem">
      <div class="field-row" style="margin:0;"><label>Motorista</label>
        <select id="novaViagemMotorista" required><option value="">Selecione o motorista</option>
          ${motoristas.map(m => `<option value="${m.id}">${esc(m.nome)}</option>`).join('')}</select></div>
      <div class="o-form-grid">
        <div class="field-row" style="margin:0;"><label>Origem</label><input type="text" id="novaViagemOrigem" placeholder="ex: Paulínia/SP"></div>
        <div class="field-row" style="margin:0;"><label>Destino</label><input type="text" id="novaViagemDestino" placeholder="ex: Curitiba/PR"></div>
        <div class="field-row" style="margin:0;"><label>CT-e (opcional)</label><input type="text" id="novaViagemCte"></div>
        <div class="field-row" style="margin:0;"><label>MDF-e (opcional)</label><input type="text" id="novaViagemMdfe"></div>
      </div>
      <div class="field-row" style="margin:0;"><label>Arquivos da viagem — CT-e, MDF-e, NF-e (opcional, pode escolher vários)</label>
        <input type="file" id="novaViagemArquivos" accept="application/pdf,image/*" multiple></div>
      <div class="l2" style="margin-top:-4px;">O tipo de cada arquivo é reconhecido pelo nome (ex.: "MDFe_123.pdf"); dá para conferir depois no botão Documentos da viagem.</div>
      <button type="submit">Criar viagem</button>
    </form>`);
  document.getElementById('formNovaViagem').addEventListener('submit', criarViagem);
}

async function criarViagem(e){
  e.preventDefault();
  const btn = e.target.querySelector('button[type="submit"]');
  const motoristaId = document.getElementById('novaViagemMotorista').value;
  const origem = document.getElementById('novaViagemOrigem').value.trim();
  const destino = document.getElementById('novaViagemDestino').value.trim();
  const cte = document.getElementById('novaViagemCte').value.trim();
  const mdfe = document.getElementById('novaViagemMdfe').value.trim();

  if(!motoristaId){ alert('Selecione o motorista.'); return; }
  btn.disabled = true; btn.textContent = 'Criando...';

  const { data: conjunto } = await sb.from('conjunto')
    .select('conjunto_item(ordem, veiculo_id)')
    .eq('motorista_id', motoristaId)
    .limit(1)
    .maybeSingle();
  const cavaloItem = conjunto && conjunto.conjunto_item ? conjunto.conjunto_item.find(ci => ci.ordem === 1) : null;

  const { data: viagem, error } = await sb.from('viagem').insert({
    transportadora_id: usuarioAtual.transportadora_id,
    motorista_id: motoristaId,
    veiculo_id: cavaloItem ? cavaloItem.veiculo_id : null,
    origem: origem || null,
    destino: destino || null,
    cte_numero: cte || null,
    mdfe_numero: mdfe || null,
    status: 'em_andamento'
  }).select('id').single();

  if(error){ alert('Erro ao criar viagem: ' + error.message); btn.disabled = false; btn.textContent = 'Criar viagem'; return; }
  const arquivos = [...document.getElementById('novaViagemArquivos').files];
  if(arquivos.length && viagem){
    const erros = await enviarDocumentosViagem(viagem.id, arquivos, [], (i, n) => { btn.textContent = `Enviando arquivo ${i} de ${n}...`; });
    if(erros.length) alert('A viagem foi criada, mas alguns arquivos não subiram:\n' + erros.join('\n'));
  }
  fecharModal();
  mostrarToast(arquivos.length ? `✅ Viagem criada com ${arquivos.length} arquivo${arquivos.length > 1 ? 's' : ''}` : '✅ Viagem criada');
  loadEscritorio();
}
