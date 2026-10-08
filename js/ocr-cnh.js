// MOVER.IA — leitura da CNH por imagem (OCR) e cadastro automático do motorista
// (arquivo carregado pelo index.html; todas as funções ficam globais,
// então um arquivo pode chamar funções dos outros normalmente)

// Alguns documentos (como a CNH Digital) trazem o nome/validade só como foto,
// sem texto selecionável no PDF. Nesse caso, renderiza a página como imagem
// (ou usa a imagem enviada direto) e lê o texto dela por reconhecimento óptico
// (OCR), rodando inteiramente no navegador — sem enviar a imagem pra fora.
// Usa "bloco único uniforme" (PSM 6) em vez do modo automático — funciona
// bem melhor em documentos de identidade com várias colunas/campos como a
// CNH, e renderiza numa resolução bem alta pra não perder os números
// pequenos (CPF, nº de registro) nem o texto em vermelho do cartão.
async function ocrArquivo(file){ return (await ocrArquivoCompleto(file)).texto; }

// Lê o texto da página e, se for CNH, também a categoria (ver lerCategoriaNaImagem)
async function ocrArquivoCompleto(file){
  let worker = null;
  try{
    await carregarBiblioteca('ocr');
    let fonteImagem = file;
    if(file.type === 'application/pdf'){
      await usarPdfJs();
      const buffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
      const pagina = await pdf.getPage(1);
      const viewport = pagina.getViewport({ scale: 4.5 });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await pagina.render({ canvasContext: ctx, viewport }).promise;
      fonteImagem = canvas;
    }
    worker = await Tesseract.createWorker('eng');
    await worker.setParameters({ tessedit_pageseg_mode: '6' });
    const resultado = await worker.recognize(fonteImagem, {}, { text: true, blocks: true });
    const texto = (resultado && resultado.data && resultado.data.text) || '';
    // modelo novo: a categoria vem no texto logo após o nº de registro (mais confiável);
    // modelo antigo: o texto não traz, então lê o recorte da caixa "CAT. HAB." na imagem
    let categoria = extrairCategoriaCNH(texto);
    if(!categoria){ try{ categoria = await lerCategoriaNaImagem(worker, resultado.data, fonteImagem); } catch(e){ /* fica sem */ } }
    return { texto, categoria };
  } catch(e){
    return { texto: '', categoria: null };
  } finally {
    if(worker) try{ await worker.terminate(); } catch(e){ /* ignora */ }
  }
}

// ---------- categoria da CNH ----------
// Campo "9 CAT HAB" (modelo novo) ou "CAT. HAB." (modelo antigo). No modelo
// antigo o valor fica numa caixinha em vermelho ao lado de campos hachurados,
// e a leitura da página inteira embaralha — então acha o rótulo na imagem,
// recorta logo abaixo dele e lê só ali, aceitando apenas as letras A–E.
const CATEGORIAS_CNH = ['ACC', 'AB', 'AC', 'AD', 'AE', 'A', 'B', 'C', 'D', 'E'];
function categoriaDoTexto(t){
  const candidatos = String(t || '').toUpperCase().match(/[A-E]{1,3}/g) || [];
  return candidatos.find(c => CATEGORIAS_CNH.includes(c)) || null;
}
// Pelo texto (modelo novo): a categoria vem logo depois do nº de registro (11 dígitos)
function extrairCategoriaCNH(texto){
  const t = normalizarTextoComEspacos(texto);
  const m = t.match(/\b\d{11}\b[^A-Z0-9\n]{0,4}([A-E]{1,3})\b/);
  return m && CATEGORIAS_CNH.includes(m[1]) ? m[1] : null;
}
function palavrasDoOcr(dados){
  if(dados && dados.words && dados.words.length) return dados.words;
  const lista = [];
  (dados && dados.blocks || []).forEach(b => (b.paragraphs || []).forEach(p => (p.lines || []).forEach(l => (l.words || []).forEach(w => lista.push(w)))));
  return lista;
}
async function lerCategoriaNaImagem(worker, dados, imagem){
  const palavras = palavrasDoOcr(dados);
  const norm = (w) => normalizarTextoComEspacos(w.text || '').replace(/[^A-Z]/g, '');
  const i = palavras.findIndex((w, k) => norm(w) === 'CAT' && palavras[k + 1] && /^HA[BR]/.test(norm(palavras[k + 1])));
  if(i < 0) return null;
  const a = palavras[i].bbox, b = palavras[i + 1].bbox;
  const h = Math.max(a.y1 - a.y0, b.y1 - b.y0);
  let fonte = imagem;
  if(!(imagem instanceof HTMLCanvasElement)){
    const bmp = await createImageBitmap(imagem);
    fonte = document.createElement('canvas'); fonte.width = bmp.width; fonte.height = bmp.height;
    fonte.getContext('2d').drawImage(bmp, 0, 0);
  }
  await worker.setParameters({ tessedit_pageseg_mode: '7', tessedit_char_whitelist: 'ABCDE' });
  // a categoria fica abaixo do rótulo, dentro da caixa, impressa em vermelho: a cor só serve
  // para LOCALIZAR o texto (recorte justo, sem as bordas da caixa, que o OCR confunde com "C")
  const x0 = Math.min(a.x0, b.x0), x1 = Math.max(a.x1, b.x1), y1 = Math.max(a.y1, b.y1);
  const area = { left: x0 - h * 0.6, top: y1 + h * 0.05, right: x1 + h * 0.6, bottom: y1 + h * 2.4 };
  const achado = localizarVermelho(fonte, area);
  // mancha maior que 1–3 letras é o desenho do fundo (modelo novo), não a categoria: não arrisca
  if(!achado || achado.right - achado.left > h * 3 || achado.bottom - achado.top > h * 1.5) return null;
  const tentativas = [];
  tentativas.push({ left: achado.left - h * 0.25, top: achado.top - h * 0.2, right: achado.right + h * 0.25, bottom: achado.bottom + h * 0.2 });
  for(const t of tentativas){
    const recorte = recorteCategoria(fonte, t);
    if(!recorte) continue;
    const r = await worker.recognize(recorte);
    const cat = categoriaDoTexto(r && r.data && r.data.text);
    if(cat) return cat;
  }
  return null;
}

