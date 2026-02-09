' plexhelper.vbs - Windows용 Plex Helper 스크립트
Option Explicit
Dim WshShell, strArg, psCommand, potPath

' =========================================================
' [설정] 팟플레이어 경로
potPath = "C:\Program Files\DAUM\PotPlayer\PotPlayerMini64.exe"
' =========================================================

If WScript.Arguments.Count = 0 Then WScript.Quit
strArg = WScript.Arguments(0)

psCommand = ""
psCommand = psCommand & "$u='" & strArg & "';"
psCommand = psCommand & "$pot='" & potPath & "';"

' 프로토콜 분리
psCommand = psCommand & "if($u -match '^(plexplay|plexfolder|plexstream)://(.*)'){$p=$matches[1];$e=$matches[2]}else{exit};"

' ---------------------------------------------------------
' [1] 스트리밍 (plexstream)
' ---------------------------------------------------------
psCommand = psCommand & "if($p -eq 'plexstream'){"
psCommand = psCommand & "  try{$decoded=[System.Uri]::UnescapeDataString($e)}catch{$decoded=$e};"
'  # 파이프(|)로 분리 후 앞뒤 공백 및 끝 슬래시 제거
psCommand = psCommand & "  $parts=$decoded -split '\|';"
psCommand = psCommand & "  $vid=$parts[0].Trim().TrimEnd('/');"
psCommand = psCommand & "  $sub=if($parts.Count -gt 1){$parts[1].Trim().TrimEnd('/')}else{''};"

'  # 실행 인자 조립
psCommand = psCommand & "  if(Test-Path $pot){"
psCommand = psCommand & "    $a='""'+$vid+'""';"
psCommand = psCommand & "    if($sub){$a+=' /sub=""'+$sub+'""'};"
psCommand = psCommand & "    Start-Process -FilePath $pot -ArgumentList $a;"
psCommand = psCommand & "  }else{"
psCommand = psCommand & "    Add-Type -AssemblyName System.Windows.Forms;[System.Windows.Forms.MessageBox]::Show('팟플레이어를 찾을 수 없습니다.');"
psCommand = psCommand & "  }"
psCommand = psCommand & "  exit;"
psCommand = psCommand & "}"

' ---------------------------------------------------------
' [2] 로컬 재생/폴더
' ---------------------------------------------------------
psCommand = psCommand & "try{$d=[System.Uri]::UnescapeDataString($e)}catch{try{$d=[System.Net.WebUtility]::UrlDecode($e)}catch{$d=$e}};"
psCommand = psCommand & "$path=$d.Replace('/','\').Trim().TrimEnd('\');"
psCommand = psCommand & "if(Test-Path -LiteralPath $path){"
psCommand = psCommand & "  if($p -eq 'plexplay'){Invoke-Item -LiteralPath $path}"
psCommand = psCommand & "  elseif($p -eq 'plexfolder'){$i=Get-Item -LiteralPath $path; if($i -is [System.IO.DirectoryInfo]){Invoke-Item -LiteralPath $path}else{$a='/select,""'+$path+'""';Start-Process explorer.exe -ArgumentList $a}}"
psCommand = psCommand & "}else{"
psCommand = psCommand & "  Add-Type -AssemblyName System.Windows.Forms;[System.Windows.Forms.MessageBox]::Show('파일을 찾을 수 없습니다.'+[Environment]::NewLine+'경로: '+$path,'Plex Helper Error',0,16)"
psCommand = psCommand & "}"

Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command """ & psCommand & """", 0, False

