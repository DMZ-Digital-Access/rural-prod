import { useMemo, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Link, useNavigate, useSearchParams } from "react-router-dom"
import { toast } from "sonner"
import { supabase } from "@/lib/supabase"
import {
  buildSignupSchema,
  type SignupFormValues,
} from "@/lib/validations/auth"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"

export function SignupPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const conviteToken = searchParams.get("convite")
  const temConvite = !!conviteToken
  const [submitError, setSubmitError] = useState<string | null>(null)

  // TODO(developer/db_sage): ADR-0002 D2 e as policies de SELECT de
  // `convites` exigem `authenticated` E ser admin/destinatário — não há
  // hoje um caminho de leitura pública (anon) que permita mostrar "você
  // está entrando na fazenda X, como Y" nesta tela antes do usuário
  // completar o cadastro. Resolver isso exigiria uma nova policy de SELECT
  // (ex.: por token, sem exigir sessão) que não foi pedida nem revisada
  // pelo cyber_chief — não implementada aqui de propósito. Por ora, a tela
  // só informa que o cadastro vai entrar numa fazenda existente via
  // convite, sem detalhar qual.
  const schema = useMemo(() => buildSignupSchema(temConvite), [temConvite])

  const form = useForm<SignupFormValues>({
    resolver: zodResolver(schema),
    defaultValues: { nome: "", email: "", password: "", nomeFazenda: "" },
  })

  async function onSubmit(values: SignupFormValues) {
    setSubmitError(null)

    const { data, error } = await supabase.auth.signUp({
      email: values.email,
      password: values.password,
      options: {
        data: {
          nome: values.nome,
          ...(temConvite
            ? { convite_token: conviteToken }
            : { nome_fazenda: values.nomeFazenda }),
        },
      },
    })

    if (error) {
      // ADR-0001/ADR-0002: exceções de handle_new_user() (RAISE EXCEPTION)
      // propagam como AuthApiError com a mensagem exata do banco (ex.:
      // "Convite não corresponde ao e-mail desta conta", "Convite
      // expirado") — mostrada tal como veio, não uma mensagem genérica.
      setSubmitError(error.message)
      return
    }

    if (!data.session) {
      // Confirmação de e-mail habilitada no projeto Supabase (ver
      // PROJECT_CONTEXT.md seção 4) — sem sessão até o usuário confirmar.
      toast.success("Cadastro realizado. Verifique seu e-mail para confirmar a conta.")
      navigate("/login", { replace: true })
      return
    }

    toast.success("Cadastro realizado com sucesso.")
    navigate("/app/dashboard", { replace: true })
  }

  return (
    <div className="flex min-h-svh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Criar conta</CardTitle>
          <CardDescription>
            {temConvite
              ? "Você está aceitando um convite para entrar numa fazenda existente."
              : "Cadastre-se para começar a gerenciar sua fazenda."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(onSubmit)}
              className="flex flex-col gap-4"
            >
              <FormField
                control={form.control}
                name="nome"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome</FormLabel>
                    <FormControl>
                      <Input autoComplete="name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>E-mail</FormLabel>
                    <FormControl>
                      <Input type="email" autoComplete="email" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Senha</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        autoComplete="new-password"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {!temConvite && (
                <FormField
                  control={form.control}
                  name="nomeFazenda"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nome da fazenda</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {submitError && (
                <p className="text-sm font-medium text-destructive" role="alert">
                  {submitError}
                </p>
              )}

              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? "Criando conta…" : "Criar conta"}
              </Button>
            </form>
          </Form>

          <p className="mt-4 text-center text-sm text-muted-foreground">
            Já tem conta?{" "}
            <Link to="/login" className="text-primary underline underline-offset-4">
              Entrar
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
