-- plex_sync.lua

-- ==================================================================================
-- [0] 핵심: IINA 네트워크 및 꼬임 방지 옵션
-- ==================================================================================
mp.set_property("tls-verify", "no")
mp.set_property("user-agent", "Mozilla/5.0")
mp.set_property("ytdl", "no")
mp.set_property("sub-auto", "no")
mp.set_property("audio-file-auto", "no")
mp.set_property("prefetch-playlist", "no")

mp.set_property("osd-back-color", "#CC000000") 
mp.set_property("osd-border-size", "1")        
mp.set_property("osd-color", "#FFFFFFFF")      

local utils = require 'mp.utils'
local msg = require 'mp.msg'

-- ==================================================================================
-- [1] 사용자 설정
-- ==================================================================================
local AUTO_SKIP_INTRO = false   
local AUTO_NEXT_EPISODE = true  
local COUNTDOWN_SEC = 3         
local REPORT_INTERVAL = 10      
local SEEK_DEBOUNCE_SEC = 0.5   -- 탐색 연타 시 서버 보고를 지연시킬 디바운스 시간 (초)

math.randomseed(os.time() + math.floor(mp.get_time() * 1000))
local random_suffix = tostring(math.random(10000, 99999))

local CLIENT_ID_BASE = "PlexMetaHelper"
local CURRENT_CLIENT_ID = ""

local PLEX_PRODUCT = "MPV"
local PLEX_DEVICE = "Linux"
local PLEX_DEVICE_NAME = "Plex Meta Helper"

-- ==================================================================================
-- [2] 전역 변수
-- ==================================================================================
local PLEX_URL = nil
local PLEX_TOKEN = nil
local ratingKey = nil
local timer = nil
local seek_timer = nil -- 탐색 디바운싱용 타이머
local intro_markers = {}
local credits_markers = {}
local is_counting = false
local countdown_timer = nil
local is_windows = (package.config:sub(1,1) == "\\")

local current_session = 0
local last_time_pos = 0
local last_duration = 0
local intro_notified = false   
local credits_ignored = false  

local current_media_index = 0
local current_part_index = 0
local playing_part_id = nil
local playing_filename = nil

-- ==================================================================================
-- [3] 유틸리티 함수
-- ==================================================================================
function nuke_garbage(str)
    if not str then return "" end
    str = str:gsub("%c", ""):gsub("%s", "")
    while str:match("[%./\\]$") do str = str:gsub("[%./\\]$", "") end
    return str
end

function urldecode(s)
    if not s then return "" end
    s = s:gsub('+', ' ')
    s = s:gsub('%%(%x%x)', function(h) return string.char(tonumber(h, 16)) end)
    return s
end

function urlencode(s)
    if not s then return "" end
    s = s:gsub("\n", "\r\n")
    s = s:gsub("([^%w %-%_%.%~])", function (c) return string.format ("%%%02X", string.byte(c)) end)
    s = s:gsub(" ", "+")
    return s
end

function utf8_from_code(code)
    code = tonumber(code)
    if not code then return "" end
    if code < 128 then return string.char(code) end
    if code < 2048 then return string.char(192 + math.floor(code/64), 128 + (code%64)) end
    if code < 65536 then return string.char(224 + math.floor(code/4096), 128 + math.floor((code%4096)/64), 128 + (code%64)) end
    return ""
end

function decode_xml(str)
    if not str then return "" end
    str = str:gsub("&#(%d+);", utf8_from_code)
    str = str:gsub("&#x(%x+);", function(h) return utf8_from_code(tonumber(h, 16)) end)
    local entities = { ["&quot;"] = '"', ["&apos;"] = "'", ["&lt;"] = "<", ["&gt;"] = ">", ["&amp;"] = "&" }
    str = str:gsub("&%a+;", entities)
    return str
end

function extract_attr(text, attr_name)
    local val = string.match(text, attr_name .. '="([^"]+)"')
    if not val then val = string.match(text, attr_name .. "='([^']+)'") end
    return nuke_garbage(decode_xml(val or ""))
end

