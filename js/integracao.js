// MOVER.IA — Integração com o Bsoft (tela do escritório; a função do servidor é supabase/functions/bsoft-sincronizar)
// (arquivo carregado pelo index.html; todas as funções ficam globais,
// então um arquivo pode chamar funções dos outros normalmente)

// ---------------------------------------------------------------------
// INTEGRAÇÃO (Bloco 5 do plano)
// ---------------------------------------------------------------------
// Fala com a função do servidor (supabase/functions/bsoft-sincronizar). Ela lê o Bsoft — nada é gravado lá.
async function chamarBsoft(acao, extra = {}){
  if(AMBIENTE_TESTE) throw new Error('No ambiente de teste a integração com o Bsoft fica desligada — assim nada daqui chega ao Bsoft de verdade.');
  const { data } = await sb.auth.getSession();
  const token = data && data.session ? data.session.access_token : null;
  if(!token) throw new Error('Sessão expirada — atualize a página.');
  const resp = await fetch(`${SUPABASE_URL}/functions/v1/bsoft-sincronizar`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify({ ...extra, acao }),
  });
  return resp.json();
}
const ROTULO_SITUACAO_BSOFT = { nova: ['blue', 'Será importada'], ja_importada: ['green', 'Já no app'], sem_motorista: ['amber', 'Motorista não encontrado'], fora_da_frota: ['grey', 'Fora da frota (não importa)'] };
let resultadoBsoft = null;   // último teste/prévia/sincronização feito nesta tela

