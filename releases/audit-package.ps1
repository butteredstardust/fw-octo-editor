param(
  [Parameter(Mandatory = $true)] [string]$StageRoot,
  [string]$SourceRoot,
  [string]$PlaintextKeyFile
)

$ErrorActionPreference = 'Stop'
$stage = (Resolve-Path -LiteralPath $StageRoot).Path
$failures = [System.Collections.Generic.List[string]]::new()
$forbiddenNames = @('.git','.github','.temp','test','tests','reference','references','config','backups','settings.json','fwinter-db-key.txt','playwright.config.js','eslint.config.js')
$developmentScripts = @('fetch-wiki-items.js','fetch-wiki-quests.js','fetch-wiki-recipes.js','fetch-wiki-weapon-data.js','extract-reference-items.js','extract-prestige-reference.js','extract-weapon-xp-reference.js')

Get-ChildItem -LiteralPath $stage -Recurse -Force | ForEach-Object {
  if ($forbiddenNames -contains $_.Name -or $developmentScripts -contains $_.Name) {
    $failures.Add("Forbidden staged artifact: $($_.FullName.Substring($stage.Length + 1))")
  }
  if (-not $_.PSIsContainer -and $_.Extension -in @('.dat','.sav','.sqlite','.db')) {
    $failures.Add("Possible save/database artifact: $($_.FullName.Substring($stage.Length + 1))")
  }
}

if ($SourceRoot) {
  $escapedRoot = [regex]::Escape((Resolve-Path -LiteralPath $SourceRoot).Path)
  Get-ChildItem -LiteralPath $stage -Recurse -File |
    Where-Object { $_.Length -lt 10MB -and $_.Extension -notin @('.exe','.dll','.ico','.gif','.ttf') } |
    ForEach-Object {
      if (Select-String -LiteralPath $_.FullName -Pattern $escapedRoot -Quiet) {
        $failures.Add("Build-machine path leaked into: $($_.FullName.Substring($stage.Length + 1))")
      }
    }
}

if ($PlaintextKeyFile -and (Test-Path -LiteralPath $PlaintextKeyFile)) {
  $key = (Get-Content -LiteralPath $PlaintextKeyFile -Raw).Trim()
  if ($key) {
    Get-ChildItem -LiteralPath $stage -Recurse -File | Where-Object { $_.Length -lt 10MB } | ForEach-Object {
      try {
        if (Select-String -LiteralPath $_.FullName -SimpleMatch $key -Quiet -ErrorAction Stop) {
          $failures.Add("Plaintext database key found in: $($_.FullName.Substring($stage.Length + 1))")
        }
      } catch {
        # Binary decoding failures do not expose content and are ignored.
      }
    }
  }
}

foreach ($required in @('LICENSE','ACKNOWLEDGEMENTS.md','package.json','bin\launcher.js')) {
  if (-not (Test-Path -LiteralPath (Join-Path $stage $required))) { $failures.Add("Required release file missing: $required") }
}
if ($failures.Count) {
  $failures | ForEach-Object { Write-Error $_ }
  throw "Package audit failed with $($failures.Count) finding(s)."
}
Write-Host "Package audit passed: $stage"
