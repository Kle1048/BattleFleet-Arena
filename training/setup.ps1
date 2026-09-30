param([string]$Python = "python")
$ErrorActionPreference = "Stop"
$trainingRoot = $PSScriptRoot
& $Python -m venv (Join-Path $trainingRoot '.venv')
if ($LASTEXITCODE -ne 0) { throw 'Python 3.10+ with venv is required (tested: 3.12).' }
$trainingPython = Join-Path $trainingRoot '.venv/Scripts/python.exe'
& $trainingPython -m pip install torch==2.8.0 --index-url https://download.pytorch.org/whl/cpu
if ($LASTEXITCODE -ne 0) { throw 'PyTorch installation failed.' }
& $trainingPython -m pip install -r (Join-Path $trainingRoot 'requirements.txt')
if ($LASTEXITCODE -ne 0) { throw 'Training dependency installation failed.' }
Write-Host 'Ready. Run: npm run training:smoke'
