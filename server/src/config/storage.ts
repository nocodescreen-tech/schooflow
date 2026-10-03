import path from 'path';
import fs from 'fs';

export interface StorageConfig {
  provider: 'local' | 's3';
  localUploadsDir: string;
  s3?: {
    bucket: string;
    region: string;
    accessKey: string;
    secretKey: string;
  };
}

function getStorageConfig(): StorageConfig {
  const localUploadsDir = path.resolve(process.cwd(), 'uploads');

  // Ensure local uploads directory exists
  if (!fs.existsSync(localUploadsDir)) {
    fs.mkdirSync(localUploadsDir, { recursive: true });
  }

  const s3Bucket = process.env.S3_BUCKET;
  const s3Region = process.env.S3_REGION;
  const s3AccessKey = process.env.S3_ACCESS_KEY;
  const s3SecretKey = process.env.S3_SECRET_KEY;

  const hasS3 = Boolean(s3Bucket && s3Region && s3AccessKey && s3SecretKey);

  if (hasS3) {
    return {
      provider: 's3',
      localUploadsDir,
      s3: {
        bucket: s3Bucket!,
        region: s3Region!,
        accessKey: s3AccessKey!,
        secretKey: s3SecretKey!,
      },
    };
  }

  return {
    provider: 'local',
    localUploadsDir,
  };
}

const storageConfig = getStorageConfig();

export default storageConfig;
