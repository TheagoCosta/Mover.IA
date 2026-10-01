// MOVER.IA — Agenda: revisões, exames, folgas e compromissos.
//   • Escritório: cria, edita, conclui, cancela e exclui agendamentos.
//   • Motorista: vê os dele (e os dos veículos do conjunto dele) e marca
//     "estou ciente" (função confirmar_agendamento do banco).
//   • Mecânico: vê os agendamentos de veículos (revisão, troca de óleo...).
// Todos têm um calendário do mês (hoje destacado, dias com compromisso
// marcados; tocar num dia filtra a lista). Um compromisso pode durar vários
// dias (data_fim — ex: folga de sexta a segunda).
// Criar um agendamento avisa o motorista pelo sino (gatilho no banco).
// (arquivo carregado pelo index.html; todas as funções ficam globais,
// então um arquivo pode chamar funções dos outros normalmente)

const TIPOS_AGENDAMENTO = ['Revisão preventiva', 'Troca de óleo', 'Troca de pneus', 'Exame toxicológico', 'ASO (exame médico)',
  'Renovação da CNH', 'Vistoria / inspeção', 'Licenciamento (CRLV)', 'Treinamento', 'Reunião de segurança', 'Folga', 'Férias', 'Outro'];
const ROTULO_AGENDA = { pendente:'Pendente', concluido:'Concluído', cancelado:'Cancelado' };
const DIAS_SEMANA_CURTO = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
let filtroAgenda = 'proximos';

