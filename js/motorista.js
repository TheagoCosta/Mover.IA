// MOVER.IA — app do motorista (visual do protótipo: abas Início, Jornada,
// Checklist, Viagem e Mais). Conjunto, jornada, viagem, abastecimento,
// documentos e checklist.
// (arquivo carregado pelo index.html; todas as funções ficam globais,
// então um arquivo pode chamar funções dos outros normalmente)

let meuConjunto = null;
let motoristaScreen = 'home';   // 'home' (abas) ou uma subtela (ver loadShellMotorista)
let motoristaTab = 'inicio';
let chkAnswers = {};
let chkObs = {};
let docAbaMotorista = 'meus';

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

// ---------------------------------------------------------------------
// Dados
// ---------------------------------------------------------------------
async function carregarMeuConjunto(){
  if(meuConjunto !== null) return meuConjunto;
  const { data: conjuntos } = await sb
    .from('conjunto')
    .select('id, conjunto_item(ordem, veiculo_id, veiculo:veiculo_id(placa, tipo))')
    .eq('motorista_id', session.user.id)
    .eq('ativo', true);
  meuConjunto = (conjuntos && conjuntos[0]) || false;
  return meuConjunto;
}

function veiculosDoConjunto(conjunto){
  return conjunto ? [...conjunto.conjunto_item].sort((a, b) => a.ordem - b.ordem) : [];
}
function placaCavalo(conjunto){
  const c = veiculosDoConjunto(conjunto).find(v => v.veiculo.tipo === 'cavalo');
  return c ? c.veiculo.placa : null;
}

// Jornada aberta (ativa ou pausada) com todos os eventos, pra calcular o
// tempo de condução e mostrar a linha do tempo.
async function carregarJornadaAtiva(){
  const { data } = await sb.from('jornada')
    .select('id, inicio, status, jornada_evento(tipo, motivo, observacao, criado_em)')
    .eq('motorista_id', session.user.id)
    .neq('status', 'encerrada')
    .order('inicio', { ascending: false })
    .limit(1);
  const jornada = (data && data[0]) || null;
  if(jornada){
    jornada.eventos = [...(jornada.jornada_evento || [])].sort((a, b) => new Date(a.criado_em) - new Date(b.criado_em));
    const ultimaPausa = [...jornada.eventos].reverse().find(e => e.tipo === 'pausa');
    jornada.motivoAtual = jornada.status === 'pausada' && ultimaPausa ? ultimaPausa.motivo : null;
    jornada.pausadaDesde = jornada.status === 'pausada' && ultimaPausa ? ultimaPausa.criado_em : null;
    jornada.conducao = calcularConducao(jornada.eventos);
  }
  return jornada;
}

async function carregarViagemAtual(){
  const { data } = await sb.from('viagem')
    .select('id, origem, destino, cte_numero, mdfe_numero, status, criado_em')
    .eq('motorista_id', session.user.id)
    .eq('status', 'em_andamento')
    .order('criado_em', { ascending: false })
    .limit(1);
  return (data && data[0]) || null;
}

// Documentos do motorista e do conjunto que estão vencidos ou vencendo
// (status calculado pela validade — ver statusDocumento em ui.js)
async function carregarAlertasMotorista(veiculoIds){
  const alertas = [];
  const { data: docsMotorista } = await sb.from('documento')
    .select('id, tipo, status, validade')
    .eq('referente_a', 'motorista').eq('referente_id', session.user.id);
  (docsMotorista||[]).filter(d => statusDocumento(d) !== 'ok').forEach(d => alertas.push({ ...d, origem: 'Seu documento' }));
  if(veiculoIds && veiculoIds.length){
    const { data: docsVeiculo } = await sb.from('documento')
      .select('id, tipo, status, validade, referente_id')
      .eq('referente_a', 'veiculo').in('referente_id', veiculoIds);
    (docsVeiculo||[]).filter(d => statusDocumento(d) !== 'ok').forEach(d => alertas.push({ ...d, origem: 'Veículo do conjunto' }));
  }
  return alertas.sort((a, b) => PESO_STATUS_DOC[statusDocumento(b)] - PESO_STATUS_DOC[statusDocumento(a)]);
}

async function carregarChecklistDeHoje(){
  const { data } = await sb.from('checklist').select('id, criado_em')
    .eq('motorista_id', session.user.id)
    .gte('criado_em', inicioDoDia().toISOString())
    .order('criado_em', { ascending: false }).limit(1);
  return (data && data[0]) || null;
}

// ---------------------------------------------------------------------
// Moldura das telas (cabeçalho + conteúdo + barra de abas)
// ---------------------------------------------------------------------
const ABAS_MOTORISTA = [
  { k:'inicio', l:'Início', i:'home' },
  { k:'jornada', l:'Jornada', i:'clock' },
  { k:'checklist', l:'Checklist', i:'checksq' },
  { k:'viagem', l:'Viagem', i:'truck' },
  { k:'mais', l:'Mais', i:'dots' },
];

function headerPrincipal(titulo, sub, direita = ''){
  return `<div class="app-header"><div class="row"><div><h2>${esc(titulo)}</h2>${sub ? `<div class="sub">${esc(sub)}</div>` : ''}</div>${direita}</div></div>`;
}
function headerVoltar(titulo){
  return `<div class="back-header"><button class="back-btn" id="btnVoltar" aria-label="Voltar">${ic('back', 16)}</button><h3>${esc(titulo)}</h3></div>`;
}

