# Log — Auditoria de responsividade mobile (todas as telas) — `developer` (via Claude)

- **Data:** 2026-07-22
- **Motivação:** item 10 do roadmap salvo em PROJECT_CONTEXT.md — nunca tinha sido feita uma
  auditoria de mobile como um todo (só tela por tela, conforme construída).

## Metodologia

Sweep Playwright real (390×844, viewport de iPhone) logado contra o Supabase remoto, cobrindo as
23 rotas de `/app/*` (todas as listas, detalhes com IDs reais do banco, e todas as sub-abas de
Financeiro e Configurações). Para cada rota: checagem automática de overflow horizontal da
página inteira + screenshot completo pra revisão visual manual (overflow automático sozinho não
pega conteúdo cortado DENTRO de um container com `overflow-x-auto` já existente, que não vaza pra
fora da página mas ainda pode estar mal indicado visualmente).

## Achados

**3 bugs reais encontrados e corrigidos** — tabelas sem nenhum wrapper `overflow-x-auto`,
conteúdo genuinamente inacessível no mobile (sem rolagem nenhuma, coluna cortada e perdida):
- `AnimaisListPage.tsx` — coluna "Ações" (editar animal) ficava fora da tela, sem forma de
  acessar.
- `ComparativoPage.tsx` — "Tabela comparativa" cortada.
- `LoteDetailPage.tsx` — "Animais do lote" cortada, coluna "Ações" (mudar lote) inacessível.

Corrigido envolvendo as 3 tabelas em `<div className="overflow-x-auto rounded-lg border
border-border">`, mesmo padrão já usado em todas as telas construídas mais recentemente
(GtasListPage, SaldoRebanhoPage, FluxoCaixaPage, LancamentosListPage, DocumentosFiscaisPage,
EquipePage) — essas 3 eram sobras de páginas mais antigas (Fase 2), construídas antes desse
padrão ter se consolidado.

**Não são bugs (falso alarme investigado):**
- Abas de Financeiro ("Visão Geral"/"Transações de Animais"/"Lançamentos Gerais"/"Documentos
  Fiscais") pareciam cortadas na screenshot ("Lançamer..."), mas o componente já tem
  `overflow-x-auto` + `shrink-0 whitespace-nowrap` — é rolável de verdade, só falta uma pista
  visual de que dá pra arrastar (não corrigido, não é bloqueante).
- `SaldoRebanhoPage`/`FluxoCaixaPage` já tinham `overflow-x-auto` nas tabelas — cabeçalhos
  pareciam cortados na screenshot estática, mas a rolagem já funciona (confirmado no código).

## Validação

- `npm run build`/`lint`/`test` (36/36) limpos.
- Playwright real: as 3 tabelas corrigidas confirmadas roláveis de verdade (script que localiza o
  container com `scrollWidth > clientWidth` e rola até o fim) — a coluna "Ações" antes invisível
  aparece corretamente após a rolagem, em screenshot.
- Nenhuma das 23 rotas apresentou overflow horizontal da PÁGINA (isso já era true antes também —
  os bugs encontrados eram containers internos sem rolagem, não vazamento da página).

## Gate do `cyber_chief`

Não se aplica — só CSS/estrutura de layout, sem mudança de dado/lógica/RLS.
