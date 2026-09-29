// MOVER.IA — app do motorista: conjunto, jornada, viagem, abastecimento, documentos e checklist
// (arquivo carregado pelo index.html; todas as funções ficam globais,
// então um arquivo pode chamar funções dos outros normalmente)

let meuConjunto = null;
let motoristaScreen = 'home';
let motoristaTab = 'inicio';
let chkAnswers = {};
let chkObs = {};

async function carregarMeuConjunto(){
  if(meuConjunto !== null) return meuConjunto;
  const { data: conjuntos } = await sb
    .from('conjunto')
    .select('id, conjunto_item(ordem, veiculo_id, veiculo:veiculo_id(placa, tipo))')
    .eq('motorista_id', session.user.id);
  meuConjunto = (conjuntos && conjuntos[0]) || false;
  return meuConjunto;
}

const MOTIVOS_PARADA = [
  'Parado na garagem',
  'Parada no posto',
  'Chegada no local de carregamento',
  'Em carregamento',
  'Chegada no local de descarga',
  'Em descarga',
  'Pausa para alimentação',
  'Pausa para manutenção',
  'Outro'
];

let jornadaEmEdicaoId = null;
let motivoSelecionado = null;
let jornadaDetalheId = null;

async function carregarJornadaAtiva(){
  const { data } = await sb.from('jornada')
    .select('id, inicio, status')
    .eq('motorista_id', session.user.id)
    .neq('status', 'encerrada')
    .order('inicio', { ascending: false })
    .limit(1);
  const jornada = (data && data[0]) || null;
  if(jornada && jornada.status === 'pausada'){
    const { data: ultimoEvento } = await sb.from('jornada_evento')
      .select('motivo')
      .eq('jornada_id', jornada.id)
      .eq('tipo', 'pausa')
      .order('criado_em', { ascending: false })
      .limit(1);
    jornada.motivoAtual = (ultimoEvento && ultimoEvento[0] && ultimoEvento[0].motivo) || null;
  }
  return jornada;
}

const jornadaStatusLabel = { ativa: 'Em andamento', pausada: 'Pausada' };

function jornadaBotoes(jornada){
  if(!jornada) return `<button id="btnJornadaIniciar" style="margin-top:14px; width:100%;">Iniciar jornada</button>`;
  if(jornada.status === 'ativa') return `
    <div class="ans-row">
      <button class="ans-btn" id="btnJornadaPausar" style="flex:1;">Registrar parada</button>
      <button class="ans-btn bad" id="btnJornadaEncerrar" style="flex:1;">Encerrar</button>
    </div>`;
  return `
    <div class="ans-row">
      <button class="ans-btn ok" id="btnJornadaRetomar" style="flex:1;">Retomar</button>
      <button class="ans-btn bad" id="btnJornadaEncerrar" style="flex:1;">Encerrar</button>
    </div>`;
}

function attachJornadaHandlers(jornada){
  const ini = document.getElementById('btnJornadaIniciar');
  if(ini) ini.addEventListener('click', iniciarJornada);
  const pausar = document.getElementById('btnJornadaPausar');
  if(pausar) pausar.addEventListener('click', () => { jornadaEmEdicaoId = jornada.id; motoristaScreen = 'jornadaPausa'; loadShellMotorista(); });
  const retomar = document.getElementById('btnJornadaRetomar');
  if(retomar) retomar.addEventListener('click', () => atualizarJornada(jornada.id, 'ativa', 'retomada'));
  const encerrar = document.getElementById('btnJornadaEncerrar');
  if(encerrar) encerrar.addEventListener('click', () => { jornadaEmEdicaoId = jornada.id; motoristaScreen = 'jornadaEncerrar'; loadShellMotorista(); });
}

async function iniciarJornada(){
  const { data, error } = await sb.from('jornada').insert({
    transportadora_id: usuarioAtual.transportadora_id,
    motorista_id: session.user.id,
    status: 'ativa'
  }).select('id').single();
  if(error){ alert('Erro ao iniciar jornada: ' + error.message); return; }
  await sb.from('jornada_evento').insert({ jornada_id: data.id, tipo: 'inicio' });
  loadShellMotorista();
}

async function atualizarJornada(jornadaId, novoStatus, tipoEvento){
  const { error } = await sb.from('jornada').update({ status: novoStatus }).eq('id', jornadaId);
  if(error){ alert('Erro: ' + error.message); return; }
  await sb.from('jornada_evento').insert({ jornada_id: jornadaId, tipo: tipoEvento });
  loadShellMotorista();
}

