# MOVER.IA — Handoff para o Claude Code

**Atualizado em 30/09/2026**, ao passar o projeto do computador da empresa para o computador pessoal do Thiago.
Leia este arquivo inteiro antes de mexer em qualquer coisa. O plano vivo (o que foi feito e o que falta) está em `docs/plano-execucao-mover-ia.md`.

> ⚠️ **Este repositório é PÚBLICO** (precisa ser, para o GitHub Pages gratuito). Nunca coloque aqui CPF, CNH, senhas, chaves secretas, PDFs de documentos ou transcrições de conversa. A chave do Supabase que está em `js/nucleo.js` é a *publishable* (pública por natureza); a proteção dos dados é feita pelas regras de acesso (RLS) do banco.

---

## 1. O que é o MOVER.IA

SaaS multi-empresa ("Gestão para quem move o Brasil") para transportadoras: documentação de motorista/veículo/empresa (com leitura automática de CNH/CRLV), jornada (Lei do Motorista), checklist pré-viagem, viagem, abastecimento, oficina/manutenção, agenda, capacitações e notificações.

- **Cliente piloto:** ChavesLog Transportes (Chaves & Ardito Ltda). `transportadora_id` = `039cdb29-c23d-4b5c-8636-595a61a84737`.
- **Quem constrói:** o Thiago (dono do produto, **não programa**) + o Claude, que escreve 100% do código. O Thiago testa no celular/computador e cuida das contas.
- **Como falar com o Thiago:** em português, simples, passo a passo. Sempre dizer claramente o que ele precisa fazer fora do código (Push no GitHub Desktop, testar etc.). Ele aprova testes e mudanças por etapa.

## 2. Arquitetura

- **Frontend sem build:** `index.html` + `css/app.css` + `js/*.js` (scripts clássicos, todas as funções globais — um arquivo chama funções dos outros). Bibliotecas por CDN: supabase-js 2.117.2 (versão fixa, no `index.html`); jsQR, pdf.js 3.11.174 e tesseract.js 5.1.1 são **baixados só quando usados** (`carregarBiblioteca()` / `usarPdfJs()` em `js/ui.js`) — não voltar a colocá-los no `<head>`, isso deixava o celular lento. Fontes Oswald/Inter/JetBrains Mono (Google Fonts).
- **Ao publicar mudança de JS/CSS, trocar o `?v=` no `index.html`** (hoje `20261001h`) para os celulares baixarem a versão nova.
- **App instalável (PWA):** `manifest.webmanifest` + `sw.js` (service worker). A página abre **na hora com a cópia guardada** e a nova é buscada por trás; o app confere a versão publicada (`conferirVersaoNova()` em `ui.js`, via `?verificar=`) e mostra o aviso "Atualizar" (`?atualizar=` faz o service worker buscar da internet). Medidor de velocidade no Perfil do motorista (`resumoVelocidade()`); arquivos com `?v=` e CDN de versão fixa ficam guardados de vez; Supabase nunca é guardado. **Por isso o `?v=` é obrigatório** — sem trocar, o celular continua com o arquivo antigo. Mudou o `sw.js`? Trocar `CACHE` (`moveria-v1` → `v2`). Botão "Instalar o app no celular" na aba Mais do motorista (`instalarApp()` em `ui.js`). O navegador embutido do Claude não registra service worker; a lógica foi testada simulando o navegador no Node.
- **Backend:** Supabase `otllslhjbyjtktxyvezy` (Postgres + Auth + Storage + Edge Functions). O Claude acessa pelo **conector oficial do Supabase** (MCP) — o Thiago conecta em Configurações → Conectores do app do Claude. Com ele o Claude lê o banco, aplica migrações e publica funções.
- **Hospedagem:** GitHub `TheagoCosta/Mover.IA`, branch `main` → **GitHub Pages: https://theagocosta.github.io/Mover.IA/** (maiúsculas importam; `/mover-ia/` dá 404). O Netlify antigo está pausado/abandonado.
- **Publicação:** o Claude faz o commit local; o **Thiago clica em "Push origin" no GitHub Desktop** (o git do terminal não tem as credenciais dele). Depois de ~2 min o site atualiza.
- **Git no Windows:** não há git no PATH; usar o git que vem com o GitHub Desktop (`%LOCALAPPDATA%\GitHubDesktop\app-*\resources\app\git\cmd\git.exe`) com `core.longpaths=true`. Node.js é necessário para os testes (instalar o Node LTS, ou usar um node.exe portátil). No computador pessoal: projeto em `C:\Mover.IA\Mover.IA`, Node em `C:\Mover.IA` (no PATH); arquivos locais que não vão para o GitHub ficam em `.Inativos/` (ignorada via `.git/info/exclude`).

