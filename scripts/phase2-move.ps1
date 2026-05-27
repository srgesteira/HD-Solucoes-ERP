# Fase 2 — move fisico com git mv (sem alterar src/app/* rotas)
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

function Ensure-Dir($path) {
  if (-not (Test-Path $path)) {
    New-Item -ItemType Directory -Force -Path $path | Out-Null
  }
}

function Git-Mv($from, $to) {
  if (-not (Test-Path $from)) {
    Write-Warning "SKIP (missing): $from"
    return
  }
  Ensure-Dir (Split-Path $to -Parent)
  git mv $from $to
  Write-Host "OK $from -> $to"
}

# --- shared ---
Git-Mv "src/lib/permissions.ts" "src/shared/auth/permissions.ts"
Git-Mv "src/lib/supabase" "src/shared/db/supabase"
Git-Mv "src/lib/schemas" "src/shared/contracts"
Git-Mv "src/lib/numbers" "src/shared/utils/numbers"
Git-Mv "src/lib/external" "src/shared/utils/external"

# shared/utils (utilitarios genericos)
$sharedUtils = @("cn.ts", "date.ts", "constants.ts", "export-csv.ts", "br-document.ts")
foreach ($f in $sharedUtils) {
  Git-Mv "src/lib/utils/$f" "src/shared/utils/$f"
}

# --- modules/core ---
Git-Mv "src/lib/types" "src/modules/core/types"
Git-Mv "src/lib/http.ts" "src/modules/core/lib/http.ts"
Git-Mv "src/lib/dashboard" "src/modules/core/lib/dashboard"
Git-Mv "src/lib/utils/tenant.ts" "src/modules/core/lib/tenant.ts"
Git-Mv "src/lib/utils/module-access.ts" "src/modules/core/lib/module-access.ts"
Git-Mv "src/lib/utils/report-access.ts" "src/modules/core/lib/report-access.ts"
Git-Mv "src/lib/utils/supabase-migration.ts" "src/modules/core/lib/supabase-migration.ts"

# --- modules/vendas ---
Git-Mv "src/lib/sales" "src/modules/vendas/lib/sales"
Git-Mv "src/lib/customers" "src/modules/vendas/lib/customers"

# --- modules/compras ---
Git-Mv "src/lib/purchasing" "src/modules/compras/lib/purchasing"
Git-Mv "src/lib/suppliers" "src/modules/compras/lib/suppliers"
Git-Mv "src/lib/purchasing-requisitions.ts" "src/modules/compras/lib/purchasing-requisitions.ts"

# --- modules/engenharia ---
Git-Mv "src/lib/products" "src/modules/engenharia/lib/products"
Git-Mv "src/lib/pricing" "src/modules/engenharia/lib/pricing"
Git-Mv "src/lib/services" "src/modules/engenharia/lib/services"
Git-Mv "src/lib/validators/work-area.ts" "src/modules/engenharia/lib/validators/work-area.ts"
Git-Mv "src/lib/utils/work-area.ts" "src/modules/engenharia/lib/work-area.ts"

# --- modules/faturamento ---
Git-Mv "src/lib/nfe" "src/modules/faturamento/lib/nfe"

# --- modules/pcp ---
Git-Mv "src/lib/pcp-api-auth.ts" "src/modules/pcp/lib/pcp-api-auth.ts"
Git-Mv "src/lib/pcp-item-origin.ts" "src/modules/pcp/lib/pcp-item-origin.ts"
Git-Mv "src/lib/pcp-order-display.ts" "src/modules/pcp/lib/pcp-order-display.ts"
Git-Mv "src/lib/pcp-planning.ts" "src/modules/pcp/lib/pcp-planning.ts"
Git-Mv "src/lib/pcp-purchase-schedule.ts" "src/modules/pcp/lib/pcp-purchase-schedule.ts"
Git-Mv "src/lib/mrp-service.ts" "src/modules/pcp/lib/mrp-service.ts"
Git-Mv "src/lib/order-item-production-status.ts" "src/modules/pcp/lib/order-item-production-status.ts"

# --- modules/producao ---
Git-Mv "src/lib/production" "src/modules/producao/lib/production"
Git-Mv "src/lib/production-line-sync.ts" "src/modules/producao/lib/production-line-sync.ts"

# --- modules/rh ---
Git-Mv "src/lib/labor-allocation-period.ts" "src/modules/rh/lib/labor-allocation-period.ts"
Git-Mv "src/lib/labor-cost-drivers.ts" "src/modules/rh/lib/labor-cost-drivers.ts"
Git-Mv "src/lib/labor-cost-utils.ts" "src/modules/rh/lib/labor-cost-utils.ts"

# --- modules/boards ---
Git-Mv "src/lib/notifications" "src/modules/boards/lib/notifications"
Git-Mv "src/lib/validators/board.ts" "src/modules/boards/lib/validators/board.ts"
Git-Mv "src/lib/validators/epic.ts" "src/modules/boards/lib/validators/epic.ts"
Git-Mv "src/lib/validators/task.ts" "src/modules/boards/lib/validators/task.ts"
$boardUtils = @(
  "board-epic.ts", "epic-outer-stage.ts", "kanban-helpers.ts",
  "kanban-reorder-permission.ts", "task-embed-map.ts", "task-pipeline.ts",
  "task-select.ts", "task-visibility.ts"
)
foreach ($f in $boardUtils) {
  Git-Mv "src/lib/utils/$f" "src/modules/boards/lib/utils/$f"
}

# --- modules/almoxarifado (inbound de compras) ---
Git-Mv "src/modules/compras/lib/purchasing/inventory-inbound.ts" "src/modules/almoxarifado/lib/inventory-inbound.ts"

# --- shared/ui (componentes base) ---
if (Test-Path "src/components/ui") {
  Git-Mv "src/components/ui" "src/shared/ui"
}

Write-Host "`n--- Restante em src/lib ---"
if (Test-Path "src/lib") {
  Get-ChildItem "src/lib" -Recurse -File | ForEach-Object { $_.FullName.Replace((Get-Location).Path + "\", "") }
}

Write-Host "`nDone phase2-move"
