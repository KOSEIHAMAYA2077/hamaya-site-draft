export const path = (segment = '') =>
  `${import.meta.env.BASE_URL.replace(/\/$/, '')}/${segment.replace(/^\//, '')}`;
