# -*- coding: utf-8 -*-
"""
====================================================================================
 [PMH Bundle Tool] - AV 매니저 (AV Manager)
====================================================================================
"""

import os
import re
import sqlite3
import json
import time
import urllib.request, urllib.parse, urllib.error
import pmh_core
from collections import defaultdict
from pmh_core import compile_jav_rules, extract_jav_pid, normalize_pid_for_comparison

def normalize_pid(pid_str):
    return normalize_pid_for_comparison(pid_str)

def find_local_meta_json(dir_name, base_name, raw_pid=None, files_in_dir=None, cfg=None, compiled_rules=None):
    """DB 품번(1MOON-009), 숫자 접두사 제거(moon-009), 파일명 추출 품번을 순차 대조하여 로컬 JSON 탐색"""
    candidates = []

    # DB 제목 내 품번 원본 (예: 1moon-009.json)
    if raw_pid:
        p_clean = str(raw_pid).strip().lower()
        candidates.append(f"{p_clean}.json")

        # 라벨 분류용 숫자 접두사 제거 폴백 (예: 1MOON-009 -> moon-009.json, 298GOOD-026 -> good-026.json)
        stripped_pid = re.sub(r'^\d+', '', p_clean)
        if stripped_pid and stripped_pid != p_clean:
            candidates.append(f"{stripped_pid}.json")

    # 실제 비디오 파일명에서 정규식으로 추출한 품번 (예: 파일명이 [M-Team] moon-009-C 1080p.mp4 인 경우 moon-009.json)
    if base_name:
        if cfg and compiled_rules:
            try:
                f_pids = extract_jav_pid(base_name, cfg, compiled_rules)
                for f_l, f_n in f_pids:
                    candidates.append(f"{f_l.lower()}-{f_n.lower()}.json")
                    candidates.append(f"{f_l.lower()}{f_n.lower()}.json")
            except Exception: pass

        # 파일명 자체 (예: moon-009.json)
        b_clean = base_name.lower().strip()
        candidates.append(f"{b_clean}.json")

    # 중복 제거 (우선순위 순서 보존)
    seen = set()
    unique_candidates = [c for c in candidates if c and not (c in seen or seen.add(c))]

    # 디렉터리 파일 캐시(files_in_dir)가 제공된 경우 O(1) 메모리 검색
    if files_in_dir is not None:
        for c_name in unique_candidates:
            if c_name in files_in_dir:
                return os.path.join(dir_name, c_name), [os.path.join(dir_name, c) for c in unique_candidates]
        return None, [os.path.join(dir_name, c) for c in unique_candidates]

    # 디스크 실존 검사 (os.path.exists)
    for c_name in unique_candidates:
        target_path = os.path.join(dir_name, c_name)
        if os.path.exists(target_path):
            return target_path, [os.path.join(dir_name, c) for c in unique_candidates]

    return None, [os.path.join(dir_name, c) for c in unique_candidates]

# =====================================================================
# 디스코드 알림 기본 템플릿
# =====================================================================
DEFAULT_DISCORD_TEMPLATE = """**✅ AV 매니저 작업이 완료되었습니다.**

**[📊 종합 통계]**
- 총 소요 시간: {elapsed_time}
- 처리된 대상: {total} 건

**[🛠️ 세부 작업 내역]**
- 검사 모드: {scan_mode_label}
"""

# ==============================================================================
# UI 스키마 제공
# ==============================================================================
def get_ui(core_api=None):
    sections = []
    default_secs = []

    history_db_path = ""
    if core_api and 'config' in core_api:
        base_dir = core_api['config'].get('base_dir', '')
        history_db_path = os.path.join(base_dir, 'task_logs', 'av_manager_poster_history.db')

    if core_api:
        try:
            res = core_api['query']("SELECT id, name FROM library_sections ORDER BY name ASC")
            for r in res:
                sec_val = str(r["id"])
                sections.append({"value": sec_val, "text": r["name"]})
                default_secs.append(sec_val)
        except Exception: pass

    return {
        "title": "AV 매니저",
        "icon": "fas fa-heart",
        "description": "AV 라이브러리(동양/서양)의 오류 검출, 중복 정리, 배우 한글화, 포스터 일괄 적용 및 메타데이터를 관리합니다.",
        "inputs": [
            {
                "id": "target_sections",
                "type": "multi_select",
                "label": "조회 대상 라이브러리",
                "options": sections if sections else [{"value": "", "text": "라이브러리 없음"}],
                "default": default_secs
            },
            {
                "id": "scan_mode",
                "type": "radio_group",
                "label": "검사 모드",
                "default": "mismatch",
                "options": [
                    {"value": "mismatch", "label": "품번 불일치 및 오매칭 검출"},
                    {"value": "dupes", "label": "품번 기준 분리/중복 등록 검출"},
                    {"value": "meta_sync", "label": "FF 메타 DB / 유저 포스터 동기화"},
                    {"value": "llm_translation", "label": "LLM (Ollama) 번역 미적용 항목 검출 및 리매칭"},
                    {"value": "file_error", "label": "파일명 처리 오류 (기본/원본 품번 불일치) 검출"},
                    {"value": "preview_clip", "label": "일괄 프리뷰 클립 생성 (트레일러 없는 영상)"}
                ]
            },
            
            {"id": "filter_fields", "type": "multi_select", "label": "임시 검색 필터 적용 필드", "options": [
                {"value": "guid", "text": "에이전트 (GUID)"},
                {"value": "title", "text": "제목 (Title)"},
                {"value": "path", "text": "파일/폴더 경로 (Path)"}
            ], "default": ["title", "path"]},
            {"id": "filter_include", "type": "text", "label": "포함 키워드 (1회성, 정규표현식은 regex|| 사용)", "placeholder": "예: fc2 또는 regex||^\\[sod\\]"},
            {"id": "filter_exclude", "type": "text", "label": "제외 키워드 (1회성, 정규표현식은 regex|| 사용)", "placeholder": "예: sjva_agent:// 또는 regex||\\.mp4$"}
        ],
        "execute_inputs": [
            {
                "id": "opt_unmatch_first", 
                "type": "checkbox", 
                "label": "매칭 전 언매치 우선 실행", 
                "default": True, 
                "hide_if": {"scan_mode": "file_error"}
            },
            {"id": "opt_manual_match", "type": "checkbox", "label": "수동 매칭 모드 사용 (모든 사이트 강제 검색)", "default": False, "hide_if": {"scan_mode": "file_error"}},
            {"id": "opt_skip_sim_check", "type": "checkbox", "label": "매칭 시 제목/연도 검증 스킵 (모든 에이전트 적용)", "default": False, "hide_if": {"scan_mode": "file_error"}},
            {"id": "opt_use_custom_score", "type": "checkbox", "label": "에이전트 매칭 통과 점수 직접 지정", "default": False, "hide_if": {"scan_mode": "file_error"}},
            {"id": "opt_custom_agent_score", "type": "number", "label": "매칭 통과 최소 점수", "default": 95, "width": "60px", "layout": "plain", "show_if": {"opt_use_custom_score": True}},
            {"id": "opt_search_priority", "type": "select", "label": "매칭 검색어 우선순위", "options": [
                {"value": "auto", "text": "자동 (AV 등 커스텀은 파일, 일반은 폴더)"},
                {"value": "folder", "text": "폴더명 우선 (일반 영화/쇼 강제)"},
                {"value": "file", "text": "파일명 우선 (단일 파일 강제)"}
            ], "default": "auto", "hide_if": {"scan_mode": "file_error"}},

            {
                "id": "retry_errors",
                "type": "checkbox",
                "label": "이전에 실패(Error)한 항목도 다시 시도",
                "default": False,
                "hide_if": {"scan_mode": "file_error"}
            }
        ],
        "settings_inputs": [
            {"id": "s_h_filter", "type": "header", "label": "<i class='fas fa-filter'></i> 전역 필터링 설정 (filters.yaml 대체)"},
            {"id": "fixed_filter_cron_only", "type": "checkbox", "label": "자동 스케줄러(Cron) 실행 시에만 고정 필터 적용 (수동 조회 시 무시)", "default": False},
            {"id": "fixed_filter_fields", "type": "multi_select", "label": "고정 필터 적용 필드", "options": [
                {"value": "guid", "text": "에이전트 (GUID)"},
                {"value": "title", "text": "제목 (Title)"},
                {"value": "path", "text": "파일/폴더 경로 (Path)"}
            ], "default": ["title", "path"]},
            {"id": "fixed_filter_include", "type": "textarea", "label": "고정 포함 키워드 (한 줄에 하나씩 입력)", "height": 80, "placeholder": "예: fc2\nregex||^\\[sod\\]"},
            {"id": "fixed_filter_exclude", "type": "textarea", "label": "고정 제외 키워드 (한 줄에 하나씩 입력)", "height": 80, "placeholder": "예: sjva_agent://\nregex||\\.mp4$"},

            {"id": "s_h1", "type": "header", "label": "<i class='fas fa-tachometer-alt'></i> 실행 속도 제어"},
            {
                "id": "sleep_time", 
                "type": "number", 
                "label": "항목 처리 후 대기 시간 (단위: 초)", 
                "default": 1
            },
            
            {
                "id": "image_server_path",
                "type": "text",
                "label": "포스터 경로 (서버 내 로컬 경로)",
                "default": "/data/images",
                "placeholder": "예) /mnt/images"
            },
            {
                "id": "image_web_url",
                "type": "text",
                "label": "포스터 웹 접근 주소 (미리보기 용 URL)",
                "default": "",
                "placeholder": "예) https://ff.your-server.com/images"
            },

            {"id": "s_h_cron", "type": "header", "label": "<i class='fas fa-clock'></i> 자동 실행 스케줄러"},
            {"id": "cron_enable", "type": "checkbox", "label": "크론탭(Crontab) 기반 자동 실행 활성화", "default": False},
            {"id": "cron_expr", "type": "cron", "label": "크론탭 시간 설정 (분 시 일 월 요일)", "placeholder": "0 4 * * *"},
            
            {"id": "s_h2", "type": "header", "label": "<i class='fab fa-discord'></i> 알림 설정"},
            {"id": "discord_enable", "type": "checkbox", "label": "작업 완료 시 디스코드 통계 알림 발송", "default": True},
            {"id": "discord_webhook", "type": "text", "label": "툴 전용 웹훅 URL (비워두면 서버 전역 설정 사용)", "placeholder": "https://discord.com/api/webhooks/..."},
            {"id": "discord_bot_name", "type": "text", "label": "디스코드 봇 이름 오버라이딩", "placeholder": "예: {server_name}의 봇"},
            {"id": "discord_avatar_url", "type": "text", "label": "디스코드 봇 프로필 이미지 URL", "placeholder": "https://.../icon.png"},
            {
                "id": "discord_template", "type": "textarea", "label": "본문 메시지 템플릿 편집", "height": 130, "default": DEFAULT_DISCORD_TEMPLATE, 
                "template_vars": [
                    {"key": "total", "desc": "처리된 총 항목 수"},
                    {"key": "elapsed_time", "desc": "총 소요 시간 (예: 5분 20초)"},
                    {"key": "scan_mode_label", "desc": "실행한 검사 모드 이름"}
                ]
            },
            {
                "id": "discord_template_footer", "type": "textarea", "label": "푸터(Footer) 템플릿 편집", "height": 50, "default": "Plex Meta Helper - {tool_id} | {server_name}", 
                "template_vars": [
                    {"key": "tool_id", "desc": "실행된 툴의 고유 ID"},
                    {"key": "server_name", "desc": "사용자가 설정한 서버 이름"},
                    {"key": "time", "desc": "현재 시간"}
                ]
            }
        ],
        "buttons": [
            {"action_type": "preview", "label": "목록 조회", "icon": "fas fa-search", "color": "#2f96b4"}
        ]
    }