// Acha o retângulo dos pixels avermelhados na área (ignora pontos soltos). Devolve null se não houver.
function localizarVermelho(fonte, t){
  const left = Math.max(0, Math.round(t.left)), top = Math.max(0, Math.round(t.top));
  const width = Math.min(fonte.width, Math.round(t.right)) - left, height = Math.min(fonte.height, Math.round(t.bottom)) - top;
  if(width < 4 || height < 4) return null;
  const d = fonte.getContext('2d').getImageData(left, top, width, height).data;
  const linhas = new Array(height).fill(0), colunas = new Array(width).fill(0);
  for(let y = 0; y < height; y++) for(let x = 0; x < width; x++){
    const p = (y * width + x) * 4, r = d[p], g = d[p + 1], b = d[p + 2];
    if(r > 140 && r - g > 30 && r - b > 30){ linhas[y]++; colunas[x]++; }
  }
  const total = linhas.reduce((s, v) => s + v, 0);
  if(total < 15) return null;
  // faixa vertical: o maior bloco contínuo de linhas com vermelho
  let melhor = null, ini = -1, soma = 0;
  for(let y = 0; y <= height; y++){
    if(y < height && linhas[y] > 0){ if(ini < 0){ ini = y; soma = 0; } soma += linhas[y]; }
    else if(ini >= 0){ if(!melhor || soma > melhor.soma) melhor = { ini, fim: y - 1, soma }; ini = -1; }
  }
  const xs = colunas.map((v, x) => v > 0 ? x : -1).filter(x => x >= 0);
  return { left: left + xs[0], right: left + xs[xs.length - 1] + 1, top: top + melhor.ini, bottom: top + melhor.fim + 1 };
}

