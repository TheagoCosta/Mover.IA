// MOVER.IA — Oficina / Manutenção: chamados abertos pelo motorista, app do
// mecânico (Chamados + Frota) e a seção Oficina do painel do escritório.
// Fotos e vídeos (vários por chamado, tabela chamado_midia) ficam no bucket
// privado "oficina" (<transportadora>/<chamado>/<arquivo>).
// (arquivo carregado pelo index.html; todas as funções ficam globais,
// então um arquivo pode chamar funções dos outros normalmente)

const CATEGORIAS_CHAMADO = ['Mecânica', 'Elétrica', 'Pneus', 'Freios', 'Carroceria', 'Outro'];
const ROTULO_URGENCIA = { baixa:'Baixa', media:'Média', alta:'Alta — não roda' };
const COR_URGENCIA = { baixa:'green', media:'amber', alta:'red' };
const ROTULO_CHAMADO = { aberto:'Aberto', em_andamento:'Em andamento', concluido:'Concluído' };
const COR_CHAMADO = { aberto:'red', em_andamento:'blue', concluido:'green' };
const CAMPOS_CHAMADO = 'id, criado_em, atualizado_em, concluido_em, categoria, urgencia, descricao, status, observacao_reparo, foto_url, foto_reparo_url, motorista_id, veiculo_id, motorista:motorista_id(nome), veiculo:veiculo_id(placa, modelo), responsavel:responsavel_id(nome), midias:chamado_midia(id, momento, tipo, caminho, criado_em)';

let mecanicoTab = 'chamados';
let mecanicoFiltro = 'pendentes';
let oficinaFiltroEscritorio = 'pendentes';

