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

import unicodedata
import os
import re
from collections import defaultdict

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
# 1. UI 스키마 정의 (프론트엔드 렌더링용)
# =====================================================================
def get_ui(core_api):
    sections = [{"value": "all", "text": "전체 라이브러리 (All)"}]
    try:
        # 안전한 샌드박스 DB 쿼리 실행 (코어가 제공하는 읽기 전용 쿼리)
        rows = core_api['query']("SELECT id, name FROM library_sections ORDER BY name")
        for r in rows:
            sections.append({"value": str(r['id']), "text": r['name']})
    except Exception:
        pass

    return {
        "title": "다중 경로(병합 오류 의심) 항목 검색",
        "description": "서로 다른 폴더 경로를 가진 파일들이 하나의 메타(쇼/영화)로 잘못 병합된 항목을 찾습니다.",
        "inputs": [
            {"id": "target_section", "type": "select", "label": "검사할 라이브러리 섹션", "options": sections}
        ],
        "button_text": "다중 경로 항목 검색"
    }

# =====================================================================
# 2. 메인 실행 로직 (백그라운드 워커에서 호출됨)
# =====================================================================
def run(data, core_api):
    action = data.get('action_type', 'preview')
    
    # [참고] 데이터테이블의 페이징(page), 리스트 정렬, 캐시 삭제(reset) 등은 코어가 
    # 자동으로 처리하므로, 툴에서는 순수 데이터 추출(preview/execute)만 신경 쓰면 됩니다.
    if action != 'preview': 
        return {"status": "error", "message": "이 툴은 조회(Preview) 전용입니다."}, 400

    section_id = data.get('target_section', 'all')
    task = core_api['task']
    
    task.log(f"다중 경로 검색 시작 (대상 섹션: {section_id})")
    task.update_state('running', progress=0, total=100) # 퍼센트 기반 프로그레스 바 셋팅
    
    # 결과를 모아둘 딕셔너리 (Key: rating_key)
    # N+1 쿼리 문제를 해결하기 위해 데이터를 한 번에 가져와 메모리에서 묶어줍니다.
    items_map = defaultdict(lambda: {"title": "", "section": "", "paths": set()})
    
    try:
        # -----------------------------------------------------------------
        # STEP 1: 영화(Type 1) 라이브러리 분석
        # -----------------------------------------------------------------
        task.log("1. 영화(Movie) 라이브러리 파일 경로를 추출 중입니다...")
        
        movie_query = """
            SELECT mi.id, mi.title, ls.name AS section_name, mp.file
            FROM metadata_items mi
            JOIN library_sections ls ON mi.library_section_id = ls.id
            JOIN media_items m ON m.metadata_item_id = mi.id
            JOIN media_parts mp ON mp.media_item_id = m.id
            WHERE (? = 'all' OR ls.id = ?) AND mi.metadata_type = 1
        """
        movie_rows = core_api['query'](movie_query, (section_id, section_id))
        
        for row in movie_rows:
            if task.is_cancelled(): return {"status": "error", "message": "취소됨"}, 400
            
            rk = row['id']
            items_map[rk]['title'] = row['title']
            items_map[rk]['section'] = row['section_name']
            if row.get('file'):
                raw_file = unicodedata.normalize('NFC', row['file'])
                items_map[rk]['paths'].add(get_unique_root_path(raw_file))

        task.update_state('running', progress=30, total=100)
        
        # -----------------------------------------------------------------
        # STEP 2: TV 쇼(Type 2) 라이브러리 분석
        # -----------------------------------------------------------------
        task.log("2. TV 쇼(Show) 라이브러리의 하위 에피소드 경로를 추출 중입니다...")
        
        # 쇼 -> 시즌 -> 에피소드 -> 미디어 파트로 이어지는 구조를 한 번의 JOIN으로 묶어옵니다.
        show_query = """
            SELECT show.id, show.title, ls.name AS section_name, mp.file
            FROM metadata_items show
            JOIN library_sections ls ON show.library_section_id = ls.id
            JOIN metadata_items season ON season.parent_id = show.id
            JOIN metadata_items ep ON ep.parent_id = season.id
            JOIN media_items m ON m.metadata_item_id = ep.id
            JOIN media_parts mp ON mp.media_item_id = m.id
            WHERE (? = 'all' OR ls.id = ?) AND show.metadata_type = 2 AND ep.metadata_type = 4
        """
        show_rows = core_api['query'](show_query, (section_id, section_id))
        
        for row in show_rows:
            if task.is_cancelled(): return {"status": "error", "message": "취소됨"}, 400
            
            rk = row['id']
            items_map[rk]['title'] = row['title']
            items_map[rk]['section'] = row['section_name']
            if row.get('file'):
                raw_file = unicodedata.normalize('NFC', row['file'])
                items_map[rk]['paths'].add(get_unique_root_path(raw_file))

        task.update_state('running', progress=70, total=100)

        # -----------------------------------------------------------------
        # STEP 3: 다중 경로 (병합 의심) 항목 필터링
        # -----------------------------------------------------------------
        task.log("3. 수집된 데이터를 바탕으로 병합 의심 항목을 필터링합니다...")
        
        results = []
        for rk_id, data_dict in items_map.items():
            path_count = len(data_dict['paths'])
            
            # 한 메타(쇼/영화)에 2개 이상의 서로 다른 최상위 루트 경로가 있다면 병합된 것으로 간주
            if path_count > 1:
                results.append({
                    "rating_key": str(rk_id),
                    "section": data_dict['section'],
                    "title": data_dict['title'],
                    # 화면에 보여질 HTML 텍스트 서식
                    "count_html": f"<span style='color:#e5a00d; font-weight:bold;'>{path_count}</span>",
                    # 테이블 정렬(자연 정렬 적용)을 위해 숨겨진 속성으로 넘길 순수 숫자 데이터
                    "raw_count": path_count
                })

        task.update_state('running', progress=100, total=100)
        task.log(f"검색 완료! 총 {len(results):,}건의 의심 항목을 찾았습니다.")
        
    except Exception as e:
        task.log(f"처리 중 오류 발생: {str(e)}")
        return {"status": "error", "message": f"오류: {str(e)}"}, 500
        
    # =========================================================================
    # [프론트엔드 반환 포맷: Datatable Schema]
    # =========================================================================
    return {
        "status": "success",
        "type": "datatable",
        # 1순위: 섹션(오름차순), 2순위: 제목(오름차순)으로 기본 다중 정렬 (코어가 NATURAL_SORT 처리)
        "default_sort": [
            {"key": "section", "dir": "asc"},
            {"key": "title", "dir": "asc"}
        ],
        "columns": [
            {"key": "section", "label": "섹션", "width": "25%", "align": "left", "header_align": "center", "sortable": True},
            
            # [참고] type: "link" 이고 link_key: "rating_key" 를 주면, 프론트엔드 JS가 알아서
            # 해당 글자를 클릭했을 때 Plex의 상세 정보 페이지로 이동하는 하이퍼링크를 만들어줍니다.
            {"key": "title", "label": "제목 (클릭 시 상세 이동)", "width": "60%", "align": "left", "header_align": "center", "sortable": True, "type": "link", "link_key": "rating_key"},
            
            # [참고] 화면엔 count_html을 보여주되, 헤더 클릭 시 정렬 기준은 raw_count(순수 숫자)를 사용하게 합니다.
            # sort_type을 "number"로 지정하면 문자열이 아닌 숫자 크기로 비교 정렬됩니다.
            {"key": "count_html", "label": "병합 수", "width": "15%", "align": "center", "header_align": "center", "sortable": True, "sort_key": "raw_count", "sort_type": "number"}
        ],
        "data": results
    }, 200