function montarTelaMotorista({ header, conteudo, tab, voltarPara = 'home' }){
  const abaAtiva = motoristaScreen === 'home' ? tab : null;
  app.innerHTML = `
    <div class="m-app">
      ${header}
      <div class="m-content">${conteudo}</div>
      <nav class="tabbar">
        ${ABAS_MOTORISTA.map(a => `<button class="tab ${abaAtiva === a.k ? 'active' : ''}" data-tab="${a.k}">${ic(a.i, 20)}<span>${a.l}</span></button>`).join('')}
      </nav>
    </div>`;
  document.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => {
    motoristaScreen = 'home'; motoristaTab = b.dataset.tab; loadShellMotorista(); window.scrollTo(0, 0);
  }));
  document.querySelectorAll('[data-ir]').forEach(b => b.addEventListener('click', () => irParaMotorista(b.dataset.ir)));
  const voltar = document.getElementById('btnVoltar');
  if(voltar) voltar.addEventListener('click', () => irParaMotorista(voltarPara));
}

function irParaMotorista(destino){
  if(destino.startsWith('tab:')){ motoristaScreen = 'home'; motoristaTab = destino.slice(4); }
  else motoristaScreen = destino;
  loadShellMotorista();
  window.scrollTo(0, 0);
}

// ---------------------------------------------------------------------
// Roteamento
// ---------------------------------------------------------------------
async function loadShellMotorista(){
  // nomes antigos de telas, mantidos por compatibilidade
  if(motoristaScreen === 'checklist'){ motoristaScreen = 'home'; motoristaTab = 'checklist'; }
  if(motoristaScreen === 'documentosMotorista'){ motoristaScreen = 'documentos'; docAbaMotorista = 'meus'; }
  if(motoristaScreen === 'documentosConjunto'){ motoristaScreen = 'documentos'; docAbaMotorista = 'veiculo'; }

  const subtelas = {
    jornadaPausa: loadJornadaPausa, jornadaEncerrar: loadJornadaEncerrar, abastecimento: loadAbastecimentoMotorista,
    documentos: loadDocumentosMotorista, historicoJornada: loadHistoricoJornadas, historicoJornadaDetalhe: loadHistoricoJornadaDetalhe,
    conjunto: loadConjuntoMotorista, perfil: loadPerfilMotorista, oficina: loadOficinaMotorista,
  };
  if(subtelas[motoristaScreen]) return subtelas[motoristaScreen]();
  if(motoristaScreen.startsWith('emBreve:')) return loadEmBreveMotorista(motoristaScreen.slice(8));

  motoristaScreen = 'home';
  if(motoristaTab === 'jornada') return loadAbaJornada();
  if(motoristaTab === 'checklist') return loadChecklistMotorista();
  if(motoristaTab === 'viagem') return loadAbaViagem();
  if(motoristaTab === 'mais') return loadAbaMais();
  return loadAbaInicio();
}

// ---------------------------------------------------------------------
// Aba INÍCIO
// ---------------------------------------------------------------------
function cardJornadaResumo(jornada){
  if(!jornada) return `
    <div class="card clickable" data-ir="tab:jornada" style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
      <div><div class="card-dark-title">Nenhuma jornada aberta</div><div class="card-dark-sub">Toque para iniciar sua jornada</div></div>
      ${pillStatus('grey', 'Parado')}
    </div>`;
  if(jornada.status === 'pausada') return `
    <div class="card clickable" data-ir="tab:jornada" style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
      <div><div class="card-dark-title">Em parada${jornada.motivoAtual ? ' — ' + esc(jornada.motivoAtual) : ''}</div>
      <div class="card-dark-sub">Desde ${fmtHora(jornada.pausadaDesde)} · ${fmtMinutos(jornada.conducao.totalMin)} de condução hoje</div></div>
      ${pillStatus('amber', 'Parada')}
    </div>`;
  return `
    <div class="card clickable" data-ir="tab:jornada" style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
      <div><div class="card-dark-title">Em condução</div><div class="card-dark-sub">Jornada iniciada às ${fmtHora(jornada.inicio)}</div></div>
      ${pillStatus('green', 'Ativo')}
    </div>
    ${cardMedidorConducao(jornada)}`;
}

function cardMedidorConducao(jornada){
  const cont = jornada.conducao.continuoMin;
  const restante = LIMITE_CONDUCAO_CONTINUA_MIN - cont;
  return `
    <div class="card" style="text-align:center;">
      <div class="gauge-wrap">${gauge(cont, LIMITE_CONDUCAO_CONTINUA_MIN)}<div class="gauge-val">${fmtMinutos(cont)}</div>
      <div class="gauge-lbl">de 5h30 de condução contínua · ${restante > 0 ? `parada obrigatória em ${fmtMinutos(restante)}` : 'faça uma parada agora'}</div></div>
    </div>`;
}

