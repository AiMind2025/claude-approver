# Claude 审批助手 (PowerShell 版本)
#
# 用法:
#   .\approve.ps1 -Command "docker exec ..." -Desc "启动容器" -Risk "warning"
#
# 参数:
#   -Command  命令内容（必填）
#   -Desc     描述（可选）
#   -Risk     风险等级: normal | warning | danger（默认 normal）
#   -Timeout  超时秒数（默认 300）

param(
    [Parameter(Mandatory=$true)][string]$Command,
    [string]$Desc = "",
    [ValidateSet("normal","warning","danger")][string]$Risk = "normal",
    [int]$Timeout = 300
)

$Port = if ($env:PORT) { $env:PORT } else { "8765" }
$API  = "http://localhost:$Port"

# 创建审批请求
Write-Host "📤 发送审批请求..." -ForegroundColor Cyan
try {
    $body = @{ command = $Command; description = $Desc; risk = $Risk } | ConvertTo-Json
    $resp = Invoke-RestMethod -Uri "$API/api/request" -Method POST -ContentType "application/json" -Body $body
    $requestId = $resp.request.id
} catch {
    Write-Host "❌ 无法连接审批服务器 ($API)" -ForegroundColor Red
    Write-Host "   请先启动: node server.js" -ForegroundColor Yellow
    exit 1
}

if (-not $requestId) {
    Write-Host "❌ 创建请求失败" -ForegroundColor Red
    exit 1
}

Write-Host "📱 等待手机审批... (ID: $requestId, 超时: ${Timeout}s)" -ForegroundColor Green
Write-Host "   打开 $API 进行审批" -ForegroundColor Gray

# 轮询等待
$sw = [System.Diagnostics.Stopwatch]::StartNew()
while ($sw.Elapsed.TotalSeconds -lt $Timeout) {
    try {
        $result = Invoke-RestMethod -Uri "$API/api/check?id=$requestId" -Method GET
    } catch {
        Start-Sleep -Seconds 1
        continue
    }

    switch ($result.status) {
        "approved" {
            Write-Host "`n✅ 已批准！执行命令..." -ForegroundColor Green
            exit 0
        }
        "rejected" {
            Write-Host "`n❌ 已拒绝，中止执行" -ForegroundColor Red
            exit 1
        }
        "pending" {
            $remaining = [math]::Floor($Timeout - $sw.Elapsed.TotalSeconds)
            Write-Host "`r   ⏳ 等待中... 还剩 ${remaining}s  " -NoNewline -ForegroundColor Yellow
            Start-Sleep -Milliseconds 500
        }
        default {
            Write-Host "`n⚠️ 未知状态: $($result.status)" -ForegroundColor Yellow
            exit 3
        }
    }
}

Write-Host "`n⏰ 审批超时 (${Timeout}s)" -ForegroundColor Red
exit 2
