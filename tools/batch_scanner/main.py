# -*- coding: utf-8 -*-
"""
====================================================================================
 [PMH Tool Reference Template] - 배치 스캐너
====================================================================================

 이 파일은 PMH(Plex Meta Helper) 커스텀 툴 중 '비동기 워커'와 '이어서 실행(Resume)'
 기능을 개발하기 위한 교과서/레퍼런스 파일입니다.

 1. [비동기 워커(Worker)와 이어서 실행]
    - 프론트엔드가 'execute' 명령을 보내면, 코어는 `task_data`를 로컬 DB에 저장하고
      `worker` 함수를 별도의 스레드로 실행시킵니다.
    - 서버가 꺼지거나 사용자가 작업을 중단하더라도, 프론트엔드에서 [이어서 계속하기]를
      누르면 코어는 저장해둔 `task_data`와 `progress`(마지막 성공 인덱스)를 읽어와 
      `worker(..., start_index)` 로 작업을 재개합니다.
    - 툴 개발자는 `for idx, item in enumerate(items[start_index:], start=start_index + 1):`
      처럼 `start_index`부터 루프가 돌도록 작성하기만 하면 됩니다.

 2. [안전한 자연 정렬 (Natural Sort)]
    - 파이썬3 에서는 숫자(int)와 문자(str)가 섞인 리스트를 `sort()`하면 TypeError가 발생합니다.
    - 따라서 숫자를 `zfill(10)`으로 0 패딩 문자열로 만들어 일관되게 정렬해야 합니다.

 3. [취소(Cancel) 감지]
    - 루프 중간중간에 `if task.is_cancelled(): return` 을 삽입하여,
      유저가 화면에서 [작업 중단]을 눌렀을 때 즉시 스레드가 종료되도록 해야 합니다.
====================================================================================
"""

import time
import os
import re

def natural_sort_key_local(s):
    """문자열 내의 숫자를 인식하여 자연스럽게 정렬 (예: 1화 -> 0000000001화)"""
    return [text.zfill(10) if text.isdigit() else text.lower() for text in re.split(r'(\d+)', str(s))]

# =====================================================================
# 1. PMH Tool 표준 인터페이스 (UI 스키마)
# =====================================================================
def get_ui(core_api):
    sections = [{"value": "all", "text": "전체 라이브러리 (All)"}]
    try:
        rows = core_api['query']("SELECT id, name FROM library_sections ORDER BY name")
        for r in rows: sections.append({"value": str(r['id']), "text": r['name']})
    except: pass

    return {
        "title": "배치 스캐너",
        "description": "대상 항목을 안전한 속도로 순차 처리합니다.<br>서버 코어 시스템에 의해 브라우저를 닫아도 언제든 <strong>이어서 실행</strong>할 수 있습니다.",
        
        # [조회 시 사용되는 조건 필터들]
        "inputs": [
            {"id": "target_section", "type": "select", "label": "작업 대상 섹션", "options": sections},
            {"id": "mode", "type": "select", "label": "작업 모드", "options": [
                {"value": "refresh", "text": "메타데이터 새로고침"},
                {"value": "rematch", "text": "메타 다시 매칭 (Fix Match)"},
                {"value": "analyze", "text": "미분석 항목 강제 분석 (Analyze)"}
            ]},
            {"id": "target_agent", "type": "text", "label": "에이전트 제외 필터", "placeholder": "예: tv.plex.agents.movie (입력 시 해당 에이전트는 조회 제외)"}
        ],
        
        # [실행 시 사용되는 옵션들]
        "execute_inputs": [
            {"id": "sleep_time", "type": "select", "label": "항목간 대기 시간 (초)", "options": [
                {"value": "1", "text": "1초 (빠름)"},
                {"value": "2", "text": "2초 (권장)"},
                {"value": "5", "text": "5초 (안전)"}
            ]}
        ],
        
        "button_text": "대상 목록 조회"
    }

