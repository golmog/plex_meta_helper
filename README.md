# Plex Meta Helper (PMH)

Plex Web UI를 강화하는 Tampermonkey 유저스크립트 및 백엔드 툴 관리 시스템입니다.
Plex 컨텐츠의 상세 메타 정보를 표시하고, 캐시 관리, 외부 플레이어 연동 및 서버 툴 관리 등 다양한 편의 기능을 제공합니다.

## 업데이트

v0.8.60 (2026-03-27)
- **서버 마스터/노드 아키텍처 도입**: 프론트엔드는 마스터 노드(Gateway)에만 접속하며, 마스터가 각 워커 노드로 API를 릴레이(Relay).
- **모바일 PWA 앱 지원**: 브라우저 확장프로그램이 없는 모바일 기기에서도 홈 화면에 앱을 추가하여 툴 박스를 관리할 수 있는 독립 페이지(`index.html`) 제공.
- **UI 코어 분리**: PC와 모바일이 동일한 렌더링 엔진(`pmh_ui_core.js`, `pmh_ui_core.css`)을 공유하도록 구조 개선.
- **Plex Mate 연동 방식 변경**: 프론트엔드에서 직접 통신하지 않고 백엔드(pmh_server)를 프록시로 거쳐 통신하도록 변경.

v0.7.x
- 사용자 툴 도입

v0.6.x
- Flask 서버 시스템 도입
- 목록에 태그(뱃지) 기능 추가


## 사전 요구사항

이 스크립트의 모든 기능을 사용하려면 다음이 필요합니다.

1.  **Tampermonkey**: PC 브라우저에 [Tampermonkey](https://www.tampermonkey.net/) 확장이 설치되어 있어야 합니다.
2.  **PMH 백엔드 서버**: `pmh_server.py`가 구동되는 백엔드 서버(컨테이너 또는 호스트)가 최소 1대 이상 필요합니다.
3.  **외부 플레이어 연동 설정 (선택)**: `plexplay://`, `plexstream://`, `plexfolder://` URL 스킴을 로컬 OS에서 인식하도록 설정해야 외부 플레이어나 탐색기 열기가 가능합니다. (문서 하단 참고)


## 주요 기능

*   **추가 메타 정보 표시 (Web UI)**:
    *   상세 페이지: GUID, 원본 파일 경로, 해상도, 오디오/비디오 코덱, 재생 시간, 마커(인트로/크레딧) 시간 정보 표시.
    *   목록 페이지: 각 항목에 GUID, 해상도 및 HDR 뱃지, 다중 경로 뱃지 등을 표시.
*   **Plex Mate 연동**:
    *   `YAML/TMDB 반영`: Plex Web UI에서 직접 YAML 기준 메타데이터 수동 반영 버튼 제공.
    *   VFS 및 라이브러리 스캔: 파일 경로를 클릭하여 즉시 VFS 갱신 및 스캔 요청.
*   **PMH Toolbox (플러그인 툴 관리)**:
    *   서버에 플러그인 툴(예: 스마트 스캐너, 다중 경로 검색기 등)을 설치하고 Web UI나 모바일 PWA에서 스케줄링(크론) 및 실행 모니터링 가능.
*   **외부 플레이어 / 폴더 열기**:
    *   로컬 경로 매핑을 통해 외부 재생기(팟플레이어 등)로 직접 재생하거나 파일이 위치한 폴더를 엽니다.


## 설치 및 설정 방법

### 1. 백엔드 서버 (`pmh_server.py`) 구동
1. `pmh_server.py`를 서버 환경에서 실행합니다. (기본 포트: 8899)
2. 최초 실행 시 `pmh_config.yaml` 템플릿 파일이 생성됩니다.
3. 생성된 `pmh_config.yaml`을 열어 `PLEX_URL`, `PLEX_TOKEN`, `PLEX_DB_PATH`, `APIKEY`(마스터 키) 등을 설정합니다.
   * 다중 서버를 운영할 경우, `MASTER` 섹션에 다른 워커 노드들을 등록하여 릴레이를 구성합니다.
4. 설정을 마친 후 서버를 재시작합니다.

### 2. 프론트엔드 (PC 브라우저) 설정
1. 브라우저에 [Tampermonkey 스크립트 설치](https://raw.githubusercontent.com/golmog/plex_meta_helper/main/plex_meta_helper.user.js) 링크를 클릭하여 설치합니다.
2. Plex Web UI에 접속 후 상단 메뉴의 톱니바퀴(<i class="fas fa-cog"></i>) 아이콘(PMH 클라이언트 설정)을 클릭합니다.(첫 접속시 자동 팝)
3. `마스터 서버 주소`와 `접속 키(APIKEY)`를 입력하고 연결을 테스트한 후 저장합니다.

### 3. 모바일 PWA 접속 (선택)
1. 스마트폰이나 태블릿의 브라우저에서 마스터 서버 주소(예: `http://192.168.x.x:8899`)로 접속합니다.
2. 설정 탭에서 API Key를 입력하여 로그인합니다.
3. 브라우저 메뉴에서 **[홈 화면에 추가]**를 선택하여 전체 화면 앱(PWA) 모드로 쾌적하게 사용하세요.

서버 설정은 샘플 yaml 내의 설명을 참고하세요.


## 외부 재생/폴더 열기 설정 (로컬 PC)

Plex 서버의 파일 경로를 로컬 PC가 인식할 수 있는 네트워크 드라이브 경로로 변환(클라이언트 설정의 `로컬 경로 매핑` 활용)한 뒤, OS별로 URL 스킴을 등록해야 합니다.

### Windows

1. `plexhelper.vbs`: 재생기/탐색기를 실행하는 스크립트입니다. 팟플레이어 경로를 확인/수정해주세요.
2. `plexhelper.reg`: 텍스트 편집기로 열어 `plexhelper.vbs` 파일이 위치한 절대 경로로 수정한 뒤, 더블클릭하여 레지스트리에 병합합니다.

### Ubuntu

1. `plexhelper.sh`: 쉘 스크립트입니다. 다운로드 후 `chmod +x plexhelper.sh`로 실행 권한을 줍니다. (기본값 smplayer 기준)
2. `plexhelper-handler.desktop`: `plexhelper.sh` 경로를 수정한 뒤 `~/.local/share/applications/` 디렉토리에 복사합니다.
3. 아래 명령어를 실행하여 데스크톱 데이터베이스를 갱신합니다.
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
