# Especificação Consolidada — Sistema de Gestão Agropecuária
## Livestock Control (Gestão de Rebanho + Controle Regulatório/Financeiro)

**Documento único de referência para o time de desenvolvimento**
Versão: 2.0 (consolida MVP validado + especificação de produção + novos módulos regulatórios/financeiros)

> Este documento substitui e consolida os dois briefings anteriores (`briefing-tecnico-sistema-gestao-rebanho.md` e `briefing-webapp-producao-area-logada.md`), incorporando os novos módulos de controle de GTA, saldo de rebanho por espécie, entradas/saídas (compra e venda), controle financeiro (insumos/despesas) e declaração anual à Secretaria de Agricultura.
>
> **Decisão de projeto importante:** o código construído no protótipo Bolt.new **não será reaproveitado**. Este documento funciona como especificação funcional e de modelo de dados de referência (o MVP validou as regras de negócio com uso real), mas a implementação será um **projeto novo, do zero, em repositório Git próprio**, desenvolvido com **Claude Code dentro do ambiente Antigravity**. Ver seção 10 para o plano de implementação greenfield.

---

## 1. Visão Geral do Produto

Webapp de gestão agropecuária para produtores rurais, com dois grandes eixos funcionais:

**Eixo 1 — Gestão de desempenho individual (já validado em MVP)**
Controle de animais individuais (hoje bovinos), pesagens, GMD, organização em lotes de manejo e comparativo de desempenho entre lotes.

**Eixo 2 — Gestão de rebanho, compliance e financeiro (novo escopo, este documento)**
Controle de saldo de rebanho por espécie (bovinos, suínos, aves, equinos, muares, ovinos, caprinos e abelhas — ver taxonomia completa na seção 3.2), rastreamento de GTAs (Guia de Trânsito Animal), registro de compras e vendas (com nota/contranota) e gestão da Declaração Anual de Rebanho junto à Secretaria Estadual de Agricultura.

**Plataforma:** aplicação web (webapp), acessível via navegador desktop e mobile (responsivo). Não é um app nativo. Recomenda-se avaliação futura de PWA com suporte offline, dado o contexto de uso em campo com conectividade limitada — mas isso é evolução, não escopo inicial.

### Por que os dois eixos coexistem
O Eixo 1 já resolve o "quanto esse boi específico está ganhando de peso". O Eixo 2 resolve uma pergunta diferente e igualmente crítica para o produtor: **"quantos animais eu tenho oficialmente, de cada espécie e faixa etária, e isso bate com o que está declarado ao Estado?"** — essa é a lógica que already existe nos sistemas oficiais de defesa agropecuária (GTA, Declaração Anual de Rebanho), que os prints de referência mostram. O sistema deve replicar essa lógica internamente, dando ao produtor uma visão unificada e antecipada do que ele precisaria consultar em portais governamentais separados.

---

## 2. Stack Tecnológica

| Camada | Tecnologia |
|---|---|
| Frontend | React 18 + TypeScript + Vite |
| Roteamento | react-router-dom (rotas nomeadas — obrigatório em produção, ver seção 8) |
| Estilização | Tailwind CSS + shadcn/ui |
| Ícones | lucide-react |
| Estado servidor / cache | @tanstack/react-query |
| Formulários e validação | react-hook-form + zod |
| Backend / Banco | Supabase (PostgreSQL gerenciado) |
| Autenticação | Supabase Auth (email/senha) |
| Armazenamento de arquivos | **Supabase Storage** (novo requisito — buckets para PDFs de declaração anual) |
| Notificações UI | sonner (toasts) |
| Gráficos (roadmap) | recharts ou similar, para dashboards e séries temporais |
| Hospedagem recomendada | Vercel/Netlify (frontend) + Supabase (backend gerenciado) |
| Ambiente de desenvolvimento | Claude Code, dentro do Antigravity |
| Controle de versão | Repositório Git novo (não há reaproveitamento de código do protótipo Bolt.new) |
| Ambiente de prototipagem/validação funcional (referência, não código) | Bolt.new — usado apenas para validar modelo de dados e regras de negócio; código não é reaproveitado |

---

## 3. Modelo de Dados

### 3.1 Domínio já existente (Eixo 1 — Gestão individual)

**`usuarios`** — id (=auth.users.id), nome, email, timestamps
**`fazendas`** — id, usuario_id (FK), nome, timestamps
**`lotes`** — id, fazenda_id (FK), nome, descricao, data_inicio, data_fim, ativo, timestamps
**`animais`** — id, fazenda_id (FK), lote_id (FK, nullable), identificacao, data_nascimento, sexo, peso_inicial_kg, peso_atual_kg, gmd_medio_kg, ultima_pesagem_data, ativo, **status** (`ativo`/`venda`/`morte`/`baixa`), timestamps
**`pesagens`** — id, animal_id (FK), data_evento, peso_kg, created_at

Views: `animais_com_detalhes` (idade, categoria, ganho total, nº pesagens calculados), `lotes_com_estatisticas` (agregações por lote).

Triggers: `atualizar_animal_apos_pesagem()` (recalcula peso/GMD do animal a cada pesagem), `trigger_set_updated_at()` (genérico).

> **Nota de integração importante:** hoje `animais` é usado apenas para bovinos rastreados individualmente. O Eixo 2 trabalha em outro nível de granularidade (lote/lançamento, todas as espécies). Ver seção 3.3 para a estratégia de reconciliação entre os dois níveis.

### 3.2 Domínio novo (Eixo 2 — Rebanho, GTA, Financeiro, Compliance)

#### `especies` (tabela de referência/config)
Cadastro das espécies suportadas para cadastro no sistema. Escopo completo definido pelo cliente:
- Bovinos
- Suínos
- Aves (agrupador — ver `subtipos_especie` abaixo)
- Equinos (cavalos, éguas)
- Muares (mulas, burros, jumentos)
- Ovinos (ovelhas, cordeiros e carneiros)
- Caprinos (cabras e bodes)
- Abelhas (agrupador — ver `subtipos_especie` abaixo)

