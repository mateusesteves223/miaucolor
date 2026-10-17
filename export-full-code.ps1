$ErrorActionPreference = 'Stop'

$root = $PSScriptRoot
$outputPath = Join-Path $root 'fullCode.md'
$includedExtensions = @(
    '.js', '.mjs', '.cjs', '.jsx',
    '.ts', '.tsx',
    '.py', '.ps1',
    '.html', '.css',
    '.json', '.webmanifest'
)
$excludedDirectories = @('.git', 'node_modules', 'dist', 'build', 'coverage')
$utf8 = New-Object System.Text.UTF8Encoding($true)
$builder = New-Object System.Text.StringBuilder

[void]$builder.AppendLine('# MiauColor code export')
[void]$builder.AppendLine()
[void]$builder.AppendLine("Gerado em: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')")
[void]$builder.AppendLine()

$files = Get-ChildItem -LiteralPath $root -Recurse -File |
    Where-Object {
        $relativePath = $_.FullName.Substring($root.Length).TrimStart('\')
        $pathParts = $relativePath -split '[\\/]'
        $extension = $_.Extension.ToLowerInvariant()

        ($includedExtensions -contains $extension) -and
        ($relativePath -ne 'fullCode.md') -and
        -not ($pathParts | Where-Object { $excludedDirectories -contains $_ })
    } |
    Sort-Object FullName

foreach ($file in $files) {
    $relativePath = $file.FullName.Substring($root.Length).TrimStart('\')
    $isInRoot = $relativePath -notmatch '[\\/]'
    $modifiedAt = $file.LastWriteTime.ToString('yyyy-MM-dd HH:mm:ss')
    $content = [System.IO.File]::ReadAllText($file.FullName)
    $backtickRuns = [regex]::Matches($content, '`+')
    $longestRun = 2

    foreach ($run in $backtickRuns) {
        if ($run.Length -gt $longestRun) {
            $longestRun = $run.Length
        }
    }

    $fence = '`' * ($longestRun + 1)
    $language = $file.Extension.TrimStart('.').ToLowerInvariant()

    [void]$builder.AppendLine("## $($file.Name)")
    [void]$builder.AppendLine()
    [void]$builder.AppendLine("- Last modified: $modifiedAt")
    if (-not $isInRoot) {
        [void]$builder.AppendLine("- Caminho: $relativePath")
    }
    [void]$builder.AppendLine()
    [void]$builder.AppendLine("$fence$language")
    [void]$builder.Append($content)
    if (-not $content.EndsWith("`n")) {
        [void]$builder.AppendLine()
    }
    [void]$builder.AppendLine($fence)
    [void]$builder.AppendLine()
}

[System.IO.File]::WriteAllText($outputPath, $builder.ToString(), $utf8)
Write-Output "Exportados $($files.Count) arquivos para $outputPath"
