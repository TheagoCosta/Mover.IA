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

async function loadDocumentos(){
  if(documentosSubtela === 'manual'){ loadDocumentosManual(); return; }

  const { data: docsEmpresa, error } = await sb.from('documento').select('id, tipo, numero, validade, status, arquivo_url, qr_conteudo').eq('referente_a', 'empresa').order('tipo');
  const { data: docsMotorista } = await sb.from('documento').select('id, tipo, numero, validade, status, arquivo_url, qr_conteudo, referente_id').eq('referente_a', 'motorista').order('tipo');
  const { data: docsVeiculo } = await sb.from('documento').select('id, tipo, numero, validade, status, arquivo_url, qr_conteudo, referente_id').eq('referente_a', 'veiculo').order('tipo');
  const { data: motoristas } = await sb.from('usuario').select('id, nome').eq('papel', 'motorista').order('nome');
  const { data: veiculos } = await sb.from('veiculo').select('id, placa').order('placa');

  const el = document.getElementById('screenContent');
  if(error){ el.innerHTML = `<div class="status">Erro ao carregar documentos: ${error.message}</div>`; return; }

  const motoristaNome = Object.fromEntries((motoristas||[]).map(m => [m.id, m.nome]));
  const veiculoPlaca = Object.fromEntries((veiculos||[]).map(v => [v.id, v.placa]));
  const todosDocs = [...(docsEmpresa||[]), ...(docsMotorista||[]), ...(docsVeiculo||[])];

  el.innerHTML = `
    <div class="card clickable" id="btnAdicionarDocumentoAuto" style="border:2px dashed var(--line-yellow-dim); text-align:center;">
      <div class="l1" style="justify-content:center;">📎 Arraste o arquivo aqui</div>
      <div class="l2">ou toque para selecionar (PDF de CNH, CRLV etc. — o app descobre sozinho de quem é)</div>
    </div>

    <h3>Documentos da empresa (${(docsEmpresa||[]).length})</h3>
    ${(docsEmpresa||[]).map(d => cardDocumento(d)).join('') || '<div class="status">Nenhum documento cadastrado</div>'}

    <h3>Documentos de motoristas (${(docsMotorista||[]).length})</h3>
    ${(docsMotorista||[]).map(d => cardDocumento(d, motoristaNome[d.referente_id] || '—')).join('') || '<div class="status">Nenhum documento cadastrado ainda</div>'}

    <h3>Documentos de veículos (${(docsVeiculo||[]).length})</h3>
    ${(docsVeiculo||[]).map(d => cardDocumento(d, veiculoPlaca[d.referente_id] || '—')).join('') || '<div class="status">Nenhum documento cadastrado ainda</div>'}

    <div class="card clickable" id="btnCadastrarManual">
      <div class="l1">Cadastrar documento manualmente</div>
      <div class="l2">Para quando o app não conseguir identificar sozinho</div>
    </div>
  `;

  const dropArea = document.getElementById('btnAdicionarDocumentoAuto');
  dropArea.addEventListener('click', abrirUploadAutomatico);
  dropArea.addEventListener('dragover', (e) => { e.preventDefault(); dropArea.style.borderColor = 'var(--line-yellow)'; });
  dropArea.addEventListener('dragleave', () => { dropArea.style.borderColor = 'var(--line-yellow-dim)'; });
  dropArea.addEventListener('drop', (e) => {
    e.preventDefault();
    dropArea.style.borderColor = 'var(--line-yellow-dim)';
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    if(file) processarUploadAutomatico(file);
  });

  document.getElementById('btnCadastrarManual').addEventListener('click', () => { documentosSubtela = 'manual'; loadDocumentos(); });
  el.querySelectorAll('[data-ver]').forEach(btn => btn.addEventListener('click', () => verArquivo(btn.dataset.ver, todosDocs)));
  el.querySelectorAll('[data-anexar]').forEach(inp => inp.addEventListener('change', (e) => anexarArquivoComLeitura(inp.dataset.anexar, e.target.files[0], loadDocumentos)));
  el.querySelectorAll('[data-qr]').forEach(btn => btn.addEventListener('click', () => abrirScannerQR(btn.dataset.qr, loadDocumentos)));
}

