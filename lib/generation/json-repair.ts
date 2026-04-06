/**
 * JSON parsing with fallback strategies for AI-generated responses.
 */

import { jsonrepair } from 'jsonrepair';
import { createLogger } from '@/lib/logger';
const log = createLogger('Generation');

export function parseJsonResponse<T>(response: string): T | null {
  // Strategy 1: Try to extract JSON from markdown code blocks (may have multiple)
  const codeBlockMatches = response.matchAll(/```(?:json)?\s*([\s\S]*?)```/g);
  for (const match of codeBlockMatches) {
    const extracted = match[1].trim();
    // Only try if it looks like JSON (starts with { or [)
    if (extracted.startsWith('{') || extracted.startsWith('[')) {
      const result = tryParseJson<T>(extracted);
      if (result !== null) {
        log.debug('Successfully parsed JSON from code block');
        return result;
      }
    }
  }

  // Strategy 2: Try to find JSON structure directly in response (no code block)
  // Look for array or object start
  const jsonStartArray = response.indexOf('[');
  const jsonStartObject = response.indexOf('{');

  if (jsonStartArray !== -1 || jsonStartObject !== -1) {
    // Prefer the structure that appears first
    const startIndex =
      jsonStartArray === -1
        ? jsonStartObject
        : jsonStartObject === -1
          ? jsonStartArray
          : Math.min(jsonStartArray, jsonStartObject);

    // Find the matching close bracket
    let depth = 0;
    let endIndex = -1;
    let inString = false;
    let escapeNext = false;

    for (let i = startIndex; i < response.length; i++) {
      const char = response[i];

      if (escapeNext) {
        escapeNext = false;
        continue;
      }

      if (char === '\\' && inString) {
        escapeNext = true;
        continue;
      }

      if (char === '"' && !escapeNext) {
        inString = !inString;
        continue;
      }

      if (!inString) {
        if (char === '[' || char === '{') depth++;
        else if (char === ']' || char === '}') {
          depth--;
          if (depth === 0) {
            endIndex = i;
            break;
          }
        }
      }
    }

    if (endIndex !== -1) {
      const jsonStr = response.substring(startIndex, endIndex + 1);
      const result = tryParseJson<T>(jsonStr);
      if (result !== null) {
        log.debug('Successfully parsed JSON from response body');
        return result;
      }
    }
  }

  // Strategy 3: Last resort - try the whole response
  const result = tryParseJson<T>(response.trim());
  if (result !== null) {
    log.debug('Successfully parsed raw response as JSON');
    return result;
  }

  // Strategy 4: Try to fix incomplete JSON by adding closing brackets/braces
  const trimmed = response.trim();
  if (
    (trimmed.startsWith('{') && !trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && !trimmed.endsWith(']'))
  ) {
    let fixedResponse = trimmed;
    if (trimmed.startsWith('{') && !trimmed.endsWith('}')) {
      const openBraces = (fixedResponse.match(/{/g) || []).length;
      const closeBraces = (fixedResponse.match(/}/g) || []).length;
      if (openBraces > closeBraces) {
        fixedResponse += '}'.repeat(openBraces - closeBraces);
        log.debug('Attempting to fix incomplete JSON object by adding closing braces');
      }
    } else if (trimmed.startsWith('[') && !trimmed.endsWith(']')) {
      const openBrackets = (fixedResponse.match(/\[/g) || []).length;
      const closeBrackets = (fixedResponse.match(/\]/g) || []).length;
      if (openBrackets > closeBrackets) {
        fixedResponse += ']'.repeat(openBrackets - closeBrackets);
        log.debug('Attempting to fix incomplete JSON array by adding closing brackets');
      }
    }

    const fixedResult = tryParseJson<T>(fixedResponse);
    if (fixedResult !== null) {
      log.debug('Successfully parsed fixed incomplete JSON');
      return fixedResult;
    }
  }

  log.error('Failed to parse JSON from response');
  log.error('Raw response (first 500 chars):', response.substring(0, 500));

  return null;
}

/**
 * Try to parse JSON with various fixes for common AI response issues
 */
