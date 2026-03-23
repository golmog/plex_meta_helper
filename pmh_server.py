# -*- coding: utf-8 -*-

import os
import sys
import logging
import urllib.request
import urllib.error
import importlib
import time
import yaml
from flask import Flask, jsonify, request, Response, send_file
from flask_cors import CORS

# ==============================================================================
# [설정 및 부트스트랩]
# ==============================================================================
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIG_FILE = os.path.join(BASE_DIR, "pmh_config.yaml")

CORE_URL = "https://raw.githubusercontent.com/golmog/plex_meta_helper/v0.8-alpha/pmh_core.py"
SERVER_URL = "https://raw.githubusercontent.com/golmog/plex_meta_helper/v0.8-alpha/pmh_server.py"

INFO_YAML_URL = "https://raw.githubusercontent.com/golmog/plex_meta_helper/v0.8-alpha/info.yaml"

YAML_TEMPLATE = """# ==============================================================================
# [BASE] - 이 서버(노드) 자체의 구동 환경 설정
# ==============================================================================
BASE:
  PORT: 8899
  APIKEY: "YOUR_SECRET_KEY"

  # Plex 서버 설정 (Plex API 통신용)
  PLEX_URL: "http://127.0.0.1:32400"
  PLEX_TOKEN: "YOUR_PLEX_TOKEN"
  PLEX_MACHINE_IDENTIFIER: "YOUR_PLEX_MACHINE_ID_HERE"
  
  # Plex 메인 DB 파일 경로 및 SQLite 바이너리 경로
  PLEX_DB_PATH: "/config/Library/Application Support/Plex Media Server/Plug-in Support/Databases/com.plexapp.plugins.library.db"
  PLEX_SQLITE_BIN: "/usr/lib/plexmediaserver/Plex SQLite"

  # FF(Plex Mate) 연결 정보
  FF_URL: "http://127.0.0.1:9999"
  FF_APIKEY: "YOUR_FF_API_KEY_HERE"
  
  # (선택) 노드 전역 디스코드 알림 웹훅 URL
  DISCORD_WEBHOOK: ""

# ==============================================================================
# [MASTER] - 프론트엔드 전역 설정 및 게이트웨이 라우팅
# ==============================================================================
# MASTER 설정이 활성화되어 있으면 이 서버는 마스터(Gateway) 역할을 수행합니다.
# 워커 노드로만 사용할 경우 아래 MASTER 블록 전체를 삭제하거나 주석 처리하세요.
# MASTER:
#   DISPLAY_PATH_PREFIXES_TO_REMOVE:
#     - "/mnt"

#   USER_TAGS:
#     PRIORITY_GROUP:
#       - name: "LEAK"
#         pattern: "(leaked|유출)"
#       - name: "MOPA"
#         pattern: "(mopa|모파|모자이크제거)"
#         target: "path"
#     INDEPENDENT:
#       - name: "REMUX"
#         pattern: "remux"
#         target: "path"
        
#   NODES:
    # 첫 번째 노드(마스터 자신)는 설정하지 않아도 프론트엔드에 자동 포함됩니다.
    # 추가 워커 노드가 있다면 아래에 등록합니다.
    # - id: "worker_node_1"
    #   name: "2.MUSIC"
    #   url: "http://192.168.1.100:8899"
    #   apikey: "WORKER_SECRET_KEY"
"""

def load_config():
    if not os.path.exists(CONFIG_FILE):
        print(f"[PMH CONFIG] 설정 파일({CONFIG_FILE})이 존재하지 않습니다.")
        print("[PMH CONFIG] 기본 템플릿을 생성했습니다. 파일을 환경에 맞게 수정한 후 서버를 다시 시작해주세요.")
        with open(CONFIG_FILE, 'w', encoding='utf-8') as f:
            f.write(YAML_TEMPLATE)
        sys.exit(1)
    
    print(f"[PMH CONFIG] 설정 파일을 불러옵니다: {CONFIG_FILE}")
    with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
        return yaml.safe_load(f)

cfg = load_config()
if not cfg or "BASE" not in cfg:
    print("[PMH CONFIG FATAL] 설정 파일에 'BASE' 항목이 없습니다. 설정을 확인하세요.")
    sys.exit(1)

BASE_CFG = cfg.get("BASE", {})
MASTER_CFG = cfg.get("MASTER", None)

IS_MASTER = MASTER_CFG is not None

SERVER_PORT = BASE_CFG.get("PORT", 8899)
API_KEY = BASE_CFG.get("APIKEY", "")

