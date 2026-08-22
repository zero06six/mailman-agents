const fs = require('fs');
let code = fs.readFileSync('c:/Users/Pc/Desktop/Ais/background.js', 'utf8');

const oldBlock = `        if (data.currentIndex === 0) {
            if (isFirstRound) {
                payload = "You are a specialized node in an AI reasoning chain. Your output will be passed to the next node. Your role is: " + currentNode.roleName + ".\\n" +
                          "The pipeline consists of: " + data.pipeline.map(function(n){return n.modelName + (n.roleName ? ' (' + n.roleName + ')' : '');}).join(" -> ") + ".\\n" +
                          "You are Node " + (data.currentIndex + 1) + ". " + 
                          (data.pipeline.length > 1 ? "The next node is " + data.pipeline[1].modelName + ".\\n" : "") +
                          "Here is your specific instruction: " + currentNode.prompt + "\\n\\n" +
                          "[USER PROMPT]:\\n" + data.originalPrompt;
            } else {
                payload = "[USER PROMPT]:\\n" + data.originalPrompt;
            }
        } else {
            if (isFirstRound) {
                payload = "You are a specialized node in an AI reasoning chain. Your output will be passed to the next node. Your role is: " + currentNode.roleName + ".\\n" +
                          "The pipeline consists of: " + data.pipeline.map(function(n){return n.modelName + (n.roleName ? ' (' + n.roleName + ')' : '');}).join(" -> ") + ".\\n" +
                          "You are Node " + (data.currentIndex + 1) + ". The previous node was " + data.pipeline[data.currentIndex-1].modelName + ".\\n" +
                          (data.currentIndex < data.pipeline.length - 1 ? "The next node is " + data.pipeline[data.currentIndex+1].modelName + ".\\n" : "") +
                          "Here is your specific instruction: " + currentNode.prompt + "\\n\\n" +
                          "--- START OF CONVERSATION TRANSCRIPT ---\\n\\n" + historyStr + "--- END OF CONVERSATION TRANSCRIPT ---\\n\\nPlease review the transcript and provide your response.";
            } else {
                payload = "--- START OF CONVERSATION TRANSCRIPT ---\\n\\n" + historyStr + "--- END OF CONVERSATION TRANSCRIPT ---\\n\\nPlease review the transcript and provide your response.";
            }
        }`;

const newBlock = `        if (data.currentIndex === 0) {
            if (isFirstRound) {
                payload = "You are the FIRST node in an AI reasoning chain. Your role is: " + currentNode.roleName + ".\\n" +
                          "The pipeline consists of: " + data.pipeline.map(function(n){return n.modelName + (n.roleName ? ' (' + n.roleName + ')' : '');}).join(" -> ") + ".\\n" +
                          (data.pipeline.length > 1 ? "Your job is to read the user's prompt and prepare a response specifically addressed to the NEXT node, which is " + data.pipeline[1].modelName + ".\\n" : "You are the only node. Please answer the user directly.\\n") +
                          "Here is your specific instruction: " + currentNode.prompt + "\\n\\n" +
                          "[USER PROMPT]:\\n" + data.originalPrompt;
            } else {
                payload = "[USER PROMPT]:\\n" + data.originalPrompt;
            }
        } else {
            var isLastNode = (data.currentIndex === data.pipeline.length - 1);
            var roleStr = isLastNode ? "the FINAL node" : "an INTERMEDIATE node";
            
            if (isFirstRound) {
                payload = "You are " + roleStr + " in an AI reasoning chain. Your role is: " + currentNode.roleName + ".\\n" +
                          "The pipeline consists of: " + data.pipeline.map(function(n){return n.modelName + (n.roleName ? ' (' + n.roleName + ')' : '');}).join(" -> ") + ".\\n" +
                          "You are Node " + (data.currentIndex + 1) + ". The previous node was " + data.pipeline[data.currentIndex-1].modelName + ".\\n" +
                          (isLastNode 
                            ? "Since you are the final node, your job is to synthesize the information and communicate the final answer directly back to the human user.\\n" 
                            : "Since you are an intermediate node, do NOT respond to the original user. Your job is to process the input and write a response specifically addressed to the NEXT node, which is " + data.pipeline[data.currentIndex+1].modelName + ".\\n") +
                          "Here is your specific instruction: " + currentNode.prompt + "\\n\\n" +
                          "--- START OF CONVERSATION TRANSCRIPT ---\\n\\n" + historyStr + "--- END OF CONVERSATION TRANSCRIPT ---\\n\\nPlease review the transcript and provide your response.";
            } else {
                payload = "--- START OF CONVERSATION TRANSCRIPT ---\\n\\n" + historyStr + "--- END OF CONVERSATION TRANSCRIPT ---\\n\\nPlease review the transcript and provide your response.";
            }
        }`;

code = code.replace(oldBlock, newBlock);
fs.writeFileSync('c:/Users/Pc/Desktop/Ais/background.js', code);

