import { decodeHTML } from 'entities';

const MAX_CHARACTERS = 100_000;
const MAX_LINES = 4_000;
const MAX_DEPTH = 8;
const MAX_INLINE_STEPS = 20_000;
const MAX_LINK_LENGTH = 2_048;
/** @type {Record<string, string>} */
const HTML_ESCAPES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** @param {string} value */
function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => HTML_ESCAPES[character]);
}

/** @param {string} value */
function safeUrl(value) {
  if (!value || value.length > MAX_LINK_LENGTH) return null;
  // Decode before checking protocols, including nested entity disguises.
  // Valid destinations receive a disabled link appearance in this preview.
  for (let pass = 0; pass < MAX_DEPTH; pass += 1) {
    const decoded = decodeHTML(value);
    if (decoded === value) break;
    value = decoded;
  }
  if (/[\s\u0000-\u001f\u007f-\u009f\\<>"`]/u.test(value)) return null;
  try {
    if (/^https?:\/\//i.test(value)) {
      const url = new URL(value);
      return url.hostname && !url.username && !url.password ? value : null;
    }
    // Protocol-relative destinations and colon-bearing scheme prefixes are
    // excluded. Paths, queries, and fragments must resolve on this same origin.
    if (value.startsWith('//') || /^[^/?#]*:/.test(value)) return null;
    const base = 'https://draft-preview.invalid/';
    return new URL(value, base).origin === new URL(base).origin ? value : null;
  } catch {
    return null;
  }
}

/** @param {string} source @param {number} start @param {{ steps: number }} budget */
function readLink(source, start, budget) {
  let end = start + 1;
  for (; end < source.length && end - start <= MAX_LINK_LENGTH; end += 1) {
    budget.steps += 1;
    if (budget.steps > MAX_INLINE_STEPS) return null;
    if (source[end] === '\\') {
      end += 1;
      continue;
    }
    if (source[end] === '[' || source[end] === '\n') return null;
    if (source[end] === ']') break;
  }
  if (source[end] !== ']' || source[end + 1] !== '(') return null;
  const label = source.slice(start + 1, end);
  const destinationStart = end + 2;
  let nesting = 1;
  for (end = destinationStart; end < source.length; end += 1) {
    budget.steps += 1;
    if (budget.steps > MAX_INLINE_STEPS) return null;
    if (end - destinationStart > MAX_LINK_LENGTH || source[end] === '\n')
      return null;
    if (source[end] === '\\') {
      end += 1;
      continue;
    }
    if (source[end] === '(') nesting += 1;
    if (nesting > MAX_DEPTH) return null;
    if (source[end] === ')') nesting -= 1;
    if (nesting === 0) {
      let destination = source.slice(destinationStart, end).trim();
      if (destination.startsWith('<') && destination.endsWith('>'))
        destination = destination.slice(1, -1);
      return { label, destination, end: end + 1 };
    }
  }
  return null;
}

/** @param {string} source @param {string} delimiter @param {number} start @param {{ steps: number }} budget */
function findDelimiter(source, delimiter, start, budget) {
  if (budget.steps > MAX_INLINE_STEPS) return -1;
  const end = source.indexOf(delimiter, start);
  budget.steps += (end === -1 ? source.length : end + delimiter.length) - start;
  return end;
}

/**
 * @param {string} source
 * @param {{ steps: number }} budget
 * @param {number} [depth]
 * @param {boolean} [links]
 */
function inline(source, budget, depth = 0, links = true) {
  if (depth >= MAX_DEPTH) return escapeHtml(source);
  const parts = [];
  for (let cursor = 0; cursor < source.length;) {
    budget.steps += 1;
    if (budget.steps > MAX_INLINE_STEPS) {
      parts.push(escapeHtml(source.slice(cursor)));
      break;
    }
    const character = source[cursor];
    // Keep raw tag/comment source together, so Markdown inside attributes also
    // stays visible text. Nothing from this branch becomes an HTML element.
    if (character === '<') {
      const comment = source.startsWith('<!--', cursor);
      let end = comment ? source.indexOf('-->', cursor + 4) : -1;
      if (comment)
        budget.steps += (end === -1 ? source.length : end + 3) - cursor;
      if (comment && end === -1) {
        parts.push(escapeHtml(source.slice(cursor)));
        break;
      }
      if (comment && end !== -1) end += 2;
      if (!comment) {
        let quote = '';
        for (
          let scan = cursor + 1;
          scan < source.length && scan - cursor <= MAX_LINK_LENGTH;
          scan += 1
        ) {
          budget.steps += 1;
          if (budget.steps > MAX_INLINE_STEPS) break;
          const next = source[scan];
          if (quote) {
            if (next === quote) quote = '';
          } else if (next === '"' || next === "'") quote = next;
          else if (next === '<') break;
          else if (next === '>') {
            end = scan;
            break;
          }
        }
      }
      if (end !== -1) {
        parts.push(escapeHtml(source.slice(cursor, end + 1)));
        cursor = end + 1;
        continue;
      }
    }
    if (
      character === '\\' &&
      /[!"#$%&'()*+,\-./:;<=>?@[\]\\^_`{|}~]/.test(source[cursor + 1] || '')
    ) {
      parts.push(escapeHtml(source[cursor + 1]));
      cursor += 2;
      continue;
    }
    if (character === '`') {
      let runEnd = cursor + 1;
      while (source[runEnd] === '`') runEnd += 1;
      const delimiter = source.slice(cursor, runEnd);
      budget.steps += delimiter.length;
      const end = findDelimiter(
        source,
        delimiter,
        cursor + delimiter.length,
        budget,
      );
      if (end !== -1) {
        parts.push(
          `<code>${escapeHtml(source.slice(cursor + delimiter.length, end))}</code>`,
        );
        cursor = end + delimiter.length;
        continue;
      }
      parts.push(escapeHtml(delimiter));
      cursor += delimiter.length;
      continue;
    }
    const image = character === '!' && source[cursor + 1] === '[';
    if (image || (links && character === '[')) {
      const match = readLink(source, cursor + (image ? 1 : 0), budget);
      if (match) {
        if (image) {
          parts.push(
            `<span class="draft-preview-image">[画像: ${escapeHtml(match.label)}]</span>`,
          );
        } else {
          const label = inline(match.label, budget, depth + 1, false);
          const destination = safeUrl(match.destination);
          // No anchor or URL attribute: reading a draft must not navigate away
          // from the editor and discard unsaved input, including with a keyboard.
          parts.push(
            destination
              ? `<span class="draft-preview-link" role="link" aria-disabled="true" tabindex="0">${label}</span>`
              : label,
          );
        }
        cursor = match.end;
        continue;
      }
    }
    if (character === '*' || character === '_') {
      const delimiter = source.startsWith(character.repeat(2), cursor)
        ? character.repeat(2)
        : character;
      const start = cursor + delimiter.length;
      // Underscores inside words stay literal; formatting keeps the text itself.
      const insideWord =
        character === '_' && /[\p{L}\p{N}]/u.test(source[cursor - 1] || '');
      if (!insideWord && source[start] && !/\s/.test(source[start])) {
        let end = findDelimiter(source, delimiter, start, budget);
        while (
          end !== -1 &&
          (source[end - 1] === '\\' ||
            /\s/.test(source[end - 1]) ||
            (character === '_' &&
              /[\p{L}\p{N}]/u.test(source[end + delimiter.length] || '')))
        )
          end = findDelimiter(
            source,
            delimiter,
            end + delimiter.length,
            budget,
          );
        if (end > start && budget.steps <= MAX_INLINE_STEPS) {
          const tag = delimiter.length === 2 ? 'strong' : 'em';
          parts.push(
            `<${tag}>${inline(source.slice(start, end), budget, depth + 1, links)}</${tag}>`,
          );
          cursor = end + delimiter.length;
          continue;
        }
      }
    }
    parts.push(escapeHtml(character));
    cursor += 1;
  }
  return parts.join('');
}

/** @param {string} line */
function listItem(line) {
  const match = line.match(/^ {0,3}(?:([-+*])|\d{1,9}[.)])\s+(.+)$/);
  return match ? { tag: match[1] ? 'ul' : 'ol', text: match[2] } : null;
}

/** @param {string[]} lines @param {{ steps: number }} budget @param {number} [depth] */
function blocks(lines, budget, depth = 0) {
  if (depth >= MAX_DEPTH) return `<p>${escapeHtml(lines.join('\n'))}</p>`;
  const parts = [];
  for (let cursor = 0; cursor < lines.length;) {
    const line = lines[cursor];
    if (!line.trim()) {
      cursor += 1;
      continue;
    }
    const fence = line.match(/^ {0,3}(`{3,}|~{3,})[^\n]*$/);
    if (fence) {
      const delimiter = fence[1];
      const closing = new RegExp(
        `^ {0,3}${delimiter[0]}{${delimiter.length},}\\s*$`,
      );
      const code = [];
      cursor += 1;
      while (cursor < lines.length && !closing.test(lines[cursor])) {
        code.push(lines[cursor]);
        cursor += 1;
      }
      if (cursor < lines.length) cursor += 1;
      parts.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`);
      continue;
    }
    const heading = line.match(/^ {0,3}(#{1,6})[ \t]+(.+)$/);
    if (heading) {
      const level = Math.min(heading[1].length + 1, 6);
      const text = heading[2].replace(/[ \t]+#+[ \t]*$/, '').trim();
      parts.push(`<h${level}>${inline(text, budget)}</h${level}>`);
      cursor += 1;
      continue;
    }
    if (/^ {0,3}>/.test(line)) {
      const quote = [];
      while (cursor < lines.length && /^ {0,3}>/.test(lines[cursor])) {
        quote.push(lines[cursor].replace(/^ {0,3}> ?/, ''));
        cursor += 1;
      }
      parts.push(
        `<blockquote>${blocks(quote, budget, depth + 1)}</blockquote>`,
      );
      continue;
    }
    const item = listItem(line);
    if (item) {
      const items = [];
      while (cursor < lines.length) {
        const next = listItem(lines[cursor]);
        if (!next || next.tag !== item.tag) break;
        items.push(`<li>${inline(next.text, budget)}</li>`);
        cursor += 1;
      }
      parts.push(`<${item.tag}>${items.join('')}</${item.tag}>`);
      continue;
    }
    const paragraph = [line];
    cursor += 1;
    while (
      cursor < lines.length &&
      lines[cursor].trim() &&
      !/^ {0,3}(?:#{1,6}\s|>|`{3,}|~{3,})/.test(lines[cursor]) &&
      !listItem(lines[cursor])
    ) {
      paragraph.push(lines[cursor]);
      cursor += 1;
    }
    parts.push(`<p>${inline(paragraph.join('\n'), budget)}</p>`);
  }
  return parts.join('\n');
}

/**
 * A deliberately small preview, not a CommonMark parser. Supports paragraphs,
 * ATX headings, emphasis, inline/fenced code, flat lists, blockquotes, links,
 * and image alt placeholders. Raw HTML is always text. No titles, autolinks,
 * tables, nested list syntax, or user-supplied HTML attributes are interpreted.
 * Source is never changed; only this preview is capped at 100k chars/4k lines,
 * eight nesting levels, and 20k inline steps. Export must use the original body.
 * @param {unknown} body
 * @returns {string}
 */
export function renderDraftPreview(body) {
  if (typeof body !== 'string' || !body.trim()) return '';
  const source = body.slice(0, MAX_CHARACTERS).replace(/\r\n?/g, '\n');
  const lines = source.split('\n');
  const truncated = body.length > MAX_CHARACTERS || lines.length > MAX_LINES;
  const html = blocks(lines.slice(0, MAX_LINES), { steps: 0 });
  return (
    html +
    (truncated ? '\n<p>長い本文のため、プレビューを省略しています。</p>' : '')
  );
}
