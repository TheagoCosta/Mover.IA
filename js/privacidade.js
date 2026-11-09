// MOVER.IA — privacidade (LGPD): Política de Privacidade, aviso no 1º acesso,
// "Meus dados" (ver, baixar, pedir correção/exclusão) e a seção Privacidade do escritório.
// (arquivo carregado pelo index.html e também pela página pública privacidade.html —
// por isso o texto da política não depende de nada do resto do app)
//
// Mudou o texto da política? Suba VERSAO_PRIVACIDADE (ex: '1.1') e a data: todo mundo
// vê a nova versão no próximo acesso e o registro de leitura começa de novo.

const VERSAO_PRIVACIDADE = '1.0';
const DATA_PRIVACIDADE = '14/10/2026';
const CONTATO_PRIVACIDADE = 'thiagomgc02@gmail.com';
const PRAZO_RESPOSTA_DIAS = 15;   // LGPD art. 19, II

function escPriv(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c])); }

// ---------------------------------------------------------------------
// Texto da política. empresa = { razao_social, nome_fantasia, cnpj } ou null (página pública)
// ---------------------------------------------------------------------
function htmlPoliticaPrivacidade(empresa){
  const nomeEmpresa = empresa
    ? `<b>${escPriv(empresa.razao_social || empresa.nome_fantasia)}</b>${empresa.nome_fantasia && empresa.razao_social ? ` (${escPriv(empresa.nome_fantasia)})` : ''}${empresa.cnpj ? `, CNPJ ${escPriv(empresa.cnpj)}` : ''}`
    : 'a <b>transportadora para a qual você trabalha</b>';
  const email = `<a href="mailto:${CONTATO_PRIVACIDADE}">${CONTATO_PRIVACIDADE}</a>`;
  return `<div class="politica">
    <p class="politica-versao">Versão ${VERSAO_PRIVACIDADE} — atualizada em ${DATA_PRIVACIDADE}</p>
    <p>Esta política explica, de forma simples, quais dados pessoais o MOVER.IA guarda, para que eles são usados, com quem são compartilhados e quais são os seus direitos, conforme a Lei Geral de Proteção de Dados (LGPD — Lei 13.709/2018).</p>

    <h4>1. Quem cuida dos seus dados</h4>
    <ul>
      <li><b>Controladora:</b> ${nomeEmpresa}. É ela quem decide para que os dados são usados.</li>
      <li><b>Operadora:</b> o <b>MOVER.IA</b>, sistema que guarda e organiza os dados a pedido da transportadora.</li>
      <li><b>Contato para assuntos de dados pessoais:</b> ${email}.</li>
    </ul>

    <h4>2. Quais dados guardamos</h4>
    <ul>
      <li><b>Identificação e contato:</b> nome, CPF, celular, login e e-mail (usuários do escritório).</li>
      <li><b>Habilitação e documentos:</b> CNH (número, categoria, validade e arquivo), ficha cadastral, certificados de cursos e outros documentos que a empresa cadastrar.</li>
      <li><b>Saúde (dados sensíveis):</b> validade do exame toxicológico e do ASO e, se a empresa anexar, o arquivo desses exames.</li>
      <li><b>Trabalho:</b> jornada (início, paradas com motivo e fim), checklists do veículo, abastecimentos (km, litros, posto, nota), chamados de oficina (com fotos e vídeos), viagens, agendamentos e capacitações.</li>
      <li><b>Assinaturas</b> feitas na tela, ao encerrar a jornada e ao enviar o checklist.</li>
      <li><b>Dados técnicos:</b> aparelho cadastrado para receber avisos e o registro de quando você leu esta política.</li>
    </ul>
    <p>O MOVER.IA <b>não</b> coleta sua localização (GPS), seus contatos, fotos do celular que você não escolheu enviar, nem dados bancários.</p>

    <h4>3. Para que usamos e com qual base legal</h4>
    <table>
      <tr><th>Para quê</th><th>Base legal (LGPD)</th></tr>
      <tr><td>Controle da jornada do motorista (horários, paradas, assinatura)</td><td>Cumprimento de obrigação legal — Lei 13.103/2015 e CLT (art. 7º, II)</td></tr>
      <tr><td>Cadastro, CNH, categoria, validade e demais documentos</td><td>Obrigação legal (Código de Trânsito e normas da ANTT) e execução do contrato de trabalho (art. 7º, II e V)</td></tr>
      <tr><td>Exame toxicológico e ASO</td><td>Obrigação legal — CLT e normas de saúde e segurança do trabalho (art. 11, II, "a")</td></tr>
      <tr><td>Checklist do veículo, oficina, abastecimentos, viagens, agenda e capacitações</td><td>Execução do contrato e legítimo interesse da empresa na segurança e manutenção da frota (art. 7º, V e IX)</td></tr>
      <tr><td>Avisos no celular</td><td>Execução do contrato — você pode desligar a qualquer momento</td></tr>
      <tr><td>Segurança do sistema e prevenção de fraudes</td><td>Legítimo interesse e exercício regular de direitos (art. 7º, VI e IX)</td></tr>
    </table>

    <h4>4. Com quem compartilhamos</h4>
    <ul>
      <li><b>Escritório da sua transportadora</b> (pessoas autorizadas). O mecânico só vê os chamados de oficina e a frota — não vê documentos nem dados pessoais.</li>
      <li><b>Fornecedores que fazem o sistema funcionar:</b> Supabase (banco de dados e arquivos, com servidores em São Paulo) e o serviço de avisos do seu celular (Google ou Apple), que recebe só o texto do aviso.</li>
      <li><b>Sistema de transporte da empresa</b> (TMS), quando a integração estiver ativa, para viagens e documentos fiscais.</li>
      <li><b>Autoridades públicas</b>, quando a lei exigir.</li>
    </ul>
    <p>Seus dados <b>não são vendidos</b> e não são usados para propaganda.</p>

    <h4>5. Onde e por quanto tempo guardamos</h4>
    <ul>
      <li>Os dados ficam em servidores no <b>Brasil</b> (São Paulo).</li>
      <li>Guardamos enquanto você tiver vínculo com a transportadora e, depois, pelo prazo que a lei exige — em geral, até <b>5 anos após o fim do contrato</b> (prazos trabalhistas), ou mais quando outra lei pedir. Depois disso, os dados são apagados ou anonimizados.</li>
      <li>Ao sair da conta em um aparelho, ele deixa de receber os avisos.</li>
    </ul>

    <h4>6. Como protegemos</h4>
    <ul>
      <li>Acesso só com login e senha; cada empresa vê apenas os próprios dados e o motorista vê apenas o que é dele.</li>
      <li>Arquivos em área privada, abertos por links que expiram em poucos minutos; conexão sempre criptografada.</li>
      <li>Revisões de segurança periódicas.</li>
      <li>Se acontecer um incidente de segurança que possa causar risco ou dano relevante, você e a Autoridade Nacional de Proteção de Dados (ANPD) serão avisados, como manda a lei.</li>
    </ul>

    <h4>7. Seus direitos</h4>
    <p>Você pode, a qualquer momento (LGPD, art. 18):</p>
    <ul>
      <li>confirmar se tratamos seus dados e ter acesso a eles;</li>
      <li>corrigir dados incompletos, errados ou desatualizados;</li>
      <li>pedir a anonimização, o bloqueio ou a exclusão de dados desnecessários ou tratados em desacordo com a lei — dados que a lei obriga a guardar (como a jornada) ficam guardados pelo prazo legal;</li>
      <li>receber seus dados em arquivo (portabilidade);</li>
      <li>saber com quem seus dados são compartilhados;</li>
      <li>reclamar à ANPD (<a href="https://www.gov.br/anpd" target="_blank" rel="noopener">gov.br/anpd</a>).</li>
    </ul>
    <p><b>Como pedir:</b> no próprio app, em <b>Meus dados e privacidade</b>, ou pelo e-mail ${email}. Respondemos em até ${PRAZO_RESPOSTA_DIAS} dias.</p>

    <h4>8. Mudanças nesta política</h4>
    <p>Se esta política mudar, o app mostra a nova versão para você ler no próximo acesso.</p>
  </div>`;
}

