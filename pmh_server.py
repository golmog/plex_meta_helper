# -*- coding: utf-8 -*-

import os
import sys
import logging
from logging.handlers import RotatingFileHandler
import urllib.request
import urllib.error
import importlib
import time
import yaml
import hmac
import hashlib
import traceback
from flask import Flask, jsonify, make_response, request, Response, send_file
from flask_cors import CORS

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

  # 실행 환경: standalone (로그파일 생성/타임스탬프 O) 또는 ff (로그파일X/타임스탬프 X)
  ENV_TYPE: "ff"
  LOG_LEVEL: "INFO"  # INFO, DEBUG
  TZ: "Asia/Seoul"

  # 파일 소유권 강제 (컨테이너 환경 등에서 생성 파일 권한 매칭). 비활성화시 -1
  PUID: -1
  PGID: -1

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
  
  # 노드 전역 디스코드 알림 웹훅 URL
  DISCORD_WEBHOOK: ""

  # Fail2Ban 기능 활성화 여부 및 예외 IP 목록
  ENABLE_FAIL2BAN: true
  FAIL2BAN_WHITELIST:
    - "127.0.0.1"
    - "192.168.0.*"
    - "10.0.*.*"

  # (개발용) True일 경우 GitHub 업데이트(덮어쓰기)를 수행하지 않습니다.
  DEV_MODE: false

  # 언매칭시 json 파일을 삭제할 섹션(콤마로 구분(숫자), "all" 또는 비워두기)
  DELETE_JSON_SECTION: ""

  # 해상도 뱃지(SD, HD, 4K 등) 표시 및 자동 분석을 생략할 라이브러리 섹션 ID 목록 (콤마 구분)
  IGNORE_RES_SECTION: ""
