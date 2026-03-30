# -*- coding: utf-8 -*-
"""
====================================================================================
 [PMH Tool Reference Template] - 배치 스캐너 (Batch Scanner)
====================================================================================
"""

import time
import os
import unicodedata
import urllib.request
import urllib.parse
import json
import sqlite3

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
# 도우미 함수
# =====================================================================

def call_plexmate_vfs_refresh(mate_url, apikey, target_path):
    url = f"{mate_url.rstrip('/')}/plex_mate/api/scan/vfs_refresh"
    data = urllib.parse.urlencode({'apikey': apikey, 'target': target_path, 'recursive': 'true', 'async': 'false'}).encode('utf-8')
    req = urllib.request.Request(url, data=data, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=None) as response:
            res = json.loads(response.read())
            return res.get('ret') == 'success'
    except Exception: return False

def call_plexmate_scan(mate_url, apikey, target_path, section_id):
    url = f"{mate_url.rstrip('/')}/plex_mate/api/scan/do_scan"
    data = urllib.parse.urlencode({'apikey': apikey, 'target': target_path, 'target_section_id': section_id, 'scanner': 'web'}).encode('utf-8')
    req = urllib.request.Request(url, data=data, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=None) as response:
            res = json.loads(response.read())
            return res.get('ret') == 'success'
    except Exception: return False

def translate_path(plex_path, mappings):
    """Plex 컨테이너 내부 경로를 Plex Mate(또는 로컬/호스트)가 인식하는 외부 경로로 변환합니다."""
    if not mappings or not plex_path: return plex_path
    plex_path = plex_path.replace('\\', '/')
    for m in mappings:
        if "|" not in m: continue
        p_path, s_path = m.split("|", 1)
        p_path, s_path = p_path.strip().replace('\\', '/'), s_path.strip().replace('\\', '/')
        if p_path and plex_path.startswith(p_path):
            return s_path + plex_path[len(p_path):]
    return plex_path

