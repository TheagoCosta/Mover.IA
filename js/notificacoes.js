// MOVER.IA — Notificações (o sino).
// As notificações são criadas sozinhas pelo banco (gatilhos): chamado novo
// ou atualizado na oficina, viagem nova, agendamento novo, capacitação
// registrada e checklist com irregularidade — e, todo dia às 7h, os avisos
// de documentos/capacitações vencendo (função aviso_diario_vencimentos,
// agendada no banco). Aqui mostramos, marcamos como lidas e ativamos os
// avisos no celular (push — ver mais abaixo).
// (arquivo carregado pelo index.html; todas as funções ficam globais,
// então um arquivo pode chamar funções dos outros normalmente)

const ICONE_NOTIFICACAO = { oficina:'wrench', viagem:'truck', agenda:'cal', capacitacao:'award', checklist:'checksq', vencimento:'alert' };

async function carregarNotificacoes(limite = 40){
  const { data } = await sb.from('notificacao').select('id, tipo, titulo, mensagem, destino, lida_em, criado_em')
    .order('criado_em', { ascending: false }).limit(limite);
  return data || [];
}
async function contarNaoLidas(){
  const { count } = await sb.from('notificacao').select('id', { count: 'exact', head: true }).is('lida_em', null);
  return count || 0;
}
async function marcarNotificacoesLidas(){ await sb.rpc('marcar_notificacoes_lidas'); }

function haQuanto(valor){
  const min = Math.round((Date.now() - new Date(valor)) / 60000);
  if(min < 1) return 'agora';
  if(min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if(h < 24) return `há ${h} h`;
  const d = Math.round(h / 24);
  return d <= 7 ? `há ${d} dia${d > 1 ? 's' : ''}` : fmtData(valor);
}

// Botão do sino com o número de não lidas (id usado para ligar o clique)
function botaoSino(id, naoLidas, estilo = ''){
  return `<button class="sino" id="${id}" aria-label="Notificações${naoLidas ? ` (${naoLidas} não lidas)` : ''}" style="${estilo}">
    ${ic('bell', 20)}${naoLidas ? `<span class="sino-badge">${naoLidas > 9 ? '9+' : naoLidas}</span>` : ''}</button>`;
}

function itemNotificacao(n){
  return `
    <div class="list-item ${n.destino ? 'clickable' : ''}" data-notif-destino="${esc(n.destino || '')}" style="${n.lida_em ? '' : 'background:rgba(255,197,61,0.07); margin:0 -16px; padding-left:16px; padding-right:16px;'}">
      <div class="li-ic">${ic(ICONE_NOTIFICACAO[n.tipo] || 'bell', 16)}</div>
      <div class="li-body"><div class="li-title">${esc(n.titulo)}</div>${n.mensagem ? `<div class="li-sub">${esc(n.mensagem)}</div>` : ''}<div class="li-sub" style="opacity:.75;">${haQuanto(n.criado_em)}</div></div>
      ${n.lida_em ? '' : '<span style="width:8px; height:8px; border-radius:50%; background:#ffc53d; flex-shrink:0;"></span>'}
    </div>`;
}

// ---------- Motorista: tela própria ----------
async function loadNotificacoesMotorista(){
  const lista = await dadosTela('notificacoes', () => carregarNotificacoes(), () => { if(motoristaScreen === 'notificacoes') loadNotificacoesMotorista(); });
  montarTelaMotorista({
    header: headerVoltar('Notificações'),
    conteudo: cartaoAvisosCelular() + (lista.length ? `<div class="card lista">${lista.map(itemNotificacao).join('')}</div>`
      : `<div class="card em-breve-box"><div class="ic-grande">${ic('bell', 34)}</div><div class="card-dark-title">Nenhuma notificação</div><div class="card-dark-sub">Avisos sobre viagens, oficina, agendamentos e capacitações aparecem aqui.</div></div>`),
  });
  ligarCartaoAvisos();
  document.querySelectorAll('[data-notif-destino]').forEach(el => el.addEventListener('click', () => { if(el.dataset.notifDestino) irParaMotorista(el.dataset.notifDestino); }));
  if(lista.some(n => !n.lida_em)) marcarNotificacoesLidas();
}

// ---------- Escritório e mecânico: janela ----------
async function abrirNotificacoesJanela(aoEscolher){
  const lista = await carregarNotificacoes();
  abrirModal('Notificações', cartaoAvisosCelular() + (lista.length ? `<div class="card lista" style="margin:0;">${lista.map(itemNotificacao).join('')}</div>`
    : '<div class="l2" style="text-align:center; padding:20px 0;">Nenhuma notificação por enquanto.</div>'));
  ligarCartaoAvisos();
  document.querySelectorAll('.modal [data-notif-destino]').forEach(el => el.addEventListener('click', () => {
    if(!el.dataset.notifDestino) return;
    fecharModal();
    aoEscolher(el.dataset.notifDestino);
  }));
  if(lista.some(n => !n.lida_em)){ await marcarNotificacoesLidas(); atualizarSinos(); }
}

// ---------------------------------------------------------------------
// Avisos no celular com a tela desligada (push)
// Cada pessoa ativa no próprio aparelho (o celular pede permissão). O
// aparelho fica ligado à pessoa logada (função registrar_push); ao sair da
// conta, ele para de receber os avisos dela (remover_push). Quem envia é a
// Edge Function enviar-push, chamada pelo banco a cada notificação nova.
// No iPhone só funciona com o app instalado na tela inicial.
// ---------------------------------------------------------------------
let pushSincronizado = false;
const ehIphone = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
function pushSuportado(){ return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window; }

function bytesDaChave(b64url){
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((b64url.length + 3) % 4);
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
}
async function registroServiceWorker(){
  return (await navigator.serviceWorker.getRegistration()) || navigator.serviceWorker.register('sw.js');
}
async function salvarInscricaoPush(inscricao){
  const j = inscricao.toJSON();
  const { error } = await sb.rpc('registrar_push', { p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth, p_aparelho: navigator.userAgent });
  if(error) throw new Error(error.message);
}
async function inscreverEsteAparelho(){
  const reg = await registroServiceWorker();
  let inscricao = await reg.pushManager.getSubscription();
  if(!inscricao){
    const { data: chave, error } = await sb.rpc('chave_publica_push');
    if(error || !chave) throw new Error('Os avisos ainda não estão disponíveis no servidor.');
    inscricao = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytesDaChave(chave) });
  }
  await salvarInscricaoPush(inscricao);
}

