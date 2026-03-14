# -*- coding: utf-8 -*-

import os
import urllib.request
import urllib.parse
import time
import unicodedata
import re
import json

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
- 🔄 메타데이터 갱신: {cnt_refresh} 건
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

def natural_sort_key_local(s):
    return [text.zfill(10) if text.isdigit() else text.lower() for text in re.split(r'(\d+)', str(s))]

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
    sections = [{"value": "all", "text": "전체 라이브러리 (All)"}]
    try:
        rows = core_api['query']("SELECT id, name FROM library_sections ORDER BY name")
        for r in rows: sections.append({"value": str(r['id']), "text": r['name']})
    except: pass

    return {
        "title": "스마트 스캐너",
        "description": "미분석/미매칭/메타/마커/YAML 적용 누락 등을 감지하고 최적의 순서로 자동 복구합니다.",
        "inputs": [
            {"id": "h1", "type": "header", "label": "<i class='fas fa-filter'></i> 1. 복구 대상 라이브러리"},
            {"id": "target_sections", "type": "multi_select", "label": "검사할 라이브러리 선택", "options": sections, "default": "all"},
            {"id": "fix_options", "type": "checkbox_group", "label": "선택 옵션", "options": [
                {"id": "opt_analyze", "label": "미분석 항목 감지 및 강제 분석", "default": True},
                {"id": "opt_match", "label": "미매칭 항목 감지 및 자동 매칭 시도", "default": True},
                {"id": "opt_refresh", "label": "포스터 등 메타데이터 유실 의심 항목 새로고침", "default": True},
                {"id": "opt_yaml_season", "label": "3자리 시즌 에피소드 중 YAML 미적용 항목 감지", "default": True},
                {"id": "opt_yaml_marker", "label": "인트로/크레딧 마커 누락 항목 YAML(Plex Mate) 적용", "default": True}
            ]}
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
                 {"key": "cnt_analyze", "desc": "미분석 항목 복구 건수"},
                 {"key": "cnt_match", "desc": "미매칭 자동 복구 건수"},
                 {"key": "cnt_refresh", "desc": "유실 메타 갱신 건수"},
                 {"key": "cnt_yaml_season", "desc": "시즌 YAML 적용 건수"},
                 {"key": "cnt_yaml_marker", "desc": "마커 YAML 적용 건수"}
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
        "button_text": "복구 대상 조회 (Preview)"
    }

# =====================================================================
# 2. 데이터 추출 및 배타적 그룹화 (🔥 작업별 단일 쿼리 최적화 유지)
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
    
    target_libs = core_api['query'](sec_query, tuple(sec_params))
    if not target_libs: return {}

    lib_map = {str(r['id']): r['name'] for r in target_libs}
    lib_ids_str = ",".join(lib_map.keys())

    def add_target(rk, m_type, title, sec_name, fix_type, file_path=None, parent_rk=None):
        if rk not in targets:
            targets[rk] = {"title": title, "section": sec_name, "type": m_type, "fix": fix_type, "files": set()}
        if file_path: targets[rk]["files"].add(file_path)
        if parent_rk: assigned_grandparents.add(parent_rk)

    def format_title(r, is_episode=False):
        if is_episode:
            s_title = r['show_title'] or "Unknown Show"
            sy_str = f" ({r['show_year']})" if r['show_year'] else ""
            s_num = f"S{int(r['s_idx']):02d}" if r['s_idx'] is not None else "S01"
            e_num = f"E{int(r['e_idx']):02d}" if r['e_idx'] is not None else "E01"
            return f"{s_title}{sy_str} / {s_num}{e_num} / {r['title']}"
        else:
            base_title = r['show_title'] if r['metadata_type'] in (3, 4) else r['title']
            year = r['show_year'] if r['metadata_type'] in (3, 4) else r['year']
            return f"{base_title} ({year})" if year else base_title

    base_from = f"""
        SELECT mi.id, mi.metadata_type, mi.title, mp.file, mi.year, mi.parent_id, mi.guid, mi.library_section_id,
               (SELECT parent_id FROM metadata_items WHERE id = mi.parent_id) as grandparent_id,
               (SELECT title FROM metadata_items WHERE id = IFNULL((SELECT parent_id FROM metadata_items WHERE id = mi.parent_id), mi.parent_id)) as show_title,
               (SELECT year FROM metadata_items WHERE id = IFNULL((SELECT parent_id FROM metadata_items WHERE id = mi.parent_id), mi.parent_id)) as show_year,
               (SELECT "index" FROM metadata_items WHERE id = mi.parent_id) as s_idx,
               mi."index" as e_idx
        FROM metadata_items mi
        LEFT JOIN media_items m ON m.metadata_item_id = mi.id
        LEFT JOIN media_parts mp ON mp.media_item_id = m.id
        WHERE mi.library_section_id IN ({lib_ids_str}) AND 
    """

    tasks_to_run = []
    if opts['analyze']: tasks_to_run.append(('analyze', '미분석 항목 감지 중...'))
    if opts['match']: tasks_to_run.append(('match', '미매칭 항목 감지 중...'))
    if opts['refresh']: tasks_to_run.append(('refresh', '메타데이터 유실 의심 항목 감지 중...'))
    if opts['yaml_season']: tasks_to_run.append(('yaml_season', '시즌 YAML 미적용 항목 감지 중...'))
    if opts['yaml_marker']: tasks_to_run.append(('yaml_marker', '마커 누락 항목 감지 중...'))

    total_steps = len(tasks_to_run)

    for step_idx, (fix_type, msg) in enumerate(tasks_to_run, 1):
        if task and task.is_cancelled(): break
        
        if task:
            task.log(f"[{step_idx}/{total_steps}] {msg}")
            task.update_state('running', progress=int((step_idx / total_steps) * 80), total=100)

        if fix_type == 'analyze':
            q_a = base_from + "(m.width IS NULL OR m.width = 0) AND mp.file IS NOT NULL AND mi.metadata_type IN (1, 4)"
            for r in core_api['query'](q_a):
                sec_name = lib_map.get(str(r['library_section_id']), 'Unknown')
                if r['metadata_type'] == 1: add_target(r['id'], 1, format_title(r), sec_name, 'analyze', r['file'], parent_rk=r['id'])
                elif r['metadata_type'] == 4: add_target(r['id'], 4, format_title(r, is_episode=True), sec_name, 'analyze', r['file'], parent_rk=r['grandparent_id'])

        elif fix_type == 'match':
            q_m = base_from + "(mi.guid LIKE 'local://%' OR mi.guid LIKE 'none://%' OR mi.guid = '' OR mi.guid IS NULL) AND mi.metadata_type IN (1, 2)"
            for r in core_api['query'](q_m):
                if r['id'] in assigned_grandparents or r['id'] in targets: continue
                sec_name = lib_map.get(str(r['library_section_id']), 'Unknown')
                add_target(r['id'], r['metadata_type'], format_title(r), sec_name, 'match', parent_rk=r['id'])

        elif fix_type == 'refresh':
            q_r = base_from + """
                (
                    (mi.metadata_type IN (1, 2) AND (mi.user_thumb_url = '' OR mi.user_thumb_url IS NULL OR mi.user_thumb_url NOT LIKE '%://%' OR mi.user_thumb_url LIKE 'media://%.bundle/Contents/Thumbnails/%' OR mi.user_thumb_url LIKE '%discord%attachments%'))
                    OR
                    (mi.metadata_type = 4 AND (SELECT "index" FROM metadata_items WHERE id = mi.parent_id) < 100 AND (mi.user_thumb_url = '' OR mi.user_thumb_url IS NULL OR mi.user_thumb_url NOT LIKE '%://%' OR mi.user_thumb_url LIKE '%discord%attachments%'))
                )
            """
            for r in core_api['query'](q_r):
                sec_name = lib_map.get(str(r['library_section_id']), 'Unknown')
                if r['metadata_type'] in (1, 2):
                    if r['id'] in assigned_grandparents or r['id'] in targets: continue
                    add_target(r['id'], r['metadata_type'], format_title(r), sec_name, 'refresh', parent_rk=r['id'])
                elif r['metadata_type'] == 4 and r['grandparent_id']:
                    if r['grandparent_id'] in assigned_grandparents or r['grandparent_id'] in targets: continue
                    add_target(r['grandparent_id'], 2, format_title(r), sec_name, 'refresh', parent_rk=r['grandparent_id'])

        elif fix_type == 'yaml_season':
            q_ys = base_from + """
                mi.metadata_type = 4 
                AND (SELECT "index" FROM metadata_items WHERE id = mi.parent_id) >= 100
                AND (mi.guid LIKE 'local://%' OR mi.guid = '' OR mi.guid IS NULL)
                AND (SELECT guid FROM metadata_items WHERE id = (SELECT parent_id FROM metadata_items WHERE id = mi.parent_id)) NOT LIKE 'local://%'
                AND (SELECT guid FROM metadata_items WHERE id = (SELECT parent_id FROM metadata_items WHERE id = mi.parent_id)) NOT LIKE 'none://%'
            """
            for r in core_api['query'](q_ys):
                if r['grandparent_id']:
                    if r['grandparent_id'] in assigned_grandparents or r['grandparent_id'] in targets: continue
                    sec_name = lib_map.get(str(r['library_section_id']), 'Unknown')
                    add_target(r['grandparent_id'], 2, format_title(r), sec_name, 'yaml_season', r['file'])

        elif fix_type == 'yaml_marker':
            q_ym = base_from + """
                (
                    (mi.metadata_type = 1 
                     AND mi.id NOT IN (SELECT metadata_item_id FROM taggings WHERE text IN ('intro', 'credits'))
                     AND mi.guid NOT LIKE 'local://%' AND mi.guid NOT LIKE 'none://%' AND mi.guid != '')
                    OR
                    (mi.metadata_type = 4 
                     AND mi.id NOT IN (SELECT metadata_item_id FROM taggings WHERE text IN ('intro', 'credits'))
                     AND (SELECT guid FROM metadata_items WHERE id = (SELECT parent_id FROM metadata_items WHERE id = mi.parent_id)) NOT LIKE 'local://%'
                     AND (SELECT guid FROM metadata_items WHERE id = (SELECT parent_id FROM metadata_items WHERE id = mi.parent_id)) NOT LIKE 'none://%'
                     AND (SELECT guid FROM metadata_items WHERE id = (SELECT parent_id FROM metadata_items WHERE id = mi.parent_id)) != '')
                )
            """
            for r in core_api['query'](q_ym):
                sec_name = lib_map.get(str(r['library_section_id']), 'Unknown')
                if r['metadata_type'] == 1:
                    if r['id'] in assigned_grandparents or r['id'] in targets: continue
                    add_target(r['id'], 1, format_title(r), sec_name, 'yaml_marker', r['file'])
                elif r['metadata_type'] == 4 and r['grandparent_id']:
                    if r['grandparent_id'] in assigned_grandparents or r['grandparent_id'] in targets: continue
                    add_target(r['grandparent_id'], 2, format_title(r), sec_name, 'yaml_marker', r['file'], parent_rk=r['grandparent_id'])

    for rk in targets: targets[rk]['files'] = list(targets[rk]['files'])
    if task: task.update_state('running', progress=90, total=100)
    return targets

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
            if task_state and task_state.get('state') in ['cancelled', 'error'] and task_state.get('progress', 0) < task_state.get('total', 0):
                cached_page = core_api['cache'].load_page(1, 999999)
                if cached_page and cached_page.get('data'):
                    items = []
                    for row in cached_page['data']:
                        items.append({
                            'rating_key': str(row.get('rating_key')),
                            'title': row.get('title'),
                            'section': row.get('section'),
                            'fix_type': row.get('fix_type'),
                            'm_type': int(row.get('m_type', 1)),
                            'files': row.get('files', [])
                        })
                    task_data = data.copy()
                    task_data['target_items'] = items
                    task_data['total'] = len(items)
                    task_data['_resume_start_index'] = task_state.get('progress', 0)
                    task_data['_is_cron'] = True
                    return {"status": "success", "type": "async_task", "task_data": task_data}, 200
            
            # 진행 중인 작업이 없으면 새로 갱신
            task_data = data.copy()
            task_data['_cron_needs_fetch'] = True
            task_data['_is_cron'] = True
            return {"status": "success", "type": "async_task", "task_data": task_data}, 200

        # 2. UI에서 단일 항목 (버튼 클릭) 실행
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
                'm_type': data.get('m_type', 1),
                'files': files_list
            }]
            task_data = data.copy()
            task_data['target_items'] = items
            task_data['total'] = len(items)
            task_data['_is_single'] = True
            return {"status": "success", "type": "async_task", "task_data": task_data}, 200
            
        # 3. UI에서 전체 실행 (캐시된 데이터 가져오기)
        else:
            cached_page = core_api['cache'].load_page(1, 999999)
            if cached_page and cached_page.get('data'):
                items = []
                for row in cached_page['data']:
                    items.append({
                        'rating_key': str(row.get('rating_key')),
                        'title': row.get('title'),
                        'section': row.get('section'),
                        'fix_type': row.get('fix_type'),
                        'm_type': int(row.get('m_type', 1)),
                        'files': row.get('files', [])
                    })
                task_data = data.copy()
                task_data['target_items'] = items
                task_data['total'] = len(items)
                return {"status": "success", "type": "async_task", "task_data": task_data}, 200
            else:
                return {"status": "error", "message": "캐시된 대상이 없습니다. 다시 조회해주세요."}, 400

    return {"status": "error", "message": "알 수 없는 명령"}, 400

