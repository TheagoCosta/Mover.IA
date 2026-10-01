// MOVER.IA — peças visuais usadas por todas as telas: ícones, medidor,
// selos de status, datas, exportação CSV e janela (modal).
// (arquivo carregado pelo index.html; todas as funções ficam globais,
// então um arquivo pode chamar funções dos outros normalmente)

// ---------- bibliotecas pesadas, baixadas só quando usadas ----------
// Leitor de PDF, de QR Code e OCR somam ~630 KB que a maioria das telas
// nunca usa — carregar tudo na abertura deixava o app lento no celular.
const BIBLIOTECAS = {
  pdf: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js',
  qr:  'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js',
  ocr: 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js',
};
const bibliotecasCarregando = {};
function carregarBiblioteca(nome){
  if(!bibliotecasCarregando[nome]) bibliotecasCarregando[nome] = new Promise((ok, falha) => {
    const s = document.createElement('script');
    s.src = BIBLIOTECAS[nome];
    s.onload = ok;
    s.onerror = () => { delete bibliotecasCarregando[nome]; s.remove(); falha(new Error('Não consegui baixar um componente do app. Confira a internet e tente de novo.')); };
    document.head.appendChild(s);
  });
  return bibliotecasCarregando[nome];
}
async function usarPdfJs(){
  await carregarBiblioteca('pdf');
  if(!pdfjsLib.GlobalWorkerOptions.workerSrc){
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
  }
  return pdfjsLib;
}

// ---------- barra de "carregando" no topo ----------
// Aparece só se a tela demorar mais que um instante, para o toque nunca
// parecer ignorado.
let timerCarregando = null;
function mostrarCarregando(){
  clearTimeout(timerCarregando);
  timerCarregando = setTimeout(() => document.body.classList.add('carregando'), 120);
}
function esconderCarregando(){
  clearTimeout(timerCarregando);
  document.body.classList.remove('carregando');
}

// ---------- versão nova publicada ----------
// O service worker abre a versão guardada na hora (rápido); aqui conferimos
// por trás se publicamos outra e oferecemos "Atualizar".
const VERSAO_APP = ((document.querySelector('script[src*="js/ui.js?v="]') || {}).src || '').split('v=')[1] || '';
let ultimaConferenciaVersao = 0;
async function conferirVersaoNova(){
  if(!VERSAO_APP || Date.now() - ultimaConferenciaVersao < 10 * 60000) return;
  ultimaConferenciaVersao = Date.now();
  try{
    const html = await fetch('./?verificar=' + Date.now(), { cache: 'no-store' }).then(r => r.ok ? r.text() : '');
    const publicada = (html.match(/js\/ui\.js\?v=([\w-]+)/) || [])[1];
    if(publicada && publicada !== VERSAO_APP) mostrarAvisoAtualizacao();
  } catch(e){ /* sem internet: confere na próxima */ }
}
function mostrarAvisoAtualizacao(){
  if(document.getElementById('avisoAtualizacao')) return;
  document.body.insertAdjacentHTML('beforeend', `<div class="aviso-atualizacao" id="avisoAtualizacao">
    <span>${ic('sync', 16)} Nova versão do app disponível</span>
    <button type="button" class="btn btn-primary btn-sm" id="btnAtualizarApp">Atualizar</button></div>`);
  document.getElementById('btnAtualizarApp').addEventListener('click', () => { location.href = './?atualizar=' + Date.now(); });
}
window.addEventListener('load', () => setTimeout(conferirVersaoNova, 3000));
if(/[?&]atualizar=/.test(location.search)){   // acabou de atualizar: limpa o endereço
  const params = new URLSearchParams(location.search); params.delete('atualizar');
  history.replaceState(null, '', location.pathname + (params.toString() ? '?' + params : ''));
}
document.addEventListener('visibilitychange', () => { if(document.visibilityState === 'visible') conferirVersaoNova(); });

