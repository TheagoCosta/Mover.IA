// MOVER.IA — Origem da jornada pelo rastreador (escritório, seção Jornadas)
//   • Locais conhecidos: garagem, pátios, terminais... com nome, posição e raio
//   • Importar o relatório "Posições" do rastreador (Tracker, .xls): para cada jornada do motorista do
//     caminhão, pega a posição no horário de início e escreve a Origem (o local conhecido ou a cidade)
// O app guarda só a origem de cada jornada, não o trajeto: o arquivo é lido aqui no navegador e não
// é enviado a lugar nenhum. O relatório vem em pedaços de 2000 posições (uns 3 dias), então
// aceita vários arquivos de uma vez, de vários caminhões.
// (arquivo carregado pelo index.html; todas as funções ficam globais)

const RAIO_LOCAL_PADRAO_M = 500;
const DIFERENCA_MAX_POSICAO_MIN = 15;   // posição mais perto do início da jornada: até 15 min de diferença

const qLocais = () => consultar(sb.from('local_conhecido').select('id, nome, latitude, longitude, raio_m').order('nome'));

function distanciaMetros(lat1, lon1, lat2, lon2){
  const r = Math.PI / 180, a = Math.sin((lat2 - lat1) * r / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin((lon2 - lon1) * r / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(a));
}
// "-22.7686, -47.2747" (como o Google Maps copia) ou "-22,7686 -47,2747"
function lerPosicaoTexto(texto){
  const n = String(texto || '').replace(/(\d),(\d)/g, '$1.$2').match(/-?\d+(?:\.\d+)?/g);
  if(!n || n.length !== 2) return null;
  const lat = Number(n[0]), lon = Number(n[1]);
  return Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { lat, lon } : null;
}
// normalizarPlaca: em cadastros.js (só letras e números; null se não for placa)

// Local conhecido mais perto (dentro do raio) ou a cidade do endereço do rastreador
function origemDaPosicao(pos, locais){
  let melhor = null;
  locais.forEach(l => {
    const d = distanciaMetros(pos.lat, pos.lon, Number(l.latitude), Number(l.longitude));
    if(d <= (l.raio_m || RAIO_LOCAL_PADRAO_M) && (!melhor || d < melhor.d)) melhor = { d, l };
  });
  if(melhor) return { origem: melhor.l.nome, local: true };
  return { origem: cidadeDoEndereco(pos.endereco), local: false };
}
// O endereço do rastreador vem em formatos diferentes ("rua - bairro - cidade - SP - CEP - Brasil",
// "rua - cidade - Sp"...): a cidade é o pedaço antes da sigla do estado
const UFS = 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ');
function cidadeDoEndereco(endereco){
  const partes = String(endereco || '').split(' - ').map(s => s.trim()).filter(Boolean);
  let i = -1;
  partes.forEach((p, k) => { if(UFS.includes(p.toUpperCase())) i = k; });
  const cidade = i > 0 ? partes[i - 1] : partes.length >= 2 ? partes[partes.length - 2] : (partes[0] || '');
  return cidade.toUpperCase();
}

// ---------- leitura do relatório "Posições" ----------
async function lerRelatorioRastreador(arquivo){
  await carregarBiblioteca('planilhaAntiga');
  const wb = XLSX.read(await arquivo.arrayBuffer(), { type: 'array' });
  const linhas = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: '' });
  const textoCab = linhas.slice(0, 14).map(l => l.filter(x => x !== '').join(' ')).join('\n');
  const placa = normalizarPlaca((textoCab.match(/Placa:\s*([A-Z0-9-]+)/i) || [])[1]);
  const iCab = linhas.findIndex(l => l.includes('Data Posição') && l.includes('Latitude'));
  if(!placa || iCab < 0) throw new Error(`${arquivo.name}: não parece o relatório de posições do rastreador (não achei a placa ou as colunas).`);
  const cab = linhas[iCab], col = (nome) => cab.indexOf(nome);
  const cData = col('Data Posição'), cEnd = col('Endereço'), cLat = col('Latitude'), cLon = col('Longitude');
  const posicoes = [];
  linhas.slice(iCab + 1).forEach(l => {
    const m = String(l[cData]).match(/^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})(?::(\d{2}))?/);
    const lat = Number(String(l[cLat]).replace(',', '.')), lon = Number(String(l[cLon]).replace(',', '.'));
    if(!m || !lat || !lon) return;
    posicoes.push({ t: new Date(+m[3], +m[2] - 1, +m[1], +m[4], +m[5], +(m[6] || 0)), lat, lon, endereco: cEnd >= 0 ? String(l[cEnd]) : '' });
  });
  if(!posicoes.length) throw new Error(`${arquivo.name}: o relatório não tem posições.`);
  return { placa, posicoes };
}