### Arquivos
| Arquivo | Conteúdo |
|---|---|
| `js/ui.js` | ícones `ic()`, medidor `gauge()`, `esc()` (escapar HTML), datas, **status de documento calculado pela validade** (`statusDocumento`, alerta em 30 dias), `calcularConducao` (jornada), `baixarCSV`, `abrirModal` |
| `js/nucleo.js` | conexão Supabase, login (login sem @ vira `login@motoristas.moveria.app`), primeiro acesso (troca de senha temporária via `marcar_senha_trocada()`), roteamento por papel, usuário desativado |
| `js/motorista.js` | app do motorista (abas Início, Jornada, Checklist, Viagem, Mais), **trava do checklist de 24h**, jornada com paradas e assinatura, documentos. **Início = uma consulta só** (`sb.rpc('inicio_motorista')`, plano B `carregarInicioPorPartes()`), guardado em `localStorage` (`moveria:inicio`) para abrir na hora (`abrirInicioDoCache()` chamado pelo `init()`); apagado no `doLogout()`. Lição do medidor: no iPhone cada ida ao servidor custa ~0,5 s — **evitar consultas em sequência**. Telas do motorista/mecânico usam `dadosTela(chave, buscar, redesenhar)` (`js/ui.js`): mostra o guardado na memória e atualiza por trás; **toda gravação no Supabase descarta as telas guardadas automaticamente** (no wrapper de `fetch` em `ui.js`) — tela nova: buscar os dados por `dadosTela` |
| `js/abastecimento.js` | abastecimento **interno** (confirmado com a senha de quem do escritório abasteceu) x **externo** (posto, nota, preço/litro); média do diesel (principal) e do Arla (separada) |
| `js/escritorio.js` | painel do escritório (menu lateral, Painel, Abastecimento, Jornadas, Checklists, Integração) |
| `js/cadastros.js` | Motoristas, Veículos (filtros por cavalo/1ª e 2ª carreta/dolly, busca), Conjuntos, Usuários, Configurações, edição de documentos, `chamarFuncaoServidor()` |
| `js/documentos.js` | lista/cadastro de documentos, QR Code, leitura de PDF, **upload inteligente** (detecta CNH/CRLV e de quem é), `mostrarToast` |
| `js/ocr-cnh.js` | OCR da CNH (tesseract), extração de nome/CPF/validade (modelos novo e antigo DENATRAN), cadastro automático de motorista |
| `js/oficina.js` | chamados (motorista abre com **várias fotos/vídeos** — tabela `chamado_midia`, momento problema/reparo; `foto_url`/`foto_reparo_url` antigos ainda aparecem), **app do mecânico** (Chamados + Agenda + Frota), seção Oficina do escritório, cadastro de mecânico. Bucket `oficina`: imagens e vídeos, até 50 MB |
| `js/agenda.js` | agenda (escritório), agendamentos do motorista ("estou ciente") e agenda do mecânico; **calendário do mês** compartilhado (`calendarioAgenda`/`ligarCalendario`); compromisso de vários dias = `data_fim` (`fimAgenda()`) |
| `js/capacitacoes.js` | capacitações com certificado (escritório e motorista) |
| `js/notificacoes.js` | sino de notificações (motorista, mecânico, escritório) |
| `supabase/migrations/` | todas as mudanças de banco feitas pelo Claude (em ordem) |
| `supabase/functions/` | código das 3 Edge Functions (ver abaixo) |
| `ferramentas/teste/` | **ambiente de testes com Supabase falso** (ver `ferramentas/teste/README.md`) |

