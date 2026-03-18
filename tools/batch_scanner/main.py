# -*- coding: utf-8 -*-

import time
import os

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
        "buttons": [
            {
                "label": "대상 목록 조회 (Preview)", 
                "action_type": "preview", 
                "icon": "fas fa-search", 
                "color": "#2f96b4"
            },
            {
                "label": "즉시 전체 실행", 
                "action_type": "execute_instant", 
                "icon": "fas fa-bolt", 
                "color": "#e5a00d"
            }
        ]
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
    if not target_libs: return [], 0

    lib_map = {str(r['id']): r['name'] for r in target_libs}
    lib_ids_str = ",".join(lib_map.keys())

    total_scanned = 0
    try:
        count_q = f"SELECT COUNT(*) as cnt FROM metadata_items WHERE library_section_id IN ({lib_ids_str}) AND metadata_type IN (1, 4)"
        count_res = core_api['query'](count_q)
        if count_res: total_scanned = count_res[0]['cnt']
    except Exception: pass

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

    query = ""
    if mode in ['refresh', 'rematch']: 
        query = base_select + " mi.metadata_type IN (1, 2) GROUP BY mi.id"
    elif mode == 'analyze':
        query = base_select + " mi.metadata_type IN (1, 4) AND (m.width IS NULL OR m.width = 0) AND mp.file IS NOT NULL GROUP BY mi.id"

    if task: 
        task.log(f"데이터베이스에서 '{mode}' 작업을 수행할 대상을 일괄 조회 중입니다...")
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
    
    return items, total_scanned

# =====================================================================
# 3. 메인 라우터
# =====================================================================
def run(data, core_api):
    action = data.get('action_type')
    current_mode = data.get('mode', 'refresh')

    if action == 'preview':
        task_data = data.copy()
        task_data['_auto_refresh_ui'] = True
        return {"status": "success", "type": "async_task", "task_data": task_data}, 200

    if action == 'execute_instant':
        task_data = data.copy()
        return {"status": "success", "type": "async_task", "task_data": task_data}, 200

    if action == 'execute':
        
        if data.get('_is_cron'):
            task_state = core_api['task'].load()
            if task_state and task_state.get('state') in ['cancelled', 'error'] and task_state.get('progress', 0) < task_state.get('total', 0):
                cached_page = core_api['cache'].load_page(1, 999999)
                if cached_page and cached_page.get('data'):
                    items = [{'id': str(row['rating_key']), 'title': row['title']} for row in cached_page['data']]
                    task_data = {"mode": current_mode, "target_items": items, "total": len(items)}
                    task_data['_resume_start_index'] = task_state.get('progress', 0)
                    task_data['_is_cron'] = True
                    return {"status": "success", "type": "async_task", "task_data": task_data}, 200
            
            task_data = data.copy()
            task_data['action_type'] = 'execute_instant'
            task_data['_is_cron'] = True
            return {"status": "success", "type": "async_task", "task_data": task_data}, 200

        elif data.get('_is_single'):
            items = [{'id': str(data.get('rating_key')), 'title': data.get('title', '단일 실행 항목')}]
            task_data = {"mode": current_mode, "target_items": items, "total": len(items)}
            task_data['_is_single'] = True
            task_data['_silent_task'] = True
            task_data['_auto_refresh_ui'] = True
            return {"status": "success", "type": "async_task", "task_data": task_data}, 200
        
        else:
            cached_page = core_api['cache'].load_page(1, 999999)
            if cached_page and cached_page.get('data'):
                items = [{'id': str(row['rating_key']), 'title': row['title']} for row in cached_page['data']]
                task_data = {"mode": current_mode, "target_items": items, "total": len(items)}
                return {"status": "success", "type": "async_task", "task_data": task_data}, 200
            else:
                return {"status": "error", "message": "캐시된 대상이 없습니다. 다시 조회해주세요."}, 400

    return {"status": "error", "message": f"지원하지 않는 명령입니다 ({action})"}, 400