// Junta os arquivos por placa (os dois equipamentos do caminhão e os pedaços do mês), sem repetir minuto
function juntarPorPlaca(relatorios){
  const porPlaca = new Map();
  relatorios.forEach(r => {
    const m = porPlaca.get(r.placa) || new Map();
    r.posicoes.forEach(p => { const k = Math.floor(p.t / 60000); if(!m.has(k)) m.set(k, p); });
    porPlaca.set(r.placa, m);
  });
  return [...porPlaca].map(([placa, m]) => {
    const posicoes = [...m.values()].sort((a, b) => a.t - b.t);
    // buracos de mais de 12 h entre os arquivos: falta exportar esse trecho
    const buracos = [];
    for(let i = 1; i < posicoes.length; i++) if(posicoes[i].t - posicoes[i - 1].t > 12 * 3600000) buracos.push([posicoes[i - 1].t, posicoes[i].t]);
    return { placa, posicoes, buracos, de: posicoes[0].t, ate: posicoes[posicoes.length - 1].t };
  });
}

// Posição mais perto do horário (busca binária: as posições estão em ordem)
function posicaoMaisPerto(posicoes, t){
  let a = 0, b = posicoes.length - 1;
  while(b - a > 1){ const m = (a + b) >> 1; if(posicoes[m].t < t) a = m; else b = m; }
  const p = Math.abs(posicoes[a].t - t) <= Math.abs(posicoes[b].t - t) ? posicoes[a] : posicoes[b];
  return Math.abs(p.t - t) / 60000 <= DIFERENCA_MAX_POSICAO_MIN ? p : null;
}

// Cada linha (parte de dividirPorDescanso) já vem com a origem dela: a 1ª parte grava na jornada; as outras,
// no registro de volta da parada longa (o 1º registro da parte)
const origemDaParte = (p) => p.origem || '';
async function salvarOrigemParte(p, origem){
  const valor = origem ? origem.slice(0, 60) : null;
  const { error } = p.parte > 1
    ? await sb.from('jornada_evento').update({ origem: valor }).eq('id', p.jornada_evento[0].id)
    : await sb.from('jornada').update({ origem: valor }).eq('id', p.original.id);
  if(error) throw new Error(error.message);
}

