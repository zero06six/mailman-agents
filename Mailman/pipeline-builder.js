// Pipeline Builder Logic

window.currentPipeline = [];
try {
    const savedPipe = localStorage.getItem('savedPipeline');
    if (savedPipe) {
        window.currentPipeline = JSON.parse(savedPipe);
    }
} catch (e) {}

document.addEventListener('DOMContentLoaded', () => {
    try {
        const savedDepth = localStorage.getItem('savedContextDepth');
        if (savedDepth) {
            const cd = document.getElementById('contextDepthSelect');
            if (cd) cd.value = savedDepth;
        }
    } catch(e) {}
});
let customPrompts = [];

try {
    const saved = localStorage.getItem('customPrompts');
    if (saved) {
        customPrompts = JSON.parse(saved);
        let needsSave = false;
        customPrompts.forEach(p => {
            if (!p.id) {
                p.id = generateId();
                needsSave = true;
            }
        });
        if (needsSave) saveCustomPrompts();
    }
} catch (e) {}

function saveCustomPrompts() {
    localStorage.setItem('customPrompts', JSON.stringify(customPrompts));
}

function generateId() {
    return Math.random().toString(36).substr(2, 9);
}

function renderAIPalette() {
    const container = document.getElementById('ai-palette');
    container.innerHTML = '';
    AI_MODELS.forEach(ai => {
        const el = document.createElement('div');
        el.className = 'ai-block';
        el.draggable = true;
        el.dataset.type = 'ai';
        el.dataset.id = ai.id;
        el.innerHTML = `
            ${ai.svg}
            <span class="ai-name">${ai.name}</span>
        `;
        el.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('application/json', JSON.stringify({ type: 'ai', source: 'palette', aiId: ai.id }));
        });
        container.appendChild(el);
    });
}

function renderPromptPalette() {
    const container = document.getElementById('prompt-palette');
    container.innerHTML = '';
    
    AI_MODELS.forEach(ai => {
        if (!ai.defaultRole && !ai.defaultPrompt) return;
        const el = createPromptDiamond(ai.defaultRole || ai.name, ai.defaultPrompt, true);
        container.appendChild(el);
    });
    
    customPrompts.forEach(p => {
        const el = createPromptDiamond(p.role, p.prompt, false, p.id);
        container.appendChild(el);
    });
}

function createPromptDiamond(role, text, isDefault, id = null) {
    const el = document.createElement('div');
    el.className = 'prompt-diamond';
    el.draggable = true;
    el.textContent = role;
el.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('application/json', JSON.stringify({
            type: 'prompt',
            role: role,
            prompt: text
        }));
    });

    el.addEventListener('click', (e) => {
        if (e.target.classList.contains('del-btn')) return;
        
        currentEditingPromptId = id;
        document.getElementById('editPromptTitle').innerText = isDefault ? "View Prompt" : "Edit Custom Prompt";
        
        const roleInput = document.getElementById('editPromptRole');
        const textInput = document.getElementById('editPromptText');
        const saveBtn = document.getElementById('saveEditPromptBtn');
        
        roleInput.value = role;
        textInput.value = text;
        
        if (isDefault) {
            roleInput.disabled = true;
            textInput.disabled = true;
            saveBtn.style.display = 'none';
        } else {
            roleInput.disabled = false;
            textInput.disabled = false;
            saveBtn.style.display = 'inline-block';
        }
        
        document.getElementById('editPromptModal').classList.add('visible');
    });
    
    if (!isDefault) {
        const delBtn = document.createElement('button');
        delBtn.className = 'del-btn';
        delBtn.textContent = 'x';
        delBtn.title = 'Delete';
        delBtn.onclick = (e) => {
            e.stopPropagation();
            customPrompts = customPrompts.filter(p => p.id !== id);
            saveCustomPrompts();
            renderPromptPalette();
        };
        el.appendChild(delBtn);
    }
    
    return el;
}

