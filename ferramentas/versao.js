// Troca o ?v= de todos os arquivos no index.html e no privacidade.html, para os celulares
// baixarem a versão nova (o app avisa "nova versão" quando o ?v= publicado muda — ver ui.js).
// A versão é a data de hoje + uma letra: 20261102a, 20261102b...
// Uso (na raiz do repositório):  node ferramentas/versao.js
const fs = require('fs'), path = require('path');
const repo = path.join(__dirname, '..');
const arquivos = ['index.html', 'privacidade.html'].map(f => path.join(repo, f));
const atual = (fs.readFileSync(arquivos[0], 'utf8').match(/\?v=(\d{8})([a-z])/) || []);
const d = new Date(), hoje = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
const letra = atual[1] === hoje ? String.fromCharCode(atual[2].charCodeAt(0) + 1) : 'a';
if(letra > 'z') throw new Error('Mais de 26 versões hoje — use outra data.');
const nova = hoje + letra;
for(const f of arquivos) fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace(/\?v=\d{8}[a-z]/g, '?v=' + nova));
console.log(`versão ${atual[0] ? atual[0].slice(3) : '?'} → ${nova}`);
