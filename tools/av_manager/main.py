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
import html
import time
import urllib.request, urllib.parse, urllib.error
import pmh_core
from collections import defaultdict
from pmh_core import compile_jav_rules, extract_jav_pid, normalize_pid_for_comparison

SCAN_MODES = frozenset(('mismatch', 'dupes', 'llm_translation', 'file_error', 'preview_clip', 'json_diff'))

def normalize_pid(pid_str):
    return normalize_pid_for_comparison(pid_str)

def find_local_meta_json(dir_name, base_name, raw_pid=None, files_in_dir=None, cfg=None, compiled_rules=None, **identity):
    return pmh_core.find_local_meta_json(dir_name, base_name, raw_pid, files_in_dir, cfg, compiled_rules, **identity)


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
            {
                "id": "opt_unmatch_first", 
                "type": "checkbox", 
                "label": "클린 리매칭 실행",
                "default": True, 
                "hide_if": {"scan_mode": ["file_error", "json_diff"]}
            },
            {"id": "opt_skip_sim_check", "type": "checkbox", "label": "매칭 시 제목/연도 검증 스킵 (모든 에이전트 적용)", "default": False, "hide_if": {"scan_mode": "file_error"}},
            {"id": "opt_manual_match", "type": "checkbox", "label": "수동 매칭 모드 사용 (모든 사이트 강제 검색)", "default": False, "hide_if": {"scan_mode": "file_error"}},
            {"id": "opt_use_custom_score", "type": "checkbox", "label": "에이전트 매칭 통과 점수 직접 지정", "default": False, "hide_if": {"scan_mode": "file_error"}},
            {"id": "opt_custom_agent_score", "type": "number", "label": "매칭 통과 최소 점수", "default": 95, "width": "60px", "layout": "plain", "show_if": {"scan_mode": ["mismatch", "dupes", "llm_translation", "json_diff", "preview_clip"], "opt_use_custom_score": True}},
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
    if data.get('scan_mode') == 'json_diff':
        data = dict(data, opt_unmatch_first=True)
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
                '_scan_guid': data.get('_scan_guid', ''),
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
        self.status = status
        self.payload = payload if isinstance(payload, dict) else {}
        self.error_code = self.payload.get('error_code')
        details = ([f'HTTP {status}'] if status is not None else [])
        if self.error_code: details.append(str(self.error_code))
        details.append(str(message))
        super().__init__(' · '.join(details))
        self.retryable = False  # Remote delivery/commit cannot be inferred from HTTP failure.


def redact_ff_value(value, key):
    if isinstance(value, dict):
        return {name: ('****' if re.search(r'(?i)apikey|api_key|token|password|authorization|cookie|signature', str(name)) else redact_ff_value(item, key))
                for name, item in value.items()}
    if isinstance(value, list):
        return [redact_ff_value(item, key) for item in value]
    if isinstance(value, str):
        value = value.replace(str(key), '****') if key else value
        value = re.sub(r'https?://[^\s<>]+', '[FF URL]', value)
        return re.sub(r'(?i)(apikey|api_key|token|password|authorization|cookie|signature)\s*[:=]\s*\S+', '[redacted]', value)
    return value


def ff_request(global_config, endpoint, payload, timeout=180, form=False):
    task = global_config.get('_ff_task') or getattr(getattr(pmh_core, '_FF_WRITE_CONTEXT', None), 'task', None)
    if task and task.is_cancelled():
        raise FfApiError('FF 요청이 취소되었습니다.')
    return _ff_request_raw(global_config, endpoint, payload, timeout, form)


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
        parse_failed = False
        try:
            error = json.loads(exc.read(1024 * 1024).decode('utf-8'))
        except (ValueError, UnicodeError, OSError):
            error = {}
            parse_failed = True
        finally:
            exc.close()
        error = redact_ff_value(error, key)
        if not isinstance(error, dict):
            error = {}
        message = error.get('msg') or ('FF 응답 파싱 실패' if parse_failed else 'FF 요청 실패')
        raise FfApiError(message, status=exc.code, payload=error) from None
    except (ValueError, UnicodeError):
        raise FfApiError('FF 응답 파싱 실패. 최종 원격 반영 여부를 알 수 없습니다.') from None
    except Exception as exc:
        # Do not include an authenticated URL, response body or exception text in task logs.
        raise FfApiError(f'FF 통신 실패 ({type(exc).__name__}). 최종 원격 반영 여부를 알 수 없습니다.') from None
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
    if result.get('schema_name') != 'meta_db' or not isinstance(target, int) or target < 1:
        raise FfApiError('지원하는 FF 메타 DB 스키마(v1 이상)가 아닙니다.')
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


