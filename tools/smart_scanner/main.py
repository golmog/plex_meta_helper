# -*- coding: utf-8 -*-

import os
import urllib.request
import urllib.parse
import json
import time
import unicodedata
import re

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
        "description": "미분석/미매칭/메타/마커/YAML 적용 누락 등을 감지하고 최적의 순서로 복구합니다.",
        "inputs": [
            {"id": "h1", "type": "header", "label": "<i class='fas fa-filter'></i> 1. 복구 대상 라이브러리"},
            {"id": "target_section", "type": "select", "label": "검사할 라이브러리 선택", "options": sections},
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
            {"id": "sleep_time", "type": "number", "label": "항목 처리 후 대기 시간 (단위: 초, 권장: 2초)", "default": 2},
            {"id": "s_h2", "type": "header", "label": "<i class='fab fa-discord'></i> 알림 설정"},
            {"id": "discord_enable", "type": "checkbox", "label": "작업 완료 시 디스코드 알림 발송", "default": True},
            {"id": "discord_webhook", "type": "text", "label": "툴 전용 웹훅 URL (비워두면 서버 전역 설정 사용)", "placeholder": "https://discord.com/api/webhooks/..."}
        ],
        "button_text": "복구 대상 조회 (Preview)"
    }

# =====================================================================
# 2. 데이터 추출 및 배타적 그룹화
# =====================================================================
def get_target_issues(req_data, core_api):
    section_id = req_data.get('target_section', 'all')
    opts = {
        'analyze': req_data.get('opt_analyze', True),
        'match': req_data.get('opt_match', True),
        'refresh': req_data.get('opt_refresh', True),
        'yaml_season': req_data.get('opt_yaml_season', True),
        'yaml_marker': req_data.get('opt_yaml_marker', True)
    }
    targets = {}
    assigned_grandparents = set()

    def add_target(rk, m_type, title, sec_name, fix_type, file_path=None, parent_rk=None):
        if rk not in targets:
            targets[rk] = {"title": title, "section": sec_name, "type": m_type, "fix": fix_type, "files": set()}
        if file_path: 
            targets[rk]["files"].add(file_path)
        if parent_rk:
            assigned_grandparents.add(parent_rk)

    def get_query(where_clause):
        q = f"""
            SELECT mi.id, mi.metadata_type, mi.title, mp.file, mi.year, mi.parent_id, mi.guid,
                   ls.name AS section_name,
                   (SELECT parent_id FROM metadata_items WHERE id = mi.parent_id) as grandparent_id,
                   (SELECT title FROM metadata_items WHERE id = IFNULL((SELECT parent_id FROM metadata_items WHERE id = mi.parent_id), mi.parent_id)) as show_title,
                   (SELECT year FROM metadata_items WHERE id = IFNULL((SELECT parent_id FROM metadata_items WHERE id = mi.parent_id), mi.parent_id)) as show_year,
                   (SELECT "index" FROM metadata_items WHERE id = mi.parent_id) as s_idx,
                   mi."index" as e_idx
            FROM metadata_items mi
            JOIN library_sections ls ON mi.library_section_id = ls.id
            LEFT JOIN media_items m ON m.metadata_item_id = mi.id
            LEFT JOIN media_parts mp ON mp.media_item_id = m.id
            WHERE {where_clause}
        """
        params = []
        if str(section_id) != 'all':
            q += " AND mi.library_section_id = ?"
            params.append(section_id)
        return q, params

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

    # 1. 미분석 탐지
    if opts['analyze']:
        q, p = get_query("(m.width IS NULL OR m.width = 0 OR m.bitrate IS NULL) AND mp.file IS NOT NULL AND mi.metadata_type IN (1, 4)")
        for r in core_api['query'](q, tuple(p)):
            if r['metadata_type'] == 1: 
                add_target(r['id'], 1, format_title(r), r['section_name'], 'analyze', r['file'], parent_rk=r['id'])
            elif r['metadata_type'] == 4:
                add_target(r['id'], 4, format_title(r, is_episode=True), r['section_name'], 'analyze', r['file'], parent_rk=r['grandparent_id'])

    # 2. 미매칭 탐지
    if opts['match']:
        q, p = get_query("(mi.guid LIKE 'local://%' OR mi.guid LIKE 'none://%' OR mi.guid = '' OR mi.guid IS NULL) AND mi.metadata_type IN (1, 2)")
        for r in core_api['query'](q, tuple(p)):
            if r['id'] in assigned_grandparents or r['id'] in targets: continue
            add_target(r['id'], r['metadata_type'], format_title(r), r['section_name'], 'match', parent_rk=r['id'])

    # 3. 포스터 유실 의심 (새로고침)
    if opts['refresh']:
        where_clause = """
            (
                (mi.metadata_type IN (1, 2) AND (mi.user_thumb_url = '' OR mi.user_thumb_url IS NULL OR mi.user_thumb_url NOT LIKE '%://%' OR mi.user_thumb_url LIKE 'media://%.bundle/Contents/Thumbnails/%' OR mi.user_thumb_url LIKE '%discord%attachments%'))
                OR
                (mi.metadata_type = 4 AND (SELECT "index" FROM metadata_items WHERE id = mi.parent_id) < 100 AND (mi.user_thumb_url = '' OR mi.user_thumb_url IS NULL OR mi.user_thumb_url NOT LIKE '%://%' OR mi.user_thumb_url LIKE '%discord%attachments%'))
            )
        """
        q, p = get_query(where_clause)
        for r in core_api['query'](q, tuple(p)):
            if r['metadata_type'] in (1, 2):
                if r['id'] in assigned_grandparents or r['id'] in targets: continue
                add_target(r['id'], r['metadata_type'], format_title(r), r['section_name'], 'refresh', parent_rk=r['id'])
            elif r['metadata_type'] == 4 and r['grandparent_id']:
                if r['grandparent_id'] in assigned_grandparents or r['grandparent_id'] in targets: continue
                add_target(r['grandparent_id'], 2, format_title(r), r['section_name'], 'refresh', parent_rk=r['grandparent_id'])

    # 4-1. 3자리 시즌 YAML 미적용 감지
    if opts['yaml_season']:
        # 자신(에피소드)은 local:// 인데, 쇼 대표는 정상 매칭되어 있는 경우
        q_s, p_s = get_query("""
            mi.metadata_type = 4 
            AND (SELECT "index" FROM metadata_items WHERE id = mi.parent_id) >= 100
            AND (mi.guid LIKE 'local://%' OR mi.guid = '' OR mi.guid IS NULL)
            AND (
                SELECT guid FROM metadata_items WHERE id = (SELECT parent_id FROM metadata_items WHERE id = mi.parent_id)
            ) NOT LIKE 'local://%'
            AND (
                SELECT guid FROM metadata_items WHERE id = (SELECT parent_id FROM metadata_items WHERE id = mi.parent_id)
            ) NOT LIKE 'none://%'
        """)
        for r in core_api['query'](q_s, tuple(p_s)):
            if r['grandparent_id']:
                if r['grandparent_id'] in assigned_grandparents or r['grandparent_id'] in targets: continue
                add_target(r['grandparent_id'], 2, format_title(r), r['section_name'], 'yaml_season', r['file'])

    # 4-2. 마커 누락 YAML 적용 감지 (영화 및 TV 쇼 에피소드 모두 포함)
    if opts['yaml_marker']:
        where_clause_marker = """
            (
                (mi.metadata_type = 1 
                 AND mi.id NOT IN (SELECT metadata_item_id FROM taggings WHERE text IN ('intro', 'credits'))
                 AND mi.guid NOT LIKE 'local://%' 
                 AND mi.guid NOT LIKE 'none://%' 
                 AND mi.guid != '')
                OR
                (mi.metadata_type = 4 
                 AND mi.id NOT IN (SELECT metadata_item_id FROM taggings WHERE text IN ('intro', 'credits'))
                 AND (SELECT guid FROM metadata_items WHERE id = (SELECT parent_id FROM metadata_items WHERE id = mi.parent_id)) NOT LIKE 'local://%'
                 AND (SELECT guid FROM metadata_items WHERE id = (SELECT parent_id FROM metadata_items WHERE id = mi.parent_id)) NOT LIKE 'none://%'
                 AND (SELECT guid FROM metadata_items WHERE id = (SELECT parent_id FROM metadata_items WHERE id = mi.parent_id)) != '')
            )
        """
        q_m, p_m = get_query(where_clause_marker)
        for r in core_api['query'](q_m, tuple(p_m)):
            # 영화인 경우 (자기 자신 추가)
            if r['metadata_type'] == 1:
                if r['id'] in assigned_grandparents or r['id'] in targets: continue
                add_target(r['id'], 1, format_title(r), r['section_name'], 'yaml_marker', r['file'])
            
            # 에피소드인 경우 (해당 에피소드가 속한 '쇼 대표'를 추가)
            elif r['metadata_type'] == 4 and r['grandparent_id']:
                if r['grandparent_id'] in assigned_grandparents or r['grandparent_id'] in targets: continue
                # 쇼 대표 하나만 목록에 올리고, 이 쇼에 속한 다른 에피소드가 발견돼도 위 continue에 의해 중복 무시됨
                add_target(r['grandparent_id'], 2, format_title(r), r['section_name'], 'yaml_marker', r['file'], parent_rk=r['grandparent_id'])

    # Set으로 모인 파일 경로들을 최종적으로 리스트로 변환
    for rk in targets:
        targets[rk]['files'] = list(targets[rk]['files'])

    return targets

