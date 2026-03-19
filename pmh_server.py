# -*- coding: utf-8 -*-

import os
import sys
import logging
import urllib.request
import importlib
import time
from flask import Flask, jsonify, request
from flask_cors import CORS

try:
    import yaml
except ImportError:
    print("[PMH ERROR] 'pyyaml' 패키지가 설치되어 있지 않습니다.")
    print("터미널에서 'pip install pyyaml' 명령어를 실행한 후 다시 시작해주세요.")
    sys.exit(1)

# ==============================================================================
# [설정 및 부트스트랩]
# ==============================================================================
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIG_FILE = os.path.join(BASE_DIR, "pmh_config.yaml")

CORE_URL = "https://raw.githubusercontent.com/golmog/plex_meta_helper/main/pmh_core.py"
SERVER_URL = "https://raw.githubusercontent.com/golmog/plex_meta_helper/main/pmh_server.py"

DEFAULT_CONFIG = {
    "PLEX_DB_PATH": "/path/to/your/com.plexapp.plugins.library.db",
    "PLEX_URL": "http://plex:32400",
    "PLEX_TOKEN": "",
    "SERVER_PORT": 8899,
    "MAX_BATCH_SIZE": 1000,
    "API_KEY": "YOUR_PLEX_MATE_API_KEY_HERE",
    "PLEX_MATE_URL": "http://127.0.0.1:9999",
    "DISCORD_WEBHOOK": "",
    "PLEX_SQLITE_BIN": "/usr/lib/plexmediaserver/Plex SQLite",
    "PATH_MAPPINGS": [
        "/mnt/gds/|/mnt/gds/"
    ]
}

def load_config():
    if not os.path.exists(CONFIG_FILE):
        print(f"[PMH CONFIG] YAML 설정 파일이 존재하지 않아 새로 생성합니다: {CONFIG_FILE}")
        with open(CONFIG_FILE, 'w', encoding='utf-8') as f:
            yaml.dump(DEFAULT_CONFIG, f, default_flow_style=False, allow_unicode=True, sort_keys=False)
        return DEFAULT_CONFIG
    
    print(f"[PMH CONFIG] 기존 YAML 설정 파일을 불러옵니다: {CONFIG_FILE}")
    with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
        return yaml.safe_load(f)

cfg = load_config()
PLEX_DB_PATH = cfg.get("PLEX_DB_PATH", DEFAULT_CONFIG["PLEX_DB_PATH"])
PLEX_URL = cfg.get("PLEX_URL", DEFAULT_CONFIG["PLEX_URL"])
PLEX_TOKEN = cfg.get("PLEX_TOKEN", DEFAULT_CONFIG["PLEX_TOKEN"])
SERVER_PORT = cfg.get("SERVER_PORT", DEFAULT_CONFIG["SERVER_PORT"])
MAX_BATCH_SIZE = cfg.get("MAX_BATCH_SIZE", DEFAULT_CONFIG["MAX_BATCH_SIZE"])
API_KEY = cfg.get("API_KEY", DEFAULT_CONFIG["API_KEY"])
PLEX_MATE_URL = cfg.get("PLEX_MATE_URL", DEFAULT_CONFIG["PLEX_MATE_URL"])
PATH_MAPPINGS = cfg.get("PATH_MAPPINGS", DEFAULT_CONFIG["PATH_MAPPINGS"])
DISCORD_WEBHOOK = cfg.get("DISCORD_WEBHOOK", DEFAULT_CONFIG["DISCORD_WEBHOOK"])
PLEX_SQLITE_BIN = cfg.get("PLEX_SQLITE_BIN", DEFAULT_CONFIG["PLEX_SQLITE_BIN"])

global_conf = {
    "base_dir": BASE_DIR,
    "plex_db_path": PLEX_DB_PATH,
    "plex_url": PLEX_URL,
    "plex_token": PLEX_TOKEN,
    "plex_sqlite_bin": PLEX_SQLITE_BIN,
    "max_batch_size": MAX_BATCH_SIZE,
    "mate_apikey": API_KEY,
    "mate_url": PLEX_MATE_URL,
    "path_mappings": PATH_MAPPINGS,
    "discord_webhook": DISCORD_WEBHOOK
}

CORE_FILE_PATH = os.path.join(BASE_DIR, "pmh_core.py")
if not os.path.exists(CORE_FILE_PATH):
    print("[PMH BOOTSTRAP] pmh_core.py 가 존재하지 않아 GitHub에서 다운로드합니다...")
    try:
        urllib.request.urlretrieve(CORE_URL, CORE_FILE_PATH)
        print("[PMH BOOTSTRAP] 다운로드 완료.")
    except Exception as e:
        print(f"[PMH BOOTSTRAP ERROR] 코어 모듈 다운로드 실패: {e}")
        sys.exit(1)

