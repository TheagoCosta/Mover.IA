// MOVER.IA — Capacitações e certificações (MOPP, direção defensiva etc.).
//   • Escritório: cadastra, edita, anexa o certificado e exclui.
//   • Motorista: vê as dele, com a validade e o certificado.
// O status (em dia / a vencer / vencida) é calculado pela validade, igual
// aos documentos. Certificados ficam no bucket "documentos"
// (<transportadora>/capacitacao/<id>_...), e o motorista abre só os dele.
// (arquivo carregado pelo index.html; todas as funções ficam globais,
// então um arquivo pode chamar funções dos outros normalmente)

const TIPOS_CAPACITACAO = ['MOPP — Movimentação de Produtos Perigosos', 'Direção defensiva', 'Transporte de cargas indivisíveis',
  'Primeiros socorros', 'Combate a incêndio', 'NR-35 (trabalho em altura)', 'NR-20 (inflamáveis e combustíveis)', 'Integração da empresa', 'Outro'];
let filtroCapacitacoes = 'todas';
const CAMPOS_CAPACITACAO = 'id, tipo, instituicao, carga_horaria, data_realizacao, validade, certificado_url, observacao, motorista_id, motorista:motorista_id(nome)';

async function verCertificado(caminho){
  const { data, error } = await sb.storage.from('documentos').createSignedUrl(caminho, 300);
  if(error){ alert('Não consegui abrir o certificado: ' + error.message); return; }
  window.open(data.signedUrl, '_blank');
}

async function enviarCertificado(capacitacaoId, arquivo){
  const caminho = `${usuarioAtual.transportadora_id}/capacitacao/${capacitacaoId}_${Date.now()}_${sanitizarNomeArquivo(arquivo.name)}`;
  const { error: e1 } = await sb.storage.from('documentos').upload(caminho, arquivo, { upsert: true });
  if(e1) return e1.message;
  const { error: e2 } = await sb.from('capacitacao').update({ certificado_url: caminho }).eq('id', capacitacaoId);
  return e2 ? e2.message : null;
}

// ---------------------------------------------------------------------
// ESCRITÓRIO
// ---------------------------------------------------------------------
async function secaoCapacitacoes(el){
  const [lista, usuarios] = await Promise.all([
    consultar(sb.from('capacitacao').select(CAMPOS_CAPACITACAO).order('validade', { nullsFirst:false })),
    qUsuarios(),
  ]);
  const motoristas = usuarios.filter(u => u.papel === 'motorista' && u.ativo);
  const st = (c) => statusDocumento({ validade: c.validade, status: 'ok' });
  const vencidas = lista.filter(c => st(c) === 'vencido').length;
  const aVencer = lista.filter(c => st(c) === 'vence_em_breve').length;
  const FILTROS = { todas: ['Todas', () => true], alerta: ['Vencidas / a vencer', c => st(c) !== 'ok'], semCertificado: ['Sem certificado', c => !c.certificado_url] };
  const visiveis = lista.filter(FILTROS[filtroCapacitacoes][1])
    .sort((a, b) => PESO_STATUS_DOC[st(b)] - PESO_STATUS_DOC[st(a)] || (a.motorista ? a.motorista.nome : '').localeCompare(b.motorista ? b.motorista.nome : ''));

  el.innerHTML = `
    <div class="kpi-row">
      ${kpi(lista.length, 'Capacitações registradas')}
      ${kpi(vencidas, 'Vencidas', vencidas ? 'Renovar' : 'Nenhuma', vencidas ? 'vermelho' : 'verde')}
      ${kpi(aVencer, `Vencem em até ${DIAS_ALERTA_DOCUMENTO} dias`, '', aVencer ? 'ambar' : '')}
      ${kpi(lista.filter(c => !c.certificado_url).length, 'Sem certificado anexado')}
    </div>
    <div class="doc-tabs" style="max-width:520px;">
      ${Object.entries(FILTROS).map(([k, [l, f]]) => `<button class="${filtroCapacitacoes === k ? 'active' : ''}" data-filtro-cap="${k}">${l} (${lista.filter(f).length})</button>`).join('')}
    </div>
    ${painel(`Capacitações (${visiveis.length})`,
      visiveis.length ? tabela(['Motorista', 'Treinamento', 'Realizado em', 'Validade', 'Status', 'Certificado'],
        visiveis.map(c => `<tr class="clickable" data-capacitacao="${c.id}">
          <td>${nomeCelula(c.motorista ? c.motorista.nome : '—')}</td>
          <td>${esc(c.tipo)}${c.instituicao ? `<div class="sub">${esc(c.instituicao)}${c.carga_horaria ? ' · ' + esc(c.carga_horaria) + 'h' : ''}</div>` : ''}</td>
          <td>${fmtData(c.data_realizacao)}</td>
          <td class="sub">${c.validade ? esc(textoVencimento({ validade: c.validade })) : 'Sem validade'}</td>
          <td>${c.validade ? badgeDoc({ validade: c.validade }) : badge('grey', 'Sem validade')}</td>
          <td>${c.certificado_url ? `<button class="o-dl-btn" data-cert="${esc(c.certificado_url)}" title="Ver certificado">${ic('eye', 15)}</button>` : '<span class="sub">—</span>'}</td></tr>`))
        : vazio(lista.length ? 'Nada neste filtro.' : 'Nenhuma capacitação cadastrada. Use "Nova capacitação" para registrar MOPP, direção defensiva e outros treinamentos.'),
      `<button class="btn btn-primary btn-sm" id="btnNovaCapacitacao">${ic('plus', 15)} Nova capacitação</button>${lista.length ? botaoExportar('btnCsvCapacitacoes') : ''}`)}`;

  el.querySelectorAll('[data-filtro-cap]').forEach(b => b.addEventListener('click', () => { filtroCapacitacoes = b.dataset.filtroCap; secaoCapacitacoes(el); }));
  el.querySelectorAll('[data-cert]').forEach(b => b.addEventListener('click', (e) => { e.stopPropagation(); verCertificado(b.dataset.cert); }));
  document.getElementById('btnNovaCapacitacao').addEventListener('click', () => abrirEditarCapacitacao(null, motoristas, el));
  el.querySelectorAll('[data-capacitacao]').forEach(tr => tr.addEventListener('click', () => abrirEditarCapacitacao(lista.find(c => c.id === tr.dataset.capacitacao), motoristas, el)));
  const csv = document.getElementById('btnCsvCapacitacoes');
  if(csv) csv.addEventListener('click', () => baixarCSV('capacitacoes', ['Motorista', 'Treinamento', 'Instituição', 'Carga horária', 'Realizado em', 'Validade', 'Status', 'Certificado'],
    lista.map(c => [c.motorista ? c.motorista.nome : '', c.tipo, c.instituicao || '', c.carga_horaria || '', c.data_realizacao ? fmtData(c.data_realizacao) : '', c.validade ? fmtData(c.validade) : '', c.validade ? ROTULO_STATUS_DOC[st(c)] : 'Sem validade', c.certificado_url ? 'Sim' : 'Não'])));
}

