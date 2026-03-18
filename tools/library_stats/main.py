# -*- coding: utf-8 -*-

# =====================================================================
# 디스코드 알림 기본 템플릿
# =====================================================================
DEFAULT_DISCORD_TEMPLATE = """**📊 라이브러리 요약**

**[🎬 컨텐츠 수량]**
- 영화: {movie_count}
- TV 쇼: {episode_count}
- 음악: {music_count}
- 사진: {photo_count}

**[💾 전체 시스템 요약]**
- 총 소모 용량: {total_size}
- 총 재생 시간: {total_duration}
"""

def format_size(bytes_size):
    """바이트(Bytes)를 사람이 보기 좋은 단위로 변환"""
    if not bytes_size: return "0 B"
    for unit in ['B', 'KB', 'MB', 'GB', 'TB', 'PB']:
        if bytes_size < 1024.0:
            return f"{bytes_size:.1f} {unit}"
        bytes_size /= 1024.0
    return f"{bytes_size:.1f} PB"

def format_duration(ms):
    """밀리초(ms)를 일(Days), 시간(Hours)으로 변환"""
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
        "description": "선택한 라이브러리의 메타 데이터를 분석하여 요약 대시보드를 생성합니다.<br><span style='color:#777; font-size:11px;'>(이 툴은 데이터 변경을 수행하지 않는 조회 전용 툴입니다.)</span>",
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
            
            {"id": "discord_bot_name", "type": "text", "label": "디스코드 봇 이름 오버라이딩", "placeholder": "예: {server_name} 통계 요정"},
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
                 {"key": "tool_id", "desc": "실행된 툴의 고유 ID"},
                 {"key": "server_id", "desc": "실행 대상 서버 식별자 앞 8자리"},
                 {"key": "server_name", "desc": "사용자가 설정한 서버 이름"},
                 {"key": "date", "desc": "현재 날짜 YYYY-MM-DD"},
                 {"key": "time", "desc": "현재 시간 HH:MM:SS"}
             ]}
        ],
        "buttons": [
            {
                "label": "통계 추출 시작", 
                "action_type": "preview", 
                "icon": "fas fa-chart-pie", 
                "color": "#9c27b0"
            }
        ]
    }

# =====================================================================
# 2. 메인 실행 라우터
# =====================================================================
def run(data, core_api):
    action = data.get('action_type', 'preview')

    if action in ['preview', 'execute']:
        task_data = data.copy()
        task_data['_auto_refresh_ui'] = True 
        return {"status": "success", "type": "async_task", "task_data": task_data}, 200

    return {"status": "error", "message": f"지원하지 않는 명령입니다 ({action})"}, 400

