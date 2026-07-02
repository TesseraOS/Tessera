/** First Markdown `# ` heading text in `text`, or `undefined` if there is none. */
export function firstHeading(text: string): string | undefined {
  for (const line of text.split('\n')) {
    const match = /^#\s+(.+?)\s*$/.exec(line);
    if (match?.[1] !== undefined) return match[1];
  }
  return undefined;
}
