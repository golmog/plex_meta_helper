# -*- coding: utf-8 -*-

import sqlite3
import os
import time
import re
import unicodedata
import shutil
import urllib.request
import importlib.util
import inspect
import json
import yaml
import threading
from datetime import datetime
from contextlib import contextmanager

# ==============================================================================
# [코어 모듈 버전]
# ==============================================================================
__version__ = "0.7.44"

def get_version():
    return __version__

@contextmanager
def get_db_connection(db_path):
    if not os.path.exists(db_path):
        raise FileNotFoundError(f"DB File not found: {db_path}")
    conn = None
    try:
        conn = sqlite3.connect(f'file:{db_path}?mode=ro', uri=True, timeout=10.0, isolation_level=None)
        yield conn
    except sqlite3.OperationalError as e:
        print(f"[DB ERROR] SQLite Operational Error: {str(e)}")
        raise
    except Exception as e:
        print(f"[DB ERROR] Connection failed: {str(e)}")
        raise
    finally:
        if conn:
            try:
                conn.rollback()
            except:
                pass
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
            
            if dir_key in seen_paths:
                continue

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
        print("[BATCH] Rejected: Invalid request format.")
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
                    
                    if filepath:
                        filepath = unicodedata.normalize('NFC', filepath)
                    
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
                        if width >= 7000: res_tag = "8K"
                        elif width >= 5000: res_tag = "6K"
                        elif width >= 3400: res_tag = "4K"
                        elif width >= 1900: res_tag = "FHD"
                        elif width >= 1200: res_tag = "HD"
                        elif width > 0: res_tag = "SD"
                        
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
                                        if s_codec in ['srt', 'ass', 'smi', 'vtt', 'ssa', 'sub']: score += 50
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
        print(f"[BATCH ERROR] Failed processing batch: {str(e)}")
        return {"error": str(e)}, 500