### Edge Functions (todas `verify_jwt = true`)
- `criar-motorista-automatico` (v3): cria login de motorista (pela CNH) ou mecânico; login `nome.sobrenome@motoristas.moveria.app` + senha temporária.
- `gerenciar-usuario` (v2): `criar_escritorio` (só admin; login = e-mail real), `resetar_senha`, `desativar` (bloqueia o login e tira do conjunto), `reativar`.
- `enviar-push` (v1, **`verify_jwt = false`** — quem chama é o banco, protegido pelo segredo de `push_config`): manda cada notificação nova do sino para os aparelhos inscritos (Web Push feito à mão com WebCrypto em `webpush.ts`, testado contra a biblioteca de referência `http_ece`). `{acao:'preparar'}` cria as chaves VAPID (já feito; ficam só em `push_config`). Apaga inscrições mortas (404/410).
- `registrar-abastecimento-interno` (v2): confere a senha de quem do escritório abasteceu (sessão temporária encerrada com `scope:'local'`) e grava o abastecimento interno com médias de diesel e Arla.

## 3. Banco e segurança (RLS)

- Papéis (`papel_usuario`): `motorista`, `mecanico`, `gestor` (escritório), `admin_transportadora`, `admin_mover_ia`.
- Funções auxiliares (security definer): `minha_transportadora()`, `meu_papel()`, `eh_gestao()` (todas exigem usuário **ativo**), `meus_veiculos()`, `marcar_senha_trocada()`, `confirmar_agendamento()`, `marcar_notificacoes_lidas()`, `notificar()`/`ids_por_papel()` (só para gatilhos).
- **Motorista** só vê/grava o que é dele (jornadas, checklists, abastecimentos, viagem, perfil com CPF) + documentos dele, do conjunto e da empresa. Só grava abastecimento **externo** (interno só pela função). **Mecânico**: oficina + frota, sem documentos. **Gestão**: tudo da transportadora; edita só nome/telefone de usuários (papel e e-mail travados) e dados da empresa (CNPJ e plano travados).
- **Notificações** são criadas só pelo banco: gatilhos (chamado novo/status, viagem nova, agendamento novo, capacitação nova, checklist com irregularidade) e o **aviso diário de vencimentos** — `aviso_diario_vencimentos()`, agendada no pg_cron (`aviso-diario-vencimentos`, 10:00 UTC = 7h Brasília); marcos de 30/15/7/3/1/0 dias e semanal por 2 meses depois de vencido; tabela `aviso_diario_execucao` garante uma rodada por dia. Para testar, chamar com uma data (`aviso_diario_vencimentos('2026-11-08')`) dentro do bloco que se desfaz.
- **Avisos no celular (push):** gatilho `push_notificacao` em `notificacao` → `net.http_post` (pg_net, sai só depois do commit) → Edge Function `enviar-push`. Aparelhos em `push_inscricao` (o app só usa `registrar_push` / `remover_push` / `chave_publica_push`). No app: `cartaoAvisosCelular()` (Início do motorista e telas do sino), `sincronizarPush()` no login, `removerPushDesteAparelho()` no sair, `?abrir=<destino>` abre a tela do aviso (`js/notificacoes.js`). Respostas da função ficam em `net._http_response` (bom para investigar).
- Buckets privados: `documentos` (documentos e certificados de capacitação) e `oficina` (fotos dos chamados), pasta raiz = `transportadora_id`.
- **Como testar segurança sem sujar o banco:** bloco `do $$ ... $$` que simula o usuário com `set_config('request.jwt.claims', ...)` + `set local role authenticated`, faz os testes e termina com `raise exception 'RESULTADO ...'` (desfaz tudo). Alterações diretas em dados reais via SQL são bloqueadas pelo modo automático do Claude Code — nesses casos, pedir ao Thiago ou resolver pelo próprio app.