async function loadAbaInicio(){
  const conjunto = await carregarMeuConjunto();
  const veiculoIds = veiculosDoConjunto(conjunto).map(v => v.veiculo_id);
  const [jornada, viagem, alertas, checklistHoje, { data: ultimoAbast }, { data: meusChamados }] = await Promise.all([
    carregarJornadaAtiva(), carregarViagemAtual(), carregarAlertasMotorista(veiculoIds), carregarChecklistDeHoje(),
    sb.from('abastecimento').select('media_calculada').eq('motorista_id', session.user.id).not('media_calculada', 'is', null).order('data', { ascending:false }).limit(1),
    sb.from('chamado_manutencao').select('status').eq('motorista_id', session.user.id).neq('status', 'concluido'),
  ]);
  const chamadosAbertos = (meusChamados || []).length;
  const primeiroNome = (usuarioAtual.nome || '').split(' ')[0];
  const cavalo = placaCavalo(conjunto);
  const sub = cavalo ? `${cavalo} · ${usuarioAtual.transportadora ? usuarioAtual.transportadora.nome_fantasia : ''}` : (usuarioAtual.transportadora ? usuarioAtual.transportadora.nome_fantasia : '');
  const media = ultimoAbast && ultimoAbast[0] ? Number(ultimoAbast[0].media_calculada).toFixed(2).replace('.', ',') + ' km/l' : null;
  const tile = (destino, icone, rotulo, meta, emBreve = false) =>
    `<div class="quick-tile ${emBreve ? 'em-breve' : ''}" data-ir="${destino}">${ic(icone, 20)}<div class="lbl">${rotulo}</div><div class="meta">${esc(meta)}</div></div>`;
  const excedeu = jornada && jornada.status === 'ativa' && jornada.conducao.continuoMin >= LIMITE_CONDUCAO_CONTINUA_MIN;

  montarTelaMotorista({
    tab: 'inicio',
    header: headerPrincipal(`${saudacaoHorario()}, ${primeiroNome}`, sub, `<div class="avatar" data-ir="perfil" style="cursor:pointer;">${esc(iniciais(usuarioAtual.nome))}</div>`),
    conteudo: `
      ${excedeu ? `<div class="alert-card vencido">${ic('alert', 18)}<div class="txt"><b>Hora de parar</b><span>Você passou de 5h30 dirigindo sem parar. Faça uma parada assim que for seguro.</span></div></div>` : ''}
      ${alertas.map(a => `<div class="alert-card ${statusDocumento(a) === 'vencido' ? 'vencido' : ''} clickable" data-ir="documentos" style="cursor:pointer;">${ic('alert', 18)}<div class="txt"><b>${esc(a.tipo)} — ${ROTULO_STATUS_DOC[statusDocumento(a)]}</b><span>${esc(a.origem)} · ${esc(textoVencimento(a))}</span></div></div>`).join('')}
      <div class="section-label">Jornada de hoje</div>
      ${cardJornadaResumo(jornada)}
      <div class="section-label">Acesso rápido</div>
      <div class="grid2">
        ${tile('tab:checklist', 'checksq', 'Checklist', checklistHoje ? `Enviado hoje às ${fmtHora(checklistHoje.criado_em)}` : 'Pendente hoje')}
        ${tile('tab:viagem', 'truck', 'Viagem atual', viagem ? `${viagem.origem || '?'} → ${viagem.destino || '?'}` : 'Nenhuma')}
        ${tile('documentos', 'doc', 'Documentos', alertas.length ? `${alertas.length} pendência${alertas.length > 1 ? 's' : ''}` : 'Tudo em dia')}
        ${tile('abastecimento', 'fuel', 'Abastecimento', media ? `${media} (último)` : 'Registrar')}
        ${tile('oficina', 'wrench', 'Oficina', chamadosAbertos ? `${chamadosAbertos} em aberto` : 'Avisar um problema')}
        ${tile('emBreve:capacitacoes', 'award', 'Capacitações', 'Em breve', true)}
        ${tile('emBreve:agendamentos', 'cal', 'Agendamentos', 'Em breve', true)}
      </div>`,
  });
}

function saudacaoHorario(){
  const h = new Date().getHours();
  if(h < 12) return 'Bom dia';
  if(h < 18) return 'Boa tarde';
  return 'Boa noite';
}