# =====================================================================
# 4. 백그라운드 워커
# =====================================================================
def worker(task_data, core_api, start_index):
    task = core_api['task'] 
    action = task_data.get('action_type')
    work_start_time = time.time()

    # -----------------------------------------------------------------
    # [Preview 액션]
    # -----------------------------------------------------------------
    if action == 'preview':
        task.log("🔍 조회 대상을 찾기 위해 라이브러리를 검사합니다...")
        task.update_state('running', progress=0, total=100)
        items, total_scanned = get_target_items(task_data, core_api, task)
        
        if task.is_cancelled():
            task.log("🛑 조회 작업이 사용자에 의해 취소되었습니다.")
            return

        summary_cards = []
        if total_scanned > 0:
            summary_cards.append({"label": "총 검사 항목 수", "value": f"{total_scanned:,} 건", "icon": "fas fa-search", "color": "#2f96b4"})
            
        if len(items) > 0:
            summary_cards.append({"label": "작업 대상 항목", "value": f"{len(items):,} 건", "icon": "fas fa-list-ol", "color": "#e5a00d"})

        action_btn = None
        if len(items) > 0:
            action_btn = {
                "label": f"<i class='fas fa-rocket'></i> 검색된 {len(items):,}건 전체 작업 시작", 
                "payload": {"action_type": "execute", "mode": task_data.get('mode', 'refresh')}
            }

        task.log("📊 검색된 데이터를 바탕으로 결과 테이블을 생성합니다...")
        task.update_state('running', progress=95, total=100)

        table_data = [{"section": i['section'], "title": i['title'], "guid": i['guid'], "rating_key": i['id']} for i in items]
        
        action_btn = None
        if len(items) > 0:
            action_btn = {
                "label": f"<i class='fas fa-rocket'></i> 검색된 {len(items):,}건 전체 작업 시작", 
                "payload": {"action_type": "execute", "mode": task_data.get('mode', 'refresh')}
            }
            
        sort_rules = [{"key": "section", "dir": "asc"}, {"key": "title", "dir": "asc"}]

        res_payload = {
            "status": "success", "type": "datatable", "action_button": action_btn,
            "summary_cards": summary_cards,
            "default_sort": sort_rules,
            "columns": [
                {"key": "section", "label": "섹션", "width": "20%", "align": "center", "header_align": "center", "sortable": True},
                {"key": "title", "label": "대상 항목 (제목)", "width": "45%", "align": "left", "header_align": "center", "type": "link", "link_key": "rating_key", "sortable": True},
                {"key": "guid", "label": "에이전트", "width": "25%", "align": "center", "header_align": "center", "sortable": True},
                {"key": "action", "label": "단일실행", "width": "10%", "align": "center", "header_align": "center", "type": "action_btn", "action_type": "execute", "payload": {"mode": task_data.get('mode', 'refresh')}}
            ],
            "data": table_data
        }
        
        core_api['cache'].save(res_payload)
        task.update_state('completed', progress=100, total=100)
        
        if len(items) > 0:
            task.log(f"✅ 조회 완료! 총 {len(items):,}건의 대상을 찾았습니다. (잠시 후 결과 화면으로 돌아갑니다...)")
        else:
            task.log("✅ 라이브러리 검사 완료. 조건에 일치하는 대상이 없습니다.")
        return

    # -----------------------------------------------------------------
    # [Execute / Execute_Instant 액션]
    # -----------------------------------------------------------------
    mode = task_data.get('mode', 'refresh')

    if action == 'execute_instant':
        task.log(f"🔍 '{mode}' 작업을 위한 대상 항목 조회를 즉시 시작합니다...")
        items, _ = get_target_items(task_data, core_api, task)
        total = len(items)
        task.log(f"✅ 조회 완료. 총 {total:,}건의 항목에 대해 복구 작업을 시작합니다.")
        task.update_state('running', progress=0, total=total)
        if total == 0:
            task.update_state('completed', progress=0, total=0)
            return

    else:
        if task_data.get('_resume_start_index') is not None:
            start_index = task_data['_resume_start_index']
            items = task_data.get('target_items', [])
            total = task_data.get('total', len(items))
            task.update_state('running', progress=start_index, total=total)
            task.log(f"🔄 중단되었던 {start_index}번째 항목부터 이어서 작업을 재개합니다.")
        else:
            items = task_data.get('target_items', [])
            total = task_data.get('total', len(items))
            if total == 0:
                task.update_state('completed', progress=0, total=0)
                task.log("⚠️ 실행할 대상 항목이 없습니다.")
                return
            
            task.log(f"🚀 총 {total:,}건 '{mode}' 작업을 시작합니다.")

    opts = core_api.get('options', {})
    try: sleep_time = float(opts.get('sleep_time', 2))
    except: sleep_time = 2.0

    try:
        plex = core_api['get_plex']()
        if start_index == 0: 
            prefix = "[자동 실행] " if task_data.get('_is_cron') else ""
            task.log(f"🔌 {prefix}Plex 연결 완료.")
    except Exception as e:
        task.update_state('error'); task.log(f"❌ Plex 연결 실패: {str(e)}"); return

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

    BATCH_SIZE = 10
    processed_in_batch = 0
    completed_keys_buffer = []

    for idx, item in enumerate(items[start_index:], start=start_index + 1):
        
        if task.is_cancelled(): 
            task.log("🛑 사용자 요청에 의해 작업을 중단합니다.")
            if completed_keys_buffer and not task_data.get('_is_single') and action != 'execute_instant':
                for rk_to_done in completed_keys_buffer:
                    core_api['cache'].mark_as_done('rating_key', rk_to_done)
            if processed_in_batch > 0:
                task.update_state('running', progress=idx - 1)
            return 

        mid, title = item['id'], item['title']
        
        task.log(f"[{idx}/{total}] 🎬 '{title}' 처리 중...")
        
        if not wait_until_stable_idle(): return
        
        try:
            safe_endpoint = f"/library/metadata/{str(mid).strip()}"
            plex_item = plex.fetchItem(safe_endpoint)
            
            if task.is_cancelled(): return
            
            if mode == 'refresh': 
                task.log("   -> 🔄 메타데이터 새로고침(Refresh) 호출 중...")
                plex_item.refresh()
                task.log("      ✅ 새로고침 요청 완료 (백그라운드에서 진행)")
            
            elif mode == 'rematch':
                task.log("   -> 🔗 자동 매칭(Auto Match) 대상 검색 중...")
                matches = plex_item.matches()
                
                if task.is_cancelled(): return
                
                if matches: 
                    best_match = matches[0]
                    task.log(f"      ✅ 최적의 매칭 후보 발견: '{best_match.name}' (점수: {best_match.score}점)")
                    task.log("         ➔ 매칭 데이터 적용 중...")
                    plex_item.fixMatch(best_match)
                    task.log("         ➔ 🟢 자동 매칭 완료!")
                else: 
                    task.log("      ⚠️ 매칭 후보를 찾을 수 없어 리매칭을 건너뜁니다.")
            
            elif mode == 'analyze': 
                task.log("   -> 🔍 미디어 분석(Analyze) 호출 중...")
                plex_item.analyze()
                task.log("      ✅ 분석 요청 완료 (Plex 백그라운드에서 진행)")
                
            completed_keys_buffer.append(str(mid))
                
        except Exception as e:
            task.log(f"   -> ❌ 작업 중 오류 발생: {e}")
            if not task_data.get('_is_single') and action != 'execute_instant':
                core_api['cache'].mark_as_error('rating_key', str(mid))
            
        processed_in_batch += 1
            
        if task.is_cancelled():
            task.log("🛑 사용자 취소 명령 감지. 진행 중인 항목까지만 완료하고 작업을 중단합니다.")
            if completed_keys_buffer and not task_data.get('_is_single') and action != 'execute_instant':
                for rk_to_done in completed_keys_buffer:
                    core_api['cache'].mark_as_done('rating_key', rk_to_done)
            if processed_in_batch > 0:
                task.update_state('running', progress=idx)
            return
        
        if processed_in_batch >= BATCH_SIZE or idx == total:
            if completed_keys_buffer and not task_data.get('_is_single') and action != 'execute_instant':
                for rk_to_done in completed_keys_buffer:
                    core_api['cache'].mark_as_done('rating_key', rk_to_done)
                    
            task.update_state('running', progress=idx)
            
            processed_in_batch = 0
            completed_keys_buffer = []
        
        if sleep_time > 0 and idx < total:
            loops = max(1, int(sleep_time * 2))
            for _ in range(loops):
                if task.is_cancelled(): 
                    task.log("🛑 사용자 취소 명령 감지. 진행 중인 항목까지만 완료하고 작업을 중단합니다.")
                    if completed_keys_buffer and not task_data.get('_is_single') and action != 'execute_instant':
                        for rk_to_done in completed_keys_buffer:
                            core_api['cache'].mark_as_done('rating_key', rk_to_done)
                    if processed_in_batch > 0:
                        task.update_state('running', progress=idx)
                    return
                time.sleep(0.5)

    # -------------------------------------------------------------
    # 💡 [일괄 검증 및 종료 처리]
    # -------------------------------------------------------------
    if mode == 'analyze' and not task.is_cancelled() and not task_data.get('_is_single'):
        analyze_rks = [str(item['id']) for item in items]
        if analyze_rks:
            task.log("🔍 분석 작업 완료. Plex DB 갱신 상태를 일괄 검증합니다...")
            time.sleep(2)
            
            try:
                corrupt_titles = []
                for i in range(0, len(analyze_rks), 500):
                    chunk = analyze_rks[i:i+500]
                    placeholders = ",".join("?" for _ in chunk)
                    check_q = f"SELECT metadata_item_id FROM media_items WHERE metadata_item_id IN ({placeholders}) AND (width IS NULL OR width = 0)"
                    for r in core_api['query'](check_q, tuple(chunk)):
                        fail_rk_str = str(r['metadata_item_id'])
                        fail_title = f"Unknown Title (ID:{fail_rk_str})"
                        
                        for item in items:
                            if str(item['id']) == fail_rk_str:
                                fail_title = item['title']
                                break
                        corrupt_titles.append(fail_title)
                        
                        core_api['cache'].mark_as_error('rating_key', fail_rk_str)
                
                if corrupt_titles:
                    task.log("=" * 45)
                    task.log(f"🚨 [분석 실패 (파일 손상, 읽기 권한, 클라우드 마운트 해제 의심): 총 {len(corrupt_titles):,}건]")
                    for c_title in corrupt_titles: task.log(f"   > {c_title}")
                    task.log("=" * 45)
                else: 
                    task.log("✅ 모든 분석 항목이 정상적으로 갱신(해상도 정보 등록)되었습니다.")
            except Exception as e:
                task.log(f"⚠️ 일괄 검증 과정 중 오류 발생: {type(e).__name__} - {str(e)}")

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