function renderPipeline() {
    const container = document.getElementById('pipeline-dropzone');
    container.innerHTML = '';
    
    if (window.currentPipeline.length === 0) {
        container.innerHTML = '<div class="empty-state">Drag AIs here</div>';
    } else {
        window.currentPipeline.forEach((item, index) => {
            const aiData = AI_MODELS.find(a => a.id === item.aiId);
            const el = document.createElement('div');
            el.className = 'pipeline-item';
            
            const block = document.createElement('div');
            block.className = 'ai-block';
            if (item.errorAdjacent) block.classList.add('error-adjacent');
            
            block.draggable = true;
            block.innerHTML = `
                ${aiData.svg}
                <span class="ai-name">${aiData.name}</span>
            `;
            
            if (item.prompt) {
                const badge = document.createElement('div');
                badge.className = 'attached-prompt';
                badge.textContent = item.prompt.role;
                badge.title = item.prompt.prompt;
                block.appendChild(badge);
            }
            
            block.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('application/json', JSON.stringify({ type: 'ai', source: 'pipeline', index: index }));
                document.getElementById('col-ais').classList.add('show-remove');
                document.getElementById('col-prompts').classList.add('show-remove');
            });
            
            block.addEventListener('dragend', () => {
                document.getElementById('col-ais').classList.remove('show-remove');
                document.getElementById('col-prompts').classList.remove('show-remove');
            });
            
            block.addEventListener('dragover', (e) => e.preventDefault());
            block.addEventListener('drop', (e) => {
                e.preventDefault();
                e.stopPropagation();
                try {
                    const data = JSON.parse(e.dataTransfer.getData('application/json'));
                    if (data.type === 'prompt') {
                        window.currentPipeline[index].prompt = { role: data.role, prompt: data.prompt };
                        validateAndRender();
                    }
                } catch(err) {}
            });
            
            el.appendChild(block);
            container.appendChild(el);
        });
    }
    
    window.getPipelineConfig = () => {
        return window.currentPipeline.map(item => {
            const aiData = AI_MODELS.find(a => a.id === item.aiId);
            return {
                id: item.aiId,
                modelName: aiData.name,
                roleName: item.prompt ? item.prompt.role : aiData.name,
                prompt: item.prompt ? item.prompt.prompt : "[No prompt provided]"
            };
        });
    };
}

function validateAndRender() {
    let hasError = false;
    for (let i = 0; i < window.currentPipeline.length; i++) {
        window.currentPipeline[i].errorAdjacent = false;
        if (i > 0 && window.currentPipeline[i].aiId === window.currentPipeline[i-1].aiId) {
            window.currentPipeline[i].errorAdjacent = true;
            window.currentPipeline[i-1].errorAdjacent = true;
            hasError = true;
        }
    }
    
    document.getElementById('btn-save-pipeline').disabled = hasError;
    if (hasError) document.getElementById('btn-save-pipeline').style.opacity = '0.5';
    else document.getElementById('btn-save-pipeline').style.opacity = '1';
    
    renderPipeline();
}

function getDropIndex(e, container) {
    const items = [...container.querySelectorAll('.pipeline-item')];
    if (items.length === 0) return 0;
    
    for (let i = 0; i < items.length; i++) {
        const rect = items[i].getBoundingClientRect();
        if (e.clientX < rect.left + rect.width / 2 && e.clientY >= rect.top && e.clientY <= rect.bottom) {
            return i;
        }
    }
    return items.length;
}

const dropzone = document.getElementById('pipeline-dropzone');
dropzone.addEventListener('dragover', e => e.preventDefault());
dropzone.addEventListener('drop', e => {
    e.preventDefault();
    try {
        const data = JSON.parse(e.dataTransfer.getData('application/json'));
        if (data.type === 'ai') {
            const insertIndex = getDropIndex(e, dropzone);
            
            if (data.source === 'palette') {
                window.currentPipeline.splice(insertIndex, 0, { aiId: data.aiId, prompt: null });
            } else if (data.source === 'pipeline') {
                let fromIndex = data.index;
                let toIndex = insertIndex;
                const item = window.currentPipeline.splice(fromIndex, 1)[0];
                if (fromIndex < toIndex) toIndex--;
                window.currentPipeline.splice(toIndex, 0, item);
            }
            validateAndRender();
        }
    } catch(err) {}
});

const handleRemoveDrop = (e) => {
    e.preventDefault();
    try {
        const data = JSON.parse(e.dataTransfer.getData('application/json'));
        if (data.type === 'ai' && data.source === 'pipeline') {
            window.currentPipeline.splice(data.index, 1);
            validateAndRender();
        }
    } catch(err) {}
};

['col-ais', 'col-prompts'].forEach(id => {
    const col = document.getElementById(id);
    const overlay = document.createElement('div');
    overlay.className = 'remove-overlay';
    overlay.textContent = 'Drop here to remove';
    col.appendChild(overlay);
    
    col.addEventListener('dragover', e => e.preventDefault());
    col.addEventListener('drop', handleRemoveDrop);
});

