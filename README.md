# Plex Meta Helper

Plex Web UI를 강화하는 Tampermonkey 유저스크립트입니다. Plex 컨텐츠의 상세 메타 정보를 표시하고, 캐시 관리, 외부 플레이어 연동 등 다양한 편의 기능을 제공합니다.

특히 `plex_mate`와의 연동을 통해 VFS 새로고침 및 라이브러리 스캔을 웹 UI에서 직접 실행할 수 있습니다.

## 업데이트

v0.7.57 (2026-03-22)
- 툴 실행중 업데이트 로직 안전성 개선
- 쇼 목록 에피소드 리매칭 로직 개선

v0.7.56 (2026-03-20)
- 업데이트 로직 개선
- Plex 메타데이터 매칭 로직 수정
- 목록 GUID Shift+클릭시 자동 리매칭 기능 추가
- 기타 개선, 버그 수정

v0.7.55 (2026-03-19)
- 캐시 시스템 로직 개선
- 툴 로직/UI 개선
- 음악 라이브러 지원
- 기타 로직 개선, 버그 수정

v0.7.54 (2026-03-18)
- 서버 업데이트 로직 개선
- 기타 로직 개선, 버그 수정

v0.7.53 (2026-03-17)
- 툴/서버 로직/UI 개선, 버그 수정

v0.7.51 (2026-03-16)
- 서버 설정에 `PLEX_SQLITE_BIN: "/usr/lib/plexmediaserver/Plex SQLite"`(기본값) 추가: PMS가 꺼져 있거나 Plex DB 쓰기 작업시 필수
- 기타 로직 개선

v0.7.50 (2026-03-15)
- 백엔드(서버)/프론트엔드(JS): 툴 관련 실행 구조 변경
- 구조 변경에 따른 번들 툴 업데이트

v0.7.49 (2026-03-15)
- 툴/서버: 스케줄러/디스코드 로직 개선, 버그 수정
- 업데이트 버그 수정

v0.7.46 (2026-03-14)
- 툴/서버: 주요 로직 변경으로 툴 전체 업데이트 필요
  - 자동실행 스케줄러 추가(crontab 방식)
  - 디스코드 알림 설정 항목 추가(개별 툴 환경 설정)
  - 향후 번들 툴(@golmog)을 헬퍼 업데이트시 같이 자동 업데이트(설치돼있는 경우)
  - 화면 감지/리프레시 타이머를 150ms -> 400ms로 조정(부하 감소 vs 리프레시 속도 늦춤 트레이드 오프)
  - 기타 로직 개선, 버그 수정
- 헬퍼 업데이트시 실행중인 툴 작업이 있는 경우 업데이트 차단

v0.7.45 (2026-03-13)
- 툴/서버: UI/UX 개선, 버그 수정

v0.7.44 (2026-03-12)
- 툴 개선
  - `환경 설정` 탭 추가
  - 툴 제작시 커스텀 옵션 설정 가능
  - 디스코드 알림(서버/툴별) 설정 추가: 업데이트/설정 후 서버 재시작 필요
  - 기타 기능/UI 개선

v0.7.43 (2026-03-12)
- 백엔드/프론트엔드 성능 최적화

v0.7.42 (2026-03-12)
- 툴/UI 로직 개선
- 기타 기능 개선, 버그 수정

v0.7.41 (2026-03-10)
- 툴: Task UI 조회/실행 옵션 분리. 기타 수정

v0.7.40 (2026-03-10)
- 사용자 툴(API) 도입: 사용자가 만든 스크립트를 툴에 설치해서 PMH 인터페이스에 통합할 수 있습니다.
  - API: UI / DB / Task(비동기 스레드 실행/상태/취소 등) / 로깅 등
  - tools에 레퍼런스 툴 3종(Type: datatable / dashboard / asyncTask) 확인
- 설정메뉴 접힘/펼침 기능 추가

v0.6.x 주요 업데이트
- Flask 서버 시스템 도입
- 목록에 태그(뱃지) 기능 추가


## 사전 요구사항

이 스크립트의 모든 기능을 사용하려면 다음이 필요합니다.

