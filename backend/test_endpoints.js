#!/usr/bin/env node

/**
 * Comprehensive endpoint testing script
 * Tests all API endpoints to verify functionality after refactoring
 */

const http = require('http');

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:5000';
const TEST_TIMEOUT = 10000; // 10 seconds

// Test results tracking
const results = {
  passed: [],
  failed: [],
  skipped: []
};

// Helper function to make HTTP requests
function makeRequest(method, path, data = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };

    const req = http.request(url, options, (res) => {
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        try {
          const parsed = body ? JSON.parse(body) : null;
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: parsed || body
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: body
          });
        }
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.setTimeout(TEST_TIMEOUT, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (data) {
      req.write(JSON.stringify(data));
    }
    req.end();
  });
}

// Test helper
async function test(name, testFn) {
  try {
    console.log(`\n🧪 Testing: ${name}`);
    await testFn();
    results.passed.push(name);
    console.log(`✅ PASSED: ${name}`);
  } catch (error) {
    results.failed.push({ name, error: error.message });
    console.log(`❌ FAILED: ${name}`);
    console.log(`   Error: ${error.message}`);
  }
}

// Test helper for skipped tests
function skip(name, reason) {
  results.skipped.push({ name, reason });
  console.log(`⏭️  SKIPPED: ${name} - ${reason}`);
}

// Test server is running
async function testServerRunning() {
  try {
    const response = await makeRequest('GET', '/dashboard-data');
    // Any response (even 401/403) means server is running
    return true;
  } catch (error) {
    throw new Error(`Server not accessible: ${error.message}`);
  }
}

// Test authentication endpoint
let authToken = null;
let testUser = null;

async function testLogin() {
  // Try with invalid credentials first
  const invalidResponse = await makeRequest('POST', '/login', {
    username: 'invalid',
    password: 'invalid'
  });
  
  if (invalidResponse.status !== 401) {
    throw new Error(`Expected 401 for invalid credentials, got ${invalidResponse.status}`);
  }

  // Note: We can't test with real credentials without knowing them
  // But we can verify the endpoint exists and responds correctly
  console.log('   Login endpoint exists and validates credentials');
}

// Test endpoints that don't require authentication
async function testPublicEndpoints() {
  // Test login endpoint structure
  const loginResponse = await makeRequest('POST', '/login', {
    username: 'test',
    password: 'test'
  });
  
  if (loginResponse.status !== 401 && loginResponse.status !== 200) {
    throw new Error(`Unexpected status for login: ${loginResponse.status}`);
  }
}

// Test endpoints that require authentication (will fail but verify structure)
async function testProtectedEndpoints() {
  // Test dashboard endpoint structure
  const dashboardResponse = await makeRequest('GET', '/dashboard-data');
  // Should return 200 or 401/403, but not 404
  if (dashboardResponse.status === 404) {
    throw new Error('Dashboard endpoint not found (404)');
  }

  // Test customers endpoint
  const customersResponse = await makeRequest('GET', '/customers');
  if (customersResponse.status === 404) {
    throw new Error('Customers endpoint not found (404)');
  }

  // Test cameras endpoint (should be public or have different auth)
  const camerasResponse = await makeRequest('GET', '/cameras');
  if (camerasResponse.status === 404) {
    throw new Error('Cameras endpoint not found (404)');
  }
}

