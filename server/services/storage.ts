import { Storage } from '@google-cloud/storage';
import path from 'path';

// Google Cloud Storage Configuration
const DEFAULT_BUCKET_NAME = 'tcg-crm-storage-526879544724';
const BUCKET_NAME = process.env.GCS_BUCKET_NAME || DEFAULT_BUCKET_NAME;

// Fallback embedded credentials provided by the admin for Auckland operations
const DEFAULT_GCS_CREDENTIALS = {
  type: 'service_account',
  project_id: 'xny3-484001',
  private_key_id: '***REMOVED***',
  private_key:
    '***REMOVED_PRIVATE_KEY***',
  client_email: 'tcg-crm-ai-studio@xny3-484001.iam.gserviceaccount.com',
  client_id: '***REMOVED***',
};

let storageClient: Storage | null = null;

/**
 * Lazy initialization of Google Cloud Storage Client
 */
export function getStorageClient(): Storage {
  if (!storageClient) {
    if (process.env.GCS_SERVICE_ACCOUNT_JSON) {
      try {
        const credentials = JSON.parse(process.env.GCS_SERVICE_ACCOUNT_JSON);
        storageClient = new Storage({
          projectId: credentials.project_id,
          credentials: {
            client_email: credentials.client_email,
            private_key: credentials.private_key,
          },
        });
        return storageClient;
      } catch (e) {
        console.warn('Failed to parse GCS_SERVICE_ACCOUNT_JSON env var, falling back');
      }
    }

    if (DEFAULT_GCS_CREDENTIALS?.client_email && DEFAULT_GCS_CREDENTIALS?.private_key) {
      try {
        storageClient = new Storage({
          projectId: DEFAULT_GCS_CREDENTIALS.project_id,
          credentials: {
            client_email: DEFAULT_GCS_CREDENTIALS.client_email,
            private_key: DEFAULT_GCS_CREDENTIALS.private_key,
          },
        });
        return storageClient;
      } catch (err) {
        console.warn('Failed initializing GCS with default credentials, falling back to ADC:', err);
      }
    }

    // Fallback to Google Cloud Application Default Credentials (ADC) for standard Cloud Run
    storageClient = new Storage();
  }
  return storageClient;
}

/**
 * Uploads a base64 encoded photo to Google Cloud Storage
 * Returns a secure storage path (or fallback data URI if upload fails)
 */
export async function uploadShiftPhoto(params: {
  userId: string;
  shiftDate: string; // YYYY-MM-DD
  photoType: 'clock_in' | 'clock_out';
  base64Data: string;
}): Promise<string> {
  const { userId, shiftDate, photoType, base64Data } = params;

  if (!base64Data || !base64Data.startsWith('data:image/')) {
    // If it's already a URL or empty, return as is
    return base64Data;
  }

  try {
    const storage = getStorageClient();
    const bucket = storage.bucket(BUCKET_NAME);

    // Extract format and raw binary buffer from Base64
    const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      return base64Data;
    }

    const contentType = matches[1] || 'image/jpeg';
    const extension = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg';
    const imageBuffer = Buffer.from(matches[2], 'base64');

    // Secure object path inside private GCS bucket
    // E.g.: shift-photos/2026-08-31/user-123-clock_in-1725148000.jpg
    const destinationPath = `shift-photos/${shiftDate}/${userId}-${photoType}-${Date.now()}.${extension}`;
    const file = bucket.file(destinationPath);

    // Upload with appropriate metadata
    await file.save(imageBuffer, {
      contentType,
      resumable: false,
      metadata: {
        cacheControl: 'private, max-age=31536000',
        metadata: {
          uploadedBy: userId,
          shiftDate,
          photoType,
        },
      },
    });

    console.log(`Successfully uploaded ${photoType} photo to GCS: gs://${BUCKET_NAME}/${destinationPath}`);

    // Return the GCS path reference
    return `gcs://${BUCKET_NAME}/${destinationPath}`;
  } catch (error) {
    console.error('Error uploading photo to Google Cloud Storage:', error);
    // Return original base64 as safe fallback so user workflow is never interrupted
    return base64Data;
  }
}

/**
 * Downloads a photo stream/buffer from Google Cloud Storage
 */
export async function getPhotoBufferFromGCS(gcsUri: string): Promise<{ buffer: Buffer; contentType: string } | null> {
  try {
    const storage = getStorageClient();
    let bucketName = BUCKET_NAME;
    let filePath = '';

    if (gcsUri.startsWith('gcs://')) {
      const parts = gcsUri.replace('gcs://', '').split('/');
      bucketName = parts[0];
      filePath = parts.slice(1).join('/');
    } else {
      filePath = gcsUri;
    }

    const bucket = storage.bucket(bucketName);
    const file = bucket.file(filePath);

    const [exists] = await file.exists();
    if (!exists) {
      return null;
    }

    const [metadata] = await file.getMetadata();
    const [contents] = await file.download();

    return {
      buffer: contents,
      contentType: metadata.contentType || 'image/jpeg',
    };
  } catch (error) {
    console.error('Error downloading photo from GCS:', error);
    return null;
  }
}

/**
 * Generates a short-lived secure signed URL for direct viewing (valid for 30 minutes)
 */
export async function getSignedPhotoUrl(gcsUri: string, expiresInMinutes = 30): Promise<string | null> {
  if (!gcsUri || !gcsUri.startsWith('gcs://')) {
    return gcsUri; // Return as is if already a public URL or data URI
  }

  try {
    const storage = getStorageClient();
    const parts = gcsUri.replace('gcs://', '').split('/');
    const bucketName = parts[0];
    const filePath = parts.slice(1).join('/');

    const bucket = storage.bucket(bucketName);
    const file = bucket.file(filePath);

    const [url] = await file.getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + expiresInMinutes * 60 * 1000,
    });

    return url;
  } catch (error) {
    console.error('Error generating signed URL for GCS photo:', error);
    return null;
  }
}
