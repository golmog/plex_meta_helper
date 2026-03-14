# -*- coding: utf-8 -*-
"""
====================================================================================
 [PMH Tool Reference Template] - 라이브러리 통계 분석 (즉시 반환형 대시보드)
====================================================================================

 이 파일은 PMH(Plex Meta Helper) 커스텀 툴 중 '대시보드(Dashboard)' 형식을 
 개발하기 위한 교과서/레퍼런스 파일입니다.

 1. [대시보드형 툴의 특징]
    - 데이터테이블(Datatable)처럼 비동기 워커가 적용됐습니다.
    - 유저가 [조회]를 누르면 DB를 분석한 뒤 그 결과를 즉시 JSON으로 반환합니다.
    - 반환된 JSON의 `type`이 `"dashboard"`일 경우, 프론트엔드(JS)가 알아서
      예쁜 카드(Summary Cards)와 막대 그래프(Bar Charts)를 화면에 그려줍니다.

 2. [안전한 DB 쿼리 (Parameter Binding)]
    - f-string 포맷팅으로 쿼리 문자열에 변수를 직접 넣으면 SQL 인젝션 공격에 취약해집니다.
    - `core_api['query'](sql, (param1, param2))` 형태로 파라미터 바인딩을 사용하는 것이 정석입니다.

 3. [동기식 로깅 (Logs 반환)]
    - 동기식 즉시 반환 툴에서는 `core_api['task'].log()` 대신, 자체적으로 문자열 배열을 
      만들어 JSON의 `"logs"` 속성으로 넘겨주면, 프론트엔드 모니터 화면에 로그가 출력됩니다.
====================================================================================
"""
import time
import json

# =====================================================================
# 디스코드 알림 기본 템플릿
# =====================================================================
DEFAULT_DISCORD_TEMPLATE = """**📊 라이브러리 요약 (자동 업데이트)**

**[🎬 컨텐츠 수량]**
- 영화: {movie_count} 편
- TV 쇼: {episode_count} 화

**[💾 전체 시스템 요약]**
- 총 소모 용량: {total_size}
- 총 재생 시간: {total_duration}
"""

def format_size(bytes_size):
    """바이트(Bytes)를 사람이 보기 좋은 단위(KB, MB, GB, TB...)로 변환하는 유틸리티 함수"""
    if not bytes_size: return "0 B"
    for unit in ['B', 'KB', 'MB', 'GB', 'TB', 'PB']:
        if bytes_size < 1024.0:
            return f"{bytes_size:.1f} {unit}"
        bytes_size /= 1024.0
    return f"{bytes_size:.1f} PB"

def format_duration(ms):
    """밀리초(ms)를 일(Days), 시간(Hours)으로 변환하고 3자리 콤마를 찍어주는 유틸리티 함수"""
    if not ms: return "0 시간"
    hours = ms / (1000 * 60 * 60)
    if hours > 24:
        return f"{hours / 24:,.1f} 일"
    return f"{int(hours):,} 시간"