Campos: `id`, `nome`, `ativo`.

> Nota: os termos entre parênteses (cavalos/éguas, ovelhas/cordeiros/carneiros, cabras/bodes) são nomenclaturas populares por sexo/idade dentro da mesma espécie zootécnica — não geram espécies separadas no cadastro, apenas informam a UI (ex.: rótulo do sexo pode usar "Égua/Cavalo" ao invés de "Fêmea/Macho" quando a espécie for Equino, se o cliente preferir esse tom mais natural à terminologia do produtor rural).

#### `subtipos_especie` (novo — apenas para espécies que precisam de subdivisão)
Algumas espécies do escopo não são um grupo homogêneo para fins de manejo e agrupamento etário — em especial **Aves**, que reúne finalidades de produção muito diferentes entre si (um frango de corte vive ~45 dias; uma matriz ou poedeira tem ciclo de vida de mais de um ano), e **Abelhas**, cujos dois subtipos têm manejo, unidade de contagem e regulamentação distintos. Modelar como subtipo vinculado à espécie:
- `id`, `especie_id` (FK), `nome`

Subtipos previstos no seed inicial:
- **Aves:** Frango de Corte, Matriz, Galinha Poedeira, Peru, Codorna, Avestruz
- **Muares:** Mula, Burro/Jumento (verificar com o cliente se há distinção prática de manejo entre burro e jumento a ponto de justificar registros separados, ou se são sinônimos regionais tratados como um único subtipo)
- **Abelhas:** Apis mellifera (colmeias — abelha com ferrão, apicultura convencional), Abelhas Nativas Sem Ferrão (caixas — meliponicultura)

Demais espécies (Bovino, Suíno, Equino, Ovino, Caprino) não usam subtipo nesta fase — `subtipo_especie_id` fica nulo.

⚠️ **Ponto em aberto para validar com o cliente antes da implementação — Aves:** os agrupamentos etários definidos na próxima seção estão em **meses**, adequado para bovino/equino/ovino/caprino/suíno. Para Aves, especialmente Frango de Corte, a unidade relevante costuma ser semanas ou dias, não meses. Recomenda-se que `agrupamentos_etarios` suporte uma unidade de tempo configurável (`unidade_idade`: `dias` | `semanas` | `meses`) ao invés de assumir meses como unidade fixa em todo o sistema. Essa é uma extensão de modelo, não um bloqueio — pode ser tratada na fase de implementação do módulo de Aves especificamente.

⚠️ **Ponto em aberto para validar com o cliente — Abelhas:** o modelo de saldo desenhado neste documento (seção seguinte) conta indivíduos por sexo e faixa etária, o que **não se aplica a abelhas**. O manejo apícola/meliponícola é contado por **unidade de colônia** — colmeias (Apis mellifera) e caixas (nativas sem ferrão) — sem quebra por sexo e, tipicamente, sem faixa etária no sentido usado pelas demais espécies. Recomenda-se que, para a espécie Abelhas, o sistema trate o saldo como **contagem de unidades (colmeias/caixas) por subtipo**, sem os campos de `agrupamento_etario` e `sexo` — ou seja, os módulos de Saldo de Rebanho e de Transações (seção 5.2) precisam prever esse caso especial na interface (ex.: ocultar os campos de sexo/faixa etária quando a espécie selecionada for Abelhas, exibindo apenas "quantidade de colmeias/caixas"). Isso é uma ramificação de UX e de regra de validação de formulário a ser resolvida na fase de implementação do módulo, não uma mudança estrutural no restante do schema.

#### `agrupamentos_etarios` (tabela de referência/config, por espécie/subtipo)
Define as faixas etárias usadas no saldo, pois **variam por espécie**. Padrão validado com o cliente (mamíferos de grande/médio porte cobertos nesta fase — bovino, equino, ovino):

| Espécie | Faixas etárias |
|---|---|
| Bovino | 0–12 meses · 13–24 meses · 25–36 meses · Mais de 36 meses |
| Equino | 0–12 meses · Mais de 12 meses |
| Ovino | 0–6 meses · Mais de 6 meses |

Caprino, Suíno, Muar e os subtipos de Aves ainda não têm faixa padrão definida pelo cliente — cadastrar como configuração pendente de validação, seguindo o mesmo padrão estrutural (não travar a modelagem, apenas deixar sem seed até confirmação). **Abelhas não usa esta tabela** (ver nota acima — saldo por unidade de colônia, não por faixa etária/sexo).

Campos: `id`, `especie_id` (FK), `subtipo_especie_id` (FK, nullable), `label` (ex.: "0-12 meses"), `idade_min_meses`, `idade_max_meses` (nullable para faixa aberta — "Mais de X meses"), `ordem` (para exibição). Ver nota acima sobre `unidade_idade` para o caso de Aves.

⚠️ **Atenção — não confundir com a categorização do Eixo 1:** o bovino tem **dois sistemas de faixa etária diferentes no mesmo sistema, para propósitos distintos**, e isso é intencional, não inconsistência:
- **Eixo 1 (`animais_com_detalhes.categoria`)** — classifica o **animal individual** cadastrado, em Bezerro/Bezerra (<8 meses), Novilho/Novilha (8–24 meses), Boi/Vaca (>24 meses). Usado no manejo zootécnico do dia a dia (peso, GMD, lotes).
- **Eixo 2 (`agrupamentos_etarios`, tabela acima)** — classifica o **saldo agregado de rebanho por lançamento**, em 0–12 / 13–24 / 25–36 / Mais de 36 meses. Usado para bater com a estrutura oficial de saldo do órgão estadual (replicada do print de referência `Bovinos-saldo-atual.png`).

