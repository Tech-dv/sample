import { useEffect, useRef } from 'react';

/**
 * Auto-save hook that persists form data to localStorage
 * @param {string} key - Unique key for the form data
 * @param {object} data - Form data to save
 * @param {number} delay - Debounce delay in milliseconds (default: 1000ms)
 * @returns {object} - { loadSavedData, clearSavedData }
 */
export function useAutoSave(key, data, delay = 1000) {
  const timeoutRef = useRef(null);
  const isFirstRender = useRef(true);

  useEffect(() => {
    // Skip auto-save on first render (to avoid overwriting loaded data)
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    // Clear previous timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Set new timeout for debounced save
    timeoutRef.current = setTimeout(() => {
      try {
        if (data && Object.keys(data).length > 0) {
          localStorage.setItem(key, JSON.stringify({
            data,
            timestamp: new Date().toISOString(),
          }));
          console.log(`Auto-saved: ${key}`);
        }
      } catch (error) {
        console.error('Auto-save error:', error);
      }
    }, delay);

    // Cleanup on unmount
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [key, data, delay]);
}

/**
 * Load saved data from localStorage
 * @param {string} key - Unique key for the form data
 * @returns {object|null} - Saved data or null if not found
 */
export function loadSavedData(key) {
  try {
    const saved = localStorage.getItem(key);
    if (saved) {
      const parsed = JSON.parse(saved);
      console.log(`Loaded saved data: ${key} (saved at ${parsed.timestamp})`);
      return parsed.data;
    }
  } catch (error) {
    console.error('Error loading saved data:', error);
  }
  return null;
}

/**
 * Clear saved data from localStorage
 * @param {string} key - Unique key for the form data
 */
export function clearSavedData(key) {
  try {
    localStorage.removeItem(key);
    console.log(`Cleared saved data: ${key}`);
  } catch (error) {
    console.error('Error clearing saved data:', error);
  }
}

/**
 * Check if saved data exists and show restore prompt
 * @param {string} key - Unique key for the form data
 * @returns {boolean} - True if saved data exists
 */
export function hasSavedData(key) {
  try {
    const saved = localStorage.getItem(key);
    return !!saved;
  } catch (error) {
    return false;
  }
}