import pmh_core
pmh_core.start_scheduler_daemon(global_conf)

# ==============================================================================
# [Flask 앱 초기화]
# ==============================================================================
app = Flask(__name__)
CORS(app)
log = logging.getLogger('werkzeug')
log.setLevel(logging.ERROR)

@app.before_request
def check_api_key():
    if request.method == "OPTIONS":
        return
    provided_key = request.headers.get("X-API-Key")
    if not provided_key or provided_key != API_KEY:
        print(f"[PMH SECURITY] Unauthorized access attempt blocked. IP: {request.remote_addr}")
        return jsonify({"error": "Unauthorized. Invalid API Key."}), 401

# ==============================================================================
# [서버 전용 라우팅] (코어 업데이트)
# ==============================================================================
@app.route('/api/admin/update', methods=['POST'])
def api_admin_update():
    req_data = request.get_json() if request.is_json else {}
    force_update = req_data.get('force', False)
    
    try:
        is_ready, running_count, msg = pmh_core.check_update_readiness(BASE_DIR, force_update)
        
        if not is_ready:
            print(f"[PMH UPDATE ERROR] Blocked by Core. {msg}")
            return jsonify({
                "status": "error", 
                "running_count": running_count,
                "message": msg
            }), 400
            
    except AttributeError:
        print("[PMH UPDATE WARNING] 'check_update_readiness' not found in current core. Proceeding update blindly.")
    except Exception as e:
        print(f"[PMH UPDATE ERROR] Core readiness check failed: {e}")
        return jsonify({"status": "error", "message": f"코어 상태 확인 실패: {e}"}), 500

    print("[PMH UPDATE] Update request received. Downloading latest core module...")
    try:
        ts = int(time.time())
        req = urllib.request.Request(f"{CORE_URL}?t={ts}", headers={'Cache-Control': 'no-cache'})
        with urllib.request.urlopen(req, timeout=10) as response:
            new_code = response.read().decode('utf-8')

        if "__version__" not in new_code:
            raise ValueError("Downloaded code seems invalid (missing __version__).")

        with open(CORE_FILE_PATH, 'w', encoding='utf-8') as f:
            f.write(new_code)
            
        print("[PMH UPDATE] Core file overwritten. Reloading module in memory...")
        importlib.reload(pmh_core)
        
        pmh_core.start_scheduler_daemon(global_conf)

        try:
            req_svr = urllib.request.Request(f"{SERVER_URL}?t={ts}", headers={'Cache-Control': 'no-cache'})
            with urllib.request.urlopen(req_svr, timeout=5) as response_svr:
                with open(os.path.abspath(__file__), 'w', encoding='utf-8') as f:
                    f.write(response_svr.read().decode('utf-8'))
        except:
            pass

        print(f"[PMH UPDATE] Successfully updated and reloaded to v{pmh_core.get_version()} without restarting process.")
        return jsonify({"status": "success", "version": pmh_core.get_version()})
    except Exception as e:
        print(f"[PMH UPDATE ERROR] Failed to update core: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500

# ==============================================================================
# [동적 라우팅 게이트웨이]
# ==============================================================================
@app.route('/api/<path:subpath>', methods=['GET', 'POST', 'PUT', 'DELETE'])
def api_gateway(subpath):
    method = request.method
    args = request.args.to_dict()
    
    if not (subpath == 'ping' or subpath.endswith('/status') or subpath.endswith('/run')):
        print(f"[PMH API] {method} /{subpath}")
    
    json_data = None
    if method in ['POST', 'PUT'] and request.is_json:
        json_data = request.get_json()

    result, status_code = pmh_core.dispatch_request(
        subpath=subpath,
        method=method,
        args=args,
        data=json_data,
        global_config=global_conf
    )
    
    return jsonify(result), status_code

if __name__ == '__main__':
    tz_info = time.strftime('%z (%Z)')
    print("[PMH SYSTEM] >>> PMH API Server (Gateway) initialized.")
    print(f"[PMH SYSTEM] >>> Core Loaded: v{pmh_core.get_version()}")
    print(f"[PMH SYSTEM] >>> Server Timezone: {tz_info}")
    print(f"[PMH SYSTEM] >>> Listening on port {SERVER_PORT} | DB: {PLEX_DB_PATH}")
    app.run(host='0.0.0.0', port=SERVER_PORT)