// ---------------------------------------------------------------------
// Aba JORNADA
// ---------------------------------------------------------------------
async function loadAbaJornada(){
  const jornada = await carregarJornadaAtiva();
  let principal;
  if(!jornada){
    principal = `
      <div class="card em-breve-box" style="padding:26px 18px;">
        <div class="ic-grande">${ic('clock', 32)}</div>
        <div class="card-dark-title">Nenhuma jornada aberta</div>
        <div class="card-dark-sub" style="margin-bottom:16px;">Inicie quando começar a trabalhar. O app conta o tempo de direção e avisa a hora de parar.</div>
        <button class="btn btn-primary" id="btnJornadaIniciar">${ic('play', 16)} Iniciar jornada</button>
      </div>`;
  } else if(jornada.status === 'ativa'){
    principal = `
      ${jornada.conducao.continuoMin >= LIMITE_CONDUCAO_CONTINUA_MIN ? `<div class="alert-card vencido">${ic('alert', 18)}<div class="txt"><b>Hora de parar</b><span>Você passou de 5h30 dirigindo sem parar.</span></div></div>` : ''}
      ${cardMedidorConducao(jornada)}
      <div class="card-dark-sub" style="text-align:center; margin:-4px 0 12px;">Jornada iniciada às ${fmtHora(jornada.inicio)} · ${fmtMinutos(jornada.conducao.totalMin)} de condução · ${jornada.conducao.paradas} parada${jornada.conducao.paradas === 1 ? '' : 's'}</div>
      <div class="grid2" style="margin-bottom:6px;">
        <button class="btn btn-outline" id="btnJornadaPausar">${ic('pause', 15)} Registrar parada</button>
        <button class="btn btn-danger" id="btnJornadaEncerrar">${ic('stop', 15)} Encerrar</button>
      </div>`;
  } else {
    principal = `
      <div class="card" style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
        <div><div class="card-dark-title">Em parada${jornada.motivoAtual ? ' — ' + esc(jornada.motivoAtual) : ''}</div>
        <div class="card-dark-sub">Desde ${fmtHora(jornada.pausadaDesde)} (há ${fmtMinutos((Date.now() - new Date(jornada.pausadaDesde)) / 60000)}) · ${fmtMinutos(jornada.conducao.totalMin)} de condução hoje</div></div>
        ${pillStatus('amber', 'Parada')}
      </div>
      <div class="grid2" style="margin-bottom:6px;">
        <button class="btn btn-primary" id="btnJornadaRetomar">${ic('play', 15)} Retomar</button>
        <button class="btn btn-danger" id="btnJornadaEncerrar">${ic('stop', 15)} Encerrar</button>
      </div>`;
  }

  montarTelaMotorista({
    tab: 'jornada',
    header: headerPrincipal('Jornada', 'Controle de horas — Lei do Motorista'),
    conteudo: `
      ${principal}
      ${jornada ? `<div class="section-label">Linha do tempo — hoje</div>
        <div class="card lista">${jornada.eventos.map(ev => `
          <div class="list-item"><div class="li-ic">${ic(TIPO_EVENTO_ICONE[ev.tipo] || 'clock', 16)}</div>
          <div class="li-body"><div class="li-title">${esc(ev.motivo || TIPO_EVENTO_LABEL[ev.tipo] || ev.tipo)}</div><div class="li-sub">${fmtHora(ev.criado_em)}${ev.observacao ? ' · ' + esc(ev.observacao) : ''}</div></div></div>`).join('')}</div>` : ''}
      <div class="section-label">Histórico</div>
      <div class="card lista"><div class="list-item clickable" data-ir="historicoJornada">
        <div class="li-ic">${ic('cal', 16)}</div><div class="li-body"><div class="li-title">Jornadas anteriores</div><div class="li-sub">Linha do tempo e assinatura de cada dia</div></div><div class="chev">${ic('chev', 16)}</div>
      </div></div>`,
  });

  const ini = document.getElementById('btnJornadaIniciar');
  if(ini) ini.addEventListener('click', () => { ini.disabled = true; iniciarJornada(); });
  const pausar = document.getElementById('btnJornadaPausar');
  if(pausar) pausar.addEventListener('click', () => { jornadaEmEdicaoId = jornada.id; motivoSelecionado = null; irParaMotorista('jornadaPausa'); });
  const retomar = document.getElementById('btnJornadaRetomar');
  if(retomar) retomar.addEventListener('click', () => { retomar.disabled = true; atualizarJornada(jornada.id, 'ativa', 'retomada'); });
  const encerrar = document.getElementById('btnJornadaEncerrar');
  if(encerrar) encerrar.addEventListener('click', () => { jornadaEmEdicaoId = jornada.id; irParaMotorista('jornadaEncerrar'); });
}

async function iniciarJornada(){
  const { data, error } = await sb.from('jornada').insert({
    transportadora_id: usuarioAtual.transportadora_id,
    motorista_id: session.user.id,
    status: 'ativa'
  }).select('id').single();
  if(error){ alert('Erro ao iniciar jornada: ' + error.message); loadShellMotorista(); return; }
  await sb.from('jornada_evento').insert({ jornada_id: data.id, tipo: 'inicio' });
  loadShellMotorista();
}

async function atualizarJornada(jornadaId, novoStatus, tipoEvento){
  const { error } = await sb.from('jornada').update({ status: novoStatus }).eq('id', jornadaId);
  if(error){ alert('Erro: ' + error.message); loadShellMotorista(); return; }
  await sb.from('jornada_evento').insert({ jornada_id: jornadaId, tipo: tipoEvento });
  loadShellMotorista();
}

function loadJornadaPausa(){
  montarTelaMotorista({
    voltarPara: 'tab:jornada',
    header: headerVoltar('Registrar parada'),
    conteudo: `
      <div class="section-label">O que está acontecendo?</div>
      <div class="card lista">
        ${MOTIVOS_PARADA.map(m => `
          <div class="list-item clickable" data-motivo="${esc(m)}">
            <div class="li-body"><div class="li-title">${esc(m)}</div></div>
            <div class="chev" data-marca>${motivoSelecionado === m ? ic('check', 18, '#ffc53d') : ''}</div>
          </div>`).join('')}
      </div>
      <div class="section-label">Observação (opcional)</div>
      <textarea id="pausaObs" class="m-textarea" rows="3" placeholder="Detalhe o motivo, se precisar"></textarea>
      <button class="btn btn-primary" id="btnConfirmarPausa" style="margin-top:14px;" ${motivoSelecionado ? '' : 'disabled'}>Confirmar parada</button>`,
  });
  document.querySelectorAll('[data-motivo]').forEach(el => el.addEventListener('click', () => {
    motivoSelecionado = el.dataset.motivo;
    document.querySelectorAll('[data-motivo]').forEach(o => { o.querySelector('[data-marca]').innerHTML = o === el ? ic('check', 18, '#ffc53d') : ''; });
    document.getElementById('btnConfirmarPausa').disabled = false;
  }));
  document.getElementById('btnConfirmarPausa').addEventListener('click', confirmarPausa);
}

async function confirmarPausa(){
  const btn = document.getElementById('btnConfirmarPausa');
  btn.disabled = true; btn.textContent = 'Salvando...';
  const obs = document.getElementById('pausaObs').value.trim();

  const { error } = await sb.from('jornada').update({ status: 'pausada' }).eq('id', jornadaEmEdicaoId);
  if(error){ alert('Erro ao registrar parada: ' + error.message); btn.disabled = false; btn.textContent = 'Confirmar parada'; return; }
  await sb.from('jornada_evento').insert({ jornada_id: jornadaEmEdicaoId, tipo: 'pausa', motivo: motivoSelecionado, observacao: obs || null });

  motivoSelecionado = null;
  irParaMotorista('tab:jornada');
}