// ---------- dados das telas guardados na memória ----------
// No iPhone cada ida ao servidor custa ~0,5 s. Então cada tela guarda os
// dados que já carregou: ao voltar nela, aparece NA HORA e se atualiza por
// trás (só redesenha se algo mudou e a pessoa não estiver digitando).
// Qualquer gravação no servidor descarta tudo (ver medirServidor abaixo),
// para nunca mostrar dado velho depois de uma ação.
const cacheTelas = {};
let navegacaoTela = 0;   // muda a cada troca de tela (a atualização por trás só redesenha a tela certa)
let versaoDados = 0;     // muda a cada gravação (resposta que saiu antes dela é descartada)
function limparCacheTelas(){ versaoDados++; for(const k in cacheTelas) delete cacheTelas[k]; }
function guardarTela(chave, dados){ cacheTelas[chave] = { dados, em: Date.now() }; }
const copiaDados = (d) => d === undefined ? d : JSON.parse(JSON.stringify(d));
function usuarioMexendo(){
  const ativo = document.activeElement;
  if(ativo && /^(INPUT|TEXTAREA|SELECT)$/.test(ativo.tagName)) return true;
  if(typeof chkAnswers !== 'undefined' && Object.keys(chkAnswers).length) return true;
  if(document.querySelector('#chCategorias .active, #chUrgencias .active')) return true;
  const resumo = document.getElementById('chMidiasResumo');
  if(resumo && resumo.textContent.trim()) return true;
  return [...document.querySelectorAll('#app textarea, #app input:not([type=file]):not([type=checkbox]):not([type=radio]):not([type=hidden])')].some(c => c.value);
}
async function dadosTela(chave, buscar, redesenhar){
  const guardado = cacheTelas[chave];
  if(!guardado){
    const versao = versaoDados, dados = await buscar();
    if(versao === versaoDados) guardarTela(chave, dados);
    return copiaDados(dados);
  }
  if(Date.now() - guardado.em > 4000){
    const minhaTela = navegacaoTela, versao = versaoDados;
    guardado.em = Date.now();   // não dispara outra atualização enquanto esta não volta
    buscar().then((novos) => {
      if(versao !== versaoDados) return;
      const mudou = JSON.stringify(novos) !== JSON.stringify(guardado.dados);
      guardarTela(chave, novos);
      if(mudou && minhaTela === navegacaoTela && !usuarioMexendo()) redesenhar();
    }).catch(() => { /* sem internet: fica com o que tem */ });
  }
  return copiaDados(guardado.dados);
}
// busca em segundo plano (para a primeira visita à tela já ser instantânea)
function preCarregarTela(chave, buscar){
  if(cacheTelas[chave]) return;
  const versao = versaoDados;
  buscar().then((d) => { if(versao === versaoDados && !cacheTelas[chave]) guardarTela(chave, d); }).catch(() => {});
}

// ---------- medidor de velocidade (aparece no Perfil do motorista) ----------
// Guarda quanto tempo o servidor demora para responder e quanto cada tela
// leva para abrir — para descobrir onde está a demora em cada celular.
const medidas = { servidor: [], telas: [], prontoEm: null, cacheEm: null };
(function medirServidor(){
  const original = window.fetch.bind(window);
  window.fetch = async (...args) => {
    const url = String(args[0] && args[0].url || args[0]);
    if(!url.includes('.supabase.co/')) return original(...args);
    // gravação (tudo que não é leitura, exceto a consulta do Início, login e links de arquivo) → descarta as telas guardadas
    const metodo = String((args[1] && args[1].method) || (args[0] && args[0].method) || 'GET').toUpperCase();
    const grava = metodo !== 'GET' && metodo !== 'HEAD' && !/\/rpc\/inicio_motorista|\/auth\/v1\/|\/object\/sign\//.test(url);
    if(grava) limparCacheTelas();
    const inicio = performance.now();
    try{ return await original(...args); }
    finally{
      if(grava) limparCacheTelas();
      medidas.servidor.push(Math.round(performance.now() - inicio)); if(medidas.servidor.length > 40) medidas.servidor.shift();
    }
  };
})();
function registrarTela(ms){
  medidas.telas.push(Math.round(ms)); if(medidas.telas.length > 20) medidas.telas.shift();
  if(medidas.prontoEm === null) medidas.prontoEm = Math.round(performance.now());
}
function resumoVelocidade(){
  const media = (l) => l.length ? Math.round(l.reduce((a, b) => a + b, 0) / l.length) : null;
  const nav = performance.getEntriesByType('navigation')[0];
  const ms = (v) => v === null || v === undefined ? '—' : (v >= 1000 ? (v / 1000).toFixed(1).replace('.', ',') + ' s' : v + ' ms');
  return [
    ['Página carregada', ms(nav ? Math.round(nav.domContentLoadedEventEnd) : null)],
    ['Início na tela (dados guardados)', ms(medidas.cacheEm)],
    ['App pronto (dados novos)', ms(medidas.prontoEm)],
    ['Servidor — média', `${ms(media(medidas.servidor))} (${medidas.servidor.length} consultas)`],
    ['Servidor — mais lenta', ms(medidas.servidor.length ? Math.max(...medidas.servidor) : null)],
    ['Troca de tela — média', ms(media(medidas.telas.slice(1)))],
    ['Troca de tela — última', ms(medidas.telas.length > 1 ? medidas.telas[medidas.telas.length - 1] : null)],
    ['Instalado / versão', `${appInstalado() ? 'sim' : 'não'} · ${VERSAO_APP || '—'}`],
  ];
}

