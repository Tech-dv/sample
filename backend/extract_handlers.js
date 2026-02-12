// Temporary script to help identify handler boundaries
const fs = require('fs');
const content = fs.readFileSync('index.js', 'utf8');
const lines = content.split('\n');

// Find all route definitions and their approximate end positions
const routes = [];
let inRoute = false;
let routeStart = 0;
let braceCount = 0;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  
  // Check for route start
  if (line.match(/^app\.(get|post|put|delete|patch)\(/)) {
    if (inRoute) {
      routes.push({ start: routeStart, end: i - 1 });
    }
    inRoute = true;
    routeStart = i;
    braceCount = (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
  } else if (inRoute) {
    braceCount += (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
    if (braceCount === 0 && line.trim().endsWith(');')) {
      routes.push({ start: routeStart, end: i });
      inRoute = false;
    }
  }
}

console.log(`Found ${routes.length} routes`);
routes.forEach((r, i) => {
  const startLine = lines[r.start];
  const method = startLine.match(/app\.(get|post|put|delete|patch)/)?.[1];
  const path = startLine.match(/["']([^"']+)["']/)?.[1];
  console.log(`${i + 1}. ${method?.toUpperCase()} ${path} (lines ${r.start + 1}-${r.end + 1})`);
});
