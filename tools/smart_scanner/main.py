# -*- coding: utf-8 -*-

import os
import urllib.request
import urllib.parse
import time
import unicodedata
import re
import json
import sqlite3

# =====================================================================
# 디스코드 알림 기본 템플릿
# =====================================================================
DEFAULT_DISCORD_TEMPLATE = """**✅ 스마트 스캐너 작업이 완료되었습니다.**

**[📊 종합 통계]**
- 총 소요 시간: {elapsed_time}
- 처리된 대상: {total} 건

**[🛠️ 세부 작업 내역]**
- 🔍 미분석 강제 분석: {cnt_analyze} 건
- 🔗 미매칭 자동 매칭: {cnt_match} 건
- 🔄 메타/포스터 유실 갱신: {cnt_refresh} 건
- 📺 시즌 YAML 적용: {cnt_yaml_season} 건
- 📌 마커 YAML 적용: {cnt_yaml_marker} 건
"""

# =====================================================================
# 도우미 함수
# =====================================================================
def is_season_folder(folder_name):
    name_lower = unicodedata.normalize('NFC', folder_name).lower().strip()
    if re.match(r'^(season|시즌|series|s)\s*\d+\b', name_lower): return True
    if re.match(r'^(specials?|스페셜|extras?|특집|ova|ost)(\s*\d+)?$', name_lower): return True
    if name_lower.isdigit(): return True
    return False

def get_show_root_dir(file_path):
    dir_path = os.path.dirname(file_path)
    while True:
        base_name = os.path.basename(dir_path)
        if not base_name: break
        if is_season_folder(base_name):
            parent_path = os.path.dirname(dir_path)
            if parent_path == dir_path: break
            dir_path = parent_path
        else:
            break
    return dir_path

def translate_path(plex_path, mappings):
    if not mappings or not plex_path: return plex_path
    plex_path = plex_path.replace('\\', '/')
    for m in mappings:
        if "|" not in m: continue
        p_path, s_path = m.split("|", 1)
        p_path, s_path = p_path.strip().replace('\\', '/'), s_path.strip().replace('\\', '/')
        if p_path and plex_path.startswith(p_path): return s_path + plex_path[len(p_path):]
    return plex_path

def call_plexmate_refresh(mate_url, apikey, rating_key):
    url = f"{mate_url.rstrip('/')}/plex_mate/api/scan/manual_refresh"
    data = urllib.parse.urlencode({'apikey': apikey, 'metadata_item_id': rating_key}).encode('utf-8')
    req = urllib.request.Request(url, data=data, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            return json.loads(response.read()).get('ret') == 'success'
    except: return False

# =====================================================================
# 1. UI 스키마
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
        "title": "스마트 스캐너",
        "description": "미분석/미매칭/메타/마커/YAML 적용 누락 등을 감지하고 최적의 순서로 자동 복구합니다.",
        "inputs": [
            {"id": "target_sections", "type": "multi_select", "label": "조회 대상 섹션", "options": sections, "default": default_secs},
            {"id": "fix_options", "type": "checkbox_group", "label": "선택 옵션", "options": [
                {"id": "opt_analyze", "label": "미분석 항목 감지 및 강제 분석", "default": True},
                {"id": "opt_match", "label": "미매칭 항목 감지 및 자동 매칭 시도", "default": True},
                {"id": "opt_refresh", "label": "포스터/메타데이터 유실 의심 항목 새로고침", "default": True},
                {"id": "opt_yaml_season", "label": "3자리 시즌 에피소드 중 YAML 미적용 항목 감지", "default": True},
                {"id": "opt_yaml_marker", "label": "인트로/크레딧 마커 누락 항목 YAML 적용", "default": True}
            ]},
            {"id": "opt_analyze_audio", "type": "checkbox", "label": "비디오 분석 시 오디오 코덱 검사 포함", "default": True, "show_if": {"opt_analyze": True}}
        ],
        "execute_inputs": [
            {"id": "opt_try_refresh", "type": "checkbox", "label": "매칭 전 리프레시 우선 시도<span style='color:#777;'>(Plex 기본 에이전트)</span>", "default": True, "show_if": {"mode": "rematch"}},
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
            {"id": "discord_bot_name", "type": "text", "label": "디스코드 봇 이름 오버라이딩", "placeholder": "예: {server_name}의 봇"},
            {"id": "discord_avatar_url", "type": "text", "label": "디스코드 봇 프로필 이미지 URL", "placeholder": "https://.../icon.png"},
            {"id": "discord_template", "type": "textarea", "label": "본문 메시지 템플릿 편집", "height": 160, "default": DEFAULT_DISCORD_TEMPLATE, 
             "template_vars": [
                 {"key": "total", "desc": "처리된 총 항목 수"},
                 {"key": "elapsed_time", "desc": "총 소요 시간 (예: 5분 20초)"},
                 {"key": "cnt_analyze", "desc": "미분석 복구"},
                 {"key": "cnt_match", "desc": "미매칭 복구"},
                 {"key": "cnt_refresh", "desc": "유실 갱신"},
                 {"key": "cnt_yaml_season", "desc": "시즌 YAML"},
                 {"key": "cnt_yaml_marker", "desc": "마커 YAML"}
             ]},
             
            {"id": "discord_template_footer", "type": "textarea", "label": "푸터(Footer) 템플릿 편집", "height": 50, "default": "Plex Meta Helper - {tool_id} | {server_name}", 
             "template_vars": [
                 {"key": "tool_id", "desc": "실행된 툴의 고유 ID"},
                 {"key": "server_id", "desc": "실행 대상 서버 식별자 앞 8자리"},
                 {"key": "server_name", "desc": "사용자가 설정한 서버 이름"},
                 {"key": "date", "desc": "현재 날짜"},
                 {"key": "time", "desc": "현재 시간"}
             ]}
        ],
        "buttons": [
            {
                "label": "대상 조회 (Preview)", 
                "action_type": "preview", 
                "icon": "fas fa-search", 
                "color": "#2f96b4"
            },
            {
                "label": "즉시 전체 복구 시작", 
                "action_type": "execute_instant", 
                "icon": "fas fa-magic", 
                "color": "#e5a00d"
            }
        ]
    }