document.getElementById('btn-add-prompt').addEventListener('click', () => {
    document.getElementById('custom-prompt-modal').style.display = 'flex';
});

document.getElementById('btn-cancel-prompt').addEventListener('click', () => {
    document.getElementById('custom-prompt-modal').style.display = 'none';
});

document.getElementById('btn-save-prompt').addEventListener('click', () => {
    const role = document.getElementById('custom-role-input').value.trim();
    const prompt = document.getElementById('custom-prompt-input').value.trim();
    
    if (!role || !prompt) {
        alert("Both Role Name and Prompt are required!");
        return;
    }
    
    customPrompts.push({
        id: generateId(),
        role: role,
        prompt: prompt
    });
    
    saveCustomPrompts();
    renderPromptPalette();
    
    document.getElementById('custom-role-input').value = '';
    document.getElementById('custom-prompt-input').value = '';
    document.getElementById('custom-prompt-modal').style.display = 'none';
});

window.lastSavedPipelineJSON = JSON.stringify(window.currentPipeline);

let currentEditingPromptId = null;

document.getElementById('closeEditPromptBtn').addEventListener('click', () => {
    document.getElementById('editPromptModal').classList.remove('visible');
});

document.getElementById('saveEditPromptBtn').addEventListener('click', () => {
    if (!currentEditingPromptId) return;
    const newRole = document.getElementById('editPromptRole').value.trim();
    const newText = document.getElementById('editPromptText').value.trim();
    
    if (newRole && newText) {
        let pIdx = customPrompts.findIndex(p => p.id === currentEditingPromptId);
        if (pIdx > -1) {
            customPrompts[pIdx].role = newRole;
            customPrompts[pIdx].prompt = newText;
            saveCustomPrompts();
            renderPromptPalette();
            document.getElementById('editPromptModal').classList.remove('visible');
        }
    }
});

document.getElementById('btn-save-pipeline').addEventListener('click', () => {
    document.getElementById('roles-modal').classList.remove('visible');
    
    const newJSON = JSON.stringify(window.currentPipeline);
    const contextDepthVal = document.getElementById('contextDepthSelect') ? document.getElementById('contextDepthSelect').value : '5';
    
    // Save state persistently
    localStorage.setItem('savedPipeline', newJSON);
    localStorage.setItem('savedContextDepth', contextDepthVal);

    if (newJSON !== window.lastSavedPipelineJSON) {
        if (typeof appendSystemMessage === 'function') {
            appendSystemMessage('SYSTEM: Pipeline sequence updated. Applying changes...');
        }
        window.lastSavedPipelineJSON = newJSON;
        window.dispatchEvent(new CustomEvent('AI_COUNCIL_SILENT_UPDATE', { detail: JSON.stringify({ pipeline: window.currentPipeline }) }));
    }
});

renderAIPalette();
renderPromptPalette();
validateAndRender();


let backupPipeline = [];
let backupContextDepth = '';
document.getElementById('btn-edit-roles').addEventListener('click', () => {
    backupPipeline = JSON.parse(JSON.stringify(window.currentPipeline));
    const cd = document.getElementById('contextDepthSelect');
    if (cd) backupContextDepth = cd.value;
});

document.getElementById('roles-modal').addEventListener('click', (e) => {
    if (e.target.id === 'roles-modal') {
        window.currentPipeline = JSON.parse(JSON.stringify(backupPipeline));
        const cd = document.getElementById('contextDepthSelect');
        if (cd) cd.value = backupContextDepth;
        validateAndRender();
        e.target.classList.remove('visible');
    }
});


const btnToggleAll = document.getElementById('btn-toggle-all-nodes');
if (btnToggleAll) {
    btnToggleAll.textContent = 'Remove All';
    btnToggleAll.addEventListener('click', () => {
        window.currentPipeline = [];
try {
    const savedPipe = localStorage.getItem('savedPipeline');
    if (savedPipe) {
        window.currentPipeline = JSON.parse(savedPipe);
    }
} catch (e) {}

document.addEventListener('DOMContentLoaded', () => {
    try {
        const savedDepth = localStorage.getItem('savedContextDepth');
        if (savedDepth) {
            const cd = document.getElementById('contextDepthSelect');
            if (cd) cd.value = savedDepth;
        }
    } catch(e) {}
});
        validateAndRender();
    });
}














document.getElementById('editPromptModal').addEventListener('click', (e) => {
    if (e.target.id === 'editPromptModal') {
        e.target.classList.remove('visible');
    }
});











