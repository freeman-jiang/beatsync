/**
 * Custom name management utility with localStorage persistence
 * and conflict resolution capabilities
 */

import { generateName } from './randomNames';

const CUSTOM_NAME_KEY = 'beatsync_custom_name';
const CUSTOM_NAME_TIMESTAMP_KEY = 'beatsync_custom_name_timestamp';

export interface NameConflictResolution {
  originalName: string;
  suggestedNames: string[];
  autoResolvedName?: string;
}

export interface CustomNameOptions {
  maxLength?: number;
  allowEmpty?: boolean;
  reservedNames?: string[];
}

/**
 * Default options for custom name configuration
 */
const DEFAULT_OPTIONS: Required<CustomNameOptions> = {
  maxLength: 50,
  allowEmpty: false,
  reservedNames: ['admin', 'system', 'bot', 'moderator'],
};

/**
 * Saves a custom name to localStorage with timestamp
 */
export function saveCustomName(name: string, options: CustomNameOptions = {}): boolean {
  // Check if we're in a browser environment
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    console.warn('localStorage not available');
    return false;
  }

  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Validate name
  if (!opts.allowEmpty && (!name || name.trim().length === 0)) {
    return false;
  }

  if (name.length > opts.maxLength) {
    return false;
  }

  const trimmedName = name.trim();

  // Check reserved names
  if (opts.reservedNames.some(reserved => reserved.toLowerCase() === trimmedName.toLowerCase())) {
    return false;
  }

  try {
    localStorage.setItem(CUSTOM_NAME_KEY, trimmedName);
    localStorage.setItem(CUSTOM_NAME_TIMESTAMP_KEY, Date.now().toString());
    return true;
  } catch (error) {
    console.error('Failed to save custom name:', error);
    return false;
  }
}

/**
 * Loads the custom name from localStorage
 */
export function loadCustomName(): string | null {
  // Check if we're in a browser environment
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return null;
  }

  try {
    return localStorage.getItem(CUSTOM_NAME_KEY);
  } catch (error) {
    console.error('Failed to load custom name:', error);
    return null;
  }
}

/**
 * Gets the timestamp when the custom name was last saved
 */
export function getCustomNameTimestamp(): number | null {
  // Check if we're in a browser environment
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return null;
  }

  try {
    const timestamp = localStorage.getItem(CUSTOM_NAME_TIMESTAMP_KEY);
    return timestamp ? parseInt(timestamp, 10) : null;
  } catch (error) {
    console.error('Failed to load custom name timestamp:', error);
    return null;
  }
}

/**
 * Clears the custom name from localStorage
 */
export function clearCustomName(): boolean {
  // Check if we're in a browser environment
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return false;
  }

  try {
    localStorage.removeItem(CUSTOM_NAME_KEY);
    localStorage.removeItem(CUSTOM_NAME_TIMESTAMP_KEY);
    return true;
  } catch (error) {
    console.error('Failed to clear custom name:', error);
    return false;
  }
}

/**
 * Checks if a custom name exists and is recent (within last 30 days)
 */
export function hasRecentCustomName(): boolean {
  const name = loadCustomName();
  const timestamp = getCustomNameTimestamp();

  if (!name || !timestamp) {
    return false;
  }

  // Consider name recent if set within last 30 days
  const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
  return timestamp > thirtyDaysAgo;
}

/**
 * Generates name conflict resolution suggestions
 */
export function generateNameConflictResolution(
  desiredName: string,
  existingNames: string[],
  options: CustomNameOptions = {}
): NameConflictResolution {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const lowerDesired = desiredName.toLowerCase();
  const lowerExisting = existingNames.map(name => name.toLowerCase());

  // Check if the exact name is available
  if (!lowerExisting.includes(lowerDesired)) {
    return {
      originalName: desiredName,
      suggestedNames: [desiredName],
      autoResolvedName: desiredName,
    };
  }

  const suggestions: string[] = [];
  const baseName = desiredName.slice(0, opts.maxLength - 10); // Leave room for suffix

  // Generate numbered suggestions
  for (let i = 2; i <= 10; i++) {
    const suggestion = `${baseName}${i}`;
    if (suggestion.length <= opts.maxLength &&
        !lowerExisting.includes(suggestion.toLowerCase()) &&
        !suggestions.includes(suggestion)) {
      suggestions.push(suggestion);
    }
  }

  // Generate alternative suggestions if we have space
  if (suggestions.length < 3) {
    const alternatives = ['Pro', 'Master', 'Guru', 'Ninja', 'Hero', 'Legend', 'Champ'];
    for (const alt of alternatives) {
      const suggestion = `${baseName} ${alt}`;
      if (suggestion.length <= opts.maxLength &&
          !lowerExisting.includes(suggestion.toLowerCase()) &&
          !suggestions.includes(suggestion)) {
        suggestions.push(suggestion);
      }
    }
  }

  // Auto-resolve with first suggestion if available
  const autoResolvedName = suggestions.length > 0 ? suggestions[0] : undefined;

  return {
    originalName: desiredName,
    suggestedNames: suggestions.slice(0, 5), // Limit to 5 suggestions
    autoResolvedName,
  };
}

/**
 * Validates if a name is acceptable for use
 */
export function validateCustomName(name: string, options: CustomNameOptions = {}): {
  isValid: boolean;
  error?: string;
} {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  if (!opts.allowEmpty && (!name || name.trim().length === 0)) {
    return { isValid: false, error: 'Name cannot be empty' };
  }

  if (name.length > opts.maxLength) {
    return { isValid: false, error: `Name must be ${opts.maxLength} characters or less` };
  }

  const trimmedName = name.trim();

  if (opts.reservedNames.some(reserved => reserved.toLowerCase() === trimmedName.toLowerCase())) {
    return { isValid: false, error: 'This name is reserved and cannot be used' };
  }

  // Check for inappropriate content (basic check)
  const inappropriateWords = ['spam', 'admin', 'system', 'bot'];
  if (inappropriateWords.some(word => trimmedName.toLowerCase().includes(word))) {
    return { isValid: false, error: 'Name contains inappropriate content' };
  }

  return { isValid: true };
}

/**
 * Gets the best available name for a user (custom name if available, otherwise random)
 */
export function getBestAvailableName(): string {
  const customName = loadCustomName();
  if (customName && hasRecentCustomName()) {
    return customName;
  }

  // Fallback to random name generation
  return generateName();
}