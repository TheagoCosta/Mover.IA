// MOVER.IA — cadastros e edição pelo painel do escritório: motoristas e
// usuários (dados, nova senha, desativar), veículos, conjuntos, dados da
// empresa e edição/exclusão de documentos.
// (arquivo carregado pelo index.html; todas as funções ficam globais,
// então um arquivo pode chamar funções dos outros normalmente)

// Chama uma função de servidor (Edge Function) do Supabase com o login atual
async function chamarFuncaoServidor(nome, corpo){
  try{
    const { data: s } = await sb.auth.getSession();
    const token = s && s.session ? s.session.access_token : null;
    if(!token) return { error: 'Sessão expirada — atualize a página e tente de novo.' };
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/${nome}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify(corpo),
    });
    const dados = await resp.json().catch(() => ({}));
    if(!resp.ok) return { error: dados.error || `Erro (${resp.status}).` };
    return { dados };
  } catch(e){
    return { error: 'Não consegui falar com o servidor: ' + e.message };
  }
}

// Placa: aceita "gkh1b12", "GKH-1B12" etc. e devolve "GKH-1B12" (Mercosul ou antiga)
function normalizarPlaca(texto){
  const p = String(texto || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if(!/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(p)) return null;
  return p.slice(0, 3) + '-' + p.slice(3);
}

function campoTexto(id, rotulo, valor = '', extra = ''){
  return `<div class="field-row" style="margin:0;"><label for="${id}">${rotulo}</label><input type="text" id="${id}" value="${esc(valor || '')}" ${extra}></div>`;
}

// ---------------------------------------------------------------------
// MOTORISTAS
// ---------------------------------------------------------------------
async function secaoMotoristas(el){
  const [usuarios, conjuntos, docs, jornadasAbertas, checklists] = await Promise.all([
    qUsuarios(), qConjuntos(),
    consultar(sb.from('documento').select('id, referente_id, tipo, numero, validade, status').eq('referente_a', 'motorista')),
    consultar(sb.from('jornada').select('motorista_id, status').neq('status', 'encerrada')),
    consultar(sb.from('checklist').select('motorista_id, criado_em').gte('criado_em', new Date(Date.now() - 30 * 86400000).toISOString()).order('criado_em', { ascending:false })),
  ]);
  const ultimoChecklist = {};
  checklists.forEach(c => { if(!ultimoChecklist[c.motorista_id]) ultimoChecklist[c.motorista_id] = c.criado_em; });
  const celulaChecklist = (m, conj) => {
    if(!conj) return '<span class="sub">Sem conjunto</span>';
    const ult = ultimoChecklist[m.id];
    const vence = ult ? new Date(new Date(ult).getTime() + VALIDADE_CHECKLIST_HORAS * 3600000) : null;
    return vence && vence > new Date()
      ? `${badge('green', 'Em dia')}<div class="sub">até ${fmtDataCurta(vence)} ${fmtHora(vence)}</div>`
      : `${badge('red', 'Vencido')}<div class="sub">${ult ? 'último ' + fmtDataCurta(ult) + ' ' + fmtHora(ult) : 'nenhum em 30 dias'}</div>`;
  };
  const motoristas = usuarios.filter(u => u.papel === 'motorista').sort((a, b) => (b.ativo - a.ativo) || a.nome.localeCompare(b.nome));
  const linhas = motoristas.map(m => {
    const meusDocs = docs.filter(d => d.referente_id === m.id);
    const cnh = meusDocs.find(d => /cnh/i.test(d.tipo));
    const conj = conjuntos.find(c => c.motorista_id === m.id && c.ativo);
    const jornada = jornadasAbertas.find(j => j.motorista_id === m.id);
    const pior = piorStatus(meusDocs);
    const situacao = !m.ativo ? badge('grey', 'Desativado') : m.senha_temporaria ? badge('amber', 'Aguardando 1º acesso')
      : jornada ? badge('blue', jornada.status === 'pausada' ? 'Em parada' : 'Em jornada') : badge('green', 'Ativo');
    return { m, meusDocs, conj, cnh, pior, situacao };
  });

  el.innerHTML = `
    <div class="o-banner">${ic('doc', 18)}<div class="txt"><b>Cadastrar motorista novo</b>Envie a CNH dele em <a href="#" data-ir="documentos">Documentos</a> — o app lê o nome e o CPF e cria o login sozinho. Clique num motorista para editar, vincular conjunto, gerar nova senha ou desativar.</div></div>
    ${painel(`Motoristas (${motoristas.filter(m => m.ativo).length} ativos)`,
      motoristas.length ? tabela(['Motorista', 'Conjunto', 'Checklist (24h)', 'CNH', 'Documentos', 'Situação'],
        linhas.map(({ m, conj, cnh, pior, meusDocs, situacao }) => `<tr class="clickable" data-usuario="${m.id}" style="${m.ativo ? '' : 'opacity:.55;'}">
          <td>${nomeCelula(m.nome, loginDoEmail(m.email))}</td>
          <td class="mono">${conj ? esc(cavaloDoConjunto(conj)) : '<span class="sub">Sem conjunto</span>'}</td>
          <td>${m.ativo ? celulaChecklist(m, conj) : '<span class="sub">—</span>'}</td>
          <td>${cnh ? `${badgeDoc(cnh)}<div class="sub">${esc(textoVencimento(cnh))}</div>` : '<span class="sub">Não cadastrada</span>'}</td>
          <td>${pior ? badge(COR_STATUS_DOC[pior], `${meusDocs.length} · ${ROTULO_STATUS_DOC[pior]}`) : '<span class="sub">Nenhum</span>'}</td>
          <td>${situacao}</td></tr>`))
        : vazio('Nenhum motorista cadastrado ainda.'))}`;

  el.querySelectorAll('[data-ir]').forEach(a => a.addEventListener('click', (e) => { e.preventDefault(); screen = a.dataset.ir; loadEscritorio(); }));
  el.querySelectorAll('[data-usuario]').forEach(tr => tr.addEventListener('click', () => {
    const l = linhas.find(x => x.m.id === tr.dataset.usuario);
    abrirEditarUsuario(l.m, { conjuntos, docs: l.meusDocs });
  }));
}

// Janela de edição de motorista/mecânico/usuário do escritório
async function abrirEditarUsuario(u, { conjuntos = null, docs = [] } = {}){
  const ehMotorista = u.papel === 'motorista';
  const ehEu = u.id === session.user.id;
  const ehGestaoAlvo = PAPEIS_GESTAO.includes(u.papel);
  const podeGerenciarAcesso = !ehEu && (!ehGestaoAlvo || usuarioAtual.papel === 'admin_transportadora' || usuarioAtual.papel === 'admin_mover_ia');
  if(ehMotorista && !conjuntos) conjuntos = await qConjuntos();
  const perfil = ehMotorista ? ((await sb.from('motorista_perfil').select('cpf, categoria_cnh').eq('usuario_id', u.id).maybeSingle()).data || {}) : {};
  const conjAtual = ehMotorista ? conjuntos.find(c => c.motorista_id === u.id && c.ativo) : null;
  const opcoesConjunto = ehMotorista ? conjuntos.filter(c => c.ativo).map(c => {
    const dono = c.motorista && c.motorista_id !== u.id ? ` (hoje com ${c.motorista.nome.split(' ')[0]})` : '';
    return `<option value="${c.id}" ${conjAtual && conjAtual.id === c.id ? 'selected' : ''}>${esc(itensOrdenados(c).map(i => i.veiculo.placa).join(' → ') || 'Conjunto vazio')}${esc(dono)}</option>`;
  }).join('') : '';

  abrirModal(u.nome, `
    <form id="formUsuario">
      <div class="l2">Login: <b class="mono">${esc(loginDoEmail(u.email))}</b> · ${esc(papelLabel[u.papel] || u.papel)} · ${u.ativo ? (u.senha_temporaria ? 'aguardando 1º acesso' : 'ativo') : '<b>desativado</b>'}</div>
      ${campoTexto('euNome', 'Nome completo', u.nome, 'required minlength="5"')}
      <div class="o-form-grid">
        ${campoTexto('euTelefone', 'Telefone', u.telefone, 'inputmode="tel" placeholder="(00) 00000-0000"')}
        ${ehMotorista ? campoTexto('euCpf', 'CPF', perfil.cpf, 'inputmode="numeric" placeholder="000.000.000-00"') : ''}
        ${ehMotorista ? campoTexto('euCategoria', 'Categoria da CNH', perfil.categoria_cnh, 'placeholder="ex: E" maxlength="3"') : ''}
      </div>
      ${ehMotorista ? `<div class="field-row" style="margin:0;"><label for="euConjunto">Conjunto que dirige</label>
        <select id="euConjunto"><option value="">Nenhum</option>${opcoesConjunto}</select></div>
        <div class="l2" style="margin-top:-6px;">Para montar ou mudar as placas de um conjunto, use Veículos.</div>` : ''}
      ${ehMotorista && docs.length ? `<div class="section-label" style="margin:4px 0 0;">Documentos</div>${docs.map(d => `<div style="display:flex; justify-content:space-between; gap:10px;"><div>${esc(d.tipo)}<div class="l2">${esc(textoVencimento(d))}</div></div>${badgeDoc(d)}</div>`).join('')}` : ''}
      <div class="err" id="euErro"></div>
      <button type="submit" ${u.ativo ? '' : 'disabled'}>Salvar alterações</button>
      ${podeGerenciarAcesso ? `<div class="o-acoes" style="justify-content:space-between;">
        ${u.ativo ? `<button type="button" class="btn btn-outline btn-sm" id="btnNovaSenha">${ic('lock', 14)} Gerar nova senha temporária</button>` : ''}
        <button type="button" class="btn btn-outline btn-sm" id="btnAtivo" style="${u.ativo ? 'color:var(--signal-red-ink);' : ''}">${u.ativo ? 'Desativar acesso' : 'Reativar acesso'}</button>
      </div>` : ''}
    </form>`);

  document.getElementById('formUsuario').addEventListener('submit', async (e) => {
    e.preventDefault();
    const erro = document.getElementById('euErro');
    const nome = document.getElementById('euNome').value.trim().replace(/\s+/g, ' ');
    if(nome.split(' ').length < 2){ erro.textContent = 'Digite nome e sobrenome.'; return; }
    const cpfDigitado = ehMotorista ? document.getElementById('euCpf').value.trim() : '';
    if(cpfDigitado && !cpfValido(cpfDigitado)){ erro.textContent = 'CPF inválido — confira os números.'; return; }
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = 'Salvando...';
    const falhas = [];
    const { error: e1 } = await sb.from('usuario').update({ nome, telefone: document.getElementById('euTelefone').value.trim() || null }).eq('id', u.id);
    if(e1) falhas.push(e1.message);

    if(ehMotorista){
      const d = cpfDigitado.replace(/\D/g, '');
      const cpf = d ? `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}` : null;
      const { error: e2 } = await sb.from('motorista_perfil').upsert({ usuario_id: u.id, cpf, categoria_cnh: document.getElementById('euCategoria').value.trim().toUpperCase() || null });
      if(e2) falhas.push(e2.message);

      const novoConj = document.getElementById('euConjunto').value;
      if((conjAtual ? conjAtual.id : '') !== novoConj){
        if(conjAtual){ const { error } = await sb.from('conjunto').update({ motorista_id: null }).eq('id', conjAtual.id); if(error) falhas.push(error.message); }
        if(novoConj){ const { error } = await sb.from('conjunto').update({ motorista_id: u.id }).eq('id', novoConj); if(error) falhas.push(error.message); }
      }
    }
    if(falhas.length){ erro.textContent = 'Algumas alterações não foram salvas: ' + falhas.join(' · '); btn.disabled = false; btn.textContent = 'Salvar alterações'; return; }
    if(ehEu) usuarioAtual.nome = nome;
    fecharModal();
    mostrarToast('✅ Alterações salvas');
    loadEscritorio();
  });

  const btnSenha = document.getElementById('btnNovaSenha');
  if(btnSenha) btnSenha.addEventListener('click', async () => {
    if(!confirm(`Gerar uma nova senha temporária para ${u.nome}? A senha atual deixa de funcionar na hora.`)) return;
    btnSenha.disabled = true;
    const r = await chamarFuncaoServidor('gerenciar-usuario', { acao: 'resetar_senha', usuario_id: u.id });
    if(r.error){ alert(r.error); btnSenha.disabled = false; return; }
    fecharModal();
    await mostrarCredenciaisNovoMotorista(r.dados, 'Nova senha temporária',
      `Anote e repasse para ${u.nome.split(' ')[0]}. No próximo acesso, o app pede para criar uma senha nova.`);
    loadEscritorio();
  });

  const btnAtivo = document.getElementById('btnAtivo');
  if(btnAtivo) btnAtivo.addEventListener('click', async () => {
    const desativar = u.ativo;
    const msg = desativar
      ? `Desativar o acesso de ${u.nome}? Ele(a) não consegue mais entrar no app${ehMotorista ? ' e deixa de ficar vinculado(a) ao conjunto' : ''}. O histórico (jornadas, checklists, documentos) continua guardado.`
      : `Reativar o acesso de ${u.nome}?`;
    if(!confirm(msg)) return;
    btnAtivo.disabled = true;
    const r = await chamarFuncaoServidor('gerenciar-usuario', { acao: desativar ? 'desativar' : 'reativar', usuario_id: u.id });
    if(r.error){ alert(r.error); btnAtivo.disabled = false; return; }
    fecharModal();
    mostrarToast(desativar ? '✅ Acesso desativado' : '✅ Acesso reativado');
    loadEscritorio();
  });
}

// ---------------------------------------------------------------------
// VEÍCULOS e CONJUNTOS
// ---------------------------------------------------------------------
const POSICOES_CONJUNTO = [
  { ordem:1, tipo:'cavalo', rotulo:'Cavalo mecânico', obrigatorio:true },
  { ordem:2, tipo:'carreta', rotulo:'1ª carreta' },
  { ordem:3, tipo:'dolly', rotulo:'Dolly' },
  { ordem:4, tipo:'carreta', rotulo:'2ª carreta' },
];

let filtroVeiculos = 'todos';
let buscaVeiculos = '';

async function secaoVeiculos(el){
  const [veiculos, conjuntosTodos, docs, usuarios] = await Promise.all([
    qVeiculos(), qConjuntos(),
    consultar(sb.from('documento').select('id, referente_id, tipo, validade, status').eq('referente_a', 'veiculo')),
    qUsuarios(),
  ]);
  const conjuntos = conjuntosTodos.filter(c => c.ativo);
  const docsDe = (vid) => docs.filter(d => d.referente_id === vid);
  const conjuntoDoVeiculo = {};
  conjuntos.forEach(c => (c.conjunto_item || []).forEach(i => { conjuntoDoVeiculo[i.veiculo_id] = c; }));
  const celulaPlaca = (item) => item ? `<span class="mono">${esc(item.veiculo.placa)}</span>` : '<span class="sub">—</span>';
  const motoristas = usuarios.filter(u => u.papel === 'motorista' && u.ativo);
  const posicaoDo = (v) => {
    const c = conjuntoDoVeiculo[v.id];
    const item = c && (c.conjunto_item || []).find(i => i.veiculo_id === v.id);
    return item ? item.ordem : null;
  };
  const rotuloPosicao = (v) => {
    const ordem = posicaoDo(v);
    if(v.tipo === 'carreta') return ordem ? labelPosicaoConjunto(ordem, 'carreta').replace(/^./, s => s.toUpperCase()) : 'Carreta (fora de conjunto)';
    return (tipoLabelGlobal[v.tipo] || v.tipo) + (ordem ? '' : ' (fora de conjunto)');
  };
  const FILTROS = [
    ['todos', 'Todos', () => true],
    ['cavalo', 'Cavalos', v => v.tipo === 'cavalo'],
    ['carreta1', '1ª carretas', v => v.tipo === 'carreta' && posicaoDo(v) && posicaoDo(v) <= 2],
    ['carreta2', '2ª carretas', v => v.tipo === 'carreta' && posicaoDo(v) > 2],
    ['carreta', 'Todas as carretas', v => v.tipo === 'carreta'],
    ['dolly', 'Dollys', v => v.tipo === 'dolly'],
  ];
  const filtro = FILTROS.find(f => f[0] === filtroVeiculos) || FILTROS[0];
  const busca = buscaVeiculos.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const ordemTipo = { cavalo:0, carreta:1, dolly:2 };
  const ordenados = veiculos.filter(filtro[2]).filter(v => !busca || v.placa.replace(/[^A-Z0-9]/g, '').includes(busca))
    .sort((a, b) => (b.ativo - a.ativo) || ordemTipo[a.tipo] - ordemTipo[b.tipo] || (posicaoDo(a) || 9) - (posicaoDo(b) || 9) || a.placa.localeCompare(b.placa));

  el.innerHTML = `
    ${painel(`Conjuntos (${conjuntos.length})`,
      conjuntos.length ? tabela(['Motorista', 'Cavalo', '1ª carreta', 'Dolly', '2ª carreta', 'Documentos'],
        conjuntos.map(c => {
          const itens = itensOrdenados(c);
          const naPosicao = (ordem) => itens.find(i => i.ordem === ordem);
          const pior = piorStatus(itens.flatMap(i => docsDe(i.veiculo_id)));
          return `<tr class="clickable" data-conjunto="${c.id}"><td>${c.motorista ? esc(c.motorista.nome) : '<span class="sub">Sem motorista</span>'}</td>
            <td>${celulaPlaca(naPosicao(1))}</td><td>${celulaPlaca(naPosicao(2))}</td><td>${celulaPlaca(naPosicao(3))}</td><td>${celulaPlaca(naPosicao(4))}</td>
            <td>${pior ? badge(COR_STATUS_DOC[pior], ROTULO_STATUS_DOC[pior]) : '<span class="sub">Nenhum</span>'}</td></tr>`;
        }))
        : vazio('Nenhum conjunto montado ainda.'),
      `<button class="btn btn-primary btn-sm" id="btnNovoConjunto">${ic('plus', 15)} Montar conjunto</button>`)}
    <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center; margin-bottom:14px;">
      <div class="doc-tabs" style="margin:0; flex:1 1 520px;">
        ${FILTROS.map(([k, l, f]) => `<button class="${filtroVeiculos === k ? 'active' : ''}" data-filtro-veic="${k}">${l} (${veiculos.filter(f).length})</button>`).join('')}
      </div>
      <input type="search" id="buscaPlaca" placeholder="Buscar placa" value="${esc(buscaVeiculos)}" style="flex:0 1 200px; padding:9px 12px;">
    </div>
    ${painel(`${filtro[1] === 'Todos' ? 'Veículos' : filtro[1]} (${ordenados.length})`,
      ordenados.length ? tabela(['Placa', 'Posição', 'Modelo', 'Conjunto / motorista', 'Documentos'],
        ordenados.map(v => {
          const c = conjuntoDoVeiculo[v.id];
          const meus = docsDe(v.id);
          return `<tr class="clickable" data-veiculo="${v.id}" style="${v.ativo ? '' : 'opacity:.55;'}"><td class="mono">${esc(v.placa)}</td><td>${esc(rotuloPosicao(v))}${v.ativo ? '' : ' <span class="sub">(inativo)</span>'}</td><td class="sub">${esc([v.modelo, v.ano].filter(Boolean).join(' · ') || '—')}</td>
            <td>${c ? `${c.motorista ? esc(c.motorista.nome) : '<span class="sub">Sem motorista</span>'}<div class="sub mono">cavalo ${esc(cavaloDoConjunto(c))}</div>` : '<span class="sub">Fora de conjunto</span>'}</td>
            <td>${meus.length ? meus.map(d => `<div style="margin:2px 0;">${badgeDoc(d)} <span class="sub">${esc(d.tipo)}</span></div>`).join('') : '<span class="sub">Nenhum</span>'}</td></tr>`;
        })) : vazio('Nenhum veículo neste filtro.'),
      `<button class="btn btn-primary btn-sm" id="btnNovoVeiculo">${ic('plus', 15)} Cadastrar veículo</button>`)}`;

  el.querySelectorAll('[data-filtro-veic]').forEach(b => b.addEventListener('click', () => { filtroVeiculos = b.dataset.filtroVeic; secaoVeiculos(el); }));
  const campoBusca = document.getElementById('buscaPlaca');
  campoBusca.addEventListener('input', () => {
    clearTimeout(campoBusca._t);
    campoBusca._t = setTimeout(async () => { buscaVeiculos = campoBusca.value; await secaoVeiculos(el); const c = document.getElementById('buscaPlaca'); c.focus(); c.setSelectionRange(c.value.length, c.value.length); }, 250);
  });

  document.getElementById('btnNovoVeiculo').addEventListener('click', () => abrirEditarVeiculo(null, veiculos));
  el.querySelectorAll('[data-veiculo]').forEach(tr => tr.addEventListener('click', () => abrirEditarVeiculo(veiculos.find(v => v.id === tr.dataset.veiculo), veiculos, conjuntoDoVeiculo[tr.dataset.veiculo])));
  document.getElementById('btnNovoConjunto').addEventListener('click', () => abrirEditarConjunto(null, { veiculos, conjuntos, motoristas }));
  el.querySelectorAll('[data-conjunto]').forEach(tr => tr.addEventListener('click', () => abrirEditarConjunto(conjuntos.find(c => c.id === tr.dataset.conjunto), { veiculos, conjuntos, motoristas })));
}

function abrirEditarVeiculo(v, veiculos, conjunto){
  const novo = !v;
  abrirModal(novo ? 'Cadastrar veículo' : `Veículo ${v.placa}`, `
    <form id="formVeiculo">
      <div class="o-form-grid">
        ${campoTexto('evPlaca', 'Placa', v && v.placa, 'required placeholder="ex: GKH-1B12" style="text-transform:uppercase;"')}
        <div class="field-row" style="margin:0;"><label for="evTipo">Tipo</label>
          <select id="evTipo" ${conjunto ? 'disabled title="Tire o veículo do conjunto para mudar o tipo"' : ''}>${['cavalo', 'carreta', 'dolly'].map(t => `<option value="${t}" ${v && v.tipo === t ? 'selected' : ''}>${tipoLabelGlobal[t]}</option>`).join('')}</select></div>
        ${campoTexto('evModelo', 'Modelo', v && v.modelo, 'placeholder="ex: Scania R450"')}
        ${campoTexto('evAno', 'Ano', v && v.ano, 'inputmode="numeric" maxlength="4" placeholder="ex: 2021"')}
      </div>
      ${!novo ? `<label style="display:flex; gap:8px; align-items:center; font-size:13.5px; cursor:pointer;"><input type="checkbox" id="evAtivo" ${v.ativo ? 'checked' : ''} style="width:auto;" ${conjunto && v.ativo ? 'disabled' : ''}> Veículo ativo na frota${conjunto && v.ativo ? ' <span class="l2">(tire do conjunto antes de desativar)</span>' : ''}</label>` : ''}
      ${conjunto ? `<div class="l2">Faz parte do conjunto ${esc(itensOrdenados(conjunto).map(i => i.veiculo.placa).join(' → '))}${conjunto.motorista ? ' — ' + esc(conjunto.motorista.nome) : ''}.</div>` : ''}
      <div class="err" id="evErro"></div>
      <button type="submit">${novo ? 'Cadastrar veículo' : 'Salvar alterações'}</button>
    </form>`);

  document.getElementById('formVeiculo').addEventListener('submit', async (e) => {
    e.preventDefault();
    const erro = document.getElementById('evErro');
    const placa = normalizarPlaca(document.getElementById('evPlaca').value);
    if(!placa){ erro.textContent = 'Placa inválida. Use o formato AAA-9999 ou AAA-9A99.'; return; }
    if(veiculos.some(x => x.placa === placa && (!v || x.id !== v.id))){ erro.textContent = `Já existe um veículo com a placa ${placa}.`; return; }
    const anoTxt = document.getElementById('evAno').value.trim();
    const ano = anoTxt ? parseInt(anoTxt, 10) : null;
    if(anoTxt && (!ano || ano < 1970 || ano > new Date().getFullYear() + 1)){ erro.textContent = 'Ano inválido.'; return; }
    const dados = { placa, tipo: document.getElementById('evTipo').value, modelo: document.getElementById('evModelo').value.trim() || null, ano };
    if(!novo) dados.ativo = document.getElementById('evAtivo').checked;
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = 'Salvando...';
    const { error } = novo
      ? await sb.from('veiculo').insert({ ...dados, transportadora_id: usuarioAtual.transportadora_id })
      : await sb.from('veiculo').update(dados).eq('id', v.id);
    if(error){ erro.textContent = 'Não consegui salvar: ' + error.message; btn.disabled = false; btn.textContent = novo ? 'Cadastrar veículo' : 'Salvar alterações'; return; }
    fecharModal();
    mostrarToast(novo ? `✅ Veículo ${placa} cadastrado` : '✅ Veículo atualizado');
    loadEscritorio();
  });
}

function abrirEditarConjunto(c, { veiculos, conjuntos, motoristas }){
  const novo = !c;
  const itensAtuais = c ? itensOrdenados(c) : [];
  const ocupados = {};
  conjuntos.forEach(x => { if(!c || x.id !== c.id) (x.conjunto_item || []).forEach(i => { ocupados[i.veiculo_id] = x; }); });
  const selectPosicao = (pos) => {
    const atual = itensAtuais.find(i => i.ordem === pos.ordem);
    const opcoes = veiculos.filter(v => v.tipo === pos.tipo && v.ativo && !ocupados[v.id]);
    return `<div class="field-row" style="margin:0;"><label for="ecPos${pos.ordem}">${pos.rotulo}${pos.obrigatorio ? '' : ' (opcional)'}</label>
      <select id="ecPos${pos.ordem}" ${pos.obrigatorio ? 'required' : ''}><option value="">${pos.obrigatorio ? 'Selecione' : '— nenhum —'}</option>
        ${opcoes.map(v => `<option value="${v.id}" ${atual && atual.veiculo_id === v.id ? 'selected' : ''}>${esc(v.placa)}${v.modelo ? ' · ' + esc(v.modelo) : ''}</option>`).join('')}
      </select></div>`;
  };

  abrirModal(novo ? 'Montar conjunto' : 'Editar conjunto', `
    <form id="formConjunto">
      <div class="field-row" style="margin:0;"><label for="ecMotorista">Motorista</label>
        <select id="ecMotorista"><option value="">Sem motorista</option>
          ${motoristas.map(m => { const outro = conjuntos.find(x => x.motorista_id === m.id && (!c || x.id !== c.id)); return `<option value="${m.id}" ${c && c.motorista_id === m.id ? 'selected' : ''}>${esc(m.nome)}${outro ? ' (sai do conjunto ' + esc(cavaloDoConjunto(outro)) + ')' : ''}</option>`; }).join('')}
        </select></div>
      ${novo && !veiculos.some(v => v.tipo === 'cavalo' && v.ativo && !ocupados[v.id]) ? `
        <div class="o-banner" style="margin:0;">${ic('alert', 18)}<div class="txt"><b>Todos os cavalos já estão em algum conjunto</b>
          Para entregar um conjunto que já existe a um motorista, feche esta janela e clique no conjunto na lista (ou no motorista, em Motoristas).
          Para montar um conjunto novo, cadastre o cavalo antes em "Cadastrar veículo" ou desfaça um conjunto antigo.</div></div>` : ''}
      <div class="o-form-grid">${POSICOES_CONJUNTO.map(selectPosicao).join('')}</div>
      <div class="l2">Só aparecem veículos ativos que não estão em outro conjunto. Para cadastrar um veículo novo, feche esta janela e use "Cadastrar veículo".</div>
      <div class="err" id="ecErro"></div>
      <button type="submit">${novo ? 'Montar conjunto' : 'Salvar conjunto'}</button>
      ${!novo ? `<button type="button" class="btn btn-outline btn-sm" id="btnDesfazerConjunto" style="color:var(--signal-red-ink); align-self:flex-start;">Desfazer conjunto</button>` : ''}
    </form>`);

  document.getElementById('formConjunto').addEventListener('submit', async (e) => {
    e.preventDefault();
    const erro = document.getElementById('ecErro');
    const escolhidos = POSICOES_CONJUNTO.map(p => ({ ordem: p.ordem, veiculo_id: document.getElementById('ecPos' + p.ordem).value })).filter(x => x.veiculo_id);
    if(!escolhidos.some(x => x.ordem === 1)){ erro.textContent = 'Escolha o cavalo mecânico.'; return; }
    if(new Set(escolhidos.map(x => x.veiculo_id)).size !== escolhidos.length){ erro.textContent = 'O mesmo veículo foi escolhido duas vezes.'; return; }
    const motoristaId = document.getElementById('ecMotorista').value || null;
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = 'Salvando...';

    // o motorista só pode estar em um conjunto por vez
    if(motoristaId){
      const outros = conjuntos.filter(x => x.motorista_id === motoristaId && (!c || x.id !== c.id));
      for(const o of outros){ await sb.from('conjunto').update({ motorista_id: null }).eq('id', o.id); }
    }
    let conjuntoId = c && c.id;
    if(novo){
      const { data, error } = await sb.from('conjunto').insert({ transportadora_id: usuarioAtual.transportadora_id, motorista_id: motoristaId, ativo: true }).select('id').single();
      if(error){ erro.textContent = 'Não consegui criar o conjunto: ' + error.message; btn.disabled = false; btn.textContent = 'Montar conjunto'; return; }
      conjuntoId = data.id;
    } else {
      const { error } = await sb.from('conjunto').update({ motorista_id: motoristaId }).eq('id', conjuntoId);
      if(error){ erro.textContent = 'Não consegui salvar: ' + error.message; btn.disabled = false; btn.textContent = 'Salvar conjunto'; return; }
    }
    const { error: eDel } = await sb.from('conjunto_item').delete().eq('conjunto_id', conjuntoId);
    const { error: eIns } = eDel ? { error: eDel } : await sb.from('conjunto_item').insert(escolhidos.map(x => ({ ...x, conjunto_id: conjuntoId })));
    if(eIns){ erro.textContent = 'Não consegui gravar as placas do conjunto: ' + eIns.message; btn.disabled = false; btn.textContent = 'Tentar de novo'; return; }
    fecharModal();
    mostrarToast(novo ? '✅ Conjunto montado' : '✅ Conjunto atualizado');
    loadEscritorio();
  });

  const desfazer = document.getElementById('btnDesfazerConjunto');
  if(desfazer) desfazer.addEventListener('click', async () => {
    if(!confirm('Desfazer este conjunto? Os veículos ficam livres para montar outro conjunto e o motorista fica sem conjunto. Checklists antigos continuam guardados.')) return;
    desfazer.disabled = true;
    const { error: e1 } = await sb.from('conjunto_item').delete().eq('conjunto_id', c.id);
    const { error: e2 } = e1 ? { error: e1 } : await sb.from('conjunto').update({ ativo: false, motorista_id: null }).eq('id', c.id);
    if(e2){ alert('Não consegui desfazer: ' + e2.message); desfazer.disabled = false; return; }
    fecharModal();
    mostrarToast('✅ Conjunto desfeito');
    loadEscritorio();
  });
}

// ---------------------------------------------------------------------
// USUÁRIOS
// ---------------------------------------------------------------------
async function secaoUsuarios(el){
  const usuarios = await qUsuarios();
  const ordem = { admin_transportadora:0, gestor:1, mecanico:2, motorista:3, admin_mover_ia:4 };
  const lista = [...usuarios].sort((a, b) => (b.ativo - a.ativo) || (ordem[a.papel] ?? 9) - (ordem[b.papel] ?? 9) || a.nome.localeCompare(b.nome));
  el.innerHTML = `
    <div class="o-banner">${ic('users', 18)}<div class="txt"><b>Quem cadastra quem</b>Motoristas são cadastrados automaticamente ao enviar a CNH em Documentos. Mecânicos e pessoas do escritório, pelos botões ao lado. Clique em alguém para editar, gerar nova senha ou desativar.</div></div>
    ${painel(`Usuários (${usuarios.filter(u => u.ativo).length} ativos)`,
      tabela(['Nome', 'Login / e-mail', 'Papel', 'Situação'],
        lista.map(u => `<tr class="clickable" data-usuario="${u.id}" style="${u.ativo ? '' : 'opacity:.55;'}"><td>${nomeCelula(u.nome)}</td><td class="mono">${esc(loginDoEmail(u.email))}</td><td>${esc(papelLabel[u.papel] || u.papel)}</td><td>${!u.ativo ? badge('grey', 'Desativado') : u.senha_temporaria ? badge('amber', 'Aguardando 1º acesso') : badge('green', 'Ativo')}</td></tr>`)),
      `${['admin_transportadora', 'admin_mover_ia'].includes(usuarioAtual.papel) ? `<button class="btn btn-outline btn-sm" id="btnNovoEscritorio">${ic('users', 15)} Cadastrar usuário do escritório</button>` : ''}
       <button class="btn btn-primary btn-sm" id="btnNovoMecanico">${ic('wrench', 15)} Cadastrar mecânico</button>`)}`;
  document.getElementById('btnNovoMecanico').addEventListener('click', abrirCadastroMecanico);
  const bEsc = document.getElementById('btnNovoEscritorio');
  if(bEsc) bEsc.addEventListener('click', () => abrirCadastroEscritorio(usuarios));
  el.querySelectorAll('[data-usuario]').forEach(tr => tr.addEventListener('click', () => abrirEditarUsuario(usuarios.find(u => u.id === tr.dataset.usuario))));
}

// ---------------------------------------------------------------------
// CONFIGURAÇÕES (dados da empresa)
// ---------------------------------------------------------------------
async function secaoConfig(el){
  const [[empresa], usuarios] = await Promise.all([
    consultar(sb.from('transportadora').select('*').eq('id', usuarioAtual.transportadora_id)),
    qUsuarios(),
  ]);
  if(!empresa){ el.innerHTML = vazio('Não encontrei os dados da transportadora.'); return; }
  const plano = PLANOS[empresa.plano] || PLANOS.Essencial;
  const nMot = usuarios.filter(u => u.papel === 'motorista' && u.ativo).length;
  const nEsc = usuarios.filter(u => u.papel !== 'motorista' && u.papel !== 'admin_mover_ia' && u.ativo).length;
  el.innerHTML = `
    <div class="two-col">
      ${painel('Dados da empresa', `<div class="o-panel-body">
        <form id="formEmpresa">
          ${campoTexto('cfRazao', 'Razão social', empresa.razao_social, 'required')}
          ${campoTexto('cfFantasia', 'Nome fantasia', empresa.nome_fantasia, 'required')}
          <div class="o-form-grid">
            ${campoTexto('cfCnpj', 'CNPJ', empresa.cnpj, 'disabled title="Para mudar o CNPJ, fale com a MOVER.IA"')}
            ${campoTexto('cfRntrc', 'RNTRC / ANTT', empresa.rntrc)}
            ${campoTexto('cfIbama', 'Registro IBAMA', empresa.ibama_registro)}
          </div>
          ${campoTexto('cfEndereco', 'Endereço', empresa.endereco)}
          <div class="o-form-grid">
            ${campoTexto('cfTelefone', 'Telefone', empresa.telefone, 'inputmode="tel"')}
            ${campoTexto('cfEmail', 'E-mail de contato', empresa.email, 'inputmode="email"')}
          </div>
          <div class="err" id="cfErro"></div>
          <button type="submit" style="align-self:flex-start; padding:11px 22px;">Salvar alterações</button>
        </form>
      </div>`)}
      ${painel('Plano contratado', `<div class="o-panel-body">
        <div class="kpi-row" style="grid-template-columns:1fr; margin-bottom:12px;">${kpi(esc(empresa.plano), 'Plano atual', plano.mensalidade)}</div>
        <div class="kpi-row" style="grid-template-columns:1fr 1fr; margin-bottom:0;">
          ${kpi(`${nMot}/${plano.motoristas}`, 'Motoristas na franquia', nMot > plano.motoristas ? `${nMot - plano.motoristas} adiciona${nMot - plano.motoristas > 1 ? 'is' : 'l'}` : '', nMot > plano.motoristas ? 'ambar' : '')}
          ${kpi(`${nEsc}/${plano.escritorio}`, 'Usuários de escritório')}
        </div>
        <div class="l2" style="margin-top:12px;">Para mudar de plano, fale com a MOVER.IA.</div>
      </div>`)}
    </div>`;

  document.getElementById('formEmpresa').addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = (id) => document.getElementById(id).value.trim() || null;
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = 'Salvando...';
    const dados = { razao_social: v('cfRazao'), nome_fantasia: v('cfFantasia'), rntrc: v('cfRntrc'), ibama_registro: v('cfIbama'), endereco: v('cfEndereco'), telefone: v('cfTelefone'), email: v('cfEmail') };
    const { error } = await sb.from('transportadora').update(dados).eq('id', empresa.id);
    if(error){ document.getElementById('cfErro').textContent = 'Não consegui salvar: ' + error.message; btn.disabled = false; btn.textContent = 'Salvar alterações'; return; }
    if(usuarioAtual.transportadora) usuarioAtual.transportadora.nome_fantasia = dados.nome_fantasia;
    mostrarToast('✅ Dados da empresa atualizados');
    loadEscritorio();
  });
}

