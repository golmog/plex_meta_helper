# -*- coding: utf-8 -*-
"""
====================================================================================
 [PMH Bundle Tool] - 섹션 매니저 (Section Manager)
====================================================================================
"""

import os
import sys
import time
import json
import shutil
import socket
import urllib.request
import urllib.parse
import xml.etree.ElementTree as ET
from datetime import datetime

# =====================================================================
# 유틸리티 함수
# =====================================================================
def check_plex_running(plex_url):
    """Plex 서버가 응답하는지 (실행 중인지) 소켓 레벨에서 확인합니다."""
    try:
        parsed = urllib.parse.urlparse(plex_url)
        host = parsed.hostname or 'localhost'
        port = parsed.port or 32400
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(2.0)
            result = s.connect_ex((host, port))
            return result == 0
    except:
        return False

def get_plex_tv_shares(machine_id, token):
    """Plex.tv API를 호출하여 공유된 사용자 및 섹션 ID 정보를 가져옵니다."""
    url = f"https://plex.tv/api/servers/{machine_id}/shared_servers"
    req = urllib.request.Request(url, headers={'X-Plex-Token': token, 'Accept': 'application/xml'})
    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            root = ET.fromstring(response.read())
            shares = []
            for friend in root.findall('SharedServer'):
                share_info = {
                    'id': friend.get('id'),
                    'username': friend.get('username') or friend.get('email') or 'Unknown',
                    'all_sections': friend.get('all_sections', '0') == '1',
                    'section_ids': []
                }
                for sec in friend.findall('Section'):
                    sec_id = sec.get('id')
                    if sec_id: share_info['section_ids'].append(int(sec_id))
                shares.append(share_info)
            return shares
    except Exception as e:
        raise Exception(f"Plex.tv 통신 실패: {str(e)}")

def restore_plex_tv_shares(machine_id, token, share_data):
    """백업된 공유 정보를 바탕으로 갱신된 섹션 ID를 Plex.tv에 업데이트합니다."""
    success_cnt = 0
    fail_cnt = 0
    
    for share in share_data:
        url = f"https://plex.tv/api/servers/{machine_id}/shared_servers/{share['id']}"
        payload_tuples = []
        
        if share.get('all_sections'):
            payload_tuples.append(('shared_server[all_sections]', '1'))
        else:
            payload_tuples.append(('shared_server[all_sections]', '0'))
            for sec_id in share.get('section_ids', []):
                payload_tuples.append(('shared_server[library_section_ids][]', str(sec_id)))
                
        data = urllib.parse.urlencode(payload_tuples).encode('utf-8')
        req = urllib.request.Request(url, data=data, method='PUT', headers={'X-Plex-Token': token})
        try:
            with urllib.request.urlopen(req, timeout=10) as res:
                if res.status in (200, 201, 204): success_cnt += 1
                else: fail_cnt += 1
        except Exception:
            fail_cnt += 1
            
    return success_cnt, fail_cnt

def restore_ownership(file_path, uid_gid_str=None):
    """파일의 소유권을 복구합니다 (SQLite 전용)."""
    try:
        if uid_gid_str and ':' in uid_gid_str:
            uid, gid = map(int, uid_gid_str.split(':'))
            os.chown(file_path, uid, gid)
            return True, f"수동 지정 ({uid}:{gid})"
        else:
            parent_dir = os.path.dirname(file_path)
            stat = os.stat(parent_dir)
            os.chown(file_path, stat.st_uid, stat.st_gid)
            return True, f"자동 감지 ({stat.st_uid}:{stat.st_gid})"
            
    except PermissionError:
        return False, "권한 부족 (Docker 내부에서 root 권한이 아니거나 소유권 변경이 막혀 있습니다.)"
    except Exception as e:
        return False, f"알 수 없는 오류 ({str(e)})"

