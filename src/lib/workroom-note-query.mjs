import { readNoteQuery, withNoteQuery } from './note-query.mjs';

/**
 * Return to the known local record list, preserving only supported conditions.
 * No return URL is accepted from the query string.
 * @param {string | URLSearchParams} [search]
 * @param {string} [base]
 */
export function workroomNotesListHref(search = '', base = '/') {
  const prefix = base.replace(/^\/+|\/+$/g, '');
  return withNoteQuery(
    `${prefix ? `/${prefix}` : ''}/room/notes/`,
    readNoteQuery(search),
  );
}
