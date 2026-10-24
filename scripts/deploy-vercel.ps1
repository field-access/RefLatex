[CmdletBinding()]
param(
    [switch]$Production,
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path

foreach ($requiredFile in @('index.html', 'app.js', 'styles.css', 'vercel.json')) {
    if (-not (Test-Path -LiteralPath (Join-Path $projectRoot $requiredFile) -PathType Leaf)) {
        throw "Missing required deployment file: $requiredFile"
    }
}

$cliArgs = @('--yes', 'vercel@latest', 'deploy', '--cwd', $projectRoot)
if ($Production) { $cliArgs += '--prod' }

if ($DryRun) {
    Write-Output ('npx --yes vercel@latest deploy --cwd "{0}"{1}' -f $projectRoot, $(if ($Production) { ' --prod' } else { '' }))
    return
}

$npxCommand = Get-Command npx.cmd -ErrorAction SilentlyContinue
if (-not $npxCommand) { $npxCommand = Get-Command npx -ErrorAction SilentlyContinue }
if (-not $npxCommand) { throw 'Install Node.js LTS to provide Node.js and npx, then run this script again.' }

# Use the repository's static-site configuration; no desktop build is run.
& $npxCommand.Source @cliArgs
if ($LASTEXITCODE -ne 0) { throw "Vercel deployment failed (exit code $LASTEXITCODE)." }