// ---------------------------------------------------------------------
// Fotos
// ---------------------------------------------------------------------
// Reduz a foto do celular (que costuma ter 4–8 MB) pra no máximo 1600px em
// JPEG — sobe rápido mesmo no 4G da estrada e continua nítida pra oficina.
function comprimirImagem(arquivo, maxLado = 1600, qualidade = 0.82){
  return new Promise((resolve) => {
    if(!arquivo || !/^image\//.test(arquivo.type) || /heic/i.test(arquivo.type)){ resolve(arquivo); return; }
    const url = URL.createObjectURL(arquivo);
    const img = new Image();
    img.onload = () => {
      const escala = Math.min(1, maxLado / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * escala); c.height = Math.round(img.height * escala);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob(b => resolve(b || arquivo), 'image/jpeg', qualidade);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(arquivo); };
    img.src = url;
  });
}

// ---------------------------------------------------------------------
// Fotos e vídeos do chamado (tabela chamado_midia; momento = 'problema'
// quando abre o chamado, 'reparo' quando a oficina atualiza). Chamados
// antigos têm uma foto só, nos campos foto_url / foto_reparo_url — elas
// aparecem junto com as novas.
// ---------------------------------------------------------------------
const MAX_ARQUIVOS_CHAMADO = 10;
const MAX_VIDEO_MB = 50;   // limite por arquivo do plano grátis do Supabase
function ehVideo(arquivo){ return /^video\//.test(arquivo.type || '') || /\.(mp4|mov|webm|3gp|m4v)$/i.test(arquivo.name || ''); }
function resumoMidias(lista){
  const v = lista.filter(m => m.tipo === 'video' || (m instanceof File && ehVideo(m))).length, f = lista.length - v;
  return [f && `${f} foto${f > 1 ? 's' : ''}`, v && `${v} vídeo${v > 1 ? 's' : ''}`].filter(Boolean).join(' e ');
}
// confere antes de enviar; devolve a mensagem de erro (ou null se está tudo certo)
function conferirMidias(lista){
  if(lista.length > MAX_ARQUIVOS_CHAMADO) return `Escolha no máximo ${MAX_ARQUIVOS_CHAMADO} arquivos por vez.`;
  const naoMidia = lista.find(a => !ehVideo(a) && !/^image\//.test(a.type || ''));
  if(naoMidia) return `"${naoMidia.name}" não é foto nem vídeo.`;
  const grande = lista.find(a => ehVideo(a) && a.size > MAX_VIDEO_MB * 1048576);
  if(grande) return `O vídeo "${grande.name}" tem ${Math.round(grande.size / 1048576)} MB — o limite é ${MAX_VIDEO_MB} MB. Grave um vídeo mais curto (até uns 30 segundos).`;
  return null;
}

// Sobe os arquivos um por um (fotos reduzidas antes; vídeos como estão)
async function enviarMidiasChamado(chamadoId, arquivos, momento, aoProgresso){
  const erros = [];
  for(let i = 0; i < arquivos.length; i++){
    if(aoProgresso) aoProgresso(i + 1, arquivos.length);
    const arquivo = arquivos[i], video = ehVideo(arquivo);
    const blob = video ? arquivo : await comprimirImagem(arquivo);
    const extOriginal = ((arquivo.name || '').split('.').pop() || '').toLowerCase();
    const ext = video ? (extOriginal || 'mp4') : (blob.type === 'image/jpeg' ? 'jpg' : (extOriginal || 'jpg'));
    const caminho = `${usuarioAtual.transportadora_id}/${chamadoId}/${momento}_${Date.now()}_${i}.${ext}`;
    const { error: erroUp } = await sb.storage.from('oficina').upload(caminho, blob, { contentType: blob.type || (video ? 'video/mp4' : 'image/jpeg') });
    if(erroUp){ erros.push(`${arquivo.name || 'arquivo ' + (i + 1)}: ${erroUp.message}`); continue; }
    const { error } = await sb.from('chamado_midia').insert({ transportadora_id: usuarioAtual.transportadora_id, chamado_id: chamadoId, momento, tipo: video ? 'video' : 'foto', caminho });
    if(error) erros.push(`${arquivo.name || 'arquivo ' + (i + 1)}: ${error.message}`);
  }
  return erros;
}

function midiasDoChamado(c, momento){
  const lista = (c.midias || []).filter(m => m.momento === momento).sort((a, b) => String(a.criado_em || '').localeCompare(String(b.criado_em || '')));
  const antiga = momento === 'problema' ? c.foto_url : c.foto_reparo_url;
  if(antiga && !lista.some(m => m.caminho === antiga)) lista.unshift({ caminho: antiga, tipo: 'foto', momento });
  return lista;
}
function botaoMidias(c, momento, classe = 'btn-small'){
  const lista = midiasDoChamado(c, momento);
  if(!lista.length) return '';
  return `<button type="button" class="${classe}" data-midias="${c.id}" data-momento="${momento}">${ic('eye', 14)} ${momento === 'problema' ? 'Problema' : 'Reparo'}: ${resumoMidias(lista)}</button>`;
}
function ligarBotoesMidias(raiz, chamados){
  raiz.querySelectorAll('[data-midias]').forEach(b => b.addEventListener('click', () => {
    const c = chamados.find(x => x.id === b.dataset.midias);
    if(c) verMidiasChamado(c, b.dataset.momento);
  }));
}
async function verMidiasChamado(c, momento){
  const lista = midiasDoChamado(c, momento);
  if(!lista.length) return;
  const { data, error } = await sb.storage.from('oficina').createSignedUrls(lista.map(m => m.caminho), 600);
  if(error){ alert('Não consegui abrir: ' + error.message); return; }
  abrirModal(`${momento === 'problema' ? 'Problema' : 'Reparo'} — ${c.veiculo ? c.veiculo.placa + ' · ' : ''}${c.categoria}`, `
    <div class="galeria-midias">${lista.map((m, i) => {
      const url = data[i] && data[i].signedUrl;
      if(!url) return '<div class="l2">Arquivo indisponível.</div>';
      return m.tipo === 'video'
        ? `<video src="${url}" controls playsinline preload="metadata"></video>`
        : `<a href="${url}" target="_blank" rel="noopener"><img src="${url}" alt="Foto ${i + 1}" loading="lazy"></a>`;
    }).join('')}</div>`);
}

// Campo "escolher fotos/vídeos" que vai juntando os arquivos (dá para tirar
// uma foto, depois outra...). Devolve uma função que entrega a lista atual.
function campoMidias(idInput, idResumo, textoBotao){
  let escolhidos = [];
  const input = document.getElementById(idInput), resumo = document.getElementById(idResumo);
  const mostrar = () => {
    resumo.innerHTML = escolhidos.length
      ? `${ic('check', 13)} ${resumoMidias(escolhidos)} pronto${escolhidos.length > 1 ? 's' : ''} para enviar · <a href="#" data-limpar-midias>remover</a>`
      : '';
    const limpar = resumo.querySelector('[data-limpar-midias]');
    if(limpar) limpar.addEventListener('click', (e) => { e.preventDefault(); escolhidos = []; mostrar(); });
    const rot = input.closest('label') && input.closest('label').querySelector('span');
    if(rot) rot.textContent = escolhidos.length ? 'Adicionar mais fotos ou vídeos' : textoBotao;
  };
  input.addEventListener('change', () => {
    const novos = [...escolhidos, ...input.files];
    input.value = '';
    const erro = conferirMidias(novos);
    if(erro){ alert(erro); return; }
    escolhidos = novos; mostrar();
  });
  return () => escolhidos;
}

// ---------------------------------------------------------------------
// Andamento do chamado: aberto → em andamento → concluído
// ---------------------------------------------------------------------
async function avancarChamado(chamado, observacao){
  const agora = new Date().toISOString();
  const mudanca = { atualizado_em: agora };
  if(observacao !== undefined) mudanca.observacao_reparo = observacao || null;
  if(chamado.status === 'aberto'){ mudanca.status = 'em_andamento'; mudanca.responsavel_id = session.user.id; }
  else if(chamado.status === 'em_andamento'){ mudanca.status = 'concluido'; mudanca.concluido_em = agora; }
  const { error } = await sb.from('chamado_manutencao').update(mudanca).eq('id', chamado.id);
  if(error){ alert('Não consegui atualizar o chamado: ' + error.message); return false; }
  mostrarToast(mudanca.status === 'concluido' ? '✅ Chamado concluído' : mudanca.status === 'em_andamento' ? '🔧 Reparo iniciado' : '✅ Observação salva');
  return true;
}

// ---------------------------------------------------------------------
// MOTORISTA — abrir chamado e acompanhar
// ---------------------------------------------------------------------
let novoChamado = { categoria: null, urgencia: null };

async function buscarChamadosMotorista(){
  const { data } = await sb.from('chamado_manutencao').select(CAMPOS_CHAMADO)
    .eq('motorista_id', session.user.id).order('criado_em', { ascending:false }).limit(30);
  return data || [];
}

async function loadOficinaMotorista(){
  const conjunto = await carregarMeuConjunto();
  const veiculos = veiculosDoConjunto(conjunto);
  const chamados = await dadosTela('oficina', buscarChamadosMotorista, () => { if(motoristaScreen === 'oficina') loadOficinaMotorista(); });
  novoChamado = { categoria: null, urgencia: null };

  montarTelaMotorista({
    header: headerVoltar('Oficina / Manutenção'),
    conteudo: `
      <div class="section-label">Registrar novo problema</div>
      <div class="card">
        <div class="field-row"><label>Veículo</label>
          <select id="chVeiculo">${veiculos.length ? veiculos.map(v => `<option value="${v.veiculo_id}">${esc(v.veiculo.placa)} — ${esc(labelPosicaoConjunto(v.ordem, v.veiculo.tipo))}</option>`).join('') : '<option value="">Nenhum conjunto vinculado</option>'}</select></div>
        <div class="field-row"><label>Categoria</label>
          <div class="answer-row" id="chCategorias">${CATEGORIAS_CHAMADO.map(c => `<button class="ans-btn" type="button" data-cat="${c}">${c}</button>`).join('')}</div></div>
        <div class="field-row"><label>Urgência</label>
          <div class="answer-row" id="chUrgencias">
            <button class="ans-btn ans-ok" type="button" data-urg="baixa">Baixa</button>
            <button class="ans-btn ans-media" type="button" data-urg="media">Média</button>
            <button class="ans-btn ans-bad" type="button" data-urg="alta">Alta — não roda</button>
          </div></div>
        <div class="field-row"><label>Descreva o problema</label><textarea id="chDescricao" class="m-textarea" rows="3" placeholder="ex: barulho estranho ao frear, luz do painel acesa..."></textarea></div>
        <label class="btn btn-outline" style="margin-bottom:6px; cursor:pointer;">${ic('cam', 16)} <span>Fotos ou vídeos do problema (opcional)</span>
          <input type="file" id="chMidias" accept="image/*,video/*" multiple style="display:none;"></label>
        <div class="li-sub" id="chMidiasResumo" style="margin-bottom:10px;"></div>
        <div class="err" id="chErro"></div>
        <button class="btn btn-primary" id="btnEnviarChamado" ${veiculos.length ? '' : 'disabled'}>${ic('wrench', 16)} Enviar para a oficina</button>
      </div>
      <div class="section-label">Minhas solicitações</div>
      ${(chamados || []).length ? `<div class="card lista">${chamados.map(itemChamadoMotorista).join('')}</div>` : '<div class="status">Nenhuma solicitação registrada.</div>'}`,
  });

  const marcar = (grupo, attr, valor) => document.querySelectorAll(`#${grupo} [${attr}]`).forEach(b => b.classList.toggle('active', b.getAttribute(attr) === valor));
  document.querySelectorAll('[data-cat]').forEach(b => b.addEventListener('click', () => { novoChamado.categoria = b.dataset.cat; marcar('chCategorias', 'data-cat', b.dataset.cat); }));
  document.querySelectorAll('[data-urg]').forEach(b => b.addEventListener('click', () => { novoChamado.urgencia = b.dataset.urg; marcar('chUrgencias', 'data-urg', b.dataset.urg); }));
  const midiasEscolhidas = campoMidias('chMidias', 'chMidiasResumo', 'Fotos ou vídeos do problema (opcional)');
  document.getElementById('btnEnviarChamado').addEventListener('click', () => enviarChamadoMotorista(midiasEscolhidas()));
  ligarBotoesMidias(app, chamados || []);
}

function itemChamadoMotorista(c){
  return `
    <div class="list-item" style="flex-direction:column; align-items:stretch; gap:6px;">
      <div style="display:flex; justify-content:space-between; gap:8px; align-items:center;">
        <b style="color:var(--text-primary); font-size:13.5px;">${esc(c.categoria)} · <span style="font-family:var(--font-mono);">${esc(c.veiculo ? c.veiculo.placa : '')}</span></b>
        ${pillStatus(COR_CHAMADO[c.status], ROTULO_CHAMADO[c.status])}
      </div>
      ${c.descricao ? `<div class="li-sub">${esc(c.descricao)}</div>` : ''}
      <div class="li-sub" style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">${fmtDataHora(c.criado_em)} ${pillStatus(COR_URGENCIA[c.urgencia], ROTULO_URGENCIA[c.urgencia])}</div>
      ${c.observacao_reparo ? `<div class="li-sub" style="color:var(--line-yellow);">Oficina: ${esc(c.observacao_reparo)}</div>` : ''}
      ${c.status === 'concluido' && c.concluido_em ? `<div class="li-sub">Concluído em ${fmtDataHora(c.concluido_em)}${c.responsavel ? ' por ' + esc(c.responsavel.nome) : ''}</div>` : ''}
      ${botaoMidias(c, 'problema') || botaoMidias(c, 'reparo') ? `<div class="li-acoes">${botaoMidias(c, 'problema')}${botaoMidias(c, 'reparo')}</div>` : ''}
    </div>`;
}

async function enviarChamadoMotorista(midias){
  const erro = document.getElementById('chErro');
  const descricao = document.getElementById('chDescricao').value.trim();
  const veiculoId = document.getElementById('chVeiculo').value;
  if(!novoChamado.categoria || !novoChamado.urgencia || !descricao){ erro.textContent = 'Escolha a categoria, a urgência e descreva o problema.'; return; }
  erro.textContent = '';
  const btn = document.getElementById('btnEnviarChamado');
  btn.disabled = true; btn.textContent = 'Enviando...';

  const { data, error } = await sb.from('chamado_manutencao').insert({
    transportadora_id: usuarioAtual.transportadora_id,
    motorista_id: session.user.id,
    aberto_por: session.user.id,
    veiculo_id: veiculoId || null,
    categoria: novoChamado.categoria,
    urgencia: novoChamado.urgencia,
    descricao,
  }).select('id').single();
  if(error){ erro.textContent = 'Não consegui enviar: ' + error.message; btn.disabled = false; btn.textContent = 'Enviar para a oficina'; return; }

  if(midias.length){
    const erros = await enviarMidiasChamado(data.id, midias, 'problema', (i, total) => { btn.textContent = `Enviando arquivo ${i} de ${total}...`; });
    if(erros.length) alert('O chamado foi enviado, mas alguns arquivos não subiram:\n' + erros.join('\n'));
  }
  mostrarToast(novoChamado.urgencia === 'alta' ? '🚨 Chamado urgente enviado para a oficina' : '✅ Chamado enviado para a oficina');
  loadOficinaMotorista();
}

// ---------------------------------------------------------------------
// APP DO MECÂNICO
// ---------------------------------------------------------------------
const ABAS_MECANICO = [ { k:'chamados', l:'Chamados', i:'wrench' }, { k:'agenda', l:'Agenda', i:'cal' }, { k:'frota', l:'Frota', i:'truck' } ];

function montarTelaMecanico({ header, conteudo }){
  app.innerHTML = `
    <div class="m-app">
      ${header}
      <div class="m-content">${conteudo}</div>
      <nav class="tabbar">
        ${ABAS_MECANICO.map(a => `<button class="tab ${mecanicoTab === a.k ? 'active' : ''}" data-tab-mec="${a.k}">${ic(a.i, 20)}<span>${a.l}</span></button>`).join('')}
      </nav>
    </div>`;
  document.querySelectorAll('[data-tab-mec]').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('[data-tab-mec]').forEach(o => o.classList.toggle('active', o === b));  // resposta imediata ao toque
    mecanicoTab = b.dataset.tabMec; loadShellMecanico(); window.scrollTo(0, 0);
  }));
  const sair = document.getElementById('btnSairMec');
  if(sair) sair.addEventListener('click', () => { if(confirm('Sair deste aparelho?')) doLogout(); });
  const sino = document.getElementById('btnSinoMecanico');
  if(sino){
    sino.addEventListener('click', () => abrirNotificacoesJanela(() => { mecanicoTab = 'chamados'; mecanicoFiltro = 'pendentes'; loadShellMecanico(); }));
    atualizarSinos();
  }
}

