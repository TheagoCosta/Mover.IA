// MOVER.IA — Relatório de jornada do motorista (escritório, seção Jornadas)
//   • Planilha Excel no modelo da transportadora: abas "LANÇAMENTO HORARIOS" (o diário de
//     bordo, um dia por linha com as paradas) e "ESPELHO" (as contas, com fórmulas: corrigir um
//     horário no lançamento recalcula o espelho)
//   • O mesmo espelho em PDF, para imprimir e assinar
// As contas seguem a planilha que a ChavesLog já usava (pedido do Thiago, 07/11):
//   Tempo direção = fora das paradas; HR noturna = 1/7 a mais na direção entre 22h e 5h;
//   Inter jornada = o maior entre espera (CC/CD), pátio, descanso no destino e parado;
//   Intra jornada = a soma dos outros três; indenizado = o que faltou para 11 h (inter) e 1 h (intra).
// (arquivo carregado pelo index.html; todas as funções ficam globais)

// Código de cada parada na planilha (legenda na linha 2). Parada sem código entra como 0.
const CODIGO_PARADA = {
  'Chegada no local de carregamento': 'CC', 'Carregamento': 'C', 'Em carregamento': 'C',
  'Chegada no local de descarga': 'CD', 'Descarga': 'D', 'Em descarga': 'D',
  'Parado no pátio': 'P', 'Balança': 'B', 'Usina': 'U', 'Terminal': 'T',
};
const LEGENDA_PARADAS = '(0 - Garagem/Posto/Parada)  (CC - Chegada local carregamento)  (C - Carregamento)  (P - Pátio)  (CD - Chegada local descarga)  (D - Descarga)  (B - Balança)  (U - Usina)  (T - Terminal)  (4 - Fim de jornada)';
const ABA_LANCAMENTO = 'LANÇAMENTO HORARIOS', ABA_ESPELHO = 'ESPELHO';
const FATOR_NOTURNO = 1.14285741;   // hora noturna de 52min30s, como na planilha antiga

// No fim do dia, parada comum (garagem, posto, descanso) vira 4 - Fim de jornada
function codigoParada(motivo, fimDoDia){
  const c = CODIGO_PARADA[motivo] || '0';
  return fimDoDia && c === '0' ? '4' : c;
}

