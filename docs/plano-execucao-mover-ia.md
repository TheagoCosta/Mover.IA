# Plano de Execução — App MOVER.IA

**Objetivo do produto:** plataforma multi-empresa (SaaS) para transportadoras, com app do motorista e painel do escritório, cobrindo documentação de veículo/motorista/empresa, jornada, checklist, capacitações, agendamentos, documentos de viagem e integração com sistemas de TMS (iniciando pelo Bsoft).

**Como usar este documento:** é a nossa referência única de acompanhamento. Cada tarefa tem uma caixa de marcação — a cada sessão de trabalho, atualizamos o status e revisamos "Próximos passos imediatos" no final. Quando uma fase muda de status, atualizamos o quadro-resumo abaixo.

---

## Quadro-resumo das fases

| Fase | Nome | Status | Duração estimada |
|---|---|---|---|
| 0 | Fundação e decisões | 🟢 Concluída | 1–2 semanas |
| 1 | Design (UX/UI) | 🟢 Concluída | 2–3 semanas |
| 2 | Arquitetura técnica | 🟡 Em andamento | 2 semanas |
| 3 | Desenvolvimento do MVP | ⚪ A fazer | 8–12 semanas |
| 4 | Testes | ⚪ A fazer | 2–3 semanas |
| 5 | Piloto com transportadora real | ⚪ A fazer | 4–6 semanas |
| 6 | Lançamento | ⚪ A fazer | contínuo |
| 7 | Evolução pós-lançamento | ⚪ A fazer | contínuo |

Legenda: ⚪ A fazer · 🟡 Em andamento · 🟢 Concluído · 🔴 Bloqueado

---

## Fase 0 — Fundação e decisões

**Objetivo:** fechar todas as decisões que mudam a arquitetura do projeto, para não precisar refazer trabalho depois.

- [x] Definir público (motorista + escritório) e funcionalidades principais
- [x] Validar conceito com protótipo navegável
- [x] **Confirmar com a Bsoft**: integração via API confirmada ✅ — modo definido: **consulta periódica (polling)**, não há webhook de eventos
- [x] Definir modelo de negócio: 3 planos (Essencial, Profissional, Enterprise), com mensalidade fixa incluindo uma franquia de motoristas + usuários do escritório, e cobrança por usuário adicional acima da franquia (ver tabela em "Modelo de negócio — planos")
- [x] Definir se o app nasce multi-empresa desde o MVP ou se valida primeiro com uma transportadora e generaliza depois → **decidido: base multi-empresa desde o início, testando primeiro com a transportadora atual**
- [x] Levantar exigências de LGPD — dados sensíveis identificados: CNH, CPF, exames toxicológicos/ASO, endereços, entre outros. Plano de conformidade definido (ver seção "Plano de conformidade com a LGPD")
- [x] Fechar lista definitiva de funcionalidades do MVP (ver "Escopo do MVP" abaixo)
- [x] Definir nome final, identidade visual e domínio do produto → **decidido: MOVER.IA — "Gestão para quem move o Brasil"**. Disponibilidade confirmada no INPI. Identidade visual: amarelo como cor principal, complementado com tons pastéis. Domínio sugerido: `mover.ia.br` (extensão brasileira nova, voltada a projetos de IA) ou `moveria.com.br` como alternativa

### Decisão registrada — multi-empresa
Confirmado: a base de dados nasce **multi-tenant desde o início** (cada registro vinculado a uma transportadora), mas o sistema roda em produção **só com a transportadora atual** até o piloto ser validado. Isso está refletido na Fase 2 (modelagem) e na Fase 5 (piloto).

**Transportadora piloto definida:** Chaves & Ardito Ltda (ChavesLog Transportes) — CNPJ 02.499.966/0001-40, RNTRC/ANTT 000808225, registro IBAMA 999183. Documentos da empresa (ANTT, Cartão CNPJ, licença IBAMA) e a relação de frota/agregados já foram recebidos e usados para popular o protótipo com dados reais da operação (placas, motoristas, logo). **Nota de LGPD:** propositalmente **não** foram incluídos no protótipo CPF, RG, número de CNH ou telefone dos motoristas — só nome e placa, que já bastam para o protótipo parecer real. Isso porque o protótipo é um arquivo estático (HTML) que pode circular por e-mail/chat sem controle de acesso; dado sensível de verdade só deve existir dentro do sistema real, com banco de dados, autenticação e controle de acesso por papel (isso é trabalho da Fase 2/3, não do protótipo).

