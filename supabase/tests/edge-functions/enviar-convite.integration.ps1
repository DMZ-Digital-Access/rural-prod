# ============================================================================
# Teste de integração real (HTTP) da Edge Function enviar-convite.
#
# Convenção escolhida (qa/Emma, 2026-07-17): pgTAP (supabase/tests/database/)
# cobre banco (RLS, RPCs SECURITY DEFINER); Edge Functions em Deno não têm um
# equivalente nativo ao pgTAP no ecossistema Supabase CLI local, então este
# teste de integração é um script PowerShell que orquestra:
#   1. `supabase start` já rodando localmente (não iniciado por este script).
#   2. `supabase functions serve enviar-convite --no-verify-jwt` (iniciado
#      separadamente, ver instruções abaixo) — precisa de --no-verify-jwt
#      porque o teste quer exercitar a validação de auth da PRÓPRIA função
#      (auth.getUser() em index.ts), não o gate de JWT da plataforma.
#   3. Cria 2 usuários reais via GoTrue (signup real, sessão real, JWT real
#      assinado pelo GoTrue local) e fixtures de convite via psql direto
#      (docker exec no container do Postgres local).
#   4. Faz as 5 chamadas HTTP reais via curl.exe e valida status code +
#      corpo da resposta.
#   5. Limpa os dados de teste ao final (sucesso ou falha).
#
# Este script NÃO substitui os testes de lógica pura já existentes em
# supabase/functions/enviar-convite/index.test.ts (Deno.test) — cobre
# exatamente a lacuna que aquele arquivo documenta explicitamente que não
# cobre: o handler HTTP completo (index.ts), incluindo os status codes reais
# e a integração com auth.getUser()/service_role de verdade.
#
# Como rodar:
#   1. supabase start   (se ainda não estiver rodando)
#   2. Em outro terminal: supabase functions serve enviar-convite --no-verify-jwt
#   3. pwsh -File supabase/tests/edge-functions/enviar-convite.integration.ps1
#
# Idempotente: usa e-mails/timestamps únicos por execução, e sempre limpa os
# usuários de teste no finally (mesmo se uma asserção falhar no meio).
# ============================================================================

$ErrorActionPreference = "Stop"

$FuncUrl = "http://127.0.0.1:54321/functions/v1/enviar-convite"
$AnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0"
$DbContainer = "supabase_db_rural-prod"
$Suffix = [guid]::NewGuid().ToString("N").Substring(0, 8)
$AdminEmail = "qa.admin.$Suffix@teste.local"
$OtherEmail = "qa.naoadmin.$Suffix@teste.local"
$Password = "SenhaForte123!"

$script:Failures = 0
$script:TestCount = 0

function Assert-Equal($actual, $expected, $description) {
  $script:TestCount++
  if ("$actual" -eq "$expected") {
    Write-Output "ok $script:TestCount - $description"
  } else {
    $script:Failures++
    Write-Output "NOT OK $script:TestCount - $description (esperado '$expected', obtido '$actual')"
  }
}

function Invoke-Convite($token, $conviteId) {
  $bodyFile = New-TemporaryFile
  $outFile = New-TemporaryFile
  "{`"convite_id`":`"$conviteId`"}" | Out-File -FilePath $bodyFile -Encoding ascii -NoNewline
  $headers = @("-H", "apikey: $AnonKey", "-H", "Content-Type: application/json")
  if ($token) { $headers += @("-H", "Authorization: Bearer $token") }
  # Status code e corpo capturados separadamente (-o grava o corpo em
  # arquivo, -w imprime só o código) — mais robusto que fazer parsing de uma
  # string combinada, que se mostrou frágil com corpos multi-linha/split.
  $statusRaw = & curl.exe -s -o $outFile -w "%{http_code}" -X POST $FuncUrl @headers --data-binary "@$bodyFile"
  $body = Get-Content -Path $outFile -Raw -ErrorAction SilentlyContinue
  Remove-Item $bodyFile, $outFile -Force -ErrorAction SilentlyContinue
  [PSCustomObject]@{
    Body   = $body
    Status = [int]("$statusRaw".Trim())
  }
}

