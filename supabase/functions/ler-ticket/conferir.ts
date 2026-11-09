// Compara os horários lidos no ticket com os da parada. Sem dependências, para dar para testar fora do servidor.

export const TOLERANCIA_MIN = 10;
const DIA_MIN = 24 * 60;
// Hora de Brasília. Em estados com outro fuso o ticket pode dar diferença de 1 h, e o escritório revisa.
const FUSO = '-03:00';

export type Lido = { entrada: string | null; data_entrada: string | null; saida: string | null; data_saida: string | null };

const horaValida = (h: unknown) => typeof h === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(h);
const dataValida = (d: unknown) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && !isNaN(Date.parse(d));

// Descarta o que não estiver no formato pedido, em vez de confiar na resposta
export function limparLeitura(bruto: Record<string, unknown>): Lido {
  const entrada = horaValida(bruto.entrada) ? bruto.entrada as string : null;
  const saida = horaValida(bruto.saida) ? bruto.saida as string : null;
  return {
    entrada,
    data_entrada: entrada && dataValida(bruto.data_entrada) ? bruto.data_entrada as string : null,
    saida,
    data_saida: saida && dataValida(bruto.data_saida) ? bruto.data_saida as string : null,
  };
}

// Com data: diferença real. Sem data: só a hora do dia, sem importar a virada da meia-noite.
function diferencaMin(hora: string, data: string | null, referencia: Date): number {
  if (data) return Math.round(Math.abs(new Date(`${data}T${hora}:00${FUSO}`).getTime() - referencia.getTime()) / 60000);
  const [h, m] = hora.split(':').map(Number);
  const local = new Date(referencia.getTime() - 3 * 3600000);
  const dif = Math.abs(h * 60 + m - (local.getUTCHours() * 60 + local.getUTCMinutes()));
  return Math.min(dif, DIA_MIN - dif);
}

// inicios: horários aceitos para a entrada. Além do início da parada, a chegada no local que veio logo antes,
// porque o ticket costuma marcar a entrada na chegada.
export function conferirTicket(lido: Lido, inicios: Date[], fim: Date | null) {
  const difEntrada = lido.entrada && inicios.length ? Math.min(...inicios.map((i) => diferencaMin(lido.entrada!, lido.data_entrada, i))) : null;
  const difSaida = lido.saida && fim ? diferencaMin(lido.saida, lido.data_saida, fim) : null;
  const difs = [difEntrada, difSaida].filter((d): d is number => d !== null);
  const status = !difs.length ? 'ilegivel' : difs.some((d) => d > TOLERANCIA_MIN) ? 'divergente' : 'ok';
  return { status, dif_entrada_min: difEntrada, dif_saida_min: difSaida };
}

// Parada que o evento encerra e a chegada que veio logo antes dela, se houver
export function acharParada(eventos: { id: string; tipo: string; motivo: string | null; criado_em: string }[], eventoId: string) {
  const ordenados = [...eventos].sort((a, b) => new Date(a.criado_em).getTime() - new Date(b.criado_em).getTime());
  const alvo = ordenados.find((e) => e.id === eventoId);
  if (!alvo) return null;
  // o fim do dia tem a mesma hora da parada que o fechou
  const pausas = ordenados.filter((e) => e.tipo === 'pausa' && new Date(e.criado_em) <= new Date(alvo.criado_em));
  const pausa = pausas[pausas.length - 1];
  if (!pausa) return null;
  const antes = pausas[pausas.length - 2];
  const chegada = /^(Carregamento|Descarga)$/.test(pausa.motivo || '') && antes && /^Chegada no local/.test(antes.motivo || '') ? antes : null;
  return { alvo, pausa, chegada };
}
