@echo off
setlocal

:: 입력된 URL (예: plexplay://C:%%5CUsers%%5C...)을 받습니다.
set "URL=%~1"

:: URL에서 프로토콜 스킴(plexplay 또는 plexfolder)을 추출합니다.
for /f "tokens=1 delims=:" %%p in ("%URL%") do set "PROTOCOL=%%p"

:: "프로토콜://" 부분을 제거하여 인코딩된 경로만 남깁니다.
set "ENCODED_PATH=%URL:*://=%"

:: PowerShell을 사용하여 URL 디코딩을 수행합니다.
for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "[System.Net.WebUtility]::UrlDecode('%ENCODED_PATH%')"`) do set "DECODED_PATH=%%i"

:: 프로토콜에 따라 분기 처리합니다.
if /i "%PROTOCOL%"=="plexplay" (
    :: 파일인지 확인하고 실행합니다.
    if exist "%DECODED_PATH%" (
        echo Opening file: %DECODED_PATH%
        start "" "%DECODED_PATH%"
    ) else (
        echo File not found: %DECODED_PATH%
        mshta "javascript:alert('파일을 찾을 수 없습니다:\n%DECODED_PATH%');close();"
    )
) else if /i "%PROTOCOL%"=="plexfolder" (
    :: 폴더인지 확인하고 실행합니다.
    if exist "%DECODED_PATH%\" (
        echo Opening folder: %DECODED_PATH%
        start "" "%DECODED_PATH%"
    ) else (
        echo Folder not found: %DECODED_PATH%
        mshta "javascript:alert('폴더를 찾을 수 없습니다:\n%DECODED_PATH%');close();"
    )
) else (
    echo Unknown URL scheme: %PROTOCOL%
    mshta "javascript:alert('알 수 없는 URL 스킴입니다:\n%URL%');close();"
)

endlocal
