import { type ReactNode, useState } from "react"
import { NavLink, useNavigate } from "react-router-dom"
import { LogOutIcon, MenuIcon } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/lib/auth"
import { useSouAdminSoftware } from "@/hooks/useSouAdminSoftware"
import { FazendaSwitcher } from "@/components/layout/FazendaSwitcher"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"

type NavItem = {
  to: string
  label: string
  end?: boolean
}

// Navegação principal (spec seção 6 e 8): duas seções — "Manejo do Rebanho"
// (Eixo 1, renomeada de "Manejo Individual" em 2026-07-23 a pedido de JP) e
// "Rebanho & Compliance" (Eixo 2) — mais Configurações à parte.
const manejoIndividual: NavItem[] = [
  { to: "/app/dashboard", label: "Dashboard" },
  { to: "/app/animais", label: "Animais" },
  { to: "/app/lotes", label: "Lotes" },
  { to: "/app/comparativo", label: "Comparativo" },
  { to: "/app/dia-pesagem", label: "Dia de Pesagem" },
]

const rebanhoCompliance: NavItem[] = [
  { to: "/app/rebanho", label: "Painel Inteligente", end: true },
  { to: "/app/rebanho/saldo", label: "Saldo de Rebanho" },
  { to: "/app/rebanho/gtas", label: "GTAs" },
  { to: "/app/rebanho/declaracoes", label: "Declarações" },
]

// Seção própria de topo (2026-07-22, pedido de JP) — antes eram 4 itens
// soltos dentro de "Rebanho & Compliance" (Transações/Financeiro/Fluxo de
// Caixa/Documentos Fiscais). "Financeiro" é o financeiro TOTAL da fazenda
// (inclui compra/venda de animais via a aba "Transações de Animais"), não
// um assunto de "rebanho" — daí sair dessa seção e da URL `/rebanho/*`. As
// 4 páginas agora são abas de uma única área (`FinanceiroLayout`, ver
// router.tsx) — só uma entrada de menu, sem `end`, pra ficar destacada em
// qualquer sub-rota de `/app/financeiro`.
const financeiro: NavItem[] = [{ to: "/app/financeiro", label: "Financeiro" }]

// "Modelo de IA" e "Prompt de Extração (IA)" são telas de configuração
// GLOBAL do sistema, restritas ao admin do software (2026-07-22 — não mais
// ao admin de cada fazenda) — somem do nav pra qualquer outro usuário,
// primeiro item de menu deste projeto com branching condicional por papel.
function getConfiguracoesItems(souAdminSoftware: boolean): NavItem[] {
  return [
    { to: "/app/configuracoes", label: "Configurações", end: true },
    { to: "/app/configuracoes/prazos-declaracao", label: "Prazos de Declaração" },
    ...(souAdminSoftware
      ? [
          { to: "/app/configuracoes/ia", label: "Modelo de IA" },
          { to: "/app/configuracoes/extracao-ia", label: "Prompt de Extração (IA)" },
        ]
      : []),
    { to: "/app/configuracoes/equipe", label: "Equipe" },
  ]
}

function NavSection({
  title,
  items,
  onNavigate,
}: {
  title: string
  items: NavItem[]
  onNavigate?: () => void
}) {
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
            onClick={onNavigate}
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

// Conteúdo de navegação compartilhado entre a sidebar fixa (desktop, ≥lg) e
// o Sheet deslizante (mobile/tablet, <lg) — mesma estrutura de 3 seções +
// rodapé de usuário/logout nos dois lugares, só o contêiner externo muda.
function SidebarNav({
  email,
  souAdminSoftware,
  onLogout,
  onNavigate,
}: {
  email: string | undefined
  souAdminSoftware: boolean
  onLogout: () => void
  onNavigate?: () => void
}) {
  return (
    <>
      <FazendaSwitcher />

      <NavSection
        title="Manejo do Rebanho"
        items={manejoIndividual}
        onNavigate={onNavigate}
      />
      <NavSection
        title="Rebanho & Compliance"
        items={rebanhoCompliance}
        onNavigate={onNavigate}
      />
      <NavSection title="Financeiro" items={financeiro} onNavigate={onNavigate} />
      <NavSection
        title="Configurações"
        items={getConfiguracoesItems(souAdminSoftware)}
        onNavigate={onNavigate}
      />

      <div className="mt-auto flex flex-col gap-2 border-t border-border pt-4">
        <div className="truncate px-2 text-xs text-muted-foreground">
          {email}
        </div>
        <Button variant="outline" size="sm" onClick={onLogout}>
          <LogOutIcon />
          Sair
        </Button>
      </div>
    </>
  )
}

/**
 * Shell da área logada (spec seção 10 item 6). Renderizado por
 * `ProtectedRoute` em volta do `<Outlet/>` das rotas /app/*.
 *
 * Responsivo (retrofit 2026-07-20): sidebar fixa só a partir de `lg`
 * (1024px) — abaixo disso vira um Sheet deslizante acionado por um botão de
 * hambúrguer numa barra superior compacta, mantendo a mesma navegação de 3
 * seções nos dois casos (`SidebarNav`). Navegar por um item do Sheet fecha o
 * drawer automaticamente (`onNavigate`), evitando o usuário ter que fechar
 * manualmente depois de cada clique.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const souAdminSoftwareQuery = useSouAdminSoftware()
  const souAdminSoftware = souAdminSoftwareQuery.data === true

  async function handleLogout() {
    const { error } = await supabase.auth.signOut()
    if (error) {
      toast.error(`Erro ao sair: ${error.message}`)
      return
    }
    navigate("/login", { replace: true })
  }

  return (
    <div className="flex min-h-svh flex-col lg:flex-row">
      <header className="flex items-center justify-between gap-2 border-b border-border p-3 lg:hidden print:hidden">
        <div className="w-7" aria-hidden="true" />
        <div className="text-lg font-semibold">Livestock Control</div>
        <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
          <SheetTrigger
            render={
              <Button variant="ghost" size="icon-sm" aria-label="Abrir menu">
                <MenuIcon />
              </Button>
            }
          />
          <SheetContent side="right" className="w-72 max-w-[85vw] gap-6">
            <SheetHeader>
              <SheetTitle>Livestock Control</SheetTitle>
            </SheetHeader>
            <SidebarNav
              email={user?.email}
              souAdminSoftware={souAdminSoftware}
              onLogout={handleLogout}
              onNavigate={() => setMobileNavOpen(false)}
            />
          </SheetContent>
        </Sheet>
      </header>

      <aside className="hidden w-60 shrink-0 flex-col gap-6 border-r border-border bg-sidebar p-4 lg:flex print:hidden">
        <div className="px-2 text-lg font-semibold">Livestock Control</div>
        <SidebarNav
          email={user?.email}
          souAdminSoftware={souAdminSoftware}
          onLogout={handleLogout}
        />
      </aside>

      <main className="flex-1 overflow-y-auto p-4 sm:p-6">{children}</main>
    </div>
  )
}
