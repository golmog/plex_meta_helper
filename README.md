# Plex Meta Helper (PMH)

Plex Web UI의 고급 관리 기능을 강화를 위한 프로젝트입니다.
웹 프론트엔드([Tampermonkey](https://www.tampermonkey.net/) 기반)에서는 Plex Web UI에서 컨텐츠 정보를 더 풍성하게 보여주고, 특정 기능들을 쉽게 실행할 수 있도록 하는데 촛점이 맞춰져 있습니다.
Flask 백엔드는 실시간으로 Plex DB와 연동하고 프론트엔드의 요청을 처리하거나, 개별 툴들의 백그라운드 실행을 관리합니다.
툴은 번들 외에도 사용자가 직접 개발하고 깃헙 주소를 공유함으로써 유저 툴을 추가 설치할 수 있습니다.


## 업데이트

v0.9.118 (2026-08-22)
- Plex DB 처리를 기존 sqlite3 외에 추가로 postgresql을 지원: 아직 알파 테스트 단계이므로 사용 주의
  - postgres 사용시 백엔드 추가 설정 필요(`pmh_config.master_sample.yaml` 참고)
  - 툴 개발시 가급적 표준 ANSI SQL 쿼리 작성 필요
  - 번들 툴 전체 적용
- AV용 이미지 편집 모달 추가(FF 연동)
  - FF metadata 이용시(AV) '이미지 서버' 사용 필수
  - 백엔드 노드(BASE) 설정에 `AV_IMAGE_SERVER_USE: true` 설정 필요
  - 프로세스 흐름: FF metadata 플러그인 로컬 메타 DB $\rightarrow$ (API) $\rightarrow$ 이미지 로딩 $\rightarrow$ 크롭 좌표 획득/저장 $\rightarrow$ (API) $\rightarrow$ DB/이미지 업데이트 $\rightarrow$ 리매칭
- Plex 목록 페이지 뱃지 렌더링에 Viewport 적용
- 툴 패널 로깅에 실시간 로깅(SSE) 적용
- 툴 로깅시 기존 DB에 저장되던 로그를 별도 로그로(.log 로테이션) 분리

v0.9.x
- PostgreSQL 지원(번들 툴 포함): [plex-postgresql](https://github.com/cgnl/plex-postgresql) 대응
- AV용 이미지 편집 모달 추가(FF 연동)

v0.8.x
- **서버 마스터/노드 아키텍처 도입**: 프론트엔드는 마스터 노드(Gateway)에만 접속하며, 마스터가 각 워커 노드로 API를 릴레이(Relay).
- **모바일 PWA 앱 지원**: 브라우저 확장프로그램이 없는 모바일 기기에서도 홈 화면에 앱을 추가하여 툴 박스를 관리할 수 있는 독립 페이지(`index.html`) 제공.
- **UI 코어 분리**: PC와 모바일이 동일한 렌더링 엔진(`pmh_ui_core.js`, `pmh_ui_core.css`)을 공유하도록 구조 개선.
- **Plex Mate 연동 방식 변경**: 프론트엔드에서 직접 통신하지 않고 백엔드(pmh_server)를 프록시로 거쳐 통신하도록 변경.
- 서버 접속 보안 강화: API 글자수 제한, Fail2Ban 로직 적용
- 맥 OS용 헬퍼 앱을 Swift로 교체
- SJVA AV(JAV/Western) 에이전트/플러그인 대응 지원
- SJVA/Plex 에이전트 외 기타 커스텀(레거시) 에이전트(점수 기반) 처리
- 모바일 친화적 UX 고려

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

### 1. pmh 다운로드(의존성 패키지 포함)
PMH 백엔드 서버를 설치할 상위 경로로 이동 후 아래 커맨드를 실행합니다.
```bash
curl -fsSL https://raw.githubusercontent.com/golmog/plex_meta_helper/main/install.sh | bash
```
설치 스크립트를 실행하면 의존성 패키지를 설치하고 `./pmh` 경로에 서버(pmh_server.py)가 다운로드 되고, 설치 경로(`./pmh`) 내에 `pmh_config.yaml`이 없을 경우 마스터 설정(`pmh_config.master_sample.yaml`)이 `pmh_config.yaml`로 저장됩니다. .

### 2. 백엔드 서버 (`pmh_server.py`) 구동
1. 반드시 서버 실행 전 본인 환경에 맞게 `pmh_config.yaml`을 수정하시기 바랍니다.
  - 워커 노드의 경우는 설정 파일 내에서 마스터 설정 부분만 삭제하시면 됩니다.
  - 서버 실행시 설정 파일이 아예 없으면 마스터가 아닌 노드 기본 설정으로 자동 생성되며, 역시 샘플 기본값이기 때문에 본인 환경에 맞게 수정해야 합니다.
  - AV 라이브러리가 없으면 해당 설정 부분을 다 제거하시면 됩니다.
  - AV 라이브러리가 있더라도 파싱 규칙(`JAV_PARSING_RULES`)은 직접 수정하실 게 아니라면 기본값이 내장되어 있으니 삭제하셔도 됩니다.
2. `pmh_server.py`를 실행합니다.
  - 첫 실행이면 나머지 필수 에셋들을 자동으로 다운로드 하게 됩니다.
3. 서버 환경에 따라 클라이언트가 PMH 서버에 접근할 수 있도록 포트를 개방하거나, 리버스 프록시 설정 등이 필요합니다.

### 3. 프론트엔드 (PC 브라우저) 설정
1. 브라우저에 [Tampermonkey 스크립트 설치](https://raw.githubusercontent.com/golmog/plex_meta_helper/main/plex_meta_helper.user.js) 링크를 클릭하여 설치합니다.
2. Plex Web UI에 접속 후 상단 메뉴의 톱니바퀴(<i class="fas fa-cog"></i>) 아이콘(PMH 클라이언트 설정)을 클릭합니다.(첫 접속시 자동 팝업)
3. `마스터 서버 주소`와 `접속 키(APIKEY)`를 입력하고 연결을 테스트한 후 저장합니다.

### 4. 모바일 PWA 접속 (선택)
PMH 
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