# ==============================================================================
# 메인 실행 로직 (라우터)
# ==============================================================================
def run(data, core_api):
    action = data.get('action_type', 'preview')

    if action == 'preview':
        task_data = data.copy()
        task_data['_auto_refresh_ui'] = True  
        return {"status": "success", "type": "async_task", "task_data": task_data}, 200

    if action == 'cron_run':
        task_data = data.copy()
        return {"status": "success", "type": "async_task", "task_data": task_data}, 200

    if action == 'execute':
        if data.get('_is_cron'):
            task_state = core_api['task'].load()
            if task_state and task_state.get('state') in ['cancelled', 'error'] and task_state.get('progress', 0) < task_state.get('total', 0):
                cached_page = core_api['cache'].load_page(1, 1)
                if cached_page and cached_page.get('total_items', 0) > 0:
                    task_data = data.copy()
                    task_data['_use_cache_db'] = True
                    task_data['total'] = cached_page.get('total_items')
                    task_data['_resume_start_index'] = task_state.get('progress', 0)
                    task_data['_is_cron'] = True
                    return {"status": "success", "type": "async_task", "task_data": task_data}, 200

            task_data = data.copy()
            task_data['action_type'] = 'cron_run'
            task_data['_is_cron'] = True
            return {"status": "success", "type": "async_task", "task_data": task_data}, 200

        elif data.get('_is_single'):
            single_id = str(data.get('rating_key') or data.get('id', ''))
            
            items = [{
                'id': single_id,
                'rating_key': single_id,
                'title': data.get('title', '단일 항목'),
                'op_action': data.get('op_action', 'match'),
                'section_name': data.get('section_name', ''),
                '_raw_db_pid': data.get('_raw_db_pid', ''),
                '_raw_sec_id': data.get('_raw_sec_id', ''),
                '_poster_files': data.get('_poster_files', ''),
                '_sjva_code': data.get('_sjva_code', ''),
                '_sjva_cat': data.get('_sjva_cat', ''),
                'raw_path': data.get('raw_path', ''),
            }]
            task_data = data.copy()
            task_data['target_items'] = items
            task_data['total'] = len(items)
            return {"status": "success", "type": "async_task", "task_data": task_data}, 200
        else:
            cached_page = core_api['cache'].load_page(1, 1)
            if cached_page and cached_page.get('total_items', 0) > 0:
                task_data = data.copy()
                task_data['_use_cache_db'] = True
                task_data['total'] = cached_page.get('total_items')
                task_data.pop('target_items', None)
                return {"status": "success", "type": "async_task", "task_data": task_data}, 200
            else:
                return {"status": "error", "message": "캐시된 대상이 없습니다. 먼저 조회해주세요."}, 400

    return {"status": "error", "message": f"지원하지 않는 명령입니다 ({action})"}, 400

# =====================================================================
# 프리뷰 클립 생성을 위한 헬퍼
# =====================================================================
def extract_sjva_code_and_cat(guid):
    if not guid: return None, None
    s = str(guid).strip()
    if '://' in s: s = s.split('://', 1)[1]
    if '?' in s: s = s.split('?', 1)[0]
    s = s.strip()
    if not s or s == '-' or s.startswith('local') or s.startswith('none'):
        return None, None
    
    prefix = s[0].upper()
    if prefix == 'C': return s, 'JAV_CEN'
    elif prefix == 'E': return s, 'JAV_UNCEN'
    elif prefix == 'W': return s, 'WESTERN'
    return None, None

def find_best_video_file(file_list):
    if not file_list: return ""
    clean_files = [f.strip() for f in file_list if f.strip()]
    if not clean_files: return ""
    if len(clean_files) == 1: return clean_files[0]

    part1_pattern = re.compile(r'[-_. ]?(cd|part|pt|disc|dvd)[\s._-]*0*1\b|[-_. ]0*1\.[a-zA-Z0-9]+$', re.IGNORECASE)
    for f in clean_files:
        if part1_pattern.search(os.path.basename(f)):
            return f

    sorted_files = sorted(clean_files, key=lambda x: [int(t) if t.isdigit() else t.lower() for t in re.split(r'(\d+)', os.path.basename(x))])
    return sorted_files[0]

def make_ff_preview_clip(global_config, code, cat, video_path):
    mate_url = global_config.get('mate_url', '').rstrip('/')
    mate_apikey = global_config.get('mate_apikey', '')
    if not mate_url or not mate_apikey:
        return False, "FF(Plex Mate) 연결 설정(BASE.FF_URL / BASE.FF_APIKEY) 누락"

    params = urllib.parse.urlencode({'apikey': mate_apikey})
    target_url = f"{mate_url}/metadata/api/meta_db/make_preview_clip?{params}"
    payload = {
        'code': code,
        'cat': cat,
        'video_path': video_path,
        'apikey': mate_apikey
    }
    
    try:
        data = json.dumps(payload).encode('utf-8')
        req = urllib.request.Request(
            target_url, data=data, method='POST',
            headers={
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) PlexMetaHelper/1.0'
            }
        )
        with urllib.request.urlopen(req, timeout=300) as response:
            res_text = response.read().decode('utf-8')
            res_json = json.loads(res_text)
            if res_json.get('ret') == 'success':
                return True, res_json.get('msg', '프리뷰 클립 생성 성공')
            else:
                return False, res_json.get('msg', 'FF 프리뷰 생성 실패')
    except Exception as e:
        return False, f"FF 통신 실패: {e}"

def fetch_ff_meta_info(global_config, code=None, media_path=None):
    """FF 메타데이터 info API를 호출하여 최신 메타 JSON을 가져옴 (media_path 자동 파싱 지원)"""
    mate_url = global_config.get('mate_url', '').rstrip('/')
    mate_apikey = global_config.get('mate_apikey', '')
    if not mate_url or not mate_apikey:
        return None

    query_params = {'apikey': mate_apikey}
    if code: query_params['code'] = code
    if media_path: query_params['media_path'] = media_path

    # 카테고리 모듈 판별 (C: jav_censored, E: jav_uncensored, W: western)
    module = 'jav_censored'
    if code:
        prefix = code[0].upper()
        if prefix == 'E': module = 'jav_uncensored'
        elif prefix == 'W': module = 'western'

    target_url = f"{mate_url}/metadata/api/{module}/info?{urllib.parse.urlencode(query_params)}"
    try:
        req = urllib.request.Request(
            target_url,
            headers={
                'Accept': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) PlexMetaHelper/1.0'
            }
        )
        with urllib.request.urlopen(req, timeout=10) as response:
            res_text = response.read().decode('utf-8')
            return json.loads(res_text)
    except Exception:
        return None

