// Gera ferramentas/teste/teste.html a partir do index.html real do app:
// troca o Supabase de verdade pelo falso (supabase-falso.js) e aponta os
// arquivos do app para /app/. Rodar de novo sempre que o index.html mudar.
// Uso (na raiz do repositório): node ferramentas/teste/montar.js
const fs = require('fs'), path = require('path');
const repo = process.argv[2] || path.join(__dirname, '..', '..');
const destino = process.argv[3] || path.join(__dirname, 'teste.html');
let html = fs.readFileSync(path.join(repo, 'index.html'), 'utf8');
html = html.replace(/<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase[^"]*"><\/script>/, '<script src="/teste/supabase-falso.js"></script>');
html = html.replace(/(href|src)="(css|js|img)\//g, '$1="/app/$2/');
fs.writeFileSync(destino, html);
console.log('ok — gerado', destino);