function headerMecanico(titulo, sub){
  return headerPrincipal(titulo, sub, `<div style="display:flex; align-items:center; gap:6px;">${botaoSino('btnSinoMecanico', 0)}<button class="back-btn" id="btnSairMec" title="Sair" style="width:auto; height:auto; padding:8px 10px; border-radius:9px; background:var(--asphalt-800); border:1px solid var(--asphalt-700); color:var(--text-secondary);">${ic('logout', 16)}</button></div>`);
}

async function loadShellMecanico(){
  navegacaoTela++;
  const inicio = performance.now();
  mostrarCarregando();
  try{ await abrirTelaMecanico(); }
  finally{ esconderCarregando(); registrarTela(performance.now() - inicio); }
}

async function abrirTelaMecanico(){
  if(mecanicoTab === 'frota') return loadFrotaMecanico();
  if(mecanicoTab === 'agenda') return loadAgendaMecanico();

  const { data: chamados, error } = await dadosTela('mec_chamados', async () => {
    const { data, error } = await sb.from('chamado_manutencao').select(CAMPOS_CHAMADO).order('criado_em', { ascending:false }).limit(200);
    return { data: data || [], error: error ? { message: error.message } : null };
  }, () => { if(mecanicoTab === 'chamados') abrirTelaMecanico(); });
  const lista = chamados || [];
  setTimeout(() => preCarregarTela('mec_agenda', buscarAgendaMecanico), 400);
  const pendentes = lista.filter(c => c.status !== 'concluido')
    .sort((a, b) => (b.urgencia === 'alta') - (a.urgencia === 'alta') || (a.status === 'aberto' ? 0 : 1) - (b.status === 'aberto' ? 0 : 1) || new Date(a.criado_em) - new Date(b.criado_em));
  const concluidos = lista.filter(c => c.status === 'concluido');
  const visiveis = mecanicoFiltro === 'concluidos' ? concluidos : pendentes;
  const n = (s) => lista.filter(c => c.status === s).length;

  montarTelaMecanico({
    header: headerMecanico('Oficina', `${(usuarioAtual.nome || '').split(' ')[0]} · ${usuarioAtual.transportadora ? usuarioAtual.transportadora.nome_fantasia : ''}`),
    conteudo: `
      ${error ? `<div class="status">Erro ao carregar chamados: ${esc(error.message)}</div>` : ''}
      ${cartaoAvisosCelular()}
      <div class="grid2" style="margin-bottom:14px;">
        <div class="card" style="text-align:center; padding:14px; margin:0;"><div class="gauge-val" style="margin-top:0; font-size:22px; color:${n('aberto') ? 'var(--signal-red)' : 'var(--text-primary)'};">${n('aberto')}</div><div class="gauge-lbl">Abertos</div></div>
        <div class="card" style="text-align:center; padding:14px; margin:0;"><div class="gauge-val" style="margin-top:0; font-size:22px;">${n('em_andamento')}</div><div class="gauge-lbl">Em andamento</div></div>
      </div>
      <div class="doc-tabs">
        <button class="${mecanicoFiltro === 'pendentes' ? 'active' : ''}" data-filtro-mec="pendentes">A fazer (${pendentes.length})</button>
        <button class="${mecanicoFiltro === 'concluidos' ? 'active' : ''}" data-filtro-mec="concluidos">Concluídos (${concluidos.length})</button>
      </div>
      ${visiveis.length ? visiveis.map(cardChamadoMecanico).join('') : `<div class="card em-breve-box"><div class="ic-grande">${ic('check', 32)}</div><div class="card-dark-title">${mecanicoFiltro === 'pendentes' ? 'Nenhum chamado pendente' : 'Nenhum chamado concluído ainda'}</div><div class="card-dark-sub">${mecanicoFiltro === 'pendentes' ? 'Quando um motorista registrar um problema, ele aparece aqui.' : ''}</div></div>`}`,
  });

  ligarCartaoAvisos();
  document.querySelectorAll('[data-filtro-mec]').forEach(b => b.addEventListener('click', () => { mecanicoFiltro = b.dataset.filtroMec; loadShellMecanico(); }));
  ligarBotoesMidias(app, lista);
  document.querySelectorAll('[data-midias-reparo]').forEach(inp => inp.addEventListener('change', async () => {
    const arquivos = [...inp.files];
    inp.value = '';
    if(!arquivos.length) return;
    const erro = conferirMidias(arquivos);
    if(erro){ alert(erro); return; }
    const rotulo = inp.closest('label').querySelector('span');
    const erros = await enviarMidiasChamado(inp.dataset.midiasReparo, arquivos, 'reparo', (i, total) => { rotulo.textContent = `Enviando ${i} de ${total}...`; });
    if(erros.length) alert('Alguns arquivos não subiram:\n' + erros.join('\n'));
    else mostrarToast(`📷 ${resumoMidias(arquivos)} do reparo anexado${arquivos.length > 1 ? 's' : ''}`);
    loadShellMecanico();
  }));
  document.querySelectorAll('[data-avancar]').forEach(b => b.addEventListener('click', async () => {
    const chamado = lista.find(c => c.id === b.dataset.avancar);
    const obs = document.getElementById('obs_' + chamado.id).value.trim();
    if(chamado.status === 'em_andamento' && !obs && !confirm('Concluir sem escrever o que foi feito?')) return;
    b.disabled = true;
    if(await avancarChamado(chamado, obs)) loadShellMecanico(); else b.disabled = false;
  }));
  document.querySelectorAll('[data-salvar-obs]').forEach(b => b.addEventListener('click', async () => {
    const chamado = lista.find(c => c.id === b.dataset.salvarObs);
    b.disabled = true;
    const { error } = await sb.from('chamado_manutencao').update({ observacao_reparo: document.getElementById('obs_' + chamado.id).value.trim() || null, atualizado_em: new Date().toISOString() }).eq('id', chamado.id);
    if(error) alert('Não consegui salvar: ' + error.message); else mostrarToast('✅ Observação salva');
    b.disabled = false;
  }));
}

