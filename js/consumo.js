// MOVER.IA — Relatório de consumo (seção "Consumo" do escritório)
//   • média da frota no período e comparação com o período anterior
//   • evolução mês a mês (gráfico + tabela)
//   • ranking por veículo e por motorista
//   • alertas de consumo fora do padrão
// A média certa é km rodados ÷ litros (não a média das médias). Cada
// abastecimento com média guarda media_calculada = km desde o anterior ÷
// litros (calculada pelo banco) — então km rodados = média × litros.
// (arquivo carregado pelo index.html; todas as funções ficam globais,
// então um arquivo pode chamar funções dos outros normalmente)

const PERIODOS_CONSUMO = [[30, '30 dias'], [90, '90 dias'], [180, '180 dias'], [365, '12 meses']];
const DESVIO_ALERTA_CONSUMO = 0.20;            // 20% abaixo/acima do normal do veículo
const CONSUMO_PLAUSIVEL = { min: 0.8, max: 6 }; // km/l de caminhão; fora disso, provável km digitado errado
const MIN_HISTORICO_ALERTA = 3;                // abastecimentos do veículo para saber o "normal"
let periodoConsumo = 90;
let consumoComoTabela = false;

const plausivel = (a) => { const m = Number(a.media_calculada); return m >= CONSUMO_PLAUSIVEL.min && m <= CONSUMO_PLAUSIVEL.max; };
// km rodados ÷ litros de uma lista de abastecimentos (só os com média plausível)
function consumoDe(lista){
  let km = 0, litros = 0;
  lista.forEach(a => { if(!plausivel(a)) return; const q = Number(a.litros); if(q > 0){ km += Number(a.media_calculada) * q; litros += q; } });
  return { media: litros ? km / litros : null, km, litros };
}
const numBRc = (n, casas = 1) => n == null || Number.isNaN(n) ? '—' : Number(n).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
const pctBR = (p) => p == null ? '—' : `${p > 0 ? '+' : ''}${numBRc(p * 100, 0)}%`;

// ---------------------------------------------------------------------
async function secaoConsumo(el){
  const diasBusca = Math.max(periodoConsumo * 2, 365) + 31;
  const desde = new Date(Date.now() - diasBusca * 86400000).toISOString();
  const lista = await consultar(sb.from('abastecimento')
    .select('id, data, tipo, km, litros, arla_litros, preco_litro_diesel, preco_litro_arla, media_calculada, media_arla_calculada, motorista_id, veiculo_id, motorista:motorista_id(nome), veiculo:veiculo_id(placa, tipo)')
    .gte('data', desde).order('data', { ascending: true }));
  desenharConsumo(el, lista);
}