def fetch_ff_meta_batch(global_config, category, codes_list):
    """FF 메타데이터 DB의 info_batch API를 호출하여 대량(최대 100건)의 메타데이터를 일괄 조회"""
    if not codes_list:
        return {}

    mate_url = global_config.get('mate_url', '').rstrip('/')
    mate_apikey = global_config.get('mate_apikey', '')
    if not mate_url or not mate_apikey:
        return {}

    # 소문자 모듈명 정규화 (jav_censored / jav_uncensored / western)
    cat_lower = str(category).lower()
    if cat_lower in ['jav_cen', 'c']:
        target_cat = 'jav_censored'
    elif cat_lower in ['jav_uncen', 'e']:
        target_cat = 'jav_uncensored'
    elif cat_lower in ['western', 'w']:
        target_cat = 'western'
    else:
        target_cat = cat_lower

    params = urllib.parse.urlencode({'apikey': mate_apikey})
    target_url = f"{mate_url}/metadata/api/meta_db/info_batch?{params}"

    payload = {
        'category': target_cat,
        'codes': codes_list,
        'apikey': mate_apikey
    }

    try:
        data = json.dumps(payload).encode('utf-8')
        req = urllib.request.Request(
            target_url,
            data=data,
            method='POST',
            headers={
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'X-API-Key': mate_apikey,
                'apikey': mate_apikey,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) PlexMetaHelper/1.0'
            }
        )
        with urllib.request.urlopen(req, timeout=30) as response:
            res_text = response.read().decode('utf-8')
            res_json = json.loads(res_text)
            if res_json.get('ret') == 'success' and isinstance(res_json.get('data'), dict):
                return res_json.get('data')
            return {}
    except Exception:
        return {}

def query_ff_meta_direct_pg(meta_db_api, category, codes_list):
    """코어의 범용 meta_db 인터페이스를 통해 툴이 정의한 최적화 SQL로 대량 메타데이터를 직접 고속 조회"""
    if not codes_list or not meta_db_api or not meta_db_api.get('is_enabled') or not meta_db_api['is_enabled']():
        return {}

    # 카테고리 명칭 정규화 (JAV_CEN, JAV_UNCEN, WESTERN)
    cat_upper = str(category).upper()
    if cat_upper in ['JAV_CEN', 'C']:
        target_cat = 'JAV_CEN'
    elif cat_upper in ['JAV_UNCEN', 'E']:
        target_cat = 'JAV_UNCEN'
    elif cat_upper in ['WESTERN', 'W']:
        target_cat = 'WESTERN'
    else:
        target_cat = cat_upper

    # B-Tree 인덱스를 완벽히 타도록 파이썬에서 대문자 및 원본 코드를 합쳐 유니크 튜플로 사전 구성
    candidate_codes = set()
    for c in codes_list:
        if c:
            cs = str(c).strip()
            if cs:
                candidate_codes.add(cs)
                candidate_codes.add(cs.upper())

    if not candidate_codes:
        return {}

    codes_tuple = tuple(candidate_codes)

    sql = """
        SELECT 
            mi.id,
            mi.code,
            mi.ui_code,
            mi.title,
            mi.tagline,
            mi.plot,
            mi.poster_url,
            mi.extra_info,
            EXISTS(
                SELECT 1 FROM meta_media mm 
                WHERE mm.item_id = mi.id AND mm.is_user = TRUE AND mm.media_type = 'poster'
            ) AS has_user_p,
            EXISTS(
                SELECT 1 FROM meta_media mm 
                WHERE mm.item_id = mi.id AND mm.is_user = TRUE AND mm.media_type = 'landscape'
            ) AS has_user_pl
        FROM meta_item mi
        WHERE mi.category = %s 
          AND (mi.code IN %s OR mi.ui_code IN %s)
    """

    params = (target_cat, codes_tuple, codes_tuple)
    rows = meta_db_api['query'](sql, params)
    if not rows:
        return {}

    result_map = {}
    for r in rows:
        c_code = r.get('code') or ''
        c_ui = r.get('ui_code') or ''
        extra_info = r.get('extra_info') if isinstance(r.get('extra_info'), dict) else {}

        # 썸네일 리스트 조립 (유저 포스터 등록 여부 반영)
        thumbs = []
        stem_name = (c_ui or c_code).lower()
        if r.get('has_user_pl'):
            thumbs.append({'aspect': 'landscape', 'value': f"{stem_name}_pl_user.jpg"})

        p_val = r.get('poster_url') or ''
        if r.get('has_user_p'):
            p_val = f"{stem_name}_p_user.jpg"
        if p_val:
            thumbs.append({'aspect': 'poster', 'value': p_val})

        # 배우 목록 추출 (extra_info['_actors'] 정규화 데이터 활용)
        raw_actors = extra_info.get('_actors') or extra_info.get('actor_cache') or []
        actors_list = []
        for a in raw_actors:
            if isinstance(a, dict):
                a_ko = a.get('name_ko', '').strip()
                a_org = a.get('name_org', '').strip()
                actors_list.append({
                    'name': a_ko or a_org,
                    'name_ko': a_ko,
                    'name_org': a_org,
                    'name_en': a.get('name_en', '').strip(),
                    'actor_idx': str(a.get('actor_idx') or '').strip()
                })

        item_meta = {
            'code': c_code,
            'ui_code': c_ui,
            'title': r.get('title') or '',
            'tagline': r.get('tagline') or '',
            'plot': r.get('plot') or '',
            'thumb': thumbs,
            'actor': actors_list,
            'extra_info': extra_info
        }

        if c_code:
            result_map[c_code.lower()] = item_meta
        if c_ui:
            result_map[c_ui.lower()] = item_meta

    return result_map

def detect_meta_diff(local_json, ff_json):
    """로컬 JSON과 FF 메타 DB JSON을 대조하여 갱신 사유 목록(배우 한글화/유저 포스터/LLM 번역)을 반환"""
    diff_reasons = []
    if not ff_json:
        return diff_reasons

    # 배우 이름 한글화 여부 정밀 대조
    local_actors = local_json.get('actor') or []
    ff_actors = ff_json.get('actor') or []
    has_actor_diff = False

    for ff_act in ff_actors:
        if not isinstance(ff_act, dict): continue
        ff_name = ff_act.get('name', '').strip()
        ff_ko = ff_act.get('name_ko', '').strip()
        ff_org = ff_act.get('name_org', '').strip()

        # FF DB에 한글 표기가 존재하는 배우 기준
        target_kr = ff_ko or ff_name
        if not re.search(r'[가-힣]', target_kr):
            continue

        matched_loc = None
        for loc_act in local_actors:
            if not isinstance(loc_act, dict): continue
            loc_name = loc_act.get('name', '').strip()
            loc_org = loc_act.get('name_org', '').strip()
            loc_idx = loc_act.get('actor_idx', '').strip()
            ff_idx = ff_act.get('actor_idx', '').strip()

            if (ff_idx and loc_idx and ff_idx == loc_idx) or \
               (ff_org and loc_org and ff_org == loc_org) or \
               (loc_name in [ff_name, ff_ko, ff_org]):
                matched_loc = loc_act
                break

        if matched_loc:
            loc_name = matched_loc.get('name', '').strip()
            # 로컬의 표시 이름(name)에 한글이 없거나 FF의 한글 이름과 일치하지 않는 경우
            if not re.search(r'[가-힣]', loc_name) or loc_name != target_kr:
                has_actor_diff = True
                break
        else:
            if not local_actors:
                has_actor_diff = True
                break

    if has_actor_diff:
        diff_reasons.append("배우 정보 업데이트")

    # 유저 포스터/썸네일 갱신 여부 대조
    local_thumbs = local_json.get('thumb') or []
    ff_thumbs = ff_json.get('thumb') or []

    local_thumb_urls = {t.get('value', '') for t in local_thumbs if isinstance(t, dict)}
    ff_thumb_urls = {t.get('value', '') for t in ff_thumbs if isinstance(t, dict)}

    has_user_poster_in_ff = any('_user.jpg' in u for u in ff_thumb_urls)
    has_user_poster_in_loc = any('_user.jpg' in u for u in local_thumb_urls)

    if (has_user_poster_in_ff and not has_user_poster_in_loc) or (ff_thumb_urls and local_thumb_urls != ff_thumb_urls):
        diff_reasons.append("유저 포스터")

    # 번역 내용(줄거리/부제/제목) 실질적 텍스트 차이 대조
    loc_plot = str(local_json.get('plot', '')).strip()
    ff_plot = str(ff_json.get('plot', '')).strip()
    loc_tagline = str(local_json.get('tagline', '')).strip()
    ff_tagline = str(ff_json.get('tagline', '')).strip()
    loc_title = str(local_json.get('title', '')).strip()
    ff_title = str(ff_json.get('title', '')).strip()

    is_content_diff = False
    if ff_plot and loc_plot != ff_plot:
        is_content_diff = True
    elif ff_tagline and loc_tagline != ff_tagline:
        is_content_diff = True
    elif ff_title and loc_title != ff_title:
        is_content_diff = True

    if is_content_diff:
        diff_reasons.append("번역 내용 차이")

    return diff_reasons


