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

## Dicas

- Para testar ações, chame as funções do app pelo console (ex.: `irParaMotorista('abastecimento')`, `screen = 'agenda'; loadEscritorio()`) e confira `window.__chamadas` para ver o que seria gravado.
- Senha do escritório na confirmação do abastecimento interno: `certa` (qualquer outra dá "senha incorreta").
- Faltou algum método do Supabase (ex.: `.ilike`)? Acrescente no objeto `q` dentro de `consulta()` em `supabase-falso.js`.
- Os dados de teste ficam no objeto `F` de `supabase-falso.js`; datas são relativas a "agora" (`iso(minutosAtrás)`, `dia(diasAFrente)`).
- O ícone da barra lateral aparece quebrado só aqui (caminho relativo); no site real aparece normal.
