import path from "node:path"
import { defineConfig } from "vitest/config"

// Config de teste separada de vite.config.ts (Fase 1, developer/Ryan):
// não existia framework de teste frontend configurado neste projeto ainda
// — Vitest escolhido por ser o padrão de facto para projetos Vite, zero
// configuração extra de bundler, e reaproveitar a mesma sintaxe de asserção
// usada nos testes de banco/Edge Function do squad (`describe`/`it`/
// `expect`, já familiar pelo trabalho do `qa`). Escopo desta rodada: só os
// schemas zod de validação de formulário (login/signup), que são puros e
// não exigem DOM/Testing Library — ver log da tarefa para a lacuna
// declarada de teste de componente.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
})