// ---------- contas: um dia (jornada) por linha ----------
function diasDoRelatorio(jornadas, proxima){
  // mesmo horário: o fim de uma parada vem antes do começo da seguinte
  const ordem = { inicio: 0, retomada: 1, pausa: 2, fim: 3 };
  const lista = [...jornadas].sort((a, b) => new Date(a.inicio) - new Date(b.inicio));
  return lista.map((j, i) => {
    const eventos = [...(j.jornada_evento || [])].sort((a, b) => (new Date(a.criado_em) - new Date(b.criado_em)) || (ordem[a.tipo] - ordem[b.tipo]));
    const inicio = new Date(j.inicio);
    const paradas = [];
    let aberta = null, fim = j.fim ? new Date(j.fim) : null, fechou = null;
    eventos.forEach(ev => {
      const t = new Date(ev.criado_em);
      if(ev.tipo === 'pausa') aberta = { motivo: ev.motivo || 'Parada', inicio: t };
      else if(ev.tipo === 'retomada' && aberta){ paradas.push({ ...aberta, fim: t }); aberta = null; }
      else if(ev.tipo === 'fim'){ fim = fim || t; if(aberta){ fechou = aberta; aberta = null; } }
    });
    if(aberta && !fim) paradas.push({ ...aberta, fim: null });          // parada em andamento
    else if(aberta && fim){ fechou = aberta; }
    const seguinte = lista[i + 1] || proxima || null;
    const fimMotivo = !fim ? '' : fechou ? codigoParada(fechou.motivo, true) : '4';
    const descansoDepois = fim && seguinte ? Math.max(0, (new Date(seguinte.inicio) - fim) / 60000) : 0;
    paradas.forEach(p => { p.codigo = codigoParada(p.motivo, false); p.min = p.fim ? (p.fim - p.inicio) / 60000 : 0; });

    // trechos dirigindo: entre o início, as paradas e o fim
    const trechos = [];
    let de = inicio;
    paradas.forEach(p => { trechos.push([de, p.inicio]); de = p.fim; });
    if(de && fim) trechos.push([de, fim]);
    const direcaoMin = fim ? trechos.reduce((s, [a, b]) => s + Math.max(0, (b - a) / 60000), 0) : 0;
    const noturnos = trechosNoturnos(trechos.filter(([a, b]) => a && b));
    const noturnoHorasMin = noturnos.reduce((s, [a, b]) => s + (b - a) / 60000, 0);

    const soma = (codigos) => paradas.filter(p => codigos.includes(p.codigo)).reduce((s, p) => s + p.min, 0);
    const depoisSe = (codigos) => codigos.includes(fimMotivo) ? descansoDepois : 0;
    const c = {
      direcao: direcaoMin,
      noturna: noturnoHorasMin * FATOR_NOTURNO - noturnoHorasMin,
      carga: soma(['C', 'D']),
      espera: soma(['CC', 'CD']),
      patio: soma(['P']) + depoisSe(['P']),
      descansoDestino: depoisSe(['CC', 'CD', '4']),
      parado: soma(['0']) + depoisSe(['0']),
      but: soma(['B', 'U', 'T']) + depoisSe(['B', 'U', 'T']),
    };
    c.total = c.direcao + c.noturna + c.carga;
    const quatro = [c.espera, c.patio, c.descansoDestino, c.parado].sort((a, b) => a - b);
    c.inter = quatro[3];
    c.indenInter = c.inter <= 660 ? 660 - c.inter : 0;
    c.intra = quatro[0] + quatro[1] + quatro[2];
    c.indenIntra = c.intra >= 0.99 * 60 ? 0 : 60 - c.intra;
    return { j, inicio, fim, paradas, fimMotivo, noturnos, noturnoHorasMin, seguinte, c };
  });
}

// Partes dos trechos que caem entre 22h e 5h
function trechosNoturnos(trechos){
  const saida = [];
  trechos.forEach(([a, b]) => {
    const d = new Date(a.getFullYear(), a.getMonth(), a.getDate() - 1);
    for(; d <= b; d.setDate(d.getDate() + 1)){
      const ini = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 22), fimN = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 5);
      const x = new Date(Math.max(a, ini)), y = new Date(Math.min(b, fimN));
      if(y > x) saida.push([x, y]);
    }
  });
  return saida;
}

