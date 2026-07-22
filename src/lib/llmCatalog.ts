// Catálogo de provedores/modelos de LLM disponíveis para a classificação
// assistida por IA de lançamentos financeiros (Módulo Financeiro, item 18 —
// ver especificacao-sistema.md seção 12). Chave de API é compartilhada/
// nossa (decisão confirmada com JP) — o admin só escolhe entre o que já
// está configurado no backend, não cadastra credencial própria.
//
// `llm_model` é texto livre no banco (fazendas.llm_model) — este catálogo é
// só a lista de opções válidas exibidas no frontend; a Edge Function que
// efetivamente chama o provedor (ainda não implementada) valida contra a
// mesma lista antes de fazer a chamada.

export type LlmProvider = "anthropic" | "openai" | "gemini"

export type LlmModelOption = {
  id: string
  label: string
  descricao: string
}

export const LLM_CATALOG: Record<
  LlmProvider,
  { label: string; models: LlmModelOption[] }
> = {
  anthropic: {
    label: "Anthropic (Claude)",
    models: [
      {
        id: "claude-haiku-4-5",
        label: "Claude Haiku 4.5",
        descricao: "Rápido e econômico — recomendado para leitura de documentos",
      },
      {
        id: "claude-sonnet-5",
        label: "Claude Sonnet 5",
        descricao: "Mais preciso, custo intermediário",
      },
      {
        id: "claude-opus-4-8",
        label: "Claude Opus 4.8",
        descricao: "Máxima precisão, custo mais alto",
      },
    ],
  },
  openai: {
    label: "OpenAI (GPT)",
    models: [
      {
        id: "gpt-4o-mini",
        label: "GPT-4o mini",
        descricao: "Rápido e econômico",
      },
      {
        id: "gpt-4o",
        label: "GPT-4o",
        descricao: "Mais preciso, custo intermediário",
      },
    ],
  },
  gemini: {
    label: "Google (Gemini)",
    // Lista corrigida em 2026-07-21: gemini-2.5-pro/gemini-2.5-flash/
    // gemini-3-pro-preview foram removidos por estarem DESATIVADOS pelo
    // Google para chaves de API novas (erro real "no longer available to
    // new users" ao configurar a GEMINI_API_KEY de produção — não é uma
    // suposição, foi confirmado com chamadas HTTP reais). Ver
    // .agents/memory/log/2026-07-21-correcao-api-gemini-interactions.md.
    //
    // Atualização de 2026-07-22 (pedido de JP): gemini-2.5-flash-lite deveria
    // virar o novo padrão, gemini-3.5-flash-lite como segundo. Validado com
    // uso real (upload de documento via classificar-documento) antes de
    // confiar cegamente, mesmo cuidado já usado nesta sessão pro
    // gemini-3.6-flash — achado real: gemini-2.5-flash-lite está MORTO
    // ("no longer available to new users", mesmo erro de antes, confirmado
    // por chamada real, não suposição) — removido do catálogo. Só
    // gemini-3.5-flash-lite (testado com sucesso, extração real) vira o
    // novo padrão.
    models: [
      {
        id: "gemini-3.5-flash-lite",
        label: "Gemini 3.5 Flash Lite",
        descricao: "Rápido e econômico — recomendado para leitura de documentos",
      },
      {
        id: "gemini-3.6-flash",
        label: "Gemini 3.6 Flash",
        descricao: "Rápido e econômico",
      },
      {
        id: "gemini-3.5-flash",
        label: "Gemini 3.5 Flash",
        descricao: "Rápido e econômico",
      },
      {
        id: "gemini-3.1-pro-preview",
        label: "Gemini 3.1 Pro (preview)",
        descricao: "Maior capacidade, versão preview",
      },
    ],
  },
}

export const LLM_PROVIDER_LABELS: Record<LlmProvider, string> = {
  anthropic: LLM_CATALOG.anthropic.label,
  openai: LLM_CATALOG.openai.label,
  gemini: LLM_CATALOG.gemini.label,
}
