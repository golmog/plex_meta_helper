// ==UserScript==
// @name         Plex Meta Helper
// @namespace    https://tampermonkey.net/
// @version      0.6.16
// @description  Plex API + Flask server + FF(Plex Mate) 연동 헬퍼/추가 정보 표시 스크립트
// @author       golmog
// @supportURL   https://github.com/golmog/plex_meta_helper/issues
// @updateURL    https://raw.githubusercontent.com/golmog/plex_meta_helper/main/plex_meta_helper.user.js
// @downloadURL  https://raw.githubusercontent.com/golmog/plex_meta_helper/main/plex_meta_helper.user.js
// @match        https://app.plex.tv/*
// @match        https://*.plex.tv/web/index.html*
// @match        https://*.plex.direct/*
// @match        https://*/web/index.html*
// @match        http://*:32400/*
// @match        https://plex.*
// @match        https://plex-*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=plex.tv
// @require      https://code.jquery.com/jquery-3.6.0.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/toastr.js/latest/js/toastr.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/js/all.min.js
// @connect      localhost
// @connect      127.0.0.1
// @connect      *
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_addStyle
// @grant        GM_registerMenuCommand
// @run-at       document-idle
// ==/UserScript==

/* global toastr, $ */

GM_addStyle(`
    /* Toastr */
    .toast-title { font-weight: 700; }
    .toast-message { word-wrap: break-word; }
    .toast-message a, .toast-message label { color: #fff; }
    .toast-message a:hover { color: #ccc; text-decoration: none; }
    .toast-close-button { position: relative; right: -.3em; top: -.3em; float: right; font-size: 20px; font-weight: 700; color: #fff; text-shadow: #000 0 1px 0; opacity: .8; }
    .toast-close-button:focus, .toast-close-button:hover { color: #000; text-decoration: none; cursor: pointer; opacity: .4; }
    button.toast-close-button { padding: 0; cursor: pointer; background: 0 0; border: 0; -webkit-appearance: none; }
    #toast-container { position: fixed; z-index: 999999; pointer-events: none; }
    #toast-container * { box-sizing: border-box; }
    #toast-container > div {
        position: relative; pointer-events: auto; overflow: hidden; margin: 0 0 6px;
        padding: 15px 15px 15px 50px; /* 원래 왼쪽 패딩 50px 복원 */
        width: 300px; border-radius: 3px;
        background-position: 15px center;
        background-repeat: no-repeat;
        background-size: 24px 24px !important; /* 아이콘 크기를 24x24로 고정 */
        background-image: url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA2NCA2NCI+PHJlY3Qgd2lkdGg9IjY0IiBoZWlnaHQ9IjY0IiByeD0iMTIiIGZpbGw9IiM3Nzc3NzciIC8+PHRleHQgeD0iMzIiIHk9IjM1IiBmaWxsPSIjZmZmZmZmIiBmb250LWZhbWlseT0ic2Fucy1zZXJpZiIgZm9udC1zaXplPSIyNCIgZm9udC13ZWlnaHQ9ImJvbGQiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGFsaWdubWVudC1iYXNlbGluZT0ibWlkZGxlIj5QTUg8L3RleHQ+PC9zdmc+') !important;
        box-shadow: #000 0 0 12px; color: #fff; opacity: .9;
    }

    #toast-container > :focus { opacity: 1; box-shadow: #000 0 0 12px; }
    #toast-container > :hover { opacity: 1; box-shadow: #000 0 0 12px; cursor: pointer; }
    .toast-error { background-color: #bd362f; }
    .toast-success { background-color: #51a351; }
    .toast-info { background-color: #2f96b4; }
    .toast-warning { background-color: #f89406; }
    .toast-bottom-right { right: 12px; bottom: 12px; }
    .toast-progress { position: absolute; left: 0; bottom: 0; height: 4px; background-color: #000; opacity: .4; }

    /* 링크 & 상세정보 텍스트 효과 */
    .plex-guid-link, .plex-path-scan-link, #plex-guid-box .path-text-wrapper { text-decoration: none !important; cursor: pointer; color: #f1f1f1 !important; transition: color 0.2s, opacity 0.2s; }
    .plex-guid-link:hover, .plex-path-scan-link:hover { color: #f0ad4e !important; text-decoration: underline !important; }
    #plex-guid-box .plex-guid-action { font-size: 14px; margin: 0; text-decoration: none; cursor: pointer; vertical-align: middle; color: #adb5bd; opacity: 0.8; transition: opacity 0.2s, transform 0.2s, color 0.2s; }
    #plex-guid-box .plex-guid-action:hover { opacity: 1.0; color: #ffffff; transform: scale(1.1); }
    #plex-guid-box .plex-kor-subtitle-download { margin-right: 4px; }

    #plex-mate-refresh-button { display: inline-block; padding: 4px 10px; font-size: 13px; font-weight: 700; color: #1f1f1f !important; background-color: #e5a00d; border: 1px solid #c48b0b; border-radius: 4px; text-decoration: none !important; cursor: pointer; transition: 0.2s; }
    #plex-mate-refresh-button:hover { background-color: #d4910c; border-color: #a9780a; transform: scale(1.02); }

    #refresh-guid-button:hover i { color: #ffffff !important; transform: scale(1.1); }

    .media-info-line { display: grid; grid-template-columns: 35px 35px 35px 0.5fr 2.2fr 2.2fr 1.0fr; align-items: center; gap: 8px; padding: 8px 10px; border-radius: 4px; background-color: rgba(0, 0, 0, 0.2); margin-bottom: 4px; }
    .media-info-line .info-block { display: flex; flex-direction: column; justify-content: center; text-align: center; }
    .media-info-line .info-label { color: #9E9E9E; font-size: 10px; margin-bottom: 2px; white-space: nowrap; }
    .media-info-line .info-value { font-size: 12.5px; color: #E0E0E0; line-height: 1.3; display: flex; align-items: center; justify-content: center; text-align: center; word-break: break-word; }

    /* 목록 페이지 아이콘/태그 */
    div[data-testid^="cellItem"] div[class*="PosterCard-card-"],
    div[class*="ListItem-container"] div[class*="ThumbCard-card-"],
    div[class*="ListItem-container"] div[class*="ThumbCard-imageContainer"],
    div[class*="MetadataPosterCard-container"] div[class*="Card-card-"] { position: relative; overflow: hidden; }

    .pmh-top-right-wrapper { position: absolute; top: 2px; right: 2px; z-index: 10; display: flex; flex-direction: column; align-items: flex-end; gap: 2px; pointer-events: none; }
    .plex-list-res-tag { position: relative; background-color: rgba(0, 0, 0, 0.7); color: #ffffff; font-size: 10px; font-weight: bold; padding: 1px 3px; border-radius: 3px; pointer-events: none; border: 1px solid rgba(255,255,255,0.1); opacity: 1; }
    .plex-list-play-external {
        position: relative; background-color: rgba(0, 0, 0, 0.6); color: #adb5bd; border-radius: 3px;
        width: 22px; height: 18px; display: flex; align-items: center; justify-content: center;
        cursor: pointer; text-decoration: none; border: 1px solid rgba(255, 255, 255, 0.1);
        opacity: 0; pointer-events: auto; transform: scale(0.9); transition: opacity 0.15s, transform 0.15s, background-color 0.2s;
    }
    .plex-list-play-external i { font-size: 10px; }

    a:hover .plex-list-play-external, div[class*="PosterCard"]:hover .plex-list-play-external,
    div[class*="ThumbCard"]:hover .plex-list-play-external, div[class*="ListItem-container"]:hover .plex-list-play-external,
    div:hover > .pmh-top-right-wrapper .plex-list-play-external { opacity: 0.8; transform: scale(1); }
    .plex-list-play-external:hover { background-color: rgba(0, 0, 0, 0.9) !important; color: #ffffff !important; transform: scale(1.1) !important; opacity: 1 !important; }

    .plex-guid-list-box { display: inline; margin-left: 5px; color: #e5a00d; font-size: 11px; font-weight: 500; cursor: pointer; text-decoration: none; white-space: nowrap; transition: 0.2s; }
    .plex-guid-list-box:hover { text-decoration: underline !important; opacity: 0.85; }

    /* 컨트롤 UI */
    #pmdv-controls { margin-right: 10px; order: -1; display: flex; align-items: center; gap: 5px; }
    #pmdv-controls span.ctrl-label { font-size: 11px !important; color: #aaa; font-weight: bold; margin-right: 2px; margin-left: 2px; }
    #pmdv-controls input[type="number"] { width: 35px; text-align: center; padding: 2px; font-size: 11px; background-color: rgba(0,0,0,0.2); border: 1px solid #555; color: #eee; border-radius: 3px; }
    #pmdv-controls button { font-size: 11px !important; padding: 3px 6px !important; margin: 0 !important; height: auto !important; line-height: 1.4 !important; color: #eee !important; background-color: rgba(0,0,0,0.2) !important; border: 1px solid #555 !important; border-radius: 4px !important; vertical-align: middle; cursor: pointer; white-space: nowrap; transition: background-color 0.2s ease; }
    #pmdv-controls button:hover { background-color: rgba(0,0,0,0.4) !important; border-color: #aaa !important; }
    #pmdv-controls button.on { background-color: #e5a00d !important; color: #1f1f1f !important; border-color: #e5a00d !important; font-weight: bold; }
    #pmdv-controls button.on:hover { background-color: #d4910c !important; }
`);