Os limiares não são os mesmos (8 e 24 meses no Eixo 1 vs. 12, 24 e 36 meses no Eixo 2) porque atendem a lógicas diferentes: uma é classificação zootécnica de manejo, a outra é a nomenclatura de faixa etária usada pelo órgão regulador para fins de declaração de rebanho. O time de desenvolvimento não deve tentar unificar os dois em uma única tabela/regra — são deliberadamente independentes.

#### `gtas` (Guia de Trânsito Animal)
Réplica do controle mostrado no print `GTAs.png`, ampliada com identificação e documento original.
- `id` (uuid, PK — identificador interno)
- `fazenda_id` (FK)
- `numero_gta` (text — identificador oficial exibido ao usuário, ex.: `AE-699057`, inclui prefixo de série; **único por fazenda**, é o identificador de referência que o produtor reconhece, distinto do `id` interno)
- `municipio_origem` (text)
- `origem` (text — nome da propriedade/pessoa de origem)
- `municipio_destino` (text)
- `destino` (text — nome da propriedade/pessoa de destino)
- `especie_id` (FK → especies)
- `status_liberacao` (enum: `pendente` | `liberada`)
- `data_liberacao` (date, nullable — preenchido quando status = liberada)
- `transacao_id` (FK → transacoes, nullable — GTA pode ser vinculada a uma transação de compra/venda registrada no sistema, ou existir de forma avulsa/informativa, como no exemplo em que a fazenda aparece tanto como origem quanto como destino em movimentações de terceiros)
- `arquivo_path` (text, nullable — caminho no bucket de Storage do documento original da GTA, quando disponível)
- `arquivo_mime_type` (text, nullable — tipo do arquivo enviado, ver formatos aceitos abaixo)
- `created_at`, `updated_at`

**Bucket de storage:** `gtas-documentos` (privado, RLS por `fazenda_id`, mesmo padrão do bucket de declarações). **Formatos aceitos:** PDF ou imagem (JPEG/JPG, PNG, WebP, HEIC/HEIF) — diferente do bucket de Declaração Anual (seção seguinte), que aceita apenas PDF. A justificativa é prática: muitas GTAs em posse do produtor existem apenas como foto do documento físico (tirada com celular), não como PDF digitalizado. Se o arquivo enviado for imagem, a tela de "Ver GTA" deve exibi-la como imagem (não tentar renderizar como PDF); se for PDF, usar visualizador de PDF.

#### `transacoes` (livro-razão de Entradas e Saídas — compra/venda/pastoreio)
Réplica do controle mostrado no print `Controle-entradas-saidas.png`.
- `id`, `fazenda_id` (FK)
- `tipo_operacao` (enum: `compra` | `venda` | `entrada_pastoreio` | `saida_pastoreio`)
- `especie_id` (FK → especies)
- `outra_parte` (text — nome do comprador/vendedor/parceiro)
- `data_operacao` (date)
- `numero_nota` (text, nullable)
- `quantidade_animais` (integer)
- `tem_contranota` (boolean, nullable)
- `valor_nota` (numeric, nullable)
- `gta_id` (FK → gtas, nullable)
- `status_gta_transacao` (enum: `despendenciada` | `n_a` | `pendente` — reflete a coluna "GTA" do print, que indica se a movimentação depende de GTA e seu status)
- `observacoes` (text — texto livre, ex.: "Todos machos", "4 Machos e 15 Fêmeas")
- `created_at`, `updated_at`

#### `transacoes_detalhe` (opcional, recomendado — quebra estruturada das observações)
Hoje o print guarda o detalhamento de sexo/faixa etária como texto livre em "Observações" (ex.: "Todas fêmeas (0-12meses: 6 / 13-24meses: 8 / 25-36meses: 8)"). Para que o saldo seja **calculado automaticamente** (e não digitado à parte, como no print de saldo atual), recomenda-se estruturar isso:
- `id`, `transacao_id` (FK)
- `agrupamento_etario_id` (FK → agrupamentos_etarios)
- `sexo` (enum: `macho` | `femea`)
- `quantidade` (integer)

Isso permite que o **saldo atual por espécie/agrupamento/sexo seja derivado automaticamente** das transações, ao invés de ser um número mantido manualmente — eliminando a divergência que hoje existe entre a planilha de controle e o portal oficial.

#### `saldo_rebanho` (view calculada, não tabela)
View que replica a estrutura dos prints `Bovinos/Equinos/Ovinos-saldo-atual.png`:
```
fazenda_id | especie | agrupamento_etario | sexo | qtd_registrada | qtd_pendente
```
- `qtd_registrada`: soma líquida de entradas − saídas já confirmadas/liberadas (GTA liberada ou lançamento sem pendência)
- `qtd_pendente`: soma de movimentações aguardando confirmação (ex.: GTA com status `pendente`, ou nascimentos/entradas ainda não formalizados)

Calculado como saldo corrente (entradas − saídas) a partir de `transacoes_detalhe`, filtrado por `data_operacao <= data de referência informada pelo usuário` (o print mostra "Saldo referente à data: 15/07/2026" — ou seja, o saldo deve poder ser consultado em qualquer data de corte, não só "hoje").

#### `declaracoes_rebanho`
Réplica do controle mostrado no print `Declaracoes-de-animais.png`.
- `id`, `fazenda_id` (FK)
- `especie_id` (FK → especies)
- `ano_referencia` (integer)
- `data_declaracao` (date, nullable — data de referência/corte da declaração, conforme aparece no print)
- `quantidade_declarada` (integer)
- `status` (enum: `pendente` | `enviado`)
- `data_envio` (date, nullable — quando o produtor efetivamente enviou à Secretaria)
- `arquivo_pdf_path` (text, nullable — caminho no bucket do Supabase Storage)
- `created_at`, `updated_at`

**Bucket de storage:** `declaracoes-rebanho` (privado, com RLS de storage vinculando ao `fazenda_id` do usuário). Upload apenas de PDF, limite de tamanho a definir (ex.: 10MB).

