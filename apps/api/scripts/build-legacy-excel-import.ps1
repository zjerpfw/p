param(
  [Parameter(Mandatory = $true)]
  [string]$ExcelPath,
  [Parameter(Mandatory = $true)]
  [string]$OutputPath,
  [string]$OwnerId = 'zhangsan'
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem

function Escape-Sql([string]$Value) {
  return $Value.Replace("'", "''")
}

function To-SqlText([string]$Value) {
  if ([string]::IsNullOrWhiteSpace($Value)) { return 'NULL' }
  return "'$(Escape-Sql $Value.Trim())'"
}

function To-SqlInteger([string]$Value) {
  if ([string]::IsNullOrWhiteSpace($Value)) { return 'NULL' }
  $number = 0.0
  if (-not [double]::TryParse($Value, [Globalization.NumberStyles]::Any, [Globalization.CultureInfo]::InvariantCulture, [ref]$number)) {
    throw "无法解析金额或年限：$Value"
  }
  return [math]::Round($number, 0, [MidpointRounding]::AwayFromZero).ToString([Globalization.CultureInfo]::InvariantCulture)
}

function To-DateFromExcelSerial([string]$Value) {
  $serial = 0.0
  if (-not [double]::TryParse($Value, [Globalization.NumberStyles]::Any, [Globalization.CultureInfo]::InvariantCulture, [ref]$serial)) {
    throw "无法解析成交日期：$Value"
  }
  $excelEpoch = [datetime]::ParseExact('1899-12-30', 'yyyy-MM-dd', [Globalization.CultureInfo]::InvariantCulture)
  return $excelEpoch.AddDays($serial).ToString('yyyy-MM-dd')
}

function Normalize-CustomerName([string]$Name) {
  $normalized = $Name.Trim()
  $isRenewal = $normalized -match '续费'
  $normalized = $normalized -replace '（续费）|\(续费\)', ''
  $normalized = $normalized -replace '续费', ''
  if ($isRenewal) {
    $normalized = $normalized -replace '[（(](新乡|焦作)[）)]', ''
  }
  return ($normalized -replace '有限公式', '有限公司').Trim()
}

function Get-HashId([string]$Prefix, [string]$Value) {
  $sha = [Security.Cryptography.SHA256]::Create()
  try {
    $hash = [Convert]::ToHexString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($Value))).ToLowerInvariant()
    return "$Prefix$($hash.Substring(0, 24))"
  } finally {
    $sha.Dispose()
  }
}

function Get-ZipText($Zip, [string]$EntryName) {
  $entry = $Zip.GetEntry($EntryName)
  if (-not $entry) { throw "Excel 中不存在 $EntryName" }
  $reader = [IO.StreamReader]::new($entry.Open())
  try { return $reader.ReadToEnd() } finally { $reader.Dispose() }
}

$zip = [IO.Compression.ZipFile]::OpenRead((Resolve-Path -LiteralPath $ExcelPath))
try {
  [xml]$sharedXml = Get-ZipText $zip 'xl/sharedStrings.xml'
  $sharedNs = [Xml.XmlNamespaceManager]::new($sharedXml.NameTable)
  $sharedNs.AddNamespace('x', 'http://schemas.openxmlformats.org/spreadsheetml/2006/main')
  $sharedStrings = @()
  foreach ($item in $sharedXml.SelectNodes('//x:si', $sharedNs)) {
    $sharedStrings += (($item.SelectNodes('.//x:t', $sharedNs) | ForEach-Object { $_.InnerText }) -join '')
  }

  [xml]$sheetXml = Get-ZipText $zip 'xl/worksheets/sheet1.xml'
  $sheetNs = [Xml.XmlNamespaceManager]::new($sheetXml.NameTable)
  $sheetNs.AddNamespace('x', 'http://schemas.openxmlformats.org/spreadsheetml/2006/main')
  $rows = @()
  foreach ($row in $sheetXml.SelectNodes('//x:sheetData/x:row', $sheetNs)) {
    $values = @{}
    foreach ($cell in $row.SelectNodes('./x:c', $sheetNs)) {
      $column = $cell.r -replace '\d', ''
      $valueNode = $cell.SelectSingleNode('./x:v', $sheetNs)
      $value = if ($valueNode) { $valueNode.InnerText } else { '' }
      if ($cell.t -eq 's' -and $value -ne '') { $value = $sharedStrings[[int]$value] }
      if ($cell.t -eq 'inlineStr') { $value = (($cell.SelectNodes('./x:is//x:t', $sheetNs) | ForEach-Object { $_.InnerText }) -join '') }
      $values[$column] = $value
    }
    $rows += [pscustomobject]@{ Row = [int]$row.r; Values = $values }
  }
} finally {
  $zip.Dispose()
}