def handle_media_detail(rating_key, db_path):
    if not rating_key.isdigit(): 
        return {"error": "Invalid rating_key"}, 400

    try:
        with get_db_connection(db_path) as conn:
            cursor = conn.cursor()
            try:
                cursor.execute("SELECT metadata_type, guid, library_section_id FROM metadata_items WHERE id = ?", (rating_key,))
                meta_row = cursor.fetchone()
                if not meta_row: 
                    return {"error": "Item not found"}, 404
                m_type, guid, lib_section_id = meta_row
                
                if m_type in (2, 3):
                    folder_paths, seen_paths = [], set()
                    if m_type == 2:
                        query = """SELECT mp.file FROM metadata_items ep JOIN metadata_items sea ON ep.parent_id = sea.id JOIN media_items m ON m.metadata_item_id = ep.id JOIN media_parts mp ON mp.media_item_id = m.id WHERE sea.parent_id = ? AND ep.metadata_type = 4 ORDER BY m.width DESC, m.bitrate DESC"""
                        cursor.execute(query, (rating_key,))
                        for row in cursor.fetchall():
                            if row and row[0]:
                                raw_file = unicodedata.normalize('NFC', row[0])
                                dir_path_original = os.path.dirname(raw_file)
                                dir_key = os.path.normpath(dir_path_original).replace('\\', '/').lower()
                                
                                if dir_key not in seen_paths:
                                    seen_paths.add(dir_key)
                                    folder_paths.append(dir_path_original)
                                    
                                if is_season_folder(os.path.basename(dir_path_original)):
                                    parent_path_original = os.path.dirname(dir_path_original)
                                    parent_key = os.path.normpath(parent_path_original).replace('\\', '/').lower()
                                    if parent_key not in seen_paths:
                                        seen_paths.add(parent_key)
                                        folder_paths.append(parent_path_original)

                    elif m_type == 3:
                        query = """SELECT mp.file FROM metadata_items ep JOIN media_items m ON m.metadata_item_id = ep.id JOIN media_parts mp ON mp.media_item_id = m.id WHERE ep.parent_id = ? AND ep.metadata_type = 4 ORDER BY m.width DESC, m.bitrate DESC"""
                        cursor.execute(query, (rating_key,))
                        for row in cursor.fetchall():
                            if row and row[0]:
                                raw_file = unicodedata.normalize('NFC', row[0])
                                target_path_original = os.path.dirname(raw_file)
                                target_key = os.path.normpath(target_path_original).replace('\\', '/').lower()
                                
                                if target_key not in seen_paths:
                                    seen_paths.add(target_key)
                                    folder_paths.append(target_path_original)

                    folder_paths.sort(key=natural_sort_key)
                    versions = [{"file": path, "parts": [{"path": path}]} for path in folder_paths]
                    return { "type": "directory", "itemId": rating_key, "guid": guid, "duration": None, "librarySectionID": lib_section_id, "versions": versions }, 200

                query_media = """SELECT m.id, m.width, m.height, (SELECT bitrate FROM media_streams WHERE media_item_id = m.id AND stream_type_id = 1 LIMIT 1) as v_bitrate, (SELECT group_concat(ms.codec || '|' || IFNULL(ms.extra_data, ''), ';;') FROM media_streams ms WHERE media_item_id = m.id AND stream_type_id = 1) as raw_stream_data, m.video_codec, m.audio_codec, m.duration, (SELECT channels FROM media_streams WHERE media_item_id = m.id AND stream_type_id = 2 LIMIT 1) as audio_ch, (SELECT bitrate FROM media_streams WHERE media_item_id = m.id AND stream_type_id = 2 LIMIT 1) as a_bitrate, mp.id, mp.file FROM media_items m LEFT JOIN media_parts mp ON mp.media_item_id = m.id WHERE m.metadata_item_id = ? ORDER BY m.width DESC, m.bitrate DESC"""
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
                    versions.append({"part_id": part_id, "file": file_path, "width": width or 0, "v_bitrate": v_bitrate or 0, "video_extra": video_extra, "v_codec": v_codec or "", "a_codec": a_codec or "", "a_ch": a_ch or "", "a_bitrate": a_bitrate or 0, "subs": subs, "parts": [{"id": part_id, "path": file_path}]})
                
                cursor.execute("SELECT text, time_offset, end_time_offset FROM taggings WHERE metadata_item_id = ? AND text IN ('intro', 'credits')", (rating_key,))
                markers = {tag_text: {"start": start_offset, "end": end_offset} for tag_text, start_offset, end_offset in cursor.fetchall() if tag_text and start_offset is not None and end_offset is not None}
            
            finally:
                cursor.close()
                
        return { "type": "video", "itemId": rating_key, "guid": guid, "duration": duration, "librarySectionID": lib_section_id, "versions": versions, "markers": markers }, 200
    except Exception as e:
        print(f"[DETAIL ERROR] Failed processing item {rating_key}: {str(e)}")
        return {"error": str(e)}, 500

