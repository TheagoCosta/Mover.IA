// MOVER.IA — gráficos simples em SVG (sem biblioteca), usados no Painel, Consumo e Abastecimento.
//   • graficoBarras: uma série, barras verticais (ex.: média por mês, horas por dia)
//   • graficoLinhas: até 3 séries no mesmo eixo (ex.: nível de cada tanque por dia)
//   • barraNivel: barra horizontal de nível (ex.: quanto tem no tanque)
// Passar o mouse (ou tocar) mostra o valor exato — ligarDicasGraficos(el) depois de desenhar.
// Cores das séries conferidas para daltonismo (ver skill dataviz): sempre nesta ordem.
// (arquivo carregado pelo index.html; todas as funções ficam globais)

const CORES_SERIES = ['#1f6fb2', '#b7791f', '#8a4fc0'];
const numGraf = (n, casas = 1) => n == null || Number.isNaN(n) ? '—' : Number(n).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });

// escala "redonda" do eixo: passo de 1, 2, 2,5 ou 5 (× 10ⁿ), umas 3 ou 4 linhas
function escalaEixo(maxDado, { maxFixo = null, inteiro = false } = {}){
  const alvo = (maxFixo || maxDado || 1) / 3;
  const pot = Math.pow(10, Math.floor(Math.log10(alvo)));
  let passo = [1, 2, 2.5, 5, 10].map(m => m * pot).find(p => p >= alvo);
  if(inteiro) passo = Math.max(1, Math.round(passo));
  const max = maxFixo || Math.ceil(maxDado / passo) * passo || passo;
  const marcas = [];
  for(let v = 0; v <= max + 1e-9; v += passo) marcas.push(v);
  return { max, marcas, casas: passo < 1 ? 1 : 0 };
}

// itens: [{ rotulo, valor, dica, destaque }] — valor null = sem dado (mostra "—")
function graficoBarras(itens, { casas = 1, aria = '', textoVazio = 'Ainda não há dados para o gráfico.', cor = 'var(--pastel-blue-ink)', altura = 220 } = {}){
  const comDado = itens.filter(i => i.valor);
  if(!comDado.length) return vazio(textoVazio);
  const L = 640, A = altura, esq = 44, dir = 12, topo = 18, base = 28;
  const esc_ = escalaEixo(Math.max(...comDado.map(i => i.valor)) * 1.08, { inteiro: casas === 0 }), max = esc_.max;
  const passo = (L - esq - dir) / itens.length, larg = Math.min(34, passo - 6);
  const y = (v) => topo + (A - topo - base) * (1 - v / max);
  const grades = esc_.marcas.map(v => `<line x1="${esq}" x2="${L - dir}" y1="${y(v)}" y2="${y(v)}" stroke="var(--paper-200)" stroke-width="1"/>
    <text x="${esq - 6}" y="${y(v) + 4}" text-anchor="end" class="cons-eixo">${numGraf(v, esc_.casas)}</text>`).join('');
  const marcado = itens.find(i => i.destaque) || [...itens].reverse().find(i => i.valor);
  const barras = itens.map((it, i) => {
    const x = esq + i * passo + (passo - larg) / 2;
    const rot = `<text x="${x + larg / 2}" y="${A - 10}" text-anchor="middle" class="cons-eixo">${esc(it.rotulo)}</text>`;
    if(!it.valor) return `${rot}<text x="${x + larg / 2}" y="${A - base - 4}" text-anchor="middle" class="cons-eixo">—</text>`;
    const h = A - base - y(it.valor), r = Math.min(4, h / 2);
    // topo arredondado (4px), base reta na linha do zero
    const caminho = `M${x},${A - base} V${y(it.valor) + r} Q${x},${y(it.valor)} ${x + r},${y(it.valor)} H${x + larg - r} Q${x + larg},${y(it.valor)} ${x + larg},${y(it.valor) + r} V${A - base} Z`;
    return `${rot}<g class="cons-barra" data-dica="${esc(it.dica || `${it.rotulo}: ${numGraf(it.valor, casas)}`)}">
      <rect x="${x - (passo - larg) / 2}" y="${topo}" width="${passo}" height="${A - topo - base}" fill="transparent"/>
      <path d="${caminho}" fill="${it === marcado ? 'var(--line-yellow-dim)' : cor}"/>
      ${it === marcado ? `<text x="${x + larg / 2}" y="${y(it.valor) - 6}" text-anchor="middle" class="cons-valor">${numGraf(it.valor, casas)}</text>` : ''}</g>`;
  }).join('');
  return `<div class="cons-grafico">
    <svg viewBox="0 0 ${L} ${A}" width="100%" role="img" aria-label="${esc(aria)}">
      ${grades}${barras}
    </svg><div class="cons-dica" hidden></div></div>`;
}

