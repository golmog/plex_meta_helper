#!/bin/bash

url="$1"

# URL 디코딩 함수
urldecode() {
    python3 -c "import sys, urllib.parse; print(urllib.parse.unquote(sys.argv[1]))" "$1"
}

if [[ "$url" == plexplay://* ]]; then
    file_path="${url#plexplay://}"
    decoded_path=$(urldecode "$file_path")

    if [ -f "$decoded_path" ]; then
        xdg-open "$decoded_path"
    else
        zenity --error --text="파일을 찾을 수 없습니다:\n$decoded_path"
    fi

elif [[ "$url" == plexfolder://* ]]; then
    folder_path="${url#plexfolder://}"
    decoded_path=$(urldecode "$folder_path")

    if [ -d "$decoded_path" ]; then
        xdg-open "$decoded_path"
    else
        zenity --error --text="폴더를 찾을 수 없습니다:\n$decoded_path"
    fi

else
    zenity --error --text="알 수 없는 URL 스킴입니다:\n$url"
fi
