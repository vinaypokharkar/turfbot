# Send a test WhatsApp template via Meta Cloud API.
# Usage:
#   .\scripts\test-send.ps1 -Token "EAA..." -To "917208370792"
#   .\scripts\test-send.ps1 -Token "EAA..." -To "917208370792" -PhoneId "1184284761440138"
param(
  [Parameter(Mandatory = $true)] [string] $Token,
  [Parameter(Mandatory = $true)] [string] $To,
  [string] $PhoneId  = "1184284761440138",
  [string] $Template = "jaspers_market_order_confirmation_v1",
  [string] $Lang     = "en_US"
)

$body = @{
  messaging_product = "whatsapp"
  to                = $To
  type              = "template"
  template          = @{
    name       = $Template
    language   = @{ code = $Lang }
    components = @(@{
      type       = "body"
      parameters = @(
        @{ type = "text"; text = "John Doe" },
        @{ type = "text"; text = "123456" },
        @{ type = "text"; text = "Jun 30, 2026" }
      )
    })
  }
} | ConvertTo-Json -Depth 10

$uri = "https://graph.facebook.com/v25.0/$PhoneId/messages"

try {
  $res = Invoke-RestMethod -Method Post -Uri $uri `
    -Headers @{ Authorization = "Bearer $Token" } `
    -ContentType "application/json" -Body $body
  Write-Host "SENT. message id:" $res.messages[0].id
  $res | ConvertTo-Json -Depth 10
}
catch {
  Write-Host "FAILED:" $_.Exception.Message
  if ($_.ErrorDetails.Message) { Write-Host $_.ErrorDetails.Message }
}