function loadJornadaEncerrar(){
  montarTelaMotorista({
    voltarPara: 'tab:jornada',
    header: headerVoltar('Encerrar jornada'),
    conteudo: `
      <div class="section-label">Observação final (opcional)</div>
      <textarea id="encerrarObs" class="m-textarea" rows="3" placeholder="Alguma observação sobre a jornada?"></textarea>
      <div class="section-label">Assinatura do motorista</div>
      <div class="card" style="padding:10px;">
        <canvas id="canvasAssinatura" class="assinatura"></canvas>
        <button class="btn-small" id="btnLimparAssinatura" style="margin-top:8px;">Limpar assinatura</button>
      </div>
      <button class="btn btn-danger" id="btnConfirmarEncerramento" disabled>Assinar e encerrar jornada</button>`,
  });

  const canvas = document.getElementById('canvasAssinatura');
  const ctx = canvas.getContext('2d');
  const rect = canvas.getBoundingClientRect();
  const escala = window.devicePixelRatio || 1;
  canvas.width = rect.width * escala;
  canvas.height = rect.height * escala;
  ctx.scale(escala, escala);
  ctx.strokeStyle = '#edeef0';
  ctx.lineWidth = 2.2;
  ctx.lineCap = 'round';

  let desenhando = false;
  const posicao = (e) => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  canvas.addEventListener('pointerdown', e => {
    desenhando = true;
    document.getElementById('btnConfirmarEncerramento').disabled = false;
    const p = posicao(e); ctx.beginPath(); ctx.moveTo(p.x, p.y);
  });
  canvas.addEventListener('pointermove', e => { if(!desenhando) return; const p = posicao(e); ctx.lineTo(p.x, p.y); ctx.stroke(); });
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
  if(error){ alert('Erro ao encerrar jornada: ' + error.message); btn.disabled = false; btn.textContent = 'Assinar e encerrar jornada'; return; }
  await sb.from('jornada_evento').insert({ jornada_id: jornadaEmEdicaoId, tipo: 'fim', observacao: obs || null });

  mostrarToast('✅ Jornada encerrada');
  irParaMotorista('tab:jornada');
}

async function loadHistoricoJornadas(){
  const { data: jornadas, error } = await sb.from('jornada')
    .select('id, inicio, fim, jornada_evento(tipo, criado_em)')
    .eq('motorista_id', session.user.id)
    .eq('status', 'encerrada')
    .order('inicio', { ascending: false })
    .limit(30);

  montarTelaMotorista({
    voltarPara: 'tab:jornada',
    header: headerVoltar('Jornadas anteriores'),
    conteudo: error ? `<div class="status">Erro ao carregar histórico: ${esc(error.message)}</div>`
      : (jornadas||[]).length ? `<div class="card lista">${jornadas.map(j => {
          const eventos = [...(j.jornada_evento || [])].sort((a, b) => new Date(a.criado_em) - new Date(b.criado_em));
          const c = calcularConducao(eventos, new Date(j.fim));
          return `<div class="list-item clickable" data-jornada="${j.id}">
            <div class="li-ic">${ic('cal', 16)}</div>
            <div class="li-body"><div class="li-title">${fmtData(j.inicio)}</div><div class="li-sub">${fmtHora(j.inicio)} às ${fmtHora(j.fim)} · ${fmtMinutos(c.totalMin)} de condução · ${c.paradas} parada${c.paradas === 1 ? '' : 's'}</div></div>
            <div class="chev">${ic('chev', 16)}</div></div>`;
        }).join('')}</div>`
      : '<div class="status">Nenhuma jornada encerrada ainda</div>',
  });
  document.querySelectorAll('[data-jornada]').forEach(el => el.addEventListener('click', () => {
    jornadaDetalheId = el.dataset.jornada;
    irParaMotorista('historicoJornadaDetalhe');
  }));
}

async function loadHistoricoJornadaDetalhe(){
  const { data: jornada } = await sb.from('jornada').select('id, inicio, fim, assinatura_base64').eq('id', jornadaDetalheId).single();
  const { data: eventos } = await sb.from('jornada_evento')
    .select('tipo, motivo, observacao, criado_em')
    .eq('jornada_id', jornadaDetalheId)
    .order('criado_em');
  const c = calcularConducao(eventos || [], jornada && jornada.fim ? new Date(jornada.fim) : new Date());

  montarTelaMotorista({
    voltarPara: 'historicoJornada',
    header: headerVoltar(jornada ? `Jornada de ${fmtData(jornada.inicio)}` : 'Detalhe da jornada'),
    conteudo: `
      <div class="card stat-big"><div class="num">${fmtMinutos(c.totalMin)}</div><div class="lbl">de condução · ${c.paradas} parada${c.paradas === 1 ? '' : 's'}</div></div>
      <div class="section-label">Linha do tempo</div>
      <div class="card lista">${(eventos||[]).map(ev => `
        <div class="list-item"><div class="li-ic">${ic(TIPO_EVENTO_ICONE[ev.tipo] || 'clock', 16)}</div>
        <div class="li-body"><div class="li-title">${esc(ev.motivo || TIPO_EVENTO_LABEL[ev.tipo] || ev.tipo)}</div><div class="li-sub">${fmtHora(ev.criado_em)}${ev.observacao ? ' · ' + esc(ev.observacao) : ''}</div></div></div>`).join('') || '<div class="status">Nenhum evento registrado</div>'}</div>
      ${jornada && jornada.assinatura_base64 ? `
        <div class="section-label">Assinatura do motorista</div>
        <div class="card" style="padding:10px;"><img src="${jornada.assinatura_base64}" alt="Assinatura" style="width:100%; background:#fff; border-radius:8px; display:block;"></div>` : ''}`,
  });
}

