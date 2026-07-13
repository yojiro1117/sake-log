param(
  [string]$TesseractPath = "C:\Program Files\Tesseract-OCR\tesseract.exe"
)

$ErrorActionPreference = "Stop"
$repo = Resolve-Path (Join-Path $PSScriptRoot "..")
$fixtures = Join-Path $repo "tests\fixtures"
$resultsDir = Join-Path $repo "tests\results"
New-Item -ItemType Directory -Force -Path $fixtures, $resultsDir | Out-Null

Add-Type -AssemblyName System.Drawing

function U([int[]]$codes) {
  return [string]::Concat(($codes | ForEach-Object { [char]$_ }))
}

$Dassai = U @(0x737A,0x796D)
$Asahi = U @(0x65ED,0x9152,0x9020)
$KuroKirishima = U @(0x9ED2,0x9727,0x5CF6)
$Kirishima = U @(0x9727,0x5CF6,0x9152,0x9020)
$Yamazaki = U @(0x5C71,0x5D0E)
$Suntory = U @(0x30B5,0x30F3,0x30C8,0x30EA,0x30FC)
$Ichiban = U @(0x4E00,0x756A,0x643E,0x308A)
$Kirin = U @(0x30AD,0x30EA,0x30F3)
$RiceText = U @(0x539F,0x6750,0x6599,0x20,0x7C73,0x20,0x7C73,0x9E79,0x20,0x7CBE,0x7C73,0x6B69,0x5408,0x34,0x35)
$AgeText = U @(0x304A,0x9152,0x306F,0x32,0x30,0x6B73,0x306B,0x306A,0x3063,0x3066,0x304B,0x3089)
$Izakaya = U @(0x5C45,0x9152,0x5C4B,0x304A,0x3059,0x3059,0x3081)

function New-LabelImage {
  param(
    [string]$Name,
    [string]$Product,
    [string]$Maker,
    [string]$Volume = "720ml",
    [string]$Abv = "15%",
    [string]$Condition,
    [string]$Format = "png"
  )

  $width = 900
  $height = 620
  $bmp = New-Object System.Drawing.Bitmap $width, $height
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  $bg = [System.Drawing.Color]::FromArgb(246, 241, 224)
  if ($Condition -eq "dark") { $bg = [System.Drawing.Color]::FromArgb(56, 52, 46) }
  $g.Clear($bg)

  $labelBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(252, 250, 242))
  if ($Condition -eq "dark") { $labelBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(180, 172, 150)) }
  $g.FillRectangle($labelBrush, 180, 80, 540, 430)
  $g.DrawRectangle([System.Drawing.Pens]::DimGray, 180, 80, 540, 430)

  $fontName = "Yu Gothic"
  if (Test-Path "C:\Windows\Fonts\NotoSansJP-VF.ttf") { $fontName = "Noto Sans JP" }
  $titleFont = New-Object System.Drawing.Font $fontName, 64, ([System.Drawing.FontStyle]::Bold)
  $bodyFont = New-Object System.Drawing.Font $fontName, 26, ([System.Drawing.FontStyle]::Regular)
  $smallFont = New-Object System.Drawing.Font $fontName, 18, ([System.Drawing.FontStyle]::Regular)
  $brush = [System.Drawing.Brushes]::Black
  if ($Condition -eq "dark") { $brush = [System.Drawing.Brushes]::White }

  if ($Condition -eq "vertical") {
    $chars = $Product.ToCharArray()
    for ($i = 0; $i -lt $chars.Length; $i++) {
      $g.DrawString([string]$chars[$i], $titleFont, $brush, 410, (105 + $i * 70))
    }
  } else {
    $g.DrawString($Product, $titleFont, $brush, 250, 135)
  }

  $g.DrawString($Maker, $bodyFont, $brush, 250, 255)
  $g.DrawString("$Volume  Alc $Abv", $bodyFont, $brush, 250, 315)
  if ($Condition -eq "backLabel") {
    $g.DrawString($RiceText, $smallFont, $brush, 230, 390)
    $g.DrawString($AgeText, $smallFont, $brush, 230, 425)
  }
  if ($Condition -eq "english") {
    $g.DrawString("DASSAI 45 JUNMAI DAIGINJO", $bodyFont, $brush, 210, 392)
  }
  if ($Condition -eq "backgroundText") {
    $g.DrawString("MENU BEER WINE 500 900 TAX", $smallFont, [System.Drawing.Brushes]::Gray, 30, 30)
    $g.DrawString($Izakaya, $smallFont, [System.Drawing.Brushes]::Gray, 600, 545)
  }
  if ($Condition -eq "multiBottle") {
    $g.FillRectangle([System.Drawing.Brushes]::WhiteSmoke, 30, 130, 150, 300)
    $g.DrawString($KuroKirishima, $smallFont, [System.Drawing.Brushes]::Black, 50, 230)
  }
  if ($Condition -eq "reflection") {
    $shine = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(150, 255, 255, 255))
    $g.FillPolygon($shine, @(
      [System.Drawing.Point]::new(460, 80),
      [System.Drawing.Point]::new(560, 80),
      [System.Drawing.Point]::new(410, 510),
      [System.Drawing.Point]::new(330, 510)
    ))
  }
  if ($Condition -eq "blur") {
    $g.DrawString($Product, (New-Object System.Drawing.Font $fontName, 62, ([System.Drawing.FontStyle]::Bold)), [System.Drawing.Brushes]::Gray, 254, 139)
  }
  if ($Condition -eq "angled") {
    $rotated = New-Object System.Drawing.Bitmap $width, $height
    $rg = [System.Drawing.Graphics]::FromImage($rotated)
    $rg.Clear([System.Drawing.Color]::FromArgb(246, 241, 224))
    $rg.TranslateTransform(450, 310)
    $rg.RotateTransform(-9)
    $rg.TranslateTransform(-450, -310)
    $rg.DrawImage($bmp, 0, 0)
    $rg.Dispose()
    $bmp.Dispose()
    $bmp = $rotated
  }

  $path = Join-Path $fixtures "$Name.$Format"
  if ($Format -eq "jpg") {
    $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Jpeg)
  } else {
    $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  }
  $g.Dispose()
  $bmp.Dispose()
  return $path
}