# ==============================================================================
# [코어 작업 관리자 (Task Manager)]
# ==============================================================================
class CoreTaskManager:
    def __init__(self, base_dir, tool_id, server_id="default"):
        self.tool_id = tool_id
        self.db_file = os.path.join(base_dir, 'task_logs', f"{tool_id}_{server_id}_task.db")
        self._lock = threading.Lock()

    @contextmanager
    def _get_conn(self):
        conn = sqlite3.connect(self.db_file, timeout=10.0)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
        finally:
            conn.commit()
            conn.close()

    def _setup_db(self):
        with self._get_conn() as conn:
            c = conn.cursor()
            c.execute("CREATE TABLE IF NOT EXISTS task_info (state TEXT, progress INTEGER, total INTEGER, task_data TEXT)")
            c.execute("CREATE TABLE IF NOT EXISTS logs (id INTEGER PRIMARY KEY AUTOINCREMENT, log_text TEXT)")
            
            c.execute("SELECT count(*) FROM task_info")
            if c.fetchone()[0] == 0:
                c.execute("INSERT INTO task_info (state, progress, total, task_data) VALUES ('completed', 0, 0, '{}')")

    def load(self):
        """기존 JSON 구조와 100% 동일한 딕셔너리를 반환하여 하위 호환성 유지"""
        with self._lock:
            if not os.path.exists(self.db_file): return None
            try:
                with self._get_conn() as conn:
                    c = conn.cursor()
                    c.execute("SELECT state, progress, total, task_data FROM task_info LIMIT 1")
                    row = c.fetchone()
                    if not row: return None
                    
                    data = {
                        "state": row['state'],
                        "progress": row['progress'],
                        "total": row['total'],
                        "task_data": json.loads(row['task_data'] or '{}')
                    }
                    
                    # 가장 최근 로그 50개만 오름차순으로 가져옴
                    c.execute("SELECT log_text FROM (SELECT id, log_text FROM logs ORDER BY id DESC LIMIT 50) sub ORDER BY id ASC")
                    data['logs'] = [l['log_text'] for l in c.fetchall()]
                    
                    return data
            except: 
                return None

    def save(self, data):
        """레거시 호환용 저장 함수 (주로 이어서 실행 task_data 덮어쓰기용)"""
        with self._lock:
            self._setup_db()
            try:
                with self._get_conn() as conn:
                    c = conn.cursor()
                    state = data.get('state', 'completed')
                    progress = data.get('progress', 0)
                    total = data.get('total', 0)
                    task_data_str = json.dumps(data.get('task_data', {}), ensure_ascii=False)
                    
                    c.execute("UPDATE task_info SET state=?, progress=?, total=?, task_data=?", 
                              (state, progress, total, task_data_str))
            except: pass

    def init_task(self, task_data):
        """새로운 작업을 시작할 때 DB를 초기화하고 첫 로그를 찍습니다."""
        with self._lock:
            self._setup_db()
            with self._get_conn() as conn:
                c = conn.cursor()
                c.execute("DELETE FROM logs")
                c.execute("UPDATE task_info SET state='running', progress=0, total=?, task_data=?", 
                          (task_data.get('total', 0), json.dumps(task_data, ensure_ascii=False)))
                c.execute("INSERT INTO logs (log_text) VALUES ('작업을 시작합니다...')")

    def reset(self):
        """작업 관련 캐시 파일 완전 삭제"""
        with self._lock:
            if os.path.exists(self.db_file):
                try: os.remove(self.db_file)
                except: pass

    def log(self, msg):
        """가장 많이 호출되는 함수: 초고속 INSERT로 로그 기록"""
        print(f"[{self.tool_id}] {msg}")
        stamp = datetime.now().strftime('%H:%M:%S')
        log_line = f"[{stamp}] {msg}"
        
        with self._lock:
            self._setup_db()
            with self._get_conn() as conn:
                c = conn.cursor()
                c.execute("INSERT INTO logs (log_text) VALUES (?)", (log_line,))

    def update_state(self, state, progress=None, total=None):
        """진행률 및 상태 업데이트"""
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
        """취소 상태 확인 (매 루프마다 호출되므로 빠르고 가볍게)"""
        with self._lock:
            if not os.path.exists(self.db_file): return True
            try:
                with self._get_conn() as conn:
                    c = conn.cursor()
                    c.execute("SELECT state FROM task_info LIMIT 1")
                    row = c.fetchone()
                    if row:
                        return row['state'] in ['cancelled', 'error']
            except: pass
            return True

