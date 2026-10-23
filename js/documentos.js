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

async function extrairTextoPdf(file){
  try{ await usarPdfJs(); } catch(e){ return ''; }
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  let texto = '';
  // Alguns documentos digitais (ex: CNH Digital) têm os dados pessoais só
  // como imagem/foto — sem texto selecionável na página. Nesses casos, o
  // título do arquivo (ex: "CNH Digital", "CRLV Digital") é a pista mais
  // confiável disponível, então incluímos ele também.
  try{
    const meta = await pdf.getMetadata();
    if(meta && meta.info && meta.info.Title) texto += meta.info.Title + '\n';
  } catch(e){ /* metadata pode não existir, segue sem ela */ }
  for(let i = 1; i <= Math.min(pdf.numPages, 3); i++){
    const pagina = await pdf.getPage(i);
    const conteudo = await pagina.getTextContent();
    texto += conteudo.items.map(it => it.str).join(' ') + '\n';
  }
  return texto;
}

function extrairDatasPossiveis(texto){
  const encontradas = texto.match(/\d{2}\/\d{2}\/\d{4}/g) || [];
  return [...new Set(encontradas)];
}

function mostrarSelecaoDeData(docId, datas){
  return new Promise((resolve) => {
    const modalHtml = `
      <div id="dataModal" style="position:fixed; inset:0; background:rgba(0,0,0,.7); z-index:50; display:flex; align-items:flex-end;">
        <div style="background:var(--asphalt-900); width:100%; border-radius:16px 16px 0 0; padding:20px; max-height:80vh; overflow:auto;">
          <h3 style="margin-top:0;">Encontrei estas datas no PDF</h3>
          <div class="l2" style="margin-bottom:12px;">Toque na que for a validade deste documento (ou pule, se nenhuma for)</div>
          <div style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:16px;">
            ${datas.map(d => `<button class="ans-btn" data-data="${d}" style="flex:none; padding:10px 14px;">${d}</button>`).join('')}
          </div>
          <button class="btn-small" id="btnPularData" style="width:100%;">Pular, escolher validade manualmente depois</button>
        </div>
      </div>`;
    document.body.insertAdjacentHTML('beforeend', modalHtml);

    function fechar(dataEscolhida){
      const modal = document.getElementById('dataModal');
      if(modal) modal.remove();
      resolve(dataEscolhida);
    }
    document.getElementById('btnPularData').addEventListener('click', () => fechar(null));
    document.querySelectorAll('#dataModal [data-data]').forEach(btn => btn.addEventListener('click', async () => {
      const [dd, mm, yyyy] = btn.dataset.data.split('/');
      const isoDate = `${yyyy}-${mm}-${dd}`;
      const { error } = await sb.from('documento').update({ validade: isoDate }).eq('id', docId);
      if(error) alert('Não consegui salvar a validade automaticamente: ' + error.message);
      fechar(btn.dataset.data);
    }));
  });
}

async function anexarArquivoComLeitura(docId, file, onDone){
  if(!file) return;
  // Sugerir a validade lida do PDF é só para o escritório: o motorista anexa
  // o arquivo, e quem confere e grava a validade é a gestão (regra do banco)
  if(file.type === 'application/pdf' && PAPEIS_GESTAO.includes(usuarioAtual.papel)){
    try{
      let texto = await extrairTextoPdf(file);
      let datas = extrairDatasPossiveis(texto);
      if(!datas.length){
        // PDF sem data em texto selecionável (ex: documento com dados só em
        // foto/imagem) — tenta achar a validade por OCR antes de desistir.
        mostrarStatusOcr(true, 'Lendo o documento com reconhecimento de imagem...');
        const textoOcr = await ocrArquivo(file);
        mostrarStatusOcr(false);
        if(textoOcr) datas = extrairDatasPossiveis(textoOcr);
      }
      if(datas.length) await mostrarSelecaoDeData(docId, datas);
    } catch(e){
      // se não conseguir ler o texto do PDF, segue o upload normalmente
    }
  }
  await anexarArquivo(docId, file, onDone);
}