async function loadDocumentosManual(){
  const { data: motoristas } = await sb.from('usuario').select('id, nome').eq('papel', 'motorista').order('nome');
  const { data: veiculos } = await sb.from('veiculo').select('id, placa').order('placa');
  const el = document.getElementById('screenContent');

  el.innerHTML = `
    <button class="backbtn" id="btnVoltarManual">← Voltar</button>
    <h3>Documento de motorista</h3>
    <div class="card">
      <form id="formNovoDocMotorista">
        <select id="docMotoristaSelect" required>
          <option value="">Selecione o motorista</option>
          ${(motoristas||[]).map(m => `<option value="${m.id}">${m.nome}</option>`).join('')}
        </select>
        <input type="text" id="docMotoristaTipo" placeholder="Tipo (ex: CNH, Exame toxicológico)" required>
        <input type="text" id="docMotoristaNumero" placeholder="Número (opcional)">
        <input type="date" id="docMotoristaValidade">
        <select id="docMotoristaStatus">
          <option value="ok">Em dia</option>
          <option value="vence_em_breve">Vence em breve</option>
          <option value="vencido">Vencido</option>
        </select>
        <button type="submit">Adicionar documento de motorista</button>
      </form>
    </div>

    <h3>Documento de veículo</h3>
    <div class="card">
      <form id="formNovoDocVeiculo">
        <select id="docVeiculoSelect" required>
          <option value="">Selecione o veículo</option>
          ${(veiculos||[]).map(v => `<option value="${v.id}">${v.placa}</option>`).join('')}
        </select>
        <input type="text" id="docVeiculoTipo" placeholder="Tipo (ex: CRLV, Licenciamento)" required>
        <input type="text" id="docVeiculoNumero" placeholder="Número (opcional)">
        <input type="date" id="docVeiculoValidade">
        <select id="docVeiculoStatus">
          <option value="ok">Em dia</option>
          <option value="vence_em_breve">Vence em breve</option>
          <option value="vencido">Vencido</option>
        </select>
        <button type="submit">Adicionar documento de veículo</button>
      </form>
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
  if(typeof pdfjsLib === 'undefined') return '';
  if(!pdfjsLib.GlobalWorkerOptions.workerSrc){
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
  }
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
  if(file.type === 'application/pdf'){
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
  const palavrasTexto = new Set(normalizarPalavras(texto));
  const candidatos = (motoristas || []).map(m => {
    const palavrasNome = normalizarPalavras(m.nome).filter(p => p.length >= 3);
    if(!palavrasNome.length) return null;
    const acertos = palavrasNome.filter(p => palavrasTexto.has(p)).length;
    return { motorista: m, acertos, total: palavrasNome.length };
  }).filter(c => c && c.acertos >= Math.max(2, Math.ceil(c.total * 0.6)));

  candidatos.sort((a, b) => b.acertos - a.acertos);
  if(candidatos.length === 1) return candidatos[0].motorista;
  if(candidatos.length > 1 && candidatos[0].acertos > candidatos[1].acertos) return candidatos[0].motorista;
  return null;
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
  input.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if(file) await processarUploadAutomatico(file);
  });
  input.click();
}

function mostrarStatusOcr(mostrar, mensagem){
  let el = document.getElementById('ocrStatus');
  if(mostrar){
    if(!el){
      el = document.createElement('div');
      el.id = 'ocrStatus';
      el.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,.8); z-index:60; display:flex; align-items:center; justify-content:center; padding:24px;';
      document.body.appendChild(el);
    }
    el.innerHTML = `<div style="text-align:center; color:var(--text-primary);">🔍 ${mensagem || 'Lendo o documento...'}<br><span style="color:var(--text-secondary); font-size:12.5px;">Isso pode levar alguns segundos</span></div>`;
  } else if(el){
    el.remove();
  }
}

function mostrarToast(mensagem){
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed; left:16px; right:16px; bottom:20px; background:#3fb27f; color:#0d1f16; font-weight:700; font-size:13.5px; padding:14px 16px; border-radius:12px; z-index:70; text-align:center; box-shadow:0 6px 20px rgba(0,0,0,.35);';
  el.textContent = mensagem;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

// Insere o documento no banco e sobe o arquivo — usado tanto quando a
// pessoa confirma manualmente no cartão de revisão quanto quando o app
// tem certeza suficiente pra cadastrar sozinho, sem perguntar nada.
async function salvarDocumentoNoBanco({ referenteA, referenteId, tipo, numero, validade, file }){
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

async function processarUploadAutomatico(file){
  let texto = '';
  if(file.type === 'application/pdf'){
    try{ texto = await extrairTextoPdf(file); } catch(e){ texto = ''; }
  }
  let deteccao = detectarTipoDocumento(texto);
  const { data: motoristas } = await sb.from('usuario').select('id, nome').eq('papel', 'motorista').order('nome');
  const { data: veiculos } = await sb.from('veiculo').select('id, placa').order('placa');
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
  if(faltaInfo){
    mostrarStatusOcr(true, 'Lendo o documento com reconhecimento de imagem...');
    const textoOcr = await ocrArquivo(file);
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

  // Motorista não está cadastrado ainda? Se der pra ler o nome dele direto
  // da CNH, cadastra ele sozinho (login + senha temporária) antes de seguir
  // pro documento — assim já entra tudo de uma vez, do jeito que o Thiago
  // pediu.
  if(deteccao.referenteA === 'motorista' && deteccao.tipo === 'CNH' && !motoristaSugerido){
    const leituraNome = extrairNomeCNH(texto);
    let nomeCNH = leituraNome ? leituraNome.nome : null;
    let cpfCNH = extrairCpfCNH(texto);
    // Leitura insegura (nome por palpite ou CPF que não fechou a conta)?
    // Pede pro Thiago conferir antes de criar o login.
    let cancelouConferencia = false;
    if(nomeCNH && validadeSugerida && (!leituraNome.confiavel || !cpfCNH)){
      const conferido = await confirmarDadosNovoMotorista(nomeCNH, cpfCNH);
      if(conferido){ nomeCNH = conferido.nome; cpfCNH = conferido.cpf; }
      else cancelouConferencia = true;
    }
    if(cancelouConferencia){
      // Thiago preferiu não cadastrar agora — segue pra confirmação manual.
    } else if(nomeCNH && validadeSugerida){
      mostrarStatusOcr(true, 'Motorista não encontrado — cadastrando automaticamente...');
      const resultadoCriacao = await criarMotoristaAutomatico(nomeCNH, cpfCNH);
      mostrarStatusOcr(false);
      if(resultadoCriacao.motorista){
        motoristaSugerido = { id: resultadoCriacao.motorista.usuarioId, nome: nomeCNH };
        motoristas.push(motoristaSugerido);
        await mostrarCredenciaisNovoMotorista(resultadoCriacao.motorista);
      } else if(resultadoCriacao.error){
        // Não trava o Thiago (segue pra confirmação manual), mas avisa o
        // motivo — assim dá pra saber se é a função que falta publicar, ou
        // outra coisa.
        alert('Não consegui cadastrar o motorista automaticamente: ' + resultadoCriacao.error);
      }
    } else {
      const motivo = !nomeCNH ? 'o nome' : 'a validade';
      alert('Não consegui ler ' + motivo + ' deste motorista automaticamente pra cadastrar ele sozinho — selecione manualmente abaixo (ou complete os dados e cadastre-o pela tela de Documentos > Cadastrar documentos > motorista).');
    }
  }

  // Confiança alta o bastante pra cadastrar sozinho, sem precisar perguntar?
  // Só quando o nome bate exato (não só por palavras parecidas), a placa foi
  // encontrada e a validade veio de um jeito confiável — senão, mostra a
  // tela de confirmação pra pessoa conferir/completar.
  const dataBrParaIso = (d) => { if(!d) return null; const [dd, mm, yyyy] = d.split('/'); return `${yyyy}-${mm}-${dd}`; };
  let podeSalvarAutomatico = false;
  let validadeAuto = null;
  if(deteccao.referenteA === 'motorista' && motoristaSugerido && nomeBateExato(texto, motoristaSugerido) && deteccao.tipo && validadeSugerida){
    podeSalvarAutomatico = true;
    validadeAuto = dataBrParaIso(validadeSugerida);
  } else if(deteccao.referenteA === 'veiculo' && veiculoSugerido && deteccao.tipo && (sugestaoCalendario || datas.length === 1)){
    podeSalvarAutomatico = true;
    validadeAuto = dataBrParaIso(sugestaoCalendario || datas[0]);
  }

  if(podeSalvarAutomatico){
    const referenteId = deteccao.referenteA === 'motorista' ? motoristaSugerido.id : veiculoSugerido.id;
    const nomeExibicao = deteccao.referenteA === 'motorista' ? motoristaSugerido.nome : veiculoSugerido.placa;
    const { error } = await salvarDocumentoNoBanco({
      referenteA: deteccao.referenteA, referenteId, tipo: deteccao.tipo,
      numero: numeroSugerido, validade: validadeAuto, file
    });
    if(!error){
      mostrarToast(`✅ ${deteccao.tipo} de ${nomeExibicao} cadastrado automaticamente`);
      loadDocumentos();
      return;
    }
    // Deu erro salvando sozinho — não trava o Thiago, cai pra tela de
    // confirmação normal pra ele conseguir salvar na mão.
  }

  mostrarRevisaoDocumento({ file, deteccao, motoristas, veiculos, motoristaSugerido, veiculoSugerido, datas, sugestaoCalendario, usouOcr, numeroSugerido, validadeSugerida });
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

function mostrarRevisaoDocumento(ctx){
  const { file, deteccao, motoristas, veiculos, motoristaSugerido, veiculoSugerido, datas, sugestaoCalendario, usouOcr, numeroSugerido, validadeSugerida } = ctx;
  let referenteA = deteccao.referenteA || 'empresa';
  const outrasDatas = validadeSugerida ? datas.filter(d => d !== validadeSugerida) : datas;

  const modalHtml = `
    <div id="uploadModal" style="position:fixed; inset:0; background:rgba(0,0,0,.7); z-index:50; display:flex; align-items:flex-end;">
      <div style="background:var(--asphalt-900); width:100%; border-radius:16px 16px 0 0; padding:20px; max-height:85vh; overflow:auto;">
        <h3 style="margin-top:0;">Confirme o documento</h3>
        ${deteccao.tipo
          ? `<div class="l2" style="margin-bottom:14px;">Detectei: <b>${deteccao.tipo}</b>${motoristaSugerido ? ' de ' + motoristaSugerido.nome : ''}${veiculoSugerido ? ' do veículo ' + veiculoSugerido.placa : ''}${(deteccao.referenteA==='motorista' && !motoristaSugerido) || (deteccao.referenteA==='veiculo' && !veiculoSugerido) ? ' — não identifiquei de quem é, selecione abaixo' : ''}${usouOcr ? ' <span class="pill ok" style="margin-left:0;">lido por imagem</span>' : ''}</div>`
          : `<div class="l2" style="margin-bottom:14px;">Não consegui identificar automaticamente este arquivo — preencha abaixo.</div>`}

        <select id="revisaoReferenteA">
          <option value="empresa" ${referenteA==='empresa'?'selected':''}>Documento da empresa</option>
          <option value="motorista" ${referenteA==='motorista'?'selected':''}>Documento de motorista</option>
          <option value="veiculo" ${referenteA==='veiculo'?'selected':''}>Documento de veículo</option>
        </select>

        <div id="revisaoReferenteIdWrap" style="margin-top:10px;"></div>

        <input type="text" id="revisaoTipo" placeholder="Tipo (ex: CNH, CRLV)" value="${deteccao.tipo || ''}" style="margin-top:10px;">
        <input type="text" id="revisaoNumero" placeholder="Número (opcional)" value="${numeroSugerido || ''}" style="margin-top:10px;">

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
    </div>`;
  document.body.insertAdjacentHTML('beforeend', modalHtml);

  function renderReferenteIdSelect(){
    const wrap = document.getElementById('revisaoReferenteIdWrap');
    if(referenteA === 'motorista'){
      wrap.innerHTML = `<select id="revisaoReferenteId">
        <option value="">Selecione o motorista</option>
        ${(motoristas||[]).map(m => `<option value="${m.id}" ${motoristaSugerido && motoristaSugerido.id===m.id ? 'selected':''}>${m.nome}</option>`).join('')}
      </select>`;
    } else if(referenteA === 'veiculo'){
      wrap.innerHTML = `<select id="revisaoReferenteId">
        <option value="">Selecione o veículo</option>
        ${(veiculos||[]).map(v => `<option value="${v.id}" ${veiculoSugerido && veiculoSugerido.id===v.id ? 'selected':''}>${v.placa}</option>`).join('')}
      </select>`;
    } else {
      wrap.innerHTML = '';
    }
  }
  renderReferenteIdSelect();

  document.getElementById('revisaoReferenteA').addEventListener('change', (e) => { referenteA = e.target.value; renderReferenteIdSelect(); });
  document.querySelectorAll('[data-data]').forEach(btn => btn.addEventListener('click', () => {
    const [dd, mm, yyyy] = btn.dataset.data.split('/');
    document.getElementById('revisaoValidade').value = `${yyyy}-${mm}-${dd}`;
    document.querySelectorAll('[data-data]').forEach(b => b.classList.remove('active', 'ok'));
    btn.classList.add('active', 'ok');
  }));

  function fechar(){ const m = document.getElementById('uploadModal'); if(m) m.remove(); }
  document.getElementById('btnCancelarUploadAutomatico').addEventListener('click', fechar);

  document.getElementById('btnSalvarUploadAutomatico').addEventListener('click', async () => {
    const btn = document.getElementById('btnSalvarUploadAutomatico');
    const referenteIdEl = document.getElementById('revisaoReferenteId');
    const referenteId = referenteA === 'empresa' ? usuarioAtual.transportadora_id : (referenteIdEl ? referenteIdEl.value : null);
    const tipo = document.getElementById('revisaoTipo').value.trim();
    const numero = document.getElementById('revisaoNumero').value.trim();
    const validade = document.getElementById('revisaoValidade').value;

    if(!tipo){ alert('Informe o tipo do documento.'); return; }
    if(referenteA !== 'empresa' && !referenteId){ alert('Selecione a quem este documento pertence.'); return; }

    btn.disabled = true; btn.textContent = 'Salvando...';

    const { error, docId } = await salvarDocumentoNoBanco({ referenteA, referenteId, tipo, numero, validade, file });

    if(error && !docId){ alert('Erro ao criar o documento: ' + error.message); btn.disabled = false; btn.textContent = 'Salvar documento'; return; }
    if(error){ alert('Documento criado, mas não consegui enviar o arquivo: ' + error.message); fechar(); loadDocumentos(); return; }

    fechar();
    loadDocumentos();
  });
}

async function verArquivo(docId, docs){
  const doc = (docs||[]).find(d => String(d.id) === String(docId));
  if(!doc || !doc.arquivo_url) return;
  const { data, error } = await sb.storage.from('documentos').createSignedUrl(doc.arquivo_url, 300);
  if(error){ alert('Erro ao abrir arquivo: ' + error.message); return; }
  window.open(data.signedUrl, '_blank');
}