# ==============================================================================
# [코어 데이터 캐시 관리자 (SQLite 기반 동적 스키마)]
# ==============================================================================
class CoreDataManager:
    def __init__(self, base_dir, tool_id, server_id="default"):
        self.db_file = os.path.join(base_dir, 'task_logs', f"{tool_id}_{server_id}_cache.db")
        self._lock = threading.Lock()

    @contextmanager
    def _get_conn(self):
        conn = sqlite3.connect(self.db_file, timeout=10.0)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
        finally:
            conn.commit()
            conn.close()

    def reset_db(self):
        with self._lock:
            if os.path.exists(self.db_file):
                try: os.remove(self.db_file)
                except: pass

    def save(self, res_data):
        self.reset_db()
        with self._lock:
            with self._get_conn() as conn:
                c = conn.cursor()
                
                meta_dict = {k: v for k, v in res_data.items() if k != 'data'}
                c.execute("CREATE TABLE meta (payload TEXT)")
                c.execute("INSERT INTO meta (payload) VALUES (?)", (json.dumps(meta_dict, ensure_ascii=False),))
                
                data_list = res_data.get('data', [])
                if data_list:
                    columns = list(data_list[0].keys())
                    col_defs = ", ".join([f'"{col}" TEXT' for col in columns])
                    c.execute(f"CREATE TABLE data (pmh_id INTEGER PRIMARY KEY AUTOINCREMENT, {col_defs}, pmh_status TEXT DEFAULT 'pending')")
                    c.execute("CREATE INDEX idx_status ON data (pmh_status)")
                    
                    placeholders = ", ".join(["?" for _ in columns])
                    col_names = ", ".join([f'"{col}"' for col in columns])
                    insert_sql = f"INSERT INTO data ({col_names}) VALUES ({placeholders})"
                    
                    rows = [[str(row.get(col, '')) if row.get(col) is not None else '' for col in columns] for row in data_list]
                    c.executemany(insert_sql, rows)

    def load_page(self, page, limit, sort_key=None, sort_dir='asc'):
        with self._lock:
            if not os.path.exists(self.db_file): return None
            
            with self._get_conn() as conn:
                c = conn.cursor()
                
                c.execute("SELECT count(name) FROM sqlite_master WHERE type='table' AND name='meta'")
                if c.fetchone()[0] == 0: return None
                
                c.execute("SELECT payload FROM meta LIMIT 1")
                meta_row = c.fetchone()
                if not meta_row: return None
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

                where_clause = "WHERE pmh_status != 'done'"

                c.execute(f"SELECT COUNT(*) FROM data {where_clause}")
                total_items = c.fetchone()[0]
                
                order_clause = ""
                columns_meta = result.get('columns', [])
                col_map = {c['key']: c for c in columns_meta}
                
                target_sort_key = sort_key
                target_sort_dir = sort_dir.upper() if sort_dir in ['asc', 'desc'] else 'ASC'
                
                if target_sort_key:
                    actual_key = col_map.get(target_sort_key, {}).get('sort_key', target_sort_key)
                    sort_type = col_map.get(target_sort_key, {}).get('sort_type', 'string')
                    if sort_type == 'number':
                        order_clause = f"ORDER BY CAST(\"{actual_key}\" AS REAL) {target_sort_dir}"
                    else:
                        order_clause = f"ORDER BY \"{actual_key}\" COLLATE NOCASE {target_sort_dir}"
                
                else:
                    order_clause = "ORDER BY pmh_id ASC"

                offset = (page - 1) * limit
                query = f"SELECT * FROM data {where_clause} {order_clause} LIMIT ? OFFSET ?"
                c.execute(query, (limit, offset))

                data_rows = []
                for row in c.fetchall():
                    row_dict = dict(row)
                    row_dict.pop('pmh_status', None)
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

    def load_dashboard(self):
        """데이터테이블(data) 없이 메타데이터(dashboard)만 저장된 경우 호출"""
        with self._lock:
            if not os.path.exists(self.db_file): return None
            try:
                with self._get_conn() as conn:
                    c = conn.cursor()
                    c.execute("SELECT count(name) FROM sqlite_master WHERE type='table' AND name='meta'")
                    if c.fetchone()[0] == 0: return None
                    c.execute("SELECT payload FROM meta LIMIT 1")
                    row = c.fetchone()
                    if row and row[0]:
                        return json.loads(row[0])
            except: pass
            return None

# ==============================================================================
# [코어 UI 옵션 캐시 관리자 (Options Manager)]
# ==============================================================================
class CoreOptionsManager:
    def __init__(self, base_dir, tool_id, server_id="default"):
        self.db_file = os.path.join(base_dir, 'task_logs', f"{tool_id}_{server_id}_options.db")
        self._lock = threading.Lock()

    @contextmanager
    def _get_conn(self):
        conn = sqlite3.connect(self.db_file, timeout=10.0)
        conn.row_factory = sqlite3.Row
        
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute("PRAGMA synchronous=NORMAL;")
        conn.execute("PRAGMA temp_store=MEMORY;")
        
        try:
            yield conn
        finally:
            conn.commit()
            conn.close()

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
                    if row and row[0]:
                        return json.loads(row[0])
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


