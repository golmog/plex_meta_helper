' plexhelper.vbs - Windows용 Plex Helper 하이브리드 스크립트 (PMH v0.8+ 호환)
Option Explicit
Dim WshShell, fso, strArg, potPath, mpvPath

Set fso = CreateObject("Scripting.FileSystemObject")
Set WshShell = CreateObject("WScript.Shell")

' =========================================================
' [설정 1] 로컬 재생용 플레이어 (팟플레이어)
potPath = "C:\Program Files\DAUM\PotPlayer\PotPlayerMini64.exe"
If Not fso.FileExists(potPath) Then 
    potPath = "C:\Program Files\DAUM\PotPlayer\PotPlayer64.exe"
End If
If Not fso.FileExists(potPath) Then 
    potPath = "C:\Program Files (x86)\DAUM\PotPlayer\PotPlayerMini.exe"
End If

' [설정 2] 스트리밍용 플레이어 (mpv.net)
mpvPath = "C:\Program Files\mpv.net\mpvnet.exe"
' =========================================================

If WScript.Arguments.Count = 0 Then WScript.Quit
strArg = WScript.Arguments(0)

' 1. 프로토콜 및 페이로드 분리
Dim delimPos, protocol, payload, decodedPayload
delimPos = InStr(strArg, "://")
If delimPos > 0 Then
    protocol = LCase(Left(strArg, delimPos - 1))
    payload = Mid(strArg, delimPos + 3)
Else
    WScript.Quit
End If

' 2. URL 디코딩 함수 (VBScript 안전 처리)
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

' 3. 후행 슬래시 제거 함수
Function RemoveTrailingSlash(strPath)
    Dim tempPath
    tempPath = Trim(strPath)
    Do While (Right(tempPath, 1) = "/") Or (Right(tempPath, 1) = "\")
        tempPath = Left(tempPath, Len(tempPath) - 1)
    Loop
    RemoveTrailingSlash = tempPath
End Function

If protocol <> "plexstream" Then
    decodedPayload = Replace(decodedPayload, "/", "\")
    decodedPayload = RemoveTrailingSlash(decodedPayload)
End If

' =========================================================
' [처리부] 프로토콜별 동작
' =========================================================
Select Case protocol
    
    Case "plexfolder"
        If fso.FileExists(decodedPayload) Then
            WshShell.Run "explorer.exe /select,""" & decodedPayload & """", 1, False
        ElseIf fso.FolderExists(decodedPayload) Then
            WshShell.Run "explorer.exe """ & decodedPayload & """", 1, False
        Else
            Dim targetPath, parentFound
            targetPath = decodedPayload
            parentFound = False
            
            Do While Len(targetPath) > 3
                targetPath = fso.GetParentFolderName(targetPath)
                If targetPath = "" Then Exit Do
                
                If fso.FolderExists(targetPath) Then
                    WshShell.Run "explorer.exe """ & targetPath & """", 1, False
                    parentFound = True
                    Exit Do
                End If
            Loop
            
            If Not parentFound Then
                MsgBox "경로를 찾을 수 없습니다 (상위 폴더도 모두 삭제됨)." & vbCrLf & decodedPayload, 16, "Plex Helper Error"
            End If
        End If

    Case "plexplay"
        If fso.FileExists(decodedPayload) Then
            If fso.FileExists(potPath) Then
                WshShell.Run """" & potPath & """ """ & decodedPayload & """", 1, False
            Else
                MsgBox "팟플레이어를 찾을 수 없습니다." & vbCrLf & potPath, 16, "Plex Helper Error"
            End If
        Else
            MsgBox "파일을 찾을 수 없습니다." & vbCrLf & decodedPayload, 16, "Plex Helper Error"
        End If

    Case "plexstream"
        ' ? [스트리밍] mpv.net으로 실행 (Lua 스크립트에 동기화 위임)
        If Not fso.FileExists(mpvPath) Then
            MsgBox "네트워크 스트리밍을 재생하려면 mpv.net이 필요합니다." & vbCrLf & mpvPath, 16, "Plex Helper Error"
            WScript.Quit
        End If

        Dim parts, videoUrl, fileName
        parts = Split(decodedPayload, "|")
        videoUrl = Trim(parts(0))
        
        If UBound(parts) >= 2 Then fileName = Trim(parts(2)) Else fileName = "Plex_Stream_Video.mp4"

        ' Lua 스크립트가 파일명을 인식하도록 URL 쿼리 파라미터 조립
        Dim htmlEnc, encodedFileName, finalUrl, joiner
        Set htmlEnc = CreateObject("htmlfile")
        htmlEnc.parentWindow.execScript "function encode(s){return encodeURIComponent(s);}", "jscript"
        encodedFileName = htmlEnc.parentWindow.encode(fileName)
        
        If InStr(videoUrl, "?") > 0 Then joiner = "&" Else joiner = "?"
        finalUrl = videoUrl & joiner & "iina_filename=" & encodedFileName
        
        Dim cmdArgs
        cmdArgs = """" & finalUrl & """"
        
        ' mpv.net 스트리밍 최적화 및 보안 무시 옵션 추가
        cmdArgs = cmdArgs & " --tls-verify=no"
        cmdArgs = cmdArgs & " --ytdl=no"
        cmdArgs = cmdArgs & " --sub-auto=no"
        cmdArgs = cmdArgs & " --audio-file-auto=no"
        cmdArgs = cmdArgs & " --cache=yes"
        cmdArgs = cmdArgs & " --demuxer-max-bytes=100M"
        cmdArgs = cmdArgs & " --demuxer-max-back-bytes=50M"
        cmdArgs = cmdArgs & " --hr-seek=yes"
        cmdArgs = cmdArgs & " --vd-lavc-fast=yes"
        cmdArgs = cmdArgs & " --force-window=immediate"
        cmdArgs = cmdArgs & " --title=""" & fileName & """"

        WshShell.Run """" & mpvPath & """ " & cmdArgs, 1, False

End Select
