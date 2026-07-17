/**
 * Placeholder honesto para módulos ainda não implementados (spec seção 10:
 * a estrutura de roteamento inteira já existe na Fase 1, mesmo que a
 * maioria dos módulos só entre nas Fases 2/3/4). Nunca 404, nunca tela em
 * branco — sempre deixa claro que a navegação está funcionando e o que
 * falta é conteúdo, não um bug.
 */
export function PlaceholderPage({
  title,
  fase,
}: {
  title: string
  fase: string
}) {
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="text-muted-foreground">
        Módulo em construção — {fase} do plano.
      </p>
    </div>
  )
}