// ---------------------------------------------------------------------
// Daqui para baixo: só dentro do app (usa sb, usuarioAtual, abrirModal etc.)
// ---------------------------------------------------------------------
const chaveAceitePrivacidade = () => 'moveria:privacidade:' + (session && session.user ? session.user.id : '');
let empresaPrivacidade = null;

async function dadosEmpresaPrivacidade(){
  if(empresaPrivacidade && empresaPrivacidade.id === usuarioAtual.transportadora_id) return empresaPrivacidade;
  const { data } = await sb.from('transportadora').select('id, razao_social, nome_fantasia, cnpj').eq('id', usuarioAtual.transportadora_id).maybeSingle();
  empresaPrivacidade = data || { id: usuarioAtual.transportadora_id, nome_fantasia: usuarioAtual.transportadora ? usuarioAtual.transportadora.nome_fantasia : '' };
  return empresaPrivacidade;
}

async function abrirPoliticaPrivacidade(){
  const empresa = await dadosEmpresaPrivacidade();
  abrirModal('Política de Privacidade', htmlPoliticaPrivacidade(empresa));
}

// Aviso no 1º acesso (e a cada versão nova). Não trava quem está sem internet.
async function verificarAceitePrivacidade(){
  if(!session || !usuarioAtual) return;
  try{ if(localStorage.getItem(chaveAceitePrivacidade()) === VERSAO_PRIVACIDADE) return; } catch(e){ /* segue */ }
  const { data, error } = await sb.from('aceite_privacidade').select('id').eq('usuario_id', session.user.id).eq('versao', VERSAO_PRIVACIDADE).limit(1);
  if(error) return;
  if(data && data.length){ try{ localStorage.setItem(chaveAceitePrivacidade(), VERSAO_PRIVACIDADE); } catch(e){ /* segue */ } return; }
  mostrarAvisoPrivacidade(await dadosEmpresaPrivacidade());
}

function mostrarAvisoPrivacidade(empresa){
  if(document.getElementById('avisoPrivacidade')) return;
  const nome = usuarioAtual.nome ? usuarioAtual.nome.split(' ')[0] : '';
  const ehMotorista = usuarioAtual.papel === 'motorista';
  document.body.insertAdjacentHTML('beforeend', `
    <div id="avisoPrivacidade" class="aviso-privacidade" role="dialog" aria-modal="true">
      <div class="aviso-privacidade-caixa">
        <div class="aviso-privacidade-ic">${ic('lock', 26)}</div>
        <h3>Seus dados no MOVER.IA</h3>
        <p>Olá${nome ? ', ' + esc(nome) : ''}! Antes de continuar, veja como seus dados pessoais são usados:</p>
        <ul>
          ${ehMotorista ? '<li>Sua <b>jornada</b>, seus <b>checklists</b> e <b>abastecimentos</b> são registrados porque a lei e o seu trabalho exigem.</li>' : '<li>O app guarda seus dados de cadastro e o que você registra no trabalho.</li>'}
          <li>Seus dados ficam no <b>Brasil</b>, protegidos, e só pessoas autorizadas da ${esc((empresa && empresa.nome_fantasia) || 'transportadora')} têm acesso.</li>
          <li>O app <b>não</b> pega sua localização, seus contatos nem suas fotos.</li>
          <li>Você pode <b>ver, baixar e pedir correção</b> dos seus dados em <b>Meus dados e privacidade</b>.</li>
        </ul>
        <button type="button" class="btn btn-outline" id="btnLerPoliticaCompleta" style="width:100%;">Ler a política completa</button>
        <div id="politicaCompleta" class="aviso-privacidade-texto" hidden></div>
        <label class="aviso-privacidade-check"><input type="checkbox" id="chkPrivacidade"> Li e entendi como meus dados são usados</label>
        <div class="err" id="avisoPrivErro"></div>
        <button type="button" id="btnAceitarPrivacidade" disabled style="width:100%;">Continuar</button>
        <div class="l2" style="margin-top:10px; text-align:center;">Dúvidas: <a href="mailto:${CONTATO_PRIVACIDADE}">${CONTATO_PRIVACIDADE}</a></div>
      </div>
    </div>`);
  const chk = document.getElementById('chkPrivacidade'), btn = document.getElementById('btnAceitarPrivacidade');
  chk.addEventListener('change', () => { btn.disabled = !chk.checked; });
  document.getElementById('btnLerPoliticaCompleta').addEventListener('click', (e) => {
    const caixa = document.getElementById('politicaCompleta');
    if(caixa.hidden){ caixa.innerHTML = htmlPoliticaPrivacidade(empresa); caixa.hidden = false; e.target.textContent = 'Esconder a política completa'; }
    else { caixa.hidden = true; e.target.textContent = 'Ler a política completa'; }
  });
  btn.addEventListener('click', async () => {
    btn.disabled = true; btn.textContent = 'Salvando...';
    const { error } = await sb.rpc('registrar_aceite_privacidade', { p_versao: VERSAO_PRIVACIDADE, p_aparelho: navigator.userAgent.slice(0, 300) });
    if(error){ document.getElementById('avisoPrivErro').textContent = 'Não consegui registrar agora. Confira a internet e tente de novo.'; btn.disabled = false; btn.textContent = 'Continuar'; return; }
    try{ localStorage.setItem(chaveAceitePrivacidade(), VERSAO_PRIVACIDADE); } catch(e){ /* segue */ }
    document.getElementById('avisoPrivacidade').remove();
  });
}