// ---------------------------------------------------------------------
// DOCUMENTOS — editar ou excluir um documento já cadastrado
// ---------------------------------------------------------------------
function abrirEditarDocumento(d, nomeReferente){
  abrirModal(`${d.tipo} — ${nomeReferente}`, `
    <form id="formDocumento">
      <div class="o-form-grid">
        ${campoTexto('edTipo', 'Tipo', d.tipo, 'required')}
        ${campoTexto('edNumero', 'Número', d.numero)}
        <div class="field-row" style="margin:0;"><label for="edValidade">Validade</label><input type="date" id="edValidade" value="${esc(d.validade || '')}"></div>
        <div class="field-row" style="margin:0;"><label for="edStatus">Situação (só vale sem validade)</label>
          <select id="edStatus">${['ok', 'vence_em_breve', 'vencido'].map(s => `<option value="${s}" ${d.status === s ? 'selected' : ''}>${statusLabel[s]}</option>`).join('')}</select></div>
      </div>
      <div class="err" id="edErro"></div>
      <button type="submit">Salvar alterações</button>
      <button type="button" class="btn btn-outline btn-sm" id="btnExcluirDoc" style="color:var(--signal-red-ink); align-self:flex-start;">Excluir documento</button>
    </form>`);

  document.getElementById('formDocumento').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = 'Salvando...';
    const { error } = await sb.from('documento').update({
      tipo: document.getElementById('edTipo').value.trim(),
      numero: document.getElementById('edNumero').value.trim() || null,
      validade: document.getElementById('edValidade').value || null,
      status: document.getElementById('edStatus').value,
    }).eq('id', d.id);
    if(error){ document.getElementById('edErro').textContent = 'Não consegui salvar: ' + error.message; btn.disabled = false; btn.textContent = 'Salvar alterações'; return; }
    fecharModal();
    mostrarToast('✅ Documento atualizado');
    loadDocumentos();
  });

  document.getElementById('btnExcluirDoc').addEventListener('click', async () => {
    if(!confirm(`Excluir "${d.tipo}" de ${nomeReferente}${d.arquivo_url ? ' e o arquivo anexado' : ''}? Não dá para desfazer.`)) return;
    const { error } = await sb.from('documento').delete().eq('id', d.id);
    if(error){ alert('Não consegui excluir: ' + error.message); return; }
    if(d.arquivo_url) await sb.storage.from('documentos').remove([d.arquivo_url]);
    fecharModal();
    mostrarToast('✅ Documento excluído');
    loadDocumentos();
  });
}

