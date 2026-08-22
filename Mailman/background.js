let dashboardTabId = null;
let councilTabsMap = new Map();
let setupQueue = [];

chrome.action.onClicked.addListener(function(tab) {
    var isAiTab = tab.url && (tab.url.includes('deepseek.com') || tab.url.includes('qwen.ai') || tab.url.includes('meta.ai') || tab.url.includes('gemini.google.com') || tab.url.includes('claude.ai') || tab.url.includes('chatgpt.com') || tab.url.includes('grok.com'));
    
    if (isAiTab) {
        chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id }, function(streamId) {
            if (chrome.runtime.lastError) {
                console.error(chrome.runtime.lastError);
                return;
            }

            chrome.runtime.getContexts({
                contextTypes: ['OFFSCREEN_DOCUMENT'],
                documentUrls: [chrome.runtime.getURL('offscreen.html')]
            }, function(contexts) {
                if (contexts.length > 0) {
                    chrome.runtime.sendMessage({ type: 'START_CAPTURE', streamId: streamId });
                    continueSetup();
                } else {
                    chrome.offscreen.createDocument({
                        url: 'offscreen.html',
                        reasons: ['USER_MEDIA'],
                        justification: 'Keep tab alive by capturing audio'
                    }, function() {
                        chrome.runtime.sendMessage({ type: 'START_CAPTURE', streamId: streamId });
                        continueSetup();
                    });
                }
            });
        });
        } else {
        var dashboardUrl = chrome.runtime.getURL('dashboard.html');
        chrome.tabs.query({ url: dashboardUrl }, function(tabs) {
            if (tabs.length > 0) {
                chrome.tabs.update(tabs[0].id, { active: true });
                chrome.windows.update(tabs[0].windowId, { focused: true });
            } else {
                chrome.tabs.create({ url: dashboardUrl });
            }
        });
    }
});

function continueSetup() {
    if (setupQueue.length > 0) {
        var nextId = setupQueue.shift();
        var url = getUrlForNode(nextId);
        chrome.tabs.create({ url: url, active: true }, function(tab) {
            chrome.tabs.update(tab.id, { muted: true });
            
            chrome.storage.local.get(['pipeline'], function(data) {
                var pipeline = data.pipeline || [];
                pipeline.forEach(function(node) {
                    if (node.id === nextId) node.tabId = tab.id;
                });
                chrome.storage.local.set({ pipeline: pipeline }, function() {
                    if (dashboardTabId) {
                        var currentIds = councilTabsMap.get(dashboardTabId) || [];
                        currentIds.push(tab.id);
                        councilTabsMap.set(dashboardTabId, currentIds);
                    }
                });
            });
        });
    } else {
        if (dashboardTabId) chrome.tabs.update(dashboardTabId, { active: true }).catch(function(){});
        sendToDashboard({ type: 'SETUP_COMPLETE' });
    }
}
function getUrlForNode(nodeId) {
    if (nodeId === 'deepseek') return 'https://chat.deepseek.com/';
    if (nodeId === 'qwen') return 'https://chat.qwen.ai/';
    if (nodeId === 'meta') return 'https://www.meta.ai/';
    if (nodeId === 'gemini') return 'https://gemini.google.com/';
    if (nodeId === 'claude') return 'https://claude.ai/new';
    if (nodeId === 'chatgpt') return 'https://chatgpt.com/';
    if (nodeId === 'grok') return 'https://grok.com/';
    return '';
}

function sendToDashboard(msg) {
    chrome.runtime.sendMessage(msg).catch(function(e){});
}

