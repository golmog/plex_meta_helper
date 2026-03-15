# -*- coding: utf-8 -*-
"""
====================================================================================
 [PMH Tool Reference Template] - 다중 경로(병합 오류 의심) 항목 검색
====================================================================================
"""

import os
import re
import time
import unicodedata
from collections import defaultdict

# =====================================================================
# 디스코드 알림 기본 템플릿
# =====================================================================
DEFAULT_DISCORD_TEMPLATE = """**🔍 다중 경로(병합 오류 의심) 검색 결과**

**[📊 검색 요약]**
- 의심 항목 발견: {total} 건
- 소요 시간: {elapsed_time}

웹 UI에서 상세 목록을 확인하고 분할(Split) 조치를 취해주세요.
"""

# =====================================================================
# 도우미 함수
# =====================================================================
def is_season_folder(folder_name):
    """폴더명이 시즌(Season) 폴더인지 판별합니다."""
    name_lower = unicodedata.normalize('NFC', folder_name).lower().strip()
    if re.match(r'^(season|시즌|series|s)\s*\d+\b', name_lower): return True
    if re.match(r'^(specials?|스페셜|extras?|특집|ova|ost)(\s*\d+)?$', name_lower): return True
    if name_lower.isdigit(): return True
    return False

def get_unique_root_path(raw_file):
    """파일 경로를 받아, 시즌 폴더 등을 무시한 진짜 최상위(루트) 쇼/영화 폴더 경로를 반환합니다."""
    dir_path = os.path.dirname(raw_file)
    while True:
        base_name = os.path.basename(dir_path)
        if not base_name: break
        if is_season_folder(base_name):
            parent_path = os.path.dirname(dir_path)
            if parent_path == dir_path: break
            dir_path = parent_path
        else:
            break
    return os.path.normpath(dir_path).replace('\\', '/').lower()

# =====================================================================
# 1. UI 스키마 정의
# =====================================================================
def get_ui(core_api):
    sections = [{"value": "all", "text": "전체 라이브러리 (All)"}]
    try:
        rows = core_api['query']("SELECT id, name FROM library_sections ORDER BY name")
        for r in rows:
            sections.append({"value": str(r['id']), "text": r['name']})
    except Exception: pass

    return {
        "title": "다중 경로(병합 오류 의심) 항목 검색",
        "description": "서로 다른 폴더 경로를 가진 파일들이 하나의 메타로 잘못 병합된 항목을 찾습니다.<br>(주의: 이 툴은 데이터 변경을 수행하지 않는 조회 전용 툴입니다.)",
        "inputs": [
            {"id": "target_sections", "type": "multi_select", "label": "검사할 라이브러리 선택", "options": sections, "default": "all"}
        ],
        "settings_inputs": [
            {"id": "s_h_cron", "type": "header", "label": "<i class='fas fa-clock'></i> 자동 실행 스케줄러"},
            {"id": "cron_enable", "type": "checkbox", "label": "크론탭 기반 자동 실행 활성화 (캐시 자동 갱신용)", "default": False},
            {"id": "cron_expr", "type": "cron", "label": "크론탭 시간 설정 (분 시 일 월 요일)", "placeholder": "0 4 * * * ※숫자만 허용"},

            {"id": "s_h2", "type": "header", "label": "<i class='fab fa-discord'></i> 알림 설정"},
            {"id": "discord_enable", "type": "checkbox", "label": "자동 실행 완료 시 디스코드 알림 발송", "default": True},
            {"id": "discord_webhook", "type": "text", "label": "툴 전용 웹훅 URL (비워두면 서버 전역 설정 사용)", "placeholder": "https://discord.com/api/webhooks/..."},
            
            {"id": "discord_bot_name", "type": "text", "label": "디스코드 봇 이름 오버라이딩", "placeholder": "예: {server_name} 탐지기 (템플릿 변수 사용 가능)"},
            {"id": "discord_avatar_url", "type": "text", "label": "디스코드 봇 프로필 이미지 URL", "placeholder": "https://.../icon.png"},
            
            {"id": "discord_template", "type": "textarea", "label": "본문 메시지 템플릿 편집", "height": 130, "default": DEFAULT_DISCORD_TEMPLATE,
             "template_vars": [
                 {"key": "total", "desc": "발견된 다중 경로 의심 항목 수"},
                 {"key": "elapsed_time", "desc": "검색 소요 시간 (예: 15초)"}
             ]},
             
            {"id": "discord_template_footer", "type": "textarea", "label": "푸터(Footer) 템플릿 편집", "height": 50, "default": "Plex Meta Helper - {tool_id} | {server_name}", 
             "template_vars": [
                 {"key": "tool_id", "desc": "실행된 툴의 고유 ID (어느 곳에서나 사용 가능)"},
                 {"key": "server_id", "desc": "실행 대상 서버 식별자 앞 8자리 (어느 곳에서나 사용 가능)"},
                 {"key": "server_name", "desc": "사용자가 설정한 서버 이름 (어느 곳에서나 사용 가능)"},
                 {"key": "date", "desc": "현재 날짜 YYYY-MM-DD (어느 곳에서나 사용 가능)"},
                 {"key": "time", "desc": "현재 시간 HH:MM:SS (어느 곳에서나 사용 가능)"}
             ]}
        ],
        "buttons": [
            {
                "label": "대상 목록 검색", 
                "action_type": "preview", 
                "icon": "fas fa-search", 
                "color": "#2f96b4"
            }
        ]
    }

