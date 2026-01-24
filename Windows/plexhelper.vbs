Option Explicit
Dim WshShell, strArg, psCommand

' 1. URL 인자 받기
If WScript.Arguments.Count = 0 Then WScript.Quit
strArg = WScript.Arguments(0)

' 2. PowerShell 명령어 조립
psCommand = ""
psCommand = psCommand & "$u='" & strArg & "';"

' 프로토콜과 인코딩된 경로 분리
psCommand = psCommand & "if($u -match '^(plexplay|plexfolder)://(.*)'){$p=$matches[1];$e=$matches[2]}else{exit};"

' URL 디코딩 (3중 안전장치)
psCommand = psCommand & "try{$d=[System.Uri]::UnescapeDataString($e)}catch{try{$d=[System.Net.WebUtility]::UrlDecode($e)}catch{$d=$e}};"

' 경로 다듬기 (슬래시 변환 및 공백 제거)
psCommand = psCommand & "$path=$d.Replace('/','\').Trim().TrimEnd('\');"

' 실행 로직
psCommand = psCommand & "if(Test-Path -LiteralPath $path){"
' [재생] Invoke-Item으로 실행
psCommand = psCommand & "  if($p -eq 'plexplay'){Invoke-Item -LiteralPath $path}"
' [폴더] 파일이면 선택해서 열기, 폴더면 그냥 열기
psCommand = psCommand & "  elseif($p -eq 'plexfolder'){$i=Get-Item -LiteralPath $path; if($i -is [System.IO.DirectoryInfo]){Invoke-Item -LiteralPath $path}else{$a='/select,""'+$path+'""';Start-Process explorer.exe -ArgumentList $a}}"
psCommand = psCommand & "}else{"
' [에러] 메시지 박스 출력
psCommand = psCommand & "  Add-Type -AssemblyName System.Windows.Forms;[System.Windows.Forms.MessageBox]::Show('파일을 찾을 수 없습니다.'+[Environment]::NewLine+'경로: '+$path,'Plex Helper Error',0,16)"
psCommand = psCommand & "}"

' 3. PowerShell 몰래 실행 (WindowStyle Hidden)
Set WshShell = CreateObject("WScript.Shell")
' 0 = 창 숨김, False = 종료 기다리지 않음
WshShell.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command """ & psCommand & """", 0, False
