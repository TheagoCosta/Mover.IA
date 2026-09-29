// MOVER.IA — núcleo: conexão com o Supabase, login, primeiro acesso e montagem da tela
// (arquivo carregado pelo index.html; todas as funções ficam globais,
// então um arquivo pode chamar funções dos outros normalmente)

const SUPABASE_URL = 'https://otllslhjbyjtktxyvezy.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_eFeBsxW2lThWWBAHquuv5g_NWe9lgvf';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let session = null;
let loginError = '';
let usuarioAtual = null;
let screen = 'painel';

const app = document.getElementById('app');

// Tema da página: claro (escritório) ou escuro (motorista, mecânico, login)
function definirTema(tema){
  document.body.classList.toggle('tema-escritorio', tema === 'escritorio');
}

async function init(){
  app.innerHTML = `<div class="wrap"><div class="status">Carregando...</div></div>`;
  const { data } = await sb.auth.getSession();
  session = data.session;
  render();
}

function render(){
  if(!session){ definirTema('escuro'); app.innerHTML = loginScreen(); attachLoginHandlers(); }
  else { app.innerHTML = `<div class="wrap"><div class="status">Carregando...</div></div>`; loadShell(); }
}

function loginScreen(){
  return `
  <div class="wrap">
    <div class="center">
      <img src="img/logo.png" alt="" style="width:78px; height:auto; margin-bottom:10px;">
      <div class="logo">MOVER<span>.IA</span></div>
      <div class="tag">Gestão para quem move o Brasil</div>
      <div class="auth-card">
        <form id="loginForm">
          <div class="field-row" style="margin:0;"><label for="email">E-mail ou login</label>
            <input type="text" id="email" placeholder="ex: carlos.alves" required autocomplete="username" autocapitalize="none" spellcheck="false"></div>
          <div class="field-row" style="margin:0;"><label for="password">Senha</label>
            <input type="password" id="password" placeholder="••••••••" required autocomplete="current-password"></div>
          <div class="err" id="loginErr">${esc(loginError)}</div>
          <button type="submit" id="loginBtn">Entrar</button>
        </form>
      </div>
      <div class="l2" style="margin-top:14px; text-align:center;">Esqueceu a senha? Fale com o escritório da sua transportadora.</div>
    </div>
  </div>`;
}

function attachLoginHandlers(){
  document.getElementById('loginForm').addEventListener('submit', doLogin);
}

async function doLogin(e){
  e.preventDefault();
  // Motorista cadastrado automaticamente entra só com o login (ex:
  // "carlos.alves") — por trás, o login dele é um e-mail interno nesse
  // domínio (ver a função criar-motorista-automatico). Quem digitar um
  // e-mail completo (admin/escritório) entra normalmente.
  let email = document.getElementById('email').value.trim().toLowerCase();
  if(email && !email.includes('@')) email += '@motoristas.moveria.app';
  const password = document.getElementById('password').value;
  const btn = document.getElementById('loginBtn');
  btn.disabled = true; btn.textContent = 'Entrando...';
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if(error){
    loginError = error.message === 'Invalid login credentials' ? 'E-mail ou senha incorretos.' : error.message;
    render();
    return;
  }
  loginError = '';
  session = data.session;
  render();
}

async function doLogout(){
  await sb.auth.signOut();
  session = null;
  usuarioAtual = null;
  meuConjunto = null;
  motoristaScreen = 'home';
  motoristaTab = 'inicio';
  chkAnswers = {};
  jornadaEmEdicaoId = null;
  motivoSelecionado = null;
  jornadaDetalheId = null;
  documentosSubtela = 'lista';
  docAbaMotorista = 'meus';
  screen = 'painel';
  render();
}

const papelLabel = { admin_transportadora:'Administrador', gestor:'Escritório', mecanico:'Mecânico', motorista:'Motorista', admin_mover_ia:'MOVER.IA' };
const statusLabel = { ok:'Em dia', vence_em_breve:'Vence em breve', vencido:'Vencido' };
const PAPEIS_GESTAO = ['admin_transportadora', 'gestor', 'admin_mover_ia'];

async function loadShell(){
  if(!usuarioAtual){
    const { data: usuario, error: uErr } = await sb
      .from('usuario')
      .select('nome, papel, transportadora_id, senha_temporaria, transportadora:transportadora_id ( nome_fantasia, plano )')
      .eq('id', session.user.id)
      .single();

    if(uErr || !usuario){
      app.innerHTML = `<div class="wrap"><div class="content"><div class="status">Login funcionou, mas não encontrei seu cadastro na tabela "usuario". ${uErr ? '('+uErr.message+')' : ''}</div></div></div>`;
      return;
    }
    usuarioAtual = usuario;
  }

  if(usuarioAtual.papel === 'motorista' && usuarioAtual.senha_temporaria){ definirTema('escuro'); loadPrimeiroAcessoMotorista(); return; }
  if(usuarioAtual.papel === 'motorista'){ definirTema('escuro'); loadShellMotorista(); return; }
  if(usuarioAtual.papel === 'mecanico'){ definirTema('escuro'); loadShellMecanico(); return; }

  definirTema('escritorio');
  loadEscritorio();
}