function cardChamadoMecanico(c){
  const pendente = c.status !== 'concluido';
  return `
    <div class="card" style="${c.urgencia === 'alta' && pendente ? 'border-color:var(--signal-red);' : ''}">
      <div style="display:flex; justify-content:space-between; gap:8px; align-items:center; margin-bottom:6px;">
        <b style="color:var(--text-primary); font-size:14px;"><span style="font-family:var(--font-mono);">${esc(c.veiculo ? c.veiculo.placa : 'Sem veículo')}</span> · ${esc(c.categoria)}</b>
        ${pillStatus(COR_CHAMADO[c.status], ROTULO_CHAMADO[c.status])}
      </div>
      ${c.descricao ? `<div class="card-dark-sub" style="color:var(--text-primary); margin-bottom:6px;">${esc(c.descricao)}</div>` : ''}
      <div class="li-sub" style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-bottom:8px;">
        ${fmtDataHora(c.criado_em)} · ${esc(c.motorista ? c.motorista.nome : 'Aberto pelo escritório')} ${pillStatus(COR_URGENCIA[c.urgencia], ROTULO_URGENCIA[c.urgencia])}
      </div>
      ${botaoMidias(c, 'problema') ? `<div style="margin-bottom:10px;">${botaoMidias(c, 'problema')}</div>` : ''}
      ${pendente ? `
        <div class="field-row" style="margin-bottom:8px;"><label>Observação do conserto</label>
          <textarea id="obs_${c.id}" class="m-textarea" rows="2" style="min-height:60px;" placeholder="ex: peça pedida, previsão de conclusão...">${esc(c.observacao_reparo || '')}</textarea></div>
        <div class="grid2">
          <label class="btn btn-outline btn-sm" style="width:100%; cursor:pointer;">${ic('cam', 14)} <span>Fotos / vídeos do reparo</span>
            <input type="file" accept="image/*,video/*" multiple data-midias-reparo="${c.id}" style="display:none;"></label>
          <button class="btn ${c.status === 'aberto' ? 'btn-outline' : 'btn-primary'} btn-sm" style="width:100%;" data-avancar="${c.id}">${c.status === 'aberto' ? `${ic('wrench', 14)} Iniciar reparo` : `${ic('check', 14)} Concluir`}</button>
        </div>
        <div style="display:flex; gap:8px; margin-top:8px; flex-wrap:wrap;">
          ${c.status === 'em_andamento' ? `<button class="btn-small" data-salvar-obs="${c.id}">Salvar observação</button>` : ''}
          ${botaoMidias(c, 'reparo')}
        </div>
        ${c.responsavel ? `<div class="li-sub" style="margin-top:8px;">Em reparo por ${esc(c.responsavel.nome)}</div>` : ''}`
      : `
        ${c.observacao_reparo ? `<div class="li-sub" style="color:var(--line-yellow);">Obs: ${esc(c.observacao_reparo)}</div>` : ''}
        <div class="li-sub" style="margin-top:4px;">Concluído em ${fmtDataHora(c.concluido_em)}${c.responsavel ? ' por ' + esc(c.responsavel.nome) : ''}</div>
        ${botaoMidias(c, 'reparo') ? `<div style="margin-top:8px;">${botaoMidias(c, 'reparo')}</div>` : ''}`}
    </div>`;
}