// ---------- tela: escolher motorista e mês ----------
async function abrirRelatorioJornada(){
  const usuarios = await qUsuarios();
  const motoristas = usuarios.filter(u => u.papel === 'motorista').sort((a, b) => a.nome.localeCompare(b.nome));
  const h = new Date(); h.setDate(1); h.setMonth(h.getMonth() - (new Date().getDate() <= 10 ? 1 : 0));
  const mes = `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}`;
  abrirModal('Relatório de jornada', `
    <div class="l2" style="margin-bottom:12px;">Planilha no modelo da transportadora (abas Lançamento horários e Espelho) e o espelho em PDF.</div>
    <label class="l2" for="rjMotorista">Motorista</label>
    <select id="rjMotorista" style="width:100%; margin:4px 0 12px;">${motoristas.map(u => `<option value="${u.id}">${esc(u.nome)}${u.ativo ? '' : ' (desativado)'}</option>`).join('')}</select>
    <label class="l2" for="rjMes">Mês</label>
    <input type="month" id="rjMes" value="${mes}" style="width:100%; margin:4px 0 16px;">
    <div style="display:flex; gap:8px; flex-wrap:wrap;">
      <button type="button" class="btn btn-primary btn-sm" id="rjExcel">${ic('download', 15)} Baixar planilha (Excel)</button>
      <button type="button" class="btn btn-outline btn-sm" id="rjPdf">${ic('doc', 15)} Baixar PDF</button>
    </div>
    <div class="l2" id="rjStatus" style="margin-top:10px;"></div>`);
  const status = document.getElementById('rjStatus');
  const gerar = async (tipo, btn) => {
    const motorista = motoristas.find(u => u.id === document.getElementById('rjMotorista').value);
    const mesEscolhido = document.getElementById('rjMes').value;
    if(!motorista || !mesEscolhido){ status.textContent = 'Escolha o motorista e o mês.'; return; }
    btn.disabled = true; status.textContent = 'Montando o relatório...';
    try{
      const dados = await dadosRelatorioJornada(motorista, mesEscolhido);
      if(!dados.dias.length){ status.textContent = 'Nenhuma jornada deste motorista no mês.'; return; }
      if(tipo === 'excel') await baixarPlanilhaJornada(dados); else await baixarPdfJornada(dados);
      status.textContent = '✅ Pronto. O arquivo foi baixado.';
    } catch(e){ status.textContent = 'Não consegui gerar: ' + (e.message || e); }
    finally { btn.disabled = false; }
  };
  document.getElementById('rjExcel').addEventListener('click', (e) => gerar('excel', e.currentTarget));
  document.getElementById('rjPdf').addEventListener('click', (e) => gerar('pdf', e.currentTarget));
}

async function dadosRelatorioJornada(motorista, mes){
  const { inicio, fim } = limitesMes(mes);
  const campos = 'id, inicio, fim, status, jornada_evento(tipo, motivo, criado_em)';
  const [jr, pr, cj] = await Promise.all([
    sb.from('jornada').select(campos).eq('motorista_id', motorista.id).gte('inicio', inicio.toISOString()).lt('inicio', fim.toISOString()).order('inicio'),
    sb.from('jornada').select('id, inicio').eq('motorista_id', motorista.id).gte('inicio', fim.toISOString()).order('inicio').limit(1),
    sb.from('conjunto').select('conjunto_item(veiculo:veiculo_id(placa, tipo))').eq('motorista_id', motorista.id).eq('ativo', true).limit(1),
  ]);
  if(jr.error) throw new Error(jr.error.message);
  const itens = cj.data && cj.data[0] ? cj.data[0].conjunto_item || [] : [];
  const cavalo = itens.map(i => i.veiculo).find(v => v && v.tipo === 'cavalo');
  return {
    motorista, mes, placa: cavalo ? cavalo.placa : '',
    empresa: usuarioAtual.transportadora ? usuarioAtual.transportadora.nome_fantasia : '',
    dias: diasDoRelatorio(jr.data || [], pr.data && pr.data[0]),
  };
}