// Recorta a região, amplia 3x e passa para tons de cinza usando o canal VERDE com o contraste
// esticado: a categoria é impressa em vermelho (fica escura no verde) e o fundo é claro.
function recorteCategoria(fonte, t){
  const left = Math.max(0, Math.round(t.left)), top = Math.max(0, Math.round(t.top));
  const width = Math.min(fonte.width, Math.round(t.right)) - left, height = Math.min(fonte.height, Math.round(t.bottom)) - top;
  if(width < 4 || height < 4) return null;
  const escala = 3, borda = 24;
  const c = document.createElement('canvas');
  c.width = width * escala + borda * 2; c.height = height * escala + borda * 2;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(fonte, left, top, width, height, borda, borda, width * escala, height * escala);
  const img = ctx.getImageData(0, 0, c.width, c.height), d = img.data;
  let min = 255, max = 0;
  for(let p = 0; p < d.length; p += 4){ const g = d[p + 1]; if(g < min) min = g; if(g > max) max = g; }
  const faixa = Math.max(1, max - min);
  for(let p = 0; p < d.length; p += 4){
    const v = Math.round((d[p + 1] - min) * 255 / faixa);
    d[p] = d[p + 1] = d[p + 2] = v;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

// Campos específicos da CNH que valem a pena buscar "pelo rótulo" no texto
// lido (em vez de só listar todas as datas/números achados): o nº de
// registro e a validade, que na CNH aparecem em vermelho no layout oficial.
function normalizarTextoComEspacos(t){
  return (t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
}

function extrairNumeroRegistroCNH(texto){
  const t = normalizarTextoComEspacos(texto);
  const idx = t.search(/N.?\s*REGISTRO/);
  if(idx === -1) return null;
  const trecho = t.slice(idx, idx + 80);
  // Pode ter o CPF (com pontos/traço) pelo caminho — pega o 1º bloco de
  // 8 a 11 dígitos corridos (o CPF nunca aparece assim, sempre com pontuação).
  const m = trecho.match(/\d{8,11}/);
  return m ? m[0] : null;
}

function extrairValidadeCNH(texto){
  const t = normalizarTextoComEspacos(texto);
  // Modelo novo da CNH: "DATA EMISSAO" e "VALIDADE" aparecem como rótulos em
  // sequência, seguidos logo abaixo pelas duas datas correspondentes na
  // mesma ordem — a 2ª data é a validade.
  const idx = t.search(/DATA\s*EMISS[AÃ]O/);
  if(idx !== -1){
    const trecho = t.slice(idx, idx + 150);
    const encontradas = trecho.match(/\d{2}\/\d{2}\/\d{4}/g);
    if(encontradas && encontradas.length >= 2) return encontradas[1];
  }
  // Modelo antigo (DENATRAN): a linha de rótulos é "Nº REGISTRO | VALIDADE |
  // 1ª HABILITAÇÃO" e, abaixo, os valores na mesma ordem — a 1ª data depois
  // do rótulo VALIDADE é a validade.
  const idxVal = t.search(/VALIDADE/);
  if(idxVal !== -1){
    const trecho = t.slice(idxVal, idxVal + 200);
    const m = trecho.match(/\d{2}\/\d{2}\/\d{4}/);
    if(m) return m[0];
  }
  // Sem rótulo nenhum, fica a última alternativa: entre as datas
  // encontradas, a validade é a única que ainda está no futuro
  // (nascimento/1ª habilitação/emissão são sempre datas passadas).
  const dataBrParaDate = (d) => { const [dd, mm, yyyy] = d.split('/'); return new Date(`${yyyy}-${mm}-${dd}`); };
  const todasDatas = t.match(/\d{2}\/\d{2}\/\d{4}/g) || [];
  const hoje = new Date();
  const futuras = todasDatas.filter(d => dataBrParaDate(d) > hoje);
  return futuras.length ? futuras.sort((a, b) => dataBrParaDate(a) - dataBrParaDate(b)).pop() : null;
}

// Palavras dos rótulos/cabeçalhos impressos na CNH — uma "linha de nome"
// que tenha alguma delas não é nome de pessoa.
const PALAVRAS_ROTULO_CNH = new Set(['REPUBLICA','FEDERATIVA','BRASIL','MINISTERIO','TRANSPORTES',
  'INFRAESTRUTURA','SECRETARIA','NACIONAL','TRANSITO','DEPARTAMENTO','ESTADUAL','CARTEIRA',
  'HABILITACAO','NOME','SOBRENOME','IDENTIDADE','EMISSOR','CPF','NASCIMENTO','FILIACAO',
  'PERMISSAO','REGISTRO','VALIDADE','CATEGORIA','OBSERVACOES','ASSINATURA','PORTADOR','SENATRAN',
  'DENATRAN','CONTRAN','SERPRO','DOCUMENTO','EMISSAO','DATA','LOCAL','DRIVER','LICENSE',
  'PERMISO','CONDUCCION','ASSINADO','DIGITALMENTE','QR','CODE','GOVBR','SSP','DETRAN']);
const CONECTIVOS_NOME = new Set(['DE','DA','DO','DAS','DOS','E']);

// O OCR costuma "grudar" lixo do fundo/foto do cartão depois do nome (letras
// soltas, minúsculas, símbolos, números). O nome em si sempre vem em
// MAIÚSCULAS, então pega só a sequência de palavras maiúsculas do começo da
// linha (tolerando até 2 "sujeirinhas" antes dela) e descarta o resto.
function limparLinhaNome(linha){
  const tokens = (linha || '').split(/\s+/).filter(Boolean);
  const ehPalavraNome = (tk) => /^[A-ZÀ-Ý]{2,}$/.test(tk) || CONECTIVOS_NOME.has(tk);
  let i = 0;
  while(i < tokens.length && i < 2 && !(/^[A-ZÀ-Ý]{2,}$/.test(tokens[i]))) i++;
  const nome = [];
  for(; i < tokens.length && ehPalavraNome(tokens[i]); i++) nome.push(tokens[i]);
  while(nome.length && CONECTIVOS_NOME.has(nome[nome.length - 1])) nome.pop();
  const principais = nome.filter(p => !CONECTIVOS_NOME.has(p));
  if(principais.length < 2 || nome.join('').length < 5) return null;
  if(nome.some(p => PALAVRAS_ROTULO_CNH.has(normalizarTextoComEspacos(p)))) return null;
  // rótulo "1ª HABILITAÇÃO" (o OCR lê HABILITAGAO, HABILITACAO...) ao lado do nome
  if(nome.some(p => /^HABILITA/.test(normalizarTextoComEspacos(p)))) return null;
  return nome.join(' ');
}

function formatarNomeProprio(nome){
  return nome.toLowerCase()
    .replace(/(^|\s)(\S)/g, (m, p1, p2) => p1 + p2.toUpperCase())
    .replace(/ (De|Da|Do|Das|Dos|E)(?= )/g, (m, c) => ' ' + c.toLowerCase());
}

// Lê o nome do motorista no texto da CNH. Existem 2 modelos de CNH em
// circulação (novo, com rótulo "NOME E SOBRENOME"; e o antigo do DENATRAN,
// em que o nome vem logo acima de "DOC. IDENTIDADE"), e o OCR às vezes não
// consegue ler o rótulo — por isso tenta várias estratégias, da mais segura
// pra menos segura. Devolve { nome, confiavel }: "confiavel" = achou o nome
// pela posição de um rótulo conhecido; senão foi um palpite e vale a pena
// pedir pro Thiago conferir antes de criar o login.
function extrairNomeCNH(texto){
  const linhas = (texto || '').split('\n').map(l => l.trim()).filter(Boolean);
  const linhasNorm = linhas.map(normalizarTextoComEspacos);

  // 1) Modelo novo: nome logo depois do rótulo "NOME E SOBRENOME" — na
  // mesma linha (quando o OCR junta os dois) ou nas 2 linhas de baixo.
  const idxSobrenome = linhasNorm.findIndex(l => l.includes('SOBRENOME'));
  if(idxSobrenome !== -1){
    const mesmaLinha = limparLinhaNome(linhas[idxSobrenome].replace(/^.*SOBRENOME/i, ''));
    if(mesmaLinha) return { nome: formatarNomeProprio(mesmaLinha), confiavel: true };
    for(let i = idxSobrenome + 1; i <= idxSobrenome + 2 && i < linhas.length; i++){
      const nome = limparLinhaNome(linhas[i]);
      if(nome) return { nome: formatarNomeProprio(nome), confiavel: true };
    }
  }

  // 2) Modelo antigo: nome fica na linha logo acima de "DOC. IDENTIDADE".
  const idxIdentidade = linhasNorm.findIndex(l => l.includes('IDENTIDADE'));
  if(idxIdentidade > 0){
    for(let i = idxIdentidade - 1; i >= Math.max(0, idxIdentidade - 2); i--){
      const nome = limparLinhaNome(linhas[i]);
      if(nome) return { nome: formatarNomeProprio(nome), confiavel: true };
    }
  }

  // 3) Palpite: 1ª linha com cara de nome antes dos dados pessoais (CPF /
  // identidade / filiação — depois disso vêm os nomes dos pais, que não
  // podem ser confundidos com o do motorista).
  let limite = linhasNorm.findIndex(l => /\bCPF\b|IDENTIDADE|FILIA/.test(l));
  if(limite === -1) limite = linhas.length;
  for(let i = 0; i < limite; i++){
    const nome = limparLinhaNome(linhas[i]);
    if(nome) return { nome: formatarNomeProprio(nome), confiavel: false };
  }
  return null;
}

// Confere os 2 dígitos verificadores do CPF — se o OCR trocou um único
// número, a conta não fecha. Importante porque o CPF é usado no 1º acesso do
// motorista: um CPF lido errado deixaria ele trancado pra fora.
function cpfValido(cpf){
  const d = (cpf || '').replace(/\D/g, '');
  if(d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const digito = (n) => {
    let soma = 0;
    for(let i = 0; i < n; i++) soma += parseInt(d[i], 10) * (n + 1 - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return digito(9) === parseInt(d[9], 10) && digito(10) === parseInt(d[10], 10);
}

// Só devolve CPF que passa na conferência dos dígitos — procura primeiro
// perto do rótulo "CPF" e, se não achar, no texto todo.
function extrairCpfCNH(texto){
  const t = normalizarTextoComEspacos(texto);
  const idx = t.search(/\bCPF\b/);
  const trechos = idx !== -1 ? [t.slice(idx, idx + 80), t] : [t];
  for(const trecho of trechos){
    const achados = trecho.match(/\d{3}\.?\d{3}\.?\d{3}-?\d{2}/g) || [];
    const valido = achados.find(cpfValido);
    if(valido) return valido;
  }
  return null;
}

// Palpite de nome (não achou pelo rótulo) ou CPF que não fechou a conta?
// Antes de criar um login de verdade, mostra o que foi lido pro Thiago
// conferir/corrigir. Devolve { nome, cpf } confirmados, ou null se cancelar.
// Prévia do documento nas janelas de conferência: a pessoa vê o arquivo enquanto confere/preenche.
// Imagem aparece direto; PDF tem a 1ª página desenhada. Tocar abre o arquivo inteiro numa aba.
function previaDocumentoHtml(id){
  return `<div id="${id}" class="previa-doc" style="margin-bottom:14px; border:1px solid var(--border); border-radius:10px; background:#fff; min-height:60px; display:flex; align-items:center; justify-content:center; overflow:hidden; cursor:zoom-in;" title="Toque para ampliar">
    <span class="l2" style="color:#555; padding:14px;">Carregando a imagem do documento...</span></div>`;
}
async function montarPreviaDocumento(id, file){
  const caixa = document.getElementById(id);
  if(!caixa || !file) return;
  const url = URL.createObjectURL(file);
  caixa.addEventListener('click', () => window.open(url, '_blank'));
  const mostrar = (src) => { if(document.getElementById(id)) caixa.innerHTML = `<img src="${src}" alt="Documento" style="display:block; width:100%; max-height:45vh; object-fit:contain;">`; };
  try{
    if(/^image\//.test(file.type)) return mostrar(url);
    if(file.type !== 'application/pdf') throw new Error('sem prévia');
    await usarPdfJs();
    const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
    const pagina = await pdf.getPage(1);
    const base = pagina.getViewport({ scale: 1 });
    const viewport = pagina.getViewport({ scale: Math.min(2.5, 1400 / base.width) });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width; canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    await pagina.render({ canvasContext: ctx, viewport }).promise;
    mostrar(canvas.toDataURL('image/jpeg', 0.85));
  } catch(e){
    if(document.getElementById(id)) caixa.innerHTML = `<span class="l2" style="color:#555; padding:14px;">Não deu para mostrar a prévia — toque aqui para abrir o arquivo.</span>`;
  }
}

function confirmarDadosNovoMotorista(nome, cpf, file = null){
  return new Promise((resolve) => {
    const modalHtml = `
      <div id="confNovoMotModal" style="position:fixed; inset:0; background:rgba(0,0,0,.85); z-index:65; display:flex; align-items:center; justify-content:center; padding:20px;">
        <div style="background:var(--asphalt-900); border:1px solid var(--border); border-radius:16px; padding:20px; max-width:520px; width:100%; max-height:92vh; overflow:auto;">
          <h3 style="margin-top:0;">Confira os dados do motorista</h3>
          <div class="l2" style="margin-bottom:14px;">Não encontrei esse motorista no sistema e vou criar o login dele. Não tive certeza da leitura — confira (e corrija se precisar) antes de continuar.</div>
          ${file ? previaDocumentoHtml('confNovoMotPrevia') : ''}
          <input type="text" id="confNovoMotNome" placeholder="Nome completo" value="${esc(nome || '')}">
          <input type="text" id="confNovoMotCpf" placeholder="CPF" inputmode="numeric" value="${esc(cpf || '')}" style="margin-top:10px;">
          <div id="confNovoMotErro" class="err" style="margin-top:8px;"></div>
          <button id="btnConfNovoMotOk" style="margin-top:14px; width:100%;">Confirmar e cadastrar</button>
          <button class="btn-small" id="btnConfNovoMotCancelar" style="margin-top:8px; width:100%;">Não cadastrar agora</button>
        </div>
      </div>`;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    if(file) montarPreviaDocumento('confNovoMotPrevia', file);
    const fechar = (valor) => { const m = document.getElementById('confNovoMotModal'); if(m) m.remove(); resolve(valor); };
    document.getElementById('btnConfNovoMotCancelar').addEventListener('click', () => fechar(null));
    document.getElementById('btnConfNovoMotOk').addEventListener('click', () => {
      const nomeDigitado = document.getElementById('confNovoMotNome').value.trim().replace(/\s+/g, ' ');
      const cpfDigitado = document.getElementById('confNovoMotCpf').value.trim();
      const erroEl = document.getElementById('confNovoMotErro');
      if(nomeDigitado.split(' ').length < 2){ erroEl.textContent = 'Digite o nome completo.'; return; }
      if(!cpfValido(cpfDigitado)){ erroEl.textContent = 'CPF inválido — confira os números.'; return; }
      fechar({ nome: nomeDigitado, cpf: cpfDigitado });
    });
  });
}

// Chama a função de servidor que cria o login do motorista com segurança
// (a chave de acesso total do banco nunca fica no app — só dentro dessa
// função, que roda no Supabase). Precisa dela publicada lá antes de
// funcionar (ver instruções no arquivo da função).
// papel: 'motorista' (padrão, pela CNH) ou 'mecanico' (cadastrado em Usuários)
async function criarMotoristaAutomatico(nome, cpf, papel = 'motorista'){
  try{
    const { data: sessaoAtual } = await sb.auth.getSession();
    const token = sessaoAtual && sessaoAtual.session ? sessaoAtual.session.access_token : null;
    if(!token) return { error: 'Sessão expirada — atualize a página e tente de novo.' };
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/criar-motorista-automatico`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ nome, cpf, papel })
    });
    const dados = await resp.json();
    if(!resp.ok) return { error: (dados && dados.error) || 'Erro ao cadastrar motorista.' };
    return { motorista: dados };
  } catch(e){
    return { error: 'Erro ao cadastrar motorista: ' + e.message };
  }
}

// Mostra o login e a senha temporária gerados — fica na tela até o Thiago
// confirmar que anotou, porque essa é a única vez que a senha aparece (não
// tem e-mail de verdade pra reenviar depois).
function mostrarCredenciaisNovoMotorista(info, titulo, explicacao){
  return new Promise((resolve) => {
    const modalHtml = `
      <div id="credModal" style="position:fixed; inset:0; background:rgba(0,0,0,.85); z-index:65; display:flex; align-items:center; justify-content:center; padding:20px;">
        <div style="background:var(--asphalt-900); border:1px solid var(--border); border-radius:16px; padding:20px; max-width:420px; width:100%;">
          <h3 style="margin-top:0;">${esc(titulo || 'Motorista novo cadastrado')}</h3>
          <div class="l2" style="margin-bottom:14px;">${esc(explicacao || 'Não encontrei esse motorista no sistema — criei o cadastro e um login temporário. Anote e repasse: no primeiro acesso, o app pede para confirmar o CPF e trocar a senha.')}</div>
          <div class="card">
            <div class="l1">Login</div>
            <div class="l2" style="font-size:17px; color:var(--text-primary); font-weight:700;">${esc(info.login)}</div>
          </div>
          <div class="card">
            <div class="l1">Senha temporária</div>
            <div class="l2" style="font-size:17px; color:var(--text-primary); font-weight:700; font-family:var(--font-mono);">${esc(info.senhaTemporaria)}</div>
          </div>
          <button id="btnEntendiCredenciais" style="margin-top:10px; width:100%;">Entendi, anotei</button>
        </div>
      </div>`;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    document.getElementById('btnEntendiCredenciais').addEventListener('click', () => {
      const m = document.getElementById('credModal');
      if(m) m.remove();
      resolve();
    });
  });
}
