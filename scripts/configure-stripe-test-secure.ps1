param(
    [switch]$ReplaceExistingWebhook,
    [switch]$DpapiSelfTestOnly
)

$ErrorActionPreference = "Stop"

Add-Type -TypeDefinition @"
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;

public static class KjoraCurrentUserDpapi
{
    [StructLayout(LayoutKind.Sequential)]
    private struct DataBlob
    {
        public int Size;
        public IntPtr Data;
    }

    [DllImport("crypt32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool CryptProtectData(
        ref DataBlob input,
        string description,
        IntPtr optionalEntropy,
        IntPtr reserved,
        IntPtr prompt,
        int flags,
        out DataBlob output);

    [DllImport("crypt32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool CryptUnprotectData(
        ref DataBlob input,
        IntPtr description,
        IntPtr optionalEntropy,
        IntPtr reserved,
        IntPtr prompt,
        int flags,
        out DataBlob output);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern IntPtr LocalFree(IntPtr memory);

    public static byte[] Protect(byte[] plain)
    {
        return Transform(plain, true);
    }

    public static byte[] Unprotect(byte[] encrypted)
    {
        return Transform(encrypted, false);
    }

    private static byte[] Transform(byte[] value, bool protect)
    {
        if (value == null || value.Length == 0)
        {
            throw new ArgumentException("DPAPI_INPUT_REQUIRED");
        }

        var input = new DataBlob { Size = value.Length, Data = Marshal.AllocHGlobal(value.Length) };
        Marshal.Copy(value, 0, input.Data, value.Length);
        DataBlob output;

        try
        {
            bool succeeded = protect
                ? CryptProtectData(ref input, "KJORA Stripe Test webhook", IntPtr.Zero, IntPtr.Zero, IntPtr.Zero, 1, out output)
                : CryptUnprotectData(ref input, IntPtr.Zero, IntPtr.Zero, IntPtr.Zero, IntPtr.Zero, 1, out output);

            if (!succeeded)
            {
                throw new Win32Exception(Marshal.GetLastWin32Error());
            }

            try
            {
                var result = new byte[output.Size];
                Marshal.Copy(output.Data, result, 0, output.Size);
                return result;
            }
            finally
            {
                if (output.Data != IntPtr.Zero)
                {
                    LocalFree(output.Data);
                }
            }
        }
        finally
        {
            var zeros = new byte[value.Length];
            Marshal.Copy(zeros, 0, input.Data, zeros.Length);
            Marshal.FreeHGlobal(input.Data);
        }
    }
}
"@

function Test-KjoraCurrentUserDpapi {
    $selfTestPlain = [Text.Encoding]::UTF8.GetBytes("KJORA_DPAPI_SELF_TEST")
    $selfTestProtected = [KjoraCurrentUserDpapi]::Protect($selfTestPlain)
    $selfTestRestored = [KjoraCurrentUserDpapi]::Unprotect($selfTestProtected)
    try {
        $selfTestValid = $selfTestPlain.Length -eq $selfTestRestored.Length
        for ($index = 0; $selfTestValid -and $index -lt $selfTestPlain.Length; $index++) {
            if ($selfTestPlain[$index] -ne $selfTestRestored[$index]) {
                $selfTestValid = $false
            }
        }
        if (-not $selfTestValid) {
            throw "DPAPI_SELF_TEST_FAILED"
        }
    }
    finally {
        [Array]::Clear($selfTestPlain, 0, $selfTestPlain.Length)
        [Array]::Clear($selfTestProtected, 0, $selfTestProtected.Length)
        [Array]::Clear($selfTestRestored, 0, $selfTestRestored.Length)
    }
}

Test-KjoraCurrentUserDpapi
Write-Host "DPAPI_SELF_TEST_PASS"

if ($DpapiSelfTestOnly) {
    exit 0
}

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$stripeApiBase = "https://api.stripe.com/v1"
$expectedWebhookUrl = "https://kjorapp.com/api/billing/webhooks/stripe"
$expectedWebhookEvents = @(
    "charge.refunded",
    "checkout.session.completed",
    "customer.subscription.created",
    "customer.subscription.deleted",
    "customer.subscription.updated",
    "invoice.paid",
    "invoice.payment_action_required",
    "invoice.payment_failed"
)

function Get-MaskedStripeId {
    param([Parameter(Mandatory = $true)][string]$Value)

    if ($Value.Length -le 12) {
        return "masked"
    }

    return $Value.Substring(0, 8) + "..." + $Value.Substring($Value.Length - 4)
}

function Invoke-StripeGet {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][hashtable]$Headers
    )

    return Invoke-RestMethod -Method Get -Uri ($stripeApiBase + $Path) -Headers $Headers
}

