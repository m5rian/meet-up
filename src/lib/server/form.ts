/**
 * Safe extraction of text values from a FormData object.
 *
 * `form.get()` returns `FormDataEntryValue | null` (string | File | null).
 * Using `String()` on that can hit a File's default stringification, so we
 * narrow to strings explicitly.
 */
export function getFormString(form: FormData, name: string): string {
	const value = form.get(name);
	return typeof value === 'string' ? value : '';
}
