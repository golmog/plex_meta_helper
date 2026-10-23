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
import uuid
import math
import copy
import difflib
import traceback
import logging
from datetime import datetime
from contextlib import contextmanager
from urllib.request import Request, urlopen
from urllib.parse import urlencode
from urllib.parse import urlsplit
from urllib.error import HTTPError, URLError
from flask import Response
from collections import deque
from logging.handlers import RotatingFileHandler


# ==============================================================================
# [코어 모듈 버전]
# ==============================================================================

__version__ = "0.9.133"

logger = logging.getLogger("PMH")

def get_version():
    return __version__

def apply_permissions(filepath, config):
    if not config: return
    puid = config.get('puid', -1)
    pgid = config.get('pgid', -1)
    if puid != -1 and pgid != -1 and os.path.exists(filepath):
        try:
            os.chown(filepath, puid, pgid)
        except Exception as e:
            logger.debug(f"권한 설정 실패 ({filepath}): {e}")


# ==============================================================================
# [전역 캐시 및 상태 변수]
# ==============================================================================

GLOBAL_DASHBOARD_CACHE = {
    "running": [],
    "cron": [],
    "completed_items": {},
    "last_updated": 0
}

_TOOL_SERVER_LOCKS = {}
_TOOL_SERVER_LOCKS_GUARD = threading.Lock()

# One process owns task_logs. Managers sharing a path share the same lock.
_STORAGE_LOCKS = globals().get('_STORAGE_LOCKS', {})
_STORAGE_LOCKS_GUARD = globals().get('_STORAGE_LOCKS_GUARD', threading.Lock())
_RUNTIME = globals().get('_RUNTIME', {'lock': threading.RLock(), 'requests': 0, 'maintenance': False})
_DAEMON_LOCK = globals().get('_DAEMON_LOCK', threading.RLock())

def storage_lock(path):
    with _STORAGE_LOCKS_GUARD:
        return _STORAGE_LOCKS.setdefault(os.path.realpath(path), threading.RLock())

MEDIA_ACTION_QUEUE = queue.Queue()
MEDIA_ACTION_STATUS = {}

_TOOL_NAME_CACHE = {}


def get_tool_name(base_dir, tool_id):
    """tool_id를 기반으로 info.yaml을 읽어 실제 툴 이름(name)을 반환 (메모리 캐싱)"""
    if tool_id in _TOOL_NAME_CACHE:
        return _TOOL_NAME_CACHE[tool_id]
    
    info_path = os.path.join(base_dir, 'tools', tool_id, 'info.yaml')
    try:
        if os.path.exists(info_path):
            with open(info_path, 'r', encoding='utf-8') as f:
                info_data = yaml.safe_load(f)
                name = info_data.get('name', tool_id)
                _TOOL_NAME_CACHE[tool_id] = name
                return name
    except Exception as e:
        logger.warning(f"툴 이름 조회 실패 ({tool_id}): {e}")

    _TOOL_NAME_CACHE[tool_id] = tool_id
    return tool_id


def get_tool_lock(tool_id, server_id):
    lock_key = (tool_id, server_id)
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
                logger.warning(f"[Retry] Plex 서버 부하/오류 감지: {err_str}. {wait_sec}초 후 재시도 ({i+1}/{max_retries})...")
                time.sleep(wait_sec)
            else:
                raise e
    raise last_err


# ==============================================================================
# [인메모리 툴 레지스트리 캐시 (RAM)]
# ==============================================================================

_INSTALLED_TOOLS_CACHE = None
_INSTALLED_TOOLS_LOCK = threading.Lock()

def get_installed_tools(tools_dir, force_refresh=False):
    """설치된 툴 목록을 RAM에서 0.0001초 만에 반환 (설치/삭제 시에만 디스크 스캔)"""
    global _INSTALLED_TOOLS_CACHE
    with _INSTALLED_TOOLS_LOCK:
        if _INSTALLED_TOOLS_CACHE is not None and not force_refresh:
            return _INSTALLED_TOOLS_CACHE.copy()

        if not os.path.exists(tools_dir):
            _INSTALLED_TOOLS_CACHE = []
            return []

        tools_list = []
        for item in os.listdir(tools_dir):
            tool_folder = os.path.join(tools_dir, item)
            info_path = os.path.join(tool_folder, 'info.yaml')
            if os.path.isdir(tool_folder) and os.path.exists(info_path):
                try:
                    with open(info_path, 'r', encoding='utf-8') as f:
                        tool_info = yaml.safe_load(f)
                        if isinstance(tool_info, dict):
                            tool_info['id'] = item
                            tools_list.append(tool_info)
                            _TOOL_NAME_CACHE[item] = tool_info.get('name', item)
                except Exception as e:
                    logger.error(f"info.yaml 파싱 실패 {info_path}: {e}")

        _INSTALLED_TOOLS_CACHE = tools_list
        return _INSTALLED_TOOLS_CACHE.copy()


def invalidate_tools_cache():
    """툴 설치, 삭제, 업데이트 시 RAM 캐시 무효화"""
    global _INSTALLED_TOOLS_CACHE
    with _INSTALLED_TOOLS_LOCK:
        _INSTALLED_TOOLS_CACHE = None


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


def match_section_ids(section_config_str, target_section_id):
    if not section_config_str or target_section_id is None:
        return False
    cfg_str = str(section_config_str).strip().lower()
    if not cfg_str:
        return False
    if cfg_str == 'all':
        return True

    try:
        target_id = int(target_section_id)
    except (ValueError, TypeError):
        return False

    for part in cfg_str.split(','):
        part = part.strip()
        if not part: continue
        
        if '-' in part:
            try:
                start_s, end_s = part.split('-', 1)
                start_id = int(start_s.strip())
                end_id = int(end_s.strip())
                if start_id <= target_id <= end_id:
                    return True
            except ValueError:
                continue
        else:
            try:
                if int(part) == target_id:
                    return True
            except ValueError:
                continue
    return False


# ==============================================================================
# [디스코드 통합 알림 팩토리]
# ==============================================================================

def create_discord_notifier(base_dir, tool_id, server_id, global_config):

    def send_discord_notify(title, message="", color_hex="#51a351", tool_vars=None):
        if tool_vars is None: tool_vars = {}
        
        mgr = CoreOptionsManager(base_dir, tool_id, server_id)
        current_opts = mgr.load()
        
        if not current_opts.get('discord_enable', True): return
        
        url = current_opts.get('discord_webhook', '').strip() or (global_config.get('discord_webhook', '').strip() if global_config else '')
        if not url: return
        
        tool_name = get_tool_name(base_dir, tool_id)
        logger.info(f"[{tool_name}] 알림 발송 시도 (제목: {title})")
        
        core_vars = {
            "tool_id": tool_id,
            "tool_name": tool_name,
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
            logger.info(f"[{tool_name}] 디스코드 알림 발송 성공.")
        except Exception as e:
            logger.error(f"❌ 디스코드 알림 발송 실패: {e}")
            
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
        except Exception as e:
            logger.warning(f"[Scheduler] 크론 표현식 매칭 중 오류: {e}")
        return False

    return (match_part(parts[0], dt.minute) and
            match_part(parts[1], dt.hour) and
            match_part(parts[2], dt.day) and
            match_part(parts[3], dt.month) and
            match_part(parts[4], dt.isoweekday() % 7))

_SCHEDULER_STATES = {}


def stop_scheduler_daemon(timeout=5.0):
    with _DAEMON_LOCK:
        return _stop_scheduler_daemon(timeout)


def _stop_scheduler_daemon(timeout):
    names = ('PMH_Cron_Scheduler', 'PMH_Media_Worker')
    for name in names:
        _SCHEDULER_STATES[name] = False
    deadline = time.monotonic() + timeout
    for thread in threading.enumerate():
        if thread.name in names and thread is not threading.current_thread():
            thread.join(max(0, deadline - time.monotonic()))
    return not any(t.name in names and t.is_alive() for t in threading.enumerate())


def start_scheduler_daemon(global_config):
    with _DAEMON_LOCK:
        return _start_scheduler_daemon(global_config)


def _start_scheduler_daemon(global_config):
    thread_name = "PMH_Cron_Scheduler"
    worker_name = "PMH_Media_Worker"
    
    base_dir = global_config.get("base_dir")
    def scheduler_loop():
        tz_info = time.strftime('%z (%Z)')
        logger.info(f"자동 실행 스케줄러 시작. (현재 타임존: {tz_info})")
        
        tools_dir = os.path.join(base_dir, 'tools')
        task_logs_dir = os.path.join(base_dir, 'task_logs')
        last_cache_update = 0

        while _SCHEDULER_STATES.get(thread_name, False):
            now = datetime.now()
            
            if now.second == 0:
                try:
                    _execute_scheduled_tasks(global_config, now)
                except Exception as e:
                    logger.error(f"Scheduler Error: {e}")
                time.sleep(1)
                
            current_time = time.time()
            if current_time - last_cache_update >= 5.0:
                try:
                    _update_dashboard_cache(tools_dir, task_logs_dir, base_dir)
                    last_cache_update = current_time
                except Exception as e: pass
                    
            time.sleep(0.5)

    if not any(t.name == thread_name and t.is_alive() for t in threading.enumerate()):
        _SCHEDULER_STATES[thread_name] = True
        st = threading.Thread(target=scheduler_loop, name=thread_name)
        st.daemon = True
        st.start()

    if not any(t.name == worker_name and t.is_alive() for t in threading.enumerate()):
        _SCHEDULER_STATES[worker_name] = True
        media_thread = threading.Thread(target=media_action_worker_loop, args=(global_config,), name=worker_name)
        media_thread.daemon = True
        media_thread.start()


def _update_dashboard_cache(tools_dir, task_logs_dir, base_dir):
    global GLOBAL_DASHBOARD_CACHE
    if not os.path.exists(tools_dir): return
    
    running_list = []
    cron_list = []
    
    active_worker_threads = {t.name for t in threading.enumerate() if t.is_alive()}
    
    with CoreTaskManager._TASK_STATES_LOCK:
        for task_key, t_state in CoreTaskManager._TASK_STATES.items():
            if t_state.get('state') in ('running', 'cancelling'):
                identity = (t_state.get('tool_id'), t_state.get('server_id'))
                if all(identity):
                    t_id, s_id = identity
                    expected_thread_name = f"Worker_{t_id}_{s_id}"
                    
                    if expected_thread_name in active_worker_threads:
                        running_list.append({
                            "tool_id": t_id, "server_id": s_id,
                            "progress": t_state.get('progress', 0), "total": t_state.get('total', 0)
                        })
                    else:
                        t_state['state'] = 'error'

    if os.path.exists(task_logs_dir):
        try:
            for f_name in os.listdir(task_logs_dir):
                if f_name.endswith('_options.db'):
                    parts = f_name[:-11].rsplit('_', 1)
                    if len(parts) == 2:
                        t_id, s_id = parts
                        mgr = CoreOptionsManager(base_dir, t_id, s_id)
                        opts = mgr.load() or {}
                        if opts.get('cron_enable') and opts.get('cron_expr'):
                            cron_list.append({
                                "tool_id": t_id, "server_id": s_id, "expr": opts.get('cron_expr')
                            })
        except Exception as cache_err:
            logger.debug(f"[Dashboard] 크론 옵션 갱신 중 예외: {cache_err}")
                        
    GLOBAL_DASHBOARD_CACHE["running"] = running_list
    GLOBAL_DASHBOARD_CACHE["cron"] = cron_list
    GLOBAL_DASHBOARD_CACHE["last_updated"] = time.time()


def _execute_scheduled_tasks(global_config, now):
    with _RUNTIME['lock']:
        if _RUNTIME['maintenance']:
            return
        _RUNTIME['requests'] += 1
    try:
        return _execute_scheduled_tasks_impl(global_config, now)
    finally:
        with _RUNTIME['lock']:
            _RUNTIME['requests'] -= 1


def _execute_scheduled_tasks_impl(global_config, now):
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
            tool_name = get_tool_name(base_dir, tool_id)
            
            if task_state and task_state.get('state') in ('running', 'cancelling'):
                logger.info(f"[{tool_name}] (서버:{server_id[:8]}) 이미 작업이 실행 중이므로 스킵합니다.")
                continue

            logger.info(f"[{tool_name}] (서버:{server_id[:8]}) 크론 조건({cron_expr}) 달성. 워커 스레드를 트리거합니다.")

            try:
                info_path = os.path.join(tools_dir, tool_id, 'info.yaml')
                with open(info_path, 'r', encoding='utf-8') as f:
                    entry_file = yaml.safe_load(f).get('entry_file', 'main.py')
                module = _load_tool_module(tools_dir, tool_id, entry_file)
                
                req_data = opts.copy()
                req_data['action_type'] = 'execute'
                req_data['_is_cron'] = True

                run_config = dict(global_config or {})
                run_config['plex_db_path'] = opts.get('db_path') or run_config.get('plex_db_path')
                run_config['plex_sqlite_bin'] = opts.get('sqlite_bin') or run_config.get('plex_sqlite_bin') or '/usr/lib/plexmediaserver/Plex SQLite'
                
                data_mgr = CoreDataManager(base_dir, tool_id, server_id, task_mgr=task_mgr, source_config=run_config)
                
                db_api = create_db_api(run_config)
                meta_db_engine = UniversalMetaDatabaseEngine(global_config)
                
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
                    "task": task_mgr, "config": run_config,
                    "cache": data_mgr, "options": opts, 
                    "notify": create_discord_notifier(base_dir, tool_id, server_id, global_config),
                    "sort": core_natural_sort,
                    "meta_db": {
                        "is_enabled": meta_db_engine.is_enabled,
                        "test_connection": meta_db_engine.test_connection,
                        "query": meta_db_engine.query,
                        "execute": meta_db_engine.execute,
                        "get_cursor": meta_db_engine.get_cursor
                    }
                }

                tool_lock = get_tool_lock(tool_id, server_id)
                if not tool_lock.acquire(blocking=False):
                    continue
                transferred = False
                try:
                    res, code = module.run(req_data, core_api)
                
                    if code == 200 and isinstance(res, dict) and res.get('type') == 'async_task':
                        t_data = res.get('task_data', {})
                        t_data['_is_cron'] = True
                    
                        try:
                            task_mgr.init_task(t_data)
                            target_thread_name = f"Worker_{tool_id}_{server_id}"
                        
                            t = threading.Thread(target=_core_worker_runner,
                                                 args=(module, t_data, core_api, 0, tool_id, server_id),
                                                 name=target_thread_name)
                            t.daemon = True
                            t.start()
                            transferred = True
                        except Exception as start_err:
                            task_mgr.finish(failed=True)
                            raise start_err
                    
                finally:
                    if not transferred:
                        tool_lock.release()

            except Exception as e:
                logger.error(f"Scheduler Error: Tool {tool_id} execution failed: {e}")


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
        logger.error(f"SQLite Operational Error: {str(e)}")
        raise
    except Exception as e:
        logger.error(f"DB Connection failed: {str(e)}")
        raise
    finally:
        if conn:
            try: conn.rollback()
            except Exception: pass
            try: conn.close()
            except Exception: pass

def is_season_folder(folder_name):
    name_lower = unicodedata.normalize('NFC', folder_name).lower().strip()
    if re.match(r'^(season|시즌|series|s)[\s._-]*\d+\b', name_lower): return True
    if re.match(r'^(specials?|스페셜|extras?|특집|ova|ost)[\s._-]*(\d+)?$', name_lower): return True
    if name_lower.isdigit(): return True
    return False

def natural_sort_key(s):
    return [text.zfill(10) if text.isdigit() else text.lower() for text in re.split(r'(\d+)', str(s))]


def _get_unique_show_folder_count(cursor, rating_key, db_type="sqlite3"):
    seen_paths = set()
    root_paths = set()
    
    ph = "%s" if db_type == "postgres" else "?"
    query = f"""
        SELECT mp.file 
        FROM metadata_items ep 
        JOIN metadata_items sea ON ep.parent_id = sea.id 
        JOIN media_items m ON m.metadata_item_id = ep.id 
        JOIN media_parts mp ON mp.media_item_id = m.id 
        WHERE sea.parent_id = {ph} AND ep.metadata_type = 4
    """
    cursor.execute(query, (int(rating_key) if db_type == "postgres" else rating_key,))
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


def _plex_trailer_id_sql(parent_alias="mi"):
    """Select Plex trailer clips (type 12, relation 1) and legacy type 5 extras."""
    return f"""(
        SELECT trailer.id FROM metadata_items trailer
        WHERE trailer.metadata_type IN (5, 12) AND trailer.id IN (
            SELECT child.id FROM metadata_items child
            WHERE child.parent_id = {parent_alias}.id AND child.metadata_type = 5
            UNION
            SELECT mr.related_metadata_item_id FROM metadata_relations mr
            JOIN metadata_items related ON related.id = mr.related_metadata_item_id
            WHERE mr.metadata_item_id = {parent_alias}.id AND (
                (mr.relation_type = 1 AND related.metadata_type IN (5, 12))
                OR (mr.relation_type = 0 AND related.metadata_type = 5)
            )
        )
        ORDER BY CASE WHEN LOWER(COALESCE(trailer.title, '')) LIKE '%[preview]%' THEN 0 ELSE 1 END,
                 trailer.id
        LIMIT 1
    )"""


def handle_library_batch(data, max_batch_size, db_engine):
    if not data or 'ids' not in data:
        return {"error": "Invalid request"}, 400
        
    raw_ids = [int(i) for i in data['ids'] if str(i).isdigit()]
    ids = list(set(raw_ids))[:max_batch_size]
    if not ids: return {}, 200
    
    check_multi_path = data.get('check_multi_path', False)
    placeholders = ','.join(['%s' if db_engine.db_type == 'postgres' else '?'] * len(ids))
    
    try:
        with db_engine.get_cursor() as cursor:
            meta_types = {}
            if check_multi_path:
                cursor.execute(f"SELECT id, metadata_type FROM metadata_items WHERE id IN ({placeholders})", ids)
                for row in cursor.fetchall():
                    meta_types[str(row[0])] = row[1]

            group_fn = "string_agg" if db_engine.db_type == "postgres" else "group_concat"

            query = f"""
            SELECT mi.id, m.width,
                (SELECT {group_fn}(ms.codec || '|' || COALESCE(ms.extra_data, ''), ';;') FROM media_streams ms WHERE ms.media_item_id = m.id AND ms.stream_type_id = 1) as raw_stream_data,
                (SELECT {group_fn}(ms.id || '|' || COALESCE(ms.language, 'und') || '|' || COALESCE(ms.codec, '') || '|' || COALESCE(ms.url, ''), ';;') FROM media_streams ms WHERE ms.media_item_id = m.id AND ms.stream_type_id = 3) as sub_data,
                mi.guid, mp.file, mp.id,
                {_plex_trailer_id_sql()} as trailer_id
            FROM metadata_items mi
            LEFT JOIN media_items m ON m.metadata_item_id = mi.id
            LEFT JOIN media_parts mp ON mp.media_item_id = m.id
            WHERE mi.id IN ({placeholders}) ORDER BY COALESCE(m.width, 0) DESC, COALESCE(m.bitrate, 0) DESC
            """
            cursor.execute(query, ids)
            result_map = {}
            for row in cursor.fetchall():
                rk = str(row[0])
                width, raw_data, sub_data, guid, filepath, part_id, trailer_id = row[1], row[2], row[3], row[4], row[5], row[6], row[7]
                if filepath: filepath = unicodedata.normalize('NFC', filepath)
                
                path_count = 1
                if check_multi_path and rk not in result_map and meta_types.get(rk) == 2:
                    path_count = _get_unique_show_folder_count(cursor, rk, db_engine.db_type)

                if rk not in result_map:
                    clean_guid = guid.split("://")[1].split("?")[0] if guid and "://" in guid else (guid or "")
                    if not filepath:
                        result_map[rk] = { "tags": [], "g": clean_guid, "raw_g": guid or "", "p": "", "part_id": None, "sub_id": "", "sub_url": "", "path_count": path_count, "trailer_id": trailer_id }
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
                        "path_count": path_count,
                        "trailer_id": trailer_id
                    }

        return result_map, 200
    except Exception as e:
        logger.error(f"Batch processing failed: {e}")
        return {"error": str(e)}, 500


