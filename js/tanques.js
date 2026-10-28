// MOVER.IA — Estoque dos tanques próprios (diesel e Arla), na seção Abastecimento e no Painel.
// Saldo de cada tanque = última medição (régua) + entradas (compras) + transferências recebidas
//   − transferências enviadas − abastecimentos internos (só no tanque que alimenta a bomba:
//   diesel sai do tanque de diesel da bomba, Arla do tanque de Arla).
// Sem nenhuma medição o saldo é desconhecido: a primeira coisa é medir cada tanque.
// Cada medição nova mostra a diferença entre o que o sistema calculou e o que tem de verdade
// (perda, vazamento, abastecimento não lançado).
// Tabelas tanque e tanque_movimento (migração 20261028_05) — só a gestão vê e mexe.
// (arquivo carregado pelo index.html; todas as funções ficam globais)

const ROTULO_PRODUTO = { diesel: 'Diesel', arla: 'Arla' };
const ROTULO_MOV_TANQUE = { entrada: 'Compra (entrada)', transferencia: 'Transferência', recebido: 'Transferência recebida', medicao: 'Medição', saida: 'Abastecimentos da bomba' };
const DIAS_MEDIA_SAIDA = 14;   // consumo diário da bomba = média dos últimos 14 dias

// Busca tudo que o cálculo precisa. Os abastecimentos internos só a partir da primeira medição.
async function buscarEstoqueTanques(){
  const tanques = await consultar(sb.from('tanque').select('id, nome, produto, capacidade_l, abastece_bomba, ordem, ativo').eq('ativo', true).order('ordem'));
  if(!tanques.length) return { tanques: [], movimentos: [], saidas: [] };
  const movimentos = await consultar(sb.from('tanque_movimento')
    .select('id, tanque_id, tipo, litros, tanque_destino_id, data, preco_litro, fornecedor, nota_numero, observacao, criado_por:criado_por(nome)')
    .order('data').limit(5000));
  const medicoes = movimentos.filter(m => m.tipo === 'medicao');
  let saidas = [];
  if(medicoes.length){
    const desde = new Date(Math.min(Date.now() - 31 * 86400000, ...medicoes.map(m => new Date(m.data).getTime()))).toISOString();
    saidas = await consultar(sb.from('abastecimento').select('id, data, litros, arla_litros, veiculo:veiculo_id(placa)').eq('tipo', 'interno').gte('data', desde).order('data').limit(10000));
  }
  return { tanques, movimentos, saidas };
}

function calcularEstoque({ tanques, movimentos, saidas }){
  return tanques.map(t => {
    const ev = [];
    movimentos.forEach(m => {
      const q = Number(m.litros) || 0;
      if(m.tanque_id === t.id) ev.push({ data: m.data, tipo: m.tipo, delta: m.tipo === 'entrada' ? q : m.tipo === 'transferencia' ? -q : 0, medido: m.tipo === 'medicao' ? q : null, mov: m });
      else if(m.tanque_destino_id === t.id) ev.push({ data: m.data, tipo: 'recebido', delta: q, mov: m });
    });
    if(t.abastece_bomba) saidas.forEach(a => {
      const q = Number(t.produto === 'arla' ? a.arla_litros : a.litros) || 0;
      if(q > 0) ev.push({ data: a.data, tipo: 'saida', delta: -q, abast: a });
    });
    // na mesma hora, a medição vale por último (ela "fecha" o saldo)
    ev.sort((a, b) => new Date(a.data) - new Date(b.data) || (a.medido != null) - (b.medido != null));
    let saldo = null;
    ev.forEach(e => {
      if(e.medido != null){ e.calculado = saldo; e.diferenca = saldo == null ? null : e.medido - saldo; saldo = e.medido; }
      else if(saldo != null) saldo += e.delta;
      e.saldo = saldo;
    });
    const desde = Date.now() - DIAS_MEDIA_SAIDA * 86400000;
    const saidaRecente = ev.filter(e => e.tipo === 'saida' && new Date(e.data).getTime() >= desde).reduce((s, e) => s - e.delta, 0);
    const ultimaMedicao = [...ev].reverse().find(e => e.medido != null) || null;
    return { ...t, capacidade: Number(t.capacidade_l), saldo, eventos: ev, ultimaMedicao, saidaDia: saidaRecente / DIAS_MEDIA_SAIDA };
  });
}