function abrirEditarCapacitacao(c, motoristas, el){
  const novo = !c;
  abrirModal(novo ? 'Nova capacitação' : `${c.tipo} — ${c.motorista ? c.motorista.nome : ''}`, `
    <form id="formCapacitacao">
      <div class="field-row" style="margin:0;"><label for="cpMotorista">Motorista</label>
        <select id="cpMotorista" required ${novo ? '' : 'disabled'}><option value="">Selecione</option>${motoristas.map(m => `<option value="${m.id}" ${c && c.motorista_id === m.id ? 'selected' : ''}>${esc(m.nome)}</option>`).join('')}</select></div>
      <div class="field-row" style="margin:0;"><label for="cpTipo">Treinamento</label>
        <input type="text" id="cpTipo" list="cpTipos" value="${esc(c ? c.tipo : '')}" required placeholder="ex: MOPP">
        <datalist id="cpTipos">${TIPOS_CAPACITACAO.map(t => `<option value="${t}">`).join('')}</datalist></div>
      <div class="o-form-grid">
        ${campoTexto('cpInstituicao', 'Instituição (opcional)', c && c.instituicao, 'placeholder="ex: SEST SENAT"')}
        ${campoTexto('cpCarga', 'Carga horária (h)', c && c.carga_horaria, 'inputmode="numeric" placeholder="ex: 50"')}
        <div class="field-row" style="margin:0;"><label for="cpRealizacao">Realizado em</label><input type="date" id="cpRealizacao" value="${esc(c && c.data_realizacao || '')}"></div>
        <div class="field-row" style="margin:0;"><label for="cpValidade">Validade</label><input type="date" id="cpValidade" value="${esc(c && c.validade || '')}"></div>
      </div>
      <div class="field-row" style="margin:0;"><label for="cpCertificado">${c && c.certificado_url ? 'Trocar certificado (PDF ou foto)' : 'Certificado (PDF ou foto, opcional)'}</label><input type="file" id="cpCertificado" accept="application/pdf,image/*"></div>
      <div class="err" id="cpErro"></div>
      <button type="submit">${novo ? 'Registrar capacitação' : 'Salvar alterações'}</button>
      ${!novo ? `<div class="o-acoes">
        ${c.certificado_url ? `<button type="button" class="btn btn-outline btn-sm" id="btnCpVer">${ic('eye', 14)} Ver certificado</button>` : ''}
        <button type="button" class="btn btn-outline btn-sm" id="btnCpExcluir" style="color:var(--signal-red-ink);">Excluir</button></div>` : ''}
    </form>`);

  document.getElementById('formCapacitacao').addEventListener('submit', async (e) => {
    e.preventDefault();
    const erro = document.getElementById('cpErro');
    const cargaTxt = document.getElementById('cpCarga').value.trim().replace(',', '.');
    const dados = {
      tipo: document.getElementById('cpTipo').value.trim(),
      instituicao: document.getElementById('cpInstituicao').value.trim() || null,
      carga_horaria: cargaTxt ? Number(cargaTxt) : null,
      data_realizacao: document.getElementById('cpRealizacao').value || null,
      validade: document.getElementById('cpValidade').value || null,
    };
    if(!dados.tipo){ erro.textContent = 'Informe o treinamento.'; return; }
    if(cargaTxt && !(dados.carga_horaria > 0)){ erro.textContent = 'Carga horária inválida.'; return; }
    if(dados.data_realizacao && dados.validade && dados.validade < dados.data_realizacao){ erro.textContent = 'A validade não pode ser antes da data de realização.'; return; }
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = 'Salvando...';
    let id = c && c.id;
    if(novo){
      const motoristaId = document.getElementById('cpMotorista').value;
      if(!motoristaId){ erro.textContent = 'Escolha o motorista.'; btn.disabled = false; btn.textContent = 'Registrar capacitação'; return; }
      const { data, error } = await sb.from('capacitacao').insert({ ...dados, motorista_id: motoristaId, transportadora_id: usuarioAtual.transportadora_id }).select('id').single();
      if(error){ erro.textContent = 'Não consegui salvar: ' + error.message; btn.disabled = false; btn.textContent = 'Registrar capacitação'; return; }
      id = data.id;
    } else {
      const { error } = await sb.from('capacitacao').update(dados).eq('id', id);
      if(error){ erro.textContent = 'Não consegui salvar: ' + error.message; btn.disabled = false; btn.textContent = 'Salvar alterações'; return; }
    }
    const arquivo = document.getElementById('cpCertificado').files[0];
    if(arquivo){ const falha = await enviarCertificado(id, arquivo); if(falha) alert('Capacitação salva, mas o certificado não subiu: ' + falha); }
    fecharModal();
    mostrarToast(novo ? '✅ Capacitação registrada' : '✅ Capacitação atualizada');
    secaoCapacitacoes(el);
  });
  const ver = document.getElementById('btnCpVer');
  if(ver) ver.addEventListener('click', () => verCertificado(c.certificado_url));
  const excluir = document.getElementById('btnCpExcluir');
  if(excluir) excluir.addEventListener('click', async () => {
    if(!confirm(`Excluir "${c.tipo}" de ${c.motorista ? c.motorista.nome : ''}${c.certificado_url ? ' e o certificado anexado' : ''}? Não dá para desfazer.`)) return;
    const { error } = await sb.from('capacitacao').delete().eq('id', c.id);
    if(error){ alert('Não consegui excluir: ' + error.message); return; }
    if(c.certificado_url) await sb.storage.from('documentos').remove([c.certificado_url]);
    fecharModal(); mostrarToast('Capacitação excluída'); secaoCapacitacoes(el);
  });
}

