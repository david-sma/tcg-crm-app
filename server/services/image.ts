import sharp from 'sharp';

export const SHIFT_PHOTO_MAX_EDGE_PX = 1600;
export const SHIFT_PHOTO_WEBP_QUALITY = 72;
const SUPPORTED_SHIFT_PHOTO_FORMATS = new Set(['jpeg', 'png', 'webp']);

export class ShiftPhotoValidationError extends Error {
  status = 400;
  code = 'UNSUPPORTED_SHIFT_PHOTO';

  constructor(message = 'Photo must be a JPEG, PNG, or WebP image.') {
    super(message);
    this.name = 'ShiftPhotoValidationError';
  }
}

export interface CompressedShiftPhoto {
  buffer: Buffer;
  contentType: string;
  extension: string;
  originalBytes: number;
  originalFormat: string;
  width: number;
  height: number;
}

export async function compressShiftPhotoForStorage(base64Data: string): Promise<CompressedShiftPhoto> {
  const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
  if (!matches) {
    throw new ShiftPhotoValidationError('Photo must be a valid base64-encoded image.');
  }

  const imageBuffer = Buffer.from(matches[2], 'base64');
  const input = sharp(imageBuffer, { failOn: 'warning' });
  const metadata = await input.metadata().catch(() => {
    throw new ShiftPhotoValidationError('Photo must be a JPEG, PNG, or WebP image.');
  });

  if (!metadata.format || !SUPPORTED_SHIFT_PHOTO_FORMATS.has(metadata.format)) {
    throw new ShiftPhotoValidationError('Photo must be a JPEG, PNG, or WebP image.');
  }

  const { data, info } = await input
    .rotate()
    .resize({
      width: SHIFT_PHOTO_MAX_EDGE_PX,
      height: SHIFT_PHOTO_MAX_EDGE_PX,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: SHIFT_PHOTO_WEBP_QUALITY })
    .toBuffer({ resolveWithObject: true });

  return {
    buffer: Buffer.from(data),
    contentType: 'image/webp',
    extension: 'webp',
    originalBytes: imageBuffer.length,
    originalFormat: metadata.format,
    width: info.width,
    height: info.height,
  };
}

export interface CompressedPhotoBuffer {
  buffer: Buffer;
  contentType: string;
  extension: string;
}

/**
 * Buffer-based compression for job media photos.
 * Same storage profile as compressShiftPhotoForStorage: max edge 1600, WebP q72,
 * EXIF rotation, no enlargement. Accepts JPEG/PNG/WebP input buffers only.
 */
export async function compressPhotoBufferForStorage(inputBuffer: Buffer): Promise<CompressedPhotoBuffer> {
  if (!Buffer.isBuffer(inputBuffer) || inputBuffer.length === 0) {
    throw new ShiftPhotoValidationError('Photo must be a valid image buffer.');
  }

  const input = sharp(inputBuffer, { failOn: 'warning' });
  const metadata = await input.metadata().catch(() => {
    throw new ShiftPhotoValidationError('Photo must be a JPEG, PNG, or WebP image.');
  });

  if (!metadata.format || !SUPPORTED_SHIFT_PHOTO_FORMATS.has(metadata.format)) {
    throw new ShiftPhotoValidationError('Photo must be a JPEG, PNG, or WebP image.');
  }

  const { data } = await input
    .rotate()
    .resize({
      width: SHIFT_PHOTO_MAX_EDGE_PX,
      height: SHIFT_PHOTO_MAX_EDGE_PX,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: SHIFT_PHOTO_WEBP_QUALITY })
    .toBuffer({ resolveWithObject: true });

  return {
    buffer: Buffer.from(data),
    contentType: 'image/webp',
    extension: 'webp',
  };
}
