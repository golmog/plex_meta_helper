# -*- coding: utf-8 -*-

import sqlite3
import os
import sys
import time
import logging
import re
import threading
import subprocess
import urllib.request
from contextlib import contextmanager
from flask import Flask, jsonify, request
from flask_cors import CORS

try:
    import yaml
except ImportError:
    print("[ERROR] 'pyyaml' 패키지가 설치되어 있지 않습니다.")
    print("터미널에서 'pip install pyyaml' 명령어를 실행한 후 다시 서버를 켜주세요.")
    sys.exit(1)

# ==============================================================================
# [버전 및 설정 관리]
# ==============================================================================
__version__ = "0.2.2"

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIG_FILE = os.path.join(BASE_DIR, "pmh_config.yaml")

UPDATE_URL = "https://raw.githubusercontent.com/golmog/plex_meta_helper/main/pmh_server.py"

DEFAULT_CONFIG = {
    "PLEX_DB_PATH": "/path/to/your/com.plexapp.plugins.library.db",
    "SERVER_PORT": 8899,
    "MAX_BATCH_SIZE": 1000,
    "API_KEY": "YOUR_PLEX_MATE_API_KEY_HERE"
}

UPDATE_URL = "https://raw.githubusercontent.com/golmog/plex_meta_helper/main/pmh_server.py"

DEFAULT_CONFIG = {
    "PLEX_DB_PATH": "/path/to/your/com.plexapp.plugins.library.db",
    "SERVER_PORT": 8899,
    "MAX_BATCH_SIZE": 1000,
    "API_KEY": "YOUR_PLEX_MATE_API_KEY_HERE"
}

def load_config():
    if not os.path.exists(CONFIG_FILE):
        print(f"[CONFIG] YAML 설정 파일이 존재하지 않아 새로 생성합니다: {CONFIG_FILE}")
        with open(CONFIG_FILE, 'w', encoding='utf-8') as f:
            yaml.dump(DEFAULT_CONFIG, f, default_flow_style=False, allow_unicode=True, sort_keys=False)
        return DEFAULT_CONFIG
    
    print(f"[CONFIG] 기존 YAML 설정 파일을 불러옵니다: {CONFIG_FILE}")
    with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
        return yaml.safe_load(f)

cfg = load_config()
PLEX_DB_PATH = cfg.get("PLEX_DB_PATH", DEFAULT_CONFIG["PLEX_DB_PATH"])
SERVER_PORT = cfg.get("SERVER_PORT", DEFAULT_CONFIG["SERVER_PORT"])
MAX_BATCH_SIZE = cfg.get("MAX_BATCH_SIZE", DEFAULT_CONFIG["MAX_BATCH_SIZE"])
API_KEY = cfg.get("API_KEY", DEFAULT_CONFIG["API_KEY"])

# ==============================================================================
# [Flask 앱 초기화]
# ==============================================================================
app = Flask(__name__)
CORS(app)
log = logging.getLogger('werkzeug')
log.setLevel(logging.ERROR)

@contextmanager
def get_db_connection():
    if not os.path.exists(PLEX_DB_PATH):
        raise FileNotFoundError(f"DB File not found: {PLEX_DB_PATH}")
    conn = None
    try:
        conn = sqlite3.connect(f'file:{PLEX_DB_PATH}?mode=ro', uri=True, timeout=10.0)
        yield conn
    except sqlite3.OperationalError as e:
        print(f"[DB ERROR] SQLite Operational Error: {str(e)}")
        raise
    except Exception as e:
        print(f"[DB ERROR] Connection failed: {str(e)}")
        raise
    finally:
        if conn:
            conn.close()

def is_season_folder(folder_name):
    name_lower = folder_name.lower().strip()
    if re.match(r'^(season|시즌|series)\s*\d+', name_lower): return True
    if re.match(r'^(specials?|스페셜)$', name_lower): return True
    if name_lower.isdigit(): return True
    return False

@app.before_request
def check_api_key():
    if request.method == "OPTIONS":
        return
    provided_key = request.headers.get("X-API-Key")
    if not provided_key or provided_key != API_KEY:
        print(f"[SECURITY] Unauthorized access attempt blocked. IP: {request.remote_addr}")
        return jsonify({"error": "Unauthorized. Invalid API Key."}), 401

# ==============================================================================
# [API 엔드포인트]
# ==============================================================================
@app.route('/api/ping', methods=['GET'])
def api_ping():
    print("[API] GET /api/ping - Responding with version info.")
    return jsonify({"status": "ok", "version": __version__})