### Modelo de negócio — planos

| | Essencial | Profissional | Enterprise |
|---|---|---|---|
| Mensalidade | R$ 1.000/mês | R$ 2.200/mês | R$ 4.500/mês |
| Motoristas inclusos | até 5 | até 15 | até 40 |
| Usuários do escritório inclusos | até 3 | até 5 | até 10 |
| Motorista adicional | R$ 100/mês | R$ 90/mês | R$ 75/mês |
| Usuário de escritório adicional | R$ 180/mês | R$ 160/mês | R$ 130/mês |
| Integração com TMS (Bsoft) | incluída | incluída | incluída |
| Relatórios completos + exportação (Excel, PDF) | incluído | incluído | incluído |
| Múltiplas filiais/unidades | — | — | incluído |
| Suporte | padrão | prioritário | gerente de conta dedicado |
| Taxa de implantação | sem cobrança na fase inicial (ver nota) | sem cobrança na fase inicial (ver nota) | sem cobrança na fase inicial (ver nota) |

*Cobrança por usuário cadastrado (motorista/usuário de escritório), não por acesso/login — isso não penaliza o uso diário do sistema, que é o que dá valor ao produto.*

*Mecânico interno (papel de acesso à Oficina): conta dentro da franquia de "usuários do escritório" do plano, não é uma categoria de cobrança separada.*

*Relatórios: todos os planos têm acesso ao relatório completo (jornada, checklist, documentos, consumo), com exportação no formato mais adequado a cada tipo de dado — Excel/CSV para dados tabulares (consumo, jornadas), PDF para documentos e comprovantes.*

*Taxa de implantação: removida por enquanto para não afastar os primeiros clientes durante a validação do produto. Vale reavaliar reintroduzi-la (ex: para novos clientes) depois que o onboarding estiver mais maduro e o produto já tiver casos de sucesso comprovados.*

### Plano de conformidade com a LGPD

Dados sensíveis identificados: CNH, CPF, exames toxicológicos, ASO, endereços, entre outros dados pessoais dos motoristas.

- [ ] Mapear todos os dados que o sistema coleta e marcar quais são "dados sensíveis" (saúde: exame toxicológico, ASO)
- [ ] Definir a base legal para tratar cada dado (geralmente "cumprimento de obrigação legal/regulatória" ou "execução de contrato de trabalho")
- [ ] Escrever política de privacidade clara, acessível dentro do próprio app
- [ ] Aplicar controle de acesso por papel (motorista só vê os próprios dados; escritório só vê dados da própria transportadora) — já previsto na arquitetura multi-tenant
- [ ] Definir por quanto tempo guardar cada tipo de documento (prazos legais de guarda trabalhista/fiscal, geralmente 5 anos)
- [ ] Formalizar contratos com fornecedores (Bsoft, provedor de nuvem/storage) com cláusulas de proteção de dados (DPA)
- [ ] Ter um plano simples de resposta a incidentes (o que fazer em caso de vazamento, quem comunica a ANPD e os titulares)
- [ ] Consultar um advogado especializado em LGPD antes do piloto — recomendado dado o volume de dados de saúde envolvido

*Aviso: isso é uma visão geral prática para planejamento, não uma análise jurídica formal.*

### Escopo do MVP (sugestão para validar com você)
**Entra no MVP:**
- Cadastro de motoristas, veículos e documentos (upload manual)
- Checklist pré-viagem
- Controle de jornada
- Documentos de viagem (CT-e, MDF-e, NF-e) via integração com a API do Bsoft ✅ confirmada
- Download de documentos (motorista e escritório)
- Exportação de relatórios completos em Excel/CSV (dados tabulares como consumo e jornadas) e PDF (documentos e comprovantes) — incluída em todos os planos
- Painel do escritório com alertas de vencimento
- **Abastecimentos e média de consumo**: motorista registra cada abastecimento (data, placa, km do veículo, odômetro da bomba, litros, motorista) pelo app; sistema calcula automaticamente o consumo médio (km/l) por veículo e por período, visível para o motorista e para o escritório
- **Oficina / Manutenção**: motorista registra um chamado quando identifica algo a ser reparado no veículo (categoria, urgência, descrição, foto); a equipe de manutenção acompanha e atualiza o andamento com observações e fotos do reparo — se for **interna**, o mecânico tem um papel próprio de acesso ao app (só chamados + listagem de placas/conjuntos/motoristas, sem acesso a documentos); se for **terceirizada**, o escritório atualiza o chamado em nome da oficina externa

