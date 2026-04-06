/**
 * Sanitize a user-controlled string before embedding it in an AI prompt.
 * Removes markup-like characters, flattens newlines, collapses whitespace,
 * and truncates to a safe length.
 */
export function sanitizeForPrompt(value: string | null | undefined, maxLength = 500): string {
  if (!value) return "";
  return value
    .replace(/[<>{}]/g, "")        // Remove markup-like chars
    .replace(/\r?\n/g, " ")        // Flatten newlines
    .replace(/\s{2,}/g, " ")       // Collapse whitespace
    .slice(0, maxLength)
    .trim();
}

/**
 * Sanitize an array of strings for prompt use.
 */
export function sanitizeArrayForPrompt(values: (string | null | undefined)[], maxLength = 200): string[] {
  return values
    .filter(Boolean)
    .map((v) => sanitizeForPrompt(v, maxLength));
}
