# -*- coding: utf-8 -*-

import os
import sys
import logging
import urllib.request
import urllib.error
import importlib
import time
import yaml
import hmac
import hashlib
import tempfile
import traceback
from flask import Flask, jsonify, request, Response, send_file
from flask_cors import CORS
from collections import defaultdict

# ==============================================================================
# [서버 재시작 감지기]
# ==============================================================================
SERVER_FILE_PATH = os.path.abspath(__file__)
try:
    BOOT_FILE_MTIME = os.path.getmtime(SERVER_FILE_PATH)
except Exception:
    BOOT_FILE_MTIME = 0

def is_server_restart_required():
    try:
        current_mtime = os.path.getmtime(SERVER_FILE_PATH)
        if current_mtime > BOOT_FILE_MTIME:
            return True
    except Exception: pass
    return False

# ==============================================================================
# [설정 및 부트스트랩]
# ==============================================================================
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIG_FILE = os.path.join(BASE_DIR, "pmh_config.yaml")

CORE_URL = "https://raw.githubusercontent.com/golmog/plex_meta_helper/main/pmh_core.py"
SERVER_URL = "https://raw.githubusercontent.com/golmog/plex_meta_helper/main/pmh_server.py"
INFO_YAML_URL = "https://raw.githubusercontent.com/golmog/plex_meta_helper/main/info.yaml"

