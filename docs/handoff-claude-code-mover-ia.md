# MOVER.IA — Documento de handoff para o Claude Code

**Para quem vai continuar o desenvolvimento (Claude Code) e para o Thiago.**
Este documento resume tudo que foi construído até agora nesta conversa (chat com o Claude, sem terminal), o estado atual, o que falta, e traz no final um prompt pronto para colar no Claude Code e retomar o trabalho sem perder contexto.

---

## 1. O que é o MOVER.IA

SaaS multi-empresa ("Gestão para quem move o Brasil") para transportadoras, cobrindo:
- Documentação de veículo, motorista e empresa (com upload inteligente por OCR)
- Controle de jornada (início/pausa/fim, motivo da parada, assinatura do motorista)
- Checklist pré-viagem
- Viagem atual (origem/destino, CT-e/MDF-e)
- Abastecimento e consumo médio
- (planejado) Oficina/manutenção, dashboard do escritório, integração com o TMS Bsoft

**Cliente piloto:** Chaves & Ardito Ltda (ChavesLog Transportes) — CNPJ 02.499.966/0001-40, RNTRC/ANTT 000808225.
`transportadora_id` no banco: `039cdb29-c23d-4b5c-8636-595a61a84737`

**Quem constrói:** só o Thiago (sem experiência de programação) + Claude. Claude escreve 100% do código; Thiago cria as contas de infraestrutura, cola o código nos lugares certos e testa no celular/computador.

**Modelo de negócio:** planos por transportadora (ver `plano-execucao-mover-ia.md`, seção "Modelo de negócio — planos", para os detalhes de precificação já definidos).

---

## 2. Arquitetura técnica atual

- **Frontend:** um único arquivo `index.html` autocontido — HTML + CSS + JavaScript inline, sem build step, sem framework, sem bundler. Tudo roda direto no navegador.
- **Backend:** Supabase (Postgres + Auth + Storage), acessado direto do navegador via `@supabase/supabase-js` (chave anônima). Multi-tenant via `transportadora_id` em cada tabela + RLS (Row Level Security) usando funções `minha_transportadora()` / `meu_papel()`.
- **Bibliotecas carregadas via CDN** (todas dentro do próprio `index.html`):
  - `@supabase/supabase-js@2` — cliente do banco
  - `jsqr@1.4.0` — leitura de QR Code pela câmera
  - `pdfjs-dist@3.11.174` — extração de texto de PDF no navegador
  - `tesseract.js@5.1.1` — OCR (leitura de texto em imagem/foto), 100% client-side
- **Uma função de servidor (Supabase Edge Function)** — `criar-motorista-automatico` — é a ÚNICA peça que não é HTML puro. Existe porque criar um login de verdade exige a chave de acesso total do banco (service role key), que nunca pode ficar no código do site. Roda hospedada no próprio Supabase.
- **Hospedagem do site:**
  - **Netlify** (`mover-ia.netlify.app`) — link original, ligado ao GitHub, publica sozinho a cada commit. **Está pausado no momento** (a conta ficou sem o crédito gratuito mensal — "operational credits" — banner vermelho no painel do Netlify avisando que produção está pausada até o próximo ciclo ou upgrade pago).
  - **GitHub Pages** (`https://theagocosta.github.io/mover-ia/`) — ativado em 24/09 como alternativa gratuita sem esse limite de crédito, publica do mesmo repositório/branch `main`. **É a opção que está funcionando agora.**
- **Repositório:** GitHub, `TheagoCosta/mover-ia`, branch `main`. Fluxo de publicação: Thiago abre o `index.html` no GitHub (editor web) → cola o conteúdo novo → "Commit changes" → publica sozinho (Netlify quando voltar, e/ou GitHub Pages).
- **Banco de dados:** Supabase, projeto em `https://otllslhjbyjtktxyvezy.supabase.co`. Migrações aplicadas via SQL Editor do próprio Supabase, uma de cada vez, em arquivos numerados (`mover-ia-schema-01...` até `-11`).

