// MOVER.IA — Controle de pneus (escritório: seção Pneus; mecânico: aba Pneus).
// Cada pneu tem número de fogo e um histórico de movimentos (montagem, retirada, inspeção,
// recapagem, conserto, sucata). A situação atual (onde está, vida, km, sulco, custo) o banco
// recalcula do histórico (migração 20261104_01_pneus.sql).
//   • Mapa do veículo: eixos e posições; toque num pneu para medir, retirar, trocar de posição.
//   • Lista de pneus: estoque, recapagem, sucata, alertas de sulco.
//   • Comparar marcas: km por vida, desgaste (mm a cada 1.000 km) e custo por 1.000 km.
// km = odômetro do veículo; na carreta/dolly o do cavalo que está puxando (último abastecimento).
// Carregado × vazio (pneu_km_carga, migração 20261104_02): carregado = viagem em andamento (MDF-e até a
// descarga). Eixo que levanta ("12h") fica suspenso vazio, então os pneus dele só contam km carregado;
// os outros eixos são "24h". Estepe não soma km.
// Sulco: medido na garagem pelo mecânico ou escritório, 1 a 2 vezes por mês (aviso com 20 dias).
// O mecânico cadastra e lança movimentos; editar o cadastro e desfazer movimento é do escritório.
// (arquivo carregado pelo index.html; todas as funções ficam globais)

const ROTULO_STATUS_PNEU = { em_uso: 'Montado', estoque: 'Estoque', recapagem: 'Na recapagem', sucata: 'Sucata' };
const COR_STATUS_PNEU = { em_uso: 'green', estoque: 'blue', recapagem: 'amber', sucata: 'grey' };
const ROTULO_MOV_PNEU = { montagem: 'Montagem', desmontagem: 'Retirada', inspecao: 'Inspeção', envio_recapagem: 'Enviado para recapagem',
  retorno_recapagem: 'Voltou da recapagem', conserto: 'Conserto', sucata: 'Sucata' };
const ROTULO_APLICACAO = { direcional: 'Direcional (liso)', tracao: 'Tração (borrachudo)', livre: 'Livre rodagem (carreta)' };
const MARCAS_PNEU = ['Michelin', 'Pirelli', 'Bridgestone', 'Goodyear', 'Continental', 'Firestone', 'Dunlop', 'BFGoodrich', 'Hankook', 'Xbri', 'Sailun', 'Linglong', 'Triangle', 'Aeolus', 'Westlake'];
const MEDIDAS_PNEU = ['295/80R22.5', '275/80R22.5', '11R22.5', '315/80R22.5', '385/65R22.5', '215/75R17.5', '1000R20', '1100R22'];
const MOTIVOS_RETIRADA = ['Desgaste (recapar)', 'Rodízio', 'Furo', 'Corte ou bolha', 'Desgaste irregular', 'Troca de veículo', 'Outro'];
const MOTIVOS_SUCATA = ['Recapadora recusou', 'Corte ou bolha', 'Estouro', 'Carcaça no fim', 'Desgaste abaixo do limite', 'Outro'];
const SULCO_LEGAL_MM = 1.6;      // limite da lei (Resolução CONTRAN 558/80)
const SULCO_RECAPAR_MM = 3;      // abaixo disso a carcaça corre risco — hora de recapar
const DIAS_SEM_MEDICAO = 20;     // medição na garagem 1 a 2 vezes por mês
const DIAS_NA_RECAPAGEM = 30;
const EIXOS_PADRAO = { cavalo: 3, carreta: 2, dolly: 2 };
const CAMPOS_PNEU = 'id, numero_fogo, marca, modelo, medida, aplicacao, dot, data_compra, valor_compra, fornecedor, nota_numero, sulco_inicial_mm, vida_inicial, observacao, ' +
  'status, vida, veiculo_id, posicao, montado_em, km_montagem, km_rodado, km_vida, vidas_concluidas, sulco_vida_inicio, sulco_atual_mm, medido_em, km_vida_medicao, custo_total, ultimo_mov_em';
let abaPneus = 'veiculos';
let filtroPneus = 'todos';
let aplicacaoMarcas = '';
let agruparModelo = false;

const ehGestaoPneus = () => ['admin_transportadora', 'gestor', 'admin_mover_ia'].includes(usuarioAtual.papel);

async function buscarDadosPneus(){
  const [pneus, veiculos, conjuntos, kms, cargas] = await Promise.all([
    consultar(sb.from('pneu').select(CAMPOS_PNEU).order('numero_fogo').limit(10000)),
    consultar(sb.from('veiculo').select('id, placa, tipo, modelo, eixos, eixos_levantam, ativo').order('placa')),
    consultar(sb.from('conjunto').select('id, ativo, motorista:motorista_id(nome), conjunto_item(ordem, veiculo_id)')),
    consultar(sb.rpc('km_atual_veiculos')),
    consultar(sb.rpc('pneu_km_carga')),
  ]);
  const motoristaDo = {}, tipoDe = Object.fromEntries(veiculos.map(v => [v.id, v.tipo])), cavaloSemDolly = new Set();
  conjuntos.filter(c => c.ativo).forEach(c => {
    const itens = c.conjunto_item || [];
    itens.forEach(i => { motoristaDo[i.veiculo_id] = c.motorista ? c.motorista.nome : ''; });
    if(!itens.some(i => tipoDe[i.veiculo_id] === 'dolly')) itens.filter(i => tipoDe[i.veiculo_id] === 'cavalo').forEach(i => cavaloSemDolly.add(i.veiculo_id));
  });
  // eixos que levantam: o que o escritório marcou, ou o padrão (igual a eixos_levantam_efetivo no banco)
  veiculos.forEach(v => { v.semDolly = cavaloSemDolly.has(v.id); atualizarLevantam(v); });
  // "unidades": cada conjunto ativo (na ordem do engate) e os veículos que não estão em conjunto
  const ativoPorId = Object.fromEntries(veiculos.filter(v => v.ativo).map(v => [v.id, v]));
  const unidades = [], noConjunto = new Set();
  conjuntos.filter(c => c.ativo).forEach(c => {
    const vs = [...(c.conjunto_item || [])].sort((a, b) => a.ordem - b.ordem).map(i => ativoPorId[i.veiculo_id]).filter(Boolean);
    if(!vs.length) return;
    vs.sort((a, b) => (b.tipo === 'cavalo') - (a.tipo === 'cavalo'));   // cavalo sempre na frente
    vs.forEach(v => noConjunto.add(v.id));
    unidades.push({ id: c.id, conjunto: vs.length > 1, veiculos: vs, motorista: c.motorista ? c.motorista.nome : '' });
  });
  Object.values(ativoPorId).filter(v => !noConjunto.has(v.id)).forEach(v => unidades.push({ id: v.id, conjunto: false, veiculos: [v], motorista: motoristaDo[v.id] || '' }));
  const unidadeDo = {};
  unidades.forEach(u => u.veiculos.forEach(v => { unidadeDo[v.id] = u; }));
  return { pneus, veiculos: veiculos.filter(v => v.ativo), todosVeiculos: veiculos, motoristaDo, unidades, unidadeDo,
    km: Object.fromEntries(kms.map(k => [k.veiculo_id, k])), carga: Object.fromEntries(cargas.map(c => [c.pneu_id, c])) };
}

// ---------- posições ----------
function eixosVeiculo(v){
  if(v.tipo === 'carreta' || v.tipo === 'dolly') return 2;   // sempre 2 eixos, conforme os documentos (Thiago, 04/11)
  if(v.eixos) return v.eixos;
  const m = /(\d)\s*E\b/i.exec(v.modelo || '');
  return m ? Number(m[1]) : (EIXOS_PADRAO[v.tipo] || 2);
}
// cavalo: 1º eixo simples (direção), os outros duplos; carreta e dolly: todos duplos
function eixosDoVeiculo(v){
  return [...Array(eixosVeiculo(v))].map((_, i) => {
    const e = i + 1, duplo = !(v.tipo === 'cavalo' && e === 1);
    return { eixo: e, duplo, esquerda: duplo ? [e + 'EE', e + 'EI'] : [e + 'E'], direita: duplo ? [e + 'DI', e + 'DE'] : [e + 'D'] };
  });
}
function posicoesVeiculo(v){ return [...eixosDoVeiculo(v).flatMap(x => [...x.esquerda, ...x.direita]), 'EST1']; }
function rotuloPosicao(p){
  if(!p) return '—';
  if(p.startsWith('EST')) return p === 'EST2' ? 'Estepe 2' : 'Estepe';
  const m = /^(\d)(E|D|EE|EI|DI|DE)$/.exec(p);
  if(!m) return p;
  return `Eixo ${m[1]} · ${{ E: 'esquerdo', D: 'direito', EE: 'esquerdo externo', EI: 'esquerdo interno', DI: 'direito interno', DE: 'direito externo' }[m[2]]}`;
}
// eixo que levanta = "12h" (suspenso quando vazio); os outros rodam sempre = "24h"
// Padrão (Thiago, 04/11): carreta e dolly levantam o 1º eixo (o da frente); cavalo não levanta no
// rodotrem, e no bitrem (conjunto sem dolly) levanta o eixo de trás. O escritório pode mudar no mapa.
function eixosLevantamPadrao(v, semDolly){
  if(v.tipo === 'carreta' || v.tipo === 'dolly') return [1];
  if(v.tipo === 'cavalo' && semDolly && eixosVeiculo(v) >= 3) return [eixosVeiculo(v)];
  return [];
}
function atualizarLevantam(v){ v.levantamPadrao = eixosLevantamPadrao(v, v.semDolly); v.levantam = v.eixos_levantam || v.levantamPadrao; }
const eixoLevanta = (v, eixo) => !!v && (v.levantam || v.eixos_levantam || []).includes(Number(eixo));
function rotuloPosicaoCompleto(p, v){
  if(!p || p.startsWith('EST')) return rotuloPosicao(p);
  return `${rotuloPosicao(p)} · ${eixoLevanta(v, p[0]) ? '12h (levanta)' : '24h'}`;
}