YAML_TEMPLATE = """# ==============================================================================
# [BASE] - 이 서버(노드) 자체의 구동 환경 설정
# ==============================================================================
BASE:
  PORT: 8899
  APIKEY: "YOUR_SECRET_KEY"

  # Plex 서버 설정 (Plex API 통신용)
  PLEX_URL: "http://plex:32400"
  PLEX_TOKEN: "YOUR_PLEX_TOKEN"
  PLEX_MACHINE_IDENTIFIER: "YOUR_PLEX_MACHINE_ID_HERE"
  
  # Plex 메인 DB 파일 경로 및 SQLite 바이너리 경로
  PLEX_DB_PATH: "/config/Library/Application Support/Plex Media Server/Plug-in Support/Databases/com.plexapp.plugins.library.db"
  PLEX_SQLITE_BIN: "/usr/lib/plexmediaserver/Plex SQLite"

  # FF(Plex Mate) 연결 정보
  FF_URL: "http://localhost:9999"
  FF_APIKEY: "YOUR_FF_API_KEY_HERE"
  
  # (선택) 노드 전역 디스코드 알림 웹훅 URL
  DISCORD_WEBHOOK: ""

  # Fail2Ban 기능 활성화 여부
  ENABLE_FAIL2BAN: true

  # (개발용) True일 경우 GitHub 업데이트(덮어쓰기)를 수행하지 않습니다.
  DEV_MODE: false

# ==============================================================================
# [MASTER] - 프론트엔드 전역 설정 및 게이트웨이 라우팅
# ==============================================================================
# ⚠️ 주의: 서버가 1대뿐이라도, 프론트엔드와 통신하려면 반드시 MASTER 설정이 활성화되어 있어야 합니다.
# (여러 대의 서버를 운영할 경우, 오직 1대의 메인 서버에만 이 MASTER 블록을 남겨두고,
# 나머지 보조 서버(워커 노드)의 설정 파일에서는 이 블록 전체를 삭제하거나 주석 처리하세요.)
MASTER:
  AUTO_UPDATE_CHECK: true
  DISPLAY_PATH_PREFIXES_TO_REMOVE:
    - "/mnt"

  USER_TAGS:
    PRIORITY_GROUP:
      - name: "LEAK"
        pattern: "(leaked|유출)"
      - name: "UNCEN"
        pattern: "(mopa|uncen|모파|모자이크제거)"
        target: "path"
    INDEPENDENT:
      - name: "REMUX"
        pattern: "remux"
        target: "path"

#   NODES:
    # 첫 번째 노드(마스터 자신)는 설정하지 않아도 프론트엔드에 자동 포함됩니다.
    # 추가 워커 노드가 있다면 아래에 등록합니다.
    # - id: "worker_node_2"
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
DEV_MODE = BASE_CFG.get("DEV_MODE", False)

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

def get_static_assets_from_github():
    try:
        ts = int(time.time())
        req = urllib.request.Request(f"{INFO_YAML_URL}?t={ts}", headers={'Cache-Control': 'no-cache'})
        with urllib.request.urlopen(req, timeout=5) as response:
            info_data = yaml.safe_load(response.read().decode('utf-8'))
            return info_data.get('static_assets', [])
    except Exception as e:
        print(f"[PMH ERROR] info.yaml에서 에셋 목록을 가져오지 못했습니다: {e}")
        return []

print("[PMH BOOTSTRAP] 필수 정적 에셋 무결성을 검사합니다...")
assets = get_static_assets_from_github()
for asset in assets:
    download_file_if_missing(asset['url'], asset['name'])

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
# [보안 및 Rate Limiting 모듈]
# ==============================================================================
ENABLE_FAIL2BAN = BASE_CFG.get("ENABLE_FAIL2BAN", True)

if len(API_KEY) < 8:
    print("\n" + "!"*60)
    print(" [PMH SECURITY FATAL] API Key 보안 취약 알림!")
    print(" 설정된 API_KEY가 너무 짧아 무차별 대입 공격에 취약합니다.")
    print(" 서버를 안전하게 보호하기 위해 구동을 중단합니다. pmh_config.yaml을 수정하세요.")
    print("!"*60 + "\n")
    sys.exit(1)
elif len(API_KEY) < 16:
    print("\n[PMH SECURITY WARNING] API Key 길이가 16자 미만입니다. 더 강력한 키 사용을 권장합니다.")

# 인메모리 Fail2Ban (연속 실패 기반 IP 차단 기록)
FAILED_ATTEMPTS = {}
MAX_FAILURES = 10            # 최대 허용 연속 실패 횟수
BLOCK_TIME = 300             # 차단 유지 시간 (초 단위, 5분)
MAX_TRACKED_IPS = 10000      # [보안] 메모리 보호를 위한 동시 추적 최대 IP 개수
LAST_GC_TIME = time.time()   # 가비지 컬렉션 타이머

def _garbage_collect_failed_ips():
    if not ENABLE_FAIL2BAN: return
    global LAST_GC_TIME
    now = time.time()
    
    # 5분(300초)마다 한 번씩 청소 실행
    if now - LAST_GC_TIME < 300: return
    LAST_GC_TIME = now
    
    expired_ips = []
    for ip, attempts in FAILED_ATTEMPTS.items():
        valid_attempts = [t for t in attempts if now - t < BLOCK_TIME]
        if not valid_attempts: 
            expired_ips.append(ip)
        else: 
            FAILED_ATTEMPTS[ip] = valid_attempts
            
    for ip in expired_ips:
        del FAILED_ATTEMPTS[ip]

def is_ip_blocked(ip_addr):
    if not ENABLE_FAIL2BAN: return False
    
    _garbage_collect_failed_ips()
    now = time.time()
    
    if ip_addr in FAILED_ATTEMPTS:
        valid_attempts = [t for t in FAILED_ATTEMPTS[ip_addr] if now - t < BLOCK_TIME]
        FAILED_ATTEMPTS[ip_addr] = valid_attempts
        
        if len(valid_attempts) >= MAX_FAILURES:
            return True
    return False

def record_failed_attempt(ip_addr):
    if not ENABLE_FAIL2BAN: return
    
    now = time.time()
    if ip_addr not in FAILED_ATTEMPTS:
        if len(FAILED_ATTEMPTS) >= MAX_TRACKED_IPS:
            FAILED_ATTEMPTS.clear()
        FAILED_ATTEMPTS[ip_addr] = []
        
    FAILED_ATTEMPTS[ip_addr].append(now)

def reset_failed_attempt(ip_addr):
    if not ENABLE_FAIL2BAN: return
    
    if ip_addr in FAILED_ATTEMPTS:
        del FAILED_ATTEMPTS[ip_addr]

def generate_secure_header(api_key):
    if not api_key: return ""
    timestamp = int(time.time() / 10) * 10
    payload = f"{api_key}:{timestamp}".encode('utf-8')
    hash_hex = hashlib.sha256(payload).hexdigest()
    return f"{timestamp}.{hash_hex}"

def verify_signature(signature, api_key):
    if not signature or "." not in signature: return False
    
    try:
        req_ts_str, req_hash = signature.split('.')
        req_ts = int(req_ts_str)
        current_ts = int(time.time() / 10) * 10
        
        if abs(current_ts - req_ts) > 40:
            return False
            
        payload = f"{api_key}:{req_ts}".encode('utf-8')
        expected_hash = hashlib.sha256(payload).hexdigest()
        
        return hmac.compare_digest(req_hash, expected_hash)
    except Exception:
        return False

# ==============================================================================
# [Flask 앱 초기화]
# ==============================================================================
app = Flask(__name__)
CORS(app)
log = logging.getLogger('werkzeug')
log.setLevel(logging.ERROR)

@app.before_request
def check_api_key():
    if request.method == "OPTIONS": return
    
    allowed_paths = ['/', '/favicon.ico']
    if request.path in allowed_paths or request.path.startswith('/api/client/'): return
        
    allowed_restart_paths = ['/api/admin/update', '/api/ping', '/favicon.ico', '/']
    if request.path not in allowed_restart_paths and is_server_restart_required():
        return jsonify({"error": "SERVER_RESTART_REQUIRED", "message": "서버 수동 재시작 필요"}), 426
        
    client_ip = request.remote_addr or "Unknown IP"
    
    if is_ip_blocked(client_ip):
        print(f"[PMH SECURITY] 🛑 다중 인증 실패로 차단된 IP의 접근 시도 거부: {client_ip}")
        return jsonify({"error": "Too Many Failed Attempts. Try again later."}), 429
        
    signature = request.headers.get("X-PMH-Signature", "")
    
    # [호환성 백도어] X-API-Key 헤더 지원 (평문 통신 허용 여부)
    legacy_key = request.headers.get("X-API-Key", "")
    if legacy_key and hmac.compare_digest(legacy_key, API_KEY):
        reset_failed_attempt(client_ip)
        return 
    
    if not verify_signature(signature, API_KEY):
        record_failed_attempt(client_ip)
        fail_count = len(FAILED_ATTEMPTS.get(client_ip, []))
        print(f"[PMH SECURITY] 🚫 잘못된 서명 토큰 접근 시도. (IP: {client_ip}, 연속 실패: {fail_count}/{MAX_FAILURES})")
        return jsonify({"error": "Unauthorized. Invalid Signature."}), 401
        
    reset_failed_attempt(client_ip)

# ==============================================================================
# [서버 전용 라우팅] (코어 업데이트)
# ==============================================================================
def safe_download_and_replace(url, target_filepath):
    ts = int(time.time())
    no_cache_url = f"{url}?t={ts}"
    
    req = urllib.request.Request(no_cache_url, headers={
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
    })
    
    temp_fd, temp_path = tempfile.mkstemp(suffix='.tmp', prefix='pmh_update_')
    os.close(temp_fd)
    
    try:
        with urllib.request.urlopen(req, timeout=15) as response:
            code_content = response.read().decode('utf-8')
            
        if len(code_content) < 100 or "def " not in code_content:
            raise Exception("다운로드된 코드의 크기가 너무 작거나 비정상적입니다.")
            
        with open(temp_path, 'w', encoding='utf-8') as f:
            f.write(code_content)
            
        if os.path.exists(target_filepath):
            backup_path = target_filepath + ".bak"
            if os.path.exists(backup_path):
                os.remove(backup_path)
            try:
                os.rename(target_filepath, backup_path)
            except Exception as e:
                os.remove(target_filepath)
                
        os.rename(temp_path, target_filepath)
        print(f"[PMH UPDATE] ✅ 성공: {os.path.basename(target_filepath)} 업데이트 완료.")
        return True
        
    except Exception as e:
        print(f"[PMH UPDATE ERROR] ❌ 실패: {os.path.basename(target_filepath)} 다운로드/교체 오류: {e}")
        if os.path.exists(temp_path):
            try: os.remove(temp_path)
            except: pass
        raise e

def background_update_task():
    print("[PMH UPDATE BACKGROUND] 워커 스레드 종료 대기 및 코어 업데이트 시작...")
    
    if DEV_MODE:
        print("[PMH DEV] 🛠️ DEV_MODE: GitHub 다운로드를 생략하고 로컬 모듈만 리로드합니다.")
        try:
            importlib.reload(pmh_core)
            pmh_core.start_scheduler_daemon(global_conf)
            print(f"[PMH DEV] 코어 모듈 리로드 완료! (v{pmh_core.get_version()})")
        except Exception as e:
            print(f"[PMH DEV FATAL] 모듈 리로드 실패: {e}")
        return

    try:
        time.sleep(2)
        import threading
        
        active_workers = [t for t in threading.enumerate() if t.name.startswith("Worker_")]
        max_wait = 15
        waited = 0
        while active_workers and waited < max_wait:
            time.sleep(1)
            waited += 1
            active_workers = [t for t in threading.enumerate() if t.name.startswith("Worker_")]
        
        if active_workers:
            print(f"[PMH UPDATE WARNING] ⚠️ {waited}초 대기 초과! {len(active_workers)}개의 워커를 무시하고 강제 업데이트 진행.")
        else:
            print("[PMH UPDATE BACKGROUND] 워커 종료 확인 완료. 다운로드 시작.")

        # ---------------------------------------------------------
        # 1. 코어 파일 (pmh_core.py) 안전 업데이트
        # ---------------------------------------------------------
        safe_download_and_replace(CORE_URL, CORE_FILE_PATH)
            
        # ---------------------------------------------------------
        # 2. 정적 에셋 (UI JS/CSS 등) 안전 업데이트
        # ---------------------------------------------------------
        assets = get_static_assets_from_github()
        for asset in assets:
            asset_path = os.path.join(BASE_DIR, asset['name'])
            try:
                safe_download_and_replace(asset['url'], asset_path)
            except Exception as e:
                print(f"[PMH UPDATE WARNING] 에셋({asset['name']}) 업데이트 건너뜀: {e}")
            
        # 코어 리로드 및 데몬 재시작
        importlib.reload(pmh_core)
        pmh_core.start_scheduler_daemon(global_conf)
        print(f"[PMH UPDATE BACKGROUND] 🎉 코어 핫-리로드 완료! (현재 버전: v{pmh_core.get_version()})")

        # ---------------------------------------------------------
        # 3. 서버 자신 (pmh_server.py) 안전 업데이트
        # ---------------------------------------------------------
        print("[PMH UPDATE BACKGROUND] 서버 스크립트 업데이트를 시도합니다...")
        
        try:
            with open(SERVER_FILE_PATH, 'r', encoding='utf-8') as f:
                old_server_code = f.read()
        except Exception:
            old_server_code = ""

        ts = int(time.time())
        req_svr = urllib.request.Request(f"{SERVER_URL}?t={ts}", headers={'Cache-Control': 'no-cache', 'Pragma': 'no-cache'})
        
        with urllib.request.urlopen(req_svr, timeout=10) as response_svr:
            new_server_code = response_svr.read().decode('utf-8')
            
            if new_server_code != old_server_code:
                temp_fd, temp_path = tempfile.mkstemp(suffix='.tmp', prefix='pmh_server_')
                os.close(temp_fd)
                
                with open(temp_path, 'w', encoding='utf-8') as f:
                    f.write(new_server_code)
                    
                backup_path = SERVER_FILE_PATH + ".bak"
                if os.path.exists(backup_path): os.remove(backup_path)
                try: os.rename(SERVER_FILE_PATH, backup_path)
                except: os.remove(SERVER_FILE_PATH)
                
                os.rename(temp_path, SERVER_FILE_PATH)
                print("[PMH UPDATE BACKGROUND] 🔄 서버 스크립트가 성공적으로 변경되었습니다! (반드시 파이썬 프로세스를 수동으로 재시작하세요.)")
            else:
                print("[PMH UPDATE BACKGROUND] 서버 스크립트는 이미 최신 상태입니다. (재시작 불필요)")

    except Exception as e:
        print(f"[PMH UPDATE FATAL ERROR] 백그라운드 업데이트가 치명적 오류로 중단되었습니다:\n{traceback.format_exc()}")

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
        plex_machine_id = ""
        
        if node_id in NODE_INFO_CACHE:
            plex_machine_id = NODE_INFO_CACHE[node_id]
        else:
            try:
                import json
                req = urllib.request.Request(f"{node['url'].rstrip('/')}/api/ping", headers={"X-API-Key": node['apikey']})
                with urllib.request.urlopen(req, timeout=3) as response:
                    data = json.loads(response.read().decode('utf-8'))
                    plex_machine_id = data.get("machine_id", "")
                    NODE_INFO_CACHE[node_id] = plex_machine_id
            except Exception as e:
                print(f"[PMH MASTER] 워커 노드({node.get('name')}) 정보 자동 조회 실패: {e}")
        
        servers.append({
            "id": node_id,
            "name": node.get("name", ""),
            "machine_id": plex_machine_id
        })

    print(f"[PMH MASTER] 프론트엔드 설정 동기화 요청 처리 (노드 수: {len(servers)})")

    return jsonify({
        "status": "success",
        "AUTO_UPDATE_CHECK": MASTER_CFG.get("AUTO_UPDATE_CHECK", True),
        "DISPLAY_PATH_PREFIXES_TO_REMOVE": MASTER_CFG.get("DISPLAY_PATH_PREFIXES_TO_REMOVE", []),
        "USER_TAGS": MASTER_CFG.get("USER_TAGS", {}),
        "SERVERS": servers
    }), 200

UPDATE_INFO_CACHE = {"data": None, "timestamp": 0}

@app.route('/api/master/check_update', methods=['GET'])
def check_update_from_github():
    if not IS_MASTER:
        return jsonify({"error": "이 서버는 Master 노드가 아닙니다."}), 400

    force = request.args.get('force', 'false').lower() == 'true'
    now = time.time()

    if not force and UPDATE_INFO_CACHE["data"] and (now - UPDATE_INFO_CACHE["timestamp"] < 3600):
        return jsonify(UPDATE_INFO_CACHE["data"]), 200

    try:
        req = urllib.request.Request(f"{INFO_YAML_URL}?t={int(now)}", headers={'Cache-Control': 'no-cache'})
        with urllib.request.urlopen(req, timeout=10) as response:
            main_info = yaml.safe_load(response.read().decode('utf-8'))

        latest_version = main_info.get('version', '0.0.0')
        bundled_tools_raw = main_info.get('bundled_tools', [])
        
        parsed_bundles = []
        for bundle in bundled_tools_raw:
            bundle_url = bundle.get('url', '')
            bundle_id = bundle.get('id', '')
            if not bundle_url: continue
            
            bundle_meta = {}
            try:
                b_req = urllib.request.Request(f"{bundle_url}?t={int(now)}", headers={'Cache-Control': 'no-cache'})
                with urllib.request.urlopen(b_req, timeout=5) as b_resp:
                    bundle_meta = yaml.safe_load(b_resp.read().decode('utf-8'))
            except Exception as e:
                print(f"[PMH UPDATE] 번들 툴({bundle_id}) 메타 파싱 실패 (무시됨): {e}")

            parsed_bundles.append({
                "id": bundle_id,
                "url": bundle_url,
                "meta": bundle_meta
            })

        result_data = {
            "status": "success",
            "latest_version": latest_version,
            "bundled_tools": parsed_bundles
        }

        UPDATE_INFO_CACHE["data"] = result_data
        UPDATE_INFO_CACHE["timestamp"] = now

        return jsonify(result_data), 200

    except Exception as e:
        print(f"[PMH UPDATE ERROR] 업데이트 정보 파싱 실패: {e}")
        return jsonify({"error": "GitHub 파싱 실패", "message": str(e)}), 500

# ==============================================================================
# 동적 라우팅 게이트웨이 & 릴레이(Proxy)
# ==============================================================================
def generate_secure_header(api_key):
    if not api_key: return ""
    
    timestamp = int(time.time() / 10) * 10
    payload = f"{api_key}:{timestamp}".encode('utf-8')
    hash_hex = hashlib.sha256(payload).hexdigest()
    
    return f"{timestamp}.{hash_hex}"

@app.route('/api/relay/<node_id>/<path:subpath>', methods=['GET', 'POST', 'PUT', 'DELETE'])
def relay_to_node(node_id, subpath):
    if not IS_MASTER:
        return jsonify({"error": "이 서버는 마스터 노드가 아닙니다. 릴레이 기능이 비활성화되어 있습니다."}), 400

    if node_id in ["master_node", "self"]:
        if subpath == 'admin/update':
            return api_admin_update()
        return api_gateway(subpath)

    node_info = next((n for n in MASTER_CFG.get("NODES", []) if n.get("id") == node_id), None)
    if not node_info:
        return jsonify({"error": f"등록되지 않은 노드입니다 (ID: {node_id})"}), 404

    target_url = f"{node_info['url'].rstrip('/')}/api/{subpath}"
    qs = request.query_string.decode('utf-8')
    if qs: target_url += f"?{qs}"

    secure_token = generate_secure_header(node_info['apikey'])
    
    headers = { "X-PMH-Signature": secure_token }
    content_type = request.headers.get("Content-Type")
    if content_type: headers["Content-Type"] = content_type

    req_data = request.get_data() if request.method in ['POST', 'PUT', 'PATCH', 'DELETE'] else None

    if not (subpath == 'ping' or subpath.endswith('/status') or subpath.endswith('/run')):
        print(f"[PMH RELAY] 🚀 {request.method} -> {node_info['name']} ({target_url})")

    try:
        req = urllib.request.Request(target_url, data=req_data, headers=headers, method=request.method)
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

assets = get_static_assets_from_github()
for asset in assets:
    file_path = os.path.join(BASE_DIR, asset['name'])
    if not os.path.exists(file_path):
        print(f"[PMH BOOTSTRAP] {asset['name']} 다운로드 중...")
        try:
            urllib.request.urlretrieve(asset['url'], file_path)
        except Exception as e:
            print(f" -> 실패: {e}")

@app.route('/api/client/<filename>')
def serve_static_client(filename):
    if ".." in filename or not (filename.endswith('.js') or filename.endswith('.css') or filename.endswith('.png')):
        return "Unauthorized Request", 403
    
    path = os.path.join(BASE_DIR, filename)
    if os.path.exists(path):
        if filename.endswith('.css'): mime = 'text/css'
        elif filename.endswith('.png'): mime = 'image/png'
        else: mime = 'application/javascript'
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
    print(" 🚀 PMH API Server Initialized")
    print("="*60)
    mode_text = "MASTER (Gateway Enabled)" if IS_MASTER else "WORKER NODE (Standalone)"
    print(f" [ Mode ] {mode_text}")
    if DEV_MODE:
        print(" [ Dev  ] ⚠️ DEV_MODE = True (GitHub 자동 업데이트 무시됨)")
    else:
        print(" [ Dev  ] False (GitHub 자동 업데이트 활성화됨)")
    print(f" [ Core ] Loaded v{pmh_core.get_version()}")
    print(f" [ Time ] Timezone: {tz_info}")
    print(f" [ Port ] Listening on {SERVER_PORT}")
    print(f" [ DB   ] {BASE_CFG.get('PLEX_DB_PATH', 'Not Set')}")
    print("="*60 + "\n")
    
    app.run(host='0.0.0.0', port=SERVER_PORT)
