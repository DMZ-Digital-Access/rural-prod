import { Link, Outlet, useLocation, useNavigate } from "react-router-dom"
import { Tabs } from "@base-ui/react/tabs"
import { cn } from "@/lib/utils"

// Financeiro reorganizado (2026-07-22, pedido de JP): antes eram 4 itens
// soltos no menu (Transações, Financeiro, Fluxo de Caixa, Documentos
// Fiscais), todos dentro de "Rebanho & Compliance" — confuso porque
// "Financeiro" sozinho não era o financeiro completo da fazenda (não
// incluía compra/venda de animais), e "rebanho" na URL não fazia sentido
// pra uma área que é justamente o financeiro TOTAL da fazenda. Agora é uma
// única entrada de menu ("Financeiro", seção própria, fora de Rebanho &
// Compliance) com essas 4 páginas como abas de uma mesma área, sob
// `/app/financeiro`. As páginas em si (FluxoCaixaPage, TransacoesListPage,
// LancamentosListPage, DocumentosFiscaisPage) não mudaram de conteúdo, só
// de rota — Saldo de Rebanho continua fora daqui, em Rebanho & Compliance,
// por ser sobre estoque de animais, não sobre dinheiro.
const ABAS = [
  { path: "/app/financeiro", label: "Visão Geral" },
  { path: "/app/financeiro/transacoes", label: "Transações de Animais" },
  { path: "/app/financeiro/lancamentos", label: "Lançamentos Gerais" },
  { path: "/app/financeiro/documentos", label: "Documentos Fiscais" },
] as const

// Rotas de detalhe (ex.: /financeiro/transacoes/:id) devem manter a aba-mãe
// destacada — daí o prefixo mais longo que casa com o pathname atual, não
// uma igualdade exata.
function abaAtiva(pathname: string): string {
  const candidatas = ABAS.filter(
    (aba) => pathname === aba.path || pathname.startsWith(`${aba.path}/`)
  )
  candidatas.sort((a, b) => b.path.length - a.path.length)
  return candidatas[0]?.path ?? ABAS[0].path
}

export function FinanceiroLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const ativa = abaAtiva(location.pathname)

  return (
    <div className="flex flex-col gap-4">
      <Tabs.Root value={ativa} onValueChange={(v) => navigate(v as string)}>
        <Tabs.List className="flex gap-1 overflow-x-auto border-b border-border">
          {ABAS.map((aba) => (
            <Tabs.Tab
              key={aba.path}
              value={aba.path}
              nativeButton={false}
              render={<Link to={aba.path} />}
              className={cn(
                "shrink-0 whitespace-nowrap border-b-2 border-transparent px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
                "aria-selected:border-foreground aria-selected:text-foreground"
              )}
            >
              {aba.label}
            </Tabs.Tab>
          ))}
        </Tabs.List>
      </Tabs.Root>
      <Outlet />
    </div>
  )
}
