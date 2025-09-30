/**
 * Shared utility functions for CDK system
 */

/**
 * Generate a unique ID
 */
export function generateId(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

/**
 * Hash IP address for privacy
 */
export async function hashIP(ip: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(ip + 'cdk-salt');
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Get client IP from request
 */
export function getClientIP(request: Request): string {
  return request.headers.get('CF-Connecting-IP') || 
         request.headers.get('X-Forwarded-For') || 
         request.headers.get('X-Real-IP') || 
         '127.0.0.1';
}

/**
 * Validate project name
 */
export function validateProjectName(name: string): boolean {
  return name.length >= 1 && name.length <= 50;
}

/**
 * Validate project password
 */
export function validateProjectPassword(password: string): boolean {
  return password.length >= 6 && password.length <= 20;
}

/**
 * Validate project description
 */
export function validateProjectDescription(description?: string): boolean {
  if (!description) return true;
  return description.length <= 200;
}

/**
 * Parse cards from different formats
 */
export function parseCards(input: string, format: 'text' | 'csv' | 'json' = 'text'): string[] {
  try {
    switch (format) {
      case 'json':
        const parsed = JSON.parse(input);
        if (Array.isArray(parsed)) {
          return parsed.map(item => 
            typeof item === 'string' ? item : JSON.stringify(item)
          );
        }
        return [JSON.stringify(parsed)];
      
      case 'csv':
        return input.split(/[,，]/).map(card => card.trim()).filter(card => card);
      
      case 'text':
      default:
        return input.split('\n').map(card => card.trim()).filter(card => card);
    }
  } catch (error) {
    // Fallback to text format
    return input.split('\n').map(card => card.trim()).filter(card => card);
  }
}

/**
 * Remove duplicate cards
 */
export function removeDuplicateCards(cards: string[]): string[] {
  return [...new Set(cards)];
}

/**
 * Sanitize HTML to prevent XSS
 */
export function sanitizeHTML(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

/**
 * Format date for display
 */
export function formatDate(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}