// Registro de quem abriu qual arquivo (LGPD — rastreabilidade). Não atrasa a abertura:
// se falhar (sem internet etc.), o arquivo abre do mesmo jeito.
function registrarAcessoArquivo(alvo, id){
  if(!id) return;
  sb.rpc('registrar_acesso_arquivo', { p_alvo: alvo, p_id: id }).then(() => {}, () => {});
}

// ---------------------------------------------------------------------
// MEUS DADOS — o titular vê, baixa e faz pedidos (direitos do art. 18)
// ---------------------------------------------------------------------
const ROTULO_PEDIDO = { acesso: 'Acesso aos dados', correcao: 'Correção de dados', exclusao: 'Exclusão de dados', outro: 'Outro assunto' };

async function carregarMeusDados(){
  const uid = session.user.id;
  const lista = async (consulta) => { try{ const { data } = await consulta; return data || []; } catch(e){ return []; } };
  const [usuario, perfil, documentos, jornadas, checklists, abastecimentos, chamados, capacitacoes, agendamentos, viagens, aceites, pedidos] = await Promise.all([
    lista(sb.from('usuario').select('nome, email, telefone, papel, criado_em').eq('id', uid)),
    lista(sb.from('motorista_perfil').select('cpf, categoria_cnh, cnh_validade, toxicologico_validade, aso_validade').eq('usuario_id', uid)),
    lista(sb.from('documento').select('tipo, numero, validade, criado_em').eq('referente_a', 'motorista').eq('referente_id', uid)),
    lista(sb.from('jornada').select('inicio, fim, status, assinado_em, jornada_evento(tipo, motivo, observacao, criado_em)').eq('motorista_id', uid).order('inicio', { ascending: false })),
    lista(sb.from('checklist').select('criado_em, assinado_em, respostas').eq('motorista_id', uid).order('criado_em', { ascending: false })),
    lista(sb.from('abastecimento').select('data, tipo, km, litros, arla_litros, posto, nota_numero, preco_litro_diesel, preco_litro_arla, media_calculada, veiculo:veiculo_id(placa)').eq('motorista_id', uid).order('data', { ascending: false })),
    lista(sb.from('chamado_manutencao').select('criado_em, categoria, urgencia, descricao, status, concluido_em, veiculo:veiculo_id(placa)').eq('motorista_id', uid).order('criado_em', { ascending: false })),
    lista(sb.from('capacitacao').select('tipo, instituicao, carga_horaria, data_realizacao, validade').eq('motorista_id', uid)),
    lista(sb.from('agendamento').select('tipo, data_prevista, data_fim, hora, local, status, observacao').eq('motorista_id', uid)),
    lista(sb.from('viagem').select('origem, destino, cte_numero, mdfe_numero, status, criado_em').eq('motorista_id', uid)),
    lista(sb.from('aceite_privacidade').select('versao, aceito_em, aparelho').eq('usuario_id', uid).order('aceito_em', { ascending: false })),
    lista(sb.from('solicitacao_titular').select('id, tipo, mensagem, status, resposta, criado_em, respondido_em').eq('usuario_id', uid).order('criado_em', { ascending: false })),
  ]);
  return { usuario: usuario[0] || {}, perfil: perfil[0] || null, documentos, jornadas, checklists, abastecimentos, chamados, capacitacoes, agendamentos, viagens, aceites, pedidos };
}

const mascararCpf = (cpf) => { const d = String(cpf || '').replace(/\D/g, ''); return d.length === 11 ? `***.${d.slice(3, 6)}.***-${d.slice(9)}` : (cpf ? '***' : '—'); };
const loginDe = (email) => String(email || '').replace('@motoristas.moveria.app', '');

