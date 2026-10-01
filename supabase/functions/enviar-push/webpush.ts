// =====================================================================
// MOVER.IA — Web Push sem bibliotecas externas (só WebCrypto)
// Padrões: RFC 8291 (criptografia "aes128gcm" da mensagem) e RFC 8292
// (VAPID: assinatura que identifica nosso servidor para o Google/Apple).
// Roda igual no Deno (Edge Function) e no Node (testes).
// =====================================================================

const enc = new TextEncoder();

export function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function deB64url(texto: string): Uint8Array {
  const b64 = texto.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((texto.length + 3) % 4);
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}
function juntar(...partes: Uint8Array[]): Uint8Array {
  const total = new Uint8Array(partes.reduce((n, p) => n + p.length, 0));
  let i = 0;
  for (const p of partes) { total.set(p, i); i += p.length; }
  return total;
}
async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, bytes: number): Promise<Uint8Array> {
  const chave = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, chave, bytes * 8));
}

export type ChavesVapid = { publica: string; privada: JsonWebKey };

// Par de chaves do servidor (gerado uma vez e guardado no banco)
export async function gerarChavesVapid(): Promise<ChavesVapid> {
  const par = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']) as CryptoKeyPair;
  const publica = new Uint8Array(await crypto.subtle.exportKey('raw', par.publicKey));
  return { publica: b64url(publica), privada: await crypto.subtle.exportKey('jwk', par.privateKey) };
}

// Cabeçalho Authorization (VAPID) para o serviço de push daquele endereço
export async function cabecalhoVapid(endpoint: string, chaves: ChavesVapid, contato: string): Promise<string> {
  const aud = new URL(endpoint).origin;
  const cab = b64url(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const corpo = b64url(enc.encode(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: contato })));
  const chave = await crypto.subtle.importKey('jwk', chaves.privada, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const assinatura = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, chave, enc.encode(`${cab}.${corpo}`)));
  return `vapid t=${cab}.${corpo}.${b64url(assinatura)}, k=${chaves.publica}`;
}

// Criptografa a mensagem para um aparelho (RFC 8291, um único bloco)
export async function criptografar(mensagem: string, p256dh: string, auth: string): Promise<Uint8Array> {
  const chavePublicaAparelho = deB64url(p256dh);
  const segredoAuth = deB64url(auth);
  const efemera = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']) as CryptoKeyPair;
  const publicaEfemera = new Uint8Array(await crypto.subtle.exportKey('raw', efemera.publicKey));
  const aparelho = await crypto.subtle.importKey('raw', chavePublicaAparelho, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const segredoEcdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: aparelho }, efemera.privateKey, 256));

  const ikm = await hkdf(segredoAuth, segredoEcdh, juntar(enc.encode('WebPush: info\0'), chavePublicaAparelho, publicaEfemera), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);

  const texto = juntar(enc.encode(mensagem), new Uint8Array([2]));  // 2 = último bloco
  const chaveAes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const cifrado = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, chaveAes, texto));

  const cabecalho = new Uint8Array(21);
  cabecalho.set(salt, 0);
  new DataView(cabecalho.buffer).setUint32(16, 4096);
  cabecalho[20] = publicaEfemera.length;
  return juntar(cabecalho, publicaEfemera, cifrado);
}

export type Inscricao = { endpoint: string; p256dh: string; auth: string };

// Envia; devolve o status HTTP do serviço de push (201 = entregue;
// 404/410 = aparelho não existe mais — apagar a inscrição)
export async function enviarPush(insc: Inscricao, mensagem: string, chaves: ChavesVapid, contato: string): Promise<number> {
  const corpo = await criptografar(mensagem, insc.p256dh, insc.auth);
  const resp = await fetch(insc.endpoint, {
    method: 'POST',
    headers: {
      Authorization: await cabecalhoVapid(insc.endpoint, chaves, contato),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: '86400',
      Urgency: 'high',
    },
    body: corpo,
  });
  await resp.body?.cancel();
  return resp.status;
}
