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
    # [스트리밍] 파이프(|)로 파라미터 분리 (URL | SUB_URL | FILE_NAME)
    VID_URL=$(echo "$DECODED_DATA" | awk -F'|' '{print $1}')
    SUB_URL=$(echo "$DECODED_DATA" | awk -F'|' '{print $2}')
    FILE_NAME=$(echo "$DECODED_DATA" | awk -F'|' '{print $3}')

    if [ -z "$FILE_NAME" ]; then
        FILE_NAME="Plex_Stream_Video.mp4"
    fi

    # 1. M3U 플레이리스트 생성 (플레이어에 파일명을 띄워주기 위함)
    PLAYLIST="/tmp/plex_stream.m3u"
    echo "#EXTM3U" > "$PLAYLIST"
    echo "#EXTINF:-1,$FILE_NAME" >> "$PLAYLIST"
    echo "$VID_URL" >> "$PLAYLIST"

    # 2. 자막 처리 (자막이 있을 경우 로컬 다운로드)
    if [ -n "$SUB_URL" ]; then
        EXT="srt"
        if echo "$SUB_URL" | grep -qi "\.ass"; then EXT="ass"; fi
        if echo "$SUB_URL" | grep -qi "\.smi"; then EXT="smi"; fi

        # 동영상파일명.ko.srt 형태로 조립
        BASE_NAME="${FILE_NAME%.*}"
        TEMP_SUB="/tmp/${BASE_NAME}.ko.${EXT}"

        # 자막 다운로드
        curl -sL "$SUB_URL" -o "$TEMP_SUB"

        # 플레이어 실행 (smplayer 사용 예시, mpv 사용시 mpv "$PLAYLIST" --sub-file="$TEMP_SUB" 사용)
        smplayer "$PLAYLIST" -sub "$TEMP_SUB"
    else
        smplayer "$PLAYLIST"
    fi
fi