// HTML da tela (mesmo conteúdo no app do motorista e na janela do mecânico/escritório)
function htmlMeusDados(d, escuro){
  const u = d.usuario, p = d.perfil;
  const linha = (rotulo, valor) => `<div class="md-linha"><span>${rotulo}</span><b>${valor}</b></div>`;
  const contagens = [
    ['Documentos', d.documentos.length], ['Jornadas', d.jornadas.length], ['Checklists', d.checklists.length],
    ['Abastecimentos', d.abastecimentos.length], ['Chamados de oficina', d.chamados.length], ['Capacitações', d.capacitacoes.length],
    ['Agendamentos', d.agendamentos.length], ['Viagens', d.viagens.length],
  ].filter(([, n]) => n || usuarioAtual.papel === 'motorista');
  const leitura = d.aceites[0];
  return `<div class="meus-dados ${escuro ? 'escuro' : ''}">
    <div class="md-bloco">
      <div class="md-titulo">Seus dados cadastrais</div>
      ${linha('Nome', esc(u.nome || usuarioAtual.nome))}
      ${linha('Login', esc(loginDe(u.email)))}
      ${linha('Celular', esc(u.telefone || '—'))}
      ${p ? linha('CPF', esc(mascararCpf(p.cpf))) + linha('Categoria da CNH', esc(p.categoria_cnh || '—')) : ''}
      ${p && p.toxicologico_validade ? linha('Validade do toxicológico', esc(fmtData(p.toxicologico_validade))) : ''}
      ${p && p.aso_validade ? linha('Validade do ASO', esc(fmtData(p.aso_validade))) : ''}
      <div class="md-nota">Algo errado? Toque em "Pedir correção" abaixo.</div>
    </div>
    ${contagens.length ? `<div class="md-bloco">
      <div class="md-titulo">O que o sistema guarda de você</div>
      <div class="md-contagens">${contagens.map(([r, n]) => `<div><b>${n}</b><span>${r}</span></div>`).join('')}</div>
    </div>` : ''}
    <div class="md-bloco">
      <div class="md-titulo">Seus dados em arquivo</div>
      <div class="md-nota" style="margin-top:0;">Veja tudo num relatório para ler ou imprimir, ou baixe um arquivo com todos os seus dados.</div>
      <div class="md-botoes">
        <button type="button" class="btn btn-outline" data-md="relatorio">${ic('doc', 15)} Ver relatório</button>
        <button type="button" class="btn btn-outline" data-md="baixar">${ic('download', 15)} Baixar arquivo</button>
      </div>
    </div>
    <div class="md-bloco">
      <div class="md-titulo">Pedidos sobre seus dados</div>
      <div class="md-botoes">
        <button type="button" class="btn btn-outline" data-pedido="correcao">Pedir correção</button>
        <button type="button" class="btn btn-outline" data-pedido="exclusao">Pedir exclusão</button>
        <button type="button" class="btn btn-outline" data-pedido="outro">Outro pedido</button>
      </div>
      ${d.pedidos.length ? d.pedidos.map(s => `<div class="md-pedido">
        <div class="md-pedido-topo"><b>${esc(ROTULO_PEDIDO[s.tipo] || s.tipo)}</b><span class="md-status ${s.status}">${s.status === 'respondida' ? 'Respondido' : 'Aguardando resposta'}</span></div>
        <div class="md-pedido-data">${esc(fmtDataHora(s.criado_em))}</div>
        <div>${esc(s.mensagem)}</div>
        ${s.resposta ? `<div class="md-resposta"><b>Resposta${s.respondido_em ? ' (' + esc(fmtData(s.respondido_em)) + ')' : ''}:</b> ${esc(s.resposta)}</div>` : ''}
      </div>`).join('') : `<div class="md-nota">Nenhum pedido feito. O escritório responde em até ${PRAZO_RESPOSTA_DIAS} dias.</div>`}
    </div>
    <div class="md-bloco">
      <div class="md-titulo">Política de Privacidade</div>
      <div class="md-nota" style="margin-top:0;">${leitura ? `Você leu a versão ${esc(leitura.versao)} em ${esc(fmtDataHora(leitura.aceito_em))}.` : 'Você ainda não registrou a leitura da política.'} Contato: <a href="mailto:${CONTATO_PRIVACIDADE}">${CONTATO_PRIVACIDADE}</a></div>
      <div class="md-botoes"><button type="button" class="btn btn-outline" data-md="politica">${ic('lock', 15)} Ler a política</button></div>
    </div>
  </div>`;
}

function ligarMeusDados(raiz, dados, recarregar){
  raiz.querySelectorAll('[data-md]').forEach(b => b.addEventListener('click', () => {
    if(b.dataset.md === 'politica') abrirPoliticaPrivacidade();
    if(b.dataset.md === 'baixar') baixarMeusDados(dados);
    if(b.dataset.md === 'relatorio') abrirRelatorioMeusDados(dados);
  }));
  raiz.querySelectorAll('[data-pedido]').forEach(b => b.addEventListener('click', () => abrirNovoPedidoTitular(b.dataset.pedido, recarregar)));
}

