// MOVER.IA — Relatório mensal por motorista (seção "Relatório mensal" do escritório)
//   • resumo do mês de cada motorista: dias trabalhados, condução, viagens,
//     checklists, abastecimentos (km/l e gasto em posto), chamados, avisos no celular
//   • relatório de um motorista (ou de todos) para imprimir / salvar em PDF
//   • planilha do resumo
// (arquivo carregado pelo index.html; todas as funções ficam globais,
// então um arquivo pode chamar funções dos outros normalmente)

let mesRelatorio = null;   // 'AAAA-MM'; começa no mês atual

function limitesMes(mes){
  const [a, m] = mes.split('-').map(Number);
  return { inicio: new Date(a, m - 1, 1), fim: new Date(a, m, 1) };
}
function nomeMes(mes){
  const { inicio } = limitesMes(mes);
  const t = inicio.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  return t.charAt(0).toUpperCase() + t.slice(1);
}

async function secaoRelatorios(el){
  if(!mesRelatorio){ const h = new Date(); mesRelatorio = `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}`; }
  el.innerHTML = '<div class="status">Montando o relatório...</div>';
  const { inicio, fim } = limitesMes(mesRelatorio);
  const de = inicio.toISOString(), ate = fim.toISOString();
  const [usuarios, jornadas, checklists, abastecimentos, viagens, chamados, avisos] = await Promise.all([
    qUsuarios(),
    consultar(sb.from('jornada').select('id, motorista_id, inicio, fim, status, jornada_evento(tipo, motivo, criado_em)').gte('inicio', de).lt('inicio', ate).order('inicio')),
    consultar(sb.from('checklist').select('id, motorista_id, criado_em, respostas').gte('criado_em', de).lt('criado_em', ate).order('criado_em')),
    consultar(sb.from('abastecimento').select('id, motorista_id, data, tipo, km, litros, arla_litros, preco_litro_diesel, preco_litro_arla, media_calculada, posto, veiculo:veiculo_id(placa)').gte('data', de).lt('data', ate).order('data')),
    consultar(sb.from('viagem').select('id, motorista_id, criado_em, origem, destino, cte_numero, mdfe_numero, status').gte('criado_em', de).lt('criado_em', ate).order('criado_em')),
    consultar(sb.from('chamado_manutencao').select('id, motorista_id, criado_em, categoria, descricao, status, veiculo:veiculo_id(placa)').gte('criado_em', de).lt('criado_em', ate).order('criado_em')),
    sb.rpc('avisos_celular_usuarios').then(r => r.data || []),
  ]);
  const comAviso = new Set(avisos.map(a => a.usuario_id));
  const doMotorista = (lista, id) => lista.filter(x => x.motorista_id === id);

  const linhas = usuarios.filter(u => u.papel === 'motorista').map(u => {
    const js = doMotorista(jornadas, u.id).map(j => {
      const eventos = [...(j.jornada_evento || [])].sort((a, b) => new Date(a.criado_em) - new Date(b.criado_em));
      return { ...j, eventos, c: calcularConducao(eventos, j.fim ? new Date(j.fim) : new Date()) };
    });
    const ab = doMotorista(abastecimentos, u.id), ck = doMotorista(checklists, u.id), vg = doMotorista(viagens, u.id), ch = doMotorista(chamados, u.id);
    return {
      u, jornadas: js, checklists: ck, abastecimentos: ab, viagens: vg, chamados: ch,
      dias: new Set(js.map(j => fmtData(j.inicio))).size,
      conducaoMin: js.reduce((s, j) => s + j.c.totalMin, 0),
      paradas: js.reduce((s, j) => s + j.c.paradas, 0),
      abertas: js.filter(j => j.status !== 'encerrada').length,
      irregulares: ck.filter(c => contarIrregularidades(c) > 0).length,
      concluidas: vg.filter(v => v.status === 'concluida').length,
      consumo: consumoDe(ab),
      diesel: ab.reduce((s, a) => s + (Number(a.litros) || 0), 0),
      gastoPosto: ab.reduce((s, a) => s + (a.tipo === 'externo' ? (valorAbastecimento(a) || 0) : 0), 0),
      avisos: comAviso.has(u.id),
    };
  }).filter(l => l.u.ativo || l.jornadas.length || l.viagens.length || l.abastecimentos.length || l.checklists.length);

  desenharRelatorios(el, linhas);
}

