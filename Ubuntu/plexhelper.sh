#!/bin/bash

# URL 인자 받기
URL="$1"
PROTOCOL=$(echo "$URL" | cut -d':' -f1)
RAW_DATA=$(echo "$URL" | cut -d':' -f2- | sed 's/^\/\///')

# URL 디코딩 (Python3 이용 - PMH v0.8 %7C 특수문자 완벽 처리)
DECODED_DATA=$(python3 -c "import urllib.parse, sys; print(urllib.parse.unquote(sys.argv[1]))" "$RAW_DATA")

if [ "$PROTOCOL" = "plexplay" ]; then
    # [로컬 재생]
    if [ -f "$DECODED_DATA" ]; then
        xdg-open "$DECODED_DATA"
    else
        if command -v zenity &> /dev/null; then
            zenity --error --text="파일을 찾을 수 없습니다.\n\n$DECODED_DATA" --title="Plex Helper Error"
        fi
    fi

elif [ "$PROTOCOL" = "plexfolder" ]; then
    # [폴더 열기] 삭제/이름 변경 대비 상위 폴더 안전 추적
    TARGET_PATH="$DECODED_DATA"
    
    while [ ! -e "$TARGET_PATH" ] && [ "$TARGET_PATH" != "/" ]; do
        TARGET_PATH=$(dirname "$TARGET_PATH")
    done

    if [ -f "$TARGET_PATH" ]; then
        # 최종 대상이 '파일'인 경우: Nautilus의 파일 선택(-s) 기능 우선 시도
        if command -v nautilus &> /dev/null; then
            nautilus -s "$TARGET_PATH"
        else
            xdg-open "$(dirname "$TARGET_PATH")"
        fi
    elif [ -d "$TARGET_PATH" ]; then
        xdg-open "$TARGET_PATH"
    else
        if command -v zenity &> /dev/null; then
            zenity --error --text="경로를 찾을 수 없습니다.\n\n$DECODED_DATA" --title="Plex Helper Error"
        fi
    fi

elif [ "$PROTOCOL" = "plexstream" ]; then
    # [스트리밍] 파이프(|)로 파라미터 분리
    PARSED=$(python3 -c "import sys; parts = [p.strip() for p in sys.argv[1].split('|')]; print('\n'.join(parts))" "$DECODED_DATA")
    
    VID_URL=$(echo "$PARSED" | sed -n '1p')
    FILE_NAME=$(echo "$PARSED" | sed -n '3p')

    if [ -z "$FILE_NAME" ]; then
        FILE_NAME="Plex_Stream_Video.mp4"
    fi

    # 파일명을 URL Query 형식으로 인코딩하여 Lua 스크립트가 파싱할 수 있도록 주입
    ENCODED_FILENAME=$(python3 -c "import urllib.parse, sys; print(urllib.parse.quote(sys.argv[1]))" "$FILE_NAME")
    
    # URL에 ? 가 이미 있는지 확인 후 & 또는 ? 로 파일명 파라미터 결합
    if [[ "$VID_URL" == *"?"* ]]; then
        FINAL_URL="${VID_URL}&iina_filename=${ENCODED_FILENAME}"
    else
        FINAL_URL="${VID_URL}?iina_filename=${ENCODED_FILENAME}"
    fi

    if command -v mpv &> /dev/null; then
        mpv --force-window=immediate \
            --title="$FILE_NAME" \
            --tls-verify=no \
            --user-agent="Mozilla/5.0" \
            --ytdl=no \
            --sub-auto=no \
            --audio-file-auto=no \
            "$FINAL_URL" &
    else
        if command -v zenity &> /dev/null; then
            zenity --error --text="mpv 플레이어가 설치되어 있지 않습니다.\n터미널에서 'sudo apt install mpv'를 실행해주세요." --title="Plex Helper Error"
        fi
    fi
fi