def handle_media_detail(rating_key, db_engine):
    if not str(rating_key).isdigit(): 
        return {"error": "Invalid rating_key"}, 400

    rk_val = int(rating_key) if db_engine.db_type == "postgres" else rating_key
    ph = "%s" if db_engine.db_type == "postgres" else "?"

    total_duration = 0
    try:
        with db_engine.get_cursor() as cursor:
            cursor.execute(f"SELECT metadata_type, guid, library_section_id, {_plex_trailer_id_sql()} FROM metadata_items mi WHERE mi.id = {ph}", (rk_val,))
            meta_row = cursor.fetchone()
            if not meta_row: 
                return {"error": "Item not found"}, 404
            m_type, guid, lib_section_id = meta_row[0], meta_row[1], meta_row[2]
            trailer_id = meta_row[3]
            
            if m_type in (2, 3, 8):
                folder_paths, seen_paths = [], set()
                file_rows = []
                
                # 쇼 대표 페이지 (m_type == 2)
                if m_type == 2:
                    query = f"""
                        SELECT mp.file 
                        FROM metadata_items ep 
                        LEFT JOIN metadata_items sea ON ep.parent_id = sea.id 
                        JOIN media_items m ON m.metadata_item_id = ep.id 
                        JOIN media_parts mp ON mp.media_item_id = m.id 
                        WHERE (sea.parent_id = {ph} OR ep.parent_id = {ph}) AND ep.metadata_type = 4 
                        ORDER BY COALESCE(m.width, 0) DESC, COALESCE(m.bitrate, 0) DESC
                    """
                    cursor.execute(query, (rk_val, rk_val))
                    file_rows = cursor.fetchall()
                    
                    dur_query = f"""
                        SELECT SUM(dur) FROM (
                            SELECT MAX(m.duration) as dur
                            FROM metadata_items ep
                            JOIN metadata_items sea ON ep.parent_id = sea.id
                            JOIN media_items m ON m.metadata_item_id = ep.id
                            WHERE sea.parent_id = {ph} AND ep.metadata_type = 4
                              AND sea."index" = (
                                  SELECT MIN("index")
                                  FROM metadata_items
                                  WHERE parent_id = sea.parent_id AND metadata_type = 3
                                    AND ("index" % 100) = (sea."index" % 100)
                              )
                            GROUP BY ep.id
                        ) sub
                    """
                    try:
                        cursor.execute(dur_query, (rk_val,))
                        dur_res = cursor.fetchone()
                        if dur_res and dur_res[0]: total_duration = int(dur_res[0])
                    except Exception: pass

                # 시즌 페이지 (m_type == 3)
                elif m_type == 3:
                    query = f"""
                        SELECT mp.file 
                        FROM metadata_items ep 
                        JOIN media_items m ON m.metadata_item_id = ep.id 
                        JOIN media_parts mp ON mp.media_item_id = m.id 
                        WHERE ep.parent_id = {ph} AND ep.metadata_type = 4 
                        ORDER BY COALESCE(m.width, 0) DESC, COALESCE(m.bitrate, 0) DESC
                    """
                    cursor.execute(query, (rk_val,))
                    file_rows = cursor.fetchall()
                    
                    dur_query = f"""
                        SELECT SUM(dur) FROM (
                            SELECT MAX(m.duration) as dur
                            FROM metadata_items ep
                            JOIN media_items m ON m.metadata_item_id = ep.id
                            WHERE ep.parent_id = {ph} AND ep.metadata_type = 4
                            GROUP BY ep.id
                        ) sub
                    """
                    try:
                        cursor.execute(dur_query, (rk_val,))
                        dur_res = cursor.fetchone()
                        if dur_res and dur_res[0]: total_duration = int(dur_res[0])
                    except Exception: pass

                # 음악 아티스트 (m_type == 8)
                elif m_type == 8:
                    query = f"""
                        SELECT DISTINCT mp.file 
                        FROM metadata_items track 
                        JOIN metadata_items album ON track.parent_id = album.id 
                        JOIN media_items m ON m.metadata_item_id = track.id 
                        JOIN media_parts mp ON mp.media_item_id = m.id 
                        WHERE album.parent_id = {ph} AND track.metadata_type = 10
                    """
                    cursor.execute(query, (rk_val,))
                    file_rows = cursor.fetchall()

                # 상황별 최적 디렉토리 추출
                for row in file_rows:
                    if not row or not row[0]: continue
                    raw_file = unicodedata.normalize('NFC', row[0])
                    
                    if m_type == 8:
                        # 아티스트 폴더
                        album_dir = os.path.dirname(raw_file)
                        artist_dir = os.path.dirname(album_dir)
                        if re.match(r'^cd\s*\d+', os.path.basename(album_dir).lower()):
                            artist_dir = os.path.dirname(artist_dir)
                        target_dir = artist_dir
                        
                    elif m_type == 2:
                        # 쇼 대표 페이지
                        target_dir = os.path.dirname(raw_file)
                        while True:
                            base_name = os.path.basename(target_dir)
                            if not base_name: break
                            if is_season_folder(base_name):
                                parent_path = os.path.dirname(target_dir)
                                if parent_path == target_dir: break
                                target_dir = parent_path
                            else:
                                break
                                
                    elif m_type == 3:
                        # 시즌 페이지
                        target_dir = os.path.dirname(raw_file)
                        if re.match(r'^(cd|disc|part)\s*\d+', os.path.basename(target_dir).lower()):
                            target_dir = os.path.dirname(target_dir)
                    else:
                        target_dir = os.path.dirname(raw_file)
                        
                    dir_key = os.path.normpath(target_dir).replace('\\', '/').lower()
                    if dir_key not in seen_paths:
                        seen_paths.add(dir_key)
                        folder_paths.append(target_dir)

                folder_paths.sort(key=natural_sort_key)
                versions = [{"file": path, "parts": [{"path": path}]} for path in folder_paths]
                
                return { 
                    "type": "directory", 
                    "itemId": rating_key, 
                    "guid": guid, 
                    "duration": total_duration,
                    "librarySectionID": lib_section_id, 
                    "versions": versions, "trailer_id": trailer_id
                }, 200

            if m_type == 9:
                tracks = []
                query = f"""
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
                        track.parent_id = {ph} OR 
                        track.parent_id IN (SELECT id FROM metadata_items WHERE parent_id = {ph} AND metadata_type = 9)
                    )
                    ORDER BY disc_num ASC, track."index" ASC
                """
                cursor.execute(query, (rk_val, rk_val))
                
                folder_paths, seen_paths = [], set()
                for row in cursor.fetchall():
                    t_id, t_num, t_title, a_codec, a_bitrate, f_path, part_id, has_lyric, disc_num = row[0], row[1], row[2], row[3], row[4], row[5], row[6], row[7], row[8]
                    
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
                
                return { "type": "album", "itemId": rating_key, "guid": guid, "duration": None, "librarySectionID": lib_section_id, "versions": versions, "tracks": tracks, "trailer_id": trailer_id }, 200

            group_fn = "string_agg" if db_engine.db_type == "postgres" else "group_concat"
            query_media = f"""
                SELECT m.id, m.width, m.height, 
                       (SELECT bitrate FROM media_streams WHERE media_item_id = m.id AND stream_type_id = 1 LIMIT 1) as v_bitrate, 
                       (SELECT {group_fn}(ms.codec || '|' || COALESCE(ms.extra_data, ''), ';;') FROM media_streams ms WHERE media_item_id = m.id AND stream_type_id = 1) as raw_stream_data, 
                       m.video_codec, 
                       COALESCE(NULLIF(m.audio_codec, ''), (SELECT codec FROM media_streams WHERE media_item_id = m.id AND stream_type_id = 2 LIMIT 1)) as audio_codec, 
                       m.duration,
                       (SELECT channels FROM media_streams WHERE media_item_id = m.id AND stream_type_id = 2 LIMIT 1) as audio_ch, 
                       (SELECT bitrate FROM media_streams WHERE media_item_id = m.id AND stream_type_id = 2 LIMIT 1) as a_bitrate, 
                       mp.id, mp.file 
                FROM media_items m 
                LEFT JOIN media_parts mp ON mp.media_item_id = m.id 
                WHERE m.metadata_item_id = {ph} 
                ORDER BY COALESCE(m.width, 0) DESC, COALESCE(m.bitrate, 0) DESC
            """
            cursor.execute(query_media, (rk_val,))
            versions, duration = [], 0
            seen_files = set() 

            for row in cursor.fetchall():
                m_id, width, height, v_bitrate, raw_data, v_codec, a_codec, dur, a_ch, a_bitrate, part_id, file_path = row[0], row[1], row[2], row[3], row[4], row[5], row[6], row[7], row[8], row[9], row[10], row[11]
                
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

                cursor.execute(f"SELECT id, language, codec, url FROM media_streams WHERE media_part_id = {ph} AND stream_type_id = 3", (part_id,))
                subs = [{"id": s[0], "languageCode": (s[1] or "und").lower()[:3], "codec": s[2] or "unknown", "key": s[3], "format": s[2] or "unknown"} for s in cursor.fetchall()]
                
                versions.append({
                    "part_id": part_id, "file": file_path, "width": width or 0, "v_bitrate": v_bitrate or 0, 
                    "video_extra": video_extra, "v_codec": v_codec or "", "a_codec": a_codec or "", 
                    "a_ch": a_ch or "", "a_bitrate": a_bitrate or 0, "subs": subs, "parts": [{"id": part_id, "path": file_path}],
                    "m_type": m_type
                })
            
            cursor.execute(f"SELECT text, time_offset, end_time_offset FROM taggings WHERE metadata_item_id = {ph} AND text IN ('intro', 'credits')", (rk_val,))
            markers = {tag_text: {"start": start_offset, "end": end_offset} for tag_text, start_offset, end_offset in cursor.fetchall() if tag_text and start_offset is not None and end_offset is not None}
                
        return { 
            "type": "directory" if m_type in (2, 3) else "album" if m_type == 8 else "audio" if m_type == 10 else "video", 
            "itemId": rating_key, "guid": guid, 
            "duration": total_duration if m_type in (2, 3) else duration, 
            "librarySectionID": lib_section_id, "versions": versions, "markers": markers,
            "trailer_id": trailer_id
        }, 200
    except Exception as e:
        logger.error(f"Failed processing item {rating_key}: {e}")
        return {"error": str(e)}, 500


# ==============================================================================
# [코어 작업 관리자 (Task Manager)]
# ==============================================================================

class CoreTaskManager:
    # 툴별 런타임 실행 상태 딕셔너리 (RAM)
    _TASK_STATES = {}
    _TASK_STATES_LOCK = threading.Lock()

    # 툴별 최근 로그 링버퍼 (RAM)
    _MEMORY_LOGS = {}
    _MEMORY_LOGS_LOCK = threading.Lock()

    # 툴별 실시간 SSE 전송용 완료 아이템 큐 (RAM)
    _COMPLETED_BUFFER = {}
    _COMPLETED_LOCK = threading.Lock()

    # 툴별 10MB x 5 로테이션 파일 로거 풀 (Handler 누수 방지)
    _TASK_FILE_LOGGERS = {}
    _TASK_LOGGERS_LOCK = threading.Lock()

    def __init__(self, base_dir, tool_id, server_id="default"):
        self.base_dir = base_dir
        self.tool_id = tool_id
        self.server_id = server_id
        self.task_key = (os.path.realpath(base_dir), tool_id, server_id)
        
        task_dir = os.path.join(base_dir, 'task_logs')
        os.makedirs(task_dir, exist_ok=True)
        self.log_file = os.path.join(task_dir, f"{tool_id}_{server_id}.log")

        # 인메모리 초기화
        with CoreTaskManager._TASK_STATES_LOCK:
            if self.task_key not in CoreTaskManager._TASK_STATES:
                CoreTaskManager._TASK_STATES[self.task_key] = {
                    "tool_id": tool_id, "server_id": server_id,
                    "state": "completed",
                    "progress": 0,
                    "total": 0,
                    "task_data": {}
                }
            self.run_id = CoreTaskManager._TASK_STATES[self.task_key].get('run_id')

        with CoreTaskManager._MEMORY_LOGS_LOCK:
            if self.task_key not in CoreTaskManager._MEMORY_LOGS:
                CoreTaskManager._MEMORY_LOGS[self.task_key] = deque(maxlen=60)

        with CoreTaskManager._COMPLETED_LOCK:
            if self.task_key not in CoreTaskManager._COMPLETED_BUFFER:
                CoreTaskManager._COMPLETED_BUFFER[self.task_key] = []

    def _get_file_logger(self):
        with CoreTaskManager._TASK_LOGGERS_LOCK:
            if self.task_key not in CoreTaskManager._TASK_FILE_LOGGERS:
                logger_name = f"PMH_Task_{self.task_key}"
                t_logger = logging.getLogger(logger_name)
                t_logger.setLevel(logging.INFO)
                t_logger.propagate = False
                for handler in t_logger.handlers[:]:
                    t_logger.removeHandler(handler)
                    handler.close()

                fh = RotatingFileHandler(
                    self.log_file,
                    maxBytes=10 * 1024 * 1024,
                    backupCount=5,
                    encoding='utf-8'
                )
                formatter = logging.Formatter('%(message)s')
                fh.setFormatter(formatter)
                t_logger.addHandler(fh)
                CoreTaskManager._TASK_FILE_LOGGERS[self.task_key] = t_logger

            return CoreTaskManager._TASK_FILE_LOGGERS[self.task_key]

    def log(self, msg):
        if not self.is_current():
            return
        stamp = datetime.now().strftime('%H:%M:%S')
        log_line = f"[{stamp}] {msg}"
        tool_name = get_tool_name(self.base_dir, self.tool_id)
        logger.info(f"[{tool_name}] {msg}")

        with CoreTaskManager._MEMORY_LOGS_LOCK:
            if self.task_key in CoreTaskManager._MEMORY_LOGS:
                CoreTaskManager._MEMORY_LOGS[self.task_key].append(log_line)

        try:
            self._get_file_logger().info(log_line)
        except Exception: pass

    def init_task(self, task_data):
        with CoreTaskManager._TASK_STATES_LOCK:
            self.run_id = uuid.uuid4().hex
            CoreTaskManager._TASK_STATES[self.task_key] = {
                "tool_id": self.tool_id, "server_id": self.server_id,
                "run_id": self.run_id, "cancel_event": threading.Event(), "worker_active": True,
                "state": "running",
                "progress": 0,
                "total": task_data.get('total', 0),
                "task_data": task_data
            }

        with CoreTaskManager._MEMORY_LOGS_LOCK:
            if self.task_key in CoreTaskManager._MEMORY_LOGS:
                CoreTaskManager._MEMORY_LOGS[self.task_key].clear()

        with CoreTaskManager._COMPLETED_LOCK:
            CoreTaskManager._COMPLETED_BUFFER[self.task_key] = []

        try:
            self._get_file_logger().info(f"\n=== [{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] 작업 시작 ===")
        except Exception: pass

        self.log("작업을 시작합니다...")

    def update_state(self, state, progress=None, total=None):
        with CoreTaskManager._TASK_STATES_LOCK:
            if self.task_key in CoreTaskManager._TASK_STATES:
                t = CoreTaskManager._TASK_STATES[self.task_key]
                if t.get('run_id') != self.run_id:
                    return
                if not t.get('worker_active') and t.get('state') in ('completed', 'error', 'cancelled'):
                    return
                if state in ('cancelled', 'cancelling') and t.get('cancel_event'):
                    t['cancel_event'].set()
                if t.get('worker_active') and state in ('completed', 'error', 'cancelled'):
                    t['terminal_state'] = state
                elif not t.get('worker_active') or state == 'running':
                    t['state'] = state
                if t.get('worker_active') and t.get('cancel_event') and t['cancel_event'].is_set():
                    t['state'] = 'cancelling'
                if progress is not None: t["progress"] = progress
                if total is not None: t["total"] = total

    def load(self, include_target_items=False):
        with CoreTaskManager._TASK_STATES_LOCK:
            raw_data = CoreTaskManager._TASK_STATES.get(self.task_key, {
                "state": "completed", "progress": 0, "total": 0, "task_data": {}
            })
            
            data = {
                "run_id": raw_data.get('run_id'),
                "server_id": self.server_id,
                "tool_id": self.tool_id,
                "state": raw_data["state"],
                "progress": raw_data["progress"],
                "total": raw_data["total"],
                "task_data": copy.deepcopy(raw_data["task_data"]) if isinstance(raw_data.get("task_data"), dict) else {}
            }
            if not include_target_items and "target_items" in data["task_data"]:
                del data["task_data"]["target_items"]

        with CoreTaskManager._MEMORY_LOGS_LOCK:
            buf = CoreTaskManager._MEMORY_LOGS.get(self.task_key, [])
            data['logs'] = list(buf)

        return data

    def save(self, data):
        with CoreTaskManager._TASK_STATES_LOCK:
            current = self._TASK_STATES.get(self.task_key, {})
            if current.get('run_id') != self.run_id:
                raise RuntimeError('Stale task run')
            self._TASK_STATES[self.task_key] = {**current,
                "state": data.get("state", "completed"),
                "progress": data.get("progress", 0),
                "total": data.get("total", 0),
                "task_data": data.get("task_data", {})
            }

    def reset(self):
        with CoreTaskManager._TASK_STATES_LOCK:
            if self._TASK_STATES.get(self.task_key, {}).get('worker_active'):
                raise RuntimeError('Task is still active')
            self._TASK_STATES[self.task_key] = {
                "tool_id": self.tool_id, "server_id": self.server_id,
                "state": "completed", "progress": 0, "total": 0, "task_data": {}
            }
        with CoreTaskManager._MEMORY_LOGS_LOCK:
            if self.task_key in CoreTaskManager._MEMORY_LOGS:
                CoreTaskManager._MEMORY_LOGS[self.task_key].clear()
        with CoreTaskManager._COMPLETED_LOCK:
            CoreTaskManager._COMPLETED_BUFFER[self.task_key] = []
        with CoreTaskManager._TASK_LOGGERS_LOCK:
            if self.task_key in CoreTaskManager._TASK_FILE_LOGGERS:
                task_logger = CoreTaskManager._TASK_FILE_LOGGERS.pop(self.task_key)
                for handler in task_logger.handlers[:]:
                    task_logger.removeHandler(handler)
                    handler.close()

        for i in ["", ".1", ".2", ".3", ".4", ".5"]:
            f_path = self.log_file + i
            if os.path.exists(f_path):
                try: os.remove(f_path)
                except Exception: pass

    def is_cancelled(self):
        with CoreTaskManager._TASK_STATES_LOCK:
            task = CoreTaskManager._TASK_STATES.get(self.task_key, {})
            return (task.get('run_id') != self.run_id or task.get('state') in ('cancelled', 'cancelling', 'error')
                    or bool(task.get('cancel_event') and task['cancel_event'].is_set()))

    def is_current(self):
        with CoreTaskManager._TASK_STATES_LOCK:
            return CoreTaskManager._TASK_STATES.get(self.task_key, {}).get('run_id') == self.run_id

    def finish(self, failed=False):
        with CoreTaskManager._TASK_STATES_LOCK:
            task = CoreTaskManager._TASK_STATES.get(self.task_key, {})
            if task.get('run_id') != self.run_id or not task.get('worker_active'):
                return
            task['state'] = ('cancelled' if task['cancel_event'].is_set() else
                             'error' if failed else task.get('terminal_state', 'completed'))
            task['worker_active'] = False

    def push_completed_item(self, item_id):
        with CoreTaskManager._TASK_STATES_LOCK:
            if CoreTaskManager._TASK_STATES.get(self.task_key, {}).get('run_id') != self.run_id:
                return
        with CoreTaskManager._COMPLETED_LOCK:
            if self.task_key in CoreTaskManager._COMPLETED_BUFFER:
                CoreTaskManager._COMPLETED_BUFFER[self.task_key].append(str(item_id))

    def pop_completed_items(self):
        with CoreTaskManager._COMPLETED_LOCK:
            items = CoreTaskManager._COMPLETED_BUFFER.get(self.task_key, [])
            CoreTaskManager._COMPLETED_BUFFER[self.task_key] = []
            return items


# ==============================================================================
# [코어 데이터 캐시 관리자]
# ==============================================================================

def load_pending_tool_items(cache, retry_errors=False):
    """Completed rows are already filtered out; applying progress as OFFSET loses work."""
    statuses = ('pending', 'error') if retry_errors else ('pending',)
    session = getattr(cache, 'read_session', cache.transaction_session)
    with session() as connection:
        cursor = connection.cursor()
        if hasattr(cache, 'cache_revision'):
            row = cursor.execute('SELECT payload FROM meta LIMIT 1').fetchone()
            metadata = json.loads(row[0]) if row else {}
            revision = metadata.get('cache_revision')
            if not revision:
                raise RuntimeError('Legacy cache: run preview again before executing')
            cache.cache_revision = revision
        placeholders = ','.join('?' for _ in statuses)
        cursor.execute(f'SELECT * FROM data WHERE pmh_status IN ({placeholders}) ORDER BY pmh_id', statuses)
        columns = [column[0] for column in cursor.description]
        return [dict(zip(columns, row)) for row in cursor.fetchall()]


_FF_WRITE_CONTEXT = threading.local()