# =====================================================================
# 1. UI 스키마 생성
# =====================================================================
def get_ui(core_api):
    opts = core_api.get('options', {})
    cfg = core_api.get('config', {})
    base_dir = cfg.get('base_dir', '')
    
    is_postgres = str(cfg.get('plex_db_type', 'sqlite3')).lower() == 'postgres'

    db_path_def = opts.get('db_path', cfg.get('plex_db_path', ''))
    sqlite_bin_def = opts.get('sqlite_bin', cfg.get('plex_sqlite_bin', '/usr/lib/plexmediaserver/Plex SQLite'))
    uid_gid_def = opts.get('uid_gid', '')
    
    tmp_safety = opts.get('tmp_action_safety', '')
    tmp_backup_db = opts.get('tmp_action_backup_db', '')
    tmp_backup_share = opts.get('tmp_action_backup_share', '')

    # 1. 사용 가능한 백업 파일 목록 자동 탐색 (복원 모드용)
    backup_options = []
    task_logs_dir = os.path.join(base_dir, 'task_logs')
    
    if is_postgres:
        if os.path.exists(task_logs_dir):
            for f in sorted(os.listdir(task_logs_dir), reverse=True):
                if f.startswith('section_backup_pg_') and f.endswith('.json'):
                    stamp_str = f.replace('section_backup_pg_', '').replace('.json', '')
                    try:
                        dt = datetime.strptime(stamp_str, "%Y%m%d_%H%M%S")
                        d_time = dt.strftime("%Y-%m-%d %H:%M:%S")
                    except: d_time = stamp_str
                    backup_options.append({"value": f, "text": f"[{d_time}] PG 섹션 스냅샷 ({f})"})
    else:
        if db_path_def and os.path.exists(os.path.dirname(db_path_def)):
            db_dir = os.path.dirname(db_path_def)
            for f in sorted(os.listdir(db_dir), reverse=True):
                if ".pmh_backup_" in f:
                    stamp_str = f.split('.pmh_backup_')[-1]
                    try:
                        dt = datetime.strptime(stamp_str, "%Y%m%d_%H%M%S")
                        d_time = dt.strftime("%Y-%m-%d %H:%M:%S")
                    except: d_time = stamp_str
                    backup_options.append({"value": f, "text": f"[{d_time}] SQLite DB 파일 백업 ({f})"})

    # 2. 동적 섹션 입력 폼 생성 (변경 모드 전용)
    section_inputs = []
    try:
        sections = core_api['query']("SELECT id, name FROM library_sections ORDER BY id ASC")
        for sec in sections:
            sec_id_val = int(sec.get('id'))
            sec_name_val = sec.get('name')
            tmp_sec_id = opts.get(f"tmp_new_id_{sec_id_val}", sec_id_val)
            
            section_inputs.append({
                "id": f"tmp_new_id_{sec_id_val}",
                "type": "number",
                "label": f"<span style='font-weight:normal; font-size:13px;'>현재 ID: [ {sec_id_val:>2} ]  {sec_name_val}</span>",
                "default": tmp_sec_id,
                "layout": "plain",
                "align": "left",
                "width": "80px",
                "show_if": {"mode": "change_id"}
            })
        if not section_inputs:
            section_inputs.append({"id": "h_err", "type": "header", "label": "⚠️ 섹션 정보를 읽을 수 없습니다. DB 설정을 확인하세요.", "show_if": {"mode": "change_id"}})
    except Exception as e:
        section_inputs.append({"id": "h_err", "type": "header", "label": f"⚠️ DB 연결 실패: {e}", "show_if": {"mode": "change_id"}})

    db_engine_badge = "<span style='color:#51a351; font-weight:bold;'>[PostgreSQL 모드]</span>" if is_postgres else "<span style='color:#2f96b4; font-weight:bold;'>[SQLite3 모드]</span>"

    settings_form = [
        {"id": "h_set1", "type": "header", "label": f"<i class='fas fa-cogs'></i> 환경 설정 {db_engine_badge}"}
    ]

    if not is_postgres:
        settings_form.extend([
            {"id": "db_path", "type": "text", "label": "Plex DB 파일 절대 경로", "default": db_path_def},
            {"id": "sqlite_bin", "type": "text", "label": "Plex SQLite 바이너리 경로", "default": sqlite_bin_def},
            {"id": "uid_gid", "type": "text", "label": "DB 소유권 복구 (UID:GID)", "default": uid_gid_def, "placeholder": "예: 1000:1000 (자동 감지 실패 시 입력)"}
        ])
    else:
        settings_form.append({
            "id": "h_pg_info", "type": "header", 
            "label": f"<div style='font-size:12px; color:#aaa; font-weight:normal;'>🐘 PostgreSQL 모드에서는 DB 파일 경로 및 chown 설정이 불필요하며, pmh_config.yaml의 <strong>PLEX_PG_CONFIG</strong> 연결 설정을 사용합니다.</div>"
        })

    settings_form.extend([
        {"id": "h_set2", "type": "header", "label": "<i class='fas fa-trash-alt'></i> 백업 파일 관리"},
        {"id": "tmp_action_manage_backup", 
         "type": "sub_action", 
         "action_type": "manage_backups", 
         "label": "백업 파일/스냅샷 삭제", 
         "color": "#bd362f", 
         "icon": "fas fa-eraser",
         "width": "180px",
         "height": "32px",
         "msg_pos": "right",
         "msg_style": "background: rgba(0,0,0,0.2); padding: 8px 12px; border-radius: 4px; width: 100%; height: 32px; border: 1px solid #333;"
        }
    ])

    return {
        "title": "섹션 매니저",
        "icon": "fas fa-layer-group",
        "description": "<span style='color:#bd362f; font-weight:bold;'>경고: 이 툴은 Plex DB를 직접 수정하며 실행 시 주의가 필요합니다.</span><br>"
                       "작업을 실행하기 전 반드시 Plex 미디어 서버(PMS)를 완전히 중지하시기 바랍니다.<br>"
                       "작업 도중 페이지를 새로고침하거나 탭을 닫으면 작업 내용이 유실될 수 있으므로 유지해 주세요.<br>"
                       "<span style='color:#e5a00d;'>※ 이 툴 실행으로 인한 DB 변경 책임은 사용자에게 있습니다.</span>",
        "inputs": [
            {"id": "mode", "type": "select", "label": "작업 모드 선택", "options": [
                {"value": "change_id", "text": "1. 섹션 ID 변경 (Change ID)"},
                {"value": "restore_id", "text": "2. 백업 데이터로 복원 (Rollback / Restore)"}
            ], "default": "change_id"},
            
            # [복원 모드 전용 UI]
            {"id": "h_restore", "type": "header", "label": "<i class='fas fa-history'></i> 복원할 백업 스냅샷 선택", "show_if": {"mode": "restore_id"}},
            {
                "id": "target_backup_file",
                "type": "select",
                "label": "복원 대상 백업 파일",
                "options": backup_options if backup_options else [{"value": "", "text": "사용 가능한 백업 파일이 없습니다."}],
                "show_if": {"mode": "restore_id"}
            },

            # [변경 모드 전용 UI]
            {"id": "h_pre", "type": "header", "label": "<i class='fas fa-clipboard-check'></i> 1. 실행 전 필수 안전 검사 및 백업", "show_if": {"mode": "change_id"}},
            
            # 1단계. 안전 검사
            {"id": "tmp_action_safety", 
             "type": "sub_action", 
             "action_type": "check_safety", 
             "label": "Plex 안전 검사 <span style='font-size:11px;'>(필수)</span>", 
             "default": tmp_safety,
             "color": "#2f96b4", 
             "icon": "fas fa-shield-alt",
             "width": "180px",
             "height": "50px",
             "font_size": "13px",
             "msg_pos": "right",
             "msg_style": "background: rgba(0,0,0,0.2); padding: 8px 12px; border-radius: 4px; width: 100%; height: 50px; border: 1px solid #333;",
             "show_if": {"mode": "change_id"}
            },
            
            # 2단계. 백업
            {"id": "tmp_action_backup_db", 
             "type": "sub_action", 
             "action_type": "backup_db", 
             "label": "Plex DB 백업 <span style='font-size:11px;'>(필수)</span>", 
             "default": tmp_backup_db,
             "color": "#e5a00d", 
             "icon": "fas fa-database",
             "width": "180px",
             "height": "50px",
             "font_size": "13px",
             "msg_pos": "right",
             "msg_style": "background: rgba(0,0,0,0.2); padding: 8px 12px; border-radius: 4px; width: 100%; height: 50px; border: 1px solid #333;",
             "show_if": {"mode": "change_id"}
            },
            
            # 3단계. 권한 백업
            {"id": "tmp_action_backup_share", 
             "type": "sub_action", 
             "action_type": "backup_shares", 
             "label": "친구 공유정보 백업 <span style='font-size:11px;'>(선택)</span>", 
             "default": tmp_backup_share,
             "color": "#51a351", 
             "icon": "fas fa-users",
             "width": "180px",
             "height": "50px",
             "font_size": "13px",
             "msg_pos": "right",
             "msg_style": "background: rgba(0,0,0,0.2); padding: 8px 12px; border-radius: 4px; width: 100%; height: 50px; border: 1px solid #333;",
             "show_if": {"mode": "change_id"}
            },
            
            {"id": "h_ids", "type": "header", "label": "<i class='fas fa-exchange-alt'></i> 2. 섹션 ID 변경 설정 (새로운 ID 입력)", "show_if": {"mode": "change_id"}}
        ] + section_inputs,

        "settings_inputs": settings_form,
        
        "buttons": [
            {
                "label": "DRY RUN (시뮬레이션 및 사전 검증)", 
                "action_type": "preview", 
                "icon": "fas fa-flask", 
                "color": "#2f96b4"
            },
            {
                "label": "🔥 실제 DB 작업 실행 (Execute)", 
                "action_type": "execute", 
                "icon": "fas fa-radiation-alt", 
                "color": "#bd362f"
            }
        ]
    }