// ---------- quadro de assinatura (jornada e checklist) ----------
// Assina com o dedo/mouse. Na tela o traço é claro (fundo escuro do app);
// a imagem salva é refeita com tinta escura sobre fundo branco, para ficar
// legível no painel do escritório e em impressões.
// aoMudar(temAssinatura) avisa quando passa a ter (ou deixa de ter) traços.
function prepararAssinatura(canvas, aoMudar){
  const ctx = canvas.getContext('2d');
  const rect = canvas.getBoundingClientRect();
  const escala = window.devicePixelRatio || 1;
  canvas.width = rect.width * escala;
  canvas.height = rect.height * escala;
  ctx.scale(escala, escala);
  ctx.strokeStyle = '#edeef0'; ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const tracos = [];
  let atual = null;
  const posicao = (e) => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    try{ canvas.setPointerCapture(e.pointerId); } catch(err){ /* navegador antigo */ }
    const p = posicao(e);
    atual = [p]; tracos.push(atual);
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + 0.1, p.y); ctx.stroke();
    if(tracos.length === 1 && aoMudar) aoMudar(true);
  });
  canvas.addEventListener('pointermove', (e) => { if(!atual) return; const p = posicao(e); atual.push(p); ctx.lineTo(p.x, p.y); ctx.stroke(); });
  const soltar = () => { atual = null; };
  canvas.addEventListener('pointerup', soltar);
  canvas.addEventListener('pointercancel', soltar);
  return {
    vazia: () => !tracos.length,
    limpar(){ tracos.length = 0; ctx.clearRect(0, 0, canvas.width, canvas.height); if(aoMudar) aoMudar(false); },
    imagem(){
      // recorta só a área assinada (com uma margem), para a imagem não sair cheia de branco
      const pontos = tracos.flat(), margem = 14;
      const x0 = Math.max(0, Math.min(...pontos.map(p => p.x)) - margem), y0 = Math.max(0, Math.min(...pontos.map(p => p.y)) - margem);
      const x1 = Math.min(rect.width, Math.max(...pontos.map(p => p.x)) + margem), y1 = Math.min(rect.height, Math.max(...pontos.map(p => p.y)) + margem);
      const w = Math.max(x1 - x0, 120), h = Math.max(y1 - y0, 50), c = document.createElement('canvas');
      c.width = Math.round(w * 2); c.height = Math.round(h * 2);
      const x = c.getContext('2d');
      x.scale(2, 2);
      x.fillStyle = '#fff'; x.fillRect(0, 0, w, h);
      x.translate(-x0, -y0);
      x.strokeStyle = '#14181d'; x.lineWidth = 2.2; x.lineCap = 'round'; x.lineJoin = 'round';
      tracos.forEach(t => { x.beginPath(); x.moveTo(t[0].x, t[0].y); t.forEach(p => x.lineTo(p.x, p.y)); if(t.length === 1) x.lineTo(t[0].x + 0.1, t[0].y); x.stroke(); });
      return c.toDataURL('image/png');
    },
  };
}