async function loadFrotaMecanico(){
  const [{ data: conjuntos }, { data: chamados }, { data: veiculos }] = await dadosTela('mec_frota', async () => {
    const r = await Promise.all([
      sb.from('conjunto').select('id, ativo, motorista:motorista_id(nome), conjunto_item(ordem, veiculo_id, veiculo:veiculo_id(placa, tipo, modelo))'),
      sb.from('chamado_manutencao').select('veiculo_id, status').neq('status', 'concluido'),
      sb.from('veiculo').select('id, placa, tipo, modelo').order('placa'),
    ]);
    return r.map(x => ({ data: x.data || [] }));
  }, () => { if(mecanicoTab === 'frota') abrirTelaMecanico(); });
  const abertosPorVeiculo = {};
  (chamados || []).forEach(c => { if(c.veiculo_id) abertosPorVeiculo[c.veiculo_id] = (abertosPorVeiculo[c.veiculo_id] || 0) + 1; });
  const noConjunto = new Set();
  (conjuntos || []).forEach(c => (c.conjunto_item || []).forEach(i => noConjunto.add(i.veiculo_id)));
  const avulsos = (veiculos || []).filter(v => !noConjunto.has(v.id));
  const linhaVeiculo = (placa, rotulo, modelo, vid) => `
    <div class="list-item"><div class="li-ic">${ic('truck', 16)}</div>
      <div class="li-body"><div class="li-title" style="font-family:var(--font-mono);">${esc(placa)}</div><div class="li-sub">${esc([rotulo, modelo].filter(Boolean).join(' · '))}</div></div>
      ${abertosPorVeiculo[vid] ? pillStatus('red', `${abertosPorVeiculo[vid]} chamado${abertosPorVeiculo[vid] > 1 ? 's' : ''}`) : ''}</div>`;

  montarTelaMecanico({
    header: headerMecanico('Frota', 'Placas, conjuntos e motoristas'),
    conteudo: `
      ${(conjuntos || []).map(c => `
        <div class="section-label">${esc(c.motorista ? c.motorista.nome : 'Conjunto sem motorista')}</div>
        <div class="card lista">${[...(c.conjunto_item || [])].sort((a, b) => a.ordem - b.ordem).map(i => linhaVeiculo(i.veiculo.placa, labelPosicaoConjunto(i.ordem, i.veiculo.tipo), i.veiculo.modelo, i.veiculo_id)).join('')}</div>`).join('')}
      ${avulsos.length ? `<div class="section-label">Veículos fora de conjunto</div><div class="card lista">${avulsos.map(v => linhaVeiculo(v.placa, tipoLabelGlobal[v.tipo], v.modelo, v.id)).join('')}</div>` : ''}
      ${!(conjuntos || []).length && !avulsos.length ? '<div class="status">Nenhum veículo cadastrado.</div>' : ''}`,
  });
}

