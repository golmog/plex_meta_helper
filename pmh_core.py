# -*- coding: utf-8 -*-

import sqlite3
import os
import sys
import time
import re
import unicodedata
import shutil
import inspect
import json
import yaml
import queue
import threading
import subprocess
import csv
import io
import hashlib
import difflib
from datetime import datetime
from contextlib import contextmanager
from urllib.request import Request, urlopen
from urllib.parse import urlencode
from urllib.error import HTTPError, URLError

# ==============================================================================
# [코어 모듈 버전]
# ==============================================================================
__version__ = "0.8.101"

def get_version():
    return __version__

GLOBAL_DASHBOARD_CACHE = {
    "running": [],
    "cron": [],
    "last_updated": 0
}

_TOOL_SERVER_LOCKS = {}
_TOOL_SERVER_LOCKS_GUARD = threading.Lock()

MEDIA_ACTION_QUEUE = queue.Queue()
MEDIA_ACTION_STATUS = {}

def get_tool_lock(tool_id, server_id):
    lock_key = f"{tool_id}_{server_id}"
    with _TOOL_SERVER_LOCKS_GUARD:
        if lock_key not in _TOOL_SERVER_LOCKS:
            _TOOL_SERVER_LOCKS[lock_key] = threading.Lock()
        return _TOOL_SERVER_LOCKS[lock_key]

def generate_secure_header(api_key):
    if not api_key: return ""
    
    timestamp = int(time.time() / 10) * 10
    payload = f"{api_key}:{timestamp}".encode('utf-8')
    hash_hex = hashlib.sha256(payload).hexdigest()
    
    return f"{timestamp}.{hash_hex}"

def execute_plex_action_safe(action_func, max_retries=5, wait_sec=5.0):
    last_err = None
    for i in range(max_retries):
        try:
            return action_func()
        except Exception as e:
            last_err = e
            err_str = str(e)
            if any(x in err_str for x in ["500", "502", "503", "504", "Timeout", "database is locked"]):
                print(f"[PMH Retry] Plex 서버 부하/오류 감지: {err_str}. {wait_sec}초 후 재시도 ({i+1}/{max_retries})...")
                time.sleep(wait_sec)
            else:
                raise e
    raise last_err

# ==============================================================================
# [유틸리티 함수]
# ==============================================================================
def core_natural_sort(data_list, default_sort):
    if not data_list or not default_sort: return data_list
    def n_key(s): return [text.zfill(10) if text.isdigit() else text.lower() for text in re.split(r'(\d+)', str(s))]
    
    rules = default_sort if isinstance(default_sort, list) else [default_sort]
    for rule in reversed(rules):
        k = rule.get('key')
        d = rule.get('dir', 'asc').lower()
        data_list.sort(key=lambda x: n_key(str(x.get(k, ''))), reverse=(d == 'desc'))
    return data_list

def compile_yaml_filters(base_dir, tool_id, task_logger=None):
    filter_path = os.path.join(base_dir, 'tools', tool_id, 'filters.yaml')
    compiled_filters = {'include': [], 'exclude': []}
    
    if not os.path.exists(filter_path):
        return compiled_filters

    try:
        with open(filter_path, 'r', encoding='utf-8-sig') as f:
            raw_text = f.read()
            clean_text = raw_text.replace('\r\n', '\n').replace('\r', '\n')
            yaml_data = yaml.safe_load(clean_text) or {}
            
        for f_type in ['include', 'exclude']:
            rules = yaml_data.get(f_type) or []
            
            if not isinstance(rules, list):
                continue
                
            for rule in rules:
                if not isinstance(rule, dict):
                    continue
                    
                fields = rule.get('field', 'guid,title,path')
                field_list = [x.strip().lower() for x in re.split(r'[,|]', str(fields)) if x.strip()]
                keyword_list = rule.get('list') or []
                
                if not isinstance(keyword_list, list):
                    keyword_list = [keyword_list]
                    
                for kw in keyword_list:
                    clean_kw = str(kw).strip()
                    if not clean_kw or clean_kw.lower() == 'none': continue
                    
                    try:
                        compiled_pattern = re.compile(clean_kw, re.IGNORECASE)
                        compiled_filters[f_type].append({
                            'fields': field_list,
                            'pattern': compiled_pattern
                        })
                    except Exception as e:
                        if task_logger: task_logger(f"⚠️ 필터 정규식 문법 오류 무시됨 -> '{clean_kw}': {e}")
                        
        if task_logger and (compiled_filters['include'] or compiled_filters['exclude']):
            task_logger(f"🛡️ {os.path.basename(filter_path)} 로드 완료 (포함: {len(compiled_filters['include'])}개, 제외: {len(compiled_filters['exclude'])}개 규칙)")
            
    except Exception as e:
        if task_logger: task_logger(f"⚠️ {os.path.basename(filter_path)} 파싱 실패 (파일 형식을 확인하세요): {e}")
        
    return compiled_filters

def check_yaml_filter(text_dict, compiled_filters):
    includes = compiled_filters.get('include', [])
    excludes = compiled_filters.get('exclude', [])
    
    if includes:
        passed_include = False
        for rule in includes:
            for field in rule['fields']:
                target_text = text_dict.get(field, "")
                if target_text and rule['pattern'].search(target_text):
                    passed_include = True
                    break
            if passed_include: break
        if not passed_include:
            return False

    if excludes:
        for rule in excludes:
            for field in rule['fields']:
                target_text = text_dict.get(field, "")
                if target_text and rule['pattern'].search(target_text):
                    return False

    return True