# Executa uma query via psql dentro do container do Postgres local e retorna
# uma única linha de saída, limpa (tuples-only/unaligned). Statements com
# efeito colateral (INSERT/UPDATE) são envolvidos numa CTE + SELECT externo
# de propósito: psql imprime o "command tag" (ex. "INSERT 0 1") como uma
# linha ADICIONAL de saída mesmo em modo -tA quando o comando de topo é um
# INSERT/UPDATE — o que corrompe qualquer captura ingênua de uma única
# linha. Envolver em `with ins as (insert ... returning ...) select ... from
# ins` faz o comando de topo ser um SELECT puro, que não gera esse tag.
function Invoke-PsqlScalar($sql) {
  $r = docker exec $DbContainer psql -U postgres -d postgres -tA -c $sql
  ($r | Select-Object -First 1).Trim()
}

try {
  Write-Output "=== Setup: criando usuarios de teste via GoTrue signup real ==="
  $bodyAdmin = @{ email = $AdminEmail; password = $Password; data = @{ nome_fazenda = "Fazenda QA Integration $Suffix"; nome = "QA Admin" } } | ConvertTo-Json
  $respAdmin = Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:54321/auth/v1/signup" -Headers @{ apikey = $AnonKey; "Content-Type" = "application/json" } -Body $bodyAdmin
  $AdminToken = $respAdmin.access_token
  $AdminId = $respAdmin.user.id

  $bodyOther = @{ email = $OtherEmail; password = $Password; data = @{ nome_fazenda = "Fazenda QA Outra $Suffix" } } | ConvertTo-Json
  $respOther = Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:54321/auth/v1/signup" -Headers @{ apikey = $AnonKey; "Content-Type" = "application/json" } -Body $bodyOther
  $OtherToken = $respOther.access_token

  $fazendaId = Invoke-PsqlScalar "select fazenda_id from public.usuarios_fazendas where usuario_id = '$AdminId';"

  $convitePendente = Invoke-PsqlScalar "with ins as (insert into public.convites (fazenda_id, convidado_email, papel_oferecido, convidado_por, status) values ('$fazendaId', 'convidado.$Suffix@teste.local', 'membro', '$AdminId', 'pendente') returning id) select id from ins;"
  $conviteCancelado = Invoke-PsqlScalar "with ins as (insert into public.convites (fazenda_id, convidado_email, papel_oferecido, convidado_por, status) values ('$fazendaId', 'convidado2.$Suffix@teste.local', 'membro', '$AdminId', 'cancelado') returning id) select id from ins;"
  $conviteInexistente = [guid]::NewGuid().ToString()

  Write-Output "Fixtures: fazenda=$fazendaId convite_pendente=$convitePendente convite_cancelado=$conviteCancelado"
  Write-Output ""
  Write-Output "=== Testes HTTP ==="

  $r1 = Invoke-Convite -token $null -conviteId $convitePendente
  Assert-Equal $r1.Status 401 "requisicao sem Authorization retorna 401"

  $r2 = Invoke-Convite -token $OtherToken -conviteId $convitePendente
  Assert-Equal $r2.Status 403 "chamador nao-admin da fazenda retorna 403"

  $r3 = Invoke-Convite -token $AdminToken -conviteId $conviteInexistente
  Assert-Equal $r3.Status 404 "convite_id inexistente retorna 404"

  $r4 = Invoke-Convite -token $AdminToken -conviteId $conviteCancelado
  Assert-Equal $r4.Status 409 "convite nao-pendente (cancelado) retorna erro (409)"

  $r5 = Invoke-Convite -token $AdminToken -conviteId $convitePendente
  Assert-Equal $r5.Status 200 "admin da fazenda + convite pendente retorna 200 (controle positivo)"

  Write-Output ""
  if ($script:Failures -eq 0) {
    Write-Output "TODOS OS $script:TestCount TESTES PASSARAM"
    exit 0
  } else {
    Write-Output "$script:Failures de $script:TestCount TESTES FALHARAM"
    exit 1
  }
}
finally {
  Write-Output ""
  Write-Output "=== Cleanup ==="
  docker exec $DbContainer psql -U postgres -d postgres -c "delete from auth.users where email in ('$AdminEmail','$OtherEmail');" | Out-Null
  Write-Output "usuarios de teste removidos (cascata limpa fazendas/usuarios_fazendas/convites)"
}
