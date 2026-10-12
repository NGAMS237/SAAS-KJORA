$ErrorActionPreference = "Stop"

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$stripeSecure = Read-Host "Nouvelle cle Stripe Test (saisie masquee)" -AsSecureString
$stripePointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($stripeSecure)

try {
    $env:STRIPE_SANDBOX_SECRET_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($stripePointer)
    Push-Location -LiteralPath $repositoryRoot
    try {
        npm run stripe:test:audit
        if ($LASTEXITCODE -ne 0) {
            throw "L'audit Stripe Test a echoue."
        }
    }
    finally {
        Pop-Location
    }
}
finally {
    Remove-Item Env:STRIPE_SANDBOX_SECRET_KEY -ErrorAction SilentlyContinue
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($stripePointer)
    $stripeSecure = $null
    Write-Host "Variable Stripe temporaire effacee."
}
