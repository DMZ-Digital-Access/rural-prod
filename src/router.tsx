import { createBrowserRouter, Navigate } from "react-router-dom"
import { ProtectedRoute } from "@/components/ProtectedRoute"
import { NotFoundPage } from "@/pages/NotFoundPage"

// Code splitting por rota (2026-07-22, item 11 do roadmap) — cada página do
// app carrega seu próprio chunk sob demanda (`lazy`, nativo do data router
// do React Router — ver `LazyRouteFunction` em `node_modules/react-router`)
// em vez de tudo entrar no mesmo bundle inicial de ~1,46MB. Login/Signup/
// ProtectedRoute/NotFound continuam eager — são pequenos e/ou críticos pro
// primeiro paint. Sem `HydrateFallback` por rota: numa navegação normal
// (via <Link>), o router mantém a tela anterior até o chunk novo carregar,
// sem flash de loading; só no caso raro de abrir um link direto/atualizar a
// página numa rota interna, o conteúdo (não o menu/shell) fica em branco por
// um instante enquanto baixa — aceitável por ora, mesma filosofia de só
// otimizar mais quando virar problema real.
export const router = createBrowserRouter([
  { path: "/", element: <Navigate to="/app/dashboard" replace /> },
  {
    path: "/login",
    lazy: () => import("@/pages/auth/LoginPage").then((m) => ({ Component: m.LoginPage })),
  },
  {
    path: "/signup",
    lazy: () => import("@/pages/auth/SignupPage").then((m) => ({ Component: m.SignupPage })),
  },
  {
    path: "/convites/aceitar",
    lazy: () =>
      import("@/pages/auth/AceitarConvitePage").then((m) => ({
        Component: m.AceitarConvitePage,
      })),
  },
  {
    path: "/app",
    element: <ProtectedRoute />,
    children: [
      { index: true, element: <Navigate to="dashboard" replace /> },
      {
        path: "dashboard",
        lazy: () =>
          import("@/pages/dashboard/DashboardPage").then((m) => ({ Component: m.DashboardPage })),
      },
      {
        path: "animais",
        lazy: () =>
          import("@/pages/animais/AnimaisListPage").then((m) => ({
            Component: m.AnimaisListPage,
          })),
      },
      {
        path: "animais/:id",
        lazy: () =>
          import("@/pages/animais/AnimalDetailPage").then((m) => ({
            Component: m.AnimalDetailPage,
          })),
      },
      {
        path: "lotes",
        lazy: () =>
          import("@/pages/lotes/LotesListPage").then((m) => ({ Component: m.LotesListPage })),
      },
      {
        path: "lotes/:id",
        lazy: () =>
          import("@/pages/lotes/LoteDetailPage").then((m) => ({ Component: m.LoteDetailPage })),
      },
      {
        path: "comparativo",
        lazy: () =>
          import("@/pages/comparativo/ComparativoPage").then((m) => ({
            Component: m.ComparativoPage,
          })),
      },
      {
        path: "dia-pesagem",
        lazy: () =>
          import("@/pages/rebanho/DiaPesagemPage").then((m) => ({
            Component: m.DiaPesagemPage,
          })),
      },
      {
        path: "lancamento-rapido",
        lazy: () =>
          import("@/pages/lancamento-rapido/LancamentoRapidoPage").then((m) => ({
            Component: m.LancamentoRapidoPage,
          })),
      },
      {
        path: "rebanho",
        lazy: () =>
          import("@/pages/rebanho/PainelInteligentePage").then((m) => ({
            Component: m.PainelInteligentePage,
          })),
      },
      {
        path: "rebanho/saldo",
        lazy: () =>
          import("@/pages/rebanho/SaldoRebanhoPage").then((m) => ({
            Component: m.SaldoRebanhoPage,
          })),
      },
      {
        path: "rebanho/gtas",
        lazy: () =>
          import("@/pages/gtas/GtasListPage").then((m) => ({ Component: m.GtasListPage })),
      },
      {
        path: "rebanho/gtas/:id",
        lazy: () =>
          import("@/pages/gtas/GtaDetailPage").then((m) => ({ Component: m.GtaDetailPage })),
      },
      {
        path: "rebanho/declaracoes",
        lazy: () =>
          import("@/pages/declaracoes/DeclaracoesRebanhoPage").then((m) => ({
            Component: m.DeclaracoesRebanhoPage,
          })),
      },
      {
        path: "financeiro",
        lazy: () =>
          import("@/pages/financeiro/FinanceiroLayout").then((m) => ({
            Component: m.FinanceiroLayout,
          })),
        children: [
          {
            index: true,
            lazy: () =>
              import("@/pages/financeiro/FluxoCaixaPage").then((m) => ({
                Component: m.FluxoCaixaPage,
              })),
          },
          {
            path: "transacoes",
            lazy: () =>
              import("@/pages/rebanho/TransacoesListPage").then((m) => ({
                Component: m.TransacoesListPage,
              })),
          },
          {
            path: "transacoes/:id",
            lazy: () =>
              import("@/pages/rebanho/TransacaoDetailPage").then((m) => ({
                Component: m.TransacaoDetailPage,
              })),
          },
          {
            path: "lancamentos",
            lazy: () =>
              import("@/pages/financeiro/LancamentosListPage").then((m) => ({
                Component: m.LancamentosListPage,
              })),
          },
          {
            path: "lancamentos/:id",
            lazy: () =>
              import("@/pages/financeiro/LancamentoDetailPage").then((m) => ({
                Component: m.LancamentoDetailPage,
              })),
          },
          {
            path: "documentos",
            lazy: () =>
              import("@/pages/financeiro/DocumentosFiscaisPage").then((m) => ({
                Component: m.DocumentosFiscaisPage,
              })),
          },
        ],
      },
      {
        path: "configuracoes",
        lazy: () =>
          import("@/pages/configuracoes/ConfiguracaoFazendaPage").then((m) => ({
            Component: m.ConfiguracaoFazendaPage,
          })),
      },
      {
        path: "configuracoes/ia",
        lazy: () =>
          import("@/pages/configuracoes/ConfiguracaoIaPage").then((m) => ({
            Component: m.ConfiguracaoIaPage,
          })),
      },
      {
        path: "configuracoes/extracao-ia",
        lazy: () =>
          import("@/pages/configuracoes/ConfiguracaoExtracaoIaPage").then((m) => ({
            Component: m.ConfiguracaoExtracaoIaPage,
          })),
      },
      {
        path: "configuracoes/prazos-declaracao",
        lazy: () =>
          import("@/pages/configuracoes/PrazosDeclaracaoPage").then((m) => ({
            Component: m.PrazosDeclaracaoPage,
          })),
      },
      {
        path: "configuracoes/equipe",
        lazy: () =>
          import("@/pages/configuracoes/EquipePage").then((m) => ({ Component: m.EquipePage })),
      },
    ],
  },
  { path: "*", element: <NotFoundPage /> },
])
