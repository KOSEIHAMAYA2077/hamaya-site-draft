import { isNoteCategory } from './note-categories.mjs';

export const NOTE_QUERY_LIMIT = 120;

/** @typedef {{ q: string, category: string }} NoteQuery */

/** @param {{ q?: unknown, category?: unknown }} [query] */
export function normalizeNoteQuery({ q = '', category = 'all' } = {}) {
  const text = typeof q === 'string' ? q : '';
  return {
    q: [...text.replace(/[\u0000-\u001f\u007f]/g, ' ').trim()]
      .slice(0, NOTE_QUERY_LIMIT)
      .join('')
      .trim(),
    category: isNoteCategory(category) ? category : 'all',
  };
}

/** @param {string | URLSearchParams} [search] */
export function readNoteQuery(search = '') {
  const params =
    search instanceof URLSearchParams ? search : new URLSearchParams(search);
  return normalizeNoteQuery({
    q: params.get('q'),
    category: params.get('category'),
  });
}

/** @param {{ q?: unknown, category?: unknown }} [query] */
export function noteQueryString(query = {}) {
  const { q, category } = normalizeNoteQuery(query);
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (category !== 'all') params.set('category', category);
  const encoded = params.toString();
  return encoded ? `?${encoded}` : '';
}

/**
 * Append only the allowed conditions to a known, generated local route.
 * User-supplied return paths are never read from the query string.
 * @param {string} pathname
 * @param {{ q?: unknown, category?: unknown }} [query]
 */
export function withNoteQuery(pathname, query = {}) {
  if (!pathname.startsWith('/') || pathname.startsWith('//'))
    throw new TypeError('記事のリンクにはサイト内のパスを指定してください。');
  return `${pathname.split(/[?#]/, 1)[0]}${noteQueryString(query)}`;
}

/**
 * The back link always goes to notes under the build's base path.
 * @param {string | URLSearchParams} [search]
 * @param {string} [base]
 */
export function notesListHref(search = '', base = '/') {
  const prefix = base.replace(/^\/+|\/+$/g, '');
  return withNoteQuery(
    `${prefix ? `/${prefix}` : ''}/notes/`,
    readNoteQuery(search),
  );
}