# =====================================================================
# 1. UI 스키마 정의
# =====================================================================
def get_ui(core_api):
    sections = [{"value": "all", "text": "전체 라이브러리 (All)"}]
    try:
        for r in core_api['query']("SELECT id, name FROM library_sections ORDER BY name"):
            sections.append({"value": str(r['id']), "text": r['name']})
    except Exception: pass

    return {
        "title": "라이브러리 종합 통계 분석",
        "description": "선택한 라이브러리의 메타 데이터를 분석하여 요약 대시보드를 생성합니다.<br>(주의: 이 툴은 데이터 변경을 수행하지 않는 조회 전용 툴입니다.)",
        "inputs": [
            {"id": "target_sections", "type": "multi_select", "label": "분석할 라이브러리 섹션", "options": sections, "default": "all"},
            
            {"id": "media_types", "type": "checkbox_group", "label": "분석 대상 미디어 (실제 파일 단위)", "options": [
                {"id": "type_movie", "label": "영화 (Movies)", "default": True},
                {"id": "type_show", "label": "TV 쇼 (Episodes)", "default": True},
                {"id": "type_music", "label": "음악 (Audio Tracks)", "default": False},
                {"id": "type_photo", "label": "사진 및 기타 (Photos)", "default": False}
            ]}
        ],
        "settings_inputs": [
            {"id": "s_h_cron", "type": "header", "label": "<i class='fas fa-clock'></i> 자동 실행 스케줄러"},
            {"id": "cron_enable", "type": "checkbox", "label": "크론탭 기반 자동 실행 활성화 (캐시 갱신)", "default": False},
            {"id": "cron_expr", "type": "cron", "label": "크론탭 시간 설정 (분 시 일 월 요일)", "placeholder": "예: 0 5 * * 0 (일요일 새벽 5시) ※숫자만 허용"},

            {"id": "s_h2", "type": "header", "label": "<i class='fab fa-discord'></i> 알림 설정"},
            {"id": "discord_enable", "type": "checkbox", "label": "자동 실행 완료 시 디스코드 요약 알림 발송", "default": True},
            {"id": "discord_webhook", "type": "text", "label": "툴 전용 웹훅 URL (비워두면 서버 전역 설정 사용)", "placeholder": "https://discord.com/api/webhooks/..."},
            
            {"id": "discord_bot_name", "type": "text", "label": "디스코드 봇 이름 오버라이딩", "placeholder": "예: {server_name} 통계 요정 (템플릿 변수 사용 가능)"},
            {"id": "discord_avatar_url", "type": "text", "label": "디스코드 봇 프로필 이미지 URL", "placeholder": "https://.../icon.png"},
            
            {"id": "discord_template", "type": "textarea", "label": "본문 메시지 템플릿 편집", "height": 160, "default": DEFAULT_DISCORD_TEMPLATE, 
             "template_vars": [
                 {"key": "movie_count", "desc": "집계된 영화 개수"},
                 {"key": "episode_count", "desc": "집계된 에피소드 개수"},
                 {"key": "music_count", "desc": "집계된 음악 트랙 수"},
                 {"key": "photo_count", "desc": "집계된 사진 개수"},
                 {"key": "total_size", "desc": "포맷팅된 총 소모 용량 (예: 1.5 TB)"},
                 {"key": "total_duration", "desc": "포맷팅된 총 재생 시간 (예: 25.4 일)"}
             ]},
             
            {"id": "discord_template_footer", "type": "textarea", "label": "푸터(Footer) 템플릿 편집", "height": 50, "default": "Plex Meta Helper - {tool_id} | {server_name}", 
             "template_vars": [
                 {"key": "tool_id", "desc": "실행된 툴의 고유 ID (어느 곳에서나 사용 가능)"},
                 {"key": "server_id", "desc": "실행 대상 서버 식별자 앞 8자리 (어느 곳에서나 사용 가능)"},
                 {"key": "server_name", "desc": "사용자가 설정한 서버 이름 (어느 곳에서나 사용 가능)"},
                 {"key": "date", "desc": "현재 날짜 YYYY-MM-DD (어느 곳에서나 사용 가능)"},
                 {"key": "time", "desc": "현재 시간 HH:MM:SS (어느 곳에서나 사용 가능)"}
             ]}
        ],
        "button_text": "통계 추출 시작"
    }

# =====================================================================
# 2. 메인 실행 라우터 (읽기 전용 일원화)
# =====================================================================
def run(data, core_api):
    # Preview(조회), Execute(다시 집계), Cron 모두 동일하게 백그라운드에서 데이터를 갱신합니다.
    task_data = data.copy()
    task_data['_is_preview_tool'] = True 
    return {"status": "success", "type": "async_task", "task_data": task_data}, 200

