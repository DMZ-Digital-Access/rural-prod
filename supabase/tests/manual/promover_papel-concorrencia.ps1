# ============================================================================
# Teste de CONCORRÊNCIA REAL para promover_papel() — achado nº 2 do gate
# cyber_chief no ADR-0002
# (.agents/memory/log/2026-07-16-cyber_chief-review-adr0002.md): TOCTOU na
# guarda "a fazenda nunca fica sem admin".
#
# Por que este teste NÃO está em supabase/tests/database/ (pgTAP): pgTAP
# roda cada arquivo de teste dentro de UMA transação/sessão só — não existe
# como simular duas conexões concorrentes de verdade dali. Este script abre
# duas sessões psql REAIS (via docker exec no container do Postgres local) e
# orquestra a corrida deliberadamente:
#
#   Sessão A: BEGIN; trava manualmente as linhas admin da fazenda (mesmas
#             linhas que promover_papel() trava internamente via
#             `for update`); dorme 5s segurando o lock; SÓ ENTÃO chama
#             promover_papel() para rebaixar o admin A; COMMIT.
#   Sessão B: inicia ~2s depois de A (A já está com o lock); chama
#             promover_papel() para rebaixar o admin B (um admin DIFERENTE
#             da MESMA fazenda) imediatamente — como a função também tenta
#             `for update` nas mesmas linhas, B bloqueia de verdade até A
#             commitar, e só então reavalia a contagem de admins restantes
#             com o dado já commitado (papel de A já alterado).
#
# Resultado esperado (prova de que o fix do achado nº2 funciona sob
# concorrência real, não só no caso sequencial): exatamente UMA das duas
# chamadas tem sucesso; a outra é bloqueada pela guarda "a fazenda ficaria
# sem nenhum admin"; a fazenda termina com exatamente 1 admin, nunca 0.
#
# Como rodar: pwsh -File supabase/tests/manual/promover_papel-concorrencia.ps1
# Pré-requisito: `supabase start` já rodando localmente.
# ============================================================================

$ErrorActionPreference = "Stop"
$DbContainer = "supabase_db_rural-prod"
$Suffix = [guid]::NewGuid().ToString("N").Substring(0, 8)
$EmailA = "concorrencia.a.$Suffix@teste.local"
$EmailB = "concorrencia.b.$Suffix@teste.local"

function Psql-Scalar($sql) {
  $r = docker exec $DbContainer psql -U postgres -d postgres -tA -c $sql
  ($r | Select-Object -First 1).Trim()
}

function Psql-Exec($sql) {
  docker exec $DbContainer psql -U postgres -d postgres -c $sql | Out-Null
}