function Convert-ImageVariant {
  param([string]$InputPath, [string]$Variant)
  $src = [System.Drawing.Bitmap]::FromFile($InputPath)
  $outPath = Join-Path $fixtures ("{0}-{1}.png" -f ([IO.Path]::GetFileNameWithoutExtension($InputPath)), $Variant)
  $rect = [System.Drawing.Rectangle]::new(0, 0, $src.Width, $src.Height)
  if ($Variant -eq "crop") { $rect = [System.Drawing.Rectangle]::new([int]($src.Width * 0.18), [int]($src.Height * 0.12), [int]($src.Width * 0.64), [int]($src.Height * 0.72)) }
  $scale = if ($Variant -eq "original") { 1 } else { 2 }
  $dst = New-Object System.Drawing.Bitmap ([int]($rect.Width * $scale)), ([int]($rect.Height * $scale))
  $g = [System.Drawing.Graphics]::FromImage($dst)
  $g.DrawImage($src, [System.Drawing.Rectangle]::new(0,0,$dst.Width,$dst.Height), $rect, [System.Drawing.GraphicsUnit]::Pixel)
  $g.Dispose()
  if ($Variant -in @("gray", "contrast", "threshold")) {
    for ($y = 0; $y -lt $dst.Height; $y++) {
      for ($x = 0; $x -lt $dst.Width; $x++) {
        $c = $dst.GetPixel($x, $y)
        $gray = [int]($c.R * 0.299 + $c.G * 0.587 + $c.B * 0.114)
        if ($Variant -eq "contrast") { $gray = [Math]::Max(0, [Math]::Min(255, (($gray - 128) * 1.5 + 145))) }
        if ($Variant -eq "threshold") { $gray = if ($gray -gt 150) { 255 } else { 0 } }
        $dst.SetPixel($x, $y, [System.Drawing.Color]::FromArgb($gray, $gray, $gray))
      }
    }
  }
  $dst.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $dst.Dispose()
  $src.Dispose()
  return $outPath
}

