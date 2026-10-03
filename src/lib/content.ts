import { getCollection } from 'astro:content';

export const publishedWorks = async () =>
  (await getCollection('works', ({ data }) => !data.draft)).sort((a, b) =>
    b.data.date.localeCompare(a.data.date),
  );
export const publishedNotes = async () =>
  (await getCollection('notes', ({ data }) => !data.draft)).sort((a, b) =>
    b.data.date.localeCompare(a.data.date),
  );
export const formatDate = (date: string) => date.replaceAll('-', '.');
