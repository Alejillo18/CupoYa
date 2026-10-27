param(
  [ValidateSet('kill', 'pause')][string]$Modo = 'kill',
  [int]$Mata = 20,
  [int]$Levanta = 50,
  [int]$Duracion = 110
)

$raiz = Split-Path $PSScriptRoot -Parent
$url = 'http://localhost:8080/api/v1/auth/login'
$cuerpo = '{"email":"nadie@example.test","password":"Password123!"}'
$compose = @('compose', '-f', 'docker-compose.yml', '-f', 'docker-compose.prod.yml', '-f', 'docker-compose.e2e.yml')

function Sonda {
  $cr = [System.Diagnostics.Stopwatch]::StartNew()
  try {
    $r = Invoke-WebRequest -UseBasicParsing -Uri $url -Method Post -ContentType 'application/json' -Body $cuerpo -TimeoutSec 20
    $codigo = [int]$r.StatusCode
  } catch {
    if ($_.Exception.Response) { $codigo = [int]$_.Exception.Response.StatusCode } else { $codigo = 0 }
  }
  [pscustomobject]@{ codigo = $codigo; ms = [int]$cr.ElapsedMilliseconds }
}

function Evaluar($ok, $texto) {
  if ($ok) { Write-Host "  [OK]    $texto" -ForegroundColor Green }
  else { Write-Host "  [FALLA] $texto" -ForegroundColor Red }
}

function Resumen($nombre, $filas) {
  $filas = @($filas)
  if ($filas.Count -eq 0) { Write-Host "  ${nombre}: sin muestras"; return }
  $codigos = ($filas | Group-Object codigo | ForEach-Object { "$($_.Name) x$($_.Count)" }) -join '  '
  $max = ($filas | Measure-Object ms -Maximum).Maximum
  Write-Host "  ${nombre}: $($filas.Count) muestras | codigos $codigos | latencia maxima $max ms"
}

Push-Location $raiz
try {
  $id = docker @compose ps -q redis
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  $filas = New-Object System.Collections.Generic.List[object]
  $caido = $false
  $levantado = $false

  Write-Host "Modo: $Modo | Redis se $(if ($Modo -eq 'kill') { 'mata' } else { 'congela' }) en t=$Mata s y se restaura en t=$Levanta s"

  while ($sw.Elapsed.TotalSeconds -lt $Duracion) {
    $t = [math]::Round($sw.Elapsed.TotalSeconds, 1)

    if (-not $caido -and $t -ge $Mata) {
      if ($Modo -eq 'kill') { docker kill $id | Out-Null } else { docker pause $id | Out-Null }
      $caido = $true
      Write-Host ('[{0,6}s] REDIS CAIDO' -f $t) -ForegroundColor Yellow
    }
    elseif ($caido -and -not $levantado -and $t -ge $Levanta) {
      if ($Modo -eq 'kill') { docker start $id | Out-Null } else { docker unpause $id | Out-Null }
      $levantado = $true
      Write-Host ('[{0,6}s] REDIS RESTAURADO' -f $t) -ForegroundColor Yellow
    }

    $s = Sonda
    $filas.Add([pscustomobject]@{ t = $t; codigo = $s.codigo; ms = $s.ms })
    Start-Sleep -Milliseconds 500
  }

  Write-Host "`n=== LINEA DE TIEMPO (cada cambio de codigo) ===" -ForegroundColor Cyan
  $previo = $null
  foreach ($f in $filas) {
    if ($f.codigo -ne $previo) {
      Write-Host ('  t={0,6}s  codigo {1}  ({2} ms)' -f $f.t, $f.codigo, $f.ms)
      $previo = $f.codigo
    }
  }

  $antes = $filas | Where-Object { $_.t -lt $Mata }
  $durante = $filas | Where-Object { $_.t -ge $Mata -and $_.t -lt $Levanta }
  $despues = $filas | Where-Object { $_.t -ge $Levanta }

  Write-Host "`n=== RESUMEN ($Modo) ===" -ForegroundColor Cyan
  Resumen 'antes  ' $antes
  Resumen 'durante' $durante
  Resumen 'despues' $despues

  Write-Host ''
  Evaluar (@($antes | Where-Object { $_.codigo -eq 429 }).Count -gt 0) 'el limitador funciona antes de la caida (hay 429)'
  Evaluar (@($durante | Where-Object { $_.codigo -eq 0 -or $_.codigo -ge 500 }).Count -eq 0) 'falla abierto: sin 5xx ni timeouts mientras Redis esta caido'
  $maxDurante = ($durante | Measure-Object ms -Maximum).Maximum
  Evaluar (($null -ne $maxDurante) -and ($maxDurante -le 3000)) "no se cuelga: latencia maxima durante la caida <= 3000 ms (fue $maxDurante ms)"
  Evaluar (@($despues | Where-Object { $_.codigo -eq 429 }).Count -gt 0) 'el limitador se recupera: reaparecen los 429 tras restaurar Redis'
}
finally {
  # Pase lo que pase, Redis queda andando
  docker unpause $id 2>$null | Out-Null
  docker start $id 2>$null | Out-Null
  docker @compose up -d redis | Out-Null
  Pop-Location
}