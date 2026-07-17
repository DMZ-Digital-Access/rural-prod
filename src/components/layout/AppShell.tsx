import { type ReactNode } from "react"
import { NavLink, useNavigate } from "react-router-dom"
import { LogOutIcon } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/lib/auth"
import { Button } from "@/components/ui/button"

type NavItem = {
  to: string
  label: string
  end?: boolean
}

// Navegação principal (spec seção 6 e 8): duas seções — "Manejo Individual"
// (Eixo 1) e "Rebanho & Compliance" (Eixo 2) — mais Configurações à parte.
// A maioria das páginas ainda é placeholder (Fases 2/3/4 não começaram),
// mas a estrutura de navegação precisa existir inteira e ser clicável desde
// já (spec seção 10, item 6 da Fase 1).
const manejoIndividual: NavItem[] = [
  { to: "/app/dashboard", label: "Dashboard" },
  { to: "/app/animais", label: "Animais" },
  { to: "/app/lotes", label: "Lotes" },
  { to: "/app/comparativo", label: "Comparativo" },
]

const rebanhoCompliance: NavItem[] = [
  { to: "/app/rebanho", label: "Painel Inteligente", end: true },
  { to: "/app/rebanho/saldo", label: "Saldo de Rebanho" },
  { to: "/app/rebanho/gtas", label: "GTAs" },
  { to: "/app/rebanho/transacoes", label: "Transações" },
  { to: "/app/rebanho/financeiro", label: "Financeiro" },
  { to: "/app/rebanho/declaracoes", label: "Declarações" },
]

const configuracoes: NavItem[] = [
  { to: "/app/configuracoes", label: "Configurações", end: true },
  { to: "/app/configuracoes/prazos-declaracao", label: "Prazos de Declaração" },
  { to: "/app/configuracoes/equipe", label: "Equipe" },
]

function NavSection({ title, items }: { title: string; items: NavItem[] }) {
  return (
    <div className="flex flex-col gap-1">
      <h2 className="px-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {title}
      </h2>
      <nav className="flex flex-col gap-0.5">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cn(
                "rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-muted",
                isActive
                  ? "bg-muted font-medium text-foreground"
                  : "text-muted-foreground"
              )
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}

/**
 * Shell da área logada (spec seção 10 item 6). Funcional, não polido — UX
 * visual fica para fase futura. Renderizado por `ProtectedRoute` em volta
 * do `<Outlet/>` das rotas /app/*.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const navigate = useNavigate()

  async function handleLogout() {
    const { error } = await supabase.auth.signOut()
    if (error) {
      toast.error(`Erro ao sair: ${error.message}`)
      return
    }
    navigate("/login", { replace: true })
  }

  return (
    <div className="flex min-h-svh">
      <aside className="flex w-60 shrink-0 flex-col gap-6 border-r border-border bg-sidebar p-4">
        <div className="px-2 text-lg font-semibold">Livestock Control</div>

        <NavSection title="Manejo Individual" items={manejoIndividual} />
        <NavSection title="Rebanho & Compliance" items={rebanhoCompliance} />
        <NavSection title="Configurações" items={configuracoes} />

        <div className="mt-auto flex flex-col gap-2 border-t border-border pt-4">
          <div className="truncate px-2 text-xs text-muted-foreground">
            {user?.email}
          </div>
          <Button variant="outline" size="sm" onClick={handleLogout}>
            <LogOutIcon />
            Sair
          </Button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto p-6">{children}</main>
    </div>
  )
}
