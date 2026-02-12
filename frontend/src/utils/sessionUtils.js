// Session management utilities

const SESSION_KEY = 'session_data';
const INACTIVITY_TIMEOUT = 60 * 60 * 1000; // 1 hour in milliseconds

/**
 * Store login timestamp in localStorage
 */
export function storeLoginTimestamp() {
  const sessionData = {
    loginTimestamp: Date.now(),
    lastActivity: Date.now()
  };
  localStorage.setItem(SESSION_KEY, JSON.stringify(sessionData));
}

/**
 * Get login timestamp from localStorage
 */
export function getLoginTimestamp() {
  try {
    const data = localStorage.getItem(SESSION_KEY);
    if (!data) return null;
    return JSON.parse(data);
  } catch (err) {
    console.error('Error reading session data:', err);
    return null;
  }
}

/**
 * Update last activity timestamp
 */
export function updateLastActivity() {
  const sessionData = getLoginTimestamp();
  if (sessionData) {
    sessionData.lastActivity = Date.now();
    localStorage.setItem(SESSION_KEY, JSON.stringify(sessionData));
  }
}

/**
 * Check if session is still valid
 * Returns true if session exists and hasn't expired
 */
export function isSessionValid() {
  const sessionData = getLoginTimestamp();
  if (!sessionData || !sessionData.loginTimestamp) {
    return false;
  }

  const now = Date.now();
  const timeSinceLogin = now - sessionData.loginTimestamp;
  const timeSinceActivity = now - (sessionData.lastActivity || sessionData.loginTimestamp);

  // Session expires if:
  // 1. More than 1 hour since login (system restart scenario)
  // 2. More than 1 hour since last activity (inactivity scenario)
  return timeSinceLogin < INACTIVITY_TIMEOUT && timeSinceActivity < INACTIVITY_TIMEOUT;
}

/**
 * Clear session data from localStorage
 */
export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
  // Also clear all auth-related data
  localStorage.removeItem('userId');
  localStorage.removeItem('username');
  localStorage.removeItem('role');
  localStorage.removeItem('customerId');
  localStorage.removeItem('customerName');
}

/**
 * Check session validity when app loads
 * Returns true if session is valid, false otherwise
 */
export function checkSessionOnLoad() {
  const isValid = isSessionValid();
  if (!isValid) {
    clearSession();
  }
  return isValid;
}

/**
 * Get time remaining until session expires (in milliseconds)
 */
export function getTimeUntilExpiry() {
  const sessionData = getLoginTimestamp();
  if (!sessionData) return 0;

  const now = Date.now();
  const timeSinceActivity = now - (sessionData.lastActivity || sessionData.loginTimestamp);
  const remaining = INACTIVITY_TIMEOUT - timeSinceActivity;
  
  return Math.max(0, remaining);
}

export { INACTIVITY_TIMEOUT, SESSION_KEY };