// saldo no fim de cada um dos últimos n dias (null antes da primeira medição)
function serieDiariaTanque(t, n = 30){
  const dias = [...Array(n)].map((_, i) => { const d = inicioDoDia(new Date(Date.now() - (n - 1 - i) * 86400000)); d.setDate(d.getDate() + 1); return d; });
  let k = 0, saldo = null;
  return dias.map(fim => {
    while(k < t.eventos.length && new Date(t.eventos[k].data) < fim){ saldo = t.eventos[k].saldo; k++; }
    return saldo == null ? null : Math.max(0, saldo);
  });
}

// aviso de cada tanque: comprar, transferir, medir
function avisoTanque(t, todos){
  if(t.saldo == null) return ['grey', 'Fazer a primeira medição'];
  const f = t.saldo / t.capacidade;
  if(t.saldo < 0) return ['red', 'Saldo negativo — medir o tanque'];
  if(t.abastece_bomba && t.produto === 'diesel'){
    const reserva = todos.find(o => o.produto === 'diesel' && !o.abastece_bomba && o.saldo > 0);
    if(f < 0.2) return ['amber', reserva ? 'Completar com a reserva' : 'Comprar diesel'];
  } else if(f < 0.25) return ['amber', t.produto === 'arla' ? 'Comprar Arla' : 'Comprar diesel'];
  if(t.ultimaMedicao && Date.now() - new Date(t.ultimaMedicao.data).getTime() > 15 * 86400000) return ['blue', 'Medir de novo'];
  return ['green', 'OK'];
}

// quantos dias o produto ainda dura, somando todos os tanques dele
function diasRestantes(estoque, produto){
  const doProduto = estoque.filter(t => t.produto === produto);
  if(!doProduto.length || doProduto.some(t => t.saldo == null)) return null;
  const saidaDia = doProduto.reduce((s, t) => s + t.saidaDia, 0);
  const saldo = doProduto.reduce((s, t) => s + Math.max(0, t.saldo), 0);
  return saidaDia > 0 ? saldo / saidaDia : null;
}

// cartões de nível (usado no Abastecimento e, compacto, no Painel)
function cartoesTanques(estoque, { compacto = false } = {}){
  return `<div class="tanques ${compacto ? 'compacto' : ''}">${estoque.map(t => {
    const [cor, txt] = avisoTanque(t, estoque);
    const f = t.saldo == null ? null : t.saldo / t.capacidade;
    return `<div class="tanque">
      <div class="tanque-topo"><b>${esc(t.nome)}</b>${badge(cor, txt)}</div>
      <div class="tanque-num">${t.saldo == null ? '—' : numGraf(Math.max(0, t.saldo), 0) + ' L'}<span> de ${numGraf(t.capacidade, 0)} L${f != null ? ` · ${numGraf(Math.max(0, f) * 100, 0)}%` : ''}</span></div>
      ${barraNivel(f, t.abastece_bomba && t.produto === 'diesel' ? { alerta: 0.2 } : {})}
      ${compacto ? '' : `<div class="l2">${t.abastece_bomba ? `Alimenta a bomba · saem ~${numGraf(t.saidaDia, 0)} L/dia` : 'Reserva — completa o tanque da bomba'}${t.ultimaMedicao ? ` · medido em ${fmtData(t.ultimaMedicao.data)}` : ''}</div>`}
    </div>`;
  }).join('')}</div>`;
}