#### `prazos_declaracao_estado` (config editável — novo)
Parametriza o prazo regulatório de envio da Declaração Anual de Rebanho, que **varia por estado e pode variar de ano para ano**. Não deve ser hardcoded.
- `id`, `estado` (UF, ex.: `RS`)
- `ano_referencia` (integer)
- `data_inicio_prazo` (date)
- `data_fim_prazo` (date)
- `created_at`, `updated_at`

Regra padrão a ser usada como seed/fallback: **RS, 01/abril a 30/junho de cada ano**. Se não houver registro para um determinado estado/ano futuro, o sistema deve assumir esse padrão (mesmo dia/mês, ano corrente) até que o usuário cadastre um valor específico. Editável pela página de Configurações (seção 5.3), permitindo:
- Definir/editar o prazo por estado, para fazendas em mais de um estado
- Sobrescrever o prazo de um ano específico (caso o órgão estadual publique uma prorrogação ou antecipação naquele ano)

#### `lancamentos_financeiros` (novo — Controle Financeiro ampliado)
Além de compras e vendas de animais (já cobertas por `transacoes`), o controle financeiro da fazenda precisa registrar **insumos e despesas gerais** (que não são transações de animais): ração, medicamentos, combustível, mão de obra, manutenção, impostos, etc.
- `id`, `fazenda_id` (FK)
- `tipo` (enum: `receita` | `despesa`)
- `categoria` (text ou FK para tabela de categorias configurável — ex.: `insumo`, `medicamento`, `combustivel`, `mao_de_obra`, `manutencao`, `imposto`, `outros`)
- `descricao` (text)
- `data_lancamento` (date)
- `valor` (numeric)
- `numero_nota` (text, nullable)
- `contraparte` (text, nullable — fornecedor/cliente)
- `transacao_animal_id` (FK → transacoes, nullable — permite vincular um lançamento financeiro a uma compra/venda de animal já registrada, evitando duplicidade quando o produtor quiser ver tudo em uma visão financeira única)
- `created_at`, `updated_at`

O **Módulo Financeiro** (seção 5.2) consolida `lancamentos_financeiros` + os valores de `transacoes` (compra/venda de animais) em uma visão única de fluxo de caixa da fazenda, com exportação para contabilidade externa.

### 3.3 Reconciliação entre Eixo 1 (animal individual) e Eixo 2 (saldo por espécie)

Ponto de atenção de arquitetura que precisa ser decidido com o time antes da implementação:

- **Opção A (recomendada para o MVP deste novo escopo):** os dois módulos coexistem de forma **desacoplada**. `animais` continua sendo o cadastro individual de bovinos monitorados (peso/GMD). `transacoes` é o livro-razão agregado de todas as espécies para fins de saldo/GTA/declaração. Uma venda de um lote de 28 bovinos gera 1 registro em `transacoes` (com seu detalhamento em `transacoes_detalhe`) **e**, para os animais que estavam cadastrados individualmente no sistema, o usuário marca cada um com `status = venda` (fluxo que já existe). Não há vínculo automático de dados entre as duas tabelas nesta fase.
- **Opção B (evolução futura):** ao registrar uma transação de venda, o sistema sugere/permite selecionar quais animais individuais (se cadastrados) fazem parte daquele lote vendido, atualizando o `status` deles automaticamente e evitando dupla digitação. Isso é desejável mas não deve bloquear a entrega do Eixo 2 — pode ser uma iteração posterior.

Essa decisão deve ser validada com o cliente antes de começar a implementação do Eixo 2, mas a recomendação é seguir com a Opção A primeiro.

---

## 4. Regras de Negócio

### 4.1 Já validadas (Eixo 1)
- Categorização automática por idade/sexo (macho: Bezerro/Novilho/Boi; fêmea: Bezerra/Novilha/Vaca — faixas de idade replicadas do MVP: <8 meses, 8–24 meses, >24 meses)
- Status mutuamente exclusivo do animal individual: Ativo, Venda, Morte, Baixa
- Regra de correção vs. histórico de pesagem: mudanças em até 2 dias da última pesagem = correção (UPDATE); acima disso = novo registro histórico (INSERT)

### 4.2 Novas (Eixo 2)

**Saldo por espécie é sempre derivado, nunca digitado diretamente.** O saldo atual (telas de Bovinos/Equinos/Ovinos) é resultado do cálculo cumulativo de todas as transações de entrada e saída até a data de referência escolhida. Isso é o que garante que o sistema não divirja de uma planilha paralela como a do print `Controle-entradas-saidas.png` — a intenção é que esse controle deixe de ser feito em planilha e passe a ser a fonte de verdade do sistema.

**Agrupamentos etários variam por espécie** — não usar uma única tabela fixa de faixas. Cada espécie tem sua própria configuração (bovino: 4 faixas; equino: 2 faixas — 0-12/12+; ovino: 2 faixas — 0-6/6+), conforme validado com o cliente. O cadastro de `agrupamentos_etarios` deve ser extensível para permitir novas espécies e subtipos (ex.: Aves) no futuro sem alteração de schema.

**Qtd. Registrada vs. Qtd. Pendente:** todo saldo tem duas colunas. "Registrada" é o saldo confirmado; "Pendente" reflete movimentações aguardando confirmação — no caso do sistema, principalmente GTAs com `status_liberacao = pendente`. Uma GTA de entrada pendente incrementa a "quantidade pendente" da espécie/agrupamento correspondente até ser liberada, momento em que passa a compor a "quantidade registrada".

**GTA pode ou não estar vinculada a uma transação registrada no sistema.** Nos prints, aparecem GTAs em que a própria fazenda do usuário é origem **ou** destino, envolvendo terceiros — ou seja, o módulo de GTA deve funcionar também como um **espelho de movimentações externas relevantes** (ex.: um vizinho movimentando animais e citando a fazenda do usuário como referência), não apenas como registro das transações que o próprio usuário lançou. Por isso `transacao_id` em `gtas` é nullable.

