param(
    [ValidateSet("build", "flash", "monitor")]
    [string]$Action = "build",
    [string]$Port = ""
)

$ErrorActionPreference = "Stop"
$projectDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$pio = Join-Path $HOME ".platformio\penv\Scripts\pio.exe"

if (-not (Test-Path $pio)) {
    throw "PlatformIO tidak ditemukan di $pio. Pasang PlatformIO IDE pada VS Code terlebih dahulu."
}

Set-Location $projectDirectory

switch ($Action) {
    "build" {
        & $pio run -e e32_receiver
    }
    "flash" {
        $arguments = @("run", "-e", "e32_receiver", "-t", "upload")
        if ($Port -ne "") {
            $arguments += @("--upload-port", $Port)
        }
        & $pio @arguments
    }
    "monitor" {
        $arguments = @("device", "monitor", "-e", "e32_receiver", "--baud", "115200")
        if ($Port -ne "") {
            $arguments += @("--port", $Port)
        }
        & $pio @arguments
    }
}

if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}