// ---------- contas ----------
function kmNaMontagemAtual(p, km){
  if(p.status !== 'em_uso' || p.km_montagem == null || String(p.posicao).startsWith('EST')) return 0;   // estepe não roda
  const k = km[p.veiculo_id];
  return k && k.km != null && Number(k.km) >= Number(p.km_montagem) ? Number(k.km) - Number(p.km_montagem) : 0;
}
// km que o pneu rodou de verdade: tira o que andou vazio com o eixo suspenso (eixo que levanta)
const kmVidaAtual = (p, dados) => Math.max(0, Number(p.km_vida) + kmNaMontagemAtual(p, dados.km) - Number((dados.carga[p.id] || {}).km_suspenso_vida || 0));
const kmTotalPneu = (p, dados) => Math.max(0, Number(p.km_rodado) + kmNaMontagemAtual(p, dados.km) - Number((dados.carga[p.id] || {}).km_suspenso || 0));
// mm gastos a cada 1.000 km na vida atual (precisa de uma medição com pelo menos 5.000 km rodados — antes disso o número oscila muito)
function desgastePneu(p){
  if(p.sulco_vida_inicio == null || p.sulco_atual_mm == null || !(Number(p.km_vida_medicao) >= 5000)) return null;
  const gasto = Number(p.sulco_vida_inicio) - Number(p.sulco_atual_mm);
  return gasto > 0 ? gasto / Number(p.km_vida_medicao) * 1000 : null;
}
// quantos km ainda roda até chegar no sulco de recapar
function kmAteRecapar(p){
  const d = desgastePneu(p);
  if(!d || p.sulco_atual_mm == null) return null;
  return Math.max(0, (Number(p.sulco_atual_mm) - SULCO_RECAPAR_MM) / d * 1000);
}
function textoVida(vida){ return Number(vida) === 0 ? 'Novo' : `${vida}ª recapagem`; }
function corSulco(mm){ return mm == null ? 'grey' : mm <= SULCO_LEGAL_MM ? 'red' : mm <= SULCO_RECAPAR_MM ? 'amber' : 'green'; }
function alertaPneu(p){
  const dias = (iso) => iso ? (Date.now() - new Date(iso).getTime()) / 86400000 : Infinity;
  if(p.status === 'em_uso'){
    if(p.sulco_atual_mm != null && p.sulco_atual_mm <= SULCO_LEGAL_MM) return ['red', 'Abaixo do limite legal'];
    if(p.sulco_atual_mm != null && p.sulco_atual_mm <= SULCO_RECAPAR_MM) return ['amber', 'Hora de recapar'];
    if(dias(p.medido_em || p.montado_em) > DIAS_SEM_MEDICAO) return ['blue', 'Medir o sulco'];
  }
  if(p.status === 'recapagem' && dias(p.ultimo_mov_em) > DIAS_NA_RECAPAGEM) return ['amber', `Na recapagem há ${Math.floor(dias(p.ultimo_mov_em))} dias`];
  return null;
}
const fmtKm = (n) => n == null ? '—' : numGraf(n, 0) + ' km';
const fmtMm = (n) => n == null ? '—' : numGraf(n, 1) + ' mm';
function ondeEsta(p, dados){
  if(p.status === 'em_uso'){ const v = dados.todosVeiculos.find(x => x.id === p.veiculo_id); return `${v ? v.placa : '?'} · ${rotuloPosicaoCompleto(p.posicao, v)}`; }
  return ROTULO_STATUS_PNEU[p.status];
}
function descricaoPneu(p){ return [p.marca, p.modelo, p.medida].filter(Boolean).join(' · '); }

// ---------------------------------------------------------------------
// ESCRITÓRIO — seção Pneus
// ---------------------------------------------------------------------
async function secaoPneus(el){
  const dados = await buscarDadosPneus();
  const recarregar = () => secaoPneus(el);
  const ctx = { dados, aoMudar: recarregar, gestao: ehGestaoPneus() };
  const ativos = dados.pneus.filter(p => p.status !== 'sucata');
  const comAlerta = ativos.filter(alertaPneu);
  const n = (s) => dados.pneus.filter(p => p.status === s).length;
  const ABAS = { veiculos: 'Por conjunto', pneus: 'Todos os pneus', marcas: 'Comparar marcas' };

  el.innerHTML = `
    <div class="kpi-row">
      ${kpi(n('em_uso'), 'Pneus montados')}
      ${kpi(n('estoque'), 'No estoque')}
      ${kpi(n('recapagem'), 'Na recapagem')}
      ${kpi(comAlerta.length, 'Precisam de atenção', comAlerta.length ? 'Sulco baixo, sem medição ou recapagem atrasada' : 'Nenhum', comAlerta.length ? 'ambar' : 'verde')}
    </div>
    ${dados.pneus.length ? '' : `<div class="o-banner" style="margin-bottom:14px;">${ic('pneu', 18)}<div class="txt"><b>Comece cadastrando os pneus</b>Abra um conjunto em "Por conjunto" e toque numa posição vazia para cadastrar o pneu que está montado ali (número de fogo, marca, km). Pneus do estoque se cadastram em "Todos os pneus". A partir daí cada troca, recapagem e medição de sulco forma o histórico de cada pneu e a comparação entre marcas.</div></div>`}
    <div class="doc-tabs" style="max-width:560px;">
      ${Object.entries(ABAS).map(([k, l]) => `<button class="${abaPneus === k ? 'active' : ''}" data-aba-pneus="${k}">${l}</button>`).join('')}
    </div>
    <div id="conteudoPneus"></div>`;
  el.querySelectorAll('[data-aba-pneus]').forEach(b => b.addEventListener('click', () => { abaPneus = b.dataset.abaPneus; secaoPneus(el); }));
  const caixa = document.getElementById('conteudoPneus');
  if(abaPneus === 'pneus') listaPneus(caixa, ctx);
  else if(abaPneus === 'marcas') compararMarcas(caixa, ctx);
  else listaVeiculosPneus(caixa, ctx);
}

function resumoVeiculoPneus(v, dados){
  const montados = dados.pneus.filter(p => p.status === 'em_uso' && p.veiculo_id === v.id);
  const posicoes = posicoesVeiculo(v);
  const alertas = montados.map(alertaPneu).filter(Boolean);
  const pior = alertas.find(a => a[0] === 'red') || alertas.find(a => a[0] === 'amber') || alertas[0];
  const rodando = montados.filter(p => !p.posicao.startsWith('EST'));
  // a medição mais antiga entre os pneus que rodam (é ela que diz se o caminhão está na vez de medir)
  const medicaoMaisAntiga = rodando.length ? rodando.map(p => p.medido_em || p.montado_em).sort()[0] : null;
  const diasSemMedir = medicaoMaisAntiga ? Math.floor((Date.now() - new Date(medicaoMaisAntiga).getTime()) / 86400000) : null;
  const estepe = montados.find(p => p.posicao.startsWith('EST')) || null;
  return { montados, rodando, posicoes, alertas, pior, medicaoMaisAntiga, diasSemMedir, estepe, naVezDeMedir: diasSemMedir != null && diasSemMedir > DIAS_SEM_MEDICAO };
}

// ---------- conjuntos (cavalo + carretas + dolly) ----------
function nomeComposicao(u){
  if(!u.conjunto) return tipoLabelGlobal[u.veiculos[0].tipo] || u.veiculos[0].tipo;
  const tipos = u.veiculos.map(v => v.tipo), carretas = tipos.filter(t => t === 'carreta').length;
  if(tipos.includes('dolly')) return 'Rodotrem';
  return { 1: 'Carreta simples', 2: 'Bitrem', 3: 'Tritrem' }[carretas] || 'Conjunto';
}
const placasUnidade = (u) => u.veiculos.map(v => v.placa).join(' + ');
function resumoUnidade(u, dados){
  const rs = u.veiculos.map(v => resumoVeiculoPneus(v, dados));
  const alertas = rs.flatMap(r => r.alertas);
  const pior = alertas.find(a => a[0] === 'red') || alertas.find(a => a[0] === 'amber') || alertas[0];
  const medicaoMaisAntiga = rs.map(r => r.medicaoMaisAntiga).filter(Boolean).sort()[0] || null;
  const diasSemMedir = medicaoMaisAntiga ? Math.floor((Date.now() - new Date(medicaoMaisAntiga).getTime()) / 86400000) : null;
  return { alertas, pior, medicaoMaisAntiga, diasSemMedir, naVezDeMedir: diasSemMedir != null && diasSemMedir > DIAS_SEM_MEDICAO,
    montados: rs.reduce((s, r) => s + r.montados.length, 0), rodando: rs.reduce((s, r) => s + r.rodando.length, 0),
    vagas: rs.reduce((s, r) => s + r.posicoes.filter(p => p !== 'EST1').length, 0),
    estepes: rs.filter(r => r.estepe).length, semEstepe: u.veiculos.filter((v, i) => !rs[i].estepe).map(v => v.placa) };
}
// caminhões na vez de medir o sulco (medição na garagem pelo escritório, 1 a 2 vezes por mês), o mais atrasado primeiro
const unidadesParaMedir = (dados) => dados.unidades.map(u => [u, resumoUnidade(u, dados)]).filter(([, r]) => r.naVezDeMedir).sort((a, b) => b[1].diasSemMedir - a[1].diasSemMedir);

function listaVeiculosPneus(caixa, ctx){
  const { dados } = ctx;
  const ordens = [
    ['placa', 'Placa do cavalo (A a Z)', porTexto(u => u.veiculos[0].placa)],
    ['alerta', 'Com alerta primeiro', (a, b) => resumoUnidade(b, dados).alertas.length - resumoUnidade(a, dados).alertas.length || porTexto(u => u.veiculos[0].placa)(a, b)],
    ['medicao', 'Medição mais antiga primeiro', (a, b) => porData(u => resumoUnidade(u, dados).medicaoMaisAntiga, 1)(a, b) || porTexto(u => u.veiculos[0].placa)(a, b)],
    ['tipo', 'Tipo (rodotrem, bitrem...)', (a, b) => porTexto(nomeComposicao)(a, b) || porTexto(u => u.veiculos[0].placa)(a, b)],
  ];
  const texto = (u) => [placasUnidade(u), nomeComposicao(u), u.motorista, ...u.veiculos.map(v => v.modelo)].join(' ');
  const medir = unidadesParaMedir(dados);
  caixa.innerHTML = `${medir.length ? `<div class="o-banner" style="margin-bottom:12px;">${ic('pneu', 18)}<div class="txt"><b>Medir o sulco (${medir.length} conjunto${medir.length === 1 ? '' : 's'})</b>
      Mais de ${DIAS_SEM_MEDICAO} dias sem medir — o mais atrasado primeiro. Abra e use "Medir todos do conjunto".
      <div class="pn-medir-lista">${medir.slice(0, 30).map(([u, r]) => `<button type="button" class="btn btn-outline btn-sm" data-medir-unid="${u.id}"><span class="mono">${esc(u.veiculos[0].placa)}</span> · ${r.diasSemMedir} dias</button>`).join('')}</div></div></div>` : ''}
    ${barraLista('pneus_veiculos', ordens, 'Pesquisar placa, modelo ou motorista')}<div id="listaVeicPneus"></div>`;
  const abrir = (id) => abrirMapaUnidade(dados.unidades.find(u => u.id === id), ctx);
  caixa.querySelectorAll('[data-medir-unid]').forEach(b => b.addEventListener('click', () => abrir(b.dataset.medirUnid)));
  const desenhar = () => {
    const visiveis = aplicarLista('pneus_veiculos', dados.unidades, ordens, texto);
    const lista = document.getElementById('listaVeicPneus');
    lista.innerHTML = painel(`Conjuntos e veículos (${visiveis.length})`, visiveis.length ? tabela(['Conjunto', 'Tipo', 'Motorista', 'Pneus montados', 'Estepes', 'Última medição', 'Km atual', 'Situação'],
      visiveis.map(u => {
        const r = resumoUnidade(u, dados), k = dados.km[u.veiculos[0].id];
        return `<tr class="clickable" data-unid-pneus="${u.id}">
          <td><b class="mono">${esc(u.veiculos[0].placa)}</b>${u.veiculos.length > 1 ? `<div class="sub mono">${u.veiculos.slice(1).map(v => esc(v.placa)).join(' + ')}</div>` : ''}</td>
          <td>${esc(nomeComposicao(u))}<div class="sub">${u.veiculos.reduce((s, v) => s + eixosVeiculo(v), 0)} eixos</div></td>
          <td class="sub">${esc(u.motorista || '—')}</td>
          <td class="mono">${r.rodando} / ${r.vagas}</td>
          <td>${!r.montados ? '<span class="sub">—</span>' : r.semEstepe.length ? `${badge('amber', `${r.estepes} de ${u.veiculos.length}`)}<div class="sub">sem: ${r.semEstepe.map(esc).join(', ')}</div>` : badge('green', `${r.estepes} de ${u.veiculos.length}`)}</td>
          <td class="sub">${r.medicaoMaisAntiga ? `${fmtData(r.medicaoMaisAntiga)}<div class="sub">${r.diasSemMedir} dia${r.diasSemMedir === 1 ? '' : 's'}</div>` : '—'}</td>
          <td class="mono sub">${k && k.km != null ? fmtKm(k.km) + (k.placa_cavalo ? `<div class="sub">do cavalo ${esc(k.placa_cavalo)}</div>` : '') : '—'}</td>
          <td>${r.pior ? badge(r.pior[0], r.alertas.length > 1 ? `${r.pior[1]} (+${r.alertas.length - 1})` : r.pior[1]) : r.montados ? badge('green', 'OK') : badge('grey', 'Sem pneus cadastrados')}</td></tr>`;
      })) : vazio('Nenhum conjunto encontrado.'));
    lista.querySelectorAll('[data-unid-pneus]').forEach(tr => tr.addEventListener('click', () => abrir(tr.dataset.unidPneus)));
  };
  desenhar();
  ligarBarraLista(caixa, 'pneus_veiculos', desenhar);
}

