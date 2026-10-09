import { getCollection } from 'astro:content';
import { publicPreviewEnabled } from './build-mode.mjs';
import { publicPreviewNotes } from './public-preview.mjs';

export const publishedWorks = async () =>
  (await getCollection('works', ({ data }) => !data.draft)).sort((a, b) =>
    b.data.date.localeCompare(a.data.date),
  );
export const publishedNotes = async () =>
  (await getCollection('notes', ({ data }) => !data.draft)).sort((a, b) =>
    b.data.date.localeCompare(a.data.date),
  );
export const displayedNotes = async () =>
  publicPreviewEnabled(import.meta.env.PUBLIC_PREVIEW)
    ? publicPreviewNotes(await getCollection('publicPreviewNotes'))
    : publishedNotes();
export const formatDate = (date: string) => date.replaceAll('-', '.');