// ---------- datas ----------
function isoDia(d){ return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function fimAgenda(a){ return a.data_fim && a.data_fim > a.data_prevista ? a.data_fim : a.data_prevista; }
function ehPeriodo(a){ return fimAgenda(a) !== a.data_prevista; }
function diaSemanaData(iso){ const d = paraData(iso); return `${DIAS_SEMANA_CURTO[d.getDay()]} ${fmtDataCurta(d)}`; }
function dataHoraAgenda(a){
  const hora = a.hora ? String(a.hora).slice(0, 5) : '';
  if(ehPeriodo(a)) return `${diaSemanaData(a.data_prevista)} → ${diaSemanaData(fimAgenda(a))}${hora ? ' · ' + hora : ''}`;
  return `${fmtData(a.data_prevista)}${hora ? ' às ' + hora : ''}`;
}
function situacaoAgenda(a){
  if(a.status === 'concluido') return ['green', 'Concluído'];
  if(a.status === 'cancelado') return ['grey', 'Cancelado'];
  const inicio = diasAte(a.data_prevista), fim = diasAte(fimAgenda(a));
  if(fim < 0) return ['red', 'Atrasado'];
  if(inicio < 0 || (inicio === 0 && ehPeriodo(a))) return ['amber', 'Em andamento'];
  if(inicio === 0) return ['amber', 'Hoje'];
  if(inicio <= 7) return ['amber', `Em ${inicio} dia${inicio > 1 ? 's' : ''}`];
  return ['blue', 'Agendado'];
}
const CAMPOS_AGENDA = 'id, tipo, data_prevista, data_fim, hora, local, status, observacao, ciente_em, concluido_em, motorista_id, veiculo_id, motorista:motorista_id(nome), veiculo:veiculo_id(placa)';

// ---------------------------------------------------------------------
// Calendário do mês (usado no escritório, no motorista e no mecânico)
// ---------------------------------------------------------------------
let mesAgenda = null;   // primeiro dia do mês mostrado
let diaAgenda = null;   // 'AAAA-MM-DD' escolhido (filtra a lista) ou null
const COR_PONTO_AGENDA = { red:'var(--signal-red)', amber:'var(--signal-amber)', blue:'#5aa9d6', green:'var(--signal-green)', grey:'var(--text-secondary)' };

// dia → compromissos daquele dia (um compromisso de vários dias marca todos)
function mapaDiasAgenda(lista){
  const mapa = {};
  lista.filter(a => a.status !== 'cancelado').forEach(a => {
    const d = paraData(a.data_prevista), fim = paraData(fimAgenda(a));
    for(let n = 0; d <= fim && n < 92; n++, d.setDate(d.getDate() + 1)) (mapa[isoDia(d)] = mapa[isoDia(d)] || []).push(a);
  });
  return mapa;
}

function calendarioAgenda(lista){
  if(!mesAgenda){ const h = new Date(); mesAgenda = new Date(h.getFullYear(), h.getMonth(), 1); }
  const mapa = mapaDiasAgenda(lista);
  const hoje = isoDia(new Date());
  const diasNoMes = new Date(mesAgenda.getFullYear(), mesAgenda.getMonth() + 1, 0).getDate();
  const semanas = Math.ceil((mesAgenda.getDay() + diasNoMes) / 7);
  const d = new Date(mesAgenda); d.setDate(1 - mesAgenda.getDay());
  const celulas = [];
  for(let i = 0; i < semanas * 7; i++, d.setDate(d.getDate() + 1)){
    const iso = isoDia(d), doDia = mapa[iso] || [];
    const cores = [...new Set(doDia.map(a => situacaoAgenda(a)[0]))].slice(0, 3);
    const classes = ['cal-dia', d.getMonth() !== mesAgenda.getMonth() && 'fora', doDia.length && 'tem', iso === hoje && 'hoje', iso === diaAgenda && 'sel'].filter(Boolean).join(' ');
    celulas.push(`<button type="button" class="${classes}" data-cal-dia="${iso}" aria-label="${fmtData(iso)}${doDia.length ? ` — ${doDia.length} compromisso${doDia.length > 1 ? 's' : ''}` : ''}">
      <span>${d.getDate()}</span><span class="cal-pontos">${cores.map(c => `<i style="background:${COR_PONTO_AGENDA[c]}"></i>`).join('')}</span></button>`);
  }
  const nomeMes = mesAgenda.toLocaleDateString('pt-BR', { month:'long' });
  const titulo = nomeMes.charAt(0).toUpperCase() + nomeMes.slice(1) + ' ' + mesAgenda.getFullYear();
  return `<div class="cal">
    <div class="cal-topo">
      <button type="button" class="cal-nav" data-cal-mes="-1" aria-label="Mês anterior">‹</button>
      <b>${titulo}</b>
      <button type="button" class="cal-nav" data-cal-mes="1" aria-label="Próximo mês">›</button>
    </div>
    <div class="cal-grade">${['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map(s => `<div class="cal-sem">${s}</div>`).join('')}${celulas.join('')}</div>
    <div class="cal-rodape"><span><i class="cal-marca-hoje"></i> Hoje</span>${diaAgenda ? `<button type="button" class="cal-limpar" data-cal-limpar>Mostrar todos</button>` : '<span class="cal-dica">Toque num dia para ver os compromissos</span>'}</div>
  </div>`;
}

function ligarCalendario(raiz, redesenhar){
  raiz.querySelectorAll('[data-cal-mes]').forEach(b => b.addEventListener('click', () => {
    mesAgenda = new Date(mesAgenda.getFullYear(), mesAgenda.getMonth() + Number(b.dataset.calMes), 1); redesenhar();
  }));
  raiz.querySelectorAll('[data-cal-dia]').forEach(b => b.addEventListener('click', () => {
    diaAgenda = diaAgenda === b.dataset.calDia ? null : b.dataset.calDia;
    const d = paraData(b.dataset.calDia);
    if(diaAgenda && d.getMonth() !== mesAgenda.getMonth()) mesAgenda = new Date(d.getFullYear(), d.getMonth(), 1);
    redesenhar();
  }));
  raiz.querySelectorAll('[data-cal-limpar]').forEach(b => b.addEventListener('click', () => { diaAgenda = null; redesenhar(); }));
}

// lista filtrada pelo dia escolhido no calendário
function doDiaEscolhido(lista){ return diaAgenda ? (mapaDiasAgenda(lista)[diaAgenda] || []) : null; }

// ---------------------------------------------------------------------
// ESCRITÓRIO
// ---------------------------------------------------------------------
async function secaoAgenda(el){
  const [lista, usuarios, veiculos] = await Promise.all([
    consultar(sb.from('agendamento').select(CAMPOS_AGENDA).order('data_prevista').order('hora', { nullsFirst:true })),
    qUsuarios(), qVeiculos(),
  ]);
  desenharAgendaEscritorio(el, lista, usuarios.filter(u => u.papel === 'motorista' && u.ativo), veiculos);
}

function desenharAgendaEscritorio(el, lista, motoristas, veiculos){
  const pendentes = lista.filter(a => a.status === 'pendente');
  const atrasados = pendentes.filter(a => diasAte(fimAgenda(a)) < 0);
  const semana = pendentes.filter(a => diasAte(a.data_prevista) <= 7 && diasAte(fimAgenda(a)) >= 0);
  const inicioMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const concluidosMes = lista.filter(a => a.status === 'concluido' && a.concluido_em && new Date(a.concluido_em) >= inicioMes);
  const FILTROS = {
    proximos: ['Próximos', a => a.status === 'pendente' && diasAte(fimAgenda(a)) >= 0],
    atrasados: ['Atrasados', a => a.status === 'pendente' && diasAte(fimAgenda(a)) < 0],
    concluidos: ['Concluídos', a => a.status !== 'pendente'],
    todos: ['Todos', () => true],
  };
  const doDia = doDiaEscolhido(lista);
  let visiveis = doDia || lista.filter(FILTROS[filtroAgenda][1]);
  if(!doDia && filtroAgenda !== 'proximos' && filtroAgenda !== 'atrasados') visiveis = [...visiveis].reverse();
  const titulo = doDia ? `Compromissos em ${diaSemanaData(diaAgenda)} (${visiveis.length})` : `Agendamentos (${visiveis.length})`;

  el.innerHTML = `
    <div class="kpi-row">
      ${kpi(semana.length, 'Nos próximos 7 dias')}
      ${kpi(atrasados.length, 'Atrasados', atrasados.length ? 'Remarcar ou concluir' : 'Nenhum', atrasados.length ? 'vermelho' : 'verde')}
      ${kpi(pendentes.length, 'Pendentes no total')}
      ${kpi(concluidosMes.length, 'Concluídos neste mês')}
    </div>
    <div class="agenda-grade">
      ${painel('Calendário', `<div style="padding:4px 16px 14px;">${calendarioAgenda(lista)}</div>`)}
      <div>
        ${doDia ? '' : `<div class="doc-tabs" style="max-width:520px;">
          ${Object.entries(FILTROS).map(([k, [l, f]]) => `<button class="${filtroAgenda === k ? 'active' : ''}" data-filtro-ag="${k}">${l} (${lista.filter(f).length})</button>`).join('')}
        </div>`}
        ${painel(titulo,
          visiveis.length ? tabela(['Data', 'Compromisso', 'Motorista / veículo', 'Local', 'Motorista ciente', 'Situação'],
            visiveis.map(a => { const [cor, txt] = situacaoAgenda(a); return `<tr class="clickable" data-agendamento="${a.id}">
              <td class="mono">${dataHoraAgenda(a)}</td>
              <td>${esc(a.tipo)}${a.observacao ? `<div class="sub">${esc(a.observacao)}</div>` : ''}</td>
              <td>${esc([a.motorista && a.motorista.nome, a.veiculo && a.veiculo.placa].filter(Boolean).join(' · ') || 'Toda a equipe')}</td>
              <td class="sub">${esc(a.local || '—')}</td>
              <td>${a.ciente_em ? `${badge('green', 'Ciente')}<div class="sub">${fmtDataHora(a.ciente_em)}</div>` : (a.motorista_id || a.veiculo_id) && a.status === 'pendente' ? '<span class="sub">Ainda não</span>' : '<span class="sub">—</span>'}</td>
              <td>${badge(cor, txt)}</td></tr>`; }))
            : vazio(doDia ? 'Nenhum compromisso neste dia. Use "Novo agendamento" para marcar.' : filtroAgenda === 'proximos' ? 'Nenhum compromisso marcado. Use "Novo agendamento" para marcar revisões, exames, folgas etc.' : 'Nada neste filtro.'),
          `<button class="btn btn-primary btn-sm" id="btnNovoAgendamento">${ic('plus', 15)} Novo agendamento</button>${lista.length ? botaoExportar('btnCsvAgenda') : ''}`)}
      </div>
    </div>`;

  const redesenhar = () => desenharAgendaEscritorio(el, lista, motoristas, veiculos);
  ligarCalendario(el, redesenhar);
  el.querySelectorAll('[data-filtro-ag]').forEach(b => b.addEventListener('click', () => { filtroAgenda = b.dataset.filtroAg; redesenhar(); }));
  document.getElementById('btnNovoAgendamento').addEventListener('click', () => abrirEditarAgendamento(null, { motoristas, veiculos, el }));
  el.querySelectorAll('[data-agendamento]').forEach(tr => tr.addEventListener('click', () => abrirEditarAgendamento(lista.find(a => a.id === tr.dataset.agendamento), { motoristas, veiculos, el })));
  const csv = document.getElementById('btnCsvAgenda');
  if(csv) csv.addEventListener('click', () => baixarCSV('agenda', ['Início', 'Fim', 'Hora', 'Compromisso', 'Motorista', 'Veículo', 'Local', 'Observação', 'Situação', 'Motorista ciente em'],
    lista.map(a => [fmtData(a.data_prevista), fmtData(fimAgenda(a)), a.hora ? String(a.hora).slice(0, 5) : '', a.tipo, a.motorista ? a.motorista.nome : '', a.veiculo ? a.veiculo.placa : '', a.local || '', a.observacao || '', situacaoAgenda(a)[1], a.ciente_em ? fmtDataHora(a.ciente_em) : ''])));
}

function abrirEditarAgendamento(a, { motoristas, veiculos, el }){
  const novo = !a;
  const dataInicial = a ? a.data_prevista : (diaAgenda || '');
  abrirModal(novo ? 'Novo agendamento' : a.tipo, `
    <form id="formAgendamento">
      <div class="field-row" style="margin:0;"><label for="agTipo">Compromisso</label>
        <input type="text" id="agTipo" list="agTipos" value="${esc(a ? a.tipo : '')}" required placeholder="ex: Revisão preventiva, Folga">
        <datalist id="agTipos">${TIPOS_AGENDAMENTO.map(t => `<option value="${t}">`).join('')}</datalist></div>
      <div class="o-form-grid">
        <div class="field-row" style="margin:0;"><label for="agData">Data${novo ? '' : ' (início)'}</label><input type="date" id="agData" value="${esc(dataInicial)}" required></div>
        <div class="field-row" style="margin:0;"><label for="agFim">Até (se durar mais de um dia)</label><input type="date" id="agFim" value="${esc(a && a.data_fim && a.data_fim > a.data_prevista ? a.data_fim : '')}"></div>
        <div class="field-row" style="margin:0;"><label for="agHora">Hora (opcional)</label><input type="time" id="agHora" value="${esc(a && a.hora ? String(a.hora).slice(0, 5) : '')}"></div>
        <div class="field-row" style="margin:0;"><label for="agMotorista">Motorista</label>
          <select id="agMotorista"><option value="">— nenhum / toda a equipe —</option>${motoristas.map(m => `<option value="${m.id}" ${a && a.motorista_id === m.id ? 'selected' : ''}>${esc(m.nome)}</option>`).join('')}</select></div>
        <div class="field-row" style="margin:0;"><label for="agVeiculo">Veículo</label>
          <select id="agVeiculo"><option value="">— nenhum —</option>${veiculos.filter(v => v.ativo).map(v => `<option value="${v.id}" ${a && a.veiculo_id === v.id ? 'selected' : ''}>${esc(v.placa)} · ${esc(tipoLabelGlobal[v.tipo] || v.tipo)}</option>`).join('')}</select></div>
      </div>
      ${campoTexto('agLocal', 'Local (opcional)', a && a.local, 'placeholder="ex: Oficina Central, Clínica LabSaúde"')}
      <div class="field-row" style="margin:0;"><label for="agObs">Observação (opcional)</label><textarea id="agObs" rows="2">${esc(a && a.observacao || '')}</textarea></div>
      ${novo ? '<div class="l2">O motorista (ou o do conjunto do veículo escolhido) recebe um aviso no sino e no celular. Agendamentos de veículo aparecem também para o mecânico.</div>' : ''}
      <div class="err" id="agErro"></div>
      <button type="submit">${novo ? 'Marcar agendamento' : 'Salvar alterações'}</button>
      ${!novo ? `<div class="o-acoes">
        ${a.status === 'pendente' ? `<button type="button" class="btn btn-outline btn-sm" id="btnAgConcluir">${ic('check', 14)} Marcar como concluído</button>
          <button type="button" class="btn btn-outline btn-sm" id="btnAgCancelar">Cancelar compromisso</button>`
          : `<button type="button" class="btn btn-outline btn-sm" id="btnAgReabrir">Voltar para pendente</button>`}
        <button type="button" class="btn btn-outline btn-sm" id="btnAgExcluir" style="color:var(--signal-red-ink);">Excluir</button>
      </div>` : ''}
    </form>`);

  const dados = () => {
    const inicio = document.getElementById('agData').value, fim = document.getElementById('agFim').value;
    return {
      tipo: document.getElementById('agTipo').value.trim(),
      data_prevista: inicio,
      data_fim: fim && fim > inicio ? fim : null,
      hora: document.getElementById('agHora').value || null,
      motorista_id: document.getElementById('agMotorista').value || null,
      veiculo_id: document.getElementById('agVeiculo').value || null,
      local: document.getElementById('agLocal').value.trim() || null,
      observacao: document.getElementById('agObs').value.trim() || null,
    };
  };
  const concluir = async (mudanca, msg) => {
    const { error } = await sb.from('agendamento').update(mudanca).eq('id', a.id);
    if(error){ alert('Não consegui salvar: ' + error.message); return; }
    fecharModal(); mostrarToast(msg); secaoAgenda(el);
  };

  document.getElementById('formAgendamento').addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = dados();
    const erro = document.getElementById('agErro');
    if(!d.tipo || !d.data_prevista){ erro.textContent = 'Informe o compromisso e a data.'; return; }
    const fimDigitado = document.getElementById('agFim').value;
    if(fimDigitado && fimDigitado < d.data_prevista){ erro.textContent = 'A data final não pode ser antes da data de início.'; return; }
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = 'Salvando...';
    const { error } = novo
      ? await sb.from('agendamento').insert({ ...d, transportadora_id: usuarioAtual.transportadora_id, status: 'pendente', criado_por: session.user.id })
      : await sb.from('agendamento').update(d).eq('id', a.id);
    if(error){ erro.textContent = 'Não consegui salvar: ' + error.message; btn.disabled = false; btn.textContent = novo ? 'Marcar agendamento' : 'Salvar alterações'; return; }
    fecharModal();
    mostrarToast(novo ? '✅ Agendamento marcado' : '✅ Agendamento atualizado');
    secaoAgenda(el);
  });
  const bC = document.getElementById('btnAgConcluir');
  if(bC) bC.addEventListener('click', () => concluir({ status: 'concluido', concluido_em: new Date().toISOString() }, '✅ Compromisso concluído'));
  const bX = document.getElementById('btnAgCancelar');
  if(bX) bX.addEventListener('click', () => { if(confirm('Cancelar este compromisso?')) concluir({ status: 'cancelado' }, 'Compromisso cancelado'); });
  const bR = document.getElementById('btnAgReabrir');
  if(bR) bR.addEventListener('click', () => concluir({ status: 'pendente', concluido_em: null }, 'Compromisso voltou para pendente'));
  const bE = document.getElementById('btnAgExcluir');
  if(bE) bE.addEventListener('click', async () => {
    if(!confirm('Excluir este agendamento? Não dá para desfazer.')) return;
    const { error } = await sb.from('agendamento').delete().eq('id', a.id);
    if(error){ alert('Não consegui excluir: ' + error.message); return; }
    fecharModal(); mostrarToast('Agendamento excluído'); secaoAgenda(el);
  });
}

