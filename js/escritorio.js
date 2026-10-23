// MOVER.IA — painel do escritório (layout do protótipo: menu lateral + seções)
// (arquivo carregado pelo index.html; todas as funções ficam globais,
// então um arquivo pode chamar funções dos outros normalmente)

const SECOES_ESCRITORIO = [
  { k:'painel',        l:'Painel',        i:'home',    meta:() => `Visão geral da frota — hoje, ${hojeExtenso()}` },
  { k:'motoristas',    l:'Motoristas',    i:'user',    meta:() => 'Documentação e situação de todos os motoristas' },
  { k:'veiculos',      l:'Veículos',      i:'truck',   meta:() => 'Conjuntos e documentação da frota' },
  { k:'viagens',       l:'Viagens',       i:'map',     meta:() => 'Viagens em andamento e concluídas — MDF-e, CT-e e arquivos' },
  { k:'abastecimento', l:'Abastecimento', i:'fuel',    meta:() => 'Abastecimentos registrados, litros e gastos em posto' },
  { k:'consumo',       l:'Consumo',       i:'chart',   meta:() => 'Média de consumo por veículo e por motorista, evolução e alertas' },
  { k:'oficina',       l:'Oficina',       i:'wrench',  meta:() => 'Chamados de manutenção — motoristas, mecânico e oficinas externas' },
  { k:'jornadas',      l:'Jornadas',      i:'clock',   meta:() => 'Registro de horas de condução e paradas' },
  { k:'checklists',    l:'Checklists',    i:'checksq', meta:() => 'Inspeções pré-viagem enviadas pelos motoristas' },
  { k:'documentos',    l:'Documentos',    i:'doc',     meta:() => 'Repositório central de documentos' },
  { k:'capacitacoes',  l:'Capacitações',  i:'award',   meta:() => 'Treinamentos e certificações da equipe' },
  { k:'agenda',        l:'Agenda',        i:'cal',     meta:() => 'Revisões, exames e compromissos agendados' },
  { k:'usuarios',      l:'Usuários',      i:'users',   meta:() => 'Quem tem acesso ao sistema' },
  { k:'privacidade',   l:'Privacidade',   i:'lock',    meta:() => 'LGPD — pedidos dos titulares e leitura da política' },
  { k:'integracao',    l:'Integração',    i:'sync',    meta:() => 'Bsoft (TMS): MDF-e, CT-e e PDFs direto no app do motorista' },
  { k:'config',        l:'Configurações', i:'gear',    meta:() => 'Dados da empresa e plano contratado' },
];

// Franquia de cada plano (ver docs/plano-execucao-mover-ia.md, "Modelo de negócio")
const PLANOS = {
  Essencial:    { motoristas:5,  escritorio:3,  mensalidade:'R$ 1.000/mês' },
  Profissional: { motoristas:15, escritorio:5,  mensalidade:'R$ 2.200/mês' },
  Enterprise:   { motoristas:40, escritorio:10, mensalidade:'R$ 4.500/mês' },
};

function loadEscritorio(){
  if(!SECOES_ESCRITORIO.some(s => s.k === screen)) screen = 'painel';
  const secao = SECOES_ESCRITORIO.find(s => s.k === screen);
  const empresa = usuarioAtual.transportadora ? usuarioAtual.transportadora.nome_fantasia : '—';

  app.innerHTML = `
    <div class="o-app">
      <nav class="sidebar">
        <div class="s-logo"><img src="img/icone.png" alt=""><b>MOVER.IA</b></div>
        <div class="s-empresa" title="${esc(empresa)}">${esc(empresa)}</div>
        ${SECOES_ESCRITORIO.map(s => `
          <button class="side-link ${screen === s.k ? 'active' : ''}" data-secao="${s.k}">
            ${ic(s.i, 17)}<span>${s.l}</span>${s.emBreve ? '<span class="novo">em breve</span>' : ''}
          </button>`).join('')}
      </nav>
      <div class="office-main">
        <div class="office-topbar">
          <div><h2>${secao.l}</h2><div class="meta">${esc(secao.meta())}</div></div>
          <div class="office-user">
            <div class="nome">${esc(usuarioAtual.nome)}<span>${esc(papelLabel[usuarioAtual.papel] || usuarioAtual.papel)}</span></div>
            ${botaoSino('btnSinoEscritorio', 0)}
            <div class="av">${esc(iniciais(usuarioAtual.nome))}</div>
            <button class="btn btn-outline btn-sm" id="btnSair" title="Sair">${ic('logout', 15)}<span>Sair</span></button>
          </div>
        </div>
        <div class="office-content" id="screenContent"><div class="status">Carregando...</div></div>
      </div>
    </div>`;

  document.getElementById('btnSair').addEventListener('click', doLogout);
  document.getElementById('btnSinoEscritorio').addEventListener('click', () => abrirNotificacoesJanela((destino) => {
    const secao = { agendamentos:'agenda', capacitacoes:'capacitacoes', 'tab:viagem':'viagens' }[destino] || destino;
    if(SECOES_ESCRITORIO.some(s => s.k === secao)){ screen = secao; loadEscritorio(); }
  }));
  atualizarSinos();
  document.querySelectorAll('[data-secao]').forEach(b => b.addEventListener('click', () => {
    screen = b.dataset.secao;
    documentosSubtela = 'lista';
    loadEscritorio();
    window.scrollTo(0, 0);
  }));

  const el = document.getElementById('screenContent');
  const renderizar = {
    painel: secaoPainel, motoristas: secaoMotoristas, veiculos: secaoVeiculos, viagens: secaoViagens, abastecimento: secaoAbastecimento, consumo: secaoConsumo,
    oficina: secaoOficina, jornadas: secaoJornadas, checklists: secaoChecklists, documentos: () => loadDocumentos(),
    capacitacoes: secaoCapacitacoes, agenda: secaoAgenda, usuarios: secaoUsuarios, privacidade: secaoPrivacidade, integracao: secaoIntegracao, config: secaoConfig,
  }[screen];
  Promise.resolve(renderizar(el)).catch(e => { el.innerHTML = `<div class="status">Erro ao carregar: ${esc(e.message)}</div>`; });
}

// Mantido com esse nome porque outras partes do app chamam loadPainel()
function loadPainel(){ screen = 'painel'; loadEscritorio(); }

// ---------------------------------------------------------------------
// Consultas usadas por várias seções
// ---------------------------------------------------------------------
async function consultar(promessa){
  const { data, error } = await promessa;
  if(error) throw new Error(error.message);
  return data || [];
}
// (anonimizados pela LGPD não aparecem nas listas — só na seção Privacidade)
const qUsuarios = () => consultar(sb.from('usuario').select('id, nome, papel, email, telefone, ativo, senha_temporaria, criado_em, anonimizado_em').order('nome'))
  .then(lista => lista.filter(u => !u.anonimizado_em));
const qVeiculos = () => consultar(sb.from('veiculo').select('id, placa, tipo, modelo, ano, ativo, grupo').order('placa'));
const qConjuntos = () => consultar(sb.from('conjunto').select('id, ativo, motorista_id, motorista:motorista_id(nome), conjunto_item(ordem, veiculo_id, veiculo:veiculo_id(placa, tipo, modelo, grupo))'));
const qDocumentos = () => consultar(sb.from('documento').select('id, referente_a, referente_id, tipo, numero, validade, status, arquivo_url, qr_conteudo').order('tipo'));

function itensOrdenados(conjunto){ return [...((conjunto && conjunto.conjunto_item) || [])].sort((a, b) => a.ordem - b.ordem); }
function cavaloDoConjunto(conjunto){
  const itens = itensOrdenados(conjunto);
  const cavalo = itens.find(i => i.veiculo && i.veiculo.tipo === 'cavalo') || itens[0];
  return cavalo && cavalo.veiculo ? cavalo.veiculo.placa : '—';
}
function contarIrregularidades(checklist){ return (checklist.respostas || []).filter(r => r.resposta === 'bad').length; }
function loginDoEmail(email){ return String(email || '').endsWith('@motoristas.moveria.app') ? email.split('@')[0] : email; }
function vazio(texto){ return `<div class="o-empty-note">${texto}</div>`; }
function painel(titulo, corpo, acoes = ''){
  return `<div class="o-panel"><div class="o-panel-head"><h3>${titulo}</h3>${acoes ? `<div class="o-acoes">${acoes}</div>` : ''}</div>${corpo}</div>`;
}
function tabela(cabecalho, linhas){
  return `<div class="o-table-wrap"><table class="o-table"><thead><tr>${cabecalho.map(c => `<th>${c}</th>`).join('')}</tr></thead><tbody>${linhas.join('')}</tbody></table></div>`;
}
function botaoExportar(id){ return `<button class="o-dl-btn" id="${id}" title="Baixar planilha (Excel)">${ic('download', 15)}</button>`; }
function kpi(numero, rotulo, detalhe = '', corDetalhe = ''){
  return `<div class="kpi"><div class="n">${numero}</div><div class="l">${rotulo}</div>${detalhe ? `<div class="l2 ${corDetalhe}">${detalhe}</div>` : ''}</div>`;
}
function nomeCelula(nome, sub = ''){
  return `<div class="o-name-cell"><div class="av-sm">${esc(iniciais(nome))}</div><div>${esc(nome)}${sub ? `<div class="sub">${esc(sub)}</div>` : ''}</div></div>`;
}
function mapaReferentes(usuarios, veiculos){
  const m = {};
  usuarios.forEach(u => { m['motorista:' + u.id] = u.nome; });
  veiculos.forEach(v => { m['veiculo:' + v.id] = v.placa; });
  return (doc) => doc.referente_a === 'empresa' ? 'Empresa' : (m[doc.referente_a + ':' + doc.referente_id] || '—');
}
function piorStatus(docs){
  if(!docs.length) return null;
  return docs.map(statusDocumento).sort((a, b) => PESO_STATUS_DOC[b] - PESO_STATUS_DOC[a])[0];
}

