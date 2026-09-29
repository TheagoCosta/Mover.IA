// MOVER.IA — painel do escritório (layout do protótipo: menu lateral + seções)
// (arquivo carregado pelo index.html; todas as funções ficam globais,
// então um arquivo pode chamar funções dos outros normalmente)

const SECOES_ESCRITORIO = [
  { k:'painel',        l:'Painel',        i:'home',    meta:() => `Visão geral da frota — hoje, ${hojeExtenso()}` },
  { k:'motoristas',    l:'Motoristas',    i:'user',    meta:() => 'Documentação e situação de todos os motoristas' },
  { k:'veiculos',      l:'Veículos',      i:'truck',   meta:() => 'Conjuntos e documentação da frota' },
  { k:'abastecimento', l:'Abastecimento', i:'fuel',    meta:() => 'Consumo médio e litros por veículo' },
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
            <div class="av">${esc(iniciais(usuarioAtual.nome))}</div>
            <button class="btn btn-outline btn-sm" id="btnSair" title="Sair">${ic('logout', 15)}<span>Sair</span></button>
          </div>
        </div>
        <div class="office-content" id="screenContent"><div class="status">Carregando...</div></div>
      </div>
    </div>`;

  document.getElementById('btnSair').addEventListener('click', doLogout);
  document.querySelectorAll('[data-secao]').forEach(b => b.addEventListener('click', () => {
    screen = b.dataset.secao;
    documentosSubtela = 'lista';
    loadEscritorio();
    window.scrollTo(0, 0);
  }));

  const el = document.getElementById('screenContent');
  const renderizar = {
    painel: secaoPainel, motoristas: secaoMotoristas, veiculos: secaoVeiculos, abastecimento: secaoAbastecimento,
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
const qUsuarios = () => consultar(sb.from('usuario').select('id, nome, papel, email, ativo, senha_temporaria, criado_em').order('nome'));
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
  const [usuarios, veiculos, conjuntos, docs, checklists, jornadas, viagens] = await Promise.all([
    qUsuarios(), qVeiculos(), qConjuntos(), qDocumentos(),
    consultar(sb.from('checklist').select('id, criado_em, respostas, motorista:motorista_id(nome), conjunto:conjunto_id(id, conjunto_item(ordem, veiculo:veiculo_id(placa, tipo)))').order('criado_em', { ascending:false }).limit(30)),
    consultar(sb.from('jornada').select('id, inicio, fim, status, motorista_id, jornada_evento(tipo, criado_em)').gte('inicio', new Date(inicioDoDia(seteDiasAtras)).toISOString())),
    consultar(sb.from('viagem').select('id, origem, destino, cte_numero, mdfe_numero, criado_em, motorista:motorista_id(nome)').eq('status', 'em_andamento').order('criado_em', { ascending:false })),
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
// MOTORISTAS
// ---------------------------------------------------------------------
async function secaoMotoristas(el){
  const [usuarios, conjuntos, docs, jornadasAbertas] = await Promise.all([
    qUsuarios(), qConjuntos(),
    consultar(sb.from('documento').select('id, referente_id, tipo, numero, validade, status').eq('referente_a', 'motorista')),
    consultar(sb.from('jornada').select('motorista_id, status').neq('status', 'encerrada')),
  ]);
  const motoristas = usuarios.filter(u => u.papel === 'motorista');
  const linhas = motoristas.map(m => {
    const meusDocs = docs.filter(d => d.referente_id === m.id);
    const cnh = meusDocs.find(d => /cnh/i.test(d.tipo));
    const conj = conjuntos.find(c => c.motorista_id === m.id && c.ativo);
    const jornada = jornadasAbertas.find(j => j.motorista_id === m.id);
    const pior = piorStatus(meusDocs);
    const situacao = !m.ativo ? badge('grey', 'Inativo') : m.senha_temporaria ? badge('amber', 'Aguardando 1º acesso')
      : jornada ? badge('blue', jornada.status === 'pausada' ? 'Em parada' : 'Em jornada') : badge('green', 'Ativo');
    return { m, meusDocs, conj, cnh, pior, situacao };
  });

  el.innerHTML = `
    <div class="o-banner">${ic('doc', 18)}<div class="txt"><b>Cadastrar motorista novo</b>Envie a CNH dele em <a href="#" data-ir="documentos">Documentos</a> — o app lê o nome e o CPF e cria o login sozinho.</div></div>
    ${painel(`Motoristas (${motoristas.length})`,
      motoristas.length ? tabela(['Motorista', 'Conjunto', 'CNH', 'Documentos', 'Situação'],
        linhas.map(({ m, conj, cnh, pior, meusDocs, situacao }) => `<tr class="clickable" data-motorista="${m.id}">
          <td>${nomeCelula(m.nome, loginDoEmail(m.email))}</td>
          <td class="mono">${esc(conj ? cavaloDoConjunto(conj) : '—')}</td>
          <td>${cnh ? `${badgeDoc(cnh)}<div class="sub">${esc(textoVencimento(cnh))}</div>` : '<span class="sub">Não cadastrada</span>'}</td>
          <td>${pior ? badge(COR_STATUS_DOC[pior], `${meusDocs.length} · ${ROTULO_STATUS_DOC[pior]}`) : '<span class="sub">Nenhum</span>'}</td>
          <td>${situacao}</td></tr>`))
        : vazio('Nenhum motorista cadastrado ainda.'))}`;

  el.querySelectorAll('[data-ir]').forEach(a => a.addEventListener('click', (e) => { e.preventDefault(); screen = a.dataset.ir; loadEscritorio(); }));
  el.querySelectorAll('[data-motorista]').forEach(tr => tr.addEventListener('click', () => {
    const { m, meusDocs, conj } = linhas.find(l => l.m.id === tr.dataset.motorista);
    abrirModal(m.nome, `
      <div class="l2" style="margin-bottom:12px;">Login: <b>${esc(loginDoEmail(m.email))}</b> · ${esc(papelLabel[m.papel])}</div>
      <div class="section-label" style="margin-top:0;">Conjunto</div>
      ${conj ? itensOrdenados(conj).map(i => `<div class="l2">${esc(labelPosicaoConjunto(i.ordem, i.veiculo.tipo))}: <b class="mono">${esc(i.veiculo.placa)}</b></div>`).join('') : '<div class="l2">Nenhum conjunto vinculado.</div>'}
      <div class="section-label">Documentos</div>
      ${meusDocs.length ? meusDocs.map(d => `<div style="display:flex; justify-content:space-between; gap:10px; padding:6px 0;"><div>${esc(d.tipo)}<div class="l2">${esc(textoVencimento(d))}</div></div>${badgeDoc(d)}</div>`).join('') : '<div class="l2">Nenhum documento cadastrado.</div>'}
    `);
  }));
}

// ---------------------------------------------------------------------
// VEÍCULOS
// ---------------------------------------------------------------------
async function secaoVeiculos(el){
  const [veiculos, conjuntos, docs] = await Promise.all([
    qVeiculos(), qConjuntos(),
    consultar(sb.from('documento').select('id, referente_id, tipo, validade, status').eq('referente_a', 'veiculo')),
  ]);
  const docsDe = (vid) => docs.filter(d => d.referente_id === vid);
  const conjuntoDoVeiculo = {};
  conjuntos.forEach(c => (c.conjunto_item || []).forEach(i => { conjuntoDoVeiculo[i.veiculo_id] = c; }));
  const celulaPlaca = (item) => item ? `<span class="mono">${esc(item.veiculo.placa)}</span>` : '<span class="sub">—</span>';

  el.innerHTML = `
    ${painel(`Conjuntos (${conjuntos.length})`,
      conjuntos.length ? tabela(['Motorista', 'Cavalo', '1ª carreta', 'Dolly', '2ª carreta', 'Documentos'],
        conjuntos.map(c => {
          const itens = itensOrdenados(c);
          const porTipo = (tipo, n = 0) => itens.filter(i => i.veiculo && i.veiculo.tipo === tipo)[n];
          const pior = piorStatus(itens.flatMap(i => docsDe(i.veiculo_id)));
          return `<tr><td>${c.motorista ? esc(c.motorista.nome) : '<span class="sub">Sem motorista</span>'}</td>
            <td>${celulaPlaca(porTipo('cavalo'))}</td><td>${celulaPlaca(porTipo('carreta', 0))}</td>
            <td>${celulaPlaca(porTipo('dolly'))}</td><td>${celulaPlaca(porTipo('carreta', 1))}</td>
            <td>${pior ? badge(COR_STATUS_DOC[pior], ROTULO_STATUS_DOC[pior]) : '<span class="sub">Nenhum</span>'}</td></tr>`;
        }))
        : vazio('Nenhum conjunto cadastrado.'))}
    ${painel(`Veículos (${veiculos.length})`,
      tabela(['Placa', 'Tipo', 'Modelo', 'Motorista do conjunto', 'Documentos'],
        veiculos.map(v => {
          const c = conjuntoDoVeiculo[v.id];
          const meus = docsDe(v.id);
          return `<tr><td class="mono">${esc(v.placa)}</td><td>${esc(tipoLabelGlobal[v.tipo] || v.tipo)}</td><td class="sub">${esc([v.modelo, v.ano].filter(Boolean).join(' · ') || '—')}</td>
            <td>${c && c.motorista ? esc(c.motorista.nome) : '<span class="sub">—</span>'}</td>
            <td>${meus.length ? meus.map(d => `<div style="margin:2px 0;">${badgeDoc(d)} <span class="sub">${esc(d.tipo)}</span></div>`).join('') : '<span class="sub">Nenhum</span>'}</td></tr>`;
        })))}`;
}

// ---------------------------------------------------------------------
// ABASTECIMENTO
// ---------------------------------------------------------------------
async function secaoAbastecimento(el){
  const registros = await consultar(sb.from('abastecimento')
    .select('id, data, km, litros, odometro_bomba, media_calculada, motorista:motorista_id(nome), veiculo:veiculo_id(placa)')
    .order('data', { ascending:false }).limit(500));
  const trintaDias = new Date(Date.now() - 30 * 86400000);
  const recentes = registros.filter(a => new Date(a.data) >= trintaDias);
  const medias = registros.filter(a => a.media_calculada).map(a => Number(a.media_calculada));
  const mediaGeral = medias.length ? medias.reduce((s, v) => s + v, 0) / medias.length : null;
  const fmtNum = (n, casas = 1) => n == null ? '—' : Number(n).toLocaleString('pt-BR', { minimumFractionDigits:casas, maximumFractionDigits:casas });

  const porVeiculo = {};
  registros.forEach(a => {
    const placa = a.veiculo ? a.veiculo.placa : '—';
    const v = porVeiculo[placa] || (porVeiculo[placa] = { placa, medias:[], litros:0, n:0, ultimoKm:null, ultimaData:null });
    if(a.media_calculada) v.medias.push(Number(a.media_calculada));
    v.litros += Number(a.litros) || 0; v.n++;
    if(!v.ultimaData || new Date(a.data) > new Date(v.ultimaData)){ v.ultimaData = a.data; v.ultimoKm = a.km; }
  });
  const veiculos = Object.values(porVeiculo).map(v => ({ ...v, media: v.medias.length ? v.medias.reduce((s, x) => s + x, 0) / v.medias.length : null }))
    .sort((a, b) => (a.media ?? 99) - (b.media ?? 99));

  el.innerHTML = `
    <div class="kpi-row tres">
      ${kpi(mediaGeral ? fmtNum(mediaGeral, 2) + ' km/l' : '—', 'Consumo médio da frota', medias.length ? `${medias.length} abastecimento${medias.length > 1 ? 's' : ''} com média calculada` : 'A média aparece a partir do 2º abastecimento de cada veículo')}
      ${kpi(fmtNum(recentes.reduce((s, a) => s + (Number(a.litros) || 0), 0), 0) + ' L', 'Litros nos últimos 30 dias')}
      ${kpi(recentes.length, 'Abastecimentos nos últimos 30 dias')}
    </div>
    ${painel('Consumo médio por veículo',
      veiculos.length ? tabela(['Placa', 'Consumo médio', 'Abastecimentos', 'Litros (total)', 'Último km'],
        veiculos.map(v => `<tr><td class="mono">${esc(v.placa)}</td><td>${v.media ? fmtNum(v.media, 2) + ' km/l' : '<span class="sub">—</span>'}</td><td>${v.n}</td><td>${fmtNum(v.litros, 0)} L</td><td class="mono">${fmtNum(v.ultimoKm, 0)}</td></tr>`))
        : vazio('Nenhum abastecimento registrado ainda. Os motoristas registram pelo app, em Mais → Abastecimentos.'),
      veiculos.length ? botaoExportar('btnCsvConsumo') : '')}
    ${painel('Abastecimentos registrados',
      registros.length ? tabela(['Data', 'Placa', 'Motorista', 'Km do veículo', 'Odômetro da bomba', 'Litros', 'Média'],
        registros.slice(0, 100).map(a => `<tr><td class="sub">${fmtDataHora(a.data)}</td><td class="mono">${esc(a.veiculo ? a.veiculo.placa : '—')}</td><td>${esc(a.motorista ? a.motorista.nome : '—')}</td><td class="mono">${fmtNum(a.km, 0)}</td><td class="mono">${a.odometro_bomba != null ? fmtNum(a.odometro_bomba, 1) : '—'}</td><td>${fmtNum(a.litros, 1)} L</td><td>${a.media_calculada ? fmtNum(a.media_calculada, 2) + ' km/l' : '<span class="sub">—</span>'}</td></tr>`))
        : vazio('Nada por aqui ainda.'),
      registros.length ? botaoExportar('btnCsvAbastecimentos') : '')}`;

  const b1 = document.getElementById('btnCsvConsumo');
  if(b1) b1.addEventListener('click', () => baixarCSV('consumo_por_veiculo', ['Placa', 'Consumo médio (km/l)', 'Abastecimentos', 'Litros (total)', 'Último km'],
    veiculos.map(v => [v.placa, v.media ? v.media.toFixed(2).replace('.', ',') : '', v.n, String(v.litros).replace('.', ','), v.ultimoKm ?? ''])));
  const b2 = document.getElementById('btnCsvAbastecimentos');
  if(b2) b2.addEventListener('click', () => baixarCSV('abastecimentos', ['Data', 'Placa', 'Motorista', 'Km do veículo', 'Odômetro da bomba', 'Litros', 'Média (km/l)'],
    registros.map(a => [fmtDataHora(a.data), a.veiculo ? a.veiculo.placa : '', a.motorista ? a.motorista.nome : '', a.km, a.odometro_bomba ?? '', String(a.litros).replace('.', ','), a.media_calculada ? Number(a.media_calculada).toFixed(2).replace('.', ',') : ''])));
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
      ${j.assinatura_base64 ? `<div class="section-label">Assinatura do motorista</div><img src="${j.assinatura_base64}" alt="Assinatura" style="width:100%; background:#fff; border:1px solid var(--border); border-radius:8px;">` : ''}
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
  const itens = await consultar(sb.from('checklist_item_padrao').select('id, ordem, descricao, padrao_esperado').order('ordem'));
  const resposta = Object.fromEntries((checklist.respostas || []).map(r => [r.item_id, r.resposta]));
  const rotulo = { ok:['green', 'Atende'], bad:['red', 'Não atende'], na:['grey', 'N/A'] };
  const respondidos = itens.filter(i => resposta[i.id]);
  const ordenados = [...respondidos.filter(i => resposta[i.id] === 'bad'), ...respondidos.filter(i => resposta[i.id] !== 'bad')];
  abrirModal(`Checklist — ${checklist.motorista ? checklist.motorista.nome : ''}`, `
    <div class="l2" style="margin-bottom:10px;">${fmtDataHora(checklist.criado_em)} · conjunto ${esc(cavaloDoConjunto(checklist.conjunto))}</div>
    ${ordenados.map(i => { const [cor, txt] = rotulo[resposta[i.id]] || ['grey', resposta[i.id]]; return `<div class="timeline-item"><div class="hora">${i.ordem}.</div><div style="flex:1;">${esc(i.descricao)}${i.padrao_esperado ? `<div class="l2">${esc(i.padrao_esperado)}</div>` : ''}</div><div>${badge(cor, txt)}</div></div>`; }).join('') || '<div class="l2">Sem respostas.</div>'}`);
}

// ---------------------------------------------------------------------
// CAPACITAÇÕES e AGENDA (cadastro chega na etapa 4)
// ---------------------------------------------------------------------
async function secaoCapacitacoes(el){
  const lista = await consultar(sb.from('capacitacao').select('id, tipo, data_realizacao, validade, motorista:motorista_id(nome)').order('validade'));
  el.innerHTML = painel('Capacitações e certificações',
    lista.length ? tabela(['Motorista', 'Treinamento', 'Realizado em', 'Validade', 'Status'],
      lista.map(c => `<tr><td>${esc(c.motorista ? c.motorista.nome : '—')}</td><td>${esc(c.tipo)}</td><td>${fmtData(c.data_realizacao)}</td><td>${fmtData(c.validade)}</td><td>${badgeDoc({ validade:c.validade, status:'ok' })}</td></tr>`))
      : vazio('Nenhuma capacitação cadastrada ainda. O cadastro de treinamentos (MOPP, direção defensiva etc.) chega numa próxima etapa.'));
}

async function secaoAgenda(el){
  const lista = await consultar(sb.from('agendamento').select('id, tipo, data_prevista, status, observacao, motorista:motorista_id(nome), veiculo:veiculo_id(placa)').order('data_prevista'));
  el.innerHTML = painel('Próximos agendamentos',
    lista.length ? tabela(['Data', 'Compromisso', 'Responsável', 'Status'],
      lista.map(a => `<tr><td>${fmtData(a.data_prevista)}</td><td>${esc(a.tipo)}${a.observacao ? `<div class="sub">${esc(a.observacao)}</div>` : ''}</td><td>${esc([a.motorista && a.motorista.nome, a.veiculo && a.veiculo.placa].filter(Boolean).join(' · ') || 'Toda a equipe')}</td><td>${badge(a.status === 'concluido' ? 'green' : 'amber', a.status === 'concluido' ? 'Concluído' : 'Pendente')}</td></tr>`))
      : vazio('Nenhum agendamento ainda. O cadastro de revisões, exames e compromissos chega numa próxima etapa.'));
}

// ---------------------------------------------------------------------
// USUÁRIOS
// ---------------------------------------------------------------------
async function secaoUsuarios(el){
  const usuarios = await qUsuarios();
  const ordem = { admin_transportadora:0, gestor:1, mecanico:2, motorista:3, admin_mover_ia:4 };
  const lista = [...usuarios].sort((a, b) => (ordem[a.papel] ?? 9) - (ordem[b.papel] ?? 9) || a.nome.localeCompare(b.nome));
  el.innerHTML = `
    <div class="o-banner">${ic('users', 18)}<div class="txt"><b>Quem cadastra quem</b>Motoristas são cadastrados automaticamente ao enviar a CNH em Documentos. Mecânicos, pelo botão ao lado. O convite de usuários do escritório (por e-mail) chega numa próxima etapa.</div></div>
    ${painel(`Usuários (${usuarios.length})`,
      tabela(['Nome', 'Login / e-mail', 'Papel', 'Situação'],
        lista.map(u => `<tr><td>${nomeCelula(u.nome)}</td><td class="mono">${esc(loginDoEmail(u.email))}</td><td>${esc(papelLabel[u.papel] || u.papel)}</td><td>${!u.ativo ? badge('grey', 'Inativo') : u.senha_temporaria ? badge('amber', 'Aguardando 1º acesso') : badge('green', 'Ativo')}</td></tr>`)),
      `<button class="btn btn-primary btn-sm" id="btnNovoMecanico">${ic('wrench', 15)} Cadastrar mecânico</button>`)}`;
  document.getElementById('btnNovoMecanico').addEventListener('click', abrirCadastroMecanico);
}

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

// ---------------------------------------------------------------------
// CONFIGURAÇÕES
// ---------------------------------------------------------------------
async function secaoConfig(el){
  const [empresa] = await consultar(sb.from('transportadora').select('*').eq('id', usuarioAtual.transportadora_id));
  const usuarios = await qUsuarios();
  if(!empresa){ el.innerHTML = vazio('Não encontrei os dados da transportadora.'); return; }
  const plano = PLANOS[empresa.plano] || PLANOS.Essencial;
  const nMot = usuarios.filter(u => u.papel === 'motorista' && u.ativo).length;
  const nEsc = usuarios.filter(u => u.papel !== 'motorista' && u.papel !== 'admin_mover_ia' && u.ativo).length;
  const campo = (rotulo, valor) => `<div class="field-row"><label>${rotulo}</label><input value="${esc(valor || '—')}" disabled></div>`;
  el.innerHTML = `
    <div class="two-col">
      ${painel('Dados da empresa', `<div class="o-panel-body">
        ${campo('Razão social', empresa.razao_social)}${campo('Nome fantasia', empresa.nome_fantasia)}
        <div class="o-form-grid">${campo('CNPJ', empresa.cnpj)}${campo('RNTRC / ANTT', empresa.rntrc)}${campo('Registro IBAMA', empresa.ibama_registro)}</div>
        ${campo('Endereço', empresa.endereco)}
        <div class="o-form-grid">${campo('Telefone', empresa.telefone)}${campo('E-mail de contato', empresa.email)}</div>
        <div class="l2">A edição destes dados pelo painel chega numa próxima etapa.</div>
      </div>`)}
      ${painel('Plano contratado', `<div class="o-panel-body">
        <div class="kpi-row" style="grid-template-columns:1fr; margin-bottom:12px;">${kpi(esc(empresa.plano), 'Plano atual', plano.mensalidade)}</div>
        <div class="kpi-row" style="grid-template-columns:1fr 1fr; margin-bottom:0;">
          ${kpi(`${nMot}/${plano.motoristas}`, 'Motoristas na franquia', nMot > plano.motoristas ? `${nMot - plano.motoristas} adiciona${nMot - plano.motoristas > 1 ? 'is' : 'l'}` : '', nMot > plano.motoristas ? 'ambar' : '')}
          ${kpi(`${nEsc}/${plano.escritorio}`, 'Usuários de escritório')}
        </div>
      </div>`)}
    </div>`;
}