def _core_worker_runner(module, task_data, core_api, start_progress, tool_id):
    """코어가 띄우는 비동기 스레드 실행기 (서버 재시작 감지용 이름 설정)"""
    threading.current_thread().name = f"Worker_{tool_id}"
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

# -------------------------------------------------------------------
# 안전한 DB 접근 래퍼 (샌드박스 역할)
# -------------------------------------------------------------------
def create_db_api(db_path):
    def safe_query(query, params=()):
        if not query.strip().upper().startswith("SELECT"):
            raise ValueError("Security Error: Only SELECT queries are allowed in PMH Tools.")
            
        with get_db_connection(db_path) as conn:
            cursor = conn.cursor()
            cursor.execute(query, params)
            columns = [col[0] for col in cursor.description]
            return [dict(zip(columns, row)) for row in cursor.fetchall()]
            
    return {"query": safe_query}

# ==============================================================================
# [플러그인 도구(Tool) 관리 및 중앙 라우터]
# ==============================================================================
def _load_tool_module(tools_dir, tool_id, entry_file):
    file_path = os.path.join(tools_dir, tool_id, entry_file)
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"Entry file not found: {file_path}")
    
    module_name = f"pmh_tool_{tool_id}"
    spec = importlib.util.spec_from_file_location(module_name, file_path)

    if spec is None or spec.loader is None:
        raise ImportError(f"Failed to load spec for module: {module_name}")

    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

