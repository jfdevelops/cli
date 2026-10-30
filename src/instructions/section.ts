const startMarker = '<!-- jfdevelops:start -->';
const endMarker = '<!-- jfdevelops:end -->';

export class ManagedSectionError extends Error {
  override name = 'ManagedSectionError';
}

/**
 * Inserts or replaces the CLI-managed block in an instruction file, preserving all other content
 * and the file's line endings. A missing file is created with the given heading.
 */
export function upsertManagedSection(current: string | undefined, body: string, heading: string) {
  const newline = current?.includes('\r\n') ? '\r\n' : '\n';
  const block = [startMarker, body.trimEnd(), endMarker].join('\n').replaceAll('\n', newline);

  if (current === undefined) {

    return `${heading}${newline}${newline}${block}${newline}`;
  }

  const start = current.indexOf(startMarker);
  const end = start === -1 ? current.indexOf(endMarker) : current.indexOf(endMarker, start);

  if (start !== -1 && end !== -1) {

    return `${current.slice(0, start)}${block}${current.slice(end + endMarker.length)}`;
  }

  if (start !== -1 || end !== -1) {
    throw new ManagedSectionError(`Found an unmatched ${start === -1 ? endMarker : startMarker} marker`);
  }

  return `${current.trimEnd()}${newline}${newline}${block}${newline}`;
}