function desenharRelatorios(el, linhas){
  const empresa = usuarioAtual.transportadora ? usuarioAtual.transportadora.nome_fantasia : '';
  const semAviso = linhas.filter(l => l.u.ativo && !l.avisos);
  const tot = (f) => linhas.reduce((s, l) => s + f(l), 0);
  const ordens = [
    ['az', 'Motorista de A a Z', porTexto(l => l.u.nome)],
    ['za', 'Motorista de Z a A', porTexto(l => l.u.nome, -1)],
    ['dias', 'Mais dias trabalhados', porNumero(l => l.dias, -1)],
    ['conducao', 'Mais tempo de condução', porNumero(l => l.conducaoMin, -1)],
    ['viagens', 'Mais viagens', porNumero(l => l.viagens.length, -1)],
    ['consumo', 'Pior consumo (km/l)', porNumero(l => l.consumo.media ?? 99, 1)],
  ];

  el.innerHTML = `
    <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap; margin-bottom:14px;">
      <label class="l2" for="relMes">Mês</label>
      <input type="month" id="relMes" value="${mesRelatorio}" style="max-width:180px;">
      <button class="btn btn-primary btn-sm" id="btnRelImprimirTodos">${ic('doc', 15)} Relatório de todos (imprimir / PDF)</button>
    </div>
    <div class="kpi-row">
      ${kpi(linhas.filter(l => l.dias).length, 'Motoristas que trabalharam', `${tot(l => l.dias)} dias de jornada no mês`)}
      ${kpi(fmtMinutos(tot(l => l.conducaoMin)), 'Condução no mês', `${tot(l => l.paradas)} paradas registradas`)}
      ${kpi(tot(l => l.viagens.length), 'Viagens', `${tot(l => l.concluidas)} concluídas`)}
      ${kpi(tot(l => l.checklists.length), 'Checklists', tot(l => l.irregulares) ? `${tot(l => l.irregulares)} com irregularidade` : 'Nenhum irregular', tot(l => l.irregulares) ? 'ambar' : 'verde')}
    </div>
    ${semAviso.length ? painel(`${ic('bell', 16)} ${semAviso.length} motorista${semAviso.length > 1 ? 's' : ''} sem os avisos no celular`,
      `<div class="l2" style="padding:4px 16px 14px; line-height:1.5;">Eles só ficam sabendo de viagem nova, chamado e documento vencendo quando abrem o app. Peça para cada um abrir o MOVER.IA no celular e tocar em <b>Ativar</b> no quadro "Ative os avisos no celular" do Início (no iPhone, antes instalar o app na tela inicial).<br>
        <b>${semAviso.map(l => esc(l.u.nome)).join(' · ')}</b></div>`) : ''}
    ${barraLista('relatorios', ordens, 'Pesquisar motorista')}
    <div id="listaRelatorios"></div>`;

  let visiveis = linhas;
  function desenhar(){
    visiveis = aplicarLista('relatorios', linhas, ordens, l => l.u.nome);
    const caixa = document.getElementById('listaRelatorios');
    caixa.innerHTML = painel(`${nomeMes(mesRelatorio)} — por motorista (${visiveis.length})`,
      visiveis.length ? tabela(['Motorista', 'Dias', 'Condução', 'Viagens', 'Checklists', 'Diesel', 'Média', 'Gasto em posto', 'Chamados', 'Avisos no celular', ''],
        visiveis.map(l => `<tr>
          <td>${nomeCelula(l.u.nome, l.u.ativo ? '' : 'Desativado')}</td>
          <td>${l.dias || '—'}</td>
          <td class="mono">${l.conducaoMin ? fmtMinutos(l.conducaoMin) : '—'}${l.abertas ? `<div class="sub">${l.abertas} sem encerrar</div>` : ''}</td>
          <td>${l.viagens.length || '—'}</td>
          <td>${l.checklists.length || '—'}${l.irregulares ? `<div>${badge('red', `${l.irregulares} irregular${l.irregulares > 1 ? 'es' : ''}`)}</div>` : ''}</td>
          <td>${l.diesel ? numBRc(l.diesel, 0) + ' L' : '—'}</td>
          <td>${l.consumo.media ? `<b>${numBRc(l.consumo.media, 2)} km/l</b>` : '—'}</td>
          <td>${l.gastoPosto ? fmtReais(l.gastoPosto) : '—'}</td>
          <td>${l.chamados.length || '—'}</td>
          <td>${l.avisos ? badge('green', 'Ligado') : badge('grey', 'Desligado')}</td>
          <td><button class="btn btn-outline btn-sm" data-rel-mot="${l.u.id}">Relatório</button></td></tr>`))
        + `<div class="o-empty-note" style="text-align:left;">Dias e condução contam as jornadas iniciadas no mês. A média (km/l) usa só os abastecimentos com km informado.</div>`
        : vazio('Nenhum motorista encontrado.'),
      visiveis.length ? botaoExportar('btnCsvRelatorio') : '');
    caixa.querySelectorAll('[data-rel-mot]').forEach(b => b.addEventListener('click', () => abrirRelatorioMensal([linhas.find(l => l.u.id === b.dataset.relMot)], empresa)));
    const csv = document.getElementById('btnCsvRelatorio');
    if(csv) csv.addEventListener('click', () => baixarCSV(`relatorio_${mesRelatorio}`,
      ['Motorista', 'Dias trabalhados', 'Condução', 'Paradas', 'Jornadas sem encerrar', 'Viagens', 'Viagens concluídas', 'Checklists', 'Checklists irregulares', 'Abastecimentos', 'Diesel (L)', 'Média (km/l)', 'Gasto em posto (R$)', 'Chamados', 'Avisos no celular'],
      visiveis.map(l => [l.u.nome, l.dias, fmtMinutos(l.conducaoMin), l.paradas, l.abertas, l.viagens.length, l.concluidas, l.checklists.length, l.irregulares, l.abastecimentos.length,
        numBRc(l.diesel, 1), l.consumo.media ? numBRc(l.consumo.media, 2) : '', l.gastoPosto ? numBRc(l.gastoPosto, 2) : '', l.chamados.length, l.avisos ? 'Ligado' : 'Desligado'])));
  }
  desenhar();
  ligarBarraLista(el, 'relatorios', desenhar);

  document.getElementById('relMes').addEventListener('change', (e) => { if(e.target.value){ mesRelatorio = e.target.value; secaoRelatorios(el); } });
  document.getElementById('btnRelImprimirTodos').addEventListener('click', () => {
    const comAtividade = visiveis.filter(l => l.jornadas.length || l.viagens.length || l.abastecimentos.length || l.checklists.length || l.chamados.length);
    if(!comAtividade.length) return alert('Nenhum motorista com atividade neste mês.');
    abrirRelatorioMensal(comAtividade, empresa);
  });
}