def dispatch_request(subpath, method, args, data, db_path, base_dir, max_batch_size=1000, plex_url="", plex_token="", global_config=None):
    """모든 API 요청을 분기하여 처리하는 중앙 라우터"""
    tools_dir = os.path.join(base_dir, 'tools')
    os.makedirs(tools_dir, exist_ok=True)

    try:
        if subpath == 'ping' and method == 'GET':
            return {"status": "ok", "version": __version__}, 200
            
        elif subpath == 'library/batch' and method == 'POST':
            return handle_library_batch(data, max_batch_size, db_path)
            
        elif subpath.startswith('media/') and method == 'GET':
            rating_key = subpath.split('/')[1]
            return handle_media_detail(rating_key, db_path)

        # ----------------------------------------------------------------------
        # 툴(Tool) 목록 조회 / 설치 / 삭제
        # ----------------------------------------------------------------------
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
                        print(f"[TOOL ERROR] Could not read {info_path}: {e}")
            return {"tools": installed_tools}, 200

        elif subpath == 'tools/install' and method == 'POST':
            yaml_url = data.get('url')
            prefix = data.get('prefix', '')
            target_id = data.get('target_id', '')
            if not yaml_url: return {"error": "info.yaml URL이 제공되지 않았습니다."}, 400

            req = urllib.request.Request(yaml_url, headers={'Cache-Control': 'no-cache'})
            with urllib.request.urlopen(req, timeout=10) as response:
                yaml_content = response.read().decode('utf-8')
                
            tool_info = yaml.safe_load(yaml_content)
            original_id = tool_info.get('id')
            entry_file = tool_info.get('entry_file', 'main.py')
            
            if not original_id: return {"error": "잘못된 info.yaml 구조입니다. ('id' 필드 누락)"}, 400

            if target_id:
                safe_tool_id = target_id
            else:
                safe_tool_id = f"{prefix}_{original_id}" if (prefix and not original_id.startswith(prefix + "_")) else original_id
                
            tool_info['id'] = safe_tool_id
            
            if not tool_info.get('update_url'):
                tool_info['update_url'] = yaml_url

            base_url = yaml_url.rsplit('/', 1)[0]
            py_req = urllib.request.Request(f"{base_url}/{entry_file}", headers={'Cache-Control': 'no-cache'})
            with urllib.request.urlopen(py_req, timeout=10) as py_response:
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
                print(f"[TOOL DELETE] {tool_id} 및 관련 데이터 완전 삭제됨.")
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

            if data is None: data = {}
            db_api = create_db_api(db_path)
            server_id = args.get('server_id', data.get('_server_id', 'default')) if data else args.get('server_id', 'default')
            
            task_mgr = CoreTaskManager(base_dir, tool_id, server_id)
            data_mgr = CoreDataManager(base_dir, tool_id, server_id)
            options_mgr = CoreOptionsManager(base_dir, tool_id, server_id)

            final_url = plex_url if str(plex_url).strip() else data.get('_plex_url', '')
            final_token = plex_token if str(plex_token).strip() else data.get('_plex_token', '')
            for key in ['_plex_url', '_plex_token', 'plex_url', 'plex_token']:
                data.pop(key, None)

            def get_plex_instance():
                from plexapi.server import PlexServer
                if not final_url or not final_token: raise ValueError("Plex 서버 정보가 누락되었습니다.")
                
                plex = PlexServer(final_url, final_token, timeout=120)
                
                orig_fetchItem = plex.fetchItem
                def safe_fetchItem(ekey, **kwargs):
                    if isinstance(ekey, str) and ekey.strip().isdigit():
                        ekey = f"/library/metadata/{ekey.strip()}"
                    elif isinstance(ekey, int):
                        ekey = f"/library/metadata/{ekey}"
                    return orig_fetchItem(ekey, **kwargs)
                
                plex.fetchItem = safe_fetchItem  # type: ignore
                
                return plex

            def send_discord_notify(title, message, color_hex="#51a351"):
                opts = options_mgr.load()
                if not opts.get('discord_enable', False): return
                
                url = opts.get('discord_webhook', '').strip() or (global_config.get('discord_webhook', '').strip() if global_config else '')
                if not url: return
                
                color_int = int(color_hex.lstrip('#'), 16) if color_hex.startswith('#') else 5349201
                payload = {
                    "embeds": [{
                        "title": title,
                        "description": message,
                        "color": color_int,
                        "footer": {"text": f"PMH Tool: {tool_id}"}
                    }]
                }
                try:
                    req = urllib.request.Request(url, data=json.dumps(payload).encode('utf-8'), headers={'Content-Type': 'application/json'}, method='POST')
                    urllib.request.urlopen(req, timeout=5)
                except Exception as e:
                    print(f"[Discord Error] {e}")

            core_api = {
                "query": db_api["query"],
                "get_plex": get_plex_instance,
                "task": task_mgr,
                "config": global_config or {},
                "cache": data_mgr,
                "options": options_mgr.load(),
                "notify": send_discord_notify
            }

            if action == 'ui' and method == 'GET':
                if hasattr(module, 'get_ui'): 
                    sig = inspect.signature(module.get_ui)
                    ui_data = module.get_ui(core_api) if len(sig.parameters) > 0 else module.get_ui()
                    
                    options_mgr = CoreOptionsManager(base_dir, tool_id, server_id)
                    ui_data['saved_options'] = options_mgr.load()

                    saved_task = task_mgr.load()
                    if saved_task:
                        if saved_task.get('state') == 'running':
                            active_threads = [t.name for t in threading.enumerate()]
                            if f"Worker_{tool_id}" not in active_threads:
                                task_mgr.update_state('error')
                                task_mgr.log("[System] 강제 종료(재시작)가 감지되어 이전 작업을 중단 상태(Error)로 변경했습니다.")
                                saved_task = task_mgr.load()

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
                if data is None: data = {}
                
                final_url = plex_url if str(plex_url).strip() else data.get('_plex_url', '')
                final_token = plex_token if str(plex_token).strip() else data.get('_plex_token', '')
                for key in ['_plex_url', '_plex_token', 'plex_url', 'plex_token']:
                    data.pop(key, None)
                
                def get_plex_instance():
                    from plexapi.server import PlexServer
                    if not final_url or not final_token: raise ValueError("Plex 서버 정보가 누락되었습니다.")
                    return PlexServer(final_url, final_token, timeout=120)

                action_type = data.get('action_type', 'preview')
                
                data_mgr = CoreDataManager(base_dir, tool_id, server_id)
                options_mgr = CoreOptionsManager(base_dir, tool_id, server_id)

                core_api = {
                    "query": db_api["query"],
                    "get_plex": get_plex_instance,
                    "task": task_mgr,
                    "config": global_config or {},
                    "cache": data_mgr,
                    "options": options_mgr.load(),
                    "notify": send_discord_notify
                }

                if action_type in ['preview', 'execute', 'page', 'save_options']:
                    current_opts = options_mgr.load()
                    for k, v in data.items():
                        if k not in ['action_type', '_server_id', '_plex_url', '_plex_token']:
                            current_opts[k] = v
                    options_mgr.save(current_opts)
                    
                    if action_type == 'save_options': return {"status": "success"}, 200

                # =================================================================
                # [내부 헬퍼] 데이터 정렬 수행 (단일 키 및 default_sort 다중 컬럼 지원)
                # =================================================================
                def _apply_sorting(data_list, columns, sort_key=None, sort_dir='asc', default_sort=None):
                    if not data_list: return data_list
                    col_map = {c['key']: c for c in columns} if columns else {}
                    def get_actual_key(k): return col_map.get(k, {}).get('sort_key', k)
                    def get_sort_type(k): return col_map.get(k, {}).get('sort_type', 'string')

                    if sort_key:
                        actual_k = get_actual_key(sort_key)
                        s_type = get_sort_type(sort_key)
                        if s_type == 'number':
                            data_list.sort(key=lambda x: float(x.get(actual_k, 0) or 0), reverse=(sort_dir == 'desc'))
                        else:
                            data_list.sort(key=lambda x: natural_sort_key(str(x.get(actual_k, ''))), reverse=(sort_dir == 'desc'))
                    elif default_sort:
                        rules = default_sort if isinstance(default_sort, list) else [default_sort]
                        for rule in reversed(rules):
                            r_key = rule.get('key')
                            r_dir = rule.get('dir', 'asc')
                            actual_k = get_actual_key(r_key)
                            s_type = get_sort_type(r_key)
                            if s_type == 'number':
                                data_list.sort(key=lambda x: float(x.get(actual_k, 0) or 0), reverse=(r_dir == 'desc'))
                            else:
                                data_list.sort(key=lambda x: natural_sort_key(str(x.get(actual_k, ''))), reverse=(r_dir == 'desc'))
                    return data_list

                # 1. 초기화 (Reset)
                if action_type == 'reset':
                    task_mgr.reset()
                    data_mgr.reset_db()
                    options_mgr.reset()
                    return {"status": "success", "message": "초기화 완료"}, 200

                # 2. 이어서 실행 (Resume)
                elif action_type == 'resume':
                    saved_task = task_mgr.load()
                    if not saved_task or 'task_data' not in saved_task:
                        return {"error": "이어서 실행할 작업 데이터가 없습니다."}, 400
                    
                    for k, v in data.items():
                        if k not in ['action_type', '_server_id', '_plex_url', '_plex_token']:
                            saved_task['task_data'][k] = v
                    task_mgr.save(saved_task) 

                    task_mgr.update_state('running')
                    task_mgr.log("최신 설정값을 적용하여 작업을 재개합니다...")
                    t = threading.Thread(target=_core_worker_runner, args=(module, saved_task['task_data'], core_api, saved_task.get('progress', 0), tool_id))
                    t.daemon = True
                    t.start()
                    return {"status": "success", "type": "async_task", "task_id": tool_id}, 200

                # 3. 데이터 로드 (페이징/정렬 및 대시보드 반환)
                elif action_type == 'page':
                    sort_key = data.get('sort_key')
                    sort_dir = data.get('sort_dir', 'asc')
                    page = int(data.get('page', 1))
                    limit = int(data.get('limit', 10))

                    # DB 엔진을 통한 페이징 로드 시도
                    cached = data_mgr.load_page(page, limit, sort_key, sort_dir)
                    
                    if not cached:
                        # 페이지 로드가 실패했다면, 혹시 대시보드 전용 툴인지 확인
                        cached = data_mgr.load_dashboard()
                        if not cached: return {"error": "캐시된 데이터가 없습니다."}, 404
                    
                    if cached.get('type') == 'dashboard':
                        return cached, 200

                    machine_id = cached.get('machine_id', "")
                    if not machine_id:
                        try:
                            plex = get_plex_instance()
                            machine_id = plex.machineIdentifier
                        except: pass
                    cached['machine_id'] = machine_id

                    t_data = task_mgr.load()
                    if t_data and 'logs' in t_data: cached['logs'] = t_data['logs']

                    return cached, 200

                # 4. 백그라운드 조회를 위한 내부 워커
                def _preview_worker():
                    try:
                        threading.current_thread().name = f"Worker_{tool_id}"
                        task_mgr.log("[Core] 백그라운드 데이터 수집 워커를 시작합니다.")
                        
                        res, code = module.run(data, core_api)
                        
                        if code == 200 and isinstance(res, dict):
                            task_mgr.log("[Core] 툴 시스템 로직 처리 완료. 결과 데이터 분석 중...")
                            
                            current_logs = []
                            t_data = task_mgr.load()
                            if t_data and 'logs' in t_data: current_logs = t_data['logs']
                            res['logs'] = current_logs

                            if res.get('type') == 'datatable':
                                task_mgr.log(f"[Core] 총 {len(res.get('data', [])):,}건의 데이터 정렬 및 메모리 캐싱을 준비합니다.")
                                res['data'] = _apply_sorting(res.get('data', []), res.get('columns', []), default_sort=res.get('default_sort'))
                                data_mgr.save(res)
                            elif res.get('type') == 'dashboard':
                                task_mgr.log("[Core] 대시보드 UI 데이터 패키징을 완료했습니다.")
                                data_mgr.save(res)
                            
                            task_mgr.log("[Core] 모든 처리가 완료되었습니다. 화면으로 복귀합니다.")
                            
                            current_state = task_mgr.load().get('state')
                            if current_state != 'cancelled':
                                final_total = task_mgr.load().get('total', 1)
                                task_mgr.update_state('completed', progress=final_total)
                        else:
                            task_mgr.update_state('error')
                            task_mgr.log(f"[Core Error] 데이터 추출 실패 (HTTP {code})")
                    except Exception as e:
                        import traceback
                        task_mgr.log(f"[Core Fatal] 작업 중 치명적 오류 발생: {str(e)}")
                        traceback.print_exc()
                        task_mgr.update_state('error')

                # 5. 조회(Preview) 요청 시 비동기 스레드 실행
                if action_type == 'preview':
                    task_mgr.reset()
                    task_mgr.init_task({"mode": "preview", "total": 1})
                    
                    t = threading.Thread(target=_preview_worker)
                    t.daemon = True
                    t.start()
                    
                    return {"status": "success", "type": "async_task", "task_id": tool_id, "is_preview": True}, 200

                # 6. 신규 실행 (Execute)
                if action_type == 'execute':
                    res, code = module.run(data, core_api)
                    if code == 200 and isinstance(res, dict) and res.get('type') == 'async_task':
                        task_data = res.get('task_data', {})
                        task_mgr.init_task(task_data)
                        t = threading.Thread(target=_core_worker_runner, args=(module, task_data, core_api, 0, tool_id))
                        t.daemon = True
                        t.start()
                        return {"status": "success", "type": "async_task", "task_id": tool_id}, 200
                    return res, code

                return {"error": "잘못된 접근입니다."}, 400

            # 3. 상태 폴링
            elif action == 'status' and method == 'GET':
                status_data = task_mgr.load()
                if not status_data: return {"error": "Task not found"}, 404
                
                # 서버 재시작 감지 및 에러 상태 전환
                if status_data.get('state') == 'running':
                    active_threads = [t.name for t in threading.enumerate()]
                    if f"Worker_{tool_id}" not in active_threads:
                        task_mgr.update_state('error')
                        task_mgr.log("[System] 서버 재시작이 감지되어 작업이 중지되었습니다.")
                        status_data = task_mgr.load()
                        
                return status_data, 200
                
            # 4. 작업 취소
            elif action == 'cancel' and method == 'POST':
                saved_task = task_mgr.load()
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