# =====================================================================
# 3. 메인 라우터
# =====================================================================
def run(data, core_api):
    action = data.get('action_type', 'preview')

    if action == 'preview':
        targets = get_target_issues(data, core_api)
        table_data = []
        
        total_issues = len(targets)
        # [수정됨] 통계 딕셔너리 확장
        fix_counts = {'analyze': 0, 'match': 0, 'refresh': 0, 'yaml_season': 0, 'yaml_marker': 0}
        
        # [수정됨] 화면 출력 라벨 및 정렬 우선순위 확장
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
                "rating_key": str(rk),
                "section": info['section'],
                "title": info['title'], 
                "issues": label_html, 
                "sort_score": sort_score,
                "fix_type": fix_type,
                "m_type": info['type'],
                "files": list(info['files'])
            })
        
        chart_items = []
        chart_labels_kr = {
            'analyze': '미분석 항목 강제 분석',
            'match': '미매칭 항목 자동 매칭',
            'refresh': '메타데이터 새로고침',
            'yaml_season': '3자리 시즌 YAML 미적용',
            'yaml_marker': '마커 누락 YAML 적용'
        }

        if total_issues > 0:
            for f_type, count in fix_counts.items():
                if count > 0:
                    pct = round((count / total_issues) * 100, 1)
                    chart_items.append({"label": chart_labels_kr[f_type], "count": f"{count}건", "percent": pct})
            chart_items.sort(key=lambda x: float(x['percent']), reverse=True)

        action_btn = None
        if len(table_data) > 0:
            action_btn = {"label": f"<i class='fas fa-magic'></i> 전체 {len(table_data)}건 복구 시작", "payload": {"action_type": "execute"}}
            
        return {
            "status": "success",
            "type": "datatable",
            "summary_cards": [
                {"label": "총 복구 대상", "value": f"{total_issues:,} 건", "icon": "fas fa-exclamation-triangle", "color": "#bd362f"}
            ] if total_issues > 0 else [],
            "bar_charts": [
                {"title": "<i class='fas fa-chart-pie'></i> 작업 유형별 비중 통계", "color": "#2f96b4", "items": chart_items}
            ] if chart_items else [],
            "action_button": action_btn,
            "default_sort": [{"key": "sort_score", "dir": "asc"}, {"key": "section", "dir": "asc"}, {"key": "title", "dir": "asc"}],
            "columns": [
                {"key": "section", "label": "섹션", "width": "20%", "sortable": True, "header_align": "center"},
                {"key": "title", "label": "복구 항목 (클릭 시 이동)", "width": "55%", "type": "link", "link_key": "rating_key", "sortable": True, "header_align": "center"},
                {"key": "issues", "label": "작업", "width": "15%", "sortable": True, "sort_key": "sort_score", "sort_type": "number", "header_align": "center", "align": "center"},
                {"key": "action", "label": "실행", "width": "10%", "align": "center", "header_align": "center", "type": "action_btn"}
            ],
            "data": table_data
        }, 200

    if action == 'execute':
        if data.get('_is_single'):
            targets = {
                str(data.get('rating_key')): {
                    "title": data.get('title', '단일 항목'),
                    "section": data.get('section', ''),
                    "fix": data.get('fix_type', 'analyze'),
                    "type": data.get('m_type', 1),
                    "files": data.get('files', [])
                }
            }
        else:
            targets = get_target_issues(data, core_api)
            
        if not targets: return {"status": "error", "message": "실행할 대상이 없습니다."}, 400
        
        task_data = {"targets": targets, "total": len(targets)}
        if data.get('_is_single'): task_data['_is_single'] = True
            
        return {"status": "success", "type": "async_task", "task_data": task_data}, 200

    return {"status": "error", "message": "알 수 없는 명령"}, 400