// rotulos: ['01/10', ...]; series: [{ nome, valores:[n|null,...] }]; dicas opcionais por posição
function graficoLinhas(rotulos, series, { casas = 0, unidade = '', aria = '', textoVazio = 'Ainda não há dados para o gráfico.', maxFixo = null, altura = 220 } = {}){
  const todos = series.flatMap(s => s.valores).filter(v => v != null);
  if(!todos.length) return vazio(textoVazio);
  const L = 640, A = altura, esq = 52, dir = 14, topo = 14, base = 28;
  const esc_ = escalaEixo(Math.max(...todos) * 1.08, { maxFixo }), max = esc_.max;
  const passo = (L - esq - dir) / Math.max(1, rotulos.length - 1);
  const x = (i) => esq + i * passo, y = (v) => topo + (A - topo - base) * (1 - v / max);
  const grades = esc_.marcas.map(v => `<line x1="${esq}" x2="${L - dir}" y1="${y(v)}" y2="${y(v)}" stroke="var(--paper-200)" stroke-width="1"/>
    <text x="${esq - 6}" y="${y(v) + 4}" text-anchor="end" class="cons-eixo">${numGraf(v, esc_.casas)}</text>`).join('');
  // rótulos do eixo x: no máximo ~7, contando de trás para frente (o último dia sempre aparece)
  const cada = Math.max(1, Math.ceil(rotulos.length / 7));
  const eixoX = rotulos.map((r, i) => (rotulos.length - 1 - i) % cada === 0 ? `<text x="${x(i)}" y="${A - 10}" text-anchor="middle" class="cons-eixo">${esc(r)}</text>` : '').join('');
  const linhas = series.map((s, k) => {
    let d = '', caneta = false;
    s.valores.forEach((v, i) => { if(v == null){ caneta = false; return; } d += `${caneta ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)} `; caneta = true; });
    const ult = s.valores.map((v, i) => [v, i]).filter(([v]) => v != null).pop();
    return `<path d="${d}" fill="none" stroke="${CORES_SERIES[k]}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
      ${ult ? `<circle cx="${x(ult[1])}" cy="${y(ult[0])}" r="4" fill="${CORES_SERIES[k]}" stroke="#fff" stroke-width="2"/>` : ''}`;
  }).join('');
  // colunas invisíveis para a dica (linha-guia + valores de todas as séries naquele dia)
  const colunas = rotulos.map((r, i) => {
    const partes = series.map(s => s.valores[i] == null ? null : `${s.nome}: ${numGraf(s.valores[i], casas)}${unidade}`).filter(Boolean);
    if(!partes.length) return '';
    return `<g class="cons-barra cons-coluna" data-dica="${esc(r + ' — ' + partes.join(' · '))}">
      <rect x="${x(i) - passo / 2}" y="${topo}" width="${passo}" height="${A - topo - base}" fill="transparent"/>
      <line x1="${x(i)}" x2="${x(i)}" y1="${topo}" y2="${A - base}" stroke="var(--ink-700)" stroke-width="1" stroke-dasharray="3 3" class="guia"/></g>`;
  }).join('');
  const legenda = series.length > 1 ? `<div class="graf-legenda">${series.map((s, k) => `<span><i style="background:${CORES_SERIES[k]}"></i>${esc(s.nome)}</span>`).join('')}</div>` : '';
  return `${legenda}<div class="cons-grafico">
    <svg viewBox="0 0 ${L} ${A}" width="100%" role="img" aria-label="${esc(aria)}">
      ${grades}${eixoX}${linhas}${colunas}
    </svg><div class="cons-dica" hidden></div></div>`;
}

// nível de 0 a 1 (ex.: tanque) — âmbar abaixo de "alerta", vermelho abaixo de "critico"
function barraNivel(fracao, { alerta = 0.25, critico = 0.1 } = {}){
  if(fracao == null) return `<div class="nivel"><div class="nivel-vazio">sem medição</div></div>`;
  const f = Math.max(0, Math.min(1, fracao));
  const cor = f < critico ? 'var(--signal-red)' : f < alerta ? 'var(--signal-amber)' : 'var(--ink-900)';
  return `<div class="nivel"><div class="nivel-cheio" style="width:${(f * 100).toFixed(1)}%; background:${cor};"></div></div>`;
}

// dica ao passar o mouse (ou tocar) em qualquer gráfico desenhado dentro de el
function ligarDicasGraficos(el){
  el.querySelectorAll('.cons-grafico').forEach(caixa => {
    const dica = caixa.querySelector('.cons-dica');
    caixa.querySelectorAll('.cons-barra').forEach(g => {
      const mostrar = (e) => {
        const r = caixa.getBoundingClientRect();
        caixa.querySelectorAll('.cons-barra.ativa').forEach(o => o.classList.remove('ativa'));
        dica.textContent = g.dataset.dica; dica.hidden = false;
        const px = (e.touches ? e.touches[0].clientX : e.clientX) - r.left;
        dica.style.left = Math.max(0, Math.min(r.width - dica.offsetWidth, px - dica.offsetWidth / 2)) + 'px';
        g.classList.add('ativa');
      };
      const esconder = () => { dica.hidden = true; g.classList.remove('ativa'); };
      g.addEventListener('mousemove', mostrar); g.addEventListener('mouseleave', esconder);
      g.addEventListener('touchstart', mostrar, { passive: true });
    });
  });
}