$header = $rows | Select-Object -First 1
if (-not $header -or $header.Values['A'] -ne '成交日期' -or $header.Values['B'] -ne '客户名称') {
  throw 'Excel 表头不符合预期：需包含成交日期与客户名称。'
}

$now = [datetime]::UtcNow.ToString('yyyy-MM-dd HH:mm:ss')
$sql = [Collections.Generic.List[string]]::new()
$sql.Add('-- Generated from legacy sales Excel. This file is safe to execute repeatedly.')
$sql.Add('-- Explicit renewal rows are merged into their normalized customer and retained as independent Won deals.')
$customers = @{}
$dealsInserted = 0
$dealsSkipped = 0
$renewalDeals = 0

foreach ($row in ($rows | Select-Object -Skip 1)) {
  $data = $row.Values
  $sourceName = ($data['B'] ?? '').Trim()
  if (-not $sourceName) { continue }
  $customerName = Normalize-CustomerName $sourceName
  $customerId = Get-HashId 'legacy_excel_customer_' $customerName
  $isRenewal = $sourceName -match '续费'
  if ($isRenewal) { $renewalDeals++ }
  $date = To-DateFromExcelSerial $data['A']

  if (-not $customers.ContainsKey($customerName)) {
    $customers[$customerName] = $customerId
    $sql.Add("INSERT OR IGNORE INTO customers (id, name, contact_phone, status, address, owner_id, is_deleted, created_at, updated_at) SELECT '$customerId', $(To-SqlText $customerName), NULL, 'Active', NULL, '$(Escape-Sql $OwnerId)', 0, unixepoch('$date'), unixepoch('$now') WHERE NOT EXISTS (SELECT 1 FROM customers WHERE name = $(To-SqlText $customerName) AND is_deleted = 0);")
  }

  if ([string]::IsNullOrWhiteSpace($data['J'])) {
    $dealsSkipped++
    $sql.Add("-- Excel row $($row.Row): customer only. Missing 成交价; add its historical order manually after data completion.")
    continue
  }

  $dealId = "legacy_excel_deal_$($row.Row.ToString('000'))"
  $durationYears = To-SqlInteger $data['D']
  $expireDate = if ($durationYears -eq 'NULL') { 'NULL' } else { "unixepoch(date('$date', '+' || $durationYears || ' years'))" }
  $productName = if ([string]::IsNullOrWhiteSpace($data['E'])) { '未填写产品' } else { $data['E'].Trim() }
  $amountCents = "$(To-SqlInteger $data['J']) * 100"
  $originalPriceCents = if ([string]::IsNullOrWhiteSpace($data['F'])) { $amountCents } else { "$(To-SqlInteger $data['F']) * 100" }
  $channel = To-SqlText $data['C']
  $softwareCostCents = "$(To-SqlInteger $data['G']) * 100"
  $taxCostCents = "$(To-SqlInteger $data['H']) * 100"
  $rebateAmountCents = "$(To-SqlInteger $data['I']) * 100"
  $netProfitCents = "$(To-SqlInteger $data['K']) * 100"
  $sql.Add("INSERT OR IGNORE INTO deals (id, customer_id, amount_cents, channel, original_price_cents, product_name, stage, expected_close_date, start_date, duration_years, gift_months, expire_date, renewal_reminder_days, software_cost_cents, tax_cost_cents, rebate_amount_cents, net_profit_cents, is_deleted, created_at) VALUES ('$dealId', COALESCE((SELECT id FROM customers WHERE name = $(To-SqlText $customerName) AND is_deleted = 0 ORDER BY created_at ASC LIMIT 1), '$customerId'), $amountCents, $channel, $originalPriceCents, $(To-SqlText $productName), 'Won', unixepoch('$date'), unixepoch('$date'), $durationYears, 0, $expireDate, 30, $softwareCostCents, $taxCostCents, $rebateAmountCents, $netProfitCents, 0, unixepoch('$date'));")
  $dealsInserted++
}

$sql.Add("-- Summary: $($customers.Count) normalized customers, $dealsInserted Won orders, $renewalDeals renewal orders merged, $dealsSkipped customer-only rows due to missing 成交价.")
$directory = Split-Path -Parent $OutputPath
if ($directory) { New-Item -ItemType Directory -Force -Path $directory | Out-Null }
[IO.File]::WriteAllLines($OutputPath, $sql, [Text.UTF8Encoding]::new($false))
Write-Host "Generated $OutputPath"
Write-Host "Customers: $($customers.Count); Won orders: $dealsInserted; Renewal orders merged: $renewalDeals; Customer-only rows: $dealsSkipped"