# =====================================================================
# 4. 백그라운드 워커 (실제 복구 수행 및 일괄 검증)
# =====================================================================
def translate_path(plex_path, mappings):
    if not mappings or not plex_path: return plex_path
    plex_path = plex_path.replace('\\', '/')
    for m in mappings:
        if "|" not in m: continue
        p_path, s_path = m.split("|", 1)
        p_path, s_path = p_path.strip().replace('\\', '/'), s_path.strip().replace('\\', '/')
        if p_path and plex_path.startswith(p_path):
            return s_path + plex_path[len(p_path):]
    return plex_path

def call_plexmate_refresh(mate_url, apikey, rating_key):
    url = f"{mate_url.rstrip('/')}/plex_mate/api/scan/manual_refresh"
    data = urllib.parse.urlencode({'apikey': apikey, 'metadata_item_id': rating_key}).encode('utf-8')
    req = urllib.request.Request(url, data=data, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            return json.loads(response.read()).get('ret') == 'success'
    except: return False

def worker(task_data, core_api, start_index):
    task = core_api['task']
    targets = task_data.get('targets', {})
    total = task_data.get('total', len(targets))
    
    opts = core_api.get('options', {})
    try: sleep_time = float(opts.get('sleep_time', 2))
    except: sleep_time = 2.0
    
    mate_url = core_api['config'].get('mate_url', '')
    mate_apikey = core_api['config'].get('mate_apikey', '')
    path_mappings = core_api['config'].get('path_mappings', [])

    try:
        plex = core_api['get_plex']()
        if start_index == 0: task.log("Plex 서버 연결 완료.")
    except Exception as e:
        task.update_state('error'); task.log(f"Plex 연결 실패: {str(e)}")
        return

    def wait_until_stable():
        stable_count = 0
        while True:
            if task.is_cancelled(): return False
            try:
                if len(plex.query('/activities').findall('Activity')) == 0:
                    stable_count += 1
                    if stable_count >= 2: return True
                else: stable_count = 0
            except: pass
            time.sleep(2)

    fix_scores = {'analyze': 1, 'match': 2, 'refresh': 3, 'yaml_season': 4, 'yaml_marker': 5}
    sorted_rks = sorted(targets.keys(), key=lambda k: (
        fix_scores.get(targets[k]['fix'], 6),
        natural_sort_key_local(targets[k].get('section', '')),
        natural_sort_key_local(targets[k].get('title', ''))
    ))

    for idx, rk in enumerate(sorted_rks[start_index:], start=start_index + 1):
        if task.is_cancelled():
            task.log("사용자 요청에 의해 작업을 중단합니다."); break

        info = targets[rk]
        fix_type = info['fix']
        task.update_state('running', progress=idx)
        task.log(f"[{idx}/{total}] '{info['title']}' 복구 진행 중... (작업: {fix_type})")

        if not wait_until_stable(): break
        
        skip_delay = False 
        
        try:
            # 1. YAML 적용 작업일 경우: 파일 유무를 먼저 검사하여 불필요한 Plex 통신을 차단
            if fix_type in ['yaml_season', 'yaml_marker']:
                yaml_filename = 'movie.yaml' if info['type'] == 1 else 'show.yaml'
                yml_filename = 'movie.yml' if info['type'] == 1 else 'show.yml'
                
                yaml_exists = False
                if info['files']:
                    for f in info['files']:
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
                    if call_plexmate_refresh(mate_url, mate_apikey, rk): 
                        task.log("      (연동 성공!)")
                    else: 
                        task.log("      (연동 실패)")
                        
            # 2. Plex API 작업 (Analyze, Match, Refresh)
            else:
                safe_endpoint = f"/library/metadata/{str(rk).strip()}"
                plex_item = plex.fetchItem(safe_endpoint)
                
                if fix_type == 'analyze':
                    task.log("   -> 미디어 분석(Analyze) 요청")
                    plex_item.analyze()
                elif fix_type == 'match':
                    task.log("   -> 자동 매칭(Auto Match) 시도")
                    matches = plex_item.matches()
                    if matches: plex_item.fixMatch(matches[0])
                    else: task.log("      (매칭 결과를 찾을 수 없습니다)")
                elif fix_type == 'refresh':
                    task.log("   -> 메타데이터 새로고침(Refresh) 진행")
                    plex_item.refresh()

        except Exception as e:
            task.log(f"   -> 오류 발생: {e}")
            
        core_api['cache'].mark_as_done('rating_key', str(rk))
        
        if sleep_time > 0 and not skip_delay:
            loops = max(1, int(sleep_time * 2))
            for _ in range(loops):
                if task.is_cancelled(): return
                time.sleep(0.5)

    # -------------------------------------------------------------
    # [일괄 검증 및 종료 처리]
    # -------------------------------------------------------------
    # 전체 실행(배치 모드)이면서, 도중에 취소되지 않았을 때만 일괄 검증 수행
    if not task.is_cancelled() and not task_data.get('_is_single'):
        analyze_rks = [str(k) for k in sorted_rks if targets[k]['fix'] == 'analyze']
        if analyze_rks:
            task.log("분석 작업 완료. DB 갱신 상태를 일괄 검증합니다...")
            time.sleep(2) 
            
            try:
                corrupt_titles = []
                for i in range(0, len(analyze_rks), 500):
                    chunk = analyze_rks[i:i+500]
                    placeholders = ",".join("?" for _ in chunk)
                    check_q = f"SELECT metadata_item_id FROM media_items WHERE metadata_item_id IN ({placeholders}) AND (width IS NULL OR width = 0)"
                    rows = core_api['query'](check_q, tuple(chunk))
                    for r in rows:
                        fail_rk_str = str(r['metadata_item_id'])
                        fail_title = targets.get(fail_rk_str, {}).get('title', f"Unknown Title (ID:{fail_rk_str})")
                        corrupt_titles.append(fail_title)
                
                if corrupt_titles:
                    task.log("=" * 45)
                    task.log(f"🚨 [분석 실패 (파일 손상, 읽기 권한, 클라우드 마운트 해제 의심): 총 {len(corrupt_titles)}건]")
                    for c_title in corrupt_titles: 
                        task.log(f"   > {c_title}")
                    task.log("=" * 45)
                else:
                    task.log("모든 분석 항목이 정상적으로 갱신되었습니다.")
            except Exception as e:
                task.log(f"⚠️ 일괄 검증 과정 중 오류 발생: {type(e).__name__} - {str(e)}")

        task.update_state('completed', progress=total)
        msg = f"총 {total}건의 전체 스마트 복구 작업이 완료되었습니다! (딜레이: {sleep_time}초)"
        task.log(msg)
        core_api['notify']("스마트 스캐너 완료", msg, "#e5a00d")
        
    elif not task.is_cancelled():
        task.update_state('completed', progress=total)
        msg = "단일 실행 작업이 정상적으로 완료되었습니다!"
        task.log(msg)
