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
    # [스트리밍] 파이프(|)로 파라미터 분리 및 앞뒤 공백(Trim) 제거
    VID_URL=$(echo "$DECODED_DATA" | awk -F'|' '{print $1}' | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')
    SUB_URL=$(echo "$DECODED_DATA" | awk -F'|' '{print $2}' | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')
    FILE_NAME=$(echo "$DECODED_DATA" | awk -F'|' '{print $3}' | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')

    if [ -z "$FILE_NAME" ]; then
        FILE_NAME="Plex_Stream_Video.mp4"
    fi

    # 1. URL에서 동기화에 필요한 정보(토큰, 키, 서버주소) 추출
    TOKEN=$(echo "$VID_URL" | grep -oP 'X-Plex-Token=\K[^&]*')
    RATING_KEY=$(echo "$VID_URL" | grep -oP 'ratingKey=\K[^&]*')
    SERVER_URL=$(echo "$VID_URL" | grep -oP '^https?://[^/]+')

    # 2. 이어보기를 위한 메타데이터 조회
    OFFSET_MS=0
    DURATION_MS=0
    if [ -n "$TOKEN" ] && [ -n "$RATING_KEY" ]; then
        META_XML=$(curl -sLk "$SERVER_URL/library/metadata/$RATING_KEY?X-Plex-Token=$TOKEN")
        OFFSET_MS=$(echo "$META_XML" | grep -oP 'viewOffset="\K\d+' | head -1)
        DURATION_MS=$(echo "$META_XML" | grep -oP 'duration="\K\d+' | head -1)
    fi

    # 3. 이어보기 팝업 (zenity 활용)
    START_ARG=""
    if [ -n "$OFFSET_MS" ] && [ "$OFFSET_MS" -gt 0 ]; then
        OFFSET_SEC=$((OFFSET_MS / 1000))
        H=$((OFFSET_SEC / 3600))
        M=$(((OFFSET_SEC % 3600) / 60))
        S=$((OFFSET_SEC % 60))
        TIME_STR=$(printf "%02d:%02d:%02d" $H $M $S)

        # GUI 팝업창 띄우기
        if command -v zenity &> /dev/null; then
            if zenity --question --text="Plex 이어보기 하시겠습니까?\n\n저장된 시점: $TIME_STR" --title="Plex Resume" --width=300; then
                START_ARG="--start=$OFFSET_SEC"
            fi
        fi
    fi

    # 4. 자막 처리 (로컬 다운로드)
    SUB_ARG=""
    TEMP_SUB=""
    if [ -n "$SUB_URL" ]; then
        EXT="srt"
        if echo "$SUB_URL" | grep -qi "\.ass"; then EXT="ass"; fi
        if echo "$SUB_URL" | grep -qi "\.smi"; then EXT="smi"; fi
        if echo "$SUB_URL" | grep -qi "\.vtt"; then EXT="vtt"; fi

        BASE_NAME="${FILE_NAME%.*}"
        TEMP_SUB="/tmp/${BASE_NAME}.ko.${EXT}"

        curl -sL "$SUB_URL" -o "$TEMP_SUB"
        
        # 다운로드가 정상적으로 완료되었을 때만 인자 추가
        if [ -f "$TEMP_SUB" ]; then
            SUB_ARG="--sub-file=$TEMP_SUB"
        fi
    fi

    # 5. IPC 통신 소켓 준비
    IPC_SOCKET="/tmp/plex_mpv_ipc_$$"
    rm -f "$IPC_SOCKET"

    HAS_SOCAT=false
    if command -v socat &> /dev/null; then HAS_SOCAT=true; fi

    # 6. MPV 실행 및 모니터링 (동기화 로직)
    if [ "$HAS_SOCAT" = true ] && [ -n "$TOKEN" ] && [ -n "$RATING_KEY" ]; then
        # mpv를 직접 실행하여 창을 띄우고 IPC 통신을 시작
        mpv --force-window=immediate --title="$FILE_NAME" $START_ARG $SUB_ARG --input-ipc-server="$IPC_SOCKET" "$VID_URL" &
        PLAYER_PID=$!

        # 소켓 파일이 생성될 때까지 잠시 대기
        for i in {1..10}; do
            if [ -S "$IPC_SOCKET" ]; then break; fi
            sleep 0.5
        done

        LAST_REPORT_TIME=$(date +%s)
        LAST_STATE="stopped"
        LAST_TIME_MS=0

        # 타임라인 전송 함수
        send_timeline() {
            local STATE=$1
            local TIME=$2
            curl -sLk "$SERVER_URL/:/timeline?ratingKey=$RATING_KEY&key=%2Flibrary%2Fmetadata%2F$RATING_KEY&state=$STATE&time=$TIME&duration=$DURATION_MS&X-Plex-Token=$TOKEN&X-Plex-Client-Identifier=MPV-Linux&X-Plex-Product=MPV&X-Plex-Version=1.0&X-Plex-Platform=Linux&X-Plex-Device=PC" >/dev/null
        }

        # 모니터링 루프 (mpv 프로세스가 살아있는 동안)
        while kill -0 $PLAYER_PID 2>/dev/null; do
            sleep 2
            
            # socat으로 현재 재생 위치(초 단위, 소수점) 가져오기
            RAW_TIME=$(echo '{ "command": ["get_property", "time-pos"] }' | socat - "$IPC_SOCKET" 2>/dev/null)
            TIME_SEC=$(echo "$RAW_TIME" | grep -oP '"data":\K[0-9.]+')
            
            if [ -n "$TIME_SEC" ]; then
                # 소수점 초를 정수형 밀리초(MS)로 변환
                CUR_TIME_MS=$(awk "BEGIN {print int($TIME_SEC * 1000)}")
                
                # 일시정지 상태 확인
                RAW_PAUSE=$(echo '{ "command":["get_property", "pause"] }' | socat - "$IPC_SOCKET" 2>/dev/null)
                IS_PAUSED=$(echo "$RAW_PAUSE" | grep -oP '"data":\K(true|false)')

                if [ "$IS_PAUSED" = "true" ]; then
                    CUR_STATE="paused"
                else
                    CUR_STATE="playing"
                fi

                NOW=$(date +%s)
                DIFF=$((NOW - LAST_REPORT_TIME))

                # 상태가 변했거나 10초가 경과했을 때 Plex로 진행상황 보고
                if [ "$CUR_STATE" != "$LAST_STATE" ] || [ "$DIFF" -ge 10 ]; then
                    send_timeline "$CUR_STATE" "$CUR_TIME_MS"
                    LAST_REPORT_TIME=$NOW
                    LAST_STATE="$CUR_STATE"
                fi
                LAST_TIME_MS=$CUR_TIME_MS
            fi
        done

        # 재생기(mpv) 종료 시 서버에 정지 신호 전송
        send_timeline "stopped" "$LAST_TIME_MS"
        
        # 임시 파일 정리
        rm -f "$IPC_SOCKET"
        if [ -n "$TEMP_SUB" ]; then rm -f "$TEMP_SUB"; fi

    else
        # [Fallback] socat이 없거나 동기화 정보가 없으면 smplayer로 단순 재생
        PLAYLIST="/tmp/plex_stream_$$.m3u"
        echo "#EXTM3U" > "$PLAYLIST"
        echo "#EXTINF:-1,$FILE_NAME" >> "$PLAYLIST"
        echo "$VID_URL" >> "$PLAYLIST"
        
        if [ -n "$TEMP_SUB" ]; then
            smplayer "$PLAYLIST" -sub "$TEMP_SUB"
        else
            smplayer "$PLAYLIST"
        fi
        
        if [ -n "$TEMP_SUB" ]; then rm -f "$TEMP_SUB"; fi
        rm -f "$PLAYLIST"
    fi
fi