function listaPneus(caixa, ctx){
  const { dados } = ctx;
  const FILTROS = {
    todos: ['Todos (menos sucata)', p => p.status !== 'sucata'], em_uso: ['Montados', p => p.status === 'em_uso'], estoque: ['Estoque', p => p.status === 'estoque'],
    recapagem: ['Recapagem', p => p.status === 'recapagem'], alerta: ['Atenção', p => !!alertaPneu(p)], sucata: ['Sucata', p => p.status === 'sucata'],
  };
  const custo1000 = (p) => { const k = kmTotalPneu(p, dados); return k >= 1000 ? Number(p.custo_total) / k * 1000 : null; };
  const ordens = [
    ['fogo', 'Nº de fogo', (a, b) => porTexto(p => p.numero_fogo.padStart(12, '0'))(a, b)],
    ['sulco', 'Menor sulco primeiro', (a, b) => porNumero(p => p.sulco_atual_mm == null ? null : Number(p.sulco_atual_mm))(a, b)],
    ['km', 'Mais km rodados', (a, b) => kmTotalPneu(b, dados) - kmTotalPneu(a, dados)],
    ['marca', 'Marca de A a Z', (a, b) => porTexto(descricaoPneu)(a, b)],
    ['onde', 'Onde está', (a, b) => porTexto(p => ondeEsta(p, dados))(a, b)],
  ];
  const texto = (p) => [p.numero_fogo, descricaoPneu(p), ondeEsta(p, dados), ROTULO_STATUS_PNEU[p.status], textoVida(p.vida), p.dot].join(' ');
  const doFiltro = dados.pneus.filter(FILTROS[filtroPneus][1]);
  caixa.innerHTML = `
    <div class="doc-tabs" style="max-width:760px;">${Object.entries(FILTROS).map(([k, [l, f]]) => `<button class="${filtroPneus === k ? 'active' : ''}" data-filtro-pneus="${k}">${l} (${dados.pneus.filter(f).length})</button>`).join('')}</div>
    ${barraLista('pneus_lista', ordens, 'Pesquisar nº de fogo, marca, medida ou placa')}<div id="listaPneusTab"></div>`;
  caixa.querySelectorAll('[data-filtro-pneus]').forEach(b => b.addEventListener('click', () => { filtroPneus = b.dataset.filtroPneus; listaPneus(caixa, ctx); }));
  let visiveis = [];
  const desenhar = () => {
    visiveis = aplicarLista('pneus_lista', doFiltro, ordens, texto);
    const lista = document.getElementById('listaPneusTab');
    lista.innerHTML = painel(`Pneus (${visiveis.length})`, visiveis.length ? tabela(['Nº de fogo', 'Pneu', 'Vida', 'Onde está', 'Sulco', 'Km (vida / total)', 'R$ / 1.000 km', ''],
      visiveis.slice(0, 500).map(p => { const a = alertaPneu(p), c = custo1000(p); return `<tr class="clickable" data-pneu="${p.id}">
        <td class="mono"><b>${esc(p.numero_fogo)}</b></td>
        <td>${esc(p.marca)}${p.modelo ? ' ' + esc(p.modelo) : ''}<div class="sub">${esc([p.medida, p.aplicacao && ROTULO_APLICACAO[p.aplicacao]].filter(Boolean).join(' · ') || '—')}</div></td>
        <td class="sub">${textoVida(p.vida)}</td>
        <td>${p.status === 'em_uso' ? esc(ondeEsta(p, dados)) : badge(COR_STATUS_PNEU[p.status], ROTULO_STATUS_PNEU[p.status])}</td>
        <td>${p.sulco_atual_mm != null ? badge(corSulco(Number(p.sulco_atual_mm)), fmtMm(p.sulco_atual_mm)) : '<span class="sub">—</span>'}</td>
        <td class="mono sub">${numGraf(kmVidaAtual(p, dados), 0)} / ${numGraf(kmTotalPneu(p, dados), 0)}</td>
        <td class="mono sub">${c == null ? '—' : fmtReais(c)}</td>
        <td>${a ? badge(a[0], a[1]) : ''}</td></tr>`; }))
      + (visiveis.length > 500 ? '<div class="l2" style="padding:10px 18px;">Mostrando os 500 primeiros — use a pesquisa.</div>' : '')
      : vazio(dados.pneus.length ? 'Nenhum pneu neste filtro.' : 'Nenhum pneu cadastrado ainda.'),
      `<button class="btn btn-primary btn-sm" id="btnNovoPneu">${ic('plus', 15)} Cadastrar pneus</button>${visiveis.length ? botaoExportar('btnCsvPneus') : ''}`);
    lista.querySelectorAll('[data-pneu]').forEach(tr => tr.addEventListener('click', () => abrirPneu(dados.pneus.find(p => p.id === tr.dataset.pneu), ctx)));
    document.getElementById('btnNovoPneu').addEventListener('click', () => abrirCadastroPneu(null, ctx));
    const csv = document.getElementById('btnCsvPneus');
    if(csv) csv.addEventListener('click', () => baixarCSV('pneus', ['Nº de fogo', 'Marca', 'Modelo', 'Medida', 'Aplicação', 'DOT', 'Vida', 'Situação', 'Veículo', 'Posição', 'Sulco (mm)', 'Medido em', 'Km na vida atual', 'Km total', 'Custo total (R$)', 'R$ por 1.000 km', 'Compra', 'Fornecedor'],
      visiveis.map(p => { const v = dados.todosVeiculos.find(x => x.id === p.veiculo_id), c = custo1000(p);
        return [p.numero_fogo, p.marca, p.modelo || '', p.medida || '', p.aplicacao ? ROTULO_APLICACAO[p.aplicacao] : '', p.dot || '', textoVida(p.vida), ROTULO_STATUS_PNEU[p.status],
          v ? v.placa : '', p.posicao ? rotuloPosicao(p.posicao) : '', p.sulco_atual_mm ?? '', p.medido_em ? fmtData(p.medido_em) : '',
          Math.round(kmVidaAtual(p, dados)), Math.round(kmTotalPneu(p, dados)), numGraf(p.custo_total, 2), c == null ? '' : numGraf(c, 2),
          p.data_compra ? fmtData(p.data_compra) : '', p.fornecedor || '']; })));
  };
  desenhar();
  ligarBarraLista(caixa, 'pneus_lista', desenhar);
}