# =====================================================================
# 2. 메인 실행 라우터 (읽기 전용 툴 최적화)
# =====================================================================
def run(data, core_api):
    action = data.get('action_type', 'preview')

    # 프론트엔드 버튼 클릭 또는 크론에서 넘어오는 요청 모두 동일하게 처리
    if action in ['preview', 'execute']:
        task_data = data.copy()
        
        # 검색(조회)이 끝나면 모니터 탭에서 폼(표) 탭으로 자동 복귀하도록 플래그 셋팅
        task_data['_auto_refresh_ui'] = True 
        
        return {"status": "success", "type": "async_task", "task_data": task_data}, 200

    return {"status": "error", "message": f"지원하지 않는 명령입니다 ({action})"}, 400

# =====================================================================
# 3. 백그라운드 워커 (단일 쿼리 최적화)
# =====================================================================
def worker(task_data, core_api, start_index):
    task = core_api['task']
    is_cron = task_data.get('_is_cron', False)
    target_sections = task_data.get('target_sections', [])
    work_start_time = time.time()
    
    prefix = "[자동 실행] " if is_cron else ""
    task.log(f"🔍 {prefix}다중 경로(병합 오류 의심) 검색을 시작합니다...")
    task.update_state('running', progress=0, total=100)
    
    items_map = defaultdict(lambda: {"title": "", "section": "", "paths": set()})
    
    try:
        # -----------------------------------------------------------------
        # STEP 1: 대상 라이브러리 정보 수집
        # -----------------------------------------------------------------
        sec_query = "SELECT id, name, section_type FROM library_sections"
        sec_params = []
        
        if target_sections and 'all' not in target_sections:
            placeholders = ",".join("?" for _ in target_sections)
            sec_query += f" WHERE id IN ({placeholders})"
            sec_params.extend(target_sections)
        
        target_libs = core_api['query'](sec_query, tuple(sec_params))
        if not target_libs:
            task.log("⚠️ 검색할 대상 섹션이 없습니다.")
            task.update_state('completed', progress=100, total=100)
            return
            
        lib_map = {str(r['id']): r['name'] for r in target_libs}
        movie_lib_ids = [str(r['id']) for r in target_libs if r['section_type'] == 1]
        show_lib_ids = [str(r['id']) for r in target_libs if r['section_type'] == 2]

        # -----------------------------------------------------------------
        # STEP 2: 단일 쿼리로 영화 라이브러리 일괄 조회
        # -----------------------------------------------------------------
        if movie_lib_ids:
            task.log("🎬 영화 라이브러리 파일 경로를 분석 중입니다...")
            task.update_state('running', progress=30, total=100)
            if task.is_cancelled(): return
            
            m_ids_str = ",".join(movie_lib_ids)
            m_query = f"""
                SELECT mi.id, mi.title, mp.file, mi.library_section_id
                FROM metadata_items mi
                JOIN media_items m ON m.metadata_item_id = mi.id
                JOIN media_parts mp ON mp.media_item_id = m.id
                WHERE mi.library_section_id IN ({m_ids_str}) AND mi.metadata_type = 1
            """
            for row in core_api['query'](m_query):
                rk = row['id']
                items_map[rk]['title'] = row['title']
                items_map[rk]['section'] = lib_map.get(str(row['library_section_id']), 'Unknown')
                if row.get('file'): 
                    items_map[rk]['paths'].add(get_unique_root_path(unicodedata.normalize('NFC', row['file'])))

        # -----------------------------------------------------------------
        # STEP 3: 단일 쿼리로 TV 쇼 라이브러리 일괄 조회
        # -----------------------------------------------------------------
        if show_lib_ids:
            task.log("📺 TV 쇼 라이브러리 파일 경로를 분석 중입니다...")
            task.update_state('running', progress=60, total=100)
            if task.is_cancelled(): return
            
            s_ids_str = ",".join(show_lib_ids)
            s_query = f"""
                SELECT show.id, show.title, mp.file, show.library_section_id
                FROM metadata_items show
                JOIN metadata_items season ON season.parent_id = show.id
                JOIN metadata_items ep ON ep.parent_id = season.id
                JOIN media_items m ON m.metadata_item_id = ep.id
                JOIN media_parts mp ON mp.media_item_id = m.id
                WHERE show.library_section_id IN ({s_ids_str}) AND show.metadata_type = 2 AND ep.metadata_type = 4
            """
            for row in core_api['query'](s_query):
                rk = row['id']
                items_map[rk]['title'] = row['title']
                items_map[rk]['section'] = lib_map.get(str(row['library_section_id']), 'Unknown')
                if row.get('file'): 
                    items_map[rk]['paths'].add(get_unique_root_path(unicodedata.normalize('NFC', row['file'])))

        # -----------------------------------------------------------------
        # STEP 4: 다중 경로 항목 필터링 및 데이터 가공
        # -----------------------------------------------------------------
        task.update_state('running', progress=90, total=100)
        task.log("📊 데이터 수집 완료. 병합 오류 의심 항목을 필터링합니다...")

        results = []
        for rk_id, data_dict in items_map.items():
            path_count = len(data_dict['paths'])
            if path_count > 1:
                results.append({
                    "rating_key": str(rk_id), 
                    "section": data_dict['section'], 
                    "title": data_dict['title'],
                    "count_html": f"<span style='color:#e5a00d; font-weight:bold;'>{path_count}</span>", 
                    "raw_count": path_count
                })

        sort_rules = [
            {"key": "section", "dir": "asc"},
            {"key": "raw_count", "dir": "desc"},
            {"key": "title", "dir": "asc"}
        ]

        task.update_state('completed', progress=100, total=100)
        
        elapsed_sec = int(time.time() - work_start_time)
        elapsed_str = f"{elapsed_sec // 60}분 {elapsed_sec % 60}초" if elapsed_sec >= 60 else f"{elapsed_sec}초"
        
        if len(results) > 0:
            task.log(f"✅ 검색 완료! 총 {len(results):,}건의 의심 항목이 발견되었습니다. (잠시 후 결과 화면으로 돌아갑니다...)")
        else:
            task.log(f"✅ 라이브러리 검사 완료. 의심되는 항목이 없습니다! (소요시간: {elapsed_str})")
        
        # 크론(스케줄러)인 경우에만 디스코드 알림 발송 (UI 사용자가 켰을 때는 스킵 가능)
        if is_cron:
            tool_vars = {
                "total": f"{len(results):,}",
                "elapsed_time": elapsed_str
            }
            core_api['notify']("다중 경로 검색 (자동)", DEFAULT_DISCORD_TEMPLATE, "#e5a00d", tool_vars)
        
        # =========================================================================
        # [프론트엔드 반환 포맷: Datatable Schema]
        # =========================================================================
        res_payload = {
            "status": "success", "type": "datatable",
            "summary_cards": [
                {"label": "병합 오류 의심 항목", "value": f"{len(results):,} 건", "icon": "fas fa-copy", "color": "#e5a00d"}
            ] if results else [],
            "default_sort": sort_rules,
            "columns": [
                {"key": "section", "label": "섹션", "width": "25%", "align": "left", "header_align": "center", "sortable": True},
                {"key": "title", "label": "제목 (클릭 시 상세 이동)", "width": "60%", "align": "left", "header_align": "center", "sortable": True, "type": "link", "link_key": "rating_key"},
                {"key": "count_html", "label": "병합 수", "width": "15%", "align": "center", "header_align": "center", "sortable": True, "sort_key": "raw_count", "sort_type": "number"}
            ],
            "data": results,
            # 조회 전용이므로 실행(execute)이 아닌 다시 조회(preview) 버튼으로 매핑
            "action_button": {"label": "<i class='fas fa-sync'></i> 목록 다시 검색", "payload": {"action_type": "preview"}} if results else None
        }
        
        # 캐시에 저장하면 프론트엔드가 이를 읽어 화면에 표시
        core_api['cache'].save(res_payload)
        
    except Exception as e:
        task.log(f"❌ 처리 중 오류 발생: {str(e)}")
        task.update_state('error')
        return
