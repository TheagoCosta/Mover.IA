// MOVER.IA — Agenda: revisões, exames e compromissos.
//   • Escritório: cria, edita, conclui, cancela e exclui agendamentos.
//   • Motorista: vê os dele (e os dos veículos do conjunto dele) e marca
//     "estou ciente" (função confirmar_agendamento do banco).
// Criar um agendamento avisa o motorista pelo sino (gatilho no banco).
// (arquivo carregado pelo index.html; todas as funções ficam globais,
// então um arquivo pode chamar funções dos outros normalmente)

const TIPOS_AGENDAMENTO = ['Revisão preventiva', 'Troca de óleo', 'Troca de pneus', 'Exame toxicológico', 'ASO (exame médico)',
  'Renovação da CNH', 'Vistoria / inspeção', 'Licenciamento (CRLV)', 'Treinamento', 'Reunião de segurança', 'Outro'];
const ROTULO_AGENDA = { pendente:'Pendente', concluido:'Concluído', cancelado:'Cancelado' };
let filtroAgenda = 'proximos';

function dataHoraAgenda(a){ return `${fmtData(a.data_prevista)}${a.hora ? ' às ' + String(a.hora).slice(0, 5) : ''}`; }
function situacaoAgenda(a){
  if(a.status === 'concluido') return ['green', 'Concluído'];
  if(a.status === 'cancelado') return ['grey', 'Cancelado'];
  const dias = diasAte(a.data_prevista);
  if(dias < 0) return ['red', 'Atrasado'];
  if(dias === 0) return ['amber', 'Hoje'];
  if(dias <= 7) return ['amber', `Em ${dias} dia${dias > 1 ? 's' : ''}`];
  return ['blue', 'Agendado'];
}
const CAMPOS_AGENDA = 'id, tipo, data_prevista, hora, local, status, observacao, ciente_em, concluido_em, motorista_id, veiculo_id, motorista:motorista_id(nome), veiculo:veiculo_id(placa)';

// ---------------------------------------------------------------------
// ESCRITÓRIO
// ---------------------------------------------------------------------
async function secaoAgenda(el){
  const [lista, usuarios, veiculos] = await Promise.all([
    consultar(sb.from('agendamento').select(CAMPOS_AGENDA).order('data_prevista').order('hora', { nullsFirst:true })),
    qUsuarios(), qVeiculos(),
  ]);
  const pendentes = lista.filter(a => a.status === 'pendente');
  const atrasados = pendentes.filter(a => diasAte(a.data_prevista) < 0);
  const semana = pendentes.filter(a => { const d = diasAte(a.data_prevista); return d >= 0 && d <= 7; });
  const inicioMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const concluidosMes = lista.filter(a => a.status === 'concluido' && a.concluido_em && new Date(a.concluido_em) >= inicioMes);
  const FILTROS = {
    proximos: ['Próximos', a => a.status === 'pendente' && diasAte(a.data_prevista) >= 0],
    atrasados: ['Atrasados', a => a.status === 'pendente' && diasAte(a.data_prevista) < 0],
    concluidos: ['Concluídos', a => a.status !== 'pendente'],
    todos: ['Todos', () => true],
  };
  const visiveis = lista.filter(FILTROS[filtroAgenda][1]);
  if(filtroAgenda !== 'proximos' && filtroAgenda !== 'atrasados') visiveis.reverse();

  el.innerHTML = `
    <div class="kpi-row">
      ${kpi(semana.length, 'Nos próximos 7 dias')}
      ${kpi(atrasados.length, 'Atrasados', atrasados.length ? 'Remarcar ou concluir' : 'Nenhum', atrasados.length ? 'vermelho' : 'verde')}
      ${kpi(pendentes.length, 'Pendentes no total')}
      ${kpi(concluidosMes.length, 'Concluídos neste mês')}
    </div>
    <div class="doc-tabs" style="max-width:520px;">
      ${Object.entries(FILTROS).map(([k, [l, f]]) => `<button class="${filtroAgenda === k ? 'active' : ''}" data-filtro-ag="${k}">${l} (${lista.filter(f).length})</button>`).join('')}
    </div>
    ${painel(`Agendamentos (${visiveis.length})`,
      visiveis.length ? tabela(['Data', 'Compromisso', 'Motorista / veículo', 'Local', 'Motorista ciente', 'Situação'],
        visiveis.map(a => { const [cor, txt] = situacaoAgenda(a); return `<tr class="clickable" data-agendamento="${a.id}">
          <td class="mono">${dataHoraAgenda(a)}</td>
          <td>${esc(a.tipo)}${a.observacao ? `<div class="sub">${esc(a.observacao)}</div>` : ''}</td>
          <td>${esc([a.motorista && a.motorista.nome, a.veiculo && a.veiculo.placa].filter(Boolean).join(' · ') || 'Toda a equipe')}</td>
          <td class="sub">${esc(a.local || '—')}</td>
          <td>${a.ciente_em ? `${badge('green', 'Ciente')}<div class="sub">${fmtDataHora(a.ciente_em)}</div>` : (a.motorista_id || a.veiculo_id) && a.status === 'pendente' ? '<span class="sub">Ainda não</span>' : '<span class="sub">—</span>'}</td>
          <td>${badge(cor, txt)}</td></tr>`; }))
        : vazio(filtroAgenda === 'proximos' ? 'Nenhum compromisso marcado. Use "Novo agendamento" para marcar revisões, exames etc.' : 'Nada neste filtro.'),
      `<button class="btn btn-primary btn-sm" id="btnNovoAgendamento">${ic('plus', 15)} Novo agendamento</button>${lista.length ? botaoExportar('btnCsvAgenda') : ''}`)}`;

  const motoristas = usuarios.filter(u => u.papel === 'motorista' && u.ativo);
  el.querySelectorAll('[data-filtro-ag]').forEach(b => b.addEventListener('click', () => { filtroAgenda = b.dataset.filtroAg; secaoAgenda(el); }));
  document.getElementById('btnNovoAgendamento').addEventListener('click', () => abrirEditarAgendamento(null, { motoristas, veiculos, el }));
  el.querySelectorAll('[data-agendamento]').forEach(tr => tr.addEventListener('click', () => abrirEditarAgendamento(lista.find(a => a.id === tr.dataset.agendamento), { motoristas, veiculos, el })));
  const csv = document.getElementById('btnCsvAgenda');
  if(csv) csv.addEventListener('click', () => baixarCSV('agenda', ['Data', 'Hora', 'Compromisso', 'Motorista', 'Veículo', 'Local', 'Observação', 'Situação', 'Motorista ciente em'],
    lista.map(a => [fmtData(a.data_prevista), a.hora ? String(a.hora).slice(0, 5) : '', a.tipo, a.motorista ? a.motorista.nome : '', a.veiculo ? a.veiculo.placa : '', a.local || '', a.observacao || '', situacaoAgenda(a)[1], a.ciente_em ? fmtDataHora(a.ciente_em) : ''])));
}

