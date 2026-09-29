// MOVER.IA — painel do escritório
// (arquivo carregado pelo index.html; todas as funções ficam globais,
// então um arquivo pode chamar funções dos outros normalmente)

async function loadPainel(){
  const { data: veiculos } = await sb.from('veiculo').select('placa, tipo, modelo').order('tipo').order('placa');
  const { data: checklists } = await sb
    .from('checklist')
    .select('id, criado_em, respostas, motorista:motorista_id(nome)')
    .order('criado_em', { ascending: false })
    .limit(5);
  const { data: motoristas } = await sb.from('usuario').select('id, nome').eq('papel', 'motorista').order('nome');
  const { data: viagens } = await sb.from('viagem')
    .select('id, origem, destino, cte_numero, mdfe_numero, motorista:motorista_id(nome)')
    .eq('status', 'em_andamento')
    .order('criado_em', { ascending: false });
  const { data: abastecimentos } = await sb.from('abastecimento')
    .select('id, data, km, litros, media_calculada, motorista:motorista_id(nome), veiculo:veiculo_id(placa)')
    .order('data', { ascending: false })
    .limit(5);
  const cavalos = (veiculos||[]).filter(v=>v.tipo==='cavalo');

  document.getElementById('screenContent').innerHTML = `
    <h3>Frota (${cavalos.length} conjuntos)</h3>
    ${cavalos.map(v=>`<div class="card"><div class="l1">${v.placa}<span class="pill">cavalo</span></div><div class="l2">${v.modelo||''}</div></div>`).join('') || '<div class="status">Nenhum veículo cadastrado</div>'}

    <h3>Checklists recebidos (${(checklists||[]).length})</h3>
    ${(checklists||[]).map(c => {
      const naoAtende = (c.respostas||[]).filter(r => r.resposta === 'bad').length;
      return `<div class="card"><div class="l1">${c.motorista ? c.motorista.nome : '—'}${naoAtende ? `<span class="pill vencido">${naoAtende} irregularidade${naoAtende>1?'s':''}</span>` : `<span class="pill ok">OK</span>`}</div><div class="l2">${new Date(c.criado_em).toLocaleString('pt-BR')}</div></div>`;
    }).join('') || '<div class="status">Nenhum checklist recebido ainda</div>'}

    <h3>Viagens em andamento (${(viagens||[]).length})</h3>
    ${(viagens||[]).map(v => `
      <div class="card">
        <div class="l1">${v.motorista ? v.motorista.nome : '—'}</div>
        <div class="l2">${v.origem||'?'} → ${v.destino||'?'}${v.cte_numero?' · CT-e '+v.cte_numero:''}${v.mdfe_numero?' · MDF-e '+v.mdfe_numero:''}</div>
      </div>
    `).join('') || '<div class="status">Nenhuma viagem em andamento</div>'}

    <h3>Nova viagem</h3>
    <div class="card">
      <form id="formNovaViagem">
        <select id="novaViagemMotorista" required>
          <option value="">Selecione o motorista</option>
          ${(motoristas||[]).map(m=>`<option value="${m.id}">${m.nome}</option>`).join('')}
        </select>
        <input type="text" id="novaViagemOrigem" placeholder="Origem">
        <input type="text" id="novaViagemDestino" placeholder="Destino">
        <input type="text" id="novaViagemCte" placeholder="Número do CT-e (opcional)">
        <input type="text" id="novaViagemMdfe" placeholder="Número do MDF-e (opcional)">
        <button type="submit">Criar viagem</button>
      </form>
    </div>

    <h3>Últimos abastecimentos (${(abastecimentos||[]).length})</h3>
    ${(abastecimentos||[]).map(a => `
      <div class="card">
        <div class="l1">${a.motorista ? a.motorista.nome : '—'}${a.media_calculada ? `<span class="pill ok">${Number(a.media_calculada).toFixed(2)} km/l</span>` : ''}</div>
        <div class="l2">${a.veiculo ? a.veiculo.placa : ''} · ${a.km} km · ${a.litros} L · ${new Date(a.data).toLocaleDateString('pt-BR')}</div>
      </div>
    `).join('') || '<div class="status">Nenhum abastecimento registrado ainda</div>'}
  `;

  const formNovaViagem = document.getElementById('formNovaViagem');
  if(formNovaViagem) formNovaViagem.addEventListener('submit', criarViagem);
}

async function criarViagem(e){
  e.preventDefault();
  const btn = e.target.querySelector('button');
  const motoristaId = document.getElementById('novaViagemMotorista').value;
  const origem = document.getElementById('novaViagemOrigem').value.trim();
  const destino = document.getElementById('novaViagemDestino').value.trim();
  const cte = document.getElementById('novaViagemCte').value.trim();
  const mdfe = document.getElementById('novaViagemMdfe').value.trim();

  if(!motoristaId){ alert('Selecione o motorista.'); return; }
  btn.disabled = true; btn.textContent = 'Criando...';

  const { data: conjunto } = await sb.from('conjunto')
    .select('conjunto_item(ordem, veiculo_id)')
    .eq('motorista_id', motoristaId)
    .limit(1)
    .maybeSingle();
  const cavaloItem = conjunto && conjunto.conjunto_item ? conjunto.conjunto_item.find(ci => ci.ordem === 1) : null;

  const { error } = await sb.from('viagem').insert({
    transportadora_id: usuarioAtual.transportadora_id,
    motorista_id: motoristaId,
    veiculo_id: cavaloItem ? cavaloItem.veiculo_id : null,
    origem: origem || null,
    destino: destino || null,
    cte_numero: cte || null,
    mdfe_numero: mdfe || null,
    status: 'em_andamento'
  });

  if(error){ alert('Erro ao criar viagem: ' + error.message); btn.disabled = false; btn.textContent = 'Criar viagem'; return; }

  alert('Viagem criada!');
  loadPainel();
}

function cardDocumento(d, subtitulo){
  return `
    <div class="card">
      <div class="l1">${d.tipo}<span class="pill ${d.status}">${statusLabel[d.status]||d.status}</span></div>
      <div class="l2">${subtitulo ? subtitulo+' · ' : ''}${d.numero || ''}${d.validade ? ' · válido até '+formatarData(d.validade) : ''}</div>
      ${d.qr_conteudo ? `<div class="l2">QR Code lido: ${d.qr_conteudo.length > 70 ? d.qr_conteudo.slice(0,70)+'…' : d.qr_conteudo}</div>` : ''}
      <div class="row">
        ${d.arquivo_url
          ? `<button class="btn-small" data-ver="${d.id}">Ver arquivo</button>`
          : `<span class="l2">Nenhum arquivo anexado</span>`}
        <label class="file-label">${d.arquivo_url ? 'Substituir' : 'Anexar arquivo'}<input type="file" data-anexar="${d.id}"></label>
      </div>
      <div class="row">
        <button class="btn-small" data-qr="${d.id}">📷 Escanear QR Code</button>
      </div>
    </div>`;
}
