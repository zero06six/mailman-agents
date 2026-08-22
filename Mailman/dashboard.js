
                const input = document.getElementById('prompt-input');
        const expandBtn = document.getElementById('expand-input-btn');
        input.addEventListener('input', function() { 
            autoResizeTextarea(this); 
            const numLines = (this.value.match(/\n/g) || []).length;
            if (numLines >= 4 || this.scrollHeight > 100) {
                expandBtn.style.display = 'flex';
            } else {
                if (!document.querySelector('.input-wrapper').classList.contains('expanded')) {
                    expandBtn.style.display = 'none';
                }
            }
        });
        const sendBtn = document.getElementById('send-btn');
        expandBtn.addEventListener('click', function() {
            document.querySelector('.input-wrapper').classList.toggle('expanded');
            if(!document.querySelector('.input-wrapper').classList.contains('expanded')) {
                autoResizeTextarea(input);
            }
        });
        const stopBtn = document.getElementById('stop-btn');
        const chatContainer = document.getElementById('chat-container');
        const chatInner = document.getElementById('chat-inner');
        const statusBadge = document.querySelector('.status-badge');

        let isProcessing = false;



// handleSend definition moved to the bottom where the full version is

        input.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
            }
        });

        sendBtn.addEventListener('click', handleSend);
        stopBtn.addEventListener('click', function() {
            window.dispatchEvent(new CustomEvent('AI_COUNCIL_ABORT'));
            appendSystemMessage('SYSTEM ERROR: Pipeline manually aborted by user.');
            hideLoading();
            resetState();
        });

        window.addEventListener('AI_COUNCIL_NODE_UPDATE', (e) => {
            try {
                const data = JSON.parse(e.detail);
                if (data.error) {
                    hideLoading();
                    appendSystemMessage('SYSTEM ERROR (Timeout): ' + data.error);
                    resetState();
                    return;
                }
                const statusEl = document.getElementById('system-status');
                if (statusEl) statusEl.style.color = ''; // reset color
                showLoading(data.modelName + ' (' + data.roleName + ')');
            } catch (err) {}
        });

        window.addEventListener('AI_COUNCIL_NODE_SKIPPED', (e) => {
            try {
                const data = JSON.parse(e.detail);
                if (liveTimerInterval) clearInterval(liveTimerInterval);
                const loadingText = document.querySelector('.loading-text');
                if (loadingText) {
                    loadingText.textContent = data.modelName + ' Skipped...';
                    loadingText.style.color = '#ef4444'; // Red to indicate skip
                }
            } catch (err) {}
        });

        window.addEventListener('AI_COUNCIL_FINAL_RESPONSE', (e) => {
            hideLoading();
            try {
                const data = JSON.parse(e.detail);
                
                let totalDuration = data.duration;
                if (typeof pipelineStartTime !== 'undefined' && pipelineStartTime > 0) {
                    totalDuration = ((Date.now() - pipelineStartTime) / 1000).toFixed(1);
                }
                
                appendMessage('ai', data.modelName, data.roleName, data.text, totalDuration);
                resetState();
            } catch (err) {
                appendSystemMessage('SYSTEM ERROR: Execution interrupted: ' + err.message);
                resetState();
            }
        });

        window.addEventListener('AI_COUNCIL_NODE_DIED', (e) => {
            hideLoading();
            try {
                const data = JSON.parse(e.detail);
                appendSystemMessage('SYSTEM ERROR: Pipeline aborted. Node "' + data.node + '" was closed manually or crashed mid-generation.');
            } catch (err) {
                appendSystemMessage('SYSTEM ERROR: Pipeline aborted due to unresponsive node.');
            } finally {
                resetState();
            }
        });

        window.addEventListener('AI_COUNCIL_PIPELINE_ERROR', (e) => {
            hideLoading();
            try {
                const data = JSON.parse(e.detail);
                // Anti-spam deduplication
                const chatHistory = document.getElementById('chat-inner');
                const lastMsg = chatHistory.lastElementChild;
                let isDuplicate = false;
                if (lastMsg && lastMsg.innerText.includes(data.error)) {
                    isDuplicate = true;
                }
                resetState();
                
                if (data.error.includes('Tab was closed') || data.error.includes('tab was closed') || data.error.includes('Tabs missing')) {
                    statusBadge.textContent = 'Tab Removed';
                    statusBadge.style.color = '#ef4444';
                    statusBadge.style.backgroundColor = 'rgba(239, 68, 68, 0.1)';
                } else if (data.error.includes('Pipeline changed')) {
                    statusBadge.textContent = 'Needs Setup';
                    statusBadge.style.color = '#f59e0b';
                    statusBadge.style.backgroundColor = 'rgba(245, 158, 11, 0.1)';
                } else {
                    statusBadge.textContent = 'Error';
                    statusBadge.style.color = '#ef4444';
                    statusBadge.style.backgroundColor = 'rgba(239, 68, 68, 0.1)';
                }

                if (!isDuplicate) {
                    appendSystemMessage('SYSTEM ERROR: ' + data.error);
                }
            } catch (err) {}
        });

        window.addEventListener('AI_COUNCIL_SETUP_COMPLETE', () => {
            hideLoading();
            window.setupCooldownActive = false;
            
            statusBadge.textContent = 'Ready';
            statusBadge.style.color = 'var(--accent)';
            statusBadge.style.backgroundColor = 'rgba(16, 185, 129, 0.1)';

            const chatHistory = document.getElementById('chat-inner');
            const lastMsg = chatHistory.lastElementChild;
            const msg = 'Setup Complete! You can now send prompts.';
            if (lastMsg && lastMsg.innerText.includes(msg)) return;
            appendSystemMessage('SYSTEM: ' + msg);
        });

        // Modal Logic
        const btnEditRoles = document.getElementById('btn-edit-roles');
        const btnCloseModal = document.getElementById('btn-close-modal');
        const rolesModal = document.getElementById('roles-modal');

        btnEditRoles.addEventListener('click', () => {
            rolesModal.classList.add('visible');
        });

        // Safety check for disabling all nodes
        document.querySelectorAll('.node-toggle').forEach(toggle => {
            toggle.addEventListener('change', () => {
                const checkedCount = document.querySelectorAll('.node-toggle:checked').length;
                if (checkedCount === 0) {
                    btnCloseModal.disabled = true;
                    btnCloseModal.textContent = 'Enable an AI';
                } else {
                    btnCloseModal.disabled = false;
                    btnCloseModal.textContent = 'Save & Close';
                }
                updateToggleAllButtonState();
                updateNodeNumbers();
            });
        });

        function autoResizeTextarea(textarea) {
            textarea.style.height = 'auto';
            textarea.style.height = (textarea.scrollHeight) + 'px';
        }

        document.querySelectorAll('.card-body textarea').forEach(textarea => {
            textarea.addEventListener('input', function() {
                autoResizeTextarea(this);
            });
        });



        // Scroll Hijacking Prevention
        function scrollToBottom(force = false) {
            const isNearBottom = chatContainer.scrollHeight - chatContainer.scrollTop - chatContainer.clientHeight < 150;
            if (force || isNearBottom) {
                chatContainer.scrollTo({
                    top: chatContainer.scrollHeight,
                    behavior: 'smooth'
                });
            }
        }

                        function appendSystemMessage(text) {
            const msgDiv = document.createElement('div');
            msgDiv.style.display = 'flex';
            msgDiv.style.alignItems = 'center';
            msgDiv.style.justifyContent = 'center';
            msgDiv.style.fontSize = '12px';
            msgDiv.style.color = 'var(--text-muted)';
            msgDiv.style.margin = '20px 0';
            msgDiv.style.fontWeight = '500';
            msgDiv.style.gap = '16px';
            
            const line1 = document.createElement('div');
            line1.style.height = '1px';
            line1.style.flex = '1';
            line1.style.background = 'var(--border)';
            
            const line2 = document.createElement('div');
            line2.style.height = '1px';
            line2.style.flex = '1';
            line2.style.background = 'var(--border)';
            
            const span = document.createElement('span');
            span.textContent = text;
            
            msgDiv.appendChild(line1);
            msgDiv.appendChild(span);
            msgDiv.appendChild(line2);
            
            chatInner.appendChild(msgDiv);
            scrollToBottom(true);
        }

                function appendMessage(role, modelName, roleName, text, duration = null) {
            const wrapper = document.createElement('div');
            wrapper.className = 'message ' + role;

            const labelDiv = document.createElement('div');
            labelDiv.className = 'message-label';
            if (role === 'user') {
                labelDiv.textContent = 'You';
            } else {
                labelDiv.textContent = modelName + (roleName ? ' (' + roleName + ')' : '');
            }

            const contentDiv = document.createElement('div');
            contentDiv.className = 'message-content';
            contentDiv.textContent = text;

            wrapper.appendChild(labelDiv);
            wrapper.appendChild(contentDiv);

                        const actionsDiv = document.createElement('div');
            actionsDiv.className = 'message-actions';
            
            if (role !== 'user') {
                const copyBtn = document.createElement('button');
                copyBtn.className = 'copy-btn';
                copyBtn.title = 'Copy to clipboard';
                copyBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
                copyBtn.addEventListener('click', () => {
                    navigator.clipboard.writeText(text);
                    copyBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>';
                    setTimeout(() => {
                        copyBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
                    }, 2000);
                });
                actionsDiv.appendChild(copyBtn);
            } else {
                // Keep the layout spaced correctly
                const emptyDiv = document.createElement('div');
                actionsDiv.appendChild(emptyDiv);
            }

            const metaDiv = document.createElement('div');
            metaDiv.className = 'message-meta';
            
            if (duration) {
                const durSpan = document.createElement('span');
                durSpan.className = 'duration';
                durSpan.textContent = '(' + duration + 's)';
                metaDiv.appendChild(durSpan);
            }

            const timeSpan = document.createElement('span');
            timeSpan.className = 'timestamp';
            timeSpan.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            metaDiv.appendChild(timeSpan);
            
            actionsDiv.appendChild(metaDiv);
            wrapper.appendChild(actionsDiv);

            chatInner.appendChild(wrapper);
            scrollToBottom(true);
        }

                const loadingDiv = document.createElement('div');
        loadingDiv.className = 'loading';
        loadingDiv.style.display = 'none';
        loadingDiv.innerHTML = '<div class="spinner"></div><div class="loading-text">Processing...</div>';
        chatInner.appendChild(loadingDiv);

        let liveTimerInterval = null;
        let pipelineStartTime = 0;

        function showLoading(text) {
            loadingDiv.style.display = 'flex';
            const loadingText = loadingDiv.querySelector('.loading-text');
            loadingText.style.color = ''; // reset color from any previous skips
            
            if (!pipelineStartTime) {
                pipelineStartTime = Date.now();
            }
            
            if (liveTimerInterval) clearInterval(liveTimerInterval);
            liveTimerInterval = setInterval(() => {
                const elapsed = ((Date.now() - pipelineStartTime) / 1000).toFixed(1);
                loadingText.textContent = text + ' is processing... (' + elapsed + 's)';
            }, 100);
            
            chatInner.appendChild(loadingDiv);
            scrollToBottom(true);
        };

        function hideLoading() {
            loadingDiv.style.display = 'none';
            if (liveTimerInterval) {
                clearInterval(liveTimerInterval);
                liveTimerInterval = null;
            }
        };

        function hideLoading() {
            loadingDiv.style.display = 'none';
        };
                function resetState(preserveBadge = false) {
            pipelineStartTime = 0;
            if (!preserveBadge) {
                const current = statusBadge.textContent;
                if (current === 'Idle' || current === 'Needs Setup' || current === 'Tab Removed') {
                    // Do not overwrite these specific statuses with Ready on a generic reset
                } else {
                    statusBadge.textContent = 'Ready';
                    statusBadge.style.color = 'var(--accent)';
                    statusBadge.style.backgroundColor = 'rgba(16, 185, 129, 0.1)';
                }
            }

            isProcessing = false;
            btnEditRoles.disabled = false;
            btnEditRoles.textContent = 'Edit Roles';
            stopBtn.style.display = 'none';
            sendBtn.style.display = 'flex';
            sendBtn.style.opacity = '1';
            sendBtn.style.cursor = 'pointer';
            
            const btnSetup = document.getElementById('btn-setup-council');
            if (btnSetup && !window.setupCooldownActive) {
                btnSetup.disabled = false;
                btnSetup.style.opacity = '1';
                btnSetup.style.cursor = 'pointer';
            }
            
            input.focus();
        }

        async function handleSend() {
            if (isProcessing) return;
            const text = input.value.trim();
            if (!text) return;

                        isProcessing = true;
            btnEditRoles.disabled = true;
            btnEditRoles.textContent = 'Processing...';
            sendBtn.style.display = 'none';
            stopBtn.style.display = 'flex';
            stopBtn.style.alignItems = 'center';
            stopBtn.style.justifyContent = 'center';
            
            const btnSetup = document.getElementById('btn-setup-council');
            if (btnSetup) {
                btnSetup.disabled = true;
                btnSetup.style.opacity = '0.5';
                btnSetup.style.cursor = 'not-allowed';
            }

            appendMessage('user', 'You', null, text);
            input.value = '';
            input.style.height = 'auto';
            document.querySelector('.input-wrapper').classList.remove('expanded');
            document.getElementById('expand-input-btn').style.display = 'none';

            try {
                const pipeline = window.getPipelineConfig();
                const contextDepth = document.getElementById('contextDepthSelect').value;
                if (pipeline.length === 0) {
                    throw new Error("No active AI nodes in the pipeline.");
                }

                window.dispatchEvent(new CustomEvent('AI_COUNCIL_SEND', {
                    detail: JSON.stringify({ prompt: text, pipeline: pipeline, contextDepth: contextDepth })
                }));

            } catch (err) {
                hideLoading();
                appendSystemMessage('SYSTEM ERROR: Execution interrupted: ' + err.message);
                resetState();
            }
        }