// Abre a assinatura em TELA CHEIA (espaço grande para assinar com o dedo;
// dá para virar o celular de lado). Devolve a imagem, ou null se cancelar.
function pedirAssinatura({ titulo = 'Assinatura do motorista', texto = '', botao = 'Confirmar assinatura' } = {}){
  return new Promise((resolver) => {
    document.body.insertAdjacentHTML('beforeend', `
      <div class="assinatura-tela" id="assinaturaTela" role="dialog" aria-modal="true">
        <div class="assinatura-topo"><b>${esc(titulo)}</b>${texto ? `<span>${esc(texto)}</span>` : ''}</div>
        <div class="assinatura-area"><canvas id="assinaturaCanvasTela"></canvas><div class="assinatura-linha">Assine acima da linha · dica: vire o celular de lado para ter mais espaço</div></div>
        <div class="assinatura-botoes">
          <button type="button" class="btn btn-outline" id="assCancelar">Cancelar</button>
          <button type="button" class="btn btn-outline" id="assLimpar">Limpar</button>
          <button type="button" class="btn btn-primary" id="assConfirmar" disabled>${esc(botao)}</button>
        </div>
      </div>`);
    document.body.classList.add('assinando');
    const tela = document.getElementById('assinaturaTela');
    const confirmar = document.getElementById('assConfirmar');
    let quadro = null;
    const montar = () => {   // (re)monta o quadro no tamanho atual da tela
      const antigo = document.getElementById('assinaturaCanvasTela');
      const novo = antigo.cloneNode(false);
      antigo.replaceWith(novo);
      quadro = prepararAssinatura(novo, (tem) => { confirmar.disabled = !tem; });
      confirmar.disabled = true;
    };
    montar();
    // virou o celular: o quadro muda de tamanho e precisa assinar de novo
    let timerGiro = null;
    const aoGirar = () => { clearTimeout(timerGiro); timerGiro = setTimeout(montar, 250); };
    window.addEventListener('resize', aoGirar);
    const fechar = (resultado) => {
      window.removeEventListener('resize', aoGirar);
      document.body.classList.remove('assinando');
      tela.remove();
      resolver(resultado);
    };
    document.getElementById('assCancelar').addEventListener('click', () => fechar(null));
    document.getElementById('assLimpar').addEventListener('click', () => quadro && quadro.limpar());
    confirmar.addEventListener('click', () => { if(quadro && !quadro.vazia()) fechar(quadro.imagem()); });
  });
}

// ---------- instalar o app na tela inicial ----------
// No Android/Chrome o navegador avisa que dá para instalar (guardamos o
// aviso para o botão "Instalar"); no iPhone só dá pelo menu do Safari.
let pedidoInstalacao = null;
window.addEventListener('beforeinstallprompt', (e) => { pedidoInstalacao = e; });
window.addEventListener('appinstalled', () => { pedidoInstalacao = null; });
function appInstalado(){ return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; }
async function instalarApp(){
  if(pedidoInstalacao){
    try{
      pedidoInstalacao.prompt();
      const { outcome } = await pedidoInstalacao.userChoice;
      pedidoInstalacao = null;
      if(outcome === 'accepted') mostrarToast('✅ App instalado — procure o ícone MOVER.IA na tela inicial');
      return;
    } catch(e){ pedidoInstalacao = null; }
  }
  const iphone = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const passos = iphone
    ? ['Abra este site no <b>Safari</b>.', 'Toque no botão <b>Compartilhar</b> (quadrado com uma seta para cima).', 'Toque em <b>Adicionar à Tela de Início</b> e depois em <b>Adicionar</b>.']
    : ['Abra este site no <b>Chrome</b>.', 'Toque no menu <b>⋮</b> (canto de cima, à direita).', 'Toque em <b>Instalar app</b> ou <b>Adicionar à tela inicial</b> e confirme.'];
  abrirModal('Instalar o app', `
    <ol style="margin:0 0 12px; padding-left:20px; line-height:1.6;">${passos.map(p => `<li>${p}</li>`).join('')}</ol>
    <div class="l2">Pronto: o ícone do MOVER.IA aparece na tela inicial e o app abre mais rápido, em tela cheia.</div>`);
}