// ---------- tela: locais conhecidos ----------
async function abrirLocaisConhecidos(aoFechar){
  const locais = await qLocais();
  abrirModal('Locais conhecidos', `
    <div class="l2" style="margin-bottom:12px;">Quando a jornada começa dentro do raio de um destes lugares, a Origem sai com o nome dele. Fora deles, sai a cidade do endereço do rastreador.</div>
    ${locais.length ? tabela(['Nome', 'Posição', 'Raio', ''], locais.map(l => `<tr><td><b>${esc(l.nome)}</b></td><td class="mono">${Number(l.latitude).toFixed(5)}, ${Number(l.longitude).toFixed(5)}</td><td>${l.raio_m} m</td>
      <td><button type="button" class="btn btn-outline btn-sm" data-editar-local="${l.id}">Editar</button> <button type="button" class="btn-danger btn-sm" style="padding:6px 10px;" data-excluir-local="${l.id}">Excluir</button></td></tr>`))
      : vazio('Nenhum local cadastrado ainda.')}
    <div class="section-label" id="tituloLocal">Novo local</div>
    <input type="hidden" id="localId">
    <label class="l2" for="localNome">Nome (como aparece na planilha: GARAGEM, IC, ECOPATIO...)</label>
    <input id="localNome" maxlength="60" style="width:100%; margin:4px 0 10px;">
    <label class="l2" for="localPosicao">Posição: no Google Maps, clique com o botão direito no lugar e clique nos números para copiar</label>
    <input id="localPosicao" placeholder="-22.76860, -47.27470" style="width:100%; margin:4px 0 10px;">
    <label class="l2" for="localRaio">Raio em metros (o tamanho do lugar)</label>
    <input id="localRaio" type="number" min="50" max="20000" step="50" value="${RAIO_LOCAL_PADRAO_M}" style="width:100%; margin:4px 0 12px;">
    <div style="display:flex; gap:8px; flex-wrap:wrap;">
      <button type="button" class="btn btn-primary btn-sm" id="btnSalvarLocal">Salvar local</button>
      <button type="button" class="btn btn-outline btn-sm" id="btnFecharLocais">Fechar</button>
    </div>`);
  const reabrir = () => abrirLocaisConhecidos(aoFechar);
  document.getElementById('btnFecharLocais').addEventListener('click', () => { fecharModal(); if(aoFechar) aoFechar(); });
  document.querySelectorAll('[data-editar-local]').forEach(b => b.addEventListener('click', () => {
    const l = locais.find(x => x.id === b.dataset.editarLocal);
    document.getElementById('tituloLocal').textContent = 'Editar ' + l.nome;
    document.getElementById('localId').value = l.id;
    document.getElementById('localNome').value = l.nome;
    document.getElementById('localPosicao').value = `${l.latitude}, ${l.longitude}`;
    document.getElementById('localRaio').value = l.raio_m;
    document.getElementById('localNome').focus();
  }));
  document.querySelectorAll('[data-excluir-local]').forEach(b => b.addEventListener('click', async () => {
    const l = locais.find(x => x.id === b.dataset.excluirLocal);
    if(!confirm(`Excluir o local ${l.nome}? As origens já gravadas nas jornadas continuam como estão.`)) return;
    const { error } = await sb.from('local_conhecido').delete().eq('id', l.id);
    if(error){ alert('Não consegui excluir: ' + error.message); return; }
    reabrir();
  }));
  document.getElementById('btnSalvarLocal').addEventListener('click', async (e) => {
    const nome = document.getElementById('localNome').value.trim().toUpperCase();
    const pos = lerPosicaoTexto(document.getElementById('localPosicao').value);
    const raio = Math.round(Number(document.getElementById('localRaio').value));
    if(!nome){ alert('Digite o nome do local.'); return; }
    if(!pos){ alert('Cole a posição com os dois números (latitude e longitude), ex: -22.76860, -47.27470'); return; }
    if(!(raio >= 50 && raio <= 20000)){ alert('O raio precisa ficar entre 50 e 20.000 metros.'); return; }
    const id = document.getElementById('localId').value;
    const dados = { nome, latitude: pos.lat, longitude: pos.lon, raio_m: raio };
    e.currentTarget.disabled = true;
    const { error } = id ? await sb.from('local_conhecido').update(dados).eq('id', id) : await sb.from('local_conhecido').insert(dados);
    if(error){ e.currentTarget.disabled = false; alert('Não consegui salvar: ' + error.message); return; }
    mostrarToast('✅ Local salvo');
    reabrir();
  });
}

