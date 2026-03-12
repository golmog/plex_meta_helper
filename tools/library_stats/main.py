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
        "title": "라이브러리 통계 분석",
        "description": "선택한 라이브러리의 방대한 메타 데이터를 분석하여 요약 대시보드를 생성합니다.<br>(데이터가 많을 경우 약간의 시간이 소요될 수 있습니다.)",
        "inputs": [
            # 위에서 동적으로 만든 sections 리스트를 옵션으로 주입
            {"id": "target_section", "type": "select", "label": "분석할 라이브러리 섹션", "options": sections}
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
    
    # [Reference] 파라미터 바인딩을 위한 준비 (SQL 인젝션 방지)
    where_clause = "WHERE mi.metadata_type IN (1, 4)"
    params = []
    
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
        record_log("1. 영화 및 에피소드 카운트 집계 중...")
        q_count = f"SELECT metadata_type, COUNT(*) as cnt FROM metadata_items mi {where_clause} GROUP BY metadata_type"
        rows_count = core_api['query'](q_count, tuple(params))
        
        counts = {row['metadata_type']: row['cnt'] for row in rows_count}
        movie_count = counts.get(1, 0)     # 영화(1)
        episode_count = counts.get(4, 0)   # 에피소드(4)

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
            {where_clause} AND m.width IS NOT NULL
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

        record_log("4. 비디오 및 오디오 코덱 점유율 분석 중...")
        q_codec = f"""
            SELECT ms.stream_type_id, ms.codec, COUNT(*) as cnt
            FROM metadata_items mi
            JOIN media_items m ON m.metadata_item_id = mi.id
            JOIN media_streams ms ON ms.media_item_id = m.id
            {where_clause} AND ms.codec != ''
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
            
            if row['stream_type_id'] == 1: # Video Stream
                v_codecs[c_name] = v_codecs.get(c_name, 0) + cnt
                total_v += cnt
            elif row['stream_type_id'] == 2: # Audio Stream
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
    return {
        "status": "success",
        
        # [Reference] 핵심: 이 타입을 지정해야 대시보드 UI가 렌더링됩니다.
        "type": "dashboard",  
        
        # 상단 요약 카드 (가로 배치)
        "summary_cards": [
            {"label": "영화 컨텐츠", "value": f"{movie_count:,} 편", "icon": "fas fa-film", "color": "#e5a00d"},
            {"label": "TV 에피소드", "value": f"{episode_count:,} 화", "icon": "fas fa-tv", "color": "#2f96b4"},
            {"label": "총 소모 용량", "value": format_size(total_size), "icon": "fas fa-hdd", "color": "#51a351"},
            {"label": "총 재생 시간", "value": format_duration(total_duration), "icon": "fas fa-clock", "color": "#bd362f"}
        ],
        
        # 하단 프로그레스 바 형태의 차트 (세로 배치)
        "bar_charts": [
            {"title": "<i class='fas fa-tv'></i> 비디오 해상도 비율", "color": "#e5a00d", "items": resolution_data},
            {"title": "<i class='fas fa-video'></i> 주요 비디오 코덱", "color": "#2f96b4", "items": video_codec_data},
            {"title": "<i class='fas fa-music'></i> 주요 오디오 코덱", "color": "#51a351", "items": audio_codec_data}
        ],
        
        # [Reference] 동기식 즉시 반환 툴의 로그 표출을 위해 문자열 배열 전달
        "logs": logs
        
    }, 200