async function loadJornadaPausa(){
  app.innerHTML = `
    <div class="wrap">
      <div class="top">
        <div>
          <button class="backbtn" id="btnVoltar">← Voltar</button>
          <div class="co">Registrar parada</div>
        </div>
        <button class="sair" id="btnSair">Sair</button>
      </div>
      <div class="content">
        <h3>O que está acontecendo?</h3>
        <div class="card" style="padding:2px 14px;">
          ${MOTIVOS_PARADA.map(m => `
            <div class="list-item" data-motivo="${m}">
              <div class="li-body"><div class="li-title">${m}</div></div>
              <div class="chev">${motivoSelecionado===m?'✓':'›'}</div>
            </div>
          `).join('')}
        </div>
        <h3>Observação (opcional)</h3>
        <div class="card">
          <textarea id="pausaObs" rows="3" placeholder="Detalhe o motivo, se precisar" style="width:100%; background:var(--asphalt-800); border:1px solid var(--border); color:var(--text-primary); border-radius:10px; padding:12px; font-size:14px; font-family:inherit; resize:vertical;"></textarea>
        </div>
        <button id="btnConfirmarPausa" ${motivoSelecionado?'':'disabled'}>Confirmar parada</button>
      </div>
    </div>`;
  document.getElementById('btnSair').addEventListener('click', doLogout);
  document.getElementById('btnVoltar').addEventListener('click', () => { motivoSelecionado = null; motoristaScreen = 'home'; loadShellMotorista(); });
  document.querySelectorAll('.list-item[data-motivo]').forEach(el => el.addEventListener('click', () => {
    motivoSelecionado = el.dataset.motivo;
    loadJornadaPausa();
  }));
  const btn = document.getElementById('btnConfirmarPausa');
  if(btn) btn.addEventListener('click', confirmarPausa);
}

async function confirmarPausa(){
  const btn = document.getElementById('btnConfirmarPausa');
  btn.disabled = true; btn.textContent = 'Salvando...';
  const obs = document.getElementById('pausaObs').value.trim();

  const { error } = await sb.from('jornada').update({ status: 'pausada' }).eq('id', jornadaEmEdicaoId);
  if(error){ alert('Erro ao registrar parada: ' + error.message); btn.disabled = false; btn.textContent = 'Confirmar parada'; return; }
  await sb.from('jornada_evento').insert({ jornada_id: jornadaEmEdicaoId, tipo: 'pausa', motivo: motivoSelecionado, observacao: obs || null });

  motivoSelecionado = null;
  motoristaScreen = 'home';
  loadShellMotorista();
}

