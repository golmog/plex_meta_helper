# -*- coding: utf-8 -*-
"""
====================================================================================
 [PMH Tool Reference Template] - 다중 경로(병합 오류 의심) 항목 검색
====================================================================================

 이 파일은 PMH(Plex Meta Helper) 커스텀 툴을 개발하기 위한 교과서/레퍼런스 파일입니다.
 툴 개발 시 아래의 핵심 아키텍처 규칙을 숙지하세요.

 1. [실행 흐름]
    - 프론트엔드 UI에서 [조회] 버튼 클릭 -> 백엔드로 `action_type: 'preview'` 요청 전달.
    - 코어(`pmh_core.py`)가 이 요청을 가로채어 백그라운드 스레드를 생성하고 이 파일의 `run()`을 실행합니다.
    - `run()` 함수는 무거운 작업을 수행하며 `task.log()`로 진행 상황을 실시간으로 브로드캐스트합니다.
    - 작업이 끝나고 전체 데이터 배열을 반환하면, 코어가 알아서 SQLite 메모리에 캐싱하고 정렬을 적용합니다.
    - 프론트엔드는 캐시된 데이터를 코어에 10개/20개 단위로 페이징(Paging) 요청하여 화면에 그립니다.

 2. [DB 쿼리 최적화 (N+1 문제 주의)]
    - `core_api['query']`는 보안을 위해 호출 시마다 DB 커넥션을 열고 닫는 읽기 전용(SELECT) 샌드박스입니다.
    - 루프(for문) 안에서 쿼리를 수만 번 호출하면 속도가 매우 느려집니다!
    - 따라서, JOIN 문을 활용하여 한 번의 쿼리로 데이터를 대량으로 가져와 파이썬 딕셔너리로 가공하는 것이 정석입니다.

 3. [데이터테이블 반환]
    - 반환 딕셔너리의 `type`을 `"datatable"`로 지정하면 코어와 프론트엔드가 알아서 표(Table) UI를 그려줍니다.
====================================================================================
"""

import os
import re
import time
import unicodedata
import json
from collections import defaultdict

class SafeDict(dict):
    def __missing__(self, key): return '{' + key + '}'

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
            {"id": "discord_bot_name", "type": "text", "label": "디스코드 봇 이름 오버라이딩", "placeholder": "예: PMH 다중경로 탐지기"},
            {"id": "discord_avatar_url", "type": "text", "label": "디스코드 봇 프로필 이미지 URL", "placeholder": "https://.../icon.png"},
            {"id": "discord_template", "type": "textarea", "label": "알림 메시지 템플릿 편집", "default": DEFAULT_DISCORD_TEMPLATE}
        ],
        "button_text": "다중 경로 항목 검색"
    }

# =====================================================================
# 2. 메인 실행 라우터 (읽기 전용 툴 최적화)
# =====================================================================
def run(data, core_api):
    # 조회 전용 툴이므로 preview든 execute이든 동일하게 최신 데이터로 목록을 갱신합니다.
    task_data = data.copy()
    task_data['_is_preview_tool'] = True 
    return {"status": "success", "type": "async_task", "task_data": task_data}, 200

# =====================================================================
# 3. 백그라운드 워커 (단일 쿼리 최적화)
# =====================================================================
def worker(task_data, core_api, start_index):
    task = core_api['task']
    is_cron = task_data.get('_is_cron', False)
    target_sections = task_data.get('target_sections', [])
    work_start_time = time.time()
    
    prefix = "[자동 실행] " if is_cron else ""
    task.log(f"{prefix}다중 경로 검색 시작")
    task.update_state('running', progress=0, total=100)
    
    items_map = defaultdict(lambda: {"title": "", "section": "", "paths": set()})
    
    try:
        # -----------------------------------------------------------------
        # STEP 1: 대상 라이브러리 정보 수집
        # -----------------------------------------------------------------
        sec_query = "SELECT id, name, section_type FROM library_sections"
        sec_params = []
        
        # 'all' 방어 코드 적용
        if target_sections and 'all' not in target_sections:
            placeholders = ",".join("?" for _ in target_sections)
            sec_query += f" WHERE id IN ({placeholders})"
            sec_params.extend(target_sections)
        
        target_libs = core_api['query'](sec_query, tuple(sec_params))
        if not target_libs:
            task.log("검색할 대상 섹션이 없습니다.")
            task.update_state('completed', progress=100, total=100)
            return
            
        # 섹션 타입별로 ID 분리 및 이름 매핑
        lib_map = {str(r['id']): r['name'] for r in target_libs}
        movie_lib_ids = [str(r['id']) for r in target_libs if r['section_type'] == 1]
        show_lib_ids = [str(r['id']) for r in target_libs if r['section_type'] == 2]

        # -----------------------------------------------------------------
        # STEP 2: 단일 쿼리로 영화 라이브러리 일괄 조회
        # -----------------------------------------------------------------
        if movie_lib_ids:
            task.log("영화 라이브러리 파일 경로를 분석 중입니다...")
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
            task.log("TV 쇼 라이브러리 파일 경로를 분석 중입니다...")
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
        task.log("데이터 수집 완료. 병합 오류 의심 항목 필터링 중...")

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

        # ✨ 정렬 삭제 -> 코어 위임
        # 코어가 이 규칙(default_sort)을 보고 DB 삽입 직전에 완벽하게 정렬해줍니다.
        sort_rules = [
            {"key": "section", "dir": "asc"},
            {"key": "raw_count", "dir": "desc"},
            {"key": "title", "dir": "asc"}
        ]

        task.update_state('completed', progress=100, total=100)
        
        elapsed_sec = int(time.time() - work_start_time)
        elapsed_str = f"{elapsed_sec // 60}분 {elapsed_sec % 60}초" if elapsed_sec >= 60 else f"{elapsed_sec}초"
        
        msg = f"검색 완료! 총 {len(results):,}건의 의심 항목이 발견되었습니다. (소요시간: {elapsed_str})"
        task.log(msg)
        
        if is_cron:
            opts = core_api.get('options', {})
            template = opts.get('discord_template', DEFAULT_DISCORD_TEMPLATE)
            discord_msg = template.format_map(SafeDict(
                total=f"{len(results):,}",
                elapsed_time=elapsed_str
            ))
            core_api['notify']("다중 경로 검색 (자동)", discord_msg, "#e5a00d")
        
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
            "action_button": {"label": "<i class='fas fa-sync'></i> 목록 다시 검색", "payload": {"action_type": "execute"}}
        }
        
        # 캐시에 저장하면 프론트엔드가 이를 읽어 화면에 표시합니다.
        core_api['cache'].save(res_payload)
        
    except Exception as e:
        task.log(f"처리 중 오류 발생: {str(e)}")
        task.update_state('error')
        return
