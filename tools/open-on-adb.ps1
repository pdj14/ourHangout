param(
  [int]$Port = 19000
)

$ErrorActionPreference = "Stop"

$adb = & adb devices
$connected = $adb | Select-String -Pattern "device$"
if (-not $connected) {
  Write-Error "No adb device connected. Connect phone (USB debugging) and accept RSA prompt."
}

$manifestRaw = & curl.exe -s "http://127.0.0.1:$Port"
if (-not $manifestRaw) {
  Write-Error "Expo dev server is not reachable on port $Port."
}

$manifest = $manifestRaw | ConvertFrom-Json
$hostUri = $manifest.extra.expoClient.hostUri
if (-not $hostUri) {
  Write-Error "Could not resolve Expo hostUri from manifest."
}

$expoUrl = "exp://$hostUri"
Write-Output "Opening on device: $expoUrl"

& adb shell am start -a android.intent.action.VIEW -d $expoUrl host.exp.exponent | Out-Null
Write-Output "Launch intent sent to Expo Go."