class FfWriteBlocked(RuntimeError):
    def __init__(self, state, attempt_id=None, status=None, payload=None):
        self.state, self.attempt_id = state, attempt_id
        self.status, self.payload = status, payload or {}
        super().__init__(f'FF 쓰기 {state}: 원격 쓰기 원장에서 확인하세요. (시도 {attempt_id or "-"})')


def ff_safe_summary(value, secrets=()):
    """A bounded, allowlisted receipt, never a raw response or authenticated URL."""
    fields = {'ret', 'error_code', 'commit_state', 'is_updated', 'skipped', 'changes',
              'failures', 'failure_details', 'warnings', 'cleanup_pending', 'category',
              'code', 'domain', 'person_idx', 'requested_person_idx'}
    budget = {'nodes': 256, 'chars': 8192}
    def clean(v, depth=0):
        budget['nodes'] -= 1
        if budget['nodes'] < 0: return '[bounded]'
        if depth > 4: return '[bounded]'
        if type(v) is float and not math.isfinite(v): return '[nonfinite]'
        if v is None or type(v) in (bool, int, float): return v
        if isinstance(v, str):
            for secret in secrets:
                if secret: v = v.replace(str(secret), '[redacted]')
            v = re.sub(r'https?://[^\s<>"\']+', '[URL]', v)
            v = re.sub(r'(?i)(apikey|api_key|token|password|signature)\s*[:=]\s*\S+', '[redacted]', v)
            limit = min(256, max(0, budget['chars']))
            budget['chars'] -= limit
            return v[:limit]
        if isinstance(v, list): return [clean(x, depth + 1) for x in v[:30]]
        if isinstance(v, dict):
            return {str(k): clean(x, depth + 1) for k, x in list(v.items())[:30]
                    if re.fullmatch(r'[\w.-]{1,64}', str(k)) and
                    not re.search(r'(?i)key|token|password|signature|url|path', str(k)) and
                    str(k) not in secrets}
        return '[unsupported]'
    return {k: clean(value[k]) for k in fields if k in value} if isinstance(value, dict) else {}


def ff_route_kind(endpoint, method, payload):
    """Classify the actual FF handler before interpreting any command or intent."""
    command_routes = {'meta_api', 'person_api'}
    read_apis = {'api/meta_db/info_batch', 'api/meta_db/batch_info'}
    write_apis = {'api/meta_db/' + action for action in (
        'media_sync', 'person_image_sync', 'make_preview_clip', 'delete_preview_clip')}
    write_apis.update('api/' + module + '/' + action
                      for module in ('jav_censored', 'jav_uncensored', 'western')
                      for action in ('crop_save', 'crop_direct_save', 'direct_save', 'user_image_update'))
    display_routes = {'normal/' + action for action in (
        'jav_image', 'jav_image_un', 'jav_video', 'jav_video_un',
        'image_proxy', 'discord_proxy', 'image_process.jpg', 'stream')}
    if method != 'POST' and endpoint in write_apis | command_routes:
        raise FfWriteBlocked('relay_method_not_allowed', status=405)
    if not isinstance(payload, dict):
        raise FfWriteBlocked('relay_input_rejected', status=400)
    if endpoint in read_apis | write_apis | display_routes:
        # Dedicated handlers ignore command. Accepting it would misrepresent routing
        # and can also change the relay's JSON/form serialization.
        if 'command' in payload:
            raise FfWriteBlocked('relay_input_rejected', status=400)
        if endpoint in display_routes:
            if method != 'GET': raise FfWriteBlocked('relay_method_not_allowed', status=405)
            return 'read'
        if method not in ('GET', 'POST'):
            raise FfWriteBlocked('relay_method_not_allowed', status=405)
        return 'write' if endpoint in write_apis else 'read'
    if endpoint in command_routes:
        command = payload.get('command')
        if not isinstance(command, str) or not command:
            raise FfWriteBlocked('relay_input_rejected', status=400)
        lists = {'web_list', 'list', 'person_web_list'}
        if endpoint == 'person_api' and command not in lists and (
                'search_domain' in payload or payload.get('category') == 'PERSON'):
            raise FfWriteBlocked('relay_input_rejected', status=400)
        reads = {'get_meta_by_code', 'meta_db_schema_status', 'db_delete_preview',
                 'person_search', 'info_batch', 'batch_info', 'web_list', 'list'}
        if endpoint == 'person_api': reads.add('person_web_list')
        return 'read' if command in reads else 'write'
    # Unknown paths, aliases, traversal and unverified AJAX routers fail closed.
    raise FfWriteBlocked('relay_endpoint_not_allowed', status=405 if method == 'GET' else 400)


def ff_write_descriptor(endpoint, payload):
    """Explicit route contracts; None means a verified read, never rejected input."""
    kind = ff_route_kind(endpoint, 'POST', payload)
    if kind == 'read': return None
    payload = payload or {}
    command = str(payload.get('command') or '')
    def parsed(v):
        if isinstance(v, dict): return v
        try:
            result = json.loads(v) if v else {}
            if isinstance(result, list) and len(result) == 1: result = result[0]
            return result if isinstance(result, dict) else {}
        except (ValueError, TypeError): return {}
    if command in ('db_sync_media', 'person_sync_image'):
        try:
            options = json.loads(payload.get('arg3') or '{}')
        except (TypeError, ValueError): raise FfWriteBlocked('invalid_request') from None
        if command == 'db_sync_media':
            canonical_payload = {'category': payload.get('arg2'), 'code': payload.get('arg1'), 'options': options}
            canonical_endpoint = 'api/meta_db/media_sync'
        else:
            canonical_payload = {'domain': payload.get('arg2'), 'person_idx': payload.get('arg1'), 'options': options}
            canonical_endpoint = 'api/meta_db/person_image_sync'
        canonical_payload['_pmh_review_tokens'] = payload.get('_pmh_review_tokens', [])
        return ff_write_descriptor(canonical_endpoint, canonical_payload)
    modern = endpoint in ('api/meta_db/media_sync', 'api/meta_db/person_image_sync')
    person = endpoint.endswith('person_image_sync') or endpoint == 'person_api' or command.startswith('person_')
    details = parsed(payload.get('arg1'))
    if person:
        domain = payload.get('domain') or details.get('domain') or payload.get('arg2')
        if domain not in ('JAV', 'WESTERN'):
            # Legacy commands sometimes use DB row IDs. Keep a conservative shared domain.
            domain = 'UNRESOLVED'
        code = payload.get('person_idx') or details.get('person_idx') or details.get('id') or payload.get('arg1')
        category = domain
    else:
        category = payload.get('category') or payload.get('cat') or payload.get('arg2')
        code = payload.get('code') or details.get('code') or payload.get('arg1')
        category = details.get('category') or category
        if isinstance(code, (dict, list)) or str(code).startswith(('{', '[')):
            category, code = 'UNRESOLVED', 'shared-target'
        aliases = {'jav_censored': 'JAV_CEN', 'jav_uncensored': 'JAV_UNCEN',
                   'jav': 'JAV_CEN', 'western': 'WESTERN'}
        module = endpoint.split('/')[1] if endpoint.startswith('api/') else ''
        category = aliases.get(str(category).lower(), category)
        if category not in ('JAV_CEN', 'JAV_UNCEN', 'WESTERN'):
            category = aliases.get(module) or {'C': 'JAV_CEN', 'E': 'JAV_UNCEN', 'W': 'WESTERN'}.get(str(code)[:1], 'UNRESOLVED')
    if modern:
        allowed = {'skip_existing'} if person else {'skip_existing', 'poster', 'landscape', 'fanart', 'trailer'}
        options = payload.get('options', {})
        if (not isinstance(options, dict) or set(options) - allowed or
                any(type(v) is not bool for v in options.values()) or
                (not person and payload.get('category') != category) or
                category not in (('JAV', 'WESTERN') if person else ('JAV_CEN', 'JAV_UNCEN', 'WESTERN')) or
                not isinstance(code, str) or not code.strip()):
            raise FfWriteBlocked('invalid_request')
    code = str(code or '').strip()
    if not re.fullmatch(r'[\w.:-]{1,160}', code):
        category, code = 'UNRESOLVED', 'shared-target'
    # Sensitive values affect equality through a one-way digest only; never persist them.
    filtered = {k: v for k, v in payload.items()
                if not re.search(r'(?i)apikey|api_key|token|signature|^_pmh', k)}
    if endpoint.endswith('person_image_sync'):
        filtered['person_idx'] = code.casefold()
    if command == 'db_delete_confirm':
        filtered.pop('arg3', None)  # FF preview token changes on each fresh delete plan.
    summary_options = {k: v for k, v in (payload.get('options') or {}).items() if type(v) is bool} if isinstance(payload.get('options', {}), dict) else {}
    if modern:
        summary_options = {key: options.get(key, True) for key in sorted(allowed)}
        filtered = {'operation': endpoint, 'category': category,
                    'code': code.casefold() if person else code, 'options': summary_options}
    elif command == 'db_refresh_image_only' and payload.get('arg3') in ('reuse', 'replace'):
        summary_options['media_policy'] = payload['arg3']
    fingerprint = hashlib.sha256(json.dumps(filtered, sort_keys=True, ensure_ascii=True,
                                          separators=(',', ':')).encode()).hexdigest()
    return {'kind': 'person' if person else 'item', 'category': category, 'code': code,
            'operation': command or endpoint, 'fingerprint': fingerprint,
            'options': summary_options}


def ff_outcome(status, result, descriptor):
    if not isinstance(result, dict): return 'unknown'
    error = result.get('error_code')
    if result.get('commit_state') == 'unknown' or error == 'commit_outcome_unknown': return 'unknown'
    operation = descriptor['operation']
    success = status == 200 and result.get('ret') == 'success'
    if operation == 'api/meta_db/media_sync' and (success or 'category' in result or 'code' in result):
        if result.get('category') != descriptor['category'] or result.get('code') != descriptor['code']: return 'unknown'
    if operation == 'api/meta_db/person_image_sync' and (success or 'domain' in result or 'requested_person_idx' in result):
        if (result.get('domain') != descriptor['category'] or
                str(result.get('requested_person_idx', '')).casefold() != descriptor['code'].casefold() or
                (success and (not isinstance(result.get('person_idx'), str) or not result['person_idx']))): return 'unknown'
    if error in ('media_sync_incomplete', 'storage_asset_incomplete', 'storage_lookup_failed'): return 'partial'
    if error == 'storage_conflict': return 'blocked_conflict'
    if error in ('schema_not_writable', 'invalid_request', 'ambiguous_person', 'not_found'): return 'blocked_config'
    if status != 200 or result.get('ret') != 'success': return 'unknown'
    if result.get('failures'): return 'partial'
    if result.get('skipped') is True and result.get('is_updated') is False:
        return 'partial' if result.get('changes') else 'confirmed_noop'
    if result.get('commit_state') == 'committed': return 'confirmed_changed'
    if operation not in ('api/meta_db/media_sync', 'api/meta_db/person_image_sync'):
        # Existing legacy commands define ret=success as their receipt; no invented commit field.
        return 'confirmed_legacy'
    return 'needs_review'


def ff_read_contract(config, command, arg1='', arg2=''):
    key = config.get('mate_apikey')
    endpoint = 'person_api' if command.startswith('person_') else 'meta_api'
    req = Request(str(config.get('mate_url', '')).rstrip('/') + '/metadata/' + endpoint,
                  data=urlencode({'command': command, 'arg1': arg1, 'arg2': arg2, 'apikey': key}).encode(),
                  headers={'X-API-Key': str(key), 'Content-Type': 'application/x-www-form-urlencoded'})
    try:
        with urlopen(req, timeout=60) as response:
            result = json.loads(response.read().decode())
            if response.status != 200 or not isinstance(result, dict) or result.get('ret') != 'success':
                raise ValueError('invalid read receipt')
            return result
    except Exception:
        raise FfWriteBlocked('read_verification_failed') from None


def ff_require_writable(config, descriptor):
    result = ff_read_contract(config, 'meta_db_schema_status')
    statuses = {str(k).upper(): v for k, v in (result.get('data') or {}).items()}
    categories = {'PERSON'}
    if descriptor['kind'] == 'item':
        categories.update(('JAV_CEN', 'JAV_UNCEN', 'WESTERN') if descriptor['category'] == 'UNRESOLVED'
                          else (descriptor['category'],))
    if (result.get('schema_name') != 'meta_db' or result.get('target_version') != 1 or
            any(not isinstance(statuses.get(cat), dict) or statuses[cat].get('schema_version') != 1 or
                statuses[cat].get('migration_state') != 'complete' for cat in categories)):
        raise FfWriteBlocked('schema_not_writable')


def ff_find_person(config, identifier, domain):
    # person_get_detailed can commit FF self-healing. Verification must use the
    # existing pure search path instead of causing another unjournaled mutation.
    result = ff_read_contract(config, 'person_search', identifier, domain).get('data')
    if not isinstance(result, list): raise FfWriteBlocked('person_read_failed')
    matches = [p for p in result if isinstance(p, dict) and p.get('domain') == domain and (
        str(p.get('person_idx') or '').casefold() == str(identifier).casefold() or
        (str(identifier).isdigit() and str(p.get('id')) == str(identifier)) or
        any(str(alias).casefold() == str(identifier).casefold() for alias in (p.get('alt_indices') or [])))]
    if len(matches) != 1 or not re.fullmatch(r'[\w.:-]{1,160}', str(matches[0].get('person_idx') or '')):
        raise FfWriteBlocked('ambiguous_person_reference')
    return matches[0]


def ff_review_context(config, row, db_engine=None):
    """The same current-reference evidence at review, approval and approved retry."""
    if row['category'] == 'UNRESOLVED':
        raise FfWriteBlocked('identity_requires_manual_correction', row['id'])
    ff_require_writable(config, row)
    if row['kind'] == 'person':
        person = ff_find_person(config, row['code'], row['category'])
        reference = {'ret': 'success', 'data': person}
        context = {'domain': person['domain'], 'requested': row['code'], 'canonical': person['person_idx']}
    else:
        reference = ff_read_contract(config, 'get_meta_by_code', row['code'], row['category'])
        entity = reference.get('data') or {}
        if not isinstance(entity, dict) or entity.get('code') != row['code'] or entity.get('category') != row['category']:
            raise FfWriteBlocked('item_identity_changed', row['id'])
        engine = db_engine or UniversalPlexDatabaseEngine(config)
        plex_rows = engine.query('SELECT id, guid FROM metadata_items WHERE guid LIKE ?', ('%' + row['code'] + '%',))
        plex_ids = sorted(str(x['id']) for x in plex_rows
                          if str(x.get('guid') or '').split('://')[-1].split('?')[0] == row['code'])
        if not plex_ids: raise FfWriteBlocked('plex_identity_not_found', row['id'])
        context = {'category': row['category'], 'code': row['code'], 'plex_ids': plex_ids}
    context['reference_hash'] = hashlib.sha256(json.dumps(reference, sort_keys=True).encode()).hexdigest()
    context['fingerprint'] = row['fingerprint']
    return context