global_conf = {
    "base_dir": BASE_DIR,
    "plex_db_path": BASE_CFG.get("PLEX_DB_PATH", ""),
    "plex_url": BASE_CFG.get("PLEX_URL", ""),
    "plex_token": BASE_CFG.get("PLEX_TOKEN", ""),
    "plex_sqlite_bin": BASE_CFG.get("PLEX_SQLITE_BIN", ""),
    "mate_apikey": BASE_CFG.get("FF_APIKEY", ""),
    "mate_url": BASE_CFG.get("FF_URL", ""),
    "discord_webhook": BASE_CFG.get("DISCORD_WEBHOOK", ""),
    "machine_id": BASE_CFG.get("PLEX_MACHINE_IDENTIFIER", ""),
    "is_master": IS_MASTER
}

def download_file_if_missing(url, filename):
    file_path = os.path.join(BASE_DIR, filename)
    if not os.path.exists(file_path):
        print(f"[PMH BOOTSTRAP] {filename} 파일이 존재하지 않아 다운로드합니다...")
        try:
            urllib.request.urlretrieve(url, file_path)
            print(f"[PMH BOOTSTRAP] {filename} 다운로드 완료.")
        except Exception as e:
            print(f"[PMH BOOTSTRAP WARNING] {filename} 다운로드 실패: {e}")

CORE_FILE_PATH = os.path.join(BASE_DIR, "pmh_core.py")
if not os.path.exists(CORE_FILE_PATH):
    print("[PMH BOOTSTRAP] pmh_core.py 가 존재하지 않아 GitHub에서 다운로드합니다...")
    try:
        urllib.request.urlretrieve(CORE_URL, CORE_FILE_PATH)
        print("[PMH BOOTSTRAP] 코어 다운로드 완료.")
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
    # 1. CORS Preflight 허용
    if request.method == "OPTIONS":
        return
    
    # 2. PWA 앱(index.html) 로드 및 파비콘 등 정적 파일 접근은 인증 없이 허용
    if request.path == '/' or request.path == '/favicon.ico':
        return
        
    # 3. 실제 API 통신(/api/...)에 대해서만 보안 키 검사 수행
    provided_key = request.headers.get("X-API-Key")
    if not provided_key or provided_key != API_KEY:
        print(f"[PMH SECURITY] 🚫 인증 실패. (IP: {request.remote_addr}, Path: {request.path})")
        return jsonify({"error": "Unauthorized. Invalid API Key."}), 401

# ==============================================================================
# [서버 전용 라우팅] (코어 업데이트)
# ==============================================================================
def background_update_task():
    print("[PMH UPDATE BACKGROUND] 워커 스레드 완전 종료 대기 및 코어 업데이트를 시작합니다...")
    try:
        time.sleep(3)
        import threading
        active_workers = [t for t in threading.enumerate() if t.name.startswith("Worker_")]
        max_wait = 15
        waited = 0
        while active_workers and waited < max_wait:
            time.sleep(1)
            waited += 1
            active_workers = [t for t in threading.enumerate() if t.name.startswith("Worker_")]
        
        if active_workers:
            print(f"[PMH UPDATE WARNING] {waited}초 대기 후에도 {len(active_workers)}개의 스레드가 종료되지 않아 강제로 코드를 덮어씁니다.")
        else:
            print("[PMH UPDATE BACKGROUND] 모든 워커 종료 확인 완료. 최신 코드를 다운로드합니다.")

        ts = int(time.time())
        req_core = urllib.request.Request(f"{CORE_URL}?t={ts}", headers={'Cache-Control': 'no-cache'})
        with urllib.request.urlopen(req_core, timeout=10) as response:
            with open(CORE_FILE_PATH, 'w', encoding='utf-8') as f:
                f.write(response.read().decode('utf-8'))
                
        # [NEW] 2. 정적 리소스(HTML, JS, CSS) 업데이트 (별도 함수로 래핑 권장)
        def update_file(url, filename):
            try:
                req = urllib.request.Request(f"{url}?t={ts}", headers={'Cache-Control': 'no-cache'})
                with urllib.request.urlopen(req, timeout=5) as resp:
                    with open(os.path.join(BASE_DIR, filename), 'w', encoding='utf-8') as f:
                        f.write(resp.read().decode('utf-8'))
            except Exception as e:
                print(f"[PMH UPDATE WARNING] {filename} 업데이트 실패: {e}")
            
        importlib.reload(pmh_core)
        pmh_core.start_scheduler_daemon(global_conf)
        print(f"[PMH UPDATE BACKGROUND] 코어 업데이트 및 리로드 완료! (v{pmh_core.get_version()})")

        try:
            req_svr = urllib.request.Request(f"{SERVER_URL}?t={ts}", headers={'Cache-Control': 'no-cache'})
            with urllib.request.urlopen(req_svr, timeout=5) as response_svr:
                with open(os.path.abspath(__file__), 'w', encoding='utf-8') as f:
                    f.write(response_svr.read().decode('utf-8'))
            print("[PMH UPDATE BACKGROUND] 서버 스크립트 갱신 성공 (다음 재시작 시 반영됨).")
        except Exception as e: 
            print(f"[PMH UPDATE WARNING] 서버 스크립트 갱신 실패 (무시됨): {e}")

    except Exception as e:
        print(f"[PMH UPDATE FATAL ERROR] 백그라운드 업데이트 실패: {e}")