# =====================================================================
# 2. 메인 라우터 (서브 액션 포함)
# =====================================================================
def run(data, core_api):
    action = data.get('action_type', 'preview')
    opts = core_api['options']
    cfg = core_api['config']
    
    is_postgres = str(cfg.get('plex_db_type', 'sqlite3')).lower() == 'postgres'
    db_path = opts.get('db_path', cfg.get('plex_db_path', ''))
    base_dir = cfg.get('base_dir', '')
    
    plex_url = cfg.get('PLEX_URL', '')
    plex_token = cfg.get('PLEX_TOKEN', '')
    machine_id = data.get('_machine_id') or data.get('_server_id', '')

    # -----------------------------------------------------------------
    # 서브 액션 1: 안전 검사 (check_safety)
    # -----------------------------------------------------------------
    if action == 'check_safety':
        print(f"[Section Manager] 🛡️ Plex 안전 검사 시작 (모드: {'PostgreSQL' if is_postgres else 'SQLite3'})")
        
        if check_plex_running(plex_url):
            return {"status": "error", "message": "❌ Plex 포트가 응답합니다. 서버가 완전히 종료되지 않았습니다."}, 200

        if is_postgres:
            try:
                core_api['query']("SELECT 1")
                return {"status": "success", "message": "✅ 통과 (Plex 종료 및 PostgreSQL 연결 확인됨)", "value": "passed"}, 200
            except Exception as pg_e:
                return {"status": "error", "message": f"❌ PostgreSQL DB 연결 실패: {pg_e}"}, 200
        else:
            if not os.path.exists(db_path):
                return {"status": "error", "message": "DB 파일이 존재하지 않습니다. 경로를 확인하세요."}, 200
                
            wal_path = f"{db_path}-wal"
            if os.path.exists(wal_path):
                return {"status": "error", "message": "❌ .wal 파일이 감지되었습니다. (Plex가 켜져 있거나 비정상 종료됨)"}, 200
                
            return {"status": "success", "message": "✅ 통과 (Plex 종료 및 SQLite DB 안전 확인됨)", "value": "passed"}, 200

    # -----------------------------------------------------------------
    # 서브 액션 2: DB 백업 (backup_db)
    # -----------------------------------------------------------------
    elif action == 'backup_db':
        stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        
        if is_postgres:
            try:
                task_logs_dir = os.path.join(base_dir, 'task_logs')
                os.makedirs(task_logs_dir, exist_ok=True)
                snapshot_file = os.path.join(task_logs_dir, f"section_backup_pg_{stamp}.json")
                
                sec_data = core_api['query']("SELECT id, name, section_type, language, agent, scanner, uuid FROM library_sections ORDER BY id ASC")
                payload = {
                    "backup_at": stamp,
                    "db_type": "postgres",
                    "sections": sec_data
                }
                with open(snapshot_file, 'w', encoding='utf-8') as f:
                    json.dump(payload, f, ensure_ascii=False, indent=2)
                    
                return {"status": "success", "message": f"✅ PG 섹션 스냅샷 백업 성공 ({len(sec_data)}개 섹션)", "value": snapshot_file}, 200
            except Exception as e:
                return {"status": "error", "message": f"❌ PG 스냅샷 백업 실패: {e}"}, 200
        else:
            if not os.path.exists(db_path):
                return {"status": "error", "message": "DB 파일이 없습니다."}, 200
                
            backup_path = f"{db_path}.pmh_backup_{stamp}"
            try:
                shutil.copy2(db_path, backup_path)
                size_mb = os.path.getsize(backup_path) / (1024 * 1024)
                return {"status": "success", "message": f"✅ DB 파일 백업 성공 ({size_mb:.1f}MB)", "value": backup_path}, 200
            except Exception as e:
                return {"status": "error", "message": f"❌ 백업 실패: {e}"}, 200

    # -----------------------------------------------------------------
    # 서브 액션 3: 공유 권한 백업 (backup_shares)
    # -----------------------------------------------------------------
    elif action == 'backup_shares':
        missing_items = []
        if not plex_token: missing_items.append("Plex 토큰")
        if not machine_id: missing_items.append("머신 ID")
        
        if missing_items:
            return {"status": "error", "message": f"❌ 인증 정보 누락: {', '.join(missing_items)}"}, 200
            
        try:
            shares = get_plex_tv_shares(machine_id, plex_token)
            backup_file = os.path.join(base_dir, 'task_logs', 'share_backup.json')
            os.makedirs(os.path.dirname(backup_file), exist_ok=True)
            with open(backup_file, 'w', encoding='utf-8') as f:
                json.dump(shares, f, ensure_ascii=False, indent=2)
                
            return {"status": "success", "message": f"✅ {len(shares)}명의 공유 권한 백업 완료", "value": backup_file}, 200
        except Exception as e:
            return {"status": "error", "message": f"❌ 권한 백업 실패: {e}"}, 200

    # -----------------------------------------------------------------
    # 서브 액션 4: 백업 파일 정리 (manage_backups)
    # -----------------------------------------------------------------
    elif action == 'manage_backups':
        del_cnt = 0
        
        if db_path and os.path.exists(os.path.dirname(db_path)):
            db_dir = os.path.dirname(db_path)
            for f in os.listdir(db_dir):
                if ".pmh_backup_" in f:
                    try:
                        os.remove(os.path.join(db_dir, f))
                        del_cnt += 1
                    except OSError as rm_err:
                        print(f"[Section Manager] 파일 삭제 실패 ({f}): {rm_err}")

        task_logs_dir = os.path.join(base_dir, 'task_logs')
        if os.path.exists(task_logs_dir):
            for f in os.listdir(task_logs_dir):
                if f.startswith("section_backup_pg_"):
                    try:
                        os.remove(os.path.join(task_logs_dir, f))
                        del_cnt += 1
                    except OSError as rm_err:
                        print(f"[Section Manager] 파일 삭제 실패 ({f}): {rm_err}")
                    
        if del_cnt > 0:
            return {"status": "success", "message": f"✅ 총 {del_cnt}개의 백업 파일/스냅샷을 삭제했습니다."}, 200
        return {"status": "error", "message": "삭제할 백업 파일이 없습니다."}, 200

    # -----------------------------------------------------------------
    # 메인 액션 1: DRY RUN (preview)
    # -----------------------------------------------------------------
    elif action == 'preview':
        task_data = data.copy()
        task_data['plex_url'] = plex_url
        task_data['plex_token'] = plex_token
        task_data['machine_id'] = machine_id
        return {"status": "success", "type": "async_task", "task_data": task_data}, 200

    # -----------------------------------------------------------------
    # 메인 액션 2: 실제 실행 (execute)
    # -----------------------------------------------------------------
    elif action == 'execute':
        mode = data.get('mode', 'change_id')
        
        if mode == 'change_id':
            is_safety_passed = data.get('tmp_action_safety') == 'passed'
            has_db_backup = bool(data.get('tmp_action_backup_db'))
            
            if not is_safety_passed:
                return {"status": "error", "message": "실행 전 [Plex 안전 검사]를 먼저 통과해야 합니다."}, 200
            if not has_db_backup:
                return {"status": "error", "message": "안전을 위해 [Plex DB 백업]을 먼저 수행해 주세요."}, 200
        elif mode == 'restore_id':
            if not data.get('target_backup_file'):
                return {"status": "error", "message": "복원할 백업 파일을 선택하세요."}, 200
            
        task_data = data.copy()
        task_data['plex_url'] = plex_url
        task_data['plex_token'] = plex_token
        task_data['machine_id'] = machine_id
        return {"status": "success", "type": "async_task", "task_data": task_data}, 200

    return {"status": "error", "message": "알 수 없는 명령입니다."}, 400