function baixarMeusDados(d){
  const conteudo = {
    gerado_em: new Date().toISOString(),
    aviso: 'Dados pessoais guardados pelo MOVER.IA em nome da sua transportadora (LGPD, art. 18).',
    cadastro: { ...d.usuario, login: loginDe(d.usuario.email), perfil_motorista: d.perfil },
    documentos: d.documentos, jornadas: d.jornadas, checklists: d.checklists, abastecimentos: d.abastecimentos,
    chamados_oficina: d.chamados, capacitacoes: d.capacitacoes, agendamentos: d.agendamentos, viagens: d.viagens,
    leituras_da_politica: d.aceites, pedidos_sobre_dados: d.pedidos,
  };
  const blob = new Blob([JSON.stringify(conteudo, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `meus-dados-moveria-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 30000);
}

// Relatório legível (abre numa aba, dá para imprimir ou salvar em PDF)
function abrirRelatorioMeusDados(d){
  const tab = (titulo, cab, linhas) => linhas.length ? `<h2>${titulo} (${linhas.length})</h2><table><tr>${cab.map(c => `<th>${c}</th>`).join('')}</tr>${linhas.map(l => `<tr>${l.map(c => `<td>${escPriv(c == null || c === '' ? '—' : c)}</td>`).join('')}</tr>`).join('')}</table>` : '';
  const u = d.usuario, p = d.perfil || {};
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Meus dados — MOVER.IA</title>
    <style>body{font-family:Arial,sans-serif;color:#222;margin:24px;font-size:13px}h1{font-size:20px}h2{font-size:15px;margin-top:22px;border-bottom:2px solid #ffc53d;padding-bottom:4px}table{border-collapse:collapse;width:100%;margin-top:6px}th,td{border:1px solid #ddd;padding:5px 7px;text-align:left;vertical-align:top}th{background:#f4f1ea}.sub{color:#666}@media print{button{display:none}}</style></head><body>
    <button onclick="print()" style="float:right;padding:8px 14px">Imprimir / salvar em PDF</button>
    <h1>Meus dados — MOVER.IA</h1><div class="sub">Gerado em ${escPriv(fmtDataHora(new Date().toISOString()))} · dados guardados em nome da sua transportadora (LGPD, art. 18)</div>
    ${tab('Cadastro', ['Nome', 'Login', 'Celular', 'CPF', 'Categoria CNH', 'Toxicológico', 'ASO'], [[u.nome, loginDe(u.email), u.telefone, p.cpf, p.categoria_cnh, p.toxicologico_validade ? fmtData(p.toxicologico_validade) : '', p.aso_validade ? fmtData(p.aso_validade) : '']])}
    ${tab('Documentos', ['Tipo', 'Número', 'Validade', 'Cadastrado em'], d.documentos.map(x => [x.tipo, x.numero, x.validade ? fmtData(x.validade) : '', fmtData(x.criado_em)]))}
    ${tab('Jornadas', ['Início', 'Fim', 'Situação', 'Paradas'], d.jornadas.map(j => [fmtDataHora(j.inicio), j.fim ? fmtDataHora(j.fim) : '', j.status, (j.jornada_evento || []).filter(e => e.tipo === 'pausa').length]))}
    ${tab('Checklists', ['Enviado em', 'Itens respondidos', 'Assinado em'], d.checklists.map(c => [fmtDataHora(c.criado_em), (c.respostas || []).length, c.assinado_em ? fmtDataHora(c.assinado_em) : '']))}
    ${tab('Abastecimentos', ['Data', 'Placa', 'Tipo', 'Km', 'Litros', 'Arla', 'Posto', 'Nota'], d.abastecimentos.map(a => [fmtDataHora(a.data), a.veiculo ? a.veiculo.placa : '', a.tipo, a.km, a.litros, a.arla_litros, a.posto, a.nota_numero]))}
    ${tab('Chamados de oficina', ['Aberto em', 'Placa', 'Categoria', 'Descrição', 'Situação'], d.chamados.map(c => [fmtDataHora(c.criado_em), c.veiculo ? c.veiculo.placa : '', c.categoria, c.descricao, c.status]))}
    ${tab('Capacitações', ['Treinamento', 'Instituição', 'Realizado em', 'Validade'], d.capacitacoes.map(c => [c.tipo, c.instituicao, c.data_realizacao ? fmtData(c.data_realizacao) : '', c.validade ? fmtData(c.validade) : '']))}
    ${tab('Agendamentos', ['Tipo', 'Data', 'Até', 'Local', 'Situação'], d.agendamentos.map(a => [a.tipo, a.data_prevista ? fmtData(a.data_prevista) : '', a.data_fim ? fmtData(a.data_fim) : '', a.local, a.status]))}
    ${tab('Viagens', ['Criada em', 'Origem', 'Destino', 'CT-e', 'MDF-e', 'Situação'], d.viagens.map(v => [fmtDataHora(v.criado_em), v.origem, v.destino, v.cte_numero, v.mdfe_numero, v.status]))}
    ${tab('Leituras da Política de Privacidade', ['Versão', 'Lida em'], d.aceites.map(a => [a.versao, fmtDataHora(a.aceito_em)]))}
    ${tab('Pedidos sobre seus dados', ['Feito em', 'Tipo', 'Pedido', 'Situação', 'Resposta'], d.pedidos.map(s => [fmtDataHora(s.criado_em), ROTULO_PEDIDO[s.tipo], s.mensagem, s.status, s.resposta]))}
    </body></html>`;
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  const janela = window.open(url, '_blank');
  if(!janela) location.href = url;
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

function abrirNovoPedidoTitular(tipo, aoEnviar){
  const ajuda = {
    correcao: 'Diga qual dado está errado e qual é o certo (ex: "meu celular mudou para (19) 9...").',
    exclusao: 'Diga quais dados você quer que sejam apagados e por quê. Atenção: dados que a lei obriga a empresa a guardar (como a jornada e documentos trabalhistas) ficam guardados pelo prazo legal — o escritório explica na resposta.',
    outro: 'Escreva sua dúvida ou pedido sobre seus dados pessoais.',
  }[tipo] || '';
  abrirModal(ROTULO_PEDIDO[tipo] || 'Pedido', `
    <form id="formPedidoTitular">
      <div class="l2" style="margin-bottom:10px;">${esc(ajuda)}</div>
      <textarea id="ptMensagem" rows="5" maxlength="2000" required placeholder="Escreva aqui"></textarea>
      <div class="err" id="ptErro"></div>
      <button type="submit" style="margin-top:10px; width:100%;">Enviar pedido</button>
      <div class="l2" style="margin-top:10px;">O escritório da transportadora recebe um aviso e responde em até ${PRAZO_RESPOSTA_DIAS} dias. A resposta aparece aqui e no sino.</div>
    </form>`);
  document.getElementById('formPedidoTitular').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    const msg = document.getElementById('ptMensagem').value.trim();
    if(!msg){ document.getElementById('ptErro').textContent = 'Escreva o pedido.'; return; }
    btn.disabled = true; btn.textContent = 'Enviando...';
    const { error } = await sb.rpc('criar_solicitacao_titular', { p_tipo: tipo, p_mensagem: msg });
    if(error){ document.getElementById('ptErro').textContent = error.message; btn.disabled = false; btn.textContent = 'Enviar pedido'; return; }
    fecharModal();
    mostrarToast('✅ Pedido enviado ao escritório');
    if(aoEnviar) aoEnviar();
  });
}

// Tela do motorista (Mais → Meus dados e privacidade)
async function loadPrivacidadeMotorista(){
  const dados = await carregarMeusDados();
  montarTelaMotorista({
    header: headerVoltar('Meus dados e privacidade'),
    conteudo: htmlMeusDados(dados, true),
  });
  ligarMeusDados(document.querySelector('.m-content') || document, dados, () => { if(motoristaScreen === 'privacidade') loadPrivacidadeMotorista(); });
}

// Janela (mecânico e escritório)
async function abrirMeusDadosModal(){
  const dados = await carregarMeusDados();
  const fundo = abrirModal('Meus dados e privacidade', htmlMeusDados(dados, false));
  ligarMeusDados(fundo, dados, () => abrirMeusDadosModal());
}

// ---------------------------------------------------------------------
// ESCRITÓRIO — seção Privacidade (LGPD)
// ---------------------------------------------------------------------
async function secaoPrivacidade(el){
  const [pedidos, aceites, usuarios, pessoas, [empresa], registros] = await Promise.all([
    consultar(sb.from('solicitacao_titular').select('id, usuario_id, tipo, mensagem, status, resposta, criado_em, respondido_em, usuario:usuario_id(nome, papel), respondente:respondido_por(nome)').order('criado_em', { ascending: false })),
    consultar(sb.from('aceite_privacidade').select('usuario_id, versao, aceito_em')),
    qUsuarios(),
    consultar(sb.from('usuario').select('id, nome, papel, email, ativo, desligado_em, anonimizado_em').eq('ativo', false)),
    consultar(sb.from('transportadora').select('id, anos_guarda_dados').eq('id', usuarioAtual.transportadora_id)),
    consultar(sb.from('registro_acesso').select('id, acao, alvo, descricao, criado_em, quem:usuario_id(nome), titular:titular_id(nome)').order('criado_em', { ascending: false }).limit(500)),
  ]);
  const anosGuarda = (empresa && empresa.anos_guarda_dados) || 5;
  const ativos = usuarios.filter(u => u.ativo && u.papel !== 'admin_mover_ia');
  const leu = {};
  aceites.filter(a => a.versao === VERSAO_PRIVACIDADE).forEach(a => { leu[a.usuario_id] = a.aceito_em; });
  const abertos = pedidos.filter(s => s.status === 'aberta');
  const atrasado = (s) => s.status === 'aberta' && (Date.now() - new Date(s.criado_em).getTime()) > PRAZO_RESPOSTA_DIAS * 86400000;
  const leram = ativos.filter(u => leu[u.id]).length;
  const listaLeitura = [...ativos].sort((a, b) => (!!leu[a.id] - !!leu[b.id]) || a.nome.localeCompare(b.nome));

  el.innerHTML = `
    <div class="kpi-row tres">
      ${kpi(abertos.length, 'Pedidos aguardando resposta', abertos.some(atrasado) ? 'Há pedido com prazo vencido' : `Prazo: ${PRAZO_RESPOSTA_DIAS} dias`, abertos.some(atrasado) ? 'vermelho' : '')}
      ${kpi(`${leram}/${ativos.length}`, `Leram a política (versão ${VERSAO_PRIVACIDADE})`, ativos.length - leram ? `${ativos.length - leram} ainda não entraram no app` : 'Todos', ativos.length - leram ? 'ambar' : 'verde')}
      ${kpi(pedidos.length, 'Pedidos recebidos no total')}
    </div>
    <div class="o-banner">${ic('lock', 18)}<div class="txt"><b>Como funciona</b>Pela LGPD, a transportadora é a <strong>controladora</strong> dos dados dos motoristas e precisa responder os pedidos deles em até ${PRAZO_RESPOSTA_DIAS} dias. Correções de cadastro são feitas em Motoristas (clique no motorista). Na exclusão, dados que a lei obriga a guardar (jornada, documentos trabalhistas) ficam guardados pelo prazo legal — explique isso na resposta. <a href="#" data-priv="politica">Ler a política</a> · <a href="#" data-priv="meus">Meus dados</a></div></div>
    ${painel(`Pedidos sobre dados pessoais (${pedidos.length})`,
      pedidos.length ? tabela(['Recebido em', 'Pessoa', 'Pedido', 'Mensagem', 'Situação', ''],
        [...abertos, ...pedidos.filter(s => s.status !== 'aberta')].map(s => `<tr>
          <td class="sub">${fmtDataHora(s.criado_em)}</td>
          <td>${nomeCelula(s.usuario ? s.usuario.nome : '—', s.usuario ? (papelLabel[s.usuario.papel] || '') : '')}</td>
          <td>${esc(ROTULO_PEDIDO[s.tipo] || s.tipo)}</td>
          <td style="max-width:360px;">${esc(s.mensagem)}${s.resposta ? `<div class="sub" style="margin-top:6px;">Resposta${s.respondente ? ' de ' + esc(s.respondente.nome) : ''}: ${esc(s.resposta)}</div>` : ''}</td>
          <td>${s.status === 'aberta' ? badge(atrasado(s) ? 'red' : 'amber', atrasado(s) ? 'Prazo vencido' : 'Aguardando') : badge('green', 'Respondido')}${s.respondido_em ? `<div class="sub">${fmtData(s.respondido_em)}</div>` : ''}</td>
          <td>${s.status === 'aberta' ? `<button class="btn btn-primary btn-sm" data-responder="${s.id}">Responder</button>` : ''}</td></tr>`))
        : vazio('Nenhum pedido recebido. Quando um motorista pedir acesso, correção ou exclusão de dados pelo app, aparece aqui e no sino.'))}
    ${painel(`Leitura da Política de Privacidade — versão ${VERSAO_PRIVACIDADE}`,
      tabela(['Pessoa', 'Papel', 'Leu em'], listaLeitura.map(u => `<tr><td>${nomeCelula(u.nome, loginDoEmail(u.email))}</td><td>${esc(papelLabel[u.papel] || u.papel)}</td><td>${leu[u.id] ? `<span class="sub">${fmtDataHora(leu[u.id])}</span>` : badge('amber', 'Ainda não leu')}</td></tr>`)),
      botaoExportar('btnCsvLeituras'))}
    ${painelPrazoGuarda(pessoas, anosGuarda)}
    ${barraLista('registro_acesso', ordensRegistro(), 'Pesquisar por pessoa, documento ou ação')}
    <div id="listaRegistroAcesso"></div>`;

  const desenharRegistro = () => {
    const visiveis = aplicarLista('registro_acesso', registros, ordensRegistro(), textoRegistro);
    const caixa = document.getElementById('listaRegistroAcesso');
    caixa.innerHTML = painel(`Registro de acessos e alterações (${visiveis.length}${registros.length === 500 ? ' — últimos 500' : ''})`,
      visiveis.length ? tabela(['Quando', 'Quem', 'Ação', 'O quê', 'De quem é o dado'], visiveis.slice(0, 300).map(r => `<tr>
        <td class="sub">${fmtDataHora(r.criado_em)}</td>
        <td>${esc(r.quem ? r.quem.nome : 'Sistema')}</td>
        <td>${badge(COR_ACAO_REGISTRO[r.acao] || 'grey', ROTULO_ACAO_REGISTRO[r.acao] || r.acao)}</td>
        <td>${esc(r.descricao || r.alvo)}</td>
        <td>${esc(r.titular ? r.titular.nome : '—')}</td></tr>`))
        : vazio(registros.length ? 'Nada encontrado nesta pesquisa.' : 'Ainda não há registros. Daqui para frente, toda abertura de arquivo e toda alteração de documento ou dado de motorista fica anotada aqui.'),
      visiveis.length ? botaoExportar('btnCsvRegistro') : '');
    const csv = document.getElementById('btnCsvRegistro');
    if(csv) csv.addEventListener('click', () => baixarCSV('registro_de_acessos', ['Quando', 'Quem', 'Ação', 'O quê', 'De quem é o dado'],
      visiveis.map(r => [fmtDataHora(r.criado_em), r.quem ? r.quem.nome : 'Sistema', ROTULO_ACAO_REGISTRO[r.acao] || r.acao, r.descricao || r.alvo, r.titular ? r.titular.nome : ''])));
  };
  desenharRegistro();
  ligarBarraLista(el, 'registro_acesso', desenharRegistro);
  el.querySelectorAll('[data-anonimizar]').forEach(b => b.addEventListener('click', () => abrirAnonimizar(pessoas.find(p => p.id === b.dataset.anonimizar), anosGuarda, el)));
  const bPrazo = document.getElementById('btnPrazoGuarda');
  if(bPrazo) bPrazo.addEventListener('click', () => abrirPrazoGuarda(anosGuarda, el));

  el.querySelectorAll('[data-priv]').forEach(a => a.addEventListener('click', (e) => { e.preventDefault(); if(a.dataset.priv === 'politica') abrirPoliticaPrivacidade(); else abrirMeusDadosModal(); }));
  el.querySelectorAll('[data-responder]').forEach(b => b.addEventListener('click', () => abrirResponderPedido(pedidos.find(s => s.id === b.dataset.responder), el)));
  document.getElementById('btnCsvLeituras').addEventListener('click', () => baixarCSV('leitura_politica_privacidade', ['Pessoa', 'Papel', 'Versão', 'Leu em'],
    listaLeitura.map(u => [u.nome, papelLabel[u.papel] || u.papel, VERSAO_PRIVACIDADE, leu[u.id] ? fmtDataHora(leu[u.id]) : 'Ainda não leu'])));
}

// ---------- registro de acessos ----------
const ROTULO_ACAO_REGISTRO = { visualizou: 'Abriu', cadastrou: 'Cadastrou', alterou: 'Alterou', excluiu: 'Excluiu', anonimizou: 'Anonimizou' };
const COR_ACAO_REGISTRO = { visualizou: 'blue', cadastrou: 'green', alterou: 'amber', excluiu: 'red', anonimizou: 'red' };
const textoRegistro = (r) => [r.quem ? r.quem.nome : 'Sistema', r.titular ? r.titular.nome : '', ROTULO_ACAO_REGISTRO[r.acao], r.descricao, fmtDataHora(r.criado_em)].join(' ');
const ordensRegistro = () => [
  ['recentes', 'Mais recentes primeiro', porData(r => r.criado_em, -1)],
  ['antigos', 'Mais antigos primeiro', porData(r => r.criado_em, 1)],
  ['quem', 'Quem fez (A a Z)', (a, b) => porTexto(r => r.quem ? r.quem.nome : 'Sistema')(a, b) || porData(r => r.criado_em, -1)(a, b)],
  ['titular', 'De quem é o dado (A a Z)', (a, b) => porTexto(r => r.titular ? r.titular.nome : 'zzz')(a, b) || porData(r => r.criado_em, -1)(a, b)],
];

// ---------- prazo de guarda e anonimização ----------
const ROTULO_PAPEL_EX = { motorista: 'Ex-motorista', mecanico: 'Ex-mecânico', gestor: 'Ex-usuário do escritório' };
function limiteGuarda(p, anos){ if(!p.desligado_em) return null; const d = new Date(p.desligado_em); d.setFullYear(d.getFullYear() + anos); return d; }

function painelPrazoGuarda(pessoas, anos){
  const desligados = pessoas.filter(p => !p.anonimizado_em && !['admin_transportadora', 'admin_mover_ia'].includes(p.papel))
    .sort((a, b) => (limiteGuarda(a, anos) || 0) - (limiteGuarda(b, anos) || 0));
  const anonimizados = pessoas.filter(p => p.anonimizado_em).length;
  const podeMudar = ['admin_transportadora', 'admin_mover_ia'].includes(usuarioAtual.papel);
  return painel(`Ex-colaboradores e prazo de guarda (${desligados.length})`, `
    <div class="o-panel-body" style="padding-bottom:0;"><div class="l2">Quem tem o acesso desativado fica aqui. Os dados ficam guardados por <b>${anos} ano${anos > 1 ? 's' : ''}</b> depois do desligamento (prazos trabalhistas); passado esse prazo, o sistema avisa toda segunda-feira e você pode <b>anonimizar</b> — os dados pessoais são apagados e o histórico da frota (jornadas, abastecimentos, chamados) continua, sem identificar a pessoa.${anonimizados ? ` Já anonimizados: ${anonimizados}.` : ''}</div></div>
    ${desligados.length ? tabela(['Pessoa', 'Desligado em', 'Guardar até', 'Situação', ''], desligados.map(p => {
      const limite = limiteGuarda(p, anos), vencido = limite && limite < new Date();
      return `<tr><td>${nomeCelula(p.nome, ROTULO_PAPEL_EX[p.papel] || '')}</td>
        <td class="sub">${p.desligado_em ? fmtData(p.desligado_em) : '—'}</td>
        <td class="sub">${limite ? fmtData(limite.toISOString()) : '—'}</td>
        <td>${vencido ? badge('red', 'Prazo vencido — anonimizar') : badge('grey', 'Dentro do prazo')}</td>
        <td><button class="btn ${vencido ? 'btn-primary' : 'btn-outline'} btn-sm" data-anonimizar="${p.id}">Anonimizar</button></td></tr>`;
    })) : vazio('Ninguém desligado no momento.')}`,
    podeMudar ? `<button class="btn btn-outline btn-sm" id="btnPrazoGuarda">Prazo: ${anos} ano${anos > 1 ? 's' : ''}</button>` : '');
}

function abrirPrazoGuarda(anos, el){
  abrirModal('Prazo de guarda após o desligamento', `
    <form id="formPrazoGuarda">
      <div class="l2" style="margin-bottom:10px;">Por quantos anos os dados de quem saiu ficam guardados antes de poderem ser anonimizados. O padrão de 5 anos acompanha os prazos trabalhistas; confirme com o advogado antes de diminuir.</div>
      <select id="pgAnos">${[2, 3, 5, 10, 20].map(n => `<option value="${n}" ${n === anos ? 'selected' : ''}>${n} anos</option>`).join('')}</select>
      <div class="err" id="pgErro"></div>
      <button type="submit" style="margin-top:12px;">Salvar</button>
    </form>`);
  document.getElementById('formPrazoGuarda').addEventListener('submit', async (e) => {
    e.preventDefault();
    const { error } = await sb.from('transportadora').update({ anos_guarda_dados: Number(document.getElementById('pgAnos').value) }).eq('id', usuarioAtual.transportadora_id);
    if(error){ document.getElementById('pgErro').textContent = 'Não consegui salvar: ' + error.message; return; }
    fecharModal(); mostrarToast('✅ Prazo de guarda atualizado'); secaoPrivacidade(el);
  });
}

function abrirAnonimizar(p, anos, el){
  if(!p) return;
  const limite = limiteGuarda(p, anos), dentro = !limite || limite > new Date();
  abrirModal(`Anonimizar ${p.nome}`, `
    ${dentro ? `<div class="card" style="margin:0 0 12px; padding:12px; border:1px solid var(--signal-red); background:var(--signal-red-bg); color:var(--signal-red-ink);"><b>Atenção: ainda está dentro do prazo de guarda${limite ? ' (até ' + fmtData(limite.toISOString()) + ')' : ''}.</b> Só anonimize antes do prazo se houver um bom motivo (por exemplo, um pedido de exclusão aceito) e nenhuma obrigação legal de guardar os dados — na dúvida, consulte o advogado.</div>` : ''}
    <div class="l2"><b>Será apagado para sempre:</b> nome, telefone, login, CPF, CNH e validades de exames, todos os documentos e certificados (com os arquivos), assinaturas, observações das paradas, avisos e pedidos sobre dados. O login é bloqueado.</div>
    <div class="l2" style="margin-top:8px;"><b>Continua, sem identificar a pessoa:</b> horários das jornadas, checklists, abastecimentos, chamados de oficina e viagens — para o histórico da frota.</div>
    <div class="l2" style="margin-top:12px;">Isto <b>não pode ser desfeito</b>. Para confirmar, digite <b>ANONIMIZAR</b>:</div>
    <input type="text" id="anConfirma" autocomplete="off" style="margin-top:8px;">
    <div class="err" id="anErro"></div>
    <button type="button" id="btnAnonimizar" class="btn-danger" style="margin-top:12px; width:100%;" disabled>Anonimizar dados</button>`);
  const campo = document.getElementById('anConfirma'), btn = document.getElementById('btnAnonimizar');
  campo.addEventListener('input', () => { btn.disabled = campo.value.trim().toUpperCase() !== 'ANONIMIZAR'; });
  btn.addEventListener('click', async () => {
    const erro = document.getElementById('anErro');
    btn.disabled = true; btn.textContent = 'Apagando os arquivos...';
    // 1) arquivos (documentos e certificados) — o banco não apaga arquivos do armazenamento
    const [docs, caps] = await Promise.all([
      sb.from('documento').select('arquivo_url').eq('referente_a', 'motorista').eq('referente_id', p.id),
      sb.from('capacitacao').select('certificado_url').eq('motorista_id', p.id),
    ]);
    const caminhos = [...(docs.data || []).map(d => d.arquivo_url), ...(caps.data || []).map(c => c.certificado_url)].filter(Boolean);
    if(caminhos.length){
      const { error } = await sb.storage.from('documentos').remove(caminhos);
      if(error){ erro.textContent = 'Não consegui apagar os arquivos: ' + error.message; btn.disabled = false; btn.textContent = 'Anonimizar dados'; return; }
    }
    // 2) dados no banco
    btn.textContent = 'Anonimizando...';
    const { error } = await sb.rpc('anonimizar_titular', { p_usuario: p.id });
    if(error){ erro.textContent = error.message; btn.disabled = false; btn.textContent = 'Anonimizar dados'; return; }
    fecharModal();
    mostrarToast('✅ Dados anonimizados');
    if(window.limparCacheTelas) limparCacheTelas();
    secaoPrivacidade(el);
  });
}

function abrirResponderPedido(s, el){
  if(!s) return;
  abrirModal(`Responder — ${ROTULO_PEDIDO[s.tipo] || s.tipo}`, `
    <div class="l2" style="margin-bottom:6px;">${esc(s.usuario ? s.usuario.nome : '')} · ${fmtDataHora(s.criado_em)}</div>
    <div class="card" style="margin:0 0 12px; padding:12px; white-space:pre-wrap;">${esc(s.mensagem)}</div>
    <form id="formResponderPedido">
      <textarea id="rpResposta" rows="5" maxlength="2000" required placeholder="${s.tipo === 'correcao' ? 'ex: Telefone atualizado no cadastro.' : s.tipo === 'exclusao' ? 'ex: Apagamos X. A jornada fica guardada por 5 anos por exigência da Lei 13.103/2015.' : 'Escreva a resposta'}"></textarea>
      <div class="err" id="rpErro"></div>
      <button type="submit" style="margin-top:10px;">Enviar resposta</button>
      <div class="l2" style="margin-top:8px;">A pessoa recebe a resposta no app (sino e Meus dados).${s.tipo === 'correcao' ? ' Lembre de corrigir o cadastro em Motoristas.' : ''}</div>
    </form>`);
  document.getElementById('formResponderPedido').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    const resposta = document.getElementById('rpResposta').value.trim();
    if(!resposta){ document.getElementById('rpErro').textContent = 'Escreva a resposta.'; return; }
    btn.disabled = true; btn.textContent = 'Enviando...';
    const { error } = await sb.rpc('responder_solicitacao_titular', { p_id: s.id, p_resposta: resposta });
    if(error){ document.getElementById('rpErro').textContent = error.message; btn.disabled = false; btn.textContent = 'Enviar resposta'; return; }
    fecharModal();
    mostrarToast('✅ Resposta enviada');
    if(window.limparCacheTelas) limparCacheTelas();
    secaoPrivacidade(el);
  });
}