"""

def load_config():
    if not os.path.exists(CONFIG_FILE):
        print(f"[PMH CONFIG] 설정 파일({CONFIG_FILE})이 존재하지 않아 기본 템플릿을 생성합니다.")
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
PUID = int(BASE_CFG.get("PUID", -1))
PGID = int(BASE_CFG.get("PGID", -1))

TZ_STR = BASE_CFG.get("TZ", "Asia/Seoul")
if TZ_STR:
    os.environ['TZ'] = TZ_STR
    if hasattr(time, 'tzset'):
        time.tzset()

def apply_permissions(target_path):
    """지정된 PUID/PGID가 있다면 파일/폴더의 소유권을 강제합니다."""
    if PUID != -1 and PGID != -1 and os.path.exists(target_path):
        try:
            os.chown(target_path, PUID, PGID)
        except Exception:
            pass

pmh_logger = logging.getLogger("PMH")
pmh_logger.propagate = False

def setup_logger():
    env_type = BASE_CFG.get("ENV_TYPE", "ff").lower()
    log_level_str = BASE_CFG.get("LOG_LEVEL", "INFO").upper()
    log_level = getattr(logging, log_level_str, logging.INFO)
    
    pmh_logger.setLevel(log_level)
    pmh_logger.handlers.clear()

    if env_type == "ff":
        fmt = "[PMH] [%(levelname)s] %(message)s"
    else:
        fmt = "[%(asctime)s] [%(levelname)s] %(message)s"
        
    formatter = logging.Formatter(fmt)

    ch = logging.StreamHandler(sys.stdout)
    ch.setFormatter(formatter)
    pmh_logger.addHandler(ch)

    if env_type == "standalone":
        log_dir = os.path.join(BASE_DIR, "logs")
        os.makedirs(log_dir, exist_ok=True)
        apply_permissions(log_dir)
        
        log_file = os.path.join(log_dir, "pmh_server.log")
        fh = RotatingFileHandler(log_file, maxBytes=10*1024*1024, backupCount=5, encoding='utf-8')
        fh.setFormatter(formatter)
        pmh_logger.addHandler(fh)
        apply_permissions(log_file)

setup_logger()

global_conf = {
    "base_dir": BASE_DIR,
    "puid": PUID,
    "pgid": PGID,
    "plex_db_path": BASE_CFG.get("PLEX_DB_PATH", ""),
    "plex_url": BASE_CFG.get("PLEX_URL", ""),
    "plex_token": BASE_CFG.get("PLEX_TOKEN", ""),
    "plex_sqlite_bin": BASE_CFG.get("PLEX_SQLITE_BIN", ""),
    "mate_apikey": BASE_CFG.get("FF_APIKEY", ""),
    "mate_url": BASE_CFG.get("FF_URL", ""),
    "discord_webhook": BASE_CFG.get("DISCORD_WEBHOOK", ""),
    "machine_id": BASE_CFG.get("PLEX_MACHINE_IDENTIFIER", ""),
    "DELETE_JSON_SECTION": str(BASE_CFG.get("DELETE_JSON_SECTION", "")),
    "IGNORE_RES_SECTION": str(BASE_CFG.get("IGNORE_RES_SECTION", "")),
    "JAV_SECTION": str(BASE_CFG.get("JAV_SECTION", "")),
    "WESTERN_AV_SECTION": str(BASE_CFG.get("WESTERN_AV_SECTION", "")),
    "JAV_MIN_SCORE": int(BASE_CFG.get("JAV_MIN_SCORE", 95)),
    "WESTERN_MIN_SCORE": int(BASE_CFG.get("WESTERN_MIN_SCORE", 80)),
    "JAV_PARSING_RULES": BASE_CFG.get("JAV_PARSING_RULES", {}),
    "is_master": IS_MASTER
}

def download_file_if_missing(url, filename):
    file_path = os.path.join(BASE_DIR, filename)
    if not os.path.exists(file_path):
        pmh_logger.info(f"필수 파일 다운로드: {filename}")
        try:
            urllib.request.urlretrieve(url, file_path)
            apply_permissions(file_path)
        except Exception as e:
            pmh_logger.warning(f"다운로드 실패 ({filename}): {e}")

def get_static_assets_from_github():
    try:
        ts = int(time.time())
        req = urllib.request.Request(f"{INFO_YAML_URL}?t={ts}", headers={'Cache-Control': 'no-cache'})
        with urllib.request.urlopen(req, timeout=5) as response:
            info_data = yaml.safe_load(response.read().decode('utf-8'))
            return info_data.get('static_assets', [])
    except Exception as e:
        pmh_logger.error(f"info.yaml 에셋 파싱 실패: {e}")
        return []

pmh_logger.info("정적 에셋 무결성 검사를 시작합니다.")
assets = get_static_assets_from_github()
for asset in assets:
    download_file_if_missing(asset['url'], asset['name'])

CORE_FILE_PATH = os.path.join(BASE_DIR, "pmh_core.py")
if not os.path.exists(CORE_FILE_PATH):
    pmh_logger.info("pmh_core.py 다운로드 시작...")
    try:
        urllib.request.urlretrieve(CORE_URL, CORE_FILE_PATH)
        apply_permissions(CORE_FILE_PATH)
    except Exception as e:
        pmh_logger.error(f"코어 모듈 다운로드 실패: {e}")
        sys.exit(1)

import pmh_core
pmh_core.start_scheduler_daemon(global_conf)

# ==============================================================================
# [보안 및 Rate Limiting 모듈]
# ==============================================================================
ENABLE_FAIL2BAN = BASE_CFG.get("ENABLE_FAIL2BAN", True)
FAIL2BAN_WHITELIST = BASE_CFG.get("FAIL2BAN_WHITELIST", [])
if not isinstance(FAIL2BAN_WHITELIST, list):
    FAIL2BAN_WHITELIST = [FAIL2BAN_WHITELIST]

if len(API_KEY) < 8:
    pmh_logger.critical("API_KEY 길이가 너무 짧아 구동을 중단합니다. (보안 취약)")
    sys.exit(1)
elif len(API_KEY) < 16:
    pmh_logger.warning("API_KEY 길이가 16자 미만입니다. 더 강력한 키 사용을 권장합니다.")

FAILED_ATTEMPTS = {}
MAX_FAILURES = 10
BLOCK_TIME = 300
MAX_TRACKED_IPS = 10000
LAST_GC_TIME = time.time()

def _is_ip_whitelisted(ip_addr):
    if not FAIL2BAN_WHITELIST: return False
    for pattern in FAIL2BAN_WHITELIST:
        pattern = str(pattern).strip()
        if not pattern: continue
        if pattern == ip_addr: return True
        if pattern.endswith("*"):
            prefix = pattern.rstrip("*")
            if ip_addr.startswith(prefix): return True
    return False

def _garbage_collect_failed_ips():
    if not ENABLE_FAIL2BAN: return
    global LAST_GC_TIME
    now = time.time()
    if now - LAST_GC_TIME < 300: return
    LAST_GC_TIME = now
    
    expired_ips = [ip for ip, att in FAILED_ATTEMPTS.items() if not [t for t in att if now - t < BLOCK_TIME]]
    for ip in expired_ips:
        del FAILED_ATTEMPTS[ip]

def is_ip_blocked(ip_addr):
    if not ENABLE_FAIL2BAN: return False
    if _is_ip_whitelisted(ip_addr): return False
    
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
    if _is_ip_whitelisted(ip_addr): return
    
    if ip_addr not in FAILED_ATTEMPTS:
        if len(FAILED_ATTEMPTS) >= MAX_TRACKED_IPS: FAILED_ATTEMPTS.clear()
        FAILED_ATTEMPTS[ip_addr] = []
    FAILED_ATTEMPTS[ip_addr].append(time.time())

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
        
        if abs(current_ts - req_ts) > 60:
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
    if request.method in ['POST', 'PUT', 'PATCH', 'DELETE']:
        _ = request.get_data()

    if request.method == "OPTIONS": return
    
    allowed_paths = ['/', '/favicon.ico']
    if request.path in allowed_paths or request.path.startswith('/api/client/'): return
    
    allowed_restart_paths = ['/api/admin/update', '/favicon.ico', '/']
    if request.path not in allowed_restart_paths and is_server_restart_required():
        return jsonify({"error": "SERVER_RESTART_REQUIRED", "message": "서버 수동 재시작 필요"}), 426
        
    client_ip = request.remote_addr or "Unknown IP"
    
    if is_ip_blocked(client_ip):
        print(f"[PMH SECURITY] 🛑 다중 인증 실패로 차단된 IP의 접근 시도 거부: {client_ip}")
        return jsonify({"error": "Too Many Failed Attempts. Try again later."}), 429
        
    signature = request.headers.get("X-PMH-Signature", "")
    
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

@app.after_request
def add_header(response):
    response.headers['Connection'] = 'close'
    return response

# ==============================================================================
# [서버 전용 라우팅] (코어 업데이트)
# ==============================================================================
def safe_download_and_replace(url, target_filepath):
    ts = int(time.time())
    req = urllib.request.Request(f"{url}?t={ts}", headers={'Cache-Control': 'no-cache'})

    try:
        with urllib.request.urlopen(req, timeout=15) as response:
            raw_data = response.read()
            is_binary = target_filepath.lower().endswith(('.png', '.jpg', '.jpeg', '.gif', '.ico'))
            is_python = target_filepath.lower().endswith('.py')
            
            if is_binary:
                if len(raw_data) == 0: raise Exception("0 bytes downloaded.")
                with open(target_filepath, 'wb') as f: f.write(raw_data)
            else:
                code_content = raw_data.decode('utf-8')
                if is_python and (len(code_content) < 100 or "def " not in code_content):
                    raise Exception("다운로드된 파이썬 코드 비정상.")
                with open(target_filepath, 'w', encoding='utf-8') as f:
                    f.write(code_content)
            
        apply_permissions(target_filepath)
        pmh_logger.info(f"✅ 업데이트 완료: {os.path.basename(target_filepath)}")
        return True
        
    except Exception as e:
        pmh_logger.error(f"❌ 업데이트 실패 ({os.path.basename(target_filepath)}): {e}")
        raise e

def background_update_task():
    pmh_logger.info("워커 스레드 종료 대기 및 코어 업데이트 시작...")
    
    if DEV_MODE:
        pmh_logger.info("🛠️ DEV_MODE: GitHub 다운로드를 생략하고 로컬 모듈만 리로드합니다.")
        try:
            importlib.reload(pmh_core)
            pmh_core.start_scheduler_daemon(global_conf)
            pmh_logger.info(f"코어 모듈 리로드 완료! (v{pmh_core.get_version()})")
        except Exception as e:
            pmh_logger.error(f"모듈 리로드 실패: {e}")
        return

    try:
        time.sleep(2)
        import threading
        
        active_workers = [t for t in threading.enumerate() if t.name.startswith("Worker_")]
        max_wait = 15; waited = 0
        while active_workers and waited < max_wait:
            time.sleep(1); waited += 1
            active_workers = [t for t in threading.enumerate() if t.name.startswith("Worker_")]
        
        if active_workers:
            pmh_logger.warning(f"⚠️ {waited}초 대기 초과! {len(active_workers)}개의 워커를 무시하고 강제 업데이트 진행.")

        # 1. 코어 파일 업데이트
        safe_download_and_replace(CORE_URL, CORE_FILE_PATH)
            
        # 2. 정적 에셋 업데이트
        assets = get_static_assets_from_github()
        for asset in assets:
            try: safe_download_and_replace(asset['url'], os.path.join(BASE_DIR, asset['name']))
            except Exception as e: pmh_logger.warning(f"에셋 건너뜀({asset['name']}): {e}")
            
        importlib.reload(pmh_core)
        pmh_core.start_scheduler_daemon(global_conf)
        pmh_logger.info(f"🎉 코어 핫-리로드 완료! (v{pmh_core.get_version()})")

        # 3. 서버 자신 업데이트
        pmh_logger.info("서버 스크립트 업데이트를 시도합니다...")
        try:
            with open(SERVER_FILE_PATH, 'r', encoding='utf-8') as f:
                old_server_code = f.read()
        except Exception:
            old_server_code = ""

        req_svr = urllib.request.Request(f"{SERVER_URL}?t={int(time.time())}", headers={'Cache-Control': 'no-cache'})
        with urllib.request.urlopen(req_svr, timeout=10) as response_svr:
            new_server_code = response_svr.read().decode('utf-8')
            if new_server_code != old_server_code:
                with open(SERVER_FILE_PATH, 'w', encoding='utf-8') as f:
                    f.write(new_server_code)
                apply_permissions(SERVER_FILE_PATH)
                pmh_logger.info("🔄 서버 스크립트가 덮어씌워졌습니다. (수동 재시작 필요)")
            else:
                pmh_logger.info("서버 스크립트는 이미 최신 상태입니다.")

    except Exception as e:
        pmh_logger.critical(f"업데이트 중 치명적 오류:\n{traceback.format_exc()}")

@app.route('/api/admin/update', methods=['POST'])
def api_admin_update():
    req_data = request.get_json() if request.is_json else {}
    force_update = req_data.get('force', False)
    
    try:
        is_ready, running_count, msg = pmh_core.check_update_readiness(BASE_DIR, force_update)
        if not is_ready:
            pmh_logger.info(f"업데이트 거부됨: {msg}")
            return jsonify({"status": "busy", "running_count": running_count, "message": msg}), 200
    except Exception as e:
        pmh_logger.error(f"상태 확인 실패: {e}")
        return jsonify({"status": "error", "message": f"상태 확인 실패: {e}"}), 500

    import threading
    t = threading.Thread(target=background_update_task, name="PMH_Updater")
    t.daemon = True
    t.start()
    return jsonify({"status": "success", "message": "Update started in background.", "version": pmh_core.get_version()})

@app.route('/api/admin/reload_core', methods=['POST'])
def api_admin_reload_core():
    global cfg, BASE_CFG, MASTER_CFG, IS_MASTER, DEV_MODE, API_KEY
    global ENABLE_FAIL2BAN, FAIL2BAN_WHITELIST, global_conf, NODE_INFO_CACHE
    global PUID, PGID
    
    try:
        is_ready, running_count, msg = pmh_core.check_update_readiness(BASE_DIR, force_update=False)
        if not is_ready:
            return jsonify({"status": "error", "running_count": running_count, "message": msg}), 200
            
        pmh_logger.info("1. 설정 재로드 및 로거 적용...")
        try:
            cfg = load_config()
            BASE_CFG = cfg.get("BASE", {})
            MASTER_CFG = cfg.get("MASTER", None)
            IS_MASTER = MASTER_CFG is not None
            DEV_MODE = BASE_CFG.get("DEV_MODE", False)
            API_KEY = BASE_CFG.get("APIKEY", "")
            
            PUID = int(BASE_CFG.get("PUID", -1))
            PGID = int(BASE_CFG.get("PGID", -1))
            setup_logger()

            ENABLE_FAIL2BAN = BASE_CFG.get("ENABLE_FAIL2BAN", True)
            FAIL2BAN_WHITELIST = BASE_CFG.get("FAIL2BAN_WHITELIST", [])
            if not isinstance(FAIL2BAN_WHITELIST, list): FAIL2BAN_WHITELIST = [FAIL2BAN_WHITELIST]

            global_conf.update({
                "puid": PUID, "pgid": PGID,
                "plex_db_path": BASE_CFG.get("PLEX_DB_PATH", ""),
                "plex_url": BASE_CFG.get("PLEX_URL", ""),
                "plex_token": BASE_CFG.get("PLEX_TOKEN", ""),
                "plex_sqlite_bin": BASE_CFG.get("PLEX_SQLITE_BIN", ""),
                "mate_apikey": BASE_CFG.get("FF_APIKEY", ""),
                "mate_url": BASE_CFG.get("FF_URL", ""),
                "discord_webhook": BASE_CFG.get("DISCORD_WEBHOOK", ""),
                "machine_id": BASE_CFG.get("PLEX_MACHINE_IDENTIFIER", ""),
                "DELETE_JSON_SECTION": str(BASE_CFG.get("DELETE_JSON_SECTION", "")),
                "IGNORE_RES_SECTION": str(BASE_CFG.get("IGNORE_RES_SECTION", "")),
                "JAV_SECTION": str(BASE_CFG.get("JAV_SECTION", "")),
                "WESTERN_AV_SECTION": str(BASE_CFG.get("WESTERN_AV_SECTION", "")),
                "JAV_PARSING_RULES": BASE_CFG.get("JAV_PARSING_RULES", {}),
                "is_master": IS_MASTER
            })
            NODE_INFO_CACHE.clear()
        except Exception as cfg_err:
            pmh_logger.warning(f"설정 갱신 실패 (기존 유지): {cfg_err}")

        pmh_logger.info("2. 모듈 리로드 시작...")
        if hasattr(pmh_core, 'stop_scheduler_daemon'):
            pmh_core.stop_scheduler_daemon()
            time.sleep(1.0)
            
        importlib.reload(pmh_core)
        pmh_core.start_scheduler_daemon(global_conf)
        
        pmh_logger.info(f"✅ 리로드 완료! (v{pmh_core.get_version()})")
        return jsonify({"status": "success", "message": "모듈 리로드 완료"}), 200
    except Exception as e:
        pmh_logger.error(f"리로드 실패: {e}")
        return jsonify({"status": "error", "message": f"리로드 실패: {e}"}), 500

@app.route('/api/admin/config', methods=['GET', 'POST'])
def api_admin_config():
    if request.method == 'GET':
        try:
            with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
                content = f.read()
            return jsonify({"status": "success", "yaml": content}), 200
        except Exception as e:
            return jsonify({"error": f"설정 파일을 읽을 수 없습니다: {e}"}), 500

    if request.method == 'POST':
        req_data = request.get_json() if request.is_json else {}
        yaml_text = req_data.get('yaml', '')
        if not yaml_text: return jsonify({"error": "내용이 비어있습니다."}), 400
        
        try:
            parsed = yaml.safe_load(yaml_text)
            if not isinstance(parsed, dict) or "BASE" not in parsed:
                return jsonify({"error": "잘못된 구조. 'BASE' 노드가 필수입니다."}), 400
        except Exception as e:
            return jsonify({"error": f"문법 오류:\n{e}"}), 400

        try:
            with open(CONFIG_FILE, 'w', encoding='utf-8') as f:
                f.write(yaml_text)
            apply_permissions(CONFIG_FILE)
            pmh_logger.info("관리자 UI를 통해 pmh_config.yaml 수정됨.")
            return jsonify({"status": "success", "message": "저장 완료"}), 200
        except Exception as e:
            return jsonify({"error": f"파일 저장 실패: {e}"}), 500
            
    return jsonify({"error": "Method Not Allowed"}), 405

# ==============================================================================
# 프론트엔드 클라이언트 라우팅
# ==============================================================================
NODE_INFO_CACHE = {}

@app.route('/api/client/config', methods=['GET'])
def get_client_config():
    if not IS_MASTER: return jsonify({"error": "Master 노드가 아닙니다."}), 400
    
    servers = [{"id": "master_node", "name": "1.MAIN (Master)", "machine_id": BASE_CFG.get("PLEX_MACHINE_IDENTIFIER", "")}]
    nodes = MASTER_CFG.get("NODES") or []
    
    for node in nodes:
        node_id = node.get("id", "")
        plex_machine_id = NODE_INFO_CACHE.get(node_id, "")
        
        if not plex_machine_id:
            try:
                import json
                req = urllib.request.Request(f"{node['url'].rstrip('/')}/api/ping", headers={"X-API-Key": node['apikey']})
                with urllib.request.urlopen(req, timeout=3) as response:
                    data = json.loads(response.read().decode('utf-8'))
                    plex_machine_id = data.get("machine_id", "")
                    NODE_INFO_CACHE[node_id] = plex_machine_id
            except Exception as e:
                pmh_logger.debug(f"워커({node.get('name')}) 핑 실패: {e}")
        
        servers.append({"id": node_id, "name": node.get("name", ""), "machine_id": plex_machine_id})

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
    if not IS_MASTER: return jsonify({"error": "Master 노드가 아닙니다."}), 400

    force = request.args.get('force', 'false').lower() == 'true'
    now = time.time()

    if not force and UPDATE_INFO_CACHE["data"] and (now - UPDATE_INFO_CACHE["timestamp"] < 3600):
        return jsonify(UPDATE_INFO_CACHE["data"]), 200

    try:
        req = urllib.request.Request(f"{INFO_YAML_URL}?t={int(now)}", headers={'Cache-Control': 'no-cache'})
        with urllib.request.urlopen(req, timeout=10) as response:
            main_info = yaml.safe_load(response.read().decode('utf-8'))

        latest_version = main_info.get('version', '0.0.0')
        parsed_bundles = []
        for bundle in main_info.get('bundled_tools', []):
            b_url = bundle.get('url', '')
            b_id = bundle.get('id', '')
            if not b_url: continue
            
            b_meta = {}
            try:
                b_req = urllib.request.Request(f"{b_url}?t={int(now)}", headers={'Cache-Control': 'no-cache'})
                with urllib.request.urlopen(b_req, timeout=5) as b_resp:
                    b_meta = yaml.safe_load(b_resp.read().decode('utf-8'))
            except Exception: pass

            parsed_bundles.append({"id": b_id, "url": b_url, "meta": b_meta})

        res_data = {"status": "success", "latest_version": latest_version, "bundled_tools": parsed_bundles}
        UPDATE_INFO_CACHE["data"] = res_data
        UPDATE_INFO_CACHE["timestamp"] = now
        return jsonify(res_data), 200
    except Exception as e:
        pmh_logger.error(f"GitHub 정보 파싱 실패: {e}")
        return jsonify({"error": "GitHub 파싱 실패", "message": str(e)}), 500

# ==============================================================================
# 동적 라우팅 게이트웨이 & 릴레이(Proxy)
# ==============================================================================
@app.route('/api/relay/<node_id>/<path:subpath>', methods=['GET', 'POST', 'PUT', 'DELETE'])
def relay_to_node(node_id, subpath):
    raw_body = None
    if request.method in ['POST', 'PUT', 'PATCH', 'DELETE']:
        raw_body = request.get_data()
    
    if not IS_MASTER:
        return jsonify({"error": "마스터 노드가 아닙니다."}), 400

    if node_id in ["master_node", "self"]:
        if subpath == 'admin/update': return api_admin_update()
        elif subpath == 'admin/reload_core': return api_admin_reload_core()
        elif subpath == 'admin/config': return api_admin_config()
        return api_gateway(subpath)

    nodes = MASTER_CFG.get("NODES") or []
    node_info = next((n for n in nodes if n.get("id") == node_id), None)
    if not node_info: return jsonify({"error": f"등록되지 않은 노드({node_id})"}), 404

    target_url = f"{node_info['url'].rstrip('/')}/api/{subpath}"
    qs = request.query_string.decode('utf-8')
    if qs: target_url += f"?{qs}"

    headers = { "X-PMH-Signature": generate_secure_header(node_info['apikey']) }
    content_type = request.headers.get("Content-Type")
    if content_type: headers["Content-Type"] = content_type

    req_data = raw_body if raw_body else None
    if req_data: headers['Content-Length'] = str(len(req_data))

    is_silent = subpath == 'ping' or subpath.endswith('/status') or subpath.endswith('queue_status') or subpath.endswith('active_queues')
    if not is_silent:
        pmh_logger.debug(f"🚀 Relay [{request.method}] -> {node_info['name']} ({target_url})")

    try:
        req = urllib.request.Request(target_url, data=req_data, headers=headers, method=request.method)
        req.add_header('Connection', 'close') 
        with urllib.request.urlopen(req, timeout=120) as response:
            resp_data = response.read()
            resp_headers = {}
            if response.headers.get('Content-Type'):
                resp_headers['Content-Type'] = response.headers.get('Content-Type')
            return Response(resp_data, status=response.status, headers=resp_headers)

    except urllib.error.HTTPError as e:
        try:
            resp = make_response(jsonify(importlib.import_module('json').loads(e.read().decode('utf-8'))))
            resp.status_code = e.code; return resp
        except Exception: return make_response(jsonify({"error": f"HTTP {e.code}"})), e.code
    except Exception as e:
        return make_response(jsonify({"error": f"통신 실패: {str(e)}"})), 502

@app.route('/')
def serve_index():
    path = os.path.join(BASE_DIR, "index.html")
    if os.path.exists(path): return send_file(path, mimetype='text/html')
    return "Not Found", 404

@app.route('/api/client/<filename>')
def serve_static_client(filename):
    if ".." in filename or not filename.endswith(('.js', '.css', '.png')): return "Unauthorized", 403
    path = os.path.join(BASE_DIR, filename)
    if os.path.exists(path):
        mime = 'text/css' if filename.endswith('.css') else 'image/png' if filename.endswith('.png') else 'application/javascript'
        return Response(open(path, 'rb').read(), mimetype=mime)
    return "Not Found", 404

@app.route('/api/<path:subpath>', methods=['GET', 'POST', 'PUT', 'DELETE'])
def api_gateway(subpath):
    raw_body = None
    if request.method in ['POST', 'PUT', 'PATCH', 'DELETE']:
        raw_body = request.get_data()
    
    json_data = {}
    if request.method in ['POST', 'PUT'] and raw_body:
        import json
        try: json_data = json.loads(raw_body.decode('utf-8'))
        except Exception: pass

    is_silent = subpath == 'ping' or subpath.endswith('/status') or subpath.endswith('queue_status') or subpath.endswith('active_queues')
    if not is_silent:
        pmh_logger.debug(f"💻 API [{request.method}] /{subpath}")
        pmh_logger.debug(f"Payload: {json_data}")

    result, status_code = pmh_core.dispatch_request(
        subpath=subpath, method=request.method, args=request.args.to_dict(), 
        data=json_data, global_config=global_conf
    )
    
    resp = make_response(jsonify(result))
    resp.status_code = status_code
    resp.headers['Connection'] = 'close'
    return resp

if __name__ == '__main__':
    print("\n" + "="*60)
    print(" 🚀 PMH API Server Initialized")
    print("="*60)
    print(f" [ Mode ] {'MASTER' if IS_MASTER else 'WORKER NODE'}")
    print(f" [ Env  ] {BASE_CFG.get('ENV_TYPE', 'standalone').upper()}")
    print(f" [ Dev  ] {'ON' if DEV_MODE else 'OFF'}")
    print(f" [ Core ] v{pmh_core.get_version()}")
    print(f" [ Time ] {time.strftime('%z (%Z)')}")
    print(f" [ Port ] {SERVER_PORT}")
    print(f" [ DB   ] {BASE_CFG.get('PLEX_DB_PATH', 'Not Set')}")
    print(f" [ PUID ] {PUID} / PGID: {PGID}")
    print("="*60 + "\n")
    
    app.run(host='0.0.0.0', port=SERVER_PORT)