# ==============================================================================
# [디스코드 통합 알림 팩토리]
# ==============================================================================
def create_discord_notifier(base_dir, tool_id, server_id, global_config):
    """실행 컨텍스트(스케줄러/UI)와 무관하게 동일한 알림 로직을 생성합니다."""
    
    def send_discord_notify(title, message="", color_hex="#51a351", tool_vars=None):
        if tool_vars is None: tool_vars = {}
        
        mgr = CoreOptionsManager(base_dir, tool_id, server_id)
        current_opts = mgr.load()
        
        if not current_opts.get('discord_enable', True): return
        
        url = current_opts.get('discord_webhook', '').strip() or (global_config.get('discord_webhook', '').strip() if global_config else '')
        if not url: return
            
        print(f"[PMH Discord] '{tool_id}' 알림 발송 시도 (제목: {title})")
        
        core_vars = {
            "tool_id": tool_id,
            "server_id": server_id[:8],
            "server_name": current_opts.get('_server_name', f"Server-{server_id[:8]}"),
            "date": datetime.now().strftime('%Y-%m-%d'),
            "time": datetime.now().strftime('%H:%M:%S')
        }
        all_vars = {**core_vars, **tool_vars}
        
        class SafeDict(dict):
            def __missing__(self, key): return '{' + key + '}'
        safe_vars = SafeDict(**all_vars)

        raw_body = current_opts.get('discord_template', message)
        if not str(raw_body).strip(): raw_body = message
        final_body = str(raw_body).format_map(safe_vars)
        
        final_title = str(title).format_map(safe_vars)
        
        raw_footer = current_opts.get('discord_template_footer', 'Plex Meta Helper - {tool_id} | {server_name}')
        final_footer = str(raw_footer).format_map(safe_vars)
        
        raw_bot_name = current_opts.get('discord_bot_name', '').strip()
        final_bot_name = str(raw_bot_name).format_map(safe_vars) if raw_bot_name else ''
        
        avatar_url = current_opts.get('discord_avatar_url', '').strip()
        color_int = int(color_hex.lstrip('#'), 16) if color_hex.startswith('#') else 5349201

        embed = {
            "title": final_title,
            "description": final_body,
            "color": color_int
        }
        if final_footer.strip():
            embed["footer"] = {"text": final_footer.strip()}
            
        payload = {"embeds": [embed]}
        extra_data = {}
        if final_bot_name: extra_data["username"] = final_bot_name
        if avatar_url: extra_data["avatar_url"] = avatar_url
        payload.update(extra_data)
        
        try:
            headers = {'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
            req = Request(url, data=json.dumps(payload).encode('utf-8'), headers=headers, method='POST')
            urlopen(req, timeout=5)
            print(f"[PMH Discord] ✅ '{tool_id}' 알림 발송 성공.")
        except Exception as e:
            print(f"[PMH Discord Error] ❌ 발송 실패: {e}")
            
    return send_discord_notify

# ==============================================================================
# [코어 경량 크론 스케줄러 (Daemon)]
# ==============================================================================
def match_cron(cron_expr, dt):
    parts = str(cron_expr).strip().split()
    if len(parts) != 5: return False
    
    def match_part(part, val):
        if part == '*': return True
        if part.startswith('*/'):
            try: return val % int(part[2:]) == 0
            except: return False
        try:
            for p in part.split(','):
                if '-' in p:
                    start, end = map(int, p.split('-'))
                    if start <= val <= end: return True
                elif int(p) == val: return True
        except: pass
        return False

    return (match_part(parts[0], dt.minute) and
            match_part(parts[1], dt.hour) and
            match_part(parts[2], dt.day) and
            match_part(parts[3], dt.month) and
            match_part(parts[4], dt.isoweekday() % 7))

_SCHEDULER_STATES = {}

def stop_scheduler_daemon():
    thread_name = "PMH_Cron_Scheduler"
    worker_name = "PMH_Media_Worker"
    
    if _SCHEDULER_STATES.get(thread_name, False):
        print("[PMH Daemon] 🛑 기존 데몬 및 큐 워커 스레드 종료 지시를 내립니다...")
        _SCHEDULER_STATES[thread_name] = False
        _SCHEDULER_STATES[worker_name] = False
        
        try:
            MEDIA_ACTION_QUEUE.put({'task_id': 'KILL', 'item_id': 0, 'action': 'kill', 'plex_url': '', 'plex_token': '', 'data': {}})
        except Exception:
            pass

def start_scheduler_daemon(global_config):
    thread_name = "PMH_Cron_Scheduler"
    worker_name = "PMH_Media_Worker"
    
    base_dir = global_config.get("base_dir")
    
    _SCHEDULER_STATES[thread_name] = False
    _SCHEDULER_STATES[worker_name] = False
    
    try:
        task_logs_dir = os.path.join(base_dir, 'task_logs')
        if os.path.exists(task_logs_dir):
            ghost_count = 0
            for f_name in os.listdir(task_logs_dir):
                if f_name.endswith('_task.db'):
                    db_file = os.path.join(task_logs_dir, f_name)
                    try:
                        with sqlite3.connect(db_file, timeout=2.0) as conn:
                            c = conn.cursor()
                            c.execute("SELECT count(*) FROM task_info WHERE state IN ('running', 'pending')")
                            if c.fetchone()[0] > 0:
                                c.execute("UPDATE task_info SET state='error' WHERE state IN ('running', 'pending')")
                                
                                stamp = datetime.now().strftime('%H:%M:%S')
                                c.execute("INSERT INTO logs (log_text) VALUES (?)", (f"[{stamp}] [System] 서버 강제 종료(재시작)가 감지되어 이전 작업을 중단 상태(Error)로 변경했습니다.",))
                                
                                ghost_count += 1
                                conn.commit()
                    except Exception: pass
                    
            if ghost_count > 0:
                print(f"[PMH Cleanup] 총 {ghost_count}개의 툴에서 중단된 유령 작업(Ghost Tasks)을 정리했습니다.")
    except Exception as cleanup_err:
        print(f"[PMH Cleanup Error] 유령 작업 정리 중 오류: {cleanup_err}")

    def scheduler_loop():
        tz_info = time.strftime('%z (%Z)')
        print(f"[PMH Daemon] 자동 실행 스케줄러 시작. (현재 타임존: {tz_info})")

        _SCHEDULER_STATES[thread_name] = True
        
        tools_dir = os.path.join(base_dir, 'tools')
        task_logs_dir = os.path.join(base_dir, 'task_logs')
        last_cache_update = 0

        while _SCHEDULER_STATES.get(thread_name, False):
            now = datetime.now()
            
            if now.second == 0:
                try:
                    _execute_scheduled_tasks(global_config, now)
                except Exception as e:
                    print(f"[PMH Scheduler Error] {e}")
                time.sleep(1)
                
            current_time = time.time()
            if current_time - last_cache_update >= 5.0:
                try:
                    _update_dashboard_cache(tools_dir, task_logs_dir, base_dir)
                    last_cache_update = current_time
                except Exception as e:
                    pass
                    
            time.sleep(0.5)

    if any(t.name == thread_name and t.is_alive() for t in threading.enumerate()):
        print(f"[PMH Daemon] ⚠️ 기존 스케줄러 데몬이 아직 살아있습니다. 중복 생성을 방지합니다.")
    else:
        st = threading.Thread(target=scheduler_loop, name=thread_name)
        st.daemon = True
        st.start()

    if any(t.name == worker_name and t.is_alive() for t in threading.enumerate()):
        print(f"[PMH Daemon] ⚠️ 기존 큐 워커가 아직 살아있습니다. 중복 생성을 방지합니다.")
        _SCHEDULER_STATES[worker_name] = True
    else:
        _SCHEDULER_STATES[worker_name] = True
        media_thread = threading.Thread(target=media_action_worker_loop, args=(global_config,), name=worker_name)
        media_thread.daemon = True
        media_thread.start()

def _update_dashboard_cache(tools_dir, task_logs_dir, base_dir):
    global GLOBAL_DASHBOARD_CACHE
    if not os.path.exists(tools_dir) or not os.path.exists(task_logs_dir): return
    
    running_list = []
    cron_list = []
    
    for f_name in os.listdir(task_logs_dir):
        if f_name.endswith('_task.db'):
            # 파일명 구조: {tool_id}_{server_id}_task.db
            parts = f_name[:-8].rsplit('_', 1)
            if len(parts) == 2:
                t_id, s_id = parts
                mgr = CoreTaskManager(base_dir, t_id, s_id)
                t_state = mgr.load(include_target_items=False)
                if t_state and t_state.get('state') == 'running':
                    running_list.append({
                        "tool_id": t_id, "server_id": s_id,
                        "progress": t_state.get('progress', 0), "total": t_state.get('total', 0)
                    })
                    
        elif f_name.endswith('_options.db'):
            # 파일명 구조: {tool_id}_{server_id}_options.db
            parts = f_name[:-11].rsplit('_', 1)
            if len(parts) == 2:
                t_id, s_id = parts
                mgr = CoreOptionsManager(base_dir, t_id, s_id)
                opts = mgr.load()
                if opts.get('cron_enable') and opts.get('cron_expr'):
                    cron_list.append({
                        "tool_id": t_id, "server_id": s_id, "expr": opts.get('cron_expr')
                    })
                    
    GLOBAL_DASHBOARD_CACHE["running"] = running_list
    GLOBAL_DASHBOARD_CACHE["cron"] = cron_list
    GLOBAL_DASHBOARD_CACHE["last_updated"] = time.time()

def _execute_scheduled_tasks(global_config, now):
    base_dir = global_config.get("base_dir")
    db_path = global_config.get("plex_db_path")
    sqlite_bin = global_config.get("plex_sqlite_bin")
    plex_url = global_config.get("plex_url")
    plex_token = global_config.get("plex_token")

    tools_dir = os.path.join(base_dir, 'tools')
    task_logs_dir = os.path.join(base_dir, 'task_logs')
    if not os.path.exists(tools_dir) or not os.path.exists(task_logs_dir): return
    
    for file in os.listdir(task_logs_dir):
        if file.endswith('_options.db'):
            base_name = file.replace('_options.db', '')
            
            tool_id = None
            server_id = "default"
            
            for t_id in os.listdir(tools_dir):
                if base_name.startswith(t_id + '_'):
                    tool_id = t_id
                    server_id = base_name[len(t_id)+1:]
                    break
                    
            if not tool_id: continue
            
            options_mgr = CoreOptionsManager(base_dir, tool_id, server_id)
            opts = options_mgr.load()
            
            if not opts.get('cron_enable', False): continue
            
            cron_expr = opts.get('cron_expr', '').strip()
            parts = cron_expr.split()
            if len(parts) != 5: continue
                
            if not match_cron(cron_expr, now): continue

            # 중복 실행 방지
            task_mgr = CoreTaskManager(base_dir, tool_id, server_id)
            task_state = task_mgr.load(include_target_items=False)
            if task_state and task_state.get('state') == 'running':
                print(f"[PMH Scheduler] '{tool_id}' (서버:{server_id[:8]}) 이미 작업이 실행 중이므로 스킵합니다.")
                continue

            print(f"[PMH Scheduler] '{tool_id}' (서버:{server_id[:8]}) 크론 조건({cron_expr}) 달성. 워커 스레드를 트리거합니다.")

            try:
                info_path = os.path.join(tools_dir, tool_id, 'info.yaml')
                with open(info_path, 'r', encoding='utf-8') as f:
                    entry_file = yaml.safe_load(f).get('entry_file', 'main.py')
                module = _load_tool_module(tools_dir, tool_id, entry_file)
                
                req_data = opts.copy()
                req_data['action_type'] = 'execute'
                req_data['_is_cron'] = True
                
                data_mgr = CoreDataManager(base_dir, tool_id, server_id)
                
                db_api = create_db_api(db_path, sqlite_bin)
                
                def get_plex_instance():
                    from plexapi.server import PlexServer
                    plex = PlexServer(plex_url, plex_token, timeout=120)
                    orig_fetchItem = plex.fetchItem
                    def safe_fetchItem(ekey, *args, **kwargs):
                        if isinstance(ekey, str) and ekey.strip().isdigit(): ekey = f"/library/metadata/{ekey.strip()}"
                        elif isinstance(ekey, int): ekey = f"/library/metadata/{ekey}"
                        return orig_fetchItem(ekey, *args, **kwargs)
                    plex.fetchItem = safe_fetchItem
                    return plex
                    
                core_api = {
                    "query": db_api["query"],
                    "execute": db_api["execute"],
                    "get_plex": get_plex_instance,
                    "task": task_mgr, "config": global_config or {},
                    "cache": data_mgr, "options": opts, 
                    "notify": create_discord_notifier(base_dir, tool_id, server_id, global_config),
                    "sort": core_natural_sort
                }

                res, code = module.run(req_data, core_api)
                
                if code == 200 and isinstance(res, dict) and res.get('type') == 'async_task':
                    t_data = res.get('task_data', {})
                    t_data['_is_cron'] = True
                    
                    tool_lock = get_tool_lock(tool_id, server_id)
                    if not tool_lock.acquire(blocking=False):
                        print(f"[PMH Scheduler] '{tool_id}' (서버:{server_id[:8]}) 이전 작업이 진행 중이어서 이번 스케줄은 건너뜁니다.")
                        continue
                    
                    try:
                        task_mgr.init_task(t_data)
                        target_thread_name = f"Worker_{tool_id}_{server_id}"
                        
                        t = threading.Thread(target=_core_worker_runner, 
                                             args=(module, t_data, core_api, 0, tool_id, server_id),
                                             name=target_thread_name)
                        t.daemon = True
                        t.start()
                    except Exception as start_err:
                        tool_lock.release()
                        raise start_err
                    
            except Exception as e:
                print(f"[PMH Scheduler Error] Tool {tool_id} execution failed: {e}")

# ==============================================================================
# [DB 헬퍼 함수]
# ==============================================================================
@contextmanager
def get_db_connection(db_path):
    if not os.path.exists(db_path):
        raise FileNotFoundError(f"DB File not found: {db_path}")
    conn = None
    try:
        conn = sqlite3.connect(f'file:{db_path}?mode=ro', uri=True, timeout=10.0, isolation_level=None)
        yield conn
    except sqlite3.OperationalError as e:
        print(f"[PMH DB ERROR] SQLite Operational Error: {str(e)}")
        raise
    except Exception as e:
        print(f"[PMH DB ERROR] Connection failed: {str(e)}")
        raise
    finally:
        if conn:
            try: conn.rollback()
            except: pass
            conn.close()

def is_season_folder(folder_name):
    name_lower = unicodedata.normalize('NFC', folder_name).lower().strip()
    if re.match(r'^(season|시즌|series|s)\s*\d+\b', name_lower): return True
    if re.match(r'^(specials?|스페셜|extras?|특집|ova|ost)(\s*\d+)?$', name_lower): return True
    if name_lower.isdigit(): return True
    return False

def natural_sort_key(s):
    return [text.zfill(10) if text.isdigit() else text.lower() for text in re.split(r'(\d+)', str(s))]

def _get_unique_show_folder_count(cursor, rating_key):
    seen_paths = set()
    root_paths = set()
    
    query = """
        SELECT mp.file 
        FROM metadata_items ep 
        JOIN metadata_items sea ON ep.parent_id = sea.id 
        JOIN media_items m ON m.metadata_item_id = ep.id 
        JOIN media_parts mp ON mp.media_item_id = m.id 
        WHERE sea.parent_id = ? AND ep.metadata_type = 4
    """
    cursor.execute(query, (rating_key,))
    for row in cursor.fetchall():
        if row and row[0]:
            raw_file = unicodedata.normalize('NFC', row[0])
            dir_path_original = os.path.dirname(raw_file)
            dir_key = os.path.normpath(dir_path_original).replace('\\', '/').lower()
            
            if dir_key in seen_paths: continue
            seen_paths.add(dir_key)
            target_path = dir_path_original
            
            while True:
                base_name = os.path.basename(target_path)
                if not base_name: break
                if is_season_folder(base_name):
                    parent_path = os.path.dirname(target_path)
                    if parent_path == target_path: break
                    target_path = parent_path
                else:
                    break
            
            root_key = os.path.normpath(target_path).replace('\\', '/').lower()
            root_paths.add(root_key)
            
    return len(root_paths)

def handle_library_batch(data, max_batch_size, db_path):
    if not data or 'ids' not in data:
        return {"error": "Invalid request"}, 400
        
    raw_ids = [str(i) for i in data['ids'] if str(i).isdigit()]
    ids = list(set(raw_ids))[:max_batch_size]
    if not ids: return {}, 200
    
    check_multi_path = data.get('check_multi_path', False)
    placeholders = ','.join('?' for _ in ids)
    
    try:
        with get_db_connection(db_path) as conn:
            cursor = conn.cursor()
            try:
                meta_types = {}
                if check_multi_path:
                    cursor.execute(f"SELECT id, metadata_type FROM metadata_items WHERE id IN ({placeholders})", ids)
                    for r_id, m_type in cursor.fetchall():
                        meta_types[str(r_id)] = m_type

                query = f"""
                SELECT mi.id, m.width,
                    (SELECT group_concat(ms.codec || '|' || IFNULL(ms.extra_data, ''), ';;') FROM media_streams ms WHERE ms.media_item_id = m.id AND ms.stream_type_id = 1) as raw_stream_data,
                    (SELECT group_concat(ms.id || '|' || IFNULL(ms.language, 'und') || '|' || IFNULL(ms.codec, '') || '|' || IFNULL(ms.url, ''), ';;') FROM media_streams ms WHERE ms.media_item_id = m.id AND ms.stream_type_id = 3) as sub_data,
                    mi.guid, mp.file, mp.id
                FROM metadata_items mi
                LEFT JOIN media_items m ON m.metadata_item_id = mi.id
                LEFT JOIN media_parts mp ON mp.media_item_id = m.id
                WHERE mi.id IN ({placeholders}) ORDER BY m.width DESC, m.bitrate DESC
                """
                cursor.execute(query, ids)
                result_map = {}
                for rk, width, raw_data, sub_data, guid, filepath, part_id in cursor.fetchall():
                    rk = str(rk)
                    if filepath: filepath = unicodedata.normalize('NFC', filepath)
                    
                    path_count = 1
                    if check_multi_path and rk not in result_map and meta_types.get(rk) == 2:
                        path_count = _get_unique_show_folder_count(cursor, rk)

                    if rk not in result_map:
                        clean_guid = guid.split("://")[1].split("?")[0] if guid and "://" in guid else (guid or "")
                        if not filepath:
                            result_map[rk] = { "tags": [], "g": clean_guid, "raw_g": guid or "", "p": "", "part_id": None, "sub_id": "", "sub_url": "", "path_count": path_count }
                            continue
                            
                        tags, res_tag = [], None
                        width = width if width else 0
                        
                        if width > 0:
                            if width >= 7000: res_tag = "8K"
                            elif width >= 5000: res_tag = "6K"
                            elif width >= 3400: res_tag = "4K"
                            elif width >= 1900: res_tag = "FHD"
                            elif width >= 1200: res_tag = "HD"
                            else: res_tag = "SD"
                        
                        hdr_badges = set()
                        if raw_data:
                            raw_upper = raw_data.upper()
                            if 'DOVI' in raw_upper or 'DOLBY' in raw_upper: hdr_badges.add('DV')
                            if 'BT2020' in raw_upper or 'SMPTE2084' in raw_upper or 'HLG' in raw_upper or 'HDR10' in raw_upper: hdr_badges.add('HDR')

                        video_badge = res_tag if res_tag else ""
                        if hdr_badges:
                            sorted_badges = sorted(list(hdr_badges), key=lambda x: 0 if x=='DV' else 1)
                            video_badge = video_badge + " " + "/".join(sorted_badges) if video_badge else "/".join(sorted_badges)
                        if video_badge: tags.append(video_badge)
                        
                        has_sub = False
                        best_sub_id, best_sub_url = "", ""

                        if sub_data:
                            streams = sub_data.split(';;')
                            kor_subs = []
                            for s in streams:
                                parts = s.split('|')
                                if len(parts) >= 4:
                                    s_id, s_lang, s_codec, s_url = parts[0], parts[1].lower(), parts[2].lower(), parts[3]
                                    if s_lang.startswith('kor') or s_lang.startswith('ko'):
                                        has_sub = True
                                        score = 0
                                        if s_url: score += 100
                                        if s_codec in ['srt', 'ass', 'smi', 'vtt', 'ssa', 'sub', 'sup']: score += 50
                                        kor_subs.append((score, s_id, s_url))
                            
                            if kor_subs:
                                kor_subs.sort(key=lambda x: x[0], reverse=True)
                                best_sub_id, best_sub_url = kor_subs[0][1], kor_subs[0][2]

                        if has_sub: tags.append("SUB")
                        elif filepath and re.search(r'(?i)(kor-?sub|자체자막)', filepath): tags.append("SUBBED")

                        result_map[rk] = { 
                            "tags": tags, "g": clean_guid, "raw_g": guid or "", 
                            "p": filepath, "part_id": part_id,
                            "sub_id": best_sub_id, "sub_url": best_sub_url,
                            "path_count": path_count
                        }
            finally:
                cursor.close()

        return result_map, 200
    except Exception as e:
        print(f"[PMH BATCH ERROR] Failed processing batch: {str(e)}")
        return {"error": str(e)}, 500

def handle_media_detail(rating_key, db_path):
    if not rating_key.isdigit(): 
        return {"error": "Invalid rating_key"}, 400

    total_duration = 0
    try:
        with get_db_connection(db_path) as conn:
            cursor = conn.cursor()
            try:
                cursor.execute("SELECT metadata_type, guid, library_section_id FROM metadata_items WHERE id = ?", (rating_key,))
                meta_row = cursor.fetchone()
                if not meta_row: 
                    return {"error": "Item not found"}, 404
                m_type, guid, lib_section_id = meta_row
                
                if m_type in (2, 3, 8):
                    folder_paths, seen_paths = [], set()
                    
                    if m_type == 2:
                        query = """SELECT mp.file FROM metadata_items ep JOIN metadata_items sea ON ep.parent_id = sea.id JOIN media_items m ON m.metadata_item_id = ep.id JOIN media_parts mp ON mp.media_item_id = m.id WHERE sea.parent_id = ? AND ep.metadata_type = 4 ORDER BY m.width DESC, m.bitrate DESC"""
                        cursor.execute(query, (rating_key,))
                        
                        dur_query = """
                            SELECT SUM(dur) FROM (
                                SELECT MAX(m.duration) as dur
                                FROM metadata_items ep
                                JOIN metadata_items sea ON ep.parent_id = sea.id
                                JOIN media_items m ON m.metadata_item_id = ep.id
                                WHERE sea.parent_id = ? AND ep.metadata_type = 4
                                  AND sea."index" = (
                                      SELECT MIN("index")
                                      FROM metadata_items
                                      WHERE parent_id = sea.parent_id AND metadata_type = 3
                                        AND ("index" % 100) = (sea."index" % 100)
                                  )
                                GROUP BY ep.id
                            )
                        """
                        try:
                            dur_c = conn.cursor()
                            dur_c.execute(dur_query, (rating_key,))
                            dur_res = dur_c.fetchone()
                            if dur_res and dur_res[0]: total_duration = dur_res[0]
                            dur_c.close()
                        except: pass

                    elif m_type == 3:
                        query = """SELECT mp.file FROM metadata_items ep JOIN media_items m ON m.metadata_item_id = ep.id JOIN media_parts mp ON mp.media_item_id = m.id WHERE ep.parent_id = ? AND ep.metadata_type = 4 ORDER BY m.width DESC, m.bitrate DESC"""
                        cursor.execute(query, (rating_key,))
                        
                        dur_query = """
                            SELECT SUM(dur) FROM (
                                SELECT MAX(m.duration) as dur
                                FROM metadata_items ep
                                JOIN media_items m ON m.metadata_item_id = ep.id
                                WHERE ep.parent_id = ? AND ep.metadata_type = 4
                                GROUP BY ep.id
                            )
                        """
                        try:
                            dur_c = conn.cursor()
                            dur_c.execute(dur_query, (rating_key,))
                            dur_res = dur_c.fetchone()
                            if dur_res and dur_res[0]: total_duration = dur_res[0]
                            dur_c.close()
                        except: pass

                    elif m_type == 8:
                        query = """SELECT mp.file FROM metadata_items track JOIN metadata_items album ON track.parent_id = album.id JOIN media_items m ON m.metadata_item_id = track.id JOIN media_parts mp ON mp.media_item_id = m.id WHERE album.parent_id = ? AND track.metadata_type = 10 GROUP BY album.id"""
                        cursor.execute(query, (rating_key,))

                    for row in cursor.fetchall():
                        if row and row[0]:
                            raw_file = unicodedata.normalize('NFC', row[0])
                            
                            if m_type == 8:
                                album_dir = os.path.dirname(raw_file)
                                artist_dir = os.path.dirname(album_dir)
                                if re.match(r'^cd\s*\d+', os.path.basename(album_dir).lower()):
                                    artist_dir = os.path.dirname(artist_dir)
                                target_dir = artist_dir
                            else:
                                target_dir = os.path.dirname(raw_file)
                                
                            dir_key = os.path.normpath(target_dir).replace('\\', '/').lower()
                            
                            if dir_key not in seen_paths:
                                seen_paths.add(dir_key)
                                folder_paths.append(target_dir)
                                
                            if m_type in (2, 3) and is_season_folder(os.path.basename(target_dir)):
                                parent_path_original = os.path.dirname(target_dir)
                                parent_key = os.path.normpath(parent_path_original).replace('\\', '/').lower()
                                if parent_key not in seen_paths:
                                    seen_paths.add(parent_key)
                                    folder_paths.append(parent_path_original)

                    folder_paths.sort(key=natural_sort_key)
                    versions = [{"file": path, "parts": [{"path": path}]} for path in folder_paths]
                    
                    return { 
                        "type": "directory", 
                        "itemId": rating_key, 
                        "guid": guid, 
                        "duration": total_duration,
                        "librarySectionID": lib_section_id, 
                        "versions": versions 
                    }, 200

                if m_type == 9:
                    tracks = []
                    
                    query = """
                        SELECT 
                            track.id as t_id, 
                            track."index" as t_num, 
                            track.title as t_title,
                            m.audio_codec, 
                            (SELECT bitrate FROM media_streams WHERE media_item_id = m.id AND stream_type_id = 2 LIMIT 1) as a_bitrate,
                            mp.file,
                            mp.id as part_id,
                            (SELECT COUNT(*) FROM media_streams WHERE media_item_id = m.id AND stream_type_id = 3) as has_lyric,
                            (SELECT "index" FROM metadata_items WHERE id = track.parent_id) as disc_num
                        FROM metadata_items track 
                        JOIN media_items m ON m.metadata_item_id = track.id 
                        JOIN media_parts mp ON mp.media_item_id = m.id 
                        WHERE track.metadata_type = 10 AND (
                            track.parent_id = ? OR 
                            track.parent_id IN (SELECT id FROM metadata_items WHERE parent_id = ? AND metadata_type = 9)
                        )
                        ORDER BY disc_num ASC, track."index" ASC
                    """
                    cursor.execute(query, (rating_key, rating_key))
                    
                    folder_paths, seen_paths = [], set()
                    for row in cursor.fetchall():
                        t_id, t_num, t_title, a_codec, a_bitrate, f_path, part_id, has_lyric, disc_num = row
                        
                        if f_path:
                            raw_file = unicodedata.normalize('NFC', f_path)
                            dir_path_original = os.path.dirname(raw_file)
                            dir_key = os.path.normpath(dir_path_original).replace('\\', '/').lower()
                            if dir_key not in seen_paths:
                                seen_paths.add(dir_key)
                                folder_paths.append(dir_path_original)
                        
                        track_display_num = f"{disc_num}-{t_num}" if disc_num and disc_num > 1 else str(t_num or 0)
                        
                        tracks.append({
                            "t_id": t_id, "t_num": track_display_num, "t_title": t_title or "Unknown Track",
                            "a_codec": (a_codec or "").upper(), "a_bitrate": a_bitrate or 0,
                            "file": f_path or "", "part_id": part_id, "has_lyric": has_lyric > 0
                        })
                        
                    folder_paths.sort(key=natural_sort_key)
                    versions = [{"file": path, "parts": [{"path": path}]} for path in folder_paths]
                    
                    return { "type": "album", "itemId": rating_key, "guid": guid, "duration": None, "librarySectionID": lib_section_id, "versions": versions, "tracks": tracks }, 200

                query_media = """
                    SELECT m.id, m.width, m.height, 
                           (SELECT bitrate FROM media_streams WHERE media_item_id = m.id AND stream_type_id = 1 LIMIT 1) as v_bitrate, 
                           (SELECT group_concat(ms.codec || '|' || IFNULL(ms.extra_data, ''), ';;') FROM media_streams ms WHERE media_item_id = m.id AND stream_type_id = 1) as raw_stream_data, 
                           m.video_codec, 
                           IFNULL(NULLIF(m.audio_codec, ''), (SELECT codec FROM media_streams WHERE media_item_id = m.id AND stream_type_id = 2 LIMIT 1)) as audio_codec, 
                           m.duration,
                           (SELECT channels FROM media_streams WHERE media_item_id = m.id AND stream_type_id = 2 LIMIT 1) as audio_ch, 
                           (SELECT bitrate FROM media_streams WHERE media_item_id = m.id AND stream_type_id = 2 LIMIT 1) as a_bitrate, 
                           mp.id, mp.file 
                    FROM media_items m 
                    LEFT JOIN media_parts mp ON mp.media_item_id = m.id 
                    WHERE m.metadata_item_id = ? 
                    ORDER BY m.width DESC, m.bitrate DESC
                """
                cursor.execute(query_media, (rating_key,))
                versions, duration = [], 0
                seen_files = set() 

                for row in cursor.fetchall():
                    m_id, width, height, v_bitrate, raw_data, v_codec, a_codec, dur, a_ch, a_bitrate, part_id, file_path = row
                    
                    if file_path:
                        file_path = unicodedata.normalize('NFC', file_path)
                        file_key = os.path.normpath(file_path).replace('\\', '/').lower()
                        if file_key in seen_files: continue
                        seen_files.add(file_key)
                        
                    if dur: duration = dur
                    
                    hdr_badges = set()
                    if raw_data:
                        raw_upper = raw_data.upper()
                        if 'DOVI' in raw_upper or 'DOLBY' in raw_upper: hdr_badges.add('DV')
                        if 'BT2020' in raw_upper or 'SMPTE2084' in raw_upper or 'HLG' in raw_upper or 'HDR10' in raw_upper: hdr_badges.add('HDR')
                    video_extra = " " + "/".join(sorted(list(hdr_badges), key=lambda x: 0 if x=='DV' else 1)) if hdr_badges else ""

                    cursor.execute("SELECT id, language, codec, url FROM media_streams WHERE media_part_id = ? AND stream_type_id = 3", (part_id,))
                    subs = [{"id": s[0], "languageCode": (s[1] or "und").lower()[:3], "codec": s[2] or "unknown", "key": s[3], "format": s[2] or "unknown"} for s in cursor.fetchall()]
                    
                    versions.append({
                        "part_id": part_id, "file": file_path, "width": width or 0, "v_bitrate": v_bitrate or 0, 
                        "video_extra": video_extra, "v_codec": v_codec or "", "a_codec": a_codec or "", 
                        "a_ch": a_ch or "", "a_bitrate": a_bitrate or 0, "subs": subs, "parts": [{"id": part_id, "path": file_path}],
                        "m_type": m_type
                    })
                
                cursor.execute("SELECT text, time_offset, end_time_offset FROM taggings WHERE metadata_item_id = ? AND text IN ('intro', 'credits')", (rating_key,))
                markers = {tag_text: {"start": start_offset, "end": end_offset} for tag_text, start_offset, end_offset in cursor.fetchall() if tag_text and start_offset is not None and end_offset is not None}
            
            finally:
                cursor.close()
                
        return { 
            "type": "directory" if m_type in (2, 3) else "album" if m_type == 8 else "audio" if m_type == 10 else "video", 
            "itemId": rating_key, "guid": guid, 
            "duration": total_duration if m_type in (2, 3) else duration, 
            "librarySectionID": lib_section_id, "versions": versions, "markers": markers 
        }, 200
    except Exception as e:
        print(f"[PMH DETAIL ERROR] Failed processing item {rating_key}: {str(e)}")
        return {"error": str(e)}, 500

# ==============================================================================
# [코어 작업 관리자 (Task Manager)]
# ==============================================================================
class CoreTaskManager:
    def __init__(self, base_dir, tool_id, server_id="default"):
        self.tool_id = tool_id
        self.db_file = os.path.join(base_dir, 'task_logs', f"{tool_id}_{server_id}_task.db")
        os.makedirs(os.path.dirname(self.db_file), exist_ok=True)
        self._lock = threading.Lock()

    @contextmanager
    def _get_conn(self):
        conn = sqlite3.connect(self.db_file, timeout=10.0)
        conn.row_factory = sqlite3.Row
        try: yield conn
        finally: conn.commit(); conn.close()

    def _setup_db(self):
        with self._get_conn() as conn:
            c = conn.cursor()
            c.execute("CREATE TABLE IF NOT EXISTS task_info (state TEXT, progress INTEGER, total INTEGER, task_data TEXT)")
            c.execute("CREATE TABLE IF NOT EXISTS logs (id INTEGER PRIMARY KEY AUTOINCREMENT, log_text TEXT)")
            c.execute("SELECT count(*) FROM task_info")
            if c.fetchone()[0] == 0:
                c.execute("INSERT INTO task_info (state, progress, total, task_data) VALUES ('completed', 0, 0, '{}')")

    def load(self, include_target_items=False):
        """UI 폴링 병목 제거를 위해 include_target_items 옵션 제공"""
        with self._lock:
            if not os.path.exists(self.db_file): return None
            try:
                with self._get_conn() as conn:
                    c = conn.cursor()
                    c.execute("SELECT state, progress, total, task_data FROM task_info LIMIT 1")
                    row = c.fetchone()
                    if not row: return None
                    
                    raw_task_data = json.loads(row['task_data'] or '{}')
                    if not include_target_items and 'target_items' in raw_task_data:
                        del raw_task_data['target_items']

                    data = {
                        "state": row['state'],
                        "progress": row['progress'],
                        "total": row['total'],
                        "task_data": raw_task_data
                    }
                    c.execute("SELECT log_text FROM (SELECT id, log_text FROM logs ORDER BY id DESC LIMIT 50) sub ORDER BY id ASC")
                    data['logs'] = [l['log_text'] for l in c.fetchall()]
                    return data
            except: 
                return None

    def save(self, data):
        with self._lock:
            self._setup_db()
            try:
                with self._get_conn() as conn:
                    c = conn.cursor()
                    task_data_str = json.dumps(data.get('task_data', {}), ensure_ascii=False)
                    c.execute("UPDATE task_info SET state=?, progress=?, total=?, task_data=?", 
                              (data.get('state', 'completed'), data.get('progress', 0), data.get('total', 0), task_data_str))
            except: pass

    def init_task(self, task_data):
        with self._lock:
            self._setup_db()
            with self._get_conn() as conn:
                c = conn.cursor()
                c.execute("DELETE FROM logs")
                c.execute("UPDATE task_info SET state='running', progress=0, total=?, task_data=?", 
                          (task_data.get('total', 0), json.dumps(task_data, ensure_ascii=False)))
                c.execute("INSERT INTO logs (log_text) VALUES ('작업을 시작합니다...')")

    def reset(self):
        with self._lock:
            if os.path.exists(self.db_file):
                try: os.remove(self.db_file)
                except: pass

    def log(self, msg):
        stamp = datetime.now().strftime('%H:%M:%S')
        log_line = f"[{stamp}] {msg}"
        print(f"[PMH {self.tool_id}] {msg}")
        with self._lock:
            self._setup_db()
            with self._get_conn() as conn:
                c = conn.cursor()
                c.execute("INSERT INTO logs (log_text) VALUES (?)", (log_line,))

    def update_state(self, state, progress=None, total=None):
        with self._lock:
            self._setup_db()
            with self._get_conn() as conn:
                c = conn.cursor()
                if progress is not None and total is not None:
                    c.execute("UPDATE task_info SET state=?, progress=?, total=?", (state, progress, total))
                elif progress is not None:
                    c.execute("UPDATE task_info SET state=?, progress=?", (state, progress))
                else:
                    c.execute("UPDATE task_info SET state=?", (state,))

    def is_cancelled(self):
        with self._lock:
            if not os.path.exists(self.db_file): return True
            try:
                with self._get_conn() as conn:
                    c = conn.cursor()
                    c.execute("SELECT state FROM task_info LIMIT 1")
                    row = c.fetchone()
                    if row: return row['state'] in ['cancelled', 'error']
            except: pass
            return True

# ==============================================================================
# [코어 데이터 캐시 관리자]
# ==============================================================================
class CoreDataManager:
    def __init__(self, base_dir, tool_id, server_id="default"):
        self.db_file = os.path.join(base_dir, 'task_logs', f"{tool_id}_{server_id}_cache.db")
        os.makedirs(os.path.dirname(self.db_file), exist_ok=True)
        self._lock = threading.Lock()

    @contextmanager
    def _get_conn(self):
        conn = sqlite3.connect(self.db_file, timeout=10.0)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute("PRAGMA synchronous=NORMAL;")
        try: yield conn
        finally: conn.commit(); conn.close()

    def reset_db(self):
        with self._lock:
            if os.path.exists(self.db_file):
                try: os.remove(self.db_file)
                except: pass

    @contextmanager
    def transaction_session(self):
        with self._lock:
            conn = sqlite3.connect(self.db_file, timeout=10.0)
            conn.execute("PRAGMA journal_mode=WAL;")
            conn.execute("PRAGMA synchronous=NORMAL;")
            try:
                conn.execute("BEGIN IMMEDIATE;")
                yield conn
                conn.commit()
            except Exception as e:
                conn.rollback()
                raise e
            finally:
                conn.close()

    def save(self, res_data):
        self.reset_db()
        with self._lock:
            with self._get_conn() as conn:
                c = conn.cursor()
                
                meta_dict = {k: v for k, v in res_data.items() if k != 'data'}
                c.execute("CREATE TABLE meta (payload TEXT)")
                c.execute("INSERT INTO meta (payload) VALUES (?)", (json.dumps(meta_dict, ensure_ascii=False),))
                
                data_list = res_data.get('data')
                if not data_list:
                    return

                default_sort = res_data.get('default_sort')
                if default_sort:
                    data_list = core_natural_sort(data_list, default_sort)

                columns = list(data_list[0].keys())
                col_defs = ", ".join([f'"{col}" TEXT' for col in columns])
                c.execute(f"CREATE TABLE data (pmh_id INTEGER PRIMARY KEY AUTOINCREMENT, {col_defs}, pmh_status TEXT DEFAULT 'pending')")
                c.execute("CREATE INDEX idx_status ON data (pmh_status)")
                
                if "rating_key" in columns: c.execute('CREATE INDEX idx_rk ON data ("rating_key")')
                if "id" in columns: c.execute('CREATE INDEX idx_id ON data ("id")')
                
                col_names = ", ".join([f'"{col}"' for col in columns])
                placeholders = ", ".join(["?" for _ in columns])
                insert_sql = f"INSERT INTO data ({col_names}) VALUES ({placeholders})"
                
                CHUNK_SIZE = 10000
                buffer = []
                
                for row_dict in data_list:
                    processed_row = []
                    for col in columns:
                        val = row_dict.get(col)
                        if isinstance(val, (list, dict)): processed_row.append(json.dumps(val, ensure_ascii=False))
                        elif val is not None: processed_row.append(str(val))
                        else: processed_row.append('')
                    buffer.append(processed_row)
                    
                    if len(buffer) >= CHUNK_SIZE:
                        c.executemany(insert_sql, buffer)
                        conn.commit()
                        buffer.clear()
                
                if buffer:
                    c.executemany(insert_sql, buffer)
                    conn.commit()

    def load_page(self, page, limit, sort_key=None, sort_dir='asc'):
        with self._lock:
            if not os.path.exists(self.db_file): 
                return {"data": [], "total_items": 0, "total_pages": 1, "page": page, "columns": []}
            
            with self._get_conn() as conn:
                c = conn.cursor()
                
                c.execute("SELECT count(name) FROM sqlite_master WHERE type='table' AND name='meta'")
                if c.fetchone()[0] == 0: 
                    return {"data": [], "total_items": 0, "total_pages": 1, "page": page, "columns": []}
                
                c.execute("SELECT payload FROM meta LIMIT 1")
                meta_row = c.fetchone()
                if not meta_row: 
                    return {"data": [], "total_items": 0, "total_pages": 1, "page": page, "columns": []}
                
                result = json.loads(meta_row[0])
                
                if result.get('type') == 'dashboard':
                    return result
                    
                c.execute("SELECT count(name) FROM sqlite_master WHERE type='table' AND name='data'")
                if c.fetchone()[0] == 0:
                    result['data'] = []
                    result['total_items'] = 0
                    result['total_pages'] = 1
                    result['page'] = page
                    return result

                where_clause = "WHERE pmh_status IN ('pending', 'error')"
                
                c.execute(f"SELECT COUNT(pmh_id) FROM data {where_clause}")
                total_items = c.fetchone()[0]
                
                order_clause = "ORDER BY pmh_id ASC"
                
                if sort_key:
                    columns_meta = result.get('columns', [])
                    col_map = {col['key']: col for col in columns_meta}
                    actual_key = col_map.get(sort_key, {}).get('sort_key', sort_key)
                    sort_type = col_map.get(sort_key, {}).get('sort_type', 'string')
                    s_dir = str(sort_dir).upper() if str(sort_dir).upper() in ['ASC', 'DESC'] else 'ASC'
                    
                    if sort_type == 'number':
                        order_clause = f"ORDER BY CAST(\"{actual_key}\" AS REAL) {s_dir}"
                    else:
                        order_clause = f"ORDER BY \"{actual_key}\" COLLATE NOCASE {s_dir}"

                offset = (page - 1) * limit
                
                query = f"SELECT *, pmh_status as _pmh_status_val FROM data {where_clause} {order_clause} LIMIT ? OFFSET ?"
                
                c.execute(query, (limit, offset))

                data_rows = []
                for row in c.fetchall():
                    row_dict = dict(row)
                    status_val = row_dict.pop('_pmh_status_val', 'pending')
                    row_dict['_pmh_status'] = status_val
                    row_dict.pop('pmh_status', None) 
                    
                    for k, v in row_dict.items():
                        if isinstance(v, str) and (v.startswith('[') or v.startswith('{')):
                            try: row_dict[k] = json.loads(v)
                            except: pass
                    data_rows.append(row_dict)
                
                result['data'] = data_rows
                result['total_items'] = total_items
                result['page'] = page
                result['total_pages'] = max(1, (total_items + limit - 1) // limit)
                
                return result

    def mark_as_done(self, key_column, key_value):
        with self._lock:
            if not os.path.exists(self.db_file): return
            with self._get_conn() as conn:
                c = conn.cursor()
                c.execute("SELECT count(name) FROM sqlite_master WHERE type='table' AND name='data'")
                if c.fetchone()[0] == 1:
                    c.execute(f"UPDATE data SET pmh_status = 'done' WHERE \"{key_column}\" = ?", (str(key_value),))

    def mark_as_error(self, key_column, key_value):
        with self._lock:
            if not os.path.exists(self.db_file): return
            with self._get_conn() as conn:
                c = conn.cursor()
                c.execute("SELECT count(name) FROM sqlite_master WHERE type='table' AND name='data'")
                if c.fetchone()[0] == 1:
                    c.execute(f"UPDATE data SET pmh_status = 'error' WHERE \"{key_column}\" = ?", (str(key_value),))

    def load_dashboard(self):
        with self._lock:
            if not os.path.exists(self.db_file): return None
            try:
                with self._get_conn() as conn:
                    c = conn.cursor()
                    c.execute("SELECT count(name) FROM sqlite_master WHERE type='table' AND name='meta'")
                    if c.fetchone()[0] == 0: return None
                    c.execute("SELECT payload FROM meta LIMIT 1")
                    row = c.fetchone()
                    if row and row[0]: return json.loads(row[0])
            except: pass
            return None

    def mark_keys_as_done(self, key_column, keys_list):
        with self._lock:
            if not os.path.exists(self.db_file) or not keys_list: return
            with self._get_conn() as conn:
                c = conn.cursor()
                placeholders = ",".join("?" for _ in keys_list)
                try:
                    c.execute(f'UPDATE data SET pmh_status = "done" WHERE "{key_column}" IN ({placeholders})', keys_list)
                except Exception as e:
                    print(f"[PMH DB] mark_keys_as_done 실패: {e}")

    def remove_item_by_pmh_id(self, pmh_id):
        with self._lock:
            if not os.path.exists(self.db_file): return
            with self._get_conn() as conn:
                c = conn.cursor()
                c.execute("SELECT count(name) FROM sqlite_master WHERE type='table' AND name='data'")
                if c.fetchone()[0] == 1:
                    c.execute("UPDATE data SET pmh_status = 'done' WHERE pmh_id = ?", (pmh_id,))

# ==============================================================================
# [코어 UI 옵션 캐시 관리자 (Options Manager)]
# ==============================================================================
class CoreOptionsManager:
    def __init__(self, base_dir, tool_id, server_id="default"):
        self.db_file = os.path.join(base_dir, 'task_logs', f"{tool_id}_{server_id}_options.db")
        os.makedirs(os.path.dirname(self.db_file), exist_ok=True)
        self._lock = threading.Lock()

    @contextmanager
    def _get_conn(self):
        conn = sqlite3.connect(self.db_file, timeout=10.0)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute("PRAGMA synchronous=NORMAL;")
        conn.execute("PRAGMA temp_store=MEMORY;")
        try: yield conn
        finally: conn.commit(); conn.close()

    def load(self):
        with self._lock:
            if not os.path.exists(self.db_file): return {}
            try:
                with self._get_conn() as conn:
                    c = conn.cursor()
                    c.execute("SELECT count(name) FROM sqlite_master WHERE type='table' AND name='options'")
                    if c.fetchone()[0] == 0: return {}
                    c.execute("SELECT payload FROM options LIMIT 1")
                    row = c.fetchone()
                    if row and row[0]: return json.loads(row[0])
            except: pass
            return {}

    def save(self, data):
        with self._lock:
            try:
                with self._get_conn() as conn:
                    c = conn.cursor()
                    c.execute("CREATE TABLE IF NOT EXISTS options (payload TEXT)")
                    c.execute("DELETE FROM options")
                    c.execute("INSERT INTO options (payload) VALUES (?)", (json.dumps(data, ensure_ascii=False),))
            except: pass

    def reset(self):
        with self._lock:
            if os.path.exists(self.db_file):
                try: os.remove(self.db_file)
                except: pass

def _core_worker_runner(module, task_data, core_api, start_progress, tool_id, server_id="default"):
    threading.current_thread().name = f"Worker_{tool_id}_{server_id}"
    
    tool_lock = get_tool_lock(tool_id, server_id)
    
    try:
        if hasattr(module, 'worker'): 
            module.worker(task_data, core_api, start_progress)
        else:
            core_api['task'].log("오류: 툴에 worker 함수가 구현되어 있지 않습니다.")
            core_api['task'].update_state('error')
    except Exception as e:
        import traceback
        core_api['task'].log(f"[System Error] 작업 중 치명적 오류 발생: {str(e)}")
        traceback.print_exc()
        core_api['task'].update_state('error')
    finally:
        try:
            tool_lock.release()
        except RuntimeError:
            pass

def create_db_api(db_path, sqlite_bin=None):
    def _run_cli_query(query, params=(), is_select=False):
        if not sqlite_bin or not os.path.exists(sqlite_bin):
            raise FileNotFoundError(f"Plex SQLite 바이너리를 찾을 수 없습니다. (경로: {sqlite_bin})\npmh_config.yaml의 PLEX_SQLITE_BIN 경로를 확인하세요.")
        
        formatted_query = query
        for p in params:
            if p is None:
                val = "NULL"
            elif isinstance(p, (int, float)):
                val = str(p)
            else:
                val = "'" + str(p).replace("'", "''") + "'"
            formatted_query = formatted_query.replace('?', val, 1)

        if is_select:
            final_script = f".mode csv\n.header on\n{formatted_query};\n"
        else:
            final_script = f"BEGIN IMMEDIATE;\n{formatted_query};\nCOMMIT;\n"
        
        cmd = [sqlite_bin, db_path]
        try:
            result = subprocess.run(cmd, input=final_script.encode('utf-8'), capture_output=True, check=True, timeout=15)
            output = result.stdout.decode('utf-8').strip()
            
            if is_select:
                if not output: return []
                reader = csv.DictReader(io.StringIO(output))
                return [dict(row) for row in reader]
            else:
                return True, output
                
        except subprocess.TimeoutExpired:
            raise Exception("Plex SQLite 실행 시간 초과 (15초). DB Lock 의심.")
        except subprocess.CalledProcessError as e:
            error_msg = e.stderr.decode('utf-8')
            raise Exception(f"Plex SQLite 실행 실패: {error_msg}")

    def smart_query(query, params=()):
        if not query.strip().upper().startswith("SELECT"):
            raise ValueError("Security Error: 'query' API는 SELECT 문만 허용합니다. 쓰기 작업은 'execute'를 사용하세요.")
            
        wal_path = f"{db_path}-wal"
        
        if os.path.exists(wal_path):
            with get_db_connection(db_path) as conn:
                cursor = conn.cursor()
                cursor.execute(query, params)
                columns = [col[0] for col in cursor.description]
                return [dict(zip(columns, row)) for row in cursor.fetchall()]
                
        else:
            print("[PMH DB] Plex 서버 종료 감지. 안전을 위해 Plex SQLite 바이너리로 SELECT 쿼리를 우회 실행합니다.")
            return _run_cli_query(query, params, is_select=True)

    def execute_via_bin(query, params=()):
        """쓰기(UPDATE/INSERT/DELETE) 작업 전용 API (항상 Plex SQLite 바이너리 사용)"""
        return _run_cli_query(query, params, is_select=False)

    return {
        "query": smart_query, 
        "execute": execute_via_bin
    }

# ==============================================================================
# [플러그인 도구(Tool) 관리 및 중앙 라우터]
# ==============================================================================
def _load_tool_module(tools_dir, tool_id, entry_file):
    file_path = os.path.join(tools_dir, tool_id, entry_file)
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"Entry file not found: {file_path}")
    
    module_name = f"pmh_tool_{tool_id}"

    import importlib
    import importlib.util
    if module_name in sys.modules:
        del sys.modules[module_name]
    importlib.invalidate_caches()

    spec = importlib.util.spec_from_file_location(module_name, file_path)
    if spec is None or spec.loader is None:
        raise ImportError(f"Failed to load spec for module: {module_name}")
    
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module

def check_update_readiness(base_dir, force_update=False):
    active_workers = [t for t in threading.enumerate() if t.name.startswith("Worker_")]
    
    if not active_workers:
        return True, 0, "진행 중인 작업이 없습니다."
        
    if not force_update:
        return False, len(active_workers), f"현재 진행 중인 작업({len(active_workers)}건)이 있습니다."
        
    print(f"[PMH Core] Force update requested. Sending cancel signals to {len(active_workers)} workers in parallel...")
    
    logs_dir = os.path.join(base_dir, 'task_logs')
    
    for worker_thread in active_workers:
        parts = worker_thread.name.split('_', 2)
        tool_id = parts[1] if len(parts) >= 2 else "unknown"
        server_id = parts[2] if len(parts) >= 3 else "default"
        
        setattr(worker_thread, 'do_run', False)
        
        if os.path.exists(logs_dir):
            db_file = os.path.join(logs_dir, f"{tool_id}_{server_id}_task.db")
            if os.path.exists(db_file):
                try:
                    with sqlite3.connect(db_file, timeout=5.0) as conn:
                        c = conn.cursor()
                        c.execute("UPDATE task_info SET state='cancelled' WHERE state IN ('running', 'pending')")
                        c.execute("INSERT INTO logs (log_text) VALUES (?)", ("🛑 서버 업데이트 요청으로 인해 작업을 중단합니다.",))
                        conn.commit()
                    print(f"[PMH Core] Cancel signal sent to DB: {tool_id} on {server_id[:8]}")
                except Exception as db_err:
                    print(f"[PMH Core] Failed to send cancel signal to DB: {db_err}")
                    
    print("[PMH Core] Waiting for all worker threads to physically terminate...")
    max_wait_seconds = 15.0
    start_wait = time.time()
    
    while time.time() - start_wait < max_wait_seconds:
        still_running = [t for t in active_workers if t.is_alive()]
        if not still_running:
            print(f"[PMH Core] All workers successfully terminated in {time.time() - start_wait:.1f} seconds.")
            return True, 0, "모든 작업이 안전하게 종료되었습니다."
            
        time.sleep(0.5)
        
    still_running = [t.name for t in active_workers if t.is_alive()]
    print(f"[PMH Core Error] Timeout! Following threads did not terminate: {still_running}")
    print("[PMH Core Error] Update aborted to prevent database corruption or incomplete state.")
    
    return False, len(still_running), f"{max_wait_seconds}초 대기 후에도 {len(still_running)}개의 작업이 종료되지 않았습니다."

def dispatch_request(subpath, method, args, data, global_config):
    base_dir = global_config.get("base_dir")
    db_path = global_config.get("plex_db_path")
    max_batch_size = global_config.get("max_batch_size", 1000)

    tools_dir = os.path.join(base_dir, 'tools')
    os.makedirs(tools_dir, exist_ok=True)

    try:
        if subpath == 'ping' and method == 'GET':
            machine_id = global_config.get("machine_id", "")
            ignore_res = global_config.get("IGNORE_RES_SECTION", "")
            return {"status": "ok", "version": __version__, "machine_id": machine_id, "ignore_res_section": ignore_res}, 200

        elif subpath == 'library/batch' and method == 'POST':
            return handle_library_batch(data, max_batch_size, db_path)
            
        elif subpath == 'media/queue_status' and method == 'POST':
            task_ids = data.get('task_ids', [])
            if isinstance(task_ids, str): 
                task_ids = task_ids.split(',')
            
            result = {}
            for tid in task_ids:
                if tid: result[str(tid).strip()] = MEDIA_ACTION_STATUS.get(str(tid).strip(), {'state': 'unknown'})
            return result, 200

        elif subpath == 'media/queue_cancel' and method == 'POST':
            task_id = data.get('task_id')
            if task_id in MEDIA_ACTION_STATUS:
                if MEDIA_ACTION_STATUS[task_id]['state'] == 'queued':
                    MEDIA_ACTION_STATUS[task_id]['state'] = 'cancelled'
                    MEDIA_ACTION_STATUS[task_id]['msg'] = '사용자 취소'
                    return {"status": "success", "msg": "Cancelled"}, 200
                else:
                    return {"status": "error", "msg": "이미 실행 중이거나 완료된 작업입니다."}, 400
            return {"status": "error", "msg": "작업을 찾을 수 없습니다."}, 404

        elif subpath.startswith('media/') and method == 'GET':
            rating_key = subpath.split('/')[1]
            return handle_media_detail(rating_key, db_path)

        elif subpath.startswith('media/') and method == 'POST':
            parts = subpath.split('/')
            if len(parts) >= 3:
                rating_key = parts[1]
                action = parts[2]

                plex_url = global_config.get("plex_url", "")
                plex_token = global_config.get("plex_token", "")
                if not plex_url or not plex_token:
                    plex_url = data.get('_plex_url', '') if data else ''
                    plex_token = data.get('_plex_token', '') if data else ''

                if not plex_url or not plex_token:
                    return {"error": "Plex 접속 정보 누락"}, 400

                task_id = f"task_{rating_key}_{action}_{int(time.time() * 1000)}"
                MEDIA_ACTION_STATUS[task_id] = {'state': 'queued', 'timestamp': time.time()}
                MEDIA_ACTION_QUEUE.put({
                    'task_id': task_id,
                    'item_id': rating_key,
                    'action': action,
                    'plex_url': plex_url,
                    'plex_token': plex_token,
                    'data': data or {}
                })
                
                print(f"[PMH API] 📥 큐에 작업 추가됨 -> Action: {action}, Item: {rating_key}")
                
                return {"status": "queued", "task_id": task_id}, 202

        elif subpath.startswith('mate/') and method == 'POST':
            ff_url = global_config.get("mate_url")
            ff_apikey = global_config.get("mate_apikey")
            
            if not ff_url or not ff_apikey:
                return {"ret": "error", "msg": "노드의 Plex Mate (FF) 설정이 누락되었습니다. (BASE.FF_URL / BASE.FF_APIKEY)"}, 400
                
            ff_url = ff_url.rstrip('/')
            target_endpoint = subpath.replace('mate/', '/plex_mate/api/', 1)
            target_url = f"{ff_url}{target_endpoint}"
            
            form_data = data.copy() if isinstance(data, dict) else {}
            form_data['apikey'] = ff_apikey
            
            safe_form_data = {k: (v if v is not None else '') for k, v in form_data.items()}
            encoded_data = urlencode(safe_form_data).encode('utf-8')
            log_payload = safe_form_data.copy()
            if 'apikey' in log_payload:
                key_str = str(log_payload['apikey'])
                log_payload['apikey'] = f"{key_str[:3]}...{key_str[-3:]}" if len(key_str) > 6 else "****"
            
            print(f"[PMH Core] 🚀 Plex Mate 중계 요청: {target_url} | Payload: {log_payload}")
            
            try:
                req = Request(target_url, data=encoded_data, method='POST')
                req.add_header('Content-Type', 'application/x-www-form-urlencoded')
                
                with urlopen(req, timeout=60) as response:
                    resp_data = response.read().decode('utf-8')
                    try:
                        result_json = json.loads(resp_data)
                        return result_json, 200
                    except json.JSONDecodeError:
                        return {"ret": "error", "msg": "FF 서버의 응답을 파싱할 수 없습니다.", "raw": resp_data}, 500
                        
            except HTTPError as e:
                err_body = e.read().decode('utf-8')
                print(f"[PMH Core Error] FF HTTP Error: {e.code} - {err_body}")
                return {"ret": "error", "msg": f"FF API HTTP 오류 ({e.code})"}, e.code
            except URLError as e:
                print(f"[PMH Core Error] FF Network Error: {e}")
                return {"ret": "error", "msg": f"FF 서버 통신 실패: {str(e)}"}, 502

        elif subpath == 'tools' and method == 'GET':
            installed_tools = []
            for item in os.listdir(tools_dir):
                tool_folder = os.path.join(tools_dir, item)
                info_path = os.path.join(tool_folder, 'info.yaml')
                if os.path.isdir(tool_folder) and os.path.exists(info_path):
                    try:
                        with open(info_path, 'r', encoding='utf-8') as f:
                            tool_info = yaml.safe_load(f)
                            tool_info['id'] = item 
                            installed_tools.append(tool_info)
                    except Exception as e:
                        print(f"[PMH TOOL ERROR] Could not read {info_path}: {e}")
                        
            global GLOBAL_DASHBOARD_CACHE
            return {
                "tools": installed_tools, 
                "dashboard": {
                    "running": GLOBAL_DASHBOARD_CACHE.get("running", []),
                    "cron": GLOBAL_DASHBOARD_CACHE.get("cron", [])
                }
            }, 200

        elif subpath == 'tools/install' and method == 'POST':
            yaml_url = data.get('url')
            prefix = data.get('prefix', '')
            target_id = data.get('target_id', '')
            if not yaml_url: return {"error": "info.yaml URL이 제공되지 않았습니다."}, 400

            ts = int(time.time())
            req = Request(f"{yaml_url}?t={ts}", headers={'Cache-Control': 'no-cache'})
            with urlopen(req, timeout=10) as response:
                yaml_content = response.read().decode('utf-8')

            tool_info = yaml.safe_load(yaml_content)
            original_id = tool_info.get('id')
            entry_file = tool_info.get('entry_file', 'main.py')
            
            if not original_id: return {"error": "잘못된 info.yaml 구조입니다. ('id' 필드 누락)"}, 400

            if target_id: safe_tool_id = target_id
            else: safe_tool_id = f"{prefix}_{original_id}" if (prefix and not original_id.startswith(prefix + "_")) else original_id
                
            tool_info['id'] = safe_tool_id
            if not tool_info.get('update_url'): tool_info['update_url'] = yaml_url

            base_url = yaml_url.rsplit('/', 1)[0]
            py_url = f"{base_url}/{entry_file}?t={ts}"
            py_req = Request(py_url, headers={'Cache-Control': 'no-cache'})
            with urlopen(py_req, timeout=10) as py_response:
                py_content = py_response.read().decode('utf-8')

            tool_path = os.path.join(tools_dir, safe_tool_id)
            os.makedirs(tool_path, exist_ok=True)
            
            with open(os.path.join(tool_path, 'info.yaml'), 'w', encoding='utf-8') as f:
                yaml.dump(tool_info, f, allow_unicode=True, sort_keys=False, default_flow_style=False)
            with open(os.path.join(tool_path, entry_file), 'w', encoding='utf-8') as f:
                f.write(py_content)

            return {"status": "success", "message": f"'{tool_info.get('name', original_id)}' 설치/업데이트 완료!"}, 200

        elif subpath.startswith('tools/') and method == 'DELETE':
            tool_id = subpath.split('/')[1]
            tool_path = os.path.join(tools_dir, tool_id)
            logs_dir = os.path.join(base_dir, 'task_logs')
            if os.path.exists(logs_dir):
                for f_name in os.listdir(logs_dir):
                    if f_name.startswith(f"{tool_id}_") or f_name == f"{tool_id}.json":
                        try: os.remove(os.path.join(logs_dir, f_name))
                        except: pass

            if os.path.exists(tool_path):
                shutil.rmtree(tool_path)
                print(f"[PMH TOOL DELETE] {tool_id} 및 관련 데이터 완전 삭제됨.")
                return {"status": "success"}, 200
            return {"error": "해당 툴을 찾을 수 없습니다."}, 404

        elif subpath.startswith('tool/') and len(subpath.split('/')) >= 3:
            parts = subpath.split('/')
            tool_id = parts[1]
            action = parts[2]

            info_path = os.path.join(tools_dir, tool_id, 'info.yaml')
            if not os.path.exists(info_path): return {"error": "해당 툴이 로컬에 설치되어 있지 않습니다."}, 404
            
            with open(info_path, 'r', encoding='utf-8') as f:
                entry_file = yaml.safe_load(f).get('entry_file', 'main.py')

            try: module = _load_tool_module(tools_dir, tool_id, entry_file)
            except Exception as load_err: return {"error": f"툴 로드 실패: {load_err}"}, 500

            if data is None: data = {}
            server_id = args.get('server_id', data.get('_server_id', 'default')) if data else args.get('server_id', 'default')
            
            options_mgr = CoreOptionsManager(base_dir, tool_id, server_id)
            current_opts = options_mgr.load()
            
            if not current_opts.get('db_path'):
                current_opts['db_path'] = db_path
                
            if not current_opts.get('sqlite_bin'):
                cfg_sqlite_bin = global_config.get('plex_sqlite_bin') if global_config else None
                if not cfg_sqlite_bin:
                    cfg_sqlite_bin = "/usr/lib/plexmediaserver/Plex SQLite"
                current_opts['sqlite_bin'] = cfg_sqlite_bin

            if not current_opts.get('uid_gid'):
                try:
                    target_for_stat = current_opts['db_path']
                    if not os.path.exists(target_for_stat):
                        target_for_stat = os.path.dirname(target_for_stat)
                    
                    if os.path.exists(target_for_stat):
                        stat_info = os.stat(target_for_stat)
                        current_opts['uid_gid'] = f"{stat_info.st_uid}:{stat_info.st_gid}"
                except Exception as e:
                    print(f"[PMH Core] UID:GID 자동 감지 실패: {e}")

            db_api = create_db_api(current_opts['db_path'], current_opts['sqlite_bin'])
            
            task_mgr = CoreTaskManager(base_dir, tool_id, server_id)
            data_mgr = CoreDataManager(base_dir, tool_id, server_id)

            cfg_plex_url = global_config.get("plex_url", "")
            cfg_plex_token = global_config.get("plex_token", "")
            
            final_url = cfg_plex_url if str(cfg_plex_url).strip() else data.get('_plex_url', '')
            final_token = cfg_plex_token if str(cfg_plex_token).strip() else data.get('_plex_token', '')
            
            merged_config = global_config.copy() if global_config else {}
            merged_config['PLEX_URL'] = final_url
            merged_config['PLEX_TOKEN'] = final_token

            def get_plex_instance():
                from plexapi.server import PlexServer
                if not final_url or not final_token: raise ValueError("Plex 서버 정보가 누락되었습니다.")
                plex = PlexServer(final_url, final_token, timeout=120)
                orig_fetchItem = plex.fetchItem
                def safe_fetchItem(ekey, *args, **kwargs):
                    if isinstance(ekey, str) and ekey.strip().isdigit(): 
                        ekey = f"/library/metadata/{ekey.strip()}"
                    elif isinstance(ekey, int): 
                        ekey = f"/library/metadata/{ekey}"
                    return orig_fetchItem(ekey, *args, **kwargs)
                plex.fetchItem = safe_fetchItem
                return plex

            core_api = {
                "query": db_api["query"],
                "execute": db_api["execute"],
                "get_plex": get_plex_instance,
                "task": task_mgr,
                "config": merged_config,
                "cache": data_mgr,
                "options": current_opts,
                "notify": create_discord_notifier(base_dir, tool_id, server_id, global_config),
                "sort": core_natural_sort
            }

            if action == 'ui' and method == 'GET':
                if hasattr(module, 'get_ui'): 
                    sig = inspect.signature(module.get_ui)
                    ui_data = module.get_ui(core_api) if len(sig.parameters) > 0 else module.get_ui()
                    ui_data['saved_options'] = options_mgr.load()

                    saved_task = task_mgr.load(include_target_items=False)
                    if saved_task:
                        ui_data['active_task'] = {
                            "task_id": tool_id,
                            "state": saved_task.get('state', 'unknown'),
                            "progress": saved_task.get('progress', 0),
                            "total": saved_task.get('total', 0)
                        }
                    return ui_data, 200
                return {"error": "해당 툴은 UI를 제공하지 않습니다."}, 404
                
            elif action == 'run' and method == 'POST':
                if not hasattr(module, 'run'): return {"error": "해당 툴에 실행(run) 함수가 없습니다."}, 500
                action_type = data.get('action_type', 'preview')

                if action_type == 'reset':
                    print(f"[PMH Core] 툴 '{tool_id}' 캐시 및 설정 완전 초기화")
                    task_mgr.reset()
                    data_mgr.reset_db()
                    options_mgr.reset()
                    return {"status": "success", "message": "초기화 완료"}, 200

                elif action_type == 'clear_data':
                    print(f"[PMH Core] 툴 '{tool_id}' 조회 데이터 초기화")
                    data_mgr.reset_db()
                    return {"status": "success", "message": "조회 목록이 초기화되었습니다."}, 200

                elif action_type == 'remove_cache_item':
                    pmh_id = data.get('pmh_id')
                    if pmh_id:
                        data_mgr.remove_item_by_pmh_id(pmh_id)
                        return {"status": "success", "message": "항목이 성공적으로 제거되었습니다."}, 200
                    return {"status": "error", "message": "항목 ID(pmh_id)가 제공되지 않았습니다."}, 400

                elif action_type == 'resume':
                    print(f"[PMH Core] 툴 '{tool_id}' 작업 재개(Resume) 지시")
                    saved_task = task_mgr.load(include_target_items=True)
                    if not saved_task or 'task_data' not in saved_task:
                        return {"error": "이어서 실행할 작업 데이터가 없습니다."}, 400
                    
                    for k, v in data.items():
                        if k not in ['action_type', '_server_id', '_plex_url', '_plex_token']:
                            saved_task['task_data'][k] = v
                    task_mgr.save(saved_task) 

                    tool_lock = get_tool_lock(tool_id, server_id)
                    if not tool_lock.acquire(blocking=False):
                        return {"status": "error", "message": "이전 작업이 아직 종료되지 않았습니다. 잠시 후 다시 시도해 주세요."}, 200

                    try:
                        task_mgr.update_state('running')
                        task_mgr.log("최신 설정값을 적용하여 작업을 재개합니다...")
                        
                        target_thread_name = f"Worker_{tool_id}_{server_id}"
                        t = threading.Thread(target=_core_worker_runner, 
                                             args=(module, saved_task['task_data'], core_api, saved_task.get('progress', 0), tool_id, server_id),
                                             name=target_thread_name)
                        t.daemon = True
                        t.start()
                    except Exception as e:
                        tool_lock.release()
                        raise e
                        
                    return {"status": "success", "type": "async_task", "task_id": tool_id}, 200

                elif action_type == 'page':
                    sort_key = data.get('sort_key', '')
                    sort_dir = data.get('sort_dir', 'asc')
                    page = int(data.get('page', 1))
                    limit = int(data.get('limit', 10))

                    cached = data_mgr.load_page(page, limit, sort_key, sort_dir)
                    if not cached:
                        cached = data_mgr.load_dashboard()
                        if not cached: return {"error": "캐시된 데이터가 없습니다."}, 404
                    
                    if cached.get('type') == 'dashboard':
                        return cached, 200

                    machine_id = cached.get('machine_id', "")
                    if not machine_id:
                        machine_id = data.get('_machine_id', server_id)
                    cached['machine_id'] = machine_id

                    t_data = task_mgr.load(include_target_items=False)
                    if t_data and 'logs' in t_data: cached['logs'] = t_data['logs']

                    return cached, 200

                elif action_type == 'save_options':
                    current_opts = options_mgr.load()
                    for k, v in data.items():
                        if k not in ['action_type', '_server_id', '_plex_url', '_plex_token']:
                            current_opts[k] = v
                            
                    db_save_opts = {k: v for k, v in current_opts.items() if not str(k).startswith('tmp_')}
                    options_mgr.save(db_save_opts)

                    c_enable = current_opts.get('cron_enable')
                    c_expr = current_opts.get('cron_expr', '')
                    if c_enable and str(c_expr).strip():
                        print(f"[PMH Core] ⏰ '{tool_id}' 툴 스케줄 등록 완료: {c_expr}")
                    else:
                        print(f"[PMH Core] ⚙️ '{tool_id}' 툴 설정 저장 완료 (스케줄 비활성)")
                    return {"status": "success"}, 200

                else:
                    current_opts = options_mgr.load()
                    for k, v in data.items():
                        if k not in ['action_type', '_server_id', '_plex_url', '_plex_token']:
                            current_opts[k] = v
                            
                    db_save_opts = {k: v for k, v in current_opts.items() if not str(k).startswith('tmp_')}
                    options_mgr.save(db_save_opts)

                    if action_type in ['preview', 'execute']:
                        print(f"[PMH Core] 툴 '{tool_id}' 메인 워커 작업 라우팅 (Action: {action_type.upper()})")

                    res, code = module.run(data, core_api)

                    if code == 200 and isinstance(res, dict) and res.get('type') == 'async_task':
                        task_data = res.get('task_data', {})
                        if 'action_type' not in task_data:
                            task_data['action_type'] = action_type
                            
                        tool_lock = get_tool_lock(tool_id, server_id)
                        if not tool_lock.acquire(blocking=False):
                            return {"status": "error", "message": "이전 작업이 아직 종료되지 않았습니다. 잠시 후 다시 시도해 주세요."}, 200

                        try:
                            if not task_data.get('_is_cron'):
                                task_mgr.reset()
                            task_mgr.init_task(task_data)
                            
                            target_thread_name = f"Worker_{tool_id}_{server_id}"
                            t = threading.Thread(target=_core_worker_runner, 
                                                 args=(module, task_data, core_api, 0, tool_id, server_id),
                                                 name=target_thread_name)
                            t.daemon = True
                            t.start()
                        except Exception as e:
                            tool_lock.release()
                            raise e
                            
                        return {"status": "success", "type": "async_task", "task_id": tool_id}, 200
                        
                    return res, code

            elif action == 'status' and method == 'GET':
                status_data = task_mgr.load(include_target_items=False)
                if not status_data: return {"error": "Task not found"}, 404
                
                return status_data, 200
                
            elif action == 'cancel' and method == 'POST':
                saved_task = task_mgr.load(include_target_items=False)
                if saved_task and saved_task.get('state') == 'running':
                    task_mgr.update_state('cancelled')
                    task_mgr.log("[System] 사용자 취소 요청. 진행 중인 항목까지만 처리하고 중단합니다.")
                    return {"status": "success"}, 200
                return {"error": "실행 중이 아닙니다."}, 400

        return {"error": f"Endpoint '/api/{subpath}' not found."}, 404

    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"error": str(e)}, 500