// ---------------------------------------------------------------------
// Painel "Estoque dos tanques" na seção Abastecimento
// ---------------------------------------------------------------------
async function painelEstoqueTanques(caixa, aoMudar){
  let dados;
  try{ dados = await buscarEstoqueTanques(); }
  catch(e){ caixa.innerHTML = vazio('Não consegui carregar os tanques: ' + esc(e.message)); return; }
  if(!dados.tanques.length){
    caixa.innerHTML = `<div class="o-banner" style="color:var(--ink-700);">${ic('fuel', 18)}<div class="txt"><b>Estoque dos tanques próprios</b>Cadastre os tanques de diesel e Arla para saber quanto tem em estoque: <a href="#" id="btnCadTanques">cadastrar tanques</a>.</div></div>`;
    document.getElementById('btnCadTanques').addEventListener('click', (e) => { e.preventDefault(); abrirCadastroTanques([], aoMudar); });
    return;
  }
  const estoque = calcularEstoque(dados);
  const diasDiesel = diasRestantes(estoque, 'diesel'), diasArla = diasRestantes(estoque, 'arla');
  const semMedicao = estoque.some(t => t.saldo == null);
  const rotulos = [...Array(30)].map((_, i) => fmtDataCurta(new Date(Date.now() - (29 - i) * 86400000)));
  const diesel = estoque.filter(t => t.produto === 'diesel'), arla = estoque.filter(t => t.produto === 'arla');
  const graf = (lista) => graficoLinhas(rotulos, lista.map(t => ({ nome: t.nome, valores: serieDiariaTanque(t) })),
    { unidade: ' L', aria: 'Litros em cada tanque por dia, últimos 30 dias', textoVazio: 'O gráfico aparece depois da primeira medição.', maxFixo: Math.max(...lista.map(t => t.capacidade)) });

  caixa.innerHTML = painel('Estoque dos tanques próprios', `
    <div style="padding:14px 18px 4px;">
      ${semMedicao ? `<div class="o-banner" style="margin-bottom:12px;">${ic('alert', 18)}<div class="txt"><b>Comece medindo os tanques</b>Meça cada tanque (régua ou visor) e lance em "Medição". A partir daí o MOVER.IA desconta sozinho cada abastecimento interno e soma as compras e transferências.</div></div>` : ''}
      ${cartoesTanques(estoque)}
      <div class="l2" style="margin:10px 0 0;">${[diasDiesel != null ? `Diesel dá para uns <b>${numGraf(diasDiesel, 0)} dias</b>` : '', diasArla != null ? `Arla para uns <b>${numGraf(diasArla, 0)} dias</b>` : ''].filter(Boolean).join(' · ') || ''}${diasDiesel != null || diasArla != null ? ` (pelo consumo dos últimos ${DIAS_MEDIA_SAIDA} dias).` : ''}</div>
    </div>
    <div class="graf-duplo">
      ${diesel.length ? `<div><div class="graf-titulo">Diesel — litros em cada tanque (30 dias)</div>${graf(diesel)}</div>` : ''}
      ${arla.length ? `<div><div class="graf-titulo">Arla — litros no tanque (30 dias)</div>${graf(arla)}</div>` : ''}
    </div>`,
    `<button class="btn btn-primary btn-sm" data-mov-tanque="entrada">${ic('plus', 15)} Compra</button>
     ${diesel.length > 1 ? `<button class="btn btn-outline btn-sm" data-mov-tanque="transferencia">Transferência</button>` : ''}
     <button class="btn btn-outline btn-sm" data-mov-tanque="medicao">Medição</button>
     <button class="btn btn-outline btn-sm" id="btnHistTanques">Histórico</button>
     <button class="o-dl-btn" id="btnCadTanques" title="Tanques cadastrados">${ic('gear', 15)}</button>`);
  ligarDicasGraficos(caixa);
  caixa.querySelectorAll('[data-mov-tanque]').forEach(b => b.addEventListener('click', () => abrirMovimentoTanque(b.dataset.movTanque, estoque, aoMudar)));
  document.getElementById('btnHistTanques').addEventListener('click', () => abrirHistoricoTanques(estoque, aoMudar));
  document.getElementById('btnCadTanques').addEventListener('click', () => abrirCadastroTanques(estoque, aoMudar));
}

