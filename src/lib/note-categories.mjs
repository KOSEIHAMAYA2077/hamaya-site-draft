/** @type {readonly ['学び', '雑記', 'ゲーム', '感想']} */
export const NOTE_CATEGORIES = Object.freeze([
  '学び',
  '雑記',
  'ゲーム',
  '感想',
]);

/**
 * @param {unknown} value
 * @returns {value is (typeof NOTE_CATEGORIES)[number]}
 */
export function isNoteCategory(value) {
  return NOTE_CATEGORIES.some((category) => category === value);
}
