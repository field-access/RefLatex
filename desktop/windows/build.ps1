param([string]$CacheRoot=(Join-Path $PSScriptRoot '../../.desktop-cache'),[string]$OutputRoot=(Join-Path $PSScriptRoot '../../dist/ConceptCards-Windows'),[switch]$Fetch,[switch]$Zip)
$ErrorActionPreference='Stop'
$CacheRoot=[IO.Path]::GetFullPath($CacheRoot)
$OutputRoot=[IO.Path]::GetFullPath($OutputRoot)
if($Fetch){& (Join-Path $PSScriptRoot 'fetch-dependencies.ps1') -CacheRoot $CacheRoot}
if(!(Test-Path -LiteralPath (Join-Path $CacheRoot 'remote-resources.json'))){throw 'Dependencies are missing. Run build.ps1 -Fetch first.'}
# Only replace generated output inside this repository's dist directory.
$distRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../dist'))
if(!$OutputRoot.StartsWith($distRoot+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'OutputRoot must be a subfolder of this repository dist directory.'}
if(Test-Path -LiteralPath $OutputRoot){Remove-Item -LiteralPath $OutputRoot -Recurse -Force}
& node (Join-Path $PSScriptRoot 'build.cjs') $CacheRoot $OutputRoot
if($LASTEXITCODE -ne 0){throw 'Renderer packaging failed.'}
$compiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
if(!(Test-Path -LiteralPath $compiler)){throw '.NET Framework 4.x compiler is required on the build machine.'}
$arguments=@('/nologo','/target:winexe','/platform:x64','/optimize+','/debug-',('/out:'+ (Join-Path $OutputRoot 'ConceptCards.exe')),('/win32manifest:'+ (Join-Path $PSScriptRoot 'app.manifest')),('/win32icon:'+ (Join-Path $CacheRoot 'ConceptCards.ico')),'/reference:System.dll','/reference:System.Core.dll','/reference:System.Windows.Forms.dll','/reference:System.Drawing.dll','/reference:System.Web.Extensions.dll',('/reference:'+ (Join-Path $OutputRoot 'Microsoft.Web.WebView2.Core.dll')),('/reference:'+ (Join-Path $OutputRoot 'Microsoft.Web.WebView2.WinForms.dll')),(Join-Path $PSScriptRoot 'ConceptCards.cs'))
& $compiler $arguments
if($LASTEXITCODE -ne 0){throw 'Windows executable compilation failed.'}
Set-Content -LiteralPath (Join-Path $OutputRoot 'ConceptCards.exe.config') -Encoding UTF8 -Value '<?xml version="1.0"?><configuration><startup><supportedRuntime version="v4.0" sku=".NETFramework,Version=v4.8"/></startup></configuration>'
Get-ChildItem -LiteralPath $OutputRoot -File -Recurse | Where-Object Name -ne 'SHA256SUMS.txt' | ForEach-Object {'{0}  {1}' -f (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash,$_.FullName.Substring($OutputRoot.Length+1)} | Set-Content -LiteralPath (Join-Path $OutputRoot 'SHA256SUMS.txt')
if($Zip){Compress-Archive -LiteralPath $OutputRoot -DestinationPath ($OutputRoot+'.zip') -Force}
$size=(Get-ChildItem -LiteralPath $OutputRoot -File -Recurse | Measure-Object -Property Length -Sum).Sum
Write-Host ('Portable Windows app ready: {0} ({1:N1} MB)' -f $OutputRoot,($size/1MB))