**Fica para depois do MVP:**
- Integração automática com Bsoft (entra assim que a API for confirmada — pode rodar em paralelo)
- OCR de documentos em papel (começa manual: motorista tira foto, escritório confere)
- Multi-empresa self-service (cadastro automático de novas transportadoras sem intervenção manual)
- Capacitações com trilha de certificação / prazos automatizados
- App para múltiplos idiomas, relatórios avançados, integrações com outros TMS
- **Rastreamento por GPS via celular do motorista** — avaliado e **deixado de lado por enquanto**. Se retomado depois, a recomendação é rastrear só durante a jornada ativa (não o dia todo), por questão de bateria e de LGPD (geolocalização de funcionário é dado sensível à parte, com jurisprudência trabalhista própria). Vale considerar como complemento a um rastreador veicular dedicado, não substituto — o celular depende do motorista manter o app aberto e o aparelho carregado, o que não garante a mesma robustez para fins de segurança/antirroubo

---

## Fase 1 — Design (UX/UI)

**Objetivo:** transformar o protótipo em telas completas e validadas, prontas para virar código.

- [x] Desenhar as telas de **login e cadastro do motorista** (entrar, criar conta vinculada à transportadora, recuperar senha) e a tela de **notificações** (sino no início do app + lista de avisos), já incorporadas ao protótipo
- [x] Desenhar as telas do painel do escritório que faltavam: **Configurações** (dados da empresa, plano contratado e franquia em uso), **Usuários** (convite e listagem de acessos do escritório, incluindo o papel de mecânico) e **Integração** (status da sincronização com o Bsoft, frequência de polling, histórico)
- [x] Desenhar o fluxo de **onboarding de transportadora** (assistente em 4 passos: dados da empresa, plano, administrador responsável, confirmação — acessível pelo seletor de transportadora no painel, já reforçando o modelo multi-tenant)
- [x] Desenhar o fluxo de **upload manual + revisão** de documento em papel (com leitura simulada via OCR)
- [x] Desenhar a tela de **registro de abastecimento** (placa, km, odômetro da bomba, litros, motorista, média calculada) e o **relatório de consumo médio** por veículo (motorista e escritório)
- [x] Desenhar o módulo de **Oficina / Manutenção**: motorista abre chamado (categoria, urgência, descrição, foto); mecânico interno atualiza com observação do conserto e fotos, dentro do próprio app (papel de acesso restrito — só chamados e listagem de frota); escritório acompanha tudo e atualiza em nome da oficina externa quando terceirizada
- [x] Aplicar identidade visual definitiva (logo MOVER.IA, paleta amarelo + tons pastéis) no protótipo
- [x] Reconstruir o checklist com a estrutura real usada pela transportadora (Opção 03 — GRANEL, com padrão esperado e resposta em 3 estados)
- [x] Definir sistema de design final (cores, tipografia, componentes reutilizáveis, regras de marca/white-label) — formalizado em documento vivo (design system), extraído diretamente do protótipo
- [x] Teste rápido de usabilidade com motoristas reais da ChavesLog — protótipo testado direto no celular (link publicado, sem precisar de computador) e **aprovado**
- [x] Ajustar telas com base no feedback — checklist sem a referência interna "Opção 03 — GRANEL", ordem do conjunto corrigida (cavalo → carreta → dolly → carreta), botão de urgência "Média" corrigido para ficar neutro (cinza) quando não selecionado

**Entregável desta fase:** protótipo navegável completo e validado, pronto para servir de referência ao desenvolvimento.

---

## Fase 2 — Arquitetura técnica

**Objetivo:** decidir como o sistema vai ser construído por dentro, antes de escrever código de produção.