function extract_attr_raw(text, attr_name)
    local val = string.match(text, attr_name .. '="([^"]+)"')
    if not val then val = string.match(text, attr_name .. "='([^']+)'") end
    return decode_xml(val or "")
end

function run_curl_async(url, callback)
    if not url then callback(nil); return end
    local curl_path = is_windows and "curl.exe" or "curl"
    local args = { curl_path, "-s", "-k", "-L", "-4", "--max-time", "10", url }
    mp.command_native_async({ name = "subprocess", args = args, capture_stdout = true },
        function(success, res, error)
            if success and res and res.status == 0 then callback(res.stdout) else callback(nil) end
        end)
end

function run_curl_download_async(url, output_path, callback)
    if not url or not output_path then callback(false); return end
    local curl_path = is_windows and "curl.exe" or "curl"
    local args = { curl_path, "-s", "-k", "-L", "-4", "--max-time", "10", url, "-o", output_path }
    mp.command_native_async({ name = "subprocess", args = args },
        function(success, res, error)
            if success and res and res.status == 0 then callback(true) else callback(false) end
        end)
end

function get_plex_auth_params()
    local platform_str = is_windows and "Windows" or "macOS"
    return string.format("&X-Plex-Token=%s&X-Plex-Client-Identifier=%s&X-Plex-Product=%s&X-Plex-Platform=%s&X-Plex-Device=%s&X-Plex-Device-Name=%s&X-Plex-Language=ko",
        nuke_garbage(PLEX_TOKEN), urlencode(CURRENT_CLIENT_ID), urlencode(PLEX_PRODUCT), urlencode(platform_str), urlencode(PLEX_DEVICE), urlencode(PLEX_DEVICE_NAME))
end

function build_display_title(ttl, idx, p_ttl, g_ttl, fname)
    local base = (ttl ~= "") and ttl or (fname or "Unknown")
    local ep = (idx and idx ~= "") and (" - Ep." .. idx) or ""
    local res = base .. ep
    if p_ttl ~= "" and g_ttl ~= "" then res = res .. " - " .. (p_ttl == g_ttl and g_ttl or (p_ttl .. " - " .. g_ttl))
    elseif p_ttl ~= "" then res = res .. " - " .. p_ttl
    elseif g_ttl ~= "" then res = res .. " - " .. g_ttl end
    return res
end

