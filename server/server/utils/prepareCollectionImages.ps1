param([Parameter(Mandatory=$true)][string]$SourceRoot)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$catalog = Get-Content -LiteralPath (Join-Path $PSScriptRoot '..\data\collection-26.json') -Raw | ConvertFrom-Json
$encoder = [Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object MimeType -eq 'image/jpeg'
$quality = [Drawing.Imaging.EncoderParameters]::new(1)
$quality.Param[0] = [Drawing.Imaging.EncoderParameter]::new([Drawing.Imaging.Encoder]::Quality, [long]85)
$count = 0
foreach ($product in $catalog.products) {
  for ($i = 0; $i -lt $product.source_files.Count; $i++) {
    $sourcePath = Join-Path (Join-Path $SourceRoot $product.source_folder) $product.source_files[$i]
    $destination = Join-Path (Join-Path $repoRoot 'client\public') $product.images[$i].TrimStart('/')
    [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($destination)) | Out-Null
    $original = [Drawing.Image]::FromFile($sourcePath)
    try {
      $width = [Math]::Min(1200, $original.Width)
      $height = [int][Math]::Round($original.Height * $width / $original.Width)
      $bitmap = [Drawing.Bitmap]::new($width, $height)
      $graphics = [Drawing.Graphics]::FromImage($bitmap)
      try {
        $graphics.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.DrawImage($original, 0, 0, $width, $height)
        $bitmap.Save($destination, $encoder, $quality)
      } finally { $graphics.Dispose(); $bitmap.Dispose() }
    } finally { $original.Dispose() }
    $count++
  }
  Write-Output "Prepared $($product.name)"
}
$quality.Dispose()
Write-Output "Optimized $count photographs."
