export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return 'unknown';
  if (bytes >= 1024 ** 4) return `${(bytes / 1024 ** 4).toFixed(1)} TB`;
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return 'unknown';
  const rounded = Math.round(seconds);
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const remainingSeconds = rounded % 60;
  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, '0')}m ${String(remainingSeconds).padStart(2, '0')}s`;
  }
  return `${minutes}m ${String(remainingSeconds).padStart(2, '0')}s`;
}

export function formatEta(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '--';
  const rounded = Math.ceil(seconds);
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const remainingSeconds = rounded % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
  }
  return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
}

/**
 * Replace terminal control characters so manifest-controlled strings cannot
 * inject ANSI/OSC sequences into the user's terminal or CI log.
 */
export function sanitizeMultiline(value: string, maxLength = 8000): string {
  return value
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g, character => {
      const code = character.charCodeAt(0).toString(16).padStart(2, '0');
      return `\\x${code}`;
    })
    .replace(/\r/g, '\\r')
    .slice(0, maxLength);
}

export function sanitizeForDisplay(value: string, maxLength = 300): string {
  return value
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, character => {
      const code = character.charCodeAt(0).toString(16).padStart(2, '0');
      return `\\x${code}`;
    })
    .slice(0, maxLength);
}