- [ ] Modelar o banco de dados multi-tenant (transportadora, motorista, veículo, documento, jornada, checklist, viagem, agendamento, **abastecimento**, **chamado de manutenção** — todos vinculados a `transportadora_id`)
- [ ] Modelar o cálculo de consumo médio (litros abastecidos ÷ km rodados entre abastecimentos, por veículo)
- [ ] Modelar o papel de acesso "mecânico" (permissão restrita: só módulo de Oficina + listagem de frota, sem acesso a documentos ou dados pessoais do motorista) dentro do controle de permissões por papel
- [ ] Definir a stack técnica:
  - Backend/API: (ex: Node.js + PostgreSQL)
  - App do motorista: (ex: React Native ou Flutter, para publicar em Android e iOS a partir de uma base de código)
  - Painel do escritório: aplicação web (ex: React/Next.js)
  - Armazenamento de arquivos/documentos: serviço de storage em nuvem (ex: S3 ou equivalente)
- [ ] Desenhar a camada de integração com TMS (começando pelo Bsoft, já pensada para plugar outros TMS no futuro sem redesenhar tudo)
- [ ] Definir estratégia de autenticação e permissões (motorista só vê os próprios dados; escritório só vê dados da própria transportadora; papéis: motorista, escritório, admin da transportadora, **mecânico interno** — acesso restrito a chamados de manutenção e listagem de frota, sem ver documentos)
- [ ] Definir política de retenção e segurança de documentos (criptografia em repouso, quem pode ver o quê, tempo de guarda dos documentos por exigência legal)
- [ ] Definir infraestrutura (provedor de nuvem, ambiente de produção/homologação, CI/CD para publicar atualizações)
- [ ] Documentar tudo isso num documento técnico curto (para qualquer desenvolvedor entrar e entender rápido)

**Entregável desta fase:** desenho técnico da arquitetura + modelo de dados, pronto para o time começar a programar.

---

## Fase 3 — Desenvolvimento do MVP

**Objetivo:** construir a primeira versão funcional, usável pela transportadora piloto.

Sugiro quebrar em sprints de 2 semanas. Ordem sugerida (cada bloco depende do anterior):

### Bloco 1 — Fundação do sistema
- [x] Contas criadas (GitHub e Supabase) e projeto `mover-ia` conectado
- [x] Estrutura do banco de dados multi-tenant criada (script `mover-ia-schema-01-fundacao.sql`) — todas as tabelas + regras de acesso por transportadora/papel, rodado com sucesso no Supabase
- [x] Primeiro login real criado e vinculado (Thiago, `admin_transportadora`, ChavesLog Transportes) — confirmado via `mover-ia-schema-02-chaveslog-e-admin.sql`
- [x] Frota real cadastrada (6 conjuntos completos: cavalo → carreta → dolly → carreta) e checklist padrão com os 22 itens reais da ChavesLog — script `mover-ia-schema-03-frota-e-checklist.sql`
- [x] Bug de recursão nas regras de segurança corrigido (`mover-ia-schema-04-fix-recursao.sql`)
- [x] **Primeira tela real funcionando ponta a ponta** — login autenticado (Supabase Auth) → banco de dados real (com as regras de acesso por transportadora aplicadas) → tela mostrando frota e checklist reais da ChavesLog. Testado e aprovado no computador e no celular (`mover-ia-real.html`, hospedado via Netlify)
- [x] **Primeiro login de motorista real criado e testado** (Carlos Roberto Alves) — tela própria do motorista, diferente da do escritório: mostra "Meu conjunto" (GKH-1B12 → FIJ-7F46 → FQQ-1I56 → GJO-5C04, na ordem certa) e o checklist padrão. Confirma que o controle de acesso por papel está funcionando (motorista não vê as abas do escritório)
- [ ] Repetir o cadastro de login para os outros 5 motoristas quando formos colocar mais gente pra testar
- [ ] Construir o restante das telas (Blocos 2 a 6) conectadas a este mesmo banco

### Nota técnica importante (22–23/09)
Publicar como "Artifact" do Claude (a vitrine usada para o protótipo) **não funciona** para telas que precisam falar com o banco de dados real — por segurança, essa vitrine bloqueia chamadas para serviços externos como o Supabase. Por isso, toda tela conectada ao banco real é publicada fora dela.

**Hospedagem definitiva resolvida:** repositório `mover-ia` no GitHub conectado ao Netlify — link fixo **https://mover-ia.netlify.app**. Fluxo de atualização daqui pra frente: eu mando o arquivo atualizado → você substitui o `index.html` no GitHub (Add file > Upload files) → o Netlify publica sozinho, sempre no mesmo link, sem gerar link novo.