**Toda transação de compra/venda deve capturar:** operação, contraparte, data, número da nota, quantidade de animais, se tem contranota, valor da nota, vínculo/status de GTA, e observações com quebra por sexo/faixa etária (estruturada via `transacoes_detalhe`, mantendo o texto livre em `observacoes` como complemento, não substituto).

**Declaração Anual tem duas dimensões de estado:** (1) se já foi enviada ou está pendente; (2) o histórico de todas as declarações já enviadas, por espécie e ano, com o PDF anexado como comprovante. O sistema deve alertar visualmente quando uma declaração do ano corrente estiver pendente e a data limite se aproximar.

**Prazo regulatório é configurável, não fixo no código.** Regra padrão adotada para o Rio Grande do Sul: janela de **01 de abril a 30 de junho** de cada ano. Como o prazo pode variar por estado (fazendas em outros estados) e pode mudar de um ano para o outro (prorrogações/antecipações publicadas pelo órgão estadual), o valor deve vir de `prazos_declaracao_estado` (seção 3.2), editável na página de Configurações. O alerta de pendência do Painel Inteligente deve:
- Usar o prazo do estado/ano vigente cadastrado; se não houver registro específico para o ano corrente, aplicar o padrão RS (01/04–30/06) como fallback
- Sinalizar visualmente em 3 estados: fora do prazo/sem urgência, dentro do prazo com declaração pendente (atenção), e prazo vencido sem envio (crítico)

---

## 5. Módulos Funcionais

### 5.1 Já implementados no MVP (Eixo 1)
- Autenticação (cadastro, login, logout, persistência de sessão)
- Gestão de animais individuais (CRUD, status, detalhes com histórico de pesagens)
- Registro de pesagens (com regra de correção vs. histórico)
- Gestão de lotes de manejo (criar, listar, estatísticas — edição/arquivamento ainda pendente)
- Dashboard geral filtrável por lote
- Comparativo de desempenho entre lotes

### 5.2 Novos módulos a implementar (Eixo 2)

**Módulo: Saldo de Rebanho**
- Três visões (uma por espécie: Bovinos, Equinos, Ovinos — extensível), replicando a estrutura dos prints
- Tabela por agrupamento etário × sexo, com colunas "Qtd. Registrada" e "Qtd. Pendente"
- Seletor de "Saldo referente à data" (permite consultar saldo histórico em qualquer data de corte, não apenas o saldo atual)
- Ação "Imprimir Saldo" (exportação em PDF, replicando funcionalidade do sistema de referência)
- Todo saldo é calculado a partir de `transacoes_detalhe` — sem input manual de saldo

**Módulo: GTAs (Guia de Trânsito Animal)**
- Listagem com colunas: nº GTA (identificador oficial, `numero_gta`), município origem, origem, município destino, destino, espécie, status de liberação
- Filtros por status (pendente/liberada), espécie, período
- Cadastro/edição de GTA, com vínculo opcional a uma transação
- Badge visual de destaque para GTAs pendentes (ação que o produtor precisa acompanhar)
- **Ação "Ver Detalhes":** abre modal/página com todos os campos da GTA (município e propriedade de origem e destino, espécie, status e data de liberação, transação vinculada se houver)
- **Visualização do documento original:** dentro da tela/modal de detalhes, um botão **"Ver GTA"** abre o documento original anexado (`arquivo_path`) — PDF ou imagem, conforme o formato enviado (ver seção 3.2). Recomendação de UX: não expor o botão "Ver GTA" diretamente na listagem — mantê-lo dentro do ambiente de detalhes, evitando poluir a tabela principal com uma ação secundária e reduzindo cliques acidentais em documento antes de o usuário confirmar qual GTA está consultando.
- Upload do documento da GTA no cadastro/edição (opcional — nem toda GTA do histórico do produtor necessariamente terá o documento digitalizado disponível), aceitando PDF ou imagem (JPEG/JPG, PNG, WebP, HEIC/HEIF)

**Módulo: Entradas e Saídas (Compras e Vendas)**
- Cabeçalho com resumo de saldo início/fim de ano por espécie (Bovinos, Ovinos, Equinos) — replicando o topo do print `Controle-entradas-saidas.png`
- Tabela de lançamentos com todas as colunas do print: operação (com seletor colorido por tipo — venda/compra/entrada de pastoreio/saída de pastoreio), outra parte, data, número da nota, quantidade de animais, tem contranota, valor da nota, status da GTA, número da GTA, observações
- Detalhamento de sexo/faixa etária por lançamento (via `transacoes_detalhe`), com fallback de texto livre em observações
- Toda nova transação criada aqui **atualiza automaticamente** o Módulo de Saldo de Rebanho
- Filtros por ano, espécie, tipo de operação, contraparte

**Módulo: Declaração Anual de Rebanho**
- Listagem histórica por espécie e data de declaração com quantidade (réplica do print `Declaracoes-de-animais.png`)
- Indicador de status para o ano corrente: **Pendente** (destaque visual, ex. badge vermelho/laranja) ou **Enviado** (com data de envio e link para o PDF anexado)
- Upload de arquivo PDF da declaração enviada (Supabase Storage), com preview/download
- Ação "Marcar como enviada" (abre formulário: data de envio + upload do PDF)
- Exibição do prazo regulatório vigente (estado/ano) e status em relação a ele (ver regra na seção 4.2)

**Módulo: Financeiro**
Vai além de compras e vendas de animais (já registradas em `transacoes`), consolidando toda a movimentação financeira da fazenda:
- Lançamento de receitas e despesas gerais — insumos, medicamentos, combustível, mão de obra, manutenção, impostos etc. (`lancamentos_financeiros`), com categoria, contraparte, valor, número de nota e data
- Visão consolidada de fluxo de caixa: receitas (vendas de animais + outras receitas) × despesas (compras de animais + insumos/despesas gerais), por período
- Filtros por categoria, período, tipo (receita/despesa)
- **Exportação para contabilidade/gestor da fazenda** — geração de arquivo (CSV/Excel; avaliar OFX no futuro se houver interesse em conciliação bancária) com os lançamentos do período selecionado, em formato que um escritório contábil externo consiga importar
- Vínculo opcional entre um lançamento financeiro e uma transação de compra/venda de animal já registrada, evitando dupla contagem na visão consolidada