function abrirMovimentoTanque(tipo, estoque, aoMudar){
  const opcoes = (lista, sel) => lista.map(t => `<option value="${t.id}" ${t.id === sel ? 'selected' : ''}>${esc(t.nome)}${t.saldo != null ? ` — ${numGraf(Math.max(0, t.saldo), 0)} L` : ''}</option>`).join('');
  const reserva = estoque.find(t => t.produto === 'diesel' && !t.abastece_bomba), bomba = estoque.find(t => t.produto === 'diesel' && t.abastece_bomba);
  const titulo = { entrada: 'Compra de combustível', transferencia: 'Transferência entre tanques', medicao: 'Medição do tanque' }[tipo];
  abrirModal(titulo, `
    <form id="formMovTanque">
      <div class="l2" style="margin-bottom:10px;">${{
        entrada: 'O combustível que chegou do fornecedor. Entra no saldo do tanque escolhido.',
        transferencia: 'Quando o tanque da bomba acaba e é completado com a reserva. Sai de um e entra no outro.',
        medicao: 'Quanto tem de verdade no tanque (régua ou visor). O saldo passa a ser este, e aparece a diferença para o que o sistema tinha calculado.',
      }[tipo]}</div>
      <div class="o-form-grid">
        <div class="field-row" style="margin:0;"><label for="mtTanque">${tipo === 'transferencia' ? 'Sai do tanque' : 'Tanque'}</label>
          <select id="mtTanque">${opcoes(tipo === 'transferencia' ? estoque.filter(t => t.produto === 'diesel') : estoque, tipo === 'medicao' ? (estoque.find(t => t.saldo == null) || estoque[0]).id : (reserva || estoque[0]).id)}</select></div>
        ${tipo === 'transferencia' ? `<div class="field-row" style="margin:0;"><label for="mtDestino">Entra no tanque</label>
          <select id="mtDestino">${opcoes(estoque.filter(t => t.produto === 'diesel'), (bomba || {}).id)}</select></div>` : ''}
        <div class="field-row" style="margin:0;"><label for="mtLitros">${tipo === 'medicao' ? 'Litros medidos no tanque' : 'Litros'}</label><input type="text" inputmode="decimal" id="mtLitros" required></div>
        <div class="field-row" style="margin:0;"><label for="mtData">Data e hora</label><input type="datetime-local" id="mtData" value="${paraCampoDataHora(new Date().toISOString())}" required></div>
        ${tipo === 'entrada' ? `
        <div class="field-row" style="margin:0;"><label for="mtPreco">R$ por litro (opcional)</label><input type="text" inputmode="decimal" id="mtPreco"></div>
        <div class="field-row" style="margin:0;"><label for="mtFornecedor">Fornecedor (opcional)</label><input type="text" id="mtFornecedor" maxlength="80"></div>
        <div class="field-row" style="margin:0;"><label for="mtNota">Nº da nota (opcional)</label><input type="text" id="mtNota" maxlength="40"></div>` : ''}
      </div>
      <div class="field-row" style="margin:12px 0 0;"><label for="mtObs">Observação (opcional)</label><input type="text" id="mtObs" maxlength="300"></div>
      ${tipo === 'transferencia' ? '<div class="l2" style="margin-top:8px;">Não sabe os litros exatos? Meça o tanque da bomba antes e depois de completar — a diferença é o que foi transferido.</div>' : ''}
      <div class="err" id="mtErro"></div>
      <button type="submit" style="margin-top:12px;">Salvar</button>
    </form>`);
  document.getElementById('formMovTanque').addEventListener('submit', async (e) => {
    e.preventDefault();
    const erro = document.getElementById('mtErro'), btn = e.target.querySelector('button[type="submit"]');
    const tanque = estoque.find(t => t.id === document.getElementById('mtTanque').value);
    const litros = numeroOuNulo(document.getElementById('mtLitros').value);
    const dados = { transportadora_id: usuarioAtual.transportadora_id, tanque_id: tanque.id, tipo, litros,
      data: doCampoDataHora(document.getElementById('mtData').value), observacao: document.getElementById('mtObs').value.trim() || null };
    if(litros == null || isNaN(litros) || litros < 0 || (tipo !== 'medicao' && litros === 0)){ erro.textContent = 'Informe os litros (número).'; return; }
    if(!dados.data || new Date(dados.data) > new Date(Date.now() + 5 * 60000)){ erro.textContent = 'Confira a data (não pode ser no futuro).'; return; }
    if(tipo === 'medicao' && litros > tanque.capacidade * 1.05){ erro.textContent = `Maior que a capacidade do tanque (${numGraf(tanque.capacidade, 0)} L).`; return; }
    if(tipo === 'transferencia'){
      dados.tanque_destino_id = document.getElementById('mtDestino').value;
      if(dados.tanque_destino_id === tanque.id){ erro.textContent = 'Escolha tanques diferentes.'; return; }
    }
    if(tipo === 'entrada'){
      const preco = numeroOuNulo(document.getElementById('mtPreco').value);
      if(preco != null && (isNaN(preco) || preco <= 0 || preco >= 100)){ erro.textContent = 'Confira o preço por litro.'; return; }
      Object.assign(dados, { preco_litro: preco, fornecedor: document.getElementById('mtFornecedor').value.trim() || null, nota_numero: document.getElementById('mtNota').value.trim() || null });
      const destinoSaldo = tanque.saldo == null ? null : tanque.saldo + litros;
      if(destinoSaldo != null && destinoSaldo > tanque.capacidade * 1.05 && !confirm(`Com esta compra o tanque ficaria com ${numGraf(destinoSaldo, 0)} L, mais que a capacidade (${numGraf(tanque.capacidade, 0)} L). Salvar mesmo assim?`)) return;
    }
    btn.disabled = true; btn.textContent = 'Salvando...';
    const { error } = await sb.from('tanque_movimento').insert(dados);
    if(error){ erro.textContent = 'Não consegui salvar: ' + error.message; btn.disabled = false; btn.textContent = 'Salvar'; return; }
    fecharModal();
    if(tipo === 'medicao' && tanque.saldo != null){
      const dif = litros - tanque.saldo;
      mostrarToast(Math.abs(dif) < 1 ? '✅ Medição salva — bateu com o calculado' : `✅ Medição salva — ${dif > 0 ? 'sobra' : 'falta'} de ${numGraf(Math.abs(dif), 0)} L em relação ao calculado`);
    } else mostrarToast('✅ Salvo');
    aoMudar();
  });
}

