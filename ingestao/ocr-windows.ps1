# OCR com o motor que já vem no Windows 10/11 (Windows.Media.Ocr).
# Sem instalar nada e sem mandar imagem para fora da máquina.
#
#   powershell -File ingestao/ocr-windows.ps1 -Imagem pagina.jpg [-Idioma en-US]
#
# Escreve JSON na saída: { largura, altura, linhas: [{ texto, x, y, w, h, palavras: [...] }] }
# As coordenadas são em pixels da imagem original.
param(
  [Parameter(Mandatory = $true)][string]$Imagem,
  [string]$Idioma = 'en-US',
  [double]$Escala = 1.0
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
$null = [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics, ContentType = WindowsRuntime]
$null = [Windows.Globalization.Language, Windows.Globalization, ContentType = WindowsRuntime]

$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
function Esperar($op, [Type]$tipo) {
  $t = $asTask.MakeGenericMethod($tipo).Invoke($null, @($op))
  $t.Wait() | Out-Null
  $t.Result
}

$arquivo = Esperar ([Windows.Storage.StorageFile]::GetFileFromPathAsync((Resolve-Path $Imagem).Path)) ([Windows.Storage.StorageFile])
$fluxo = Esperar ($arquivo.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
$decodificador = Esperar ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($fluxo)) ([Windows.Graphics.Imaging.BitmapDecoder])
$largura = $decodificador.PixelWidth; $altura = $decodificador.PixelHeight

# O motor recusa imagem maior que MaxImageDimension; reduz se for preciso.
$max = [Windows.Media.Ocr.OcrEngine]::MaxImageDimension
$fator = [Math]::Min($Escala, [Math]::Min($max / $largura, $max / $altura))
if ($fator -ne 1.0) {
  $transf = New-Object Windows.Graphics.Imaging.BitmapTransform
  $transf.ScaledWidth = [uint32][Math]::Floor($largura * $fator)
  $transf.ScaledHeight = [uint32][Math]::Floor($altura * $fator)
  $transf.InterpolationMode = [Windows.Graphics.Imaging.BitmapInterpolationMode]::Fant
  $bitmap = Esperar ($decodificador.GetSoftwareBitmapAsync([Windows.Graphics.Imaging.BitmapPixelFormat]::Bgra8, [Windows.Graphics.Imaging.BitmapAlphaMode]::Premultiplied, $transf, [Windows.Graphics.Imaging.ExifOrientationMode]::IgnoreExifOrientation, [Windows.Graphics.Imaging.ColorManagementMode]::DoNotColorManage)) ([Windows.Graphics.Imaging.SoftwareBitmap])
} else {
  $bitmap = Esperar ($decodificador.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
}

$motor = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage((New-Object Windows.Globalization.Language $Idioma))
if (-not $motor) { throw "Sem pacote de OCR para $Idioma neste Windows." }
$resultado = Esperar ($motor.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])

$linhas = foreach ($l in $resultado.Lines) {
  $ps = foreach ($p in $l.Words) {
    [ordered]@{ texto = $p.Text; x = [int]($p.BoundingRect.X / $fator); y = [int]($p.BoundingRect.Y / $fator); w = [int]($p.BoundingRect.Width / $fator); h = [int]($p.BoundingRect.Height / $fator) }
  }
  $xs = $ps | ForEach-Object { $_.x }; $ys = $ps | ForEach-Object { $_.y }
  $x2 = $ps | ForEach-Object { $_.x + $_.w }; $y2 = $ps | ForEach-Object { $_.y + $_.h }
  $x0 = ($xs | Measure-Object -Minimum).Minimum; $y0 = ($ys | Measure-Object -Minimum).Minimum
  [ordered]@{ texto = $l.Text; x = $x0; y = $y0; w = ($x2 | Measure-Object -Maximum).Maximum - $x0; h = ($y2 | Measure-Object -Maximum).Maximum - $y0; palavras = @($ps) }
}
[Console]::OutputEncoding = [Text.Encoding]::UTF8
[ordered]@{ largura = $largura; altura = $altura; linhas = @($linhas) } | ConvertTo-Json -Depth 6 -Compress