**Painel Inteligente (Dashboard consolidado do Eixo 2)**
Tela central de UX/UI moderna e simples, unificando:
- Cards de saldo atual total por espécie (bovino/equino/ovino), com quantidade registrada e pendente em destaque
- Alertas acionáveis: GTAs pendentes de liberação, declaração anual pendente do ano corrente (com base no prazo configurado por estado/ano)
- Resumo financeiro do período (ano corrente): total de receitas, total de despesas (animais + insumos/despesas gerais), saldo líquido, número de cabeças compradas vs. vendidas
- Gráfico de evolução do saldo de rebanho ao longo do ano (linha temporal, por espécie)
- Acesso rápido às últimas transações e lançamentos financeiros

> Este painel é a peça central de valor percebido do Eixo 2 — deve resolver em uma tela só o que hoje está espalhado entre a planilha de controle e o portal oficial de defesa agropecuária. Priorizar clareza visual e hierarquia de informação (o que precisa de ação do produtor deve saltar aos olhos: pendências de GTA e declaração).

### 5.3 Módulo: Configurações (ampliado)

- Dados da fazenda e do usuário (já previsto no documento de produção anterior)
- **Prazos de Declaração Anual por estado:** tela para visualizar/editar `prazos_declaracao_estado` — lista os estados onde o usuário tem propriedades cadastradas, com o prazo vigente (padrão RS 01/04–30/06 pré-carregado) e permite:
  - Editar o prazo de um ano futuro específico (caso haja prorrogação/alteração publicada pelo órgão estadual)
  - Adicionar um novo estado, para produtores com propriedades em mais de uma UF
- Categorias de lançamento financeiro (customização das categorias de despesa/receita, se o time optar por não deixar fixo em enum)
- (Futuro) Gestão de usuários e papéis de acesso — ver 5.4

### 5.4 Papéis de Usuário (roadmap — não é escopo da primeira entrega, mas deve ser previsto na arquitetura)

Hoje o modelo é 1 usuário = 1 fazenda = dono com acesso total. O roadmap prevê um segundo papel:

**Usuário Financeiro/Contábil (consulta)**
- Login e senha próprios, vinculados à mesma fazenda do produtor (relação N:N usuário↔fazenda com papel, não apenas o dono)
- Acesso **restrito** a: Painel Financeiro, Declarações de Rebanho, Saldo de Animais
- **Sem acesso** a: manejo individual de animais/lotes/pesagens, GTAs, edição de transações (perfil de consulta/leitura, não de operação)
- Justificativa: contadores e gestores externos da fazenda precisam consultar esses dados periodicamente sem precisar que o dono compartilhe login, nem ter acesso a informações operacionais irrelevantes para o trabalho deles

**Implicação de arquitetura:** o modelo de dados e as políticas de RLS devem ser desenhados desde o início pensando em uma tabela de vínculo `usuarios_fazendas` (usuario_id, fazenda_id, papel), mesmo que a primeira entrega implemente apenas o papel "dono". Refazer esse relacionamento depois que o sistema já estiver em produção com dados reais é significativamente mais arriscado do que prever a estrutura correta desde o schema inicial.

---

## 6. Interface / Design

- Manter linguagem visual já estabelecida no Eixo 1: Tailwind + shadcn/ui, paleta semântica por cor (verde=positivo/ativo, laranja=atenção, vermelho=crítico/pendência, azul=informação)
- Navegação: os novos módulos (Saldo, GTAs, Transações, Declarações, Painel) devem ser incorporados à mesma navegação principal da área logada, como itens de mesmo nível hierárquico que Animais/Lotes/Comparativo (ver estrutura de rotas na seção 8)
- Tabelas densas (GTAs, Transações) devem ter paginação e filtros — este é um requisito crítico aqui, diferente do Eixo 1, pois o histórico de transações e GTAs tende a crescer rapidamente e de forma contínua (dezenas de lançamentos por ano, por vários anos)
- Badges de status coloridos consistentes em todos os módulos (Pendente = laranja/vermelho, Liberada/Enviado = verde, N/A = cinza)
- Formulários de lançamento de transação devem ser rápidos de preencher (uso recorrente, muitas vezes em sequência) — considerar valores padrão inteligentes (ex.: repetir última contraparte usada, espécie mais comum da fazenda)

---

## 7. Requisitos Não-Funcionais Específicos do Eixo 2

**Supabase Storage (novo)**
- Bucket privado `declaracoes-rebanho` — aceita apenas PDF (documento oficial de declaração, formato único esperado)
- Bucket privado `gtas-documentos` — aceita PDF ou imagem (JPEG/JPG, PNG, WebP, HEIC/HEIF), pois muitas GTAs em posse do produtor existem apenas como foto do documento físico
- RLS de storage: usuário só acessa arquivos vinculados a `fazenda_id` de sua propriedade (mesmo padrão de RLS já usado nas tabelas), em ambos os buckets
- Validação de tipo de arquivo por bucket (conforme formatos acima) e tamanho máximo no upload (ex.: 10MB); atenção especial a HEIC/HEIF — validar suporte de preview no navegador (formato nativo de iPhone, historicamente com suporte limitado em browsers não-Safari) e considerar conversão para JPEG no upload caso a exibição direta não seja confiável no frontend

**Precisão do saldo (crítico)**
- O cálculo de saldo por espécie/agrupamento/sexo precisa ser auditável e testável — é dado que o produtor usa para prestar contas ao Estado. Recomenda-se testes automatizados específicos para a lógica de cálculo de saldo a partir do histórico de transações, incluindo casos de borda (saldo em datas retroativas, transações com quantidade sem detalhamento por sexo/idade).
- Avaliar se o saldo deve ser calculado via view (on-the-fly, mais simples, mas pode ficar lento com histórico grande) ou via tabela de saldo consolidado recalculada por trigger a cada transação (mais rápido para consulta, mais complexo de manter consistente). Recomendação inicial: começar com view; migrar para saldo materializado apenas se houver problema de performance real.