### Por que um arquivo HTML único (decisão deliberada)
O Thiago não programa, então cada entrega precisa ser algo que ele consiga copiar e colar sem ambiguidade. Um único arquivo elimina problemas de "onde colar isso" que um projeto multi-arquivo/com build traria. **Isso é uma escolha consciente para esta fase (piloto com uma transportadora)** — não necessariamente a arquitetura certa para quando o produto escalar para múltiplos clientes de verdade. Vale reavaliar (separar em módulos, adicionar build step, TypeScript, etc.) quando o Claude Code assumir o desenvolvimento, já que ele consegue editar múltiplos arquivos sem esse problema de "copiar e colar".

---

## 3. Inventário de arquivos entregues (pasta de saída desta conversa)

| Arquivo | O que é |
|---|---|
| `index.html` / `mover-ia-real.html` | **O app inteiro.** Os dois são idênticos — `index.html` é o que vai pro GitHub/produção, `mover-ia-real.html` é o "arquivo de trabalho" usado nesta conversa. Ao continuar no Claude Code, pode manter só um. |
| `arquitetura-tecnica-mover-ia.md` | Documento de arquitetura da Fase 2: modelo de dados multi-tenant, papéis de acesso, stack, integração Bsoft, segurança/retenção de documentos |
| `plano-execucao-mover-ia.md` | **Plano de execução vivo** — todas as fases, blocos, o que está feito (`[x]`) e o que falta (`[ ]`), atualizado a cada entrega. É a fonte da verdade do progresso. |
| `mover-ia-schema-01-fundacao.sql` até `-11-motorista-auto-cadastro.sql` | Migrações SQL, na ordem em que devem ser rodadas (todas já aplicadas no Supabase de produção, exceto confirmar a 11 se ainda não rodou) |
| `supabase-function-criar-motorista-automatico.ts` | Código da Edge Function que cria o login do motorista com segurança (service role key nunca sai do servidor) |
| `prototipo-transportadora.html` | O protótipo clicável original (Fase 1, dados fake) — histórico, não é mais o app real |

**Importante para o Claude Code:** o `index.html` **não está em nenhum repositório git local** nesta conversa — ele foi só copiado e colado manualmente pelo Thiago no GitHub web. O primeiro passo real do Claude Code deve ser clonar `https://github.com/TheagoCosta/mover-ia` (branch `main`) para ter o estado atual de verdade, e comparar com o `index.html` anexado aqui (podem estar ligeiramente diferentes se o Thiago fez algum ajuste manual).

---

## 4. Estado funcional atual (o que já funciona, testado com dados reais)

Testado com o motorista real Carlos Roberto Alves e documentos reais da ChavesLog:

- **Login real** (Supabase Auth) — administrador (Thiago) e motorista, com controle de acesso por papel via RLS
- **Frota real cadastrada** — 6 conjuntos completos (cavalo → carreta → dolly → carreta)
- **Checklist pré-viagem** — 22 itens reais, preenchido pelo motorista, visto pelo escritório com contagem de irregularidades
- **Jornada** — iniciar/pausar/retomar/encerrar, com motivo da parada (9 categorias), observações, assinatura por toque/mouse no encerramento, e histórico com linha do tempo completa
- **Viagem atual** — escritório cria (motorista, origem, destino, CT-e, MDF-e), motorista vê e finaliza
- **Abastecimento** — km, litros, cálculo automático de consumo médio (km/l) comparando com o abastecimento anterior do mesmo veículo
- **Documentos** — da empresa, do motorista (CNH, exames) e do veículo (CRLV):
  - Upload "inteligente": arrasta o PDF/foto, o app detecta sozinho se é CNH ou CRLV, tenta casar automaticamente com o motorista/veículo já cadastrado, sugere validade, e a pessoa só confirma
  - Leitura de texto de PDF (`pdf.js`) — funciona bem pro **CRLV** (que tem texto de verdade no PDF: placa, categoria etc.)
  - **OCR (`tesseract.js`)** — necessário pra **CNH Digital**, porque ela só tem os dados pessoais como *foto*, não como texto selecionável (descoberta feita nesta conversa, comparando os PDFs reais). O OCR lê nome, CPF, nº de registro e validade da CNH
  - Calendário de licenciamento do Detran (validade do CRLV por final de placa) — tabela editável no banco, populada com os dados reais de SP 2026 que o Thiago confirmou
  - Cadastro automático do documento sem precisar confirmar, quando a confiança é alta (nome/placa batem exato, validade confiável)
  - **Cadastro automático do motorista** (login + senha temporária, ex: `carlos.alves`) quando a CNH é de alguém que ainda não está no sistema — depende da Edge Function publicada
  - Primeiro acesso do motorista cadastrado assim: confirma CPF + troca a senha temporária obrigatoriamente