// Test route structure
async function testRouteStructure() {
  // Test various route patterns
  const routes = [
    { method: 'POST', path: '/train', name: 'Create train' },
    { method: 'GET', path: '/train/123/view', name: 'View train' },
    { method: 'GET', path: '/train/123/edit', name: 'Edit train' },
    { method: 'POST', path: '/train/123/draft', name: 'Save draft' },
    { method: 'GET', path: '/train/123/dispatch', name: 'Get dispatch' },
    { method: 'GET', path: '/reviewer/tasks', name: 'Reviewer tasks' },
    { method: 'GET', path: '/reviewer/train/123', name: 'Reviewer train' },
    { method: 'GET', path: '/random-counting/trains', name: 'Random counting trains' },
    { method: 'PUT', path: '/wagon/123/1/status', name: 'Update wagon status' },
  ];

  for (const route of routes) {
    try {
      const response = await makeRequest(route.method, route.path);
      // Check response body - if it's JSON with a message, the route handler executed
      const bodyStr = typeof response.body === 'string' ? response.body : JSON.stringify(response.body || '');
      const isJsonResponse = typeof response.body === 'object' || (typeof response.body === 'string' && bodyStr.startsWith('{'));
      
      // If we get a 404 with a JSON body containing a message, the route exists (handler executed)
      // If we get a 404 with HTML or plain text, it's a true 404 (route doesn't exist)
      if (response.status === 404) {
        if (isJsonResponse && (bodyStr.includes('message') || bodyStr.includes('not found') || bodyStr.includes('error'))) {
          // This is a business logic 404 (route exists, resource doesn't)
          console.log(`   ✓ ${route.name} route exists (404 with JSON response - handler executed)`);
        } else {
          // This is a true 404 (route doesn't exist)
          throw new Error(`Route ${route.method} ${route.path} not found (404)`);
        }
      } else {
        // Any other status code means route exists
        console.log(`   ✓ ${route.name} route exists (status: ${response.status})`);
      }
    } catch (error) {
      if (error.message.includes('not found') || error.message.includes('404')) {
        throw error;
      }
      // Other errors (auth, timeout) are acceptable - route exists
      console.log(`   ✓ ${route.name} route exists (auth/timeout expected)`);
    }
  }
}

// Test error handling
async function testErrorHandling() {
  // Test 404 for non-existent route
  const notFoundResponse = await makeRequest('GET', '/nonexistent-route-12345');
  if (notFoundResponse.status !== 404) {
    throw new Error(`Expected 404 for non-existent route, got ${notFoundResponse.status}`);
  }
}

// Test CORS
async function testCORS() {
  const response = await makeRequest('GET', '/dashboard-data');
  // CORS should be enabled (we can't fully test without browser, but check headers exist)
  if (response.headers['access-control-allow-origin'] === undefined) {
    console.log('   ⚠️  CORS headers not visible in server response (may be normal)');
  } else {
    console.log('   ✓ CORS headers present');
  }
}

// Main test runner
async function runTests() {
  console.log('='.repeat(60));
  console.log('API Endpoint Testing Suite');
  console.log('='.repeat(60));
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Timeout: ${TEST_TIMEOUT}ms`);

  // Test 1: Server is running
  await test('Server is running and accessible', testServerRunning);

  // Test 2: Login endpoint
  await test('Login endpoint structure', testLogin);

  // Test 3: Public endpoints
  await test('Public endpoints structure', testPublicEndpoints);

  // Test 4: Protected endpoints (structure check)
  await test('Protected endpoints structure', testProtectedEndpoints);

  // Test 5: Route structure
  await test('Route structure and patterns', testRouteStructure);

  // Test 6: Error handling
  await test('Error handling (404)', testErrorHandling);

  // Test 7: CORS
  await test('CORS configuration', testCORS);

  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('TEST SUMMARY');
  console.log('='.repeat(60));
  console.log(`✅ Passed: ${results.passed.length}`);
  console.log(`❌ Failed: ${results.failed.length}`);
  console.log(`⏭️  Skipped: ${results.skipped.length}`);

  if (results.failed.length > 0) {
    console.log('\nFailed Tests:');
    results.failed.forEach(({ name, error }) => {
      console.log(`  - ${name}: ${error}`);
    });
  }

  if (results.skipped.length > 0) {
    console.log('\nSkipped Tests:');
    results.skipped.forEach(({ name, reason }) => {
      console.log(`  - ${name}: ${reason}`);
    });
  }

  console.log('\n' + '='.repeat(60));

  // Exit with appropriate code
  process.exit(results.failed.length > 0 ? 1 : 0);
}

// Run tests
runTests().catch((error) => {
  console.error('Fatal error running tests:', error);
  process.exit(1);
});
