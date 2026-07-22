import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { RouterProvider } from "react-router-dom"
import { AuthProvider } from "@/lib/auth"
import { FazendaSelecionadaProvider } from "@/lib/fazendaSelecionada"
import { Toaster } from "@/components/ui/sonner"
import { router } from "@/router"

const queryClient = new QueryClient()

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <FazendaSelecionadaProvider>
          <RouterProvider router={router} />
          <Toaster />
        </FazendaSelecionadaProvider>
      </AuthProvider>
    </QueryClientProvider>
  )
}

export default App