async function loadJornadaEncerrar(){
  app.innerHTML = `
    <div class="wrap">
      <div class="top">
        <div>
          <button class="backbtn" id="btnVoltar">← Voltar</button>
          <div class="co">Encerrar jornada</div>
        </div>
        <button class="sair" id="btnSair">Sair</button>
      </div>
      <div class="content">
        <h3>Observação final (opcional)</h3>
        <div class="card">
          <textarea id="encerrarObs" rows="3" placeholder="Alguma observação sobre a jornada?" style="width:100%; background:var(--asphalt-800); border:1px solid var(--border); color:var(--text-primary); border-radius:10px; padding:12px; font-size:14px; font-family:inherit; resize:vertical;"></textarea>
        </div>
        <h3>Assinatura do motorista</h3>
        <div class="card" style="padding:10px;">
          <canvas id="canvasAssinatura" style="width:100%; height:160px; background:var(--asphalt-700); border-radius:8px; touch-action:none; display:block;"></canvas>
          <button class="btn-small" id="btnLimparAssinatura" style="margin-top:8px;">Limpar assinatura</button>
        </div>
        <button id="btnConfirmarEncerramento" disabled>Confirmar e encerrar jornada</button>
      </div>
    </div>`;
  document.getElementById('btnSair').addEventListener('click', doLogout);
  document.getElementById('btnVoltar').addEventListener('click', () => { motoristaScreen = 'home'; loadShellMotorista(); });

  const canvas = document.getElementById('canvasAssinatura');
  const ctx = canvas.getContext('2d');
  function ajustarCanvas(){
    const rect = canvas.getBoundingClientRect();
    const escala = window.devicePixelRatio || 1;
    canvas.width = rect.width * escala;
    canvas.height = rect.height * escala;
    ctx.scale(escala, escala);
    ctx.strokeStyle = '#edeef0';
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
  }
  ajustarCanvas();

  let desenhando = false;
  function posicaoNoCanvas(e){
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }
  canvas.addEventListener('pointerdown', e => {
    desenhando = true;
    document.getElementById('btnConfirmarEncerramento').disabled = false;
    const p = posicaoNoCanvas(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  });
  canvas.addEventListener('pointermove', e => {
    if(!desenhando) return;
    const p = posicaoNoCanvas(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  });
  window.addEventListener('pointerup', () => { desenhando = false; });

  document.getElementById('btnLimparAssinatura').addEventListener('click', () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    document.getElementById('btnConfirmarEncerramento').disabled = true;
  });

  document.getElementById('btnConfirmarEncerramento').addEventListener('click', () => confirmarEncerramento(canvas));
}

async function confirmarEncerramento(canvas){
  const btn = document.getElementById('btnConfirmarEncerramento');
  btn.disabled = true; btn.textContent = 'Salvando...';
  const obs = document.getElementById('encerrarObs').value.trim();
  const assinaturaBase64 = canvas.toDataURL('image/png');

  const { error } = await sb.from('jornada').update({
    status: 'encerrada',
    fim: new Date().toISOString(),
    assinatura_base64: assinaturaBase64,
    assinado_em: new Date().toISOString()
  }).eq('id', jornadaEmEdicaoId);
  if(error){ alert('Erro ao encerrar jornada: ' + error.message); btn.disabled = false; btn.textContent = 'Confirmar e encerrar jornada'; return; }
  await sb.from('jornada_evento').insert({ jornada_id: jornadaEmEdicaoId, tipo: 'fim', observacao: obs || null });

  motoristaScreen = 'home';
  loadShellMotorista();
}

async function carregarViagemAtual(){
  const { data } = await sb.from('viagem')
    .select('id, origem, destino, cte_numero, mdfe_numero, status')
    .eq('motorista_id', session.user.id)
    .eq('status', 'em_andamento')
    .order('criado_em', { ascending: false })
    .limit(1);
  return (data && data[0]) || null;
}

async function finalizarViagem(viagemId){
  const { error } = await sb.from('viagem').update({ status: 'concluida' }).eq('id', viagemId);
  if(error){ alert('Erro ao finalizar viagem: ' + error.message); return; }
  loadShellMotorista();
}

async function loadAbastecimentoMotorista(){
  const conjunto = await carregarMeuConjunto();
  const cavalo = conjunto ? [...conjunto.conjunto_item].find(ci => ci.ordem === 1) : null;

  const { data: historico } = await sb.from('abastecimento')
    .select('id, data, km, litros, media_calculada')
    .eq('motorista_id', session.user.id)
    .order('data', { ascending: false })
    .limit(10);

  app.innerHTML = `
    <div class="wrap">
      <div class="top">
        <div>
          <button class="backbtn" id="btnVoltar">← Voltar</button>
          <div class="co">Abastecimento</div>
        </div>
        <button class="sair" id="btnSair">Sair</button>
      </div>
      <div class="content">
        <h3>Registrar abastecimento</h3>
        <div class="card">
          ${cavalo ? `
            <form id="formAbastecimento">
              <input type="number" step="0.1" inputmode="decimal" id="abKm" placeholder="Km do veículo" required>
              <input type="number" step="0.01" inputmode="decimal" id="abLitros" placeholder="Litros abastecidos" required>
              <input type="number" step="0.1" inputmode="decimal" id="abOdometro" placeholder="Odômetro da bomba (opcional)">
              <button type="submit">Salvar abastecimento</button>
            </form>
          ` : '<div class="status">Você precisa estar vinculado a um conjunto para registrar abastecimento</div>'}
        </div>

        <h3>Últimos abastecimentos</h3>
        ${(historico||[]).map(a => `
          <div class="card">
            <div class="l1">${new Date(a.data).toLocaleDateString('pt-BR')}${a.media_calculada ? `<span class="pill ok">${Number(a.media_calculada).toFixed(2)} km/l</span>` : ''}</div>
            <div class="l2">${a.km} km · ${a.litros} L</div>
          </div>
        `).join('') || '<div class="status">Nenhum abastecimento registrado ainda</div>'}
      </div>
    </div>`;

  document.getElementById('btnSair').addEventListener('click', doLogout);
  document.getElementById('btnVoltar').addEventListener('click', () => { motoristaScreen = 'home'; loadShellMotorista(); });
  const form = document.getElementById('formAbastecimento');
  if(form) form.addEventListener('submit', (e) => salvarAbastecimento(e, cavalo.veiculo_id));
}

async function salvarAbastecimento(e, veiculoId){
  e.preventDefault();
  const btn = e.target.querySelector('button');
  btn.disabled = true; btn.textContent = 'Salvando...';

  const km = parseFloat(document.getElementById('abKm').value);
  const litros = parseFloat(document.getElementById('abLitros').value);
  const odometroVal = document.getElementById('abOdometro').value;
  const odometro = odometroVal ? parseFloat(odometroVal) : null;

  const { data: anterior } = await sb.from('abastecimento')
    .select('km')
    .eq('veiculo_id', veiculoId)
    .order('data', { ascending: false })
    .limit(1);

  let media = null;
  if(anterior && anterior[0] && km > anterior[0].km && litros > 0){
    media = (km - anterior[0].km) / litros;
  }

  const { error } = await sb.from('abastecimento').insert({
    transportadora_id: usuarioAtual.transportadora_id,
    motorista_id: session.user.id,
    veiculo_id: veiculoId,
    km,
    litros,
    odometro_bomba: odometro,
    media_calculada: media
  });

  if(error){ alert('Erro ao salvar abastecimento: ' + error.message); btn.disabled = false; btn.textContent = 'Salvar abastecimento'; return; }

  alert(media ? `Abastecimento salvo! Consumo médio: ${media.toFixed(2)} km/l` : 'Abastecimento salvo!');
  loadShellMotorista();
}

function formatarDuracao(inicioIso, fimIso){
  const ms = new Date(fimIso) - new Date(inicioIso);
  const totalMin = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}h${String(m).padStart(2,'0')}`;
}

async function loadHistoricoJornadas(){
  const { data: jornadas, error } = await sb.from('jornada')
    .select('id, inicio, fim')
    .eq('motorista_id', session.user.id)
    .eq('status', 'encerrada')
    .order('inicio', { ascending: false })
    .limit(20);

  app.innerHTML = `
    <div class="wrap">
      <div class="top">
        <div>
          <button class="backbtn" id="btnVoltar">← Voltar</button>
          <div class="co">Histórico de jornadas</div>
        </div>
        <button class="sair" id="btnSair">Sair</button>
      </div>
      <div class="content">
        ${error ? `<div class="status">Erro ao carregar histórico: ${error.message}</div>` : ''}
        ${(jornadas||[]).map(j => `
          <div class="card clickable" data-jornada="${j.id}">
            <div class="l1">${new Date(j.inicio).toLocaleDateString('pt-BR')}${j.fim ? `<span class="pill ok">${formatarDuracao(j.inicio, j.fim)}</span>` : ''}</div>
            <div class="l2">${new Date(j.inicio).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})} até ${j.fim ? new Date(j.fim).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}) : '—'} · toque para ver detalhes</div>
          </div>
        `).join('') || '<div class="status">Nenhuma jornada encerrada ainda</div>'}
      </div>
    </div>`;
  document.getElementById('btnSair').addEventListener('click', doLogout);
  document.getElementById('btnVoltar').addEventListener('click', () => { motoristaScreen = 'home'; loadShellMotorista(); });
  document.querySelectorAll('.card[data-jornada]').forEach(el => el.addEventListener('click', () => {
    jornadaDetalheId = el.dataset.jornada;
    motoristaScreen = 'historicoJornadaDetalhe';
    loadShellMotorista();
  }));
}

const TIPO_EVENTO_LABEL = { inicio: 'Início da jornada', pausa: 'Parada', retomada: 'Retomada', fim: 'Fim da jornada' };

async function loadHistoricoJornadaDetalhe(){
  const { data: jornada } = await sb.from('jornada').select('id, inicio, fim, assinatura_base64').eq('id', jornadaDetalheId).single();
  const { data: eventos } = await sb.from('jornada_evento')
    .select('tipo, motivo, observacao, criado_em')
    .eq('jornada_id', jornadaDetalheId)
    .order('criado_em');

  app.innerHTML = `
    <div class="wrap">
      <div class="top">
        <div>
          <button class="backbtn" id="btnVoltar">← Voltar</button>
          <div class="co">${jornada ? new Date(jornada.inicio).toLocaleDateString('pt-BR') : 'Detalhe da jornada'}</div>
        </div>
        <button class="sair" id="btnSair">Sair</button>
      </div>
      <div class="content">
        <h3>Linha do tempo</h3>
        ${(eventos||[]).map(ev => `
          <div class="card">
            <div class="l1">${ev.motivo || TIPO_EVENTO_LABEL[ev.tipo] || ev.tipo}</div>
            <div class="l2">${new Date(ev.criado_em).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}${ev.observacao ? ' · '+ev.observacao : ''}</div>
          </div>
        `).join('') || '<div class="status">Nenhum evento registrado</div>'}

        ${jornada && jornada.assinatura_base64 ? `
          <h3>Assinatura do motorista</h3>
          <div class="card" style="padding:10px;">
            <img src="${jornada.assinatura_base64}" style="width:100%; background:#fff; border-radius:8px; display:block;">
          </div>
        ` : ''}
      </div>
    </div>`;
  document.getElementById('btnSair').addEventListener('click', doLogout);
  document.getElementById('btnVoltar').addEventListener('click', () => { jornadaDetalheId = null; motoristaScreen = 'historicoJornada'; loadShellMotorista(); });
}

function iconeVeiculo(tipo){
  if(tipo === 'cavalo') return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 3h13v13H1z"/><path d="M14 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="1.5"/><circle cx="17.5" cy="18.5" r="1.5"/></svg>`;
  if(tipo === 'dolly') return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="9" width="18" height="6" rx="1"/><circle cx="7" cy="19" r="2"/><circle cx="17" cy="19" r="2"/></svg>`;
  return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="10" rx="1"/><circle cx="6.5" cy="19" r="2"/><circle cx="17.5" cy="19" r="2"/></svg>`;
}

