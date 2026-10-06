// Supabase FALSO para testar as telas localmente, sem login e sem tocar no banco real.
// Uso: teste.html?papel=admin_transportadora | motorista
(function(){
  const agora = Date.now();
  const iso = (minAtras) => new Date(agora - minAtras * 60000).toISOString();
  const dia = (d) => { const x = new Date(agora + d * 86400000); return x.toISOString().slice(0, 10); };
  const T = 't1';
  const emp = { nome_fantasia:'ChavesLog Transportes', plano:'Essencial' };
  const U = {
    adm: { id:'u-adm', nome:'Admin Teste', papel:'admin_transportadora', email:'admin@exemplo.com', ativo:true, senha_temporaria:false, transportadora_id:T, transportadora:emp },
    car: { id:'u-car', nome:'Carlos Teste da Silva', papel:'motorista', email:'carlos.teste@motoristas.moveria.app', ativo:true, senha_temporaria:false, transportadora_id:T, transportadora:emp },
    mec: { id:'u-mec', nome:'João Mecânico Teste', papel:'mecanico', email:'joao.silva@motoristas.moveria.app', ativo:true, senha_temporaria:false, transportadora_id:T, transportadora:emp },
    mir: { id:'u-mir', nome:'Maria Teste Souza', papel:'motorista', email:'maria.souza@motoristas.moveria.app', ativo:true, senha_temporaria:false, transportadora_id:T, transportadora:emp },
  };
  const V = [
    { id:'v1', placa:'GKH-1B12', tipo:'cavalo', modelo:'Scania R450', ano:2021, ativo:true, grupo:'Chaves' },
    { id:'v2', placa:'FIJ-7F46', tipo:'carreta', modelo:'Randon', ativo:true },
    { id:'v3', placa:'FQQ-1I56', tipo:'dolly', modelo:'Randon', ativo:true },
    { id:'v4', placa:'GJO-5C04', tipo:'carreta', modelo:'Randon', ativo:true },
    { id:'v5', placa:'GBW-8C41', tipo:'cavalo', modelo:'Volvo FH 540', ativo:true, grupo:'RAC' },
    { id:'v6', placa:'ABC-1D23', tipo:'carreta', modelo:'Librelato', ativo:true },
    { id:'v7', placa:'XYZ-9876', tipo:'cavalo', modelo:'Mercedes Actros', ativo:true },
  ];
  const vv = (id) => { const v = V.find(x => x.id === id); return { placa:v.placa, tipo:v.tipo, modelo:v.modelo, grupo:v.grupo || null }; };
  const conjunto = [
    { id:'c1', ativo:true, motorista_id:'u-car', motorista:{ nome:U.car.nome }, conjunto_item:[1,2,3,4].map(n => ({ ordem:n, veiculo_id:'v'+n, veiculo:vv('v'+n) })) },
    { id:'c2', ativo:true, motorista_id:null, motorista:null, conjunto_item:[{ ordem:1, veiculo_id:'v5', veiculo:vv('v5') }] },
  ];
  // 13 meses de abastecimentos fictícios (relatório de consumo), com 3 casos fora do padrão
  function historicoAbastecimentos(){
    let semente = 7; const aleat = () => (semente = (semente * 9301 + 49297) % 233280) / 233280;
    const frota = [ ['v1', 'GKH-1B12', 2.35, U.car], ['v5', 'GBW-8C41', 2.05, U.mir], ['v7', 'XYZ-9876', 2.6, U.car] ];
    const lista = [];
    frota.forEach(([vid, placa, base, mot], k) => {
      let km = 180000 + k * 40000;
      for(let d = 395; d > 2; d -= 6 + Math.round(aleat() * 4)){
        const litros = Math.round(260 + aleat() * 160);
        let media = base * (0.92 + aleat() * 0.16) * (1 + 0.04 * Math.sin(d / 60));
        if(vid === 'v1' && d < 40 && d > 32) media = base * 0.62;     // muito abaixo (vazamento?)
        if(vid === 'v5' && d < 30 && d > 15) media = base * 1.45;     // muito acima (faltou registrar um?)
        if(vid === 'v7' && d < 16 && d > 3) media = 12.4;             // km digitado errado
        km += Math.round(media * litros);
        const externo = aleat() > 0.5;
        lista.push({ id:`h-${vid}-${d}`, data:iso(d * 1440 + 300), tipo: externo ? 'externo' : 'interno', km, litros, arla_litros: Math.round(litros * 0.05),
          preco_litro_diesel: externo ? 6.05 + Math.round(aleat() * 40) / 100 : null, preco_litro_arla: null, odometro_bomba:null, posto: externo ? 'Posto Estrada' : null, nota_numero: externo ? String(1000 + d) : null,
          media_calculada: Math.round(media * 100) / 100, media_arla_calculada: null, motorista_id: mot.id, veiculo_id: vid, motorista:{ nome: mot.nome }, veiculo:{ placa, tipo:'cavalo' }, confirmado:null });
      }
    });
    return lista;
  }
  const eventosAtiva = [{ tipo:'inicio', criado_em:iso(260) }, { tipo:'pausa', motivo:'Pausa para alimentação', criado_em:iso(150) }, { tipo:'retomada', criado_em:iso(110) }];
  const F = {
    usuario: Object.values(U),
    transportadora: [{ id:T, razao_social:'Chaves & Ardito Ltda', nome_fantasia:'ChavesLog Transportes', cnpj:'02.499.966/0001-40', rntrc:'000808225', ibama_registro:'999183', plano:'Essencial', endereco:null, telefone:null, email:null }],
    veiculo: V,
    conjunto,
    documento: [
      { id:'d1', referente_a:'empresa', referente_id:T, tipo:'ANTT / RNTRC', validade:null, status:'ok' },
      { id:'d2', referente_a:'empresa', referente_id:T, tipo:'AET — Autorização Especial de Trânsito', validade:null, status:'vence_em_breve' },
      { id:'d3', referente_a:'empresa', referente_id:T, tipo:'Autorização Ambiental (IBAMA)', validade:dia(70), status:'ok', arquivo_url:'x.pdf' },
      { id:'d4', referente_a:'veiculo', referente_id:'v1', tipo:'CRLV', validade:dia(12), status:'ok', arquivo_url:'y.pdf' },
      { id:'d5', referente_a:'motorista', referente_id:'u-car', tipo:'CNH', numero:'01234567890', validade:dia(3500), status:'ok', arquivo_url:'z.pdf' },
      { id:'d6', referente_a:'motorista', referente_id:'u-car', tipo:'Exame toxicológico', validade:dia(-4), status:'ok' },
      { id:'d7', referente_a:'motorista', referente_id:'u-mir', tipo:'CNH', validade:dia(1800), status:'ok', arquivo_url:'w.pdf' },
    ],
    jornada: [
      { id:'j1', inicio:iso(260), fim:null, status:'ativa', motorista_id:'u-car', motorista:{ nome:U.car.nome }, jornada_evento:eventosAtiva },
      { id:'j2', inicio:iso(1700), fim:iso(1200), status:'encerrada', motorista_id:'u-car', motorista:{ nome:U.car.nome }, jornada_evento:[{ tipo:'inicio', criado_em:iso(1700) }, { tipo:'pausa', motivo:'Em carregamento', criado_em:iso(1500) }, { tipo:'retomada', criado_em:iso(1440) }, { tipo:'fim', criado_em:iso(1200) }] },
    ],
    jornada_evento: eventosAtiva.map(e => ({ ...e, jornada_id:'j1' })),
    checklist_item_padrao: [...Array(22)].map((_, i) => ({ id:'i' + (i + 1), ordem:i + 1, descricao:['Pneus','Freios','Luzes','Documentação do veículo','Extintor'][i % 5] + ' ' + (i + 1), padrao_esperado:'Em boas condições', ativo:true })),
    checklist: [
      { id:'k1', criado_em:iso(300), motorista_id:'u-car', respostas:[...Array(22)].map((_, i) => ({ item_id:'i' + (i + 1), resposta: i === 2 ? 'bad' : 'ok' })), motorista:{ nome:U.car.nome }, conjunto:{ id:'c1', conjunto_item:conjunto[0].conjunto_item } },
      { id:'k2', criado_em:iso(3000), motorista_id:'u-car', respostas:[...Array(22)].map((_, i) => ({ item_id:'i' + (i + 1), resposta:'ok' })), motorista:{ nome:U.car.nome }, conjunto:{ id:'c1', conjunto_item:conjunto[0].conjunto_item } },
    ],
    viagem: [{ id:'vg1', origem:'Paulínia/SP', destino:'Curitiba/PR', cte_numero:'4512', mdfe_numero:null, status:'em_andamento', criado_em:iso(500), motorista_id:'u-car', motorista:{ nome:U.car.nome } }],
    abastecimento: [
      { id:'a1', data:iso(600), tipo:'interno', km:214900, litros:178, arla_litros:12, odometro_bomba:88998.3, media_calculada:3.21, motorista_id:'u-car', veiculo_id:'v1', motorista:{ nome:U.car.nome }, veiculo:{ placa:'GKH-1B12' }, confirmado:{ nome:'Admin Teste' } },
      { id:'a3', data:iso(3000), tipo:'externo', km:214600, litros:95, arla_litros:null, odometro_bomba:null, posto:'Posto 56, Jundiaí', nota_numero:'000123', media_calculada:2.9, motorista_id:'u-car', veiculo_id:'v1', motorista:{ nome:U.car.nome }, veiculo:{ placa:'GKH-1B12' }, confirmado:null },
      { id:'a2', data:iso(5000), tipo:null, km:214330, litros:190, odometro_bomba:null, media_calculada:null, motorista_id:'u-car', veiculo_id:'v1', motorista:{ nome:U.car.nome }, veiculo:{ placa:'GKH-1B12' }, confirmado:null },
      ...historicoAbastecimentos(),
    ],
    chamado_manutencao: [
      { id:'ch1', criado_em:iso(90), atualizado_em:iso(90), concluido_em:null, categoria:'Freios', urgencia:'alta', descricao:'Pedal de freio baixo', status:'aberto', observacao_reparo:null, foto_url:'t1/ch1/problema.jpg', foto_reparo_url:null, motorista_id:'u-car', veiculo_id:'v1', motorista:{ nome:U.car.nome }, veiculo:{ placa:'GKH-1B12', modelo:'Scania R450' }, responsavel:null,
        midias:[{ id:'m1', momento:'problema', tipo:'foto', caminho:'t1/ch1/p2.jpg', criado_em:iso(89) }, { id:'m2', momento:'problema', tipo:'video', caminho:'t1/ch1/p3.mp4', criado_em:iso(88) }] },
      { id:'ch2', criado_em:iso(2000), atualizado_em:iso(600), concluido_em:null, categoria:'Elétrica', urgencia:'media', descricao:'Luz de ré queimada', status:'em_andamento', observacao_reparo:'Lâmpada pedida', foto_url:null, foto_reparo_url:null, motorista_id:'u-car', veiculo_id:'v2', motorista:{ nome:U.car.nome }, veiculo:{ placa:'FIJ-7F46', modelo:'Randon' }, responsavel:{ nome:'João Mecânico Teste' } },
      { id:'ch3', criado_em:iso(9000), atualizado_em:iso(8000), concluido_em:iso(8000), categoria:'Pneus', urgencia:'baixa', descricao:'Calibragem', status:'concluido', observacao_reparo:'Calibrado', foto_url:null, foto_reparo_url:'t1/ch3/reparo.jpg', motorista_id:null, veiculo_id:'v5', motorista:null, veiculo:{ placa:'GBW-8C41', modelo:'Volvo' }, responsavel:{ nome:'João Mecânico Teste' } },
    ],
    capacitacao: [
      { id:'cp1', tipo:'MOPP — Movimentação de Produtos Perigosos', instituicao:'SEST SENAT', carga_horaria:50, data_realizacao:dia(-1800), validade:dia(20), certificado_url:'t1/capacitacao/cp1.pdf', motorista_id:'u-car', motorista:{ nome:U.car.nome } },
      { id:'cp2', tipo:'Direção defensiva', instituicao:null, carga_horaria:null, data_realizacao:dia(-100), validade:dia(900), certificado_url:null, motorista_id:'u-car', motorista:{ nome:U.car.nome } },
    ],
    notificacao: [
      { id:'n1', tipo:'agenda', titulo:'Novo agendamento', mensagem:'Revisão preventiva — 03/10 às 08:00 · GKH-1B12', destino:'agendamentos', lida_em:null, criado_em:iso(30) },
      { id:'n2', tipo:'oficina', titulo:'Seu chamado está em reparo', mensagem:'FIJ-7F46 · Elétrica — Lâmpada pedida', destino:'oficina', lida_em:iso(100), criado_em:iso(600) },
    ], agendamento: [
      { id:'ag1', tipo:'Revisão preventiva', data_prevista:dia(3), hora:'08:00:00', local:'Oficina Central', status:'pendente', observacao:null, ciente_em:null, concluido_em:null, motorista_id:null, veiculo_id:'v1', motorista:null, veiculo:{ placa:'GKH-1B12' } },
      { id:'ag2', tipo:'Exame toxicológico', data_prevista:dia(-2), hora:null, local:'Clínica LabSaúde', status:'pendente', observacao:'Levar documento', ciente_em:iso(3000), concluido_em:null, motorista_id:'u-car', veiculo_id:null, motorista:{ nome:U.car.nome }, veiculo:null },
      { id:'ag3', tipo:'Troca de óleo', data_prevista:dia(-20), hora:null, local:null, status:'concluido', observacao:null, ciente_em:null, concluido_em:iso(20000), motorista_id:null, veiculo_id:'v5', motorista:null, veiculo:{ placa:'GBW-8C41' } },
      { id:'ag4', tipo:'Folga', data_prevista:dia(5), data_fim:dia(8), hora:null, local:null, status:'pendente', observacao:'Retorna na segunda', ciente_em:null, concluido_em:null, motorista_id:'u-car', veiculo_id:null, motorista:{ nome:U.car.nome }, veiculo:null },
    ], calendario_licenciamento: [], motorista_perfil: [],
  };

  const papel = new URLSearchParams(location.search).get('papel') || 'admin_transportadora';
  const eu = papel === 'motorista' ? U.car : papel === 'mecanico' ? U.mec : U.adm;
  window.__chamadas = [];

  function consulta(tabela){
    let linhas = JSON.parse(JSON.stringify(F[tabela] || []));
    const q = {
      select(){ return q; },
      eq(c, v){ linhas = linhas.filter(r => r[c] === v); return q; },
      neq(c, v){ linhas = linhas.filter(r => r[c] !== v); return q; },
      in(c, vs){ linhas = linhas.filter(r => vs.includes(r[c])); return q; },
      gte(c, v){ linhas = linhas.filter(r => r[c] >= v); return q; },
      gt(c, v){ linhas = linhas.filter(r => r[c] != null && r[c] > v); return q; },
      lte(c, v){ linhas = linhas.filter(r => r[c] <= v); return q; },
      is(c, v){ linhas = linhas.filter(r => (r[c] ?? null) === v); return q; },
      ilike(c, v){ const re = new RegExp('^' + String(v).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*') + '$', 'i'); linhas = linhas.filter(r => re.test(String(r[c] ?? ''))); return q; },
      not(c, op, v){ if(op === 'is' && v === null) linhas = linhas.filter(r => r[c] != null); return q; },
      order(){ return q; },
      limit(n){ linhas = linhas.slice(0, n); return q; },
      single(){ return Promise.resolve({ data: linhas[0] || null, error: linhas[0] ? null : { message:'não encontrado' } }); },
      maybeSingle(){ return Promise.resolve({ data: linhas[0] || null, error: null }); },
      then(ok, erro){ return Promise.resolve({ data: linhas, error: null, count: linhas.length }).then(ok, erro); },
    };
    return q;
  }
  const gravacao = (tabela, tipo) => (dados) => {
    window.__chamadas.push({ tabela, tipo, dados });
    if(window.limparCacheTelas) window.limparCacheTelas();   // igual ao app real: gravou, descarta as telas guardadas
    const r = { data: { id:'novo' }, error: null };
    const p = { select(){ return p; }, single(){ return Promise.resolve(r); }, eq(){ return p; }, then(ok, e){ return Promise.resolve(r).then(ok, e); } };
    return p;
  };
  const cliente = {
    auth: {
      getSession: async () => ({ data: { session: { user: { id: eu.id, email: eu.email }, access_token:'falso' } } }),
      signOut: async () => ({}), signInWithPassword: async () => ({ error:{ message:'teste' } }), updateUser: async () => ({}),
    },
    from: (t) => Object.assign(consulta(t), { insert: gravacao(t, 'insert'), update: gravacao(t, 'update'), upsert: gravacao(t, 'upsert'), delete: () => gravacao(t, 'delete')('(filtro)') }),
    rpc: async () => ({ error: null }),
    storage: { from: (b) => ({ remove: async (l) => { window.__chamadas.push({ tabela:'storage:' + b, tipo:'remove', dados:l }); return { error:null }; }, upload: async (caminho) => { window.__chamadas.push({ tabela:'storage:' + b, tipo:'upload', dados:caminho }); return { error:null }; }, createSignedUrl: async () => ({ data:{ signedUrl:'/app/img/logo.png' }, error:null }), createSignedUrls: async (l) => ({ data: l.map(c => ({ path:c, signedUrl: /\.mp4$/.test(c) ? '/app/teste-video.mp4' : '/app/img/logo.png' })), error:null }) }) },
  };
  window.supabase = { createClient: () => cliente };
  // Funções de servidor: responde localmente, nunca chama o Supabase real
  const fetchOriginal = window.fetch.bind(window);
  window.fetch = async (url, opcoes) => {
    if(String(url).includes('/functions/v1/')){
      const corpo = JSON.parse((opcoes && opcoes.body) || '{}');
      window.__chamadas.push({ tabela:'funcao:' + String(url).split('/functions/v1/')[1], tipo:'post', dados:corpo });
      if(String(url).includes('registrar-abastecimento-interno')){
        const ok = corpo.senha === 'certa';
        return new Response(JSON.stringify(ok ? { ok:true, media:3.12, confirmado_por:'Admin' } : { error:'Senha do escritório incorreta.' }), { status: ok ? 200 : 401, headers:{ 'Content-Type':'application/json' } });
      }
      const resposta = corpo.acao === 'resetar_senha' ? { login:'carlos.teste', senhaTemporaria:'Teste12345' } : corpo.papel === 'mecanico' ? { login:'novo.mecanico', senhaTemporaria:'Teste12345', usuarioId:'u-novo' } : { ok:true };
      return new Response(JSON.stringify(resposta), { status:200, headers:{ 'Content-Type':'application/json' } });
    }
    return fetchOriginal(url, opcoes);
  };
})();
