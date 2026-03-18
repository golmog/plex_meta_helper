# -*- coding: utf-8 -*-

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
    """파일의 소유권을 복구합니다."""
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
    
    # 1. 기본값 설정 (Config -> Options 순)
    db_path_def = opts.get('db_path', cfg.get('PLEX_DB_PATH', ''))
    sqlite_bin_def = opts.get('sqlite_bin', cfg.get('plex_sqlite_bin', '/usr/lib/plexmediaserver/Plex SQLite'))
    uid_gid_def = opts.get('uid_gid', '')
    
    tmp_safety = opts.get('tmp_action_safety', '')
    tmp_backup_db = opts.get('tmp_action_backup_db', '')
    tmp_backup_share = opts.get('tmp_action_backup_share', '')

    # 2. 동적 섹션 입력 폼 생성
    section_inputs = []
    try:
        sections = core_api['query']("SELECT id, name FROM library_sections ORDER BY id ASC")
        for sec in sections:
            tmp_sec_id = opts.get(f"tmp_new_id_{sec['id']}", sec['id'])
            
            section_inputs.append({
                "id": f"tmp_new_id_{sec['id']}",
                "type": "number",
                "label": f"<span style='font-weight:normal; font-size:13px;'>현재 ID: [ {sec['id']:>2} ]  {sec['name']}</span>",
                "default": tmp_sec_id,
                "layout": "plain",
                "align": "left",
                "width": "80px"
            })
        if not section_inputs:
            section_inputs.append({"id": "h_err", "type": "header", "label": "⚠️ 섹션 정보를 읽을 수 없습니다. DB 경로를 확인하세요."})
    except Exception as e:
        section_inputs.append({"id": "h_err", "type": "header", "label": f"⚠️ DB 연결 실패: {e}"})

    return {
        "title": "섹션 매니저",
        "description": "<span style='color:#bd362f; font-weight:bold;'>경고: 이 툴은 Plex DB를 직접 수정하며 실행 시 주의가 필요합니다.</span><br>"
                       "작업을 실행하기 전 반드시 Plex 서버를 중지하시기 바랍니다.<br>"
                       "작업을 실행하기 전 환경 설정을 확인하고 [설정 적용]을 눌러 저장해 주세요.<br>"
                       "작업 도중 페이지를 새로고침하거나 탭을 닫으면 작업 내용이 유실될 수 있으므로 유지해 주세요.<br>"
                       "<span style='color:#e5a00d;'>※ 이 툴을 실행 시 Plex DB가 손상될 수 있으며 모든 책임은 사용자에게 있습니다.</span>",
        "inputs": [
            {"id": "mode", "type": "select", "label": "작업 모드", "options": [
                {"value": "change_id", "text": "섹션 ID 변경"}
            ], "default": "change_id"},
            
            {"id": "h_pre", "type": "header", "label": "<i class='fas fa-clipboard-check'></i> 1. 실행 전 필수 안전 검사 및 백업"},
            
            # 1단계. 안전 검사
            {"id": "tmp_action_safety", 
             "type": "sub_action", 
             "action_type": "check_safety", 
             "label": "Plex DB 안전 검사 <span style='font-size:11px;'>(필수)</span>", 
             "default": tmp_safety,
             "color": "#2f96b4", 
             "icon": "fas fa-shield-alt",
             "width": "180px",
             "height": "50px",
             "font_size": "13px",
             "msg_pos": "right",
             "msg_style": "background: rgba(0,0,0,0.2); padding: 8px 12px; border-radius: 4px; width: 100%; height: 50px; border: 1px solid #333;"
            },
            
            # 2단계. 로컬 백업
            {"id": "tmp_action_backup_db", 
             "type": "sub_action", 
             "action_type": "backup_db", 
             "label": "Plex DB 파일 백업 <span style='font-size:11px;'>(필수)</span>", 
             "default": tmp_backup_db,
             "color": "#e5a00d", 
             "icon": "fas fa-database",
             "width": "180px",
             "height": "50px",
             "font_size": "13px",
             "msg_pos": "right",
             "msg_style": "background: rgba(0,0,0,0.2); padding: 8px 12px; border-radius: 4px; width: 100%; height: 50px; border: 1px solid #333;"
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
             "msg_style": "background: rgba(0,0,0,0.2); padding: 8px 12px; border-radius: 4px; width: 100%; height: 50px; border: 1px solid #333;"
            },
            
            {"id": "h_ids", "type": "header", "label": "<i class='fas fa-exchange-alt'></i> 2. 섹션 ID 변경 설정 (새로운 ID 입력)"}
        ] + section_inputs,

        "settings_inputs": [
            {"id": "h_set1", "type": "header", "label": "<i class='fas fa-cogs'></i> 환경 설정"},
            {"id": "db_path", "type": "text", "label": "Plex DB 파일 절대 경로", "default": db_path_def},
            {"id": "sqlite_bin", "type": "text", "label": "Plex SQLite 바이너리 경로", "default": sqlite_bin_def},
            {"id": "uid_gid", "type": "text", "label": "DB 소유권 복구 (UID:GID)", "default": uid_gid_def, "placeholder": "예: 1000:1000 (자동 감지 실패 시 입력)"},
            {"id": "h_set2", "type": "header", "label": "<i class='fas fa-trash-alt'></i> 백업 관리"},
            
            {"id": "tmp_action_manage_backup", 
             "type": "sub_action", 
             "action_type": "manage_backups", 
             "label": "기존 백업 파일 모두 삭제", 
             "color": "#bd362f", 
             "icon": "fas fa-eraser",
             "width": "180px",
             "height": "32px",
             "msg_pos": "right",
             "msg_style": "background: rgba(0,0,0,0.2); padding: 8px 12px; border-radius: 4px; width: 100%; height: 32px; border: 1px solid #333;"
            }
        ],
        
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
    
    # 1. DB 및 바이너리 경로 (UI 옵션 우선 > 서버 설정)
    db_path = opts.get('db_path', cfg.get('PLEX_DB_PATH', ''))
    sqlite_bin = opts.get('sqlite_bin', cfg.get('plex_sqlite_bin', ''))
    if sqlite_bin and hasattr(core_api, 'config'):
        core_api['config']['plex_sqlite_bin'] = sqlite_bin
        
    # 2. 💡 Plex URL과 Token
    plex_url = cfg.get('PLEX_URL', '')
    plex_token = cfg.get('PLEX_TOKEN', '')
    
    # 3. Machine ID (프론트엔드가 추출해준 _machine_id 사용, 없으면 설정된 _server_id 사용)
    machine_id = data.get('_machine_id') or data.get('_server_id', '')
    
    if not db_path:
        return {"status": "error", "message": "환경 설정 탭에서 DB 경로를 먼저 입력하세요."}, 200

    # -----------------------------------------------------------------
    # 서브 액션 1: 안전 검사 (check_safety)
    # -----------------------------------------------------------------
    if action == 'check_safety':
        print(f"[Section Manager] 🛡️ Plex DB 안전 검사 시작 (DB: {db_path})")
        if not os.path.exists(db_path):
            print(f"[Section Manager] ❌ 검사 실패: DB 파일을 찾을 수 없습니다.")
            return {"status": "error", "message": "DB 파일이 존재하지 않습니다. 경로를 확인하세요."}, 200
            
        wal_path = f"{db_path}-wal"
        if os.path.exists(wal_path):
            print(f"[Section Manager] ❌ 검사 실패: .wal 파일이 존재합니다. (Plex 구동 중)")
            return {"status": "error", "message": "❌ .wal 파일이 감지되었습니다. (Plex가 아직 켜져 있거나 비정상 종료됨)"}, 200
            
        if check_plex_running(plex_url):
            print(f"[Section Manager] ❌ 검사 실패: Plex 포트가 응답합니다.")
            return {"status": "error", "message": "❌ Plex 포트가 응답합니다. 서버가 완전히 종료되지 않았습니다."}, 200
            
        print(f"[Section Manager] ✅ 안전 검사 통과: Plex 종료 및 DB 안정성 확인됨.")
        return {"status": "success", "message": "✅ 통과 (Plex 종료 및 DB 안전 상태 확인됨)", "value": "passed"}, 200

    # -----------------------------------------------------------------
    # 서브 액션 2: DB 로컬 백업 (backup_db)
    # -----------------------------------------------------------------
    elif action == 'backup_db':
        print(f"[Section Manager] 💾 Plex DB 백업 시작...")
        if not os.path.exists(db_path):
            print(f"[Section Manager] ❌ 백업 실패: DB 파일이 없습니다.")
            return {"status": "error", "message": "DB 파일이 없습니다."}, 200
            
        stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_path = f"{db_path}.pmh_backup_{stamp}"
        try:
            shutil.copy2(db_path, backup_path)
            size_mb = os.path.getsize(backup_path) / (1024 * 1024)
            print(f"[Section Manager] ✅ DB 백업 완료: {backup_path} ({size_mb:.1f}MB)")
            return {"status": "success", "message": f"✅ 백업 성공 ({size_mb:.1f}MB)", "value": backup_path}, 200
        except Exception as e:
            print(f"[Section Manager] ❌ DB 백업 중 예외 발생: {e}")
            return {"status": "error", "message": f"❌ 백업 실패: {e}"}, 200

    # -----------------------------------------------------------------
    # 서브 액션 3: 공유 권한 백업 (backup_shares)
    # -----------------------------------------------------------------
    elif action == 'backup_shares':
        print(f"[Section Manager] 🌐 친구 공유 정보 백업 시작...")
        
        # 명확한 에러 분리 및 로깅
        missing_items = []
        if not plex_token: missing_items.append("Plex 토큰 (Token)")
        if not machine_id: missing_items.append("머신 ID (Machine ID)")
        
        if missing_items:
            error_msg = f"❌ 인증 정보 누락: {', '.join(missing_items)} 값을 서버 설정이나 UI로부터 가져오지 못했습니다."
            print(f"[Section Manager] {error_msg}")
            return {"status": "error", "message": error_msg}, 200
            
        try:
            shares = get_plex_tv_shares(machine_id, plex_token)
            
            backup_file = os.path.join(os.path.dirname(__file__), 'share_backup.json')
            with open(backup_file, 'w', encoding='utf-8') as f:
                json.dump(shares, f, ensure_ascii=False, indent=2)
                
            print(f"[Section Manager] ✅ 권한 백업 완료: 총 {len(shares)}명의 사용자 데이터 저장됨.")
            return {"status": "success", "message": f"✅ {len(shares)}명의 공유 권한 백업 완료", "value": backup_file}, 200
        except Exception as e:
            print(f"[Section Manager] ❌ 권한 백업 중 예외 발생: {e}")
            return {"status": "error", "message": f"❌ 백업 실패: {e}"}, 200

    # -----------------------------------------------------------------
    # 서브 액션 4: 백업 파일 정리 (manage_backups)
    # -----------------------------------------------------------------
    elif action == 'manage_backups':
        print(f"[Section Manager] 🧹 기존 백업 파일 정리 시작...")
        db_dir = os.path.dirname(db_path)
        if not os.path.exists(db_dir):
            print(f"[Section Manager] ❌ 삭제 실패: DB 디렉토리를 찾을 수 없습니다.")
            return {"status": "error", "message": "DB 디렉토리를 찾을 수 없습니다."}, 200
            
        del_cnt = 0
        for f in os.listdir(db_dir):
            if ".pmh_backup_" in f:
                try:
                    os.remove(os.path.join(db_dir, f))
                    del_cnt += 1
                except: pass
        if del_cnt > 0:
            print(f"[Section Manager] ✅ 총 {del_cnt}개의 과거 백업 파일을 삭제했습니다.")
            return {"status": "success", "message": f"✅ {del_cnt}개의 백업 파일이 삭제되었습니다."}, 200
            
        print(f"[Section Manager] ℹ️ 삭제할 백업 파일이 없습니다.")
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
        is_safety_passed = data.get('tmp_action_safety') == 'passed'
        has_db_backup = bool(data.get('tmp_action_backup_db'))
        
        if not is_safety_passed:
            return {"status": "error", "message": "실행 전 [Plex DB 안전 검사]를 먼저 통과해야 합니다."}, 200
        if not has_db_backup:
            return {"status": "error", "message": "안전을 위해 [Plex DB 백업]을 먼저 수행해 주세요."}, 200
            
        task_data = data.copy()
        task_data['plex_url'] = plex_url
        task_data['plex_token'] = plex_token
        task_data['machine_id'] = machine_id
        
        return {"status": "success", "type": "async_task", "task_data": task_data}, 200

    return {"status": "error", "message": "알 수 없는 명령입니다."}, 400

# =====================================================================
# 3. 백그라운드 워커 (실행 및 시뮬레이션 로직)
# =====================================================================
def worker(task_data, core_api, start_progress):
    task = core_api['task']
    action = task_data.get('action_type')
    cfg = core_api['config']
    opts = core_api['options']
    db_path = opts.get('db_path', cfg.get('PLEX_DB_PATH', ''))
    sqlite_bin = opts.get('sqlite_bin', cfg.get('plex_sqlite_bin', ''))
    if sqlite_bin and hasattr(core_api, 'config'):
        core_api['config']['plex_sqlite_bin'] = sqlite_bin
    
    task.update_state('running', progress=0, total=100)
    
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
        
    # 변경된 ID만 필터링 (기존 ID와 다른 경우만)
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

    # 3. 트랜잭션 SQL 생성 준비 (library_section_id 컬럼을 가진 모든 테이블 스캔)
    try:
        tables_query = "SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
        tables_info = core_api['query'](tables_query)
        target_tables = []
        for t in tables_info:
            if t['name'] == 'library_sections': continue
            sql_def = t.get('sql', '')
            if sql_def and ('"library_section_id"' in sql_def or ' library_section_id ' in sql_def):
                target_tables.append(t['name'])
    except Exception as e:
        task.log(f"❌ 테이블 분석 실패: {e}")
        task.update_state('error'); return

    # 4. DRY RUN (미리보기)
    if action == 'preview':
        task.log("=" * 50)
        task.log("🧪 [DRY RUN] 섹션 ID 변경 시뮬레이션 결과")
        task.log("=" * 50)
        for old_id, new_id in changed_map.items():
            task.log(f" 🎯 [{sec_dict[old_id]}] : ID {old_id} ➔ {new_id} 변경 예정")
        task.log("-" * 50)
        task.log(f" 🗃️ 업데이트 대상 테이블 ({len(target_tables)}개):")
        task.log(f"    {', '.join(target_tables)}")
        task.log("=" * 50)
        task.log("✅ 시뮬레이션 완료. 중복 및 충돌 에러가 없습니다. 실행(Execute)을 진행해도 안전합니다.")
        task.update_state('completed', progress=100, total=100)
        return

    # 5. EXECUTE (실제 실행)
    if action == 'execute':
        task.log("🚀 [EXECUTE] 실제 DB 변경 작업을 시작합니다...")
        task.update_state('running', progress=20, total=100)
        
        # 5-1. 더블 체크 (Plex 종료 확인)
        wal_path = f"{db_path}-wal"
        if os.path.exists(wal_path):
            task.log("❌ 치명적 오류: .wal 파일이 감지되었습니다. DB 보호를 위해 작업을 강제 중지합니다.")
            task.update_state('error'); return
            
        # 5-2. SQL 구문 생성 (Temp ID 활용)
        # UNIQUE 제약조건 충돌을 막기 위해 모든 변경 대상을 임시 ID(+1000)로 먼저 올린 후 최종 ID로 내림
        max_id = max(max(sec_dict.keys()), max(changed_map.values()))
        temp_offset = max_id + 1000
        
        sql_lines = []
        
        # Step 1: 임시 ID로 대피
        task.log("   -> 트랜잭션 생성 중 (1단계: 임시 ID 이동)")
        for idx, (old_id, new_id) in enumerate(changed_map.items()):
            tmp_id = temp_offset + idx
            sql_lines.append(f"UPDATE library_sections SET id = {tmp_id} WHERE id = {old_id}")
            for tbl in target_tables:
                sql_lines.append(f"UPDATE \"{tbl}\" SET library_section_id = {tmp_id} WHERE library_section_id = {old_id}")
                
        # Step 2: 최종 새 ID로 안착
        task.log("   -> 트랜잭션 생성 중 (2단계: 최종 ID 부여)")
        for idx, (old_id, new_id) in enumerate(changed_map.items()):
            tmp_id = temp_offset + idx
            sql_lines.append(f"UPDATE library_sections SET id = {new_id} WHERE id = {tmp_id}")
            for tbl in target_tables:
                sql_lines.append(f"UPDATE \"{tbl}\" SET library_section_id = {new_id} WHERE library_section_id = {tmp_id}")
                
        final_sql = ";\n".join(sql_lines)
        
        # 5-3. Plex SQLite 바이너리 실행
        task.log("   -> ⚡ Plex SQLite 바이너리를 통한 DB 쓰기 작업 실행 중...")
        task.update_state('running', progress=50, total=100)
        try:
            success, output = core_api['execute'](final_sql)
            if not success:
                raise Exception("바이너리 실행 반환 실패")
            task.log("   -> ✅ DB 쿼리 실행 완료!")
        except Exception as e:
            task.log(f"❌ 쿼리 실행 실패 (롤백 됨): {e}")
            task.update_state('error'); return
            
        # 5-4. 소유권(UID:GID) 복구
        uid_gid = task_data.get('uid_gid', '').strip()
        task.log("   -> 파일 소유권 복구 시도 중...")
        task.update_state('running', progress=70, total=100)
        
        files_to_chown = [db_path, f"{db_path}-shm", f"{db_path}-wal"]
        for f in files_to_chown:
            if os.path.exists(f):
                ok, msg = restore_ownership(f, uid_gid)
                if ok: task.log(f"      - {os.path.basename(f)} : 성공 ({msg})")
                else: task.log(f"      - {os.path.basename(f)} : 실패 (권한 부족 가능성) - {msg}")
                
        # 5-5. 공유 권한 복구 (Plex.tv API 연동)
        share_backup_file = task_data.get('tmp_action_backup_share')
        if share_backup_file and os.path.exists(share_backup_file):
            task.log("   -> 🌐 Plex.tv 공유 권한(친구) 매핑 업데이트 진행 중...")
            task.update_state('running', progress=85, total=100)
            try:
                with open(share_backup_file, 'r', encoding='utf-8') as f:
                    share_data = json.load(f)
                    
                # 백업된 옛날 ID를 이번에 바꾼 새 ID로 교체
                for share in share_data:
                    if not share.get('all_sections'):
                        updated_sections = []
                        for old_sec in share.get('section_ids', []):
                            updated_sections.append(changed_map.get(old_sec, old_sec))
                        share['section_ids'] = list(set(updated_sections))
                        
                s_cnt, f_cnt = restore_plex_tv_shares(task_data.get('_server_id'), task_data.get('_plex_token'), share_data)
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