### Bloco 2 — Documentos e upload
- [x] Espaço de armazenamento de arquivos criado (bucket privado no Supabase Storage), com regra de que cada transportadora só acessa os próprios arquivos (`mover-ia-schema-05-storage-documentos.sql`)
- [x] Documentos reais da empresa cadastrados (ANTT/RNTRC, Cartão CNPJ, IBAMA, AET) com status de validade (`mover-ia-schema-06-documentos-empresa.sql`)
- [x] Tela de Documentos no app real — lista os documentos com status (em dia / vence em breve / vencido), anexar arquivo (upload real) e ver arquivo (link temporário e seguro, 5 min). **Testado e validado**: upload do PDF real da licença IBAMA e visualização funcionando
- [ ] Documentos de motorista e de veículo — **código pronto, aguardando teste**: no Painel, o escritório agora cadastra documentos de qualquer motorista (CNH, exames) ou veículo (CRLV, licenciamento), além dos da empresa. O motorista vê os seus próprios em "Meus documentos" e os do conjunto que dirige em "Documentos do conjunto", podendo anexar/ver o arquivo igual já fazia com os documentos da empresa
- [ ] Alertas de vencimento (painel dedicado, hoje o status já aparece por documento)
- [ ] Leitura de QR Code em documentos (CRLV, CNH etc.) — cada documento cadastrado tem um botão "Escanear QR Code" que abre a câmera do celular, lê o código e salva o conteúdo lido junto do documento
- [ ] Leitura automática de validade do PDF — ao anexar um PDF em qualquer documento, o app lê o texto, encontra as datas que aparecem nele e mostra como opções para o usuário tocar e confirmar qual é a validade
- [ ] Upload inteligente de documento (arrastar e soltar) — **código pronto, aguardando teste**: a tela de Documentos agora começa com uma área para arrastar o PDF (ou tocar para selecionar). O app lê o texto, reconhece se é CNH (motorista) ou CRLV (veículo), casa automaticamente o nome ou a placa com quem já está cadastrado, sugere a validade — e a pessoa só confirma (ou ajusta) num cartão antes de salvar. O cadastro manual foi tirado da tela principal para não poluir — agora é um botão "Cadastrar documento manualmente" que leva pra uma tela separada, só para quando o app não conseguir identificar sozinho
- [ ] Calendário de licenciamento do Detran (validade do CRLV por final de placa) — **código pronto, aguardando teste**: cadastrada a tabela 2026 de São Paulo para caminhão/cavalo mecânico que o Thiago confirmou (final 1 e 2 → set, final 3/4/5 → out, final 6/7/8 → nov, final 9/0 → dez). Quando o app reconhece um CRLV e identifica o veículo, mostra essa data como sugestão de validade (além das datas achadas no texto do PDF). É uma tabela editável no banco — quando o Detran mudar os meses (o que costuma acontecer todo ano), é só atualizar lá, sem precisar mexer no código. *Ainda não tem uma telinha no app para editar isso — por enquanto, só eu (via SQL) consigo atualizar; podemos criar uma tela de Configurações para isso depois, se for útil*

### Bloco 3 — Operação diária
- [x] Controle de jornada (início/pausa/fim) — motorista vê um card "Jornada" com o status atual e os botões certos para cada momento (Iniciar → Pausar/Encerrar → Retomar/Encerrar); cada ação fica registrada no histórico (`jornada_evento`). **Testado ponta a ponta**: Carlos passou pelos 4 estados (iniciar, pausar, retomar, encerrar) e tudo bateu certo
  - [x] Histórico de jornadas — tela com as últimas 20 jornadas encerradas do motorista, com data, horário de início/fim e duração total
  - [ ] Motivo da parada + assinatura do motorista — **código pronto, aguardando teste**: baseado no modelo real de ficha de jornada que o Thiago enviou. Ao "Registrar parada", o motorista escolhe o motivo (parado na garagem, no posto, chegada/em carregamento, chegada/em descarga, pausa para alimentação, pausa para manutenção, outro) e pode adicionar uma observação. Ao encerrar a jornada, tem um campo de observação final e uma assinatura feita com o dedo/mouse na tela (fica salva com a jornada). O histórico de jornadas agora é clicável e mostra a linha do tempo completa de cada jornada (todos os eventos com horário e motivo) e a assinatura
  - Requer rodar o script `mover-ia-schema-08-jornada-eventos.sql` antes de publicar o código novo
