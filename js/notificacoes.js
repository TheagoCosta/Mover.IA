// MOVER.IA — Notificações (o sino).
// As notificações são criadas sozinhas pelo banco (gatilhos): chamado novo
// ou atualizado na oficina, viagem nova, agendamento novo, capacitação
// registrada e checklist com irregularidade. Aqui só mostramos e marcamos
// como lidas (função marcar_notificacoes_lidas).
// (arquivo carregado pelo index.html; todas as funções ficam globais,
// então um arquivo pode chamar funções dos outros normalmente)

const ICONE_NOTIFICACAO = { oficina:'wrench', viagem:'truck', agenda:'cal', capacitacao:'award', checklist:'checksq' };

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
  const lista = await carregarNotificacoes();
  montarTelaMotorista({
    header: headerVoltar('Notificações'),
    conteudo: lista.length ? `<div class="card lista">${lista.map(itemNotificacao).join('')}</div>`
      : `<div class="card em-breve-box"><div class="ic-grande">${ic('bell', 34)}</div><div class="card-dark-title">Nenhuma notificação</div><div class="card-dark-sub">Avisos sobre viagens, oficina, agendamentos e capacitações aparecem aqui.</div></div>`,
  });
  document.querySelectorAll('[data-notif-destino]').forEach(el => el.addEventListener('click', () => { if(el.dataset.notifDestino) irParaMotorista(el.dataset.notifDestino); }));
  if(lista.some(n => !n.lida_em)) marcarNotificacoesLidas();
}

// ---------- Escritório e mecânico: janela ----------
async function abrirNotificacoesJanela(aoEscolher){
  const lista = await carregarNotificacoes();
  abrirModal('Notificações', lista.length ? `<div class="card lista" style="margin:0;">${lista.map(itemNotificacao).join('')}</div>`
    : '<div class="l2" style="text-align:center; padding:20px 0;">Nenhuma notificação por enquanto.</div>');
  document.querySelectorAll('.modal [data-notif-destino]').forEach(el => el.addEventListener('click', () => {
    if(!el.dataset.notifDestino) return;
    fecharModal();
    aoEscolher(el.dataset.notifDestino);
  }));
  if(lista.some(n => !n.lida_em)){ await marcarNotificacoesLidas(); atualizarSinos(); }
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