class FfWriteJournal:
    """Single filesystem ledger shared by tools, relays and nodes. Not a distributed lock."""
    confirmed = ('confirmed_changed', 'confirmed_noop', 'confirmed_legacy')

    def __init__(self, config):
        base = config.get('base_dir')
        if not base: raise FfWriteBlocked('missing_journal_directory')
        self.config = config
        self.path = os.path.join(base, 'ff_write_journal.sqlite3')
        address = urlsplit(str(config.get('mate_url') or ''))
        if address.scheme not in ('http', 'https') or not address.hostname:
            raise FfWriteBlocked('invalid_ff_service')
        service = f'{address.scheme.lower()}://{address.hostname.lower()}:{address.port or (443 if address.scheme == "https" else 80)}{address.path.rstrip("/")}'
        self.service = hashlib.sha256(service.encode()).hexdigest()
        self.node = str(config.get('machine_id') or config.get('_server_id') or 'local')[:160]
        with self.connection() as conn:
            conn.execute('''CREATE TABLE IF NOT EXISTS attempts (
                id TEXT PRIMARY KEY, service TEXT NOT NULL, node TEXT NOT NULL,
                kind TEXT NOT NULL, category TEXT NOT NULL, code TEXT NOT NULL,
                operation TEXT NOT NULL, fingerprint TEXT NOT NULL, options TEXT NOT NULL,
                run_id TEXT, state TEXT NOT NULL, created REAL, updated REAL,
                http INTEGER, receipt TEXT, canonical TEXT, plex_state TEXT DEFAULT 'pending',
                parent TEXT, review_token TEXT, review_until REAL, review_context TEXT,
                approved REAL, approval_used INTEGER DEFAULT 0)''')
            conn.execute('CREATE INDEX IF NOT EXISTS ff_target ON attempts(service, kind, category, code)')
            conn.execute('''CREATE TABLE IF NOT EXISTS review_audit (
                id INTEGER PRIMARY KEY, attempt TEXT, action TEXT, at REAL, context_digest TEXT)''')
            conn.execute('''CREATE TABLE IF NOT EXISTS plex_phases (
                service TEXT, node TEXT, plex_id TEXT, kind TEXT, category TEXT, code TEXT,
                state TEXT, updated REAL, PRIMARY KEY(service,node,plex_id,kind,category,code))''')
        apply_permissions(self.path, config)

    @contextmanager
    def connection(self):
        conn = sqlite3.connect(self.path, timeout=15)
        conn.row_factory = sqlite3.Row
        try:
            conn.execute('BEGIN IMMEDIATE')
            yield conn
            conn.commit()
        except BaseException:
            conn.rollback()
            raise
        finally:
            conn.close()

    def records(self, attempt_id=None, unresolved_first=False):
        with self.connection() as conn:
            rows = conn.execute('SELECT * FROM attempts WHERE service=?' + (' AND id=?' if attempt_id else '') +
                                (' ORDER BY CASE WHEN state IN (\'confirmed_changed\',\'confirmed_noop\',\'confirmed_legacy\') THEN 1 ELSE 0 END, created DESC LIMIT 200'
                                 if unresolved_first else ' ORDER BY created DESC LIMIT 200'),
                                (self.service, attempt_id) if attempt_id else (self.service,)).fetchall()
        result = []
        for row in rows:
            item = dict(row)
            for key in ('review_token', 'review_context', 'review_until'): item.pop(key, None)
            item['receipt'] = json.loads(item['receipt'] or '{}')
            item['options'] = json.loads(item['options'])
            with self.connection() as conn:
                item['review_history'] = [dict(x) for x in conn.execute(
                    'SELECT action,at FROM review_audit WHERE attempt=? ORDER BY id', (item['id'],))]
                item['plex_phases'] = [dict(x) for x in conn.execute(
                    'SELECT node,plex_id,state,updated FROM plex_phases WHERE service=? AND kind=? AND category=? AND code=?',
                    (self.service, item['kind'], item['category'], item['code']))]
            result.append(item)
        return result

    def claim(self, descriptor, run_id, approval_tokens=()):
        d = descriptor
        with self.connection() as conn:
            # Unresolved person aliases cannot safely be assumed to be different persons.
            rows = conn.execute('SELECT * FROM attempts WHERE service=? AND kind=? AND '
                                '(category=? OR category=\'UNRESOLVED\' OR ?=\'UNRESOLVED\') ORDER BY created DESC',
                                (self.service, d['kind'], d['category'], d['category'])).fetchall()
            parent = None
            for row in rows:
                if row['category'] == 'UNRESOLVED' and row['state'] not in self.confirmed:
                    raise FfWriteBlocked(row['state'], row['id'])
            # A confirmed identical receipt needs no network; another person's uncertainty
            # must not prevent reusing it before reaching that person's own review gate.
            exact = [row for row in rows if row['code'].casefold() == d['code'].casefold()
                     and (d['kind'] == 'person' or row['code'] == d['code'])]
            if d['operation'] != 'person_get_detailed' and exact and exact[0]['state'] in self.confirmed and exact[0]['operation'] == d['operation'] and exact[0]['fingerprint'] == d['fingerprint']:
                row = exact[0]
                has_approval = row['approved'] and any(row['review_token'] == hashlib.sha256(str(t).encode()).hexdigest() for t in approval_tokens)
                if has_approval and row['review_until'] < time.time(): raise FfWriteBlocked('stale_approval', row['id'])
                if not has_approval: return dict(row), True
            for row in rows:
                same = (row['code'] == d['code'] if d['kind'] == 'item' else
                        d['code'].casefold() in (row['code'].casefold(), (row['canonical'] or '').casefold()))
                same = same or row['category'] == 'UNRESOLVED' or d['category'] == 'UNRESOLVED'
                unresolved = row['state'] not in self.confirmed
                approved = (same and row['approved'] and not row['approval_used'] and
                            row['node'] == self.node and
                            row['review_until'] > time.time() and row['fingerprint'] == d['fingerprint'] and
                            any(row['review_token'] == hashlib.sha256(str(token).encode()).hexdigest()
                                for token in approval_tokens))
                if approved:
                    parent = row['id']
                    conn.execute('UPDATE attempts SET approval_used=1 WHERE id=?', (parent,))
                    conn.execute('INSERT INTO review_audit(attempt,action,at) VALUES (?,?,?)', (parent, 'consumed', time.time()))
                    continue
                if (same and d['kind'] == 'person' and row['code'].casefold() != d['code'].casefold()
                        and row['canonical'] and row['state'] in self.confirmed):
                    if d['operation'] == 'person_get_detailed': continue
                    if row['operation'] == d['operation'] and json.loads(row['options']) == d['options']:
                        return dict(row), True
                    raise FfWriteBlocked('canonical_alias_requires_review', row['id'])
                if unresolved and (same or d['kind'] == 'person'):
                    # An older attempt explicitly superseded by an approved successor stays evidence.
                    if conn.execute('SELECT 1 FROM attempts WHERE parent=?', (row['id'],)).fetchone(): continue
                    raise FfWriteBlocked(row['state'], row['id'])
                if same and row['operation'] == d['operation'] and row['fingerprint'] == d['fingerprint']:
                    if row['state'] in self.confirmed and not parent and d['operation'] != 'person_get_detailed': return dict(row), True
            now = time.time()
            attempt = uuid.uuid4().hex
            conn.execute('''INSERT INTO attempts
                (id,service,node,kind,category,code,operation,fingerprint,options,run_id,state,created,updated,parent)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)''',
                (attempt, self.service, self.node, d['kind'], d['category'], d['code'], d['operation'],
                 d['fingerprint'], json.dumps(d['options']), str(run_id or '')[:80], 'prepared', now, now, parent))
            return {'id': attempt, 'parent': parent}, False

    def revalidate_retry(self, attempt):
        # claim has already consumed the approval and committed the linked intent.
        # Release the journal lock before current FF/Plex reads.
        with self.connection() as conn:
            parent = conn.execute('SELECT * FROM attempts WHERE id=? AND service=?',
                                  (attempt['parent'], self.service)).fetchone()
            parent = dict(parent) if parent else None
        try:
            if parent is None: raise FfWriteBlocked('stale_approval_context')
            context = ff_review_context(self.config, parent)
            digest = hashlib.sha256(json.dumps(context, sort_keys=True).encode()).hexdigest()
            if digest != parent['review_context'] or parent['review_until'] < time.time():
                raise FfWriteBlocked('stale_approval_context')
        except Exception:
            with self.connection() as conn:
                conn.execute('INSERT INTO review_audit(attempt,action,at) VALUES (?,?,?)',
                             (attempt['parent'], 'revalidation_failed', time.time()))
            raise FfWriteBlocked('stale_approval_context', attempt['id']) from None

    def finish(self, attempt, state, status=None, receipt=None):
        safe = ff_safe_summary(receipt, (self.config.get('mate_apikey'), self.config.get('plex_token')))
        canonical = safe.get('person_idx')
        if not isinstance(canonical, str) or not re.fullmatch(r'[\w.:-]{1,160}', canonical): canonical = None
        with self.connection() as conn:
            conn.execute('UPDATE attempts SET state=?,http=?,receipt=?,canonical=?,updated=? WHERE id=? AND service=?',
                         (state, status, json.dumps(safe), canonical, time.time(), attempt, self.service))

    def plex_phase(self, category, code, state, plex_id='', persons=()):
        with self.connection() as conn:
            conn.execute('UPDATE attempts SET plex_state=?,updated=? WHERE service=? AND kind=\'item\' AND category=? AND code=?',
                         (state, time.time(), self.service, category, code))
            targets = [('item', category, code)] + [('person', domain, person) for domain, person in persons]
            for kind, cat, target in targets:
                conn.execute('INSERT OR REPLACE INTO plex_phases VALUES (?,?,?,?,?,?,?,?)',
                             (self.service, self.node, plex_id, kind, cat, target, state, time.time()))

    def review(self, attempt, context, token=None):
        """A short-lived approval bound to the latest immutable request and fresh read context."""
        digest = hashlib.sha256(json.dumps(context, sort_keys=True).encode()).hexdigest()
        with self.connection() as conn:
            row = conn.execute('SELECT * FROM attempts WHERE service=? AND id=?', (self.service, attempt)).fetchone()
            if not row: raise FfWriteBlocked('not_found')
            if row['node'] != self.node: raise FfWriteBlocked('review_on_original_node', attempt)
            latest = conn.execute('SELECT id FROM attempts WHERE service=? AND kind=? AND category=? AND code=? ORDER BY created DESC LIMIT 1',
                                  (self.service, row['kind'], row['category'], row['code'])).fetchone()
            if latest['id'] != attempt: raise FfWriteBlocked('stale_review', attempt)
            if token is None:
                challenge = uuid.uuid4().hex
                conn.execute('UPDATE attempts SET review_token=?,review_until=?,review_context=?,approved=NULL WHERE id=?',
                             (hashlib.sha256(challenge.encode()).hexdigest(), time.time() + 120, digest, attempt))
                conn.execute('INSERT INTO review_audit(attempt,action,at,context_digest) VALUES (?,?,?,?)',
                             (attempt, 'reviewed', time.time(), digest))
                return challenge
            if (not row['review_token'] or row['review_token'] != hashlib.sha256(str(token).encode()).hexdigest() or
                    row['review_until'] < time.time() or row['review_context'] != digest or row['approved']):
                raise FfWriteBlocked('stale_review', attempt)
            conn.execute('UPDATE attempts SET approved=? WHERE id=?', (time.time(), attempt))
            conn.execute('INSERT INTO review_audit(attempt,action,at,context_digest) VALUES (?,?,?,?)',
                         (attempt, 'approved', time.time(), digest))
            return True


def guarded_ff_write(config, endpoint, payload, transport, run_id=None, cancelled=None):
    descriptor = ff_write_descriptor(endpoint, payload)
    if descriptor is None: return transport()
    if descriptor['kind'] == 'person' and endpoint != 'api/meta_db/person_image_sync' and (
            descriptor['category'] == 'UNRESOLVED' or descriptor['code'].isdigit()):
        # Legacy modal commands use numeric row IDs. Resolve their actual person target
        # through the existing read API rather than mixing those IDs with person_idx.
        domains = ('JAV', 'WESTERN') if descriptor['category'] == 'UNRESOLVED' else (descriptor['category'],)
        matches = []
        for domain in domains:
            try:
                person = ff_find_person(config, descriptor['code'], domain)
                if (isinstance(person, dict) and person.get('domain') == domain and
                        isinstance(person.get('person_idx'), str) and person['person_idx']):
                    matches.append(person)
            except FfWriteBlocked: pass
        if len(matches) != 1: raise FfWriteBlocked('ambiguous_legacy_person')
        descriptor['category'], descriptor['code'] = matches[0]['domain'], matches[0]['person_idx']
    if descriptor['category'] == 'UNRESOLVED':
        raise FfWriteBlocked('unresolved_target')
    task = getattr(_FF_WRITE_CONTEXT, 'task', None)
    if task:
        cancelled = cancelled or task.is_cancelled
        run_id = run_id or task.run_id
    if cancelled and cancelled(): raise FfWriteBlocked('cancelled')
    journal = FfWriteJournal(config)
    tokens = payload.get('_pmh_review_tokens', [])
    if task:
        saved = task.load().get('task_data') or {}
        # Cron must never consume a human's one-shot manual retry approval.
        tokens = [] if saved.get('_is_cron') and not getattr(_FF_WRITE_CONTEXT, 'manual_request', False) else saved.get('_ff_review_tokens', [])
    if not isinstance(tokens, list): tokens = []
    attempt, reused = journal.claim(descriptor, run_id, tokens[:20])
    if reused:
        result = json.loads(attempt['receipt'] or '{}')
        if descriptor['kind'] == 'person':
            result['_pmh_reused_for'] = descriptor['code']
        return attempt['http'], result
    try:
        if attempt.get('parent'):
            journal.revalidate_retry(attempt)
        else:
            ff_require_writable(config, descriptor)
    except FfWriteBlocked as exc:
        journal.finish(attempt['id'], 'blocked_config', receipt={'error_code': exc.state})
        raise FfWriteBlocked(exc.state, attempt['id']) from None
    # Both commits must succeed before the transport can be invoked.
    journal.finish(attempt['id'], 'sending')
    try:
        if cancelled and cancelled():
            journal.finish(attempt['id'], 'needs_review')
            raise FfWriteBlocked('cancelled', attempt['id'])
        status, result = transport()
    except FfWriteBlocked: raise
    except Exception:
        journal.finish(attempt['id'], 'unknown')
        raise FfWriteBlocked('unknown', attempt['id']) from None
    state = ff_outcome(status, result, descriptor)
    journal.finish(attempt['id'], state, status, result)
    if state not in journal.confirmed:
        raise FfWriteBlocked(state, attempt['id'], status, ff_safe_summary(result, (config.get('mate_apikey'),)))
    return status, result


def cache_query_context(tool_id, values):
    common = {'target_sections': [], 'filter_include': '', 'filter_exclude': '',
              'fixed_filter_include': '', 'fixed_filter_exclude': '', 'fixed_filter_cron_only': False}
    defaults = {
        'batch_scanner': dict(common, mode='refresh', scan_depth=1, filter_fields=['guid'],
                              fixed_filter_fields=['guid'], opt_smart_refresh=False, opt_smart_match=False),
        'smart_scanner': dict(common, filter_fields=['guid', 'title'], fixed_filter_fields=['guid', 'title'],
                              opt_yaml_marker_vfs=False, opt_analyze=True, opt_match=True, opt_refresh=True,
                              opt_yaml_season=True, opt_yaml_marker=True, opt_analyze_audio=True),
        'av_manager': dict(common, scan_mode='mismatch', filter_fields=['guid', 'title'],
                           fixed_filter_fields=['title', 'path'], image_web_url=''),
        'multipath_finder': {'target_sections': []},
        'library_stats': {'target_sections': [], 'type_movie': True, 'type_show': True,
                          'type_music': False, 'type_photo': False},
    }.get(tool_id)
    if defaults is None:
        return {k: values[k] for k in ('mode', 'scan_mode', 'target_sections', 'filter_include',
                'filter_exclude', 'filter_fields', 'fixed_filter_fields', 'fixed_filter_include',
                'fixed_filter_exclude', 'fixed_filter_cron_only', 'scan_depth', 'opt_analyze_audio') if k in values}
    context = {key: values.get(key, default) for key, default in defaults.items()}
    if 'image_web_url' in context:
        context['image_web_url'] = hashlib.sha256(str(context['image_web_url']).encode()).hexdigest()
    if context.get('fixed_filter_cron_only'):
        context['cron_filters_applied'] = bool(values.get('_is_cron'))
    return context


def cache_source_fingerprint(config):
    config = dict(config or {})
    config['plex_db_path'] = config.get('plex_db_path')
    config['plex_url'] = config.get('plex_url') or ''
    config['plex_sqlite_bin'] = config.get('plex_sqlite_bin') or '/usr/lib/plexmediaserver/Plex SQLite'
    # Manual dispatch adds these convenience aliases; they do not change the source.
    config.pop('PLEX_URL', None)
    config.pop('PLEX_TOKEN', None)
    def public(value):
        if isinstance(value, dict):
            return {k: public(v) for k, v in value.items() if not re.search(
                r'(?i)key|token|password|signature|secret|^_', str(k))}
        if isinstance(value, (list, tuple)): return [public(v) for v in value]
        return value if value is None or isinstance(value, (str, int, float, bool)) else None
    return hashlib.sha256(json.dumps(public(config), sort_keys=True).encode()).hexdigest()


def cache_resume_allowed(cache, saved_task, request, *, scheduled=False):
    saved = (saved_task or {}).get('task_data') or {}
    metadata = cache.load_dashboard() or {}
    return bool(saved_task and saved_task.get('state') in ('cancelled', 'error') and
                saved.get('action_type') == 'execute' and saved.get('_cache_revision') and
                saved['_cache_revision'] == metadata.get('cache_revision') and
                (scheduled or request.get('_cache_revision') == saved['_cache_revision']) and
                (not getattr(cache, 'source_fingerprint', None) or
                 metadata.get('cache_source') == cache.source_fingerprint) and
                saved_task.get('progress', 0) < saved_task.get('total', 0) and
                all(cache_query_context(cache.tool_id, request).get(key) == value
                    for key, value in metadata.get('cache_context', {}).items()))