// ---------- Excel ----------
const letraColuna = (n) => { let s = ''; for(; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + (n - 1) % 26) + s; return s; };
// data/hora no formato do Excel (número de dias desde 30/12/1899, hora local)
const serialExcel = (d) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds()) / 86400000 + 25569;
const meiaNoite = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const nomeArquivoJornada = (dados, ext) => `Jornada - ${dados.motorista.nome} - ${dados.mes}.${ext}`.replace(/[\\/:*?"<>|]+/g, '');

function baixarArquivo(blob, nome){
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = nome;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

async function baixarPlanilhaJornada(dados){
  await carregarBiblioteca('excel');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'MOVER.IA';
  wb.calcProperties.fullCalcOnLoad = true;
  const P = Math.max(6, ...dados.dias.map(d => d.paradas.length));   // paradas por linha: 6 colunas, mais só se algum dia precisar
  const N = Math.max(5, ...dados.dias.map(d => d.noturnos.length));  // trechos noturnos por linha
  const L1 = 6;   // primeira linha de dados
  const periodo = nomeMes(dados.mes);

  const fonte = { name: 'Arial', size: 11 }, negrito = { name: 'Arial', size: 12, bold: true };
  const borda = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
  const cinza = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEDEDED' } };
  const amarelo = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };
  const cab = (ws, linha, col, texto, ate = col) => {
    if(ate > col) ws.mergeCells(linha, col, linha, ate);
    const c = ws.getCell(linha, col); c.value = texto; c.font = negrito; c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    for(let k = col; k <= ate; k++){ ws.getCell(linha, k).border = borda; ws.getCell(linha, k).fill = cinza; }
  };
  const topo = (ws, colData, ultimaCol) => {
    ws.getCell(2, colData).value = 'Período: ' + periodo; ws.getCell(2, colData).font = negrito;
    ws.getCell(2, colData + 3).value = 'Diário de Bordo'; ws.getCell(2, colData + 3).font = { ...negrito, size: 14 };
    ws.mergeCells(2, colData + 6, 3, ultimaCol);
    const leg = ws.getCell(2, colData + 6); leg.value = LEGENDA_PARADAS; leg.font = { name: 'Arial', size: 9 }; leg.alignment = { wrapText: true, vertical: 'middle' };
    ws.getCell(3, colData).value = 'Motorista: ' + dados.motorista.nome; ws.getCell(3, colData).font = negrito;
    ws.getCell(3, colData + 4).value = 'Placa: ' + (dados.placa || '—'); ws.getCell(3, colData + 4).font = negrito;
    if(dados.empresa){ ws.getCell(1, colData).value = dados.empresa; ws.getCell(1, colData).font = { name: 'Arial', size: 10, color: { argb: 'FF666666' } }; }
  };
  const configurar = (ws) => { ws.pageSetup = { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 }; ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 5 }]; };

  // ===== aba LANÇAMENTO HORARIOS =====
  const wl = wb.addWorksheet(ABA_LANCAMENTO);
  const lc = { data: 2, origem: 3, inicio: 4, parada: (k) => 5 + 3 * k };   // parada k: motivo, início, fim
  lc.fim = lc.parada(P); lc.fimMot = lc.fim + 1; lc.estadia = lc.fim + 2;
  lc.not = (k) => lc.estadia + 2 + 2 * k; lc.horas = lc.not(N); lc.noturno = lc.horas + 1;
  topo(wl, lc.data, lc.estadia);
  cab(wl, 4, lc.data, 'Início Jornada', lc.inicio);
  for(let k = 0; k < P; k++) cab(wl, 4, lc.parada(k), `${k + 1}ª Parada`, lc.parada(k) + 2);
  cab(wl, 4, lc.fim, 'Fim Jornada', lc.estadia);
  cab(wl, 4, lc.not(0), 'Rodagem noturna', lc.noturno);
  [['Data', lc.data], ['Origem', lc.origem], ['Início', lc.inicio], ['Horário', lc.fim], ['Motivo', lc.fimMot], ['Estadia', lc.estadia], ['Horas', lc.horas], ['Noturno', lc.noturno]].forEach(([t, c]) => cab(wl, 5, c, t));
  for(let k = 0; k < P; k++){ cab(wl, 5, lc.parada(k), 'Motivo'); cab(wl, 5, lc.parada(k) + 1, 'Início'); cab(wl, 5, lc.parada(k) + 2, 'Fim'); }
  for(let k = 0; k < N; k++){ cab(wl, 5, lc.not(k), 'Início'); cab(wl, 5, lc.not(k) + 1, 'Fim'); }

  // ===== aba ESPELHO =====
  const we = wb.addWorksheet(ABA_ESPELHO);
  const ec = { mes: 1, serial: 2, data: 3, origem: 4, inicio: 5, parada: (k) => 6 + 3 * k };
  ec.fim = ec.parada(P); ec.fimMot = ec.fim + 1; ec.estadia = ec.fim + 2;
  const CONTAS = [['direcao', 'Tempo Direção'], ['noturna', 'HR noturna'], ['carga', 'Carga Descarga'], ['total', 'TOTAL'], ['inter', 'Inter Jornada'], ['indenInter', 'Indenizado Inter Jornada'],
    ['intra', 'Intra Jornada'], ['indenIntra', 'Indenizado Intra Jornada'], ['espera', 'Chegada em destino'], ['patio', 'Pátio'], ['descansoDestino', 'Chegada Destino Descanso'], ['parado', 'Parado'], ['but', 'Balança / Usina / Terminal']];
  CONTAS.forEach(([k], i) => { ec[k] = ec.estadia + 1 + i; });
  const ultimaE = ec.but;
  topo(we, ec.data, ec.estadia);
  cab(we, 4, ec.data, 'Início Jornada', ec.inicio);
  for(let k = 0; k < P; k++) cab(we, 4, ec.parada(k), `${k + 1}ª Parada`, ec.parada(k) + 2);
  cab(we, 4, ec.fim, 'Fim Jornada', ec.estadia);
  cab(we, 4, ec.direcao, 'Apontamento de Horas', ultimaE);
  [['Mês ref.', ec.mes], ['Data', ec.data], ['Origem', ec.origem], ['Início', ec.inicio], ['Horário', ec.fim], ['Motivo', ec.fimMot], ['Estadia', ec.estadia]].forEach(([t, c]) => cab(we, 5, c, t));
  for(let k = 0; k < P; k++){ cab(we, 5, ec.parada(k), 'Motivo'); cab(we, 5, ec.parada(k) + 1, 'Início'); cab(we, 5, ec.parada(k) + 2, 'Fim'); }
  CONTAS.forEach(([k, t]) => cab(we, 5, ec[k], t));

  const LAN = `'${ABA_LANCAMENTO}'!`;
  const A = (c, r) => letraColuna(c) + r;
  const dia = (min) => min / 1440;
  const ultimaLinha = L1 + dados.dias.length - 1;

  dados.dias.forEach((d, i) => {
    const r = L1 + i;
    const base = meiaNoite(d.inicio), fr = (t) => (t - base) / 86400000;   // hora do dia (passa de 1 depois da meia-noite)
    // --- lançamento: os horários como o escritório digitava ---
    const setL = (c, v, fmt) => { const cel = wl.getCell(r, c); cel.value = v; cel.font = fonte; cel.border = borda; if(fmt) cel.numFmt = fmt; };
    setL(lc.data, new Date(Date.UTC(base.getFullYear(), base.getMonth(), base.getDate())), 'dd/mm/yyyy');
    setL(lc.origem, null); setL(lc.inicio, fr(d.inicio), 'hh:mm');
    for(let k = 0; k < P; k++){
      const p = d.paradas[k];
      setL(lc.parada(k), p ? p.codigo : null); setL(lc.parada(k) + 1, p ? fr(p.inicio) : null, 'hh:mm'); setL(lc.parada(k) + 2, p && p.fim ? fr(p.fim) : null, 'hh:mm');
    }
    setL(lc.fim, d.fim ? fr(d.fim) : null, 'hh:mm'); setL(lc.fimMot, d.fimMotivo || null); setL(lc.estadia, null);
    for(let k = 0; k < N; k++){ const t = d.noturnos[k]; setL(lc.not(k), t ? fr(t[0]) : null, 'hh:mm'); setL(lc.not(k) + 1, t ? fr(t[1]) : null, 'hh:mm'); }
    setL(lc.horas, { formula: [...Array(N)].map((_, k) => `${A(lc.not(k) + 1, r)}-${A(lc.not(k), r)}`).join('+'), result: dia(d.noturnoHorasMin) }, '[h]:mm');
    setL(lc.noturno, { formula: `(${A(lc.horas, r)}*${FATOR_NOTURNO})-${A(lc.horas, r)}`, result: dia(d.c.noturna) }, '[h]:mm');

    // --- espelho: fórmulas que leem o lançamento ---
    const s = serialExcel(base);
    const setE = (c, v, fmt) => { const cel = we.getCell(r, c); cel.value = v; cel.font = fonte; cel.border = borda; if(fmt) cel.numFmt = fmt; };
    const B = A(ec.serial, r);
    const hora = (cl, t) => ({ formula: `${B}+${LAN}${A(cl, r)}`, result: s + fr(t) });
    setE(ec.mes, base.getMonth() + 1);
    setE(ec.serial, { formula: A(ec.data, r), result: s });
    setE(ec.data, { formula: LAN + A(lc.data, r), result: new Date(Date.UTC(base.getFullYear(), base.getMonth(), base.getDate())) }, 'dd/mm/yyyy');
    setE(ec.origem, { formula: `""&${LAN}${A(lc.origem, r)}`, result: '' });
    setE(ec.inicio, hora(lc.inicio, d.inicio), 'hh:mm');
    const reais = d.paradas.slice(0, P).map((p, k) => ({ p, mot: A(ec.parada(k), r), ini: A(ec.parada(k) + 1, r), fim: A(ec.parada(k) + 2, r) }));
    for(let k = 0; k < P; k++){
      const p = d.paradas[k];
      setE(ec.parada(k), p ? { formula: `""&${LAN}${A(lc.parada(k), r)}`, result: p.codigo } : null);
      setE(ec.parada(k) + 1, p ? hora(lc.parada(k) + 1, p.inicio) : null, 'hh:mm');
      setE(ec.parada(k) + 2, p && p.fim ? hora(lc.parada(k) + 2, p.fim) : null, 'hh:mm');
    }
    const FIM = A(ec.fim, r), FMOT = A(ec.fimMot, r);
    setE(ec.fim, d.fim ? hora(lc.fim, d.fim) : null, 'hh:mm');
    setE(ec.fimMot, d.fim ? { formula: `""&${LAN}${A(lc.fimMot, r)}`, result: d.fimMotivo } : null);
    setE(ec.estadia, null);

    // próximo início: a linha de baixo, ou o valor (próxima jornada fora do mês)
    const proximoInicio = i < dados.dias.length - 1 ? A(ec.inicio, r + 1) : (d.seguinte ? String(serialExcel(new Date(d.seguinte.inicio))) : FIM);
    const somaCodigos = (cods) => reais.filter(x => x.p.fim).map(x => `IF(OR(${cods.map(c => `${x.mot}="${c}"`).join(',')}),${x.fim}-${x.ini},0)`).join('+') || '0';
    const depoisSe = (cods) => d.fim ? `+IF(OR(${cods.map(c => `${FMOT}="${c}"`).join(',')}),${proximoInicio}-${FIM},0)` : '';
    const conta = (k, formula) => setE(ec[k], formula === null ? null : { formula, result: dia(d.c[k]) }, '[h]:mm');
    if(d.fim){
      let dir = `${reais.length ? reais[0].ini : FIM}-${A(ec.inicio, r)}`;
      reais.forEach((x, k) => { dir += `+${k + 1 < reais.length ? reais[k + 1].ini : FIM}-${x.fim}`; });
      conta('direcao', dir);
    } else conta('direcao', null);
    conta('noturna', LAN + A(lc.noturno, r));
    conta('carga', somaCodigos(['C', 'D']));
    conta('total', `${A(ec.direcao, r)}+${A(ec.noturna, r)}+${A(ec.carga, r)}`);
    const quatro = `${A(ec.espera, r)}:${A(ec.parado, r)}`;
    conta('inter', `MAX(${quatro})`);
    conta('indenInter', `IF(${A(ec.inter, r)}<=11/24,11/24-${A(ec.inter, r)},0)`);
    conta('intra', `SMALL(${quatro},1)+SMALL(${quatro},2)+SMALL(${quatro},3)`);
    conta('indenIntra', `IF(${A(ec.intra, r)}>=0.99/24,0,1/24-${A(ec.intra, r)})`);
    conta('espera', somaCodigos(['CC', 'CD']));
    conta('patio', somaCodigos(['P']) + depoisSe(['P']));
    conta('descansoDestino', '0' + depoisSe(['CC', 'CD', '4']));
    conta('parado', somaCodigos(['0']) + depoisSe(['0']));
    conta('but', somaCodigos(['B', 'U', 'T']) + depoisSe(['B', 'U', 'T']));
  });

  // totais no topo das contas (somam só as linhas visíveis quando o filtro está ligado)
  CONTAS.forEach(([k]) => {
    const c = we.getCell(3, ec[k]);
    c.value = { formula: `SUBTOTAL(9,${A(ec[k], L1)}:${A(ec[k], ultimaLinha)})`, result: dia(dados.dias.reduce((s, d) => s + d.c[k], 0)) };
    c.numFmt = '[h]:mm'; c.font = { ...fonte, bold: true }; c.border = borda; c.fill = amarelo;
  });
  we.mergeCells(2, ec.direcao, 2, ultimaE);   // fora da legenda, que vai até a coluna Estadia
  const rotTotal = we.getCell(2, ec.direcao);
  rotTotal.value = 'Total do mês'; rotTotal.font = negrito; rotTotal.alignment = { horizontal: 'center', vertical: 'bottom' };
  we.autoFilter = { from: { row: 5, column: ec.mes }, to: { row: ultimaLinha, column: ultimaE } };

  [wl, we].forEach(ws => { configurar(ws); ws.getRow(4).height = 20; ws.getRow(5).height = 46; ws.getRow(2).height = 30; });
  wl.columns.forEach((col, i) => { col.width = i + 1 === lc.data ? 12 : i + 1 === lc.origem ? 16 : 8; });
  we.columns.forEach((col, i) => { const n = i + 1; col.width = n === ec.serial ? 3 : n === ec.data ? 12 : n === ec.origem ? 16 : n >= ec.direcao ? 12 : 8; });
  we.getColumn(ec.serial).hidden = true;

  const buf = await wb.xlsx.writeBuffer();
  baixarArquivo(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), nomeArquivoJornada(dados, 'xlsx'));
}