# =====================================================================
# 1. PMH Tool 표준 인터페이스 (UI 스키마)
# =====================================================================
def get_ui(core_api):
    sections = []
    default_secs = []
    try:
        rows = core_api['query']("SELECT id, name FROM library_sections ORDER BY name")
        for r in rows:
            sec_val = str(r['id'])
            sections.append({"value": sec_val, "text": r['name']})
            default_secs.append(sec_val)
    except: pass

    return {
        "title": "배치 스캐너",
        "description": "대상 항목을 큐 대기열 병목 없이 안전한 속도로 순차 처리합니다.",
        "inputs": [
            {"id": "target_sections", "type": "multi_select", "label": "조회 대상 섹션", "options": sections, "default": default_secs},

            {"id": "mode", "type": "select", "label": "작업 모드", "options": [
                {"value": "refresh", "text": "배치 리프레시 (Refresh)"},
                {"value": "rematch", "text": "배치 리매칭 (Fix Match)"},
                {"value": "path_scan", "text": "배치 경로 스캔 (Plex Mate 연동)"}
            ], "default": "refresh"},

            {"id": "opt_smart_refresh", "type": "checkbox", "label": "포스터/메타데이터 유실이 의심되는 항목만 조회", "default": False, "show_if": {"mode": "refresh"}},
            {"id": "opt_smart_match", "type": "checkbox", "label": "GUID가 없는 미매칭 항목만 조회", "default": False, "show_if": {"mode": "rematch"}},

            {"id": "target_agent", "type": "text", "label": "에이전트 제외 필터", "placeholder": "예: tv.plex.agents.movie (입력 시 해당 에이전트 항목 제외)", "show_if": {"mode": "rematch"}},
            {"id": "scan_depth", "type": "number", "label": "경로 스캔 Depth (기본: 1)", "default": 1, "layout": "plain", "width": "60px", "show_if": {"mode": "path_scan"}}
        ],
        "execute_inputs": [
            {"id": "opt_vfs", "type": "checkbox", "label": "스캔 전 vfs/refresh 수행 (Plex Mate 연동)", "default": True, "show_if": {"mode": "path_scan"}},
            {"id": "opt_try_refresh", "type": "checkbox", "label": "매칭 전 Refresh(자동 매칭) 우선 시도", "default": True, "show_if": {"mode": "rematch"}},
            {"id": "opt_unmatch_first", "type": "checkbox", "label": "매칭 전 언매치 우선 실행", "default": True, "show_if": {"mode": "rematch"}}
        ],
        "settings_inputs": [
            {"id": "s_h1", "type": "header", "label": "<i class='fas fa-tachometer-alt'></i> 실행 속도 제어"},
            {"id": "sleep_time", "type": "number", "label": "항목 처리 후 대기 시간 (단위: 초)", "default": 2},

            {"id": "s_h_cron", "type": "header", "label": "<i class='fas fa-clock'></i> 자동 실행 스케줄러"},
            {"id": "cron_enable", "type": "checkbox", "label": "크론탭(Crontab) 기반 자동 실행 활성화", "default": False},
            {"id": "cron_expr", "type": "cron", "label": "크론탭 시간 설정 (분 시 일 월 요일)", "placeholder": "0 4 * * 0 ※숫자만 허용"},

            {"id": "s_h2", "type": "header", "label": "<i class='fab fa-discord'></i> 알림 설정"},
            {"id": "discord_enable", "type": "checkbox", "label": "작업 완료 시 디스코드 통계 알림 발송", "default": True},
            {"id": "discord_webhook", "type": "text", "label": "툴 전용 웹훅 URL (비워두면 서버 전역 설정 사용)", "placeholder": "https://discord.com/api/webhooks/..."},
            {"id": "discord_bot_name", "type": "text", "label": "디스코드 봇 이름 오버라이딩", "placeholder": "예: {server_name}의 봇 (아래의 모든 템플릿 변수 사용 가능)"},
            {"id": "discord_avatar_url", "type": "text", "label": "디스코드 봇 프로필 이미지 URL", "placeholder": "https://.../icon.png"},
            {"id": "discord_template", "type": "textarea", "label": "본문 메시지 템플릿 편집", "height": 160, "default": DEFAULT_DISCORD_TEMPLATE,
             "template_vars": [
                 {"key": "total", "desc": "처리된 총 항목 수"},
                 {"key": "elapsed_time", "desc": "총 소요 시간 (예: 5분 20초)"},
                 {"key": "mode", "desc": "실행 모드 (refresh, rematch 등)"}
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
            {"label": "대상 목록 조회 (Preview)", "action_type": "preview", "icon": "fas fa-search", "color": "#2f96b4"},
            {"label": "즉시 전체 실행", "action_type": "execute_instant", "icon": "fas fa-bolt", "color": "#e5a00d"}
        ]
    }

# =====================================================================
# 2. 데이터 추출 및 그룹화
# =====================================================================
def get_target_items(req_data, core_api, task=None):
    target_sections = req_data.get('target_sections', [])
    mode = req_data.get('mode', 'refresh')
    target_agent = req_data.get('target_agent', '').strip()
    scan_depth = int(req_data.get('scan_depth', 1))

    opt_smart_refresh = req_data.get('opt_smart_refresh', False)
    opt_smart_match = req_data.get('opt_smart_match', False)

    items = []
    total_scanned = 0

    sec_query = "SELECT id, name FROM library_sections"
    sec_params = []

    if target_sections and 'all' not in target_sections:
        placeholders = ",".join("?" for _ in target_sections)
        sec_query += f" WHERE id IN ({placeholders})"
        sec_params.extend(target_sections)

    try:
        target_libs = core_api['query'](sec_query, tuple(sec_params))
    except Exception as e:
        if task: task.log(f"❌ 라이브러리 섹션 조회 실패: {e}")
        return items, total_scanned

    if not target_libs:
        if task: task.log("⚠️ 선택한 라이브러리를 찾을 수 없습니다.")
        return items, total_scanned

    lib_map = {str(r['id']): r['name'] for r in target_libs}
    lib_ids_str = ",".join(lib_map.keys())

    # -------------------------------------------------------------
    # 경로 스캔(Path Scan) 모드
    # -------------------------------------------------------------
    if mode == 'path_scan':
        if task:
            task.log(f"디렉토리 계층 구조에서 Depth {scan_depth} 경로들을 수집 중입니다...")
            task.update_state('running', progress=10, total=100)

        path_set = set()
        loc_q = f"SELECT library_section_id, root_path FROM section_locations WHERE library_section_id IN ({lib_ids_str})"

        path_mappings = core_api['config'].get('path_mappings', [])

        for loc in core_api['query'](loc_q):
            if task and task.is_cancelled(): return items, total_scanned
            root = loc['root_path']
            sec_id = loc['library_section_id']
            sec_name = lib_map.get(str(sec_id), 'Unknown')

            if not os.path.exists(root): continue

            if scan_depth <= 0:
                mapped_path = translate_path(root, path_mappings)
                path_set.add((mapped_path, sec_id, sec_name))
            else:
                try:
                    for dirpath, dirnames, filenames in os.walk(root):
                        rel_path = os.path.relpath(dirpath, root)
                        current_depth = 0 if rel_path == '.' else len(rel_path.replace('\\', '/').split('/'))

                        if current_depth == scan_depth:
                            mapped_path = translate_path(dirpath, path_mappings)
                            path_set.add((mapped_path, sec_id, sec_name))
                            dirnames.clear()
                        elif current_depth > scan_depth:
                            dirnames.clear()
                except Exception: pass

        tmp_list = [{'id': p, 'section_id': sid, 'section': sname, 'title': p, 'guid': '-'} for p, sid, sname in list(path_set)]
        items = core_api['sort'](tmp_list, [{"key": "section", "dir": "asc"}, {"key": "title", "dir": "asc"}])

        total_scanned = len(items)
        if task: task.update_state('running', progress=90, total=100)
        return items, total_scanned

    # -------------------------------------------------------------
    # 메타데이터 기반 조회 (Refresh, Rematch)
    # -------------------------------------------------------------
    try:
        count_q = f"SELECT COUNT(*) as cnt FROM metadata_items WHERE library_section_id IN ({lib_ids_str}) AND metadata_type IN (1, 2, 3, 4, 8, 9, 10)"
        count_res = core_api['query'](count_q)
        if count_res: total_scanned = count_res[0]['cnt']
    except Exception: pass

    where_conditions = f"mi.library_section_id IN ({lib_ids_str}) AND mi.metadata_type IN (1, 2, 3, 4, 8, 9, 10)"

    if mode == 'refresh' and opt_smart_refresh:
        where_conditions = f"""
            mi.library_section_id IN ({lib_ids_str}) AND
            (
                (mi.metadata_type IN (1, 2, 9) AND (mi.user_thumb_url = '' OR mi.user_thumb_url IS NULL OR mi.user_thumb_url NOT LIKE '%://%' OR mi.user_thumb_url LIKE 'media://%.bundle/Contents/Thumbnails/%' OR mi.user_thumb_url LIKE '%discord%attachments%'))
                OR
                (mi.metadata_type IN (4, 8) AND (SELECT "index" FROM metadata_items WHERE id = mi.parent_id) < 100 AND (mi.user_thumb_url = '' OR mi.user_thumb_url IS NULL OR mi.user_thumb_url NOT LIKE '%://%' OR mi.user_thumb_url LIKE '%discord%attachments%'))
            )
        """
    elif mode == 'rematch' and opt_smart_match:
        where_conditions = f"mi.library_section_id IN ({lib_ids_str}) AND (mi.guid LIKE 'local://%' OR mi.guid LIKE 'none://%' OR mi.guid = '' OR mi.guid IS NULL) AND mi.metadata_type IN (1, 2, 3, 4, 8, 9, 10)"

    base_select = f"""
        SELECT
            mi.id, mi.metadata_type, mi.title,
            (SELECT file FROM media_parts WHERE media_item_id = (SELECT id FROM media_items WHERE metadata_item_id = mi.id LIMIT 1) LIMIT 1) as file,
            mi.year, mi.parent_id, mi.guid, mi.library_section_id,
            (SELECT parent_id FROM metadata_items WHERE id = mi.parent_id) as grandparent_id,
            (SELECT title FROM metadata_items WHERE id = IFNULL((SELECT parent_id FROM metadata_items WHERE id = mi.parent_id), mi.parent_id)) as show_title,
            (SELECT year FROM metadata_items WHERE id = IFNULL((SELECT parent_id FROM metadata_items WHERE id = mi.parent_id), mi.parent_id)) as show_year,
            (SELECT "index" FROM metadata_items WHERE id = mi.parent_id) as s_idx,
            mi."index" as e_idx
        FROM metadata_items mi
        WHERE {where_conditions}
    """

    if task:
        filter_msg = "(지능형 필터 적용)" if (opt_smart_refresh and mode=='refresh') or (opt_smart_match and mode=='rematch') else "(전체 딥스캔)"
        task.log(f"데이터베이스에서 '{mode}' 작업을 수행할 개별 미디어 대상 {filter_msg}을(를) 조회 및 부모 병합 중입니다...")
        task.update_state('running', progress=10, total=100)

    plex_db_path = core_api['config'].get('plex_db_path', '')
    if not os.path.exists(plex_db_path):
        if task: task.log("❌ Plex DB 경로를 찾을 수 없습니다.")
        return items, total_scanned

    plex_conn = None
    targets = {}

    def format_title(r, is_parent=False):
        m_type = r[1]
        raw_title = r[2]
        
        if is_parent:
            base_title = r[9] if m_type in (3, 4, 8, 10) else raw_title
            year = r[10] if m_type in (3, 4, 8, 10) else r[4]
        else:
            base_title = raw_title
            year = r[4]
            
        if not base_title: 
            base_title = raw_title
            
        if base_title:
            return f"{base_title} ({year})" if year else str(base_title)
        return ""

    try:
        plex_conn = sqlite3.connect(f'file:{plex_db_path}?mode=ro', uri=True, timeout=10.0)
        plex_c = plex_conn.cursor()
        plex_c.execute(base_select)

        while True:
            rows = plex_c.fetchmany(10000)
            if not rows: break
            if task and task.is_cancelled(): break

            for r in rows:
                rk = r[0]
                m_type = r[1]
                title = r[2]
                f_path = r[3]
                guid_val = r[6]
                lib_sec_id = r[7]
                parent_id = r[5]
                grandparent_id = r[8]

                clean_guid = '-'
                if guid_val:
                    clean_guid = guid_val.replace("com.plexapp.agents.", "").replace("tv.plex.agents.", "")
                    if "?" in clean_guid: clean_guid = clean_guid.split("?")[0]
                    if mode == 'rematch' and target_agent and clean_guid.startswith(target_agent):
                        continue

                actual_parent = grandparent_id or parent_id
                target_rk = actual_parent if actual_parent and mode in ['refresh', 'rematch'] else rk

                if target_rk not in targets:
                    display_title = format_title(r, is_parent=(mode in ['refresh', 'rematch'] and m_type in (4, 8, 10)))
                    if m_type not in (1, 2, 3, 4, 8, 9, 10):
                        display_title = title or (os.path.basename(f_path) if f_path else "Unknown Title")

                    lib_name = lib_map.get(str(lib_sec_id), 'Unknown')

                    targets[target_rk] = {
                        'id': str(target_rk),
                        'section': lib_name,
                        'title': display_title,
                        'guid': clean_guid,
                        'f_path': f_path
                    }

    except Exception as e:
        if task: task.log(f"❌ 쿼리 실행 중 오류 발생: {e}")
    finally:
        if plex_conn:
            try: plex_conn.close()
            except: pass

    for rk in list(targets.keys()): 
        if not targets[rk]['title'] or targets[rk]['title'].strip() == "":
            f_path = targets[rk].get('f_path')
            if f_path:
                fallback_name = os.path.basename(f_path) or os.path.basename(os.path.dirname(f_path))
                targets[rk]['title'] = fallback_name
            else:
                targets[rk]['title'] = f"Unknown Media (ID: {rk})"

    items = list(targets.values())

    items = core_api['sort'](items, [{"key": "section", "dir": "asc"}, {"key": "title", "dir": "asc"}])

    if task: task.update_state('running', progress=90, total=100)

    return items, total_scanned

# =====================================================================
# 3. 메인 라우터
# =====================================================================
def run(data, core_api):
    action = data.get('action_type', 'preview')
    current_mode = data.get('mode', 'refresh')

    if action == 'preview':
        task_data = data.copy()
        task_data['_auto_refresh_ui'] = True
        return {"status": "success", "type": "async_task", "task_data": task_data}, 200

    if action == 'execute_instant':
        task_data = data.copy()
        return {"status": "success", "type": "async_task", "task_data": task_data}, 200

    if action == 'execute':
        vfs_opt = data.get('opt_vfs', True)

        if data.get('_is_cron'):
            task_state = core_api['task'].load()
            if task_state and task_state.get('state') in ['cancelled', 'error'] and task_state.get('progress', 0) < task_state.get('total', 0):
                cached_page = core_api['cache'].load_page(1, 99999999)
                if cached_page and cached_page.get('data'):
                    items = [{'id': str(row.get('rating_key', row.get('id'))), 'title': row['title'], 'section_id': row.get('section_id')} for row in cached_page['data']]
                    task_data = {"mode": current_mode, "opt_vfs": vfs_opt, "target_items": items, "total": len(items)}
                    task_data['_resume_start_index'] = task_state.get('progress', 0)
                    task_data['_is_cron'] = True
                    return {"status": "success", "type": "async_task", "task_data": task_data}, 200

            task_data = data.copy()
            task_data['action_type'] = 'execute_instant'
            task_data['_is_cron'] = True
            return {"status": "success", "type": "async_task", "task_data": task_data}, 200

        elif data.get('_is_single'):
            items = [{'id': str(data.get('rating_key', data.get('id'))), 'title': data.get('title', '단일 실행 항목'), 'section_id': data.get('section_id')}]
            task_data = {"mode": current_mode, "opt_vfs": vfs_opt, "target_items": items, "total": len(items)}
            task_data['_is_single'] = True
            task_data['_silent_task'] = True
            task_data['_auto_refresh_ui'] = True
            return {"status": "success", "type": "async_task", "task_data": task_data}, 200

        else:
            cached_page = core_api['cache'].load_page(1, 1)
            if cached_page and cached_page.get('total_items', 0) > 0:
                task_data = data.copy()
                task_data['_use_cache_db'] = True
                task_data['total'] = cached_page.get('total_items')
                task_data.pop('target_items', None)
                return {"status": "success", "type": "async_task", "task_data": task_data}, 200
            else:
                return {"status": "error", "message": "캐시된 대상이 없습니다. 먼저 조회해주세요."}, 400

    return {"status": "error", "message": f"지원하지 않는 명령입니다 ({action})"}, 400

# =====================================================================
# 4. 백그라운드 워커
# =====================================================================
def worker(task_data, core_api, start_index):
    task = core_api['task']
    action = task_data.get('action_type')
    work_start_time = time.time()

    mate_url = core_api['config'].get('mate_url', '')
    mate_apikey = core_api['config'].get('mate_apikey', '')

    # -----------------------------------------------------------------
    # [1] Preview 액션
    # -----------------------------------------------------------------
    if action == 'preview':
        task.log("🔍 조회 대상을 찾기 위해 라이브러리를 검사합니다...")
        task.update_state('running', progress=0, total=100)
        items, total_scanned = get_target_items(task_data, core_api, task)

        if task.is_cancelled():
            task.log("🛑 조회 작업이 사용자에 의해 취소되었습니다.")
            return

        task.log("📊 검색된 데이터를 바탕으로 결과 테이블을 생성합니다...")
        task.update_state('running', progress=95, total=100)

        summary_cards = [
            {"label": "총 검사 항목 수", "value": f"{total_scanned:,} 건", "icon": "fas fa-search", "color": "#2f96b4"},
            {"label": "작업 대상 항목", "value": f"{len(items):,} 건", "icon": "fas fa-list-ol", "color": "#e5a00d" if len(items)>0 else "#777"}
        ]

        if task_data.get('mode') == 'path_scan':
            table_data = [{"section": i['section'], "title": i['title'], "guid": i['guid'], "id": i['id'], "section_id": i.get('section_id')} for i in items]
            link_type = "text"
            link_key = ""
        else:
            table_data = [{"section": i['section'], "title": i['title'], "guid": i['guid'], "rating_key": i['id']} for i in items]
            link_type = "link"
            link_key = "rating_key"

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
                {"key": "section", "label": "섹션", "width": "20%", "header_align": "center", "sortable": True},
                {"key": "title", "label": "대상 항목 (경로/제목)", "width": "45%", "header_align": "center", "type": link_type, "link_key": link_key, "sortable": True},
                {"key": "guid", "label": "에이전트", "width": "25%", "header_align": "center", "sortable": True},
                {"key": "action", "label": "실행", "width": "10%", "align": "center", "header_align": "center", "type": "action_btn", "action_type": "execute", "payload": {"mode": task_data.get('mode', 'refresh')}}
            ],
            "data": table_data
        }

        core_api['cache'].save(res_payload)
        task.update_state('completed', progress=100, total=100)

        if len(items) > 0:
            task.log(f"✅ 조회 완료! 총 {len(items):,}건의 대상을 찾았습니다.")
        else:
            task.log("✅ 라이브러리 검사 완료. 조건에 일치하는 대상이 없습니다.")
        return

    # -----------------------------------------------------------------
    # [Execute 액션]
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
        total = task_data.get('total', 0)
        if task_data.get('_resume_start_index') is not None:
            start_index = task_data['_resume_start_index']
            task.update_state('running', progress=start_index, total=total)
            task.log(f"🔄 중단되었던 {start_index}번째 항목부터 이어서 작업을 재개합니다.")

        if task_data.get('_use_cache_db'):
            def load_all_items(start_idx):
                cache_db_path = core_api['cache'].db_file
                results = []
                with sqlite3.connect(cache_db_path, timeout=10.0) as conn:
                    conn.row_factory = sqlite3.Row
                    c = conn.cursor()
                    
                    c.execute("SELECT * FROM data WHERE pmh_status != 'done' ORDER BY pmh_id LIMIT -1 OFFSET ?", (start_idx,))
                    
                    for r in c.fetchall():
                        row_dict = dict(r)
                        row_dict['id'] = str(row_dict.get('rating_key', row_dict.get('id')))
                        row_dict['rating_key'] = row_dict['id']
                        if isinstance(row_dict.get('files'), str):
                            try: row_dict['files'] = json.loads(row_dict['files'])
                            except: row_dict['files'] = []
                        results.append(row_dict)
                return results
            
            items = load_all_items(start_index)
            total = len(items) + start_index

        else:
            items = task_data.get('target_items', [])

        if total == 0:
            task.update_state('completed', progress=0, total=0)
            task.log("⚠️ 실행할 대상 항목이 없습니다.")
            return

        if not task_data.get('_resume_start_index'):
            mode = task_data.get('mode', 'refresh')
            task.log(f"🚀 총 {total:,}건 작업을 시작합니다.")

    opts = core_api.get('options', {})
    try: sleep_time = float(opts.get('sleep_time', 2))
    except: sleep_time = 2.0

    plex = None
    if mode in ['refresh', 'rematch']:
        try:
            plex = core_api['get_plex']()
            if start_index == 0:
                task.log("🔌 Plex 연결 완료.")
        except Exception as e:
            task.update_state('error'); task.log(f"❌ Plex 연결 실패: {str(e)}"); return

    def wait_until_stable_idle(max_wait_seconds=30):
        if plex is None: return True
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

    opt_vfs = task_data.get('opt_vfs', True)
    idx = start_index

    try:
        for idx, item in enumerate(items, start=start_index + 1):

            if task.is_cancelled():
                task.log("🛑 사용자 요청에 의해 작업을 중단합니다.")
                return

            mid, title = item['id'], item['title']
            task.log(f"[{idx}/{total}] 🎬 '{title}' 처리 중...")

            if mode in ['refresh', 'rematch']:
                if not wait_until_stable_idle(): return

            item_has_error = False

            try:
                if mode == 'path_scan':
                    if not mate_url or not mate_apikey:
                        raise Exception("Plex Mate 서버 URL 또는 API Key가 설정되지 않았습니다.")

                    sec_id = item.get('section_id')

                    if opt_vfs:
                        task.log(f"   -> 📂 Plex Mate VFS/Refresh 호출 중...")
                        if call_plexmate_vfs_refresh(mate_url, mate_apikey, mid):
                            task.log("      ✅ VFS 갱신 성공")
                        else:
                            task.log("      ⚠️ VFS 갱신 실패 (무시하고 스캔을 속행합니다)")

                    task.log(f"   -> 🔍 Plex Mate 경로 스캔 호출 중...")
                    if call_plexmate_scan(mate_url, mate_apikey, mid, sec_id):
                        task.log("      ✅ 스캔 요청 성공 (백그라운드 처리)")
                    else:
                        raise Exception("Plex Mate 응답 오류 또는 연결 실패")

                else:
                    safe_endpoint = f"/library/metadata/{str(mid).strip()}"
                    plex_item = plex.fetchItem(safe_endpoint)

                    if task.is_cancelled(): return

                    if mode == 'refresh':
                        task.log("   -> 🔄 메타데이터 새로고침(Refresh) 호출 중...")
                        plex_item.refresh()
                        task.log("      ✅ 새로고침 요청 완료 (백그라운드에서 진행)")

                    elif mode == 'rematch':
                        task.log("   -> 🔗 스마트 하이브리드 매칭 엔진 가동 중...")
                        
                        import pmh_core
                        try_refresh = task_data.get('opt_try_refresh', True)
                        do_unmatch = task_data.get('opt_unmatch_first', False)
                        
                        success, msg, score = pmh_core.perform_smart_match(
                            plex_url=plex.url, 
                            plex_token=plex._token, 
                            rating_key=mid, 
                            item_title=plex_item.title, 
                            item_year=plex_item.year, 
                            target_agent=plex_item.section().agent,
                            plex_inst=plex,
                            try_refresh_first=try_refresh,
                            do_unmatch_first=do_unmatch
                        )
                        
                        if task.is_cancelled(): return
                        
                        if success:
                            task.log(f"      ✅ {msg}")
                        else:
                            task.log(f"      ⚠️ {msg}")
                            item_has_error = True
                            core_api['cache'].mark_as_error('rating_key', str(mid))

                if action != 'execute_instant':
                    key_name = 'id' if mode == 'path_scan' else 'rating_key'
                    
                    if item_has_error:
                        core_api['cache'].mark_as_error(key_name, str(mid))
                    else:
                        core_api['cache'].mark_keys_as_done(key_name, [str(mid)])

            except Exception as e:
                task.log(f"   -> ❌ 작업 중 치명적 오류 발생: {e}")
                if action != 'execute_instant':
                    key_name = 'id' if mode == 'path_scan' else 'rating_key'
                    core_api['cache'].mark_as_error(key_name, str(mid))

            if task.is_cancelled(): return

            task.update_state('running', progress=idx)

            if sleep_time > 0 and idx < total:
                loops = max(1, int(sleep_time * 2))
                for _ in range(loops):
                    if task.is_cancelled(): return
                    time.sleep(0.5)

        task.update_state('completed', progress=total)

        if task_data.get('_is_single'):
            task.log("✅ 단일 실행 작업이 정상적으로 완료되었습니다!")
        else:
            elapsed_sec = int(time.time() - work_start_time)
            elapsed_str = f"{elapsed_sec // 60}분 {elapsed_sec % 60}초" if elapsed_sec >= 60 else f"{elapsed_sec}초"
            prefix = "[자동 실행] " if task_data.get('_is_cron') else ""
            task.log(f"✅ {prefix}총 {total:,}건의 작업 완료! (소요시간: {elapsed_str})")

            tool_vars = {"mode": mode, "total": f"{total:,}", "elapsed_time": elapsed_str}
            core_api['notify']("배치 스캐너 완료", DEFAULT_DISCORD_TEMPLATE, "#51a351", tool_vars)

    finally:
        current_state = core_api['task'].load(include_target_items=False)
        if current_state:
            real_state = current_state.get('state', 'running')
            if real_state != 'completed':
                task.update_state(real_state, progress=idx)
