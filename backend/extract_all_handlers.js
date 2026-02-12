const fs = require('fs');
const content = fs.readFileSync('index.js', 'utf8');
const lines = content.split('\n');

// Helper function to extract handler function body
function extractHandlerBody(startLine, endLine) {
  const handlerLines = lines.slice(startLine - 1, endLine);
  let handlerCode = handlerLines.join('\n');
  
  // Remove the route definition line (app.get/post/etc)
  // Extract just the async function body
  const match = handlerCode.match(/async\s*\(req,\s*res\)\s*=>\s*\{([\s\S]*)\}\s*\)\s*;?\s*$/);
  if (match) {
    return match[1].trim();
  }
  
  // Try alternative pattern for multi-line route definitions
  const altMatch = handlerCode.match(/\{\s*([\s\S]*)\}\s*\)\s*;?\s*$/);
  if (altMatch) {
    return altMatch[1].trim();
  }
  
  return handlerCode;
}

// Route boundaries from our earlier analysis
const routes = [
  { name: 'viewTrain', start: 1149, end: 1333, controller: 'trainController' },
  { name: 'editTrain', start: 1337, end: 1479, controller: 'trainController' },
  { name: 'saveDraft', start: 1483, end: 2689, controller: 'trainController' },
  { name: 'getDispatch', start: 2692, end: 2922, controller: 'trainController' },
  { name: 'saveDispatchDraft', start: 2924, end: 3321, controller: 'trainController' },
  { name: 'submitDispatch', start: 3326, end: 3537, controller: 'trainController' },
  { name: 'getActivityTimeline', start: 3542, end: 3723, controller: 'trainController' },
  { name: 'exportChanges', start: 3728, end: 3823, controller: 'trainController' },
  { name: 'revokeTrain', start: 5377, end: 5507, controller: 'trainController' },
  { name: 'checkSequentialAssignments', start: 5765, end: 5827, controller: 'trainController' },
];

console.log('Extracting handlers...');
routes.forEach(route => {
  const handlerBody = extractHandlerBody(route.start, route.end);
  console.log(`\n=== ${route.name} (${route.start}-${route.end}) ===`);
  console.log(`Length: ${handlerBody.length} characters`);
  console.log(`First 200 chars: ${handlerBody.substring(0, 200)}...`);
});
