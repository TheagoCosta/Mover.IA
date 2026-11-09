// MOVER.IA — leitura gratuita do ticket da parada (decisão do Thiago, 09/11)
// O leitor de texto (Tesseract) roda no navegador do escritório: a foto não sai do app e não há
// custo. Ele acha os horários escritos no ticket, mas não sabe qual é a entrada e qual é a saída,
// então a conferência procura um horário que bata com o início e outro com o fim da parada
// (tolerância de 10 min). O que não bater ou não der para ler fica para o escritório revisar,
// e o escritório pode digitar os horários do ticket.
// Leitura paga pelo Claude (mais precisa) fica para quando o app estiver com os motoristas:
// ver supabase/functions/ler-ticket.

const TOLERANCIA_TICKET_MIN = 10;

// Horários no texto lido: 10:06, 10:06:33, 10h06. Ponto fica de fora porque confunde com peso (12.50).
function horariosDoTexto(texto){
  const achados = String(texto || '').match(/\b([01]?\d|2[0-3])\s?[:hH]\s?[0-5]\d(?::[0-5]\d)?\b/g) || [];
  const lista = achados.map(h => { const [hh, mm] = h.replace(/\s/g, '').split(/[:hH]/); return `${hh.padStart(2, '0')}:${mm}`; });
  return [...new Set(lista)];
}

// Diferença em minutos entre um "HH:MM" e um horário, sem importar a virada da meia-noite
function difHoraMin(hhmm, data){
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(data);
  const dif = Math.abs(h * 60 + m - (d.getHours() * 60 + d.getMinutes()));
  return Math.min(dif, 1440 - dif);
}

// lido = { horarios: [...] } da leitura gratuita, ou { entrada, saida } digitados pelo escritório.
// inicios: início da parada e, em Carregamento/Descarga, a chegada no local logo antes (o ticket
// costuma marcar a entrada na chegada).
function conferirHorariosTicket(lido, inicios, fim){
  const maisPerto = (lista, alvos) => {
    let melhor = null;
    lista.forEach(h => alvos.forEach(a => { const dif = difHoraMin(h, a); if(!melhor || dif < melhor.dif) melhor = { hora: h, dif }; }));
    return melhor;
  };
  const candidatosEntrada = lido.horarios || (lido.entrada ? [lido.entrada] : []);
  const candidatosSaida = lido.horarios || (lido.saida ? [lido.saida] : []);
  const entrada = inicios.length ? maisPerto(candidatosEntrada, inicios) : null;
  const saida = fim ? maisPerto(candidatosSaida, [fim]) : null;
  const dados = { entrada: entrada && entrada.hora, saida: saida && saida.hora,
    dif_entrada_min: entrada ? entrada.dif : null, dif_saida_min: saida ? saida.dif : null };
  if(!entrada && !saida) return { status: 'ilegivel', dados };
  // Leitura automática com um horário só: vale se bater com o início (ticket só com a entrada)
  const soUm = lido.horarios && lido.horarios.length === 1;
  const okEntrada = entrada && entrada.dif <= TOLERANCIA_TICKET_MIN;
  const okSaida = saida && saida.dif <= TOLERANCIA_TICKET_MIN;
  const ok = lido.horarios ? okEntrada && (okSaida || soUm) : (!entrada || okEntrada) && (!saida || okSaida);
  return { status: ok ? 'ok' : 'divergente', dados };
}

// Parada que o evento de ticket encerra. eventos ordenados por horário.
// fimDoDiaSeguinte: início da jornada seguinte, quando a parada fechou o dia.
function paradaDoTicket(eventos, ev, fimDoDiaSeguinte){
  const pausas = eventos.filter(e => e.tipo === 'pausa' && new Date(e.criado_em) <= new Date(ev.criado_em));
  const pausa = pausas[pausas.length - 1];
  if(!pausa) return null;
  const antes = pausas[pausas.length - 2];
  const chegada = /^(Carregamento|Descarga)$/.test(pausa.motivo || '') && antes && /^Chegada no local/.test(antes.motivo || '') ? antes : null;
  const fim = ev.tipo === 'fim' ? (fimDoDiaSeguinte || ev.registrado_em || null) : ev.criado_em;
  return { inicios: [pausa.criado_em, ...(chegada ? [chegada.criado_em] : [])], fim };
}

// Lê os horários da foto. Tenta a foto como veio e, se não achar dois horários, girada.
let workerTicket = null;
async function lerHorariosTicket(caminho){
  const { data: arquivo, error } = await sb.storage.from('documentos').download(caminho);
  if(error || !arquivo) throw new Error('Não consegui abrir a foto.');
  await carregarBiblioteca('ocr');
  if(!workerTicket) workerTicket = await Tesseract.createWorker('eng');
  const base = await imagemDoTicket(arquivo, /\.pdf$/i.test(caminho));
  let melhor = [];
  for(const giro of [0, 90, 270, 180]){
    const { data } = await workerTicket.recognize(prepararImagemTicket(base, giro));
    const horarios = horariosDoTexto(data && data.text);
    if(horarios.length > melhor.length) melhor = horarios;
    if(melhor.length >= 2) break;
  }
  return melhor;
}

async function imagemDoTicket(arquivo, pdf){
  if(pdf){
    await usarPdfJs();
    const doc = await pdfjsLib.getDocument({ data: await arquivo.arrayBuffer() }).promise;
    const pagina = await doc.getPage(1);
    const viewport = pagina.getViewport({ scale: 3 });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width; canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    await pagina.render({ canvasContext: ctx, viewport }).promise;
    return canvas;
  }
  return await createImageBitmap(arquivo);
}

// Cinza, mais contraste, girada e ampliada se for pequena: o leitor erra menos
function prepararImagemTicket(img, giro){
  const escala = Math.max(img.width, img.height) < 1400 ? 2 : 1;
  const w = img.width * escala, h = img.height * escala;
  const deitado = giro === 90 || giro === 270;
  const canvas = document.createElement('canvas');
  canvas.width = deitado ? h : w; canvas.height = deitado ? w : h;
  const ctx = canvas.getContext('2d');
  ctx.filter = 'grayscale(1) contrast(1.4)';
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(giro * Math.PI / 180);
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  return canvas;
}