// Cadastro de usuário do escritório (papel "Escritório"/gestor) — só o administrador.
// O login é o e-mail da pessoa; a senha temporária aparece na tela e ela troca no 1º acesso.
function abrirCadastroEscritorio(usuarios){
  const plano = PLANOS[(usuarioAtual.transportadora && usuarioAtual.transportadora.plano) || 'Essencial'] || PLANOS.Essencial;
  const emUso = usuarios.filter(u => u.ativo && u.papel !== 'motorista' && u.papel !== 'admin_mover_ia').length;
  abrirModal('Cadastrar usuário do escritório', `
    <form id="formNovoEscritorio">
      <div class="l2">A pessoa entra no painel com o <b>e-mail</b> e a senha temporária que vai aparecer na tela, e troca a senha no primeiro acesso. Ela vê e edita tudo da transportadora, menos cadastrar outros usuários do escritório.</div>
      ${emUso >= plano.escritorio ? `<div class="o-banner" style="margin:0;">${ic('alert', 18)}<div class="txt"><b>Franquia do plano atingida</b>Seu plano inclui ${plano.escritorio} usuários de escritório (${emUso} em uso, contando mecânicos). Um usuário a mais entra como adicional na mensalidade.</div></div>` : ''}
      ${campoTexto('neNome', 'Nome completo', '', 'required minlength="5" placeholder="ex: Ana Paula Souza"')}
      ${campoTexto('neEmail', 'E-mail (será o login)', '', 'required inputmode="email" autocapitalize="none" placeholder="ex: ana@chaveslog.com.br"')}
      <div class="err" id="neErro"></div>
      <button type="submit">Cadastrar</button>
    </form>`);
  document.getElementById('formNovoEscritorio').addEventListener('submit', async (e) => {
    e.preventDefault();
    const erro = document.getElementById('neErro');
    const nome = document.getElementById('neNome').value.trim().replace(/\s+/g, ' ');
    const email = document.getElementById('neEmail').value.trim().toLowerCase();
    if(nome.split(' ').length < 2){ erro.textContent = 'Digite nome e sobrenome.'; return; }
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){ erro.textContent = 'E-mail inválido.'; return; }
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = 'Cadastrando...';
    const r = await chamarFuncaoServidor('gerenciar-usuario', { acao: 'criar_escritorio', nome, email });
    if(r.error){ erro.textContent = r.error; btn.disabled = false; btn.textContent = 'Cadastrar'; return; }
    fecharModal();
    await mostrarCredenciaisNovoMotorista(r.dados, 'Usuário do escritório cadastrado',
      `Anote e repasse para ${nome.split(' ')[0]}. O acesso é pelo mesmo endereço do app, com o e-mail e esta senha temporária; no primeiro acesso, o app pede para criar uma senha nova.`);
    loadEscritorio();
  });
}