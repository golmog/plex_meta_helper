// ==UserScript==
// @name         Plex Meta Helper
// @namespace    https://tampermonkey.net/
// @version      0.7.43
// @description  Plex Web UI 개선 스크립트
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
    /* Toastr & Custom PMH Logo (Black/Orange) */
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
        padding: 15px 15px 15px 50px;
        width: 300px; border-radius: 3px;
        background-position: 15px center;
        background-repeat: no-repeat;
        background-size: 24px 24px !important;
        background-image: url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA2NCA2NCI+PHJlY3Qgd2lkdGg9IjY0IiBoZWlnaHQ9IjY0IiByeD0iMTIiIGZpbGw9IiMwMDAwMDAiIC8+PHRleHQgeD0iMzIiIHk9IjM1IiBmaWxsPSIjZTVhMDBkIiBmb250LWZhbWlseT0ic2Fucy1zZXJpZiIgZm9udC1zaXplPSIyNCIgZm9udC13ZWlnaHQ9ImJvbGQiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGFsaWdubWVudC1iYXNlbGluZT0ibWlkZGxlIj5QTUg8L3RleHQ+PC9zdmc+') !important; opacity: .9;
        box-shadow: #000 0 0 12px; color: #fff; opacity: .9;
    }
    #toast-container > :focus, #toast-container > :hover { opacity: 1; box-shadow: #000 0 0 12px; cursor: pointer; }
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

    .friend-fetch-btn {
        background-color: rgba(0, 0, 0, 0.7); color: #adb5bd; cursor: pointer;
        pointer-events: auto; opacity: 0.85; transition: opacity 0.15s, transform 0.15s, background-color 0.2s;
    }

    a:hover .plex-list-play-external, div[class*="PosterCard"]:hover .plex-list-play-external,
    div[class*="ThumbCard"]:hover .plex-list-play-external, div[class*="ListItem-container"]:hover .plex-list-play-external,
    div:hover > .pmh-top-right-wrapper .plex-list-play-external { opacity: 0.8; transform: scale(1); }

    a:hover .friend-fetch-btn, div[class*="PosterCard"]:hover .friend-fetch-btn,
    div[class*="ThumbCard"]:hover .friend-fetch-btn, div[class*="ListItem-container"]:hover .friend-fetch-btn,
    div:hover > .pmh-top-right-wrapper .friend-fetch-btn { opacity: 0.8; transform: scale(1); }

    .plex-list-play-external:hover, .friend-fetch-btn:hover { background-color: rgba(0, 0, 0, 0.9) !important; color: #ffffff !important; transform: scale(1.1) !important; opacity: 1 !important; }

    .plex-guid-list-box { display: inline; margin-left: 5px; color: #e5a00d; font-size: 11px; font-weight: normal; cursor: pointer; text-decoration: none; white-space: nowrap; transition: color 0.2s ease, text-decoration 0.2s ease; }
    .plex-guid-list-box:hover { text-decoration: underline !important; color: #ffc107 !important; opacity: 1 !important; text-shadow: 0 0 2px rgba(255,193,7,0.5); }

    /* 컨트롤 UI */
    #pmdv-controls { margin-right: 10px; order: -1; display: flex; align-items: center; gap: 5px; }
    #pmdv-controls span.ctrl-label { font-size: 11px !important; color: #aaa; font-weight: bold; margin-right: 2px; margin-left: 2px; }
    #pmdv-controls input[type="number"] { width: 35px; text-align: center; padding: 2px; font-size: 11px; background-color: rgba(0,0,0,0.2); border: 1px solid #555; color: #eee; border-radius: 3px; }
    #pmdv-controls button { font-size: 11px !important; padding: 3px 6px !important; margin: 0 !important; height: auto !important; line-height: 1.4 !important; color: #eee !important; background-color: rgba(0,0,0,0.2) !important; border: 1px solid #555 !important; border-radius: 4px !important; vertical-align: middle; cursor: pointer; white-space: nowrap; transition: background-color 0.2s ease; }
    #pmdv-controls button:hover { background-color: rgba(0,0,0,0.4) !important; border-color: #aaa !important; }
    #pmdv-controls button.on { background-color: #e5a00d !important; color: #1f1f1f !important; border-color: #e5a00d !important; font-weight: bold; }
    #pmdv-controls button.on:hover { background-color: #d4910c !important; }

    .plex-list-multipath-badge { display: inline-block; background-color: #e5a00d; color: #1f1f1f; font-size: 10px; font-weight: bold; padding: 0px 4px; border-radius: 3px; margin: 1px 2px 0 4px; vertical-align: top; }

    /* 뱃지 업데이트 시 부드러운 페이드 인 효과 */
    @keyframes pmhSoftFade {
        0% { opacity: 0.2; transform: translateY(-1px); }
        100% { opacity: 1; transform: translateY(0); }
    }
    .pmh-fade-update {
        animation: pmhSoftFade 0.2s ease-out forwards;
    }

    /* 손상 의심 파일(?) 오렌지색 에러 뱃지 전용 스타일 */
    .pmh-corrupt-badge { color: #e5a00d !important; font-weight: 900 !important; font-size: 11.5px !important; padding: 0px 5px !important; right: 2px; transform: scaleX(1.3); transform-origin: center; display: inline-block; letter-spacing: -1px; }

    .pmh-match-badge { display: block; width: max-content; background-color: rgba(0, 0, 0, 0.8); color: #e5a00d; border: 1px solid rgba(229, 160, 13, 0.4); font-size: 11px; font-weight: normal; padding: 2px 5px; border-radius: 4px; margin: 0; line-height: 1.2; letter-spacing: -0.2px; box-shadow: 0 1px 2px rgba(0,0,0,0.5); }

    /* PMH 툴박스 드롭다운 */
    #pmh-tool-dropdown {
        position: absolute; background-color: rgba(25, 28, 32, 0.98); border: 1px solid #444;
        border-radius: 6px; min-width: 250px; z-index: 99999;
        box-shadow: 0 8px 20px rgba(0,0,0,0.7); display: none; backdrop-filter: blur(5px);
    }
    .pmh-tool-item {
        color: #ccc; font-size: 12px; transition: 0.2s; border-bottom: 1px solid #333;
    }
    .pmh-tool-item:last-child { border-bottom: none; }
    .pmh-tool-run-btn:hover { color: #e5a00d; font-weight: bold; cursor: pointer; }
    .pmh-tool-delete-btn { color: rgba(255, 255, 255, 0.4) !important; transition: color 0.2s, transform 0.2s; }
    .pmh-tool-delete-btn:hover { color: #ff6b6b !important; transform: scale(1.1); }
    .pmh-action-icon:hover { transform: scale(1.1); color: #fff !important; }

    #pmh-tool-panel {
        position: fixed; top: 80px; left: 60%; width: 450px; 
        background-color: rgba(15, 17, 20, 0.98); border: 1px solid #e5a00d; border-radius: 8px;
        z-index: 999999; display: none; flex-direction: column; box-shadow: 0 10px 40px rgba(0,0,0,0.9);
        backdrop-filter: blur(10px); transition: opacity 0.2s ease;
        min-width: 350px; min-height: 200px;
        max-width: 95vw; max-height: calc(100vh - 50px);
    }

    .pmh-panel-header {
        padding: 12px 15px; background-color: rgba(0,0,0,0.7); border-bottom: 1px solid #444;
        border-radius: 8px 8px 0 0; display: flex; justify-content: space-between; align-items: center; 
        cursor: move; flex-shrink: 0;
    }
    .pmh-panel-title { color: #e5a00d; font-weight: bold; font-size: 14px; display: flex; align-items: center; gap: 6px; }
    .pmh-panel-close { color: #aaa; cursor: pointer; font-size: 16px; transition: color 0.2s; text-decoration: none !important; }
    .pmh-panel-close:hover { color: #fff; transform: scale(1.1); }
    
    .pmh-panel-content { 
        padding: 15px; overflow-y: auto; overflow-x: hidden; color: #ddd; 
        font-size: 13px; line-height: 1.5; flex-grow: 1; min-height: 0;
    }
    .pmh-panel-content::-webkit-scrollbar { width: 8px; }
    .pmh-panel-content::-webkit-scrollbar-thumb { background: #555; border-radius: 4px; }
    .pmh-panel-content::-webkit-scrollbar-thumb:hover { background: #e5a00d; }

    .pmh-resizer { position: absolute; z-index: 100000; }
    .pmh-resizer-n { top: -4px; left: 0; width: 100%; height: 8px; cursor: ns-resize; }
    .pmh-resizer-s { bottom: -4px; left: 0; width: 100%; height: 8px; cursor: ns-resize; }
    .pmh-resizer-e { top: 0; right: -4px; width: 8px; height: 100%; cursor: ew-resize; }
    .pmh-resizer-w { top: 0; left: -4px; width: 8px; height: 100%; cursor: ew-resize; }
    .pmh-resizer-ne { top: -4px; right: -4px; width: 12px; height: 12px; cursor: nesw-resize; }
    .pmh-resizer-nw { top: -4px; left: -4px; width: 12px; height: 12px; cursor: nwse-resize; }
    .pmh-resizer-se { bottom: -4px; right: -4px; width: 12px; height: 12px; cursor: nwse-resize; }
    .pmh-resizer-sw { bottom: -4px; left: -4px; width: 12px; height: 12px; cursor: nesw-resize; }

`);

(function() {
    'use strict';

    let pmhMatchResultsCache = [];
    const origOpen = XMLHttpRequest.prototype.open;
    const origSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function(method, url) {
        this._url = url;
        return origOpen.apply(this, arguments);
    };

    XMLHttpRequest.prototype.send = function() {
        this.addEventListener('load', function() {
            if (this._url && this._url.includes('/matches')) {
                try {
                    const parser = new DOMParser();
                    const xmlDoc = parser.parseFromString(this.responseText, "text/xml");
                    const items = xmlDoc.querySelectorAll('SearchResult, Directory, Video');
                    pmhMatchResultsCache = [];
                    items.forEach(item => {
                        const guid = item.getAttribute('guid');
                        if (guid) pmhMatchResultsCache.push(guid);
                    });
                } catch (e) {
                    console.error("[PMH] XML Parse Error during match extraction", e);
                }
            }
        });
        return origSend.apply(this, arguments);
    };

    // ==========================================
    // PMH Tool 패널 및 UI 제어 유틸리티
    // ==========================================
    function makeDraggable(elmnt, header) {
        let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
        header.onmousedown = dragMouseDown;

        function dragMouseDown(e) {
            e.preventDefault();
            pos3 = e.clientX; pos4 = e.clientY;
            document.onmouseup = closeDragElement;
            document.onmousemove = elementDrag;
        }
        function elementDrag(e) {
            e.preventDefault();
            pos1 = pos3 - e.clientX; pos2 = pos4 - e.clientY;
            pos3 = e.clientX; pos4 = e.clientY;
            elmnt.style.top = (elmnt.offsetTop - pos2) + "px";
            elmnt.style.left = (elmnt.offsetLeft - pos1) + "px";
            elmnt.style.right = "auto"; 
        }
        function closeDragElement() {
            document.onmouseup = null; document.onmousemove = null;
        }
    }

    function showPmhToolPanel(title, htmlContent) {
        let panel = document.getElementById('pmh-tool-panel');
        if (!panel) {
            panel = document.createElement('div');
            panel.id = 'pmh-tool-panel';
            panel.innerHTML = `
                <div class="pmh-panel-header" id="pmh-panel-header">
                    <div class="pmh-panel-title"><i class="fas fa-toolbox"></i> <span id="pmh-panel-title-text"></span></div>
                    <a href="#" class="pmh-panel-close" id="pmh-panel-close"><i class="fas fa-times"></i></a>
                </div>
                <div class="pmh-panel-content" id="pmh-panel-content"></div>
            `;
            document.body.appendChild(panel);

            document.getElementById('pmh-panel-close').addEventListener('click', (e) => {
                e.preventDefault(); e.stopPropagation();
                panel.style.display = 'none';
            });
            makeDraggable(panel, document.getElementById('pmh-panel-header'));
        }
        document.getElementById('pmh-panel-title-text').innerText = title;
        document.getElementById('pmh-panel-content').innerHTML = htmlContent;
        panel.style.display = 'flex';
    }

    // ==========================================
    // PMH 자연 정렬(Natural Sort) 유틸리티
    // ==========================================
    window.pmhNaturalSort = function(a, b, direction = 'asc') {
        const ax = [], bx = [];
        a.replace(/(\d+)|(\D+)/g, function(_, $1, $2) { ax.push([$1 || Infinity, $2 || ""]); });
        b.replace(/(\d+)|(\D+)/g, function(_, $1, $2) { bx.push([$1 || Infinity, $2 || ""]); });
        
        while (ax.length && bx.length) {
            const an = ax.shift();
            const bn = bx.shift();
            const nn = (an[0] - bn[0]) || an[1].localeCompare(bn[1]);
            if (nn) return direction === 'asc' ? nn : -nn;
        }
        return direction === 'asc' ? ax.length - bx.length : bx.length - ax.length;
    };

    // ==========================================
    // 1. 설정 및 로깅 / 업데이트 체크
    // ==========================================
    const CURRENT_VERSION = typeof GM_info !== 'undefined' ? GM_info.script.version : "0.0.0";
    const INFO_YAML_URL = "https://raw.githubusercontent.com/golmog/plex_meta_helper/main/info.yaml";
    const SETTINGS_KEY = 'pmh_server_final_settings';

    function isIgnoredItem(url, iid) {
        if (!iid || iid === 'undefined') return true;

        const targetUrl = url || window.location.hash || window.location.href;
        
        let decodedStr = '';
        try {
            decodedStr = decodeURIComponent(targetUrl) + '|' + iid;
        } catch (e) {
            decodedStr = targetUrl + '|' + iid;
        }
        
        if (decodedStr.includes('tv.plex') || decodedStr.includes('plex://') || decodedStr.includes('/provider/')) return true;
        if (!decodedStr.includes('/library/metadata/')) return true;

        return false;
    }

    function isNewerVersion(current, latest) {
        const c = current.split('.').map(Number);
        const l = latest.split('.').map(Number);
        for(let i=0; i<3; i++) {
            if((l[i]||0) > (c[i]||0)) return true;
            if((l[i]||0) < (c[i]||0)) return false;
        }
        return false;
    }

    async function pingLocalServer() {
        if (!AppSettings.SERVERS || AppSettings.SERVERS.length === 0) return {};
        log("[Ping] Checking versions for all registered local python servers...");

        const results = {};
        const promises = AppSettings.SERVERS.map(srv => {
            if (!srv.pmhServerUrl || !srv.plexMateApiKey) return Promise.resolve();
            return new Promise((resolve) => {
                GM_xmlhttpRequest({
                    method: "GET", url: `${srv.pmhServerUrl}/api/ping`,
                    headers: { "X-API-Key": srv.plexMateApiKey },
                    timeout: 2000,
                    onload: (res) => {
                        if (res.status === 200) {
                            try {
                                const ver = JSON.parse(res.responseText).version || "0.0.0";
                                results[srv.machineIdentifier] = ver;
                                log(`[Ping] Server (${srv.name}) responded successfully. Version: ${ver}`);
                            } catch(e) {
                                errorLog(`[Ping] Parse error for ${srv.name}.`, e);
                            }
                        } else {
                            errorLog(`[Ping] Server (${srv.name}) responded with error status: ${res.status}`);
                        }
                        resolve();
                    },
                    onerror: () => {
                        errorLog(`[Ping] Server (${srv.name}) is offline or unreachable.`);
                        resolve();
                    },
                    ontimeout: () => {
                        errorLog(`[Ping] Request timed out for ${srv.name}.`);
                        resolve();
                    }
                });
            });
        });

        await Promise.all(promises);
        return results;
    }

    function fetchLatestVersion() {
        return new Promise(async (resolve) => {
            log("[Update] Fetching latest unified version from info.yaml...");
            const noCacheUrl = `${INFO_YAML_URL}?t=${Date.now()}`;

            const localServerVersions = await pingLocalServer();

            GM_xmlhttpRequest({
                method: "GET", url: noCacheUrl,
                onload: (res) => {
                    log(`[Update] info.yaml response status: ${res.status}`);
                    if (res.status === 200) {
                        const match = res.responseText.match(/version:\s*"([^"]+)"/);
                        let latestVer = match ? match[1] : null;
                        let reqRestart = false;

                        if (latestVer) {
                            if (latestVer.includes('-server')) {
                                reqRestart = true;
                                latestVer = latestVer.replace('-server', '');
                            }
                            
                            infoLog(`[Update] Unified Target Version: ${latestVer}`);
                            GM_setValue('pmh_latest_version', latestVer);
                            GM_setValue('pmh_server_restart_required', reqRestart);
                            GM_setValue('pmh_last_update_check', Date.now());

                            resolve({
                                targetVer: latestVer,
                                localPyVers: localServerVersions,
                                msg: "성공", error: false, reqRestart
                            });
                        } else {
                            errorLog("[Update] Failed to parse version from info.yaml");
                            resolve({ targetVer: null, msg: "버전 정보 형식 오류", error: true });
                        }
                    } else if (res.status === 404) {
                        errorLog("[Update] info.yaml not found (404)");
                        resolve({ targetVer: null, msg: "info.yaml 없음 (404)", error: true });
                    } else {
                        errorLog(`[Update] HTTP Error: ${res.status}`);
                        resolve({ targetVer: null, msg: `서버 응답 오류 (${res.status})`, error: true });
                    }
                },
                onerror: (err) => {
                    errorLog("[Update] Network error during fetch.", err);
                    resolve({ targetVer: null, msg: "네트워크 연결 실패", error: true });
                }
            });
        });
    }

    async function checkUpdate() {
        const lastCheck = GM_getValue('pmh_last_update_check', 0);
        if (Date.now() - lastCheck > 24 * 60 * 60 * 1000) {
            log("[Update] Background update check initiated.");
            const result = await fetchLatestVersion();
            
            if (!result.error) {
                const latestKnownVer = result.targetVer;
                let needsUpdate = isNewerVersion(CURRENT_VERSION, latestKnownVer);
                let hasServerError = false;

                if (AppSettings.SERVERS) {
                    for (const srv of AppSettings.SERVERS) {
                        const curVer = result.localPyVers[srv.machineIdentifier];
                        if (curVer) {
                            if (isNewerVersion(curVer, latestKnownVer)) {
                                needsUpdate = true;
                            }
                        } else {
                            hasServerError = true;
                        }
                    }
                }

                GM_setValue('pmh_server_connection_error', hasServerError);

                if (needsUpdate || hasServerError) {
                    const ctrl = document.getElementById('pmdv-controls');
                    if (ctrl) {
                        ctrl.remove();
                        injectControlUI();
                    }
                }
            }
        } else {
            log("[Update] Background update check skipped (checked recently).");
            pingLocalServer().then(localPyVers => {
                let hasServerError = false;
                if (AppSettings.SERVERS) {
                    for (const srv of AppSettings.SERVERS) {
                        if (!localPyVers[srv.machineIdentifier]) {
                            hasServerError = true;
                        }
                    }
                }
                
                const wasError = GM_getValue('pmh_server_connection_error', false);
                if (wasError !== hasServerError) {
                    GM_setValue('pmh_server_connection_error', hasServerError);
                    const ctrl = document.getElementById('pmdv-controls');
                    if (ctrl) {
                        ctrl.remove();
                        injectControlUI();
                    }
                }
            });
        }
    }

    async function triggerServerUpdate(showStatusMsg, targetServers) {
        if (!targetServers || targetServers.length === 0) return true;

        log(`[Server Update] Triggering in-memory updates for ${targetServers.length} server(s)...`);
        showStatusMsg('서버 업데이트 요청 중...', '#ccc', 0);

        let successCount = 0;
        let lastErrorMsg = '';

        for (const srv of targetServers) {
            log(`[Server Update] Sending update POST request to: ${srv.name}`);
            try {
                await new Promise((resolve) => {
                    GM_xmlhttpRequest({
                        method: "POST", url: `${srv.pmhServerUrl}/api/admin/update`,
                        headers: { "X-API-Key": srv.plexMateApiKey },
                        timeout: 8000,
                        onload: (res) => {
                            if (res.status === 200) {
                                try {
                                    const jsonRes = JSON.parse(res.responseText);
                                    if (jsonRes.status === "success") {
                                        log(`[Server Update] Success for ${srv.name}. New Version: ${jsonRes.version}`);
                                        successCount++;
                                    } else {
                                        lastErrorMsg = jsonRes.message || "Unknown error inside 200 response";
                                        errorLog(`[Server Update] Update rejected by ${srv.name}: ${lastErrorMsg}`);
                                    }
                                } catch(e) {
                                    lastErrorMsg = "JSON Parse Error";
                                    errorLog(`[Server Update] Invalid JSON response from ${srv.name}`);
                                }
                            } else {
                                try {
                                    const errRes = JSON.parse(res.responseText);
                                    lastErrorMsg = errRes.message || `HTTP ${res.status}`;
                                } catch(e) {
                                    lastErrorMsg = `HTTP ${res.status}`;
                                }
                                errorLog(`[Server Update] Failed for ${srv.name}. ${lastErrorMsg}`);
                            }
                            resolve();
                        },
                        onerror: () => {
                            lastErrorMsg = "Network Error";
                            errorLog(`[Server Update] Network error for ${srv.name}.`);
                            resolve();
                        },
                        ontimeout: () => {
                            lastErrorMsg = "Timeout";
                            errorLog(`[Server Update] Timeout for ${srv.name}.`);
                            resolve();
                        }
                    });
                });
            } catch(e) {}
        }

        if (successCount === 0) {
            showStatusMsg(`서버 오류: ${lastErrorMsg.substring(0,15)}`, '#bd362f', 4000);
            return false;
        }

        if (successCount < targetServers.length) {
            infoLog(`[Server Update] Partial success. ${successCount}/${targetServers.length} updated.`);
            GM_setValue('pmh_last_update_check', 0);
            showStatusMsg(`일부 서버 업데이트 실패`, '#f89406', 4000);
            return false;
        }

        infoLog(`[Server Update] In-memory update completed for all ${successCount} server(s)!`);
        GM_setValue('pmh_last_update_check', 0);
        showStatusMsg('서버 업데이트 완료!', '#51a351', 3000);
        return true;
    }

    function getSettings() {
        const defaultSettings = {
            "INFO": "아래 설정을 JSON 형식에 맞게 수정하세요.",
            "MAX_CACHE_SIZE": 5000,
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
        const d = new Date();
        const p = v => String(v).padStart(2, '0');
        const ms = String(d.getMilliseconds()).padStart(3, '0');
        return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${ms}`;
    }

    function log(...args) { if (AppSettings.LOG_LEVEL?.toUpperCase() === "DEBUG") console.log(`[PMH][${getLocalTime()}][DEBUG]`, ...args); }
    function infoLog(...args) { const lvl = AppSettings.LOG_LEVEL?.toUpperCase(); if (lvl === "DEBUG" || lvl === "INFO") console.info(`[PMH][${getLocalTime()}][INFO]`, ...args); }
    function warnLog(...args) { console.warn(`[PMH][${getLocalTime()}][WARN]`, ...args); }
    function errorLog(...args) { console.error(`[PMH][${getLocalTime()}][ERROR]`, ...args); }

    infoLog(`Script initialized. (v${CURRENT_VERSION}) Local In-Memory Cache mode.`);

    if (typeof toastr !== 'undefined') {
        toastr.options = { "closeButton": true, "progressBar": true, "positionClass": "toast-bottom-right", "timeOut": 5000, "extendedTimeOut": 1500, "showDuration": 300, "hideDuration": 500 };
    }

    // ==========================================
    // 2. 인메모리(In-Memory) LRU 캐시
    // ==========================================
    const MAX_CACHE_SIZE = AppSettings.MAX_CACHE_SIZE || 5000;
    const memoryCache = new Map();

    function setMemoryCache(key, data) {
        if (memoryCache.has(key)) memoryCache.delete(key);
        memoryCache.set(key, data);
        if (memoryCache.size > MAX_CACHE_SIZE) {
            const oldestKey = memoryCache.keys().next().value;
            memoryCache.delete(oldestKey);
            log(`[MemCache] GC Evicted: ${oldestKey}`);
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
        infoLog("[MemCache] All cache cleared by user.");
    }

    // ==========================================
    // 3. 상태 변수 및 글로벌 큐 (Nuke & Rebuild)
    // ==========================================
    const STATE_KEYS = {
        GUID: 'pmh_s_guid',
        TAG: 'pmh_s_tag',
        PLAY: 'pmh_s_play',
        MULTIPATH: 'pmh_s_multipath',
        LEN: 'pmh_s_len',
        DETAIL: 'pmh_s_detail'
    };

    let state = {
        listGuid: GM_getValue(STATE_KEYS.GUID, false),
        listTag: GM_getValue(STATE_KEYS.TAG, true),
        listPlay: GM_getValue(STATE_KEYS.PLAY, false),
        listMultiPath: GM_getValue(STATE_KEYS.MULTIPATH, false),
        guidLen: GM_getValue(STATE_KEYS.LEN, 20),
        detailInfo: GM_getValue(STATE_KEYS.DETAIL, true)
    };

    let isFetchingDetail = false;
    let currentUrl = '';
    let currentDisplayedItemId = null;
    let currentDetailStateHash = '';
    let currentRenderSession = 0;
    const sessionRevalidated = new Set();
    const activeRequests = new Set();
    let swrDebounceTimer = null;
    const observerLogCooldown = {};

    const globalFallbackQueue = [];
    let isFallbackWorkerRunning = false;

    let isObserverLocked = false;

    function getDetailStateHash() {
        let parts = [];
        
        const titleNode = document.querySelector('[data-testid="metadata-title"], h1[class*="Title"]');
        
        if (!titleNode || !titleNode.textContent.trim()) return null;
        
        parts.push(titleNode.textContent.trim());

        const line1 = document.querySelector('[data-testid="metadata-line1"]');
        if (line1) parts.push(line1.textContent.trim());

        const images = document.querySelectorAll('img[src*="/thumb/"], img[src*="/art/"]');
        images.forEach(img => {
            const match = img.src.match(/\/(?:thumb|art)\/(\d+)/);
            if (match && !parts.includes(match[1])) parts.push(match[1]);
        });

        const bgArt = document.querySelector('[class*="PrePlayArtwork-image"], [class*="Background-"]');
        if (bgArt) {
            const style = window.getComputedStyle(bgArt);
            if (style.backgroundImage && style.backgroundImage !== 'none') {
                const match = style.backgroundImage.match(/\/(?:thumb|art)\/(\d+)/);
                if (match && !parts.includes(match[1])) parts.push(match[1]);
            }
        }

        return parts.join('|');
    }

    async function processGlobalFallbackQueue() {
        if (isFallbackWorkerRunning) return;
        isFallbackWorkerRunning = true;
        log("[Global Worker] Started processing tasks.");

        while (globalFallbackQueue.length > 0) {
            if (globalFallbackQueue[0].session !== currentRenderSession) {
                log(`[Global Worker] Session changed! Aborting ${globalFallbackQueue.length} remaining tasks.`);
                globalFallbackQueue.length = 0;
                break;
            }

            const queueItem = globalFallbackQueue.shift();
            try { await queueItem.task(); } catch(e) { errorLog("[Global Worker] Error", e); }

            await new Promise(r => setTimeout(r, 150));
        }

        isFallbackWorkerRunning = false;
        log("[Global Worker] Resting. Queue empty or aborted.");
    }

    // ==========================================
    // 4. 네트워크 및 유틸리티 함수
    // ==========================================
    function abortAllRequests() {
        if (activeRequests.size > 0) {
            log(`[Network] Aborting ${activeRequests.size} requests.`);
            for (const req of activeRequests) { try { req.abort(); } catch(e) {} }
            activeRequests.clear();
        }
    }

    function getServerConfig(machineIdentifier) {
        if (!machineIdentifier || !AppSettings.SERVERS) return null;
        return AppSettings.SERVERS.find(s => s.machineIdentifier === machineIdentifier) || null;
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
                    if (r.status === 401) return reject(`Unauthorized`);
                    if (r.status >= 200 && r.status < 300) {
                        try { resolve(JSON.parse(r.responseText)); } catch(e) { reject(`Parse Error`); }
                    } else { reject(`HTTP ${r.status}`); }
                },
                onerror: () => { activeRequests.delete(req); reject("Network Error"); },
                ontimeout: () => { activeRequests.delete(req); reject("Timeout"); },
                onabort: () => { activeRequests.delete(req); reject("Aborted"); }
            });
            activeRequests.add(req);
        });
    }

    function fetchPlexMetaFallback(itemId, plexSrv) {
        return new Promise((resolve) => {
            if (!plexSrv) return resolve(null);
            const req = GM_xmlhttpRequest({
                method: 'GET',
                url: `${plexSrv.url}/library/metadata/${itemId}?includeMarkers=1&X-Plex-Token=${plexSrv.token}`,
                headers: { 'Accept': 'application/json' },
                onload: r => {
                    activeRequests.delete(req);
                    try { resolve(JSON.parse(r.responseText).MediaContainer.Metadata[0]); } catch(e) { resolve(null); }
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
            
            const req = GM_xmlhttpRequest({
                method: 'PUT',
                url: `${plexSrv.url}/library/metadata/${itemId}/analyze?X-Plex-Token=${plexSrv.token}`,
                timeout: 60000,
                onload: (res) => {
                    activeRequests.delete(req);
                    if (res.status >= 200 && res.status < 300) {
                        infoLog(`[API] ✅ Analyze Request Accepted by Plex (ID: ${itemId}, HTTP ${res.status})`);
                    } else {
                        errorLog(`[API] ❌ Analyze Request REJECTED by Plex (ID: ${itemId}, HTTP ${res.status})`);
                    }

                    setTimeout(async () => {
                        if (sessionAtStart !== currentRenderSession) return resolve(null);
                        const newMeta = await fetchPlexMetaFallback(itemId, plexSrv);
                        resolve(newMeta);
                    }, 1500);
                },
                onerror: () => { 
                    errorLog(`[API] ❌ Network Error during Analyze. (ID: ${itemId})`);
                    activeRequests.delete(req); resolve(null); 
                },
                ontimeout: () => { 
                    errorLog(`[API] ⚠️ Timeout during Analyze. (ID: ${itemId})`);
                    activeRequests.delete(req); resolve(null); 
                },
                onabort: () => { activeRequests.delete(req); resolve(null); }
            });
            activeRequests.add(req);
        });
    }

    function triggerPlexMetadataRefresh(itemId, plexSrv) {
        if (!plexSrv) return Promise.resolve(false);
        return new Promise((resolve) => {
            const req = GM_xmlhttpRequest({
                method: 'PUT',
                url: `${plexSrv.url}/library/metadata/${itemId}/refresh?force=1&X-Plex-Token=${plexSrv.token}`,
                timeout: 5000,
                onload: (res) => {
                    activeRequests.delete(req);
                    if (res.status >= 200 && res.status < 300) {
                        infoLog(`[API] ⚡ Plex Metadata Refresh Triggered. (Item: ${itemId}, HTTP ${res.status})`);
                        resolve(true);
                    } else {
                        errorLog(`[API] ❌ Plex Refresh Rejected. (Item: ${itemId}, HTTP ${res.status})`);
                        resolve(false);
                    }
                },
                onerror: () => { activeRequests.delete(req); resolve(false); },
                ontimeout: () => { activeRequests.delete(req); resolve(false); },
                onabort: () => { activeRequests.delete(req); resolve(false); }
            });
            activeRequests.add(req);
        });
    }

    function triggerPlexUnmatch(itemId, plexSrv) {
        if (!plexSrv) return Promise.resolve(false);
        return new Promise((resolve) => {
            const req = GM_xmlhttpRequest({
                method: 'PUT',
                url: `${plexSrv.url}/library/metadata/${itemId}/unmatch?X-Plex-Token=${plexSrv.token}`,
                timeout: 5000,
                onload: (res) => {
                    activeRequests.delete(req);
                    if (res.status >= 200 && res.status < 300) {
                        infoLog(`[API] ⚡ Plex Unmatch Triggered. (Item: ${itemId}, HTTP ${res.status})`);
                        resolve(true);
                    } else {
                        errorLog(`[API] ❌ Plex Unmatch Rejected. (Item: ${itemId}, HTTP ${res.status})`);
                        resolve(false);
                    }
                },
                onerror: () => { activeRequests.delete(req); resolve(false); },
                ontimeout: () => { activeRequests.delete(req); resolve(false); },
                onabort: () => { activeRequests.delete(req); resolve(false); }
            });
            activeRequests.add(req);
        });
    }

    async function triggerPlexAutoMatch(itemId, plexSrv) {
        if (!plexSrv) return false;
        try {
            infoLog(`[API] 🔍 Searching match candidates for Item: ${itemId}`);
            const searchReq = await new Promise((resolve, reject) => {
                const req = GM_xmlhttpRequest({
                    method: 'GET',
                    url: `${plexSrv.url}/library/metadata/${itemId}/matches?manual=1&X-Plex-Token=${plexSrv.token}`,
                    headers: { 'Accept': 'application/json' },
                    timeout: 10000,
                    onload: (res) => {
                        activeRequests.delete(req);
                        if (res.status >= 200 && res.status < 300) {
                            try { resolve(JSON.parse(res.responseText)); } catch(e) { reject("Parse Error"); }
                        } else { reject(`HTTP ${res.status}`); }
                    },
                    onerror: () => { activeRequests.delete(req); reject("Network Error"); },
                    ontimeout: () => { activeRequests.delete(req); reject("Timeout"); }
                });
                activeRequests.add(req);
            });

            const results = searchReq?.MediaContainer?.SearchResult;
            if (!results || results.length === 0) {
                errorLog(`[API] ❌ No match candidates found for Item: ${itemId}`);
                return false;
            }

            const bestMatch = results[0];
            const targetGuid = bestMatch.guid;
            const targetName = bestMatch.name || "";
            infoLog(`[API] 🎯 Best match found: ${targetName} (${targetGuid}, Score: ${bestMatch.score})`);

            const matchReq = await new Promise((resolve) => {
                const req = GM_xmlhttpRequest({
                    method: 'PUT',
                    url: `${plexSrv.url}/library/metadata/${itemId}/match?guid=${encodeURIComponent(targetGuid)}&name=${encodeURIComponent(targetName)}&X-Plex-Token=${plexSrv.token}`,
                    timeout: 10000,
                    onload: (res) => {
                        activeRequests.delete(req);
                        if (res.status >= 200 && res.status < 300) {
                            infoLog(`[API] ✅ Plex Match Applied successfully. (Item: ${itemId})`);
                            resolve(true);
                        } else {
                            errorLog(`[API] ❌ Plex Match Rejected. (HTTP ${res.status})`);
                            resolve(false);
                        }
                    },
                    onerror: () => { activeRequests.delete(req); resolve(false); },
                    ontimeout: () => { activeRequests.delete(req); resolve(false); }
                });
                activeRequests.add(req);
            });

            return matchReq;
        } catch (e) {
            errorLog(`[API] ❌ Error during Auto Match for Item: ${itemId}`, e);
            return false;
        }
    }

    function triggerPlexAnalyze(itemId, plexSrv) {
        if (!plexSrv) return Promise.resolve(false);
        return new Promise((resolve) => {
            infoLog(`[Analyze] 📡 Sending Media Analysis request to Plex for Item ID: ${itemId}...`);
            
            const req = GM_xmlhttpRequest({
                method: 'PUT',
                url: `${plexSrv.url}/library/metadata/${itemId}/analyze?X-Plex-Token=${plexSrv.token}`,
                headers: { 'Accept': 'application/json' },
                timeout: 5000,
                onload: (res) => {
                    activeRequests.delete(req);
                    if (res.status >= 200 && res.status < 300) {
                        infoLog(`[Analyze] ✅ Success! Plex server accepted analyze request. (HTTP ${res.status})`);
                        resolve(true);
                    } else {
                        errorLog(`[Analyze] ❌ Failed. Plex server rejected request. (HTTP ${res.status})`);
                        resolve(false);
                    }
                },
                onerror: () => {
                    errorLog(`[Analyze] ❌ Network Error. Could not connect to Plex server.`);
                    activeRequests.delete(req); resolve(false);
                },
                ontimeout: () => {
                    errorLog(`[Analyze] ⚠️ Request Timeout. No response from Plex server.`);
                    activeRequests.delete(req); resolve(false);
                }
            });
            activeRequests.add(req);
        });
    }

    function parsePlexFallbackTags(meta) {
        let tags = [];
        if (!meta || !meta.Media || meta.Media.length === 0) return tags;
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
        else if ((w > 0 && w < 1200) || vRes === 'sd' || vRes === '480' || vRes === '576') res = "SD";

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

        return tags;
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
            } catch (e) { return false; }
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

    function convertPlexMetaToLocalData(meta, itemId) {
        if (!meta) return null;
        if (meta.Media && meta.Media.length > 0) {
            meta.Media.sort((a, b) => (b.width || 0) - (a.width || 0) || (b.bitrate || 0) - (a.bitrate || 0));
        }

        const tags = parsePlexFallbackTags(meta);
        let p = "";
        if (meta.Media && meta.Media[0] && meta.Media[0].Part && meta.Media[0].Part[0]) p = meta.Media[0].Part[0].file || "Unknown Path";

        let versions = [];
        if (meta.Media) {
            meta.Media.forEach(m => {
                let v = {
                    width: m.width || 0, v_codec: m.videoCodec || "", a_codec: m.audioCodec || "",
                    a_ch: m.audioChannels || "", v_bitrate: m.bitrate ? m.bitrate * 1000 : 0,
                    file: (m.Part && m.Part[0]) ? m.Part[0].file : "Unknown Path",
                    part_id: (m.Part && m.Part[0]) ? m.Part[0].id : "", video_extra: "", subs: []
                };
                const fTags = parsePlexFallbackTags({ Media: [m] });
                if (fTags.length > 0) {
                    const vTag = fTags[0];
                    if (vTag.includes('DV') || vTag.includes('HDR')) v.video_extra = " " + vTag.replace(/8K|6K|4K|FHD|HD|SD/g, '').trim();
                }
                if (m.Part && m.Part[0] && m.Part[0].Stream) {
                    v.subs = m.Part[0].Stream.filter(s => s.streamType === 3).map(s => ({
                        id: s.id, languageCode: (s.languageCode || s.language || "und").toLowerCase().substring(0,3),
                        codec: s.codec || "unknown", key: s.key || "", format: s.codec || "unknown"
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

        let best_sub_id = "";
        let best_sub_url = "";
        if (versions.length > 0 && versions[0].subs) {
            const korSubs = versions[0].subs.filter(s => s.languageCode === 'kor' || s.languageCode === 'ko');
            if (korSubs.length > 0) {
                korSubs.sort((a, b) => {
                    let sA = 0, sB = 0;
                    if(a.key && a.key.trim() !== '') sA+=100; if(['srt','ass','smi','vtt','ssa','sub','sup'].includes(a.codec)) sA+=50;
                    if(b.key && b.key.trim() !== '') sB+=100; if(['srt','ass','smi','vtt','ssa','sub','sup'].includes(b.codec)) sB+=50;
                    return sB - sA;
                });
                best_sub_id = korSubs[0].id;
                best_sub_url = korSubs[0].key || "";
            }
        }

        const guid = meta.guid || "";
        return {
            type: (meta.type === 'movie' || meta.type === 'episode') ? 'video' : 'directory',
            itemId: itemId, guid: guid, duration: meta.duration || 0,
            versions: versions, markers: markers,
            g: guid.split('://')[1]?.split('?')[0] || guid, raw_g: guid, p: p, tags: tags,
            part_id: versions.length > 0 ? versions[0].part_id : null,
            sub_id: best_sub_id, sub_url: best_sub_url
        };
    }

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

    function formatDuration(ms) {
        if (!ms || isNaN(Number(ms)) || Number(ms) <= 0) return '-';
        const t = Math.floor(Number(ms) / 1000);
        const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
        return h > 0 ? `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}` : `${m}:${s.toString().padStart(2, '0')}`;
    }

    // ==========================================
    // 5-1. Tool UI 렌더링 및 모니터링
    // ==========================================
    function openPmhToolUI(toolId, forceSrvIdx = null) {
        const globalCache = JSON.parse(GM_getValue(`pmh_tool_cache_global_${toolId}`, "{}"));
        const currentSrvId = window.location.hash.match(/\/server\/([a-f0-9]+)\//)?.[1];
        
        let srvIdx = 0;
        if (forceSrvIdx !== null) srvIdx = forceSrvIdx;
        else if (globalCache['target_server_idx'] !== undefined) srvIdx = parseInt(globalCache['target_server_idx']);
        else if (currentSrvId) {
            const matchIdx = AppSettings.SERVERS.findIndex(s => s.machineIdentifier === currentSrvId);
            if (matchIdx !== -1) srvIdx = matchIdx;
        }
        
        const targetSrv = AppSettings.SERVERS[srvIdx];
        if (!targetSrv) return toastr.error("서버 설정이 유효하지 않습니다.");
        
        const serverId = targetSrv.machineIdentifier;

        window.showPmhToolPanel(toolId, "로딩 중...", `<div style="text-align:center; padding:30px;"><i class="fas fa-spinner fa-spin" style="font-size:30px; color:#e5a00d; margin-bottom:15px;"></i><br>[${targetSrv.name}] 서버 정보를 불러오는 중...</div>`);
        
        GM_xmlhttpRequest({
            method: "GET", url: `${targetSrv.pmhServerUrl}/api/tool/${toolId}/ui?server_id=${serverId}`,
            headers: { "X-API-Key": targetSrv.plexMateApiKey },
            onload: (res) => {
                if(res.status !== 200) return window.showPmhToolPanel(toolId, "오류 발생", `<p style="color:#bd362f;">UI 스키마 로드 실패 (HTTP ${res.status})</p>`);
                
                const ui = JSON.parse(res.responseText);
                const savedOptions = ui.saved_options || {};
                const isFormCollapsed = savedOptions._form_collapsed === true;
                const collapseIcon = isFormCollapsed ? 'fa-chevron-down' : 'fa-chevron-up';
                const formDisplay = isFormCollapsed ? 'none' : 'block';

                let formHtml = `
                    <div style="display:flex; flex-direction:column; height:100%;">
                        <div style="display:flex; border-bottom:1px solid #444; margin-bottom:15px; flex-shrink:0; justify-content:space-between; align-items:flex-end;">
                            <div style="display:flex;">
                                <div class="pmh-tab-btn active" data-tab="tab_form" style="padding:10px 15px; cursor:pointer; color:#e5a00d; font-weight:bold; border-bottom:2px solid #e5a00d;"><i class="fas fa-search"></i> 조회 및 설정</div>
                                <div class="pmh-tab-btn" data-tab="tab_monitor" style="padding:10px 15px; cursor:pointer; color:#777; border-bottom:2px solid transparent; transition:0.2s;"><i class="fas fa-desktop"></i> 실행 모니터링</div>
                            </div>
                            <div style="padding-bottom:10px; padding-right:5px;">
                                <i class="fas fa-eraser" id="pmh_tool_reset_cache" title="옵션 및 캐시 초기화" style="color:#777; cursor:pointer; font-size:14px; transition:0.2s;" onmouseover="this.style.color='#bd362f'" onmouseout="this.style.color='#777'"></i>
                            </div>
                        </div>
                        <div id="pmh_tab_form" style="display:flex; flex-direction:column; flex-grow:1; overflow-y:auto; overflow-x:hidden; min-height:0; padding-right:5px;">
                            <div style="color:#aaa; font-size:13px; line-height:1.4; flex-shrink:0; margin-bottom:10px;">${ui.description || ''}</div>
                            <div style="border-bottom:1px solid #333; padding-bottom:10px; margin-bottom:10px; position:relative; flex-shrink:0;">
                                <div id="pmh_tool_form_container" style="display:${formDisplay};">
                `;

                if (AppSettings.SERVERS.length > 1) {
                    formHtml += `<div style="margin-bottom: 15px; padding-bottom: 10px; border-bottom: 1px dashed #444;">
                                    <label style="display:block; color:#2f96b4; font-size:12px; margin-bottom:6px; font-weight:bold;"><i class="fas fa-server"></i> 대상 서버 선택</label>
                                    <select id="pmh_target_server_idx" style="width:100%; padding:8px; background:#1a2327; border:1px solid #2f96b4; color:#fff; border-radius:4px; font-size:13px; font-weight:bold; cursor:pointer;">`;
                    AppSettings.SERVERS.forEach((srv, idx) => {
                        formHtml += `<option value="${idx}" ${idx === srvIdx ? "selected" : ""}>${srv.name} (${srv.machineIdentifier.substring(0,8)}...)</option>`;
                    });
                    formHtml += `</select></div>`;
                }

                const currentSecId = window.location.hash.match(/source=%2Flibrary%2Fsections%2F(\d+)/)?.[1] || "all";

                const renderInput = (input) => {
                    if (input.type === 'header') return `<div style="margin-top:20px; margin-bottom:12px; font-size:14px; font-weight:bold; color:#2f96b4; border-bottom:1px solid #333; padding-bottom:6px;">${input.label}</div>`;
                    if (input.type === 'checkbox_group') {
                        let html = `<div style="margin-bottom:15px;"><div style="color:#e5a00d; font-size:13px; font-weight:bold; margin-bottom:6px;">${input.label}</div><div style="display:flex; flex-direction:column; gap:8px; background:rgba(0,0,0,0.2); padding:12px; border-radius:4px; border:1px solid #333;">`;
                        input.options.forEach(opt => {
                            let isChecked = savedOptions[opt.id] !== undefined ? savedOptions[opt.id] : (opt.default || false);
                            html += `<label style="color:#fff; font-size:13px; cursor:pointer; display:flex; align-items:center;"><input type="checkbox" id="pmh_inp_${opt.id}" style="margin-right:8px; width:16px; height:16px; cursor:pointer; accent-color:#e5a00d;" ${isChecked ? "checked" : ""}>${opt.label}</label>`;
                        });
                        return html + `</div></div>`;
                    }
                    let html = `<div style="margin-bottom: 12px;"><label style="display:block; color:#e5a00d; font-size:12px; margin-bottom:6px; font-weight:bold;">${input.label}</label>`;
                    let cachedVal = savedOptions[input.id];
                    if (input.type === 'text') {
                        html += `<input type="text" id="pmh_inp_${input.id}" value="${cachedVal !== undefined ? cachedVal : ""}" placeholder="${input.placeholder||''}" style="width:100%; padding:8px; background:#111; border:1px solid #444; color:#fff; border-radius:4px; font-size:13px;">`;
                    } else if (input.type === 'select') {
                        const validOptions = input.options.map(o => String(o.value));
                        if (cachedVal !== undefined && !validOptions.includes(String(cachedVal))) cachedVal = undefined;
                        html += `<select id="pmh_inp_${input.id}" style="width:100%; padding:8px; background:#111; border:1px solid #444; color:#fff; border-radius:4px; font-size:13px;">`;
                        input.options.forEach(o => {
                            const isSelected = (cachedVal !== undefined) ? (String(o.value) === String(cachedVal) ? "selected" : "") : ((input.id === 'target_section' && String(o.value) === currentSecId) ? "selected" : "");
                            html += `<option value="${o.value}" ${isSelected}>${o.text}</option>`;
                        });
                        html += `</select>`;
                    } else if (input.type === 'checkbox') {
                        html += `<label style="color:#ddd; font-size:13px; cursor:pointer;"><input type="checkbox" id="pmh_inp_${input.id}" style="margin-right:6px;" ${cachedVal ? "checked" : ""}> 활성화</label>`;
                    }
                    return html + `</div>`;
                };

                if (ui.inputs && ui.inputs.length > 0) {
                    formHtml += `<div style="margin-bottom:15px; padding:12px; background:rgba(0,0,0,0.2); border:1px solid #333; border-radius:4px;">
                                    <div style="color:#51a351; font-weight:bold; margin-bottom:12px; font-size:12px; border-bottom:1px dashed #444; padding-bottom:6px;"><i class="fas fa-search"></i> 조회 조건 설정</div>`;
                    ui.inputs.forEach(input => { formHtml += renderInput(input); });
                    formHtml += `</div>`;
                }

                formHtml += `<div style="text-align:center; margin-top:15px; margin-bottom:10px; flex-shrink:0;">
                                <button id="pmh_run_btn" style="padding:12px 30px; background:#e5a00d; color:#1f1f1f; border:none; font-weight:bold; cursor:pointer; border-radius:4px; font-size:14px; transition:0.2s;"><i class="fas fa-search"></i> ${ui.button_text || '조회'}</button>
                             </div>`;
                formHtml += `</div>`;
                formHtml += `</div>`;
                formHtml += `
                    <div style="text-align:center; margin-top:-20px; margin-bottom:15px; position:relative; z-index:2; height:15px;">
                        <i class="fas ${collapseIcon}" id="pmh_tool_toggle_form" title="옵션 접기/펼치기" style="color:#2f96b4; cursor:pointer; font-size:16px; background:#1a1d21; padding:0 12px; border-radius:10px; border:1px solid #333; transition:0.2s;"></i>
                    </div>
                `;

                formHtml += `<div id="pmh_run_res_form" style="font-size:13px; display:none; margin-top:5px; flex-grow:1; min-height:0;"></div></div>`;
                formHtml += `<div id="pmh_tab_monitor" style="display:none; flex-direction:column; flex-grow:1; min-height:0; padding-right:5px;">`;
                formHtml += `<div id="pmh_run_res_monitor" style="display:flex; flex-direction:column; flex-grow:1; min-height:0; font-size:13px; color:#aaa; text-align:center; padding:30px 0;"><i class="fas fa-info-circle"></i> 진행 중이거나 완료된 작업이 없습니다.</div>`;
                formHtml += `</div></div>`;

                window.showPmhToolPanel(toolId, ui.title, formHtml);

                setTimeout(() => {
                    let isTaskRunning = false;
                    let isCancelling = false;
                    let pollTimer = null;
                    let currentTaskStatus = ui.active_task || {};

                    const updateFormTabButtons = (isRunning) => {
                        isTaskRunning = isRunning;
                        const mainRunBtn = document.getElementById('pmh_run_btn');
                        const actionBtn = document.getElementById('pmh_dt_action_btn');
                        const resumeBtn = document.getElementById('pmh_resume_btn');
                        const cancelBtns = document.querySelectorAll('.pmh_global_cancel_btn');

                        const canResume = (currentTaskStatus.state === 'cancelled' || currentTaskStatus.state === 'error') 
                                          && currentTaskStatus.progress > 0 && currentTaskStatus.total > 0;

                        if (isRunning) {
                            if (mainRunBtn) {
                                if (!mainRunBtn.dataset.originalHtml) mainRunBtn.dataset.originalHtml = mainRunBtn.innerHTML;
                                mainRunBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 작업 진행 중...';
                                mainRunBtn.style.backgroundColor = '#555';
                                mainRunBtn.style.color = '#aaa';
                                mainRunBtn.style.cursor = 'not-allowed';
                                mainRunBtn.disabled = true;
                            }
                            if (actionBtn) actionBtn.style.display = 'none';
                            if (resumeBtn) resumeBtn.style.display = 'none';
                            cancelBtns.forEach(btn => btn.style.display = 'inline-block');
                        } else {
                            if (mainRunBtn && mainRunBtn.dataset.originalHtml) {
                                mainRunBtn.innerHTML = mainRunBtn.dataset.originalHtml;
                                mainRunBtn.style.backgroundColor = '#e5a00d';
                                mainRunBtn.style.color = '#1f1f1f';
                                mainRunBtn.style.cursor = 'pointer';
                                mainRunBtn.disabled = false;
                            }
                            
                            if (canResume) {
                                if (resumeBtn) {
                                    resumeBtn.style.display = 'inline-block';
                                    resumeBtn.innerHTML = `<i class="fas fa-step-forward"></i> 이어서 계속하기 (${currentTaskStatus.progress} / ${currentTaskStatus.total})`;
                                }
                                if (actionBtn) actionBtn.style.display = 'none';
                            } else {
                                if (resumeBtn) resumeBtn.style.display = 'none';
                                if (actionBtn) actionBtn.style.display = 'inline-block';
                            }
                            
                            cancelBtns.forEach(btn => {
                                btn.style.display = 'none';
                                btn.innerHTML = '<i class="fas fa-stop"></i> 작업 중단';
                            });
                        }
                    };

                    if (currentTaskStatus && currentTaskStatus.state === 'running') {
                        updateFormTabButtons(true);
                        setTimeout(() => {
                            processAndRenderResult({ type: 'async_task', task_id: toolId, is_preview: false }, savedOptions.items_per_page || 10, targetSrv, true);
                        }, 50);
                    } else {
                        updateFormTabButtons(false);
                    }

                    GM_xmlhttpRequest({
                        method: "POST", url: `${targetSrv.pmhServerUrl}/api/tool/${toolId}/run`,
                        headers: { "Content-Type": "application/json", "X-API-Key": targetSrv.plexMateApiKey },
                        data: JSON.stringify({ action_type: 'page', page: 1, limit: savedOptions.items_per_page || 10, sort_key: savedOptions._sort_key, sort_dir: savedOptions._sort_dir || 'asc', _server_id: serverId }),
                        onload: (r) => { 
                            if (r.status === 200) {
                                try {
                                    const preventSwitch = (currentTaskStatus && currentTaskStatus.state === 'running');
                                    processAndRenderResult(JSON.parse(r.responseText), parseInt(savedOptions.items_per_page || 10), targetSrv, preventSwitch);
                                } catch(e) {}
                            } 
                        }
                    });

                    const srvSelectEl = document.getElementById('pmh_target_server_idx');
                    if (srvSelectEl) {
                        srvSelectEl.addEventListener('change', (e) => {
                            if (isTaskRunning) {
                                e.preventDefault(); srvSelectEl.value = srvIdx; 
                                return alert("현재 서버에서 작업이 진행 중입니다. 작업을 멈춘 뒤 서버를 변경해주세요.");
                            }
                            const newIdx = parseInt(e.target.value);
                            globalCache['target_server_idx'] = newIdx;
                            GM_setValue(`pmh_tool_cache_global_${toolId}`, JSON.stringify(globalCache));
                            if (pollTimer) clearTimeout(pollTimer);
                            openPmhToolUI(toolId, newIdx); 
                        });
                    }

                    const getFormData = () => {
                        const reqData = { _server_id: serverId };
                        const allInputs = [ ...(ui.inputs || []), ...(ui.execute_inputs || []) ];
                        allInputs.forEach(i => {
                            if (i.type === 'checkbox_group') {
                                i.options.forEach(opt => {
                                    const el = document.getElementById(`pmh_inp_${opt.id}`);
                                    if (el) { reqData[opt.id] = el.checked; savedOptions[opt.id] = el.checked; }
                                });
                            } else {
                                const el = document.getElementById(`pmh_inp_${i.id}`);
                                if (el) {
                                    const val = (i.type === 'checkbox') ? el.checked : el.value;
                                    reqData[i.id] = val; savedOptions[i.id] = val; 
                                }
                            }
                        });
                        const plexInfo = extractPlexServerInfo(serverId);
                        if (plexInfo) { reqData['_plex_url'] = plexInfo.url; reqData['_plex_token'] = plexInfo.token; }
                        return { targetSrv, reqData };
                    };

                    const autoSaveInputs = [ ...(ui.inputs || []), ...(ui.execute_inputs || []) ];
                    autoSaveInputs.forEach(i => {
                        if (i.type === 'checkbox_group') {
                            i.options.forEach(opt => {
                                const el = document.getElementById(`pmh_inp_${opt.id}`);
                                if (el) el.addEventListener('change', () => { saveOptionsToServer(); });
                            });
                        } else {
                            const el = document.getElementById(`pmh_inp_${i.id}`);
                            if (el) el.addEventListener('change', () => { saveOptionsToServer(); });
                        }
                    });

                    const saveOptionsToServer = () => {
                        const { reqData } = getFormData();
                        reqData.action_type = 'save_options'; 
                        reqData._form_collapsed = savedOptions._form_collapsed;
                        reqData.items_per_page = savedOptions.items_per_page;
                        reqData._sort_key = savedOptions._sort_key;
                        reqData._sort_dir = savedOptions._sort_dir;

                        GM_xmlhttpRequest({
                            method: "POST", url: `${targetSrv.pmhServerUrl}/api/tool/${toolId}/run`,
                            headers: { "Content-Type": "application/json", "X-API-Key": targetSrv.plexMateApiKey },
                            data: JSON.stringify(reqData)
                        });
                    };

                    const switchTab = (targetId) => {
                        const panel = document.getElementById('pmh-tool-panel');
                        if (panel && panel.style.height === 'auto') panel.style.height = panel.offsetHeight + 'px'; 

                        document.querySelectorAll('.pmh-tab-btn').forEach(btn => {
                            if (btn.dataset.tab === targetId) {
                                btn.classList.add('active');
                                btn.style.color = '#e5a00d'; btn.style.fontWeight = 'bold'; btn.style.borderBottomColor = '#e5a00d';
                            } else {
                                btn.classList.remove('active');
                                btn.style.color = '#777'; btn.style.fontWeight = 'normal'; btn.style.borderBottomColor = 'transparent';
                            }
                        });
                        
                        document.getElementById('pmh_tab_form').style.display = targetId === 'tab_form' ? 'flex' : 'none';
                        document.getElementById('pmh_tab_monitor').style.display = targetId === 'tab_monitor' ? 'flex' : 'none';
                        
                        if (targetId === 'tab_form' && panel) {
                            const savedGeoStr = GM_getValue(`pmh_panel_geo_${toolId}`);
                            let isManuallyResized = false;
                            if (savedGeoStr) {
                                try { const geo = JSON.parse(savedGeoStr); if (geo.height && geo.height !== 'auto') isManuallyResized = true; } catch(e){}
                            }
                            if (!isManuallyResized) {
                                panel.style.height = 'auto';
                                setTimeout(() => {
                                    const content = document.getElementById('pmh_tab_form');
                                    if (content) { content.style.display = 'none'; content.offsetHeight; content.style.display = 'flex'; }
                                }, 10);
                            }
                        }
                        
                        if (targetId === 'tab_form') {
                            GM_xmlhttpRequest({
                                method: "POST", url: `${targetSrv.pmhServerUrl}/api/tool/${toolId}/run`,
                                headers: { "Content-Type": "application/json", "X-API-Key": targetSrv.plexMateApiKey },
                                data: JSON.stringify({ action_type: 'page', page: 1, limit: savedOptions.items_per_page || 10, sort_key: savedOptions._sort_key, sort_dir: savedOptions._sort_dir || 'asc', _server_id: serverId }),
                                onload: (r) => { if (r.status === 200) processAndRenderResult(JSON.parse(r.responseText), savedOptions.items_per_page || 10, targetSrv, true); }
                            });
                        }
                    };

                    document.querySelectorAll('.pmh-tab-btn').forEach(btn => {
                        btn.onmouseover = () => { if(!btn.classList.contains('active')) btn.style.color = '#fff'; };
                        btn.onmouseout = () => { if(!btn.classList.contains('active')) btn.style.color = '#777'; };
                        btn.onclick = () => switchTab(btn.dataset.tab);
                    });

                    const resetBtn = document.getElementById('pmh_tool_reset_cache');
                    if(resetBtn) {
                        resetBtn.onclick = () => {
                            if(isTaskRunning) return alert("진행 중인 작업을 먼저 중단해 주세요.");
                            if(confirm(`[${targetSrv.name}] 서버에 저장된 옵션과 결과, 작업 기록을 모두 초기화하시겠습니까?`)) {
                                GM_deleteValue(`pmh_panel_geo_${toolId}`);
                                GM_deleteValue(`pmh_tool_cache_${toolId}`);
                                GM_xmlhttpRequest({
                                    method: "POST", url: `${targetSrv.pmhServerUrl}/api/tool/${toolId}/run`,
                                    headers: { "Content-Type": "application/json", "X-API-Key": targetSrv.plexMateApiKey },
                                    data: JSON.stringify({ action_type: 'reset', _server_id: serverId }),
                                    onload: () => { 
                                        const resForm = document.getElementById('pmh_run_res_form');
                                        if (resForm) { resForm.style.display = 'none'; resForm.innerHTML = ''; }
                                        const resMonitor = document.getElementById('pmh_run_res_monitor');
                                        if (resMonitor) {
                                            resMonitor.innerHTML = `<i class="fas fa-info-circle"></i> 진행 중이거나 완료된 작업이 없습니다.`;
                                            resMonitor.style.display = 'flex'; resMonitor.style.justifyContent = 'center'; resMonitor.style.alignItems = 'center';
                                        }
                                        const panel = document.getElementById('pmh-tool-panel');
                                        if (panel) { panel.style.top = '80px'; panel.style.left = '60%'; panel.style.width = '450px'; panel.style.height = 'auto'; }
                                        currentTaskStatus = {};
                                        isCancelling = false;
                                        toastr.success("설정 및 데이터 캐시가 초기화되었습니다.");
                                        switchTab('tab_form'); 
                                        openPmhToolUI(toolId, srvIdx);
                                    }
                                });
                            }
                        };
                    }

                    const handleGlobalClick = (e) => {
                        const toggleBtn = e.target.closest('#pmh_tool_toggle_form');
                        if (toggleBtn && document.getElementById('pmh-tool-panel')?.contains(toggleBtn)) {
                            e.preventDefault(); e.stopPropagation();
                            const formContainer = document.getElementById('pmh_tool_form_container');
                            if (formContainer) {
                                const isCurrentlyCollapsed = formContainer.style.display === 'none';
                                if (isCurrentlyCollapsed) {
                                    formContainer.style.display = 'block';
                                    toggleBtn.classList.remove('fa-chevron-down');
                                    toggleBtn.classList.add('fa-chevron-up');
                                } else {
                                    formContainer.style.display = 'none';
                                    toggleBtn.classList.remove('fa-chevron-up');
                                    toggleBtn.classList.add('fa-chevron-down');
                                }
                                savedOptions._form_collapsed = !isCurrentlyCollapsed;
                                saveOptionsToServer();
                                
                                const tabForm = document.getElementById('pmh_tab_form');
                                const panel = document.getElementById('pmh-tool-panel');
                                if (tabForm && panel && panel.style.height === 'auto') {
                                    setTimeout(() => { tabForm.style.display = 'none'; tabForm.offsetHeight; tabForm.style.display = 'flex'; }, 10);
                                }
                            }
                            return;
                        }

                        const cancelBtn = e.target.closest('.pmh_global_cancel_btn');
                        if (cancelBtn && document.getElementById('pmh-tool-panel')?.contains(cancelBtn)) {
                            e.preventDefault(); e.stopPropagation();
                            if (isCancelling) return; 
                            isCancelling = true;
                            
                            const allCancelBtns = document.querySelectorAll('.pmh_global_cancel_btn');
                            allCancelBtns.forEach(b => {
                                b.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 취소 요청 중...';
                                b.style.opacity = '0.7';
                                b.style.cursor = 'not-allowed';
                            });
                            
                            GM_xmlhttpRequest({
                                method: "POST", url: `${targetSrv.pmhServerUrl}/api/tool/${toolId}/cancel`,
                                headers: { "Content-Type": "application/json", "X-API-Key": targetSrv.plexMateApiKey },
                                data: JSON.stringify({ task_id: toolId, _server_id: serverId })
                            });
                        }
                    };
                    
                    document.removeEventListener('click', window._pmhGlobalClickHandler);
                    window._pmhGlobalClickHandler = handleGlobalClick;
                    document.addEventListener('click', window._pmhGlobalClickHandler);

                    const processAndRenderResult = (resData, itemsPerPage, renderSrv, preventTabSwitch = false) => {
                        
                        if ((resData.type === 'datatable' || resData.type === 'dashboard') && resData.logs && resData.logs.length > 0) {
                            const resMonitor = document.getElementById('pmh_run_res_monitor');
                            if (resMonitor) {
                                resMonitor.style.display = 'flex'; resMonitor.style.flexDirection = 'column'; resMonitor.style.flexGrow = '1';
                                let logsHtml = resData.logs.map(l => `<div style="margin-bottom:2px;">${l}</div>`).join('');
                                resMonitor.innerHTML = `
                                    <div style="display:flex; flex-direction:column; background:#15181a; border:1px solid #333; border-radius:6px; padding:15px; text-align:left; flex-grow:1; min-height:0;">
                                        <div style="display:flex; justify-content:space-between; font-size:12px; color:#ccc; margin-bottom:15px; flex-shrink:0; border-bottom:1px dashed #333; padding-bottom:8px;">
                                            <span style="font-weight:bold; color:#51a351;"><i class="fas fa-check-circle"></i> 조회/분석 완료 (로그 참조)</span>
                                        </div>
                                        <div id="pmh_log_container_static" style="background:#0a0a0c; border:1px solid #222; border-radius:4px; padding:8px; flex-grow:1; overflow-y:auto; font-family:monospace; font-size:11px; color:#aaa; line-height:1.6; display:flex; flex-direction:column;">
                                            <div>${logsHtml}</div>
                                        </div>
                                    </div>
                                `;
                                const logBox = document.getElementById('pmh_log_container_static');
                                if (logBox) logBox.scrollTop = logBox.scrollHeight;
                            }
                        }

                        if (resData.type === 'datatable') {
                            if (!preventTabSwitch) switchTab('tab_form');
                            const resForm = document.getElementById('pmh_run_res_form');
                            resForm.style.display = 'block'; resForm.style.position = 'relative';

                            const { data: pageData, page, total_pages, total_items, columns, action_button, machine_id } = resData;
                            let currentSortCol = savedOptions._sort_key || null;
                            let currentSortDir = savedOptions._sort_dir || 'asc';

                            const showOverlayLoading = () => {
                                let overlay = document.getElementById('pmh-table-overlay');
                                if (!overlay) {
                                    overlay = document.createElement('div');
                                    overlay.id = 'pmh-table-overlay';
                                    overlay.style.cssText = 'position:absolute; top:0; left:0; width:100%; height:100%; background-color:rgba(0,0,0,0.6); z-index:100; display:flex; align-items:center; justify-content:center; border-radius:4px;';
                                    overlay.innerHTML = `<i class="fas fa-spinner fa-spin" style="font-size:30px; color:#e5a00d;"></i>`;
                                    resForm.appendChild(overlay);
                                }
                            };

                            const fetchPageFromServer = (p, sKey = currentSortCol, sDir = currentSortDir, currentLimit = itemsPerPage) => {
                                showOverlayLoading(); 
                                GM_xmlhttpRequest({
                                    method: "POST", url: `${renderSrv.pmhServerUrl}/api/tool/${toolId}/run`,
                                    headers: { "Content-Type": "application/json", "X-API-Key": renderSrv.plexMateApiKey },
                                    data: JSON.stringify({ action_type: 'page', page: p, limit: currentLimit, sort_key: sKey, sort_dir: sDir, _server_id: serverId }),
                                    onload: (r) => { if (r.status === 200) processAndRenderResult(JSON.parse(r.responseText), currentLimit, renderSrv, true); }
                                });
                            };

                            let finalHtml = ``;

                            if (resData.summary_cards || resData.bar_charts) {
                                finalHtml += `<div style="padding-bottom:15px; margin-bottom:15px; border-bottom:1px solid #333;">`;
                                if (resData.summary_cards && resData.summary_cards.length > 0) {
                                    finalHtml += `<div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(140px, 1fr)); gap:10px; margin-bottom:15px;">`;
                                    resData.summary_cards.forEach(card => {
                                        finalHtml += `<div style="background:#111; border:1px solid #333; border-radius:6px; padding:12px; display:flex; align-items:center; gap:12px;">
                                                        <div style="font-size:24px; color:${card.color||'#e5a00d'}; width:30px; text-align:center;"><i class="${card.icon||'fas fa-info-circle'}"></i></div>
                                                        <div style="flex-grow:1; min-width:0;">
                                                            <div style="font-size:11px; color:#aaa; margin-bottom:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${card.label}</div>
                                                            <div style="font-size:16px; color:#fff; font-weight:bold; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${card.value}</div>
                                                        </div>
                                                      </div>`;
                                    });
                                    finalHtml += `</div>`;
                                }
                                if (resData.bar_charts && resData.bar_charts.length > 0) {
                                    finalHtml += `<div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(300px, 1fr)); gap:15px;">`;
                                    resData.bar_charts.forEach(chart => {
                                        finalHtml += `<div style="background:#15181a; border:1px solid #222; border-radius:6px; padding:15px;">
                                                        <div style="font-size:13px; font-weight:bold; color:#2f96b4; margin-bottom:12px; border-bottom:1px dashed #333; padding-bottom:5px;">${chart.title}</div>`;
                                        chart.items.forEach(item => {
                                            finalHtml += `<div style="margin-bottom:8px;">
                                                            <div style="display:flex; justify-content:space-between; font-size:11px; color:#ccc; margin-bottom:3px;">
                                                                <span>${item.label}</span><span>${item.count} (${item.percent||0}%)</span>
                                                            </div>
                                                            <div style="width:100%; height:6px; background:#222; border-radius:3px; overflow:hidden;">
                                                                <div style="width:${item.percent||0}%; height:100%; background:${chart.color||'#e5a00d'}; border-radius:3px;"></div>
                                                            </div>
                                                          </div>`;
                                        });
                                        finalHtml += `</div>`;
                                    });
                                    finalHtml += `</div>`;
                                }
                                finalHtml += `</div>`;
                            }

                            if (total_items > 0 && ui.execute_inputs && ui.execute_inputs.length > 0) {
                                finalHtml += `<div style="margin-bottom:15px; padding:15px; background:rgba(60,20,20,0.1); border:1px solid #4a2121; border-radius:4px;">
                                                <div style="color:#e06c6c; font-weight:bold; margin-bottom:12px; font-size:12px; border-bottom:1px dashed #5c2020; padding-bottom:6px;">
                                                    <i class="fas fa-cogs"></i> 작업 실행 옵션 설정
                                                </div>`;
                                ui.execute_inputs.forEach(input => { finalHtml += renderInput(input); });
                                finalHtml += `</div>`;
                            }

                            const createPagingHtml = (p, tPages) => {
                                let html = `<div style="display:flex; justify-content:center; align-items:center; gap:5px; font-size:12px;">`;
                                const btnStyle = `min-width:26px; height:26px; padding:0 6px; display:flex; justify-content:center; align-items:center; border-radius:4px; font-family:monospace; font-size:13px; background:#222; color:#ccc; border:1px solid #444; cursor:pointer;`;
                                const actStyle = `min-width:26px; height:26px; padding:0 6px; display:flex; justify-content:center; align-items:center; border-radius:4px; font-family:monospace; font-size:13px; background:#e5a00d; color:#1f1f1f; border:1px solid #e5a00d; font-weight:bold; cursor:default;`;
                                const disStyle = `min-width:26px; height:26px; padding:0 6px; display:flex; justify-content:center; align-items:center; border-radius:4px; font-family:monospace; font-size:13px; background:#111; color:#555; border:1px solid #222; cursor:not-allowed;`;

                                html += `<button class="pmh-page-btn" data-p="1" style="${p > 1 ? btnStyle : disStyle}" ${p > 1 ? '' : 'disabled'}><i class="fas fa-angle-double-left"></i></button>`;
                                html += `<button class="pmh-page-btn" data-p="${p-1}" style="${p > 1 ? btnStyle : disStyle}" ${p > 1 ? '' : 'disabled'}><i class="fas fa-angle-left"></i></button>`;
                                let startP = Math.max(1, p - 2); let endP = Math.min(tPages, p + 2);
                                for (let i = startP; i <= endP; i++) {
                                    html += (i === p) ? `<button style="${actStyle}">${i}</button>` : `<button class="pmh-page-btn" data-p="${i}" style="${btnStyle}">${i}</button>`;
                                }
                                html += `<button class="pmh-page-btn" data-p="${Math.min(tPages, p+1)}" style="${p < tPages ? btnStyle : disStyle}" ${p < tPages ? '' : 'disabled'}><i class="fas fa-angle-right"></i></button>`;
                                html += `<button class="pmh-page-btn" data-p="${tPages}" style="${p < tPages ? btnStyle : disStyle}" ${p < tPages ? '' : 'disabled'}><i class="fas fa-angle-double-right"></i></button></div>`;
                                return html;
                            };

                            let pagingHtml = '';
                            if (total_pages > 1) pagingHtml = createPagingHtml(page, total_pages);

                            finalHtml += `
                                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
                                    <div style="display:flex; align-items:center; gap:12px;">
                                        <div style="color:#51a351; font-weight:bold; font-size:13px;">
                                            <i class="fas fa-list"></i> 남은 항목: ${total_items}건
                                        </div>
                                        <a href="#" id="pmh_dt_refresh_btn" style="color:#2f96b4; font-size:12px; text-decoration:none; display:flex; align-items:center; gap:4px; padding:2px 6px; background:rgba(47,150,180,0.1); border:1px solid rgba(47,150,180,0.3); border-radius:4px; transition:0.2s;" title="실시간 DB 새로고침" onmouseover="this.style.background='rgba(47,150,180,0.3)'" onmouseout="this.style.background='rgba(47,150,180,0.1)'">
                                            <i class="fas fa-sync-alt"></i> 목록 갱신
                                        </a>
                                        <a href="#" id="pmh_dt_default_sort_btn" style="color:#e5a00d; font-size:12px; text-decoration:none; display:flex; align-items:center; gap:4px; padding:2px 6px; background:rgba(229,160,13,0.1); border:1px solid rgba(229,160,13,0.3); border-radius:4px; transition:0.2s;" title="작업 실행 순서(작업종류 ➔ 섹션 ➔ 제목)로 되돌리기" onmouseover="this.style.background='rgba(229,160,13,0.3)'" onmouseout="this.style.background='rgba(229,160,13,0.1)'">
                                            <i class="fas fa-sort-amount-down"></i> 기본 정렬
                                        </a>
                                    </div>
                                    <div style="display:flex; align-items:center; gap:8px;">
                                        <span style="color:#aaa; font-size:11px;">페이지당:</span>
                                        <select id="pmh_dt_limit_select" style="padding:3px; background:#111; color:#fff; border:1px solid #444; border-radius:4px; font-size:11px; cursor:pointer;">
                                            <option value="10" ${itemsPerPage === 10 ? 'selected' : ''}>10개</option>
                                            <option value="20" ${itemsPerPage === 20 ? 'selected' : ''}>20개</option>
                                            <option value="30" ${itemsPerPage === 30 ? 'selected' : ''}>30개</option>
                                            <option value="50" ${itemsPerPage === 50 ? 'selected' : ''}>50개</option>
                                            <option value="100" ${itemsPerPage === 100 ? 'selected' : ''}>100개</option>
                                        </select>
                                    </div>
                                </div>
                            `;

                            if (total_items === 0) {
                                resForm.innerHTML = finalHtml + `<div style="padding:15px; background:#111; color:#aaa; text-align:center; border-radius:4px;">조회된 항목이 없습니다. (모두 처리 완료됨)</div>`;
                            } else {
                                let dtHtml = `<table style="width:100%; border-collapse:collapse; font-size:12px; table-layout:fixed;"><tr style="border-bottom:1px solid #444; color:#e5a00d;">`;
                                (columns || []).forEach(col => {
                                    const widthStr = col.width ? `width:${col.width};` : '';
                                    const alignStr = `text-align:${col.header_align || col.align || 'center'};`;
                                    let sortIcon = '';
                                    if (currentSortCol === col.key) sortIcon = currentSortDir === 'asc' ? ' <i class="fas fa-sort-up"></i>' : ' <i class="fas fa-sort-down"></i>';
                                    dtHtml += `<th class="pmh-dt-header" data-key="${col.key}" style="padding:8px 6px; ${widthStr} ${alignStr} cursor:pointer;" title="클릭하여 정렬">${col.label}${sortIcon}</th>`;
                                });
                                dtHtml += `</tr>`;

                                const currentHashBase = window.location.hash.split('/server/')[0] || '#!';

                                pageData.forEach(row => {
                                    dtHtml += `<tr style="border-bottom:1px solid #333; transition:background 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.05)'" onmouseout="this.style.background='transparent'">`;
                                    (columns || []).forEach(col => {
                                        let val = row[col.key] !== undefined && row[col.key] !== null ? row[col.key] : '-';
                                        let displayHtml = val;
                                        const alignStr = `text-align:${col.align || 'left'};`;
                                        const safeTitle = String(val).replace(/"/g, '&quot;');

                                        const actualMachineId = machine_id || renderSrv.machineIdentifier;
                                        if (col.type === 'link' && actualMachineId && row[col.link_key]) {
                                            const ratingKey = row[col.link_key];
                                            const href = `${currentHashBase}/server/${actualMachineId}/details?key=%2Flibrary%2Fmetadata%2F${ratingKey}`;
                                            displayHtml = `<a href="${href}" style="color:#2f96b4; text-decoration:none;" title="${safeTitle}" onmouseover="this.style.textDecoration='underline'" onmouseout="this.style.textDecoration='none'">${val}</a>`;
                                        }
                                        else if (col.type === 'action_btn') {
                                            const btnPayload = JSON.stringify({ action_type: col.action_type || 'execute', _is_single: true, ...row }).replace(/"/g, '&quot;');
                                            
                                            displayHtml = `<a href="#" class="pmh_dt_row_action_btn" data-payload="${btnPayload}" style="color:#e5a00d; font-size:14px; text-decoration:none; transition:0.2s; display:inline-block;" onmouseover="this.style.color='#ffc107'; this.style.transform='scale(1.2)';" onmouseout="this.style.color='#e5a00d'; this.style.transform='scale(1)';" title="이 항목만 단독 실행"><i class="${col.icon || 'fas fa-play'}"></i></a>`;
                                        }

                                        dtHtml += `<td style="padding:8px 6px; ${alignStr} white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${safeTitle}">${displayHtml}</td>`;
                                    });
                                    dtHtml += `</tr>`;
                                });

                                dtHtml += `</table>`;
                                finalHtml += dtHtml;

                                if (pagingHtml) {
                                    let jumpHtml = '';
                                    if (total_pages > 3) {
                                        jumpHtml = `
                                            <div class="pmh-page-jump-container" style="display:flex; align-items:center; justify-content:center; gap: 10px; margin-bottom: 12px; width: 100%; max-width: 400px;">
                                                <span style="color:#aaa; font-size:11px;">페이지 이동:</span>
                                                <input type="number" id="pmh_page_input" value="${page}" min="1" max="${total_pages}" style="width: 50px; height: 24px; padding: 0 4px; background: #111; color: #fff; border: 1px solid #444; border-radius: 4px; font-size: 12px; text-align: center;" title="엔터(Enter)를 누르면 이동합니다">
                                                <span style="color:#777; font-size:11px; margin-right: 5px;">/ ${total_pages}</span>
                                                <input type="range" id="pmh_page_slider" min="1" max="${total_pages}" value="${page}" style="flex-grow: 1; height: 4px; accent-color: #e5a00d; cursor: pointer;" title="드래그 후 놓으면 이동합니다">
                                            </div>
                                        `;
                                    }
                                    
                                    finalHtml += `<div style="display:flex; flex-direction:column; align-items:center; margin-top:20px;">
                                                    ${jumpHtml}
                                                    ${pagingHtml}
                                                  </div>`;
                                }

                                if (action_button) {
                                    const payloadStr = JSON.stringify(action_button.payload || {}).replace(/"/g, '&quot;');
                                    finalHtml += `<div style="text-align:center; margin-top:20px; padding-top:15px; border-top:1px dashed #444; display:flex; flex-wrap:wrap; justify-content:center; gap:10px;">`;
                                    
                                    let btnLabel = action_button.label || "<i class='fas fa-rocket'></i> 작업 실행";
                                    
                                    finalHtml += `<button id="pmh_resume_btn" style="display:none; padding:10px 20px; background:#2f96b4; color:#1f1f1f; border:none; border-radius:4px; font-weight:bold; cursor:pointer; font-size:13px; transition:0.2s; box-shadow:0 4px 10px rgba(0,0,0,0.3); white-space:nowrap;"><i class="fas fa-step-forward"></i> 이어서 계속하기</button>`;
                                    finalHtml += `<button id="pmh_dt_action_btn" data-payload="${payloadStr}" style="display:none; padding:10px 20px; background:#51a351; color:#1f1f1f; border:none; border-radius:4px; font-weight:bold; cursor:pointer; font-size:13px; transition:0.2s; box-shadow:0 4px 10px rgba(0,0,0,0.3); white-space:nowrap;">${btnLabel}</button>`;
                                    finalHtml += `<button class="pmh_global_cancel_btn" style="display:none; padding:10px 20px; background:#bd362f; color:#fff; border:none; border-radius:4px; font-weight:bold; cursor:pointer; font-size:13px; transition:0.2s; box-shadow:0 4px 10px rgba(0,0,0,0.3); white-space:nowrap;"><i class="fas fa-stop"></i> 작업 중단</button>`;
                                    
                                    finalHtml += `</div>`;
                                }
                                resForm.innerHTML = finalHtml; 
                                
                                updateFormTabButtons(isTaskRunning);
                            }

                            setTimeout(() => {
                                const panel = document.getElementById('pmh-tool-panel');
                                if (panel && (panel.style.height === 'auto' || !panel.style.height)) {
                                    const maxAllowedHeight = window.innerHeight - 80;
                                    if (panel.offsetHeight >= maxAllowedHeight) {
                                        panel.style.height = maxAllowedHeight + 'px';
                                    }
                                }
                            }, 10);

                            const limitSelect = document.getElementById('pmh_dt_limit_select');
                            if (limitSelect) limitSelect.addEventListener('change', (e) => {
                                const newLimit = parseInt(e.target.value, 10);
                                savedOptions.items_per_page = newLimit; saveOptionsToServer();
                                fetchPageFromServer(1, currentSortCol, currentSortDir, newLimit);
                            });

                            const refreshBtn = document.getElementById('pmh_dt_refresh_btn');
                            if (refreshBtn) {
                                refreshBtn.onclick = (e) => {
                                    e.preventDefault(); e.stopPropagation();
                                    const { reqData } = getFormData();
                                    reqData.action_type = 'page'; reqData.page = 1; reqData.limit = itemsPerPage;
                                    reqData.sort_key = currentSortCol; reqData.sort_dir = currentSortDir;
                                    
                                    const icon = refreshBtn.querySelector('i'); if(icon) icon.classList.add('fa-spin');
                                    showOverlayLoading();
                                    GM_xmlhttpRequest({
                                        method: "POST", url: `${renderSrv.pmhServerUrl}/api/tool/${toolId}/run`,
                                        headers: { "Content-Type": "application/json", "X-API-Key": renderSrv.plexMateApiKey },
                                        data: JSON.stringify(reqData),
                                        onload: (r) => { if(r.status===200) processAndRenderResult(JSON.parse(r.responseText), itemsPerPage, renderSrv, true); }
                                    });
                                };
                            }

                            const defaultSortBtn = document.getElementById('pmh_dt_default_sort_btn');
                            if (defaultSortBtn) {
                                defaultSortBtn.onclick = (e) => {
                                    e.preventDefault(); e.stopPropagation();
                                    
                                    currentSortCol = null;
                                    currentSortDir = 'asc';
                                    savedOptions._sort_key = null;
                                    savedOptions._sort_dir = null;
                                    saveOptionsToServer();
                                    
                                    const icon = defaultSortBtn.querySelector('i');
                                    if(icon) {
                                        icon.classList.remove('fa-sort-amount-down');
                                        icon.classList.add('fa-spinner', 'fa-spin');
                                    }
                                    showOverlayLoading();
                                    
                                    const { reqData } = getFormData();
                                    reqData.action_type = 'page'; 
                                    reqData.page = 1; 
                                    reqData.limit = itemsPerPage;
                                    reqData.sort_key = null; 
                                    reqData.sort_dir = 'asc';
                                    
                                    GM_xmlhttpRequest({
                                        method: "POST", url: `${renderSrv.pmhServerUrl}/api/tool/${toolId}/run`,
                                        headers: { "Content-Type": "application/json", "X-API-Key": renderSrv.plexMateApiKey },
                                        data: JSON.stringify(reqData),
                                        onload: (r) => { 
                                            if(r.status===200) processAndRenderResult(JSON.parse(r.responseText), itemsPerPage, renderSrv, true); 
                                        }
                                    });
                                };
                            }

                            document.querySelectorAll('.pmh-page-btn').forEach(btn => { btn.onclick = () => fetchPageFromServer(parseInt(btn.dataset.p)); });

                            const slider = document.getElementById('pmh_page_slider');
                            const numInput = document.getElementById('pmh_page_input');

                            if (slider && numInput) {
                                slider.addEventListener('input', (e) => {
                                    numInput.value = e.target.value;
                                });

                                slider.addEventListener('change', (e) => {
                                    fetchPageFromServer(parseInt(e.target.value));
                                });

                                numInput.addEventListener('keydown', (e) => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        let val = parseInt(e.target.value);
                                        if (val >= 1 && val <= total_pages) {
                                            fetchPageFromServer(val);
                                        } else {
                                            e.target.value = page;
                                        }
                                    }
                                });

                                numInput.addEventListener('input', (e) => {
                                    let val = parseInt(e.target.value);
                                    if (val >= 1 && val <= total_pages) {
                                        slider.value = val;
                                    }
                                });
                            }

                            document.querySelectorAll('.pmh-dt-header').forEach(th => {
                                th.onclick = () => {
                                    const key = th.dataset.key;
                                    if (currentSortCol === key) currentSortDir = currentSortDir === 'asc' ? 'desc' : 'asc';
                                    else { currentSortCol = key; currentSortDir = 'asc'; }
                                    savedOptions._sort_key = currentSortCol; savedOptions._sort_dir = currentSortDir; saveOptionsToServer();
                                    fetchPageFromServer(1, currentSortCol, currentSortDir);
                                };
                            });

                            const resumeBtn = document.getElementById('pmh_resume_btn');
                            const actionBtn = document.getElementById('pmh_dt_action_btn');

                            if (resumeBtn) {
                                resumeBtn.onmouseover = () => resumeBtn.style.backgroundColor = "#52a5bd";
                                resumeBtn.onmouseout = () => resumeBtn.style.backgroundColor = "#2f96b4";
                                resumeBtn.onclick = (e) => {
                                    e.preventDefault();
                                    if (isTaskRunning) return alert("현재 진행 중인 작업이 있습니다. 모니터링 탭을 확인하세요.");
                                    
                                    const origHtml = resumeBtn.innerHTML;
                                    resumeBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 실행 중...';
                                    resumeBtn.style.pointerEvents = 'none';
                                    resumeBtn.style.opacity = '0.7';
                                    
                                    const resumeData = getFormData().reqData; resumeData.action_type = 'resume';
                                    
                                    GM_xmlhttpRequest({
                                        method: "POST", url: `${renderSrv.pmhServerUrl}/api/tool/${toolId}/run`,
                                        headers: { "Content-Type": "application/json", "X-API-Key": renderSrv.plexMateApiKey },
                                        data: JSON.stringify(resumeData),
                                        onload: (r) => { processAndRenderResult(JSON.parse(r.responseText), itemsPerPage, renderSrv); },
                                        onerror: () => { 
                                            resumeBtn.innerHTML = origHtml; 
                                            resumeBtn.style.pointerEvents = 'auto'; 
                                            resumeBtn.style.opacity = '1';
                                            toastr.error("서버 연결에 실패했습니다."); 
                                        }
                                    });
                                }
                            }

                            if (actionBtn) {
                                actionBtn.onmouseover = () => actionBtn.style.backgroundColor = "#5ebf5e";
                                actionBtn.onmouseout = () => actionBtn.style.backgroundColor = "#51a351";
                                actionBtn.onclick = () => {
                                    if (isTaskRunning) return alert("현재 진행 중인 작업이 있습니다. 모니터링 탭을 확인하세요.");
                                    
                                    const origHtml = actionBtn.innerHTML;
                                    actionBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 실행 중...';
                                    actionBtn.style.pointerEvents = 'none';
                                    actionBtn.style.opacity = '0.7';
                                    
                                    const executeData = getFormData().reqData; executeData.action_type = 'execute';
                                    try { Object.assign(executeData, JSON.parse(actionBtn.dataset.payload || "{}")); } catch(e){}
                                    
                                    GM_xmlhttpRequest({
                                        method: "POST", url: `${renderSrv.pmhServerUrl}/api/tool/${toolId}/run`,
                                        headers: { "Content-Type": "application/json", "X-API-Key": renderSrv.plexMateApiKey },
                                        data: JSON.stringify(executeData),
                                        onload: (r) => { processAndRenderResult(JSON.parse(r.responseText), itemsPerPage, renderSrv); },
                                        onerror: () => { 
                                            actionBtn.innerHTML = origHtml; 
                                            actionBtn.style.pointerEvents = 'auto'; 
                                            actionBtn.style.opacity = '1';
                                            toastr.error("서버 연결에 실패했습니다."); 
                                        }
                                    });
                                };
                            }

                            resForm.onclick = (e) => {
                                const btn = e.target.closest('.pmh_dt_row_action_btn');
                                if (!btn) return; // 클릭한 곳이 단일 실행 버튼이 아니면 무시

                                e.preventDefault(); e.stopPropagation();
                                if (isTaskRunning) return alert("현재 진행 중인 작업이 있습니다. 모니터링 탭을 확인하거나 작업을 중지해주세요.");
                                
                                const origHtml = btn.innerHTML;
                                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
                                btn.style.pointerEvents = 'none';
                                btn.style.opacity = '0.7';
                                
                                const executeData = getFormData().reqData;
                                try { Object.assign(executeData, JSON.parse(btn.dataset.payload || "{}")); } catch(err){}
                                
                                GM_xmlhttpRequest({
                                    method: "POST", url: `${renderSrv.pmhServerUrl}/api/tool/${toolId}/run`,
                                    headers: { "Content-Type": "application/json", "X-API-Key": renderSrv.plexMateApiKey },
                                    data: JSON.stringify(executeData),
                                    onload: (r) => { processAndRenderResult(JSON.parse(r.responseText), itemsPerPage, renderSrv); },
                                    onerror: () => { 
                                        btn.innerHTML = origHtml; 
                                        btn.style.pointerEvents = 'auto'; 
                                        btn.style.opacity = '1';
                                        toastr.error("서버 연결에 실패했습니다."); 
                                    }
                                });
                            };
                        }

                        else if (resData.type === 'dashboard') {
                            if (!preventTabSwitch) switchTab('tab_form');
                            const resForm = document.getElementById('pmh_run_res_form');
                            resForm.style.display = 'block';

                            let dashHtml = `<div style="padding:5px;">`;
                            if (resData.summary_cards && resData.summary_cards.length > 0) {
                                dashHtml += `<div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(140px, 1fr)); gap:10px; margin-bottom:20px;">`;
                                resData.summary_cards.forEach(card => {
                                    dashHtml += `<div style="background:#111; border:1px solid #333; border-radius:6px; padding:12px; display:flex; align-items:center; gap:12px;">
                                                    <div style="font-size:24px; color:${card.color||'#e5a00d'}; width:30px; text-align:center;"><i class="${card.icon||'fas fa-info-circle'}"></i></div>
                                                    <div style="flex-grow:1; min-width:0;">
                                                        <div style="font-size:11px; color:#aaa; margin-bottom:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${card.label}</div>
                                                        <div style="font-size:16px; color:#fff; font-weight:bold; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${card.value}</div>
                                                    </div>
                                                  </div>`;
                                });
                                dashHtml += `</div>`;
                            }
                            if (resData.bar_charts && resData.bar_charts.length > 0) {
                                dashHtml += `<div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(300px, 1fr)); gap:15px;">`;
                                resData.bar_charts.forEach(chart => {
                                    dashHtml += `<div style="background:#15181a; border:1px solid #222; border-radius:6px; padding:15px;">
                                                    <div style="font-size:13px; font-weight:bold; color:#2f96b4; margin-bottom:12px; border-bottom:1px dashed #333; padding-bottom:5px;">${chart.title}</div>`;
                                    chart.items.forEach(item => {
                                        dashHtml += `<div style="margin-bottom:8px;">
                                                        <div style="display:flex; justify-content:space-between; font-size:11px; color:#ccc; margin-bottom:3px;">
                                                            <span>${item.label}</span><span>${item.count} (${item.percent||0}%)</span>
                                                        </div>
                                                        <div style="width:100%; height:6px; background:#222; border-radius:3px; overflow:hidden;">
                                                            <div style="width:${item.percent||0}%; height:100%; background:${chart.color||'#e5a00d'}; border-radius:3px;"></div>
                                                        </div>
                                                      </div>`;
                                    });
                                    dashHtml += `</div>`;
                                });
                                dashHtml += `</div>`;
                            }
                            dashHtml += `</div>`;
                            resForm.innerHTML = dashHtml;

                            setTimeout(() => {
                                const panel = document.getElementById('pmh-tool-panel');
                                if (panel && (panel.style.height === 'auto' || !panel.style.height)) {
                                    const maxAllowedHeight = window.innerHeight - 80;
                                    if (panel.offsetHeight >= maxAllowedHeight) {
                                        panel.style.height = maxAllowedHeight + 'px';
                                    }
                                }
                            }, 10);
                        }
                        
                        else if (resData.type === 'async_task') {
                            if (!preventTabSwitch) switchTab('tab_monitor');
                            const taskId = resData.task_id;
                            const isPreviewing = resData.is_preview === true; 
                            
                            const resMonitor = document.getElementById('pmh_run_res_monitor');
                            if (pollTimer) clearTimeout(pollTimer);
                            resMonitor.style.display = 'flex'; resMonitor.style.flexDirection = 'column'; resMonitor.style.flexGrow = '1';
                            
                            const pollStatus = () => {
                                if (!document.getElementById('pmh_run_res_monitor')) return;

                                GM_xmlhttpRequest({
                                    method: "GET", url: `${renderSrv.pmhServerUrl}/api/tool/${toolId}/status?task_id=${taskId}&server_id=${serverId}`,
                                    headers: { "X-API-Key": renderSrv.plexMateApiKey },
                                    onload: (pollRes) => {
                                        if (pollRes.status === 404) {
                                            resMonitor.innerHTML = `<div style="color:#bd362f; padding:10px; background:#111; border-radius:4px; text-align:center;"><i class="fas fa-exclamation-triangle"></i> 작업을 찾을 수 없습니다.</div>`;
                                            currentTaskStatus = {}; updateFormTabButtons(false); isCancelling = false; return;
                                        }

                                        if (pollRes.status === 200) {
                                            const statusData = JSON.parse(pollRes.responseText);
                                            currentTaskStatus = statusData;
                                            
                                            let percent = 0;
                                            if (statusData.total > 0) percent = Math.floor((statusData.progress / statusData.total) * 100);
                                            else if (statusData.state === 'completed') percent = 100;
                                            
                                            const isDone = statusData.state === 'completed' || statusData.state === 'error' || statusData.state === 'cancelled';
                                            if (isDone) isCancelling = false;

                                            const barColor = (statusData.state === 'error' || statusData.state === 'cancelled') ? '#bd362f' : '#51a351';
                                            
                                            updateFormTabButtons(!isDone);

                                            let stateIcon = '<i class="fas fa-spinner fa-spin"></i> 작업 진행 중...';
                                            if (statusData.state === 'error') stateIcon = '<i class="fas fa-exclamation-triangle"></i> 오류 발생 / 중단됨';
                                            else if (statusData.state === 'cancelled') stateIcon = '<i class="fas fa-ban"></i> 사용자에 의해 취소됨';
                                            else if (statusData.state === 'completed') stateIcon = '<i class="fas fa-check-circle"></i> 작업 완료';

                                            let logsHtml = (statusData.logs || []).map(l => `<div style="margin-bottom:2px;">${l}</div>`).join('');
                                            let controlsHtml = '';
                                            if (!isDone) {
                                                if (isCancelling) {
                                                    controlsHtml = `<button class="pmh_global_cancel_btn" style="padding:6px 15px; background:#bd362f; color:#fff; border:none; border-radius:4px; cursor:not-allowed; font-weight:bold; font-size:12px; opacity:0.7;"><i class="fas fa-spinner fa-spin"></i> 취소 요청 중...</button>`;
                                                } else {
                                                    controlsHtml = `<button class="pmh_global_cancel_btn" style="padding:6px 15px; background:#bd362f; color:#fff; border:none; border-radius:4px; cursor:pointer; font-weight:bold; font-size:12px;"><i class="fas fa-stop"></i> 작업 중단</button>`;
                                                }
                                            }

                                            resMonitor.innerHTML = `
                                                <div style="display:flex; flex-direction:column; background:#15181a; border:1px solid #333; border-radius:6px; padding:15px; text-align:left; flex-grow:1; min-height:0;">
                                                    <div style="display:flex; justify-content:space-between; font-size:12px; color:#ccc; margin-bottom:8px; flex-shrink:0;">
                                                        <span style="font-weight:bold; color:${barColor};">${stateIcon}</span>
                                                        <span>${statusData.progress} / ${statusData.total} (${percent}%)</span>
                                                    </div>
                                                    <div style="width:100%; height:12px; background:#222; border-radius:6px; overflow:hidden; margin-bottom:15px; flex-shrink:0;">
                                                        <div style="width:${percent}%; height:100%; background:${barColor}; transition:width 0.5s;"></div>
                                                    </div>
                                                    <div id="pmh_log_container" style="background:#0a0a0c; border:1px solid #222; border-radius:4px; padding:8px; flex-grow:1; min-height:0; overflow-y:auto; font-family:monospace; font-size:11px; color:#aaa; line-height:1.6; display:flex; flex-direction:column;">
                                                        <div>${logsHtml}</div>
                                                    </div>
                                                    <div style="margin-top:15px; display:flex; justify-content:center; flex-shrink:0;">
                                                        ${controlsHtml}
                                                    </div>
                                                </div>
                                            `;

                                            const logBox = document.getElementById('pmh_log_container');
                                            if (logBox) logBox.scrollTop = logBox.scrollHeight;

                                            if (isDone && isPreviewing && (statusData.state === 'completed' || statusData.state === 'cancelled')) {
                                                setTimeout(() => {
                                                    GM_xmlhttpRequest({
                                                        method: "POST", url: `${renderSrv.pmhServerUrl}/api/tool/${toolId}/run`,
                                                        headers: { "Content-Type": "application/json", "X-API-Key": renderSrv.plexMateApiKey },
                                                        data: JSON.stringify({ action_type: 'page', page: 1, limit: savedOptions.items_per_page || 10, sort_key: savedOptions._sort_key, sort_dir: savedOptions._sort_dir || 'asc', _server_id: serverId }),
                                                        onload: (r) => { 
                                                            if (r.status === 200) {
                                                                processAndRenderResult(JSON.parse(r.responseText), itemsPerPage, renderSrv, false); 
                                                            } else {
                                                                switchTab('tab_form');
                                                                const resForm = document.getElementById('pmh_run_res_form');
                                                                if(resForm) resForm.innerHTML = `<div style="padding:15px; background:#111; color:#aaa; text-align:center; border-radius:4px;">조회된 항목이 없습니다.</div>`;
                                                            }
                                                        }
                                                    });
                                                }, 500);
                                                return; 
                                            }
                                            if (!isDone) pollTimer = setTimeout(pollStatus, 1500); 
                                        }
                                    }
                                });
                            };
                            setTimeout(pollStatus, 50);
                        }
                    };

                    const mainRunBtn = document.getElementById('pmh_run_btn');
                    if (mainRunBtn) {
                        mainRunBtn.onmouseover = () => { if(!mainRunBtn.disabled) mainRunBtn.style.backgroundColor = "#d4910c"; };
                        mainRunBtn.onmouseout = () => { if(!mainRunBtn.disabled) mainRunBtn.style.backgroundColor = "#e5a00d"; };
                        mainRunBtn.onclick = (e2) => {
                            e2.preventDefault();
                            if (isTaskRunning) return alert("진행 중인 백그라운드 작업이 있습니다.\n모니터링 탭을 확인하여 작업을 중지하거나 완료를 기다려 주세요.");
                            const { targetSrv: tSrv, reqData } = getFormData();
                            reqData.action_type = 'preview'; 
                            switchTab('tab_form');
                            const resForm = document.getElementById('pmh_run_res_form');
                            resForm.style.display = 'block'; 
                            resForm.innerHTML = `<div style="text-align:center; padding:30px 0;"><i class="fas fa-spinner fa-spin" style="font-size:30px; color:#51a351; margin-bottom:15px;"></i><br>[${tSrv.name}] 서버에서 데이터를 분석하고 있습니다.<br><span style="color:#aaa; font-size:11px; display:inline-block; margin-top:8px;">(시간이 오래 걸릴 경우 모니터링 탭에서 실시간 진행 상황을 확인할 수 있습니다.)</span></div>`;
                            
                            let isFetchingPreview = true;
                            let previewPollTimer = null;
                            const pollPreviewLogs = () => {
                                if (!isFetchingPreview) return;
                                GM_xmlhttpRequest({
                                    method: "GET", url: `${tSrv.pmhServerUrl}/api/tool/${toolId}/status?server_id=${serverId}`,
                                    headers: { "X-API-Key": tSrv.plexMateApiKey },
                                    onload: (pollRes) => {
                                        if (!isFetchingPreview) return;
                                        if (pollRes.status === 200) {
                                            try {
                                                const statusData = JSON.parse(pollRes.responseText);
                                                if (statusData.logs && statusData.logs.length > 0) {
                                                    const resMonitor = document.getElementById('pmh_run_res_monitor');
                                                    if (resMonitor) {
                                                        resMonitor.style.display = 'flex'; resMonitor.style.flexDirection = 'column'; resMonitor.style.flexGrow = '1';
                                                        let logsHtml = statusData.logs.map(l => `<div style="margin-bottom:2px;">${l}</div>`).join('');
                                                        resMonitor.innerHTML = `
                                                            <div style="display:flex; flex-direction:column; background:#15181a; border:1px solid #333; border-radius:6px; padding:15px; text-align:left; flex-grow:1; min-height:0;">
                                                                <div style="display:flex; justify-content:space-between; font-size:12px; color:#ccc; margin-bottom:15px; flex-shrink:0; border-bottom:1px dashed #333; padding-bottom:8px;">
                                                                    <span style="font-weight:bold; color:#e5a00d;"><i class="fas fa-spinner fa-spin"></i> 백그라운드 데이터 분석 진행 중...</span>
                                                                </div>
                                                                <div id="pmh_log_container_preview" style="background:#0a0a0c; border:1px solid #222; border-radius:4px; padding:8px; flex-grow:1; overflow-y:auto; font-family:monospace; font-size:11px; color:#aaa; line-height:1.6; display:flex; flex-direction:column; min-height:0;">
                                                                    <div>${logsHtml}</div>
                                                                </div>
                                                            </div>
                                                        `;
                                                        const logBox = document.getElementById('pmh_log_container_preview');
                                                        if (logBox) logBox.scrollTop = logBox.scrollHeight;
                                                    }
                                                }
                                            } catch(e) {}
                                        }
                                        if (isFetchingPreview) previewPollTimer = setTimeout(pollPreviewLogs, 1000);
                                    }
                                });
                            };
                            previewPollTimer = setTimeout(pollPreviewLogs, 500);

                            GM_xmlhttpRequest({
                                method: "POST", url: `${tSrv.pmhServerUrl}/api/tool/${toolId}/run`,
                                headers: { "Content-Type": "application/json", "X-API-Key": tSrv.plexMateApiKey },
                                data: JSON.stringify(reqData),
                                onload: (r) => {
                                    isFetchingPreview = false; if (previewPollTimer) clearTimeout(previewPollTimer);
                                    try { processAndRenderResult(JSON.parse(r.responseText), parseInt(savedOptions.items_per_page || 10), tSrv); }
                                    catch(err) { resForm.innerHTML = `<pre style="white-space:pre-wrap; background:#2b1515; padding:12px; border:1px solid #5c2020; border-radius:4px; color:#e06c6c;">${r.responseText}</pre>`; }
                                },
                                onerror: () => {
                                    isFetchingPreview = false; if (previewPollTimer) clearTimeout(previewPollTimer);
                                    resForm.innerHTML = `<div style="padding:15px; color:#bd362f; text-align:center;">서버 통신 중 오류가 발생했습니다.</div>`;
                                }
                            });
                        };
                    }
                }, 50); 
            }
        }); 
    }

    // ==========================================
    // 5-2. 기본 제어 패널(Top Nav UI) 주입
    // ==========================================
    function injectControlUI() {
        if (document.getElementById('pmdv-controls')) return;

        let target = document.querySelector('button[data-testid="navbarAccountMenuTrigger"]')?.closest('div[style*="height: 100%"]');
        if (!target) {
            const btn = document.querySelector('button[data-testid="navbarAccountMenuTrigger"]');
            if (btn) target = btn.parentElement;
        }
        if (!target) return;

        log("[UI] Injecting Control UI...");
        const ctrl = document.createElement('div');
        ctrl.id = 'pmdv-controls';
        ctrl.style.cssText = "display: flex; align-items: center; gap: 5px; margin-right: 10px; order: -1;";

        let isUiExpanded = GM_getValue('pmh_ui_expanded', true);
        let defaultMsg = '';
        let defaultColor = '#aaa';
        let msgTimeout = null;
        let serversToUpdate = [];
        let needsJsUpdate = false;

        const latestKnownVer = GM_getValue('pmh_latest_version', CURRENT_VERSION);
        const reqRestart = GM_getValue('pmh_server_restart_required', false);
        const hasServerError = GM_getValue('pmh_server_connection_error', false);
        
        if (hasServerError) {
            defaultMsg = `<span style="color:#bd362f; cursor:help;" title="로컬 PMH 파이썬 서버가 꺼져 있거나 설정이 잘못되었습니다."><i class="fas fa-exclamation-triangle"></i> 서버 연결 오류</span>`;
            defaultColor = '#bd362f';
        } else if (isNewerVersion(CURRENT_VERSION, latestKnownVer)) {
            needsJsUpdate = true;
            const btnText = reqRestart ? `업데이트(v${latestKnownVer}): 서버 재시작 필요` : `업데이트(v${latestKnownVer})`;
            defaultMsg = `<a href="#" id="pmh-unified-update-link" data-ver="${latestKnownVer}" style="color:#e5a00d; text-decoration:none;" title="클릭 시 전체 업데이트 진행">${btnText}</a>`;
            defaultColor = '#e5a00d';
        }

        const showStatusMsg = (text, color, duration = 3000) => {
            const msgBox = document.getElementById('pmh-status-message');
            if (!msgBox) return;
            if (msgTimeout) clearTimeout(msgTimeout);
            msgBox.innerHTML = text; msgBox.style.color = color;
            if (duration > 0) {
                msgTimeout = setTimeout(() => {
                    msgBox.innerHTML = defaultMsg; msgBox.style.color = defaultColor;
                }, duration);
            }
        };

        ctrl.insertAdjacentHTML('afterbegin', `
            <div id="pmh-status-message" style="margin-right: 5px; font-size: 11px; font-weight: bold; white-space: nowrap; transition: color 0.3s;"></div>
            <div style="display:flex; align-items:center; margin-right: 8px; height: 100%;">
                <a href="#" id="pmh-manual-update-btn" style="display:flex; align-items:center; justify-content:center; color:#adb5bd; font-size:14px; margin-right:12px; transition:0.2s; text-decoration:none;" title="PMH 업데이트 확인" onmouseover="this.style.color='white'" onmouseout="this.style.color='#adb5bd'"><i class="fas fa-sync-alt pmh-sync-icon"></i></a>
                <a href="https://github.com/golmog/plex_meta_helper" target="_blank" style="display:flex; align-items:center; justify-content:center; color:white; font-size:16px; transition:0.2s; text-decoration:none;" title="PMH GitHub 페이지" onmouseover="this.style.color='#e5a00d'" onmouseout="this.style.color='white'"><i class="fab fa-github"></i></a>
            </div>
        `);

        const settingsWrapper = document.createElement('div');
        settingsWrapper.id = 'pmh-settings-wrapper';
        settingsWrapper.style.cssText = "display: flex; align-items: center; gap: 5px;";
        settingsWrapper.style.display = isUiExpanded ? 'flex' : 'none';

        const createBtn = (label, title, stateKey, storeKey, callback) => {
            const btn = document.createElement('button');
            btn.textContent = `${label}:${state[stateKey]?'ON':'OFF'}`;
            btn.title = title;
            if(state[stateKey]) btn.classList.add('on');
            btn.addEventListener('click', () => {
                state[stateKey] = !state[stateKey];
                GM_setValue(storeKey, state[stateKey]);
                btn.textContent = `${label}:${state[stateKey]?'ON':'OFF'}`;
                btn.classList.toggle('on', state[stateKey]);
                callback();
            });
            return btn;
        };

        const forceReRenderAll = () => {
            clearMemoryCache();
            if (typeof sessionRevalidated !== 'undefined') sessionRevalidated.clear(); 
            document.querySelectorAll('.pmh-render-marker, .pmh-top-right-wrapper, .plex-guid-list-box, .plex-list-multipath-badge, .pmh-guid-wrapper').forEach(e=>e.remove());
            processList();
        };

        const toggleDetailView = () => {
            if (state.detailInfo) { processDetail(); }
            else { document.getElementById('plex-guid-box')?.remove(); currentDisplayedItemId = null; }
        };

        settingsWrapper.insertAdjacentHTML('beforeend', `<span class="ctrl-label">목록:</span>`);
        settingsWrapper.appendChild(createBtn('GUID', '목록 포스터 아래에 매칭된 GUID(에이전트 ID)를 표시합니다.', 'listGuid', STATE_KEYS.GUID, forceReRenderAll));
        settingsWrapper.appendChild(createBtn('태그', '목록 포스터 우측 상단에 화질, 해상도 등 속성 뱃지를 표시합니다.', 'listTag', STATE_KEYS.TAG, forceReRenderAll));
        settingsWrapper.appendChild(createBtn('재생', '목록 포스터 우측 상단에 외부 재생/스트리밍 아이콘을 표시합니다.', 'listPlay', STATE_KEYS.PLAY, forceReRenderAll));
        settingsWrapper.appendChild(createBtn('다중경로', '여러 폴더/경로가 병합된 컨텐츠일 경우 병합된 개수를 뱃지로 표시합니다.', 'listMultiPath', STATE_KEYS.MULTIPATH, forceReRenderAll));

        settingsWrapper.insertAdjacentHTML('beforeend', `<span class="ctrl-label" style="margin-left:8px;"><span style="opacity:0.3;">|</span> 상세:</span>`);
        settingsWrapper.appendChild(createBtn('정보', '상세 페이지 진입 시 PMH 전용 미디어 정보 패널을 표시합니다.', 'detailInfo', STATE_KEYS.DETAIL, toggleDetailView));

        settingsWrapper.insertAdjacentHTML('beforeend', `<span class="ctrl-label" style="margin-left:8px;"><span style="opacity:0.3;">|</span> GUID길이:</span>`);
        const lenInp = document.createElement('input');
        lenInp.type = 'number'; lenInp.min = '5'; lenInp.max = '50'; lenInp.value = state.guidLen;
        const lenBtn = document.createElement('button'); lenBtn.textContent = '적용';
        lenBtn.addEventListener('click', () => {
            const nl = parseInt(lenInp.value);
            if (!isNaN(nl) && nl >= 5 && nl <= 50) {
                state.guidLen = nl; GM_setValue(STATE_KEYS.LEN, state.guidLen);
                forceReRenderAll(); showStatusMsg(`GUID 길이 ${nl} 적용 완료`, '#51a351');
            }
        });
        const clearCacheBtn = document.createElement('button');
        clearCacheBtn.textContent = '메모리 초기화'; clearCacheBtn.style.marginLeft = '10px';
        clearCacheBtn.addEventListener('click', () => {
            clearMemoryCache(); showStatusMsg("캐시 초기화 완료", "#51a351"); forceReRenderAll();
            if(document.getElementById('plex-guid-box')) { currentDisplayedItemId = null; processDetail(true); }
        });

        settingsWrapper.appendChild(lenInp); settingsWrapper.appendChild(lenBtn); settingsWrapper.appendChild(clearCacheBtn);
        ctrl.appendChild(settingsWrapper);

        const uiToggleBtn = document.createElement('a');
        uiToggleBtn.href = '#';
        uiToggleBtn.id = 'pmh-ui-toggle-btn';
        uiToggleBtn.style.cssText = "color:#adb5bd; font-size:16px; margin-left:8px; transition:0.2s; display:flex; align-items:center; justify-content:center; text-decoration:none;";
        uiToggleBtn.title = isUiExpanded ? "PMH 설정 접기" : "PMH 설정 펼치기";
        uiToggleBtn.innerHTML = isUiExpanded ? '<i class="fas fa-chevron-circle-right"></i>' : '<i class="fas fa-chevron-circle-left"></i>';
        uiToggleBtn.style.opacity = '0.6';
        uiToggleBtn.addEventListener('mouseenter', () => {
            uiToggleBtn.style.color = '#fff';
            uiToggleBtn.style.opacity = '1';
        });
        uiToggleBtn.addEventListener('mouseleave', () => {
            uiToggleBtn.style.color = '#adb5bd';
            uiToggleBtn.style.opacity = '0.6';
        });
        uiToggleBtn.addEventListener('click', (e) => {
            e.preventDefault(); e.stopPropagation();
            isUiExpanded = !isUiExpanded;
            GM_setValue('pmh_ui_expanded', isUiExpanded);
            settingsWrapper.style.display = isUiExpanded ? 'flex' : 'none';
            uiToggleBtn.innerHTML = isUiExpanded ? '<i class="fas fa-chevron-circle-right"></i>' : '<i class="fas fa-chevron-circle-left"></i>';
            uiToggleBtn.title = isUiExpanded ? "PMH 설정 접기" : "PMH 설정 펼치기";
        });

        ctrl.appendChild(uiToggleBtn);

        const toolDivider = document.createElement('span');
        toolDivider.style.cssText = "opacity: 0.3; color: #adb5bd; margin: 0 8px; font-size: 14px; user-select: none;";
        toolDivider.textContent = "|";
        ctrl.appendChild(toolDivider);

        if (!window.showPmhToolPanel) {
            window.pmhCurrentToolId = 'default';
            window.savePmhPanelGeometry = function() {
                const panel = document.getElementById('pmh-tool-panel');
                if(panel) {
                    const geo = { top: panel.style.top, left: panel.style.left, width: panel.style.width, height: panel.style.height };
                    GM_setValue(`pmh_panel_geo_${window.pmhCurrentToolId}`, JSON.stringify(geo));
                }
            };
            window.makeDraggable = function(elmnt, header) {
                let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
                header.onmousedown = (e) => {
                    e.preventDefault(); pos3 = e.clientX; pos4 = e.clientY;
                    document.onmouseup = () => { document.onmouseup = null; document.onmousemove = null; window.savePmhPanelGeometry(); };
                    document.onmousemove = (e) => {
                        e.preventDefault(); pos1 = pos3 - e.clientX; pos2 = pos4 - e.clientY; pos3 = e.clientX; pos4 = e.clientY;
                        let newTop = elmnt.offsetTop - pos2; let newLeft = elmnt.offsetLeft - pos1;
                        if (newTop < 0) newTop = 0; if (newLeft < 0) newLeft = 0;
                        if (newTop + elmnt.offsetHeight > window.innerHeight) newTop = window.innerHeight - elmnt.offsetHeight;
                        if (newLeft + elmnt.offsetWidth > window.innerWidth) newLeft = window.innerWidth - elmnt.offsetWidth;
                        elmnt.style.top = newTop + "px"; elmnt.style.left = newLeft + "px"; elmnt.style.right = "auto"; 
                    };
                };
            };
            window.makeResizable = function(panel) {
                const minW = 350, minH = 200;
                let originalW, originalH, originalX, originalY, originalMouseX, originalMouseY, currentResizer;
                panel.querySelectorAll('.pmh-resizer').forEach(resizer => {
                    resizer.addEventListener('mousedown', function(e) {
                        e.preventDefault(); currentResizer = e.target;
                        originalW = parseFloat(getComputedStyle(panel, null).getPropertyValue('width').replace('px', ''));
                        originalH = parseFloat(getComputedStyle(panel, null).getPropertyValue('height').replace('px', ''));
                        originalX = panel.offsetLeft; originalY = panel.offsetTop;
                        originalMouseX = e.clientX; originalMouseY = e.clientY;
                        
                        const resize = (e) => {
                            const mouseX = Math.max(0, Math.min(e.clientX, window.innerWidth));
                            const mouseY = Math.max(0, Math.min(e.clientY, window.innerHeight));
                            if (currentResizer.classList.contains('pmh-resizer-e') || currentResizer.classList.contains('pmh-resizer-se') || currentResizer.classList.contains('pmh-resizer-ne')) {
                                const width = originalW + (mouseX - originalMouseX); if (width > minW) panel.style.width = width + 'px';
                            }
                            if (currentResizer.classList.contains('pmh-resizer-s') || currentResizer.classList.contains('pmh-resizer-se') || currentResizer.classList.contains('pmh-resizer-sw')) {
                                const height = originalH + (mouseY - originalMouseY); if (height > minH) panel.style.height = height + 'px';
                            }
                            if (currentResizer.classList.contains('pmh-resizer-w') || currentResizer.classList.contains('pmh-resizer-sw') || currentResizer.classList.contains('pmh-resizer-nw')) {
                                const width = originalW - (mouseX - originalMouseX); if (width > minW) { panel.style.width = width + 'px'; panel.style.left = originalX + (mouseX - originalMouseX) + 'px'; }
                            }
                            if (currentResizer.classList.contains('pmh-resizer-n') || currentResizer.classList.contains('pmh-resizer-ne') || currentResizer.classList.contains('pmh-resizer-nw')) {
                                const height = originalH - (mouseY - originalMouseY); if (height > minH) { panel.style.height = height + 'px'; panel.style.top = originalY + (mouseY - originalMouseY) + 'px'; }
                            }
                        };
                        const stopResize = () => { document.removeEventListener('mousemove', resize); document.removeEventListener('mouseup', stopResize); window.savePmhPanelGeometry(); };
                        document.addEventListener('mousemove', resize); document.addEventListener('mouseup', stopResize);
                    });
                });
            };
            window.showPmhToolPanel = function(toolId, title, htmlContent) {
                window.pmhCurrentToolId = toolId;
                let panel = document.getElementById('pmh-tool-panel');
                if (!panel) {
                    panel = document.createElement('div'); panel.id = 'pmh-tool-panel';
                    panel.innerHTML = `
                        <div class="pmh-resizer pmh-resizer-n"></div><div class="pmh-resizer pmh-resizer-s"></div>
                        <div class="pmh-resizer pmh-resizer-e"></div><div class="pmh-resizer pmh-resizer-w"></div>
                        <div class="pmh-resizer pmh-resizer-ne"></div><div class="pmh-resizer pmh-resizer-nw"></div>
                        <div class="pmh-resizer pmh-resizer-se"></div><div class="pmh-resizer pmh-resizer-sw"></div>
                        <div style="display: flex; flex-direction: column; width: 100%; height: 100%;">
                            <div class="pmh-panel-header" id="pmh-panel-header">
                                <div class="pmh-panel-title"><i class="fas fa-toolbox"></i> <span id="pmh-panel-title-text"></span></div>
                                <a href="#" class="pmh-panel-close" id="pmh-panel-close"><i class="fas fa-times"></i></a>
                            </div>
                            <div class="pmh-panel-content" id="pmh-panel-content"></div>
                        </div>
                    `;
                    document.body.appendChild(panel);
                    document.getElementById('pmh-panel-close').onclick = (e) => { e.preventDefault(); e.stopPropagation(); panel.style.display = 'none'; };
                    window.makeDraggable(panel, document.getElementById('pmh-panel-header'));
                    window.makeResizable(panel);
                }
                
                panel.style.top = '80px'; panel.style.left = '60%'; panel.style.width = '450px'; panel.style.height = 'auto';
                const savedGeoStr = GM_getValue(`pmh_panel_geo_${toolId}`);
                if (savedGeoStr) {
                    try {
                        const geo = JSON.parse(savedGeoStr);
                        if (parseInt(geo.left) < window.innerWidth && parseInt(geo.top) < window.innerHeight) {
                            if (geo.top) panel.style.top = geo.top; if (geo.left) panel.style.left = geo.left;
                            if (geo.width) panel.style.width = geo.width; if (geo.height) panel.style.height = geo.height;
                        }
                    } catch(e) {}
                }
                document.getElementById('pmh-panel-title-text').innerText = title;
                document.getElementById('pmh-panel-content').innerHTML = htmlContent;
                panel.style.display = 'flex';
            };
        }

        const toolMenuBtn = document.createElement('a');
        toolMenuBtn.href = '#'; toolMenuBtn.id = 'pmh-tool-menu-btn';
        toolMenuBtn.style.cssText = "color:#adb5bd; font-size:15px; transition:0.2s; display:flex; align-items:center; justify-content:center; text-decoration:none;";
        toolMenuBtn.title = "PMH Toolbox";
        toolMenuBtn.innerHTML = '<i class="fas fa-toolbox"></i>';
        toolMenuBtn.addEventListener('mouseenter', () => { toolMenuBtn.style.color = '#e5a00d'; });
        toolMenuBtn.addEventListener('mouseleave', () => { toolMenuBtn.style.color = '#adb5bd'; });
        ctrl.appendChild(toolMenuBtn);

        let dropdown = document.getElementById('pmh-tool-dropdown');
        if (!dropdown) {
            dropdown = document.createElement('div'); dropdown.id = 'pmh-tool-dropdown'; document.body.appendChild(dropdown);
            document.addEventListener('click', (e) => {
                const currentToolBtn = document.getElementById('pmh-tool-menu-btn');
                if (dropdown.style.display === 'block') {
                    if (!dropdown.contains(e.target) && (!currentToolBtn || !currentToolBtn.contains(e.target))) dropdown.style.display = 'none';
                }
            });
        }

const fetchTools = () => {
            if(!AppSettings.SERVERS || AppSettings.SERVERS.length === 0) return;
            GM_xmlhttpRequest({
                method: "GET", url: `${AppSettings.SERVERS[0].pmhServerUrl}/api/tools`,
                headers: { "X-API-Key": AppSettings.SERVERS[0].plexMateApiKey },
                onload: (res) => {
                    let html = `
                        <div style="display:flex; justify-content:space-between; align-items:center; padding: 8px 15px; background:rgba(0,0,0,0.5); border-radius:6px 6px 0 0;">
                            <span style="font-size: 12px; color: #e5a00d; font-weight: bold;">PMH Toolbox</span>
                            <div style="display:flex; gap:12px; font-size:13px;">
                                <span id="pmh-tool-check-update-btn" class="pmh-action-icon" title="전체 툴 업데이트 확인" style="cursor:pointer; color:#aaa; transition:color 0.2s;" onmouseover="this.style.color='#2f96b4'" onmouseout="this.style.color='#aaa'">
                                    <i class="fas fa-cloud-download-alt"></i>
                                </span>
                                <span id="pmh-tool-install-btn" class="pmh-action-icon" title="신규 등록 (전체 서버에 설치)" style="cursor:pointer; color:#51a351; transition:0.2s;">
                                    <i class="fas fa-plus"></i>
                                </span>
                                <span id="pmh-tool-refresh-btn" class="pmh-action-icon" title="새로고침" style="cursor:pointer; color:#aaa; transition:0.2s;">
                                    <i class="fas fa-sync-alt"></i>
                                </span>
                            </div>
                        </div>
                        <div class="pmh-tool-divider" style="margin:0;"></div>
                    `;

                    if (res.status === 200) {
                        let toolsData = JSON.parse(res.responseText).tools;
                        if (!toolsData || toolsData.length === 0) {
                            html += `<div style="padding:20px 15px; text-align:center; color:#777; font-size:12px;">설치된 툴이 없습니다.</div>`;
                        } else {
                            toolsData.sort((a, b) => {
                                const nameA = (a.name || a.id || "").toLowerCase();
                                const nameB = (b.name || b.id || "").toLowerCase();
                                return nameA.localeCompare(nameB);
                            });
                            toolsData.forEach(tool => {
                                html += `
                                    <div class="pmh-tool-item" style="display:flex; justify-content:space-between; padding:10px 15px; border-bottom:1px solid #333;" data-id="${tool.id}" data-url="${tool.update_url || ''}" data-ver="${tool.version || '0.0'}">
                                        <div class="pmh-tool-run-btn" data-id="${tool.id}" style="display:flex; align-items:center; gap:8px; flex-grow:1; cursor:pointer;">
                                            <i class="${tool.icon || 'fas fa-wrench'}"></i><span>${tool.name || tool.id} <span style="color:#777; font-size:10px;">v${tool.version || '1.0'}</span></span>
                                        </div>
                                        <div style="display:flex; gap:10px; align-items:center;">
                                            <span class="pmh-tool-update-btn" data-id="${tool.id}" data-url="${tool.update_url || ''}" style="display:none; color:#51a351; font-size:11px; font-weight:bold; cursor:pointer; margin-left:8px;" title="클릭하여 업데이트 진행"></span>
                                            <i class="fas fa-trash-alt pmh-tool-delete-btn" data-id="${tool.id}" data-name="${tool.name || tool.id}" style="cursor:pointer; font-size:13px;" title="전체 서버에서 삭제"></i>
                                        </div>
                                    </div>`;
                            });
                        }
                    } else { html += `<div style="padding:20px 15px; text-align:center; color:#bd362f; font-size:12px;">툴 목록을 가져올 수 없습니다.</div>`; }
                    dropdown.innerHTML = html;
                },
                onerror: () => { dropdown.innerHTML = `<div style="padding:20px; color:#bd362f;">서버 통신 오류</div>`; }
            });
        };

        dropdown.onclick = async (e) => {
            if (e.target.closest('#pmh-tool-refresh-btn')) { e.preventDefault(); e.stopPropagation(); fetchTools(); return; }
            
            const updateCheckBtn = e.target.closest('#pmh-tool-check-update-btn');
            
            if (updateCheckBtn) {
                e.preventDefault(); e.stopPropagation();
                
                if (updateCheckBtn.innerHTML.includes('fa-spin')) {
                    infoLog("[Tool Update] 이미 업데이트 확인 작업이 진행 중입니다. 무시합니다.");
                    return;
                }
                
                updateCheckBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
                updateCheckBtn.style.color = '#2f96b4';
                
                infoLog("[Tool Update] 전체 툴 일괄 업데이트 확인을 시작합니다.");
                
                const toolItems = dropdown.querySelectorAll('.pmh-tool-item');
                let checkCount = 0;
                let updateAvailableCount = 0;
                let hasUrlToCheck = false;
                
                const startTime = Date.now();

                const finishCheck = () => {
                    const elapsedTime = Date.now() - startTime;
                    const minDelay = 500; 
                    
                    const doFinish = () => {
                        if (updateCheckBtn) {
                            updateCheckBtn.innerHTML = '<i class="fas fa-cloud-download-alt"></i>';
                            updateCheckBtn.style.color = '#aaa'; 
                        }
                        
                        if (updateAvailableCount > 0) {
                            infoLog(`[Tool Update] 업데이트 확인 완료. (발견된 업데이트: ${updateAvailableCount}개)`);
                            toastr.info(`${updateAvailableCount}개의 업데이트가 발견되었습니다.`);
                        } else {
                            infoLog(`[Tool Update] 업데이트 확인 완료. 모든 툴이 최신 버전입니다.`);
                            toastr.success("모든 툴이 최신 버전입니다.");
                        }
                    };

                    if (elapsedTime < minDelay) {
                        setTimeout(doFinish, minDelay - elapsedTime);
                    } else {
                        doFinish();
                    }
                };

                toolItems.forEach(item => {
                    const toolId = item.dataset.id;
                    const updateUrl = item.dataset.url;
                    const currentVer = item.dataset.ver;
                    const updateBtn = item.querySelector('.pmh-tool-update-btn');

                    if (updateUrl && updateUrl !== 'undefined') {
                        hasUrlToCheck = true;
                        checkCount++;
                        
                        GM_xmlhttpRequest({
                            method: "GET", url: `${updateUrl}?t=${Date.now()}`,
                            onload: (res) => {
                                if (res.status === 200) {
                                    const match = res.responseText.match(/version:\s*"([^"]+)"/);
                                    if (match) {
                                        const remoteVer = match[1];
                                        if (isNewerVersion(currentVer, remoteVer)) {
                                            infoLog(`[Tool Update] 💡 신규 업데이트 발견: [${toolId}] v${currentVer} -> v${remoteVer}`);
                                            updateBtn.style.display = 'inline-block';
                                            updateBtn.innerHTML = `<i class="fas fa-arrow-circle-up"></i> v${remoteVer}`;
                                            updateAvailableCount++;
                                        } else {
                                            updateBtn.style.display = 'none';
                                        }
                                    }
                                }
                                checkCount--;
                                if (checkCount === 0) finishCheck();
                            },
                            onerror: () => { 
                                checkCount--; 
                                if (checkCount === 0) finishCheck(); 
                            }
                        });
                    }
                });
                
                if (!hasUrlToCheck || checkCount === 0) {
                    finishCheck();
                }
                return;
            }

            const doUpdateBtn = e.target.closest('.pmh-tool-update-btn');
            if (doUpdateBtn) {
                e.preventDefault(); e.stopPropagation();
                if (doUpdateBtn.dataset.updating) return;
                
                const targetId = doUpdateBtn.dataset.id;
                const updateUrl = doUpdateBtn.dataset.url;
                doUpdateBtn.dataset.updating = "true";
                doUpdateBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> 설치 중...`;

                let successCount = 0;
                await Promise.all(AppSettings.SERVERS.map(srv => new Promise(res => {
                    GM_xmlhttpRequest({
                        method: "POST", url: `${srv.pmhServerUrl}/api/tools/install`,
                        headers: { "Content-Type": "application/json", "X-API-Key": srv.plexMateApiKey },
                        data: JSON.stringify({ url: updateUrl, target_id: targetId }), 
                        onload: (r) => { if(r.status === 200) successCount++; res(); }, onerror: () => res()
                    });
                })));
                
                if (successCount > 0) {
                    toastr.success(`전체 ${successCount}대 서버에 업데이트 완료!`);
                    fetchTools();
                } else {
                    toastr.error("업데이트에 실패했습니다.");
                    delete doUpdateBtn.dataset.updating;
                    doUpdateBtn.innerHTML = `<i class="fas fa-exclamation-triangle"></i> 오류`;
                }
                return;
            }

            if (e.target.closest('#pmh-tool-install-btn')) {
                e.preventDefault(); e.stopPropagation(); dropdown.style.display = 'none';
                window.showPmhToolPanel('installer', "새로운 툴 등록", `
                    <p style="font-size:13px; color:#aaa; margin-top:0;">설치할 툴의 <strong>GitHub 폴더 주소</strong>를 입력하세요.</p>
                    <input type="text" id="pmh-install-url" style="width:100%; padding:10px; background:#111; color:#fff; border:1px solid #444; margin-bottom:20px; border-radius:4px; font-size:12px;">
                    <div style="text-align:center;"><button id="pmh-do-install" style="padding:12px 30px; background:#51a351; color:#fff; border:none; font-weight:bold; cursor:pointer; border-radius:4px; font-size:14px;"><i class="fas fa-download"></i> 다운로드 및 설치</button></div>
                    <div id="pmh-install-msg" style="margin-top:20px; font-size:13px; text-align:center;"></div>
                `);
                setTimeout(() => {
                    const btn = document.getElementById('pmh-do-install');
                    if (btn) {
                        btn.onmouseover = () => btn.style.backgroundColor = "#3e823e";
                        btn.onmouseout = () => btn.style.backgroundColor = "#51a351";

                        btn.onclick = async (e) => {
                            e.preventDefault(); e.stopPropagation();
                            
                            let url = document.getElementById('pmh-install-url').value.trim();
                            if (!url) return;
                            
                            const msgDiv = document.getElementById('pmh-install-msg');
                            if (url.endsWith('/')) url = url.slice(0, -1);
                            
                            let namespace = ""; 
                            
                            const treeMatch = url.match(/^https?:\/\/github\.com\/([^\/]+)\/([^\/]+)\/tree\/([^\/]+)\/(.+)$/i);
                            if (treeMatch) { 
                                namespace = treeMatch[1]; 
                                url = `https://raw.githubusercontent.com/${treeMatch[1]}/${treeMatch[2]}/${treeMatch[3]}/${treeMatch[4]}/info.yaml`; 
                            }
                            else if (url.includes('github.com') && url.includes('/blob/')) { 
                                namespace = url.match(/github\.com\/([^\/]+)\//)?.[1] || ""; 
                                url = url.replace('github.com', 'raw.githubusercontent.com').replace('/blob/', '/'); 
                            }
                            else if (url.includes('raw.githubusercontent.com')) { 
                                namespace = url.match(/raw\.githubusercontent\.com\/([^\/]+)\//)?.[1] || ""; 
                            }
                            else {
                                try {
                                    const parsed = new URL(url);
                                    const hostParts = parsed.hostname.split('.');
                                    const host = hostParts.length > 1 ? hostParts[hostParts.length - 2] : hostParts[0];
                                    const pathUser = parsed.pathname.split('/')[1] || "custom";
                                    namespace = `${host}_${pathUser}`;
                                } catch(e) {
                                    namespace = "custom";
                                }
                            }

                            if (!url.endsWith('.yaml') && !url.endsWith('.yml')) {
                                url += '/info.yaml';
                            }
                            
                            namespace = namespace.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
                            
                            btn.style.pointerEvents = "none"; 
                            btn.style.opacity = "0.5";
                            msgDiv.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${AppSettings.SERVERS.length}대의 서버에 설치 중...`;
                            
                            let successCount = 0;
                            await Promise.all(AppSettings.SERVERS.map(srv => new Promise(res => {
                                GM_xmlhttpRequest({
                                    method: "POST", url: `${srv.pmhServerUrl}/api/tools/install`,
                                    headers: { "Content-Type": "application/json", "X-API-Key": srv.plexMateApiKey },
                                    data: JSON.stringify({ url: url, prefix: namespace }), 
                                    onload: (r) => { if(r.status === 200) successCount++; res(); }, 
                                    onerror: () => res()
                                });
                            })));
                            
                            btn.style.pointerEvents = "auto"; 
                            btn.style.opacity = "1";
                            if (successCount > 0) { 
                                msgDiv.innerHTML = `<span style="color:#51a351;"><i class="fas fa-check"></i> ${successCount}/${AppSettings.SERVERS.length}대 서버 설치 완료!</span>`; 
                                fetchTools();
                            } else { 
                                msgDiv.innerHTML = `<span style="color:#bd362f;"><i class="fas fa-times"></i> 설치 실패 (URL 및 서버 상태 확인)</span>`; 
                            }
                        };
                    }
                }, 50);
                return;
            }
            
            const delBtn = e.target.closest('.pmh-tool-delete-btn');
            if (delBtn) {
                e.preventDefault(); e.stopPropagation();
                if(confirm(`'${delBtn.dataset.name}' 툴을 삭제하시겠습니까?`)) {
                    GM_deleteValue(`pmh_tool_cache_${delBtn.dataset.id}`);
                    await Promise.all(AppSettings.SERVERS.map(srv => new Promise(res => {
                        GM_xmlhttpRequest({
                            method: "DELETE", url: `${srv.pmhServerUrl}/api/tools/${delBtn.dataset.id}`,
                            headers: { "X-API-Key": srv.plexMateApiKey }, onload: () => res(), onerror: () => res()
                        });
                    })));
                    fetchTools();
                }
                return;
            }
            
            const runBtn = e.target.closest('.pmh-tool-run-btn');
            if (runBtn) {
                e.preventDefault(); e.stopPropagation();
                dropdown.style.display = 'none';
                openPmhToolUI(runBtn.dataset.id); 
                return;
            }
        };

        toolMenuBtn.addEventListener('click', (e) => {
            e.preventDefault(); e.stopPropagation();
            if (dropdown.style.display !== 'block') {
                const rect = toolMenuBtn.getBoundingClientRect();
                
                dropdown.style.display = 'block';
                let leftPos = rect.left + (rect.width / 2) - (dropdown.offsetWidth / 2);
                if (leftPos + dropdown.offsetWidth > window.innerWidth - 10) {
                    leftPos = window.innerWidth - dropdown.offsetWidth - 10;
                }
                
                dropdown.style.top = `${rect.bottom + 10}px`;
                dropdown.style.left = `${leftPos}px`;
                dropdown.style.right = 'auto';
                
                dropdown.innerHTML = `
                    <div style="display:flex; justify-content:space-between; align-items:center; padding: 8px 15px; background:rgba(0,0,0,0.5); border-radius:6px 6px 0 0;">
                        <span style="font-size: 12px; color: #e5a00d; font-weight: bold;">PMH Toolbox</span>
                    </div>
                    <div class="pmh-tool-divider" style="margin:0;"></div>
                    <div style="padding:30px 15px; text-align:center; color:#aaa; font-size:13px;">
                        <i class="fas fa-spinner fa-spin" style="font-size:24px; color:#e5a00d; margin-bottom:12px;"></i><br>
                        서버에서 설치된 툴을 불러오고 있습니다...
                    </div>
                `;
                
                fetchTools(); 
            } else {
                dropdown.style.display = 'none';
            }
        });

        target.insertBefore(ctrl, target.firstChild);
        showStatusMsg(defaultMsg, defaultColor, 0);

        ctrl.addEventListener('click', async (e) => {
            const updateLinkBtn = e.target.closest('#pmh-unified-update-link');
            if (updateLinkBtn) {
                e.preventDefault(); e.stopPropagation();
                if (updateLinkBtn.dataset.updating) return;
                updateLinkBtn.dataset.updating = "true";
                const originalHtml = updateLinkBtn.innerHTML;
                updateLinkBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> 진행중...`;
                let serverSuccess = true;
                if (serversToUpdate.length > 0) serverSuccess = await triggerServerUpdate(showStatusMsg, serversToUpdate);
                if (serverSuccess) {
                    if (needsJsUpdate) {
                        showStatusMsg(`서버 완료! 스크립트를 업데이트합니다...`, '#51a351', 3000);
                        setTimeout(() => { window.open("https://raw.githubusercontent.com/golmog/plex_meta_helper/main/plex_meta_helper.user.js", "_blank"); }, 1500);
                    }
                    defaultMsg = ''; defaultColor = '#aaa';
                } else {
                    delete updateLinkBtn.dataset.updating; updateLinkBtn.innerHTML = originalHtml;
                }
                return;
            }
            const updateBtn = e.target.closest('#pmh-manual-update-btn');
            if (updateBtn) {
                e.preventDefault(); 
                e.stopPropagation();
                
                const realBtn = document.getElementById('pmh-manual-update-btn');
                if (!realBtn) return;
                
                const icon = realBtn.querySelector('.pmh-sync-icon');
                if (!icon || icon.classList.contains('fa-spin')) return;

                log("[UI] Manual update check button clicked.");
                icon.classList.add('fa-spin');
                showStatusMsg(`업데이트 확인 중...`, '#ccc', 0);

                const result = await fetchLatestVersion();
                const safeIcon = document.querySelector('#pmh-manual-update-btn .pmh-sync-icon');
                if (safeIcon) safeIcon.classList.remove('fa-spin');

                if (result.error) {
                    showStatusMsg(result.msg, '#bd362f', 4000);
                } else {
                    needsJsUpdate = isNewerVersion(CURRENT_VERSION, result.targetVer);
                    serversToUpdate = [];

                    if (AppSettings.SERVERS) {
                        for (const srv of AppSettings.SERVERS) {
                            const curVer = result.localPyVers[srv.machineIdentifier];
                            if (!curVer || isNewerVersion(curVer, result.targetVer)) {
                                serversToUpdate.push({...srv, targetVer: result.targetVer});
                            }
                        }
                    }

                    if (needsJsUpdate || serversToUpdate.length > 0) {
                        log(`[Update] Needs update. JS: ${needsJsUpdate}, Servers: ${serversToUpdate.length}`);
                        const btnText = result.reqRestart ? `업데이트(v${result.targetVer}): 서버 재시작 필요` : `업데이트(v${result.targetVer})`;
                        defaultMsg = `<a href="#" id="pmh-unified-update-link" data-ver="${result.targetVer}" style="color:#e5a00d; text-decoration:none;" title="클릭 시 전체 업데이트 진행">${btnText}</a>`;
                        defaultColor = '#e5a00d';
                        showStatusMsg(`업데이트 발견!`, '#e5a00d', 3000);
                    } else {
                        defaultMsg = '';
                        defaultColor = '#aaa';
                        showStatusMsg(`최신 버전입니다 (v${CURRENT_VERSION})`, '#51a351', 3000);
                    }
                }
            }
        });
    }

    // ==========================================
    // 6. 목록 모드 (List View) 처리
    // ==========================================
    function getItemStateHash(cont) {
        let hashParts = [];

        const posterLink = cont.querySelector('[aria-label]');
        if (posterLink) {
            const label = posterLink.getAttribute('aria-label').trim();
            if (label) hashParts.push(label);
        }

        const textNodes = cont.querySelectorAll('[class*="MetadataPosterCardTitle"], [data-testid="metadataTitleLink"]');
        textNodes.forEach(node => {
            const text = node.textContent.trim();
            if (text && !hashParts.includes(text)) hashParts.push(text);
        });

        const img = cont.querySelector('img[src*="/thumb/"], img[src*="/art/"]');
        if (img) {
            const match = img.src.match(/\/(?:thumb|art)\/(\d+)/);
            if (match) hashParts.push(match[1]);
        }

        const overlayText = cont.querySelector('[class*="MetadataPosterCardOverlay"], [class*="ProgressBar"]');
        if (overlayText && overlayText.textContent.trim()) {
            hashParts.push(overlayText.textContent.trim());
        }

        return hashParts.join('|');
    }

    function renderListBadges(cont, poster, link, info, srvConfig, id) {
        poster.querySelector('.pmh-render-marker')?.remove();
        poster.querySelector('.pmh-top-right-wrapper')?.remove();
        cont.querySelectorAll('.plex-guid-list-box, .pmh-guid-wrapper').forEach(el => el.remove());

        const currentStateHash = getItemStateHash(cont);
        const marker = document.createElement('div');
        marker.className = 'pmh-render-marker';
        marker.style.display = 'none';
        marker.setAttribute('data-iid', id);
        if (currentStateHash) marker.setAttribute('data-state-hash', currentStateHash);
        poster.appendChild(marker);

        let wrapper = null;
        if (state.listTag || state.listPlay) {
            wrapper = document.createElement('div');
            wrapper.className = 'pmh-top-right-wrapper pmh-fade-update';

            const existingPlexBadge = poster.querySelector('[class*="Badge-topRightBadge-"], [class*="PlayStateBadge-topRightBadge-"]');
            if (existingPlexBadge) {
                wrapper.style.top = '34px';
            }

            poster.appendChild(wrapper);
        }

        if (info.is_friend_pending) {
            const fetchBtn = document.createElement('div');
            fetchBtn.className = 'plex-list-res-tag friend-fetch-btn';
            fetchBtn.innerHTML = '<i class="fas fa-sync-alt"></i>';
            fetchBtn.title = '클릭하여 정보 불러오기';

            fetchBtn.addEventListener('click', async (e) => {
                e.preventDefault(); e.stopPropagation();
                if (fetchBtn.dataset.fetching) return;

                fetchBtn.dataset.fetching = 'true';
                fetchBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

                const targetServerId = link.getAttribute('href').match(/\/server\/([a-f0-9]+)\//)?.[1];
                const plexSrv = extractPlexServerInfo(targetServerId);
                infoLog(`[List] Friend server info fetch requested. (Server: ${targetServerId}, Item: ${id})`);

                if (plexSrv) {
                    try {
                        const meta = await fetchPlexMetaFallback(id, plexSrv);
                        if (meta) {
                            const localData = convertPlexMetaToLocalData(meta, id);
                            setMemoryCache(`F_${targetServerId}_${id}`, localData);
                            renderListBadges(cont, poster, link, localData, srvConfig, id);
                        } else {
                            fetchBtn.innerHTML = '<i class="fas fa-times" style="color:red;"></i>';
                        }
                    } catch(err) { fetchBtn.innerHTML = '<i class="fas fa-times" style="color:red;"></i>'; }
                }
            });
            wrapper.appendChild(fetchBtn);
            return;
        }

        if (state.listTag && info.tags && info.tags.length > 0) {
            info.tags.forEach(tagText => {
                const t = document.createElement('div');
                t.className = 'plex-list-res-tag';
                t.textContent = tagText;
                wrapper.appendChild(t);
            });
        }

        if (state.listPlay) {
            if (srvConfig && info.p) {
                const lPath = encodeURIComponent(getLocalPath(info.p).replace(/\\/g, '/')).replace(/\(/g, '%28').replace(/\)/g, '%29');
                const pBtn = document.createElement('a');
                pBtn.href = `plexplay://${lPath}`;
                pBtn.className = 'plex-list-play-external';
                pBtn.title = '로컬재생';
                pBtn.innerHTML = '<i class="fas fa-play"></i>';

                pBtn.addEventListener('click', (e) => {
                    e.preventDefault(); e.stopPropagation();
                    infoLog(`[List] Local protocol (plexplay://) invoked for path: ${info.p}`);
                    toastr.info('로컬재생 호출 중...');
                    window.location.assign(pBtn.href);
                });
                wrapper.appendChild(pBtn);
            }

            if (info.part_id) {
                const targetServerId = srvConfig ? srvConfig.machineIdentifier : link.getAttribute('href').match(/\/server\/([a-f0-9]+)\//)?.[1];
                const plexSrv = extractPlexServerInfo(targetServerId);

                if (plexSrv) {
                    const vUrl = `${plexSrv.url}/library/parts/${info.part_id}/0/file?X-Plex-Token=${plexSrv.token}&ratingKey=${id}`;

                    let justFileName = "Unknown_Video.mp4";
                    if (info.p) {
                        const pathParts = info.p.split(/[\\/]/);
                        justFileName = pathParts[pathParts.length - 1];
                    }

                    let sUrl = '';
                    if (info.sub_url && info.sub_url.trim() !== '') {
                        if (info.sub_url.startsWith('/library/streams/')) {
                            sUrl = `${plexSrv.url}${info.sub_url}?X-Plex-Token=${plexSrv.token}`;
                        } else {
                            sUrl = `${plexSrv.url}/library/streams/${info.sub_id}?X-Plex-Token=${plexSrv.token}`;
                        }
                    }

                    const streamPayload = encodeURIComponent(vUrl) + '%7C' + encodeURIComponent(sUrl) + '%7C' + encodeURIComponent(justFileName);

                    const sBtn = document.createElement('a');
                    sBtn.href = `plexstream://${streamPayload}`;
                    sBtn.className = 'plex-list-play-external plex-list-stream-btn';
                    sBtn.title = '스트리밍';
                    sBtn.innerHTML = '<i class="fas fa-wifi"></i>';

                    sBtn.addEventListener('click', (e) => {
                        e.preventDefault(); e.stopPropagation();
                        infoLog(`[List] Streaming protocol (plexstream://) invoked for part: ${info.part_id}`);
                        toastr.info('스트리밍 호출 중...');
                        window.location.assign(sBtn.href);
                    });
                    wrapper.appendChild(sBtn);
                }
            }
        }

        if (state.listGuid) {
            const isWide = poster.clientWidth > 200;
            const currentLen = isWide ? state.guidLen * 2 : state.guidLen;
            
            let short = '';
            let isUnmatched = false;

            const gBoxWrapper = document.createElement('div');
            gBoxWrapper.className = 'pmh-guid-wrapper pmh-fade-update';
            gBoxWrapper.style.cssText = "display: block; margin-top: 1px; line-height: 1.2;";
            
            if (state.listMultiPath && info.path_count && info.path_count > 1) {
                const pathBadge = document.createElement('span');
                pathBadge.className = 'plex-list-multipath-badge';
                pathBadge.textContent = `${info.path_count}`;
                pathBadge.title = `최상위 경로가 서로 다른 ${info.path_count}개의 쇼가 병합된 것으로 의심됩니다.`;
                gBoxWrapper.appendChild(pathBadge);
            }

            const gBox = document.createElement('span');
            gBox.className = 'plex-guid-list-box';
            gBox.style.cssText = "font-size: 11px; font-weight: normal; cursor: pointer; display: inline-block; vertical-align: top;";

            if (info.g) {
                short = info.g.length > currentLen ? info.g.substring(0, currentLen) + '...' : info.g;
                gBox.textContent = short;
                gBox.title = `${info.g} : 클릭 시 갱신`;

                const rawG = (info.raw_g || info.g || '').toLowerCase();

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

                if (isUnmatched) gBox.style.color = '#a68241';
            } else {
                gBox.innerHTML = `<i class="fas fa-spinner fa-spin" style="margin-right:4px;"></i>로딩 중...`;
                gBox.style.color = '#adb5bd';
                
                gBox.title = '클릭 시 데이터 다시 불러오기 (8초 후 자동 시도)'; 
                gBox.style.cursor = 'pointer'; 

                setTimeout(() => {
                    if (gBox.isConnected && gBox.dataset.refreshing !== 'true' && gBox.innerHTML.includes('로딩 중')) {
                        infoLog(`[List] 'Loading...' timeout reached for ID: ${id}. Re-fetching from DB...`);
                        gBox.click();
                    }
                }, 8000);
            }

            let abortPolling = false;
            gBox.addEventListener('click', async (e) => {
                e.preventDefault(); e.stopPropagation();

                if (gBox.dataset.refreshing === 'true') {
                    if (gBox.textContent.includes('갱신중') || gBox.textContent.includes('불러오는')) {
                        abortPolling = true;
                        gBox.innerHTML = '<i class="fas fa-times"></i> 취소됨';
                        gBox.title = "";
                        setTimeout(() => {
                            if (gBox.isConnected) {
                                if (info.g) {
                                    gBox.textContent = short;
                                    gBox.title = `${info.g} : 클릭 시 재조회`;
                                    gBox.style.color = isUnmatched ? '#a68241' : '#e5a00d';
                                } else {
                                    gBox.innerHTML = `<i class="fas fa-redo" style="margin-right:4px;"></i>재시도`;
                                    gBox.title = `클릭 시 데이터 다시 불러오기`;
                                    gBox.style.color = '#adb5bd';
                                }
                                delete gBox.dataset.refreshing;
                            }
                        }, 1500);
                    }
                    return;
                }

                abortPolling = false;
                gBox.dataset.refreshing = 'true';
                
                const originHTML = gBox.innerHTML; 
                gBox.style.color = '#ccc';

                const targetServerId = srvConfig ? srvConfig.machineIdentifier : link.getAttribute('href').match(/\/server\/([a-f0-9]+)\//)?.[1];
                const plexSrv = targetServerId ? extractPlexServerInfo(targetServerId) : null;

                if (srvConfig && plexSrv && !info.g) {
                    gBox.title = '클릭 시 취소';
                    gBox.innerHTML = `<i class="fas fa-spinner fa-spin" style="margin-right:4px;"></i>로딩 중...`;

                    try {
                        const meta = await fetchPlexMetaFallback(id, plexSrv);
                        if (abortPolling) return;

                        if (meta) {
                            const localData = convertPlexMetaToLocalData(meta, id);
                            
                            let existingCache = getMemoryCache(`L_${targetServerId}_${id}`);
                            if (existingCache) {
                                localData.analyze_count = existingCache.analyze_count || 0;
                                localData.last_analyze_time = existingCache.last_analyze_time || 0;
                                localData.corrupt_logged = existingCache.corrupt_logged || false;
                            }
                            
                            setMemoryCache(`L_${targetServerId}_${id}`, localData);
                            sessionRevalidated.add(id);
                            
                            const displayData = { ...localData, tags: applyUserTags(localData.p, localData.tags) };
                            renderListBadges(cont, poster, link, displayData, srvConfig, id);
                        } else {
                            throw new Error("No API Data");
                        }
                    } catch (err) {
                        if (gBox.isConnected && !abortPolling) {
                            gBox.innerHTML = '<i class="fas fa-exclamation-circle"></i> 로드 실패';
                            gBox.style.color = 'red';
                            setTimeout(() => {
                                if (gBox.isConnected) {
                                    gBox.innerHTML = originHTML;
                                    gBox.style.color = '#adb5bd';
                                    delete gBox.dataset.refreshing;
                                }
                            }, 2000);
                        }
                    }
                    return;
                }

                if (srvConfig && !isUnmatched && info.g) {
                    infoLog(`[List] Metadata refresh requested to PMH DB for matched Item: ${id}`);
                    gBox.title = '클릭 시 취소';
                    gBox.innerHTML = `<i class="fas fa-spinner fa-spin" style="margin-right:4px;"></i>DB 갱신중...`;

                    triggerPlexMetadataRefresh(id, plexSrv);
                    toastr.info("Plex 서버에 메타 갱신을 요청했습니다.<br>작업은 백그라운드에서 진행됩니다.", "메타 갱신 요청", {timeOut: 3000});

                    try {
                        const dbData = await makeRequest(
                            `${srvConfig.pmhServerUrl}/api/library/batch`, 
                            'POST', 
                            { ids: [id], check_multi_path: state.listMultiPath }, 
                            srvConfig.plexMateApiKey
                        );
                        
                        if (abortPolling) return;

                        if (dbData[id]) {
                            setMemoryCache(`L_${targetServerId}_${id}`, dbData[id]);
                            sessionRevalidated.add(id);
                            const displayData = { ...dbData[id], tags: applyUserTags(dbData[id].p, dbData[id].tags) };
                            renderListBadges(cont, poster, link, displayData, srvConfig, id);
                        } else {
                            throw new Error("No data");
                        }
                    } catch (err) {
                        if (gBox.isConnected && !abortPolling) {
                            gBox.innerHTML = '<i class="fas fa-exclamation-circle"></i> 갱신 실패';
                            gBox.style.color = 'red';
                            setTimeout(() => {
                                if (gBox.isConnected) renderListBadges(cont, poster, link, info, srvConfig, id);
                            }, 2000);
                        }
                    }
                    return;
                }

                if (srvConfig && plexSrv && (isUnmatched || !info.g)) {
                    infoLog(`[List] Metadata refresh requested to Plex API (Polling) for unmatched/loading Item: ${id}`);
                    gBox.title = '클릭 시 취소';
                    gBox.innerHTML = `<i class="fas fa-spinner fa-spin" style="margin-right:4px;"></i>메타 갱신중...`;

                    const initialMeta = await fetchPlexMetaFallback(id, plexSrv);
                    const initialUpdated = initialMeta && initialMeta.updatedAt ? initialMeta.updatedAt : 0;

                    await triggerPlexMetadataRefresh(id, plexSrv);

                    let pollSuccess = false;
                    let finalMeta = null; 

                    for (let attempt = 1; attempt <= 20; attempt++) {
                        if (abortPolling || !gBox.isConnected) return;
                        const tempMeta = await fetchPlexMetaFallback(id, plexSrv);

                        if (tempMeta) {
                            const tempUpdated = tempMeta.updatedAt || 0;
                            const tempGuid = (tempMeta.guid || '').toLowerCase();
                            const isNowMatched = !tempGuid.includes('local://') && !tempGuid.includes('none://') && tempGuid !== '-' && tempGuid !== '';

                            if (tempUpdated !== initialUpdated || isNowMatched) {
                                pollSuccess = true;
                                finalMeta = tempMeta; 
                                break;
                            }
                        }
                        await new Promise(r => setTimeout(r, 2500));
                    }

                    if (!pollSuccess && !abortPolling) {
                        toastr.warning("응답 지연으로 대기를 종료합니다.<br>현재 상태로 UI를 갱신합니다.", "시간 초과", {timeOut: 4000});
                    }

                    if (abortPolling) return;

                    if (finalMeta) {
                        try {
                            const localData = convertPlexMetaToLocalData(finalMeta, id);
                            setMemoryCache(`L_${targetServerId}_${id}`, localData);
                            sessionRevalidated.add(id); 
                            
                            renderListBadges(cont, poster, link, localData, srvConfig, id);
                            return; 
                        } catch (e) {
                            errorLog(`[List] Error converting finalized meta for ID: ${id}`, e);
                        }
                    }

                    gBox.innerHTML = '<i class="fas fa-exclamation-circle"></i> 갱신 실패';
                    gBox.style.color = 'red';
                    setTimeout(() => {
                        if (gBox.isConnected) {
                            gBox.innerHTML = originHTML;
                            gBox.title = info.g ? `${info.g} : 클릭 시 재조회` : `클릭 시 강제 새로고침`;
                            gBox.style.color = info.g ? '#a68241' : '#adb5bd';
                            delete gBox.dataset.refreshing;
                        }
                    }, 2000);
                }
            });

            gBoxWrapper.appendChild(gBox);
            cont.appendChild(gBoxWrapper);

            cont.style.setProperty('overflow', 'visible', 'important');

            let horizontalScroller = cont.closest('[class*="Scroller-horizontal"], [class*="HorizontalList-"]');
            if (horizontalScroller) {
                horizontalScroller.style.setProperty('overflow-y', 'hidden', 'important');
                horizontalScroller.style.setProperty('padding-bottom', '15px', 'important');
            }
        }
    }

    async function processList() {
        if (!state.listGuid && !state.listTag && !state.listPlay && !state.listMultiPath) return;

        const itemWrappers = document.querySelectorAll(`
            div[data-testid^="cellItem"],
            div[class*="ListItem-container"],
            div[class*="MetadataPosterCard-container"]
        `);

        if (itemWrappers.length === 0) return;

        const session = currentRenderSession;
        const pendingItems = [];
        const itemsToRevalidate = [];
        const changedItems = new Set();

        itemWrappers.forEach(cont => {
            let link = cont.querySelector('a.PosterCardLink-link-LozvMm, a[data-testid="metadataTitleLink"]');
            
            if (!link) {
                const fallbackLinks = cont.querySelectorAll('a[href*="/metadata/"]');
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

            if (isIgnoredItem(href, iid)) return;
            if (!sid || !iid) return;

            itemsToRevalidate.push({ sid, iid, cont, link });

            const currentStateHash = getItemStateHash(cont);
            const marker = cont.querySelector('.pmh-render-marker');
            let isAlreadyRendered = false;
            
            if (marker && marker.getAttribute('data-iid') === iid) {
                const markerHash = marker.getAttribute('data-state-hash');
                
                if (markerHash && currentStateHash && markerHash !== currentStateHash) {
                    log(`[List] UI State changed for ID: ${iid}. Forcing re-validation (preserving UI).`);
                    changedItems.add(iid); 
                    sessionRevalidated.delete(iid);
                    marker.setAttribute('data-state-hash', currentStateHash);
                    isAlreadyRendered = false;
                } else {
                    const isIgnored = marker.getAttribute('data-ignored') === 'true';
                    if (isIgnored) {
                        isAlreadyRendered = true;
                    } else {
                        let badgeMissing = false;
                        if ((state.listTag || state.listPlay) && !cont.querySelector('.pmh-top-right-wrapper')) badgeMissing = true;
                        if ((state.listGuid || state.listMultiPath) && !cont.querySelector('.pmh-guid-wrapper')) badgeMissing = true;
                        if (!badgeMissing) isAlreadyRendered = true;
                    }
                }
            }

            if (isAlreadyRendered) return;

            let poster = cont.querySelector(`[class*="PosterCard-card-"], [class*="MetadataSimplePosterCard-card-"], [class*="ThumbCard-card-"], [class*="Card-card-"], [class*="ThumbCard-imageContainer"], [data-testid="metadata-poster"]`);
            if (!poster) {
                const img = cont.querySelector('img[src*="/photo/"]');
                if (img) poster = img.closest('[class*="card"], [class*="container"], [class*="imageContainer"]') || img.parentElement;
            }
            if (!poster && cont.classList.contains('ListItem-container')) poster = cont.firstElementChild;

            if (poster) {
                const style = window.getComputedStyle(poster);
                if (style.position === 'static') { poster.style.position = 'relative'; poster.style.overflow = 'hidden'; }
                pendingItems.push({ sid, iid, cont, poster, link, currentStateHash });
            }
        });

        if (globalFallbackQueue.length > 0) {
            infoLog(`[Queue] Screen changed. Nuking old queue (${globalFallbackQueue.length} items).`);
            globalFallbackQueue.length = 0;
        }

        if (pendingItems.length === 0 && itemsToRevalidate.length === 0) return;

        let instantRenderCount = 0;
        pendingItems.forEach(item => {
            const srvConfig = getServerConfig(item.sid);
            const cacheKey = srvConfig ? `L_${item.sid}_${item.iid}` : `F_${item.sid}_${item.iid}`;
            const cData = getMemoryCache(cacheKey);

            if (cData) {
                if (cData.saved_state_hash && item.currentStateHash && cData.saved_state_hash !== item.currentStateHash) {
                    changedItems.add(item.iid);
                    
                    let displayData = { ...cData, tags: applyUserTags(cData.p, cData.tags) };
                    renderListBadges(item.cont, item.poster, item.link, displayData, srvConfig, item.iid);
                    item.isRendered = true; 

                    cData.saved_state_hash = item.currentStateHash;
                    setMemoryCache(cacheKey, cData);
                    sessionRevalidated.delete(item.iid);
                    return; 
                }

                if (cData.ignored) {
                    let marker = item.poster.querySelector('.pmh-render-marker');
                    if (!marker) {
                        marker = document.createElement('div');
                        marker.className = 'pmh-render-marker';
                        marker.style.display = 'none';
                        item.poster.appendChild(marker);
                    }
                    marker.setAttribute('data-iid', item.iid);
                    marker.setAttribute('data-ignored', 'true');
                    if (item.currentStateHash) marker.setAttribute('data-state-hash', item.currentStateHash);
                    item.isRendered = true;
                    return;
                }
                
                if (!cData.saved_state_hash && item.currentStateHash) {
                    cData.saved_state_hash = item.currentStateHash;
                    setMemoryCache(cacheKey, cData);
                }

                let displayData = { ...cData, tags: applyUserTags(cData.p, cData.tags) };
                renderListBadges(item.cont, item.poster, item.link, displayData, srvConfig, item.iid);
                item.isRendered = true;
                instantRenderCount++;
            }
        });

        if (instantRenderCount > 0) log(`[List] Fast rendered ${instantRenderCount} items from memory cache.`);

        if (swrDebounceTimer) clearTimeout(swrDebounceTimer);

        swrDebounceTimer = setTimeout(async () => {
            if (session !== currentRenderSession) return;

            if (changedItems.size > 0) {
                log(`[List] Metadata change detected! Pausing 500ms to allow Plex DB to sync...`);
                await new Promise(r => setTimeout(r, 500));
                if (session !== currentRenderSession) return;
            }

            const revalServerMap = {};
            itemsToRevalidate.forEach(item => {
                if (!revalServerMap[item.sid]) revalServerMap[item.sid] = new Set();
                revalServerMap[item.sid].add(item.iid);
            });

            for (const [serverId, idSet] of Object.entries(revalServerMap)) {
                if (session !== currentRenderSession) break;

                const plexSrv = extractPlexServerInfo(serverId);
                if (!plexSrv) continue;
                const srvConfig = getServerConfig(serverId);

                if (!srvConfig) {
                    pendingItems.filter(p => p.sid === serverId).forEach(item => {
                        const cacheKey = `F_${serverId}_${item.iid}`;
                        if (!getMemoryCache(cacheKey) && !item.isRendered) {
                            renderListBadges(item.cont, item.poster, item.link, { is_friend_pending: true }, srvConfig, item.iid);
                            item.isRendered = true;
                        }
                    });
                    continue;
                }

                const idsToFetch = [];
                idSet.forEach(id => {
                    if (!sessionRevalidated.has(id)) {
                        idsToFetch.push(id);
                    }
                });

                let fetchedDbData = {};

                if (idsToFetch.length > 0) {
                    try {
                        fetchedDbData = await makeRequest(
                            `${srvConfig.pmhServerUrl}/api/library/batch`, 
                            'POST', 
                            { ids: idsToFetch, check_multi_path: state.listMultiPath }, 
                            srvConfig.plexMateApiKey
                        );

                        idsToFetch.forEach(id => {
                            sessionRevalidated.add(id);
                            const oldCache = getMemoryCache(`L_${serverId}_${id}`);
                            const newData = fetchedDbData[id] || { ignored: true };
                            
                            const matchingItem = itemsToRevalidate.find(p => p.iid === id);
                            if (matchingItem && matchingItem.currentStateHash) {
                                newData.saved_state_hash = matchingItem.currentStateHash;
                            }
                            
                            if (oldCache) {
                                newData.analyze_count = oldCache.analyze_count || 0;
                                newData.last_analyze_time = oldCache.last_analyze_time || 0;
                                newData.corrupt_logged = oldCache.corrupt_logged || false;
                                newData.last_cooldown_log = oldCache.last_cooldown_log || 0;
                                newData.saved_title = oldCache.saved_title || '';
                            }
                            
                            if (!oldCache || JSON.stringify(oldCache) !== JSON.stringify(newData)) {
                                setMemoryCache(`L_${serverId}_${id}`, newData);
                                pendingItems.filter(p => p.sid === serverId && p.iid === id).forEach(item => {
                                    item.poster.querySelector('.pmh-render-marker')?.remove();
                                });
                            } else {
                                setMemoryCache(`L_${serverId}_${id}`, oldCache);
                            }
                        });
                    } catch (e) {}
                }

                if (session !== currentRenderSession) return;

                const addedToNewQueue = new Set();
                let queueCount = 0;

                itemsToRevalidate.filter(p => p.sid === serverId).forEach(item => {
                    const cacheKey = `L_${serverId}_${item.iid}`;
                    const info = getMemoryCache(cacheKey);
                    if (!info || info.ignored) return;

                    const pItem = pendingItems.find(p => p.iid === item.iid);
                    if (pItem && (!pItem.isRendered || changedItems.has(item.iid))) {
                        let displayData = { ...info, tags: applyUserTags(info.p, info.tags) };
                        renderListBadges(item.cont, pItem.poster, item.link, displayData, srvConfig, item.iid);
                        pItem.isRendered = true;
                    }

                    const hasResBadge = info.tags.some(t => /8K|6K|4K|FHD|HD|SD/.test(t));
                    const isVideo = !!info.part_id; 
                    const analyzeCount = info.analyze_count || 0;
                    const lastAnalyzeTime = info.last_analyze_time || 0;
                    const now = Date.now();
                    const isCoolingDown = (now - lastAnalyzeTime < 10000);
                    const isCorrupt = (analyzeCount >= 3);
                    const isUnanalyzed = (state.listTag && !hasResBadge && isVideo && !isCorrupt && !isCoolingDown);
                    const rawG = (info.raw_g || '').toLowerCase();
                    const isDummyGuid = !rawG || rawG === '-' || rawG.includes('local://') || rawG.includes('none://');
                    const oldGuidAttr = item.cont.querySelector('.plex-guid-list-box')?.getAttribute('title') || '';
                    const dbStillNotSynced = changedItems.has(item.iid) && (isDummyGuid || oldGuidAttr.includes(info.g));

                    let logTitle = "Unknown Title";
                    if (item.currentStateHash) {
                        const hashParts = item.currentStateHash.split('|');
                        logTitle = hashParts.find(p => p && isNaN(p)) || "Unknown Title";
                    }
                    if (logTitle === "Unknown Title" && item.link) {
                        logTitle = item.link.getAttribute('aria-label') || item.link.title || item.link.textContent.trim() || "Unknown Title";
                    }

                    if (state.listTag && !hasResBadge && isVideo && !isCorrupt && isCoolingDown) {
                        if (info.last_cooldown_log !== analyzeCount) {
                            const timeLeft = ((10000 - (now - lastAnalyzeTime)) / 1000).toFixed(1);
                            infoLog(`[Analyze] ⏳ Cooldown active for [${logTitle}] (ID: ${item.iid}). Waiting ${timeLeft}s before Attempt ${analyzeCount + 1}/3...`);
                            
                            let tempCache = getMemoryCache(`L_${serverId}_${item.iid}`);
                            if (tempCache) {
                                tempCache.last_cooldown_log = analyzeCount;
                                setMemoryCache(`L_${serverId}_${item.iid}`, tempCache);
                            }
                        }
                    }

                    if (!hasResBadge && isVideo && isCorrupt && !isCoolingDown) {
                        const existingBadge = item.cont.querySelector('.pmh-corrupt-badge');
                        if (!existingBadge) {
                            const wrapper = item.cont.querySelector('.pmh-top-right-wrapper');
                            if (wrapper) {
                                const errBadge = document.createElement('div');
                                errBadge.className = 'plex-list-res-tag pmh-corrupt-badge'; 
                                errBadge.textContent = '?';
                                errBadge.title = '파일 분석 3회 실패 (손상 의심)';
                                wrapper.insertBefore(errBadge, wrapper.firstChild);
                                
                                let tempCache = getMemoryCache(`L_${serverId}_${item.iid}`);
                                if (tempCache && !tempCache.corrupt_logged) {
                                    warnLog(`[Analyze-Failed] ⚠️ Analysis failed 3 times for [${logTitle}] (ID: ${item.iid}). Marked as Corrupt.`);
                                    tempCache.corrupt_logged = true;
                                    setMemoryCache(`L_${serverId}_${item.iid}`, tempCache);
                                }
                            }
                        }
                    }

                    if ((isUnanalyzed || dbStillNotSynced) && info.p && !addedToNewQueue.has(item.iid)) {
                        addedToNewQueue.add(item.iid);
                        queueCount++;

                        globalFallbackQueue.push({
                            id: item.iid,
                            session: session,
                            task: async () => {
                                if (session !== currentRenderSession) return;

                                const latestCache = getMemoryCache(`L_${serverId}_${item.iid}`);
                                const alreadyHasRes = latestCache && latestCache.tags.some(t => /8K|6K|4K|FHD|HD|SD/.test(t));
                                
                                if (!dbStillNotSynced && latestCache && alreadyHasRes) return;

                                try {
                                    if (dbStillNotSynced) {
                                        log(`[Fallback] DB not synced yet for [${logTitle}] (ID: ${item.iid}). Calling Plex API...`);
                                    } else {
                                        infoLog(`[Analyze] Missing resolution tag for [${logTitle}] (ID: ${item.iid}) (Attempt ${analyzeCount + 1}/3). Calling Plex API...`);
                                    }

                                    let meta = await fetchPlexMetaFallback(item.iid, plexSrv);
                                    if (!meta) return;

                                    let fallbackTags = parsePlexFallbackTags(meta);
                                    const m = meta.Media && meta.Media[0] ? meta.Media[0] : null;

                                    let currentAnalyzeCount = latestCache ? (latestCache.analyze_count || 0) : analyzeCount;
                                    let currentAnalyzeTime = latestCache ? (latestCache.last_analyze_time || 0) : lastAnalyzeTime;

                                    if (!m || ((!m.width || m.width === 0) && !m.videoResolution)) {
                                        currentAnalyzeCount += 1;
                                        currentAnalyzeTime = Date.now(); 
                                        
                                        meta = await analyzeAndFetchPlexMeta(item.iid, plexSrv);
                                        if (meta) fallbackTags = parsePlexFallbackTags(meta);
                                    }

                                    let updatedInfo = { 
                                        g: info.g, raw_g: info.raw_g, p: info.p, tags: [...info.tags], 
                                        part_id: info.part_id, sub_id: info.sub_id, sub_url: info.sub_url, path_count: info.path_count,
                                        analyze_count: currentAnalyzeCount,
                                        last_analyze_time: currentAnalyzeTime,
                                        corrupt_logged: latestCache ? latestCache.corrupt_logged : false,
                                        last_cooldown_log: latestCache ? latestCache.last_cooldown_log : 0
                                    };
                                    let needsUpdate = false;
                                    
                                    if (isUnanalyzed) needsUpdate = true;

                                    if (dbStillNotSynced && meta && meta.guid && meta.guid !== updatedInfo.raw_g) {
                                        updatedInfo.g = meta.guid.split('://')[1]?.split('?')[0] || meta.guid;
                                        updatedInfo.raw_g = meta.guid;
                                        needsUpdate = true;
                                    }
                                    
                                    if (dbStillNotSynced) needsUpdate = true;

                                    const newlyHasRes = fallbackTags.some(t => /8K|6K|4K|FHD|HD|SD/.test(t));
                                    if (newlyHasRes) {
                                        updatedInfo.analyze_count = 0;
                                        updatedInfo.last_analyze_time = 0;
                                        updatedInfo.corrupt_logged = false;
                                    }

                                    if (fallbackTags.length > 0) {
                                        if (!hasResBadge || dbStillNotSynced) {
                                            updatedInfo.tags = Array.from(new Set([...fallbackTags, ...updatedInfo.tags]));
                                            needsUpdate = true;
                                        } 
                                        if (fallbackTags.includes("SUB") && !updatedInfo.tags.includes("SUB")) {
                                            updatedInfo.tags.push("SUB");
                                            needsUpdate = true;
                                        }
                                    }

                                    if (meta && meta.Media && meta.Media.length > 0) {
                                        const topMedia = meta.Media.sort((a, b) => (b.width || 0) - (a.width || 0))[0];
                                        if (topMedia.Part && topMedia.Part[0] && topMedia.Part[0].Stream) {
                                            const korSubs = topMedia.Part[0].Stream.filter(s => s.streamType === 3 && (s.languageCode === 'kor' || s.languageCode === 'ko'));
                                            if (korSubs.length > 0) {
                                                korSubs.sort((a, b) => {
                                                    let sA = 0, sB = 0;
                                                    if(a.key && a.key.trim() !== '') sA+=100; if(['srt','ass','smi','vtt','ssa','sub','sup'].includes(a.codec)) sA+=50;
                                                    if(b.key && b.key.trim() !== '') sB+=100; if(['srt','ass','smi','vtt','ssa','sub','sup'].includes(b.codec)) sB+=50;
                                                    return sB - sA;
                                                });
                                                if (korSubs[0].key && korSubs[0].key !== updatedInfo.sub_url) {
                                                    updatedInfo.sub_id = korSubs[0].id;
                                                    updatedInfo.sub_url = korSubs[0].key;
                                                    needsUpdate = true;
                                                }
                                            }
                                        }
                                    }

                                    const stateItem = itemsToRevalidate.find(p => p.iid === item.iid);
                                    if (stateItem && stateItem.currentStateHash) {
                                        updatedInfo.saved_state_hash = stateItem.currentStateHash;
                                    }

                                    if (needsUpdate && session === currentRenderSession) {
                                        setMemoryCache(`L_${serverId}_${item.iid}`, updatedInfo);
                                        let displayData = { ...updatedInfo, tags: applyUserTags(updatedInfo.p, updatedInfo.tags) };

                                        const liveWrappers = document.querySelectorAll(`div[data-testid^="cellItem"], div[class*="ListItem-container"], div[class*="MetadataPosterCard-container"]`);
                                        for (const live of liveWrappers) {
                                            let liveLink = live.querySelector('a[data-testid="metadataTitleLink"]');
                                            if (!liveLink) liveLink = live.querySelectorAll('a[href*="key="], a[href*="/metadata/"]')[0];
                                            if (liveLink && decodeURIComponent(liveLink.getAttribute('href') || '').includes(item.iid)) {
                                                let livePoster = live.querySelector(`[class*="PosterCard-card-"], [class*="MetadataSimplePosterCard-card-"], [class*="ThumbCard-card-"], [class*="Card-card-"], [class*="ThumbCard-imageContainer"], [data-testid="metadata-poster"]`);
                                                if (!livePoster && live.classList.contains('ListItem-container')) livePoster = live.firstElementChild;
                                                if (livePoster) {
                                                    renderListBadges(live, livePoster, liveLink, displayData, srvConfig, item.iid);
                                                    break;
                                                }
                                            }
                                        }
                                    }
                                } catch (e) {}
                            }
                        });
                    }
                });

                if (queueCount > 0) processGlobalFallbackQueue();
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
    }

    async function processDetail(isManualRefresh = false) {
        if (!state.detailInfo) {
            document.getElementById('plex-guid-box')?.remove();
            return;
        }

        const { serverId, itemId } = extractIds();
        if (isIgnoredItem(null, itemId)) return; // VOD 필터
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

        if (!isManualRefresh) {
            const cData = getMemoryCache(cacheKey);
            if (cData) {
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

            let data = await makeRequest(`${srvConfig.pmhServerUrl}/api/media/${itemId}`, "GET", null, srvConfig.plexMateApiKey);
            if (session !== currentRenderSession) return;

            let hasMissingData = false;
            if (data.type === 'video' && data.versions) {
                hasMissingData = data.versions.some(v => !v.width || v.width === 0);
            }

            if (hasMissingData || isManualRefresh) {
                let meta = await fetchPlexMetaFallback(itemId, plexSrv);

                let stillMissing = false;
                if (meta && meta.Media) {
                    stillMissing = meta.Media.some(m => !m.width || m.width === 0);
                }

                if (stillMissing) {
                    if (isManualRefresh && hasMissingData) {
                        toastr.info("미분석 파일이 발견되어 Plex에 분석을 요청합니다.", "분석 대기 중", {timeOut: 8000});
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
            let paths = data.versions.map(v => v.file).filter(Boolean);
            let roots = [];
            let childrenMap = {};

            paths.forEach(p => {
                let normP = p.replace(/\\/g, '/');
                let longestParent = paths
                    .filter(pp => {
                        let normPP = pp.replace(/\\/g, '/');
                        return normP !== normPP && normP.startsWith(normPP + '/');
                    })
                    .sort((a, b) => b.length - a.length)[0];

                if (longestParent) {
                    if (!childrenMap[longestParent]) childrenMap[longestParent] = [];
                    childrenMap[longestParent].push(p);
                } else {
                    roots.push(p);
                }
            });

            function buildTreeLines(serverPath, level, isLast) {
                const isRoot = level === 0;

                let displayPath = serverPath;
                if (!isRoot) {
                    const parts = serverPath.split(/[\\/]/);
                    displayPath = parts[parts.length - 1];
                } else {
                    displayPath = emphasizeFileName(serverPath);
                }

                let treeIconHtml = '';
                if (level > 0) {
                    treeIconHtml = `<span style="color:#777; font-family:monospace; margin-right:8px;">${isLast ? '└' : '├'}</span>`;
                }

                let folderIconHtml = `<span style="color:#555;" title="친구 서버는 폴더 열기를 지원하지 않습니다."><i class="fas fa-folder-open"></i></span>`;
                let pathLinkHtml = `<span style="font-style:italic;">${displayPath}</span>`;

                if (srvConfig) {
                    const localPath = getLocalPath(serverPath);
                    const ePath = encodeURIComponent(localPath.replace(/\\/g, '/')).replace(/\(/g, '%28').replace(/\)/g, '%29');
                    folderIconHtml = `<a href="plexfolder://${ePath}" class="plex-guid-action plex-open-folder" title="폴더 열기"><i class="fas fa-folder-open"></i></a>`;
                    pathLinkHtml = `<a href="#" class="plex-path-scan-link" data-path="${serverPath}" data-section-id="${data.librarySectionID}" data-type="directory" title="클릭하여 Plex Mate로 스캔">${displayPath}</a>`;
                }

                let html = `
                <div style="display: flex; align-items: center; gap: 10px; padding: 3px 0;">
                    <div style="flex-shrink: 0; margin-left: ${level * 22}px; display: flex; align-items: center;">
                        ${treeIconHtml}${folderIconHtml}
                    </div>
                    <div style="flex-grow: 1; min-width: 0; font-size: 12px; color: ${isRoot ? '#ccc' : '#aaa'}; word-break: break-all; overflow-wrap: anywhere; line-height: 1.3; padding-left: 5px; padding-right: 10px;">
                        ${pathLinkHtml}
                    </div>
                </div>`;

                const children = childrenMap[serverPath] || [];
                children.forEach((childPath, index) => {
                    html += buildTreeLines(childPath, level + 1, index === children.length - 1);
                });

                return html;
            }

            versionsHtml = roots.map(rootPath => {
                const treeContentHtml = buildTreeLines(rootPath, 0, false);

                return `
                <div class="media-version-block" style="border: 0; margin-bottom: 6px;">
                    <div class="media-info-line" style="display: block; grid-template-columns: none; padding: 6px 10px;">
                        ${treeContentHtml}
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
                    const isExternal = bestSub.key && bestSub.key.trim() !== '';
                    if (isExternal) {
                        subHtml = `<a href="javascript:void(0);" class="plex-guid-action plex-kor-subtitle-download" data-stream-id="${bestSub.id}" data-key="${bestSub.key || ''}" data-fmt="${bestSub.format}" data-vname="${videoFilename}"><i class="fas fa-download"></i></a> Kor (${bestSub.format})`;
                    } else {
                        subHtml = `Kor (${bestSub.format})`;
                    }
                } else if (v.subs?.length > 0) {
                    subHtml = `기타 언어 (${v.subs.length}개)`;
                }

                const isHardsub = v.file && /kor-?sub|자체자막/i.test(v.file);
                if (!bestSub && isHardsub) {
                    subHtml = `자체/하드섭`;
                }

                let streamHtml = `<a href="#" class="plex-guid-action plex-play-stream"><i class="fas fa-wifi"></i></a>`;
                if (plexSrv && v.part_id) {
                    const vUrl = `${plexSrv.url}/library/parts/${v.part_id}/0/file?X-Plex-Token=${plexSrv.token}&ratingKey=${data.itemId}`;
                    let sUrl = '';

                    if (bestSub && bestSub.key && bestSub.key.trim() !== '') {
                        if (bestSub.key.startsWith('/library/streams/')) {
                            sUrl = `${plexSrv.url}${bestSub.key}?X-Plex-Token=${plexSrv.token}`;
                        } else {
                            sUrl = `${plexSrv.url}/library/streams/${bestSub.id}?X-Plex-Token=${plexSrv.token}`;
                        }
                    }

                    let justFileName = "Unknown_Video.mp4";
                    if (v.file) {
                        const pathParts = v.file.split(/[\\/]/);
                        justFileName = pathParts[pathParts.length - 1];
                    }

                    const streamPayload = encodeURIComponent(vUrl) + '%7C' + encodeURIComponent(sUrl) + '%7C' + encodeURIComponent(justFileName);
                    streamHtml = `<a href="plexstream://${streamPayload}" class="plex-guid-action plex-play-stream" title="스트리밍"><i class="fas fa-wifi"></i></a>`;
                }

                let playExternalHtml = `<span style="color:#555;" title="친구 서버는 지원하지 않습니다."><i class="fas fa-play"></i></span>`;
                let openFolderHtml = `<span style="color:#555;" title="친구 서버는 지원하지 않습니다."><i class="fas fa-folder-open"></i></span>`;
                let pathLinkHtml = '';

                if (srvConfig) {
                    const ePath = encodeURIComponent(getLocalPath(v.file).replace(/\\/g, '/')).replace(/\(/g, '%28').replace(/\)/g, '%29');
                    playExternalHtml = `<a href="plexplay://${ePath}" class="plex-guid-action plex-play-external" title="로컬 재생"><i class="fas fa-play"></i></a>`;
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
                    <div style="font-size: 12px; color: #777; padding-left: 8px; padding-right: 10px; margin-top: 4px; font-style: italic; word-break: break-all; overflow-wrap: anywhere; line-height: 1.3;">
                        ${uTagsHtml}${justFileName}
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
                <div style="width: 95px; flex-shrink: 0; color: #bababa; font-size:13px; font-weight:500;">PLEX MATE</div>
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

        const refreshMetaBtnHtml = srvConfig ? `
            <span style="opacity: 0.3; color: #adb5bd; margin: 0 4px;">|</span>
            <a href="#" id="pmh-btn-refresh-meta" style="color: #adb5bd; text-decoration: none; transition: 0.2s;" title="Plex 서버에 메타데이터 갱신을 요청합니다." onmouseover="this.style.color='#fff'" onmouseout="this.style.color='#adb5bd'"><i class="fas fa-bolt" style="font-size: 10px; margin-right: 2px;"></i>메타 새로고침</a>
            <span style="opacity: 0.3; color: #adb5bd; margin: 0 4px;">|</span>
            <a href="#" id="pmh-btn-rematch" style="color: #adb5bd; text-decoration: none; transition: 0.2s;" title="기존 메타를 언매치하고 다시 매칭합니다." onmouseover="this.style.color='#fff'" onmouseout="this.style.color='#adb5bd'"><i class="fas fa-link" style="font-size: 10px; margin-right: 2px;"></i>메타 리매칭</a>
            <span style="opacity: 0.3; color: #adb5bd; margin: 0 4px;">|</span>
            <a href="#" id="pmh-btn-analyze" style="color: #adb5bd; text-decoration: none; transition: 0.2s;" title="Plex 서버에 미디어 분석을 요청합니다." onmouseover="this.style.color='#fff'" onmouseout="this.style.color='#adb5bd'"><i class="fas fa-search-plus" style="font-size: 10px; margin-right: 2px;"></i>미디어 분석</a>
        ` : '';

        const boxHtml = `
        <div id="plex-guid-box" class="pmh-fade-update" style="margin-top: 15px; margin-bottom: 10px; width: 100%; position: relative;">
            <div style="color:#e5a00d; font-size:16px; margin-bottom:4px; font-weight:bold; display:flex; align-items:baseline;">
                미디어 정보
                <span style="margin-left: 12px; font-weight: normal; letter-spacing: -0.5px; font-size: 11px;">
                    <a href="#" id="pmh-btn-refresh-data" style="color: #adb5bd; text-decoration: none; transition: 0.2s;" title="DB 데이터를 다시 불러옵니다." onmouseover="this.style.color='#fff'" onmouseout="this.style.color='#adb5bd'"><i class="fas fa-sync-alt" style="font-size: 10px; margin-right: 2px;"></i>정보 새로고침</a>
                    ${refreshMetaBtnHtml}
                </span>
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

        let abortDetailRefresh = false;

        const showBoxLoading = () => {
            const content = document.getElementById('plex-guid-content');
            if (content) {
                content.style.transition = "opacity 0.3s";
                content.style.opacity = "0.2";
                content.style.pointerEvents = "none";
                content.style.position = "relative";
                const oldOverlay = document.getElementById('pmh-box-overlay');
                if (oldOverlay) oldOverlay.remove();

                const overlay = document.createElement('div');
                overlay.id = 'pmh-box-overlay';
                overlay.style.position = "absolute";
                overlay.style.top = "0"; overlay.style.left = "0";
                overlay.style.width = "100%"; overlay.style.height = "100%";
                overlay.style.display = "flex"; overlay.style.alignItems = "center"; overlay.style.justifyContent = "center";
                overlay.style.zIndex = "10";
                overlay.innerHTML = `<i class="fas fa-spinner fa-spin" style="font-size: 30px; color: #e5a00d;"></i>`;
                content.appendChild(overlay);
            }
        };

        const hideBoxLoading = () => {
            const content = document.getElementById('plex-guid-content');
            if (content) {
                content.style.transition = "opacity 0.3s";
                content.style.opacity = "1";
                content.style.pointerEvents = "auto";
                const overlay = document.getElementById('pmh-box-overlay');
                if (overlay) overlay.remove();
            }
        };

        const renderSessionAtClick = currentRenderSession;
        const forceRefreshChildUI = () => {
            if (renderSessionAtClick !== currentRenderSession) return;
            const itemWrappers = document.querySelectorAll(`div[data-testid^="cellItem"], div[class*="ListItem-container"], div[class*="MetadataPosterCard-container"]`);
            itemWrappers.forEach(cont => {
                let link = cont.querySelector('a[data-testid="metadataTitleLink"]');
                if (!link) {
                    const fallbackLinks = cont.querySelectorAll('a[href*="key="], a[href*="/metadata/"]');
                    link = fallbackLinks[0];
                }
                if (!link) return;
                try {
                    const href = link.getAttribute('href');
                    const keyParam = new URLSearchParams(href.split('?')[1]).get('key');
                    if (keyParam) {
                        const iid = decodeURIComponent(keyParam).split('/metadata/')[1]?.split(/[\/?]/)[0];
                        if (iid && serverId) {
                            deleteMemoryCache(`L_${serverId}_${iid}`);
                            deleteMemoryCache(`F_${serverId}_${iid}`);
                            if (typeof sessionRevalidated !== 'undefined') {
                                sessionRevalidated.delete(iid); 
                            }
                        }
                    }
                } catch(e) {}
            });
            document.querySelectorAll('.pmh-render-marker, .pmh-top-right-wrapper, .plex-guid-list-box, .plex-list-multipath-badge, .pmh-guid-wrapper').forEach(e => e.remove());
            setTimeout(() => { if (typeof processList === 'function' && renderSessionAtClick === currentRenderSession) processList(); }, 150);
        };

        const btnRefreshData = document.getElementById('pmh-btn-refresh-data');
        if (btnRefreshData) {
            btnRefreshData.addEventListener('click', (e) => {
                e.preventDefault(); e.stopPropagation();
                if (btnRefreshData.dataset.refreshing) return;
                infoLog(`[Detail] Data re-fetch requested. Clearing memory cache for Item: ${data.itemId}`);
                
                btnRefreshData.dataset.refreshing = "true";
                btnRefreshData.innerHTML = `<i class="fas fa-spinner fa-spin" style="font-size: 10px; margin-right: 2px;"></i>정보 갱신중...`;
                
                showBoxLoading();
                
                deleteMemoryCache(srvConfig ? `D_${serverId}_${data.itemId}` : `F_${serverId}_${data.itemId}`);
                deleteMemoryCache(`L_${serverId}_${data.itemId}`);
                if (typeof sessionRevalidated !== 'undefined') sessionRevalidated.delete(data.itemId);
                
                currentDisplayedItemId = null;
                setTimeout(() => { 
                    processDetail(true); 
                    forceRefreshChildUI(); 
                }, 100);
            });
        }

        const btnRefreshMeta = document.getElementById('pmh-btn-refresh-meta');
        if (btnRefreshMeta) {
            btnRefreshMeta.addEventListener('click', async (e) => {
                e.preventDefault(); e.stopPropagation();
                if (!plexSrv) return toastr.error("토큰을 찾을 수 없습니다.");

                const originalHtml = `<i class="fas fa-bolt" style="font-size: 10px; margin-right: 2px;"></i>메타 새로고침`;
                const originalTitle = "Plex 서버에 메타데이터 갱신을 요청합니다.";

                if (btnRefreshMeta.dataset.refreshing === 'true') {
                    abortDetailRefresh = true;
                    btnRefreshMeta.innerHTML = `<i class="fas fa-times" style="font-size: 10px; margin-right: 2px;"></i>취소됨`;
                    btnRefreshMeta.title = "";
                    hideBoxLoading(); 
                    toastr.warning("대기가 취소되었습니다.", "취소됨", {timeOut: 2000});
                    
                    setTimeout(() => {
                        if (btnRefreshMeta.isConnected) {
                            btnRefreshMeta.innerHTML = originalHtml;
                            btnRefreshMeta.title = originalTitle;
                            delete btnRefreshMeta.dataset.refreshing;
                        }
                    }, 1500);
                    return;
                }

                abortDetailRefresh = false;
                btnRefreshMeta.dataset.refreshing = 'true';
                btnRefreshMeta.innerHTML = `<i class="fas fa-spinner fa-spin" style="font-size: 10px; margin-right: 2px;"></i>갱신 완료 대기중`;
                btnRefreshMeta.title = "클릭시 대기 취소";

                const rawG = (data.guid || '').toLowerCase();
                const isUnmatched = !rawG || rawG === '-' || rawG.includes('local://') || rawG.includes('none://');

                if (!isUnmatched) {
                    infoLog(`[Detail] Background Metadata Refresh requested for matched Item: ${data.itemId}`);
                    toastr.success("Plex 서버에 메타 갱신을 요청했습니다.<br>작업은 백그라운드에서 진행됩니다.", "메타 갱신 요청 완료", {timeOut: 4000});
                    triggerPlexMetadataRefresh(data.itemId, plexSrv);
                    setTimeout(() => {
                        if (btnRefreshMeta.isConnected) {
                            btnRefreshMeta.innerHTML = originalHtml;
                            btnRefreshMeta.title = originalTitle;
                            delete btnRefreshMeta.dataset.refreshing;
                        }
                    }, 1500);
                    return;
                }

                showBoxLoading();
                toastr.info("Plex 메타데이터 갱신 요청 중...<br>버튼을 다시 누르면 대기를 취소합니다.", "메타 새로고침", {timeOut: 5000});

                const initialMeta = await fetchPlexMetaFallback(data.itemId, plexSrv);
                const initialUpdated = initialMeta && initialMeta.updatedAt ? initialMeta.updatedAt : 0;

                await triggerPlexMetadataRefresh(data.itemId, plexSrv);

                let pollSuccess = false;
                for (let attempt = 0; attempt < 60; attempt++) {
                    if (renderSessionAtClick !== currentRenderSession || abortDetailRefresh) return; 
                    await new Promise(r => setTimeout(r, 2500));
                    if (renderSessionAtClick !== currentRenderSession || abortDetailRefresh) return;

                    const tempMeta = await fetchPlexMetaFallback(data.itemId, plexSrv);
                    if (tempMeta) {
                        const tempUpdated = tempMeta.updatedAt || 0;
                        const tempGuid = (tempMeta.guid || '').toLowerCase();
                        const isNowMatched = !tempGuid.includes('local://') && !tempGuid.includes('none://') && tempGuid !== '-' && tempGuid !== '';

                        if (tempUpdated !== initialUpdated || isNowMatched) {
                            pollSuccess = true;
                            break;
                        }
                    }
                }

                if (renderSessionAtClick !== currentRenderSession || abortDetailRefresh) return;

                if (pollSuccess) {
                    toastr.success("메타 갱신 완료!<br>최신 정보로 화면을 갱신합니다.", "성공", {timeOut: 3000});
                } else {
                    toastr.warning("응답 지연으로 대기를 종료합니다.<br>현재 확보된 데이터로 화면을 갱신합니다.", "시간 초과", {timeOut: 4000});
                }
                
                deleteMemoryCache(`D_${serverId}_${data.itemId}`);
                deleteMemoryCache(`L_${serverId}_${data.itemId}`);
                if (typeof sessionRevalidated !== 'undefined') sessionRevalidated.delete(data.itemId);
                
                currentDisplayedItemId = null;
                processDetail(true);      
                forceRefreshChildUI();    
            });
        }

        const btnRematch = document.getElementById('pmh-btn-rematch');
        if (btnRematch) {
            btnRematch.addEventListener('click', async (e) => {
                e.preventDefault(); e.stopPropagation();
                if (!plexSrv) return toastr.error("토큰을 찾을 수 없습니다.");

                const originalHtml = `<i class="fas fa-link" style="font-size: 10px; margin-right: 2px;"></i>메타 리매칭`;
                const originalTitle = "기존 메타를 언매치하고 다시 매칭합니다.";

                if (btnRematch.dataset.refreshing === 'true') {
                    abortDetailRefresh = true;
                    btnRematch.innerHTML = `<i class="fas fa-times" style="font-size: 10px; margin-right: 2px;"></i>취소됨`;
                    btnRematch.title = "";
                    hideBoxLoading(); 
                    isObserverLocked = false;
                    toastr.warning("메타 리매칭 대기가 취소되었습니다.", "취소됨", {timeOut: 2000});
                    
                    setTimeout(() => {
                        if (btnRematch.isConnected) {
                            btnRematch.innerHTML = originalHtml;
                            btnRematch.title = originalTitle;
                            delete btnRematch.dataset.refreshing;
                        }
                    }, 1500);
                    return;
                }

                abortDetailRefresh = false;
                btnRematch.dataset.refreshing = 'true';
                btnRematch.innerHTML = `<i class="fas fa-spinner fa-spin" style="font-size: 10px; margin-right: 2px;"></i>리매칭 진행중`;
                btnRematch.title = "클릭시 대기 취소";

                isObserverLocked = true;
                showBoxLoading();
                infoLog(`[Detail] Foreground Meta Rematch requested for Item: ${data.itemId}`);
                toastr.info("메타 리매칭 작업을 시작합니다...<br>버튼을 다시 누르면 취소합니다.", "리매칭 시작", {timeOut: 5000});

                const rawG = (data.guid || '').toLowerCase();
                const isUnmatched = !rawG || rawG === '-' || rawG.includes('local://') || rawG.includes('none://');

                try {
                    if (!isUnmatched) {
                        toastr.info("1단계: 기존 메타 언매치 중...", "리매칭 진행", {timeOut: 3000});
                        infoLog(`[Detail] Rematch Step 1: Unmatching Item: ${data.itemId}`);
                        const unmatchSuccess = await triggerPlexUnmatch(data.itemId, plexSrv);
                        if (!unmatchSuccess) throw new Error("언매치 API 호출에 실패했습니다.");

                        let unmatchVerified = false;
                        for (let i = 0; i < 20; i++) { // 최대 50초 대기
                            if (renderSessionAtClick !== currentRenderSession || abortDetailRefresh) throw new Error("Cancelled");
                            await new Promise(r => setTimeout(r, 2500));
                            if (renderSessionAtClick !== currentRenderSession || abortDetailRefresh) throw new Error("Cancelled");

                            const tempMeta = await fetchPlexMetaFallback(data.itemId, plexSrv);
                            const tempGuid = tempMeta ? (tempMeta.guid || '').toLowerCase() : '';
                            if (tempGuid.includes('local://') || tempGuid.includes('none://')) {
                                unmatchVerified = true;
                                break;
                            }
                        }
                        if (!unmatchVerified) throw new Error("언매치 상태 확인 시간 초과 (1단계 실패)");
                    } else {
                        infoLog(`[Detail] Rematch Step 1 Skipped: Already unmatched (ID: ${data.itemId})`);
                    }

                    if (renderSessionAtClick !== currentRenderSession || abortDetailRefresh) throw new Error("Cancelled");

                    toastr.info("2단계: 메타 데이터 자동 매칭 요청 중...", "리매칭 진행", {timeOut: 3000});
                    infoLog(`[Detail] Rematch Step 2: Triggering Auto-Match for Item: ${data.itemId}`);
                    
                    const matchSuccess = await triggerPlexAutoMatch(data.itemId, plexSrv);
                    if (!matchSuccess) {
                        throw new Error("자동 매칭 대상을 찾지 못했거나 매칭 API 호출에 실패했습니다.");
                    }

                    let matchVerified = false;
                    for (let i = 0; i < 24; i++) {
                        if (renderSessionAtClick !== currentRenderSession || abortDetailRefresh) throw new Error("Cancelled");
                        await new Promise(r => setTimeout(r, 2500));
                        if (renderSessionAtClick !== currentRenderSession || abortDetailRefresh) throw new Error("Cancelled");

                        const tempMeta = await fetchPlexMetaFallback(data.itemId, plexSrv);
                        if (tempMeta) {
                            const tempGuid = (tempMeta.guid || '').toLowerCase();
                            const isNowMatched = !tempGuid.includes('local://') && !tempGuid.includes('none://') && tempGuid !== '-' && tempGuid !== '';

                            if (isNowMatched) {
                                matchVerified = true;
                                break;
                            }
                        }
                    }

                    if (!matchVerified) throw new Error("매칭 완료 상태 확인 시간 초과 (수동 매칭이 필요할 수 있습니다)");

                    infoLog(`[Detail] Rematch successful. Triggering background metadata refresh for Item: ${data.itemId}`);
                    triggerPlexMetadataRefresh(data.itemId, plexSrv);

                    toastr.success("메타 리매칭 완료!<br>매칭된 메타로 새로고침합니다.", "성공", {timeOut: 4000});
                    infoLog(`[Detail] Rematch process completed successfully for Item: ${data.itemId}`);

                } catch (err) {
                    if (err.message === "Cancelled") {
                        infoLog(`[Detail] Rematch process cancelled by user/navigation for Item: ${data.itemId}`);
                    } else {
                        toastr.error(`리매칭 실패: ${err.message}`, "오류", {timeOut: 5000});
                        errorLog(`[Detail] Rematch failed for Item: ${data.itemId}. Reason: ${err.message}`);
                    }
                } finally {
                    isObserverLocked = false;

                    if (renderSessionAtClick === currentRenderSession && !abortDetailRefresh) {
                        deleteMemoryCache(`D_${serverId}_${data.itemId}`);
                        deleteMemoryCache(`L_${serverId}_${data.itemId}`);
                        if (typeof sessionRevalidated !== 'undefined') sessionRevalidated.delete(data.itemId);
                        
                        currentDisplayedItemId = null;
                        processDetail(true);      
                        forceRefreshChildUI(); 
                    }
                }
            });
        }

        const btnAnalyze = document.getElementById('pmh-btn-analyze');
        if (btnAnalyze) {
            btnAnalyze.addEventListener('click', async (e) => {
                e.preventDefault(); e.stopPropagation();
                if (!plexSrv) return toastr.error("토큰을 찾을 수 없습니다.");

                const originalHtml = `<i class="fas fa-search-plus" style="font-size: 10px; margin-right: 2px;"></i>미디어 분석`;
                const originalTitle = "Plex 서버에 미디어 분석을 요청합니다.";

                if (btnAnalyze.dataset.refreshing === 'true') {
                    abortDetailRefresh = true;
                    btnAnalyze.innerHTML = `<i class="fas fa-times" style="font-size: 10px; margin-right: 2px;"></i>취소됨`;
                    btnAnalyze.title = "";
                    hideBoxLoading(); 
                    toastr.warning("미디어 분석 대기가 취소되었습니다.", "취소됨", {timeOut: 2000});
                    
                    setTimeout(() => {
                        if (btnAnalyze.isConnected) {
                            btnAnalyze.innerHTML = originalHtml;
                            btnAnalyze.title = originalTitle;
                            delete btnAnalyze.dataset.refreshing;
                        }
                    }, 1500);
                    return;
                }

                const isAlreadyAnalyzed = data.type === 'video' && data.versions && data.versions.every(v => v.width && v.width > 0);

                if (data.type === 'directory' || isAlreadyAnalyzed) {
                    infoLog(`[Detail] Background Media Analysis requested for Item: ${data.itemId}`);
                    toastr.success("미디어 분석을 서버에 요청했습니다.<br>작업은 백그라운드에서 진행됩니다.", "분석 요청 완료", {timeOut: 4000});
                    triggerPlexAnalyze(data.itemId, plexSrv);
                    return;
                }

                abortDetailRefresh = false;
                btnAnalyze.dataset.refreshing = 'true';
                btnAnalyze.innerHTML = `<i class="fas fa-spinner fa-spin" style="font-size: 10px; margin-right: 2px;"></i>분석 대기중`;
                btnAnalyze.title = "클릭시 대기 취소";

                showBoxLoading();
                toastr.info("미디어 분석을 요청 중입니다...<br>버튼을 다시 누르면 대기를 취소합니다.", "미디어 분석", {timeOut: 5000});

                const initialMeta = await fetchPlexMetaFallback(data.itemId, plexSrv);
                const initialUpdated = initialMeta && initialMeta.updatedAt ? initialMeta.updatedAt : 0;

                const reqSuccess = await triggerPlexAnalyze(data.itemId, plexSrv);
                if (!reqSuccess) {
                    toastr.error("Plex 서버로 분석 요청을 보내지 못했습니다.", "통신 오류");
                    hideBoxLoading();
                    btnAnalyze.innerHTML = originalHtml;
                    delete btnAnalyze.dataset.refreshing;
                    return;
                }

                let pollResult = 'timeout';
                for (let attempt = 0; attempt < 60; attempt++) {
                    if (renderSessionAtClick !== currentRenderSession || abortDetailRefresh) return; 
                    await new Promise(r => setTimeout(r, 2500));
                    if (renderSessionAtClick !== currentRenderSession || abortDetailRefresh) return;

                    const tempMeta = await fetchPlexMetaFallback(data.itemId, plexSrv);
                    if (tempMeta && tempMeta.updatedAt !== initialUpdated) {
                        let stillMissing = true;
                        if (tempMeta.Media && tempMeta.Media.length > 0) {
                            stillMissing = tempMeta.Media.some(m => !m.width || m.width === 0);
                        }
                        
                        if (stillMissing) {
                            pollResult = 'failed_corrupt';
                        } else {
                            pollResult = 'success';
                        }
                        break;
                    }
                }

                if (renderSessionAtClick !== currentRenderSession || abortDetailRefresh) return;

                if (pollResult === 'success') {
                    toastr.success("미디어 분석 완료!<br>최신 정보로 화면을 갱신합니다.", "성공", {timeOut: 3000});
                } else if (pollResult === 'failed_corrupt') {
                    toastr.error("서버가 분석을 시도했으나 미디어 정보를 읽지 못했습니다.<br>파일 손상이나 클라우드 마운트 연결 상태를 확인하세요.", "분석 실패", {timeOut: 8000});
                } else {
                    toastr.warning("분석 시간이 초과되었습니다.<br>백그라운드 처리로 전환합니다.", "시간 초과", {timeOut: 4000});
                }
                
                deleteMemoryCache(`D_${serverId}_${data.itemId}`);
                deleteMemoryCache(`L_${serverId}_${data.itemId}`);
                if (typeof sessionRevalidated !== 'undefined') sessionRevalidated.delete(data.itemId);
                
                currentDisplayedItemId = null;
                processDetail(true);
                forceRefreshChildUI();
            });
        }

        document.querySelectorAll('#plex-guid-box .plex-play-external, #plex-guid-box .plex-open-folder, #plex-guid-box .plex-play-stream').forEach(el => {
            el.addEventListener('click', () => { toastr.info('명령을 실행합니다.'); });
        });

        document.querySelectorAll('#plex-guid-box .plex-kor-subtitle-download').forEach(el => {
            el.addEventListener('click', (e) => {
                e.preventDefault(); e.stopPropagation();
                if(!plexSrv) return toastr.error("토큰을 찾을 수 없습니다.");

                const dataKey = el.dataset.key;
                const streamId = el.dataset.streamId;
                const vName = el.dataset.vname || 'subtitle';
                const finalFileName = `${vName}.ko.${el.dataset.fmt}`;
                infoLog(`[Detail] Subtitle file download requested: ${finalFileName}`);

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
                            } catch(err) { toastr.error("파일 처리 중 오류가 발생했습니다."); }
                        } else { toastr.error(`서버 응답 오류 (HTTP ${r.status})`, "다운로드 실패"); }
                    },
                    onerror: () => toastr.error("서버에 연결할 수 없습니다.", "다운로드 실패")
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
                if (!srvConfig.plexMateUrl || !srvConfig.plexMateApiKey) return toastr.error("Plex Mate 설정 누락");

                let scanPath = el.dataset.path;
                infoLog(`[PlexMate] VFS/Library Scan requested for path: ${scanPath}`);
                const sectionId = el.dataset.sectionId;
                if (el.dataset.type === 'video') {
                    const lastSlash = Math.max(scanPath.lastIndexOf('/'), scanPath.lastIndexOf('\\'));
                    if (lastSlash > -1) scanPath = scanPath.substring(0, lastSlash);
                }

                const originalHtml = el.innerHTML;
                el.style.pointerEvents = 'none';
                el.innerHTML = `<i class="fas fa-spinner fa-spin"></i> 스캔 요청 중...`;

                try {
                    toastr.info(`[1/2] VFS/Refresh 요청 중...<br>${scanPath}`, "Web 스캔 시작", {timeOut: 3000});
                    const vfsRes = await callPlexMateFormAPI('/plex_mate/api/scan/vfs_refresh', { apikey: srvConfig.plexMateApiKey, target: scanPath, recursive: 'true', async: 'false' });
                    if (vfsRes.ret !== 'success') throw new Error(vfsRes.msg || "VFS 갱신 실패");

                    toastr.info(`[2/2] VFS/Refresh 완료. 라이브러리 스캔 요청 중...`, "스캔", {timeOut: 3000});
                    const scanRes = await callPlexMateFormAPI('/plex_mate/api/scan/do_scan', { apikey: srvConfig.plexMateApiKey, target: scanPath, target_section_id: sectionId, scanner: 'web' });

                    if (scanRes.ret === 'success') toastr.success('Plex Mate 스캔 요청 완료!', '성공');
                    else throw new Error(scanRes.msg || "스캔 요청 실패");
                } catch (err) { toastr.error(`오류 발생: ${err.message || err}`, '스캔 실패'); }
                finally { el.style.pointerEvents = 'auto'; el.innerHTML = originalHtml; }
            });
        });

        const mateBtn = document.getElementById('plex-mate-refresh-button');
        if (mateBtn) {
            mateBtn.addEventListener('click', async (e) => {
                e.preventDefault(); e.stopPropagation();
                if (!srvConfig.plexMateUrl || !srvConfig.plexMateApiKey) return toastr.error("Plex Mate 설정 누락");
                infoLog(`[PlexMate] Manual Refresh (YAML/TMDB Sync) requested for PMH Item: ${data.itemId}`);

                const originalHtml = mateBtn.innerHTML;
                mateBtn.style.pointerEvents = 'none';
                mateBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> 요청 중...`;
                toastr.info('plex_mate에 YAML/TMDB 반영을 요청합니다...');

                try {
                    const res = await callPlexMateFormAPI('/plex_mate/api/scan/manual_refresh', { apikey: srvConfig.plexMateApiKey, metadata_item_id: mateBtn.dataset.itemid });
                    if (res.ret === 'success') {
                        toastr.success('YAML/TMDB 반영 완료!<br>(제목/포스터는 화면 이동시 반영)', '성공', {timeOut: 5000});

                        deleteMemoryCache(`D_${serverId}_${data.itemId}`);
                        deleteMemoryCache(`L_${serverId}_${data.itemId}`);
                        if (typeof sessionRevalidated !== 'undefined') sessionRevalidated.delete(data.itemId);
                        
                        currentDisplayedItemId = null;

                        processDetail(true);
                        forceRefreshChildUI();
                    } else throw new Error(res.msg || "반영 오류");
                } catch (err) { toastr.error(`반영 실패: ${err.message || err}`, '오류'); }
                finally { mateBtn.style.pointerEvents = 'auto'; mateBtn.innerHTML = originalHtml; }
            });
        }
        currentDetailStateHash = getDetailStateHash();
    }

    // ==========================================
    // 8. 앱 라우팅(SPA) 및 Observer
    // ==========================================
    function checkUrlChange(force = false) {
        if (window.location.href !== currentUrl || force) {
            currentUrl = window.location.href;

            isObserverLocked = false;

            currentRenderSession++;
            sessionRevalidated.clear();
            abortAllRequests();

            document.getElementById('plex-guid-box')?.remove();
            currentDisplayedItemId = null;
            currentDetailStateHash = '';

            checkUpdate();
            injectControlUI();

            if (window.location.hash.includes('/details?key=')) setTimeout(processDetail, 500);
            setTimeout(processList, 500);
        }
    }

    const itemApiDebounceTimers = new Map();
    const API_DEBOUNCE_DELAY = 1000;

    let masterObserverTimer = null;
    const observer = new MutationObserver(() => {
        if (isObserverLocked) return;

        if (masterObserverTimer) clearTimeout(masterObserverTimer);
        
        masterObserverTimer = setTimeout(() => {
            processMatchModal();

            if (!document.getElementById('pmdv-controls')) injectControlUI();

            if (window.location.hash.includes('/details?key=')) {
                const { serverId, itemId } = extractIds();
                const currentHash = getDetailStateHash();
                const guidBox = document.getElementById('plex-guid-box');

                if (currentDisplayedItemId === itemId && currentDetailStateHash && currentHash && currentDetailStateHash !== currentHash) {
                    infoLog(`[Detail-Observer] 🔄 Metadata change detected! (${currentDetailStateHash} -> ${currentHash}). Forcing update.`);
                    currentDetailStateHash = currentHash; 
                    
                    if (serverId && itemId) {
                        deleteMemoryCache(`D_${serverId}_${itemId}`);
                        deleteMemoryCache(`F_${serverId}_${itemId}`);
                        deleteMemoryCache(`L_${serverId}_${itemId}`);
                        if (typeof sessionRevalidated !== 'undefined') sessionRevalidated.delete(itemId);
                    }
                    
                    if (guidBox) guidBox.style.opacity = '0.4';
                    
                    if(observer.detailTimer) clearTimeout(observer.detailTimer);
                    observer.detailTimer = setTimeout(() => { processDetail(true); }, 600);
                }
                else if (!guidBox && !isFetchingDetail) {
                    const target = document.querySelector('div[data-testid="metadata-top-level-items"]')
                                || document.querySelector('div[data-testid="metadata-starRatings"]')
                                || document.querySelector('div[data-testid="metadata-ratings"]')
                                || document.querySelector('button[data-testid="preplay-play"]')
                                || document.querySelector('span[data-testid="metadata-line2"]');
                    if (target) {
                        if(observer.detailTimer) clearTimeout(observer.detailTimer);
                        observer.detailTimer = setTimeout(() => { processDetail(); }, 200);
                    }
                }
            }

            const allListItems = document.querySelectorAll(`
                div[data-testid^="cellItem"],
                div[class*="ListItem-container"],
                div[class*="MetadataPosterCard-container"]
            `);

            let needsRender = false;

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

                if (isIgnoredItem(link.getAttribute('href'), iid)) continue;

                if (iid) {
                    const marker = cont.querySelector('.pmh-render-marker');
                    let needsDraw = false;

                    if (!marker || marker.getAttribute('data-iid') !== iid) {
                        needsDraw = true;
                    } else {
                        const oldHash = marker.getAttribute('data-state-hash');
                        const currentHash = getItemStateHash(cont);
                        
                        if (oldHash && currentHash && oldHash !== currentHash) {
                            let logTitle = "Unknown Title";
                            const hashParts = currentHash.split('|');
                            let candidateTitle = hashParts.find(p => p && isNaN(p));

                            const targetServerId = link.getAttribute('href').match(/\/server\/([a-f0-9]+)\//)?.[1];
                            const localCache = targetServerId ? getMemoryCache(`L_${targetServerId}_${iid}`) : null;
                            
                            if (candidateTitle && (candidateTitle.includes('로딩') || candidateTitle.includes('Loading'))) {
                                logTitle = (localCache && localCache.saved_title) ? localCache.saved_title : "Loading...";
                            } else if (candidateTitle) {
                                logTitle = candidateTitle;
                                if (localCache) {
                                    localCache.saved_title = logTitle;
                                    setMemoryCache(`L_${targetServerId}_${iid}`, localCache);
                                }
                            }

                            if (itemApiDebounceTimers.has(iid)) {
                                clearTimeout(itemApiDebounceTimers.get(iid));
                            } else {
                                needsDraw = true;
                                const now = Date.now();
                                if (!observerLogCooldown[iid] || now - observerLogCooldown[iid] > 2000) {
                                    infoLog(`[List-Observer] 🔄 DOM State changed for [${logTitle}] (ID: ${iid}). Immediate update.`);
                                    observerLogCooldown[iid] = now;
                                }
                            }

                            itemApiDebounceTimers.set(iid, setTimeout(() => {
                                itemApiDebounceTimers.delete(iid);
                                
                                if(observer.listTimer) clearTimeout(observer.listTimer);
                                observer.listTimer = setTimeout(() => { processList(); }, 150);
                            }, API_DEBOUNCE_DELAY));

                        } else {
                            const isIgnored = marker.getAttribute('data-ignored') === 'true';
                            if (!isIgnored) {
                                if ((state.listTag || state.listPlay) && !cont.querySelector('.pmh-top-right-wrapper')) needsDraw = true;
                                if ((state.listGuid || state.listMultiPath) && !cont.querySelector('.pmh-guid-wrapper')) needsDraw = true;
                            }
                        }
                    }

                    if (needsDraw) {
                        needsRender = true;
                    }
                }
            }

            if (needsRender) {
                if(observer.listTimer) clearTimeout(observer.listTimer);
                observer.listTimer = setTimeout(() => { processList(); }, 150);
            }

        }, 150);
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
                    <p style="font-size: 13px; margin-top: 0;">아래 설정을 JSON 형식에 맞게 수정한 후 저장하세요.</p>
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

    let isProcessingMatchModal = false;

    function processMatchModal() {
        if (isProcessingMatchModal) return;

        const modal = document.querySelector('.fix-incorrect-match-modal');
        if (!modal) return;

        const listItems = modal.querySelectorAll('.match-result-list-item');
        if (listItems.length === 0) return;

        isProcessingMatchModal = true;
        try {
            listItems.forEach((row, index) => {
                if (row.querySelector('.pmh-match-badge') || !pmhMatchResultsCache[index]) return;

                const fullGuid = pmhMatchResultsCache[index];
                let displayGuid = fullGuid.split('://')[1]?.split('?')[0] || fullGuid;
                displayGuid = displayGuid.replace(/^com\.plexapp\.agents\./, '').replace(/^tv\.plex\.agents\./, '');

                const nameEl = row.querySelector('.match-name');
                if (nameEl) {
                    const badge = document.createElement('span');
                    badge.className = 'pmh-match-badge';
                    badge.textContent = displayGuid;
                    badge.title = `${fullGuid}`;

                    nameEl.insertAdjacentElement('afterend', badge);
                }
            });
        } catch (e) {
            errorLog("[PMH] Match Modal 처리 중 오류:", e);
        } finally {
            isProcessingMatchModal = false;
        }
    }

    window.addEventListener('load', () => {
        checkUpdate();
        infoLog('Script fully loaded. Waiting for user interaction...');
        observer.observe(document.body, { childList: true, subtree: true });
        checkUrlChange(true);
    });

})();
