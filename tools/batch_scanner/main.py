# -*- coding: utf-8 -*-
"""
[PMH Tool Reference Template] - 배치 스캐너 (코어 관리형)

* PMH Tool 아키텍처 핵심 가이드:
1. 클라이언트(JS)는 단순히 명령만 내리고 화면(UI)만 그리는 '뷰어' 역할을 합니다.
2. 서버 코어(pmh_core.py)가 작업 목록, 진행률, 로그, 스레드 관리를 모두 대행합니다.
3. 툴 개발자는 3개의 필수 함수(get_ui, run, worker)만 구현하면 됩니다.
"""

import time
import os
import re

def natural_sort_key(s):
    """문자열 내의 숫자를 인식하여 자연스럽게 정렬 (예: 1화, 2화)"""
    return [int(text) if text.isdigit() else text.lower() for text in re.split(r'(\d+)', str(s))]

# =====================================================================
# 1. PMH Tool 표준 인터페이스 (UI 스키마)
# =====================================================================
def get_ui(core_api):
    """
    클라이언트가 툴을 클릭했을 때 그려질 UI 형태(JSON)를 반환합니다.
    ※ 코어가 기존 작업 내역(이어서 실행 여부)을 자동으로 병합하여 클라이언트에 보냅니다.
    """
    sections = [{"value": "all", "text": "전체 라이브러리 (All)"}]
    try:
        rows = core_api['query']("SELECT id, name FROM library_sections ORDER BY name")
        for r in rows: sections.append({"value": str(r['id']), "text": r['name']})
    except: pass

    return {
        "title": "배치 스캐너",
        "description": "대상 항목을 안전한 속도로 순차 처리합니다.<br>서버 코어 시스템에 의해 브라우저를 닫아도 언제든 <strong>이어서 실행</strong>할 수 있습니다.",
        "inputs": [
            {"id": "target_section", "type": "select", "label": "작업 대상 섹션", "options": sections},
            {"id": "mode", "type": "select", "label": "작업 모드", "options": [
                {"value": "refresh", "text": "메타데이터 새로고침"},
                {"value": "rematch", "text": "메타 다시 매칭 (Fix Match)"},
                {"value": "analyze", "text": "미분석 항목 강제 분석 (Analyze)"}
            ]},
            {"id": "sleep_time", "type": "select", "label": "항목간 대기 시간 (초)", "options": [
                {"value": "1", "text": "1초 (빠름)"},
                {"value": "2", "text": "2초 (권장)"},
                {"value": "5", "text": "5초 (안전)"}
            ]},
            {"id": "target_agent", "type": "text", "label": "에이전트 필터", "placeholder": "예: tv.plex.agents.movie (입력 에이전트는 무시함)"}
        ],
        "button_text": "대상 목록 조회"
    }

# =====================================================================
# 2. 데이터 추출 비즈니스 로직
# =====================================================================
def get_target_items(req_data, core_api):
    section_id = req_data.get('target_section')
    mode = req_data.get('mode', 'refresh')
    target_agent = req_data.get('target_agent', '').strip()
    items = []
    
    select_clause = """
        SELECT mi.id, mi.title, mi.guid, mp.file, mi.metadata_type,
               (SELECT title FROM metadata_items WHERE id = (SELECT parent_id FROM metadata_items WHERE id = mi.parent_id)) as show_title,
               (SELECT year FROM metadata_items WHERE id = (SELECT parent_id FROM metadata_items WHERE id = mi.parent_id)) as show_year,
               (SELECT "index" FROM metadata_items WHERE id = mi.parent_id) as season_index,
               mi."index" as episode_index
        FROM metadata_items mi
        LEFT JOIN media_items m ON m.metadata_item_id = mi.id
        LEFT JOIN media_parts mp ON mp.media_item_id = m.id
    """

    if mode in ['refresh', 'rematch']:
        query = select_clause + " WHERE mi.metadata_type IN (1, 2)"
        params = []
        if section_id and str(section_id).lower() != 'all':
            query += " AND mi.library_section_id = ?"
            params.append(section_id)
        query += " GROUP BY mi.id"
        rows = core_api['query'](query, tuple(params))

    elif mode == 'analyze':
        query = select_clause + """
            WHERE mi.metadata_type IN (1, 4)
              AND (m.width IS NULL OR m.width = 0 OR m.bitrate IS NULL)
              AND mp.file IS NOT NULL
        """
        params = []
        if section_id and str(section_id).lower() != 'all':
            query += " AND mi.library_section_id = ?"
            params.append(section_id)
        query += " GROUP BY mi.id"
        rows = core_api['query'](query, tuple(params))

    for r in rows:
        clean_guid = '-'
        if r.get('guid'):
            clean_guid = r['guid'].replace("com.plexapp.agents.", "", 1) if r['guid'].startswith("com.plexapp.agents.") else r['guid']
            if target_agent and clean_guid.startswith(target_agent): continue 

        m_type = r.get('metadata_type')
        if m_type == 4: 
            s_title = r.get('show_title') or "Unknown Show"
            s_year = f" ({r.get('show_year')})" if r.get('show_year') else ""
            s_idx = f"S{int(r.get('season_index')):02d}" if r.get('season_index') is not None else "S01"
            e_idx = f"E{int(r.get('episode_index')):02d}" if r.get('episode_index') is not None else "E01"
            ep_title = r.get('title') or "Episode"
            display_title = f"{s_title}{s_year}/{s_idx}{e_idx}/{ep_title}"
        else:
            display_title = r.get('title') or (os.path.basename(r.get('file', '')) if r.get('file') else "Unknown")

        items.append({'id': r['id'], 'title': display_title, 'guid': clean_guid})

    items.sort(key=lambda x: natural_sort_key(x['title']))
    return items

