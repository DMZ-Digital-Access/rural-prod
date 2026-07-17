import { createBrowserRouter, Navigate } from "react-router-dom"
import { ProtectedRoute } from "@/components/ProtectedRoute"
import { PlaceholderPage } from "@/pages/PlaceholderPage"
import { NotFoundPage } from "@/pages/NotFoundPage"
import { LoginPage } from "@/pages/auth/LoginPage"
import { SignupPage } from "@/pages/auth/SignupPage"
import { AceitarConvitePage } from "@/pages/auth/AceitarConvitePage"

// Mapa de rotas da área logada (especificacao-sistema.md, seção 8).
// Nenhum módulo de Fase 2/3/4 foi implementado ainda — cada rota abaixo
// renderiza um placeholder honesto em vez de 404/tela em branco, mas a
// estrutura de navegação inteira já existe e é clicável (Fase 1, item 6).
const appRoutes: {
  path: string
  title: string
  fase: string
}[] = [
  { path: "dashboard", title: "Dashboard", fase: "Fase 2" },
  { path: "animais", title: "Animais", fase: "Fase 2" },
  { path: "animais/:id", title: "Detalhe do Animal", fase: "Fase 2" },
  { path: "lotes", title: "Lotes", fase: "Fase 2" },
  { path: "lotes/:id", title: "Detalhe do Lote", fase: "Fase 2" },
  { path: "comparativo", title: "Comparativo entre Lotes", fase: "Fase 2" },
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
      ...appRoutes.map((route) => ({
        path: route.path,
        element: <PlaceholderPage title={route.title} fase={route.fase} />,
      })),
    ],
  },
  { path: "*", element: <NotFoundPage /> },
])
