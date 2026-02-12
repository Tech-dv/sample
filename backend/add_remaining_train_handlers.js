const fs = require('fs');
const indexContent = fs.readFileSync('index.js', 'utf8');
const lines = indexContent.split('\n');

function extractHandler(startLine, endLine) {
  return lines.slice(startLine - 1, endLine).join('\n');
}

function extractFunctionBody(code) {
  const match = code.match(/async\s*\([^)]*\)\s*=>\s*\{([\s\S]*)\}\s*\)\s*;?\s*$/m);
  if (match) return match[1].trim();
  
  const codeLines = code.split('\n');
  let inFunction = false;
  let braceCount = 0;
  let startIdx = -1;
  
  for (let i = 0; i < codeLines.length; i++) {
    if (codeLines[i].includes('async (req, res)') || codeLines[i].includes('async(req, res)')) {
      inFunction = true;
      startIdx = i;
      braceCount = (codeLines[i].match(/\{/g) || []).length;
      continue;
    }
    if (inFunction) {
      braceCount += (codeLines[i].match(/\{/g) || []).length - (codeLines[i].match(/\}/g) || []).length;
      if (braceCount === 0 && (codeLines[i].includes('});') || codeLines[i].includes('})'))) {
        return codeLines.slice(startIdx + 1, i).join('\n').trim();
      }
    }
  }
  return code;
}

// Remaining train handlers
const remainingHandlers = [
  { name: 'checkMultipleSerials', start: 3828, end: 3861 },
  { name: 'generateMultipleRakeSerial', start: 3866, end: 4096 },
  { name: 'markSerialHandled', start: 4099, end: 4141 },
];

let trainController = fs.readFileSync('src/controllers/trainController.js', 'utf8');

// Add handlers before module.exports
const exportIndex = trainController.lastIndexOf('module.exports');
let handlersCode = '';

remainingHandlers.forEach(route => {
  const handler = extractHandler(route.start, route.end);
  const body = extractFunctionBody(handler);
  const funcCode = `const ${route.name} = async (req, res) => {\n${body}\n};`;
  handlersCode += funcCode + '\n\n';
  console.log(`Extracted ${route.name}`);
});

// Insert before module.exports
trainController = trainController.slice(0, exportIndex) + '\n' + handlersCode + trainController.slice(exportIndex);

// Update exports
const currentExports = trainController.match(/module\.exports = \{([\s\S]*)\};/);
if (currentExports) {
  const existingExports = currentExports[1].trim();
  const newExports = existingExports + ',\n  ' + remainingHandlers.map(h => h.name).join(',\n  ');
  trainController = trainController.replace(
    /module\.exports = \{[\s\S]*\};/,
    `module.exports = {\n  ${newExports},\n};`
  );
}

fs.writeFileSync('src/controllers/trainController.js', trainController);
console.log('Added remaining train handlers');