# ==============================================================================
# [JAV 전용 품번 파싱 및 정규화 엔진]
# ==============================================================================
DEFAULT_UNCENSORED_LABELS = ["1pon", "10mu", "carib", "fc2", "heyzo", "paco"]
DEFAULT_JAV_RULES = {
    'generic_rules': [
        r'.*?[0-9]*([a-z]+)-([0-9]{2,})(?=[^\d]|\b) => {0}|{1}',
        r'.*?[0-9]*([a-z]+)-?([0-9]{2,})(?=[^\d]|\b) => {0}|{1}',
        r'.*?\b([0-9a-z]*[a-z]+)-([0-9]{2,})(?=[^\d]|\b) => {0}|{1}',
        r'.*?\b([0-9a-z]*[a-z]+)-?([0-9]{2,})(?=[^\d]|\b) => {0}|{1}',
    ],
    'censored_special_rules': [
        r'.*?(3dsvr)[-_]?([0-9]+)(?=[^\d]|\b) => {0}|{1}',
        r'.*?(?<![0-9])(741[a-z][0-9]{3})[-_]?(g[0-9]{2,})(?=[^\d]|\b) => {0}|{1}',
        r'.*?(?<![a-z])(t)[-_]?(28|38)[-_]?([0-9]+)(?=[^\d]|\b) => {0}{1}|{2}',
        r'.*?55(id)[-_]?([0-9]{2})([0-9]{3})(?=[^\d]|\b) => {1}{0}|{2}',
        r'.*?(?<![a-z])(id)[-_]?00([0-9]{3})(?=[^\d]|\b) => {0}|{1}',
        r'.*?(?<![a-z])(id)[-_]?([0-9]{2})([0-9]{3})(?=[^\d]|\b) => {1}{0}|{2}',
        r'.*?([0-9]{2})(id)[-_]?([0-9]{3})(?=[^\d]|\b) => {0}{1}|{2}',
        r'.*?(?<![a-z])(cpz)[-_]?([0-9]{2})[-_]?([a-z]?[0-9]{3,})(?=[^\d]|\b) => {0}{1}|{2}',
        r'.*?(?<![a-z])(g)[-_](area)[-_]?([0-9]+)(?=[^\d]|\b) => {0}{1}|{2}',
        r'.*?(?<![a-z])(mar|mbr|mmr)[-_]([a-z]{2})[-_]?([0-9]+)(?=[^\d]|\b) => {0}{1}|{2}',
        r'.*?(?<![0-9])([0-9]{3})(mmc)[-_]?([0-9]+)(?=[^\d]|\b) => {0}{1}|{2}',
        r'.*?(?<![a-z])(s)[-_](cute)[-_]?([0-9]+)(?=[^\d]|\b) => {0}{1}|{2}',
        r'.*?(?<![a-z])(tokyo)247[-_]?([0-9]+)(?=[^\d]|\b) => {0}|{1}',
        r'.*?(?<![a-z])(wvr9c)[-_]?([0-9]{3,})\b => {0}|{1}',
        r'.*?(?<![a-z])(wvr)0([1-9])[-_]?([a-z]?[0-9]+)\b => {0}{1}|{2}',
        r'.*?(?<![a-z])(wvr)0*([1-9])[-_]?([a-z]?[0-9]+)\b => {0}{1}|{2}',
        r'.*?(?<![a-z])(wvr)[-_]?([1-9])([0-9]{3,})\b => {0}{1}|{2}',
        r'.*?(?<![0-9])([0-9]{3})(ypp)[-_]?([0-9]+)(?=[^\d]|\b) => {0}{1}|{2}',
        r'.*?(?<![a-z])(cd2[0-9])[-_]?([0-9]+)(?=[^\d]|\b) => {0}|{1}',
        r'.*?(?<![a-z])(ak)[-_](bs)[-_]?([0-9]+)(?=[^\d]|\b) => {0}{1}|{2}',
        r'.*?(?<![0-9])([0-9]{3})(ap|d|g|good|h|san|ten|y)[-_]?([0-9]+)(?=[^\d]|\b) => {0}{1}|{2}',
        r'.*?(?<![0-9])([0-9]{2})(ap|id|ntrd|sora|sps[a-z]|sw|ten)[-_]?([0-9]+)(?=[^\d]|\b) => {0}{1}|{2}',
    ],
    'uncensored_special_rules': [
        r'.*?(?<![0-9])(1pon|1pondo)[-_\s]?([0-9]{6})[-_]([0-9]{2,3})(?=[^\d]|\b).*? => 1pon|{1}_{2}',
        r'.*?(?<![0-9])([0-9]{6})[-_]([0-9]{2,3})[-_\s]?(1pon|1pondo)\b.*? => 1pon|{0}_{1}',
        r'.*?(?<![0-9])(10mu|10musume)[-_\s]?([0-9]{6})[-_]([0-9]{2,3})(?=[^\d]|\b).*? => 10mu|{1}_{2}',
        r'.*?(?<![0-9])([0-9]{6})[-_]([0-9]{2,3})[-_\s]?(10mu|10musume)\b.*? => 10mu|{0}_{1}',
        r'.*?(?<![a-z])(paco|pacopacom|pacopacomama)[-_\s]?([0-9]{6})[-_]([0-9]{2,3})(?=[^\d]|\b).*? => paco|{1}_{2}',
        r'.*?(?<![0-9])([0-9]{6})[-_]([0-9]{2,3})[-_\s]?(paco|pacopacom|pacopacomama)\b.*? => paco|{0}_{1}',
        r'.*?(?<![a-z])carib(bean)?(com)?[-_\s]?([0-9]{6})[-_]?([0-9]{2,3})(?=[^\d]|\b).*? => carib|{2}-{3}',
        r'.*?(?<![0-9])([0-9]{6})[-_]([0-9]{2,3})[-_\s]?carib(bean)?(com)?\b.*? => carib|{0}-{1}',
        r'.*?(?<![a-z])(fc2)[-_\s]?(ppv)?[-_\s]?([0-9]{5,7})(?=[^\d]|\b).*? => {0}|{2}',
        r'.*?(?<![a-z])(heyzo)[-_\s]?([0-9]{4})(?=[^\d]|\b).*? => {0}|{1}',
        r'.*?(?<![a-z])(heyzo)[-_\s](?:f?hd)[-_\s]?([0-9]{4})(?=[^\d]|\b).*? => {0}|{1}',
        r'.*?(?<![0-9])([0-9]{4})[-_\s]?(heyzo)(?=[^\d]|\b).*? => {1}|{0}',
        r'.*?(?<![a-z])(c0930)[-_]([a-z]+[0-9]+)(?=[^\d]|\b).*? => {0}|{1}'
    ]
}

