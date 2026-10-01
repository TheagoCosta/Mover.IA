// MOVER.IA — service worker: guarda os arquivos do app no celular para ele
// abrir rápido (e abrir mesmo com sinal fraco).
//   • Página (index.html): busca a versão nova na internet primeiro; se não
//     responder em 4s ou estiver sem sinal, usa a guardada. Assim, quando
//     publicamos uma versão nova, ela chega na próxima abertura.
//   • Arquivos com ?v= e bibliotecas de versão fixa (CDN, fontes): guardados
//     de vez — quando o ?v= muda, é outro endereço e baixa o novo. As cópias
//     de versões antigas são apagadas sozinhas.
//   • Imagens e manifesto: usa a guardada e atualiza por trás.
//   • Banco de dados (Supabase) e todo o resto: sempre direto da internet.
//   • Também recebe os avisos (push) e abre a tela certa ao tocar neles.
// Mudou este arquivo? Troque o número em CACHE para limpar tudo nos celulares.
const CACHE = 'moveria-v1';
const ESCOPO = new URL('./', self.location).pathname;   // /Mover.IA/ no GitHub Pages
const CDN_VERSAO_FIXA = ['https://cdn.jsdelivr.net/', 'https://fonts.googleapis.com/', 'https://fonts.gstatic.com/'];

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (e) => e.waitUntil((async () => {
  for(const nome of await caches.keys()) if(nome !== CACHE) await caches.delete(nome);
  await self.clients.claim();
})()));

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if(req.method !== 'GET') return;
  const url = new URL(req.url);
  const doApp = url.origin === self.location.origin && url.pathname.startsWith(ESCOPO);

  if(req.mode === 'navigate' && doApp) return e.respondWith(paginaRedePrimeiro(req));
  if((doApp && url.searchParams.has('v')) || CDN_VERSAO_FIXA.some(p => req.url.startsWith(p))) return e.respondWith(cachePrimeiro(req));
  if(doApp && url.pathname !== ESCOPO + 'sw.js') return e.respondWith(guardadoEAtualiza(req));
  // resto: o navegador busca normalmente
});

function podeGuardar(resp){ return resp && (resp.ok || resp.type === 'opaque'); }

async function guardar(req, resp){
  const cache = await caches.open(CACHE);
  await cache.put(req, resp);
  // apaga cópias do mesmo arquivo com outro ?v= (versões antigas)
  const url = new URL(req.url);
  if(url.origin === self.location.origin && url.searchParams.has('v')){
    for(const k of await cache.keys()){
      const ku = new URL(k.url);
      if(ku.pathname === url.pathname && ku.search !== url.search) await cache.delete(k);
    }
  }
}

async function paginaRedePrimeiro(req){
  const cache = await caches.open(CACHE);
  try{
    const resp = await Promise.race([
      fetch(req),
      new Promise((_, falha) => setTimeout(() => falha(new Error('demorou')), 4000)),
    ]);
    if(resp.ok) await cache.put(ESCOPO, resp.clone());
    return resp;
  } catch(e){
    const guardada = await cache.match(ESCOPO);
    if(guardada) return guardada;
    return fetch(req);   // nada guardado ainda: espera a internet mesmo
  }
}

async function cachePrimeiro(req){
  const guardado = await caches.match(req);
  if(guardado) return guardado;
  const resp = await fetch(req);
  if(podeGuardar(resp)) await guardar(req, resp.clone());
  return resp;
}

// ---------- avisos no celular (push) ----------
// O servidor (Edge Function enviar-push) manda {titulo, mensagem, destino}.
self.addEventListener('push', (e) => {
  let d = {};
  try{ d = e.data ? e.data.json() : {}; } catch(err){ d = { titulo: e.data ? e.data.text() : '' }; }
  e.waitUntil((async () => {
    await self.registration.showNotification(d.titulo || 'MOVER.IA', {
      body: d.mensagem || '',
      icon: ESCOPO + 'img/icone-192.png',
      tag: d.id || undefined,
      data: { destino: d.destino || '' },
    });
    // app aberto: atualiza o número do sino
    for(const c of await self.clients.matchAll({ type: 'window', includeUncontrolled: true })) c.postMessage({ tipo: 'nova-notificacao' });
  })());
});

// Tocou no aviso: abre o app (ou traz para frente) já na tela certa
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const destino = (e.notification.data && e.notification.data.destino) || '';
  e.waitUntil((async () => {
    const abertas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const doApp = abertas.find(c => new URL(c.url).pathname.startsWith(ESCOPO));
    if(doApp){
      await doApp.focus();
      doApp.postMessage({ tipo: 'abrir', destino });
      return;
    }
    await self.clients.openWindow(ESCOPO + (destino ? '?abrir=' + encodeURIComponent(destino) : ''));
  })());
});

async function guardadoEAtualiza(req){
  const guardado = await caches.match(req);
  const atualizar = fetch(req).then(async (resp) => { if(podeGuardar(resp)) await guardar(req, resp.clone()); return resp; });
  if(guardado){ atualizar.catch(() => {}); return guardado; }
  return atualizar;
}