---

## 5. Problemas conhecidos / pendências técnicas (onde a conversa parou)

1. **OCR do nome na CNH ainda não é 100% confiável para todo mundo.** Funcionou bem para Carlos Roberto Alves; falhou pra outro motorista (provavelmente a foto/qualidade do PDF variando muda como o texto sai do OCR). Já foram feitas duas rodadas de correção (ler `Nº de registro`/validade pelo rótulo em vez de listar tudo; tentar extrair o nome de duas formas diferentes — por quebra de linha e por texto corrido). **Ainda não confirmado se a 2ª correção resolveu esse motorista específico** — o teste ficou pendente quando a conversa mudou de assunto pra essa documentação.
2. **Netlify pausado** por falta de crédito operacional gratuito do mês — produção não publica mais automaticamente até o Thiago fazer upgrade (pago) ou esperar o próximo ciclo de cobrança.
3. **GitHub Pages ativado como alternativa** (`https://theagocosta.github.io/mover-ia/`) e funcionando — mas é preciso lembrar que a partir de agora existem **dois lugares publicando o mesmo `index.html`** (Netlify, quando voltar, e GitHub Pages) — não é um problema, só algo a ter em mente ao dar instruções de "onde ver o resultado".
4. **Edge Function `criar-motorista-automatico`** foi publicada no Supabase (confirmado pelo Thiago), mas o fluxo completo (CNH de motorista novo → login criado → motorista faz primeiro acesso → troca senha) **nunca foi testado de ponta a ponta com sucesso** ainda.
5. **Sem verificação client-side de que a Edge Function está no ar** — se ela cair ou não estiver publicada, o app cai silenciosamente para o cadastro manual (mensagem de erro via `alert()`, nada mais sofisticado).

---

## 6. O que falta (do plano de execução, resumido — ver `plano-execucao-mover-ia.md` para a lista completa)

- **Bloco 3 (restante):** Módulo de Oficina/Manutenção (chamado, categoria/urgência/foto, status); login e telas do papel "mecânico interno"
- **Bloco 4 (não iniciado):** Dashboard do escritório com KPIs, telas de gestão completas (motoristas/veículos/jornadas/checklists/documentos), agenda de compromissos, relatório de consumo comparativo, painel de Oficina
- **Bloco 5 (adiado por decisão do Thiago):** Integração com a API do Bsoft (confirmada tecnicamente como possível, só via polling — sem webhook) — ele preferiu focar no app primeiro
- **Bloco 6:** Capacitações/treinamentos, polimento de UI, preparação para lojas (Android/iOS)
- **Fase 4 em diante:** Testes formais, piloto real com a ChavesLog, lançamento, pós-lançamento (OCR de documento em papel, notificações push, assinatura digital em comprovante de entrega, GPS — este último deliberadamente fora de escopo por enquanto)

---

## 7. Prompt pronto para colar no Claude Code

Copie o texto abaixo (dentro do bloco de código) e cole como primeira mensagem no Claude Code, dentro da pasta onde você clonou o repositório `mover-ia`.