def ff_snapshot_targets(plex_item, config, entity=None):
    """Read-only existence lookup before the existing FF/Plex action."""
    paths = [part.file for media in getattr(plex_item, 'media', [])
             for part in media.parts if getattr(part, 'file', None)]
    category = (entity or {}).get('category') or extract_sjva_code_and_cat(getattr(plex_item, 'guid', None))[1]
    found = set()
    listings = {}
    try:
        for video in paths if category == 'WESTERN' else paths[:1]:
            directory = os.path.dirname(video)
            if directory not in listings: listings[directory] = os.listdir(directory)
            stem = os.path.splitext(os.path.basename(video))[0]
            if category == 'WESTERN':
                key = lambda value: re.sub(r'(?i)(?:\s+CD[0-9]+$|(?<!\w)CD[0-9]+(?!\w)\s?)', '', value).casefold()
                found.update(os.path.join(directory, name) for name in listings[directory]
                    if os.path.splitext(name)[1].lower() == '.json'
                    and key(os.path.splitext(name)[0]) == key(stem))
            else:
                path, _ = find_local_meta_json(directory, stem, files_in_dir=listings[directory], category=category)
                if path: found.add(path)
    except OSError as exc:
        raise FfApiError(str(exc)) from exc
    return found


def apply_ff_to_plex(plex, plex_item, entity, task_data, core_api):
    if hasattr(plex_item, 'reload'):
        plex_item.reload()
    code, category = extract_sjva_code_and_cat(getattr(plex_item, 'guid', ''))
    validate_ff_entity(entity, code, category)
    if core_api['task'].is_cancelled():
        return False, '사용자 취소', 0
    if getattr(plex_item, 'type', None) != 'movie':
        raise FfApiError('AV 영화 항목만 FF 메타데이터를 반영할 수 있습니다.')
    config = core_api['config']
    section = plex_item.section()
    agent = section.agent or ''
    clean_rematch = task_data.get('opt_unmatch_first', True)
    local_agent = any(name in agent.lower() for name in ('yaml', 'nfo', 'xbmc'))
    deletes_json = clean_rematch and not local_agent and pmh_core.match_section_ids(
        config.get('DELETE_JSON_SECTION'), getattr(plex_item, 'librarySectionID', None))
    if deletes_json:
        ff_snapshot_targets(plex_item, config, entity)
        core_api['task'].log('  -> 클린 리매칭: 사전 JSON 덮어쓰기 없이 공통 코어에서 정리·매칭합니다.')
    else:
        reason = '클린 리매칭 OFF' if not clean_rematch else 'JSON 삭제 미허용/수동 에이전트'
        core_api['task'].log(f'  -> {reason}: 로컬 JSON을 유지합니다. 최신 FF 메타/프리뷰의 Plex 반영은 확인되지 않았습니다.')
    if core_api['task'].is_cancelled(): return False, '사용자 취소', 0
    success, message, score = pmh_core.perform_smart_media_action(
        plex_url=plex._baseurl, plex_token=plex._token, rating_key=str(plex_item.ratingKey),
        action_type='match', item_title=plex_item.title, item_year=plex_item.year,
        target_agent=agent, plex_inst=plex, try_refresh_first=False,
        do_unmatch_first=clean_rematch,
        skip_sim_check=task_data.get('opt_skip_sim_check', False),
        use_custom_score=task_data.get('opt_use_custom_score', False),
        custom_agent_score=task_data.get('opt_custom_agent_score', 95),
        search_priority=task_data.get('opt_search_priority', 'auto'),
        manual_match=task_data.get('opt_manual_match', False), global_config=core_api['config'],
        meta_json_entity=entity,
        task_logger=core_api['task'].log, cancel_checker=core_api['task'].is_cancelled)
    if success and not deletes_json:
        message += ' · 로컬 JSON 미갱신 / 최신 FF 메타·프리뷰 반영 미확인'
    return success, message, score



