/**
 * Email validation utility
 * Validates email format using a basic regex pattern
 */

/**
 * Validates email format
 * @param {string} email - Email address to validate
 * @returns {boolean} - True if email is valid, false otherwise
 */
const isValidEmail = (email) => {
  if (!email || typeof email !== 'string') {
    return false;
  }

  // Basic email format validation
  // Must contain @ symbol and valid domain format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
};

/**
 * Validates and normalizes email
 * @param {string} email - Email address to validate and normalize
 * @returns {{isValid: boolean, normalized: string|null, error: string|null}}
 */
const validateEmail = (email) => {
  if (!email || typeof email !== 'string') {
    return {
      isValid: false,
      normalized: null,
      error: 'Email is required'
    };
  }

  const trimmed = email.trim();

  if (trimmed === '') {
    return {
      isValid: false,
      normalized: null,
      error: 'Email cannot be empty'
    };
  }

  if (!isValidEmail(trimmed)) {
    return {
      isValid: false,
      normalized: null,
      error: 'Invalid email format'
    };
  }

  return {
    isValid: true,
    normalized: trimmed.toLowerCase(),
    error: null
  };
};

module.exports = {
  isValidEmail,
  validateEmail
};
