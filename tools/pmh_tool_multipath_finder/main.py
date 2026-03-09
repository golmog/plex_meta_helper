import sqlite3
import unicodedata
import os
import re

def is_season_folder(folder_name):
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

def get_ui(db_path):
    sections = [{"value": "all", "text": "전체 라이브러리 (All)"}]
    try:
        conn = sqlite3.connect(f'file:{db_path}?mode=ro', uri=True)
        cursor = conn.cursor()
        cursor.execute("SELECT id, name FROM library_sections ORDER BY name")
        for r in cursor.fetchall():
            sections.append({"value": str(r[0]), "text": r[1]})
        conn.close()
    except Exception as e:
        pass

    return {
        "title": "다중 경로(병합 오류 의심) 항목 검색기",
        "description": "서로 다른 폴더 경로를 가진 파일들이 하나의 메타(쇼/영화)로 병합된 항목을 찾습니다.",
        "inputs": [
            {"id": "target_section", "type": "select", "label": "검사할 라이브러리 섹션", "options": sections},
            {"id": "items_per_page", "type": "select", "label": "페이지당 출력 개수", "options": [
                {"value": "10", "text": "10개씩 보기"},
                {"value": "20", "text": "20개씩 보기"},
                {"value": "30", "text": "30개씩 보기"},
                {"value": "50", "text": "50개씩 보기"}
            ]}
        ],
        "button_text": "다중 경로 항목 검색"
    }

def run(data, db_path):
    section_id = data.get('target_section', 'all')
    
    # 파일이 2개 이상 묶여 있는 잠재적 대상(쇼, 영화)을 가져옵니다.
    query = """
        SELECT mi.id, mi.metadata_type, mi.title, ls.name AS section_name, ls.id AS sec_id
        FROM metadata_items mi
        JOIN library_sections ls ON mi.library_section_id = ls.id
        WHERE (? = 'all' OR ls.id = ?) AND mi.metadata_type IN (1, 2)
    """
    
    results = []
    try:
        conn = sqlite3.connect(f'file:{db_path}?mode=ro', uri=True)
        cursor = conn.cursor()
        cursor.execute(query, (section_id, section_id))
        candidates = cursor.fetchall()
        
        for rk_id, m_type, title, sec_name, sec_id in candidates:
            root_paths = set()
            
            # 영화 (Type 1)
            if m_type == 1:
                cursor.execute("""
                    SELECT mp.file FROM media_items m 
                    JOIN media_parts mp ON mp.media_item_id = m.id 
                    WHERE m.metadata_item_id = ?
                """, (rk_id,))
                for row in cursor.fetchall():
                    if row and row[0]:
                        raw_file = unicodedata.normalize('NFC', row[0])
                        root_paths.add(get_unique_root_path(raw_file))
            
            # TV 쇼 (Type 2 - 에피소드까지 깊게 탐색)
            elif m_type == 2:
                cursor.execute("""
                    SELECT mp.file FROM metadata_items ep 
                    JOIN metadata_items sea ON ep.parent_id = sea.id 
                    JOIN media_items m ON m.metadata_item_id = ep.id 
                    JOIN media_parts mp ON mp.media_item_id = m.id 
                    WHERE sea.parent_id = ? AND ep.metadata_type = 4
                """, (rk_id,))
                for row in cursor.fetchall():
                    if row and row[0]:
                        raw_file = unicodedata.normalize('NFC', row[0])
                        root_paths.add(get_unique_root_path(raw_file))

            # 루트 경로가 서로 다른 2개 이상이 묶여있다면 "병합 의심"
            if len(root_paths) > 1:
                results.append({
                    "section": sec_name,
                    "title": title,
                    "rating_key": str(rk_id),
                    # 화면에 보여질 HTML 텍스트 (단위 '개' 제거)
                    "count": f"<span style='color:#e5a00d; font-weight:bold;'>{len(root_paths)}</span>",
                    # 정렬을 위해 사용할 순수 숫자 데이터
                    "raw_count": len(root_paths)
                })
        conn.close()
    except Exception as e:
        return {"status": "error", "message": f"DB 검색 중 오류: {str(e)}"}, 500
        
    return {
        "status": "success",
        "type": "datatable",
        "default_sort": [
            {"key": "section", "dir": "asc"},
            {"key": "title", "dir": "asc"}
        ],
        "columns": [
            {"key": "section", "label": "섹션", "width": "25%", "align": "left", "header_align": "center", "sortable": True},
            {"key": "title", "label": "제목 (클릭 시 이동)", "width": "60%", "align": "left", "header_align": "center", "sortable": True},
            {"key": "count", "label": "병합 수", "width": "15%", "align": "center", "header_align": "center", "sortable": True, "sort_key": "raw_count", "sort_type": "number"}
        ],
        "data": results
    }, 200
