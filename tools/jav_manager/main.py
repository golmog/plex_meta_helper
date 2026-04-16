# -*- coding: utf-8 -*-
import os
import re
import sqlite3
import json
import time
import urllib.request
import urllib.parse
import pmh_core
from collections import defaultdict
from pmh_core import compile_jav_rules, extract_jav_pid, normalize_pid_for_comparison

def normalize_pid(pid_str):
    return normalize_pid_for_comparison(pid_str)

# =====================================================================
# 디스코드 알림 기본 템플릿
# =====================================================================
DEFAULT_DISCORD_TEMPLATE = """**✅ JAV 매니저 작업이 완료되었습니다.**

**[📊 종합 통계]**
- 총 소요 시간: {elapsed_time}
- 처리된 대상: {total} 건

**[🛠️ 세부 작업 내역]**
- 검사 모드: {scan_mode_label}
"""

# ==============================================================================
# UI 스키마 제공
# ==============================================================================
def get_ui(core_api=None):
    sections = []
    default_secs = []

    history_db_path = ""
    if core_api and 'config' in core_api:
        base_dir = core_api['config'].get('base_dir', '')
        history_db_path = os.path.join(base_dir, 'task_logs', 'jav_manager_poster_history.db')

    if core_api:
        try:
            res = core_api['query']("SELECT id, name FROM library_sections ORDER BY name ASC")
            for r in res:
                sec_val = str(r["id"])
                sections.append({"value": sec_val, "text": r["name"]})
                default_secs.append(sec_val)
        except Exception: pass

    return {
        "title": "JAV 매니저",
        "icon": "fas fa-heart",
        "description": "JAV 라이브러리의 오류 검출이나 기타 관리를 실행합니다.",
        "inputs": [
            {
                "id": "target_sections",
                "type": "multi_select",
                "label": "조회 대상 라이브러리",
                "options": sections if sections else [{"value": "", "text": "라이브러리 없음"}],
                "default": default_secs
            },
            {
                "id": "scan_mode",
                "type": "radio_group",
                "label": "검사 모드",
                "default": "mismatch",
                "options": [
                    {"value": "mismatch", "label": "품번 불일치 및 오매칭 검출"},
                    {"value": "dupes", "label": "품번 기준 분리/중복 등록 검출"},
                    {"value": "actor", "label": "배우 이름 한글화 대상 검출"},
                    {"value": "user_poster", "label": "유저 포스터 일괄 적용 (이미지 서버 사용시)"},
                    {"value": "file_error", "label": "파일명 처리 오류 (기본/원본 품번 불일치) 검출"}
                ]
            }
        ],
        "execute_inputs": [
            {
                "id": "retry_errors",
                "type": "checkbox",
                "label": "이전에 실패(Error)한 항목도 다시 시도",
                "default": False,
                "hide_if": {"scan_mode": "file_error"}
            }
        ],
        "settings_inputs": [
            {"id": "s_h1", "type": "header", "label": "<i class='fas fa-tachometer-alt'></i> 실행 속도 제어"},
            {
                "id": "sleep_time", 
                "type": "number", 
                "label": "항목 처리 후 대기 시간 (단위: 초)", 
                "default": 1
            },
            
            {"id": "s_h_opts", "type": "header", "label": "<i class='fas fa-cogs'></i> 처리 옵션"},
            {
                "id": "actors_db_path",
                "type": "text",
                "label": "배우 DB (actors.db) 파일 경로",
                "default": "/data/dev/metadata/files/jav_actors2.db",
                "placeholder": "/data/dev/metadata/files/jav_actors2.db"
            },
            {
                "id": "image_server_path",
                "type": "text",
                "label": "포스터 경로 (서버 내 로컬 경로)",
                "default": "/data/images",
                "placeholder": "예) /mnt/images"
            },
            {
                "id": "image_web_url",
                "type": "text",
                "label": "포스터 웹 접근 주소 (미리보기 용 URL)",
                "default": "",
                "placeholder": "예) https://ff.your-server.com/images"
            },
            {
                "id": "s_h_db", 
                "type": "header", 
                "label": f"<div style='display:flex; flex-direction:column; gap:4px;'><span style='font-size:14px;'><i class='fas fa-database'></i> 포스터 적용 이력 영구 DB 관리</span><span style='font-size:11px; color:#888; font-weight:normal;'><i class='fas fa-folder-open'></i> DB 경로: {history_db_path}</span></div>"
            },
            {
                "id": "btn_clear_history_db",
                "type": "sub_action",
                "action_type": "clear_poster_history",
                "label": "적용 이력 초기화 (DB 삭제)",
                "color": "#bd362f",
                "icon": "fas fa-trash-alt",
                "msg_pos": "right",
                "width": "auto"
            },

            {"id": "s_h_cron", "type": "header", "label": "<i class='fas fa-clock'></i> 자동 실행 스케줄러"},
            {"id": "cron_enable", "type": "checkbox", "label": "크론탭(Crontab) 기반 자동 실행 활성화", "default": False},
            {"id": "cron_expr", "type": "cron", "label": "크론탭 시간 설정 (분 시 일 월 요일)", "placeholder": "0 4 * * *"},
            
            {"id": "s_h2", "type": "header", "label": "<i class='fab fa-discord'></i> 알림 설정"},
            {"id": "discord_enable", "type": "checkbox", "label": "작업 완료 시 디스코드 통계 알림 발송", "default": True},
            {"id": "discord_webhook", "type": "text", "label": "툴 전용 웹훅 URL (비워두면 서버 전역 설정 사용)", "placeholder": "https://discord.com/api/webhooks/..."},
            {"id": "discord_bot_name", "type": "text", "label": "디스코드 봇 이름 오버라이딩", "placeholder": "예: {server_name}의 봇"},
            {"id": "discord_avatar_url", "type": "text", "label": "디스코드 봇 프로필 이미지 URL", "placeholder": "https://.../icon.png"},
            {
                "id": "discord_template", "type": "textarea", "label": "본문 메시지 템플릿 편집", "height": 130, "default": DEFAULT_DISCORD_TEMPLATE, 
                "template_vars": [
                    {"key": "total", "desc": "처리된 총 항목 수"},
                    {"key": "elapsed_time", "desc": "총 소요 시간 (예: 5분 20초)"},
                    {"key": "scan_mode_label", "desc": "실행한 검사 모드 이름"}
                ]
            },
            {
                "id": "discord_template_footer", "type": "textarea", "label": "푸터(Footer) 템플릿 편집", "height": 50, "default": "Plex Meta Helper - {tool_id} | {server_name}", 
                "template_vars": [
                    {"key": "tool_id", "desc": "실행된 툴의 고유 ID"},
                    {"key": "server_name", "desc": "사용자가 설정한 서버 이름"},
                    {"key": "time", "desc": "현재 시간"}
                ]
            }
        ],
        "buttons": [
            {"action_type": "preview", "label": "목록 조회", "icon": "fas fa-search", "color": "#2f96b4"}
        ]
    }