// ---------------------------------------------------------------------
// ESCRITÓRIO — seção Oficina
// ---------------------------------------------------------------------
async function secaoOficina(el){
  const [chamados, veiculos, usuarios] = await Promise.all([
    consultar(sb.from('chamado_manutencao').select(CAMPOS_CHAMADO).order('criado_em', { ascending:false }).limit(300)),
    qVeiculos(), qUsuarios(),
  ]);
  const abertos = chamados.filter(c => c.status === 'aberto').length;
  const andamento = chamados.filter(c => c.status === 'em_andamento').length;
  const urgentes = chamados.filter(c => c.urgencia === 'alta' && c.status !== 'concluido').length;
  const visiveis = oficinaFiltroEscritorio === 'todos' ? chamados : chamados.filter(c => oficinaFiltroEscritorio === 'concluidos' ? c.status === 'concluido' : c.status !== 'concluido');
  const mecanicos = usuarios.filter(u => u.papel === 'mecanico' && u.ativo);

  el.innerHTML = `
    <div class="kpi-row tres">
      ${kpi(abertos, 'Chamados abertos', abertos ? 'Aguardando a oficina' : '', abertos ? 'vermelho' : '')}
      ${kpi(andamento, 'Em andamento')}
      ${kpi(urgentes, 'Urgentes (não roda)', urgentes ? 'Veículo parado' : 'Nenhum', urgentes ? 'vermelho' : 'verde')}
    </div>
    ${mecanicos.length ? '' : `<div class="o-banner">${ic('wrench', 18)}<div class="txt"><b>Nenhum mecânico cadastrado</b>Cadastre o mecânico interno em <a href="#" data-ir="usuarios">Usuários</a> para ele acompanhar os chamados pelo celular. Se a oficina for terceirizada, atualize os chamados por aqui mesmo.</div></div>`}
    <div class="doc-tabs" style="max-width:460px;">
      ${[['pendentes', 'A fazer'], ['concluidos', 'Concluídos'], ['todos', 'Todos']].map(([k, l]) => `<button class="${oficinaFiltroEscritorio === k ? 'active' : ''}" data-filtro-of="${k}">${l}</button>`).join('')}
    </div>
    ${painel(`Chamados de manutenção (${visiveis.length})`,
      visiveis.length ? tabela(['Data', 'Placa', 'Motorista', 'Categoria', 'Descrição', 'Urgência', 'Status', ''],
        visiveis.map(c => `<tr>
          <td class="sub">${fmtDataHora(c.criado_em)}</td>
          <td class="mono">${esc(c.veiculo ? c.veiculo.placa : '—')}</td>
          <td>${esc(c.motorista ? c.motorista.nome : '—')}</td>
          <td>${esc(c.categoria)}</td>
          <td>${esc(c.descricao || '')}${c.observacao_reparo ? `<div class="sub" style="color:var(--signal-amber-ink);">Oficina: ${esc(c.observacao_reparo)}</div>` : ''}${c.responsavel ? `<div class="sub">Responsável: ${esc(c.responsavel.nome)}</div>` : ''}</td>
          <td>${badge(COR_URGENCIA[c.urgencia], ROTULO_URGENCIA[c.urgencia])}</td>
          <td>${badge(COR_CHAMADO[c.status], ROTULO_CHAMADO[c.status])}${c.concluido_em ? `<div class="sub">${fmtData(c.concluido_em)}</div>` : ''}</td>
          <td><div class="o-acoes">
            ${botaoMidias(c, 'problema', 'btn btn-outline btn-sm')}
            ${botaoMidias(c, 'reparo', 'btn btn-outline btn-sm')}
            ${c.status !== 'concluido' ? `<button class="btn btn-outline btn-sm" data-atualizar="${c.id}">${c.status === 'aberto' ? 'Iniciar' : 'Concluir'}</button>` : ''}
          </div></td></tr>`))
        : vazio(oficinaFiltroEscritorio === 'pendentes' ? 'Nenhum chamado pendente.' : 'Nenhum chamado por aqui.'),
      `<button class="btn btn-primary btn-sm" id="btnAbrirChamado">${ic('plus', 15)} Abrir chamado</button>${chamados.length ? botaoExportar('btnCsvOficina') : ''}`)}`;

  el.querySelectorAll('[data-ir]').forEach(a => a.addEventListener('click', (e) => { e.preventDefault(); screen = a.dataset.ir; loadEscritorio(); }));
  el.querySelectorAll('[data-filtro-of]').forEach(b => b.addEventListener('click', () => { oficinaFiltroEscritorio = b.dataset.filtroOf; secaoOficina(el); }));
  ligarBotoesMidias(el, chamados);
  el.querySelectorAll('[data-atualizar]').forEach(b => b.addEventListener('click', () => abrirAtualizacaoChamado(chamados.find(c => c.id === b.dataset.atualizar), el)));
  document.getElementById('btnAbrirChamado').addEventListener('click', () => abrirNovoChamadoEscritorio(veiculos, usuarios.filter(u => u.papel === 'motorista' && u.ativo), el));
  const csv = document.getElementById('btnCsvOficina');
  if(csv) csv.addEventListener('click', () => baixarCSV('chamados_oficina', ['Aberto em', 'Placa', 'Motorista', 'Categoria', 'Descrição', 'Urgência', 'Status', 'Observação da oficina', 'Responsável', 'Concluído em'],
    chamados.map(c => [fmtDataHora(c.criado_em), c.veiculo ? c.veiculo.placa : '', c.motorista ? c.motorista.nome : '', c.categoria, c.descricao || '', ROTULO_URGENCIA[c.urgencia], ROTULO_CHAMADO[c.status], c.observacao_reparo || '', c.responsavel ? c.responsavel.nome : '', c.concluido_em ? fmtDataHora(c.concluido_em) : ''])));
}