// Comparação entre marcas (ou marca + modelo), dentro da mesma aplicação de preferência
function compararMarcas(caixa, ctx){
  const { dados } = ctx;
  const doFiltro = dados.pneus.filter(p => !aplicacaoMarcas || p.aplicacao === aplicacaoMarcas);
  const grupos = {};
  doFiltro.forEach(p => { const k = agruparModelo ? `${p.marca} ${p.modelo || ''}`.trim() : p.marca; (grupos[k] = grupos[k] || []).push(p); });
  const media = (l) => l.length ? l.reduce((s, x) => s + x, 0) / l.length : null;
  const linhas = Object.entries(grupos).map(([nome, lista]) => {
    const vidas = lista.flatMap(p => (p.vidas_concluidas || []).map(v => ({ ...v, km: Number(v.km) })));
    const vidasNovas = vidas.filter(v => Number(v.vida) === 0 && v.km > 0);
    const desgastes = lista.map(desgastePneu).filter(d => d != null);
    const comKm = lista.filter(p => kmTotalPneu(p, dados) >= 10000);
    const kmSoma = comKm.reduce((s, p) => s + kmTotalPneu(p, dados), 0);
    const custoSoma = comKm.reduce((s, p) => s + Number(p.custo_total), 0);
    const terminados = lista.filter(p => p.status === 'sucata');
    const carg = lista.map(p => dados.carga[p.id]).filter(Boolean);
    const kmCarregado = carg.reduce((s, c) => s + Number(c.km_carregado), 0), kmVazio = carg.reduce((s, c) => s + Number(c.km_vazio), 0);
    return { nome, n: lista.length,
      pctCarregado: kmCarregado + kmVazio >= 1000 ? kmCarregado / (kmCarregado + kmVazio) * 100 : null, nCarga: carg.length,
      kmVida: media(vidas.filter(v => v.km > 0).map(v => v.km)), nVidas: vidas.filter(v => v.km > 0).length,
      kmNovo: media(vidasNovas.map(v => v.km)), nNovo: vidasNovas.length,
      desgaste: media(desgastes), nDesgaste: desgastes.length,
      custo1000: kmSoma > 0 ? custoSoma / kmSoma * 1000 : null, nCusto: comKm.length,
      recapagens: terminados.length ? media(terminados.map(p => Number(p.vida))) : null, nTerminados: terminados.length,
      semRecapar: terminados.length ? terminados.filter(p => Number(p.vida) === 0).length / terminados.length * 100 : null };
  }).sort((a, b) => (a.custo1000 ?? Infinity) - (b.custo1000 ?? Infinity) || b.n - a.n);
  const cel = (v, txt, nAmostra) => v == null ? '<span class="sub">—</span>' : `${txt}<div class="sub">${nAmostra} ${nAmostra === 1 ? 'amostra' : 'amostras'}</div>`;
  const comCusto = linhas.filter(l => l.custo1000 != null);
  caixa.innerHTML = `
    <div class="o-banner" style="margin-bottom:12px; color:var(--ink-700);">${ic('chart', 18)}<div class="txt"><b>Como ler</b>
      <strong>Custo por 1.000 km</strong> (compra + recapagens + consertos ÷ km rodados) é o número que decide qual marca compensa — quanto menor, melhor. Conta só pneus com mais de 10.000 km.
      <strong>Desgaste</strong> é quantos mm de sulco o pneu perde a cada 1.000 km — aparece cedo, já nas primeiras medições. <strong>Km por vida</strong> e <strong>recapagens</strong> ficam confiáveis quando os pneus completam vidas (recapagem ou sucata).
      Compare pneus da mesma aplicação: direcional gasta diferente de tração. <strong>% carregado</strong> mostra quanto dos km foi com carga — pneu que roda mais carregado gasta mais, então leve isso em conta.</div></div>
    <div class="barra-lista">
      <label class="barra-ordem"><span>Aplicação:</span><select id="pnAplicacao"><option value="">Todas</option>${Object.entries(ROTULO_APLICACAO).map(([k, l]) => `<option value="${k}" ${aplicacaoMarcas === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="barra-ordem"><span>Agrupar por:</span><select id="pnAgrupar"><option value="marca">Marca</option><option value="modelo" ${agruparModelo ? 'selected' : ''}>Marca e modelo</option></select></label>
    </div>
    ${comCusto.length > 1 ? painel('Custo por 1.000 km', `<div style="padding:8px 14px 4px;">${graficoBarras(comCusto.slice(0, 12).map((l, i) => ({ rotulo: l.nome.slice(0, 14), valor: l.custo1000, destaque: i === 0, dica: `${l.nome}: ${fmtReais(l.custo1000)} por 1.000 km (${l.nCusto} pneus)` })), { casas: 2, aria: 'Custo por 1.000 km de cada marca' })}</div>`) : ''}
    ${painel(`${agruparModelo ? 'Marcas e modelos' : 'Marcas'} (${linhas.length})`, linhas.length ? tabela(['', 'Pneus', 'R$ / 1.000 km', 'Desgaste (mm / 1.000 km)', '% carregado', 'Km por vida', 'Km da 1ª vida (novo)', 'Recapagens até a sucata', 'Sucata sem recapar'],
      linhas.map(l => `<tr><td><b>${esc(l.nome)}</b></td><td class="mono">${l.n}</td>
        <td class="mono">${cel(l.custo1000, l.custo1000 != null ? fmtReais(l.custo1000) : '', l.nCusto)}</td>
        <td class="mono">${cel(l.desgaste, numGraf(l.desgaste, 2), l.nDesgaste)}</td>
        <td class="mono">${cel(l.pctCarregado, numGraf(l.pctCarregado, 0) + '%', l.nCarga)}</td>
        <td class="mono">${cel(l.kmVida, fmtKm(l.kmVida), l.nVidas)}</td>
        <td class="mono">${cel(l.kmNovo, fmtKm(l.kmNovo), l.nNovo)}</td>
        <td class="mono">${cel(l.recapagens, numGraf(l.recapagens, 1), l.nTerminados)}</td>
        <td class="mono">${cel(l.semRecapar, numGraf(l.semRecapar, 0) + '%', l.nTerminados)}</td></tr>`))
      : vazio('Cadastre pneus e lance as trocas e medições para comparar as marcas.'),
      linhas.length ? botaoExportar('btnCsvMarcas') : '')}`;
  ligarDicasGraficos(caixa);
  document.getElementById('pnAplicacao').addEventListener('change', (e) => { aplicacaoMarcas = e.target.value; compararMarcas(caixa, ctx); });
  document.getElementById('pnAgrupar').addEventListener('change', (e) => { agruparModelo = e.target.value === 'modelo'; compararMarcas(caixa, ctx); });
  const csv = document.getElementById('btnCsvMarcas');
  if(csv) csv.addEventListener('click', () => baixarCSV('pneus_por_marca', ['Marca', 'Pneus', 'R$ por 1.000 km', 'Desgaste mm por 1.000 km', '% carregado', 'Km por vida', 'Km da 1ª vida', 'Recapagens até a sucata', '% sucata sem recapar'],
    linhas.map(l => [l.nome, l.n, l.custo1000 == null ? '' : numGraf(l.custo1000, 2), l.desgaste == null ? '' : numGraf(l.desgaste, 2), l.pctCarregado == null ? '' : numGraf(l.pctCarregado, 0), l.kmVida == null ? '' : Math.round(l.kmVida),
      l.kmNovo == null ? '' : Math.round(l.kmNovo), l.recapagens == null ? '' : numGraf(l.recapagens, 1), l.semRecapar == null ? '' : numGraf(l.semRecapar, 0)])));
}

// ---------------------------------------------------------------------
// Mapa dos pneus (escritório e mecânico): o conjunto inteiro numa tela —
// cavalo, carretas e dolly na ordem do engate. Veículo fora de conjunto aparece sozinho.
// ---------------------------------------------------------------------
function abrirMapaVeiculo(v, ctx){
  const u = ctx.dados.unidadeDo[v.id] || { id: v.id, conjunto: false, veiculos: [v], motorista: ctx.dados.motoristaDo[v.id] || '' };
  abrirMapaUnidade(u, ctx);
}

function blocoMapaVeiculo(v, ctx, primeiro){
  const { dados } = ctx;
  const montados = dados.pneus.filter(p => p.status === 'em_uso' && p.veiculo_id === v.id);
  const naPos = Object.fromEntries(montados.map(p => [p.posicao, p]));
  const posicoes = posicoesVeiculo(v);
  const foraDoMapa = montados.filter(p => !posicoes.includes(p.posicao));
  const botao = (pos) => {
    const p = naPos[pos];
    if(!p) return `<button type="button" class="pn-pneu vazio" data-pos-vazia="${pos}" data-veic="${v.id}" title="${esc(v.placa)} · ${esc(rotuloPosicao(pos))} — vazio">${ic('plus', 16)}</button>`;
    const a = alertaPneu(p);
    return `<button type="button" class="pn-pneu cor-${a ? a[0] : corSulco(p.sulco_atual_mm == null ? null : Number(p.sulco_atual_mm))}" data-pneu-mapa="${p.id}" data-veic="${v.id}" title="${esc(v.placa)} · ${esc(rotuloPosicao(pos))}">
      <b>${esc(p.numero_fogo)}</b><span>${esc(p.marca.slice(0, 10))}</span><span>${p.sulco_atual_mm != null ? numGraf(p.sulco_atual_mm, 1) + ' mm' : '— mm'}</span></button>`;
  };
  const padrao = v.tipo === 'cavalo' ? (v.semDolly ? 'bitrem: levanta o de trás' : 'não levanta') : 'levanta o da frente';
  return `<div class="pn-veic">
    <div class="pn-veic-tit"><b class="mono">${esc(v.placa)}</b><span>${esc(tipoLabelGlobal[v.tipo] || v.tipo)} · ${eixosVeiculo(v)} eixos</span>
      ${ctx.gestao && v.tipo === 'cavalo' ? `<select data-eixos-veic="${v.id}" title="Quantidade de eixos" style="width:auto; margin-left:auto;">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<option value="${n}" ${n === eixosVeiculo(v) ? 'selected' : ''}>${n} eixo${n > 1 ? 's' : ''}</option>`).join('')}</select>` : ''}</div>
    <div class="pn-mapa">
      ${primeiro ? '<div class="pn-frente">frente</div>' : ''}
      ${eixosDoVeiculo(v).map(x => `<div class="pn-eixo">
        <div class="pn-lado">${x.esquerda.map(botao).join('')}</div>
        <div class="pn-barra${eixoLevanta(v, x.eixo) ? ' levanta' : ''}"><span title="${eixoLevanta(v, x.eixo) ? 'Eixo que levanta (12h): vazio fica suspenso' : 'Eixo fixo (24h)'}">${x.eixo}${eixoLevanta(v, x.eixo) ? ' ↑' : ''}</span></div>
        <div class="pn-lado">${x.direita.map(botao).join('')}</div></div>`).join('')}
      <div class="pn-estepe"><span>Estepe</span>${botao('EST1')}</div>
    </div>
    ${foraDoMapa.length ? `<div class="l2" style="margin-top:6px;">Fora do desenho (o nº de eixos mudou?): ${foraDoMapa.map(p => `<a href="#" data-pneu-mapa="${p.id}" data-veic="${v.id}">${esc(p.numero_fogo)} (${esc(rotuloPosicao(p.posicao))})</a>`).join(', ')}</div>` : ''}
    ${ctx.gestao ? `<div class="pn-levanta"><span>Levantam (12h):</span>${eixosDoVeiculo(v).map(x => x.eixo).filter(e => !(v.tipo === 'cavalo' && e === 1)).map(e => `<label><input type="checkbox" data-eixo-levanta="${e}" data-veic="${v.id}" ${eixoLevanta(v, e) ? 'checked' : ''}> ${e}º</label>`).join('')}
      <span class="sub">${v.eixos_levantam ? `marcado pelo escritório · <a href="#" data-levanta-padrao="${v.id}">voltar ao padrão</a>` : `padrão: ${padrao}`}</span></div>` : ''}
  </div>`;
}

function abrirMapaUnidade(u, ctx){
  const { dados } = ctx;
  const cav = u.veiculos[0], k = dados.km[cav.id];
  const montados = dados.pneus.filter(p => p.status === 'em_uso' && u.veiculos.some(v => v.id === p.veiculo_id));
  const algumLevanta = u.veiculos.some(v => (v.levantam || []).length);
  abrirModal(u.conjunto ? `${nomeComposicao(u)} — pneus` : `${cav.placa} — pneus`, `
    <div class="l2" style="margin-bottom:10px;">${u.conjunto ? `<span class="mono">${esc(placasUnidade(u))}</span> · ` : `${esc(tipoLabelGlobal[cav.tipo] || cav.tipo)} · `}${u.motorista ? esc(u.motorista) + ' · ' : ''}km atual: <b>${k && k.km != null ? fmtKm(k.km) : 'sem km'}</b>${k && k.placa_cavalo ? ` (do cavalo ${esc(k.placa_cavalo)})` : ''}</div>
    ${montados.length ? `<div class="o-acoes" style="margin-bottom:10px;"><button type="button" class="btn btn-primary btn-sm" id="btnMedirTodos">${ic('checksq', 14)} Medir todos${u.conjunto ? ' do conjunto' : ''}</button></div>` : ''}
    <div class="pn-conjunto">${u.veiculos.map((v, i) => blocoMapaVeiculo(v, ctx, i === 0)).join('<div class="pn-engate" aria-hidden="true"></div>')}</div>
    <div class="pn-legenda"><span class="cor-green"></span>sulco bom <span class="cor-amber"></span>recapar (≤ ${SULCO_RECAPAR_MM} mm) <span class="cor-red"></span>abaixo do limite legal (${numGraf(SULCO_LEGAL_MM, 1)} mm) <span class="cor-blue"></span>medir o sulco${algumLevanta ? ' · <b>↑</b> eixo que levanta (12h): só conta km carregado' : ''}</div>
    <div class="l2" style="margin-top:8px;">Toque num pneu para medir, retirar ou trocar de posição; numa posição vazia (+) para montar.</div>`);
  const modal = document.getElementById('modalGenerico');
  const veic = (id) => u.veiculos.find(v => v.id === id);
  modal.querySelectorAll('[data-pneu-mapa]').forEach(b => b.addEventListener('click', (e) => { e.preventDefault(); abrirPneu(dados.pneus.find(p => p.id === b.dataset.pneuMapa), ctx, veic(b.dataset.veic)); }));
  modal.querySelectorAll('[data-pos-vazia]').forEach(b => b.addEventListener('click', () => abrirMontar(veic(b.dataset.veic), b.dataset.posVazia, ctx)));
  const medir = document.getElementById('btnMedirTodos');
  if(medir) medir.addEventListener('click', () => abrirMedirTodos(u, montados, ctx));
  modal.querySelectorAll('[data-eixos-veic]').forEach(s => s.addEventListener('change', async () => {
    const v = veic(s.dataset.eixosVeic);
    const { error } = await sb.from('veiculo').update({ eixos: Number(s.value) }).eq('id', v.id);
    if(error){ alert('Não consegui salvar: ' + error.message); return; }
    v.eixos = Number(s.value); atualizarLevantam(v);
    abrirMapaUnidade(u, ctx);
  }));
  modal.querySelectorAll('[data-eixo-levanta]').forEach(c => c.addEventListener('change', () => {
    const novos = [...modal.querySelectorAll(`[data-eixo-levanta][data-veic="${c.dataset.veic}"]:checked`)].map(x => Number(x.dataset.eixoLevanta));
    salvarLevanta(veic(c.dataset.veic), novos, () => { c.checked = !c.checked; });
  }));
  modal.querySelectorAll('[data-levanta-padrao]').forEach(a => a.addEventListener('click', (e) => { e.preventDefault(); salvarLevanta(veic(a.dataset.levantaPadrao), null); }));
  async function salvarLevanta(v, novos, desfazer){
    const { error } = await sb.from('veiculo').update({ eixos_levantam: novos }).eq('id', v.id);
    if(error){ alert('Não consegui salvar: ' + error.message); if(desfazer) desfazer(); return; }
    v.eixos_levantam = novos; atualizarLevantam(v);
    mostrarToast('Eixos que levantam salvos — o km dos pneus é recalculado');
    abrirMapaUnidade(u, ctx);
    ctx.aoMudar && ctx.aoMudar();
  }
}

