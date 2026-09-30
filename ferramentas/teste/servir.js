// Servidor local do ambiente de testes: /app/* → repositório, /teste/* → esta pasta.
// Uso (na raiz do repositório): node ferramentas/teste/servir.js
// Depois abrir: http://127.0.0.1:8768/teste/teste.html?papel=admin_transportadora
//               (ou ?papel=motorista / ?papel=mecanico)
const http = require('http'), fs = require('fs'), path = require('path');
const repo = process.argv[2] || path.join(__dirname, '..', '..');
const porta = Number(process.argv[3]) || 8768;
const raizes = { app: path.resolve(repo), teste: __dirname };
const tipos = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.png':'image/png' };
http.createServer((req, res) => {
  const partes = decodeURIComponent(req.url.split('?')[0]).split('/').filter(Boolean);
  const raiz = raizes[partes.shift()];
  const f = raiz && path.join(raiz, ...partes);
  if(!f || !f.startsWith(raiz) || !fs.existsSync(f) || fs.statSync(f).isDirectory()){ res.writeHead(404); return res.end('404'); }
  res.writeHead(200, { 'Content-Type': tipos[path.extname(f)] || 'application/octet-stream', 'Cache-Control':'no-store' });
  fs.createReadStream(f).pipe(res);
}).listen(porta, '127.0.0.1', () => console.log(`ambiente de testes em http://127.0.0.1:${porta}/teste/teste.html`));