function abrirEditarAgendamento(a, { motoristas, veiculos, el }){
  const novo = !a;
  abrirModal(novo ? 'Novo agendamento' : a.tipo, `
    <form id="formAgendamento">
      <div class="field-row" style="margin:0;"><label for="agTipo">Compromisso</label>
        <input type="text" id="agTipo" list="agTipos" value="${esc(a ? a.tipo : '')}" required placeholder="ex: Revisão preventiva">
        <datalist id="agTipos">${TIPOS_AGENDAMENTO.map(t => `<option value="${t}">`).join('')}</datalist></div>
      <div class="o-form-grid">
        <div class="field-row" style="margin:0;"><label for="agData">Data</label><input type="date" id="agData" value="${esc(a ? a.data_prevista : '')}" required></div>
        <div class="field-row" style="margin:0;"><label for="agHora">Hora (opcional)</label><input type="time" id="agHora" value="${esc(a && a.hora ? String(a.hora).slice(0, 5) : '')}"></div>
        <div class="field-row" style="margin:0;"><label for="agMotorista">Motorista</label>
          <select id="agMotorista"><option value="">— nenhum / toda a equipe —</option>${motoristas.map(m => `<option value="${m.id}" ${a && a.motorista_id === m.id ? 'selected' : ''}>${esc(m.nome)}</option>`).join('')}</select></div>
        <div class="field-row" style="margin:0;"><label for="agVeiculo">Veículo</label>
          <select id="agVeiculo"><option value="">— nenhum —</option>${veiculos.filter(v => v.ativo).map(v => `<option value="${v.id}" ${a && a.veiculo_id === v.id ? 'selected' : ''}>${esc(v.placa)} · ${esc(tipoLabelGlobal[v.tipo] || v.tipo)}</option>`).join('')}</select></div>
      </div>
      ${campoTexto('agLocal', 'Local (opcional)', a && a.local, 'placeholder="ex: Oficina Central, Clínica LabSaúde"')}
      <div class="field-row" style="margin:0;"><label for="agObs">Observação (opcional)</label><textarea id="agObs" rows="2">${esc(a && a.observacao || '')}</textarea></div>
      ${novo ? '<div class="l2">O motorista (ou o do conjunto do veículo escolhido) recebe um aviso no sino do app.</div>' : ''}
      <div class="err" id="agErro"></div>
      <button type="submit">${novo ? 'Marcar agendamento' : 'Salvar alterações'}</button>
      ${!novo ? `<div class="o-acoes">
        ${a.status === 'pendente' ? `<button type="button" class="btn btn-outline btn-sm" id="btnAgConcluir">${ic('check', 14)} Marcar como concluído</button>
          <button type="button" class="btn btn-outline btn-sm" id="btnAgCancelar">Cancelar compromisso</button>`
          : `<button type="button" class="btn btn-outline btn-sm" id="btnAgReabrir">Voltar para pendente</button>`}
        <button type="button" class="btn btn-outline btn-sm" id="btnAgExcluir" style="color:var(--signal-red-ink);">Excluir</button>
      </div>` : ''}
    </form>`);

  const dados = () => ({
    tipo: document.getElementById('agTipo').value.trim(),
    data_prevista: document.getElementById('agData').value,
    hora: document.getElementById('agHora').value || null,
    motorista_id: document.getElementById('agMotorista').value || null,
    veiculo_id: document.getElementById('agVeiculo').value || null,
    local: document.getElementById('agLocal').value.trim() || null,
    observacao: document.getElementById('agObs').value.trim() || null,
  });
  const concluir = async (mudanca, msg) => {
    const { error } = await sb.from('agendamento').update(mudanca).eq('id', a.id);
    if(error){ alert('Não consegui salvar: ' + error.message); return; }
    fecharModal(); mostrarToast(msg); secaoAgenda(el);
  };

  document.getElementById('formAgendamento').addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = dados();
    if(!d.tipo || !d.data_prevista){ document.getElementById('agErro').textContent = 'Informe o compromisso e a data.'; return; }
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = 'Salvando...';
    const { error } = novo
      ? await sb.from('agendamento').insert({ ...d, transportadora_id: usuarioAtual.transportadora_id, status: 'pendente', criado_por: session.user.id })
      : await sb.from('agendamento').update(d).eq('id', a.id);
    if(error){ document.getElementById('agErro').textContent = 'Não consegui salvar: ' + error.message; btn.disabled = false; btn.textContent = novo ? 'Marcar agendamento' : 'Salvar alterações'; return; }
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
// MOTORISTA
// ---------------------------------------------------------------------
async function carregarAgendamentosMotorista(){
  const conjunto = await carregarMeuConjunto();
  const veiculoIds = veiculosDoConjunto(conjunto).map(v => v.veiculo_id);
  // a regra de acesso do banco já limita aos meus e aos dos meus veículos
  const { data } = await sb.from('agendamento').select(CAMPOS_AGENDA).eq('status', 'pendente').order('data_prevista').order('hora', { nullsFirst:true });
  return (data || []).filter(a => a.motorista_id === session.user.id || veiculoIds.includes(a.veiculo_id));
}

async function loadAgendamentosMotorista(){
  const lista = await carregarAgendamentosMotorista();
  montarTelaMotorista({
    header: headerVoltar('Agendamentos'),
    conteudo: lista.length ? `<div class="card lista">${lista.map(a => { const [cor, txt] = situacaoAgenda(a); return `
      <div class="list-item" style="align-items:flex-start;">
        <div class="li-ic">${ic('cal', 16)}</div>
        <div class="li-body">
          <div class="li-title">${esc(a.tipo)}</div>
          <div class="li-sub">${dataHoraAgenda(a)}${a.veiculo ? ' · ' + esc(a.veiculo.placa) : ''}</div>
          ${a.local ? `<div class="li-sub">${ic('map', 12)} ${esc(a.local)}</div>` : ''}
          ${a.observacao ? `<div class="li-sub">${esc(a.observacao)}</div>` : ''}
          <div class="li-acoes">${a.ciente_em ? `<span class="li-sub" style="color:var(--signal-green);">${ic('check', 13)} Você confirmou ciência</span>` : `<button class="btn-small" data-ciente="${a.id}">${ic('check', 14)} Estou ciente</button>`}</div>
        </div>
        <div class="li-row-end">${pillStatus(cor, txt)}</div>
      </div>`; }).join('')}</div>`
      : `<div class="card em-breve-box"><div class="ic-grande">${ic('cal', 34)}</div><div class="card-dark-title">Nenhum compromisso marcado</div><div class="card-dark-sub">Revisões, exames e outros compromissos marcados pelo escritório aparecem aqui.</div></div>`,
  });
  document.querySelectorAll('[data-ciente]').forEach(b => b.addEventListener('click', async () => {
    b.disabled = true;
    const { error } = await sb.rpc('confirmar_agendamento', { p_id: b.dataset.ciente });
    if(error){ alert('Não consegui confirmar: ' + error.message); b.disabled = false; return; }
    mostrarToast('✅ Ciência confirmada');
    loadAgendamentosMotorista();
  }));
}
