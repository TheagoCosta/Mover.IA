// MOVER.IA — registro sem sinal (app do motorista)
// Jornada (iniciar, parada, retomar, encerrar), checklist e abastecimento em
// posto funcionam sem internet: o que não deu para enviar fica guardado no
// celular (fila) e vai sozinho quando o sinal volta, na ordem em que foi feito.
// Cada registro guardado leva a hora em que aconteceu (hora_celular); o banco
// aceita essa hora se for das últimas 12 horas e marca "registrado sem sinal"
// para o escritório (migração 20261028_02_registro_sem_sinal.sql).
// Os ids são criados aqui, então reenviar o mesmo registro não duplica.
// Ticket de descarga, oficina (fotos) e abastecimento na bomba própria
// (senha do escritório) continuam precisando de sinal.
// (arquivo carregado pelo index.html; todas as funções ficam globais,
// então um arquivo pode chamar funções dos outros normalmente)

let enviandoFila = false;

function chaveFila(){ return 'moveria:fila:' + (session && session.user ? session.user.id : ''); }
function lerFila(){
  try{ return JSON.parse(localStorage.getItem(chaveFila()) || '[]'); } catch(e){ return []; }
}
function salvarFila(fila){
  try{ if(fila.length) localStorage.setItem(chaveFila(), JSON.stringify(fila)); else localStorage.removeItem(chaveFila()); }
  catch(e){ /* sem espaço: o registro fica só na memória até enviar */ }
}
function novoId(){
  if(window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); });
}

// Falta de internet (e não recusa do servidor)?
function ehErroDeRede(error){
  if(!navigator.onLine) return true;
  const msg = String((error && (error.message || error)) || '');
  return /failed to fetch|networkerror|network request failed|load failed|internet|timed? ?out|fetch/i.test(msg) && !(error && error.code && /^\d|^P|^PGRST/.test(error.code));
}

// Um passo = uma gravação no banco: { tabela, op: 'insert' | 'update', dados, id }
async function executarPasso(p, comHora){
  const dados = comHora && p.hora ? { ...p.dados, hora_celular: p.hora } : p.dados;
  const r = p.op === 'insert' ? await sb.from(p.tabela).insert(dados) : await sb.from(p.tabela).update(dados).eq('id', p.id);
  if(r.error && r.error.code === '23505') return { error: null };   // já tinha chegado (o sinal caiu na resposta)
  return r;
}

// Grava agora; sem sinal (ou com registros ainda na fila, para manter a ordem),
// guarda no celular. Devolve { guardado } ou { erro } quando o servidor recusou.
async function gravarOuGuardar(rotulo, passos, meta = {}){
  const hora = new Date().toISOString();
  passos = passos.map(p => ({ ...p, hora }));
  let i = 0;
  if(!lerFila().length && navigator.onLine){
    for(; i < passos.length; i++){
      const { error } = await executarPasso(passos[i], false);
      if(!error) continue;
      if(!ehErroDeRede(error)) return { erro: error.message };
      break;
    }
    if(i === passos.length) return { guardado: false };
  }
  const fila = lerFila();
  fila.push({ id: novoId(), rotulo, hora, passos: passos.slice(i), ...meta });
  salvarFila(fila);
  if(navigator.onLine) setTimeout(enviarFila, 800); else agendarEnvioFila();
  return { guardado: true };
}

let timerFila = null;
function agendarEnvioFila(){
  clearTimeout(timerFila);
  if(lerFila().length) timerFila = setTimeout(enviarFila, 30000);
}