function abrirHistoricoTanques(estoque, aoMudar){
  const nome = Object.fromEntries(estoque.map(t => [t.id, t.nome]));
  const linhas = [];
  estoque.forEach(t => t.eventos.forEach(e => {
    if(e.tipo === 'recebido') return;   // a transferência aparece uma vez só (no tanque de onde saiu)
    linhas.push({ t, e });
  }));
  // abastecimentos da bomba agrupados por dia (senão a lista fica enorme)
  const porDia = {};
  const lista = [];
  linhas.forEach(({ t, e }) => {
    if(e.tipo !== 'saida'){ lista.push({ t, e }); return; }
    const chave = t.id + ':' + isoDia(new Date(e.data));
    if(!porDia[chave]){ porDia[chave] = { t, e: { tipo: 'saida', data: e.data, delta: 0, n: 0, saldo: e.saldo } }; lista.push(porDia[chave]); }
    porDia[chave].e.delta += e.delta; porDia[chave].e.n++; porDia[chave].e.saldo = e.saldo; porDia[chave].e.data = e.data;
  });
  lista.sort((a, b) => new Date(b.e.data) - new Date(a.e.data));
  const descricao = ({ t, e }) => {
    const m = e.mov;
    if(e.tipo === 'saida') return `${e.n} abastecimento${e.n > 1 ? 's' : ''} interno${e.n > 1 ? 's' : ''} no dia`;
    if(e.tipo === 'medicao') return e.diferenca == null ? 'Primeira medição' : `Calculado ${numGraf(Math.max(0, e.calculado), 0)} L → ${Math.abs(e.diferenca) < 1 ? 'bateu' : `<b style="color:${e.diferenca < 0 ? 'var(--signal-red-ink)' : 'var(--signal-green-ink)'};">${e.diferenca > 0 ? 'sobra' : 'falta'} de ${numGraf(Math.abs(e.diferenca), 0)} L</b>`}`;
    if(e.tipo === 'transferencia') return `Para ${esc(nome[m.tanque_destino_id] || '?')}`;
    return [m.fornecedor, m.nota_numero && 'nota ' + m.nota_numero, m.preco_litro && fmtReais(m.preco_litro) + '/L'].filter(Boolean).map(esc).join(' · ');
  };
  abrirModal('Histórico dos tanques', `
    <div class="l2" style="margin-bottom:10px;">Mais recentes primeiro. Os abastecimentos internos aparecem somados por dia e se corrigem na lista de abastecimentos.</div>
    ${lista.length ? `<div class="o-table-wrap"><table class="o-table"><thead><tr><th>Data</th><th>Tanque</th><th>Movimento</th><th>Litros</th><th>Saldo</th><th></th></tr></thead><tbody>
      ${lista.slice(0, 300).map(({ t, e }) => `<tr>
        <td class="sub">${e.tipo === 'saida' ? fmtData(e.data) : fmtDataHora(e.data)}</td>
        <td>${esc(t.nome)}</td>
        <td>${ROTULO_MOV_TANQUE[e.tipo]}<div class="sub">${descricao({ t, e })}${e.mov && e.mov.observacao ? ' · ' + esc(e.mov.observacao) : ''}${e.mov && e.mov.criado_por ? ` · por ${esc(e.mov.criado_por.nome)}` : ''}</div></td>
        <td class="mono">${e.tipo === 'medicao' ? numGraf(e.medido, 0) : (e.delta > 0 ? '+' : '−') + numGraf(Math.abs(e.delta), 0)}</td>
        <td class="mono">${e.saldo == null ? '—' : numGraf(e.saldo, 0)}</td>
        <td>${e.mov ? `<button class="o-dl-btn" data-excluir-mov="${e.mov.id}" title="Excluir">${ic('x', 15)}</button>` : ''}</td></tr>`).join('')}
    </tbody></table></div>` : '<div class="l2">Nenhum movimento ainda.</div>'}`);
  document.querySelectorAll('#modalGenerico [data-excluir-mov]').forEach(b => b.addEventListener('click', () =>
    excluirRegistro('tanque_movimento', b.dataset.excluirMov, 'Excluir este movimento do tanque? O saldo é recalculado.', aoMudar)));
}

