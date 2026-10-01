// MOVER.IA — abastecimento pelo app do motorista.
//   • Interno (bomba da transportadora): km, litros, odômetro da bomba e Arla;
//     quem do escritório abasteceu confirma com a PRÓPRIA senha — conferida
//     no servidor (função registrar-abastecimento-interno).
//   • Externo (posto): km, litros, Arla, posto e número da nota/comprovante.
// Data e hora são gravadas automaticamente no momento do registro.
// (arquivo carregado pelo index.html; todas as funções ficam globais,
// então um arquivo pode chamar funções dos outros normalmente)

let tipoAbastecimento = 'interno';
const ROTULO_TIPO_ABAST = { interno:'Interno', externo:'Externo' };

function numBR(v, casas){ return Number(v).toLocaleString('pt-BR', { minimumFractionDigits:casas, maximumFractionDigits:casas }); }
// Lê número no jeito brasileiro: "214.900" = 214900 (ponto de milhar),
// "88.998,3" = 88998.3, "178,5" = 178.5; "178.5" (1–2 casas) = 178.5
function lerNumero(id){
  let t = String(document.getElementById(id).value || '').trim().replace(/\s/g, '');
  if(!t) return null;
  if(t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else if(/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}

async function loadAbastecimentoMotorista(){
  const conjunto = await carregarMeuConjunto();
  const cavalo = veiculosDoConjunto(conjunto).find(ci => ci.ordem === 1) || veiculosDoConjunto(conjunto).find(ci => ci.veiculo.tipo === 'cavalo');

  const [{ data: historico }, { data: ultimoDoVeiculo }, { data: ultimoArla }] = await dadosTela('abastecimento', async () => {
    const r = await Promise.all([
      sb.from('abastecimento')
        .select('id, data, tipo, km, litros, arla_litros, preco_litro_diesel, preco_litro_arla, odometro_bomba, posto, nota_numero, media_calculada, media_arla_calculada, veiculo:veiculo_id(placa), confirmado:confirmado_por(nome)')
        .eq('motorista_id', session.user.id).order('data', { ascending: false }).limit(15),
      cavalo ? sb.from('abastecimento').select('km, data').eq('veiculo_id', cavalo.veiculo_id).order('data', { ascending: false }).limit(1) : Promise.resolve({ data: [] }),
      cavalo ? sb.from('abastecimento').select('km').eq('veiculo_id', cavalo.veiculo_id).gt('arla_litros', 0).order('data', { ascending: false }).limit(1) : Promise.resolve({ data: [] }),
    ]);
    return r.map(x => ({ data: x.data || [] }));
  }, () => { if(motoristaScreen === 'abastecimento') loadAbastecimentoMotorista(); });
  const ultimoKm = ultimoDoVeiculo && ultimoDoVeiculo[0] ? Number(ultimoDoVeiculo[0].km) : null;
  const ultimoKmArla = ultimoArla && ultimoArla[0] ? Number(ultimoArla[0].km) : null;
  const media = mediaDe(historico, 'media_calculada');
  const mediaArla = mediaDe(historico, 'media_arla_calculada');
  const nMedias = (historico || []).filter(a => a.media_calculada).length;
  const interno = tipoAbastecimento === 'interno';

  montarTelaMotorista({
    header: headerVoltar('Abastecimentos'),
    conteudo: `
      <div class="card stat-big">
        <div class="num">${media ? numBR(media, 2) + ' km/l' : '—'}</div>
        <div class="lbl">${media ? `Média de diesel ${nMedias > 1 ? `dos seus últimos ${nMedias} abastecimentos` : 'do seu último abastecimento'}` : 'A média de diesel aparece a partir do 2º abastecimento do veículo'}</div>
        <div class="lbl" style="margin-top:6px;">Arla: <b style="color:var(--text-primary);">${mediaArla ? numBR(mediaArla, 1) + ' km/l' : '—'}</b></div>
      </div>
      ${cavalo ? `
        <div class="card">
          <div class="field-row"><label>Onde foi o abastecimento?</label>
            <div class="doc-tabs" style="margin:0;">
              <button type="button" class="${interno ? 'active' : ''}" data-tipo-abast="interno">${ic('home', 14)} Interno</button>
              <button type="button" class="${!interno ? 'active' : ''}" data-tipo-abast="externo">${ic('fuel', 14)} Externo (posto)</button>
            </div></div>
          <form id="formAbastecimento">
            <div class="field-row" style="margin:0;"><label>Placa</label><input value="${esc(cavalo.veiculo.placa)}" disabled></div>
            <div class="field-row" style="margin:0;"><label>Km do veículo</label><input type="text" inputmode="decimal" id="abKm" placeholder="${ultimoKm ? 'último registrado: ' + numBR(ultimoKm, 0) : 'ex: 214900'}" required></div>
            <div class="grid2">
              <div class="field-row" style="margin:0;"><label>Diesel (litros)</label><input type="text" inputmode="decimal" id="abLitros" placeholder="ex: 178" required></div>
              <div class="field-row" style="margin:0;"><label>Arla (litros)</label><input type="text" inputmode="decimal" id="abArla" placeholder="se abasteceu"></div>
            </div>
            ${interno ? `
              <div class="field-row" style="margin:0;"><label>Odômetro da bomba</label><input type="text" inputmode="decimal" id="abOdometro" placeholder="ex: 88998,3" required></div>
              <div class="card-dark-sub">Para concluir, quem do escritório abasteceu confirma com a própria senha.</div>
            ` : `
              <div class="grid2">
                <div class="field-row" style="margin:0;"><label>Diesel — R$ por litro</label><input type="text" inputmode="decimal" id="abPrecoDiesel" placeholder="ex: 6,19" required></div>
                <div class="field-row" style="margin:0;"><label>Arla — R$ por litro</label><input type="text" inputmode="decimal" id="abPrecoArla" placeholder="se abasteceu"></div>
              </div>
              <div class="card-dark-sub" id="abTotal">Total: —</div>
              <div class="field-row" style="margin:0;"><label>Posto</label><input type="text" id="abPosto" placeholder="ex: Posto 56, Jundiaí" required></div>
              <div class="field-row" style="margin:0;"><label>Nº da nota ou comprovante</label><input type="text" id="abNota" placeholder="ex: 000123456" required></div>
            `}
            <div class="err" id="abErro"></div>
            <button type="submit">${interno ? 'Continuar para confirmação' : 'Registrar abastecimento'}</button>
          </form>
        </div>`
      : '<div class="card"><div class="card-dark-sub">Você precisa estar vinculado a um conjunto para registrar abastecimento. Fale com o escritório.</div></div>'}
      <div class="section-label">Últimos abastecimentos</div>
      ${(historico||[]).length ? `<div class="card lista">${historico.map(itemAbastecimentoMotorista).join('')}</div>`
      : '<div class="status">Nenhum abastecimento registrado ainda</div>'}`,
  });

  document.querySelectorAll('[data-tipo-abast]').forEach(b => b.addEventListener('click', () => { tipoAbastecimento = b.dataset.tipoAbast; loadAbastecimentoMotorista(); }));
  const form = document.getElementById('formAbastecimento');
  if(form) form.addEventListener('submit', (e) => { e.preventDefault(); prepararAbastecimento(cavalo, ultimoKm, ultimoKmArla); });
  // total do posto atualizado enquanto digita
  const total = document.getElementById('abTotal');
  if(total) ['abLitros', 'abArla', 'abPrecoDiesel', 'abPrecoArla'].forEach(id => document.getElementById(id).addEventListener('input', () => {
    const v = valorAbastecimento({ litros: lerNumero('abLitros'), arla_litros: lerNumero('abArla'), preco_litro_diesel: lerNumero('abPrecoDiesel'), preco_litro_arla: lerNumero('abPrecoArla') });
    total.textContent = v ? `Total: ${fmtReais(v)}` : 'Total: —';
  }));
}

function mediaDe(lista, campo){
  const v = (lista || []).filter(a => a[campo]).map(a => Number(a[campo]));
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
}
function fmtReais(v){ return Number(v).toLocaleString('pt-BR', { style:'currency', currency:'BRL' }); }
// Valor pago no posto (diesel + Arla); nulo se não tiver preço
function valorAbastecimento(a){
  const d = a.preco_litro_diesel && a.litros ? Number(a.preco_litro_diesel) * Number(a.litros) : 0;
  const r = a.preco_litro_arla && a.arla_litros ? Number(a.preco_litro_arla) * Number(a.arla_litros) : 0;
  return (d + r) > 0 && !Number.isNaN(d + r) ? d + r : null;
}

function itemAbastecimentoMotorista(a){
  const valor = valorAbastecimento(a);
  const detalhe = a.tipo === 'externo'
    ? `${esc(a.posto || 'Posto não informado')}${a.nota_numero ? ' · nota ' + esc(a.nota_numero) : ''}${valor ? ' · ' + fmtReais(valor) : ''}`
    : a.tipo === 'interno'
      ? `Interno${a.odometro_bomba != null ? ' · bomba ' + numBR(a.odometro_bomba, 1) : ''}${a.confirmado ? ' · confirmado por ' + esc(a.confirmado.nome.split(' ')[0]) : ''}`
      : (a.odometro_bomba != null ? 'bomba ' + numBR(a.odometro_bomba, 1) : '');
  return `
    <div class="list-item"><div class="li-ic">${ic('fuel', 16)}</div>
      <div class="li-body">
        <div class="li-title">${numBR(a.litros, 1)} L diesel${a.media_calculada ? ' · ' + numBR(a.media_calculada, 2) + ' km/l' : ''}</div>
        ${a.arla_litros ? `<div class="li-sub">+ ${numBR(a.arla_litros, 1)} L Arla${a.media_arla_calculada ? ' · ' + numBR(a.media_arla_calculada, 1) + ' km/l' : ''}</div>` : ''}
        <div class="li-sub">${fmtDataHora(a.data)} · ${esc(a.veiculo ? a.veiculo.placa : '')} · km ${numBR(a.km, 0)}</div>
        ${detalhe ? `<div class="li-sub">${detalhe}</div>` : ''}
      </div>
      ${a.tipo ? pillStatus(a.tipo === 'interno' ? 'blue' : 'grey', ROTULO_TIPO_ABAST[a.tipo]) : ''}
    </div>`;
}

// Confere os campos; externo grava direto, interno abre a confirmação do escritório
async function prepararAbastecimento(cavalo, ultimoKm, ultimoKmArla){
  const erro = document.getElementById('abErro');
  erro.textContent = '';
  const km = lerNumero('abKm'), litros = lerNumero('abLitros'), arla = lerNumero('abArla');
  if(!km || km <= 0 || Number.isNaN(km)){ erro.textContent = 'Informe o km do veículo.'; return; }
  if(!litros || litros <= 0 || Number.isNaN(litros)){ erro.textContent = 'Informe os litros de diesel.'; return; }
  if(Number.isNaN(arla) || (arla !== null && arla < 0)){ erro.textContent = 'Litros de Arla inválido.'; return; }
  if(litros > 1500){ erro.textContent = 'Litros de diesel muito alto — confira o valor.'; return; }
  if(ultimoKm && km <= ultimoKm && !confirm(`O km informado (${numBR(km, 0)}) é menor ou igual ao último registrado para este veículo (${numBR(ultimoKm, 0)}). Está certo?`)) return;

  if(tipoAbastecimento === 'externo'){
    const posto = document.getElementById('abPosto').value.trim();
    const nota = document.getElementById('abNota').value.trim();
    const precoDiesel = lerNumero('abPrecoDiesel'), precoArla = lerNumero('abPrecoArla');
    if(!precoDiesel || Number.isNaN(precoDiesel) || precoDiesel <= 0){ erro.textContent = 'Informe o preço do litro do diesel.'; return; }
    if(precoDiesel > 20){ erro.textContent = 'Preço do diesel muito alto — confira (ex: 6,19).'; return; }
    if(arla && (!precoArla || Number.isNaN(precoArla) || precoArla <= 0)){ erro.textContent = 'Informe o preço do litro do Arla.'; return; }
    if(precoArla && precoArla > 20){ erro.textContent = 'Preço do Arla muito alto — confira (ex: 3,90).'; return; }
    if(!posto){ erro.textContent = 'Informe o posto onde abasteceu.'; return; }
    if(!nota){ erro.textContent = 'Informe o número da nota ou comprovante.'; return; }
    const btn = document.querySelector('#formAbastecimento button[type="submit"]');
    btn.disabled = true; btn.textContent = 'Salvando...';
    // média do diesel: só litros de diesel (o Arla não entra); Arla tem média própria
    const media = ultimoKm && km > ultimoKm ? (km - ultimoKm) / litros : null;
    const mediaArla = arla && ultimoKmArla && km > ultimoKmArla ? (km - ultimoKmArla) / arla : null;
    const { error } = await sb.from('abastecimento').insert({
      transportadora_id: usuarioAtual.transportadora_id,
      motorista_id: session.user.id,
      veiculo_id: cavalo.veiculo_id,
      tipo: 'externo',
      km, litros, arla_litros: arla,
      preco_litro_diesel: precoDiesel, preco_litro_arla: arla ? precoArla : null,
      posto, nota_numero: nota,
      media_calculada: media, media_arla_calculada: mediaArla,
    });
    if(error){ erro.textContent = 'Erro ao salvar: ' + error.message; btn.disabled = false; btn.textContent = 'Registrar abastecimento'; return; }
    mostrarToast(media ? `✅ Abastecimento salvo — ${media.toFixed(2).replace('.', ',')} km/l` : '✅ Abastecimento salvo');
    loadAbastecimentoMotorista();
    return;
  }

  const odometro = lerNumero('abOdometro');
  if(odometro === null || Number.isNaN(odometro) || odometro < 0){ erro.textContent = 'Informe o odômetro da bomba.'; return; }
  abrirConfirmacaoEscritorio({ veiculo_id: cavalo.veiculo_id, placa: cavalo.veiculo.placa, km, litros, arla_litros: arla, odometro_bomba: odometro });
}

async function abrirConfirmacaoEscritorio(dados){
  const { data: escritorio } = await sb.from('usuario').select('id, nome, papel').in('papel', PAPEIS_GESTAO).eq('ativo', true).order('nome');
  abrirModal('Confirmação do escritório', `
    <div class="card" style="margin-bottom:14px;">
      <div class="card-dark-title">${esc(dados.placa)} · abastecimento interno</div>
      <div class="card-dark-sub">km ${numBR(dados.km, 0)} · ${numBR(dados.litros, 1)} L diesel${dados.arla_litros ? ' · ' + numBR(dados.arla_litros, 1) + ' L Arla' : ''} · bomba ${numBR(dados.odometro_bomba, 1)}</div>
      <div class="card-dark-sub">${fmtDataHora(new Date())}</div>
    </div>
    <form id="formConfirmacao">
      <div class="field-row" style="margin:0;"><label for="cfQuem">Quem abasteceu</label>
        <select id="cfQuem" required><option value="">Selecione seu nome</option>${(escritorio || []).map(u => `<option value="${u.id}">${esc(u.nome)}</option>`).join('')}</select></div>
      <div class="field-row" style="margin:0;"><label for="cfSenha">Senha (a mesma que você usa no MOVER.IA)</label>
        <input type="password" id="cfSenha" required autocomplete="off"></div>
      <div class="err" id="cfErro"></div>
      <button type="submit">Confirmar abastecimento</button>
    </form>`);
  document.getElementById('formConfirmacao').addEventListener('submit', async (e) => {
    e.preventDefault();
    const erro = document.getElementById('cfErro');
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = 'Conferindo...';
    const r = await chamarFuncaoServidor('registrar-abastecimento-interno', {
      ...dados, confirmador_id: document.getElementById('cfQuem').value, senha: document.getElementById('cfSenha').value,
    });
    document.getElementById('cfSenha').value = '';
    if(r.error){ erro.textContent = r.error; btn.disabled = false; btn.textContent = 'Confirmar abastecimento'; return; }
    fecharModal();
    const m = r.dados && r.dados.media;
    mostrarToast(`✅ Abastecimento confirmado por ${(r.dados.confirmado_por || '').split(' ')[0]}${m ? ' — ' + m.toFixed(2).replace('.', ',') + ' km/l' : ''}`);
    loadAbastecimentoMotorista();
  });
}