(function() {
    'use strict';

    // ==========================================
    // 1. 설정 및 로깅 시스템
    // ==========================================
    const SETTINGS_KEY = 'pmh_server_final_settings';

    function getSettings() {
        const defaultSettings = {
            "INFO": "아래 설정을 JSON 형식에 맞게 수정하세요.",
            "DISPLAY_PATH_PREFIXES_TO_REMOVE": ["/mnt/gds", "/mnt/content"],
            "LOG_LEVEL": "INFO",
            "USER_TAGS": {
                "PRIORITY_GROUP": [
                    { "name": "LEAK", "pattern": "(leaked|유출)", "target": "filename" },
                    { "name": "MOPA", "pattern": "(mopa|모파|모자이크제거)", "target": "path" }
                ],
                "INDEPENDENT": [
                    { "name": "REMUX", "pattern": "remux", "target": "path" }
                ]
            },
            "PATH_MAPPINGS": [
                { "serverPrefix": "/mnt/gds/", "localPrefix": "Z:/gds/" },
                { "serverPrefix": "/mnt/content/", "localPrefix": "Z:/content/" }
            ],
            "SERVERS": [
                {
                    "name": "My Main Server",
                    "machineIdentifier": "SERVER_MACHINE_IDENTIFIER_HERE",
                    "pmhServerUrl": "http://127.0.0.1:8899",
                    "plexMateUrl": "https://ff1.yourdomain.com",
                    "plexMateApiKey": "_YOUR_APIKEY_"
                }
            ]
        };
        let saved = GM_getValue(SETTINGS_KEY, null);
        if (!saved) { GM_setValue(SETTINGS_KEY, defaultSettings); return defaultSettings; }
        return { ...defaultSettings, ...saved };
    }

    const AppSettings = getSettings();

    function getLocalTime() {
        const d = new Date(); const p = v => String(v).padStart(2, '0');
        return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, '0')}`;
    }

    function log(...args) { if (AppSettings.LOG_LEVEL?.toUpperCase() === "DEBUG") console.log(`[PMH][${getLocalTime()}][DEBUG]`, ...args); }
    function infoLog(...args) { const lvl = AppSettings.LOG_LEVEL?.toUpperCase(); if (lvl === "DEBUG" || lvl === "INFO") console.info(`[PMH][${getLocalTime()}][INFO]`, ...args); }
    function errorLog(...args) { console.error(`[PMH][${getLocalTime()}][ERROR]`, ...args); }

    infoLog("Script initialized. Robust Logging enabled.");

    // ==========================================
    // 2. 인메모리(In-Memory) LRU 캐시 시스템
    // ==========================================
    const MAX_CACHE_SIZE = 1000;
    const memoryCache = new Map();

    function setMemoryCache(key, data) {
        if (memoryCache.has(key)) memoryCache.delete(key);
        memoryCache.set(key, data);
        if (memoryCache.size > MAX_CACHE_SIZE) {
            const oldestKey = memoryCache.keys().next().value;
            memoryCache.delete(oldestKey);
            log(`[MemCache] GC triggered. Evicted: ${oldestKey}`);
        }
    }

    function getMemoryCache(key) {
        return memoryCache.get(key) || null;
    }

    function deleteMemoryCache(key) {
        memoryCache.delete(key);
        log(`[MemCache] Deleted key: ${key}`);
    }

    function clearMemoryCache() {
        memoryCache.clear();
        infoLog("[MemCache] All memory cache cleared by user.");
    }

    // ==========================================
    // 3. 상태 변수 및 글로벌 워커 큐
    // ==========================================
    function getServerConfig(machineIdentifier) {
        if (!machineIdentifier || !AppSettings.SERVERS) return null;
        return AppSettings.SERVERS.find(s => s.machineIdentifier === machineIdentifier) || null;
    }

    const STATE_KEYS = { GUID: 'pmh_s_guid', TAG: 'pmh_s_tag', PLAY: 'pmh_s_play', LEN: 'pmh_s_len' };
    let state = {
        listGuid: GM_getValue(STATE_KEYS.GUID, false),
        listTag: GM_getValue(STATE_KEYS.TAG, true),
        listPlay: GM_getValue(STATE_KEYS.PLAY, false),
        guidLen: GM_getValue(STATE_KEYS.LEN, 20)
    };

    let isFetchingDetail = false;
    let currentUrl = '';
    let currentDisplayedItemId = null;
    let currentRenderSession = 0;
    const activeRequests = new Set();
    let swrDebounceTimer = null;

    const globalFallbackQueue = [];
    let isFallbackWorkerRunning = false;

    async function processGlobalFallbackQueue() {
        if (isFallbackWorkerRunning) return;
        isFallbackWorkerRunning = true;
        log("[Global Worker] Started processing fallback tasks.");

        while (globalFallbackQueue.length > 0) {
            if (globalFallbackQueue[0].session !== currentRenderSession) {
                log(`[Global Worker] Session changed! Aborting ${globalFallbackQueue.length} remaining tasks.`);
                globalFallbackQueue.length = 0;
                break;
            }

            const queueItem = globalFallbackQueue.shift();
            try {
                await queueItem.task();
            } catch(e) {
                errorLog("[Global Worker] Task execution error", e);
            }

            await new Promise(r => setTimeout(r, 150));
        }

        isFallbackWorkerRunning = false;
        log("[Global Worker] Resting. Queue empty or aborted.");
    }

    if (typeof toastr !== 'undefined') {
        toastr.options = { "closeButton": true, "progressBar": true, "positionClass": "toast-bottom-right", "timeOut": 5000, "extendedTimeOut": 1500, "showDuration": 300, "hideDuration": 500 };
    }

    // ==========================================
    // 4. 네트워크 및 API 모듈
    // ==========================================
    function abortAllRequests() {
        if (activeRequests.size > 0) {
            log(`[Network] Aborting ${activeRequests.size} ongoing background request(s).`);
            for (const req of activeRequests) { try { req.abort(); } catch(e) {} }
            activeRequests.clear();
        }
    }

    function extractIds() {
        const h = window.location.hash || window.location.search;
        const sidMatch = h.match(/\/server\/([a-f0-9]+)\//);
        const sid = sidMatch ? sidMatch[1] : null;
        let iid = null;
        try {
            const keyParam = new URLSearchParams(h.split('?')[1]).get('key');
            if (keyParam) iid = decodeURIComponent(keyParam).split('/metadata/')[1]?.split(/[\/?]/)[0];
        } catch(e) {}
        return { serverId: sid, itemId: iid };
    }

    function extractPlexServerInfo(serverId) {
        if (!serverId) return null;
        try {
            const users = JSON.parse(localStorage.getItem('users'));
            for (const u of users.users) {
                if (!u.servers) continue;
                for (const s of u.servers) {
                    if (s.machineIdentifier === serverId) {
                        return { token: s.accessToken, url: s.connections?.find(c => c.uri)?.uri || "" };
                    }
                }
            }
        } catch(e) {}
        return null;
    }

    function makeRequest(url, method = "GET", data = null, apiKey = null) {
        log(`[API Req] [${method}] ${url}`);
        return new Promise((resolve, reject) => {
            const headers = {};
            if (data) headers["Content-Type"] = "application/json";
            if (apiKey) headers["X-API-Key"] = apiKey;

            const req = GM_xmlhttpRequest({
                method: method, url: url, timeout: 5000,
                headers: headers,
                data: data ? JSON.stringify(data) : undefined,
                onload: r => {
                    activeRequests.delete(req);
                    if (r.status === 401) {
                        errorLog(`[API Err] Unauthorized! Check your plexMateApiKey in settings for: ${url}`);
                        reject(`Unauthorized (401)`);
                        return;
                    }
                    if (r.status >= 200 && r.status < 300) {
                        try {
                            const parsed = JSON.parse(r.responseText);
                            log(`[API Res] Success [${method}] ${url}`);
                            resolve(parsed);
                        } catch(e) { reject(`JSON Parse Error`); }
                    } else { reject(`HTTP ${r.status}`); }
                },
                onerror: () => { activeRequests.delete(req); reject("Network Error"); },
                ontimeout: () => { activeRequests.delete(req); reject("Timeout Error"); },
                onabort: () => { activeRequests.delete(req); reject("Aborted"); }
            });
            activeRequests.add(req);
        });
    }

function fetchPlexMetaFallback(itemId, plexSrv) {
        return new Promise((resolve) => {
            if (!plexSrv) return resolve(null);
            log(`[Fallback API] Fetching Plex Meta for Item: ${itemId}`);
            const req = GM_xmlhttpRequest({
                method: 'GET',
                url: `${plexSrv.url}/library/metadata/${itemId}?includeMarkers=1&X-Plex-Token=${plexSrv.token}`,
                headers: { 'Accept': 'application/json' },
                onload: r => {
                    activeRequests.delete(req);
                    try {
                        const meta = JSON.parse(r.responseText).MediaContainer.Metadata[0];
                        log(`[Fallback API] Success for Item: ${itemId}`);
                        resolve(meta);
                    } catch(e) {
                        log(`[Fallback API] Parse error or empty for Item: ${itemId}`);
                        resolve(null);
                    }
                },
                onerror: () => { activeRequests.delete(req); resolve(null); },
                onabort: () => { activeRequests.delete(req); resolve(null); }
            });
            activeRequests.add(req);
        });
    }

    async function analyzeAndFetchPlexMeta(itemId, plexSrv) {
        if (!plexSrv) return null;
        return new Promise((resolve) => {
            const sessionAtStart = currentRenderSession;
            log(`[Analyze] Triggering Analysis for Item: ${itemId}. Waiting...`);
            const req = GM_xmlhttpRequest({
                method: 'PUT',
                url: `${plexSrv.url}/library/metadata/${itemId}/analyze?X-Plex-Token=${plexSrv.token}`,
                timeout: 60000,
                onload: () => {
                    activeRequests.delete(req);
                    log(`[Analyze] Analysis finished for Item: ${itemId}. Re-fetching in 1.5s...`);
                    setTimeout(async () => {
                        if (sessionAtStart !== currentRenderSession) {
                            log(`[Analyze] Session changed during wait for Item: ${itemId}. Aborting refetch.`);
                            return resolve(null);
                        }
                        const newMeta = await fetchPlexMetaFallback(itemId, plexSrv);
                        resolve(newMeta);
                    }, 1500);
                },
                onerror: () => { activeRequests.delete(req); resolve(null); },
                ontimeout: () => { activeRequests.delete(req); log(`[Analyze] Timeout (60s) for Item: ${itemId}`); resolve(null); },
                onabort: () => { activeRequests.delete(req); resolve(null); }
            });
            activeRequests.add(req);
        });
    }

    function parsePlexFallbackTags(meta) {
        let tags = [];
        if (!meta || !meta.Media || !meta.Media[0]) return tags;
        const sortedMedia = [...meta.Media].sort((a, b) => (b.width || 0) - (a.width || 0) || (b.bitrate || 0) - (a.bitrate || 0));
        const media = sortedMedia[0];

        const w = media.width || 0;
        const vRes = (media.videoResolution || "").toString().toLowerCase();
        let res = null;

        if (w >= 7000 || vRes === '8k') res = "8K";
        else if (w >= 5000 || vRes === '6k') res = "6K";
        else if (w >= 3400 || vRes === '4k') res = "4K";
        else if (w >= 1900 || vRes === '1080') res = "FHD";
        else if (w >= 1200 || vRes === '720') res = "HD";
        else if (w > 0 || vRes === 'sd' || vRes === '480' || vRes === '576') res = "SD";

        let hdrBadges = new Set();
        let hasSub = false;
        let isHardsub = false;

        const parts = media.Part || [];
        for (const p of parts) {
            if (p.file && /kor-?sub|자체자막/i.test(p.file)) isHardsub = true;
            const streams = p.Stream || [];
            for (const s of streams) {
                if (s.streamType === 1) {
                    const codecStr = `${s.codec || ''} ${s.colorSpace || ''} ${s.DOVIProfile || ''} ${s.title || ''}`.toUpperCase();
                    if (codecStr.includes('DOVI') || codecStr.includes('DOLBY') || s.DOVIProfile) hdrBadges.add('DV');
                    if (codecStr.includes('BT2020') || codecStr.includes('SMPTE2084') || codecStr.includes('HLG') || codecStr.includes('HDR10')) hdrBadges.add('HDR');
                }
                if (s.streamType === 3) {
                    const lang = `${s.languageCode || ''} ${s.language || ''} ${s.title || ''}`.toLowerCase();
                    if (lang.includes('kor') || lang.includes('ko') || lang.includes('한국어') || lang.includes('korean')) hasSub = true;
                }
            }
        }

        let videoTag = res || "";
        if (hdrBadges.size > 0) {
            const sorted = Array.from(hdrBadges).sort((a,b) => a === 'DV' ? -1 : 1);
            videoTag = videoTag ? `${videoTag} ${sorted.join('/')}` : sorted.join('/');
        }

        if (videoTag) tags.push(videoTag);
        if (hasSub) tags.push("SUB");
        else if (isHardsub) tags.push("SUBBED");

        log(`[Parser] Parsed tags for Item: [${tags.join(', ')}]`);
        return tags;
    }

    function convertPlexMetaToLocalData(meta, itemId) {
        if (!meta) return null;
        if (meta.Media && meta.Media.length > 0) {
            meta.Media.sort((a, b) => (b.width || 0) - (a.width || 0) || (b.bitrate || 0) - (a.bitrate || 0));
        }

        const tags = parsePlexFallbackTags(meta);

        let p = "";
        if (meta.Media && meta.Media[0] && meta.Media[0].Part && meta.Media[0].Part[0]) {
            p = meta.Media[0].Part[0].file || "Unknown Path";
        }

        let versions = [];
        if (meta.Media) {
            meta.Media.forEach(m => {
                let v = {
                    width: m.width || 0,
                    v_codec: m.videoCodec || "",
                    a_codec: m.audioCodec || "",
                    a_ch: m.audioChannels || "",
                    v_bitrate: m.bitrate ? m.bitrate * 1000 : 0,
                    file: (m.Part && m.Part[0]) ? m.Part[0].file : "Unknown Path",
                    part_id: (m.Part && m.Part[0]) ? m.Part[0].id : "",
                    video_extra: "",
                    subs: []
                };
                const fTags = parsePlexFallbackTags({ Media: [m] });
                if (fTags.length > 0) {
                    const vTag = fTags[0];
                    if (vTag.includes('DV') || vTag.includes('HDR')) {
                        v.video_extra = " " + vTag.replace(/8K|6K|4K|FHD|HD|SD/g, '').trim();
                    }
                }
                if (m.Part && m.Part[0] && m.Part[0].Stream) {
                    v.subs = m.Part[0].Stream.filter(s => s.streamType === 3).map(s => ({
                        id: s.id,
                        languageCode: (s.languageCode || s.language || "und").toLowerCase().substring(0,3),
                        codec: s.codec || "unknown",
                        key: s.key || "",
                        format: s.codec || "unknown"
                    }));
                }
                versions.push(v);
            });
        }

        let markers = {};
        if (meta.Marker) {
            meta.Marker.forEach(mk => {
                if (mk.type === 'intro' || mk.type === 'credits') {
                    markers[mk.type] = { start: mk.startTimeOffset, end: mk.endTimeOffset };
                }
            });
        }

        const guid = meta.guid || "";
        return {
            type: (meta.type === 'movie' || meta.type === 'episode') ? 'video' : 'directory',
            itemId: itemId,
            guid: guid,
            duration: meta.duration || 0,
            versions: versions,
            markers: markers,
            g: guid.split('://')[1]?.split('?')[0] || guid,
            raw_g: guid,
            p: p,
            tags: tags
        };
    }

    // ==========================================
    // 5. 일반 유틸리티 및 UI 설정
    // ==========================================
    function getLocalPath(originalPath) {
        if (!originalPath || !AppSettings.PATH_MAPPINGS) return originalPath;

        for (const mapping of AppSettings.PATH_MAPPINGS) {
            const localPrefix = mapping.localPrefix.replace(/\\/g, '/');
            if (originalPath.startsWith(mapping.serverPrefix)) {
                return localPrefix + originalPath.substring(mapping.serverPrefix.length);
            }
        }
        return originalPath;
    }

    function emphasizeFileName(path) {
        let dp = path;
        AppSettings.DISPLAY_PATH_PREFIXES_TO_REMOVE.forEach(p => { if (dp.startsWith(p)) dp = dp.substring(p.length); });
        const l = Math.max(dp.lastIndexOf('/'), dp.lastIndexOf('\\'));
        if (l === -1) return `<span style="font-weight:bold; color:#e5a00d;">${dp}</span>`;
        return `${dp.substring(0, l + 1)}<span style="color:#e5a00d;">${dp.substring(l + 1)}</span>`;
    }

    function applyUserTags(filePath, existingTags) {
        if (!filePath || !AppSettings.USER_TAGS) return existingTags;

        let newTags = [...existingTags];
        const config = AppSettings.USER_TAGS;

        const pathParts = filePath.split(/[\\/]/);
        const fileName = pathParts[pathParts.length - 1];

        const evaluateRule = (rule) => {
            try {
                const regex = new RegExp(rule.pattern, 'i');
                const targetString = (rule.target && rule.target.toLowerCase() === 'filename') ? fileName : filePath;
                return regex.test(targetString);
            } catch (e) {
                errorLog(`[UserTags] Invalid regex pattern: ${rule.pattern}`);
                return false;
            }
        };

        if (config.PRIORITY_GROUP && Array.isArray(config.PRIORITY_GROUP)) {
            for (const rule of config.PRIORITY_GROUP) {
                if (evaluateRule(rule)) {
                    if (!newTags.includes(rule.name)) newTags.push(rule.name);
                    break;
                }
            }
        }

        if (config.INDEPENDENT && Array.isArray(config.INDEPENDENT)) {
            for (const rule of config.INDEPENDENT) {
                if (evaluateRule(rule)) {
                    if (!newTags.includes(rule.name)) newTags.push(rule.name);
                }
            }
        }

        return newTags;
    }

    function formatDuration(ms) {
        if (!ms || isNaN(Number(ms)) || Number(ms) <= 0) return '-';
        const t = Math.floor(Number(ms) / 1000);
        const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
        return h > 0 ? `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}` : `${m}:${s.toString().padStart(2, '0')}`;
    }

    function injectControlUI() {
        if (document.getElementById('pmdv-controls')) return;

        let target = document.querySelector('button[data-testid="navbarAccountMenuTrigger"]')?.closest('div[style*="height: 100%"]');
        if (!target) {
            const btn = document.querySelector('button[data-testid="navbarAccountMenuTrigger"]');
            if (btn) target = btn.parentElement;
        }
        if (!target) return;

        const ctrl = document.createElement('div');
        ctrl.id = 'pmdv-controls';

        const createBtn = (label, stateKey, storeKey, callback) => {
            const btn = document.createElement('button');
            btn.textContent = `${label}:${state[stateKey]?'ON':'OFF'}`;
            if(state[stateKey]) btn.classList.add('on');
            btn.addEventListener('click', () => {
                state[stateKey] = !state[stateKey];
                GM_setValue(storeKey, state[stateKey]);
                btn.textContent = `${label}:${state[stateKey]?'ON':'OFF'}`;
                btn.classList.toggle('on', state[stateKey]);
                log(`[UI] Setting changed - ${label}: ${state[stateKey]}`);
                callback();
            });
            return btn;
        };

        const forceReRenderAll = () => {
            log("[UI] Settings changed. Forcing re-render of all items...");
            document.querySelectorAll('.pmh-render-marker, .pmh-top-right-wrapper, .plex-guid-list-box').forEach(e=>e.remove());
            processList();
        };

        ctrl.insertAdjacentHTML('beforeend', `<span class="ctrl-label">목록:</span>`);
        ctrl.appendChild(createBtn('GUID', 'listGuid', STATE_KEYS.GUID, forceReRenderAll));
        ctrl.appendChild(createBtn('태그', 'listTag', STATE_KEYS.TAG, forceReRenderAll));
        ctrl.appendChild(createBtn('재생', 'listPlay', STATE_KEYS.PLAY, forceReRenderAll));

        ctrl.insertAdjacentHTML('beforeend', `<span class="ctrl-label">GUID길이:</span>`);
        const lenInp = document.createElement('input');
        lenInp.type = 'number'; lenInp.min = '5'; lenInp.max = '50'; lenInp.value = state.guidLen;

        const lenBtn = document.createElement('button'); lenBtn.textContent = '적용';
        lenBtn.addEventListener('click', () => {
            const nl = parseInt(lenInp.value);
            if (!isNaN(nl) && nl >= 5 && nl <= 50) {
                state.guidLen = nl; GM_setValue(STATE_KEYS.LEN, state.guidLen);
                log(`[UI] GUID Length changed to ${nl}`);
                forceReRenderAll(); toastr.success(`GUID 길이 ${nl} 적용 완료`);
            }
        });

        const clearCacheBtn = document.createElement('button');
        clearCacheBtn.textContent = '메모리 초기화';
        clearCacheBtn.style.marginLeft = '10px';
        clearCacheBtn.addEventListener('click', () => {
            clearMemoryCache();
            toastr.info("인메모리 캐시가 초기화되었습니다.");
            forceReRenderAll();
            if(document.getElementById('plex-guid-box')) {
                currentDisplayedItemId = null;
                processDetail(true);
            }
        });

        ctrl.appendChild(lenInp);
        ctrl.appendChild(lenBtn);
        ctrl.appendChild(clearCacheBtn);

        target.insertBefore(ctrl, target.firstChild);
        log("[UI] Control UI Injected successfully.");
    }

    // ==========================================
    // 6. 목록 모드 (List View) 처리 - 단방향 파이프라인
    // ==========================================
    function checkAndQueueFallback(serverId, id, info, srvConfig, session) {
        const hasResBadge = info.tags.some(t => /8K|6K|4K|FHD|HD|SD/.test(t));
        const isMissingData = (!info.g && state.listGuid) || (state.listTag && !hasResBadge);

        if (isMissingData && info.p && !fallbackActiveIds.has(id)) {
            fallbackActiveIds.add(id);
            infoLog(`[Fallback] Missing metadata for ID: ${id}. Added to background queue.`);

            globalFallbackQueue.push({
                session: session,
                task: async () => {
                    if (session !== currentRenderSession) return;
                    const plexSrv = extractPlexServerInfo(serverId);

                    try {
                        let meta = await fetchPlexMetaFallback(id, plexSrv);
                        if (!meta) return;

                        let updatedInfo = { g: info.g, p: info.p, tags: [...info.tags] };
                        let needsUpdate = false;
                        let fallbackTags = parsePlexFallbackTags(meta);
                        const m = meta.Media && meta.Media[0] ? meta.Media[0] : null;

                        if (m && (!m.width || m.width === 0) && !m.videoResolution) {
                            infoLog(`[Analyze] Triggering Plex Server Analysis for ID: ${id}`);
                            meta = await analyzeAndFetchPlexMeta(id, plexSrv);
                            if (meta) fallbackTags = parsePlexFallbackTags(meta);
                        }

                        if (meta && meta.guid && !updatedInfo.g) {
                            updatedInfo.g = meta.guid.split('://')[1]?.split('?')[0] || meta.guid;
                            needsUpdate = true;
                        }
                        if (fallbackTags.length > 0) {
                            if (!hasResBadge) {
                                updatedInfo.tags = Array.from(new Set([...fallbackTags, ...updatedInfo.tags]));
                                needsUpdate = true;
                            } else if (fallbackTags.includes("SUB") && !updatedInfo.tags.includes("SUB")) {
                                updatedInfo.tags.push("SUB");
                                needsUpdate = true;
                            }
                        }

                        if (needsUpdate && session === currentRenderSession) {
                            setMemoryCache(`L_${serverId}_${id}`, updatedInfo);

                            const liveWrappers = document.querySelectorAll(`div[data-testid^="cellItem"], div[class*="ListItem-container"], div[class*="MetadataPosterCard-container"]`);
                            for (const live of liveWrappers) {
                                const liveLink = live.querySelector('a[href*="key="]') || live.querySelector('a[href*="/metadata/"]');
                                if (liveLink && decodeURIComponent(liveLink.getAttribute('href') || '').includes(id)) {
                                    let livePoster = live.querySelector(`[class*="PosterCard-card-"], [class*="MetadataSimplePosterCard-card-"], [class*="ThumbCard-card-"], [class*="Card-card-"], [class*="ThumbCard-imageContainer"], [data-testid="metadata-poster"]`);
                                    if (!livePoster && live.classList.contains('ListItem-container')) livePoster = live.firstElementChild;

                                    if (livePoster) {
                                        renderListBadges(live, livePoster, liveLink, updatedInfo, srvConfig, id);
                                        infoLog(`[Fallback] Automatically updated live badge for ID: ${id}`);
                                        break;
                                    }
                                }
                            }
                        }
                    } catch (e) {
                        errorLog(`[Fallback] Error processing ID: ${id}`, e);
                    } finally {
                        fallbackActiveIds.delete(id);
                    }
                }
            });
            processGlobalFallbackQueue();
            return true;
        }
        return false;
    }

    function renderListBadges(cont, poster, link, info, srvConfig, id) {
        poster.querySelector('.pmh-render-marker')?.remove();
        poster.querySelector('.pmh-top-right-wrapper')?.remove();
        cont.querySelectorAll('.plex-guid-list-box').forEach(el => el.remove());

        const marker = document.createElement('div');
        marker.className = 'pmh-render-marker';
        marker.style.display = 'none';
        marker.setAttribute('data-iid', id);
        poster.appendChild(marker);

        let wrapper = null;
        if (state.listTag || state.listPlay) {
            wrapper = document.createElement('div');
            wrapper.className = 'pmh-top-right-wrapper';
            poster.appendChild(wrapper);
        }

        if (state.listTag && info.tags && info.tags.length > 0) {
            info.tags.forEach(tagText => {
                const t = document.createElement('div');
                t.className = 'plex-list-res-tag';
                t.textContent = tagText;
                wrapper.appendChild(t);
            });
        }

        if (state.listPlay && info.p) {
            const lPath = encodeURIComponent(getLocalPath(info.p).replace(/\\/g, '/')).replace(/\(/g, '%28').replace(/\)/g, '%29');
            const pBtn = document.createElement('a');
            pBtn.href = `plexplay://${lPath}`;
            pBtn.className = 'plex-list-play-external';
            pBtn.title = '외부 플레이어 재생';
            pBtn.innerHTML = '<i class="fas fa-play"></i>';

            pBtn.addEventListener('click', (e) => {
                e.preventDefault(); e.stopPropagation();
                log(`[Action] List External Play clicked for ID: ${id}`);
                toastr.info('외부 플레이어 호출 중...');
                window.location.assign(pBtn.href);
            });
            wrapper.appendChild(pBtn);
        }

        if (state.listGuid && info.g) {
            let tLink = cont.querySelector('a[data-testid="metadataTitleLink"]') || cont.querySelector('[class*="Title-title-"]');
            if (tLink || link) {
                const attachTarget = tLink || link;
                const isWide = poster.clientWidth > 200;
                const currentLen = isWide ? state.guidLen * 2 : state.guidLen;

                const short = info.g.length > currentLen ? info.g.substring(0, currentLen) + '...' : info.g;
                const gBox = document.createElement('span');
                gBox.className = 'plex-guid-list-box';
                gBox.textContent = short;
                gBox.title = `${info.g} : 클릭 시 재조회`;

                const rawG = (info.raw_g || info.g || '').toLowerCase();
                let isUnmatched = false;

                if (!rawG || rawG === '-' || rawG === 'none') {
                    isUnmatched = true;
                } else {
                    const schemeMatch = rawG.match(/^([^:]+):\/\//);
                    if (schemeMatch) {
                        const scheme = schemeMatch[1];
                        if (scheme.endsWith('local') || scheme.endsWith('none')) {
                            isUnmatched = true;
                        }
                    }
                }

                if (isUnmatched) {
                    gBox.style.color = '#a68241';
                }

                gBox.addEventListener('click', (e) => {
                    e.preventDefault(); e.stopPropagation();
                    if (gBox.dataset.refreshing === 'true') return;

                    log(`[Action] Manual GUID refresh clicked for ID: ${id}`);
                    gBox.dataset.refreshing = 'true';
                    const originText = gBox.textContent;
                    gBox.textContent = '갱신중...';
                    gBox.style.color = '#ccc';

                    deleteMemoryCache(`L_${srvConfig ? srvConfig.machineIdentifier : id}_${id}`);

                    poster.querySelector('.pmh-render-marker')?.remove();
                    processList().catch(() => {
                        if (gBox.isConnected) {
                            gBox.textContent = '[실패]'; gBox.style.color = 'red';
                            setTimeout(() => {
                                if (gBox.isConnected) {
                                    gBox.textContent = originText;

                                    if (isUnmatched) {
                                        gBox.style.color = '#a68241';
                                    } else {
                                        gBox.style.color = '#e5a00d';
                                    }

                                    delete gBox.dataset.refreshing;
                                }
                            }, 2000);
                        }
                    });
                });
                attachTarget.insertAdjacentElement('afterend', gBox);
            }
        }
    }

    async function processList() {
        if (!state.listGuid && !state.listTag && !state.listPlay) return;

        const itemWrappers = document.querySelectorAll(`
            div[data-testid^="cellItem"],
            div[class*="ListItem-container"],
            div[class*="MetadataPosterCard-container"]
        `);

        if (itemWrappers.length === 0) return;

        const session = currentRenderSession;
        const pendingItems = [];
        const itemsToRevalidate = [];
        const currentVisibleIds = new Set();

        itemWrappers.forEach(cont => {
            let link = cont.querySelector('a[data-testid="metadataTitleLink"]');
            if (!link) {
                const fallbackLinks = cont.querySelectorAll('a[href*="key="], a[href*="/metadata/"]');
                link = fallbackLinks[0];
            }
            if (!link) return;

            const href = link.getAttribute('href'); if (!href) return;
            const sidMatch = href.match(/\/server\/([a-f0-9]+)\//); if (!sidMatch) return;
            const sid = sidMatch[1];

            let iid = null;
            try {
                const keyParam = new URLSearchParams(href.split('?')[1]).get('key');
                if (keyParam) iid = decodeURIComponent(keyParam).split('/metadata/')[1]?.split(/[\/?]/)[0];
            } catch(e) {}
            if (!sid || !iid) return;

            currentVisibleIds.add(iid);
            itemsToRevalidate.push({ sid, iid, cont, link });

            const marker = cont.querySelector('.pmh-render-marker');
            if (marker && marker.getAttribute('data-iid') === iid) return;

            let poster = cont.querySelector(`[class*="PosterCard-card-"], [class*="MetadataSimplePosterCard-card-"], [class*="ThumbCard-card-"], [class*="Card-card-"], [class*="ThumbCard-imageContainer"], [data-testid="metadata-poster"]`);
            if (!poster) {
                const img = cont.querySelector('img[src*="/photo/"]');
                if (img) poster = img.closest('[class*="card"], [class*="container"], [class*="imageContainer"]') || img.parentElement;
            }
            if (!poster && cont.classList.contains('ListItem-container')) poster = cont.firstElementChild;

            if (poster) {
                const style = window.getComputedStyle(poster);
                if (style.position === 'static') { poster.style.position = 'relative'; poster.style.overflow = 'hidden'; }

                pendingItems.push({ sid, iid, cont, poster, link });
            }
        });

        const originalQueueSize = globalFallbackQueue.length;
        const keptQueue = [];
        for (const qItem of globalFallbackQueue) {
            if (currentVisibleIds.has(qItem.id) || currentProcessingId === qItem.id) {
                keptQueue.push(qItem);
            } else {
                fallbackActiveIds.delete(qItem.id);
            }
        }
        globalFallbackQueue.length = 0;
        globalFallbackQueue.push(...keptQueue);
        if (originalQueueSize !== globalFallbackQueue.length) {
            log(`[Queue] Scrolled! Discarded ${originalQueueSize - globalFallbackQueue.length} off-screen tasks. Remaining: ${globalFallbackQueue.length}`);
        }

        if (pendingItems.length === 0 && itemsToRevalidate.length === 0) return;

        // 트랙 1: 즉시 실행 (캐시 렌더링)
        let instantRenderCount = 0;
        pendingItems.forEach(item => {
            const srvConfig = getServerConfig(item.sid);
            const cacheKey = srvConfig ? `L_${item.sid}_${item.iid}` : `F_${item.sid}_${item.iid}`;
            const cData = getMemoryCache(cacheKey);

            if (cData) {
                let displayData = { ...cData, tags: applyUserTags(cData.p, cData.tags) };
                renderListBadges(item.cont, item.poster, item.link, displayData, srvConfig, item.iid);
                item.isRendered = true;
                instantRenderCount++;
            }
        });

        if (instantRenderCount > 0) log(`[List Fast-Track] Instantly rendered ${instantRenderCount} items from memory cache.`);

        // 트랙 2: DB 요청 및 SWR 업데이트
        const revalServerMap = {};
        itemsToRevalidate.forEach(item => {
            if (!revalServerMap[item.sid]) revalServerMap[item.sid] = new Set();
            revalServerMap[item.sid].add(item.iid);
        });

        if (Object.keys(revalServerMap).length === 0) return;
        if (swrDebounceTimer) clearTimeout(swrDebounceTimer);

        swrDebounceTimer = setTimeout(async () => {
            if (session !== currentRenderSession) return;

            log(`[List SWR] Screen stabilized. Processing validation for current view...`);

            for (const [serverId, idSet] of Object.entries(revalServerMap)) {
                if (session !== currentRenderSession) break;

                const plexSrv = extractPlexServerInfo(serverId);
                if (!plexSrv) continue;

                const srvConfig = getServerConfig(serverId);

                // 분기 A: 친구 서버
                if (!srvConfig) {
                    log(`[List] Friend's Server (${serverId}) detected. Read-Only mode.`);
                    idSet.forEach(id => {
                        const isMissingData = !getMemoryCache(`F_${serverId}_${id}`);

                        if (isMissingData && !fallbackActiveIds.has(id)) {
                            fallbackActiveIds.add(id);
                            globalFallbackQueue.push({
                                id: id,
                                session: session,
                                task: async () => {
                                    if (session !== currentRenderSession) return;
                                    try {
                                        let meta = await fetchPlexMetaFallback(id, plexSrv);
                                        if (meta) {
                                            const localData = convertPlexMetaToLocalData(meta, id);
                                            setMemoryCache(`F_${serverId}_${id}`, localData);

                                            let displayData = { ...localData, tags: applyUserTags(localData.p, localData.tags) };

                                            const liveWrappers = document.querySelectorAll(`div[data-testid^="cellItem"], div[class*="ListItem-container"], div[class*="MetadataPosterCard-container"]`);
                                            for (const live of liveWrappers) {
                                                const liveLink = live.querySelector('a[href*="key="]') || live.querySelector('a[href*="/metadata/"]');
                                                if (liveLink && decodeURIComponent(liveLink.getAttribute('href') || '').includes(id)) {
                                                    let livePoster = live.querySelector(`[class*="PosterCard-card-"], [class*="MetadataSimplePosterCard-card-"], [class*="ThumbCard-card-"], [class*="Card-card-"], [class*="ThumbCard-imageContainer"], [data-testid="metadata-poster"]`);
                                                    if (!livePoster && live.classList.contains('ListItem-container')) livePoster = live.firstElementChild;
                                                    if (livePoster) {
                                                        renderListBadges(live, livePoster, liveLink, displayData, null, id);
                                                    }
                                                }
                                            }
                                        }
                                    } catch (e) {
                                    } finally {
                                        fallbackActiveIds.delete(id);
                                    }
                                }
                            });
                            processGlobalFallbackQueue();
                        }
                    });
                    continue;
                }

                // 분기 B: 내 서버 (DB + SWR)
                const idsToFetch = Array.from(idSet);
                if (idsToFetch.length === 0) continue;

                let swrUpdateCount = 0;
                let fallbackQueueCount = 0;

                try {
                    const dbData = await makeRequest(`${srvConfig.pmhServerUrl}/api/library/batch`, 'POST', { ids: idsToFetch }, srvConfig.plexMateApiKey);

                    for (const [id, info] of Object.entries(dbData)) {
                        const cKey = `L_${serverId}_${id}`;
                        const cData = getMemoryCache(cKey);
                        const isDataChanged = !cData || JSON.stringify(cData) !== JSON.stringify(info);

                        if (isDataChanged) {
                            setMemoryCache(cKey, info);
                            swrUpdateCount++;
                            log(`[SWR] Data changed for ID: ${id}. Updating UI.`);

                            let displayData = { ...info, tags: applyUserTags(info.p, info.tags) };

                            const liveItems = document.querySelectorAll(`div[data-testid^="cellItem"], div[class*="ListItem-container"], div[class*="MetadataPosterCard-container"]`);
                            for (const live of liveItems) {
                                const liveLink = live.querySelector('a[href*="key="]') || live.querySelector('a[href*="/metadata/"]');
                                if (liveLink && decodeURIComponent(liveLink.getAttribute('href') || '').includes(id)) {
                                    let livePoster = live.querySelector(`[class*="PosterCard-card-"], [class*="MetadataSimplePosterCard-card-"], [class*="ThumbCard-card-"], [class*="Card-card-"], [class*="ThumbCard-imageContainer"], [data-testid="metadata-poster"]`);
                                    if (!livePoster && live.classList.contains('ListItem-container')) livePoster = live.firstElementChild;

                                    if (livePoster) {
                                        renderListBadges(live, livePoster, liveLink, displayData, srvConfig, id);
                                    }
                                }
                            }
                        }

                        // 미분석 데이터 큐 편입
                        const hasResBadge = info.tags.some(t => /8K|6K|4K|FHD|HD|SD/.test(t));
                        const isMissingData = (!info.g && state.listGuid) || (state.listTag && !hasResBadge);

                        if (isMissingData && info.p && currentProcessingId !== id && !fallbackActiveIds.has(id)) {
                            fallbackActiveIds.add(id);
                            fallbackQueueCount++;
                            const plexSrv = extractPlexServerInfo(serverId);

                            globalFallbackQueue.push({
                                id: id,
                                session: session,
                                task: async () => {
                                    if (session !== currentRenderSession) return;
                                    try {
                                        let meta = await fetchPlexMetaFallback(id, plexSrv);
                                        if (!meta) return;

                                        let updatedInfo = { g: info.g, p: info.p, tags: [...info.tags] };
                                        let needsUpdate = false;
                                        let fallbackTags = parsePlexFallbackTags(meta);
                                        const m = meta.Media && meta.Media[0] ? meta.Media[0] : null;

                                        if (m && (!m.width || m.width === 0) && !m.videoResolution) {
                                            infoLog(`[Analyze] Triggering Plex Server Analysis for ID: ${id}`);
                                            meta = await analyzeAndFetchPlexMeta(id, plexSrv);
                                            if (meta) fallbackTags = parsePlexFallbackTags(meta);
                                        }

                                        if (meta && meta.guid && !updatedInfo.g) {
                                            updatedInfo.g = meta.guid.split('://')[1]?.split('?')[0] || meta.guid;
                                            updatedInfo.raw_g = meta.guid;
                                            needsUpdate = true;
                                        }
                                        if (fallbackTags.length > 0) {
                                            if (!hasResBadge) {
                                                updatedInfo.tags = Array.from(new Set([...fallbackTags, ...updatedInfo.tags]));
                                                needsUpdate = true;
                                            } else if (fallbackTags.includes("SUB") && !updatedInfo.tags.includes("SUB")) {
                                                updatedInfo.tags.push("SUB");
                                                needsUpdate = true;
                                            }
                                        }

                                        if (needsUpdate && session === currentRenderSession) {
                                            setMemoryCache(`L_${serverId}_${id}`, updatedInfo);

                                            let displayData = { ...updatedInfo, tags: applyUserTags(updatedInfo.p, updatedInfo.tags) };

                                            const liveWrappers = document.querySelectorAll(`div[data-testid^="cellItem"], div[class*="ListItem-container"], div[class*="MetadataPosterCard-container"]`);
                                            for (const live of liveWrappers) {
                                                const liveLink = live.querySelector('a[href*="key="]') || live.querySelector('a[href*="/metadata/"]');
                                                if (liveLink && decodeURIComponent(liveLink.getAttribute('href') || '').includes(id)) {
                                                    let livePoster = live.querySelector(`[class*="PosterCard-card-"], [class*="MetadataSimplePosterCard-card-"], [class*="ThumbCard-card-"], [class*="Card-card-"], [class*="ThumbCard-imageContainer"], [data-testid="metadata-poster"]`);
                                                    if (!livePoster && live.classList.contains('ListItem-container')) livePoster = live.firstElementChild;

                                                    if (livePoster) {
                                                        renderListBadges(live, livePoster, liveLink, displayData, srvConfig, id);
                                                        infoLog(`[Fallback] Automatically updated live badge for ID: ${id}`);
                                                    }
                                                }
                                            }
                                        }
                                    } catch (e) {
                                    } finally {
                                        fallbackActiveIds.delete(id);
                                    }
                                }
                            });
                            processGlobalFallbackQueue();
                        }
                    }

                    if (swrUpdateCount > 0) infoLog(`[SWR] Updated ${swrUpdateCount} items with fresh DB data.`);
                    if (fallbackQueueCount > 0) infoLog(`[Queue] Added ${fallbackQueueCount} un-analyzed items to fallback queue.`);

                } catch (e) { errorLog(`[List SWR] DB Fetch failed for server ${serverId}`, e); }
            }
        }, 500);
    }

    // ==========================================
    // 7. 상세 모드 (Detail View) 처리
    // ==========================================
    function renderLoadingBox(container) {
        document.getElementById('plex-guid-box')?.remove();
        const loadingHtml = `
        <div id="plex-guid-box" style="margin-top: 15px; margin-bottom: 10px; width: 100%;">
            <div style="color:#e5a00d; font-size:16px; margin-bottom:8px; font-weight:bold; display:flex; align-items:center;">
                미디어 정보
            </div>
            <div style="display: flex; align-items: center; justify-content: center; padding: 20px 0; color: #adb5bd; font-size: 14px;">
                <i class="fas fa-spinner fa-spin" style="margin-right: 8px; font-size: 18px;"></i>
                데이터를 가져오고 있습니다...
            </div>
        </div>`;
        container.insertAdjacentHTML('afterend', loadingHtml);
        log("[UI Detail] Rendered skeleton loading box.");
    }

    async function processDetail(isManualRefresh = false) {
        const { serverId, itemId } = extractIds();
        if (!serverId || !itemId) return;

        if (!isManualRefresh && currentDisplayedItemId === itemId && document.getElementById('plex-guid-box')) return;

        let container = document.querySelector('div[data-testid="metadata-starRatings"]')?.parentElement
                     || document.querySelector('div[data-testid="metadata-ratings"]')?.parentElement
                     || document.querySelector('div[data-testid="metadata-top-level-items"]')
                     || document.querySelector('button[data-testid="preplay-play"]')?.parentElement?.parentElement
                     || document.querySelector('span[data-testid="metadata-line2"]')?.closest('div[style*="min-height"]');
        if (!container) return;

        const plexSrv = extractPlexServerInfo(serverId);
        if (!plexSrv) return;

        const srvConfig = getServerConfig(serverId);
        const session = currentRenderSession;
        const cacheKey = srvConfig ? `D_${serverId}_${itemId}` : `F_${serverId}_${itemId}`;

        isFetchingDetail = true;
        infoLog(`[Detail] Processing UI for Item: ${itemId}. Configured Local: ${!!srvConfig}`);

        if (!isManualRefresh) {
            const cData = getMemoryCache(cacheKey);
            if (cData) {
                infoLog(`[Detail] Instant render from Memory Cache for Item: ${itemId}`);
                document.getElementById('plex-guid-box')?.remove();
                renderDetailHtml(cData, serverId, srvConfig, container);
                currentDisplayedItemId = itemId;
                isFetchingDetail = false;
                return;
            } else {
                renderLoadingBox(container);
            }
        }

        try {
            if (!srvConfig) {
                let meta = await fetchPlexMetaFallback(itemId, plexSrv);
                if (meta && session === currentRenderSession) {
                    let friendData = convertPlexMetaToLocalData(meta, itemId);
                    setMemoryCache(cacheKey, friendData);
                    document.getElementById('plex-guid-box')?.remove();
                    renderDetailHtml(friendData, serverId, null, container);
                    currentDisplayedItemId = itemId;
                }
                return;
            }

            infoLog(`[Detail] Fetching latest DB data for Item: ${itemId}`);
            let data = await makeRequest(`${srvConfig.pmhServerUrl}/api/media/${itemId}`, "GET", null, srvConfig.plexMateApiKey);
            if (session !== currentRenderSession) return;

            let hasMissingData = false;
            if (data.type === 'video' && data.versions) {
                hasMissingData = data.versions.some(v => !v.width || v.width === 0);
            }

            if (hasMissingData) {
                let meta = await fetchPlexMetaFallback(itemId, plexSrv);

                let stillMissing = false;
                if (meta && meta.Media) {
                    stillMissing = meta.Media.some(m => !m.width || m.width === 0);
                }

                if (stillMissing) {
                    if (isManualRefresh) {
                        toastr.info("미분석 파일이 발견되어 Plex에 분석을 요청했습니다.", "분석 대기 중", {timeOut: 8000});
                    }
                    meta = await analyzeAndFetchPlexMeta(itemId, plexSrv);
                }

                if (meta && data.versions) {
                    if (meta.guid) data.guid = meta.guid;
                    if (meta.duration) data.duration = meta.duration;
                    if (meta.Marker) {
                        data.markers = {};
                        meta.Marker.forEach(mk => {
                            if (mk.type === 'intro' || mk.type === 'credits') {
                                data.markers[mk.type] = { start: mk.startTimeOffset, end: mk.endTimeOffset };
                            }
                        });
                    }

                    if (meta.Media && meta.Media.length > 0) {
                        meta.Media.sort((a, b) => (b.width || 0) - (a.width || 0) || (b.bitrate || 0) - (a.bitrate || 0));
                        data.versions.forEach((v, index) => {
                            const m = meta.Media[index];
                            if (!m) return;

                            v.width = m.width || v.width;
                            v.v_codec = m.videoCodec || v.v_codec;
                            v.a_codec = m.audioCodec || v.a_codec;
                            v.a_ch = m.audioChannels || v.a_ch;
                            v.v_bitrate = m.bitrate ? m.bitrate * 1000 : v.v_bitrate;
                            if (!v.file && m.Part && m.Part.length > 0) v.file = m.Part[0].file;

                            const tempMeta = { Media: [m] };
                            const fallbackTags = parsePlexFallbackTags(tempMeta);

                            if (fallbackTags.length > 0) {
                                const vTag = fallbackTags[0];
                                if (vTag.includes('DV') || vTag.includes('HDR')) {
                                    v.video_extra = " " + vTag.replace(/8K|6K|4K|FHD|HD|SD/g, '').trim();
                                }
                            }

                            if ((!v.subs || v.subs.length === 0) && m.Part && m.Part[0].Stream) {
                                v.subs = m.Part[0].Stream.filter(s => s.streamType === 3).map(s => ({
                                    id: s.id,
                                    languageCode: (s.languageCode || s.language || "und").toLowerCase().substring(0,3),
                                    codec: s.codec || "unknown",
                                    key: s.key || "",
                                    format: s.codec || "unknown"
                                }));
                            }
                        });
                    }
                }
            }

            if (session !== currentRenderSession) return;

            const cData = getMemoryCache(cacheKey);
            const isChanged = !cData || JSON.stringify(cData) !== JSON.stringify(data);

            if (isChanged || isManualRefresh) {
                setMemoryCache(cacheKey, data);
                document.getElementById('plex-guid-box')?.remove();
                renderDetailHtml(data, serverId, srvConfig, container);
                currentDisplayedItemId = itemId;
            }

        } catch (e) {
            errorLog("[processDetail] Fetch error:", e);
            const box = document.getElementById('plex-guid-box');
            if (box && !getMemoryCache(cacheKey)) {
                box.innerHTML = `<div style="color:red; font-size:13px; padding:10px;">데이터를 불러오는 중 오류가 발생했습니다.</div>`;
            }
        } finally {
            isFetchingDetail = false;
        }
    }

    function renderDetailHtml(data, serverId, srvConfig, container) {
        let versionsHtml = '';
        const plexSrv = extractPlexServerInfo(serverId);

        const formatBitrate = (bps) => {
            if (!bps || isNaN(bps)) return '';
            const val = parseInt(bps, 10);
            if (val >= 1000000) return `${(val / 1000000).toFixed(1)} Mbps`;
            if (val >= 1000) return `${Math.round(val / 1000)} Kbps`;
            return `${val} bps`;
        };

        if (data.type === 'directory' && data.versions && data.versions.length > 0) {
            versionsHtml = data.versions.map(v => {
                const rPath = v.file;
                if (!rPath) return '';

                if (!srvConfig) {
                    return `
                    <div class="media-version-block" style="border: 0; margin-bottom: 6px;">
                        <div class="media-info-line" style="display: flex; align-items: center; grid-template-columns: none; gap: 10px;">
                            <div style="flex-shrink: 0;">
                                <span style="color:#555;" title="친구 서버는 폴더 열기를 지원하지 않습니다."><i class="fas fa-folder-open"></i></span>
                            </div>
                            <div style="flex-grow: 1; min-width: 0; font-size: 12px; color: #555; font-style: italic;">
                                원격 서버 경로 숨김
                            </div>
                        </div>
                    </div>`;
                }

                const ePath = encodeURIComponent(getLocalPath(rPath).replace(/\\/g, '/')).replace(/\(/g, '%28').replace(/\)/g, '%29');

                return `
                <div class="media-version-block" style="border: 0; margin-bottom: 6px;">
                    <div class="media-info-line" style="display: flex; align-items: center; grid-template-columns: none; gap: 10px;">
                        <div style="flex-shrink: 0;">
                            <a href="plexfolder://${ePath}" class="plex-guid-action plex-open-folder" title="폴더 열기"><i class="fas fa-folder-open"></i></a>
                        </div>
                        <!-- [수정] 좌우 여백 확보 (padding-left/right 적용) -->
                        <div style="flex-grow: 1; min-width: 0; font-size: 12px; color: #ccc; word-break: break-all; overflow-wrap: anywhere; line-height: 1.3; padding-left: 5px; padding-right: 10px;">
                            <a href="#" class="plex-path-scan-link" data-path="${rPath}" data-section-id="${data.librarySectionID}" data-type="directory">${emphasizeFileName(rPath)}</a>
                        </div>
                    </div>
                </div>`;
            }).join('');

        } else if (data.type === 'video') {
            versionsHtml = data.versions.map(v => {
                const vRes = v.width >= 7000 ? '8K' : v.width >= 5000 ? '6K' : v.width >= 3400 ? '4K' : v.width >= 1900 ? 'FHD' : v.width >= 1200 ? 'HD' : 'SD';

                const vbTxt = formatBitrate(v.v_bitrate);
                const abTxt = formatBitrate(v.a_bitrate);
                const vTxt = `${(v.v_codec||'').toUpperCase()}${v.video_extra || ''} ${vbTxt ? `(${vbTxt})` : ''}`;
                const ch = v.a_ch==6 ? '5.1' : v.a_ch==8 ? '7.1' : v.a_ch==2 ? '2.0' : v.a_ch ? `${v.a_ch}ch` : '';
                const aTxt = `${(v.a_codec||'').toUpperCase()} ${ch} ${abTxt ? `(${abTxt})` : ''}`;

                let videoFilename = 'subtitle';
                if (v.file) {
                    const pathParts = v.file.split(/[\\/]/);
                    const fullName = pathParts[pathParts.length - 1];
                    const lastDot = fullName.lastIndexOf('.');
                    videoFilename = lastDot > 0 ? fullName.substring(0, lastDot) : fullName;
                }

                const korSubs = v.subs?.filter(s => s.languageCode === 'kor' || s.languageCode === 'ko') || [];
                let bestSub = null;

                if (korSubs.length > 0) {
                    korSubs.sort((a, b) => {
                        const getScore = (sub) => {
                            let score = 0;
                            if (sub.key && sub.key.trim() !== '') score += 100;
                            if (['srt', 'ass', 'smi', 'vtt', 'ssa', 'sub'].includes(sub.codec?.toLowerCase())) score += 50;
                            return score;
                        };
                        return getScore(b) - getScore(a);
                    });
                    bestSub = korSubs[0];
                }

                let subHtml = '없음';
                if (bestSub) {
                    const isDownloadable = (bestSub.key && bestSub.key.trim() !== '') || ['srt', 'ass', 'smi', 'vtt', 'ssa', 'sub'].includes(bestSub.codec?.toLowerCase());
                    if (isDownloadable) {
                        subHtml = `<a href="javascript:void(0);" class="plex-guid-action plex-kor-subtitle-download" data-stream-id="${bestSub.id}" data-key="${bestSub.key || ''}" data-fmt="${bestSub.format}" data-vname="${videoFilename}"><i class="fas fa-download"></i></a> Kor (${bestSub.format})`;
                    } else {
                        subHtml = `Kor (${bestSub.format})`;
                    }
                } else if (v.subs?.length > 0) {
                    subHtml = `기타 언어 (${v.subs.length}개)`;
                }

                const isHardsub = v.file && /kor-?sub|자체자막/i.test(v.file);
                if (!bestSub && isHardsub) {
                    subHtml = `자체자막(하드섭)`;
                }

                let streamHtml = `<a href="#" class="plex-guid-action plex-play-stream"><i class="fas fa-wifi"></i></a>`;
                if (plexSrv && v.part_id) {
                    const vUrl = `${plexSrv.url}/library/parts/${v.part_id}/0/file?X-Plex-Token=${plexSrv.token}`;
                    let sUrl = '';
                    if (bestSub && bestSub.key && bestSub.key.startsWith('/library/streams/')) {
                        sUrl = `${plexSrv.url}${bestSub.key}?X-Plex-Token=${plexSrv.token}`;
                    } else if (bestSub) {
                        sUrl = `${plexSrv.url}/library/streams/${bestSub.id}?X-Plex-Token=${plexSrv.token}`;
                    }
                    streamHtml = `<a href="plexstream://${encodeURIComponent(vUrl) + '%7C' + encodeURIComponent(sUrl)}" class="plex-guid-action plex-play-stream" title="팟플레이어 스트리밍 (자막 포함)"><i class="fas fa-wifi"></i></a>`;
                }

                let playExternalHtml = `<span style="color:#555;" title="친구 서버는 지원하지 않습니다."><i class="fas fa-play"></i></span>`;
                let openFolderHtml = `<span style="color:#555;" title="친구 서버는 지원하지 않습니다."><i class="fas fa-folder-open"></i></span>`;
                let pathLinkHtml = '';

                if (srvConfig) {
                    const ePath = encodeURIComponent(getLocalPath(v.file).replace(/\\/g, '/')).replace(/\(/g, '%28').replace(/\)/g, '%29');
                    playExternalHtml = `<a href="plexplay://${ePath}" class="plex-guid-action plex-play-external" title="외부 플레이어 재생"><i class="fas fa-play"></i></a>`;
                    openFolderHtml = `<a href="plexfolder://${ePath}" class="plex-guid-action plex-open-folder" title="폴더 열기"><i class="fas fa-folder-open"></i></a>`;

                    const uTags = applyUserTags(v.file, []);
                    const uTagsHtml = uTags.length > 0
                        ? uTags.map(t => `<span style="background-color:#e5a00d; color:#1f1f1f; padding:1px 4px; border-radius:3px; font-weight:bold; margin-right:6px; font-size:10px; vertical-align:middle;">${t}</span>`).join('')
                        : '';

                    pathLinkHtml = `
                    <div style="font-size: 12px; color: #9E9E9E; padding-left: 8px; padding-right: 10px; margin-top: 4px; word-break: break-all; overflow-wrap: anywhere; line-height: 1.3;">
                        ${uTagsHtml}<a href="#" class="plex-path-scan-link" data-path="${v.file}" data-section-id="${data.librarySectionID}" data-type="video" title="클릭하여 Plex Mate로 스캔">${emphasizeFileName(v.file)}</a>
                    </div>`;
                } else {
                    let justFileName = "Unknown File";
                    if (v.file) {
                        const pathParts = v.file.split(/[\\/]/);
                        justFileName = pathParts[pathParts.length - 1];
                    }

                    const uTags = applyUserTags(v.file, []);
                    const uTagsHtml = uTags.length > 0
                        ? uTags.map(t => `<span style="background-color:#e5a00d; color:#1f1f1f; padding:1px 4px; border-radius:3px; font-weight:bold; margin-right:6px; font-size:10px; vertical-align:middle;">${t}</span>`).join('')
                        : '';

                    pathLinkHtml = `
                    <div style="font-size: 12px; color: #555; padding-left: 8px; padding-right: 10px; margin-top: 4px; font-style: italic; word-break: break-all; overflow-wrap: anywhere; line-height: 1.3;">
                        ${uTagsHtml}${justFileName} (원격)
                    </div>`;
                }

                return `
                <div class="media-version-block" style="border-bottom:1px solid rgba(255,255,255,0.15); padding-bottom:4px; margin-bottom:4px;">
                    <div class="media-info-line">
                        <div class="info-block"><span class="info-label">외부재생</span><span class="info-value">${playExternalHtml}</span></div>
                        <div class="info-block"><span class="info-label">스트리밍</span><span class="info-value">${streamHtml}</span></div>
                        <div class="info-block"><span class="info-label">폴더열기</span><span class="info-value">${openFolderHtml}</span></div>
                        <div class="info-block"><span class="info-label">해상도</span><span class="info-value">${vRes}</span></div>
                        <div class="info-block"><span class="info-label">비디오</span><span class="info-value">${vTxt}</span></div>
                        <div class="info-block"><span class="info-label">오디오</span><span class="info-value">${aTxt}</span></div>
                        <div class="info-block"><span class="info-label">자막</span><span class="info-value">${subHtml}</span></div>
                    </div>
                    ${pathLinkHtml}
                </div>`;
            }).join('');
        }

        const mateBtnHtml = (srvConfig && srvConfig.plexMateUrl && srvConfig.plexMateApiKey) ?
            `<div style="margin-bottom: 4px; display:flex; align-items:center;">
                <div style="width: 95px; color: #bababa; font-size:13px; font-weight:500;">PLEX MATE</div>
                <a href="#" id="plex-mate-refresh-button" data-itemid="${data.itemId}"><i class="fas fa-bolt"></i> YAML/TMDB 반영</a>
             </div>` : '';

        let rawGuid = data.guid || '';
        let displayGuid = '-';
        let guidHtml = `<span style="font-size:13px; color:#E0E0E0; word-break: break-all; overflow-wrap: anywhere; line-height: 1.3; padding-right: 10px;">-</span>`;

        if (rawGuid) {
            displayGuid = rawGuid.replace(/^com\.plexapp\.agents\./, '').replace(/^tv\.plex\.agents\./, '').replace(/\?lang.*$/, '');
            if (rawGuid.startsWith('plex://')) {
                guidHtml = `<a href="${rawGuid}" class="plex-guid-link" style="font-size:13px; word-break: break-all; overflow-wrap: anywhere; line-height: 1.3; padding-right: 10px;" title="Plex 앱에서 열기">${displayGuid}</a>`;
            } else {
                guidHtml = `<span style="font-size:13px; color:#E0E0E0; word-break: break-all; overflow-wrap: anywhere; line-height: 1.3; padding-right: 10px;">${displayGuid}</span>`;
            }
        }

        let markersHtml = '';
        if (data.markers) {
            if (data.markers.intro) {
                markersHtml += `<span style="margin-left:12px; color:#a3a3a3;" title="인트로"><i class="fas fa-film" style="margin-right:4px;"></i>Intro: ${formatDuration(data.markers.intro.start)} ~ ${formatDuration(data.markers.intro.end)}</span>`;
            }
            if (data.markers.credits) {
                markersHtml += `<span style="margin-left:12px; color:#a3a3a3;" title="크레딧"><i class="fas fa-video" style="margin-right:4px;"></i>Credit: ${formatDuration(data.markers.credits.start)} ~ ${formatDuration(data.markers.credits.end)}</span>`;
            }
        }

        const boxHtml = `
        <div id="plex-guid-box" style="margin-top: 15px; margin-bottom: 10px; width: 100%; position: relative;">
            <div style="color:#e5a00d; font-size:16px; margin-bottom:8px; font-weight:bold; display:flex; align-items:center;">
                미디어 정보
                <span id="refresh-guid-button" title="새로고침(강제 재조회 및 필요시 분석)" style="cursor: pointer; font-size: 14px; margin-left: 8px; color: #adb5bd; transition: 0.2s;"><i class="fas fa-sync-alt"></i></span>
            </div>
            <div id="plex-guid-content">
                ${versionsHtml}
                ${mateBtnHtml}
                <div style="display:flex; align-items:center; margin-bottom: 4px;">
                    <div style="width: 95px; flex-shrink: 0; color: #bababa; font-size:13px; font-weight:500;">GUID</div>
                    ${guidHtml}
                </div>
                ${data.duration ? `
                <div style="display:flex; align-items:center;">
                    <div style="width: 95px; flex-shrink: 0; color: #bababa; font-size:13px; font-weight:500;">재생 시간</div>
                    <span style="font-size:13px; color:#E0E0E0;"><i class="fas fa-clock" style="color:#bdbdbd; margin-right:4px;"></i>${formatDuration(data.duration)}</span>
                    ${markersHtml}
                </div>` : ''}
            </div>
        </div>`;

        container.insertAdjacentHTML('afterend', boxHtml);

        const refreshBtn = document.getElementById('refresh-guid-button');
        if (refreshBtn) {
            const newRefreshBtn = refreshBtn.cloneNode(true);
            refreshBtn.parentNode.replaceChild(newRefreshBtn, refreshBtn);

            newRefreshBtn.addEventListener('click', (e) => {
                e.preventDefault(); e.stopPropagation();
                log("[Action] Detail Refresh Button Clicked.");

                newRefreshBtn.style.pointerEvents = "none";
                const icon = newRefreshBtn.querySelector('i');
                if (icon) icon.classList.add('fa-spin');

                const box = document.getElementById('plex-guid-box');
                const content = document.getElementById('plex-guid-content');
                if (box && content) {
                    content.style.transition = "opacity 0.3s";
                    content.style.opacity = "0.2";
                    box.style.pointerEvents = "none";

                    const overlay = document.createElement('div');
                    overlay.style.position = "absolute";
                    overlay.style.top = "0"; overlay.style.left = "0";
                    overlay.style.width = "100%"; overlay.style.height = "100%";
                    overlay.style.display = "flex"; overlay.style.alignItems = "center"; overlay.style.justifyContent = "center";
                    overlay.innerHTML = `<i class="fas fa-spinner fa-spin" style="font-size: 30px; color: #e5a00d;"></i>`;
                    box.appendChild(overlay);
                }

                deleteMemoryCache(`D_${serverId}_${data.itemId}`);
                currentDisplayedItemId = null;
                setTimeout(() => { processDetail(true); }, 100);
            });
        }

        document.querySelectorAll('#plex-guid-box .plex-play-external, #plex-guid-box .plex-open-folder, #plex-guid-box .plex-play-stream').forEach(el => {
            el.addEventListener('click', () => { toastr.info('명령을 실행합니다.'); });
        });

        document.querySelectorAll('#plex-guid-box .plex-kor-subtitle-download').forEach(el => {
            el.addEventListener('click', (e) => {
                e.preventDefault(); e.stopPropagation();
                log("[Action] Subtitle Download Clicked.");
                if(!plexSrv) return toastr.error("토큰을 찾을 수 없습니다.");

                const dataKey = el.dataset.key;
                const streamId = el.dataset.streamId;
                const vName = el.dataset.vname || 'subtitle';
                const finalFileName = `${vName}.ko.${el.dataset.fmt}`;

                const url = (dataKey && dataKey.startsWith('/library/streams/'))
                            ? `${plexSrv.url}${dataKey}?X-Plex-Token=${plexSrv.token}`
                            : `${plexSrv.url}/library/streams/${streamId}?X-Plex-Token=${plexSrv.token}`;

                toastr.info(`[${finalFileName}]<br>다운로드를 시작합니다.`, "자막 다운로드");

                GM_xmlhttpRequest({
                    method: 'GET', url: url, responseType: 'blob',
                    onload: (r) => {
                        if (r.status >= 200 && r.status < 300) {
                            try {
                                const a = document.createElement('a');
                                const objectUrl = URL.createObjectURL(r.response);
                                a.href = objectUrl; a.download = finalFileName;
                                document.body.appendChild(a); a.click(); document.body.removeChild(a);
                                URL.revokeObjectURL(objectUrl);
                                toastr.success("자막 다운로드 완료.");
                                log(`[Download] Success: ${finalFileName}`);
                            } catch(err) { errorLog("[Download] Blob creation error", err); toastr.error("파일 처리 중 오류가 발생했습니다."); }
                        } else {
                            errorLog(`[Download] Server error: ${r.status}`);
                            toastr.error(`서버 응답 오류 (HTTP ${r.status})`, "다운로드 실패");
                        }
                    },
                    onerror: () => {
                        errorLog("[Download] Network error");
                        toastr.error("서버에 연결할 수 없습니다.", "다운로드 실패");
                    }
                });
            });
        });

        if (!srvConfig) return;

        const callPlexMateFormAPI = (endpoint, paramsObj) => {
            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: 'POST', url: srvConfig.plexMateUrl + endpoint,
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    data: new URLSearchParams(paramsObj).toString(),
                    timeout: 60000,
                    onload: r => { try { resolve(JSON.parse(r.responseText)); } catch(e) { reject("Parse Error"); } },
                    onerror: () => reject("Network Error"),
                    ontimeout: () => reject("Timeout Error")
                });
            });
        };

        document.querySelectorAll('#plex-guid-box .plex-path-scan-link').forEach(el => {
            el.addEventListener('click', async (e) => {
                e.preventDefault(); e.stopPropagation();
                log("[Action] Plex Mate Scan Clicked.");
                if (!srvConfig.plexMateUrl || !srvConfig.plexMateApiKey) return toastr.error("Plex Mate 설정 누락");

                let scanPath = el.dataset.path;
                const sectionId = el.dataset.sectionId;
                if (el.dataset.type === 'video') {
                    const lastSlash = Math.max(scanPath.lastIndexOf('/'), scanPath.lastIndexOf('\\'));
                    if (lastSlash > -1) scanPath = scanPath.substring(0, lastSlash);
                }

                const originalHtml = el.innerHTML;
                el.style.pointerEvents = 'none';
                el.innerHTML = `<i class="fas fa-spinner fa-spin"></i> 스캔 요청 중...`;

                try {
                    toastr.info(`[1/2] VFS 새로고침 요청 중...<br>${scanPath}`, "Web 스캔 시작", {timeOut: 3000});
                    const vfsRes = await callPlexMateFormAPI('/plex_mate/api/scan/vfs_refresh', { apikey: srvConfig.plexMateApiKey, target: scanPath, recursive: 'true', async: 'false' });
                    if (vfsRes.ret !== 'success') throw new Error(vfsRes.msg || "VFS 갱신 실패");

                    toastr.info(`[2/2] VFS 완료. 라이브러리 스캔 요청 중...`, "스캔", {timeOut: 3000});
                    const scanRes = await callPlexMateFormAPI('/plex_mate/api/scan/do_scan', { apikey: srvConfig.plexMateApiKey, target: scanPath, target_section_id: sectionId, scanner: 'web' });

                    if (scanRes.ret === 'success') {
                        toastr.success('Plex Mate 스캔 완료!', '성공');
                        log("[PlexMate] Scan successful.");
                    } else throw new Error(scanRes.msg || "스캔 요청 실패");
                } catch (err) {
                    errorLog("[PlexMate] Scan error:", err);
                    toastr.error(`오류 발생: ${err.message || err}`, '스캔 실패');
                }
                finally { el.style.pointerEvents = 'auto'; el.innerHTML = originalHtml; }
            });
        });

        const mateBtn = document.getElementById('plex-mate-refresh-button');
        if (mateBtn) {
            mateBtn.addEventListener('click', async (e) => {
                e.preventDefault(); e.stopPropagation();
                log("[Action] Plex Mate YAML Refresh Clicked.");
                if (!srvConfig.plexMateUrl || !srvConfig.plexMateApiKey) return toastr.error("Plex Mate 설정 누락");

                const originalHtml = mateBtn.innerHTML;
                mateBtn.style.pointerEvents = 'none';
                mateBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> 요청 중...`;
                toastr.info('plex_mate에 YAML/TMDB 반영을 요청합니다...');

                try {
                    const res = await callPlexMateFormAPI('/plex_mate/api/scan/manual_refresh', { apikey: srvConfig.plexMateApiKey, metadata_item_id: mateBtn.dataset.itemid });
                    if (res.ret === 'success') {
                        deleteMemoryCache(`D_${serverId}_${data.itemId}`);
                        deleteMemoryCache(`L_${serverId}_${data.itemId}`);
                        log(`[PlexMate] Cache invalidated for Item: ${data.itemId}`);

                        toastr.success('YAML/TMDB 반영 성공!<br>화면을 이동하거나 새로고침 시 최신 데이터가 적용됩니다.', '', {timeOut: 8000});
                        log("[PlexMate] Refresh successful.");
                    } else throw new Error(res.msg || "반영 오류");
                } catch (err) {
                    errorLog("[PlexMate] Refresh error:", err);
                    toastr.error(`반영 실패: ${err.message || err}`, '오류');
                }
                finally { mateBtn.style.pointerEvents = 'auto'; mateBtn.innerHTML = originalHtml; }
            });
        }
    }

    // ==========================================
    // 8. 앱 라우팅(SPA) 및 Observer
    // ==========================================
    function checkUrlChange(force = false) {
        if (window.location.href !== currentUrl || force) {
            currentUrl = window.location.href;
            log(`[Router] URL changed to: ${currentUrl}`);

            currentRenderSession++;
            abortAllRequests();

            document.getElementById('plex-guid-box')?.remove();
            currentDisplayedItemId = null;

            injectControlUI();

            if (window.location.hash.includes('/details?key=')) {
                setTimeout(processDetail, 500);
            }
            setTimeout(processList, 500);
        }
    }

    const observer = new MutationObserver(() => {
        if (!document.getElementById('pmdv-controls')) injectControlUI();

        if (window.location.hash.includes('/details?key=')) {
            if (!document.getElementById('plex-guid-box') && !isFetchingDetail) {
                const target = document.querySelector('div[data-testid="metadata-top-level-items"]')
                            || document.querySelector('div[data-testid="metadata-starRatings"]')
                            || document.querySelector('div[data-testid="metadata-ratings"]')
                            || document.querySelector('button[data-testid="preplay-play"]')
                            || document.querySelector('span[data-testid="metadata-line2"]');
                if (target) {
                    if(observer.detailTimer) clearTimeout(observer.detailTimer);
                    observer.detailTimer = setTimeout(() => {
                        log("[Observer] Detail target found. Triggering processDetail.");
                        processDetail();
                    }, 200);
                }
            }
        }

        const allListItems = document.querySelectorAll(`
            div[data-testid^="cellItem"],
            div[class*="ListItem-container"],
            div[class*="MetadataPosterCard-container"]
        `);

        let needsRender = false;
        let triggerReason = "";

        for (const cont of allListItems) {
            let link = cont.querySelector('a[data-testid="metadataTitleLink"]');
            if (!link) {
                const fallbackLinks = cont.querySelectorAll('a[href*="key="], a[href*="/metadata/"]');
                link = fallbackLinks[0];
            }
            if (!link) continue;

            let iid = null;
            try {
                const keyParam = new URLSearchParams(link.getAttribute('href').split('?')[1]).get('key');
                if (keyParam) iid = decodeURIComponent(keyParam).split('/metadata/')[1]?.split(/[\/?]/)[0];
            } catch(e) {}

            if (iid) {
                const marker = cont.querySelector('.pmh-render-marker');
                if (!marker || marker.getAttribute('data-iid') !== iid) {
                    needsRender = true;
                    triggerReason = !marker ? `No marker found for ID ${iid}` : `Mismatched ID. Old: ${marker.getAttribute('data-iid')}, New: ${iid}`;
                    break;
                }
            }
        }

        if (needsRender) {
            if(observer.listTimer) clearTimeout(observer.listTimer);
            observer.listTimer = setTimeout(() => {
                log(`[Observer] Triggering processList. Reason: ${triggerReason}`);
                processList();
            }, 50);
        }
    });

    const pushState = history.pushState;
    history.pushState = function(...a) { pushState.apply(this, a); setTimeout(() => checkUrlChange(), 50); };
    const replaceState = history.replaceState;
    history.replaceState = function(...a) { replaceState.apply(this, a); setTimeout(() => checkUrlChange(), 50); };
    window.addEventListener('popstate', () => setTimeout(() => checkUrlChange(), 50));

    GM_registerMenuCommand('PMH 설정 (JSON)', () => {
        if(document.getElementById('pmh-settings-modal')) return;

        const modalHtml = `
            <div id="pmh-settings-modal" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0,0,0,0.7); z-index: 10000; display: flex; justify-content: center; align-items: center;">
                <div style="background-color: #282c34; color: #abb2bf; padding: 20px; border-radius: 8px; width: 80%; max-width: 700px; max-height: 90vh; display: flex; flex-direction: column; box-shadow: 0 5px 15px rgba(0,0,0,0.5);">
                    <h2 style="margin-top: 0; border-bottom: 1px solid #444; padding-bottom: 10px;">Plex Meta Helper 설정 (JSON)</h2>
                    <p style="font-size: 13px; margin-top: 0;">아래 텍스트를 JSON 형식에 맞게 수정한 후 저장하세요.</p>
                    <textarea id="pmh-settings-textarea" style="width: 95%; flex-grow: 1; min-height: 430px; background-color: #1e1e1e; color: #d4d4d4; border: 1px solid #555; border-radius: 4px; padding: 10px; font-family: monospace; font-size: 14px; resize: vertical;"></textarea>
                    <div style="margin-top: 15px; text-align: right;">
                        <button id="pmh-settings-save" style="padding: 8px 15px; background-color: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer; margin-right: 10px;">저장</button>
                        <button id="pmh-settings-cancel" style="padding: 8px 15px; background-color: #f44336; color: white; border: none; border-radius: 4px; cursor: pointer;">취소</button>
                        <button id="pmh-settings-reset" style="padding: 8px 15px; background-color: #666; color: white; border: none; border-radius: 4px; cursor: pointer; float: left;">기본값으로 초기화</button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);
        const textarea = document.getElementById('pmh-settings-textarea');
        textarea.value = JSON.stringify(getSettings(), null, 4);

        document.getElementById('pmh-settings-save').onclick = () => {
            try {
                const newSettings = JSON.parse(textarea.value);
                GM_setValue(SETTINGS_KEY, newSettings);
                toastr.success("설정이 저장되었습니다. 페이지를 새로고침합니다.");
                setTimeout(() => location.reload(), 500);
            } catch (e) { alert("JSON 형식이 올바르지 않습니다."); }
        };

        document.getElementById('pmh-settings-cancel').onclick = () => document.getElementById('pmh-settings-modal').remove();

        document.getElementById('pmh-settings-reset').onclick = () => {
            if (confirm("정말로 모든 설정을 기본값으로 되돌리시겠습니까?")) {
                GM_deleteValue(SETTINGS_KEY);
                toastr.info("설정이 초기화되었습니다. 페이지를 새로고침합니다.");
                setTimeout(() => location.reload(), 500);
            }
        };
    });

    window.addEventListener('load', () => {
        infoLog('Script fully loaded. Waiting for user interaction...');
        observer.observe(document.body, { childList: true, subtree: true });
        checkUrlChange(true);
    });

})();
