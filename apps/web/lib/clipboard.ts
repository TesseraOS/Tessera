import { toast } from 'sonner';

/**
 * Copy text to the clipboard, telling the user either way (F-062).
 *
 * **Why this is a helper and not two inline lines.** `navigator.clipboard.writeText` **rejects** —
 * on an insecure origin, when the permission is denied, and when the document is not focused. The
 * existing call site awaits it unguarded, so a rejection there becomes an unhandled promise
 * rejection and the user sees *nothing at all*: no success toast, no error, just a button that
 * appears to do nothing. A copy button whose failure is silent is worse than no copy button, because
 * the user walks away believing they have the content.
 *
 * Returns whether it worked, so a caller can drive its own "Copied!" state honestly.
 */
export async function copyToClipboard(text: string, successMessage: string): Promise<boolean> {
  try {
    if (typeof navigator === 'undefined' || navigator.clipboard === undefined) {
      throw new Error('clipboard unavailable');
    }
    await navigator.clipboard.writeText(text);
    toast.success(successMessage);
    return true;
  } catch {
    toast.error('Could not copy to the clipboard', {
      description: 'Your browser blocked clipboard access. Select the text and copy it manually.',
    });
    return false;
  }
}

/**
 * Download `content` as a file.
 *
 * Revokes the object URL afterwards — an un-revoked blob URL pins its blob in memory for the life of
 * the document, which for a context package is megabytes per click.
 */
export function downloadTextFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}
