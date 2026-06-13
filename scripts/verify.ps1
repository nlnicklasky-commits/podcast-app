param([switch]$Quick)
# =============================================================================
# verify.ps1 - self-adapting verification (node / Next.js / Vite / Astro)
# -Quick : lint + typecheck only (this is what the global Stop hook runs)
# default: quick checks + tests + production build
# Deployed from Documents\templates\claude-kit. Safe to customize per repo.
# =============================================================================
Set-Location (Split-Path $PSScriptRoot -Parent)
$ErrorActionPreference = 'Continue'
$fails = New-Object System.Collections.Generic.List[string]
$ranAny = $false

$pkg = $null
if (Test-Path 'package.json') {
    try { $pkg = Get-Content 'package.json' -Raw | ConvertFrom-Json } catch { $pkg = $null }
}

function Test-NpmScript([string]$Name) {
    return ($null -ne $pkg) -and ($null -ne $pkg.scripts) -and
           ($pkg.scripts.PSObject.Properties.Name -contains $Name)
}

function Invoke-Step([string]$Name, [scriptblock]$Cmd) {
    $script:ranAny = $true
    Write-Host ""
    Write-Host (">> " + $Name)
    & $Cmd
    if ($LASTEXITCODE -ne 0) {
        $script:fails.Add($Name)
        Write-Host ("FAIL " + $Name)
    } else {
        Write-Host ("OK " + $Name)
    }
}

# ---- Quick checks: lint + typecheck --------------------------------------
if (Test-NpmScript 'lint') { Invoke-Step 'lint' { npm run lint --silent } }
else { Write-Host 'SKIP lint (no lint script)' }

if (Test-NpmScript 'type-check') { Invoke-Step 'typecheck' { npm run type-check --silent } }
elseif (Test-Path 'tsconfig.app.json') { Invoke-Step 'typecheck' { npx tsc -b } }
elseif (Test-Path 'tsconfig.json') { Invoke-Step 'typecheck' { npx tsc --noEmit } }
else { Write-Host 'SKIP typecheck (no type-check script or tsconfig.json)' }

# ---- Full checks: tests + build -------------------------------------------
if (-not $Quick) {
    if (Test-NpmScript 'test') { Invoke-Step 'test' { npm test --silent } }
    else { Write-Host 'SKIP test (no test script)' }

    if (Test-NpmScript 'build') { Invoke-Step 'build' { npm run build } }
    else { Write-Host 'SKIP build (no build script)' }
}

# ---- Verdict ---------------------------------------------------------------
Write-Host ""
if ($fails.Count -gt 0) {
    Write-Host ("VERIFY FAILED: " + ($fails -join ', '))
    exit 1
}
if (-not $ranAny) {
    Write-Host 'VERIFY PASSED (warning: no checks available to run - add tooling or customize this script)'
    exit 0
}
Write-Host 'VERIFY PASSED'
exit 0