async function secaoIntegracao(el){
  el.innerHTML = '<div class="status">Consultando a integração...</div>';
  let st, logs = [];
  try{ [st, logs] = await Promise.all([chamarBsoft('status'), consultar(sb.from('sincronizacao_log').select('executado_em, status, registros_processados, erro').order('executado_em', { ascending:false }).limit(15)).catch(() => [])]); }
  catch(e){ st = { error: e.message }; }
  if(st.error && st.configurado === undefined){ el.innerHTML = painel('Integração com o Bsoft', `<div class="o-panel-body"><div class="err">${esc(st.error)}</div></div>`); return; }

  const resumo = st.ultimo_resumo || {};
  const statusConexao = !st.configurado ? '<span style="font-size:16px; color:var(--signal-amber-ink);">● Falta o acesso</span>'
    : st.ultimo_status === 'erro' ? '<span style="font-size:16px; color:var(--signal-red-ink);">● Com erro</span>' : '<span style="font-size:16px; color:var(--signal-green-ink);">● Configurado</span>';
  el.innerHTML = `
    <div class="kpi-row tres">
      ${kpi(statusConexao, 'Bsoft (TMS)', st.dominio ? esc(st.dominio) : '')}
      ${kpi(st.ultima_execucao ? fmtDataHora(st.ultima_execucao) : '—', 'Última sincronização', st.ultimo_status === 'ok' ? `${resumo.criadas || 0} viagem(ns) nova(s) · ${resumo.pdfs || 0} PDF(s)` : '')}
      ${kpi(st.ativo ? 'Ligada' : 'Desligada', 'Sincronização automática', st.ativo ? 'A cada 15 minutos' : 'Ligue depois de conferir a prévia', st.ativo ? 'verde' : '')}
    </div>
    ${!st.configurado ? painel('Falta só um passo: o acesso ao Bsoft', `<div class="o-panel-body"><div class="l2" style="line-height:1.6;">
      A conexão já está pronta no servidor; falta guardar os dados de acesso do <b>usuário de integração</b> do Bsoft (perfil de integração, de preferência só consulta).
      Por segurança, eles ficam num cofre do servidor — não aqui no app nem no chat.
      <ol style="margin:10px 0; padding-left:20px;">
        <li>Abra <a href="https://supabase.com/dashboard/project/otllslhjbyjtktxyvezy/functions/secrets" target="_blank" rel="noopener">o cofre de segredos do Supabase</a> (projeto Mover.IA → Edge Functions → Secrets).</li>
        <li>Crie os 3 segredos: <b>BSOFT_DOMINIO</b> (só o começo do endereço, ex.: <code>chaveslog</code> de chaveslog.bsoft.app), <b>BSOFT_USUARIO</b> e <b>BSOFT_SENHA</b>.</li>
        <li>Volte aqui e toque em "Verificar de novo".</li>
      </ol></div>
      <button class="btn btn-primary btn-sm" id="btnBsoftRecarregar">Verificar de novo</button></div>`)
    : painel('Integração com o Bsoft', `<div class="o-panel-body">
      <div class="l2" style="line-height:1.55; margin-bottom:12px;">O MOVER.IA busca os <b>MDF-e</b> emitidos no Bsoft nos últimos ${st.dias_retroativos || 3} dias, acha o motorista pelo <b>CPF</b> (ou pela placa do conjunto), cria a viagem no app dele e anexa os PDFs do <b>DAMDFE</b> e dos <b>DACTE</b> — o motorista recebe aviso e pode compartilhar por WhatsApp. Nada é gravado no Bsoft.</div>
      <div class="o-acoes" style="flex-wrap:wrap; gap:8px;">
        <button class="btn btn-outline btn-sm" id="btnBsoftTestar">Testar conexão</button>
        <button class="btn btn-outline btn-sm" id="btnBsoftPrevia">Ver prévia (sem gravar)</button>
        <button class="btn btn-primary btn-sm" id="btnBsoftSincronizar">Sincronizar agora</button>
        <button class="btn ${st.ativo ? 'btn-outline' : 'btn-primary'} btn-sm" id="btnBsoftAutomatico">${st.ativo ? 'Desligar automático' : 'Ligar sincronização automática'}</button>
      </div>
      <div id="bsoftResultado" style="margin-top:14px;"></div></div>`)
      + painel('Encerramento do MDF-e', `<div class="o-panel-body">
      <div class="l2" style="line-height:1.55; margin-bottom:12px;">Quando o motorista finaliza a viagem enviando o <b>ticket de descarga</b>, o MOVER.IA pode pedir ao Bsoft para <b>encerrar (dar baixa) no MDF-e</b> dessa viagem. O encerramento vai para a SEFAZ e não se desfaz.
        Situação: <b>${st.encerrar_mdfe ? 'automático LIGADO' : 'automático desligado'}</b>. Com ele desligado, dá para encerrar uma viagem por vez em Viagens (botão "Encerrar MDF-e").</div>
      <button class="btn ${st.encerrar_mdfe ? 'btn-outline' : 'btn-primary'} btn-sm" id="btnBsoftEncerrarAuto">${st.encerrar_mdfe ? 'Desligar encerramento automático' : 'Ligar encerramento automático'}</button></div>`)
      + painel('Documentos do cadastro do Bsoft', `<div class="o-panel-body">
      <div class="l2" style="line-height:1.55; margin-bottom:12px;">Traz os arquivos da aba <b>Arquivos</b> do cadastro de Pessoas do Bsoft — dos <b>motoristas</b> (achados pelo CPF) e da <b>transportadora</b> — para a aba Documentos do MOVER.IA, com a validade quando o Bsoft informa (CNH, ASO, toxicológico).
        Arquivo "CRLV + placa" da transportadora vai para o veículo. Não duplica: o que já foi trazido ou o que o MOVER.IA já tem (CNH, CRLV, ficha) fica como está. Foto de perfil não vem. Nada é gravado no Bsoft.
        Os "Documentos dos Equipamentos" do Bsoft não estão disponíveis na API — continuam sendo enviados pelo MOVER.IA.</div>
      <div class="o-acoes" style="flex-wrap:wrap; gap:8px;">
        <button class="btn btn-outline btn-sm" id="btnBsoftDocsPrevia">Ver o que vem (sem gravar)</button>
        <button class="btn btn-primary btn-sm" id="btnBsoftDocsImportar">Trazer os documentos</button>
      </div>
      <div id="bsoftDocsResultado" style="margin-top:14px;"></div></div>`)}
    ${(resumo.sem_motorista || []).length ? painel('MDF-e sem motorista encontrado (última sincronização)', `<div class="o-panel-body"><div class="l2" style="margin-bottom:8px;">Confira se o CPF do motorista está no cadastro dele (Motoristas → clicar no motorista) ou se a placa está no conjunto certo.</div></div>
      ${tabela(['MDF-e', 'Placa', 'Motorista no Bsoft'], resumo.sem_motorista.map(s => `<tr><td class="mono">${esc(s.manifesto)}</td><td class="mono">${esc(s.placa || '—')}</td><td>${esc(s.motorista_bsoft || '—')}</td></tr>`))}`) : ''}
    ${(resumo.pdfs_com_problema || []).length ? painel(`PDFs que o Bsoft não entregou (${resumo.pdfs_com_problema.length})`, `<div class="o-panel-body"><div class="l2">O Bsoft recusou gerar estes PDFs — quase sempre falta algo no cadastro do MDF-e/CT-e lá (o motivo está abaixo). Depois de corrigir no Bsoft, o MOVER.IA busca sozinho (tenta de novo a cada 6 horas).</div></div>
      ${tabela(['MDF-e', 'Documento', 'Motivo informado pelo Bsoft', 'Desde', 'Tentativas'], resumo.pdfs_com_problema.map(p => `<tr><td class="mono">${esc(p.manifesto)}</td><td>${esc(p.tipo)} ${esc(p.numero || '')}</td><td class="sub" style="max-width:420px;">${esc(p.erro)}</td><td class="sub">${fmtDataHora(p.desde)}</td><td>${p.tentativas}</td></tr>`))}`) : ''}
    ${painel(`Histórico de sincronizações (${logs.length})`, logs.length ? tabela(['Quando', 'Situação', 'Viagens novas', 'Observação'],
      logs.map(l => `<tr><td class="sub">${fmtDataHora(l.executado_em)}</td><td>${l.status === 'ok' || l.status === 'sucesso' ? badge('green', 'OK') : badge('red', 'Erro')}</td><td>${l.registros_processados ?? 0}</td><td class="sub" style="max-width:480px;">${esc(l.erro || '')}</td></tr>`))
      : vazio('Nenhuma sincronização ainda.'))}`;

  const recarregar = document.getElementById('btnBsoftRecarregar');
  if(recarregar) recarregar.addEventListener('click', () => secaoIntegracao(el));
  if(!st.configurado) return;
  if(resultadoBsoft) desenharResultadoBsoft(resultadoBsoft);

  const acao = (id, nome, depois) => document.getElementById(id).addEventListener('click', async (e) => {
    const btn = e.currentTarget, texto = btn.textContent;
    if(nome === 'sincronizar' && !confirm('Sincronizar agora? As viagens novas aparecem no app dos motoristas (eles recebem aviso no celular).')) return;
    btn.disabled = true; btn.textContent = 'Consultando o Bsoft...';
    try{ resultadoBsoft = { acao: nome, ...(await chamarBsoft(nome)) }; }
    catch(err){ resultadoBsoft = { acao: nome, ok: false, error: err.message }; }
    btn.disabled = false; btn.textContent = texto;
    if(depois) return depois();
    desenharResultadoBsoft(resultadoBsoft);
  });
  acao('btnBsoftTestar', 'testar');
  acao('btnBsoftPrevia', 'previa');
  acao('btnBsoftSincronizar', 'sincronizar', () => { if(window.limparCacheTelas) limparCacheTelas(); secaoIntegracao(el); });
  document.getElementById('btnBsoftAutomatico').addEventListener('click', async () => {
    const ligar = !st.ativo;
    if(ligar && !confirm('Ligar a sincronização automática? A cada 15 minutos os MDF-e novos do Bsoft viram viagens no app dos motoristas.')) return;
    const { error } = await sb.rpc('definir_sincronizacao_bsoft', { p_ativo: ligar });
    if(error){ alert(error.message); return; }
    mostrarToast(ligar ? '✅ Sincronização automática ligada' : 'Sincronização automática desligada');
    secaoIntegracao(el);
  });
  ligarDocumentosBsoft();
  document.getElementById('btnBsoftEncerrarAuto').addEventListener('click', async () => {
    const ligar = !st.encerrar_mdfe;
    if(ligar && !confirm('Ligar o encerramento automático? Cada viagem do Bsoft finalizada pelo motorista com o ticket de descarga terá o MDF-e encerrado no Bsoft (e na SEFAZ) na hora. Isso não se desfaz.')) return;
    const { error } = await sb.rpc('definir_encerramento_mdfe', { p_ligar: ligar });
    if(error){ alert(error.message); return; }
    mostrarToast(ligar ? '✅ Encerramento automático ligado' : 'Encerramento automático desligado');
    secaoIntegracao(el);
  });
}

