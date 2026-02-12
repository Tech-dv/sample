const fs = require('fs');
const path = require('path');

const indexContent = fs.readFileSync('index.js', 'utf8');
const lines = indexContent.split('\n');

function extractHandler(startLine, endLine) {
  return lines.slice(startLine - 1, endLine).join('\n');
}

function extractFunctionBody(code) {
  // Extract function body from async function
  const match = code.match(/async\s*\([^)]*\)\s*=>\s*\{([\s\S]*)\}\s*\)\s*;?\s*$/m);
  if (match) return match[1].trim();
  
  // Try multi-line pattern
  const lines = code.split('\n');
  let inFunction = false;
  let braceCount = 0;
  let startIdx = -1;
  
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('async (req, res)') || lines[i].includes('async(req, res)')) {
      inFunction = true;
      startIdx = i;
      braceCount = (lines[i].match(/\{/g) || []).length;
      continue;
    }
    if (inFunction) {
      braceCount += (lines[i].match(/\{/g) || []).length - (lines[i].match(/\}/g) || []).length;
      if (braceCount === 0 && (lines[i].includes('});') || lines[i].includes('})'))) {
        return lines.slice(startIdx + 1, i).join('\n').trim();
      }
    }
  }
  return code;
}

// Add helper function to trainController
const addActivityTimelineEntryCode = extractHandler(5514, 5559);
const helperFunction = addActivityTimelineEntryCode.replace(/^async function/, 'const addActivityTimelineEntry = async').replace(/\}$/, '};');

// Read trainController
let trainController = fs.readFileSync('src/controllers/trainController.js', 'utf8');

// Add helper function before module.exports
const exportIndex = trainController.lastIndexOf('module.exports');
if (exportIndex > 0) {
  trainController = trainController.slice(0, exportIndex) + '\n' + helperFunction + '\n\n' + trainController.slice(exportIndex);
  fs.writeFileSync('src/controllers/trainController.js', trainController);
  console.log('Added addActivityTimelineEntry helper to trainController');
}

// Extract reviewer handlers
const reviewerHandlers = [
  { name: 'getTasks', start: 4839, end: 4946 },
  { name: 'assignTask', start: 4949, end: 4995 },
  { name: 'approveTask', start: 4998, end: 5186 },
  { name: 'rejectTask', start: 5189, end: 5237 },
  { name: 'cancelTask', start: 5240, end: 5295 },
  { name: 'getReviewerTrain', start: 5298, end: 5370 },
];

let reviewerController = fs.readFileSync('src/controllers/reviewerController.js', 'utf8');
reviewerHandlers.forEach(route => {
  const handler = extractHandler(route.start, route.end);
  const body = extractFunctionBody(handler);
  const funcCode = `const ${route.name} = async (req, res) => {\n${body}\n};`;
  
  // Replace placeholder
  reviewerController = reviewerController.replace(
    new RegExp(`const ${route.name} = async \\(req, res\\) => \\{[^}]*res\\.status\\(501\\)[^}]*\\};`),
    funcCode
  );
});

// Update exports
const reviewerExports = reviewerHandlers.map(h => h.name).join(',\n  ');
reviewerController = reviewerController.replace(
  /module\.exports = \{[\s\S]*\};/,
  `module.exports = {\n  ${reviewerExports},\n};`
);
fs.writeFileSync('src/controllers/reviewerController.js', reviewerController);
console.log('Updated reviewerController with', reviewerHandlers.length, 'handlers');

// Extract admin handlers
const adminHandlers = [
  { name: 'saveDraft', start: 1050, end: 1082 },
  { name: 'applySequentialTrigger', start: 5652, end: 5682 },
  { name: 'checkSequentialTrigger', start: 5685, end: 5707 },
  { name: 'repairLegacySequentialTrainIds', start: 5711, end: 5759 },
];

let adminController = fs.readFileSync('src/controllers/adminController.js', 'utf8');
adminHandlers.forEach(route => {
  const handler = extractHandler(route.start, route.end);
  const body = extractFunctionBody(handler);
  const funcCode = `const ${route.name} = async (req, res) => {\n${body}\n};`;
  
  adminController = adminController.replace(
    new RegExp(`const ${route.name} = async \\(req, res\\) => \\{[^}]*res\\.status\\(501\\)[^}]*\\};`),
    funcCode
  );
});

const adminExports = adminHandlers.map(h => h.name).join(',\n  ');
adminController = adminController.replace(
  /module\.exports = \{[\s\S]*\};/,
  `module.exports = {\n  ${adminExports},\n};`
);
fs.writeFileSync('src/controllers/adminController.js', adminController);
console.log('Updated adminController with', adminHandlers.length, 'handlers');

// Extract wagon handler
const wagonHandler = { name: 'updateWagonStatus', start: 4813, end: 4832 };
const wagonHandlerCode = extractHandler(wagonHandler.start, wagonHandler.end);
const wagonBody = extractFunctionBody(wagonHandlerCode);
const wagonFunc = `const ${wagonHandler.name} = async (req, res) => {\n${wagonBody}\n};`;

let wagonController = fs.readFileSync('src/controllers/wagonController.js', 'utf8');
wagonController = wagonController.replace(
  /const updateWagonStatus = async[^}]*res\.status\(501\)[^}]*\};/,
  wagonFunc
);
wagonController = wagonController.replace(
  /module\.exports = \{[\s\S]*\};/,
  `module.exports = {\n  ${wagonHandler.name},\n};`
);
fs.writeFileSync('src/controllers/wagonController.js', wagonController);
console.log('Updated wagonController');

// Extract camera handler
const cameraHandler = { name: 'getCameras', start: 4146, end: 4189 };
const cameraHandlerCode = extractHandler(cameraHandler.start, cameraHandler.end);
const cameraBody = extractFunctionBody(cameraHandlerCode);
const cameraFunc = `const ${cameraHandler.name} = async (req, res) => {\n${cameraBody}\n};`;

let cameraController = fs.readFileSync('src/controllers/cameraController.js', 'utf8');
cameraController = cameraController.replace(
  /const getCameras = async[^}]*res\.status\(501\)[^}]*\};/,
  cameraFunc
);
cameraController = cameraController.replace(
  /module\.exports = \{[\s\S]*\};/,
  `module.exports = {\n  ${cameraHandler.name},\n};`
);
fs.writeFileSync('src/controllers/cameraController.js', cameraController);
console.log('Updated cameraController');

console.log('\nExtraction complete!');