def compile_jav_rules(global_config):
    raw_rules = global_config.get("JAV_PARSING_RULES", DEFAULT_JAV_RULES)
    compiled = {'special': [], 'uncensored_special': [], 'generic': []}
    rule_parser = re.compile(r'(.*?)\s*=>\s*(.*)')

    for key, rule_list in [('special', 'censored_special_rules'), ('uncensored_special', 'uncensored_special_rules')]:
        for rule_str in raw_rules.get(rule_list, []):
            match = rule_parser.match(rule_str)
            if match and '|' in match.group(2):
                l_fmt, n_fmt = match.group(2).split('|', 1)[:2]
                compiled[key].append({'pattern': match.group(1), 'label_format': l_fmt.strip(), 'num_format': n_fmt.strip()})

    for rule_str in raw_rules.get('generic_rules', []):
        match = rule_parser.match(rule_str)
        if match and '|' in match.group(2):
            l_fmt, n_fmt = match.group(2).split('|', 1)[:2]
            compiled['generic'].append({'pattern': match.group(1), 'label_format': l_fmt.strip(), 'num_format': n_fmt.strip()})
    return compiled

def pad_numeric_part(num_str, target_length):
    if not num_str: return ""
    match = re.match(r"(\d+)([A-Za-z]*)$", num_str)
    if match: return match.group(1).zfill(target_length) + match.group(2)
    if num_str.isdigit(): return num_str.zfill(target_length)
    return num_str