1.  **Tampermonkey**: 브라우저에 [Tampermonkey](https://www.tampermonkey.net/)와 같은 유저스크립트 매니저가 설치되어 있어야 합니다.
2.  '외부 플레이어 재생' 및 '폴더 열기' 기능을 사용하려면, `plexplay://`, `plexstream://`, `plexfolder://` 등의 주소 형식을 열 수 있도록 하는 작업이 필요합니다.(현재 문서 하단 `외부 재생/폴더 열기` 참고)


## 주요 기능

*   **추가 메타 정보 표시**:
    *   콘텐츠 상세 페이지에 GUID, 원본 파일 경로, 파일 크기, 재생 시간 등 추가 정보를 표시합니다.
    *   인트로/크레딧 건너뛰기 시간 정보를 표시합니다.
    *   목록 보기에서 각 항목에 GUID, 태그(포스터 뱃지) 등을 표시할 수 있습니다.
*   **Plex Mate 연동**:
    *   파일 경로를 클릭하여 `plex_mate`를 통해 VFS 새로고침 및 라이브러리 스캔을 요청할 수 있습니다.
    *   `YAML/TMDB 반영`: Plex 기본 에이전트 사용시 YAML 기준 메타데이터 반영작업을 자동화합니다.
*   **외부 플레이어 / 폴더 열기**:
    *   상세 페이지 및 목록 보기에서 아이콘(직접재생/스트리밍)을 클릭하여 로컬 PC에 설치된 외부 플레이어(예: 팟플레이어)로 영상을 재생하거나 해당 파일이 위치한 폴더를 열 수 있습니다. (설치 방법 참고)
*   **사용자 맞춤형 UI**:
    *   목록: GUID/태그/재생아이콘 표시 여부를 UI 상단 컨트롤 버튼으로 쉽게 켜고 끌 수 있습니다.


## 설치 방법

1.  [Tampermonkey](https://www.tampermonkey.net/) 설치: https://www.tampermonkey.net/ (베타버전 추천)
2.  이 스크립트의 **[설치 링크](https://raw.githubusercontent.com/golmog/plex_meta_helper/main/plex_meta_helper.user.js)**를 클릭하여 Tampermonkey에 설치합니다.(설치 후 확장프로그램 관리에서 실행 권한 체크 필요)
3.  운영체제에 맞는 실행 스크립트를 다운로드 받고 본인 환경에 맞게 수정합니다.
4.  헬퍼가 반환하는 URL 형식(외부재생: `plexplay://` / 스트림재생: `plexstream://` / 폴더열기: `plexfolder://`)을 열 수 있도록 환경 설정 작업을 해야 합니다.
5. `pmh_server.py`가 항상 실행되는 환경이 필요합니다(FF 내 `Command` 이용 추천. 포트(기본: 8899, 서버 스크립트 내에서 설정 가능) 오픈 필요).
6. `pmh_config.yaml.sample` 파일을 받아서 이름을 `pmh_config.yaml`로 변경하고, 본인 환경에 맞도록 설정한 뒤 서버를 실행합니다.


## 설정 방법

Plex 웹앱 페이지에서 브라우저 상단의(확장 프로그램) Tampermonkey 아이콘을 클릭한 후, `PMH 설정 (JSON)` 메뉴를 선택하여 스크립트 설정을 열 수 있습니다. 아래는 기본 설정 템플릿과 각 항목에 대한 설명입니다.

### 기본 설정 템플릿

```json
{
    "INFO": "아래 설정을 JSON 형식에 맞게 수정하세요.",
    "MAX_CACHE_SIZE": 5000,
    "DISPLAY_PATH_PREFIXES_TO_REMOVE": ["/mnt/gds", "/mnt/content"],
    "LOG_LEVEL": "INFO",
    "USER_TAGS": {
        "PRIORITY_GROUP": [
            { "name": "LEAK", "pattern": "(leaked|유출)", "target": "filename" },
            { "name": "UNCEN", "pattern": "(mopa|uncen|모파|모자이크제거)", "target": "path" }
        ],
        "INDEPENDENT": [
            { "name": "REMUX", "pattern": "remux", "target": "path" }
        ]
    },
    "PATH_MAPPINGS": [
        { "serverPrefix": "/mnt/gds/", "localPrefix": "Z:/gds/" },
        { "serverPrefix": "/mnt/content/", "localPrefix": "Z:/content/" }
    ],
    "SERVERS": [
        {
            "name": "My Main Server",
            "machineIdentifier": "SERVER_MACHINE_IDENTIFIER_HERE",
            "pmhServerUrl": "http://127.0.0.1:8899",
            "plexMateUrl": "https://ff1.yourdomain.com",
            "plexMateApiKey": "_YOUR_APIKEY_"
        }
    ]
}
```

### 설정 항목 설명

| 키 | 설명 |
| ---------------------------------- | -------------------------------------------------------------------------------------------------- |
| `MAX_CACHE_SIZE`                   | 최대 메모리 캐시 건수 사용자 설정(기본값 5000)
| `DISPLAY_PATH_PREFIXES_TO_REMOVE`  | UI에 표시될 파일 경로에서 제거할 앞부분을 지정합니다. 경로가 너무 길 경우 간결하게 표시하기 위해 사용합니다. (예: `/mnt/gds/Movies/Avatar (2009)/...` -> `/Movies/Avatar (2009)/...`) |
| `LOG_LEVEL`                        | `INFO`(기본값), `DEBUG` 레벨 지원 |
| `USER_TAGS`                        | 파일명에 포함된 문자열 패턴을 기반으로 사용자 태그를 지정할 수 있습니다. `PRIORITY_GROUP`: 설정한 태그 중 먼저 해당하는 한 가지만 출력합니다(우선순위). / `INDEPENDENT`: 개별 태그를 설정합니다. `target`은 `path`(전체경로)/`filename`(파일명만) 중 선택 가능합니다. |
| `PATH_MAPPINGS`                    | 서버의 파일 경로를 로컬 PC의 경로로 변환하는 규칙입니다(외부 플레이어/폴더 열기 기능 사용시 필요). `serverPrefix`는 Plex 서버가 인식하는 경로, `localPrefix`는 로컬 PC에서 접근 가능한 경로(네트워크 드라이브 등)를 입력합니다. 최근 Windows에서는 백슬래시를 사용하지 않고 슬래시를 사용해도 문제가 없습니다. |
| `SERVERS`                          | 서버를 그룹별 리스트로 설정합니다. |
| - `name`                           | 알아보기 편한 이름으로 지정하세요. |
| - `machineIdentifier`              | Plex 서버의 Machine Identifier를 입력합니다. |
| - `pmhServerUrl`                   | PMH Server의 url을 입력합니다. |
| - `plexMateUrl`                    | Plex 와 연동 설정된(PLEX MATE) FF의 url을 입력합니다. |
| - `plexMateApiKey`                 | PLEX MATE 연동을 위해 FF의 APIKEY를 입력합니다. |

서버 설정은 샘플 yaml 내의 설명을 참고하세요.


## 외부 재생/폴더 열기
### Windows

1. `plexhelper.vbs`: PowerShell을 통해 재생기/탐색기를 실행하는 스크립트입니다. 스트림 재생은 팟플레이어 기준으로 작성되었습니다. 팟플레이어의 경로를 확인/수정해주세요.
2. `plexhelper.reg`: 텍스트 편집기로 열어서 plexhelper.vbs 경로를 본인 환경에 맞게 수정한 뒤에 더블 클릭으로 레지스트리에 추가해 줍니다.

### Ubuntu

1. `plexhelper.sh`: 우분투 데스크탑 환경에서 동영상 재생기를 실행하는 쉘 스크립트입니다. 다운로드 받은 스크립트에 `chmod +x plexhelper.sh`로 실행 권한을 줍니다. smplayer 기준으로 샘플이 작성돼있습니다.
2. `plexhelper-handler.desktop`: 파일을 텍스트 편집기에서 열고 plexhelper.sh 경로를 수정한 뒤 `~/.local/share/applications/`에 넣어줍니다. 아래 명령어를 실행해서 프로토콜을 등록하면 즉시 기본 플레이어로 동영상을 열거나 폴더 열기가 가능합니다.
```bash
update-desktop-database ~/.local/share/applications/
```

### macOS

1. macOS에 기본으로 설치된 **스크립트 편집기(Script Editor)**를 엽니다.
2. 새로운 문서를 열고 AppleScript 파일의 내용을 붙여 넣고, 스크립트를 **응용프로그램(Application)**으로 저장(ex. PlexHelper.app)합니다. 미디어 플레이어는 IINA를 기준으로 작성되었습니다.
3. 저장된 앱을 마우스 오른쪽 클릭하고 **패키지 내용 보기(Show Package Contents)**를 선택합니다.
4. Contents 폴더로 들어가 Info.plist 파일을 텍스트 편집기로 엽니다.
5. 파일의 맨 아래, `</dict>` 태그 바로 위에 아래 내용을 추가합니다.
```xml
    <key>CFBundleURLTypes</key>
    <array>
        <dict>
            <key>CFBundleURLName</key>
            <string>Plex Play Handler</string>
            <key>CFBundleURLSchemes</key>
            <array>
                <string>plexplay</string>
                <string>plexfolder</string>
                <string>plexstream</string>
            </array>
        </dict>
    </array>
```
최종적으로 Info.plist 파일의 끝부분은 아래와 같은 모습이 됩니다.
```xml
... (기존 내용) ...
    </dict>
    <key>CFBundleURLTypes</key>
    <array>
        <dict>
            <key>CFBundleURLName</key>
            <string>Plex Play Handler</string>
            <key>CFBundleURLSchemes</key>
            <array>
                <string>plexplay</string>
                <string>plexfolder</string>
                <string>plexstream</string>
            </array>
        </dict>
    </array>
</plist>
```
6. 파일을 저장하고 닫은 뒤 앱을 한번 실행하거나, 재로그인 하거나, 아래 명령어를 실행하면 URL 스킴이 등록됩니다.
```bash
/System/Library/Frameworks/CoreServices.framework/Versions/A/Frameworks/LaunchServices.framework/Versions/A/Support/lsregister -f /Applications/PlexHelper.app
```
macOS는 시스템에 **Python 3 필요**하고, 현재 테스트가 충분하지 않습니다.