// Botão "Ativar avisos" (precisa ser chamado por um toque da pessoa)
async function ativarAvisosCelular(){
  if(!pushSuportado()){
    if(ehIphone() && !appInstalado()) return instalarApp();
    alert('Este navegador não aceita avisos. No Android use o Chrome; no iPhone, instale o app na tela inicial.');
    return;
  }
  if(Notification.permission === 'denied') return explicarAvisosBloqueados();
  const permissao = await Notification.requestPermission();
  if(permissao !== 'granted'){ if(permissao === 'denied') explicarAvisosBloqueados(); return; }
  try{
    await inscreverEsteAparelho();
    pushSincronizado = true;
    mostrarToast('✅ Avisos ativados neste aparelho');
    document.querySelectorAll('[data-cartao-avisos]').forEach(el => el.remove());
  } catch(e){
    alert('Não consegui ativar os avisos: ' + e.message);
  }
}

function explicarAvisosBloqueados(){
  const passos = ehIphone()
    ? ['Abra os <b>Ajustes</b> do iPhone.', 'Toque em <b>Notificações</b> e depois em <b>MOVER.IA</b>.', 'Ligue <b>Permitir Notificações</b> e volte ao app.']
    : ['Toque no <b>cadeado</b> (ou nos três pontinhos) ao lado do endereço do site — no app instalado, segure o ícone do MOVER.IA e toque em <b>Informações do app</b>.', 'Abra <b>Notificações</b> / <b>Permissões</b>.', 'Marque <b>Permitir</b> e volte ao app.'];
  abrirModal('Avisos bloqueados', `
    <div class="l2" style="margin-bottom:10px;">Os avisos foram bloqueados neste aparelho. Para liberar:</div>
    <ol style="margin:0; padding-left:20px; line-height:1.6;">${passos.map(p => `<li>${p}</li>`).join('')}</ol>`);
}