// ---------------------------------------------------------------------
// MOTORISTA e MECÂNICO (mesma tela: calendário + lista)
// ---------------------------------------------------------------------
async function carregarAgendamentosMotorista(){
  const conjunto = await carregarMeuConjunto();
  const veiculoIds = veiculosDoConjunto(conjunto).map(v => v.veiculo_id);
  // a regra de acesso do banco já limita aos meus e aos dos meus veículos
  const { data } = await sb.from('agendamento').select(CAMPOS_AGENDA).eq('status', 'pendente').order('data_prevista').order('hora', { nullsFirst:true });
  return (data || []).filter(a => a.motorista_id === session.user.id || veiculoIds.includes(a.veiculo_id));
}

function itemAgendaCelular(a, podeConfirmar){
  const [cor, txt] = situacaoAgenda(a);
  return `
    <div class="list-item" style="align-items:flex-start;">
      <div class="li-ic">${ic('cal', 16)}</div>
      <div class="li-body">
        <div class="li-title">${esc(a.tipo)}</div>
        <div class="li-sub">${dataHoraAgenda(a)}${a.veiculo ? ' · ' + esc(a.veiculo.placa) : ''}</div>
        ${a.local ? `<div class="li-sub">${ic('map', 12)} ${esc(a.local)}</div>` : ''}
        ${a.observacao ? `<div class="li-sub">${esc(a.observacao)}</div>` : ''}
        ${podeConfirmar ? `<div class="li-acoes">${a.ciente_em ? `<span class="li-sub" style="color:var(--signal-green);">${ic('check', 13)} Você confirmou ciência</span>` : `<button class="btn-small" data-ciente="${a.id}">${ic('check', 14)} Estou ciente</button>`}</div>` : ''}
      </div>
      <div class="li-row-end">${pillStatus(cor, txt)}</div>
    </div>`;
}