# =====================================================================
# 2. 데이터 추출 및 배타적 그룹화
# =====================================================================
def get_target_issues(req_data, core_api, task=None):
    target_sections = req_data.get('target_sections', [])
    opts = {
        'analyze': req_data.get('opt_analyze', True),
        'match': req_data.get('opt_match', True),
        'refresh': req_data.get('opt_refresh', True),
        'yaml_season': req_data.get('opt_yaml_season', True),
        'yaml_marker': req_data.get('opt_yaml_marker', True)
    }
    
    targets = {}
    assigned_grandparents = set()

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
        return {}, 0

    if not target_libs: 
        if task: task.log("⚠️ 선택한 라이브러리를 찾을 수 없습니다.")
        return {}, 0

    lib_map = {str(r['id']): r['name'] for r in target_libs}
    lib_ids_str = ",".join(lib_map.keys())

    total_scanned = 0
    try:
        count_q = f"SELECT COUNT(*) as cnt FROM metadata_items WHERE library_section_id IN ({lib_ids_str}) AND metadata_type IN (1, 2, 3, 4, 8, 9, 10)"
        count_res = core_api['query'](count_q)
        if count_res: total_scanned = count_res[0]['cnt']
    except Exception: pass

    def add_target(rk, m_type, title, sec_name, fix_type, file_path=None, parent_rk=None):
        target_rk = parent_rk if parent_rk and fix_type in ['match', 'refresh'] else rk
        
        if target_rk not in targets:
            targets[target_rk] = {"title": title, "section": sec_name, "type": m_type, "fix": fix_type, "files": set()}
            
        if file_path: targets[target_rk]["files"].add(file_path)
        if parent_rk: assigned_grandparents.add(parent_rk)

    base_from = f"""
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
        WHERE mi.library_section_id IN ({lib_ids_str}) AND 
    """

    def format_title(r, is_episode=False, is_parent=False):
        m_type = r[1]
        raw_title = r[2]
        
        if is_parent:
            if m_type == 3:
                s_title = r[9] or "Unknown Show"
                s_num = f"시즌 {int(r[12])}" if r[12] is not None else "Unknown Season"
                return f"{s_title} / {s_num}"
                
            base_title = r[9] if m_type in (8, 10) else raw_title
            year = r[10] if m_type in (8, 10) else r[4]
        elif is_episode:
            s_title = r[9] or "Unknown Show"
            if m_type == 10:
                s_num = f"Disc {int(r[11]):02d}" if r[11] is not None else "Disc 01"
                e_num = f"Track {int(r[12]):02d}" if r[12] is not None else "Track 01"
            else:
                s_num = f"S{int(r[11]):02d}" if r[11] is not None else "S01"
                e_num = f"E{int(r[12]):02d}" if r[12] is not None else "E01"
            return f"{s_title} / {s_num} / {e_num} - {raw_title or 'Unknown Episode'}"
        else:
            base_title = raw_title
            year = r[4]
            
        if not base_title: 
            base_title = raw_title
            
        if base_title:
            return f"{base_title} ({year})" if year else str(base_title)
        return ""

    tasks_to_run = []
    if opts['analyze']: tasks_to_run.append(('analyze', '미분석 파일 감지 중...'))
    if opts['match']: tasks_to_run.append(('match', '미매칭 항목 감지 중...'))
    if opts['refresh']: tasks_to_run.append(('refresh', '메타데이터 유실 감지 중...'))
    if opts['yaml_season']: tasks_to_run.append(('yaml_season', '시즌 번호 3자리 이상 YAML 미적용 감지 중...'))
    if opts['yaml_marker']: tasks_to_run.append(('yaml_marker', '마커 누락 항목 감지 중...'))

    total_steps = len(tasks_to_run)
    if total_steps == 0:
        if task: task.log("⚠️ 선택된 복구 옵션이 없습니다.")
        return targets, total_scanned

    plex_db_path = core_api['config'].get('plex_db_path', '')

    plex_conn = None
    try:
        plex_conn = sqlite3.connect(f'file:{plex_db_path}?mode=ro', uri=True, timeout=10.0)
        plex_c = plex_conn.cursor()
        
        for step_idx, (fix_type, msg) in enumerate(tasks_to_run, 1):
            if task and task.is_cancelled(): break
            
            if task: 
                progress_pct = int((step_idx / total_steps) * 80)
                task.log(f"⏳ [{step_idx}/{total_steps}] {msg}")
                task.update_state('running', progress=progress_pct, total=100)

            query = ""
            if fix_type == 'analyze':
                opt_audio = req_data.get('opt_analyze_audio', True)
                audio_check_sql = "OR m.audio_codec IS NULL OR m.audio_codec = ''" if opt_audio else ""
                
                query = base_from + f"""
                    mi.metadata_type IN (1, 4, 10) AND EXISTS (
                        SELECT 1 FROM media_items m 
                        WHERE m.metadata_item_id = mi.id AND (
                            (mi.metadata_type IN (1, 4) AND (m.width IS NULL OR m.width = 0 {audio_check_sql}))
                            OR
                            (mi.metadata_type = 10 AND (m.audio_codec IS NULL OR m.audio_codec = ''))
                        )
                    ) AND EXISTS (
                        SELECT 1 FROM media_items m 
                        JOIN media_parts mp ON mp.media_item_id = m.id 
                        WHERE m.metadata_item_id = mi.id AND mp.file IS NOT NULL
                    )
                """
            elif fix_type == 'match':
                query = base_from + "(mi.guid LIKE 'local://%' OR mi.guid LIKE 'none://%' OR mi.guid = '' OR mi.guid IS NULL) AND mi.metadata_type IN (1, 2, 9)"
            
            elif fix_type == 'refresh':
                bad_thumb = """
                    (
                        mi.user_thumb_url = '' OR 
                        mi.user_thumb_url IS NULL OR 
                        mi.user_thumb_url = 'upload://' OR
                        mi.user_thumb_url = 'metadata://' OR
                        mi.user_thumb_url NOT LIKE '%://%' OR
                        mi.user_thumb_url LIKE 'media://%.bundle/Contents/Thumbnails/%' OR 
                        mi.user_thumb_url LIKE '%discord%attachments%'
                    )
                """
                query = base_from + f"""
                    (
                        (mi.metadata_type IN (1, 2, 9) AND {bad_thumb})
                        OR
                        (mi.metadata_type = 3 AND mi."index" < 100 AND {bad_thumb})
                        OR
                        (mi.metadata_type IN (4, 8) AND (SELECT "index" FROM metadata_items WHERE id = mi.parent_id) < 100 AND {bad_thumb})
                    )
                """
                
            elif fix_type == 'yaml_season':
                query = base_from + """
                    mi.metadata_type = 4 
                    AND mi.parent_id IN (SELECT id FROM metadata_items WHERE "index" >= 100)
                    AND (mi.guid LIKE 'local://%' OR mi.guid = '' OR mi.guid IS NULL) 
                    AND mi.parent_id IN (
                        SELECT parent.id FROM metadata_items parent 
                        JOIN metadata_items grandparent ON grandparent.id = parent.parent_id 
                        WHERE grandparent.guid NOT LIKE 'local://%' AND grandparent.guid NOT LIKE 'none://%' AND grandparent.guid != ''
                    )
                """
            elif fix_type == 'yaml_marker':
                query = base_from + """
                    (
                        (mi.metadata_type = 1 
                         AND NOT EXISTS (SELECT 1 FROM taggings WHERE metadata_item_id = mi.id AND text IN ('intro', 'credits')) 
                         AND mi.guid NOT LIKE 'local://%' AND mi.guid NOT LIKE 'none://%' AND mi.guid != '')
                        OR
                        (mi.metadata_type = 4 
                         AND NOT EXISTS (SELECT 1 FROM taggings WHERE metadata_item_id = mi.id AND text IN ('intro', 'credits')) 
                         AND mi.parent_id IN (
                            SELECT parent.id FROM metadata_items parent 
                            JOIN metadata_items grandparent ON grandparent.id = parent.parent_id 
                            WHERE grandparent.guid NOT LIKE 'local://%' AND grandparent.guid NOT LIKE 'none://%' AND grandparent.guid != ''
                         )
                        )
                    )
                """

            if query:
                plex_c.execute(query)
                while True:
                    rows = plex_c.fetchmany(10000)
                    if not rows: break
                    if task and task.is_cancelled(): break
                    
                    for r in rows:
                        rk, m_type, title, f_path, parent_id, grandparent_id = r[0], r[1], r[2], r[3], r[5], r[8]
                        sec_name = lib_map.get(str(r[7]), 'Unknown')
                        
                        if m_type == 1: 
                            display_title = format_title(r)
                            add_target(rk, 1, display_title, sec_name, fix_type, f_path, parent_rk=rk)
                        elif m_type in (2, 3, 8, 9):
                            display_title = format_title(r, is_parent=True)
                            add_target(rk, m_type, display_title, sec_name, fix_type, f_path, parent_rk=rk)
                        elif m_type in (4, 10): 
                            actual_parent = grandparent_id or parent_id
                            display_title = format_title(r, is_parent=True) if fix_type in ['match', 'refresh'] else format_title(r, is_episode=True)
                            add_target(rk, m_type, display_title, sec_name, fix_type, f_path, parent_rk=actual_parent)
                            
            if task: task.log(f"   ✓ {msg.replace(' 중...', ' 완료.')}")

    except Exception as e:
        if task: task.log(f"❌ Plex DB 연결 또는 쿼리 실패: {e}")
    finally:
        if plex_conn:
            try: plex_conn.close()
            except: pass

    for rk in list(targets.keys()): 
        if not targets[rk]['title'] or targets[rk]['title'].strip() == "":
            f_paths = list(targets[rk]['files'])
            if f_paths:
                fallback_name = os.path.basename(f_paths[0]) or os.path.basename(os.path.dirname(f_paths[0]))
                targets[rk]['title'] = fallback_name
            else:
                targets[rk]['title'] = f"Unknown Media (ID: {rk})"

        raw_files = list(targets[rk]['files'])
        tmp_wrapped = [{"path": f} for f in raw_files]
        sorted_wrapped = core_api['sort'](tmp_wrapped, [{"key": "path", "dir": "asc"}])
        targets[rk]['files'] = [item["path"] for item in sorted_wrapped]
    
    if task: 
        task.log(f"✅ DB 쿼리 수집 완료.")
        task.update_state('running', progress=90, total=100)
        
    return targets, total_scanned

