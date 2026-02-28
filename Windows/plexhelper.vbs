' plexhelper.vbs - Windows용 Plex Helper 스크립트 (다이렉트 스트림, 자막 우선)
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

' 2. URL 디코딩
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

        Dim re, safeName
        Set re = New RegExp
        re.Global = True
        re.Pattern = "[\\/:*?""<>|]"
        safeName = re.Replace(fileName, "_")

        Dim dotPos, baseName
        dotPos = InStrRev(safeName, ".")
        If dotPos > 1 Then
            baseName = Left(safeName, dotPos - 1)
        Else
            baseName = safeName
        End If

        Dim tempPath, subLocalPath
        tempPath = fso.GetSpecialFolder(2).Path
        
        subLocalPath = ""
        If subUrl <> "" Then
            Dim ext
            ext = "srt"
            If InStr(LCase(subUrl), ".ass") > 0 Then ext = "ass"
            If InStr(LCase(subUrl), ".smi") > 0 Then ext = "smi"
            If InStr(LCase(subUrl), ".vtt") > 0 Then ext = "vtt"
            
            subLocalPath = tempPath & "\" & baseName & ".ko." & ext
            
            Dim http, streamDown
            On Error Resume Next
            Set http = CreateObject("WinHttp.WinHttpRequest.5.1")
            http.Open "GET", subUrl, False
            http.Option(4) = 13056
            http.Send

            If http.Status = 200 Then
                Set streamDown = CreateObject("ADODB.Stream")
                streamDown.Open
                streamDown.Type = 1 ' Binary
                streamDown.Write http.ResponseBody
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
                If fso.FileExists(subLocalPath) Then
                    cmdArgs = cmdArgs & " /sub=""" & subLocalPath & """"
                End If
            End If
            
            WshShell.Run """" & potPath & """ " & cmdArgs, 1, False
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