export function tryParseJson<T>(jsonStr: string): T | null {
  // Attempt 1: Try parsing as-is
  try {
    return JSON.parse(jsonStr) as T;
  } catch {
    // Continue to fix attempts
  }

  // Attempt 2: Fix common JSON issues from AI responses
  try {
    let fixed = jsonStr;

    // Fix 1: Handle LaTeX-style escapes that break JSON (e.g., \frac, \left, \right, \times, etc.)
    // These are common in math content and need to be double-escaped
    // Match backslash followed by letters (LaTeX commands) inside strings
    fixed = fixed.replace(/"([^"]*?)"/g, (_match, content) => {
      // Double-escape any backslash followed by a letter (except valid JSON escapes)
      const fixedContent = content.replace(/\\([a-zA-Z])/g, '\\\\$1');
      return `"${fixedContent}"`;
    });

    // Fix 2: Fix other invalid escape sequences (e.g., \S, \L, etc.)
    // Valid JSON escapes: \", \\, \/, \b, \f, \n, \r, \t, \uXXXX
    fixed = fixed.replace(/\\([^"\\\/bfnrtu\n\r])/g, (match, char) => {
      // If it's a letter, it's likely a LaTeX command
      if (/[a-zA-Z]/.test(char)) {
        return '\\\\' + char;
      }
      return match;
    });

    // Fix 3: Try to fix truncated JSON arrays/objects
    const trimmed = fixed.trim();
    if (trimmed.startsWith('[') && !trimmed.endsWith(']')) {
      // Count braces to see if we can reasonably close it
      const openBrackets = (fixed.match(/\[/g) || []).length;
      const closeBrackets = (fixed.match(/\]/g) || []).length;
      if (openBrackets > closeBrackets) {
        // Try to find the last complete object in the array
        const lastCompleteObj = fixed.lastIndexOf('}');
        if (lastCompleteObj > 0) {
          // Check if there's a comma before the truncation
          const afterLastObj = fixed.substring(lastCompleteObj + 1).trim();
          if (afterLastObj.startsWith(',')) {
            // Remove the trailing comma
            fixed = fixed.substring(0, lastCompleteObj + 1) + ']';
          } else {
            fixed = fixed.substring(0, lastCompleteObj + 1) + ']';
          }
          log.warn('Fixed truncated JSON array by closing at last complete object');
        } else {
          // Just close the array
          fixed += ']';
          log.warn('Fixed truncated JSON array by adding closing bracket');
        }
      }
    } else if (trimmed.startsWith('{') && !trimmed.endsWith('}')) {
      // Try to close incomplete object by counting braces
      const openBraces = (fixed.match(/{/g) || []).length;
      const closeBraces = (fixed.match(/}/g) || []).length;
      if (openBraces > closeBraces) {
        // Find the last complete key-value pair
        const lastColon = fixed.lastIndexOf(':');
        if (lastColon > 0) {
          const afterColon = fixed.substring(lastColon + 1).trim();
          if (afterColon.startsWith('"') && !afterColon.includes('"', 1)) {
            // Incomplete string value - close it
            const lastQuote = fixed.lastIndexOf('"');
            fixed = fixed.substring(0, lastQuote + 1) + '}';
            log.warn('Fixed truncated JSON object by closing incomplete string value');
          } else {
            fixed += '}';
            log.warn('Fixed truncated JSON object by adding closing brace');
          }
        } else {
          fixed += '}';
          log.warn('Fixed truncated JSON object by adding closing brace');
        }
      }
    }

    return JSON.parse(fixed) as T;
  } catch {
    // Continue to next attempt
  }

  // Attempt 3: Use jsonrepair to fix malformed JSON (e.g. unescaped quotes in Chinese text)
  try {
    const repaired = jsonrepair(jsonStr);
    return JSON.parse(repaired) as T;
  } catch {
    // Continue to next attempt
  }

  // Attempt 4: More aggressive fixing - remove control characters
  try {
    let fixed = jsonStr;

    // Remove or escape control characters
    fixed = fixed.replace(/[\x00-\x1F\x7F]/g, (char) => {
      switch (char) {
        case '\n':
          return '\\n';
        case '\r':
          return '\\r';
        case '\t':
          return '\\t';
        default:
          return '';
      }
    });

    return JSON.parse(fixed) as T;
  } catch {
    return null;
  }
}