// ---------------------------------------------------------------------
// Ficha do pneu: dados, ações e histórico
// ---------------------------------------------------------------------
async function abrirPneu(p, ctx, veiculoMapa = null){
  const { dados } = ctx;
  const d = desgastePneu(p), falta = kmAteRecapar(p), a = alertaPneu(p);
  const linha = (rot, val) => `<div class="pn-linha"><span>${rot}</span><b>${val}</b></div>`;
  const acoes = {
    em_uso: [['inspecao', 'Medir sulco / pressão', 'btn-primary'], ['retirar', 'Retirar do veículo'], ['rodizio', 'Trocar de posição'], ['conserto', 'Lançar conserto']],
    estoque: [['montar', 'Montar num veículo', 'btn-primary'], ['envio_recapagem', 'Mandar para recapagem'], ['inspecao', 'Medir sulco'], ['conserto', 'Lançar conserto'], ['sucata', 'Mandar para a sucata']],
    recapagem: [['retorno_recapagem', 'Voltou da recapagem', 'btn-primary'], ['sucata', 'Recapadora recusou (sucata)']],
    sucata: [],
  }[p.status];
  abrirModal(`Pneu ${p.numero_fogo}`, `
    <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:10px;">${badge(COR_STATUS_PNEU[p.status], ROTULO_STATUS_PNEU[p.status])} ${badge('grey', textoVida(p.vida))} ${a ? badge(a[0], a[1]) : ''}</div>
    <div class="pn-ficha">
      ${linha('Pneu', esc(descricaoPneu(p)) || '—')}
      ${p.aplicacao ? linha('Aplicação', ROTULO_APLICACAO[p.aplicacao]) : ''}
      ${p.status === 'em_uso' ? linha('Onde está', `${esc(ondeEsta(p, dados))}<div class="sub">desde ${fmtData(p.montado_em)}${p.km_montagem != null ? ' · montado com ' + fmtKm(p.km_montagem) : ''}</div>`) : ''}
      ${linha('Sulco', p.sulco_atual_mm != null ? `${fmtMm(p.sulco_atual_mm)}<div class="sub">${p.medido_em ? 'medido em ' + fmtData(p.medido_em) : 'na compra'}${p.sulco_vida_inicio != null ? ` · começou a vida com ${fmtMm(p.sulco_vida_inicio)}` : ''}</div>` : 'nunca medido')}
      ${linha('Km nesta vida', fmtKm(kmVidaAtual(p, dados)))}
      ${linha('Km total', fmtKm(kmTotalPneu(p, dados)))}
      ${(() => { const c = dados.carga[p.id]; if(!c || !(Number(c.km_carregado) + Number(c.km_vazio) > 0)) return '';
        const tot = Number(c.km_carregado) + Number(c.km_vazio);
        return linha('Carregado / vazio', `${fmtKm(c.km_carregado)} carregado · ${fmtKm(c.km_vazio)} vazio<div class="sub">${numGraf(Number(c.km_carregado) / tot * 100, 0)}% carregado (viagem do MDF-e até a descarga; km pelos abastecimentos do cavalo)${Number(c.km_suspenso) > 0 ? ` · ${fmtKm(c.km_suspenso)} suspenso no eixo que levanta (não conta)` : ''}</div>`); })()}
      ${d != null ? linha('Desgaste', `${numGraf(d, 2)} mm a cada 1.000 km${falta != null && p.status === 'em_uso' ? `<div class="sub">${falta > 0 ? `dá para rodar ~${fmtKm(falta)} até ${SULCO_RECAPAR_MM} mm (recapar)` : 'já chegou no ponto de recapar'}</div>` : ''}`) : ''}
      ${linha('Custo até agora', `${fmtReais(p.custo_total)}${kmTotalPneu(p, dados) >= 1000 ? `<div class="sub">${fmtReais(Number(p.custo_total) / kmTotalPneu(p, dados) * 1000)} por 1.000 km</div>` : ''}`)}
      ${p.data_compra || p.fornecedor ? linha('Compra', [p.data_compra && fmtData(p.data_compra), p.valor_compra != null && fmtReais(p.valor_compra), p.fornecedor && esc(p.fornecedor), p.nota_numero && 'nota ' + esc(p.nota_numero)].filter(Boolean).join(' · ')) : ''}
      ${p.dot ? linha('DOT (fabricação)', esc(p.dot)) : ''}
      ${p.observacao ? linha('Observação', esc(p.observacao)) : ''}
    </div>
    ${acoes.length ? `<div class="pn-acoes">${acoes.map(([k, l, cls]) => `<button type="button" class="btn ${cls || 'btn-outline'} btn-sm" data-acao-pneu="${k}">${l}</button>`).join('')}</div>` : ''}
    <div class="section-label" style="margin:16px 0 6px;">Histórico</div>
    <div id="pnHistorico" class="l2">Carregando...</div>
    ${ctx.gestao ? `<div class="o-acoes" style="margin-top:12px;"><button type="button" class="btn btn-outline btn-sm" id="btnEditarPneu">Editar cadastro</button>
      ${veiculoMapa ? `<button type="button" class="btn btn-outline btn-sm" id="btnVoltarMapa">Voltar ao desenho</button>` : ''}</div>`
      : veiculoMapa ? `<div class="o-acoes" style="margin-top:12px;"><button type="button" class="btn btn-outline btn-sm" id="btnVoltarMapa">Voltar ao desenho</button></div>` : ''}`);
  document.querySelectorAll('#modalGenerico [data-acao-pneu]').forEach(b => b.addEventListener('click', () => {
    const acao = b.dataset.acaoPneu;
    if(acao === 'montar') return abrirMontar(null, null, ctx, p);
    if(acao === 'retirar') return abrirRetirar(p, ctx);
    if(acao === 'rodizio') return abrirRodizio(p, ctx);
    abrirMovimentoPneu(acao, p, ctx);
  }));
  const editar = document.getElementById('btnEditarPneu');
  if(editar) editar.addEventListener('click', () => abrirCadastroPneu(p, ctx));
  const voltar = document.getElementById('btnVoltarMapa');
  if(voltar) voltar.addEventListener('click', () => abrirMapaVeiculo(veiculoMapa, ctx));

  const { data: movs, error } = await sb.from('pneu_movimento').select('id, tipo, data, veiculo_id, posicao, km, sulco_mm, pressao_psi, valor, fornecedor, banda, motivo, observacao, criado_por:criado_por(nome)')
    .eq('pneu_id', p.id).order('data', { ascending: false }).order('criado_em', { ascending: false });
  const caixa = document.getElementById('pnHistorico');
  if(!caixa) return;
  if(error){ caixa.textContent = 'Não consegui carregar o histórico: ' + error.message; return; }
  const placa = (id) => { const v = dados.todosVeiculos.find(x => x.id === id); return v ? v.placa : ''; };
  caixa.innerHTML = movs.length ? `<div class="pn-hist">${movs.map((m, i) => `<div class="pn-hist-item">
      <div class="pn-hist-data">${fmtData(m.data)}</div>
      <div><b>${ROTULO_MOV_PNEU[m.tipo]}</b>${m.veiculo_id && ['montagem', 'desmontagem'].includes(m.tipo) ? ` · ${esc(placa(m.veiculo_id))} ${esc(rotuloPosicao(m.posicao))}` : ''}
        <div class="sub">${[m.km != null && fmtKm(m.km), m.sulco_mm != null && 'sulco ' + fmtMm(m.sulco_mm), m.pressao_psi != null && numGraf(m.pressao_psi, 0) + ' psi',
          m.valor != null && fmtReais(m.valor), m.fornecedor && esc(m.fornecedor), m.banda && 'banda ' + esc(m.banda), m.motivo && esc(m.motivo), m.observacao && esc(m.observacao),
          m.criado_por && 'por ' + esc(m.criado_por.nome)].filter(Boolean).join(' · ')}</div></div>
      ${i === 0 && ctx.gestao ? `<button type="button" class="btn-small" id="btnDesfazerMov" title="Apagar este movimento">Desfazer</button>` : ''}</div>`).join('')}</div>`
    : 'Nenhum movimento ainda.';
  const desfazer = document.getElementById('btnDesfazerMov');
  if(desfazer) desfazer.addEventListener('click', async () => {
    if(!confirm(`Desfazer "${ROTULO_MOV_PNEU[movs[0].tipo]}" de ${fmtData(movs[0].data)}? A situação do pneu volta a ser a de antes.`)) return;
    const { error: e2 } = await sb.from('pneu_movimento').delete().eq('id', movs[0].id);
    if(e2){ alert('Não consegui desfazer: ' + e2.message); return; }
    fecharModal(); mostrarToast('Movimento desfeito'); ctx.aoMudar();
  });
}

// ---------- campos comuns dos formulários ----------
function campoKmPneu(veiculo, ctx, id = 'pnKm'){
  const k = veiculo ? ctx.dados.km[veiculo.id] : null;
  return `<div class="field-row" style="margin:0;"><label for="${id}">Km do veículo${k && k.placa_cavalo ? ` (cavalo ${esc(k.placa_cavalo)})` : ''}</label>
    <input type="text" inputmode="numeric" id="${id}" value="${k && k.km != null ? Math.round(k.km) : ''}" placeholder="odômetro"></div>`;
}
function campoDataPneu(){ return `<div class="field-row" style="margin:0;"><label for="pnData">Data</label><input type="datetime-local" id="pnData" value="${paraCampoDataHora(new Date().toISOString())}" required></div>`; }
function lerCampoNumero(id, { min = 0, max = Infinity, nome = 'valor' } = {}){
  const el = document.getElementById(id);
  if(!el) return { valor: null };
  const n = numeroOuNulo(el.value);
  if(n == null) return { valor: null };
  if(isNaN(n) || n < min || n > max) return { erro: `Confira o ${nome}.` };
  return { valor: n };
}
function lerDataPneu(){
  const iso = doCampoDataHora(document.getElementById('pnData').value);
  if(!iso || new Date(iso) > new Date(Date.now() + 5 * 60000)) return { erro: 'Confira a data (não pode ser no futuro).' };
  return { valor: iso };
}
async function inserirMovimentos(lista){
  for(const m of lista){
    const { error } = await sb.from('pneu_movimento').insert({ transportadora_id: usuarioAtual.transportadora_id, ...m });
    if(error) return error.message;
  }
  return null;
}
function ligarFormPneu(formId, montar, mensagem, ctx){
  document.getElementById(formId).addEventListener('submit', async (e) => {
    e.preventDefault();
    const erro = e.target.querySelector('.err'), btn = e.target.querySelector('button[type="submit"]');
    erro.textContent = '';
    const r = montar();
    if(r.erro){ erro.textContent = r.erro; return; }
    btn.disabled = true; const txt = btn.textContent; btn.textContent = 'Salvando...';
    const falha = await inserirMovimentos(r.movimentos);
    if(falha){ erro.textContent = 'Não consegui salvar: ' + falha; btn.disabled = false; btn.textContent = txt; return; }
    fecharModal(); mostrarToast(mensagem); ctx.aoMudar();
  });
}

