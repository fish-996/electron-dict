# build-wasm.ps1 (v14 - 精准排除版)

# 设定脚本在遇到任何错误时立即停止
$ErrorActionPreference = "Stop"

# 切换到包的根目录
Write-Host "INFO: Setting working directory..."
$packageRoot = (Split-Path -Path $PSScriptRoot -Parent)
Set-Location -Path $packageRoot
Write-Host "SUCCESS: Working directory is now $(Get-Location)"

# --- 核心修正：在搜索核心库文件时，明确排除所有测试程序 ---
Write-Host "INFO: Finding core library source files and EXCLUDING test programs..."
$sourceFiles = @()
$sourceFiles += "src/c/decoder_wrapper.c"

# 定义要排除的捣乱文件列表
$speexExcludeList = @(
    "*test*",      # 排除所有名字里带 test 的文件，如 testenc.c, testdec.c
    "*speexenc*",  # 排除 speexenc.c
    "*speexdec*",  # 排除 speexdec.c
    "*skeleton*"   # 排除 skeleton.c (这是一个示例模板)
)

# 编译 libspeex 核心文件，并排除捣乱文件
$sourceFiles += (Get-ChildItem -Path "src/c/speex/libspeex" -Recurse -Filter "*.c" -Exclude $speexExcludeList).FullName

# 编译 libogg 核心文件
$sourceFiles += (Get-ChildItem -Path "src/c/libogg/src" -Recurse -Filter "*.c").FullName

# (可选) 调试行：取消注释以查看最终的文件列表
# Write-Host "DEBUG: Final list of source files to be compiled:"
# $sourceFiles | ForEach-Object { Write-Host "- $_" }

# 定义输出
$outputDir = "dist"
$outputJs = Join-Path $outputDir "speex-decoder.js"

# 创建输出目录
New-Item -ItemType Directory -Force -Path $outputDir | Out-Null

# 开始编译
Write-Host "INFO: Starting Emscripten compilation and linking..."

# 使用 Splatting 技术
$emccArgs = @(
    "-O3",
    "-s", "WASM=1",
    "-s", "MODULARIZE=1",
    "-s", "EXPORT_NAME='createSpeexModule'",
    "-s", "EXPORTED_RUNTIME_METHODS=['ccall']",
    "-s", "EXPORTED_FUNCTIONS=['_malloc', '_free', '_decode_spx_to_wav', '_free_wav_buffer']",
    "-s", "ALLOW_MEMORY_GROWTH=1",
    "-I", "src/c/speex/include",
    "-I", "src/c/libogg/include",
    "-D", "HAVE_CONFIG_H",
    $sourceFiles,
    "-o", $outputJs
)

emcc @emccArgs

# 检查结果
if ($LASTEXITCODE -eq 0) {
    Write-Host "----------------------------------------------------" -ForegroundColor Green
    Write-Host "SUCCESS! BUILD COMPLETE! YOU DID IT!" -ForegroundColor Green
    Write-Host "Output files are in the '$outputDir' directory." -ForegroundColor Green
    Write-Host "----------------------------------------------------" -ForegroundColor Green
} else {
    Write-Host "----------------------------------------------------" -ForegroundColor Red
    Write-Host "ERROR: WASM build FAILED during the final linking stage." -ForegroundColor Red
    Write-Host "----------------------------------------------------" -ForegroundColor Red
    exit 1
}
