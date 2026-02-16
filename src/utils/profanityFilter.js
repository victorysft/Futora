/**
 * Profanity Filter Utility
 * 
 * Client-side validation for user-generated content.
 * Note: Backend also validates via trigger in Supabase.
 */

// Common profanity wordlist (add more as needed)
const PROFANITY_LIST = [
  // High severity
  'fuck', 'shit', 'bitch', 'asshole', 'bastard', 'cunt', 'dick',
  'pussy', 'cock', 'damn', 'hell', 'piss', 'whore', 'slut',
  
  // Hate speech / slurs (zero tolerance)
  'nigger', 'faggot', 'retard', 'tranny',
  
  // Medium severity
  'ass', 'crap', 'suck', 'penis', 'vagina', 'sex',
  
  // Variants with numbers/special chars
  'f*ck', 'sh*t', 'b*tch', 'fck', 'fuk',
];

/**
 * Check if text contains profanity
 * @param {string} text 
 * @returns {boolean} - true if clean, false if contains profanity
 */
export function checkProfanity(text) {
  if (!text) return true;
  
  const normalized = text.toLowerCase()
    .replace(/[^a-z0-9\s]/g, '') // Remove special chars
    .replace(/\s+/g, ' '); // Normalize spaces
  
  // Check each word
  for (const word of PROFANITY_LIST) {
    // Match whole word or as part of word
    const regex = new RegExp(`\\b${word}\\b|${word}`, 'i');
    if (regex.test(normalized)) {
      return false;
    }
  }
  
  return true;
}

/**
 * Get profanity violations in text
 * @param {string} text 
 * @returns {string[]} - Array of matched profane words
 */
export function getProfanityViolations(text) {
  if (!text) return [];
  
  const violations = [];
  const normalized = text.toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ');
  
  for (const word of PROFANITY_LIST) {
    const regex = new RegExp(`\\b${word}\\b|${word}`, 'i');
    if (regex.test(normalized)) {
      violations.push(word);
    }
  }
  
  return violations;
}

/**
 * Sanitize text by replacing profanity with asterisks
 * @param {string} text 
 * @returns {string}
 */
export function sanitizeText(text) {
  if (!text) return '';
  
  let sanitized = text;
  
  for (const word of PROFANITY_LIST) {
    const regex = new RegExp(`\\b${word}\\b`, 'gi');
    const replacement = word[0] + '*'.repeat(word.length - 1);
    sanitized = sanitized.replace(regex, replacement);
  }
  
  return sanitized;
}

/**
 * Validate identity (username/identity field)
 * @param {string} identity 
 * @returns {{ valid: boolean, error: string | null }}
 */
export function validateIdentity(identity) {
  if (!identity) {
    return { valid: false, error: 'Identity is required' };
  }
  
  if (identity.length < 2) {
    return { valid: false, error: 'Identity must be at least 2 characters' };
  }
  
  if (identity.length > 30) {
    return { valid: false, error: 'Identity must be less than 30 characters' };
  }
  
  if (!checkProfanity(identity)) {
    return { valid: false, error: 'Identity contains inappropriate language' };
  }
  
  return { valid: true, error: null };
}

/**
 * Validate any user input
 * @param {string} text 
 * @param {object} options 
 * @returns {{ valid: boolean, error: string | null }}
 */
export function validateInput(text, options = {}) {
  const {
    minLength = 0,
    maxLength = 1000,
    allowEmpty = false,
    checkProfanityFlag = true,
  } = options;
  
  if (!text && !allowEmpty) {
    return { valid: false, error: 'Input is required' };
  }
  
  if (text && text.length < minLength) {
    return { valid: false, error: `Input must be at least ${minLength} characters` };
  }
  
  if (text && text.length > maxLength) {
    return { valid: false, error: `Input must be less than ${maxLength} characters` };
  }
  
  if (checkProfanityFlag && !checkProfanity(text)) {
    return { valid: false, error: 'Input contains inappropriate language' };
  }
  
  return { valid: true, error: null };
}

/**
 * Real-time validation for input fields
 * Returns error message or null
 * @param {string} text 
 * @param {string} fieldName 
 * @returns {string | null}
 */
export function validateField(text, fieldName) {
  switch (fieldName) {
    case 'identity':
    case 'username':
      return validateIdentity(text).error;
      
    case 'becoming':
    case 'focus':
      return validateInput(text, { minLength: 3, maxLength: 50 }).error;
      
    case 'bio':
    case 'description':
      return validateInput(text, { maxLength: 500, allowEmpty: true }).error;
      
    case 'goal_title':
      return validateInput(text, { minLength: 3, maxLength: 100 }).error;
      
    default:
      return validateInput(text).error;
  }
}