// ---------- montar (de uma posição vazia, ou de um pneu do estoque) ----------
function abrirMontar(veiculo, posicao, ctx, pneu = null){
  const { dados } = ctx;
  const estoque = dados.pneus.filter(p => p.status === 'estoque').sort(porTexto(p => p.numero_fogo.padStart(12, '0')));
  const veiculos = dados.veiculos;
  const livres = (v) => { const ocup = new Set(dados.pneus.filter(p => p.status === 'em_uso' && p.veiculo_id === v.id).map(p => p.posicao)); return posicoesVeiculo(v).filter(p => !ocup.has(p)); };
  if(!pneu && !estoque.length){
    abrirModal(`${veiculo.placa} — ${rotuloPosicao(posicao)}`, `<div class="l2" style="margin-bottom:12px;">Nenhum pneu no estoque. Cadastre o pneu que está (ou vai ser) montado aqui.</div>
      <button type="button" id="btnCadastrarAqui">${ic('plus', 15)} Cadastrar pneu nesta posição</button>`);
    document.getElementById('btnCadastrarAqui').addEventListener('click', () => abrirCadastroPneu(null, ctx, { veiculo, posicao }));
    return;
  }
  const v0 = veiculo || veiculos[0];
  abrirModal(pneu ? `Montar o pneu ${pneu.numero_fogo}` : `${veiculo.placa} — ${rotuloPosicao(posicao)}`, `
    <form id="formMontar">
      ${pneu ? '' : `<div class="field-row" style="margin:0;"><label for="pnPneu">Pneu do estoque</label>
        <select id="pnPneu" required><option value="">Escolha</option>${estoque.map(p => `<option value="${p.id}">${esc(p.numero_fogo)} · ${esc(descricaoPneu(p))} · ${textoVida(p.vida)}${p.sulco_atual_mm != null ? ' · ' + fmtMm(p.sulco_atual_mm) : ''}</option>`).join('')}</select></div>
        <div class="l2" style="margin:-4px 0 10px;">Não está na lista? <a href="#" id="lnkCadastrarAqui">Cadastrar um pneu novo nesta posição</a>.</div>`}
      <div class="o-form-grid">
        ${pneu ? `<div class="field-row" style="margin:0;"><label for="pnVeiculo">Veículo</label><select id="pnVeiculo">${veiculos.map(v => `<option value="${v.id}" ${v.id === v0.id ? 'selected' : ''}>${esc(v.placa)} · ${esc(tipoLabelGlobal[v.tipo] || v.tipo)}</option>`).join('')}</select></div>
          <div class="field-row" style="margin:0;"><label for="pnPosicao">Posição</label><select id="pnPosicao"></select></div>` : ''}
        <div id="caixaKmMontar">${campoKmPneu(v0, ctx)}</div>
        <div class="field-row" style="margin:0;"><label for="pnSulco">Sulco (mm, opcional)</label><input type="text" inputmode="decimal" id="pnSulco"></div>
        ${campoDataPneu()}
      </div>
      <div class="err"></div>
      <button type="submit" style="margin-top:12px;">Montar</button>
    </form>`);
  const selVeic = document.getElementById('pnVeiculo'), selPos = document.getElementById('pnPosicao');
  const preencherPosicoes = () => {
    const v = veiculos.find(x => x.id === selVeic.value);
    const l = livres(v);
    selPos.innerHTML = l.length ? l.map(p => `<option value="${p}">${esc(rotuloPosicao(p))}</option>`).join('') : '<option value="">Nenhuma posição livre</option>';
    document.getElementById('caixaKmMontar').innerHTML = campoKmPneu(v, ctx);
  };
  if(selVeic){ preencherPosicoes(); selVeic.addEventListener('change', preencherPosicoes); }
  const lnk = document.getElementById('lnkCadastrarAqui');
  if(lnk) lnk.addEventListener('click', (e) => { e.preventDefault(); abrirCadastroPneu(null, ctx, { veiculo, posicao }); });
  ligarFormPneu('formMontar', () => {
    const pneuId = pneu ? pneu.id : document.getElementById('pnPneu').value;
    const veicId = pneu ? selVeic.value : veiculo.id, pos = pneu ? selPos.value : posicao;
    if(!pneuId) return { erro: 'Escolha o pneu.' };
    if(!pos) return { erro: 'Escolha a posição.' };
    const km = lerCampoNumero('pnKm', { max: 9999999, nome: 'km' }), sulco = lerCampoNumero('pnSulco', { max: 40, nome: 'sulco' }), data = lerDataPneu();
    const falha = km.erro || sulco.erro || data.erro;
    if(falha) return { erro: falha };
    const movimentos = [{ pneu_id: pneuId, tipo: 'montagem', veiculo_id: veicId, posicao: pos, km: km.valor, data: data.valor }];
    if(sulco.valor != null) movimentos.push({ pneu_id: pneuId, tipo: 'inspecao', km: km.valor, sulco_mm: sulco.valor, data: data.valor });
    return { movimentos };
  }, '✅ Pneu montado', ctx);
}

// ---------- retirar do veículo (e para onde vai) ----------
function abrirRetirar(p, ctx){
  const v = ctx.dados.todosVeiculos.find(x => x.id === p.veiculo_id);
  abrirModal(`Retirar o pneu ${p.numero_fogo}`, `
    <div class="l2" style="margin-bottom:10px;">${esc(ondeEsta(p, ctx.dados))}</div>
    <form id="formRetirar">
      <div class="o-form-grid">
        <div class="field-row" style="margin:0;"><label for="pnMotivo">Motivo</label><select id="pnMotivo">${MOTIVOS_RETIRADA.map(m => `<option>${m}</option>`).join('')}</select></div>
        <div class="field-row" style="margin:0;"><label for="pnDestino">Vai para</label><select id="pnDestino">
          <option value="estoque">Estoque</option><option value="recapagem">Recapagem</option><option value="sucata">Sucata</option></select></div>
        ${campoKmPneu(v, ctx)}
        <div class="field-row" style="margin:0;"><label for="pnSulco">Sulco (mm)</label><input type="text" inputmode="decimal" id="pnSulco" placeholder="recomendado"></div>
        <div class="field-row" style="margin:0;" id="caixaFornecedor" hidden><label for="pnFornecedor">Recapadora</label><input type="text" id="pnFornecedor" maxlength="80"></div>
        ${campoDataPneu()}
      </div>
      <div class="field-row" style="margin:12px 0 0;"><label for="pnObs">Observação (opcional)</label><input type="text" id="pnObs" maxlength="300"></div>
      <div class="err"></div>
      <button type="submit" style="margin-top:12px;">Retirar</button>
    </form>`);
  const destino = document.getElementById('pnDestino'), motivo = document.getElementById('pnMotivo');
  motivo.addEventListener('change', () => { if(motivo.value.startsWith('Desgaste (')) destino.value = 'recapagem'; destino.dispatchEvent(new Event('change')); });
  destino.addEventListener('change', () => { document.getElementById('caixaFornecedor').hidden = destino.value !== 'recapagem'; });
  ligarFormPneu('formRetirar', () => {
    const km = lerCampoNumero('pnKm', { max: 9999999, nome: 'km' }), sulco = lerCampoNumero('pnSulco', { max: 40, nome: 'sulco' }), data = lerDataPneu();
    const falha = km.erro || sulco.erro || data.erro;
    if(falha) return { erro: falha };
    const obs = document.getElementById('pnObs').value.trim() || null;
    const movimentos = [{ pneu_id: p.id, tipo: 'desmontagem', km: km.valor, sulco_mm: sulco.valor, motivo: motivo.value, observacao: obs, data: data.valor }];
    if(destino.value === 'recapagem') movimentos.push({ pneu_id: p.id, tipo: 'envio_recapagem', fornecedor: document.getElementById('pnFornecedor').value.trim() || null, data: data.valor });
    if(destino.value === 'sucata') movimentos.push({ pneu_id: p.id, tipo: 'sucata', motivo: motivo.value, data: data.valor });
    return { movimentos };
  }, '✅ Pneu retirado', ctx);
}

// ---------- rodízio: troca de posição no mesmo veículo (se a posição tiver pneu, os dois trocam) ----------
function abrirRodizio(p, ctx){
  const { dados } = ctx;
  const v = dados.todosVeiculos.find(x => x.id === p.veiculo_id);
  const naPos = Object.fromEntries(dados.pneus.filter(x => x.status === 'em_uso' && x.veiculo_id === v.id).map(x => [x.posicao, x]));
  const opcoes = posicoesVeiculo(v).filter(pos => pos !== p.posicao);
  abrirModal(`Trocar de posição — pneu ${p.numero_fogo}`, `
    <div class="l2" style="margin-bottom:10px;">Agora em ${esc(ondeEsta(p, dados))}. Se a posição nova já tiver pneu, os dois trocam de lugar.</div>
    <form id="formRodizio">
      <div class="o-form-grid">
        <div class="field-row" style="margin:0;"><label for="pnPosicao">Nova posição</label><select id="pnPosicao">${opcoes.map(pos => `<option value="${pos}">${esc(rotuloPosicao(pos))}${naPos[pos] ? ` — troca com ${esc(naPos[pos].numero_fogo)}` : ' — vazia'}</option>`).join('')}</select></div>
        ${campoKmPneu(v, ctx)}
        ${campoDataPneu()}
      </div>
      <div class="err"></div>
      <button type="submit" style="margin-top:12px;">Trocar</button>
    </form>`);
  ligarFormPneu('formRodizio', () => {
    const km = lerCampoNumero('pnKm', { max: 9999999, nome: 'km' }), data = lerDataPneu();
    if(km.erro || data.erro) return { erro: km.erro || data.erro };
    const nova = document.getElementById('pnPosicao').value, outro = naPos[nova];
    const base = { km: km.valor, data: data.valor, motivo: 'Rodízio' };
    const movimentos = [{ ...base, pneu_id: p.id, tipo: 'desmontagem' }];
    if(outro) movimentos.push({ ...base, pneu_id: outro.id, tipo: 'desmontagem' });
    movimentos.push({ pneu_id: p.id, tipo: 'montagem', veiculo_id: v.id, posicao: nova, km: km.valor, data: data.valor });
    if(outro) movimentos.push({ pneu_id: outro.id, tipo: 'montagem', veiculo_id: v.id, posicao: p.posicao, km: km.valor, data: data.valor });
    return { movimentos };
  }, '✅ Posição trocada', ctx);
}

