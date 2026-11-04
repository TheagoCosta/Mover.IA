// Teste automático de todas as telas no ambiente de testes (Supabase falso, nada real é tocado).
// Abre o app num Chrome sem janela como escritório, motorista e mecânico, passa por cada tela
// e falha se aparecer erro de JavaScript, "Erro ao carregar" ou tela vazia.
// Uso (na raiz do repositório):  node ferramentas/teste/rodar-testes.js
// Rodar antes de cada commit. Fotos de cada tela ficam em ferramentas/teste/fotos/ (fora do git).
const fs = require('fs'), path = require('path'), os = require('os'), http = require('http');
const { spawn, execFileSync } = require('child_process');
const repo = path.join(__dirname, '..', '..');
const PORTA = 8769;
const espera = (ms) => new Promise(r => setTimeout(r, ms));
const FOTOS = process.argv.includes('--fotos') ? path.join(__dirname, 'fotos') : null;

function acharChrome(){
  const opcoes = [process.env.CHROME, 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', '/usr/bin/google-chrome', '/usr/bin/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
  const achado = opcoes.find(p => p && fs.existsSync(p));
  if(!achado) throw new Error('Não achei o Chrome/Edge. Defina a variável CHROME com o caminho.');
  return achado;
}

// o que cada papel percorre: código que roda dentro da página e devolve uma lista de problemas
const ESPERAR = 'await new Promise(r => setTimeout(r, 1300));';
const ACEITAR_PRIVACIDADE = `if(document.getElementById('avisoPrivacidade')){ chkPrivacidade.click(); btnAceitarPrivacidade.click(); await new Promise(r => setTimeout(r, 300)); }`;
const ROTEIROS = {
  admin_transportadora: `
    const problemas = [], telas = [];
    for(const s of SECOES_ESCRITORIO){
      screen = s.k; loadEscritorio(); ${ESPERAR}
      const el = document.getElementById('screenContent'), txt = el ? el.innerText : '';
      if(/Erro ao carregar/.test(txt)) problemas.push(s.l + ': ' + txt.slice(0, 200));
      else if(txt.trim().length < 20 || /^Carregando/.test(txt.trim())) problemas.push(s.l + ': tela vazia ou presa em "Carregando"');
      telas.push(s.k);
    }
    // janelas mais usadas
    screen = 'viagens'; loadEscritorio(); ${ESPERAR}
    document.getElementById('btnNovaViagemSecao').click(); await new Promise(r => setTimeout(r, 300));
    if(!document.getElementById('formNovaViagem')) problemas.push('Nova viagem: a janela não abriu'); fecharModal();
    screen = 'abastecimento'; loadEscritorio(); ${ESPERAR}
    const compra = document.querySelector('[data-mov-tanque="entrada"]');
    if(!compra) problemas.push('Abastecimento: botão Compra dos tanques não apareceu'); else { compra.click(); await new Promise(r => setTimeout(r, 300)); if(!document.getElementById('formMovTanque')) problemas.push('Compra de combustível: a janela não abriu'); fecharModal(); }
    // pneus: as três abas, o mapa de um veículo e a ficha de um pneu
    for(const aba of ['veiculos', 'pneus', 'marcas']){
      abaPneus = aba; screen = 'pneus'; loadEscritorio(); ${ESPERAR}
      const txt = (document.getElementById('conteudoPneus') || {}).innerText || '';
      if(txt.trim().length < 20) problemas.push('Pneus (' + aba + '): aba vazia');
    }
    abaPneus = 'veiculos'; loadEscritorio(); ${ESPERAR}
    const veic = document.querySelector('[data-unid-pneus="c1"]');   // o falso tem pneus montados no v1, que está no conjunto c1
    if(!veic) problemas.push('Pneus: lista de conjuntos vazia'); else {
      veic.click(); await new Promise(r => setTimeout(r, 300));
      if(document.querySelectorAll('#modalGenerico .pn-veic').length < 2) problemas.push('Pneus: o desenho não mostrou o conjunto inteiro');
      const medirTodos = document.getElementById('btnMedirTodos');
      if(!medirTodos) problemas.push('Pneus: sem botão Medir todos'); else { medirTodos.click(); await new Promise(r => setTimeout(r, 300)); if(!document.querySelector('#formMedirTodos [data-sulco-pneu]')) problemas.push('Pneus: Medir todos sem pneus'); fecharModal(); veic.click(); await new Promise(r => setTimeout(r, 300)); }
      const pn = document.querySelector('#modalGenerico [data-pneu-mapa]');
      if(!pn) problemas.push('Pneus: o mapa do veículo não mostrou os pneus'); else { pn.click(); ${ESPERAR} if(!document.getElementById('pnHistorico') || /Carregando|Não consegui/.test(document.getElementById('pnHistorico').innerText)) problemas.push('Pneus: a ficha do pneu não carregou o histórico'); }
      fecharModal();
    }
    return { telas, problemas };`,
  motorista: `
    const problemas = [], telas = [];
    for(const k of [...document.querySelectorAll('[data-tab]')].map(b => b.dataset.tab)){
      const b = document.querySelector('[data-tab="' + k + '"]'); if(!b) continue;
      b.click(); ${ESPERAR}
      const txt = (document.querySelector('.m-content') || document.body).innerText;
      if(/Erro ao carregar|Não consegui carregar/.test(txt)) problemas.push(k + ': ' + txt.slice(0, 200));
      else if(txt.trim().length < 20) problemas.push(k + ': tela vazia');
      telas.push(k);
    }
    if(!telas.length) problemas.push('nenhuma aba encontrada no app do motorista');
    return { telas, problemas };`,
  mecanico: `
    const problemas = [], telas = [];
    for(const k of [...document.querySelectorAll('[data-tab-mec]')].map(b => b.dataset.tabMec)){
      const b = document.querySelector('[data-tab-mec="' + k + '"]'); if(!b) continue;
      b.click(); ${ESPERAR}
      const txt = document.body.innerText;
      if(/Erro ao carregar|Não consegui carregar/.test(txt)) problemas.push(k + ': ' + txt.slice(0, 200));
      telas.push(k);
    }
    if(!telas.length) problemas.push('nenhuma aba encontrada no app do mecânico');
    return { telas, problemas };`,
};

async function rodarPapel(chrome, papel, tela){
  const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'moveria-teste-'));
  const nav = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-first-run', '--remote-debugging-port=0', `--user-data-dir=${perfil}`, 'about:blank'], { stdio: 'ignore' });
  const erros = [];
  try{
    let porta = null;
    for(let i = 0; i < 100 && !porta; i++){ await espera(150); const f = path.join(perfil, 'DevToolsActivePort'); if(fs.existsSync(f)) porta = fs.readFileSync(f, 'utf8').split('\n')[0].trim(); }
    if(!porta) throw new Error('o Chrome não abriu');
    const pg = (await (await fetch(`http://127.0.0.1:${porta}/json/list`)).json()).find(t => t.type === 'page');
    const ws = new WebSocket(pg.webSocketDebuggerUrl); await new Promise(ok => ws.onopen = ok);
    let id = 0; const pend = {};
    ws.onmessage = (m) => {
      const d = JSON.parse(m.data);
      if(d.id && pend[d.id]){ pend[d.id](d); delete pend[d.id]; }
      if(d.method === 'Runtime.exceptionThrown'){ const x = d.params.exceptionDetails; erros.push('erro de JavaScript: ' + ((x.exception && x.exception.description) || x.text).split('\n').slice(0, 2).join(' ')); }
      if(d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') erros.push('console.error: ' + d.params.args.map(a => a.value || a.description).join(' ').slice(0, 300));
    };
    const cmd = (method, params = {}) => new Promise(ok => { const n = ++id; pend[n] = ok; ws.send(JSON.stringify({ id: n, method, params })); });
    await cmd('Runtime.enable'); await cmd('Page.enable');
    await cmd('Emulation.setDeviceMetricsOverride', { width: tela[0], height: tela[1], deviceScaleFactor: 1, mobile: tela[0] < 768 });
    await cmd('Page.navigate', { url: `http://127.0.0.1:${PORTA}/teste/teste.html?papel=${papel}` });
    await espera(3000);
    const r = await cmd('Runtime.evaluate', { expression: `(async () => { ${ACEITAR_PRIVACIDADE} ${ROTEIROS[papel]} })()`, awaitPromise: true, returnByValue: true });
    if(FOTOS){ fs.mkdirSync(FOTOS, { recursive: true }); const f = await cmd('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(FOTOS, papel + '.png'), Buffer.from(f.result.data, 'base64')); }
    ws.close();
    const res = r.result;
    if(res.exceptionDetails) return { telas: [], problemas: ['o roteiro de teste quebrou: ' + JSON.stringify(res.exceptionDetails).slice(0, 300)], erros };
    return { ...res.result.value, erros };
  } finally { nav.kill(); await espera(300); try{ fs.rmSync(perfil, { recursive: true, force: true }); } catch(e){} }
}

(async () => {
  execFileSync(process.execPath, [path.join(__dirname, 'montar.js')], { stdio: 'ignore' });
  const servidor = spawn(process.execPath, [path.join(__dirname, 'servir.js'), repo, String(PORTA)], { stdio: 'ignore' });
  await espera(800);
  const chrome = acharChrome();
  let falhou = false;
  try{
    for(const [papel, tela] of [['admin_transportadora', [1366, 900]], ['motorista', [390, 844]], ['mecanico', [390, 844]]]){
      const r = await rodarPapel(chrome, papel, tela);
      const todos = [...r.problemas, ...r.erros];
      console.log(`${todos.length ? '✗' : '✓'} ${papel}: ${r.telas.length} telas${todos.length ? '' : ' sem erro'}`);
      todos.forEach(p => console.log('    - ' + p));
      if(todos.length) falhou = true;
    }
  } finally { servidor.kill(); }
  console.log(falhou ? '\nFALHOU — corrija antes de publicar.' : '\nTudo certo.');
  process.exit(falhou ? 1 : 0);
})().catch(e => { console.error(e.message); process.exit(1); });
