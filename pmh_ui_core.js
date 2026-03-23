/**
 * ==============================================================================
 * PMH V2 UI Core Engine - 100% Shared Logic for PC & Mobile
 * ==============================================================================
 */
window.PmhUICore = {
    // --------------------------------------------------------------------------
    // 1. 공용 폼(Form) 요소 렌더러
    // --------------------------------------------------------------------------
    renderInputsHtml: function(inputs, savedOptions, currentSecId = "all") {
        if (!inputs || inputs.length === 0) return '';
        let html = '';
        inputs.forEach(input => {
            let val = savedOptions[input.id] !== undefined ? savedOptions[input.id] : (input.default !== undefined ? input.default : '');
            switch (input.type) {
                case 'header': html += `<div class="pmh-form-header">${input.label}</div>`; break;
                case 'checkbox_group':
                    html += `<div class="pmh-form-group"><div class="pmh-form-label">${input.label}</div><div class="pmh-check-group-box">`;
                    input.options.forEach(opt => {
                        let isChecked = savedOptions[opt.id] !== undefined ? savedOptions[opt.id] : (opt.default || false);
                        html += `<label class="pmh-check-label"><input type="checkbox" id="pmh_inp_${opt.id}" class="pmh-check-input pmh-dynamic-input" ${isChecked ? "checked" : ""}>${opt.label}</label>`;
                    });
                    html += `</div></div>`; break;
                case 'radio_group':
                    html += `<div class="pmh-form-group"><div class="pmh-form-label">${input.label}</div><div class="pmh-check-group-box">`;
                    input.options.forEach(opt => {
                        let isChecked = (String(val) === String(opt.value));
                        html += `<label class="pmh-check-label"><input type="radio" name="pmh_rad_${input.id}" value="${opt.value}" class="pmh-check-input pmh-dynamic-radio" ${isChecked ? "checked" : ""}>${opt.label}</label>`;
                    });
                    html += `</div></div>`; break;
                case 'multi_select':
                    let cachedArr = Array.isArray(savedOptions[input.id]) ? savedOptions[input.id] : (input.default === 'all' ? input.options.map(o=>String(o.value)) : []);
                    let btnText = cachedArr.length === 0 ? "선택 안 됨" : (cachedArr.length === input.options.length ? "전체 선택됨" : `${cachedArr.length}개 선택됨`);
                    html += `<div class="pmh-form-group"><label class="pmh-form-label">${input.label}</label><div class="pmh-multi-select-wrap" id="pmh_mwrap_${input.id}"><div class="pmh-multi-select-btn pmh-multi-main-btn" data-target="${input.id}"><span class="pmh-multi-btn-text" style="color:${cachedArr.length===0?'#777':'#fff'}; font-weight:${cachedArr.length===0?'normal':'bold'};">${btnText}</span><i class="fas fa-chevron-down" style="color:#777;"></i></div><div class="pmh-multi-select-dropdown" id="pmh_mdrop_${input.id}"><div class="pmh-multi-select-header"><span style="font-size:11px; color:#aaa;">항목 선택</span><span class="pmh-multi-toggle-btn" data-target="${input.id}">전체 토글</span></div>`;
                    input.options.forEach(opt => {
                        let isChecked = cachedArr.includes(String(opt.value));
                        html += `<label class="pmh-multi-option"><input type="checkbox" name="pmh_mchk_${input.id}" value="${opt.value}" class="pmh-multi-chk pmh-dynamic-multi" ${isChecked ? "checked" : ""}><span style="font-size:13px; color:#ddd;">${opt.text || opt.label}</span></label>`;
                    });
                    html += `</div></div></div>`; break;
                case 'checkbox':
                    html += `<div class="pmh-form-group" style="padding:4px 0;"><label class="pmh-check-label"><input type="checkbox" id="pmh_inp_${input.id}" class="pmh-check-input pmh-dynamic-input" ${val ? "checked" : ""}>${input.label}</label></div>`; break;
                case 'number':
                case 'text':
                case 'cron':
                    let styleExtra = input.type === 'cron' ? 'font-family:monospace;' : '';
                    html += `<div class="pmh-form-group"><label class="pmh-form-label">${input.label}</label><input type="${input.type === 'cron' ? 'text' : input.type}" id="pmh_inp_${input.id}" value="${val}" placeholder="${input.placeholder||''}" class="pmh-input-text pmh-dynamic-input" style="${styleExtra}"></div>`;
                    if (input.type === 'cron') html += `<div style="font-size:11px; color:#aaa; margin-top:4px;" id="pmh_cron_msg_${input.id}">대기 중...</div>`;
                    break;
                case 'select':
                    html += `<div class="pmh-form-group"><label class="pmh-form-label">${input.label}</label><select id="pmh_inp_${input.id}" class="pmh-input-select pmh-dynamic-input">`;
                    input.options.forEach(o => html += `<option value="${o.value}" ${String(o.value) === String(val) ? "selected" : ""}>${o.text}</option>`);
                    html += `</select></div>`; break;
            }
        });
        return html;
    },

    // --------------------------------------------------------------------------
    // 2. 메인 툴박스 인스턴스화 (플랫폼 종속성 완전 분리)
    // --------------------------------------------------------------------------
    createToolInstance: function(config) {
        /*
          config = {
              container: HTMLElement, 
              toolId: "scanner", 
              uiSchema: {...}, 
              servers: [...], 
              activeServerIdx: 0,
              apiAdapter: { run: async (data)=>{...}, status: async (taskId)=>{...}, cancel: async (taskId)=>{...} },
              toast: { success: (msg)=>{...}, error: (msg)=>{...}, info: (msg)=>{...} }
          }
        */
        const ctx = {
            c: config.container,
            ui: config.uiSchema,
            opts: config.uiSchema.saved_options || {},
            srvId: config.servers[config.activeServerIdx]?.machineIdentifier,
            pollTimer: null,
            currentPage: 1,
            itemsPerPage: config.uiSchema.saved_options?.items_per_page || 10,
            sortKey: config.uiSchema.saved_options?._sort_key || null,
            sortDir: config.uiSchema.saved_options?._sort_dir || 'asc',
            isCancelling: false
        };

        // --- A. 기본 레이아웃 HTML 생성 ---
        let srvOptionsHtml = config.servers.map((s, i) => `<option value="${i}" ${i === config.activeServerIdx ? 'selected' : ''}>${s.name}</option>`).join('');
        const formDisplay = ctx.opts._form_collapsed ? 'none' : 'block';
        const collapseIcon = ctx.opts._form_collapsed ? 'fa-chevron-down' : 'fa-chevron-up';

        let html = `
            <div style="display:flex; flex-direction:column; height:100%;">
                <div style="display:flex; border-bottom:1px solid #444; margin-bottom:15px; flex-shrink:0; justify-content:space-between; align-items:flex-end;">
                    <div style="display:flex; gap:2px;">
                        <div class="pmh-tab-btn active" data-tab="pmh_tab_form" style="cursor:pointer; padding:8px 12px; color:#e5a00d; border-bottom:2px solid #e5a00d; font-weight:bold;"><i class="fas fa-search"></i> 기본 설정</div>
                        <div class="pmh-tab-btn" data-tab="pmh_tab_monitor" style="cursor:pointer; padding:8px 12px; color:#777;"><i class="fas fa-desktop"></i> 진행 상태</div>
                        <div class="pmh-tab-btn" data-tab="pmh_tab_settings" style="cursor:pointer; padding:8px 12px; color:#777;"><i class="fas fa-cog"></i> 고급 설정</div>
                    </div>
                    <div style="display:flex; gap:12px; padding-bottom:8px; padding-right:5px;">
                        <i class="fas fa-broom" id="pmh_btn_clear" title="조회 데이터 비우기" style="color:#2f96b4; cursor:pointer;"></i>
                        <i class="fas fa-bomb" id="pmh_btn_reset" title="설정/캐시 완전 초기화" style="color:#bd362f; cursor:pointer;"></i>
                    </div>
                </div>
                
                <div id="pmh_tab_form" class="pmh-tab-content" style="display:flex; flex-direction:column; flex-grow:1;">
                    ${config.servers.length > 1 ? `<div class="pmh-form-group"><label class="pmh-form-label"><i class="fas fa-server"></i> 대상 서버</label><select id="pmh_srv_select" class="pmh-input-select" style="font-weight:bold; color:#e5a00d;">${srvOptionsHtml}</select></div>` : ''}
                    <div style="border-bottom:1px solid #333; padding-bottom:10px; margin-bottom:10px; position:relative;">
                        <div id="pmh_form_body" style="display:${formDisplay};">
                            ${ctx.ui.inputs ? `<div style="background:rgba(0,0,0,0.2); padding:15px; border-radius:8px; border:1px solid #333; margin-bottom:15px;"><div style="color:#51a351; font-size:13px; font-weight:bold; margin-bottom:10px;"><i class="fas fa-search"></i> 조회 조건</div>${this.renderInputsHtml(ctx.ui.inputs, ctx.opts)}</div>` : ''}
                            ${ctx.ui.execute_inputs ? `<div id="pmh_exec_frame" style="background:rgba(60,20,20,0.1); padding:15px; border-radius:8px; border:1px solid #4a2121; margin-bottom:15px;"><div style="color:#e06c6c; font-size:13px; font-weight:bold; margin-bottom:10px;"><i class="fas fa-cogs"></i> 실행 옵션</div>${this.renderInputsHtml(ctx.ui.execute_inputs, ctx.opts)}</div>` : ''}
                            <div id="pmh_action_container" style="display:flex; flex-wrap:wrap; gap:10px; justify-content:center; margin-bottom:10px;">
                                ${ctx.ui.buttons ? ctx.ui.buttons.map(b => `<button class="pmh-btn pmh-tool-run-btn" data-action="${b.action_type}" style="background:${b.color||'#e5a00d'}; color:#111; padding:10px 20px; border:none; border-radius:4px; font-weight:bold; cursor:pointer;"><i class="${b.icon}"></i> ${b.label}</button>`).join('') : ''}
                            </div>
                        </div>
                        <div style="text-align:center; margin-top:-20px; position:relative; z-index:2; height:15px;">
                            <i class="fas ${collapseIcon}" id="pmh_btn_toggle_form" style="color:#2f96b4; cursor:pointer; background:#1a1d21; padding:2px 15px; border-radius:10px; border:1px solid #333;"></i>
                        </div>
                    </div>
                    <div id="pmh_data_table_res" style="flex-grow:1; display:none; overflow-y:auto;"></div>
                </div>

                <div id="pmh_tab_monitor" class="pmh-tab-content" style="display:none; flex-direction:column; flex-grow:1;">
                    <div style="background:#15181a; border:1px solid #333; border-radius:6px; padding:15px; display:flex; flex-direction:column; height:100%;">
                        <div style="display:flex; justify-content:space-between; font-size:12px; color:#ccc; margin-bottom:10px; font-weight:bold;">
                            <span id="pmh_mon_state" style="color:#e5a00d;"><i class="fas fa-info-circle"></i> 대기 중</span>
                            <span id="pmh_mon_prog">0 / 0 (0%)</span>
                        </div>
                        <div style="width:100%; height:12px; background:#222; border-radius:6px; overflow:hidden; margin-bottom:15px; flex-shrink:0;">
                            <div id="pmh_mon_bar" style="width:0%; height:100%; background:#e5a00d; transition:0.3s;"></div>
                        </div>
                        <div id="pmh_mon_logs" style="background:#0a0a0c; border:1px solid #222; border-radius:4px; padding:10px; flex-grow:1; overflow-y:auto; font-family:monospace; font-size:11px; color:#aaa; line-height:1.6;">로그 없음</div>
                        <button id="pmh_btn_cancel" style="background:#bd362f; color:#fff; border:none; border-radius:4px; padding:12px; margin-top:15px; font-weight:bold; cursor:pointer; display:none;"><i class="fas fa-stop"></i> 작업 중단</button>
                    </div>
                </div>

                <div id="pmh_tab_settings" class="pmh-tab-content" style="display:none; flex-direction:column; flex-grow:1; overflow-y:auto;">
                    ${ctx.ui.settings_inputs ? `<div style="background:rgba(0,0,0,0.2); padding:15px; border-radius:8px; border:1px solid #333; margin-bottom:15px;">${this.renderInputsHtml(ctx.ui.settings_inputs, ctx.opts)}</div><button id="pmh_btn_save_opts" style="background:#51a351; color:#fff; border:none; padding:12px; border-radius:4px; font-weight:bold; cursor:pointer; width:100%;"><i class="fas fa-save"></i> 설정 적용</button>` : '<div style="text-align:center; color:#777; padding:30px;">추가 설정이 없습니다.</div>'}
                </div>
            </div>
        `;
        ctx.c.innerHTML = html;

        // --- B. 공용 이벤트 로직 (내부 함수 바인딩) ---
        const getFormData = () => {
            let req = { _server_id: ctx.srvId };
            ctx.c.querySelectorAll('.pmh-dynamic-input, .pmh-dynamic-radio:checked').forEach(el => {
                let key = el.name ? el.name.replace('pmh_rad_', '') : el.id.replace('pmh_inp_', '');
                req[key] = (el.type === 'checkbox') ? el.checked : el.value;
            });
            const allInputs = [ ...(ctx.ui.inputs||[]), ...(ctx.ui.execute_inputs||[]), ...(ctx.ui.settings_inputs||[]) ];
            allInputs.forEach(i => {
                if (i.type === 'multi_select') {
                    req[i.id] = Array.from(ctx.c.querySelectorAll(`input[name="pmh_mchk_${i.id}"]:checked`)).map(cb => cb.value);
                }
            });
            return req;
        };

        const updateShowIf = () => {
            const allInputs = [ ...(ctx.ui.inputs||[]), ...(ctx.ui.execute_inputs||[]), ...(ctx.ui.settings_inputs||[]) ];
            allInputs.forEach(inp => {
                if (!inp.show_if) return;
                const wrap = ctx.c.querySelector(`#pmh_inp_${inp.id}`)?.closest('.pmh-form-group') || ctx.c.querySelector(`#pmh_mwrap_${inp.id}`)?.closest('.pmh-form-group');
                if (!wrap) return;
                let show = true;
                for (const [depId, depVal] of Object.entries(inp.show_if)) {
                    const el = ctx.c.querySelector(`#pmh_inp_${depId}`);
                    if (el) { if(el.type==='checkbox'? el.checked!==depVal : el.value!==depVal) { show = false; break; } }
                    else { const rad = ctx.c.querySelector(`input[name="pmh_rad_${depId}"]:checked`); if(rad && rad.value!==depVal) { show = false; break; } }
                }
                wrap.style.display = show ? 'block' : 'none';
            });
            const execFrame = ctx.c.querySelector('#pmh_exec_frame');
            if (execFrame) {
                const visible = Array.from(execFrame.querySelectorAll('.pmh-form-group')).some(c => c.style.display !== 'none');
                execFrame.style.display = visible ? 'block' : 'none';
            }
        };
        ctx.c.addEventListener('change', updateShowIf); setTimeout(updateShowIf, 50);

        // 탭 스위칭 로직
        const switchTab = (tabId) => {
            ctx.c.querySelectorAll('.pmh-tab-btn').forEach(b => {
                if(b.dataset.tab === tabId) { b.style.color = '#e5a00d'; b.style.borderBottomColor = '#e5a00d'; b.classList.add('active'); }
                else { b.style.color = '#777'; b.style.borderBottomColor = 'transparent'; b.classList.remove('active'); }
            });
            ctx.c.querySelectorAll('.pmh-tab-content').forEach(c => c.style.display = (c.id === tabId) ? 'flex' : 'none');
            
            if (tabId === 'pmh_tab_form') loadPage(ctx.currentPage, ctx.sortKey, ctx.sortDir);
        };
        ctx.c.querySelectorAll('.pmh-tab-btn').forEach(btn => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));

        // 폼 토글(접기/펼치기)
        ctx.c.querySelector('#pmh_btn_toggle_form').addEventListener('click', (e) => {
            const body = ctx.c.querySelector('#pmh_form_body');
            const isHidden = body.style.display === 'none';
            body.style.display = isHidden ? 'block' : 'none';
            e.target.className = `fas ${isHidden ? 'fa-chevron-up' : 'fa-chevron-down'}`;
            ctx.opts._form_collapsed = !isHidden;
        });

        // 툴박스 Multi-Select 제어
        ctx.c.addEventListener('click', (e) => {
            const btn = e.target.closest('.pmh-multi-main-btn');
            if (btn) {
                const drop = ctx.c.querySelector(`#pmh_mdrop_${btn.dataset.target}`);
                ctx.c.querySelectorAll('.pmh-multi-select-dropdown.open').forEach(d => { if(d!==drop) d.classList.remove('open'); });
                drop.classList.toggle('open');
            } else if (!e.target.closest('.pmh-multi-select-wrap')) {
                ctx.c.querySelectorAll('.pmh-multi-select-dropdown.open').forEach(d => d.classList.remove('open'));
            }
        });

        // 데이터 테이블(Page) 로드 및 렌더링
        const loadPage = async (page, sKey, sDir) => {
            ctx.currentPage = page; ctx.sortKey = sKey; ctx.sortDir = sDir;
            const resEl = ctx.c.querySelector('#pmh_data_table_res');
            resEl.style.display = 'block'; resEl.innerHTML = `<div style="text-align:center; padding:30px; color:#aaa;"><i class="fas fa-spinner fa-spin"></i> 로딩 중...</div>`;
            try {
                const req = { action_type: 'page', page: page, limit: ctx.itemsPerPage, sort_key: sKey, sort_dir: sDir, _server_id: ctx.srvId };
                const r = await config.apiAdapter.run(req);
                renderTable(r);
            } catch(e) { resEl.innerHTML = `<div style="color:#bd362f; text-align:center; padding:20px;">불러오기 실패: ${e}</div>`; }
        };

        const renderTable = (res) => {
            if (!res || (res.type !== 'datatable' && res.type !== 'dashboard')) return;
            const resEl = ctx.c.querySelector('#pmh_data_table_res');
            let html = '';

            // 1. 요약(Summary) 대시보드
            if (res.summary_cards && res.summary_cards.length > 0) {
                html += `<div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:15px;">`;
                res.summary_cards.forEach(card => {
                    html += `<div style="background:rgba(0,0,0,0.3); border:1px solid #333; border-radius:6px; padding:15px; text-align:center;">
                                <div style="font-size:11px; color:#aaa; margin-bottom:4px;"><i class="${card.icon}"></i> ${card.label}</div>
                                <div style="font-size:18px; color:${card.color||'#fff'}; font-weight:bold;">${card.value}</div>
                             </div>`;
                });
                html += `</div>`;
            }

            // 2. 실제 데이터 테이블
            if (res.type === 'datatable') {
                if (res.total_items === 0) {
                    html += `<div style="padding:20px; text-align:center; color:#777; background:#111; border-radius:6px;">조회된 항목이 없습니다.</div>`;
                } else {
                    html += `<div style="overflow-x:auto;"><table style="width:100%; border-collapse:collapse; font-size:12px; text-align:left; white-space:nowrap;">
                                <thead><tr style="border-bottom:1px solid #444; color:#e5a00d;">`;
                    res.columns.forEach(col => html += `<th style="padding:8px; cursor:pointer;" class="pmh-th-sort" data-key="${col.key}">${col.label}</th>`);
                    html += `</tr></thead><tbody>`;
                    
                    res.data.forEach(row => {
                        const isErr = row._pmh_status === 'error';
                        html += `<tr style="border-bottom:1px solid #222; background:${isErr ? 'rgba(189,54,47,0.1)' : 'transparent'};">`;
                        res.columns.forEach(col => {
                            let val = row[col.key] || '-';
                            if (col.type === 'action_btn') {
                                const payload = JSON.stringify({action_type: col.action_type, _is_single: true, ...row}).replace(/"/g, '&quot;');
                                val = `<button class="pmh-tbl-action-btn" data-payload="${payload}" style="background:none; border:none; color:#e5a00d; cursor:pointer;"><i class="${col.icon||'fas fa-play'}"></i></button>`;
                            }
                            html += `<td style="padding:8px; overflow:hidden; text-overflow:ellipsis; max-width:200px;" title="${val}">${val}</td>`;
                        });
                        html += `</tr>`;
                    });
                    html += `</tbody></table></div>`;
                    
                    // 페이징
                    if (res.total_pages > 1) {
                        html += `<div style="display:flex; justify-content:center; gap:5px; margin-top:15px;">`;
                        html += `<button class="pmh-page-btn" data-p="${Math.max(1, res.page-1)}" style="padding:5px 10px; background:#222; color:#fff; border:1px solid #444;">이전</button>`;
                        html += `<span style="padding:5px 10px; color:#aaa;">${res.page} / ${res.total_pages}</span>`;
                        html += `<button class="pmh-page-btn" data-p="${Math.min(res.total_pages, res.page+1)}" style="padding:5px 10px; background:#222; color:#fff; border:1px solid #444;">다음</button>`;
                        html += `</div>`;
                    }
                    
                    // 하단 액션
                    if (res.action_button) {
                        const btnPayload = JSON.stringify(res.action_button.payload).replace(/"/g, '&quot;');
                        html += `<div style="text-align:center; margin-top:20px;"><button class="pmh-tbl-global-action" data-payload="${btnPayload}" style="background:#51a351; color:#fff; padding:10px 20px; border:none; border-radius:4px; font-weight:bold; cursor:pointer;">${res.action_button.label}</button></div>`;
                    }
                }
            }
            resEl.innerHTML = html;

            // 테이블 내 이벤트 바인딩
            resEl.querySelectorAll('.pmh-page-btn').forEach(b => b.onclick = () => loadPage(parseInt(b.dataset.p), ctx.sortKey, ctx.sortDir));
            resEl.querySelectorAll('.pmh-th-sort').forEach(th => th.onclick = () => loadPage(1, th.dataset.key, ctx.sortDir==='asc'?'desc':'asc'));
            resEl.querySelectorAll('.pmh-tbl-action-btn, .pmh-tbl-global-action').forEach(b => b.onclick = async () => {
                const payload = JSON.parse(b.dataset.payload);
                const req = { ...getFormData(), ...payload };
                config.toast.info("작업 실행 중...");
                try {
                    const r = await config.apiAdapter.run(req);
                    if (r.type === 'async_task') { config.toast.success("백그라운드 시작!"); startPolling(); switchTab('pmh_tab_monitor'); }
                    else loadPage(ctx.currentPage, ctx.sortKey, ctx.sortDir);
                } catch(e) { config.toast.error("오류: "+e); }
            });
        };

        // 폴링 엔진
        const startPolling = async () => {
            const stateEl = ctx.c.querySelector('#pmh_mon_state');
            const progEl = ctx.c.querySelector('#pmh_mon_prog');
            const barEl = ctx.c.querySelector('#pmh_mon_bar');
            const logBox = ctx.c.querySelector('#pmh_mon_logs');
            const cancelBtn = ctx.c.querySelector('#pmh_btn_cancel');

            cancelBtn.style.display = 'block'; cancelBtn.disabled = false; cancelBtn.innerHTML = '<i class="fas fa-stop"></i> 작업 중단';
            cancelBtn.onclick = async () => { cancelBtn.disabled=true; cancelBtn.innerHTML='중단 중...'; ctx.isCancelling=true; await config.apiAdapter.cancel(config.toolId); };

            const poll = async () => {
                try {
                    const s = await config.apiAdapter.status(config.toolId);
                    let percent = s.total > 0 ? Math.floor((s.progress/s.total)*100) : (s.state==='completed'?100:0);
                    progEl.innerText = `${s.progress} / ${s.total} (${percent}%)`;
                    barEl.style.width = `${percent}%`;
                    logBox.innerHTML = s.logs ? s.logs.join('<br>') : '';
                    logBox.scrollTop = logBox.scrollHeight;

                    if (['completed','error','cancelled'].includes(s.state)) {
                        cancelBtn.style.display = 'none';
                        stateEl.innerHTML = s.state==='completed' ? '작업 완료' : `종료됨 (${s.state})`;
                        stateEl.style.color = s.state==='completed' ? '#51a351' : '#bd362f';
                        barEl.style.background = s.state==='completed' ? '#51a351' : '#bd362f';
                        
                        // 자동 갱신
                        if(s.state==='completed') setTimeout(() => loadPage(1, ctx.sortKey, ctx.sortDir), 1000);
                    } else {
                        stateEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 실행 중...'; stateEl.style.color = '#e5a00d';
                        ctx.pollTimer = setTimeout(poll, 1500);
                    }
                } catch(e) { ctx.pollTimer = setTimeout(poll, 2000); }
            };
            poll();
        };

        // 초기화 데이터 로드 (활성 작업 체크)
        if (ctx.ui.active_task && ctx.ui.active_task.state === 'running') {
            switchTab('pmh_tab_monitor'); startPolling();
        } else {
            loadPage(1, ctx.sortKey, ctx.sortDir);
        }

        // 최상단 실행 버튼 이벤트
        ctx.c.querySelectorAll('.pmh-tool-run-btn').forEach(btn => {
            btn.onclick = async () => {
                btn.disabled = true; const orig = btn.innerHTML; btn.innerHTML = "요청 중...";
                try {
                    const req = getFormData(); req.action_type = btn.dataset.action;
                    await config.apiAdapter.run({...req, action_type: 'save_options'}); // 저장
                    const r = await config.apiAdapter.run(req);
                    if (r.type === 'async_task') { config.toast.success("작업 시작!"); switchTab('pmh_tab_monitor'); startPolling(); }
                    else { config.toast.success("완료!"); loadPage(1, ctx.sortKey, ctx.sortDir); }
                } catch(e) { config.toast.error("오류: "+e); } finally { btn.disabled = false; btn.innerHTML = orig; }
            };
        });

        // 설정 저장
        const saveBtn = ctx.c.querySelector('#pmh_btn_save_opts');
        if(saveBtn) saveBtn.onclick = async () => {
            saveBtn.disabled=true; saveBtn.innerHTML="저장 중...";
            const req = getFormData(); req.action_type = 'save_options';
            try { await config.apiAdapter.run(req); config.toast.success("설정 저장됨!"); } catch(e){} finally { saveBtn.disabled=false; saveBtn.innerHTML='<i class="fas fa-save"></i> 설정 적용'; }
        };
    }
};