@app.route('/api/admin/update', methods=['POST'])
def api_admin_update():
    req_data = request.get_json() if request.is_json else {}
    force_update = req_data.get('force', False)
    
    try:
        is_ready, running_count, msg = pmh_core.check_update_readiness(BASE_DIR, force_update)
        
        if not is_ready:
            print(f"[PMH UPDATE] 거부됨: {msg}")
            return jsonify({"status": "error", "running_count": running_count, "message": msg}), 400
            
    except Exception as e:
        print(f"[PMH UPDATE ERROR] 상태 확인 실패: {e}")
        return jsonify({"status": "error", "message": f"코어 상태 확인 실패: {e}"}), 500

    import threading
    t = threading.Thread(target=background_update_task, name="PMH_Updater")
    t.daemon = True
    t.start()

    return jsonify({
        "status": "success", 
        "message": "Update process started in background.",
        "version": pmh_core.get_version()
    })

# ==============================================================================
# 프론트엔드 클라이언트 초기화 동기화 라우팅
# ==============================================================================
NODE_INFO_CACHE = {}

@app.route('/api/client/config', methods=['GET'])
def get_client_config():
    if not IS_MASTER:
        return jsonify({"error": "이 서버는 Master 노드가 아닙니다."}), 400
    
    servers = [{
        "id": "master_node",
        "name": "1.MAIN (Master)",
        "machine_id": BASE_CFG.get("PLEX_MACHINE_IDENTIFIER", "")
    }]
    
    for node in MASTER_CFG.get("NODES", []):
        node_id = node.get("id", "")
        machine_id = node.get("machine_id", "") # YAML에 하드코딩 되어있으면 우선 사용
        
        # YAML에 없으면 노드에 Ping을 날려 동적으로 가져옴
        if not machine_id:
            if node_id in NODE_INFO_CACHE:
                machine_id = NODE_INFO_CACHE[node_id]
            else:
                try:
                    import json
                    req = urllib.request.Request(f"{node['url'].rstrip('/')}/api/ping", headers={"X-API-Key": node['apikey']})
                    with urllib.request.urlopen(req, timeout=3) as response:
                        data = json.loads(response.read().decode('utf-8'))
                        machine_id = data.get("machine_id", "")
                        NODE_INFO_CACHE[node_id] = machine_id
                except Exception as e:
                    print(f"[PMH MASTER] 워커 노드({node.get('name')}) 정보 자동 조회 실패: {e}")
        
        servers.append({
            "id": node_id,
            "name": node.get("name", ""),
            "machine_id": machine_id
        })

    print(f"[PMH MASTER] 프론트엔드 설정 동기화 요청 처리 (노드 수: {len(servers)})")

    return jsonify({
        "status": "success",
        "DISPLAY_PATH_PREFIXES_TO_REMOVE": MASTER_CFG.get("DISPLAY_PATH_PREFIXES_TO_REMOVE", []),
        "USER_TAGS": MASTER_CFG.get("USER_TAGS", {}),
        "SERVERS": servers
    }), 200