**Idade dos animais no saldo agregado**
- Diferente do Eixo 1 (onde a idade é calculada por animal individual a partir de `data_nascimento`), no Eixo 2 a "idade" é um atributo do **lançamento** (o produtor informa quantos animais de cada faixa etária entraram/saíram, sem rastrear indivíduo por indivíduo). Isso significa que o agrupamento etário de um lote comprado/vendido **não se atualiza automaticamente com o tempo** (um lote lançado como "0-12 meses" não vira "13-24 meses" sozinho no sistema, pois não há um único evento-data por animal). Esse é um design trade-off aceitável e condizente com o print de referência (o sistema oficial funciona da mesma forma), mas deve ficar documentado para não gerar expectativa equivocada de que o saldo por faixa etária "envelhece" automaticamente.

---

## 8. Arquitetura de Rotas (Área Logada) — Atualizada

```
--- Área logada (requer sessão válida) ---
/app/dashboard              → Dashboard geral do Eixo 1 (animais/lotes)
/app/animais                → Listagem de animais individuais
/app/animais/:id            → Detalhe do animal
/app/lotes                  → Listagem de lotes de manejo
/app/lotes/:id              → Detalhe do lote
/app/comparativo            → Comparativo entre lotes

/app/rebanho                → Painel Inteligente (dashboard consolidado do Eixo 2)
/app/rebanho/saldo          → Saldo de Rebanho por espécie (Bovinos/Equinos/Ovinos)
/app/rebanho/gtas           → Listagem e gestão de GTAs
/app/rebanho/transacoes     → Entradas e Saídas (compras/vendas)
/app/rebanho/financeiro     → Controle Financeiro (insumos, despesas, exportação contábil)
/app/rebanho/declaracoes    → Declaração Anual de Rebanho

/app/configuracoes                     → Dados da fazenda, usuário
/app/configuracoes/prazos-declaracao   → Prazos de declaração por estado/ano
/app/configuracoes/equipe              → Gestão de usuários e papéis (futuro — inclui usuário financeiro/contábil)
```

**Navegação principal (shell):** recomenda-se agrupar visualmente Eixo 1 e Eixo 2 como duas seções na sidebar/navbar (ex.: "Manejo Individual" e "Rebanho & Compliance"), já que atendem a objetivos de uso diferentes (gestão zootécnica do dia a dia vs. controle regulatório/financeiro periódico).

---

## 9. Débitos Técnicos e Pontos de Atenção (consolidado)

> Como o projeto será construído do zero (ver seção 10), os itens abaixo deixam de ser "correções" em código existente e passam a ser **riscos conhecidos a serem evitados desde o design inicial** — a lista serve como checklist de decisões arquiteturais a acertar já na primeira versão, aproveitando o aprendizado do protótipo.

1. **Provisionamento de conta no signup deve ser resolvido corretamente desde o início** — no protótipo, criar `usuarios`/`fazendas` a partir do frontend esbarrou em bloqueios de RLS. Implementar via trigger de banco (`on_auth_user_created` no schema `auth`) ou Edge Function com `service_role`, nunca via insert direto do client.
2. **Fórmula de GMD deve ser matematicamente correta desde a primeira versão** — evitar a média simples acumulada usada no protótipo (que não pondera corretamente o histórico); calcular como `(peso_atual - peso_inicial) / dias_totais`, ou uma abordagem de série temporal, definida e revisada antes de codar o trigger.
3. **Roteamento real desde o início** — react-router-dom com as rotas da seção 8, sem tabs internas simulando navegação.
4. **Paginação desde o início** nas listagens de volume potencialmente grande e crescente: animais, pesagens, GTAs, transações, lançamentos financeiros.
5. **Testes automatizados fazem parte da entrega**, não um "depois" — prioridade máxima para a lógica de cálculo de saldo de rebanho e de GMD, por serem a base de decisões e prestação de contas do produtor.
6. **Modelo de dados de usuários/fazendas já nasce pensando em papéis** (`usuarios_fazendas` com campo `papel`), mesmo que a primeira entrega só implemente o papel "dono" — ver seção 5.4.
7. **Decisão de reconciliação Eixo 1 ↔ Eixo 2** (seção 3.3) deve ser validada com o cliente antes do início da modelagem — recomendação é Opção A (desacoplado) para a primeira entrega.
8. **Cálculo de saldo de rebanho:** decidir entre view calculada on-the-fly (mais simples, ponto de partida recomendado) ou saldo materializado (mais performático, migração futura se necessário).
9. **Upload de PDF (Supabase Storage):** validar limites de tamanho/formato com o cliente; declarações anuais nunca devem ser apagáveis pelo usuário (são documento oficial — no máximo substituíveis com histórico de versão, a definir).
10. **Prazos de declaração são dado configurável desde o schema inicial** (`prazos_declaracao_estado`), nunca uma data fixa no código.
11. **Espécie Abelhas exige regra de saldo diferente das demais** (contagem por unidade de colônia — colmeias/caixas — sem sexo/faixa etária). O formulário de Transações e a tela de Saldo de Rebanho devem prever essa ramificação condicional por espécie desde o design da interface, para não forçar campos irrelevantes (sexo, faixa etária) quando a espécie selecionada for Abelhas.

---

## 10. Plano de Implementação — Projeto Novo (Greenfield)

O projeto será construído **do zero**, em um **repositório Git novo**, com desenvolvimento feito via **Claude Code dentro do ambiente Antigravity**. O código e o ambiente do protótipo Bolt.new **não são migrados** — servem apenas como especificação funcional validada (este documento).

