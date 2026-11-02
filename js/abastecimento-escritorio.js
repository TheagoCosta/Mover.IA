// MOVER.IA — Abastecimento no escritório: estoque (js/tanques.js), gráficos, lista, correção e envio ao Bsoft
// (arquivo carregado pelo index.html; todas as funções ficam globais,
// então um arquivo pode chamar funções dos outros normalmente)

// ---------------------------------------------------------------------
// ABASTECIMENTO
// ---------------------------------------------------------------------
let filtroAbastecimento = 'todos';

async function secaoAbastecimento(el){
  const [registros, comBsoft] = await Promise.all([
    consultar(sb.from('abastecimento')
      .select('id, data, tipo, km, litros, arla_litros, preco_litro_diesel, preco_litro_arla, odometro_bomba, posto, nota_numero, media_calculada, media_arla_calculada, confirmado_em, bsoft_ref, bsoft_origem, recebido_em, hora_celular, motorista:motorista_id(nome), veiculo:veiculo_id(placa), confirmado:confirmado_por(nome)')
      .order('data', { ascending:false }).limit(3000)),
    sb.from('integracao_bsoft').select('transportadora_id').maybeSingle().then(r => !!r.data),
  ]);
  // coluna do Bsoft: botão para enviar, ou a marca de que já foi
  const celulaBsoft = (a) => !comBsoft || !a.tipo ? '' : a.bsoft_origem
    ? `<span title="Lançado no Bsoft pelo escritório (${esc(a.bsoft_origem)}) e trazido para o MOVER.IA">${badge('blue', 'Do Bsoft')}</span>`
    : a.bsoft_ref
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

  const maxMediaVeic = Math.max(0, ...veiculos.map(v => v.media || 0));
  // últimos 12 meses: litros (interno + posto) e gasto em posto
  const litrosMes = [...Array(12)].map((_, i) => {
    const ref = new Date(); ref.setDate(1); ref.setMonth(ref.getMonth() - (11 - i));
    const doMes = registros.filter(a => { const d = new Date(a.data); return d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth(); });
    const ext = doMes.filter(a => a.tipo === 'externo');
    return { rotulo: ref.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', ''), ano: ref.getFullYear(),
      litros: soma(doMes, 'litros'), interno: soma(doMes.filter(a => a.tipo === 'interno'), 'litros'), externo: soma(ext, 'litros'),
      gasto: ext.reduce((s, a) => s + (valorAbastecimento(a) || 0), 0), nExt: ext.length };
  });

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
    <div id="caixaTanques"></div>
    <div class="two-col iguais">
      ${painel('Diesel abastecido por mês (litros)', `<div style="padding:4px 16px 12px;">${graficoBarras(litrosMes.map(m => ({ rotulo: m.rotulo, valor: m.litros,
        dica: `${m.rotulo}/${String(m.ano).slice(2)}: ${fmtNum(m.litros, 0)} L · interno ${fmtNum(m.interno, 0)} L · posto ${fmtNum(m.externo, 0)} L` })), { casas: 0, aria: 'Litros de diesel abastecidos por mês' })}</div>`)}
      ${painel('Gasto em postos por mês (R$)', `<div style="padding:4px 16px 12px;">${graficoBarras(litrosMes.map(m => ({ rotulo: m.rotulo, valor: m.gasto,
        dica: `${m.rotulo}/${String(m.ano).slice(2)}: ${fmtReais(m.gasto)} em ${m.nExt} abastecimento${m.nExt === 1 ? '' : 's'} em posto` })), { casas: 0, aria: 'Gasto em postos por mês, em reais', textoVazio: 'Nenhum abastecimento em posto com preço.' })}</div>`)}
    </div>
    <div class="o-banner" style="color:var(--ink-700);">${ic('chart', 18)}<div class="txt"><b>Relatório de consumo</b>Evolução mês a mês, ranking por veículo e por motorista e alertas de consumo fora do padrão: <a href="#" data-ir-consumo>abrir o relatório</a>.</div></div>
    ${comBsoft ? `<div class="o-banner" style="color:var(--ink-700);">${ic('sync', 18)}<div class="txt"><b>Abastecimentos lançados no Bsoft</b>O MOVER.IA lê do Bsoft os abastecimentos da frota (só leitura) — o motorista é o da viagem ou do conjunto daquele cavalo. Os novos também chegam a cada sincronização. <a href="#" id="btnTrazerBsoft">Buscar agora</a></div></div>` : ''}
    ${painel('Consumo médio por veículo',
      veiculos.length ? tabela(['Placa', 'Média diesel', 'Média Arla', 'Abastecimentos', 'Diesel (total)', 'Arla (total)', 'Último km'],
        veiculos.map(v => `<tr><td class="mono">${esc(v.placa)}</td><td style="min-width:140px;"><b>${v.media ? fmtNum(v.media, 2) + ' km/l' : '<span class="sub">—</span>'}</b>${v.media ? barraNivel(v.media / maxMediaVeic, { alerta: 0, critico: 0 }) : ''}</td><td>${v.mediaArla ? fmtNum(v.mediaArla, 1) + ' km/l' : '<span class="sub">—</span>'}</td><td>${v.n}</td><td>${fmtNum(v.litros, 0)} L</td><td>${v.arla ? fmtNum(v.arla, 0) + ' L' : '<span class="sub">—</span>'}</td><td class="mono">${fmtNum(v.ultimoKm, 0)}</td></tr>`))
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
        visiveis.slice(0, 200).map(a => { const valor = valorAbastecimento(a); return `<tr><td class="sub">${a.bsoft_origem ? fmtData(a.data) : fmtDataHora(a.data)}${marcaSemSinal(a)}</td><td>${a.tipo ? badge(a.tipo === 'interno' ? 'blue' : 'grey', ROTULO_TIPO_ABAST[a.tipo]) : '<span class="sub">—</span>'}</td><td class="mono">${esc(a.veiculo ? a.veiculo.placa : '—')}</td><td>${esc(a.motorista ? a.motorista.nome : '—')}</td><td class="mono">${fmtNum(a.km, 0)}</td>
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

  ligarDicasGraficos(el);
  painelEstoqueTanques(document.getElementById('caixaTanques'), () => secaoAbastecimento(el));
  el.querySelectorAll('[data-filtro-abast]').forEach(b => b.addEventListener('click', () => { filtroAbastecimento = b.dataset.filtroAbast; secaoAbastecimento(el); }));
  const trazer = document.getElementById('btnTrazerBsoft');
  if(trazer) trazer.addEventListener('click', async (e) => {
    e.preventDefault();
    trazer.textContent = 'Buscando no Bsoft...';
    try{
      const r = await chamarBsoft('importar_abastecimentos', { dias: 30 });
      if(!r.ok) throw new Error(r.error || 'erro');
      mostrarToast(r.novos ? `✅ ${r.novos} abastecimento${r.novos > 1 ? 's' : ''} trazido${r.novos > 1 ? 's' : ''} do Bsoft` : 'Nada novo no Bsoft (últimos 30 dias)');
      secaoAbastecimento(el);
    } catch(err){ alert('Não consegui buscar no Bsoft: ' + err.message); trazer.textContent = 'Buscar agora'; }
  });
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
