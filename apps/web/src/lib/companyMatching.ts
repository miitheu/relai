/**
 * Company name normalization and matching utilities
 */

// Normalize company name for matching (mirrors DB function)
export function normalizeCompanyName(rawName: string | null | undefined): string {
  if (!rawName) return '';
  
  return rawName
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')                    // collapse whitespace
    .replace(/&/g, 'and')                    // & to and
    .replace(/[.,'"\\-]/g, '')               // remove punctuation
    .replace(/\s+(inc|llc|ltd|corp|corporation|company|co|plc|lp|llp|gmbh|ag|sa|nv|bv)\.?$/gi, ''); // remove suffixes
}

// Extract domain from email
export function extractDomain(email: string | null | undefined): string | null {
  if (!email) return null;
  const match = email.trim().toLowerCase().match(/@([a-z0-9.-]+\.[a-z]{2,})$/i);
  return match ? match[1] : null;
}

// Calculate similarity score between two strings (0-1)
export function calculateSimilarity(str1: string, str2: string): number {
  if (!str1 || !str2) return 0;
  
  const s1 = str1.toLowerCase();
  const s2 = str2.toLowerCase();
  
  if (s1 === s2) return 1;
  
  // Levenshtein distance-based similarity
  const matrix: number[][] = [];
  const len1 = s1.length;
  const len2 = s2.length;
  
  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  
  const distance = matrix[len1][len2];
  const maxLen = Math.max(len1, len2);
  return maxLen === 0 ? 1 : 1 - distance / maxLen;
}

// Determine match confidence based on different matching methods
export type MatchConfidence = 'exact' | 'likely' | 'ambiguous' | 'new' | 'none';

export interface CompanyMatch {
  clientId: string;
  clientName: string;
  confidence: MatchConfidence;
  method: 'name_exact' | 'name_normalized' | 'domain' | 'fuzzy';
  score: number;
}

export function determineMatchConfidence(matches: CompanyMatch[]): MatchConfidence {
  if (matches.length === 0) return 'new';
  
  const topMatch = matches[0];
  
  if (topMatch.method === 'name_exact') return 'exact';
  if (topMatch.method === 'name_normalized' && topMatch.score === 1) return 'exact';
  if (topMatch.score >= 0.9) return 'likely';
  if (topMatch.score >= 0.7) return 'ambiguous';
  if (matches.length > 1 && matches[1].score >= 0.7) return 'ambiguous';
  
  return topMatch.score >= 0.6 ? 'ambiguous' : 'new';
}

// Validate email format
export function isValidEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
}

// Parse CSV content
export function parseCSV(content: string): { headers: string[]; rows: string[][] } {
  const lines = content.split(/\r?\n/).filter(line => line.trim());
  if (lines.length === 0) return { headers: [], rows: [] };
  
  const parseRow = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];
      
      if (char === '"' && inQuotes && nextChar === '"') {
        current += '"';
        i++;
      } else if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  };
  
  const headers = parseRow(lines[0]);
  const rows = lines.slice(1).map(parseRow);
  
  return { headers, rows };
}

// Map CSV columns to expected fields
export interface ColumnMapping {
  name: number | null;
  company: number | null;
  organizationType: number | null;
  deals: number | null;
  contactTitle: number | null;
  phone: number | null;
  email: number | null;
  people: number | null;
  source: number | null;
}

export function autoMapColumns(headers: string[]): ColumnMapping {
  const lowerHeaders = headers.map(h => h.toLowerCase().trim());
  
  const findColumn = (patterns: string[]): number | null => {
    for (const pattern of patterns) {
      const idx = lowerHeaders.findIndex(h => h.includes(pattern));
      if (idx !== -1) return idx;
    }
    return null;
  };
  
  return {
    name: findColumn(['name', 'contact name', 'full name', 'person']),
    company: findColumn(['company', 'organization', 'firm', 'employer']),
    organizationType: findColumn(['organization type', 'org type', 'type', 'category']),
    deals: findColumn(['deals', 'deal']),
    contactTitle: findColumn(['title', 'function', 'role', 'position', 'job']),
    phone: findColumn(['phone', 'telephone', 'mobile', 'cell']),
    email: findColumn(['email', 'e-mail', 'mail']),
    people: findColumn(['people', 'owner', 'rep', 'assigned', 'team member']),
    source: findColumn(['source', 'origin', 'channel', 'lead source']),
  };
}