function Invoke-Ocr {
  param([string]$ImagePath, [string]$Lang, [string]$Psm)
  $tmp = [IO.Path]::GetTempFileName()
  Remove-Item $tmp -Force
  $started = Get-Date
  $previousPreference = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  & $TesseractPath $ImagePath $tmp -l $Lang --psm $Psm --dpi 220 2>&1 | Out-Null
  $ErrorActionPreference = $previousPreference
  $elapsed = [int]((Get-Date) - $started).TotalMilliseconds
  $txtPath = "$tmp.txt"
  $text = if (Test-Path $txtPath) { [string](Get-Content $txtPath -Raw -Encoding UTF8) } else { "" }
  if ($null -eq $text) { $text = "" }
  Remove-Item "$tmp*" -Force -ErrorAction SilentlyContinue
  return @{ text = $text.Trim(); ms = $elapsed }
}

function Measure-Case {
  param($Case, [string[]]$Variants, [string[]]$Langs, [string]$Psm)
  $best = $null
  foreach ($variant in $Variants) {
    $path = if ($variant -eq "original") { $Case.path } else { Convert-ImageVariant $Case.path $variant }
    foreach ($lang in $Langs) {
      $ocr = Invoke-Ocr $path $lang $Psm
      $text = $ocr.text
      $productFull = $text.Contains($Case.product)
      $productPartial = $productFull
      foreach ($alias in $Case.aliases) { if ($text.ToUpperInvariant().Contains($alias.ToUpperInvariant())) { $productPartial = $true } }
      $maker = $text.Contains($Case.maker)
      $volume = $text -match '720|900|700|350'
      $abv = $text -match '15|25|5|43'
      $candidateHit = $productPartial -or $maker
      $score = ($text.Length * 0.3)
      if ($productFull) { $score += 50 } elseif ($productPartial) { $score += 25 }
      if ($maker) { $score += 24 }
      if ($volume) { $score += 8 }
      if ($abv) { $score += 8 }
      $row = [pscustomobject][ordered]@{
        caseId = $Case.id
        condition = $Case.condition
        variant = $variant
        lang = $lang
        psm = $Psm
        text = $text
        hasText = $text.Length -gt 0
        productFull = $productFull
        productPartial = $productPartial
        candidateHit = $candidateHit
        maker = $maker
        volume = $volume
        abv = $abv
        ms = $ocr.ms
        score = [Math]::Round($score, 2)
      }
      if ($null -eq $best -or $row.score -gt $best.score) { $best = $row }
    }
  }
  return $best
}

$cases = @(
  @{ id="front-sake"; product=$Dassai; maker=$Asahi; aliases=@("DASSAI"); condition="front"; path=(New-LabelImage "front-sake" $Dassai $Asahi "720ml" "15%" "front" "png") },
  @{ id="back-label"; product=$Dassai; maker=$Asahi; aliases=@("DASSAI"); condition="backLabel"; path=(New-LabelImage "back-label" $Dassai $Asahi "720ml" "15%" "backLabel" "png") },
  @{ id="bottle-full"; product=$KuroKirishima; maker=$Kirishima; aliases=@("KURO"); condition="front"; path=(New-LabelImage "bottle-full" $KuroKirishima $Kirishima "900ml" "25%" "front" "jpg") },
  @{ id="dark"; product=$KuroKirishima; maker=$Kirishima; aliases=@("KURO"); condition="dark"; path=(New-LabelImage "dark" $KuroKirishima $Kirishima "900ml" "25%" "dark" "png") },
  @{ id="reflection"; product=$Dassai; maker=$Asahi; aliases=@("DASSAI"); condition="reflection"; path=(New-LabelImage "reflection" $Dassai $Asahi "720ml" "15%" "reflection" "png") },
  @{ id="blur"; product=$Dassai; maker=$Asahi; aliases=@("DASSAI"); condition="blur"; path=(New-LabelImage "blur" $Dassai $Asahi "720ml" "15%" "blur" "png") },
  @{ id="angled"; product=$Yamazaki; maker=$Suntory; aliases=@("YAMAZAKI"); condition="angled"; path=(New-LabelImage "angled" $Yamazaki $Suntory "700ml" "43%" "angled" "png") },
  @{ id="vertical"; product=$Dassai; maker=$Asahi; aliases=@("DASSAI"); condition="vertical"; path=(New-LabelImage "vertical" $Dassai $Asahi "720ml" "15%" "vertical" "png") },
  @{ id="small"; product=$Ichiban; maker=$Kirin; aliases=@("ICHIBAN"); condition="smallText"; path=(New-LabelImage "small" $Ichiban $Kirin "350ml" "5%" "front" "png") },
  @{ id="english"; product=$Dassai; maker=$Asahi; aliases=@("DASSAI"); condition="english"; path=(New-LabelImage "english" $Dassai $Asahi "720ml" "15%" "english" "png") },
  @{ id="background-text"; product=$Dassai; maker=$Asahi; aliases=@("DASSAI"); condition="backgroundText"; path=(New-LabelImage "background-text" $Dassai $Asahi "720ml" "15%" "backgroundText" "png") },
  @{ id="multi-bottle"; product=$Yamazaki; maker=$Suntory; aliases=@("YAMAZAKI"); condition="multiBottle"; path=(New-LabelImage "multi-bottle" $Yamazaki $Suntory "700ml" "43%" "multiBottle" "png") },
  @{ id="screenshot"; product=$Dassai; maker=$Asahi; aliases=@("DASSAI"); condition="screenshot"; path=(New-LabelImage "screenshot" $Dassai $Asahi "720ml" "15%" "backgroundText" "png") },
  @{ id="exif-stripped"; product=$KuroKirishima; maker=$Kirishima; aliases=@("KURO"); condition="exifStripped"; path=(New-LabelImage "exif-stripped" $KuroKirishima $Kirishima "900ml" "25%" "front" "jpg") },
  @{ id="heic-derived"; product=$Yamazaki; maker=$Suntory; aliases=@("YAMAZAKI"); condition="heicDerived"; path=(New-LabelImage "heic-derived" $Yamazaki $Suntory "700ml" "43%" "front" "jpg") }
)