# =====================================================================
# 2. 데이터 추출 비즈니스 로직
# =====================================================================
def get_target_items(req_data, core_api):
    section_id = req_data.get('target_section', 'all')
    mode = req_data.get('mode', 'refresh')
    target_agent = req_data.get('target_agent', '').strip()
    items = []
    
    # [Reference] 쿼리를 깔끔하게 관리하기 위해 기본 형태를 정의합니다.
    select_clause = """
        SELECT mi.id, mi.title, mi.guid, mp.file, mi.metadata_type, ls.name AS section_name,
               (SELECT title FROM metadata_items WHERE id = (SELECT parent_id FROM metadata_items WHERE id = mi.parent_id)) as show_title,
               (SELECT year FROM metadata_items WHERE id = (SELECT parent_id FROM metadata_items WHERE id = mi.parent_id)) as show_year,
               (SELECT "index" FROM metadata_items WHERE id = mi.parent_id) as season_index,
               mi."index" as episode_index
        FROM metadata_items mi
        JOIN library_sections ls ON mi.library_section_id = ls.id
        LEFT JOIN media_items m ON m.metadata_item_id = mi.id
        LEFT JOIN media_parts mp ON mp.media_item_id = m.id
    """

    params = []
    where_clauses = []

    # 모드에 따른 필수 조건 추가
    if mode in ['refresh', 'rematch']:
        where_clauses.append("mi.metadata_type IN (1, 2)")
    elif mode == 'analyze':
        where_clauses.append("mi.metadata_type IN (1, 4)")
        where_clauses.append("(m.width IS NULL OR m.width = 0 OR m.bitrate IS NULL)")
        where_clauses.append("mp.file IS NOT NULL")

    # 섹션 필터 추가 (파라미터 바인딩 사용)
    if str(section_id).lower() != 'all':
        where_clauses.append("mi.library_section_id = ?")
        params.append(section_id)

    # 쿼리 조립
    query = select_clause
    if where_clauses:
        query += " WHERE " + " AND ".join(where_clauses)
    query += " GROUP BY mi.id"

    # 코어 API로 안전하게 쿼리 실행
    rows = core_api['query'](query, tuple(params))

    for r in rows:
        clean_guid = '-'
        if r.get('guid'):
            clean_guid = r['guid'].replace("com.plexapp.agents.", "", 1) if r['guid'].startswith("com.plexapp.agents.") else r['guid']
            # 제외할 에이전트 필터링 (파이썬 레벨에서 처리)
            if target_agent and clean_guid.startswith(target_agent): 
                continue 

        # 화면에 예쁘게 보여줄 제목 가공
        m_type = r.get('metadata_type')
        if m_type == 4: 
            s_title = r.get('show_title') or "Unknown Show"
            s_year = f" ({r.get('show_year')})" if r.get('show_year') else ""
            s_idx = f"S{int(r.get('season_index')):02d}" if r.get('season_index') is not None else "S01"
            e_idx = f"E{int(r.get('episode_index')):02d}" if r.get('episode_index') is not None else "E01"
            ep_title = r.get('title') or "Episode"
            display_title = f"{s_title}{s_year} / {s_idx}{e_idx} / {ep_title}"
        else:
            display_title = r.get('title') or (os.path.basename(r.get('file', '')) if r.get('file') else "Unknown Title")

        items.append({
            'id': str(r['id']),
            'section': r.get('section_name', ''),
            'title': display_title,
            'guid': clean_guid
        })

    # [Reference] 파이썬 메모리에서 자연 정렬 수행
    items.sort(key=lambda x: (natural_sort_key_local(x['section']), natural_sort_key_local(x['title'])))
    return items

