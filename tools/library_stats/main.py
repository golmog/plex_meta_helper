# -*- coding: utf-8 -*-
"""
[PMH Tool Reference Template] - 라이브러리 통계 분석기 (즉시 반환형 대시보드)

* PMH Tool 아키텍처 핵심 가이드 (대시보드형):
1. 이 툴은 긴 시간이 걸리는 백그라운드 작업(worker)이 필요 없습니다.
2. 유저가 '조회'를 누르면 DB를 분석한 뒤, 그 결과를 즉시 대시보드 UI 포맷으로 반환합니다.
3. 보안 및 안정성을 위해 sqlite3를 직접 import 하지 않고, 코어가 제공하는 `core_api['query']`를 사용합니다.
4. `core_api['query']`의 반환값은 항상 각 컬럼명을 Key로 가지는 딕셔너리(dict) 배열입니다. (예: [{'id': 1, 'name': '영화'}])
"""

def format_size(bytes_size):
    """바이트(Bytes)를 사람이 보기 좋은 단위(KB, MB, GB...)로 변환하는 유틸리티 함수"""
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
# 1. PMH Tool 표준 인터페이스 (UI 스키마)
# =====================================================================
def get_ui(core_api):
    """
    클라이언트(JS)가 툴 창을 열 때 호출되어 화면 UI(폼)를 구성합니다.
    """
    sections = [{"value": "all", "text": "전체 라이브러리 (All)"}]
    
    try:
        # [Reference] DB 쿼리를 이용해 UI 콤보박스 동적 생성하기
        # 라이브러리 섹션 목록을 가져와서 Select Option으로 만듭니다.
        rows = core_api['query']("SELECT id, name FROM library_sections ORDER BY name")
        for r in rows:
            sections.append({"value": str(r['id']), "text": r['name']})
    except Exception: 
        pass

    return {
        "title": "라이브러리 통계 분석기",
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
    """
    유저가 '통계 추출 시작' 버튼을 눌렀을 때 호출됩니다.
    """
    # -----------------------------------------------------------------
    # [방어 로직] 대시보드 툴은 페이징(page)을 사용하지 않습니다.
    # 코어가 전체 JSON 캐시를 통째로 반환해주므로, 여기로 page 요청이 들어올 일은 없지만
    # 만약을 대비한 예외 처리입니다.
    # -----------------------------------------------------------------
    action = data.get('action_type', 'preview')
    if action == 'page': 
        return {"status": "error", "message": "대시보드 툴은 페이징을 지원하지 않습니다."}, 400

    section_id = data.get('target_section', 'all')
    
    # 쿼리에 삽입할 섹션 필터 조건
    sec_filter = "" if section_id == "all" else f"AND mi.library_section_id = {section_id}"
    
    # 코어 로깅 시스템 사용
    task = core_api['task']
    task.log(f"통계 추출 시작 (대상 섹션: {section_id})")

    # 대시보드 UI에 넘겨줄 결과 배열들
    resolution_data = []
    video_codec_data = []
    audio_codec_data = []

    try:
        # -------------------------------------------------------------
        # [Reference] DB 쿼리 예시 1: COUNT, SUM 등 집계 함수 사용
        # 집계 함수를 쓸 때는 AS 키워드로 별칭(Alias)을 주어야 파이썬에서 dict 키로 꺼내쓰기 편합니다.
        # -------------------------------------------------------------
        task.log("[StatAnalyzer] 1. 카운트 집계 중...")
        rows1 = core_api['query'](f"SELECT metadata_type, COUNT(*) as cnt FROM metadata_items mi WHERE metadata_type IN (1, 4) {sec_filter} GROUP BY metadata_type")
        counts = {row['metadata_type']: row['cnt'] for row in rows1}
        movie_count = counts.get(1, 0)     # 영화(1)
        episode_count = counts.get(4, 0)   # 에피소드(4)

        print("[StatAnalyzer] 2. 용량 및 재생 시간 분석 중...")
        rows2 = core_api['query'](f"""
            SELECT SUM(m.duration) as dur, SUM(mp.size) as sz
            FROM metadata_items mi
            JOIN media_items m ON m.metadata_item_id = mi.id
            JOIN media_parts mp ON mp.media_item_id = m.id
            WHERE mi.metadata_type IN (1, 4) {sec_filter}
        """)
        total_duration = rows2[0]['dur'] if rows2 and rows2[0]['dur'] else 0
        total_size = rows2[0]['sz'] if rows2 and rows2[0]['sz'] else 0

        # -------------------------------------------------------------
        # [Reference] DB 쿼리 예시 2: 그룹화(GROUP BY) 및 백엔드 데이터 가공
        # -------------------------------------------------------------
        print("[StatAnalyzer] 3. 해상도 데이터 분석 중...")
        rows3 = core_api['query'](f"""
            SELECT m.width, COUNT(*) as cnt
            FROM metadata_items mi
            JOIN media_items m ON m.metadata_item_id = mi.id
            WHERE mi.metadata_type IN (1, 4) AND m.width IS NOT NULL {sec_filter}
            GROUP BY m.width
        """)
        
        # Plex DB의 width(가로픽셀) 값을 기준으로 일반적인 해상도 규격으로 변환 및 합산
        res_dict = {"8K":0, "6K":0, "4K":0, "1080p":0, "720p":0, "SD":0}
        total_res_count = 0
        for row in rows3:
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
                resolution_data.append({"label": k, "count": v, "percent": pct})
        resolution_data.sort(key=lambda x: x['count'], reverse=True) 

        print("[StatAnalyzer] 4. 코덱 데이터 분석 중...")
        rows4 = core_api['query'](f"""
            SELECT ms.stream_type_id, ms.codec, COUNT(*) as cnt
            FROM metadata_items mi
            JOIN media_items m ON m.metadata_item_id = mi.id
            JOIN media_streams ms ON ms.media_item_id = m.id
            WHERE mi.metadata_type IN (1, 4) AND ms.codec != '' {sec_filter}
            GROUP BY ms.stream_type_id, ms.codec
        """)
        
        v_codecs, a_codecs = {}, {}
        total_v, total_a = 0, 0
        for row in rows4:
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
            video_codec_data.append({"label": k, "count": v, "percent": pct})
            
        for k, v in sorted(a_codecs.items(), key=lambda x: x[1], reverse=True)[:6]:
            pct = round((v / total_a) * 100, 1) if total_a else 0
            audio_codec_data.append({"label": k, "count": v, "percent": pct})

        print("[StatAnalyzer] 통계 분석 완료. 결과 전송.\n")
        
    except Exception as e:
        print(f"[StatAnalyzer] 오류 발생: {str(e)}")
        return {"status": "error", "message": f"DB 통계 추출 오류: {str(e)}"}, 500
        
    # =========================================================================
    # [프론트엔드 반환 포맷: Dashboard Schema]
    # JS 프론트엔드가 이 JSON 규격을 읽어 예쁜 카드와 막대 그래프를 그려줍니다.
    # =========================================================================
    return {
        "status": "success",
        "type": "dashboard",  # 핵심: 이 타입을 지정해야 대시보드 UI가 렌더링됩니다.
        
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
        ]
    }, 200