## 4. Decisões já tomadas pelo Thiago (não mudar sem perguntar)

- Arquitetura sem build (arquivos estáticos + Supabase). Dividir em arquivos foi aprovado.
- **Senha mínima de 6 caracteres** (ele não quis 8; a proteção de senhas vazadas do Supabase exige plano pago).
- Abastecimento interno confirmado com a **senha individual** de quem do escritório abasteceu (identifica quem foi).
- **Checklist assinado** pelo motorista antes de enviar (`checklist.assinatura_base64`); assinaturas em tela cheia com `pedirAssinatura()` (usa `prepararAssinatura()`, `js/ui.js`), salvas em tinta escura sobre fundo branco e recortadas na área assinada. Botão "Marcar todos como Atende" só preenche itens sem resposta.
- **Checklist obrigatório a cada 24h** (`VALIDADE_CHECKLIST_HORAS` em `js/motorista.js`): vencido trava o app na aba Checklist; com jornada aberta a aba Jornada continua liberada; motorista sem conjunto não trava.
- Média do Arla separada; a do diesel é a principal. Preço por litro só no abastecimento externo.
- Os 24 veículos da frota estão nos 6 conjuntos originais — para dar um conjunto a um motorista, editar um conjunto existente (Veículos ou Motoristas).
- Rastreamento por GPS fora do escopo por enquanto.

## 5. Estado atual (30/09/2026)

Etapas concluídas e **testadas pelo Thiago com contas reais**: OCR da CNH (modelos novo e antigo), cadastro automático de motorista e 1º acesso, regras de acesso por papel, visual do protótipo (escritório + motorista), Oficina + app do mecânico, cadastros e edição pelo painel, abastecimento interno/externo com preços e média do Arla, checklist de 24h, agenda, capacitações, notificações e cadastro de usuário do escritório.

## 6. Próximos passos possíveis (o Thiago escolhe)

1. **Integração Bsoft** (Bloco 5): viagens, CT-e e MDF-e automáticos (API confirmada, só consulta periódica). Precisa das credenciais da API com o Thiago.
2. ~~Notificação no celular com a tela desligada~~ — feito em 01/10 (falta o teste real no celular).
3. ~~Aviso diário automático no sino~~ — feito em 30/09.
4. **Piloto com mais motoristas** (cadastrar os demais pela CNH e acompanhar o uso) — Fase 4/5 do plano.
5. Pendências de LGPD do plano (política de privacidade, retenção de documentos).

## 7. Como trabalhar (rotina que funcionou)

1. Entender o pedido, confirmar decisões ambíguas com o Thiago.
2. Mudanças de banco: escrever em `supabase/migrations/AAAAMMDD_NN_nome.sql` **e** aplicar pelo conector; avisar o Thiago antes em 1–2 frases.
3. Código: editar, `node --check` em todos os `js/*.js`, conferir nomes globais duplicados (um `let`/`const` repetido em dois arquivos quebra a página), trocar o `?v=` do `index.html`.
4. Testar as telas no **ambiente de testes** (`ferramentas/teste`) no navegador do Claude — nunca criar contas de teste no Supabase de produção nem usar a senha do Thiago.
5. Testar a segurança no banco real com o bloco que se desfaz (seção 3).
6. Commit local → pedir ao Thiago o **Push origin** → ele testa em `https://theagocosta.github.io/Mover.IA/?v=N` (número novo para furar o cache).
7. Atualizar `docs/plano-execucao-mover-ia.md` e este handoff.

## 8. Mensagem para começar a conversa no computador novo

```
Estou continuando o desenvolvimento do MOVER.IA neste computador (antes era o computador da empresa).
Leia primeiro docs/handoff-claude-code-mover-ia.md e docs/plano-execucao-mover-ia.md.
O conector do Supabase já está (ou vai estar) ligado na minha conta.
Depois me diga o que você precisa que eu instale ou configure aqui, e vamos decidir o próximo passo.
```