function desenharResultadoBsoft(r){
  const caixa = document.getElementById('bsoftResultado');
  if(!caixa) return;
  if(!r.ok){ caixa.innerHTML = `<div class="err">${esc(r.error || 'Não deu certo.')}</div>`; return; }
  if(r.acao === 'testar'){
    caixa.innerHTML = `<div class="o-banner" style="margin:0;">${ic('check', 18)}<div class="txt"><b>Conexão OK com ${esc(r.dominio)}</b>${r.manifestos_periodo} MDF-e emitido(s) nos últimos ${r.dias} dias${r.manifestos_periodo >= 50 ? ' (50 ou mais)' : ''}. Agora veja a prévia para conferir como cada um seria importado.</div></div>`;
    return;
  }
  const itens = r.itens || [];
  caixa.innerHTML = `
    <div class="l2" style="margin-bottom:8px;"><b>${r.acao === 'previa' ? 'Prévia (nada foi gravado)' : 'Sincronização feita'}</b> · período ${esc(r.periodo || '')} · ${r.manifestos} MDF-e
      ${r.acao === 'sincronizar' ? ` · ${r.criadas} viagem(ns) criada(s) · ${r.pdfs} PDF(s) anexado(s)` : ''}</div>
    ${(r.erros || []).length ? `<div class="err" style="margin-bottom:8px;">${r.erros.slice(0, 5).map(esc).join('<br>')}</div>` : ''}
    ${itens.length ? tabela(['Emissão', 'MDF-e', 'Placa', 'Motorista no Bsoft', 'Motorista no MOVER.IA', 'CT-e', 'Situação'],
      itens.map(i => { const [cor, txt] = ROTULO_SITUACAO_BSOFT[i.situacao] || ['grey', i.situacao]; return `<tr>
        <td class="sub">${esc(i.emissao || '')}</td><td class="mono">${esc(i.manifesto)}</td><td class="mono">${esc(i.placa || '—')}</td>
        <td>${esc(i.motorista_bsoft || '—')}</td><td>${i.motorista ? esc(i.motorista) + `<div class="sub">pelo ${i.achado_por === 'cpf' ? 'CPF' : 'conjunto (placa)'}</div>` : '<span class="sub">—</span>'}</td>
        <td>${i.ctes}</td><td>${badge(cor, txt)}</td></tr>`; }))
      : vazio('Nenhum MDF-e no período.')}`;
}