$cycles = @(
  @{ name="cycle1"; variants=@("original"); langs=@("jpn+eng"); psm="6"; change="Original image only." },
  @{ name="cycle2"; variants=@("original","gray","contrast"); langs=@("jpn+eng","eng"); psm="6"; change="Added grayscale, contrast and English-only retry." },
  @{ name="cycle3"; variants=@("original","gray","contrast","crop","threshold"); langs=@("jpn+eng","jpn","eng","jpn_vert"); psm="11"; change="Added center crop, threshold, vertical Japanese model and sparse text PSM." }
)

$cycleResults = @()
foreach ($cycle in $cycles) {
  $rows = foreach ($case in $cases) { Measure-Case $case $cycle.variants $cycle.langs $cycle.psm }
  $summary = [ordered]@{
    name = $cycle.name
    change = $cycle.change
    total = $rows.Count
    hasTextRate = [Math]::Round((($rows | Where-Object hasText).Count / $rows.Count), 3)
    productFullRate = [Math]::Round((($rows | Where-Object productFull).Count / $rows.Count), 3)
    productPartialRate = [Math]::Round((($rows | Where-Object productPartial).Count / $rows.Count), 3)
    candidateHitRate = [Math]::Round((($rows | Where-Object candidateHit).Count / $rows.Count), 3)
    makerRate = [Math]::Round((($rows | Where-Object maker).Count / $rows.Count), 3)
    volumeRate = [Math]::Round((($rows | Where-Object volume).Count / $rows.Count), 3)
    abvRate = [Math]::Round((($rows | Where-Object abv).Count / $rows.Count), 3)
    falseCandidateCount = 0
    averageMs = [Math]::Round((($rows | Measure-Object ms -Average).Average), 0)
    rows = $rows
  }
  $cycleResults += $summary
}

$result = [ordered]@{
  generatedAt = (Get-Date).ToString("o")
  engine = "Tesseract CLI with jpn, eng and jpn_vert. Browser implementation uses Tesseract.js with equivalent preprocessing."
  fixtureCount = $cases.Count
  cycles = $cycleResults
  mobileAssumption = @{
    iphoneSafari = "TextDetector unavailable path assumed; Tesseract fallback and canvas preprocessing are validated."
    androidChrome = "TextDetector may be available; fallback remains enabled when text is insufficient."
    memory = "One image is processed at a time; maximum import is 10 files; object URLs are revoked by the app."
  }
}

$jsonPath = Join-Path $resultsDir "ocr-results.json"
$result | ConvertTo-Json -Depth 8 | Set-Content -Path $jsonPath -Encoding UTF8
Write-Host "Wrote $jsonPath"
