// MOVER.IA — documentos: listagem, cadastro, QR Code, leitura de PDF e upload inteligente
// (arquivo carregado pelo index.html; todas as funções ficam globais,
// então um arquivo pode chamar funções dos outros normalmente)

let qrStreamAtivo = null;

async function abrirScannerQR(docId, onSalvo){
  const modalHtml = `
    <div id="qrModal" style="position:fixed; inset:0; background:#000; z-index:50; display:flex; flex-direction:column;">
      <video id="qrVideo" autoplay playsinline muted style="flex:1; object-fit:cover; width:100%; min-height:0;"></video>
      <div style="padding:16px; background:var(--asphalt-900);">
        <div id="qrStatus" class="l2" style="text-align:center; margin-bottom:10px;">Aponte a câmera para o QR Code do documento</div>
        <button id="btnFecharQR" style="width:100%;">Cancelar</button>
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', modalHtml);

  const video = document.getElementById('qrVideo');
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  let ativo = true;

  function fecharScanner(){
    ativo = false;
    if(qrStreamAtivo){ qrStreamAtivo.getTracks().forEach(t => t.stop()); qrStreamAtivo = null; }
    const modal = document.getElementById('qrModal');
    if(modal) modal.remove();
  }
  document.getElementById('btnFecharQR').addEventListener('click', fecharScanner);

  if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){
    alert('Este navegador não permite usar a câmera aqui. Tente pelo celular, em um site https.');
    fecharScanner();
    return;
  }

  try{
    qrStreamAtivo = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
  } catch(e){
    alert('Não consegui acessar a câmera: ' + e.message);
    fecharScanner();
    return;
  }
  try{ await carregarBiblioteca('qr'); }
  catch(e){ alert(e.message); fecharScanner(); return; }
  if(!ativo) return;  // cancelou enquanto baixava
  video.srcObject = qrStreamAtivo;

  function tick(){
    if(!ativo) return;
    if(video.readyState === video.HAVE_ENOUGH_DATA){
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const codigo = jsQR(imageData.data, imageData.width, imageData.height);
      if(codigo && codigo.data){
        document.getElementById('qrStatus').textContent = 'QR Code lido!';
        fecharScanner();
        processarQrLido(docId, codigo.data, onSalvo);
        return;
      }
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

async function processarQrLido(docId, conteudo, onSalvo){
  const confirmar = confirm(`QR Code lido:\n\n${conteudo}\n\nSalvar essa informação neste documento?`);
  if(!confirmar) return;
  const { error } = await sb.from('documento').update({ qr_conteudo: conteudo }).eq('id', docId);
  if(error){ alert('Erro ao salvar QR Code: ' + error.message); return; }
  (onSalvo || (()=>{}))();
}

let documentosSubtela = 'lista';
let documentosFiltro = 'todos';

// Linha de documento no app do motorista (lista escura, no estilo do protótipo).
// O motorista só vê, baixa e compartilha — anexar/trocar arquivo é do escritório.
function cardDocumento(d, subtitulo, comValidade = true){
  const marcavel = selecionandoArquivos && d.arquivo_url;
  return `
    <div class="list-item" style="align-items:flex-start;">
      ${marcavel ? `<label class="doc-marcar"><input type="checkbox" data-sel-doc="${d.id}" ${selecaoArquivos.has(String(d.id)) ? 'checked' : ''} aria-label="Selecionar ${esc(d.tipo)}"></label>` : `<div class="li-ic">${ic('doc', 16)}</div>`}
      <div class="li-body">
        <div class="li-title">${esc(d.tipo)}</div>
        <div class="li-sub">${[subtitulo ? esc(subtitulo) : '', d.numero ? 'nº ' + esc(d.numero) : '', comValidade ? esc(textoVencimento(d)) : ''].filter(Boolean).join(' · ')}</div>
        <div class="li-acoes">
          ${d.arquivo_url ? `<button class="btn-small" data-ver="${d.id}">${ic('eye', 14)} Ver</button>
          <button class="btn-small" data-baixar="${d.id}">${ic('download', 14)} Baixar</button>
          ${podeCompartilharArquivos() ? `<button class="btn-small" data-compartilhar="${d.id}">${ic('share', 14)} Compartilhar</button>` : ''}`
          : '<span class="li-sub">Arquivo ainda não anexado pelo escritório</span>'}
        </div>
      </div>
      ${comValidade ? `<div class="li-row-end">${pillDoc(d)}</div>` : ''}
    </div>`;
}

async function loadDocumentos(){
  if(documentosSubtela === 'manual'){ loadDocumentosManual(); return; }

  const el = document.getElementById('screenContent');
  const [{ data: docs, error }, { data: motoristas }, { data: veiculos }, { data: viagens }] = await Promise.all([
    sb.from('documento').select('id, referente_a, referente_id, tipo, numero, validade, status, arquivo_url, qr_conteudo, criado_em').order('tipo'),
    sb.from('usuario').select('id, nome').eq('papel', 'motorista').order('nome'),
    sb.from('veiculo').select('id, placa').order('placa'),
    sb.from('viagem').select('id, origem, destino'),
  ]);
  if(error){ el.innerHTML = `<div class="status">Erro ao carregar documentos: ${esc(error.message)}</div>`; return; }

  const motoristaNome = Object.fromEntries((motoristas||[]).map(m => [m.id, m.nome]));
  const veiculoPlaca = Object.fromEntries((veiculos||[]).map(v => [v.id, v.placa]));
  const viagemRota = Object.fromEntries((viagens||[]).map(v => [v.id, `${v.origem || '?'} → ${v.destino || '?'}`]));
  const nomeRef = (d) => d.referente_a === 'empresa' ? 'Empresa' : d.referente_a === 'motorista' ? (motoristaNome[d.referente_id] || '—')
    : d.referente_a === 'viagem' ? 'Viagem ' + (viagemRota[d.referente_id] || '') : (veiculoPlaca[d.referente_id] || '—');
  const todosDocs = docs || [];
  const filtros = [['todos', 'Todos'], ['empresa', 'Empresa'], ['motorista', 'Motoristas'], ['veiculo', 'Veículos'], ['viagem', 'Viagens'], ['alerta', 'Vencidos / a vencer']];
  const doFiltro = todosDocs
    .filter(d => documentosFiltro === 'todos' || (documentosFiltro === 'alerta' ? statusDocumento(d) !== 'ok' : d.referente_a === documentosFiltro));
  const porNome = porTexto(nomeRef);
  const ordens = [
    ['situacao', 'Situação (vencidos primeiro)', (a, b) => PESO_STATUS_DOC[statusDocumento(b)] - PESO_STATUS_DOC[statusDocumento(a)] || porNome(a, b)],
    ['novos', 'Mais novos primeiro', (a, b) => porData(d => d.criado_em, -1)(a, b) || porNome(a, b)],
    ['antigos', 'Mais antigos primeiro', (a, b) => porData(d => d.criado_em, 1)(a, b) || porNome(a, b)],
    ['az', 'Nome de A a Z', (a, b) => porNome(a, b) || porTexto(d => d.tipo)(a, b)],
    ['za', 'Nome de Z a A', (a, b) => porTexto(nomeRef, -1)(a, b) || porTexto(d => d.tipo)(a, b)],
    ['vence', 'Vence primeiro', (a, b) => porData(d => d.validade, 1)(a, b) || porNome(a, b)],
    ['vence_longe', 'Vence por último', (a, b) => porData(d => d.validade, -1)(a, b) || porNome(a, b)],
    ['tipo', 'Tipo de documento (A a Z)', (a, b) => porTexto(d => d.tipo)(a, b) || porNome(a, b)],
  ];
  const textoDoc = (d) => [nomeRef(d), d.tipo, d.numero, { empresa:'Empresa', motorista:'Motorista', veiculo:'Veículo', viagem:'Documento de viagem' }[d.referente_a], ROTULO_STATUS_DOC[statusDocumento(d)]].join(' ');
  let visiveis = aplicarLista('documentos', doFiltro, ordens, textoDoc);
  const contagem = (k) => k === 'todos' ? todosDocs.length : k === 'alerta' ? todosDocs.filter(d => statusDocumento(d) !== 'ok').length : todosDocs.filter(d => d.referente_a === k).length;

  el.innerHTML = `
    <div class="upload-box" id="btnAdicionarDocumentoAuto">
      ${ic('upload', 28)}
      <b>Arraste os arquivos aqui ou clique para selecionar</b>
      <div>PDF ou foto de CNH, CRLV etc. — pode mandar vários de uma vez. O app descobre de quem é cada um, sugere a validade e, se for CNH de motorista novo, já cria o login</div>
    </div>
    <div class="doc-tabs" style="max-width:640px;">
      ${filtros.map(([k, l]) => `<button class="${documentosFiltro === k ? 'active' : ''}" data-filtro="${k}">${l} (${contagem(k)})</button>`).join('')}
    </div>
    ${barraLista('documentos', ordens, 'Pesquisar por nome, placa, tipo ou número')}
    <div class="o-panel">
      <div class="o-panel-head"><h3 id="docTitulo">Documentos (${visiveis.length})</h3>
        <div class="o-acoes">
          <button class="btn btn-outline btn-sm" id="btnCadastrarManual">${ic('plus', 14)} Cadastrar manualmente</button>
          ${botaoExportar('btnCsvDocumentos')}
        </div>
      </div>
      <div id="docLista"></div>
    </div>`;

  const lista = document.getElementById('docLista');
  function desenharLista(){
    visiveis = aplicarLista('documentos', doFiltro, ordens, textoDoc);
    document.getElementById('docTitulo').textContent = `Documentos (${visiveis.length})`;
    lista.innerHTML = visiveis.length ? `<div class="o-table-wrap"><table class="o-table"><thead><tr><th>Referente a</th><th>Documento</th><th>Validade</th><th>Status</th><th>Arquivo</th></tr></thead><tbody>
        ${visiveis.map(d => `<tr>
          <td>${esc(nomeRef(d))}<div class="sub">${{ empresa:'Empresa', motorista:'Motorista', veiculo:'Veículo', viagem:'Documento de viagem' }[d.referente_a] || ''}</div></td>
          <td>${esc(d.tipo)}${d.numero ? `<div class="sub mono">nº ${esc(d.numero)}</div>` : ''}${d.qr_conteudo ? '<div class="sub">QR Code lido ✓</div>' : ''}</td>
          <td class="sub">${esc(textoVencimento(d))}</td>
          <td>${badgeDoc(d)}</td>
          <td><div class="o-acoes">
            ${d.arquivo_url ? `<button class="o-dl-btn" data-ver="${d.id}" title="Ver arquivo">${ic('eye', 15)}</button>` : ''}
            <label class="o-dl-btn" title="${d.arquivo_url ? 'Substituir arquivo' : 'Anexar arquivo'}">${ic('upload', 15)}<input type="file" accept="application/pdf,image/*" data-anexar="${d.id}"></label>
            <button class="o-dl-btn" data-qr="${d.id}" title="Escanear QR Code">${ic('qr', 15)}</button>
            <button class="o-dl-btn" data-editar-doc="${d.id}" title="Editar ou excluir">${ic('gear', 15)}</button>
          </div></td></tr>`).join('')}
      </tbody></table></div>` : `<div class="o-empty-note">${estadoListas.documentos.busca ? 'Nenhum documento encontrado nesta pesquisa.' : 'Nenhum documento neste filtro.'}</div>`;
    lista.querySelectorAll('[data-ver]').forEach(btn => btn.addEventListener('click', () => { const d = todosDocs.find(x => x.id === btn.dataset.ver); verArquivo(btn.dataset.ver, todosDocs, d && d.referente_a !== 'empresa' ? nomeRef(d) : ''); }));
    lista.querySelectorAll('[data-anexar]').forEach(inp => inp.addEventListener('change', (e) => anexarArquivoComLeitura(inp.dataset.anexar, e.target.files[0], loadDocumentos)));
    lista.querySelectorAll('[data-qr]').forEach(btn => btn.addEventListener('click', () => abrirScannerQR(btn.dataset.qr, loadDocumentos)));
    lista.querySelectorAll('[data-editar-doc]').forEach(btn => btn.addEventListener('click', () => {
      const d = todosDocs.find(x => x.id === btn.dataset.editarDoc);
      abrirEditarDocumento(d, nomeRef(d));
    }));
  }
  desenharLista();
  ligarBarraLista(el, 'documentos', desenharLista);

  const dropArea = document.getElementById('btnAdicionarDocumentoAuto');
  dropArea.addEventListener('click', abrirUploadAutomatico);
  dropArea.addEventListener('dragover', (e) => { e.preventDefault(); dropArea.style.borderColor = 'var(--line-yellow)'; });
  dropArea.addEventListener('dragleave', () => { dropArea.style.borderColor = ''; });
  dropArea.addEventListener('drop', (e) => {
    e.preventDefault();
    dropArea.style.borderColor = '';
    processarArquivosEnviados([...(e.dataTransfer.files || [])]);
  });

  el.querySelectorAll('[data-filtro]').forEach(b => b.addEventListener('click', () => { documentosFiltro = b.dataset.filtro; loadDocumentos(); }));
  document.getElementById('btnCadastrarManual').addEventListener('click', () => { documentosSubtela = 'manual'; loadDocumentos(); });
  document.getElementById('btnCsvDocumentos').addEventListener('click', () => baixarCSV('documentos', ['Referente a', 'Tipo', 'Documento', 'Número', 'Validade', 'Status'],
    visiveis.map(d => [nomeRef(d), d.referente_a, d.tipo, d.numero || '', d.validade ? fmtData(d.validade) : '', ROTULO_STATUS_DOC[statusDocumento(d)]])));
}

async function loadDocumentosManual(){
  const { data: motoristas } = await sb.from('usuario').select('id, nome').eq('papel', 'motorista').order('nome');
  const { data: veiculos } = await sb.from('veiculo').select('id, placa').order('placa');
  const el = document.getElementById('screenContent');

  el.innerHTML = `
    <button class="btn btn-outline btn-sm" id="btnVoltarManual" style="margin-bottom:16px;">${ic('back', 14)} Voltar para documentos</button>
    <div class="two-col" style="grid-template-columns:1fr 1fr;">
    <div class="o-panel"><div class="o-panel-head"><h3>Documento de motorista</h3></div>
    <div class="o-panel-body">
      <form id="formNovoDocMotorista">
        <select id="docMotoristaSelect" required>
          <option value="">Selecione o motorista</option>
          ${(motoristas||[]).map(m => `<option value="${m.id}">${esc(m.nome)}</option>`).join('')}
        </select>
        <input type="text" id="docMotoristaTipo" placeholder="Tipo (ex: CNH, Exame toxicológico)" required>
        <input type="text" id="docMotoristaNumero" placeholder="Número (opcional)">
        <div class="field-row" style="margin:0;"><label>Validade</label><input type="date" id="docMotoristaValidade"></div>
        <div class="field-row" style="margin:0;"><label>Situação (só vale se não tiver validade)</label>
        <select id="docMotoristaStatus">
          <option value="ok">Em dia</option>
          <option value="vence_em_breve">Vence em breve</option>
          <option value="vencido">Vencido</option>
        </select></div>
        <button type="submit">Adicionar documento de motorista</button>
      </form>
    </div></div>

    <div class="o-panel"><div class="o-panel-head"><h3>Documento de veículo</h3></div>
    <div class="o-panel-body">
      <form id="formNovoDocVeiculo">
        <select id="docVeiculoSelect" required>
          <option value="">Selecione o veículo</option>
          ${(veiculos||[]).map(v => `<option value="${v.id}">${esc(v.placa)}</option>`).join('')}
        </select>
        <input type="text" id="docVeiculoTipo" placeholder="Tipo (ex: CRLV, Licenciamento)" required>
        <input type="text" id="docVeiculoNumero" placeholder="Número (opcional)">
        <div class="field-row" style="margin:0;"><label>Validade</label><input type="date" id="docVeiculoValidade"></div>
        <div class="field-row" style="margin:0;"><label>Situação (só vale se não tiver validade)</label>
        <select id="docVeiculoStatus">
          <option value="ok">Em dia</option>
          <option value="vence_em_breve">Vence em breve</option>
          <option value="vencido">Vencido</option>
        </select></div>
        <button type="submit">Adicionar documento de veículo</button>
      </form>
    </div></div>
    </div>
  `;

  document.getElementById('btnVoltarManual').addEventListener('click', () => { documentosSubtela = 'lista'; loadDocumentos(); });
  const formMot = document.getElementById('formNovoDocMotorista');
  if(formMot) formMot.addEventListener('submit', criarDocumentoMotorista);
  const formVei = document.getElementById('formNovoDocVeiculo');
  if(formVei) formVei.addEventListener('submit', criarDocumentoVeiculo);
}

async function criarDocumentoMotorista(e){
  e.preventDefault();
  const btn = e.target.querySelector('button');
  const motoristaId = document.getElementById('docMotoristaSelect').value;
  const tipo = document.getElementById('docMotoristaTipo').value.trim();
  const numero = document.getElementById('docMotoristaNumero').value.trim();
  const validade = document.getElementById('docMotoristaValidade').value;
  const status = document.getElementById('docMotoristaStatus').value;
  if(!motoristaId || !tipo){ alert('Selecione o motorista e informe o tipo do documento.'); return; }
  btn.disabled = true; btn.textContent = 'Adicionando...';
  const { error } = await sb.from('documento').insert({
    transportadora_id: usuarioAtual.transportadora_id,
    referente_a: 'motorista',
    referente_id: motoristaId,
    tipo,
    numero: numero || null,
    validade: validade || null,
    status
  });
  if(error){ alert('Erro ao adicionar documento: ' + error.message); btn.disabled = false; btn.textContent = 'Adicionar documento de motorista'; return; }
  documentosSubtela = 'lista';
  loadDocumentos();
}

async function criarDocumentoVeiculo(e){
  e.preventDefault();
  const btn = e.target.querySelector('button');
  const veiculoId = document.getElementById('docVeiculoSelect').value;
  const tipo = document.getElementById('docVeiculoTipo').value.trim();
  const numero = document.getElementById('docVeiculoNumero').value.trim();
  const validade = document.getElementById('docVeiculoValidade').value;
  const status = document.getElementById('docVeiculoStatus').value;
  if(!veiculoId || !tipo){ alert('Selecione o veículo e informe o tipo do documento.'); return; }
  btn.disabled = true; btn.textContent = 'Adicionando...';
  const { error } = await sb.from('documento').insert({
    transportadora_id: usuarioAtual.transportadora_id,
    referente_a: 'veiculo',
    referente_id: veiculoId,
    tipo,
    numero: numero || null,
    validade: validade || null,
    status
  });
  if(error){ alert('Erro ao adicionar documento: ' + error.message); btn.disabled = false; btn.textContent = 'Adicionar documento de veículo'; return; }
  documentosSubtela = 'lista';
  loadDocumentos();
}

function formatarData(iso){
  const [y,m,d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function sanitizarNomeArquivo(nome){
  return nome
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9.\-]/g, '_');
}

async function anexarArquivo(docId, file, onDone){
  if(!file) return;
  const path = `${usuarioAtual.transportadora_id}/${docId}_${Date.now()}_${sanitizarNomeArquivo(file.name)}`;
  const { error: upErr } = await sb.storage.from('documentos').upload(path, file, { upsert: true });
  if(upErr){ alert('Erro ao enviar arquivo: ' + upErr.message); return; }
  const { error: updErr } = await sb.from('documento').update({ arquivo_url: path }).eq('id', docId);
  if(updErr){ alert('Arquivo enviado, mas não consegui atualizar o registro: ' + updErr.message); return; }
  (onDone || loadDocumentos)();
}

// (leitura automática — PDF, OCR, detectar tipo, revisão — em js/documentos-leitura.js)

function mostrarToast(mensagem){
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed; left:16px; right:16px; bottom:calc(84px + env(safe-area-inset-bottom, 0px)); max-width:480px; margin:0 auto; background:#3fb27f; color:#0d1f16; font-weight:700; font-size:13.5px; padding:14px 16px; border-radius:12px; z-index:70; text-align:center; box-shadow:0 6px 20px rgba(0,0,0,.35);';
  el.textContent = mensagem;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

// Insere o documento no banco e sobe o arquivo — usado tanto quando a
// pessoa confirma manualmente no cartão de revisão quanto quando o app
// tem certeza suficiente pra cadastrar sozinho, sem perguntar nada.
async function salvarDocumentoNoBanco({ referenteA, referenteId, tipo, numero, validade, file }){
  // CNH nova de quem já tem CNH, ou CRLV novo de veículo que já tem CRLV: atualiza o existente (não duplica)
  const tipoUnico = (referenteA === 'motorista' && /^cnh$/i.test(String(tipo || '').trim())) ? 'cnh'
    : (referenteA === 'veiculo' && /^crlv$/i.test(String(tipo || '').trim())) ? 'crlv' : null;
  if(tipoUnico){
    const { data: existente } = await sb.from('documento').select('id').eq('referente_a', referenteA).eq('referente_id', referenteId).ilike('tipo', tipoUnico).order('criado_em', { ascending: false }).limit(1);
    if(existente && existente[0]){
      const docId = existente[0].id;
      const path = `${usuarioAtual.transportadora_id}/${docId}_${Date.now()}_${sanitizarNomeArquivo(file.name)}`;
      const { error: upErr } = await sb.storage.from('documentos').upload(path, file, { upsert: true });
      if(upErr) return { error: upErr, docId };
      const { error } = await sb.from('documento').update({ arquivo_url: path, numero: numero || null, validade: validade || null, status: 'ok' }).eq('id', docId);
      return error ? { error, docId } : { docId, atualizado: true };
    }
  }
  const { data: novoDoc, error } = await sb.from('documento').insert({
    transportadora_id: usuarioAtual.transportadora_id,
    referente_a: referenteA,
    referente_id: referenteId,
    tipo,
    numero: numero || null,
    validade: validade || null,
    status: 'ok'
  }).select('id').single();

  if(error) return { error };

  const path = `${usuarioAtual.transportadora_id}/${novoDoc.id}_${Date.now()}_${sanitizarNomeArquivo(file.name)}`;
  const { error: upErr } = await sb.storage.from('documentos').upload(path, file, { upsert: true });
  if(upErr) return { error: upErr, docId: novoDoc.id };
  await sb.from('documento').update({ arquivo_url: path }).eq('id', novoDoc.id);
  return { docId: novoDoc.id };
}

// Monta o item do arquivo (link temporário de 5 min + nome amigável, ex.: "CNH - Carlos Alves.pdf")
async function itemArquivoDocumento(doc, complemento){
  const { data, error } = await sb.storage.from('documentos').createSignedUrl(doc.arquivo_url, 300);
  if(error) throw new Error('Erro ao abrir arquivo: ' + error.message);
  registrarAcessoArquivo('documento', doc.id);
  const tipo = /\.pdf$/i.test(doc.arquivo_url) ? 'application/pdf' : /\.(mp4|mov|webm)$/i.test(doc.arquivo_url) ? 'video' : 'imagem';
  return { url: data.signedUrl, tipo, nome: [doc.tipo, complemento].filter(Boolean).join(' - ') };
}
async function verArquivo(docId, docs, complemento = ''){
  const doc = (docs||[]).find(d => String(d.id) === String(docId));
  if(!doc || !doc.arquivo_url) return;
  try{ const item = await itemArquivoDocumento(doc, complemento); abrirVisualizador([item], 0, item.nome); }
  catch(e){ alert(e.message); }
}
// Baixar no aparelho ou compartilhar (WhatsApp, e-mail...) — direto da lista, sem abrir
async function acaoArquivoDocumento(acao, docId, docs, complemento = '', botao = null){
  const doc = (docs||[]).find(d => String(d.id) === String(docId));
  if(!doc || !doc.arquivo_url) return;
  const textoOriginal = botao ? botao.innerHTML : '';
  if(botao){ botao.disabled = true; botao.textContent = 'Preparando...'; }
  try{
    const item = await itemArquivoDocumento(doc, complemento);
    if(acao === 'compartilhar') await compartilharArquivoItem(item); else await baixarArquivoItem(item);
  } catch(e){ alert(e.message || 'Não consegui preparar o arquivo.'); }
  finally{ if(botao){ botao.disabled = false; botao.innerHTML = textoOriginal; } }
}
// ---------- vários arquivos de uma vez (app do motorista) ----------
// "Selecionar vários" põe uma caixinha em cada documento; a barra de baixo compartilha ou baixa
// todos os marcados juntos. A marcação continua ao trocar de aba (Meus, Veículo, Empresa, Viagem).
const selecaoArquivos = new Set();
let selecionandoArquivos = false;
function pararSelecaoArquivos(){ selecionandoArquivos = false; selecaoArquivos.clear(); }
function botaoSelecionarArquivos(){
  return `<button type="button" class="btn-small" id="btnSelecionarArquivos" style="margin-bottom:10px;">${ic(selecionandoArquivos ? 'x' : 'checksq', 14)} ${selecionandoArquivos ? 'Cancelar seleção' : 'Selecionar vários para enviar'}</button>`;
}
// docs = todos os documentos que podem estar marcados; redesenhar = desenha a tela de novo
function ligarSelecaoArquivos(raiz, docs, complementoDe, redesenhar){
  const b = raiz.querySelector('#btnSelecionarArquivos');
  if(b) b.addEventListener('click', () => { if(selecionandoArquivos) pararSelecaoArquivos(); else selecionandoArquivos = true; redesenhar(); });
  const antiga = document.getElementById('barraSelecao');
  if(antiga) antiga.remove();
  if(!selecionandoArquivos) return;
  document.querySelector('.m-app').insertAdjacentHTML('beforeend', `<div class="barra-selecao" id="barraSelecao">
    <span id="selQtd"></span>
    <button type="button" class="btn-small" id="selBaixar">${ic('download', 14)} Baixar</button>
    ${podeCompartilharArquivos() ? `<button type="button" class="btn-small destaque" id="selCompartilhar">${ic('share', 14)} Enviar</button>` : ''}
  </div>`);
  const marcados = () => (docs || []).filter(d => d.arquivo_url && selecaoArquivos.has(String(d.id)));
  const atualizar = () => {
    const n = marcados().length;
    document.getElementById('selQtd').textContent = n ? `${n} selecionado${n > 1 ? 's' : ''}` : 'Marque os documentos';
    document.querySelectorAll('#barraSelecao button').forEach(x => { x.disabled = !n; });
  };
  raiz.querySelectorAll('[data-sel-doc]').forEach(c => c.addEventListener('change', () => { if(c.checked) selecaoArquivos.add(c.dataset.selDoc); else selecaoArquivos.delete(c.dataset.selDoc); atualizar(); }));
  const agir = async (acao, botao) => {
    const lista = marcados();
    if(!lista.length) return;
    const texto = botao.innerHTML; botao.disabled = true; botao.textContent = 'Preparando...';
    try{
      const itens = [];
      for(const d of lista) itens.push(await itemArquivoDocumento(d, complementoDe(d)));
      if(acao === 'compartilhar') await compartilharVariosItens(itens);
      else for(const it of itens) await baixarArquivoItem(it);
    } catch(e){ alert(e.message || 'Não consegui preparar os arquivos.'); }
    finally{ botao.innerHTML = texto; atualizar(); }
  };
  document.getElementById('selBaixar').addEventListener('click', (e) => agir('baixar', e.currentTarget));
  const comp = document.getElementById('selCompartilhar');
  if(comp) comp.addEventListener('click', (e) => agir('compartilhar', e.currentTarget));
  atualizar();
}

// Liga os botões Ver / Baixar / Compartilhar de uma lista. complementoDe(doc) = nome da pessoa, placa ou viagem
function ligarAcoesArquivo(raiz, docs, complementoDe = () => ''){
  const achar = (id) => (docs || []).find(d => String(d.id) === String(id));
  raiz.querySelectorAll('[data-ver]').forEach(b => b.addEventListener('click', () => verArquivo(b.dataset.ver, docs, complementoDe(achar(b.dataset.ver)))));
  raiz.querySelectorAll('[data-baixar]').forEach(b => b.addEventListener('click', () => acaoArquivoDocumento('baixar', b.dataset.baixar, docs, complementoDe(achar(b.dataset.baixar)), b)));
  raiz.querySelectorAll('[data-compartilhar]').forEach(b => b.addEventListener('click', () => acaoArquivoDocumento('compartilhar', b.dataset.compartilhar, docs, complementoDe(achar(b.dataset.compartilhar)), b)));
}
