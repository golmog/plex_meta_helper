# -*- coding: utf-8 -*-
"""
[PMH Tool Reference Template] - 다중 경로(병합 오류 의심) 항목 검색

* PMH Tool 아키텍처 핵심 가이드 (데이터테이블 반환형):
1. DB에서 조건에 맞는 데이터를 모두 조회하여 배열 형태로 반환하면, 
   코어와 프론트엔드가 페이징과 정렬을 알아서 처리합니다.
2. 프론트엔드에서 항목의 제목을 클릭했을 때 Plex 상세 페이지로 이동하게 하려면, 
   컬럼 속성에 `type: "link"` 와 `link_key: "데이터_키_이름"` 을 지정해주면 됩니다.
3. 시간이 오래 걸리는 조회 작업의 경우 `task.update_state('running', progress=..., total=...)` 
   를 호출해주면 프론트엔드 모니터링 탭에 파란색 진행률 바가 부드럽게 차오릅니다.
"""

import unicodedata
import os
import re

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
# 1. PMH Tool 표준 인터페이스 (UI 스키마)
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
        "description": "서로 다른 폴더 경로를 가진 파일들이 하나의 메타(쇼/영화)로 병합된 항목을 찾습니다.",
        "inputs": [
            {"id": "target_section", "type": "select", "label": "검사할 라이브러리 섹션", "options": sections}
        ],
        "button_text": "다중 경로 항목 검색"
    }

# =====================================================================
# 2. 메인 실행 및 데이터 추출 로직
# =====================================================================
def run(data, core_api):
    # 페이지/정렬 요청은 코어가 자체적으로 캐시를 읽어 처리하므로 예외를 던집니다.
    action = data.get('action_type', 'preview')
    if action == 'page': 
        return {"status": "error", "message": "데이터테이블 툴은 페이징을 코어가 전담합니다."}, 400

    section_id = data.get('target_section', 'all')
    
    # [Reference] 작업 매니저를 호출하여 프론트엔드 모니터링 탭에 로그를 실시간으로 뿌려줍니다.
    task = core_api['task']
    task.log(f"다중 경로 검색 시작 (대상 섹션: {section_id})")
    
    # 파라미터 바인딩을 사용할 쿼리 작성 (SQLite 인젝션 방지)
    query = """
        SELECT mi.id, mi.metadata_type, mi.title, ls.name AS section_name, ls.id AS sec_id
        FROM metadata_items mi
        JOIN library_sections ls ON mi.library_section_id = ls.id
        WHERE (? = 'all' OR ls.id = ?) AND mi.metadata_type IN (1, 2)
    """
    
    results = []
    try:
        task.log("1. 분석 대상 컨텐츠 목록 수집 중...")
        # 쿼리에 들어갈 ? 값을 튜플로 전달
        candidates = core_api['query'](query, (section_id, section_id))
        total_candidates = len(candidates)
        
        # [Reference] 프론트엔드 진행률 바(Progress Bar)를 활성화하기 위해 전체 개수를 셋팅
        task.update_state('running', total=total_candidates)
        task.log(f"2. 총 {total_candidates:,}개의 컨텐츠 내부 파일 경로 분석 중...")
        
        for idx, candidate in enumerate(candidates, 1):
            
            # [Reference] 1,000건 단위로 텍스트 로그 출력 (프론트엔드 화면에 스크롤 됨)
            if idx % 1000 == 0:
                task.log(f"   -> {idx:,} / {total_candidates:,} 건 분석 완료...")
                
            # [Reference] 100건 단위로 진행률 게이지(퍼센트) 업데이트
            if idx % 100 == 0:
                task.update_state('running', progress=idx)
                
            rk_id = candidate['id']
            m_type = candidate['metadata_type']
            title = candidate['title']
            sec_name = candidate['section_name']
            
            root_paths = set()
            
            # 영화 (Type 1)
            if m_type == 1:
                files = core_api['query']("""
                    SELECT mp.file FROM media_items m 
                    JOIN media_parts mp ON mp.media_item_id = m.id 
                    WHERE m.metadata_item_id = ?
                """, (rk_id,))
                
                for row in files:
                    if row.get('file'):
                        raw_file = unicodedata.normalize('NFC', row['file'])
                        root_paths.add(get_unique_root_path(raw_file))
            
            # TV 쇼 (Type 2 - 하위 에피소드까지 탐색)
            elif m_type == 2:
                files = core_api['query']("""
                    SELECT mp.file FROM metadata_items ep 
                    JOIN metadata_items sea ON ep.parent_id = sea.id 
                    JOIN media_items m ON m.metadata_item_id = ep.id 
                    JOIN media_parts mp ON mp.media_item_id = m.id 
                    WHERE sea.parent_id = ? AND ep.metadata_type = 4
                """, (rk_id,))
                
                for row in files:
                    if row.get('file'):
                        raw_file = unicodedata.normalize('NFC', row['file'])
                        root_paths.add(get_unique_root_path(raw_file))

            # 루트 경로가 서로 다른 2개 이상이 묶여있다면 "병합 의심 항목"으로 추가
            if len(root_paths) > 1:
                results.append({
                    "section": sec_name,
                    "title": title,
                    "rating_key": str(rk_id),
                    # 화면에 보여질 HTML 텍스트 서식
                    "count": f"<span style='color:#e5a00d; font-weight:bold;'>{len(root_paths)}</span>",
                    # 테이블 정렬(오름/내림차순)을 위해 사용할 순수 숫자 데이터
                    "raw_count": len(root_paths)
                })
        
        # 마지막으로 진행률 바를 100%로 꽉 채워줍니다.
        task.update_state('running', progress=total_candidates)
        task.log(f"검색 완료! {len(results):,}건의 의심 항목을 찾았습니다.")
        
    except Exception as e:
        task.log(f"DB 검색 중 오류: {str(e)}")
        return {"status": "error", "message": f"DB 검색 중 오류: {str(e)}"}, 500
        
    # =========================================================================
    # [프론트엔드 반환 포맷: Datatable Schema]
    # =========================================================================
    return {
        "status": "success",
        "type": "datatable",
        "default_sort": [
            {"key": "section", "dir": "asc"},
            {"key": "title", "dir": "asc"}
        ],
        "columns": [
            {"key": "section", "label": "섹션", "width": "25%", "align": "left", "header_align": "center", "sortable": True},
            
            # [Reference] 프론트엔드가 클릭 가능한 링크를 생성하도록 type을 "link"로 지정하고 
            # 데이터 배열 안의 rating_key 값을 참조하도록 link_key 매핑
            {"key": "title", "label": "제목 (클릭 시 이동)", "width": "60%", "align": "left", "header_align": "center", "sortable": True, "type": "link", "link_key": "rating_key"},
            
            # [Reference] 화면에 보여주는 데이터와 정렬용 데이터를 분리
            {"key": "count", "label": "병합 수", "width": "15%", "align": "center", "header_align": "center", "sortable": True, "sort_key": "raw_count", "sort_type": "number"}
        ],
        "data": results
    }, 200