# ==============================================================================
# 메인 실행 로직 (라우터)
# ==============================================================================
def run(data, core_api):
    action = data.get('action_type', 'preview')

    if action == 'preview':
        task_data = data.copy()
        task_data['_auto_refresh_ui'] = True  
        return {"status": "success", "type": "async_task", "task_data": task_data}, 200

    if action == 'cron_run':
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
                    task_data['_is_cron'] = True
                    return {"status": "success", "type": "async_task", "task_data": task_data}, 200

            task_data = data.copy()
            task_data['action_type'] = 'cron_run'
            task_data['_is_cron'] = True
            return {"status": "success", "type": "async_task", "task_data": task_data}, 200

        elif data.get('_is_single'):
            items = [{
                'id': str(data.get('id')),
                'title': data.get('title', '단일 항목'),
                'op_action': data.get('op_action', 'match'),
                'section_name': data.get('section_name', ''),
                '_raw_db_pid': data.get('_raw_db_pid', ''),
                '_raw_sec_id': data.get('_raw_sec_id', '')
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

    if action == 'clear_poster_history':
        try:
            base_dir = core_api['config'].get('base_dir', '')
            db_path = os.path.join(base_dir, 'task_logs', 'jav_manager_poster_history.db')
            
            deleted_any = False
            for ext in ["", "-wal", "-shm"]:
                target_path = db_path + ext
                if os.path.exists(target_path):
                    try:
                        os.remove(target_path)
                        deleted_any = True
                    except OSError:
                        pass

            if deleted_any:
                return {"status": "success", "message": "포스터 이력 DB가 완전히 삭제되었습니다."}, 200
            else:
                return {"status": "success", "message": "삭제할 파일이 없습니다. (이미 초기화됨)"}, 200
        except Exception as e:
            return {"status": "error", "message": f"DB 삭제 실패: {str(e)}"}, 500

    return {"status": "error", "message": f"지원하지 않는 명령입니다 ({action})"}, 400

# ==============================================================================
# 포스터 이력 영구 DB 관리 헬퍼
# ==============================================================================
def _init_history_db(db_path):
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    with sqlite3.connect(db_path, timeout=5.0) as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS poster_history (
                section_id TEXT,
                pid TEXT,
                applied_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (section_id, pid)
            )
        """)

def _get_applied_posters(db_path):
    applied = set()
    if not os.path.exists(db_path): return applied
    try:
        with sqlite3.connect(f"file:{db_path}?mode=ro", uri=True, timeout=5.0) as conn:
            c = conn.cursor()
            c.execute("SELECT section_id, pid FROM poster_history")
            for row in c.fetchall():
                applied.add(f"{row[0]}_{row[1]}")
    except: pass
    return applied

def _mark_poster_applied(db_path, section_id, pid):
    _init_history_db(db_path)
    try:
        with sqlite3.connect(db_path, timeout=5.0) as conn:
            conn.execute("INSERT OR REPLACE INTO poster_history (section_id, pid) VALUES (?, ?)", (str(section_id), pid))
    except Exception as e:
        print(f"[_mark_poster_applied DB 에러] {e}")
        pass

# ==============================================================================
# 워커 쓰레드 로직 (백그라운드 처리)
# ==============================================================================
def worker(task_data, core_api, start_progress):
    task = core_api['task']
    action = task_data.get('action_type')
    mode = task_data.get('scan_mode', 'mismatch')
    
    # ----------------------------------------------------------------------
    # 1. Preview / Cron_Run 모드 (조회 및 검출)
    # ----------------------------------------------------------------------
    if action in ["preview", "cron_run"]:
        prefix = "[자동 실행] " if action == 'cron_run' else ""
        task.log(f"{prefix}데이터베이스에서 아이템 목록을 쿼리하는 중입니다. 잠시만 기다려주세요...")
        task.update_state('running', progress=0, total=100)
        core_api['cache'].reset_db()
        
        section_ids = task_data.get('target_sections', [])
        str_ids = [str(x).strip() for x in section_ids if str(x).strip()]
        
        if not str_ids:
            task.log("⚠️ 유효한 라이브러리가 선택되지 않았습니다. 설정을 확인하세요.")
            task.update_state('completed', progress=100, total=100)
            return
            
        try:
            placeholders = ",".join("?" for _ in str_ids)
            q = f"""
                SELECT mi.id, mi.title, mi.guid, ls.id AS section_id, ls.name AS section_name,
                       GROUP_CONCAT(mp.file, '|||') AS all_files
                FROM metadata_items mi
                JOIN library_sections ls ON mi.library_section_id = ls.id
                LEFT JOIN media_items mpi ON mpi.metadata_item_id = mi.id
                LEFT JOIN media_parts mp ON mp.media_item_id = mpi.id
                WHERE mi.library_section_id IN ({placeholders}) AND mi.metadata_type = 1
                GROUP BY mi.id
            """
            all_items = core_api['query'](q, tuple(str_ids))
            
            if not all_items:
                task.log("선택한 라이브러리에 해당하는 항목(영화)이 없습니다.")
                task.update_state('completed', 100, 100)
                return
                
        except Exception as e:
            task.log(f"❌ DB 쿼리 중 오류 발생: {e}")
            task.update_state('error')
            return

        total_items = len(all_items)
        task.log(f"DB 쿼리 완료. 총 {total_items:,}개의 항목에 대해 '{mode}' 검사를 시작합니다.")
        task.update_state('running', progress=10, total=100)
        
        cfg = core_api['config']
        compiled_rules = compile_jav_rules(cfg)
        result_data = []
        
        def get_all_pids(text):
            extracted = []
            remaining = text
            for _ in range(10): # 무한루프 방지
                found = extract_jav_pid(remaining, cfg, compiled_rules)
                if not found:
                    break
                for f_l, f_n in found:
                    if (f_l, f_n) not in extracted:
                        extracted.append((f_l, f_n))
                    # 방금 찾은 패턴을 공백으로 치환하여 뒤에 숨은 패턴을 계속 검색
                    safe_l = re.escape(f_l)
                    safe_n = re.escape(f_n)
                    pattern = r'[a-zA-Z]*' + safe_l + r'[-_]?' + safe_n + r'[a-zA-Z]*'
                    remaining = re.sub(pattern, ' ', remaining, flags=re.IGNORECASE)
            return extracted

        columns = [
            {"key": "section_name", "label": "라이브러리", "width": "12%"},
            {"key": "title", "label": "제목 (클릭시 이동)", "width": "40%", "type": "link", "link_key": "id"},
            {"key": "reason", "label": "상태 / 사유", "width": "38%"},
            {"key": "action", "label": "실행", "width": "10%", "align": "center", "header_align": "center", "type": "action_btn"}
        ]

        # ----- [1] 불일치/오매칭 검사 -----
        if mode == "mismatch":
            for idx, item in enumerate(all_items):
                if task.is_cancelled(): break
                if idx > 0 and idx % 1000 == 0: 
                    task.log(f"  ...분석 및 파싱 중: {idx:,} / {total_items:,} 완료")
                    task.update_state('running', progress=10 + int((idx/total_items)*80), total=100)
                
                files_raw = item.get('all_files')
                if not files_raw: continue
                files = files_raw.split('|||')
                db_title = item.get('title', '').strip()
                guid = item.get('guid', '').lower()

                match = re.match(r'^\[([A-Za-z0-9\-_]+)\]', db_title)
                db_pid = normalize_pid(match.group(1)) if match else None

                f_pids_norm = set()
                f_pids_display = []
                
                for fpath in files:
                    fname = os.path.basename(fpath)
                    
                    extracted_pids = get_all_pids(fname)
                    
                    for f_l, f_n in extracted_pids:
                        pid_str = f"{f_l}-{f_n}"
                        pid_str_upper = pid_str.upper()
                        if pid_str_upper not in f_pids_display:
                            f_pids_display.append(pid_str_upper)
                        n_pid = normalize_pid(pid_str)
                        if n_pid: f_pids_norm.add(n_pid)

                if not f_pids_norm: continue
                
                reason = ""
                op_action = "match"
                
                if db_pid and db_pid in f_pids_norm:
                    matched_disp = next((p for p in f_pids_display if normalize_pid(p) == db_pid), f_pids_display[0])
                    
                    if not guid or 'local://' in guid or 'none://' in guid or guid == '-':
                        reason = f"미매칭 상태 (로컬/없음) / 검출: {matched_disp}"
                    elif not guid.startswith('com.plexapp.agents.sjva'):
                        reason = f"타 에이전트로 매칭됨 / 검출: {matched_disp}"
                else:
                    if len(f_pids_norm) > 1:
                        if len(files) > 1:
                            reason = f"병합된 다중 품번 검출 (분리 필요): {', '.join(f_pids_display)}"
                            op_action = "split"
                        else:
                            reason = f"단일 파일 내 다중 품번 (DB 불일치): {', '.join(f_pids_display)}"
                            op_action = "match"
                    elif not db_pid:
                        reason = "DB 제목 형식 비정상 ([품번] 누락)"
                    else:
                        reason = f"품번 불일치 (DB: {match.group(1).upper() if match else '없음'} / 파일: {f_pids_display[0]})"

                if reason:
                    result_data.append({
                        "id": item['id'], "section_name": item['section_name'], "title": db_title, 
                        "reason": reason, "op_action": op_action, "raw_path": files[0]
                    })

        # ----- [2] 분리된 중복 검사 -----
        elif mode == "dupes":
            pid_item_map = defaultdict(list)
            for idx, item in enumerate(all_items):
                if task.is_cancelled(): break
                if idx > 0 and idx % 1000 == 0: 
                    task.log(f"  ...파싱 및 분류 중: {idx:,} / {total_items:,} 완료")
                    task.update_state('running', progress=10 + int((idx/total_items)*80), total=100)
                
                files_raw = item.get('all_files')
                if not files_raw: continue
                files = files_raw.split('|||')
                
                db_title = item.get('title', '').strip()
                match = re.match(r'^\[([A-Za-z0-9\-_]+)\]', db_title)
                db_pid = normalize_pid(match.group(1)) if match else None
                
                for fpath in files:
                    fname = os.path.basename(fpath)
                    extracted_pids = get_all_pids(fname)
                    
                    if extracted_pids:
                        f_pids_norm = {normalize_pid(f"{l}-{n}") for l, n in extracted_pids if normalize_pid(f"{l}-{n}")}
                        
                        if db_pid and db_pid in f_pids_norm:
                            norm_f = db_pid
                        else:
                            f_l, f_n = extracted_pids[0]
                            norm_f = normalize_pid(f"{f_l}-{f_n}")
                            
                        if norm_f:
                            pid_item_map[norm_f].append({
                                "id": item['id'], "title": item['title'], "section_name": item['section_name'], "raw_path": fpath
                            })
                        break
            
            for norm_pid, group in pid_item_map.items():
                unique_ids = set(i['id'] for i in group)
                if len(unique_ids) > 1:
                    for item in group:
                        result_data.append({
                            "id": item['id'], "section_name": item['section_name'], "title": item['title'], 
                            "reason": f"동일 품번이 {len(unique_ids)}개의 개별 아이템으로 등록됨",
                            "op_action": "match", "raw_path": item['raw_path']
                        })

        # ----- [3] 배우 이름 한글화 -----
        elif mode == "actor":
            db_path = task_data.get('actors_db_path')
            if not db_path or not os.path.exists(db_path):
                task.log("오류: 환경 설정에서 올바른 배우 DB(actors.db) 경로를 입력하세요.")
                task.update_state('error')
                return
                
            task.log("배우 DB 메모리 캐싱 중...")
            actor_cache = {}
            try:
                with sqlite3.connect(f"file:{db_path}?mode=ro", uri=True) as con:
                    con.row_factory = sqlite3.Row
                    rows = con.execute("SELECT inner_name_kr, inner_name_cn, actor_onm FROM actors").fetchall()
                    for r in rows:
                        kr_name = r['inner_name_kr']
                        if not kr_name: continue
                        names_to_check = set()
                        if r['inner_name_cn']: names_to_check.add(r['inner_name_cn'])
                        if r['actor_onm']:
                            names_to_check.update(re.findall(r'\(([^)]+)\)', r['actor_onm']))
                        for n in names_to_check:
                            actor_cache[n] = kr_name
            except Exception as e:
                task.log(f"배우 DB 접속 실패: {e}")
                task.update_state('error')
                return

            if not actor_cache:
                task.log("배우 DB에서 파싱할 데이터가 없습니다.")
                task.update_state('error')
                return

            task.log("Plex DB에서 배우 메타데이터 대조 중 (최적화 쿼리 실행)...")
            hit_reasons = defaultdict(list)
            try:
                tag_query = f"""
                    SELECT tg.metadata_item_id, t.tag 
                    FROM taggings tg 
                    JOIN tags t ON tg.tag_id = t.id 
                    JOIN metadata_items mi ON mi.id = tg.metadata_item_id
                    WHERE t.tag_type = 6 AND mi.library_section_id IN ({placeholders}) AND mi.metadata_type = 1
                """
                res = core_api['query'](tag_query, tuple(str_ids))
                
                for row in res:
                    m_id = row['metadata_item_id']
                    orig_actor = row['tag']
                    if orig_actor in actor_cache and actor_cache[orig_actor] != orig_actor:
                        hit_reasons[m_id].append(f"{orig_actor} → {actor_cache[orig_actor]}")
            except Exception as e:
                task.log(f"태그 쿼리 중 오류: {e}")
            
            task.log("검출된 항목을 정리하는 중...")
            for item in all_items:
                if task.is_cancelled(): break
                if item['id'] in hit_reasons:
                    result_data.append({
                        "id": item['id'], "section_name": item['section_name'], "title": item['title'], 
                        "reason": f"{', '.join(hit_reasons[item['id']][:3])}" + (" 외" if len(hit_reasons[item['id']]) > 3 else ""),
                        "op_action": "match", "raw_path": item.get('all_files', '').split('|||')[0]
                    })

        # ----- [4] 유저 포스터 일괄 적용 (영구 DB 캐시 및 Base64 팝업) -----
        elif mode == "user_poster":
            import base64
            
            img_root = task_data.get('image_server_path')
            web_url_root = task_data.get('image_web_url', '').rstrip('/')
            
            if not img_root or not os.path.exists(img_root):
                task.log("오류: 환경 설정에서 올바른 포스터 경로를 입력하세요.")
                task.update_state('error')
                return
                
            task.log(f"이미지 서버 경로({img_root}) 스캔 중...")
            
            user_posters = {}
            poster_regex = re.compile(r'^([a-zA-Z0-9\-]+)_(p|pl)_user\.jpg$', re.IGNORECASE)
            
            try:
                for root, _, files in os.walk(img_root):
                    if task.is_cancelled(): break
                    for f in files:
                        pid_match = poster_regex.match(f)
                        if pid_match:
                            raw_pid = pid_match.group(1).lower()
                            
                            if raw_pid not in user_posters:
                                rel_dir = os.path.relpath(root, img_root)
                                rel_path = f if rel_dir == '.' else f"{rel_dir}/{f}".replace('\\', '/')
                                user_posters[raw_pid] = rel_path
            except Exception as e:
                task.log(f"포스터 경로 스캔 오류: {e}")
                task.update_state('error')
                return

            if not user_posters:
                task.log("폴더 내에 유효한 _p_user.jpg 또는 _pl_user.jpg 파일이 없습니다.")
                task.update_state('error')
                return

            history_db_path = os.path.join(core_api['config'].get('base_dir', ''), 'task_logs', 'jav_manager_poster_history.db')
            applied_posters = _get_applied_posters(history_db_path)
            
            task.log(f"스캔 완료. {len(user_posters):,}개의 고유 품번 포스터와 대조를 시작합니다. (이전 적용 완료: {len(applied_posters):,}건 제외)")
            
            title_regex = re.compile(r'^\[([A-Za-z0-9\-_]+)\]')
            
            modal_html_content = """
            <div style="background:#111; padding:15px; border-radius:8px; border:1px solid #444; max-width:90%; max-height:90%; display:flex; flex-direction:column; box-shadow:0 10px 30px rgba(0,0,0,0.8);">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                    <span id="pmh-poster-title" style="color:#e5a00d; font-weight:bold; font-size:15px;">포스터 보기</span>
                    <button onclick="document.getElementById('pmh-poster-modal').remove();" style="background:none; border:none; color:#aaa; cursor:pointer; font-size:18px;"><i class="fas fa-times"></i></button>
                </div>
                <div style="flex-grow:1; display:flex; justify-content:center; align-items:center; min-height:0; position:relative;">
                    <i id="pmh-poster-spin" class="fas fa-spinner fa-spin" style="position:absolute; font-size:30px; color:#e5a00d;"></i>
                    <img id="pmh-poster-img" src="" style="max-width:100%; max-height:70vh; object-fit:contain; border-radius:4px; opacity:0; transition:opacity 0.2s;" onload="this.style.opacity=1; document.getElementById('pmh-poster-spin').style.display='none';">
                </div>
            </div>
            """
            b64_html = base64.b64encode(modal_html_content.encode('utf-8')).decode('utf-8')
            
            skip_count = 0
            for idx, item in enumerate(all_items):
                if task.is_cancelled(): break
                if idx > 0 and idx % 10000 == 0: 
                    task.log(f"  ...대조 중: {idx:,} / {total_items:,} 완료 (스킵: {skip_count:,})")
                    task.update_state('running', progress=10 + int((idx/total_items)*80), total=100)
                
                db_title = item.get('title', '').strip()
                t_match = title_regex.match(db_title)
                
                if t_match:
                    db_pid = t_match.group(1).lower()
                    sec_id = str(item.get('section_id', ''))
                    
                    if f"{sec_id}_{db_pid}" in applied_posters:
                        skip_count += 1
                        continue
                    
                    if db_pid in user_posters:
                        rel_path = user_posters[db_pid]
                        safe_rel_path = urllib.parse.quote(rel_path, safe='/')
                        img_url = f"{web_url_root}/{safe_rel_path}"
                        
                        safe_title = db_title.replace("'", " ").replace('"', ' ')
                        
                        popup_js = f"""
                        event.preventDefault();
                        let m = document.getElementById('pmh-poster-modal');
                        if (!m) {{
                            m = document.createElement('div');
                            m.id = 'pmh-poster-modal';
                            m.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.85); z-index:999999; display:flex; justify-content:center; align-items:center; flex-direction:column; backdrop-filter:blur(5px);';
                            m.innerHTML = decodeURIComponent(escape(window.atob('{b64_html}')));
                            document.body.appendChild(m);
                            m.addEventListener('click', function(e) {{ if(e.target===m) m.remove(); }});
                        }}
                        document.getElementById('pmh-poster-title').innerText = '{safe_title}';
                        document.getElementById('pmh-poster-spin').style.display = 'block';
                        document.getElementById('pmh-poster-img').style.opacity = '0';
                        document.getElementById('pmh-poster-img').src = '{img_url}';
                        """
                        
                        popup_js = popup_js.replace('\n', ' ').replace('\r', '').replace('  ', ' ')
                        reason_html = f'<a href="#" onclick="{popup_js}" style="color:#2f96b4; text-decoration:none;" title="클릭하여 포스터 미리보기"><i class="fas fa-image"></i> 적용 가능 (미리보기)</a>'
                        
                        result_data.append({
                            "id": item['id'], 
                            "section_name": item['section_name'], 
                            "_raw_db_pid": db_pid,
                            "_raw_sec_id": sec_id,
                            "title": db_title, 
                            "reason": reason_html, 
                            "op_action": "match"
                        })
                        
            task.log(f"  -> 영구 DB 이력 필터링으로 총 {skip_count:,}개의 아이템 처리를 스킵했습니다.")

        # ----- [5] 파일명 처리 오류 (Prefix vs 대괄호 속성 불일치) -----
        elif mode == "file_error":
            for idx, item in enumerate(all_items):
                if task.is_cancelled(): break
                if idx > 0 and idx % 1000 == 0: 
                    task.log(f"  ...오류 검출 및 파싱 중: {idx:,} / {total_items:,} 완료")
                    task.update_state('running', progress=10 + int((idx/total_items)*80), total=100)
                
                files_raw = item.get('all_files')
                if not files_raw: continue
                
                reason = ""
                matched_fpath = ""
                
                for fpath in files_raw.split('|||'):
                    fname = os.path.basename(fpath)

                    prefix_match = re.match(r'^([^\[\(]+)', fname)
                    bracket_strs = re.findall(r'\[(.*?)\]', fname)

                    if prefix_match and bracket_strs:
                        prefix_str = prefix_match.group(1).strip()
                        bracket_str = " ".join(bracket_strs).strip()

                        pids_prefix = get_all_pids(prefix_str)
                        pids_bracket = get_all_pids(bracket_str)
                        
                        norm_prefix = {normalize_pid(f"{l}-{n}") for l, n in pids_prefix if normalize_pid(f"{l}-{n}")}
                        norm_bracket = {normalize_pid(f"{l}-{n}") for l, n in pids_bracket if normalize_pid(f"{l}-{n}")}

                        if norm_bracket and not norm_prefix.intersection(norm_bracket):
                            disp_prefix = [f"{l}-{n}".upper() for l, n in pids_prefix] or ["없음"]
                            disp_orig = [f"{l}-{n}".upper() for l, n in pids_bracket]
                            reason = f"{disp_prefix[0]} / {disp_orig[0]}"
                            matched_fpath = fpath
                            break

                if reason:
                    result_data.append({
                        "id": item['id'], 
                        "section_name": item['section_name'], 
                        "title": item['title'],
                        "reason": reason,
                        "raw_path": matched_fpath
                    })

        if task.is_cancelled():
            task.log("🛑 검사가 사용자 취소로 중단되었습니다.")
            return

        result_data = core_api['sort'](result_data, [{"key": "section_name", "dir": "asc"}, {"key": "title", "dir": "asc"}])

        btn_label = "일괄 매칭 시작 (Unmatch -> Rematch)"
        if mode == "mismatch": btn_label = "불일치/오매칭 일괄 재매칭"
        elif mode == "dupes": btn_label = "분리/중복 아이템 일괄 재매칭"
        elif mode == "actor": btn_label = "배우 이름 한글화 일괄 적용 (메타 갱신)"
        elif mode == "user_poster": btn_label = "유저 커스텀 포스터 일괄 적용 (메타 갱신)"
        elif mode == "file_error": btn_label = "오류 항목 수동 이름 변경 권장"
        
        if mode == "file_error":
            columns[-1] = {"key": "raw_path", "label": "파일 선택", "width": "10%", "align": "center", "header_align": "center", "type": "folder_link"}
            action_btn = None 
        else:
            action_btn = {"label": f"<i class='fas fa-magic'></i> {btn_label}", "payload": {"action_type": "execute"}}
        
        cards = [
            {"label": "전체 검사 항목", "value": f"{len(all_items):,}개", "icon": "fas fa-search", "color": "#2f96b4"},
            {"label": "검출된 대상 항목", "value": f"{len(result_data):,}개", "icon": "fas fa-exclamation-triangle", "color": "#bd362f"}
        ]

        core_api['cache'].save({
            "type": "datatable", "summary_cards": cards, "action_button": action_btn,
            "columns": columns, "data": result_data
        })

        if action == 'preview':
            task.update_state('completed', 100, 100)
            if len(result_data) > 0:
                task.log(f"✅ 검사 완료! 총 {len(result_data):,}개의 항목이 검출되었습니다.")
            else:
                task.log("✅ 라이브러리 검사 완료. 모든 항목이 정상입니다! (조치할 대상 없음)")
            return
        else: # cron_run 모드일 경우 즉시 실행으로 전환
            if len(result_data) == 0:
                task.update_state('completed', progress=100, total=100)
                task.log("✅ [자동 실행] 조치(복구)가 필요한 항목이 없어 작업을 종료합니다.")
                return
            
            action = 'execute'
            task_data['_use_cache_db'] = True
            task_data['total'] = len(result_data)
            task_data['_resume_start_index'] = 0
            task.log(f"✅ [자동 실행] 조회 완료. 생성된 목록(총 {len(result_data):,}건)을 바탕으로 즉시 복구 작업을 시작합니다.")


    # ----------------------------------------------------------------------
    # 2. Execute 모드 (실제 매칭/처리 실행)
    # ----------------------------------------------------------------------
    work_start_time = time.time()
    
    retry_errors = task_data.get('retry_errors', False)
    opts = core_api.get('options', {})
    try: sleep_time = float(opts.get('sleep_time', 1))
    except: sleep_time = 1.0
    
    total = task_data.get('total', 0)
    progress = task_data.get('_resume_start_index', start_progress)
    
    if task_data.get('_is_single'):
        pending_items = task_data.get('target_items', [])
    else:
        status_filter = "('pending', 'error')" if retry_errors else "('pending')"
        with core_api['cache'].transaction_session() as conn:
            conn.row_factory = sqlite3.Row
            c = conn.cursor()
            c.execute(f"SELECT * FROM data WHERE pmh_status IN {status_filter} ORDER BY pmh_id ASC")
            rows = c.fetchall()
            cols = [desc[0] for desc in c.description] if c.description else []
            pending_items = [dict(zip(cols, row)) for row in rows]

    if total == 0:
        task.update_state('completed', 0, 0)
        task.log("⚠️ 실행할 대상 항목이 없습니다.")
        return

    task.update_state('running', progress, total)
    prefix = "[자동 실행] " if task_data.get('_is_cron') else ""
    if progress == 0:
        task.log(f"🚀 {prefix}총 {total:,}개의 아이템에 대해 작업을 시작합니다...")
    else:
        task.log(f"🔄 {prefix}중단되었던 {progress}번째 항목부터 이어서 작업을 재개합니다.")

    try:
        plex = core_api['get_plex']()
    except Exception as e:
        task.update_state('error')
        task.log(f"❌ Plex 서버 연결 실패: {str(e)}")
        return

    history_db_path = os.path.join(core_api['config'].get('base_dir', ''), 'task_logs', 'jav_manager_poster_history.db')

    try:
        for item in pending_items:
            if task.is_cancelled():
                task.log("🛑 작업이 취소되었습니다.")
                break

            progress += 1
            task.update_state('running', progress=progress, total=total)

            item_id = str(item['id'])
            db_id = item.get('pmh_id')
            title = item.get('title', item_id)
            op_action = item.get('op_action', 'match')
            
            task.log(f"[{progress}/{total}] '{title}' 처리 요청 중... (동작: {op_action})")
            
            try:
                if op_action == 'open_folder':
                    task.log(f"  -> 📂 수동 폴더 열기 전용 항목입니다. 시스템 자동 처리를 스킵합니다.")
                    if db_id: core_api['cache'].mark_as_done('pmh_id', db_id)
                    continue

                safe_endpoint = f"/library/metadata/{item_id}"
                plex_item = plex.fetchItem(safe_endpoint)
                
                if op_action == 'split':
                    if len(plex_item.media) > 1:
                        plex_item.split()
                        task.log(f"  -> ✂️ 항목이 분리되었습니다.")
                        if db_id: core_api['cache'].mark_as_done('pmh_id', db_id)
                    else:
                        task.log("  -> ⚠️ 분리 불가: 단일 미디어 파일입니다. 분리 대신 매칭(Match)으로 우회합니다.")
                        op_action = 'match'

                if op_action == 'match':
                    success, msg, score = pmh_core.perform_smart_match(
                        plex_url=plex._baseurl, 
                        plex_token=plex._token, 
                        rating_key=item_id, 
                        item_title=plex_item.title, 
                        item_year=plex_item.year, 
                        target_agent=plex_item.section().agent,
                        plex_inst=plex,
                        try_refresh_first=False,
                        do_unmatch_first=True,
                        global_config=core_api['config']
                    )
                    
                    if success:
                        task.log(f"  -> ✅ 매칭 처리 완료: {msg}")
                        if db_id: core_api['cache'].mark_as_done('pmh_id', db_id)
                        
                        if mode == "user_poster":
                            _raw_db_pid = item.get('_raw_db_pid')
                            _raw_sec_id = item.get('_raw_sec_id')
                            if _raw_db_pid and _raw_sec_id:
                                _mark_poster_applied(history_db_path, _raw_sec_id, _raw_db_pid)
                                task.log(f"  -> 💾 영구 DB에 포스터 적용 이력 저장 완료 ({_raw_sec_id}_{_raw_db_pid})")
                            else:
                                task.log(f"  -> ⚠️ 영구 DB 저장 누락 (품번 또는 섹션ID 정보가 없음)")
                    else:
                        task.log(f"  -> ❌ 매칭 실패/반려: {msg}")
                        if db_id: core_api['cache'].mark_as_error('pmh_id', db_id)

            except Exception as e:
                task.log(f"  -> ❌ Plex 제어 에러: {e}")
                if db_id: core_api['cache'].mark_as_error('pmh_id', db_id)
                
            if sleep_time > 0 and progress < total:
                loops = max(1, int(sleep_time * 2))
                for _ in range(loops):
                    if task.is_cancelled(): break
                    time.sleep(0.5)

        if not task.is_cancelled():
            task.update_state('completed', progress, total)
            
            elapsed_sec = int(time.time() - work_start_time)
            elapsed_str = f"{elapsed_sec // 60}분 {elapsed_sec % 60}초" if elapsed_sec >= 60 else f"{elapsed_sec}초"
            
            task.log(f"✅ 모든 작업 요청이 완료되었습니다! (소요시간: {elapsed_str})")
            
            mode_label = "품번 불일치/오매칭 복구" if mode == "mismatch" else "중복 아이템 재매칭" if mode == "dupes" else "배우 한글화 갱신" if mode == "actor" else "유저 포스터 일괄 갱신"
            if mode == "file_error": mode_label = "파일명 오류 항목 수동 이름 변경 유도"
            
            tool_vars = {
                "total": f"{total:,}",
                "elapsed_time": elapsed_str,
                "scan_mode_label": mode_label
            }
            core_api['notify']("JAV 매니저 완료", DEFAULT_DISCORD_TEMPLATE, "#e5a00d", tool_vars)
            
    finally:
        current_state = core_api['task'].load(include_target_items=False)
        if current_state:
            real_state = current_state.get('state', 'running')
            if real_state != 'completed':
                p_val = locals().get('progress', 0)
                task.update_state(real_state, progress=p_val)
