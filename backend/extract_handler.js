// Script to extract a specific handler from index.js
const fs = require('fs');
const content = fs.readFileSync('index.js', 'utf8');
const lines = content.split('\n');

// Function to extract handler between start and end lines
function extractHandler(startLine, endLine) {
  return lines.slice(startLine - 1, endLine).join('\n');
}

// Example: Extract viewTrain handler (lines 1149-1333)
const viewTrain = extractHandler(1149, 1333);
console.log('=== VIEW TRAIN HANDLER ===');
console.log(viewTrain.substring(0, 500)); // First 500 chars