function labelPosicaoConjunto(ordem, tipo){
  if(tipo === 'cavalo') return 'Cavalo mecânico';
  if(tipo === 'dolly') return 'Dolly';
  if(tipo === 'carreta') return ordem <= 2 ? '1ª Carreta' : '2ª Carreta';
  return tipoLabelGlobal[tipo] || tipo;
}
const tipoLabelGlobal = { cavalo:'Cavalo', carreta:'Carreta', dolly:'Dolly' };

async function loadDocumentosMotorista(){
  const { data: docs, error } = await sb.from('documento')
    .select('id, tipo, numero, validade, status, arquivo_url, qr_conteudo')
    .eq('referente_a', 'motorista')
    .eq('referente_id', session.user.id)
    .order('tipo');

  app.innerHTML = `
    <div class="wrap">
      <div class="top">
        <div>
          <button class="backbtn" id="btnVoltar">← Voltar</button>
          <div class="co">Meus documentos</div>
        </div>
        <button class="sair" id="btnSair">Sair</button>
      </div>
      <div class="content">
        ${error ? `<div class="status">Erro ao carregar documentos: ${error.message}</div>` : ''}
        ${(docs||[]).map(d => cardDocumento(d)).join('') || '<div class="status">Nenhum documento cadastrado para você ainda — peça ao escritório para cadastrar</div>'}
      </div>
    </div>`;
  document.getElementById('btnSair').addEventListener('click', doLogout);
  document.getElementById('btnVoltar').addEventListener('click', () => { motoristaScreen = 'home'; loadShellMotorista(); });
  document.querySelectorAll('[data-ver]').forEach(btn => btn.addEventListener('click', () => verArquivo(btn.dataset.ver, docs)));
  document.querySelectorAll('[data-anexar]').forEach(inp => inp.addEventListener('change', (e) => anexarArquivoComLeitura(inp.dataset.anexar, e.target.files[0], loadDocumentosMotorista)));
  document.querySelectorAll('[data-qr]').forEach(btn => btn.addEventListener('click', () => abrirScannerQR(btn.dataset.qr, loadDocumentosMotorista)));
}