function analisarConsumo(lista){
  const agora = Date.now(), dia = 86400000;
  const inicioAtual = agora - periodoConsumo * dia, inicioAnterior = agora - 2 * periodoConsumo * dia;
  const atual = lista.filter(a => new Date(a.data).getTime() >= inicioAtual);
  const anterior = lista.filter(a => { const t = new Date(a.data).getTime(); return t >= inicioAnterior && t < inicioAtual; });

  // "normal" de cada veículo: todo o histórico carregado, sem o próprio abastecimento
  const porVeiculoTudo = {};
  lista.forEach(a => (porVeiculoTudo[a.veiculo_id] = porVeiculoTudo[a.veiculo_id] || []).push(a));
  const normalSem = (a) => {
    const outros = (porVeiculoTudo[a.veiculo_id] || []).filter(o => o.id !== a.id && plausivel(o));
    return outros.length >= MIN_HISTORICO_ALERTA ? consumoDe(outros).media : null;
  };

  // alertas do período
  const alertas = [];
  atual.forEach(a => {
    if(a.media_calculada == null) return;
    const m = Number(a.media_calculada);
    if(!plausivel(a)){ alertas.push({ a, tipo: 'erro', normal: normalSem(a), desvio: null }); return; }
    const normal = normalSem(a);
    if(!normal) return;
    const desvio = m / normal - 1;
    if(desvio <= -DESVIO_ALERTA_CONSUMO) alertas.push({ a, tipo: 'abaixo', normal, desvio });
    else if(desvio >= DESVIO_ALERTA_CONSUMO) alertas.push({ a, tipo: 'acima', normal, desvio });
  });
  alertas.sort((x, y) => new Date(y.a.data) - new Date(x.a.data));

  // por veículo
  const agrupar = (l, chave) => l.reduce((m, a) => { (m[chave(a)] = m[chave(a)] || []).push(a); return m; }, {});
  const atualPorVeiculo = agrupar(atual, a => a.veiculo_id), anteriorPorVeiculo = agrupar(anterior, a => a.veiculo_id);
  const veiculos = Object.entries(atualPorVeiculo).map(([id, l]) => {
    const c = consumoDe(l), ant = consumoDe(anteriorPorVeiculo[id] || []);
    return {
      id, placa: l[0].veiculo ? l[0].veiculo.placa : '—', ...c, anterior: ant.media,
      variacao: c.media && ant.media ? c.media / ant.media - 1 : null,
      diesel: l.reduce((s, a) => s + (Number(a.litros) || 0), 0), n: l.length,
      alertas: alertas.filter(x => x.a.veiculo_id === id).length,
    };
  }).sort((x, y) => (x.media ?? 99) - (y.media ?? 99));

  // por motorista: média e "quanto acima/abaixo do normal dos veículos que dirigiu"
  const motoristas = Object.entries(agrupar(atual, a => a.motorista_id || '—')).map(([id, l]) => {
    const c = consumoDe(l);
    let somaRazao = 0, pesos = 0;
    l.forEach(a => { if(!plausivel(a)) return; const normal = normalSem(a); const q = Number(a.litros); if(normal && q > 0){ somaRazao += (Number(a.media_calculada) / normal) * q; pesos += q; } });
    return {
      id, nome: l[0].motorista ? l[0].motorista.nome : 'Sem motorista', ...c,
      vsNormal: pesos ? somaRazao / pesos - 1 : null,
      diesel: l.reduce((s, a) => s + (Number(a.litros) || 0), 0), n: l.length,
      alertas: alertas.filter(x => (x.a.motorista_id || '—') === id).length,
    };
  }).sort((x, y) => (x.vsNormal ?? 0) - (y.vsNormal ?? 0));

  // evolução: últimos 12 meses (mês a mês)
  const meses = [];
  for(let i = 11; i >= 0; i--){
    const ref = new Date(); ref.setDate(1); ref.setMonth(ref.getMonth() - i);
    const doMes = lista.filter(a => { const d = new Date(a.data); return d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth(); });
    const c = consumoDe(doMes);
    meses.push({ rotulo: ref.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', ''), ano: ref.getFullYear(), mes: ref.getMonth(), media: c.media, km: c.km, litros: c.litros, n: doMes.length });
  }

  // custo por km: só abastecimentos externos com preço (o interno não tem preço)
  let gastoExt = 0, kmExt = 0;
  atual.forEach(a => { const v = valorAbastecimento(a); if(a.tipo === 'externo' && v && plausivel(a)){ gastoExt += v; kmExt += Number(a.media_calculada) * Number(a.litros); } });

  return {
    atual, frota: consumoDe(atual), frotaAnterior: consumoDe(anterior), alertas, veiculos, motoristas, meses,
    diesel: atual.reduce((s, a) => s + (Number(a.litros) || 0), 0),
    custoKm: kmExt ? gastoExt / kmExt : null,
  };
}

// ---------- gráfico: média da frota mês a mês (uma série, barras) ----------
function graficoConsumo(meses, opcoes = {}){
  return graficoBarras(meses.map(m => ({
    rotulo: m.rotulo, valor: m.media,
    dica: `${m.rotulo}/${String(m.ano).slice(2)}: ${numBRc(m.media, 2)} km/l · ${numBRc(m.km, 0)} km · ${numBRc(m.litros, 0)} L · ${m.n} abastecimento${m.n === 1 ? '' : 's'}`,
  })), { casas: 2, aria: 'Média de consumo da frota por mês, em km por litro', textoVazio: 'Ainda não há abastecimentos com média para montar o gráfico.', ...opcoes });
}
function tabelaMeses(meses){
  return tabela(['Mês', 'Média (km/l)', 'Km rodados', 'Diesel (L)', 'Abastecimentos'],
    meses.map(m => `<tr><td>${m.rotulo}/${String(m.ano).slice(2)}</td><td><b>${m.media ? numBRc(m.media, 2) : '—'}</b></td><td>${m.km ? numBRc(m.km, 0) : '—'}</td><td>${m.litros ? numBRc(m.litros, 0) : '—'}</td><td>${m.n}</td></tr>`));
}

// ---------- tela ----------
const ROTULO_ALERTA_CONSUMO = { abaixo: ['red', 'Muito abaixo do normal'], acima: ['amber', 'Muito acima do normal'], erro: ['grey', 'Provável km digitado errado'] };
const DICA_ALERTA_CONSUMO = {
  abaixo: 'Gastou bem mais diesel que o normal do veículo: conferir vazamento, manutenção, rota/carga ou desvio de combustível.',
  acima: 'Rendeu bem mais que o normal: pode ter faltado registrar um abastecimento anterior ou o km estar errado.',
  erro: `Média fora de ${numBRc(CONSUMO_PLAUSIVEL.min, 1)}–${numBRc(CONSUMO_PLAUSIVEL.max, 0)} km/l — quase sempre km digitado errado. Fica fora das médias.`,
};

function desenharConsumo(el, lista){
  const r = analisarConsumo(lista);
  const variacao = r.frota.media && r.frotaAnterior.media ? r.frota.media / r.frotaAnterior.media - 1 : null;
  const corVar = variacao == null ? '' : variacao >= 0.02 ? 'verde' : variacao <= -0.02 ? 'vermelho' : '';
  const nomePeriodo = PERIODOS_CONSUMO.find(([d]) => d === periodoConsumo)[1];
  const corDesvio = (p) => p == null ? '' : p <= -0.1 ? 'color:var(--signal-red-ink);' : p >= 0.1 ? 'color:var(--signal-green-ink);' : '';

  el.innerHTML = `
    <div class="doc-tabs" style="max-width:460px;">
      ${PERIODOS_CONSUMO.map(([d, l]) => `<button class="${periodoConsumo === d ? 'active' : ''}" data-periodo-cons="${d}">${l}</button>`).join('')}
    </div>
    <div class="kpi-row">
      ${kpi(r.frota.media ? numBRc(r.frota.media, 2) + ' km/l' : '—', `Média da frota (${nomePeriodo})`,
        variacao == null ? 'Sem período anterior para comparar' : `${pctBR(variacao)} vs. ${nomePeriodo} anteriores`, corVar)}
      ${kpi(numBRc(r.frota.km, 0) + ' km', 'Km rodados (com média)', `${numBRc(r.diesel, 0)} L de diesel no período`)}
      ${kpi(r.custoKm ? fmtReais(r.custoKm) : '—', 'Custo de diesel por km', 'Só abastecimentos em posto (com preço)')}
      ${kpi(r.alertas.length, 'Alertas de consumo', r.alertas.length ? 'Ver lista abaixo' : 'Nada fora do padrão', r.alertas.length ? 'ambar' : 'verde')}
    </div>
    ${painel('Evolução da média da frota — últimos 12 meses (km/l)',
      `<div style="padding:4px 16px 12px;">${consumoComoTabela ? tabelaMeses(r.meses) : graficoConsumo(r.meses)}</div>`,
      `<button class="btn btn-outline btn-sm" id="btnConsTabela">${consumoComoTabela ? 'Ver gráfico' : 'Ver como tabela'}</button>`)}
    ${painel(`Alertas de consumo fora do padrão (${r.alertas.length})`,
      r.alertas.length ? tabela(['Data', 'Placa', 'Motorista', 'Média', 'Normal do veículo', 'Situação'],
        r.alertas.map(({ a, tipo, normal, desvio }) => { const [cor, txt] = ROTULO_ALERTA_CONSUMO[tipo]; return `<tr>
          <td class="sub">${fmtDataHora(a.data)}</td><td class="mono">${esc(a.veiculo ? a.veiculo.placa : '—')}</td><td>${esc(a.motorista ? a.motorista.nome : '—')}</td>
          <td><b>${numBRc(a.media_calculada, 2)} km/l</b>${desvio != null ? `<div class="sub">${pctBR(desvio)}</div>` : ''}</td>
          <td>${normal ? numBRc(normal, 2) + ' km/l' : '<span class="sub">—</span>'}</td>
          <td>${badge(cor, `⚠ ${txt}`)}<div class="sub">${esc(DICA_ALERTA_CONSUMO[tipo])}</div></td></tr>`; }))
        : vazio(`Nenhum abastecimento fora do padrão nos últimos ${nomePeriodo}. O alerta aparece quando a média fica ${numBRc(DESVIO_ALERTA_CONSUMO * 100, 0)}% abaixo ou acima do normal do veículo, ou fora de ${numBRc(CONSUMO_PLAUSIVEL.min, 1)}–${numBRc(CONSUMO_PLAUSIVEL.max, 0)} km/l.`),
      r.alertas.length ? botaoExportar('btnCsvConsAlertas') : '')}
    ${painel('Por veículo',
        r.veiculos.length ? tabela(['Placa', 'Média', 'Período anterior', 'Variação', 'Km rodados', 'Diesel', 'Alertas'],
          r.veiculos.map(v => `<tr><td class="mono">${esc(v.placa)}</td><td><b>${v.media ? numBRc(v.media, 2) + ' km/l' : '—'}</b></td>
            <td>${v.anterior ? numBRc(v.anterior, 2) : '<span class="sub">—</span>'}</td><td style="${corDesvio(v.variacao)}">${pctBR(v.variacao)}</td>
            <td>${numBRc(v.km, 0)}</td><td>${numBRc(v.diesel, 0)} L</td><td>${v.alertas ? badge('amber', String(v.alertas)) : '<span class="sub">—</span>'}</td></tr>`))
          : vazio('Nenhum abastecimento no período.'),
        r.veiculos.length ? botaoExportar('btnCsvConsVeiculos') : '')}
      ${painel('Por motorista',
        r.motoristas.length ? tabela(['Motorista', 'Média', 'vs. normal do veículo', 'Diesel', 'Alertas'],
          r.motoristas.map(m => `<tr><td>${esc(m.nome)}</td><td><b>${m.media ? numBRc(m.media, 2) + ' km/l' : '—'}</b></td>
            <td style="${corDesvio(m.vsNormal)}">${m.vsNormal == null ? '<span class="sub">histórico curto</span>' : pctBR(m.vsNormal)}</td>
            <td>${numBRc(m.diesel, 0)} L</td><td>${m.alertas ? badge('amber', String(m.alertas)) : '<span class="sub">—</span>'}</td></tr>`))
            + `<div class="o-empty-note" style="text-align:left;">"vs. normal do veículo" compara cada abastecimento com o normal do caminhão que o motorista dirigiu — é mais justo que comparar km/l direto, porque veículos e rotas são diferentes.</div>`
          : vazio('Nenhum abastecimento no período.'),
        r.motoristas.length ? botaoExportar('btnCsvConsMotoristas') : '')}`;

  el.querySelectorAll('[data-periodo-cons]').forEach(b => b.addEventListener('click', () => { periodoConsumo = Number(b.dataset.periodoCons); secaoConsumo(el); }));
  document.getElementById('btnConsTabela').addEventListener('click', () => { consumoComoTabela = !consumoComoTabela; desenharConsumo(el, lista); });
  ligarDicasGraficos(el);

  const dec = (v, c) => v == null ? '' : Number(v).toFixed(c).replace('.', ',');
  const csv = (id, nome, cab, linhas) => { const b = document.getElementById(id); if(b) b.addEventListener('click', () => baixarCSV(nome, cab, linhas)); };
  csv('btnCsvConsVeiculos', 'consumo_por_veiculo', ['Placa', `Média ${nomePeriodo} (km/l)`, 'Período anterior (km/l)', 'Variação (%)', 'Km rodados', 'Diesel (L)', 'Abastecimentos', 'Alertas'],
    r.veiculos.map(v => [v.placa, dec(v.media, 2), dec(v.anterior, 2), v.variacao == null ? '' : dec(v.variacao * 100, 1), dec(v.km, 0), dec(v.diesel, 1), v.n, v.alertas]));
  csv('btnCsvConsMotoristas', 'consumo_por_motorista', ['Motorista', `Média ${nomePeriodo} (km/l)`, 'vs. normal do veículo (%)', 'Km rodados', 'Diesel (L)', 'Abastecimentos', 'Alertas'],
    r.motoristas.map(m => [m.nome, dec(m.media, 2), m.vsNormal == null ? '' : dec(m.vsNormal * 100, 1), dec(m.km, 0), dec(m.diesel, 1), m.n, m.alertas]));
  csv('btnCsvConsAlertas', 'alertas_de_consumo', ['Data', 'Placa', 'Motorista', 'Média (km/l)', 'Normal do veículo (km/l)', 'Desvio (%)', 'Situação'],
    r.alertas.map(({ a, tipo, normal, desvio }) => [fmtDataHora(a.data), a.veiculo ? a.veiculo.placa : '', a.motorista ? a.motorista.nome : '', dec(a.media_calculada, 2), dec(normal, 2), desvio == null ? '' : dec(desvio * 100, 1), ROTULO_ALERTA_CONSUMO[tipo][1]]));
}
