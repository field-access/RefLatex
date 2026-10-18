param([string]$CacheRoot=(Join-Path $PSScriptRoot '../../.desktop-cache'))
$ErrorActionPreference='Stop'
[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12
$CacheRoot=[IO.Path]::GetFullPath($CacheRoot)
$vendor=Join-Path $CacheRoot 'vendor'
New-Item -ItemType Directory -Force -Path $vendor,(Join-Path $vendor 'fonts'),(Join-Path $vendor 'licenses') | Out-Null
$resources=[ordered]@{}
function Fetch([string]$Url,[string]$Path){
 if(!(Test-Path -LiteralPath $Path) -or (Get-Item -LiteralPath $Path).Length -eq 0){
  Write-Host "Downloading $Url"
  $partial=$Path+'.part'
  Invoke-WebRequest -UseBasicParsing -Uri $Url -OutFile $partial -TimeoutSec 60 -UserAgent 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
  Move-Item -LiteralPath $partial -Destination $Path -Force
 }
}
$core=[ordered]@{
 'https://cdn.jsdelivr.net/npm/marked@15.0.12/marked.min.js'='marked.min.js'
 'https://cdn.jsdelivr.net/npm/dompurify@3.2.6/dist/purify.min.js'='purify.min.js'
 'https://cdn.jsdelivr.net/npm/katex@0.16.22/dist/katex.min.js'='katex.min.js'
 'https://cdn.jsdelivr.net/npm/katex@0.16.22/dist/contrib/auto-render.min.js'='auto-render.min.js'
 'https://cdn.jsdelivr.net/npm/katex@0.16.22/dist/katex.min.css'='katex.min.css'
 'https://cdn.jsdelivr.net/npm/d3@7'='d3.min.js'
 'https://cdn.jsdelivr.net/npm/markmap-lib@0.18.12'='markmap-lib.js'
 'https://cdn.jsdelivr.net/npm/markmap-view@0.18.12'='markmap-view.js'
 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.12.0/highlight.min.js'='highlight.min.js'
}
foreach($entry in $core.GetEnumerator()){
 $url=if($entry.Key -eq 'https://cdn.jsdelivr.net/npm/d3@7'){'https://cdn.jsdelivr.net/npm/d3@7.9.0/dist/d3.min.js'}else{$entry.Key}
 Fetch $url (Join-Path $vendor $entry.Value);$resources[$entry.Key]='vendor/'+$entry.Value
}
$katexCss=Get-Content -LiteralPath (Join-Path $vendor 'katex.min.css') -Raw
foreach($match in [regex]::Matches($katexCss,'url\((fonts/[^)]+)\)')){
 $relative=$match.Groups[1].Value
 Fetch ('https://cdn.jsdelivr.net/npm/katex@0.16.22/dist/'+$relative) (Join-Path $vendor $relative)
}
function FontCss([string]$Url,[string]$Filename,[string]$LicenseName){
 $raw=Join-Path $CacheRoot ($Filename+'.remote')
 Fetch $Url $raw
 $css=Get-Content -LiteralPath $raw -Raw
 foreach($match in [regex]::Matches($css,'url\((https://fonts\.gstatic\.com/[^)]+)\)')){
  $fontUrl=$match.Groups[1].Value
  $hash=[Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes($fontUrl))
  $stem=[BitConverter]::ToString($hash).Replace('-','').ToLowerInvariant().Substring(0,20)
  $name=$stem+[IO.Path]::GetExtension(([Uri]$fontUrl).AbsolutePath)
  $legacy=Join-Path $vendor ('fonts/'+$stem+'.woff2')
  if(!(Test-Path -LiteralPath (Join-Path $vendor ('fonts/'+$name))) -and (Test-Path -LiteralPath $legacy)){Copy-Item -LiteralPath $legacy -Destination (Join-Path $vendor ('fonts/'+$name))}
  Fetch $fontUrl (Join-Path $vendor ('fonts/'+$name))
  $css=$css.Replace($fontUrl,'https://conceptcards.local/vendor/fonts/'+$name)
 }
 Set-Content -LiteralPath (Join-Path $vendor $Filename) -Value $css -Encoding UTF8
 $resources[$Url]='vendor/'+$Filename
 $license=Join-Path $vendor ('licenses/'+$LicenseName+'-OFL.txt')
 if(!(Test-Path -LiteralPath $license)){
  try{Fetch ('https://raw.githubusercontent.com/google/fonts/main/ofl/'+$LicenseName+'/OFL.txt') $license}
  catch{Fetch ('https://raw.githubusercontent.com/google/fonts/main/apache/'+$LicenseName+'/LICENSE.txt') $license}
 }
}
FontCss 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Manrope:wght@400;500;600;700&display=swap' 'ui-fonts.css' 'inter'
Fetch 'https://raw.githubusercontent.com/google/fonts/main/ofl/manrope/OFL.txt' (Join-Path $vendor 'licenses/manrope-OFL.txt')
$app=Get-Content -LiteralPath (Join-Path $PSScriptRoot '../../app.js') -Raw
$specs=[regex]::Match($app,'const GOOGLE_FONT_SPECS=\{([\s\S]*?)\n\};').Groups[1].Value
$groups=[regex]::Match($app,'const CARD_FONT_GROUPS=\[([\s\S]*?)\n\];').Groups[1].Value
if(!$specs -or !$groups){throw 'Could not read the app font catalog.'}
foreach($match in [regex]::Matches($specs,'(?:"([^"]+)"|([a-z-]+)):\["([^"]+)","([^"]+)"\]')){
 $key=if($match.Groups[1].Success){$match.Groups[1].Value}else{$match.Groups[2].Value}
 if(!$groups.Contains('"'+$key+'"')){continue}
 $family=$match.Groups[3].Value;$weights=$match.Groups[4].Value
 FontCss ('https://fonts.googleapis.com/css2?family='+$family+':'+$weights+'&display=swap') ('font-'+$key+'.css') ($family.Replace('+','').ToLowerInvariant())
}
$licenses=[ordered]@{
 'marked-MIT.txt'='https://cdn.jsdelivr.net/npm/marked@15.0.12/LICENSE.md'
 'dompurify-LICENSE.txt'='https://cdn.jsdelivr.net/npm/dompurify@3.2.6/LICENSE'
 'katex-MIT.txt'='https://cdn.jsdelivr.net/npm/katex@0.16.22/LICENSE'
 'd3-ISC.txt'='https://cdn.jsdelivr.net/npm/d3@7/LICENSE'
 'markmap-MIT.txt'='https://raw.githubusercontent.com/markmap/markmap/v0.18.12/LICENSE'
 'highlight-BSD.txt'='https://cdn.jsdelivr.net/npm/@highlightjs/cdn-assets@11.12.0/LICENSE'
}
foreach($entry in $licenses.GetEnumerator()){Fetch $entry.Value (Join-Path $vendor ('licenses/'+$entry.Key))}
$version='1.0.2903.40'
$archive=Join-Path $CacheRoot ('webview2-'+$version+'.zip')
Fetch ('https://api.nuget.org/v3-flatcontainer/microsoft.web.webview2/'+$version+'/microsoft.web.webview2.'+$version+'.nupkg') $archive
$sdk=Join-Path $CacheRoot 'webview2'
if(!(Test-Path -LiteralPath (Join-Path $sdk 'lib/net462/Microsoft.Web.WebView2.Core.dll'))){Expand-Archive -LiteralPath $archive -DestinationPath $sdk -Force}
$resources | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $CacheRoot 'remote-resources.json') -Encoding UTF8
$core | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $CacheRoot 'core-resources.json') -Encoding UTF8
Get-ChildItem -LiteralPath $vendor -File -Recurse | ForEach-Object { '{0}  {1}' -f (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash,$_.FullName.Substring($vendor.Length+1) } | Set-Content -LiteralPath (Join-Path $CacheRoot 'SHA256SUMS.txt')
Write-Host "Dependencies cached at $CacheRoot"
