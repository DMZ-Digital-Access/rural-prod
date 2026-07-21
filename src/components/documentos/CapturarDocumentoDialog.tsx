import { useRef } from "react"
import { CameraIcon, FolderIcon, ImageIcon, PencilLineIcon, UploadIcon } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  TAMANHO_MAXIMO_ARQUIVO_DOCUMENTO_BYTES,
  TIPOS_ARQUIVO_DOCUMENTO_ACEITOS,
} from "@/lib/arquivoDocumento"

/**
 * Modal reutilizável de captura de documento. No mobile mostra três
 * origens separadas (Câmera/Galeria/Arquivos), como um app nativo; no
 * desktop mostra um único seletor (imagem ou PDF). Sempre oferece
 * "Preencher manualmente" para quem não tem documento físico em mãos.
 *
 * Só cuida da captura do arquivo — a leitura/classificação do conteúdo é
 * responsabilidade de quem usa este componente, para que qualquer área do
 * app (hoje: Novo Lançamento; no futuro: outros pontos de entrada de
 * documento) possa plugar sua própria lógica sem duplicar esta UI.
 */
export function CapturarDocumentoDialog({
  open,
  onOpenChange,
  titulo,
  descricao,
  processando = false,
  aceitarTipos = TIPOS_ARQUIVO_DOCUMENTO_ACEITOS,
  tamanhoMaximoBytes = TAMANHO_MAXIMO_ARQUIVO_DOCUMENTO_BYTES,
  onArquivoSelecionado,
  onPularCaptura,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  titulo: string
  descricao?: string
  processando?: boolean
  aceitarTipos?: string
  tamanhoMaximoBytes?: number
  onArquivoSelecionado: (arquivo: File) => void
  onPularCaptura: () => void
}) {
  const inputDesktopRef = useRef<HTMLInputElement>(null)
  const inputCameraRef = useRef<HTMLInputElement>(null)
  const inputGaleriaRef = useRef<HTMLInputElement>(null)
  const inputArquivosRef = useRef<HTMLInputElement>(null)

  function processarArquivo(arquivo: File | undefined) {
    if (!arquivo) return
    if (arquivo.size > tamanhoMaximoBytes) {
      toast.error("Arquivo excede o tamanho máximo permitido (10MB).")
      return
    }
    onArquivoSelecionado(arquivo)
  }

  function aoSelecionarInput(e: React.ChangeEvent<HTMLInputElement>) {
    processarArquivo(e.target.files?.[0])
    e.target.value = ""
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
        </DialogHeader>
        {descricao && <p className="text-sm text-muted-foreground">{descricao}</p>}

        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-2 sm:hidden">
            <input
              ref={inputCameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={aoSelecionarInput}
            />
            <Button
              type="button"
              variant="outline"
              disabled={processando}
              onClick={() => inputCameraRef.current?.click()}
            >
              <CameraIcon />
              Câmera
            </Button>

            <input
              ref={inputGaleriaRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={aoSelecionarInput}
            />
            <Button
              type="button"
              variant="outline"
              disabled={processando}
              onClick={() => inputGaleriaRef.current?.click()}
            >
              <ImageIcon />
              Galeria
            </Button>

            <input
              ref={inputArquivosRef}
              type="file"
              accept={aceitarTipos}
              className="hidden"
              onChange={aoSelecionarInput}
            />
            <Button
              type="button"
              variant="outline"
              disabled={processando}
              onClick={() => inputArquivosRef.current?.click()}
            >
              <FolderIcon />
              Arquivos
            </Button>
          </div>

          <div className="hidden sm:block">
            <input
              ref={inputDesktopRef}
              type="file"
              accept={aceitarTipos}
              className="hidden"
              onChange={aoSelecionarInput}
            />
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={processando}
              onClick={() => inputDesktopRef.current?.click()}
            >
              <UploadIcon />
              Selecionar arquivo
            </Button>
          </div>

          <Button type="button" variant="ghost" disabled={processando} onClick={onPularCaptura}>
            <PencilLineIcon />
            Preencher manualmente
          </Button>
        </div>

        {processando && (
          <p className="text-center text-sm text-muted-foreground">Lendo documento…</p>
        )}
      </DialogContent>
    </Dialog>
  )
}