# =====================================================================
# 4. 백그라운드 워커 
# =====================================================================
def worker(task_data, core_api, start_index):
    task = core_api['task']

    # -----------------------------------------------------------------
    # [Preview 모드]
    # -----------------------------------------------------------------
    if task_data.get('_is_preview_step'):
        task.log("복구 대상(이슈)을 찾기 위해 라이브러리를 검사합니다...")
        task.update_state('running', progress=0, total=100)
        
        targets = get_target_issues(task_data, core_api, task)
        
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
            if task.is_cancelled(): return
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
        chart_labels_kr = {'analyze': '미분석 항목 강제 분석', 'match': '미매칭 항목 자동 매칭', 'refresh': '메타데이터 새로고침', 'yaml_season': '3자리 시즌 YAML 미적용', 'yaml_marker': '마커 누락 YAML 적용'}

        if total_issues > 0:
            for f_type, count in fix_counts.items():
                if count > 0: chart_items.append({"label": chart_labels_kr[f_type], "count": f"{count}건", "percent": round((count / total_issues) * 100, 1)})
            chart_items.sort(key=lambda x: float(x['percent']), reverse=True)

        action_btn = None
        if len(table_data) > 0: action_btn = {"label": f"<i class='fas fa-magic'></i> 검색된 {len(table_data):,}건 복구 시작", "payload": {"action_type": "execute"}}
            
        res_payload = {
            "status": "success", "type": "datatable",
            "summary_cards": [{"label": "총 복구 대상", "value": f"{total_issues:,} 건", "icon": "fas fa-exclamation-triangle", "color": "#bd362f"}] if total_issues > 0 else [],
            "bar_charts": [{"title": "<i class='fas fa-chart-pie'></i> 작업 유형별 비중 통계", "color": "#2f96b4", "items": chart_items}] if chart_items else [],
            "action_button": action_btn,
            "default_sort": sort_rules,
            "columns": [
                {"key": "section", "label": "섹션", "width": "20%", "sortable": True, "header_align": "center"},
                {"key": "title", "label": "작업 대상(제목)", "width": "50%", "type": "link", "link_key": "rating_key", "sortable": True, "header_align": "center"},
                {"key": "issues", "label": "작업", "width": "20%", "sortable": True, "sort_key": "sort_score", "sort_type": "number", "header_align": "center", "align": "center"},
                {"key": "action", "label": "실행", "width": "10%", "align": "center", "header_align": "center", "type": "action_btn"}
            ],
            "data": table_data
        }
        
        core_api['cache'].save(res_payload)
        task.update_state('completed', progress=100, total=100)
        task.log(f"조회 완료! 총 {total_issues:,}건의 문제를 찾았습니다.")
        return

    # -----------------------------------------------------------------
    # [Execute 모드]
    # -----------------------------------------------------------------
    
    work_start_time = time.time()
    actual_fix_counts = {'analyze': 0, 'match': 0, 'refresh': 0, 'yaml_season': 0, 'yaml_marker': 0}

    if task_data.get('_resume_start_index') is not None:
        start_index = task_data['_resume_start_index']
        items = task_data.get('target_items', [])
        total = task_data.get('total', len(items))
        task.update_state('running', progress=start_index, total=total)
        task.log(f"🤖 [스케줄러] 중단되었던 {start_index}번째 항목부터 이어서 작업을 재개합니다.")

    elif task_data.get('_cron_needs_fetch'):
        task.log("🤖 [스케줄러] 새로운 복구 대상을 조회합니다...")
        targets = get_target_issues(task_data, core_api, task)
        
        items, table_data = [], []
        fix_scores = {'analyze': 1, 'match': 2, 'refresh': 3, 'yaml_season': 4, 'yaml_marker': 5}
        fix_labels = {'analyze': "<span style='color:#2f96b4;'>분석</span>", 'match': "<span style='color:#bd362f;'>매칭</span>", 'refresh': "<span style='color:#51a351;'>새로고침</span>", 'yaml_season': "<span style='color:#e5a00d;'>시즌 YAML</span>", 'yaml_marker': "<span style='color:#e5a00d;'>마커 YAML</span>"}

        for rk, info in targets.items():
            fix_type = info['fix']
            label_html = fix_labels.get(fix_type, "Unknown")
            item_data = {"rating_key": str(rk), "section": info['section'], "title": info['title'], "sort_score": fix_scores.get(fix_type, 6), "fix_type": fix_type, "m_type": info['type'], "files": info['files']}
            items.append(item_data)
            
            cache_data = item_data.copy()
            cache_data['issues'] = label_html
            table_data.append(cache_data)
            
        sort_rules = [{"key": "sort_score", "dir": "asc"}, {"key": "section", "dir": "asc"}, {"key": "title", "dir": "asc"}]
        items = core_api['sort'](items, sort_rules)
        
        if not items:
            task.update_state('completed', progress=0, total=0)
            task.log("실행할 대상 항목이 없습니다. 스케줄링을 종료합니다.")
            return
            
        res_payload = {
            "status": "success", "type": "datatable", 
            "action_button": {"label": f"<i class='fas fa-magic'></i> 검색된 {len(items):,}건 복구 시작", "payload": {"action_type": "execute"}},
            "default_sort": sort_rules,
            "columns": [
                {"key": "section", "label": "섹션", "width": "20%", "sortable": True, "header_align": "center"},
                {"key": "title", "label": "작업 대상(제목)", "width": "55%", "type": "link", "link_key": "rating_key", "sortable": True, "header_align": "center"},
                {"key": "issues", "label": "작업", "width": "15%", "sortable": True, "sort_key": "sort_score", "sort_type": "number", "header_align": "center", "align": "center"},
                {"key": "action", "label": "실행", "width": "10%", "align": "center", "header_align": "center", "type": "action_btn"}
            ],
            "data": table_data
        }
        core_api['cache'].save(res_payload)
        total = len(items)
        task.update_state('running', progress=0, total=total)
        task.log(f"🤖 [스케줄러] 데이터베이스 갱신 완료. 총 {total:,}건 복구 작업을 시작합니다.")

    else:
        items = task_data.get('target_items', [])
        total = task_data.get('total', len(items))
        if total == 0:
            task.update_state('completed', progress=0, total=0)
            task.log("실행할 대상 항목이 없습니다.")
            return
            
        if start_index > 0: task.log(f"중단되었던 {start_index}번째 항목부터 작업을 재개합니다.")
        else: task.log(f"총 {total:,}건 작업을 시작합니다.")
    
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

    for idx, item in enumerate(items[start_index:], start=start_index + 1):
        if task.is_cancelled(): 
            task.log("🛑 취소 명령 감지. 작업을 중단합니다.")
            return

        rk = item['rating_key']
        fix_type = item['fix_type']
        title = item['title']
        m_type = item['m_type']
        files = item['files']

        task.update_state('running', progress=idx)
        task.log(f"[{idx}/{total}] '{title}' 복구 진행 중... (작업: {fix_type})")

        if not wait_until_stable(): return
        skip_delay = False 
        
        try:
            if fix_type in ['yaml_season', 'yaml_marker']:
                yaml_filename = 'movie.yaml' if m_type == 1 else 'show.yaml'
                yml_filename = 'movie.yml' if m_type == 1 else 'show.yml'
                
                yaml_exists = False
                if files:
                    for f in files:
                        local_path = translate_path(f, path_mappings)
                        target_dir = get_show_root_dir(local_path)
                        if os.path.exists(os.path.join(target_dir, yaml_filename)) or os.path.exists(os.path.join(target_dir, yml_filename)):
                            yaml_exists = True; break
                
                if not yaml_exists:
                    task.log(f"   -> 대상 폴더에 {yaml_filename} 파일이 없습니다. (작업 패스)")
                    skip_delay = True 
                elif not mate_url or not mate_apikey:
                    task.log("   -> YAML 적용 불가 (Plex Mate 설정 누락)")
                    skip_delay = True 
                else:
                    task.log("   -> Plex Mate에 YAML 연동 요청")
                    if call_plexmate_refresh(mate_url, mate_apikey, rk): task.log("      (연동 성공!)")
                    else: task.log("      (연동 실패)")
                        
            else:
                safe_endpoint = f"/library/metadata/{str(rk).strip()}"
                plex_item = plex.fetchItem(safe_endpoint)
                
                if task.is_cancelled(): return
                
                if fix_type == 'analyze':
                    task.log("   -> 미디어 분석(Analyze) 요청")
                    plex_item.analyze()
                elif fix_type == 'match':
                    task.log("   -> 자동 매칭(Auto Match) 시도")
                    matches = plex_item.matches()
                    if task.is_cancelled(): return
                    if matches: plex_item.fixMatch(matches[0])
                    else: task.log("      (매칭 결과를 찾을 수 없습니다)")
                elif fix_type == 'refresh':
                    task.log("   -> 메타데이터 새로고침(Refresh) 진행")
                    plex_item.refresh()
            
            actual_fix_counts[fix_type] += 1

        except Exception as e:
            task.log(f"   -> ❌ 오류 발생: {e}")
            
        if task.is_cancelled(): return
        if not task_data.get('_is_cron'):
            core_api['cache'].mark_as_done('rating_key', str(rk))
        
        if sleep_time > 0 and not skip_delay and idx < total:
            loops = max(1, int(sleep_time * 2))
            for _ in range(loops):
                if task.is_cancelled(): 
                    task.log("🛑 대기 중 사용자 취소 명령 감지. 작업을 중단합니다.")
                    return
                time.sleep(0.5)

    # -------------------------------------------------------------
    # [일괄 검증 및 종료 처리]
    # -------------------------------------------------------------
    if not task.is_cancelled() and not task_data.get('_is_single'):
        analyze_rks = [str(item['rating_key']) for item in items if item['fix_type'] == 'analyze']
        if analyze_rks:
            task.log("분석 작업 완료. DB 갱신 상태를 일괄 검증합니다...")
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
                            if str(item['rating_key']) == fail_rk_str:
                                fail_title = item['title']
                                break
                        corrupt_titles.append(fail_title)
                
                if corrupt_titles:
                    task.log("=" * 45)
                    task.log(f"🚨 [분석 실패 (파일 손상, 읽기 권한, 클라우드 마운트 해제 의심): 총 {len(corrupt_titles):,}건]")
                    for c_title in corrupt_titles: task.log(f"   > {c_title}")
                    task.log("=" * 45)
                else: task.log("모든 분석 항목이 정상적으로 갱신되었습니다.")
            except Exception as e:
                task.log(f"⚠️ 일괄 검증 과정 중 오류 발생: {type(e).__name__} - {str(e)}")

        task.update_state('completed', progress=total)
        
        elapsed_sec = int(time.time() - work_start_time)
        elapsed_str = f"{elapsed_sec // 60}분 {elapsed_sec % 60}초" if elapsed_sec >= 60 else f"{elapsed_sec}초"
        
        prefix = "[자동 실행] " if task_data.get('_is_cron') else ""
        task.log(f"✅ {prefix}총 {total:,}건의 복구 작업 완료! (소요시간: {elapsed_str})")
        
        tool_vars = {
            "total": f"{total:,}",
            "elapsed_time": elapsed_str,
            "cnt_analyze": f"{actual_fix_counts['analyze']:,}",
            "cnt_match": f"{actual_fix_counts['match']:,}",
            "cnt_refresh": f"{actual_fix_counts['refresh']:,}",
            "cnt_yaml_season": f"{actual_fix_counts['yaml_season']:,}",
            "cnt_yaml_marker": f"{actual_fix_counts['yaml_marker']:,}"
        }
        
        core_api['notify']("스마트 스캐너 완료", DEFAULT_DISCORD_TEMPLATE, "#e5a00d", tool_vars)
        
    elif not task.is_cancelled():
        task.update_state('completed', progress=total)
        task.log("✅ 단일 실행 작업이 정상적으로 완료되었습니다!")