def preprocess_jav_filename(base):
    if not base: return ""
    base = unicodedata.normalize('NFKC', str(base)).lower()
    base = re.sub(r'\(\d{6,}\)', ' ', base)
    base = re.sub(r'[\[\]\(\)\{\}]+', ' ', base)
    base = re.sub(r'\b[hn]_\d', '', base)
    
    tlds = 'cc|cn|com|net|me|org|xyz|vip|tv|la|info|link|online|site|top|io|gg'
    base = re.sub(r'[\w.-]+\.(%s)([-@_ ]|\b)' % tlds, ' ', base).strip()
    
    misc_pattern = r'(?:hd)?720p|(?:fhd)?1080p|2160p|2k|4k|6k|8k|fhd|uhd|'
    misc_pattern += r'h264|h265|hevc|x265|mpeg|wmv[0-9]?|rv(?:[0-9]{,2})?|'
    misc_pattern += r'aac|dts|mp3|ogg|flac|wav|wma(?:pro|v\d)?|pcm(?:_[0-9a-z]+)?|ac3|eac3|vorbis|opus|'
    misc_pattern += r'\d+[.0-9]*fps|\d+kbps|'
    misc_pattern += r'\d{3,}x\d{3,}|\dk[0-9.]+fps'
    base = re.sub(r'\b[-_. ]?(%s)[-_. ]?\b' % misc_pattern, ' ', base).strip()

    base = re.sub(r'\b[-_. ]?(part|pt|cd)[-_. ]?\d{,2}$', '', base)
    base = re.sub(r'[rsz]$', '', base)
    
    base = re.sub(r'\s+', ' ', base).strip(' ._-')

    return base