function abrirCadastroTanques(estoque, aoMudar){
  abrirModal('Tanques cadastrados', `
    ${estoque.length ? `<div class="o-table-wrap" style="margin-bottom:14px;"><table class="o-table"><tbody>${estoque.map(t => `<tr>
      <td>${esc(t.nome)}<div class="sub">${ROTULO_PRODUTO[t.produto]} · ${numGraf(t.capacidade, 0)} L${t.abastece_bomba ? ' · alimenta a bomba' : ''}</div></td>
      <td style="text-align:right;"><button class="btn btn-outline btn-sm" data-desativar-tanque="${t.id}">Remover</button></td></tr>`).join('')}</tbody></table></div>` : ''}
    <form id="formNovoTanque">
      <div class="o-form-grid">
        <div class="field-row" style="margin:0;"><label for="ntNome">Nome</label><input type="text" id="ntNome" maxlength="60" placeholder="ex: Diesel 15.000 L (bomba)" required></div>
        <div class="field-row" style="margin:0;"><label for="ntProduto">Produto</label><select id="ntProduto"><option value="diesel">Diesel</option><option value="arla">Arla</option></select></div>
        <div class="field-row" style="margin:0;"><label for="ntCap">Capacidade (litros)</label><input type="text" inputmode="decimal" id="ntCap" required></div>
      </div>
      <label class="check-linha" style="margin-top:10px; display:flex; gap:8px; align-items:center;"><input type="checkbox" id="ntBomba" style="width:auto;"> Alimenta a bomba (os abastecimentos internos saem deste tanque)</label>
      <div class="err" id="ntErro"></div>
      <button type="submit" style="margin-top:12px;">Adicionar tanque</button>
    </form>`);
  document.querySelectorAll('#modalGenerico [data-desativar-tanque]').forEach(b => b.addEventListener('click', async () => {
    const t = estoque.find(x => x.id === b.dataset.desativarTanque);
    if(!confirm(`Remover o tanque "${t.nome}"? O histórico dele fica guardado, mas ele sai da tela.`)) return;
    const { error } = await sb.from('tanque').update({ ativo: false, abastece_bomba: false }).eq('id', t.id);
    if(error){ alert('Não consegui remover: ' + error.message); return; }
    fecharModal(); aoMudar();
  }));
  document.getElementById('formNovoTanque').addEventListener('submit', async (e) => {
    e.preventDefault();
    const erro = document.getElementById('ntErro');
    const cap = numeroOuNulo(document.getElementById('ntCap').value);
    const produto = document.getElementById('ntProduto').value, bomba = document.getElementById('ntBomba').checked;
    if(!(cap > 0)){ erro.textContent = 'Informe a capacidade em litros.'; return; }
    if(bomba && estoque.some(t => t.produto === produto && t.abastece_bomba)){ erro.textContent = `Já existe um tanque de ${ROTULO_PRODUTO[produto]} que alimenta a bomba.`; return; }
    const { error } = await sb.from('tanque').insert({ transportadora_id: usuarioAtual.transportadora_id, nome: document.getElementById('ntNome').value.trim(), produto, capacidade_l: cap, abastece_bomba: bomba, ordem: estoque.length + 1 });
    if(error){ erro.textContent = 'Não consegui salvar: ' + error.message; return; }
    fecharModal(); mostrarToast('✅ Tanque cadastrado'); aoMudar();
  });
}