# =====================================================================
# FF metadata 로컬 메타 DB 유저 이미지 동기화 헬퍼
# =====================================================================
def update_ff_user_images(global_config, files_list):
    mate_url = global_config.get('mate_url', '')
    mate_apikey = global_config.get('mate_apikey', '')
    if not mate_url or not mate_apikey:
        return False, "FF(Plex Mate) 연결 설정(BASE.FF_URL / BASE.FF_APIKEY) 누락"

    params = urllib.parse.urlencode({'apikey': mate_apikey})
    url = f"{mate_url.rstrip('/')}/metadata/api/jav_censored/user_image_update?{params}"
    
    CHUNK_SIZE = 500
    total_updated = 0
    total_skipped = 0
    total_not_found = 0

    try:
        for i in range(0, len(files_list), CHUNK_SIZE):
            chunk = files_list[i:i + CHUNK_SIZE]
            
            form_payload = {
                'apikey': mate_apikey,
                'files': json.dumps(chunk)
            }
            encoded_data = urllib.parse.urlencode(form_payload).encode('utf-8')
            
            req = urllib.request.Request(url, data=encoded_data, method='POST')
            req.add_header('Content-Type', 'application/x-www-form-urlencoded')
            req.add_header('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36')

            with urllib.request.urlopen(req, timeout=30) as resp:
                raw_resp = resp.read().decode('utf-8')
                try:
                    res_json = json.loads(raw_resp)
                except Exception:
                    return False, f"FF 응답 파싱 실패 (Raw: {raw_resp[:100]})"

                if res_json.get('ret') != 'success':
                    return False, f"FF 처리 실패 ({res_json.get('ret')}): {res_json.get('msg', '상세 사유 없음')}"

                total_updated += res_json.get('updated_count', 0)
                total_skipped += res_json.get('skipped_count', 0)
                total_not_found += res_json.get('not_found_count', 0)
                    
        return True, f"FF 메타 DB 반영 성공 (갱신: {total_updated:,}건, 스킵: {total_skipped:,}건, 미등록: {total_not_found:,}건)"

    except urllib.error.HTTPError as e:
        err_body = ""
        try: err_body = f" - {e.read().decode('utf-8')}"
        except: pass
        return False, f"FF HTTP 오류 ({e.code}{err_body})"
    except Exception as e:
        return False, f"FF 통신 실패: {e}"