# =====================================================================
# 3. 메인 라우터 (조회 및 실행 분기)
# =====================================================================
def run(data, core_api):
    """
    JS의 요청(action_type)을 분기 처리합니다. 
    'execute' 요청시 작업을 지시(task_data 반환)하면, 코어가 자동으로 파일 저장 후 스레드를 띄웁니다.
    """
    action = data.get('action_type', 'preview')

    # [조회] UI 렌더링용 데이터 반환
    if action == 'preview':
        items = get_target_items(data, core_api)
        # JS에서 링크를 생성할 때 참조할 수 있도록 rating_key도 함께 포함
        table_data = [{"title": i['title'], "guid": i['guid'], "rating_key": str(i['id'])} for i in items]
        
        action_btn = None
        if len(items) > 0:
            action_btn = {
                "label": f"<i class='fas fa-rocket'></i> 대상 {len(items)}건 새로 작업 시작",
                "payload": {"action_type": "execute"}
            }
            
        return {
            "status": "success",
            "type": "datatable",
            "action_button": action_btn,
            "columns": [
                # type: 'link' 를 추가하면 프론트엔드가 이를 인식해 <a> 태그를 만들어 줌
                {"key": "title", "label": "대상 항목 (제목/파일명)", "width": "70%", "type": "link", "link_key": "rating_key"},
                {"key": "guid", "label": "현재 에이전트 정보", "width": "30%"}
            ],
            "data": table_data
        }, 200

    # [실행] 작업을 구성하여 코어에 넘김 (코어가 파일 작성 & 스레드 처리)
    if action == 'execute':
        items = get_target_items(data, core_api)
        if not items: return {"status": "error", "message": "실행할 대상이 없습니다."}, 400
        
        return {
            "status": "success",
            "type": "async_task",
            "task_data": {  # 이 데이터를 코어가 저장하고, worker 함수의 인자로 전달해줌
                "mode": data.get('mode', 'refresh'),
                "sleep_time": data.get('sleep_time', 2),
                "target_items": items,
                "total": len(items)
            }
        }, 200

    return {"status": "error", "message": "알 수 없는 명령"}, 400

# =====================================================================
# 4. 백그라운드 워커 (실제 툴의 동작부)
# =====================================================================
def worker(task_data, core_api, start_index):
    """
    코어가 백그라운드 스레드에서 실행시켜주는 메인 함수입니다.
    `core_api['task']` 객체를 통해 진행률, 로그, 취소 상태를 제어할 수 있습니다.
    """
    task = core_api['task'] # 코어 시스템의 Task Manager
    
    mode = task_data.get('mode', 'refresh')
    sleep_time = int(task_data.get('sleep_time', 2))
    items = task_data.get('target_items', [])
    total_items = task_data.get('total', len(items))

    try:
        plex = core_api['get_plex']()
        if start_index == 0: task.log(f"Plex 연결 완료: {plex.friendlyName}")
    except Exception as e:
        task.update_state('error')
        task.log(f"Plex 연결 실패: {str(e)}")
        return

    if start_index > 0: task.log(f"중단되었던 {start_index}번째 항목부터 이어서 작업을 재개합니다.")
    else: task.log(f"총 {total_items}건 '{mode}' 작업을 시작합니다.")

    # 안정적인 서버 상태 확인 로직
    def wait_until_stable_idle():
        stable_count = 0
        while True:
            if task.is_cancelled(): return False
            try:
                if len(plex.query('/activities').findall('Activity')) == 0:
                    stable_count += 1
                    if stable_count >= 2: return True
                else: 
                    stable_count = 0
            except: pass
            time.sleep(2)

    # 지정된 start_index 위치부터 처리 재개
    for idx, item in enumerate(items[start_index:], start=start_index + 1):
        if task.is_cancelled(): return # 코어에 의해 취소 처리됨

        mid, title = item['id'], item['title']
        task.update_state('running', progress=idx)
        task.log(f"[{idx}/{total_items}] '{title}' 처리 중...")
        
        if not wait_until_stable_idle(): return
        
        try:
            plex_item = plex.fetchItem(mid)
            if mode == 'refresh': plex_item.refresh()
            elif mode == 'rematch':
                matches = plex_item.matches()
                if matches: plex_item.fixMatch(matches[0])
                else: task.log("   -> 매칭 결과 없음")
            elif mode == 'analyze': plex_item.analyze()
        except Exception as e:
            task.log(f"   -> 오류: {e}")
        
        # 항목 간 슬립 (취소 신호를 받으면 즉시 빠져나옴)
        for _ in range(int(sleep_time * 2)):
            if task.is_cancelled(): return
            time.sleep(0.5)

    task.update_state('completed')
    task.log("모든 작업이 성공적으로 완료되었습니다.")
