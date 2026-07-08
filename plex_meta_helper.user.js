// ==UserScript==
// @name         Plex Meta Helper
// @namespace    https://tampermonkey.net/
// @version      0.8.109
// @description  Plex Web UI 관리 기능 개선 스크립트(Frontend)
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
// @grant        GM_listValues
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_addStyle
// @run-at       document-idle
// ==/UserScript==

/* global toastr, $ */

GM_addStyle(`
    /* 1. Toastr & Custom PMH Logo (Black/Orange) */
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
        padding: 15px 15px 15px 50px; width: 300px; border-radius: 3px;
        background-position: 15px center; background-repeat: no-repeat; background-size: 24px 24px !important;
        background-image: url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA2NCA2NCI+PHJlY3Qgd2lkdGg9IjY0IiBoZWlnaHQ9IjY0IiByeD0iMTIiIGZpbGw9IiMwMDAwMDAiIC8+PHRleHQgeD0iMzIiIHk9IjM1IiBmaWxsPSIjZTVhMDBkIiBmb250LWZhbWlseT0ic2Fucy1zZXJpZiIgZm9udC1zaXplPSIyNCIgZm9udC13ZWlnaHQ9ImJvbGQiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGFsaWdubWVudC1iYXNlbGluZT0ibWlkZGxlIj5QTUg8L3RleHQ+PC9zdmc+') !important;
        box-shadow: #000 0 0 12px; color: #fff; opacity: .9;
    }
    #toast-container > :focus, #toast-container > :hover { opacity: 1; box-shadow: #000 0 0 12px; cursor: pointer; }
    .toast-error { background-color: #bd362f; }
    .toast-success { background-color: #51a351; }
    .toast-info { background-color: #2f96b4; }
    .toast-warning { background-color: #f89406; }
    .toast-bottom-right { right: 12px; bottom: 12px; }
    .toast-progress { position: absolute; left: 0; bottom: 0; height: 4px; background-color: #000; opacity: .4; }

    /* 2. Plex 상세페이지 링크 & 상세정보 텍스트 효과 (Plex UI 오버레이) */
    .plex-guid-link, .plex-path-scan-link, #plex-guid-box .path-text-wrapper { text-decoration: none !important; cursor: pointer; color: #ccc !important; transition: color 0.2s, opacity 0.2s; font-size: 12px; line-height: 1.5; }
    .plex-guid-link:hover, .plex-path-scan-link:hover { color: #f0ad4e !important; text-decoration: underline !important; }
    #plex-guid-box .plex-guid-action { font-size: 14px; margin: 0; text-decoration: none; cursor: pointer; vertical-align: middle; color: #adb5bd; opacity: 0.8; transition: opacity 0.2s, transform 0.2s, color 0.2s; }
    #plex-guid-box .plex-guid-action:hover { opacity: 1.0; color: #ffffff; transform: scale(1.1); }
    #plex-guid-box .plex-kor-subtitle-download { margin-right: 4px; }
    #plex-mate-refresh-button { display: inline-block; padding: 4px 10px; font-size: 13px; font-weight: 700; color: #1f1f1f !important; background-color: #e5a00d; border: 1px solid #c48b0b; border-radius: 4px; text-decoration: none !important; cursor: pointer; transition: 0.2s; }
    #plex-mate-refresh-button:hover { background-color: #d4910c; border-color: #a9780a; transform: scale(1.02); }
    #refresh-guid-button:hover i { color: #ffffff !important; transform: scale(1.1); }

    .media-info-line { display: grid; grid-template-columns: 35px 35px 35px 0.5fr 2.2fr 2.2fr 1.0fr; align-items: center; gap: 8px; padding: 8px 10px; border-radius: 4px; background-color: rgba(0, 0, 0, 0.2); }
    .media-info-line .info-block { display: flex; flex-direction: column; justify-content: center; text-align: center; }
    .media-info-line .info-label { color: #9E9E9E; font-size: 10px; margin-bottom: 2px; white-space: nowrap; text-align: center; }
    .media-info-line .info-value { font-size: 12.5px; color: #E0E0E0; line-height: 1.3; display: flex; align-items: center; justify-content: center; text-align: center; word-break: break-word; }

    .pmh-video-header-line { background-color: transparent !important; border-bottom: 1px solid rgba(255,255,255,0.1); padding: 4px 8px 0 8px !important; border-radius: 0; }
    .pmh-video-header-label { font-size: 11px !important; }
    .pmh-video-version-block { border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 6px; }
    .pmh-video-version-block:last-child { border-bottom: none; padding-bottom: 0; margin-bottom: 4px; }
    .pmh-video-data-line { margin-bottom: 2px !important; }

    /* 3. Plex 목록 페이지 포스터 아이콘/태그 (Plex UI 오버레이) */
    div[data-testid^="cellItem"] div[class*="PosterCard-card-"], div[class*="ListItem-container"] div[class*="ThumbCard-card-"], div[class*="ListItem-container"] div[class*="ThumbCard-imageContainer"], div[class*="MetadataPosterCard-container"] div[class*="Card-card-"] { position: relative; overflow: hidden; }

    .pmh-top-right-wrapper { position: absolute; top: 2px; right: 2px; z-index: 10; display: flex; flex-direction: column; align-items: flex-end; gap: 2px; pointer-events: none; }
    .plex-list-res-tag { position: relative; background-color: rgba(0, 0, 0, 0.7); color: #ffffff; font-size: 10px; font-weight: normal; padding: 1px 3px; border-radius: 3px; pointer-events: none; border: 1px solid rgba(255,255,255,0.1); opacity: 1; }
    .plex-list-play-external { position: relative; background-color: rgba(0, 0, 0, 0.6); color: #adb5bd; border-radius: 3px; width: 22px; height: 18px; display: flex; align-items: center; justify-content: center; cursor: pointer; text-decoration: none; border: 1px solid rgba(255, 255, 255, 0.1); opacity: 0; pointer-events: auto; transform: scale(0.9); transition: opacity 0.15s, transform 0.15s, background-color 0.2s; }
    .plex-list-play-external i { font-size: 10px; }
    .friend-fetch-btn { background-color: rgba(0, 0, 0, 0.7); color: #adb5bd; cursor: pointer; pointer-events: auto; opacity: 0.85; transition: opacity 0.15s, transform 0.15s, background-color 0.2s; }

    a:hover .plex-list-play-external, div[class*="PosterCard"]:hover .plex-list-play-external, div[class*="ThumbCard"]:hover .plex-list-play-external, div[class*="ListItem-container"]:hover .plex-list-play-external, div:hover > .pmh-top-right-wrapper .plex-list-play-external { opacity: 0.8; transform: scale(1); }
    a:hover .friend-fetch-btn, div[class*="PosterCard"]:hover .friend-fetch-btn, div[class*="ThumbCard"]:hover .friend-fetch-btn, div[class*="ListItem-container"]:hover .friend-fetch-btn, div:hover > .pmh-top-right-wrapper .friend-fetch-btn { opacity: 0.8; transform: scale(1); }
    .plex-list-play-external:hover, .friend-fetch-btn:hover { background-color: rgba(0, 0, 0, 0.9) !important; color: #ffffff !important; transform: scale(1.1) !important; opacity: 1 !important; }

    .plex-guid-list-box { display: inline; margin-left: 5px; color: #e5a00d; font-size: 11px; font-weight: normal; cursor: pointer; text-decoration: none; white-space: nowrap; transition: color 0.2s ease, text-decoration 0.2s ease; }
    .plex-guid-list-box:hover { text-decoration: underline !important; color: #ffc107 !important; opacity: 1 !important; text-shadow: 0 0 2px rgba(255,193,7,0.5); }
    .plex-list-multipath-badge { display: inline-block; background-color: #e5a00d; color: #1f1f1f; font-size: 10px; font-weight: bold; padding: 0px 4px; border-radius: 3px; margin: 1px 2px 0 4px; vertical-align: top; }

    @keyframes pmhSoftFade { 0% { opacity: 0.2; transform: translateY(-1px); } 100% { opacity: 1; transform: translateY(0); } }
    .pmh-fade-update { animation: pmhSoftFade 0.2s ease-out forwards; }
    .pmh-corrupt-badge { color: #e5a00d !important; font-weight: 900 !important; font-size: 11.5px !important; padding: 0px 5px !important; right: 2px; transform: scaleX(1.3); transform-origin: center; display: inline-block; letter-spacing: -1px; }
    .pmh-match-badge { display: block; width: max-content; background-color: rgba(0, 0, 0, 0.8); color: #e5a00d; border: 1px solid rgba(229, 160, 13, 0.4); font-size: 11px; font-weight: normal; padding: 2px 5px; border-radius: 4px; margin: 0; line-height: 1.2; letter-spacing: -0.2px; box-shadow: 0 1px 2px rgba(0,0,0,0.5); }

    @keyframes pmhBlink { 0%, 100% { opacity: 1; text-shadow: 0 0 8px rgba(255,193,7,0.8); } 50% { opacity: 0.4; text-shadow: none; } }

    /* 4. 상단 네비게이션 컨트롤 UI & 드롭다운 */
    #pmdv-controls { margin-right: 10px; order: -1; display: flex; align-items: center; gap: 5px; }
    #pmdv-controls span.ctrl-label { font-size: 11px !important; color: #aaa; font-weight: bold; margin-right: 2px; margin-left: 2px; }
    #pmdv-controls input[type="number"] { width: 35px; text-align: center; padding: 2px; font-size: 11px; background-color: rgba(0,0,0,0.2); border: 1px solid #555; color: #eee; border-radius: 3px; }
    #pmdv-controls button { font-size: 11px !important; padding: 3px 6px !important; margin: 0 !important; height: auto !important; line-height: 1.4 !important; color: #eee !important; background-color: rgba(0,0,0,0.2) !important; border: 1px solid #555 !important; border-radius: 4px !important; vertical-align: middle; cursor: pointer; white-space: nowrap; transition: background-color 0.2s ease; }
    #pmdv-controls button:hover { background-color: rgba(0,0,0,0.4) !important; border-color: #aaa !important; }
    #pmdv-controls button.on { background-color: #e5a00d !important; color: #1f1f1f !important; border-color: #e5a00d !important; font-weight: bold; }
    #pmdv-controls button.on:hover { background-color: #d4910c !important; }

    #pmh-tool-dropdown { position: absolute; background-color: rgba(25, 28, 32, 0.98); border: 1px solid #444; border-radius: 6px; min-width: 280px; max-width: 450px; z-index: 99999; box-shadow: 0 8px 20px rgba(0,0,0,0.7); display: none; backdrop-filter: blur(5px); }
    .pmh-tool-item { color: #ccc; font-size: 12px; transition: 0.2s; border-bottom: 1px solid #333; }
    .pmh-tool-item:last-child { border-bottom: none; }
    .pmh-tool-item:hover { background-color: rgba(255, 255, 255, 0.08) !important; }
    .pmh-tool-item.pmh-running-tool:hover { background-color: rgba(229, 160, 13, 0.15) !important; }
    #pmh-tool-dropdown .pmh-tool-run-btn:hover { color: #e5a00d; font-weight: bold; cursor: pointer; }

    .pmh-tool-delete-btn { color: rgba(255, 255, 255, 0.4) !important; transition: color 0.2s, transform 0.2s; }
    .pmh-tool-delete-btn:hover { color: #ff6b6b !important; transform: scale(1.1); }
    .pmh-action-icon:hover { transform: scale(1.1); color: #fff !important; }
    .pmh-tool-install-bundle-btn { color: #51a351 !important; transition: color 0.2s, transform 0.2s; opacity: 0.7; }
    .pmh-tool-install-bundle-btn:hover { opacity: 1.0; transform: scale(1.1); text-shadow: 0 0 5px rgba(81,163,81,0.5); }

    /* 5. 클라이언트 전역 설정(모달) CSS 자립형 요소 (마스터 연결 전 렌더링 대비 필수 폼 요소만 유지) */
    .pmh-form-group { margin-bottom: 15px; text-align: left; }
    .pmh-form-label { display: block; color: #e5a00d; font-size: 12px; margin-bottom: 6px; font-weight: bold; text-align: left; }
    .pmh-form-header { margin-top: 20px; margin-bottom: 12px; font-size: 14px; font-weight: bold; color: #2f96b4; border-bottom: 1px solid #333; padding-bottom: 6px; text-align: left; }
    .pmh-input-text { width: 100%; padding: 8px; background: #111; border: 1px solid #444; color: #fff; border-radius: 4px; font-size: 13px; transition: border-color 0.2s; box-sizing: border-box; text-align: left; }
    .pmh-input-text:focus { outline: none; border-color: #e5a00d; }
    .pmh-input-select { width: 100%; padding: 8px; background: #111; border: 1px solid #444; color: #fff; border-radius: 4px; font-size: 13px; cursor: pointer; box-sizing: border-box; text-align: left; }
    .pmh-path-mapping-row { display: flex; gap: 10px; margin-bottom: 8px; align-items: center; }
    .pmh-btn-remove-row { background: #bd362f; color: #fff; border: none; border-radius: 4px; padding: 6px 10px; cursor: pointer; }

    /* YAML 에디터 & 모달 리사이징 CSS */
    #pmh-client-settings-modal .pmh-modal-content {
        resize: both;
        overflow: hidden;
        min-width: 500px;
        min-height: 400px;
    }
    
    .pmh-yaml-container {
        width: 100%;
        background: #1e1e1e;
        border: 1px solid #444;
        border-radius: 4px;
        display: flex;
        flex-direction: column;
        flex-grow: 1;
        min-height: 300px;
    }

    .pmh-yaml-container textarea {
        flex-grow: 1;
        margin: 0;
        padding: 15px;
        border: none;
        outline: none;
        background: transparent;
        color: #a6e22e;
        font-family: Consolas, Monaco, "Courier New", monospace;
        font-size: 13px;
        line-height: 1.5;
        tab-size: 2;
        white-space: pre;
        word-wrap: normal;
        resize: none;
        width: 100%;
        height: 100%;
        box-sizing: border-box;
        overflow: auto;
    }

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
                    errorLog("[XML Parse] Error during match extraction", e);
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
                    <div class="pmh-panel-title"><i class="fas fa-wrench"></i> <span id="pmh-panel-title-text"></span></div>
                    <div style="display:flex; align-items:center;">
                        <a href="#" class="pmh-panel-minimize" id="pmh-panel-minimize" title="최소화/복원"><i class="fas fa-minus"></i></a>
                        <a href="#" class="pmh-panel-close" id="pmh-panel-close"><i class="fas fa-times"></i></a>
                    </div>
                </div>
                <div class="pmh-panel-content" id="pmh-panel-content"></div>
            `;
            document.body.appendChild(panel);

            document.getElementById('pmh-panel-close').addEventListener('click', (e) => {
                e.preventDefault(); e.stopPropagation();
                panel.style.display = 'none';
                window._pmh_is_minimized = false;
                GM_setValue('pmh_last_open_tool', '');
            });
            document.getElementById('pmh-panel-minimize').addEventListener('click', (e) => {
                e.preventDefault(); e.stopPropagation();
                window._pmh_is_minimized = !window._pmh_is_minimized;
                const isMin = panel.classList.toggle('pmh-panel-minimized');
                e.currentTarget.innerHTML = isMin ? '<i class="fas fa-window-restore"></i>' : '<i class="fas fa-minus"></i>';
            });
            makeDraggable(panel, document.getElementById('pmh-panel-header'));
        }
        document.getElementById('pmh-panel-title-text').innerText = title;
        document.getElementById('pmh-panel-content').innerHTML = htmlContent;
        panel.style.display = 'flex';

        if (window._pmh_is_minimized) {
            panel.classList.add('pmh-panel-minimized');
            const minBtn = document.getElementById('pmh-panel-minimize');
            if(minBtn) minBtn.innerHTML = '<i class="fas fa-window-restore"></i>';
        } else {
            panel.classList.remove('pmh-panel-minimized');
            const minBtn = document.getElementById('pmh-panel-minimize');
            if(minBtn) minBtn.innerHTML = '<i class="fas fa-minus"></i>';
        }
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
    // Shift 키 상태 감지 및 커스텀 툴팁 동적 UI
    // ==========================================
    GM_addStyle(`
        #pmh-custom-tooltip {
            position: fixed;
            background-color: rgba(20, 23, 26, 0.95);
            color: #eee;
            border: 1px solid #e5a00d;
            padding: 8px 12px;
            border-radius: 6px;
            font-size: 12px;
            font-weight: normal;
            pointer-events: none;
            z-index: 9999999;
            opacity: 0;
            visibility: hidden;
            transition: opacity 0.1s ease-in-out;
            box-shadow: 0 4px 15px rgba(0,0,0,0.6);
            white-space: pre-wrap;
            text-align: center;
            line-height: 1.4;
            transform: translate(-50%, -100%);
            margin-top: -15px;
        }
        #pmh-custom-tooltip .hl { color: #f89406; font-weight: bold; }
    `);

    let isShiftPressed = false;
    const customTooltip = document.createElement('div');
    customTooltip.id = 'pmh-custom-tooltip';
    document.body.appendChild(customTooltip);

    let currentHoverTarget = null;
    let lastMouseX = 0;
    let lastMouseY = 0;

    function getDynamicTooltipText(el, isShift) {
        if (el.id === 'pmh-btn-rematch') {
            return isShift 
                ? "<span class='hl'><i class='fas fa-broom'></i> 클린 리매칭 (Shift+클릭)</span>\n<span style='color:#999;'>언매치 후 클린 리매칭</span>"
                : "<span style='color:#2f96b4;'><i class='fas fa-link'></i> 일반 리매칭 (클릭)</span>\n<span style='color:#999;'>(Shift+클릭 시 클린 리매칭)</span>";
        }
        if (el.classList.contains('plex-path-scan-link')) {
            return isShift 
                ? "<span class='hl'><i class='fas fa-hdd'></i> VFS 갱신 + 스캔 (Shift+클릭)</span>\n<span style='color:#999;'>VFS/Refresh 후 경로 스캔</span>"
                : "<span style='color:#2f96b4;'><i class='fas fa-search'></i> 경로 스캔 (클릭)</span>\n<span style='color:#999;'>(Shift+클릭 시 VFS/Refresh 후 스캔)</span>";
        }
        if (el.classList.contains('plex-guid-list-box')) {
            if (el.dataset.refreshing || el.innerHTML.includes('fa-spinner')) return "";
            
            const baseTxt = el.textContent;
            const isUnmatched = el.dataset.unmatched === 'true';
            
            if (isShift) {
                return `<span class='hl'><i class='fas fa-broom'></i> 클린 리매칭 (Shift+클릭)</span>\n<span style='color:#999;'>언매치 후 클린 리매칭</span>`;
            } else {
                if (isUnmatched) {
                    return `<span style='color:#2f96b4;'><i class='fas fa-magic'></i> 자동 매칭 (클릭)</span>\n<span style='color:#999;'>(Shift+클릭 시 클린 리매칭)</span>`;
                } else {
                    return `<span style='color:#2f96b4;'><i class='fas fa-bolt'></i> 메타 새로고침 (클릭)</span>\n<span style='color:#999;'>(Shift+클릭 시 클린 리매칭)</span>`;
                }
            }
        }
        return "";
    }

    function positionTooltip(x, y) {
        customTooltip.style.left = x + 'px';
        customTooltip.style.top = y + 'px';
        
        customTooltip.style.transform = 'translate(-50%, 0)';
        customTooltip.style.marginTop = '20px';
        
        const rect = customTooltip.getBoundingClientRect();
        
        if (rect.left < 5) customTooltip.style.left = (rect.width / 2 + 5) + 'px';
        if (rect.right > window.innerWidth - 5) customTooltip.style.left = (window.innerWidth - rect.width / 2 - 5) + 'px';
        
        if (rect.bottom > window.innerHeight - 5) {
            customTooltip.style.transform = 'translate(-50%, -100%)';
            customTooltip.style.marginTop = '-20px';
        }
    }

    function updateShiftUI(isShift) {
        const btnRematch = document.getElementById('pmh-btn-rematch');
        if (btnRematch && !btnRematch.dataset.refreshing) {
            if (isShift) {
                btnRematch.innerHTML = '<i class="fas fa-broom" style="font-size: 10px; margin-right: 2px;"></i>클린 리매칭';
                btnRematch.style.color = '#f89406'; 
            } else {
                btnRematch.innerHTML = '<i class="fas fa-link" style="font-size: 10px; margin-right: 2px;"></i>메타 리매칭';
                btnRematch.style.color = '#adb5bd';
            }
        }

        document.querySelectorAll('.plex-path-scan-link').forEach(link => {
            const isLastNode = link.dataset.type !== 'directory';
            if (isShift) {
                if (!link.dataset.origColor) link.dataset.origColor = link.style.color;
                link.style.color = '#2f96b4';
                link.style.textDecoration = 'underline dashed';
            } else {
                link.style.color = link.dataset.origColor || (isLastNode ? '#e5a00d' : '#9E9E9E');
                link.style.textDecoration = 'none';
            }
        });

        document.querySelectorAll('.plex-guid-list-box').forEach(box => {
            if (!box.dataset.refreshing && !box.innerHTML.includes('fa-spinner')) {
                if (isShift) {
                    if (!box.dataset.origColor) box.dataset.origColor = box.style.color;
                    box.style.color = '#f89406'; 
                } else {
                    box.style.color = box.dataset.origColor || '#e5a00d';
                }
            }
        });

        if (currentHoverTarget) {
            const textHTML = getDynamicTooltipText(currentHoverTarget, isShift);
            if (textHTML) {
                customTooltip.innerHTML = textHTML;
                positionTooltip(lastMouseX, lastMouseY);
            }
        }
    }

    document.addEventListener('mouseover', (e) => {
        const target = e.target.closest('#pmh-btn-rematch, .plex-path-scan-link, .plex-guid-list-box');
        if (target) {
            if (target.hasAttribute('title')) target.removeAttribute('title');
            
            currentHoverTarget = target;
            lastMouseX = e.clientX;
            lastMouseY = e.clientY;
            
            const textHTML = getDynamicTooltipText(target, isShiftPressed);
            if (textHTML) {
                customTooltip.innerHTML = textHTML;
                customTooltip.style.visibility = 'visible';
                customTooltip.style.opacity = '1';
                positionTooltip(e.clientX, e.clientY);
            }
        }
    });

    document.addEventListener('mousemove', (e) => {
        if (currentHoverTarget) {
            lastMouseX = e.clientX;
            lastMouseY = e.clientY;
            positionTooltip(e.clientX, e.clientY);
        }
    });

    document.addEventListener('mouseout', (e) => {
        if (currentHoverTarget) {
            if (e.relatedTarget && currentHoverTarget.contains(e.relatedTarget)) return;
            
            currentHoverTarget = null;
            customTooltip.style.opacity = '0';
            setTimeout(() => {
                if (!currentHoverTarget) customTooltip.style.visibility = 'hidden';
            }, 150);
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Shift' && !isShiftPressed) {
            isShiftPressed = true;
            updateShiftUI(true);
        }
    });
    document.addEventListener('keyup', (e) => {
        if (e.key === 'Shift' && isShiftPressed) {
            isShiftPressed = false;
            updateShiftUI(false);
        }
    });
    window.addEventListener('blur', () => {
        if (isShiftPressed) {
            isShiftPressed = false;
            updateShiftUI(false);
        }
    });

    // ==========================================
    // API Key 보안 서명 생성 함수
    // ==========================================
    async function generateSecureHeader(apiKey) {
        if (!apiKey) return "";

        const timestamp = Math.floor(Date.now() / 10000) * 10;
        const payload = `${apiKey}:${timestamp}`;

        if (window.crypto && window.crypto.subtle) {
            try {
                const encoder = new TextEncoder();
                const data = encoder.encode(payload);
                const hashBuffer = await crypto.subtle.digest('SHA-256', data);
                const hashArray = Array.from(new Uint8Array(hashBuffer));
                const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
                return `${timestamp}.${hashHex}`;
            } catch(e) {}
        }
        
        function sha256_fallback(ascii) {
            function rightRotate(value, amount) { return (value>>>amount) | (value<<(32 - amount)); }
            var mathPow = Math.pow; var maxWord = mathPow(2, 32); var lengthProperty = 'length'; var i, j;
            var result = '', words = [], asciiBitLength = ascii[lengthProperty]*8;
            var hash = [1779033703, 3144134277, 1013904242, 2773480762, 1359893119, 2600822924, 528734635, 1541459225];
            var k = [42853323, 718787259, 928959415, 2272392833, 2952996808, 3624381080, 31158534, 130281384, 396448439, 60092209, 106426741, 271733878, 439062322, 608135816, 933827115, 1192892854, 1426881987, 274413831, 273048592, 130381442, 3238371032, 137330761, 3326164213, 140683074, 3514216896, 157297316, 3629474719, 158914611, 4016624838, 163013233, 4068413645, 166440552, 4287869389, 172605382, 4350106203, 185623062, 127289335, 3383896504, 321870505, 3450917387, 513364230, 3603417383, 622340539, 3615206979, 762283084, 3753716616, 908128362, 3816654763, 1076239103, 3892794017, 1221768822, 3949822452, 1391007871, 4014909180, 1459954752, 4124956100, 1604104925, 4153066914, 1709405628, 4192634456, 1968840628, 4252554790, 2197607755, 4293915123];
            for (i = 0; i < ascii[lengthProperty]; i++) words[i>>>2] |= (ascii.charCodeAt(i)&0xff)<<(24 - (i%4)*8);
            words[asciiBitLength>>>5] |= 0x80<<(24 - (asciiBitLength%32));
            words[(((asciiBitLength + 64)>>>9)<<4) + 15] = asciiBitLength;
            for (i = 0; i < words[lengthProperty]; i += 16) {
                var a = hash[0], b = hash[1], c = hash[2], d = hash[3], e = hash[4], f = hash[5], g = hash[6], h = hash[7];
                for (j = 0; j < 64; j++) {
                    var w = words[i+j];
                    if (j < 16) w = words[i+j];
                    else {
                        var w15 = words[i+j-15], w2 = words[i+j-2];
                        w = words[i+j] = ((rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15>>>3)) + words[i+j-7] + (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2>>>10)) + words[i+j-16])|0;
                    }
                    var temp1 = (h + (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25)) + ((e&f) ^ (~e&g)) + k[j] + w)|0;
                    var temp2 = ((rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22)) + ((a&b) ^ (a&c) ^ (b&c)))|0;
                    h = g; g = f; f = e; e = (d + temp1)|0; d = c; c = b; b = a; a = (temp1 + temp2)|0;
                }
                hash[0] = (hash[0] + a)|0; hash[1] = (hash[1] + b)|0; hash[2] = (hash[2] + c)|0; hash[3] = (hash[3] + d)|0;
                hash[4] = (hash[4] + e)|0; hash[5] = (hash[5] + f)|0; hash[6] = (hash[6] + g)|0; hash[7] = (hash[7] + h)|0;
            }
            for (i = 0; i < 8; i++) {
                for (j = 3; j + 1; j--) {
                    var byteVal = (hash[i]>>(j*8))&255;
                    result += ((byteVal < 16) ? '0' : '') + byteVal.toString(16);
                }
            }
            return result;
        }

        const fallbackHash = sha256_fallback(payload);
        return `${timestamp}.${fallbackHash}`;
    }

    // ==========================================
    // 1. 설정 및 로깅 / 업데이트 체크
    // ==========================================
    const CURRENT_VERSION = typeof GM_info !== 'undefined' ? GM_info.script.version : "0.0.0";
    const INFO_YAML_URL = "https://raw.githubusercontent.com/golmog/plex_meta_helper/main/info.yaml";
    const CLIENT_SETTINGS_KEY = 'pmh_client_settings';
    let ServerConfig = { USER_TAGS: {}, DISPLAY_PATH_PREFIXES_TO_REMOVE: [], SERVERS: [] };

    function isIgnoredItem(url, iid, domElement = null) {
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

        if (domElement && domElement.nodeType === 1) {
            try {
                const trashIcon = domElement.querySelector('[aria-label*="휴지통"], [class*="trashCircle"], [class*="TrashBadge"]');
                if (trashIcon) return true;
            } catch (e) {
            }
        }

        return false;
    }

    function isNewerVersion(current, latest) {
        if (!current || !latest) return false;
        const c = String(current).split('.').map(Number);
        const l = String(latest).split('.').map(Number);
        for(let i=0; i<3; i++) {
            if((l[i]||0) > (c[i]||0)) return true;
            if((l[i]||0) < (c[i]||0)) return false;
        }
        return false;
    }

    async function pingLocalServer() {
        if (!ServerConfig.SERVERS || ServerConfig.SERVERS.length === 0) return {};
        log("[Ping] Checking versions for all registered local python servers...");

        const secureToken = await generateSecureHeader(ClientSettings.masterApiKey);
        const results = {};

        const promises = ServerConfig.SERVERS.map(srv => {
            if (!srv.relayUrl) return Promise.resolve();
            return new Promise((resolve) => {
                GM_xmlhttpRequest({
                    method: "GET", url: `${srv.relayUrl}/ping`,
                    headers: { "X-PMH-Signature": secureToken },
                    timeout: 2000,
                    onload: (res) => {
                        if (res.status === 200) {
                            try {
                                const jsonRes = JSON.parse(res.responseText);
                                const ver = jsonRes.version || "0.0.0";
                                results[srv.machineIdentifier] = { 
                                    status: 'ok', version: ver, name: srv.name, 
                                    ignore_res_section: jsonRes.ignore_res_section || "" 
                                };
                            } catch(e) {
                                results[srv.machineIdentifier] = { status: 'error', msg: 'JSON 파싱 오류', name: srv.name };
                            }
                        } else if (res.status === 426) {
                            results[srv.machineIdentifier] = { status: 'restart_required', msg: '재시작 필요 (업데이트 대기)', name: srv.name };
                        } else if (res.status === 401) {
                            results[srv.machineIdentifier] = { status: 'error', msg: '인증 거부 (API 키 불일치)', name: srv.name };
                        } else if (res.status === 429) {
                            results[srv.machineIdentifier] = { status: 'error', msg: 'Fail2Ban IP 차단됨', name: srv.name };
                        } else {
                            results[srv.machineIdentifier] = { status: 'error', msg: `서버 응답 오류 (HTTP ${res.status})`, name: srv.name };
                        }
                        resolve();
                    },
                    onerror: () => {
                        results[srv.machineIdentifier] = { status: 'error', msg: '서버 꺼짐 또는 네트워크 단절', name: srv.name };
                        resolve();
                    },
                    ontimeout: () => {
                        results[srv.machineIdentifier] = { status: 'error', msg: '서버 응답 시간 초과', name: srv.name };
                        resolve();
                    }
                });
            });
        });

        await Promise.all(promises);
        return results;
    }

    function fetchLatestVersion(force = false) {
        return new Promise(async (resolve) => {
            if (ClientSettings.devMode) {
                log("[Update] DEV_MODE is enabled. Skipping GitHub update checks.");
                resolve({ skipped: true, uiNeedsUpdate: false });
                return;
            }

            if (!force && ServerConfig.AUTO_UPDATE_CHECK === false) {
                log("[Update] Auto-update check is disabled by server config.");
                resolve({ skipped: true, uiNeedsUpdate: false });
                return;
            }

            if (!force) {
                const lastCheck = GM_getValue('pmh_last_update_check', 0);
                if (Date.now() - lastCheck < 24 * 60 * 60 * 1000) {
                    log("[Update] Background update check skipped (checked recently).");
                    const localPyVers = await pingLocalServer();
                    window._pmh_latest_ping_results = localPyVers;

                    let hasServerError = false;
                    let errorDetails = [];

                    if (ServerConfig.SERVERS) {
                        for (const srv of ServerConfig.SERVERS) {
                            const pRes = localPyVers[srv.machineIdentifier];
                            if (!pRes || pRes.status === 'error') {
                                hasServerError = true;
                                errorDetails.push(`[${srv.name}] ${pRes ? pRes.msg : '정보 없음'}`);
                            }
                        }
                    }

                    const wasError = GM_getValue('pmh_server_connection_error', false);
                    GM_setValue('pmh_server_error_details', JSON.stringify(errorDetails));

                    if (wasError !== hasServerError) {
                        GM_setValue('pmh_server_connection_error', hasServerError);
                        resolve({ skipped: true, uiNeedsUpdate: true });
                        return;
                    }
                    resolve({ skipped: true, uiNeedsUpdate: false });
                    return;
                }
            }

            log(`[Update] Requesting full update info from Master Server... (force: ${force})`);
            const localServerVersions = await pingLocalServer();
            window._pmh_latest_ping_results = localServerVersions;

            const secureToken = await generateSecureHeader(ClientSettings.masterApiKey);

            GM_xmlhttpRequest({
                method: "GET",
                url: `${ClientSettings.masterUrl}/api/master/check_update?force=${force}`,
                headers: { "X-PMH-Signature": secureToken },
                timeout: 8000,
                onload: (res) => {
                    if (res.status === 200) {
                        try {
                            const data = JSON.parse(res.responseText);
                            let latestVer = data.latest_version;
                            let reqRestart = false;

                            if (latestVer) {
                                if (latestVer.includes('-server')) {
                                    reqRestart = true;
                                    latestVer = latestVer.replace('-server', '');
                                }

                                GM_setValue('pmh_latest_version', latestVer);
                                GM_setValue('pmh_server_restart_required', reqRestart);
                                GM_setValue('pmh_last_update_check', Date.now());
                                GM_setValue('pmh_bundled_tools', JSON.stringify(data.bundled_tools || []));

                                resolve({ skipped: false, targetVer: latestVer, localPyVers: localServerVersions, msg: "성공", error: false, reqRestart });
                            } else {
                                resolve({ skipped: false, targetVer: null, msg: "버전 정보 형식 오류", error: true });
                            }
                        } catch (e) {
                            resolve({ skipped: false, targetVer: null, msg: "JSON 파싱 실패", error: true });
                        }
                    } else {
                        fallbackToGitHub(resolve, localServerVersions);
                    }
                },
                onerror: () => fallbackToGitHub(resolve, localServerVersions),
                ontimeout: () => fallbackToGitHub(resolve, localServerVersions)
            });
        });
    }

    function fallbackToGitHub(resolve, localServerVersions) {
        log(`[Update] Master Server timeout/error. Fallback to GitHub directly (${INFO_YAML_URL})...`);
        const noCacheUrl = `${INFO_YAML_URL}?t=${Date.now()}`;

        GM_xmlhttpRequest({
            method: "GET", url: noCacheUrl,
            timeout: 5000,
            onload: (res) => {
                if (res.status === 200) {
                    const match = res.responseText.match(/version:\s*['"]?([^'"\r\n]+)['"]?/);
                    let latestVer = match ? match[1] : null;
                    let reqRestart = false;

                    if (latestVer) {
                        if (latestVer.includes('-server')) {
                            reqRestart = true;
                            latestVer = latestVer.replace('-server', '');
                        }
                        GM_setValue('pmh_latest_version', latestVer);
                        GM_setValue('pmh_server_restart_required', reqRestart);
                        GM_setValue('pmh_last_update_check', Date.now());

                        resolve({ skipped: false, targetVer: latestVer, localPyVers: localServerVersions, msg: "마스터 통신 실패 (GitHub 확인 성공)", error: false, reqRestart });
                    } else {
                        resolve({ skipped: false, targetVer: null, msg: "GitHub 버전 파싱 오류", error: true });
                    }
                } else {
                    resolve({ skipped: false, targetVer: null, msg: "마스터 서버 & GitHub 동시 장애", error: true });
                }
            },
            onerror: () => resolve({ skipped: false, targetVer: null, msg: "전체 네트워크 장애", error: true }),
            ontimeout: () => resolve({ skipped: false, targetVer: null, msg: "응답 지연 초과", error: true })
        });
    }

    async function checkUpdate(force = false) {
        if (ClientSettings.devMode) {
            log("[Update] DEV_MODE is enabled. Skipping checkUpdate entirely.");
            return null;
        }

        const result = await fetchLatestVersion(force);

        if (result.skipped) {
            if (result.uiNeedsUpdate) {
                const ctrl = document.getElementById('pmdv-controls');
                if (ctrl) { ctrl.remove(); injectControlUI(); }
            }
            return null;
        }

        if (!result.error) {
            const latestKnownVer = result.targetVer;
            let needsUpdate = isNewerVersion(CURRENT_VERSION, latestKnownVer);

            let hasServerError = false;
            let errorDetails = [];

            if (ServerConfig.SERVERS) {
                for (const srv of ServerConfig.SERVERS) {
                    const pRes = result.localPyVers[srv.machineIdentifier];
                    if (pRes && pRes.status === 'ok') {
                        if (isNewerVersion(pRes.version, latestKnownVer)) needsUpdate = true;
                    } else {
                        hasServerError = true;
                        errorDetails.push(`[${srv.name}] ${pRes ? pRes.msg : '정보 없음'}`);
                    }
                }
            }

            GM_setValue('pmh_server_connection_error', hasServerError);
            GM_setValue('pmh_server_error_details', JSON.stringify(errorDetails));

            const ctrl = document.getElementById('pmdv-controls');
            if (ctrl) { ctrl.remove(); injectControlUI(); }
        }
        return result;
    }

    async function triggerServerUpdate(showStatusMsg, targetServers) {
        if (!targetServers || targetServers.length === 0) return true;

        const spinner = `<i class="fas fa-spinner fa-spin" style="margin-right: 5px;"></i>`;
        log(`[Server Update] Dry-run check for ${targetServers.length} server(s)...`);

        showStatusMsg(`${spinner}업데이트 전 서버 실행 상태 확인 중...`, '#ccc', 0);

        const secureToken = await generateSecureHeader(ClientSettings.masterApiKey);
        let totalRunningCount = 0;
        let checkFailed = false;

        const checkPromises = targetServers.map(srv => {
            return new Promise((resolve) => {
                GM_xmlhttpRequest({
                    method: "GET", url: `${srv.relayUrl}/tools?t=${Date.now()}`,
                    headers: { "X-PMH-Signature": secureToken },
                    timeout: 10000,
                    onload: (res) => {
                        if (res.status === 200) {
                            try {
                                const data = JSON.parse(res.responseText);
                                if (data.dashboard && data.dashboard.running) {
                                    resolve(data.dashboard.running.length);
                                } else { resolve(0); }
                            } catch(e) { resolve(0); }
                        } else if (res.status === 426) {
                            resolve(0);
                        } else {
                            resolve(-1);
                        }
                    },
                    onerror: () => resolve(-1),
                    ontimeout: () => resolve(-1)
                });
            });
        });

        const checkResults = await Promise.all(checkPromises);
        for (const count of checkResults) {
            if (count === -1) checkFailed = true;
            else totalRunningCount += count;
        }

        if (checkFailed) {
            showStatusMsg(`<i class="fas fa-times-circle" style="margin-right: 4px;"></i>업데이트 중단 (통신 실패)`, '#bd362f', 4000);
            toastr.error("업데이트 전 서버 상태를 확인하는 중 통신 오류가 발생했습니다.<br>잠시 후 다시 시도해주세요.");
            return false;
        }

        let forceUpdate = false;
        const targetVer = targetServers[0].targetVer || GM_getValue('pmh_latest_version', '');
        const verStr = targetVer ? `(v${targetVer}) ` : '';

        showStatusMsg(`<i class="fas fa-pause-circle" style="margin-right: 4px;"></i>사용자 확인 대기 중...`, '#f89406', 0);

        if (totalRunningCount > 0) {
            const confirmed = confirm(`[경고] 현재 ${targetServers.length}대의 서버에서 총 ${totalRunningCount}개의 작업이 실행 중입니다.\n\n실행 중인 작업을 모두 강제로 중단하고 업데이트${verStr}를 진행하시겠습니까?`);
            if (!confirmed) {
                showStatusMsg(`<i class="fas fa-times-circle" style="margin-right: 4px;"></i>업데이트 취소됨`, '#bd362f', 4000);
                return false;
            }
            forceUpdate = true;
        } else {
            const confirmed = confirm(`실행 중인 작업이 없습니다. 안전하게 업데이트${verStr}를 진행하시겠습니까?\n\n(완료 후 서버(컨테이너)의 수동 재시작이 필요할 수 있습니다.)`);
            if (!confirmed) {
                showStatusMsg(`<i class="fas fa-times-circle" style="margin-right: 4px;"></i>업데이트 취소됨`, '#bd362f', 4000);
                return false;
            }
        }

        showStatusMsg(`${spinner}서버 업데이트 요청 전송 중...`, '#ccc', 0);

        const updatePromises = targetServers.map(async srv => {
            return new Promise((resolve) => {
                GM_xmlhttpRequest({
                    method: "POST", url: `${srv.relayUrl}/admin/update`,
                    headers: { "Content-Type": "application/json", "X-PMH-Signature": secureToken },
                    data: JSON.stringify({ force: forceUpdate }),
                    timeout: 30000,
                    onload: (res) => {
                        if (res.status === 200) {
                            resolve({ server: srv, success: true });
                        } else {
                            resolve({ server: srv, success: false, msg: `HTTP ${res.status}` });
                        }
                    },
                    onerror: () => resolve({ server: srv, success: false, msg: "Network Error" }),
                    ontimeout: () => resolve({ server: srv, success: false, msg: "Timeout" })
                });
            });
        });

        const updateResults = await Promise.all(updatePromises);

        let successCount = 0;
        let criticalErrorMsg = '';

        for (const res of updateResults) {
            if (res.success) successCount++;
            else criticalErrorMsg = `[${res.server.name}] ${res.msg}`;
        }

        if (successCount === 0) {
            showStatusMsg(`<i class="fas fa-exclamation-triangle" style="margin-right: 4px;"></i>업데이트 실패`, '#bd362f', 5000);
            toastr.error(`${criticalErrorMsg}<br><br>업데이트 중 오류가 발생했습니다.`, "오류", {timeOut: 8000});
            return false;
        }

        const bundledToolsStr = GM_getValue('pmh_bundled_tools', '[]');
        const bundledTools = JSON.parse(bundledToolsStr);

        if (bundledTools.length > 0) {
            showStatusMsg(`${spinner}번들 툴 버전 확인 및 동기화 중...`, '#2f96b4', 0);
            const bundlePromises = targetServers.map(async (srv) => {
                try {
                    const toolsRes = await new Promise(r => {
                        GM_xmlhttpRequest({
                            method: "GET", url: `${srv.relayUrl}/tools`,
                            headers: { "X-PMH-Signature": secureToken },
                            timeout: 15000,
                            onload: r, onerror: r, ontimeout: r
                        });
                    });

                    if (toolsRes && toolsRes.status === 200) {
                        const installedTools = JSON.parse(toolsRes.responseText).tools || [];
                        const installPromises = [];

                        for (const bundle of bundledTools) {
                            const namespaceMatch = bundle.url.match(/raw\.githubusercontent\.com\/([^\/]+)\//);
                            const namespace = namespaceMatch ? namespaceMatch[1].replace(/[^a-zA-Z0-9]/g, '').toLowerCase() : '';
                            const expectedId = namespace && !bundle.id.startsWith(namespace + '_') ? `${namespace}_${bundle.id}` : bundle.id;

                            const isInstalled = installedTools.some(t => t.id === expectedId);

                            if (isInstalled && bundle.url) {
                                installPromises.push(new Promise(r => {
                                    GM_xmlhttpRequest({
                                        method: "POST", url: `${srv.relayUrl}/tools/install`,
                                        headers: { "Content-Type": "application/json", "X-PMH-Signature": secureToken },
                                        data: JSON.stringify({ url: bundle.url, target_id: expectedId }),
                                        timeout: 20000,
                                        onload: r, onerror: r, ontimeout: r
                                    });
                                }));
                            }
                        }
                        if (installPromises.length > 0) await Promise.all(installPromises);
                    }
                } catch(e) {}
            });
            await Promise.all(bundlePromises);
        }

        GM_setValue('pmh_last_update_check', Date.now());
        showStatusMsg(`<i class="fas fa-check-circle" style="margin-right: 4px;"></i>서버 및 번들 업데이트 완료!`, '#51a351', 3000);
        return true;
    }

    function getClientSettings() {
        const def = {
            masterUrl: "http://127.0.0.1:8899",
            masterApiKey: "",
            logLevel: "INFO",
            maxCacheSize: 5000,
            devMode: false,
            pathMappings: [],
            matchTryRefreshFirst: false,
            matchDoUnmatchFirst: false,
            matchSkipSimCheck: false,
            useCustomScore: false,
            customAgentScore: 80,
            manualMatch: false,
        };
        return { ...def, ...(GM_getValue(CLIENT_SETTINGS_KEY, {})) };
    }
    let ClientSettings = getClientSettings();

    function getLocalTime() {
        const d = new Date();
        const p = v => String(v).padStart(2, '0');
        const ms = String(d.getMilliseconds()).padStart(3, '0');
        return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${ms}`;
    }

    function log(...args) { if (ClientSettings.logLevel?.toUpperCase() === "DEBUG") console.log(`[PMH][${getLocalTime()}][DEBUG]`, ...args); }
    function infoLog(...args) { const lvl = ClientSettings.logLevel?.toUpperCase(); if (lvl === "DEBUG" || lvl === "INFO") console.info(`[PMH][${getLocalTime()}][INFO]`, ...args); }
    function warnLog(...args) { console.warn(`[PMH][${getLocalTime()}][WARN]`, ...args); }
    function errorLog(...args) { console.error(`[PMH][${getLocalTime()}][ERROR]`, ...args); }

    infoLog(`Script initialized. (v${CURRENT_VERSION}) Local In-Memory Cache mode.`);

    if (typeof toastr !== 'undefined') {
        toastr.options = { "closeButton": true, "progressBar": true, "positionClass": "toast-bottom-right", "timeOut": 5000, "extendedTimeOut": 1500, "showDuration": 300, "hideDuration": 500 };
    }

    // ==========================================
    // 2. 하이브리드(In-Memory + Storage) LRU 캐시
    // ==========================================
    const MAX_CACHE_SIZE = ClientSettings.maxCacheSize || 5000;
    const INDEX_KEY = 'pmh_cache_idx';
    const DATA_PREFIX = 'pmhc_';

    const memoryCache = new Map();
    const dirtyKeys = new Set();
    const deletedKeys = new Set();

    try {
        const storedIdx = GM_getValue(INDEX_KEY, null);
        let indexArray = storedIdx ? JSON.parse(storedIdx) : [];

        if (indexArray.length > MAX_CACHE_SIZE) {
            const keysToRemove = indexArray.slice(0, indexArray.length - MAX_CACHE_SIZE);
            indexArray = indexArray.slice(-MAX_CACHE_SIZE);
            keysToRemove.forEach(k => GM_deleteValue(DATA_PREFIX + k));
            GM_setValue(INDEX_KEY, JSON.stringify(indexArray));
        }

        indexArray.forEach(k => {
            const data = GM_getValue(DATA_PREFIX + k, null);
            if (data) memoryCache.set(k, JSON.parse(data));
        });
        infoLog(`[MemCache] Loaded ${memoryCache.size} individual items from storage.`);
    } catch(e) {
        errorLog("[MemCache] Failed to load persistent cache", e);
    }

    let saveCacheTimer = null;
    function saveCacheToStorage() {
        if (saveCacheTimer) clearTimeout(saveCacheTimer);

        saveCacheTimer = setTimeout(() => {
            try {
                if (dirtyKeys.size === 0 && deletedKeys.size === 0) return;

                GM_setValue(INDEX_KEY, JSON.stringify(Array.from(memoryCache.keys())));

                dirtyKeys.forEach(k => {
                    const val = memoryCache.get(k);
                    if (val !== undefined) GM_setValue(DATA_PREFIX + k, JSON.stringify(val));
                });

                deletedKeys.forEach(k => GM_deleteValue(DATA_PREFIX + k));

                log(`[MemCache] Storage Synced (Saved: ${dirtyKeys.size}, Deleted: ${deletedKeys.size})`);

                dirtyKeys.clear();
                deletedKeys.clear();
            } catch(e) {
                errorLog("[MemCache] Failed to sync to storage", e);
            }
        }, 2000);
    }

    function setMemoryCache(key, data) {
        if (memoryCache.has(key)) memoryCache.delete(key);

        memoryCache.set(key, data);
        dirtyKeys.add(key);
        deletedKeys.delete(key);

        if (memoryCache.size > MAX_CACHE_SIZE) {
            const oldestKey = memoryCache.keys().next().value;
            memoryCache.delete(oldestKey);
            dirtyKeys.delete(oldestKey);
            deletedKeys.add(oldestKey);
            log(`[MemCache] GC Evicted: ${oldestKey}`);
        }

        saveCacheToStorage();
    }

    function getMemoryCache(key) {
        return memoryCache.get(key) || null;
    }

    function deleteMemoryCache(key) {
        if (memoryCache.has(key)) {
            memoryCache.delete(key);
            dirtyKeys.delete(key);
            deletedKeys.add(key);
            log(`[MemCache] Deleted key: ${key}`);
            saveCacheToStorage();
        }
    }

    function clearMemoryCache() {
        memoryCache.clear();
        dirtyKeys.clear();
        deletedKeys.clear();

        const storedIdx = GM_getValue(INDEX_KEY, null);
        if (storedIdx) {
            try {
                const indexArray = JSON.parse(storedIdx);
                indexArray.forEach(k => GM_deleteValue(DATA_PREFIX + k));
            } catch(e){}
        }
        GM_deleteValue(INDEX_KEY);

        infoLog("[MemCache] All memory and persistent cache cleared by user.");
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
        listTag: GM_getValue(STATE_KEYS.TAG, false),
        listPlay: GM_getValue(STATE_KEYS.PLAY, false),
        listMultiPath: GM_getValue(STATE_KEYS.MULTIPATH, false),
        guidLen: GM_getValue(STATE_KEYS.LEN, 20),
        detailInfo: GM_getValue(STATE_KEYS.DETAIL, false)
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
    let globalAbortFlag = false;

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
        if (!machineIdentifier || !ServerConfig.SERVERS) return null;
        return ServerConfig.SERVERS.find(s => s.machineIdentifier === machineIdentifier) || null;
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

    async function makeRequest(url, method = "GET", data = null, apiKey = null, cancelToken = null) {
        log(`[API Req] [${method}] ${url}`);

        const secureToken = await generateSecureHeader(apiKey);

        return new Promise((resolve, reject) => {
            const headers = {
                "Accept": "application/json",
                "Connection": "close"
            };
            if (data) headers["Content-Type"] = "application/json";
            if (apiKey) headers["X-PMH-Signature"] = secureToken;

            let reqTimeout = 10000;

            const req = GM_xmlhttpRequest({
                method: method,
                url: url,
                timeout: reqTimeout,
                headers: headers,
                data: data ? JSON.stringify(data) : undefined,
                onload: r => {
                    activeRequests.delete(req);
                    if (r.status === 401) {
                        return reject(new Error("Unauthorized: API Key가 일치하지 않거나 만료되었습니다."));
                    }

                    if (r.status >= 200 && r.status < 300) {
                        try {
                            const parsed = JSON.parse(r.responseText);
                            if (parsed.error || parsed.status === "error") {
                                reject(new Error(parsed.error || parsed.message || "서버 처리 실패"));
                            } else {
                                resolve(parsed);
                            }
                        } catch(e) {
                            reject(new Error("JSON Parse Error: 서버 응답을 해석할 수 없습니다."));
                        }
                    } else {
                        try {
                            const errJson = JSON.parse(r.responseText);
                            const errMsg = errJson.error || errJson.message || `서버 오류 (HTTP ${r.status})`;
                            reject(new Error(errMsg));
                        } catch(e) {
                            reject(new Error(`서버 처리 실패 (HTTP ${r.status}): ${r.statusText || ''}`));
                        }
                    }
                },
                onerror: () => {
                    activeRequests.delete(req);
                    reject(new Error("Network Error: 서버에 연결할 수 없습니다."));
                },
                ontimeout: () => {
                    activeRequests.delete(req);
                    reject(new Error("Timeout: 서버 응답 시간 초과"));
                },
                onabort: () => {
                    activeRequests.delete(req);
                    reject(new Error("Aborted: 사용자에 의해 요청이 취소되었습니다."));
                }
            });
            activeRequests.add(req);

            if (cancelToken) {
                cancelToken.abort = () => {
                    req.abort();
                    activeRequests.delete(req);
                    reject(new Error("Aborted"));
                };
            }
        });
    }

    function fetchPlexMetaFallback(itemId, plexSrv) {
        return new Promise((resolve) => {
            if (!plexSrv) return resolve(null);
            const req = GM_xmlhttpRequest({
                method: 'GET',
                url: `${plexSrv.url}/library/metadata/${itemId}?includeMarkers=1&X-Plex-Token=${plexSrv.token}`,
                headers: { 'Accept': 'application/json' },
                timeout: 10000,
                onload: r => {
                    activeRequests.delete(req);
                    if (r.status === 404) {
                        resolve('DELETED');
                    } else if (r.status === 200) {
                        try { resolve(JSON.parse(r.responseText).MediaContainer.Metadata[0]); } 
                        catch(e) { resolve(null); }
                    } else {
                        resolve(null);
                    }
                },
                onerror: () => { activeRequests.delete(req); resolve(null); },
                ontimeout: () => { activeRequests.delete(req); resolve(null); },
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

    async function triggerPlexMediaAction(itemId, action, plexSrv, srvConfig, extraData = {}, cancelToken = null) {
        if (!srvConfig || !srvConfig.relayUrl) {
            errorLog(`[API] ❌ Cannot trigger '${action}' for Item ${itemId}: Missing Server Config.`);
            throw new Error("서버 설정이 없습니다.");
        }

        infoLog(`[API] 🚀 Requesting PMH Backend to perform '${action}' on Item: ${itemId} ...`);

        try {
            const res = await makeRequest(`${srvConfig.relayUrl}/media/${itemId}/${action}`, 'POST', { ...extraData }, ClientSettings.masterApiKey, cancelToken);

            if (res.status === 'queued' || res.status === 'success') {
                return true;
            }
            throw new Error(res.error || res.message || "예상치 못한 응답");

        } catch (err) {
            const errorMsg = err.message || err || "알 수 없는 오류";
            if (errorMsg.includes("Aborted")) {
                infoLog(`[API] 🛑 Action '${action}' was aborted by user.`);
                throw new Error("Cancelled");
            }
            errorLog(`[API] ❌ PMH Backend Action '${action}' failed for Item ${itemId}: ${errorMsg}`);
            throw new Error(errorMsg);
        }
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
        if (!filePath || !ServerConfig.USER_TAGS) return existingTags;
        let newTags = [...existingTags];
        const config = ServerConfig.USER_TAGS;
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
        if (!originalPath || !ClientSettings.pathMappings) return originalPath;
        for (const mapping of ClientSettings.pathMappings) {
            const localPrefix = mapping.localPrefix.replace(/\\/g, '/');
            if (originalPath.startsWith(mapping.serverPrefix)) {
                return localPrefix + originalPath.substring(mapping.serverPrefix.length);
            }
        }
        return originalPath;
    }
    window.getLocalPath = getLocalPath;

    function emphasizeFileName(path) {
        let dp = path;
        ServerConfig.DISPLAY_PATH_PREFIXES_TO_REMOVE.forEach(p => { if (dp.startsWith(p)) dp = dp.substring(p.length); });
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

    function generateSplitPathHtml(fullPath, sectionId, itemType, tagsHtml) {
        if (!fullPath) return '';
        let displayPath = fullPath;
        let removedPrefix = "";

        ServerConfig.DISPLAY_PATH_PREFIXES_TO_REMOVE.forEach(p => {
            if (displayPath.startsWith(p)) {
                displayPath = displayPath.substring(p.length);
                removedPrefix = p;
            }
        });

        const isWin = displayPath.includes('\\');
        const sep = isWin ? '\\' : '/';
        const hasLeadingSep = displayPath.startsWith(sep);
        const segments = displayPath.split(sep).filter(Boolean);

        let html = tagsHtml || '';
        let currentAccumulatedPath = removedPrefix;

        if (!isWin && fullPath.startsWith('/') && !removedPrefix) {
            currentAccumulatedPath = '/';
        }

        if (hasLeadingSep) {
            html += `<span style="color:#999; margin-right:1px;">${sep}</span>`;
        }

        segments.forEach((seg, index) => {
            if (currentAccumulatedPath !== '/' && currentAccumulatedPath !== '') {
                if (!currentAccumulatedPath.endsWith(sep)) currentAccumulatedPath += sep;
            }
            currentAccumulatedPath += seg;

            const isLast = (index === segments.length - 1);
            const color = isLast ? '#e5a00d' : '#9E9E9E';
            const fontWeight = isLast ? 'normal' : 'normal';
            const clickType = isLast ? itemType : 'directory';

            html += `<a href="#" class="plex-path-scan-link" data-path="${currentAccumulatedPath}" data-section-id="${sectionId}" data-type="${clickType}" title="클릭: 단순 스캔 / Shift+클릭: VFS 갱신 후 스캔" style="color:${color}; font-weight:${fontWeight}; text-decoration:none; transition:0.2s;" onmouseover="this.style.color='#fff'; this.style.textDecoration='underline';" onmouseout="this.style.color='${color}'; this.style.textDecoration='none';">${seg}</a>`;

            if (!isLast) html += `<span style="color:#999; margin:0 1px;">${sep}</span>`;
        });

        return html;
    }

    function invalidateVisibleCaches(serverId) {
        const visibleMarkers = document.querySelectorAll('.pmh-render-marker');
        let count = 0;
        visibleMarkers.forEach(m => {
            const iid = m.getAttribute('data-iid');
            if (iid) {
                m.setAttribute('data-stale', 'true');
                if (typeof sessionRevalidated !== 'undefined') sessionRevalidated.delete(iid);
                count++;
            }
        });
        log(`[Cache] Marked ${count} visible items as stale for background refresh.`);
    }

    function encodePathSafe(pathStr) {
        if (!pathStr) return '';
        let encoded = encodeURIComponent(pathStr.replace(/\\/g, '/'));
        return encoded.replace(/\(/g, '%28')
                      .replace(/\)/g, '%29')
                      .replace(/'/g, '%27')
                      .replace(/"/g, '%22');
    }

    async function callPlexMateViaRelay(srvConfig, endpoint, paramsObj) {
        if (!srvConfig || !srvConfig.relayUrl) return Promise.reject("Invalid Server Config");
        const secureToken = await generateSecureHeader(ClientSettings.masterApiKey);

        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'POST',
                url: `${srvConfig.relayUrl}/mate${endpoint}`,
                headers: {
                    'Content-Type': 'application/json',
                    'X-PMH-Signature': secureToken
                },
                data: JSON.stringify(paramsObj),
                timeout: 3600000,
                onload: r => {
                    try {
                        const parsed = JSON.parse(r.responseText);
                        resolve(parsed);
                    }
                    catch(e) { reject("Parse Error"); }
                },
                onerror: () => reject("Network Error"),
                ontimeout: () => reject("Timeout Error")
            });
        });
    }

    // ==========================================
    // 5-1. Tool UI 렌더링 및 모니터링
    // ==========================================
    const PmhToolAPI = {
        call: async function(targetSrv, endpoint, method = "POST", data = null) {
            const secureToken = await generateSecureHeader(ClientSettings.masterApiKey);

            return new Promise((resolve, reject) => {
                const req = {
                    method: method,
                    url: `${targetSrv.relayUrl}${endpoint}`,
                    headers: {
                        "X-PMH-Signature": secureToken,
                        "Connection": "close"
                    },
                    timeout: 120000,
                    onload: (r) => {
                        if (r.status >= 200 && r.status < 300) {
                            resolve(r);
                        } else {
                            try {
                                const errJson = JSON.parse(r.responseText);

                                reject(new Error(errJson.error || errJson.message || `HTTP ${r.status} 에러`));
                            } catch(e) {
                                reject(new Error(`서버 처리 실패 (HTTP ${r.status})`));
                            }
                        }
                    },
                    onerror: () => reject(new Error("네트워크 연결 실패 (서버 다운 또는 방화벽)")),
                    ontimeout: () => reject(new Error("서버 응답 시간 초과"))
                };

                if (data && Object.keys(data).length > 0) {
                    req.headers["Content-Type"] = "application/json";
                    req.data = JSON.stringify(data);
                } else if (method === "POST" || method === "PUT") {
                    req.data = "";
                }

                GM_xmlhttpRequest(req);
            });
        },

        getUi: async function(toolId, targetSrv) {
            log(`[ToolAPI] Fetching UI Schema for ${toolId} from ${targetSrv.name}`);
            return this.call(targetSrv, `/tool/${toolId}/ui?server_id=${targetSrv.machineIdentifier}&_t=${Date.now()}`, "GET");
        },
        run: async function(toolId, targetSrv, reqData) {
            log(`[ToolAPI] Running action '${reqData.action_type}' on ${toolId}`);
            return this.call(targetSrv, `/tool/${toolId}/run`, "POST", reqData);
        },
        status: async function(toolId, targetSrv, taskId) {
            return this.call(targetSrv, `/tool/${toolId}/status?task_id=${taskId}&server_id=${targetSrv.machineIdentifier}`, "GET");
        },
        cancel: async function(toolId, targetSrv, taskId) {
            log(`[ToolAPI] Cancelling task on ${toolId}`);
            return this.call(targetSrv, `/tool/${toolId}/cancel`, "POST", { task_id: taskId, _server_id: targetSrv.machineIdentifier });
        }
    };

    async function openPmhToolUI(toolId, forceSrvIdx = null) {
        if (typeof PmhUICore === 'undefined') {
            toastr.error("UI 코어 모듈을 아직 로드하지 못했습니다. 잠시 후 다시 시도하세요.");
            return;
        }

        const globalCacheStr = GM_getValue(`pmh_tool_cache_global_${toolId}`, "{}");
        let globalCache = {}; try { globalCache = JSON.parse(globalCacheStr); } catch(e) {}

        let availableServerIndices = (window._pmh_tool_server_map?.[toolId] || []).map(Number);
        if (availableServerIndices.length === 0) availableServerIndices = ServerConfig.SERVERS.map((_, i) => i);

        let srvIdx = (forceSrvIdx !== null && forceSrvIdx !== undefined) ? Number(forceSrvIdx) : (globalCache['target_server_idx'] || 0);
        if (!availableServerIndices.includes(srvIdx)) srvIdx = availableServerIndices.length > 0 ? availableServerIndices[0] : 0;

        globalCache['target_server_idx'] = srvIdx; GM_setValue(`pmh_tool_cache_global_${toolId}`, JSON.stringify(globalCache));

        const targetSrv = ServerConfig.SERVERS[srvIdx];
        if (!targetSrv) return toastr.error("서버 설정이 유효하지 않습니다.");

        window.showPmhToolPanel(toolId, "로딩 중...", `<div id="pmh_common_tool_container" style="text-align:center;"><i class="fas fa-spinner fa-spin fa-2x" style="color:#e5a00d;"></i><br><br>UI 스키마 로드 중...</div>`);

        try {
            const res = await PmhToolAPI.getUi(toolId, targetSrv);
            const uiSchema = JSON.parse(res.responseText);

            document.getElementById('pmh-panel-title-text').innerText = uiSchema.title || toolId;

            PmhUICore.createToolInstance({
                container: document.getElementById('pmh_common_tool_container'),
                toolId: toolId,
                uiSchema: uiSchema,
                servers: ServerConfig.SERVERS,
                availableServerIndices: availableServerIndices,
                activeServerIdx: srvIdx,
                pathMappings: ClientSettings.pathMappings,

                apiAdapter: {
                    run: async (data) => {
                        const r = await PmhToolAPI.run(toolId, targetSrv, data);
                        return JSON.parse(r.responseText);
                    },
                    status: async (taskId) => {
                        const r = await PmhToolAPI.status(toolId, targetSrv, taskId);
                        return JSON.parse(r.responseText);
                    },
                    cancel: async (taskId) => {
                        const r = await PmhToolAPI.cancel(toolId, targetSrv, taskId);
                        return JSON.parse(r.responseText);
                    }
                },

                toast: {
                    success: (msg) => toastr.success(msg),
                    error: (msg) => toastr.error(msg),
                    info: (msg) => toastr.info(msg)
                }
            });

            setTimeout(() => {
                const iconClass = uiSchema.icon || 'fas fa-wrench';
                const titleText = uiSchema.title || toolId;
                const toolIconHtml = `<i class="${iconClass}" style="margin-right: 6px;"></i>`;

                const navTitleEl = document.getElementById('tool-view-title');
                if (navTitleEl) navTitleEl.innerHTML = `${toolIconHtml}${titleText}`;

                const panelTitleContainer = document.querySelector('.pmh-panel-title');
                if (panelTitleContainer) {
                    panelTitleContainer.innerHTML = `${toolIconHtml}<span id="pmh-panel-title-text">${titleText}</span>`;
                }

                const srvSelectEl = document.getElementById('pmh_srv_select');
                if (srvSelectEl) {
                    srvSelectEl.addEventListener('change', (e) => {
                        const newIdx = Number(e.target.value);
                        globalCache['target_server_idx'] = newIdx;
                        GM_setValue(`pmh_tool_cache_global_${toolId}`, JSON.stringify(globalCache));
                        openPmhToolUI(toolId, newIdx);
                    });
                }
            }, 100);

        } catch(e) {
            document.getElementById('pmh_common_tool_container').innerHTML = `
                <div style="color:#bd362f; background:rgba(189,54,47,0.1); padding:15px; border-radius:4px; border:1px solid #bd362f;">
                    UI 스키마 로드 실패<br><br>${e}<br><br>서버 연결 상태나 API Key 설정을 확인하세요.
                </div>`;
        }
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

        let errorDetails = [];
        try { errorDetails = JSON.parse(GM_getValue('pmh_server_error_details', '[]')); } catch(e){}

        if (hasServerError) {
            if (!window._pmh_error_poll_timer) {
                log("[UI] Server error detected. Starting background polling for recovery...");
                window._pmh_error_poll_timer = setInterval(async () => {
                    if (!ServerConfig.SERVERS || ServerConfig.SERVERS.length === 0) return;

                    const localPyVers = await pingLocalServer();
                    let stillHasError = false;
                    let newErrorDetails = [];

                    for (const srv of ServerConfig.SERVERS) {
                        const pRes = localPyVers[srv.machineIdentifier];
                        if (!pRes || pRes.status === 'error' || pRes.status === 'restart_required') {
                            stillHasError = true;
                            newErrorDetails.push(`[${srv.name}] ${pRes ? pRes.msg : '정보 없음'}`);
                        }
                    }

                    if (!stillHasError) {
                        infoLog("[Polling] Server connection restored! Clearing error state.");
                        clearInterval(window._pmh_error_poll_timer);
                        window._pmh_error_poll_timer = null;

                        GM_setValue('pmh_server_connection_error', false);
                        GM_setValue('pmh_server_error_details', '[]');

                        if (typeof toastr !== 'undefined') {
                            toastr.success("서버 통신이 정상적으로 복구되었습니다.", "연결 복구");
                        }

                        const ctrl = document.getElementById('pmdv-controls');
                        if (ctrl) { ctrl.remove(); injectControlUI(); }
                    } else {
                        GM_setValue('pmh_server_error_details', JSON.stringify(newErrorDetails));
                    }
                }, 15000);
            }
        } else {
            if (window._pmh_error_poll_timer) {
                clearInterval(window._pmh_error_poll_timer);
                window._pmh_error_poll_timer = null;
            }
        }

        const currentHasError = GM_getValue('pmh_server_connection_error', false);

        let currentErrorDetails = [];
        try { currentErrorDetails = JSON.parse(GM_getValue('pmh_server_error_details', '[]')); } catch(e){}

        let isRestartRequired = currentErrorDetails.some(msg => msg.includes('재시작'));

        if (isRestartRequired) {
            defaultMsg = `<span style="color:#ffc107; font-weight:bold; cursor:help; animation: pmhBlink 1.5s infinite;" title="서버 코어가 업데이트되었습니다. 툴을 다시 사용하려면 서버(PMH 컨테이너)를 수동으로 껐다 켜주세요!"><i class="fas fa-power-off"></i> 서버 재시작 필요!</span>`;
            defaultColor = '#ffc107';
        } else if (currentHasError) {
            let tooltipText = "일부 PMH 파이썬 서버에 연결할 수 없습니다.&#10;";
            if (currentErrorDetails.length > 0) {
                tooltipText += currentErrorDetails.join("&#10;");
            } else {
                tooltipText += "서버가 꺼져 있거나 API 키 설정이 잘못되었습니다.";
            }
            defaultMsg = `<span style="color:#bd362f; cursor:help;" title="${tooltipText}"><i class="fas fa-exclamation-triangle"></i> 서버 연결 오류</span>`;
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

        let updateBtnHtml = "";
        if (ClientSettings.devMode) {
            updateBtnHtml = `
                <div style="display:flex; align-items:center; justify-content:center; margin-right:12px;">
                    <span style="border:1px solid rgba(229, 160, 13, 0.5); color:#e5a00d; font-size:10px; font-weight:bold; padding:2px 6px; border-radius:4px; letter-spacing:0.5px;" title="프론트엔드 개발 모드 활성화 상태 (로컬 소스 사용, 업데이트 확인 중지)">DEV</span>
                </div>`;
        } else {
            updateBtnHtml = `
                <a href="#" id="pmh-manual-update-btn" style="display:flex; align-items:center; justify-content:center; color:#adb5bd; font-size:14px; margin-right:12px; transition:0.2s; text-decoration:none;" title="PMH 업데이트 확인" onmouseover="this.style.color='white'" onmouseout="this.style.color='#adb5bd'">
                    <i class="fas fa-sync-alt pmh-sync-icon"></i>
                </a>`;
        }

        ctrl.insertAdjacentHTML('afterbegin', `
            <div id="pmh-status-message" style="margin-right: 5px; font-size: 11px; font-weight: bold; white-space: nowrap; transition: color 0.3s;"></div>
            <div style="display:flex; align-items:center; margin-right: 8px; height: 100%;">
                ${updateBtnHtml}
                <a href="https://github.com/golmog/plex_meta_helper" target="_blank" style="display:flex; align-items:center; justify-content:center; color:white; font-size:16px; transition:0.2s; text-decoration:none;" title="PMH GitHub 페이지" onmouseover="this.style.color='#e5a00d'" onmouseout="this.style.color='white'">
                    <i class="fab fa-github"></i>
                </a>
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

        const createDivider = () => {
            const div = document.createElement('span');
            div.style.cssText = "opacity: 0.3; color: #adb5bd; margin: 0 8px; font-size: 14px; user-select: none;";
            div.textContent = "|";
            return div;
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
        clearCacheBtn.textContent = '캐시 초기화'; clearCacheBtn.style.marginLeft = '10px';
        clearCacheBtn.addEventListener('click', async () => {
            if (confirm("브라우저/메모리 캐시를 초기화하고 서버 코어 모듈을 재시작하시겠습니까?\n(설정은 유지됩니다.)")) {
                if (window.PmhUICore && window.PmhUICore.destroyActiveInstance) {
                    window.PmhUICore.destroyActiveInstance();
                    delete window.PmhUICore;
                }

                const oldCss = document.getElementById('pmh-shared-css-inline');
                if (oldCss) oldCss.remove();
                const oldJs = document.getElementById('pmh-shared-js-inline');
                if (oldJs) oldJs.remove();
                const toolPanel = document.getElementById('pmh-tool-panel');
                if (toolPanel) toolPanel.remove();

                GM_deleteValue('pmh_ui_core_css_cache');
                GM_deleteValue('pmh_ui_core_js_cache');
                GM_deleteValue('pmh_ui_cache_version');

                localStorage.removeItem('pmh_media_queues');
                window._pmh_media_queues = {};
                window._pmh_polling_active = false;
                if (window._pmh_queue_poll_timer) {
                    clearTimeout(window._pmh_queue_poll_timer);
                    window._pmh_queue_poll_timer = null;
                }

                clearMemoryCache(); 
                forceReRenderAll();
                
                if (document.getElementById('plex-guid-box')) { 
                    currentDisplayedItemId = null; 
                    processDetail(true); 
                }

                showStatusMsg("캐시 초기화 및 코어 리로딩 중...", "#e5a00d");

                try {
                    const secureToken = await generateSecureHeader(ClientSettings.masterApiKey);

                    const reloadPromises = ServerConfig.SERVERS.map(srv => {
                        return new Promise((resolve) => {
                            GM_xmlhttpRequest({
                                method: "POST",
                                url: `${srv.relayUrl}/admin/reload_core`,
                                headers: { "X-PMH-Signature": secureToken },
                                timeout: 10000,
                                onload: (r) => {
                                    if (r.status === 200) {
                                        infoLog(`[Core Reload] Successfully reloaded core on Server: ${srv.name}`);
                                        resolve(true);
                                    } else {
                                        warnLog(`[Core Reload] Failed on Server: ${srv.name} (HTTP ${r.status})`);
                                        resolve(false);
                                    }
                                },
                                onerror: () => resolve(false),
                                ontimeout: () => resolve(false)
                            });
                        });
                    });

                    await Promise.all(reloadPromises);

                } catch (e) {
                    errorLog("[Core Reload] Server Sync Error:", e);
                }

                bootstrapPMH().then(() => {
                    showStatusMsg("캐시 초기화 및 코어 리로딩 완료", "#51a351");
                    toastr.success("로컬 캐시 초기화 및 서버 코어 리로딩이 완료되었습니다.");
                }).catch(() => {
                    showStatusMsg("코어 리로딩 실패", "#bd362f");
                });
            }
        });

        settingsWrapper.appendChild(lenInp); settingsWrapper.appendChild(lenBtn); settingsWrapper.appendChild(clearCacheBtn);

        const clientSettingsBtn = document.createElement('a');
        clientSettingsBtn.href = '#'; clientSettingsBtn.id = 'pmh-client-settings-btn';
        clientSettingsBtn.style.cssText = "color:#adb5bd; font-size:15px; margin-left:12px; transition:0.2s; display:flex; align-items:center; justify-content:center; text-decoration:none;";
        clientSettingsBtn.title = "PMH 프론트엔드 전역 설정";
        clientSettingsBtn.innerHTML = '<i class="fas fa-cog"></i>';
        clientSettingsBtn.addEventListener('mouseenter', () => { clientSettingsBtn.style.color = '#2f96b4'; });
        clientSettingsBtn.addEventListener('mouseleave', () => { clientSettingsBtn.style.color = '#adb5bd'; });
        clientSettingsBtn.addEventListener('click', (e) => {
            e.preventDefault(); e.stopPropagation();
            openClientSettingsModal();
        });
        settingsWrapper.appendChild(clientSettingsBtn);

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

        ctrl.appendChild(createDivider());

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
                                <div class="pmh-panel-title"><i class="fas fa-wrench"></i> <span id="pmh-panel-title-text"></span></div>
                                <div style="display:flex; align-items:center;">
                                    <a href="#" class="pmh-panel-minimize" id="pmh-panel-minimize" title="최소화/복원"><i class="fas fa-minus"></i></a>
                                    <a href="#" class="pmh-panel-close" id="pmh-panel-close"><i class="fas fa-times"></i></a>
                                </div>
                            </div>
                            <div class="pmh-panel-content" id="pmh-panel-content"></div>
                        </div>
                    `;
                    document.body.appendChild(panel);

                    document.getElementById('pmh-panel-close').onclick = (e) => {
                        e.preventDefault(); e.stopPropagation();
                        panel.style.display = 'none';
                        window._pmh_is_minimized = false;
                        GM_setValue('pmh_last_open_tool', '');
                    };

                    document.getElementById('pmh-panel-minimize').onclick = (e) => {
                        e.preventDefault(); e.stopPropagation();
                        window._pmh_is_minimized = !window._pmh_is_minimized;

                        GM_setValue('pmh_last_minimize_state', window._pmh_is_minimized);

                        if (window._pmh_is_minimized) {
                            panel.classList.add('pmh-panel-minimized');
                            document.getElementById('pmh-panel-minimize').innerHTML = '<i class="fas fa-window-restore"></i>';
                        } else {
                            panel.classList.remove('pmh-panel-minimized');
                            document.getElementById('pmh-panel-minimize').innerHTML = '<i class="fas fa-minus"></i>';
                            if (panel.style.height === 'auto') {
                                const maxAllowedHeight = window.innerHeight - 80;
                                if (panel.offsetHeight >= maxAllowedHeight) panel.style.height = maxAllowedHeight + 'px';
                            }
                        }
                    };

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

                if (window._pmh_is_minimized) {
                    panel.classList.add('pmh-panel-minimized');
                    const minBtn = document.getElementById('pmh-panel-minimize');
                    if(minBtn) minBtn.innerHTML = '<i class="fas fa-window-restore"></i>';
                } else {
                    panel.classList.remove('pmh-panel-minimized');
                    const minBtn = document.getElementById('pmh-panel-minimize');
                    if(minBtn) minBtn.innerHTML = '<i class="fas fa-minus"></i>';
                }

                GM_setValue('pmh_last_open_tool', toolId);
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

        ctrl.appendChild(createDivider());

        if (!dropdown) {
            dropdown = document.createElement('div'); dropdown.id = 'pmh-tool-dropdown'; document.body.appendChild(dropdown);
            document.addEventListener('click', (e) => {
                const currentToolBtn = document.getElementById('pmh-tool-menu-btn');
                if (dropdown.style.display === 'block') {
                    if (!dropdown.contains(e.target) && (!currentToolBtn || !currentToolBtn.contains(e.target))) dropdown.style.display = 'none';
                }
            });
        }

        let pmhToolListCache = null;
        const fetchTools = async () => {
            if (!ServerConfig.SERVERS || ServerConfig.SERVERS.length === 0) return;

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
            `;

            const fetchPromises = ServerConfig.SERVERS.map(srv => {
                return new Promise(async (resolve) => {
                    try {
                        const res = await PmhToolAPI.call(srv, `/tools?t=${Date.now()}`, "GET");
                        if (res.status === 200) resolve({ server: srv, data: JSON.parse(res.responseText) });
                        else resolve({ server: srv, error: `HTTP ${res.status}` });
                    } catch(e) { resolve({ server: srv, error: "Network Error" }); }
                });
            });

            const results = await Promise.all(fetchPromises);

            let mergedToolsMap = {};
            let mergedDashboard = { running: [], cron: [] };
            let successCount = 0;
            let errorMessages = [];

            window._pmh_tool_server_map = {};

            results.forEach((result, idx) => {
                if (result.error) {
                    errorMessages.push(`[${result.server.name}] 통신 실패`);
                } else if (result.data) {
                    successCount++;

                    const tools = result.data.tools || [];
                    tools.forEach(t => {
                        if (!mergedToolsMap[t.id]) mergedToolsMap[t.id] = t;
                        if (!window._pmh_tool_server_map[t.id]) window._pmh_tool_server_map[t.id] = [];
                        window._pmh_tool_server_map[t.id].push(idx);
                    });

                    const dash = result.data.dashboard;
                    if (dash) {
                        if (dash.running) mergedDashboard.running.push(...dash.running);
                        if (dash.cron) mergedDashboard.cron.push(...dash.cron);
                    }
                }
            });

            const mergedToolsArray = Object.values(mergedToolsMap);

            if (successCount === 0) {
                dropdown.innerHTML = html + `<div style="padding:20px; color:#bd362f; text-align:center;">모든 서버와의 통신에 실패했습니다.<br><span style="font-size:10px; color:#aaa;">서버가 꺼져 있거나 설정이 잘못되었습니다.</span></div>`;
            } else {
                if (errorMessages.length > 0) {
                    html += `<div style="padding:6px 15px; background:rgba(189, 54, 47, 0.2); font-size:11px; color:#bd362f; text-align:center; border-bottom:1px solid #333;"><i class="fas fa-exclamation-triangle"></i> 일부 서버 통신 실패 (${errorMessages.length}대)</div>`;
                }
                renderToolsDropdown(mergedToolsArray, mergedDashboard, html);
            }
        };

        const renderToolsDropdown = (installedTools, dashboard, baseHtml) => {
            let html = baseHtml;

            const runCnt = dashboard.running.length;
            const cronCnt = dashboard.cron.length;

            html += `
                <div style="display:flex; padding:10px 15px; background:#111; gap:10px; border-bottom:1px solid #333;">
                    <div style="flex:1; background:rgba(229,160,13,0.1); border:1px solid rgba(229,160,13,0.3); padding:8px; border-radius:4px; text-align:center;">
                        <div style="font-size:10px; color:#aaa; margin-bottom:2px;"><i class="fas fa-running" style="color:#e5a00d;"></i> 실행 중</div>
                        <div style="font-size:16px; font-weight:bold; color:${runCnt > 0 ? '#e5a00d' : '#777'};">${runCnt}건</div>
                    </div>
                    <div style="flex:1; background:rgba(81,163,81,0.1); border:1px solid rgba(81,163,81,0.3); padding:8px; border-radius:4px; text-align:center;">
                        <div style="font-size:10px; color:#aaa; margin-bottom:2px;"><i class="fas fa-clock" style="color:#51a351;"></i> 자동 스케줄</div>
                        <div style="font-size:16px; font-weight:bold; color:${cronCnt > 0 ? '#51a351' : '#777'};">${cronCnt}건</div>
                    </div>
                    </div>
            `;

            const bundledToolsStr = GM_getValue('pmh_bundled_tools', '[]');
            let bundledTools = [];
            try { bundledTools = JSON.parse(bundledToolsStr); } catch(e) {}

            const processedBundles = bundledTools.map(b => {
                const nsMatch = b.url.match(/raw\.githubusercontent\.com\/([^\/]+)\//);
                const ns = nsMatch ? nsMatch[1].replace(/[^a-zA-Z0-9]/g, '').toLowerCase() : '';
                const expectedId = ns && !b.id.startsWith(ns + '_') ? `${ns}_${b.id}` : b.id;
                return { ...b, expectedId };
            });

            if (!installedTools || installedTools.length === 0) {
                html += `<div style="padding:20px 15px; text-align:center; color:#777; font-size:12px;">설치된 툴이 없습니다.</div>`;
            } else {
                installedTools.sort((a, b) => (a.name || a.id || "").toLowerCase().localeCompare((b.name || b.id || "").toLowerCase()));

                const serverNameMap = {};
                if (ServerConfig.SERVERS) {
                    ServerConfig.SERVERS.forEach(s => {
                        serverNameMap[s.machineIdentifier] = s.name || s.machineIdentifier.substring(0,8);
                    });
                }

                installedTools.forEach(tool => {
                    const myRunning = dashboard.running.filter(r => r.tool_id === tool.id);
                    const myCron = dashboard.cron.filter(c => c.tool_id === tool.id);

                    const isRunning = myRunning.length > 0;

                    const bgStyle = isRunning ? 'background-color: rgba(229,160,13,0.05); border-left: 3px solid #e5a00d;' : 'background-color: transparent; border-left: 3px solid transparent;';
                    const nameColor = isRunning ? '#e5a00d' : '#ccc';
                    const statusIcon = isRunning ? `<i class="fas fa-spinner fa-spin" style="color:#e5a00d; margin-left:6px; font-size:12px;" title="현재 작업 진행 중"></i>` : '';

                    const runningClass = isRunning ? 'pmh-running-tool' : '';

                    let serverBadgesHtml = '';
                    myCron.forEach(c => {
                        const sName = serverNameMap[c.server_id] || c.server_id.substring(0,8);
                        serverBadgesHtml += `<span style="display:inline-block; margin-top:4px; margin-right:4px; padding:1px 5px; background:rgba(81,163,81,0.15); border:1px solid rgba(81,163,81,0.4); border-radius:3px; font-size:10px; color:#51a351; font-weight:normal;" title="스케줄: ${c.expr}"><i class="fas fa-clock"></i> ${sName}</span>`;
                    });
                    myRunning.forEach(r => {
                        const sName = serverNameMap[r.server_id] || r.server_id.substring(0,8);
                        let progressText = r.total > 0 ? ` (${Math.floor((r.progress/r.total)*100)}%)` : '';
                        serverBadgesHtml += `<span style="display:inline-block; margin-top:4px; margin-right:4px; padding:1px 5px; background:rgba(229,160,13,0.15); border:1px solid rgba(229,160,13,0.4); border-radius:3px; font-size:10px; color:#e5a00d; font-weight:bold;" title="진행률: ${r.progress}/${r.total}"><i class="fas fa-running"></i> ${sName}${progressText}</span>`;
                    });

                    html += `
                        <div class="pmh-tool-item ${runningClass}" style="display:flex; justify-content:space-between; padding:10px 15px; ${bgStyle}" data-id="${tool.id}" data-url="${tool.update_url || ''}" data-ver="${tool.version || '0.0'}">
                            <div class="pmh-tool-run-btn" data-id="${tool.id}" style="display:flex; align-items:flex-start; gap:8px; flex-grow:1; min-width:0; cursor:pointer;">
                                <i class="${tool.icon || 'fas fa-wrench'}" style="color:${nameColor}; margin-top:2px; flex-shrink:0;"></i>
                                <div style="display:flex; flex-direction:column; min-width:0; width:100%;">
                                    <span style="color:${nameColor}; font-weight:${isRunning ? 'bold' : 'normal'}; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; display:block;">
                                        ${tool.name || tool.id}
                                        <span style="color:#777; font-size:10px; font-weight:normal;">v${tool.version || '1.0'}</span>
                                        ${statusIcon}
                                    </span>
                                    <div style="display:flex; flex-wrap:wrap;">
                                        ${serverBadgesHtml}
                                    </div>
                                </div>
                            </div>
                            <div style="display:flex; align-items:center; padding-left:10px; flex-shrink:0;">
                                <span class="pmh-tool-update-btn" data-id="${tool.id}" data-url="${tool.update_url || ''}" style="display:none; color:#51a351; font-size:11px; font-weight:bold; cursor:pointer; margin-right:10px;" title="클릭하여 업데이트 진행"></span>
                                <i class="fas fa-trash-alt pmh-tool-delete-btn" data-id="${tool.id}" data-name="${tool.name || tool.id}" style="cursor:pointer; font-size:13px; color:rgba(255,255,255,0.4);" title="전체 서버에서 삭제"></i>
                            </div>
                        </div>`;
                });
            }

            const uninstalledBundles = processedBundles.filter(bundle => {
                return !installedTools.some(t => {
                    if (t.update_url && bundle.url && t.update_url.split('?')[0].toLowerCase() === bundle.url.split('?')[0].toLowerCase()) {
                        return true;
                    }
                    if (t.id === bundle.id || t.id === bundle.expectedId) {
                        return true;
                    }
                    if (t.id.endsWith(`_${bundle.id}`)) {
                        return true;
                    }
                    return false;
                });
            });

            if (uninstalledBundles.length > 0) {
                if (installedTools.length > 0) html += `<div style="padding: 4px 15px; background: rgba(0,0,0,0.3); font-size: 10px; color: #555; text-align: center; border-bottom: 1px solid #333;">미설치 번들 툴</div>`;

                uninstalledBundles.forEach(bundle => {
                    const meta = bundle.meta || {};
                    const dName = meta.name || bundle.id;
                    const dVer = meta.version ? `v${meta.version}` : 'v1.0';

                    html += `
                        <div class="pmh-tool-item" style="display:flex; justify-content:space-between; padding:10px 15px; border-bottom:1px solid #333; opacity: 0.6;">
                            <div style="display:flex; align-items:center; gap:8px; flex-grow:1; cursor:not-allowed; min-width:0;">
                                <i class="fas fa-box-open" style="color:#777; margin-top:2px;"></i>
                                <div style="display:flex; flex-direction:column; min-width:0; width:100%;">
                                    <span style="color:#ccc; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; display:block;">
                                        ${dName} <span style="color:#777; font-size:10px; font-weight:normal;">${dVer}</span>
                                        <span style="color:#51a351; border:1px solid #51a351; padding:1px 4px; border-radius:3px; font-size:9px; margin-left:6px; vertical-align:middle;">설치 가능</span>
                                    </span>
                                </div>
                            </div>
                            <span class="pmh-tool-install-bundle-btn" data-id="${bundle.expectedId}" data-url="${bundle.url}" style="cursor:pointer; font-size:13px; padding-left:10px;" title="이 툴 설치하기"><i class="fas fa-download"></i></span>
                        </div>`;
                });
            }
            dropdown.innerHTML = html;
        };

        dropdown.onclick = async (e) => {
            if (e.target.closest('#pmh-tool-refresh-btn')) {
                e.preventDefault(); e.stopPropagation();
                const refBtn = document.getElementById('pmh-tool-refresh-btn');
                if(refBtn) refBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
                pmhToolListCache = null;
                fetchTools();
                return;
            }

            const bundleInstallBtn = e.target.closest('.pmh-tool-install-bundle-btn');
            if (bundleInstallBtn) {
                e.preventDefault(); e.stopPropagation();
                if (bundleInstallBtn.dataset.updating) return;

                const targetId = bundleInstallBtn.dataset.id;
                const updateUrl = bundleInstallBtn.dataset.url;

                bundleInstallBtn.dataset.updating = "true";
                bundleInstallBtn.style.opacity = '1';
                bundleInstallBtn.style.color = '#e5a00d';
                bundleInstallBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

                let successCount = 0;
                await Promise.all(ServerConfig.SERVERS.map(srv => new Promise(async res => {
                    try {
                        const r = await PmhToolAPI.call(srv, `/tools/install`, "POST", { url: updateUrl, target_id: targetId });
                        if(r.status === 200) successCount++;
                        res();
                    } catch(err) { res(); }
                })));

                if (successCount > 0) {
                    toastr.success(`'${targetId}' 설치 완료!`);
                    pmhToolListCache = null;

                    await checkUpdate(true);
                    fetchTools();
                } else {
                    toastr.error("설치에 실패했습니다.");
                    bundleInstallBtn.style.color = '#bd362f';
                    bundleInstallBtn.innerHTML = '<i class="fas fa-exclamation-triangle"></i>';
                    delete bundleInstallBtn.dataset.updating;
                }
                return;
            }

            const updateCheckBtn = e.target.closest('#pmh-tool-check-update-btn');
            if (updateCheckBtn) {
                e.preventDefault(); e.stopPropagation();
                if (updateCheckBtn.innerHTML.includes('fa-spin')) return;

                updateCheckBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
                updateCheckBtn.style.color = '#2f96b4';

                const toolItems = dropdown.querySelectorAll('.pmh-tool-item');
                let checkCount = 0; let updateAvailableCount = 0; let hasUrlToCheck = false;
                const startTime = Date.now();

                const finishCheck = () => {
                    const elapsedTime = Date.now() - startTime;
                    const doFinish = () => {
                        if (updateCheckBtn) { updateCheckBtn.innerHTML = '<i class="fas fa-cloud-download-alt"></i>'; updateCheckBtn.style.color = '#aaa'; }
                        if (updateAvailableCount > 0) toastr.info(`${updateAvailableCount}개의 업데이트가 발견되었습니다.`);
                        else toastr.success("모든 툴이 최신 버전입니다.");
                    };
                    if (elapsedTime < 500) setTimeout(doFinish, 500 - elapsedTime);
                    else doFinish();
                };

                toolItems.forEach(item => {
                    const toolId = item.dataset.id;
                    const updateUrl = item.dataset.url;
                    const currentVer = item.dataset.ver;
                    const updateBtn = item.querySelector('.pmh-tool-update-btn');

                    if (updateUrl && updateUrl !== 'undefined') {
                        hasUrlToCheck = true; checkCount++;

                        GM_xmlhttpRequest({
                            method: "GET", url: `${updateUrl}?t=${Date.now()}`,
                            timeout: 5000,
                            onload: (res) => {
                                if (res.status === 200) {
                                    const match = res.responseText.match(/version:\s*['"]?([^'"\r\n]+)['"]?/);
                                    if (match) {
                                        const remoteVer = match[1];
                                        if (isNewerVersion(currentVer, remoteVer)) {
                                            updateBtn.style.display = 'inline-block';
                                            updateBtn.innerHTML = `<i class="fas fa-arrow-circle-up"></i> v${remoteVer}`;
                                            updateBtn.dataset.targetVer = remoteVer;
                                            updateAvailableCount++;
                                        } else { updateBtn.style.display = 'none'; }
                                    }
                                }
                                checkCount--; if (checkCount === 0) finishCheck();
                            },
                            onerror: () => { checkCount--; if (checkCount === 0) finishCheck(); },
                            ontimeout: () => { checkCount--; if (checkCount === 0) finishCheck(); }
                        });
                    }
                });
                if (!hasUrlToCheck || checkCount === 0) finishCheck();
                return;
            }

            const doUpdateBtn = e.target.closest('.pmh-tool-update-btn');
            if (doUpdateBtn) {
                e.preventDefault(); e.stopPropagation();
                if (doUpdateBtn.dataset.updating) return;

                const targetId = doUpdateBtn.dataset.id;
                const updateUrl = doUpdateBtn.dataset.url;
                const newVer = doUpdateBtn.dataset.targetVer || "최신";

                doUpdateBtn.dataset.updating = "true";
                doUpdateBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i>`;

                let successCount = 0;
                await Promise.all(ServerConfig.SERVERS.map(srv => new Promise(async res => {
                    try {
                        const r = await PmhToolAPI.call(srv, `/tools/install`, "POST", { url: updateUrl, target_id: targetId });
                        if(r.status === 200) successCount++;
                        res();
                    } catch(err) { res(); }
                })));

                if (successCount > 0) {
                    toastr.success(`'${targetId}' 업데이트 완료!`);
                    delete doUpdateBtn.dataset.updating;
                    doUpdateBtn.style.display = 'none';
                    const parentItem = doUpdateBtn.closest('.pmh-tool-item');
                    if (parentItem) {
                        parentItem.dataset.ver = newVer;
                        const titleSpan = parentItem.querySelector('.pmh-tool-run-btn span span');
                        if (titleSpan) titleSpan.innerText = `v${newVer}`;
                        parentItem.style.backgroundColor = "rgba(81, 163, 81, 0.2)";
                        setTimeout(() => parentItem.style.backgroundColor = "transparent", 1000);
                        pmhToolListCache = null;
                    }
                    checkUpdate(true);
                } else {
                    toastr.error("업데이트에 실패했습니다.");
                    delete doUpdateBtn.dataset.updating;
                    doUpdateBtn.innerHTML = `<i class="fas fa-exclamation-triangle"></i> 오류`;
                }
                return;
            }

            if (e.target.closest('#pmh-tool-install-btn')) {
                e.preventDefault(); e.stopPropagation(); dropdown.style.display = 'none';
                window.showPmhToolPanel('installer', "새로운 툴 등록 / 주소 확인", `
                    <p style="font-size:13px; color:#aaa; margin-top:0;">설치할 툴의 <strong>GitHub 폴더 주소</strong> (또는 info.yaml 주소)를 입력하세요.</p>
                    <input type="text" id="pmh-install-url" style="width:100%; padding:10px; background:#111; color:#fff; border:1px solid #444; margin-bottom:10px; border-radius:4px; font-size:12px;">
                    <div style="text-align:center; margin-bottom:15px;">
                        <button id="pmh-check-url" style="padding:8px 20px; background:#2f96b4; color:#fff; border:none; font-weight:bold; cursor:pointer; border-radius:4px; font-size:13px; margin-right:8px;"><i class="fas fa-search"></i> 툴 정보 확인</button>
                        <button id="pmh-do-install" style="padding:8px 20px; background:#555; color:#aaa; border:none; font-weight:bold; cursor:not-allowed; border-radius:4px; font-size:13px;" disabled><i class="fas fa-download"></i> 설치</button>
                    </div>
                    <div id="pmh-install-preview" style="display:none; background:rgba(0,0,0,0.3); border:1px solid #333; border-radius:4px; padding:12px; margin-bottom:15px; font-size:12px;"></div>
                    <div id="pmh-install-msg" style="font-size:13px; text-align:center;"></div>
                `);

                setTimeout(() => {
                    const btnCheck = document.getElementById('pmh-check-url');
                    const btnInstall = document.getElementById('pmh-do-install');
                    const previewDiv = document.getElementById('pmh-install-preview');
                    const msgDiv = document.getElementById('pmh-install-msg');
                    const urlInput = document.getElementById('pmh-install-url');

                    let verifiedYamlUrl = "";
                    let verifiedPrefix = "";

                    urlInput.addEventListener('input', () => {
                        btnInstall.disabled = true;
                        btnInstall.style.background = "#555"; btnInstall.style.color = "#aaa"; btnInstall.style.cursor = "not-allowed";
                        previewDiv.style.display = "none";
                        msgDiv.innerHTML = "";
                    });

                    if (btnCheck) {
                        btnCheck.onclick = (e) => {
                            e.preventDefault(); e.stopPropagation();
                            let url = urlInput.value.trim();
                            if (!url) return;

                            if (url.endsWith('/')) url = url.slice(0, -1);
                            let namespace = "custom";

                            const treeMatch = url.match(/^https?:\/\/github\.com\/([^\/]+)\/([^\/]+)\/tree\/([^\/]+)\/(.+)$/i);
                            if (treeMatch) { namespace = treeMatch[1]; url = `https://raw.githubusercontent.com/${treeMatch[1]}/${treeMatch[2]}/${treeMatch[3]}/${treeMatch[4]}/info.yaml`; }
                            else if (url.includes('github.com') && url.includes('/blob/')) { namespace = url.match(/github\.com\/([^\/]+)\//)?.[1] || ""; url = url.replace('github.com', 'raw.githubusercontent.com').replace('/blob/', '/'); }
                            else if (url.includes('raw.githubusercontent.com')) { namespace = url.match(/raw\.githubusercontent\.com\/([^\/]+)\//)?.[1] || ""; }

                            if (!url.endsWith('.yaml') && !url.endsWith('.yml')) url += '/info.yaml';
                            verifiedPrefix = namespace.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();

                            btnCheck.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 확인 중...';
                            previewDiv.style.display = "block";
                            previewDiv.innerHTML = `<div style="text-align:center; color:#aaa;">info.yaml 파일을 읽어오는 중입니다...</div>`;

                            GM_xmlhttpRequest({
                                method: "GET", url: `${url}?t=${Date.now()}`, timeout: 5000,
                                onload: (res) => {
                                    btnCheck.innerHTML = '<i class="fas fa-search"></i> 툴 정보 확인';
                                    if (res.status === 200) {
                                        try {
                                            const parseYaml = (key) => { const m = res.responseText.match(new RegExp(`^${key}\\s*:\\s*['"]?(.*?)['"]?$`, 'm')); return m ? m[1] : ''; };
                                            const tId = parseYaml('id');
                                            const tName = parseYaml('name') || tId;
                                            const tVer = parseYaml('version') || '1.0';
                                            const tDesc = parseYaml('description') || '설명이 없습니다.';

                                            if (!tId) throw new Error("ID 누락");

                                            let expectedLocalId = tId;
                                            if (verifiedPrefix && !tId.startsWith(verifiedPrefix + "_")) expectedLocalId = `${verifiedPrefix}_${tId}`;

                                            let installedHtml = `<span style="color:#aaa; border:1px solid #444; padding:2px 6px; border-radius:3px; font-size:10px; margin-left:8px;">신규 설치</span>`;
                                            let btnText = '<i class="fas fa-download"></i> 설치';
                                            let btnColor = "#51a351";

                                            const existingTool = document.querySelector(`.pmh-tool-item[data-id="${expectedLocalId}"]`) || document.querySelector(`.pmh-tool-item[data-id="${tId}"]`);

                                            if (existingTool) {
                                                const existingVer = existingTool.dataset.ver || "0.0";
                                                if (isNewerVersion(existingVer, tVer)) {
                                                    installedHtml = `<span style="color:#51a351; border:1px solid #51a351; padding:2px 6px; border-radius:3px; font-size:10px; margin-left:8px;"><i class="fas fa-arrow-up"></i> 업데이트 가능 (현재: v${existingVer})</span>`;
                                                    btnText = '<i class="fas fa-arrow-up"></i> 버전 업데이트';
                                                } else if (existingVer === tVer) {
                                                    installedHtml = `<span style="color:#e5a00d; border:1px solid #e5a00d; padding:2px 6px; border-radius:3px; font-size:10px; margin-left:8px;"><i class="fas fa-equals"></i> 이미 최신 버전 (현재: v${existingVer})</span>`;
                                                    btnText = '<i class="fas fa-redo"></i> 덮어쓰기 (재설치)';
                                                    btnColor = "#e5a00d";
                                                } else {
                                                    installedHtml = `<span style="color:#bd362f; border:1px solid #bd362f; padding:2px 6px; border-radius:3px; font-size:10px; margin-left:8px;"><i class="fas fa-arrow-down"></i> 구버전 주의 (현재: v${existingVer})</span>`;
                                                    btnText = '<i class="fas fa-exclamation-triangle"></i> 강제 다운그레이드';
                                                    btnColor = "#bd362f";
                                                }
                                            }

                                            verifiedYamlUrl = url;

                                            previewDiv.innerHTML = `
                                                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; border-bottom:1px dashed #444; padding-bottom:6px;">
                                                    <span style="color:#fff; font-weight:bold; font-size:14px;">${tName}</span>
                                                    <span style="color:#2f96b4; font-family:monospace; font-size:13px; font-weight:bold;">v${tVer}</span>
                                                </div>
                                                <div style="color:#aaa; margin-bottom:10px; display:flex; align-items:center;">
                                                    <span style="font-family:monospace;">ID: ${tId}</span> ${installedHtml}
                                                </div>
                                                <div style="color:#ccc; line-height:1.5; background:rgba(0,0,0,0.2); padding:8px; border-radius:4px;">${tDesc}</div>
                                            `;

                                            btnInstall.disabled = false; btnInstall.innerHTML = btnText; btnInstall.style.background = btnColor; btnInstall.style.color = "#fff"; btnInstall.style.cursor = "pointer"; msgDiv.innerHTML = "";

                                        } catch (e) { previewDiv.innerHTML = `<div style="color:#bd362f;"><i class="fas fa-times"></i> 유효한 info.yaml 파일이 아닙니다.</div>`; }
                                    } else previewDiv.innerHTML = `<div style="color:#bd362f;"><i class="fas fa-times"></i> 주소에 접근할 수 없습니다 (HTTP ${res.status})</div>`;
                                },
                                onerror: () => { btnCheck.innerHTML = '<i class="fas fa-search"></i> 툴 정보 확인'; previewDiv.innerHTML = `<div style="color:#bd362f;"><i class="fas fa-times"></i> 네트워크 오류로 주소를 확인할 수 없습니다.</div>`; },
                                ontimeout: () => { btnCheck.innerHTML = '<i class="fas fa-search"></i> 툴 정보 확인'; previewDiv.innerHTML = `<div style="color:#bd362f;"><i class="fas fa-times"></i> 확인 시간이 초과되었습니다.</div>`; }
                            });
                        };
                    }

                    if (btnInstall) {
                        btnInstall.onmouseover = () => { if(!btnInstall.disabled) btnInstall.style.backgroundColor = "#3e823e"; };
                        btnInstall.onmouseout = () => { if(!btnInstall.disabled) btnInstall.style.backgroundColor = "#51a351"; };

                        btnInstall.onclick = async (e) => {
                            e.preventDefault(); e.stopPropagation();
                            if (!verifiedYamlUrl) return;

                            btnCheck.disabled = true; btnInstall.disabled = true;
                            btnInstall.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 설치 중...';
                            msgDiv.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${ServerConfig.SERVERS.length}대의 서버에 설치 중...`;

                            let successCount = 0;
                            await Promise.all(ServerConfig.SERVERS.map(srv => new Promise(async res => {
                                try {
                                    const r = await PmhToolAPI.call(srv, `/tools/install`, "POST", { url: verifiedYamlUrl, prefix: verifiedPrefix });
                                    if(r.status === 200) successCount++;
                                    res();
                                } catch(err) { res(); }
                            })));

                            btnCheck.disabled = false;
                            btnInstall.innerHTML = '<i class="fas fa-check"></i> 설치 완료';

                            if (successCount > 0) {
                                pmhToolListCache = null;
                                checkUpdate(true);

                                msgDiv.innerHTML = `<span style="color:#51a351;"><i class="fas fa-check"></i> ${successCount}/${ServerConfig.SERVERS.length}대 서버 설치 완료!</span>`;
                                setTimeout(() => {
                                    urlInput.value = ""; previewDiv.style.display = "none"; btnInstall.disabled = true;
                                    btnInstall.style.background = "#555"; btnInstall.style.color = "#aaa"; btnInstall.style.cursor = "not-allowed";
                                    btnInstall.innerHTML = '<i class="fas fa-download"></i> 설치'; msgDiv.innerHTML = "";
                                }, 2000);
                            } else {
                                msgDiv.innerHTML = `<span style="color:#bd362f;"><i class="fas fa-times"></i> 설치 실패 (서버 상태 확인)</span>`;
                                btnInstall.disabled = false; btnInstall.innerHTML = '<i class="fas fa-download"></i> 다시 시도';
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
                    dropdown.innerHTML = `<div style="padding:30px; text-align:center; color:#aaa;"><i class="fas fa-spinner fa-spin fa-2x" style="color:#e5a00d;"></i><br><br>삭제 및 정보 동기화 중...</div>`;

                    GM_deleteValue(`pmh_tool_cache_${delBtn.dataset.id}`);
                    await Promise.all(ServerConfig.SERVERS.map(srv => new Promise(async res => {
                        try {
                            await PmhToolAPI.call(srv, `/tools/${delBtn.dataset.id}`, "DELETE");
                            res();
                        } catch(err) { res(); }
                    })));

                    pmhToolListCache = null;
                    await checkUpdate(true);
                    fetchTools();
                }
                return;
            }

            const runBtn = e.target.closest('.pmh-tool-run-btn');
            if (runBtn) {
                e.preventDefault(); e.stopPropagation();
                dropdown.style.display = 'none';
                window._pmh_is_minimized = false;
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
                updateLinkBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> 서버 확인 중...`;

                const targetVer = updateLinkBtn.dataset.ver;

                try {
                    const localPyVers = await pingLocalServer();
                    let actualServersToUpdate = [];
                    if (ServerConfig.SERVERS) {
                        for (const srv of ServerConfig.SERVERS) {
                            const pRes = localPyVers[srv.machineIdentifier];
                            if (!pRes || pRes.status !== 'ok' || isNewerVersion(pRes.version, targetVer)) {
                                actualServersToUpdate.push(srv);
                            }
                        }
                    }

                    if (actualServersToUpdate.length > 0) {
                        updateLinkBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> 서버/툴 업데이트 중...`;
                    }

                    let serverSuccess = true;
                    if (actualServersToUpdate.length > 0) {
                        serverSuccess = await triggerServerUpdate(showStatusMsg, actualServersToUpdate);
                    }

                    if (serverSuccess) {
                        infoLog(`[Update] Server update successful to v${targetVer}. Auto-clearing all caches to prevent schema conflicts...`);

                        try {
                            clearMemoryCache();
                            GM_deleteValue('pmh_ui_core_css_cache');
                            GM_deleteValue('pmh_ui_core_js_cache');
                            GM_deleteValue('pmh_ui_cache_version');

                            if (typeof sessionRevalidated !== 'undefined') sessionRevalidated.clear();
                            showStatusMsg(`업데이트 및 캐시 최적화 완료!`, '#51a351', 3000);
                            toastr.info("서버 업데이트가 완료되었으며, 기존 데이터 캐시를 비웠습니다.", "캐시 최적화 완료");
                        } catch (err) {
                            errorLog("[Update] Auto-clearing cache failed", err);
                        }

                        defaultMsg = `<span style="color:#51a351; font-weight:bold;"><i class="fas fa-info-circle"></i> 업데이트 완료 후 페이지 새로고침(F5) 필요.</span>`;
                        defaultColor = '#51a351';
                        showStatusMsg(defaultMsg, defaultColor, 0);

                        setTimeout(() => {
                            let scriptUrl = "https://raw.githubusercontent.com/golmog/plex_meta_helper/main/plex_meta_helper.user.js";
                            if (typeof GM_info !== 'undefined' && GM_info.script) {
                                scriptUrl = GM_info.script.downloadURL || GM_info.script.updateURL || scriptUrl;
                            }

                            window.open(`${scriptUrl}?t=${Date.now()}`, "_blank");
                        }, 1000);

                    } else {
                        delete updateLinkBtn.dataset.updating;
                        updateLinkBtn.innerHTML = originalHtml;
                    }
                } catch (e) {
                    errorLog("[Update Link Error]", e);
                    toastr.error("업데이트 중 치명적인 오류가 발생했습니다.");
                    delete updateLinkBtn.dataset.updating;
                    updateLinkBtn.innerHTML = originalHtml;
                }
                return;
            }

            const updateBtn = e.target.closest('#pmh-manual-update-btn');
            if (updateBtn) {
                e.preventDefault();
                e.stopPropagation();

                if (updateBtn.dataset.fetching === "true") return;
                updateBtn.dataset.fetching = "true";

                log("[UI] Manual update check button clicked.");

                const icon = updateBtn.querySelector('.pmh-sync-icon');
                if (icon) icon.classList.add('fa-spin');

                showStatusMsg(`업데이트 확인 중...`, '#ccc', 0);

                try {
                    const result = await checkUpdate(true);

                    const liveBtn = document.getElementById('pmh-manual-update-btn');
                    if (liveBtn) {
                        delete liveBtn.dataset.fetching;
                        const liveIcon = liveBtn.querySelector('.pmh-sync-icon');
                        if (liveIcon) liveIcon.classList.remove('fa-spin');
                    }

                    if (result && result.error) {
                        showStatusMsg(result.msg, '#bd362f', 4000);
                    } else if (result) {
                        let isJsUpdateNeeded = isNewerVersion(CURRENT_VERSION, result.targetVer);
                        serversToUpdate = [];

                        // [에러 해결됨] 이 부분도 마찬가지로 version 프로퍼티를 꺼내도록 수정했습니다.
                        if (ServerConfig.SERVERS) {
                            for (const srv of ServerConfig.SERVERS) {
                                const pRes = result.localPyVers[srv.machineIdentifier];
                                if (!pRes || pRes.status !== 'ok' || isNewerVersion(pRes.version, result.targetVer)) {
                                    serversToUpdate.push({...srv, targetVer: result.targetVer});
                                }
                            }
                        }

                        if (isJsUpdateNeeded || serversToUpdate.length > 0) {
                            log(`[Update] Needs update. JS: ${isJsUpdateNeeded}, Servers: ${serversToUpdate.length}`);
                            const btnText = result.reqRestart ? `업데이트(v${result.targetVer}): 서버 재시작 필요` : `업데이트(v${result.targetVer})`;
                            defaultMsg = `<a href="#" id="pmh-unified-update-link" data-ver="${result.targetVer}" style="color:#e5a00d; text-decoration:none;" title="클릭 시 전체 업데이트 진행">${btnText}</a>`;
                            defaultColor = '#e5a00d';
                            showStatusMsg(`업데이트 발견!`, '#e5a00d', 3000);
                        } else {
                            defaultMsg = ''; defaultColor = '#aaa';
                            showStatusMsg(`최신 버전입니다 (v${CURRENT_VERSION})`, '#51a351', 3000);
                            if (typeof pmhToolListCache !== 'undefined') pmhToolListCache = null;
                        }
                    }
                } catch (err) {
                    errorLog("[Manual Update Error]", err);
                    showStatusMsg(`확인 실패`, '#bd362f', 4000);

                    const liveBtn = document.getElementById('pmh-manual-update-btn');
                    if (liveBtn) {
                        delete liveBtn.dataset.fetching;
                        const liveIcon = liveBtn.querySelector('.pmh-sync-icon');
                        if (liveIcon) liveIcon.classList.remove('fa-spin');
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

        const mainLink = cont.querySelector('a[aria-label]');
        if (mainLink) {
            const label = mainLink.getAttribute('aria-label');
            if (label) hashParts.push(label.trim());
        }

        const textNodes = cont.querySelectorAll(`
            [class*="MetadataPosterCardTitle-"], 
            [class*="Link-link-"], 
            [data-testid="metadataTitleLink"]
        `);

        textNodes.forEach(node => {
            const titleAttr = node.getAttribute('title');
            if (titleAttr && !hashParts.includes(titleAttr.trim())) {
                hashParts.push(titleAttr.trim());
            }

            let directText = "";
            for (const child of node.childNodes) {
                if (child.nodeType === Node.TEXT_NODE) {
                    directText += child.textContent;
                }
            }
            directText = directText.replace(/\s+/g, ' ').trim();
            if (directText && directText !== "·" && !hashParts.includes(directText)) {
                hashParts.push(directText);
            }
        });

        const img = cont.querySelector('img[src*="/thumb/"], img[src*="/art/"]');
        if (img) {
            const match = img.src.match(/\/(?:thumb|art)\/(\d+)/);
            if (match && !hashParts.includes(match[1])) {
                hashParts.push(match[1]);
            }
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
        if (state.listTag || state.listPlay || info.is_friend_pending) {
            wrapper = document.createElement('div');
            wrapper.className = 'pmh-top-right-wrapper pmh-fade-update';

            const existingPlexBadge = poster.querySelector('[class*="Badge-topRightBadge-"], [class*="PlayStateBadge-topRightBadge-"]');
            if (existingPlexBadge) {
                wrapper.style.top = '34px';
            }

            poster.appendChild(wrapper);
        }

        if (info.is_friend_pending) {
            marker.setAttribute('data-friend-pending', 'true');

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
                        if (meta && meta !== 'DELETED') {
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
                const lPath = encodePathSafe(getLocalPath(info.p));
                const pBtn = document.createElement('a');
                pBtn.href = `plexplay://${lPath}`;
                pBtn.className = 'plex-list-play-external';
                pBtn.title = '로컬재생';
                pBtn.innerHTML = '<i class="fas fa-play"></i>';

                pBtn.addEventListener('click', (e) => {
                    e.preventDefault(); e.stopPropagation();
                    infoLog(`[List] Local protocol (plexplay://) invoked for path: ${info.p}`);
                    const fileName = info.p.split(/[\\/]/).pop() || info.p;
                    toastr.info(`로컬 재생을 시도합니다.<br>'${fileName}'`);
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

                    const streamPayload = encodePathSafe(vUrl) + '%7C' + encodePathSafe(sUrl) + '%7C' + encodePathSafe(justFileName);

                    const sBtn = document.createElement('a');
                    sBtn.href = `plexstream://${streamPayload}`;
                    sBtn.className = 'plex-list-play-external plex-list-stream-btn';
                    sBtn.title = '스트리밍';
                    sBtn.innerHTML = '<i class="fas fa-wifi"></i>';

                    sBtn.addEventListener('click', (e) => {
                        e.preventDefault(); e.stopPropagation();
                        infoLog(`[List] Streaming protocol (plexstream://) invoked for part: ${info.part_id}`);
                        toastr.info(`스트리밍 플레이어를 호출합니다.<br>'${justFileName}'`);
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

            const queueInfo = window._pmh_media_queues && window._pmh_media_queues[id];

            if (queueInfo) {
                if (queueInfo.state === 'requesting') {
                    gBox.innerHTML = `<i class="fas fa-spinner fa-spin" style="margin-right:4px;"></i>요청중...`;
                    gBox.style.color = '#ccc';
                } else if (queueInfo.state === 'queued') {
                    gBox.innerHTML = `<i class="fas fa-clock" style="margin-right:4px;"></i>대기중...`;
                    gBox.style.color = '#e5a00d';
                } else {
                    gBox.innerHTML = `<i class="fas fa-spinner fa-spin" style="margin-right:4px;"></i>처리중...`;
                    gBox.style.color = '#2f96b4';
                }
                gBox.dataset.refreshing = 'true';
            } else if (info.g) {
                short = info.g.length > currentLen ? info.g.substring(0, currentLen) + '...' : info.g;
                gBox.textContent = short;
                gBox.title = `${info.g} : 클릭 시 재조회 (Shift+클릭: 리매칭)`;

                const rawG = (info.raw_g || info.g || '').toLowerCase();
                const isUnmatched = !rawG || rawG === '-' || rawG.includes('local://') || rawG.includes('none://');

                if (isUnmatched) gBox.style.color = '#a68241';

                gBox.dataset.unmatched = isUnmatched ? 'true' : 'false';
                gBox.dataset.rawGuid = rawG;
            } else {
                gBox.innerHTML = `<i class="fas fa-spinner fa-spin" style="margin-right:4px;"></i>로딩 중...`;
                gBox.style.color = '#adb5bd';

                gBox.title = '클릭 시 데이터 다시 불러오기 (8초 후 자동 시도)';
                gBox.style.cursor = 'pointer';

                setTimeout(() => {
                    if (gBox.isConnected && gBox.dataset.refreshing !== 'true' && gBox.innerHTML.includes('로딩 중')) {
                        const stillQueued = window._pmh_media_queues && window._pmh_media_queues[id];
                        if (!stillQueued) {
                            infoLog(`[List] 'Loading...' timeout reached for ID: ${id}. Re-fetching from DB...`);
                            gBox.click();
                        }
                    }
                }, 8000);
            }

            let abortPolling = false;
            gBox.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();

                if (gBox.dataset.refreshing === 'true') {
                    const queueInfo = window._pmh_media_queues && window._pmh_media_queues[id];
                    if (queueInfo && queueInfo.state === 'queued') {
                        gBox.innerHTML = `<i class="fas fa-ban" style="margin-right:4px;"></i>취소됨`;
                        gBox.style.color = '#bd362f';

                        let targetServerId = null;
                        try {
                            targetServerId = srvConfig ? srvConfig.machineIdentifier : link.getAttribute('href').match(/\/server\/([a-f0-9]+)\//)?.[1];
                            const srv = getServerConfig(targetServerId);
                            if (srv) {
                                await makeRequest(`${srv.relayUrl}/media/queue_cancel`, 'POST', { task_id: queueInfo.task_id }, ClientSettings.masterApiKey);
                            }

                            delete window._pmh_media_queues[id];
                            if (typeof window.saveQueueState === 'function') window.saveQueueState();

                            toastr.warning('작업 대기가 취소되었습니다.', '취소됨', {timeOut: 2000});
                        } catch(err) {
                            console.error("[PMH] Cancel request failed", err);
                            delete window._pmh_media_queues[id];
                            if (typeof window.saveQueueState === 'function') window.saveQueueState();
                        } finally {
                            const markers = document.querySelectorAll(`.pmh-render-marker[data-iid="${id}"]`);
                            markers.forEach(m => m.remove());

                            setTimeout(() => {
                                if (typeof processList === 'function') processList();
                            }, 1000);
                        }
                    }
                    return;
                }

                const isShiftClick = e.shiftKey;
                if (isShiftClick && window.getSelection) {
                    window.getSelection().removeAllRanges();
                }

                const originHTML = gBox.innerHTML;
                const originColor = gBox.style.color;

                gBox.dataset.refreshing = 'true';
                gBox.style.color = '#ccc';

                const targetServerId = srvConfig ? srvConfig.machineIdentifier : link.getAttribute('href').match(/\/server\/([a-f0-9]+)\//)?.[1];
                const plexSrv = targetServerId ? extractPlexServerInfo(targetServerId) : null;

                let actionName = '';
                let apiAction = '';
                let extraData = {};

                if (srvConfig && !isUnmatched && info.g && isShiftClick) {
                    actionName = '리매칭'; apiAction = 'match';
                    extraData = { _try_refresh_first: false, _do_unmatch_first: true };
                }
                else if (srvConfig && !isUnmatched && info.g && !isShiftClick) {
                    actionName = '메타 새로고침'; apiAction = 'refresh';
                }
                else if (srvConfig && plexSrv && (isUnmatched || !info.g)) {
                    actionName = '자동 매칭'; apiAction = 'match';
                    extraData = {
                        _try_refresh_first: ClientSettings.matchTryRefreshFirst,
                        _manual_match: ClientSettings.manualMatch,
                        _do_unmatch_first: ClientSettings.matchDoUnmatchFirst,
                        _skip_sim_check: ClientSettings.matchSkipSimCheck,
                        _use_custom_score: ClientSettings.useCustomScore,
                        _custom_agent_score: ClientSettings.customAgentScore
                    };
                } else {
                    gBox.dataset.refreshing = 'false';
                    return;
                }

                let itemDisplayName = "알 수 없는 항목";
                if (info.p) {
                    const pParts = info.p.split(/[\\/]/);
                    itemDisplayName = pParts[pParts.length - 1];
                } else {
                    const labelEl = cont.querySelector('[aria-label]');
                    if (labelEl) itemDisplayName = labelEl.getAttribute('aria-label');
                }

                window._pmh_media_queues = window._pmh_media_queues || {};
                window._pmh_media_queues[id] = { 
                    task_id: 'pending', start_time: Date.now(), state: 'requesting', 
                    title: itemDisplayName, server_id: targetServerId 
                };
                if (typeof window.saveQueueState === 'function') window.saveQueueState();

                const updateLiveBadge = (html, color, isRefreshing = true) => {
                    const markers = document.querySelectorAll(`.pmh-render-marker[data-iid="${id}"]`);
                    markers.forEach(m => {
                        const container = m.closest('div[data-testid^="cellItem"], div[class*="ListItem-container"], div[class*="MetadataPosterCard-container"], tr[class*="TableRow-"]');
                        const currentGBox = container ? container.querySelector('.plex-guid-list-box') : null;
                        if (currentGBox) {
                            currentGBox.innerHTML = html; currentGBox.style.color = color;
                            if (isRefreshing) currentGBox.dataset.refreshing = 'true';
                            else delete currentGBox.dataset.refreshing;
                        }
                    });
                };

                updateLiveBadge(`<i class="fas fa-spinner fa-spin" style="margin-right:4px;"></i>${actionName} 대기...`, '#ccc', true);
                toastr.info(`서버 대기열에 [${actionName}] 작업을 추가합니다...`, "대기열 추가", {timeOut: 2000});

                try {
                    const res = await makeRequest(`${srvConfig.relayUrl}/media/${id}/${apiAction}`, 'POST', extraData, ClientSettings.masterApiKey);

                    if (res.status === 'queued') {
                        updateLiveBadge(`<i class="fas fa-check" style="margin-right:4px;"></i>큐 추가됨`, '#51a351', true);

                        window._pmh_media_queues[id] = { task_id: res.task_id, start_time: Date.now(), state: 'queued', title: itemDisplayName, server_id: targetServerId };
                        if (typeof window.saveQueueState === 'function') window.saveQueueState();

                        if (typeof window.startQueuePolling === 'function') window.startQueuePolling(targetServerId);

                        setTimeout(() => {
                            if (window._pmh_media_queues && window._pmh_media_queues[id]) {
                                const currentState = window._pmh_media_queues[id].state;
                                if (currentState === 'queued') {
                                    updateLiveBadge(`<i class="fas fa-clock" style="margin-right:4px;"></i>대기중...`, '#e5a00d', true);
                                } else if (currentState === 'processing') {
                                    updateLiveBadge(`<i class="fas fa-spinner fa-spin" style="margin-right:4px;"></i>처리중...`, '#2f96b4', true);
                                }
                            }
                        }, 1500);

                    } else { throw new Error(res.error || res.message || "큐 등록 실패"); }
                } catch (err) {
                    toastr.error(`${actionName} 요청 실패: ${err.message}`, "오류", {timeOut: 4000});
                    
                    delete window._pmh_media_queues[id];
                    if (typeof window.saveQueueState === 'function') window.saveQueueState();

                    updateLiveBadge(`<i class="fas fa-times" style="margin-right:4px;"></i>요청 실패`, '#bd362f', false);
                    setTimeout(() => { updateLiveBadge(originHTML, originColor, false); }, 3000);
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

    try {
        window._pmh_media_queues = JSON.parse(localStorage.getItem('pmh_media_queues')) || {};
    } catch(e) {
        window._pmh_media_queues = {};
    }
    window._pmh_polling_active = window._pmh_polling_active || false;
    window._pmh_queue_poll_timer = window._pmh_queue_poll_timer || null;

    window.saveQueueState = function() {
        localStorage.setItem('pmh_media_queues', JSON.stringify(window._pmh_media_queues));
    };

    setTimeout(() => {
        const serversToPoll = new Set(Object.values(window._pmh_media_queues).map(q => q.server_id).filter(Boolean));
        serversToPoll.forEach(sid => {
            if (typeof window.startQueuePolling === 'function') window.startQueuePolling(sid);
        });
    }, 2500);

    window.startQueuePolling = function(serverId) {
        window._pmh_polling_active = window._pmh_polling_active || {};
        if (window._pmh_polling_active[serverId]) return;
        
        const hasServerTask = Object.values(window._pmh_media_queues).some(q => q.server_id === serverId);
        if (!hasServerTask) return;

        window._pmh_polling_active[serverId] = true;
        let consecutiveErrors = 0;

        const pollLoop = async () => {
            const serverQueueKeys = Object.keys(window._pmh_media_queues).filter(k => 
                window._pmh_media_queues[k].server_id === serverId &&
                window._pmh_media_queues[k].state !== 'requesting'
            );
            
            if (serverQueueKeys.length === 0) {
                window._pmh_polling_active[serverId] = false;
                return;
            }

            const srvConfig = getServerConfig(serverId);
            const taskIdsList = serverQueueKeys.map(k => window._pmh_media_queues[k].task_id);

            if (srvConfig && taskIdsList.length > 0) {
                try {
                    const res = await makeRequest(`${srvConfig.relayUrl}/media/queue_status`, 'POST', { task_ids: taskIdsList }, ClientSettings.masterApiKey);
                    consecutiveErrors = 0;

                    for (const id of serverQueueKeys) {
                        try {
                            const qInfo = window._pmh_media_queues[id];
                            if (!qInfo) continue;

                            const status = res[qInfo.task_id];
                            const isTimeout = (Date.now() - qInfo.start_time > 43200000);

                            if (!status || status.state === 'unknown' || status.state === 'error' || isTimeout) {
                                const isUnknown = (!status || status.state === 'unknown');

                                if (isUnknown) {
                                    infoLog(`[Queue] 아이템 ${id}의 작업 상태를 알 수 없습니다. (서버 재시작 또는 시간 경과)`);
                                } else if (status.state === 'error') {
                                    const failName = qInfo.title || "알 수 없는 항목";
                                    warnLog(`[Queue] 작업 실패: [${failName}] ${status.msg}`);
                                } else if (isTimeout) {
                                    const failName = qInfo.title || "알 수 없는 항목";
                                    warnLog(`[Queue] 시간 초과: [${failName}] 서버 응답이 없습니다.`);
                                }

                                deleteMemoryCache(`D_${serverId}_${id}`);
                                deleteMemoryCache(`F_${serverId}_${id}`);
                                if (typeof sessionRevalidated !== 'undefined') sessionRevalidated.delete(id);
                                
                                delete window._pmh_media_queues[id];
                                if (typeof window.saveQueueState === 'function') window.saveQueueState();
                                
                                const markers = document.querySelectorAll(`.pmh-render-marker[data-iid="${id}"]`);
                                markers.forEach(m => {
                                    const cont = m.closest('div[data-testid^="cellItem"], div[class*="ListItem-container"], div[class*="MetadataPosterCard-container"], tr[class*="TableRow-"]');
                                    const gBox = cont ? cont.querySelector('.plex-guid-list-box') : null;
                                    if (gBox) {
                                        gBox.innerHTML = isUnknown ? `<i class="fas fa-sync-alt"></i> 대기 해제` : `<i class="fas fa-exclamation-triangle"></i> 실패`;
                                        gBox.style.color = isUnknown ? '#777' : '#bd362f';
                                        setTimeout(() => m.remove(), 2000);
                                    } else {
                                        m.remove();
                                    }
                                });

                                setTimeout(() => { if (typeof processList === 'function') processList(); }, 500);
                            }
                            
                            else if (status.state === 'completed') {
                                infoLog(`[Queue] 아이템 ${id}의 작업 성공 완료! 캐시 갱신을 시도합니다.`);
                                
                                const markers = document.querySelectorAll(`.pmh-render-marker[data-iid="${id}"]`);
                                markers.forEach(m => {
                                    const cont = m.closest('div[data-testid^="cellItem"], div[class*="ListItem-container"], div[class*="MetadataPosterCard-container"], tr[class*="TableRow-"]');
                                    const gBox = cont ? cont.querySelector('.plex-guid-list-box') : null;
                                    if (gBox) {
                                        gBox.innerHTML = `<i class="fas fa-check" style="margin-right:4px;"></i>반영 중...`;
                                        gBox.style.color = '#51a351';
                                    }
                                });

                                delete window._pmh_media_queues[id];
                                if (typeof window.saveQueueState === 'function') window.saveQueueState();

                                (async () => {
                                    await new Promise(r => setTimeout(r, 2000));
                                    try {
                                        const plexSrv = extractPlexServerInfo(serverId);
                                        if (!plexSrv) return;
                                        
                                        let meta = null;
                                        let oldCache = getMemoryCache(`L_${serverId}_${id}`) || {};
                                        let newId = id;

                                        for (let retry = 0; retry < 3; retry++) {
                                            meta = await fetchPlexMetaFallback(id, plexSrv);
                                            
                                            if (meta === 'DELETED') break;
                                            
                                            if (meta) {
                                                const checkGuid = (meta.guid || '').toLowerCase();
                                                if (!checkGuid.includes('local://') && !checkGuid.includes('none://') && checkGuid !== '-') {
                                                    break;
                                                }
                                            }
                                            infoLog(`[Queue] Plex API 반환값이 아직 갱신되지 않았습니다(local://). 3초 후 재시도... (${retry+1}/3)`);
                                            await new Promise(r => setTimeout(r, 3000));
                                        }

                                        if (meta === 'DELETED') {
                                            meta = null; 
                                            const filePath = oldCache ? oldCache.p : null;
                                            const sectionId = oldCache ? oldCache.librarySectionID : null;

                                            if (filePath && sectionId && plexSrv) {
                                                infoLog(`[Queue] ID ${id}가 삭제되었습니다. 파일 경로로 새 ID 역추적을 시작합니다: ${filePath}`);
                                                
                                                const searchUrl = `${plexSrv.url}/library/sections/${sectionId}/all?file=${encodeURIComponent(filePath)}&X-Plex-Token=${plexSrv.token}`;
                                                const newMeta = await new Promise((resolve) => {
                                                    GM_xmlhttpRequest({
                                                        method: 'GET', url: searchUrl,
                                                        headers: { 'Accept': 'application/json' },
                                                        timeout: 10000,
                                                        onload: r => {
                                                            try {
                                                                if (r.status === 200) {
                                                                    const resData = JSON.parse(r.responseText);
                                                                    const metadata = resData.MediaContainer.Metadata;
                                                                    if (metadata && metadata.length > 0) {
                                                                        resolve(metadata[0]);
                                                                        return;
                                                                    }
                                                                }
                                                                resolve(null);
                                                            } catch(e) { resolve(null); }
                                                        },
                                                        onerror: () => resolve(null),
                                                        ontimeout: () => resolve(null)
                                                    });
                                                });

                                                if (newMeta) {
                                                    meta = newMeta;
                                                    newId = String(newMeta.ratingKey);
                                                    infoLog(`[Queue] 새 ID 역추적 성공! (구 ID: ${id} -> 신 ID: ${newId})`);
                                                }
                                            }
                                            
                                            if (!meta) {
                                                const failMarkers = document.querySelectorAll(`.pmh-render-marker[data-iid="${id}"]`);
                                                failMarkers.forEach(m => {
                                                    const cont = m.closest('div[data-testid^="cellItem"], div[class*="ListItem-container"], div[class*="MetadataPosterCard-container"], tr[class*="TableRow-"]');
                                                    const gBox = cont ? cont.querySelector('.plex-guid-list-box') : null;
                                                    if (gBox) {
                                                        gBox.innerHTML = `<i class="fas fa-ghost" style="margin-right:4px;"></i>병합됨`;
                                                        gBox.style.color = '#777';
                                                        gBox.title = '다른 항목으로 완전히 병합되어 원본 ID가 사라졌습니다.';
                                                    }
                                                });
                                                return;
                                            }
                                        }

                                        if (!meta) {
                                            infoLog(`[Queue] 일시적인 통신 지연으로 아이템 ${id}의 상태를 갱신하지 못했습니다. 기존 배지로 복원합니다.`);
                                            const markers = document.querySelectorAll(`.pmh-render-marker[data-iid="${id}"]`);
                                            markers.forEach(m => m.remove());
                                            setTimeout(() => { if (typeof processList === 'function') processList(); }, 100);
                                            return;
                                        }

                                        const updatedInfo = convertPlexMetaToLocalData(meta, newId);
                                        const mergedInfo = { ...oldCache, ...updatedInfo, itemId: newId };
                                        
                                        if (newId !== id) {
                                            deleteMemoryCache(`L_${serverId}_${id}`);
                                            deleteMemoryCache(`D_${serverId}_${id}`);
                                            deleteMemoryCache(`F_${serverId}_${id}`);
                                        }
                                        setMemoryCache(`L_${serverId}_${newId}`, mergedInfo);
                                        if (typeof sessionRevalidated !== 'undefined') sessionRevalidated.add(newId);

                                        let displayData = { ...mergedInfo, tags: applyUserTags(mergedInfo.p, mergedInfo.tags) };

                                        const liveWrappers = document.querySelectorAll(`div[data-testid^="cellItem"], div[class*="ListItem-container"], div[class*="MetadataPosterCard-container"]`);
                                        for (const live of liveWrappers) {
                                            let liveLink = live.querySelector('a[data-testid="metadataTitleLink"]');
                                            if (!liveLink) liveLink = live.querySelectorAll('a[href*="key="], a[href*="/metadata/"]')[0];
                                            
                                            const hrefAttr = liveLink ? decodeURIComponent(liveLink.getAttribute('href') || '') : '';
                                            
                                            if (liveLink && (hrefAttr.includes(id) || hrefAttr.includes(newId))) {
                                                if (newId !== id && hrefAttr.includes(id)) {
                                                    const oldHref = liveLink.getAttribute('href');
                                                    const newHref = oldHref.replace(id, newId).replace(encodeURIComponent('/library/metadata/' + id), encodeURIComponent('/library/metadata/' + newId));
                                                    liveLink.setAttribute('href', newHref);
                                                }

                                                let livePoster = live.querySelector(`[class*="PosterCard-card-"], [class*="MetadataSimplePosterCard-card-"], [class*="ThumbCard-card-"], [class*="Card-card-"], [class*="ThumbCard-imageContainer"], [data-testid="metadata-poster"]`);
                                                if (!livePoster && live.classList.contains('ListItem-container')) livePoster = live.firstElementChild;
                                                
                                                if (livePoster) {
                                                    livePoster.querySelector('.pmh-render-marker')?.remove();
                                                    livePoster.querySelector('.pmh-top-right-wrapper')?.remove();
                                                    live.querySelectorAll('.plex-guid-list-box, .pmh-guid-wrapper').forEach(el => el.remove());
                                                    
                                                    renderListBadges(live, livePoster, liveLink, displayData, srvConfig, newId);
                                                }
                                            }
                                        }
                                    } catch (e) {
                                        errorLog(`[Queue Callback] Direct render failed for ${id}:`, e);
                                        setTimeout(() => { if (typeof processList === 'function') processList(); }, 500);
                                    }
                                })();
                            }

                            else if (status.state === 'processing' || status.state === 'queued') {
                                const previousState = qInfo.state;
                                const newState = status.state;

                                if (previousState !== newState) {
                                    window._pmh_media_queues[id].state = newState;
                                    if (typeof window.saveQueueState === 'function') window.saveQueueState();

                                    const markers = document.querySelectorAll(`.pmh-render-marker[data-iid="${id}"]`);
                                    markers.forEach(m => {
                                        const cont = m.closest('div[data-testid^="cellItem"], div[class*="ListItem-container"], div[class*="MetadataPosterCard-container"], tr[class*="TableRow-"]');
                                        const gBox = cont ? cont.querySelector('.plex-guid-list-box') : null;
                                        if (gBox) {
                                            if (newState === 'queued') {
                                                gBox.innerHTML = `<i class="fas fa-clock" style="margin-right:4px;"></i>대기중...`;
                                                gBox.style.color = '#e5a00d';
                                            } else if (newState === 'processing') {
                                                gBox.innerHTML = `<i class="fas fa-spinner fa-spin" style="margin-right:4px;"></i>처리중...`;
                                                gBox.style.color = '#2f96b4';
                                            }
                                        }
                                    });
                                }
                            }
                        } catch (innerError) {
                            errorLog(`[Queue Polling] Error processing item ${id}:`, innerError);
                        }
                    }
                } catch (e) {
                    consecutiveErrors++;
                    errorLog("[Queue Polling] 네트워크 통신 오류 (연속 에러 카운트: " + consecutiveErrors + ")", e);

                    if (consecutiveErrors === 20) {
                        toastr.warning("서버 응답 지연으로 대기열 추적이 멈췄습니다.<br>백그라운드 작업은 정상 진행 중이며, 연결 복구 시 화면이 자동 갱신됩니다.", "통신 지연", {timeOut: 8000});
                    }
                }
            }

            const stillHasServerTask = Object.values(window._pmh_media_queues).some(q => q.server_id === serverId);
            if (stillHasServerTask) {
                window._pmh_queue_poll_timer = window._pmh_queue_poll_timer || {};
                if (window._pmh_queue_poll_timer[serverId]) clearTimeout(window._pmh_queue_poll_timer[serverId]);
                
                const nextPollDelay = consecutiveErrors > 5 ? 8000 : 3000;
                window._pmh_queue_poll_timer[serverId] = setTimeout(pollLoop, nextPollDelay);
            } else {
                window._pmh_polling_active[serverId] = false;
            }
        };

        pollLoop();
    };

    async function processList() {
        if (!state.listGuid && !state.listTag && !state.listPlay && !state.listMultiPath) return;

        if (globalFallbackQueue.length > 0) {
            infoLog(`[Queue] Screen or scroll changed. Nuking old analysis queue (${globalFallbackQueue.length} items).`);
            globalFallbackQueue.length = 0;
        }

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

            if (isIgnoredItem(href, iid, cont)) return;
            if (!sid || !iid) return;

            itemsToRevalidate.push({ sid, iid, cont, link });

            const currentStateHash = getItemStateHash(cont);
            const marker = cont.querySelector('.pmh-render-marker');
            let isAlreadyRendered = false;

            if (marker && marker.getAttribute('data-iid') === iid) {
                const markerHash = marker.getAttribute('data-state-hash');
                const isStale = marker.getAttribute('data-stale') === 'true';

                if (isStale || (markerHash && currentStateHash && markerHash !== currentStateHash)) {
                    log(`[List] UI State changed or marked stale for ID: ${iid}. Forcing bypass validation.`);
                    changedItems.add(iid);
                    sessionRevalidated.delete(iid);
                    isAlreadyRendered = false;
                } else {
                    const isIgnored = marker.getAttribute('data-ignored') === 'true';
                    if (isIgnored) {
                        isAlreadyRendered = true;
                    } else {
                        const isFriendPending = marker.getAttribute('data-friend-pending') === 'true';
                        let badgeMissing = false;

                        if ((state.listTag || state.listPlay || isFriendPending) && !cont.querySelector('.pmh-top-right-wrapper')) badgeMissing = true;

                        if (!isFriendPending && (state.listGuid || state.listMultiPath) && !cont.querySelector('.pmh-guid-wrapper')) badgeMissing = true;

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
            let cacheKey = srvConfig ? `L_${item.sid}_${item.iid}` : `F_${item.sid}_${item.iid}`;
            let cData = getMemoryCache(cacheKey);

            if (!cData && srvConfig) {
                cData = getMemoryCache(`F_${item.sid}_${item.iid}`);
                if (cData) cacheKey = `F_${item.sid}_${item.iid}`;
            }

            if (cData) {
                if (changedItems.has(item.iid)) {
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
                    setMemoryCache(`L_${item.sid}_${item.iid}`, cData);
                }

                let displayData = { ...cData, tags: applyUserTags(cData.p, cData.tags) };
                renderListBadges(item.cont, item.poster, item.link, displayData, srvConfig, item.iid);
                item.isRendered = true;
                instantRenderCount++;
            } else if (!srvConfig) {
                renderListBadges(item.cont, item.poster, item.link, { is_friend_pending: true }, srvConfig, item.iid);
                item.isRendered = true;
            }
        });

        if (instantRenderCount > 0) log(`[List] Fast rendered ${instantRenderCount} items instantly from memory cache.`);

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
                const idsToFallbackBypass = [];

                idSet.forEach(id => {
                    if (!sessionRevalidated.has(id)) {
                        if (changedItems.has(id)) idsToFallbackBypass.push(id);
                        else idsToFetch.push(id);
                    }
                });

                if (idsToFetch.length > 0) {
                    try {
                        const fetchedDbData = await makeRequest(
                            `${srvConfig.relayUrl}/library/batch`,
                            'POST',
                            { ids: idsToFetch, check_multi_path: state.listMultiPath },
                            ClientSettings.masterApiKey
                        );

                        const isDataEqual = (a, b) => {
                            if (!a || !b) return false;
                            if (a.ignored !== b.ignored) return false;
                            if (a.g !== b.g || a.raw_g !== b.raw_g || a.p !== b.p || a.path_count !== b.path_count) return false;
                            if (a.part_id !== b.part_id || a.sub_id !== b.sub_id || a.sub_url !== b.sub_url) return false;
                            const tagsA = a.tags || []; const tagsB = b.tags || [];
                            if (tagsA.length !== tagsB.length) return false;
                            for (let i = 0; i < tagsA.length; i++) { if (tagsA[i] !== tagsB[i]) return false; }
                            return true;
                        };

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

                            if (!oldCache || !isDataEqual(oldCache, newData)) {
                                setMemoryCache(`L_${serverId}_${id}`, newData);

                                const liveWrappers = document.querySelectorAll(`div[data-testid^="cellItem"], div[class*="ListItem-container"], div[class*="MetadataPosterCard-container"]`);
                                for (const live of liveWrappers) {
                                    let liveLink = live.querySelector('a[data-testid="metadataTitleLink"]');
                                    if (!liveLink) liveLink = live.querySelectorAll('a[href*="key="], a[href*="/metadata/"]')[0];
                                    if (liveLink && decodeURIComponent(liveLink.getAttribute('href') || '').includes(id)) {

                                        let livePoster = live.querySelector(`[class*="PosterCard-card-"], [class*="MetadataSimplePosterCard-card-"], [class*="ThumbCard-card-"], [class*="Card-card-"], [class*="ThumbCard-imageContainer"], [data-testid="metadata-poster"]`);
                                        if (!livePoster && live.classList.contains('ListItem-container')) livePoster = live.firstElementChild;

                                        if (livePoster) {
                                            livePoster.querySelector('.pmh-render-marker')?.remove();
                                            livePoster.querySelector('.pmh-top-right-wrapper')?.remove();
                                            live.querySelectorAll('.plex-guid-list-box, .pmh-guid-wrapper').forEach(el => el.remove());

                                            let displayData = { ...newData, tags: applyUserTags(newData.p, newData.tags) };
                                            renderListBadges(live, livePoster, liveLink, displayData, srvConfig, id);
                                        }
                                    }
                                }
                            } else {
                                pendingItems.filter(p => p.sid === serverId && p.iid === id && !p.isRendered).forEach(item => {
                                    item.poster.querySelector('.pmh-render-marker')?.remove();
                                    if (!newData.ignored) {
                                        let displayData = { ...newData, tags: applyUserTags(newData.p, newData.tags) };
                                        renderListBadges(item.cont, item.poster, item.link, displayData, srvConfig, id);
                                        item.isRendered = true;
                                    }
                                });
                            }
                        });
                    } catch (e) {}
                }

                if (session !== currentRenderSession) return;

                const addedToNewQueue = new Set();
                let queueCount = 0;

                idsToFallbackBypass.forEach(id => {
                    if (addedToNewQueue.has(id)) return;
                    const existsInPending = pendingItems.some(p => p.iid === id && p.sid === serverId);
                    if (!existsInPending) return;

                    addedToNewQueue.add(id);
                    queueCount++;

                    globalFallbackQueue.push({
                        id: id,
                        session: session,
                        task: async () => {
                            if (session !== currentRenderSession) return;
                            try {
                                let logTitle = "Unknown Title";
                                const representativeItem = itemsToRevalidate.find(p => p.iid === id);
                                if (representativeItem) {
                                    if (representativeItem.currentStateHash) {
                                        const hashParts = representativeItem.currentStateHash.split('|');
                                        logTitle = hashParts.find(p => p && isNaN(p)) || "Unknown Title";
                                    }
                                    if (logTitle === "Unknown Title" && representativeItem.link) {
                                        logTitle = representativeItem.link.getAttribute('aria-label') || representativeItem.link.title || representativeItem.link.textContent.trim() || "Unknown Title";
                                    }
                                }

                                infoLog(`[List Fallback] DB WAL Delay Bypassed. Fetching fresh data directly from Plex API for [${logTitle}] (ID: ${id})`);
                                let meta = await fetchPlexMetaFallback(id, plexSrv);
                                if (!meta) return;

                                const fallbackTags = parsePlexFallbackTags(meta);
                                const updatedInfo = convertPlexMetaToLocalData(meta, id);

                                const oldCache = getMemoryCache(`L_${serverId}_${id}`);
                                if (oldCache) {
                                    updatedInfo.analyze_count = oldCache.analyze_count || 0;
                                    updatedInfo.last_analyze_time = oldCache.last_analyze_time || 0;
                                    updatedInfo.corrupt_logged = oldCache.corrupt_logged || false;
                                    updatedInfo.last_cooldown_log = oldCache.last_cooldown_log || 0;
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
                                            }
                                        }
                                    }
                                }

                                if (representativeItem && representativeItem.currentStateHash) {
                                    updatedInfo.saved_state_hash = representativeItem.currentStateHash;
                                }

                                if (session === currentRenderSession) {
                                    setMemoryCache(`L_${serverId}_${id}`, updatedInfo);
                                    sessionRevalidated.add(id);

                                    let displayData = { ...updatedInfo, tags: applyUserTags(updatedInfo.p, updatedInfo.tags) };

                                    const liveWrappers = document.querySelectorAll(`div[data-testid^="cellItem"], div[class*="ListItem-container"], div[class*="MetadataPosterCard-container"]`);
                                    for (const live of liveWrappers) {
                                        let liveLink = live.querySelector('a[data-testid="metadataTitleLink"]');
                                        if (!liveLink) liveLink = live.querySelectorAll('a[href*="key="], a[href*="/metadata/"]')[0];
                                        if (liveLink && decodeURIComponent(liveLink.getAttribute('href') || '').includes(id)) {
                                            let livePoster = live.querySelector(`[class*="PosterCard-card-"], [class*="MetadataSimplePosterCard-card-"], [class*="ThumbCard-card-"], [class*="Card-card-"], [class*="ThumbCard-imageContainer"], [data-testid="metadata-poster"]`);
                                            if (!livePoster && live.classList.contains('ListItem-container')) livePoster = live.firstElementChild;
                                            if (livePoster) {
                                                livePoster.querySelector('.pmh-render-marker')?.remove();
                                                renderListBadges(live, livePoster, liveLink, displayData, srvConfig, id);

                                                const matchedPending = pendingItems.find(p => p.poster === livePoster);
                                                if (matchedPending) matchedPending.isRendered = true;
                                            }
                                        }
                                    }
                                }
                            } catch (e) {
                                errorLog(`[Fallback Task] Error fetching Plex API for ${id}:`, e);
                            }
                        }
                    });
                });

                itemsToRevalidate.filter(p => p.sid === serverId).forEach(item => {
                    if (changedItems.has(item.iid) || addedToNewQueue.has(item.iid)) return;

                    const cacheKey = `L_${serverId}_${item.iid}`;
                    const info = getMemoryCache(cacheKey);
                    if (!info || info.ignored) return;

                    const pItem = pendingItems.find(p => p.iid === item.iid && !p.isRendered);

                    if (pItem) {
                        let displayData = { ...info, tags: applyUserTags(info.p, info.tags) };
                        renderListBadges(item.cont, pItem.poster, item.link, displayData, srvConfig, item.iid);
                        pItem.isRendered = true;
                    }

                    let serverIgnoreList = [];
                    if (window._pmh_latest_ping_results && window._pmh_latest_ping_results[serverId]) {
                        const rawStr = window._pmh_latest_ping_results[serverId].ignore_res_section || "";
                        serverIgnoreList = rawStr.split(',').map(s => s.trim()).filter(Boolean);
                    }

                    let isIgnoredSection = false;
                    if (info.librarySectionID && serverIgnoreList.includes(String(info.librarySectionID))) {
                        isIgnoredSection = true;
                    }

                    const hasResBadge = isIgnoredSection ? true : info.tags.some(t => /8K|6K|4K|FHD|HD|SD/.test(t));
                    const isVideo = isIgnoredSection ? false : !!info.part_id; 
                    
                    const analyzeCount = info.analyze_count || 0;
                    const lastAnalyzeTime = info.last_analyze_time || 0;
                    const now = Date.now();
                    const isCoolingDown = (now - lastAnalyzeTime < 10000);
                    const isCorrupt = (analyzeCount >= 3);
                    const isUnanalyzed = (state.listTag && !hasResBadge && isVideo && !isCorrupt && !isCoolingDown);
                    const rawG = (info.raw_g || '').toLowerCase();
                    const isDummyGuid = !rawG || rawG === '-' || rawG.includes('local://') || rawG.includes('none://');
                    const oldGuidAttr = item.cont.querySelector('.plex-guid-list-box')?.getAttribute('title') || '';
                    const isCurrentlyShowingDummy = oldGuidAttr.includes('local://') || oldGuidAttr.includes('none://');

                    const dbStillNotSynced = (changedItems.has(item.iid) || isCurrentlyShowingDummy) && (isDummyGuid || oldGuidAttr.includes(info.g));

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

                                await new Promise(r => setTimeout(r, 1000));
                                if (session !== currentRenderSession) return;

                                try {
                                    if (dbStillNotSynced) {
                                        log(`[Fallback] DB not synced yet for [${logTitle}] (ID: ${item.iid}). Calling Plex API...`);
                                    } else {
                                        infoLog(`[Analyze] Missing resolution tag for [${logTitle}] (ID: ${item.iid}) (Attempt ${analyzeCount + 1}/3). Calling Plex API...`);
                                    }

                                    let meta = await fetchPlexMetaFallback(item.iid, plexSrv);
                                    if (!meta || meta === 'DELETED') return;

                                    let fallbackTags = parsePlexFallbackTags(meta);
                                    const m = meta.Media && meta.Media[0] ? meta.Media[0] : null;

                                    let currentAnalyzeCount = analyzeCount;
                                    let currentAnalyzeTime = lastAnalyzeTime;

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
                                        corrupt_logged: info.corrupt_logged,
                                        last_cooldown_log: info.last_cooldown_log
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
                                                    livePoster.querySelector('.pmh-render-marker')?.remove();
                                                    renderListBadges(live, livePoster, liveLink, displayData, srvConfig, item.iid);

                                                    const matchedPending = pendingItems.find(p => p.poster === livePoster);
                                                    if (matchedPending) matchedPending.isRendered = true;
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
        const existingBox = document.getElementById('plex-guid-box');
        if (existingBox && existingBox.dataset.state === 'loading') return;

        if (existingBox) existingBox.remove();

        const loadingHtml = `
        <div id="plex-guid-box" data-state="loading" style="margin-top: 15px; margin-bottom: 10px; width: 100%;">
            <div style="color:#e5a00d; font-size:16px; margin-bottom:8px; font-weight:bold; display:flex; align-items:center;">
                미디어 정보
            </div>
            <div style="display: flex; align-items: center; justify-content: center; padding: 20px 0; color: #adb5bd; font-size: 14px; background: rgba(0,0,0,0.2); border: 1px dashed #333; border-radius: 4px;">
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
        if (isIgnoredItem(null, itemId)) return;
        if (!serverId || !itemId) return;
        if (isFetchingDetail && !isManualRefresh) return;
        if (!isManualRefresh && currentDisplayedItemId === itemId && document.getElementById('plex-guid-box')?.dataset.state !== 'loading') return;

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
        let hasDisplayedCache = false;

        if (!isManualRefresh) {
            const cData = getMemoryCache(cacheKey);
            if (cData) {
                const box = document.getElementById('plex-guid-box');
                if (box) box.remove();
                renderDetailHtml(cData, serverId, srvConfig, container);
                currentDisplayedItemId = itemId;
                hasDisplayedCache = true;
            } else {
                renderLoadingBox(container);
            }
        }

        try {
            if (!srvConfig) {
                let meta = await fetchPlexMetaFallback(itemId, plexSrv);
                if (meta && session === currentRenderSession) {
                    let friendData = convertPlexMetaToLocalData(meta, itemId);

                    const oldCache = getMemoryCache(cacheKey);
                    if (!hasDisplayedCache || JSON.stringify(oldCache) !== JSON.stringify(friendData)) {
                        setMemoryCache(cacheKey, friendData);
                        document.getElementById('plex-guid-box')?.remove();
                        renderDetailHtml(friendData, serverId, null, container);
                        currentDisplayedItemId = itemId;
                    }
                }
                return;
            }

            let data = await makeRequest(`${srvConfig.relayUrl}/media/${itemId}`, "GET", null, ClientSettings.masterApiKey);
            if (session !== currentRenderSession) return;

            let hasMissingData = false;
            if (data.type === 'video' && data.versions) {
                hasMissingData = data.versions.some(v => !v.width || v.width === 0);
            }

            if (hasMissingData || isManualRefresh) {
                let meta = await fetchPlexMetaFallback(itemId, plexSrv);

                let stillMissing = false;
                if (meta && meta !== 'DELETED' && meta.Media) {
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
                    if (meta.duration && data.type !== 'directory') {
                        data.duration = meta.duration;
                    }

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
                box.innerHTML = `<div style="color:#bd362f; font-size:13px; padding:15px; background:rgba(0,0,0,0.2); border:1px dashed #333; text-align:center;"><i class="fas fa-exclamation-triangle"></i> 데이터를 불러오는 중 오류가 발생했습니다.</div>`;
            }
        } finally {
            isFetchingDetail = false;
        }
    }

    function renderDetailHtml(data, serverId, srvConfig, container) {
        let versionsHtml = '';
        let mediaInfoPlaceholder = '<span style="color:#777;">-</span>';
        const plexSrv = extractPlexServerInfo(serverId);

        const formatBitrate = (bps) => {
            if (!bps || isNaN(bps)) return '';
            const val = parseInt(bps, 10);
            if (val >= 1000000) return `${(val / 1000000).toFixed(1)} Mbps`;
            if (val >= 1000) return `${Math.round(val / 1000)} Kbps`;
            return `${val} bps`;
        };

        if ((data.type === 'directory' || data.type === 'album') && data.versions && data.versions.length > 0) {
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
                    const ePath = encodePathSafe(localPath);
                    folderIconHtml = `<a href="plexfolder://${ePath}" class="plex-guid-action plex-open-folder" title="폴더 열기" data-path="${localPath}"><i class="fas fa-folder-open"></i></a>`;

                    if (isRoot) {
                        pathLinkHtml = generateSplitPathHtml(serverPath, data.librarySectionID, 'directory', '');
                    } else {
                        pathLinkHtml = `<a href="#" class="plex-path-scan-link" data-path="${serverPath}" data-section-id="${data.librarySectionID}" data-type="directory" title="클릭: 단순 스캔 / Shift+클릭: VFS 갱신 후 스캔" style="color:#9E9E9E; text-decoration:none; transition:0.2s;" onmouseover="this.style.color='#fff'; this.style.textDecoration='underline';" onmouseout="this.style.color='#9E9E9E'; this.style.textDecoration='none';">${displayPath}</a>`;
                    }
                }

                let html = `
                <div style="display: flex; align-items: center; gap: 10px; padding: 0;">
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

            if (data.type === 'album' && data.tracks && data.tracks.length > 0) {
                versionsHtml += `<div style="border-top: 1px dashed #444; padding: 10px 8px 0 8px;">
                                    <div style="font-size: 12px; color: #a3a3a3; font-weight: bold; margin-bottom: 8px;"><i class="fas fa-list-ol"></i> 수록곡 목록 (${data.tracks.length} 트랙)</div>`;

                data.tracks.forEach(t => {
                    let playExtBtn = `<span style="color:#555;" title="지원하지 않음"><i class="fas fa-play"></i></span>`;
                    let streamBtn = `<span style="color:#555;" title="지원하지 않음"><i class="fas fa-wifi"></i></span>`;

                    if (srvConfig && t.file) {
                        const ePath = encodePathSafe(getLocalPath(t.file));
                        const btnStyle = "display:inline-flex; align-items:center; justify-content:center; width:22px; height:22px; border-radius:4px; background:rgba(0,0,0,0.2); border:1px solid rgba(255,255,255,0.05); transition:0.2s;";

                        playExtBtn = `<a href="plexplay://${ePath}" class="plex-guid-action plex-play-external" style="${btnStyle} color:#2f96b4;" title="로컬 재생" data-filename="${t.file.split(/[\\/]/).pop() || t.file}" onmouseover="this.style.background='rgba(47,150,180,0.2)'" onmouseout="this.style.background='rgba(0,0,0,0.2)'"><i class="fas fa-play"></i></a>`;

                        if (t.part_id && plexSrv) {
                            const vUrl = `${plexSrv.url}/library/parts/${t.part_id}/0/file?X-Plex-Token=${plexSrv.token}&ratingKey=${data.itemId}`;
                            let justFileName = "Unknown_Audio.mp3";
                            const pathParts = t.file.split(/[\\/]/);
                            justFileName = pathParts[pathParts.length - 1];

                            const streamPayload = encodePathSafe(vUrl) + '%7C%7C' + encodePathSafe(justFileName);

                            streamBtn = `<a href="plexstream://${streamPayload}" class="plex-guid-action plex-play-stream" style="${btnStyle} color:#e5a00d;" title="스트리밍" data-filename="${justFileName}" onmouseover="this.style.background='rgba(229,160,13,0.2)'" onmouseout="this.style.background='rgba(0,0,0,0.2)'"><i class="fas fa-wifi"></i></a>`;
                        }
                    }

                    const bitTxt = formatBitrate(t.a_bitrate);
                    let infoTags = [];
                    if (t.a_codec) infoTags.push(t.a_codec);
                    if (bitTxt) infoTags.push(bitTxt);
                    if (t.has_lyric) infoTags.push(`<span style="color:#51a351;"><i class="fas fa-comment-alt"></i> 가사</span>`);
                    const infoStr = infoTags.length > 0 ? ` <span style="color:#777; font-size:11px; margin-left:6px;">(${infoTags.join(' / ')})</span>` : '';

                    versionsHtml += `
                        <div style="display:flex; align-items:center; gap:8px; padding:4px 0; border-bottom:1px solid rgba(255,255,255,0.05);">
                            <div style="display:flex; gap:6px; flex-shrink:0;">
                                ${playExtBtn} ${streamBtn}
                            </div>
                            <div style="font-size:12px; color:#ccc; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; flex-grow:1; min-width:0;">
                                <span style="display:inline-block; width:22px; text-align:right; color:#777; margin-right:6px;">${t.t_num}.</span>
                                <span style="color:#fff;">${t.t_title}</span>
                                ${infoStr}
                            </div>
                        </div>
                    `;
                });
                versionsHtml += `</div>`;
            }

        } else if (data.type === 'video') {
            versionsHtml = `
                <div class="media-info-line pmh-video-header-line">
                    <div class="info-block"><span class="info-label pmh-video-header-label">외부재생</span></div>
                    <div class="info-block"><span class="info-label pmh-video-header-label">스트리밍</span></div>
                    <div class="info-block"><span class="info-label pmh-video-header-label">폴더열기</span></div>
                    <div class="info-block"><span class="info-label pmh-video-header-label">해상도</span></div>
                    <div class="info-block"><span class="info-label pmh-video-header-label">비디오</span></div>
                    <div class="info-block"><span class="info-label pmh-video-header-label">오디오</span></div>
                    <div class="info-block"><span class="info-label pmh-video-header-label">자막</span></div>
                </div>
            `;

            versionsHtml += data.versions.map((v) => {
                let vRes = mediaInfoPlaceholder;
                if (v.width && v.width > 0) {
                    vRes = v.width >= 7000 ? '8K' : v.width >= 5000 ? '6K' : v.width >= 3400 ? '4K' : v.width >= 1900 ? 'FHD' : v.width >= 1200 ? 'HD' : 'SD';
                }

                const vbTxt = formatBitrate(v.v_bitrate);
                const abTxt = formatBitrate(v.a_bitrate);
                const vTxt = (v.v_codec || v.v_bitrate) ? `${(v.v_codec||'').toUpperCase()}${v.video_extra || ''} ${vbTxt ? `(${vbTxt})` : ''}`.trim() : mediaInfoPlaceholder;
                const ch = v.a_ch==6 ? '5.1' : v.a_ch==8 ? '7.1' : v.a_ch==2 ? '2.0' : v.a_ch ? `${v.a_ch}ch` : '';
                const aTxt = (v.a_codec || v.a_bitrate) ? `${(v.a_codec||'').toUpperCase()} ${ch} ${abTxt ? `(${abTxt})` : ''}`.trim() : mediaInfoPlaceholder;

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

                let subHtml = mediaInfoPlaceholder;
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

                    const streamPayload = encodePathSafe(vUrl) + '%7C' + encodePathSafe(sUrl) + '%7C' + encodePathSafe(justFileName);
                    streamHtml = `<a href="plexstream://${streamPayload}" class="plex-guid-action plex-play-stream" title="스트리밍" data-filename="${justFileName}"><i class="fas fa-wifi"></i></a>`;
                }

                let playExternalHtml = `<span style="color:#555;" title="친구 서버는 지원하지 않습니다.">-</span>`;
                let openFolderHtml = `<span style="color:#555;" title="친구 서버는 지원하지 않습니다.">-</span>`;
                let pathLinkHtml = '';

                if (srvConfig) {
                    const localFilePath = getLocalPath(v.file);
                    const ePath = encodePathSafe(localFilePath);
                    let justFileName = v.file.split(/[\\/]/).pop() || v.file;

                    playExternalHtml = `<a href="plexplay://${ePath}" class="plex-guid-action plex-play-external" title="로컬 재생" data-filename="${justFileName}"><i class="fas fa-play"></i></a>`;

                    openFolderHtml = `<a href="plexfolder://${ePath}" class="plex-guid-action plex-open-folder" title="폴더 열고 파일 선택" data-path="${localFilePath}"><i class="fas fa-folder-open"></i></a>`;

                    const uTags = applyUserTags(v.file, []);
                    const uTagsHtml = uTags.length > 0
                        ? uTags.map(t => `<span style="background-color:#e5a00d; color:#1f1f1f; padding:1px 4px; border-radius:3px; font-weight:bold; margin-right:6px; font-size:10px; vertical-align:middle;">${t}</span>`).join('')
                        : '';

                    pathLinkHtml = `
                    <div style="font-size: 12px; color: #9E9E9E; padding-left: 8px; padding-right: 10px; margin-top: 4px; word-break: break-all; overflow-wrap: anywhere; line-height: 1.3;">
                        ${generateSplitPathHtml(v.file, data.librarySectionID, 'video', uTagsHtml)}
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
                    <div style="font-size: 12px; color: #999; padding-left: 8px; padding-right: 10px; margin-top: 4px; font-style: italic; word-break: break-all; overflow-wrap: anywhere; line-height: 1.3;">
                        ${uTagsHtml}${justFileName}
                    </div>`;
                }

                return `
                <div class="media-version-block pmh-video-version-block">
                    <div class="media-info-line pmh-video-data-line">
                        <div class="info-block"><span class="info-value">${playExternalHtml}</span></div>
                        <div class="info-block"><span class="info-value">${streamHtml}</span></div>
                        <div class="info-block"><span class="info-value">${openFolderHtml}</span></div>
                        <div class="info-block"><span class="info-value">${vRes}</span></div>
                        <div class="info-block"><span class="info-value">${vTxt}</span></div>
                        <div class="info-block"><span class="info-value">${aTxt}</span></div>
                        <div class="info-block"><span class="info-value">${subHtml}</span></div>
                    </div>
                    ${pathLinkHtml}
                </div>`;
            }).join('');
        }

        const mateBtnHtml = srvConfig ?
            `<div style="margin:8px 0 4px 0; display:flex; align-items:center; padding: 0 8px;">
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
            <a href="#" id="pmh-btn-refresh-meta" style="color: #adb5bd; text-decoration: none; transition: 0.2s;" title="Plex에 메타 새로고침을 요청합니다." onmouseover="this.style.color='#fff'" onmouseout="this.style.color='#adb5bd'"><i class="fas fa-bolt" style="font-size: 10px; margin-right: 2px;"></i>메타 새로고침</a>
            <span style="opacity: 0.3; color: #adb5bd; margin: 0 4px;">|</span>
            <a href="#" id="pmh-btn-rematch" style="color: #adb5bd; text-decoration: none; transition: 0.2s;" title="일반 클릭: 덮어쓰기 리매칭 / Shift+클릭: 언매치 후 클린 리매칭" onmouseover="this.style.color='#fff'" onmouseout="this.style.color='#adb5bd'"><i class="fas fa-link" style="font-size: 10px; margin-right: 2px;"></i>메타 리매칭</a>
            <span style="opacity: 0.3; color: #adb5bd; margin: 0 4px;">|</span>
            <a href="#" id="pmh-btn-analyze" style="color: #adb5bd; text-decoration: none; transition: 0.2s;" title="Plex에 미디어 분석을 요청합니다." onmouseover="this.style.color='#fff'" onmouseout="this.style.color='#adb5bd'"><i class="fas fa-search-plus" style="font-size: 10px; margin-right: 2px;"></i>미디어 분석</a>
        ` : '';

        const boxHtml = `
        <div id="plex-guid-box" class="pmh-fade-update" style="margin-top: 15px; width: 100%; position: relative;">

            <div style="color:#e5a00d; font-size:16px; font-weight:bold; display:flex; align-items:baseline;">
                미디어 정보
                <span style="margin-left: 12px; font-weight: normal; letter-spacing: -0.5px; font-size: 11px;">
                    <a href="#" id="pmh-btn-refresh-data" style="color: #adb5bd; text-decoration: none; transition: 0.2s;" title="DB 데이터를 다시 불러옵니다." onmouseover="this.style.color='#fff'" onmouseout="this.style.color='#adb5bd'"><i class="fas fa-sync-alt" style="font-size: 10px; margin-right: 2px;"></i>정보 새로고침</a>
                    ${refreshMetaBtnHtml}
                </span>
            </div>

            <div style="border-top: 1px solid rgba(255,255,255,0.1);"></div>

            <div id="plex-guid-content">
                ${versionsHtml}
                ${mateBtnHtml}
                <div style="display:flex; align-items:center; margin-bottom: 4px; padding: 0 8px;">
                    <div style="width: 95px; flex-shrink: 0; color: #bababa; font-size:13px; font-weight:500;">GUID</div>
                    ${guidHtml}
                </div>
                ${data.duration ? `
                <div style="display:flex; align-items:center; padding: 0 8px;">
                    <div style="width: 95px; flex-shrink: 0; color: #bababa; font-size:13px; font-weight:500;">재생 시간</div>
                    <span style="font-size:13px; color:#E0E0E0;"><i class="fas fa-clock" style="color:#bdbdbd; margin-right:4px;"></i>${formatDuration(data.duration)}</span>
                    ${markersHtml}
                </div>` : ''}
            </div>

            <div style="border-bottom: 1px solid rgba(255,255,255,0.1); margin-top: 4px;"></div>

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

        const smartRefreshChildren = () => {
            if (renderSessionAtClick !== currentRenderSession) return;

            const itemWrappers = document.querySelectorAll(`div[data-testid^="cellItem"], div[class*="ListItem-container"], div[class*="MetadataPosterCard-container"], tr[class*="TableRow-"]`);

            itemWrappers.forEach(cont => {
                if (cont.closest('div[class*="VirtualHubScroller-"]')) return;

                let link = cont.querySelector('a[data-testid="metadataTitleLink"]') || cont.querySelectorAll('a[href*="key="], a[href*="/metadata/"]')[0];
                if (!link) return;

                try {
                    const href = link.getAttribute('href');
                    const keyParam = new URLSearchParams(href.split('?')[1]).get('key');
                    if (keyParam) {
                        const iid = decodeURIComponent(keyParam).split('/metadata/')[1]?.split(/[\/?]/)[0];
                        if (iid && serverId) {
                            if (typeof sessionRevalidated !== 'undefined') sessionRevalidated.delete(iid);

                            const marker = cont.querySelector('.pmh-render-marker');
                            if (marker) {
                                marker.setAttribute('data-stale', 'true');
                            }
                        }
                    }
                } catch(e) {}
            });

            setTimeout(() => { if (typeof processList === 'function' && renderSessionAtClick === currentRenderSession) processList(); }, 50);
        };

        const waitQueueTask = async (taskId, srvConfig) => {
            while (!abortDetailRefresh) {
                await new Promise(r => setTimeout(r, 2000));
                const statusRes = await makeRequest(`${srvConfig.relayUrl}/media/queue_status`, 'POST', { task_ids: [taskId] }, ClientSettings.masterApiKey);
                const statusInfo = statusRes[taskId];

                if (!statusInfo || statusInfo.state === 'completed') return true;
                if (statusInfo.state === 'error') throw new Error(statusInfo.msg || "서버 작업 실패");
            }
            throw new Error("Cancelled");
        };

        const btnRefreshData = document.getElementById('pmh-btn-refresh-data');
        if (btnRefreshData) {
            btnRefreshData.addEventListener('click', (e) => {
                e.preventDefault(); e.stopPropagation();
                if (btnRefreshData.dataset.refreshing) return;
                infoLog(`[Detail] Data re-fetch requested. Clearing memory cache for Item: ${data.itemId}`);

                btnRefreshData.dataset.refreshing = "true";
                btnRefreshData.innerHTML = `<i class="fas fa-spinner fa-spin" style="font-size: 10px; margin-right: 2px;"></i>정보 새로고침 중...`;

                showBoxLoading();

                deleteMemoryCache(srvConfig ? `D_${serverId}_${data.itemId}` : `F_${serverId}_${data.itemId}`);
                if (typeof sessionRevalidated !== 'undefined') sessionRevalidated.delete(data.itemId);

                currentDisplayedItemId = null;
                setTimeout(() => {
                    processDetail(true);
                    smartRefreshChildren();
                }, 100);
            });
        }

        const btnRefreshMeta = document.getElementById('pmh-btn-refresh-meta');
        if (btnRefreshMeta) {
            btnRefreshMeta.addEventListener('click', async (e) => {
                e.preventDefault(); e.stopPropagation();
                if (!plexSrv) return toastr.error("토큰을 찾을 수 없습니다.");

                const originalHtml = `<i class="fas fa-bolt" style="font-size: 10px; margin-right: 2px;"></i>메타 새로고침`;
                const originalTitle = "Plex에 메타 새로고침을 요청합니다.";

                if (btnRefreshMeta.dataset.refreshing === 'true') {
                    abortDetailRefresh = true;
                    btnRefreshMeta.innerHTML = `<i class="fas fa-times" style="font-size: 10px; margin-right: 2px;"></i>취소됨`;
                    btnRefreshMeta.title = "";
                    hideBoxLoading();
                    toastr.warning("요청이 취소되었습니다.", "취소됨", {timeOut: 2000});

                    setTimeout(() => {
                        if (btnRefreshMeta.isConnected) {
                            btnRefreshMeta.innerHTML = originalHtml;
                            btnRefreshMeta.title = originalTitle;
                            delete btnRefreshMeta.dataset.refreshing;
                        }
                        deleteMemoryCache(`D_${serverId}_${data.itemId}`);
                        processDetail(true);
                        smartRefreshChildren();
                    }, 1500);
                    return;
                }

                abortDetailRefresh = false;
                btnRefreshMeta.dataset.refreshing = 'true';
                btnRefreshMeta.innerHTML = `<i class="fas fa-spinner fa-spin" style="font-size: 10px; margin-right: 2px;"></i>요청 전송 중...`;
                btnRefreshMeta.title = "클릭시 대기 취소";

                const rawG = (data.guid || '').toLowerCase();
                const isUnmatched = !rawG || rawG === '-' || rawG.includes('local://') || rawG.includes('none://');
                const oldCacheKey = srvConfig ? `D_${serverId}_${data.itemId}` : `F_${serverId}_${data.itemId}`;
                const oldDataSnapshot = getMemoryCache(oldCacheKey);
                const currentSessionAtRequest = currentRenderSession;

                if (isUnmatched) {
                    showBoxLoading();
                    toastr.info("Plex 메타 새로고침 요청 중...<br>버튼을 다시 누르면 대기를 취소합니다.", "메타 새로고침", {timeOut: 5000});

                    const initialMeta = await fetchPlexMetaFallback(data.itemId, plexSrv);
                    const initialUpdated = initialMeta && initialMeta.updatedAt ? initialMeta.updatedAt : 0;

                    await triggerPlexMediaAction(data.itemId, 'refresh', plexSrv, srvConfig);

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
                        toastr.success("메타 새로고침 완료!<br>잠시 후 UI에 반영됩니다.", "성공", {timeOut: 3000});
                    } else {
                        toastr.warning("응답 지연으로 대기를 종료합니다.<br>현재 확보된 데이터로 UI를 새로고침합니다.", "시간 초과", {timeOut: 4000});
                    }

                    deleteMemoryCache(`D_${serverId}_${data.itemId}`);
                    if (typeof sessionRevalidated !== 'undefined') sessionRevalidated.delete(data.itemId);

                    currentDisplayedItemId = null;
                    processDetail(true);
                    smartRefreshChildren();

                } else {
                    infoLog(`[Detail] Background Metadata Refresh requested for matched Item: ${data.itemId}`);
                    toastr.success("Plex에 메타 새로고침을 요청했습니다.<br>변경 감지시 정보가 갱신됩니다.", "요청 완료", {timeOut: 4000});

                    triggerPlexMediaAction(data.itemId, 'refresh', plexSrv, srvConfig);

                    setTimeout(() => {
                        if (btnRefreshMeta.isConnected) {
                            btnRefreshMeta.innerHTML = originalHtml;
                            btnRefreshMeta.title = originalTitle;
                            delete btnRefreshMeta.dataset.refreshing;
                        }
                    }, 1000);

                    const checkDelays = [3000, 6000, 9000];

                    checkDelays.forEach(delay => {
                        setTimeout(async () => {
                            if (currentSessionAtRequest !== currentRenderSession || abortDetailRefresh) return;

                            try {
                                const newMeta = await fetchPlexMetaFallback(data.itemId, plexSrv);
                                if (!newMeta || newMeta === 'DELETED') return;

                                const newData = convertPlexMetaToLocalData(newMeta, data.itemId);
                                if (!newData || !oldDataSnapshot) return;

                                const isSubUrlChanged = (oldDataSnapshot.sub_url !== newData.sub_url);
                                const isGuidChanged = (oldDataSnapshot.guid !== newData.guid);
                                const isResChanged = JSON.stringify(oldDataSnapshot.tags) !== JSON.stringify(newData.tags);

                                let isSubCountChanged = false;
                                if (oldDataSnapshot.versions && newData.versions && oldDataSnapshot.versions[0] && newData.versions[0]) {
                                    const oldSubCount = oldDataSnapshot.versions[0].subs ? oldDataSnapshot.versions[0].subs.length : 0;
                                    const newSubCount = newData.versions[0].subs ? newData.versions[0].subs.length : 0;
                                    if (oldSubCount !== newSubCount) isSubCountChanged = true;
                                }

                                if (isSubUrlChanged || isGuidChanged || isResChanged || isSubCountChanged) {
                                    infoLog(`[Detail] Background watcher detected metadata changes after ${delay/1000}s. Auto-refreshing UI.`);

                                    if (currentSessionAtRequest === currentRenderSession && document.getElementById('plex-guid-box')) {
                                        deleteMemoryCache(`D_${serverId}_${data.itemId}`);
                                        if (typeof sessionRevalidated !== 'undefined') sessionRevalidated.delete(data.itemId);

                                        currentDisplayedItemId = null;
                                        processDetail(true);
                                        smartRefreshChildren();
                                        abortDetailRefresh = true;
                                    }
                                }
                            } catch (e) {
                                errorLog("[Detail Watcher Error]", e);
                            }
                        }, delay);
                    });
                }
            });
        }

        const btnRematch = document.getElementById('pmh-btn-rematch');
        if (btnRematch) {
            btnRematch.addEventListener('click', async (e) => {
                e.preventDefault(); e.stopPropagation();

                const isShiftClick = e.shiftKey;
                if (isShiftClick && window.getSelection) {
                    window.getSelection().removeAllRanges();
                }

                if (!plexSrv) return toastr.error("토큰을 찾을 수 없습니다.");

                const originalHtml = `<i class="fas fa-link" style="font-size: 10px; margin-right: 2px;"></i>메타 리매칭`;
                const originalTitle = "일반 클릭: 덮어쓰기 리매칭 / Shift+클릭: 언매치 후 클린 리매칭";

                if (btnRematch.dataset.refreshing === 'true') {
                    abortDetailRefresh = true;
                    btnRematch.innerHTML = `<i class="fas fa-times" style="font-size: 10px; margin-right: 2px;"></i>취소됨`;
                    btnRematch.title = "";

                    if (btnRematch.cancelToken && btnRematch.cancelToken.abort) {
                        btnRematch.cancelToken.abort();
                    }

                    hideBoxLoading();
                    toastr.warning("메타 리매칭이 취소되었습니다.", "취소됨", {timeOut: 2000});

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
                btnRematch.cancelToken = {};

                btnRematch.innerHTML = `<i class="fas fa-spinner fa-spin" style="font-size: 10px; margin-right: 2px;"></i>리매칭 진행중`;
                btnRematch.title = "클릭시 강제 취소";

                showBoxLoading();
                infoLog(`[Detail] Foreground Meta Rematch requested for Item: ${data.itemId} (Unmatch First: ${isShiftClick})`);

                const matchOptions = {
                    _try_refresh_first: false,
                    _do_unmatch_first: isShiftClick,
                    _skip_sim_check: ClientSettings.matchSkipSimCheck,
                    _custom_agent_score: ClientSettings.customAgentScore
                };

                if (isShiftClick) {
                    toastr.info("기존 메타데이터를 언매치 후 리매칭을 시도합니다.", "클린 리매칭 (Shift)", {timeOut: 8000});
                } else {
                    toastr.info("서버에서 메타 덮어쓰기(리매칭)를 시도합니다.", "일반 리매칭", {timeOut: 8000});
                }

                let isRematchSuccess = false;

                try {
                    const res = await makeRequest(`${srvConfig.relayUrl}/media/${data.itemId}/match`, 'POST', matchOptions, ClientSettings.masterApiKey, btnRematch.cancelToken);

                    if (res.status === 'queued') {
                        await waitQueueTask(res.task_id, srvConfig);
                    }

                    if (globalAbortFlag || renderSessionAtClick !== currentRenderSession || abortDetailRefresh) throw new Error("Cancelled");

                    isRematchSuccess = true;
                    toastr.success("메타 리매칭 완료!<br>잠시 후 UI에 반영됩니다.", "성공", {timeOut: 4000});

                } catch (err) {
                    if (err.message === "Cancelled" || err.message === "Aborted") {
                        infoLog(`[Detail] Rematch process cancelled by user/navigation.`);
                    } else {
                        toastr.error(`${err.message}`, "매칭 실패", {timeOut: 5000});
                        errorLog(`[Detail] Rematch failed for Item: ${data.itemId}. Reason: ${err.message}`);
                    }

                    hideBoxLoading();
                    if (btnRematch.isConnected) {
                        btnRematch.innerHTML = originalHtml;
                        btnRematch.title = originalTitle;
                        delete btnRematch.dataset.refreshing;
                    }
                } finally {
                    if (isRematchSuccess && !globalAbortFlag && renderSessionAtClick === currentRenderSession && !abortDetailRefresh) {
                        invalidateVisibleCaches(serverId);
                        deleteMemoryCache(`D_${serverId}_${data.itemId}`);
                        currentDisplayedItemId = null;
                        processDetail(true);
                        smartRefreshChildren();
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
                const originalTitle = "Plex에 미디어 분석을 요청합니다.";

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
                    toastr.success("미디어 분석을 서버에 요청합니다.", "분석 요청 완료", {timeOut: 4000});
                    triggerPlexMediaAction(data.itemId, 'analyze', plexSrv, srvConfig);
                    return;
                }

                abortDetailRefresh = false;
                btnAnalyze.dataset.refreshing = 'true';
                btnAnalyze.innerHTML = `<i class="fas fa-spinner fa-spin" style="font-size: 10px; margin-right: 2px;"></i>분석 대기중`;
                btnAnalyze.title = "클릭시 대기 취소";

                showBoxLoading();
                toastr.info("미디어 분석을 요청 중입니다...<br>버튼을 다시 누르면 대기를 취소합니다.", "미디어 분석", {timeOut: 5000});

                try {
                    const res = await makeRequest(`${srvConfig.relayUrl}/media/${data.itemId}/analyze`, 'POST', {}, ClientSettings.masterApiKey);
                    if (res.status === 'queued') {
                        await waitQueueTask(res.task_id, srvConfig);
                    }

                    toastr.success("미디어 분석 완료!<br>잠시 후 UI에 반영됩니다.", "성공", {timeOut: 3000});

                    deleteMemoryCache(`D_${serverId}_${data.itemId}`);
                    if (typeof sessionRevalidated !== 'undefined') sessionRevalidated.delete(data.itemId);

                    currentDisplayedItemId = null;
                    processDetail(true);
                    smartRefreshChildren();

                } catch (err) {
                    if (err.message !== "Cancelled") {
                        toastr.error(`분석 실패: ${err.message}`, "오류", {timeOut: 5000});
                    }
                    hideBoxLoading();
                    btnAnalyze.innerHTML = originalHtml;
                    delete btnAnalyze.dataset.refreshing;
                }
            });
        }

        document.querySelectorAll('#plex-guid-box .plex-play-external').forEach(el => {
            el.addEventListener('click', () => {
                const fname = el.dataset.filename || '미디어 파일';
                toastr.info(`로컬 외부 플레이어로 재생을 시도합니다.<br>'${fname}'`, '로컬 재생');
            });
        });

        document.querySelectorAll('#plex-guid-box .plex-open-folder').forEach(el => {
            el.addEventListener('click', () => {
                const path = el.dataset.path || '로컬 폴더';
                toastr.info(`로컬 탐색기로 경로를 엽니다.<br>'${path}'`, '폴더 열기');
            });
        });

        document.querySelectorAll('#plex-guid-box .plex-play-stream').forEach(el => {
            el.addEventListener('click', () => {
                const fname = el.dataset.filename || '스트리밍 영상';
                toastr.info(`네트워크 스트리밍을 호출합니다.<br>'${fname}'`, '스트리밍');
            });
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

                toastr.info(`'${finalFileName}'<br>다운로드를 시작합니다.`, "자막 다운로드");

                GM_xmlhttpRequest({
                    method: 'GET', url: url, responseType: 'blob',
                    timeout: 30000,
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
                    onerror: () => toastr.error("서버에 연결할 수 없습니다.", "다운로드 실패"),
                    ontimeout: () => toastr.error("다운로드 시간이 초과되었습니다.", "시간 초과")
                });
            });
        });

        if (!srvConfig) return;

        document.querySelectorAll('#plex-guid-box .plex-path-scan-link').forEach(el => {
            el.addEventListener('click', async (e) => {
                e.preventDefault(); e.stopPropagation();

                const isShiftClick = e.shiftKey;
                if (isShiftClick && window.getSelection) {
                    window.getSelection().removeAllRanges();
                }

                let scanPath = el.dataset.path;
                infoLog(`[PlexMate] VFS/Library Scan requested for path: ${scanPath} (VFS_Refresh: ${isShiftClick})`);
                const sectionId = el.dataset.sectionId;

                if (el.dataset.type === 'video') {
                    const lastSlash = Math.max(scanPath.lastIndexOf('/'), scanPath.lastIndexOf('\\'));
                    if (lastSlash > -1) scanPath = scanPath.substring(0, lastSlash);
                }

                const parentDiv = el.closest('div');
                let overlay = null;

                if (parentDiv) {
                    parentDiv.style.position = 'relative';
                    parentDiv.style.pointerEvents = 'none';

                    overlay = document.createElement('div');
                    overlay.className = 'pmh-path-scan-overlay';
                    overlay.style.cssText = 'position:absolute; top:0; left:0; width:100%; height:100%; display:flex; align-items:center; justify-content:center; background-color:rgba(0,0,0,0.4); border-radius:4px; z-index:10;';
                    overlay.innerHTML = `<i class="fas fa-spinner fa-spin" style="font-size:16px; color:#e5a00d;"></i>`;

                    parentDiv.appendChild(overlay);
                }

                try {
                    if (isShiftClick) {
                        toastr.info(`[1/2] VFS/Refresh 요청 중...<br>${scanPath}`, "스캔", {timeOut: 3000});

                        const vfsRes = await callPlexMateViaRelay(srvConfig, '/scan/vfs_refresh', { target: scanPath, recursive: 'true', async: 'false' });
                        if (vfsRes.ret !== 'success') throw new Error(vfsRes.msg || "VFS Refresh 실패");

                        toastr.info(`[2/2] VFS/Refresh 완료. 라이브러리 스캔 요청 중...`, "스캔", {timeOut: 3000});
                    } else {
                        toastr.info(`라이브러리 스캔을 요청합니다.<br>${scanPath}`, "스캔", {timeOut: 3000});
                    }

                    const scanRes = await callPlexMateViaRelay(srvConfig, '/scan/do_scan', { target: scanPath, target_section_id: sectionId, scanner: 'web' });

                    if (scanRes.ret === 'success') {
                        toastr.success('Plex Mate 스캔 요청 완료!', '성공');
                        infoLog(`[PlexMate] Scan successful for: ${scanPath}`);
                    } else {
                        throw new Error(scanRes.msg || "스캔 요청 실패");
                    }
                } catch (err) {
                    errorLog(`[PlexMate] Scan error:`, err);
                    toastr.error(`오류 발생: ${err.message || err}`, '스캔 실패');
                } finally {
                    if (parentDiv) {
                        if (overlay) overlay.remove();
                        parentDiv.style.pointerEvents = 'auto';
                    }
                }
            });
        });

        const mateBtn = document.getElementById('plex-mate-refresh-button');
        if (mateBtn) {
            mateBtn.addEventListener('click', async (e) => {
                e.preventDefault(); e.stopPropagation();
                infoLog(`[PlexMate] VFS Refresh + Manual Refresh requested via Core for Item: ${data.itemId}`);

                const originalHtml = mateBtn.innerHTML;
                mateBtn.style.pointerEvents = 'none';
                mateBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> YAML/TMDB 반영 중...`;
                toastr.info(`VFS 캐시 갱신 및 YAML/TMDB 반영을 요청합니다...`, "YAML/TMDB 적용", {timeOut: 4000});

                try {
                    const res = await makeRequest(`${srvConfig.relayUrl}/media/${data.itemId}/yaml_refresh`, 'POST', {}, ClientSettings.masterApiKey);
                    if (res.status === 'queued') {
                        await waitQueueTask(res.task_id, srvConfig);
                    }

                    toastr.success('YAML/TMDB 반영 완료!', '성공', {timeOut: 5000});
                    infoLog(`[PlexMate] YAML/Marker Sync successful for Item: ${data.itemId}`);

                    deleteMemoryCache(`D_${serverId}_${data.itemId}`);
                    if (typeof sessionRevalidated !== 'undefined') sessionRevalidated.delete(data.itemId);

                    currentDisplayedItemId = null;
                    processDetail(true);
                    smartRefreshChildren();
                } catch (err) {
                    errorLog(`[PlexMate] VFS/Manual refresh error:`, err);
                    toastr.error(`오류 발생: ${err.message || err}`, '실패');
                } finally {
                    mateBtn.style.pointerEvents = 'auto';
                    mateBtn.innerHTML = originalHtml;
                }
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

            isObserverLocked = true;
            globalAbortFlag = true;

            currentRenderSession++;
            sessionRevalidated.clear();
            abortAllRequests();

            document.querySelectorAll('.pmh-render-marker, .pmh-top-right-wrapper, .plex-guid-list-box, .pmh-guid-wrapper').forEach(e => e.remove());

            document.getElementById('plex-guid-box')?.remove();
            currentDisplayedItemId = null;
            currentDetailStateHash = '';

            checkUpdate();
            injectControlUI();

            setTimeout(() => {
                isObserverLocked = false;
                globalAbortFlag = false;

                if (window.location.hash.includes('/details?key=')) processDetail(false);
                processList();
            }, 800);
        }
    }

    const itemApiDebounceTimers = new Map();
    const API_DEBOUNCE_DELAY = 1000;

    let masterObserverTimer = null;
    let observerPending = false;

    const observer = new MutationObserver(() => {
        if (isObserverLocked) return;

        if (!observerPending) {
            observerPending = true;

            requestAnimationFrame(() => {
                processList();
                if (window.location.hash.includes('/details?key=')) {
                    processDetail(false);
                }
            });

            requestAnimationFrame(() => {
                observerPending = false;

                if (masterObserverTimer) clearTimeout(masterObserverTimer);

                masterObserverTimer = setTimeout(() => {
                    processMatchModal();
                    if (!document.getElementById('pmdv-controls')) injectControlUI();

                    if (window.location.hash.includes('/details?key=')) {
                        const { serverId, itemId } = extractIds();
                        const currentHash = getDetailStateHash();
                        const guidBox = document.getElementById('plex-guid-box');

                        if (!guidBox && !isFetchingDetail && currentDisplayedItemId === itemId) {
                            infoLog(`[Detail-Observer] ⚠️ 미디어 패널 증발 감지! (Plex Native UI 리렌더링). 패널을 복구합니다.`);

                            currentDisplayedItemId = null;

                            const target = document.querySelector('div[data-testid="metadata-top-level-items"]')
                                        || document.querySelector('div[data-testid="metadata-starRatings"]')
                                        || document.querySelector('div[data-testid="metadata-ratings"]')
                                        || document.querySelector('button[data-testid="preplay-play"]')
                                        || document.querySelector('span[data-testid="metadata-line2"]');

                            if (target) {
                                if(observer.detailTimer) clearTimeout(observer.detailTimer);
                                observer.detailTimer = setTimeout(() => { processDetail(); }, 100);
                            }
                        }
                        else if (currentDisplayedItemId === itemId && currentDetailStateHash && currentHash && currentDetailStateHash !== currentHash) {
                            infoLog(`[Detail-Observer] 🔄 Plex Native Action detected! Hash changed. Forcing update.`);
                            currentDetailStateHash = currentHash;

                            if (serverId && itemId) {
                                deleteMemoryCache(`D_${serverId}_${itemId}`);
                                if (typeof sessionRevalidated !== 'undefined') sessionRevalidated.delete(itemId);
                            }

                            if (guidBox) {
                                guidBox.style.opacity = '0.4';
                                guidBox.innerHTML = '<div style="padding:20px; text-align:center; color:#e5a00d;"><i class="fas fa-spinner fa-spin"></i> 갱신 중...</div>';
                            }

                            if(observer.detailTimer) clearTimeout(observer.detailTimer);
                            observer.detailTimer = setTimeout(() => { processDetail(true); }, 300);
                        }
                        else if (!guidBox && !isFetchingDetail) {
                            const target = document.querySelector('div[data-testid="metadata-top-level-items"]')
                                        || document.querySelector('div[data-testid="metadata-starRatings"]')
                                        || document.querySelector('div[data-testid="metadata-ratings"]')
                                        || document.querySelector('button[data-testid="preplay-play"]')
                                        || document.querySelector('span[data-testid="metadata-line2"]');
                            if (target) {
                                if(observer.detailTimer) clearTimeout(observer.detailTimer);
                                observer.detailTimer = setTimeout(() => { processDetail(); }, 100);
                            }
                        }
                    }

                    const allListItems = document.querySelectorAll(`
                        div[data-testid^="cellItem"],
                        div[class*="ListItem-container"],
                        div[class*="MetadataPosterCard-container"],
                        tr[class*="TableRow-"]
                    `);

                    let needsRender = false;

                    for (const cont of allListItems) {
                        let link = cont.querySelector('a[data-testid="metadataTitleLink"]') || cont.querySelectorAll('a[href*="key="], a[href*="/metadata/"]')[0];
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

                                    const targetServerId = link.getAttribute('href').match(/\/server\/([a-f0-9]+)\//)?.[1];
                                    if (targetServerId) {
                                        if (typeof sessionRevalidated !== 'undefined') sessionRevalidated.delete(iid);
                                    }

                                    marker.setAttribute('data-stale', 'true');
                                    needsDraw = true;

                                    if (itemApiDebounceTimers.has(iid)) {
                                        clearTimeout(itemApiDebounceTimers.get(iid));
                                    }

                                    itemApiDebounceTimers.set(iid, setTimeout(() => {
                                        itemApiDebounceTimers.delete(iid);
                                        if(observer.listTimer) clearTimeout(observer.listTimer);
                                        observer.listTimer = setTimeout(() => { processList(); }, 150);
                                    }, API_DEBOUNCE_DELAY));

                                } else {
                                    const isIgnored = marker.getAttribute('data-ignored') === 'true';
                                    const isFriendPending = marker.getAttribute('data-friend-pending') === 'true';

                                    if (!isIgnored) {
                                        if ((state.listTag || state.listPlay) && !cont.querySelector('.pmh-top-right-wrapper')) needsDraw = true;
                                        if (!isFriendPending && (state.listGuid || state.listMultiPath) && !cont.querySelector('.pmh-guid-wrapper')) needsDraw = true;
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

                }, 400);
            });
        }
    });

    const pushState = history.pushState;
    history.pushState = function(...a) { pushState.apply(this, a); setTimeout(() => checkUrlChange(), 50); };
    const replaceState = history.replaceState;
    history.replaceState = function(...a) { replaceState.apply(this, a); setTimeout(() => checkUrlChange(), 50); };
    window.addEventListener('popstate', () => setTimeout(() => checkUrlChange(), 50));

    function openClientSettingsModal() {
        if (document.getElementById('pmh-client-settings-modal')) return;

        let mappingsHtml = '';
        if (ClientSettings.pathMappings && ClientSettings.pathMappings.length > 0) {
            ClientSettings.pathMappings.forEach((m) => {
                mappingsHtml += `
                    <div class="pmh-path-mapping-row" style="display:flex; gap:10px; margin-bottom:8px; align-items:center;">
                        <input type="text" class="pmh-input-text pmh-map-srv" value="${m.serverPrefix}" placeholder="서버 경로 (예:
                        /gds/)" style="flex:1;">
                        <i class="fas fa-arrow-right" style="color:#777;"></i>
                        <input type="text" class="pmh-input-text pmh-map-loc" value="${m.localPrefix}" placeholder="로컬 경로 (예: Z:/gds/)" style="flex:1;">
                        <button class="pmh-btn-remove-row" style="background:#bd362f; color:#fff; border:none; border-radius:4px; padding:6px 10px; cursor:pointer;"><i class="fas fa-times"></i></button>
                    </div>
                `;
            });
        }

        const modalHtml = `
            <div id="pmh-client-settings-modal" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); z-index: 999999; display: flex; justify-content: center; align-items: center; backdrop-filter: blur(5px);">
                <div class="pmh-modal-content" style="background: #1e2124; border: 1px solid #e5a00d; border-radius: 8px; width: 550px; max-width: 95vw; display: flex; flex-direction: column; box-shadow: 0 10px 30px rgba(0,0,0,0.8); position: relative;">
                    <div style="background: #111; padding: 15px; border-bottom: 1px solid #333; border-radius: 8px 8px 0 0; display: flex; justify-content: space-between; align-items: center; flex-shrink: 0;">
                        <h2 style="margin: 0; color: #e5a00d; font-size: 16px;"><i class="fas fa-cogs"></i> PMH 프론트엔드 설정</h2>
                        <button id="pmh-settings-close" style="background:none; border:none; color:#aaa; cursor:pointer; font-size:16px;"><i class="fas fa-times"></i></button>
                    </div>

                    <div style="padding: 20px; overflow-y: auto; max-height: 70vh;">
                        <div class="pmh-form-group">
                            <label class="pmh-form-label"><i class="fas fa-server"></i> 마스터 서버 주소 (Master URL)</label>
                            <input type="text" id="pmh-set-master-url" class="pmh-input-text" value="${ClientSettings.masterUrl}" placeholder="http://127.0.0.1:8899">
                        </div>

                        <div class="pmh-form-group">
                            <label class="pmh-form-label"><i class="fas fa-key"></i> 접속 키 (API Key)</label>
                            <div style="display:flex; gap:10px;">
                                <input type="password" id="pmh-set-api-key" class="pmh-input-text" value="${ClientSettings.masterApiKey}" placeholder="마스터 서버의 BASE.APIKEY 입력" style="flex:1;">
                                <button id="pmh-settings-copy-key" style="display:flex; justify-content:center; align-items:center; width:45px; background:#333; color:#aaa; border:1px solid #444; border-radius:4px; cursor:pointer; font-size:16px; transition:all 0.2s ease;" title="API Key를 클립보드에 복사합니다." onmouseover="this.style.color='#fff'; this.style.borderColor='#e5a00d'; this.style.background='rgba(229,160,13,0.1)';" onmouseout="this.style.color='#aaa'; this.style.borderColor='#444'; this.style.background='#333';"><i class="fas fa-copy"></i></button>
                            </div>
                        </div>

                        <div style="display:flex; gap:15px;">
                            <div class="pmh-form-group" style="flex:1;">
                                <label class="pmh-form-label"><i class="fas fa-bug"></i> 로그 레벨</label>
                                <select id="pmh-set-log-level" class="pmh-input-select">
                                    <option value="INFO" ${ClientSettings.logLevel === 'INFO' ? 'selected' : ''}>INFO (기본)</option>
                                    <option value="DEBUG" ${ClientSettings.logLevel === 'DEBUG' ? 'selected' : ''}>DEBUG (상세)</option>
                                </select>
                            </div>
                            <div class="pmh-form-group" style="flex:1;">
                                <label class="pmh-form-label"><i class="fas fa-database"></i> 브라우저 캐시 한도</label>
                                <input type="number" id="pmh-set-cache-size" class="pmh-input-text" value="${ClientSettings.maxCacheSize || 5000}" placeholder="5000">
                            </div>
                        </div>

                        <div class="pmh-form-header" style="display:flex; margin-top:0; justify-content:space-between; align-items:center;">
                            <span><i class="fas fa-folder-open"></i> 로컬 경로 매핑 (선택)</span>
                            <button id="pmh-btn-add-map" style="background:#2f96b4; color:#fff; border:none; border-radius:4px; padding:4px 8px; font-size:11px; cursor:pointer;"><i class="fas fa-plus"></i> 추가</button>
                        </div>
                        <div id="pmh-path-mapping-container" style="background:rgba(0,0,0,0.2); padding:10px; border:1px solid #333; border-radius:4px; min-height:40px;">
                            ${mappingsHtml || '<div class="pmh-no-map-msg" style="color:#777; font-size:12px; text-align:center; padding:5px 0;">등록된 매핑이 없습니다.</div>'}
                        </div>

                        <div class="pmh-form-group" style="margin: 20px 0; border: 1px solid rgba(229, 160, 13, 0.4); padding: 10px; border-radius: 4px;">
                            <label class="pmh-form-label" style="margin-bottom:8px;"><i class="fas fa-link"></i> 스마트 매칭 / 리매칭 동작 설정</label>

                            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;">
                                <label class="pmh-check-label" style="display:flex; align-items:center; gap:8px;" title="SJVA/커스텀 에이전트의 매칭 합격 커트라인을 수동으로 변경합니다.">
                                    <input type="checkbox" id="pmh-set-use-custom-score" style="width:14px; height:14px;" ${ClientSettings.useCustomScore ? 'checked' : ''}>
                                    <span style="color:#ddd; font-weight:bold; color:#e5a00d;">에이전트 매칭 통과 점수 직접 지정</span>
                                </label>
                                <input type="number" id="pmh-set-custom-score" value="${ClientSettings.customAgentScore}" min="10" max="100" style="width:50px; text-align:center; background:#111; color:#fff; border:1px solid #444; border-radius:3px; padding:2px;">
                            </div>
                            <div style="border-bottom:1px dashed #444; margin-bottom:12px;"></div>

                            <label class="pmh-check-label" style="display:flex; align-items:center; gap:8px; margin-bottom:8px;" title="매칭 시도 전 새로고침(Refresh)으로 자동 매칭을 우선 유도합니다. (Plex 기본 에이전트 전용)">
                                <input type="checkbox" id="pmh-set-match-refresh" style="width:14px; height:14px;" ${ClientSettings.matchTryRefreshFirst ? 'checked' : ''}>
                                <span style="color:#ddd;">매칭 시 리프레시 우선 시도 <span style="color:#777; font-size:11px;">(Plex 기본 에이전트 전용)</span></span>
                            </label>

                            <label class="pmh-check-label" style="display:flex; align-items:center; gap:8px; margin-bottom:8px;" title="이 옵션을 켜면 Plex의 '수동 매칭(manual=1)' 모드를 사용하여 모든 사이트를 동시 검색합니다. (사이트 IP 밴 주의!)">
                                <input type="checkbox" id="pmh-set-manual-match" style="width:14px; height:14px;" ${ClientSettings.manualMatch ? 'checked' : ''}>
                                <span style="color:#ddd;">수동 매칭 모드 사용 (모든 사이트 강제 검색) <span style="color:#777; font-size:11px;">(사이트 차단 주의)</span></span>
                            </label>

                            <label class="pmh-check-label" style="display:flex; align-items:center; gap:8px; margin-bottom:8px;" title="매칭 시도 전 대상 항목을 명시적으로 언매칭(Unmatch) 처리합니다.">
                                <input type="checkbox" id="pmh-set-match-unmatch" style="width:14px; height:14px;" ${ClientSettings.matchDoUnmatchFirst ? 'checked' : ''}>
                                <span style="color:#ddd;">매칭 전 언매칭 우선 실행</span>
                            </label>

                            <label class="pmh-check-label" style="display:flex; align-items:center; gap:8px; margin-bottom:8px;" title="Plex 기본 에이전트 사용 시, 텍스트/연도 검증을 무시하고 첫 번째 결과를 무조건 수용합니다.">
                                <input type="checkbox" id="pmh-set-match-skip-sim" style="width:14px; height:14px;" ${ClientSettings.matchSkipSimCheck ? 'checked' : ''}>
                                <span style="color:#ddd;">매칭시 제목/연도 검증 스킵 <span style="color:#777; font-size:11px;">(Plex 기본 에이전트 전용)</span></span>
                            </label>
                        </div>

                        <div class="pmh-form-group" style="margin: 20px 0; border: 1px solid rgba(47, 150, 180, 0.4); padding: 10px; border-radius: 4px;">
                            <label class="pmh-check-label" style="color:#2f96b4; font-weight:bold; cursor:pointer; display:flex; align-items:center; gap:8px;" title="깃허브 대신 무조건 로컬 서버에서 UI Core JS/CSS를 불러오며 캐시를 사용하지 않습니다.">
                                <input type="checkbox" id="pmh-set-dev-mode" style="width:16px; height:16px; cursor:pointer;" ${ClientSettings.devMode ? 'checked' : ''}>
                                <i class="fas fa-laptop-code"></i> 프론트엔드 개발 모드 (Local Assets Only)
                            </label>
                        </div>

                        <div class="pmh-form-header" style="display:flex; margin-top:30px; justify-content:space-between; align-items:center;">
                            <span><i class="fas fa-file-code"></i> 서버 구성 파일 (pmh_config.yaml) 편집</span>
                        </div>
                        <div style="background:rgba(0,0,0,0.2); padding:10px; border:1px solid #333; border-radius:4px; margin-bottom:20px; display:flex; flex-direction:column; flex-grow:1; min-height:400px;">
                            <div style="display:flex; gap:10px; margin-bottom:10px; flex-shrink:0;">
                                <select id="pmh-yaml-server-select" class="pmh-input-select" style="flex:1;">
                                    ${ServerConfig.SERVERS.map(s => `<option value="${s.id}">${s.name || s.id}</option>`).join('')}
                                </select>
                                <button id="pmh-btn-load-yaml" style="background:#2f96b4; color:#fff; border:none; border-radius:4px; padding:6px 15px; cursor:pointer;"><i class="fas fa-download"></i> 불러오기</button>
                                <button id="pmh-btn-save-yaml" style="background:#e5a00d; color:#1f1f1f; border:none; border-radius:4px; padding:6px 15px; cursor:pointer; font-weight:bold;"><i class="fas fa-save"></i> 저장 및 반영</button>
                            </div>
                            
                            <div class="pmh-yaml-container">
                                <textarea id="pmh-yaml-editor" spellcheck="false" placeholder="서버를 선택하고 '불러오기' 버튼을 누르세요."></textarea>
                            </div>
                        </div>
                    </div>

                    <div style="padding: 15px; background: #111; border-top: 1px solid #333; border-radius: 0 0 8px 8px; display: flex; justify-content: space-between; align-items: center;">
                        <button id="pmh-settings-factory-reset" style="padding: 8px 15px; background: #bd362f; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;" title="저장된 모든 PMH 프론트엔드 데이터를 삭제합니다."><i class="fas fa-trash-alt"></i> 공장 초기화</button>
                        <div>
                            <button id="pmh-settings-test" style="padding: 8px 15px; background: #2f96b4; color: #fff; border: none; border-radius: 4px; cursor: pointer; margin-right: 8px;"><i class="fas fa-plug"></i> 연결 테스트</button>
                            <button id="pmh-settings-save" style="padding: 8px 20px; background: #51a351; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-weight:bold;"><i class="fas fa-save"></i> 저장 및 재시작</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);
        document.getElementById('pmh-settings-close').onclick = () => document.getElementById('pmh-client-settings-modal').remove();

        document.getElementById('pmh-settings-copy-key').onclick = (e) => {
            e.preventDefault();
            const keyInput = document.getElementById('pmh-set-api-key');
            if (!keyInput.value) { toastr.warning("복사할 API Key가 없습니다."); return; }

            if (navigator.clipboard && window.isSecureContext) {
                navigator.clipboard.writeText(keyInput.value).then(() => { toastr.success("API Key가 클립보드에 복사되었습니다!"); })
                .catch(err => { toastr.error("복사 실패. 브라우저 권한을 확인하세요."); });
            } else {
                keyInput.type = "text"; keyInput.select();
                try { document.execCommand("copy"); toastr.success("API Key가 클립보드에 복사되었습니다!"); } 
                catch (err) { toastr.error("복사 실패. 수동으로 복사해주세요."); }
                keyInput.type = "password"; window.getSelection().removeAllRanges();
            }
        };

        document.getElementById('pmh-btn-add-map').onclick = () => {
            const container = document.getElementById('pmh-path-mapping-container');
            const noMsg = container.querySelector('.pmh-no-map-msg');
            if (noMsg) noMsg.remove();

            container.insertAdjacentHTML('beforeend', `
                <div class="pmh-path-mapping-row" style="display:flex; gap:10px; margin-bottom:8px; align-items:center;">
                    <input type="text" class="pmh-input-text pmh-map-srv" placeholder="서버 경로" style="flex:1;">
                    <i class="fas fa-arrow-right" style="color:#777;"></i>
                    <input type="text" class="pmh-input-text pmh-map-loc" placeholder="로컬 경로" style="flex:1;">
                    <button class="pmh-btn-remove-row" style="background:#bd362f; color:#fff; border:none; border-radius:4px; padding:6px 10px; cursor:pointer;"><i class="fas fa-times"></i></button>
                </div>
            `);
        };

        document.getElementById('pmh-path-mapping-container').addEventListener('click', (e) => {
            const btn = e.target.closest('.pmh-btn-remove-row');
            if (btn) {
                const container = document.getElementById('pmh-path-mapping-container');
                btn.closest('.pmh-path-mapping-row').remove();
                if (container.querySelectorAll('.pmh-path-mapping-row').length === 0) {
                    container.innerHTML = '<div class="pmh-no-map-msg" style="color:#777; font-size:12px; text-align:center; padding:5px 0;">등록된 매핑이 없습니다.</div>';
                }
            }
        });

        const yamlEditor = document.getElementById('pmh-yaml-editor');
        const btnLoadYaml = document.getElementById('pmh-btn-load-yaml');
        const btnSaveYaml = document.getElementById('pmh-btn-save-yaml');
        const yamlServerSelect = document.getElementById('pmh-yaml-server-select');

        yamlEditor.addEventListener('keydown', function(e) {
            if (e.key === 'Tab') {
                e.preventDefault();
                const start = this.selectionStart;
                const end = this.selectionEnd;
                this.value = this.value.substring(0, start) + "    " + this.value.substring(end);
                this.selectionStart = this.selectionEnd = start + 4;
            }
        });

        btnLoadYaml.onclick = async () => {
            const serverId = yamlServerSelect.value;
            const originalHtml = btnLoadYaml.innerHTML;
            btnLoadYaml.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
            btnLoadYaml.disabled = true;

            try {
                const srv = ServerConfig.SERVERS.find(s => s.id === serverId);
                const res = await makeRequest(`${srv.relayUrl}/admin/config`, 'GET', null, ClientSettings.masterApiKey);
                yamlEditor.value = res.yaml;
                toastr.success(`${srv.name || serverId}의 설정 파일을 성공적으로 불러왔습니다.`);
            } catch (err) {
                toastr.error(`불러오기 실패: ${err.message}`);
                yamlEditor.value = "";
            } finally {
                btnLoadYaml.innerHTML = originalHtml;
                btnLoadYaml.disabled = false;
            }
        };

        btnSaveYaml.onclick = async () => {
            const serverId = yamlServerSelect.value;
            const yamlContent = yamlEditor.value.trim();
            if (!yamlContent) return toastr.warning("저장할 내용이 없습니다.");

            if (!confirm(`주의: YAML 문법이 잘못되면 해당 서버의 구동이 정지될 수 있습니다.\n\n정말로 [${yamlServerSelect.options[yamlServerSelect.selectedIndex].text}] 서버의 설정 파일을 덮어쓰고 즉시 코어를 리로드 하시겠습니까?`)) {
                return;
            }

            const originalHtml = btnSaveYaml.innerHTML;
            btnSaveYaml.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 적용 중...';
            btnSaveYaml.disabled = true;

            try {
                const srv = ServerConfig.SERVERS.find(s => s.id === serverId);
                
                await makeRequest(`${srv.relayUrl}/admin/config`, 'POST', { yaml: yamlContent }, ClientSettings.masterApiKey);
                toastr.success("파일 저장 완료. 코어를 리로드합니다...", "저장 성공", {timeOut: 2000});

                setTimeout(async () => {
                    try {
                        await makeRequest(`${srv.relayUrl}/admin/reload_core`, 'POST', null, ClientSettings.masterApiKey);
                        toastr.success("변경된 설정이 코어에 정상적으로 반영되었습니다!", "리로드 성공");
                    } catch (reloadErr) {
                        toastr.error(`코어 리로드 실패: ${reloadErr.message}<br>서버를 수동으로 재시작해야 할 수 있습니다.`, "리로드 실패", {timeOut: 8000});
                    } finally {
                        btnSaveYaml.innerHTML = originalHtml;
                        btnSaveYaml.disabled = false;
                    }
                }, 1000);

            } catch (err) {
                toastr.error(err.message.replace(/\n/g, '<br>'), "저장 실패", {timeOut: 10000});
                btnSaveYaml.innerHTML = originalHtml;
                btnSaveYaml.disabled = false;
            }
        };

        document.getElementById('pmh-settings-test').onclick = async () => {
            const url = document.getElementById('pmh-set-master-url').value.trim().replace(/\/$/, '');
            const key = document.getElementById('pmh-set-api-key').value.trim();
            if(!url || !key) return toastr.warning("URL과 API Key를 입력하세요.");

            const btn = document.getElementById('pmh-settings-test');
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 확인 중...';
            const secureToken = await generateSecureHeader(key);

            GM_xmlhttpRequest({
                method: "GET", url: `${url}/api/ping`, headers: { "X-PMH-Signature": secureToken }, timeout: 5000,
                onload: (r) => {
                    btn.innerHTML = '<i class="fas fa-plug"></i> 연결 테스트';
                    if(r.status === 200) toastr.success("마스터 서버 연결 성공!");
                    else toastr.error(`연결 실패 (HTTP ${r.status})`);
                },
                onerror: () => { btn.innerHTML = '<i class="fas fa-plug"></i> 연결 테스트'; toastr.error("네트워크 오류"); }
            });
        };

        document.getElementById('pmh-settings-save').onclick = () => {
            const newMaps = [];
            document.querySelectorAll('.pmh-path-mapping-row').forEach(row => {
                const s = row.querySelector('.pmh-map-srv').value.trim();
                const l = row.querySelector('.pmh-map-loc').value.trim();
                if(s && l) newMaps.push({serverPrefix: s, localPrefix: l});
            });

            ClientSettings = {
                masterUrl: document.getElementById('pmh-set-master-url').value.trim().replace(/\/$/, ''),
                masterApiKey: document.getElementById('pmh-set-api-key').value.trim(),
                logLevel: document.getElementById('pmh-set-log-level').value,
                maxCacheSize: parseInt(document.getElementById('pmh-set-cache-size').value, 10) || 5000,
                devMode: document.getElementById('pmh-set-dev-mode').checked,
                pathMappings: newMaps,
                matchTryRefreshFirst: document.getElementById('pmh-set-match-refresh').checked,
                manualMatch: document.getElementById('pmh-set-manual-match').checked,
                matchDoUnmatchFirst: document.getElementById('pmh-set-match-unmatch').checked,
                matchSkipSimCheck: document.getElementById('pmh-set-match-skip-sim').checked,
                useCustomScore: document.getElementById('pmh-set-use-custom-score').checked,
                customAgentScore: parseInt(document.getElementById('pmh-set-custom-score').value, 10) || 80
            };

            GM_setValue(CLIENT_SETTINGS_KEY, ClientSettings);
            toastr.success("클라이언트 설정이 저장되었습니다. 페이지를 새로고침합니다.");
            setTimeout(() => location.reload(), 500);
        };

        document.getElementById('pmh-settings-factory-reset').onclick = () => {
            if (confirm("⚠️ 경고: 정말로 공장 초기화를 진행하시겠습니까?\n\n이 작업은 캐시, 설정, 패널 위치 정보 등 PMH가 브라우저에 저장한 모든 데이터를 영구적으로 삭제합니다.\n(Plex 서버나 백엔드 데이터는 삭제되지 않습니다.)")) {

                const btn = document.getElementById('pmh-settings-factory-reset');
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 초기화 중...';
                btn.disabled = true;

                try {
                    const allKeys = GM_listValues();
                    let deletedCount = 0;

                    allKeys.forEach(key => {
                        if (key.startsWith('pmh') || key.startsWith('pmhc_')) {
                            GM_deleteValue(key);
                            deletedCount++;
                        }
                    });

                    log(`[Factory Reset] 💥 ${deletedCount}개의 로컬 스토리지/캐시 키가 영구 삭제되었습니다.`);
                    toastr.success(`총 ${deletedCount}개의 캐시 및 설정 데이터가 초기화되었습니다.<br>새로고침합니다.`);

                    setTimeout(() => location.reload(), 1500);

                } catch (e) {
                    errorLog("[Factory Reset Error]", e);
                    toastr.error("초기화 중 오류가 발생했습니다.");
                    btn.innerHTML = '<i class="fas fa-trash-alt"></i> 공장 초기화';
                    btn.disabled = false;
                }
            }
        };
    }

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
            errorLog("[Match Modal] 처리 중 오류:", e);
        } finally {
            isProcessingMatchModal = false;
        }
    }

    async function bootstrapPMH() {
        if (!ClientSettings.masterUrl || !ClientSettings.masterApiKey) {
            console.warn("[PMH] 마스터 서버 정보가 없습니다. 설정 창을 엽니다.");
            injectControlUI();
            openClientSettingsModal();
            return;
        }

        try {
            console.log(`[PMH Boot] 마스터 서버(${ClientSettings.masterUrl})에 접속하여 설정을 동기화합니다...`);
            const secureToken = await generateSecureHeader(ClientSettings.masterApiKey);

            const res = await new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: "GET", url: `${ClientSettings.masterUrl}/api/client/config`,
                    headers: { "X-PMH-Signature": secureToken },
                    timeout: 8000,
                    onload: r => {
                        if (r.status === 200) resolve(JSON.parse(r.responseText));
                        else if (r.status === 426) {
                            toastr.error("서버 스크립트가 업데이트되었습니다.<br><b>반드시 서버(컨테이너)를 수동으로 껐다 켜주세요!</b><br>재시작 전까지 툴 사용이 제한됩니다.", "서버 재시작 필수!", {timeOut: 15000});
                            reject("SERVER_RESTART_REQUIRED");
                        }
                        else reject(`HTTP ${r.status}`);
                    },
                    onerror: () => reject("Network Error"),
                    ontimeout: () => reject("Timeout")
                });
            });

            ServerConfig.AUTO_UPDATE_CHECK = res.AUTO_UPDATE_CHECK !== false;
            ServerConfig.USER_TAGS = res.USER_TAGS || {};
            ServerConfig.DISPLAY_PATH_PREFIXES_TO_REMOVE = res.DISPLAY_PATH_PREFIXES_TO_REMOVE || [];
            ServerConfig.SERVERS = (res.SERVERS || []).map(srv => {
                return {
                    id: srv.id, name: srv.name, machineIdentifier: srv.machine_id,
                    relayUrl: `${ClientSettings.masterUrl}/api/relay/${srv.id}`
                };
            });

            let cachedCss = "";
            let cachedJs = "";

            if (ClientSettings.devMode) {
                infoLog(`[PMH Boot] 🛠️ DEV_MODE 켜짐! 로컬 서버에서 최신 UI Core 소스를 직접 가져옵니다...`);
                const LOCAL_UI_CSS = `${ClientSettings.masterUrl}/api/client/pmh_ui_core.css?t=${Date.now()}`;
                const LOCAL_UI_JS = `${ClientSettings.masterUrl}/api/client/pmh_ui_core.js?t=${Date.now()}`;

                cachedCss = await new Promise((resolve, reject) => {
                    GM_xmlhttpRequest({
                        method: "GET", url: LOCAL_UI_CSS, timeout: 5000,
                        onload: (r) => r.status === 200 ? resolve(r.responseText) : reject(`Dev CSS 로드 실패 (${r.status})`),
                        onerror: () => reject("Dev CSS 서버 접근 불가"), ontimeout: () => reject("Dev CSS 응답 지연")
                    });
                });

                cachedJs = await new Promise((resolve, reject) => {
                    GM_xmlhttpRequest({
                        method: "GET", url: LOCAL_UI_JS, timeout: 5000,
                        onload: (r) => r.status === 200 ? resolve(r.responseText) : reject(`Dev JS 로드 실패 (${r.status})`),
                        onerror: () => reject("Dev JS 서버 접근 불가"), ontimeout: () => reject("Dev JS 응답 지연")
                    });
                });

            } else {
                const GITHUB_UI_CSS = "https://raw.githubusercontent.com/golmog/plex_meta_helper/main/pmh_ui_core.css";
                const GITHUB_UI_JS = "https://raw.githubusercontent.com/golmog/plex_meta_helper/main/pmh_ui_core.js";

                const latestVer = GM_getValue('pmh_latest_version', CURRENT_VERSION);
                const savedVer = GM_getValue('pmh_ui_cache_version', '');

                cachedCss = GM_getValue('pmh_ui_core_css_cache', null);
                cachedJs = GM_getValue('pmh_ui_core_js_cache', null);

                if (!cachedCss || !cachedJs || savedVer !== latestVer) {
                    infoLog(`[PMH Boot] UI Core 캐시 없음 또는 버전 변경(${savedVer} -> ${latestVer}). GitHub에서 새로 다운로드합니다...`);

                    cachedCss = await new Promise((resolve, reject) => {
                        GM_xmlhttpRequest({
                            method: "GET", url: `${GITHUB_UI_CSS}?t=${Date.now()}`, timeout: 10000,
                            onload: (r) => r.status === 200 ? resolve(r.responseText) : reject(`CSS 로드 실패 (${r.status})`),
                            onerror: () => reject("CSS 네트워크 오류"), ontimeout: () => reject("CSS 시간 초과")
                        });
                    });

                    cachedJs = await new Promise((resolve, reject) => {
                        GM_xmlhttpRequest({
                            method: "GET", url: `${GITHUB_UI_JS}?t=${Date.now()}`, timeout: 10000,
                            onload: (r) => r.status === 200 ? resolve(r.responseText) : reject(`JS 로드 실패 (${r.status})`),
                            onerror: () => reject("JS 네트워크 오류"), ontimeout: () => reject("JS 시간 초과")
                        });
                    });

                    GM_setValue('pmh_ui_core_css_cache', cachedCss);
                    GM_setValue('pmh_ui_core_js_cache', cachedJs);
                    GM_setValue('pmh_ui_cache_version', latestVer);
                    infoLog(`[PMH Boot] UI Core (v${latestVer}) 로컬 캐시 저장 완료!`);
                } else {
                    infoLog(`[PMH Boot] ⚡ 네트워크 연결 생략: 로컬에 캐시된 UI Core (v${savedVer})를 즉시 렌더링합니다!`);
                }
            }

            let styleEl = document.getElementById('pmh-shared-css-inline');
            if (styleEl) styleEl.remove();
            styleEl = document.createElement('style');
            styleEl.id = 'pmh-shared-css-inline';
            styleEl.textContent = cachedCss;
            document.head.appendChild(styleEl);

            if (typeof window.PmhUICore === 'undefined') {
                await new Promise((resolve, reject) => {
                    try {
                        const oldScript = document.getElementById('pmh-shared-js-inline');
                        if (oldScript) oldScript.remove();

                        const blob = new Blob([cachedJs], { type: 'application/javascript' });
                        const blobUrl = URL.createObjectURL(blob);

                        const scriptEl = document.createElement('script');
                        scriptEl.id = 'pmh-shared-js-inline';
                        scriptEl.src = blobUrl;

                        scriptEl.onload = () => {
                            URL.revokeObjectURL(blobUrl);
                            infoLog("[PMH Boot] UI Core JS Blob Injection 및 메모리 적재 완료!");
                            resolve();
                        };
                        scriptEl.onerror = () => {
                            URL.revokeObjectURL(blobUrl);
                            reject("Blob 스크립트 실행 실패");
                        };

                        document.body.appendChild(scriptEl);
                    } catch (err) {
                        reject(`Blob 주입 에러: ${err.message}`);
                    }
                });
            }

            infoLog(`[PMH Boot] 설정 동기화 및 UI 코어 로드 완료! (노드 수: ${ServerConfig.SERVERS.length})`);

            if (!ClientSettings.devMode) {
                checkUpdate();
            }
            observer.observe(document.body, { childList: true, subtree: true });
            checkUrlChange(true);

            setTimeout(async () => {
                if (!ServerConfig.SERVERS || ServerConfig.SERVERS.length === 0) return;
                try {
                    const secureToken = await generateSecureHeader(ClientSettings.masterApiKey);
                    let needsSave = false;

                    window._pmh_media_queues = window._pmh_media_queues || {};
                    for (const srv of ServerConfig.SERVERS) {
                        try {
                            const activeRes = await new Promise((resolve, reject) => {
                                GM_xmlhttpRequest({
                                    method: 'GET',
                                    url: `${srv.relayUrl}/media/active_queues`,
                                    headers: { 'X-PMH-Signature': secureToken },
                                    timeout: 5000,
                                    onload: r => r.status === 200 ? resolve(JSON.parse(r.responseText)) : reject(),
                                    onerror: () => reject(), ontimeout: () => reject()
                                });
                            });

                            if (activeRes && Object.keys(activeRes).length > 0) {
                                for (const [taskId, status] of Object.entries(activeRes)) {
                                    const parts = taskId.split('_');
                                    if (parts.length >= 3) {
                                        const itemId = parts[1];
                                        
                                        window._pmh_media_queues[itemId] = {
                                            task_id: taskId,
                                            start_time: status.timestamp ? status.timestamp * 1000 : Date.now(),
                                            state: status.state,
                                            title: "서버 동기화 항목",
                                            server_id: srv.machineIdentifier
                                        };
                                        needsSave = true;
                                        infoLog(`[Sync] 서버 동기화 성공: 아이템 ${itemId} 추적 복구 완료 (${status.state})`);
                                        
                                        const markers = document.querySelectorAll(`.pmh-render-marker[data-iid="${itemId}"]`);
                                        markers.forEach(m => {
                                            const cont = m.closest('div[data-testid^="cellItem"], div[class*="ListItem-container"], div[class*="MetadataPosterCard-container"], tr[class*="TableRow-"]');
                                            const gBox = cont ? cont.querySelector('.plex-guid-list-box') : null;
                                            if (gBox) {
                                                if (status.state === 'queued') {
                                                    gBox.innerHTML = `<i class="fas fa-clock" style="margin-right:4px;"></i>대기중...`;
                                                    gBox.style.color = '#e5a00d';
                                                } else if (status.state === 'processing') {
                                                    gBox.innerHTML = `<i class="fas fa-spinner fa-spin" style="margin-right:4px;"></i>처리중...`;
                                                    gBox.style.color = '#2f96b4';
                                                }
                                                gBox.dataset.refreshing = 'true';
                                            }
                                        });
                                    }
                                }

                                if (typeof window.startQueuePolling === 'function') {
                                    window.startQueuePolling(srv.machineIdentifier);
                                }
                            }

                            for (const [id, qInfo] of Object.entries(window._pmh_media_queues)) {
                                if (qInfo.server_id === srv.machineIdentifier) {
                                    if (!activeRes || !activeRes[qInfo.task_id]) {
                                        delete window._pmh_media_queues[id];
                                        needsSave = true;
                                    }
                                }
                            }
                        } catch (err) {
                            console.warn(`[Sync] 큐 상태 복구 실패 (Server: ${srv.name}). 서버 오프라인 의심.`);
                        }
                    }

                    if (needsSave && typeof window.saveQueueState === 'function') {
                        window.saveQueueState();
                    }
                } catch (e) {
                    console.error("[Sync Error] 서버 동기화 중 오류:", e);
                }
            }, 3000);

            const closeBtn = document.getElementById('pmh-panel-close');
            if(closeBtn) {
                closeBtn.addEventListener('click', () => {
                    if(window.PmhUICore && window.PmhUICore.destroyActiveInstance) {
                        window.PmhUICore.destroyActiveInstance();
                    }
                });
            }

            const lastTool = GM_getValue('pmh_last_open_tool', '');
            if (lastTool && ServerConfig.SERVERS.length > 0) {
                window._pmh_is_minimized = GM_getValue('pmh_last_minimize_state', false);

                let checkUiCount = 0;
                const checkUiReady = setInterval(() => {
                    if (typeof window.showPmhToolPanel === 'function') {
                        clearInterval(checkUiReady);
                        openPmhToolUI(lastTool);
                    } else {
                        checkUiCount++;
                        if (checkUiCount > 30) {
                            clearInterval(checkUiReady);
                            errorLog("[PMH Boot] 마지막 실행 툴 복구 실패 (UI 초기화 시간 초과)");
                        }
                    }
                }, 100);
            }

        } catch (e) {
            errorLog("[PMH Boot Error]", e);
            injectControlUI();

            if (e !== "SERVER_RESTART_REQUIRED") {
                toastr.error("서버와 통신할 수 없거나 구버전 서버입니다.<br>상단 메뉴에서 서버를 업데이트(재시작) 하거나 설정을 확인하세요.", "PMH 부팅 실패", {timeOut: 8000});
                checkUpdate();
            }

            observer.observe(document.body, { childList: true, subtree: true });
            checkUrlChange(true);
        }
    }

    window.addEventListener('load', () => {
        injectControlUI();
        bootstrapPMH();
    });

})();
