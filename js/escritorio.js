// MOVER.IA — painel do escritório (layout do protótipo: menu lateral + seções)
// (arquivo carregado pelo index.html; todas as funções ficam globais,
// então um arquivo pode chamar funções dos outros normalmente)

const SECOES_ESCRITORIO = [
  { k:'painel',        l:'Painel',        i:'home',    meta:() => `Visão geral da frota — hoje, ${hojeExtenso()}` },
  { k:'motoristas',    l:'Motoristas',    i:'user',    meta:() => 'Documentação e situação de todos os motoristas' },
  { k:'veiculos',      l:'Veículos',      i:'truck',   meta:() => 'Conjuntos e documentação da frota' },
  { k:'abastecimento', l:'Abastecimento', i:'fuel',    meta:() => 'Abastecimentos registrados, litros e gastos em posto' },
  { k:'consumo',       l:'Consumo',       i:'chart',   meta:() => 'Média de consumo por veículo e por motorista, evolução e alertas' },
  { k:'oficina',       l:'Oficina',       i:'wrench',  meta:() => 'Chamados de manutenção — motoristas, mecânico e oficinas externas' },
  { k:'jornadas',      l:'Jornadas',      i:'clock',   meta:() => 'Registro de horas de condução e paradas' },
  { k:'checklists',    l:'Checklists',    i:'checksq', meta:() => 'Inspeções pré-viagem enviadas pelos motoristas' },
  { k:'documentos',    l:'Documentos',    i:'doc',     meta:() => 'Repositório central de documentos' },
  { k:'capacitacoes',  l:'Capacitações',  i:'award',   meta:() => 'Treinamentos e certificações da equipe' },
  { k:'agenda',        l:'Agenda',        i:'cal',     meta:() => 'Revisões, exames e compromissos agendados' },
  { k:'usuarios',      l:'Usuários',      i:'users',   meta:() => 'Quem tem acesso ao sistema' },
  { k:'integracao',    l:'Integração',    i:'sync',    meta:() => 'Sincronização com o sistema da transportadora (TMS)', emBreve:true },
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
    const secao = { agendamentos:'agenda', capacitacoes:'capacitacoes', 'tab:viagem':'painel' }[destino] || destino;
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
    painel: secaoPainel, motoristas: secaoMotoristas, veiculos: secaoVeiculos, abastecimento: secaoAbastecimento, consumo: secaoConsumo,
    oficina: secaoOficina, jornadas: secaoJornadas, checklists: secaoChecklists, documentos: () => loadDocumentos(),
    capacitacoes: secaoCapacitacoes, agenda: secaoAgenda, usuarios: secaoUsuarios, integracao: secaoIntegracao, config: secaoConfig,
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
const qUsuarios = () => consultar(sb.from('usuario').select('id, nome, papel, email, telefone, ativo, senha_temporaria, criado_em').order('nome'));
const qVeiculos = () => consultar(sb.from('veiculo').select('id, placa, tipo, modelo, ano, ativo').order('placa'));
const qConjuntos = () => consultar(sb.from('conjunto').select('id, ativo, motorista_id, motorista:motorista_id(nome), conjunto_item(ordem, veiculo_id, veiculo:veiculo_id(placa, tipo, modelo))'));
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
      viagens.length ? tabela(['Motorista', 'Origem → destino', 'CT-e', 'MDF-e', 'Aberta em'],
        viagens.map(v => `<tr><td>${esc(v.motorista ? v.motorista.nome : '—')}</td><td>${esc(v.origem || '?')} → ${esc(v.destino || '?')}</td><td class="mono">${esc(v.cte_numero || '—')}</td><td class="mono">${esc(v.mdfe_numero || '—')}</td><td class="sub">${fmtDataHora(v.criado_em)}</td></tr>`))
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

  const { error } = await sb.from('viagem').insert({
    transportadora_id: usuarioAtual.transportadora_id,
    motorista_id: motoristaId,
    veiculo_id: cavaloItem ? cavaloItem.veiculo_id : null,
    origem: origem || null,
    destino: destino || null,
    cte_numero: cte || null,
    mdfe_numero: mdfe || null,
    status: 'em_andamento'
  });

  if(error){ alert('Erro ao criar viagem: ' + error.message); btn.disabled = false; btn.textContent = 'Criar viagem'; return; }
  fecharModal();
  mostrarToast('✅ Viagem criada');
  loadEscritorio();
}