# =====================================================================
# 3. 백그라운드 워커 (실행 및 복원 시뮬레이션 로직)
# =====================================================================
def worker(task_data, core_api, start_progress):
    task = core_api['task']
    action = task_data.get('action_type')
    mode = task_data.get('mode', 'change_id')
    cfg = core_api['config']
    opts = core_api['options']
    
    is_postgres = str(cfg.get('plex_db_type', 'sqlite3')).lower() == 'postgres'
    db_path = opts.get('db_path', cfg.get('plex_db_path', ''))
    base_dir = cfg.get('base_dir', '')
    task_logs_dir = os.path.join(base_dir, 'task_logs')
    
    task.update_state('running', progress=0, total=100)
    
    # 0. 공통: library_section_id 컬럼을 가진 모든 연관 테이블 동적 스캔
    try:
        if is_postgres:
            tables_query = """
                SELECT DISTINCT table_name AS name 
                FROM information_schema.columns 
                WHERE column_name = 'library_section_id' 
                  AND table_schema NOT IN ('pg_catalog', 'information_schema')
            """
            tables_info = core_api['query'](tables_query)
            target_tables = [t['name'] for t in tables_info if t['name'] != 'library_sections']
        else:
            tables_query = "SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
            tables_info = core_api['query'](tables_query)
            target_tables = []
            for t in tables_info:
                if t['name'] == 'library_sections': continue
                sql_def = t.get('sql', '')
                if sql_def and ('"library_section_id"' in sql_def or ' library_section_id ' in sql_def):
                    target_tables.append(t['name'])
    except Exception as e:
        task.log(f"❌ 연관 테이블 분석 실패: {e}")
        task.update_state('error'); return

    # =========================================================================
    # [A] 복원 모드 (Rollback / Restore)
    # =========================================================================
    if mode == 'restore_id':
        backup_filename = task_data.get('target_backup_file', '').strip()
        if not backup_filename:
            task.log("❌ 오류: 복원할 백업 파일이 지정되지 않았습니다.")
            task.update_state('error'); return

        task.log(f"🔄 [RESTORE] 백업 스냅샷을 통한 섹션 ID 복원 시작 ({backup_filename})")
        
        # 1. 안전 검사 (Plex 프로세스 종료 확인)
        plex_url = task_data.get('plex_url', '')
        if plex_url and check_plex_running(plex_url):
            task.log(f"❌ 치명적 오류: Plex 서버({plex_url})가 아직 실행 중입니다. 안전을 위해 Plex를 먼저 종료해 주세요.")
            task.update_state('error'); return

        if is_postgres:
            # 💡 [PostgreSQL 복원 파이프라인]
            snapshot_path = os.path.join(task_logs_dir, backup_filename)
            if not os.path.exists(snapshot_path):
                task.log(f"❌ 백업 파일을 찾을 수 없습니다: {snapshot_path}")
                task.update_state('error'); return

            try:
                with open(snapshot_path, 'r', encoding='utf-8') as f:
                    snapshot_data = json.load(f)
                backup_sections = snapshot_data.get('sections', [])
            except Exception as e:
                task.log(f"❌ 백업 스냅샷 파싱 실패: {e}")
                task.update_state('error'); return

            # 현재 DB의 섹션 목록 조회
            try:
                current_sections = core_api['query']("SELECT id, name, uuid FROM library_sections")
            except Exception as e:
                task.log(f"❌ 현재 DB 섹션 조회 실패: {e}")
                task.update_state('error'); return

            # uuid (또는 name) 기준으로 롤백 매핑(current_id -> original_id) 계산
            rollback_map = {}
            restore_details = []

            for cur_sec in current_sections:
                cur_id = int(cur_sec['id'])
                cur_uuid = cur_sec.get('uuid')
                cur_name = cur_sec.get('name')

                # 백업 데이터에서 일치하는 섹션 탐색 (uuid 우선, name 보조)
                matched_orig = None
                for b_sec in backup_sections:
                    if cur_uuid and b_sec.get('uuid') and b_sec.get('uuid') == cur_uuid:
                        matched_orig = b_sec; break
                    elif b_sec.get('name') == cur_name:
                        matched_orig = b_sec; break

                if matched_orig:
                    orig_id = int(matched_orig['id'])
                    if cur_id != orig_id:
                        rollback_map[cur_id] = orig_id
                        restore_details.append(f" 🎯 [{cur_name}] : 현재 ID {cur_id} ➔ 원본 ID {orig_id} 복원")
                else:
                    task.log(f"   ℹ️ [{cur_name}] 섹션은 백업 시점 이후에 새로 추가된 섹션이므로 ID를 유지합니다.")

            if not rollback_map:
                task.log("ℹ️ 현재 DB의 섹션 ID가 이미 백업 시점의 원본 ID와 완전히 동일합니다. (복원 불필요)")
                task.update_state('completed', progress=100, total=100); return

            # DRY RUN
            if action == 'preview':
                task.log("=" * 50)
                task.log(f"🧪 [DRY RUN] PostgreSQL 섹션 ID 복원 시뮬레이션")
                task.log("=" * 50)
                for line in restore_details: task.log(line)
                task.log("-" * 50)
                task.log(f" 🗃️ 복원 대상 연관 테이블 ({len(target_tables)}개): {', '.join(target_tables)}")
                task.log("=" * 50)
                task.log("✅ 시뮬레이션 완료. 실행(Execute) 버튼을 누르면 실제 롤백이 진행됩니다.")
                task.update_state('completed', progress=100, total=100)
                return

            # EXECUTE (PostgreSQL 원자적 트랜잭션 롤백 실행)
            task.log("🚀 [EXECUTE] PostgreSQL 데이터베이스 롤백 트랜잭션 실행 중...")
            task.update_state('running', progress=30, total=100)
            
            cur_sec_ids = [int(s['id']) for s in current_sections]
            max_id = max(max(cur_sec_ids), max(rollback_map.values()))
            temp_offset = max_id + 1000

            sql_lines = []
            for idx, (cur_id, orig_id) in enumerate(rollback_map.items()):
                tmp_id = temp_offset + idx
                sql_lines.append(f"UPDATE library_sections SET id = {tmp_id} WHERE id = {cur_id}")
                for tbl in target_tables:
                    sql_lines.append(f"UPDATE \"{tbl}\" SET library_section_id = {tmp_id} WHERE library_section_id = {cur_id}")

            for idx, (cur_id, orig_id) in enumerate(rollback_map.items()):
                tmp_id = temp_offset + idx
                sql_lines.append(f"UPDATE library_sections SET id = {orig_id} WHERE id = {tmp_id}")
                for tbl in target_tables:
                    sql_lines.append(f"UPDATE \"{tbl}\" SET library_section_id = {orig_id} WHERE library_section_id = {tmp_id}")

            final_sql = ";\n".join(sql_lines)
            try:
                success, output = core_api['execute'](final_sql)
                if not success: raise Exception(output or "롤백 트랜잭션 실패")
                task.log("   -> ✅ PostgreSQL 데이터베이스 복원 완료!")
            except Exception as e:
                task.log(f"❌ 롤백 실행 실패: {e}")
                task.update_state('error'); return

        else:
            # 💡 [SQLite3 파일 복원 파이프라인]
            db_dir = os.path.dirname(db_path)
            backup_full_path = os.path.join(db_dir, backup_filename)
            if not os.path.exists(backup_full_path):
                task.log(f"❌ 백업 파일을 찾을 수 없습니다: {backup_full_path}")
                task.update_state('error'); return

            if action == 'preview':
                size_mb = os.path.getsize(backup_full_path) / (1024 * 1024)
                task.log("=" * 50)
                task.log(f"🧪 [DRY RUN] SQLite DB 파일 복원 시뮬레이션")
                task.log("=" * 50)
                task.log(f" 🎯 복원할 파일: {backup_filename} ({size_mb:.1f}MB)")
                task.log(f" 🎯 대상 파일: {db_path}")
                task.log("=" * 50)
                task.log("✅ 검증 완료. 실행(Execute) 시 백업 파일로 원본 DB를 덮어씁니다.")
                task.update_state('completed', progress=100, total=100)
                return

            task.log("🚀 [EXECUTE] SQLite DB 파일 복원 진행 중...")
            try:
                for ext in ["-wal", "-shm"]:
                    w_file = db_path + ext
                    if os.path.exists(w_file):
                        try: os.remove(w_file)
                        except OSError as rm_err:
                            task.log(f"⚠️ {ext} 파일 삭제 실패: {rm_err}")
                shutil.copy2(backup_full_path, db_path)
                task.log("   -> ✅ DB 파일 복원 완료!")
            except Exception as e:
                task.log(f"❌ 파일 복원 실패: {e}")
                task.update_state('error'); return

            # 파일 소유권 복구
            uid_gid = task_data.get('uid_gid', '').strip()
            ok, msg = restore_ownership(db_path, uid_gid)
            task.log(f"   -> 소유권 복구: {'성공' if ok else '실패'} ({msg})")

        # 친구 공유 권한 롤백 (공통)
        share_backup_file = os.path.join(task_logs_dir, 'share_backup.json')
        if os.path.exists(share_backup_file):
            task.log("   -> 🌐 Plex.tv 공유 권한(친구) 원상 복구 시도 중...")
            try:
                with open(share_backup_file, 'r', encoding='utf-8') as f:
                    share_data = json.load(f)
                s_cnt, f_cnt = restore_plex_tv_shares(task_data.get('machine_id'), task_data.get('plex_token'), share_data)
                task.log(f"      - 친구 공유 권한 복원 완료: 성공 {s_cnt}명, 실패 {f_cnt}명")
            except Exception as e:
                task.log(f"      - ⚠️ 친구 공유 권한 복원 중 오류: {e}")

        task.update_state('completed', progress=100, total=100)
        task.log("=" * 50)
        task.log("🎉 백업 시점으로 성공적으로 복원되었습니다!")
        task.log("💡 지금 Plex Media Server를 시작하세요.")
        task.log("=" * 50)
        return

    # =========================================================================
    # [B] 변경 모드 (Change ID)
    # =========================================================================
    # 1. 입력받은 ID 매핑 파싱 (tmp_new_id_*)
    id_map = {}
    new_ids = set()
    
    try:
        current_sections = core_api['query']("SELECT id, name FROM library_sections")
        sec_dict = {int(s['id']): s['name'] for s in current_sections}
    except Exception as e:
        task.log(f"❌ DB 읽기 실패: {e}")
        task.update_state('error'); return
        
    for key, val in task_data.items():
        if key.startswith('tmp_new_id_') and val is not None and str(val).strip():
            try:
                old_id = int(key.replace('tmp_new_id_', ''))
                new_id = int(val)
                if old_id in sec_dict:
                    id_map[old_id] = new_id
                    new_ids.add(new_id)
            except ValueError:
                task.log(f"⚠️ 경고: '{key}'의 입력값 '{val}'이 올바른 숫자가 아닙니다. 무시합니다.")
                
    # 2. 유효성 검사
    if len(new_ids) != len(id_map):
        task.log("❌ 오류: 입력한 새로운 섹션 ID 중 중복되는 값이 있습니다.")
        task.update_state('error'); return
        
    changed_map = {o: n for o, n in id_map.items() if o != n}
    
    task.log(f"🔍 입력된 전체 ID 매핑: {id_map}")
    task.log(f"🔍 변경이 감지된 ID 매핑: {changed_map}")

    if not changed_map:
        task.log("⚠️ 변경할 섹션 ID가 없습니다. (입력값과 기존값이 모두 동일합니다)")
        task.update_state('completed', progress=100, total=100); return

    unmodified_ids = set(sec_dict.keys()) - set(changed_map.keys())
    conflicts = set(changed_map.values()) & unmodified_ids
    if conflicts:
        task.log(f"❌ 오류: 변경할 새 ID가 수정하지 않는 기존 라이브러리 ID와 충돌합니다. (충돌 ID: {list(conflicts)})")
        task.update_state('error'); return

    # 3. DRY RUN (미리보기)
    if action == 'preview':
        task.log("=" * 50)
        task.log(f"🧪 [DRY RUN] 섹션 ID 변경 시뮬레이션 결과 ({'PostgreSQL' if is_postgres else 'SQLite3'})")
        task.log("=" * 50)
        for old_id, new_id in changed_map.items():
            task.log(f" 🎯 [{sec_dict[old_id]}] : ID {old_id} ➔ {new_id} 변경 예정")
        task.log("-" * 50)
        task.log(f" 🗃️ 업데이트 대상 테이블 ({len(target_tables)}개): {', '.join(target_tables)}")
        task.log("=" * 50)
        task.log("✅ 시뮬레이션 완료. 중복 및 충돌 에러가 없습니다. 실행(Execute)을 진행해도 안전합니다.")
        task.update_state('completed', progress=100, total=100)
        return

    # 4. EXECUTE (실제 실행)
    if action == 'execute':
        task.log("🚀 [EXECUTE] 실제 DB 변경 작업을 시작합니다...")
        task.update_state('running', progress=20, total=100)
        
        # 4-1. 더블 체크 (Plex 프로세스 종료 확인)
        plex_url = task_data.get('plex_url', '')
        if plex_url and check_plex_running(plex_url):
            task.log(f"❌ 치명적 오류: Plex 서버({plex_url})가 아직 응답하고 있습니다. DB 보호를 위해 작업을 강제 중지합니다.")
            task.update_state('error'); return
            
        task.log("   -> ✅ 더블 체크 통과: Plex 프로세스 종료 확인 완료.")
            
        # 4-2. SQL 구문 생성 (Temp ID 활용)
        max_id = max(max(sec_dict.keys()), max(changed_map.values()))
        temp_offset = max_id + 1000
        
        sql_lines = []
        task.log("   -> 트랜잭션 생성 중 (1단계: 임시 ID 이동)")
        for idx, (old_id, new_id) in enumerate(changed_map.items()):
            tmp_id = temp_offset + idx
            sql_lines.append(f"UPDATE library_sections SET id = {tmp_id} WHERE id = {old_id}")
            for tbl in target_tables:
                sql_lines.append(f"UPDATE \"{tbl}\" SET library_section_id = {tmp_id} WHERE library_section_id = {old_id}")
                
        task.log("   -> 트랜잭션 생성 중 (2단계: 최종 ID 부여)")
        for idx, (old_id, new_id) in enumerate(changed_map.items()):
            tmp_id = temp_offset + idx
            sql_lines.append(f"UPDATE library_sections SET id = {new_id} WHERE id = {tmp_id}")
            for tbl in target_tables:
                sql_lines.append(f"UPDATE \"{tbl}\" SET library_section_id = {new_id} WHERE library_section_id = {tmp_id}")
                
        final_sql = ";\n".join(sql_lines)
        
        # 4-3. Universal DB 엔진을 통한 원자적 쓰기 실행
        task.log(f"   -> ⚡ DB 트랜잭션 쓰기 실행 중 ({'PostgreSQL 소켓' if is_postgres else 'Plex SQLite 바이너리'})...")
        task.update_state('running', progress=50, total=100)
        try:
            success, output = core_api['execute'](final_sql)
            if not success: raise Exception(output or "DB 쓰기 실패")
            task.log("   -> ✅ DB 쿼리 실행 완료!")
        except Exception as e:
            task.log(f"❌ 쿼리 실행 실패 (롤백 됨): {e}")
            task.update_state('error'); return
            
        # 4-4. 소유권(UID:GID) 복구 (SQLite 전용)
        if not is_postgres:
            uid_gid = task_data.get('uid_gid', '').strip()
            task.log("   -> 파일 소유권 복구 시도 중...")
            task.update_state('running', progress=70, total=100)
            
            files_to_chown = [db_path, f"{db_path}-shm", f"{db_path}-wal"]
            for f in files_to_chown:
                if os.path.exists(f):
                    ok, msg = restore_ownership(f, uid_gid)
                    if ok: task.log(f"      - {os.path.basename(f)} : 성공 ({msg})")
                    else: task.log(f"      - {os.path.basename(f)} : 실패 - {msg}")
        else:
            task.log("   -> ℹ️ PostgreSQL 모드: 파일 소유권 복구 단계 자동 생략 (소켓 직결)")
                
        # 4-5. 공유 권한 복구 (Plex.tv API 연동)
        share_backup_file = os.path.join(task_logs_dir, 'share_backup.json')
        if os.path.exists(share_backup_file):
            task.log("   -> 🌐 Plex.tv 공유 권한(친구) 매핑 업데이트 진행 중...")
            task.update_state('running', progress=85, total=100)
            try:
                with open(share_backup_file, 'r', encoding='utf-8') as f:
                    share_data = json.load(f)
                    
                for share in share_data:
                    if not share.get('all_sections'):
                        updated_sections = []
                        for old_sec in share.get('section_ids', []):
                            updated_sections.append(changed_map.get(old_sec, old_sec))
                        share['section_ids'] = list(set(updated_sections))
                        
                s_cnt, f_cnt = restore_plex_tv_shares(task_data.get('machine_id'), task_data.get('plex_token'), share_data)
                task.log(f"      - 권한 업데이트 완료: 성공 {s_cnt}명, 실패 {f_cnt}명")
            except Exception as e:
                task.log(f"      - ⚠️ 공유 권한 복구 중 오류 발생: {e}")
                
        task.update_state('completed', progress=100, total=100)
        task.log("=" * 50)
        task.log("🎉 모든 작업이 성공적으로 완료되었습니다!")
        task.log("💡 지금 Plex Media Server를 시작하고 라이브러리를 확인하세요.")
        task.log("   홈 화면 순서가 어긋났다면 핀 고정 해제 후 다시 고정하세요.")
        task.log("=" * 50)
        return