# ==============================================================================
# 동적 라우팅 게이트웨이 & 릴레이(Proxy)
# ==============================================================================
@app.route('/api/relay/<node_id>/<path:subpath>', methods=['GET', 'POST', 'PUT', 'DELETE'])
def relay_to_node(node_id, subpath):
    if not IS_MASTER:
        return jsonify({"error": "이 서버는 마스터 노드가 아닙니다. 릴레이 기능이 비활성화되어 있습니다."}), 400

    # 1. 대상이 자기 자신(Master)이면 직접 처리
    if node_id in ["master_node", "self"]:
        return api_gateway(subpath)

    # 2. 타겟 워커 노드 정보 조회
    node_info = next((n for n in MASTER_CFG.get("NODES", []) if n.get("id") == node_id), None)
    if not node_info:
        return jsonify({"error": f"등록되지 않은 노드입니다 (ID: {node_id})"}), 404

    target_url = f"{node_info['url'].rstrip('/')}/api/{subpath}"
    
    # 쿼리스트링(GET 파라미터) 유지
    qs = request.query_string.decode('utf-8')
    if qs:
        target_url += f"?{qs}"

    # 3. 요청 헤더 재구성 (보안: 프론트엔드 키 대신, 마스터가 알고 있는 타겟 노드의 API Key 주입)
    headers = {
        "X-API-Key": node_info['apikey']
    }
    content_type = request.headers.get("Content-Type")
    if content_type:
        headers["Content-Type"] = content_type

    req_data = request.get_data() if request.method in ['POST', 'PUT', 'DELETE'] else None

    if not (subpath == 'ping' or subpath.endswith('/status') or subpath.endswith('/run')):
        print(f"[PMH RELAY] 🚀 {request.method} -> {node_info['name']} ({target_url})")

    # 4. 포워딩 실행
    try:
        req = urllib.request.Request(
            target_url, 
            data=req_data, 
            headers=headers, 
            method=request.method
        )
        with urllib.request.urlopen(req, timeout=45) as response:
            resp_data = response.read()
            resp_headers = {}
            if response.headers.get('Content-Type'):
                resp_headers['Content-Type'] = response.headers.get('Content-Type')
            return Response(resp_data, status=response.status, headers=resp_headers)

    except urllib.error.HTTPError as e:
        resp_headers = {}
        if e.headers.get('Content-Type'):
            resp_headers['Content-Type'] = e.headers.get('Content-Type')
        return Response(e.read(), status=e.code, headers=resp_headers)
    except Exception as e:
        print(f"[PMH RELAY ERROR] ❌ 워커 노드({node_info['name']}) 통신 실패: {e}")
        return jsonify({"error": f"워커 노드 통신 실패: {str(e)}"}), 502

@app.route('/')
def serve_index():
    path = os.path.join(BASE_DIR, "index.html")
    if os.path.exists(path): return send_file(path, mimetype='text/html')
    return "Not Found", 404

def get_static_assets_from_github():
    """info.yaml에서 동적 자산(Static Assets) 목록을 긁어옵니다."""
    try:
        ts = int(time.time())
        req = urllib.request.Request(f"{INFO_YAML_URL}?t={ts}", headers={'Cache-Control': 'no-cache'})
        with urllib.request.urlopen(req, timeout=5) as response:
            info_data = yaml.safe_load(response.read().decode('utf-8'))
            return info_data.get('static_assets', [])
    except Exception as e:
        print(f"[PMH ERROR] info.yaml에서 에셋 목록을 가져오지 못했습니다: {e}")
        return []

# 부트스트랩 시 동적 자원 다운로드
assets = get_static_assets_from_github()
for asset in assets:
    file_path = os.path.join(BASE_DIR, asset['name'])
    if not os.path.exists(file_path):
        print(f"[PMH BOOTSTRAP] {asset['name']} 다운로드 중...")
        try:
            urllib.request.urlretrieve(asset['url'], file_path)
        except Exception as e:
            print(f" -> 실패: {e}")

# 정적 파일 서빙 라우트도 동적으로 허용
@app.route('/api/client/<filename>')
def serve_static_client(filename):
    # 보안: 상위 폴더 접근(..) 차단, 허용된 확장자만
    if ".." in filename or not (filename.endswith('.js') or filename.endswith('.css')):
        return "Unauthorized Request", 403
    
    path = os.path.join(BASE_DIR, filename)
    if os.path.exists(path):
        mime = 'text/css' if filename.endswith('.css') else 'application/javascript'
        return Response(open(path, 'rb').read(), mimetype=mime)
    return "Not Found", 404

@app.route('/api/<path:subpath>', methods=['GET', 'POST', 'PUT', 'DELETE'])
def api_gateway(subpath):
    method = request.method
    args = request.args.to_dict()
    
    if not (subpath == 'ping' or subpath.endswith('/status') or subpath.endswith('/run')):
        print(f"[PMH API] 💻 {method} /{subpath}")
    
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
    print("\n" + "="*60)
    print(" 🚀 PMH V2 API Server Initialized")
    print("="*60)
    mode_text = "MASTER (Gateway Enabled)" if IS_MASTER else "WORKER NODE (Standalone)"
    print(f" [ Mode ] {mode_text}")
    print(f" [ Core ] Loaded v{pmh_core.get_version()}")
    print(f" [ Time ] Timezone: {tz_info}")
    print(f" [ Port ] Listening on {SERVER_PORT}")
    print(f" [ DB   ] {BASE_CFG.get('PLEX_DB_PATH', 'Not Set')}")
    print("="*60 + "\n")
    
    app.run(host='0.0.0.0', port=SERVER_PORT)