// ---------- documentos do cadastro de Pessoas do Bsoft (função bsoft-documentos; só lê do Bsoft) ----------
async function chamarBsoftDocumentos(acao){
  if(AMBIENTE_TESTE) throw new Error('No ambiente de teste a integração com o Bsoft fica desligada.');
  const { data } = await sb.auth.getSession();
  const token = data && data.session ? data.session.access_token : null;
  if(!token) throw new Error('Sessão expirada — atualize a página.');
  const resp = await fetch(`${SUPABASE_URL}/functions/v1/bsoft-documentos`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify({ acao }),
  });
  return resp.json();
}
const ROTULO_ACAO_DOC_BSOFT = { importar: ['blue', 'Vem para o MOVER.IA'], anexar: ['blue', 'Anexa ao que já existe'], atualizar: ['blue', 'Versão nova'], ja: ['green', 'Já no MOVER.IA'], pular: ['grey', 'Não vem'], pendente: ['amber', 'Na próxima rodada'] };
function ligarDocumentosBsoft(){
  const caixa = document.getElementById('bsoftDocsResultado');
  const previa = document.getElementById('btnBsoftDocsPrevia'), importar = document.getElementById('btnBsoftDocsImportar');
  if(!caixa || !previa || !importar) return;
  const travar = (sim, texto) => { previa.disabled = importar.disabled = sim; if(texto) caixa.innerHTML = `<div class="status">${esc(texto)}</div>`; };
  const desenhar = (r, total) => {
    if(!r.ok){ caixa.innerHTML = `<div class="err">${esc(r.error || 'Não deu certo.')}</div>`; return; }
    const itens = r.itens || [];
    caixa.innerHTML = `
      <div class="l2" style="margin-bottom:8px;"><b>${r.acao === 'previa' ? 'Prévia (nada foi gravado)' : 'Documentos trazidos'}</b> · ${r.pessoas} pessoa(s) · ${r.arquivos} arquivo(s) no Bsoft
        ${r.acao === 'importar' ? ` · <b>${total ? total.importados : r.importados}</b> novo(s) · ${total ? total.anexados : r.anexados} anexado(s)` : ''}</div>
      ${(r.nao_achadas_no_bsoft || []).length ? `<div class="l2" style="margin-bottom:6px;">Não achei no Bsoft pelo CPF: ${r.nao_achadas_no_bsoft.map(esc).join(', ')}</div>` : ''}
      ${(r.sem_cpf || []).length ? `<div class="l2" style="margin-bottom:6px;">Sem CPF no MOVER.IA (cadastre em Motoristas): ${r.sem_cpf.map(esc).join(', ')}</div>` : ''}
      ${(r.erros || []).length ? `<div class="err" style="margin-bottom:8px;">${r.erros.slice(0, 8).map(esc).join('<br>')}</div>` : ''}
      ${itens.length ? tabela(['De quem', 'Arquivo no Bsoft', 'Entra como', 'Validade', 'Situação'], itens.map(i => { const [cor, txt] = ROTULO_ACAO_DOC_BSOFT[i.acao] || ['grey', i.acao];
        return `<tr><td>${esc(i.destino || i.pessoa)}${i.referente_a === 'veiculo' ? '<div class="sub">veículo</div>' : i.de === 'empresa' ? '<div class="sub">transportadora</div>' : ''}</td>
          <td>${esc(i.descricao)}<div class="sub">${i.tamanho_kb} KB</div></td><td>${esc(i.tipo || '—')}</td><td class="sub">${i.validade ? fmtData(i.validade) : '—'}</td>
          <td>${i.erro ? badge('red', 'Erro') + `<div class="sub">${esc(i.erro)}</div>` : badge(cor, i.feito ? 'Trazido' : txt)}${i.motivo && !i.feito ? `<div class="sub">${esc(i.motivo)}</div>` : ''}</td></tr>`; }))
        : vazio('Nenhum arquivo encontrado no cadastro do Bsoft.')}`;
  };
  previa.addEventListener('click', async () => {
    travar(true, 'Lendo os cadastros no Bsoft (pode levar 1 a 2 minutos)...');
    try{ desenhar(await chamarBsoftDocumentos('previa')); } catch(e){ desenhar({ ok: false, error: e.message }); }
    travar(false);
  });
  importar.addEventListener('click', async () => {
    if(!confirm('Trazer os documentos do cadastro do Bsoft para o MOVER.IA? Os motoristas passam a ver os documentos deles no app.')) return;
    const total = { importados: 0, anexados: 0 };
    let r;
    try{
      for(let rodada = 1; rodada <= 6; rodada++){
        travar(true, `Trazendo os documentos do Bsoft${rodada > 1 ? ` (parte ${rodada})` : ''}...`);
        r = await chamarBsoftDocumentos('importar');
        if(!r.ok) break;
        total.importados += r.importados || 0; total.anexados += r.anexados || 0;
        if(!r.acabou_tempo) break;
      }
    } catch(e){ r = { ok: false, error: e.message }; }
    travar(false);
    desenhar(r, total);
    if(r && r.ok) mostrarToast(`✅ ${total.importados + total.anexados} documento(s) trazido(s) do Bsoft`);
  });
}

// (as seções MOTORISTAS, VEÍCULOS, USUÁRIOS e CONFIGURAÇÕES ficam em js/cadastros.js, com edição)