// O app do mecânico (chamados de oficina + frota) chega na etapa 3.
function loadShellMecanico(){
  const primeiroNome = esc((usuarioAtual.nome || '').split(' ')[0]);
  app.innerHTML = `
    <div class="m-app" style="padding-bottom:0;">
      <div class="app-header"><div class="row">
        <div><h2>Oficina</h2><div class="sub">${primeiroNome} · Mecânico</div></div>
        <div class="avatar">${esc(iniciais(usuarioAtual.nome))}</div>
      </div></div>
      <div class="m-content">
        <div class="card em-breve-box">
          <div class="ic-grande">${ic('wrench', 34)}</div>
          <div class="card-dark-title">Área do mecânico em construção</div>
          <div class="card-dark-sub">Em breve você vai ver e atualizar aqui os chamados de manutenção abertos pelos motoristas.</div>
        </div>
        <button class="btn btn-outline" id="btnSair">${ic('logout', 16)} Sair</button>
      </div>
    </div>`;
  document.getElementById('btnSair').addEventListener('click', doLogout);
}

// Primeiro acesso de um motorista cadastrado automaticamente (login criado
// ao enviar a CNH dele): confirma a identidade pelo CPF (quando o app
// conseguiu ler o CPF do documento) e obriga a trocar a senha temporária
// antes de liberar o resto do app.
async function loadPrimeiroAcessoMotorista(){
  const { data: perfil } = await sb.from('motorista_perfil').select('cpf').eq('usuario_id', session.user.id).maybeSingle();
  const cpfCadastrado = perfil ? perfil.cpf : null;

  app.innerHTML = `
    <div class="wrap">
      <div class="center">
        <div class="logo" style="font-size:22px;">Olá, ${esc(usuarioAtual.nome.split(' ')[0])}</div>
        <div class="tag">Primeiro acesso — confirme seus dados e crie sua senha</div>
        <form id="primeiroAcessoForm" class="auth-card">
          ${cpfCadastrado ? `<input type="text" id="paCpf" placeholder="Confirme seu CPF" required inputmode="numeric">` : ''}
          <input type="password" id="paSenha1" placeholder="Nova senha (mín. 6 caracteres)" required minlength="6">
          <input type="password" id="paSenha2" placeholder="Confirme a nova senha" required minlength="6">
          <div class="err" id="paErr"></div>
          <button type="submit" id="paBtn">Confirmar e entrar</button>
        </form>
      </div>
    </div>`;

  document.getElementById('primeiroAcessoForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = document.getElementById('paErr');
    errEl.textContent = '';
    const senha1 = document.getElementById('paSenha1').value;
    const senha2 = document.getElementById('paSenha2').value;

    if(cpfCadastrado){
      const cpfDigitado = document.getElementById('paCpf').value.replace(/\D/g, '');
      const cpfSalvo = cpfCadastrado.replace(/\D/g, '');
      if(cpfDigitado !== cpfSalvo){ errEl.textContent = 'CPF não confere com o que temos cadastrado.'; return; }
    }
    if(senha1.length < 6){ errEl.textContent = 'A senha precisa ter pelo menos 6 caracteres.'; return; }
    if(senha1 !== senha2){ errEl.textContent = 'As senhas não são iguais.'; return; }

    const btn = document.getElementById('paBtn');
    btn.disabled = true; btn.textContent = 'Salvando...';

    const { error: erroSenha } = await sb.auth.updateUser({ password: senha1 });
    if(erroSenha){
      const msg = erroSenha.code === 'same_password' || /different from the old/i.test(erroSenha.message)
        ? 'A nova senha precisa ser diferente da senha atual.'
        : 'Erro ao trocar a senha: ' + erroSenha.message;
      errEl.textContent = msg; btn.disabled = false; btn.textContent = 'Confirmar e entrar'; return;
    }

    // O motorista não pode gravar direto no próprio cadastro (pra não
    // conseguir mudar o próprio papel, por exemplo) — essa função do banco
    // só marca que a senha temporária já foi trocada.
    const { error: erroMarcar } = await sb.rpc('marcar_senha_trocada');
    if(erroMarcar){ errEl.textContent = 'Senha trocada, mas não consegui registrar: ' + erroMarcar.message; btn.disabled = false; btn.textContent = 'Confirmar e entrar'; return; }
    usuarioAtual.senha_temporaria = false;
    loadShell();
  });
}
