# -*- coding: utf-8 -*-

import sqlite3
import os
import time
import re
from contextlib import contextmanager

# ==============================================================================
# [코어 모듈 버전]
# ==============================================================================
__version__ = "0.6.27"

def get_version():
    return __version__

@contextmanager
def get_db_connection(db_path):
    if not os.path.exists(db_path):
        raise FileNotFoundError(f"DB File not found: {db_path}")
    conn = None
    try:
        conn = sqlite3.connect(f'file:{db_path}?mode=ro', uri=True, timeout=10.0)
        yield conn
    except sqlite3.OperationalError as e:
        print(f"[DB ERROR] SQLite Operational Error: {str(e)}")
        raise
    except Exception as e:
        print(f"[DB ERROR] Connection failed: {str(e)}")
        raise
    finally:
        if conn:
            conn.close()

def is_season_folder(folder_name):
    name_lower = folder_name.lower().strip()
    if re.match(r'^(season|시즌|series)\s*\d+', name_lower): return True
    if re.match(r'^(specials?|스페셜)$', name_lower): return True
    if name_lower.isdigit(): return True
    return False

def natural_sort_key(s):
    return [int(text) if text.isdigit() else text.lower() for text in re.split(r'(\d+)', str(s))]

def handle_library_batch(data, max_batch_size, db_path):
    start_time = time.time()
    
    if not data or 'ids' not in data:
        print("[BATCH] Rejected: Invalid request format.")
        return {"error": "Invalid request"}, 400
        
    raw_ids = [str(i) for i in data['ids'] if str(i).isdigit()]
    ids = list(set(raw_ids))[:max_batch_size] 
    if not ids: return {}, 200
    
    print(f"[BATCH] Requested {len(ids)} items.")
    placeholders = ','.join('?' for _ in ids)
    try:
        with get_db_connection(db_path) as conn:
            cursor = conn.cursor()
            query = f"""
            SELECT mi.id, m.width,
                (SELECT group_concat(ms.codec || '|' || IFNULL(ms.extra_data, ''), ';;') FROM media_streams ms WHERE ms.media_item_id = m.id AND ms.stream_type_id = 1) as raw_stream_data,
                (SELECT group_concat(ms.id || '|' || IFNULL(ms.language, 'und') || '|' || IFNULL(ms.codec, '') || '|' || IFNULL(ms.url, ''), ';;') FROM media_streams ms WHERE ms.media_item_id = m.id AND ms.stream_type_id = 3) as sub_data,
                mi.guid, mp.file, mp.id
            FROM metadata_items mi
            LEFT JOIN media_items m ON m.metadata_item_id = mi.id
            LEFT JOIN media_parts mp ON mp.media_item_id = m.id
            WHERE mi.id IN ({placeholders}) ORDER BY m.width DESC, m.bitrate DESC
            """
            cursor.execute(query, ids)
            result_map = {}
            for rk, width, raw_data, sub_data, guid, filepath, part_id in cursor.fetchall():
                rk = str(rk)
                if rk not in result_map:
                    clean_guid = guid.split("://")[1].split("?")[0] if guid and "://" in guid else (guid or "")
                    if not filepath:
                        result_map[rk] = { "tags": [], "g": clean_guid, "raw_g": guid or "", "p": "", "part_id": None, "sub_id": "", "sub_url": "" }
                        continue
                    tags, res_tag = [], None
                    width = width if width else 0
                    if width >= 7000: res_tag = "8K"
                    elif width >= 5000: res_tag = "6K"
                    elif width >= 3400: res_tag = "4K"
                    elif width >= 1900: res_tag = "FHD"
                    elif width >= 1200: res_tag = "HD"
                    elif width > 0: res_tag = "SD"
                    
                    hdr_badges = set()
                    if raw_data:
                        raw_upper = raw_data.upper()
                        if 'DOVI' in raw_upper or 'DOLBY' in raw_upper: hdr_badges.add('DV')
                        if 'BT2020' in raw_upper or 'SMPTE2084' in raw_upper or 'HLG' in raw_upper or 'HDR10' in raw_upper: hdr_badges.add('HDR')

                    video_badge = res_tag if res_tag else ""
                    if hdr_badges:
                        sorted_badges = sorted(list(hdr_badges), key=lambda x: 0 if x=='DV' else 1)
                        video_badge = video_badge + " " + "/".join(sorted_badges) if video_badge else "/".join(sorted_badges)
                    if video_badge: tags.append(video_badge)
                    
                    has_sub = False
                    best_sub_id = ""
                    best_sub_url = ""

                    if sub_data:
                        streams = sub_data.split(';;')
                        kor_subs = []
                        for s in streams:
                            parts = s.split('|')
                            if len(parts) >= 4:
                                s_id, s_lang, s_codec, s_url = parts[0], parts[1].lower(), parts[2].lower(), parts[3]
                                if s_lang.startswith('kor') or s_lang.startswith('ko'):
                                    has_sub = True
                                    score = 0
                                    if s_url: score += 100
                                    if s_codec in ['srt', 'ass', 'smi', 'vtt', 'ssa', 'sub']: score += 50
                                    kor_subs.append((score, s_id, s_url))
                        
                        if kor_subs:
                            kor_subs.sort(key=lambda x: x[0], reverse=True)
                            best_sub_id = kor_subs[0][1]
                            best_sub_url = kor_subs[0][2]

                    if has_sub: tags.append("SUB")
                    elif filepath and re.search(r'(?i)(kor-?sub|자체자막)', filepath): tags.append("SUBBED")

                    result_map[rk] = { 
                        "tags": tags, "g": clean_guid, "raw_g": guid or "", 
                        "p": filepath, "part_id": part_id,
                        "sub_id": best_sub_id, "sub_url": best_sub_url 
                    }
        exec_time = time.time() - start_time
        print(f"[BATCH] Successfully processed {len(result_map)} items in {exec_time:.3f}s")
        return result_map, 200
    except Exception as e:
        print(f"[BATCH ERROR] Failed processing batch: {str(e)}")
        return {"error": str(e)}, 500

