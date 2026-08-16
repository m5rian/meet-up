/**
 * Profile picture handling: resize any uploaded image to 32×32 and store it as
 * a base64 data URL in the DB (ARCHITECTURE.md §2 — only the 32×32 size is kept).
 */
import sharp from 'sharp';
import type { Result } from '$lib/result';
import { err, ok } from '$lib/result';

export type PictureError =
	'not_an_image' | 'too_large' | 'unsupported_format' | 'processing_failed';

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB upload cap

/**
 * Resize an uploaded image buffer to a 32×32 PNG data URL. Returns null when
 * the buffer is empty (no file provided).
 */
export async function resizeProfilePicture(
	buffer: Buffer
): Promise<Result<string | null, PictureError>> {
	if (buffer.length === 0) return ok(null);
	if (buffer.length > MAX_BYTES) return err('too_large');

	let resized: Buffer;
	try {
		resized = await sharp(buffer)
			.resize(32, 32, { fit: 'cover', position: 'centre' })
			.png()
			.toBuffer();
	} catch {
		return err('not_an_image');
	}

	return ok(`data:image/png;base64,${resized.toString('base64')}`);
}
