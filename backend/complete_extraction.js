const fs = require('fs');
const path = require('path');

// Read index.js
const indexContent = fs.readFileSync('index.js', 'utf8');
const lines = indexContent.split('\n');

// Helper to extract handler function
function extractHandler(startLine, endLine) {
  return lines.slice(startLine - 1, endLine).join('\n');
}

// Helper to extract just the async function body
function extractHandlerBody(handlerCode) {
  // Remove route definition, extract function body
  const match = handlerCode.match(/async\s*\(req,\s*res\)\s*=>\s*\{([\s\S]*)\}\s*\)\s*;?\s*$/m);
  if (match) {
    return match[1].trim();
  }
  // Try multi-line pattern
  const lines = handlerCode.split('\n');
  let inFunction = false;
  let braceCount = 0;
  let startIdx = -1;
  
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('async (req, res)')) {
      inFunction = true;
      startIdx = i;
      braceCount = (lines[i].match(/\{/g) || []).length;
      continue;
    }
    if (inFunction) {
      braceCount += (lines[i].match(/\{/g) || []).length - (lines[i].match(/\}/g) || []).length;
      if (braceCount === 0 && lines[i].includes('});')) {
        return lines.slice(startIdx + 1, i).join('\n').trim();
      }
    }
  }
  return handlerCode;
}

// Route definitions with their handlers
const trainHandlers = [
  { name: 'viewTrain', start: 1149, end: 1333 },
  { name: 'editTrain', start: 1337, end: 1479 },
  { name: 'saveDraft', start: 1483, end: 2689 },
  { name: 'getDispatch', start: 2692, end: 2922 },
  { name: 'saveDispatchDraft', start: 2924, end: 3321 },
  { name: 'submitDispatch', start: 3326, end: 3537 },
  { name: 'getActivityTimeline', start: 3542, end: 3723 },
  { name: 'exportChanges', start: 3728, end: 3823 },
  { name: 'revokeTrain', start: 5377, end: 5507 },
  { name: 'checkSequentialAssignments', start: 5765, end: 5827 },
];

// Extract and format handlers
const handlerFunctions = [];
trainHandlers.forEach(route => {
  const fullHandler = extractHandler(route.start, route.end);
  const body = extractHandlerBody(fullHandler);
  
  // Create function declaration
  const funcName = route.name;
  const funcCode = `const ${funcName} = async (req, res) => {\n${body}\n};`;
  handlerFunctions.push({ name: funcName, code: funcCode });
  console.log(`Extracted ${funcName} (${route.start}-${route.end})`);
});

// Read existing trainController
const controllerPath = 'src/controllers/trainController.js';
let controllerContent = fs.readFileSync(controllerPath, 'utf8');

// Find the module.exports section and add new handlers
const exportMatch = controllerContent.match(/module\.exports\s*=\s*\{([\s\S]*)\};/);
if (exportMatch) {
  const existingExports = exportMatch[1].trim();
  const newExports = handlerFunctions.map(h => h.name).join(',\n  ');
  const newModuleExports = `module.exports = {\n  createTrain,\n  ${newExports},\n};`;
  
  // Replace module.exports
  controllerContent = controllerContent.replace(/module\.exports\s*=\s*\{[\s\S]*\};/, newModuleExports);
  
  // Add handler functions before module.exports
  const handlerCode = handlerFunctions.map(h => h.code).join('\n\n');
  const insertPoint = controllerContent.lastIndexOf('module.exports');
  controllerContent = controllerContent.slice(0, insertPoint) + '\n' + handlerCode + '\n\n' + controllerContent.slice(insertPoint);
  
  // Write updated controller
  fs.writeFileSync(controllerPath, controllerContent);
  console.log(`\nUpdated ${controllerPath} with ${handlerFunctions.length} handlers`);
} else {
  console.log('Could not find module.exports in controller');
}