function handleStartSetup(pipeline, silentMode) {
    chrome.storage.local.get(['pipeline'], function(data) {
        var oldPipeline = data.pipeline || [];
        var oldModelToTabId = {};
        oldPipeline.forEach(function(node) {
            if (node.tabId) oldModelToTabId[node.id] = node.tabId;
        });

        chrome.tabs.query({}, function(allTabs) {
            var existingTabIds = allTabs.map(t => t.id);
            
            var uniqueModels = [];
            var seen = new Set();
            pipeline.forEach(function(node) {
                if (!seen.has(node.id)) {
                    seen.add(node.id);
                    uniqueModels.push(node.id);
                }
            });

            var tabsToKeep = [];
            var modelsNeedingSetup = [];

            uniqueModels.forEach(function(modelId) {
                if (oldModelToTabId[modelId] && existingTabIds.includes(oldModelToTabId[modelId])) {
                    var tabId = oldModelToTabId[modelId];
                    tabsToKeep.push(tabId);
                    pipeline.forEach(function(node) {
                        if (node.id === modelId) node.tabId = tabId;
                    });
                } else {
                    modelsNeedingSetup.push(modelId);
                }
            });

            if (dashboardTabId && councilTabsMap.has(dashboardTabId)) {
                var oldTabs = councilTabsMap.get(dashboardTabId);
                var tabsToClose = oldTabs.filter(id => !tabsToKeep.includes(id));
                if (tabsToClose.length > 0) {
                    chrome.tabs.remove(tabsToClose).catch(function(){});
                }
            }
            
            if (dashboardTabId) {
                councilTabsMap.set(dashboardTabId, tabsToKeep);
            }

            chrome.storage.local.set({ pipeline: pipeline, isFirstRound: true }, function() {
                if (!silentMode && modelsNeedingSetup.length > 0) {
                    setupQueue = modelsNeedingSetup.slice(1);
                    var firstId = modelsNeedingSetup[0];
                    var url = getUrlForNode(firstId);
                    chrome.tabs.create({ url: url, active: true }, function(tab) {
                        chrome.tabs.update(tab.id, { muted: true });
                        pipeline.forEach(function(node) {
                            if (node.id === firstId) node.tabId = tab.id;
                        });
                        chrome.storage.local.set({ pipeline: pipeline });
                        if (dashboardTabId) {
                            var currentIds = councilTabsMap.get(dashboardTabId) || [];
                            currentIds.push(tab.id);
                            councilTabsMap.set(dashboardTabId, currentIds);
                        }
                    });
                } else if (!silentMode) {
                    if (dashboardTabId) chrome.tabs.update(dashboardTabId, { active: true }).catch(function(){});
                    sendToDashboard({ type: 'SETUP_COMPLETE' });
                }
            });
        });
    });
}
function startPipeline(pipeline, userPrompt, contextDepth) {
    chrome.storage.local.set({
        bridgeState: 'running',
        pipeline: pipeline,
        currentIndex: 0,
        originalPrompt: userPrompt,
        contextDepth: contextDepth,
        accumulatedHistory: [{ role: 'USER PROMPT', content: userPrompt }]
    }, function() {
        triggerNextNode();
    });
}

