import { createBrowserRouter, Navigate } from "react-router-dom"
import { ProtectedRoute } from "@/components/ProtectedRoute"
import { PlaceholderPage } from "@/pages/PlaceholderPage"
import { NotFoundPage } from "@/pages/NotFoundPage"
import { LoginPage } from "@/pages/auth/LoginPage"
import { SignupPage } from "@/pages/auth/SignupPage"
import { AceitarConvitePage } from "@/pages/auth/AceitarConvitePage"
import { DashboardPage } from "@/pages/dashboard/DashboardPage"
import { AnimaisListPage } from "@/pages/animais/AnimaisListPage"
import { AnimalDetailPage } from "@/pages/animais/AnimalDetailPage"
import { LotesListPage } from "@/pages/lotes/LotesListPage"
import { LoteDetailPage } from "@/pages/lotes/LoteDetailPage"
import { ComparativoPage } from "@/pages/comparativo/ComparativoPage"
import { TransacoesListPage } from "@/pages/rebanho/TransacoesListPage"
import { TransacaoDetailPage } from "@/pages/rebanho/TransacaoDetailPage"
import { SaldoRebanhoPage } from "@/pages/rebanho/SaldoRebanhoPage"
import { GtasListPage } from "@/pages/gtas/GtasListPage"
import { GtaDetailPage } from "@/pages/gtas/GtaDetailPage"
import { FinanceiroLayout } from "@/pages/financeiro/FinanceiroLayout"
import { LancamentosListPage } from "@/pages/financeiro/LancamentosListPage"
import { LancamentoDetailPage } from "@/pages/financeiro/LancamentoDetailPage"
import { ConfiguracaoIaPage } from "@/pages/configuracoes/ConfiguracaoIaPage"
import { DocumentosFiscaisPage } from "@/pages/financeiro/DocumentosFiscaisPage"
import { FluxoCaixaPage } from "@/pages/financeiro/FluxoCaixaPage"
import { DeclaracoesRebanhoPage } from "@/pages/declaracoes/DeclaracoesRebanhoPage"
import { LancamentoRapidoPage } from "@/pages/lancamento-rapido/LancamentoRapidoPage"

// Mapa de rotas da área logada (especificacao-sistema.md, seção 8).
// Fase 2 — Eixo 1 (Gestão Individual de Rebanho: dashboard, animais, lotes,
// comparativo) já tem páginas reais — ver `appPageRoutes` abaixo. Eixo 2 e
// Fases 3/4 continuam como placeholder honesto em vez de 404/tela em branco
// — a estrutura de navegação inteira já existe e é clicável desde a Fase 1,
// item 6.
const appRoutes: {
  path: string
  title: string
  fase: string
}[] = [
  { path: "rebanho", title: "Painel Inteligente", fase: "Fase 4" },
  { path: "configuracoes", title: "Configurações", fase: "Fase 4" },
  {
    path: "configuracoes/prazos-declaracao",
    title: "Prazos de Declaração",
    fase: "Fase 4",
  },
  {
    path: "configuracoes/equipe",
    title: "Equipe",
    fase: "Fase 6 (roadmap)",
  },
]

export const router = createBrowserRouter([
  { path: "/", element: <Navigate to="/app/dashboard" replace /> },
  { path: "/login", element: <LoginPage /> },
  { path: "/signup", element: <SignupPage /> },
  { path: "/convites/aceitar", element: <AceitarConvitePage /> },
  {
    path: "/app",
    element: <ProtectedRoute />,
    children: [
      { index: true, element: <Navigate to="dashboard" replace /> },
      { path: "dashboard", element: <DashboardPage /> },
      { path: "animais", element: <AnimaisListPage /> },
      { path: "animais/:id", element: <AnimalDetailPage /> },
      { path: "lotes", element: <LotesListPage /> },
      { path: "lotes/:id", element: <LoteDetailPage /> },
      { path: "comparativo", element: <ComparativoPage /> },
      { path: "lancamento-rapido", element: <LancamentoRapidoPage /> },
      { path: "rebanho/saldo", element: <SaldoRebanhoPage /> },
      { path: "rebanho/gtas", element: <GtasListPage /> },
      { path: "rebanho/gtas/:id", element: <GtaDetailPage /> },
      { path: "rebanho/declaracoes", element: <DeclaracoesRebanhoPage /> },
      {
        path: "financeiro",
        element: <FinanceiroLayout />,
        children: [
          { index: true, element: <FluxoCaixaPage /> },
          { path: "transacoes", element: <TransacoesListPage /> },
          { path: "transacoes/:id", element: <TransacaoDetailPage /> },
          { path: "lancamentos", element: <LancamentosListPage /> },
          { path: "lancamentos/:id", element: <LancamentoDetailPage /> },
          { path: "documentos", element: <DocumentosFiscaisPage /> },
        ],
      },
      { path: "configuracoes/ia", element: <ConfiguracaoIaPage /> },
      ...appRoutes.map((route) => ({
        path: route.path,
        element: <PlaceholderPage title={route.title} fase={route.fase} />,
      })),
    ],
  },
  { path: "*", element: <NotFoundPage /> },
])