// ---------- inspeção, recapagem, conserto, sucata ----------
function abrirMovimentoPneu(tipo, p, ctx){
  const v = p.status === 'em_uso' ? ctx.dados.todosVeiculos.find(x => x.id === p.veiculo_id) : null;
  const titulo = { inspecao: 'Medir sulco / pressão', envio_recapagem: 'Mandar para recapagem', retorno_recapagem: 'Voltou da recapagem', conserto: 'Conserto', sucata: 'Mandar para a sucata' }[tipo];
  const campos = {
    inspecao: `${v ? campoKmPneu(v, ctx) : ''}
      <div class="field-row" style="margin:0;"><label for="pnSulco">Sulco (mm)</label><input type="text" inputmode="decimal" id="pnSulco" placeholder="menor medida"></div>
      <div class="field-row" style="margin:0;"><label for="pnPressao">Pressão (psi, opcional)</label><input type="text" inputmode="decimal" id="pnPressao"></div>`,
    envio_recapagem: `<div class="field-row" style="margin:0;"><label for="pnFornecedor">Recapadora</label><input type="text" id="pnFornecedor" maxlength="80"></div>`,
    retorno_recapagem: `<div class="field-row" style="margin:0;"><label for="pnValor">Valor da recapagem (R$)</label><input type="text" inputmode="decimal" id="pnValor"></div>
      <div class="field-row" style="margin:0;"><label for="pnBanda">Banda (marca/desenho)</label><input type="text" id="pnBanda" maxlength="60" placeholder="ex: Vipal VT110"></div>
      <div class="field-row" style="margin:0;"><label for="pnSulco">Sulco novo (mm)</label><input type="text" inputmode="decimal" id="pnSulco"></div>
      <div class="field-row" style="margin:0;"><label for="pnFornecedor">Recapadora (opcional)</label><input type="text" id="pnFornecedor" maxlength="80"></div>`,
    conserto: `<div class="field-row" style="margin:0;"><label for="pnMotivoTxt">O que foi feito</label><input type="text" id="pnMotivoTxt" maxlength="80" list="pnConsertos" placeholder="ex: furo (macarrão)"><datalist id="pnConsertos"><option>Furo</option><option>Reparo lateral</option><option>Manchão</option><option>Válvula</option></datalist></div>
      <div class="field-row" style="margin:0;"><label for="pnValor">Valor (R$)</label><input type="text" inputmode="decimal" id="pnValor"></div>
      <div class="field-row" style="margin:0;"><label for="pnFornecedor">Borracharia (opcional)</label><input type="text" id="pnFornecedor" maxlength="80"></div>`,
    sucata: `<div class="field-row" style="margin:0;"><label for="pnMotivo">Motivo</label><select id="pnMotivo">${MOTIVOS_SUCATA.map(m => `<option ${p.status === 'recapagem' && m === 'Recapadora recusou' ? 'selected' : ''}>${m}</option>`).join('')}</select></div>`,
  }[tipo];
  abrirModal(`${titulo} — pneu ${p.numero_fogo}`, `
    ${tipo === 'sucata' ? '<div class="l2" style="margin-bottom:10px;">O pneu sai do controle (fica no histórico e entra na comparação de marcas).</div>' : ''}
    <form id="formMovPneu">
      <div class="o-form-grid">${campos}${campoDataPneu()}</div>
      <div class="field-row" style="margin:12px 0 0;"><label for="pnObs">Observação (opcional)</label><input type="text" id="pnObs" maxlength="300"></div>
      <div class="err"></div>
      <button type="submit" style="margin-top:12px;">Salvar</button>
    </form>`);
  ligarFormPneu('formMovPneu', () => {
    const km = lerCampoNumero('pnKm', { max: 9999999, nome: 'km' }), sulco = lerCampoNumero('pnSulco', { max: 40, nome: 'sulco' }),
      pressao = lerCampoNumero('pnPressao', { min: 1, max: 200, nome: 'pressão' }), valor = lerCampoNumero('pnValor', { max: 99999, nome: 'valor' }), data = lerDataPneu();
    const falha = km.erro || sulco.erro || pressao.erro || valor.erro || data.erro;
    if(falha) return { erro: falha };
    if(tipo === 'inspecao' && sulco.valor == null && pressao.valor == null) return { erro: 'Informe o sulco ou a pressão.' };
    const texto = (id) => { const el = document.getElementById(id); return el ? el.value.trim() || null : null; };
    return { movimentos: [{ pneu_id: p.id, tipo, km: km.valor, sulco_mm: sulco.valor, pressao_psi: pressao.valor, valor: valor.valor, data: data.valor,
      fornecedor: texto('pnFornecedor'), banda: texto('pnBanda'), motivo: texto('pnMotivo') || texto('pnMotivoTxt'), observacao: texto('pnObs') }] };
  }, tipo === 'inspecao' ? '✅ Medição salva' : '✅ Salvo', ctx);
}

// ---------- medir todos os pneus do veículo de uma vez ----------
// u = conjunto inteiro (ou um veículo só); o km é o do cavalo, que é o mesmo para o conjunto todo
function abrirMedirTodos(u, montados, ctx){
  const cav = u.veiculos[0];
  const grupos = u.veiculos.map(v => { const ordem = posicoesVeiculo(v); return [v, montados.filter(p => p.veiculo_id === v.id).sort((a, b) => ordem.indexOf(a.posicao) - ordem.indexOf(b.posicao))]; }).filter(([, l]) => l.length);
  abrirModal(`${u.conjunto ? placasUnidade(u) : cav.placa} — medir todos`, `
    <form id="formMedirTodos">
      <div class="o-form-grid">${campoKmPneu(cav, ctx)}${campoDataPneu()}</div>
      <div class="l2" style="margin:10px 0 6px;">Sulco em mm (a menor medida de cada pneu). Deixe em branco o que não mediu.</div>
      ${grupos.map(([v, lista]) => `${grupos.length > 1 ? `<div class="section-label" style="margin:12px 0 6px;">${esc(v.placa)} · ${esc(tipoLabelGlobal[v.tipo] || v.tipo)}</div>` : ''}
      <div class="pn-medir">${lista.map(p => `<label><span>${esc(rotuloPosicao(p.posicao))}<small>${esc(p.numero_fogo)} · ${esc(p.marca)}${p.sulco_atual_mm != null ? ' · antes ' + fmtMm(p.sulco_atual_mm) : ''}</small></span>
        <input type="text" inputmode="decimal" data-sulco-pneu="${p.id}" placeholder="mm"></label>`).join('')}</div>`).join('')}
      <div class="err"></div>
      <button type="submit" style="margin-top:12px;">Salvar medições</button>
    </form>`);
  ligarFormPneu('formMedirTodos', () => {
    const km = lerCampoNumero('pnKm', { max: 9999999, nome: 'km' }), data = lerDataPneu();
    if(km.erro || data.erro) return { erro: km.erro || data.erro };
    const movimentos = [];
    for(const inp of document.querySelectorAll('[data-sulco-pneu]')){
      const n = numeroOuNulo(inp.value);
      if(n == null) continue;
      if(isNaN(n) || n < 0 || n > 40) return { erro: 'Confira os sulcos (mm).' };
      movimentos.push({ pneu_id: inp.dataset.sulcoPneu, tipo: 'inspecao', km: km.valor, sulco_mm: n, data: data.valor });
    }
    if(!movimentos.length) return { erro: 'Preencha pelo menos um sulco.' };
    return { movimentos };
  }, '✅ Medições salvas', ctx);
}