- [x] Checklist pré-viagem real — motorista preenche os 22 itens (Atende / Não atende / N/A) no celular, salva de verdade no banco; escritório vê os checklists recebidos no Painel, com contagem de irregularidades por envio. **Testado ponta a ponta**: Carlos enviou do celular, apareceu no painel do Thiago com a irregularidade sinalizada
- [ ] Viagem atual (dados + documentos vinculados) — **código pronto, aguardando teste**: escritório cria a viagem no Painel (motorista, origem, destino, CT-e, MDF-e); motorista vê a viagem atual na tela dele e pode finalizar. (Documentos vinculados por enquanto são só os números de CT-e/MDF-e digitados — anexo de arquivo por viagem fica para quando a integração com o Bsoft estiver pronta)
- [ ] Registro de abastecimento (placa, km do veículo, odômetro da bomba, litros, motorista) e cálculo automático de consumo médio — **código pronto, aguardando teste**: motorista registra km e litros na tela dele; sistema calcula o consumo médio (km/l) comparando com o abastecimento anterior do mesmo veículo; escritório vê os últimos abastecimentos de toda a frota no Painel
- [x] Módulo de Oficina/Manutenção: motorista abre chamado (categoria, urgência, descrição, foto); acompanhamento de status (aberto/andamento/concluído) — 29/09, **testado e aprovado** com motorista e mecânico reais
- [x] Login e telas do **mecânico interno**: papel de acesso restrito no mesmo app (só Oficina + listagem de frota — placas, conjuntos, motoristas), com campo de observação do conserto e anexo de fotos, sem acesso a documentos ou dados pessoais — 29/09, **testado e aprovado** com motorista e mecânico reais

### Atualização 29/09 — sessão no Claude Code
- [x] OCR da CNH corrigido para o modelo antigo (DENATRAN) + conferência do CPF pelos dígitos + tela de conferência quando a leitura é incerta. Testado com a CNH real da Mirian
- [x] Fluxo completo de cadastro automático testado de ponta a ponta (CNH → login criado → 1º acesso com CPF e troca de senha)
- [x] Login do motorista só com o login (ex: `mirian.custodio`), sem precisar do e-mail interno
- [x] App dividido em arquivos (`css/`, `js/`, `img/`) — sem build, publica igual no GitHub Pages
- [x] Claude conectado direto ao Supabase (conector oficial) — migrações agora ficam em `supabase/migrations/`
- [x] **Regras de acesso por papel** (LGPD): motorista só vê o que é dele (jornadas, abastecimentos, CPF/CNH), mecânico sem documentos, gestão vê tudo. Testado simulando cada usuário
- [x] **Etapa 1 da reconstrução conforme o protótipo**: escritório com menu lateral e as 13 seções do protótipo (dados reais; Oficina, Capacitações, Agenda e Usuários só leitura por enquanto; Integração "em breve"); app do motorista no visual do protótipo (abas, medidor de direção contínua de 5h30, linha do tempo da jornada, documentos em abas Meus/Veículo/Empresa)
- [x] Status dos documentos agora é calculado pela validade (vencido / vence em 30 dias / em dia), não mais marcado à mão
- [x] **Etapa 3 — Oficina + app do mecânico** (feita antes da etapa 2, por escolha do Thiago): motorista abre chamado (veículo, categoria, urgência, descrição, foto) e acompanha; app do mecânico (Chamados: iniciar reparo, observação, foto do reparo, concluir · Frota: placas, conjuntos, motoristas, sem documentos); seção Oficina do escritório com as mesmas ações (oficina terceirizada), abrir chamado e exportar planilha; cadastro de mecânico em Usuários (login criado sozinho). Fotos reduzidas no celular antes de enviar, em bucket privado `oficina`. Migração `supabase/migrations/20260929_02_oficina.sql`
- Próximas etapas combinadas: 2) completar Bloco 4 (cadastros e edição pelo painel: vincular conjunto, editar empresa etc.) · 4) agenda, capacitações, notificações, convite de usuários do escritório

### Bloco 4 — Painel do escritório
- [x] Dashboard com KPIs e alertas (29/09 — motoristas, conjuntos, checklists irregulares, documentos vencendo, horas de condução da semana)
- [x] Telas de gestão: motoristas, veículos, jornadas, checklists, documentos (29/09 — consulta, detalhes e exportação para Excel; falta cadastrar/editar pelo painel)
- [ ] Agenda de compromissos (revisões, exames, treinamentos)
- [ ] Relatório de consumo médio por veículo e por motorista (comparativo, evolução no tempo, alerta de consumo fora do padrão)
- [x] Painel de Oficina: todos os chamados da frota, ação de avançar status, observação do reparo e fotos anexadas, exportação (29/09)

