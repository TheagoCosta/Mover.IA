// MOVER.IA — painel do escritório (layout do protótipo: menu lateral + seções)
// (arquivo carregado pelo index.html; todas as funções ficam globais,
// então um arquivo pode chamar funções dos outros normalmente)

// g = grupo do menu lateral (título pequeno acima dos itens); a ordem aqui é a ordem do menu
const SECOES_ESCRITORIO = [
  { k:'painel',        l:'Painel',        i:'home',    g:'',          meta:() => `Visão geral da frota — hoje, ${hojeExtenso()}` },
  { k:'agenda',        l:'Agenda',        i:'cal',     g:'',          meta:() => 'Revisões, exames e compromissos agendados' },
  { k:'viagens',       l:'Viagens',       i:'map',     g:'Operação',  meta:() => 'Viagens em andamento e concluídas — MDF-e, CT-e e arquivos' },
  { k:'jornadas',      l:'Jornadas',      i:'clock',   g:'Operação',  meta:() => 'Registro de horas de condução e paradas' },
  { k:'checklists',    l:'Checklists',    i:'checksq', g:'Operação',  meta:() => 'Inspeções pré-viagem enviadas pelos motoristas' },
  { k:'veiculos',      l:'Veículos',      i:'truck',   g:'Frota',     meta:() => 'Conjuntos e documentação da frota' },
  { k:'abastecimento', l:'Abastecimento', i:'fuel',    g:'Frota',     meta:() => 'Estoque dos tanques, abastecimentos registrados, litros e gastos em posto' },
  { k:'consumo',       l:'Consumo',       i:'chart',   g:'Frota',     meta:() => 'Média de consumo por veículo e por motorista, evolução e alertas' },
  { k:'oficina',       l:'Oficina',       i:'wrench',  g:'Frota',     meta:() => 'Chamados de manutenção — motoristas, mecânico e oficinas externas' },
  { k:'motoristas',    l:'Motoristas',    i:'user',    g:'Pessoas',   meta:() => 'Documentação e situação de todos os motoristas' },
  { k:'relatorios',    l:'Relatório mensal', i:'doc',  g:'Pessoas',   meta:() => 'Resumo do mês de cada motorista — jornadas, viagens, checklists, abastecimentos e chamados' },
  { k:'capacitacoes',  l:'Capacitações',  i:'award',   g:'Pessoas',   meta:() => 'Treinamentos e certificações da equipe' },
  { k:'documentos',    l:'Documentos',    i:'doc',     g:'Pessoas',   meta:() => 'Repositório central de documentos' },
  { k:'usuarios',      l:'Usuários',      i:'users',   g:'Sistema',   meta:() => 'Quem tem acesso ao sistema' },
  { k:'integracao',    l:'Integração',    i:'sync',    g:'Sistema',   meta:() => 'Bsoft (TMS): MDF-e, CT-e e PDFs direto no app do motorista' },
  { k:'privacidade',   l:'Privacidade',   i:'lock',    g:'Sistema',   meta:() => 'LGPD — pedidos dos titulares e leitura da política' },
  { k:'config',        l:'Configurações', i:'gear',    g:'Sistema',   meta:() => 'Dados da empresa e plano contratado' },
];
// o menu lateral com o título de cada grupo antes do primeiro item dele
function menuLateral(){
  return SECOES_ESCRITORIO.map((s, i) => `${s.g && s.g !== (SECOES_ESCRITORIO[i - 1] || {}).g ? `<div class="s-grupo">${s.g}</div>` : ''}
    <button class="side-link ${screen === s.k ? 'active' : ''}" data-secao="${s.k}">
      ${ic(s.i, 17)}<span>${s.l}</span>${s.emBreve ? '<span class="novo">em breve</span>' : ''}
    </button>`).join('');
}

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
        ${menuLateral()}
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
    painel: secaoPainel, motoristas: secaoMotoristas, veiculos: secaoVeiculos, viagens: secaoViagens, abastecimento: secaoAbastecimento, consumo: secaoConsumo, relatorios: secaoRelatorios,
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
// Registro feito sem sinal no app do motorista: vale a hora do celular (até 12 h antes) e mostra quando chegou
// Passou de 12 h sem sinal: o banco grava a hora em que chegou, e aqui aparece a hora que o celular marcou
function marcaSemSinal(r){
  if(!r || !r.recebido_em) return '';
  const usada = r.criado_em || r.data || r.inicio;
  const horaCelularRecusada = r.hora_celular && usada && Math.abs(new Date(usada) - new Date(r.hora_celular)) > 5 * 60000;
  if(horaCelularRecusada) return `<div class="l2" title="O celular ficou mais de 12 h sem internet. A hora gravada é a de chegada; confira com o motorista a hora real.">⚠️ Mais de 12 h sem sinal · no celular: ${fmtDataHora(r.hora_celular)} · chegou em ${fmtDataHora(r.recebido_em)}</div>`;
  return `<div class="l2" title="Feito sem internet no celular do motorista; a hora é a do celular.">📶 Registrado sem sinal · chegou em ${fmtDataHora(r.recebido_em)}</div>`;
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
const DIAS_PROXIMOS_PAINEL = 30;   // lista ao lado do calendário: atrasados + próximos 30 dias

async function secaoPainel(el){
  const seteDiasAtras = new Date(Date.now() - 7 * 86400000);
  const umAnoAtras = new Date(); umAnoAtras.setDate(1); umAnoAtras.setMonth(umAnoAtras.getMonth() - 11);
  const oitoSemanas = new Date(inicioDoDia(new Date(Date.now() - 55 * 86400000)));
  const [usuarios, veiculos, conjuntos, docs, checklists, jornadas, viagens, agenda, abastecimentos, viagensRecentes] = await Promise.all([
    qUsuarios(), qVeiculos(), qConjuntos(), qDocumentos(),
    consultar(sb.from('checklist').select('id, criado_em, respostas, motorista:motorista_id(nome), conjunto:conjunto_id(id, conjunto_item(ordem, veiculo:veiculo_id(placa, tipo)))').order('criado_em', { ascending:false }).limit(30)),
    consultar(sb.from('jornada').select('id, inicio, fim, status, motorista_id, jornada_evento(tipo, criado_em)').gte('inicio', new Date(inicioDoDia(seteDiasAtras)).toISOString())),
    consultar(sb.from('viagem').select('id, origem, destino, cte_numero, mdfe_numero, criado_em, motorista:motorista_id(nome)').eq('status', 'em_andamento').order('criado_em', { ascending:false })),
    consultar(sb.from('agendamento').select(CAMPOS_AGENDA).eq('status', 'pendente').order('data_prevista').order('hora', { nullsFirst:true })),
    consultar(sb.from('abastecimento').select('id, data, tipo, litros, media_calculada, veiculo_id, motorista_id').gte('data', inicioDoDia(umAnoAtras).toISOString()).order('data').limit(5000)),
    consultar(sb.from('viagem').select('id, criado_em').gte('criado_em', oitoSemanas.toISOString()).limit(5000)),
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
  const letraDia = ['dom','seg','ter','qua','qui','sex','sáb'];

  // viagens abertas por semana (8 semanas, a última é a atual)
  const semanas = [...Array(8)].map((_, i) => { const ini = new Date(oitoSemanas); ini.setDate(ini.getDate() + i * 7); return ini; });
  const viagensSemana = semanas.map((ini, i) => {
    const fim = new Date(ini); fim.setDate(fim.getDate() + 7);
    return { rotulo: fmtDataCurta(ini), valor: viagensRecentes.filter(v => { const d = new Date(v.criado_em); return d >= ini && d < fim; }).length,
      fim: i === 7 ? new Date() : new Date(fim.getTime() - 86400000) };
  });

  // calendário: compromissos da agenda + vencimentos de documentos (como se fossem compromissos)
  const docsComData = docsAlerta.filter(d => d.validade);
  const docsSemData = docsAlerta.filter(d => !d.validade);
  const itensCalendario = [
    ...agenda.map(a => ({ ...a, _quem: [a.motorista && a.motorista.nome, a.veiculo && a.veiculo.placa].filter(Boolean).join(' · ') || 'Toda a equipe' })),
    ...docsComData.map(d => ({ id: 'doc:' + d.id, tipo: 'Vence: ' + d.tipo, data_prevista: String(d.validade).slice(0, 10), status: 'pendente', _doc: d, _quem: nomeRef(d) })),
  ];

  el.innerHTML = `
    <div class="kpi-row">
      ${kpi(motoristas.length, 'Motoristas ativos', emJornada ? `${emJornada} em jornada agora` : 'Nenhum em jornada agora', emJornada ? 'verde' : '')}
      ${kpi(conjAtivos.length, 'Conjuntos na frota', semMotorista ? `${semMotorista} sem motorista` : 'Todos com motorista', semMotorista ? 'ambar' : 'verde')}
      ${kpi(chkIrregulares, 'Checklists com irregularidade', `${chkSemana.length} enviado${chkSemana.length === 1 ? '' : 's'} nos últimos 7 dias`, chkIrregulares ? 'vermelho' : 'verde')}
      ${kpi(docsAlerta.length, 'Documentos vencidos ou a vencer', docsVencidos ? `${docsVencidos} vencido${docsVencidos > 1 ? 's' : ''}` : docsAlerta.length ? `Vencem em até ${DIAS_ALERTA_DOCUMENTO} dias` : 'Tudo em dia', docsVencidos ? 'vermelho' : docsAlerta.length ? 'ambar' : 'verde')}
    </div>
    ${painel('Agenda e vencimentos', `<div class="painel-agenda">
        <div class="painel-agenda-cal" id="painelCal"></div>
        <div class="painel-agenda-lista" id="painelProximos"></div>
      </div>`,
      `<button class="btn btn-outline btn-sm" data-ir="documentos">Documentos</button><button class="btn btn-outline btn-sm" data-ir="agenda">Abrir agenda</button>`)}
    <div class="graf-grade">
      ${painel('Consumo da frota — km/l por mês', `<div style="padding:4px 16px 12px;">${graficoConsumo(analisarConsumo(abastecimentos).meses)}</div>`,
        `<button class="btn btn-outline btn-sm" data-ir="consumo">Relatório</button>`)}
      ${painel('Estoque dos tanques', `<div id="painelTanques" style="padding:14px 18px;"><div class="l2">Carregando...</div></div>`,
        `<button class="btn btn-outline btn-sm" data-ir="abastecimento">Abastecimento</button>`)}
      ${painel('Horas de condução — últimos 7 dias', `<div style="padding:4px 16px 12px;">${graficoBarras(horasDia.map((h, i) => ({ rotulo: letraDia[dias[i].getDay()], valor: h >= 0.05 ? h : null,
          dica: `${letraDia[dias[i].getDay()]} ${fmtDataCurta(dias[i])}: ${h.toFixed(1).replace('.', ',')} h de condução (todos os motoristas)` })),
          { casas: 1, aria: 'Horas de condução por dia, soma de todos os motoristas', textoVazio: 'Nenhuma jornada com condução nos últimos 7 dias.' })}</div>`,
        `<button class="btn btn-outline btn-sm" data-ir="jornadas">Jornadas</button>`)}
      ${painel('Viagens abertas por semana', `<div style="padding:4px 16px 12px;">${graficoBarras(viagensSemana.map(s => ({ rotulo: s.rotulo, valor: s.valor || null,
          dica: `Semana de ${s.rotulo} a ${fmtDataCurta(s.fim)}: ${s.valor} viage${s.valor === 1 ? 'm' : 'ns'}` })),
          { casas: 0, aria: 'Viagens abertas por semana, últimas 8 semanas', textoVazio: 'Nenhuma viagem nas últimas 8 semanas.' })}</div>`,
        `<button class="btn btn-outline btn-sm" data-ir="viagens">Viagens</button>`)}
    </div>
    ${painel(`Viagens em andamento (${viagens.length})`,
      viagens.length ? tabela(['Motorista', 'Origem → destino', 'CT-e', 'MDF-e', 'Aberta em', 'Documentos'],
        viagens.map(v => { const n = docs.filter(d => d.referente_a === 'viagem' && d.referente_id === v.id).length; return `<tr><td>${esc(v.motorista ? v.motorista.nome : '—')}</td><td>${esc(v.origem || '?')} → ${esc(v.destino || '?')}</td><td class="mono">${esc(v.cte_numero || '—')}</td><td class="mono">${esc(v.mdfe_numero || '—')}</td><td class="sub">${fmtDataHora(v.criado_em)}</td>
          <td><button class="btn ${n ? 'btn-outline' : 'btn-primary'} btn-sm" data-docs-viagem="${v.id}">${ic('doc', 14)} ${n ? `${n} arquivo${n > 1 ? 's' : ''}` : 'Anexar'}</button></td></tr>`; }))
        : vazio('Nenhuma viagem em andamento.'),
      `<button class="btn btn-primary btn-sm" id="btnNovaViagem">${ic('plus', 15)} Nova viagem</button>`)}
    ${painel('Checklists recentes',
      checklists.length ? tabela(['Motorista', 'Conjunto', 'Data', 'Irregularidades', 'Status'],
        checklists.slice(0, 6).map(c => { const n = contarIrregularidades(c); return `<tr class="clickable" data-checklist="${c.id}"><td>${esc(c.motorista ? c.motorista.nome : '—')}</td><td class="mono">${esc(cavaloDoConjunto(c.conjunto))}</td><td class="sub">${fmtDataHora(c.criado_em)}</td><td>${n || '—'}</td><td>${n ? badge('red', 'Irregular') : badge('green', 'OK')}</td></tr>`; }))
        : vazio('Nenhum checklist enviado ainda.'),
      checklists.filter(c => contarIrregularidades(c) > 0).length ? badge('amber', `${checklists.filter(c => contarIrregularidades(c) > 0).length} com irregularidade`) : '')}
  `;

  // calendário + "principais / mais próximos" ao lado (tocar num dia mostra só aquele dia)
  const irPara = (secao) => { screen = secao; loadEscritorio(); };
  const desenharAgendaPainel = () => {
    const cal = document.getElementById('painelCal'), caixa = document.getElementById('painelProximos');
    if(!cal) return;
    cal.innerHTML = calendarioAgenda(itensCalendario);
    const doDia = doDiaEscolhido(itensCalendario);
    const lista = doDia || itensCalendario
      .filter(a => diasAte(fimAgenda(a)) < 0 || diasAte(a.data_prevista) <= DIAS_PROXIMOS_PAINEL)
      .sort((a, b) => (diasAte(fimAgenda(a)) < 0 ? 0 : 1) - (diasAte(fimAgenda(b)) < 0 ? 0 : 1) || a.data_prevista.localeCompare(b.data_prevista));
    const d0 = (a) => paraData(a.data_prevista);
    caixa.innerHTML = `<div class="pa-titulo">${doDia ? `Em ${diaSemanaData(diaAgenda)}` : `Atrasados e próximos ${DIAS_PROXIMOS_PAINEL} dias`}</div>
      ${lista.length ? lista.slice(0, 8).map(a => { const [cor, txt] = a._doc ? (statusDocumento(a._doc) === 'vencido' ? ['red', 'Vencido'] : ['amber', 'A vencer']) : situacaoAgenda(a); return `
        <button type="button" class="pa-item" data-pa-ir="${a._doc ? 'documentos' : 'agenda'}">
          <span class="pa-data"><b>${d0(a).getDate()}</b>${d0(a).toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')}</span>
          <span class="pa-txt"><b>${esc(a.tipo)}</b><span>${esc(a._quem || '')}${a.hora ? ' · ' + String(a.hora).slice(0, 5) : ''}</span></span>
          ${badge(cor, txt)}</button>`; }).join('')
        + (lista.length > 8 ? `<div class="l2" style="padding:6px 2px;">e mais ${lista.length - 8}…</div>` : '')
        : `<div class="l2" style="padding:10px 2px;">${doDia ? 'Nada neste dia.' : 'Nenhum compromisso ou vencimento por perto.'}</div>`}
      ${docsSemData.length && !doDia ? `<button type="button" class="pa-aviso" data-pa-ir="documentos">${ic('alert', 14)} ${docsSemData.length} documento${docsSemData.length > 1 ? 's' : ''} sem validade informada: ${esc(docsSemData.slice(0, 2).map(d => d.tipo).join(', '))}${docsSemData.length > 2 ? '…' : ''}</button>` : ''}`;
    ligarCalendario(cal, desenharAgendaPainel);
    caixa.querySelectorAll('[data-pa-ir]').forEach(b => b.addEventListener('click', () => irPara(b.dataset.paIr)));
  };
  desenharAgendaPainel();
  ligarDicasGraficos(el);
  buscarEstoqueTanques().then(dados => {
    const caixa = document.getElementById('painelTanques');
    if(!caixa) return;
    if(!dados.tanques.length){ caixa.innerHTML = '<div class="l2">Nenhum tanque cadastrado. Cadastre em Abastecimento.</div>'; return; }
    const estoque = calcularEstoque(dados), dd = diasRestantes(estoque, 'diesel');
    caixa.innerHTML = cartoesTanques(estoque, { compacto: true }) + (dd != null ? `<div class="l2" style="margin-top:10px;">Diesel dá para uns <b>${numGraf(dd, 0)} dias</b> no ritmo atual.</div>` : '');
  }).catch(e => { const c = document.getElementById('painelTanques'); if(c) c.innerHTML = `<div class="l2">Não consegui carregar: ${esc(e.message)}</div>`; });

  el.querySelectorAll('[data-ir]').forEach(b => b.addEventListener('click', () => irPara(b.dataset.ir)));
  el.querySelectorAll('[data-checklist]').forEach(tr => tr.addEventListener('click', () => abrirDetalheChecklist(checklists.find(c => c.id === tr.dataset.checklist))));
  document.getElementById('btnNovaViagem').addEventListener('click', () => abrirNovaViagem(usuarios.filter(u => u.papel === 'motorista' && u.ativo)));
  el.querySelectorAll('[data-docs-viagem]').forEach(b => b.addEventListener('click', () => abrirDocumentosViagem(viagens.find(v => v.id === b.dataset.docsViagem))));
}

// (VIAGENS em js/viagens.js · ABASTECIMENTO em js/abastecimento-escritorio.js · INTEGRAÇÃO em js/integracao.js)

// ---------- correções do escritório (abastecimento, jornada, checklist; oficina fica em oficina.js) ----------
// campo <input type="datetime-local"> ↔ data/hora do banco
function paraCampoDataHora(iso){
  if(!iso) return '';
  const d = new Date(iso), p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
const doCampoDataHora = (v) => v ? new Date(v).toISOString() : null;
// Número no jeito brasileiro: "10.000" = 10000 (ponto de milhar), "1.234,5" = 1234.5,
// "5,89" e "5.89" = 5.89. Vazio = null; texto inválido = NaN.
const numeroOuNulo = (v) => {
  let t = String(v ?? '').trim().replace(/\s/g, '');
  if(t === '') return null;
  if(t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else if(/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
};

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
    .select('id, inicio, fim, status, assinatura_base64, motorista:motorista_id(nome), jornada_evento(tipo, motivo, observacao, criado_em, recebido_em, hora_celular)')
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
      ${eventos.map(ev => `<div class="timeline-item"><div class="hora">${fmtHora(ev.criado_em)}</div><div><b>${esc(ev.motivo || TIPO_EVENTO_LABEL[ev.tipo] || ev.tipo)}</b>${ev.observacao ? `<div class="l2">${esc(ev.observacao)}</div>` : ''}${marcaSemSinal(ev)}</div></div>`).join('') || '<div class="l2">Nenhum evento registrado.</div>'}
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
    .select('id, criado_em, recebido_em, hora_celular, respostas, motorista:motorista_id(nome), conjunto:conjunto_id(id, conjunto_item(ordem, veiculo:veiculo_id(placa, tipo)))')
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
        visiveis.map(c => { const n = contarIrregularidades(c); return `<tr class="clickable" data-checklist="${c.id}"><td>${esc(c.motorista ? c.motorista.nome : '—')}</td><td class="mono">${esc(cavaloDoConjunto(c.conjunto))}</td><td class="sub">${fmtDataHora(c.criado_em)}${marcaSemSinal(c)}</td><td>${(c.respostas || []).length}</td><td>${n || '—'}</td><td>${n ? badge('red', 'Irregular') : badge('green', 'OK')}</td></tr>`; }))
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
