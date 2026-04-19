# Plex Meta Helper (PMH)

Plex Web UI의 관리 기능을 강화하는 Tampermonkey 유저스크립트 및 백엔드 툴 관리 시스템입니다.
Plex 컨텐츠의 상세 메타 정보를 표시하고, 캐시 관리, 외부 플레이어 연동 및 서버 툴 관리 등 다양한 편의 기능을 제공합니다.

## 업데이트

v0.8.79 (2026-04-19)
- 서버/UI/툴 스마트 매칭 로직 개선, 공통 적용
- UI 버그 수정

v0.8.78 (2026-04-16)
- 상세 페이지 내 경로 분할: 선택적 상위 경로 스캔 가능
- Windows용 헬퍼 스크립트(VBS) 수정: plexfolder 오픈시 기존엔 상위 폴더를 열었지만 이제 파일을 선택 상태로 열게 됨
- 배치/스마트 스캐너 스케줄 실행시 목록 db 생성 추가
- 업데이트시 기존 파일 소유권 복구

v0.8.76 (2026-04-15)
- 맥 OS용 헬퍼 앱을 Swift로 교체
- 메타 새로고침시/친구 서버 목록 등의 UI 처리 개선, 버그 수정
- 기타 개선, 버그 수정

v0.8.75 (2026-04-12)
- 서버의 매칭 로직에 큐 도입
- JAV 지원 추가
- 기타 개선, 버그 수정

v0.8.73 (2026-04-04)
- Flask 응답 처리 강화/버그 수정
- 기타 개선

v0.8.72 (2026-04-04)
- 서버/프론트엔드 JS(**v0.8.71**) 긴급 버그 수정: 업데이트 불가시 수동으로 덮어써 주시기 바랍니다.

v0.8.71 (2026-04-03)
- 매칭 로직 개선
- 기타 개선, 버그 수정

v0.8.70 (2026-04-02)
- 매칭 로직 개선(서버)
- 매칭 설정 추가(프론트엔드 JS)
- 캐시 초기화시 서버 코어 리로딩 로직 수정
- 기타 개선, 버그 수정

v0.8.68 (2026-03-31)
- 프론트엔드 개발 모드시 자동/수동 업데이트 체크 차단
- DOM 변화 감지 버그 수정
- UI 수정

v0.8.65 (2026-03-29)
- 미디어 작업 로직 수정: API 호출, 매칭 로직, 관련 툴
- 프론트엔드 개발 모드 추가

v0.8.64 (2026-03-28)
- http 주소 사용시 사이트/브라우저에서 차단되는 문제 우회
- APIKEY 통신 보안 개선
- `BASE` 설정에 `ENABLE_FAIL2BAN: true`(기본값: true) 추가
- 업데이트 로직/기타 개선, 버그 수정

v0.8.61 (2026-03-27)
- 서버 주소를 http로 설정시 차단 우회 로직 적용(PC TamperMonkey): 가급적 https 사용을 권장합니다. http 서버 주소 설정시 app.plex.tv에서 로컬 기기를 찾는 것 등을 허용해야 할 수 있습니다.
- 서버 접속 보안 강화: API 글자수 제한, Fail2Ban 로직 적용
- 업데이트 후 서버 재시작 여부 확인 로직 추가

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
4. `plex_sync.lua`를 `.config/mpv/scripts`에 넣어주면 mpv로 plexstream 재생시 동기화 등을 이용할 수 있게 됩니다.

### macOS

macOS의 샌드박싱과 보안 정책으로 인해 AppleScript 방식 대신 **Swift로 컴파일된 작은 Helper App**을 사용해야 합니다.

#### 1단계: Helper App 빌드 (Xcode)
1. Mac에서 **Xcode**를 열고 `Create a new Xcode project`를 클릭합니다.
2. **macOS > App**을 선택하고 Product Name을 **PlexMetaHelper**로 지정합니다. (Interface: SwiftUI, Language: Swift)
3. 좌측 탐색기에서 `PlexMetaHelperApp.swift`를 열고 [이 문서에 있는 Swift 코드](link_to_swift_code_here)로 완전히 교체합니다.
4. 프로젝트 루트(최상단 파란색 아이콘)를 클릭 > **Info** 탭 선택 > **URL Types** 항목을 펼치고 `+` 버튼을 누릅니다.
5. **Identifier**에 `Plex Meta Helper Handler`를 입력하고, **URL Schemes**에 `plexplay,plexfolder,plexstream`을 콤마(,)로 구분하여 입력합니다.
6. `Cmd + B`를 눌러 빌드하거나, `Product > Archive`를 통해 앱을 추출하여 **응용프로그램(Applications)** 폴더에 넣습니다. (한 번 실행해주면 스킴이 등록됩니다.)
7. 만약 IINA가 실행되지 않는 문제가 발생한다면, Xcode에서 빌드 전 **App Sandbox를 제거**해야 합니다.

#### 2단계: IINA 동기화 스크립트 적용 (`plex_sync.lua`)
Helper App이 URL을 정리하여 IINA를 실행하면, IINA 내부의 Lua 스크립트가 Plex 서버와 통신하여 자막을 입히고 진행 상황을 동기화합니다.
IINA에 설정된 mpv 설정 폴더에 스크립트를 추가해줘야 합니다.

1. IINA 앱 환경설정 > 고급(Advanced) > 고급설정에서 mpv 설정 경로를 확인합니다.
2. Finder를 열고 상단 메뉴에서 `이동 > 폴더로 이동... (Cmd + Shift + G)`를 누릅니다.
3. `~/.config/mpv` 경로(IINA 설정 기본값)로 이동합니다(없으면 생성하거나 설정에 맞게 이동).
4. `scripts` 폴더를 생성하고, 저장소의 `plex_sync.lua` 파일을 넣습니다.
5. 이제 웹 브라우저에서 PMH의 스트리밍(<i class="fas fa-wifi"></i>) 또는 로컬 재생(<i class="fas fa-play"></i>) 버튼을 누르면 IINA가 열리며 재생됩니다.
```
