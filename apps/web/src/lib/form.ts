/**
 * A text field from a submitted form. FormData values can also be Files, so
 * anything that is not a string becomes '' instead of "[object File]".
 */
export function formString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}
