# -*- coding: utf-8 -*-
"""
====================================================================================
 [PMH Tool Reference Template] - 라이브러리 통계 분석 (즉시 반환형 대시보드)
====================================================================================

 이 파일은 PMH(Plex Meta Helper) 커스텀 툴 중 '대시보드(Dashboard)' 형식을 
 개발하기 위한 교과서/레퍼런스 파일입니다.

 1. [대시보드형 툴의 특징]
    - 데이터테이블(Datatable)처럼 백그라운드 워커(Worker) 스레드를 돌리지 않습니다.
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
# 1. UI 스키마 정의 (프론트엔드 렌더링용)
# =====================================================================
def get_ui(core_api):
    sections = [{"value": "all", "text": "전체 라이브러리 (All)"}]
    
    try:
        # [Reference] DB 쿼리를 이용해 UI 콤보박스 동적 생성하기
        rows = core_api['query']("SELECT id, name FROM library_sections ORDER BY name")
        for r in rows:
            sections.append({"value": str(r['id']), "text": r['name']})
    except Exception: 
        pass

    return {
        "title": "라이브러리 종합 통계 분석",
        "description": "선택한 라이브러리의 방대한 메타 데이터를 분석하여 요약 대시보드를 생성합니다.<br>원하는 미디어 종류만 선택하여 분석할 수 있습니다.",
        "inputs": [
            {"id": "target_section", "type": "select", "label": "분석할 라이브러리 섹션", "options": sections},
            
            # 미디어 종류를 선택할 수 있는 체크박스 그룹
            {"id": "media_types", "type": "checkbox_group", "label": "분석 대상 미디어 (실제 파일 단위)", "options": [
                {"id": "type_movie", "label": "영화 (Movies)", "default": True},
                {"id": "type_show", "label": "TV 쇼 (Episodes)", "default": True},
                {"id": "type_music", "label": "음악 (Audio Tracks)", "default": False},
                {"id": "type_photo", "label": "사진 및 기타 (Photos)", "default": False}
            ]}
        ],
        "button_text": "통계 추출 시작"
    }

# =====================================================================
# 2. 메인 실행 및 데이터 추출 로직
# =====================================================================
def run(data, core_api):
    action = data.get('action_type', 'preview')
    
    # [방어 로직] 대시보드 툴은 페이징(page)을 사용하지 않습니다.
    if action == 'page': 
        return {"status": "error", "message": "대시보드 툴은 페이징을 지원하지 않습니다."}, 400

    section_id = data.get('target_section', 'all')
    
    # 체크박스 값에 따라 Plex 내부 metadata_type(ID) 리스트 생성
    type_filters = []
    if data.get('type_movie', True): type_filters.append(1)   # 영화
    if data.get('type_show', True): type_filters.append(4)    # 에피소드
    if data.get('type_music', False): type_filters.append(10) # 음악 트랙
    if data.get('type_photo', False): type_filters.append(13) # 사진

    # [Reference] 파라미터 바인딩을 위한 준비 (SQL 인젝션 방지)
    type_placeholders = ",".join("?" for _ in type_filters)
    where_clause = f"WHERE mi.metadata_type IN ({type_placeholders})"
    params = list(type_filters) # 리스트 복사
    
    if section_id != "all":
        where_clause += " AND mi.library_section_id = ?"
        params.append(section_id)

    # 대시보드 응답에 포함시켜 화면에 뿌려줄 로그 배열
    logs = []
    def record_log(msg):
        logs.append(msg)
        print(f"[LibraryStats] {msg}")

    record_log(f"통계 추출을 시작합니다. (대상 섹션: {section_id})")

    # 대시보드 UI에 넘겨줄 결과 배열들
    resolution_data = []
    video_codec_data = []
    audio_codec_data = []

    try:
        # -------------------------------------------------------------
        # [Reference] DB 쿼리 예시 1: COUNT 등 집계 함수 사용
        # 집계 함수를 쓸 때는 AS 키워드로 별칭(Alias)을 주어야 파이썬 dict 키로 쓰기 편합니다.
        # -------------------------------------------------------------
        # [데이터 집계 1] 미디어 타입별 카운트
        record_log("1. 미디어 종류별 개수 집계 중...")
        q_count = f"SELECT metadata_type, COUNT(*) as cnt FROM metadata_items mi {where_clause} GROUP BY metadata_type"
        rows_count = core_api['query'](q_count, tuple(params))
        
        counts = {row['metadata_type']: row['cnt'] for row in rows_count}
        movie_count = counts.get(1, 0)
        episode_count = counts.get(4, 0)
        music_count = counts.get(10, 0)
        photo_count = counts.get(13, 0)

        # [데이터 집계 2] 용량 및 재생 시간 (사진 등은 duration이 null일 수 있음)
        record_log("2. 총 소모 용량 및 재생 시간 분석 중...")
        q_size = f"""
            SELECT SUM(m.duration) as dur, SUM(mp.size) as sz
            FROM metadata_items mi
            JOIN media_items m ON m.metadata_item_id = mi.id
            JOIN media_parts mp ON mp.media_item_id = m.id
            {where_clause}
        """
        rows_size = core_api['query'](q_size, tuple(params))
        total_duration = rows_size[0]['dur'] if rows_size and rows_size[0]['dur'] else 0
        total_size = rows_size[0]['sz'] if rows_size and rows_size[0]['sz'] else 0

        # -------------------------------------------------------------
        # [Reference] DB 쿼리 예시 2: 그룹화(GROUP BY) 및 백엔드 데이터 가공
        # -------------------------------------------------------------
        record_log("3. 비디오 해상도 데이터 분석 중...")
        q_res = f"""
            SELECT m.width, COUNT(*) as cnt
            FROM metadata_items mi
            JOIN media_items m ON m.metadata_item_id = mi.id
            {where_clause} AND m.width IS NOT NULL AND m.width > 0
            GROUP BY m.width
        """
        rows_res = core_api['query'](q_res, tuple(params))
        
        # Plex DB의 width(가로 픽셀) 값을 기준으로 일반적인 해상도 규격으로 합산
        res_dict = {"8K":0, "6K":0, "4K":0, "1080p":0, "720p":0, "SD":0}
        total_res_count = 0
        for row in rows_res:
            w = row['width']
            c = row['cnt']
            total_res_count += c
            if w >= 7000: res_dict["8K"] += c
            elif w >= 5000: res_dict["6K"] += c
            elif w >= 3400: res_dict["4K"] += c
            elif w >= 1900: res_dict["1080p"] += c
            elif w >= 1200: res_dict["720p"] += c
            else: res_dict["SD"] += c
        
        for k, v in res_dict.items():
            if v > 0:
                pct = round((v / total_res_count) * 100, 1) if total_res_count else 0
                resolution_data.append({"label": k, "count": f"{v:,} 개", "percent": pct})
        resolution_data.sort(key=lambda x: x['percent'], reverse=True) 

        # [데이터 집계 4] 코덱 점유율 (비디오/오디오/음악 모두 포함)
        record_log("4. 비디오 및 오디오 코덱 점유율 분석 중...")
        q_codec = f"""
            SELECT ms.stream_type_id, ms.codec, COUNT(*) as cnt
            FROM metadata_items mi
            JOIN media_items m ON m.metadata_item_id = mi.id
            JOIN media_streams ms ON ms.media_item_id = m.id
            {where_clause} AND ms.codec != '' AND ms.codec IS NOT NULL
            GROUP BY ms.stream_type_id, ms.codec
        """
        rows_codec = core_api['query'](q_codec, tuple(params))
        
        v_codecs, a_codecs = {}, {}
        total_v, total_a = 0, 0
        for row in rows_codec:
            codec = row['codec']
            if not codec: continue
            c_name = str(codec).upper()
            cnt = row['cnt']
            
            if row['stream_type_id'] == 1: # Video
                v_codecs[c_name] = v_codecs.get(c_name, 0) + cnt
                total_v += cnt
            elif row['stream_type_id'] == 2: # Audio (영화, 에피소드, 음악 트랙 모두 포함)
                a_codecs[c_name] = a_codecs.get(c_name, 0) + cnt
                total_a += cnt
                
        # 점유율 상위 6개 코덱만 추출 (백분율 계산 포함)
        for k, v in sorted(v_codecs.items(), key=lambda x: x[1], reverse=True)[:6]:
            pct = round((v / total_v) * 100, 1) if total_v else 0
            video_codec_data.append({"label": k, "count": f"{v:,} 개", "percent": pct})
            
        for k, v in sorted(a_codecs.items(), key=lambda x: x[1], reverse=True)[:6]:
            pct = round((v / total_a) * 100, 1) if total_a else 0
            audio_codec_data.append({"label": k, "count": f"{v:,} 개", "percent": pct})

        record_log("모든 통계 추출 및 연산이 완료되었습니다.")
        
    except Exception as e:
        error_msg = f"DB 통계 추출 오류: {str(e)}"
        record_log(error_msg)
        return {"status": "error", "message": error_msg}, 500
        
    # =========================================================================
    # [프론트엔드 반환 포맷: Dashboard Schema]
    # JS 프론트엔드가 이 JSON 규격을 읽어 예쁜 카드와 막대 그래프를 그려줍니다.
    # =========================================================================
    # 1. 요약 카드 동적 생성
    cards = []
    if 1 in type_filters: cards.append({"label": "영화 컨텐츠", "value": f"{movie_count:,} 편", "icon": "fas fa-film", "color": "#e5a00d"})
    if 4 in type_filters: cards.append({"label": "TV 에피소드", "value": f"{episode_count:,} 화", "icon": "fas fa-tv", "color": "#2f96b4"})
    if 10 in type_filters: cards.append({"label": "음악 트랙", "value": f"{music_count:,} 곡", "icon": "fas fa-music", "color": "#9c27b0"})
    if 13 in type_filters: cards.append({"label": "사진/기타", "value": f"{photo_count:,} 장", "icon": "fas fa-image", "color": "#607d8b"})
    
    cards.append({"label": "총 소모 용량", "value": format_size(total_size), "icon": "fas fa-hdd", "color": "#51a351"})
    
    # 음악이나 영상을 선택해서 재생 시간이 존재할 경우에만 표시
    if total_duration > 0:
        cards.append({"label": "총 재생 시간", "value": format_duration(total_duration), "icon": "fas fa-clock", "color": "#bd362f"})

    # 2. 그래프 동적 생성 (데이터가 있는 경우에만 차트 렌더링)
    charts = []
    if resolution_data:
        charts.append({"title": "<i class='fas fa-tv'></i> 비디오 해상도 비율", "color": "#e5a00d", "items": resolution_data})
    if video_codec_data:
        charts.append({"title": "<i class='fas fa-video'></i> 주요 비디오 코덱", "color": "#2f96b4", "items": video_codec_data})
    if audio_codec_data:
        charts.append({"title": "<i class='fas fa-music'></i> 주요 오디오 코덱", "color": "#51a351", "items": audio_codec_data})

    return {
        "status": "success",
        "type": "dashboard",  
        "summary_cards": cards,
        "bar_charts": charts,
        "logs": logs
    }, 200
