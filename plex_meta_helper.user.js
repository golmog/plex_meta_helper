// ==UserScript==
// @name         Plex Meta Helper
// @namespace    https://tampermonkey.net/
// @version      0.3.1
// @description  Plex 컨텐츠의 메타 상세정보 표시, 캐시 관리, 외부 플레이어 재생/폴더 열기 (경로 설정 포함) + plex_mate 연동
// @author       saibi (외부 플레이어 기능: https://github.com/Kayomani/PlexExternalPlayer)
// @supportURL   https://github.com/golmog/plex_meta_helper/issues
// @updateURL    https://raw.githubusercontent.com/golmog/plex_meta_helper/main/plex_meta_helper.user.js
// @downloadURL  https://raw.githubusercontent.com/golmog/plex_meta_helper/main/plex_meta_helper.user.js
// @match        https://app.plex.tv/*
// @match        https://*.plex.tv/web/index.html*
// @match        https://*.plex.direct/*
// @match        https://*/web/index.html*
// @match        http://*:32400/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=plex.tv
// @require      https://code.jquery.com/jquery-3.6.0.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/toastr.js/latest/js/toastr.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/js/all.min.js
// @connect      localhost
// @connect      *
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_addStyle
// @grant        GM_setClipboard
// @run-at       document-idle
// ==/UserScript==

/* **** CSS 로드 **** */
GM_addStyle ( `
    /* toastr v2.1.4 */
    .toast-title{font-weight:700}.toast-message{word-wrap:break-word}.toast-message a,.toast-message label{color:#fff}.toast-message a:hover{color:#ccc;text-decoration:none}.toast-close-button{position:relative;right:-.3em;top:-.3em;float:right;font-size:20px;font-weight:700;color:#fff;text-shadow:#000 0 1px 0;opacity:.8}.toast-close-button:focus,.toast-close-button:hover{color:#000;text-decoration:none;cursor:pointer;opacity:.4}button.toast-close-button{padding:0;cursor:pointer;background:0 0;border:0;-webkit-appearance:none}.toast-top-center{top:0;right:0;width:100%}.toast-bottom-center{bottom:0;right:0;width:100%}.toast-top-full-width{top:0;right:0;width:100%}.toast-bottom-full-width{bottom:0;right:0;width:100%}.toast-top-left{top:12px;left:12px}.toast-top-right{top:12px;right:12px}.toast-bottom-right{right:12px;bottom:12px}.toast-bottom-left{bottom:12px;left:12px}#toast-container{position:fixed;z-index:999999;pointer-events:none}#toast-container *{box-sizing:border-box}#toast-container>div{position:relative;pointer-events:auto;overflow:hidden;margin:0 0 6px;padding:15px 15px 15px 50px;width:300px;border-radius:3px;background-position:15px center;background-repeat:no-repeat;box-shadow:#000 0 0 12px;color:#fff;opacity:.8}#toast-container>:focus{opacity:1;box-shadow:#000 0 0 12px}#toast-container>:hover{opacity:1;box-shadow:#000 0 0 12px;cursor:pointer}#toast-container>div.toast-error,#toast-container>div.toast-info,#toast-container>div.toast-success,#toast-container>div.toast-warning{background-size:20px 20px!important}.toast-error{background-image:url("data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIHZpZXdCb3g9IjAgMCAyNCAyNCI+CiAgICA8cGF0aCBmaWxsPSJ3aGl0ZSIgZD0iTTEzLDE0SDExVjExSDExLjAxTDExLDZIMTNWMTFNMTMsMThIMTFWMTZIMTNWMThaIiAvPgo8L3N2Zz4=")!important;background-color:#bd362f}.toast-success{background-image:url("data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIHZpZXdCb3g9IjAgMCAyNCAyNCI+CiAgICA8cGF0aCBmaWxsPSJ3aGl0ZSIgZD0iTTIxLDdMNSwxMUwxMSwxM0wxMyw5TDE5LDEzTDE0LDE3TDksMjdMMjEsN1oiIC8+Cjwvc3ZnPg==")!important;background-color:#51a351}.toast-info{background-image:url("data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIHZpZXdCb3g9IjAgMCAyNCAyNCI+CiAgICA8cGF0aCBmaWxsPSJ3aGl0ZSIgZD0iTTExLDE4SDEzVjE2SDExTTEyLDRBMTAsMTAsMCwwLDEsMjIsMTRBMTAsMTAsMCwwLDEsMTIsMjRBMTAsMTAsMCwwLDEsMiwxNEExMCwxMCwwLDAsMSwxMiw0TTEyLDZBMiwyLDAsMCwwLDEwLDhBMiwyLDAsMCwwLDEyLDEwQTIsMiwwLDAsMCwxNCw4QTIsMiwwLDAsMCwxMiw2TTEyLDEySDEwVjE0SDEyVjEyWiIgLz4KPC9zdmc+")!important;background-color:#2f96b4}.toast-warning{background-image:url("data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIHZpZXdCb3g9IjAgMCAyNCAyNCI+CiAgICA8cGF0aCBmaWxsPSJ3aGl0ZSIgZD0iTTEyLDE5QTEsMSwwLDAsMSwxMSwxOFYxNkExLDEsMCwwLDEsMTIsMTVBMQwxLDAsMCwxLDEzLDE2VjE4QTEsMSwwLDAsMSwxMiwxOU0xMSw3SDExLjAxTDExLDE0SDEzVjExTDEzLDdIMTFNMTIsMkwxLDIxSDIzTDEyLDJaIiAvPgo8L3N2Zz4=")!important;background-color:#f89406}#toast-container.toast-top-center>div,#toast-container.toast-bottom-center>div{width:300px;margin-left:auto;margin-right:auto}#toast-container.toast-top-full-width>div,#toast-container.toast-bottom-full-width>div{width:96%;margin-left:auto;margin-right:auto}.toast-progress{position:absolute;left:0;bottom:0;height:4px;background-color:#000;opacity:.4}.toast{background-color:#030303}.toast-success{background-color:#51a351}.toast-error{background-color:#bd362f}.toast-info{background-color:#2f96b4}.toast-warning{background-color:#f89406}

    /* GUID 링크 스타일 */
    .plex-guid-link {
        text-decoration: none !important;
        color: inherit !important;
        cursor: pointer;
        transition: color 0.2s ease, text-decoration 0.2s ease;
    }
    .plex-guid-link:hover {
        color: #f0ad4e !important;
        text-decoration: underline !important;
    }

    /* 경로 스캔 링크 스타일 */
    .plex-path-scan-link, #plex-guid-box .path-text-wrapper {
        text-decoration: none !important;
        cursor: pointer;
        color: #f1f1f1 !important;
        transition: color 0.2s ease, opacity 0.2s ease;
    }
    .plex-path-scan-link span[style*="color:#e5a00d"],
    #plex-guid-box .path-text-wrapper span[style*="color:#e5a00d"] {
        color: #e5a00d !important;
    }
    .plex-path-scan-link:hover {
        color: #f0ad4e !important;
        opacity: 0.9;
    }
    .plex-path-scan-link:hover, .plex-path-scan-link:hover span[style*="color:#e5a00d"] {
        text-decoration: underline !important;
    }

    /* 상세 정보 내 버튼 스타일 */
    #plex-guid-box .plex-guid-action { font-size: 14px; margin-left: 16px; text-decoration: none; cursor: pointer; vertical-align: middle; opacity: 0.8; transition: opacity 0.2s ease, color 0.2s ease, transform 0.2s ease; }
    #plex-guid-box .plex-guid-action:hover { opacity: 1.0; transform: scale(1.05); }

    /* plex_mate 새로고침 버튼 스타일 */
    #plex-mate-refresh-button {
        display: inline-block;
        padding: 4px 10px;
        font-size: 13px;
        font-weight: 700;
        line-height: 1.4;
        color: #1f1f1f !important;
        background-color: #e5a00d;
        border: 1px solid #c48b0b;
        border-radius: 4px;
        text-decoration: none !important;
        vertical-align: middle;
        cursor: pointer;
        transition: background-color 0.2s ease, border-color 0.2s ease, transform 0.2s ease;
    }
    #plex-mate-refresh-button:hover {
        background-color: #d4910c;
        border-color: #a9780a;
    }
    #plex-mate-refresh-button i {
        margin-right: 5px;
        font-size: 0.9em;
    }

    /* 추가 정보 아이콘 */
    #plex-guid-box .fa-clock, #plex-guid-box .fa-film, #plex-guid-box .fa-video { color: #bdbdbd; opacity: 0.8; margin-right: 2px; }

    /* 개별 아이콘 속성 */
    #plex-guid-box .plex-play-external { color: #4CAF50; }
    #plex-guid-box .plex-play-external:hover { color: #66bb6a; transform: scale(1.15); }

    #plex-guid-box .plex-open-folder { color: #FFC107; }
    #plex-guid-box .plex-open-folder:hover { color: #ffca28; transform: scale(1.15); }

    #plex-guid-box .plex-download-link,
    #plex-guid-box .plex-kor-subtitle-download { color: #adb5bd; margin-left: 6px; margin-right: 2px; }
    #plex-guid-box .plex-download-link:hover,
    #plex-guid-box .plex-kor-subtitle-download:hover { color: #ced4da; transform: scale(1.15); }

    #plex-guid-box #refresh-guid-button { color: #adb5bd; margin-left: 8px; cursor: pointer; display: inline-block; transition: opacity 0.2s ease, color 0.2s ease, transform 0.2s ease; }
    #plex-guid-box #refresh-guid-button:hover { color: #ced4da; transform: scale(1.15); opacity: 1.0; }

    /* 아이콘 내부 스타일 */
    #plex-guid-box i { vertical-align: baseline; font-size: 0.9em; }
    #plex-guid-box .plex-guid-action i { font-size: 1em; }
    #plex-guid-box .plex-download-link i, #plex-guid-box .plex-kor-subtitle-download i { margin-right: 2px; }
    #plex-guid-box .plex-play-external i, #plex-guid-box .plex-open-folder i { margin-right: 2px; }
    #plex-guid-box #refresh-guid-button i { margin-right: 2px; }

    /* 목록 보기 외부 재생 아이콘 스타일 (호버 시 표시) */
    div[data-testid^="cellItem"] div[class*="PosterCard-card-"] {
        position: relative; overflow: hidden;
    }
    .plex-list-play-external {
        position: absolute; top: 5px; right: 5px; z-index: 10;
        background-color: rgba(30, 30, 30, 0.7); color: #adb5bd;
        border-radius: 50%; width: 24px; height: 24px;
        display: flex; align-items: center; justify-content: center;
        cursor: pointer; text-decoration: none;
        border: 1px solid rgba(255, 255, 255, 0.1);
        opacity: 0; pointer-events: none; transform: scale(0.9);
        transition: opacity 0.15s ease-in-out, transform 0.15s ease-in-out, background-color 0.2s ease, color 0.2s ease;
    }
    div[data-testid^="cellItem"] div[class*="PosterCard-card-"]:hover .plex-list-play-external {
        opacity: 0.8; pointer-events: auto; transform: scale(1);
    }
    div[data-testid^="cellItem"] div[class*="PosterCard-card-"]:hover .plex-list-play-external:hover {
        background-color: rgba(0, 0, 0, 0.85); color: #ffffff;
        transform: scale(1.1); opacity: 1; border-color: rgba(255, 255, 255, 0.3);
    }
    .plex-list-play-external i {
        font-size: 11px; vertical-align: middle; line-height: 1;
    }

    /* 목록 GUID 뱃지 스타일 */
    .plex-guid-list-box { display: inline; margin-left: 5px; color: #e5a00d; font-size: 11px; font-weight: 500; line-height: inherit; vertical-align: baseline; cursor: pointer; text-decoration: none; font-family: inherit; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100px; transition: color 0.2s ease, opacity 0.2s ease, text-decoration 0.2s ease; }
    .plex-guid-list-box:hover {
        text-decoration: underline !important;
        opacity: 0.85;
    }
    .plex-guid-list-box[data-refreshing="true"] {
        cursor: default !important;
        opacity: 0.7 !important;
        text-decoration: none !important;
    }

    /* 컨트롤 UI 버튼 스타일 */
    #pmdv-controls { margin-right: 10px; order: -1; display: flex; align-items: center; gap: 5px;}
    #pmdv-controls button, #pmdv-controls input, #pmdv-controls label { font-size: 11px !important; padding: 3px 6px !important; margin: 0 !important; height: auto !important; line-height: 1.4 !important; color: #eee !important; background-color: rgba(0,0,0,0.2) !important; border: 1px solid #555 !important; border-radius: 4px !important; vertical-align: middle; box-sizing: border-box; transition: background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease; }
    #pmdv-controls button { cursor: pointer; white-space: nowrap; }
    #pmdv-controls button:hover { background-color: rgba(0,0,0,0.4) !important; border-color: #aaa !important; }
    #pmdv-controls button.on { background-color: #e5a00d !important; color: #1f1f1f !important; border-color: #e5a00d !important; }
    #pmdv-controls button.on:hover { background-color: #d4910c !important; border-color: #e5a00d !important; }
    #pmdv-controls input[type="number"] { width: 35px; text-align: center; padding: 3px 4px !important; -moz-appearance: textfield; }
    #pmdv-controls input[type=number]::-webkit-inner-spin-button, #pmdv-controls input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
    #pmdv-controls #pmdv-status { color: #aaa; font-style: italic; font-size: 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100px; margin-right: 8px; min-width: 80px; text-align: left; order: -1; }
    #pmdv-controls #pmdv-apply-length:hover, #pmdv-controls #pmdv-clear-current:hover, #pmdv-controls #pmdv-clear-all:hover { background-color: rgba(80, 80, 80, 0.5) !important; color: #fff !important; }
` );