function formatarDuracao(inicioIso, fimIso){
  return fmtMinutos((new Date(fimIso) - new Date(inicioIso)) / 60000);
}

// ---------------------------------------------------------------------
// Aba CHECKLIST
// ---------------------------------------------------------------------
async function loadChecklistMotorista(){
  const conjunto = await carregarMeuConjunto();
  const [{ data: itens }, checklistHoje] = await Promise.all([
    sb.from('checklist_item_padrao').select('id, ordem, descricao, padrao_esperado').eq('ativo', true).order('ordem'),
    carregarChecklistDeHoje(),
  ]);
  const total = (itens||[]).length;
  const respondidos = () => (itens||[]).filter(it => chkAnswers[it.id]).length;
  const veiculos = veiculosDoConjunto(conjunto);

  montarTelaMotorista({
    tab: 'checklist',
    header: headerPrincipal('Checklist', placaCavalo(conjunto) ? `Pré-viagem · ${placaCavalo(conjunto)}` : 'Pré-viagem'),
    conteudo: `
      ${checklistHoje ? `<div class="alert-card" style="border-left-color:var(--signal-green); color:var(--signal-green);">${ic('check', 18)}<div class="txt"><b>Checklist de hoje já enviado</b><span>Às ${fmtHora(checklistHoje.criado_em)}. Se precisar, pode enviar outro.</span></div></div>` : ''}
      <div class="card" style="font-size:12.5px;">
        <div class="li-sub" style="margin-bottom:4px;">Data da inspeção: <b style="color:var(--text-primary);">${fmtData(new Date())}</b></div>
        <div class="li-sub" style="margin-bottom:4px;">Motorista: <b style="color:var(--text-primary);">${esc(usuarioAtual.nome)}</b></div>
        <div class="li-sub">Conjunto: ${veiculos.length ? veiculos.map(v => `<b style="color:var(--text-primary);">${esc(v.veiculo.placa)}</b> (${esc((tipoLabelGlobal[v.veiculo.tipo] || v.veiculo.tipo).toLowerCase())})`).join(' → ') : 'nenhum vinculado'}</div>
      </div>
      <div class="progress-track" style="margin-bottom:6px;"><div class="progress-fill" id="chkProgressFill" style="width:${total ? respondidos() / total * 100 : 0}%"></div></div>
      <div class="li-sub" id="chkProgressLbl" style="margin-bottom:6px;">${respondidos()}/${total} itens respondidos</div>
      <div class="card" style="padding:4px 16px;">
        ${(itens||[]).map(it => `
          <div class="chk-item">
            <div class="chk-label"><b>${it.ordem}. ${esc(it.descricao)}</b>${it.padrao_esperado ? `<div class="li-sub" style="margin-top:2px;">${esc(it.padrao_esperado)}</div>` : ''}</div>
            <div class="answer-row" data-item="${it.id}">
              <button class="ans-btn ans-ok ${chkAnswers[it.id]==='ok'?'active':''}" data-val="ok">Atende</button>
              <button class="ans-btn ans-bad ${chkAnswers[it.id]==='bad'?'active':''}" data-val="bad">Não atende</button>
              <button class="ans-btn ans-na ${chkAnswers[it.id]==='na'?'active':''}" data-val="na">N/A</button>
            </div>
          </div>`).join('')}
      </div>
      <button class="btn btn-primary" id="btnEnviarChecklist" ${respondidos() < total ? 'disabled' : ''}>Enviar checklist (${respondidos()}/${total})</button>`,
  });

  // Marca a resposta na própria tela (sem recarregar tudo, pra não perder a rolagem)
  document.querySelectorAll('.answer-row').forEach(row => {
    row.querySelectorAll('.ans-btn').forEach(btn => btn.addEventListener('click', () => {
      chkAnswers[row.dataset.item] = btn.dataset.val;
      row.querySelectorAll('.ans-btn').forEach(b => b.classList.toggle('active', b === btn));
      const n = respondidos();
      document.getElementById('chkProgressFill').style.width = (total ? n / total * 100 : 0) + '%';
      document.getElementById('chkProgressLbl').textContent = `${n}/${total} itens respondidos`;
      const enviar = document.getElementById('btnEnviarChecklist');
      enviar.disabled = n < total;
      enviar.textContent = `Enviar checklist (${n}/${total})`;
    }));
  });
  document.getElementById('btnEnviarChecklist').addEventListener('click', enviarChecklist);
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

  const irregulares = respostas.filter(r => r.resposta === 'bad').length;
  mostrarToast(irregulares ? `✅ Checklist enviado — ${irregulares} irregularidade${irregulares > 1 ? 's' : ''} avisada${irregulares > 1 ? 's' : ''} ao escritório` : '✅ Checklist enviado ao escritório');
  chkAnswers = {};
  irParaMotorista('tab:inicio');
}