def detect_meta_diff(local_json, ff_json):
    return pmh_core.detect_meta_diff(local_json, ff_json)


# ==============================================================================
# 워커 쓰레드 로직 (백그라운드 처리)
# ==============================================================================
def worker(task_data, core_api, start_index):
    task = core_api['task']
    action = task_data.get('action_type')
    mode = task_data.get('scan_mode', 'mismatch')
    if mode == 'json_diff': task_data = dict(task_data, opt_unmatch_first=True)
    if mode not in SCAN_MODES:
        task.log('❌ 사용할 수 없는 검사 모드입니다. 검사 모드를 다시 선택하고 조회하세요.')
        task.update_state('error')
        return
    
    # ----------------------------------------------------------------------
    # 1. Preview / Cron_Run 모드 (조회 및 검출)
    # ----------------------------------------------------------------------
    if action in ["preview", "cron_run"]:
        prefix = "[자동 실행] " if action == 'cron_run' else ""
        task.log(f"{prefix}AV DB 조회 중")
        task.update_state('running', progress=0, total=0)
        
        section_ids = task_data.get('target_sections', [])
        clean_sec_ids = [int(x) for x in section_ids if str(x).isdigit()]
        
        if not clean_sec_ids:
            task.log("⚠️ 유효한 라이브러리가 선택되지 않았습니다. 설정을 확인하세요.")
            task.update_state('completed', progress=0, total=0)
            return
            
        try:
            placeholders = ",".join("?" for _ in clean_sec_ids)
            
            # PostgreSQL ANSI 규격 준수: SELECT의 비집계 컬럼을 GROUP BY에 전수 명시
            group_fn = "string_agg" if core_api['config'].get('plex_db_type') == 'postgres' else "GROUP_CONCAT"
            section_agent_sql = ', ls.agent AS section_agent' if mode == 'json_diff' else ''
            q = f"""
                SELECT mi.id, mi.title, mi.guid, ls.id AS section_id, ls.name AS section_name,
                       mi.summary AS plex_plot, mi.tagline AS plex_tagline, mi.studio AS plex_studio, mi.year AS plex_year,
                       {group_fn}(mp.file, '|||') AS all_files {section_agent_sql}
                FROM metadata_items mi
                JOIN library_sections ls ON mi.library_section_id = ls.id
                LEFT JOIN media_items mpi ON mpi.metadata_item_id = mi.id
                LEFT JOIN media_parts mp ON mp.media_item_id = mpi.id
                WHERE mi.library_section_id IN ({placeholders}) AND mi.metadata_type = 1
                GROUP BY mi.id, mi.title, mi.guid, ls.id, ls.name, mi.summary, mi.tagline, mi.studio, mi.year {', ls.agent' if mode == 'json_diff' else ''}
            """
            all_items = core_api['query'](q, tuple(clean_sec_ids))
            
            if not all_items:
                task.log("선택한 라이브러리에 해당하는 항목(영화)이 없습니다.")
                task.update_state('completed', 0, 0)
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
                task.update_state('completed', 0, 0)
                return

        except Exception as e:
            task.log(f"❌ DB 쿼리 중 오류 발생: {e}")
            task.update_state('error')
            return

        total_items = len(all_items)
        task.update_state('running', progress=0, total=total_items)
        completed_items = 0
        update_interval = max(1, min(100, (total_items + 19) // 20))
        last_progress_log = time.monotonic()

        def advance_scan():
            nonlocal completed_items, last_progress_log
            completed_items += 1
            if completed_items % update_interval == 0 or completed_items == total_items:
                task.update_state('running', progress=completed_items, total=total_items)
            now = time.monotonic()
            if mode not in ('json_diff', 'preview_clip') and completed_items < total_items and now - last_progress_log >= 3:
                task.log(f"AV {mode} 검사 {completed_items:,}/{total_items:,} · 검출 {len(result_data):,}건")
                last_progress_log = now

        def inspected(rows):
            # Advance after the caller finishes inspection, including continue paths.
            for row in rows:
                yield row
                advance_scan()
        
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

        def scan_sidecars(item, files_by_dir=None):
            category = extract_sjva_code_and_cat(item.get('guid'))[1]
            paths = []
            listings = files_by_dir if files_by_dir is not None else {}
            files = item['all_files'].split('|||')
            for video in files if category == 'WESTERN' else files[:1]:
                directory = os.path.dirname(video)
                if directory not in listings: listings[directory] = os.listdir(directory)
                stem = os.path.splitext(os.path.basename(video))[0]
                if category == 'WESTERN':
                    key = lambda value: re.sub(r'(?i)(?:\s+CD[0-9]+$|(?<!\w)CD[0-9]+(?!\w)\s?)', '', value).casefold()
                    paths.extend(os.path.join(directory, name) for name in listings[directory]
                        if os.path.splitext(name)[1].lower() == '.json'
                        and key(os.path.splitext(name)[0]) == key(stem))
                else:
                    path, _ = find_local_meta_json(directory, stem, files_in_dir=listings[directory], category=category)
                    if path: paths.append(path)
            paths = list(dict.fromkeys(paths))
            return {'paths': paths}

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
            for item in inspected(all_items):
                if task.is_cancelled(): break
                
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
            for item in inspected(all_items):
                if task.is_cancelled(): break
                
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
                batch_buckets = defaultdict(list)
                dir_cache = {}

                def get_dir_files(d_path):
                    if d_path not in dir_cache:
                        try:
                            dir_cache[d_path] = os.listdir(d_path)
                        except OSError as exc:
                            raise pmh_core.JsonSidecarError('io_error', 'JSON 디렉터리 조회 실패', directory=d_path) from exc
                    return dir_cache[d_path]

                json_chunks = 0

                def flush_json_diff_batch(cat, items_chunk):
                    nonlocal json_chunks, last_progress_log
                    if not items_chunk or task.is_cancelled(): return
                    codes_to_query = [it['target_code'] for it in items_chunk if it.get('target_code')]
                    if not codes_to_query: return

                    HTTP_CHUNK_LIMIT = 100
                    batch_data = {}
                    for i in range(0, len(codes_to_query), HTTP_CHUNK_LIMIT):
                        sub_codes = codes_to_query[i:i + HTTP_CHUNK_LIMIT]
                        json_chunks += 1
                        task.update_state('running', progress=completed_items, total=total_items)
                        if json_chunks == 1:
                            task.log('AV JSON FF 조회 대기 중')
                            last_progress_log = time.monotonic()
                        chunk_resp = fetch_ff_meta_batch(core_api['config'], cat, sub_codes)
                        if chunk_resp and isinstance(chunk_resp, dict):
                            batch_data.update(chunk_resp)

                    ff_lookup = {str(key).casefold(): value for key, value in batch_data.items()}

                    for it in inspected(items_chunk):
                        if task.is_cancelled(): return
                        req_code = (it.get('target_code') or '').lower()
                        ff_json = ff_lookup.get(req_code)

                        # 매칭된 항목에 대해서만 로컬 JSON을 지연 로딩(Lazy Load)하여 메모리 및 파일 I/O 절약
                        target_json_path = it.get('target_json_path')
                        local_json = {}
                        reasons = []
                        local_error = None
                        if not ff_json:
                            reasons.append('FF DB 원본 없음')
                        if not target_json_path:
                            reasons.append('로컬 JSON 없음')
                        for path in it['target_json_paths'] if ff_json else []:
                            try:
                                with open(path, 'r', encoding='utf-8') as jf:
                                    local_json = json.load(jf)
                                if not isinstance(local_json, dict) or not local_json: raise ValueError('JSON object required')
                            except (ValueError, TypeError, UnicodeError) as exc:
                                reasons.append('JSON 손상/갱신 대상 (로컬 JSON 파싱 오류)')
                                break
                            except OSError as exc:
                                local_error = pmh_core.JsonSidecarError('io_error', '검사 중 JSON 읽기 실패', json_paths=[path])
                                break
                            for key, label in (('code', '작품 코드'), ('category', '카테고리')):
                                if local_json.get(key) != ff_json.get(key): reasons.append(f'{label} 갱신')
                            try:
                                for reason in detect_meta_diff(local_json, ff_json):
                                    if reason not in reasons: reasons.append(reason)
                            except (ValueError, TypeError, AttributeError):
                                reasons = ['JSON 손상/갱신 대상 (잘못된 메타 구조)']
                                break

                        if local_error:
                            task.log(f"❌ JSON 읽기 실패 · id={it['id']} · {local_error}")
                            continue

                        if reasons:
                            for r in reasons:
                                # 세부 인원수(N명)를 정규화하여 통계 카테고리로 집계
                                base_stat_key = re.sub(r'\s*\d+명$', '', r)
                                json_diff_stats[base_stat_key] += 1

                            reason_label = " ".join([f"[{r}]" for r in reasons])

                            preview_img = ff_poster_url(ff_json) if ff_json else ''

                            # 상대 경로로 등록된 이미지이고 웹 주소가 설정된 경우 전체 URL 조립
                            if preview_img and not preview_img.startswith('http') and web_url_root:
                                preview_img = f"{web_url_root}/{urllib.parse.quote(preview_img.lstrip('/'), safe='/')}"

                            result_data.append({
                                "id": it['id'],
                                "section_name": it['section_name'],
                                "title": it['db_title'] or it.get('title', ''),
                                "reason": reason_label,
                                "img_url": preview_img,
                                "op_action": "match",
                                "_sjva_code": it['target_code'], "_sjva_cat": cat,
                                "_target_json": target_json_path or '',
                                '_scan_guid': it['guid'],
                                "_raw_db_pid": it.get('_raw_db_pid', ''),
                                "_raw_sec_id": it.get('_raw_sec_id', ''),
                                "raw_path": it['raw_path']
                            })

                    task.update_state('running', progress=completed_items, total=total_items)
                    now = time.monotonic()
                    if now - last_progress_log >= 3:
                        task.log(f'AV JSON 검사 {completed_items:,}/{total_items:,} · FF {json_chunks}청크 · 검출 {len(result_data):,}건')
                        last_progress_log = now

                for item in all_items:
                    if task.is_cancelled(): break

                    files_raw = item.get('all_files')
                    if not files_raw:
                        advance_scan()
                        continue
                
                    files = files_raw.split('|||')
                    fpath = files[0]
                    db_title = item.get('title', '').strip()
                    guid = str(item.get('guid') or '').strip()
                    target_code, cat = extract_sjva_code_and_cat(guid)
                    if not target_code:
                        advance_scan()
                        continue
                    paths = []
                    try:
                        for video in files if cat == 'WESTERN' else files[:1]:
                            directory = os.path.dirname(video)
                            names = get_dir_files(directory)
                            stem = os.path.splitext(os.path.basename(video))[0]
                            if cat == 'WESTERN':
                                key = lambda value: re.sub(r'(?i)(?:\s+CD[0-9]+$|(?<!\w)CD[0-9]+(?!\w)\s?)', '', value).casefold()
                                paths.extend(os.path.join(directory, name) for name in names
                                    if os.path.splitext(name)[1].lower() == '.json'
                                    and key(os.path.splitext(name)[0]) == key(stem))
                            else:
                                token = stem.split(' ', 1)[0]
                                if len(token) >= 3 and token[-3:-1] == 'cd':
                                    token = token[:-3].strip(' .-')
                                path = next((os.path.join(directory, name) for name in names
                                    if name.casefold() == (token + '.json').casefold()), None)
                                if path: paths.append(path)
                    except pmh_core.JsonSidecarError as exc:
                        task.log(f"❌ JSON 디렉터리 조회 실패 · id={item['id']} · {exc}")
                        advance_scan()
                        continue
                    paths = list(dict.fromkeys(paths))
                    target_json_path = paths[0] if paths else None
                    queue_entry = {
                        'id': item['id'], 'section_name': item['section_name'], 'db_title': db_title,
                        'target_code': target_code, 'raw_path': fpath, 'guid': guid,
                        'target_json_path': target_json_path, 'target_json_paths': paths,
                        '_raw_db_pid': target_code.lower(), '_raw_sec_id': str(item.get('section_id', ''))
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

            except (FfApiError, pmh_core.JsonSidecarError) as exc:
                task.log(f'❌ 메타데이터 검사 실패: {exc}')
                task.update_state('error')
                return

        # LLM (Ollama) 번역 메타데이터 검증
        elif mode == "llm_translation":
            for item in inspected(all_items):
                if task.is_cancelled(): break
                
                files_raw = item.get('all_files')
                if not files_raw: continue
                
                fpath = files_raw.split('|||')[0]
                dir_name = os.path.dirname(fpath)
                
                db_title = item.get('title', '').strip()
                match = re.match(r'^\[([A-Za-z0-9\-_]+)\]', db_title)
                
                path = None
                resolved = {'paths': []}
                try:
                    resolved = scan_sidecars(item)
                    if not extract_sjva_code_and_cat(item.get('guid'))[0]:
                        continue
                    target_json = None
                    reason = 'JSON 메타 파일 없음' if not resolved['paths'] else ''
                    for path in resolved['paths']:
                        target_json = path
                        with open(path, 'r', encoding='utf-8') as stream: json_data = json.load(stream)
                        if not isinstance(json_data, dict): raise ValueError('JSON 객체가 아닙니다.')
                        extra = json_data.get('extra_info') or {}
                        if not isinstance(extra, dict): raise ValueError('extra_info 객체가 아닙니다.')
                        ai_trans = str(extra.get('ai_translator', ''))
                        if 'ollama' not in ai_trans.lower():
                            reason = f"구버전/일반 번역 ({ai_trans or '기본값'})"
                            break
                    if reason:
                        result_data.append(dict(id=item['id'], section_name=item['section_name'], title=db_title,
                            reason=reason, op_action='match', _target_json=target_json, raw_path=fpath))
                except (ValueError, TypeError, UnicodeError):
                    result_data.append(dict(id=item['id'], section_name=item['section_name'], title=db_title,
                        reason='JSON 파싱 오류 (구조 손상)', op_action='match', _target_json=path, raw_path=fpath))
                except OSError as exc:
                    task.log(f"❌ JSON 읽기 실패 · id={item['id']} · {exc}")

        # 파일명 처리 오류 (Prefix vs 대괄호 속성 불일치)
        elif mode == "file_error":
            for item in inspected(all_items):
                if task.is_cancelled(): break
                
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
            last_settings_log = time.monotonic()
            for candidate_index, item in enumerate(all_items, 1):
                if task.is_cancelled(): break
                now = time.monotonic()
                if now - last_settings_log >= 3:
                    task.log(f'AV 프리뷰 설정 {candidate_index - 1:,}/{total_items:,} · 검사 {completed_items:,}/{total_items:,} · FF 대기 {len(eligible):,}건')
                    last_settings_log = now
                code, category = extract_sjva_code_and_cat(item.get('guid'))
                if not code:
                    advance_scan()
                    continue
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
                    advance_scan()
                    continue
                if not gate['auto_create_preview'] and not task_data.get('preview_try_trailer', False):
                    excluded[category + ' 허용된 작업 없음'] += 1
                    advance_scan()
                    continue
                eligible.append(item)
            # Observe the existing iterator's category/100-row boundaries without changing requests.
            category_counts = defaultdict(int)
            for item in eligible:
                category_counts[extract_sjva_code_and_cat(item.get('guid'))[1]] += 1
            chunk_sizes = [min(100, count - start) for count in category_counts.values()
                           for start in range(0, count, 100)]

            def preview_entities():
                nonlocal last_progress_log
                entities = iter_ff_plex_entities(eligible, cfg, task.is_cancelled)
                for chunk_index, chunk_size in enumerate(chunk_sizes, 1):
                    if task.is_cancelled(): return
                    task.update_state('running', progress=completed_items, total=total_items)
                    if chunk_index == 1:
                        task.log('AV 프리뷰 FF 조회 대기 중')
                        last_progress_log = time.monotonic()
                    for _ in range(chunk_size):
                        try:
                            entity_row = next(entities)
                        except StopIteration:
                            return
                        yield entity_row
                    task.update_state('running', progress=completed_items, total=total_items)
                    now = time.monotonic()
                    if now - last_progress_log >= 3:
                        task.log(f'AV 프리뷰 검사 {completed_items:,}/{total_items:,} · FF {chunk_index}/{len(chunk_sizes)}청크 · 검출 {len(result_data):,}건')
                        last_progress_log = now

            try:
                for item, code, category, entity in inspected(preview_entities()):
                    if task.is_cancelled(): break
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
        exclusion_suffix = ''
        if mode == 'preview_clip' and excluded:
            exclusion_suffix = ' · 제외 ' + ', '.join(f'{reason} {count}건' for reason, count in excluded.items())

        if action == 'preview':
            task.update_state('completed', total_items, total_items)
            if len(result_data) > 0:
                stats_summary = []
                if mode == "json_diff" and json_diff_stats:
                    top_stats = sorted(json_diff_stats.items(), key=lambda x: x[1], reverse=True)[:5]
                    stats_summary = [f"{k}: {v:,}건" for k, v in top_stats]

                detail_log_suffix = f" (세부: {', '.join(stats_summary)})" if stats_summary else ""
                task.log(f"✅ 조회 완료 · 검출 {len(result_data):,}건{detail_log_suffix}{exclusion_suffix}")
            else:
                task.log(f"✅ 조회 완료 · 검출 0건 (조치할 대상 없음){exclusion_suffix}")
            return
        else:
            if len(result_data) == 0:
                task.update_state('completed', progress=total_items, total=total_items)
                task.log(f"✅ [자동 실행] 조치(복구)가 필요한 항목이 없어 작업을 종료합니다.{exclusion_suffix}")
                return
            
            action = 'execute'
            task_data['action_type'] = 'execute'
            task_data['_use_cache_db'] = True
            task_data['total'] = len(result_data)
            task_data['_resume_start_index'] = 0
            task.log(f"✅ [자동 실행] 조회 {total_items:,}건 완료 → 실행 대상 {len(result_data):,}건. 복구 작업을 시작합니다.{exclusion_suffix}")


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

    failed_items = 0
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

                if mode == 'json_diff': op_action = 'match'
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
                    if op_action == 'make_preview': ff_snapshot_targets(plex_item, core_api['config'])
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
                    success, msg, score = apply_ff_to_plex(plex, plex_item, latest, task_data, core_api)
                    if task.is_cancelled():
                        break
                    task.log(f'  -> {"✅" if success else "❌"} Plex 반영: {msg}')
                    item_has_error = not success

                if op_action == 'match':
                    if mode == 'llm_translation': ff_snapshot_targets(plex_item, core_api['config'])
                    do_unm = task_data.get('opt_unmatch_first', True)
                    skip_sim = task_data.get('opt_skip_sim_check', False)
                    manual_m = task_data.get('opt_manual_match', False)
                    use_custom = task_data.get('opt_use_custom_score', False)
                    custom_score = task_data.get('opt_custom_agent_score', 95)
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
                        cancel_checker=task.is_cancelled,
                        require_json_cleanup=(mode == 'json_diff')
                    )
                    
                    if success:
                        task.log(f"  -> ✅ 매칭 처리 완료: {msg}{reason_suffix}")
                    else:
                        task.log(f"  -> ❌ 매칭 실패/반려: {msg}")
                        item_has_error = True

                if item_has_error:
                    failed_items += 1
                    core_api['cache'].mark_as_error('id', item_id)
                else: core_api['cache'].mark_keys_as_done('id', [item_id])

            except FfApiError as e:
                failed_items += 1
                detail = redact_ff_value(str(e), core_api['config'].get('mate_apikey'))
                task.log(f"  -> ❌ FF/API 오류: {' '.join(detail.split())}")
                core_api['cache'].mark_as_error('id', item_id)
            except Exception as e:
                failed_items += 1
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
                if failed_items:
                    task.log(f"단일 실행 종료 · 실패 {failed_items}건 (소요시간: {elapsed_str})")
                else:
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