// Envia o que está guardado, na ordem. Para no primeiro erro de rede.
async function enviarFila(){
  if(enviandoFila || !session || !lerFila().length || !navigator.onLine) return agendarEnvioFila();
  enviandoFila = true;
  let enviados = 0;
  const recusados = [];
  try{
    const { data } = await sb.auth.getSession();   // renova o acesso, se venceu enquanto estava sem sinal
    if(!data || !data.session) return;
    let fila = lerFila();
    while(fila.length){
      const item = fila[0];
      let parou = false;
      while(item.passos.length){
        const { error } = await executarPasso(item.passos[0], true);
        if(error && ehErroDeRede(error)){ parou = true; break; }
        if(error){ recusados.push(`${item.rotulo}: ${error.message}`); item.passos = []; break; }
        item.passos.shift();
        salvarFila(fila);
      }
      if(parou) break;
      fila.shift(); salvarFila(fila); enviados++;
    }
  } finally {
    enviandoFila = false;
    agendarEnvioFila();
  }
  if(enviados || recusados.length){
    limparCacheTelas(); invalidarTravaChecklist();
    if(recusados.length) alert('Alguns registros feitos sem sinal não foram aceitos:\n\n' + recusados.join('\n'));
    else mostrarToast(`✅ ${enviados} registro${enviados > 1 ? 's' : ''} feito${enviados > 1 ? 's' : ''} sem sinal enviado${enviados > 1 ? 's' : ''}`);
    if(usuarioAtual && usuarioAtual.papel === 'motorista' && !usuarioMexendo()) loadShellMotorista();
  }
}
window.addEventListener('online', () => setTimeout(enviarFila, 1500));
document.addEventListener('visibilitychange', () => { if(document.visibilityState === 'visible') enviarFila(); });

// ---------- o que está na fila aparece nas telas como se já tivesse ido ----------
function jornadaComFila(jornada){
  let j = jornada ? { ...jornada, jornada_evento: [...(jornada.jornada_evento || [])] } : null;
  lerFila().forEach(item => {
    if(!item.jornada) return;
    const { acao, jornadaId, motivo, observacao } = item.jornada;
    const ev = (tipo) => ({ tipo, motivo: motivo || null, observacao: observacao || null, criado_em: item.hora });
    if(acao === 'iniciar'){ j = { id: jornadaId, inicio: item.hora, status: 'ativa', jornada_evento: [ev('inicio')] }; return; }
    if(!j || j.id !== jornadaId) return;
    if(acao === 'pausa'){ j.status = 'pausada'; j.jornada_evento.push(ev('pausa')); }
    if(acao === 'retomada'){ j.status = 'ativa'; j.jornada_evento.push(ev('retomada')); }
    if(acao === 'encerrar') j = null;
  });
  return j;
}
function ultimoChecklistComFila(ultimo){
  const naFila = lerFila().filter(i => i.checklist).map(i => i.hora).sort().pop();
  return naFila && (!ultimo || naFila > ultimo.criado_em) ? { id: null, criado_em: naFila } : ultimo;
}
function abastecimentosNaFila(){ return lerFila().filter(i => i.abastecimento).map(i => ({ ...i.abastecimento, data: i.hora, naFila: true })); }

// Faixa no topo das telas do motorista enquanto houver algo guardado
function faixaFila(){
  const n = lerFila().length;
  if(!n) return '';
  return `<div class="alert-card">${ic('sync', 18)}<div class="txt">
    <b>${n} registro${n > 1 ? 's' : ''} guardado${n > 1 ? 's' : ''} no celular</b>
    <span>${navigator.onLine ? 'Enviando...' : 'Sem sinal agora.'} Vai${n > 1 ? 'o' : ''} sozinho${n > 1 ? 's' : ''} para o escritório quando a internet voltar — pode continuar usando o app.</span></div></div>`;
}

// Cópia de segurança para abrir sem sinal: itens do checklist
const CHAVE_ITENS_CHECKLIST = 'moveria:checklist-itens';
function guardarItensChecklist(itens){ try{ if(itens.length) localStorage.setItem(CHAVE_ITENS_CHECKLIST, JSON.stringify(itens)); } catch(e){ /* ignora */ } }
function itensChecklistGuardados(){ try{ return JSON.parse(localStorage.getItem(CHAVE_ITENS_CHECKLIST) || '[]'); } catch(e){ return []; } }