window.setupCooldownActive = false;
document.getElementById('btn-setup-council').addEventListener('click', function() {
    if (isProcessing) {
        alert('Cannot initiate setup while a prompt is processing. Please wait for it to finish.');
        return;
    }
    if (window.setupCooldownActive) {
        alert('Please wait before initiating setup again (10 second cooldown).');
        return;
    }

    const pipeline = window.getPipelineConfig();
                const contextDepth = document.getElementById('contextDepthSelect').value;
                if (pipeline.length === 0) { 
        alert('No active AI nodes in the pipeline.'); 
        return; 
    }
    
    window.setupCooldownActive = true;
    this.disabled = true;
    this.style.opacity = '0.5';
    this.style.cursor = 'not-allowed';
    setTimeout(() => {
        window.setupCooldownActive = false;
        if (!isProcessing) {
            this.disabled = false;
            this.style.opacity = '1';
            this.style.cursor = 'pointer';
        }
    }, 10000);
    
    alert('Setup Wizard:\n\n1. A new tab will open for the first AI.\n2. Wait for it to fully load, then click the extension icon to bypass Chrome\'s background throttling feature.\n3. It will automatically route you to the next AI tab.\n4. Repeat until you are brought back here!');
    
    window.dispatchEvent(new CustomEvent('AI_COUNCIL_SETUP', { detail: JSON.stringify({ pipeline: pipeline }) }));
});



































