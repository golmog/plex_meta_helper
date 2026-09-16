// ==UserScript==
// @name         Plex Meta Helper
// @namespace    https://tampermonkey.net/
// @version      0.9.123
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
    #toast-container { position: fixed; z-index: 999999999; pointer-events: none; }
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

    #pmh-tool-dropdown { position: absolute; background-color: rgba(25, 28, 32, 0.98); border: 1px solid #444; border-radius: 6px; min-width: 280px; max-width: 450px; z-index: 9999999; box-shadow: 0 8px 20px rgba(0,0,0,0.7); display: none; backdrop-filter: blur(5px); }
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

    /* 5. 클라이언트 전역 설정(모달) CSS 자립형 요소 */
    .pmh-form-group { margin-bottom: 15px; text-align: left; }
    .pmh-form-label { display: block; color: #e5a00d; font-size: 12px; margin-bottom: 6px; font-weight: bold; text-align: left; }
    .pmh-form-header { margin-top: 20px; margin-bottom: 12px; font-size: 14px; font-weight: bold; color: #2f96b4; border-bottom: 1px solid #333; padding-bottom: 6px; text-align: left; }
    .pmh-input-text { width: 100%; padding: 8px; background: #111; border: 1px solid #444; color: #fff; border-radius: 4px; font-size: 13px; transition: border-color 0.2s; box-sizing: border-box; text-align: left; }
    .pmh-input-text:focus { outline: none; border-color: #e5a00d; }
    .pmh-input-select { width: 100%; padding: 8px; background: #111; border: 1px solid #444; color: #fff; border-radius: 4px; font-size: 13px; cursor: pointer; box-sizing: border-box; text-align: left; }
    .pmh-path-mapping-row { display: flex; gap: 10px; margin-bottom: 8px; align-items: center; }
    .pmh-btn-remove-row { background: #bd362f; color: #fff; border: none; border-radius: 4px; padding: 6px 10px; cursor: pointer; }

    /* YAML 에디터 & 모달 리사이징 CSS */
    #pmh-client-settings-modal .pmh-modal-content { resize: both; overflow: hidden; min-width: 500px; min-height: 400px; }
    .pmh-yaml-container { width: 100%; background: #1e1e1e; border: 1px solid #444; border-radius: 4px; display: flex; flex-direction: column; flex-grow: 1; min-height: 300px; }
    .pmh-yaml-container textarea { flex-grow: 1; margin: 0; padding: 15px; border: none; outline: none; background: transparent; color: #a6e22e; font-family: Consolas, Monaco, "Courier New", monospace; font-size: 13px; line-height: 1.5; tab-size: 2; white-space: pre; word-wrap: normal; resize: none; width: 100%; height: 100%; box-sizing: border-box; overflow: auto; }

    /* 인터랙티브 컨텍스트 메뉴 */
    #pmh-action-menu { position: fixed; background-color: rgba(20, 23, 26, 0.98); border-radius: 6px; z-index: 9999999; opacity: 0; visibility: hidden; transition: opacity 0.1s ease-in-out; display: flex; flex-direction: column; min-width: 130px; background-clip: padding-box; border: 4px solid transparent; box-shadow: inset 0 0 0 1px #e5a00d, 0 4px 15px rgba(0,0,0,0.8); padding: 0; backdrop-filter: blur(5px); user-select: none; overflow: hidden; }
    .pmh-menu-item { padding: 6px 10px; cursor: pointer; font-size: 11px; color: #eee; transition: background-color 0.15s; display: flex; align-items: center; gap: 8px; white-space: nowrap; }
    .pmh-menu-item:hover { background-color: rgba(255,255,255,0.1); }
    .pmh-menu-icon-wrap { display: flex; align-items: center; justify-content: center; width: 16px; height: 16px; flex-shrink: 0; }
    .pmh-force-hover { color: #f0ad4e !important; text-decoration: underline !important; text-shadow: 0 0 2px rgba(255,255,255,0.5); }

    /* 포스터 크롭 에디터 모달 */
    #pmh-crop-modal {
        position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
        background: rgba(0, 0, 0, 0.85); z-index: 10000002;
        display: none; justify-content: center; align-items: center;
        backdrop-filter: blur(8px); user-select: none;
    }
    .pmh-crop-card {
        background: #14171a; border: 1px solid #e5a00d; border-radius: 8px;
        width: 880px; max-width: 95vw; max-height: 94vh;
        display: flex; flex-direction: column; box-shadow: 0 10px 40px rgba(0,0,0,0.9);
        overflow: hidden; box-sizing: border-box;
    }
    .pmh-crop-header {
        padding: 10px 15px; background: #0a0a0c; border-bottom: 1px solid #333;
        display: flex; justify-content: space-between; align-items: center; flex-shrink: 0;
    }
    .pmh-crop-toolbar {
        display: flex; justify-content: space-between; align-items: center;
        padding: 8px 12px; background: #1a1d21; border-bottom: 1px solid #2a2d32;
        gap: 8px; flex-wrap: nowrap; flex-shrink: 0; overflow-x: auto;
    }
    .pmh-crop-btn {
        height: 28px !important; min-height: 28px !important; line-height: 26px !important;
        padding: 0 10px !important; font-size: 11.5px !important; font-weight: bold !important;
        border-radius: 4px !important; cursor: pointer !important; border: 1px solid #444 !important;
        background: #222 !important; color: #ccc !important; transition: all 0.2s !important;
        display: inline-flex !important; align-items: center !important; justify-content: center !important;
        gap: 5px !important; white-space: nowrap !important; box-sizing: border-box !important;
        margin: 0 !important; text-decoration: none !important; flex-shrink: 0 !important;
    }
    .pmh-crop-btn:hover { background: #333 !important; color: #fff !important; border-color: #666 !important; }
    .pmh-crop-btn-active { background: #e5a00d !important; color: #111 !important; border-color: #e5a00d !important; font-weight: bold !important; }
    .pmh-crop-btn-primary { background: #2f96b4 !important; color: #fff !important; border-color: #2f96b4 !important; }
    .pmh-crop-btn-primary:hover { background: #257991 !important; color: #fff !important; }
    .pmh-crop-btn-success { background: #51a351 !important; color: #fff !important; border-color: #51a351 !important; }
    .pmh-crop-btn-success:hover { background: #418541 !important; color: #fff !important; }

    .pmh-crop-view {
        width: 100%; height: 500px; max-height: 58vh; background: #050505;
        display: flex; justify-content: center; align-items: center;
        position: relative; overflow: hidden; flex-grow: 1; min-height: 250px;
    }
    .pmh-crop-footer {
        padding: 10px 15px; background: #0a0a0c; border-top: 1px solid #333;
        display: flex; justify-content: space-between; align-items: center; flex-shrink: 0;
    }

    /* PMH 상단 다중 선택 단일 트리거 버튼 */
    .pmh-multiselect-trigger-btn {
        height: 28px !important; min-height: 28px !important; line-height: 26px !important;
        padding: 0 10px !important; font-size: 11.5px !important; font-weight: bold !important;
        border-radius: 4px !important; cursor: pointer !important;
        border: 1px solid #444 !important; background: rgba(0, 0, 0, 0.4) !important; color: #eee !important;
        display: inline-flex !important; align-items: center !important; gap: 5px !important;
        margin: 0 8px !important; white-space: nowrap !important; transition: all 0.2s ease !important;
        user-select: none !important; text-decoration: none !important;
    }
    .pmh-multiselect-trigger-btn * {
        pointer-events: none !important;
    }
    .pmh-multiselect-trigger-btn:hover, .pmh-multiselect-trigger-btn.pmh-force-hover {
        background: rgba(255, 255, 255, 0.1) !important;
        border-color: #e5a00d !important;
        color: #fff !important;
    }

    /* PMH DB 편집 모달 공통 레이아웃 */
    .pmh-db-modal {
        position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
        background: rgba(0, 0, 0, 0.75); z-index: 10000001;
        display: none; justify-content: center; align-items: center;
        backdrop-filter: blur(5px); user-select: none;
    }
    .pmh-db-card {
        background: #14171a; border: 1px solid #e5a00d; border-radius: 8px;
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.9); display: flex; flex-direction: column;
        box-sizing: border-box; overflow: hidden; outline: none;
    }
    .pmh-db-header {
        background: rgba(0, 0, 0, 0.85); padding: 10px 15px; border-bottom: 1px solid #333;
        display: flex; justify-content: space-between; align-items: center; flex-shrink: 0; cursor: move;
    }
    .pmh-db-body {
        padding: 15px; overflow-y: auto; flex-grow: 1; min-height: 0;
        color: #ddd; font-size: 13px; line-height: 1.5; text-align: left;
    }
    .pmh-db-footer {
        background: rgba(0, 0, 0, 0.85); padding: 8px 15px; border-top: 1px solid #333;
        display: flex; justify-content: space-between; align-items: center; flex-shrink: 0;
    }
    .pmh-db-badge {
        display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px;
        border-radius: 4px; font-size: 11px; font-weight: bold; background: #222;
        border: 1px solid #444; color: #ccc; cursor: pointer; transition: all 0.2s;
    }
    .pmh-db-badge:hover { border-color: #e5a00d; color: #fff; transform: scale(1.03); }
    .pmh-db-badge-del { color: #bd362f; margin-left: 4px; cursor: pointer; }
    .pmh-db-badge-del:hover { color: #ff6b6b; }

    /* FontAwesome JS의 DOM 치환 간섭을 받지 않는 순수 CSS 라이트박스 스피너 */
    @keyframes pmhLightboxSpin {
        0% { transform: translate(-50%, -50%) rotate(0deg); }
        100% { transform: translate(-50%, -50%) rotate(360deg); }
    }
    .pmh-css-spinner {
        position: absolute;
        top: 50%;
        left: 50%;
        width: 48px;
        height: 48px;
        border: 5px solid rgba(229, 160, 13, 0.15);
        border-top: 5px solid #e5a00d;
        border-radius: 50%;
        animation: pmhLightboxSpin 0.75s linear infinite;
        z-index: 10;
        pointer-events: none;
        box-sizing: border-box;
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

    // =========================================================================
    // PMH 동영상 플레이어 모달 및 유틸리티
    // =========================================================================
    // 모달 속성(영상DB, 인물DB, 비디오재생) 자동 판별 기반 위치/크기 저장 헬퍼
    function saveCardGeometry(card) {
        if (!card) return;
        let key = '';

        if (card.classList.contains('pmh-card-meta_db')) {
            key = 'pmh_meta_db_modal_geo';
        } else if (card.classList.contains('pmh-card-person_db')) {
            key = 'pmh_person_db_modal_geo';
        } else if (card.classList.contains('pmh-card-video_player') || card.id === 'pmh-video-modal-card') {
            key = 'pmh_video_modal_geo';
        }

        if (!key) return;

        const geo = {
            top: card.offsetTop,
            left: card.offsetLeft,
            width: card.offsetWidth,
            height: card.offsetHeight
        };
        GM_setValue(key, JSON.stringify(geo));
    }

    // 모달 속성별(영상DB, 인물, 비디오재생) 고유 크기 및 위치 산출 헬퍼
    function getModalGeometry(category) {
        let key = '';
        let defW = 880, defH = 560;
        let minW = 420, minH = 300;

        if (category === 'meta_db') {
            key = 'pmh_meta_db_modal_geo';
            defW = Math.min(1040, window.innerWidth * 0.96);
            defH = Math.min(800, window.innerHeight * 0.94);
            minW = 600; minH = 400;
        } else if (category === 'person_db') {
            key = 'pmh_person_db_modal_geo';
            defW = Math.min(980, window.innerWidth * 0.95);
            defH = Math.min(780, window.innerHeight * 0.92);
            minW = 600; minH = 400;
        } else if (category === 'video_player') {
            key = 'pmh_video_modal_geo';
            defW = Math.min(880, window.innerWidth * 0.9);
            defH = Math.min(560, window.innerHeight * 0.85);
            minW = 420; minH = 300;
        }

        let defTop = Math.max(15, (window.innerHeight - defH) / 2);
        let defLeft = Math.max(15, (window.innerWidth - defW) / 2);

        const savedStr = key ? GM_getValue(key, '') : '';
        if (savedStr) {
            try {
                const geo = JSON.parse(savedStr);
                const w = parseInt(geo.width, 10);
                const h = parseInt(geo.height, 10);
                const t = parseInt(geo.top, 10);
                const l = parseInt(geo.left, 10);

                if (!isNaN(w) && w >= minW && w <= window.innerWidth) defW = w;
                if (!isNaN(h) && h >= minH && h <= window.innerHeight) defH = h;
                if (!isNaN(t) && t >= 0 && t <= window.innerHeight - 80) defTop = t;
                if (!isNaN(l) && l >= 0 && l <= window.innerWidth - 80) defLeft = l;
            } catch (e) {}
        }

        const sameTypeCards = document.querySelectorAll(`.pmh-card-${category}`);
        if (sameTypeCards.length > 0) {
            const lastSameCard = sameTypeCards[sameTypeCards.length - 1];
            defTop = Math.min(window.innerHeight - minH, lastSameCard.offsetTop + 25);
            defLeft = Math.min(window.innerWidth - minW, lastSameCard.offsetLeft + 25);
        }

        return { width: defW, height: defH, top: defTop, left: defLeft };
    }

    // 모달 헤더 드래그 이동 헬퍼
    function makeVideoCardDraggable(card, header) {
        header.style.cursor = 'move';
        let startX, startY, startLeft, startTop;

        header.onmousedown = (e) => {
            if (e.target.closest('button, a')) return;
            e.preventDefault();
            startX = e.clientX;
            startY = e.clientY;
            startLeft = card.offsetLeft;
            startTop = card.offsetTop;

            const onMouseMove = (moveEvent) => {
                const dx = moveEvent.clientX - startX;
                const dy = moveEvent.clientY - startY;

                let newLeft = startLeft + dx;
                let newTop = startTop + dy;

                const maxLeft = window.innerWidth - card.offsetWidth;
                const maxTop = window.innerHeight - card.offsetHeight;

                newLeft = Math.max(0, Math.min(newLeft, maxLeft));
                newTop = Math.max(0, Math.min(newTop, maxTop));

                card.style.left = `${newLeft}px`;
                card.style.top = `${newTop}px`;
                card.style.right = 'auto';
                card.style.bottom = 'auto';
            };

            const onMouseUp = () => {
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
                saveCardGeometry(card);
            };

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        };
    }

    // 모달 8방향 리사이즈 헬퍼
    function makeVideoCardResizable(card) {
        const isDbModal = card.classList.contains('pmh-card-meta_db') || card.classList.contains('pmh-card-person_db');
        const minW = isDbModal ? 600 : 420;
        const minH = isDbModal ? 400 : 300;
        let origW, origH, origX, origY, startX, startY, currentResizer;

        card.querySelectorAll('.pmh-resizer').forEach(resizer => {
            resizer.onmousedown = (e) => {
                e.preventDefault();
                e.stopPropagation();
                currentResizer = resizer;
                origW = card.offsetWidth;
                origH = card.offsetHeight;
                origX = card.offsetLeft;
                origY = card.offsetTop;
                startX = e.clientX;
                startY = e.clientY;

                const onMouseMove = (moveEvent) => {
                    const mouseX = Math.max(0, Math.min(moveEvent.clientX, window.innerWidth));
                    const mouseY = Math.max(0, Math.min(moveEvent.clientY, window.innerHeight));

                    if (currentResizer.classList.contains('pmh-resizer-e') || currentResizer.classList.contains('pmh-resizer-se') || currentResizer.classList.contains('pmh-resizer-ne')) {
                        const width = origW + (mouseX - startX);
                        if (width > minW) card.style.width = `${width}px`;
                    }
                    if (currentResizer.classList.contains('pmh-resizer-s') || currentResizer.classList.contains('pmh-resizer-se') || currentResizer.classList.contains('pmh-resizer-sw')) {
                        const height = origH + (mouseY - startY);
                        if (height > minH) card.style.height = `${height}px`;
                    }
                    if (currentResizer.classList.contains('pmh-resizer-w') || currentResizer.classList.contains('pmh-resizer-sw') || currentResizer.classList.contains('pmh-resizer-nw')) {
                        const width = origW - (mouseX - startX);
                        if (width > minW) {
                            card.style.width = `${width}px`;
                            card.style.left = `${origX + (mouseX - startX)}px`;
                        }
                    }
                    if (currentResizer.classList.contains('pmh-resizer-n') || currentResizer.classList.contains('pmh-resizer-ne') || currentResizer.classList.contains('pmh-resizer-nw')) {
                        const height = origH - (mouseY - startY);
                        if (height > minH) {
                            card.style.height = `${height}px`;
                            card.style.top = `${origY + (mouseY - startY)}px`;
                        }
                    }
                };

                const onMouseUp = () => {
                    document.removeEventListener('mousemove', onMouseMove);
                    document.removeEventListener('mouseup', onMouseUp);
                    saveCardGeometry(card);
                };

                document.addEventListener('mousemove', onMouseMove);
                document.addEventListener('mouseup', onMouseUp);
            };
        });
    }

    // 비디오 모달 팝업 본체
    function showVideoModal(videoUrl, title) {
        let m = document.getElementById('pmh-video-modal');
        if (m) {
            const oldV = m.querySelector('video');
            if (oldV) { oldV.pause(); oldV.removeAttribute('src'); oldV.load(); }
            m.remove();
        }

        m = document.createElement('div');
        m.id = 'pmh-video-modal';
        m.style.cssText = 'position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(0,0,0,0.7); z-index:99999999; backdrop-filter:blur(5px); user-select:none;';

        const geo = getModalGeometry('video_player');
        let defW = geo.width;
        let defH = geo.height;
        let defTop = geo.top;
        let defLeft = geo.left;

        m.innerHTML = `
            <div id="pmh-video-modal-card" class="pmh-card-video_player" tabindex="-1" style="position:fixed; top:${defTop}px; left:${defLeft}px; width:${defW}px; height:${defH}px; background:#111; border-radius:8px; border:1px solid #e5a00d; display:flex; flex-direction:column; box-shadow:0 10px 40px rgba(0,0,0,0.9); box-sizing:border-box; overflow:hidden; outline:none;">
                <!-- 8방향 리사이저 -->
                <div class="pmh-resizer pmh-resizer-n"></div><div class="pmh-resizer pmh-resizer-s"></div>
                <div class="pmh-resizer pmh-resizer-e"></div><div class="pmh-resizer pmh-resizer-w"></div>
                <div class="pmh-resizer pmh-resizer-ne"></div><div class="pmh-resizer pmh-resizer-nw"></div>
                <div class="pmh-resizer pmh-resizer-se"></div><div class="pmh-resizer pmh-resizer-sw"></div>

                <div id="pmh-video-modal-header" style="background:rgba(0,0,0,0.75); padding:10px 15px; border-bottom:1px solid #333; display:flex; justify-content:space-between; align-items:center; flex-shrink:0; cursor:move;">
                    <span id="pmh-video-modal-title" style="color:#e5a00d; font-weight:bold; font-size:13px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; padding-right:10px;"><i class="fas fa-film" style="margin-right:6px;"></i><span id="pmh-video-modal-title-text">${title || '예고편 / 프리뷰 재생'}</span></span>
                    <button type="button" id="pmh-video-modal-close" style="background:none; border:none; color:#aaa; font-size:18px; cursor:pointer; padding:2px 6px; transition:color 0.2s;" onmouseover="this.style.color='#fff'" onmouseout="this.style.color='#aaa'"><i class="fas fa-times"></i></button>
                </div>

                <div id="pmh-video-modal-body" style="flex-grow:1; min-height:0; display:flex; justify-content:center; align-items:center; background:#000; position:relative; overflow:hidden;">
                    <div id="pmh-video-modal-spinner" style="position:absolute; top:0; left:0; width:100%; height:100%; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:10px; color:#e5a00d; z-index:5; background:rgba(0,0,0,0.6);">
                        <i class="fas fa-spinner fa-spin" style="font-size:32px;"></i>
                        <span style="font-size:12px; color:#aaa;">Plex 스트림 주소 확인 중...</span>
                    </div>
                    <div id="pmh-video-modal-error" style="position:absolute; top:0; left:0; width:100%; height:100%; display:none; flex-direction:column; align-items:center; justify-content:center; color:#bd362f; font-size:13px; padding:20px; text-align:center; line-height:1.5; z-index:6; background:#000;"></div>
                    <video id="pmh-video-modal-player" controls autoplay playsinline style="width:100%; height:100%; object-fit:contain; outline:none; display:none;"></video>
                </div>

                <div style="background:rgba(0,0,0,0.75); padding:6px 15px; border-top:1px solid #333; display:flex; justify-content:space-between; align-items:center; font-size:11px; color:#777; flex-shrink:0;">
                    <span><i class="fas fa-arrows-alt" style="margin-right:4px;"></i>헤더 드래그 이동 | 테두리 크기 조절 | Space: 재생·일시정지 | ESC: 닫기</span>
                    <span style="color:#e5a00d;">PMH Trailer Player</span>
                </div>
            </div>
        `;
        document.body.appendChild(m);

        const card = m.querySelector('#pmh-video-modal-card');
        const header = m.querySelector('#pmh-video-modal-header');

        makeVideoCardDraggable(card, header);
        makeVideoCardResizable(card);

        // 개별 컨트롤러에서 포커스를 즉시 뺏어 모달 카드로 회수하는 헬퍼
        const blurPlayer = () => {
            if (player) player.blur();
            if (document.activeElement && document.activeElement !== card) {
                try { document.activeElement.blur(); } catch (e) {}
            }
            if (card) card.focus();
        };

        // 볼륨 설정 복원 (기본값 50% = 0.5)
        const player = m.querySelector('#pmh-video-modal-player');
        if (player) {
            const savedVol = GM_getValue('pmh_video_volume', 0.5);
            const savedMuted = GM_getValue('pmh_video_muted', false);

            player.volume = Math.max(0, Math.min(1, savedVol));
            player.muted = Boolean(savedMuted);

            player.onvolumechange = () => {
                GM_setValue('pmh_video_volume', player.volume);
                GM_setValue('pmh_video_muted', player.muted);
                blurPlayer();
            };

            player.onerror = () => {
                if (player.getAttribute('src')) {
                    setVideoModalError("동영상을 재생할 수 없습니다. (비디오 코덱 미지원 또는 스트림 연결 실패)");
                }
            };

            player.addEventListener('seeked', blurPlayer);
            player.addEventListener('play', () => setTimeout(blurPlayer, 50));
            player.addEventListener('pause', () => setTimeout(blurPlayer, 50));
            player.addEventListener('pointerup', () => setTimeout(blurPlayer, 50));
            player.addEventListener('mouseup', () => setTimeout(blurPlayer, 50));
            m.addEventListener('pointerup', () => setTimeout(blurPlayer, 50));
        }

        const closeModal = () => {
            document.removeEventListener('keydown', handleKeyDown, true);
            document.removeEventListener('keyup', handleKeyUp, true);
            if (player) { player.pause(); player.removeAttribute('src'); player.load(); }
            m.remove();
        };

        const handleKeyDown = (e) => {
            if (e.key === 'Escape' || e.keyCode === 27) {
                e.preventDefault();
                e.stopPropagation();
                closeModal();
            } else if (e.key === ' ' || e.keyCode === 32) {
                const tag = (document.activeElement && document.activeElement.tagName) ? document.activeElement.tagName.toLowerCase() : '';
                if (tag !== 'input' && tag !== 'textarea') {
                    e.preventDefault();
                    e.stopPropagation();
                    if (player) {
                        if (player.paused) player.play();
                        else player.pause();
                    }
                    blurPlayer();
                }
            }
        };

        const handleKeyUp = (e) => {
            if (e.key === ' ' || e.keyCode === 32) {
                const tag = (document.activeElement && document.activeElement.tagName) ? document.activeElement.tagName.toLowerCase() : '';
                if (tag !== 'input' && tag !== 'textarea') {
                    e.preventDefault();
                    e.stopPropagation();
                }
            }
        };

        document.addEventListener('keydown', handleKeyDown, true);
        document.addEventListener('keyup', handleKeyUp, true);

        m.addEventListener('mousedown', (e) => {
            if (e.target === m) closeModal();
        });

        const closeBtn = m.querySelector('#pmh-video-modal-close');
        if (closeBtn) closeBtn.onclick = closeModal;

        if (videoUrl) {
            setVideoModalSource(videoUrl, title);
        }

        setTimeout(blurPlayer, 100);
    }

    // 사이트 원본 미디어 URL을 노드의 FF_DDNS 기반 다이렉트 프록시 주소로 조합
    function getFfMediaProxyUrl(srvConfig, rawUrl, site = '', mediaType = 'image', category = 'JAV_CEN') {
        if (!rawUrl || typeof rawUrl !== 'string') return '';
        const clean = rawUrl.trim();
        if (!clean) return '';

        let ffBase = (srvConfig && srvConfig.ff_ddns) ? srvConfig.ff_ddns : '';
        if (!ffBase && window._pmh_latest_ping_results && srvConfig && srvConfig.machineIdentifier) {
            ffBase = window._pmh_latest_ping_results[srvConfig.machineIdentifier]?.ff_ddns || '';
        }
        if (!ffBase && ServerConfig.SERVERS && ServerConfig.SERVERS.length > 0) {
            ffBase = ServerConfig.SERVERS[0]?.ff_ddns || '';
        }
        ffBase = ffBase.replace(/\/+$/, '');

        if (!ffBase) {
            return clean;
        }

        const isUncen = (category === 'JAV_UNCEN');
        const routePath = (mediaType === 'video') ? (isUncen ? 'jav_video_un' : 'jav_video') : (isUncen ? 'jav_image_un' : 'jav_image');

        if (clean.startsWith('http://') || clean.startsWith('https://')) {
            if (clean.includes('/metadata/normal/')) {
                return clean;
            }
            return `${ffBase}/metadata/normal/${routePath}?site=${encodeURIComponent(site || '')}&url=${encodeURIComponent(clean)}`;
        }

        if (clean.startsWith('/images/')) {
            return `${ffBase}${clean}`;
        }

        return clean;
    }

    // 모달에 실제 스트림 주소를 주입하고 자동 재생을 시작하는 헬퍼
    function setVideoModalSource(videoUrl, title) {
        const m = document.getElementById('pmh-video-modal');
        if (!m) return;

        const titleText = m.querySelector('#pmh-video-modal-title-text');
        if (titleText && title) titleText.textContent = title;

        const sp = m.querySelector('#pmh-video-modal-spinner');
        if (sp) sp.style.display = 'none';

        const errEl = m.querySelector('#pmh-video-modal-error');
        if (errEl) { errEl.style.display = 'none'; errEl.innerHTML = ''; }

        const player = m.querySelector('#pmh-video-modal-player');
        if (player) {
            player.style.display = 'block';
            player.src = videoUrl;
            player.play().catch(e => log("[Video Modal] Auto-play was prevented by browser:", e));
        }
    }

    // 모달 내부 에러 메시지 표출 헬퍼
    function setVideoModalError(errMsg) {
        const m = document.getElementById('pmh-video-modal');
        if (!m) return;

        const sp = m.querySelector('#pmh-video-modal-spinner');
        if (sp) sp.style.display = 'none';

        const player = m.querySelector('#pmh-video-modal-player');
        if (player) player.style.display = 'none';

        const errEl = m.querySelector('#pmh-video-modal-error');
        if (errEl) {
            errEl.style.display = 'flex';
            errEl.innerHTML = `<i class="fas fa-exclamation-triangle" style="font-size:24px; margin-bottom:8px; color:#bd362f;"></i><div>${errMsg}</div>`;
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
    // 인터랙티브 컨텍스트 메뉴
    // ==========================================
    let currentHoverTarget = null;
    let currentMenuSessionId = 0;
    let menuHideTimer = null;

    const pmhActionMenu = document.createElement('div');
    pmhActionMenu.id = 'pmh-action-menu';
    document.body.appendChild(pmhActionMenu);

    function showMenu(targetElement) {
        if (!targetElement || targetElement.dataset.refreshing || targetElement.innerHTML.includes('fa-spinner')) return;
        
        if (currentHoverTarget === targetElement && pmhActionMenu.style.visibility === 'visible') {
            if (menuHideTimer) clearTimeout(menuHideTimer);
            return;
        }
        
        currentMenuSessionId++;
        currentHoverTarget = targetElement;
        if (menuHideTimer) clearTimeout(menuHideTimer);

        document.querySelectorAll('.pmh-force-hover').forEach(el => el.classList.remove('pmh-force-hover'));
        targetElement.classList.add('pmh-force-hover');

        // 상단 다중 선택 트리거 버튼 호버 시
        if (targetElement.id === 'pmh-multiselect-trigger') {
            pmhActionMenu.innerHTML = `
                <div class="pmh-menu-item" data-action="batch_refresh">
                    <div class="pmh-menu-icon-wrap"><i class="fas fa-bolt" style="color:#2f96b4;"></i></div>
                    메타 새로고침
                </div>
                <div class="pmh-menu-item" data-action="batch_rematch">
                    <div class="pmh-menu-icon-wrap"><i class="fas fa-link" style="color:#adb5bd;"></i></div>
                    일반 리매칭
                </div>
                <div class="pmh-menu-item" data-action="batch_clean_match">
                    <div class="pmh-menu-icon-wrap"><i class="fas fa-broom" style="color:#f89406;"></i></div>
                    클린 리매칭
                </div>
                <div class="pmh-menu-item" data-action="batch_analyze">
                    <div class="pmh-menu-icon-wrap"><i class="fas fa-search-plus" style="color:#51a351;"></i></div>
                    미디어 분석
                </div>
            `;
        }
        // 경로 스캔 링크 호버 시
        else if (targetElement.classList.contains('plex-path-scan-link')) {
            pmhActionMenu.innerHTML = `
                <div class="pmh-menu-item" data-action="scan_normal">
                    <div class="pmh-menu-icon-wrap"><i class="fas fa-search" style="color:#e5a00d;"></i></div>
                    일반 경로 스캔
                </div>
                <div class="pmh-menu-item" data-action="scan_vfs">
                    <div class="pmh-menu-icon-wrap"><i class="fas fa-hdd" style="color:#2f96b4;"></i></div>
                    VFS 갱신 후 스캔
                </div>
            `;
        } 
        // 목록 GUID 뱃지 호버 시
        else {
            const rawG = targetElement.dataset.rawGuid || targetElement.textContent || '';
            const targetServerId = targetElement.dataset.sid || (ServerConfig.SERVERS[0]?.machineIdentifier);
            const parentCont = targetElement.closest('div[data-testid^="cellItem"], div[class*="ListItem-container"], div[class*="MetadataPosterCard-container"]');
            const isShowCard = parentCont && (
                parentCont.querySelector('[class*="ShowPosterCard"], [class*="SeasonPosterCard"], [class*="EpisodePosterCard"]') ||
                parentCont.querySelector('a[href*="/children"], a[href*="folder=1"]')
            );
            const itemType = isShowCard ? 'show' : 'video';
            const isAv = isAvMediaItem(rawG, '', targetServerId, itemType);
            const cropMenuItemHtml = isAv ? `
                <div class="pmh-menu-item" data-action="crop_poster">
                    <div class="pmh-menu-icon-wrap"><i class="fas fa-crop-alt" style="color:#2f96b4;"></i></div>
                    포스터 편집
                </div>` : '';

            pmhActionMenu.innerHTML = `
                <div class="pmh-menu-item" data-action="refresh">
                    <div class="pmh-menu-icon-wrap"><i class="fas fa-bolt" style="color:#2f96b4;"></i></div>
                    메타 새로고침
                </div>
                <div class="pmh-menu-item" data-action="rematch">
                    <div class="pmh-menu-icon-wrap"><i class="fas fa-link" style="color:#adb5bd;"></i></div>
                    일반 리매칭
                </div>
                <div class="pmh-menu-item" data-action="clean_match">
                    <div class="pmh-menu-icon-wrap"><i class="fas fa-broom" style="color:#f89406;"></i></div>
                    클린 리매칭
                </div>
                ${cropMenuItemHtml}
            `;
        }

        pmhActionMenu.style.visibility = 'hidden'; 
        pmhActionMenu.style.opacity = '0';
        pmhActionMenu.style.display = 'flex';

        const rect = targetElement.getBoundingClientRect();
        let menuWidth = pmhActionMenu.offsetWidth || 130;
        let menuHeight = pmhActionMenu.offsetHeight || 100;

        let topPos = rect.bottom; 
        let leftPos = rect.left - 4; 

        if (leftPos < -4) leftPos = -4; 
        if (leftPos + menuWidth > window.innerWidth + 3) leftPos = window.innerWidth - menuWidth + 3;
        
        if (topPos + menuHeight > window.innerHeight) {
            topPos = rect.top - menuHeight + 4; 
        }

        pmhActionMenu.style.left = leftPos + 'px';
        pmhActionMenu.style.top = topPos + 'px';
        
        requestAnimationFrame(() => {
            pmhActionMenu.style.visibility = 'visible';
            pmhActionMenu.style.opacity = '1';
        });
    }

    function hideMenu(targetSessionId) {
        if (targetSessionId !== undefined && targetSessionId !== currentMenuSessionId) return;

        pmhActionMenu.style.opacity = '0';
        
        if (currentHoverTarget) {
            currentHoverTarget.classList.remove('pmh-force-hover');
        }

        setTimeout(() => {
            if (targetSessionId === undefined || targetSessionId === currentMenuSessionId) {
                pmhActionMenu.style.visibility = 'hidden';
                currentHoverTarget = null;
            }
        }, 100);
    }

    document.addEventListener('mouseover', (e) => {
        const target = e.target.closest('.plex-guid-list-box, .plex-path-scan-link, #pmh-multiselect-trigger');
        if (target) {
            if (target.hasAttribute('title')) target.removeAttribute('title'); 
            showMenu(target);
        } else if (pmhActionMenu.contains(e.target)) {
            if (menuHideTimer) clearTimeout(menuHideTimer);
        }
    });

    // 마우스 롤아웃(이탈) 감지 및 닫기
    document.addEventListener('mouseout', (e) => {
        if (!currentHoverTarget) return;

        const isOutsideMenu = !e.relatedTarget || !pmhActionMenu.contains(e.relatedTarget);
        const isOutsideTarget = !e.relatedTarget || !currentHoverTarget.contains(e.relatedTarget);

        if (isOutsideMenu && isOutsideTarget) {
            if (menuHideTimer) clearTimeout(menuHideTimer);
            const sessionToClose = currentMenuSessionId;
            menuHideTimer = setTimeout(() => {
                hideMenu(sessionToClose);
            }, 100);
        }
    });

    // 메뉴 항목 클릭 리스너
    document.addEventListener('click', (e) => {
        if (pmhActionMenu.style.visibility === 'visible') {
            const menuItem = e.target.closest('.pmh-menu-item');
            if (menuItem && currentHoverTarget) {
                e.preventDefault(); e.stopPropagation();
                const actionType = menuItem.dataset.action;
                
                if (actionType.startsWith('batch_')) {
                    const cleanAction = actionType.replace('batch_', '');
                    hideMenu(currentMenuSessionId);
                    executePmhBatchAction(cleanAction);
                    return;
                }

                if (actionType === 'crop_poster') {
                    const targetGBox = currentHoverTarget;
                    const iid = targetGBox.dataset.iid;
                    const sid = targetGBox.dataset.sid || (ServerConfig.SERVERS[0]?.machineIdentifier);
                    const rawG = targetGBox.dataset.rawGuid || targetGBox.textContent;
                    
                    const parentCont = targetGBox.closest('div[data-testid^="cellItem"], div[class*="ListItem-container"], div[class*="MetadataPosterCard-container"], tr[class*="TableRow-"]');
                    const titleText = parentCont ? (parentCont.querySelector('[class*="Title"], a[aria-label]')?.textContent?.trim()) : '';

                    hideMenu(currentMenuSessionId);
                    if (iid && sid) openPosterCropModal(iid, sid, rawG, titleText);
                    return;
                }

                const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
                clickEvent.pmhMenuAction = actionType; 
                currentHoverTarget.dispatchEvent(clickEvent);
                hideMenu(currentMenuSessionId);
                return;
            }

            if (!pmhActionMenu.contains(e.target) && (!currentHoverTarget || !currentHoverTarget.contains(e.target))) {
                hideMenu(currentMenuSessionId);
            }
        }
    });

    // 스크롤 시 즉시 닫기
    function hideMenuOnScroll() {
        if (pmhActionMenu.style.visibility === 'visible') hideMenu(currentMenuSessionId); 
    }
    window.addEventListener('scroll', hideMenuOnScroll, true);
    window.addEventListener('touchmove', hideMenuOnScroll, { passive: true, capture: true });


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
                                    status: 'ok', 
                                    version: ver, 
                                    name: srv.name, 
                                    ignore_res_section: jsonRes.ignore_res_section || "",
                                    jav_section: jsonRes.jav_section || "",
                                    western_av_section: jsonRes.western_av_section || "",
                                    av_image_server_use: !!jsonRes.av_image_server_use,
                                    av_image_server_url: (jsonRes.av_image_server_url || "").replace(/\/+$/, ''),
                                    ff_metadb_use: !!jsonRes.ff_metadb_use,
                                    ff_ddns: jsonRes.ff_ddns || "",
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
                    const installPromises = [];

                    for (const bundle of bundledTools) {
                        const namespaceMatch = bundle.url.match(/raw\.githubusercontent\.com\/([^\/]+)\//);
                        const namespace = namespaceMatch ? namespaceMatch[1].replace(/[^a-zA-Z0-9]/g, '').toLowerCase() : '';
                        const expectedId = namespace && !bundle.id.startsWith(namespace + '_') ? `${namespace}_${bundle.id}` : bundle.id;

                        if (bundle.url) {
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
            customAgentScore: 95,
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

    async function makeRequest(url, method = "GET", data = null, apiKey = null, cancelToken = null, timeoutMs = 10000) {
        log(`[API Req] [${method}] ${url} (Timeout: ${timeoutMs / 1000}s)`);

        const secureToken = await generateSecureHeader(apiKey);

        return new Promise((resolve, reject) => {
            const headers = {
                "Accept": "application/json",
                "Connection": "close"
            };
            if (data) headers["Content-Type"] = "application/json";
            if (apiKey) headers["X-PMH-Signature"] = secureToken;

            const req = GM_xmlhttpRequest({
                method: method,
                url: url,
                timeout: timeoutMs,
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
                            reject(new Error(`서버 응답 파싱 실패 (HTTP ${r.status})`));
                        }
                    } else {
                        try {
                            const errJson = JSON.parse(r.responseText);
                            const errMsg = errJson.error || errJson.message || `서버 오류 (HTTP ${r.status})`;
                            reject(new Error(errMsg));
                        } catch(e) {
                            reject(new Error(`서버 처리 실패 (HTTP ${r.status})`));
                        }
                    }
                },
                onerror: () => {
                    activeRequests.delete(req);
                    reject(new Error("Network Error: 서버에 연결할 수 없습니다."));
                },
                ontimeout: () => {
                    activeRequests.delete(req);
                    reject(new Error(`Timeout: 서버 응답 시간 초과 (${timeoutMs / 1000}초)`));
                },
                onabort: () => {
                    activeRequests.delete(req);
                    reject(new Error("Aborted: 요청이 취소되었습니다."));
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

        if (meta.Location && Array.isArray(meta.Location)) {
            log(`[Fallback] Meta Location parsed: ${meta.Location.length} location(s) found for item ${itemId}`);
            meta.Location.forEach(loc => {
                if (loc.path) {
                    versions.push({ file: loc.path, parts: [{ path: loc.path }] });
                }
            });
            if (!p && versions.length > 0) p = versions[0].file;
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
            librarySectionID: meta.librarySectionID || null,
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

    // 미디어 버전 목록 중 최적의 원본 동영상 파일 경로 산출 공용 헬퍼
    function findBestVideoPath(versions) {
        if (!versions || versions.length === 0) return '';
        const valid = versions.filter(v => v && v.file);
        if (valid.length === 0) return '';

        const maxWidth = Math.max(...valid.map(v => v.width || 0));
        const topCandidates = valid.filter(v => (v.width || 0) === maxWidth);

        if (topCandidates.length === 1) return topCandidates[0].file;

        const isFirstPart = (path) => {
            const name = path.split(/[\\/]/).pop().toLowerCase();
            return /[-_. ]?(cd|part|pt|disc|dvd)[\s._-]*0*1\b/i.test(name) || /[-_. ]0*1\.[a-z0-9]+$/i.test(name);
        };

        const firstPart = topCandidates.find(v => isFirstPart(v.file));
        if (firstPart) return firstPart.file;

        topCandidates.sort((a, b) => {
            const nameA = a.file.split(/[\\/]/).pop();
            const nameB = b.file.split(/[\\/]/).pop();
            return nameA.localeCompare(nameB, undefined, { numeric: true, sensitivity: 'base' });
        });
        return topCandidates[0].file;
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

            html += `<a href="#" class="plex-path-scan-link" data-path="${currentAccumulatedPath}" data-section-id="${sectionId}" data-type="${clickType}" title="클릭: 단순 스캔 / Shift+클릭: VFS/Refresh + 스캔" style="color:${color}; font-weight:${fontWeight}; text-decoration:none; transition:0.2s;" onmouseover="this.style.color='#fff'; this.style.textDecoration='underline';" onmouseout="this.style.color='${color}'; this.style.textDecoration='none';">${seg}</a>`;

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
    // Tool UI 렌더링 및 모니터링
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

    // FF 메타데이터 및 인물 DB API 전용 중계 브릿지
    const PmhFfBridge = {
        callMetaApi: async function(targetSrv, command, arg1, arg2, arg3) {
            const payload = {
                command: command,
                arg1: arg1 || '',
                arg2: arg2 || '',
                arg3: arg3 || ''
            };
            return await makeRequest(`${targetSrv.relayUrl}/ff_metadata/meta_api`, 'POST', payload, ClientSettings.masterApiKey, null, 30000);
        },

        callPersonApi: async function(targetSrv, command, arg1, arg2, arg3) {
            const payload = {
                command: command,
                arg1: arg1 || '',
                arg2: arg2 || '',
                arg3: arg3 || ''
            };
            return await makeRequest(`${targetSrv.relayUrl}/ff_metadata/person_api`, 'POST', payload, ClientSettings.masterApiKey, null, 30000);
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
                logLevel: ClientSettings.logLevel,

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
                    },
                    getSignature: async () => await generateSecureHeader(ClientSettings.masterApiKey)
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
    // 기본 제어 패널(Top Nav UI) 주입
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

            initViewportObserver();

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

        settingsWrapper.appendChild(lenInp); settingsWrapper.appendChild(lenBtn);

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
                    <div style="display:flex; gap:12px; font-size:13px; align-items:center;">
                        <span id="pmh-tool-check-update-btn" class="pmh-action-icon" title="툴 업데이트 및 노드 동기화 확인" style="cursor:pointer; color:#aaa; transition:all 0.2s;" onmouseover="this.style.color='#2f96b4'" onmouseout="if(!this.dataset.pendingBatch) this.style.color='#aaa'">
                            <i class="fas fa-sync-alt pmh-tool-header-sync-icon"></i>
                        </span>
                        <span id="pmh-tool-install-btn" class="pmh-action-icon" title="신규 등록 (전체 서버에 설치)" style="cursor:pointer; color:#51a351; transition:0.2s;">
                            <i class="fas fa-plus"></i>
                        </span>
                        <span id="pmh-tool-refresh-btn" class="pmh-action-icon" title="새로고침" style="cursor:pointer; color:#aaa; transition:0.2s;">
                            <i class="fas fa-redo"></i>
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

                    const installedServerIndices = window._pmh_tool_server_map[tool.id] || [];

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
                                    <div style="display:flex; align-items:center; flex-wrap:wrap;">
                                        <span style="color:${nameColor}; font-weight:${isRunning ? 'bold' : 'normal'}; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                                            ${tool.name || tool.id}
                                        </span>
                                        <span style="color:#777; font-size:10px; font-weight:normal; margin-left:4px;">v${tool.version || '1.0'}</span>
                                        ${statusIcon}
                                    </div>
                                    <div style="display:flex; flex-wrap:wrap;">
                                        ${serverBadgesHtml}
                                    </div>
                                </div>
                            </div>
                            <div style="display:flex; align-items:center; padding-left:10px; flex-shrink:0;">
                                <span class="pmh-tool-update-btn" data-id="${tool.id}" data-url="${tool.update_url || ''}" style="display:none; font-size:11px; font-weight:bold; cursor:pointer; margin-right:10px; padding:2px 6px; border-radius:3px; transition:0.2s;" title="단독 업데이트/동기화"></span>
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
                if (refBtn) refBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
                pmhToolListCache = null;
                fetchTools();
                return;
            }

            const updateCheckBtn = e.target.closest('#pmh-tool-check-update-btn');
            if (updateCheckBtn) {
                e.preventDefault(); e.stopPropagation();
                if (updateCheckBtn.innerHTML.includes('fa-spin')) return;

                if (updateCheckBtn.dataset.pendingBatch) {
                    const batchList = JSON.parse(updateCheckBtn.dataset.pendingBatch);
                    if (!batchList || batchList.length === 0) return;

                    updateCheckBtn.innerHTML = '<i class="fas fa-spinner fa-spin" style="color:#e5a00d;"></i>';
                    updateCheckBtn.style.pointerEvents = 'none';

                    batchList.forEach(item => {
                        const targetBtn = dropdown.querySelector(`.pmh-tool-item[data-id="${item.toolId}"] .pmh-tool-update-btn`);
                        if (targetBtn) {
                            targetBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 처리 중...';
                            targetBtn.style.pointerEvents = 'none';
                        }
                    });

                    toastr.info(`총 ${batchList.length}개 툴에 대해 전체 서버 일괄 동기화를 시작합니다...`, "일괄 처리 시작");

                    let successToolCount = 0;

                    for (const item of batchList) {
                        let toolSuccess = 0;
                        await Promise.all(ServerConfig.SERVERS.map(srv => new Promise(async res => {
                            try {
                                const r = await PmhToolAPI.call(srv, `/tools/install`, "POST", { url: item.updateUrl, target_id: item.toolId });
                                if (r.status === 200) toolSuccess++;
                                res();
                            } catch(err) { res(); }
                        })));

                        if (toolSuccess > 0) successToolCount++;
                    }

                    toastr.success(`총 ${successToolCount}개 툴의 일괄 업데이트 및 노드 동기화가 완료되었습니다!`, "성공");
                    pmhToolListCache = null;
                    fetchTools();
                    return;
                }

                updateCheckBtn.innerHTML = '<i class="fas fa-sync-alt fa-spin" style="color:#2f96b4;"></i>';

                const toolItems = dropdown.querySelectorAll('.pmh-tool-item');
                let checkCount = 0;
                let pendingBatchList = [];
                const startTime = Date.now();
                const totalServers = ServerConfig.SERVERS.length;

                const finishCheck = () => {
                    const elapsedTime = Date.now() - startTime;
                    const doFinish = () => {
                        if (pendingBatchList.length > 0) {
                            updateCheckBtn.innerHTML = `<i class="fas fa-cloud-download-alt" style="color:#51a351;"></i>`;
                            updateCheckBtn.style.color = '#51a351';
                            updateCheckBtn.title = `총 ${pendingBatchList.length}개 툴 원클릭 일괄 업데이트/동기화 실행 (클릭 시 전체 적용)`;
                            updateCheckBtn.dataset.pendingBatch = JSON.stringify(pendingBatchList);

                            toastr.info(
                                `총 ${pendingBatchList.length}개의 업데이트/동기화 대상이 발견되었습니다.<br><b>상단 초록색 구름 아이콘</b>을 누르면 한 번에 일괄 적용됩니다.`,
                                "업데이트 발견",
                                { timeOut: 7000 }
                            );
                        } else {
                            updateCheckBtn.innerHTML = '<i class="fas fa-sync-alt"></i>';
                            updateCheckBtn.style.color = '#aaa';
                            delete updateCheckBtn.dataset.pendingBatch;
                            toastr.success("모든 노드의 툴이 최신 상태로 동기화되어 있습니다.");
                        }
                    };
                    if (elapsedTime < 500) setTimeout(doFinish, 500 - elapsedTime);
                    else doFinish();
                };

                toolItems.forEach(item => {
                    const toolId = item.dataset.id;
                    const updateUrl = item.dataset.url;
                    const currentVer = item.dataset.ver;
                    const updateBtn = item.querySelector('.pmh-tool-update-btn');
                    const installedIndices = window._pmh_tool_server_map[toolId] || [];

                    let isMissingNodes = (totalServers > 1 && installedIndices.length < totalServers);

                    if (updateUrl && updateUrl !== 'undefined') {
                        checkCount++;

                        GM_xmlhttpRequest({
                            method: "GET", url: `${updateUrl}?t=${Date.now()}`,
                            timeout: 5000,
                            onload: (res) => {
                                let hasNewVersion = false;
                                let remoteVer = currentVer;

                                if (res.status === 200) {
                                    const match = res.responseText.match(/version:\s*['"]?([^'"\r\n]+)['"]?/);
                                    if (match) {
                                        remoteVer = match[1];
                                        hasNewVersion = isNewerVersion(currentVer, remoteVer);
                                    }
                                }

                                if (hasNewVersion || isMissingNodes) {
                                    updateBtn.style.display = 'inline-block';

                                    if (hasNewVersion && isMissingNodes) {
                                        updateBtn.innerHTML = `<i class="fas fa-arrow-circle-up"></i> v${remoteVer} (${installedIndices.length}/${totalServers})`;
                                        updateBtn.style.color = '#51a351';
                                        updateBtn.style.background = 'rgba(81,163,81,0.15)';
                                        updateBtn.style.border = '1px solid #51a351';
                                    } else if (hasNewVersion) {
                                        updateBtn.innerHTML = `<i class="fas fa-arrow-circle-up"></i> v${remoteVer}`;
                                        updateBtn.style.color = '#51a351';
                                        updateBtn.style.background = 'rgba(81,163,81,0.15)';
                                        updateBtn.style.border = '1px solid #51a351';
                                    } else {
                                        updateBtn.innerHTML = `<i class="fas fa-server"></i> 동기화 (${installedIndices.length}/${totalServers})`;
                                        updateBtn.style.color = '#2f96b4';
                                        updateBtn.style.background = 'rgba(47,150,180,0.15)';
                                        updateBtn.style.border = '1px solid #2f96b4';
                                    }

                                    pendingBatchList.push({
                                        toolId: toolId,
                                        updateUrl: updateUrl,
                                        targetVer: remoteVer
                                    });
                                } else {
                                    updateBtn.style.display = 'none';
                                }

                                checkCount--; if (checkCount === 0) finishCheck();
                            },
                            onerror: () => { checkCount--; if (checkCount === 0) finishCheck(); },
                            ontimeout: () => { checkCount--; if (checkCount === 0) finishCheck(); }
                        });
                    }
                });

                if (checkCount === 0) finishCheck();
                return;
            }

            const doSingleUpdateBtn = e.target.closest('.pmh-tool-update-btn');
            if (doSingleUpdateBtn) {
                e.preventDefault(); e.stopPropagation();
                if (doSingleUpdateBtn.dataset.updating) return;

                const targetId = doSingleUpdateBtn.dataset.id;
                const updateUrl = doSingleUpdateBtn.dataset.url;

                doSingleUpdateBtn.dataset.updating = "true";
                const originalHtml = doSingleUpdateBtn.innerHTML;
                doSingleUpdateBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i>`;
                doSingleUpdateBtn.style.pointerEvents = 'none';

                let successCount = 0;
                await Promise.all(ServerConfig.SERVERS.map(srv => new Promise(async res => {
                    try {
                        const r = await PmhToolAPI.call(srv, `/tools/install`, "POST", { url: updateUrl, target_id: targetId });
                        if (r.status === 200) successCount++;
                        res();
                    } catch(err) { res(); }
                })));

                if (successCount > 0) {
                    toastr.success(`'${targetId}' 업데이트 및 노드 동기화 완료!`);
                    doSingleUpdateBtn.innerHTML = `<i class="fas fa-check"></i> 완료`;
                    doSingleUpdateBtn.style.color = '#51a351';
                    doSingleUpdateBtn.style.borderColor = '#51a351';

                    if (updateCheckBtn && updateCheckBtn.dataset.pendingBatch) {
                        let batch = JSON.parse(updateCheckBtn.dataset.pendingBatch);
                        batch = batch.filter(b => b.toolId !== targetId);
                        if (batch.length > 0) {
                            updateCheckBtn.dataset.pendingBatch = JSON.stringify(batch);
                            updateCheckBtn.title = `총 ${batch.length}개 툴 일괄 적용 대기 중`;
                        } else {
                            delete updateCheckBtn.dataset.pendingBatch;
                            updateCheckBtn.innerHTML = '<i class="fas fa-sync-alt"></i>';
                            updateCheckBtn.style.color = '#aaa';
                        }
                    }
                } else {
                    toastr.error("업데이트 실패");
                    doSingleUpdateBtn.innerHTML = originalHtml;
                    delete doSingleUpdateBtn.dataset.updating;
                    doSingleUpdateBtn.style.pointerEvents = 'auto';
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

                if (!dropdown.innerHTML || dropdown.innerHTML.trim() === '') {
                    dropdown.innerHTML = `
                        <div style="display:flex; justify-content:space-between; align-items:center; padding: 8px 15px; background:rgba(0,0,0,0.5); border-radius:6px 6px 0 0;">
                            <span style="font-size: 12px; color: #e5a00d; font-weight: bold;">PMH Toolbox</span>
                        </div>
                        <div style="padding:25px 15px; text-align:center; color:#aaa; font-size:12px;">
                            <i class="fas fa-spinner fa-spin" style="font-size:20px; color:#e5a00d; margin-bottom:8px;"></i><br>툴 목록 로딩 중...
                        </div>
                    `;
                }

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
    // 목록 모드 (List View) 처리
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
        if (!cont || !cont.isConnected) return;

        if (cont.matches?.('[class*="PosterCard-card-"], [class*="ThumbCard-card-"], [class*="MetadataSimplePosterCard-card-"]')) {
            const realParent = cont.closest('div[data-testid^="cellItem"], div[class*="ListItem-container"], tr[class*="TableRow-"]');
            if (realParent) cont = realParent;
        }

        const targetServerId = srvConfig ? srvConfig.machineIdentifier : link?.getAttribute('href')?.match(/\/server\/([a-f0-9]+)\//)?.[1];

        cont.querySelectorAll('.pmh-render-marker, .pmh-top-right-wrapper, .pmh-guid-wrapper, .plex-guid-list-box').forEach(el => el.remove());
        if (poster && poster !== cont) {
            poster.querySelectorAll('.pmh-render-marker, .pmh-top-right-wrapper, .pmh-guid-wrapper, .plex-guid-list-box').forEach(el => el.remove());
        }

        const currentStateHash = getItemStateHash(cont);
        const marker = document.createElement('div');
        marker.className = 'pmh-render-marker';
        marker.style.display = 'none';
        marker.setAttribute('data-iid', id);

        if (currentStateHash) marker.setAttribute('data-state-hash', currentStateHash);
        if (poster) poster.appendChild(marker);

        let wrapper = null;
        if (state.listTag || state.listPlay || info.is_friend_pending) {
            wrapper = document.createElement('div');
            wrapper.className = 'pmh-top-right-wrapper pmh-fade-update';

            const existingPlexBadge = poster?.querySelector('[class*="Badge-topRightBadge-"], [class*="PlayStateBadge-topRightBadge-"]');
            if (existingPlexBadge) {
                wrapper.style.top = '34px';
            }

            if (poster) poster.appendChild(wrapper);
        }

        if (info.is_friend_pending && wrapper) {
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

                const targetServerId = link?.getAttribute('href')?.match(/\/server\/([a-f0-9]+)\//)?.[1];
                const plexSrv = extractPlexServerInfo(targetServerId);

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

        if (state.listTag && info.tags && info.tags.length > 0 && wrapper) {
            info.tags.forEach(tagText => {
                const t = document.createElement('div');
                t.className = 'plex-list-res-tag';
                t.textContent = tagText;
                wrapper.appendChild(t);
            });
        }

        if (state.listPlay && wrapper) {
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
                const targetServerId = srvConfig ? srvConfig.machineIdentifier : link?.getAttribute('href')?.match(/\/server\/([a-f0-9]+)\//)?.[1];
                const plexSrv = extractPlexServerInfo(targetServerId);

                if (plexSrv) {
                    const vUrl = `${plexSrv.url}/library/parts/${info.part_id}/0/file?X-Plex-Token=${plexSrv.token}&ratingKey=${id}`;
                    let justFileName = info.p ? (info.p.split(/[\\/]/).pop() || "Unknown_Video.mp4") : "Unknown_Video.mp4";

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

            if (info.trailer_id) {
                const targetServerId = srvConfig ? srvConfig.machineIdentifier : link?.getAttribute('href')?.match(/\/server\/([a-f0-9]+)\//)?.[1];
                const plexSrv = extractPlexServerInfo(targetServerId);

                if (plexSrv) {
                    const tBtn = document.createElement('a');
                    tBtn.href = '#';
                    tBtn.className = 'plex-list-play-external plex-list-trailer-btn';
                    tBtn.title = '예고편 / 프리뷰 재생';
                    tBtn.innerHTML = '<i class="fas fa-film" style="color:#e5a00d;"></i>';

                    tBtn.addEventListener('click', async (e) => {
                        e.preventDefault(); e.stopPropagation();

                        const titleEl = cont.querySelector('a[aria-label], [data-testid="metadataTitleLink"], [class*="MetadataPosterCardTitle-"], [class*="TitleLink-"], [class*="Title"]');
                        let displayTitle = titleEl?.getAttribute('aria-label') || titleEl?.textContent?.trim();

                        if (!displayTitle && info.p) {
                            const rawFileName = info.p.split(/[\\/]/).pop() || info.p;
                            displayTitle = rawFileName.replace(/\.[^/.]+$/, "");
                        }

                        displayTitle = displayTitle || `Item ${id}`;

                        showVideoModal("", `${displayTitle} (예고편)`);

                        try {
                            const metaRes = await new Promise((resolve, reject) => {
                                GM_xmlhttpRequest({
                                    method: 'GET',
                                    url: `${plexSrv.url}/library/metadata/${info.trailer_id}?X-Plex-Token=${plexSrv.token}`,
                                    headers: { 'Accept': 'application/json' },
                                    timeout: 6000,
                                    onload: (r) => {
                                        if (r.status === 200) {
                                            try { resolve(JSON.parse(r.responseText)); }
                                            catch (err) { reject(err); }
                                        } else {
                                            reject(new Error(`Plex API 응답 오류 (HTTP ${r.status})`));
                                        }
                                    },
                                    onerror: () => reject(new Error("Plex 서버 네트워크 연결 실패")),
                                    ontimeout: () => reject(new Error("Plex 서버 응답 시간 초과"))
                                });
                            });

                            const trailerMeta = metaRes?.MediaContainer?.Metadata?.[0];
                            const part = trailerMeta?.Media?.[0]?.Part?.[0];

                            if (!part || !part.key) {
                                throw new Error("트레일러 미디어 스트림 키를 찾지 못했습니다.");
                            }

                            let trailerStreamUrl = String(part.key).trim();

                            if (trailerStreamUrl.startsWith('http://') || trailerStreamUrl.startsWith('https://')) {
                                // FF 메타데이터 서버 등 외부 지오 프록시/원격 스트림인 경우 원본 URL 그대로 사용
                                infoLog(`[List] Trailer remote stream URL detected: ${trailerStreamUrl}`);
                            } else {
                                // Plex 서버 내부 미디어 파트(/library/parts/...)인 경우 Plex 서버 주소 및 토큰 연결
                                const streamPath = trailerStreamUrl.startsWith('/') ? trailerStreamUrl : `/${trailerStreamUrl}`;
                                const delimiter = streamPath.includes('?') ? '&' : '?';
                                trailerStreamUrl = `${plexSrv.url}${streamPath}${delimiter}X-Plex-Token=${plexSrv.token}`;
                                infoLog(`[List] Trailer local part stream connected: ${trailerStreamUrl}`);
                            }

                            setVideoModalSource(trailerStreamUrl, `${displayTitle} (예고편)`);

                        } catch (err) {
                            errorLog(`[List] Trailer playback error:`, err);
                            setVideoModalError(`예고편을 불러오지 못했습니다: ${err.message || err}`);
                        }
                    });
                    wrapper.appendChild(tBtn);
                }
            }
        }

        if (state.listGuid) {
            const isWide = (poster?.clientWidth || 158) > 200;
            const currentLen = isWide ? state.guidLen * 2 : state.guidLen;

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

            gBox.dataset.iid = id;
            gBox.dataset.sid = targetServerId;
            const originalRawG = info.raw_g || info.g || '';
            gBox.dataset.rawGuid = originalRawG;

            const queueInfo = window._pmh_media_queues && window._pmh_media_queues[id];

            if (queueInfo) {
                if (queueInfo.state === 'requesting') {
                    gBox.innerHTML = `<i class="fas fa-spinner fa-spin" style="margin-right:4px;"></i>요청중...`;
                    gBox.style.color = '#ccc';
                } else if (queueInfo.state === 'queued') {
                    gBox.innerHTML = `<i class="fas fa-clock" style="margin-right:4px;"></i>대기중...`;
                    gBox.style.color = '#e5a00d';
                } else if (queueInfo.state === 'processing') {
                    gBox.innerHTML = `<i class="fas fa-spinner fa-spin" style="margin-right:4px;"></i>처리중...`;
                    gBox.style.color = '#2f96b4';
                }
                gBox.dataset.refreshing = 'true';
            } else if (info.g) {
                const short = info.g.length > currentLen ? info.g.substring(0, currentLen) + '...' : info.g;
                gBox.textContent = short;
                gBox.title = `${info.g} : 마우스 올림 시 작업 메뉴`;

                const lowerRawG = originalRawG.toLowerCase();
                const isUnmatched = !lowerRawG || lowerRawG === '-' || lowerRawG.includes('local://') || lowerRawG.includes('none://');

                if (isUnmatched) gBox.style.color = '#a68241';
                gBox.dataset.unmatched = isUnmatched ? 'true' : 'false';
            } else {
                gBox.innerHTML = `<i class="fas fa-info-circle" style="margin-right:4px;"></i>미확인`;
                gBox.style.color = '#777';
            }

            gBox.addEventListener('click', async (e) => {
                e.preventDefault(); e.stopPropagation();

                if (!e.pmhMenuAction && gBox.dataset.refreshing !== 'true') {
                    showMenu(gBox); return; 
                }

                if (gBox.dataset.refreshing === 'true') {
                    const qInfo = window._pmh_media_queues && window._pmh_media_queues[id];
                    if (qInfo && qInfo.state === 'queued') {
                        gBox.innerHTML = `<i class="fas fa-ban" style="margin-right:4px;"></i>취소됨`;
                        gBox.style.color = '#bd362f';

                        try {
                            const srv = getServerConfig(targetServerId);
                            if (srv && qInfo.task_id && qInfo.task_id !== 'pending') {
                                await makeRequest(`${srv.relayUrl}/media/queue_cancel`, 'POST', { task_id: qInfo.task_id }, ClientSettings.masterApiKey);
                            }
                        } catch(err) {}
                        delete window._pmh_media_queues[id];
                        if (typeof window.saveQueueState === 'function') window.saveQueueState();

                        setTimeout(() => {
                            const markers = document.querySelectorAll(`.pmh-render-marker[data-iid="${id}"]`);
                            markers.forEach(m => m.remove());
                            if (typeof processList === 'function') processList();
                        }, 800);
                    }
                    return;
                }

                const menuAction = e.pmhMenuAction;
                const plexSrv = targetServerId ? extractPlexServerInfo(targetServerId) : null;
                const srv = getServerConfig(targetServerId);
                if (!srv || !plexSrv) return;

                let actionName = '';
                let apiAction = '';
                let extraData = {};

                if (menuAction === 'clean_match') {
                    actionName = '클린 리매칭'; apiAction = 'match';
                    extraData = { _try_refresh_first: false, _do_unmatch_first: true };
                } else if (menuAction === 'rematch') {
                    actionName = '일반 리매칭'; apiAction = 'match';
                    extraData = { _try_refresh_first: false, _do_unmatch_first: false };
                } else if (menuAction === 'refresh') {
                    actionName = '메타 새로고침'; apiAction = 'refresh';
                } else return;

                let itemDisplayName = info.p ? (info.p.split(/[\\/]/).pop() || info.p) : (cont.querySelector('[class*="Title"], a[aria-label]')?.textContent?.trim() || `Item ${id}`);

                window._pmh_media_queues = window._pmh_media_queues || {};
                window._pmh_media_queues[id] = { 
                    task_id: 'pending', start_time: Date.now(), state: 'requesting', 
                    title: itemDisplayName, server_id: targetServerId 
                };
                if (typeof window.saveQueueState === 'function') window.saveQueueState();

                gBox.innerHTML = `<i class="fas fa-spinner fa-spin" style="margin-right:4px;"></i>요청중...`;
                gBox.style.color = '#ccc';
                gBox.dataset.refreshing = 'true';

                if (typeof window.startQueuePolling === 'function') {
                    window.startQueuePolling(targetServerId);
                }

                try {
                    const res = await makeRequest(`${srv.relayUrl}/media/${id}/${apiAction}`, 'POST', extraData, ClientSettings.masterApiKey);
                    if (res && res.status === 'queued') {
                        if (window._pmh_media_queues[id]) {
                            window._pmh_media_queues[id].task_id = res.task_id;
                            if (window._pmh_media_queues[id].state !== 'processing' && window._pmh_media_queues[id].state !== 'completed') {
                                window._pmh_media_queues[id].state = 'queued';
                                updateQueueBadgeInDOM(id, 'queued');
                            }
                            if (typeof window.saveQueueState === 'function') window.saveQueueState();
                        }
                    }
                } catch(err) {
                    delete window._pmh_media_queues[id];
                    if (typeof window.saveQueueState === 'function') window.saveQueueState();
                    gBox.innerHTML = `<i class="fas fa-times" style="margin-right:4px;"></i>실패`;
                    gBox.style.color = '#bd362f';
                    delete gBox.dataset.refreshing;
                    revertQueueBadgeToOriginal(id, targetServerId);
                }
            });

            gBoxWrapper.appendChild(gBox);
            cont.appendChild(gBoxWrapper);

            cont.style.setProperty('overflow', 'visible', 'important');

            let horizontalScroller = cont.closest('[class*="Scroller-horizontal"], [class*="HorizontalList-"], [class*="VirtualHubScroller-"]');
            if (horizontalScroller) {
                horizontalScroller.style.setProperty('overflow-y', 'hidden', 'important');
                horizontalScroller.style.setProperty('padding-bottom', '20px', 'important');
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

    // =========================================================================
    // 미디어 큐 실시간 SSE 수신 + 자가치유(Self-Healing) 자동 복원 엔진
    // =========================================================================
    window._pmh_active_queue_streams = window._pmh_active_queue_streams || {};
    window._pmh_watchdog_timer = window._pmh_watchdog_timer || null;

    function revertQueueBadgeToOriginal(itemId, serverId) {
        if (!itemId) return;

        if (window._pmh_media_queues?.[itemId]) {
            delete window._pmh_media_queues[itemId];
            if (typeof window.saveQueueState === 'function') window.saveQueueState();
        }

        setTimeout(() => {
            log(`[Queue Badge] 🔄 취소/실패 뱃지를 원래 GUID로 복원합니다. (Item ID: ${itemId})`);

            const markers = document.querySelectorAll(`.pmh-render-marker[data-iid="${itemId}"]`);
            markers.forEach(m => m.remove());

            const srvConfig = getServerConfig(serverId);

            let cachedData = getMemoryCache(`L_${serverId}_${itemId}`) || getMemoryCache(`F_${serverId}_${itemId}`);

            const targetCards = document.querySelectorAll(`
                div[data-testid^="cellItem"],
                div[class*="ListItem-container"],
                div[class*="MetadataPosterCard-container"],
                div[class*="MetadataThumbCard-container"],
                div[class*="ThumbCard-container"],
                div[class*="PosterCard-container"],
                div[class*="HubItem-"],
                tr[class*="TableRow-"]
            `);

            let restoredCount = 0;
            targetCards.forEach(cont => {
                const parentCell = cont.parentElement?.closest('div[data-testid^="cellItem"], div[class*="ListItem-container"], tr[class*="TableRow-"]');
                if (parentCell && parentCell !== cont) return;

                const { link, iid } = extractCardLinkAndId(cont);
                if (link && iid === itemId) {
                    let poster = cont.querySelector(`
                        [class*="PosterCard-card-"], 
                        [class*="MetadataSimplePosterCard-card-"], 
                        [class*="ThumbCard-card-"], 
                        [class*="ThumbCard-imageContainer"],
                        [class*="PosterCard-imageContainer"],
                        [data-testid="metadata-poster"]
                    `);
                    if (!poster && cont.classList.contains('ListItem-container')) poster = cont.firstElementChild;
                    if (!poster) {
                        const img = cont.querySelector('img[src*="/photo/"], img[src*="/thumb/"], img[src*="/art/"]');
                        if (img) poster = img.closest('[class*="card"], [class*="container"], [class*="imageContainer"]') || img.parentElement;
                    }
                    if (!poster) poster = cont;

                    if (poster) {
                        if (cachedData && !cachedData.ignored) {
                            let displayData = { ...cachedData, tags: applyUserTags(cachedData.p, cachedData.tags) };
                            renderListBadges(cont, poster, link, displayData, srvConfig, itemId);
                        } else {
                            renderListBadges(cont, poster, link, { g: '', raw_g: '', tags: [] }, srvConfig, itemId);
                        }
                        restoredCount++;
                    }
                }
            });

            log(`[Queue Badge] ✅ 원상 복원 완료 (총 ${restoredCount}개 카드 반영)`);
        }, 2500);
    }

    window.startQueuePolling = function(serverId) {
        if (!serverId) return;
        if (window._pmh_active_queue_streams[serverId]) return;

        const hasServerTask = Object.values(window._pmh_media_queues || {}).some(q => q.server_id === serverId);
        if (!hasServerTask) return;

        const srvConfig = getServerConfig(serverId);
        if (!srvConfig) return;

        window._pmh_active_queue_streams[serverId] = true;

        (async () => {
            let secureToken = "";
            if (typeof generateSecureHeader === 'function') {
                secureToken = await generateSecureHeader(ClientSettings.masterApiKey);
            }

            const streamUrl = `${srvConfig.relayUrl}/media/queue_stream?server_id=${encodeURIComponent(serverId)}&sig=${encodeURIComponent(secureToken)}&_t=${Date.now()}`;
            log(`[Queue SSE] 📡 미디어 큐 실시간 스트림 연결 시도 (${srvConfig.name}) ➔ ${streamUrl}`);

            const abortController = new AbortController();

            try {
                const response = await fetch(streamUrl, {
                    headers: { 'Accept': 'text/event-stream', 'X-PMH-Signature': secureToken },
                    signal: abortController.signal
                });

                if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);

                infoLog(`[Queue SSE] 🟢 미디어 큐 실시간 파이프라인 연결 완료 (${srvConfig.name})`);

                const reader = response.body.getReader();
                const decoder = new TextDecoder('utf-8');
                let buffer = '';

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n\n');
                    buffer = lines.pop() || '';

                    for (const block of lines) {
                        if (block.startsWith(':')) continue;
                        const match = block.match(/data:\s*(.+)/);
                        if (match) {
                            try {
                                const event = JSON.parse(match[1]);

                                // =========================================================
                                // 서버 재시작으로 비어있는 스냅샷 수신 시 유령 작업 즉시 복원
                                // =========================================================
                                if (event.type === 'snapshot' && Array.isArray(event.tasks)) {
                                    const activeBackendItemIds = new Set(event.tasks.map(t => String(t.item_id || '')));
                                    const now = Date.now();

                                    event.tasks.forEach(t => {
                                        const iid = String(t.item_id || '');
                                        if (iid) {
                                            window._pmh_media_queues = window._pmh_media_queues || {};
                                            if (!window._pmh_media_queues[iid]) {
                                                window._pmh_media_queues[iid] = {
                                                    task_id: t.task_id,
                                                    state: t.state,
                                                    server_id: serverId,
                                                    start_time: Date.now()
                                                };
                                            } else {
                                                window._pmh_media_queues[iid].task_id = t.task_id;
                                                window._pmh_media_queues[iid].state = t.state;
                                            }
                                            updateQueueBadgeInDOM(iid, t.state);
                                        }
                                    });

                                    // 서버 큐에 존재하지 않는 프론트엔드 유령 작업은 취소 처리 후 정상 복원
                                    Object.entries(window._pmh_media_queues || {}).forEach(([iid, qInfo]) => {
                                        if (qInfo.server_id === serverId) {
                                            if (!activeBackendItemIds.has(iid) && (now - qInfo.start_time > 3000)) {
                                                infoLog(`[Queue SSE] 🔄 서버 재시작으로 유실된 작업 감지 (ID: ${iid}) ➜ 원래 상태로 자동 복구`);
                                                updateQueueBadgeInDOM(iid, 'cancelled');
                                                revertQueueBadgeToOriginal(iid, serverId);
                                            }
                                        }
                                    });

                                    if (typeof window.saveQueueState === 'function') window.saveQueueState();
                                    continue;
                                }

                                const itemId = String(event.item_id || '');
                                if (!itemId) continue;

                                log(`[Queue SSE] 📥 실시간 상태 수신 (ID: ${itemId}, State: ${event.state})`);

                                if (event.state === 'processing') {
                                    if (window._pmh_media_queues?.[itemId]) {
                                        window._pmh_media_queues[itemId].state = 'processing';
                                        if (typeof window.saveQueueState === 'function') window.saveQueueState();
                                    }
                                    updateQueueBadgeInDOM(itemId, 'processing');
                                }
                                else if (event.state === 'completed') {
                                    if (window._pmh_media_queues?.[itemId]) {
                                        delete window._pmh_media_queues[itemId];
                                        if (typeof window.saveQueueState === 'function') window.saveQueueState();
                                    }

                                    updateQueueBadgeInDOM(itemId, 'completed');

                                    setTimeout(async () => {
                                        deleteMemoryCache(`L_${serverId}_${itemId}`);
                                        deleteMemoryCache(`D_${serverId}_${itemId}`);
                                        deleteMemoryCache(`F_${serverId}_${itemId}`);
                                        if (typeof sessionRevalidated !== 'undefined') sessionRevalidated.delete(itemId);

                                        try {
                                            const freshDbData = await makeRequest(
                                                `${srvConfig.relayUrl}/library/batch`,
                                                'POST',
                                                { ids: [itemId], check_multi_path: state.listMultiPath },
                                                ClientSettings.masterApiKey
                                            );

                                            const newData = freshDbData?.[itemId] || { ignored: true };
                                            setMemoryCache(`L_${serverId}_${itemId}`, newData);

                                            const allCards = document.querySelectorAll(`
                                                div[data-testid^="cellItem"],
                                                div[class*="ListItem-container"],
                                                div[class*="MetadataPosterCard-container"],
                                                div[class*="MetadataThumbCard-container"],
                                                div[class*="ThumbCard-container"],
                                                div[class*="HubItem-"],
                                                tr[class*="TableRow-"]
                                            `);

                                            allCards.forEach(cont => {
                                                const parentCell = cont.parentElement?.closest('div[data-testid^="cellItem"], div[class*="ListItem-container"], tr[class*="TableRow-"]');
                                                if (parentCell && parentCell !== cont) return;

                                                const { link: liveLink, iid: liveIid } = extractCardLinkAndId(cont);
                                                if (liveLink && liveIid === itemId) {
                                                    let livePoster = cont.querySelector(`
                                                        [class*="PosterCard-card-"], 
                                                        [class*="MetadataSimplePosterCard-card-"], 
                                                        [class*="ThumbCard-card-"], 
                                                        [class*="ThumbCard-imageContainer"],
                                                        [class*="PosterCard-imageContainer"],
                                                        [data-testid="metadata-poster"]
                                                    `);
                                                    if (!livePoster && cont.classList.contains('ListItem-container')) livePoster = live.firstElementChild;
                                                    if (!livePoster) {
                                                        const img = cont.querySelector('img[src*="/photo/"], img[src*="/thumb/"], img[src*="/art/"]');
                                                        if (img) livePoster = img.closest('[class*="card"], [class*="container"], [class*="imageContainer"]') || img.parentElement;
                                                    }
                                                    if (!livePoster) livePoster = cont;

                                                    if (livePoster) {
                                                        let displayData = { ...newData, tags: applyUserTags(newData.p, newData.tags) };
                                                        renderListBadges(cont, livePoster, liveLink, displayData, srvConfig, itemId);
                                                    }
                                                }
                                            });

                                        } catch (err) {
                                            revertQueueBadgeToOriginal(itemId, serverId);
                                        }
                                    }, 800);
                                }
                                // =========================================================
                                // 에러 또는 취소 시 2초 후 정상 GUID 복원
                                // =========================================================
                                else if (event.state === 'error' || event.state === 'cancelled') {
                                    updateQueueBadgeInDOM(itemId, event.state);
                                    revertQueueBadgeToOriginal(itemId, serverId);
                                }

                            } catch(e) {}
                        }
                    }
                }
            } catch (err) {
                log(`[Queue SSE] ⚪ 스트림 연결 해제됨 (${err.message})`);
            } finally {
                delete window._pmh_active_queue_streams[serverId];
            }
        })();

        startQueueWatchdog();
    };

    // =========================================================================
    // [보조 워치독] 유령 작업 자동 원상복구
    // =========================================================================
    // DOM 뱃지 상태 실시간 업데이트 헬퍼
    function updateQueueBadgeInDOM(itemId, state) {
        const markers = document.querySelectorAll(`.pmh-render-marker[data-iid="${itemId}"]`);
        markers.forEach(m => {
            const cont = m.closest('div[data-testid^="cellItem"], div[class*="ListItem-container"], div[class*="MetadataPosterCard-container"], tr[class*="TableRow-"]');
            const gBox = cont ? cont.querySelector('.plex-guid-list-box') : null;
            if (gBox) {
                if (state === 'processing') {
                    gBox.innerHTML = `<i class="fas fa-spinner fa-spin" style="margin-right:4px;"></i>처리중...`;
                    gBox.style.color = '#2f96b4';
                    gBox.dataset.refreshing = 'true';
                } else if (state === 'queued') {
                    gBox.innerHTML = `<i class="fas fa-clock" style="margin-right:4px;"></i>대기중...`;
                    gBox.style.color = '#e5a00d';
                    gBox.dataset.refreshing = 'true';
                } else if (state === 'completed') {
                    gBox.innerHTML = `<i class="fas fa-check" style="margin-right:4px;"></i>반영중...`;
                    gBox.style.color = '#51a351';
                } else if (state === 'cancelled') {
                    gBox.innerHTML = `<i class="fas fa-ban" style="margin-right:4px;"></i>취소됨`;
                    gBox.style.color = '#bd362f';
                    delete gBox.dataset.refreshing;
                } else if (state === 'error') {
                    gBox.innerHTML = `<i class="fas fa-times-circle" style="margin-right:4px;"></i>실패`;
                    gBox.style.color = '#bd362f';
                    delete gBox.dataset.refreshing;
                }
            }
        });
    }

    // 단일 통합 워치독: 연결 재시도 및 2분 이상 응답 없는 유령 작업 자동 원상 복구
    function startQueueWatchdog() {
        if (window._pmh_watchdog_timer) return;

        window._pmh_watchdog_timer = setInterval(async () => {
            const queueItems = Object.entries(window._pmh_media_queues || {});
            if (queueItems.length === 0) {
                clearInterval(window._pmh_watchdog_timer);
                window._pmh_watchdog_timer = null;
                return;
            }

            const now = Date.now();
            for (const [id, qInfo] of queueItems) {
                if (now - qInfo.start_time > 120000) {
                    infoLog(`[Watchdog] ⚠️ 응답 시간 초과 작업 감지 (ID: ${id}) ➜ 원래 상태로 자동 복원`);
                    updateQueueBadgeInDOM(id, 'cancelled');
                    revertQueueBadgeToOriginal(id, qInfo.server_id);
                }
                else if (!window._pmh_active_queue_streams[qInfo.server_id]) {
                    window.startQueuePolling(qInfo.server_id);
                }
            }
        }, 10000);
    }

    window._pmh_global_task_watcher_timer = null;

    async function forceBackgroundItemRefresh(serverId, itemId, taskSession) {
        if (currentRenderSession !== taskSession) return;
        
        const plexSrv = extractPlexServerInfo(serverId);
        if (!plexSrv) return;
        const srvConfig = getServerConfig(serverId);

        try {
            let meta = null;
            let oldCache = getMemoryCache(`L_${serverId}_${itemId}`) || {};
            let newId = itemId;

            for (let retry = 0; retry < 3; retry++) {
                meta = await fetchPlexMetaFallback(itemId, plexSrv);
                
                if (meta === 'DELETED') break;
                
                if (meta) {
                    const checkGuid = (meta.guid || '').toLowerCase();
                    if (!checkGuid.includes('local://') && !checkGuid.includes('none://') && checkGuid !== '-') {
                        break;
                    }
                }
                infoLog(`[Background Refresh] API 반환값이 아직 갱신되지 않았습니다. 3초 후 재시도... (${retry+1}/3)`);
                await new Promise(r => setTimeout(r, 3000));
            }

            if (currentRenderSession !== taskSession) return;

            if (meta === 'DELETED') {
                meta = null; 
                const filePath = oldCache ? oldCache.p : null;
                const sectionId = oldCache ? oldCache.librarySectionID : null;

                if (filePath && sectionId) {
                    infoLog(`[Background Refresh] ID ${itemId} 삭제 감지됨. 파일 경로로 새 ID 역추적을 시작합니다: ${filePath}`);
                    
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
                        infoLog(`[Background Refresh] 새 ID 역추적 성공! (구 ID: ${itemId} -> 신 ID: ${newId})`);
                    }
                }
                
                if (!meta) {
                    const failMarkers = document.querySelectorAll(`.pmh-render-marker[data-iid="${itemId}"]`);
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

            if (!meta) return;

            const updatedInfo = convertPlexMetaToLocalData(meta, newId);
            const mergedInfo = { ...oldCache, ...updatedInfo, itemId: newId };
            
            if (newId !== itemId) {
                deleteMemoryCache(`L_${serverId}_${itemId}`);
                deleteMemoryCache(`D_${serverId}_${itemId}`);
                deleteMemoryCache(`F_${serverId}_${itemId}`);
            }
            setMemoryCache(`L_${serverId}_${newId}`, mergedInfo);
            
            if (typeof sessionRevalidated !== 'undefined') {
                sessionRevalidated.add(itemId);
                sessionRevalidated.add(newId);
            }

            const markers = document.querySelectorAll(`.pmh-render-marker[data-iid="${itemId}"]`);
            markers.forEach(m => {
                const cont = m.closest('div[data-testid^="cellItem"], div[class*="ListItem-container"], div[class*="MetadataPosterCard-container"], tr[class*="TableRow-"]');
                if (cont) {
                    cont.querySelector('.pmh-top-right-wrapper')?.remove();
                    cont.querySelectorAll('.plex-guid-list-box, .pmh-guid-wrapper').forEach(el => el.remove());
                    
                    if (newId !== itemId) {
                        let liveLink = cont.querySelector('a[data-testid="metadataTitleLink"]') || cont.querySelectorAll('a[href*="key="], a[href*="/metadata/"]')[0];
                        if (liveLink) {
                            const oldHref = liveLink.getAttribute('href');
                            const newHref = oldHref.replace(itemId, newId).replace(encodeURIComponent('/library/metadata/' + itemId), encodeURIComponent('/library/metadata/' + newId));
                            liveLink.setAttribute('href', newHref);
                        }
                    }
                }
                m.remove(); 
            });

            infoLog(`[Background Refresh] 캐시 갱신 완료 (ID: ${newId}). UI 렌더링을 메인 루프에 위임합니다.`);
            setTimeout(() => { if (typeof processList === 'function') processList(); }, 150);

        } catch(e) {
            errorLog(`[Background Refresh] Error updating item ${itemId}`, e);
        }
    }

    function startGlobalTaskWatcher() {
        if (window._pmh_global_task_watcher_timer) return;
        
        const watchLoop = async () => {
            if (!ServerConfig.SERVERS || ServerConfig.SERVERS.length === 0) {
                window._pmh_global_task_watcher_timer = setTimeout(watchLoop, 10000);
                return;
            }

            try {
                let currentRunningCount = 0;
                const secureToken = await generateSecureHeader(ClientSettings.masterApiKey);

                const promises = ServerConfig.SERVERS.map(srv => {
                    return new Promise((resolve) => {
                        GM_xmlhttpRequest({
                            method: "GET", 
                            url: `${srv.relayUrl}/tools?t=${Date.now()}`,
                            headers: { "X-PMH-Signature": secureToken },
                            timeout: 5000,
                            onload: (res) => {
                                if (res.status === 200) {
                                    try {
                                        const data = JSON.parse(res.responseText);
                                        resolve({ 
                                            server: srv, 
                                            running: data.dashboard ? data.dashboard.running : [],
                                            completed: data.dashboard ? data.dashboard.completed_items : {}
                                        });
                                    } catch(e) { resolve({ server: srv, running: [], completed: {} }); }
                                } else resolve({ server: srv, running: [], completed: {} });
                            },
                            onerror: () => resolve({ server: srv, running: [], completed: {} }),
                            ontimeout: () => resolve({ server: srv, running: [], completed: {} })
                        });
                    });
                });

                const results = await Promise.all(promises);

                results.forEach(res => {
                    res.running.forEach(() => { currentRunningCount++; });
                    
                    if (res.completed && Object.keys(res.completed).length > 0) {
                        for (const [srvId, itemIds] of Object.entries(res.completed)) {
                            if (itemIds && itemIds.length > 0) {
                                infoLog(`[Global Watcher] 백엔드 툴로부터 ${itemIds.length}건의 작업 완료 항목을 감지했습니다. 백그라운드 캐시 갱신을 수행합니다.`);
                                itemIds.forEach(itemId => {
                                    const capturedSession = currentRenderSession;
                                    globalFallbackQueue.push({
                                        id: itemId,
                                        session: capturedSession,
                                        task: async () => {
                                            await forceBackgroundItemRefresh(srvId, itemId, capturedSession);
                                        }
                                    });
                                });
                                processGlobalFallbackQueue();
                            }
                        }
                    }
                });

                const nextDelay = currentRunningCount > 0 ? 2500 : 10000;
                window._pmh_global_task_watcher_timer = setTimeout(watchLoop, nextDelay);

            } catch (err) {
                window._pmh_global_task_watcher_timer = setTimeout(watchLoop, 10000);
            }
        };

        watchLoop();
    }

    // =========================================================================
    // 목록 및 홈 화면 (List/Home Hubs) 처리 - 통합 뷰포트 렌더링 엔진
    // =========================================================================
    let viewportObserver = null;
    const visibleElementsSet = new Set();
    let networkBatchTimer = null;

    function extractCardLinkAndId(cont) {
        if (!cont || !cont.isConnected) return { link: null, sid: null, iid: null, href: null };

        let link = cont.querySelector(`
            a[class*="PosterCardLink-link-"],
            a[class*="ThumbCardLink-link-"],
            a[class*="CardLink-link-"],
            a[data-testid="metadataTitleLink"],
            a[class*="MetadataTitleLink-"],
            a[class*="TitleLink-"]
        `);

        if (!link) {
            const allLinks = Array.from(cont.querySelectorAll('a[href*="/metadata/"], a[href*="key="]'));
            link = allLinks.find(a => a.querySelector('img') || a.getAttribute('aria-label')) || allLinks[0];
        }

        if (!link) return { link: null, sid: null, iid: null, href: null };

        const href = link.getAttribute('href') || '';
        const sidMatch = href.match(/\/server\/([a-f0-9]+)\//) || window.location.hash.match(/\/server\/([a-f0-9]+)\//);
        const sid = sidMatch ? sidMatch[1] : (ServerConfig.SERVERS[0]?.machineIdentifier || null);

        let iid = null;
        try {
            if (href.includes('key=')) {
                const keyParam = new URLSearchParams(href.split('?')[1]).get('key');
                if (keyParam) iid = decodeURIComponent(keyParam).split('/metadata/')[1]?.split(/[\/?]/)[0];
            }
            if (!iid && href.includes('/metadata/')) {
                iid = href.split('/metadata/')[1]?.split(/[\/?]/)[0];
            }
        } catch(e) {}

        return { link, sid, iid, href };
    }

    // 뷰포트 옵저버 초기화 (상하 + 좌우 400px 전방위 감지)
    function initViewportObserver() {
        if (viewportObserver) {
            viewportObserver.disconnect();
            viewportObserver = null;
        }
        visibleElementsSet.clear();

        viewportObserver = new IntersectionObserver((entries) => {
            let needsNetworkBatch = false;

            entries.forEach(entry => {
                const cont = entry.target;
                if (entry.isIntersecting) {
                    visibleElementsSet.add(cont);

                    const rendered = tryInstantCacheRender(cont);
                    if (!rendered) {
                        needsNetworkBatch = true;
                    }
                } else {
                    visibleElementsSet.delete(cont);
                }
            });

            if (needsNetworkBatch || visibleElementsSet.size > 0) {
                if (networkBatchTimer) clearTimeout(networkBatchTimer);
                networkBatchTimer = setTimeout(() => {
                    processServerBatchRevalidation();
                }, 80);
            }
        }, {
            root: null,
            rootMargin: '400px 400px',
            threshold: 0.01
        });
    }

    function tryInstantCacheRender(cont) {
        const { link, sid, iid, href } = extractCardLinkAndId(cont);
        if (!link || !sid || !iid || isIgnoredItem(href, iid, cont)) return false;

        const srvConfig = getServerConfig(sid);
        let cacheKey = srvConfig ? `L_${sid}_${iid}` : `F_${sid}_${iid}`;
        let cData = getMemoryCache(cacheKey);

        if (!cData && srvConfig) {
            cData = getMemoryCache(`F_${sid}_${iid}`);
        }

        const marker = cont.querySelector('.pmh-render-marker');
        if (marker && marker.getAttribute('data-iid') === iid && marker.getAttribute('data-stale') !== 'true') {
            return true;
        }

        let poster = cont.querySelector(`
            [class*="PosterCard-card-"], 
            [class*="MetadataSimplePosterCard-card-"], 
            [class*="ThumbCard-card-"], 
            [class*="Card-card-"], 
            [class*="ThumbCard-imageContainer"],
            [class*="PosterCard-imageContainer"],
            [class*="ImageContainer-"],
            [data-testid="metadata-poster"]
        `);
        if (!poster && cont.classList.contains('ListItem-container')) poster = cont.firstElementChild;
        if (!poster) {
            const img = cont.querySelector('img[src*="/photo/"], img[src*="/thumb/"], img[src*="/art/"]');
            if (img) poster = img.closest('[class*="card"], [class*="container"], [class*="imageContainer"]') || img.parentElement;
        }
        if (!poster) poster = cont;

        const style = window.getComputedStyle(poster);
        if (style.position === 'static') { poster.style.position = 'relative'; poster.style.overflow = 'hidden'; }

        if (cData) {
            if (cData.ignored) {
                let m = poster.querySelector('.pmh-render-marker') || document.createElement('div');
                m.className = 'pmh-render-marker'; m.style.display = 'none';
                m.setAttribute('data-iid', iid); m.setAttribute('data-ignored', 'true');
                poster.appendChild(m);
                return true;
            }
            let displayData = { ...cData, tags: applyUserTags(cData.p, cData.tags) };
            renderListBadges(cont, poster, link, displayData, srvConfig, iid);
            return true;
        } else if (!srvConfig) {
            renderListBadges(cont, poster, link, { is_friend_pending: true }, srvConfig, iid);
            return true;
        }

        return false;
    }

    async function processServerBatchRevalidation() {
        if (!state.listGuid && !state.listTag && !state.listPlay && !state.listMultiPath) return;
        if (visibleElementsSet.size === 0) return;

        const session = currentRenderSession;
        const pendingItems = [];
        const itemsToRevalidate = [];
        const changedItems = new Set();

        visibleElementsSet.forEach(cont => {
            const { link, sid, iid, href } = extractCardLinkAndId(cont);
            if (!link || !sid || !iid || isIgnoredItem(href, iid, cont)) return;

            itemsToRevalidate.push({ sid, iid, cont, link });

            const currentStateHash = getItemStateHash(cont);
            const marker = cont.querySelector('.pmh-render-marker');
            let isAlreadyRendered = false;

            if (marker && marker.getAttribute('data-iid') === iid) {
                const markerHash = marker.getAttribute('data-state-hash');
                const isStale = marker.getAttribute('data-stale') === 'true';

                if (isStale || (markerHash && currentStateHash && markerHash !== currentStateHash)) {
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

            let poster = cont.querySelector(`
                [class*="PosterCard-card-"], 
                [class*="MetadataSimplePosterCard-card-"], 
                [class*="ThumbCard-card-"], 
                [class*="Card-card-"], 
                [class*="ThumbCard-imageContainer"],
                [class*="PosterCard-imageContainer"],
                [data-testid="metadata-poster"]
            `);
            if (!poster && cont.classList.contains('ListItem-container')) poster = cont.firstElementChild;
            if (!poster) {
                const img = cont.querySelector('img[src*="/photo/"], img[src*="/thumb/"], img[src*="/art/"]');
                if (img) poster = img.closest('[class*="card"], [class*="container"], [class*="imageContainer"]') || img.parentElement;
            }
            if (!poster) poster = cont;

            if (poster) {
                const style = window.getComputedStyle(poster);
                if (style.position === 'static') { poster.style.position = 'relative'; poster.style.overflow = 'hidden'; }
                pendingItems.push({ sid, iid, cont, poster, link, currentStateHash });
            }
        });

        if (pendingItems.length === 0 && itemsToRevalidate.length === 0) return;

        pendingItems.forEach(item => {
            const srvConfig = getServerConfig(item.sid);
            let cacheKey = srvConfig ? `L_${item.sid}_${item.iid}` : `F_${item.sid}_${item.iid}`;
            let cData = getMemoryCache(cacheKey);

            if (!cData && srvConfig) {
                cData = getMemoryCache(`F_${item.sid}_${item.iid}`);
            }

            if (cData) {
                if (changedItems.has(item.iid)) return;

                if (cData.ignored) {
                    let marker = item.poster.querySelector('.pmh-render-marker') || document.createElement('div');
                    marker.className = 'pmh-render-marker'; marker.style.display = 'none';
                    marker.setAttribute('data-iid', item.iid); marker.setAttribute('data-ignored', 'true');
                    if (item.currentStateHash) marker.setAttribute('data-state-hash', item.currentStateHash);
                    item.poster.appendChild(marker);
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
            } else if (!srvConfig) {
                renderListBadges(item.cont, item.poster, item.link, { is_friend_pending: true }, srvConfig, item.iid);
                item.isRendered = true;
            }
        });

        // 서버 배치 검증 요청
        if (swrDebounceTimer) clearTimeout(swrDebounceTimer);

        swrDebounceTimer = setTimeout(async () => {
            if (session !== currentRenderSession) return;

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
                            if (a.part_id !== b.part_id || a.sub_id !== b.sub_id || a.sub_url !== b.sub_url || a.trailer_id !== b.trailer_id) return false;
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

                                visibleElementsSet.forEach(live => {
                                    const parentCell = live.parentElement?.closest('div[data-testid^="cellItem"], div[class*="ListItem-container"], tr[class*="TableRow-"]');
                                    if (parentCell && parentCell !== live) return;

                                    const { link: liveLink, iid: liveIid } = extractCardLinkAndId(live);
                                    if (liveLink && liveIid === id) {
                                        let livePoster = live.querySelector(`
                                            [class*="PosterCard-card-"], 
                                            [class*="MetadataSimplePosterCard-card-"], 
                                            [class*="ThumbCard-card-"], 
                                            [class*="ThumbCard-imageContainer"],
                                            [class*="PosterCard-imageContainer"],
                                            [data-testid="metadata-poster"]
                                        `);
                                        if (!livePoster && live.classList.contains('ListItem-container')) livePoster = live.firstElementChild;
                                        if (!livePoster) {
                                            const img = live.querySelector('img[src*="/photo/"], img[src*="/thumb/"], img[src*="/art/"]');
                                            if (img) livePoster = img.closest('[class*="card"], [class*="container"], [class*="imageContainer"]') || img.parentElement;
                                        }
                                        if (!livePoster) livePoster = live;

                                        if (livePoster) {
                                            let displayData = { ...newData, tags: applyUserTags(newData.p, newData.tags) };
                                            renderListBadges(live, livePoster, liveLink, displayData, srvConfig, id);
                                        }
                                    }
                                });

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
                    } catch(e) {}
                }

                if (!srvConfig.is_postgres) {
                    idsToFallbackBypass.forEach(id => {
                        globalFallbackQueue.push({
                            id: id,
                            session: session,
                            task: async () => {
                                if (session !== currentRenderSession) return;
                                try {
                                    let meta = await fetchPlexMetaFallback(id, plexSrv);
                                    if (!meta || meta === 'DELETED') return;

                                    const updatedInfo = convertPlexMetaToLocalData(meta, id);
                                    setMemoryCache(`L_${serverId}_${id}`, updatedInfo);
                                    sessionRevalidated.add(id);

                                    visibleElementsSet.forEach(live => {
                                        const { link: liveLink, iid: liveIid } = extractCardLinkAndId(live);
                                        if (liveLink && liveIid === id) {
                                            let livePoster = live.querySelector(`
                                                [class*="PosterCard-card-"], 
                                                [class*="MetadataSimplePosterCard-card-"], 
                                                [class*="ThumbCard-card-"], 
                                                [class*="Card-card-"], 
                                                [class*="ThumbCard-imageContainer"],
                                                [data-testid="metadata-poster"]
                                            `);
                                            if (!livePoster && live.classList.contains('ListItem-container')) livePoster = live.firstElementChild;
                                            if (!livePoster) {
                                                const img = live.querySelector('img[src*="/photo/"], img[src*="/thumb/"], img[src*="/art/"]');
                                                if (img) livePoster = img.closest('[class*="card"], [class*="container"], [class*="imageContainer"]') || img.parentElement;
                                            }
                                            if (!livePoster) livePoster = live;

                                            if (livePoster) {
                                                livePoster.querySelector('.pmh-render-marker')?.remove();
                                                renderListBadges(live, livePoster, liveLink, updatedInfo, srvConfig, id);
                                            }
                                        }
                                    });
                                } catch(e) {}
                            }
                        });
                    });
                    processGlobalFallbackQueue();
                }
            }
        }, 150);
    }

    function processList() {
        if (!state.listGuid && !state.listTag && !state.listPlay && !state.listMultiPath) return;
        if (!viewportObserver) initViewportObserver();

        const candidates = document.querySelectorAll(`
            div[data-testid^="cellItem"]:not([data-pmh-observed="true"]),
            div[class*="ListItem-container"]:not([data-pmh-observed="true"]),
            div[class*="MetadataPosterCard-container"]:not([data-pmh-observed="true"]),
            div[class*="MetadataThumbCard-container"]:not([data-pmh-observed="true"]),
            div[class*="ThumbCard-container"]:not([data-pmh-observed="true"]),
            div[class*="PosterCard-container"]:not([data-pmh-observed="true"]),
            div[class*="HubItem-"]:not([data-pmh-observed="true"]),
            tr[class*="TableRow-"]:not([data-pmh-observed="true"])
        `);

        candidates.forEach(cont => {
            const parentCell = cont.parentElement?.closest('div[data-testid^="cellItem"], div[class*="ListItem-container"], tr[class*="TableRow-"]');
            if (parentCell && parentCell !== cont) {
                return;
            }

            cont.setAttribute('data-pmh-observed', 'true');
            viewportObserver.observe(cont);
        });

        if (typeof renderVisibleItems === 'function' && visibleElementsSet.size > 0) {
            renderVisibleItems();
        }
    }

    // =========================================================================
    // Plex 네이티브 다중 선택(Multi-Select) 연동 배치 엔진
    // =========================================================================

    // 카드가 Plex 다중 선택 상태인지 여부 판별 헬퍼
    function isSelectedCard(card) {
        if (!card || !card.isConnected) return false;

        const useElements = card.querySelectorAll(`
            button[class*="Select"] use,
            button[class*="select"] use,
            [class*="SelectBadge"] use,
            [class*="SelectedBadge"] use,
            [class*="selectButton"] use,
            [class*="select-button"] use
        `);
        for (const u of useElements) {
            const href = u.getAttribute('xlink:href') || u.getAttribute('href') || '';
            if (href.includes('selected') || href.includes('check')) {
                return true;
            }
        }

        const allUses = card.querySelectorAll('use');
        for (const u of allUses) {
            const href = u.getAttribute('xlink:href') || u.getAttribute('href') || '';
            if (href.includes('icon-selected') || href.includes('icon-check-round') || href.includes('checkbox-checked')) {
                return true;
            }
        }

        const selectButtons = card.querySelectorAll(`
            button[class*="Select"],
            button[class*="select"],
            button[data-testid*="select"],
            button[data-testid*="Select"]
        `);
        for (const btn of selectButtons) {
            if (btn.getAttribute('aria-checked') === 'true' || btn.getAttribute('aria-pressed') === 'true') {
                return true;
            }
            const label = (btn.getAttribute('aria-label') || '').toLowerCase();
            if (label.includes('선택 해제') || label.includes('선택취소') || label.includes('deselect')) {
                return true;
            }
        }

        if (card.querySelector(`
            [class*="SelectedBadge"],
            [class*="selectedBadge"],
            [class*="SelectBadge"][class*="selected"],
            [class*="SelectBadge"][class*="Selected"],
            [class*="selectBadge"][class*="selected"],
            [class*="selectBadge"][class*="Selected"]
        `)) {
            return true;
        }

        if (card.matches('tr[class*="selected"], tr[class*="Selected"], tr[aria-selected="true"]')) {
            return true;
        }
        if (card.querySelector('input[type="checkbox"]:checked')) {
            return true;
        }

        const cardClass = card.className || '';
        if (typeof cardClass === 'string' && (cardClass.includes('isSelected') || cardClass.includes('is-selected'))) {
            return true;
        }

        return false;
    }

    // =========================================================================
    // Plex Web React Hook(depth 2, hIdx 11) 직결 기반 전역 선택 추출 엔진
    // =========================================================================

    // 현재 라이브러리 화면의 Plex Server ID를 보조 추출하는 헬퍼
    function getCurrentPageServerId() {
        const hash = window.location.hash || window.location.search || '';
        const match = hash.match(/\/server\/([a-f0-9]+)\//i);
        if (match) return match[1];

        const firstCard = document.querySelector('div[data-testid^="cellItem"], div[class*="ListItem-container"], tr[class*="TableRow-"]');
        if (firstCard) {
            const { sid } = extractCardLinkAndId(firstCard);
            if (sid) return sid;
        }

        return ServerConfig.SERVERS[0]?.machineIdentifier || null;
    }

    // Plex 다중 선택 상단 바의 Hook 메모리로부터 선택된 모든 아이템 객체 목록을 직결 추출하는 함수
    function getSelectedItemsFromPlexHeader() {
        const win = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
        const headerEl = win.document.querySelector('div[class*="PageHeaderMultiselectActions-"]');
        if (!headerEl) return [];

        const fKey = Object.keys(headerEl).find(k => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'));
        if (!fKey || !headerEl[fKey]) return [];

        let cur = headerEl[fKey];
        for (let depth = 0; depth < 10 && cur; depth++) {
            let hook = cur.memoizedState;
            let hIdx = 0;
            while (hook && hIdx < 30) {
                const val = hook.memoizedState;
                // 배열 형태이면서 내부 원소에 metadataItem 객체가 담겨 있는지 확인
                if (Array.isArray(val) && val.length > 0 && val[0]?.metadataItem) {
                    const items = [];
                    for (const entry of val) {
                        const meta = entry.metadataItem;
                        const srv = entry.server;
                        if (meta && meta.ratingKey) {
                            items.push({
                                id: String(meta.ratingKey),
                                serverId: srv?.machineIdentifier || null,
                                title: meta.title || `Item ${meta.ratingKey}`,
                                cont: null
                            });
                        }
                    }
                    if (items.length > 0) {
                        log(`[Multi-Select] 🎯 Plex Hook 체인(depth:${depth}, hIdx:${hIdx})에서 선택 아이템 ${items.length}건 직결 추출 성공!`);
                        return items;
                    }
                }
                hook = hook.next;
                hIdx++;
            }
            cur = cur.return;
        }
        return [];
    }

    // 최종 선택 항목을 검증 집계하는 통합 함수
    function getSelectedPlexItems() {
        const itemsMap = new Map();
        const currentSid = getCurrentPageServerId();

        // Plex 내부 Hook 메모리에서 실제 선택된 전체 아이템 목록 직결 추출
        const plexSelectedItems = getSelectedItemsFromPlexHeader();

        if (plexSelectedItems.length > 0) {
            plexSelectedItems.forEach(item => {
                const sid = item.serverId || currentSid;
                itemsMap.set(item.id, { ...item, serverId: sid });
            });
        }

        // 현재 DOM에 마운트된 카드들을 대조하여 실시간 상태 뱃지용 컨테이너(cont) 매핑
        const allCandidateCards = document.querySelectorAll(`
            div[data-testid^="cellItem"],
            div[class*="ListItem-container"],
            div[class*="MetadataPosterCard-container"],
            div[class*="MetadataThumbCard-container"],
            div[class*="ThumbCard-container"],
            div[class*="PosterCard-container"],
            div[class*="HubItem-"],
            tr[class*="TableRow-"]
        `);

        allCandidateCards.forEach(card => {
            const parentCell = card.parentElement?.closest('div[data-testid^="cellItem"], div[class*="ListItem-container"], tr[class*="TableRow-"]');
            if (parentCell && parentCell !== card) return;

            const { link, sid, iid, href } = extractCardLinkAndId(card);
            if (!link || !iid || isIgnoredItem(href, iid, card)) return;

            const strId = String(iid);

            // Hook에서 추출된 목록에 존재하는 카드라면 화면상의 엘리먼트(cont) 연결
            if (itemsMap.has(strId)) {
                itemsMap.get(strId).cont = card;
            } else if (plexSelectedItems.length === 0 && isSelectedCard(card)) {
                let title = card.querySelector('[class*="Title"], a[aria-label]')?.textContent?.trim() || `Item ${strId}`;
                itemsMap.set(strId, { id: strId, serverId: sid || currentSid, title: title, cont: card });
            }
        });

        const resultItems = Array.from(itemsMap.values());
        infoLog(`[Multi-Select] 다중 선택 항목 최종 집계 완료: 총 ${resultItems.length}건 (Plex Native Hook 연동)`);
        return resultItems;
    }

    // 작업 시작 후 Plex의 다중 선택 상태 초기화
    function clearPlexSelection() {
        const deselectBtn = document.querySelector(`
            div[class*="PageHeaderMultiselectActions-deselect-"] button,
            button:has(svg#plex-icon-remove-560),
            button:has(use[*|href*="remove"]),
            button:has(use[*|href*="close"]),
            div[class*="SelectionHeader"] button[aria-label*="취소"],
            button[data-testid="selection-cancel"],
            button[aria-label*="선택 해제"],
            button[aria-label*="Deselect"]
        `);
        if (deselectBtn) {
            deselectBtn.click();
            return;
        }

        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, code: 'Escape', bubbles: true }));
    }

    async function executePmhBatchAction(actionType) {
        const selectedItems = getSelectedPlexItems();
        if (selectedItems.length === 0) {
            toastr.warning("선택된 항목의 정보를 찾을 수 없습니다.");
            return;
        }

        let actionName = '';
        let apiAction = '';
        let extraData = {};

        if (actionType === 'clean_match') {
            actionName = '클린 리매칭'; apiAction = 'match';
            extraData = { _try_refresh_first: false, _do_unmatch_first: true };
        } else if (actionType === 'rematch') {
            actionName = '일반 리매칭'; apiAction = 'match';
            extraData = { _try_refresh_first: false, _do_unmatch_first: false };
        } else if (actionType === 'refresh') {
            actionName = '메타 새로고침'; apiAction = 'refresh';
        } else if (actionType === 'analyze') {
            actionName = '미디어 분석'; apiAction = 'analyze';
        }

        infoLog(`[Multi-Select] 🚀 선택된 ${selectedItems.length}개 항목에 대해 [${actionName}] 일괄 전송 시작`);

        clearPlexSelection();

        window._pmh_media_queues = window._pmh_media_queues || {};
        for (const item of selectedItems) {
            window._pmh_media_queues[item.id] = {
                task_id: 'pending', start_time: Date.now(), state: 'requesting',
                title: item.title, server_id: item.serverId
            };
            updateQueueBadgeInDOM(item.id, 'requesting');
        }
        if (typeof window.saveQueueState === 'function') window.saveQueueState();

        const itemsByServer = {};
        selectedItems.forEach(item => {
            if (!itemsByServer[item.serverId]) itemsByServer[item.serverId] = [];
            itemsByServer[item.serverId].push(item);
        });

        for (const [serverId, srvItems] of Object.entries(itemsByServer)) {
            const srvConfig = getServerConfig(serverId);
            if (!srvConfig) continue;

            const itemIds = srvItems.map(i => i.id);
            const payload = {
                item_ids: itemIds,
                ...extraData
            };

            try {
                const res = await makeRequest(`${srvConfig.relayUrl}/media/${itemIds.join(',')}/${apiAction}`, 'POST', payload, ClientSettings.masterApiKey);
                
                if (res && res.status === 'queued' && Array.isArray(res.tasks)) {
                    res.tasks.forEach(t => {
                        if (window._pmh_media_queues[t.item_id]) {
                            window._pmh_media_queues[t.item_id].task_id = t.task_id;
                            
                            if (window._pmh_media_queues[t.item_id].state !== 'processing' && window._pmh_media_queues[t.item_id].state !== 'completed') {
                                window._pmh_media_queues[t.item_id].state = 'queued';
                                updateQueueBadgeInDOM(t.item_id, 'queued');
                            }
                        }
                    });
                }
            } catch (err) {
                srvItems.forEach(item => {
                    delete window._pmh_media_queues[item.id];
                    updateQueueBadgeInDOM(item.id, 'error');
                    revertQueueBadgeToOriginal(item.id, item.serverId);
                });
            }

            if (typeof window.startQueuePolling === 'function') {
                window.startQueuePolling(serverId);
            }
        }

        if (typeof window.saveQueueState === 'function') window.saveQueueState();
    }

    function checkAndInjectMultiSelectBar() {
        const selectionContainer = document.querySelector('div[class*="PageHeaderMultiselectActions-container-"], div[class*="PageHeaderMultiselectActions-"]');

        if (!selectionContainer) {
            const existingBtn = document.getElementById('pmh-multiselect-trigger');
            if (existingBtn) existingBtn.remove();
            return;
        }

        if (document.getElementById('pmh-multiselect-trigger')) return;

        const actionsContainer = selectionContainer.querySelector('div[class*="PageHeaderMultiselectActions-actions-"]') || selectionContainer;

        const triggerBtn = document.createElement('button');
        triggerBtn.type = 'button';
        triggerBtn.id = 'pmh-multiselect-trigger';
        triggerBtn.className = 'pmh-multiselect-trigger-btn';
        triggerBtn.innerHTML = `
            <i class="fas fa-magic" style="color:#e5a00d;"></i>
            <span>PMH</span>
            <i class="fas fa-chevron-down" style="font-size:9px; color:#888; margin-left:2px;"></i>
        `;

        if (actionsContainer.firstChild) {
            actionsContainer.insertBefore(triggerBtn, actionsContainer.firstChild);
        } else {
            actionsContainer.appendChild(triggerBtn);
        }
    }

    // ==========================================
    // 상세 모드 (Detail View) 처리
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
            } else {
                injectDetailPosterToolbar(data, serverId, srvConfig);
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
                        pathLinkHtml = `<a href="#" class="plex-path-scan-link" data-path="${serverPath}" data-section-id="${data.librarySectionID}" data-type="directory" title="클릭: 단순 스캔 / Shift+클릭: VFS/Refresh + 스캔" style="color:#9E9E9E; text-decoration:none; transition:0.2s;" onmouseover="this.style.color='#fff'; this.style.textDecoration='underline';" onmouseout="this.style.color='#9E9E9E'; this.style.textDecoration='none';">${displayPath}</a>`;
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
            <a href="#" id="pmh-btn-rematch" style="color: #adb5bd; text-decoration: none; transition: 0.2s;" title="언매칭 없이 일반 리매칭을 시도합니다." onmouseover="this.style.color='#fff'" onmouseout="this.style.color='#adb5bd'"><i class="fas fa-link" style="font-size: 10px; margin-right: 2px;"></i>일반 리매칭</a>
            <span style="opacity: 0.3; color: #adb5bd; margin: 0 4px;">|</span>
            <a href="#" id="pmh-btn-clean-match" style="color: #adb5bd; text-decoration: none; transition: 0.2s;" title="현재 메타데이터를 언매치 후 클린 리매칭합니다." onmouseover="this.style.color='#f89406'" onmouseout="this.style.color='#adb5bd'"><i class="fas fa-broom" style="font-size: 10px; margin-right: 2px;"></i>클린 리매칭</a>
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

        const targetItemId = data.itemId || extractIds().itemId;

        const btnRematch = document.getElementById('pmh-btn-rematch');
        if (btnRematch) {
            btnRematch.addEventListener('click', async (e) => {
                e.preventDefault(); e.stopPropagation();

                if (!plexSrv) return toastr.error("토큰을 찾을 수 없습니다.");
                if (!targetItemId) return toastr.error("대상 아이템 ID를 확인할 수 없습니다.");

                const originalHtml = `<i class="fas fa-link" style="font-size: 10px; margin-right: 2px;"></i>일반 리매칭`;
                const originalTitle = "언매칭 없이 일반 리매칭을 시도합니다.";

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
                btnRematch.title = "클릭시 대기 취소";
                showBoxLoading();
                
                infoLog(`[Detail] Foreground Meta Rematch requested for Item: ${targetItemId}`);

                const matchOptions = {
                    _try_refresh_first: false,
                    _do_unmatch_first: false,
                    _skip_sim_check: ClientSettings.matchSkipSimCheck,
                    _use_custom_score: ClientSettings.useCustomScore,
                    _custom_agent_score: ClientSettings.customAgentScore,
                    _manual_match: ClientSettings.manualMatch
                };

                let isRematchSuccess = false;
                try {
                    const res = await makeRequest(`${srvConfig.relayUrl}/media/${targetItemId}/match`, 'POST', matchOptions, ClientSettings.masterApiKey, btnRematch.cancelToken);

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
                        errorLog(`[Detail] Rematch failed for Item: ${targetItemId}. Reason: ${err.message}`);
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
                        deleteMemoryCache(`D_${serverId}_${targetItemId}`);
                        currentDisplayedItemId = null;
                        processDetail(true);
                        smartRefreshChildren();
                    }
                }
            });
        }

        const btnCleanMatch = document.getElementById('pmh-btn-clean-match');
        if (btnCleanMatch) {
            btnCleanMatch.addEventListener('click', async (e) => {
                e.preventDefault(); e.stopPropagation();

                if (!plexSrv) return toastr.error("토큰을 찾을 수 없습니다.");
                if (!targetItemId) return toastr.error("대상 아이템 ID를 확인할 수 없습니다.");

                const originalHtml = `<i class="fas fa-broom" style="font-size: 10px; margin-right: 2px;"></i>클린 리매칭`;
                const originalTitle = "현재 메타데이터를 언매치 후 클린 리매칭합니다.";
                
                if (btnCleanMatch.dataset.refreshing === 'true') {
                    abortDetailRefresh = true;
                    btnCleanMatch.innerHTML = `<i class="fas fa-times" style="font-size: 10px; margin-right: 2px;"></i>취소됨`;
                    btnCleanMatch.title = "";

                    if (btnCleanMatch.cancelToken && btnCleanMatch.cancelToken.abort) {
                        btnCleanMatch.cancelToken.abort();
                    }

                    hideBoxLoading();
                    toastr.warning("메타 리매칭이 취소되었습니다.", "취소됨", {timeOut: 2000});

                    setTimeout(() => {
                        if (btnCleanMatch.isConnected) {
                            btnCleanMatch.innerHTML = originalHtml;
                            btnCleanMatch.title = originalTitle;
                            delete btnCleanMatch.dataset.refreshing;
                        }
                    }, 1500);
                    return;
                }

                abortDetailRefresh = false;
                btnCleanMatch.dataset.refreshing = 'true';
                btnCleanMatch.cancelToken = {};

                btnCleanMatch.innerHTML = `<i class="fas fa-spinner fa-spin" style="font-size: 10px; margin-right: 2px;"></i>리매칭 진행중`;
                btnCleanMatch.title = "클릭시 대기 취소";
                showBoxLoading();
                
                infoLog(`[Detail] Foreground Clean Rematch requested for Item: ${targetItemId}`);

                const matchOptions = {
                    _try_refresh_first: false,
                    _do_unmatch_first: true,
                    _skip_sim_check: ClientSettings.matchSkipSimCheck,
                    _use_custom_score: ClientSettings.useCustomScore,
                    _custom_agent_score: ClientSettings.customAgentScore,
                    _manual_match: ClientSettings.manualMatch
                };

                let isRematchSuccess = false;
                try {
                    const res = await makeRequest(`${srvConfig.relayUrl}/media/${targetItemId}/match`, 'POST', matchOptions, ClientSettings.masterApiKey, btnCleanMatch.cancelToken);

                    if (res.status === 'queued') {
                        await waitQueueTask(res.task_id, srvConfig);
                    }

                    if (globalAbortFlag || renderSessionAtClick !== currentRenderSession || abortDetailRefresh) throw new Error("Cancelled");

                    isRematchSuccess = true;
                    toastr.success("클린 리매칭 완료!<br>잠시 후 UI에 반영됩니다.", "성공", {timeOut: 4000});

                } catch (err) {
                    if (err.message === "Cancelled" || err.message === "Aborted") {
                        infoLog(`[Detail] Clean Rematch process cancelled.`);
                    } else {
                        toastr.error(`${err.message}`, "매칭 실패", {timeOut: 5000});
                        errorLog(`[Detail] Clean Rematch failed for Item: ${targetItemId}. Reason: ${err.message}`);
                    }

                    hideBoxLoading();
                    if (btnCleanMatch.isConnected) {
                        btnCleanMatch.innerHTML = originalHtml;
                        btnCleanMatch.title = originalTitle;
                        delete btnCleanMatch.dataset.refreshing;
                    }
                } finally {
                    if (isRematchSuccess && !globalAbortFlag && renderSessionAtClick === currentRenderSession && !abortDetailRefresh) {
                        invalidateVisibleCaches(serverId);
                        deleteMemoryCache(`D_${serverId}_${targetItemId}`);
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

                if (!e.pmhMenuAction) {
                    showMenu(el); return;
                }

                const menuAction = e.pmhMenuAction;
                const isVfsScan = (menuAction === 'scan_vfs');

                let scanPath = el.dataset.path;
                infoLog(`[PlexMate] VFS/Library Scan requested for path: ${scanPath} (VFS_Refresh: ${isVfsScan})`);
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
                    if (isVfsScan) {
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

        // 포스터 하단 액션 툴바(갤러리, 크롭, DB수정) 주입 호출
        injectDetailPosterToolbar(data, serverId, srvConfig);
    }

    // Plex 트레일러 ID를 받아 PMH 비디오 모달로 재생하는 공용 헬퍼
    async function playTrailerInModal(trailerId, title, plexSrv) {
        if (!trailerId || !plexSrv) return;
        showVideoModal("", title);

        try {
            const metaRes = await new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: `${plexSrv.url}/library/metadata/${trailerId}?X-Plex-Token=${plexSrv.token}`,
                    headers: { 'Accept': 'application/json' },
                    timeout: 8000,
                    onload: (r) => {
                        if (r.status === 200) {
                            try { resolve(JSON.parse(r.responseText)); }
                            catch (err) { reject(err); }
                        } else {
                            reject(new Error(`Plex API 응답 오류 (HTTP ${r.status})`));
                        }
                    },
                    onerror: () => reject(new Error("Plex 서버 통신 실패")),
                    ontimeout: () => reject(new Error("Plex 서버 응답 시간 초과"))
                });
            });

            const trailerMeta = metaRes?.MediaContainer?.Metadata?.[0];
            const part = trailerMeta?.Media?.[0]?.Part?.[0];

            if (!part || !part.key) {
                throw new Error("트레일러 미디어 스트림 키를 찾지 못했습니다.");
            }

            let trailerStreamUrl = String(part.key).trim();
            if (!trailerStreamUrl.startsWith('http://') && !trailerStreamUrl.startsWith('https://')) {
                const streamPath = trailerStreamUrl.startsWith('/') ? trailerStreamUrl : `/${trailerStreamUrl}`;
                const delimiter = streamPath.includes('?') ? '&' : '?';
                trailerStreamUrl = `${plexSrv.url}${streamPath}${delimiter}X-Plex-Token=${plexSrv.token}`;
            }

            setVideoModalSource(trailerStreamUrl, title);
        } catch (err) {
            errorLog(`[Trailer Modal] 재생 오류:`, err);
            setVideoModalError(`예고편을 불러오지 못했습니다: ${err.message || err}`);
        }
    }

    // 상세페이지 Plex 포스터 카드 하단 전용 액션 툴바
    function injectDetailPosterToolbar(data, serverId, srvConfig) {
        const isCropAllowed = isAvMediaItem(data.guid, data.librarySectionID, serverId, data.type);
        const isMetaDbAllowed = isFfMetaDbActive(serverId, data.guid);

        if (!isCropAllowed && !isMetaDbAllowed) {
            log(`[Detail UI] 크롭 및 FF Meta DB 비대상 미디어로 툴바 주입 스킵 (ID: ${data.itemId}, GUID: ${data.guid})`);
            return;
        }

        const attachToolbar = () => {
            const existingToolbar = document.getElementById('pmh-detail-poster-toolbar');
            if (existingToolbar && existingToolbar.dataset.itemId === String(data.itemId)) return true;
            if (existingToolbar) existingToolbar.remove();

            const posterCard = document.querySelector('div[class*="MetadataSimplePosterCard-card-"], div[class*="PosterCard-card-"], div[data-testid="preplay-poster"]');
            if (!posterCard) return false;

            infoLog(`[Detail UI] 포스터 하단 액션 툴바 주입 시작 (Item ID: ${data.itemId}, 크롭: ${isCropAllowed}, 메타DB: ${isMetaDbAllowed})`);

            let buttonCount = 0;
            if (isMetaDbAllowed) buttonCount += 2;
            if (isCropAllowed) buttonCount += 1;
            const gridCols = (buttonCount === 3) ? 'repeat(3, 1fr)' : ((buttonCount === 2) ? 'repeat(2, 1fr)' : '1fr');

            const toolbar = document.createElement('div');
            toolbar.id = 'pmh-detail-poster-toolbar';
            toolbar.dataset.itemId = String(data.itemId);
            toolbar.style.cssText = `
                display: grid;
                grid-template-columns: ${gridCols};
                gap: 5px;
                width: ${posterCard.offsetWidth || 250}px;
                margin-top: 8px;
                box-sizing: border-box;
                user-select: none;
            `;

            const btnStyle = `
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 5px;
                padding: 6px 0;
                background: rgba(20, 23, 26, 0.95);
                border: 1px solid #444;
                border-radius: 4px;
                color: #ccc;
                font-size: 11.5px;
                font-weight: bold;
                text-decoration: none !important;
                cursor: pointer;
                transition: background 0.2s, border-color 0.2s, color 0.2s;
                white-space: nowrap;
            `;

            let buttonsHtml = '';
            if (isMetaDbAllowed) {
                buttonsHtml += `
                    <a href="#" class="pmh-poster-tool-btn" id="pmh-ptool-gallery" style="${btnStyle}" title="이미지 갤러리 라이트박스를 엽니다.">
                        <i class="fas fa-images" style="color:#e5a00d;"></i>갤러리
                    </a>`;
            }
            if (isCropAllowed) {
                buttonsHtml += `
                    <a href="#" class="pmh-poster-tool-btn" id="pmh-ptool-crop" style="${btnStyle}" title="포스터 크롭 에디터를 엽니다.">
                        <i class="fas fa-crop-alt" style="color:#2f96b4;"></i>크롭
                    </a>`;
            }
            if (isMetaDbAllowed) {
                buttonsHtml += `
                    <a href="#" class="pmh-poster-tool-btn" id="pmh-ptool-db" style="${btnStyle}" title="FF 메타데이터 DB 편집창을 엽니다.">
                        <i class="fas fa-database" style="color:#51a351;"></i>DB수정
                    </a>`;
            }
            toolbar.innerHTML = buttonsHtml;

            toolbar.querySelectorAll('.pmh-poster-tool-btn').forEach(btn => {
                btn.addEventListener('mouseenter', () => {
                    btn.style.borderColor = '#e5a00d';
                    btn.style.color = '#fff';
                    btn.style.background = 'rgba(255,255,255,0.1)';
                });
                btn.addEventListener('mouseleave', () => {
                    btn.style.borderColor = '#444';
                    btn.style.color = '#ccc';
                    btn.style.background = 'rgba(20, 23, 26, 0.95)';
                });
            });

            // 갤러리 버튼
            const btnGallery = toolbar.querySelector('#pmh-ptool-gallery');
            if (btnGallery) {
                btnGallery.onclick = async (e) => {
                    e.preventDefault(); e.stopPropagation();
                    const cleanCode = extractSjvaAgentCode(data.guid);
                    const moduleName = getFfModuleFromCode(cleanCode);
                    const catMap = { 'jav_censored': 'JAV_CEN', 'jav_uncensored': 'JAV_UNCEN', 'western': 'WESTERN' };
                    const cat = catMap[moduleName] || 'JAV_CEN';

                    toastr.info(`[${cleanCode}] 갤러리 이미지를 조회하고 있습니다...`);
                    try {
                        const res = await PmhFfBridge.callMetaApi(srvConfig, 'get_meta_by_code', cleanCode, cat);
                        const resCode = res?.data?.code || '';
                        const isExactMatch = (resCode.toLowerCase() === cleanCode.toLowerCase());

                        if (!res || res.ret !== 'success' || !res.data || !isExactMatch) {
                            toastr.warning(`FF DB에 [${cleanCode}] 메타데이터가 존재하지 않습니다.`);
                            return;
                        }

                        const row = res.data;
                        let jd = row.json_data;
                        if (typeof jd === 'string') { try { jd = JSON.parse(jd); } catch (err) { jd = {}; } }
                        const gallery = buildGalleryListFromRow(row, jd, srvConfig);
                        if (gallery.length > 0) {
                            const proxyGallery = gallery.map(item => ({
                                ...item,
                                url: getFfMediaProxyUrl(srvConfig, item.url, row.site, 'image', cat)
                            }));
                            openImageEnlargeModal(proxyGallery, 0, `[${cleanCode}] ${row.title || ''}`);
                        } else {
                            toastr.warning("등록된 갤러리 이미지가 없습니다.");
                        }
                    } catch (err) {
                        errorLog("[Poster Toolbar] 갤러리 로드 실패:", err);
                        toastr.error("갤러리를 불러오지 못했습니다.");
                    }
                };
            }

            // 크롭 버튼
            const btnCrop = toolbar.querySelector('#pmh-ptool-crop');
            if (btnCrop) {
                btnCrop.onclick = (e) => {
                    e.preventDefault(); e.stopPropagation();
                    const itemTitle = document.querySelector('h1[data-testid="metadata-title"], [class*="MetadataTitle"]')?.textContent?.trim() || '';
                    openPosterCropModal(data.itemId, serverId, data.guid, itemTitle);
                };
            }

            // DB수정 버튼
            const btnDb = toolbar.querySelector('#pmh-ptool-db');
            if (btnDb) {
                btnDb.onclick = (e) => {
                    e.preventDefault(); e.stopPropagation();
                    const itemTitle = document.querySelector('h1[data-testid="metadata-title"], [class*="MetadataTitle"]')?.textContent?.trim() || '';
                    openPmhMetaDbModal(data.itemId, serverId, data.guid, itemTitle);
                };
            }

            posterCard.insertAdjacentElement('afterend', toolbar);
            return true;
        };

        if (!attachToolbar()) {
            let retryCount = 0;
            const timer = setInterval(() => {
                retryCount++;
                if (attachToolbar() || retryCount > 10) {
                    clearInterval(timer);
                }
            }, 250);
        }
    }

    // 순수 로컬 서버 이미지 여부 판별 헬퍼
    function isLocalServerMediaUrl(url, srvConfig) {
        if (!url || typeof url !== 'string') return false;
        const clean = url.trim();
        if (!clean || clean.includes('/metadata/normal/')) return false;

        let imgServerUrl = (srvConfig && srvConfig.av_image_server_url) ? srvConfig.av_image_server_url : '';
        if (!imgServerUrl && srvConfig && srvConfig.machineIdentifier && window._pmh_latest_ping_results) {
            imgServerUrl = window._pmh_latest_ping_results[srvConfig.machineIdentifier]?.av_image_server_url || '';
        }
        if (!imgServerUrl && ServerConfig.SERVERS && ServerConfig.SERVERS.length > 0) {
            imgServerUrl = ServerConfig.SERVERS[0]?.av_image_server_url || '';
        }
        imgServerUrl = (imgServerUrl || '').trim().replace(/\/+$/, '');

        if (imgServerUrl && clean.startsWith(imgServerUrl)) {
            return true;
        }

        return false;
    }

    // FF 메타데이터 json_data 및 row로부터 갤러리 목록 집계
    function buildGalleryListFromRow(row, jd, srvConfig) {
        const item_gallery = [];
        const added_keys = new Set();
        jd = jd || {};

        let list_p_url = '';
        let list_pl_url = '';

        if (jd.thumb && Array.isArray(jd.thumb)) {
            const p_item = jd.thumb.find(t => t && t.aspect === 'poster');
            if (p_item && p_item.value) list_p_url = p_item.value;
            const pl_item = jd.thumb.find(t => t && t.aspect === 'landscape');
            if (pl_item && pl_item.value) list_pl_url = pl_item.value;
        }
        if (!list_p_url && row.poster_url) list_p_url = row.poster_url;

        const orig_thumb = (jd.original && jd.original.thumb) ? jd.original.thumb : {};
        const raw_site_p = orig_thumb.poster || '';
        const raw_site_pl = orig_thumb.landscape || '';

        if (list_p_url && !added_keys.has(list_p_url)) {
            const isLocalP = isLocalServerMediaUrl(list_p_url, srvConfig);
            item_gallery.push({
                url: list_p_url,
                type: isLocalP ? 'Poster' : 'Poster (Site)',
                is_final: isLocalP
            });
            added_keys.add(list_p_url);
        }

        if (list_pl_url && !added_keys.has(list_pl_url)) {
            const isLocalPl = isLocalServerMediaUrl(list_pl_url, srvConfig);
            item_gallery.push({
                url: list_pl_url,
                type: isLocalPl ? 'Landscape' : 'Landscape (Site)',
                is_final: isLocalPl
            });
            added_keys.add(list_pl_url);
        }

        const localFanarts = (jd.fanart && Array.isArray(jd.fanart)) ? jd.fanart : [];
        localFanarts.forEach((fa_url, fa_i) => {
            if (fa_url && !added_keys.has(fa_url)) {
                const isLocalFa = isLocalServerMediaUrl(fa_url, srvConfig);
                item_gallery.push({
                    url: fa_url,
                    type: isLocalFa ? `Local Art #${fa_i + 1}` : `Art #${fa_i + 1}`,
                    is_final: isLocalFa
                });
                added_keys.add(fa_url);
            }
        });

        if (raw_site_p && !added_keys.has(raw_site_p)) {
            item_gallery.push({ url: raw_site_p, type: 'Poster (Site)', is_final: false });
            added_keys.add(raw_site_p);
        }

        if (raw_site_pl && !added_keys.has(raw_site_pl)) {
            item_gallery.push({ url: raw_site_pl, type: 'Landscape (Site)', is_final: false });
            added_keys.add(raw_site_pl);
        }

        const origFanarts = (jd.original && Array.isArray(jd.original.fanart)) ? jd.original.fanart : [];
        origFanarts.forEach((ofa_url, ofa_i) => {
            if (ofa_url && !added_keys.has(ofa_url)) {
                item_gallery.push({ url: ofa_url, type: `Site Art #${ofa_i + 1}`, is_final: false });
                added_keys.add(ofa_url);
            }
        });

        return item_gallery;
    }

    // 이미지 갤러리 라이트박스 모달
    function openImageEnlargeModal(galleryInput, initialIdx = 0, titleText = '이미지 갤러리') {
        let gallery = [];
        if (typeof galleryInput === 'string') {
            gallery = [{ url: galleryInput, type: 'Image', is_final: true }];
        } else if (Array.isArray(galleryInput)) {
            gallery = galleryInput.map(item => typeof item === 'string' ? { url: item, type: 'Image', is_final: true } : item);
        }
        if (gallery.length === 0) return;

        let curIdx = Math.max(0, Math.min(initialIdx, gallery.length - 1));

        const oldLightbox = document.getElementById('pmh-lightbox-modal');
        if (oldLightbox) oldLightbox.remove();

        // 최상위 z-index 보장
        window._pmh_top_z_index = (window._pmh_top_z_index || 10000050) + 20;
        const currentZIndex = window._pmh_top_z_index;

        const m = document.createElement('div');
        m.id = 'pmh-lightbox-modal';
        m.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
            background: rgba(0, 0, 0, 0.94); z-index: ${currentZIndex};
            display: flex; flex-direction: column; justify-content: space-between;
            align-items: center; user-select: none; box-sizing: border-box;
            backdrop-filter: blur(8px);
        `;

        m.innerHTML = `
            <div style="width: 100%; padding: 12px 20px; display: flex; justify-content: space-between; align-items: center; background: rgba(10, 12, 14, 0.85); border-bottom: 1px solid rgba(255,255,255,0.1); flex-shrink: 0; box-sizing: border-box;">
                <div style="display: flex; align-items: center; gap: 10px; min-width: 0;">
                    <span style="color: #e5a00d; font-weight: bold; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;"><i class="fas fa-images" style="margin-right: 6px;"></i>${titleText}</span>
                    <span id="pmh-lightbox-badge" style="font-size: 11px; padding: 2px 8px; border-radius: 4px; font-weight: bold; background: #2f96b4; color: #fff; flex-shrink: 0;"></span>
                </div>
                <div style="display: flex; align-items: center; gap: 15px; flex-shrink: 0;">
                    <span id="pmh-lightbox-counter" style="font-size: 13px; font-weight: bold; color: #e5a00d;">1 / 1</span>
                    <a href="#" id="pmh-lightbox-orig" target="_blank" style="color: #2f96b4; font-size: 12px; text-decoration: none;" title="새 탭에서 원본 열기"><i class="fas fa-external-link-alt"></i></a>
                    <button type="button" id="pmh-lightbox-close" style="background: none; border: none; color: #ccc; font-size: 20px; cursor: pointer; padding: 0 4px; transition: color 0.2s;" onmouseover="this.style.color='#fff'" onmouseout="this.style.color='#ccc'"><i class="fas fa-times"></i></button>
                </div>
            </div>

            <div id="pmh-lightbox-stage" style="flex-grow: 1; width: 100%; display: flex; justify-content: center; align-items: center; position: relative; overflow: hidden; min-height: 0;">
                <!-- FontAwesome JS 간섭을 받지 않는 순수 CSS 로더 -->
                <div id="pmh-lightbox-spinner" class="pmh-css-spinner" style="display: none;"></div>
                <img id="pmh-lightbox-img" referrerpolicy="no-referrer" src="" style="max-width: 92vw; max-height: 84vh; object-fit: contain; opacity: 0; transition: opacity 0.15s ease-in-out; box-shadow: 0 0 35px rgba(0,0,0,0.9); border-radius: 4px;" alt="Gallery View">
                
                <button type="button" id="pmh-lightbox-prev" style="position: absolute; left: 20px; top: 50%; transform: translateY(-50%); background: rgba(20,23,26,0.7); border: 1px solid #444; border-radius: 50%; width: 48px; height: 48px; color: #fff; font-size: 20px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: background 0.2s; z-index: 3;" onmouseover="this.style.background='rgba(229,160,13,0.85)'" onmouseout="this.style.background='rgba(20,23,26,0.7)'">
                    <i class="fas fa-chevron-left"></i>
                </button>
                <button type="button" id="pmh-lightbox-next" style="position: absolute; right: 20px; top: 50%; transform: translateY(-50%); background: rgba(20,23,26,0.7); border: 1px solid #444; border-radius: 50%; width: 48px; height: 48px; color: #fff; font-size: 20px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: background 0.2s; z-index: 3;" onmouseover="this.style.background='rgba(229,160,13,0.85)'" onmouseout="this.style.background='rgba(20,23,26,0.7)'">
                    <i class="fas fa-chevron-right"></i>
                </button>
            </div>

            <div style="width: 100%; padding: 8px 20px; font-size: 11.5px; color: #777; display: flex; justify-content: center; background: rgba(10, 12, 14, 0.85); border-top: 1px solid rgba(255,255,255,0.08); flex-shrink: 0;">
                <span><i class="fas fa-info-circle" style="margin-right: 4px;"></i>좌우 방향키로 탐색 | 배경 클릭 또는 ESC: 닫기</span>
            </div>
        `;
        document.body.appendChild(m);

        const img = m.querySelector('#pmh-lightbox-img');
        const badge = m.querySelector('#pmh-lightbox-badge');
        const counter = m.querySelector('#pmh-lightbox-counter');
        const openOrig = m.querySelector('#pmh-lightbox-orig');
        const prevBtn = m.querySelector('#pmh-lightbox-prev');
        const nextBtn = m.querySelector('#pmh-lightbox-next');

        let activeRenderId = 0;

        const renderItem = (idx) => {
            curIdx = (idx + gallery.length) % gallery.length;
            const item = gallery[curIdx];
            const currentRenderId = ++activeRenderId;

            const spinner = m.querySelector('#pmh-lightbox-spinner');
            if (spinner) spinner.style.display = 'block';
            img.style.opacity = '0';

            const finishLoad = (success) => {
                if (currentRenderId !== activeRenderId) return;
                const sp = m.querySelector('#pmh-lightbox-spinner');
                if (sp) sp.style.display = 'none';
                img.style.opacity = success ? '1' : '0.2';
            };

            img.onload = () => finishLoad(true);
            img.onerror = () => finishLoad(false);

            img.src = item.url;
            if (img.complete) {
                finishLoad(img.naturalWidth > 0);
            }

            counter.innerText = `${curIdx + 1} / ${gallery.length}`;
            badge.innerText = item.type || 'Image';
            badge.style.background = item.is_final ? '#2f96b4' : '#555';
            openOrig.href = item.url;

            if (gallery.length <= 1) {
                prevBtn.style.display = 'none';
                nextBtn.style.display = 'none';
            } else {
                prevBtn.style.display = 'flex';
                nextBtn.style.display = 'flex';
            }
        };

        prevBtn.onclick = (e) => { e.preventDefault(); e.stopPropagation(); renderItem(curIdx - 1); };
        nextBtn.onclick = (e) => { e.preventDefault(); e.stopPropagation(); renderItem(curIdx + 1); };

        const closeLightbox = () => {
            document.removeEventListener('keydown', handleKeyNav, true);
            m.remove();
        };

        m.querySelector('#pmh-lightbox-close').onclick = (e) => { e.preventDefault(); e.stopPropagation(); closeLightbox(); };
        m.onclick = (e) => {
            if (e.target === m || e.target.id === 'pmh-lightbox-stage') closeLightbox();
        };

        const handleKeyNav = (e) => {
            if (e.key === 'ArrowLeft') {
                e.preventDefault(); e.stopPropagation(); renderItem(curIdx - 1);
            } else if (e.key === 'ArrowRight') {
                e.preventDefault(); e.stopPropagation(); renderItem(curIdx + 1);
            } else if (e.key === 'Escape' || e.keyCode === 27) {
                e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); closeLightbox();
            }
        };
        document.addEventListener('keydown', handleKeyNav, true);

        renderItem(curIdx);
    }

    // ==========================================
    // 앱 라우팅(SPA) 및 Observer
    // ==========================================
    function checkUrlChange(force = false) {
        if (window.location.href !== currentUrl || force) {
            currentUrl = window.location.href;

            initViewportObserver();

            isObserverLocked = true;
            globalAbortFlag = true;

            currentRenderSession++;
            sessionRevalidated.clear();
            abortAllRequests();

            document.querySelectorAll('[data-pmh-observed]').forEach(e => e.removeAttribute('data-pmh-observed'));
            document.querySelectorAll('.pmh-render-marker, .pmh-top-right-wrapper, .plex-guid-list-box, .plex-list-multipath-badge, .pmh-guid-wrapper').forEach(e => e.remove());

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

        checkAndInjectMultiSelectBar();

        // 상세페이지 하단 허브의 '예고편' 텍스트 바로 옆에 인라인 모달 재생 아이콘 결속
        if (window.location.hash.includes('/details?key=')) {
            const trailerCells = document.querySelectorAll('div[data-testid="cellItem"]');
            trailerCells.forEach(cell => {
                if (cell.querySelector('.pmh-trailer-hub-btn')) return;

                const trailerSpan = Array.from(cell.querySelectorAll('span')).find(s => {
                    const t = (s.getAttribute('title') || s.textContent || '').trim();
                    return t === '예고편' || t.toLowerCase() === 'trailer';
                });
                if (!trailerSpan) return;

                const img = cell.querySelector('img[src*="metadata"]');
                if (!img) return;

                const decodedSrc = decodeURIComponent(img.src);
                const m = decodedSrc.match(/\/metadata\/(\d+)\/thumb/);
                const trailerId = m ? m[1] : null;
                if (!trailerId) return;

                const mainTitleEl = cell.querySelector('span[class*="MetadataPosterCardTitle"]:not([title="예고편"]):not([title="Trailer"])') || cell.querySelector('button[aria-label]');
                const mainTitle = mainTitleEl?.getAttribute('aria-label') || mainTitleEl?.getAttribute('title') || mainTitleEl?.textContent?.trim() || '예고편';

                const playBtn = document.createElement('a');
                playBtn.className = 'pmh-trailer-hub-btn';
                playBtn.style.cssText = 'color:#e5a00d; margin-left:6px; font-size:13px; text-decoration:none !important; cursor:pointer; display:inline-flex; align-items:center; justify-content:center; vertical-align:middle; line-height:1; position:relative; top:-1px; transition:transform 0.15s, color 0.15s;';
                playBtn.innerHTML = '<i class="fas fa-play-circle"></i>';
                playBtn.title = 'PMH 비디오 모달로 예고편 재생';

                playBtn.addEventListener('mouseenter', () => { playBtn.style.transform = 'scale(1.25)'; playBtn.style.color = '#ffc107'; });
                playBtn.addEventListener('mouseleave', () => { playBtn.style.transform = 'scale(1)'; playBtn.style.color = '#e5a00d'; });

                playBtn.onclick = (e) => {
                    e.preventDefault(); e.stopPropagation();
                    const { serverId } = extractIds();
                    const plexSrv = extractPlexServerInfo(serverId);
                    playTrailerInModal(trailerId, `${mainTitle} (예고편)`, plexSrv);
                };

                trailerSpan.appendChild(playBtn);
            });
        }

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
                    checkAndInjectMultiSelectBar();
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

        const toolDropdown = document.getElementById('pmh-tool-dropdown');
        if (toolDropdown) toolDropdown.style.display = 'none';

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
            <div id="pmh-client-settings-modal" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); z-index: 10000000; display: flex; justify-content: center; align-items: center; backdrop-filter: blur(5px);">
                <div class="pmh-modal-content" style="background: #1e2124; border: 1px solid #e5a00d; border-radius: 8px; width: 550px; max-width: 95vw; display: flex; flex-direction: column; box-shadow: 0 10px 30px rgba(0,0,0,0.8); position: relative;">
                    <div style="background: #111; padding: 15px; border-bottom: 1px solid #333; border-radius: 8px 8px 0 0; display: flex; justify-content: space-between; align-items: center; flex-shrink: 0;">
                        <h2 style="margin: 0; color: #e5a00d; font-size: 16px;"><i class="fas fa-cogs"></i> PMH 프론트엔드 설정</h2>
                        <button id="pmh-settings-close" style="background:none; border:none; color:#aaa; cursor:pointer; font-size:16px;"><i class="fas fa-times"></i></button>
                    </div>

                    <div style="padding: 20px; overflow-y: auto; max-height: 70vh;">
                        <div class="pmh-form-group">
                            <label class="pmh-form-label"><i class="fas fa-server"></i> 마스터 서버 주소 (Master URL)</label>
                            <div style="display:flex; gap:10px;">
                                <input type="text" id="pmh-set-master-url" class="pmh-input-text" value="${ClientSettings.masterUrl}" placeholder="http://127.0.0.1:8899" style="flex:1;">
                                <button id="pmh-settings-test" style="background:#2f96b4; color:#fff; border:none; border-radius:4px; padding:8px 14px; cursor:pointer; font-weight:bold; font-size:12px; white-space:nowrap; display:flex; align-items:center; gap:6px; transition:0.2s;" title="입력된 주소와 키로 마스터 서버 연결을 테스트합니다." onmouseover="this.style.background='#257991'" onmouseout="this.style.background='#2f96b4'"><i class="fas fa-plug"></i> 연결 테스트</button>
                            </div>
                        </div>

                        <div class="pmh-form-group">
                            <label class="pmh-form-label"><i class="fas fa-key"></i> 접속 키 (API Key)</label>
                            <div style="display:flex; gap:10px;">
                                <input type="password" id="pmh-set-api-key" class="pmh-input-text" value="${ClientSettings.masterApiKey}" placeholder="마스터 서버의 BASE.APIKEY 입력" style="flex:1;">
                                <button id="pmh-settings-copy-key" style="display:flex; justify-content:center; align-items:center; width:45px; background:#333; color:#aaa; border:1px solid #444; border-radius:4px; cursor:pointer; font-size:16px; transition:all 0.2s ease;" title="API Key를 클립보드에 복사합니다." onmouseover="this.style.color='#fff'; this.style.borderColor='#e5a00d'; this.style.background='rgba(229,160,13,0.1)';" onmouseout="this.style.color='#aaa'; this.style.borderColor='#444'; this.style.background='#333';"><i class="fas fa-copy"></i></button>
                            </div>
                            
                            <div id="pmh-settings-test-msg" style="margin-top:8px; padding:8px 12px; border-radius:4px; font-size:12px; line-height:1.4; display:none; background:rgba(0,0,0,0.3); border:1px solid #333;"></div>
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
                            <label class="pmh-check-label" style="color:#2f96b4; font-weight:bold; cursor:pointer; display:flex; align-items:center; gap:8px;" title="UI Core(JS/CSS)의 브라우저 캐싱을 끄고 새로고침(F5) 시마다 서버의 최신 소스를 실시간으로 읽어옵니다. (업데이트 확인 비활성화)">
                                <input type="checkbox" id="pmh-set-dev-mode" style="width:16px; height:16px; cursor:pointer;" ${ClientSettings.devMode ? 'checked' : ''}>
                                <i class="fas fa-laptop-code"></i> 프론트엔드 개발 모드 (에셋 캐시 비활성화 & 실시간 동기화)
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
                        <div style="display:flex; gap:8px;">
                            <button id="pmh-settings-factory-reset" style="padding: 8px 15px; background: #bd362f; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;" title="저장된 모든 PMH 프론트엔드 데이터를 영구 삭제합니다."><i class="fas fa-trash-alt"></i> 공장 초기화</button>
                            <button id="pmh-settings-clear-cache" style="padding: 8px 15px; background: #e5a00d; color: #1f1f1f; font-weight:bold; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;" title="메모리 캐시를 초기화하고 서버 코어 모듈을 재시작합니다."><i class="fas fa-broom"></i> 캐시 초기화</button>
                        </div>
                        <div>
                            <button id="pmh-settings-save" style="padding: 8px 22px; background: #51a351; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-weight:bold; font-size:13px; transition:0.2s;" onmouseover="this.style.background='#418541'" onmouseout="this.style.background='#51a351'"><i class="fas fa-save"></i> 저장 및 재시작</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);
        const settingsModal = document.getElementById('pmh-client-settings-modal');
        const settingsCloseBtn = document.getElementById('pmh-settings-close');

        const closeSettingsModal = () => {
            if (settingsModal) settingsModal.remove();
        };

        if (settingsCloseBtn) settingsCloseBtn.onclick = closeSettingsModal;

        if (settingsModal) {
            let isMouseDownOnSettingsBackdrop = false;

            settingsModal.onmousedown = (e) => {
                isMouseDownOnSettingsBackdrop = (e.target === settingsModal);
            };

            settingsModal.onmouseup = (e) => {
                if (isMouseDownOnSettingsBackdrop && e.target === settingsModal) {
                    closeSettingsModal();
                }
                isMouseDownOnSettingsBackdrop = false;
            };
        }

        const copyBtn = document.getElementById('pmh-settings-copy-key');
        copyBtn.onclick = (e) => {
            e.preventDefault();
            const keyInput = document.getElementById('pmh-set-api-key');
            if (!keyInput.value) { 
                toastr.warning("복사할 API Key가 없습니다."); 
                return; 
            }

            const showCopySuccess = () => {
                toastr.success("API Key가 클립보드에 복사되었습니다!");
                const origHtml = copyBtn.innerHTML;
                copyBtn.innerHTML = '<i class="fas fa-check" style="color:#51a351;"></i>';
                copyBtn.style.borderColor = '#51a351';
                setTimeout(() => {
                    copyBtn.innerHTML = origHtml;
                    copyBtn.style.borderColor = '#444';
                }, 1500);
            };

            if (navigator.clipboard && window.isSecureContext) {
                navigator.clipboard.writeText(keyInput.value)
                    .then(showCopySuccess)
                    .catch(err => { toastr.error("복사 실패. 브라우저 권한을 확인하세요."); });
            } else {
                keyInput.type = "text"; 
                keyInput.select();
                try { 
                    document.execCommand("copy"); 
                    showCopySuccess();
                } catch (err) { 
                    toastr.error("복사 실패. 수동으로 복사해주세요."); 
                }
                keyInput.type = "password"; 
                window.getSelection().removeAllRanges();
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

        document.getElementById('pmh-settings-clear-cache').onclick = async () => {
            if (confirm("브라우저/메모리 캐시를 초기화하고 서버 코어 모듈을 재시작하시겠습니까?\n(설정은 유지되며, 완료 후 페이지가 자동으로 새로고침됩니다.)")) {
                const btn = document.getElementById('pmh-settings-clear-cache');
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 초기화 중...';
                btn.disabled = true;

                if (window.PmhUICore && window.PmhUICore.destroyActiveInstance) {
                    window.PmhUICore.destroyActiveInstance();
                    delete window.PmhUICore;
                }

                const oldCss = document.getElementById('pmh-shared-css-inline'); if (oldCss) oldCss.remove();
                const oldJs = document.getElementById('pmh-shared-js-inline'); if (oldJs) oldJs.remove();
                const toolPanel = document.getElementById('pmh-tool-panel'); if (toolPanel) toolPanel.remove();

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
                if (typeof sessionRevalidated !== 'undefined') sessionRevalidated.clear();
                document.querySelectorAll('.pmh-render-marker, .pmh-top-right-wrapper, .plex-guid-list-box, .plex-list-multipath-badge, .pmh-guid-wrapper').forEach(e => e.remove());

                toastr.info("서버 코어 모듈 리로딩 중...", "처리 중", {timeOut: 2000});

                try {
                    const secureToken = await generateSecureHeader(ClientSettings.masterApiKey);
                    const reloadPromises = ServerConfig.SERVERS.map(srv => {
                        return new Promise((resolve) => {
                            GM_xmlhttpRequest({
                                method: "POST", url: `${srv.relayUrl}/admin/reload_core`,
                                headers: { "X-PMH-Signature": secureToken }, timeout: 10000,
                                onload: (r) => { resolve(r.status === 200); },
                                onerror: () => resolve(false), ontimeout: () => resolve(false)
                            });
                        });
                    });
                    await Promise.all(reloadPromises);
                } catch (e) {
                    errorLog("[Core Reload] Server Sync Error:", e);
                }

                toastr.success("캐시 초기화 및 코어 리로드 완료!<br>페이지를 새로고침합니다...", "완료", {timeOut: 1500});
                
                setTimeout(() => {
                    location.reload();
                }, 800);
            }
        };

        const testBtn = document.getElementById('pmh-settings-test');
        const testMsgEl = document.getElementById('pmh-settings-test-msg');

        const clearTestMsg = () => {
            if (testMsgEl) testMsgEl.style.display = 'none';
        };
        document.getElementById('pmh-set-master-url').addEventListener('input', clearTestMsg);
        document.getElementById('pmh-set-api-key').addEventListener('input', clearTestMsg);

        testBtn.onclick = async (e) => {
            e.preventDefault();
            const url = document.getElementById('pmh-set-master-url').value.trim().replace(/\/$/, '');
            const key = document.getElementById('pmh-set-api-key').value.trim();

            testMsgEl.style.display = 'block';

            if (!url || !key) {
                testMsgEl.style.borderColor = '#bd362f';
                testMsgEl.innerHTML = '<span style="color:#bd362f; font-weight:bold;"><i class="fas fa-exclamation-circle"></i> 마스터 서버 URL과 접속 키(API Key)를 모두 입력하세요.</span>';
                return;
            }

            testBtn.disabled = true;
            testBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 전체 노드 검사 중...';
            testMsgEl.style.borderColor = '#2f96b4';
            testMsgEl.innerHTML = '<span style="color:#2f96b4;"><i class="fas fa-spinner fa-spin"></i> 마스터 서버 및 등록된 워커 노드들의 상태를 조회하고 있습니다...</span>';

            const secureToken = await generateSecureHeader(key);

            GM_xmlhttpRequest({
                method: "GET",
                url: `${url}/api/client/config`,
                headers: { "X-PMH-Signature": secureToken },
                timeout: 6000,
                onload: async (configRes) => {
                    if (configRes.status === 401) {
                        testBtn.disabled = false;
                        testBtn.innerHTML = '<i class="fas fa-plug"></i> 연결 테스트';
                        testMsgEl.style.borderColor = '#bd362f';
                        testMsgEl.innerHTML = '<span style="color:#bd362f; font-weight:bold;"><i class="fas fa-times-circle"></i> 마스터 서버 인증 실패: API Key가 일치하지 않습니다. (HTTP 401)</span>';
                        return;
                    }

                    if (configRes.status !== 200) {
                        testBtn.disabled = false;
                        testBtn.innerHTML = '<i class="fas fa-plug"></i> 연결 테스트';
                        testMsgEl.style.borderColor = '#bd362f';
                        testMsgEl.innerHTML = `<span style="color:#bd362f; font-weight:bold;"><i class="fas fa-exclamation-triangle"></i> 마스터 서버 응답 오류 (HTTP ${configRes.status})</span>`;
                        return;
                    }

                    let serverList = [];
                    try {
                        const configJson = JSON.parse(configRes.responseText);
                        serverList = configJson.SERVERS || [{ id: 'master_node', name: '1.MAIN (Master)' }];
                    } catch (e) {
                        serverList = [{ id: 'master_node', name: '1.MAIN (Master)' }];
                    }

                    const pingPromises = serverList.map(srv => {
                        const isMaster = (srv.id === 'master_node' || srv.id === 'self');
                        const pingUrl = isMaster ? `${url}/api/ping` : `${url}/api/relay/${srv.id}/ping`;

                        return new Promise((resolve) => {
                            GM_xmlhttpRequest({
                                method: "GET",
                                url: pingUrl,
                                headers: { "X-PMH-Signature": secureToken },
                                timeout: 4000,
                                onload: (pingRes) => {
                                    if (pingRes.status === 200) {
                                        try {
                                            const pData = JSON.parse(pingRes.responseText);
                                            const isDbOk = pData.db_connected !== false;
                                            
                                            resolve({
                                                id: srv.id,
                                                name: srv.name || (isMaster ? 'Master Node' : srv.id),
                                                isMaster: isMaster,
                                                status: isDbOk ? 'ok' : 'db_error',
                                                dbError: pData.db_error || 'DB 연결 실패',
                                                version: pData.version || '0.0.0',
                                                dbType: (pData.db_type || 'sqlite3').toUpperCase()
                                            });
                                        } catch (e) {
                                            resolve({ id: srv.id, name: srv.name, isMaster, status: 'error', msg: 'JSON 오류' });
                                        }
                                    } else if (pingRes.status === 426) {
                                        resolve({ id: srv.id, name: srv.name, isMaster, status: 'restart', msg: '재시작 필요' });
                                    } else if (pingRes.status === 401) {
                                        resolve({ id: srv.id, name: srv.name, isMaster, status: 'error', msg: '키 불일치 (401)' });
                                    } else {
                                        resolve({ id: srv.id, name: srv.name, isMaster, status: 'error', msg: `HTTP ${pingRes.status}` });
                                    }
                                },
                                onerror: () => resolve({ id: srv.id, name: srv.name, isMaster, status: 'error', msg: '연결 실패' }),
                                ontimeout: () => resolve({ id: srv.id, name: srv.name, isMaster, status: 'error', msg: '시간 초과' })
                            });
                        });
                    });

                    const nodeResults = await Promise.all(pingPromises);
                    testBtn.disabled = false;
                    testBtn.innerHTML = '<i class="fas fa-plug"></i> 연결 테스트';

                    const hasError = nodeResults.some(n => n.status === 'error');
                    const hasRestart = nodeResults.some(n => n.status === 'restart');

                    let summaryTitleHtml = '';
                    if (hasError) {
                        testMsgEl.style.borderColor = '#bd362f';
                        summaryTitleHtml = `<div style="color:#bd362f; font-weight:bold; margin-bottom:6px;"><i class="fas fa-exclamation-triangle"></i> 일부 노드 연결 실패 (총 ${nodeResults.length}대 중)</div>`;
                    } else if (hasRestart) {
                        testMsgEl.style.borderColor = '#f89406';
                        summaryTitleHtml = `<div style="color:#f89406; font-weight:bold; margin-bottom:6px;"><i class="fas fa-power-off"></i> 서버 재시작 필요 (총 ${nodeResults.length}대)</div>`;
                    } else {
                        testMsgEl.style.borderColor = '#51a351';
                        summaryTitleHtml = `<div style="color:#51a351; font-weight:bold; margin-bottom:6px;"><i class="fas fa-check-circle"></i> 전체 노드 클러스터 연결 정상 (총 ${nodeResults.length}대)</div>`;
                    }

                    let nodeRowsHtml = nodeResults.map(node => {
                        const iconClass = node.isMaster ? 'fa-server' : 'fa-network-wired';
                        const iconColor = node.isMaster ? '#e5a00d' : '#2f96b4';

                        if (node.status === 'ok') {
                            const dbBadgeColor = node.dbType === 'POSTGRES' ? '#51a351' : '#2f96b4';
                            return `
                                <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.03); padding:4px 8px; border-radius:4px; border:1px solid #333;">
                                    <span style="color:#ddd; font-weight:bold;"><i class="fas ${iconClass}" style="color:${iconColor}; margin-right:6px;"></i>${node.name}</span>
                                    <div style="display:flex; align-items:center; gap:6px; font-family:monospace; font-size:11px;">
                                        <span style="color:#aaa;">v${node.version}</span>
                                        <span style="color:${dbBadgeColor}; font-weight:bold; background:rgba(0,0,0,0.3); padding:1px 4px; border-radius:3px; border:1px solid ${dbBadgeColor};">[${node.dbType}]</span>
                                        <span style="color:#51a351; font-weight:bold;"><i class="fas fa-check"></i> 정상</span>
                                    </div>
                                </div>
                            `;
                        } else if (node.status === 'restart') {
                            return `
                                <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(248,148,6,0.1); padding:4px 8px; border-radius:4px; border:1px solid #f89406;">
                                    <span style="color:#ddd; font-weight:bold;"><i class="fas ${iconClass}" style="color:${iconColor}; margin-right:6px;"></i>${node.name}</span>
                                    <span style="color:#f89406; font-weight:bold; font-size:11px;"><i class="fas fa-power-off"></i> 재시작 필요</span>
                                </div>
                            `;
                        } else if (node.status === 'db_error') {
                            return `
                                <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(248,148,6,0.15); border:1px solid #f89406; padding:4px 8px; border-radius:4px;">
                                    <span style="color:#ddd; font-weight:bold;"><i class="fas ${iconClass}" style="color:${iconColor}; margin-right:6px;"></i>${node.name}</span>
                                    <div style="display:flex; align-items:center; gap:6px; font-family:monospace; font-size:11px;">
                                        <span style="color:#f89406; font-weight:bold;">[${node.dbType} 연결 오류]</span>
                                        <span style="color:#aaa; font-size:10px; max-width:200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${node.dbError}">${node.dbError}</span>
                                    </div>
                                </div>
                            `;
                        } else {
                            return `
                                <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(189,54,47,0.15); padding:4px 8px; border-radius:4px; border:1px solid #bd362f;">
                                    <span style="color:#ddd; font-weight:bold;"><i class="fas ${iconClass}" style="color:${iconColor}; margin-right:6px;"></i>${node.name}</span>
                                    <span style="color:#bd362f; font-weight:bold; font-size:11px;"><i class="fas fa-times-circle"></i> ${node.msg}</span>
                                </div>
                            `;
                        }
                    }).join('');

                    testMsgEl.innerHTML = `
                        ${summaryTitleHtml}
                        <div style="display:flex; flex-direction:column; gap:4px; margin-top:4px;">
                            ${nodeRowsHtml}
                        </div>
                    `;
                },
                onerror: () => {
                    testBtn.disabled = false;
                    testBtn.innerHTML = '<i class="fas fa-plug"></i> 연결 테스트';
                    testMsgEl.style.borderColor = '#bd362f';
                    testMsgEl.innerHTML = '<span style="color:#bd362f; font-weight:bold;"><i class="fas fa-wifi"></i> 마스터 서버에 연결할 수 없습니다. (URL 및 포트 확인)</span>';
                },
                ontimeout: () => {
                    testBtn.disabled = false;
                    testBtn.innerHTML = '<i class="fas fa-plug"></i> 연결 테스트';
                    testMsgEl.style.borderColor = '#bd362f';
                    testMsgEl.innerHTML = '<span style="color:#bd362f; font-weight:bold;"><i class="fas fa-clock"></i> 응답 시간 초과 (6초): 마스터 서버가 켜져 있는지 확인하세요.</span>';
                }
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
                customAgentScore: parseInt(document.getElementById('pmh-set-custom-score').value, 10) || 95,
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

    // =========================================================================
    // 포스터 크롭 에디터 (FF 연동 & Cropper.js)
    // =========================================================================
    let cropperInstance = null;
    let customUploadPayload = null; 
    let currentCropItemData = null; 

    // GUID 또는 텍스트에서 식별 코드 추출
    function extractSjvaAgentCode(rawGuid) {
        if (!rawGuid) return null;
        let str = String(rawGuid).trim();
        if (str.includes('://')) str = str.split('://')[1];
        if (str.includes('?')) str = str.split('?')[0];
        str = str.trim();

        if (!str || str === '-' || str.startsWith('local') || str.startsWith('none')) {
            return null;
        }
        return str;
    }

    // 첫 글자로 FF API 모듈 매핑 (C: 유모, E: 노모, W: 서양)
    function getFfModuleFromCode(cleanCode) {
        if (!cleanCode) return null;
        const firstChar = cleanCode.charAt(0).toUpperCase();
        if (firstChar === 'C') return 'jav_censored';
        if (firstChar === 'E') return 'jav_uncensored';
        if (firstChar === 'W') return 'western';
        return null;
    }

    // 노드별 FF Meta DB 활성화 여부 판정 헬퍼
    function isFfMetaDbActive(serverId, rawGuid) {
        let srv = getServerConfig(serverId);
        if (!srv && ServerConfig.SERVERS && ServerConfig.SERVERS.length > 0) {
            srv = ServerConfig.SERVERS.find(s => s.machineIdentifier === serverId || s.id === serverId) || ServerConfig.SERVERS[0];
        }
        if (!srv) {
            log(`[isFfMetaDbActive] ❌ 서버 설정 없음 (serverId: ${serverId})`);
            return false;
        }

        const isMetaDbEnabled = !!(srv.ff_metadb_use || window._pmh_latest_ping_results?.[srv.machineIdentifier]?.ff_metadb_use);
        if (!isMetaDbEnabled) {
            log(`[isFfMetaDbActive] ❌ ff_metadb_use 비활성화됨 (Server: ${srv.name || srv.id})`);
            return false;
        }

        if (rawGuid) {
            const cleanCode = extractSjvaAgentCode(rawGuid);
            if (!cleanCode) {
                log(`[isFfMetaDbActive] ❌ GUID 코드 추출 실패 (rawGuid: ${rawGuid})`);
                return false;
            }
            const moduleName = getFfModuleFromCode(cleanCode);
            if (!moduleName) {
                log(`[isFfMetaDbActive] ❌ 모듈 판정 실패 (cleanCode: ${cleanCode})`);
                return false;
            }
        }
        return true;
    }

    // AV 미디어 판별 헬퍼 (단일 영화 + 이미지서버 On + C/E/W 코드)
    function isSectionMatched(sectionConfigStr, targetSectionId) {
        if (!sectionConfigStr || targetSectionId === undefined || targetSectionId === null || targetSectionId === '') {
            return false;
        }
        const cfgStr = String(sectionConfigStr).trim().toLowerCase();
        if (!cfgStr) return false;
        if (cfgStr === 'all') return true;

        const targetId = parseInt(targetSectionId, 10);
        if (isNaN(targetId)) return false;

        const parts = cfgStr.split(',');
        for (let part of parts) {
            part = part.trim();
            if (!part) continue;

            if (part.includes('-')) {
                const range = part.split('-');
                if (range.length === 2) {
                    const start = parseInt(range[0].trim(), 10);
                    const end = parseInt(range[1].trim(), 10);
                    if (!isNaN(start) && !isNaN(end) && targetId >= start && targetId <= end) {
                        return true;
                    }
                }
            } else {
                const single = parseInt(part, 10);
                if (!isNaN(single) && single === targetId) {
                    return true;
                }
            }
        }
        return false;
    }

    function isAvMediaItem(rawGuid, sectionId = '', serverId = '', itemType = 'video') {
        if (itemType === 'directory' || itemType === 'show' || itemType === 'season' || itemType === 'episode' || itemType === 'album' || itemType === 'audio') {
            return false;
        }

        let srv = getServerConfig(serverId);
        if (!srv && ServerConfig.SERVERS && ServerConfig.SERVERS.length > 0) {
            srv = ServerConfig.SERVERS.find(s => s.machineIdentifier === serverId || s.id === serverId) || ServerConfig.SERVERS[0];
        }
        if (!srv || !srv.av_image_server_use) {
            return false;
        }

        if (sectionId && srv) {
            const isJavSec = isSectionMatched(srv.jav_section, sectionId);
            const isWestSec = isSectionMatched(srv.western_av_section, sectionId);

            if ((srv.jav_section || srv.western_av_section) && !isJavSec && !isWestSec) {
                return false;
            }
        }

        const code = extractSjvaAgentCode(rawGuid);
        if (!code) return false;

        const moduleName = getFfModuleFromCode(code);
        return moduleName !== null;
    }

    function isFfMetaDbActive(serverId, rawGuid) {
        let srv = getServerConfig(serverId);
        if (!srv && ServerConfig.SERVERS && ServerConfig.SERVERS.length > 0) {
            srv = ServerConfig.SERVERS.find(s => s.machineIdentifier === serverId || s.id === serverId) || ServerConfig.SERVERS[0];
        }
        if (!srv) {
            log(`[isFfMetaDbActive] ❌ 서버 설정 없음 (serverId: ${serverId})`);
            return false;
        }

        const isMetaDbEnabled = !!(srv.ff_metadb_use || window._pmh_latest_ping_results?.[srv.machineIdentifier]?.ff_metadb_use);
        if (!isMetaDbEnabled) {
            log(`[isFfMetaDbActive] ❌ ff_metadb_use 비활성화됨 (Server: ${srv.name || srv.id})`);
            return false;
        }

        if (rawGuid) {
            const cleanCode = extractSjvaAgentCode(rawGuid);
            if (!cleanCode) {
                log(`[isFfMetaDbActive] ❌ GUID 코드 추출 실패 (rawGuid: ${rawGuid})`);
                return false;
            }
            const moduleName = getFfModuleFromCode(cleanCode);
            if (!moduleName) {
                log(`[isFfMetaDbActive] ❌ 모듈 판정 실패 (cleanCode: ${cleanCode})`);
                return false;
            }
        }
        return true;
    }

    // Cropper 생성자 획득 헬퍼
    function getCropperClass() {
        if (typeof Cropper !== 'undefined') return Cropper;
        if (window.Cropper) return window.Cropper;
        if (typeof unsafeWindow !== 'undefined' && unsafeWindow.Cropper) return unsafeWindow.Cropper;
        return null;
    }

    // Cropper.js 및 CSS 동적 로더
    async function ensureCropperLoaded() {
        return new Promise((resolve) => {
            const ExistingCropper = getCropperClass();
            if (ExistingCropper) return resolve(ExistingCropper);

            if (!document.getElementById('pmh-cropper-css')) {
                const link = document.createElement('link');
                link.id = 'pmh-cropper-css'; link.rel = 'stylesheet';
                link.href = 'https://cdnjs.cloudflare.com/ajax/libs/cropperjs/1.5.13/cropper.min.css';
                document.head.appendChild(link);
            }

            if (!document.getElementById('pmh-cropper-js')) {
                const script = document.createElement('script');
                script.id = 'pmh-cropper-js';
                script.src = 'https://cdnjs.cloudflare.com/ajax/libs/cropperjs/1.5.13/cropper.min.js';
                script.onload = () => {
                    infoLog("[Crop Modal] Cropper.js 로드 완료");
                    resolve(getCropperClass());
                };
                script.onerror = () => {
                    errorLog("[Crop Modal] Cropper.js 로드 실패");
                    resolve(null);
                };
                document.head.appendChild(script);
            } else {
                let checkCount = 0;
                const waitInt = setInterval(() => {
                    checkCount++;
                    const CC = getCropperClass();
                    if (CC || checkCount > 20) {
                        clearInterval(waitInt);
                        resolve(CC);
                    }
                }, 50);
            }
        });
    }

    // 모달 DOM 생성 및 초기화
    let pmhCropModal = document.getElementById('pmh-crop-modal');
    if (!pmhCropModal) {
        pmhCropModal = document.createElement('div');
        pmhCropModal.id = 'pmh-crop-modal';
        pmhCropModal.innerHTML = `
            <div class="pmh-crop-card">
                <div class="pmh-crop-header">
                    <span id="pmh-crop-title" style="color:#e5a00d; font-weight:bold; font-size:13px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; padding-right:10px;">포스터 크롭 에디터</span>
                    <button type="button" id="pmh-btn-crop-close" style="background:transparent; border:none; color:#aaa; font-size:16px; cursor:pointer; padding:4px; display:flex; align-items:center; justify-content:center; transition:color 0.2s;" onmouseover="this.style.color='#fff'" onmouseout="this.style.color='#aaa'">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                
                <div class="pmh-crop-toolbar" style="display:flex; flex-direction:column; gap:6px; padding:8px 12px; background:#1a1d21; border-bottom:1px solid #2a2d32; flex-shrink:0;">
                    <!-- 1열: 원본 소스, 조작 모드, 크롭 비율, 회전, 줌, 맞춤, 리셋 -->
                    <div style="display:flex; justify-content:space-between; align-items:center; width:100%;">
                        <div style="display:flex; gap:4px; align-items:center; flex-wrap:nowrap;">
                            <!-- 원본 소스 스위칭 (PL / P) -->
                            <div style="display:flex; gap:3px; border-right:1px solid #333; padding-right:6px; margin-right:4px;">
                                <button class="pmh-crop-btn pmh-crop-btn-active" id="pmh-crop-src-pl" title="기본 가로 커버(_pl)를 불러옵니다."><i class="fas fa-image"></i> 가로(PL)</button>
                                <button class="pmh-crop-btn" id="pmh-crop-src-p" title="기본 세로 포스터(_p)를 불러옵니다."><i class="fas fa-portrait"></i> 세로(P)</button>
                            </div>

                            <!-- 조작 모드 (이동 / 영역지정) -->
                            <div style="display:flex; gap:3px; border-right:1px solid #333; padding-right:6px; margin-right:4px;" id="pmh-crop-dragmode-group">
                                <button class="pmh-crop-btn pmh-crop-btn-active" id="pmh-crop-mode-move" title="이미지 이동(Pan) 모드: 크롭 박스 외부를 드래그하여 이미지를 상하좌우로 이동합니다."><i class="fas fa-arrows-alt"></i> 이동</button>
                                <button class="pmh-crop-btn" id="pmh-crop-mode-crop" title="영역 지정(Crop) 모드: 마우스 드래그로 새 크롭 박스를 직접 그립니다."><i class="fas fa-crop-alt"></i> 영역지정</button>
                            </div>

                            <!-- 크롭 비율 (1:1.42 / 3:4 / 1:1 / 자유) -->
                            <div style="display:flex; gap:3px; border-right:1px solid #333; padding-right:6px; margin-right:4px;" id="pmh-crop-ratio-group">
                                <button class="pmh-crop-btn pmh-crop-btn-active" id="pmh-crop-ratio-lock" title="Plex 포스터 표준 비율 (1:1.4225)">1:1.42</button>
                                <button class="pmh-crop-btn" id="pmh-crop-ratio-portrait" title="3:4 프로필 비율">3:4</button>
                                <button class="pmh-crop-btn" id="pmh-crop-ratio-square" title="1:1 정사각형 비율">1:1</button>
                                <button class="pmh-crop-btn" id="pmh-crop-ratio-free" title="비율 제한 없이 자유롭게 자르기">자유</button>
                            </div>

                            <!-- 회전, 줌 및 맞춤 -->
                            <button class="pmh-crop-btn" id="pmh-crop-rotate-l" title="좌로 90도 회전 및 화면 맞춤"><i class="fas fa-undo"></i> 90°</button>
                            <button class="pmh-crop-btn" id="pmh-crop-rotate-r" title="우로 90도 회전 및 화면 맞춤"><i class="fas fa-redo"></i> 90°</button>
                            <button class="pmh-crop-btn" id="pmh-crop-zoom-in" title="이미지 확대"><i class="fas fa-search-plus"></i></button>
                            <button class="pmh-crop-btn" id="pmh-crop-zoom-out" title="이미지 축소"><i class="fas fa-search-minus"></i></button>
                            <button class="pmh-crop-btn" id="pmh-crop-fit" title="이미지를 화면 중앙 및 크기에 맞춤"><i class="fas fa-expand-arrows-alt"></i> 맞춤</button>
                            <button class="pmh-crop-btn" id="pmh-crop-reset" style="color:#f89406 !important;" title="영역 및 회전 초기화"><i class="fas fa-sync-alt"></i></button>
                        </div>
                    </div>

                    <!-- 2열: URL 직접 입력 + 파일 교체/등록 버튼군 -->
                    <div style="display:flex; justify-content:space-between; align-items:center; width:100%; gap:8px;">
                        <div style="display:flex; align-items:center; gap:6px; flex-grow:1; min-width:0;">
                            <span style="font-size:11.5px; font-weight:bold; color:#2f96b4; white-space:nowrap;"><i class="fas fa-link"></i> URL:</span>
                            <input type="text" id="pmh-input-crop-url" placeholder="https://... 이미지 웹 주소 붙여넣기 후 엔터 또는 로드 클릭" style="flex:1; padding:4px 8px; font-size:12px; background:#111; color:#fff; border:1px solid #444; border-radius:4px; outline:none; height:28px; box-sizing:border-box;">
                            <button type="button" class="pmh-crop-btn pmh-crop-btn-primary" id="pmh-btn-apply-crop-url">로드</button>
                        </div>
                        <div style="display:flex; gap:5px; align-items:center; flex-shrink:0;">
                            <label class="pmh-crop-btn pmh-crop-btn-primary" style="cursor:pointer;" title="새 가로 원본 이미지를 불러옵니다. (가로 _pl_user와 크롭된 _p_user 동시 저장)">
                                <i class="fas fa-folder-open"></i> 가로(PL) 교체
                                <input type="file" id="pmh-upload-pl" accept="image/*" style="display:none;">
                            </label>
                            <label class="pmh-crop-btn pmh-crop-btn-success" style="cursor:pointer;" title="이미 완성된 세로형 포스터를 직접 등록합니다. (_p_user 단독 교체)">
                                <i class="fas fa-file-image"></i> 세로(P) 등록
                                <input type="file" id="pmh-upload-p" accept="image/*" style="display:none;">
                            </label>
                        </div>
                    </div>
                </div>

                <div class="pmh-crop-view">
                    <i class="fas fa-spinner fa-spin" id="pmh-crop-spinner" style="position:absolute; font-size:32px; color:#e5a00d; display:none; z-index:5;"></i>
                    <img id="pmh-cropper-target-img" style="display:block; max-width:100%; opacity:0;" alt="Crop Source">
                </div>

                <div class="pmh-crop-footer">
                    <span style="font-size:11px; color:#777;">※ 저장 시 <code>_p_user.jpg</code>로 생성되며 Plex 클린 리매칭이 자동 수행됩니다.</span>
                    <div style="display:flex; gap:8px;">
                        <button class="pmh-crop-btn" id="pmh-btn-crop-cancel">취소</button>
                        <button class="pmh-crop-btn pmh-crop-btn-active" id="pmh-btn-crop-save" style="padding:0 15px !important;"><i class="fas fa-save"></i> 저장 및 리매칭</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(pmhCropModal);
    }

    // 모달 닫기 함수
    function closeCropModal() {
        if (cropperInstance) { 
            cropperInstance.destroy(); 
            cropperInstance = null; 
        }
        const imgEl = document.getElementById('pmh-cropper-target-img');
        if (imgEl) {
            imgEl.onload = null;
            imgEl.onerror = null;
            if (imgEl.src && imgEl.src.startsWith('blob:')) {
                URL.revokeObjectURL(imgEl.src);
            }
            imgEl.className = '';
            imgEl.style.cssText = 'display: block; max-width: 100%; opacity: 0;';
            imgEl.src = '';
        }
        const plInp = document.getElementById('pmh-upload-pl'); if (plInp) plInp.value = '';
        const pInp = document.getElementById('pmh-upload-p'); if (pInp) pInp.value = '';

        const urlInp = document.getElementById('pmh-input-crop-url');
        if (urlInp) urlInp.value = '';

        // 비율 버튼 1:1.42 기본값으로 초기화
        $('#pmh-crop-ratio-group .pmh-crop-btn').removeClass('pmh-crop-btn-active');
        $('#pmh-crop-ratio-lock').addClass('pmh-crop-btn-active');

        // 드래그 모드 '이동' 기본값으로 초기화
        $('#pmh-crop-dragmode-group .pmh-crop-btn').removeClass('pmh-crop-btn-active');
        $('#pmh-crop-mode-move').addClass('pmh-crop-btn-active');

        if (pmhCropModal) pmhCropModal.style.display = 'none';
        customUploadPayload = null;
        currentCropItemData = null;
    }

    // 현재 활성화된 비율 반환 헬퍼
    function getSelectedCropAspectRatio() {
        if ($('#pmh-crop-ratio-portrait').hasClass('pmh-crop-btn-active')) return 3 / 4;
        if ($('#pmh-crop-ratio-square').hasClass('pmh-crop-btn-active')) return 1 / 1;
        if ($('#pmh-crop-ratio-free').hasClass('pmh-crop-btn-active')) return NaN;
        return 1 / 1.4225;
    }

    // 이미지 바이너리 로드 및 Cropper 인스턴스화 모듈
    function loadCropImage(targetUrl, isCustomUrl = false) {
        if (!targetUrl) return;

        const imgEl = document.getElementById('pmh-cropper-target-img');
        const spinner = document.getElementById('pmh-crop-spinner');
        if (!imgEl || !spinner) return;

        spinner.style.display = 'block';
        imgEl.style.opacity = '0';

        infoLog(`[Crop Modal] 🚀 이미지 로드 시작: ${targetUrl}`);

        if (isCustomUrl) {
            customUploadPayload = { type: 'url', url: targetUrl };
        }

        GM_xmlhttpRequest({
            method: "GET",
            url: targetUrl,
            responseType: "blob",
            headers: { "Referer": "" },
            timeout: 30000,
            onload: (blobRes) => {
                if (blobRes.status >= 200 && blobRes.status < 300 && blobRes.response) {
                    const blob = blobRes.response;
                    const blobUrl = URL.createObjectURL(blob);

                    const initCropper = () => {
                        spinner.style.display = 'none';
                        imgEl.style.opacity = '1';

                        if (cropperInstance) {
                            cropperInstance.destroy();
                            cropperInstance = null;
                        }

                        const TargetCropper = getCropperClass();
                        const activeRatio = getSelectedCropAspectRatio();
                        const activeDragMode = $('#pmh-crop-mode-crop').hasClass('pmh-crop-btn-active') ? 'crop' : 'move';

                        cropperInstance = new TargetCropper(imgEl, {
                            aspectRatio: activeRatio,
                            viewMode: 1,
                            dragMode: activeDragMode,
                            autoCropArea: 1,
                            responsive: true,
                            restore: false,
                            checkCrossOrigin: false,
                            zoomable: true,
                            rotatable: true,
                            scalable: true,
                            wheelZoomRatio: 0.08
                        });
                    };

                    imgEl.onload = initCropper;
                    imgEl.onerror = () => {
                        spinner.style.display = 'none';
                        errorLog("[Crop Modal] ❌ Blob 이미지 렌더링 실패");
                        toastr.error("이미지를 불러오지 못했습니다.");
                    };
                    imgEl.src = blobUrl;

                    if (imgEl.complete) initCropper();

                } else {
                    spinner.style.display = 'none';
                    errorLog("[Crop Modal] ❌ 이미지 응답 오류:", blobRes.status);
                    toastr.error(`이미지 다운로드 실패 (HTTP ${blobRes.status})`);
                }
            },
            onerror: (err) => {
                spinner.style.display = 'none';
                errorLog("[Crop Modal] ❌ 네트워크 오류:", err);
                toastr.error("이미지 서버에 연결할 수 없습니다.");
            },
            ontimeout: () => {
                spinner.style.display = 'none';
                errorLog("[Crop Modal] ❌ 요청 시간 초과");
                toastr.error("이미지 로딩 시간이 초과되었습니다.");
            }
        });
    }

    // 모달 열기 및 크롭 에디터 구동
    async function openPosterCropModal(itemId, serverId, rawGuid, optTitle = '') {
        infoLog(`[Crop Modal] 🎬 포스터 편집 진입 -> Item ID: ${itemId}, Server ID: ${serverId}, Raw GUID: ${rawGuid}`);

        const srvConfig = getServerConfig(serverId);
        if (!srvConfig) {
            errorLog("[Crop Modal] ❌ srvConfig 조회 실패 (Server ID:", serverId, ")");
            return toastr.error("서버 설정을 찾을 수 없습니다.");
        }

        const cleanCode = extractSjvaAgentCode(rawGuid);
        if (!cleanCode) {
            warnLog("[Crop Modal] ⚠️ sjva_agent 기반 GUID가 아닙니다:", rawGuid);
            return toastr.warning("sjva_agent 기반의 메타데이터만 포스터 편집을 지원합니다.");
        }

        const moduleName = getFfModuleFromCode(cleanCode);
        if (!moduleName) {
            warnLog("[Crop Modal] ⚠️ 지원하지 않는 AV 코드 접두사:", cleanCode);
            return toastr.warning("지원하지 않는 AV 코드 형식입니다. (C, E, W만 지원)");
        }

        currentCropItemData = { itemId, serverId, code: cleanCode, module: moduleName };
        customUploadPayload = null;

        document.getElementById('pmh-crop-title').innerText = `[${cleanCode}] ${optTitle || '로딩 중...'} - 포스터 크롭 에디터`;
        const imgEl = document.getElementById('pmh-cropper-target-img');
        const spinner = document.getElementById('pmh-crop-spinner');

        if (cropperInstance) { 
            cropperInstance.destroy(); 
            cropperInstance = null; 
        }
        imgEl.className = '';
        imgEl.style.cssText = 'display: block; max-width: 100%; opacity: 0;';
        spinner.style.display = 'block';
        pmhCropModal.style.display = 'flex';

        try {
            const CropperConstructor = await ensureCropperLoaded();
            if (!CropperConstructor) {
                throw new Error("Cropper.js 라이브러리를 초기화하지 못했습니다.");
            }

            const reqUrl = `${srvConfig.relayUrl}/ff_metadata/api/${moduleName}/info?code=${encodeURIComponent(cleanCode)}&call=plex`;
            infoLog(`[Crop Modal] 📡 FF info API 요청 (180초 타임아웃): ${reqUrl}`);

            const infoRes = await makeRequest(reqUrl, 'GET', null, ClientSettings.masterApiKey, null, 180000);
            infoLog(`[Crop Modal] ✅ FF info 응답 수신:`, infoRes);

            let plUrl = '';
            if (infoRes.thumb) {
                for (const t of infoRes.thumb) {
                    if (t.aspect === 'landscape') { plUrl = t.value; break; }
                }
            }
            if (!plUrl && infoRes.fanart && infoRes.fanart.length > 0) plUrl = infoRes.fanart[0];
            if (!plUrl) plUrl = infoRes.poster_url;

            let pUrl = infoRes.poster_url || '';
            if (!pUrl && infoRes.thumb) {
                for (const t of infoRes.thumb) {
                    if (t.aspect === 'poster') { pUrl = t.value; break; }
                }
            }
            if (!pUrl && plUrl) pUrl = plUrl;

            if (!plUrl && !pUrl) throw new Error("편집할 원본 이미지 주소를 찾을 수 없습니다.");

            currentCropItemData.plUrl = plUrl || pUrl;
            currentCropItemData.pUrl = pUrl || plUrl;
            currentCropItemData.currentSource = 'pl';

            document.getElementById('pmh-crop-title').innerText = `[${cleanCode}] ${infoRes.title || optTitle} - 포스터 크롭 에디터`;
            
            const btnSrcPl = document.getElementById('pmh-crop-src-pl');
            const btnSrcP = document.getElementById('pmh-crop-src-p');
            if (btnSrcPl) btnSrcPl.classList.add('pmh-crop-btn-active');
            if (btnSrcP) btnSrcP.classList.remove('pmh-crop-btn-active');

            loadCropImage(currentCropItemData.plUrl);

        } catch (err) {
            errorLog("[Crop Modal] ❌ 모달 로드 예외 발생:", err);
            toastr.error(`이미지 로드 실패: ${err.message || err}`);
            closeCropModal();
        }
    }

    // =========================================================================
    // PMH 영상 DB 편집 모달 및 클린 리매칭 자동 연계 로직
    // =========================================================================
    let currentEditMetaContext = null;

    async function openPmhMetaDbModal(itemId, serverId, rawGuid, optTitle = '') {
        let srvConfig = getServerConfig(serverId);
        if (!srvConfig && ServerConfig.SERVERS && ServerConfig.SERVERS.length > 0) {
            srvConfig = ServerConfig.SERVERS.find(s => s.machineIdentifier === serverId || s.id === serverId) || ServerConfig.SERVERS[0];
        }
        if (!srvConfig) return toastr.error("서버 설정을 찾을 수 없습니다.");

        const cleanCode = extractSjvaAgentCode(rawGuid) || rawGuid;
        if (!cleanCode) return toastr.warning("식별 코드를 확인할 수 없습니다.");

        const moduleName = getFfModuleFromCode(cleanCode) || 'jav_censored';
        const catMap = { 'jav_censored': 'JAV_CEN', 'jav_uncensored': 'JAV_UNCEN', 'western': 'WESTERN' };
        const category = catMap[moduleName] || 'JAV_CEN';

        infoLog(`[Meta DB Modal] 영상 DB 편집 호출: [${cleanCode}] (${category})`);

        window._pmh_top_z_index = (window._pmh_top_z_index || 10000010) + 10;
        const currentZIndex = window._pmh_top_z_index;

        const geo = getModalGeometry('meta_db');
        let defW = geo.width;
        let defH = geo.height;
        let defTop = geo.top;
        let defLeft = geo.left;

        const modalId = `pmh-meta-db-modal-${Date.now()}`;
        const m = document.createElement('div');
        m.id = modalId;
        m.className = 'pmh-db-modal pmh-stacked-modal';
        m.style.zIndex = currentZIndex;

        m.innerHTML = `
            <div id="${modalId}-card" class="pmh-db-card pmh-card-meta_db" style="width:${defW}px; height:${defH}px; top:${defTop}px; left:${defLeft}px; position:fixed; z-index:${currentZIndex + 1};">
                <div class="pmh-resizer pmh-resizer-n"></div><div class="pmh-resizer pmh-resizer-s"></div>
                <div class="pmh-resizer pmh-resizer-e"></div><div class="pmh-resizer pmh-resizer-w"></div>
                <div class="pmh-resizer pmh-resizer-ne"></div><div class="pmh-resizer pmh-resizer-nw"></div>
                <div class="pmh-resizer pmh-resizer-se"></div><div class="pmh-resizer pmh-resizer-sw"></div>

                <div class="pmh-db-header" id="${modalId}-header">
                    <span style="color:#e5a00d; font-weight:bold; font-size:14px;"><i class="fas fa-database" style="margin-right:6px;"></i><span id="${modalId}-header-title">[${cleanCode}] ${optTitle} - 메타데이터 편집</span></span>
                    <button type="button" class="pmh-meta-modal-close" style="background:none; border:none; color:#aaa; font-size:16px; cursor:pointer;" onmouseover="this.style.color='#fff'" onmouseout="this.style.color='#aaa'"><i class="fas fa-times"></i></button>
                </div>
                <div class="pmh-db-body" id="${modalId}-body" style="position:relative;">
                    <div id="${modalId}-loading" style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; color:#e5a00d; gap:10px;">
                        <i class="fas fa-spinner fa-spin fa-2x"></i>
                        <span>FF 메타데이터 DB에서 데이터를 불러오고 있습니다...</span>
                    </div>

                    <div id="${modalId}-form" style="display:none;">
                        <!-- 상단: 380px 정사각형 1:1 썸네일 캐러셀(좌) + 2열 입력 폼(우) -->
                        <div style="display:flex; gap:15px; margin-bottom:15px;">
                            <div style="width:380px; height:380px; flex-shrink:0; display:flex; flex-direction:column; justify-content:space-between; background:#111; padding:8px; border-radius:6px; border:1px solid #333; box-sizing:border-box;">
                                <div style="width:100%; height:328px; background:#000; border-radius:4px; overflow:hidden; display:flex; justify-content:center; align-items:center; position:relative;">
                                    <span id="${modalId}-p-type" style="position:absolute; top:6px; left:6px; z-index:3; font-size:10px; padding:2px 6px; border-radius:3px; background:rgba(0,123,255,0.75); color:#fff; font-weight:bold;">Poster</span>
                                    <img id="${modalId}-p-img" referrerpolicy="no-referrer" src="" style="max-width:100%; max-height:100%; object-fit:contain; cursor:pointer;" title="클릭하여 라이트박스로 크게 보기">
                                </div>
                                <div style="display:flex; justify-content:space-between; align-items:center; height:36px; padding:0 4px;">
                                    <button type="button" class="pmh-crop-btn" id="${modalId}-btn-meta-prev" style="padding:0 14px !important;">&lt; 이전</button>
                                    <span id="${modalId}-p-counter" style="font-size:11.5px; font-weight:bold; color:#2f96b4;">0 / 0</span>
                                    <button type="button" class="pmh-crop-btn" id="${modalId}-btn-meta-next" style="padding:0 14px !important;">다음 &gt;</button>
                                </div>
                            </div>
                            
                            <!-- 2열 속성 배치 영역 -->
                            <div style="flex-grow:1; display:flex; flex-direction:column; gap:8px;">
                                <div style="display:flex; gap:10px;">
                                    <div class="pmh-form-group" style="flex:1; margin:0;">
                                        <label class="pmh-form-label">고유 식별코드 (Code)</label>
                                        <input type="text" id="${modalId}-code" class="pmh-input-text" readonly style="background:#222; color:#aaa;">
                                    </div>
                                    <div class="pmh-form-group" style="flex:1; margin:0;">
                                        <label class="pmh-form-label">표시 품번 (UI Code)</label>
                                        <input type="text" id="${modalId}-ui-code" class="pmh-input-text">
                                    </div>
                                </div>
                                <div style="display:flex; gap:10px;">
                                    <div class="pmh-form-group" style="flex:1; margin:0;">
                                        <label class="pmh-form-label">출처 사이트 (Site)</label>
                                        <input type="text" id="${modalId}-site" class="pmh-input-text" readonly style="background:#222; color:#aaa;">
                                    </div>
                                    <div class="pmh-form-group" style="flex:1; margin:0;">
                                        <label class="pmh-form-label">평점 (0.0 ~ 5.0)</label>
                                        <input type="number" step="0.1" id="${modalId}-rating" class="pmh-input-text">
                                    </div>
                                </div>
                                <div style="display:flex; gap:10px;">
                                    <div class="pmh-form-group" style="flex:1; margin:0;">
                                        <label class="pmh-form-label">출시일 (YYYY-MM-DD)</label>
                                        <input type="text" id="${modalId}-premiered" class="pmh-input-text">
                                    </div>
                                    <div class="pmh-form-group" style="flex:1; margin:0;">
                                        <label class="pmh-form-label">출시년도 (Year)</label>
                                        <input type="number" id="${modalId}-year" class="pmh-input-text">
                                    </div>
                                </div>
                                <div style="display:flex; gap:10px;">
                                    <div class="pmh-form-group" style="flex:1; margin:0;">
                                        <label class="pmh-form-label">제작사 / 스튜디오</label>
                                        <input type="text" id="${modalId}-studio" class="pmh-input-text">
                                    </div>
                                    <div class="pmh-form-group" style="flex:1; margin:0;">
                                        <label class="pmh-form-label">시리즈</label>
                                        <input type="text" id="${modalId}-series" class="pmh-input-text">
                                    </div>
                                </div>
                                <div style="display:flex; gap:10px;">
                                    <div class="pmh-form-group" style="flex:1; margin:0;">
                                        <label class="pmh-form-label">감독</label>
                                        <input type="text" id="${modalId}-director" class="pmh-input-text">
                                    </div>
                                    <div class="pmh-form-group" style="flex:1; margin:0;">
                                        <label class="pmh-form-label">재생시간 (분)</label>
                                        <input type="number" id="${modalId}-runtime" class="pmh-input-text">
                                    </div>
                                </div>
                                <div class="pmh-form-group" style="margin:0;">
                                    <label class="pmh-form-label">장르 목록 (쉼표 구분)</label>
                                    <input type="text" id="${modalId}-genres" class="pmh-input-text">
                                </div>
                            </div>
                        </div>

                        <!-- 최종 제목 필드 (ID 충돌 방지: input-title) -->
                        <div class="pmh-form-group">
                            <label class="pmh-form-label">최종 제목 (Title)</label>
                            <input type="text" id="${modalId}-input-title" class="pmh-input-text">
                        </div>
                        <div class="pmh-form-group">
                            <label class="pmh-form-label">원문/번역 부제 (Tagline)</label>
                            <input type="text" id="${modalId}-tagline" class="pmh-input-text">
                        </div>
                        <div class="pmh-form-group">
                            <label class="pmh-form-label">줄거리 (Plot)</label>
                            <textarea id="${modalId}-plot" class="pmh-input-text" style="height:75px; resize:vertical;"></textarea>
                        </div>

                        <!-- 출연 배우 영역 -->
                        <div class="pmh-form-group" style="background:rgba(0,0,0,0.3); border:1px solid #333; padding:10px; border-radius:4px;">
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                                <label class="pmh-form-label" style="margin:0;"><i class="fas fa-users"></i> 출연 배우</label>
                                <button type="button" class="pmh-crop-btn pmh-crop-btn-primary" id="${modalId}-btn-add-actor" style="font-size:11px; padding:2px 8px;"><i class="fas fa-plus"></i> 배우 추가</button>
                            </div>
                            <div id="${modalId}-actors-container" style="display:flex; flex-wrap:wrap; gap:6px;"></div>
                        </div>

                        <!-- 미디어 URL 영역 -->
                        <div style="display:flex; gap:10px;">
                            <div class="pmh-form-group" style="flex:1;">
                                <label class="pmh-form-label">대표 포스터 URL (Poster)</label>
                                <input type="text" id="${modalId}-poster-url" class="pmh-input-text" placeholder="사이트 원본 URL">
                                <input type="text" id="${modalId}-poster-url-final" class="pmh-input-text" readonly style="background:#222; color:#888; margin-top:4px;" placeholder="최종 적용 URL (자동 생성)">
                            </div>
                            <div class="pmh-form-group" style="flex:1;">
                                <label class="pmh-form-label">랜드스케이프 커버 URL (Landscape)</label>
                                <input type="text" id="${modalId}-landscape-url" class="pmh-input-text" placeholder="사이트 원본 URL">
                                <input type="text" id="${modalId}-landscape-url-final" class="pmh-input-text" readonly style="background:#222; color:#888; margin-top:4px;" placeholder="최종 적용 URL (자동 생성)">
                            </div>
                        </div>
                        <div class="pmh-form-group">
                            <label class="pmh-form-label">팬아트 이미지 URLs (엔터로 구분)</label>
                            <textarea id="${modalId}-fanarts" class="pmh-input-text" style="height:55px; resize:vertical;" placeholder="https://..."></textarea>
                        </div>

                        <!-- 예고편 및 프리뷰 클립 분리 관리 영역 -->
                        <div class="pmh-form-group" style="background:rgba(255,255,255,0.02); border:1px solid #343a40; padding:10px; border-radius:4px;">
                            <!-- 공식 예고편 영역 -->
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                                <label class="pmh-form-label" style="margin:0; color:#fff;"><i class="fas fa-film"></i> 공식 예고편 (Official Trailer)</label>
                                <button type="button" class="pmh-crop-btn" id="${modalId}-btn-play-trailer" style="display:none; color:#2f96b4 !important; font-size:11px; padding:2px 8px !important;" title="공식 예고편 재생">🎬 공식 트레일러 재생</button>
                            </div>
                            <input type="text" id="${modalId}-trailer-url" class="pmh-input-text" placeholder="공식 예고편 스트림 URL이 없습니다. (수동 입력 가능)">

                            <!-- 자체 생성 프리뷰 클립 영역 -->
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-top:10px; padding-top:8px; border-top:1px solid #343a40;">
                                <div style="display:flex; align-items:center; gap:6px;">
                                    <span style="font-size:12px; font-weight:bold; color:#aaa;">자체 프리뷰 클립 (Preview Clip)</span>
                                    <span id="${modalId}-badge-preview-status" style="font-size:10px; padding:1px 6px; border-radius:3px; background:#444; color:#ccc;">미생성</span>
                                </div>
                                <div style="display:flex; gap:5px;">
                                    <button type="button" class="pmh-crop-btn" id="${modalId}-btn-play-preview" style="display:none; color:#51a351 !important; font-size:11px; padding:2px 8px !important;" title="생성된 프리뷰 클립 재생">▶ 프리뷰 재생</button>
                                    <button type="button" class="pmh-crop-btn" id="${modalId}-btn-create-preview" style="color:#e5a00d !important; font-size:11px; padding:2px 8px !important;" title="원본 영상에서 프리뷰 클립 수동 생성">⚡ 프리뷰 생성</button>
                                    <button type="button" class="pmh-crop-btn" id="${modalId}-btn-delete-preview" style="display:none; color:#bd362f !important; font-size:11px; padding:2px 8px !important;" title="생성된 프리뷰 클립 및 파일 삭제">🗑️ 프리뷰 삭제</button>
                                </div>
                            </div>

                            <div id="${modalId}-div-preview-box" style="margin-top:6px; display:none;">
                                <div style="display:flex; gap:6px;">
                                    <input type="text" id="${modalId}-preview-url" class="pmh-input-text" readonly style="flex:1; background:#222; color:#aaa;" placeholder="등록된 프리뷰 주소가 없습니다.">
                                    <button type="button" class="pmh-crop-btn" id="${modalId}-btn-copy-preview-url" title="프리뷰 스트림 주소 클립보드 복사" style="padding:0 10px !important;">📋 복사</button>
                                </div>
                                <div id="${modalId}-preview-info" style="font-size:11px; color:#2f96b4; margin-top:4px;"></div>
                            </div>
                        </div>

                        <div class="pmh-form-group">
                            <label class="pmh-form-label">정보 출처 URL</label>
                            <div style="display:flex; gap:6px;">
                                <input type="text" id="${modalId}-info-url" class="pmh-input-text" readonly style="flex:1; background:#222; color:#aaa;">
                                <button type="button" class="pmh-crop-btn pmh-crop-btn-primary" id="${modalId}-btn-open-source">🔗 열기</button>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 푸터 툴바 -->
                <div class="pmh-db-footer">
                    <div style="display:flex; gap:6px; align-items:center;">
                        <button type="button" class="pmh-crop-btn" id="${modalId}-btn-json"><i class="fas fa-code"></i> JSON</button>
                        
                        <div style="position:relative; display:inline-block;" id="${modalId}-wrap-img-tools">
                            <button type="button" class="pmh-crop-btn" id="${modalId}-btn-img-menu"><i class="fas fa-image"></i> 이미지 관리 ▾</button>
                            <div id="${modalId}-img-dropdown" style="display:none; position:absolute; bottom:100%; left:0; margin-bottom:4px; background:#1a1d21; border:1px solid #444; border-radius:4px; box-shadow:0 4px 12px rgba(0,0,0,0.8); z-index:10; min-width:160px; overflow:hidden;">
                                <a href="#" id="${modalId}-action-crop" style="display:block; padding:8px 12px; color:#ddd; font-size:12px; text-decoration:none;" onmouseover="this.style.background='#333'" onmouseout="this.style.background='transparent'">✏️ 포스터 크롭 에디터</a>
                                <a href="#" id="${modalId}-action-sync-img" style="display:block; padding:8px 12px; color:#2f96b4; font-size:12px; text-decoration:none;" onmouseover="this.style.background='#333'" onmouseout="this.style.background='transparent'">🔄 이미지 재동기화</a>
                            </div>
                        </div>

                        <div style="position:relative; display:inline-block;" id="${modalId}-wrap-meta-tools">
                            <button type="button" class="pmh-crop-btn" id="${modalId}-btn-meta-menu"><i class="fas fa-sync-alt"></i> 메타 갱신 ▾</button>
                            <div id="${modalId}-meta-dropdown" style="display:none; position:absolute; bottom:100%; left:0; margin-bottom:4px; background:#1a1d21; border:1px solid #444; border-radius:4px; box-shadow:0 4px 12px rgba(0,0,0,0.8); z-index:10; min-width:180px; overflow:hidden;">
                                <a href="#" id="${modalId}-action-inplace" style="display:block; padding:8px 12px; color:#ddd; font-size:12px; text-decoration:none;" onmouseover="this.style.background='#333'" onmouseout="this.style.background='transparent'">📌 현재 사이트 제자리 갱신</a>
                                <a href="#" id="${modalId}-action-autosearch" style="display:block; padding:8px 12px; color:#51a351; font-size:12px; text-decoration:none;" onmouseover="this.style.background='#333'" onmouseout="this.style.background='transparent'">🔍 전체 우선순위 자동 재검색</a>
                            </div>
                        </div>
                    </div>

                    <div style="display:flex; gap:8px;">
                        <button type="button" class="pmh-crop-btn pmh-meta-modal-cancel">취소</button>
                        <button type="button" class="pmh-crop-btn pmh-crop-btn-active" id="${modalId}-btn-save" style="padding:0 15px !important;"><i class="fas fa-save"></i> DB 저장 및 리매칭</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(m);
        m.style.display = 'flex';

        const card = m.querySelector(`#${modalId}-card`);
        const header = m.querySelector(`#${modalId}-header`);
        makeVideoCardDraggable(card, header);
        makeVideoCardResizable(card);

        const closeThisModal = () => m.remove();
        m.querySelector('.pmh-meta-modal-close').onclick = closeThisModal;
        m.querySelector('.pmh-meta-modal-cancel').onclick = closeThisModal;

        let isMouseDownOnBackdrop = false;
        m.onmousedown = (e) => { isMouseDownOnBackdrop = (e.target === m); };
        m.onmouseup = (e) => {
            if (isMouseDownOnBackdrop && e.target === m) closeThisModal();
            isMouseDownOnBackdrop = false;
        };

        const imgDrop = m.querySelector(`#${modalId}-img-dropdown`);
        m.querySelector(`#${modalId}-btn-img-menu`).onclick = (e) => { e.stopPropagation(); imgDrop.style.display = imgDrop.style.display === 'block' ? 'none' : 'block'; };
        const refDrop = m.querySelector(`#${modalId}-meta-dropdown`);
        m.querySelector(`#${modalId}-btn-meta-menu`).onclick = (e) => { e.stopPropagation(); refDrop.style.display = refDrop.style.display === 'block' ? 'none' : 'block'; };
        m.onclick = (e) => {
            if (!e.target.closest(`#${modalId}-wrap-img-tools`)) imgDrop.style.display = 'none';
            if (!e.target.closest(`#${modalId}-wrap-meta-tools`)) refDrop.style.display = 'none';
        };

        // CSS !important를 무력화하는 버튼 표시/제거 전용 제어 헬퍼
        const setBtnDisplay = (el, show) => {
            if (!el) return;
            if (show) el.style.setProperty('display', 'inline-flex', 'important');
            else el.style.setProperty('display', 'none', 'important');
        };

        // 모달 내부 인플레이스(In-Place) 즉시 데이터 로드 및 렌더러 함수
        const loadModalDataInPlace = async (showToastOnSuccess = false) => {
            const loadingDiv = m.querySelector(`#${modalId}-loading`);
            const formDiv = m.querySelector(`#${modalId}-form`);

            loadingDiv.style.display = 'flex';
            formDiv.style.display = 'none';

            try {
                const res = await PmhFfBridge.callMetaApi(srvConfig, 'get_meta_by_code', cleanCode, category);
                const resCode = res?.data?.code || '';
                const isExactMatch = (resCode.toLowerCase() === cleanCode.toLowerCase());

                // 응답이 없거나, 실패했거나, 요청한 코드와 100% 일치하지 않는 차선 데이터인 경우 즉시 거부
                if (!res || res.ret !== 'success' || !res.data || !isExactMatch) {
                    if (res?.data && !isExactMatch) {
                        warnLog(`[Meta DB Modal] ⚠️ 요청 코드 [${cleanCode}]와 응답 코드 [${resCode}] 불일치. FF 차선 데이터를 거부합니다.`);
                    }
                    toastr.warning(`FF DB에 해당 작품 [${cleanCode}]의 메타데이터가 존재하지 않습니다.<br>상단의 [클린 리매칭]을 먼저 실행해주세요.`);
                    closeThisModal();
                    return;
                }

                const row = res.data;
                let jd = row.json_data;
                if (typeof jd === 'string') { try { jd = JSON.parse(jd); } catch (e) { jd = {}; } }
                if (!jd) jd = {};

                currentEditMetaContext = { row, jd, itemId, serverId, cleanCode, category, srvConfig, modalId };

                // 필드값 바인딩
                m.querySelector(`#${modalId}-code`).value = row.code || cleanCode;
                m.querySelector(`#${modalId}-ui-code`).value = row.ui_code || jd.ui_code || row.code || cleanCode;
                m.querySelector(`#${modalId}-site`).value = row.site || jd.site || '';
                m.querySelector(`#${modalId}-rating`).value = jd.rating || row.rating || '';
                m.querySelector(`#${modalId}-premiered`).value = jd.premiered || row.premiered || '';
                m.querySelector(`#${modalId}-year`).value = jd.year || row.year || '';
                m.querySelector(`#${modalId}-runtime`).value = jd.runtime || row.runtime || '';
                m.querySelector(`#${modalId}-studio`).value = jd.studio || row.studio || '';
                m.querySelector(`#${modalId}-series`).value = jd.series || row.series || '';
                m.querySelector(`#${modalId}-director`).value = jd.director || row.director || '';
                m.querySelector(`#${modalId}-genres`).value = (jd.genre && Array.isArray(jd.genre)) ? jd.genre.join(', ') : (row.genres || '');
                m.querySelector(`#${modalId}-tagline`).value = jd.tagline || row.tagline || '';
                m.querySelector(`#${modalId}-plot`).value = jd.plot || row.plot || '';
                m.querySelector(`#${modalId}-input-title`).value = row.title || jd.title || '';

                const origThumb = (jd.original && jd.original.thumb) ? jd.original.thumb : {};
                m.querySelector(`#${modalId}-poster-url`).value = origThumb.poster || '';
                m.querySelector(`#${modalId}-poster-url-final`).value = row.poster_url || '';
                m.querySelector(`#${modalId}-landscape-url`).value = origThumb.landscape || '';

                let finalPl = '';
                if (jd.thumb && Array.isArray(jd.thumb)) {
                    const plItem = jd.thumb.find(t => t && t.aspect === 'landscape');
                    if (plItem) finalPl = plItem.value;
                }
                m.querySelector(`#${modalId}-landscape-url-final`).value = finalPl;

                const fanarts = (jd.original && Array.isArray(jd.original.fanart)) ? jd.original.fanart : (jd.fanart || []);
                m.querySelector(`#${modalId}-fanarts`).value = fanarts.join('\n');

                // 공식 예고편 제어
                let officialTrailerUrl = '';
                if (jd.original && Array.isArray(jd.original.extras) && jd.original.extras[0]) officialTrailerUrl = jd.original.extras[0].content_url || '';
                if (!officialTrailerUrl && jd.extras && Array.isArray(jd.extras) && jd.extras[0]) officialTrailerUrl = jd.extras[0].content_url || '';
                if (officialTrailerUrl.includes('mode=preview_')) officialTrailerUrl = '';

                m.querySelector(`#${modalId}-trailer-url`).value = officialTrailerUrl;

                const btnPlayTrailer = m.querySelector(`#${modalId}-btn-play-trailer`);
                const updateTrailerBtn = (urlVal) => {
                    if (urlVal && !urlVal.includes('mode=preview_')) {
                        setBtnDisplay(btnPlayTrailer, true);
                        btnPlayTrailer.onclick = (e) => {
                            e.preventDefault();
                            const playUrl = getFfMediaProxyUrl(srvConfig, urlVal, row.site, 'video', category);
                            showVideoModal(playUrl, `[공식 트레일러] ${row.title || cleanCode}`);
                        };
                    } else {
                        setBtnDisplay(btnPlayTrailer, false);
                    }
                };
                updateTrailerBtn(officialTrailerUrl);

                m.querySelector(`#${modalId}-trailer-url`).oninput = (e) => updateTrailerBtn(e.target.value.trim());

                // 자체 프리뷰 클립 제어
                const extraData = (jd.extra_info && typeof jd.extra_info === 'object') ? jd.extra_info : (row.extra_info || {});
                const previewClip = extraData.preview_clip;
                const btnPlayPreview = m.querySelector(`#${modalId}-btn-play-preview`);
                const btnCreatePreview = m.querySelector(`#${modalId}-btn-create-preview`);
                const btnDeletePreview = m.querySelector(`#${modalId}-btn-delete-preview`);
                const badgePreviewStatus = m.querySelector(`#${modalId}-badge-preview-status`);
                const divPreviewBox = m.querySelector(`#${modalId}-div-preview-box`);
                const previewUrlInput = m.querySelector(`#${modalId}-preview-url`);
                const previewInfoDiv = m.querySelector(`#${modalId}-preview-info`);

                let previewStreamUrl = '';
                if (previewClip) {
                    const isUncen = (category === 'JAV_UNCEN');
                    const videoEndpoint = isUncen ? 'jav_video_un' : 'jav_video';
                    let ffBase = (srvConfig && srvConfig.ff_ddns) ? srvConfig.ff_ddns : '';
                    if (!ffBase) ffBase = `${srvConfig.relayUrl}/ff_metadata`;
                    ffBase = ffBase.replace(/\/+$/, '');

                    if (previewClip.storage_type === 'gdrive' && previewClip.google_fileid) {
                        previewStreamUrl = `${ffBase}/metadata/normal/${videoEndpoint}?mode=preview_gdrive&fileid=${previewClip.google_fileid}&cat=${category}`;
                    } else if (previewClip.local_path) {
                        previewStreamUrl = `${ffBase}/metadata/normal/${videoEndpoint}?mode=preview_local&path=${encodeURIComponent(previewClip.local_path)}`;
                    }
                }

                previewUrlInput.value = previewStreamUrl;

                const hasValidPreview = !!(previewClip && (previewClip.google_fileid || previewClip.local_path));
                if (hasValidPreview) {
                    setBtnDisplay(btnPlayPreview, true);
                    setBtnDisplay(btnDeletePreview, true);
                    btnCreatePreview.innerHTML = '<i class="fas fa-bolt"></i> 프리뷰 재생성';
                    setBtnDisplay(btnCreatePreview, true);

                    badgePreviewStatus.style.background = '#28a745';
                    badgePreviewStatus.style.color = '#fff';
                    badgePreviewStatus.innerText = '등록됨';
                    divPreviewBox.style.setProperty('display', 'block', 'important');

                    const storageLabel = (previewClip.storage_type === 'gdrive') ? '구글 드라이브' : '로컬 디스크';
                    previewInfoDiv.innerText = `🎞️ 프리뷰 클립 등록됨: [${storageLabel}] ${previewClip.duration || 60}초 (${previewClip.created_time || ''})`;
                    previewInfoDiv.style.setProperty('display', 'block', 'important');

                    btnPlayPreview.onclick = (e) => {
                        e.preventDefault();
                        if (previewStreamUrl) showVideoModal(previewStreamUrl, `[프리뷰] ${row.title || cleanCode}`);
                    };

                    btnDeletePreview.onclick = async (e) => {
                        e.preventDefault();
                        if (!confirm("⚠️ 등록된 프리뷰 클립 파일을 완전히 삭제하시겠습니까?")) return;
                        btnDeletePreview.disabled = true;
                        try {
                            const delRes = await PmhFfBridge.callMetaApi(srvConfig, 'delete_preview_clip', cleanCode, category);
                            if (delRes && delRes.ret === 'success') {
                                toastr.success("프리뷰 클립이 삭제되었습니다.");
                                await loadModalDataInPlace();
                            } else {
                                toastr.warning(delRes?.msg || "삭제 실패");
                            }
                        } catch (err) {
                            toastr.error(`오류 발생: ${err.message || err}`);
                        } finally {
                            btnDeletePreview.disabled = false;
                        }
                    };
                } else {
                    setBtnDisplay(btnPlayPreview, false);
                    setBtnDisplay(btnDeletePreview, false);
                    btnCreatePreview.innerHTML = '<i class="fas fa-bolt"></i> 프리뷰 생성';
                    setBtnDisplay(btnCreatePreview, true);

                    badgePreviewStatus.style.background = '#444';
                    badgePreviewStatus.style.color = '#ccc';
                    badgePreviewStatus.innerText = '미생성';
                    divPreviewBox.style.setProperty('display', 'none', 'important');
                    previewInfoDiv.style.setProperty('display', 'none', 'important');
                }

                // 모달 자체 독립 프리뷰 생성/재생성 핸들러
                btnCreatePreview.onclick = async (e) => {
                    e.preventDefault();
                    if (btnCreatePreview.dataset.processing === 'true') {
                        toastr.info("이미 프리뷰 생성이 진행 중입니다.");
                        return;
                    }

                    // 동영상 경로 산출 (extra_info 또는 상세 캐시의 versions 참조)
                    const detailCache = getMemoryCache(`D_${serverId}_${itemId}`) || {};
                    const versions = detailCache.versions || [];
                    let bestVideoPath = (extraData && extraData.source_video_path) || '';
                    if (!bestVideoPath && versions.length > 0) {
                        bestVideoPath = findBestVideoPath(versions);
                    }

                    if (!bestVideoPath) {
                        toastr.warning("대상 동영상 파일 경로를 찾을 수 없습니다.");
                        return;
                    }

                    const fileName = bestVideoPath.split(/[\\/]/).pop() || bestVideoPath;
                    if (!confirm(`[${cleanCode}] 프리뷰 클립(몽타주) 생성을 요청하시겠습니까?\n\n• 대상: ${fileName}\n• 대기 시간: 최대 5분\n\n완료되면 Plex 클린 리매칭이 자동 수행됩니다.`)) return;

                    btnCreatePreview.dataset.processing = 'true';
                    const origHtml = btnCreatePreview.innerHTML;
                    btnCreatePreview.innerHTML = `<i class="fas fa-spinner fa-spin"></i> 생성 중...`;
                    toastr.info("FF에 프리뷰 클립 생성을 요청했습니다.<br>동영상 인코딩 중입니다. 잠시 기다려주세요...", "프리뷰 생성 중", { timeOut: 15000 });

                    try {
                        const postPayload = { code: cleanCode, cat: category, video_path: bestVideoPath };
                        infoLog(`[Preview Clip] FF make_preview_clip 요청 전송:`, postPayload);

                        const res = await makeRequest(`${srvConfig.relayUrl}/ff_metadata/api/meta_db/make_preview_clip`, 'POST', postPayload, ClientSettings.masterApiKey, null, 300000);
                        if (res && res.ret === 'success') {
                            toastr.success("프리뷰 클립 생성 완료!<br>Plex 클린 리매칭을 시작합니다.", "성공", { timeOut: 5000 });

                            const plexSrv = extractPlexServerInfo(serverId);
                            if (plexSrv && itemId) {
                                triggerPlexMediaAction(itemId, 'match', plexSrv, srvConfig, {
                                    _try_refresh_first: false,
                                    _do_unmatch_first: true,
                                    _skip_sim_check: true
                                }).then(() => {
                                    deleteMemoryCache(`D_${serverId}_${itemId}`);
                                    if (typeof processDetail === 'function') processDetail(true);
                                }).catch(err => warnLog(`[Preview Clip] 리매칭 백그라운드 오류: ${err}`));
                            }

                            await loadModalDataInPlace(true);
                        } else {
                            toastr.error(res?.msg || "프리뷰 클립 생성 실패", "오류");
                        }
                    } catch (err) {
                        errorLog("[Preview Clip] 프리뷰 생성 중 오류:", err);
                        toastr.error(`오류 발생: ${err.message || err}`, "오류");
                    } finally {
                        btnCreatePreview.innerHTML = origHtml;
                        delete btnCreatePreview.dataset.processing;
                    }
                };

                m.querySelector(`#${modalId}-btn-copy-preview-url`).onclick = (e) => {
                    e.preventDefault();
                    if (previewStreamUrl) copyTextToClipboard(previewStreamUrl, '프리뷰 재생 주소가 복사되었습니다.');
                    else toastr.warning('등록된 프리뷰 주소가 없습니다.');
                };

                const infoUrl = (jd.extra_info && jd.extra_info.info_url) || row.info_url || '';
                m.querySelector(`#${modalId}-info-url`).value = infoUrl;
                m.querySelector(`#${modalId}-btn-open-source`).onclick = () => { if (infoUrl) window.open(infoUrl, '_blank'); else toastr.warning("출처 URL이 없습니다."); };

                // 썸네일 캐러셀 렌더링
                const galleryList = buildGalleryListFromRow(row, jd, srvConfig);
                let pIdx = 0;
                const pImg = m.querySelector(`#${modalId}-p-img`);
                const pType = m.querySelector(`#${modalId}-p-type`);
                const pCounter = m.querySelector(`#${modalId}-p-counter`);

                const renderThumbPreview = (idx) => {
                    if (galleryList.length === 0) {
                        pImg.src = getFfMediaProxyUrl(srvConfig, row.poster_url, row.site, 'image', category) || '';
                        pType.innerText = 'Poster';
                        pType.style.background = 'rgba(0, 123, 255, 0.75)';
                        pType.style.color = '#ffffff';
                        pType.style.border = '1px solid rgba(255, 255, 255, 0.3)';
                        pCounter.innerText = '0 / 0';
                        return;
                    }
                    pIdx = (idx + galleryList.length) % galleryList.length;
                    const curItem = galleryList[pIdx];
                    pImg.src = getFfMediaProxyUrl(srvConfig, curItem.url, row.site, 'image', category);
                    pType.innerText = curItem.type || 'Poster';
                    pCounter.innerText = `${pIdx + 1} / ${galleryList.length}`;

                    // 로컬 서버 최종본은 파란색, 사이트 원본은 어두운 반투명 검은색 뱃지로 분기
                    if (curItem.is_final) {
                        pType.style.background = 'rgba(0, 123, 255, 0.75)';
                        pType.style.color = '#ffffff';
                        pType.style.border = '1px solid rgba(255, 255, 255, 0.3)';
                    } else {
                        pType.style.background = 'rgba(0, 0, 0, 0.55)';
                        pType.style.color = '#e0e6ed';
                        pType.style.border = '1px solid rgba(255, 255, 255, 0.15)';
                    }
                };

                renderThumbPreview(0);

                m.querySelector(`#${modalId}-btn-meta-prev`).onclick = () => renderThumbPreview(pIdx - 1);
                m.querySelector(`#${modalId}-btn-meta-next`).onclick = () => renderThumbPreview(pIdx + 1);
                pImg.onclick = () => {
                    if (galleryList.length > 0) {
                        const proxyGallery = galleryList.map(item => ({
                            ...item,
                            url: getFfMediaProxyUrl(srvConfig, item.url, row.site, 'image', category)
                        }));
                        openImageEnlargeModal(proxyGallery, pIdx, `[${cleanCode}] ${row.title || ''}`);
                    }
                };

                // 출연 배우 렌더링
                const actorsList = Array.isArray(jd.actor) ? jd.actor.slice() : [];
                currentEditMetaContext.actors = actorsList;

                const renderMetaActors = () => {
                    const cont = m.querySelector(`#${modalId}-actors-container`);
                    cont.innerHTML = '';
                    if (currentEditMetaContext.actors.length === 0) {
                        cont.innerHTML = '<span style="color:#777; font-size:11px;">등록된 배우가 없습니다.</span>';
                        return;
                    }
                    currentEditMetaContext.actors.forEach((act, aIdx) => {
                        const dName = typeof act === 'object' ? (act.name_ko || act.name_org || act.name || '배우') : act;
                        const subName = (typeof act === 'object' && act.name_org && act.name_org !== dName) ? ` (${act.name_org})` : '';
                        const aBadge = document.createElement('span');
                        aBadge.className = 'pmh-db-badge';
                        aBadge.innerHTML = `<span>${dName}${subName}</span><i class="fas fa-times pmh-db-badge-del" title="삭제"></i>`;
                        
                        aBadge.querySelector('span').onclick = (e) => {
                            e.stopPropagation();
                            const targetActorId = typeof act === 'object' ? (act.actor_idx || act.person_idx || act.name_org || dName) : act;
                            openPmhPersonDbModal(targetActorId, (category === 'WESTERN' ? 'WESTERN' : 'JAV'), srvConfig, serverId);
                        };

                        aBadge.querySelector('.pmh-db-badge-del').onclick = (e) => {
                            e.stopPropagation();
                            currentEditMetaContext.actors.splice(aIdx, 1);
                            renderMetaActors();
                        };
                        cont.appendChild(aBadge);
                    });
                };
                renderMetaActors();

                m.querySelector(`#${modalId}-btn-add-actor`).onclick = () => {
                    openPmhActorSearchModal(category, srvConfig, (selectedActor) => {
                        currentEditMetaContext.actors.push({
                            name_org: selectedActor.name_org || '',
                            name_ko: selectedActor.name_ko || '',
                            name_en: selectedActor.name_en || '',
                            thumb: selectedActor.thumb || '',
                            actor_idx: selectedActor.person_idx || '',
                            role: '출연'
                        });
                        renderMetaActors();
                    });
                };

                // 하단 드롭다운 인플레이스(In-Place) 즉시 갱신 연계
                m.querySelector(`#${modalId}-btn-json`).onclick = () => {
                    const currentPayload = {
                        ...jd,
                        code: cleanCode,
                        ui_code: m.querySelector(`#${modalId}-ui-code`).value.trim() || cleanCode,
                        site: m.querySelector(`#${modalId}-site`).value.trim() || row.site || '',
                        title: m.querySelector(`#${modalId}-input-title`).value.trim() || row.title || cleanCode,
                        tagline: m.querySelector(`#${modalId}-tagline`).value.trim(),
                        plot: m.querySelector(`#${modalId}-plot`).value.trim(),
                        studio: m.querySelector(`#${modalId}-studio`).value.trim(),
                        series: m.querySelector(`#${modalId}-series`).value.trim(),
                        director: m.querySelector(`#${modalId}-director`).value.trim(),
                        premiered: m.querySelector(`#${modalId}-premiered`).value.trim(),
                        year: parseInt(m.querySelector(`#${modalId}-year`).value, 10) || 0,
                        runtime: parseInt(m.querySelector(`#${modalId}-runtime`).value, 10) || 0,
                        rating: parseFloat(m.querySelector(`#${modalId}-rating`).value) || 0.0,
                        genre: m.querySelector(`#${modalId}-genres`).value.split(',').map(g => g.trim()).filter(Boolean),
                        actor: currentEditMetaContext.actors || []
                    };
                    openPmhJsonViewerModal(`[${cleanCode}] 메타데이터 JSON 원본`, currentPayload);
                };
                m.querySelector(`#${modalId}-action-crop`).onclick = (e) => { e.preventDefault(); openPosterCropModal(itemId, serverId, rawGuid, optTitle); };
                m.querySelector(`#${modalId}-action-sync-img`).onclick = async (e) => {
                    e.preventDefault();
                    toastr.info("이미지 재동기화를 요청합니다...");
                    await PmhFfBridge.callMetaApi(srvConfig, 'db_refresh_image_only', cleanCode);
                    toastr.success("이미지 재동기화 완료");
                    await loadModalDataInPlace();
                };
                m.querySelector(`#${modalId}-action-inplace`).onclick = async (e) => {
                    e.preventDefault();
                    toastr.info("현재 사이트 제자리 갱신 요청 중...");
                    await PmhFfBridge.callMetaApi(srvConfig, 'db_refresh_in_place', cleanCode);
                    toastr.success("제자리 갱신 완료");
                    await loadModalDataInPlace();
                };
                m.querySelector(`#${modalId}-action-autosearch`).onclick = async (e) => {
                    e.preventDefault();
                    toastr.info("전체 사이트 자동 재검색 갱신 중...");
                    await PmhFfBridge.callMetaApi(srvConfig, 'db_refresh_auto_search', cleanCode);
                    toastr.success("재검색 갱신 완료");
                    await loadModalDataInPlace();
                };

                loadingDiv.style.display = 'none';
                formDiv.style.display = 'block';

                if (showToastOnSuccess) {
                    toastr.success("모달 데이터가 즉시 갱신되었습니다.");
                }

            } catch (err) {
                errorLog("[Meta DB Modal] 로드 실패:", err);
                toastr.error(`데이터 조회 오류: ${err.message || err}`);
                closeThisModal();
            }
        };

        // 초기 데이터 로드 시작
        await loadModalDataInPlace(false);

        // DB 저장 버튼 핸들러 (Plex 리매칭을 블로킹하지 않고 즉시 닫힘 처리)
        m.querySelector(`#${modalId}-btn-save`).onclick = async function() {
            if (!currentEditMetaContext) return;
            const btn = this;
            btn.disabled = true;
            btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> FF 저장 중...`;

            try {
                const { row, jd, cleanCode, srvConfig, itemId, serverId } = currentEditMetaContext;
                const payload = JSON.parse(JSON.stringify(jd));

                payload.code = cleanCode;
                payload.ui_code = m.querySelector(`#${modalId}-ui-code`).value.trim() || cleanCode;
                payload.title = m.querySelector(`#${modalId}-input-title`).value.trim() || row.title || cleanCode;
                payload.tagline = m.querySelector(`#${modalId}-tagline`).value.trim();
                payload.plot = m.querySelector(`#${modalId}-plot`).value.trim();
                payload.studio = m.querySelector(`#${modalId}-studio`).value.trim();
                payload.series = m.querySelector(`#${modalId}-series`).value.trim();
                payload.director = m.querySelector(`#${modalId}-director`).value.trim();
                payload.premiered = m.querySelector(`#${modalId}-premiered`).value.trim();
                payload.year = parseInt(m.querySelector(`#${modalId}-year`).value, 10) || 0;
                payload.runtime = parseInt(m.querySelector(`#${modalId}-runtime`).value, 10) || 0;
                payload.rating = parseFloat(m.querySelector(`#${modalId}-rating`).value) || 0.0;

                const genreText = m.querySelector(`#${modalId}-genres`).value.trim();
                payload.genre = genreText ? genreText.split(',').map(g => g.trim()).filter(Boolean) : [];
                payload.actor = currentEditMetaContext.actors;

                const editedTrailer = m.querySelector(`#${modalId}-trailer-url`).value.trim();
                if (editedTrailer) {
                    payload.original.extras = [{ content_url: editedTrailer, content_type: 'trailer' }];
                    payload.extras = [{
                        mode: 'mp4',
                        title: payload.title || payload.tagline,
                        content_url: getFfMediaProxyUrl(srvConfig, editedTrailer, row.site, 'video', category),
                        content_type: 'trailer'
                    }];
                } else {
                    payload.original.extras = [];
                    payload.extras = [];
                }

                const previewUrlVal = m.querySelector(`#${modalId}-preview-url`).value.trim();
                if (payload.extra_info && payload.extra_info.preview_clip) {
                    if (previewUrlVal) payload.extra_info.preview_clip.stream_url = previewUrlVal;
                    if (!editedTrailer && previewUrlVal) {
                        payload.extras = [{
                            mode: 'mp4',
                            title: '[Preview] ' + (payload.title || payload.tagline || cleanCode),
                            content_url: previewUrlVal,
                            content_type: 'trailer'
                        }];
                    }
                }

                // FF DB에 즉시 저장
                const saveRes = await PmhFfBridge.callMetaApi(srvConfig, 'db_edit_save', cleanCode, JSON.stringify(payload));
                if (!saveRes || saveRes.ret !== 'success') throw new Error(saveRes?.msg || "FF DB 저장 실패");

                // 저장 완료 즉시 모달 닫기 (Plex 리매칭을 기다리지 않음)
                toastr.success("FF DB 저장 완료! (Plex 리매칭은 백그라운드에서 진행됩니다)", "저장 성공");
                closeThisModal();

                // 상세페이지 캐시 무효화
                deleteMemoryCache(`D_${serverId}_${itemId}`);

                // Plex 클린 리매칭은 백그라운드 비동기로 넘겨 완료 시 상세 화면 자동 갱신
                const plexSrv = extractPlexServerInfo(serverId);
                if (plexSrv && itemId) {
                    triggerPlexMediaAction(itemId, 'match', plexSrv, srvConfig, {
                        _try_refresh_first: false,
                        _do_unmatch_first: true,
                        _skip_sim_check: true
                    }).then(() => {
                        infoLog(`[Meta DB Save] 백그라운드 Plex 리매칭 완료 (Item: ${itemId})`);
                        deleteMemoryCache(`D_${serverId}_${itemId}`);
                        if (typeof processDetail === 'function') processDetail(true);
                    }).catch(err => {
                        warnLog(`[Meta DB Save] 백그라운드 Plex 리매칭 실패: ${err.message || err}`);
                    });
                }

            } catch (err) {
                errorLog("[Meta DB Modal] 저장 실패:", err);
                toastr.error(`저장 실패: ${err.message || err}`, "오류");
                btn.disabled = false;
                btn.innerHTML = `<i class="fas fa-save"></i> DB 저장 및 리매칭`;
            }
        };
    }

    // 범용 텍스트 클립보드 복사 헬퍼
    function copyTextToClipboard(text, successMsg = '클립보드에 복사되었습니다.') {
        if (!text) return;
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(text).then(() => {
                toastr.success(successMsg);
            }).catch(() => {
                fallbackExecCopy(text, successMsg);
            });
        } else {
            fallbackExecCopy(text, successMsg);
        }
    }

    function fallbackExecCopy(text, successMsg) {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        ta.style.top = '0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        try {
            const successful = document.execCommand('copy');
            if (successful) toastr.success(successMsg);
            else toastr.warning('클립보드 복사에 실패했습니다.');
        } catch (err) {
            toastr.warning('클립보드 복사에 실패했습니다.');
        }
        ta.remove();
    }

    // JSON 원본 뷰어 전용 모달
    function openPmhJsonViewerModal(titleText, jsonData) {
        window._pmh_top_z_index = (window._pmh_top_z_index || 10000010) + 10;
        const currentZIndex = window._pmh_top_z_index;

        let defW = Math.min(800, window.innerWidth * 0.9);
        let defH = Math.min(680, window.innerHeight * 0.88);
        let defTop = Math.max(20, (window.innerHeight - defH) / 2);
        let defLeft = Math.max(20, (window.innerWidth - defW) / 2);

        const modalId = `pmh-json-modal-${Date.now()}`;
        const m = document.createElement('div');
        m.id = modalId;
        m.className = 'pmh-db-modal pmh-stacked-modal';
        m.style.zIndex = currentZIndex;

        const jsonFormatted = typeof jsonData === 'string' ? jsonData : JSON.stringify(jsonData || {}, null, 2);

        m.innerHTML = `
            <div id="${modalId}-card" class="pmh-db-card" style="width:${defW}px; height:${defH}px; top:${defTop}px; left:${defLeft}px; position:fixed; z-index:${currentZIndex + 1}; display:flex; flex-direction:column;">
                <div class="pmh-resizer pmh-resizer-n"></div><div class="pmh-resizer pmh-resizer-s"></div>
                <div class="pmh-resizer pmh-resizer-e"></div><div class="pmh-resizer pmh-resizer-w"></div>
                <div class="pmh-resizer pmh-resizer-ne"></div><div class="pmh-resizer pmh-resizer-nw"></div>
                <div class="pmh-resizer pmh-resizer-se"></div><div class="pmh-resizer pmh-resizer-sw"></div>

                <div class="pmh-db-header" id="${modalId}-header">
                    <span style="color:#2f96b4; font-weight:bold; font-size:13.5px;"><i class="fas fa-code" style="margin-right:6px;"></i>${titleText || 'JSON 원본 뷰어'}</span>
                    <button type="button" class="pmh-json-close" style="background:none; border:none; color:#aaa; font-size:16px; cursor:pointer;" onmouseover="this.style.color='#fff'" onmouseout="this.style.color='#aaa'"><i class="fas fa-times"></i></button>
                </div>
                <div class="pmh-db-body" style="padding:10px; background:#0d1117; flex:1 1 auto; display:flex; flex-direction:column; min-height:0; box-sizing:border-box;">
                    <textarea id="${modalId}-textarea" readonly spellcheck="false" style="width:100%; height:100%; flex:1 1 auto; background:#0d1117; color:#58a6ff; border:1px solid #30363d; border-radius:4px; padding:12px; font-family:Consolas, Monaco, monospace; font-size:12px; line-height:1.5; resize:none; box-sizing:border-box; outline:none; white-space:pre;"></textarea>
                </div>
                <div class="pmh-db-footer" style="display:flex; justify-content:space-between; align-items:center;">
                    <button type="button" class="pmh-crop-btn pmh-crop-btn-success" id="${modalId}-btn-copy" style="padding:0 14px !important;"><i class="fas fa-copy"></i> 클립보드 복사</button>
                    <button type="button" class="pmh-crop-btn pmh-json-close">닫기</button>
                </div>
            </div>
        `;
        document.body.appendChild(m);
        m.style.display = 'flex';

        const card = m.querySelector(`#${modalId}-card`);
        const header = m.querySelector(`#${modalId}-header`);
        const textarea = m.querySelector(`#${modalId}-textarea`);
        textarea.value = jsonFormatted;

        makeVideoCardDraggable(card, header);
        makeVideoCardResizable(card);

        const closeThis = () => m.remove();
        m.querySelectorAll('.pmh-json-close').forEach(b => b.onclick = closeThis);

        let isMouseDownOnBackdrop = false;
        m.onmousedown = (e) => { isMouseDownOnBackdrop = (e.target === m); };
        m.onmouseup = (e) => {
            if (isMouseDownOnBackdrop && e.target === m) closeThis();
            isMouseDownOnBackdrop = false;
        };

        m.querySelector(`#${modalId}-btn-copy`).onclick = () => {
            copyTextToClipboard(textarea.value, 'JSON 데이터가 클립보드에 복사되었습니다.');
        };
    }

    // 인물 DB 편집 모달
    async function openPmhPersonDbModal(targetIdentifier, domain, srvConfig, serverId) {
        infoLog(`[Person DB Modal] 👤 인물 DB 모달 호출: [${targetIdentifier}] (${domain})`);

        // serverId 매칭 보장 (누락 방지)
        const activeServerId = serverId || srvConfig?.machineIdentifier || srvConfig?.id || (ServerConfig.SERVERS[0]?.machineIdentifier);

        // 다중 모달 z-index 및 겹침 오프셋 계산
        window._pmh_top_z_index = (window._pmh_top_z_index || 10000010) + 10;
        const currentZIndex = window._pmh_top_z_index;

        const geo = getModalGeometry('person_db');
        let defW = geo.width;
        let defH = geo.height;
        let defTop = geo.top;
        let defLeft = geo.left;

        const modalId = `pmh-person-db-modal-${Date.now()}`;
        const m = document.createElement('div');
        m.id = modalId;
        m.className = 'pmh-db-modal pmh-stacked-modal';
        m.style.zIndex = currentZIndex;

        m.innerHTML = `
            <div id="${modalId}-card" class="pmh-db-card pmh-card-person_db" style="width:${defW}px; height:${defH}px; top:${defTop}px; left:${defLeft}px; position:fixed; z-index:${currentZIndex + 1};">
                <div class="pmh-resizer pmh-resizer-n"></div><div class="pmh-resizer pmh-resizer-s"></div>
                <div class="pmh-resizer pmh-resizer-e"></div><div class="pmh-resizer pmh-resizer-w"></div>
                <div class="pmh-resizer pmh-resizer-ne"></div><div class="pmh-resizer pmh-resizer-nw"></div>
                <div class="pmh-resizer pmh-resizer-se"></div><div class="pmh-resizer pmh-resizer-sw"></div>

                <div class="pmh-db-header" id="${modalId}-header">
                    <span style="color:#e5a00d; font-weight:bold; font-size:14px;"><i class="fas fa-user-edit" style="margin-right:6px;"></i><span id="${modalId}-title">인물 상세 정보 편집</span></span>
                    <button type="button" class="pmh-person-modal-close" style="background:none; border:none; color:#aaa; font-size:16px; cursor:pointer;" onmouseover="this.style.color='#fff'" onmouseout="this.style.color='#aaa'"><i class="fas fa-times"></i></button>
                </div>
                <div class="pmh-db-body" id="${modalId}-body">
                    <div id="${modalId}-loading" style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; color:#e5a00d; gap:10px;">
                        <i class="fas fa-spinner fa-spin fa-2x"></i>
                        <span>FF 인물 DB에서 정보를 조회하고 있습니다...</span>
                    </div>
                    <div id="${modalId}-form" style="display:none;">
                        <input type="hidden" id="${modalId}-thumb-val">
                        <input type="hidden" id="${modalId}-selected-primary-url">

                        <!-- 상단 2열 배치: 260px 프로필 사진 캐러셀(좌) + 2열 입력란(우) -->
                        <div style="display:flex; gap:15px; margin-bottom:15px;">
                            <div style="width:260px; height:360px; flex-shrink:0; display:flex; flex-direction:column; justify-content:space-between; background:#111; padding:8px; border-radius:6px; border:1px solid #333; box-sizing:border-box;">
                                <div style="width:100%; height:306px; background:#000; border-radius:4px; overflow:hidden; display:flex; justify-content:center; align-items:center; position:relative;">
                                    <span id="${modalId}-badge-type" style="position:absolute; top:6px; left:6px; z-index:3; font-size:10px; padding:2px 6px; border-radius:3px; background:rgba(0,123,255,0.75); color:#fff; font-weight:bold;">SERVER</span>
                                    <img id="${modalId}-preview-img" referrerpolicy="no-referrer" src="" style="max-width:100%; max-height:100%; object-fit:cover; cursor:pointer;" title="클릭하여 라이트박스로 크게 보기">
                                </div>
                                <div style="display:flex; justify-content:space-between; align-items:center; height:36px; padding:0 2px;">
                                    <button type="button" class="pmh-crop-btn" id="${modalId}-btn-prev" style="padding:0 8px !important;">&lt; 이전</button>
                                    <button type="button" class="pmh-crop-btn pmh-crop-btn-primary" id="${modalId}-btn-set-primary" style="font-size:10.5px; padding:0 6px !important;" title="현재 사진을 대표 사진으로 설정">★ 대표 지정</button>
                                    <span id="${modalId}-counter" style="font-size:11px; font-weight:bold; color:#2f96b4;">0 / 0</span>
                                    <button type="button" class="pmh-crop-btn" id="${modalId}-btn-next" style="padding:0 8px !important;">다음 &gt;</button>
                                </div>
                            </div>

                            <!-- 2열 속성 폼 -->
                            <div style="flex-grow:1; display:flex; flex-direction:column; gap:8px;">
                                <div style="display:flex; gap:10px;">
                                    <div class="pmh-form-group" style="width:120px; margin:0;">
                                        <label class="pmh-form-label">도메인</label>
                                        <select id="${modalId}-domain" class="pmh-input-select">
                                            <option value="JAV">JAV</option>
                                            <option value="WESTERN">WESTERN</option>
                                            <option value="GENERAL">GENERAL</option>
                                        </select>
                                    </div>
                                    <div class="pmh-form-group" style="flex:1; margin:0;">
                                        <label class="pmh-form-label">식별코드 (Code/ID)</label>
                                        <input type="text" id="${modalId}-idx" class="pmh-input-text" readonly style="background:#222; color:#aaa;">
                                    </div>
                                </div>
                                <div style="display:flex; gap:10px;">
                                    <div class="pmh-form-group" style="flex:1; margin:0;">
                                        <label class="pmh-form-label">원문 이름 (Name ORG)</label>
                                        <input type="text" id="${modalId}-name-org" class="pmh-input-text">
                                    </div>
                                    <div class="pmh-form-group" style="flex:1; margin:0;">
                                        <label class="pmh-form-label">한국어 표기 (Name KO)</label>
                                        <input type="text" id="${modalId}-name-ko" class="pmh-input-text">
                                    </div>
                                </div>
                                <div style="display:flex; gap:10px;">
                                    <div class="pmh-form-group" style="flex:1; margin:0;">
                                        <label class="pmh-form-label">영문 이름 (Name EN)</label>
                                        <input type="text" id="${modalId}-name-en" class="pmh-input-text">
                                    </div>
                                    <div class="pmh-form-group" style="flex:1; margin:0;">
                                        <label class="pmh-form-label">소속사 / 에이전시</label>
                                        <input type="text" id="${modalId}-agency" class="pmh-input-text">
                                    </div>
                                </div>
                                <div style="display:flex; gap:10px;">
                                    <div class="pmh-form-group" style="flex:1; margin:0;">
                                        <label class="pmh-form-label">생년월일 (YYYY-MM-DD)</label>
                                        <input type="text" id="${modalId}-birth" class="pmh-input-text">
                                    </div>
                                    <div class="pmh-form-group" style="flex:1; margin:0;">
                                        <label class="pmh-form-label">신장 (cm)</label>
                                        <input type="number" id="${modalId}-height" class="pmh-input-text">
                                    </div>
                                </div>
                                <div style="display:flex; gap:10px;">
                                    <div class="pmh-form-group" style="flex:1; margin:0;">
                                        <label class="pmh-form-label">혈액형</label>
                                        <input type="text" id="${modalId}-blood" class="pmh-input-text">
                                    </div>
                                    <div class="pmh-form-group" style="flex:1; margin:0;">
                                        <label class="pmh-form-label">취미 / 특기</label>
                                        <input type="text" id="${modalId}-hobby" class="pmh-input-text">
                                    </div>
                                </div>
                                <div class="pmh-form-group" style="margin:0;">
                                    <label class="pmh-form-label">별칭 / 예명 목록 (쉼표 구분)</label>
                                    <input type="text" id="${modalId}-aliases" class="pmh-input-text">
                                </div>
                            </div>
                        </div>

                        <!-- AV 스펙 영역 -->
                        <div id="${modalId}-av-spec-row" style="display:flex; gap:10px; margin-bottom:12px; background:rgba(255,255,255,0.02); border:1px dashed rgba(255,255,255,0.1); padding:8px; border-radius:4px;">
                            <div class="pmh-form-group" style="flex:2; margin:0;">
                                <label class="pmh-form-label" style="color:#2f96b4;">신체 사이즈 (B-W-H)</label>
                                <input type="text" id="${modalId}-body" class="pmh-input-text" placeholder="예: B85-W58-H86">
                            </div>
                            <div class="pmh-form-group" style="flex:1; margin:0;">
                                <label class="pmh-form-label" style="color:#2f96b4;">브라 컵</label>
                                <input type="text" id="${modalId}-bra" class="pmh-input-text" placeholder="예: E컵">
                            </div>
                            <div class="pmh-form-group" style="flex:1.5; margin:0;">
                                <label class="pmh-form-label" style="color:#2f96b4;">데뷔일 (YYYY-MM-DD)</label>
                                <input type="text" id="${modalId}-debut" class="pmh-input-text">
                            </div>
                        </div>

                        <!-- 프로필 이미지 및 정보 출처 URL -->
                        <div class="pmh-form-group" style="margin-top:10px;">
                            <label class="pmh-form-label">프로필 이미지 URLs (엔터로 여러 개 입력)</label>
                            <textarea id="${modalId}-site-img-urls" class="pmh-input-text" style="height:55px; resize:vertical;"></textarea>
                        </div>
                        <div class="pmh-form-group" style="margin-bottom:15px;">
                            <label class="pmh-form-label">정보 출처 URL</label>
                            <div style="display:flex; gap:6px;">
                                <input type="text" id="${modalId}-info-url" class="pmh-input-text" readonly style="flex:1; background:#222; color:#aaa;">
                                <button type="button" class="pmh-crop-btn pmh-crop-btn-primary" id="${modalId}-btn-open-source">🔗 열기</button>
                            </div>
                        </div>

                        <!-- 소장 출연작 목록 (최하단 배치 & 내부 스크롤 해제) -->
                        <div class="pmh-form-group" style="background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.08); padding:10px; border-radius:4px; margin-bottom:0;">
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                                <label class="pmh-form-label" style="margin:0; color:#fff;">소장 출연작 목록 <span class="pmh-db-badge" style="background:#28a745; color:#fff;" id="${modalId}-works-count">0편</span></label>
                                <div style="display:flex; gap:6px;">
                                    <button type="button" class="pmh-crop-btn pmh-crop-btn-primary" id="${modalId}-btn-sync-works" title="실제 소장 메타와 대조하여 최신 제목으로 갱신"><i class="fas fa-sync-alt"></i> 출연작 검증/갱신</button>
                                </div>
                            </div>
                            <div id="${modalId}-works-container" style="display:flex; flex-direction:column; gap:4px; width:100%;"></div>
                        </div>
                    </div>
                </div>
                <div class="pmh-db-footer">
                    <div style="display:flex; gap:6px;">
                        <button type="button" class="pmh-crop-btn" id="${modalId}-btn-json"><i class="fas fa-code"></i> JSON</button>
                    </div>
                    <div style="display:flex; gap:8px;">
                        <button type="button" class="pmh-crop-btn pmh-person-modal-cancel">취소</button>
                        <button type="button" class="pmh-crop-btn pmh-crop-btn-active" id="${modalId}-btn-save"><i class="fas fa-save"></i> 인물 정보 저장</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(m);
        m.style.display = 'flex';

        const card = m.querySelector(`#${modalId}-card`);
        const header = m.querySelector(`#${modalId}-header`);
        makeVideoCardDraggable(card, header);
        makeVideoCardResizable(card);

        const closeThisModal = () => m.remove();
        m.querySelector('.pmh-person-modal-close').onclick = closeThisModal;
        m.querySelector('.pmh-person-modal-cancel').onclick = closeThisModal;

        let isMouseDownOnBackdrop = false;
        m.onmousedown = (e) => { isMouseDownOnBackdrop = (e.target === m); };
        m.onmouseup = (e) => {
            if (isMouseDownOnBackdrop && e.target === m) closeThisModal();
            isMouseDownOnBackdrop = false;
        };

        let rawPersonData = null;

        try {
            const ret = await PmhFfBridge.callPersonApi(srvConfig, 'person_get_detailed', String(targetIdentifier), domain);
            if (!ret || ret.ret !== 'success' || !ret.data) throw new Error(ret?.msg || "인물 데이터 조회 실패");

            const p = ret.data;
            rawPersonData = p;
            const extra = (typeof p.extra_info === 'string') ? JSON.parse(p.extra_info || '{}') : (p.extra_info || {});
            const media = (typeof p.media_src === 'string') ? JSON.parse(p.media_src || '{}') : (p.media_src || {});

            m.querySelector(`#${modalId}-title`).innerText = `[${p.name_ko || p.name_org || targetIdentifier}] 인물 상세 정보 편집`;
            m.querySelector(`#${modalId}-domain`).value = p.domain || domain;
            m.querySelector(`#${modalId}-idx`).value = p.person_idx || targetIdentifier;
            m.querySelector(`#${modalId}-name-org`).value = p.name_org || '';
            m.querySelector(`#${modalId}-name-ko`).value = p.name_ko || '';
            m.querySelector(`#${modalId}-name-en`).value = p.name_en || '';
            m.querySelector(`#${modalId}-aliases`).value = (p.aliases && Array.isArray(p.aliases)) ? p.aliases.join(', ') : (p.other_names || '');
            m.querySelector(`#${modalId}-birth`).value = extra.birth || '';
            m.querySelector(`#${modalId}-height`).value = (extra.height && parseInt(extra.height, 10) > 0) ? String(extra.height) : '';
            m.querySelector(`#${modalId}-blood`).value = extra.blood || '';
            m.querySelector(`#${modalId}-agency`).value = extra.agency || '';
            m.querySelector(`#${modalId}-hobby`).value = extra.hobby || '';
            m.querySelector(`#${modalId}-body`).value = extra.body_size || '';
            m.querySelector(`#${modalId}-bra`).value = extra.bra_size || '';
            m.querySelector(`#${modalId}-debut`).value = extra.debut || '';

            const sitePhotos = Array.isArray(media.site_img_urls) ? media.site_img_urls.filter(Boolean) : [];
            m.querySelector(`#${modalId}-site-img-urls`).value = sitePhotos.join('\n');

            const infoUrl = extra.info_url || p.info_url || '';
            m.querySelector(`#${modalId}-info-url`).value = infoUrl;
            m.querySelector(`#${modalId}-btn-open-source`).onclick = () => { if (infoUrl) window.open(infoUrl, '_blank'); else toastr.warning("출처 URL이 없습니다."); };

            // 사진 캐러셀 목록
            const photoList = [];
            if (p.thumb) photoList.push({ url: p.thumb, type: '대표 사진', is_primary: true });
            sitePhotos.forEach((u, uIdx) => {
                if (u && !photoList.some(it => it.url === u)) {
                    photoList.push({ url: u, type: `사이트 #${uIdx + 1}`, is_primary: false });
                }
            });

            let curPhotoIdx = 0;
            const pImg = m.querySelector(`#${modalId}-preview-img`);
            const pType = m.querySelector(`#${modalId}-badge-type`);
            const pCounter = m.querySelector(`#${modalId}-counter`);

            const renderPhotoItem = (idx) => {
                if (photoList.length === 0) {
                    pImg.src = '';
                    pType.innerText = 'No Photo';
                    pCounter.innerText = '0 / 0';
                    return;
                }
                curPhotoIdx = (idx + photoList.length) % photoList.length;
                const item = photoList[curPhotoIdx];
                pImg.src = getFfMediaProxyUrl(srvConfig, item.url, '', 'image', domain);
                pType.innerText = item.type;
                pCounter.innerText = `${curPhotoIdx + 1} / ${photoList.length}`;
            };
            renderPhotoItem(0);

            m.querySelector(`#${modalId}-btn-prev`).onclick = () => renderPhotoItem(curPhotoIdx - 1);
            m.querySelector(`#${modalId}-btn-next`).onclick = () => renderPhotoItem(curPhotoIdx + 1);

            m.querySelector(`#${modalId}-btn-set-primary`).onclick = () => {
                if (photoList.length === 0) return;
                const cur = photoList[curPhotoIdx];
                m.querySelector(`#${modalId}-thumb-val`).value = cur.url;
                m.querySelector(`#${modalId}-selected-primary-url`).value = cur.url;
                photoList.forEach((it, i) => it.is_primary = (i === curPhotoIdx));
                toastr.success(`[${cur.type}] 이미지가 대표 사진으로 지정되었습니다.`);
            };

            pImg.onclick = () => {
                if (photoList.length > 0) {
                    const proxyPhotos = photoList.map(item => ({ ...item, url: getFfMediaProxyUrl(srvConfig, item.url, '', 'image', domain) }));
                    openImageEnlargeModal(proxyPhotos, curPhotoIdx, `[${p.name_ko || p.name_org}] 프로필 사진`);
                }
            };

            // 소장 출연작 목록 렌더링
            const worksMap = p.works_detailed || p.works || {};
            let totalWorks = 0;
            const worksContainer = m.querySelector(`#${modalId}-works-container`);
            worksContainer.innerHTML = '';

            for (const cat in worksMap) {
                const rawList = worksMap[cat];
                if (Array.isArray(rawList) && rawList.length > 0) {
                    const sortedList = rawList.slice().sort((a, b) => {
                        const tA = (typeof a === 'object' && a) ? (a.title || a.ui_code || a.code || '') : String(a);
                        const tB = (typeof b === 'object' && b) ? (b.title || b.ui_code || b.code || '') : String(b);
                        return tA.localeCompare(tB, 'ko');
                    });

                    totalWorks += sortedList.length;

                    sortedList.forEach(it => {
                        const wCode = (typeof it === 'object' && it) ? (it.code || '') : String(it);
                        const wUiCode = (typeof it === 'object' && it) ? (it.ui_code || wCode) : wCode;
                        const wTitle = (typeof it === 'object' && it) ? (it.title || '') : '';
                        const wYear = (typeof it === 'object' && it && it.year) ? ` (${it.year})` : '';

                        const workRow = document.createElement('div');
                        workRow.className = 'pmh-db-badge';
                        workRow.style.cssText = 'display:flex; justify-content:space-between; align-items:center; padding:6px 10px; width:100%; box-sizing:border-box; margin-bottom:2px; cursor:pointer;';
                        workRow.innerHTML = `
                            <div style="display:flex; align-items:center; gap:6px; min-width:0; flex-grow:1;">
                                <span style="background:#2f96b4; color:#fff; font-size:10px; padding:1px 4px; border-radius:3px; flex-shrink:0;">${cat}</span>
                                <span style="color:#e5a00d; font-weight:bold; font-size:11.5px; flex-shrink:0;">${wUiCode}</span>
                                <span style="color:#ddd; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-size:11.5px;">${wTitle}${wYear}</span>
                            </div>
                            <span style="color:#777; font-size:11px; flex-shrink:0;"><i class="fas fa-edit"></i></span>
                        `;

                        workRow.onclick = (e) => {
                            e.stopPropagation();
                            openPmhMetaDbModal(null, activeServerId, wCode, wTitle);
                        };
                        worksContainer.appendChild(workRow);
                    });
                }
            }

            m.querySelector(`#${modalId}-works-count`).innerText = `${totalWorks}편`;
            if (totalWorks === 0) {
                worksContainer.innerHTML = '<span style="color:#777; font-size:11px; padding:6px 0;">등록된 소장 출연작이 없습니다.</span>';
            }

            m.querySelector(`#${modalId}-btn-sync-works`).onclick = async () => {
                const btn = m.querySelector(`#${modalId}-btn-sync-works`);
                btn.disabled = true;
                btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> 검증 중...`;
                try {
                    const syncRet = await PmhFfBridge.callPersonApi(srvConfig, 'person_verify_works', String(targetIdentifier), domain);
                    if (syncRet && syncRet.ret === 'success') {
                        toastr.success(syncRet.msg || "출연작 검증 및 동기화가 완료되었습니다.");
                        closeThisModal();
                        openPmhPersonDbModal(targetIdentifier, domain, srvConfig, activeServerId);
                    } else {
                        toastr.warning(syncRet?.msg || "출연작 검증 실패");
                    }
                } catch (e) {
                    toastr.error(`오류 발생: ${e.message || e}`);
                } finally {
                    btn.disabled = false;
                    btn.innerHTML = `<i class="fas fa-sync-alt"></i> 출연작 검증/갱신`;
                }
            };

            // 인물 데이터 JSON 원본 전용 뷰어 모달 오픈
            m.querySelector(`#${modalId}-btn-json`).onclick = () => {
                const heightVal = parseInt(m.querySelector(`#${modalId}-height`).value, 10);
                const sitePhotosText = m.querySelector(`#${modalId}-site-img-urls`).value.split(/\r?\n/).map(v => v.trim()).filter(Boolean);
                const aliasesText = m.querySelector(`#${modalId}-aliases`).value.trim();

                const currentPersonPayload = {
                    ...(rawPersonData || p || {}),
                    id: rawPersonData?.id || p?.id || null,
                    domain: m.querySelector(`#${modalId}-domain`).value,
                    person_idx: m.querySelector(`#${modalId}-idx`).value.trim(),
                    name_org: m.querySelector(`#${modalId}-name-org`).value.trim(),
                    name_ko: m.querySelector(`#${modalId}-name-ko`).value.trim(),
                    name_en: m.querySelector(`#${modalId}-name-en`).value.trim(),
                    thumb: m.querySelector(`#${modalId}-thumb-val`).value.trim() || rawPersonData?.thumb || p?.thumb || '',
                    selected_primary_url: m.querySelector(`#${modalId}-selected-primary-url`).value.trim(),
                    aliases: aliasesText ? aliasesText.split(',').map(s => s.trim()).filter(Boolean) : [],
                    birth: m.querySelector(`#${modalId}-birth`).value.trim(),
                    height: (heightVal > 0) ? heightVal : null,
                    blood: m.querySelector(`#${modalId}-blood`).value.trim(),
                    agency: m.querySelector(`#${modalId}-agency`).value.trim(),
                    hobby: m.querySelector(`#${modalId}-hobby`).value.trim(),
                    body_size: m.querySelector(`#${modalId}-body`).value.trim(),
                    bra_size: m.querySelector(`#${modalId}-bra`).value.trim(),
                    debut: m.querySelector(`#${modalId}-debut`).value.trim(),
                    site_img_urls: sitePhotosText,
                    info_url: m.querySelector(`#${modalId}-info-url`).value.trim()
                };

                const displayName = currentPersonPayload.name_ko || currentPersonPayload.name_org || currentPersonPayload.name_en || targetIdentifier;
                openPmhJsonViewerModal(`[${displayName}] 인물 데이터 JSON 원본`, currentPersonPayload);
            };

            m.querySelector(`#${modalId}-loading`).style.display = 'none';
            m.querySelector(`#${modalId}-form`).style.display = 'block';

        } catch (err) {
            errorLog("[Person DB Modal] 로드 실패:", err);
            toastr.error(`인물 데이터 조회 오류: ${err.message || err}`);
            closeThisModal();
            return;
        }

        m.querySelector(`#${modalId}-btn-save`).onclick = async function() {
            if (!rawPersonData) return;
            const btn = this;
            btn.disabled = true;
            btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> 저장 중...`;

            try {
                const heightVal = parseInt(m.querySelector(`#${modalId}-height`).value, 10);
                const sitePhotosText = m.querySelector(`#${modalId}-site-img-urls`).value.split(/\r?\n/).map(v => v.trim()).filter(Boolean);

                const payload = {
                    id: rawPersonData.id || null,
                    domain: m.querySelector(`#${modalId}-domain`).value,
                    person_idx: m.querySelector(`#${modalId}-idx`).value.trim(),
                    name_org: m.querySelector(`#${modalId}-name-org`).value.trim(),
                    name_ko: m.querySelector(`#${modalId}-name-ko`).value.trim(),
                    name_en: m.querySelector(`#${modalId}-name-en`).value.trim(),
                    thumb: m.querySelector(`#${modalId}-thumb-val`).value.trim() || rawPersonData.thumb || '',
                    selected_primary_url: m.querySelector(`#${modalId}-selected-primary-url`).value.trim(),
                    aliases: m.querySelector(`#${modalId}-aliases`).value.trim(),
                    birth: m.querySelector(`#${modalId}-birth`).value.trim(),
                    height: (heightVal > 0) ? heightVal : null,
                    blood: m.querySelector(`#${modalId}-blood`).value.trim(),
                    agency: m.querySelector(`#${modalId}-agency`).value.trim(),
                    hobby: m.querySelector(`#${modalId}-hobby`).value.trim(),
                    body_size: m.querySelector(`#${modalId}-body`).value.trim(),
                    bra_size: m.querySelector(`#${modalId}-bra`).value.trim(),
                    debut: m.querySelector(`#${modalId}-debut`).value.trim(),
                    site_img_urls: sitePhotosText,
                    person_type: 'actor'
                };

                const ret = await PmhFfBridge.callPersonApi(srvConfig, 'person_save', JSON.stringify(payload));
                if (!ret || ret.ret !== 'success') throw new Error(ret?.msg || "인물 정보 저장 실패");

                toastr.success(`[${payload.name_ko || payload.name_org}] 인물 정보가 저장되었습니다.`);
                closeThisModal();

            } catch (err) {
                errorLog("[Person DB Modal] 저장 실패:", err);
                toastr.error(`저장 실패: ${err.message || err}`);
                btn.disabled = false;
                btn.innerHTML = `<i class="fas fa-save"></i> 인물 정보 저장`;
            }
        };
    }

    // 툴바 및 모달 이벤트 바인딩
    let isMouseDownOnCropBackdrop = false;

    pmhCropModal.onmousedown = (e) => {
        isMouseDownOnCropBackdrop = (e.target === pmhCropModal);
    };

    pmhCropModal.onmouseup = (e) => {
        if (isMouseDownOnCropBackdrop && e.target === pmhCropModal) {
            closeCropModal();
        }
        isMouseDownOnCropBackdrop = false;
    };

    pmhCropModal.onclick = (e) => { 
        if (e.target.closest('#pmh-btn-crop-close') || e.target.closest('#pmh-btn-crop-cancel')) {
            closeCropModal(); 
        }
    };

    // [원본 스위칭] 가로(PL) 버튼 클릭
    const btnSrcPl = document.getElementById('pmh-crop-src-pl');
    if (btnSrcPl) {
        btnSrcPl.onclick = function() {
            if (!currentCropItemData || currentCropItemData.currentSource === 'pl') return;
            currentCropItemData.currentSource = 'pl';
            customUploadPayload = null;

            this.classList.add('pmh-crop-btn-active');
            const btnSrcP = document.getElementById('pmh-crop-src-p');
            if (btnSrcP) btnSrcP.classList.remove('pmh-crop-btn-active');

            loadCropImage(currentCropItemData.plUrl);
        };
    }

    // [원본 스위칭] 세로(P) 버튼 클릭
    const btnSrcP = document.getElementById('pmh-crop-src-p');
    if (btnSrcP) {
        btnSrcP.onclick = function() {
            if (!currentCropItemData || currentCropItemData.currentSource === 'p') return;
            currentCropItemData.currentSource = 'p';
            customUploadPayload = null;

            this.classList.add('pmh-crop-btn-active');
            const btnSrcPl = document.getElementById('pmh-crop-src-pl');
            if (btnSrcPl) btnSrcPl.classList.remove('pmh-crop-btn-active');

            loadCropImage(currentCropItemData.pUrl);
        };
    }

    // [비율] 고정 / 자유 토글
    // 비율 조절 버튼 이벤트 (1:1.42, 3:4, 1:1, 자유)
    function setCropAspectRatio(ratio, activeBtnId) {
        if (cropperInstance) cropperInstance.setAspectRatio(ratio);
        $('#pmh-crop-ratio-group .pmh-crop-btn').removeClass('pmh-crop-btn-active');
        $('#' + activeBtnId).addClass('pmh-crop-btn-active');
    }

    const btnRatioLock = document.getElementById('pmh-crop-ratio-lock');
    if (btnRatioLock) {
        btnRatioLock.onclick = function() { setCropAspectRatio(1 / 1.4225, 'pmh-crop-ratio-lock'); };
    }

    const btnRatioPortrait = document.getElementById('pmh-crop-ratio-portrait');
    if (btnRatioPortrait) {
        btnRatioPortrait.onclick = function() { setCropAspectRatio(3 / 4, 'pmh-crop-ratio-portrait'); };
    }

    const btnRatioSquare = document.getElementById('pmh-crop-ratio-square');
    if (btnRatioSquare) {
        btnRatioSquare.onclick = function() { setCropAspectRatio(1 / 1, 'pmh-crop-ratio-square'); };
    }

    const btnRatioFree = document.getElementById('pmh-crop-ratio-free');
    if (btnRatioFree) {
        btnRatioFree.onclick = function() { setCropAspectRatio(NaN, 'pmh-crop-ratio-free'); };
    }

    // 회전 후 캔버스가 컨테이너를 벗어나 잘리지 않도록 자동 축소 및 중앙 정렬하는 헬퍼
    function rotateAndFit(degree) {
        if (!cropperInstance) return;
        cropperInstance.rotate(degree);

        const containerData = cropperInstance.getContainerData();
        const canvasData = cropperInstance.getCanvasData();

        const scaleH = containerData.height / canvasData.height;
        const scaleW = containerData.width / canvasData.width;
        const fitScale = Math.min(scaleH, scaleW);

        if (fitScale < 1) {
            cropperInstance.zoom(fitScale - 1);
        }

        const newCanvas = cropperInstance.getCanvasData();
        cropperInstance.setCanvasData({
            left: (containerData.width - newCanvas.width) / 2,
            top: (containerData.height - newCanvas.height) / 2
        });

        log(`[Crop Modal] 회전(${degree}°) 및 뷰포트 맞춤 정렬 완료`);
    }

    // 조작 모드 토글 (이동 모드 / 영역지정 모드)
    const btnModeMove = document.getElementById('pmh-crop-mode-move');
    if (btnModeMove) {
        btnModeMove.onclick = function() {
            if (cropperInstance) cropperInstance.setDragMode('move');
            $('#pmh-crop-dragmode-group .pmh-crop-btn').removeClass('pmh-crop-btn-active');
            this.classList.add('pmh-crop-btn-active');
        };
    }

    const btnModeCrop = document.getElementById('pmh-crop-mode-crop');
    if (btnModeCrop) {
        btnModeCrop.onclick = function() {
            if (cropperInstance) cropperInstance.setDragMode('crop');
            $('#pmh-crop-dragmode-group .pmh-crop-btn').removeClass('pmh-crop-btn-active');
            this.classList.add('pmh-crop-btn-active');
        };
    }

    // 좌/우 90도 회전
    const btnRotateL = document.getElementById('pmh-crop-rotate-l');
    if (btnRotateL) btnRotateL.onclick = () => rotateAndFit(-90);

    const btnRotateR = document.getElementById('pmh-crop-rotate-r');
    if (btnRotateR) btnRotateR.onclick = () => rotateAndFit(90);

    // 줌 컨트롤 및 화면 맞춤
    const btnZoomIn = document.getElementById('pmh-crop-zoom-in');
    if (btnZoomIn) btnZoomIn.onclick = () => { if (cropperInstance) cropperInstance.zoom(0.1); };

    const btnZoomOut = document.getElementById('pmh-crop-zoom-out');
    if (btnZoomOut) btnZoomOut.onclick = () => { if (cropperInstance) cropperInstance.zoom(-0.1); };

    const btnFit = document.getElementById('pmh-crop-fit');
    if (btnFit) {
        btnFit.onclick = () => {
            if (!cropperInstance) return;
            const containerData = cropperInstance.getContainerData();
            const canvasData = cropperInstance.getCanvasData();
            const scaleH = containerData.height / canvasData.height;
            const scaleW = containerData.width / canvasData.width;
            const fitScale = Math.min(scaleH, scaleW);
            cropperInstance.zoom(fitScale - 1);
            const newCanvas = cropperInstance.getCanvasData();
            cropperInstance.setCanvasData({
                left: (containerData.width - newCanvas.width) / 2,
                top: (containerData.height - newCanvas.height) / 2
            });
        };
    }

    // 영역 및 상태 초기화
    const btnReset = document.getElementById('pmh-crop-reset');
    if (btnReset) {
        btnReset.onclick = () => {
            if (cropperInstance) {
                setCropAspectRatio(1 / 1.4225, 'pmh-crop-ratio-lock');
                cropperInstance.reset();
                cropperInstance.setDragMode('move');
                $('#pmh-crop-dragmode-group .pmh-crop-btn').removeClass('pmh-crop-btn-active');
                $('#pmh-crop-mode-move').addClass('pmh-crop-btn-active');
                log('[Crop Modal] 크롭 박스 및 뷰포트 상태 초기화 완료');
            }
        };
    }

    // 2열 상시 URL 입력 로드 처리
    const inputCropUrl = document.getElementById('pmh-input-crop-url');
    const btnApplyCropUrl = document.getElementById('pmh-btn-apply-crop-url');

    function applyDirectCropUrl() {
        if (!inputCropUrl) return;
        const rawUrl = inputCropUrl.value.trim();
        if (!rawUrl) {
            toastr.warning("불러올 이미지 URL을 입력하세요.");
            return;
        }
        if (!rawUrl.startsWith('http://') && !rawUrl.startsWith('https://')) {
            toastr.warning("올바른 HTTP/HTTPS 웹 주소를 입력하세요.");
            return;
        }

        infoLog(`[Crop Modal] 2열 상시 URL 입력창을 통한 이미지 로드: ${rawUrl}`);
        loadCropImage(rawUrl, true);
        toastr.info("URL 이미지를 불러오는 중입니다...");
    }

    if (btnApplyCropUrl) {
        btnApplyCropUrl.onclick = function(e) {
            e.preventDefault();
            applyDirectCropUrl();
        };
    }

    if (inputCropUrl) {
        inputCropUrl.onkeydown = function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                applyDirectCropUrl();
            }
        };
    }

    // [로컬 파일 업로드] 가로(PL) / 세로(P)
    const uploadPl = document.getElementById('pmh-upload-pl');
    if (uploadPl) {
        uploadPl.onchange = function(e) {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (evt) => {
                    customUploadPayload = { type: 'pl', data: evt.target.result };
                    if (cropperInstance) cropperInstance.replace(evt.target.result);
                };
                reader.readAsDataURL(file);
            }
        };
    }

    const uploadP = document.getElementById('pmh-upload-p');
    if (uploadP) {
        uploadP.onchange = function(e) {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (evt) => {
                    customUploadPayload = { type: 'p', data: evt.target.result };
                    if (cropperInstance) cropperInstance.replace(evt.target.result);
                };
                reader.readAsDataURL(file);
            }
        };
    }

    // [저장 및 리매칭]
    const btnCropSave = document.getElementById('pmh-btn-crop-save');
    if (btnCropSave) {
        btnCropSave.onclick = async function() {
            if (!cropperInstance || !currentCropItemData) return;

            const { itemId, serverId, code, module } = currentCropItemData;
            const srvConfig = getServerConfig(serverId);
            const btn = this;

            btn.disabled = true;
            btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> FF 저장 중...`;

            try {
                const cropData = cropperInstance.getData(true);
                const payload = { 
                    code: code, 
                    crop_data: cropData,
                    source_type: currentCropItemData.currentSource || 'pl'
                };

                if (customUploadPayload) {
                    if (customUploadPayload.type === 'pl') {
                        payload.pl_base64 = customUploadPayload.data;
                    } else if (customUploadPayload.type === 'p') {
                        payload.p_base64 = customUploadPayload.data;
                    } else if (customUploadPayload.type === 'url') {
                        payload.image_url = customUploadPayload.url;
                        payload.source_type = 'url';
                    }
                }

                infoLog(`[Crop Modal] 💾 FF crop_save 요청 전송:`, payload);

                const saveRes = await makeRequest(`${srvConfig.relayUrl}/ff_metadata/api/${module}/crop_save`, 'POST', payload, ClientSettings.masterApiKey, null, 180000);
                infoLog(`[Crop Modal] ✅ FF crop_save 응답:`, saveRes);
                
                if (saveRes.ret !== 'success') {
                    throw new Error(saveRes.msg || "FF 포스터 저장 실패");
                }

                toastr.success("포스터 저장 성공! Plex 클린 리매칭을 시작합니다.", "FF 저장 완료");
                closeCropModal();

                triggerPlexMediaAction(itemId, 'match', extractPlexServerInfo(serverId), srvConfig, {
                    _try_refresh_first: false,
                    _do_unmatch_first: true,
                    _skip_sim_check: true
                });

            } catch (err) {
                errorLog("[Crop Modal] ❌ 포스터 저장 실패:", err);
                toastr.error(`저장 실패: ${err.message || err}`);
            } finally {
                btn.disabled = false;
                btn.innerHTML = `<i class="fas fa-save"></i> 저장 및 리매칭`;
            }
        };
    }

    // PMH 팝업 모달 및 드롭다운 ESC 단축키 최상위 레이어 우선 닫기 핸들러
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' || e.keyCode === 27) {
            // 1순위: 라이트박스가 최상위에 열려 있으면 라이트박스만 단독 닫기 (배경 모달 절대 보호)
            const lightbox = document.getElementById('pmh-lightbox-modal');
            if (lightbox) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                lightbox.remove();
                return;
            }

            // 2순위: 동영상 재생 모달 닫기
            const videoModal = document.getElementById('pmh-video-modal');
            if (videoModal) {
                e.preventDefault();
                e.stopPropagation();
                const v = videoModal.querySelector('video');
                if (v) { v.pause(); v.src = ""; }
                videoModal.remove();
                return;
            }

            // 3순위: 포스터 크롭 에디터 모달 닫기
            const cropModal = document.getElementById('pmh-crop-modal');
            if (cropModal && cropModal.style.display === 'flex') {
                e.preventDefault();
                e.stopPropagation();
                closeCropModal();
                return;
            }

            // 4순위: 배우 검색 모달 닫기
            const actorSearchModal = document.getElementById('pmh-actor-search-modal');
            if (actorSearchModal && actorSearchModal.style.display === 'flex') {
                e.preventDefault();
                e.stopPropagation();
                actorSearchModal.remove();
                return;
            }

            // 5순위: 다중 스택 모달 중 가장 상위에 있는 단일 모달만 닫기 (아래층 모달 보호)
            const stackedModals = document.querySelectorAll('.pmh-stacked-modal');
            if (stackedModals.length > 0) {
                e.preventDefault();
                e.stopPropagation();
                const topModal = stackedModals[stackedModals.length - 1];
                topModal.remove();
                return;
            }

            // 6순위: 프론트엔드 전역 설정 모달 닫기
            const settingsModal = document.getElementById('pmh-client-settings-modal');
            if (settingsModal) {
                e.preventDefault();
                e.stopPropagation();
                settingsModal.remove();
                return;
            }

            // 7순위: 툴박스 드롭다운 닫기
            const toolDropdown = document.getElementById('pmh-tool-dropdown');
            if (toolDropdown && toolDropdown.style.display === 'block') {
                e.preventDefault();
                e.stopPropagation();
                toolDropdown.style.display = 'none';
                return;
            }

            // 8순위: GUID 컨텍스트 메뉴 닫기
            if (typeof pmhActionMenu !== 'undefined' && pmhActionMenu && pmhActionMenu.style.visibility === 'visible') {
                e.preventDefault();
                e.stopPropagation();
                hideMenu(currentMenuSessionId);
                return;
            }
        }
    }, true);

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
                    id: srv.id, 
                    name: srv.name, 
                    machineIdentifier: srv.machine_id,
                    jav_section: srv.jav_section || "",
                    western_av_section: srv.western_av_section || "",
                    av_image_server_use: !!srv.av_image_server_use,
                    av_image_server_url: (srv.av_image_server_url || "").replace(/\/+$/, ''),
                    ff_metadb_use: !!srv.ff_metadb_use,
                    ff_ddns: (srv.ff_ddns || "").replace(/\/+$/, ''),
                    relayUrl: `${ClientSettings.masterUrl}/api/relay/${srv.id}`
                };
            });

            const LOCAL_UI_CSS = `${ClientSettings.masterUrl}/api/client/pmh_ui_core.css?v=${CURRENT_VERSION}`;
            const LOCAL_UI_JS = `${ClientSettings.masterUrl}/api/client/pmh_ui_core.js?v=${CURRENT_VERSION}`;

            const savedVer = GM_getValue('pmh_ui_cache_version', '');
            let cachedCss = GM_getValue('pmh_ui_core_css_cache', null);
            let cachedJs = GM_getValue('pmh_ui_core_js_cache', null);

            if (!cachedCss || !cachedJs || savedVer !== CURRENT_VERSION || ClientSettings.devMode) {
                infoLog(`[PMH Boot] 로컬 마스터 서버(${ClientSettings.masterUrl})에서 UI Core 동기화 중...`);

                cachedCss = await new Promise((resolve, reject) => {
                    GM_xmlhttpRequest({
                        method: "GET", url: LOCAL_UI_CSS, timeout: 5000,
                        onload: (r) => r.status === 200 ? resolve(r.responseText) : reject(`로컬 UI CSS 로드 실패 (HTTP ${r.status})`),
                        onerror: () => reject("로컬 PMH 마스터 서버 접근 불가"), 
                        ontimeout: () => reject("로컬 PMH 서버 응답 지연")
                    });
                });

                cachedJs = await new Promise((resolve, reject) => {
                    GM_xmlhttpRequest({
                        method: "GET", url: LOCAL_UI_JS, timeout: 5000,
                        onload: (r) => r.status === 200 ? resolve(r.responseText) : reject(`로컬 UI JS 로드 실패 (HTTP ${r.status})`),
                        onerror: () => reject("로컬 PMH 마스터 서버 접근 불가"), 
                        ontimeout: () => reject("로컬 PMH 서버 응답 지연")
                    });
                });

                GM_setValue('pmh_ui_core_css_cache', cachedCss);
                GM_setValue('pmh_ui_core_js_cache', cachedJs);
                GM_setValue('pmh_ui_cache_version', CURRENT_VERSION);
                infoLog(`[PMH Boot] UI Core (v${CURRENT_VERSION}) 로컬 캐시 동기화 완료!`);
            } else {
                infoLog(`[PMH Boot] ⚡ 브라우저에 캐시된 UI Core (v${savedVer}) 즉시 렌더링`);
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

            startGlobalTaskWatcher();

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
                                        infoLog(`[Boot Sync] 🔄 서버 재시작으로 유실된 작업 정리 및 복원 (ID: ${id})`);
                                        delete window._pmh_media_queues[id];
                                        needsSave = true;

                                        // 화면에 대기중으로 표시된 카드를 원래 GUID로 복구
                                        updateQueueBadgeInDOM(id, 'cancelled');
                                        revertQueueBadgeToOriginal(id, srv.machineIdentifier);
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
