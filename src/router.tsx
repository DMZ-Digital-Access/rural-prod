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
  { path: "rebanho/saldo", title: "Saldo de Rebanho", fase: "Fase 4" },
  { path: "rebanho/gtas", title: "GTAs", fase: "Fase 4" },
  { path: "rebanho/transacoes", title: "Entradas e Saídas", fase: "Fase 4" },
  { path: "rebanho/financeiro", title: "Financeiro", fase: "Fase 4" },
  { path: "rebanho/declaracoes", title: "Declaração Anual de Rebanho", fase: "Fase 4" },
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
      ...appRoutes.map((route) => ({
        path: route.path,
        element: <PlaceholderPage title={route.title} fase={route.fase} />,
      })),
    ],
  },
  { path: "*", element: <NotFoundPage /> },
])
