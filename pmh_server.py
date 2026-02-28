# -*- coding: utf-8 -*-

import os
import sys
import logging
import urllib.request
import importlib
from flask import Flask, jsonify, request
from flask_cors import CORS

try:
    import yaml
except ImportError:
    print("[ERROR] 'pyyaml' 패키지가 설치되어 있지 않습니다.")
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

CORE_FILE_PATH = os.path.join(BASE_DIR, "pmh_core.py")
if not os.path.exists(CORE_FILE_PATH):
    print("[BOOTSTRAP] pmh_core.py 가 존재하지 않아 GitHub에서 다운로드합니다...")
    try:
        urllib.request.urlretrieve(CORE_URL, CORE_FILE_PATH)
        print("[BOOTSTRAP] 다운로드 완료.")
    except Exception as e:
        print(f"[BOOTSTRAP ERROR] 코어 모듈 다운로드 실패: {e}")
        sys.exit(1)

import pmh_core

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
        print(f"[SECURITY] Unauthorized access attempt blocked. IP: {request.remote_addr}")
        return jsonify({"error": "Unauthorized. Invalid API Key."}), 401

# ==============================================================================
# [API 라우팅 (프록시)]
# ==============================================================================
@app.route('/api/ping', methods=['GET'])
def api_ping():
    print(f"[API] GET /api/ping - Responding with core version: {pmh_core.get_version()}")
    return jsonify({"status": "ok", "version": pmh_core.get_version()})

@app.route('/api/admin/update', methods=['POST'])
def api_admin_update():
    """서버 프로세스를 재시작하지 않고 pmh_core.py 만 교체하여 메모리에 리로드합니다."""
    print("[UPDATE] Update request received. Downloading latest core module...")
    try:
        req = urllib.request.Request(CORE_URL, headers={'Cache-Control': 'no-cache'})
        with urllib.request.urlopen(req, timeout=10) as response:
            new_code = response.read().decode('utf-8')
            
        if "__version__" not in new_code:
            raise ValueError("Downloaded code seems invalid (missing __version__).")

        with open(CORE_FILE_PATH, 'w', encoding='utf-8') as f:
            f.write(new_code)
            
        print("[UPDATE] Core file overwritten. Reloading module in memory...")
        importlib.reload(pmh_core)
        
        try:
            req_svr = urllib.request.Request(SERVER_URL, headers={'Cache-Control': 'no-cache'})
            with urllib.request.urlopen(req_svr, timeout=5) as response_svr:
                with open(os.path.abspath(__file__), 'w', encoding='utf-8') as f:
                    f.write(response_svr.read().decode('utf-8'))
        except:
            pass

        print(f"[UPDATE] Successfully updated and reloaded to v{pmh_core.get_version()} without restarting process.")
        return jsonify({"status": "success", "version": pmh_core.get_version()})
    except Exception as e:
        print(f"[UPDATE ERROR] Failed to update core: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/library/batch', methods=['POST'])
def api_library_batch():
    result, code = pmh_core.handle_library_batch(request.get_json(), MAX_BATCH_SIZE, PLEX_DB_PATH)
    return jsonify(result), code

@app.route('/api/media/<rating_key>', methods=['GET'])
def api_media_detail(rating_key):
    result, code = pmh_core.handle_media_detail(rating_key, PLEX_DB_PATH)
    return jsonify(result), code

if __name__ == '__main__':
    print(f">>> PMH API Server (Gateway) initialized.")
    print(f">>> Core Loaded: v{pmh_core.get_version()}")
    print(f">>> Listening on port {SERVER_PORT} | Database Path: {PLEX_DB_PATH}")
    app.run(host='0.0.0.0', port=SERVER_PORT)