// Ícones (mesmos desenhos do protótipo). ic('truck', 18)
function ic(nome, tamanho = 18, cor = 'currentColor'){
  const p = {
    home:'M4 11.5 12 4l8 7.5M6 10v9h5v-5h2v5h5v-9',
    clock:'M12 7v5l3.5 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z',
    check:'M5 13l4 4L19 7',
    checksq:'M9 12l2 2 4-4M4 5h16v14H4z',
    truck:'M3 7h11v9H3zM14 10h4l3 3v3h-7zM7.5 19a1.8 1.8 0 1 0 0-3.6 1.8 1.8 0 0 0 0 3.6ZM17.5 19a1.8 1.8 0 1 0 0-3.6 1.8 1.8 0 0 0 0 3.6Z',
    dots:'M5 12h.01M12 12h.01M19 12h.01',
    doc:'M7 3h7l4 4v14H7zM14 3v4h4',
    award:'M12 3l2.5 5 5.5.7-4 3.9 1 5.5L12 15.6 7 18.1l1-5.5-4-3.9L9.5 8Z',
    cal:'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
    chev:'M9 5l7 7-7 7',
    back:'M15 5l-7 7 7 7',
    bell:'M6 10a6 6 0 1 1 12 0c0 4 1.5 5 1.5 5h-15S6 14 6 10ZM10 19a2 2 0 0 0 4 0',
    cam:'M4 8h4l1.5-2h5L16 8h4v11H4z M12 12a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z',
    alert:'M12 3 2 20h20zM12 10v4M12 17h.01',
    user:'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 20c1.5-4 5-6 8-6s6.5 2 8 6',
    flag:'M6 3v18M6 4h11l-2.5 3.5L17 11H6',
    fuel:'M5 20V6a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v14M4 20h10M16 8l2.5 2.5A1.5 1.5 0 0 1 19 11.5V17a1.5 1.5 0 0 1-3 0',
    map:'M9 3 4 5v16l5-2 6 2 5-2V3l-5 2-6-2Zm0 0v16m6-14v16',
    wrench:'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z',
    download:'M12 3v11M8 10l4 4 4-4M4 19h16',
    upload:'M12 15V4M8 8l4-4 4 4M4 19h16',
    sync:'M4 4v5h5M20 20v-5h-5M4.5 15a8 8 0 0 0 14.5 3.5M19.5 9a8 8 0 0 0-14.5-3.5',
    gear:'M4 6h16M4 6a2 2 0 1 0 4 0 2 2 0 0 0-4 0ZM4 18h16M14 18a2 2 0 1 0 4 0 2 2 0 0 0-4 0Z',
    users:'M8 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM2 20c1-3.5 3.6-5.5 6-5.5s5 2 6 5.5M16 4.2a3.3 3.3 0 0 1 0 6.4M15 14c2.2.4 4 2.3 5 6',
    lock:'M6 11V8a6 6 0 1 1 12 0v3M5 11h14v10H5zM12 15v3',
    eye:'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12ZM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
    qr:'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2M14 18h2v2M18 18h2v2',
    plus:'M12 5v14M5 12h14',
    x:'M6 6l12 12M18 6 6 18',
    logout:'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10',
    pause:'M9 5v14M15 5v14',
    play:'M7 5l12 7-12 7z',
    stop:'M6 6h12v12H6z',
  }[nome] || '';
  return `<svg width="${tamanho}" height="${tamanho}" viewBox="0 0 24 24" fill="none" stroke="${cor}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p.split('M').filter(Boolean).map(d => '<path d="M' + d + '"/>').join('')}</svg>`;
}

