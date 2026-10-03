/**
 * Use the renderer's IDs rather than deriving new slugs from the article text.
 * Short articles do not need a table of contents.
 * @param {{ depth: number, slug: string, text: string }[]} headings
 */
export function articleHeadings(headings) {
  const sections = headings.filter(
    ({ depth, slug, text }) => depth === 2 && slug && text.trim(),
  );
  if (sections.length < 4) return [];
  return sections.map(({ slug, text }) => ({
    text,
    href: `#${encodeURIComponent(slug)}`,
  }));
}