// Credits Modal Logic
document.getElementById('info-btn').addEventListener('click', () => {
    document.getElementById('creditsModal').classList.add('visible');
});
document.getElementById('closeCreditsBtn').addEventListener('click', () => {
    document.getElementById('creditsModal').classList.remove('visible');
});
document.getElementById('creditsModal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('creditsModal')) {
        document.getElementById('creditsModal').classList.remove('visible');
    }
});

const infoBtn = document.getElementById('info-btn');
infoBtn.addEventListener('mouseenter', () => {
    infoBtn.style.color = 'var(--text-main)';
    infoBtn.style.borderColor = 'var(--text-muted)';
    infoBtn.style.transform = 'scale(1.05)';
});
infoBtn.addEventListener('mouseleave', () => {
    infoBtn.style.color = 'var(--text-muted)';
    infoBtn.style.borderColor = 'var(--border)';
    infoBtn.style.transform = 'scale(1)';
});
const ghBtn = document.getElementById('github-btn');
ghBtn.addEventListener('mouseenter', () => {
    ghBtn.style.color = 'var(--text-main)';
    ghBtn.style.borderColor = 'var(--text-muted)';
    ghBtn.style.transform = 'scale(1.05)';
});
ghBtn.addEventListener('mouseleave', () => {
    ghBtn.style.color = 'var(--text-muted)';
    ghBtn.style.borderColor = 'var(--border)';
    ghBtn.style.transform = 'scale(1)';
});

