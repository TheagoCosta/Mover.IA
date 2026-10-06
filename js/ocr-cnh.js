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
async function ocrArquivo(file){
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
    const resultado = await worker.recognize(fonteImagem);
    return (resultado && resultado.data && resultado.data.text) || '';
  } catch(e){
    return '';
  } finally {
    if(worker) try{ await worker.terminate(); } catch(e){ /* ignora */ }
  }
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
function confirmarDadosNovoMotorista(nome, cpf){
  return new Promise((resolve) => {
    const modalHtml = `
      <div id="confNovoMotModal" style="position:fixed; inset:0; background:rgba(0,0,0,.85); z-index:65; display:flex; align-items:center; justify-content:center; padding:20px;">
        <div style="background:var(--asphalt-900); border:1px solid var(--border); border-radius:16px; padding:20px; max-width:420px; width:100%;">
          <h3 style="margin-top:0;">Confira os dados do motorista</h3>
          <div class="l2" style="margin-bottom:14px;">Não encontrei esse motorista no sistema e vou criar o login dele. Não tive certeza da leitura — confira (e corrija se precisar) antes de continuar.</div>
          <input type="text" id="confNovoMotNome" placeholder="Nome completo" value="${esc(nome || '')}">
          <input type="text" id="confNovoMotCpf" placeholder="CPF" inputmode="numeric" value="${esc(cpf || '')}" style="margin-top:10px;">
          <div id="confNovoMotErro" class="err" style="margin-top:8px;"></div>
          <button id="btnConfNovoMotOk" style="margin-top:14px; width:100%;">Confirmar e cadastrar</button>
          <button class="btn-small" id="btnConfNovoMotCancelar" style="margin-top:8px; width:100%;">Não cadastrar agora</button>
        </div>
      </div>`;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
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