// ---------------------------------------------------------------------
// Aba VIAGEM
// ---------------------------------------------------------------------
async function loadAbaViagem(){
  const viagem = await carregarViagemAtual();
  const docItem = (nome, numero) => `
    <div class="list-item"><div class="li-ic">${ic('doc', 16)}</div>
      <div class="li-body"><div class="li-title">${nome}</div><div class="li-sub">${numero ? 'nº ' + esc(numero) : 'Número não informado pelo escritório'}</div></div>
      ${numero ? pillStatus('green', 'OK') : pillStatus('amber', 'Pendente')}</div>`;

  montarTelaMotorista({
    tab: 'viagem',
    header: headerPrincipal('Viagem atual', viagem ? `Aberta em ${fmtDataHora(viagem.criado_em)}` : ''),
    conteudo: viagem ? `
      <div class="card">
        <div class="trip-route">
          <div class="dots"><div class="dot-o"></div><div class="dot-line"></div><div class="dot-d"></div></div>
          <div>
            <div class="trip-pt"><b>${esc(viagem.origem || 'Origem não informada')}</b><span>Origem</span></div>
            <div class="trip-pt" style="margin-bottom:0;"><b>${esc(viagem.destino || 'Destino não informado')}</b><span>Destino</span></div>
          </div>
        </div>
      </div>
      <div class="section-label">Documentos da viagem</div>
      <div class="card lista">${docItem('CT-e', viagem.cte_numero)}${docItem('MDF-e', viagem.mdfe_numero)}</div>
      <div class="card-dark-sub" style="margin:-4px 0 14px;">Quando a integração com o sistema da transportadora estiver pronta, os arquivos do CT-e e MDF-e aparecem aqui para baixar.</div>
      <button class="btn btn-primary" id="btnFinalizarViagem">${ic('flag', 16)} Finalizar viagem</button>`
    : `<div class="card em-breve-box"><div class="ic-grande">${ic('truck', 34)}</div><div class="card-dark-title">Nenhuma viagem em andamento</div><div class="card-dark-sub">Quando o escritório abrir uma viagem para você, ela aparece aqui com origem, destino e documentos.</div></div>`,
  });
  const btn = document.getElementById('btnFinalizarViagem');
  if(btn) btn.addEventListener('click', () => { if(confirm('Finalizar esta viagem? Confirme só depois da entrega.')) finalizarViagem(viagem.id); });
}

async function finalizarViagem(viagemId){
  const { error } = await sb.from('viagem').update({ status: 'concluida' }).eq('id', viagemId);
  if(error){ alert('Erro ao finalizar viagem: ' + error.message); return; }
  mostrarToast('✅ Viagem finalizada');
  loadShellMotorista();
}

// ---------------------------------------------------------------------
// Aba MAIS e subtelas
// ---------------------------------------------------------------------
function loadAbaMais(){
  const itens = [
    { ir:'documentos', l:'Documentos', i:'doc', m:'Meus, do veículo e da empresa' },
    { ir:'conjunto', l:'Meu conjunto', i:'truck', m:'Cavalo, carretas e dolly' },
    { ir:'abastecimento', l:'Abastecimentos', i:'fuel', m:'Registrar e ver o consumo médio' },
    { ir:'historicoJornada', l:'Jornadas anteriores', i:'clock', m:'Linha do tempo e assinaturas' },
    { ir:'oficina', l:'Oficina / Manutenção', i:'wrench', m:'Avisar um problema e acompanhar o conserto' },
    { ir:'emBreve:capacitacoes', l:'Capacitações', i:'award', m:'Em breve' },
    { ir:'emBreve:agendamentos', l:'Agendamentos', i:'cal', m:'Em breve' },
    { ir:'perfil', l:'Meu perfil', i:'user', m:usuarioAtual.nome },
  ];
  montarTelaMotorista({
    tab: 'mais',
    header: headerPrincipal('Mais', usuarioAtual.nome),
    conteudo: `<div class="card lista">${itens.map(it => `
      <div class="list-item clickable" data-ir="${it.ir}">
        <div class="li-ic">${ic(it.i, 16)}</div>
        <div class="li-body"><div class="li-title">${it.l}</div><div class="li-sub">${esc(it.m)}</div></div>
        <div class="chev">${ic('chev', 16)}</div>
      </div>`).join('')}</div>`,
  });
}

async function loadDocumentosMotorista(){
  const conjunto = await carregarMeuConjunto();
  const veiculoIds = veiculosDoConjunto(conjunto).map(v => v.veiculo_id);
  const placaPorVeiculo = {};
  veiculosDoConjunto(conjunto).forEach(ci => { placaPorVeiculo[ci.veiculo_id] = ci.veiculo.placa; });
  const campos = 'id, tipo, numero, validade, status, arquivo_url, qr_conteudo, referente_id';
  const [meus, veic, emp] = await Promise.all([
    sb.from('documento').select(campos).eq('referente_a', 'motorista').eq('referente_id', session.user.id).order('tipo'),
    veiculoIds.length ? sb.from('documento').select(campos).eq('referente_a', 'veiculo').in('referente_id', veiculoIds).order('tipo') : Promise.resolve({ data: [] }),
    sb.from('documento').select(campos).eq('referente_a', 'empresa').order('tipo'),
  ]);
  const listas = {
    meus: { docs: meus.data || [], vazio: 'Nenhum documento seu cadastrado ainda — peça ao escritório para cadastrar.', sub: () => '', editar: true },
    veiculo: { docs: veic.data || [], vazio: veiculoIds.length ? 'Nenhum documento dos veículos do seu conjunto ainda.' : 'Você ainda não tem um conjunto vinculado.', sub: (d) => placaPorVeiculo[d.referente_id] || '', editar: true },
    empresa: { docs: emp.data || [], vazio: 'Nenhum documento da empresa cadastrado.', sub: () => '', editar: false },
  };
  const atual = listas[docAbaMotorista] || listas.meus;
  const todos = [...listas.meus.docs, ...listas.veiculo.docs, ...listas.empresa.docs];

  montarTelaMotorista({
    header: headerVoltar('Documentos'),
    conteudo: `
      <div class="doc-tabs">
        ${[['meus', 'Meus'], ['veiculo', 'Veículo'], ['empresa', 'Empresa']].map(([k, l]) => `<button class="${docAbaMotorista === k ? 'active' : ''}" data-aba="${k}">${l} (${listas[k].docs.length})</button>`).join('')}
      </div>
      ${atual.docs.length ? `<div class="card lista">${atual.docs.map(d => cardDocumento(d, atual.sub(d), atual.editar)).join('')}</div>` : `<div class="status">${atual.vazio}</div>`}`,
  });
  document.querySelectorAll('[data-aba]').forEach(b => b.addEventListener('click', () => { docAbaMotorista = b.dataset.aba; loadDocumentosMotorista(); }));
  document.querySelectorAll('[data-ver]').forEach(btn => btn.addEventListener('click', () => verArquivo(btn.dataset.ver, todos)));
  document.querySelectorAll('[data-anexar]').forEach(inp => inp.addEventListener('change', (e) => anexarArquivoComLeitura(inp.dataset.anexar, e.target.files[0], loadDocumentosMotorista)));
  document.querySelectorAll('[data-qr]').forEach(btn => btn.addEventListener('click', () => abrirScannerQR(btn.dataset.qr, loadDocumentosMotorista)));
}

