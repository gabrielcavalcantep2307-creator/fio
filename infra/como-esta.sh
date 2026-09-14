#!/usr/bin/env bash
# Em que pé está a esteira — sem precisar perguntar a ninguém.
#
#   bash infra/como-esta.sh
#
# Existe porque em 14/09/2026 a esteira passou 1h34 parada num pedido de rede
# que nunca voltaria, e do lado de fora isso é idêntico a "está traduzindo um
# livro grande". A diferença entre as duas está no tempo de PROCESSADOR: quem
# traduz gasta minutos dele, quem está pendurado gasta segundos. É a primeira
# coisa que este script mostra.

cd "$(dirname "$0")/.."
LOG=dados/traducoes/esteira.log

echo "== está viva? =="
if command -v powershell.exe > /dev/null 2>&1; then
  powershell.exe -NoProfile -Command '
    [Console]::OutputEncoding = [Text.Encoding]::UTF8
    $p = Get-CimInstance Win32_Process -Filter "Name = '"'"'node.exe'"'"'" |
      Where-Object { $_.CommandLine -match "esteira|traduzir-obra" }
    if (-not $p) { "   nenhuma esteira rodando"; exit }
    foreach ($x in $p) {
      $proc = Get-Process -Id $x.ProcessId
      $vivo = [int]((Get-Date) - $proc.StartTime).TotalMinutes
      $cpu  = [int]$proc.CPU
      $quem = if ($x.CommandLine -match "--titulo (\S+)") { $matches[1] } else { "esteira" }
      $aviso = if ($cpu -lt ($vivo * 2) -and $vivo -gt 5) { "  <-- PENDURADA?" } else { "" }
      "   {0,-18} {1,4} min de pé, {2,4}s de processador{3}" -f $quem, $vivo, $cpu, $aviso
    }' 2>/dev/null | tr -d '\r'
fi

echo
echo "== últimas linhas =="
[ -f "$LOG" ] && tr '\r' '\n' < "$LOG" | grep -E '^\[|pronto:|FALHOU|↑|esteira:' | tail -12 || echo "   sem log ainda"

echo
echo "== traduzidas até agora =="
ls dados/traducoes/obra*.json 2>/dev/null | wc -l | tr -d ' ' | xargs -I{} echo "   {} livros prontos para instalar"