# ==============================================================================
# 워커 쓰레드 로직 (백그라운드 처리)
# ==============================================================================
def worker(task_data, core_api, start_index):
    task = core_api['task']
    action = task_data.get('action_type')
    mode = task_data.get('scan_mode', 'mismatch')
    
    # ----------------------------------------------------------------------
    # 1. Preview / Cron_Run 모드 (조회 및 검출)
    # ----------------------------------------------------------------------
    if action in ["preview", "cron_run"]:
        prefix = "[자동 실행] " if action == 'cron_run' else ""
        task.log(f"{prefix}데이터베이스에서 아이템 목록을 쿼리하는 중입니다. 잠시만 기다려주세요...")
        task.update_state('running', progress=0, total=100)
        core_api['cache'].reset_db()
        
        section_ids = task_data.get('target_sections', [])
        clean_sec_ids = [int(x) for x in section_ids if str(x).isdigit()]
        
        if not clean_sec_ids:
            task.log("⚠️ 유효한 라이브러리가 선택되지 않았습니다. 설정을 확인하세요.")
            task.update_state('completed', progress=100, total=100)
            return
            
        try:
            placeholders = ",".join("?" for _ in clean_sec_ids)
            
            # PostgreSQL ANSI 규격 준수: SELECT의 비집계 컬럼을 GROUP BY에 전수 명시
            group_fn = "string_agg" if core_api['config'].get('plex_db_type') == 'postgres' else "GROUP_CONCAT"
            q = f"""
                SELECT mi.id, mi.title, mi.guid, ls.id AS section_id, ls.name AS section_name,
                       {group_fn}(mp.file, '|||') AS all_files,
                       (
                           (SELECT COUNT(*) FROM metadata_relations mr WHERE mr.metadata_item_id = mi.id OR mr.related_metadata_item_id = mi.id)
                           +
                           (SELECT COUNT(*) FROM metadata_items sub WHERE sub.parent_id = mi.id)
                       ) AS extra_count
                FROM metadata_items mi
                JOIN library_sections ls ON mi.library_section_id = ls.id
                LEFT JOIN media_items mpi ON mpi.metadata_item_id = mi.id
                LEFT JOIN media_parts mp ON mp.media_item_id = mpi.id
                WHERE mi.library_section_id IN ({placeholders}) AND mi.metadata_type = 1
                GROUP BY mi.id, mi.title, mi.guid, ls.id, ls.name
            """
            all_items = core_api['query'](q, tuple(clean_sec_ids))
            
            if not all_items:
                task.log("선택한 라이브러리에 해당하는 항목(영화)이 없습니다.")
                task.update_state('completed', 100, 100)
                return

            # 1회성 임시 필터 (조회 탭)
            ui_filter_fields = task_data.get('filter_fields', ['guid', 'title'])
            filter_include_raw = task_data.get('filter_include', '')
            filter_exclude_raw = task_data.get('filter_exclude', '')
            
            #고정 전역 필터 (환경설정 탭)
            fixed_filter_cron_only = task_data.get('fixed_filter_cron_only', False)
            fixed_filter_fields = task_data.get('fixed_filter_fields', ['title', 'path'])
            fixed_filter_include_raw = task_data.get('fixed_filter_include', '')
            fixed_filter_exclude_raw = task_data.get('fixed_filter_exclude', '')
            is_cron_run = task_data.get('_is_cron', False)

            def _parse_filter_text(raw_text):
                rules = []
                for line in str(raw_text).splitlines():
                    line = line.strip()
                    if not line or line.startswith('#'): continue
                    
                    is_rx = False
                    lower_line = line.lower()
                    if lower_line.startswith('regex||'):
                        is_rx = True
                        val = line[7:].strip()
                    elif lower_line.startswith('plain||') or lower_line.startswith('text||'):
                        val = line.split('||', 1)[1].strip()
                    else:
                        val = line
                        
                    if not val: continue
                    
                    try:
                        if is_rx: rules.append({'is_regex': True, 'pattern': re.compile(val, re.IGNORECASE)})
                        else: rules.append({'is_regex': False, 'pattern': val.lower()})
                    except Exception as e:
                        if task: task.log(f"⚠️ 필터 정규식 오류 무시됨 ('{val}'): {e}")
                return rules

            ui_inc_rules = _parse_filter_text(filter_include_raw)
            ui_exc_rules = _parse_filter_text(filter_exclude_raw)
            fixed_inc_rules = _parse_filter_text(fixed_filter_include_raw)
            fixed_exc_rules = _parse_filter_text(fixed_filter_exclude_raw)

            apply_fixed_filters = True
            if fixed_filter_cron_only and not is_cron_run:
                apply_fixed_filters = False
                
            filtered_items = []
            for item in all_items:
                guid_val = str(item.get('guid') or "")
                title_val = str(item.get('title') or "")
                first_path = ""
                if item.get('all_files'): first_path = item['all_files'].split('|||')[0]

                def _get_texts(fields):
                    texts = []
                    if 'guid' in fields and guid_val: texts.append(guid_val)
                    if 'title' in fields and title_val: texts.append(title_val)
                    if 'path' in fields and first_path: texts.append(first_path)
                    return texts

                def _is_match(rules, texts):
                    for rule in rules:
                        if rule['is_regex']:
                            if any(rule['pattern'].search(txt) for txt in texts): return True
                        else:
                            if any(rule['pattern'] in txt.lower() for txt in texts): return True
                    return False

                skip_item = False
                
                # 고정 필터 검사
                if apply_fixed_filters and (fixed_inc_rules or fixed_exc_rules):
                    fixed_texts = _get_texts(fixed_filter_fields)
                    if fixed_inc_rules and not _is_match(fixed_inc_rules, fixed_texts): skip_item = True
                    if fixed_exc_rules and _is_match(fixed_exc_rules, fixed_texts): skip_item = True

                if skip_item: continue

                # 수동 임시 필터 검사
                if ui_inc_rules or ui_exc_rules:
                    ui_texts = _get_texts(ui_filter_fields)
                    if ui_inc_rules and not _is_match(ui_inc_rules, ui_texts): skip_item = True
                    if ui_exc_rules and _is_match(ui_exc_rules, ui_texts): skip_item = True
                    
                if not skip_item:
                    filtered_items.append(item)
                    
            if (ui_inc_rules or ui_exc_rules) or (apply_fixed_filters and (fixed_inc_rules or fixed_exc_rules)):
                task.log(f"  -> 고급 필터 적용: {len(all_items):,}개 중 {len(filtered_items):,}개 통과")
            all_items = filtered_items

            if not all_items:
                task.log("필터 적용 후 검사할 대상이 없습니다.")
                task.update_state('completed', 100, 100)
                return

        except Exception as e:
            task.log(f"❌ DB 쿼리 중 오류 발생: {e}")
            task.update_state('error')
            return

        total_items = len(all_items)
        task.log(f"DB 쿼리 완료. 총 {total_items:,}개의 항목에 대해 '{mode}' 검사를 시작합니다.")
        task.update_state('running', progress=10, total=100)
        
        cfg = core_api['config']
        compiled_rules = compile_jav_rules(cfg)
        result_data = []
        
        def get_all_pids(text):
            extracted = []
            remaining = text
            for _ in range(10): 
                found = extract_jav_pid(remaining, cfg, compiled_rules)
                if not found:
                    break
                for f_l, f_n in found:
                    if (f_l, f_n) not in extracted:
                        extracted.append((f_l, f_n))
                    safe_l = re.escape(f_l)
                    safe_n = re.escape(f_n)
                    pattern = r'[a-zA-Z]*' + safe_l + r'[-_]?' + safe_n + r'[a-zA-Z]*'
                    remaining = re.sub(pattern, ' ', remaining, flags=re.IGNORECASE)
            return extracted

        columns = [
            {"key": "section_name", "label": "라이브러리", "width": "12%"},
            {"key": "title", "label": "제목 (클릭시 이동)", "width": "40%", "type": "link", "link_key": "id"},
            {"key": "reason", "label": "상태 / 사유", "width": "38%", "type": "image_preview", "img_url_key": "img_url"},
            {"key": "action", "label": "실행", "width": "10%", "align": "center", "header_align": "center", "type": "action_btn"}
        ]

        # 불일치/오매칭 검사
        if mode == "mismatch":
            for idx, item in enumerate(all_items):
                if task.is_cancelled(): break
                if idx > 0 and idx % 1000 == 0: 
                    task.log(f"  ...분석 및 파싱 중: {idx:,} / {total_items:,} 완료")
                    task.update_state('running', progress=10 + int((idx/total_items)*80), total=100)
                
                files_raw = item.get('all_files')
                if not files_raw: continue
                files = files_raw.split('|||')
                db_title = item.get('title', '').strip()
                guid = item.get('guid', '').lower()

                match = re.match(r'^\[([A-Za-z0-9\-_]+)\]', db_title)
                db_pid = normalize_pid(match.group(1)) if match else None

                f_pids_norm = set()
                f_pids_display = []
                
                for fpath in files:
                    fname = os.path.basename(fpath)
                    extracted_pids = get_all_pids(fname)
                    
                    for f_l, f_n in extracted_pids:
                        pid_str = f"{f_l}-{f_n}"
                        pid_str_upper = pid_str.upper()
                        if pid_str_upper not in f_pids_display:
                            f_pids_display.append(pid_str_upper)
                        n_pid = normalize_pid(pid_str)
                        if n_pid: f_pids_norm.add(n_pid)

                if not f_pids_norm: continue
                
                reason = ""
                op_action = "match"
                
                if db_pid and db_pid in f_pids_norm:
                    matched_disp = next((p for p in f_pids_display if normalize_pid(p) == db_pid), f_pids_display[0])
                    if not guid or 'local://' in guid or 'none://' in guid or guid == '-':
                        reason = f"미매칭 상태 (로컬/없음) / 검출: {matched_disp}"
                else:
                    if len(f_pids_norm) > 1:
                        if len(files) > 1:
                            reason = f"병합된 다중 품번 검출 (분리 필요): {', '.join(f_pids_display)}"
                            op_action = "split"
                        else:
                            reason = f"단일 파일 내 다중 품번 (DB 불일치): {', '.join(f_pids_display)}"
                            op_action = "match"
                    elif not db_pid:
                        reason = "DB 제목 형식 비정상 ([품번] 누락)"
                    else:
                        reason = f"품번 불일치 (DB: {match.group(1).upper() if match else '없음'} / 파일: {f_pids_display[0]})"

                if reason:
                    result_data.append({
                        "id": item['id'], "section_name": item['section_name'], "title": db_title, 
                        "reason": reason, "op_action": op_action, "raw_path": files[0]
                    })

        # 분리된 중복 검사
        elif mode == "dupes":
            pid_item_map = defaultdict(list)
            for idx, item in enumerate(all_items):
                if task.is_cancelled(): break
                if idx > 0 and idx % 1000 == 0: 
                    task.log(f"  ...파싱 및 분류 중: {idx:,} / {total_items:,} 완료")
                    task.update_state('running', progress=10 + int((idx/total_items)*80), total=100)
                
                files_raw = item.get('all_files')
                if not files_raw: continue
                files = files_raw.split('|||')
                
                db_title = item.get('title', '').strip()
                match = re.match(r'^\[([A-Za-z0-9\-_]+)\]', db_title)
                db_pid = normalize_pid(match.group(1)) if match else None
                
                for fpath in files:
                    fname = os.path.basename(fpath)
                    extracted_pids = get_all_pids(fname)
                    
                    if extracted_pids:
                        f_pids_norm = {normalize_pid(f"{l}-{n}") for l, n in extracted_pids if normalize_pid(f"{l}-{n}")}
                        
                        if db_pid and db_pid in f_pids_norm:
                            norm_f = db_pid
                        else:
                            f_l, f_n = extracted_pids[0]
                            norm_f = normalize_pid(f"{f_l}-{f_n}")
                            
                        if norm_f:
                            pid_item_map[norm_f].append({
                                "id": item['id'], "title": item['title'], "section_name": item['section_name'], "raw_path": fpath
                            })
                        break
            
            for norm_pid, group in pid_item_map.items():
                unique_ids = set(i['id'] for i in group)
                if len(unique_ids) > 1:
                    for item in group:
                        result_data.append({
                            "id": item['id'], "section_name": item['section_name'], "title": item['title'], 
                            "reason": f"동일 품번이 {len(unique_ids)}개의 개별 아이템으로 등록됨",
                            "op_action": "match", "raw_path": item['raw_path']
                        })

        # 메타데이터 및 유저 포스터 통합 동기화 모드
        elif mode == "meta_sync":
            img_root = task_data.get('image_server_path')
            web_url_root = task_data.get('image_web_url', '').rstrip('/')

            user_posters_disk = defaultdict(lambda: {'preview': '', 'files': []})
            poster_regex = re.compile(r'^([a-zA-Z0-9\-]+)_(p|pl)_user\.jpg$', re.IGNORECASE)

            # 이미지 서버 로컬 경로 직접 스캔 (수동 파일 교체 건 감지)
            if img_root and os.path.exists(img_root):
                task.log(f"이미지 서버 경로({img_root})에서 유저 포스터 파일 확인 중...")
                try:
                    for root, _, files in os.walk(img_root):
                        if task.is_cancelled(): break
                        for f in files:
                            pid_match = poster_regex.match(f)
                            if pid_match:
                                raw_pid = pid_match.group(1).lower()
                                rel_dir = os.path.relpath(root, img_root)
                                rel_path = f if rel_dir == '.' else f"{rel_dir}/{f}".replace('\\', '/')
                                if not user_posters_disk[raw_pid]['preview']:
                                    user_posters_disk[raw_pid]['preview'] = rel_path
                                if f not in user_posters_disk[raw_pid]['files']:
                                    user_posters_disk[raw_pid]['files'].append(f)
                except Exception as e:
                    task.log(f"⚠️ 포스터 경로 스캔 중 오류 (무시 후 계속): {e}")

            meta_db = core_api.get('meta_db')
            is_pg_ready = False

            # 메타 DB 설정 활성화 시 사전 접속 테스트 헬퍼 실행 후 선제적 분기 결정
            if meta_db and meta_db.get('is_enabled') and meta_db['is_enabled']():
                task.log("🔍 [MetaDB Check] 외부 메타 PostgreSQL 연결 상태를 사전 검증합니다...")
                test_fn = meta_db.get('test_connection')
                if test_fn:
                    is_ok, test_msg = test_fn()
                    if is_ok:
                        is_pg_ready = True
                        task.log(f"   ✅ [MetaDB Check] {test_msg}")
                    else:
                        task.log(f"   ⚠️ [MetaDB Check] PostgreSQL 연결 실패 ({test_msg}). FF HTTP 모드로 자동 전환합니다.")
                else:
                    is_pg_ready = True

            # 동적 배치 제어 컨텍스트 (PostgreSQL 검증 성공 시 500건, 실패/미사용 시 100건)
            sync_context = {
                'use_direct_pg': is_pg_ready,
                'batch_size': 500 if is_pg_ready else 100
            }

            if sync_context['use_direct_pg']:
                task.log("⚡ [MetaDB Direct] 외부 메타 PostgreSQL 직결 엔진 가동 (500건 초고속 일괄 쿼리)")
            else:
                task.log("🌐 [MetaDB HTTP] FF HTTP 배치 API 모드로 대조를 시작합니다 (100건 단위 요청)")

            batch_buckets = defaultdict(list)
            dir_cache = {}

            def get_dir_files(d_path):
                if d_path not in dir_cache:
                    try:
                        dir_cache[d_path] = set(f.lower() for f in os.listdir(d_path))
                    except Exception:
                        dir_cache[d_path] = set()
                return dir_cache[d_path]

            def flush_meta_sync_batch(cat, items_chunk):
                if not items_chunk: return
                codes_to_query = [it['target_code'] for it in items_chunk if it.get('target_code')]
                if not codes_to_query: return

                batch_data = {}
                # 코어의 PostgreSQL 직결 질의 1순위 시도
                if sync_context['use_direct_pg']:
                    try:
                        batch_data = query_ff_meta_direct_pg(meta_db, cat, codes_to_query)
                    except Exception as pg_err:
                        if task: task.log(f"   ⚠️ [MetaDB Direct] PostgreSQL 질의 실패 ({pg_err}). FF HTTP API(100건)로 안전 폴백합니다.")
                        batch_data = {}

                # PostgreSQL 미설정이거나 직결 쿼리 실패 시 기존 FF HTTP 배치 API로 안전하게 자동 폴백
                if not batch_data:
                    if sync_context['use_direct_pg']:
                        sync_context['use_direct_pg'] = False
                        sync_context['batch_size'] = 100

                    HTTP_CHUNK_LIMIT = 100
                    batch_data = {}
                    for i in range(0, len(codes_to_query), HTTP_CHUNK_LIMIT):
                        sub_codes = codes_to_query[i:i + HTTP_CHUNK_LIMIT]
                        chunk_resp = fetch_ff_meta_batch(core_api['config'], cat, sub_codes)
                        if chunk_resp and isinstance(chunk_resp, dict):
                            batch_data.update(chunk_resp)

                ff_lookup = {}
                if isinstance(batch_data, dict):
                    for k, v in batch_data.items():
                        if not isinstance(v, dict): continue
                        ff_lookup[str(k).lower()] = v
                        if v.get('code'): ff_lookup[str(v['code']).lower()] = v
                        if v.get('ui_code'): ff_lookup[str(v['ui_code']).lower()] = v

                for it in items_chunk:
                    req_code = (it.get('target_code') or '').lower()
                    ff_json = ff_lookup.get(req_code)

                    # FF 메타 DB에 데이터가 존재하지 않는 항목은 스킵
                    if not ff_json:
                        continue

                    # 매칭된 항목에 대해서만 로컬 JSON을 지연 로딩(Lazy Load)하여 메모리 및 파일 I/O 절약
                    target_json_path = it.get('target_json_path')
                    local_json = {}
                    if target_json_path and os.path.exists(target_json_path):
                        try:
                            with open(target_json_path, 'r', encoding='utf-8') as jf:
                                local_json = json.load(jf) or {}
                        except Exception:
                            local_json = {}

                    reasons = []

                    # 1. 디스크 유저 포스터 미적용 여부 검사
                    if it.get('_has_disk_poster'):
                        reasons.append("유저 포스터")

                    # 2. 로컬 JSON 유무 및 FF 메타 DB 정밀 Diff 대조
                    if not target_json_path:
                        if "유저 포스터" not in reasons:
                            reasons.append("로컬 JSON 없음")
                    else:
                        diff_res = detect_meta_diff(local_json, ff_json)
                        for r in diff_res:
                            if r not in reasons:
                                reasons.append(r)

                    if reasons:
                        reason_label = " ".join([f"[{r}]" for r in reasons])

                        preview_img = it.get('img_url', '')
                        if not preview_img and ff_json:
                            ff_thumbs = ff_json.get('thumb') or []
                            for t in ff_thumbs:
                                if isinstance(t, dict):
                                    val = t.get('value', '')
                                    if '_user.jpg' in val:
                                        preview_img = val
                                        break
                                    elif not preview_img:
                                        preview_img = val

                        result_data.append({
                            "id": it['id'],
                            "section_name": it['section_name'],
                            "title": it['db_title'] or it.get('title', ''),
                            "reason": reason_label,
                            "img_url": preview_img,
                            "op_action": "match",
                            "_target_json": target_json_path or (it['json_candidates'][0] if it['json_candidates'] else ""),
                            "_raw_db_pid": it.get('_raw_db_pid', ''),
                            "_raw_sec_id": it.get('_raw_sec_id', ''),
                            "_poster_files": it.get('_poster_files', ''),
                            "_has_disk_poster": it.get('_has_disk_poster', False),
                            "raw_path": it['raw_path']
                        })

            for idx, item in enumerate(all_items):
                if task.is_cancelled(): break
                if idx > 0 and idx % 500 == 0: 
                    task.log(f"  ...메타데이터 및 DB 대조 중: {idx:,} / {total_items:,} 완료 (검출: {len(result_data):,}건)")
                    task.update_state('running', progress=10 + int((idx/total_items)*80), total=100)

                # 메모리 누수 방지를 위해 캐시가 3,000개 폴더를 초과하면 주기적으로 리셋
                if len(dir_cache) > 3000:
                    dir_cache.clear()

                files_raw = item.get('all_files')
                if not files_raw: continue
                
                fpath = files_raw.split('|||')[0]
                dir_name = os.path.dirname(fpath)
                fname = os.path.basename(fpath)
                base_name = os.path.splitext(fname)[0]

                db_title = item.get('title', '').strip()
                match = re.match(r'^\[([A-Za-z0-9\-_]+)\]', db_title)
                raw_pid = match.group(1) if match else ""
                
                # 메모리 상의 디렉터리 파일 목록으로 YAML 존재 여부 O(1) 초고속 확인
                files_in_dir = get_dir_files(dir_name)
                base_lower = base_name.lower()
                pid_lower = raw_pid.lower() if raw_pid else ""

                if f"{base_lower}.yaml" in files_in_dir or f"{base_lower}.yml" in files_in_dir:
                    continue
                if pid_lower and (f"{pid_lower}.yaml" in files_in_dir or f"{pid_lower}.yml" in files_in_dir):
                    continue

                # YAML 후보에도 접두사 숫자 제거 품번 추가 확인 (예: 1MOON-009 -> moon-009.yaml)
                if raw_pid:
                    stripped_pid = re.sub(r'^\d+', '', pid_lower)
                    if stripped_pid and stripped_pid != pid_lower:
                        if f"{stripped_pid}.yaml" in files_in_dir or f"{stripped_pid}.yml" in files_in_dir:
                            continue

                # DB 품번(1MOON-009), 접두사 숫자 제거(moon-009), 파일명 추출 품번을 순차 대조하여 JSON 탐색
                target_json_path, json_candidates = find_local_meta_json(
                    dir_name, base_name, raw_pid=raw_pid, files_in_dir=files_in_dir, cfg=cfg, compiled_rules=compiled_rules
                )

                # 정확한 DB 매칭을 위해 고유 식별 코드(code) 1순위 추출
                guid = str(item.get('guid') or '').strip()
                sjva_code, sjva_cat = extract_sjva_code_and_cat(guid)

                target_code = sjva_code or raw_pid
                if not target_code:
                    continue

                cat = sjva_cat or ('JAV_UNCEN' if target_code.upper().startswith('E') else ('WESTERN' if target_code.upper().startswith('W') else 'JAV_CEN'))

                # 디스크 유저 포스터 파일 존재 여부 검사
                sec_id = str(item.get('section_id', ''))
                db_pid_key = pid_lower if pid_lower else target_code.lower()
                has_disk_poster = False
                poster_files = []
                preview_img_url = ""

                if user_posters_disk and db_pid_key in user_posters_disk:
                    p_info = user_posters_disk[db_pid_key]
                    disk_files = p_info.get('files', [])
                    # 로컬 JSON이 없거나 디스크에 유저 이미지가 있으면 대상 후보 표시
                    has_disk_poster = True
                    poster_files = disk_files
                    if web_url_root and p_info.get('preview'):
                        preview_img_url = f"{web_url_root}/{urllib.parse.quote(str(p_info['preview']), safe='/')}"

                queue_entry = {
                    'id': item['id'],
                    'section_name': item['section_name'],
                    'db_title': db_title or item.get('title', ''),
                    'target_code': target_code,
                    'raw_path': fpath,
                    'target_json_path': target_json_path,
                    'json_candidates': json_candidates,
                    '_raw_db_pid': db_pid_key,
                    '_raw_sec_id': sec_id,
                    '_poster_files': json.dumps(poster_files) if poster_files else '',
                    '_has_disk_poster': has_disk_poster,
                    'img_url': preview_img_url
                }

                batch_buckets[cat].append(queue_entry)

                # 동적 배치 크기(직결 500건 / 폴백 시 100건) 도달 시 일괄 쿼리 실행
                if len(batch_buckets[cat]) >= sync_context['batch_size']:
                    flush_meta_sync_batch(cat, batch_buckets[cat])
                    batch_buckets[cat].clear()

            for cat, queued_items in batch_buckets.items():
                if queued_items:
                    flush_meta_sync_batch(cat, queued_items)
            batch_buckets.clear()
            dir_cache.clear()

        # LLM (Ollama) 번역 메타데이터 검증
        elif mode == "llm_translation":
            for idx, item in enumerate(all_items):
                if task.is_cancelled(): break
                if idx > 0 and idx % 1000 == 0: 
                    task.log(f"  ...JSON 메타데이터 검증 중: {idx:,} / {total_items:,} 완료")
                    task.update_state('running', progress=10 + int((idx/total_items)*80), total=100)
                
                files_raw = item.get('all_files')
                if not files_raw: continue
                
                fpath = files_raw.split('|||')[0]
                dir_name = os.path.dirname(fpath)
                
                db_title = item.get('title', '').strip()
                match = re.match(r'^\[([A-Za-z0-9\-_]+)\]', db_title)
                
                base_name = os.path.splitext(os.path.basename(fpath))[0]
                yaml_candidates = [
                    os.path.join(dir_name, f"{base_name}.yaml"),
                    os.path.join(dir_name, f"{base_name}.yml")
                ]
                if match:
                    raw_pid = match.group(1)
                    db_pid_lower = raw_pid.lower()
                    yaml_candidates.extend([
                        os.path.join(dir_name, f"{db_pid_lower}.yaml"),
                        os.path.join(dir_name, f"{db_pid_lower}.yml"),
                        os.path.join(dir_name, f"{raw_pid}.yaml"),
                        os.path.join(dir_name, f"{raw_pid}.yml")
                    ])
                    # 접두사 숫자 제거 YAML 후보 추가
                    stripped_pid = re.sub(r'^\d+', '', db_pid_lower)
                    if stripped_pid and stripped_pid != db_pid_lower:
                        yaml_candidates.extend([
                            os.path.join(dir_name, f"{stripped_pid}.yaml"),
                            os.path.join(dir_name, f"{stripped_pid}.yml")
                        ])

                # sjva 에이전트 최우선 참조 대상인 YAML 파일이 존재하면 수동 관리 대상이므로 스킵
                if any(os.path.exists(y) for y in set(yaml_candidates)):
                    continue

                # DB 품번(1MOON-009), 접두사 숫자 제거(moon-009), 파일명 추출 품번을 순차 대조하여 JSON 탐색
                target_json, _ = find_local_meta_json(
                    dir_name, base_name, raw_pid=raw_pid, files_in_dir=None, cfg=cfg, compiled_rules=compiled_rules
                )

                reason = ""
                if not target_json or not os.path.exists(target_json):
                    reason = "JSON 메타 파일 없음"
                else:
                    try:
                        with open(target_json, 'r', encoding='utf-8') as f:
                            json_data = json.load(f)
                        
                        extra_info = json_data.get("extra_info") or {}
                        ai_trans = str(extra_info.get("ai_translator", ""))
                        
                        if "ollama" not in ai_trans.lower():
                            reason = f"구버전/일반 번역 ({ai_trans or '기본값'})"
                        else:
                            continue
                            
                    except Exception:
                        reason = "JSON 파싱 오류 (구조 손상)"

                if reason:
                    result_data.append({
                        "id": item['id'], 
                        "section_name": item['section_name'], 
                        "title": db_title, 
                        "reason": reason, 
                        "op_action": "match",
                        "_target_json": target_json,
                        "raw_path": fpath
                    })

        # 파일명 처리 오류 (Prefix vs 대괄호 속성 불일치)
        elif mode == "file_error":
            for idx, item in enumerate(all_items):
                if task.is_cancelled(): break
                if idx > 0 and idx % 1000 == 0: 
                    task.log(f"  ...오류 검출 및 파싱 중: {idx:,} / {total_items:,} 완료")
                    task.update_state('running', progress=10 + int((idx/total_items)*80), total=100)
                
                files_raw = item.get('all_files')
                if not files_raw: continue
                
                reason = ""
                matched_fpath = ""
                
                for fpath in files_raw.split('|||'):
                    fname = os.path.basename(fpath)

                    prefix_match = re.match(r'^([^\[\(]+)', fname)
                    bracket_strs = re.findall(r'\[(.*?)\]', fname)

                    if prefix_match and bracket_strs:
                        prefix_str = prefix_match.group(1).strip()
                        bracket_str = " ".join(bracket_strs).strip()

                        pids_prefix = get_all_pids(prefix_str)
                        pids_bracket = get_all_pids(bracket_str)
                        
                        norm_prefix = {normalize_pid(f"{l}-{n}") for l, n in pids_prefix if normalize_pid(f"{l}-{n}")}
                        norm_bracket = {normalize_pid(f"{l}-{n}") for l, n in pids_bracket if normalize_pid(f"{l}-{n}")}

                        if norm_bracket and not norm_prefix.intersection(norm_bracket):
                            disp_prefix = [f"{l}-{n}".upper() for l, n in pids_prefix] or ["없음"]
                            disp_orig = [f"{l}-{n}".upper() for l, n in pids_bracket]
                            reason = f"{disp_prefix[0]} / {disp_orig[0]}"
                            matched_fpath = fpath
                            break

                if reason:
                    result_data.append({
                        "id": item['id'], 
                        "section_name": item['section_name'], 
                        "title": item['title'],
                        "reason": reason,
                        "raw_path": matched_fpath
                    })

        # 일괄 프리뷰 클립 생성 (트레일러 없는 영상)
        elif mode == "preview_clip":
            for idx, item in enumerate(all_items):
                if task.is_cancelled(): break
                if idx > 0 and idx % 1000 == 0: 
                    task.log(f"  ...트레일러 유무 및 메타데이터 검증 중: {idx:,} / {total_items:,} 완료")
                    task.update_state('running', progress=10 + int((idx/total_items)*80), total=100)
                
                # Plex DB 상에 이미 트레일러/부가영상이 연결되어 있는 항목은 제외
                extra_cnt = int(item.get('extra_count') or 0)
                if extra_cnt > 0:
                    continue

                guid = str(item.get('guid') or '').strip()
                sjva_code, sjva_cat = extract_sjva_code_and_cat(guid)
                if not sjva_code:
                    continue

                files_raw = item.get('all_files')
                if not files_raw: continue
                files = files_raw.split('|||')
                
                best_file = find_best_video_file(files)
                if not best_file:
                    continue

                db_title = item.get('title', '').strip()

                result_data.append({
                    "id": item['id'], 
                    "section_name": item['section_name'], 
                    "title": db_title, 
                    "reason": f"트레일러 없음 ({sjva_code})", 
                    "op_action": "make_preview",
                    "_sjva_code": sjva_code,
                    "_sjva_cat": sjva_cat,
                    "raw_path": best_file
                })

        if task.is_cancelled():
            task.log("🛑 검사가 사용자 취소로 중단되었습니다.")
            return

        result_data = core_api['sort'](result_data, [{"key": "section_name", "dir": "asc"}, {"key": "title", "dir": "asc"}])

        btn_label = "일괄 리매칭 시작"
        if mode == "file_error": btn_label = "수동 확인 필요"
        
        elif mode == "preview_clip": btn_label = "일괄 프리뷰 생성 및 리매칭"

        if mode == "file_error":
            columns[-1] = {"key": "raw_path", "label": "폴더", "align": "center", "header_align": "center", "type": "folder_link"}
            action_btn = None 
        else:
            action_btn = {"label": f"<i class='fas fa-magic'></i> {btn_label}", "payload": {"action_type": "execute"}}
        
        cards = [
            {"label": "전체 검사 항목", "value": f"{len(all_items):,}개", "icon": "fas fa-search", "color": "#2f96b4"},
            {"label": "검출된 대상 항목", "value": f"{len(result_data):,}개", "icon": "fas fa-exclamation-triangle", "color": "#bd362f"}
        ]

        core_api['cache'].save({
            "type": "datatable", "summary_cards": cards, "action_button": action_btn,
            "columns": columns, "data": result_data
        })

        if action == 'preview':
            task.update_state('completed', 100, 100)
            if len(result_data) > 0:
                task.log(f"✅ 검사 완료! 총 {len(result_data):,}개의 항목이 검출되었습니다.")
            else:
                task.log("✅ 라이브러리 검사 완료. 모든 항목이 정상입니다! (조치할 대상 없음)")
            return
        else:
            if len(result_data) == 0:
                task.update_state('completed', progress=100, total=100)
                task.log("✅ [자동 실행] 조치(복구)가 필요한 항목이 없어 작업을 종료합니다.")
                return
            
            action = 'execute'
            task_data['_use_cache_db'] = True
            task_data['total'] = len(result_data)
            task_data['_resume_start_index'] = 0
            task.log(f"✅ [자동 실행] 조회 완료. 생성된 목록(총 {len(result_data):,}건)을 바탕으로 즉시 복구 작업을 시작합니다.")


    # ----------------------------------------------------------------------
    # 2. Execute 모드 (실제 매칭/처리 실행)
    # ----------------------------------------------------------------------
    work_start_time = time.time()
    
    retry_errors = task_data.get('retry_errors', False)
    try: sleep_time = float(task_data.get('sleep_time', 1.0))
    except: sleep_time = 1.0
    
    total = task_data.get('total', 0)
    progress = task_data.get('_resume_start_index', start_index)

    if task_data.get('_is_single'):
        pending_items = task_data.get('target_items', [])
    else:
        status_filter = "('pending', 'error')" if retry_errors else "('pending')"
        with core_api['cache'].transaction_session() as conn:
            conn.row_factory = sqlite3.Row
            c = conn.cursor()
            c.execute(f"SELECT * FROM data WHERE pmh_status IN {status_filter} ORDER BY pmh_id LIMIT -1 OFFSET ?", (progress,))
            rows = c.fetchall()
            cols = [desc[0] for desc in c.description] if c.description else []
            pending_items = [dict(zip(cols, row)) for row in rows]

    if total == 0:
        task.update_state('completed', 0, 0)
        task.log("⚠️ 실행할 대상 항목이 없습니다.")
        return

    task.update_state('running', progress, total)
    prefix = "[자동 실행] " if task_data.get('_is_cron') else ""
    if progress == 0:
        task.log(f"🚀 {prefix}총 {total:,}개의 아이템에 대해 작업을 시작합니다...")
    else:
        task.log(f"🔄 {prefix}중단되었던 {progress}번째 항목부터 이어서 작업을 재개합니다.")

    try:
        plex = core_api['get_plex']()
    except Exception as e:
        task.update_state('error')
        task.log(f"❌ Plex 서버 연결 실패: {str(e)}")
        return

    # 유저 포스터 또는 메타 동기화 모드 시 디스크 유저 이미지 파일 FF 로컬 메타 DB 선행 동기화
    if mode in ["user_poster", "meta_sync"]:
        all_sync_files = set()
        for it in pending_items:
            raw_p_files = it.get('_poster_files')
            if raw_p_files:
                try:
                    p_list = json.loads(raw_p_files) if isinstance(raw_p_files, str) else raw_p_files
                    all_sync_files.update(p_list)
                except: pass
            elif it.get('_has_disk_poster'):
                raw_pid = it.get('_raw_db_pid')
                if raw_pid:
                    all_sync_files.add(f"{raw_pid}_p_user.jpg")
                    all_sync_files.add(f"{raw_pid}_pl_user.jpg")

        if all_sync_files:
            task.log(f"🖼️ [선행 작업] FF 로컬 메타 DB에 유저 이미지({len(all_sync_files):,}개 파일) 동기화 요청 중...")
            success, msg = update_ff_user_images(core_api['config'], list(all_sync_files))
            
            if not success:
                task.log(f"   ❌ {msg}")
                task.log("   🛑 FF 메타데이터 DB 동기화에 실패하여 안전을 위해 Plex 리매칭을 중단합니다.")
                task.update_state('error')
                return
                
            task.log(f"   ✅ {msg}")

    history_db_path = os.path.join(core_api['config'].get('base_dir', ''), 'task_logs', 'av_manager_poster_history.db')
    processed_pids = set()

    try:
        for item in pending_items:
            if task.is_cancelled():
                task.log("🛑 작업이 취소되었습니다.")
                break

            progress += 1
            task.update_state('running', progress=progress, total=total)

            raw_id = item.get('id') or item.get('rating_key')
            if not raw_id:
                task.log(f"[{progress}/{total}] ⚠️ 항목의 ID가 없어 스킵합니다.")
                continue

            item_id = str(raw_id)
            title = item.get('title', item_id)
            op_action = item.get('op_action', 'match')
            
            task.log(f"[{progress}/{total}] '{title}' 처리 요청 중... (동작: {op_action})")
            
            item_has_error = False

            try:
                if op_action == 'open_folder':
                    task.log(f"  -> 📂 수동 폴더 열기 전용 항목입니다. 시스템 자동 처리를 스킵합니다.")
                    continue

                safe_endpoint = f"/library/metadata/{item_id}"
                
                try:
                    plex_item = plex.fetchItem(safe_endpoint)
                except Exception as fetch_e:
                    err_str = str(fetch_e).lower()
                    if "404" in err_str or "not found" in err_str or "not_found" in err_str:
                        task.log("  -> ✅ 이미 삭제되거나 다른 항목으로 병합되었습니다. (정상 완료 처리)")
                        core_api['cache'].mark_keys_as_done('id', [item_id])
                        continue
                    else:
                        raise fetch_e
                
                if op_action == 'split':
                    if len(plex_item.media) > 1:
                        plex_item.split()
                        task.log(f"  -> ✂️ 항목이 분리되었습니다.")
                    else:
                        task.log("  -> ⚠️ 분리 불가: 단일 미디어 파일입니다. 분리 대신 매칭(Match)으로 우회합니다.")
                        op_action = 'match'

                if op_action == 'make_preview':
                    sjva_code = item.get('_sjva_code')
                    sjva_cat = item.get('_sjva_cat')
                    video_path = item.get('raw_path')

                    if not sjva_code or not sjva_cat:
                        guid = str(getattr(plex_item, 'guid', '') or '').strip()
                        sjva_code, sjva_cat = extract_sjva_code_and_cat(guid)

                    if not video_path and hasattr(plex_item, 'media') and plex_item.media and plex_item.media[0].parts:
                        video_path = plex_item.media[0].parts[0].file

                    if not sjva_code or not sjva_cat:
                        task.log(f"  -> ⚠️ AV 식별 코드(C/E/W)를 확인할 수 없어 프리뷰 생성을 스킵합니다.")
                        item_has_error = True
                    elif not video_path:
                        task.log(f"  -> ⚠️ 대상 동영상 파일 경로를 찾을 수 없어 프리뷰 생성을 스킵합니다.")
                        item_has_error = True
                    else:
                        task.log(f"  -> 🎬 [1/2] FF에 프리뷰 클립 생성 요청 중... (코드: {sjva_code}, 구분: {sjva_cat})")
                        ff_ok, ff_msg = make_ff_preview_clip(core_api['config'], sjva_code, sjva_cat, video_path)

                        if not ff_ok:
                            task.log(f"  -> ❌ FF 프리뷰 클립 생성 실패: {ff_msg}")
                            item_has_error = True
                        else:
                            task.log(f"  -> ✅ FF 프리뷰 클립 생성 성공: {ff_msg}")
                            task.log(f"  -> 🔄 [2/2] 프리뷰 예고편 등록을 위한 클린 리매칭 시작...")

                            success, msg, score = pmh_core.perform_smart_media_action(
                                plex_url=plex._baseurl, 
                                plex_token=plex._token, 
                                rating_key=item_id, 
                                action_type='match',
                                item_title=plex_item.title, 
                                item_year=plex_item.year, 
                                target_agent=plex_item.section().agent,
                                plex_inst=plex,
                                try_refresh_first=False,
                                do_unmatch_first=True,
                                skip_sim_check=task_data.get('opt_skip_sim_check', True),
                                use_custom_score=task_data.get('opt_use_custom_score', False),
                                custom_agent_score=task_data.get('opt_custom_agent_score', 90),
                                search_priority=task_data.get('opt_search_priority', 'auto'),
                                manual_match=task_data.get('opt_manual_match', False),
                                global_config=core_api['config'],
                                task_logger=task.log,
                                cancel_checker=task.is_cancelled
                            )

                            if success:
                                task.log(f"  -> ✨ 프리뷰 생성 및 클린 리매칭 최종 완료: {msg}")
                            else:
                                task.log(f"  -> ❌ 클린 리매칭 실패: {msg}")
                                item_has_error = True

                if op_action == 'match':
                    # 메타 동기화 모드 시 최신 메타 반영을 위해 구버전 로컬 JSON 파일 자동 삭제
                    if mode in ["llm_translation", "meta_sync"]:
                        target_json = item.get('_target_json')
                        if target_json and os.path.exists(target_json):
                            try:
                                os.remove(target_json)
                                task.log(f"  -> 🗑️ 메타데이터 갱신을 위해 기존 JSON 삭제 완료: {os.path.basename(target_json)}")
                            except Exception as e:
                                task.log(f"  -> ⚠️ 기존 JSON 삭제 실패: {e}")

                    do_unm = task_data.get('opt_unmatch_first', True)
                    skip_sim = task_data.get('opt_skip_sim_check', False)
                    manual_m = task_data.get('opt_manual_match', False)
                    use_custom = task_data.get('opt_use_custom_score', False)
                    custom_score = task_data.get('opt_custom_agent_score', 90)
                    search_pri = task_data.get('opt_search_priority', 'auto')

                    if mode == 'dupes':
                        match = re.match(r'^\[([A-Za-z0-9\-_]+)\]', title)
                        pid = normalize_pid(match.group(1)) if match else None
                        
                        if pid:
                            if pid in processed_pids:
                                if do_unm:
                                    try:
                                        plex_item.unmatch()
                                        time.sleep(1.0)
                                    except: pass
                                do_unm = False
                            else:
                                processed_pids.add(pid)

                    success, msg, score = pmh_core.perform_smart_media_action(
                        plex_url=plex._baseurl, 
                        plex_token=plex._token, 
                        rating_key=item_id, 
                        action_type='match',
                        item_title=plex_item.title, 
                        item_year=plex_item.year, 
                        target_agent=plex_item.section().agent,
                        plex_inst=plex,
                        try_refresh_first=False,
                        do_unmatch_first=do_unm,
                        skip_sim_check=skip_sim,
                        use_custom_score=use_custom,
                        custom_agent_score=custom_score,
                        search_priority=search_pri,
                        manual_match=manual_m,
                        global_config=core_api['config'],
                        task_logger=task.log,
                        cancel_checker=task.is_cancelled
                    )
                    
                    if success:
                        task.log(f"  -> ✅ 매칭 처리 완료: {msg}")
                    else:
                        task.log(f"  -> ❌ 매칭 실패/반려: {msg}")
                        item_has_error = True

                if item_has_error: core_api['cache'].mark_as_error('id', item_id)
                else: core_api['cache'].mark_keys_as_done('id', [item_id])

            except Exception as e:
                task.log(f"  -> ❌ Plex 제어 에러: {e}")
                core_api['cache'].mark_as_error('id', item_id)
                
            if sleep_time > 0 and progress < total:
                loops = max(1, int(sleep_time * 2))
                for _ in range(loops):
                    if task.is_cancelled(): break
                    time.sleep(0.5)

        if not task.is_cancelled():
            task.update_state('completed', progress, total)
            elapsed_sec = int(time.time() - work_start_time)
            elapsed_str = f"{elapsed_sec // 60}분 {elapsed_sec % 60}초" if elapsed_sec >= 60 else f"{elapsed_sec}초"
            
            if task_data.get('_is_single'):
                task.log(f"✅ 단일 실행 작업 완료! (소요시간: {elapsed_str})")
            else:
                task.log(f"✅ {prefix}총 {total:,}건의 작업 완료! (소요시간: {elapsed_str})")
                mode_label = "품번 불일치/오매칭 복구" if mode == "mismatch" else "중복 아이템 재매칭" if mode == "dupes" else "FF 메타데이터 DB 동기화" if mode == "meta_sync" else "LLM 미적용 항목 검출 및 리매칭" if mode == "llm_translation" else "배우 정보 업데이트" if mode == "actor" else "유저 포스터 일괄 갱신"
                if mode == "file_error": mode_label = "파일명 오류 항목(수동 확인/작업 필요)"
                if mode == "preview_clip": mode_label = "일괄 프리뷰 클립 생성 (트레일러 없는 영상)"

                tool_vars = {"total": f"{total:,}", "elapsed_time": elapsed_str, "scan_mode_label": mode_label}
                core_api['notify']("AV 매니저 완료", DEFAULT_DISCORD_TEMPLATE, "#e5a00d", tool_vars)

    finally:
        current_state = core_api['task'].load(include_target_items=False)
        if current_state:
            real_state = current_state.get('state', 'running')
            if real_state != 'completed':
                task.update_state(real_state, progress=progress)
