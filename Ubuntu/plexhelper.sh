#!/bin/bash

# URL 인자 받기
URL="$1"
PROTOCOL=$(echo "$URL" | cut -d':' -f1)
RAW_DATA=$(echo "$URL" | cut -d':' -f2- | sed 's/^\/\///')

# URL 디코딩 (Python3 이용)
DECODED_DATA=$(python3 -c "import urllib.parse, sys; print(urllib.parse.unquote(sys.argv[1]))" "$RAW_DATA")

if [ "$PROTOCOL" = "plexplay" ]; then
    # [로컬 재생] 기본 앱 실행
    xdg-open "$DECODED_DATA"

elif [ "$PROTOCOL" = "plexfolder" ]; then
    # [폴더 열기] 해당 경로의 폴더 열기
    if [ -d "$DECODED_DATA" ]; then
        xdg-open "$DECODED_DATA"
    else
        DIR=$(dirname "$DECODED_DATA")
        xdg-open "$DIR"
    fi

elif [ "$PROTOCOL" = "plexstream" ]; then
    # [스트리밍] | 로 분리
    VID_URL=$(echo "$DECODED_DATA" | cut -d'|' -f1)
    SUB_URL=$(echo "$DECODED_DATA" | cut -d'|' -f2)

    # MPV 실행 (자막 있으면 포함)
    # if [ -n "$SUB_URL" ]; then
    #     mpv "$VID_URL" --sub-file="$SUB_URL"
    # else
    #     mpv "$VID_URL"
    # fi

    # SMPlayer 실행
if [ -n "$SUB_URL" ] && [ "$SUB_URL" != "$VID_URL" ]; then
        # 1. 확장자 추출
        EXT="${SUB_URL##*.}"
        # 확장자가 없거나 이상할 경우 기본값 srt
        if [ -z "$EXT" ] || [ ${#EXT} -gt 4 ]; then EXT="srt"; fi

        # 2. 임시 파일명에 .ko(한국어 코드) 삽입
        TEMP_SUB="/tmp/plex_stream_sub.ko.$EXT"

        # 3. 자막 다운로드
        curl -sL "$SUB_URL" -o "$TEMP_SUB"

        # 4. SMPlayer 실행
        smplayer "$VID_URL" -sub "$TEMP_SUB"
    else
        smplayer "$VID_URL"
    fi
fi