// Ao entrar: se este aparelho já tem permissão, liga ele à pessoa logada
async function sincronizarPush(){
  if(pushSincronizado || !pushSuportado() || Notification.permission !== 'granted') return;
  pushSincronizado = true;
  try{ await inscreverEsteAparelho(); } catch(e){ pushSincronizado = false; }
}

// Ao sair da conta: este aparelho para de receber os avisos desta pessoa
async function removerPushDesteAparelho(){
  pushSincronizado = false;
  if(!pushSuportado()) return;
  try{
    const reg = await navigator.serviceWorker.getRegistration();
    const inscricao = reg && await reg.pushManager.getSubscription();
    if(inscricao) await Promise.race([sb.rpc('remover_push', { p_endpoint: inscricao.endpoint }), new Promise(r => setTimeout(r, 3000))]);
  } catch(e){ /* sair da conta não pode travar por isso */ }
}

// Cartão "Ative os avisos" (some quando já estão ativos neste aparelho)
function cartaoAvisosCelular(){
  let titulo, texto, botao;
  if(!pushSuportado()){
    if(!(ehIphone() && !appInstalado())) return '';
    titulo = 'Receba avisos no iPhone'; texto = 'Instale o app na tela inicial para receber os avisos com a tela desligada.'; botao = 'Instalar';
  } else if(Notification.permission === 'granted') return '';
  else if(Notification.permission === 'denied'){ titulo = 'Avisos bloqueados'; texto = 'Este aparelho está bloqueando os avisos do MOVER.IA.'; botao = 'Como liberar'; }
  else { titulo = 'Ative os avisos no celular'; texto = 'Receba viagens, chamados e vencimentos mesmo com a tela desligada.'; botao = 'Ativar'; }
  return `<div class="card" data-cartao-avisos style="display:flex; align-items:center; gap:12px;">
    <div style="color:var(--line-yellow); flex-shrink:0;">${ic('bell', 22)}</div>
    <div style="flex:1; min-width:0;"><div style="font-weight:700;">${titulo}</div><div class="l2">${texto}</div></div>
    <button class="btn btn-primary btn-sm" data-ativar-avisos>${botao}</button></div>`;
}
function ligarCartaoAvisos(){
  document.querySelectorAll('[data-ativar-avisos]').forEach(b => b.addEventListener('click', ativarAvisosCelular));
}

// Destino de uma notificação (sino ou aviso do celular) → prepara a tela
// certa para quem está logado
function prepararDestino(destino){
  if(!destino || !usuarioAtual) return;
  if(usuarioAtual.papel === 'motorista'){
    if(destino.startsWith('tab:')){ motoristaScreen = 'home'; motoristaTab = destino.slice(4); }
    else motoristaScreen = destino;
  } else if(usuarioAtual.papel === 'mecanico'){
    mecanicoTab = 'chamados'; mecanicoFiltro = 'pendentes';
  } else {
    screen = { agendamentos:'agenda', 'tab:viagem':'painel', documentosMotorista:'documentos', documentosConjunto:'documentos' }[destino] || destino;
    documentosSubtela = 'lista';
  }
}
function abrirDestinoNotificacao(destino){
  prepararDestino(destino);
  loadShell();
  window.scrollTo(0, 0);
}
// Tocou no aviso com o app aberto: o service worker manda para cá
if('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', (e) => {
  if(!session || !usuarioAtual || !e.data) return;
  if(e.data.tipo === 'abrir') abrirDestinoNotificacao(e.data.destino);
  if(e.data.tipo === 'nova-notificacao') atualizarSinos();
});
// Abriu o app tocando no aviso: o destino vem no endereço (?abrir=...)
function lerDestinoDaUrl(){
  const params = new URLSearchParams(location.search);
  const destino = params.get('abrir');
  if(destino){ params.delete('abrir'); history.replaceState(null, '', location.pathname + (params.toString() ? '?' + params : '')); }
  return destino;
}

// Atualiza o número no sino que estiver na tela (sem recarregar a página)
async function atualizarSinos(){
  const botoes = document.querySelectorAll('.sino');
  if(!botoes.length) return;
  const n = await contarNaoLidas();
  botoes.forEach(b => {
    const antigo = b.querySelector('.sino-badge');
    if(antigo) antigo.remove();
    if(n) b.insertAdjacentHTML('beforeend', `<span class="sino-badge">${n > 9 ? '9+' : n}</span>`);
  });
}
