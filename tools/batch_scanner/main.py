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
import json

# =====================================================================
# 디스코드 알림 기본 템플릿
# =====================================================================
DEFAULT_DISCORD_TEMPLATE = """**✅ 배치 스캐너 작업이 완료되었습니다.**

**[📊 작업 결과]**
- 작업 모드: {mode}
- 처리된 대상: {total} 건
- 총 소요 시간: {elapsed_time}
"""

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
        "description": "대상 항목을 큐 대기열 병목 없이 안전한 속도로 순차 처리합니다.",
        "inputs": [
            {"id": "target_sections", "type": "multi_select", "label": "작업 대상 섹션", "options": sections, "default": "all"},
            {"id": "mode", "type": "select", "label": "작업 모드", "options": [
                {"value": "refresh", "text": "메타데이터 새로고침 (Refresh)"},
                {"value": "rematch", "text": "메타 다시 매칭 (Fix Match)"},
                {"value": "analyze", "text": "미분석 항목 강제 분석 (Analyze)"}
            ]},
            {"id": "target_agent", "type": "text", "label": "에이전트 제외 필터", "placeholder": "예: tv.plex.agents.movie (입력 시 제외)"}
        ],
        "settings_inputs": [
            {"id": "s_h1", "type": "header", "label": "<i class='fas fa-tachometer-alt'></i> 실행 속도 제어"},
            {"id": "sleep_time", "type": "number", "label": "항목 처리 후 대기 시간 (단위: 초)", "default": 2},
            
            {"id": "s_h_cron", "type": "header", "label": "<i class='fas fa-clock'></i> 자동 실행 스케줄러"},
            {"id": "cron_enable", "type": "checkbox", "label": "크론탭(Crontab) 기반 자동 실행 활성화", "default": False},
            {"id": "cron_expr", "type": "cron", "label": "크론탭 시간 설정 (분 시 일 월 요일)", "placeholder": "0 4 * * 0 ※숫자만 허용"},

            {"id": "s_h2", "type": "header", "label": "<i class='fab fa-discord'></i> 알림 설정"},
            {"id": "discord_enable", "type": "checkbox", "label": "작업 완료 시 디스코드 알림 발송", "default": True},
            {"id": "discord_webhook", "type": "text", "label": "툴 전용 웹훅 URL (비워두면 서버 전역 설정 사용)", "placeholder": "https://discord.com/api/webhooks/..."},
            
            {"id": "discord_bot_name", "type": "text", "label": "디스코드 봇 이름 오버라이딩", "placeholder": "예: {server_name} 스캐너 (템플릿 변수 사용 가능)"},
            {"id": "discord_avatar_url", "type": "text", "label": "디스코드 봇 프로필 이미지 URL", "placeholder": "https://.../icon.png"},
            
            {"id": "discord_template", "type": "textarea", "label": "본문 메시지 템플릿 편집", "height": 130, "default": DEFAULT_DISCORD_TEMPLATE,
             "template_vars": [
                 {"key": "mode", "desc": "실행된 작업 모드 (refresh, rematch 등)"},
                 {"key": "total", "desc": "처리된 총 항목 수"},
                 {"key": "elapsed_time", "desc": "총 소요 시간 (예: 2분 30초)"}
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
        "button_text": "대상 목록 조회"
    }

# =====================================================================
# 2. 데이터 추출
# =====================================================================
def get_target_items(req_data, core_api, task=None):
    target_sections = req_data.get('target_sections', [])
    mode = req_data.get('mode', 'refresh')
    target_agent = req_data.get('target_agent', '').strip()
    items = []
    
    sec_query = "SELECT id, name FROM library_sections"
    sec_params = []
    
    if target_sections and 'all' not in target_sections:
        placeholders = ",".join("?" for _ in target_sections)
        sec_query += f" WHERE id IN ({placeholders})"
        sec_params.extend(target_sections)
    
    target_libs = core_api['query'](sec_query, tuple(sec_params))
    if not target_libs: return []

    lib_map = {str(r['id']): r['name'] for r in target_libs}
    lib_ids_str = ",".join(lib_map.keys())

    base_select = f"""
        SELECT mi.id, mi.title, mi.guid, mp.file, mi.metadata_type, mi.library_section_id,
               (SELECT title FROM metadata_items WHERE id = (SELECT parent_id FROM metadata_items WHERE id = mi.parent_id)) as show_title,
               (SELECT year FROM metadata_items WHERE id = (SELECT parent_id FROM metadata_items WHERE id = mi.parent_id)) as show_year,
               (SELECT "index" FROM metadata_items WHERE id = mi.parent_id) as season_index,
               mi."index" as episode_index
        FROM metadata_items mi
        LEFT JOIN media_items m ON m.metadata_item_id = mi.id
        LEFT JOIN media_parts mp ON mp.media_item_id = m.id
        WHERE mi.library_section_id IN ({lib_ids_str}) AND 
    """

    if mode in ['refresh', 'rematch']: 
        query = base_select + " mi.metadata_type IN (1, 2) GROUP BY mi.id"
    elif mode == 'analyze':
        query = base_select + " mi.metadata_type IN (1, 4) AND (m.width IS NULL OR m.width = 0) AND mp.file IS NOT NULL GROUP BY mi.id"

    if task: 
        task.log("데이터베이스에서 대상을 일괄 조회 중입니다...")
        task.update_state('running', progress=10, total=100)

    rows = core_api['query'](query)
    
    for r in rows:
        clean_guid = '-'
        if r.get('guid'):
            clean_guid = r['guid'].replace("com.plexapp.agents.", "").replace("tv.plex.agents.", "")
            if "?" in clean_guid: clean_guid = clean_guid.split("?")[0]
            if target_agent and clean_guid.startswith(target_agent): continue 

        if r.get('metadata_type') == 4: 
            s_title = r.get('show_title') or "Unknown Show"
            s_year = f" ({r.get('show_year')})" if r.get('show_year') else ""
            s_idx = f"S{int(r.get('season_index')):02d}" if r.get('season_index') is not None else "S01"
            e_idx = f"E{int(r.get('episode_index')):02d}" if r.get('episode_index') is not None else "E01"
            ep_title = r.get('title') or "Episode"
            display_title = f"{s_title}{s_year} / {s_idx}{e_idx} / {ep_title}"
        else:
            display_title = r.get('title') or (os.path.basename(r.get('file', '')) if r.get('file') else "Unknown Title")

        lib_name = lib_map.get(str(r['library_section_id']), 'Unknown')
        items.append({'id': str(r['id']), 'section': lib_name, 'title': display_title, 'guid': clean_guid})

    if task: task.update_state('running', progress=90, total=100)
    
    return items

# =====================================================================
# 3. 메인 라우터
# =====================================================================
def run(data, core_api):
    action = data.get('action_type', 'preview')

    if action == 'preview':
        task_data = data.copy()
        task_data['_is_preview_step'] = True
        task_data['_is_preview_tool'] = True
        return {"status": "success", "type": "async_task", "task_data": task_data}, 200

    if action == 'execute':
        # 1. 크론(스케줄러) 실행 분기: 중단된 작업이 있으면 '이어서 하기', 없으면 '새로 조회'
        if data.get('_is_cron'):
            task_state = core_api['task'].load()
            # 미완료된 기존 작업이 있는지 확인 (cancelled 또는 error 상태이면서 progress가 total보다 작을 때)
            if task_state and task_state.get('state') in ['cancelled', 'error'] and task_state.get('progress', 0) < task_state.get('total', 0):
                cached_page = core_api['cache'].load_page(1, 999999)
                if cached_page and cached_page.get('data'):
                    items = [{'id': str(row['rating_key']), 'title': row['title']} for row in cached_page['data']]
                    task_data = {"mode": data.get('mode', 'refresh'), "target_items": items, "total": len(items)}
                    task_data['_resume_start_index'] = task_state.get('progress', 0)
                    task_data['_is_cron'] = True
                    return {"status": "success", "type": "async_task", "task_data": task_data}, 200
            
            # 진행 중인 작업이 없으면 새로 갱신 (워커에게 위임)
            task_data = data.copy()
            task_data['_cron_needs_fetch'] = True
            task_data['_is_cron'] = True
            return {"status": "success", "type": "async_task", "task_data": task_data}, 200

        # 2. UI 단일 항목 실행
        elif data.get('_is_single'):
            items = [{'id': str(data.get('rating_key')), 'title': data.get('title', '단일 실행 항목')}]
            task_data = {"mode": data.get('mode', 'refresh'), "target_items": items, "total": len(items)}
            task_data['_is_single'] = True
            return {"status": "success", "type": "async_task", "task_data": task_data}, 200
        
        # 3. UI 전체 실행 (기존 캐시 사용)
        else:
            cached_page = core_api['cache'].load_page(1, 999999)
            if cached_page and cached_page.get('data'):
                items = [{'id': str(row['rating_key']), 'title': row['title']} for row in cached_page['data']]
                task_data = {"mode": data.get('mode', 'refresh'), "target_items": items, "total": len(items)}
                return {"status": "success", "type": "async_task", "task_data": task_data}, 200
            else:
                return {"status": "error", "message": "캐시된 대상이 없습니다. 다시 조회해주세요."}, 400

    return {"status": "error", "message": "알 수 없는 명령"}, 400

# =====================================================================
# 4. 백그라운드 워커
# =====================================================================
def worker(task_data, core_api, start_index):
    """
    코어가 백그라운드 스레드에서 실행시켜주는 메인 함수입니다.
    `core_api['task']` 객체를 통해 진행률, 로그, 취소 상태를 제어할 수 있습니다.
    """
    task = core_api['task'] 
    work_start_time = time.time()

    # -----------------------------------------------------------------
    # [Preview 모드]
    # -----------------------------------------------------------------
    if task_data.get('_is_preview_step'):
        task.log("조회 대상을 찾기 위해 라이브러리를 검사합니다...")
        task.update_state('running', progress=0, total=100)
        items = get_target_items(task_data, core_api, task)
        
        table_data = [{"section": i['section'], "title": i['title'], "guid": i['guid'], "rating_key": i['id']} for i in items]
        action_btn = None
        if len(items) > 0:
            action_btn = {"label": f"<i class='fas fa-rocket'></i> 검색된 {len(items):,}건 전체 작업 시작", "payload": {"action_type": "execute"}}
            
        sort_rules = [{"key": "section", "dir": "asc"}, {"key": "title", "dir": "asc"}]

        res_payload = {
            "status": "success", "type": "datatable", "action_button": action_btn,
            "default_sort": sort_rules,
            "columns": [
                {"key": "section", "label": "섹션", "width": "20%", "align": "center", "header_align": "center", "sortable": True},
                {"key": "title", "label": "대상 항목 (제목)", "width": "45%", "align": "left", "header_align": "center", "type": "link", "link_key": "rating_key", "sortable": True},
                {"key": "guid", "label": "에이전트", "width": "25%", "align": "center", "header_align": "center", "sortable": True},
                {"key": "action", "label": "실행", "width": "10%", "align": "center", "header_align": "center", "type": "action_btn"}
            ],
            "data": table_data
        }
        core_api['cache'].save(res_payload)
        task.update_state('completed', progress=100, total=100)
        task.log(f"조회 완료! 총 {len(items):,}건의 대상을 찾았습니다. 화면을 전환합니다.")
        return

    # -----------------------------------------------------------------
    # [Execute 모드]
    # -----------------------------------------------------------------
    mode = task_data.get('mode', 'refresh')

    # 크론 스케줄러가 [이어서 하기]를 요청한 경우
    if task_data.get('_resume_start_index') is not None:
        start_index = task_data['_resume_start_index']
        items = task_data.get('target_items', [])
        total = task_data.get('total', len(items))
        task.update_state('running', progress=start_index, total=total)
        task.log(f"🤖 [스케줄러] 중단되었던 {start_index}번째 항목부터 이어서 작업을 재개합니다.")

    # 크론 스케줄러가 [새로 갱신]을 요청한 경우 (이전 작업이 끝났거나 없을 때)
    elif task_data.get('_cron_needs_fetch'):
        task.log("🤖 [스케줄러] 새로운 대상을 조회합니다...")
        raw_items = get_target_items(task_data, core_api, task)
        
        sort_rules = [{"key": "section", "dir": "asc"}, {"key": "title", "dir": "asc"}]
        # ✨ 크론 환경이라 캐시 저장소(DB)를 타지 않고 직접 실행하므로 코어의 정렬 헬퍼를 빌려 정렬
        items = core_api['sort'](raw_items, sort_rules)
        
        if not items:
            task.update_state('completed', progress=0, total=0)
            task.log("실행할 대상 항목이 없습니다. 스케줄링을 종료합니다.")
            return
            
        # UI에서 볼 수 있도록 캐시 DB에 저장해 줍니다.
        table_data = [{"section": r['section'], "title": r['title'], "guid": r['guid'], "rating_key": r['id']} for r in items]
        res_payload = {
            "status": "success", "type": "datatable", 
            "action_button": {"label": f"<i class='fas fa-rocket'></i> 검색된 {len(items):,}건 전체 작업 시작", "payload": {"action_type": "execute"}},
            "default_sort": sort_rules,
            "columns": [
                {"key": "section", "label": "섹션", "width": "20%", "align": "center", "header_align": "center", "sortable": True},
                {"key": "title", "label": "대상 항목 (제목)", "width": "45%", "align": "left", "header_align": "center", "type": "link", "link_key": "rating_key", "sortable": True},
                {"key": "guid", "label": "에이전트", "width": "25%", "align": "center", "header_align": "center", "sortable": True},
                {"key": "action", "label": "실행", "width": "10%", "align": "center", "header_align": "center", "type": "action_btn"}
            ],
            "data": table_data
        }
        core_api['cache'].save(res_payload)
        
        total = len(items)
        task.update_state('running', progress=0, total=total)
        task.log(f"🤖 [스케줄러] 데이터베이스 갱신 완료. 총 {total:,}건 '{mode}' 작업을 시작합니다.")
        
    # UI에서 사용자가 직접 [실행]을 누른 경우 (또는 이어서하기 버튼)
    else:
        items = task_data.get('target_items', [])
        total = task_data.get('total', len(items))
        if total == 0:
            task.update_state('completed', progress=0, total=0)
            task.log("실행할 대상 항목이 없습니다.")
            return
            
        if start_index > 0: 
            task.log(f"중단되었던 {start_index}번째 항목부터 이어서 작업을 재개합니다.")
        else: 
            task.log(f"총 {total:,}건 '{mode}' 작업을 시작합니다.")

    opts = core_api.get('options', {})
    try: sleep_time = float(opts.get('sleep_time', 2))
    except: sleep_time = 2.0

    try:
        plex = core_api['get_plex']()
        if start_index == 0: 
            prefix = "[자동 실행] " if task_data.get('_is_cron') else ""
            task.log(f"{prefix}Plex 연결 완료.")
    except Exception as e:
        task.update_state('error'); task.log(f"Plex 연결 실패: {str(e)}"); return

    # 안정성 대기 로직 (Plex 큐가 비워질 때까지 대기하되 0.5초 간격으로 취소 확인)
    def wait_until_stable_idle(max_wait_seconds=30):
        stable_count = 0
        waited_time = 0
        while waited_time < max_wait_seconds:
            if task.is_cancelled(): return False
            try:
                if len(plex.query('/activities').findall('Activity')) == 0:
                    stable_count += 1
                    if stable_count >= 2: return True
                else: 
                    stable_count = 0
            except: pass
            
            for _ in range(4):
                if task.is_cancelled(): return False
                time.sleep(0.5)
            waited_time += 2
            
        task.log("⚠️ Plex 작업 큐 대기 시간 초과. 강제로 다음 항목을 진행합니다.")
        return True

    # ✨ 원자성(Atomicity)이 보장된 단일 항목 처리 루프
    for idx, item in enumerate(items[start_index:], start=start_index + 1):
        
        # 1. 아이템 시작 직전 취소 확인
        if task.is_cancelled(): 
            task.log("🛑 사용자 요청에 의해 작업을 중단합니다.")
            return 

        mid, title = item['id'], item['title']
        
        task.update_state('running', progress=idx)
        task.log(f"[{idx}/{total}] '{title}' 처리 중...")
        
        # 2. 서버 안정화 대기 중 취소 확인
        if not wait_until_stable_idle(): return
        
        # 3. 본 작업 수행 (여기 진입 시 중단 없이 DB 마킹까지 한 호흡으로 완료)
        try:
            safe_endpoint = f"/library/metadata/{str(mid).strip()}"
            plex_item = plex.fetchItem(safe_endpoint)
            
            if task.is_cancelled(): return
            
            if mode == 'refresh': 
                task.log("   -> 메타데이터 새로고침 진행")
                plex_item.refresh()
            
            elif mode == 'rematch':
                task.log("   -> 자동 매칭 시도")
                matches = plex_item.matches()
                
                if task.is_cancelled(): return
                
                if matches: 
                    plex_item.fixMatch(matches[0])
                else: 
                    task.log("      (매칭 결과가 없어 리매칭을 건너뜁니다.)")
            
            elif mode == 'analyze': 
                task.log("   -> 미디어 분석 요청")
                plex_item.analyze()
                
        except Exception as e:
            task.log(f"   -> ❌ 처리 오류: {e}")
            
        # 4. 캐시 DB 완료 마킹 (취소 여부 상관없이 여기까지 진행)
        if task.is_cancelled(): return
        
        if not task_data.get('_is_cron'):
            core_api['cache'].mark_as_done('rating_key', str(mid))
        
        # 5. 설정된 대기 시간 (딜레이 중에 취소되면 다음 항목으로 넘어가지 않고 종료)
        if sleep_time > 0 and idx < total:
            loops = max(1, int(sleep_time * 2))
            for _ in range(loops):
                if task.is_cancelled(): 
                    task.log("🛑 대기 중 사용자 취소 명령 감지. 진행 중인 항목까지만 완료하고 작업을 중단합니다.")
                    return
                time.sleep(0.5)

    # -----------------------------------------------------------------
    # 처리 완료 및 디스코드 알림
    # -----------------------------------------------------------------
    task.update_state('completed', progress=total)
    
    if task_data.get('_is_single'):
        task.log("✅ 단일 실행 작업이 정상적으로 완료되었습니다!")
    else:
        elapsed_sec = int(time.time() - work_start_time)
        elapsed_str = f"{elapsed_sec // 60}분 {elapsed_sec % 60}초" if elapsed_sec >= 60 else f"{elapsed_sec}초"

        prefix = "[자동 실행] " if task_data.get('_is_cron') else ""
        task.log(f"✅ {prefix}총 {total:,}건의 작업 완료! (소요시간: {elapsed_str})")
        
        tool_vars = {
            "mode": mode,
            "total": f"{total:,}",
            "elapsed_time": elapsed_str
        }
        
        core_api['notify']("배치 스캐너 완료", DEFAULT_DISCORD_TEMPLATE, "#51a351", tool_vars)
