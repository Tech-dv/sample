import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  updateLastActivity,
  isSessionValid,
  clearSession,
  getTimeUntilExpiry,
  INACTIVITY_TIMEOUT
} from '../utils/sessionUtils';

const WARNING_TIME = 2 * 60 * 1000; // 2 minutes before logout

/**
 * Custom hook to manage session timeout
 * Tracks user activity and automatically logs out after inactivity
 */
export function useSessionTimeout() {
  const navigate = useNavigate();
  const timeoutRef = useRef(null);
  const warningTimeoutRef = useRef(null);
  const countdownIntervalRef = useRef(null);
  const [showWarning, setShowWarning] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(null);

  // Logout handler (defined first so it can be used by other functions)
  const handleLogout = () => {
    clearSession();
    setShowWarning(false);
    setTimeRemaining(null);
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
    }
    navigate('/');
  };

  // Activity tracking function
  const handleActivity = () => {
    if (!isSessionValid()) {
      // Session already expired, logout immediately
      handleLogout();
      return;
    }

    updateLastActivity();
    setShowWarning(false);
    setTimeRemaining(null);
    
    // Reset timers
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    if (warningTimeoutRef.current) {
      clearTimeout(warningTimeoutRef.current);
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
    }

    // Set new warning timeout (1 hour - 2 minutes = 58 minutes)
    const warningTime = INACTIVITY_TIMEOUT - WARNING_TIME;
    warningTimeoutRef.current = setTimeout(() => {
      setShowWarning(true);
      // Start countdown
      countdownIntervalRef.current = setInterval(() => {
        const remaining = getTimeUntilExpiry();
        const seconds = Math.ceil(remaining / 1000);
        setTimeRemaining(seconds);
        if (remaining <= 0) {
          if (countdownIntervalRef.current) {
            clearInterval(countdownIntervalRef.current);
          }
          handleLogout();
        }
      }, 1000);
    }, warningTime);

    // Set new logout timeout (1 hour)
    timeoutRef.current = setTimeout(() => {
      handleLogout();
    }, INACTIVITY_TIMEOUT);
  };

  // Extend session handler (when user clicks "Stay Logged In")
  const handleExtendSession = () => {
    updateLastActivity();
    setShowWarning(false);
    setTimeRemaining(null);
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
    }
    handleActivity(); // Reset timers
  };

  // Set up activity listeners
  useEffect(() => {
    // Check session validity on mount
    if (!isSessionValid()) {
      handleLogout();
      return;
    }

    // Initial activity setup
    handleActivity();

    // Activity events to track
    const events = [
      'mousedown',
      'mousemove',
      'keypress',
      'scroll',
      'touchstart',
      'click'
    ];

    // Throttle activity updates to avoid excessive localStorage writes
    let activityThrottle = null;
    const throttledActivity = () => {
      if (activityThrottle) return;
      activityThrottle = setTimeout(() => {
        handleActivity();
        activityThrottle = null;
      }, 1000); // Update at most once per second
    };

    // Add event listeners
    events.forEach(event => {
      window.addEventListener(event, throttledActivity, true);
    });

    // Cleanup
    return () => {
      events.forEach(event => {
        window.removeEventListener(event, throttledActivity, true);
      });
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (warningTimeoutRef.current) {
        clearTimeout(warningTimeoutRef.current);
      }
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
      if (activityThrottle) {
        clearTimeout(activityThrottle);
      }
    };
  }, [navigate]);

  return {
    showWarning,
    timeRemaining,
    handleExtendSession,
    handleLogout
  };
}

