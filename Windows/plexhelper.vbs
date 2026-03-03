' plexhelper.vbs - Windows용 Plex Helper 스크립트
Option Explicit
Dim WshShell, fso, strArg, potPath

' =========================================================
' [설정] 팟플레이어 경로 (x64 및 x86 자동 탐색)
potPath = "C:\Program Files\DAUM\PotPlayer\PotPlayerMini64.exe"
Set fso = CreateObject("Scripting.FileSystemObject")
If Not fso.FileExists(potPath) Then 
    potPath = "C:\Program Files (x86)\DAUM\PotPlayer\PotPlayerMini.exe"
End If
' =========================================================

If WScript.Arguments.Count = 0 Then WScript.Quit
strArg = WScript.Arguments(0)
Set WshShell = CreateObject("WScript.Shell")

Dim protocol, payload, decodedPayload, parts
Dim videoUrl, subUrl, fileName

' 1. 프로토콜 및 페이로드 분리
Dim delimPos
delimPos = InStr(strArg, "://")
If delimPos > 0 Then
    protocol = LCase(Left(strArg, delimPos - 1))
    payload = Mid(strArg, delimPos + 3)
Else
    WScript.Quit
End If

' 2. URL 디코딩 함수
Function DecodeURL(str)
    Dim html
    Set html = CreateObject("htmlfile")
    html.parentWindow.execScript "function decode(s){return decodeURIComponent(s);}", "jscript"
    DecodeURL = html.parentWindow.decode(str)
End Function

On Error Resume Next
decodedPayload = DecodeURL(payload)
If Err.Number <> 0 Then decodedPayload = payload
On Error GoTo 0