// ---------------------------------------------------------------------
// PAINEL
// ---------------------------------------------------------------------
async function secaoPainel(el){
  const seteDiasAtras = new Date(Date.now() - 7 * 86400000);
  const limiteAgenda = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const [usuarios, veiculos, conjuntos, docs, checklists, jornadas, viagens, agenda] = await Promise.all([
    qUsuarios(), qVeiculos(), qConjuntos(), qDocumentos(),
    consultar(sb.from('checklist').select('id, criado_em, respostas, motorista:motorista_id(nome), conjunto:conjunto_id(id, conjunto_item(ordem, veiculo:veiculo_id(placa, tipo)))').order('criado_em', { ascending:false }).limit(30)),
    consultar(sb.from('jornada').select('id, inicio, fim, status, motorista_id, jornada_evento(tipo, criado_em)').gte('inicio', new Date(inicioDoDia(seteDiasAtras)).toISOString())),
    consultar(sb.from('viagem').select('id, origem, destino, cte_numero, mdfe_numero, criado_em, motorista:motorista_id(nome)').eq('status', 'em_andamento').order('criado_em', { ascending:false })),
    consultar(sb.from('agendamento').select(CAMPOS_AGENDA).eq('status', 'pendente').lte('data_prevista', limiteAgenda).order('data_prevista').order('hora', { nullsFirst:true })),
  ]);

  const motoristas = usuarios.filter(u => u.papel === 'motorista' && u.ativo);
  const emJornada = new Set(jornadas.filter(j => j.status !== 'encerrada').map(j => j.motorista_id)).size;
  const conjAtivos = conjuntos.filter(c => c.ativo);
  const semMotorista = conjAtivos.filter(c => !c.motorista_id).length;
  const chkSemana = checklists.filter(c => new Date(c.criado_em) >= seteDiasAtras);
  const chkIrregulares = chkSemana.filter(c => contarIrregularidades(c) > 0).length;
  const docsAlerta = docs.filter(d => statusDocumento(d) !== 'ok');
  const docsVencidos = docsAlerta.filter(d => statusDocumento(d) === 'vencido').length;
  const nomeRef = mapaReferentes(usuarios, veiculos);

  // horas de condução por dia (últimos 7 dias, todos os motoristas)
  const dias = [...Array(7)].map((_, i) => inicioDoDia(new Date(Date.now() - (6 - i) * 86400000)));
  const horasDia = dias.map(() => 0);
  jornadas.forEach(j => {
    const eventos = [...(j.jornada_evento || [])].sort((a, b) => new Date(a.criado_em) - new Date(b.criado_em));
    const idx = dias.findIndex(d => d.getTime() === inicioDoDia(new Date(j.inicio)).getTime());
    if(idx >= 0) horasDia[idx] += calcularConducao(eventos).totalMin / 60;
  });
  const maxHoras = Math.max(8, ...horasDia);
  const letraDia = ['D','S','T','Q','Q','S','S'];

  const alertasOrdenados = [...docsAlerta].sort((a, b) =>
    PESO_STATUS_DOC[statusDocumento(b)] - PESO_STATUS_DOC[statusDocumento(a)] || (diasAte(a.validade) ?? 999) - (diasAte(b.validade) ?? 999));

  el.innerHTML = `
    <div class="kpi-row">
      ${kpi(motoristas.length, 'Motoristas ativos', emJornada ? `${emJornada} em jornada agora` : 'Nenhum em jornada agora', emJornada ? 'verde' : '')}
      ${kpi(conjAtivos.length, 'Conjuntos na frota', semMotorista ? `${semMotorista} sem motorista` : 'Todos com motorista', semMotorista ? 'ambar' : 'verde')}
      ${kpi(chkIrregulares, 'Checklists com irregularidade', `${chkSemana.length} enviado${chkSemana.length === 1 ? '' : 's'} nos últimos 7 dias`, chkIrregulares ? 'vermelho' : 'verde')}
      ${kpi(docsAlerta.length, 'Documentos vencidos ou a vencer', docsVencidos ? `${docsVencidos} vencido${docsVencidos > 1 ? 's' : ''}` : docsAlerta.length ? `Vencem em até ${DIAS_ALERTA_DOCUMENTO} dias` : 'Tudo em dia', docsVencidos ? 'vermelho' : docsAlerta.length ? 'ambar' : 'verde')}
    </div>
    <div class="two-col">
      ${painel('Alertas de documentação',
        alertasOrdenados.length ? tabela(['Motorista / veículo', 'Documento', 'Vencimento', 'Status'],
          alertasOrdenados.slice(0, 8).map(d => `<tr class="clickable" data-ir="documentos"><td>${esc(nomeRef(d))}</td><td>${esc(d.tipo)}</td><td class="sub">${esc(textoVencimento(d))}</td><td>${badgeDoc(d)}</td></tr>`))
          : vazio('Nenhum documento vencido ou vencendo nos próximos 30 dias.'),
        alertasOrdenados.length > 8 ? `<button class="btn btn-outline btn-sm" data-ir="documentos">Ver todos (${alertasOrdenados.length})</button>` : '')}
      ${painel('Horas de condução — últimos 7 dias',
        `<div style="padding:14px 18px;"><div class="bars">
          ${horasDia.map((h, i) => `<div class="bar-col"><div class="bar-val">${h >= 0.05 ? h.toFixed(1) + 'h' : ''}</div><div class="bar" style="height:${Math.max(2, h / maxHoras * 90)}px;"></div><div class="bar-lbl">${letraDia[dias[i].getDay()]}</div></div>`).join('')}
        </div><div class="l2" style="margin-top:10px;">Soma de todos os motoristas, a partir dos registros de jornada.</div></div>`)}
    </div>
    ${painel(`Viagens em andamento (${viagens.length})`,
      viagens.length ? tabela(['Motorista', 'Origem → destino', 'CT-e', 'MDF-e', 'Aberta em', 'Documentos'],
        viagens.map(v => { const n = docs.filter(d => d.referente_a === 'viagem' && d.referente_id === v.id).length; return `<tr><td>${esc(v.motorista ? v.motorista.nome : '—')}</td><td>${esc(v.origem || '?')} → ${esc(v.destino || '?')}</td><td class="mono">${esc(v.cte_numero || '—')}</td><td class="mono">${esc(v.mdfe_numero || '—')}</td><td class="sub">${fmtDataHora(v.criado_em)}</td>
          <td><button class="btn ${n ? 'btn-outline' : 'btn-primary'} btn-sm" data-docs-viagem="${v.id}">${ic('doc', 14)} ${n ? `${n} arquivo${n > 1 ? 's' : ''}` : 'Anexar'}</button></td></tr>`; }))
        : vazio('Nenhuma viagem em andamento.'),
      `<button class="btn btn-primary btn-sm" id="btnNovaViagem">${ic('plus', 15)} Nova viagem</button>`)}
    ${painel('Próximos compromissos (7 dias)',
      agenda.length ? tabela(['Data', 'Compromisso', 'Motorista / veículo', 'Situação'],
        agenda.slice(0, 8).map(a => { const [cor, txt] = situacaoAgenda(a); return `<tr class="clickable" data-ir="agenda"><td class="mono">${dataHoraAgenda(a)}</td><td>${esc(a.tipo)}</td><td>${esc([a.motorista && a.motorista.nome, a.veiculo && a.veiculo.placa].filter(Boolean).join(' · ') || 'Toda a equipe')}</td><td>${badge(cor, txt)}</td></tr>`; }))
        : vazio('Nenhum compromisso nos próximos 7 dias.'),
      `<button class="btn btn-outline btn-sm" data-ir="agenda">Abrir agenda</button>`)}
    ${painel('Checklists recentes',
      checklists.length ? tabela(['Motorista', 'Conjunto', 'Data', 'Irregularidades', 'Status'],
        checklists.slice(0, 6).map(c => { const n = contarIrregularidades(c); return `<tr class="clickable" data-checklist="${c.id}"><td>${esc(c.motorista ? c.motorista.nome : '—')}</td><td class="mono">${esc(cavaloDoConjunto(c.conjunto))}</td><td class="sub">${fmtDataHora(c.criado_em)}</td><td>${n || '—'}</td><td>${n ? badge('red', 'Irregular') : badge('green', 'OK')}</td></tr>`; }))
        : vazio('Nenhum checklist enviado ainda.'),
      checklists.filter(c => contarIrregularidades(c) > 0).length ? badge('amber', `${checklists.filter(c => contarIrregularidades(c) > 0).length} com irregularidade`) : '')}
  `;

  el.querySelectorAll('[data-ir]').forEach(b => b.addEventListener('click', () => { screen = b.dataset.ir; loadEscritorio(); }));
  el.querySelectorAll('[data-checklist]').forEach(tr => tr.addEventListener('click', () => abrirDetalheChecklist(checklists.find(c => c.id === tr.dataset.checklist))));
  document.getElementById('btnNovaViagem').addEventListener('click', () => abrirNovaViagem(usuarios.filter(u => u.papel === 'motorista' && u.ativo)));
  el.querySelectorAll('[data-docs-viagem]').forEach(b => b.addEventListener('click', () => abrirDocumentosViagem(viagens.find(v => v.id === b.dataset.docsViagem))));
}

// ---------------------------------------------------------------------
// VIAGENS — em andamento e concluídas (manuais e vindas do Bsoft)
// ---------------------------------------------------------------------
let filtroViagens = 'em_andamento';
const ROTULO_VIAGEM = { em_andamento: ['blue', 'Em andamento'], concluida: ['green', 'Concluída'] };