def handle_media_detail(rating_key, db_path):
    start_time = time.time()
    if not rating_key.isdigit(): 
        print(f"[DETAIL] Rejected: Invalid rating_key ({rating_key})")
        return {"error": "Invalid rating_key"}, 400

    print(f"[DETAIL] Fetching details for Item: {rating_key}")
    try:
        with get_db_connection(db_path) as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT metadata_type, guid, library_section_id FROM metadata_items WHERE id = ?", (rating_key,))
            meta_row = cursor.fetchone()
            if not meta_row: 
                print(f"[DETAIL] Item {rating_key} not found in DB.")
                return {"error": "Item not found"}, 404
            m_type, guid, lib_section_id = meta_row
            
            if m_type in (2, 3):
                folder_paths, seen_paths = [], set()
                if m_type == 2:
                    query = """SELECT mp.file FROM metadata_items ep JOIN metadata_items sea ON ep.parent_id = sea.id JOIN media_items m ON m.metadata_item_id = ep.id JOIN media_parts mp ON mp.media_item_id = m.id WHERE sea.parent_id = ? AND ep.metadata_type = 4 ORDER BY m.width DESC, m.bitrate DESC"""
                    cursor.execute(query, (rating_key,))
                    for row in cursor.fetchall():
                        if row and row[0]:
                            dir_path = os.path.dirname(row[0])
                            if dir_path not in seen_paths:
                                seen_paths.add(dir_path)
                                folder_paths.append(dir_path)
                            if is_season_folder(os.path.basename(dir_path)):
                                parent_path = os.path.dirname(dir_path)
                                if parent_path not in seen_paths:
                                    seen_paths.add(parent_path)
                                    folder_paths.append(parent_path)

                elif m_type == 3:
                    query = """SELECT mp.file FROM metadata_items ep JOIN media_items m ON m.metadata_item_id = ep.id JOIN media_parts mp ON mp.media_item_id = m.id WHERE ep.parent_id = ? AND ep.metadata_type = 4 ORDER BY m.width DESC, m.bitrate DESC"""
                    cursor.execute(query, (rating_key,))
                    for row in cursor.fetchall():
                        if row and row[0]:
                            target_path = os.path.dirname(row[0])
                            if target_path not in seen_paths:
                                seen_paths.add(target_path)
                                folder_paths.append(target_path)

                folder_paths.sort(key=natural_sort_key)
                versions = [{"file": path, "parts": [{"path": path}]} for path in folder_paths]
                exec_time = time.time() - start_time
                print(f"[DETAIL] Directory {rating_key} parsed in {exec_time:.3f}s. Found {len(versions)} paths.")
                return { "type": "directory", "itemId": rating_key, "guid": guid, "duration": None, "librarySectionID": lib_section_id, "versions": versions }, 200

            query_media = """SELECT m.id, m.width, m.height, (SELECT bitrate FROM media_streams WHERE media_item_id = m.id AND stream_type_id = 1 LIMIT 1) as v_bitrate, (SELECT group_concat(ms.codec || '|' || IFNULL(ms.extra_data, ''), ';;') FROM media_streams ms WHERE media_item_id = m.id AND stream_type_id = 1) as raw_stream_data, m.video_codec, m.audio_codec, m.duration, (SELECT channels FROM media_streams WHERE media_item_id = m.id AND stream_type_id = 2 LIMIT 1) as audio_ch, (SELECT bitrate FROM media_streams WHERE media_item_id = m.id AND stream_type_id = 2 LIMIT 1) as a_bitrate, mp.id, mp.file FROM media_items m LEFT JOIN media_parts mp ON mp.media_item_id = m.id WHERE m.metadata_item_id = ? ORDER BY m.width DESC, m.bitrate DESC"""
            cursor.execute(query_media, (rating_key,))
            versions, duration = [], 0
            for row in cursor.fetchall():
                m_id, width, height, v_bitrate, raw_data, v_codec, a_codec, dur, a_ch, a_bitrate, part_id, file_path = row
                if dur: duration = dur
                hdr_badges = set()
                if raw_data:
                    raw_upper = raw_data.upper()
                    if 'DOVI' in raw_upper or 'DOLBY' in raw_upper: hdr_badges.add('DV')
                    if 'BT2020' in raw_upper or 'SMPTE2084' in raw_upper or 'HLG' in raw_upper or 'HDR10' in raw_upper: hdr_badges.add('HDR')
                video_extra = " " + "/".join(sorted(list(hdr_badges), key=lambda x: 0 if x=='DV' else 1)) if hdr_badges else ""

                cursor.execute("SELECT id, language, codec, url FROM media_streams WHERE media_part_id = ? AND stream_type_id = 3", (part_id,))
                subs = [{"id": s[0], "languageCode": (s[1] or "und").lower()[:3], "codec": s[2] or "unknown", "key": s[3], "format": s[2] or "unknown"} for s in cursor.fetchall()]
                versions.append({"part_id": part_id, "file": file_path, "width": width or 0, "v_bitrate": v_bitrate or 0, "video_extra": video_extra, "v_codec": v_codec or "", "a_codec": a_codec or "", "a_ch": a_ch or "", "a_bitrate": a_bitrate or 0, "subs": subs, "parts": [{"id": part_id, "path": file_path}]})
            
            cursor.execute("SELECT text, time_offset, end_time_offset FROM taggings WHERE metadata_item_id = ? AND text IN ('intro', 'credits')", (rating_key,))
            markers = {tag_text: {"start": start_offset, "end": end_offset} for tag_text, start_offset, end_offset in cursor.fetchall() if tag_text and start_offset is not None and end_offset is not None}
                
        exec_time = time.time() - start_time
        print(f"[DETAIL] Video {rating_key} parsed in {exec_time:.3f}s. Found {len(versions)} versions.")
        return { "type": "video", "itemId": rating_key, "guid": guid, "duration": duration, "librarySectionID": lib_section_id, "versions": versions, "markers": markers }, 200
    except Exception as e:
        print(f"[DETAIL ERROR] Failed processing item {rating_key}: {str(e)}")
        return {"error": str(e)}, 500