// ---------------------------------------------------------------------
// ABASTECIMENTO
// ---------------------------------------------------------------------
let filtroAbastecimento = 'todos';

async function secaoAbastecimento(el){
  const registros = await consultar(sb.from('abastecimento')
    .select('id, data, tipo, km, litros, arla_litros, preco_litro_diesel, preco_litro_arla, odometro_bomba, posto, nota_numero, media_calculada, media_arla_calculada, confirmado_em, motorista:motorista_id(nome), veiculo:veiculo_id(placa), confirmado:confirmado_por(nome)')
    .order('data', { ascending:false }).limit(1000));
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

  const visiveis = filtroAbastecimento === 'todos' ? registros : registros.filter(a => a.tipo === filtroAbastecimento);
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
        : vazio('Nenhum abastecimento registrado ainda. Os motoristas registram pelo app, em Mais → Abastecimentos.'),
      veiculos.length ? botaoExportar('btnCsvConsumo') : '')}
    <div class="doc-tabs" style="max-width:420px;">
      ${[['todos', 'Todos'], ['interno', 'Internos'], ['externo', 'Externos']].map(([k, l]) => `<button class="${filtroAbastecimento === k ? 'active' : ''}" data-filtro-abast="${k}">${l}</button>`).join('')}
    </div>
    ${painel(`Abastecimentos registrados (${visiveis.length})`,
      visiveis.length ? tabela(['Data e hora', 'Tipo', 'Placa', 'Motorista', 'Km', 'Diesel', 'Arla', 'Média diesel', 'Valor', 'Posto / confirmação'],
        visiveis.slice(0, 200).map(a => { const valor = valorAbastecimento(a); return `<tr><td class="sub">${fmtDataHora(a.data)}</td><td>${a.tipo ? badge(a.tipo === 'interno' ? 'blue' : 'grey', ROTULO_TIPO_ABAST[a.tipo]) : '<span class="sub">—</span>'}</td><td class="mono">${esc(a.veiculo ? a.veiculo.placa : '—')}</td><td>${esc(a.motorista ? a.motorista.nome : '—')}</td><td class="mono">${fmtNum(a.km, 0)}</td>
          <td>${fmtNum(a.litros, 1)} L${a.preco_litro_diesel ? `<div class="sub">${fmtReais(a.preco_litro_diesel)}/L</div>` : ''}</td>
          <td>${a.arla_litros ? fmtNum(a.arla_litros, 1) + ' L' : '<span class="sub">—</span>'}${a.preco_litro_arla ? `<div class="sub">${fmtReais(a.preco_litro_arla)}/L</div>` : ''}${a.media_arla_calculada ? `<div class="sub">${fmtNum(a.media_arla_calculada, 1)} km/l</div>` : ''}</td>
          <td>${a.media_calculada ? fmtNum(a.media_calculada, 2) + ' km/l' : '<span class="sub">—</span>'}</td>
          <td>${valor ? fmtReais(valor) : '<span class="sub">—</span>'}</td><td>${origem(a)}</td></tr>`; }))
        : vazio('Nada por aqui ainda.'),
      visiveis.length ? botaoExportar('btnCsvAbastecimentos') : '')}`;

  el.querySelectorAll('[data-filtro-abast]').forEach(b => b.addEventListener('click', () => { filtroAbastecimento = b.dataset.filtroAbast; secaoAbastecimento(el); }));
  el.querySelectorAll('[data-ir-consumo]').forEach(a => a.addEventListener('click', (e) => { e.preventDefault(); screen = 'consumo'; loadEscritorio(); }));
  const dec = (v, c) => v == null || v === '' ? '' : Number(v).toFixed(c).replace('.', ',');
  const b1 = document.getElementById('btnCsvConsumo');
  if(b1) b1.addEventListener('click', () => baixarCSV('consumo_por_veiculo', ['Placa', 'Média diesel (km/l)', 'Média Arla (km/l)', 'Abastecimentos', 'Diesel (total L)', 'Arla (total L)', 'Último km'],
    veiculos.map(v => [v.placa, v.media ? dec(v.media, 2) : '', v.mediaArla ? dec(v.mediaArla, 1) : '', v.n, dec(v.litros, 1), dec(v.arla, 1), v.ultimoKm ?? ''])));
  const b2 = document.getElementById('btnCsvAbastecimentos');
  if(b2) b2.addEventListener('click', () => baixarCSV('abastecimentos', ['Data e hora', 'Tipo', 'Placa', 'Motorista', 'Km do veículo', 'Diesel (L)', 'R$/L diesel', 'Arla (L)', 'R$/L Arla', 'Valor (R$)', 'Odômetro da bomba', 'Posto', 'Nota / comprovante', 'Confirmado por', 'Média diesel (km/l)', 'Média Arla (km/l)'],
    visiveis.map(a => [fmtDataHora(a.data), a.tipo ? ROTULO_TIPO_ABAST[a.tipo] : '', a.veiculo ? a.veiculo.placa : '', a.motorista ? a.motorista.nome : '', a.km, dec(a.litros, 2), dec(a.preco_litro_diesel, 3), dec(a.arla_litros, 2), dec(a.preco_litro_arla, 3), valorAbastecimento(a) ? dec(valorAbastecimento(a), 2) : '', a.odometro_bomba ?? '', a.posto || '', a.nota_numero || '', a.confirmado ? a.confirmado.nome : '', a.media_calculada ? dec(a.media_calculada, 2) : '', a.media_arla_calculada ? dec(a.media_arla_calculada, 1) : ''])));
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

  el.innerHTML = painel(`Registro de jornadas (${jornadas.length})`,
    jornadas.length ? tabela(['Motorista', 'Data', 'Início', 'Fim', 'Tempo de condução', 'Paradas', 'Status'],
      linhas.map(({ j, c }) => `<tr class="clickable" data-jornada="${j.id}"><td>${esc(j.motorista ? j.motorista.nome : '—')}</td><td>${fmtData(j.inicio)}</td><td class="mono">${fmtHora(j.inicio)}</td><td class="mono">${j.fim ? fmtHora(j.fim) : '—'}</td><td class="mono">${fmtMinutos(c.totalMin)}</td><td>${c.paradas}</td><td>${badge(COR_JORNADA[j.status], ROTULO_JORNADA[j.status])}</td></tr>`))
      : vazio('Nenhuma jornada registrada ainda.'),
    jornadas.length ? botaoExportar('btnCsvJornadas') : '');

  el.querySelectorAll('[data-jornada]').forEach(tr => tr.addEventListener('click', () => {
    const { j, eventos, c } = linhas.find(l => l.j.id === tr.dataset.jornada);
    abrirModal(`${j.motorista ? j.motorista.nome : 'Jornada'} — ${fmtData(j.inicio)}`, `
      <div class="l2" style="margin-bottom:10px;">Tempo de condução: <b>${fmtMinutos(c.totalMin)}</b> · ${c.paradas} parada${c.paradas === 1 ? '' : 's'} · ${esc(ROTULO_JORNADA[j.status])}</div>
      ${eventos.map(ev => `<div class="timeline-item"><div class="hora">${fmtHora(ev.criado_em)}</div><div><b>${esc(ev.motivo || TIPO_EVENTO_LABEL[ev.tipo] || ev.tipo)}</b>${ev.observacao ? `<div class="l2">${esc(ev.observacao)}</div>` : ''}</div></div>`).join('') || '<div class="l2">Nenhum evento registrado.</div>'}
      ${imgAssinatura(j.assinatura_base64) ? `<div class="section-label">Assinatura do motorista</div>${imgAssinatura(j.assinatura_base64, 'width:100%; background:#fff; border:1px solid var(--border); border-radius:8px;')}` : ''}
    `);
  }));
  const b = document.getElementById('btnCsvJornadas');
  if(b) b.addEventListener('click', () => baixarCSV('jornadas', ['Motorista', 'Data', 'Início', 'Fim', 'Tempo de condução', 'Paradas', 'Status'],
    linhas.map(({ j, c }) => [j.motorista ? j.motorista.nome : '', fmtData(j.inicio), fmtHora(j.inicio), j.fim ? fmtHora(j.fim) : '', fmtMinutos(c.totalMin), c.paradas, ROTULO_JORNADA[j.status]])));
}

// ---------------------------------------------------------------------
// CHECKLISTS
// ---------------------------------------------------------------------
async function secaoChecklists(el){
  const checklists = await consultar(sb.from('checklist')
    .select('id, criado_em, respostas, motorista:motorista_id(nome), conjunto:conjunto_id(id, conjunto_item(ordem, veiculo:veiculo_id(placa, tipo)))')
    .order('criado_em', { ascending:false }).limit(200));
  el.innerHTML = painel(`Checklists enviados (${checklists.length})`,
    checklists.length ? tabela(['Motorista', 'Conjunto', 'Data', 'Itens respondidos', 'Irregularidades', 'Status'],
      checklists.map(c => { const n = contarIrregularidades(c); return `<tr class="clickable" data-checklist="${c.id}"><td>${esc(c.motorista ? c.motorista.nome : '—')}</td><td class="mono">${esc(cavaloDoConjunto(c.conjunto))}</td><td class="sub">${fmtDataHora(c.criado_em)}</td><td>${(c.respostas || []).length}</td><td>${n || '—'}</td><td>${n ? badge('red', 'Irregular') : badge('green', 'OK')}</td></tr>`; }))
      : vazio('Nenhum checklist enviado ainda.'),
    checklists.length ? botaoExportar('btnCsvChecklists') : '');
  el.querySelectorAll('[data-checklist]').forEach(tr => tr.addEventListener('click', () => abrirDetalheChecklist(checklists.find(c => c.id === tr.dataset.checklist))));
  const b = document.getElementById('btnCsvChecklists');
  if(b) b.addEventListener('click', () => baixarCSV('checklists', ['Motorista', 'Conjunto', 'Data', 'Itens respondidos', 'Irregularidades'],
    checklists.map(c => [c.motorista ? c.motorista.nome : '', cavaloDoConjunto(c.conjunto), fmtDataHora(c.criado_em), (c.respostas || []).length, contarIrregularidades(c)])));
}

async function abrirDetalheChecklist(checklist){
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
      : '<div class="l2">Checklist enviado antes da assinatura existir no app.</div>'}`);
}

// (as seções AGENDA e CAPACITAÇÕES ficam em js/agenda.js e js/capacitacoes.js)

// ---------------------------------------------------------------------
// INTEGRAÇÃO (Bloco 5 do plano)
// ---------------------------------------------------------------------
function secaoIntegracao(el){
  el.innerHTML = `
    <div class="kpi-row tres">
      ${kpi('<span style="font-size:16px; color:var(--text-secondary);">● Não conectado</span>', 'Bsoft (TMS)')}
      ${kpi('—', 'Última sincronização')}
      ${kpi('3–5 min', 'Frequência prevista (polling)')}
    </div>
    ${painel('Integração com o Bsoft', `<div class="o-panel-body"><div class="l2" style="line-height:1.55;">
      Quando a integração estiver pronta, as viagens, CT-e e MDF-e emitidos no Bsoft vão aparecer aqui e no app do motorista automaticamente,
      vinculados pela placa e pelo CPF. A API do Bsoft já foi confirmada (consulta periódica, sem webhook). Está no <b>Bloco 5</b> do plano.
    </div></div>`)}`;
}

// (as seções MOTORISTAS, VEÍCULOS, USUÁRIOS e CONFIGURAÇÕES ficam em js/cadastros.js, com edição)