// ---------- PDF ----------
// corta os segundos, como o Excel mostra [h]:mm
const hhmm = (min) => { min = Math.max(0, Math.floor((min || 0) + 1e-6)); return `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`; };
const hhmmOuTraco = (min) => (min >= 0.5 ? hhmm(min) : '—');

async function baixarPdfJornada(dados){
  await carregarBiblioteca('jspdf');
  await carregarBiblioteca('jspdfTabela');
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const tot = (k) => dados.dias.reduce((s, d) => s + d.c[k], 0);

  doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
  doc.text('Espelho de jornada — Diário de bordo', 10, 13);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  doc.text([`Motorista: ${dados.motorista.nome}`, `Placa: ${dados.placa || '—'}    Período: ${nomeMes(dados.mes)}`], 10, 19);
  doc.text([dados.empresa || '', `Gerado em ${fmtDataHora(new Date().toISOString())} · MOVER.IA`], W - 10, 13, { align: 'right' });

  const resumo = [['Direção', tot('direcao')], ['Hora noturna', tot('noturna')], ['Carga/descarga', tot('carga')], ['Total', tot('total')], ['Indenizado inter', tot('indenInter')], ['Indenizado intra', tot('indenIntra')]];
  const lb = (W - 20) / resumo.length;
  resumo.forEach(([t, v], i) => {
    const x = 10 + i * lb;
    doc.setDrawColor(220); doc.roundedRect(x, 25, lb - 3, 12, 1.5, 1.5);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.text(hhmm(v), x + 3, 31);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.text(t, x + 3, 35);
  });

  const cab = ['Data', 'Início', 'Paradas', 'Fim', 'Mot.', 'Direção', 'Noturna', 'Carga/ desc.', 'Total', 'Inter jornada', 'Indeniz. inter', 'Intra jornada', 'Indeniz. intra', 'Espera CC/CD', 'Pátio', 'Descanso destino', 'Parado', 'Bal./Usi./ Term.'];
  const semana = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  const corpo = dados.dias.map(d => {
    const f = (t) => (t ? fmtHora(t.toISOString()) : '—');
    return [`${fmtDataCurta(d.inicio.toISOString())} ${semana[d.inicio.getDay()]}`, f(d.inicio),
      d.paradas.map(p => `${p.codigo} ${f(p.inicio)}–${p.fim ? f(p.fim) : '...'}`).join('\n') || '—',
      d.fim ? f(d.fim) : 'em aberto', d.fimMotivo || '—',
      ...['direcao', 'noturna', 'carga', 'total', 'inter', 'indenInter', 'intra', 'indenIntra', 'espera', 'patio', 'descansoDestino', 'parado', 'but'].map(k => hhmmOuTraco(d.c[k]))];
  });
  const rodape = ['Total', '', `${dados.dias.reduce((s, d) => s + d.paradas.length, 0)} paradas`, '', '',
    ...['direcao', 'noturna', 'carga', 'total', 'inter', 'indenInter', 'intra', 'indenIntra', 'espera', 'patio', 'descansoDestino', 'parado', 'but'].map(k => hhmm(tot(k)))];
  doc.autoTable({
    head: [cab], body: corpo, foot: [rodape], startY: 41, theme: 'grid', margin: { left: 10, right: 10 },
    styles: { font: 'helvetica', fontSize: 7, cellPadding: 1.2, valign: 'middle', halign: 'center', lineColor: [210, 210, 210] },
    headStyles: { fillColor: [244, 241, 234], textColor: 30, fontStyle: 'bold' },
    footStyles: { fillColor: [255, 242, 204], textColor: 30, fontStyle: 'bold' },
    columnStyles: { 0: { halign: 'left', cellWidth: 16 }, 2: { halign: 'left', cellWidth: 34 } },
    showFoot: 'lastPage',
    didDrawPage: () => {
      doc.setFontSize(7); doc.setTextColor(120);
      doc.text(`Página ${doc.internal.getNumberOfPages()}`, W - 10, doc.internal.pageSize.getHeight() - 5, { align: 'right' });
      doc.setTextColor(0);
    },
  });

  let y = doc.lastAutoTable.finalY + 6;
  const H = doc.internal.pageSize.getHeight();
  if(y > H - 40){ doc.addPage(); y = 15; }
  doc.setFontSize(7); doc.setTextColor(90);
  doc.text(doc.splitTextToSize('Legenda: ' + LEGENDA_PARADAS.replace(/\s{2,}/g, ' ') + '. Horários informados pelo motorista no app; fora das paradas o tempo conta como direção. Inter jornada: o maior entre espera, pátio, descanso no destino e parado; intra jornada: a soma dos outros. Indenizado: o que faltou para 11 h (inter) e 1 h (intra).', W - 20), 10, y);
  doc.setTextColor(0);
  y += 22;
  doc.setDrawColor(80);
  doc.line(20, y, 120, y); doc.line(W - 120, y, W - 20, y);
  doc.setFontSize(8);
  doc.text(`Motorista: ${dados.motorista.nome}`, 70, y + 4, { align: 'center' });
  doc.text('Responsável da transportadora', W - 70, y + 4, { align: 'center' });

  doc.save(nomeArquivoJornada(dados, 'pdf'));
}