# =====================================================================
# 3. 메인 라우터
# =====================================================================
def run(data, core_api):
    action = data.get('action_type', 'preview')

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
                cached_page = core_api['cache'].load_page(1, 1)
                if cached_page and cached_page.get('total_items', 0) > 0:
                    task_data = data.copy()
                    task_data['_use_cache_db'] = True
                    task_data['total'] = cached_page.get('total_items')
                    task_data['_resume_start_index'] = task_state.get('progress', 0)
                    task_data.pop('target_items', None)
                    return {"status": "success", "type": "async_task", "task_data": task_data}, 200
            
            task_data = data.copy()
            task_data['action_type'] = 'execute_instant'
            return {"status": "success", "type": "async_task", "task_data": task_data}, 200

        elif data.get('_is_single'):
            raw_files = data.get('files', [])
            if isinstance(raw_files, str):
                try: files_list = json.loads(raw_files)
                except: files_list = []
            else: files_list = raw_files

            items = [{
                'rating_key': str(data.get('rating_key')),
                'title': data.get('title', '단일 항목'),
                'section': data.get('section', ''),
                'fix_type': data.get('fix_type', 'analyze'),
                'm_type': int(data.get('m_type', 1)),
                'files': files_list
            }]
            task_data = data.copy()
            task_data['target_items'] = items
            task_data['total'] = len(items)
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

    if action == 'preview':
        task.log("🔍 복구 대상(이슈)을 찾기 위해 라이브러리 검사를 시작합니다...")
        task.update_state('running', progress=0, total=100)
        
        targets, total_scanned = get_target_issues(task_data, core_api, task)
        
        if task.is_cancelled(): 
            task.log("🛑 조회 작업이 사용자에 의해 취소되었습니다.")
            return

        task.log("📊 검색된 데이터를 기반으로 UI 테이블을 생성합니다...")
        task.update_state('running', progress=95, total=100)

        table_data = []
        total_issues = len(targets)
        fix_counts = {'analyze': 0, 'match': 0, 'refresh': 0, 'yaml_season': 0, 'yaml_marker': 0}
        
        fix_labels = {
            'analyze': ("<span style='color:#2f96b4;'>분석</span>", 1),
            'match': ("<span style='color:#bd362f;'>매칭</span>", 2),
            'refresh': ("<span style='color:#51a351;'>새로고침</span>", 3),
            'yaml_season': ("<span style='color:#e5a00d;'>시즌 YAML</span>", 4),
            'yaml_marker': ("<span style='color:#e5a00d;'>마커 YAML</span>", 5)
        }

        for rk, info in targets.items():
            fix_type = info['fix']
            fix_counts[fix_type] = fix_counts.get(fix_type, 0) + 1
            label_html, sort_score = fix_labels.get(fix_type, ("Unknown", 6))
            table_data.append({
                "rating_key": str(rk), "section": info['section'], "title": info['title'], 
                "issues": label_html, "sort_score": sort_score, "fix_type": fix_type, 
                "m_type": info['type'], "files": info['files'] 
            })
        
        sort_rules = [{"key": "sort_score", "dir": "asc"}, {"key": "section", "dir": "asc"}, {"key": "title", "dir": "asc"}]

        chart_items = []
        chart_labels_kr = {'analyze': '미분석 항목 (강제 분석)', 'match': '미매칭 항목 (자동 매칭)', 'refresh': '메타데이터 유실 (새로고침)', 'yaml_season': '시즌 메타 누락 (YAML 적용)', 'yaml_marker': '마커 누락 (YAML 적용)'}

        if total_issues > 0:
            for f_type, count in fix_counts.items():
                if count > 0: chart_items.append({"label": chart_labels_kr[f_type], "count": f"{count}건", "percent": round((count / total_issues) * 100, 1)})
            chart_items.sort(key=lambda x: float(x['percent']), reverse=True)

        summary_cards = []
        if total_scanned > 0:
            summary_cards.append({"label": "총 검사 항목 수", "value": f"{total_scanned:,} 건", "icon": "fas fa-search", "color": "#2f96b4"})
            
        if total_issues > 0:
            summary_cards.append({"label": "복구 필요 항목", "value": f"{total_issues:,} 건", "icon": "fas fa-exclamation-triangle", "color": "#bd362f"})

        action_btn = None
        if len(table_data) > 0: 
            action_btn = {
                "label": f"<i class='fas fa-magic'></i> 검색된 {total_issues:,}건 복구 시작", 
                "payload": {"action_type": "execute"} 
            }
            
        res_payload = {
            "status": "success", "type": "datatable",
            "summary_cards": summary_cards,
            "bar_charts": [{"title": "<i class='fas fa-chart-pie'></i> 작업 유형별 비중 통계", "color": "#2f96b4", "items": chart_items}] if chart_items else [],
            "action_button": action_btn,
            "default_sort": sort_rules,
            "columns": [
                {"key": "section", "label": "섹션", "width": "20%", "sortable": True, "header_align": "center"},
                {"key": "title", "label": "작업 대상(제목)", "width": "50%", "type": "link", "link_key": "rating_key", "sortable": True, "header_align": "center"},
                {"key": "issues", "label": "필요 작업", "width": "20%", "sortable": True, "sort_key": "sort_score", "sort_type": "number", "header_align": "center", "align": "center"},
                {"key": "action", "label": "실행", "width": "10%", "align": "center", "header_align": "center", "type": "action_btn", "action_type": "execute"}
            ],
            "data": table_data
        }
        
        core_api['cache'].save(res_payload)
        task.update_state('completed', progress=100, total=100)
        
        if total_issues > 0:
            task.log(f"✅ 조회 완료! 총 {total_issues:,}건의 복구 대상을 찾았습니다.")
            task.log("   (잠시 후 결과 화면으로 자동 이동합니다...)")
        else:
            task.log("✅ 라이브러리 검사 완료. 모든 항목이 정상입니다! (복구 대상 없음)")
            
        return

    # -----------------------------------------------------------------
    # [Execute / Execute_Instant 모드]
    # -----------------------------------------------------------------
    work_start_time = time.time()
    actual_fix_counts = {'analyze': 0, 'match': 0, 'refresh': 0, 'yaml_season': 0, 'yaml_marker': 0}

    if action == 'execute_instant':
        task.log("새로운 복구 대상을 조회하여 즉시 실행을 준비합니다...")
        targets, _ = get_target_issues(task_data, core_api, task)
        items = []
        for rk, info in targets.items():
            items.append({
                "rating_key": str(rk), "section": info['section'], "title": info['title'], 
                "fix_type": info['fix'], "m_type": info['type'], "files": info['files']
            })
        total = len(items)
        task.log(f"조회 완료. 총 {total:,}건 복구 작업을 시작합니다.")
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
                        row_dict['id'] = str(row_dict.get('rating_key', row_dict.get('id', '')))
                        row_dict['rating_key'] = row_dict['id']
                        
                        if isinstance(row_dict.get('files'), str):
                            try: row_dict['files'] = json.loads(row_dict['files'])
                            except: row_dict['files'] = []
                        elif not row_dict.get('files'):
                            row_dict['files'] = []
                            
                        row_dict['m_type'] = int(row_dict.get('m_type', 1))
                        row_dict['fix_type'] = row_dict.get('fix_type', 'analyze')
                        
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
            task.log(f"🚀 총 {total:,}건 작업을 시작합니다.")

    opts = core_api.get('options', {})
    try: sleep_time = float(opts.get('sleep_time', 2))
    except: sleep_time = 2.0
    
    mate_url = core_api['config'].get('mate_url', '')
    mate_apikey = core_api['config'].get('mate_apikey', '')
    path_mappings = core_api['config'].get('path_mappings', [])

    try:
        plex = core_api['get_plex']()
        if start_index == 0: 
            prefix = "[자동 실행] " if task_data.get('_is_cron') else ""
            task.log(f"{prefix}Plex 연결 완료.")
    except Exception as e:
        task.update_state('error'); task.log(f"Plex 연결 실패: {str(e)}"); return

    def wait_until_stable(max_wait_seconds=30):
        stable_count = 0
        waited_time = 0
        while waited_time < max_wait_seconds:
            if task.is_cancelled(): return False
            try:
                if len(plex.query('/activities').findall('Activity')) == 0:
                    stable_count += 1
                    if stable_count >= 2: return True
                else: stable_count = 0
            except: pass
            
            for _ in range(4):
                if task.is_cancelled(): return False
                time.sleep(0.5)
            waited_time += 2
            
        task.log("⚠️ Plex 작업 큐 대기 시간 초과. 강제로 다음 항목을 진행합니다.")
        return True

    idx = start_index

    try:
        for idx, item in enumerate(items, start=start_index + 1):
            
            if task.is_cancelled(): 
                task.log("🛑 취소 명령 감지. 작업을 중단합니다.")
                return

            rk = item['rating_key']
            fix_type = item['fix_type']
            title = item['title']
            m_type = item['m_type']
            files = item['files']

            task.log(f"[{idx}/{total}] 🎬 '{title}' 복구 진행 중...")

            if not wait_until_stable(): return
            skip_delay = False 
            item_has_error = False

            try:
                if fix_type in ['yaml_season', 'yaml_marker']:
                    yaml_filename = 'movie.yaml' if m_type == 1 else 'show.yaml'
                    yml_filename = 'movie.yml' if m_type == 1 else 'show.yml'
                    
                    log_tag = "시즌 메타" if fix_type == 'yaml_season' else "마커(인트로)"
                    task.log(f"   -> [YAML {log_tag}] 대상 폴더 내 {yaml_filename} 존재 여부 확인 중...")
                    
                    yaml_exists = False
                    if files:
                        for f in files:
                            local_path = translate_path(f, path_mappings)
                            target_dir = get_show_root_dir(local_path)
                            if os.path.exists(os.path.join(target_dir, yaml_filename)) or os.path.exists(os.path.join(target_dir, yml_filename)):
                                yaml_exists = True; break
                    
                    if not yaml_exists:
                        task.log(f"      ⚠️ 대상 폴더에 {yaml_filename} 파일이 없어 적용을 스킵합니다.")
                        skip_delay = True 
                    elif not mate_url or not mate_apikey:
                        task.log("      ⚠️ Plex Mate 연결 설정(URL/API Key)이 누락되어 YAML 적용이 불가합니다.")
                        skip_delay = True 
                        item_has_error = True
                    else:
                        task.log("      ✅ YAML 파일 확인 완료. Plex Mate로 동기화 API를 호출합니다...")
                        if call_plexmate_refresh(mate_url, mate_apikey, rk): 
                            task.log("         ➔ 🟢 Plex Mate 연동 성공! (YAML 정보가 Plex에 반영됩니다)")
                        else: 
                            task.log("         ➔ 🔴 Plex Mate 연동 실패 (서버 응답 오류)")
                            item_has_error = True

                else:
                    safe_endpoint = f"/library/metadata/{str(rk).strip()}"
                    plex_item = plex.fetchItem(safe_endpoint)
                    
                    if task.is_cancelled(): return
                    
                    if fix_type == 'analyze':
                        task.log("   -> [미분석] 분석(Analyze) 호출 및 완료 대기 중...")
                        plex_item.analyze()
                        
                        analyze_success = False
                        opt_audio = task_data.get('opt_analyze_audio', True)
                        
                        for _ in range(10):
                            if task.is_cancelled(): return
                            time.sleep(2.5)
                            
                            plex_item.reload()
                            
                            if plex_item.media:
                                is_fully_analyzed = True
                                for m in plex_item.media:
                                    if m_type in (1, 4):
                                        has_width = bool(getattr(m, 'width', None))
                                        has_audio = bool(getattr(m, 'audioCodec', None))
                                        
                                        if not has_width or (opt_audio and not has_audio):
                                            is_fully_analyzed = False
                                            break
                                    elif m_type == 10:
                                        if not getattr(m, 'audioCodec', None):
                                            is_fully_analyzed = False
                                            break
                                            
                                if is_fully_analyzed:
                                    analyze_success = True
                                    break
                                    
                        if analyze_success:
                            task.log("      ✅ 분석 완료 및 미디어 정보 갱신 확인!")
                        else:
                            msg_detail = "(해상도 및 오디오 코덱)" if opt_audio else "(해상도)"
                            task.log(f"      ❌ 분석 실패: 제한 시간 내에 유효한 미디어 정보{msg_detail}를 읽지 못했습니다. (클라우드 로딩 지연 또는 손상 의심)")
                            item_has_error = True

                    elif fix_type == 'match':
                        task.log("   -> [미매칭] 스마트 하이브리드 매칭 엔진 가동 중...")
                        
                        import pmh_core
                        try_refresh = task_data.get('opt_try_refresh', True)
                        do_unmatch = task_data.get('opt_unmatch_first', False)
                        
                        success, msg, score = pmh_core.perform_smart_match(
                            plex_url=plex.url, 
                            plex_token=plex._token, 
                            rating_key=rk, 
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
                            core_api['cache'].mark_as_error('rating_key', str(rk))

                    elif fix_type == 'refresh':
                        task.log("   -> [메타 유실] 새로고침(Refresh) 호출 중...")
                        plex_item.refresh()
                        task.log("      ✅ 새로고침 요청 완료 (백그라운드에서 에이전트 데이터 갱신 진행)")
                
                actual_fix_counts[fix_type] += 1
                
                if action != 'execute_instant':
                    if item_has_error:
                        core_api['cache'].mark_as_error('rating_key', str(rk))
                    else:
                        core_api['cache'].mark_keys_as_done('rating_key', [str(rk)])

            except Exception as e:
                task.log(f"   -> ❌ 작업 중 치명적 오류 발생: {e}")
                if action != 'execute_instant':
                    core_api['cache'].mark_as_error('rating_key', str(rk))

            if task.is_cancelled(): return
            
            task.update_state('running', progress=idx)
            
            if sleep_time > 0 and not skip_delay and idx < total:
                loops = max(1, int(sleep_time * 2))
                for _ in range(loops):
                    if task.is_cancelled(): return
                    time.sleep(0.5)

        if not task_data.get('_is_single'):
            analyze_rks = [str(i['rating_key']) for i in items if i['fix_type'] == 'analyze']
            if analyze_rks:
                task.log("🔍 분석 작업 완료. Plex DB 갱신 상태를 일괄 검증합니다...")
                time.sleep(2) 
                
                try:
                    corrupt_titles = []
                    for i in range(0, len(analyze_rks), 500):
                        chunk = analyze_rks[i:i+500]
                        placeholders = ",".join("?" for _ in chunk)
                        check_q = f"""
                            SELECT mi.id, mi.metadata_type 
                            FROM metadata_items mi
                            JOIN media_items m ON m.metadata_item_id = mi.id
                            WHERE mi.id IN ({placeholders}) AND (
                                (mi.metadata_type IN (1, 4) AND (m.width IS NULL OR m.width = 0))
                                OR
                                (mi.metadata_type = 10 AND (m.audio_codec IS NULL OR m.audio_codec = ''))
                            )
                        """
                        for r in core_api['query'](check_q, tuple(chunk)):
                            fail_rk_str = str(r['id'])
                            fail_title = f"Unknown Title (ID:{fail_rk_str})"
                            for it in items:
                                if str(it['rating_key']) == fail_rk_str:
                                    fail_title = it['title']
                                    break
                            corrupt_titles.append(fail_title)
                            core_api['cache'].mark_as_error('rating_key', fail_rk_str)
                    
                    if corrupt_titles:
                        task.log("=" * 45)
                        task.log(f"🚨 [분석 실패 (파일 손상, 읽기 권한, 클라우드 마운트 해제 의심): 총 {len(corrupt_titles):,}건]")
                        for c_title in corrupt_titles: task.log(f"   > {c_title}")
                        task.log("=" * 45)
                    else: 
                        task.log("✅ 모든 분석 항목이 정상적으로 갱신(미디어 정보 등록)되었습니다.")
                except Exception as e:
                    task.log(f"⚠️ 일괄 검증 과정 중 오류 발생: {type(e).__name__} - {str(e)}")

        task.update_state('completed', progress=total)
        
        if not task_data.get('_is_single'):
            elapsed_sec = int(time.time() - work_start_time)
            elapsed_str = f"{elapsed_sec // 60}분 {elapsed_sec % 60}초" if elapsed_sec >= 60 else f"{elapsed_sec}초"
            prefix = "[자동 실행] " if task_data.get('_is_cron') else ""
            task.log(f"✅ {prefix}총 {total:,}건의 복구 작업 완료! (소요시간: {elapsed_str})")
            
            tool_vars = {
                "total": f"{total:,}", "elapsed_time": elapsed_str,
                "cnt_analyze": f"{actual_fix_counts['analyze']:,}", "cnt_match": f"{actual_fix_counts['match']:,}",
                "cnt_refresh": f"{actual_fix_counts['refresh']:,}", "cnt_yaml_season": f"{actual_fix_counts['yaml_season']:,}",
                "cnt_yaml_marker": f"{actual_fix_counts['yaml_marker']:,}"
            }
            core_api['notify']("스마트 스캐너 완료", DEFAULT_DISCORD_TEMPLATE, "#e5a00d", tool_vars)

    finally:
        current_state = core_api['task'].load(include_target_items=False)
        if current_state:
            real_state = current_state.get('state', 'running')
            if real_state != 'completed':
                task.update_state(real_state, progress=idx)