async function secaoViagens(el){
  const [viagens, docs, usuarios] = await Promise.all([
    consultar(sb.from('viagem').select('id, origem, destino, origem_endereco, destino_endereco, cte_numero, mdfe_numero, status, criado_em, bsoft_manifesto_id, motorista_id, motorista:motorista_id(nome), veiculo:veiculo_id(placa)').order('criado_em', { ascending:false }).limit(500)),
    consultar(sb.from('documento').select('referente_id').eq('referente_a', 'viagem')),
    qUsuarios(),
  ]);
  const nDocs = {};
  docs.forEach(d => { nDocs[d.referente_id] = (nDocs[d.referente_id] || 0) + 1; });
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
          <td>${badge(cor, txt)}</td>
          <td><button class="btn btn-outline btn-sm" data-status-viagem="${v.id}">${v.status === 'em_andamento' ? 'Concluir' : 'Reabrir'}</button></td></tr>`; }))
        : vazio(estadoListas.viagens && estadoListas.viagens.busca ? 'Nenhuma viagem encontrada nesta pesquisa.' : filtroViagens === 'em_andamento' ? 'Nenhuma viagem em andamento.' : 'Nenhuma viagem por aqui.'),
      `<button class="btn btn-primary btn-sm" id="btnNovaViagemSecao">${ic('plus', 15)} Nova viagem</button>${visiveis.length ? botaoExportar('btnCsvViagens') : ''}`);
    caixa.querySelectorAll('[data-docs-viagem]').forEach(b => b.addEventListener('click', () => abrirDocumentosViagem(viagens.find(v => v.id === b.dataset.docsViagem))));
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

// ---------------------------------------------------------------------
// ABASTECIMENTO
// ---------------------------------------------------------------------
let filtroAbastecimento = 'todos';

async function secaoAbastecimento(el){
  const [registros, comBsoft] = await Promise.all([
    consultar(sb.from('abastecimento')
      .select('id, data, tipo, km, litros, arla_litros, preco_litro_diesel, preco_litro_arla, odometro_bomba, posto, nota_numero, media_calculada, media_arla_calculada, confirmado_em, bsoft_ref, motorista:motorista_id(nome), veiculo:veiculo_id(placa), confirmado:confirmado_por(nome)')
      .order('data', { ascending:false }).limit(1000)),
    sb.from('integracao_bsoft').select('transportadora_id').maybeSingle().then(r => !!r.data),
  ]);
  // coluna do Bsoft: botão para enviar, ou a marca de que já foi
  const celulaBsoft = (a) => !comBsoft || !a.tipo ? '' : a.bsoft_ref
    ? `<span title="${esc(a.bsoft_ref)}">${badge('green', 'No Bsoft')}</span>`
    : `<button class="btn btn-outline btn-sm" data-bsoft-abast="${a.id}" title="Lançar este abastecimento no Bsoft">Enviar ao Bsoft</button>`;
  const trintaDias = new Date(Date.now() - 30 * 86400000);
  const recentes = registros.filter(a => new Date(a.data) >= trintaDias);
  const mediaGeral = consumoDe(registros).media;   // km rodados ÷ litros (ver js/consumo.js)
  const fmtNum = (n, casas = 1) => n == null ? '—' : Number(n).toLocaleString('pt-BR', { minimumFractionDigits:casas, maximumFractionDigits:casas });
  const soma = (lista, campo) => lista.reduce((s, a) => s + (Number(a[campo]) || 0), 0);
  const nInternos = recentes.filter(a => a.tipo === 'interno').length, nExternos = recentes.filter(a => a.tipo === 'externo').length;
  const mediaArlaGeral = mediaDe(registros, 'media_arla_calculada');
  const gastoPostos = recentes.reduce((s, a) => s + (valorAbastecimento(a) || 0), 0);

  const porVeiculo = {};
  registros.forEach(a => {
    const placa = a.veiculo ? a.veiculo.placa : '—';
    const v = porVeiculo[placa] || (porVeiculo[placa] = { placa, registros:[], mediasArla:[], litros:0, arla:0, n:0, ultimoKm:null, ultimaData:null });
    v.registros.push(a);
    if(a.media_arla_calculada) v.mediasArla.push(Number(a.media_arla_calculada));
    v.litros += Number(a.litros) || 0; v.arla += Number(a.arla_litros) || 0; v.n++;
    if(!v.ultimaData || new Date(a.data) > new Date(v.ultimaData)){ v.ultimaData = a.data; v.ultimoKm = a.km; }
  });
  const media = (l) => l.length ? l.reduce((s, x) => s + x, 0) / l.length : null;
  const veiculos = Object.values(porVeiculo).map(v => ({ ...v, media: consumoDe(v.registros).media, mediaArla: media(v.mediasArla) }))
    .sort((a, b) => (a.media ?? 99) - (b.media ?? 99));

  const doFiltro = filtroAbastecimento === 'todos' ? registros : registros.filter(a => a.tipo === filtroAbastecimento);
  const placaDe = (a) => a.veiculo ? a.veiculo.placa : '', motDe = (a) => a.motorista ? a.motorista.nome : '';
  const ordensAbast = [
    ['recentes', 'Mais recentes primeiro', porData(a => a.data, -1)],
    ['antigos', 'Mais antigos primeiro', porData(a => a.data, 1)],
    ['placa', 'Placa de A a Z', (a, b) => porTexto(placaDe)(a, b) || porData(x => x.data, -1)(a, b)],
    ['motorista', 'Motorista de A a Z', (a, b) => porTexto(motDe)(a, b) || porData(x => x.data, -1)(a, b)],
    ['litros', 'Mais litros de diesel', porNumero(a => a.litros == null ? null : Number(a.litros), -1)],
    ['valor', 'Maior valor', porNumero(a => valorAbastecimento(a), -1)],
    ['media', 'Pior média primeiro', porNumero(a => a.media_calculada == null ? null : Number(a.media_calculada), 1)],
  ];
  const textoAbast = (a) => [placaDe(a), motDe(a), a.posto, a.nota_numero, fmtDataHora(a.data), a.tipo ? ROTULO_TIPO_ABAST[a.tipo] : ''].join(' ');
  let visiveis = aplicarLista('abastecimentos', doFiltro, ordensAbast, textoAbast);
  const origem = (a) => a.tipo === 'externo'
    ? `${esc(a.posto || '—')}${a.nota_numero ? `<div class="sub mono">nota ${esc(a.nota_numero)}</div>` : ''}`
    : a.tipo === 'interno'
      ? `Bomba ${a.odometro_bomba != null ? fmtNum(a.odometro_bomba, 1) : '—'}${a.confirmado ? `<div class="sub">confirmado por ${esc(a.confirmado.nome)}</div>` : ''}`
      : (a.odometro_bomba != null ? `Bomba ${fmtNum(a.odometro_bomba, 1)}` : '<span class="sub">—</span>');

  el.innerHTML = `
    <div class="kpi-row">
      ${kpi(mediaGeral ? fmtNum(mediaGeral, 2) + ' km/l' : '—', 'Média de diesel da frota', `Arla: ${mediaArlaGeral ? fmtNum(mediaArlaGeral, 1) + ' km/l' : '—'}`)}
      ${kpi(fmtNum(soma(recentes, 'litros'), 0) + ' L', 'Diesel nos últimos 30 dias', `Arla: ${fmtNum(soma(recentes, 'arla_litros'), 0)} L`)}
      ${kpi(gastoPostos ? fmtReais(gastoPostos) : '—', 'Gasto em postos (30 dias)', 'Só abastecimentos externos')}
      ${kpi(recentes.length, 'Abastecimentos em 30 dias', `${nInternos} interno${nInternos === 1 ? '' : 's'} · ${nExternos} externo${nExternos === 1 ? '' : 's'}`)}
    </div>
    <div class="o-banner" style="color:var(--ink-700);">${ic('chart', 18)}<div class="txt"><b>Relatório de consumo</b>Evolução mês a mês, ranking por veículo e por motorista e alertas de consumo fora do padrão: <a href="#" data-ir-consumo>abrir o relatório</a>.</div></div>
    ${painel('Consumo médio por veículo',
      veiculos.length ? tabela(['Placa', 'Média diesel', 'Média Arla', 'Abastecimentos', 'Diesel (total)', 'Arla (total)', 'Último km'],
        veiculos.map(v => `<tr><td class="mono">${esc(v.placa)}</td><td><b>${v.media ? fmtNum(v.media, 2) + ' km/l' : '<span class="sub">—</span>'}</b></td><td>${v.mediaArla ? fmtNum(v.mediaArla, 1) + ' km/l' : '<span class="sub">—</span>'}</td><td>${v.n}</td><td>${fmtNum(v.litros, 0)} L</td><td>${v.arla ? fmtNum(v.arla, 0) + ' L' : '<span class="sub">—</span>'}</td><td class="mono">${fmtNum(v.ultimoKm, 0)}</td></tr>`))
        : vazio('Nenhum abastecimento registrado ainda. Os motoristas registram pelo app, no quadro Abastecimento do Início.'),
      veiculos.length ? botaoExportar('btnCsvConsumo') : '')}
    <div class="doc-tabs" style="max-width:420px;">
      ${[['todos', 'Todos'], ['interno', 'Internos'], ['externo', 'Externos']].map(([k, l]) => `<button class="${filtroAbastecimento === k ? 'active' : ''}" data-filtro-abast="${k}">${l}</button>`).join('')}
    </div>
    ${barraLista('abastecimentos', ordensAbast, 'Pesquisar por placa, motorista, posto ou nota')}
    <div id="listaAbast"></div>`;

  function desenharAbast(){
    visiveis = aplicarLista('abastecimentos', doFiltro, ordensAbast, textoAbast);
    const caixa = document.getElementById('listaAbast');
    caixa.innerHTML = `${painel(`Abastecimentos registrados (${visiveis.length})${visiveis.length > 200 ? ' · mostrando 200' : ''}`,
      visiveis.length ? tabela(['Data e hora', 'Tipo', 'Placa', 'Motorista', 'Km', 'Diesel', 'Arla', 'Média diesel', 'Valor', 'Posto / confirmação', ''],
        visiveis.slice(0, 200).map(a => { const valor = valorAbastecimento(a); return `<tr><td class="sub">${fmtDataHora(a.data)}</td><td>${a.tipo ? badge(a.tipo === 'interno' ? 'blue' : 'grey', ROTULO_TIPO_ABAST[a.tipo]) : '<span class="sub">—</span>'}</td><td class="mono">${esc(a.veiculo ? a.veiculo.placa : '—')}</td><td>${esc(a.motorista ? a.motorista.nome : '—')}</td><td class="mono">${fmtNum(a.km, 0)}</td>
          <td>${fmtNum(a.litros, 1)} L${a.preco_litro_diesel ? `<div class="sub">${fmtReais(a.preco_litro_diesel)}/L</div>` : ''}</td>
          <td>${a.arla_litros ? fmtNum(a.arla_litros, 1) + ' L' : '<span class="sub">—</span>'}${a.preco_litro_arla ? `<div class="sub">${fmtReais(a.preco_litro_arla)}/L</div>` : ''}${a.media_arla_calculada ? `<div class="sub">${fmtNum(a.media_arla_calculada, 1)} km/l</div>` : ''}</td>
          <td>${a.media_calculada ? fmtNum(a.media_calculada, 2) + ' km/l' : '<span class="sub">—</span>'}</td>
          <td>${valor ? fmtReais(valor) : '<span class="sub">—</span>'}</td><td>${origem(a)}</td>
          <td style="white-space:nowrap;">${celulaBsoft(a)} <button class="o-dl-btn" data-editar-abast="${a.id}" title="Corrigir ou excluir">${ic('gear', 15)}</button></td></tr>`; }))
        : vazio(doFiltro.length ? 'Nenhum abastecimento encontrado nesta pesquisa.' : 'Nada por aqui ainda.'),
      visiveis.length ? botaoExportar('btnCsvAbastecimentos') : '')}`;
    ligarCsvAbast();
    caixa.querySelectorAll('[data-editar-abast]').forEach(b => b.addEventListener('click', () => abrirEditarAbastecimento(registros.find(a => a.id === b.dataset.editarAbast), el)));
    caixa.querySelectorAll('[data-bsoft-abast]').forEach(b => b.addEventListener('click', () => abrirEnviarBsoft(registros.find(a => a.id === b.dataset.bsoftAbast), el)));
  }

  el.querySelectorAll('[data-filtro-abast]').forEach(b => b.addEventListener('click', () => { filtroAbastecimento = b.dataset.filtroAbast; secaoAbastecimento(el); }));
  el.querySelectorAll('[data-ir-consumo]').forEach(a => a.addEventListener('click', (e) => { e.preventDefault(); screen = 'consumo'; loadEscritorio(); }));
  const dec = (v, c) => v == null || v === '' ? '' : Number(v).toFixed(c).replace('.', ',');
  const b1 = document.getElementById('btnCsvConsumo');
  if(b1) b1.addEventListener('click', () => baixarCSV('consumo_por_veiculo', ['Placa', 'Média diesel (km/l)', 'Média Arla (km/l)', 'Abastecimentos', 'Diesel (total L)', 'Arla (total L)', 'Último km'],
    veiculos.map(v => [v.placa, v.media ? dec(v.media, 2) : '', v.mediaArla ? dec(v.mediaArla, 1) : '', v.n, dec(v.litros, 1), dec(v.arla, 1), v.ultimoKm ?? ''])));
  const ligarCsvAbast = () => {
  const b2 = document.getElementById('btnCsvAbastecimentos');
  if(b2) b2.addEventListener('click', () => baixarCSV('abastecimentos', ['Data e hora', 'Tipo', 'Placa', 'Motorista', 'Km do veículo', 'Diesel (L)', 'R$/L diesel', 'Arla (L)', 'R$/L Arla', 'Valor (R$)', 'Odômetro da bomba', 'Posto', 'Nota / comprovante', 'Confirmado por', 'Média diesel (km/l)', 'Média Arla (km/l)'],
    visiveis.map(a => [fmtDataHora(a.data), a.tipo ? ROTULO_TIPO_ABAST[a.tipo] : '', a.veiculo ? a.veiculo.placa : '', a.motorista ? a.motorista.nome : '', a.km, dec(a.litros, 2), dec(a.preco_litro_diesel, 3), dec(a.arla_litros, 2), dec(a.preco_litro_arla, 3), valorAbastecimento(a) ? dec(valorAbastecimento(a), 2) : '', a.odometro_bomba ?? '', a.posto || '', a.nota_numero || '', a.confirmado ? a.confirmado.nome : '', a.media_calculada ? dec(a.media_calculada, 2) : '', a.media_arla_calculada ? dec(a.media_arla_calculada, 1) : ''])));
  };
  desenharAbast();
  ligarBarraLista(el, 'abastecimentos', desenharAbast);
}

// ---------- correções do escritório (abastecimento, jornada, checklist; oficina fica em oficina.js) ----------
// campo <input type="datetime-local"> ↔ data/hora do banco
function paraCampoDataHora(iso){
  if(!iso) return '';
  const d = new Date(iso), p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
const doCampoDataHora = (v) => v ? new Date(v).toISOString() : null;
const numeroOuNulo = (v) => { const t = String(v ?? '').trim().replace(',', '.'); return t === '' ? null : Number(t); };

// Botão "Excluir" com confirmação; registra no Registro de acessos (gatilho no banco)
async function excluirRegistro(tabela, id, pergunta, aoTerminar){
  if(!confirm(pergunta + '\n\nIsto não pode ser desfeito.')) return false;
  const { error } = await sb.from(tabela).delete().eq('id', id);
  if(error){ alert('Não consegui excluir: ' + error.message); return false; }
  if(window.limparCacheTelas) limparCacheTelas();
  fecharModal();
  mostrarToast('Excluído');
  if(aoTerminar) aoTerminar();
  return true;
}

function abrirEditarAbastecimento(a, el){
  if(!a) return;
  const externo = a.tipo === 'externo';
  abrirModal(`Abastecimento — ${a.veiculo ? a.veiculo.placa : ''} · ${fmtDataHora(a.data)}`, `
    <form id="formEditarAbast">
      <div class="l2" style="margin-bottom:10px;">${esc(a.motorista ? a.motorista.nome : '')} · ${esc(a.tipo ? ROTULO_TIPO_ABAST[a.tipo] : '')}. A média de consumo é recalculada sozinha (deste e do abastecimento seguinte do veículo).</div>
      <div class="o-form-grid">
        <div class="field-row" style="margin:0;"><label for="eaData">Data e hora</label><input type="datetime-local" id="eaData" value="${paraCampoDataHora(a.data)}" required></div>
        <div class="field-row" style="margin:0;"><label for="eaKm">Km do veículo</label><input type="text" inputmode="decimal" id="eaKm" value="${a.km ?? ''}" required></div>
        <div class="field-row" style="margin:0;"><label for="eaLitros">Diesel (litros)</label><input type="text" inputmode="decimal" id="eaLitros" value="${a.litros ?? ''}" required></div>
        <div class="field-row" style="margin:0;"><label for="eaArla">Arla (litros)</label><input type="text" inputmode="decimal" id="eaArla" value="${a.arla_litros ?? ''}"></div>
        ${externo ? `
        <div class="field-row" style="margin:0;"><label for="eaPrecoD">R$/litro diesel</label><input type="text" inputmode="decimal" id="eaPrecoD" value="${a.preco_litro_diesel ?? ''}"></div>
        <div class="field-row" style="margin:0;"><label for="eaPrecoA">R$/litro Arla</label><input type="text" inputmode="decimal" id="eaPrecoA" value="${a.preco_litro_arla ?? ''}"></div>
        <div class="field-row" style="margin:0;"><label for="eaPosto">Posto</label><input type="text" id="eaPosto" value="${esc(a.posto || '')}"></div>
        <div class="field-row" style="margin:0;"><label for="eaNota">Nº da nota</label><input type="text" id="eaNota" value="${esc(a.nota_numero || '')}"></div>`
        : `<div class="field-row" style="margin:0;"><label for="eaBomba">Odômetro da bomba</label><input type="text" inputmode="decimal" id="eaBomba" value="${a.odometro_bomba ?? ''}"></div>`}
      </div>
      <div class="err" id="eaErro"></div>
      <button type="submit" style="margin-top:12px;">Salvar correção</button>
      <button type="button" class="btn-danger" id="btnExcluirAbast" style="margin-top:8px; width:100%;">Excluir abastecimento</button>
    </form>`);
  document.getElementById('btnExcluirAbast').addEventListener('click', () =>
    excluirRegistro('abastecimento', a.id, `Excluir o abastecimento de ${fmtDataHora(a.data)} (${a.veiculo ? a.veiculo.placa : ''})?`, () => secaoAbastecimento(el)));
  document.getElementById('formEditarAbast').addEventListener('submit', async (e) => {
    e.preventDefault();
    const erro = document.getElementById('eaErro'), btn = e.target.querySelector('button[type="submit"]');
    const dados = { data: doCampoDataHora(document.getElementById('eaData').value), km: numeroOuNulo(document.getElementById('eaKm').value),
      litros: numeroOuNulo(document.getElementById('eaLitros').value), arla_litros: numeroOuNulo(document.getElementById('eaArla').value) };
    if(externo){
      Object.assign(dados, { preco_litro_diesel: numeroOuNulo(document.getElementById('eaPrecoD').value), preco_litro_arla: numeroOuNulo(document.getElementById('eaPrecoA').value),
        posto: document.getElementById('eaPosto').value.trim() || null, nota_numero: document.getElementById('eaNota').value.trim() || null });
    } else dados.odometro_bomba = numeroOuNulo(document.getElementById('eaBomba').value);
    if(!dados.data || !(dados.km > 0) || !(dados.litros > 0)){ erro.textContent = 'Confira data, km e litros (números maiores que zero).'; return; }
    if(document.getElementById('eaData').value === paraCampoDataHora(a.data)) delete dados.data;   // data não mudou: mantém a original (com os segundos)
    if(Object.values(dados).some(v => typeof v === 'number' && (isNaN(v) || v < 0))){ erro.textContent = 'Algum número está inválido.'; return; }
    btn.disabled = true; btn.textContent = 'Salvando...';
    const { error } = await sb.from('abastecimento').update(dados).eq('id', a.id);
    if(error){ erro.textContent = 'Não consegui salvar: ' + error.message; btn.disabled = false; btn.textContent = 'Salvar correção'; return; }
    if(window.limparCacheTelas) limparCacheTelas();
    fecharModal(); mostrarToast('✅ Abastecimento corrigido'); secaoAbastecimento(el);
  });
}

// ---------- envio de um abastecimento ao Bsoft ----------
// Lança de verdade no Bsoft (o Bsoft não tem ambiente de testes e o lançamento vai para o financeiro):
// primeiro consulta (veículo, motorista, posto, se já existe lançamento no dia), o escritório confere e confirma.
const ESCOLHAS_BSOFT = 'moveria_bsoft_abast';
function lerEscolhasBsoft(){ try{ return JSON.parse(localStorage.getItem(ESCOLHAS_BSOFT) || '{}'); } catch(e){ return {}; } }
function guardarEscolhasBsoft(v){ try{ localStorage.setItem(ESCOLHAS_BSOFT, JSON.stringify(v)); } catch(e){} }

async function abrirEnviarBsoft(a, el){
  if(!a) return;
  abrirModal(`Enviar ao Bsoft — ${a.veiculo ? a.veiculo.placa : ''} · ${fmtDataHora(a.data)}`, `<div id="ebCorpo" class="l2">Consultando o Bsoft (veículo, motorista e postos)... pode levar alguns segundos.</div>`);
  let r;
  try{ r = await chamarBsoft('abastecimento_preparar', { abastecimento_id: a.id }); }
  catch(e){ r = { ok: false, error: e.message }; }
  const corpo = document.getElementById('ebCorpo');
  if(!corpo) return;
  if(!r || !r.ok){ corpo.innerHTML = `<div class="err">${esc((r && r.error) || 'Não consegui consultar o Bsoft.')}</div>`; return; }
  if(r.ja_enviado){ corpo.innerHTML = `Este abastecimento já foi enviado ao Bsoft (${esc(r.ja_enviado)}).`; return; }

  const interno = r.interno, temArla = Number(a.arla_litros) > 0;
  const salvo = lerEscolhasBsoft();
  const primeiro = (lista, salvoId, ...testes) => (lista.find(x => x.id === salvoId) || testes.map(t => lista.find(x => t.test(x.nome))).find(Boolean) || {}).id || '';
  const opcoes = (lista, sel) => `<option value="">— escolha —</option>` + lista.map(x => `<option value="${esc(x.id)}" ${x.id === sel ? 'selected' : ''}>${esc(x.nome)}</option>`).join('');
  const combDiesel = primeiro(r.combustiveis, salvo.comb, /^DIESEL S-?10$/i, /S-?10/i, /DIESEL/i);
  const combArla = primeiro(r.combustiveis, salvo.combArla, /ARLA/i);
  const almDiesel = primeiro(r.almoxarifados, salvo.alm, /DIESEL/i);
  const almArla = primeiro(r.almoxarifados, salvo.almArla, /ARLA/i);
  const fornecedores = [...r.fornecedores].sort((x, y) => x.nome.localeCompare(y.nome));
  const fornSel = r.sugestao_fornecedor || '';
  const campo = (id, rotulo, html) => `<div class="field-row" style="margin:0;"><label for="${id}">${rotulo}</label>${html}</div>`;
  const litros = (n) => Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 3 }) + ' L';

  corpo.innerHTML = `
    <div class="o-banner" style="margin-bottom:12px;">${ic('alert', 18)}<div class="txt"><b>Isto lança de verdade no Bsoft</b>O abastecimento entra no Bsoft${interno ? ' (Abastecimentos Próprios)' : ' (Abastecimentos de posto) e no financeiro'}. Confira antes de enviar.</div></div>
    ${r.repetidos.length ? `<div class="err" style="margin-bottom:10px;">Já existe no Bsoft lançamento deste veículo neste dia: ${r.repetidos.map(x => `nº ${esc(x.numero)} — ${litros(x.litros)}${x.usuario ? ' (' + esc(x.usuario) + ')' : ''}`).join('; ')}. Confira para não lançar em dobro.</div>` : ''}
    <div class="l2" style="margin-bottom:10px;">
      Veículo no Bsoft: ${r.equipamento ? `<b>${esc(r.equipamento.nome)}</b>` : '<b style="color:var(--red-600,#c0392b);">não encontrado — cadastre a placa no Bsoft</b>'}<br>
      Motorista no Bsoft: ${r.motorista ? `<b>${esc(r.motorista.nome)}</b>` : 'não encontrado (vai sem motorista)'}<br>
      Km: <b>${Number(a.km).toLocaleString('pt-BR')}</b> · Diesel: <b>${litros(a.litros)}</b>${temArla ? ` · Arla: <b>${litros(a.arla_litros)}</b>` : ''}${!interno && a.nota_numero ? ` · Nota: <b>${esc(a.nota_numero)}</b>` : ''}${interno ? `<br>Número de controle (hodômetro da bomba): ${a.odometro_bomba != null ? `<b>${Math.round(Number(a.odometro_bomba))}</b>` : 'não informado'}` : ''}
    </div>
    <div class="o-form-grid">
      ${campo('ebComb', 'Combustível do diesel', `<select id="ebComb">${opcoes(r.combustiveis, combDiesel)}</select>`)}
      ${interno ? campo('ebAlm', 'Almoxarifado do diesel', `<select id="ebAlm">${opcoes(r.almoxarifados, almDiesel)}</select>`)
        + campo('ebValor', 'R$/litro diesel (opcional)', `<input type="text" inputmode="decimal" id="ebValor" placeholder="vazio = o Bsoft calcula">`) : ''}
      ${temArla ? campo('ebCombArla', 'Combustível do Arla', `<select id="ebCombArla">${opcoes(r.combustiveis, combArla)}</select>`) : ''}
      ${temArla && interno ? campo('ebAlmArla', 'Almoxarifado do Arla', `<select id="ebAlmArla">${opcoes(r.almoxarifados, almArla)}</select>`)
        + campo('ebValorArla', 'R$/litro Arla (opcional)', `<input type="text" inputmode="decimal" id="ebValorArla" placeholder="vazio = o Bsoft calcula">`) : ''}
      ${campo('ebTanque', 'Tanque cheio', `<select id="ebTanque"><option value="S">Sim</option><option value="N">Não</option></select>`)}
      ${interno ? '' : campo('ebProg', 'Tipo de pagamento', `<select id="ebProg">
        ${[['SP', 'Sem programação'], ['S', 'Pago pelo motorista'], ['N', 'Programar pagamento']].map(([k, l]) => `<option value="${k}" ${(salvo.prog || 'SP') === k ? 'selected' : ''}>${l}</option>`).join('')}</select>`)}
    </div>
    ${interno ? '' : `
      <div class="field-row" style="margin-top:10px;"><label for="ebBuscaPosto">Posto (fornecedor no Bsoft)${a.posto ? ` — o motorista escreveu: <b>${esc(a.posto)}</b>` : ''}</label>
        <input type="text" id="ebBuscaPosto" placeholder="Pesquisar posto pelo nome">
        <select id="ebPosto" size="6" style="margin-top:6px; width:100%;">${fornecedores.map(f => `<option value="${esc(f.id)}" ${f.id === fornSel ? 'selected' : ''}>${esc(f.nome)}${f.cidade ? ' — ' + esc(f.cidade) : ''}</option>`).join('')}</select></div>
      <div class="o-form-grid">
        ${campo('ebCidade', 'Cidade do abastecimento', `<input type="text" id="ebCidade">`)}
        ${campo('ebUf', 'UF', `<input type="text" id="ebUf" maxlength="2" style="text-transform:uppercase;">`)}
      </div>`}
    <div class="err" id="ebErro"></div>
    <button type="button" id="btnEnviarBsoft" style="margin-top:12px;" ${r.equipamento ? '' : 'disabled'}>Enviar ao Bsoft</button>`;

  const $ = (id) => document.getElementById(id);
  const val = (id) => $(id) ? $(id).value.trim() : '';
  const posto = $('ebPosto');
  if(posto){
    const preencherLocal = () => { const f = fornecedores.find(x => x.id === posto.value); if(f){ if(f.cidade && !val('ebCidade')) $('ebCidade').value = f.cidade; if(f.uf && !val('ebUf')) $('ebUf').value = f.uf; } };
    posto.addEventListener('change', preencherLocal);
    preencherLocal();
    if(posto.selectedOptions[0]) posto.selectedOptions[0].scrollIntoView({ block: 'nearest' });
    $('ebBuscaPosto').addEventListener('input', () => {
      const t = textoBusca($('ebBuscaPosto').value);
      [...posto.options].forEach(o => { o.hidden = t && !textoBusca(o.textContent).includes(t); });
    });
  }
  $('btnEnviarBsoft').addEventListener('click', async () => {
    const erro = $('ebErro'), btn = $('btnEnviarBsoft');
    const dados = {
      equipamentos_id: r.equipamento ? r.equipamento.id : '', motorista_id: r.motorista ? r.motorista.id : '',
      combustivel_id: val('ebComb'), combustivel_arla_id: val('ebCombArla'),
      almoxarifado_id: val('ebAlm'), almoxarifado_arla_id: val('ebAlmArla'),
      valor_unitario: val('ebValor'), valor_unitario_arla: val('ebValorArla'),
      tanque_cheio: val('ebTanque') !== 'N', programado: val('ebProg'),
      fornecedor_id: posto ? posto.value : '', cidade: val('ebCidade'), uf: val('ebUf'),
    };
    if(!dados.combustivel_id || (temArla && !dados.combustivel_arla_id)){ erro.textContent = 'Escolha o combustível.'; return; }
    if(interno && (!dados.almoxarifado_id || (temArla && !dados.almoxarifado_arla_id))){ erro.textContent = 'Escolha o almoxarifado.'; return; }
    if(!interno && !dados.fornecedor_id){ erro.textContent = 'Escolha o posto na lista.'; return; }
    if(!confirm(`Lançar no Bsoft o abastecimento de ${a.veiculo ? a.veiculo.placa : ''} (${litros(a.litros)} de diesel${temArla ? ' + ' + litros(a.arla_litros) + ' de Arla' : ''})?\n\nIsto grava de verdade no Bsoft.`)) return;
    guardarEscolhasBsoft({ comb: dados.combustivel_id, combArla: dados.combustivel_arla_id || salvo.combArla, alm: dados.almoxarifado_id || salvo.alm, almArla: dados.almoxarifado_arla_id || salvo.almArla, prog: dados.programado || salvo.prog });
    btn.disabled = true; btn.textContent = 'Enviando...'; erro.textContent = '';
    let resp;
    try{ resp = await chamarBsoft('abastecimento_enviar', { abastecimento_id: a.id, dados }); }
    catch(e){ resp = { ok: false, error: e.message }; }
    if(!resp || !resp.ok){
      erro.textContent = (resp && resp.error) || 'Não consegui enviar.';
      btn.disabled = false; btn.textContent = 'Enviar ao Bsoft';
      if(resp && /foi lançado/.test(resp.error || '')) secaoAbastecimento(el);
      return;
    }
    fecharModal(); mostrarToast('✅ Lançado no Bsoft'); secaoAbastecimento(el);
  });
}

function abrirCorrigirJornada(j, el){
  abrirModal(`Corrigir jornada — ${j.motorista ? j.motorista.nome : ''}`, `
    <form id="formCorrigirJornada">
      <div class="l2" style="margin-bottom:10px;">Use para encerrar uma jornada que o motorista esqueceu aberta ou corrigir um horário errado. A correção fica anotada no Registro de acessos.</div>
      <div class="o-form-grid">
        <div class="field-row" style="margin:0;"><label for="cjInicio">Início</label><input type="datetime-local" id="cjInicio" value="${paraCampoDataHora(j.inicio)}" required></div>
        <div class="field-row" style="margin:0;"><label for="cjFim">Fim</label><input type="datetime-local" id="cjFim" value="${paraCampoDataHora(j.fim)}"></div>
        <div class="field-row" style="margin:0;"><label for="cjStatus">Situação</label><select id="cjStatus">
          ${Object.entries(ROTULO_JORNADA).map(([k, l]) => `<option value="${k}" ${j.status === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      </div>
      <div class="err" id="cjErro"></div>
      <button type="submit" style="margin-top:12px;">Salvar correção</button>
    </form>`);
  document.getElementById('formCorrigirJornada').addEventListener('submit', async (e) => {
    e.preventDefault();
    const erro = document.getElementById('cjErro');
    const inicio = doCampoDataHora(document.getElementById('cjInicio').value), fim = doCampoDataHora(document.getElementById('cjFim').value);
    const status = document.getElementById('cjStatus').value;
    if(!inicio){ erro.textContent = 'Informe o início.'; return; }
    if(status === 'encerrada' && !fim){ erro.textContent = 'Jornada encerrada precisa do horário de fim.'; return; }
    if(fim && new Date(fim) <= new Date(inicio)){ erro.textContent = 'O fim precisa ser depois do início.'; return; }
    const dados = { fim: status === 'encerrada' ? fim : null, status };
    if(document.getElementById('cjInicio').value !== paraCampoDataHora(j.inicio)) dados.inicio = inicio;
    if(status === 'encerrada' && document.getElementById('cjFim').value === paraCampoDataHora(j.fim)) dados.fim = j.fim;
    const { error } = await sb.from('jornada').update(dados).eq('id', j.id);
    if(error){ erro.textContent = 'Não consegui salvar: ' + error.message; return; }
    if(window.limparCacheTelas) limparCacheTelas();
    fecharModal(); mostrarToast('✅ Jornada corrigida'); secaoJornadas(el);
  });
}

// (a seção OFICINA fica em js/oficina.js, junto com o app do mecânico)

// ---------------------------------------------------------------------
// JORNADAS
// ---------------------------------------------------------------------
const ROTULO_JORNADA = { ativa:'Em andamento', pausada:'Em parada', encerrada:'Encerrada' };
const COR_JORNADA = { ativa:'blue', pausada:'amber', encerrada:'green' };

async function secaoJornadas(el){
  const jornadas = await consultar(sb.from('jornada')
    .select('id, inicio, fim, status, assinatura_base64, motorista:motorista_id(nome), jornada_evento(tipo, motivo, observacao, criado_em)')
    .order('inicio', { ascending:false }).limit(200));
  const linhas = jornadas.map(j => {
    const eventos = [...(j.jornada_evento || [])].sort((a, b) => new Date(a.criado_em) - new Date(b.criado_em));
    return { j, eventos, c: calcularConducao(eventos, j.fim ? new Date(j.fim) : new Date()) };
  });

  const nomeMot = (l) => l.j.motorista ? l.j.motorista.nome : '';
  const ordens = [
    ['recentes', 'Mais recentes primeiro', porData(l => l.j.inicio, -1)],
    ['antigas', 'Mais antigas primeiro', porData(l => l.j.inicio, 1)],
    ['az', 'Motorista de A a Z', (a, b) => porTexto(nomeMot)(a, b) || porData(l => l.j.inicio, -1)(a, b)],
    ['za', 'Motorista de Z a A', (a, b) => porTexto(nomeMot, -1)(a, b) || porData(l => l.j.inicio, -1)(a, b)],
    ['conducao', 'Maior tempo de condução', porNumero(l => l.c.totalMin, -1)],
    ['abertas', 'Em andamento primeiro', (a, b) => ((a.j.status === 'encerrada') - (b.j.status === 'encerrada')) || porData(l => l.j.inicio, -1)(a, b)],
  ];
  const textoLinha = (l) => [nomeMot(l), fmtData(l.j.inicio), ROTULO_JORNADA[l.j.status]].join(' ');
  let visiveis = linhas;
  el.innerHTML = `${barraLista('jornadas', ordens, 'Pesquisar por motorista, data (ex: 08/10) ou status')}<div id="listaJornadas"></div>`;
  function desenhar(){
    visiveis = aplicarLista('jornadas', linhas, ordens, textoLinha);
    const caixa = document.getElementById('listaJornadas');
    caixa.innerHTML = painel(`Registro de jornadas (${visiveis.length})`,
      visiveis.length ? tabela(['Motorista', 'Data', 'Início', 'Fim', 'Tempo de condução', 'Paradas', 'Status'],
        visiveis.map(({ j, c }) => `<tr class="clickable" data-jornada="${j.id}"><td>${esc(j.motorista ? j.motorista.nome : '—')}</td><td>${fmtData(j.inicio)}</td><td class="mono">${fmtHora(j.inicio)}</td><td class="mono">${j.fim ? fmtHora(j.fim) : '—'}</td><td class="mono">${fmtMinutos(c.totalMin)}</td><td>${c.paradas}</td><td>${badge(COR_JORNADA[j.status], ROTULO_JORNADA[j.status])}</td></tr>`))
        : vazio(jornadas.length ? 'Nenhuma jornada encontrada nesta pesquisa.' : 'Nenhuma jornada registrada ainda.'),
      visiveis.length ? botaoExportar('btnCsvJornadas') : '');
    ligarLinhas(caixa);
  }

  const ligarLinhas = (caixa) => {
  caixa.querySelectorAll('[data-jornada]').forEach(tr => tr.addEventListener('click', () => {
    const { j, eventos, c } = linhas.find(l => l.j.id === tr.dataset.jornada);
    abrirModal(`${j.motorista ? j.motorista.nome : 'Jornada'} — ${fmtData(j.inicio)}`, `
      <div class="l2" style="margin-bottom:10px;">Tempo de condução: <b>${fmtMinutos(c.totalMin)}</b> · ${c.paradas} parada${c.paradas === 1 ? '' : 's'} · ${esc(ROTULO_JORNADA[j.status])}</div>
      ${eventos.map(ev => `<div class="timeline-item"><div class="hora">${fmtHora(ev.criado_em)}</div><div><b>${esc(ev.motivo || TIPO_EVENTO_LABEL[ev.tipo] || ev.tipo)}</b>${ev.observacao ? `<div class="l2">${esc(ev.observacao)}</div>` : ''}</div></div>`).join('') || '<div class="l2">Nenhum evento registrado.</div>'}
      ${imgAssinatura(j.assinatura_base64) ? `<div class="section-label">Assinatura do motorista</div>${imgAssinatura(j.assinatura_base64, 'width:100%; background:#fff; border:1px solid var(--border); border-radius:8px;')}` : ''}
      <div style="display:flex; gap:8px; margin-top:16px; flex-wrap:wrap;">
        <button type="button" class="btn btn-outline btn-sm" id="btnCorrigirJornada">Corrigir horários / encerrar</button>
        <button type="button" class="btn-danger btn-sm" id="btnExcluirJornada" style="padding:8px 14px;">Excluir jornada</button>
      </div>
    `);
    document.getElementById('btnCorrigirJornada').addEventListener('click', () => abrirCorrigirJornada(j, el));
    document.getElementById('btnExcluirJornada').addEventListener('click', () =>
      excluirRegistro('jornada', j.id, `Excluir a jornada de ${j.motorista ? j.motorista.nome : ''} do dia ${fmtData(j.inicio)}? Todas as paradas dela também serão apagadas.`, () => secaoJornadas(el)));
  }));
  const b = document.getElementById('btnCsvJornadas');
  if(b) b.addEventListener('click', () => baixarCSV('jornadas', ['Motorista', 'Data', 'Início', 'Fim', 'Tempo de condução', 'Paradas', 'Status'],
    visiveis.map(({ j, c }) => [j.motorista ? j.motorista.nome : '', fmtData(j.inicio), fmtHora(j.inicio), j.fim ? fmtHora(j.fim) : '', fmtMinutos(c.totalMin), c.paradas, ROTULO_JORNADA[j.status]])));
  };
  desenhar();
  ligarBarraLista(el, 'jornadas', desenhar);
}

// ---------------------------------------------------------------------
// CHECKLISTS
// ---------------------------------------------------------------------
async function secaoChecklists(el){
  const checklists = await consultar(sb.from('checklist')
    .select('id, criado_em, respostas, motorista:motorista_id(nome), conjunto:conjunto_id(id, conjunto_item(ordem, veiculo:veiculo_id(placa, tipo)))')
    .order('criado_em', { ascending:false }).limit(200));
  const nomeMot = (c) => c.motorista ? c.motorista.nome : '';
  const ordens = [
    ['recentes', 'Mais recentes primeiro', porData(c => c.criado_em, -1)],
    ['antigos', 'Mais antigos primeiro', porData(c => c.criado_em, 1)],
    ['az', 'Motorista de A a Z', (a, b) => porTexto(nomeMot)(a, b) || porData(c => c.criado_em, -1)(a, b)],
    ['za', 'Motorista de Z a A', (a, b) => porTexto(nomeMot, -1)(a, b) || porData(c => c.criado_em, -1)(a, b)],
    ['irregulares', 'Irregulares primeiro', (a, b) => contarIrregularidades(b) - contarIrregularidades(a) || porData(c => c.criado_em, -1)(a, b)],
    ['placa', 'Placa do conjunto', (a, b) => porTexto(c => cavaloDoConjunto(c.conjunto))(a, b) || porData(c => c.criado_em, -1)(a, b)],
  ];
  const textoLinha = (c) => [nomeMot(c), cavaloDoConjunto(c.conjunto), fmtDataHora(c.criado_em), contarIrregularidades(c) ? 'irregular' : 'ok'].join(' ');
  let visiveis = checklists;
  el.innerHTML = `${barraLista('checklists', ordens, 'Pesquisar por motorista, placa ou data')}<div id="listaChecklists"></div>`;
  function desenhar(){
    visiveis = aplicarLista('checklists', checklists, ordens, textoLinha);
    const caixa = document.getElementById('listaChecklists');
    caixa.innerHTML = painel(`Checklists enviados (${visiveis.length})`,
      visiveis.length ? tabela(['Motorista', 'Conjunto', 'Data', 'Itens respondidos', 'Irregularidades', 'Status'],
        visiveis.map(c => { const n = contarIrregularidades(c); return `<tr class="clickable" data-checklist="${c.id}"><td>${esc(c.motorista ? c.motorista.nome : '—')}</td><td class="mono">${esc(cavaloDoConjunto(c.conjunto))}</td><td class="sub">${fmtDataHora(c.criado_em)}</td><td>${(c.respostas || []).length}</td><td>${n || '—'}</td><td>${n ? badge('red', 'Irregular') : badge('green', 'OK')}</td></tr>`; }))
        : vazio(checklists.length ? 'Nenhum checklist encontrado nesta pesquisa.' : 'Nenhum checklist enviado ainda.'),
      visiveis.length ? botaoExportar('btnCsvChecklists') : '');
    caixa.querySelectorAll('[data-checklist]').forEach(tr => tr.addEventListener('click', () => abrirDetalheChecklist(checklists.find(c => c.id === tr.dataset.checklist), () => secaoChecklists(el))));
    const b = document.getElementById('btnCsvChecklists');
    if(b) b.addEventListener('click', () => baixarCSV('checklists', ['Motorista', 'Conjunto', 'Data', 'Itens respondidos', 'Irregularidades'],
      visiveis.map(c => [c.motorista ? c.motorista.nome : '', cavaloDoConjunto(c.conjunto), fmtDataHora(c.criado_em), (c.respostas || []).length, contarIrregularidades(c)])));
  }
  desenhar();
  ligarBarraLista(el, 'checklists', desenhar);
}

async function abrirDetalheChecklist(checklist, aoExcluir = () => loadEscritorio()){
  if(!checklist) return;
  // a assinatura (imagem) só é buscada aqui, para não pesar as listas
  const [itens, { data: assinado }] = await Promise.all([
    consultar(sb.from('checklist_item_padrao').select('id, ordem, descricao, padrao_esperado').order('ordem')),
    sb.from('checklist').select('assinatura_base64, assinado_em').eq('id', checklist.id).maybeSingle(),
  ]);
  const resposta = Object.fromEntries((checklist.respostas || []).map(r => [r.item_id, r.resposta]));
  const rotulo = { ok:['green', 'Atende'], bad:['red', 'Não atende'], na:['grey', 'N/A'] };
  const respondidos = itens.filter(i => resposta[i.id]);
  const ordenados = [...respondidos.filter(i => resposta[i.id] === 'bad'), ...respondidos.filter(i => resposta[i.id] !== 'bad')];
  abrirModal(`Checklist — ${checklist.motorista ? checklist.motorista.nome : ''}`, `
    <div class="l2" style="margin-bottom:10px;">${fmtDataHora(checklist.criado_em)} · conjunto ${esc(cavaloDoConjunto(checklist.conjunto))}</div>
    ${ordenados.map(i => { const [cor, txt] = rotulo[resposta[i.id]] || ['grey', resposta[i.id]]; return `<div class="timeline-item"><div class="hora">${i.ordem}.</div><div style="flex:1;">${esc(i.descricao)}${i.padrao_esperado ? `<div class="l2">${esc(i.padrao_esperado)}</div>` : ''}</div><div>${badge(cor, txt)}</div></div>`; }).join('') || '<div class="l2">Sem respostas.</div>'}
    <div class="section-label">Assinatura do motorista</div>
    ${assinado && imgAssinatura(assinado.assinatura_base64)
      ? `${imgAssinatura(assinado.assinatura_base64, 'width:100%; max-width:420px; background:#fff; border:1px solid var(--border); border-radius:8px; display:block;')}
         <div class="l2">Assinado em ${fmtDataHora(assinado.assinado_em || checklist.criado_em)}</div>`
      : '<div class="l2">Checklist enviado antes da assinatura existir no app.</div>'}
    <div style="margin-top:16px;">
      <div class="l2" style="margin-bottom:8px;">O checklist é assinado pelo motorista, por isso não é editado: se estiver errado, exclua e peça para ele enviar de novo.</div>
      <button type="button" class="btn-danger btn-sm" id="btnExcluirChecklist" style="padding:8px 14px;">Excluir checklist</button>
    </div>`);
  document.getElementById('btnExcluirChecklist').addEventListener('click', () =>
    excluirRegistro('checklist', checklist.id, `Excluir o checklist de ${checklist.motorista ? checklist.motorista.nome : ''} enviado em ${fmtDataHora(checklist.criado_em)}?`, aoExcluir));
}

// (as seções AGENDA e CAPACITAÇÕES ficam em js/agenda.js e js/capacitacoes.js)

// ---------------------------------------------------------------------
// INTEGRAÇÃO (Bloco 5 do plano)
// ---------------------------------------------------------------------
// Fala com a função do servidor (supabase/functions/bsoft-sincronizar). Ela lê o Bsoft — nada é gravado lá.
async function chamarBsoft(acao, extra = {}){
  const { data } = await sb.auth.getSession();
  const token = data && data.session ? data.session.access_token : null;
  if(!token) throw new Error('Sessão expirada — atualize a página.');
  const resp = await fetch(`${SUPABASE_URL}/functions/v1/bsoft-sincronizar`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify({ ...extra, acao }),
  });
  return resp.json();
}
const ROTULO_SITUACAO_BSOFT = { nova: ['blue', 'Será importada'], ja_importada: ['green', 'Já no app'], sem_motorista: ['amber', 'Motorista não encontrado'], fora_da_frota: ['grey', 'Fora da frota (não importa)'] };
let resultadoBsoft = null;   // último teste/prévia/sincronização feito nesta tela