class CoreDataManager:
    def __init__(self, base_dir, tool_id, server_id="default", task_mgr=None, source_config=None):
        self.tool_id = tool_id
        self.source_fingerprint = cache_source_fingerprint(source_config) if source_config is not None else None
        self.db_file = os.path.join(base_dir, 'task_logs', f"{tool_id}_{server_id}_cache.db")
        self.task_mgr = task_mgr
        self.cache_revision = None
        os.makedirs(os.path.dirname(self.db_file), exist_ok=True)
        self._lock = storage_lock(self.db_file)


    @contextmanager
    def _get_conn(self):
        conn = sqlite3.connect(self.db_file, timeout=10.0)
        conn.row_factory = sqlite3.Row
        try:
            conn.execute("PRAGMA journal_mode=WAL;")
            conn.execute("PRAGMA synchronous=NORMAL;")
            conn.execute('BEGIN')
            self._validate_generation(conn)
            yield conn
            conn.commit()
        except BaseException:
            try: conn.rollback()
            except Exception: logger.exception('Cache rollback failed')
            raise
        finally:
            conn.close()


    def reset_db(self):
        with self._lock:
            if os.path.exists(self.db_file):
                with self._get_conn() as conn:
                    conn.execute('DROP TABLE IF EXISTS data')
                    conn.execute('DROP TABLE IF EXISTS meta')
                self.cache_revision = None

    @contextmanager
    def read_session(self):
        with self._lock:
            if not os.path.isfile(self.db_file):
                raise FileNotFoundError(self.db_file)
            with self._get_conn() as conn:
                yield conn


    @contextmanager
    def transaction_session(self):
        with self._lock:
            conn = sqlite3.connect(self.db_file, timeout=10.0)
            try:
                conn.execute("PRAGMA journal_mode=WAL;")
                conn.execute("PRAGMA synchronous=NORMAL;")
                conn.execute("BEGIN IMMEDIATE;")
                self._validate_generation(conn)
                yield conn
                conn.commit()
            except Exception as e:
                conn.rollback()
                raise e
            finally:
                conn.close()

    def _validate_generation(self, conn):
        task = self.task_mgr
        if task and hasattr(task, 'is_current') and not task.is_current():
            raise RuntimeError('Stale task run cannot change cache')
        if self.cache_revision is not None:
            row = conn.execute('SELECT payload FROM meta LIMIT 1').fetchone()
            if not row or json.loads(row[0]).get('cache_revision') != self.cache_revision:
                raise RuntimeError('Cache revision conflict; preview again')


    def save(self, res_data):
        if self.task_mgr and self.task_mgr.is_cancelled():
            raise RuntimeError('Cancelled preview cannot replace cache')
        with self._lock:
            with self._get_conn() as conn:
                c = conn.cursor()
                c.execute('DROP TABLE IF EXISTS data')
                c.execute('DROP TABLE IF EXISTS meta')
                
                meta_dict = {k: v for k, v in res_data.items() if k != 'data'}
                meta_dict['cache_revision'] = uuid.uuid4().hex
                if self.source_fingerprint:
                    meta_dict['cache_source'] = self.source_fingerprint
                if self.task_mgr:
                    task_data = self.task_mgr.load().get('task_data', {})
                    meta_dict['cache_context'] = cache_query_context(self.tool_id, task_data)
                c.execute("CREATE TABLE meta (payload TEXT)")
                c.execute("INSERT INTO meta (payload) VALUES (?)", (json.dumps(meta_dict, ensure_ascii=False),))
                
                data_list = res_data.get('data')
                if not data_list:
                    c.execute("CREATE TABLE data (pmh_id INTEGER PRIMARY KEY, pmh_status TEXT DEFAULT 'pending')")
                else:
                    default_sort = res_data.get('default_sort')
                    if default_sort:
                        data_list = core_natural_sort(data_list, default_sort)

                    columns = list(data_list[0].keys())
                    if any(not isinstance(col, str) or col in ('pmh_id', 'pmh_status') for col in columns):
                        raise ValueError('Invalid cache columns')
                    escaped_columns = [col.replace(chr(34), chr(34) * 2) for col in columns]
                    col_defs = ", ".join([f'"{col}" TEXT' for col in escaped_columns])
                    c.execute(f"CREATE TABLE data (pmh_id INTEGER PRIMARY KEY AUTOINCREMENT, {col_defs}, pmh_status TEXT DEFAULT 'pending')")
                    c.execute("CREATE INDEX idx_status ON data (pmh_status)")
                
                    if "rating_key" in columns: c.execute('CREATE INDEX idx_rk ON data ("rating_key")')
                    if "id" in columns: c.execute('CREATE INDEX idx_id ON data ("id")')
                
                    col_names = ", ".join([f'"{col}"' for col in escaped_columns])
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
                            buffer.clear()
                
                    if buffer:
                        c.executemany(insert_sql, buffer)
            self.cache_revision = meta_dict['cache_revision']
            if self.task_mgr:
                with CoreTaskManager._TASK_STATES_LOCK:
                    current = CoreTaskManager._TASK_STATES.get(self.task_mgr.task_key, {})
                    if current.get('run_id') == self.task_mgr.run_id:
                        current.get('task_data', {})['_cache_revision'] = self.cache_revision


    def load_page(self, page, limit, sort_key=None, sort_dir='asc'):
        page, limit = int(page), int(limit)
        if page < 1 or limit < 1:
            raise ValueError('Invalid page or limit')
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
                    actual_columns = {row[1] for row in c.execute('PRAGMA table_info(data)')}
                    if actual_key not in actual_columns:
                        raise ValueError('Unknown sort column')
                    actual_key = actual_key.replace('"', '""')
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
                            except (json.JSONDecodeError, ValueError): pass
                    data_rows.append(row_dict)
                
                result['data'] = data_rows
                result['total_items'] = total_items
                result['page'] = page
                result['total_pages'] = max(1, (total_items + limit - 1) // limit)
                
                return result


    def _mark_status(self, key_column, keys, status):
        if not keys:
            return []
        changed = []
        with self._lock:
            if not os.path.exists(self.db_file):
                return []
            with self._get_conn() as conn:
                columns = {row[1] for row in conn.execute('PRAGMA table_info(data)')}
                if key_column not in columns:
                    raise ValueError('Unknown cache key column')
                column = '"' + key_column.replace('"', '""') + '"'
                for key in keys:
                    rows = conn.execute(f'SELECT {column} FROM data WHERE {column} = ? AND pmh_status <> ?',
                                        (str(key), status)).fetchall()
                    if rows:
                        conn.execute(f'UPDATE data SET pmh_status = ? WHERE {column} = ?', (status, str(key)))
                        changed.append(str(key))
        if self.task_mgr:
            for key in changed:
                self.task_mgr.push_completed_item(key)
        return changed

    def mark_as_done(self, key_column, key_value):
        return self._mark_status(key_column, [key_value], 'done')

    def mark_as_error(self, key_column, key_value):
        return self._mark_status(key_column, [key_value], 'error')

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
            except Exception as e:
                logger.warning(f"[Core] Dashboard 로드 중 오류: {e}")
            return None


    def mark_keys_as_done(self, key_column, keys_list):
        return self._mark_status(key_column, keys_list, 'done')

    def remove_item_by_pmh_id(self, pmh_id):
        return self._mark_status('pmh_id', [pmh_id], 'done')


# ==============================================================================
# [코어 UI 옵션 캐시 관리자 (Options Manager)]
# ==============================================================================

class CoreOptionsManager:
    # RAM 캐시
    _OPTIONS_MEMORY_CACHE = {}
    _OPTIONS_CACHE_LOCK = threading.Lock()

    def __init__(self, base_dir, tool_id, server_id="default"):
        self.base_dir = base_dir
        self.tool_id = tool_id
        self.server_id = server_id
        self.task_key = f"{tool_id}_{server_id}"
        self.db_file = os.path.join(base_dir, 'task_logs', f"{tool_id}_{server_id}_options.db")
        self.task_key = os.path.realpath(self.db_file)
        os.makedirs(os.path.dirname(self.db_file), exist_ok=True)
        self._lock = storage_lock(self.db_file)


    @contextmanager
    def _get_conn(self):
        conn = sqlite3.connect(self.db_file, timeout=5.0)
        conn.row_factory = sqlite3.Row
        try:
            conn.execute('BEGIN')
            yield conn
            conn.commit()
        except BaseException:
            try: conn.rollback()
            except Exception: logger.exception('Options rollback failed')
            raise
        finally:
            conn.close()


    def load(self, include_target_items=False) -> dict:
        # RAM 메모리 캐시에서 즉시 반환
        with CoreOptionsManager._OPTIONS_CACHE_LOCK:
            if self.task_key in CoreOptionsManager._OPTIONS_MEMORY_CACHE:
                return copy.deepcopy(CoreOptionsManager._OPTIONS_MEMORY_CACHE[self.task_key])

        # 최초 1회만 디스크 파일에서 로드 후 RAM에 캐싱
        with self._lock:
            if not os.path.exists(self.db_file): 
                return {}
            try:
                with self._get_conn() as conn:
                    c = conn.cursor()
                    c.execute("SELECT count(name) FROM sqlite_master WHERE type='table' AND name='options'")
                    if c.fetchone()[0] == 0: 
                        return {}
                    c.execute("SELECT payload FROM options LIMIT 1")
                    row = c.fetchone()
                    if row and row[0]:
                        parsed = json.loads(row[0])
                        result = parsed if isinstance(parsed, dict) else {}
                        with CoreOptionsManager._OPTIONS_CACHE_LOCK:
                            CoreOptionsManager._OPTIONS_MEMORY_CACHE[self.task_key] = result
                        return copy.deepcopy(result)
            except Exception as e:
                logger.debug(f"[OptionsManager] 로드 실패: {e}")
                raise
            return {}


    def save(self, data):
        if not isinstance(data, dict):
            raise ValueError('Options must be an object')
        payload = json.dumps(data, ensure_ascii=False, allow_nan=False)
        snapshot = json.loads(payload)
        with self._lock:
            with self._get_conn() as conn:
                conn.execute("CREATE TABLE IF NOT EXISTS options (payload TEXT)")
                conn.execute("DELETE FROM options")
                conn.execute("INSERT INTO options (payload) VALUES (?)", (payload,))
            with CoreOptionsManager._OPTIONS_CACHE_LOCK:
                try:
                    CoreOptionsManager._OPTIONS_MEMORY_CACHE[self.task_key] = snapshot
                except BaseException:
                    CoreOptionsManager._OPTIONS_MEMORY_CACHE.pop(self.task_key, None)
                    raise

    def update(self, values):
        with self._lock:
            current = self.load()
            current.update(values)
            self.save(current)
            return current


    def reset(self):
        with self._lock:
            if os.path.exists(self.db_file):
                with self._get_conn() as conn:
                    conn.execute('DROP TABLE IF EXISTS options')
            with CoreOptionsManager._OPTIONS_CACHE_LOCK:
                CoreOptionsManager._OPTIONS_MEMORY_CACHE.pop(self.task_key, None)


def _core_worker_runner(module, task_data, core_api, start_progress, tool_id, server_id="default", manual_request=False):
    threading.current_thread().name = f"Worker_{tool_id}_{server_id}"
    
    tool_lock = get_tool_lock(tool_id, server_id)
    
    failed = False
    _FF_WRITE_CONTEXT.task = core_api['task']
    _FF_WRITE_CONTEXT.manual_request = manual_request
    try:
        if hasattr(module, 'worker'): 
            module.worker(task_data, core_api, start_progress)
        else:
            core_api['task'].log("오류: 툴에 worker 함수가 구현되어 있지 않습니다.")
            core_api['task'].update_state('error')
    except Exception as e:
        failed = True
        import traceback
        core_api['task'].log(f"[System Error] 작업 중 치명적 오류 발생: {str(e)}")
        logger.error(traceback.format_exc())
        core_api['task'].update_state('error')
    finally:
        _FF_WRITE_CONTEXT.task = None
        _FF_WRITE_CONTEXT.manual_request = False
        core_api['task'].finish(failed)
        try:
            tool_lock.release()
        except RuntimeError: pass


# ==============================================================================
# [Universal Plex Database Engine (SQLite3 / PostgreSQL Dual Engine)]
# ==============================================================================

def bind_sqlite_cli(query, params):
    """Bind only placeholders in SQL code, never values, strings or comments."""
    def literal(value):
        if value is None: return 'NULL'
        if isinstance(value, bool): return '1' if value else '0'
        if isinstance(value, int): return str(value)
        if isinstance(value, float) and math.isfinite(value): return repr(value)
        if isinstance(value, str) and '\x00' not in value:
            return "'" + value.replace("'", "''") + "'"
        if isinstance(value, bytes): return "X'" + value.hex() + "'"
        raise ValueError('Unsupported SQL parameter type or non-finite value')
    values = iter(params)
    result, i = [], 0
    while i < len(query):
        ch = query[i]
        if query.startswith('--', i):
            end = query.find('\n', i)
            end = len(query) if end < 0 else end
        elif query.startswith('/*', i):
            end = query.find('*/', i + 2)
            if end < 0: raise ValueError('Unterminated SQL comment')
            end += 2
        elif ch in ("'", '"', '`', '['):
            quote = ']' if ch == '[' else ch
            end = i + 1
            while end < len(query):
                if query[end] == quote:
                    end += 1
                    if quote != ']' and end < len(query) and query[end] == quote:
                        end += 1
                        continue
                    break
                end += 1
            else: raise ValueError('Unterminated SQL quoted value')
        elif ch == '?':
            if i + 1 < len(query) and query[i + 1].isdigit():
                raise ValueError('Only anonymous SQL placeholders are supported')
            try: result.append(literal(next(values)))
            except StopIteration: raise ValueError('Not enough SQL parameters') from None
            i += 1
            continue
        else:
            end = i + 1
        result.append(query[i:end])
        i = end
    try: next(values)
    except StopIteration: return ''.join(result)
    raise ValueError('Too many SQL parameters')


class UniversalPlexDatabaseEngine:
    _pg_pool = None
    _pg_pool_lock = threading.Lock()
    _pg_init_error = None


    def __init__(self, global_config):
        self.config = global_config or {}
        self.db_type = str(self.config.get("plex_db_type", "sqlite3")).lower()
        self.sqlite_path = self.config.get("plex_db_path", "")
        self.sqlite_bin = self.config.get("plex_sqlite_bin", "")
        self.pg_config = self.config.get("plex_pg_config", {})
        self.pg_error = UniversalPlexDatabaseEngine._pg_init_error

        if self.db_type == "postgres":
            self._init_pg_pool_safe()


    def _init_pg_pool_safe(self):
        with UniversalPlexDatabaseEngine._pg_pool_lock:
            if UniversalPlexDatabaseEngine._pg_pool is not None:
                return
            
            try:
                import psycopg2
                from psycopg2 import pool
            except ImportError:
                logger.info("📦 PostgreSQL 모듈(psycopg2-binary)이 감지되지 않아 자동 설치를 시작합니다...")
                try:
                    cmd = [sys.executable, "-m", "pip", "install", "psycopg2-binary"]
                    res = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
                    if res.returncode == 0:
                        logger.info("✅ 'psycopg2-binary' 자동 설치 완료!")
                        import psycopg2
                        from psycopg2 import pool
                    else:
                        err_msg = f"psycopg2-binary 설치 실패: {res.stderr[:100]}"
                        UniversalPlexDatabaseEngine._pg_init_error = err_msg
                        self.pg_error = err_msg
                        return
                except Exception as pip_err:
                    err_msg = f"psycopg2-binary 설치 예외: {pip_err}"
                    UniversalPlexDatabaseEngine._pg_init_error = err_msg
                    self.pg_error = err_msg
                    return

            host = self.pg_config.get("HOST", "127.0.0.1")
            port = int(self.pg_config.get("PORT", 5432))
            dbname = self.pg_config.get("DBNAME", "plex")
            user = self.pg_config.get("USER", "plex")
            password = self.pg_config.get("PASSWORD", "")
            schema = str(self.pg_config.get("SCHEMA", "plex")).strip() or "plex"

            logger.info(f"🐘 PostgreSQL 커넥션 풀 초기화 시도... (Host: {host}, DB: {dbname}, Schema: {schema})")
            
            try:
                UniversalPlexDatabaseEngine._pg_pool = pool.ThreadedConnectionPool(
                    minconn=1,
                    maxconn=10,
                    host=host,
                    port=port,
                    dbname=dbname,
                    user=user,
                    password=password,
                    options=f"-c search_path={schema}"
                )
                UniversalPlexDatabaseEngine._pg_init_error = None
                self.pg_error = None
                logger.info("🐘 PostgreSQL 커넥션 풀 연결 성공!")
            except Exception as conn_err:
                err_msg = f"{conn_err}".strip().replace("\n", " ")
                logger.error(f"❌ PostgreSQL 연결 실패: {err_msg}")
                logger.warning("   ⚠️ PMH 웹서버는 안전 모드로 계속 실행됩니다. 브라우저 설정에서 YAML을 수정하세요.")
                UniversalPlexDatabaseEngine._pg_init_error = err_msg
                self.pg_error = err_msg


    @classmethod
    def close_pool(cls):
        """서버 리로드 시 커넥션 풀 및 에러 상태 초기화"""
        with cls._pg_pool_lock:
            if cls._pg_pool is not None:
                try:
                    cls._pg_pool.closeall()
                    logger.info("🐘 기존 PostgreSQL 커넥션 풀을 안전하게 종료했습니다.")
                except Exception: pass
                cls._pg_pool = None
            cls._pg_init_error = None


    @contextmanager
    def get_cursor(self):
        """커서 요청 시에만 지연 에러 발생 (웹서버 라우팅 보호)"""
        if self.db_type == "postgres":
            if UniversalPlexDatabaseEngine._pg_pool is None:
                err = self.pg_error or UniversalPlexDatabaseEngine._pg_init_error or "DB 연결 실패"
                raise ConnectionError(f"PostgreSQL 연결 불가: {err}. pmh_config.yaml 설정을 확인하세요.")

            from psycopg2.extras import DictCursor
            conn = UniversalPlexDatabaseEngine._pg_pool.getconn()
            try:
                with conn.cursor(cursor_factory=DictCursor) as cur:
                    yield cur
                conn.commit()
            except Exception as e:
                conn.rollback()
                raise e
            finally:
                UniversalPlexDatabaseEngine._pg_pool.putconn(conn)
        else:
            if not os.path.exists(self.sqlite_path):
                raise FileNotFoundError(f"Plex DB 파일을 찾을 수 없습니다: {self.sqlite_path}")
            conn = sqlite3.connect(f'file:{self.sqlite_path}?mode=ro', uri=True, timeout=10.0, isolation_level=None)
            conn.row_factory = sqlite3.Row
            cur = conn.cursor()
            try: yield cur
            finally: cur.close(); conn.close()


    def translate_query(self, query):
        """SQLite 쿼리를 PostgreSQL 표준 SQL로 자동 번역"""
        if self.db_type == "postgres":
            q = query
            # 1. 파라미터 기호 치환 (? -> %s)
            q = q.replace('?', '%s')
            # 2. group_concat -> string_agg 치환
            q = re.sub(r'(?i)group_concat\((.*?),\s*(\'.*?\')\)', r'string_agg(\1, \2)', q)
            # 3. IFNULL -> COALESCE 치환
            q = re.sub(r'(?i)\bIFNULL\b', 'COALESCE', q)
            # 4. LIKE -> ILIKE 치환 (대소문자 무시 호환)
            q = re.sub(r'(?i)\bLIKE\b', 'ILIKE', q)
            # 5. LIMIT -1 OFFSET X -> OFFSET X 치환 (SQLite 전용 LIMIT -1 보정)
            q = re.sub(r'(?i)\bLIMIT\s+-1\s+OFFSET\s+', 'OFFSET ', q)
            # 6. DATETIME('now') / DATE('now') 시간 함수 치환
            q = re.sub(r"(?i)\bDATETIME\s*\(\s*'now'\s*\)", "CURRENT_TIMESTAMP", q)
            q = re.sub(r"(?i)\bDATE\s*\(\s*'now'\s*\)", "CURRENT_DATE", q)
            # 7. INSTR(str, substr) -> POSITION(substr IN str) 치환
            q = re.sub(r"(?i)\bINSTR\s*\(\s*([^,]+)\s*,\s*([^)]+)\s*\)", r"POSITION(\2 IN \1)", q)
            return q
        return query


    def query(self, query, params=()):
        """SELECT 전용 스마트 쿼리 인터페이스"""
        if not query.strip().upper().startswith("SELECT"):
            raise ValueError("Security Error: 'query' API는 SELECT 문만 허용합니다.")

        if self.db_type == "postgres":
            sql = self.translate_query(query)
            with self.get_cursor() as cur:
                cur.execute(sql, params)
                return [dict(row) for row in cur.fetchall()]
        else:
            try:
                with self.get_cursor() as cur:
                    cur.execute(query, params)
                    return [dict(row) for row in cur.fetchall()]
            except sqlite3.OperationalError as exc:
                message = str(exc).lower()
                if not ('no such collation sequence:' in message and
                        any(name in message for name in ('icu', 'natural'))):
                    raise
                return self._run_sqlite_cli(query, params, is_select=True)


    def execute(self, query, params=()):
        """UPDATE / INSERT / DELETE 전용 쓰기 인터페이스"""
        if self.db_type == "postgres":
            sql = self.translate_query(query)
            with self.get_cursor() as cur:
                cur.execute(sql, params)
            return True, "PG Execute Success"
        else:
            return self._run_sqlite_cli(query, params, is_select=False)


    def _run_sqlite_cli(self, query, params=(), is_select=False):
        if not self.sqlite_bin or not os.path.exists(self.sqlite_bin):
            raise FileNotFoundError(f"Plex SQLite 바이너리를 찾을 수 없습니다: {self.sqlite_bin}")

        if not os.path.isfile(self.sqlite_path):
            raise FileNotFoundError(self.sqlite_path)
        formatted_query = bind_sqlite_cli(query, params)
        final_script = f"{formatted_query};\n" if is_select else f"BEGIN IMMEDIATE;\n{formatted_query};\nCOMMIT;\n"
        cmd = [self.sqlite_bin, '-noinit', '-batch', '-bail', '-ifexists']
        if is_select: cmd += ['-readonly', '-json']
        cmd.append(self.sqlite_path)
        try:
            result = subprocess.run(cmd, input=final_script.encode('utf-8'), capture_output=True, check=True, timeout=15)
            output = result.stdout.decode('utf-8').strip()
            if is_select:
                if not output: return []
                rows = json.loads(output)
                if not isinstance(rows, list) or any(not isinstance(row, dict) for row in rows):
                    raise ValueError('Invalid Plex SQLite JSON result')
                return rows
            return True, output
        except subprocess.TimeoutExpired:
            raise Exception("Plex SQLite 실행 시간 초과. 쓰기 요청은 반영 여부가 불명확하므로 자동 재실행하지 마세요.")
        except subprocess.CalledProcessError as e:
            raise Exception(f"Plex SQLite 실행 실패: {e.stderr.decode('utf-8')}")


# ==============================================================================
# [Universal Meta Database Engine (외부 메타데이터 PostgreSQL 범용 엔진)]
# ==============================================================================

class UniversalMetaDatabaseEngine:
    """특정 비즈니스 로직 없이 도구가 요청한 임의의 SQL을 안전하게 풀링/실행하는 범용 메타 DB 엔진"""
    _pool = None
    _pool_config = None
    _pool_borrowers = 0
    _pool_lock = threading.Lock()
    _init_error = None

    def __init__(self, global_config):
        self.config = global_config or {}
        self.db_type = str(self.config.get("meta_db_type", "none")).lower()
        self.pg_config = self.config.get("meta_pg_config", {})
        self.pool_config = hashlib.sha256(json.dumps(self.pg_config, sort_keys=True).encode()).hexdigest()
        self.pg_error = UniversalMetaDatabaseEngine._init_error

        if self.db_type == "postgres":
            self._init_pool_safe()

    def _init_pool_safe(self):
        with UniversalMetaDatabaseEngine._pool_lock:
            if UniversalMetaDatabaseEngine._pool is not None:
                if UniversalMetaDatabaseEngine._pool_config != self.pool_config:
                    self.pg_error = 'Meta DB pool configuration differs; reload after active work finishes'
                return

            try:
                import psycopg2
                from psycopg2 import pool
            except ImportError:
                logger.info("📦 PostgreSQL 모듈(psycopg2-binary)이 감지되지 않아 자동 설치를 시작합니다...")
                try:
                    cmd = [sys.executable, "-m", "pip", "install", "psycopg2-binary"]
                    res = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
                    if res.returncode == 0:
                        logger.info("✅ 'psycopg2-binary' 자동 설치 완료!")
                        import psycopg2
                        from psycopg2 import pool
                    else:
                        err_msg = f"psycopg2-binary 설치 실패: {res.stderr[:100]}"
                        UniversalMetaDatabaseEngine._init_error = err_msg
                        self.pg_error = err_msg
                        return
                except Exception as pip_err:
                    err_msg = f"psycopg2-binary 설치 예외: {pip_err}"
                    UniversalMetaDatabaseEngine._init_error = err_msg
                    self.pg_error = err_msg
                    return

            host = self.pg_config.get("HOST", "127.0.0.1")
            port = int(self.pg_config.get("PORT", 5432))
            dbname = self.pg_config.get("DBNAME", "metadata")
            user = self.pg_config.get("USER", "metadata")
            password = self.pg_config.get("PASSWORD", "")
            schema = str(self.pg_config.get("SCHEMA", "public")).strip() or "public"

            logger.info(f"🐘 [MetaDB Engine] 외부 메타 PostgreSQL 커넥션 풀 초기화 시도... (Host: {host}:{port}, DB: {dbname}, Schema: {schema})")

            try:
                connect_args = {"connect_timeout": 10, "options": f"-c search_path={schema}"}
                if host.startswith('/'):
                    connect_args["host"] = host
                    UniversalMetaDatabaseEngine._pool = pool.ThreadedConnectionPool(
                        minconn=1, maxconn=10, dbname=dbname, user=user, password=password, **connect_args
                    )
                else:
                    UniversalMetaDatabaseEngine._pool = pool.ThreadedConnectionPool(
                        minconn=1, maxconn=10, host=host, port=port, dbname=dbname, user=user, password=password, **connect_args
                    )
                UniversalMetaDatabaseEngine._init_error = None
                UniversalMetaDatabaseEngine._pool_config = self.pool_config
                self.pg_error = None
                logger.info("🐘 [MetaDB Engine] 외부 메타 PostgreSQL 커넥션 풀 연결 성공!")
            except Exception as conn_err:
                err_msg = f"{conn_err}".strip().replace("\n", " ")
                logger.error(f"❌ [MetaDB Engine] 외부 메타 PostgreSQL 연결 실패: {err_msg}")
                UniversalMetaDatabaseEngine._init_error = err_msg
                self.pg_error = err_msg

    @classmethod
    def close_pool(cls):
        """서버 리로드 시 커넥션 풀 및 에러 상태 초기화"""
        with cls._pool_lock:
            if cls._pool_borrowers:
                raise RuntimeError('Meta DB connections are still in use; reload refused')
            if cls._pool is not None:
                try:
                    cls._pool.closeall()
                    logger.info("🐘 [MetaDB Engine] 기존 외부 메타 PostgreSQL 커넥션 풀을 안전하게 종료했습니다.")
                except Exception: pass
                cls._pool = None
            cls._pool_config = None
            cls._init_error = None

    def is_enabled(self):
        """메타 DB가 활성화되어 있고 커넥션 풀이 건강한지 확인"""
        return (self.db_type == "postgres" and UniversalMetaDatabaseEngine._pool is not None and not self.pg_error
                and UniversalMetaDatabaseEngine._pool_config == self.pool_config)

    def test_connection(self):
        """PostgreSQL 메타 DB 연결 상태를 실제 SELECT 1 쿼리로 검증하고 (성공여부, 메시지) 반환"""
        if self.db_type != "postgres":
            return False, "META_DB_TYPE이 postgres로 설정되지 않았습니다."
        if not UniversalMetaDatabaseEngine._pool:
            self._init_pool_safe()
        if self.pg_error:
            return False, f"연결 풀 생성 실패: {self.pg_error}"
        try:
            with self.get_cursor() as cur:
                cur.execute("SELECT 1;")
            return True, "PostgreSQL 메타 DB 연결 정상 확인"
        except Exception as e:
            err_msg = str(e).strip().replace("\n", " ")
            return False, f"연결 질의 실패: {err_msg}"

    @contextmanager
    def get_cursor(self):
        """스레드 세이프 커서 획득 컨텍스트 매니저 (결과를 Dict 형태로 자동 매핑)"""
        if not self.is_enabled():
            err = self.pg_error or UniversalMetaDatabaseEngine._init_error or "메타 DB가 비활성화되어 있거나 연결되지 않았습니다."
            raise ConnectionError(f"[MetaDB Engine] {err}")

        from psycopg2.extras import DictCursor
        with UniversalMetaDatabaseEngine._pool_lock:
            source_pool = UniversalMetaDatabaseEngine._pool
            if UniversalMetaDatabaseEngine._pool_config != self.pool_config:
                raise RuntimeError('Meta DB pool configuration changed; query refused')
            if source_pool is None:
                raise ConnectionError('Meta DB pool is closed')
            conn = source_pool.getconn()
            UniversalMetaDatabaseEngine._pool_borrowers += 1
        try:
            with conn.cursor(cursor_factory=DictCursor) as cur:
                yield cur
            conn.commit()
        except Exception as e:
            conn.rollback()
            raise e
        finally:
            try:
                source_pool.putconn(conn)
            finally:
                with UniversalMetaDatabaseEngine._pool_lock:
                    UniversalMetaDatabaseEngine._pool_borrowers -= 1

    def query(self, query, params=()):
        """도구가 전달한 임의의 SELECT 문을 실행하고 딕셔너리 리스트로 반환"""
        if not query.strip().upper().startswith("SELECT"):
            raise ValueError("Security Error: 'query' API는 SELECT 문만 허용합니다.")

        with self.get_cursor() as cur:
            cur.execute(query, params)
            return [dict(row) for row in cur.fetchall()]

    def execute(self, query, params=()):
        """필요 시 도구가 전달한 쓰기 SQL 실행"""
        with self.get_cursor() as cur:
            cur.execute(query, params)
        return True, "Meta DB Execute Success"


def lookup_meta_db_cast(global_config, code, category):
    """Small read-only projection for detail shortcuts; FF still owns person editing."""
    category = str(category or '').strip().upper()
    code = str(code or '').strip()
    if category not in ('JAV_CEN', 'JAV_UNCEN', 'WESTERN') or not code or len(code) > 100:
        return {'ret': 'error', 'error_code': 'invalid_request'}, 400
    unavailable = {'ret': 'unavailable', 'source': 'meta_db', 'code': code, 'category': category}
    if str(global_config.get('meta_db_type', 'none')).lower() != 'postgres':
        return dict(unavailable, reason='not_configured'), 200
    try:
        # Avoid installing drivers on the detail-page request path.
        import psycopg2
        engine = UniversalMetaDatabaseEngine(global_config)
        if not engine.is_enabled():
            return dict(unavailable, reason='connection_unavailable'), 200
        with engine.get_cursor() as cursor:
            cursor.execute('SET TRANSACTION READ ONLY')
            cursor.execute("SET LOCAL statement_timeout = '1000ms'")
            cursor.execute("SET LOCAL lock_timeout = '250ms'")
            cursor.execute("SELECT schema_version, migration_state FROM meta_schema_version WHERE schema_name = %s", ('meta_db',))
            status = cursor.fetchone()
            if not status or status['schema_version'] != 1 or status['migration_state'] not in ('complete', 'backfilling'):
                return dict(unavailable, reason='schema_not_ready'), 200
            cursor.execute("""
                SELECT p.person_idx AS actor_idx, p.name_ko, p.name_org, p.name_en
                FROM meta_item i
                JOIN meta_item_person_map m ON m.item_id = i.id
                JOIN meta_person p ON p.id = m.person_id
                WHERE i.code = %s AND i.category = %s AND p.domain = %s
                  AND m.role_type = 'actor'
                  AND p.person_idx IS NOT NULL AND TRIM(p.person_idx) <> ''
                ORDER BY m.sort_order, m.id
                LIMIT 1001
            """, (code, category, 'WESTERN' if category == 'WESTERN' else 'JAV'))
            actors = [dict(row) for row in cursor.fetchall()]
        if not actors or len(actors) > 1000:
            return dict(unavailable, reason='no_usable_relations'), 200
        return {'ret': 'success', 'source': 'meta_db', 'code': code, 'category': category, 'actors': actors}, 200
    except Exception as exc:
        # Connection strings, credentials and raw SQL errors never enter the response/log.
        logger.debug('[Cast] Direct Meta DB lookup unavailable (%s); using FF API fallback.', type(exc).__name__)
        return dict(unavailable, reason='lookup_failed'), 200


def create_db_api(global_config_or_path, sqlite_bin=None):
    if isinstance(global_config_or_path, dict):
        engine = UniversalPlexDatabaseEngine(global_config_or_path)
    else:
        cfg = {"plex_db_type": "sqlite3", "plex_db_path": global_config_or_path, "plex_sqlite_bin": sqlite_bin}
        engine = UniversalPlexDatabaseEngine(cfg)

    return {
        "query": engine.query,
        "execute": engine.execute,
        "engine": engine
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
    # Registry state is authoritative; names are used only for legacy worker admission.
    def active_count():
        with CoreTaskManager._TASK_STATES_LOCK:
            tasks = sum(bool(t.get('worker_active')) for t in CoreTaskManager._TASK_STATES.values())
        media = sum(v.get('state') in ('queued', 'processing') for v in list(MEDIA_ACTION_STATUS.values()))
        with _RUNTIME['lock']:
            requests = _RUNTIME['requests']
        legacy_workers = sum(t.name.startswith('Worker_') and t.is_alive() for t in threading.enumerate())
        return max(tasks, legacy_workers) + media + requests
    count = active_count()
    if not count:
        return True, 0, '진행 중인 작업이 없습니다.'
    if not force_update:
        return False, count, '진행 중인 작업 또는 대기 미디어 작업이 있습니다.'
    with CoreTaskManager._TASK_STATES_LOCK:
        for task in CoreTaskManager._TASK_STATES.values():
            if task.get('worker_active') and task.get('cancel_event'):
                task['cancel_event'].set()
                task['state'] = 'cancelling'
    deadline = time.monotonic() + 15
    while time.monotonic() < deadline:
        count = active_count()
        if not count:
            return True, 0, '모든 작업이 종료되었습니다.'
        time.sleep(0.1)
    return False, count, '종료되지 않은 작업이 있어 업데이트를 중단합니다.'


def begin_maintenance(base_dir, force_update=False):
    with _RUNTIME['lock']:
        if _RUNTIME['maintenance']:
            return False, 0, '다른 업데이트 또는 리로드가 진행 중입니다.'
        _RUNTIME['maintenance'] = True
    try:
        result = check_update_readiness(base_dir, force_update)
    except BaseException:
        end_maintenance()
        raise
    if not result[0]: end_maintenance()
    return result


def end_maintenance():
    with _RUNTIME['lock']:
        _RUNTIME['maintenance'] = False


def dispatch_request(subpath, method, args, data, global_config):
    # Monitoring and cancellation remain available during maintenance.
    observing = (subpath.endswith(('/status', '/stream', '/cancel')) or
                 subpath in ('media/queue_status', 'media/active_queues', 'media/queue_cancel', 'media/queue_stream'))
    if observing:
        return _dispatch_request(subpath, method, args, data, global_config)
    with _RUNTIME['lock']:
        if _RUNTIME['maintenance']:
            return {'status': 'busy', 'message': '업데이트 또는 리로드 준비 중입니다.'}, 409
        _RUNTIME['requests'] += 1
    try:
        return _dispatch_request(subpath, method, args, data, global_config)
    finally:
        with _RUNTIME['lock']:
            _RUNTIME['requests'] -= 1


def _dispatch_request(subpath, method, args, data, global_config):
    base_dir = global_config.get("base_dir")
    db_path = global_config.get("plex_db_path")
    max_batch_size = global_config.get("max_batch_size", 1000)

    tools_dir = os.path.join(base_dir, 'tools')
    os.makedirs(tools_dir, exist_ok=True)

    db_engine = UniversalPlexDatabaseEngine(global_config)

    try:
        if subpath == 'ff_write_journal' and method == 'GET':
            return {'ret': 'success', 'data': FfWriteJournal(global_config).records(args.get('attempt_id'), unresolved_first=True)}, 200

        elif subpath in ('ff_write_journal/review', 'ff_write_journal/approve') and method == 'POST':
            journal = FfWriteJournal(global_config)
            rows = journal.records((data or {}).get('attempt_id'))
            if not rows or not (data or {}).get('attempt_id'):
                return {'ret': 'error', 'msg': '원장 시도를 찾을 수 없습니다.'}, 404
            row = rows[0]
            try:
                context = ff_review_context(global_config, row, db_engine)
                if subpath.endswith('/review'):
                    token = journal.review(row['id'], context)
                    return {'ret': 'success', 'token': token, 'attempt': row, 'context': context,
                            'msg': '현재 참조 조회는 이전 요청의 반영 증명이 아닙니다. 승인 후 동일한 작업을 직접 다시 실행하세요.'}, 200
                if data.get('confirmed') is not True or data.get('fingerprint') != row['fingerprint']:
                    raise FfWriteBlocked('explicit_confirmation_required', row['id'])
                journal.review(row['id'], context, data.get('token') or '')
                return {'ret': 'success', 'msg': '동일 대상·옵션의 다음 수동 실행 1회를 승인했습니다.'}, 200
            except FfWriteBlocked as exc:
                return {'ret': 'error', 'error_code': exc.state, 'msg': str(exc)}, 409

        elif subpath == 'ping' and method == 'GET':
            machine_id = global_config.get("machine_id", "")
            ignore_res = global_config.get("IGNORE_RES_SECTION", "")
            av_img_use = bool(global_config.get("AV_IMAGE_SERVER_USE", False))
            av_img_url = str(global_config.get("AV_IMAGE_SERVER_URL", "")).strip().rstrip('/')
            jav_sec = str(global_config.get("JAV_SECTION", ""))
            west_sec = str(global_config.get("WESTERN_AV_SECTION", ""))
            db_type = global_config.get("plex_db_type", "sqlite3")
            ff_metadb_use = bool(global_config.get("FF_METADB_USE", False))
            ff_ddns = str(global_config.get("FF_DDNS", "")).strip().rstrip('/')
            
            db_ok = True
            db_err_msg = ""
            if db_type == "postgres" and db_engine.pg_error:
                db_ok = False
                db_err_msg = db_engine.pg_error

            return {
                "status": "ok", 
                "version": __version__, 
                "machine_id": machine_id, 
                "db_type": db_type,
                "is_postgres": db_type == "postgres",
                "db_connected": db_ok,
                "db_error": db_err_msg,
                "ignore_res_section": ignore_res,
                "av_image_server_use": av_img_use,
                "av_image_server_url": av_img_url,
                "jav_section": jav_sec,
                "western_av_section": west_sec,
                "ff_metadb_use": ff_metadb_use,
                "ff_ddns": ff_ddns
            }, 200

        elif subpath == 'library/batch' and method == 'POST':
            return handle_library_batch(data, max_batch_size, db_engine)

        elif subpath == 'media/queue_status' and method == 'POST':
            task_ids = data.get('task_ids', [])
            if isinstance(task_ids, str): 
                task_ids = task_ids.split(',')
            
            result = {}
            for tid in task_ids:
                if tid: result[str(tid).strip()] = MEDIA_ACTION_STATUS.get(str(tid).strip(), {'state': 'unknown'})
            return result, 200

        elif subpath == 'media/active_queues' and method == 'GET':
            active_tasks = {}
            now = time.time()
            for k, v in MEDIA_ACTION_STATUS.items():
                if v.get('state') in ['queued', 'processing']:
                    if now - v.get('timestamp', now) < 86400:
                        active_tasks[k] = v
            return active_tasks, 200

        elif subpath == 'media/queue_cancel' and method == 'POST':
            target_task_id = data.get('task_id')
            target_item_id = str(data.get('item_id', '')).strip()

            found_tasks = []
            if target_task_id and target_task_id in MEDIA_ACTION_STATUS:
                found_tasks.append((target_task_id, MEDIA_ACTION_STATUS[target_task_id]))
            elif target_item_id:
                for tid, st in list(MEDIA_ACTION_STATUS.items()):
                    if str(st.get('item_id', '')) == target_item_id and st.get('state') in ['queued', 'processing']:
                        found_tasks.append((tid, st))

            if not found_tasks:
                return {"status": "error", "msg": "취소할 유효한 대기/진행 작업을 찾을 수 없습니다."}, 404

            cancelled_count = 0
            for tid, st in found_tasks:
                st['state'] = 'cancelled'
                st['msg'] = '사용자 취소'
                broadcast_media_event({
                    'task_id': tid,
                    'item_id': str(st.get('item_id', '')),
                    'state': 'cancelled',
                    'msg': '사용자 취소'
                })
                cancelled_count += 1
                logger.info(f"🛑 작업 취소 완료 (Task: {tid}, Item: {st.get('item_id')})")

            return {"status": "success", "msg": f"{cancelled_count}개 작업이 안전하게 취소되었습니다."}, 200

        # 미디어 액션 큐 전용 실시간 SSE 스트리밍 엔드포인트
        elif subpath == 'media/queue_stream' and method == 'GET':
            def generate_media_stream_events():
                listener_q = queue.Queue(maxsize=200)
                with _MEDIA_STREAM_LOCK:
                    _MEDIA_STREAM_LISTENERS.append(listener_q)

                yield ": ping\n\n"

                active_snapshot = []
                for tid, status in list(MEDIA_ACTION_STATUS.items()):
                    if status.get('state') in ['queued', 'processing']:
                        active_snapshot.append({
                            'task_id': tid,
                            'item_id': str(status.get('item_id', '')),
                            'state': status.get('state'),
                            'action': status.get('action', '')
                        })
                if active_snapshot:
                    yield f"data: {json.dumps({'type': 'snapshot', 'tasks': active_snapshot}, ensure_ascii=False)}\n\n"

                idle_ticks = 0
                try:
                    while True:
                        try:
                            event = listener_q.get(timeout=3.0)
                            idle_ticks = 0
                            yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
                        except queue.Empty:
                            idle_ticks += 1
                            if idle_ticks % 5 == 0:
                                yield ": keepalive\n\n"

                            has_active = any(v.get('state') in ['queued', 'processing'] for v in MEDIA_ACTION_STATUS.values())
                            if not has_active and idle_ticks > 10:
                                break
                except GeneratorExit:
                    pass
                finally:
                    with _MEDIA_STREAM_LOCK:
                        if listener_q in _MEDIA_STREAM_LISTENERS:
                            try: _MEDIA_STREAM_LISTENERS.remove(listener_q)
                            except Exception: pass

            resp = Response(
                generate_media_stream_events(),
                mimetype='text/event-stream',
                headers={
                    'Cache-Control': 'no-cache, no-transform',
                    'X-Accel-Buffering': 'no',
                    'Connection': 'keep-alive'
                }
            )
            return resp, 200

        elif subpath.startswith('media/') and method == 'GET':
            rating_key = subpath.split('/')[1]
            return handle_media_detail(rating_key, db_engine)

        elif subpath.startswith('media/') and method == 'POST':
            parts = subpath.split('/')
            if len(parts) >= 3:
                raw_target_ids = parts[1]
                action = parts[2] # match, refresh, analyze, unmatch, yaml_refresh
                item_ids = []
                if data and (data.get('item_ids') or data.get('ids')):
                    raw_body_ids = data.get('item_ids') or data.get('ids')
                    if isinstance(raw_body_ids, str):
                        item_ids = [x.strip() for x in raw_body_ids.split(',') if x.strip()]
                    elif isinstance(raw_body_ids, (list, tuple, set)):
                        item_ids = [str(x).strip() for x in raw_body_ids if str(x).strip()]
                elif ',' in raw_target_ids:
                    item_ids = [x.strip() for x in raw_target_ids.split(',') if x.strip()]
                elif raw_target_ids and raw_target_ids not in ['batch', '0']:
                    item_ids = [raw_target_ids.strip()]

                if not item_ids:
                    return {"error": "대상 아이템 ID가 누락되었습니다."}, 400

                plex_url = global_config.get("plex_url", "")
                plex_token = global_config.get("plex_token", "")
                if not plex_url or not plex_token:
                    plex_url = data.get('_plex_url', '') if data else ''
                    plex_token = data.get('_plex_token', '') if data else ''

                if not plex_url or not plex_token:
                    return {"error": "Plex 접속 정보 누락"}, 400

                now_ts = int(time.time() * 1000)
                tasks_created = []

                for idx, rk in enumerate(item_ids):
                    rk_str = str(rk).strip()
                    if not rk_str: continue

                    task_id = f"task_{rk_str}_{action}_{now_ts}_{idx}"

                    MEDIA_ACTION_STATUS[task_id] = {
                        'state': 'queued', 
                        'item_id': rk_str, 
                        'action': action, 
                        'timestamp': time.time()
                    }

                    MEDIA_ACTION_QUEUE.put({
                        'task_id': task_id,
                        'item_id': rk_str,
                        'action': action,
                        'plex_url': plex_url,
                        'plex_token': plex_token,
                        'data': data or {}
                    })
                    tasks_created.append({'item_id': rk_str, 'task_id': task_id})

                first_task_id = tasks_created[0]['task_id'] if tasks_created else ""
                logger.info(f"📥 미디어 큐 등록 완료 -> Action: {action}, 총 {len(tasks_created)}개 아이템 (1회 요청 처리)")

                return {
                    "status": "queued",
                    "task_id": first_task_id,
                    "tasks": tasks_created,
                    "count": len(tasks_created)
                }, 202

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
            
            logger.info(f"🚀 Plex Mate 중계 요청: {target_url} | Payload: {log_payload}")
            
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
                logger.error(f"FF HTTP Error: {e.code} - {err_body}")
                return {"ret": "error", "msg": f"FF API HTTP 오류 ({e.code})"}, e.code
            except URLError as e:
                logger.error(f"FF Network Error: {e}")
                return {"ret": "error", "msg": f"FF 서버 통신 실패: {str(e)}"}, 502

        elif subpath == 'meta_db/cast' and method == 'GET':
            return lookup_meta_db_cast(global_config, args.get('code'), args.get('category'))

        elif subpath.startswith('ff_metadata/') and method in ['GET', 'POST']:
            ff_url = global_config.get("mate_url")
            ff_apikey = global_config.get("mate_apikey")
            if not ff_url or not ff_apikey:
                logger.error("[FF Relay] ❌ BASE.FF_URL 또는 BASE.FF_APIKEY 설정이 누락되었습니다.")
                return {"ret": "error", "msg": "FF(Plex Mate) 설정 누락"}, 400
            
            sub_endpoint = subpath.replace('ff_metadata/', '', 1)
            try:
                ff_route_kind(sub_endpoint, method, data if method == 'POST' else args)
                # FF form/value handlers may prefer query values to the guarded body.
                # Normal PMH POSTs use body fields; only PMH auth query fields coexist.
                if method == 'POST' and set(args) - {'apikey', 'sig', '_sig'}:
                    raise FfWriteBlocked('relay_input_rejected', status=400)
                if method == 'GET' and data:
                    raise FfWriteBlocked('relay_input_rejected', status=400)
                if hasattr(args, 'getlist') and any(len(args.getlist(k)) != 1 for k in args):
                    raise FfWriteBlocked('relay_input_rejected', status=400)
            except FfWriteBlocked as exc:
                return {'ret': 'error', 'error_code': exc.state,
                        'msg': '허용되지 않거나 충돌하는 FF 릴레이 입력입니다.'}, exc.status or 400
            target_url = f"{ff_url.rstrip('/')}/metadata/{sub_endpoint}"
            
            qs_dict = args.copy()
            qs_dict['apikey'] = ff_apikey
            target_url += f"?{urlencode(qs_dict)}"
            
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 PlexMetaHelper/1.0',
                'X-API-Key': ff_apikey,
                'apikey': ff_apikey
            }
            
            req_data = None
            if method == 'POST':
                body_data = {k: v for k, v in data.items() if not k.startswith('_pmh_')} if isinstance(data, dict) else {}
                body_data['apikey'] = ff_apikey

                if sub_endpoint.startswith('ajax/') or 'command' in body_data:
                    headers['Content-Type'] = 'application/x-www-form-urlencoded'
                    safe_form_data = {k: (v if v is not None else '') for k, v in body_data.items()}
                    req_data = urlencode(safe_form_data).encode('utf-8')
                else:
                    headers['Content-Type'] = 'application/json'
                    req_data = json.dumps(body_data).encode('utf-8')
            
            logger.info('[FF Relay] %s request', method)

            def transport():
                req = Request(target_url, data=req_data, headers=headers, method=method)
                ff_timeout = 300 if ('make_preview_clip' in str(req_data) or 'preview' in sub_endpoint) else 180
                try:
                    with urlopen(req, timeout=ff_timeout) as response:
                        return response.status, json.loads(response.read().decode('utf-8'))
                except HTTPError as exc:
                    try: return exc.code, json.loads(exc.read(1024 * 1024).decode('utf-8'))
                    finally: exc.close()
            try:
                if method == 'POST':
                    status, result = guarded_ff_write(global_config, sub_endpoint, data, transport)
                else:
                    status, result = transport()
                return result, status
            except FfWriteBlocked as exc:
                return {'ret': 'error', 'error_code': exc.state, 'attempt_id': exc.attempt_id,
                        'msg': str(exc)}, 409
            except Exception:
                return {'ret': 'error', 'msg': 'FF 통신 또는 원장 저장 실패. 원격 쓰기 원장을 확인하세요.'}, 502

        elif subpath == 'tools' and method == 'GET':
            installed_tools = get_installed_tools(tools_dir)
            
            global GLOBAL_DASHBOARD_CACHE
            res_data = {
                "tools": installed_tools, 
                "dashboard": {
                    "running": GLOBAL_DASHBOARD_CACHE.get("running", []),
                    "cron": GLOBAL_DASHBOARD_CACHE.get("cron", []),
                    "completed_items": GLOBAL_DASHBOARD_CACHE.get("completed_items", {})
                }
            }
            GLOBAL_DASHBOARD_CACHE["completed_items"] = {}
            return res_data, 200

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
            legacy_ids = tool_info.get('legacy_ids', [])
            if isinstance(legacy_ids, str): legacy_ids = [legacy_ids]

            if not original_id: return {"error": "잘못된 info.yaml 구조입니다. ('id' 필드 누락)"}, 400

            if target_id: safe_tool_id = target_id
            else: safe_tool_id = f"{prefix}_{original_id}" if (prefix and not original_id.startswith(prefix + "_")) else original_id
                
            tool_info['id'] = safe_tool_id
            if not tool_info.get('update_url'): tool_info['update_url'] = yaml_url

            tool_path = os.path.join(tools_dir, safe_tool_id)
            logs_dir = os.path.join(base_dir, 'task_logs')

            if not os.path.exists(tool_path) and legacy_ids:
                all_legacy_candidates = []
                for lid in legacy_ids:
                    all_legacy_candidates.append(lid)
                    if prefix and not lid.startswith(prefix + "_"):
                        all_legacy_candidates.append(f"{prefix}_{lid}")

                for old_id in set(all_legacy_candidates):
                    old_path = os.path.join(tools_dir, old_id)
                    if os.path.exists(old_path):
                        try:
                            os.rename(old_path, tool_path)
                            logger.info(f"🔄 레거시 툴 디렉토리 마이그레이션 완료: {old_id} ➜ {safe_tool_id}")
                            
                            if os.path.exists(logs_dir):
                                for f_name in os.listdir(logs_dir):
                                    if f_name.startswith(f"{old_id}_"):
                                        new_f_name = f_name.replace(f"{old_id}_", f"{safe_tool_id}_", 1)
                                        os.rename(os.path.join(logs_dir, f_name), os.path.join(logs_dir, new_f_name))
                                        logger.info(f"   └─ 💾 이력 DB 승계: {f_name} ➜ {new_f_name}")
                            break
                        except Exception as mig_err:
                            logger.warning(f"마이그레이션 실패 ({old_id}): {mig_err}")

            base_url = yaml_url.rsplit('/', 1)[0]
            py_url = f"{base_url}/{entry_file}?t={ts}"
            py_req = Request(py_url, headers={'Cache-Control': 'no-cache'})
            with urlopen(py_req, timeout=10) as py_response:
                py_content = py_response.read().decode('utf-8')

            os.makedirs(tool_path, exist_ok=True)
            
            with open(os.path.join(tool_path, 'info.yaml'), 'w', encoding='utf-8') as f:
                yaml.dump(tool_info, f, allow_unicode=True, sort_keys=False, default_flow_style=False)
            with open(os.path.join(tool_path, entry_file), 'w', encoding='utf-8') as f:
                f.write(py_content)
                invalidate_tools_cache()

            return {"status": "success", "message": f"'{tool_info.get('name', original_id)}' 설치/업데이트 완료!"}, 200

        elif subpath.startswith('tools/') and method == 'DELETE':
            tool_id = subpath.split('/')[1]
            tool_path = os.path.join(tools_dir, tool_id)
            logs_dir = os.path.join(base_dir, 'task_logs')
            if os.path.exists(logs_dir):
                for f_name in os.listdir(logs_dir):
                    if f_name.startswith(f"{tool_id}_") or f_name == f"{tool_id}.json":
                        try: os.remove(os.path.join(logs_dir, f_name))
                        except Exception as e:
                            logger.warning(f"[Core] 로그 파일 삭제 중 오류: {e}")

            if os.path.exists(tool_path):
                shutil.rmtree(tool_path)
                invalidate_tools_cache()
                logger.info(f"[{get_tool_name(base_dir, tool_id)}] 및 관련 데이터 완전 삭제됨.")
                return {"status": "success"}, 200
            return {"error": "해당 툴을 찾을 수 없습니다."}, 404

        elif subpath.startswith('tool/') and len(subpath.split('/')) >= 3:
            parts = subpath.split('/')
            tool_id = parts[1]
            action = parts[2]

            info_path = os.path.join(tools_dir, tool_id, 'info.yaml')
            if not os.path.exists(info_path): 
                return {"error": "해당 툴이 로컬에 설치되어 있지 않습니다."}, 404
            
            with open(info_path, 'r', encoding='utf-8') as f:
                entry_file = yaml.safe_load(f).get('entry_file', 'main.py')

            try: 
                module = _load_tool_module(tools_dir, tool_id, entry_file)
            except Exception as load_err: 
                return {"error": f"툴 로드 실패: {load_err}"}, 500

            if data is None: 
                data = {}
            server_id = args.get('server_id', data.get('_server_id', 'default')) if data else args.get('server_id', 'default')
            
            options_mgr = CoreOptionsManager(base_dir, tool_id, server_id)
            current_opts = options_mgr.load() or {}
            
            merged_config = global_config.copy() if global_config else {}

            if not current_opts.get('db_path'):
                current_opts['db_path'] = merged_config.get('plex_db_path', db_path)
                
            if not current_opts.get('sqlite_bin'):
                cfg_sqlite_bin = merged_config.get('plex_sqlite_bin')
                if not cfg_sqlite_bin:
                    cfg_sqlite_bin = "/usr/lib/plexmediaserver/Plex SQLite"
                current_opts['sqlite_bin'] = cfg_sqlite_bin

            cfg_plex_url = merged_config.get("plex_url", "")
            cfg_plex_token = merged_config.get("plex_token", "")
            
            final_url = cfg_plex_url if str(cfg_plex_url).strip() else data.get('_plex_url', '')
            final_token = cfg_plex_token if str(cfg_plex_token).strip() else data.get('_plex_token', '')
            
            merged_config['PLEX_URL'] = final_url
            merged_config['PLEX_TOKEN'] = final_token
            merged_config['plex_url'] = final_url
            merged_config['plex_token'] = final_token
            merged_config['plex_db_path'] = current_opts['db_path']
            merged_config['plex_sqlite_bin'] = current_opts['sqlite_bin']

            db_api = create_db_api(merged_config)
            meta_db_engine = UniversalMetaDatabaseEngine(merged_config)

            task_mgr = CoreTaskManager(base_dir, tool_id, server_id)
            data_mgr = CoreDataManager(base_dir, tool_id, server_id, task_mgr=task_mgr, source_config=merged_config)

            def get_plex_instance():
                from plexapi.server import PlexServer
                if not final_url or not final_token: 
                    raise ValueError("Plex 서버 정보가 누락되었습니다.")
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
                "sort": core_natural_sort,
                "meta_db": {
                    "is_enabled": meta_db_engine.is_enabled,
                    "test_connection": meta_db_engine.test_connection,
                    "query": meta_db_engine.query,
                    "execute": meta_db_engine.execute,
                    "get_cursor": meta_db_engine.get_cursor
                }
            }

            if action == 'ui' and method == 'GET':
                if hasattr(module, 'get_ui'): 
                    sig = inspect.signature(module.get_ui)
                    ui_data = module.get_ui(core_api) if len(sig.parameters) > 0 else module.get_ui()
                    ui_data['saved_options'] = options_mgr.load()

                    saved_task = task_mgr.load(include_target_items=False)
                    if saved_task:
                        ui_data['active_task'] = {
                            "run_id": saved_task.get('run_id'),
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

                tool_name = get_tool_name(base_dir, tool_id)

                controlled = action_type not in ('page', 'save_options')
                control_lock = get_tool_lock(tool_id, server_id)
                if controlled and not control_lock.acquire(blocking=False):
                    return {"status": "busy", "message": "작업이 실행 또는 종료 처리 중입니다."}, 409
                transferred = False
                try:
                    if controlled:
                        with CoreTaskManager._TASK_STATES_LOCK:
                            current = CoreTaskManager._TASK_STATES.get(task_mgr.task_key, {})
                            if current.get('worker_active') or current.get('state') in ('running', 'cancelling'):
                                return {'status': 'busy', 'message': '작업이 아직 종료되지 않았습니다.'}, 409
                    needs_cache = action_type in ('clear_data', 'remove_cache_item') or (
                        action_type == 'execute' and tool_id in ('av_manager', 'batch_scanner', 'smart_scanner', 'multipath_finder'))
                    if needs_cache:
                        metadata = data_mgr.load_dashboard() or {}
                        revision = data.get('_cache_revision')
                        if not revision or metadata.get('cache_revision') != revision:
                            return {"status": "error", "message": "조회 결과가 변경되었거나 구형 캐시입니다. 다시 조회하세요."}, 409
                        if action_type == 'execute':
                            if metadata.get('cache_source') != data_mgr.source_fingerprint:
                                return {'status': 'error', 'message': '조회 대상 서버·설정 출처가 변경되었습니다. 다시 조회하세요.'}, 409
                            context = metadata.get('cache_context', {})
                            requested_context = cache_query_context(tool_id, {**current_opts, **data})
                            if any(requested_context.get(key) != value for key, value in context.items()):
                                return {"status": "error", "message": "조회 조건이 변경되었습니다. 다시 조회하세요."}, 409
                        data_mgr.cache_revision = revision

                    if action_type == 'reset':
                        logger.info(f"[{tool_name}] 캐시 및 설정 완전 초기화")
                        completed_steps = []
                        try:
                            data_mgr.reset_db()
                            completed_steps.append('cache')
                            options_mgr.reset()
                            completed_steps.append('options')
                            task_mgr.reset()
                            completed_steps.append('task')
                        except Exception:
                            return {'status': 'error', 'message': '초기화 일부 단계가 실패했습니다.',
                                    'completed_steps': completed_steps}, 500
                        return {"status": "success", "message": "초기화 완료"}, 200

                    elif action_type == 'clear_data':
                        logger.info(f"[{tool_name}] 조회 데이터 초기화")
                        data_mgr.reset_db()
                        return {"status": "success", "message": "조회 목록이 초기화되었습니다."}, 200

                    elif action_type == 'remove_cache_item':
                        pmh_id = data.get('pmh_id')
                        if pmh_id:
                            data_mgr.remove_item_by_pmh_id(pmh_id)
                            return {"status": "success", "message": "항목이 성공적으로 제거되었습니다."}, 200
                        return {"status": "error", "message": "항목 ID(pmh_id)가 제공되지 않았습니다."}, 400

                    elif action_type == 'resume':
                        logger.info(f"[{tool_name}] 작업 재개(Resume) 지시")
                        saved_task = task_mgr.load(include_target_items=True)
                        if not saved_task or not saved_task.get('run_id') or not saved_task.get('task_data'):
                            return {"error": "이어서 실행할 작업 데이터가 없습니다."}, 400
                        if saved_task['task_data'].get('action_type') == 'execute':
                            if not cache_resume_allowed(data_mgr, saved_task, {
                                    **current_opts, **data, '_cache_revision': data.get('_cache_revision')}):
                                return {'status': 'error', 'message': '재개할 조회 결과나 조건이 변경되었습니다. 다시 조회하세요.'}, 409
                            data_mgr.cache_revision = saved_task['task_data']['_cache_revision']
                    
                        schema = module.get_ui(core_api) if hasattr(module, 'get_ui') else {}
                        allowed_resume_options = {
                            field['id'] for group in ('inputs', 'execute_inputs', 'settings_inputs')
                            for field in schema.get(group, []) if isinstance(field, dict) and
                            isinstance(field.get('id'), str) and field.get('type') not in ('header', 'button')}
                        for k, v in data.items():
                            # Only explicitly declared public form fields may change on resume.
                            if k in allowed_resume_options and not k.startswith(('_', 'tmp_')) and k not in (
                                    'run_id', 'server_id', 'node_id', 'action_type', 'target_items', 'total'):
                                saved_task['task_data'][k] = v
                        # One-shot approval is intentionally supplied by the current manual request only.
                        saved_task['task_data'].pop('_ff_review_tokens', None)
                        if isinstance(data.get('_ff_review_tokens'), list):
                            saved_task['task_data']['_ff_review_tokens'] = data['_ff_review_tokens'][:20]


                        try:
                            task_mgr.init_task(saved_task['task_data'])
                            task_mgr.update_state('running', progress=saved_task.get('progress', 0))
                            task_mgr.log("최신 설정값을 적용하여 작업을 재개합니다...")
                        
                            target_thread_name = f"Worker_{tool_id}_{server_id}"
                            t = threading.Thread(target=_core_worker_runner,
                                                 args=(module, saved_task['task_data'], core_api, saved_task.get('progress', 0), tool_id, server_id),
                                                 kwargs={'manual_request': True},
                                                 name=target_thread_name)
                            t.daemon = True
                            t.start()
                            transferred = True
                        except Exception as e:
                            task_mgr.finish(failed=True)
                            raise e
                        
                        return {"status": "success", "type": "async_task", "task_id": tool_id, "run_id": task_mgr.run_id}, 200

                    elif action_type == 'page':
                        sort_key = data.get('sort_key', '')
                        sort_dir = data.get('sort_dir', 'asc')
                        page = int(data.get('page', 1))
                        limit = int(data.get('limit', 10))
                        if page < 1 or not 1 <= limit <= 1000:
                            return {'status': 'error', 'message': 'Invalid page or limit (1..1000)'}, 400

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
                        updates = {k: v for k, v in data.items() if k not in ['action_type', 'run_id', 'server_id', 'node_id'] and not str(k).startswith(('_', 'tmp_'))}
                        current_opts = options_mgr.update(updates)
                        core_api['options'] = current_opts

                        c_enable = current_opts.get('cron_enable')
                        c_expr = current_opts.get('cron_expr', '')
                        if c_enable and str(c_expr).strip():
                            logger.info(f"⏰ [{tool_name}] 스케줄 등록 완료: {c_expr}")
                        else:
                            logger.info(f"⚙️ [{tool_name}] 설정 저장 완료 (스케줄 비활성)")
                        return {"status": "success"}, 200

                    else:
                        updates = {k: v for k, v in data.items() if k not in ['action_type', 'run_id', 'server_id', 'node_id'] and not str(k).startswith(('_', 'tmp_'))}
                        current_opts = options_mgr.update(updates)
                        core_api['options'] = current_opts

                        if action_type in ['preview', 'execute']:
                            logger.info(f"[{tool_name}] 메인 워커 작업 라우팅 (Action: {action_type.upper()})")

                        res, code = module.run(data, core_api)

                        if code == 200 and isinstance(res, dict) and res.get('type') == 'async_task':
                            task_data = res.get('task_data', {})
                            if 'action_type' not in task_data:
                                task_data['action_type'] = action_type
                            

                            try:
                                if not task_data.get('_is_cron'):
                                    task_mgr.reset()
                                task_mgr.init_task(task_data)
                            
                                target_thread_name = f"Worker_{tool_id}_{server_id}"
                                t = threading.Thread(target=_core_worker_runner,
                                                     args=(module, task_data, core_api, 0, tool_id, server_id),
                                                     kwargs={'manual_request': True},
                                                     name=target_thread_name)
                                t.daemon = True
                                t.start()
                                transferred = True
                            except Exception as e:
                                task_mgr.finish(failed=True)
                                raise e
                            
                            return {"status": "success", "type": "async_task", "task_id": tool_id, "run_id": task_mgr.run_id}, 200
                        
                        return res, code

                finally:
                    if controlled and not transferred:
                        control_lock.release()

            elif action == 'status' and method == 'GET':
                status_data = task_mgr.load(include_target_items=False)
                if not status_data: return {"error": "Task not found"}, 404
                
                return status_data, 200

            elif action == 'stream' and method == 'GET':
                session_id = args.get('session_id', 'default')[:8]
                tool_name = get_tool_name(base_dir, tool_id)
                logger.info(f"[{tool_name}] 🟢 SSE 실시간 스트림 연결 수립됨 (ServerID: {server_id[:8]}, Session: {session_id})")

                def generate_sse_events():
                    yield ": ping\n\n"
                    
                    last_log_entry = ""
                    last_progress = -1
                    last_state = ""
                    ticks = 0
                    not_found_retries = 0

                    try:
                        while True:
                            t_data = task_mgr.load(include_target_items=False)
                            
                            if not t_data:
                                not_found_retries += 1
                                if not_found_retries < 20:
                                    time.sleep(0.25)
                                    continue
                                logger.warning(f"[{tool_name}] ⚠️ 태스크 데이터를 찾을 수 없어 스트림을 종료합니다. (Session: {session_id})")
                                yield f"data: {json.dumps({'state': 'not_found'})}\n\n"
                                break
                            
                            not_found_retries = 0

                            curr_state = t_data.get('state', 'unknown')
                            curr_progress = t_data.get('progress', 0)
                            curr_logs = t_data.get('logs', [])
                            curr_last_log = curr_logs[-1] if curr_logs else ""
                            completed_batch = task_mgr.pop_completed_items()

                            if (curr_state != last_state or curr_progress != last_progress 
                                    or curr_last_log != last_log_entry or completed_batch or ticks == 0):
                                last_state = curr_state
                                last_progress = curr_progress
                                last_log_entry = curr_last_log

                                payload = {
                                    'run_id': t_data.get('run_id'),
                                    'state': curr_state,
                                    'progress': curr_progress,
                                    'total': t_data.get('total', 0),
                                    'logs': curr_logs,
                                    'completed_items': completed_batch
                                }
                                yield f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"

                            elif ticks % 6 == 0:
                                yield ": keepalive\n\n"

                            if curr_state in ['completed', 'error', 'cancelled']:
                                logger.info(f"[{tool_name}] 🏁 작업 {curr_state.upper()} 도달. 스트림 정상 마감. (Session: {session_id})")
                                break

                            time.sleep(0.25)
                            ticks += 1

                    except GeneratorExit:
                        logger.debug(f"[{tool_name}] 클라이언트가 SSE 스트림 연결을 닫았습니다. (Session: {session_id})")
                    except Exception as stream_err:
                        logger.error(f"[{tool_name}] ❌ SSE 스트림 전송 중 예외 발생 (Session: {session_id}): {stream_err}")
                    finally:
                        logger.info(f"[{tool_name}] ⚪ SSE 실시간 스트림 연결 해제됨 (ServerID: {server_id[:8]}, Session: {session_id})")

                resp = Response(
                    generate_sse_events(), 
                    mimetype='text/event-stream',
                    headers={
                        'Cache-Control': 'no-cache, no-transform',
                        'X-Accel-Buffering': 'no',
                        'Connection': 'keep-alive'
                    }
                )
                return resp, 200

            elif action == 'cancel' and method == 'POST':
                saved_task = task_mgr.load(include_target_items=False)
                if saved_task and saved_task.get('state') in ('running', 'cancelling'):
                    task_mgr.update_state('cancelled')
                    task_mgr.log("[System] 사용자 취소 요청. 진행 중인 항목까지만 처리하고 중단합니다.")
                    return {"status": "success"}, 200
                return {"error": "실행 중이 아닙니다."}, 400

        return {"error": f"Endpoint '/api/{subpath}' not found."}, 404

    except Exception as e:
        logger.error(traceback.format_exc())
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
        r'.*?(?<![a-z])(svbd)[-_](aa)[-_]?([0-9]+)(?=[^\d]|\b) => {0}|{1}{2}',
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
                logger.error(f"Rule: {rule['pattern']} -> {e}")
            
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
            stripped = norm_label.lstrip('0')
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
    task = getattr(_FF_WRITE_CONTEXT, 'task', None)
    if task and task.is_cancelled(): return False
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
# [미디어 액션 실시간 SSE 브로드캐스터 엔진]
# ==============================================================================

_MEDIA_STREAM_LISTENERS = []
_MEDIA_STREAM_LOCK = threading.Lock()

def broadcast_media_event(event_dict):
    """모든 연결된 SSE 클라이언트에 미디어 상태 이벤트를 실시간 전송"""
    with _MEDIA_STREAM_LOCK:
        dead_listeners = []
        for q in _MEDIA_STREAM_LISTENERS:
            try:
                q.put_nowait(event_dict)
            except Exception:
                dead_listeners.append(q)
        for q in dead_listeners:
            try: _MEDIA_STREAM_LISTENERS.remove(q)
            except Exception: pass


def media_action_worker_loop(global_config):
    logger.info("Media Action Queue Worker 시작됨.")
    while _SCHEDULER_STATES.get("PMH_Media_Worker", False):
        try:
            task = MEDIA_ACTION_QUEUE.get(timeout=1.0)
            task_id = task['task_id']

            if task_id == 'KILL':
                MEDIA_ACTION_QUEUE.task_done()
                continue

            if MEDIA_ACTION_STATUS.get(task_id, {}).get('state') == 'cancelled':
                logger.info(f"🚫 취소된 큐 작업 스킵됨 (Item: {task['item_id']})")
                MEDIA_ACTION_QUEUE.task_done()
                continue

            item_id = task['item_id']
            action = task['action']
            plex_url = task['plex_url']
            plex_token = task['plex_token']
            data = task['data']
            
            MEDIA_ACTION_STATUS[task_id]['state'] = 'processing'
            
            broadcast_media_event({
                'task_id': task_id,
                'item_id': str(item_id),
                'state': 'processing',
                'action': action
            })
            
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
                except Exception: pass

                target_item = item
                if item.type in ['episode', 'season']:
                    try:
                        target_item = execute_plex_action_safe(lambda: plex.fetchItem(item.grandparentRatingKey if item.type == 'episode' else item.parentRatingKey))
                    except Exception: pass
                        
                target_id = target_item.ratingKey

                if action == 'unmatch':
                    execute_plex_action_safe(lambda: target_item.unmatch())
                    MEDIA_ACTION_STATUS[task_id] = {'state': 'completed', 'msg': 'Unmatch 완료', 'item_id': item_id, 'action': action}
                    
                    broadcast_media_event({
                        'task_id': task_id,
                        'item_id': str(item_id),
                        'state': 'completed',
                        'action': action,
                        'msg': 'Unmatch 완료'
                    })
            
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
                        task_logger=lambda x: logger.info(f"[Queue] {x}"),
                        cancel_checker=lambda: MEDIA_ACTION_STATUS.get(task_id, {}).get('state') == 'cancelled'
                    )

                    if success:
                        if item.type in ['season', 'episode'] and action in ['match', 'refresh']:
                            logger.info(f"⏳ 하위 항목({item.type})으로 메타데이터가 전파될 때까지 대기합니다...")
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
                            logger.info(f"💡 3자리 시즌이 감지되었습니다. '{action}' 완료 후 YAML 적용을 연계합니다.")
                            
                            perform_smart_media_action(
                                plex_url=plex_url, plex_token=plex_token, rating_key=target_id,
                                action_type='yaml_refresh', plex_inst=plex, manual_match=manual_m, global_config=global_config,
                                task_logger=lambda x: logger.info(f"[Queue] {x}"), cancel_checker=lambda: False
                            )
                            msg += " (YAML 자동 연계됨)"

                        MEDIA_ACTION_STATUS[task_id].update({'state': 'completed', 'msg': msg, 'item_id': item_id, 'action': action})
                        
                        broadcast_media_event({
                            'task_id': task_id,
                            'item_id': str(item_id),
                            'state': 'completed',
                            'action': action,
                            'msg': msg
                        })
                    else:
                        MEDIA_ACTION_STATUS[task_id].update({'state': 'error', 'msg': msg, 'item_id': item_id, 'action': action})
                        
                        broadcast_media_event({
                            'task_id': task_id,
                            'item_id': str(item_id),
                            'state': 'error',
                            'action': action,
                            'msg': msg
                        })
                        
            except Exception as e:
                MEDIA_ACTION_STATUS[task_id] = {'state': 'error', 'msg': str(e), 'item_id': item_id, 'action': action}
                broadcast_media_event({
                    'task_id': task_id,
                    'item_id': str(item_id),
                    'state': 'error',
                    'action': action,
                    'msg': str(e)
                })
            
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
            logger.error(f"Media Worker Error: {e}")
            time.sleep(1)