async function loadDocumentosConjunto(){
  const conjunto = await carregarMeuConjunto();
  const veiculoIds = conjunto ? conjunto.conjunto_item.map(ci => ci.veiculo_id) : [];
  const placaPorVeiculo = {};
  if(conjunto) conjunto.conjunto_item.forEach(ci => { placaPorVeiculo[ci.veiculo_id] = ci.veiculo.placa; });

  const { data: docs, error } = veiculoIds.length
    ? await sb.from('documento').select('id, tipo, numero, validade, status, arquivo_url, qr_conteudo, referente_id').eq('referente_a', 'veiculo').in('referente_id', veiculoIds).order('tipo')
    : { data: [], error: null };

  app.innerHTML = `
    <div class="wrap">
      <div class="top">
        <div>
          <button class="backbtn" id="btnVoltar">← Voltar</button>
          <div class="co">Documentos do conjunto</div>
        </div>
        <button class="sair" id="btnSair">Sair</button>
      </div>
      <div class="content">
        ${error ? `<div class="status">Erro ao carregar documentos: ${error.message}</div>` : ''}
        ${(docs||[]).map(d => cardDocumento(d, placaPorVeiculo[d.referente_id] || '')).join('') || '<div class="status">Nenhum documento cadastrado para os veículos do seu conjunto ainda</div>'}
      </div>
    </div>`;
  document.getElementById('btnSair').addEventListener('click', doLogout);
  document.getElementById('btnVoltar').addEventListener('click', () => { motoristaScreen = 'home'; loadShellMotorista(); });
  document.querySelectorAll('[data-ver]').forEach(btn => btn.addEventListener('click', () => verArquivo(btn.dataset.ver, docs)));
  document.querySelectorAll('[data-anexar]').forEach(inp => inp.addEventListener('change', (e) => anexarArquivoComLeitura(inp.dataset.anexar, e.target.files[0], loadDocumentosConjunto)));
  document.querySelectorAll('[data-qr]').forEach(btn => btn.addEventListener('click', () => abrirScannerQR(btn.dataset.qr, loadDocumentosConjunto)));
}

function saudacaoHorario(){
  const h = new Date().getHours();
  if(h < 12) return 'Bom dia';
  if(h < 18) return 'Boa tarde';
  return 'Boa noite';
}

async function carregarAlertasMotorista(veiculoIds){
  const alertas = [];
  const { data: docsMotorista } = await sb.from('documento')
    .select('id, tipo, status, validade')
    .eq('referente_a', 'motorista').eq('referente_id', session.user.id)
    .neq('status', 'ok');
  (docsMotorista||[]).forEach(d => alertas.push({ titulo: d.tipo, status: d.status, validade: d.validade, origem: 'Seu documento' }));
  if(veiculoIds && veiculoIds.length){
    const { data: docsVeiculo } = await sb.from('documento')
      .select('id, tipo, status, validade, referente_id')
      .eq('referente_a', 'veiculo').in('referente_id', veiculoIds)
      .neq('status', 'ok');
    (docsVeiculo||[]).forEach(d => alertas.push({ titulo: d.tipo, status: d.status, validade: d.validade, origem: 'Veículo do conjunto' }));
  }
  return alertas;
}