// Escritório atualiza o chamado em nome da oficina (útil quando é terceirizada)
function abrirAtualizacaoChamado(chamado, el){
  if(!chamado) return;
  const concluir = chamado.status === 'em_andamento';
  abrirModal(`${concluir ? 'Concluir' : 'Iniciar'} reparo — ${chamado.veiculo ? chamado.veiculo.placa : ''} · ${chamado.categoria}`, `
    <div class="l2" style="margin-bottom:12px;">${esc(chamado.descricao || '')}</div>
    <form id="formAtualizarChamado">
      <div class="field-row" style="margin:0;"><label>Observação do conserto</label>
        <textarea id="atObs" rows="3" placeholder="${concluir ? 'O que foi feito? (peça trocada, oficina, valor...)' : 'ex: enviado para a oficina X, previsão...'}">${esc(chamado.observacao_reparo || '')}</textarea></div>
      <div class="field-row" style="margin:0;"><label>Fotos ou vídeos do reparo (opcional, até ${MAX_ARQUIVOS_CHAMADO})</label><input type="file" id="atMidias" accept="image/*,video/*" multiple></div>
      <button type="submit">${concluir ? 'Concluir chamado' : 'Iniciar reparo'}</button>
    </form>`);
  document.getElementById('formAtualizarChamado').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    const arquivos = [...document.getElementById('atMidias').files];
    const erro = conferirMidias(arquivos);
    if(erro){ alert(erro); return; }
    btn.disabled = true; btn.textContent = 'Salvando...';
    if(arquivos.length){
      const erros = await enviarMidiasChamado(chamado.id, arquivos, 'reparo', (i, total) => { btn.textContent = `Enviando arquivo ${i} de ${total}...`; });
      if(erros.length) alert('Alguns arquivos não subiram:\n' + erros.join('\n'));
    }
    if(await avancarChamado(chamado, document.getElementById('atObs').value.trim())){ fecharModal(); secaoOficina(el); }
    else { btn.disabled = false; btn.textContent = concluir ? 'Concluir chamado' : 'Iniciar reparo'; }
  });
}