(function() {
    'use strict';

    const DEBUG = true;

    // --- 사용자 설정 상수 ---
    const DISPLAY_PATH_PREFIXES_TO_REMOVE = ['/mnt/gds', '/mnt/content'];
    const SERVER_TO_LOCAL_PATH_MAPPINGS = [
        { serverPrefix: '/mnt/gds/', localPrefix: 'Z:\\gds\\' },
        { serverPrefix: '/mnt/content/', localPrefix: 'Z:\\content\\' },
    ];

    const FF_URL_MAPPINGS = {
        'SERVER_1_MACHINE_IDENTIFIER_HERE': 'https://ff1.yourdomain.com',
        'SERVER_2_MACHINE_IDENTIFIER_HERE': 'https://ff2.yourdomain.com'
        // '서버ID': 'plex_mate 주소' 형식으로 계속 추가할 수 있습니다.
    };

    // --- PLEX_MATE API 설정 ---
    const PLEX_MATE_APIKEY = "_YOUR_APIKEY_"; // plex_mate API 키는 공통으로 사용

    const PLEX_MATE_API_DO_SCAN = "/plex_mate/api/scan/do_scan";
    const PLEX_MATE_API_MANUAL_REFRESH = "/plex_mate/api/scan/manual_refresh";

    // --- API 동시 요청 수 제한 상수 ---
    const API_CONCURRENCY_LIMIT = 4; // plex api 동시 요청 수 제한

    // --- 전역 변수 및 상태 ---
    let currentUrl = '', currentGMXHR = null, currentController = null, currentServerId = null, currentItemId = null, currentDisplayedItemId = null, guidCacheObject = {};
    const CACHE_STORAGE_KEY = 'plexGuidPersistentCache';
    const LIST_GUID_VISIBILITY_KEY = 'plexListGuidVisibility';
    const DETAIL_INFO_VISIBILITY_KEY = 'plexDetailInfoVisibility';
    const GUID_LENGTH_KEY = 'plexGuidLength';
    const LIST_PLAY_ICON_VISIBILITY_KEY = 'plexListPlayIconVisibility';
    let saveTimeout = null, statusTimeout = null;

    // --- 상태 변수 ---
    let isListGuidVisible = GM_getValue(LIST_GUID_VISIBILITY_KEY, true);
    let isDetailInfoVisible = GM_getValue(DETAIL_INFO_VISIBILITY_KEY, true);
    let isExternalPlayVisible = GM_getValue(LIST_PLAY_ICON_VISIBILITY_KEY, true);
    let guidMaxLength = GM_getValue(GUID_LENGTH_KEY, 20);
    if (isNaN(parseInt(guidMaxLength)) || parseInt(guidMaxLength) < 5 || parseInt(guidMaxLength) > 50) { guidMaxLength = 20; } else { guidMaxLength = parseInt(guidMaxLength); }

    // --- UI 요소 참조 ---
    let controlContainer, toggleListGuidButton, toggleDetailInfoButton, toggleListPlayButton, guidLengthInput, applyGuidLengthButton, clearCurrentButton, clearAllButton, statusMessageElement;

    // --- URL 변경 및 Observer 관련 상태 ---
    let isProcessingUrlChange = false; let detailObserverDebounceTimer = null; let detailProcessTriggeredByObserver = false; let forceRetryTimeoutId = null; let detailCheckIntervalId = null; let isDetailProcessRunning = false;

    // --- 아이콘 정의 ---
    const ICONS = { DOWNLOAD: '<i class="fas fa-download"></i>', PLAY: '<i class="fas fa-play"></i>', FOLDER: '<i class="fas fa-folder-open"></i>', REFRESH: '<i class="fas fa-sync-alt"></i>', CLOCK: '<i class="fas fa-clock"></i>', FILM: '<i class="fas fa-film"></i>', VIDEO: '<i class="fas fa-video"></i>', SPINNER: '<i class="fas fa-spinner fa-spin"></i>', CHECK: '<i class="fas fa-check"></i>', TIMES: '<i class="fas fa-times"></i>', PLEX_MATE: '<i class="fas fa-bolt"></i>' };

    // --- 로그 함수 ---
    function log(...args) { if(DEBUG) console.log(`[PMH Script][${new Date().toISOString()}]`, ...args); }

    // --- toastr 옵션 ---
    if (typeof toastr !== 'undefined') { toastr.options = { "closeButton": true, "debug": false, "newestOnTop": true, "progressBar": true, "positionClass": "toast-bottom-right", "preventDuplicates": false, "onclick": null, "showDuration": "300", "hideDuration": "1000", "timeOut": "3000", "extendedTimeOut": "1000", "showEasing": "swing", "hideEasing": "linear", "showMethod": "fadeIn", "hideMethod": "fadeOut" }; log("Toastr options configured."); } else { log("Toastr library not loaded."); }

    // --- 스토리지 함수 ---
    function storageGet(key, defaultValue) { try { return GM_getValue(key, defaultValue); } catch (e) { log(`Error getting value for key ${key}:`, e); return defaultValue; } }
    function storageSet(key, value) { try { GM_setValue(key, value); } catch (e) { log(`Error setting value for key ${key}:`, e); } }

    // --- 설정 로드 ---
    function loadSettingsAndUpdateUI() {
        isListGuidVisible = storageGet(LIST_GUID_VISIBILITY_KEY, true); isDetailInfoVisible = storageGet(DETAIL_INFO_VISIBILITY_KEY, true); isExternalPlayVisible = storageGet(LIST_PLAY_ICON_VISIBILITY_KEY, true);
        let savedLength = storageGet(GUID_LENGTH_KEY, 20); guidMaxLength = (savedLength !== undefined && !isNaN(parseInt(savedLength)) && parseInt(savedLength) >= 5 && parseInt(savedLength) <= 50) ? parseInt(savedLength) : 20;
        log(`Settings loaded: ListGUID=${isListGuidVisible}, DetailInfo=${isDetailInfoVisible}, ExternalPlay=${isExternalPlayVisible}, Length=${guidMaxLength}`);
        updateToggleButtonUI(); if (guidLengthInput) guidLengthInput.value = guidMaxLength;
    }

    // --- 캐시 관리 ---
    async function loadCache() { try { const d = storageGet(CACHE_STORAGE_KEY, {}); guidCacheObject = (d && typeof d === 'object') ? d : {}; log('Persistent cache loaded:', Object.keys(guidCacheObject).length, 'items'); } catch (e) { log('Error loading cache:', e); guidCacheObject = {}; } }
    function updateCache(key, value) { guidCacheObject[key] = value; scheduleSaveCache(); }
    function scheduleSaveCache() { if (saveTimeout) clearTimeout(saveTimeout); saveTimeout = setTimeout(() => { try { storageSet(CACHE_STORAGE_KEY, guidCacheObject); } catch (e) { log('Error saving cache:', e); } saveTimeout = null; }, 3000); }
    function getCache(key) { return guidCacheObject[key] || null; }
    function hasCache(key) { return key in guidCacheObject; }

    // --- 헬퍼 함수들 ---
    function removeAllGuidBadges() { document.querySelectorAll('.plex-guid-list-box, .plex-guid-wrapper, .plex-list-play-external').forEach(el => el.remove()); }
    function formatBytes(bytes) { if (bytes === null || bytes === undefined || isNaN(bytes) || bytes <= 0) return '-'; const k = 1024; const s = ['Bytes', 'KB', 'MB', 'GB', 'TB']; const i = Math.floor(Math.log(bytes) / Math.log(k)); const d = i >= 2 ? 2 : 0; return parseFloat((bytes / Math.pow(k, i)).toFixed(d)) + ' ' + s[i]; }
    function cleanGuid(guid) { if (!guid || typeof guid !== 'string') return '-'; let cleanedGuid = guid.replace(/^com\.plexapp\.agents\.|^tv\.plex\.agents\./, '').replace(/\?lang.*$/, ''); return cleanedGuid || '-'; }
    function getDisplayPath(originalPath) { if (!originalPath) return '-'; for (const prefix of DISPLAY_PATH_PREFIXES_TO_REMOVE) { if (originalPath.startsWith(prefix)) { return originalPath.substring(prefix.length); } } return originalPath; }

    function getLocalPath(originalPath) {
        if (!originalPath) return null;
        for (const mapping of SERVER_TO_LOCAL_PATH_MAPPINGS) {
            if (originalPath.startsWith(mapping.serverPrefix)) {
                const remainingPath = originalPath.substring(mapping.serverPrefix.length).replace(/\//g, '\\');
                return mapping.localPrefix + remainingPath;
            }
        }
        log(`[getLocalPath] No mapping found for: ${originalPath}`);
        return originalPath;
    }

    function emphasizeFileName(path) { const dp = getDisplayPath(path); const l = dp.lastIndexOf('/'); if (l === -1) { const bl = dp.lastIndexOf('\\'); if(bl === -1) return `<span style="font-weight:bold; color:#e5a00d;">${dp}</span>`; const bd = dp.substring(0, bl + 1); const bf = dp.substring(bl + 1); return `${bd}<span style="color:#e5a00d;">${bf}</span>`; } const d = dp.substring(0, l + 1); const f = dp.substring(l + 1); return `${d}<span style="color:#e5a00d;">${f}</span>`; }
    function extractMarkers(v) { const m = Array.from(v.querySelectorAll('Marker')).map(mk => ({ type: mk.getAttribute('type'), start: msToHMS(mk.getAttribute('startTimeOffset')), end: msToHMS(mk.getAttribute('endTimeOffset')) })); return { intro: m.find(i => i.type === 'intro'), credits: m.find(c => c.type === 'credits') }; }
    function msToHMS(ms) { if (!ms || isNaN(Number(ms)) || Number(ms) <= 0) return '-'; const t = Math.floor(Number(ms) / 1000); const h = Math.floor(t / 3600); const m = Math.floor((t % 3600) / 60); const s = t % 60; return h > 0 ? `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}` : `${m}:${s.toString().padStart(2, '0')}`; }
    function extractGuidKey(guid) { if (!guid || typeof guid !== 'string') return '-'; const si = guid.indexOf('://'); if (si === -1) return guid.length > guidMaxLength ? guid.substring(0, guidMaxLength) + '…' : (guid || '-'); let kp = guid.substring(si + 3); const qi = kp.indexOf('?'); if (qi !== -1) kp = kp.substring(0, qi); return kp.length > guidMaxLength ? kp.substring(0, guidMaxLength) + '…' : (kp || '-'); }

    // --- SPA URL 변경 감지 ---
    function setupSPAObserver() { const op = history.pushState; history.pushState = function(...a) { op.apply(history, a); checkUrlChange(); }; const or = history.replaceState; history.replaceState = function(...a) { or.apply(history, a); checkUrlChange(); }; window.addEventListener('popstate', checkUrlChange); window.addEventListener('hashchange', checkUrlChange); log("SPA observer setup complete."); }

    // --- 주기적 상세 정보 확인 ---
    const DETAIL_CHECK_INTERVAL = 2000;
    function startDetailCheckInterval() { if (detailCheckIntervalId) clearInterval(detailCheckIntervalId); log("Starting periodic detail check interval."); detailCheckIntervalId = setInterval(() => { if (isDetailPage() && isDetailInfoVisible && !document.getElementById('plex-guid-box') && !isDetailProcessRunning) { const { serverId, itemId } = extractIds(); if (serverId && itemId) { const ck = `${serverId}_${itemId}`; if (currentDisplayedItemId !== ck) DetailProcess(1); } } }, DETAIL_CHECK_INTERVAL); }
    function stopDetailCheckInterval() { if (detailCheckIntervalId) { log("Stopping periodic detail check interval."); clearInterval(detailCheckIntervalId); detailCheckIntervalId = null; } }

    // --- URL 변경 처리 ---
    function checkUrlChange() {
        if (isProcessingUrlChange) return; isProcessingUrlChange = true;
        const newUrl = window.location.href;
        if (newUrl !== currentUrl) {
            log(`URL changed: ${currentUrl} -> ${newUrl}`);
            if(forceRetryTimeoutId) clearTimeout(forceRetryTimeoutId); forceRetryTimeoutId = null; detailProcessTriggeredByObserver = false; if(detailObserverDebounceTimer) clearTimeout(detailObserverDebounceTimer); detailObserverDebounceTimer = null;
            cancelPreviousRequest(); currentController = new AbortController(); currentDisplayedItemId = null;
            const ids = extractIds(); currentServerId = ids.serverId; currentItemId = ids.itemId; currentUrl = newUrl;
            const isDetail = isDetailPage(); const isList = isMediaListPage();
            if (isDetail) { if (isDetailInfoVisible) startDetailCheckInterval(); } else { stopDetailCheckInterval(); }
            if (isDetail && currentServerId && currentItemId) { removeAllGuidBadges(); if (isDetailInfoVisible) { DetailProcess(1); forceRetryTimeoutId = setTimeout(() => { const currentIdsNow = extractIds(); if (isDetailPage() && currentIdsNow.serverId === currentServerId && currentIdsNow.itemId === currentItemId && !document.getElementById('plex-guid-box') && !isDetailProcessRunning) DetailProcess(1); forceRetryTimeoutId = null; }, 3000); }
            } else if (isList) { document.getElementById('plex-guid-box')?.remove(); if (isListGuidVisible || isExternalPlayVisible) ListProcess(); else removeAllGuidBadges();
            } else { document.getElementById('plex-guid-box')?.remove(); removeAllGuidBadges(); }
        }
        isProcessingUrlChange = false;
    }

    // --- 페이지 유형 판별 ---
    function isDetailPage() { const p = window.location.pathname; const h = window.location.hash; return (p.startsWith('/desktop') || p.startsWith('/web/index.html')) && h.includes('/server/') && h.includes('/details?key=') && !h.includes('/settings/'); }
    function isMediaListPage() { const p = window.location.pathname; const h = window.location.hash; return (p.startsWith('/desktop') || p.startsWith('/web/index.html')) && !h.includes('/settings/') && !isDetailPage(); }

    // --- 이전 요청 취소 ---
    function cancelPreviousRequest() { if (currentGMXHR) { try { currentGMXHR.abort(); } catch(e){} currentGMXHR = null; } if (currentController) { currentController.abort(); } }

    // --- ID 추출 ---
    function extractIds() { const h = window.location.hash; const sid = h.split('/server/')[1]?.split('/')[0]; const iid = new URLSearchParams(h.split('?')[1]).get('key')?.split('/metadata/')[1]; return { serverId: sid, itemId: iid }; }

    // --- 서버 정보 추출 ---
    function extractServerInfo(serverId) { if (!serverId) return null; const us = localStorage.getItem('users'); if (!us) return null; let ud; try { ud = JSON.parse(us); } catch (e) { return null; } if (!ud || !Array.isArray(ud.users)) return null; let fs = null, at = null; for (const u of ud.users) { if (!u || !Array.isArray(u.servers)) continue; for (const s of u.servers) { if (s && s.machineIdentifier === serverId) { fs = s; at = s.accessToken; break; } } if (fs) break; } if (!fs) return null; let su = null; if (Array.isArray(fs.connections)) { const cs = fs.connections; su = cs.find(c => c.uri?.startsWith('https://') && !c.local)?.uri || cs.find(c => c.uri?.startsWith('http://') && !c.local)?.uri || cs.find(c => c.uri?.startsWith('https://') && c.local)?.uri || cs.find(c => c.uri?.startsWith('http://') && c.local)?.uri || cs.find(c => c.uri)?.uri || null; if (!su && cs.length > 0) { const c = cs[0]; if(c.address && c.port) su = `${c.scheme || 'http'}://${c.address}:${c.port}`; } } if (!su) return null; return { accessToken: at, serverUrl: su }; }

    // --- 네트워크 요청 ---
    function makeRequest(options) {
        return new Promise((resolve, reject) => {
            const sig = options.signal;
            if (sig?.aborted) return reject(new DOMException('Aborted', 'AbortError'));

            const xd = {
                method: options.method || "GET",
                url: options.url,
                headers: options.headers || {},
                responseType: options.responseType || undefined,
                data: options.data || undefined,
                timeout: options.timeout || undefined,
                onload: r => {
                    currentGMXHR = null;
                    if (r.status >= 200 && r.status < 300) {
                        resolve(r);
                    } else {
                        reject({ status: r.status, statusText: r.statusText, response: r.responseText });
                    }
                },
                onerror: e => { currentGMXHR = null; reject({ error: 'Network error', details: e }); },
                ontimeout: () => { currentGMXHR = null; reject({ error: 'Timeout' }); },
                onabort: () => { currentGMXHR = null; reject(new DOMException('Aborted', 'AbortError')); }
            };

            currentGMXHR = GM_xmlhttpRequest(xd);

            if (sig) {
                const ah = () => { if (currentGMXHR) try { currentGMXHR.abort(); } catch (e) {} };
                sig.addEventListener('abort', ah, { once: true });
            }
        });
    }

    // --- Plex API 호출 ---
    async function fetchGuid(serverUrl, itemId, token, signal) {
        log(`[fetchGuid] Fetching metadata for item ID: ${itemId}`);
        try {
            const p = new URLSearchParams({ "includeMarkers": 1, "X-Plex-Token": token });
            const url = `${serverUrl}/library/metadata/${itemId}?${p.toString()}`;
            const r = await makeRequest({ url: url, method: "GET", signal: signal });
            if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

            const x = r.responseText;
            const d = new DOMParser().parseFromString(x, 'text/xml');
            if (d.querySelector('parsererror')) throw new Error('XML parse error');

            const v = d.querySelector('Video');
            const dir = d.querySelector('Directory');

            if (v) {
                const rk = v.getAttribute('ratingKey'); log(`[fetchGuid] Found Video: ${rk}`);
                const mv = [];
                v.querySelectorAll('Media').forEach(m => {
                    const cv = { mediaId: m.getAttribute('id'), parts: [], subtitles: [] };
                    m.querySelectorAll('Part').forEach(p => { const pa = p.getAttribute('file'); const sz = p.getAttribute('size'); const pid = p.getAttribute('id'); let size = null; if (sz) { const ps = parseInt(sz); if (!isNaN(ps)) size = ps; } if (pa) cv.parts.push({ id: pid, path: pa, size: size }); });
                    m.querySelectorAll('Stream[streamType="3"]').forEach(s => { const sid = s.getAttribute('id'); const sk = s.getAttribute('key'); const f = s.getAttribute('format'); const c = s.getAttribute('codec'); const l = s.getAttribute('language'); const lc = s.getAttribute('languageCode'); const ie = s.getAttribute('external') === '1'; const isl = sk || ie || ['srt','ass','smi','vtt','ssa'].includes(f?.toLowerCase()) || ['srt','ass','smi','vtt','ssa'].includes(c?.toLowerCase()); if (isl && sid && (sk || f || c)) cv.subtitles.push({ id: sid, key: sk, format: f || c?.toLowerCase() || 'sub', language: l || lc || '?', languageCode: lc || 'und' }); });
                    if (cv.parts.length > 0 || cv.subtitles.length > 0) mv.push(cv);
                });
                return { type: 'video', guid: v.getAttribute('guid'), title: v.getAttribute('title'), year: v.getAttribute('year'), duration: msToHMS(v.getAttribute('duration')), mediaVersions: mv, markers: extractMarkers(v), itemId: rk, librarySectionID: v.getAttribute('librarySectionID') };

            } else if (dir) {
                const ratingKey = dir.getAttribute('ratingKey'); log(`[fetchGuid] Found Directory: ${ratingKey}`);
                const mv = []; let representativePath = null;

                const locationTag = dir.querySelector('Location');
                if (locationTag) {
                    representativePath = locationTag.getAttribute('path');
                }

                if (representativePath) {
                    log(`[fetchGuid] Found representative path from <Location> tag: ${representativePath}`);
                    mv.push({ mediaId: null, parts: [{ id: null, path: representativePath, size: null }], subtitles: [] });
                } else {
                    log(`[fetchGuid] No <Location> tag or path. Fetching children for ${ratingKey} to find a path.`);
                    try {
                        const childrenUrl = `${serverUrl}/library/metadata/${ratingKey}/children?X-Plex-Token=${token}`;
                        const childrenR = await makeRequest({ url: childrenUrl, method: "GET", signal: signal });
                        if (!signal?.aborted) {
                            const childrenX = childrenR.responseText;
                            const childrenD = new DOMParser().parseFromString(childrenX, 'text/xml');
                            const firstEpisodePart = childrenD.querySelector('Video > Media > Part');
                            if (firstEpisodePart) {
                                let episodeFilePath = firstEpisodePart.getAttribute('file');
                                if (episodeFilePath) {
                                    const lastSlashIndex = episodeFilePath.lastIndexOf('/');
                                    if (lastSlashIndex > -1) {
                                        representativePath = episodeFilePath.substring(0, lastSlashIndex);
                                        log(`[fetchGuid] Found path from first child episode (folder only): ${representativePath}`);
                                        mv.push({ mediaId: null, parts: [{ id: null, path: representativePath, size: null }], subtitles: [] });
                                    }
                                }
                            } else { log(`[fetchGuid] No child episode with a path found for ${ratingKey}`); }
                        }
                    } catch(childError) { if (childError.name !== 'AbortError') { log(`[fetchGuid] Error fetching children for ${ratingKey}:`, childError); } }
                }
                return { type: 'directory', guid: dir.getAttribute('guid'), title: dir.getAttribute('title'), year: dir.getAttribute('year'), duration: null, mediaVersions: mv, markers: null, itemId: ratingKey, librarySectionID: dir.getAttribute('librarySectionID') };
            } else {
                log(`[fetchGuid] No Video or Directory found for ${itemId}`); return null;
            }
        } catch (error) { if (error.name === 'AbortError') throw error; log('[fetchGuid] Error:', itemId, error); return null; }
    }

    // --- 외부 플레이어 에이전트 호출 ---
    async function openItemOnAgent(originalPath, itemId, openFolder, serverId, itemType = 'video') {
        const localPath = getLocalPath(originalPath);
        if (!localPath) { if(typeof toastr !== 'undefined') toastr.error('로컬 경로 변환 실패'); return; }
        let targetPath = localPath;

        if (openFolder) {
            if (itemType === 'video') {
                const idx = Math.max(targetPath.lastIndexOf('/'), targetPath.lastIndexOf('\\'));
                if (idx > -1) {
                    targetPath = targetPath.substring(0, idx);
                }
            }
        }

        const displayPath = targetPath.substring(targetPath.lastIndexOf('\\') + 1); log(`Calling external player agent for: ${targetPath} (Folder: ${openFolder}, Type: ${itemType})`);
        if (typeof toastr !== 'undefined') toastr.info(`${openFolder ? '폴더 여는 중' : '외부 플레이어 실행 중'}: ${displayPath}`);
        const encodedPath = encodeURIComponent(targetPath.replace(/\+/g, '[PLEXEXTPLUS]')); const agentUrl = `http://localhost:7251/?protocol=2&item=${encodedPath}`;
        try { await makeRequest({ url: agentUrl, method: "GET" }); log("Agent request sent."); }
        catch (error) { log("Failed to connect to agent:", error); if (typeof toastr !== 'undefined') toastr.error('에이전트 연결 실패. 실행 확인.', '실행 오류', { timeOut: 5000 }); throw error; }
    }

    // --- DOM 요소 대기 ---
    async function waitForElement(selector, timeout = 5000, signal) { const st = Date.now(); while (Date.now() - st < timeout) { if (signal?.aborted) throw new DOMException('Aborted', 'AbortError'); const el = document.querySelector(selector); if (el && el.isConnected) return el; await new Promise(r => { const t = setTimeout(r, 100); signal?.addEventListener('abort', () => { clearTimeout(t); r(); }, { once: true }); }); } if (signal?.aborted) throw new DOMException('Aborted', 'AbortError'); throw new Error(`Element "${selector}" not found within ${timeout}ms`); }
    async function waitForMetadataContainer(signal) { return waitForElement('div[data-testid="metadata-top-level-items"]', 5000, signal); }

    // --- 상세 정보 표시 ---
    async function displayGuidDetail(data, signal, container) {
        log('[displayGuidDetail] Displaying data for item ID:', data.itemId);
        try {
            if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
            document.getElementById('plex-guid-box')?.remove(); if (!container || !container.isConnected) return false;
            let fileInfoHtml = ''; let isFirstPathOverall = true; const serverId = currentServerId; const itemId = data.itemId;

            const createPathHtml = (originalPath) => {
                const isScannable = data.librarySectionID && originalPath;
                if (isScannable) {
                    return `<a href="#" class="plex-path-scan-link" title="클릭하여 Plex Mate로 스캔" data-original-path="${originalPath}" data-section-id="${data.librarySectionID}" data-item-type="${data.type}">${emphasizeFileName(originalPath)}</a>`;
                }
                return `<span class="path-text-wrapper">${emphasizeFileName(originalPath)}</span>`;
            };

            if (data.type === 'directory' && data.mediaVersions?.[0]?.parts?.[0]?.path) {
                const representativePart = data.mediaVersions[0].parts[0];
                const originalPath = representativePart.path;
                const openFolderIconHtml = isExternalPlayVisible ? `<a href="#" class="plex-guid-action plex-open-folder" title="폴더 열기" data-file-path="${originalPath}" data-item-id="${itemId}" data-server-id="${serverId}" data-open-folder="true" data-item-type="directory">${ICONS.FOLDER}</a>` : '';
                fileInfoHtml = `<div class="_1h4p3k00 _1v25wbq8 _1v25wbq1s _1v25wbqg _1v25wbq1g _1v25wbq1c _1v25wbq14 _1v25wbq34 _1v25wbq28" style="margin-bottom: 4px; display: flex;"><div class="_1h4p3k00 _1v25wbq8 _1v25wbq1o _1v25wbqk _1v25wbq1g _1v25wbq18 _1v25wbq14 _1v25wbq28" style="width: 95px; flex-shrink: 0;"><span class="ineka90 ineka9k ineka9b ineka9n _1v25wbq1g _1v25wbq1c _1v25wbqlk" style="color: #bababa;">대표 경로</span></div><span class="ineka90 ineka9j ineka9b ineka9n _1v25wbq1g _1v25wbq1c _1v25wbqlk" style="word-break: break-all; flex-grow: 1;">${createPathHtml(originalPath)}${openFolderIconHtml}</span></div>`;
            } else if (data.type === 'video' && data.mediaVersions && Array.isArray(data.mediaVersions) && data.mediaVersions.length > 0) {
                fileInfoHtml = data.mediaVersions.map((version) => {
                    const korSubs = version.subtitles?.filter(s => s.languageCode === 'kor' || s.languageCode === 'ko') || [];
                    const hasKorSub = korSubs.length > 0;
                    const korSub = hasKorSub ? korSubs[0] : null;
                    let partsHtml = '';
                    if (version.parts && version.parts.length > 0) {
                        partsHtml = version.parts.map((part) => {
                            const hasSize = part.size !== null && typeof part.size === 'number';
                            const hasPartId = !!part.id;
                            const originalPath = part.path;
                            let videoFn = `part_${part.id || 'no_id'}`;
                            if (originalPath) {
                                const fn = originalPath.substring(originalPath.lastIndexOf('/') + 1);
                                const ldi = fn.lastIndexOf('.');
                                videoFn = ldi > 0 ? fn.substring(0, ldi) : fn;
                                videoFn = videoFn.replace(/[\\/:*?"<>|]/g, '_');
                            }
                            const extPlayIconsHtml = isExternalPlayVisible ? `<a href="#" class="plex-guid-action plex-play-external" title="외부 플레이어 재생" data-file-path="${originalPath}" data-item-id="${itemId}" data-server-id="${serverId}" data-open-folder="false" data-item-type="video">${ICONS.PLAY}</a><a href="#" class="plex-guid-action plex-open-folder" title="폴더 열기" data-file-path="${originalPath}" data-item-id="${itemId}" data-server-id="${serverId}" data-open-folder="true" data-item-type="video">${ICONS.FOLDER}</a>` : '';
                            const partHtml = `<div class="_1h4p3k00 _1v25wbq8 _1v25wbq1s _1v25wbqg _1v25wbq1g _1v25wbq1c _1v25wbq14 _1v25wbq34 _1v25wbq28" style="margin-bottom: 4px; display: flex;"><div class="_1h4p3k00 _1v25wbq8 _1v25wbq1o _1v25wbqk _1v25wbq1g _1v25wbq18 _1v25wbq14 _1v25wbq28" style="width: 95px; flex-shrink: 0;">${isFirstPathOverall ? '<span class="ineka90 ineka9k ineka9b ineka9n _1v25wbq1g _1v25wbq1c _1v25wbqlk" style="color: #bababa;">경로</span>' : '<span> </span>'}</div><span class="ineka90 ineka9j ineka9b ineka9n _1v25wbq1g _1v25wbq1c _1v25wbqlk" style="word-break: break-all; flex-grow: 1;">${createPathHtml(originalPath)}${hasSize ? `<span style="margin-left: 5px; font-size: 13px; color: #adb5bd;"> ${hasPartId ? `<a href="#" class="plex-guid-action plex-download-link" title="파일 다운로드" data-part-id="${part.id}" data-file-path="${originalPath}">${ICONS.DOWNLOAD}</a>` : `<span title="ID 없음">${ICONS.DOWNLOAD}</span>`} (${formatBytes(part.size)})</span>` : ''}${hasKorSub ? `<span style="margin-left: 4px; font-size: 13px; color: #adb5bd;"> / 자막: <a href="#" class="plex-guid-action plex-kor-subtitle-download" title="한국어 자막 다운로드" data-stream-id="${korSub.id}" data-stream-key="${korSub.key || ''}" data-subtitle-format="${korSub.format}" data-subtitle-language="ko" data-video-filename="${videoFn}">${ICONS.DOWNLOAD}</a> Kor(${korSub.format})</span>` : ''}${extPlayIconsHtml}</span></div>`;
                            isFirstPathOverall = false;
                            return partHtml;
                        }).join('');
                    }
                    return partsHtml;
                }).join('');
            }

            const displayGuid = data.guid ? cleanGuid(data.guid) : '-';
            let guidHtml;
            if (data.guid && data.guid.startsWith('plex://')) {
                guidHtml = `<a href="${data.guid}" class="plex-guid-link" title="Plex 앱에서 열기">${displayGuid}</a>`;
            } else {
                guidHtml = `<span>${displayGuid}</span>`;
            }

            const ffUrlForServer = FF_URL_MAPPINGS[serverId];
            const showPlexMateButton = ffUrlForServer && PLEX_MATE_APIKEY;
            const plexMateHtml = showPlexMateButton ? `<div class="_1h4p3k00 _1v25wbq8 _1v25wbq1s _1v25wbqg _1v25wbq1g _1v25wbq1c _1v25wbq14 _1v25wbq34 _1v25wbq28" style="margin-bottom: 4px;"><div class="_1h4p3k00 _1v25wbq8 _1v25wbq1o _1v25wbqk _1v25wbq1g _1v25wbq18 _1v25wbq14 _1v25wbq28" style="width: 95px; flex-shrink: 0;"><span class="ineka90 ineka9k ineka9b ineka9n _1v25wbq1g _1v25wbq1c _1v25wbqlk" style="color: #bababa;">PLEX MATE</span></div><span class="ineka90 ineka9j ineka9b ineka9n _1v25wbq1g _1v25wbq1c _1v25wbqlk"><a href="#" id="plex-mate-refresh-button" class="plex-guid-action" title="PLEX MATE로 YAML/TMDB 반영 실행">${ICONS.PLEX_MATE} YAML/TMDB 반영</a></span></div>` : '';
            const html = `<div id="plex-guid-box" style="margin-top: 15px; margin-bottom: 10px; clear: both; width: 100%;"><div style="color:#e5a00d; font-size:16px; margin-bottom:8px; font-weight:bold;">추가 메타 정보</div><div class="_1h4p3k00 _1v25wbq8 _1v25wbq1o _1v25wbqk _1v25wbq1g _1v25wbq1c _1v25wbq14 _1v25wbq3g _1v25wbq28">${plexMateHtml}${ displayGuid !== '-' ? `<div class="_1h4p3k00 _1v25wbq8 _1v25wbq1s _1v25wbqg _1v25wbq1g _1v25wbq1c _1v25wbq14 _1v25wbq34 _1v25wbq28" style="margin-bottom: 4px;"><div class="_1h4p3k00 _1v25wbq8 _1v25wbq1o _1v25wbqk _1v25wbq1g _1v25wbq18 _1v25wbq14 _1v25wbq28" style="width: 95px; flex-shrink: 0;"><span class="ineka90 ineka9k ineka9b ineka9n _1v25wbq1g _1v25wbq1c _1v25wbqlk" style="color: #bababa;">GUID</span></div><span class="ineka90 ineka9j ineka9b ineka9n _1v25wbq1g _1v25wbq1c _1v25wbqlk" style="word-break: break-all;">${guidHtml} <span id="refresh-guid-button" title="새로고침(캐시 갱신)" style="cursor: pointer;">${ICONS.REFRESH}</span></span></div>` : ''}${fileInfoHtml}${data.duration ? `<div class="_1h4p3k00 _1v25wbq8 _1v25wbq1s _1v25wbqg _1v25wbq1g _1v25wbq1c _1v25wbq14 _1v25wbq34 _1v25wbq28" style="margin-bottom: 4px;"><div class="_1h4p3k00 _1v25wbq8 _1v25wbq1o _1v25wbqk _1v25wbq1g _1v25wbq18 _1v25wbq14 _1v25wbq28" style="width: 95px; flex-shrink: 0;"><span class="ineka90 ineka9k ineka9b ineka9n _1v25wbq1g _1v25wbq1c _1v25wbqlk" style="color: #bababa;">재생 시간</span></div><span class="ineka90 ineka9j ineka9b ineka9n _1v25wbq1g _1v25wbq1c _1v25wbqlk"><span>${ICONS.CLOCK} ${data.duration} ${data.markers?.intro ? `<span style="margin-left:10px;">${ICONS.FILM} Intro: ${data.markers.intro.start} ~ ${data.markers.intro.end}</span>` : ''} ${data.markers?.credits ? `<span style="margin-left:10px;"> ${ICONS.VIDEO} Credit: ${data.markers.credits.start} ~ ${data.markers.credits.end}</span>` : ''}</span></span></div>` : ''}</div></div>`;

            let insertTarget = null; let insertPosition = 'afterend';
            const ratingEl = container.querySelector('div[data-testid="metadata-starRatings"], div[data-testid="metadata-ratings"]'); const ratingCont = ratingEl?.parentElement;
            if (ratingCont?.isConnected) { const actionCont = container.querySelector('button[data-testid="preplay-play"]')?.parentElement; if (actionCont && ratingCont.nextElementSibling === actionCont) insertTarget = ratingCont; else insertTarget = ratingCont; }
            if (!insertTarget) { const line2El = container.querySelector('span[data-testid="metadata-line2"]'); const line2P = line2El?.closest('div[style*="min-height: 24px;"]'); if (line2P?.isConnected) insertTarget = line2P; }
            if (!insertTarget) insertTarget = container;
            if (insertTarget?.isConnected) { insertTarget.insertAdjacentHTML(insertPosition, html); document.querySelectorAll('.plex-guid-list-box, .plex-guid-wrapper').forEach(el => el.remove()); return true; } else return false;
        } catch (error) { if (error.name === 'AbortError') log('[displayGuidDetail] Aborted.'); else log('[displayGuidDetail] Error:', error); document.getElementById('plex-guid-box')?.remove(); return false; }
    }

    // --- 목록 GUID 뱃지 생성 ---
    function createGuidBadge(machineIdentifier, itemId, guid) {
        const displayGuidKey = extractGuidKey(guid);
        if (!displayGuidKey || displayGuidKey === '-') return null;

        let fullGuidKey = '-';
        if (guid && typeof guid === 'string') {
            const si = guid.indexOf('://');
            if (si === -1) {
                fullGuidKey = guid;
            } else {
                fullGuidKey = guid.substring(si + 3);
                const qi = fullGuidKey.indexOf('?');
                if (qi !== -1) {
                    fullGuidKey = fullGuidKey.substring(0, qi);
                }
            }
            if (!fullGuidKey) fullGuidKey = '-';
        }

        const tooltipText = `${fullGuidKey}: 클릭시 갱신`;

        const badgeElement = document.createElement('span');
        badgeElement.className = 'plex-guid-list-box';
        badgeElement.textContent = displayGuidKey;
        badgeElement.title = tooltipText;

        badgeElement.addEventListener('click', async (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (badgeElement.dataset.refreshing === 'true') return;

            const cacheKey = `${machineIdentifier}_${itemId}`;
            log(`List GUID clicked: Refresh for ${cacheKey}`);
            const originalText = badgeElement.textContent;
            const originalTooltip = tooltipText;

            badgeElement.dataset.refreshing = 'true';
            badgeElement.textContent = '갱신중...';
            badgeElement.title = 'GUID 갱신 중...';
            const abortController = new AbortController();

            try {
                if (hasCache(cacheKey)) {
                    delete guidCacheObject[cacheKey];
                    scheduleSaveCache();
                }
                const serverInfo = extractServerInfo(machineIdentifier);
                if (!serverInfo) throw new Error(`No server info for ${machineIdentifier}`);

                const newData = await fetchGuid(serverInfo.serverUrl, itemId, serverInfo.accessToken, abortController.signal);
                if (abortController.signal.aborted) throw new DOMException('Aborted', 'AbortError');

                if (newData?.guid) {
                    updateCache(cacheKey, newData);
                    const newDisplayGuidKey = extractGuidKey(newData.guid);

                    let newFullGuidKey = '-';
                    if (newData.guid && typeof newData.guid === 'string') {
                        const si = newData.guid.indexOf('://');
                        if (si === -1) {
                            newFullGuidKey = newData.guid;
                        } else {
                            newFullGuidKey = newData.guid.substring(si + 3);
                            const qi = newFullGuidKey.indexOf('?');
                            if (qi !== -1) {
                                newFullGuidKey = newFullGuidKey.substring(0, qi);
                            }
                        }
                        if (!newFullGuidKey) newFullGuidKey = '-';
                    }
                    const newTooltipText = `${newFullGuidKey}: 클릭시 갱신`;

                    if (document.body.contains(badgeElement)) {
                        badgeElement.textContent = newDisplayGuidKey;
                        badgeElement.title = newTooltipText;
                    }
                } else {
                    throw new Error(`Failed to fetch valid GUID`);
                }
            } catch (error) {
                if (error.name !== 'AbortError') {
                    log(`Error refreshing GUID for ${itemId}:`, error);
                    if (document.body.contains(badgeElement)) {
                        badgeElement.textContent = '[실패]';
                        badgeElement.title = `오류: ${error.message || '알 수 없는 오류'}`;
                        badgeElement.style.color = 'red';
                        setTimeout(() => {
                            if (document.body.contains(badgeElement) && badgeElement.dataset.refreshing === 'true') {
                                badgeElement.textContent = originalText;
                                badgeElement.title = originalTooltip;
                                badgeElement.style.color = '#e5a00d';
                            }
                        }, 2000);
                    }
                } else {
                    log(`Refresh aborted for ${itemId}.`);
                    if (document.body.contains(badgeElement)) {
                        badgeElement.textContent = originalText;
                        badgeElement.title = originalTooltip;
                    }
                }
            }
            finally {
                if (document.body.contains(badgeElement)) {
                    delete badgeElement.dataset.refreshing;
                    if (badgeElement.textContent !== '[실패]') {
                        badgeElement.style.color = '#e5a00d';
                    }
                }
            }
        });
        return badgeElement;
    }

    // --- 목록 재생 아이콘 생성 ---
    function createListPlayIcon(machineIdentifier, itemId, filePath, container) {
        const playIconEl = document.createElement('a'); playIconEl.href = '#'; playIconEl.className = 'plex-list-play-external'; playIconEl.title = '외부 플레이어 재생'; playIconEl.innerHTML = ICONS.PLAY; playIconEl.dataset.filePath = filePath; playIconEl.dataset.itemId = itemId; playIconEl.dataset.serverId = machineIdentifier; playIconEl.dataset.openFolder = 'false';
        playIconEl.addEventListener('click', async (e) => { e.preventDefault(); e.stopPropagation(); const path = playIconEl.dataset.filePath; const item = playIconEl.dataset.itemId; const server = playIconEl.dataset.serverId; playIconEl.style.opacity = '0.5'; try { await openItemOnAgent(path, item, false, server); } catch (err) { log("List play icon click error:", err); } finally { setTimeout(() => { if(document.body.contains(playIconEl)) playIconEl.style.opacity = ''; }, 500); } });
        return playIconEl;
    }

    // --- 리스너 부착 함수들 ---
    function attachRefreshListener(cacheKey) { const rb = document.getElementById('refresh-guid-button'); if (rb) { const originalIconHTML = rb.innerHTML; const nrb = rb.cloneNode(true); rb.parentNode.replaceChild(nrb, rb); nrb.addEventListener('click', async () => { log(`Manual refresh for: ${cacheKey}`); if (hasCache(cacheKey)) { delete guidCacheObject[cacheKey]; scheduleSaveCache(); document.getElementById('plex-guid-box')?.remove(); currentDisplayedItemId = null; } nrb.innerHTML = ICONS.SPINNER; nrb.style.cursor = 'default'; try { await DetailProcess(1); } catch (error) { if (document.body.contains(nrb)) { nrb.innerHTML = originalIconHTML; nrb.style.cursor = 'pointer';}} }); } }
    function attachDownloadListeners(serverInfo) { if (!serverInfo?.serverUrl || !serverInfo.accessToken) return; document.querySelectorAll('#plex-guid-box .plex-download-link').forEach(l => { if (l.getAttribute('data-listener-attached') === 'true') return; l.setAttribute('data-listener-attached', 'true'); const originalIconHTML = l.innerHTML; l.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); const pid = l.dataset.partId; const fp = l.dataset.filePath; if (!pid) return; const fn = fp ? fp.substring(fp.lastIndexOf('/') + 1) : `part_${pid}`; const url = `${serverInfo.serverUrl}/library/parts/${pid}/0/file?download=1&X-Plex-Token=${serverInfo.accessToken}`; try { const tl = document.createElement('a'); tl.href = url; tl.download = fn; tl.style.display='none'; document.body.appendChild(tl); tl.click(); document.body.removeChild(tl); l.innerHTML = ICONS.CHECK; setTimeout(()=>{if(document.body.contains(l)) l.innerHTML = originalIconHTML;},3000); } catch(err){ l.innerHTML = ICONS.TIMES; setTimeout(()=>{if(document.body.contains(l)) l.innerHTML = originalIconHTML;},3000); } }); }); document.querySelectorAll('#plex-guid-box .plex-kor-subtitle-download').forEach(l => { if (l.getAttribute('data-listener-attached') === 'true') return; l.setAttribute('data-listener-attached', 'true'); const originalIconHTML = l.innerHTML; const originalTitle = l.title; l.addEventListener('click', async (e) => { e.preventDefault(); e.stopPropagation(); const sid = l.dataset.streamId; const sk = l.dataset.streamKey; const fmt = l.dataset.subtitleFormat || 'srt'; let lc = l.dataset.subtitleLanguage || 'kor'; const vfn = l.dataset.videoFilename || `subtitle_${lc}`; if (lc.toLowerCase() === 'kor') lc = 'ko'; if (!sid) return; let apiUrl = sk && sk.startsWith('/library/streams/') ? `${serverInfo.serverUrl}${sk}?X-Plex-Token=${serverInfo.accessToken}` : `${serverInfo.serverUrl}/library/streams/${sid}?X-Plex-Token=${serverInfo.accessToken}`; const fn = `${vfn}.${lc}.${fmt}`; log(`Subtitle download: ${apiUrl}`); l.innerHTML = ICONS.SPINNER; l.style.cursor='default'; l.title = '다운로드 중...'; const ac = new AbortController(); const sig = ac.signal; try { const rsp = await makeRequest({ url: apiUrl, method: 'GET', headers:{'Accept':'text/plain, */*'}, responseType:'blob', signal: sig }); if (sig.aborted) throw new DOMException('Aborted','AbortError'); const blob = rsp.response; if(!blob) throw new Error('No blob'); const burl = URL.createObjectURL(blob); const tl=document.createElement('a'); tl.href=burl; tl.download=fn; tl.style.display='none'; document.body.appendChild(tl); tl.click(); document.body.removeChild(tl); URL.revokeObjectURL(burl); l.innerHTML = ICONS.CHECK; l.title='다운로드 완료'; setTimeout(()=>{if(document.body.contains(l)){l.innerHTML = originalIconHTML; l.title=originalTitle;}},3000); } catch (err) { if(err.name!=='AbortError'){ log('Subtitle error:', err); l.innerHTML = ICONS.TIMES; l.title=`실패: ${err.message||err.error||'?'}`; setTimeout(()=>{if(document.body.contains(l)){l.innerHTML = originalIconHTML; l.title=originalTitle;}},3000); } else { if(document.body.contains(l)){l.innerHTML = originalIconHTML; l.title=originalTitle;} } } finally { if(document.body.contains(l)) l.style.cursor='pointer'; } }); }); }

    function attachPlaybackListeners(serverId, itemId) {
        const btns = document.querySelectorAll('#plex-guid-box .plex-play-external, #plex-guid-box .plex-open-folder');
        log(`[attachPlaybackListeners] Attaching ${btns.length} buttons for ${serverId}/${itemId}`);
        btns.forEach(b => {
            if (b.getAttribute('data-listener-attached') === 'true') return;
            b.setAttribute('data-listener-attached', 'true');
            b.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                const originalPath = b.dataset.filePath;
                const of = b.dataset.openFolder === 'true';
                const bsid = b.dataset.serverId;
                const biid = b.dataset.itemId;
                const itemType = b.dataset.itemType || 'video';

                if (!originalPath || !bsid || !biid) {
                    if(typeof toastr!=='undefined') toastr.error('재생 정보 부족');
                    return;
                }
                const oo = b.style.opacity;
                b.style.opacity='0.5';
                try {
                    await openItemOnAgent(originalPath, biid, of, bsid, itemType);
                } catch (err) {}
                finally { if(document.body.contains(b)) b.style.opacity = oo || ''; }
            });
        });
    }

    // --- 경로 스캔 리스너 부착 (Plex Mate API, 동적 URL) ---
    function attachPlexMateScanListeners(serverId) {
        document.querySelectorAll('.plex-path-scan-link').forEach(link => {
            if (link.getAttribute('data-listener-attached') === 'true') return;
            link.setAttribute('data-listener-attached', 'true');

            link.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();

                const originalPath = link.dataset.originalPath;
                const itemType = link.dataset.itemType;

                const mateBaseUrl = FF_URL_MAPPINGS[serverId];
                if (!mateBaseUrl) {
                    toastr.warning(`이 서버(${serverId})에 대한 Plex Mate URL이 설정되지 않았습니다.`);
                    return;
                }
                const fullApiUrl = mateBaseUrl + PLEX_MATE_API_DO_SCAN;

                if (!originalPath || !fullApiUrl || !PLEX_MATE_APIKEY) {
                    toastr.warning('Plex Mate 스캔에 필요한 정보(URL, API키)가 부족합니다.');
                    return;
                }

                let scanPath = originalPath;
                if (itemType === 'video' && originalPath.includes('/')) {
                    scanPath = originalPath.substring(0, originalPath.lastIndexOf('/'));
                }

                toastr.info(`Plex Mate에 '${getDisplayPath(scanPath)}' 경로 스캔을 요청합니다...`);

                try {
                    const data = new URLSearchParams();
                    data.append('callback_id', 'PlexMetaHelper');
                    data.append('target', scanPath);
                    data.append('apikey', PLEX_MATE_APIKEY);
                    data.append('mode', 'ADD');

                    log('[PlexMateScan] Sending request. URL:', fullApiUrl, 'Data:', data.toString());

                    await makeRequest({
                        method: 'POST',
                        url: fullApiUrl,
                        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                        data: data.toString(),
                        timeout: 30000
                    });
                    toastr.success('Plex Mate 스캔 요청에 성공했습니다.');
                } catch (error) {
                    log('Plex Mate path scan error:', error);
                    let errorMsg = '알 수 없는 오류';
                    if (error.error === 'Timeout') {
                        errorMsg = '요청 시간이 초과되었습니다. Plex Mate 서버가 응답하지 않을 수 있습니다.';
                    } else if (error.error === 'Network error') {
                        errorMsg = 'Plex Mate 서버에 연결할 수 없습니다.';
                    } else if (error.statusText) {
                        errorMsg = `서버 응답 오류 (${error.status || ''} ${error.statusText})`;
                    }
                    toastr.error(`스캔 요청 실패: ${errorMsg}`, '오류', {timeOut: 7000});
                }
            });
        });
    }

    // --- plex_mate 새로고침 리스너 부착 ---
    function attachPlexMateRefreshListener(itemId, serverId) {
        const button = document.getElementById('plex-mate-refresh-button');
        if (!button) return;

        const mateBaseUrl = FF_URL_MAPPINGS[serverId];
        const originalHtml = button.innerHTML;
        button.addEventListener('click', async (e) => {
            e.preventDefault(); e.stopPropagation();

            if (!mateBaseUrl || !PLEX_MATE_APIKEY) {
                toastr.warning('이 서버에 대한 plex_mate URL 또는 API 키가 설정되지 않았습니다.');
                return;
            }

            toastr.info('plex_mate에 새로고침을 요청합니다...');
            button.style.pointerEvents = 'none'; button.innerHTML = `${ICONS.SPINNER} 요청 중...`;

            try {
                const url = mateBaseUrl + PLEX_MATE_API_MANUAL_REFRESH;
                const data = `apikey=${encodeURIComponent(PLEX_MATE_APIKEY)}&metadata_item_id=${encodeURIComponent(itemId)}`;
                await makeRequest({
                    method: 'POST',
                    url: url,
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    data: data,
                    timeout: 30000 // 30초 타임아웃 (단위: ms)
                });
                toastr.success('새로고침 요청 성공! 잠시 후 캐시 갱신(🔄)을 눌러주세요.');
            } catch (error) {
                log('plex_mate refresh error:', error);
                let errorMsg = '알 수 없는 오류';
                if (error.error === 'Timeout') {
                    errorMsg = '요청 시간이 초과되었습니다. 서버가 느리거나 응답이 없을 수 있습니다.';
                } else if (error.error === 'Network error') {
                    errorMsg = '네트워크 오류가 발생했습니다. 서버에 연결할 수 없습니다.';
                } else if (error.statusText) {
                    errorMsg = `서버 응답 오류 (${error.status || ''} ${error.statusText})`;
                }
                toastr.error(`새로고침 요청 실패: ${errorMsg}`, '오류', {timeOut: 7000});
            } finally {
                if(document.body.contains(button)) {
                    button.style.pointerEvents = 'auto'; button.innerHTML = originalHtml;
                }
            }
        });
    }

    // --- 상세 페이지 처리 ---
    async function DetailProcess(retryAttempt = 1) {
        if (isDetailProcessRunning) return; isDetailProcessRunning = true;
        if (detailProcessTriggeredByObserver) detailProcessTriggeredByObserver = false; if (detailObserverDebounceTimer) { clearTimeout(detailObserverDebounceTimer); detailObserverDebounceTimer = null; }
        const MAX_RETRIES = 2; const RETRY_DELAY = 1000; const { serverId, itemId } = extractIds(); const cacheKey = (serverId && itemId) ? `${serverId}_${itemId}` : null;
        log(`DetailProcess call for ${cacheKey || 'Invalid ID'} (Attempt: ${retryAttempt})`);
        if (!cacheKey || !isDetailInfoVisible || !isDetailPage()) { isDetailProcessRunning = false; return; }
        if (!currentController || currentController.signal.aborted || currentServerId !== serverId || currentItemId !== itemId) { cancelPreviousRequest(); currentController = new AbortController(); currentServerId = serverId; currentItemId = itemId; }
        const signal = currentController.signal;
        if (document.getElementById('plex-guid-box') && currentDisplayedItemId === cacheKey) { isDetailProcessRunning = false; return; }
        if (document.getElementById('plex-guid-box') && currentDisplayedItemId !== cacheKey) { document.getElementById('plex-guid-box').remove(); currentDisplayedItemId = null; }
        let dataToDisplay = null; let serverInfo = null; let displayed = false;
        try {
            if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
            if (hasCache(cacheKey)) { dataToDisplay = getCache(cacheKey); if(!dataToDisplay || typeof dataToDisplay !== 'object') { dataToDisplay = null; delete guidCacheObject[cacheKey]; } else log('DetailProcess: Using cached data.'); }
            if (!dataToDisplay) { log(`DetailProcess: Cache miss for ${cacheKey}, API call...`); serverInfo = extractServerInfo(serverId); if(!serverInfo) throw new Error('No server info'); const fetchedData = await fetchGuid(serverInfo.serverUrl, itemId, serverInfo.accessToken, signal); const ids = extractIds(); if(ids.serverId !== serverId || ids.itemId !== itemId) throw new Error('ID mismatch after API'); if(!fetchedData) throw new Error('No valid data from API'); updateCache(cacheKey, fetchedData); dataToDisplay = fetchedData; log('DetailProcess: Data fetched from API and cached.'); }
            if (dataToDisplay) {
                log(`DetailProcess: Data ready for ${cacheKey}. Waiting for container...`);
                if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
                const mainContainer = await waitForMetadataContainer(signal);
                log(`DetailProcess: Container found for ${cacheKey}.`);
                if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
                if (!serverInfo) serverInfo = extractServerInfo(serverId);
                if (!serverInfo) throw new Error('Server info not found');
                displayed = await displayGuidDetail(dataToDisplay, signal, mainContainer);

                if (displayed) {
                    log(`DetailProcess: Display SUCCESS for ${cacheKey}.`);
                    currentDisplayedItemId = cacheKey;
                    attachPlexMateRefreshListener(dataToDisplay.itemId, serverId);
                    attachRefreshListener(cacheKey);
                    attachDownloadListeners(serverInfo);
                    if(isExternalPlayVisible) attachPlaybackListeners(serverId, dataToDisplay.itemId);
                    attachPlexMateScanListeners(serverId); // plex_mate 스캔 리스너로 교체
                } else if (signal.aborted) {
                    log('DetailProcess: Aborted during display.');
                }
            } else { log(`DetailProcess: No data to display for ${cacheKey}.`); document.getElementById('plex-guid-box')?.remove(); currentDisplayedItemId = null; }
        } catch (error) { if (error.name !== 'AbortError') log(`DetailProcess Error (Attempt ${retryAttempt})`, cacheKey, error); else log(`DetailProcess Aborted (Attempt ${retryAttempt}).`); displayed = false; if (currentDisplayedItemId === cacheKey) currentDisplayedItemId = null; }
        finally { if (!signal?.aborted && !displayed && retryAttempt < MAX_RETRIES) { isDetailProcessRunning = false; setTimeout(() => DetailProcess(retryAttempt + 1), RETRY_DELAY); } else { if (!displayed && retryAttempt >= MAX_RETRIES) { document.getElementById('plex-guid-box')?.remove(); if (currentDisplayedItemId === cacheKey) currentDisplayedItemId = null; } isDetailProcessRunning = false; } }
    }

    // --- 동시성 제어를 위한 헬퍼 함수 ---
    async function processQueueWithConcurrency(queue, limit, asyncFunction) { const results = []; const executing = []; let queueIndex = 0; while (queueIndex < queue.length || executing.length > 0) { while (executing.length < limit && queueIndex < queue.length) { const item = queue[queueIndex++]; const promise = asyncFunction(item).then(result => ({ item, result })).catch(error => ({ item, error })); executing.push(promise); promise.finally(() => { const index = executing.indexOf(promise); if (index > -1) executing.splice(index, 1); }); } if (executing.length > 0) results.push(await Promise.race(executing)); } return results; }

    // --- 목록 페이지 처리 ---
    async function ListProcess() {
        log("ListProcess: Starting...");
        if (!isListGuidVisible && !isExternalPlayVisible) { removeAllGuidBadges(); document.querySelectorAll('div[data-testid^="cellItem"][data-pmdv-processed]').forEach(c => c.removeAttribute('data-pmdv-processed')); return; }
        if (!isMediaListPage()) return;
        const signal = currentController?.signal;
        try {
            const candidateContainers = Array.from(document.querySelectorAll('div[data-testid^="cellItem"]:not([data-pmdv-processed])'));
            if (signal?.aborted || !candidateContainers || candidateContainers.length === 0) { log("ListProcess: No new items or aborted."); return; }
            log(`ListProcess: Found ${candidateContainers.length} candidate containers.`); const fetchQueue = []; const itemsToProcess = [];
            // 1. 정보 수집 및 처리 대상 선정
            for (const container of candidateContainers) { if (signal?.aborted) break; const itemElement = container.querySelector('a[data-testid="metadataTitleLink"]'); if (!itemElement) continue; container.setAttribute('data-pmdv-processed', 'true'); const href = itemElement.getAttribute('href') || ''; const keyParam = new URLSearchParams(href.split('?')[1]).get('key'); if (!keyParam) { container.removeAttribute('data-pmdv-processed'); continue; } const dk = decodeURIComponent(keyParam); const sm = href.match(/\/server\/([a-f0-9]+)\//); const mid = sm ? sm[1] : null; const iidPart = dk.split('/metadata/')[1]; const iid = iidPart?.split(/[\/?]/)[0]; if (!mid || !iid || !/^\d+$/.test(iid)) { container.removeAttribute('data-pmdv-processed'); continue; } const cacheKey = `${mid}_${iid}`; const cachedData = getCache(cacheKey); itemsToProcess.push({ container, secondaryLinkElement: itemElement, machineIdentifier: mid, itemId: iid, cacheKey, cachedData }); if (!cachedData && (isListGuidVisible || isExternalPlayVisible)) { const serverInfo = extractServerInfo(mid); if (serverInfo) fetchQueue.push({ cacheKey, serverInfo, itemId: iid, container }); else container.removeAttribute('data-pmdv-processed'); } else if (!cachedData) container.removeAttribute('data-pmdv-processed'); }
            if (signal?.aborted) { itemsToProcess.forEach(item => item.container.removeAttribute('data-pmdv-processed')); throw new DOMException('Aborted', 'AbortError'); }
            // 2. API 호출
            if (fetchQueue.length > 0) { log(`ListProcess: Fetching data for ${fetchQueue.length} items...`); const apiFetchFunction = async (job) => { try { return await fetchGuid(job.serverInfo.serverUrl, job.itemId, job.serverInfo.accessToken, signal); } catch(error) { if (error.name !== 'AbortError') log(`API fetch error for ${job.itemId}: ${error.message}`); return null; } }; const completedJobs = await processQueueWithConcurrency(fetchQueue, API_CONCURRENCY_LIMIT, apiFetchFunction); if (signal?.aborted) { itemsToProcess.forEach(item => item.container.removeAttribute('data-pmdv-processed')); throw new DOMException('Aborted', 'AbortError'); } completedJobs.forEach(({ item: job, result: data, error }) => { const itemToUpdate = itemsToProcess.find(p => p.cacheKey === job.cacheKey); if (error || !data) { if (itemToUpdate) itemToUpdate.container.removeAttribute('data-pmdv-processed'); } else { updateCache(job.cacheKey, data); if (itemToUpdate) itemToUpdate.fetchedData = data; } }); log(`ListProcess: Finished fetching API requests.`); }
            // 3. 아이콘/뱃지 표시
            log(`ListProcess: Processing ${itemsToProcess.length} items for final display.`);
            for (const item of itemsToProcess) { if (signal?.aborted) break; const data = item.fetchedData || item.cachedData; if (!data) { item.container.removeAttribute('data-pmdv-processed'); continue; } const existingBadge = item.container.querySelector('.plex-guid-list-box'); const existingPlayIcon = item.container.querySelector('.plex-list-play-external'); if (existingBadge && existingBadge.dataset.refreshing !== 'true') { const newGuidKey = data.guid ? extractGuidKey(data.guid) : null; if (!isListGuidVisible || !newGuidKey || existingBadge.textContent !== newGuidKey) existingBadge.remove(); } if (existingPlayIcon && !isExternalPlayVisible) existingPlayIcon.remove(); if (isExternalPlayVisible && !item.container.querySelector('.plex-list-play-external')) { const firstPartPath = data.mediaVersions?.[0]?.parts?.[0]?.path; if (data.type === 'video' && firstPartPath) { try { const playIcon = createListPlayIcon(item.machineIdentifier, item.itemId, firstPartPath, item.container); if (playIcon) { const pc = item.container.querySelector('div[class*="PosterCard-card-"]'); if (pc) pc.appendChild(playIcon); else item.container.appendChild(playIcon); } } catch (e) {} } } if (isListGuidVisible && data.guid) { const currentBadge = item.container.querySelector('.plex-guid-list-box'); if (!currentBadge) { try { const badge = createGuidBadge(item.machineIdentifier, item.itemId, data.guid); if (badge) { const targetElement = item.container.querySelector('div[class*="PosterCard-card-"]')?.nextElementSibling; if (targetElement && targetElement.tagName === 'A') targetElement.insertAdjacentElement('afterend', badge); else { if(item.secondaryLinkElement?.parentNode) item.secondaryLinkElement.insertAdjacentElement('afterend', badge); else item.container.appendChild(badge); } } } catch (e) {} } } }
            if (signal?.aborted) { itemsToProcess.forEach(item => item.container.removeAttribute('data-pmdv-processed')); throw new DOMException('Aborted', 'AbortError'); }
            log(`ListProcess: Finished processing loop.`);
        } catch (err) { if (err.name === 'AbortError') log('ListProcess aborted.'); else log('ListProcess error:', err); document.querySelectorAll('div[data-testid^="cellItem"][data-pmdv-processed]').forEach(cont => cont.removeAttribute('data-pmdv-processed')); }
    }

    // --- DOM 변경 감지 ---
    function setupMediaListObserver() { let uiInjected = false; const observer = new MutationObserver(mutations => { if (!uiInjected && !document.getElementById('pmdv-controls')) { const ab = document.querySelector('button[data-testid="navbarAccountMenuTrigger"]'); if (ab) { try { injectControlUI(); } catch(e) {} } } if (document.getElementById('pmdv-controls')) uiInjected = true; if (isMediaListPage()) { let listNeedsProcessing = false; for (const m of mutations) { if (m.type === 'childList' && m.addedNodes.length > 0) { for (const n of m.addedNodes) { if (n.nodeType !== 1) continue; const isScriptEl = n.matches?.('.plex-guid-list-box, .plex-list-play-external, #pmdv-controls') || n.closest?.('.plex-guid-list-box, .plex-list-play-external, #pmdv-controls'); if (!isScriptEl) { const container = n.matches?.('div[data-testid^="cellItem"]') ? n : n.closest?.('div[data-testid^="cellItem"]'); if (container && !container.hasAttribute('data-pmdv-processed') && container.querySelector('a[data-testid="metadataTitleLink"]')) { listNeedsProcessing = true; break; } } } } if (listNeedsProcessing) break; } if (listNeedsProcessing) { if (observer.debounceTimer) clearTimeout(observer.debounceTimer); observer.debounceTimer = setTimeout(() => { if (isListGuidVisible || isExternalPlayVisible) ListProcess(); }, 300); } } }); observer.debounceTimer = null; observer.observe(document.body, { childList: true, subtree: true }); log('MutationObserver setup complete.'); }

    // --- 페이지 내 컨트롤 UI 생성 ---
    function injectControlUI() {
        log("Injecting Control UI..."); if (document.getElementById('pmdv-controls')) { loadSettingsAndUpdateUI(); return; }
        let targetElement = null; let insertBeforeElement = null;
        try { const ab = document.querySelector('button[data-testid="navbarAccountMenuTrigger"]'); if (ab) { const ra = ab.closest('div[style*="height: 100%;"]:not([class*="NavBar-container"])'); if (ra) { targetElement = ra; insertBeforeElement = ra.firstChild; } else { const nc = ab.closest('[class*="NavBar-container"]'); if (nc) { const pr = Array.from(nc.children).find(c => c.contains(ab)); if (pr) { targetElement = pr; insertBeforeElement = pr.firstChild; } } } } if (!targetElement) { const nc = document.querySelector('div[class*="NavBar-container"]'); if (nc && nc.children.length >= 2) { const pr = nc.children[nc.children.length - 1]; if (pr && pr.querySelector('button[data-testid="navbarAccountMenuTrigger"], a[href*="settings"]')) { targetElement = pr; insertBeforeElement = pr.firstChild; } } } } catch (e) {}
        if (!targetElement) { log("Cannot determine UI target."); return; }
        try {
            controlContainer = document.createElement('div'); controlContainer.id = 'pmdv-controls'; statusMessageElement = document.createElement('span'); statusMessageElement.id = 'pmdv-status'; controlContainer.appendChild(statusMessageElement);
            toggleListGuidButton = document.createElement('button'); toggleListGuidButton.id = 'pmdv-toggle-list'; toggleListGuidButton.addEventListener('click', () => { isListGuidVisible = !isListGuidVisible; storageSet(LIST_GUID_VISIBILITY_KEY, isListGuidVisible); updateToggleButtonUI(); if (!isListGuidVisible) document.querySelectorAll('.plex-guid-list-box:not([data-refreshing="true"])').forEach(el => el.remove()); if (isListGuidVisible || isExternalPlayVisible) { document.querySelectorAll('div[data-testid^="cellItem"][data-pmdv-processed]').forEach(el => el.removeAttribute('data-pmdv-processed')); ListProcess(); } showStatusMessage(`목록 GUID ${isListGuidVisible ? 'ON' : 'OFF'}`); }); controlContainer.appendChild(toggleListGuidButton);
            toggleListPlayButton = document.createElement('button'); toggleListPlayButton.id = 'pmdv-toggle-list-play'; toggleListPlayButton.addEventListener('click', () => { isExternalPlayVisible = !isExternalPlayVisible; storageSet(LIST_PLAY_ICON_VISIBILITY_KEY, isExternalPlayVisible); updateToggleButtonUI(); if (!isExternalPlayVisible) document.querySelectorAll('.plex-list-play-external').forEach(el => el.remove()); if (isDetailPage()) { document.getElementById('plex-guid-box')?.remove(); currentDisplayedItemId = null; if(isDetailInfoVisible) DetailProcess(1); } else if (isMediaListPage()) { document.querySelectorAll('div[data-testid^="cellItem"][data-pmdv-processed]').forEach(el => el.removeAttribute('data-pmdv-processed')); if (isListGuidVisible || isExternalPlayVisible) ListProcess(); } showStatusMessage(`외부 재생 ${isExternalPlayVisible ? 'ON' : 'OFF'}`); }); controlContainer.appendChild(toggleListPlayButton);
            toggleDetailInfoButton = document.createElement('button'); toggleDetailInfoButton.id = 'pmdv-toggle-detail'; toggleDetailInfoButton.addEventListener('click', () => { isDetailInfoVisible = !isDetailInfoVisible; storageSet(DETAIL_INFO_VISIBILITY_KEY, isDetailInfoVisible); updateToggleButtonUI(); if (!isDetailInfoVisible) { document.getElementById('plex-guid-box')?.remove(); currentDisplayedItemId = null; stopDetailCheckInterval(); } else { if (isDetailPage()) { DetailProcess(1); startDetailCheckInterval(); } } showStatusMessage(`추가 정보 ${isDetailInfoVisible ? 'ON' : 'OFF'}`); }); controlContainer.appendChild(toggleDetailInfoButton);
            const lengthLabel = document.createElement('label'); lengthLabel.textContent = '길이:'; lengthLabel.htmlFor = 'pmdv-guid-length'; guidLengthInput = document.createElement('input'); guidLengthInput.type = 'number'; guidLengthInput.id = 'pmdv-guid-length'; guidLengthInput.min = '5'; guidLengthInput.max = '50'; applyGuidLengthButton = document.createElement('button'); applyGuidLengthButton.id = 'pmdv-apply-length'; applyGuidLengthButton.textContent = '적용'; applyGuidLengthButton.addEventListener('click', () => { const nl = parseInt(guidLengthInput.value); if (!isNaN(nl) && nl >= 5 && nl <= 50) { if (nl !== guidMaxLength) { guidMaxLength = nl; storageSet(GUID_LENGTH_KEY, guidMaxLength); document.querySelectorAll('div[data-testid^="cellItem"][data-pmdv-processed]').forEach(el => el.removeAttribute('data-pmdv-processed')); removeAllGuidBadges(); if (isListGuidVisible || isExternalPlayVisible) ListProcess(); showStatusMessage(`길이 ${guidMaxLength} 적용`); } else showStatusMessage('이미 적용된 값'); } else { showStatusMessage('5~50 사이 입력'); guidLengthInput.value = guidMaxLength; } }); controlContainer.appendChild(lengthLabel); controlContainer.appendChild(guidLengthInput); controlContainer.appendChild(applyGuidLengthButton);
            clearCurrentButton = document.createElement('button'); clearCurrentButton.id = 'pmdv-clear-current'; clearCurrentButton.textContent = '현재 캐시'; clearCurrentButton.title = '현재 페이지 항목 캐시 지우기'; clearCurrentButton.addEventListener('click', () => { let cl=0; let nl=false; let nd=false; const cpd=isDetailPage(); const cpl=isMediaListPage(); if(cpd){const {serverId:sid,itemId:iid}=extractIds();if(sid&&iid){const ck=`${sid}_${iid}`;if(hasCache(ck)){delete guidCacheObject[ck];cl++;nd=true;document.getElementById('plex-guid-box')?.remove();currentDisplayedItemId=null;}}}else if(cpl){document.querySelectorAll('div[data-testid^="cellItem"]').forEach(cont => { const link = cont.querySelector('a[data-testid="metadataTitleLink"]'); if(!link) return; const h=link.getAttribute('href')||'';const kp=new URLSearchParams(h.split('?')[1]).get('key');if(!kp)return;const dk=decodeURIComponent(kp);const sm=h.match(/\/server\/([a-f0-9]+)\//);const mid=sm?sm[1]:null;const iid=dk.split('/metadata/')[1]?.split(/[\/?]/)[0];if(mid&&iid&&/^\d+$/.test(iid)){const ck=`${mid}_${iid}`;if(hasCache(ck)){delete guidCacheObject[ck];cl++;nl=true; cont.querySelectorAll('.plex-guid-list-box:not([data-refreshing="true"]), .plex-list-play-external').forEach(el => el.remove()); cont.removeAttribute('data-pmdv-processed');}}});} if(cl>0){scheduleSaveCache();showStatusMessage(`${cl}개 캐시 삭제`);if(nd && isDetailInfoVisible)DetailProcess(1);if(nl && (isListGuidVisible || isExternalPlayVisible))ListProcess();}else showStatusMessage('삭제할 캐시 없음');}); controlContainer.appendChild(clearCurrentButton);
            clearAllButton = document.createElement('button'); clearAllButton.id = 'pmdv-clear-all'; clearAllButton.textContent = '전체 캐시'; clearAllButton.title = '모든 캐시 지우기'; clearAllButton.addEventListener('click', () => { if (confirm("정말로 모든 캐시를 지우시겠습니까?")) { guidCacheObject = {}; storageSet(CACHE_STORAGE_KEY, {}); document.getElementById('plex-guid-box')?.remove(); currentDisplayedItemId = null; removeAllGuidBadges(); document.querySelectorAll('div[data-testid^="cellItem"][data-pmdv-processed]').forEach(el => el.removeAttribute('data-pmdv-processed')); showStatusMessage('전체 캐시 삭제됨'); if (isDetailPage() && isDetailInfoVisible) DetailProcess(1); if (isMediaListPage() && (isListGuidVisible || isExternalPlayVisible)) ListProcess(); } }); controlContainer.appendChild(clearAllButton);
        } catch (e) { log("UI element creation error:", e); return; }
        try { targetElement.insertBefore(controlContainer, insertBeforeElement); loadSettingsAndUpdateUI(); }
        catch (ie) { log("UI Inject FAILED:", ie); try { targetElement.appendChild(controlContainer); loadSettingsAndUpdateUI(); } catch (fe) {} }
    }

    // --- UI 버튼 상태 업데이트 ---
    function updateToggleButtonUI() {
        if (toggleListGuidButton) { toggleListGuidButton.textContent = `목록GUID: ${isListGuidVisible ? 'ON' : 'OFF'}`; isListGuidVisible ? toggleListGuidButton.classList.add('on') : toggleListGuidButton.classList.remove('on'); }
        if (toggleListPlayButton) { toggleListPlayButton.textContent = `외부재생: ${isExternalPlayVisible ? 'ON' : 'OFF'}`; isExternalPlayVisible ? toggleListPlayButton.classList.add('on') : toggleListPlayButton.classList.remove('on'); }
        if (toggleDetailInfoButton) { toggleDetailInfoButton.textContent = `추가정보: ${isDetailInfoVisible ? 'ON' : 'OFF'}`; isDetailInfoVisible ? toggleDetailInfoButton.classList.add('on') : toggleDetailInfoButton.classList.remove('on'); }
    }

    // --- 상태 메시지 표시 ---
    function showStatusMessage(msg, isError = false) { if (statusMessageElement) { statusMessageElement.textContent = msg; statusMessageElement.style.color = isError ? 'red' : '#aaa'; statusMessageElement.style.fontWeight = isError ? 'bold' : 'normal'; if (statusTimeout) clearTimeout(statusTimeout); statusTimeout = setTimeout(() => { if (statusMessageElement) statusMessageElement.textContent = ''; }, 2000); } log("Status message:", msg); }

    // --- 초기 실행 로직 ---
    (async function() {
        log('Userscript initializing...'); await loadCache(); log('Initial cache loaded.');
        function tryInjectUI() { if (document.getElementById('pmdv-controls')) { loadSettingsAndUpdateUI(); return; } let a = 0; const m = 20; const i = setInterval(() => { a++; const b = document.querySelector('button[data-testid="navbarAccountMenuTrigger"]'); if (b || a >= m) { clearInterval(i); if(b) try { injectControlUI(); } catch(e) {} else log("Failed to find NavBar after timeout."); } }, 500); }
        if (document.readyState === 'loading' || document.readyState === 'interactive') document.addEventListener('DOMContentLoaded', tryInjectUI); else tryInjectUI();
        setupSPAObserver(); setupMediaListObserver();
        log("Running initial checkUrlChange directly...");
        checkUrlChange(); log('Initialization sequence complete.');
    })();

})();