// ---------- cadastro (um ou vários números de fogo); montarEm = { veiculo, posicao } ----------
function numerosDeFogo(texto){
  const lista = [];
  for(const parte of String(texto).split(/[,;\s]+/).filter(Boolean)){
    const m = /^(\d+)-(\d+)$/.exec(parte);
    if(m){
      const a = Number(m[1]), b = Number(m[2]);
      if(b < a || b - a >= 200) return null;
      for(let i = a; i <= b; i++) lista.push(String(i).padStart(m[1].length, '0'));
    } else lista.push(parte.toUpperCase());
  }
  return lista;
}
function abrirCadastroPneu(p, ctx, montarEm = null){
  const novo = !p;
  const marcas = [...new Set([...ctx.dados.pneus.map(x => x.marca), ...MARCAS_PNEU])];
  const modelos = [...new Set(ctx.dados.pneus.map(x => x.modelo).filter(Boolean))];
  const medidas = [...new Set([...ctx.dados.pneus.map(x => x.medida).filter(Boolean), ...MEDIDAS_PNEU])];
  const aplicacaoSugerida = montarEm ? (montarEm.veiculo.tipo === 'cavalo' ? (montarEm.posicao.startsWith('1') ? 'direcional' : 'tracao') : 'livre') : '';
  const val = (campo) => esc(p && p[campo] != null ? p[campo] : '');
  abrirModal(novo ? (montarEm ? `Cadastrar pneu — ${montarEm.veiculo.placa} ${rotuloPosicao(montarEm.posicao)}` : 'Cadastrar pneus') : `Editar pneu ${p.numero_fogo}`, `
    <form id="formCadPneu">
      <div class="o-form-grid">
        <div class="field-row" style="margin:0;"><label for="cpFogo">${novo && !montarEm ? 'Nº de fogo (vários: 101-110 ou 101, 102)' : 'Nº de fogo'}</label><input type="text" id="cpFogo" value="${val('numero_fogo')}" required maxlength="${novo && !montarEm ? 400 : 20}"></div>
        <div class="field-row" style="margin:0;"><label for="cpMarca">Marca</label><input type="text" id="cpMarca" list="cpMarcas" value="${val('marca')}" required maxlength="40"><datalist id="cpMarcas">${marcas.map(m => `<option value="${esc(m)}">`).join('')}</datalist></div>
        <div class="field-row" style="margin:0;"><label for="cpModelo">Modelo (opcional)</label><input type="text" id="cpModelo" list="cpModelos" value="${val('modelo')}" maxlength="60" placeholder="ex: X Multi Z"><datalist id="cpModelos">${modelos.map(m => `<option value="${esc(m)}">`).join('')}</datalist></div>
        <div class="field-row" style="margin:0;"><label for="cpMedida">Medida</label><input type="text" id="cpMedida" list="cpMedidas" value="${val('medida')}" maxlength="30" placeholder="ex: 295/80R22.5"><datalist id="cpMedidas">${medidas.map(m => `<option value="${esc(m)}">`).join('')}</datalist></div>
        <div class="field-row" style="margin:0;"><label for="cpAplicacao">Aplicação</label><select id="cpAplicacao"><option value="">—</option>${Object.entries(ROTULO_APLICACAO).map(([k, l]) => `<option value="${k}" ${(p ? p.aplicacao : aplicacaoSugerida) === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="field-row" style="margin:0;"><label for="cpVida">Condição ao entrar</label><select id="cpVida">${[0, 1, 2, 3, 4].map(n => `<option value="${n}" ${(p ? p.vida_inicial : 0) === n ? 'selected' : ''}>${n === 0 ? 'Novo' : `Já recapado ${n}x`}</option>`).join('')}</select></div>
        <div class="field-row" style="margin:0;"><label for="cpSulco">Sulco ao entrar (mm)</label><input type="text" inputmode="decimal" id="cpSulco" value="${val('sulco_inicial_mm')}" placeholder="ex: 18"></div>
        <div class="field-row" style="margin:0;"><label for="cpDot">DOT (semana/ano, opcional)</label><input type="text" id="cpDot" value="${val('dot')}" maxlength="10" placeholder="ex: 2324"></div>
        <div class="field-row" style="margin:0;"><label for="cpValor">Valor pago (R$${novo && !montarEm ? ', cada' : ''})</label><input type="text" inputmode="decimal" id="cpValor" value="${val('valor_compra')}"></div>
        <div class="field-row" style="margin:0;"><label for="cpDataCompra">Data da compra</label><input type="date" id="cpDataCompra" value="${val('data_compra')}"></div>
        <div class="field-row" style="margin:0;"><label for="cpFornecedor">Fornecedor (opcional)</label><input type="text" id="cpFornecedor" value="${val('fornecedor')}" maxlength="80"></div>
        <div class="field-row" style="margin:0;"><label for="cpNota">Nº da nota (opcional)</label><input type="text" id="cpNota" value="${val('nota_numero')}" maxlength="40"></div>
        ${montarEm ? `${campoKmPneu(montarEm.veiculo, ctx)}<div class="field-row" style="margin:0;"><label for="pnData">Montado em</label><input type="datetime-local" id="pnData" value="${paraCampoDataHora(new Date().toISOString())}" required></div>` : ''}
      </div>
      <div class="field-row" style="margin:12px 0 0;"><label for="cpObs">Observação (opcional)</label><input type="text" id="cpObs" value="${val('observacao')}" maxlength="300"></div>
      ${montarEm ? '<div class="l2" style="margin-top:8px;">Pneu que já estava rodando: o km e a data são de hoje — o km rodado conta a partir daqui. Meça o sulco para já entrar no cálculo de desgaste.</div>' : ''}
      <div class="err" id="cpErro"></div>
      <button type="submit" style="margin-top:12px;">${novo ? (montarEm ? 'Cadastrar e montar' : 'Cadastrar') : 'Salvar alterações'}</button>
      ${!novo && ctx.gestao ? `<div class="o-acoes"><button type="button" class="btn btn-outline btn-sm" id="btnExcluirPneu" style="color:var(--signal-red-ink);">Excluir pneu (cadastrado por engano)</button></div>` : ''}
    </form>`);
  document.getElementById('formCadPneu').addEventListener('submit', async (e) => {
    e.preventDefault();
    const erro = document.getElementById('cpErro'), btn = e.target.querySelector('button[type="submit"]');
    const txt = (id) => document.getElementById(id).value.trim() || null;
    const sulco = lerCampoNumero('cpSulco', { max: 40, nome: 'sulco' }), valor = lerCampoNumero('cpValor', { max: 99999, nome: 'valor' });
    if(sulco.erro || valor.erro){ erro.textContent = sulco.erro || valor.erro; return; }
    const dados = { marca: txt('cpMarca'), modelo: txt('cpModelo'), medida: txt('cpMedida') && txt('cpMedida').toUpperCase(), aplicacao: txt('cpAplicacao'), vida_inicial: Number(document.getElementById('cpVida').value),
      sulco_inicial_mm: sulco.valor, dot: txt('cpDot'), valor_compra: valor.valor, data_compra: txt('cpDataCompra'), fornecedor: txt('cpFornecedor'), nota_numero: txt('cpNota'), observacao: txt('cpObs') };
    if(!dados.marca){ erro.textContent = 'Informe a marca.'; return; }
    const numeros = novo && !montarEm ? numerosDeFogo(txt('cpFogo') || '') : [String(txt('cpFogo') || '').toUpperCase()];
    if(!numeros || !numeros.length || !numeros[0]){ erro.textContent = 'Confira o nº de fogo (faixa de até 200 números, ex: 101-110).'; return; }
    if(numeros.some(n => n.length > 20)){ erro.textContent = 'Nº de fogo muito longo.'; return; }
    let km = null, data = null;
    if(montarEm){
      const k = lerCampoNumero('pnKm', { max: 9999999, nome: 'km' }), d = lerDataPneu();
      if(k.erro || d.erro){ erro.textContent = k.erro || d.erro; return; }
      km = k.valor; data = d.valor;
    }
    btn.disabled = true; const rotulo = btn.textContent; btn.textContent = 'Salvando...';
    const falhou = (msg) => { erro.textContent = /pneu_fogo_uk|duplicate/i.test(msg) ? 'Já existe pneu com esse nº de fogo.' : 'Não consegui salvar: ' + msg; btn.disabled = false; btn.textContent = rotulo; };
    if(!novo){
      const { error } = await sb.from('pneu').update({ ...dados, numero_fogo: numeros[0] }).eq('id', p.id);
      if(error) return falhou(error.message);
      fecharModal(); mostrarToast('✅ Pneu atualizado'); ctx.aoMudar(); return;
    }
    const { data: criados, error } = await sb.from('pneu').insert(numeros.map(n => ({ ...dados, numero_fogo: n, transportadora_id: usuarioAtual.transportadora_id }))).select('id');
    if(error) return falhou(error.message);
    if(montarEm){
      const falha = await inserirMovimentos([{ pneu_id: criados[0].id, tipo: 'montagem', veiculo_id: montarEm.veiculo.id, posicao: montarEm.posicao, km, data }]);
      if(falha){ alert('O pneu foi cadastrado (está no estoque), mas não consegui montar: ' + falha); fecharModal(); ctx.aoMudar(); return; }
    }
    fecharModal(); mostrarToast(montarEm ? '✅ Pneu cadastrado e montado' : `✅ ${criados.length} pneu${criados.length > 1 ? 's' : ''} cadastrado${criados.length > 1 ? 's' : ''}`);
    ctx.aoMudar();
  });
  const excluir = document.getElementById('btnExcluirPneu');
  if(excluir) excluir.addEventListener('click', async () => {
    if(!confirm(`Excluir o pneu ${p.numero_fogo} e todo o histórico dele? Use só para cadastro feito por engano — pneu que acabou vai para a sucata.\n\nNão dá para desfazer.`)) return;
    const { error } = await sb.from('pneu').delete().eq('id', p.id);
    if(error){ alert('Não consegui excluir: ' + error.message); return; }
    fecharModal(); mostrarToast('Pneu excluído'); ctx.aoMudar();
  });
}

// ---------------------------------------------------------------------
// APP DO MECÂNICO — aba Pneus
// ---------------------------------------------------------------------
let buscaPneusMecanico = '';
async function loadPneusMecanico(){
  let dados;
  try{ dados = await buscarDadosPneus(); }
  catch(e){ montarTelaMecanico({ header: headerMecanico('Pneus', ''), conteudo: `<div class="status">Erro ao carregar: ${esc(e.message)}</div>` }); return; }
  const ctx = { dados, aoMudar: () => { if(mecanicoTab === 'pneus') abrirTelaMecanico(); }, gestao: false };
  const n = (s) => dados.pneus.filter(p => p.status === s).length;
  const atencao = dados.pneus.filter(alertaPneu);
  const cartao = (num, rot, cor = '') => `<div class="card" style="text-align:center; padding:12px; margin:0;"><div class="gauge-val" style="margin-top:0; font-size:20px; ${cor ? `color:${cor};` : ''}">${num}</div><div class="gauge-lbl">${rot}</div></div>`;
  montarTelaMecanico({
    header: headerMecanico('Pneus', 'Toque no conjunto para ver o desenho dos pneus'),
    conteudo: `
      <div class="grid3" style="display:grid; grid-template-columns:repeat(3, 1fr); gap:8px; margin-bottom:12px;">
        <div data-lista-mec="estoque" style="cursor:pointer;">${cartao(n('estoque'), 'Estoque')}</div>
        <div data-lista-mec="recapagem" style="cursor:pointer;">${cartao(n('recapagem'), 'Recapagem')}</div>
        <div data-lista-mec="alerta" style="cursor:pointer;">${cartao(atencao.length, 'Atenção', atencao.length ? 'var(--signal-amber)' : '')}</div>
      </div>
      <button class="btn btn-outline btn-sm" id="btnCadPneuMec" style="width:100%; margin-bottom:12px;">${ic('plus', 14)} Cadastrar pneu no estoque</button>
      <input type="search" id="buscaPneuMec" placeholder="Pesquisar placa ou nº de fogo" value="${esc(buscaPneusMecanico)}" style="margin-bottom:12px;">
      <div id="listaPneuMec"></div>`,
  });
  const desenhar = () => {
    const termo = textoBusca(buscaPneusMecanico).trim();
    const caixa = document.getElementById('listaPneuMec');
    const pneusAchados = termo ? dados.pneus.filter(p => textoBusca(p.numero_fogo).includes(termo) && p.status !== 'sucata') : [];
    const unids = dados.unidades.filter(u => !termo || u.veiculos.some(v => textoBusca(v.placa).includes(termo)));
    // conjuntos na vez de medir o sulco (por enquanto quem mede é o escritório; o mecânico também pode)
    const medir = termo ? [] : unidadesParaMedir(dados);
    caixa.innerHTML = `
      ${medir.length ? `<div class="section-label">Medir o sulco (${medir.length})</div><div class="card lista">${medir.slice(0, 15).map(([u, r]) => `<div class="list-item" data-unid-mec="${u.id}" style="cursor:pointer;"><div class="li-ic">${ic('pneu', 16)}</div>
        <div class="li-body"><div class="li-title" style="font-family:var(--font-mono);">${esc(placasUnidade(u))}</div><div class="li-sub">${r.diasSemMedir} dias sem medir · ${r.rodando} pneu${r.rodando === 1 ? '' : 's'}${u.motorista ? ' · ' + esc(u.motorista) : ''}</div></div>
        ${pillStatus('blue', 'Medir')}</div>`).join('')}</div>` : ''}
      ${pneusAchados.length ? `<div class="section-label">Pneus</div><div class="card lista">${pneusAchados.slice(0, 30).map(p => `<div class="list-item" data-pneu-mec="${p.id}" style="cursor:pointer;"><div class="li-ic">${ic('pneu', 16)}</div>
        <div class="li-body"><div class="li-title" style="font-family:var(--font-mono);">${esc(p.numero_fogo)}</div><div class="li-sub">${esc(descricaoPneu(p))} · ${esc(ondeEsta(p, dados))}</div></div></div>`).join('')}</div>` : ''}
      <div class="section-label">Conjuntos</div>
      <div class="card lista">${unids.map(u => { const r = resumoUnidade(u, dados);
        return `<div class="list-item" data-unid-mec="${u.id}" style="cursor:pointer;"><div class="li-ic">${ic('truck', 16)}</div>
          <div class="li-body"><div class="li-title" style="font-family:var(--font-mono);">${esc(placasUnidade(u))}</div><div class="li-sub">${esc(nomeComposicao(u))} · ${r.montados} pneu${r.montados === 1 ? '' : 's'}${u.motorista ? ' · ' + esc(u.motorista) : ''}</div></div>
          ${r.pior ? pillStatus(r.pior[0], r.pior[1]) : ''}</div>`; }).join('') || '<div class="li-sub" style="padding:12px;">Nenhum veículo encontrado.</div>'}</div>`;
    caixa.querySelectorAll('[data-unid-mec]').forEach(el => el.addEventListener('click', () => abrirMapaUnidade(dados.unidades.find(u => u.id === el.dataset.unidMec), ctx)));
    caixa.querySelectorAll('[data-pneu-mec]').forEach(el => el.addEventListener('click', () => abrirPneu(dados.pneus.find(p => p.id === el.dataset.pneuMec), ctx)));
  };
  desenhar();
  const busca = document.getElementById('buscaPneuMec');
  busca.addEventListener('input', () => { clearTimeout(busca._t); busca._t = setTimeout(() => { buscaPneusMecanico = busca.value; desenhar(); }, 180); });
  document.getElementById('btnCadPneuMec').addEventListener('click', () => abrirCadastroPneu(null, ctx));
  document.querySelectorAll('[data-lista-mec]').forEach(b => b.addEventListener('click', () => {
    const tipo = b.dataset.listaMec;
    const lista = dados.pneus.filter(tipo === 'alerta' ? alertaPneu : (p => p.status === tipo));
    abrirModal({ estoque: 'Pneus no estoque', recapagem: 'Pneus na recapagem', alerta: 'Pneus que precisam de atenção' }[tipo], lista.length
      ? `<div class="pn-hist">${lista.map(p => { const a = alertaPneu(p); return `<div class="pn-hist-item" data-pneu-lista="${p.id}" style="cursor:pointer;"><div class="pn-hist-data mono">${esc(p.numero_fogo)}</div>
          <div>${esc(descricaoPneu(p))}<div class="sub">${esc(ondeEsta(p, dados))} · ${textoVida(p.vida)}${p.sulco_atual_mm != null ? ' · ' + fmtMm(p.sulco_atual_mm) : ''}${a ? ' · ' + esc(a[1]) : ''}</div></div></div>`; }).join('')}</div>`
      : '<div class="l2">Nenhum pneu aqui.</div>');
    document.querySelectorAll('#modalGenerico [data-pneu-lista]').forEach(el => el.addEventListener('click', () => abrirPneu(dados.pneus.find(p => p.id === el.dataset.pneuLista), ctx)));
  }));
}