async function secaoIntegracao(el){
  el.innerHTML = '<div class="status">Consultando a integração...</div>';
  let st, logs = [];
  try{ [st, logs] = await Promise.all([chamarBsoft('status'), consultar(sb.from('sincronizacao_log').select('executado_em, status, registros_processados, erro').order('executado_em', { ascending:false }).limit(15)).catch(() => [])]); }
  catch(e){ st = { error: e.message }; }
  if(st.error && st.configurado === undefined){ el.innerHTML = painel('Integração com o Bsoft', `<div class="o-panel-body"><div class="err">${esc(st.error)}</div></div>`); return; }

  const resumo = st.ultimo_resumo || {};
  const statusConexao = !st.configurado ? '<span style="font-size:16px; color:var(--signal-amber-ink);">● Falta o acesso</span>'
    : st.ultimo_status === 'erro' ? '<span style="font-size:16px; color:var(--signal-red-ink);">● Com erro</span>' : '<span style="font-size:16px; color:var(--signal-green-ink);">● Configurado</span>';
  el.innerHTML = `
    <div class="kpi-row tres">
      ${kpi(statusConexao, 'Bsoft (TMS)', st.dominio ? esc(st.dominio) : '')}
      ${kpi(st.ultima_execucao ? fmtDataHora(st.ultima_execucao) : '—', 'Última sincronização', st.ultimo_status === 'ok' ? `${resumo.criadas || 0} viagem(ns) nova(s) · ${resumo.pdfs || 0} PDF(s)` : '')}
      ${kpi(st.ativo ? 'Ligada' : 'Desligada', 'Sincronização automática', st.ativo ? 'A cada 15 minutos' : 'Ligue depois de conferir a prévia', st.ativo ? 'verde' : '')}
    </div>
    ${!st.configurado ? painel('Falta só um passo: o acesso ao Bsoft', `<div class="o-panel-body"><div class="l2" style="line-height:1.6;">
      A conexão já está pronta no servidor; falta guardar os dados de acesso do <b>usuário de integração</b> do Bsoft (perfil de integração, de preferência só consulta).
      Por segurança, eles ficam num cofre do servidor — não aqui no app nem no chat.
      <ol style="margin:10px 0; padding-left:20px;">
        <li>Abra <a href="https://supabase.com/dashboard/project/otllslhjbyjtktxyvezy/functions/secrets" target="_blank" rel="noopener">o cofre de segredos do Supabase</a> (projeto Mover.IA → Edge Functions → Secrets).</li>
        <li>Crie os 3 segredos: <b>BSOFT_DOMINIO</b> (só o começo do endereço, ex.: <code>chaveslog</code> de chaveslog.bsoft.app), <b>BSOFT_USUARIO</b> e <b>BSOFT_SENHA</b>.</li>
        <li>Volte aqui e toque em "Verificar de novo".</li>
      </ol></div>
      <button class="btn btn-primary btn-sm" id="btnBsoftRecarregar">Verificar de novo</button></div>`)
    : painel('Integração com o Bsoft', `<div class="o-panel-body">
      <div class="l2" style="line-height:1.55; margin-bottom:12px;">O MOVER.IA busca os <b>MDF-e</b> emitidos no Bsoft nos últimos ${st.dias_retroativos || 3} dias, acha o motorista pelo <b>CPF</b> (ou pela placa do conjunto), cria a viagem no app dele e anexa os PDFs do <b>DAMDFE</b> e dos <b>DACTE</b> — o motorista recebe aviso e pode compartilhar por WhatsApp. Nada é gravado no Bsoft.</div>
      <div class="o-acoes" style="flex-wrap:wrap; gap:8px;">
        <button class="btn btn-outline btn-sm" id="btnBsoftTestar">Testar conexão</button>
        <button class="btn btn-outline btn-sm" id="btnBsoftPrevia">Ver prévia (sem gravar)</button>
        <button class="btn btn-primary btn-sm" id="btnBsoftSincronizar">Sincronizar agora</button>
        <button class="btn ${st.ativo ? 'btn-outline' : 'btn-primary'} btn-sm" id="btnBsoftAutomatico">${st.ativo ? 'Desligar automático' : 'Ligar sincronização automática'}</button>
      </div>
      <div id="bsoftResultado" style="margin-top:14px;"></div></div>`)}
    ${(resumo.sem_motorista || []).length ? painel('MDF-e sem motorista encontrado (última sincronização)', `<div class="o-panel-body"><div class="l2" style="margin-bottom:8px;">Confira se o CPF do motorista está no cadastro dele (Motoristas → clicar no motorista) ou se a placa está no conjunto certo.</div></div>
      ${tabela(['MDF-e', 'Placa', 'Motorista no Bsoft'], resumo.sem_motorista.map(s => `<tr><td class="mono">${esc(s.manifesto)}</td><td class="mono">${esc(s.placa || '—')}</td><td>${esc(s.motorista_bsoft || '—')}</td></tr>`))}`) : ''}
    ${painel(`Histórico de sincronizações (${logs.length})`, logs.length ? tabela(['Quando', 'Situação', 'Viagens novas', 'Observação'],
      logs.map(l => `<tr><td class="sub">${fmtDataHora(l.executado_em)}</td><td>${l.status === 'ok' || l.status === 'sucesso' ? badge('green', 'OK') : badge('red', 'Erro')}</td><td>${l.registros_processados ?? 0}</td><td class="sub" style="max-width:480px;">${esc(l.erro || '')}</td></tr>`))
      : vazio('Nenhuma sincronização ainda.'))}`;

  const recarregar = document.getElementById('btnBsoftRecarregar');
  if(recarregar) recarregar.addEventListener('click', () => secaoIntegracao(el));
  if(!st.configurado) return;
  if(resultadoBsoft) desenharResultadoBsoft(resultadoBsoft);

  const acao = (id, nome, depois) => document.getElementById(id).addEventListener('click', async (e) => {
    const btn = e.currentTarget, texto = btn.textContent;
    if(nome === 'sincronizar' && !confirm('Sincronizar agora? As viagens novas aparecem no app dos motoristas (eles recebem aviso no celular).')) return;
    btn.disabled = true; btn.textContent = 'Consultando o Bsoft...';
    try{ resultadoBsoft = { acao: nome, ...(await chamarBsoft(nome)) }; }
    catch(err){ resultadoBsoft = { acao: nome, ok: false, error: err.message }; }
    btn.disabled = false; btn.textContent = texto;
    if(depois) return depois();
    desenharResultadoBsoft(resultadoBsoft);
  });
  acao('btnBsoftTestar', 'testar');
  acao('btnBsoftPrevia', 'previa');
  acao('btnBsoftSincronizar', 'sincronizar', () => { if(window.limparCacheTelas) limparCacheTelas(); secaoIntegracao(el); });
  document.getElementById('btnBsoftAutomatico').addEventListener('click', async () => {
    const ligar = !st.ativo;
    if(ligar && !confirm('Ligar a sincronização automática? A cada 15 minutos os MDF-e novos do Bsoft viram viagens no app dos motoristas.')) return;
    const { error } = await sb.rpc('definir_sincronizacao_bsoft', { p_ativo: ligar });
    if(error){ alert(error.message); return; }
    mostrarToast(ligar ? '✅ Sincronização automática ligada' : 'Sincronização automática desligada');
    secaoIntegracao(el);
  });
}