### Bloco 5 — Integração Bsoft *(API confirmada ✅ — pode andar em paralelo aos blocos acima)*
- [ ] Autenticação com a API do Bsoft
- [ ] Sincronização de viagens/CT-e/MDF-e
- [ ] Vínculo automático por placa/CPF
- [ ] Painel de status da sincronização

### Bloco 6 — Capacitações e polimento
- [ ] Tela de capacitações/treinamentos
- [ ] Ajustes finais de UI, performance, mensagens de erro
- [ ] Preparação para publicação nas lojas (Android/iOS)

**Entregável desta fase:** app funcional rodando em ambiente de testes, cobrindo todo o MVP.

---

## Fase 4 — Testes

- [ ] Testes internos de funcionalidade (o time testa cada tela)
- [ ] Testes de carga básicos (sistema aguenta o uso real da frota?)
- [ ] Teste com 2–3 motoristas reais usando o app no dia a dia por alguns dias
- [ ] Correção dos problemas encontrados
- [ ] Checklist de segurança (dados isolados corretamente entre transportadoras, download só de quem tem permissão)

---

## Fase 5 — Piloto com transportadora real

- [ ] Colocar a transportadora piloto (a sua) usando o sistema em produção, com dados reais
- [ ] Acompanhar de perto por 4–6 semanas (suporte direto, ajustes rápidos)
- [ ] Validar a integração com Bsoft em condição real (se já estiver pronta)
- [ ] Coletar feedback estruturado do escritório e dos motoristas
- [ ] Priorizar e implementar ajustes críticos identificados no piloto

---

## Fase 6 — Lançamento

- [ ] Fechar fluxo de onboarding self-service para novas transportadoras (ou processo assistido, se preferirem começar assim)
- [ ] Publicar o app nas lojas (Google Play e App Store)
- [ ] Preparar material de apoio (guia rápido para motorista, guia para o escritório)
- [ ] Definir canal de suporte (WhatsApp, e-mail, chat)
- [ ] Abrir para as próximas transportadoras

---

## Fase 7 — Evolução pós-lançamento

Backlog de ideias já discutidas, para priorizar depois do lançamento:
- [ ] OCR automático de documentos em papel
- [ ] Integração com outros TMS além do Bsoft
- [ ] Relatórios e indicadores avançados para o escritório
- [ ] Notificações push (vencimentos, novas viagens, checklist pendente)
- [ ] Assinatura digital no comprovante de entrega
- [ ] Rastreamento por GPS via celular do motorista (avaliado na Fase 0, deixado de lado por enquanto — ver nota em "Escopo do MVP")

---

## Papéis necessários para tocar o projeto

**Decisão registrada (22/09):** sem contratação de desenvolvedores por enquanto — o sistema será construído por **Thiago + Claude**, sem depender de mais ninguém para o piloto. Ver "Como vamos construir, só nós dois" logo abaixo para como isso funciona na prática.

| Papel | Função | Observação |
|---|---|---|
| Dono do produto | Decide prioridades, valida entregas, é a ponte com a transportadora piloto | Você |
| Design UX/UI | Telas, fluxos, sistema de design | Feito (Fase 1) |
| Desenvolvedor backend | API, banco de dados, integração Bsoft | Eu escrevo o código; você cria as contas de infraestrutura que eu indicar |
| Desenvolvedor mobile | App do motorista | Eu escrevo o código; testado direto no celular via Expo Go, como foi feito com o protótipo |
| Desenvolvedor web | Painel do escritório | Eu escrevo o código |
| QA / testes | Testar antes de cada entrega | Você testa cada entrega como fez com o protótipo — funciona, não funciona, o que muda |

---

## Riscos e dependências a monitorar

| Risco | Impacto | Como mitigar |
|---|---|---|
| Bsoft opera só por polling (sem webhook) | Sincronização não é instantânea — depende da frequência de consulta definida (ex: a cada 3–5 min) | Definir frequência de polling na Fase 2 equilibrando atualidade x limite de requisições da API |
| Documentos em papel sem OCR no MVP | Mais trabalho manual no início | Aceitável para o piloto; entra na Fase 7 |
| LGPD — dados sensíveis de motoristas | Risco legal/reputacional | Levantar exigências na Fase 0, antes de programar |
| Tempo de aprovação nas lojas (Apple/Google) | Pode atrasar o lançamento | Iniciar cadastro de desenvolvedor nas lojas com antecedência (Fase 3) |