def restart_server():
    """
    현재 프로세스를 강제 종료하고 포트를 반환한 뒤, 
    새로운 독립된 파이썬 프로세스를 실행하여 스크립트를 재구동합니다.
    """
    time.sleep(1)
    print("[UPDATE] Shutting down current server to release port...")
    
    current_script = os.path.abspath(__file__)
    
    if sys.platform == "win32":
        subprocess.Popen(['start', 'cmd', '/c', sys.executable, current_script], shell=True)
    else:
        subprocess.Popen(['nohup', sys.executable, current_script], preexec_fn=os.setsid, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    
    print("[UPDATE] New process launched. Terminating old process...")
    os._exit(0)


@app.route('/api/admin/update', methods=['POST'])
def api_admin_update():
    print("[UPDATE] Update request received. Downloading latest script from GitHub...")
    try:
        req = urllib.request.Request(UPDATE_URL, headers={'Cache-Control': 'no-cache'})
        with urllib.request.urlopen(req, timeout=10) as response:
            new_code = response.read().decode('utf-8')
            
        if "__version__" not in new_code or "Flask" not in new_code:
            raise ValueError("Downloaded code seems invalid (missing key signatures).")

        current_file = os.path.abspath(__file__)
        print(f"[UPDATE] Overwriting current file: {current_file}")
        with open(current_file, 'w', encoding='utf-8') as f:
            f.write(new_code)
            
        print("[UPDATE] File successfully overwritten. Scheduling restart...")
        threading.Thread(target=restart_server).start()
        
        return jsonify({"status": "success", "message": "Server is updating and restarting."})
    except Exception as e:
        print(f"[UPDATE ERROR] Failed to update: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/library/batch', methods=['POST'])
def api_library_batch():
    start_time = time.time()
    data = request.get_json()
    if not data or 'ids' not in data:
        print("[BATCH] Rejected: Invalid request format.")
        return jsonify({"error": "Invalid request"}), 400
        
    raw_ids = [str(i) for i in data['ids'] if str(i).isdigit()]
    ids = list(set(raw_ids))[:MAX_BATCH_SIZE] 
    if not ids: return jsonify({})
    
    print(f"[BATCH] Requested {len(ids)} items.")
    placeholders = ','.join('?' for _ in ids)
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            query = f"""
            SELECT mi.id, m.width,
                (SELECT group_concat(ms.codec || '|' || IFNULL(ms.extra_data, ''), ';;') FROM media_streams ms WHERE ms.media_item_id = m.id AND ms.stream_type_id = 1) as raw_stream_data,
                (SELECT group_concat(IFNULL(ms.language, 'und'), ',') FROM media_streams ms WHERE ms.media_item_id = m.id AND ms.stream_type_id = 3) as sub_langs,
                mi.guid, mp.file, mp.id
            FROM metadata_items mi
            LEFT JOIN media_items m ON m.metadata_item_id = mi.id
            LEFT JOIN media_parts mp ON mp.media_item_id = m.id
            WHERE mi.id IN ({placeholders}) ORDER BY m.width DESC, m.bitrate DESC
            """
            cursor.execute(query, ids)
            result_map = {}
            for rk, width, raw_data, sub_langs, guid, filepath, part_id in cursor.fetchall():
                rk = str(rk)
                if rk not in result_map:
                    clean_guid = guid.split("://")[1].split("?")[0] if guid and "://" in guid else (guid or "")
                    if not filepath:
                        result_map[rk] = { "tags": [], "g": clean_guid, "raw_g": guid or "", "p": "", "part_id": None }
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
                    if sub_langs:
                        langs = sub_langs.lower().split(',')
                        if any(l.startswith('kor') or l.startswith('ko') for l in langs if l): has_sub = True
                    if has_sub: tags.append("SUB")
                    elif filepath and re.search(r'(?i)(kor-?sub|자체자막)', filepath): tags.append("SUBBED")
                    result_map[rk] = { "tags": tags, "g": clean_guid, "raw_g": guid or "", "p": filepath, "part_id": part_id }
        exec_time = time.time() - start_time
        print(f"[BATCH] Successfully processed {len(result_map)} items in {exec_time:.3f}s")
        return jsonify(result_map)
    except Exception as e:
        print(f"[BATCH ERROR] Failed processing batch: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/media/<rating_key>', methods=['GET'])
def api_media_detail(rating_key):
    start_time = time.time()
    if not rating_key.isdigit(): 
        print(f"[DETAIL] Rejected: Invalid rating_key ({rating_key})")
        return jsonify({"error": "Invalid rating_key"}), 400

    print(f"[DETAIL] Fetching details for Item: {rating_key}")
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT metadata_type, guid, library_section_id FROM metadata_items WHERE id = ?", (rating_key,))
            meta_row = cursor.fetchone()
            if not meta_row: 
                print(f"[DETAIL] Item {rating_key} not found in DB.")
                return jsonify({"error": "Item not found"}), 404
            m_type, guid, lib_section_id = meta_row
            
            if m_type in (2, 3):
                folder_paths, seen_paths = [], set()
                if m_type == 2:
                    query = """SELECT mp.file FROM metadata_items ep JOIN metadata_items sea ON ep.parent_id = sea.id JOIN media_items m ON m.metadata_item_id = ep.id JOIN media_parts mp ON mp.media_item_id = m.id WHERE sea.parent_id = ? AND ep.metadata_type = 4 ORDER BY m.width DESC, m.bitrate DESC"""
                    cursor.execute(query, (rating_key,))
                    for row in cursor.fetchall():
                        if row and row[0]:
                            dir_path = os.path.dirname(row[0])
                            target_path = os.path.dirname(dir_path) if is_season_folder(os.path.basename(dir_path)) else dir_path
                            if target_path not in seen_paths:
                                seen_paths.add(target_path)
                                folder_paths.append(target_path)
                elif m_type == 3:
                    query = """SELECT mp.file FROM metadata_items ep JOIN media_items m ON m.metadata_item_id = ep.id JOIN media_parts mp ON mp.media_item_id = m.id WHERE ep.parent_id = ? AND ep.metadata_type = 4 ORDER BY m.width DESC, m.bitrate DESC"""
                    cursor.execute(query, (rating_key,))
                    for row in cursor.fetchall():
                        if row and row[0]:
                            target_path = os.path.dirname(row[0])
                            if target_path not in seen_paths:
                                seen_paths.add(target_path)
                                folder_paths.append(target_path)
                versions = [{"file": path, "parts": [{"path": path}]} for path in folder_paths]
                exec_time = time.time() - start_time
                print(f"[DETAIL] Directory {rating_key} parsed in {exec_time:.3f}s. Found {len(versions)} paths.")
                return jsonify({ "type": "directory", "itemId": rating_key, "guid": guid, "duration": None, "librarySectionID": lib_section_id, "versions": versions })
                
            query_media = """SELECT m.id, m.width, m.height, (SELECT bitrate FROM media_streams WHERE media_item_id = m.id AND stream_type_id = 1 LIMIT 1) as v_bitrate, (SELECT group_concat(ms.codec || '|' || IFNULL(ms.extra_data, ''), ';;') FROM media_streams ms WHERE media_item_id = m.id AND stream_type_id = 1) as raw_stream_data, m.video_codec, m.audio_codec, m.duration, (SELECT channels FROM media_streams WHERE media_item_id = m.id AND stream_type_id = 2 LIMIT 1) as audio_ch, (SELECT bitrate FROM media_streams WHERE media_item_id = m.id AND stream_type_id = 2 LIMIT 1) as a_bitrate, mp.id, mp.file FROM media_items m LEFT JOIN media_parts mp ON mp.media_item_id = m.id WHERE m.metadata_item_id = ? ORDER BY m.width DESC, m.bitrate DESC"""
            cursor.execute(query_media, (rating_key,))
            versions, duration = [], 0
            for row in cursor.fetchall():
                m_id, width, height, v_bitrate, raw_data, v_codec, a_codec, dur, a_ch, a_bitrate, part_id, file_path = row
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
                
        exec_time = time.time() - start_time
        print(f"[DETAIL] Video {rating_key} parsed in {exec_time:.3f}s. Found {len(versions)} versions.")
        return jsonify({ "type": "video", "itemId": rating_key, "guid": guid, "duration": duration, "librarySectionID": lib_section_id, "versions": versions, "markers": markers })
    except Exception as e:
        print(f"[DETAIL ERROR] Failed processing item {rating_key}: {str(e)}")
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    print(f">>> PMH API Server [v{__version__}] initialized.")
    print(f">>> Listening on port {SERVER_PORT} | Database Path: {PLEX_DB_PATH}")
    app.run(host='0.0.0.0', port=SERVER_PORT)