// Medidor em meia-lua (verde → amarelo → vermelho conforme se aproxima do limite)
function gauge(valor, maximo, tamanho = 170){
  const pct = Math.max(0, Math.min(valor / maximo, 1));
  const r = tamanho / 2 - 14, cx = tamanho / 2, cy = tamanho / 2;
  const a1 = Math.PI, a2 = Math.PI - pct * Math.PI;
  const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
  const x2 = cx + r * Math.cos(a2), y2 = cy - r * Math.sin(a2);
  const cor = pct < 0.75 ? '#2ba84a' : pct < 0.95 ? '#f5a623' : '#e5484d';
  return `<svg width="${tamanho}" height="${tamanho / 1.85}" viewBox="0 0 ${tamanho} ${tamanho / 1.85}">
    <path d="M14 ${cy} A ${r} ${r} 0 0 1 ${tamanho - 14} ${cy}" fill="none" stroke="#2a323c" stroke-width="12" stroke-linecap="round"/>
    ${pct > 0.005 ? `<path d="M${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}" fill="none" stroke="${cor}" stroke-width="12" stroke-linecap="round"/>` : ''}
  </svg>`;
}

// Tudo que vem do banco (nomes, textos lidos por OCR etc.) passa por aqui
// antes de ir pra tela — evita que um texto com "<" quebre a página.
function esc(valor){
  return String(valor == null ? '' : valor)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function iniciais(nome){
  const partes = String(nome || '').trim().split(/\s+/).filter(p => p.length > 2 || /^[A-ZÀ-Ý]/.test(p));
  if(!partes.length) return '?';
  const primeira = partes[0][0];
  const ultima = partes.length > 1 ? partes[partes.length - 1][0] : '';
  return (primeira + ultima).toUpperCase();
}

// ---------- datas ----------
// Datas "puras" do banco (ex: validade '2031-09-21') são lidas como dia local,
// sem o fuso deslocar pro dia anterior.
function paraData(valor){
  if(!valor) return null;
  if(/^\d{4}-\d{2}-\d{2}$/.test(valor)){ const [a, m, d] = valor.split('-').map(Number); return new Date(a, m - 1, d); }
  return new Date(valor);
}
function fmtData(valor){ const d = paraData(valor); return d ? d.toLocaleDateString('pt-BR') : '—'; }
function fmtDataCurta(valor){ const d = paraData(valor); return d ? d.toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit' }) : '—'; }
function fmtHora(valor){ const d = paraData(valor); return d ? d.toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' }) : '—'; }
function fmtDataHora(valor){ return valor ? `${fmtData(valor)} ${fmtHora(valor)}` : '—'; }
function inicioDoDia(d = new Date()){ return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
function diasAte(valor){
  const d = paraData(valor);
  if(!d) return null;
  return Math.round((inicioDoDia(d) - inicioDoDia()) / 86400000);
}
function fmtMinutos(totalMin){
  totalMin = Math.max(0, Math.round(totalMin));
  const h = Math.floor(totalMin / 60), m = totalMin % 60;
  return `${h}h${String(m).padStart(2, '0')}`;
}
function hojeExtenso(){
  return new Date().toLocaleDateString('pt-BR', { day:'numeric', month:'long' });
}

// ---------- status de documento ----------
// Se o documento tem validade, o status é calculado pela data (vencido /
// vence em até 30 dias / em dia) — assim nunca fica desatualizado. Sem
// validade, vale o status que foi marcado à mão no cadastro.
const DIAS_ALERTA_DOCUMENTO = 30;
function statusDocumento(doc){
  if(doc && doc.validade){
    const dias = diasAte(doc.validade);
    if(dias < 0) return 'vencido';
    if(dias <= DIAS_ALERTA_DOCUMENTO) return 'vence_em_breve';
    return 'ok';
  }
  return (doc && doc.status) || 'ok';
}
function textoVencimento(doc){
  if(!doc.validade) return statusDocumento(doc) === 'ok' ? 'Sem validade informada' : 'Validade não informada';
  const dias = diasAte(doc.validade);
  if(dias < 0) return `Venceu em ${fmtData(doc.validade)}`;
  if(dias === 0) return 'Vence hoje';
  if(dias <= DIAS_ALERTA_DOCUMENTO) return `Vence em ${dias} dia${dias > 1 ? 's' : ''} (${fmtData(doc.validade)})`;
  return `Válido até ${fmtData(doc.validade)}`;
}
const ROTULO_STATUS_DOC = { ok:'Em dia', vence_em_breve:'A vencer', vencido:'Vencido' };
const COR_STATUS_DOC = { ok:'green', vence_em_breve:'amber', vencido:'red' };
const PESO_STATUS_DOC = { ok:0, vence_em_breve:1, vencido:2 };

// selo arredondado (app do motorista)
function pillStatus(cor, texto){
  const classe = { green:'pill-green', amber:'pill-amber', red:'pill-red', blue:'pill-blue', grey:'pill-grey' }[cor] || 'pill-grey';
  return `<span class="status-pill ${classe}"><span class="pill-dot"></span>${esc(texto)}</span>`;
}
// selo retangular (painel do escritório)
function badge(cor, texto){
  const classe = { green:'badge-green', amber:'badge-amber', red:'badge-red', blue:'badge-blue', grey:'badge-grey' }[cor] || 'badge-grey';
  return `<span class="badge ${classe}">${esc(texto)}</span>`;
}
function badgeDoc(doc){ const s = statusDocumento(doc); return badge(COR_STATUS_DOC[s], ROTULO_STATUS_DOC[s]); }
function pillDoc(doc){ const s = statusDocumento(doc); return pillStatus(COR_STATUS_DOC[s], ROTULO_STATUS_DOC[s]); }

// ---------- jornada: tempo de condução a partir dos eventos ----------
// Eventos em ordem (inicio, pausa, retomada, ..., fim). Soma os trechos
// "rodando" e informa há quanto tempo está rodando sem parar.
const LIMITE_CONDUCAO_CONTINUA_MIN = 5 * 60 + 30; // Lei 13.103: 5h30 seguidas
function calcularConducao(eventos, agora = new Date()){
  let totalMin = 0, inicioTrecho = null, paradas = 0;
  (eventos || []).forEach(ev => {
    const t = new Date(ev.criado_em);
    if(ev.tipo === 'inicio' || ev.tipo === 'retomada'){ if(!inicioTrecho) inicioTrecho = t; }
    else if(ev.tipo === 'pausa' || ev.tipo === 'fim'){
      if(ev.tipo === 'pausa') paradas++;
      if(inicioTrecho){ totalMin += (t - inicioTrecho) / 60000; inicioTrecho = null; }
    }
  });
  const continuoMin = inicioTrecho ? (agora - inicioTrecho) / 60000 : 0;
  if(inicioTrecho) totalMin += continuoMin;
  return { totalMin, continuoMin, rodando: !!inicioTrecho, paradas };
}
const TIPO_EVENTO_LABEL = { inicio:'Início da jornada', pausa:'Parada', retomada:'Retomada', fim:'Fim da jornada' };
const TIPO_EVENTO_ICONE = { inicio:'play', pausa:'pause', retomada:'play', fim:'flag' };

// ---------- exportar planilha (abre no Excel) ----------
function baixarCSV(nome, cabecalho, linhas){
  const celula = (v) => { const s = String(v == null ? '' : v); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const csv = [cabecalho, ...linhas].map(l => l.map(celula).join(';')).join('\r\n');
  const blob = new Blob(['﻿' + csv], { type:'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome.replace(/[^a-z0-9]+/gi, '_').toLowerCase() + '.csv';
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

// ---------- janela (modal) ----------
function abrirModal(titulo, corpoHtml){
  fecharModal();
  document.body.insertAdjacentHTML('beforeend', `
    <div class="modal-fundo" id="modalGenerico">
      <div class="modal" role="dialog" aria-modal="true">
        <div class="modal-head"><h3>${esc(titulo)}</h3><button class="modal-fechar" id="btnFecharModal" aria-label="Fechar">${ic('x', 18)}</button></div>
        <div class="modal-body">${corpoHtml}</div>
      </div>
    </div>`);
  const fundo = document.getElementById('modalGenerico');
  fundo.addEventListener('click', (e) => { if(e.target === fundo) fecharModal(); });
  document.getElementById('btnFecharModal').addEventListener('click', fecharModal);
  return fundo;
}
function fecharModal(){ const m = document.getElementById('modalGenerico'); if(m) m.remove(); }
