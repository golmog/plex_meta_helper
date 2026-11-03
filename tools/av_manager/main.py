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
import tempfile
import urllib.request, urllib.parse, urllib.error
import pmh_core
from collections import defaultdict
from pmh_core import compile_jav_rules, extract_jav_pid, normalize_pid_for_comparison

SCAN_MODES = frozenset(('mismatch', 'dupes', 'llm_translation', 'file_error', 'preview_clip', 'json_diff'))

def normalize_pid(pid_str):
    return normalize_pid_for_comparison(pid_str)

def find_local_meta_json(dir_name, base_name, raw_pid=None, files_in_dir=None, cfg=None, compiled_rules=None):
    return pmh_core.find_local_meta_json(dir_name, base_name, raw_pid, files_in_dir, cfg, compiled_rules)

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

    if core_api:
        try:
            res = core_api['query']("SELECT id, name FROM library_sections WHERE section_type = 1 ORDER BY name ASC")
            for r in res:
                sec_val = str(r["id"])
                sections.append({"value": sec_val, "text": r["name"]})
                default_secs.append(sec_val)
        except Exception: pass

    return {
        "title": "AV 매니저",
        "icon": "fas fa-heart",
        "description": "Plex 등록 AV 영상을 기준으로 오류를 검사하고 FF 최신 메타데이터·대표 영상을 반영합니다.",
        "inputs": [
            {
                "id": "target_sections",
                "type": "multi_select",
                "label": "조회 대상 Plex 영화 라이브러리",
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
                    {"value": "json_diff", "label": "메타 DB 기준 불일치(JSON) 검출"},
                    {"value": "llm_translation", "label": "LLM (Ollama) 번역 미적용 항목 검출 및 리매칭"},
                    {"value": "file_error", "label": "파일명 처리 오류 (기본/원본 품번 불일치) 검출"},
                    {"value": "preview_clip", "label": "트레일러 누락 영상 프리뷰 생성"}
                ]
            },
            
            {"id": "preview_try_trailer", "type": "checkbox", "label": "트레일러 다운로드 시도", "default": False, "show_if": {"scan_mode": "preview_clip"}},
            {"id": "filter_fields", "type": "multi_select", "label": "임시 검색 필터 적용 필드", "options": [
                {"value": "guid", "text": "에이전트 (GUID)"},
                {"value": "title", "text": "제목 (Title)"},
                {"value": "path", "text": "파일/폴더 경로 (Path)"}
            ], "default": ["title", "path"]},
            {"id": "filter_include", "type": "text", "label": "포함 키워드 (1회성, 정규표현식은 regex|| 사용)", "placeholder": "예: fc2 또는 regex||^\\[sod\\]"},
            {"id": "filter_exclude", "type": "text", "label": "제외 키워드 (1회성, 정규표현식은 regex|| 사용)", "placeholder": "예: sjva_agent:// 또는 regex||\\.mp4$"}
        ],
        "execute_inputs": [
            {"id": "ff_apply_method", "type": "select", "label": "FF 메타데이터의 Plex 반영 방식",
             "options": [{"value": "refresh", "text": "현재 GUID 유지 · 메타 새로고침"}, {"value": "match", "text": "클린 리매칭 (매칭 옵션 적용)"}],
             "default": "refresh", "show_if": {"scan_mode": ["json_diff", "preview_clip"]}},
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
    if data.get('scan_mode', 'mismatch') not in SCAN_MODES:
        return {'status':'error', 'message':'사용할 수 없는 검사 모드입니다. 검사 모드를 다시 선택하고 조회하세요.'}, 400
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
            if pmh_core.cache_resume_allowed(core_api['cache'], task_state, data, scheduled=True):
                cached_page = core_api['cache'].load_page(1, 1)
                if cached_page and cached_page.get('total_items', 0) > 0:
                    task_data = data.copy()
                    task_data['_cache_revision'] = task_state['task_data']['_cache_revision']
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
    return pmh_core.extract_sjva_code_and_cat(guid)

def find_best_video_file(file_list):
    return pmh_core.find_best_video_file(file_list)

def make_ff_preview_clip(global_config, code, cat, video_path):
    try:
        result = ff_request(global_config, 'api/meta_db/make_preview_clip',
                            {'code': code, 'cat': cat, 'video_path': video_path}, timeout=300)
        require_ff_media_result(result)
        return True, result.get('msg', '프리뷰 생성 완료')
    except FfApiError as exc:
        return False, str(exc)


class FfApiError(RuntimeError):
    """FF is unavailable or its response cannot safely identify the Plex item."""

    def __init__(self, message, status=None, payload=None):
        super().__init__(message)
        self.status = status
        self.payload = payload if isinstance(payload, dict) else {}
        self.error_code = self.payload.get('error_code')
        self.retryable = False  # Remote delivery/commit cannot be inferred from HTTP failure.


def redact_ff_value(value, key):
    if isinstance(value, dict):
        return {name: ('****' if str(name).lower() in ('apikey', 'api_key', 'x-api-key') else redact_ff_value(item, key))
                for name, item in value.items()}
    if isinstance(value, list):
        return [redact_ff_value(item, key) for item in value]
    if isinstance(value, str):
        value = value.replace(str(key), '****') if key else value
        return re.sub(r'https?://[^\s<>]+', '[FF URL]', value)
    return value


def ff_request(global_config, endpoint, payload, timeout=180, form=False):
    def transport():
        try:
            return 200, _ff_request_raw(global_config, endpoint, payload, timeout, form)
        except FfApiError as exc:
            if exc.status is None: raise
            return exc.status, exc.payload
    task = global_config.get('_ff_task')
    try:
        status, result = pmh_core.guarded_ff_write(
            global_config, endpoint, payload, transport,
            run_id=getattr(task, 'run_id', None), cancelled=task.is_cancelled if task else None)
    except pmh_core.FfWriteBlocked as exc:
        raise FfApiError(str(exc), status=exc.status, payload=exc.payload or {'error_code': exc.state}) from None
    if status != 200 or not isinstance(result, dict) or result.get('ret') != 'success':
        raise FfApiError('FF 요청 실패', status=status, payload=redact_ff_value(result, global_config.get('mate_apikey')))
    return result


def _ff_request_raw(global_config, endpoint, payload, timeout=180, form=False):
    base = str(global_config.get('mate_url') or '').rstrip('/')
    key = global_config.get('mate_apikey')
    if not base or not key:
        raise FfApiError('FF 연결 설정(BASE.FF_URL / BASE.FF_APIKEY)이 없습니다.')
    body = dict(payload, apikey=key)
    headers = {'Accept': 'application/json', 'X-API-Key': key,
               'Content-Type': 'application/x-www-form-urlencoded' if form else 'application/json'}
    data = urllib.parse.urlencode(body).encode() if form else json.dumps(body).encode()
    req = urllib.request.Request(f'{base}/metadata/{endpoint}', data=data, headers=headers, method='POST')
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            result = json.loads(response.read().decode('utf-8'))
            status = response.getcode()
    except urllib.error.HTTPError as exc:
        try:
            error = json.loads(exc.read(1024 * 1024).decode('utf-8'))
        except (ValueError, UnicodeError, OSError):
            error = {}
        finally:
            exc.close()
        error = redact_ff_value(error, key)
        if not isinstance(error, dict):
            error = {}
        message = error.get('msg') or 'FF 요청 실패'
        raise FfApiError(f"{message} (HTTP {exc.code}, {error.get('error_code', 'http_error')})",
                         status=exc.code, payload=error) from None
    except Exception as exc:
        # Do not include an authenticated URL, response body or exception text in task logs.
        raise FfApiError(f'FF 통신 실패 ({type(exc).__name__}). FF에서 처리가 계속될 수 있습니다. '
                         '재시도 전 상태를 조회하거나 기존 미디어 유지 옵션을 사용하세요.') from None
    result = redact_ff_value(result, key) if not isinstance(result, dict) or result.get('ret') != 'success' else result
    if status != 200 or not isinstance(result, dict) or result.get('ret') != 'success':
        message = result.get('msg', 'FF 요청 실패') if isinstance(result, dict) else 'FF 응답 형식 오류'
        raise FfApiError(str(message), status=status, payload=result)
    return result


def ff_command(global_config, command, code='', category='', options=None):
    return ff_request(global_config, 'meta_api', {
        'command': command, 'arg1': code, 'arg2': category,
        'arg3': json.dumps(options or {})
    }, form=True)


def check_ff_schema(global_config, categories, writable=True):
    result = ff_command(global_config, 'meta_db_schema_status')
    target = result.get('target_version')
    if result.get('schema_name') != 'meta_db' or target != 1:
        raise FfApiError('지원하는 FF 메타 DB 스키마(v1)가 아닙니다.')
    statuses = {str(key).lower(): value for key, value in (result.get('data') or {}).items()}
    for category in set(categories) | {'PERSON'}:
        status = statuses.get(category.lower(), {})
        if status.get('schema_version') != target or status.get('migration_state') not in (
                ('complete',) if writable else ('complete', 'backfilling')):
            raise FfApiError(f'FF {category} DB의 마이그레이션 상태를 확인하세요.')


def validate_ff_entity(entity, code, category):
    return pmh_core.validate_ff_entity(entity, code, category, error_class=FfApiError)


def fetch_ff_meta_batch(global_config, category, codes_list):
    return pmh_core.fetch_ff_meta_batch(global_config, category, codes_list, request_fn=ff_request, error_class=FfApiError)


def iter_ff_plex_entities(items, global_config, cancel_checker):
    buckets = defaultdict(list)
    for item in items:
        code, category = extract_sjva_code_and_cat(item.get('guid'))
        if code:
            buckets[category].append((item, code))
    for category, rows in buckets.items():
        for start in range(0, len(rows), 100):
            if cancel_checker():
                return
            chunk = rows[start:start + 100]
            data = fetch_ff_meta_batch(global_config, category, [code for _, code in chunk])
            for item, code in chunk:
                if cancel_checker():
                    return
                yield item, code, category, data.get(code)


def media_identity(value):
    return pmh_core.media_identity(value)


def ff_has_video(entity):
    def stored(asset):
        return isinstance(asset, dict) and any(isinstance(asset.get(key),str) and asset[key].strip() and
            asset[key].strip().lower() not in ('null','none','unknown path')
            for key in ('google_fileid','gdrive_fileid','local_path','relative_path'))
    extra = entity.get('extra_info') or {}
    return any(stored(extra.get(kind)) for kind in ('trailer_video','preview_clip')) or any(
        asset.get('media_type') in ('trailer','preview') and stored(asset)
        for asset in entity.get('media') or [] if isinstance(asset, dict))


def original_trailer_url(entity):
    original = entity.get('original') or {}
    return next((extra['content_url'] for extra in original.get('extras') or []
                 if isinstance(extra, dict) and extra.get('content_type') == 'trailer' and extra.get('content_url')),
                original.get('trailer') if isinstance(original.get('trailer'), str) else '')


def read_preview_settings(config, category):
    result = ff_request(config, 'settings_api', {'category': category}, timeout=60)
    media = result.get('media')
    if (category not in ('JAV_CEN','JAV_UNCEN','WESTERN') or result.get('ret') != 'success' or
            result.get('uncertain') or result.get('commit_unknown') or result.get('status') in ('partial','unknown','error') or
            result.get('commit_state') == 'unknown' or
            result.get('category') != category or not isinstance(media, dict) or
            any(type(media.get(key)) is not bool for key in ('enabled','auto_download_trailer','auto_create_preview'))):
        raise FfApiError('FF 카테고리별 영상 설정 응답을 확인할 수 없습니다.')
    return media


def require_ff_media_result(result):
    if (not isinstance(result, dict) or result.get('ret') != 'success' or
            result.get('status') in ('partial','unknown','error') or result.get('uncertain') or result.get('commit_unknown') or
            result.get('commit_state') == 'unknown' or result.get('committed') is False or
            any(result.get(key) for key in ('cleanup_pending','failures','warnings','media_warning','person_works_pending','maintenance_warnings'))):
        raise FfApiError('FF 미디어 작업이 부분 반영되었거나 결과가 불명확합니다. 연속 생성하지 않습니다.', payload=result)


def create_missing_ff_video(config, plex_item, entity, gate, options, task):
    if not gate['enabled'] or not gate['auto_download_trailer']:
        task.log('  -> FF 영상/트레일러 설정 OFF: 쓰기 없음.'); return None
    code, category = entity['code'], entity['category']
    try_trailer = options.get('preview_try_trailer', False) and bool(original_trailer_url(entity))
    if not gate['auto_create_preview'] and not try_trailer:
        task.log('  -> 프리뷰 설정 OFF이며 다운로드할 트레일러가 없어 스킵합니다.'); return None
    if task.is_cancelled(): return None
    if try_trailer:
        result = ff_request(config, 'api/meta_db/media_sync', {'category':category, 'code':code,
            'options':{'skip_existing':True,'poster':False,'landscape':False,'fanart':False,'trailer':True}})
        require_ff_media_result(result)
        if task.is_cancelled(): return None
        entity = fetch_ff_meta_batch(config, category, [code]).get(code)
        if entity is None: raise FfApiError('트레일러 시도 후 최신 FF 메타데이터 조회 실패')
        if ff_has_video(entity): return entity
        noop = result.get('is_updated') is False and not result.get('changes') and (
            result.get('skipped') is True or result.get('commit_state') == 'committed')
        if not noop: raise FfApiError('트레일러 미등록 상태에서 쓰기 미반영을 확정하지 못했습니다. 프리뷰를 연속 생성하지 않습니다.')
    if not gate['auto_create_preview']:
        task.log('  -> 트레일러 미등록, 프리뷰 설정 OFF: 추가 생성 없음.'); return None
    if task.is_cancelled(): return None
    current_files = [part.file for media in getattr(plex_item,'media',[]) for part in media.parts if getattr(part,'file',None)]
    video_path = find_best_video_file([path for path in current_files if path.strip() and path.strip().lower() != 'unknown path'])
    if not video_path: raise FfApiError('현재 Plex 원본 영상 경로가 없습니다.')
    success, message = make_ff_preview_clip(config, code, category, video_path)
    if not success: raise FfApiError(message)
    if task.is_cancelled(): return None
    latest = fetch_ff_meta_batch(config, category, [code]).get(code)
    if latest is None or not ff_has_video(latest): raise FfApiError('FF 생성 후 실제 저장 영상 등록을 확인하지 못했습니다.')
    return latest


def ff_poster_url(entity):
    return next((thumb.get('value', '') for thumb in entity.get('thumb') or []
                 if isinstance(thumb, dict) and thumb.get('aspect') == 'poster' and thumb.get('value')), '')


def ff_snapshot_targets(plex_item, config):
    """Resolve only current Plex sidecars and respect manual YAML precedence."""
    paths = {part.file for media in getattr(plex_item, 'media', []) for part in media.parts if getattr(part, 'file', None)}
    title_pid = re.match(r'^\[([^\]]+)\]', str(plex_item.title or ''))
    raw_pid = title_pid.group(1) if title_pid else None
    targets = set()
    for video_path in paths:
        directory, filename = os.path.split(video_path)
        stem = os.path.splitext(filename)[0]
        if not os.path.isdir(directory):
            continue
        files = {name.lower(): name for name in os.listdir(directory)}
        candidate, candidates = find_local_meta_json(directory, stem, raw_pid=raw_pid,
            files_in_dir=files, cfg=config, compiled_rules=compile_jav_rules(config))
        stems = {os.path.splitext(os.path.basename(path))[0] for path in candidates} | {'movie'}
        if any(f'{stem}.{ext}' in files for stem in stems for ext in ('yaml', 'yml')):
            raise FfApiError('수동 YAML이 우선 적용되는 Plex 항목은 FF 자동 반영에서 제외합니다.')
        if candidate and os.path.isfile(candidate):
            if os.path.islink(candidate):
                raise FfApiError('심볼릭 링크 JSON은 자동 갱신하지 않습니다.')
            targets.add(candidate)
    return targets


def refresh_existing_ff_json(plex_item, entity, config, cancel_checker=None):
    """Update existing caches atomically; FF remains the metadata authority."""
    targets = ff_snapshot_targets(plex_item, config)
    updated = 0
    for target in sorted(targets):
        if cancel_checker and cancel_checker(): break
        # Same-directory replacement keeps readers from observing a partial JSON.
        descriptor, temporary = tempfile.mkstemp(prefix='.pmh-meta-', dir=os.path.dirname(target))
        try:
            with os.fdopen(descriptor, 'w', encoding='utf-8') as stream:
                json.dump(entity, stream, ensure_ascii=False, indent=2)
                stream.flush()
                os.fsync(stream.fileno())
            os.chmod(temporary, os.stat(target).st_mode & 0o777)
            os.replace(temporary, target)
            updated += 1
        finally:
            if os.path.exists(temporary):
                os.unlink(temporary)
    return updated


def apply_ff_to_plex(plex, plex_item, entity, task_data, core_api):
    if hasattr(plex_item, 'reload'):
        plex_item.reload()
    code, category = extract_sjva_code_and_cat(getattr(plex_item, 'guid', ''))
    validate_ff_entity(entity, code, category)
    if core_api['task'].is_cancelled():
        return False, '사용자 취소', 0
    if getattr(plex_item, 'type', None) != 'movie':
        raise FfApiError('AV 영화 항목만 FF 메타데이터를 반영할 수 있습니다.')
    method = task_data.get('ff_apply_method', 'refresh')
    if method not in ('refresh', 'match'):
        raise FfApiError('지원하지 않는 Plex 반영 방식입니다.')
    updated = refresh_existing_ff_json(plex_item, entity, core_api['config'], core_api['task'].is_cancelled)
    if core_api['task'].is_cancelled(): return False, '사용자 취소', 0
    if not updated: core_api['task'].log('  -> 로컬 JSON 없음: 새 파일을 만들지 않습니다. 에이전트가 생성하지 않으면 다음 조회에도 표시될 수 있습니다.')
    core_api['task'].log(f'  -> 기존 JSON 캐시 {updated}개 갱신. FF 최종 메타데이터를 Plex에 반영합니다.')
    return pmh_core.perform_smart_media_action(
        plex_url=plex._baseurl, plex_token=plex._token, rating_key=str(plex_item.ratingKey),
        action_type=method, item_title=plex_item.title, item_year=plex_item.year,
        target_agent=plex_item.section().agent, plex_inst=plex,
        do_unmatch_first=method == 'match' and task_data.get('opt_unmatch_first', True),
        skip_sim_check=task_data.get('opt_skip_sim_check', False),
        use_custom_score=task_data.get('opt_use_custom_score', False),
        custom_agent_score=task_data.get('opt_custom_agent_score', 95),
        search_priority=task_data.get('opt_search_priority', 'auto'),
        manual_match=task_data.get('opt_manual_match', False), global_config=core_api['config'],
        task_logger=core_api['task'].log, cancel_checker=core_api['task'].is_cancelled)



def detect_meta_diff(local_json, ff_json):
    return pmh_core.detect_meta_diff(local_json, ff_json)


# ==============================================================================
# 워커 쓰레드 로직 (백그라운드 처리)
# ==============================================================================
def worker(task_data, core_api, start_index):
    task = core_api['task']
    action = task_data.get('action_type')
    mode = task_data.get('scan_mode', 'mismatch')
    if mode not in SCAN_MODES:
        task.log('❌ 사용할 수 없는 검사 모드입니다. 검사 모드를 다시 선택하고 조회하세요.')
        task.update_state('error')
        return
    
    # ----------------------------------------------------------------------
    # 1. Preview / Cron_Run 모드 (조회 및 검출)
    # ----------------------------------------------------------------------
    if action in ["preview", "cron_run"]:
        prefix = "[자동 실행] " if action == 'cron_run' else ""
        task.log(f"{prefix}데이터베이스에서 아이템 목록을 쿼리하는 중입니다. 잠시만 기다려주세요...")
        task.update_state('running', progress=0, total=100)
        
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
                       mi.summary AS plex_plot, mi.tagline AS plex_tagline, mi.studio AS plex_studio, mi.year AS plex_year,
                       {group_fn}(mp.file, '|||') AS all_files
                FROM metadata_items mi
                JOIN library_sections ls ON mi.library_section_id = ls.id
                LEFT JOIN media_items mpi ON mpi.metadata_item_id = mi.id
                LEFT JOIN media_parts mp ON mp.media_item_id = mpi.id
                WHERE mi.library_section_id IN ({placeholders}) AND mi.metadata_type = 1
                GROUP BY mi.id, mi.title, mi.guid, ls.id, ls.name, mi.summary, mi.tagline, mi.studio, mi.year
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
        if mode == 'json_diff':
            categories = {extract_sjva_code_and_cat(item.get('guid'))[1] for item in all_items}
            categories.discard(None)
            if categories:
                try:
                    check_ff_schema(cfg, categories, mode != 'json_diff')
                except FfApiError as exc:
                    task.log(f'❌ FF 작업 사전 확인 실패: {exc}')
                    task.update_state('error')
                    return
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

        # FF 메타 DB 동기화 모드
        elif mode == "json_diff":
            try:
                web_url_root = task_data.get('image_web_url', '').rstrip('/')
                json_diff_stats = defaultdict(int)
                skipped_ff = [0]
                batch_buckets = defaultdict(list)
                dir_cache = {}

                def get_dir_files(d_path):
                    if d_path not in dir_cache:
                        try:
                            dir_cache[d_path] = {f.lower(): f for f in os.listdir(d_path)}
                        except Exception:
                            dir_cache[d_path] = set()
                    return dir_cache[d_path]

                def flush_json_diff_batch(cat, items_chunk):
                    if not items_chunk or task.is_cancelled(): return
                    codes_to_query = [it['target_code'] for it in items_chunk if it.get('target_code')]
                    if not codes_to_query: return

                    HTTP_CHUNK_LIMIT = 100
                    batch_data = {}
                    for i in range(0, len(codes_to_query), HTTP_CHUNK_LIMIT):
                        sub_codes = codes_to_query[i:i + HTTP_CHUNK_LIMIT]
                        chunk_resp = fetch_ff_meta_batch(core_api['config'], cat, sub_codes)
                        if chunk_resp and isinstance(chunk_resp, dict):
                            batch_data.update(chunk_resp)

                    ff_lookup = {str(key).casefold(): value for key, value in batch_data.items()}

                    for it in items_chunk:
                        if task.is_cancelled(): return
                        req_code = (it.get('target_code') or '').lower()
                        ff_json = ff_lookup.get(req_code)

                        # FF 메타 DB에 데이터가 존재하지 않는 항목은 스킵
                        if not ff_json:
                            skipped_ff[0] += 1
                            continue

                        # 매칭된 항목에 대해서만 로컬 JSON을 지연 로딩(Lazy Load)하여 메모리 및 파일 I/O 절약
                        target_json_path = it.get('target_json_path')
                        local_json = {}
                        reasons = []
                        if target_json_path and os.path.exists(target_json_path):
                            try:
                                with open(target_json_path, 'r', encoding='utf-8') as jf:
                                    local_json = json.load(jf)
                                if not isinstance(local_json, dict): raise ValueError('JSON object required')
                            except (OSError, ValueError, TypeError):
                                reasons.append('로컬 JSON 파싱 오류')

                        # 로컬 JSON 유무 및 FF 메타 DB 정밀 Diff 대조
                        if not target_json_path:
                            reasons.append("로컬 JSON 없음")
                        elif not reasons:
                            diff_res = detect_meta_diff(local_json, ff_json)
                            for r in diff_res:
                                if r not in reasons:
                                    reasons.append(r)

                        if reasons:
                            for r in reasons:
                                # 세부 인원수(N명)를 정규화하여 통계 카테고리로 집계
                                base_stat_key = re.sub(r'\s*\d+명$', '', r)
                                json_diff_stats[base_stat_key] += 1

                            reason_label = " ".join([f"[{r}]" for r in reasons])

                            preview_img = ff_poster_url(ff_json)

                            # 상대 경로로 등록된 이미지이고 웹 주소가 설정된 경우 전체 URL 조립
                            if preview_img and not preview_img.startswith('http') and web_url_root:
                                preview_img = f"{web_url_root}/{urllib.parse.quote(preview_img.lstrip('/'), safe='/')}"

                            result_data.append({
                                "id": it['id'],
                                "section_name": it['section_name'],
                                "title": it['db_title'] or it.get('title', ''),
                                "reason": reason_label,
                                "img_url": preview_img,
                                "op_action": "ff_apply",
                                "_sjva_code": ff_json["code"], "_sjva_cat": cat,
                                "_target_json": target_json_path or (it['json_candidates'][0] if it['json_candidates'] else ""),
                                "_raw_db_pid": it.get('_raw_db_pid', ''),
                                "_raw_sec_id": it.get('_raw_sec_id', ''),
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
                
                    fpath = find_best_video_file(files_raw.split('|||'))
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

                    target_code = sjva_code
                    if not target_code:
                        continue

                    cat = sjva_cat or ('JAV_UNCEN' if target_code.upper().startswith('E') else ('WESTERN' if target_code.upper().startswith('W') else 'JAV_CEN'))

                    sec_id = str(item.get('section_id', ''))
                    db_pid_key = pid_lower if pid_lower else target_code.lower()

                    queue_entry = {
                        'id': item['id'],
                        'section_name': item['section_name'],
                        'db_title': db_title or item.get('title', ''),
                        'target_code': target_code,
                        'raw_path': fpath,
                        'target_json_path': target_json_path,
                        'json_candidates': json_candidates,
                        '_raw_db_pid': db_pid_key,
                        '_raw_sec_id': sec_id
                    }

                    batch_buckets[cat].append(queue_entry)

                    # FF API 최적 배치 크기(100건) 도달 시 일괄 요청
                    if len(batch_buckets[cat]) >= 100:
                        flush_json_diff_batch(cat, batch_buckets[cat])
                        batch_buckets[cat].clear()

                for cat, queued_items in batch_buckets.items():
                    if queued_items:
                        flush_json_diff_batch(cat, queued_items)
                batch_buckets.clear()
                dir_cache.clear()
                if skipped_ff[0]:
                    task.log(f'ℹ️ FF 조회 결과가 없는 Plex 항목 {skipped_ff[0]}건은 제외했습니다.')

            except FfApiError as exc:
                task.log(f'❌ FF 조회 실패: {exc}')
                task.update_state('error')
                return

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

        elif mode == 'preview_clip':
            excluded = defaultdict(int)
            settings = {}
            eligible = []
            for item in all_items:
                code, category = extract_sjva_code_and_cat(item.get('guid'))
                if not code: continue
                if category not in settings:
                    try:
                        settings[category] = read_preview_settings(cfg, category)
                        if settings[category]['enabled'] and settings[category]['auto_download_trailer']:
                            check_ff_schema(cfg, [category], True)
                    except FfApiError as exc:
                        settings[category] = None
                        task.log(f'❌ {category} 영상 설정 조회 실패: {exc}')
                gate = settings[category]
                if not gate or not gate['enabled'] or not gate['auto_download_trailer']:
                    excluded[category + ' 설정 OFF/불명'] += 1
                    continue
                if not gate['auto_create_preview'] and not task_data.get('preview_try_trailer', False):
                    excluded[category + ' 허용된 작업 없음'] += 1
                    continue
                eligible.append(item)
            try:
                for item, code, category, entity in iter_ff_plex_entities(eligible, cfg, task.is_cancelled):
                    if entity is None:
                        excluded['FF 작품 없음'] += 1; continue
                    if ff_has_video(entity):
                        excluded['저장 영상 등록됨'] += 1; continue
                    video = find_best_video_file((item.get('all_files') or '').split('|||'))
                    if not video or video.strip().lower() == 'unknown path':
                        excluded['Plex 원본 경로 없음'] += 1; continue
                    if not settings[category]['auto_create_preview'] and not original_trailer_url(entity):
                        excluded['허용된 트레일러 원본 없음'] += 1; continue
                    result_data.append({'id':item['id'], 'section_name':item['section_name'], 'title':item['title'],
                        'reason':'FF 저장 트레일러/프리뷰 없음', 'img_url':ff_poster_url(entity), 'op_action':'make_preview',
                        '_sjva_code':code, '_sjva_cat':category, 'raw_path':video})
            except FfApiError as exc:
                task.log(f'❌ FF 조회 실패: {exc}'); task.update_state('error'); return
            for reason, count in excluded.items(): task.log(f'ℹ️ 제외 {count}건: {reason}')


        if task.is_cancelled():
            task.log("🛑 검사가 사용자 취소로 중단되었습니다.")
            return

        result_data = core_api['sort'](result_data, [{"key": "section_name", "dir": "asc"}, {"key": "title", "dir": "asc"}])

        btn_label = "일괄 리매칭 시작"
        if mode == "file_error": btn_label = "수동 확인 필요"
        
        elif mode == "preview_clip": btn_label = "트레일러 누락 영상 프리뷰 생성"
        elif mode == "json_diff": btn_label = "JSON 최신화 및 Plex 반영"

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
                stats_summary = []
                if mode == "json_diff" and json_diff_stats:
                    top_stats = sorted(json_diff_stats.items(), key=lambda x: x[1], reverse=True)[:5]
                    stats_summary = [f"{k}: {v:,}건" for k, v in top_stats]

                detail_log_suffix = f" (세부: {', '.join(stats_summary)})" if stats_summary else ""
                task.log(f"✅ 검사 완료! 총 {len(result_data):,}개의 항목이 검출되었습니다.{detail_log_suffix}")
            else:
                task.log("✅ 라이브러리 검사 완료. 모든 항목이 정상입니다! (조치할 대상 없음)")
            return
        else:
            if len(result_data) == 0:
                task.update_state('completed', progress=100, total=100)
                task.log("✅ [자동 실행] 조치(복구)가 필요한 항목이 없어 작업을 종료합니다.")
                return
            
            action = 'execute'
            task_data['action_type'] = 'execute'
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
        pending_items = pmh_core.load_pending_tool_items(core_api['cache'], retry_errors)
        progress = max(0, total - len(pending_items))

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

    processed_pids = set()
    preview_settings = {}
    if mode == 'json_diff':
        categories = {item.get('_sjva_cat') for item in pending_items if item.get('_sjva_cat')}
        if categories:
            try:
                check_ff_schema(core_api['config'], categories, mode != 'json_diff')
            except FfApiError as exc:
                task.log(f'❌ FF 작업 사전 확인 실패: {exc}')
                task.update_state('error')
                return

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
            item_reason = str(item.get('reason') or '').strip()
            reason_suffix = f" (사유: {item_reason})" if item_reason else ""
            task.log(f"[{progress}/{total}] '{title}' 처리 요청 중... (동작: {op_action}{reason_suffix})")
            
            item_has_error = False

            try:
                if op_action not in ('match','split','open_folder','ff_apply','make_preview') or (mode not in ('json_diff','preview_clip') and op_action in ('ff_apply','make_preview')):
                    raise FfApiError('캐시된 동작을 지원하지 않습니다. 검사 모드를 다시 선택하고 조회하세요.')
                if (mode == 'json_diff' and op_action not in ('ff_apply','match')) or (mode == 'preview_clip' and op_action != 'make_preview'):
                    raise FfApiError('캐시된 작업이 현재 검사 모드와 다릅니다. 다시 조회하세요.')
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
                
                if task.is_cancelled(): break
                if op_action == 'split':
                    if len(plex_item.media) > 1:
                        plex_item.split()
                        task.log(f"  -> ✂️ 항목이 분리되었습니다.")
                    else:
                        task.log("  -> ⚠️ 분리 불가: 단일 미디어 파일입니다. 분리 대신 매칭(Match)으로 우회합니다.")
                        op_action = 'match'

                if mode == 'json_diff': op_action = 'ff_apply'
                if mode == 'preview_clip': op_action = 'make_preview'
                if op_action in ('ff_apply', 'make_preview'):
                    if getattr(plex_item, 'type', None) != 'movie': raise FfApiError('현재 Plex 항목이 AV 영화가 아닙니다.')
                    code, category = extract_sjva_code_and_cat(getattr(plex_item, 'guid', ''))
                    expected_code = item.get('_sjva_code') or code
                    expected_category = item.get('_sjva_cat') or category
                    if not code or code != expected_code or category != expected_category:
                        raise FfApiError('검사 이후 Plex GUID가 변경되어 FF 작업을 중단합니다. 목록을 다시 조회하세요.')
                    if op_action == 'make_preview':
                        if category not in preview_settings:
                            try:
                                preview_settings[category] = read_preview_settings(core_api['config'], category)
                                if preview_settings[category]['enabled'] and preview_settings[category]['auto_download_trailer']:
                                    check_ff_schema(core_api['config'], [category], True)
                            except FfApiError as exc: preview_settings[category] = str(exc)
                        gate = preview_settings[category]
                        if not isinstance(gate, dict): raise FfApiError(gate)
                        if not gate['enabled'] or not gate['auto_download_trailer']:
                            task.log('  -> 설정 OFF: 트레일러/프리뷰 및 Plex 반영을 건너뜁니다.')
                            core_api['cache'].mark_keys_as_done('id', [item_id]); continue
                    ff_snapshot_targets(plex_item, core_api['config'])
                    if task.is_cancelled(): break
                    latest = fetch_ff_meta_batch(core_api['config'], category, [code]).get(code)
                    if latest is None: raise FfApiError(f'FF 메타 DB에 {code} 작품이 없습니다.')
                    if op_action == 'make_preview':
                        if ff_has_video(latest):
                            task.log('  -> FF 저장 영상이 이미 등록되어 생성/반영을 건너뜁니다.')
                            core_api['cache'].mark_keys_as_done('id', [item_id]); continue
                        latest = create_missing_ff_video(core_api['config'], plex_item, latest, gate, task_data, task)
                        if latest is None:
                            if task.is_cancelled(): break
                            core_api['cache'].mark_keys_as_done('id', [item_id]); continue
                    if task.is_cancelled(): break
                    phase = pmh_core.FfWriteJournal(core_api['config'])
                    phase_args = {'plex_id': str(plex_item.ratingKey), 'persons': [
                        ('WESTERN' if category == 'WESTERN' else 'JAV', str(actor['actor_idx']))
                        for actor in latest.get('actor') or [] if isinstance(actor, dict) and actor.get('actor_idx')]}
                    phase.plex_phase(category, code, 'applying', **phase_args)
                    try:
                        success, msg, score = apply_ff_to_plex(plex, plex_item, latest, task_data, core_api)
                    except Exception:
                        phase.plex_phase(category, code, 'failed', **phase_args)
                        raise
                    if task.is_cancelled():
                        phase.plex_phase(category, code, 'failed', **phase_args)
                        break
                    phase.plex_phase(category, code, 'accepted' if success else 'failed', **phase_args)
                    task.log(f'  -> {"✅" if success else "❌"} Plex 반영: {msg}')
                    item_has_error = not success

                if op_action == 'match':
                    # 메타 동기화 모드 시 최신 메타 반영을 위해 구버전 로컬 JSON 파일 자동 삭제
                    if mode == "llm_translation":
                        target_json = item.get('_target_json')
                        if target_json and os.path.exists(target_json):
                            if task.is_cancelled(): break
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
                        task.log(f"  -> ✅ 매칭 처리 완료: {msg}{reason_suffix}")
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
                mode_label = {'mismatch':'품번 불일치/오매칭 복구', 'dupes':'중복 아이템 재매칭',
                    'json_diff':'메타 DB 기준 불일치(JSON) 반영', 'llm_translation':'LLM 미적용 항목 검출 및 리매칭',
                    'file_error':'파일명 오류 항목(수동 확인/작업 필요)', 'preview_clip':'트레일러 누락 영상 프리뷰 생성'}[mode]

                reason_counter = defaultdict(int)
                for it in pending_items:
                    r_str = str(it.get('reason') or '').strip()
                    if r_str:
                        tags = re.findall(r'\[(.*?)\]', r_str)
                        if tags:
                            for t in tags:
                                base_key = re.sub(r'\s*\d+명$', '', t)
                                reason_counter[base_key] += 1
                        else:
                            reason_counter[r_str] += 1

                top_reasons = sorted(reason_counter.items(), key=lambda x: x[1], reverse=True)[:4]
                diff_summary_str = ", ".join([f"{k} {v:,}건" for k, v in top_reasons]) if top_reasons else "정상 처리"

                tool_vars = {
                    "total": f"{total:,}",
                    "elapsed_time": elapsed_str,
                    "scan_mode_label": mode_label,
                    "diff_summary": diff_summary_str
                }
                core_api['notify']("AV 매니저 완료", DEFAULT_DISCORD_TEMPLATE, "#e5a00d", tool_vars)

    finally:
        current_state = core_api['task'].load(include_target_items=False)
        if current_state:
            real_state = current_state.get('state', 'running')
            if real_state != 'completed':
                task.update_state(real_state, progress=progress)
