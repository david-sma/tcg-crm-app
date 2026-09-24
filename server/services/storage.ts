import {
  GetObjectCommand,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
  type GetObjectCommandOutput,
} from '@aws-sdk/client-s3';
import {
  SHIFT_PHOTO_MAX_EDGE_PX,
  SHIFT_PHOTO_WEBP_QUALITY,
  ShiftPhotoValidationError,
  compressShiftPhotoForStorage,
} from './image.ts';

function readStorageSetting(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

const STORAGE_ENDPOINT = readStorageSetting('SUPABASE_S3_ENDPOINT');
const STORAGE_REGION = readStorageSetting('SUPABASE_S3_REGION');
const STORAGE_ACCESS_KEY_ID = readStorageSetting('SUPABASE_S3_ACCESS_KEY_ID');
const STORAGE_SECRET_ACCESS_KEY = readStorageSetting('SUPABASE_S3_SECRET_ACCESS_KEY');
const BUCKET_NAME = readStorageSetting('SUPABASE_S3_BUCKET');
const FORCE_PATH_STYLE = (process.env.SUPABASE_S3_FORCE_PATH_STYLE ?? 'true').trim().toLowerCase();

let objectStorageClient: S3Client | null = null;

export function getStorageClient(): S3Client {
  if (!objectStorageClient) {
    const missing = [
      ['SUPABASE_S3_ENDPOINT', STORAGE_ENDPOINT],
      ['SUPABASE_S3_REGION', STORAGE_REGION],
      ['SUPABASE_S3_ACCESS_KEY_ID', STORAGE_ACCESS_KEY_ID],
      ['SUPABASE_S3_SECRET_ACCESS_KEY', STORAGE_SECRET_ACCESS_KEY],
      ['SUPABASE_S3_BUCKET', BUCKET_NAME],
    ]
      .filter(([, value]) => !value)
      .map(([name]) => name);

    if (missing.length > 0) {
      throw new Error(`Missing required Supabase S3 configuration: ${missing.join(', ')}.`);
    }

    if (FORCE_PATH_STYLE !== 'true' && FORCE_PATH_STYLE !== 'false') {
      throw new Error('SUPABASE_S3_FORCE_PATH_STYLE must be either "true" or "false".');
    }

    objectStorageClient = new S3Client({
      region: STORAGE_REGION,
      endpoint: STORAGE_ENDPOINT,
      forcePathStyle: FORCE_PATH_STYLE === 'true',
      credentials: {
        accessKeyId: STORAGE_ACCESS_KEY_ID as string,
        secretAccessKey: STORAGE_SECRET_ACCESS_KEY as string,
      },
    });
  }

  return objectStorageClient;
}

export async function uploadShiftPhoto(params: {
  userId: string;
  shiftDate: string; // YYYY-MM-DD
  photoType: 'clock_in' | 'clock_out' | 'arrival' | 'leaving' | 'closing' | string;
  base64Data: string;
}): Promise<string> {
  const { userId, shiftDate, photoType, base64Data } = params;

  if (!base64Data || !base64Data.startsWith('data:image/')) {
    return base64Data;
  }

  try {
    const compressed = await compressShiftPhotoForStorage(base64Data);
    const destinationPath = `shift-photos/${shiftDate}/${userId}-${photoType}-${Date.now()}.${compressed.extension}`;

    await getStorageClient().send(
      new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: destinationPath,
        Body: compressed.buffer,
        ContentType: compressed.contentType,
        CacheControl: 'private, max-age=31536000',
        Metadata: {
          'uploaded-by': userId,
          'shift-date': shiftDate,
          'photo-type': photoType,
          'compression-profile': `webp-q${SHIFT_PHOTO_WEBP_QUALITY}-max${SHIFT_PHOTO_MAX_EDGE_PX}`,
          'original-bytes': String(compressed.originalBytes),
          'original-format': compressed.originalFormat,
        },
      }),
    );

    console.log(
      `Successfully uploaded ${photoType} photo to Supabase S3: s3://${BUCKET_NAME}/${destinationPath} (${compressed.originalBytes} -> ${compressed.buffer.length} bytes)`,
    );

    return `s3://${BUCKET_NAME}/${destinationPath}`;
  } catch (error) {
    if (error instanceof ShiftPhotoValidationError) {
      throw error;
    }

    console.error('Error uploading photo to Supabase S3:', error);
    return base64Data;
  }
}

async function readObjectBody(body: GetObjectCommandOutput['Body']): Promise<Buffer> {
  if (!body) {
    throw new Error('Supabase S3 response did not include a photo body.');
  }

  const maybeStream = body as { transformToByteArray?: () => Promise<Uint8Array> };
  if (typeof maybeStream.transformToByteArray === 'function') {
    return Buffer.from(await maybeStream.transformToByteArray());
  }

  if (body instanceof Uint8Array) {
    return Buffer.from(body);
  }

  if (body instanceof Blob) {
    return Buffer.from(await body.arrayBuffer());
  }

  throw new Error('Unsupported Supabase S3 photo body type.');
}

export async function getPhotoBufferFromStorage(
  storageRef: string,
): Promise<{ buffer: Buffer; contentType: string } | null> {
  try {
    if (!storageRef.startsWith('s3://')) {
      return null;
    }

    const withoutScheme = storageRef.slice('s3://'.length);
    const separatorIndex = withoutScheme.indexOf('/');
    if (separatorIndex < 0) {
      return null;
    }

    const bucketName = withoutScheme.slice(0, separatorIndex);
    const filePath = withoutScheme.slice(separatorIndex + 1);
    if (!bucketName || !filePath) {
      return null;
    }

    const response = await getStorageClient().send(
      new GetObjectCommand({
        Bucket: bucketName,
        Key: filePath,
      }),
    );

    return {
      buffer: await readObjectBody(response.Body),
      contentType: response.ContentType || 'image/webp',
    };
  } catch (error) {
    if (error instanceof NoSuchKey) {
      return null;
    }

    console.error('Error downloading photo from Supabase S3:', error);
    return null;
  }
}