function extract_embedded_chapters()
    local chapters = mp.get_property_native("chapter-list", {})
    local duration = mp.get_property_number("duration", 0)
    if not chapters or #chapters == 0 then return end
    for i, chap in ipairs(chapters) do
        local title = chap.title and chap.title:lower() or ""
        local start_time = chap.time
        local end_time = (i < #chapters) and chapters[i+1].time or duration
        if title:match("intro") or title:match("opening") or title:match("오프닝") then
            table.insert(intro_markers, { start = start_time, stop = end_time })
        end
        if title:match("credit") or title:match("ending") or title:match("outro") or title:match("엔딩") or title:match("크레딧") then
            table.insert(credits_markers, { start = start_time, stop = end_time })
        end
    end
end

-- ==================================================================================
-- [4] 넷플릭스 스타일 다음 화
-- ==================================================================================
function cancel_next_episode()
    if is_counting then
        is_counting = false
        credits_ignored = true 
        if countdown_timer then countdown_timer:kill(); countdown_timer = nil end
        mp.osd_message("⏹ 다음 화 재생 취소됨", 2)
    end
end

function play_next_episode()
    is_counting = false
    mp.command("playlist-next")
end

function start_next_countdown()
    if is_counting or not AUTO_NEXT_EPISODE then return end
    local count = mp.get_property_number("playlist-count") or 0
    local pos = mp.get_property_number("playlist-pos") or 0
    if pos + 1 >= count then return end 

    is_counting = true
    local remaining = COUNTDOWN_SEC
    countdown_timer = mp.add_periodic_timer(1, function()
        if remaining > 0 then
            mp.osd_message("⏳ 다음 화 재생까지 " .. remaining .. "초...", 1.1)
            remaining = remaining - 1
        else
            if countdown_timer then countdown_timer:kill(); countdown_timer = nil end
            play_next_episode()
        end
    end)
end

-- ==================================================================================
-- [5] 플레이리스트 생성
-- ==================================================================================
function setup_playlist(xml, current_key, my_session)
    local video_tag = string.match(xml, "<Video(.-)>") or ""
    local parentKey = extract_attr(video_tag, "parentRatingKey")
    local grandparentKey = extract_attr(video_tag, "grandparentRatingKey")
    local current_season_idx = tonumber(extract_attr(video_tag, "parentIndex")) or 0
    
    if parentKey == "" and grandparentKey == "" then return end
    local targetKey = parentKey ~= "" and parentKey or grandparentKey
    local children_url = nuke_garbage(PLEX_URL) .. "/library/metadata/" .. targetKey .. "/children?includeStreams=1" .. get_plex_auth_params()
    
    run_curl_async(children_url, function(children_xml)
        if my_session ~= current_session then return end
        if not children_xml then return end
        
        mp.command("playlist-clear")
        local all_episodes = {}
        local is_last_episode = false
        
        for v_chunk in children_xml:gmatch("<Video(.-)</Video>") do
            local rKey = extract_attr(v_chunk, "ratingKey")
            local idx = extract_attr(v_chunk, "index")
            local ttl = extract_attr_raw(v_chunk, "title")
            local p_ttl = extract_attr_raw(v_chunk, "parentTitle")
            local g_ttl = extract_attr_raw(v_chunk, "grandparentTitle")
            
            local p_chunk = string.match(v_chunk, "<Part(.-)>") or ""
            local p_id = extract_attr(p_chunk, "id")
            local raw_file = extract_attr_raw(p_chunk, "file")
            local fname = raw_file:match("([^/\\]+)$")
            if fname then fname = fname:gsub("%.[^%.]+$", "") end
            
            if rKey ~= "" and p_id ~= "" then
                table.insert(all_episodes, {key = rKey, index = tonumber(idx) or 0, title = build_display_title(ttl, idx, p_ttl, g_ttl, fname), part_id = p_id})
            end
        end
        table.sort(all_episodes, function(a, b) return a.index < b.index end)

        local insertion_ptr = 0
        for i, ep in ipairs(all_episodes) do
            if ep.key == current_key then
                insertion_ptr = insertion_ptr + 1
                if i == #all_episodes then is_last_episode = true end
            else
                local f_url = nuke_garbage(PLEX_URL) .. "/library/parts/" .. ep.part_id .. "/0/file?ratingKey=" .. ep.key .. get_plex_auth_params()
                mp.command_native({ name = "loadfile", url = f_url, flags = "append", options = { ["force-media-title"] = ep.title, ["title"] = ep.title } })
                local count = mp.get_property_number("playlist-count")
                if (count - 1) ~= insertion_ptr then mp.commandv("playlist-move", count - 1, insertion_ptr) end
                insertion_ptr = insertion_ptr + 1
            end
        end

        if is_last_episode and grandparentKey ~= "" then
            local show_url = nuke_garbage(PLEX_URL) .. "/library/metadata/" .. grandparentKey .. "/children?includeStreams=1" .. get_plex_auth_params()
            run_curl_async(show_url, function(show_xml)
                if my_session ~= current_session or not show_xml then return end
                local next_season_key = nil
                for dir_chunk in show_xml:gmatch("<Directory(.-)>") do
                    if extract_attr(dir_chunk, "type") == "season" and (tonumber(extract_attr(dir_chunk, "index")) or 0) == current_season_idx + 1 then
                        next_season_key = extract_attr(dir_chunk, "ratingKey")
                        break
                    end
                end
                if next_season_key then
                    local ns_url = nuke_garbage(PLEX_URL) .. "/library/metadata/" .. next_season_key .. "/children?includeStreams=1" .. get_plex_auth_params()
                    run_curl_async(ns_url, function(ns_xml)
                        if my_session ~= current_session or not ns_xml then return end
                        for first_v in ns_xml:gmatch("<Video(.-)</Video>") do
                            local rKey = extract_attr(first_v, "ratingKey")
                            local p_id = extract_attr(string.match(first_v, "<Part(.-)>") or "", "id")
                            if rKey ~= "" and p_id ~= "" then
                                local list_title = build_display_title(extract_attr_raw(first_v, "title"), extract_attr(first_v, "index"), extract_attr_raw(first_v, "parentTitle"), extract_attr_raw(first_v, "grandparentTitle"), nil)
                                local f_url = nuke_garbage(PLEX_URL) .. "/library/parts/" .. p_id .. "/0/file?ratingKey=" .. rKey .. get_plex_auth_params()
                                mp.command_native({ name = "loadfile", url = f_url, flags = "append", options = { ["force-media-title"] = list_title, ["title"] = list_title } })
                                mp.osd_message("다음 시즌 1화가 플레이리스트에 추가되었습니다.", 3)
                            end
                            break
                        end
                    end)
                end
            end)
        end
    end)
end

-- ==================================================================================
-- [6] 미디어 정보 적용 및 다중 해상도 인덱스 판별
-- ==================================================================================
function apply_media_info(xml, current_key, my_session)
    if not PLEX_URL or not PLEX_TOKEN then return end

    current_media_index = 0
    current_part_index = 0
    local found_indices = false
    local m_counter = 0
    
    for media_attrs, media_content in xml:gmatch("<Media(.-)>(.-)</Media>") do
        local p_counter = 0
        for part_attrs in media_content:gmatch("<Part(.-)>") do
            local p_id = extract_attr("<Part" .. part_attrs .. ">", "id")
            local p_file = extract_attr_raw("<Part" .. part_attrs .. ">", "file")
            local p_filename = p_file:match("([^/\\]+)$")
            
            if (playing_part_id and p_id == playing_part_id) or (playing_filename and p_filename == playing_filename) then
                current_media_index = m_counter
                current_part_index = p_counter
                found_indices = true
                print(string.format("[DEBUG] 다중 해상도 루프 매칭 성공: MediaIndex=%d, PartIndex=%d", current_media_index, current_part_index))
                break
            end
            p_counter = p_counter + 1
        end
        if found_indices then break end
        m_counter = m_counter + 1
    end

    for marker_tag in xml:gmatch("<Marker(.-)>") do
        local m_type = extract_attr(marker_tag, "type")
        local s = (tonumber(extract_attr(marker_tag, "startTimeOffset")) or 0) / 1000
        local e = (tonumber(extract_attr(marker_tag, "endTimeOffset")) or 0) / 1000
        if m_type == "intro" then table.insert(intro_markers, { start = s, stop = e })
        elseif m_type == "credits" then table.insert(credits_markers, { start = s, stop = e }) end
    end
    extract_embedded_chapters()

    local video_tag = string.match(xml, "<Video(.-)>") or ""
    local show_title = extract_attr_raw(video_tag, "grandparentTitle")
    local season_title = extract_attr_raw(video_tag, "parentTitle")
    local ep_title = extract_attr_raw(video_tag, "title")
    local ep_idx = extract_attr(video_tag, "index")
    
    local part_tag = string.match(xml, "<Part(.-)>") or ""
    local file_name = extract_attr_raw(part_tag, "file"):match("([^/\\]+)$")
    if file_name then file_name = file_name:gsub("%.[^%.]+$", "") end
    
    local final_title = build_display_title(ep_title, ep_idx, season_title, show_title, file_name)
    mp.set_property("force-media-title", final_title)
    mp.set_property("title", final_title)
    mp.osd_message(final_title, 3)

    local sub_url = nil
    for stream_tag in xml:gmatch("<Stream(.-)>") do
        local stype, key, selected, lang = extract_attr(stream_tag, "streamType"), extract_attr(stream_tag, "key"), extract_attr(stream_tag, "selected"), extract_attr(stream_tag, "languageCode")
        if stype == "3" and key ~= "" then
            sub_url = nuke_garbage(PLEX_URL) .. key .. "?format=srt" .. get_plex_auth_params()
            if selected == "1" or lang == "kor" then break end
        end
    end

    if sub_url then
        local sub_path = (is_windows and os.getenv("TEMP") or "/tmp") .. (is_windows and "\\" or "/") .. "plex_sub_" .. current_key .. "_" .. random_suffix .. ".srt"
        local func = function()
            run_curl_download_async(sub_url, sub_path, function(success)
                if my_session == current_session and success then mp.commandv("sub-add", sub_path, "select", "Plex Sub (Local)") end
            end)
        end
        if is_windows then mp.add_timeout(0.5, func) else func() end
    end

    if is_windows then mp.add_timeout(1.5, function() setup_playlist(xml, current_key, my_session) end)
    else setup_playlist(xml, current_key, my_session) end
end

-- ==================================================================================
-- [7] 마커 감시 및 타임라인 보고
-- ==================================================================================
function check_markers(name, cur_time)
    if not cur_time then return end
    last_time_pos = cur_time
    local dur = mp.get_property_number("duration")
    if dur and dur > 0 then last_duration = dur end
    
    for _, m in ipairs(intro_markers) do
        if cur_time >= m.start and cur_time < m.stop then
            if AUTO_SKIP_INTRO then
                if cur_time < m.start + 2 then
                    mp.set_property("time-pos", m.stop)
                    mp.osd_message("⏩ 오프닝 자동 스킵됨", 3)
                end
            elseif cur_time < m.start + 1 and not intro_notified then
                mp.osd_message("\n▶ 오프닝 구간입니다. (스킵: 'i' 키)", 3)
                intro_notified = true
            end
        end
    end

    if AUTO_NEXT_EPISODE and not is_counting and not credits_ignored then
        for _, m in ipairs(credits_markers) do
            if cur_time >= m.start and cur_time < m.stop then start_next_countdown() end
        end
    end
end

mp.add_forced_key_binding("i", "skip_intro_manual", function()
    local cur_time = mp.get_property_number("time-pos") or 0
    for _, m in ipairs(intro_markers) do
        if cur_time >= (m.start - 10) and cur_time < m.stop then
            mp.set_property("time-pos", m.stop)
            mp.osd_message("⏩ 오프닝 스킵 완료", 2)
            return
        end
    end
    mp.osd_message("현재 구간은 건너뛸 오프닝이 없습니다.", 2)
end)

function report_timeline(state)
    if not ratingKey or not PLEX_URL or not PLEX_TOKEN then return end
    local time_pos = mp.get_property_number("time-pos")
    if not time_pos or state == "stop" then time_pos = last_time_pos end
    local duration = mp.get_property_number("duration")
    if not duration or duration == 0 or state == "stop" then duration = last_duration end
    
    local state_str = (state == "pause") and "paused" or ((state == "stop") and "stopped" or state)
    
    local url = string.format("%s/:/timeline?ratingKey=%s&key=%%2Flibrary%%2Fmetadata%%2F%s&state=%s&time=%d&duration=%d&mediaIndex=%d&partIndex=%d%s",
        nuke_garbage(PLEX_URL), ratingKey, ratingKey, state_str, math.floor(time_pos*1000), math.floor(duration*1000), current_media_index, current_part_index, get_plex_auth_params())
    
    local curl_cmd = is_windows and "curl.exe" or "curl"
    local null_dev = is_windows and "NUL" or "/dev/null"
    
    if state == "stop" then mp.command_native({ name = "subprocess", args = { curl_cmd, "-s", "-k", "-4", "-o", null_dev, url }, playback_only = false })
    else mp.command_native_async({ name = "subprocess", args = { curl_cmd, "-s", "-k", "-4", "-o", null_dev, url }, playback_only = false }, function() end) end
end

-- ==================================================================================
-- [8] 메인 진입
-- ==================================================================================
function fetch_meta_and_apply(rKey, my_session)
    if not PLEX_URL or not PLEX_TOKEN or not rKey then return end
    ratingKey = rKey
    local meta_url = string.format("%s/library/metadata/%s?includeMarkers=1&includeStreams=1%s", PLEX_URL, rKey, get_plex_auth_params())
    
    run_curl_async(meta_url, function(xml)
        if my_session ~= current_session then return end
        if not xml then return end
        
        local offset = extract_attr(string.match(xml, "<Video(.-)>") or "", "viewOffset")
        if offset ~= "" and tonumber(offset) > 10000 then mp.set_property("time-pos", tonumber(offset)/1000) end
        
        apply_media_info(xml, rKey, my_session)
        report_timeline(mp.get_property_native("pause") and "pause" or "playing")
        
        if timer then timer:kill(); timer = nil end
        timer = mp.add_periodic_timer(REPORT_INTERVAL, function() report_timeline("playing") end)
        if mp.get_property_native("pause") then timer:stop() end
    end)
end

function on_load()
    current_session = current_session + 1
    local my_session = current_session

    if timer then timer:kill(); timer = nil end
    if seek_timer then seek_timer:kill(); seek_timer = nil end
    if countdown_timer then countdown_timer:kill(); countdown_timer = nil end
    is_counting = false
    intro_markers, credits_markers = {}, {}
    ratingKey = nil
    
    last_time_pos, last_duration = 0, 0
    intro_notified, credits_ignored = false, false
    current_media_index, current_part_index = 0, 0
    playing_part_id, playing_filename = nil, nil

    local path = mp.get_property("path") or ""
    PLEX_URL = string.match(path, "^(https?://.-)/library/")
    PLEX_TOKEN = string.match(path, "X%-Plex%-Token=([^&]+)")
    local rKey = string.match(path, "ratingKey=(%d+)")
    local part_id = string.match(path, "/parts/(%d+)/")

    if part_id then
        CURRENT_CLIENT_ID = string.format("%s_PART_%s_%s", CLIENT_ID_BASE, part_id, random_suffix)
    else
        CURRENT_CLIENT_ID = string.format("%s_%s", CLIENT_ID_BASE, random_suffix)
    end

    local filename = nil
    local iina_filename = string.match(path, "iina_filename=([^&]+)")
    if iina_filename then filename = urldecode(iina_filename) end
    
    playing_part_id = part_id
    playing_filename = filename

    if not rKey and part_id and PLEX_URL and PLEX_TOKEN and filename then
        local clean_name = filename:gsub("%.[^%.]+$", "")
        mp.osd_message("🔍 Plex 메타데이터 검색 중...", 2)
        run_curl_async(string.format("%s/library/search?query=%s&limit=10%s", PLEX_URL, urlencode(clean_name), get_plex_auth_params()), function(search_xml)
            if my_session ~= current_session then return end
            if search_xml then
                for video_chunk in search_xml:gmatch("<Video(.-)</Video>") do
                    if video_chunk:match('id="' .. part_id .. '"') or video_chunk:match('/parts/' .. part_id .. '/') then
                        rKey = string.match(video_chunk, 'ratingKey="(%d+)"')
                        break
                    end
                end
                if not rKey then rKey = string.match(search_xml, '<Video[^>]-ratingKey="(%d+)"') end
            end
            fetch_meta_and_apply(rKey, my_session)
        end)
        return
    end
    fetch_meta_and_apply(rKey, my_session)
end

mp.register_event("file-loaded", on_load)
mp.register_event("end-file", function() if timer then timer:kill(); timer = nil end report_timeline("stop") end)
mp.register_event("seek", function() 
    cancel_next_episode()
    if seek_timer then
        seek_timer:kill()
        seek_timer = nil
    end
    seek_timer = mp.add_timeout(SEEK_DEBOUNCE_SEC, function()
        report_timeline("playing")
    end)
end)

mp.observe_property("time-pos", "number", check_markers)

-- ==================================================================================
-- [9] 일시정지 시 백그라운드 타이머 정지
-- ==================================================================================
mp.observe_property("pause", "bool", function(n, v) 
    if v then 
        cancel_next_episode() 
        report_timeline("pause") 
        if timer then timer:stop() end 
    else 
        report_timeline("playing") 
        if timer then timer:resume() end 
    end
end)