' =========================================================
' [처리부] 프로토콜별 동작
' =========================================================
Select Case protocol
    Case "plexstream"
        parts = Split(decodedPayload, "|")
        videoUrl = Trim(parts(0))
        
        If UBound(parts) >= 1 Then subUrl = Trim(parts(1)) Else subUrl = ""
        If UBound(parts) >= 2 Then fileName = Trim(parts(2)) Else fileName = "Plex_Stream_Video.mp4"

        ' URL에서 동기화에 필요한 정보(토큰, 키, 서버주소) 추출
        Dim re, matches, plexToken, ratingKey, serverUrl
        Set re = New RegExp : re.Global = True : re.IgnoreCase = True
        
        re.Pattern = "X-Plex-Token=([^&]+)"
        Set matches = re.Execute(videoUrl)
        If matches.Count > 0 Then plexToken = matches(0).SubMatches(0)
        
        re.Pattern = "ratingKey=([^&]+)"
        Set matches = re.Execute(videoUrl)
        If matches.Count > 0 Then ratingKey = matches(0).SubMatches(0)
        
        re.Pattern = "(https?://[^/]+)"
        Set matches = re.Execute(videoUrl)
        If matches.Count > 0 Then serverUrl = matches(0).SubMatches(0)

        ' 이어보기를 위한 메타데이터 조회
        Dim offset, duration, http
        offset = 0 : duration = 0
        If ratingKey <> "" And plexToken <> "" And serverUrl <> "" Then
            Set http = CreateObject("WinHttp.WinHttpRequest.5.1")
            http.SetTimeouts 5000, 5000, 5000, 5000
            On Error Resume Next
            http.Open "GET", serverUrl & "/library/metadata/" & ratingKey & "?X-Plex-Token=" & plexToken, False
            http.Option(4) = 13056
            http.Send
            If http.Status = 200 Then
                Dim xmlDoc, node
                Set xmlDoc = CreateObject("MSXML2.DOMDocument")
                xmlDoc.async = False
                xmlDoc.loadXML http.ResponseText
                Set node = xmlDoc.selectSingleNode("//Video/@viewOffset")
                If Not node Is Nothing Then offset = CLng(node.text)
                Set node = xmlDoc.selectSingleNode("//Video/@duration")
                If Not node Is Nothing Then duration = CLng(node.text)
            End If
            On Error GoTo 0
        End If

        ' 안전한 파일명 생성
        re.Pattern = "[\\/:*?""<>|]"
        Dim safeName, dotPos, baseName
        safeName = re.Replace(fileName, "_")
        dotPos = InStrRev(safeName, ".")
        If dotPos > 1 Then baseName = Left(safeName, dotPos - 1) Else baseName = safeName

        ' 자막 다운로드
        Dim tempPath, subLocalPath
        tempPath = fso.GetSpecialFolder(2).Path
        subLocalPath = ""
        If subUrl <> "" Then
            Dim ext : ext = "srt"
            If InStr(LCase(subUrl), ".ass") > 0 Then ext = "ass"
            If InStr(LCase(subUrl), ".smi") > 0 Then ext = "smi"
            If InStr(LCase(subUrl), ".vtt") > 0 Then ext = "vtt"
            subLocalPath = tempPath & "\" & baseName & ".ko." & ext
            
            Dim httpSub, streamDown
            On Error Resume Next
            Set httpSub = CreateObject("WinHttp.WinHttpRequest.5.1")
            httpSub.Open "GET", subUrl, False
            httpSub.Option(4) = 13056
            httpSub.Send
            If httpSub.Status = 200 Then
                Set streamDown = CreateObject("ADODB.Stream")
                streamDown.Open : streamDown.Type = 1
                streamDown.Write httpSub.ResponseBody
                streamDown.Position = 0
                streamDown.SaveToFile subLocalPath, 2
                streamDown.Close
            Else
                subLocalPath = ""
            End If
            On Error GoTo 0
        End If

        If fso.FileExists(potPath) Then
            Dim cmdArgs
            cmdArgs = """" & videoUrl & """"
            If subLocalPath <> "" Then
                If fso.FileExists(subLocalPath) Then cmdArgs = cmdArgs & " /sub=""" & subLocalPath & """"
            End If

            ' 이어보기 팝업 처리
            If offset > 0 Then
                Dim psMsgScript, msgResult, timeStr
                timeStr = FormatTime(offset)
                psMsgScript = "$q=[char]34; $code='using System; using System.Windows.Forms; using System.Runtime.InteropServices; public class Owner : IWin32Window { [DllImport('+$q+'user32.dll'+$q+')] public static extern IntPtr GetForegroundWindow(); public IntPtr Handle { get { return GetForegroundWindow(); } } }'; Add-Type -AssemblyName System.Windows.Forms; try { Add-Type -TypeDefinition $code -ReferencedAssemblies System.Windows.Forms } catch { exit 1 }; $msg = 'Plex 이어보기 하시겠습니까?' + [Environment]::NewLine + '저장된 시점: " & timeStr & "'; $res = [System.Windows.Forms.MessageBox]::Show((New-Object Owner), $msg, 'Plex Resume', 4, 32); if ($res -eq 'Yes') { exit 6 } else { exit 7 }"
                msgResult = WshShell.Run("powershell -NoProfile -WindowStyle Hidden -Command """ & psMsgScript & """", 0, True)
                If msgResult = 6 Then cmdArgs = cmdArgs & " /seek=" & timeStr
            End If

            ' 동기화 필요 여부 판단 (ratingKey가 있으면 모니터링 실행)
            If ratingKey <> "" And plexToken <> "" And serverUrl <> "" Then
                Dim objWMIService, objProcess, objStartup, objConfig, intProcessID, errReturn
                Set objWMIService = GetObject("winmgmts:\\.\root\cimv2")
                Set objStartup = objWMIService.Get("Win32_ProcessStartup")
                Set objConfig = objStartup.SpawnInstance_
                objConfig.ShowWindow = 1 ' SW_SHOWNORMAL
                Set objProcess = objWMIService.Get("Win32_Process")
                
                ' 팟플레이어 실행 및 PID 확보
                errReturn = objProcess.Create("""" & potPath & """ " & cmdArgs, Null, objConfig, intProcessID)
                
                If errReturn = 0 And intProcessID > 0 Then
                    Dim tmpMonitorFile, psPid, psCmdLine, objConfigPS, psProcess, psRes
                    tmpMonitorFile = tempPath & "\plex_monitor_" & fso.GetTempName()
                    
                    ' 백그라운드 PowerShell 센서 (2초마다 시간 파일 작성)
                    Dim psMonitor
                    psMonitor = "$q=[char]34; $ProgressPreference='SilentlyContinue';"
                    psMonitor = psMonitor & "$code='using System; using System.Runtime.InteropServices; public class W { [DllImport('+$q+'user32.dll'+$q+')] public static extern IntPtr SendMessage(IntPtr h, int m, IntPtr w, IntPtr l); [DllImport('+$q+'user32.dll'+$q+')] public static extern IntPtr FindWindow(string c, string t); }';"
                    psMonitor = psMonitor & "try { Add-Type -TypeDefinition $code } catch {};"
                    psMonitor = psMonitor & "$p=Get-Process -Id " & intProcessID & " -ErrorAction SilentlyContinue; if(!$p){exit};"
                    psMonitor = psMonitor & "while(($p.MainWindowHandle -eq 0) -and (!$p.HasExited)){Start-Sleep -Milliseconds 200; $p.Refresh()};"
                    psMonitor = psMonitor & "$h=$p.MainWindowHandle; if($h -eq 0){$h=[W]::FindWindow('PotPlayer64', $null)}; if($h -eq 0){$h=[W]::FindWindow('PotPlayer', $null)};"
                    psMonitor = psMonitor & "while(!$p.HasExited){"
                    psMonitor = psMonitor & " $t=[W]::SendMessage($h, 0x0400, [IntPtr]0x5004, [IntPtr]0).ToInt64();"
                    psMonitor = psMonitor & " [System.IO.File]::WriteAllText('" & tmpMonitorFile & "', $t.ToString());"
                    psMonitor = psMonitor & " Start-Sleep -Milliseconds 2000;"
                    psMonitor = psMonitor & "}"
                    
                    Set objConfigPS = objStartup.SpawnInstance_
                    objConfigPS.ShowWindow = 0 ' SW_HIDE
                    Set psProcess = objWMIService.Get("Win32_Process")
                    psCmdLine = "powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command """ & psMonitor & """"
                    psRes = psProcess.Create(psCmdLine, Null, objConfigPS, psPid)
                    
                    Dim lastTime, playState, lastReportTime, colItems, fDec, line, curTime, oldState
                    lastTime = -1 : playState = "stopped" : lastReportTime = Now
                    
                    ' 상태 보고 메인 루프
                    Do
                        WScript.Sleep 2000
                        Set colItems = objWMIService.ExecQuery("Select * From Win32_Process Where ProcessId = " & psPid)
                        If colItems.Count = 0 Then Exit Do ' 센서 종료 시 탈출
                        
                        On Error Resume Next
                        If fso.FileExists(tmpMonitorFile) Then
                            Set fDec = fso.OpenTextFile(tmpMonitorFile, 1)
                            If Not fDec.AtEndOfStream Then
                                line = fDec.ReadAll()
                                If IsNumeric(line) Then
                                    curTime = CLng(line)
                                    oldState = playState
                                    
                                    If curTime > 0 Then
                                        If curTime = lastTime Then playState = "paused" Else playState = "playing"
                                        lastTime = curTime
                                    Else
                                        playState = "stopped"
                                        lastTime = 0
                                    End If
                                    
                                    ' 상태 변경 또는 10초 경과 시 Plex에 타임라인 전송
                                    If (playState <> oldState) Or (DateDiff("s", lastReportTime, Now) >= 10) Then
                                        SendPlexTimeline http, serverUrl, ratingKey, playState, curTime, duration, plexToken
                                        lastReportTime = Now
                                    End If
                                    
                                    ' 재생 중 정지되면 탈출
                                    If playState = "stopped" And oldState <> "stopped" Then Exit Do
                                End If
                            End If
                            fDec.Close
                        End If
                        On Error GoTo 0
                    Loop
                    
                    ' 종료 시 서버에 정지 신호 전송
                    SendPlexTimeline http, serverUrl, ratingKey, "stopped", curTime, duration, plexToken
                    
                    ' 센서 프로세스 및 임시 파일 정리
                    On Error Resume Next
                    Set colItems = objWMIService.ExecQuery("Select * From Win32_Process Where ProcessId = " & psPid)
                    Dim objItem : For Each objItem In colItems : objItem.Terminate() : Next
                    If fso.FileExists(tmpMonitorFile) Then fso.DeleteFile tmpMonitorFile
                    On Error GoTo 0
                End If
            Else
                ' ratingKey가 없을 경우 단순 스트림 실행 (동기화 없음)
                WshShell.Run """" & potPath & """ " & cmdArgs, 1, False
            End If
        Else
            MsgBox "팟플레이어를 찾을 수 없습니다." & vbCrLf & potPath, 16, "Plex Helper Error"
        End If

    Case "plexplay"
        decodedPayload = Replace(decodedPayload, "/", "\")
        If fso.FileExists(decodedPayload) Then
            WshShell.Run """" & decodedPayload & """", 1, False
        Else
            MsgBox "파일을 찾을 수 없습니다." & vbCrLf & decodedPayload, 16, "Plex Helper Error"
        End If

    Case "plexfolder"
        decodedPayload = Replace(decodedPayload, "/", "\")
        If fso.FolderExists(decodedPayload) Then
            WshShell.Run "explorer.exe """ & decodedPayload & """", 1, False
        ElseIf fso.FileExists(decodedPayload) Then
            WshShell.Run "explorer.exe /select,""" & decodedPayload & """", 1, False
        Else
            MsgBox "경로를 찾을 수 없습니다." & vbCrLf & decodedPayload, 16, "Plex Helper Error"
        End If

End Select

' =========================================================
' [보조 함수]
' =========================================================
Function FormatTime(ms)
    Dim sec, min, hr
    sec = Int(ms / 1000)
    hr = Int(sec / 3600)
    sec = sec Mod 3600
    min = Int(sec / 60)
    sec = sec Mod 60
    FormatTime = Right("0" & hr, 2) & ":" & Right("0" & min, 2) & ":" & Right("0" & sec, 2)
End Function

Sub SendPlexTimeline(httpObj, srv, rKey, state, timeMs, dur, tok)
    Dim url
    url = srv & "/:/timeline?ratingKey=" & rKey & _
          "&key=%2Flibrary%2Fmetadata%2F" & rKey & _
          "&state=" & state & _
          "&time=" & timeMs & _
          "&duration=" & dur & _
          "&X-Plex-Token=" & tok & _
          "&X-Plex-Client-Identifier=PotPlayer" & _
          "&X-Plex-Product=PotPlayer" & _
          "&X-Plex-Version=2.0" & _
          "&X-Plex-Platform=Windows" & _
          "&X-Plex-Device=PC"
          
    On Error Resume Next
    httpObj.Open "GET", url, False
    httpObj.Option(4) = 13056
    httpObj.Send
    On Error GoTo 0
End Sub