# =====================================================================
# 3. 메인 라우터 (조회 및 실행 분기)
# =====================================================================
def run(data, core_api):
    action = data.get('action_type', 'preview')

    # -----------------------------------------------------------------
    # [조회] UI 렌더링용 데이터테이블 반환
    # -----------------------------------------------------------------
    if action == 'preview':
        items = get_target_items(data, core_api)
        
        # JS에서 클릭 링크(rating_key)를 만들고, 화면엔 title/guid를 뿌려줍니다.
        table_data = [{"section": i['section'], "title": i['title'], "guid": i['guid'], "rating_key": i['id']} for i in items]
        
        action_btn = None
        if len(items) > 0:
            action_btn = {
                "label": f"<i class='fas fa-rocket'></i> 대상 {len(items)}건 작업 시작",
                "payload": {"action_type": "execute"}
            }
            
        return {
            "status": "success",
            "type": "datatable",
            "action_button": action_btn,
            "default_sort": [{"key": "section", "dir": "asc"}, {"key": "title", "dir": "asc"}],
            "columns": [
                {"key": "section", "label": "섹션", "width": "20%", "align": "left", "header_align": "center", "sortable": True},
                # type: 'link' 를 추가하면 프론트엔드가 이를 인식해 클릭 가능한 <a> 태그를 만들어 줌
                {"key": "title", "label": "대상 항목 (제목)", "width": "45%", "align": "left", "header_align": "center", "type": "link", "link_key": "rating_key", "sortable": True},
                {"key": "guid", "label": "에이전트", "width": "25%", "align": "left", "header_align": "center", "sortable": True},
                {"key": "action", "label": "실행", "width": "10%", "align": "center", "header_align": "center", "type": "action_btn"}
            ],
            "data": table_data
        }, 200

    # -----------------------------------------------------------------
    # [실행] 작업을 구성하여 코어에 넘김 (코어가 스레드를 띄움)
    # -----------------------------------------------------------------
    if action == 'execute':
        if data.get('_is_single'):
            items = [{'id': str(data.get('rating_key')), 'title': data.get('title', '단일 실행 항목')}]
        else:
            items = get_target_items(data, core_api)
            
        if not items: return {"status": "error", "message": "실행할 대상이 없습니다."}, 400
        
        task_data = {  
            "mode": data.get('mode', 'refresh'),
            "sleep_time": data.get('sleep_time', 2),
            "target_items": items,
            "total": len(items)
        }
        
        # 단일 실행 여부를 워커에 전달
        if data.get('_is_single'):
            task_data['_is_single'] = True
            
        return {"status": "success", "type": "async_task", "task_data": task_data}, 200

    return {"status": "error", "message": "알 수 없는 명령"}, 400

# =====================================================================
# 4. 백그라운드 워커 (실제 툴의 동작부)
# =====================================================================
def worker(task_data, core_api, start_index):
    """
    코어가 백그라운드 스레드에서 실행시켜주는 메인 함수입니다.
    `core_api['task']` 객체를 통해 진행률, 로그, 취소 상태를 제어할 수 있습니다.
    """
    task = core_api['task'] 
    
    # 저장해두었던 설정값들을 꺼내옵니다.
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

    # [Reference] 이어서 실행인지, 처음 실행인지 구분하여 로깅합니다.
    if start_index > 0: 
        task.log(f"중단되었던 {start_index}번째 항목부터 이어서 작업을 재개합니다.")
    else: 
        task.log(f"총 {total_items}건 '{mode}' 작업을 시작합니다.")

    # 안정적인 서버 상태 확인 로직 (작업 전 Plex 내부 큐가 비워질 때까지 대기)
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

    # [Reference] 지정된 start_index 위치부터 처리 재개 (파이썬 리스트 슬라이싱 활용)
    for idx, item in enumerate(items[start_index:], start=start_index + 1):
        
        # 취소 여부 지속 체크
        if task.is_cancelled(): 
            task.log("사용자 요청에 의해 작업이 중단되었습니다.")
            return 

        mid, title = item['id'], item['title']
        
        # [Reference] 진행률 상태 업데이트 (화면의 게이지 바가 올라감)
        task.update_state('running', progress=idx)
        task.log(f"[{idx}/{total_items}] '{title}' 처리 중...")
        
        if not wait_until_stable_idle(): return
        
        try:
            safe_endpoint = f"/library/metadata/{str(mid).strip()}"
            plex_item = plex.fetchItem(safe_endpoint)
            
            if mode == 'refresh': 
                plex_item.refresh()
            elif mode == 'rematch':
                matches = plex_item.matches()
                if matches: plex_item.fixMatch(matches[0])
                else: task.log("   -> 매칭 결과 없음")
            elif mode == 'analyze': 
                plex_item.analyze()
                
            # 처리가 성공적으로 끝났다면, 코어 캐시 DB에 '완료(done)' 마킹
            core_api['cache'].mark_as_done('rating_key', str(mid))
            
        except Exception as e:
            task.log(f"   -> 처리 오류: {e}")
        
        # 항목 간 슬립 (긴 슬립 타임 도중 취소를 누르면 즉각 반응하기 위해 잘게 쪼개서 sleep)
        for _ in range(int(sleep_time * 2)):
            if task.is_cancelled(): return
            time.sleep(0.5)

    # 모든 루프가 끝난 뒤 상태를 완료로 변경
    task.update_state('completed', progress=total_items)
    
    # 단일/전체 실행 여부에 따라 명확한 종료 메시지 출력
    if task_data.get('_is_single'):
        task.log("단일 실행 작업이 정상적으로 완료되었습니다!")
    else:
        task.log("전체 배치 작업이 성공적으로 완료되었습니다!")