def extract_jav_pid(text, config, compiled_rules):
    if not text: return []
    normalized_text = preprocess_jav_filename(text)
    
    uncensored_matchable_labels = config.get("UNCENSORED_MATCHABLE_LABELS", DEFAULT_UNCENSORED_LABELS)
    is_uncensored = False
    if uncensored_matchable_labels:
        pattern_str = '|'.join(re.escape(label) for label in uncensored_matchable_labels)
        if re.search(f'\\b({pattern_str})-', normalized_text): 
            is_uncensored = True

    rule_order = ['uncensored_special', 'generic'] if is_uncensored else ['special', 'generic']
    
    found_pids = []
    seen_labels = set()

    for r_type in rule_order:
        matched_in_this_type = False
        for rule in compiled_rules.get(r_type, []):
            try:
                match = re.search(rule['pattern'], normalized_text)
                if match:
                    groups = match.groups('')
                    label = rule['label_format'].format(*groups)
                    num = rule['num_format'].format(*groups)
                    
                    if label and num:
                        l_lower = label.lower()
                        l_lower = re.sub(r'^0+', '', l_lower)

                        if l_lower not in seen_labels:
                            found_pids.append((l_lower, num.lower()))
                            seen_labels.add(l_lower)
                            matched_in_this_type = True
            except Exception as e:
                print(f"[PMH Parse Error] Rule: {rule['pattern']} -> {e}")
            
            if matched_in_this_type:
                break
        
        if found_pids:
            break
            
    return found_pids

def normalize_pid_for_comparison(pid_str):
    if not pid_str or '-' not in pid_str: return None
    try:
        label_part, num_part = pid_str.split('-', 1)
        norm_label = label_part.lower()
        if not norm_label.startswith("741"):
            stripped = norm_label.lstrip('0123456789')
            if stripped and not norm_label.isdigit(): norm_label = stripped
            
        num_match = re.match(r"([\d_-]+)([a-z]*)?$", num_part.lower())
        if not num_match: return norm_label + num_part.lower()
        
        num_core, trailing_alpha = num_match.group(1), num_match.group(2) or ""
        num_parts = re.split(r'[-_]', num_core)
        
        std_num = num_core
        if len(num_parts) == 2: std_num = f"{str(int(num_parts[0])).zfill(6)}_{str(int(num_parts[1])).zfill(3)}"
        elif len(num_parts) == 1 and num_parts[0].isdigit(): std_num = str(int(num_parts[0])).zfill(5)
        
        return norm_label + std_num + trailing_alpha
    except Exception: return None

# ==============================================================================
# [통합형 Plex Mate 연동 게이트웨이]
# ==============================================================================
def execute_plexmate_action(action_type, target, global_config, **kwargs):
    mate_url = global_config.get('mate_url', '')
    mate_apikey = global_config.get('mate_apikey', '')
    if not mate_url or not mate_apikey:
        raise ValueError("Plex Mate 설정(BASE.FF_URL / BASE.FF_APIKEY)이 누락되었습니다.")
        
    payload = {'apikey': mate_apikey}
    
    def _to_pm_bool(val, default_str):
        if val is None: return default_str
        if isinstance(val, bool): return 'true' if val else 'false'
        return str(val).lower()

    if action_type == 'vfs_refresh':
        url = f"{mate_url.rstrip('/')}/plex_mate/api/scan/vfs_refresh"
        
        recursive_opt = _to_pm_bool(kwargs.get('recursive'), 'true')
        async_opt = _to_pm_bool(kwargs.get('async_mode'), 'false')
        
        payload.update({
            'target': target,
            'recursive': recursive_opt,
            'async': async_opt
        })
        timeout = 3600
        
    elif action_type == 'scan':
        url = f"{mate_url.rstrip('/')}/plex_mate/api/scan/do_scan"
        payload.update({
            'target': target,
            'target_section_id': kwargs.get('section_id')
        })
        if kwargs.get('scanner'):
            payload['scanner'] = kwargs.get('scanner')
        timeout = 120
        
    elif action_type == 'manual_refresh':
        url = f"{mate_url.rstrip('/')}/plex_mate/api/scan/manual_refresh"
        payload.update({
            'metadata_item_id': target
        })
        timeout = 120
        
    else:
        raise ValueError(f"지원하지 않는 Plex Mate 액션입니다: {action_type}")
        
    data = urlencode(payload).encode('utf-8')
    req = Request(url, data=data, method="POST")
    req.add_header('Content-Type', 'application/x-www-form-urlencoded')
    
    with urlopen(req, timeout=timeout) as response:
        res = json.loads(response.read().decode('utf-8'))
        return res.get('ret') == 'success'

# ==============================================================================
# [공용 미디어 관리 엔진] - 스마트 매칭 / 리프레시 / 분석 통합
# ==============================================================================
def media_action_worker_loop(global_config):
    print("[PMH Daemon] Media Action Queue Worker 시작됨.")
    while _SCHEDULER_STATES.get("PMH_Media_Worker", False):
        try:
            task = MEDIA_ACTION_QUEUE.get(timeout=1.0)
            task_id = task['task_id']

            if task_id == 'KILL':
                MEDIA_ACTION_QUEUE.task_done()
                continue

            if MEDIA_ACTION_STATUS.get(task_id, {}).get('state') == 'cancelled':
                print(f"[PMH Queue] 🚫 취소된 큐 작업 스킵됨 (Item: {task['item_id']})")
                MEDIA_ACTION_QUEUE.task_done()
                continue

            item_id = task['item_id']
            action = task['action']
            plex_url = task['plex_url']
            plex_token = task['plex_token']
            data = task['data']
            
            MEDIA_ACTION_STATUS[task_id]['state'] = 'processing'
            
            try:
                from plexapi.server import PlexServer
                plex = PlexServer(plex_url, plex_token, timeout=120)
                ekey = int(item_id) if str(item_id).isdigit() else f"/library/metadata/{item_id}"
                item = execute_plex_action_safe(lambda: plex.fetchItem(ekey))
                
                is_3digit_season = False
                try:
                    if item.type == 'season':
                        idx = int(getattr(item, 'index', 0) or 0)
                        if 100 <= idx <= 999: is_3digit_season = True
                    elif item.type == 'episode':
                        idx = int(getattr(item, 'parentIndex', 0) or 0)
                        if 100 <= idx <= 999: is_3digit_season = True
                except: pass

                target_item = item
                if item.type in ['episode', 'season']:
                    try:
                        target_item = execute_plex_action_safe(lambda: plex.fetchItem(item.grandparentRatingKey if item.type == 'episode' else item.parentRatingKey))
                    except Exception: pass
                        
                target_id = target_item.ratingKey

                if action == 'unmatch':
                    execute_plex_action_safe(lambda: target_item.unmatch())
                    MEDIA_ACTION_STATUS[task_id] = {'state': 'completed', 'msg': 'Unmatch 완료'}
            
                elif action in ['match', 'refresh', 'analyze', 'yaml_refresh']:
                    try_ref = data.get('_try_refresh_first', False) if data else False
                    do_unm = data.get('_do_unmatch_first', False) if data else False
                    skip_sim = data.get('_skip_sim_check', False) if data else False
                    use_custom = data.get('_use_custom_score', False) if data else False
                    custom_score = data.get('_custom_agent_score', 80) if data else 80
                    manual_m = data.get('_manual_match', False) if data else False
                    
                    success, msg, score = perform_smart_media_action(
                        plex_url=plex_url, plex_token=plex_token, rating_key=target_id,
                        action_type=action, item_title=item.title, item_year=item.year,
                        target_agent=item.section().agent if hasattr(item, 'section') else None,
                        plex_inst=plex, try_refresh_first=try_ref, do_unmatch_first=do_unm,
                        skip_sim_check=skip_sim,
                        use_custom_score=use_custom, custom_agent_score=custom_score,
                        manual_match=manual_m,
                        global_config=global_config, 
                        task_logger=lambda x: print(f"[PMH Queue] {x}", flush=True),
                        cancel_checker=lambda: False
                    )
                    
                    if success:
                        if item.type in ['season', 'episode'] and action in ['match', 'refresh']:
                            print(f"[PMH Queue] ⏳ 하위 항목({item.type})으로 메타데이터가 전파될 때까지 대기합니다...", flush=True)
                            for _ in range(8):
                                time.sleep(2.0)
                                try:
                                    execute_plex_action_safe(lambda: item.reload())
                                    ig = (item.guid or '').lower()
                                    if ig and 'local://' not in ig and 'none://' not in ig and ig != '-':
                                        break
                                except Exception: 
                                    break

                        if is_3digit_season and action in ['match', 'refresh']:
                            print(f"[PMH Queue] 💡 내부 데이터에서 3자리 특수 시즌이 감지되었습니다. '{action}' 완료 후 YAML 적용을 연계합니다.", flush=True)
                            
                            perform_smart_media_action(
                                plex_url=plex_url, plex_token=plex_token, rating_key=target_id,
                                action_type='yaml_refresh', plex_inst=plex, manual_match=manual_m, global_config=global_config,
                                task_logger=lambda x: print(f"[PMH Queue] {x}", flush=True), cancel_checker=lambda: False
                            )
                            msg += " (YAML 자동 연계됨)"

                        MEDIA_ACTION_STATUS[task_id].update({'state': 'completed', 'msg': msg})
                    else:
                        MEDIA_ACTION_STATUS[task_id].update({'state': 'error', 'msg': msg})
                        
            except Exception as e:
                MEDIA_ACTION_STATUS[task_id] = {'state': 'error', 'msg': str(e)}
            
            finally:
                MEDIA_ACTION_QUEUE.task_done()
                now = time.time()
                keys_to_del = [k for k, v in MEDIA_ACTION_STATUS.items() if now - v.get('timestamp', now) > 600 and v.get('state') in ['completed', 'error']]
                for k in keys_to_del:
                    del MEDIA_ACTION_STATUS[k]
                
                if not MEDIA_ACTION_QUEUE.empty():
                    time.sleep(3.0)

        except queue.Empty:
            continue
        except Exception as e:
            print(f"[PMH Media Worker Error] {e}")
            time.sleep(1)