function conteudoAgendaCelular(lista, podeConfirmar, textoVazio){
  const doDia = doDiaEscolhido(lista);
  const visiveis = doDia || lista;
  return `
    <div class="card">${calendarioAgenda(lista)}</div>
    <div class="section-label">${doDia ? `Compromissos em ${diaSemanaData(diaAgenda)}` : 'Próximos compromissos'}</div>
    ${visiveis.length ? `<div class="card lista">${visiveis.map(a => itemAgendaCelular(a, podeConfirmar)).join('')}</div>`
      : `<div class="card em-breve-box"><div class="ic-grande">${ic('cal', 34)}</div><div class="card-dark-title">${doDia ? 'Nada marcado neste dia' : 'Nenhum compromisso marcado'}</div><div class="card-dark-sub">${doDia ? '' : textoVazio}</div></div>`}`;
}

async function loadAgendamentosMotorista(listaPronta){
  if(!listaPronta){ diaAgenda = null; mesAgenda = null; }  // entrou agora: mês atual, sem filtro
  const lista = listaPronta || await carregarAgendamentosMotorista();
  montarTelaMotorista({
    header: headerVoltar('Agendamentos'),
    conteudo: conteudoAgendaCelular(lista, true, 'Revisões, exames, folgas e outros compromissos marcados pelo escritório aparecem aqui.'),
  });
  ligarCalendario(app, () => loadAgendamentosMotorista(lista));
  document.querySelectorAll('[data-ciente]').forEach(b => b.addEventListener('click', async () => {
    b.disabled = true;
    const { error } = await sb.rpc('confirmar_agendamento', { p_id: b.dataset.ciente });
    if(error){ alert('Não consegui confirmar: ' + error.message); b.disabled = false; return; }
    mostrarToast('✅ Ciência confirmada');
    loadAgendamentosMotorista();
  }));
}

async function loadAgendaMecanico(listaPronta){
  let lista = listaPronta;
  if(!lista){
    diaAgenda = null; mesAgenda = null;
    // a regra de acesso do banco já limita aos agendamentos de veículos
    const { data } = await sb.from('agendamento').select(CAMPOS_AGENDA).eq('status', 'pendente').order('data_prevista').order('hora', { nullsFirst:true });
    lista = data || [];
  }
  montarTelaMecanico({
    header: headerMecanico('Agenda', 'Revisões e serviços marcados na frota'),
    conteudo: conteudoAgendaCelular(lista, false, 'Revisões, trocas de óleo e outros serviços marcados pelo escritório aparecem aqui.'),
  });
  ligarCalendario(app, () => loadAgendaMecanico(lista));
}
