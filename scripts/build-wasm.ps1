# Build FROST WASM module (PowerShell version for Windows)
# Requires: Rust, wasm-pack, wasm32-unknown-unknown target
# Run from VS Developer PowerShell for best results

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir
$FrostWasmDir = Join-Path $ProjectRoot "src\lib\frost-wasm"

Write-Host "=== FROST WASM Build Script ===" -ForegroundColor Cyan
Write-Host ""

# Check prerequisites
Write-Host "Checking prerequisites..."

$rustc = Get-Command rustc -ErrorAction SilentlyContinue
if (-not $rustc) {
    Write-Host "ERROR: Rust is not installed." -ForegroundColor Red
    Write-Host "Install from: https://rustup.rs/"
    exit 1
}

$wasmPack = Get-Command wasm-pack -ErrorAction SilentlyContinue
if (-not $wasmPack) {
    Write-Host "ERROR: wasm-pack is not installed." -ForegroundColor Red
    Write-Host "Install with: cargo install wasm-pack"
    exit 1
}

$targets = rustup target list --installed
if ($targets -notcontains "wasm32-unknown-unknown") {
    Write-Host "Adding wasm32-unknown-unknown target..."
    rustup target add wasm32-unknown-unknown
}

Write-Host "Prerequisites OK" -ForegroundColor Green
Write-Host ""

# Check for Git link.exe conflict
$gitLink = Get-Command link -ErrorAction SilentlyContinue
if ($gitLink -and $gitLink.Source -like "*Git*") {
    Write-Host "WARNING: Git's link.exe may conflict with MSVC linker." -ForegroundColor Yellow
    Write-Host "If build fails, run from VS Developer PowerShell or see WASM-INTEGRATION.md"
    Write-Host ""
}

# Build WASM
Write-Host "Building WASM module..."
Push-Location $FrostWasmDir

try {
    wasm-pack build --target web --out-dir pkg
} finally {
    Pop-Location
}

Write-Host ""
Write-Host "=== Build Complete ===" -ForegroundColor Green
Write-Host "Output: $FrostWasmDir\pkg\"
Write-Host ""
Write-Host "Files:"
Get-ChildItem -Path (Join-Path $FrostWasmDir "pkg") | Format-Table Name, Length

Write-Host ""
Write-Host "The WASM module is ready to use!" -ForegroundColor Green
Write-Host "The Next.js app will automatically load it from src/lib/frost-wasm/pkg/"