function normalizarTexto(t){
  return (t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
}

// Remove todo espaço/pontuação — PDFs costumam quebrar palavras acentuadas
// em pedaços com espaços extras no meio, então comparar "grudado" é mais confiável.
function normalizarTextoGrudado(t){
  return normalizarTexto(t).replace(/[^A-Z0-9]/g, '');
}

function detectarTipoDocumento(texto){
  const t = normalizarTextoGrudado(texto);
  // A CNH Digital emitida pelo SENATRAN não traz o nome/número em texto
  // selecionável (é uma foto/imagem) — só o cabeçalho padrão do documento
  // e o título do arquivo, por isso os sinais abaixo miram nesse texto fixo.
  if(t.includes('HABILITACAO') || t.includes('DRIVERLICENSE') || t.includes('CARTEIRANACIONALDETRANSITO')
     || t.includes('CNHDIGITAL') || t.includes('ASSINADORSERPRO')) return { referenteA: 'motorista', tipo: 'CNH' };
  if(t.includes('LICENCIAMENTODEVEICULO') || t.includes('CRLV') || t.includes('CERTIFICADODEREGISTRO')
     || t.includes('CRLVDIGITAL')) return { referenteA: 'veiculo', tipo: 'CRLV' };
  return { referenteA: null, tipo: '' };
}

function normalizarPalavras(t){
  return normalizarTexto(t).replace(/[^A-Z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
}

function nomeBateExato(texto, motorista){
  if(!motorista) return false;
  const t = normalizarTextoGrudado(texto);
  return t.includes(normalizarTextoGrudado(motorista.nome));
}

function encontrarMotoristaPorNome(texto, motoristas){
  const t = normalizarTextoGrudado(texto);
  const exatos = (motoristas || []).filter(m => t.includes(normalizarTextoGrudado(m.nome)));
  if(exatos.length === 1) return exatos[0];
  if(exatos.length > 1) return null; // mais de um nome bate igual — ambíguo, não arrisca

  // Nenhum nome bateu perfeito — o OCR pode ter errado uma letra (comum em
  // nomes compostos/acentuados). Tenta por palavras do nome, exigindo a
  // maior parte delas presente como palavra inteira no texto lido.
  // O 1º nome tem que estar lá: irmãos/parentes têm o mesmo sobrenome
  // (ex.: Renato e Rafael Rodrigues de Freitas) e não podem ser confundidos.
  const palavrasTexto = new Set(normalizarPalavras(texto));
  const candidatos = (motoristas || []).map(m => {
    const palavrasNome = normalizarPalavras(m.nome).filter(p => p.length >= 3);
    if(!palavrasNome.length || !palavrasTexto.has(normalizarPalavras(m.nome)[0])) return null;
    const acertos = palavrasNome.filter(p => palavrasTexto.has(p)).length;
    return { motorista: m, acertos, total: palavrasNome.length };
  }).filter(c => c && c.acertos >= Math.max(2, Math.ceil(c.total * 0.6)));

  candidatos.sort((a, b) => b.acertos - a.acertos);
  if(candidatos.length === 1) return candidatos[0].motorista;
  if(candidatos.length > 1 && candidatos[0].acertos > candidatos[1].acertos) return candidatos[0].motorista;
  return null;
}

// Dados para cadastrar um veículo novo a partir do CRLV (placa, tipo, modelo, ano). Tudo é só
// sugestão — a pessoa confere na janela de cadastro. O nome do arquivo também ajuda na placa
// (o CRLV Digital vem como "CRLVDigital_BZG9878_2026.pdf").
function extrairDadosCRLV(texto, nomeArquivo = ''){
  const t = normalizarTexto(texto || '');
  const linhas = (texto || '').split('\n').map(l => normalizarTexto(l).trim()).filter(Boolean);
  const PLACA = /\b([A-Z]{3})[\s-]?([0-9][A-Z0-9][0-9]{2})\b/;
  let placa = null;
  const iPlaca = t.search(/\bPLACA\b(?!\s*ANTERIOR)/);
  if(iPlaca !== -1){ const m = t.slice(iPlaca, iPlaca + 80).match(PLACA); if(m) placa = m[1] + '-' + m[2]; }
  if(!placa){ const m = normalizarTexto(nomeArquivo).replace(/[_.]/g, ' ').match(PLACA); if(m) placa = m[1] + '-' + m[2]; }
  let tipo = null;
  if(/SEMI[\s-]*REBOQUE/.test(t)) tipo = 'carreta';
  else if(/TRATOR/.test(t)) tipo = 'cavalo';
  else if(/\bREBOQUE\b/.test(t)) tipo = 'dolly';
  let modelo = null;
  const iModelo = linhas.findIndex(l => /MARCA\s*\/?\s*MODELO/.test(l));
  if(iModelo !== -1){
    const resto = linhas[iModelo].replace(/^.*MARCA\s*\/?\s*MODELO\s*\/?\s*(VERSAO)?/, '').trim();
    const candidato = resto.length >= 3 ? resto : (linhas[iModelo + 1] || '');
    if(candidato && !/ESPECIE|TIPO/.test(candidato)) modelo = candidato.replace(/\s+/g, ' ').slice(0, 40);
  }
  let ano = null;
  const iAno = t.search(/ANO\s*(DE\s*)?FABRICA/);
  if(iAno !== -1){ const m = t.slice(iAno, iAno + 80).match(/\b(19[7-9][0-9]|20[0-9]{2})\b/); if(m) ano = Number(m[1]); }
  const iNome = linhas.findIndex(l => /^NOME\b/.test(l));
  const proprietario = iNome !== -1 ? (linhas[iNome].replace(/^NOME\s*/, '') || linhas[iNome + 1] || '') : '';
  return { placa, tipo, modelo, ano, proprietario };
}

// Janela de cadastro de veículo aberta pela conferência de documento. Devolve o veículo
// criado ({ id, placa, grupo }) ou null se a pessoa voltar sem cadastrar.
function cadastrarVeiculoPeloDocumento(sug, veiculos, file){
  return new Promise((resolve) => {
    const grupos = [...new Set(veiculos.map(v => v.grupo).filter(Boolean))].sort();
    // grupo sugerido pelo nome do proprietário no CRLV (ex.: "LEGUTRAN ..." → grupo "Legut")
    const dono = normalizarTexto(sug.proprietario || '').replace(/[^A-Z]/g, '');
    const grupoSugerido = grupos.find(g => { const n = normalizarTexto(g).replace(/[^A-Z]/g, ''); return n.length >= 4 && dono.includes(n); }) || '';
    document.body.insertAdjacentHTML('beforeend', `
      <div id="novoVeicModal" style="position:fixed; inset:0; background:rgba(0,0,0,.85); z-index:65; display:flex; align-items:center; justify-content:center; padding:20px;">
        <div style="background:var(--asphalt-900); border:1px solid var(--border); border-radius:16px; padding:20px; max-width:${file ? '760px' : '440px'}; width:100%; max-height:94vh; overflow:auto;">
          <h3 style="margin-top:0;">Cadastrar novo veículo</h3>
          <div class="l2" style="margin-bottom:14px;">Confira os dados no documento abaixo (dá para dar zoom). Depois é só montar o conjunto em Veículos, se ele fizer parte de um.</div>
          ${file ? previaDocumentoHtml('novoVeicPrevia') : ''}
          <div class="o-form-grid">
            <div class="field-row" style="margin:0;"><label for="nvPlaca">Placa</label><input type="text" id="nvPlaca" value="${esc(sug.placa || '')}" placeholder="ex: GKH-1B12" style="text-transform:uppercase;"></div>
            <div class="field-row" style="margin:0;"><label for="nvTipo">Tipo</label><select id="nvTipo">
              <option value="">Selecione</option>
              ${['cavalo', 'carreta', 'dolly'].map(t => `<option value="${t}" ${sug.tipo === t ? 'selected' : ''}>${tipoLabelGlobal[t]}</option>`).join('')}</select></div>
            <div class="field-row" style="margin:0;"><label for="nvModelo">Modelo</label><input type="text" id="nvModelo" value="${esc(sug.modelo || '')}" maxlength="60" placeholder="ex: Scania R450"></div>
            <div class="field-row" style="margin:0;"><label for="nvAno">Ano</label><input type="text" id="nvAno" value="${esc(sug.ano || '')}" inputmode="numeric" maxlength="4" placeholder="ex: 2021"></div>
            <div class="field-row" style="margin:0;"><label for="nvGrupo">Grupo (opcional)</label><input type="text" id="nvGrupo" value="${esc(grupoSugerido)}" list="nvGrupos" maxlength="40" placeholder="ex: Chaves, Agregado"></div>
            <datalist id="nvGrupos">${grupos.map(g => `<option value="${esc(g)}">`).join('')}</datalist>
          </div>
          <div class="err" id="nvErro" style="margin-top:8px;"></div>
          <button id="btnNvOk" style="margin-top:14px; width:100%;">Cadastrar veículo</button>
          <button class="btn-small" id="btnNvVoltar" style="margin-top:8px; width:100%;">Voltar</button>
        </div>
      </div>`);
    if(file){ document.getElementById('novoVeicPrevia').style.height = 'min(38vh, 360px)'; montarPreviaDocumento('novoVeicPrevia', file); }
    const fechar = (valor) => { const m = document.getElementById('novoVeicModal'); if(m) m.remove(); resolve(valor); };
    document.getElementById('btnNvVoltar').addEventListener('click', () => fechar(null));
    document.getElementById('btnNvOk').addEventListener('click', async () => {
      const erro = document.getElementById('nvErro'), btn = document.getElementById('btnNvOk');
      const placa = normalizarPlaca(document.getElementById('nvPlaca').value);
      const tipo = document.getElementById('nvTipo').value;
      const anoTxt = document.getElementById('nvAno').value.trim();
      const ano = anoTxt ? parseInt(anoTxt, 10) : null;
      if(!placa){ erro.textContent = 'Placa inválida. Use o formato AAA-9999 ou AAA-9A99.'; return; }
      if(veiculos.some(v => v.placa === placa)){ erro.textContent = `A placa ${placa} já está cadastrada — selecione ela na lista.`; return; }
      if(!tipo){ erro.textContent = 'Escolha o tipo (cavalo, carreta ou dolly).'; return; }
      if(anoTxt && (!ano || ano < 1970 || ano > new Date().getFullYear() + 1)){ erro.textContent = 'Ano inválido.'; return; }
      btn.disabled = true; btn.textContent = 'Cadastrando...';
      const { data, error } = await sb.from('veiculo').insert({
        transportadora_id: usuarioAtual.transportadora_id, placa, tipo,
        modelo: document.getElementById('nvModelo').value.trim() || null, ano,
        grupo: document.getElementById('nvGrupo').value.trim().replace(/\s+/g, ' ') || null,
      }).select('id, placa, grupo').single();
      if(error){ erro.textContent = 'Não consegui cadastrar: ' + error.message; btn.disabled = false; btn.textContent = 'Cadastrar veículo'; return; }
      if(window.limparCacheTelas) limparCacheTelas();
      mostrarToast(`✅ Veículo ${placa} cadastrado`);
      fechar({ id: data.id, placa, grupo: data.grupo || null });
    });
  });
}

function encontrarVeiculoPorPlaca(texto, veiculos){
  const t = normalizarTextoGrudado(texto);
  const encontrados = (veiculos || []).filter(v => t.includes(normalizarTextoGrudado(v.placa)));
  return encontrados.length === 1 ? encontrados[0] : null;
}

async function abrirUploadAutomatico(){
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/pdf,image/*';
  input.multiple = true;
  input.addEventListener('change', (e) => processarArquivosEnviados([...e.target.files]));
  input.click();
}

// Um arquivo: fluxo normal. Vários: processa em lote (um por vez) e, no fim,
// mostra o resumo e a lista de logins/senhas dos motoristas criados.
async function processarArquivosEnviados(arquivos){
  const validos = arquivos.filter(f => f.type === 'application/pdf' || /^image\//.test(f.type));
  if(!validos.length){ if(arquivos.length) alert('Envie PDF ou foto (JPG/PNG).'); return; }
  if(validos.length === 1) return processarUploadAutomatico(validos[0]);
  const lote = { resultados: [], credenciais: [] };
  for(let i = 0; i < validos.length; i++){
    prefixoLote = `Documento ${i + 1} de ${validos.length} — ${esc(validos[i].name)}`;
    mostrarStatusOcr(true, 'Lendo o documento...');
    try{ await processarUploadAutomatico(validos[i], lote); }
    catch(e){ lote.resultados.push({ arquivo: validos[i].name, situacao: 'erro', texto: 'Erro inesperado: ' + e.message }); }
    mostrarStatusOcr(false);
  }
  prefixoLote = '';
  loadDocumentos();
  mostrarResumoLote(lote);
}
let prefixoLote = '';

function mostrarResumoLote(lote){
  const ICONE = { ok:'✅', novo:'🆕', conferido:'✍️', pulado:'⏭️', erro:'⚠️' };
  const n = (s) => lote.resultados.filter(r => r.situacao === s).length;
  abrirModal(`Envio concluído — ${lote.resultados.length} documentos`, `
    <div class="l2" style="margin-bottom:10px;">${lote.credenciais.length} motorista(s) novo(s) com login · ${n('novo') + n('ok')} documento(s) salvo(s) sozinho(s) · ${n('conferido')} conferido(s) na mão · ${n('pulado') + n('erro')} documento(s) não salvo(s)</div>
    ${lote.credenciais.length ? `
      <div class="o-banner" style="margin:0 0 10px; color:var(--signal-amber-ink);">${ic('alert', 18)}<div class="txt"><b>Anote ou imprima os logins agora</b>As senhas temporárias aparecem só aqui. No primeiro acesso, cada motorista confirma o CPF e cria a própria senha.</div></div>
      ${tabela(['Motorista', 'Login', 'Senha temporária'], lote.credenciais.map(c => `<tr><td>${esc(c.nome)}</td><td class="mono">${esc(c.login)}</td><td class="mono"><b>${esc(c.senha)}</b></td></tr>`))}
      <div class="o-acoes" style="margin-bottom:12px;">
        <button type="button" class="btn btn-primary btn-sm" id="btnImprimirLogins">${ic('download', 14)} Imprimir logins</button>
        <button type="button" class="btn btn-outline btn-sm" id="btnCsvLogins">Baixar planilha de logins</button>
      </div>` : ''}
    ${tabela(['', 'Arquivo', 'Resultado'], lote.resultados.map(r => `<tr><td>${ICONE[r.situacao] || ''}</td><td class="sub">${esc(r.arquivo)}</td><td>${esc(r.texto)}</td></tr>`))}`);
  const imprimir = document.getElementById('btnImprimirLogins');
  if(imprimir) imprimir.addEventListener('click', () => {
    const janela = window.open('', '_blank');
    if(!janela){ alert('O navegador bloqueou a janela de impressão — use "Baixar planilha de logins".'); return; }
    janela.document.write(`<!doctype html><meta charset="utf-8"><title>Logins MOVER.IA</title>
      <style>body{font-family:Arial,sans-serif;padding:24px} h1{font-size:18px} table{border-collapse:collapse;width:100%} td,th{border:1px solid #999;padding:8px;text-align:left;font-size:13px} td.m{font-family:monospace;font-size:14px}</style>
      <h1>MOVER.IA — logins de primeiro acesso (${esc(fmtData(new Date()))})</h1>
      <p>Endereço: ${esc(location.origin + location.pathname)} · No primeiro acesso, o motorista confirma o CPF e cria a própria senha.</p>
      <table><tr><th>Motorista</th><th>Login</th><th>Senha temporária</th></tr>
      ${lote.credenciais.map(c => `<tr><td>${esc(c.nome)}</td><td class="m">${esc(c.login)}</td><td class="m">${esc(c.senha)}</td></tr>`).join('')}</table>`);
    janela.document.close(); janela.focus(); janela.print();
  });
  const csv = document.getElementById('btnCsvLogins');
  if(csv) csv.addEventListener('click', () => baixarCSV('logins_motoristas', ['Motorista', 'Login', 'Senha temporária'], lote.credenciais.map(c => [c.nome, c.login, c.senha])));
}

function mostrarStatusOcr(mostrar, mensagem){
  if(mostrar && prefixoLote) mensagem = `${prefixoLote}<br>${mensagem || ''}`;
  let el = document.getElementById('ocrStatus');
  if(mostrar){
    if(!el){
      el = document.createElement('div');
      el.id = 'ocrStatus';
      el.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,.8); z-index:60; display:flex; align-items:center; justify-content:center; padding:24px;';
      document.body.appendChild(el);
    }
    // (mensagem é texto do próprio app; o nome do arquivo passa por esc() no prefixo)
    el.innerHTML = `<div style="text-align:center; color:var(--text-primary);">🔍 ${mensagem || 'Lendo o documento...'}<br><span style="color:var(--text-secondary); font-size:12.5px;">Isso pode levar alguns segundos</span></div>`;
  } else if(el){
    el.remove();
  }
}

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
  // CNH nova de quem já tem CNH cadastrada: atualiza a existente (não duplica)
  if(referenteA === 'motorista' && /^cnh$/i.test(String(tipo || '').trim())){
    const { data: existente } = await sb.from('documento').select('id').eq('referente_a', 'motorista').eq('referente_id', referenteId).ilike('tipo', 'cnh').limit(1);
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

// lote (opcional): { resultados, credenciais } — no envio de vários arquivos,
// em vez de janelas e avisos a cada documento, junta tudo para o resumo final
async function processarUploadAutomatico(file, lote = null){
  const registrar = (situacao, texto) => { if(lote) lote.resultados.push({ arquivo: file.name, situacao, texto }); };
  let motoristaNovo = false;
  let texto = '';
  if(file.type === 'application/pdf'){
    try{ texto = await extrairTextoPdf(file); } catch(e){ texto = ''; }
  }
  let deteccao = detectarTipoDocumento(texto);
  const { data: motoristas } = await sb.from('usuario').select('id, nome').eq('papel', 'motorista').order('nome');
  const { data: veiculos } = await sb.from('veiculo').select('id, placa, grupo').order('placa');
  const { data: calendario } = await sb.from('calendario_licenciamento').select('final_placa, mes');
  let datas = texto ? extrairDatasPossiveis(texto) : [];

  let motoristaSugerido = deteccao.referenteA === 'motorista' ? encontrarMotoristaPorNome(texto, motoristas) : null;
  let veiculoSugerido = deteccao.referenteA === 'veiculo' ? encontrarVeiculoPorPlaca(texto, veiculos) : null;

  // Falta nome/placa ou validade? Documento provavelmente traz os dados só
  // como imagem (ex: CNH Digital) — tenta completar com OCR antes de mostrar
  // a tela de confirmação, pra já vir tudo pronto sempre que possível.
  const faltaInfo = !deteccao.tipo
    || (deteccao.referenteA === 'motorista' && !motoristaSugerido)
    || (deteccao.referenteA === 'veiculo' && !veiculoSugerido)
    || !datas.length;
  let usouOcr = false;
  let categoriaSugerida = null;
  // CNH também passa pelo OCR mesmo com tudo achado: a categoria só sai da imagem
  if(faltaInfo || deteccao.tipo === 'CNH'){
    mostrarStatusOcr(true, 'Lendo o documento com reconhecimento de imagem...');
    const leitura = await ocrArquivoCompleto(file);
    const textoOcr = leitura.texto;
    categoriaSugerida = leitura.categoria;
    mostrarStatusOcr(false);
    if(textoOcr){
      usouOcr = true;
      texto = texto + '\n' + textoOcr;
      deteccao = detectarTipoDocumento(texto);
      datas = extrairDatasPossiveis(texto);
      motoristaSugerido = deteccao.referenteA === 'motorista' ? encontrarMotoristaPorNome(texto, motoristas) : motoristaSugerido;
      veiculoSugerido = deteccao.referenteA === 'veiculo' ? encontrarVeiculoPorPlaca(texto, veiculos) : veiculoSugerido;
    }
  }

  const sugestaoCalendario = veiculoSugerido ? sugerirValidadePorPlaca(veiculoSugerido.placa, calendario) : null;

  // Na CNH, o nº de registro e a validade aparecem em vermelho no cartão —
  // busca eles especificamente pelo rótulo, em vez de só listar tudo que
  // achou, pra vir pronto igual já acontece com placa/nome.
  let numeroSugerido = null, validadeSugerida = null;
  if(deteccao.referenteA === 'motorista' && deteccao.tipo === 'CNH'){
    numeroSugerido = extrairNumeroRegistroCNH(texto);
    validadeSugerida = extrairValidadeCNH(texto);
  }

  // Na CNH quem manda é o CPF: CPF igual ao de um motorista = é ele (mesmo que o
  // nome tenha saído com erro); CPF diferente do motorista achado pelo nome = é
  // outra pessoa (ex.: irmãos com o mesmo sobrenome) — aí trata como motorista novo.
  let cpfConfere = false;
  if(deteccao.referenteA === 'motorista' && deteccao.tipo === 'CNH'){
    const cpfLido = extrairCpfCNH(texto);
    if(cpfLido){
      const digitos = (c) => String(c || '').replace(/\D/g, '');
      const { data: perfis } = await sb.from('motorista_perfil').select('usuario_id, cpf');
      const dono = (perfis || []).find(p => digitos(p.cpf) && digitos(p.cpf) === digitos(cpfLido));
      const motoristaDono = dono && (motoristas || []).find(m => m.id === dono.usuario_id);
      if(motoristaDono){ motoristaSugerido = motoristaDono; cpfConfere = true; }
      else if(motoristaSugerido){
        const perfilAchado = (perfis || []).find(p => p.usuario_id === motoristaSugerido.id);
        if(perfilAchado && digitos(perfilAchado.cpf)) motoristaSugerido = null;
      }
    }
  }

  // Motorista não está cadastrado ainda? Se der pra ler o nome dele direto
  // da CNH, cadastra ele sozinho (login + senha temporária) antes de seguir
  // pro documento — assim já entra tudo de uma vez, do jeito que o Thiago
  // pediu.
  // (a validade não é obrigatória para criar o login: se faltar, é preenchida na conferência)
  let sugestaoNovo = null;
  if(deteccao.referenteA === 'motorista' && deteccao.tipo === 'CNH' && !motoristaSugerido){
    const leituraNome = extrairNomeCNH(texto);
    let nomeCNH = leituraNome ? leituraNome.nome : null;
    let cpfCNH = extrairCpfCNH(texto);
    sugestaoNovo = { nome: nomeCNH, cpf: cpfCNH };
    // Leitura insegura (nome por palpite ou CPF que não fechou a conta)?
    // Pede pro Thiago conferir antes de criar o login.
    let cancelouConferencia = false;
    if(nomeCNH && (!leituraNome.confiavel || !cpfCNH)){
      const conferido = await confirmarDadosNovoMotorista(nomeCNH, cpfCNH, file);
      if(conferido){ nomeCNH = conferido.nome; cpfCNH = conferido.cpf; }
      else cancelouConferencia = true;
    }
    if(cancelouConferencia){
      // Thiago preferiu não cadastrar agora — segue pra confirmação manual.
    } else if(nomeCNH){
      mostrarStatusOcr(true, 'Motorista não encontrado — cadastrando automaticamente...');
      const resultadoCriacao = await criarMotoristaAutomatico(nomeCNH, cpfCNH);
      mostrarStatusOcr(false);
      if(resultadoCriacao.motorista){
        motoristaSugerido = { id: resultadoCriacao.motorista.usuarioId, nome: nomeCNH };
        motoristas.push(motoristaSugerido);
        motoristaNovo = true;
        if(lote) lote.credenciais.push({ nome: nomeCNH, login: resultadoCriacao.motorista.login, senha: resultadoCriacao.motorista.senhaTemporaria });
        else await mostrarCredenciaisNovoMotorista(resultadoCriacao.motorista);
      } else if(resultadoCriacao.error){
        // Não trava o Thiago (segue pra confirmação manual), mas avisa o
        // motivo — assim dá pra saber se é a função que falta publicar, ou
        // outra coisa.
        if(!lote) alert('Não consegui cadastrar o motorista automaticamente: ' + resultadoCriacao.error);
      }
    }
  }

  // Confiança alta o bastante pra cadastrar sozinho, sem precisar perguntar?
  // Só quando o nome bate exato (não só por palavras parecidas), a placa foi
  // encontrada e a validade veio de um jeito confiável — senão, mostra a
  // tela de confirmação pra pessoa conferir/completar.
  const dataBrParaIso = (d) => { if(!d) return null; const [dd, mm, yyyy] = d.split('/'); return `${yyyy}-${mm}-${dd}`; };
  let podeSalvarAutomatico = false;
  let validadeAuto = null;
  if(deteccao.referenteA === 'motorista' && motoristaSugerido && (cpfConfere || nomeBateExato(texto, motoristaSugerido)) && deteccao.tipo && validadeSugerida){
    podeSalvarAutomatico = true;
    validadeAuto = dataBrParaIso(validadeSugerida);
  } else if(deteccao.referenteA === 'veiculo' && veiculoSugerido && deteccao.tipo && (sugestaoCalendario || datas.length === 1)){
    podeSalvarAutomatico = true;
    validadeAuto = dataBrParaIso(sugestaoCalendario || datas[0]);
  }

  if(podeSalvarAutomatico){
    const referenteId = deteccao.referenteA === 'motorista' ? motoristaSugerido.id : veiculoSugerido.id;
    const nomeExibicao = deteccao.referenteA === 'motorista' ? motoristaSugerido.nome : veiculoSugerido.placa;
    const { error, atualizado } = await salvarDocumentoNoBanco({
      referenteA: deteccao.referenteA, referenteId, tipo: deteccao.tipo,
      numero: numeroSugerido, validade: validadeAuto, file
    });
    if(!error){
      if(deteccao.referenteA === 'motorista' && deteccao.tipo === 'CNH') await salvarCategoriaCnh(referenteId, categoriaSugerida);
      const validadeTxt = (validadeAuto ? ` — validade ${fmtData(validadeAuto)}` : '') + (deteccao.tipo === 'CNH' && categoriaSugerida ? `, categoria ${categoriaSugerida}` : '');
      if(lote) registrar(motoristaNovo ? 'novo' : 'ok', motoristaNovo
        ? `Motorista ${nomeExibicao} cadastrado com login; documento ${deteccao.tipo} salvo${validadeTxt}`
        : `Documento ${deteccao.tipo} de ${nomeExibicao} ${atualizado ? 'atualizado' : 'cadastrado'}${validadeTxt}`);
      else { mostrarToast(`✅ ${deteccao.tipo} de ${nomeExibicao} ${atualizado ? 'atualizada' : 'cadastrada automaticamente'}`); loadDocumentos(); }
      return;
    }
    // Deu erro salvando sozinho — não trava o Thiago, cai pra tela de
    // confirmação normal pra ele conseguir salvar na mão.
  }

  if(lote) mostrarStatusOcr(false);
  const sugestaoVeiculo = deteccao.referenteA === 'veiculo' && !veiculoSugerido ? extrairDadosCRLV(texto, file.name) : null;
  const resposta = await mostrarRevisaoDocumento({ file, deteccao, motoristas, veiculos, motoristaSugerido, veiculoSugerido, datas, sugestaoCalendario, usouOcr, numeroSugerido, validadeSugerida, categoriaSugerida, sugestaoNovo: motoristaNovo ? null : sugestaoNovo, sugestaoVeiculo, calendario, lote });
  if(resposta && resposta.criouMotorista) motoristaNovo = true;
  if(lote){
    if(resposta && resposta.salvo) registrar(motoristaNovo ? 'novo' : 'conferido', `${motoristaNovo ? 'Motorista cadastrado com login; ' : ''}conferido na mão e salvo`);
    else registrar('pulado', motoristaNovo ? 'Motorista cadastrado com login, mas o documento não foi salvo (cancelado na conferência)' : 'Pulado na conferência — não foi cadastrado');
  }
}

// Guarda a categoria da CNH no perfil do motorista (só quando foi lida/informada)
async function salvarCategoriaCnh(usuarioId, categoria){
  const cat = String(categoria || '').trim().toUpperCase();
  if(!usuarioId || !/^(ACC|[A-E]{1,3})$/.test(cat)) return;
  await sb.from('motorista_perfil').upsert({ usuario_id: usuarioId, categoria_cnh: cat });
}

function sugerirValidadePorPlaca(placa, calendario){
  if(!placa || !calendario || !calendario.length) return null;
  const digitos = (placa || '').replace(/[^0-9]/g, '');
  if(!digitos.length) return null;
  const finalPlaca = parseInt(digitos[digitos.length - 1], 10);
  const linha = calendario.find(c => c.final_placa === finalPlaca);
  if(!linha) return null;
  const hoje = new Date();
  let ano = hoje.getFullYear();
  let dataFinal = new Date(ano, linha.mes, 0);
  if(dataFinal < hoje){ ano += 1; dataFinal = new Date(ano, linha.mes, 0); }
  const dd = String(dataFinal.getDate()).padStart(2, '0');
  const mm = String(linha.mes).padStart(2, '0');
  return `${dd}/${mm}/${ano}`;
}

// Tela de conferência; devolve uma promessa que resolve com { salvo } quando
// a pessoa salva ou cancela (o envio em lote espera para seguir ao próximo)
function mostrarRevisaoDocumento(ctx){
  return new Promise((resolverRevisao) => montarRevisaoDocumento(ctx, resolverRevisao));
}
function montarRevisaoDocumento(ctx, resolverRevisao){
  const { file, deteccao, motoristas, veiculos, motoristaSugerido, veiculoSugerido, datas, sugestaoCalendario, usouOcr, numeroSugerido, validadeSugerida, categoriaSugerida, sugestaoNovo, sugestaoVeiculo, calendario, lote } = ctx;
  let referenteA = deteccao.referenteA || 'empresa';
  let motoristaEscolhido = motoristaSugerido ? motoristaSugerido.id : '';
  let veiculoEscolhido = veiculoSugerido ? veiculoSugerido.id : '';
  let criouMotorista = false;
  const outrasDatas = validadeSugerida ? datas.filter(d => d !== validadeSugerida) : datas;

  const modalHtml = `
    <div id="uploadModal" style="position:fixed; inset:0; background:rgba(0,0,0,.7); z-index:50; display:flex; align-items:center; justify-content:center; padding:16px;">
      <div class="revisao-caixa">
        <h3 style="margin-top:0;">Confirme o documento${lote ? ` <span class="l2" style="font-weight:400;">· ${esc(file.name)}</span>` : ''}</h3>
        <div class="revisao-grade">
        ${previaDocumentoHtml('revisaoPrevia')}
        <div>
        ${deteccao.tipo
          ? `<div class="l2" style="margin-bottom:14px;">Detectei: <b>${esc(deteccao.tipo)}</b>${motoristaSugerido ? ' de ' + esc(motoristaSugerido.nome) : ''}${veiculoSugerido ? ' do veículo ' + esc(veiculoSugerido.placa) : ''}${(deteccao.referenteA==='motorista' && !motoristaSugerido) || (deteccao.referenteA==='veiculo' && !veiculoSugerido) ? ' — não identifiquei de quem é, selecione abaixo' : ''}${usouOcr ? ' <span class="pill ok" style="margin-left:0;">lido por imagem</span>' : ''}</div>`
          : `<div class="l2" style="margin-bottom:14px;">Não consegui identificar automaticamente este arquivo — preencha abaixo.</div>`}

        <select id="revisaoReferenteA">
          <option value="empresa" ${referenteA==='empresa'?'selected':''}>Documento da empresa</option>
          <option value="motorista" ${referenteA==='motorista'?'selected':''}>Documento de motorista</option>
          <option value="veiculo" ${referenteA==='veiculo'?'selected':''}>Documento de veículo</option>
        </select>

        <div id="revisaoReferenteIdWrap" style="margin-top:10px;"></div>

        <input type="text" id="revisaoTipo" placeholder="Tipo (ex: CNH, CRLV)" value="${esc(deteccao.tipo || '')}" style="margin-top:10px;">
        <input type="text" id="revisaoNumero" placeholder="Número (opcional)" value="${esc(numeroSugerido || '')}" style="margin-top:10px;">
        <div id="revisaoCategoriaWrap" style="margin-top:10px;">
          <input type="text" id="revisaoCategoria" placeholder="Categoria da CNH (ex: AE)" maxlength="3" value="${esc(categoriaSugerida || '')}" style="text-transform:uppercase;">
        </div>

        ${sugestaoCalendario ? `
          <div class="l2" style="margin-top:14px;">Sugestão pelo calendário do Detran (final da placa):</div>
          <button class="ans-btn ok" data-data="${sugestaoCalendario}" style="flex:none; padding:8px 12px; margin-top:6px;" type="button">${sugestaoCalendario}</button>
        ` : ''}
        ${validadeSugerida ? `
          <div class="l2" style="margin-top:14px;">Validade encontrada no documento:</div>
          <button class="ans-btn ok active" data-data="${validadeSugerida}" style="flex:none; padding:8px 12px; margin-top:6px;" type="button">${validadeSugerida}</button>
        ` : ''}
        ${outrasDatas.length ? `
          <div class="l2" style="margin-top:14px;">${validadeSugerida ? 'Outras datas encontradas no arquivo:' : 'Datas encontradas no arquivo — toque na que for a validade:'}</div>
          <div id="revisaoDatas" style="display:flex; flex-wrap:wrap; gap:8px; margin-top:8px;">
            ${outrasDatas.map(d => `<button class="ans-btn" data-data="${d}" style="flex:none; padding:8px 12px;" type="button">${d}</button>`).join('')}
          </div>
        ` : ''}
        <input type="date" id="revisaoValidade" value="${(() => { if(!validadeSugerida) return ''; const [dd,mm,yyyy]=validadeSugerida.split('/'); return `${yyyy}-${mm}-${dd}`; })()}" style="margin-top:10px;">

        <button id="btnSalvarUploadAutomatico" style="margin-top:16px; width:100%;">Salvar documento</button>
        <button class="btn-small" id="btnCancelarUploadAutomatico" style="margin-top:8px; width:100%;">Cancelar</button>
        </div>
        </div>
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', modalHtml);
  montarPreviaDocumento('revisaoPrevia', file);

  // categoria só faz sentido para CNH de motorista
  function atualizarCampoCategoria(){
    const ehCnh = referenteA === 'motorista' && /^cnh$/i.test(document.getElementById('revisaoTipo').value.trim());
    document.getElementById('revisaoCategoriaWrap').style.display = ehCnh ? '' : 'none';
  }
  document.getElementById('revisaoTipo').addEventListener('input', atualizarCampoCategoria);

  function renderReferenteIdSelect(){
    const wrap = document.getElementById('revisaoReferenteIdWrap');
    if(referenteA === 'motorista'){
      wrap.innerHTML = `<select id="revisaoReferenteId">
        <option value="">Selecione o motorista</option>
        <option value="__novo__">+ Cadastrar novo motorista</option>
        ${(motoristas||[]).map(m => `<option value="${m.id}" ${motoristaEscolhido === m.id ? 'selected':''}>${esc(m.nome)}</option>`).join('')}
      </select>`;
      const sel = document.getElementById('revisaoReferenteId');
      sel.addEventListener('change', () => {
        if(sel.value === '__novo__'){ sel.value = motoristaEscolhido; cadastrarNovoMotorista(); }
        else motoristaEscolhido = sel.value;
      });
    } else if(referenteA === 'veiculo'){
      wrap.innerHTML = `<select id="revisaoReferenteId">
        <option value="">Selecione o veículo</option>
        <option value="__novo__">+ Cadastrar novo veículo${sugestaoVeiculo && sugestaoVeiculo.placa ? ' (' + esc(sugestaoVeiculo.placa) + ')' : ''}</option>
        ${(veiculos||[]).map(v => `<option value="${v.id}" ${veiculoEscolhido === v.id ? 'selected':''}>${esc(v.placa)}</option>`).join('')}
      </select>`;
      const sel = document.getElementById('revisaoReferenteId');
      sel.addEventListener('change', () => {
        if(sel.value === '__novo__'){ sel.value = veiculoEscolhido; cadastrarNovoVeiculo(); }
        else veiculoEscolhido = sel.value;
      });
    } else {
      wrap.innerHTML = '';
    }
  }
  // Motorista ainda sem cadastro: cria o login aqui mesmo (nome e CPF já vêm da leitura da CNH)
  async function cadastrarNovoMotorista(){
    const sug = sugestaoNovo || {};
    const dados = await confirmarDadosNovoMotorista(sug.nome || '', sug.cpf || '', file, {
      titulo: 'Cadastrar novo motorista',
      texto: 'Confira o nome completo e o CPF no documento abaixo (dá para dar zoom). O app cria o login e uma senha temporária para o motorista.',
      botao: 'Cadastrar motorista', cancelar: 'Voltar'
    });
    if(!dados) return;
    mostrarStatusOcr(true, 'Cadastrando o motorista...');
    const r = await criarMotoristaAutomatico(dados.nome, dados.cpf);
    mostrarStatusOcr(false);
    if(!r.motorista){ alert('Não consegui cadastrar o motorista: ' + (r.error || 'erro desconhecido')); return; }
    const novo = { id: r.motorista.usuarioId, nome: dados.nome };
    motoristas.push(novo);
    motoristas.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    motoristaEscolhido = novo.id; criouMotorista = true;
    renderReferenteIdSelect();
    if(lote) lote.credenciais.push({ nome: dados.nome, login: r.motorista.login, senha: r.motorista.senhaTemporaria });
    else await mostrarCredenciaisNovoMotorista(r.motorista);
  }

  // Veículo ainda fora da frota: cadastra aqui mesmo (placa, tipo, modelo e ano vêm do CRLV)
  async function cadastrarNovoVeiculo(){
    const novo = await cadastrarVeiculoPeloDocumento(sugestaoVeiculo || {}, veiculos || [], file);
    if(!novo) return;
    veiculos.push(novo);
    veiculos.sort((a, b) => a.placa.localeCompare(b.placa));
    veiculoEscolhido = novo.id;
    renderReferenteIdSelect();
    // CRLV: sem validade escolhida, sugere a do calendário do Detran pelo final da placa
    const campoValidade = document.getElementById('revisaoValidade');
    const sugestao = sugerirValidadePorPlaca(novo.placa, calendario);
    if(sugestao && !campoValidade.value && /crlv|licenciamento/i.test(document.getElementById('revisaoTipo').value)){
      const [dd, mm, yyyy] = sugestao.split('/');
      campoValidade.value = `${yyyy}-${mm}-${dd}`;
      mostrarToast(`Validade sugerida pelo calendário do Detran: ${sugestao}`);
    }
  }

  renderReferenteIdSelect();
  atualizarCampoCategoria();

  document.getElementById('revisaoReferenteA').addEventListener('change', (e) => { referenteA = e.target.value; renderReferenteIdSelect(); atualizarCampoCategoria(); });
  document.querySelectorAll('[data-data]').forEach(btn => btn.addEventListener('click', () => {
    const [dd, mm, yyyy] = btn.dataset.data.split('/');
    document.getElementById('revisaoValidade').value = `${yyyy}-${mm}-${dd}`;
    document.querySelectorAll('[data-data]').forEach(b => b.classList.remove('active', 'ok'));
    btn.classList.add('active', 'ok');
  }));

  function fechar(salvo = false){ const m = document.getElementById('uploadModal'); if(m) m.remove(); resolverRevisao({ salvo, criouMotorista }); }
  document.getElementById('btnCancelarUploadAutomatico').addEventListener('click', () => fechar(false));

  document.getElementById('btnSalvarUploadAutomatico').addEventListener('click', async () => {
    const btn = document.getElementById('btnSalvarUploadAutomatico');
    const referenteIdEl = document.getElementById('revisaoReferenteId');
    const referenteId = referenteA === 'empresa' ? usuarioAtual.transportadora_id : (referenteIdEl ? referenteIdEl.value : null);
    const tipo = document.getElementById('revisaoTipo').value.trim();
    const numero = document.getElementById('revisaoNumero').value.trim();
    const validade = document.getElementById('revisaoValidade').value;
    const ehCnh = referenteA === 'motorista' && /^cnh$/i.test(tipo);
    const categoria = ehCnh ? document.getElementById('revisaoCategoria').value.trim().toUpperCase() : '';

    if(!tipo){ alert('Informe o tipo do documento.'); return; }
    if(referenteA !== 'empresa' && !referenteId){ alert('Selecione a quem este documento pertence.'); return; }
    if(categoria && !/^(ACC|[A-E]{1,3})$/.test(categoria)){ alert('Categoria inválida — use letras de A a E (ex: AE, D, B).'); return; }

    btn.disabled = true; btn.textContent = 'Salvando...';

    const { error, docId } = await salvarDocumentoNoBanco({ referenteA, referenteId, tipo, numero, validade, file });

    if(error && !docId){ alert('Erro ao criar o documento: ' + error.message); btn.disabled = false; btn.textContent = 'Salvar documento'; return; }
    if(ehCnh && categoria) await salvarCategoriaCnh(referenteId, categoria);
    if(error){ alert('Documento criado, mas não consegui enviar o arquivo: ' + error.message); fechar(true); if(!lote) loadDocumentos(); return; }

    fechar(true);
    if(!lote) loadDocumentos();
  });
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
