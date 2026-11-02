# Ambiente de testes do MOVER.IA (Supabase falso)

Serve para o Claude (ou quem estiver desenvolvendo) **abrir e testar todas as telas do app sem login, sem senha e sem tocar no banco real**. O `supabase-falso.js` substitui o cliente do Supabase por um que responde com dados inventados (nomes fictícios) e só anota o que o app tentaria gravar em `window.__chamadas`. As chamadas às Edge Functions também são respondidas localmente — nada vai para o servidor.

## Como usar

Na raiz do repositório (precisa do Node.js instalado):

```
node ferramentas/teste/montar.js
node ferramentas/teste/servir.js
```

Abrir no navegador:

- Escritório: http://127.0.0.1:8768/teste/teste.html?papel=admin_transportadora
- Motorista: http://127.0.0.1:8768/teste/teste.html?papel=motorista
- Mecânico: http://127.0.0.1:8768/teste/teste.html?papel=mecanico

Rode o `montar.js` de novo sempre que o `index.html` mudar (arquivo novo, `?v=` novo). O `teste.html` gerado não vai para o GitHub.

## Teste automático (rodar antes de cada commit)

```
node ferramentas/teste/rodar-testes.js
```

Abre o app num Chrome sem janela como escritório, motorista e mecânico, passa por todas as telas e algumas janelas, e falha se aparecer erro de JavaScript, "Erro ao carregar" ou tela vazia. Com `--fotos`, guarda uma foto de cada papel em `ferramentas/teste/fotos/` (fora do git).

## Trocar a versão (?v=) ao publicar

```
node ferramentas/versao.js
```

Troca o `?v=` do `index.html` e do `privacidade.html` para a data de hoje + letra (ex.: `20261102a`). Sem isso, os celulares continuam com os arquivos antigos guardados.

## Projeto de TESTE no Supabase (banco de verdade, dados fictícios)

Para testar com login e banco reais sem tocar na produção: abra o site com `?ambiente=teste` (aparece uma faixa vermelha). Ele usa o projeto "Mover.IA Teste" do Supabase, com a mesma estrutura e só dados inventados; a integração com o Bsoft fica desligada lá. Para voltar: "sair do teste" na faixa ou `?ambiente=producao`. As contas de teste ficam em `ferramentas/teste/contas-teste.local.txt` (só no computador, fora do GitHub).

Se a estrutura da produção mudar (migração nova), aplique a mesma migração no projeto de teste. Para recriar tudo do zero, rode `ferramentas/banco/gerar-esquema.sql` na produção e aplique o resultado no teste, trocando o endereço do projeto nas funções.

## Dicas

- Para testar ações, chame as funções do app pelo console (ex.: `irParaMotorista('abastecimento')`, `screen = 'agenda'; loadEscritorio()`) e confira `window.__chamadas` para ver o que seria gravado.
- Senha do escritório na confirmação do abastecimento interno: `certa` (qualquer outra dá "senha incorreta").
- Faltou algum método do Supabase (ex.: `.ilike`)? Acrescente no objeto `q` dentro de `consulta()` em `supabase-falso.js`.
- Os dados de teste ficam no objeto `F` de `supabase-falso.js`; datas são relativas a "agora" (`iso(minutosAtrás)`, `dia(diasAFrente)`).
- O ícone da barra lateral aparece quebrado só aqui (caminho relativo); no site real aparece normal.