# =====================================================================
# 3. 백그라운드 워커 (단일 쿼리 통계 최적화)
# =====================================================================
def worker(task_data, core_api, start_index):
    task = core_api['task']
    is_cron = task_data.get('_is_cron', False)

    type_filters = []
    if task_data.get('type_movie', True): type_filters.append(1)   # 영화
    if task_data.get('type_show', True): type_filters.append(4)    # 에피소드
    if task_data.get('type_music', False): type_filters.append(10) # 음악 트랙
    if task_data.get('type_photo', False): type_filters.append(13) # 사진

    if not type_filters: 
        task.log("최소 1개 이상의 미디어 타입을 선택해주세요.")
        task.update_state('error')
        return

    prefix = "[자동 실행] " if is_cron else ""
    task.log(f"{prefix}통계 추출을 시작합니다.")
    task.update_state('running', progress=0, total=100)

    # 1. 타겟 섹션 목록 획득 및 'all' 방어
    target_sections = task_data.get('target_sections', [])
    sec_query = "SELECT id, name FROM library_sections"
    sec_params = []
    
    if target_sections and 'all' not in target_sections:
        placeholders = ",".join("?" for _ in target_sections)
        sec_query += f" WHERE id IN ({placeholders})"
        sec_params.extend(target_sections)
    
    try: 
        target_libs = core_api['query'](sec_query, tuple(sec_params))
    except Exception as e:
        task.log(f"DB 접근 오류: {str(e)}")
        task.update_state('error')
        return
        
    if not target_libs:
        task.log("조회 대상 라이브러리가 없습니다.")
        task.update_state('completed', progress=100, total=100)
        return

    # 단일 쿼리용 파라미터 준비
    lib_ids_str = ",".join([str(r['id']) for r in target_libs])
    type_ids_str = ",".join([str(t) for t in type_filters])
    base_where = f"WHERE mi.metadata_type IN ({type_ids_str}) AND mi.library_section_id IN ({lib_ids_str})"

    # 전체 집계용 변수 초기화
    res_dict = {"8K":0, "6K":0, "4K":0, "1080p":0, "720p":0, "SD":0}
    total_res_count = 0
    v_codecs, a_codecs = {}, {}
    total_v, total_a = 0, 0
    counts_map = {1:0, 4:0, 10:0, 13:0}
    total_duration, total_size = 0, 0

    try:
        # -----------------------------------------------------------------
        # STEP 1: 미디어 종류별 개수 카운트
        # -----------------------------------------------------------------
        task.update_state('running', progress=20, total=100)
        task.log("미디어 유형별 항목 수를 집계 중입니다...")
        if task.is_cancelled(): return
        
        for row in core_api['query'](f"SELECT metadata_type, COUNT(*) as cnt FROM metadata_items mi {base_where} GROUP BY metadata_type"):
            counts_map[row['metadata_type']] += row['cnt']

        # -----------------------------------------------------------------
        # STEP 2: 전체 용량 및 재생 시간 합산
        # -----------------------------------------------------------------
        task.update_state('running', progress=40, total=100)
        task.log("총 용량 및 재생 시간을 계산 중입니다...")
        if task.is_cancelled(): return
        
        rows_size = core_api['query'](f"SELECT SUM(m.duration) as dur, SUM(mp.size) as sz FROM metadata_items mi JOIN media_items m ON m.metadata_item_id = mi.id JOIN media_parts mp ON mp.media_item_id = m.id {base_where}")
        total_duration += rows_size[0]['dur'] if rows_size and rows_size[0]['dur'] else 0
        total_size += rows_size[0]['sz'] if rows_size and rows_size[0]['sz'] else 0
        
        # -----------------------------------------------------------------
        # STEP 3: 해상도별 비중 그룹화
        # -----------------------------------------------------------------
        task.update_state('running', progress=60, total=100)
        task.log("비디오 해상도 통계를 추출 중입니다...")
        if task.is_cancelled(): return
        
        for row in core_api['query'](f"SELECT m.width, COUNT(*) as cnt FROM metadata_items mi JOIN media_items m ON m.metadata_item_id = mi.id {base_where} AND m.width IS NOT NULL AND m.width > 0 GROUP BY m.width"):
            w, c = row['width'], row['cnt']
            total_res_count += c
            if w >= 7000: res_dict["8K"] += c
            elif w >= 5000: res_dict["6K"] += c
            elif w >= 3400: res_dict["4K"] += c
            elif w >= 1900: res_dict["1080p"] += c
            elif w >= 1200: res_dict["720p"] += c
            else: res_dict["SD"] += c
            
        # -----------------------------------------------------------------
        # STEP 4: 오디오/비디오 코덱 그룹화
        # -----------------------------------------------------------------
        task.update_state('running', progress=80, total=100)
        task.log("코덱 통계를 분석 중입니다...")
        if task.is_cancelled(): return
        
        for row in core_api['query'](f"SELECT ms.stream_type_id, ms.codec, COUNT(*) as cnt FROM metadata_items mi JOIN media_items m ON m.metadata_item_id = mi.id JOIN media_streams ms ON ms.media_item_id = m.id {base_where} AND ms.codec != '' AND ms.codec IS NOT NULL GROUP BY ms.stream_type_id, ms.codec"):
            c_name, cnt = str(row['codec']).upper(), row['cnt']
            if row['stream_type_id'] == 1: 
                v_codecs[c_name] = v_codecs.get(c_name, 0) + cnt
                total_v += cnt
            elif row['stream_type_id'] == 2: 
                a_codecs[c_name] = a_codecs.get(c_name, 0) + cnt
                total_a += cnt

        task.update_state('running', progress=90, total=100)
        task.log("데이터 추출 완료. 대시보드 UI를 구성합니다...")
        
        movie_count, episode_count = counts_map[1], counts_map[4]
        music_count, photo_count = counts_map[10], counts_map[13]

        if is_cron:
            tool_vars = {
                "movie_count": f"{movie_count:,}",
                "episode_count": f"{episode_count:,}",
                "music_count": f"{music_count:,}",
                "photo_count": f"{photo_count:,}",
                "total_size": format_size(total_size),
                "total_duration": format_duration(total_duration)
            }
            core_api['notify']("라이브러리 통계", DEFAULT_DISCORD_TEMPLATE, "#2f96b4", tool_vars)
            
    except Exception as e:
        task.log(f"DB 통계 추출 오류: {str(e)}")
        task.update_state('error')
        return

    # =========================================================================
    # [프론트엔드 반환 포맷: Dashboard Schema]
    # JS 프론트엔드가 이 JSON 규격을 읽어 예쁜 카드와 막대 그래프를 그려줍니다.
    # =========================================================================
    resolution_data = [{"label": k, "count": f"{v:,} 개", "percent": round((v / total_res_count) * 100, 1)} for k, v in res_dict.items() if v > 0]
    resolution_data.sort(key=lambda x: x['percent'], reverse=True) 
    
    video_codec_data = [{"label": k, "count": f"{v:,} 개", "percent": round((v / total_v) * 100, 1) if total_v else 0} for k, v in sorted(v_codecs.items(), key=lambda x: x[1], reverse=True)[:6]]
    audio_codec_data = [{"label": k, "count": f"{v:,} 개", "percent": round((v / total_a) * 100, 1) if total_a else 0} for k, v in sorted(a_codecs.items(), key=lambda x: x[1], reverse=True)[:6]]

    # 1. 요약 카드 동적 생성
    cards = []
    if 1 in type_filters: cards.append({"label": "영화 컨텐츠", "value": f"{movie_count:,} 편", "icon": "fas fa-film", "color": "#e5a00d"})
    if 4 in type_filters: cards.append({"label": "TV 에피소드", "value": f"{episode_count:,} 화", "icon": "fas fa-tv", "color": "#2f96b4"})
    if 10 in type_filters: cards.append({"label": "음악 트랙", "value": f"{music_count:,} 곡", "icon": "fas fa-music", "color": "#9c27b0"})
    if 13 in type_filters: cards.append({"label": "사진/기타", "value": f"{photo_count:,} 장", "icon": "fas fa-image", "color": "#607d8b"})
    
    cards.append({"label": "총 소모 용량", "value": format_size(total_size), "icon": "fas fa-hdd", "color": "#51a351"})
    
    # 음악이나 영상을 선택해서 재생 시간이 존재할 경우에만 표시
    if total_duration > 0: cards.append({"label": "총 재생 시간", "value": format_duration(total_duration), "icon": "fas fa-clock", "color": "#bd362f"})

    # 2. 그래프 동적 생성 (데이터가 있는 경우에만 차트 렌더링)
    charts = []
    if resolution_data: charts.append({"title": "<i class='fas fa-tv'></i> 비디오 해상도 비율", "color": "#e5a00d", "items": resolution_data})
    if video_codec_data: charts.append({"title": "<i class='fas fa-video'></i> 주요 비디오 코덱", "color": "#2f96b4", "items": video_codec_data})
    if audio_codec_data: charts.append({"title": "<i class='fas fa-music'></i> 주요 오디오 코덱", "color": "#51a351", "items": audio_codec_data})

    res_payload = {
        "status": "success", "type": "dashboard",  
        "summary_cards": cards, "bar_charts": charts,
        "action_button": {"label": "<i class='fas fa-sync'></i> 다시 집계하기", "payload": {"action_type": "execute"}}
    }
    
    core_api['cache'].save(res_payload)
    task.update_state('completed', progress=100, total=100)
    task.log("모든 집계가 끝났습니다. 화면을 갱신합니다.")