function desenharResultadoBsoft(r){
  const caixa = document.getElementById('bsoftResultado');
  if(!caixa) return;
  if(!r.ok){ caixa.innerHTML = `<div class="err">${esc(r.error || 'Não deu certo.')}</div>`; return; }
  if(r.acao === 'testar'){
    caixa.innerHTML = `<div class="o-banner" style="margin:0;">${ic('check', 18)}<div class="txt"><b>Conexão OK com ${esc(r.dominio)}</b>${r.manifestos_periodo} MDF-e emitido(s) nos últimos ${r.dias} dias${r.manifestos_periodo >= 50 ? ' (50 ou mais)' : ''}. Agora veja a prévia para conferir como cada um seria importado.</div></div>`;
    return;
  }
  const itens = r.itens || [];
  caixa.innerHTML = `
    <div class="l2" style="margin-bottom:8px;"><b>${r.acao === 'previa' ? 'Prévia (nada foi gravado)' : 'Sincronização feita'}</b> · período ${esc(r.periodo || '')} · ${r.manifestos} MDF-e
      ${r.acao === 'sincronizar' ? ` · ${r.criadas} viagem(ns) criada(s) · ${r.pdfs} PDF(s) anexado(s)` : ''}</div>
    ${(r.erros || []).length ? `<div class="err" style="margin-bottom:8px;">${r.erros.slice(0, 5).map(esc).join('<br>')}</div>` : ''}
    ${itens.length ? tabela(['Emissão', 'MDF-e', 'Placa', 'Motorista no Bsoft', 'Motorista no MOVER.IA', 'CT-e', 'Situação'],
      itens.map(i => { const [cor, txt] = ROTULO_SITUACAO_BSOFT[i.situacao] || ['grey', i.situacao]; return `<tr>
        <td class="sub">${esc(i.emissao || '')}</td><td class="mono">${esc(i.manifesto)}</td><td class="mono">${esc(i.placa || '—')}</td>
        <td>${esc(i.motorista_bsoft || '—')}</td><td>${i.motorista ? esc(i.motorista) + `<div class="sub">pelo ${i.achado_por === 'cpf' ? 'CPF' : 'conjunto (placa)'}</div>` : '<span class="sub">—</span>'}</td>
        <td>${i.ctes}</td><td>${badge(cor, txt)}</td></tr>`; }))
      : vazio('Nenhum MDF-e no período.')}`;
}

// (as seções MOTORISTAS, VEÍCULOS, USUÁRIOS e CONFIGURAÇÕES ficam em js/cadastros.js, com edição)