```
Estou continuando o desenvolvimento do MOVER.IA, um SaaS multi-empresa para
transportadoras (documentação de veículo/motorista, jornada, checklist,
viagem, abastecimento). Só o Thiago (sem experiência de programação, é
quem vai testar tudo manualmente e mexer nas contas de infraestrutura) e um
Claude (antes no chat, agora você no Claude Code) trabalham nisso.

ANTES DE QUALQUER COISA: leia estes dois arquivos que estão na raiz do
projeto (ou me peça se não encontrar): `plano-execucao-mover-ia.md` (plano
de execução vivo, com tudo que já foi feito e o que falta, por fase/bloco)
e `arquitetura-tecnica-mover-ia.md` (arquitetura técnica). Também existe um
`handoff-claude-code-mover-ia.md` com o resumo de tudo que foi construído
numa conversa de chat anterior (sem terminal) — leia ele inteiro antes de
mexer em qualquer código, porque explica decisões importantes (por que é
um único arquivo HTML, por que existe uma Edge Function separada, etc.).

ARQUITETURA ATUAL (não mude sem me perguntar primeiro — foi decisão
deliberada pro estágio atual do projeto):
- Frontend: um único `index.html` autocontido (HTML+CSS+JS inline), sem
  build step, sem framework. Bibliotecas via CDN: supabase-js, jsqr,
  pdf.js, tesseract.js.
- Backend: Supabase (Postgres + Auth + Storage), acessado direto do
  navegador com a chave anônima. Multi-tenant via `transportadora_id` +
  RLS. Migrações SQL numeradas em `mover-ia-schema-01...` até `-11...`,
  todas já rodadas no Supabase de produção.
- Uma exceção ao "só HTML": a Edge Function `criar-motorista-automatico`
  (Supabase, Deno), porque criar um login de verdade exige a service role
  key, que não pode ficar no código do site.
- Hospedagem: GitHub (`TheagoCosta/mover-ia`, branch `main`) → publica pro
  Netlify (`mover-ia.netlify.app`, hoje PAUSADO por falta de crédito
  gratuito do mês) e pro GitHub Pages
  (`https://theagocosta.github.io/mover-ia/`, funcionando).

MEU FLUXO DE TRABALHO COM VOCÊ: como você tem acesso ao terminal e aos
arquivos, pode editar direto e rodar comandos — não preciso mais copiar e
colar arquivo inteiro como fazia no chat. Mas continue me avisando
claramente quando eu precisar fazer algo fora do código (rodar uma
migração SQL nova no Supabase, publicar uma Edge Function, criar uma conta,
testar algo no celular) — não presuma que eu sei o passo a passo, sou leigo
em programação.

PRIMEIRA TAREFA: [ficar de olho na pendência mais recente] o OCR de leitura
automática do nome de motorista na CNH Digital (usando tesseract.js) ainda
falhou pra um motorista, mesmo depois de duas correções. Veja a função
`extrairNomeCNH` no `index.html` e o contexto completo no
`handoff-claude-code-mover-ia.md`, seção 5. Preciso que:
1. Confirme comigo se o teste mais recente (depois da 2ª correção) já
   funcionou ou não antes de mexer mais nisso
2. Se ainda falhar, pense em outra estratégia mais robusta (ex: aumentar
   ainda mais a nitidez da imagem antes do OCR, tentar mais de uma
   configuração do tesseract, ou pedir mais um dado de confirmação manual
   só quando a confiança for baixa)

Depois disso, seguimos pelo `plano-execucao-mover-ia.md` — o próximo bloco
não iniciado é o Bloco 4 (Painel do escritório: dashboard com KPIs, telas
de gestão completas). Mas quero decidir isso com você depois de resolver o
OCR, não antes.
```

---

## 8. Coisas para o Thiago lembrar de fazer/verificar (fora do código)

- [ ] Decidir sobre o Netlify: esperar o próximo ciclo de crédito gratuito, ou fazer upgrade
- [ ] Confirmar se rodou a migração `mover-ia-schema-11-motorista-auto-cadastro.sql` no Supabase
- [ ] Confirmar se a Edge Function `criar-motorista-automatico` está publicada sem erro (checar aba "Logs" dela no Supabase depois de um teste)
- [ ] Ao trabalhar com o Claude Code, sempre indicar qual link está testando (Netlify ou GitHub Pages), porque podem estar em versões diferentes se só um dos dois foi atualizado