### Fase 0 — Setup do projeto
1. Criar repositório Git novo
2. Inicializar projeto (React + TypeScript + Vite, Tailwind, shadcn/ui) e configurar Supabase (projeto novo ou reaproveitamento do projeto Supabase existente — **decidir com o cliente**: se o Supabase atual já tem dados reais de teste válidos, considerar mantê-lo e recriar apenas o schema/tabelas do zero nele)
3. Configurar CI/CD básico (build, lint) desde o primeiro commit
4. Estruturar convenções do repositório (estrutura de pastas, padrão de commits, `.env.example`)

### Fase 1 — Fundação: Autenticação e Área Logada (Eixo 1, base)
5. Implementar autenticação (cadastro, login, logout) com provisionamento de conta robusto (trigger de banco, não insert client-side) — ponto de maior risco identificado no protótipo, resolver corretamente logo na base
6. Implementar shell da aplicação com roteamento real (react-router-dom) conforme mapa de rotas da seção 8
7. Modelo de dados base: `usuarios`, `fazendas`, `usuarios_fazendas` (já com campo `papel`, mesmo que só "dono" seja usado agora)

### Fase 2 — Eixo 1: Gestão Individual de Rebanho
8. Modelo de dados: `lotes`, `animais`, `pesagens` + views (`animais_com_detalhes`, `lotes_com_estatisticas`) — reaproveitando as regras de negócio validadas no protótipo (categorização automática, status do animal, regra de correção de pesagem em até 2 dias), mas com a fórmula de GMD corrigida
9. Telas: Animais (listagem, criação, edição, detalhe com histórico de pesagens), Lotes (listagem, criação, edição, arquivamento — completo desta vez), Dashboard, Comparativo

### Fase 3 — Eixo 2: Dados e Regras (camada de banco)
10. Modelo de dados: `especies`, `subtipos_especie`, `agrupamentos_etarios` (seed: Bovino, Equino, Ovino com as faixas validadas nesta especificação; Suíno, Caprino, Muar e subtipos de Aves cadastrados como espécie mas sem faixa etária até validação com o cliente; Abelhas cadastrada com seus dois subtipos — Apis mellifera e Nativas Sem Ferrão — sem uso de `agrupamentos_etarios`, ver regra de saldo por unidade de colônia)
11. Modelo de dados: `gtas` (com `arquivo_path`/`arquivo_mime_type`), `transacoes`, `transacoes_detalhe`
12. View de saldo de rebanho, **validada contra os números reais dos prints de referência** (usar os dados dos prints como massa de teste de aceite antes de seguir)
13. Modelo de dados: `lancamentos_financeiros`, `declaracoes_rebanho`, `prazos_declaracao_estado` (com seed do padrão RS 01/04–30/06)
14. Bucket de Storage `declaracoes-rebanho` e `gtas-documentos`, ambos com RLS

### Fase 4 — Eixo 2: Telas
15. Módulo de Transações (Entradas e Saídas) — base de dados de tudo, construir antes das telas que consomem
16. Módulo de Saldo de Rebanho por espécie
17. Módulo de GTAs (listagem, cadastro com upload de PDF ou imagem, tela/modal de detalhes com ação "Ver GTA" exibindo o documento no formato correto — visualizador de PDF ou imagem)
18. Módulo Financeiro (insumos/despesas + exportação para contabilidade)
19. Módulo de Declaração Anual (com upload de PDF e indicador de prazo)
20. Configurações (dados da fazenda, prazos de declaração por estado/ano)
21. Painel Inteligente (dashboard consolidado — último, pois depende de todos os módulos anteriores)

### Fase 5 — Qualidade e Produção
22. Testes automatizados (prioridade: cálculo de saldo, cálculo de GMD, regra de correção de pesagem)
23. Monitoramento de erros (Sentry) e analytics de produto
24. QA de responsividade mobile em todas as telas

### Fase 6 — Roadmap futuro (pós-lançamento)
25. Papel de usuário Financeiro/Contábil (login próprio, acesso restrito) — schema já preparado desde a Fase 1, implementação de UI/RLS específica aqui
26. PWA / suporte offline (uso em campo)
27. Gráficos de evolução temporal (peso individual e saldo de rebanho ao longo do tempo)
28. Vínculo automático entre transação e animais individuais cadastrados (Opção B da seção 3.3)
29. Alertas proativos mais sofisticados (ex.: notificação por email/WhatsApp de prazo de declaração se aproximando)

---

## 11. Resumo Executivo

O projeto tem dois eixos complementares: um já validado (gestão de desempenho individual do rebanho bovino — peso, GMD, lotes) e um novo, mapeado neste documento a partir de referências reais do fluxo de trabalho do produtor (planilha de controle de compra/venda e prints do sistema oficial de defesa agropecuária do Estado).

O novo eixo introduz a noção de **rebanho como saldo contábil por espécie**, movimentado por transações (compra, venda, entrada e saída de pastoreio), rastreado por GTA e prestado formalmente ao Estado via Declaração Anual. A peça de maior valor de produto é o **Painel Inteligente**, que deve substituir a necessidade do produtor de manter uma planilha paralela e consultar portais governamentais separados para saber sua própria situação regulatória.

O projeto será construído **do zero**, em repositório Git novo, com desenvolvimento via Claude Code no Antigravity — o protótipo Bolt.new não é migrado, funciona apenas como especificação funcional validada. A recomendação de sequenciamento (seção 10) é: fundação de autenticação/roteamento correta desde o primeiro commit, depois Eixo 1 (gestão individual) com as correções de fórmula já incorporadas, depois Eixo 2 de baixo para cima (dados → transações → saldo → GTA → financeiro → declaração → painel), validando o cálculo de saldo contra os números reais fornecidos como referência antes de seguir para as telas de consumo. O papel de usuário financeiro/contábil e os prazos de declaração configuráveis por estado/ano já entram no schema desde a base, mesmo que a interface completa para eles venha em fase posterior.

---