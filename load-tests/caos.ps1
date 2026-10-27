$raiz = Split-Path $PSScriptRoot -Parent
$base = 'http://localhost:8080'
$compose = @('compose', '-f', 'docker-compose.yml', '-f', 'docker-compose.prod.yml', '-f', 'docker-compose.e2e.yml')


$plan = @(
  @{ nombre = 'BACKEND';       servicio = 'backend'; mata = 80;  levanta = 105 },
  @{ nombre = 'BASE_DE_DATOS'; servicio = 'db';      mata = 150; levanta = 175 }
)
$duracion = 330

function Sonda($url, $cab) {
  $cr = [System.Diagnostics.Stopwatch]::StartNew()
  try {
    if ($cab) { $r = Invoke-WebRequest -UseBasicParsing -Uri $url -Headers $cab -TimeoutSec 3 }
    else { $r = Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 3 }
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

Push-Location $raiz
try {
  $datos = Get-Content (Join-Path $PSScriptRoot 'data.json') -Raw | ConvertFrom-Json
  $cabeceras = @{ Authorization = "Bearer $($datos.tokens[0])" }

  Write-Host 'Iniciando la carga mixta (k6) en segundo plano...'
  $trabajoK6 = Start-Job -ScriptBlock {
    param($carpeta)
    docker run --rm -v "${carpeta}:/scripts" -w /scripts -e FASE=mixta grafana/k6 run --quiet e2e.js
  } -ArgumentList $PSScriptRoot

  foreach ($f in $plan) { $f.estado = 'pendiente'; $f.tMata = $null; $f.tLevanta = $null; $f.id = $null }

  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  $filas = New-Object System.Collections.Generic.List[object]

  while ($sw.Elapsed.TotalSeconds -lt $duracion) {
    $t = [math]::Round($sw.Elapsed.TotalSeconds, 1)
    $marca = ''

    foreach ($f in $plan) {
      if ($f.estado -eq 'pendiente' -and $t -ge $f.mata) {
        $f.id = docker @compose ps -q $f.servicio
        docker kill $f.id | Out-Null
        $f.estado = 'caido'
        $f.tMata = $t
        $marca = "KILL_$($f.nombre)"
        Write-Host ('[{0,6}s] {1}' -f $t, $marca) -ForegroundColor Yellow
      }
      elseif ($f.estado -eq 'caido' -and $t -ge $f.levanta) {
        docker start $f.id | Out-Null
        $f.estado = 'levantado'
        $f.tLevanta = $t
        $marca = "START_$($f.nombre)"
        Write-Host ('[{0,6}s] {1}' -f $t, $marca) -ForegroundColor Yellow
      }
    }

    $h = Sonda "$base/api/v1/health" $null
    $e = Sonda "$base/api/v1/events" $cabeceras
    $filas.Add([pscustomobject]@{
      t = $t; marca = $marca
      health = $h.codigo; health_ms = $h.ms
      events = $e.codigo; events_ms = $e.ms
    })
    Start-Sleep -Milliseconds 500
  }

  $filas | Export-Csv (Join-Path $PSScriptRoot 'caos-sonda.csv') -NoTypeInformation -Encoding UTF8

  Write-Host "`n=== RESUMEN DE RECUPERACION ===" -ForegroundColor Cyan
  for ($n = 0; $n -lt $plan.Count; $n++) {
    $f = $plan[$n]
    if ($null -eq $f.tMata) { continue }
    $limite = [double]::MaxValue
    if ($n + 1 -lt $plan.Count) { $limite = $plan[$n + 1].mata }

    $ventana = @($filas | Where-Object { $_.t -ge $f.tMata -and $_.t -lt $limite })
    $caida = @($ventana | Where-Object { $_.t -lt $f.tLevanta })
    $fallos = @($caida | Where-Object { $_.events -ne 200 })

    Write-Host "`n$($f.nombre): kill en t=$($f.tMata) s, start en t=$($f.tLevanta) s" -ForegroundColor Cyan
    if ($fallos.Count -eq 0) {
      Write-Host '  el servicio nunca dejo de responder' -ForegroundColor Green
      continue
    }

    $codigos = ($fallos | Group-Object events | ForEach-Object { "$($_.Name) x$($_.Count)" }) -join '   '
    $maxMs = ($fallos | Measure-Object events_ms -Maximum).Maximum
    Write-Host "  durante la caida: codigos $codigos   |   latencia maxima de la sonda: $maxMs ms"

    $despues = @($ventana | Where-Object { $_.t -ge $f.tLevanta })
    $rec = $null
    for ($k = 0; $k -lt $despues.Count - 2; $k++) {
      if ($despues[$k].events -eq 200 -and $despues[$k + 1].events -eq 200 -and $despues[$k + 2].events -eq 200) {
        $rec = [math]::Round($despues[$k].t - $f.tLevanta, 1)
        break
      }
    }
    if ($null -ne $rec) { Write-Host "  estable de nuevo $rec s despues del start" }
    else { Write-Host '  NO volvio a ser estable dentro de la ventana' -ForegroundColor Red }

    Evaluar ((@($fallos | Where-Object { $_.events -eq 0 }).Count -eq 0) -and ($maxMs -le 3000)) 'falla rapido (sin timeouts, <= 3 s por sonda)'
    Evaluar (@($fallos | Where-Object { $_.events -ne 503 }).Count -eq 0) 'solo respuestas 503 mientras esta caido'
    Evaluar (($null -ne $rec) -and ($rec -le 60)) 'se recupera en 60 s o menos despues del start'
  }

  Write-Host "`nEsperando el resumen de k6..."
  $salida = Receive-Job $trabajoK6 -Wait -AutoRemoveJob
  $salida | Out-File (Join-Path $PSScriptRoot 'k6-caos.txt') -Encoding UTF8
  $salida
  Write-Host "`nListo. Archivos: load-tests\caos-sonda.csv y load-tests\k6-caos.txt"
  Write-Host 'Ahora: cd load-tests; npm run verify'
}
finally {

  docker @compose up -d | Out-Null
  Pop-Location
}