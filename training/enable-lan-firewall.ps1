param([Parameter(Mandatory=$true)][string]$LanAddress)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$reportPath = Join-Path $root 'training/runs/local-play/firewall-status.json'
try {
    $parsed = [System.Net.IPAddress]::Parse($LanAddress)
    $octets = $parsed.GetAddressBytes()
    $private = $octets.Length -eq 4 -and ($octets[0] -eq 10 -or ($octets[0] -eq 172 -and $octets[1] -ge 16 -and $octets[1] -le 31) -or ($octets[0] -eq 192 -and $octets[1] -eq 168))
    if (-not $private) { throw 'A private local IPv4 address is required.' }
    $address = Get-NetIPAddress -IPAddress $LanAddress -AddressFamily IPv4
    $profile = Get-NetConnectionProfile -InterfaceIndex $address.InterfaceIndex
    if ($profile.NetworkCategory -ne 'Private') { throw 'LAN interface must already be a private network.' }
    $nodePath = (Get-Command node).Source
    $name = 'BattleFleet-Arena-LAN-5173-2567'
    $existing = Get-NetFirewallRule -Name $name -ErrorAction SilentlyContinue
    if ($existing) {
        Set-NetFirewallRule -Name $name -Enabled True -Direction Inbound -Action Allow -Protocol TCP -LocalPort 5173,2567 -LocalAddress $LanAddress -RemoteAddress LocalSubnet -Profile Private -Program $nodePath | Out-Null
    } else {
        New-NetFirewallRule -Name $name -DisplayName 'BattleFleet Arena - privates LAN' -Direction Inbound -Action Allow -Protocol TCP -LocalPort 5173,2567 -LocalAddress $LanAddress -RemoteAddress LocalSubnet -Profile Private -Program $nodePath | Out-Null
    }
    @{status='complete'; address=$LanAddress; rule=$name} | ConvertTo-Json | Set-Content -LiteralPath $reportPath -Encoding UTF8
} catch {
    @{status='failed'; error=$_.Exception.Message} | ConvertTo-Json | Set-Content -LiteralPath $reportPath -Encoding UTF8
    throw
}