// ---------- tela: importar o relatório do rastreador ----------
async function abrirImportarRastreador(aoTerminar){
  abrirModal('Origem pelo rastreador', `
    <div class="l2" style="margin-bottom:12px;">Escolha os relatórios de <b>Posições</b> exportados do rastreador (.xls). Pode escolher vários de uma vez: caminhões diferentes e pedaços do mês (o rastreador manda até 2000 posições por arquivo, uns 3 dias).
      O app lê os arquivos aqui no computador e grava só a Origem de cada jornada.</div>
    <input type="file" id="rastArquivos" accept=".xls,.xlsx" multiple style="width:100%; margin-bottom:12px;">
    <div id="rastCorpo"></div>
    <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:12px;">
      <button type="button" class="btn btn-outline btn-sm" id="rastLocais">${ic('map', 15)} Locais conhecidos</button>
    </div>`).querySelector('.modal').style.maxWidth = '960px';   // a tabela de jornadas precisa de largura
  const corpo = document.getElementById('rastCorpo');
  let caminhoes = null;
  document.getElementById('rastLocais').addEventListener('click', () => abrirLocaisConhecidos(() => abrirImportarRastreador(aoTerminar)));
  document.getElementById('rastArquivos').addEventListener('change', async (e) => {
    const arquivos = [...e.target.files];
    if(!arquivos.length) return;
    corpo.innerHTML = '<div class="l2">Lendo os arquivos...</div>';
    const lidos = [], erros = [];
    for(const a of arquivos){ try{ lidos.push(await lerRelatorioRastreador(a)); } catch(err){ erros.push(err.message || String(err)); } }
    if(!lidos.length){ corpo.innerHTML = `<div class="l2">${erros.map(esc).join('<br>')}</div>`; return; }
    caminhoes = juntarPorPlaca(lidos);
    await montarPrevia(caminhoes, erros);
  });

  async function montarPrevia(caminhoes, erros){
    const [usuarios, conjuntos, locais] = await Promise.all([qUsuarios(), qConjuntos(), qLocais()]);
    const motoristas = usuarios.filter(u => u.papel === 'motorista').sort((a, b) => a.nome.localeCompare(b.nome));
    // motorista de cada caminhão: o do conjunto ativo com essa placa (o escritório pode trocar)
    caminhoes.forEach(c => {
      if(c.motoristaId !== undefined) return;
      const cj = conjuntos.find(x => x.ativo && x.motorista_id && (x.conjunto_item || []).some(i => i.veiculo && normalizarPlaca(i.veiculo.placa) === c.placa));
      c.motoristaId = cj ? cj.motorista_id : '';
    });
    const linhas = [];
    for(const c of caminhoes){
      if(!c.motoristaId) continue;
      const jornadas = await consultar(sb.from('jornada')
        .select('id, inicio, fim, status, origem, motorista_id, jornada_evento(id, tipo, motivo, criado_em, origem)')
        .eq('motorista_id', c.motoristaId)
        .gte('inicio', new Date(c.de.getTime() - 3 * 86400000).toISOString()).lte('inicio', new Date(c.ate.getTime() + 60000).toISOString()));
      dividirPorDescanso(jornadas).forEach(p => {
        const t = new Date(p.inicio);
        if(t < c.de || t > c.ate) return;
        const pos = posicaoMaisPerto(c.posicoes, t);
        const atual = origemDaParte(p);
        const achou = pos ? origemDaPosicao(pos, locais) : null;
        linhas.push({ c, p, t, pos, atual, achou });
      });
    }
    linhas.sort((a, b) => a.t - b.t);
    const opcoesMot = (sel) => `<option value="">— escolha o motorista —</option>` + motoristas.map(u => `<option value="${u.id}" ${u.id === sel ? 'selected' : ''}>${esc(u.nome)}</option>`).join('');
    const nomeMot = (id) => (motoristas.find(u => u.id === id) || {}).nome || '';
    const variosMot = new Set(linhas.map(l => l.c.motoristaId)).size > 1;
    corpo.innerHTML = `
      ${erros.length ? `<div class="l2" style="margin-bottom:8px;">⚠️ ${erros.map(esc).join('<br>⚠️ ')}</div>` : ''}
      ${tabela(['Placa', 'Período no arquivo', 'Motorista'], caminhoes.map((c, i) => `<tr><td class="mono">${esc(c.placa)}</td><td>${fmtDataHora(c.de.toISOString())} até ${fmtDataHora(c.ate.toISOString())}</td>
        <td><select data-motorista-caminhao="${i}" style="width:100%;">${opcoesMot(c.motoristaId)}</select>
          ${c.buracos.map(([a, b]) => `<div class="l2">⚠️ Sem posições de ${fmtDataHora(a.toISOString())} a ${fmtDataHora(b.toISOString())}: exporte esse trecho do rastreador</div>`).join('')}</td></tr>`))}
      <div class="section-label">Jornadas no período (${linhas.length})</div>
      ${linhas.length ? tabela(['', ...(variosMot ? ['Motorista'] : []), 'Data', 'Início', 'Origem atual', 'Origem pelo rastreador'], linhas.map((l, i) => `<tr>
        <td><input type="checkbox" data-usar="${i}" ${l.achou && l.achou.origem && l.achou.origem !== l.atual ? 'checked' : ''} ${l.achou ? '' : 'disabled'}></td>
        ${variosMot ? `<td>${esc(nomeMot(l.c.motoristaId))}</td>` : ''}<td>${fmtData(l.p.inicio)}</td><td class="mono">${fmtHora(l.p.inicio)}</td><td>${esc(l.atual || '—')}</td>
        <td style="min-width:220px;">${l.achou ? `<input data-origem="${i}" value="${esc(l.achou.origem)}" maxlength="60" style="width:100%;">
          ${l.achou.local ? '' : `<div class="l2">${esc(l.pos.endereco)} · <a href="#" data-cadastrar-local="${i}">cadastrar como local</a></div>`}`
          : '<span class="l2">Sem posição do rastreador neste horário</span>'}</td></tr>`))
        : vazio('Nenhuma jornada destes motoristas no período dos arquivos.')}
      ${linhas.some(l => l.achou) ? `<div style="margin-top:10px;"><button type="button" class="btn btn-primary btn-sm" id="rastSalvar">Gravar as origens marcadas</button></div>` : ''}`;
    corpo.querySelectorAll('[data-motorista-caminhao]').forEach(s => s.addEventListener('change', () => {
      caminhoes[Number(s.dataset.motoristaCaminhao)].motoristaId = s.value;
      montarPrevia(caminhoes, erros);
    }));
    corpo.querySelectorAll('[data-origem]').forEach(inp => inp.addEventListener('input', () => {
      corpo.querySelector(`[data-usar="${inp.dataset.origem}"]`).checked = true;
    }));
    // endereço fora dos locais: cadastra o lugar com a posição do rastreador e refaz a lista
    corpo.querySelectorAll('[data-cadastrar-local]').forEach(a => a.addEventListener('click', async (e) => {
      e.preventDefault();
      const l = linhas[Number(a.dataset.cadastrarLocal)];
      const nome = (prompt(`Nome deste local (ex: GARAGEM, IC, ECOPATIO)\n${l.pos.endereco}`) || '').trim().toUpperCase().slice(0, 60);
      if(!nome) return;
      const { error } = await sb.from('local_conhecido').insert({ nome, latitude: l.pos.lat, longitude: l.pos.lon, raio_m: RAIO_LOCAL_PADRAO_M });
      if(error){ alert('Não consegui salvar: ' + error.message); return; }
      mostrarToast(`✅ ${nome} cadastrado (raio de ${RAIO_LOCAL_PADRAO_M} m)`);
      montarPrevia(caminhoes, erros);
    }));
    const salvar = document.getElementById('rastSalvar');
    if(salvar) salvar.addEventListener('click', async () => {
      const marcadas = linhas.map((l, i) => ({ l, i })).filter(({ i }) => { const c = corpo.querySelector(`[data-usar="${i}"]`); return c && c.checked; });
      if(!marcadas.length){ alert('Marque as jornadas que vão receber a origem.'); return; }
      salvar.disabled = true;
      let ok = 0; const falhas = [];
      for(const { l, i } of marcadas){
        salvar.textContent = `Gravando ${ok + falhas.length + 1} de ${marcadas.length}...`;
        try{ await salvarOrigemParte(l.p, corpo.querySelector(`[data-origem="${i}"]`).value.trim().toUpperCase()); ok++; }
        catch(err){ falhas.push(`${fmtData(l.p.inicio)} ${fmtHora(l.p.inicio)}: ${err.message}`); }
      }
      if(window.limparCacheTelas) limparCacheTelas();
      if(falhas.length){ salvar.disabled = false; salvar.textContent = 'Gravar as origens marcadas'; alert(`Gravei ${ok}. Não consegui gravar:\n${falhas.join('\n')}`); return; }
      fecharModal();
      mostrarToast(`✅ Origem gravada em ${ok} jornada${ok === 1 ? '' : 's'}`);
      if(aoTerminar) aoTerminar();
    });
  }
}