# ==============================================================================
# [공용 미디어 관리 엔진] - 스마트 매칭 / 리프레시 / 분석 통합
# ==============================================================================

def perform_smart_media_action(
    plex_url, plex_token, rating_key, action_type='refresh', 
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
        err_str = str(e).lower()
        if "404" in err_str or "not_found" in err_str or "not found" in err_str:
            if task_logger: task_logger("✅ 항목이 이미 삭제되었거나 다른 항목으로 병합되었습니다. (목록에서 제외)")
            return True, "이미 병합/삭제된 항목", 100
        else:
            if task_logger: task_logger(f"❌ Plex 항목 조회 실패: {e}")
            return False, f"Plex 항목을 조회할 수 없습니다 ({e}).", 0
    
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
    # [모드 3] Match 모드 (AV / Western / NFO / 일반 전체 통합)
    # ==========================================================================
    if action_type == 'match':
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

        api_headers = {
            'Accept': 'application/json',
            'X-Plex-Token': plex_token,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 PlexMetaHelper/1.0'
        }

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
            except Exception as e:
                logger.warning(f"[Core] 루트 디렉토리 확인 중 오류: {e}")

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

        # --- 3. 에이전트 판별 및 라이브러리 성격 정의 ---
        if not target_agent:
            try: 
                sec = target_item.section()
                target_agent = sec.agent if sec else ""
            except Exception: 
                target_agent = ""

        # 로컬 메타데이터 에이전트(YAML, NFO) 및 일반/AV 에이전트 분기 정의
        is_yaml_agent = 'yaml' in (target_agent or "").lower()
        is_nfo_agent = any(k in (target_agent or "").lower() for k in ['nfo', 'xbmc'])
        is_sjva_agent = target_agent.startswith('com.plexapp.agents.sjva') and not is_yaml_agent if target_agent else False
        is_plex_agent = target_agent in ['tv.plex.agents.movie', 'tv.plex.agents.series'] if target_agent else False
        is_custom_agent = not is_sjva_agent and not is_plex_agent and not is_nfo_agent and not is_yaml_agent and bool(target_agent)

        current_section_id = getattr(target_item, 'librarySectionID', None)
        
        # YAML 또는 NFO 에이전트는 AV 판정에서 제외
        is_jav_allowed = match_section_ids(global_config.get("JAV_SECTION"), current_section_id) and not is_yaml_agent and not is_nfo_agent
        is_western_av = match_section_ids(global_config.get("WESTERN_AV_SECTION"), current_section_id) and not is_yaml_agent and not is_nfo_agent

        is_av_mode = (is_jav_allowed or is_western_av or is_sjva_agent or is_custom_agent) and not is_yaml_agent and not is_nfo_agent

        # --- 4. JAV 사전 검사 ---
        if is_sjva_agent or is_jav_allowed:
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
                    current_section_id = getattr(target_item, 'librarySectionID', None)
                    is_delete_allowed = match_section_ids(global_config.get("DELETE_JSON_SECTION"), current_section_id)

                    # YAML 또는 NFO 섹션은 로컬 메타데이터 보호를 위해 삭제 루틴 건너뜀
                    if not is_delete_allowed or is_yaml_agent or is_nfo_agent:
                        if task_logger and not is_delete_allowed: task_logger(f"💡 현재 섹션(ID: {current_section_id})은 JSON 삭제 미허용")
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
                except Exception as e:
                    logger.warning(f"[Core] 파일 삭제 중 오류: {e}")

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
                try:
                    req = Request(req_url, headers=api_headers)
                    with urlopen(req, timeout=120) as response:
                        resp_data = response.read().decode('utf-8')
                        parsed = json.loads(resp_data)
                        mc = parsed.get('MediaContainer', {})
                        return mc.get('SearchResult', mc.get('Metadata', []))
                except Exception as api_err:
                    if task_logger: task_logger(f"⚠️ Plex API 검색 요청 실패: {api_err}")
                    return []

            lang_code = 'ko' if (is_sjva_agent or is_plex_agent) else 'en'
            if is_plex_agent:
                try:
                    sect_lang = target_item.section().language
                    if sect_lang: lang_code = str(sect_lang).lower()
                except Exception as e:
                    logger.warning(f"[Core] 섹션 언어 확인 중 오류: {e}")

            def _build_search_params(title_str, year_str=None, file_path_str=None):
                p = {
                    'title': title_str, 
                    'language': lang_code,
                    'manual': '1' if manual_match else '0'
                }
                if target_agent:
                    p['agent'] = target_agent
                if year_str: 
                    p['year'] = str(year_str)
                if file_path_str:
                    p['media_path'] = file_path_str
                    p['path'] = file_path_str
                return p

            # [7-1] JAV 모드 검색
            if is_jav:
                search_params = _build_search_params(search_pid, item_year, raw_file_path)
                search_url = f"{plex_url}/library/metadata/{target_item.ratingKey}/matches?{urlencode(search_params)}"
                if task_logger: task_logger(f"📡 [JAV] Plex 직접 API 검색 시도... (품번: '{search_pid}')")
                matches = execute_plex_action_safe(lambda: _fetch_plex_api(search_url))

            # [7-2] 서양 AV / 일반 영화 / NFO 검색 쿼리 구성
            else:
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
                raw_base_name = ""
                if raw_file_name:
                    name_no_ext = os.path.splitext(raw_file_name)[0]
                    raw_base_name = name_no_ext
                    name_no_ext = re.sub(r'^\[.*?\]', '', name_no_ext).strip()
                    name_no_ext = re.sub(r'\[.*?\]$', '', name_no_ext).strip()
                    
                    cut_pattern = r'[\.\-_ ](19[1-9]\d|20[0-2]\d|[Ss]\d{1,3}[Ee]\d{1,3}|[Ss]\d{1,2}|[Ee][Pp]?\d{1,3}|2160p|1080p|720p|480p|4k|8k|bluray|web-?dl|web-?rip|remux|x264|x265|hevc|avc|hdr|dts|truehd|atmos|dd5\.1|aac|xxx|mp4|mkv|avi|wmv)[\.\-_ \b]'
                    
                    match_cut = re.search(cut_pattern, name_no_ext, re.IGNORECASE)
                    if match_cut and match_cut.start() > 0:
                        file_query = name_no_ext[:match_cut.start()].strip()
                    else:
                        file_query = name_no_ext
                        
                    file_query = re.sub(r'[\(\[\{\)\]\}]', ' ', file_query)
                    file_query = re.sub(r'[_\.-]', ' ', file_query).strip()
                    file_query = re.sub(r'\s+', ' ', file_query)

                if not file_query and not folder_query: 
                    file_query = raw_base_name or raw_file_name

                if search_priority == 'auto':
                    search_priority = 'file' if is_av_mode else 'folder'

                queries_to_try = []
                if search_priority == 'file':
                    if file_query: queries_to_try.append(("정제 파일명", file_query))
                    if folder_query and folder_query != file_query: queries_to_try.append(("정제 폴더명", folder_query))
                    if raw_base_name and raw_base_name != file_query: queries_to_try.append(("원본 파일명", raw_base_name))
                else:
                    if folder_query: queries_to_try.append(("정제 폴더명", folder_query))
                    if file_query and file_query != folder_query: queries_to_try.append(("정제 파일명", file_query))
                    if raw_base_name and raw_base_name != file_query: queries_to_try.append(("원본 파일명", raw_base_name))

                matches = []
                for q_type, q_text in queries_to_try:
                    if not q_text.strip(): continue
                    
                    if is_av_mode or is_nfo_agent or is_yaml_agent or not is_plex_agent:
                        search_params = _build_search_params(q_text, item_year if not is_av_mode else None, raw_file_path)
                        search_url = f"{plex_url}/library/metadata/{target_item.ratingKey}/matches?{urlencode(search_params)}"
                        tag_name = "YAML" if is_yaml_agent else ("Western AV" if is_western_av else ("NFO" if is_nfo_agent else "Custom/SJVA"))
                        if task_logger: task_logger(f"📡 [{tag_name}] 직접 API 검색 시도... ({q_type}: '{q_text}')")
                        matches = execute_plex_action_safe(lambda: _fetch_plex_api(search_url))

                        # 서양 AV: 1차 검색 실패 시 날짜 패턴(26.08.10 등) 제거 후 재검색
                        if not matches and is_western_av:
                            date_pattern = r'\b(?:\d{2,4}[\.\-_ ]\d{1,2}[\.\-_ ]\d{1,2})\b'
                            fallback_query = re.sub(date_pattern, '', q_text)
                            fallback_query = re.sub(r'\s+', ' ', fallback_query).strip()
                            
                            if fallback_query and fallback_query != q_text:
                                if task_logger: task_logger(f"   ⚠️ 1차 검색 실패. 날짜 패턴 제거/재시도: '{fallback_query}'")
                                search_params['title'] = fallback_query
                                search_url2 = f"{plex_url}/library/metadata/{target_item.ratingKey}/matches?{urlencode(search_params)}"
                                fallback_matches = execute_plex_action_safe(lambda: _fetch_plex_api(search_url2))
                                if fallback_matches: matches = fallback_matches

                    else:
                        kwargs = {'language': lang_code, 'title': q_text}
                        if target_agent: kwargs['agent'] = target_agent
                        if item_year: kwargs['year'] = str(item_year)
                        
                        if task_logger: task_logger(f"📡 [일반 매칭] Plex API 검색 시도... ({q_type}: '{q_text}', 연도: '{item_year}')")
                        matches = execute_plex_action_safe(lambda: target_item.matches(**kwargs))

                    if matches:
                        break

            # --- 8. 검색 결과 필터링 및 Scoring ---
            if not matches: 
                if task_logger: task_logger(f"❌ 일치하는 후보가 없습니다.")
                return False, "검색 조건에 맞는 후보가 없습니다.", 0

            # [케이스 1] 로컬 메타데이터 에이전트 (NFO / YAML): 로컬 설정 기반이므로 검증 없이 1순위 결과 무조건 수용
            if is_nfo_agent or is_yaml_agent:
                best_match = matches[0]
                best_score = 100
                agent_tag = "YAML" if is_yaml_agent else "NFO"
                matched_by = f"{agent_tag} 에이전트 (로컬 메타데이터 강제 수용)"
                if task_logger: task_logger(f"💡 [{agent_tag} 모드] 로컬 에이전트 검색 결과 1순위 즉시 채택 -> 후보 '{_get_val(best_match, 'name', '')}'")

            # [케이스 2] 통합 AV 모드 (JAV, Western AV, StashDB, TPDB, SJVA): '점수(Score)' 절대 판정
            elif is_av_mode:
                jav_min_score = int(global_config.get('JAV_MIN_SCORE', 95))
                western_min_score = int(global_config.get('WESTERN_MIN_SCORE', 95))

                if use_custom_score:
                    threshold_score = int(custom_agent_score) if custom_agent_score else 95
                    score_msg = f"사용자 지정({threshold_score}점)"
                else:
                    threshold_score = western_min_score if is_western_av else jav_min_score
                    score_msg = f"설정 기준값({threshold_score}점)"

                tag_label = "Western AV" if is_western_av else ("JAV" if is_jav else "SJVA/AV")
                if task_logger: task_logger(f"💡 [{tag_label} 모드] 점수 기반 선별 ({score_msg})")

                # 점수 내림차순 정렬
                matches.sort(key=lambda x: int(_get_val(x, 'score', 0)), reverse=True)

                for idx, cand in enumerate(matches):
                    cand_guid_val = _get_val(cand, 'guid', '') or _get_val(cand, 'id', '')
                    if 'collection://' in cand_guid_val: continue
                    
                    cand_name = _get_val(cand, 'name', '') or _get_val(cand, 'title', '')
                    cand_score = int(_get_val(cand, 'score', 0))

                    if cand_score >= threshold_score:
                        best_match = cand
                        best_score = cand_score
                        matched_by = f"{tag_label} 점수 통과({cand_score}점)"
                        if task_logger: task_logger(f"   📋 [후보 {idx+1}] '{cand_name}' (점수: {cand_score}) -> ✨ 조건 충족!")
                        break
                    else:
                        if task_logger: task_logger(f"   📋 [후보 {idx+1}] '{cand_name}' (점수: {cand_score}) ❌ 기준점({threshold_score}점) 미달")

            # [케이스 3] 일반 영화/드라마 (Plex 기본 에이전트)
            else:
                top_candidates = matches[:3]
                if skip_sim_check:
                    cand = top_candidates[0]
                    cand_name = _get_val(cand, 'name', '') or _get_val(cand, 'title', '')
                    cand_year = str(_get_val(cand, 'year', ''))
                    best_match = cand
                    best_score = 100
                    highest_sim_found = 1.0
                    matched_by = "제목/연도 검증 스킵 (1순위 강제 수용)"
                    if task_logger: task_logger(f"💡 [일반 모드] 제목/연도 검증 스킵 -> 1순위 '{cand_name}' 수용")
                else:
                    if task_logger: task_logger(f"💡 [텍스트 유사도 모드] 텍스트 유사도 검증(커트라인 90%)을 진행합니다.")
                    norm_pattern = r'[^\w\s]|_'
                    norm_folder_q = re.sub(norm_pattern, '', folder_query.lower())
                    norm_file_q = re.sub(norm_pattern, '', file_query.lower())

                    for idx, cand in enumerate(top_candidates):
                        cand_name = _get_val(cand, 'name', '') or _get_val(cand, 'title', '')
                        cand_orig = _get_val(cand, 'originalTitle', '')
                        cand_year = str(_get_val(cand, 'year', ''))
                        cand_score = int(_get_val(cand, 'score', 0))

                        if item_year and cand_year and str(item_year).strip() != cand_year:
                            if task_logger: task_logger(f"   📋 [후보 {idx+1}] '{cand_name}' ❌ 연도 불일치 (목표: {item_year}, 후보: {cand_year})")
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

            candidate_name = _get_val(best_match, 'name', '') or _get_val(best_match, 'title', '')
            candidate_guid = _get_val(best_match, 'guid', '') or _get_val(best_match, 'id', '')
            b_year = _get_val(best_match, 'year', None)

            if task_logger:
                if matched_by.startswith("NFO") or matched_by.startswith("YAML"):
                    agent_tag = "YAML" if "YAML" in matched_by else "NFO"
                    task_logger(f"✨ [{agent_tag} 에이전트] 로컬 메타데이터 매칭 적용: '{candidate_name}'")
                elif is_av_mode:
                    task_logger(f"✨ [AV 에이전트] 점수 통과 후보({best_score}점) 매칭 적용: '{candidate_name}'")
                else:
                    task_logger(f"✨ [일반 에이전트] '{matched_by}' 검증 통과 후보 매칭 적용: '{candidate_name}'")

            initial_guid = (target_item.guid or '').lower()

            try:
                match_params = {
                    'guid': candidate_guid, 
                    'name': candidate_name,
                    'language': lang_code
                }
                if target_agent: match_params['agent'] = target_agent
                if b_year: match_params['year'] = str(b_year)
                elif item_year and not is_custom_agent: match_params['year'] = str(item_year)
                    
                match_url = f"{plex_url}/library/metadata/{target_item.ratingKey}/match?{urlencode(match_params)}"
                req = Request(match_url, method='PUT', headers=api_headers)
                execute_plex_action_safe(lambda: urlopen(req, timeout=120))
            except Exception as put_e:
                if task_logger: task_logger(f"⚠️ HTTP PUT 매칭 전송 오류 (무시하고 결과 대기 시도): {put_e}")
            
            # --- 10. 적용 결과 확인 (Reload & Validate) ---
            match_verified = False
            if task_logger: task_logger(f"⏳ 매칭 적용 중... GUID 갱신 상태를 확인합니다.")
            
            target_candidate_guid = (candidate_guid or '').lower()

            for _ in range(20):
                if cancel_checker and cancel_checker(): return False, "작업 취소됨", 0
                time.sleep(3.0)
                try:
                    execute_plex_action_safe(lambda: target_item.reload())
                    new_guid = (target_item.guid or '').lower()
                    
                    is_valid_guid = 'local://' not in new_guid and 'none://' not in new_guid and new_guid != '-'
                    
                    if is_valid_guid and (new_guid != initial_guid or new_guid == target_candidate_guid or not do_unmatch_first):
                        match_verified = True
                        if task_logger: task_logger(f"✅ 매칭 최종 승인 및 갱신 완료! (새 GUID: {target_item.guid})")
                        time.sleep(4.0)
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
            logger.error(traceback.format_exc())
            if task_logger: task_logger(f"❌ 매칭 작업 중 내부 오류: {e}")
            return False, f"매칭 작업 중 내부 오류: {e}", 0

    return False, f"알 수 없는 액션입니다: {action_type}", 0