function triggerNextNode() {
    chrome.storage.local.get(['pipeline', 'currentIndex', 'accumulatedHistory', 'originalPrompt', 'isFirstRound', 'contextDepth'], function(data) {
        var historyStr = '';
        var limit = parseInt(data.contextDepth);
        var hist = data.accumulatedHistory || [];
        if (!isNaN(limit) && limit > 0) {
            var original = hist[0];
            var sliced = hist.slice(-limit);
            if (sliced.length > 0 && sliced[0] === original) {
                historyStr = sliced.map(function(h) { return '[' + h.role + ']:\n' + h.content; }).join('\n\n');
            } else {
                historyStr = '[' + original.role + ']:\n' + original.content + '\n\n' + sliced.map(function(h) { return '[' + h.role + ']:\n' + h.content; }).join('\n\n');
            }
        } else {
            historyStr = hist.map(function(h) { return '[' + h.role + ']:\n' + h.content; }).join('\n\n');
        }
        historyStr += '\n';
        var currentNode = data.pipeline[data.currentIndex];
        
        sendToDashboard({ type: 'NODE_UPDATE', data: currentNode });
        
        var payload = '';
        var isFirstRound = data.isFirstRound === true;

        if (data.currentIndex === 0) {
            if (isFirstRound) {
                payload = "You are the FIRST node in an AI reasoning chain. Your role is: " + currentNode.roleName + ".\n" +
                          "The pipeline is a repeating loop: User -> " + data.pipeline.map(function(n){return n.modelName + (n.roleName ? ' (' + n.roleName + ')' : '');}).join(" -> ") + " -> User.\n" +
                          (data.pipeline.length > 1 ? "Your job is to read the user's prompt and prepare a response specifically addressed to the NEXT node, which is " + data.pipeline[1].modelName + ".\n" : "You are the only node. Please answer the user directly.\n") +
                          "Here is your specific instruction: " + currentNode.prompt + "\n\n" +
                          "[USER PROMPT]:\n" + data.originalPrompt;
            } else {
                payload = "[USER PROMPT]:\n" + data.originalPrompt;
            }
        } else {
            var isLastNode = (data.currentIndex === data.pipeline.length - 1);
            var roleStr = isLastNode ? "the FINAL node" : "an INTERMEDIATE node";
            
            if (isFirstRound) {
                payload = "You are " + roleStr + " in an AI reasoning chain. Your role is: " + currentNode.roleName + ".\n" +
                          "The pipeline is a repeating loop: User -> " + data.pipeline.map(function(n){return n.modelName + (n.roleName ? ' (' + n.roleName + ')' : '');}).join(" -> ") + " -> User.\n" +
                          "You are Node " + (data.currentIndex + 1) + ". The previous node was " + data.pipeline[data.currentIndex-1].modelName + ".\n" +
                          (isLastNode 
                            ? "Since you are the final node, your job is to synthesize the information and communicate the final answer directly back to the human user.\n" 
                            : "Since you are an intermediate node, do NOT respond to the original user. Your job is to process the input and write a response specifically addressed to the NEXT node, which is " + data.pipeline[data.currentIndex+1].modelName + ".\n") +
                          "Here is your specific instruction: " + currentNode.prompt + "\n\n" +
                          "--- START OF CONVERSATION TRANSCRIPT ---\n\n" + historyStr + "--- END OF CONVERSATION TRANSCRIPT ---\n\nPlease review the transcript and provide your response.";
            } else {
                payload = "--- START OF CONVERSATION TRANSCRIPT ---\n\n" + historyStr + "--- END OF CONVERSATION TRANSCRIPT ---\n\nPlease review the transcript and provide your response.";
            }
        }

        chrome.storage.local.set({ activePayload: payload }, function() {
            chrome.storage.local.set({ activeTurnTabId: currentNode.tabId });
        });
    });
}

function handleStartBridge(payload) {
    var pipeline = payload.pipeline;
    var userPrompt = payload.prompt;
    var contextDepth = payload.contextDepth;

    chrome.storage.local.get(['pipeline'], function(data) {
        var existingNodes = data.pipeline || [];
        
        var canReuse = existingNodes.length === pipeline.length && 
                       pipeline.every(function(p, i) { return p.id === existingNodes[i].id; });

        if (canReuse) {
            var tabIds = existingNodes.map(function(n) { return n.tabId; });
            chrome.tabs.query({}, function(allTabs) {
                var allTabIds = allTabs.map(function(t) { return t.id; });
                if (tabIds.every(function(id) { return id && allTabIds.includes(id); })) {

                    var updatedNodes = existingNodes.map(function(n, i) {
                        return Object.assign({}, n, { roleName: pipeline[i].roleName, prompt: pipeline[i].prompt });
                    });
                    startPipeline(updatedNodes, userPrompt, contextDepth);
                } else {

                    sendToDashboard({ type: 'PIPELINE_ERROR', error: 'Tabs missing. Please click Initialize Setup.' });
                }
            });
        } else {

            sendToDashboard({ type: 'PIPELINE_ERROR', error: 'Pipeline changed. Please click Initialize Setup.' });
        }
    });
}

chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
    if (message.type === 'START_DYNAMIC_BRIDGE') {
        dashboardTabId = sender.tab ? sender.tab.id : null;
        handleStartBridge(message.payload);
    } else if (message.type === 'START_SETUP') {
        dashboardTabId = sender.tab ? sender.tab.id : null;
        handleStartSetup(message.payload.pipeline);
        } else if (message.type === 'ABORT_PIPELINE') {
        chrome.storage.local.set({ bridgeState: 'idle', activeTurnTabId: null, tabRoundMap: {} }); chrome.storage.local.remove(['waitingForResponseTab']);
        
        } else if (message.type === 'NODE_SKIPPED') {
            chrome.storage.local.get(['pipeline', 'currentIndex', 'accumulatedHistory', 'bridgeState'], function(data) {
                if (data.bridgeState !== 'running') return;
                var currentNode = data.pipeline[data.currentIndex];
                var newHistory = data.accumulatedHistory || [];
                
                var fallbackResponse = "[PIPELINE FAILED] The only AI node in the pipeline was rate-limited or skipped.";
                if (newHistory.length > 1) {
                    fallbackResponse = newHistory[newHistory.length - 1].content;
                }
                
                newHistory.push({ role: currentNode.modelName + ' (' + currentNode.roleName + ')', content: "[SKIPPED] The AI node failed to respond or was rate-limited. Please proceed with the context available." });
                var nextIndex = data.currentIndex + 1;
                
                sendToDashboard({ type: 'NODE_SKIPPED', data: currentNode });

                if (nextIndex >= data.pipeline.length) {
                    chrome.storage.local.set({ bridgeState: 'idle', isFirstRound: false, activeTurnTabId: null, tabRoundMap: {} }); 
                    chrome.storage.local.remove(['waitingForResponseTab']);
                    sendToDashboard({ type: 'FINAL_RESPONSE', data: { modelName: currentNode.modelName + " (Skipped)", roleName: currentNode.roleName, text: fallbackResponse } });
                } else {
                    chrome.storage.local.set({ currentIndex: nextIndex, accumulatedHistory: newHistory }, function() {
                        setTimeout(triggerNextNode, 1500);
                    });
                }
            });
        } else if (message.type === 'NODE_FINISHED') {
        chrome.storage.local.get(['pipeline', 'currentIndex', 'accumulatedHistory', 'bridgeState'], function(data) {
            if (data.bridgeState !== 'running') {

                return;
            }
            var currentNode = data.pipeline[data.currentIndex];
            var newHistory = data.accumulatedHistory || [];
            newHistory.push({ role: currentNode.modelName + ' (' + currentNode.roleName + ')', content: message.response });
            var nextIndex = data.currentIndex + 1;
            
            if (nextIndex >= data.pipeline.length) {
                chrome.storage.local.set({ bridgeState: 'idle', isFirstRound: false, activeTurnTabId: null, tabRoundMap: {} }); chrome.storage.local.remove(['waitingForResponseTab']);
                sendToDashboard({ 
                    type: 'FINAL_RESPONSE', 
                    data: {
                        modelName: currentNode.modelName,
                        roleName: currentNode.roleName,
                        text: message.response,
                        duration: message.duration
                    }
                });
            } else {
                chrome.storage.local.set({
                    currentIndex: nextIndex,
                    accumulatedHistory: newHistory
                }, function() {
                    triggerNextNode();
                });
            }
        });
    } else if (message.type === 'ERROR') {
        sendToDashboard({ type: 'NODE_UPDATE', data: { error: message.error } });
        chrome.storage.local.set({ bridgeState: 'idle', activeTurnTabId: null, tabRoundMap: {} }); chrome.storage.local.remove(['waitingForResponseTab']);
    } else if (message.type === 'GET_TAB_ID') {
        sendResponse({ tabId: sender.tab ? sender.tab.id : null });
    }
});

chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
    if (changeInfo.status === 'complete') {
        chrome.storage.local.get(['pipeline'], function(data) {
            if (!data.pipeline) return;
            var validIds = data.pipeline.map(function(n) { return n.tabId; });
            if (validIds.includes(tabId)) {
                chrome.scripting.executeScript({
                    target: { tabId: tabId },
                    files: ['content.js']
                }).catch(function(err) { console.log("[BG] Injection error:", err); });
            }
        });
    }
});

let lastInterruptTime = 0;
chrome.tabs.onRemoved.addListener((closedTabId) => {
    chrome.storage.local.get(['pipeline', 'bridgeState'], (data) => {
        if (!data.pipeline) return;
        let wasPipelineTab = data.pipeline.find(n => n.tabId === closedTabId);
        if (wasPipelineTab) {
            if (Date.now() - lastInterruptTime < 2000) return;
            lastInterruptTime = Date.now();
            chrome.storage.local.set({ bridgeState: 'idle', isFirstRound: false, activeTurnTabId: null, tabRoundMap: {} }); chrome.storage.local.remove(['waitingForResponseTab']);
            chrome.runtime.sendMessage({
                type: 'PIPELINE_ERROR',
                error: 'Pipeline sequence interrupted: A participating AI tab was closed.'
            });
        }
    });
});
