// ---------------------------------------------------------------------
// MOTORISTA
// ---------------------------------------------------------------------
async function loadCapacitacoesMotorista(){
  const { data } = await sb.from('capacitacao').select(CAMPOS_CAPACITACAO).eq('motorista_id', session.user.id).order('validade', { nullsFirst:false });
  const lista = data || [];
  montarTelaMotorista({
    header: headerVoltar('Capacitações'),
    conteudo: lista.length ? `<div class="card lista">${lista.map(c => `
      <div class="list-item" style="align-items:flex-start;">
        <div class="li-ic">${ic('award', 16)}</div>
        <div class="li-body">
          <div class="li-title">${esc(c.tipo)}</div>
          <div class="li-sub">${c.validade ? esc(textoVencimento({ validade: c.validade })) : 'Sem validade'}${c.data_realizacao ? ' · feito em ' + fmtData(c.data_realizacao) : ''}</div>
          ${c.instituicao ? `<div class="li-sub">${esc(c.instituicao)}${c.carga_horaria ? ' · ' + esc(c.carga_horaria) + 'h' : ''}</div>` : ''}
          ${c.certificado_url ? `<div class="li-acoes"><button class="btn-small" data-cert="${esc(c.certificado_url)}">${ic('eye', 14)} Ver certificado</button></div>` : ''}
        </div>
        <div class="li-row-end">${c.validade ? pillDoc({ validade: c.validade }) : pillStatus('grey', 'Sem validade')}</div>
      </div>`).join('')}</div>`
      : `<div class="card em-breve-box"><div class="ic-grande">${ic('award', 34)}</div><div class="card-dark-title">Nenhuma capacitação registrada</div><div class="card-dark-sub">Seus treinamentos e certificados (MOPP, direção defensiva etc.) aparecem aqui quando o escritório registrar.</div></div>`,
  });
  document.querySelectorAll('[data-cert]').forEach(b => b.addEventListener('click', () => verCertificado(b.dataset.cert)));
}