---

## Próximos passos imediatos

A Fase 0 e a Fase 1 estão **concluídas** 🟢🟢. O protótipo foi testado direto no celular com motoristas reais da ChavesLog (via link, sem precisar de computador) e **aprovado**, com os ajustes de feedback já aplicados (checklist sem a referência interna "GRANEL", ordem do conjunto cavalo → carreta → dolly → carreta, botão de urgência "Média" neutro quando não selecionado). O design system foi formalizado. O rastreamento por GPS segue deixado de lado por enquanto (Fase 7).

Como pendências administrativas, que seguem em paralelo e não bloqueiam o desenvolvimento:

1. Registrar o domínio (`mover.ia.br` ou `moveria.com.br`) antes que outra pessoa registre.
2. Iniciar o processo formal de registro de marca no INPI (a disponibilidade foi confirmada, mas o registro em si leva tempo — vale entrar com o pedido cedo).

**Agora entramos na Fase 2 (Arquitetura técnica).** É aqui que o projeto sai de tela clicável para virar sistema de verdade — com banco de dados, backend e autenticação real (ver "Do protótipo ao piloto real" abaixo para o que isso muda na prática). Entregável desta fase: `arquitetura-tecnica-mover-ia.md`, cobrindo modelo de dados multi-tenant, papéis de acesso, stack técnica recomendada, integração com o Bsoft, segurança/retenção de documentos e infraestrutura — já iniciado.

### Do protótipo ao piloto real — login, API e quando começar

O protótipo **simula** login e cadastro, mas simular não é o mesmo que funcionar de verdade: hoje, se dois motoristas diferentes "logarem", os dois veem os mesmos dados de exemplo, porque não existe banco de dados nem servidor por trás. Para um piloto operacional real — motoristas usando o app no dia a dia, com login próprio e dados persistindo — é preciso sair do protótipo e construir o sistema de verdade: banco de dados multi-tenant, backend com autenticação (senha com hash, sessão/token), telas conectadas a esse backend em vez de dados de exemplo, e hospedagem em nuvem. Isso é exatamente o que a Fase 2 (arquitetura, em andamento) e o Bloco 1 da Fase 3 (construção da fundação) endereçam.

### Como vamos construir, só nós dois

Não há desenvolvedor contratado, então a divisão é: **eu escrevo todo o código** (backend, banco de dados, apps, painel); **você cria as contas gratuitas** que eu for indicando (são só cliques, tipo criar uma conta de e-mail) e **testa cada entrega no seu celular/computador**, exatamente como já fez com o protótipo — o mesmo padrão que já funcionou até aqui.

Diferença importante em relação ao protótipo: este chat/sessão é temporário (fecha quando ficamos um tempo sem conversar). Um sistema de verdade — com login real e dados persistindo — precisa ficar rodando 24h em algum lugar, então algumas peças vão morar em serviços de nuvem gratuitos (até a operação crescer e virar custo real):

| Peça | Serviço sugerido | Por quê |
|---|---|---|
| Código-fonte (histórico de tudo que construímos) | GitHub | Onde o código fica guardado e versionado, grátis |
| Banco de dados + login/autenticação + armazenamento de arquivos | Supabase | Resolve banco de dados, login e upload de documentos numa conta só, com painel visual (dá pra você olhar os dados sem programar), plano grátis generoso |
| Painel do escritório (site) | Vercel | Publica o painel com um link, grátis, atualiza sozinho a cada mudança |
| App do motorista/mecânico | Expo | Permite testar no celular real via QR code (como fizemos com o link do protótipo), sem precisar publicar na loja ainda |

Essa combinação foi escolhida por ser a que menos exige de quem nunca programou — a maior parte da configuração é feita através de telas, não linha de comando, e tudo tem plano gratuito suficiente para o piloto com a ChavesLog.

**Próxima ação concreta:** criar as duas primeiras contas (GitHub e Supabase) para eu poder começar o Bloco 1 da Fase 3 (fundação: banco de dados + login real). Passo a passo logo a seguir, na resposta.