function iconeVeiculo(tipo){
  if(tipo === 'cavalo') return ic('truck', 18);
  if(tipo === 'dolly') return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="9" width="18" height="6" rx="1"/><circle cx="7" cy="19" r="2"/><circle cx="17" cy="19" r="2"/></svg>`;
  return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="10" rx="1"/><circle cx="6.5" cy="19" r="2"/><circle cx="17.5" cy="19" r="2"/></svg>`;
}
function labelPosicaoConjunto(ordem, tipo){
  if(tipo === 'cavalo') return 'Cavalo mecânico';
  if(tipo === 'dolly') return 'Dolly';
  if(tipo === 'carreta') return ordem <= 2 ? '1ª carreta' : '2ª carreta';
  return tipoLabelGlobal[tipo] || tipo;
}
const tipoLabelGlobal = { cavalo:'Cavalo', carreta:'Carreta', dolly:'Dolly' };

async function loadConjuntoMotorista(){
  const conjunto = await carregarMeuConjunto();
  const veiculos = veiculosDoConjunto(conjunto);
  montarTelaMotorista({
    header: headerVoltar('Meu conjunto'),
    conteudo: veiculos.length ? `
      <div class="card lista">${veiculos.map(v => `
        <div class="list-item"><div class="li-ic">${iconeVeiculo(v.veiculo.tipo)}</div>
          <div class="li-body"><div class="li-title" style="font-family:var(--font-mono);">${esc(v.veiculo.placa)}</div><div class="li-sub">${esc(labelPosicaoConjunto(v.ordem, v.veiculo.tipo))}</div></div></div>`).join('')}</div>
      <button class="btn btn-outline" data-aba-veiculo>${ic('doc', 16)} Documentos do conjunto</button>`
      : `<div class="card em-breve-box"><div class="ic-grande">${ic('truck', 34)}</div><div class="card-dark-title">Nenhum conjunto vinculado</div><div class="card-dark-sub">Peça ao escritório para vincular o cavalo e as carretas que você dirige.</div></div>`,
  });
  const b = document.querySelector('[data-aba-veiculo]');
  if(b) b.addEventListener('click', () => { docAbaMotorista = 'veiculo'; irParaMotorista('documentos'); });
}

function loadPerfilMotorista(){
  const login = String(usuarioAtual.email || session.user.email || '').replace('@motoristas.moveria.app', '');
  montarTelaMotorista({
    header: headerVoltar('Meu perfil'),
    conteudo: `
      <div class="card" style="text-align:center; padding:26px 16px;">
        <div class="avatar" style="width:64px; height:64px; font-size:22px; margin:0 auto 12px;">${esc(iniciais(usuarioAtual.nome))}</div>
        <div class="card-dark-title" style="font-size:16px;">${esc(usuarioAtual.nome)}</div>
        <div class="card-dark-sub">${esc(papelLabel[usuarioAtual.papel] || '')} · ${esc(usuarioAtual.transportadora ? usuarioAtual.transportadora.nome_fantasia : '')}</div>
        <div class="card-dark-sub" style="margin-top:6px;">Login: <b style="color:var(--text-primary);">${esc(login)}</b></div>
      </div>
      <button class="btn btn-outline" id="btnSair">${ic('logout', 16)} Sair deste aparelho</button>`,
  });
  document.getElementById('btnSair').addEventListener('click', doLogout);
}

function loadEmBreveMotorista(recurso){
  const info = {
    oficina: ['wrench', 'Oficina / Manutenção', 'Em breve você vai poder avisar a oficina sobre um problema no veículo (categoria, urgência, descrição e foto) e acompanhar o conserto por aqui.'],
    capacitacoes: ['award', 'Capacitações', 'Em breve seus treinamentos e certificados (MOPP, direção defensiva etc.) aparecem aqui, com aviso de vencimento.'],
    agendamentos: ['cal', 'Agendamentos', 'Em breve revisões, exames e outros compromissos marcados pelo escritório aparecem aqui.'],
  }[recurso] || ['dots', 'Em breve', 'Esta função está em construção.'];
  montarTelaMotorista({
    header: headerVoltar(info[1]),
    conteudo: `<div class="card em-breve-box"><div class="ic-grande">${ic(info[0], 34)}</div><div class="card-dark-title">Em construção</div><div class="card-dark-sub">${info[2]}</div></div>`,
  });
}