function bottomNavMotorista(tabAtiva){
  const itens = [
    { id: 'inicio', ic: '🏠', label: 'Início' },
    { id: 'jornada', ic: '🕐', label: 'Jornada' },
    { id: 'checklist', ic: '📋', label: 'Checklist' },
    { id: 'viagem', ic: '🚛', label: 'Viagem' },
    { id: 'mais', ic: '☰', label: 'Mais' },
  ];
  return `
    <div class="bottom-nav">
      ${itens.map(it => `
        <button class="nav-btn ${tabAtiva===it.id ? 'active' : ''}" data-nav="${it.id}">
          <span class="nav-ic">${it.ic}</span>
          <span>${it.label}</span>
        </button>
      `).join('')}
    </div>`;
}

async function loadShellMotorista(){
  if(motoristaScreen === 'checklist'){ loadChecklistMotorista(); return; }
  if(motoristaScreen === 'historicoJornada'){ loadHistoricoJornadas(); return; }
  if(motoristaScreen === 'historicoJornadaDetalhe'){ loadHistoricoJornadaDetalhe(); return; }
  if(motoristaScreen === 'jornadaPausa'){ loadJornadaPausa(); return; }
  if(motoristaScreen === 'jornadaEncerrar'){ loadJornadaEncerrar(); return; }
  if(motoristaScreen === 'abastecimento'){ loadAbastecimentoMotorista(); return; }
  if(motoristaScreen === 'documentosMotorista'){ loadDocumentosMotorista(); return; }
  if(motoristaScreen === 'documentosConjunto'){ loadDocumentosConjunto(); return; }

  const conjunto = await carregarMeuConjunto();
  const jornada = await carregarJornadaAtiva();
  const viagem = await carregarViagemAtual();
  const { data: itens } = await sb.from('checklist_item_padrao').select('id').eq('ativo', true);
  const veiculosOrdenados = conjunto ? [...conjunto.conjunto_item].sort((a,b)=>a.ordem-b.ordem) : [];
  const veiculoIds = veiculosOrdenados.map(v => v.veiculo_id);
  const alertas = motoristaTab === 'inicio' ? await carregarAlertasMotorista(veiculoIds) : [];
  const primeiroNome = (usuarioAtual.nome || '').split(' ')[0];

  let conteudo = '';

  if(motoristaTab === 'inicio'){
    conteudo = `
      <div class="greeting">${saudacaoHorario()}, ${primeiroNome}</div>
      <div class="greeting-sub">${usuarioAtual.transportadora ? usuarioAtual.transportadora.nome_fantasia : '—'}</div>

      ${alertas.length ? `
        <h3>Alertas</h3>
        ${alertas.map(a => `
          <div class="alert-card ${a.status}">
            <div class="l1">${a.titulo} — ${statusLabel[a.status]||a.status}</div>
            <div class="l2">${a.origem}${a.validade ? ' · válido até '+formatarData(a.validade) : ''}</div>
          </div>
        `).join('')}
      ` : ''}

      <h3>Jornada de hoje</h3>
      <div class="card clickable" id="btnIrJornada">
        <div class="l1">${jornada ? jornadaStatusLabel[jornada.status] : 'Nenhuma jornada aberta'}${jornada ? `<span class="pill ${jornada.status==='ativa'?'ok':'vence_em_breve'}">${jornada.status==='ativa'?'Ativa':'Pausada'}</span>` : ''}</div>
        ${jornada && jornada.status==='pausada' && jornada.motivoAtual ? `<div class="l2">${jornada.motivoAtual}</div>` : ''}
        <div class="l2">${jornada ? 'Iniciada às '+new Date(jornada.inicio).toLocaleString('pt-BR') : 'Toque para iniciar sua jornada'}</div>
      </div>

      <h3>Acesso rápido</h3>
      <div class="quick-grid">
        <div class="quick-tile" id="btnAbrirChecklist">
          <div class="qi">📋</div>
          <div class="qt">Checklist</div>
          <div class="qs">${(itens||[]).length} itens</div>
        </div>
        <div class="quick-tile" id="btnIrViagem">
          <div class="qi">🚛</div>
          <div class="qt">Viagem atual</div>
          <div class="qs">${viagem ? (viagem.destino || 'Em andamento') : 'Nenhuma'}</div>
        </div>
        <div class="quick-tile" id="btnAbastecimento">
          <div class="qi">⛽</div>
          <div class="qt">Abastecimento</div>
          <div class="qs">Registrar</div>
        </div>
        <div class="quick-tile" id="btnDocumentosMotorista">
          <div class="qi">📄</div>
          <div class="qt">Documentos</div>
          <div class="qs">Meus arquivos</div>
        </div>
      </div>`;
  } else if(motoristaTab === 'jornada'){
    conteudo = `
      <h3>Jornada</h3>
      <div class="card">
        <div class="l1">${jornada ? jornadaStatusLabel[jornada.status] : 'Nenhuma jornada aberta'}${jornada ? `<span class="pill ${jornada.status==='ativa'?'ok':'vence_em_breve'}">${jornada.status==='ativa'?'Ativa':'Pausada'}</span>` : ''}</div>
        ${jornada && jornada.status==='pausada' && jornada.motivoAtual ? `<div class="l2">${jornada.motivoAtual}</div>` : ''}
        ${jornada ? `<div class="l2">Iniciada às ${new Date(jornada.inicio).toLocaleString('pt-BR')}</div>` : ''}
        ${jornadaBotoes(jornada)}
      </div>
      <div class="card clickable" id="btnHistoricoJornada">
        <div class="l1">Histórico de jornadas</div>
        <div class="l2">Toque para ver jornadas anteriores</div>
      </div>`;
  } else if(motoristaTab === 'viagem'){
    conteudo = `
      <h3>Viagem atual</h3>
      <div class="card">
        ${viagem ? `
          <div class="l1">${viagem.origem || '—'} → ${viagem.destino || '—'}</div>
          <div class="l2">${[viagem.cte_numero ? 'CT-e '+viagem.cte_numero : '', viagem.mdfe_numero ? 'MDF-e '+viagem.mdfe_numero : ''].filter(Boolean).join(' · ') || 'Sem número de CT-e/MDF-e informado'}</div>
          <button id="btnFinalizarViagem" style="margin-top:10px; width:100%;">Finalizar viagem</button>
        ` : '<div class="l2">Nenhuma viagem em andamento — aguarde o escritório abrir uma nova viagem para você</div>'}
      </div>`;
  } else if(motoristaTab === 'mais'){
    conteudo = `
      <h3>Meu conjunto</h3>
      ${veiculosOrdenados.length
        ? `<div class="card" style="padding:2px 14px;">${veiculosOrdenados.map(v => `
            <div class="list-item" data-placa="${v.veiculo.placa}">
              <div class="li-ic">${iconeVeiculo(v.veiculo.tipo)}</div>
              <div class="li-body">
                <div class="li-title">${v.veiculo.placa}</div>
                <div class="li-sub">${labelPosicaoConjunto(v.ordem, v.veiculo.tipo)}</div>
              </div>
              <div class="chev">›</div>
            </div>
          `).join('')}</div>`
        : '<div class="status">Nenhum conjunto vinculado a você ainda</div>'}
      <div class="card clickable" id="btnDocumentosConjunto">
        <div class="l1">Documentos do conjunto</div>
        <div class="l2">CRLV e licenciamento dos veículos</div>
      </div>

      <h3>Abastecimento</h3>
      <div class="card clickable" id="btnAbastecimento2">
        <div class="l1">Registrar abastecimento</div>
        <div class="l2">Toque para lançar km e litros e ver o consumo médio</div>
      </div>

      <h3>Documentos</h3>
      <div class="card clickable" id="btnDocumentosMotorista2">
        <div class="l1">Meus documentos</div>
        <div class="l2">CNH, exames e outros documentos pessoais</div>
      </div>

      <h3>Conta</h3>
      <div class="card clickable" id="btnSairMais">
        <div class="l1">Sair</div>
        <div class="l2">Encerrar sessão neste aparelho</div>
      </div>`;
  }

  app.innerHTML = `
    <div class="wrap">
      <div class="top">
        <div>
          <div class="co">${usuarioAtual.transportadora ? usuarioAtual.transportadora.nome_fantasia : '—'}</div>
          <div class="role">${usuarioAtual.nome} · ${papelLabel[usuarioAtual.papel] || usuarioAtual.papel}</div>
        </div>
        <button class="sair" id="btnSair">Sair</button>
      </div>
      <div class="content">
        ${conteudo}
      </div>
      ${bottomNavMotorista(motoristaTab)}
    </div>`;

  document.getElementById('btnSair').addEventListener('click', doLogout);
  document.querySelectorAll('[data-nav]').forEach(btn => btn.addEventListener('click', () => {
    const alvo = btn.dataset.nav;
    if(alvo === 'checklist'){ motoristaScreen = 'checklist'; loadShellMotorista(); return; }
    motoristaTab = alvo;
    loadShellMotorista();
  }));

  const btnIrJornada = document.getElementById('btnIrJornada');
  if(btnIrJornada) btnIrJornada.addEventListener('click', () => { motoristaTab = 'jornada'; loadShellMotorista(); });
  const btnIrViagem = document.getElementById('btnIrViagem');
  if(btnIrViagem) btnIrViagem.addEventListener('click', () => { motoristaTab = 'viagem'; loadShellMotorista(); });
  const btnAbrirChecklist = document.getElementById('btnAbrirChecklist');
  if(btnAbrirChecklist) btnAbrirChecklist.addEventListener('click', () => { motoristaScreen = 'checklist'; loadShellMotorista(); });
  const btnHistoricoJornada = document.getElementById('btnHistoricoJornada');
  if(btnHistoricoJornada) btnHistoricoJornada.addEventListener('click', () => { motoristaScreen = 'historicoJornada'; loadShellMotorista(); });
  const btnAbastecimento = document.getElementById('btnAbastecimento');
  if(btnAbastecimento) btnAbastecimento.addEventListener('click', () => { motoristaScreen = 'abastecimento'; loadShellMotorista(); });
  const btnAbastecimento2 = document.getElementById('btnAbastecimento2');
  if(btnAbastecimento2) btnAbastecimento2.addEventListener('click', () => { motoristaScreen = 'abastecimento'; loadShellMotorista(); });
  const btnDocumentosMotorista = document.getElementById('btnDocumentosMotorista');
  if(btnDocumentosMotorista) btnDocumentosMotorista.addEventListener('click', () => { motoristaScreen = 'documentosMotorista'; loadShellMotorista(); });
  const btnDocumentosMotorista2 = document.getElementById('btnDocumentosMotorista2');
  if(btnDocumentosMotorista2) btnDocumentosMotorista2.addEventListener('click', () => { motoristaScreen = 'documentosMotorista'; loadShellMotorista(); });
  const btnDocumentosConjunto = document.getElementById('btnDocumentosConjunto');
  if(btnDocumentosConjunto) btnDocumentosConjunto.addEventListener('click', () => { motoristaScreen = 'documentosConjunto'; loadShellMotorista(); });
  const btnSairMais = document.getElementById('btnSairMais');
  if(btnSairMais) btnSairMais.addEventListener('click', doLogout);
  document.querySelectorAll('.list-item[data-placa]').forEach(el => el.addEventListener('click', () => {
    alert(`${el.dataset.placa}\n\nDetalhes do veículo em breve.`);
  }));
  const btnFinalizarViagem = document.getElementById('btnFinalizarViagem');
  if(btnFinalizarViagem) btnFinalizarViagem.addEventListener('click', () => finalizarViagem(viagem.id));
  attachJornadaHandlers(jornada);
}

