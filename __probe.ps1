$p = 'c:\Users\famor\arena-vs\components\TikTokStyleArena.tsx'
$b = [System.IO.File]::ReadAllBytes($p)
$c = [System.IO.File]::ReadAllText($p)
Write-Output ("Len=" + $b.Length)
Write-Output ("B0=" + $b[0] + " B1=" + $b[1] + " B2=" + $b[2])
Write-Output ("HasCR=" + $c.Contains([char]13))
Write-Output ("LineCountLF=" + ($c.Split("`n")).Length)
