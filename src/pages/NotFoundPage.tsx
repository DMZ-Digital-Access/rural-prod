import { Link } from "react-router-dom"

export function NotFoundPage() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-3 text-center">
      <h1 className="text-2xl font-semibold">Página não encontrada</h1>
      <p className="text-muted-foreground">
        O endereço acessado não existe no Livestock Control.
      </p>
      <Link to="/" className="text-sm text-primary underline underline-offset-4">
        Voltar ao início
      </Link>
    </div>
  )
}
