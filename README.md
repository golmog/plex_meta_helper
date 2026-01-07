# Plex Meta Helper

Plex Web UI를 강화하는 Tampermonkey 유저스크립트입니다. Plex 컨텐츠의 상세 메타 정보를 표시하고, 캐시 관리, 외부 플레이어 연동 등 다양한 편의 기능을 제공합니다.

특히 `plex_mate`와의 연동을 통해 VFS 새로고침 및 라이브러리 스캔을 웹 UI에서 직접 실행할 수 있습니다.

## 업데이트

0.3.5 (2025-09-04)
- 외부재생을 목록재생/상세재생으로 나눔
- 로그레벨을 설정 JSON 내에서 지정(INFO/DEBUG/NONE)

## 사전 요구사항

이 스크립트의 모든 기능을 사용하려면 다음이 필요합니다.

1.  **Tampermonkey**: 브라우저에 [Tampermonkey](https://www.tampermonkey.net/)와 같은 유저스크립트 매니저가 설치되어 있어야 합니다.
2.  **PlexExternalPlayer Agent (선택 사항)**: '외부 플레이어 재생' 및 '폴더 열기' 기능을 사용하려면, 로컬 PC에 [PlexExternalPlayer 에이전트](https://github.com/Kayomani/PlexExternalPlayer)를 다운로드하여 실행해야 합니다. 에이전트가 실행 중이어야 기능이 동작합니다.

## 주요 기능

*   **추가 메타 정보 표시**:
    *   콘텐츠 상세 페이지에 GUID, 원본 파일 경로, 파일 크기, 재생 시간 등 추가 정보를 표시합니다.
    *   인트로/크레딧 건너뛰기 시간 정보를 표시합니다.
    *   목록 보기에서 각 항목에 GUID 뱃지를 표시하여 쉽게 식별할 수 있습니다.
*   **Plex Mate 연동**:
    *   파일 경로를 클릭하여 `plex_mate`를 통해 VFS 새로고침 및 라이브러리 스캔을 요청할 수 있습니다.
    *   `YAML/TMDB 반영` 버튼으로 메타데이터를 즉시 갱신하도록 요청할 수 있습니다.
*   **외부 플레이어 / 폴더 열기**:
    *   상세 페이지 및 목록 보기에서 아이콘을 클릭하여 로컬 PC에 설치된 외부 플레이어(예: 팟플레이어)로 영상을 재생하거나 해당 파일이 위치한 폴더를 열 수 있습니다. (사전 요구사항 참고)
*   **캐시 관리**:
    *   스크립트가 수집한 메타 정보는 브라우저 캐시에 저장하여 빠르게 로딩됩니다.
    *   UI 버튼을 통해 현재 페이지 또는 전체 항목의 캐시를 쉽게 삭제하고 갱신할 수 있습니다.
*   **사용자 맞춤형 UI**:
    *   목록 GUID, 외부 재생 아이콘, 상세 정보 표시 여부를 UI 상단 컨트롤 버튼으로 쉽게 켜고 끌 수 있습니다.

## 설치 방법

1.  위의 `사전 요구사항`을 먼저 확인하고 준비합니다.
2.  이 스크립트의 **[설치 링크](https://raw.githubusercontent.com/golmog/plex_meta_helper/main/plex_meta_helper.user.js)**를 클릭하여 Tampermonkey에 설치합니다.

## 설정 방법

Plex 웹 UI에서 Tampermonkey 아이콘을 클릭한 후, `PMH 설정 (JSON)` 메뉴를 선택하여 설정을 열 수 있습니다. 아래는 기본 설정 템플릿과 각 항목에 대한 설명입니다.

### 기본 설정 템플릿

```json
{
    "INFO": "아래 설정을 JSON 형식에 맞게 수정하세요.",
    "DISPLAY_PATH_PREFIXES_TO_REMOVE": [
        "/mnt/gds",
        "/mnt/content"
    ],
    "SERVER_TO_LOCAL_PATH_MAPPINGS": [
        {
            "serverPrefix": "/mnt/gds/",
            "localPrefix": "Z:/gds/"
        },
        {
            "serverPrefix": "/mnt/content/",
            "localPrefix": "Z:/content/"
        }
    ],
    "FF_URL_MAPPINGS": {
        "SERVER_1_MACHINE_IDENTIFIER_HERE": "https://ff1.yourdomain.com",
        "SERVER_2_MACHINE_IDENTIFIER_HERE": "https://ff2.yourdomain.com"
    },
    "PLEX_MATE_APIKEY": "_YOUR_APIKEY_",
    "PLEX_MATE_CALLBACK_ID": "PlexMetaHelper",
    "PLEX_MATE_SCAN_TYPE": "web",
    "LOG_LEVEL": "INFO"
}
```

### 설정 항목 설명

| 키 | 설명 |
| -------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `DISPLAY_PATH_PREFIXES_TO_REMOVE`      | UI에 표시될 파일 경로에서 제거할 앞부분을 지정합니다. 경로가 너무 길 경우 간결하게 표시하기 위해 사용합니다. (예: `/mnt/gds/Movies/Avatar (2009)/...` -> `Movies/Avatar (2009)/...`) |
| `SERVER_TO_LOCAL_PATH_MAPPINGS`        | 서버의 파일 경로를 로컬 PC의 경로로 변환하는 규칙입니다. **외부 플레이어/폴더 열기 기능을 사용하려면 PlexExternalPlayer 에이전트 실행과 함께 이 설정이 필수적입니다.** `serverPrefix`는 Plex 서버가 인식하는 경로, `localPrefix`는 로컬 PC에서 접근 가능한 경로(네트워크 드라이브 등)를 입력합니다. |
| `FF_URL_MAPPINGS`                      | **`plex_mate` 연동을 위해 필수적입니다.** Plex 서버의 `machineIdentifier`와 `plex_mate`의 접속 주소를 각각 입력하여 연결합니다. 서버의 `machineIdentifier`는 Plex 상세 페이지 URL에서 `.../server/여기에있는값/details...` 부분을 복사하여 사용하면 됩니다. |
| `PLEX_MATE_APIKEY`                     | `plex_mate` API를 사용하기 위한 API 키를 입력합니다. |
| `PLEX_MATE_CALLBACK_ID`                | `plex_mate` 로그에 표시될 작업 요청자 ID입니다. |
| `PLEX_MATE_SCAN_TYPE`                  | 경로 스캔 시 사용할 스캔 방식을 선택합니다. `"web"`으로 지정시 Plex web 방식 스캔으로 요청합니다. |