function abrirNovoChamadoEscritorio(veiculos, motoristas, el){
  abrirModal('Abrir chamado de manutenção', `
    <form id="formNovoChamado">
      <div class="o-form-grid">
        <div class="field-row" style="margin:0;"><label>Veículo</label>
          <select id="ncVeiculo" required><option value="">Selecione</option>${veiculos.map(v => `<option value="${v.id}">${esc(v.placa)} · ${esc(tipoLabelGlobal[v.tipo] || v.tipo)}</option>`).join('')}</select></div>
        <div class="field-row" style="margin:0;"><label>Motorista (opcional)</label>
          <select id="ncMotorista"><option value="">—</option>${motoristas.map(m => `<option value="${m.id}">${esc(m.nome)}</option>`).join('')}</select></div>
        <div class="field-row" style="margin:0;"><label>Categoria</label>
          <select id="ncCategoria" required>${CATEGORIAS_CHAMADO.map(c => `<option>${c}</option>`).join('')}</select></div>
        <div class="field-row" style="margin:0;"><label>Urgência</label>
          <select id="ncUrgencia" required><option value="baixa">Baixa</option><option value="media" selected>Média</option><option value="alta">Alta — não roda</option></select></div>
      </div>
      <div class="field-row" style="margin:0;"><label>Descrição</label><textarea id="ncDescricao" rows="3" required></textarea></div>
      <div class="field-row" style="margin:0;"><label>Fotos ou vídeos (opcional, até ${MAX_ARQUIVOS_CHAMADO})</label><input type="file" id="ncMidias" accept="image/*,video/*" multiple></div>
      <button type="submit">Abrir chamado</button>
    </form>`);
  document.getElementById('formNovoChamado').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    const arquivos = [...document.getElementById('ncMidias').files];
    const erroMidia = conferirMidias(arquivos);
    if(erroMidia){ alert(erroMidia); return; }
    btn.disabled = true; btn.textContent = 'Salvando...';
    const { data, error } = await sb.from('chamado_manutencao').insert({
      transportadora_id: usuarioAtual.transportadora_id,
      veiculo_id: document.getElementById('ncVeiculo').value,
      motorista_id: document.getElementById('ncMotorista').value || null,
      aberto_por: session.user.id,
      categoria: document.getElementById('ncCategoria').value,
      urgencia: document.getElementById('ncUrgencia').value,
      descricao: document.getElementById('ncDescricao').value.trim(),
    }).select('id').single();
    if(error){ alert('Não consegui abrir o chamado: ' + error.message); btn.disabled = false; btn.textContent = 'Abrir chamado'; return; }
    if(arquivos.length){
      const erros = await enviarMidiasChamado(data.id, arquivos, 'problema', (i, total) => { btn.textContent = `Enviando arquivo ${i} de ${total}...`; });
      if(erros.length) alert('Chamado aberto, mas alguns arquivos não subiram:\n' + erros.join('\n'));
    }
    fecharModal();
    mostrarToast('✅ Chamado aberto');
    secaoOficina(el);
  });
}

// Cadastro de mecânico (Usuários → Cadastrar mecânico)
function abrirCadastroMecanico(){
  abrirModal('Cadastrar mecânico', `
    <form id="formNovoMecanico">
      <div class="l2">O app cria o login (ex: <b>joao.silva</b>) e uma senha temporária. No primeiro acesso, o mecânico troca a senha. Ele só vê a Oficina e a frota — nada de documentos ou dados pessoais dos motoristas.</div>
      <div class="field-row" style="margin:0;"><label>Nome completo</label><input type="text" id="nmNome" required minlength="5" placeholder="ex: João da Silva"></div>
      <div class="err" id="nmErro"></div>
      <button type="submit">Cadastrar mecânico</button>
    </form>`);
  document.getElementById('formNovoMecanico').addEventListener('submit', async (e) => {
    e.preventDefault();
    const nome = document.getElementById('nmNome').value.trim().replace(/\s+/g, ' ');
    if(nome.split(' ').length < 2){ document.getElementById('nmErro').textContent = 'Digite nome e sobrenome.'; return; }
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = 'Cadastrando...';
    const r = await criarMotoristaAutomatico(nome, null, 'mecanico');
    if(r.error){ document.getElementById('nmErro').textContent = r.error; btn.disabled = false; btn.textContent = 'Cadastrar mecânico'; return; }
    fecharModal();
    await mostrarCredenciaisNovoMotorista(r.motorista, 'Mecânico cadastrado',
      'Anote e repasse ao mecânico. Ele entra pelo mesmo endereço do app com este login; no primeiro acesso, troca a senha.');
    loadEscritorio();
  });
}