function Invoke-StripePost {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][hashtable]$Headers,
        [Parameter(Mandatory = $true)][hashtable]$Body,
        [Parameter(Mandatory = $true)][string]$IdempotencyKey
    )

    $requestHeaders = @{}
    foreach ($entry in $Headers.GetEnumerator()) {
        $requestHeaders[$entry.Key] = $entry.Value
    }
    $requestHeaders["Idempotency-Key"] = $IdempotencyKey

    return Invoke-RestMethod `
        -Method Post `
        -Uri ($stripeApiBase + $Path) `
        -Headers $requestHeaders `
        -ContentType "application/x-www-form-urlencoded" `
        -Body $Body
}

function Invoke-StripeDelete {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][hashtable]$Headers
    )

    return Invoke-RestMethod -Method Delete -Uri ($stripeApiBase + $Path) -Headers $Headers
}

$stripeSecure = Read-Host "Cle Stripe Test (saisie masquee)" -AsSecureString
$stripePointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($stripeSecure)
$plainStripeKey = $null
$stripeHeaders = $null

try {
    $plainStripeKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($stripePointer)
    if (-not $plainStripeKey.StartsWith("sk_test_")) {
        throw "STRIPE_TEST_KEY_REQUIRED"
    }

    $stripeHeaders = @{ Authorization = "Bearer $plainStripeKey" }

    $products = Invoke-StripeGet -Path "/products?active=true&limit=100" -Headers $stripeHeaders
    $essentialProducts = @($products.data | Where-Object {
        $_.name -eq "KJORA Essentiel" -and $_.livemode -eq $false
    })
    if ($essentialProducts.Count -ne 1) {
        throw "STRIPE_TEST_ESSENTIEL_PRODUCT_COUNT_INVALID"
    }

    $product = $essentialProducts[0]
    $prices = Invoke-StripeGet -Path ("/prices?active=true&type=recurring&limit=100&product=" + [Uri]::EscapeDataString($product.id)) -Headers $stripeHeaders
    $correctAnnual = @($prices.data | Where-Object {
        $_.livemode -eq $false -and
        $_.currency -eq "cad" -and
        $_.unit_amount -eq 14990 -and
        $_.recurring.interval -eq "year" -and
        $_.recurring.interval_count -eq 1
    })
    $incorrectAnnual = @($prices.data | Where-Object {
        $_.livemode -eq $false -and
        $_.currency -eq "cad" -and
        $_.unit_amount -eq 14990 -and
        $_.recurring.interval -eq "month" -and
        $_.recurring.interval_count -eq 1
    })

    if ($correctAnnual.Count -gt 1) {
        throw "STRIPE_TEST_ESSENTIEL_ANNUAL_DUPLICATE"
    }
    if ($incorrectAnnual.Count -gt 1) {
        throw "STRIPE_TEST_ESSENTIEL_INCORRECT_PRICE_COUNT_INVALID"
    }

    if ($correctAnnual.Count -eq 0) {
        if ($incorrectAnnual.Count -ne 1) {
            throw "STRIPE_TEST_ESSENTIEL_INCORRECT_PRICE_REQUIRED"
        }
        $createdPrice = Invoke-StripePost `
            -Path "/prices" `
            -Headers $stripeHeaders `
            -IdempotencyKey "kjora-test-essentiel-annual-cad-v1" `
            -Body @{
                product = $product.id
                currency = "cad"
                unit_amount = "14990"
                "recurring[interval]" = "year"
                "recurring[interval_count]" = "1"
                nickname = "KJORA Essentiel annual CAD"
            }
        if ($createdPrice.livemode -ne $false) {
            throw "STRIPE_LIVE_PRICE_CREATION_REFUSED"
        }
        $correctAnnual = @($createdPrice)
        Write-Host ("Price annuel Test cree : " + (Get-MaskedStripeId -Value $createdPrice.id))
    }
    else {
        Write-Host ("Price annuel Test deja present : " + (Get-MaskedStripeId -Value $correctAnnual[0].id))
    }

    if ($incorrectAnnual.Count -eq 1) {
        $archivedPrice = Invoke-StripePost `
            -Path ("/prices/" + [Uri]::EscapeDataString($incorrectAnnual[0].id)) `
            -Headers $stripeHeaders `
            -IdempotencyKey "kjora-test-archive-invalid-essentiel-annual-v1" `
            -Body @{ active = "false" }
        if ($archivedPrice.active -ne $false -or $archivedPrice.livemode -ne $false) {
            throw "STRIPE_TEST_INCORRECT_PRICE_ARCHIVE_FAILED"
        }
        Write-Host ("Price errone archive en Test : " + (Get-MaskedStripeId -Value $archivedPrice.id))
    }

    $webhooks = Invoke-StripeGet -Path "/webhook_endpoints?limit=100" -Headers $stripeHeaders
    $matchingWebhooks = @($webhooks.data | Where-Object {
        $_.livemode -eq $false -and $_.url -eq $expectedWebhookUrl
    })
    if ($matchingWebhooks.Count -gt 1) {
        throw "STRIPE_TEST_WEBHOOK_DUPLICATE"
    }

    if ($matchingWebhooks.Count -eq 1 -and $ReplaceExistingWebhook) {
        $deletedWebhook = Invoke-StripeDelete `
            -Path ("/webhook_endpoints/" + [Uri]::EscapeDataString($matchingWebhooks[0].id)) `
            -Headers $stripeHeaders
        if ($deletedWebhook.deleted -ne $true) {
            throw "STRIPE_TEST_WEBHOOK_REPLACEMENT_DELETE_FAILED"
        }
        Write-Host ("Webhook Test sans secret recuperable supprime : " + (Get-MaskedStripeId -Value $deletedWebhook.id))
        $matchingWebhooks = @()
    }

    if ($matchingWebhooks.Count -eq 0) {
        $webhookBody = @{
            url = $expectedWebhookUrl
            description = "KJORA Stripe Test webhook"
        }
        for ($index = 0; $index -lt $expectedWebhookEvents.Count; $index++) {
            $webhookBody["enabled_events[$index]"] = $expectedWebhookEvents[$index]
        }

        $createdWebhook = Invoke-StripePost `
            -Path "/webhook_endpoints" `
            -Headers $stripeHeaders `
            -IdempotencyKey ("kjora-test-webhook-" + [Guid]::NewGuid().ToString("N")) `
            -Body $webhookBody
        if ($createdWebhook.livemode -ne $false -or [string]::IsNullOrWhiteSpace($createdWebhook.secret)) {
            throw "STRIPE_TEST_WEBHOOK_CREATION_FAILED"
        }

        $secretBytes = [Text.Encoding]::UTF8.GetBytes([string]$createdWebhook.secret)
        $protectedBytes = [KjoraCurrentUserDpapi]::Protect($secretBytes)
        $restoredBytes = [KjoraCurrentUserDpapi]::Unprotect($protectedBytes)
        try {
            $roundTripValid = $secretBytes.Length -eq $restoredBytes.Length
            for ($index = 0; $roundTripValid -and $index -lt $secretBytes.Length; $index++) {
                if ($secretBytes[$index] -ne $restoredBytes[$index]) {
                    $roundTripValid = $false
                }
            }
            if (-not $roundTripValid) {
                throw "STRIPE_TEST_WEBHOOK_DPAPI_ROUNDTRIP_FAILED"
            }

            $backupDirectory = Join-Path $env:LOCALAPPDATA "Temp\KJORA-Stripe-Test"
            [IO.Directory]::CreateDirectory($backupDirectory) | Out-Null
            $backupPath = Join-Path $backupDirectory ("webhook-secret-" + (Get-Date -Format "yyyyMMdd-HHmmss") + ".dpapi")
            [IO.File]::WriteAllBytes($backupPath, $protectedBytes)
            $backupHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $backupPath).Hash
            Write-Host ("Webhook Test cree : " + (Get-MaskedStripeId -Value $createdWebhook.id))
            Write-Host ("Secret webhook chiffre DPAPI : " + $backupPath)
            Write-Host ("Empreinte SHA-256 : " + $backupHash)
            Write-Host "Test de dechiffrement DPAPI : PASS"
        }
        finally {
            [Array]::Clear($secretBytes, 0, $secretBytes.Length)
            [Array]::Clear($protectedBytes, 0, $protectedBytes.Length)
            [Array]::Clear($restoredBytes, 0, $restoredBytes.Length)
        }
    }
    else {
        Write-Host ("Webhook Test deja present : " + (Get-MaskedStripeId -Value $matchingWebhooks[0].id))
    }

    $env:STRIPE_SANDBOX_SECRET_KEY = $plainStripeKey
    Push-Location -LiteralPath $repositoryRoot
    try {
        npm run stripe:test:audit
        if ($LASTEXITCODE -ne 0) {
            throw "STRIPE_TEST_POST_CONFIGURATION_AUDIT_FAILED"
        }
    }
    finally {
        Pop-Location
    }
}
finally {
    Remove-Item Env:STRIPE_SANDBOX_SECRET_KEY -ErrorAction SilentlyContinue
    $stripeHeaders = $null
    $plainStripeKey = $null
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($stripePointer)
    $stripeSecure = $null
    Write-Host "Variable Stripe temporaire effacee."
}
