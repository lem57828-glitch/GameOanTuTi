/** Ghép lớp CSS, bỏ giá trị rỗng. */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

/** Lớp focus dùng chung: viền cam rõ khi dùng bàn phím. */
export const focusRing = 'focus-visible:outline-none focus-visible:shadow-focus';