// Relatório para imprimir: uma página por motorista
function abrirRelatorioMensal(lista, empresa){
  const tab = (titulo, cab, linhas) => `<h2>${titulo} (${linhas.length})</h2>` + (linhas.length
    ? `<table><tr>${cab.map(c => `<th>${c}</th>`).join('')}</tr>${linhas.map(l => `<tr>${l.map(c => `<td>${esc(c == null || c === '' ? '—' : c)}</td>`).join('')}</tr>`).join('')}</table>`
    : '<div class="sub">Nada registrado no mês.</div>');
  const caixa = (n, r) => `<div class="kpi"><b>${esc(n)}</b><span>${esc(r)}</span></div>`;
  const pagina = (l) => `<section>
    <div class="topo"><div><h1>${esc(l.u.nome)}</h1><div class="sub">${esc(empresa)} · Relatório de ${esc(nomeMes(mesRelatorio))}</div></div><div class="sub">Gerado em ${esc(fmtDataHora(new Date().toISOString()))}<br>MOVER.IA</div></div>
    <div class="kpis">
      ${caixa(String(l.dias), 'dias trabalhados')}${caixa(fmtMinutos(l.conducaoMin), 'de condução')}${caixa(String(l.viagens.length), 'viagens')}
      ${caixa(String(l.checklists.length), 'checklists')}${caixa(l.diesel ? numBRc(l.diesel, 0) + ' L' : '—', 'de diesel')}${caixa(l.consumo.media ? numBRc(l.consumo.media, 2) + ' km/l' : '—', 'média')}
    </div>
    ${tab('Jornadas', ['Data', 'Início', 'Fim', 'Condução', 'Paradas', 'Situação'], l.jornadas.map(j => [fmtData(j.inicio), fmtHora(j.inicio), j.fim ? fmtHora(j.fim) : '', fmtMinutos(j.c.totalMin), j.c.paradas, ROTULO_JORNADA[j.status]]))}
    ${tab('Viagens', ['Data', 'MDF-e', 'CT-e', 'Origem', 'Destino', 'Situação'], l.viagens.map(v => [fmtData(v.criado_em), v.mdfe_numero, v.cte_numero, v.origem, v.destino, (ROTULO_VIAGEM[v.status] || [, v.status])[1]]))}
    ${tab('Checklists', ['Data', 'Hora', 'Itens respondidos', 'Itens que não atendem'], l.checklists.map(c => [fmtData(c.criado_em), fmtHora(c.criado_em), (c.respostas || []).length, contarIrregularidades(c)]))}
    ${tab('Abastecimentos', ['Data', 'Placa', 'Local', 'Km', 'Diesel (L)', 'Arla (L)', 'Média (km/l)', 'Valor'], l.abastecimentos.map(a => [fmtData(a.data), a.veiculo ? a.veiculo.placa : '', a.tipo === 'interno' ? 'Bomba própria' : (a.posto || 'Posto'), a.km, numBRc(a.litros, 1), a.arla_litros ? numBRc(a.arla_litros, 1) : '', a.media_calculada ? numBRc(a.media_calculada, 2) : '', valorAbastecimento(a) ? fmtReais(valorAbastecimento(a)) : '']))}
    ${tab('Chamados de oficina', ['Data', 'Placa', 'Categoria', 'Descrição', 'Situação'], l.chamados.map(c => [fmtData(c.criado_em), c.veiculo ? c.veiculo.placa : '', c.categoria, c.descricao, ROTULO_CHAMADO[c.status] || c.status]))}
    <div class="assinaturas"><div>Motorista</div><div>Responsável da transportadora</div></div>
  </section>`;
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Relatório ${esc(nomeMes(mesRelatorio))} — MOVER.IA</title>
    <style>body{font-family:Arial,sans-serif;color:#222;margin:24px;font-size:12px}h1{font-size:19px;margin:0}h2{font-size:14px;margin:18px 0 4px;border-bottom:2px solid #ffc53d;padding-bottom:3px}
    table{border-collapse:collapse;width:100%}th,td{border:1px solid #ddd;padding:4px 6px;text-align:left;vertical-align:top}th{background:#f4f1ea}.sub{color:#666}
    .topo{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.topo>.sub{text-align:right}
    .kpis{display:grid;grid-template-columns:repeat(6,1fr);gap:8px;margin-top:14px}.kpi{border:1px solid #ddd;border-radius:6px;padding:8px}.kpi b{display:block;font-size:16px}.kpi span{color:#666}
    .assinaturas{display:flex;gap:40px;margin-top:48px}.assinaturas div{flex:1;border-top:1px solid #444;padding-top:4px;text-align:center}
    section{page-break-after:always}section:last-of-type{page-break-after:auto}
    @media (max-width:640px){.kpis{grid-template-columns:repeat(3,1fr)}}@media print{button{display:none}body{margin:12mm}}</style></head><body>
    <div style="text-align:right;margin-bottom:12px"><button onclick="print()" style="padding:8px 14px">Imprimir / salvar em PDF</button></div>
    ${lista.map(pagina).join('')}
    </body></html>`;
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  const janela = window.open(url, '_blank');
  if(!janela) location.href = url;
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
