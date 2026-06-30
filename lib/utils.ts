import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Language to file extension mapping
const LANGUAGE_EXTENSIONS: Record<string, string> = {
  javascript: 'js',
  typescript: 'ts',
  python: 'py',
  java: 'java',
  csharp: 'cs',
  cpp: 'cpp',
  go: 'go',
  rust: 'rs',
  php: 'php',
  ruby: 'rb',
  sql: 'sql',
  html: 'html',
  css: 'css',
  bash: 'sh'
};

// MIME type mapping for common file extensions
const MIME_TYPES: Record<string, string> = {
  js: 'text/javascript',
  ts: 'text/typescript',
  py: 'text/x-python',
  java: 'text/x-java-source',
  cs: 'text/x-csharp',
  cpp: 'text/x-c++src',
  go: 'text/x-go',
  rs: 'text/x-rust',
  php: 'text/x-php',
  rb: 'text/x-ruby',
  sql: 'text/sql',
  html: 'text/html',
  css: 'text/css',
  sh: 'text/x-sh',
  txt: 'text/plain'
};

/**
 * Get appropriate file extension for a programming language
 */
export function getFileExtension(language: string): string {
  return LANGUAGE_EXTENSIONS[language.toLowerCase()] || 'txt';
}

/**
 * Get appropriate MIME type for a file extension
 */
function getMimeType(extension: string): string {
  return MIME_TYPES[extension] || 'text/plain';
}

/**
 * Sanitize filename
 */
function sanitizeFilename(title: string): string {
  // Handle empty title case
  const baseName = title.trim() || 'snippet';
  
  // Remove invalid characters
  let sanitized = baseName
    .replace(/[<>:"/\\|?*]/g, '_') // Windows invalid chars
    .replace(/[\x00-\x1F\x7F]/g, '') // Control chars
    .replace(/\s+/g, '_') // Replace spaces with underscores
    .toLowerCase();
  
  // Truncate to a reasonable length (max 100 chars + extension)
  const MAX_FILENAME_LENGTH = 100;
  if (sanitized.length > MAX_FILENAME_LENGTH) {
    sanitized = sanitized.slice(0, MAX_FILENAME_LENGTH);
    // Avoid cutting off in the middle of a word
    const lastUnderscore = sanitized.lastIndexOf('_');
    if (lastUnderscore > MAX_FILENAME_LENGTH * 0.8) {
      sanitized = sanitized.slice(0, lastUnderscore);
    }
  }
  
  return sanitized;
}

/**
 * Export and download a snippet as a file
 */
export function exportSnippet(snippet: { title: string; code: string; language: string }): void {
  try {
    const extension = getFileExtension(snippet.language);
    const safeFilename = sanitizeFilename(snippet.title);
    const filename = `${safeFilename}.${extension}`;
    const mimeType = getMimeType(extension);
    
    // Create a Blob with the code content
    const blob = new Blob([snippet.code], { type: mimeType });
    
    // Create download link
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    
    // Trigger download
    document.body.appendChild(link);
    link.click();
    
    // Clean up
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Failed to export snippet:', error);
    throw new Error('Failed to export snippet');
  }
}