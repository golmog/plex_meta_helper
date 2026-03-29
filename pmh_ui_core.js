/**
 * ==============================================================================
 * PMH UI Core Engine - Shared Logic for PC & Mobile
 * ==============================================================================
 */
window.PmhUICore = {
    activeInstance: null,

    destroyActiveInstance: function() {
        if (this.activeInstance) {
            this.activeInstance.isDestroyed = true;
            if (this.activeInstance.pollTimer) clearTimeout(this.activeInstance.pollTimer);
            if (this.activeInstance.resizeObserver) this.activeInstance.resizeObserver.disconnect();
            if (this.activeInstance.mobileResizeHandler) window.removeEventListener('resize', this.activeInstance.mobileResizeHandler);
            if (this.activeInstance.c) {
                const oldContainer = this.activeInstance.c;
                const newContainer = oldContainer.cloneNode(false);
                if (oldContainer.parentNode) {
                    oldContainer.parentNode.replaceChild(newContainer, oldContainer);
                    this.activeInstance.c = newContainer;
                }
            }
            
            this.activeInstance = null;
        }
    },

    renderInputsHtml: function(inputs, savedOptions, currentSecId = "all") {
        if (!inputs || inputs.length === 0) return '';
        let html = '';
        inputs.forEach(input => {
            let val = savedOptions[input.id] !== undefined ? savedOptions[input.id] : (input.default !== undefined ? input.default : '');
            switch (input.type) {
                case 'header':
                    html += `<div class="pmh-form-header">${input.label}</div>`;
                    break;
                case 'checkbox_group':
                    html += `<div class="pmh-form-group"><div class="pmh-form-label">${input.label}</div><div class="pmh-check-group-box">`;
                    input.options.forEach(opt => {
                        let isChecked = savedOptions[opt.id] !== undefined ? savedOptions[opt.id] : (opt.default || false);
                        html += `<label class="pmh-check-label" title="${opt.label} 옵션을 켜거나 끕니다."><input type="checkbox" id="pmh_inp_${opt.id}" class="pmh-check-input pmh-dynamic-input" ${isChecked ? "checked" : ""}>${opt.label}</label>`;
                    });
                    html += `</div></div>`; 
                    break;
                case 'radio_group':
                    html += `<div class="pmh-form-group"><div class="pmh-form-label">${input.label}</div><div class="pmh-check-group-box">`;
                    input.options.forEach(opt => {
                        let isChecked = (String(val) === String(opt.value));
                        html += `<label class="pmh-check-label" title="${opt.label} 항목을 선택합니다."><input type="radio" name="pmh_rad_${input.id}" value="${opt.value}" class="pmh-check-input pmh-dynamic-radio" ${isChecked ? "checked" : ""}>${opt.label}</label>`;
                    });
                    html += `</div></div>`; 
                    break;
                case 'multi_select':
                    let cachedArr = [];
                    if (Array.isArray(savedOptions[input.id])) cachedArr = savedOptions[input.id];
                    else if (input.default === 'all') cachedArr = input.options.map(o => String(o.value));
                    else if (Array.isArray(input.default)) cachedArr = input.default.map(String);

                    const validValues = input.options.map(o => String(o.value));
                    cachedArr = cachedArr.filter(v => validValues.includes(String(v)));

                    let btnText = cachedArr.length === 0 ? "선택 안 됨" : (cachedArr.length === input.options.length ? "전체 선택됨" : `${cachedArr.length}개 선택됨`);
                    html += `<div class="pmh-form-group"><label class="pmh-form-label">${input.label}</label><div class="pmh-multi-select-wrap" id="pmh_mwrap_${input.id}" title="클릭하여 항목을 다중 선택합니다."><div class="pmh-multi-select-btn pmh-multi-main-btn" data-target="${input.id}"><span class="pmh-multi-btn-text" style="color:${cachedArr.length===0?'#777':'#fff'};">${btnText}</span><i class="fas fa-chevron-down" style="color:#777;"></i></div><div class="pmh-multi-select-dropdown" id="pmh_mdrop_${input.id}"><div class="pmh-multi-select-header"><span style="font-size:11px; color:#aaa;">항목 선택</span><span class="pmh-multi-toggle-btn" data-target="${input.id}" title="전체 선택/해제 토글">전체 토글</span></div>`;
                    input.options.forEach(opt => {
                        let isChecked = cachedArr.includes(String(opt.value));
                        html += `<label class="pmh-multi-option"><input type="checkbox" name="pmh_mchk_${input.id}" value="${opt.value}" class="pmh-multi-chk pmh-dynamic-multi" ${isChecked ? "checked" : ""}><span style="font-size:13px; color:#ddd;">${opt.text || opt.label}</span></label>`;
                    });
                    html += `</div></div></div>`; 
                    break;
                case 'checkbox':
                    html += `<div class="pmh-form-group" style="padding:4px 0;"><label class="pmh-check-label" title="${input.label} 옵션을 켜거나 끕니다."><input type="checkbox" id="pmh_inp_${input.id}" class="pmh-check-input pmh-dynamic-input" ${val ? "checked" : ""}>${input.label}</label></div>`; 
                    break;
                case 'number':
                    let layoutStyle = input.layout === 'plain' 
                        ? 'display: flex; align-items: center; gap: 10px; margin-bottom: 12px;' 
                        : 'display: flex; align-items: center; justify-content: space-between; background: rgba(0,0,0,0.1); padding: 8px 10px; border-radius: 4px; border: 1px solid #333; margin-bottom: 12px;';
                    let labelHtml = `<label class="pmh-input-number-label" style="${input.layout === 'plain' ? 'margin:0;' : ''}">${input.label}</label>`;
                    let inputHtml = `<input type="number" id="pmh_inp_${input.id}" value="${val}" placeholder="${input.placeholder||''}" step="any" class="pmh-input-number pmh-dynamic-input" style="${input.width ? `width:${input.width};` : ''}" title="숫자를 입력하세요.">`;
                    
                    if (input.align === 'left') html += `<div class="pmh-form-group" style="${layoutStyle}">${inputHtml}${labelHtml}</div>`;
                    else html += `<div class="pmh-form-group" style="${layoutStyle}">${labelHtml}${inputHtml}</div>`;
                    break;
                case 'text':
                    html += `<div class="pmh-form-group"><label class="pmh-form-label">${input.label}</label><input type="text" id="pmh_inp_${input.id}" value="${val}" placeholder="${input.placeholder||''}" class="pmh-input-text pmh-dynamic-input" style="${input.width ? `width:${input.width};` : ''}" title="텍스트를 입력하세요."></div>`;
                    break;
                case 'textarea':
                    html += `<div class="pmh-form-group"><div style="display:flex; justify-content:space-between; align-items:flex-end; margin-bottom:6px;"><label class="pmh-form-label" style="margin:0;">${input.label}</label>`;
                    if (input.default) {
                        const encDef = encodeURIComponent(input.default);
                        html += `<a href="#" class="pmh-textarea-reset" data-target="pmh_inp_${input.id}" data-val="${encDef}" style="color:#2f96b4; font-size:11px; text-decoration:none; padding:2px 6px; background:rgba(47,150,180,0.1); border-radius:3px; transition:0.2s;" title="기본 제공 템플릿으로 되돌립니다."><i class="fas fa-undo"></i> 기본값 초기화</a>`;
                    }
                    html += `</div><textarea id="pmh_inp_${input.id}" class="pmh-input-text pmh-dynamic-input" style="width:100%; height:${input.height||130}px; resize:vertical; font-family:monospace; font-size:12px; background:#111; color:#fff; border:1px solid #444; border-radius:4px; padding:10px; line-height:1.5; box-sizing:border-box; white-space:pre;" placeholder="${input.placeholder||''}" title="내용을 입력하세요.">${val}</textarea>`;
                    
                    if (input.template_vars && input.template_vars.length > 0) {
                        html += `<div style="margin-top:8px; font-size:11px; color:#aaa;">사용 가능한 변수: `;
                        input.template_vars.forEach(tv => { html += `<span style="background:rgba(255,255,255,0.1); padding:2px 5px; border-radius:3px; margin-right:5px; font-family:monospace; line-height:1.9;" title="${tv.desc}">{${tv.key}}</span>`; });
                        html += `</div>`;
                    }
                    html += `</div>`;
                    break;
                case 'cron':
                    html += `<div class="pmh-form-group">
                                <div style="display:flex; justify-content:space-between; align-items:flex-end; margin-bottom:6px;">
                                    <label class="pmh-form-label" style="margin:0;">${input.label}</label>
                                    <a href="https://crontab.guru/" target="_blank" style="color:#2f96b4; font-size:11px; text-decoration:none; padding:2px 6px; background:rgba(47,150,180,0.1); border-radius:3px;" title="크론탭 문법 테스트 사이트를 엽니다."><i class="fas fa-external-link-alt"></i> 문법 도움말</a>
                                </div>
                                <div style="display:flex; align-items:center; gap:10px;">
                                    <input type="text" id="pmh_inp_${input.id}" value="${val}" placeholder="${input.placeholder||''}" class="pmh-input-text pmh-dynamic-input pmh-cron-input" style="font-family:monospace; text-align:center; width:100%;" title="크론탭 5자리 표현식을 입력하세요 (분 시 일 월 요일)">
                                </div>
                                <div style="font-size:11px; font-weight:bold; color:#777; margin-top:6px;" id="pmh_cron_msg_${input.id}">대기 중...</div>
                             </div>`;
                    break;
                case 'sub_action':
                    const btnStyle = `${input.width ? `width:${input.width};` : ''} ${input.height ? `height:${input.height};` : ''} ${input.font_size ? `font-size:${input.font_size};` : ''}`;
                    const safeLabel = (input.label || '').replace(/\n/g, '<br>');
                    
                    const btnHtml = `
                        <div class="pmh-btn-wrapper pmh-sub-btn-wrapper" style="flex-shrink:0;">
                            <button type="button" class="pmh-sub-action-btn" data-action="${input.action_type}" data-target="${input.id}" style="background-color:${input.color || '#2f96b4'} !important; color:#fff !important; padding:8px 15px; ${btnStyle}" title="클릭하여 즉시 실행합니다.">
                                <i class="${input.icon || 'fas fa-play'}" style="margin-right:4px;"></i><span>${safeLabel}</span>
                            </button>
                            <div class="pmh-btn-overlay pmh-sub-overlay"><i class="fas fa-spinner fa-spin"></i></div>
                        </div>`;

                    const cachedText = val ? `<i class="fas fa-check" style="color:#51a351;"></i> 이전에 적용되었습니다.` : '';
                    const msgHtml = `<span id="pmh_sub_msg_${input.id}" style="font-size:12px; color:#aaa; line-height:1.4; flex-grow:1;">${cachedText}</span>`;
                    const hiddenHtml = `<input type="hidden" id="pmh_inp_${input.id}" value="${val}" class="pmh-dynamic-input">`;

                    const msgPos = input.msg_pos || 'right';
                    if (msgPos === 'right') html += `<div class="pmh-form-group" style="display:flex; align-items:center; gap:10px;">${btnHtml}${msgHtml}${hiddenHtml}</div>`;
                    else if (msgPos === 'left') html += `<div class="pmh-form-group" style="display:flex; align-items:center; gap:10px;">${msgHtml}${btnHtml}${hiddenHtml}</div>`;
                    else if (msgPos === 'bottom') html += `<div class="pmh-form-group" style="display:flex; flex-direction:column; gap:6px;"><div style="display:flex; justify-content:center;">${btnHtml}</div>${msgHtml}${hiddenHtml}</div>`;
                    else html += `<div class="pmh-form-group" style="display:flex; flex-direction:column; gap:6px;">${msgHtml}<div style="display:flex; justify-content:center;">${btnHtml}</div>${hiddenHtml}</div>`;
                    break;
                case 'select':
                    html += `<div class="pmh-form-group"><label class="pmh-form-label">${input.label}</label><select id="pmh_inp_${input.id}" class="pmh-input-select pmh-dynamic-input" title="항목을 선택하세요.">`;
                    input.options.forEach(o => {
                        let isSelected = String(o.value) === String(val);
                        if (!val && input.id === 'target_section' && String(o.value) === currentSecId) isSelected = true;
                        html += `<option value="${o.value}" ${isSelected ? "selected" : ""}>${o.text}</option>`;
                    });
                    html += `</select></div>`; 
                    break;
            }
        });
        return html;
    },

    createToolInstance: function(config) {
        this.destroyActiveInstance();

        config.container = document.getElementById(config.container.id) || config.container;

        const isMobileEnv = window.matchMedia('(max-width: 768px)').matches || ('ontouchstart' in window);

        function applyMaxHeight() {
            const panel = document.getElementById('pmh-tool-panel');
            if (panel && !isMobileEnv) {
                if (panel.style.height === 'auto' || panel.style.height === '') {
                    const maxAllowedHeight = window.innerHeight - 150;
                    if (panel.offsetHeight >= maxAllowedHeight || panel.scrollHeight >= maxAllowedHeight) {
                        panel.style.height = maxAllowedHeight + 'px';
                        if (ctx && !ctx.isDestroyed) updateLogBoxHeight();
                    }
                }
            }
        }

        function updateLogBoxHeight() {
            const logBox = ctx.c.querySelector('#pmh_mon_logs');
            const tabMonitor = ctx.c.querySelector('#pmh_tab_monitor');
            const panel = document.getElementById('pmh-tool-panel');
            if (!logBox || !tabMonitor || tabMonitor.style.display === 'none') return;

            if (isMobileEnv) {
                const calcH = window.innerHeight - 380;
                logBox.style.height = Math.max(150, calcH) + 'px';
            } else {
                if (panel) {
                    const calcH = panel.offsetHeight - 300;
                    logBox.style.height = Math.max(150, calcH) + 'px';
                }
            }
        }

        const currentSrv = config.servers[config.activeServerIdx];
        const resolvedSrvId = currentSrv ? (currentSrv.machineIdentifier || currentSrv.machine_id || 'default') : 'default';

        const ctx = {
            c: config.container,
            ui: config.uiSchema,
            opts: config.uiSchema.saved_options || {},
            srvId: resolvedSrvId,
            pollTimer: null,
            currentPage: 1,
            itemsPerPage: config.uiSchema.saved_options?.items_per_page || 10,
            sortKey: config.uiSchema.saved_options?._sort_key || null,
            sortDir: config.uiSchema.saved_options?._sort_dir || 'asc',
            isCancelling: false,
            isDestroyed: false,
            autoRefresh: true,
            isRunning: false,
            pollCount: 0,
            autoHeightBeforeMonitor: null
        };
        this.activeInstance = ctx;

        const updateFormTabButtons = (running) => {
            ctx.isRunning = running;

            ctx.c.querySelectorAll('.pmh-main-run-btn').forEach(btn => {
                if (!btn.dataset.originalHtml) btn.dataset.originalHtml = btn.innerHTML;
                if (running) {
                    btn.disabled = true;
                    btn.style.opacity = '0.5';
                    btn.style.cursor = 'not-allowed';
                } else {
                    btn.disabled = false;
                    btn.style.opacity = '1';
                    btn.style.cursor = 'pointer';
                    btn.innerHTML = btn.dataset.originalHtml;
                }
            });

            ctx.c.querySelectorAll('.pmh-tbl-action-btn').forEach(btn => {
                if (running) {
                    btn.disabled = true;
                    btn.style.opacity = '0.5';
                    btn.style.cursor = 'not-allowed';
                } else {
                    btn.disabled = false;
                    btn.style.opacity = '1';
                    btn.style.cursor = 'pointer';
                }
            });

            const execWrapper = ctx.c.querySelector('#pmh_tbl_global_exec_wrapper');
            const cancelWrapper = ctx.c.querySelector('#pmh_tbl_global_cancel_wrapper');

            if (running) {
                if (execWrapper) execWrapper.style.display = 'none';
                if (cancelWrapper) cancelWrapper.style.display = 'block';
            } else {
                if (execWrapper) execWrapper.style.display = 'block';
                if (cancelWrapper) cancelWrapper.style.display = 'none';
            }
        };

        let srvOptionsHtml = config.servers.map((s, i) => {
            if (config.availableServerIndices && !config.availableServerIndices.includes(i)) return '';
            return `<option value="${i}" ${i === config.activeServerIdx ? 'selected' : ''}>${s.name}</option>`;
        }).join('');
        const formDisplay = ctx.opts._form_collapsed ? 'none' : 'block';
        const collapsedClass = ctx.opts._form_collapsed ? 'collapsed' : '';
        const uniqFormBodyId = `pmh_form_body_${config.toolId}`;
        const uniqToggleBtnId = `pmh_btn_toggle_form_${config.toolId}`;

        let html = `
            <div style="display:flex; flex-direction:column; height:100%; width:100%; text-align:left; flex-grow:1; min-height:0;">
                <div style="display:flex; border-bottom:1px solid #444; margin-bottom:15px; flex-shrink:0; justify-content:space-between; align-items:flex-end;">
                    <div style="display:flex; gap:2px; overflow-x:auto; width:100%;">
                        <div class="pmh-tab-btn active" data-tab="pmh_tab_form" style="cursor:pointer; padding:8px 12px; color:#e5a00d; border-bottom:2px solid #e5a00d; font-weight:bold;" title="조회 조건 및 결과 목록 확인"><i class="fas fa-search"></i> 조회/실행</div>
                        <div class="pmh-tab-btn" data-tab="pmh_tab_settings" style="cursor:pointer; padding:8px 12px; color:#777;" title="스케줄링 및 툴 상세 옵션 설정"><i class="fas fa-cog"></i> 환경설정</div>
                        <div class="pmh-tab-btn" data-tab="pmh_tab_monitor" style="cursor:pointer; padding:8px 12px; color:#777;" title="작업 진행률 및 실시간 로그 확인"><i class="fas fa-desktop"></i> 모니터링</div>
                    </div>
                </div>
                
                <div id="pmh_tab_form" class="pmh-tab-content" style="display:flex; flex-direction:column; flex-grow:1; min-height:0;">
                    ${config.servers.length > 1 ? `<div class="pmh-form-group"><label class="pmh-form-label"><i class="fas fa-server"></i> 대상 서버</label><select id="pmh_srv_select" class="pmh-input-select" title="작업 대상 서버를 변경합니다.">${srvOptionsHtml}</select></div>` : ''}

                    <div style="border-bottom:1px solid #333; padding-bottom:25px; margin-bottom:15px; position:relative; flex-shrink:0;">
                        <div id="${uniqFormBodyId}" style="display:${formDisplay};">
                            ${ctx.ui.inputs ? `<div style="background:rgba(0,0,0,0.2); padding:15px; border-radius:8px; border:1px solid #333; margin-bottom:15px;"><div style="color:#51a351; font-size:13px; font-weight:bold; margin-bottom:10px;"><i class="fas fa-search"></i> 조회 조건</div>${this.renderInputsHtml(ctx.ui.inputs, ctx.opts)}</div>` : ''}
                            
                            <div id="pmh_action_container" style="display:flex; flex-wrap:wrap; gap:10px; justify-content:center;">
                                ${ctx.ui.buttons ? ctx.ui.buttons.map(b => {
                                    const isRed = (b.color === '#bd362f' || b.color === 'red');
                                    const textColor = isRed ? '#fff' : '#1f1f1f';
                                    return `<div class="pmh-btn-wrapper"><button class="pmh-dynamic-run-btn pmh-main-run-btn" data-action="${b.action_type}" style="background-color:${b.color||'#e5a00d'} !important; color:${textColor} !important;" title="해당 작업을 서버에 요청합니다."><i class="${b.icon}"></i> ${b.label}</button><div class="pmh-btn-overlay"><i class="fas fa-spinner fa-spin"></i></div></div>`;
                                }).join('') : ''}
                            </div>
                        </div>
                        <div class="pmh-toggle-container">
                            <i class="fas fa-chevron-up pmh-toggle-btn ${collapsedClass}" id="${uniqToggleBtnId}" title="조회 및 실행 옵션창 접기/펼치기"></i>
                        </div>
                    </div>
                    ${ctx.ui.execute_inputs ? `<div id="pmh_exec_frame" style="background:rgba(60,20,20,0.1); padding:15px; border-radius:8px; border:1px solid #4a2121; margin-bottom:15px; flex-shrink:0;"><div style="color:#e06c6c; font-size:13px; font-weight:bold; margin-bottom:10px;"><i class="fas fa-cogs"></i> 작업 실행 옵션</div>${this.renderInputsHtml(ctx.ui.execute_inputs, ctx.opts)}</div>` : ''}

                    <div id="pmh_data_table_res" style="flex-grow:1; display:none; flex-direction:column; position:relative; min-height:0; overflow-y:auto; padding-right:4px;"></div>
                </div>

                <div id="pmh_tab_monitor" class="pmh-tab-content" style="display:none; flex-direction:column; width:100%; flex-grow:1; min-height:0;">
                    <div style="display:flex; flex-direction:column; background:#15181a; border:1px solid #333; border-radius:6px; padding:15px; width:100%; box-sizing:border-box; flex-grow:1; min-height:0;">
                        <div style="display:flex; justify-content:space-between; font-size:12px; color:#ccc; margin-bottom:10px; font-weight:bold; flex-shrink:0;">
                            <span id="pmh_mon_state" style="color:#e5a00d;"><i class="fas fa-info-circle"></i> 대기 중</span>
                            <span id="pmh_mon_prog">0 / 0 (0%)</span>
                        </div>
                        <div style="width:100%; height:12px; background:#222; border-radius:6px; overflow:hidden; margin-bottom:15px; flex-shrink:0;">
                            <div id="pmh_mon_bar" style="width:0%; height:100%; background:#e5a00d; transition:0.3s;"></div>
                        </div>
                        
                        <div id="pmh_mon_logs" style="background:#0a0a0c; border:1px solid #222; border-radius:4px; padding:10px; flex-grow:1; min-height:0; overflow-y:auto; font-family:monospace; font-size:11px; color:#aaa; line-height:1.6; text-align:left; word-break:break-all; box-sizing:border-box;">로그 없음</div>

                        <div style="display:flex; justify-content:center; flex-shrink:0; margin-top:15px;">
                            <button id="pmh_btn_cancel" class="pmh-dt-action-btn pmh-btn-cancel" style="display:none;" title="진행 중인 작업을 안전하게 중단합니다."><i class="fas fa-stop"></i> 작업 중단</button>
                        </div>
                    </div>
                </div>

                <div id="pmh_tab_settings" class="pmh-tab-content" style="display:none; flex-direction:column; flex-grow:1; overflow-y:auto;">
                    ${ctx.ui.settings_inputs ? `<div style="background:rgba(0,0,0,0.2); padding:15px; border-radius:8px; border:1px solid #333; margin-bottom:15px;">${this.renderInputsHtml(ctx.ui.settings_inputs, ctx.opts)}</div>` : '<div style="text-align:center; color:#777; padding:30px;">추가 설정이 없습니다.</div>'}
                    <div style="display:flex; justify-content:center; gap:10px; margin-top:15px; border-top:1px dashed #444; padding-top:15px; flex-shrink:0;">
                        <button id="pmh_btn_reset_all" class="pmh-dynamic-run-btn" style="background-color:#bd362f !important; color:#fff !important;" title="저장된 옵션과 캐시 데이터를 모두 초기화합니다."><i class="fas fa-bomb"></i> 환경/캐시 초기화</button>
                        <button id="pmh_btn_save_opts" class="pmh-dynamic-run-btn" style="background-color:#e5a00d !important; color:#1f1f1f !important;" title="현재 작성된 설정을 저장합니다."><i class="fas fa-save"></i> 설정 적용</button>
                    </div>
                </div>
            </div>
        `;

        ctx.c.innerHTML = html;

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
                    if (el) { if(el.type==='checkbox'? el.checked!==depVal : String(el.value)!==String(depVal)) { show = false; break; } }
                    else { const rad = ctx.c.querySelector(`input[name="pmh_rad_${depId}"]:checked`); if(rad && String(rad.value)!==String(depVal)) { show = false; break; } }
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

        ctx.c.addEventListener('click', (e) => {

            const toggleBtn = e.target.closest(`#pmh_btn_toggle_form_${config.toolId}`);
            if (toggleBtn) {
                e.preventDefault();
                const body = ctx.c.querySelector(`#pmh_form_body_${config.toolId}`);
                if (body) {
                    const isHidden = body.style.display === 'none';
                    body.style.display = isHidden ? 'block' : 'none';

                    if (isHidden) toggleBtn.classList.remove('collapsed');
                    else toggleBtn.classList.add('collapsed');

                    ctx.opts._form_collapsed = !isHidden;

                    const req = getFormData();
                    req.action_type = 'save_options';
                    req._form_collapsed = ctx.opts._form_collapsed;
                    config.apiAdapter.run(req).catch(()=>{});
                }
                return;
            }

            const multiBtn = e.target.closest('.pmh-multi-main-btn');
            if (multiBtn) {
                e.preventDefault();
                const drop = ctx.c.querySelector(`#pmh_mdrop_${multiBtn.dataset.target}`);
                ctx.c.querySelectorAll('.pmh-multi-select-dropdown.open').forEach(d => { if(d !== drop) d.classList.remove('open'); });
                drop.classList.toggle('open');
                return;
            }

            const toggleMultiBtn = e.target.closest('.pmh-multi-toggle-btn');
            if (toggleMultiBtn) {
                e.preventDefault();
                const targetId = toggleMultiBtn.dataset.target;
                const checkboxes = ctx.c.querySelectorAll(`input[name="pmh_mchk_${targetId}"]`);
                const allChecked = Array.from(checkboxes).every(cb => cb.checked);
                checkboxes.forEach(cb => cb.checked = !allChecked);
                if (checkboxes.length > 0) checkboxes[0].dispatchEvent(new Event('change', { bubbles: true }));
                return;
            }

            const taReset = e.target.closest('.pmh-textarea-reset');
            if (taReset) {
                e.preventDefault();
                const ta = ctx.c.querySelector('#' + taReset.dataset.target);
                if (ta) ta.value = decodeURIComponent(taReset.dataset.val);
                return;
            }

            const subBtn = e.target.closest('.pmh-sub-action-btn');
            if (subBtn) {
                e.preventDefault();
                if (subBtn.disabled) return;

                const targetId = subBtn.dataset.target;
                const msgSpan = ctx.c.querySelector(`#pmh_sub_msg_${targetId}`);
                const hiddenInput = ctx.c.querySelector(`#pmh_inp_${targetId}`);
                const wrapper = subBtn.closest('.pmh-sub-btn-wrapper');
                const overlay = wrapper ? wrapper.querySelector('.pmh-sub-overlay') : null;

                subBtn.disabled = true;
                if (overlay) overlay.style.display = 'flex';
                if (msgSpan) msgSpan.innerHTML = `<span style="color:#aaa;"><i class="fas fa-circle-notch fa-spin"></i> 요청을 처리하고 있습니다...</span>`;

                const req = getFormData();
                req.action_type = subBtn.dataset.action;

                config.apiAdapter.run(req).then(res => {
                    subBtn.disabled = false;
                    if (overlay) overlay.style.display = 'none';
                    if (res.status === 'success') {
                        if (msgSpan) msgSpan.innerHTML = `<span style="color:#51a351; font-weight:bold;"><i class="fas fa-check"></i> ${res.message || '완료되었습니다.'}</span>`;
                        if (hiddenInput && res.value !== undefined) hiddenInput.value = res.value;
                    } else {
                        if (msgSpan) msgSpan.innerHTML = `<span style="color:#bd362f;"><i class="fas fa-times"></i> ${res.message || '실패했습니다.'}</span>`;
                    }
                }).catch(err => {
                    subBtn.disabled = false;
                    if (overlay) overlay.style.display = 'none';
                    if (msgSpan) msgSpan.innerHTML = `<span style="color:#bd362f;"><i class="fas fa-wifi"></i> 통신 실패</span>`;
                });
                return;
            }

            if (!e.target.closest('.pmh-multi-select-wrap')) {
                ctx.c.querySelectorAll('.pmh-multi-select-dropdown.open').forEach(d => d.classList.remove('open'));
            }
        });

        ctx.c.addEventListener('change', (e) => {
            if (e.target.classList.contains('pmh-multi-chk')) {
                const wrap = e.target.closest('.pmh-multi-select-wrap');
                if (wrap) {
                    const targetId = wrap.querySelector('.pmh-multi-main-btn').dataset.target;
                    const btnTextSpan = wrap.querySelector('.pmh-multi-btn-text');
                    const checkboxes = wrap.querySelectorAll(`input[name="pmh_mchk_${targetId}"]`);
                    const chkCnt = wrap.querySelectorAll(`input[name="pmh_mchk_${targetId}"]:checked`).length;

                    if (chkCnt === 0) {
                        btnTextSpan.innerText = "선택 안 됨";
                        btnTextSpan.style.color = "#777";
                    } else if (chkCnt === checkboxes.length) {
                        btnTextSpan.innerText = "전체 선택됨";
                        btnTextSpan.style.color = "#fff";
                    } else {
                        btnTextSpan.innerText = `${chkCnt}개 선택됨`;
                        btnTextSpan.style.color = "#fff";
                    }
                }
            }
            updateShowIf();
        });

        ctx.c.addEventListener('input', (e) => {
            if (e.target.classList.contains('pmh-cron-input')) {
                const cronId = e.target.id.replace('pmh_inp_', '');
                const msgSpan = ctx.c.querySelector(`#pmh_cron_msg_${cronId}`);
                if (!msgSpan) return;

                const val = e.target.value.trim();
                if (val === '') {
                    msgSpan.innerHTML = "비어있습니다."; msgSpan.style.color = "#bd362f";
                } else if (val.split(/\s+/).length !== 5) {
                    msgSpan.innerHTML = `현재 ${val.split(/\s+/).length}자리입니다. 띄어쓰기로 구분된 5자리여야 합니다.`; msgSpan.style.color = "#bd362f";
                } else if (/[^0-9\*\/\-\,\s]/.test(val)) {
                    msgSpan.innerHTML = "잘못된 문자가 포함됨."; msgSpan.style.color = "#bd362f";
                } else {
                    msgSpan.innerHTML = `<i class="fas fa-check-circle"></i> 올바른 포맷입니다.`; msgSpan.style.color = "#51a351";
                }
            }
        });

        const switchTab = (tabId) => {
            const panel = document.getElementById('pmh-tool-panel');

            if (!isMobileEnv && panel) {
                if (tabId === 'pmh_tab_monitor') {
                    if ((panel.style.height === 'auto' || panel.style.height === '') && panel.offsetHeight > 200) {
                        ctx.autoHeightBeforeMonitor = panel.offsetHeight;
                        panel.style.height = ctx.autoHeightBeforeMonitor + 'px';
                    }
                } else {
                    if (ctx.autoHeightBeforeMonitor && panel.style.height === ctx.autoHeightBeforeMonitor + 'px') {
                        panel.style.height = 'auto';
                        ctx.autoHeightBeforeMonitor = null;
                    }
                }
            }

            ctx.c.querySelectorAll('.pmh-tab-btn').forEach(b => {
                if(b.dataset.tab === tabId) { b.style.color = '#e5a00d'; b.style.borderBottomColor = '#e5a00d'; b.classList.add('active'); }
                else { b.style.color = '#777'; b.style.borderBottomColor = 'transparent'; b.classList.remove('active'); }
            });
            ctx.c.querySelectorAll('.pmh-tab-content').forEach(c => c.style.display = (c.id === tabId) ? 'flex' : 'none');

            if (tabId === 'pmh_tab_monitor') {
                updateLogBoxHeight();
                const logBox = ctx.c.querySelector('#pmh_mon_logs');
                if (logBox) logBox.scrollTop = logBox.scrollHeight;
            }

            if (tabId === 'pmh_tab_form') loadPage(ctx.currentPage, ctx.sortKey, ctx.sortDir);

            if (!isMobileEnv) setTimeout(applyMaxHeight, 50);
        };
        ctx.c.querySelectorAll('.pmh-tab-btn').forEach(btn => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));

        const loadPage = async (page, sKey, sDir, customLimit = null, isSilent = false) => {
            if (ctx.isDestroyed) return;
            ctx.currentPage = page; ctx.sortKey = sKey; ctx.sortDir = sDir;
            if (customLimit) ctx.itemsPerPage = customLimit;

            const resEl = ctx.c.querySelector('#pmh_data_table_res');
            if (!isSilent) resEl.style.display = 'flex';

            let overlay = resEl.querySelector('.pmh-table-overlay');
            if (!isSilent) {
                if (!overlay) {
                    overlay = document.createElement('div');
                    overlay.className = 'pmh-table-overlay';
                    overlay.style.cssText = 'position:absolute; top:0; left:0; width:100%; height:100%; background-color:rgba(0,0,0,0.6); z-index:10; display:flex; align-items:center; justify-content:center; border-radius:4px;';
                    overlay.innerHTML = `<i class="fas fa-spinner fa-spin" style="font-size:30px; color:#e5a00d;"></i>`;
                    resEl.appendChild(overlay);
                } else {
                    overlay.style.display = 'flex';
                }
            }

            try {
                const req = { action_type: 'page', page: page, limit: ctx.itemsPerPage, sort_key: sKey, sort_dir: sDir, _server_id: ctx.srvId };
                const r = await config.apiAdapter.run(req);

                if (ctx.isDestroyed) return;

                if (!r || r.total_items === 0 || !r.data || r.data.length === 0) {
                    if (overlay) overlay.style.display = 'none';
                    renderTable(r);
                    return;
                }

                renderTable(r);
            } catch(e) {
                if (!ctx.isDestroyed && !isSilent) resEl.innerHTML = `<div style="color:#bd362f; text-align:center; padding:20px;">불러오기 실패: ${e}</div>`;
            }
        };

        const renderTable = (res) => {
            if (!res || (res.type !== 'datatable' && res.type !== 'dashboard')) return;
            const resEl = ctx.c.querySelector('#pmh_data_table_res');
            resEl.style.display = 'flex';
            let html = '';

            if (res.summary_cards || res.bar_charts) {
                html += `<div style="padding-bottom:15px; margin-bottom:15px; border-bottom:1px solid #333; flex-shrink:0;">`;
                if (res.summary_cards && res.summary_cards.length > 0) {
                    html += `<div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(140px, 1fr)); gap:10px; margin-bottom:15px;">`;
                    res.summary_cards.forEach(card => {
                        html += `<div style="background:#111; border:1px solid #333; border-radius:6px; padding:12px; display:flex; align-items:center; gap:12px; text-align:left;">
                                    <div style="font-size:24px; color:${card.color||'#e5a00d'}; width:30px; text-align:center;"><i class="${card.icon||'fas fa-info-circle'}"></i></div>
                                    <div style="flex-grow:1; min-width:0;">
                                        <div style="font-size:11px; color:#aaa; margin-bottom:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${card.label}</div>
                                        <div style="font-size:16px; color:#fff; font-weight:bold; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${card.value}</div>
                                    </div>
                                 </div>`;
                    });
                    html += `</div>`;
                }

                if (res.bar_charts && res.bar_charts.length > 0) {
                    html += `<div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(300px, 1fr)); gap:15px;">`;
                    res.bar_charts.forEach(chart => {
                        html += `<div style="background:#15181a; border:1px solid #222; border-radius:6px; padding:15px; text-align:left;">
                                    <div style="font-size:13px; font-weight:bold; color:#2f96b4; margin-bottom:12px; border-bottom:1px dashed #333; padding-bottom:5px;">${chart.title}</div>`;
                        chart.items.forEach(item => {
                            html += `<div style="margin-bottom:8px;">
                                        <div style="display:flex; justify-content:space-between; font-size:11px; color:#ccc; margin-bottom:3px;">
                                            <span>${item.label}</span><span>${item.count} (${item.percent||0}%)</span>
                                        </div>
                                        <div style="width:100%; height:6px; background:#222; border-radius:3px; overflow:hidden;">
                                            <div style="width:${item.percent||0}%; height:100%; background:${chart.color||'#e5a00d'}; border-radius:3px;"></div>
                                        </div>
                                     </div>`;
                        });
                        html += `</div>`;
                    });
                    html += `</div>`;
                }
                html += `</div>`;
            }

            if (res.type === 'datatable') {
                const autoRefColor = ctx.autoRefresh ? '#51a351' : '#aaa';
                const autoRefBg = ctx.autoRefresh ? 'rgba(81,163,81,0.1)' : 'rgba(170,170,170,0.1)';
                const autoRefBorder = ctx.autoRefresh ? 'rgba(81,163,81,0.3)' : 'rgba(170,170,170,0.3)';
                const autoRefIcon = ctx.autoRefresh ? 'fa-toggle-on' : 'fa-toggle-off';

                html += `
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px; flex-shrink:0;">
                        <div style="display:flex; align-items:center; gap:12px;">
                            <div style="color:#51a351; font-weight:bold; font-size:13px;"><i class="fas fa-list"></i> 총: ${res.total_items}건</div>
                            <a href="#" id="pmh_dt_auto_ref" style="font-size:12px; text-decoration:none; padding:2px 6px; border-radius:4px; color:${autoRefColor}; background:${autoRefBg}; border:1px solid ${autoRefBorder};" title="목록 자동 갱신 켜기/끄기"><i class="fas ${autoRefIcon}"></i> 자동 갱신</a>
                            <a href="#" id="pmh_dt_def_sort" style="color:#e5a00d; font-size:12px; text-decoration:none; padding:2px 6px; background:rgba(229,160,13,0.1); border:1px solid rgba(229,160,13,0.3); border-radius:4px;" title="기본 정렬 상태로 되돌리기"><i class="fas fa-sort-amount-down"></i> 기본 정렬</a>
                        </div>
                    </div>
                `;

                if (res.total_items === 0) {
                    html += `<div style="padding:20px; text-align:center; color:#777; background:#111; border-radius:6px;">조회된 항목이 없습니다.</div>`;
                } else {
                    html += `<div style="overflow-x:auto; flex-grow:1;">
                                <table style="width:100%; border-collapse:collapse; font-size:12px; text-align:left; white-space:nowrap; table-layout:fixed;">
                                    <thead>
                                        <tr style="border-bottom:1px solid #444; color:#e5a00d;">`;
                    res.columns.forEach(col => {
                        let sortIcon = '';
                        if (ctx.sortKey === col.key) sortIcon = ctx.sortDir === 'asc' ? ' <i class="fas fa-sort-up"></i>' : ' <i class="fas fa-sort-down"></i>';
                        const wStr = col.width ? `width:${col.width};` : '';
                        const hAlignStr = `text-align:${col.header_align || col.align || 'center'};`;
                        html += `           <th style="padding:8px; cursor:pointer; ${wStr} ${hAlignStr}" class="pmh-th-sort" data-key="${col.key}" title="클릭하여 정렬">${col.label}${sortIcon}</th>`;
                    });
                    html += `           </tr>
                                    </thead>
                                    <tbody>`;

                    res.data.forEach(row => {
                        const isErr = row._pmh_status === 'error';
                        const rowStyle = isErr ? `background:rgba(189,54,47,0.15); border-bottom:1px solid #bd362f;` : `border-bottom:1px solid #333;`;
                        const errTitle = isErr ? `title="이전에 실패한 항목"` : '';

                        html += `       <tr style="${rowStyle}" class="pmh-dt-row" ${errTitle}>`;
                        res.columns.forEach(col => {
                            let val = row[col.key] !== undefined && row[col.key] !== null ? row[col.key] : '-';
                            let displayHtml = val;
                            const alignStr = `text-align:${col.align || 'left'};`;
                            
                            // [수정점] HTML 태그를 완벽하게 제거하여 순수 텍스트만 추출합니다.
                            const rawText = String(val).replace(/<[^>]*>?/gm, '').trim();
                            const safeTitle = rawText.replace(/"/g, '&quot;');

                            if (col.type === 'link' && row[col.link_key]) {
                                if (isMobileEnv) {
                                    displayHtml = `<span style="color:${isErr ? '#ff6b6b' : '#2f96b4'}; font-weight:bold;">${val}</span>`;
                                } else {
                                    displayHtml = `<a href="#!/server/${res.machine_id}/details?key=${encodeURIComponent('/library/metadata/' + row[col.link_key])}" style="color:${isErr ? '#ff6b6b' : '#2f96b4'}; text-decoration:none; font-weight:bold;" title="${safeTitle}" onmouseover="this.style.textDecoration='underline'" onmouseout="this.style.textDecoration='none'">${val}</a>`;
                                }
                            } else if (col.type === 'action_btn') {
                                const payload = JSON.stringify({action_type: col.action_type, _is_single: true, ...row}).replace(/"/g, '&quot;');
                                displayHtml = `${isErr ? `<span style="color:#bd362f; margin-right:4px;" title="이전 작업 실패"><i class="fas fa-exclamation-triangle"></i></span>` : ''}<button class="pmh-tbl-action-btn" data-payload="${payload}" style="background:none; border:none; color:#e5a00d; cursor:pointer; font-size:14px;" title="단독 실행"><i class="${col.icon || 'fas fa-play'}"></i></button>`;
                            }
                            html += `       <td style="padding:8px; overflow:hidden; text-overflow:ellipsis; ${alignStr}" title="${safeTitle}">${displayHtml}</td>`;
                        });
                        html += `       </tr>`;
                    });
                    html += `       </tbody>
                                </table>
                             </div>`;
                    
                    html += `<div style="display:flex; flex-direction:column; align-items:center; margin-top:20px; flex-shrink:0;">`;
                    if (res.total_pages > 1) {
                        if (res.total_pages > 3) {
                            html += `<div style="display:flex; align-items:center; gap:10px; margin-bottom:12px; width:100%; max-width:400px;" title="드래그하거나 숫자를 입력하여 페이지를 이동합니다.">
                                        <span style="color:#aaa; font-size:11px;">이동:</span>
                                        <input type="number" id="pmh_page_in" value="${res.page}" min="1" max="${res.total_pages}" style="width:50px; background:#111; color:#fff; border:1px solid #444; text-align:center; border-radius:4px; font-size:12px;" title="엔터(Enter)를 누르면 이동합니다.">
                                        <span style="color:#777; font-size:11px;">/ ${res.total_pages}</span>
                                        <input type="range" id="pmh_page_range" min="1" max="${res.total_pages}" value="${res.page}" style="flex-grow:1; accent-color:#e5a00d;">
                                     </div>`;
                        }
                        html += `<div style="display:flex; gap:5px; margin-bottom:15px;">`;
                        html += `<button class="pmh-page-btn" data-p="1" ${res.page>1?'':'disabled'} title="첫 페이지"><i class="fas fa-angle-double-left"></i></button>`;
                        html += `<button class="pmh-page-btn" data-p="${res.page-1}" ${res.page>1?'':'disabled'} title="이전 페이지"><i class="fas fa-angle-left"></i></button>`;
                        let startP = Math.max(1, res.page - 2); let endP = Math.min(res.total_pages, res.page + 2);
                        for(let i=startP; i<=endP; i++) {
                            html += `<button class="pmh-page-btn ${i===res.page?'active':''}" data-p="${i}" title="${i} 페이지">${i}</button>`;
                        }
                        html += `<button class="pmh-page-btn" data-p="${res.page+1}" ${res.page<res.total_pages?'':'disabled'} title="다음 페이지"><i class="fas fa-angle-right"></i></button>`;
                        html += `<button class="pmh-page-btn" data-p="${res.total_pages}" ${res.page<res.total_pages?'':'disabled'} title="마지막 페이지"><i class="fas fa-angle-double-right"></i></button>`;
                        html += `</div>`;
                    }
                    
                    html += `
                        <div style="display:flex; align-items:center; gap:15px; margin-bottom:15px;">
                            <div style="display:flex; align-items:center; gap:8px;">
                                <span style="color:#aaa; font-size:11px;">페이지당:</span>
                                <select id="pmh_dt_limit" style="padding:3px; background:#111; color:#fff; border:1px solid #444; border-radius:4px; font-size:11px; cursor:pointer;" title="한 페이지에 표시할 항목 수를 변경합니다.">
                                    <option value="10" ${ctx.itemsPerPage===10?'selected':''}>10개</option>
                                    <option value="20" ${ctx.itemsPerPage===20?'selected':''}>20개</option>
                                    <option value="30" ${ctx.itemsPerPage===30?'selected':''}>30개</option>
                                    <option value="50" ${ctx.itemsPerPage===50?'selected':''}>50개</option>
                                    <option value="100" ${ctx.itemsPerPage===100?'selected':''}>100개</option>
                                </select>
                            </div>
                            <button id="pmh_btn_clear_data" style="background:#222; color:#aaa; border:1px solid #444; border-radius:4px; padding:4px 10px; font-size:11px; cursor:pointer;" title="조회된 데이터 목록을 모두 비웁니다."><i class="fas fa-broom"></i> 목록 비우기</button>
                        </div>
                    `;
                    html += `</div>`;

                    if (res.action_button) {
                        const btnPayload = JSON.stringify(res.action_button.payload).replace(/"/g, '&quot;');
                        
                        html += `<div style="text-align:center; margin-top:10px; padding-top:15px; border-top:1px dashed #444; flex-shrink:0; display:flex; justify-content:center; gap:10px;">
                                    
                                    <div id="pmh_tbl_global_exec_wrapper" class="pmh-btn-wrapper" style="display:block;">
                                        <button class="pmh-dynamic-run-btn pmh-tbl-global-action pmh-dt-action-btn pmh-btn-execute" data-payload="${btnPayload}" style="background-color:#51a351 !important; color:#1f1f1f !important;" title="조회된 전체 목록에 대해 작업을 실행합니다.">
                                            ${res.action_button.label}
                                        </button>
                                        <div class="pmh-btn-overlay"><i class="fas fa-spinner fa-spin"></i></div>
                                    </div>

                                    <div id="pmh_tbl_global_cancel_wrapper" class="pmh-btn-wrapper" style="display:none;">
                                        <button class="pmh-dt-action-btn pmh-btn-cancel pmh-tbl-global-cancel" style="background-color:#bd362f !important; color:#fff !important;" title="현재 실행 중인 작업을 즉시 중단합니다.">
                                            <i class="fas fa-stop"></i> 작업 중단
                                        </button>
                                    </div>
                                    
                                 </div>`;
                    }
                }
            }
            resEl.innerHTML = html;

            updateFormTabButtons(ctx.isRunning);

            if (!isMobileEnv) setTimeout(applyMaxHeight, 50);

            resEl.querySelectorAll('.pmh-tbl-global-cancel').forEach(b => b.onclick = async (e) => {
                e.preventDefault();
                b.disabled = true;
                b.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 중단 중...';
                ctx.isCancelling = true;
                await config.apiAdapter.cancel(config.toolId);
            });

            resEl.querySelectorAll('.pmh-page-btn').forEach(b => b.onclick = () => loadPage(parseInt(b.dataset.p), ctx.sortKey, ctx.sortDir));
            resEl.querySelectorAll('.pmh-th-sort').forEach(th => th.onclick = () => {
                const newDir = (ctx.sortKey === th.dataset.key && ctx.sortDir === 'asc') ? 'desc' : 'asc';
                loadPage(1, th.dataset.key, newDir);
            });

            const limitSel = resEl.querySelector('#pmh_dt_limit');
            if (limitSel) limitSel.onchange = (e) => loadPage(1, ctx.sortKey, ctx.sortDir, parseInt(e.target.value));

            const inPage = resEl.querySelector('#pmh_page_in');
            const rangePage = resEl.querySelector('#pmh_page_range');
            if (inPage && rangePage) {
                rangePage.oninput = (e) => inPage.value = e.target.value;
                rangePage.onchange = (e) => loadPage(parseInt(e.target.value), ctx.sortKey, ctx.sortDir);
                inPage.onkeydown = (e) => { if(e.key === 'Enter') loadPage(parseInt(e.target.value), ctx.sortKey, ctx.sortDir); };
            }

            const refBtn = resEl.querySelector('#pmh_dt_auto_ref');
            if (refBtn) refBtn.onclick = (e) => {
                e.preventDefault(); ctx.autoRefresh = !ctx.autoRefresh;
                if(ctx.autoRefresh) loadPage(ctx.currentPage, ctx.sortKey, ctx.sortDir);
                else { refBtn.style.color='#aaa'; refBtn.style.background='rgba(170,170,170,0.1)'; refBtn.style.borderColor='rgba(170,170,170,0.3)'; refBtn.innerHTML='<i class="fas fa-toggle-off"></i> 자동 갱신'; }
            };

            const defSortBtn = resEl.querySelector('#pmh_dt_def_sort');
            if (defSortBtn) defSortBtn.onclick = (e) => { e.preventDefault(); loadPage(1, null, 'asc'); };

            const clearBtn = resEl.querySelector('#pmh_btn_clear_data');
            if (clearBtn) clearBtn.onclick = async () => {
                if(confirm("조회된 데이터 목록을 비우시겠습니까?\n(환경 설정과 상태는 유지됩니다)")) {
                    try {
                        await config.apiAdapter.run({action_type: 'clear_data', _server_id: ctx.srvId});
                        config.toast.info("목록이 비워졌습니다.");
                        loadPage(1, ctx.sortKey, ctx.sortDir);
                    } catch(e){}
                }
            };

            resEl.querySelectorAll('.pmh-tbl-action-btn, .pmh-tbl-global-action').forEach(b => b.onclick = async () => {
                const payload = JSON.parse(b.dataset.payload);
                const req = { ...getFormData(), ...payload };
                config.toast.info("작업 실행 중...");

                const wrapper = b.closest('.pmh-btn-wrapper');
                const overlay = wrapper ? wrapper.querySelector('.pmh-btn-overlay') : null;

                const origHtml = b.innerHTML;
                if (wrapper) {
                    b.disabled = true;
                    if (overlay) overlay.style.display = 'flex';
                } else {
                    b.innerHTML = `<i class="fas fa-spinner fa-spin"></i>`;
                    b.disabled = true;
                }

                try {
                    const r = await config.apiAdapter.run(req);
                    if (r.type === 'async_task') {
                        config.toast.success("백그라운드 시작!");
                        startPolling();
                        switchTab('pmh_tab_monitor');
                    }
                    else loadPage(ctx.currentPage, ctx.sortKey, ctx.sortDir);
                } catch(e) {
                    config.toast.error("오류: "+e);
                    b.innerHTML = origHtml;
                    b.disabled = false;
                    if (overlay) overlay.style.display = 'none';
                }
            });
        };

        const startPolling = async () => {
            if (ctx.isDestroyed) return;
            if (ctx.pollTimer) clearTimeout(ctx.pollTimer);

            updateFormTabButtons(true);
            ctx.pollCount = 0;

            const stateEl = ctx.c.querySelector('#pmh_mon_state');
            const progEl = ctx.c.querySelector('#pmh_mon_prog');
            const barEl = ctx.c.querySelector('#pmh_mon_bar');
            const logBox = ctx.c.querySelector('#pmh_mon_logs');
            const cancelBtn = ctx.c.querySelector('#pmh_btn_cancel');

            cancelBtn.style.display = 'block'; cancelBtn.disabled = false; cancelBtn.innerHTML = '<i class="fas fa-stop"></i> 작업 중단';
            cancelBtn.onclick = async () => { cancelBtn.disabled=true; cancelBtn.innerHTML='중단 중...'; ctx.isCancelling=true; await config.apiAdapter.cancel(config.toolId); };

            const poll = async () => {
                if (ctx.isDestroyed || !document.body.contains(ctx.c)) return;
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
                        ctx.isCancelling = false;

                        updateFormTabButtons(false);

                        if(ctx.autoRefresh) {
                            setTimeout(() => {
                                loadPage(ctx.currentPage, ctx.sortKey, ctx.sortDir, null, true);
                                if(s.state==='completed') switchTab('pmh_tab_form');
                            }, 1000);
                        }
                    } else {
                        stateEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 실행 중...'; stateEl.style.color = '#e5a00d';

                        ctx.pollCount++;
                        if (ctx.autoRefresh && ctx.pollCount % 2 === 0) {
                            loadPage(ctx.currentPage, ctx.sortKey, ctx.sortDir, null, true);
                        }

                        ctx.pollTimer = setTimeout(poll, 1500);
                    }
                } catch(e) { ctx.pollTimer = setTimeout(poll, 2000); }
            };
            poll();
        };

        if (ctx.ui.active_task && ctx.ui.active_task.state === 'running') {
            switchTab('pmh_tab_monitor'); startPolling();
        } else {
            loadPage(1, ctx.sortKey, ctx.sortDir);
        }

        ctx.c.querySelectorAll('.pmh-main-run-btn').forEach(btn => {
            btn.onclick = async () => {
                if (ctx.isDestroyed) return;
                const wrapper = btn.closest('.pmh-btn-wrapper');
                const overlay = wrapper ? wrapper.querySelector('.pmh-btn-overlay') : null;
                btn.disabled = true; if(overlay) overlay.style.display = 'flex';

                try {
                    const req = getFormData(); req.action_type = btn.dataset.action;
                    await config.apiAdapter.run({...req, action_type: 'save_options'});
                    const r = await config.apiAdapter.run(req);
                    if (r.type === 'async_task') { config.toast.success("작업 시작!"); switchTab('pmh_tab_monitor'); startPolling(); }
                    else { config.toast.success("완료!"); loadPage(1, ctx.sortKey, ctx.sortDir); }
                } catch(e) { config.toast.error("오류: "+e); }
                finally { btn.disabled = false; if(overlay) overlay.style.display = 'none'; }
            };
        });

        const saveBtn = ctx.c.querySelector('#pmh_btn_save_opts');
        if(saveBtn) saveBtn.onclick = async () => {
            if (ctx.isDestroyed) return;
            saveBtn.disabled=true; saveBtn.innerHTML="<i class='fas fa-spinner fa-spin'></i> 저장 중...";
            const req = getFormData(); req.action_type = 'save_options';
            try { await config.apiAdapter.run(req); config.toast.success("설정 저장됨!"); } catch(e){} finally { saveBtn.disabled=false; saveBtn.innerHTML='<i class="fas fa-save"></i> 설정 적용'; }
        };

        const resetAllBtn = ctx.c.querySelector('#pmh_btn_reset_all');

        const handleReset = async (e) => {
            e.preventDefault(); e.stopPropagation();
            if (ctx.isDestroyed) return;

            if(confirm(`[${currentSrv.name}] 서버에 저장된 옵션과 결과, 작업 기록을 모두 초기화하시겠습니까?`)) {
                try {
                    if (typeof GM_deleteValue === 'function') {
                        GM_deleteValue(`pmh_panel_geo_${config.toolId}`);
                        GM_deleteValue(`pmh_tool_cache_global_${config.toolId}`);
                        GM_deleteValue(`pmh_tool_cache_${config.toolId}`);
                    }

                    await config.apiAdapter.run({action_type: 'reset', _server_id: ctx.srvId});
                    config.toast.success("설정 및 데이터 캐시가 초기화되었습니다.");

                } catch(e) {
                    console.error("[PMH UI Core] 백그라운드 초기화 API 호출 실패 (무시됨):", e);
                    config.toast.info("서버 응답 오류가 있었으나 로컬 화면은 초기화됩니다.");
                } finally {
                    const resForm = ctx.c.querySelector('#pmh_data_table_res');
                    if (resForm) {
                        resForm.style.display = 'none';
                        resForm.innerHTML = '';
                    }

                    const resMonitorLogs = ctx.c.querySelector('#pmh_mon_logs');
                    if (resMonitorLogs) resMonitorLogs.innerHTML = '로그 없음';

                    const resMonitorState = ctx.c.querySelector('#pmh_mon_state');
                    if (resMonitorState) {
                        resMonitorState.innerHTML = '<i class="fas fa-info-circle"></i> 대기 중';
                        resMonitorState.style.color = '#e5a00d';
                    }

                    const resMonitorProg = ctx.c.querySelector('#pmh_mon_prog');
                    if (resMonitorProg) resMonitorProg.innerText = '0 / 0 (0%)';

                    const resMonitorBar = ctx.c.querySelector('#pmh_mon_bar');
                    if (resMonitorBar) resMonitorBar.style.width = '0%';

                    const cancelBtn = ctx.c.querySelector('#pmh_btn_cancel');
                    if (cancelBtn) cancelBtn.style.display = 'none';

                    if (ctx.pollTimer) {
                        clearTimeout(ctx.pollTimer);
                        ctx.pollTimer = null;
                    }
                    ctx.isCancelling = false;

                    const panel = document.getElementById('pmh-tool-panel');
                    if (panel && !isMobileEnv) {
                        panel.style.top = '80px';
                        panel.style.left = '60%';
                        panel.style.width = '450px';
                        panel.style.height = 'auto';
                    }

                    switchTab('pmh_tab_form');

                    loadPage(1, null, 'asc').catch(()=>{});
                }
            }
        };

        if (resetAllBtn) resetAllBtn.addEventListener('click', handleReset);

        if (isMobileEnv) {
            const mobileResizeHandler = () => {
                if (!ctx.isDestroyed) updateLogBoxHeight();
            };
            window.addEventListener('resize', mobileResizeHandler);
            ctx.mobileResizeHandler = mobileResizeHandler;
        } else {
            const panel = document.getElementById('pmh-tool-panel');
            if (panel && typeof ResizeObserver !== 'undefined') {
                const resizeObserver = new ResizeObserver(() => {
                    if (!ctx.isDestroyed) {
                        if (ctx.autoHeightBeforeMonitor && panel.style.height !== ctx.autoHeightBeforeMonitor + 'px') {
                            ctx.autoHeightBeforeMonitor = null;
                        }
                        updateLogBoxHeight();
                    }
                });
                resizeObserver.observe(panel);
                ctx.resizeObserver = resizeObserver;
            }
        }
    }
};