async function loadChecklistMotorista(){
  const conjunto = await carregarMeuConjunto();
  const { data: itens } = await sb.from('checklist_item_padrao').select('id, ordem, descricao, padrao_esperado').eq('ativo', true).order('ordem');

  const total = (itens||[]).length;
  const respondidos = Object.keys(chkAnswers).length;

  app.innerHTML = `
    <div class="wrap">
      <div class="top">
        <div>
          <button class="backbtn" id="btnVoltar">← Voltar</button>
          <div class="co">Checklist pré-viagem</div>
        </div>
        <button class="sair" id="btnSair">Sair</button>
      </div>
      <div class="content">
        <div class="progress"><div class="l2">${respondidos}/${total} itens respondidos</div></div>
        ${(itens||[]).map(it => `
          <div class="card">
            <div class="l1">${it.ordem}. ${it.descricao}</div>
            <div class="l2">${it.padrao_esperado || ''}</div>
            <div class="ans-row" data-item="${it.id}">
              <button class="ans-btn ok ${chkAnswers[it.id]==='ok'?'active':''}" data-val="ok">Atende</button>
              <button class="ans-btn bad ${chkAnswers[it.id]==='bad'?'active':''}" data-val="bad">Não atende</button>
              <button class="ans-btn na ${chkAnswers[it.id]==='na'?'active':''}" data-val="na">N/A</button>
            </div>
          </div>
        `).join('')}
        <button id="btnEnviarChecklist" ${respondidos<total?'disabled':''}>Enviar checklist (${respondidos}/${total})</button>
      </div>
    </div>`;

  document.getElementById('btnSair').addEventListener('click', doLogout);
  document.getElementById('btnVoltar').addEventListener('click', () => { motoristaScreen = 'home'; loadShellMotorista(); });
  document.querySelectorAll('.ans-row').forEach(row => {
    row.querySelectorAll('.ans-btn').forEach(btn => btn.addEventListener('click', () => {
      chkAnswers[row.dataset.item] = btn.dataset.val;
      loadChecklistMotorista();
    }));
  });
  const btnEnviar = document.getElementById('btnEnviarChecklist');
  if(btnEnviar) btnEnviar.addEventListener('click', enviarChecklist);
}

async function enviarChecklist(){
  const btn = document.getElementById('btnEnviarChecklist');
  btn.disabled = true; btn.textContent = 'Enviando...';
  const conjunto = await carregarMeuConjunto();
  const respostas = Object.keys(chkAnswers).map(itemId => ({ item_id: itemId, resposta: chkAnswers[itemId] }));

  const { error } = await sb.from('checklist').insert({
    transportadora_id: usuarioAtual.transportadora_id,
    motorista_id: session.user.id,
    conjunto_id: conjunto ? conjunto.id : null,
    respostas
  });

  if(error){ alert('Erro ao enviar checklist: ' + error.message); btn.disabled = false; btn.textContent = 'Tentar de novo'; return; }

  alert('Checklist enviado ao escritório!');
  chkAnswers = {};
  motoristaScreen = 'home';
  loadShellMotorista();
}
