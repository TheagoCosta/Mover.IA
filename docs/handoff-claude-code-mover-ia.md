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
- **Ao publicar mudança de JS/CSS, trocar o `?v=` no `index.html`** (hoje `20261023a` — também em `privacidade.html`) para os celulares baixarem a versão nova.
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
| `js/documentos.js` | lista/cadastro de documentos, QR Code, leitura de PDF, **upload inteligente** (detecta CNH/CRLV e de quem é; **vários arquivos de uma vez** → `processarArquivosEnviados` + resumo com logins/senhas para imprimir; CNH de quem já tem CNH atualiza em vez de duplicar), `mostrarToast` |
| `js/ui.js` (componentes) | `barraLista`/`aplicarLista`/`ligarBarraLista`: pesquisa + ordenação das listas do escritório (Documentos, Motoristas, Abastecimento, Oficina, Jornadas, Checklists, Capacitações); `abrirVisualizador`/`ativarZoom`: visualizador de imagem/PDF/vídeo com zoom (pinça, roda do mouse, duplo toque) usado em Ver documento, certificados e fotos da oficina |
| `js/ocr-cnh.js` | OCR da CNH (tesseract), extração de nome/CPF/validade/**categoria** (modelos novo e antigo DENATRAN; categoria: no modelo novo vem do texto após o nº de registro, no antigo de um recorte da caixa "CAT. HAB." localizado pela cor vermelha — se não tiver certeza, fica em branco), prévia do documento nas janelas de conferência (`montarPreviaDocumento`, com zoom), cadastro automático de motorista. Na CNH o **CPF decide de quem é** (CPF igual = mesmo motorista; diferente = outra pessoa) e a busca por nome exige o 1º nome. Validade e nome também saem da linha de códigos (MRZ) do rodapé da CNH Digital, conferida pelo dígito verificador (`lerMrzCNH`). Na conferência manual há "+ Cadastrar novo motorista" e "+ Cadastrar novo veículo" (dados do CRLV por `extrairDadosCRLV`: placa — também pelo nome do arquivo —, tipo, modelo, ano e grupo sugerido pelo proprietário; validade sugerida pelo calendário do Detran) |
| `js/consumo.js` | seção **Consumo** do escritório: `consumoDe()` = km rodados ÷ litros (km = media_calculada × litros; ignora médias fora de 0,8–6 km/l), evolução mensal, ranking por veículo/motorista, alertas fora do padrão (constantes no topo do arquivo) |
| `js/oficina.js` | chamados (motorista abre com **várias fotos/vídeos** — tabela `chamado_midia`, momento problema/reparo; `foto_url`/`foto_reparo_url` antigos ainda aparecem), **app do mecânico** (Chamados + Agenda + Frota), seção Oficina do escritório, cadastro de mecânico. Bucket `oficina`: imagens e vídeos, até 50 MB |
| `js/agenda.js` | agenda (escritório), agendamentos do motorista ("estou ciente") e agenda do mecânico; **calendário do mês** compartilhado (`calendarioAgenda`/`ligarCalendario`); compromisso de vários dias = `data_fim` (`fimAgenda()`) |
| `js/capacitacoes.js` | capacitações com certificado (escritório e motorista) |
| `js/notificacoes.js` | sino de notificações (motorista, mecânico, escritório) |
| `supabase/migrations/` | todas as mudanças de banco feitas pelo Claude (em ordem) |
| `supabase/functions/` | código das 3 Edge Functions (ver abaixo) |
| `ferramentas/teste/` | **ambiente de testes com Supabase falso** (ver `ferramentas/teste/README.md`) |

### Edge Functions (todas `verify_jwt = true`)
- `criar-motorista-automatico` (v4 — exige quem chama ativo): cria login de motorista (pela CNH) ou mecânico; login `nome.sobrenome@motoristas.moveria.app` + senha temporária.
- `gerenciar-usuario` (v2): `criar_escritorio` (só admin; login = e-mail real), `resetar_senha`, `desativar` (bloqueia o login e tira do conjunto), `reativar`.
- `enviar-push` (v1, **`verify_jwt = false`** — quem chama é o banco, protegido pelo segredo de `push_config`): manda cada notificação nova do sino para os aparelhos inscritos (Web Push feito à mão com WebCrypto em `webpush.ts`, testado contra a biblioteca de referência `http_ece`). `{acao:'preparar'}` cria as chaves VAPID (já feito; ficam só em `push_config`). Apaga inscrições mortas (404/410).
- `registrar-abastecimento-interno` (v3 — com limite de tentativas de senha): confere a senha de quem do escritório abasteceu (sessão temporária encerrada com `scope:'local'`) e grava o abastecimento interno com médias de diesel e Arla.

## 3. Banco e segurança (RLS)

- Papéis (`papel_usuario`): `motorista`, `mecanico`, `gestor` (escritório), `admin_transportadora`, `admin_mover_ia`.
- Funções auxiliares (security definer): `minha_transportadora()`, `meu_papel()`, `eh_gestao()` (todas exigem usuário **ativo**), `meus_veiculos()`, `marcar_senha_trocada()`, `confirmar_agendamento()`, `marcar_notificacoes_lidas()`, `notificar()`/`ids_por_papel()` (só para gatilhos).
- **Segurança P1 (06/10, migração `20261006_01_seguranca_p1.sql`)**: motorista **não altera nem apaga** jornada encerrada nem checklist; em jornada aberta só muda status/fim/assinatura; início, fim, eventos e envio do checklist usam **sempre o relógio do servidor** (gatilhos `trg_*_regras_motorista`); motorista só altera `arquivo_url`/`qr_conteudo` dos documentos (validade é do escritório; a sugestão de validade lida do PDF só aparece para a gestão); assinatura só aceita `data:image/png;base64` (CHECK no banco + `imgAssinatura()` em `ui.js`). `pode_tudo()` = gestão ou servidor. **Segurança P2 (06/10, `20261006_02_seguranca_p2.sql`)**: abastecimento do motorista só em veículo do conjunto; `media_calculada`/`media_arla_calculada` (e a data, para o motorista) calculadas pelo gatilho `abastecimento_calcular` — o app não manda mais média; confirmação do abastecimento interno bloqueia após 5 senhas erradas do motorista ou 10 na senha da pessoa do escritório em 15 min (tabela `tentativa_confirmacao` + `confirmacao_liberada()`, só service role; função `registrar-abastecimento-interno` v3). **Segurança P3 (06/10, `20261006_03_seguranca_p3.sql`)**: motorista só muda `viagem.status` para concluida; motorista não atualiza chamado depois de aberto; mecânico só mexe em status/observação/foto do reparo/responsável (= ele mesmo)/datas (gatilhos `trg_viagem_regras_motorista`, `trg_chamado_regras_mecanico`); **motorista não vê outros motoristas** na tabela usuario (só a si, escritório e mecânicos — política `usuario_ler`); `registrar_push` não reassocia aparelho de outra transportadora; `criar-motorista-automatico` v4 exige chamador ativo. Ao criar regra nova para motorista, **nunca usar `FOR ALL`** e limitar colunas. Relatório completo da auditoria (local, fora do git): `docs/security-audit/`.
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


## Despertador do Supabase (13/10)
O plano gratuito pausa o projeto após dias sem uso (aconteceu em 13/10: ninguém conseguia entrar). O GitHub Actions `.github/workflows/despertador-supabase.yml` chama a função `manter_ativo()` (só devolve 1; migração `20261013_01_despertador.sql`) a cada 2 dias; se falhar, o GitHub manda e-mail. Solução definitiva: plano Pro (não pausa e tem backup diário).


## LGPD — etapa 1 (14/10)
- `js/privacidade.js`: texto da Política de Privacidade (`htmlPoliticaPrivacidade`; versão em `VERSAO_PRIVACIDADE` — subir a versão faz todos lerem de novo), aviso no 1º acesso com registro de leitura, **Meus dados** (ver, relatório para imprimir, baixar JSON, pedir correção/exclusão/outro) para motorista (Mais), mecânico (cadeado no topo) e escritório; seção **Privacidade** do escritório (pedidos com prazo de 15 dias, quem leu a política).
- `privacidade.html`: página pública da política (link na tela de login). Não carrega `ui.js`.
- Banco: `aceite_privacidade` e `solicitacao_titular` (só leitura direta; gravação pelas funções `registrar_aceite_privacidade`, `criar_solicitacao_titular`, `responder_solicitacao_titular`). Migração `20261014_01_lgpd_aceite_e_solicitacoes.sql`. Segurança testada no banco real.
- Contato de privacidade: e-mail do Thiago (constante `CONTATO_PRIVACIDADE`). Fichas cadastrais continuam no app (decisão do Thiago).
- Próximas etapas: documentos para o advogado.

## LGPD — etapa 2 (21/10)
- `registro_acesso`: aberturas de arquivo (o app chama `registrar_acesso_arquivo` em `verArquivo`/`verCertificado`) e, por gatilhos no banco, cadastro/alteração/exclusão de documentos, capacitações e CPF/CNH/validades do motorista. Só o escritório lê; ninguém grava/apaga direto; limpo após 5 anos.
- Prazo de guarda: `usuario.desligado_em` (gatilho ao desativar/reativar), `transportadora.anos_guarda_dados` (padrão 5), aviso toda segunda 07:30 (pg_cron `aviso-prazo-guarda`), `anonimizar_titular()` (o app apaga antes os arquivos do armazenamento). Anonimizados somem das listas (`qUsuarios` filtra `anonimizado_em`).
- Migração `20261021_01_lgpd_registro_e_guarda.sql`; testado no banco real com rollback.


## Documentos: motorista só lê; documentos de viagem (22/10)
- Motorista **não** anexa/troca arquivo nem lê QR (política `documento_motorista_anexar` removida; envio ao bucket `documentos` só pelo escritório). No app: **Ver / Baixar / Compartilhar** (`ligarAcoesArquivo` em documentos.js; `baixarArquivoItem`/`compartilharArquivoItem` em ui.js, Web Share API com o arquivo original e nome amigável; o visualizador também tem os dois botões).
- `documento.referente_a = 'viagem'`: escritório anexa CT-e/MDF-e/NF-e ao criar a viagem ou no botão Documentos da viagem (Painel); tipo sugerido pelo nome do arquivo (`tipoDocViagemPeloNome`). Motorista vê na aba Viagem e em Documentos → Viagem (últimas 10 viagens). Migração `20261022_01_documentos_somente_leitura_motorista_e_viagem.sql`; segurança testada no banco real.
- Privacidade também em Meu perfil (motorista) e Configurações (escritório).


## Integração Bsoft (22/10)
- API oficial: https://docs.bsoft.app (Basic Auth: `dominio.bsoft.app` + usuário com perfil de integração + senha; **sem homologação** — só leitura por enquanto).
- Edge Function `bsoft-sincronizar` (verify_jwt=false, confere JWT de gestão ou o segredo de `integracao_segredo`): ações status | testar | previa | sincronizar. Lê MDF-e do período (`integracao_bsoft.dias_retroativos`, padrão 3), acha o motorista pelo CPF (`motorista_perfil`) ou placa do conjunto, cria `viagem` (`bsoft_manifesto_id`) e anexa DAMDFE/DACTE como documentos de viagem (`documento.bsoft_ref`). Conclui viagens Bsoft anteriores do mesmo motorista.
- Credenciais: segredos `BSOFT_DOMINIO`, `BSOFT_USUARIO`, `BSOFT_SENHA` (Thiago cadastra no painel; nunca no chat/código).
- Tela Integração no escritório (testar, prévia, sincronizar, ligar automático, histórico).
- **Agendamento a cada 15 min ainda NÃO aplicado**: `supabase/migrations/20261022_03_agendamento_bsoft.sql` (aguarda aprovação do Thiago). Migração aplicada: `20261022_02_integracao_bsoft.sql`.


## Correções do escritório (22/10)
- Escritório corrige/exclui: abastecimento (engrenagem na lista; média recalculada por gatilho, inclusive a do seguinte do veículo), jornada (corrigir horários/encerrar e excluir, no detalhe), checklist (só excluir — é assinado), chamado de oficina (engrenagem; excluir apaga as mídias do bucket `oficina`). Toda correção/exclusão do escritório vai para o Registro de acessos (`trg_registro_operacao`). Migração `20261022_04_edicao_exclusao_registros.sql`.
- A integração Bsoft só LÊ do Bsoft: nada do MOVER.IA é enviado para lá.


## Bsoft — ajustes (23/10) e seção Viagens
- Importa do MDF-e mais NOVO para o mais antigo (até 30 por rodada; o resto na próxima). O mais novo de cada motorista fica em andamento; os anteriores entram concluídos (sem aviso — `trg_notif_viagem_nova` só avisa `em_andamento`).
- O Bsoft da ChavesLog não manda cidade no CT-e: origem/destino = remetente → recebedor/destinatário.
- `sincronizacao_log.status` aceita `sucesso`/`erro`.
- Seção **Viagens** no escritório (em andamento/concluídas/todas, pesquisa, concluir/reabrir, arquivos, nova viagem).
- Endereços de coleta/entrega (`viagem.origem_endereco`/`destino_endereco`) vêm do XML do CT-e (`POST eDoc/v1/XMLDocumentosFiscais/CTesEmitidos`): coleta = expedidor ou remetente; entrega = recebedor ou destinatário. App do motorista mostra botões Google Maps/Waze.
- Tipo de arquivo de viagem "Agendamento" (primeiro da lista e sugestão padrão).
- O Bsoft escreve a placa como `FXV-4I34/SP`: `placaNorm` tira o `/UF` (antes nenhum cavalo casava). `equipamentos?equipamento=<placa>` filtra direto.
- Só importa MDF-e de cavalo cadastrado no MOVER.IA (`fora_da_frota` = terceiros/agregados, ignorados sem aviso).
- **Abastecimento → Bsoft (23/10)**: botão "Enviar ao Bsoft" em cada abastecimento (escritório → Abastecimento). `abastecimento_preparar` (só lê: equipamento pela placa, motorista pelo CPF, combustíveis, almoxarifados, fornecedores com sugestão pelo nome do posto, lançamentos do mesmo veículo/dia = possível repetido) e `abastecimento_enviar` (GRAVA; só JWT de gestão, nunca o cron). Externo → `POST manutencao/v1/abastecimentos` (programado padrão SP = Sem programação, nroDoc = nota); interno → `POST manutencao/v1/abastecimentosProprios` (almoxarifado; valor unitário opcional). Arla vai como segundo lançamento. Guarda `abastecimento.bsoft_ref`/`bsoft_enviado_em` (não envia duas vezes). Escolhas do escritório lembradas no navegador. Ainda não testado contra o Bsoft real — o primeiro envio é o teste (conferir lá).
- Abastecimento interno → `numeroControle` = hodômetro da bomba (arredondado; só no lançamento do diesel).
- **Ticket de descarga** (migração 20261023_04): o motorista só finaliza a viagem depois de enviar foto/PDF do ticket (gatilho `trg_viagem_regras_motorista`; escritório e integração continuam concluindo sem). É o único arquivo que o motorista anexa: políticas `documento_motorista_ticket` e `documentos_motorista_ticket` (tipo "Ticket de descarga", própria viagem em andamento, pasta `{tid}/viagem/{viagem}/Ticket_de_descarga*`). Testado no banco (bloqueios e caminho feliz).
- Motorista: "Selecionar vários para enviar" (Documentos, Meu conjunto, Viagem) — compartilha/baixa vários arquivos juntos (`ligarSelecaoArquivos` em documentos.js, `compartilharVariosItens` em ui.js). Meu conjunto mostra os documentos de cada veículo. "Meu perfil" + "Meus dados e privacidade" viraram uma tela só, aberta pelo círculo das iniciais.
- **Encerramento ("baixa") do MDF-e (26/10, migração 20261026_01)**: viagem do Bsoft concluída com ticket de descarga → gatilho `viagem_encerrar_mdfe` chama `bsoft-sincronizar` (`encerrar_mdfe`) via pg_net, só se `integracao_bsoft.encerrar_mdfe` (liga/desliga em Integração; `definir_encerramento_mdfe`). Função faz `PATCH transporte/v1/manifestos/{id}/encerrar` com `fecharManifesto: 'S'` (se o Bsoft responder "já está fechado", repete só encerrando; "já encerrado" conta como certo). Resultado em `viagem.bsoft_encerrado_em` / `bsoft_encerramento_erro`. Em Viagens: "MDF-e encerrado", erro, ou botão "Encerrar MDF-e" (manual, também com o automático desligado). Desligado por padrão — vai para a SEFAZ e não se desfaz. Ainda não testado contra o Bsoft real.
- **CRLV**: exercício X vence no mês do calendário (final da placa) do ano X+1 (`extrairExercicioCRLV` + `sugerirValidadePorPlaca`). Os 174 CRLV com validade em 2026 foram passados para 2027 (26/10). Há 105 placas com CRLV em dobro (cadastrados em 08/10 e de novo em 13/10) — limpeza pendente de decisão do Thiago.
- App do motorista: sem a aba "Mais"; tudo em quadros no Início. Aba Viagem mostra só "Documentos da viagem" (arquivos com ver/baixar/compartilhar).