# =====================================================================
# 3. 백그라운드 워커 (초고속 인메모리 연산)
# =====================================================================
def worker(task_data, core_api, start_index):
    task = core_api['task']
    is_cron = task_data.get('_is_cron', False)

    type_filters = []
    if task_data.get('type_movie', True): type_filters.append(1)   
    if task_data.get('type_show', True): type_filters.append(4)    
    if task_data.get('type_music', False): type_filters.append(10) 
    if task_data.get('type_photo', False): type_filters.append(13) 

    if not type_filters: 
        task.log("⚠️ 최소 1개 이상의 미디어 타입을 선택해주세요.")
        task.update_state('error'); return

    prefix = "[자동 실행] " if is_cron else ""
    task.log(f"📊 {prefix}통계 추출을 시작합니다.")
    task.update_state('running', progress=0, total=100)

    # 타겟 섹션 필터링
    target_sections = task_data.get('target_sections', [])
    sec_query = "SELECT id FROM library_sections"
    sec_params = []
    
    if target_sections and 'all' not in target_sections:
        placeholders = ",".join("?" for _ in target_sections)
        sec_query += f" WHERE id IN ({placeholders})"
        sec_params.extend(target_sections)
    
    try: 
        target_libs = core_api['query'](sec_query, tuple(sec_params))
        lib_ids_str = ",".join([str(r['id']) for r in target_libs])
    except Exception as e:
        task.log(f"❌ DB 접근 오류: {str(e)}")
        task.update_state('error'); return
        
    if not lib_ids_str:
        task.log("⚠️ 조회 대상 라이브러리가 없습니다.")
        task.update_state('completed', progress=100, total=100); return

    type_ids_str = ",".join([str(t) for t in type_filters])
    base_where = f"WHERE mi.metadata_type IN ({type_ids_str}) AND mi.library_section_id IN ({lib_ids_str})"

    # 전체 집계용 변수 초기화
    counts_map = {1:0, 4:0, 10:0, 13:0}
    total_duration, total_size = 0, 0
    res_dict = {"8K":0, "6K":0, "4K":0, "1080p":0, "720p":0, "SD":0}
    total_res_count = 0
    v_codecs, a_codecs = {}, {}
    total_v, total_a = 0, 0

    try:
        # -----------------------------------------------------------------
        # STEP 1: 개수, 용량, 재생시간, 해상도를 한 번의 쿼리로 긁어와서 파이썬으로 계산 (초고속)
        # -----------------------------------------------------------------
        task.update_state('running', progress=20, total=100)
        task.log("📂 기본 미디어 통계(개수, 용량, 해상도)를 분석 중입니다...")
        
        q_basic = f"""
            SELECT mi.metadata_type, m.duration, mp.size, m.width
            FROM metadata_items mi 
            LEFT JOIN media_items m ON m.metadata_item_id = mi.id 
            LEFT JOIN media_parts mp ON mp.media_item_id = m.id 
            {base_where}
        """
        
        for row in core_api['query'](q_basic):
            if task.is_cancelled(): return
            
            m_type = row['metadata_type']
            if m_type in counts_map: counts_map[m_type] += 1
            
            if row['duration']: total_duration += row['duration']
            if row['size']: total_size += row['size']
            
            w = row['width']
            if w and w > 0:
                total_res_count += 1
                if w >= 7000: res_dict["8K"] += 1
                elif w >= 5000: res_dict["6K"] += 1
                elif w >= 3400: res_dict["4K"] += 1
                elif w >= 1900: res_dict["1080p"] += 1
                elif w >= 1200: res_dict["720p"] += 1
                else: res_dict["SD"] += 1

        # -----------------------------------------------------------------
        # STEP 2: 오디오/비디오 코덱 추출 (별도 테이블 JOIN)
        # -----------------------------------------------------------------
        task.update_state('running', progress=60, total=100)
        task.log("🎵 스트림 코덱 통계를 분석 중입니다...")
        
        q_codec = f"""
            SELECT ms.stream_type_id, ms.codec, COUNT(*) as cnt 
            FROM metadata_items mi 
            JOIN media_items m ON m.metadata_item_id = mi.id 
            JOIN media_streams ms ON ms.media_item_id = m.id 
            {base_where} AND ms.codec != '' AND ms.codec IS NOT NULL 
            GROUP BY ms.stream_type_id, ms.codec
        """
        
        for row in core_api['query'](q_codec):
            if task.is_cancelled(): return
            
            c_name, cnt = str(row['codec']).upper(), row['cnt']
            s_type = row['stream_type_id']
            if s_type == 1: 
                v_codecs[c_name] = v_codecs.get(c_name, 0) + cnt
                total_v += cnt
            elif s_type == 2: 
                a_codecs[c_name] = a_codecs.get(c_name, 0) + cnt
                total_a += cnt

        task.update_state('running', progress=90, total=100)
        task.log("✅ 데이터 추출 완료. 대시보드 UI를 구성합니다...")
        
        movie_count, episode_count = counts_map[1], counts_map[4]
        music_count, photo_count = counts_map[10], counts_map[13]

        if is_cron:
            tool_vars = {
                "movie_count": f"{movie_count:,} 편" if movie_count else "0 편",
                "episode_count": f"{episode_count:,} 화" if episode_count else "0 화",
                "music_count": f"{music_count:,} 곡" if music_count else "0 곡",
                "photo_count": f"{photo_count:,} 장" if photo_count else "0 장",
                "total_size": format_size(total_size),
                "total_duration": format_duration(total_duration)
            }
            core_api['notify']("라이브러리 통계 완료", DEFAULT_DISCORD_TEMPLATE, "#2f96b4", tool_vars)
            
    except Exception as e:
        task.log(f"❌ DB 통계 추출 오류: {str(e)}")
        task.update_state('error'); return

    # =========================================================================
    # [프론트엔드 반환 포맷: Dashboard Schema]
    # =========================================================================
    resolution_data = [{"label": k, "count": f"{v:,} 개", "percent": round((v / total_res_count) * 100, 1)} for k, v in res_dict.items() if v > 0]
    resolution_data.sort(key=lambda x: float(x['percent']), reverse=True) 
    
    video_codec_data = [{"label": k, "count": f"{v:,} 개", "percent": round((v / total_v) * 100, 1)} for k, v in sorted(v_codecs.items(), key=lambda x: x[1], reverse=True)[:6]]
    audio_codec_data = [{"label": k, "count": f"{v:,} 개", "percent": round((v / total_a) * 100, 1)} for k, v in sorted(a_codecs.items(), key=lambda x: x[1], reverse=True)[:6]]

    # 1. 요약 카드 동적 생성
    cards = []
    if 1 in type_filters: cards.append({"label": "영화 컨텐츠", "value": f"{movie_count:,} 편", "icon": "fas fa-film", "color": "#e5a00d"})
    if 4 in type_filters: cards.append({"label": "TV 에피소드", "value": f"{episode_count:,} 화", "icon": "fas fa-tv", "color": "#2f96b4"})
    if 10 in type_filters: cards.append({"label": "음악 트랙", "value": f"{music_count:,} 곡", "icon": "fas fa-music", "color": "#9c27b0"})
    if 13 in type_filters: cards.append({"label": "사진/기타", "value": f"{photo_count:,} 장", "icon": "fas fa-image", "color": "#607d8b"})
    
    cards.append({"label": "총 소모 용량", "value": format_size(total_size), "icon": "fas fa-hdd", "color": "#51a351"})
    if total_duration > 0: cards.append({"label": "총 재생 시간", "value": format_duration(total_duration), "icon": "fas fa-clock", "color": "#bd362f"})

    # 2. 그래프 동적 생성
    charts = []
    if resolution_data: charts.append({"title": "<i class='fas fa-tv'></i> 비디오 해상도 비율", "color": "#e5a00d", "items": resolution_data})
    if video_codec_data: charts.append({"title": "<i class='fas fa-video'></i> 주요 비디오 코덱", "color": "#2f96b4", "items": video_codec_data})
    if audio_codec_data: charts.append({"title": "<i class='fas fa-music'></i> 주요 오디오 코덱", "color": "#51a351", "items": audio_codec_data})

    res_payload = {
        "status": "success", 
        "type": "dashboard",  
        "summary_cards": cards, 
        "bar_charts": charts,
        "action_button": {
            "label": "<i class='fas fa-sync'></i> 다시 집계하기", 
            "payload": {"action_type": "preview"}
        }
    }
    
    core_api['cache'].save(res_payload)
    task.update_state('completed', progress=100, total=100)
    task.log("✅ 모든 통계 추출이 완료되었습니다.")
