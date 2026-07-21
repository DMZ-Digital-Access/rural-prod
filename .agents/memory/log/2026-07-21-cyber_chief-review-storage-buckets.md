# Log — Security review: buckets de Storage (item 14) — `cyber_chief` (CONSTANTINE)

- **Data:** 2026-07-21
- **Migration:** `20260721030000_fase3_storage_buckets.sql`.
- **Veredito:** 🟢 Seguro. Aplicada ao remoto (validação exigiu isso — ver nota abaixo).

## Contexto de validação atípico desta tarefa

O CLI do Supabase local (2.26.9) está desatualizado a ponto de o serviço `storage-api` não
inicializar corretamente localmente (`StorageBackendError: Migration optimize-existing-
functions-again not found`) — pendência já registrada desde a Fase 1
(`.agents/memory/log/2026-07-17-qa-testes-fase1-adr0002.md`: "CLI do Supabase local
desatualizada, forçando excluir storage-api... de supabase start local"). `supabase db reset`
falha com `relation "storage.buckets" does not exist` antes mesmo de tentar as policies desta
migration — não é um erro da migration, é a infraestrutura local que não tem o schema
`storage` criado. Diferente de toda migration anterior deste projeto, esta foi validada
**diretamente no remoto** (que tem o serviço de Storage real, gerenciado pelo Supabase) — via
`supabase db push` + chamadas HTTP reais à Storage API (`@supabase/supabase-js`, sessões de
usuários reais via GoTrue), não `supabase db reset` local.

## Análise

3 buckets, RLS por `(storage.foldername(name))[1]::uuid` comparado às fazendas vinculadas ao
usuário — mesmo padrão de multi-tenancy usado em toda tabela do projeto, aplicado aqui ao
primeiro segmento do caminho do arquivo (`{fazenda_id}/...`). Fronteiras de `financeiro`
replicam exatamente as já estabelecidas nas tabelas correspondentes:
- `gtas-documentos`: zero acesso a `financeiro` (mesma fronteira de `gtas`, spec 5.4).
- `declaracoes-rebanho`: `financeiro` só lê (mesma fronteira de `declaracoes_rebanho`).
- `transacoes-documentos` (novo, ADR-0005 D3): `financeiro` só lê (mesma fronteira de
  `transacoes`).

Nenhuma policy de DELETE em nenhum dos 3 buckets — `declaracoes-rebanho` por exigência
explícita da spec (item 9, seção 9: "declarações anuais nunca devem ser apagáveis");
`gtas-documentos`/`transacoes-documentos` por analogia às tabelas correspondentes (correção via
`UPDATE`/upsert, não exclusão) — consistente, não uma omissão.

## [VERIFICAÇÃO DE DADOS]

Validado por chamadas reais à Storage API (usuários reais via GoTrue, sessões `admin` e
`financeiro` da mesma fazenda):
1. `admin` faz upload e download em `gtas-documentos` — OK.
2. `admin` faz upload em `declaracoes-rebanho` e `transacoes-documentos` — OK.
3. `financeiro` tenta baixar o documento de GTA — bloqueado ("Object not found", RLS torna o
   arquivo invisível, não um erro de permissão explícito — comportamento correto de
   default-deny).
4. `financeiro` baixa o documento de declaração — OK (fronteira de leitura confirmada).
5. `financeiro` baixa o documento de transação — OK (fronteira de leitura confirmada).
6. `financeiro` tenta fazer upload em `declaracoes-rebanho` — bloqueado ("new row violates row
   level security policy").

## Pendência não bloqueante

Os 3 arquivos de teste usados na validação (conteúdo fake, sem dado real) permanecem nos
buckets do remoto — Supabase bloqueia `DELETE` direto via SQL em `storage.objects`
(`storage.protect_delete()`), e a limpeza via Storage API exigiria `service_role` (não
disponível no `.env` deste projeto, só `anon`). Sem risco real (arquivos vazios/fake, mesmo
padrão de "correção via upsert" já aceito para o resto do schema) — registrado para
conhecimento, não é uma ação pendente crítica.

## Mudanças de arquivo

Nenhuma — aprovada como está.