def perform_smart_media_action(
    plex_url, plex_token, rating_key, action_type='match', 
    item_title=None, item_year=None, target_agent=None, plex_inst=None, 
    try_refresh_first=False, do_unmatch_first=False, skip_sim_check=False,
    use_custom_score=False, custom_agent_score=80, search_priority='auto',
    manual_match=False,
    global_config=None, task_logger=None, cancel_checker=None
):

    if global_config is None: global_config = {}
    safe_item_title = str(item_title or '')
    
    if not plex_inst:
        from plexapi.server import PlexServer
        plex_inst = PlexServer(plex_url, plex_token, timeout=120)
        
    ekey = int(rating_key) if str(rating_key).isdigit() else f"/library/metadata/{rating_key}"
    try:
        item = execute_plex_action_safe(lambda: plex_inst.fetchItem(ekey))
    except Exception as e:
        if task_logger: task_logger(f"❌ Plex 항목 조회 실패: {e}")
        return False, "Plex 항목을 조회할 수 없습니다.", 0
    
    target_item = item
    if action_type in ['match', 'refresh', 'yaml_refresh'] and item.type in ['episode', 'season', 'track', 'album']:
        try:
            if item.type in ['episode', 'track']: target_item = execute_plex_action_safe(lambda: plex_inst.fetchItem(item.grandparentRatingKey))
            else: target_item = execute_plex_action_safe(lambda: plex_inst.fetchItem(item.parentRatingKey))
            if task_logger: task_logger(f"💡 하위 항목 감지됨. 최상위 쇼({target_item.title}) 기준으로 '{action_type}' 수행.")
        except Exception as e:
            if task_logger: task_logger(f"⚠️ 최상위 객체를 찾지 못했습니다. 기존 객체로 진행합니다: {e}")

    # ==========================================================================
    # [모드 0] YAML/TMDB 반영 (Plex Mate 연동: VFS 갱신 -> Manual Refresh)
    # ==========================================================================
    if action_type == 'yaml_refresh':
        raw_file_path = None
        if hasattr(target_item, 'media') and target_item.media and target_item.media[0].parts:
            raw_file_path = target_item.media[0].parts[0].file
        elif hasattr(target_item, 'locations') and target_item.locations:
            raw_file_path = target_item.locations[0]

        if raw_file_path:
            target_dir = os.path.dirname(raw_file_path) if target_item.type != 'show' else raw_file_path
            
            if item.type in ['episode', 'season']:
                while True:
                    base_name = os.path.basename(target_dir)
                    if not base_name: break
                    n_lower = unicodedata.normalize('NFC', base_name).lower().strip()
                    is_season = bool(re.match(r'^(season|시즌|series|s)\s*\d+\b', n_lower)) or bool(re.match(r'^(specials?|스페셜|extras?|특집|ova|ost)(\s*\d+)?$', n_lower)) or n_lower.isdigit()
                    if is_season:
                        parent_path = os.path.dirname(target_dir)
                        if parent_path == target_dir: break
                        target_dir = parent_path
                    else:
                        break
                        
            if task_logger: task_logger(f"📂 VFS 캐시 갱신 요청 중... ({target_dir})")
            try:
                if execute_plexmate_action('vfs_refresh', target_dir, global_config):
                    if task_logger: task_logger("      ✅ VFS 갱신 성공")
                else: raise ValueError("VFS 갱신 응답 실패")
            except Exception as e:
                if task_logger: task_logger(f"      ⚠️ VFS 갱신 실패 (무시하고 속행): {e}")

        if task_logger: task_logger(f"⚡ Plex Mate YAML/TMDB 반영 요청 중...")
        try:
            success = execute_plexmate_action('manual_refresh', target_item.ratingKey, global_config)
            if success:
                if task_logger: task_logger(f"⏳ YAML 반영 요청 성공. 시스템 안정화를 위해 잠시 대기합니다...")
                time.sleep(4.0)
                return True, "YAML/TMDB 반영 완료", 100
            else:
                return False, "Plex Mate 반영 오류", 0
        except Exception as e:
            return False, f"Plex Mate 서버 통신 실패: {e}", 0

    # ==========================================================================
    # [모드 1 & 2] 단순 Refresh / Analyze 모드 (대기 로직 포함)
    # ==========================================================================
    if action_type in ['refresh', 'analyze']:
        try:
            if action_type == 'refresh':
                execute_plex_action_safe(lambda: target_item.refresh())
                if str(target_item.ratingKey) != str(item.ratingKey): execute_plex_action_safe(lambda: item.refresh())
            else:
                execute_plex_action_safe(lambda: target_item.analyze())
                if str(target_item.ratingKey) != str(item.ratingKey): execute_plex_action_safe(lambda: item.analyze())

            time.sleep(1.0)
            
            max_wait_seconds = 30
            waited_time = 0
            is_activity_found = False
            
            while waited_time < max_wait_seconds:
                if cancel_checker and cancel_checker(): 
                    return False, "작업이 사용자에 의해 취소되었습니다.", 0
                    
                try:
                    execute_plex_action_safe(lambda: target_item.reload())
                    activities = plex_inst.query('/activities').findall('Activity')
                    current_item_active = any(target_item.title in act.get('title', '') or target_item.title in act.get('subtitle', '') for act in activities)
                    
                    if current_item_active:
                        is_activity_found = True
                        time.sleep(1.0); waited_time += 1
                    else:
                        if is_activity_found or waited_time >= 3: break
                        time.sleep(1.0); waited_time += 1

                except Exception as reload_err:
                    if "404" in str(reload_err) or "not_found" in str(reload_err).lower():
                        action_name = "새로고침(Refresh)" if action_type == 'refresh' else "분석(Analyze)"
                        if task_logger: task_logger(f"✅ {action_name} 중 ID 변경/병합 감지 (정상 처리됨)")
                        return True, f"{action_name} 완료 (ID 병합/재생성됨)", 100
                    else:
                        break
                    
            time.sleep(1.5)
            action_name = "새로고침(Refresh)" if action_type == 'refresh' else "분석(Analyze)"
            msg = f"{action_name} 완료 (서버 대기: {waited_time}초)" if is_activity_found else f"{action_name} 완료"
            return True, msg, 100
            
        except Exception as e:
            if "404" in str(e) or "not_found" in str(e).lower():
                action_name = "새로고침(Refresh)" if action_type == 'refresh' else "분석(Analyze)"
                if task_logger: task_logger(f"✅ {action_name} 중 ID 변경/병합 감지 (정상 처리됨)")
                return True, f"{action_name} 완료 (ID 병합/재생성됨)", 100
                
            return False, f"{action_type} 처리 중 오류: {e}", 0

    # ==========================================================================
    # [모드 3] Match 모드
    # ==========================================================================
    if action_type == 'match':
        # --- 1. 기초 변수 안전하게 초기화 ---
        raw_file_path = None
        raw_file_name = ""
        raw_folder_name = ""
        folder_query = ""
        file_query = ""
        extracted_label = None
        extracted_num = None
        compiled_rules = None
        is_jav = False
        is_jav_allowed = False
        search_pid = ""
        matches = []
        best_match = None
        best_score = 0
        highest_sim_found = 0.0
        matched_by = ""

        def _get_val(obj, key, default=""):
            if isinstance(obj, dict): 
                val = obj.get(key)
            else: 
                val = getattr(obj, key, None)
            return val if val is not None else default

        # 공통 HTTP 헤더
        api_headers = {
            'Accept': 'application/json',
            'X-Plex-Token': plex_token,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 PlexMetaHelper/1.0'
        }
        manual_val = 1 if manual_match else 0

        # --- 2. 경로 및 파일명 추출 ---
        if hasattr(target_item, 'media') and target_item.media and target_item.media[0].parts:
            raw_file_path = target_item.media[0].parts[0].file
        elif hasattr(target_item, 'locations') and target_item.locations:
            raw_file_path = target_item.locations[0]

        if raw_file_path:
            raw_file_name = os.path.basename(raw_file_path)
            parent_dir = os.path.dirname(raw_file_path)
            parent_dir_name = os.path.basename(parent_dir)

            is_root_dir = False
            try:
                for loc in target_item.section().locations:
                    if os.path.normpath(parent_dir) == os.path.normpath(loc): is_root_dir = True; break
            except Exception: pass

            if is_root_dir: 
                raw_folder_name = os.path.splitext(raw_file_name)[0]
            else:
                if target_item.type in ['show', 'season', 'episode']:
                    if re.match(r'^(season|시즌|series|s)\s*\d+\b', parent_dir_name, re.IGNORECASE) or parent_dir_name.isdigit():
                        raw_folder_name = os.path.basename(os.path.dirname(parent_dir))
                    else: raw_folder_name = parent_dir_name
                else: raw_folder_name = parent_dir_name

        if not raw_file_path:
            return False, "물리적 경로를 확인할 수 없습니다.", 0

        # --- 3. 에이전트 판별 ---
        if not target_agent:
            try: target_agent = target_item.section().agent
            except Exception: target_agent = ""

        is_sjva_agent = target_agent.startswith('com.plexapp.agents.sjva') if target_agent else False
        is_plex_agent = target_agent in ['tv.plex.agents.movie', 'tv.plex.agents.series'] if target_agent else False
        is_custom_agent = not is_sjva_agent and not is_plex_agent and bool(target_agent)

        current_section_id = str(getattr(target_item, 'librarySectionID', 'Unknown'))
        western_cfg = str(global_config.get("WESTERN_AV_SECTION", "")).strip().lower()
        is_western_av = (western_cfg == 'all') or (western_cfg and current_section_id in [s.strip() for s in western_cfg.split(',')])

        # --- 4. SJVA JAV 사전 검사 ---
        if is_sjva_agent:
            jav_section_cfg = str(global_config.get("JAV_SECTION", "")).strip().lower()
            current_section_id = str(getattr(target_item, 'librarySectionID', 'Unknown'))
            is_jav_allowed = (jav_section_cfg == 'all') or (jav_section_cfg and current_section_id in [s.strip() for s in jav_section_cfg.split(',')])

            if is_jav_allowed:
                try:
                    compiled_rules = compile_jav_rules(global_config)
                    name_no_ext = os.path.splitext(raw_file_name)[0] if raw_file_name else ""
                    
                    pids = extract_jav_pid(name_no_ext, global_config, compiled_rules)
                    if not pids: pids = extract_jav_pid(raw_folder_name, global_config, compiled_rules)
                        
                    if pids:
                        is_jav = True
                        extracted_label, extracted_num = pids[0]
                        temp_db_pid_match = re.match(r'^\[([A-Za-z0-9\-_]+)\]', safe_item_title)
                        if temp_db_pid_match:
                            db_pid_norm = normalize_pid_for_comparison(temp_db_pid_match.group(1))
                            for l, n in pids:
                                cand_norm = normalize_pid_for_comparison(f"{l}-{n}")
                                if cand_norm == db_pid_norm:
                                    extracted_label, extracted_num = l, n
                                    break
                        search_pid = f"{extracted_label}-{extracted_num}"
                except Exception as e:
                    if task_logger: task_logger(f"⚠️ JAV 패턴 파싱 오류 (무시됨): {e}")

        try:
            # --- 5. 언매치(Unmatch) 진행 ---
            if do_unmatch_first:
                try:
                    delete_section_cfg = str(global_config.get("DELETE_JSON_SECTION", "")).strip().lower()
                    current_section_id = str(getattr(target_item, 'librarySectionID', 'Unknown'))
                    is_delete_allowed = (delete_section_cfg == 'all') or (delete_section_cfg and current_section_id in [s.strip() for s in delete_section_cfg.split(',')])

                    if not is_delete_allowed:
                        if task_logger: task_logger(f"💡 현재 섹션(ID: {current_section_id})은 JSON 삭제 미허용")
                    else:
                        files_to_delete = []
                        video_dir = os.path.dirname(raw_file_path)

                        if is_jav:
                            files_to_delete.append(os.path.join(video_dir, f"{extracted_label}-{extracted_num}.json"))
                            files_to_delete.append(os.path.join(video_dir, f"{extracted_label}{extracted_num}.json"))
                        elif is_western_av or is_custom_agent:
                            if raw_file_name:
                                name_no_ext = os.path.splitext(raw_file_name)[0]
                                files_to_delete.append(os.path.join(video_dir, f"{name_no_ext}.json"))
                        elif target_item.type == 'movie':
                            files_to_delete.append(os.path.join(video_dir, "info.json"))
                        elif target_item.type == 'show':
                            show_dir = target_item.locations[0] if hasattr(target_item, 'locations') and target_item.locations else os.path.dirname(os.path.dirname(raw_file_path))
                            if show_dir: files_to_delete.append(os.path.join(show_dir, "info.json"))

                        for fpath in set(files_to_delete):
                            if os.path.exists(fpath):
                                try: os.remove(fpath)
                                except Exception: pass
                except Exception: pass

                temp_guid = (target_item.guid or '').lower()
                if not temp_guid or 'local://' in temp_guid or 'none://' in temp_guid or temp_guid == '-':
                    pass
                else:
                    if task_logger: task_logger(f"🗑️ 매칭 전 기존 메타데이터 Unmatch 진행 중...")
                    try:
                        execute_plex_action_safe(lambda: target_item.unmatch())
                        unmatch_verified = False
                        for _ in range(15):
                            if cancel_checker and cancel_checker(): return False, "작업 취소됨", 0
                            time.sleep(3.0)
                            execute_plex_action_safe(lambda: target_item.reload())
                            check_guid = (target_item.guid or '').lower()
                            if not check_guid or 'local://' in check_guid or 'none://' in check_guid or check_guid == '-':
                                unmatch_verified = True; break
                                
                        if unmatch_verified:
                            if task_logger: task_logger(f"✅ Unmatch 확인 완료! 서버 안정화를 위해 5초간 대기합니다...")
                            time.sleep(5.0)
                            target_item = execute_plex_action_safe(lambda: plex_inst.fetchItem(target_item.ratingKey))
                        else:
                            if task_logger: task_logger(f"⚠️ Unmatch 상태 확인 지연 (Plex 서버 부하 의심)")
                    except Exception as e: 
                        if task_logger: task_logger(f"⚠️ Unmatch 실패 (무시): {e}")

            # --- 6. 우선 리프레시(Refresh) 시도 ---
            if try_refresh_first and is_plex_agent:
                if task_logger: task_logger(f"🔄 매칭 전 리프레시 우선 시도 (Agent: {target_agent})")
                initial_guid = (target_item.guid or '').lower()
                try:
                    execute_plex_action_safe(lambda: target_item.refresh())
                    match_success = False
                    for _ in range(15):
                        if cancel_checker and cancel_checker(): return False, "작업 취소됨", 0
                        time.sleep(3.0)
                        execute_plex_action_safe(lambda: target_item.reload())
                        temp_guid = (target_item.guid or '').lower()
                        if temp_guid and temp_guid != initial_guid and 'local://' not in temp_guid and 'none://' not in temp_guid and temp_guid != '-':
                            match_success = True
                            if task_logger: task_logger(f"✅ Refresh를 통한 자동 매칭 완료! (새 GUID: {target_item.guid})")
                            return True, f"Refresh를 통한 자동 매칭 완료!", 100
                            
                    if not match_success:
                        if task_logger: task_logger(f"⚠️ Refresh 자동 매칭 실패. 수동 검색 매칭 단계로 넘어갑니다...")
                except Exception as e: 
                    if task_logger: task_logger(f"⚠️ Refresh 시도 중 오류 발생 (무시하고 검색 진행): {e}")

            # --- 7. 매칭 검색 (Search) ---
            def _fetch_plex_api(req_url):
                with urlopen(Request(req_url, headers=api_headers), timeout=45) as response:
                    return json.loads(response.read().decode('utf-8')).get('MediaContainer', {}).get('SearchResult', [])

            # 언어(language) 결정 및 동적 라이브러리 설정 오버라이드
            lang_code = 'ko' if (is_sjva_agent or is_plex_agent) else 'en'

            if is_plex_agent:
                try:
                    sect_lang = target_item.section().language
                    if sect_lang:
                        lang_code = str(sect_lang).lower()
                        if task_logger: task_logger(f"💡 [라이브러리 언어 연동] 섹션 기본 설정값인 '{lang_code}' 언어로 매칭을 시도합니다.")
                except Exception:
                    pass

            def _build_search_params(title_str, year_str=None):
                p = {'title': title_str, 'agent': target_agent, 'language': lang_code}
                if manual_match: 
                    p['manual'] = '1'
                if year_str: 
                    p['year'] = str(year_str)
                return p

            if is_jav:
                search_params = _build_search_params(search_pid, item_year)
                search_url = f"{plex_url}/library/metadata/{target_item.ratingKey}/matches?{urlencode(search_params)}"
                if task_logger: task_logger(f"📡 [SJVA] Plex 직접 API 검색 시도...")
                matches = execute_plex_action_safe(lambda: _fetch_plex_api(search_url))

            else:
                if is_western_av:
                    # 서양 AV: 정제 없이 원본 사용
                    folder_query = raw_folder_name
                    file_query = os.path.splitext(raw_file_name)[0] if raw_file_name else ""
                    item_year = None
                    if task_logger: task_logger(f"💡 [Western AV 모드] 파일명 정제 없이 에이전트에 위임합니다. (우선순위: {search_priority})")
                else:
                    # 일반 영화/쇼: 파일명 정제 및 연도 추출
                    folder_query = raw_folder_name
                    item_year = None
                    year_match = re.search(r'[\(\[\s](19[1-9]\d|20[0-2]\d)[\)\]\s]', raw_folder_name)
                    if year_match:
                        item_year = year_match.group(1)
                        folder_query = raw_folder_name[:year_match.start()].strip()
                    else:
                        bracket_match = re.search(r'[\[\{]', raw_folder_name)
                        if bracket_match:
                            folder_query = raw_folder_name[:bracket_match.start()].strip()
                            
                    folder_query = re.sub(r'[_\.-]', ' ', folder_query).strip()
                    folder_query = re.sub(r'\s+', ' ', folder_query)

                    file_query = ""
                    if raw_file_name:
                        name_no_ext = os.path.splitext(raw_file_name)[0]
                        name_no_ext = re.sub(r'^\[.*?\]', '', name_no_ext).strip()
                        cut_pattern = r'\b(19[1-9]\d|20[0-2]\d|[Ss]\d{1,3}[Ee]\d{1,3}|[Ss]\d{1,2}|[Ee][Pp]?\d{1,3}|2160p|1080p|720p|480p|4k|8k|bluray|web-?dl|web-?rip|remux|x264|x265|hevc|avc|hdr|dts|truehd|atmos|dd5\.1|aac)\b'
                        
                        for match in re.finditer(cut_pattern, name_no_ext, re.IGNORECASE):
                            matched_text = match.group(1)
                            if match.start() == 0 and re.match(r'^(19[1-9]\d|20[0-2]\d)$', matched_text):
                                continue
                            file_query = name_no_ext[:match.start()].strip()
                            break
                        else:
                            file_query = name_no_ext
                            
                        file_query = re.sub(r'[\(\[\{\)\]\}]', ' ', file_query)
                        file_query = re.sub(r'[_\.-]', ' ', file_query).strip()
                        file_query = re.sub(r'\s+', ' ', file_query)

                if not file_query and not folder_query: 
                    return False, "추출된 검색어가 유효하지 않습니다.", 0

                is_av_mode = is_western_av or is_jav_allowed or is_sjva_agent or is_custom_agent

                if search_priority == 'auto':
                    if is_av_mode:
                        search_priority = 'file'
                        if task_logger: task_logger(f"💡 [자동 판단] 성인/커스텀 라이브러리 감지: '파일명 우선' 검색 적용")
                    else:
                        search_priority = 'folder'

                # 우선순위에 따른 검색어 큐 구성 (AV 모드에서는 2차 폴백 검색 생략)
                queries_to_try = []
                if search_priority == 'file':
                    if file_query: queries_to_try.append(("파일명", file_query))
                    if not is_av_mode and folder_query and folder_query != file_query: 
                        queries_to_try.append(("폴더명", folder_query))
                else:
                    if folder_query: queries_to_try.append(("폴더명", folder_query))
                    if not is_av_mode and file_query and file_query != folder_query: 
                        queries_to_try.append(("파일명", file_query))

                matches = []

                for q_type, q_text in queries_to_try:
                    if is_western_av or is_custom_agent:
                        search_params = { 'title': q_text, 'manual': manual_val, 'agent': target_agent, 'language': lang_code }
                        search_url = f"{plex_url}/library/metadata/{target_item.ratingKey}/matches?{urlencode(search_params)}"
                        if task_logger: task_logger(f"📡 [Western/Custom] 직접 API 검색 시도... ({q_type}: '{q_text}')")
                        matches = execute_plex_action_safe(lambda: _fetch_plex_api(search_url))

                        # 1차 검색 실패 시 날짜 도려내고 2차 검색 (서양 AV 전용 폴백)
                        if not matches:
                            date_pattern = r'\b(?:20\d{2}|\d{2})\s(?:0?[1-9]|1[0-2])\s(?:0?[1-9]|[12]\d|3[01])\b'
                            fallback_query = re.sub(date_pattern, '', q_text)
                            fallback_query = re.sub(r'\s+', ' ', fallback_query).strip()
                            
                            if fallback_query and fallback_query != q_text:
                                if task_logger: task_logger(f"⚠️ 1차 검색 실패. 날짜 패턴 제거/재시도: '{fallback_query}'")
                                search_params['title'] = fallback_query
                                search_url2 = f"{plex_url}/library/metadata/{target_item.ratingKey}/matches?{urlencode(search_params)}"
                                fallback_matches = execute_plex_action_safe(lambda: _fetch_plex_api(search_url2))
                                
                                if fallback_matches:
                                    matches = fallback_matches

                    else:
                        kwargs = {'agent': target_agent, 'language': lang_code, 'title': q_text}
                        if manual_match: kwargs['manual'] = '1'
                        if item_year: kwargs['year'] = str(item_year)
                        
                        if task_logger: task_logger(f"📡 [일반 매칭] 검색 시도... ({q_type}: '{q_text}', 연도: '{item_year}')")
                        matches = execute_plex_action_safe(lambda: target_item.matches(**kwargs))

                    if matches:
                        break # 매칭 결과가 있으면 다음 순위 검색어는 스킵

            # --- 8. 검색 결과 필터링 및 Scoring ---
            if not matches: 
                if task_logger: task_logger(f"❌ 일치하는 후보가 없습니다.")
                return False, "검색 조건에 맞는 후보가 없습니다.", 0

            jav_min_score = int(global_config.get('JAV_MIN_SCORE', 95))
            western_min_score = int(global_config.get('WESTERN_MIN_SCORE', 80))

            if use_custom_score:
                threshold_score = int(custom_agent_score) if custom_agent_score else 80
                score_msg = f"사용자 커스텀({threshold_score}점)"
            else:
                if is_western_av or is_custom_agent:
                    threshold_score = western_min_score
                elif is_jav or is_sjva_agent:
                    threshold_score = jav_min_score
                else:
                    threshold_score = 0
                score_msg = f"서버 설정값({threshold_score}점)"

            if is_jav:
                if task_logger: task_logger(f"💡 [JAV 모드] 전체 검색 결과 중 최적의 후보({score_msg})를 선별합니다.")
                matches.sort(key=lambda x: int(_get_val(x, 'score', 0)), reverse=True)
                for cand in matches:
                    if 'collection://' in _get_val(cand, 'guid', ''): continue
                    c_score = int(_get_val(cand, 'score', 0))
                    if c_score >= threshold_score and c_score > best_score:
                        best_match = cand
                        best_score = c_score
                        matched_by = f"JAV 모드 점수({c_score}점)"
                        break

            elif is_sjva_agent or is_western_av or is_custom_agent:
                agent_type = "Western/Custom" if (is_western_av or is_custom_agent) else "SJVA"
                if task_logger: task_logger(f"💡 [{agent_type} 모드] 점수 기반 검증({score_msg})을 진행합니다.")
                matches.sort(key=lambda x: int(_get_val(x, 'score', 0)), reverse=True)
                
                for idx, cand in enumerate(matches):
                    cand_name = _get_val(cand, 'name', '')
                    cand_year = str(_get_val(cand, 'year', ''))
                    cand_score = int(_get_val(cand, 'score', 0))
                    
                    if item_year and cand_year and item_year != cand_year:
                        if skip_sim_check:
                            if task_logger: task_logger(f"    ⚠️ 연도 불일치 (목표: {item_year}, 후보: {cand_year}) -> [검증 스킵]으로 무시합니다.")
                        else:
                            if task_logger: task_logger(f"📋 [점수 후보 {idx+1}] '{cand_name}' (점수: {cand_score}) ❌ 연도 불일치 (목표: {item_year}, 후보: {cand_year})")
                            continue
                        
                    if cand_score >= threshold_score:
                        best_match, best_score, matched_by = cand, cand_score, f"{agent_type} 점수({cand_score}점)"
                        if task_logger: task_logger(f"📋 [점수 후보 {idx+1}] '{cand_name}' (점수: {cand_score}, 연도: {cand_year}) -> ✨ 조건 충족!")
                        break
                    else:
                        if task_logger: task_logger(f"📋 [점수 후보 {idx+1}] '{cand_name}' (점수: {cand_score}) ❌ 기준점 미달")

            else: # Plex 기본 에이전트
                top_candidates = matches[:3]
                if skip_sim_check:
                    if task_logger: task_logger(f"💡 [제목/연도 검증 스킵 모드] 에이전트가 반환한 1순위 결과를 무조건 수용합니다.")
                    cand = top_candidates[0]
                    cand_name = _get_val(cand, 'name', '')
                    cand_year = str(_get_val(cand, 'year', ''))
                    if task_logger: task_logger(f"📋 [1순위 후보 강제 수용] '{cand_name}' (연도: {cand_year})")
                    best_match, highest_sim_found, matched_by = cand, 1.0, "제목/연도 검증 스킵 (강제 수용)"
                else:
                    if task_logger: task_logger(f"💡 [텍스트 유사도 모드] 텍스트 유사도 검증(커트라인 90%)을 진행합니다.")
                    import difflib
                    norm_pattern = r'[\s~`!@#$%^&*()\-_+={[}\]|\\:;"\'<,>.?/,]'
                    norm_folder_q = re.sub(norm_pattern, '', folder_query.lower())
                    norm_file_q = re.sub(norm_pattern, '', file_query.lower())

                    for idx, cand in enumerate(top_candidates):
                        cand_name = _get_val(cand, 'name', '')
                        cand_orig = _get_val(cand, 'originalTitle', '')
                        cand_year = str(_get_val(cand, 'year', ''))
                        cand_score = int(_get_val(cand, 'score', 0))

                        if item_year and cand_year and item_year != cand_year:
                            continue

                        clean_cand_name = cand_name.split('|')[0].strip() if '|' in cand_name else cand_name
                        clean_cand_orig = cand_orig.split('|')[0].strip() if '|' in cand_orig else cand_orig

                        norm_cand_name = re.sub(norm_pattern, '', clean_cand_name.lower())
                        norm_cand_orig = re.sub(norm_pattern, '', clean_cand_orig.lower())

                        sim_folder_name = difflib.SequenceMatcher(None, norm_folder_q, norm_cand_name).ratio() if norm_folder_q and norm_cand_name else 0.0
                        sim_folder_orig = difflib.SequenceMatcher(None, norm_folder_q, norm_cand_orig).ratio() if norm_folder_q and norm_cand_orig else 0.0
                        max_folder_sim = max(sim_folder_name, sim_folder_orig)

                        sim_file_name = difflib.SequenceMatcher(None, norm_file_q, norm_cand_name).ratio() if norm_file_q and norm_cand_orig else 0.0
                        sim_file_orig = difflib.SequenceMatcher(None, norm_file_q, norm_cand_orig).ratio() if norm_file_q and norm_cand_orig else 0.0
                        max_file_sim = max(sim_file_name, sim_file_orig)

                        if max_folder_sim >= 0.90:
                            best_match, best_score, highest_sim_found, matched_by = cand, cand_score, max_folder_sim, "폴더명"
                            break
                        elif max_file_sim >= 0.90:
                            best_match, best_score, highest_sim_found, matched_by = cand, cand_score, max_file_sim, "파일명"
                            break

            # --- 9. 매칭 적용 (PUT) ---
            if not best_match:
                reject_reason = f"검색 결과 중 설정된 기준(점수/연도/유사도)을 충족하는 후보가 없습니다."
                if task_logger: task_logger(f"❌ 최종 매칭 실패: {reject_reason}")
                return False, reject_reason, 0

            candidate_name = _get_val(best_match, 'name', '')
            candidate_guid = _get_val(best_match, 'guid', '')
            b_year = _get_val(best_match, 'year', None)

            if task_logger:
                if matched_by.startswith("에이전트") or matched_by.startswith("커스텀") or matched_by.startswith("SJVA") or matched_by.startswith("JAV") or matched_by.startswith("Western"):
                    task_logger(f"💡 [{matched_by.split()[0]} 모드] {matched_by} 기준 검증 통과 -> 후보 '{candidate_name}' 선택됨.")
                else:
                    task_logger(f"💡 [Plex 기본 모드] '{matched_by}' 기반 검증 통과 (유사도: {highest_sim_found*100:.1f}%) -> 후보 '{candidate_name}' 선택됨.")
                task_logger(f"✨ 직접 HTTP API로 매칭을 강제 적용합니다.")

            initial_guid = (target_item.guid or '').lower()

            try:
                match_params = {
                    'guid': candidate_guid, 
                    'name': candidate_name,
                    'agent': target_agent,
                    'language': lang_code
                }
                
                if b_year: match_params['year'] = str(b_year)
                elif item_year and not is_custom_agent: match_params['year'] = str(item_year)
                    
                match_url = f"{plex_url}/library/metadata/{target_item.ratingKey}/match?{urlencode(match_params)}"
                req = Request(match_url, method='PUT', headers=api_headers)
                execute_plex_action_safe(lambda: urlopen(req, timeout=30))
            except Exception as put_e:
                if task_logger: task_logger(f"⚠️ HTTP PUT 매칭 전송 오류 (무시하고 결과 대기 시도): {put_e}")
            
            # --- 10. 적용 결과 확인 (Reload & Validate) ---
            match_verified = False
            if task_logger: task_logger(f"⏳ 매칭 적용 중... GUID 갱신을 확인합니다.")
            
            for _ in range(20):
                if cancel_checker and cancel_checker(): return False, "작업 취소됨", 0
                time.sleep(3.0)
                try:
                    execute_plex_action_safe(lambda: target_item.reload())
                    new_guid = (target_item.guid or '').lower()
                    if new_guid != initial_guid and 'local://' not in new_guid and 'none://' not in new_guid and new_guid != '-':
                        match_verified = True
                        if task_logger: task_logger(f"✅ 매칭 최종 승인 및 갱신 완료! (새 GUID: {target_item.guid})")
                        return True, f"매칭 성공 ({candidate_name})", best_score
                except Exception as reload_err:
                    if "404" in str(reload_err) or "not_found" in str(reload_err).lower():
                        if task_logger: task_logger(f"✅ 매칭 승인! (Plex가 기존 항목을 삭제하고 병합했습니다.)")
                        return True, f"매칭 성공 (ID 병합됨: {candidate_name})", best_score
                    else:
                        raise reload_err
                    
            if not match_verified:
                if task_logger: task_logger(f"⚠️ Plex 서버 지연: 매칭 명령이 즉시 적용되지 않았습니다.")
            return False, "Plex 서버 지연: 매칭 명령이 즉시 적용되지 않았습니다.", best_score
            
        except Exception as e:
            import traceback
            traceback.print_exc()
            if task_logger: task_logger(f"❌ 매칭 작업 중 내부 오류: {e}")
            return False, f"매칭 작업 중 내부 오류: {e}", 0

    return False, f"알 수 없는 액션입니다: {action_type}", 0
