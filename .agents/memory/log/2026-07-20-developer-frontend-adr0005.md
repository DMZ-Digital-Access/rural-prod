# Log — Frontend ADR-0005: "Individualizar Animal" + "Entradas e Saídas de Animais de Lote" — `developer` (RYAN, via Claude)

- **Data:** 2026-07-20
- **Agente responsável:** developer (Ryan) — implementação do frontend para o ADR-0005, já
  aplicado ao remoto (schema + RPC `registrar_entrada_saida_lote`).
- **Diretriz em vigor desde esta sessão:** todo novo componente precisa nascer responsivo
  (mobile + desktop juntos), não como retrofit posterior — seguida integralmente aqui.

## O que foi feito

1. **`CriarAnimalDialog.tsx` renomeado** — botão/título "Novo animal" → "Individualizar Animal";
   rótulo do campo de peso "Peso inicial (kg)" → "Peso de hoje (kg)". Nenhuma outra variável do
   modal mudou (JP pediu explicitamente manter tudo igual, só os dois rótulos).
2. **`EntradaSaidaLoteDialog.tsx` novo** — formulário completo: Tipo de operação (Select:
   Compra/Venda/Nascimento/Óbito/Consumo), Tipo de animal (Select, `useEspecies()`), Número de
   animais, Machos/Fêmeas (2 campos, soma validada por Zod contra o total), rótulo de "outra
   parte" dinâmico por tipo de operação (Vendedor numa compra, Comprador numa venda,
   "Observação" nos 3 novos tipos), Data da operação (default hoje), Valor financeiro e Peso
   total (ambos opcionais).
3. **`useEspecies()` novo** — catálogo global de espécies (Fase 3, RLS aberta a qualquer
   `authenticated`).
4. **`useRegistrarEntradaSaidaLote()` novo** (`src/hooks/useTransacoes.ts`) — SEMPRE via RPC
   `registrar_entrada_saida_lote`, nunca INSERT direto (mesmo padrão de `registrar_pesagem` na
   Fase 2) — a RPC garante atomicidade transacao+detalhe e valida a soma antes do commit.
5. **`src/lib/validations/transacoes.ts` novo** — schema Zod com `refine` validando
   `quantidade_machos + quantidade_femeas === quantidade_total`.
6. **`src/lib/types/rebanho.ts`** — tipos novos `Especie`, `TipoOperacaoTransacao`, `Transacao`.
7. **`AnimaisListPage.tsx`** — os dois botões lado a lado em desktop
   (`flex-col gap-2 sm:flex-row`), empilhados em mobile; texto do estado vazio atualizado.

## Validação real executada

- `npm run build`/`lint`/`test` (35/35) — limpos, sem regressão (só os 4 warnings
  pré-existentes de `only-export-components`).
- **Teste visual real via Playwright, desktop (1440×900) E mobile (390×844) desde o primeiro
  commit** — os dois botões renderizam lado a lado em desktop e empilhados em mobile; o dialog
  de Entradas/Saídas de Lote renderiza corretamente nas duas resoluções, com Machos/Fêmeas em 2
  colunas sempre (cabe bem mesmo em 390px) e Valor/Peso empilhando em mobile
  (`grid-cols-1 sm:grid-cols-2`); rótulo dinâmico "Vendedor" confirmado para `tipo_operacao =
  compra` (default do formulário). Zero erros de console.

## Mudanças de arquivo

- Novo: `src/pages/animais/EntradaSaidaLoteDialog.tsx`, `src/hooks/useEspecies.ts`,
  `src/hooks/useTransacoes.ts`, `src/lib/validations/transacoes.ts`.
- Modificado: `src/pages/animais/CriarAnimalDialog.tsx`, `src/pages/animais/AnimaisListPage.tsx`,
  `src/lib/types/rebanho.ts`.
- Este log + `PROJECT_CONTEXT.md`.

## Pendências

- Upload real de Nota/Contranota (colunas de arquivo já existem no schema desde o ADR-0005)
  depende do item 14 (Storage), ainda não iniciado — sem tela para isso ainda.
- Tela de detalhe/card de cada operação (GTA/Nota/Contranota "presente ou pendente" com link de
  documento) — spec do "card da operação" descrita por JP, ainda não implementada (é a tela de
  Transações completa, Fase 4, fora do escopo deste lançamento pontual).
- Venda/Óbito/Consumo vinculados a animal individual específico (via `transacoes_animais`) não
  têm UI ainda — esta tela só cobre o lançamento agregado (sem seleção de animal individual).
