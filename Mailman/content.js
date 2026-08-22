if (window.bridgeInjected) {

} else {
window.bridgeInjected = true;

(async function() {
    const myTabId = await new Promise(resolve => {
        chrome.runtime.sendMessage({ type: 'GET_TAB_ID' }, response => resolve(response.tabId));
    });

    const data = await chrome.storage.local.get(['pipeline']);
    if (!data.pipeline) return;

    const myNode = data.pipeline.find(n => n.tabId === myTabId);
    if (!myNode) return; // We are not an official pipeline tab

    const myAI = myNode.id;

    if (myAI === 'gemini') {
        let attempts = 0;
        let tempChatInterval = setInterval(() => {
            let tempBtn = document.querySelector('button[aria-label="Temporary chat"]');
            if (tempBtn) {

                tempBtn.click();
                clearInterval(tempChatInterval);
            }
            attempts++;
            if (attempts > 10) clearInterval(tempChatInterval);
        }, 500);
    }
  
    const DOMHacker = {
        SEL: {
            input: '.ql-editor[contenteditable="true"], [data-lexical-editor="true"], textarea.message-input-textarea, textarea, [contenteditable="true"]',
            send: 'button[aria-label*="Send" i], button[aria-label*="send" i], button[mattooltip*="Send" i], [data-testid="composer-send-button"], .message-input-right-button-send button, .chat-prompt-send-button button, button[type="submit"]',
            stop: 'button[aria-label*="Stop" i], button[data-testid="stop-button"], [data-testid="composer-stop-button"], [class*="stop-generating" i], .send-button-stop, path[d^="M2 4.88"]',
            response: '.message-content, .model-response-text, .ur-markdown, .ds-markdown, .markdown-body, .prose, [data-testid="assistant-message"]'
        },
        initSelectors: function() {
            if (myAI === 'qwen') {
                this.SEL.response = '.message-content, [class*="message-content"], [class*="content-wrapper"], [class*="response-container"], [class*="agent-chat-content"], .markdown-body';
            } else if (myAI === 'gemini') {
                this.SEL.input = 'rich-textarea [contenteditable="true"], .ql-editor[contenteditable="true"], textarea';
                this.SEL.response = '.model-response-text, message-content, [data-testid="assistant-message"]';
                                    } else if (myAI === 'claude') {
                DOMHacker.SEL.input = '.ProseMirror[contenteditable="true"], div[data-placeholder][contenteditable="true"]';
                DOMHacker.SEL.send = 'button[data-testid="send-button"], button[aria-label*="Send message" i], button[aria-label="Send" i], [data-testid="chat-input-send"]';
                DOMHacker.SEL.stop = 'button[aria-label*="Stop" i]';
                DOMHacker.SEL.response = '.font-claude-response';
                        } else if (myAI === 'grok') {
                this.SEL.input = '.ProseMirror[contenteditable="true"], div[aria-label="Ask Grok anything"], textarea';
                this.SEL.send = 'button[aria-label*="Send" i], button[aria-label*="Ask Grok" i], button[type="submit"], svg path[d*="M2.01 21L23 12"]';
                this.SEL.stop = 'button[aria-label="Stop model response"]';
                this.SEL.response = '.prose, .message, [class*="message-content"]';
            } else if (myAI === 'chatgpt') {
                this.SEL.input = '#prompt-textarea';
                this.SEL.send = '[data-testid="send-button"], #composer-submit-button, button[aria-label="Send message"]';
                this.SEL.stop = '[data-testid="stop-button"], button[aria-label="Stop answering"]';
                this.SEL.response = '[data-message-author-role="assistant"]';
            }
        },
        checkLimitHit: function() {
            const text = document.body.innerText.toLowerCase();
            return text.includes("limit is gone") || 
                   text.includes("reached our limit") || 
                   text.includes("out of free messages") ||
                   text.includes("usage limit reached") ||
                   text.includes("too many requests") ||
                   text.includes("limit reached") ||
                   text.includes("wait until");
        },
        extractCleanText: function(element) {
            if (!element) return "";
            let clone = element.cloneNode(true);
            let junkSelectors = ['[data-testid="thinking-status"]', '[data-testid="subagent-cot-list"]', '[class*="thought"]', '[class*="reasoning"]', 'details'];
            junkSelectors.forEach(sel => { clone.querySelectorAll(sel).forEach(el => el.remove()); });
            
            clone.querySelectorAll('br').forEach(br => br.replaceWith('\n'));
            clone.querySelectorAll('p, div, h1, h2, h3, h4, h5, h6').forEach(el => el.append('\n\n'));
            clone.querySelectorAll('li').forEach(el => el.append('\n'));
            
            let text = clone.textContent;
            return text.replace(/\n{3,}/g, '\n\n').trim();
        },
        setReactInputValue: function(element, value) {
            let lastValue = element.value;
            element.value = value;
            let event = new Event('input', { bubbles: true });
            let tracker = element._valueTracker;
            if (tracker) tracker.setValue(lastValue);
            element.dispatchEvent(event);
            let reactProps = Object.keys(element).find(k => k.startsWith('__reactProps$') || k.startsWith('__reactEventHandlers$'));
            if (reactProps && element[reactProps] && element[reactProps].onChange) {
                element[reactProps].onChange({ target: element, currentTarget: element });
            }
        },
        inject: function(boxRef, text) {
            boxRef.focus();
            let isTextarea = boxRef.tagName.toUpperCase() === 'TEXTAREA';
            let isRichText = boxRef.hasAttribute('contenteditable') || boxRef.getAttribute('contenteditable') === 'true' || boxRef.hasAttribute('data-lexical-editor') || boxRef.classList.contains('ql-editor') || boxRef.tagName.toUpperCase() === 'RICH-TEXTAREA';
  
            if (isTextarea) {
                boxRef.select(); 
                document.execCommand('delete', false, null);
                
                if (!document.execCommand('insertText', false, text)) {
                    let nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value");
                    if (nativeSetter) nativeSetter.set.call(boxRef, text);
                    else boxRef.value = text;
                }
                this.setReactInputValue(boxRef, text); 
            } else if (isRichText) {
                                if (boxRef.classList.contains('ProseMirror') || boxRef.hasAttribute('data-lexical-editor')) {
                    boxRef.focus();
                    try {
                        let dt = new DataTransfer();
                        dt.setData('text/plain', text);
                        let pasteEvent = new ClipboardEvent('paste', {
                            bubbles: true,
                            cancelable: true,
                            clipboardData: dt
                        });
                        boxRef.dispatchEvent(pasteEvent);
                        boxRef.dispatchEvent(new Event('input', { bubbles: true }));
                    } catch(e) {}
                } else {
                    try {
                        const sel = window.getSelection();
                        sel.selectAllChildren(boxRef);
                        document.execCommand('delete', false, null);
                    } catch (e) {}
      
                    const lines = text.split('\n');
                    for (let i = 0; i < lines.length; i++) {
                        if (lines[i].length > 0) document.execCommand('insertText', false, lines[i]);
                        if (i < lines.length - 1) {
                            let brSuccess = document.execCommand('insertLineBreak', false, null);
                            if (!brSuccess) brSuccess = document.execCommand('insertParagraph', false, null);
                            if (!brSuccess) document.execCommand('insertHTML', false, '<br>');
                        }
                    }
                    boxRef.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, cancelable: true, inputType: 'insertText', data: text }));
                }
                boxRef.dispatchEvent(new Event('change', { bubbles: true, composed: true, cancelable: true }));
                boxRef.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', code: 'Space', keyCode: 32, bubbles: true, composed: true }));
            } else {
                boxRef.innerText = text;
                boxRef.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
            }
        },
        executeSend: function(boxRef) {
            let sendBtn = Array.from(document.querySelectorAll(this.SEL.send)).find(b => !b.disabled);
            
            if (!sendBtn && myAI === 'gemini') {
                let fallbackBtns = Array.from(document.querySelectorAll('button[aria-label*="Send" i], .send-button, [data-testid="send-button"]'));
                sendBtn = fallbackBtns.find(b => !b.disabled);
            }
            
            if (sendBtn && !sendBtn.disabled) {
                sendBtn.click();
            } else {
                boxRef.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, composed: true }));
            }
        }
    };
  
    const Orchestrator = {
        injectAndTrigger: function(payload, skipCapture = false) {
            if (window._generationObserver) { window._generationObserver.disconnect(); window._generationObserver = null; }
            if (window._pollInterval) { clearInterval(window._pollInterval); window._pollInterval = null; }
            if (window._fallbackTimeout) { clearTimeout(window._fallbackTimeout); window._fallbackTimeout = null; }

            const getVisible = (selector) => {
                let els = Array.from(document.querySelectorAll(selector));
                return els.find(el => el.offsetWidth > 0 && el.offsetHeight > 0) || els[0];
            };

            const tryInject = () => {
                let inputBox = getVisible(DOMHacker.SEL.input);
                if (!inputBox) {
                    console.error("Input box not found. Pipeline may fail.");
                    return;
                }
                
                DOMHacker.inject(inputBox, payload);
                                setTimeout(() => { 
                    let sendBtn = getVisible(DOMHacker.SEL.send);
                    if (sendBtn) DOMHacker.executeSend(sendBtn); 
                    else DOMHacker.executeSend(inputBox); // fallback
                    if (!skipCapture) setTimeout(() => this.captureAndForward(), 1500); 
                }, 1500);
            };
            tryInject();
        },
  
        captureAndForward: function() {
            let timerStart = Date.now();
            let isDone = false;

            if (myAI === 'claude' || myAI === 'grok') {
                let lastText = '';
                let stableCount = 0;
                let hasStartedGenerating = false;

                if (window._pollInterval) clearInterval(window._pollInterval);
                window._pollInterval = setInterval(() => {
                    if (isDone) { clearInterval(window._pollInterval); return; }

                    let allBlocks = Array.from(document.querySelectorAll(DOMHacker.SEL.response)).filter(el => !el.closest('[contenteditable="true"]'));
                    let currentText = allBlocks.length > 0 ? allBlocks[allBlocks.length - 1].innerText.trim() : '';

                    if (currentText.length > 0 && currentText !== lastText) {
                        hasStartedGenerating = true; 
                        stableCount = 0;
                        lastText = currentText;
                    } else if (hasStartedGenerating && currentText === lastText) {
                        stableCount++;
                    }

                    let isStreaming = document.querySelector(DOMHacker.SEL.stop) !== null;

                    if (stableCount >= 4 && hasStartedGenerating && !isStreaming) {
                        isDone = true;
                        clearInterval(window._pollInterval);
                        if (window._fallbackTimeout) clearTimeout(window._fallbackTimeout);
                        setTimeout(() => { this.finalizeCapture(timerStart); }, 500);
                    }
                }, 500);

                if (window._fallbackTimeout) clearTimeout(window._fallbackTimeout);
                window._fallbackTimeout = setTimeout(() => {
                    if (!isDone) {
                        isDone = true;
                        clearInterval(window._pollInterval);
                        this.finalizeCapture(timerStart);
                    }
                }, 300000);
                return;
            }

            let hasSeenStopButton = false;
            let initialMessages = Array.from(document.querySelectorAll(DOMHacker.SEL.response)).filter(el => !el.parentElement.closest(DOMHacker.SEL.response));
            let initialCount = initialMessages.length;
            let initialLastText = initialCount > 0 ? DOMHacker.extractCleanText(initialMessages[initialCount - 1]) : "";

            const checkFinished = () => {
                if (isDone) return;
                
                let isGeneratingNow = !!document.querySelector(DOMHacker.SEL.stop);
                
                if (isGeneratingNow) {
                    hasSeenStopButton = true;
                } else {
                    let currentMessages = Array.from(document.querySelectorAll(DOMHacker.SEL.response)).filter(el => !el.parentElement.closest(DOMHacker.SEL.response));
                    let currentCount = currentMessages.length;
                    let currentLastText = currentCount > 0 ? DOMHacker.extractCleanText(currentMessages[currentCount - 1]) : "";
                    
                    let hasNewResponse = currentCount > initialCount || (currentCount > 0 && currentLastText !== initialLastText && currentLastText.trim().length > 0);

                    if (hasSeenStopButton) {
                        isDone = true;
                    } else if (hasNewResponse && Date.now() - timerStart > 1000) {
                        isDone = true;
                    }

                    if (isDone) {
                        if (window._generationObserver) window._generationObserver.disconnect();
                        let captureDelay = (myAI === 'chatgpt') ? 2500 : 1000;
                        setTimeout(() => {
                            this.finalizeCapture(timerStart);
                        }, captureDelay);
                    }
                }
            };

            if (window._generationObserver) window._generationObserver.disconnect();
            window._generationObserver = new MutationObserver(checkFinished);
            window._generationObserver.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-label', 'class', 'disabled', 'd'] });

            if (window._pollInterval) clearInterval(window._pollInterval);
            window._pollInterval = setInterval(() => {
                if (isDone) {
                    clearInterval(window._pollInterval);
                    return;
                }
                checkFinished();
            }, 300);

            if (window._fallbackTimeout) clearTimeout(window._fallbackTimeout);
            window._fallbackTimeout = setTimeout(() => {
                if (!isDone) {

                    isDone = true;
                    clearInterval(window._pollInterval);
                    if (window._generationObserver) window._generationObserver.disconnect();
                    this.finalizeCapture(timerStart);
                }
            }, 300000);
        },
        finalizeCapture: async function(timerStart) {
            chrome.storage.local.remove(['waitingForResponseTab']);
            let messages = Array.from(document.querySelectorAll(DOMHacker.SEL.response)).filter(el => !el.parentElement.closest(DOMHacker.SEL.response) && !el.closest('[contenteditable="true"]'));
            let finalText = messages.length > 0 ? DOMHacker.extractCleanText(messages[messages.length - 1]) : "Could not extract message.";
            
            const duration = ((Date.now() - timerStart) / 1000).toFixed(1);

            chrome.runtime.sendMessage({ 
                type: 'NODE_FINISHED', 
                response: finalText,
                duration: duration 
            });

            this.reArmListener();
        },
        
        reArmListener: function() {

            const stateListener = (changes) => {
                if (changes.activeTurnTabId && changes.activeTurnTabId.newValue === myTabId) {
                    chrome.storage.onChanged.removeListener(stateListener);
                    checkAndStart(myTabId);
                }
            };
            chrome.storage.onChanged.addListener(stateListener);
        }
    };
  
    DOMHacker.initSelectors();
    
        function checkAndStart(activeTabId) {
        if (activeTabId === myTabId) {

            chrome.storage.local.get(['activePayload', 'waitingForResponseTab'], (freshData) => {
                if (freshData.waitingForResponseTab === myTabId) {

                    setTimeout(() => {
                        Orchestrator.captureAndForward(true); 
                    }, 1000);
                } else {
                    setTimeout(() => {
                        chrome.storage.local.set({ waitingForResponseTab: myTabId });
                        Orchestrator.injectAndTrigger(freshData.activePayload);
                    }, 1000);
                }
            });
            return true;
        }
        return false;
    }

    if (myAI === 'grok') {
        const GrokOrchestrator = {
            injectAndTrigger: function(payload) {

                const inputBox = document.querySelector(DOMHacker.SEL.input);

                if (!inputBox) return console.error("Could not find Grok chat input box.");

                DOMHacker.inject(inputBox, payload);

                let attempts = 0;
                let pollSend = setInterval(() => {
                    let btn = document.querySelector(DOMHacker.SEL.send);
                    if (btn && btn.tagName.toUpperCase() === 'PATH') btn = btn.closest('button');
                    
                    if (btn) {
                        if (attempts % 5 === 0) console.log(`?? [GROK_DEBUG] Attempt ${attempts}: Found send button. Disabled state: ${btn.disabled}. Inert: ${!!btn.closest('[inert]')}`);
                    } else {
                        if (attempts % 5 === 0) console.log(`?? [GROK_DEBUG] Attempt ${attempts}: Send button not found in DOM.`);
                    }

                    if (btn && !btn.disabled && !btn.closest('[inert]')) {
                        clearInterval(pollSend);

                        btn.click();
                        setTimeout(() => this.captureAndForward(), 2000);
                    } else {
                        attempts++;
                        if (attempts > 50) {
                            clearInterval(pollSend);

                            setTimeout(() => this.captureAndForward(), 1500);
                        }
                    }
                }, 100);
            },            captureAndForward: function(isResume = false) {
                let timerStart = Date.now();

                let lastText = null;
                let stableCount = 0;
                let hasStarted = false;

                const poll = setInterval(() => {
                    if (DOMHacker.checkLimitHit()) {

                        clearInterval(poll);
                        chrome.storage.local.remove(['waitingForResponseTab']);
                        chrome.runtime.sendMessage({ type: 'NODE_SKIPPED' });
                        this.reArmListener();
                        return;
                    }
                    const allBlocks = Array.from(document.querySelectorAll('.prose')).filter(el => !el.closest('[contenteditable="true"]'));
                    const currentText = allBlocks.length > 0 ? allBlocks[allBlocks.length - 1].innerText.trim() : '';

                    if (lastText === null) {
                        lastText = currentText;

                        return;
                    }

                    if (currentText.length > 0 && currentText !== lastText) {
                        hasStarted = true;
                        stableCount = 0; 
                        lastText = currentText;

                    } else if (hasStarted && currentText === lastText) {
                        stableCount++; 

                    } else if (!hasStarted) {

                    }

                    if (stableCount >= 4 && hasStarted) {
                        clearInterval(poll);
                        chrome.storage.local.remove(['waitingForResponseTab']);
                        
                        let messages = Array.from(document.querySelectorAll('.prose')).filter(el => !el.parentElement.closest('.prose') && !el.closest('[contenteditable="true"]'));
                        let finalText = messages.length > 0 ? DOMHacker.extractCleanText(messages[messages.length - 1]) : "Could not extract message.";
                        
                        const duration = ((Date.now() - timerStart) / 1000).toFixed(1);

                        chrome.runtime.sendMessage({ 
                            type: 'NODE_FINISHED', 
                            response: finalText,
                            duration: duration 
                        });
                        this.reArmListener();
                    }
                }, 500);
                
                setTimeout(() => {
                    if (stableCount < 4) {
                        clearInterval(poll);
                        chrome.storage.local.remove(['waitingForResponseTab']);

                        chrome.runtime.sendMessage({ type: 'NODE_FINISHED', response: lastText || "Timeout", duration: "300" });
                        this.reArmListener();
                    }
                }, 300000);
            },            reArmListener: function() {

                const stateListener = (changes) => {
                    if (changes.activeTurnTabId && changes.activeTurnTabId.newValue === myTabId) {
                        chrome.storage.onChanged.removeListener(stateListener);
                        grokCheckAndStart(myTabId);
                    }
                };
                chrome.storage.onChanged.addListener(stateListener);
            }
        };

        function grokCheckAndStart(activeTabId) {
            if (activeTabId === myTabId) {

                chrome.storage.local.get(['activePayload', 'waitingForResponseTab'], (freshData) => {
                    if (freshData.waitingForResponseTab === myTabId) {

                        setTimeout(() => { GrokOrchestrator.captureAndForward(true); }, 1000);
                    } else {
                        setTimeout(() => {
                            chrome.storage.local.set({ waitingForResponseTab: myTabId });
                            GrokOrchestrator.injectAndTrigger(freshData.activePayload);
                        }, 1000);
                    }
                });
                return true;
            }
            return false;
        }

        chrome.storage.local.get(['activeTurnTabId'], (state) => {
            if (!grokCheckAndStart(state.activeTurnTabId)) GrokOrchestrator.reArmListener();
        });

        return; 
    }

    chrome.storage.local.get(['activeTurnTabId'], (state) => {
        if (!checkAndStart(state.activeTurnTabId)) {
            Orchestrator.reArmListener();
        }
    });

})();
}











