try {
  Write-Output "=== Setup: fazenda com exatamente 2 admins ==="
  $adminA = [guid]::NewGuid().ToString()
  $adminB = [guid]::NewGuid().ToString()

  Psql-Exec "insert into auth.users (id, email, raw_user_meta_data, aud, role, instance_id) values ('$adminA', '$EmailA', jsonb_build_object('nome_fazenda','Fazenda Concorrencia $Suffix'), 'authenticated','authenticated','00000000-0000-0000-0000-000000000000');"
  $fazendaId = Psql-Scalar "select fazenda_id from public.usuarios_fazendas where usuario_id = '$adminA';"
  Psql-Exec "insert into auth.users (id, email, raw_user_meta_data, aud, role, instance_id) values ('$adminB', '$EmailB', jsonb_build_object('nome_fazenda','Fazenda Concorrencia B $Suffix (nao usada)'), 'authenticated','authenticated','00000000-0000-0000-0000-000000000000');"
  Psql-Exec "insert into public.usuarios_fazendas (usuario_id, fazenda_id, papel) values ('$adminB', '$fazendaId', 'admin');"

  Write-Output "fazenda=$fazendaId admin_a=$adminA admin_b=$adminB"

  $sessionA = @"
\echo SESSION_A_START
BEGIN;
SELECT 1 FROM public.usuarios_fazendas WHERE fazenda_id = '$fazendaId' AND papel = 'admin' FOR UPDATE;
\echo SESSION_A_LOCK_ACQUIRED
SELECT pg_sleep(5);
SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub','$adminA','email','$EmailA','role','authenticated')::text, true);
SELECT public.promover_papel('$fazendaId'::uuid, '$adminA'::uuid, 'membro') AS resultado_a;
COMMIT;
\echo SESSION_A_DONE
"@

  $sessionB = @"
\echo SESSION_B_START
BEGIN;
SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub','$adminB','email','$EmailB','role','authenticated')::text, true);
\echo SESSION_B_CALLING_PROMOVER_PAPEL
SELECT public.promover_papel('$fazendaId'::uuid, '$adminB'::uuid, 'membro') AS resultado_b;
COMMIT;
\echo SESSION_B_DONE
"@

  $fileA = New-TemporaryFile
  $fileB = New-TemporaryFile
  Set-Content -Path $fileA -Value $sessionA -Encoding ascii
  Set-Content -Path $fileB -Value $sessionB -Encoding ascii
  docker cp $fileA "${DbContainer}:/tmp/session_a_$Suffix.sql" | Out-Null
  docker cp $fileB "${DbContainer}:/tmp/session_b_$Suffix.sql" | Out-Null

  Write-Output ""
  Write-Output "=== Disparando as duas sessoes concorrentes ==="
  $outA = New-TemporaryFile
  $jobA = Start-Job -ScriptBlock {
    param($container, $file, $out)
    docker exec $container psql -U postgres -d postgres -f $file *> $out
  } -ArgumentList $DbContainer, "/tmp/session_a_$Suffix.sql", $outA

  Start-Sleep -Seconds 2   # garante que a sessao A ja adquiriu o lock antes de B comecar
  # A sessao B espera terminar com um ERROR de verdade (rejeicao da guarda) —
  # psql escreve isso em stderr. Com $ErrorActionPreference = Stop (topo do
  # script), redirecionar stderr via 2>&1 de um comando nativo vira uma
  # excecao terminante em vez de só texto capturado — por isso relaxamos
  # para Continue só ao redor desta chamada específica.
  $prevEAP = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  $outB = docker exec $DbContainer psql -U postgres -d postgres -f "/tmp/session_b_$Suffix.sql" 2>&1 | Out-String
  $ErrorActionPreference = $prevEAP

  Wait-Job $jobA | Out-Null
  $outAContent = Get-Content $outA -Raw
  Remove-Job $jobA -Force

  Write-Output "--- Saida sessao A ---"
  Write-Output $outAContent
  Write-Output "--- Saida sessao B ---"
  Write-Output $outB

  Write-Output ""
  Write-Output "=== Verificacao final ==="
  $adminsRestantes = Psql-Scalar "select count(*) from public.usuarios_fazendas where fazenda_id = '$fazendaId' and papel = 'admin';"
  $papelA = Psql-Scalar "select papel from public.usuarios_fazendas where fazenda_id = '$fazendaId' and usuario_id = '$adminA';"
  $papelB = Psql-Scalar "select papel from public.usuarios_fazendas where fazenda_id = '$fazendaId' and usuario_id = '$adminB';"

  Write-Output "admins_restantes=$adminsRestantes papel_a=$papelA papel_b=$papelB"

  $sessionARejeitada = $outAContent -match "ficaria sem nenhum admin"
  $sessionBRejeitada = $outB -match "ficaria sem nenhum admin"

  $pass = $true
  if ("$adminsRestantes" -ne "1") {
    Write-Output "FALHA: esperado exatamente 1 admin restante, obtido $adminsRestantes"
    $pass = $false
  } else {
    Write-Output "ok - fazenda termina com exatamente 1 admin (nunca 0)"
  }

  if ($sessionARejeitada -and $sessionBRejeitada) {
    Write-Output "FALHA: as duas sessoes foram rejeitadas (nenhuma deveria: uma tem que suceder)"
    $pass = $false
  } elseif (-not $sessionARejeitada -and -not $sessionBRejeitada) {
    Write-Output "FALHA: nenhuma sessao foi rejeitada (ambas sucederam -> zerou admins, bug reproduzido!)"
    $pass = $false
  } else {
    Write-Output "ok - exatamente uma das duas chamadas concorrentes foi corretamente bloqueada pela guarda"
  }

  if ($pass) {
    Write-Output ""
    Write-Output "TESTE DE CONCORRENCIA PASSOU"
    exit 0
  } else {
    Write-Output ""
    Write-Output "TESTE DE CONCORRENCIA FALHOU"
    exit 1
  }
}
finally {
  Write-Output ""
  Write-Output "=== Cleanup ==="
  Psql-Exec "delete from auth.users where email in ('$EmailA','$EmailB');"
  docker exec $DbContainer bash -c "rm -f /tmp/session_a_$Suffix.sql /tmp/session_b_$Suffix.sql" 2>$null | Out-Null
  Write-Output "usuarios de teste removidos"
}
