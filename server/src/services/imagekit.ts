import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// Lazily required so the server boots even if the SDK is missing.
type ImageKitClient = {
  upload: (opts: {
    file: Buffer;
    fileName: string;
    folder?: string;
    useUniqueFileName?: boolean;
  }) => Promise<{ url: string; fileId: string; filePath: string }>;
  getAuthenticationParameters: (
    token?: string,
    expire?: number
  ) => { token: string; expire: number; signature: string };
};

let cachedClient: Promise<ImageKitClient | null> | undefined;

/**
 * Loads the ImageKit SDK.
 *
 * The SDK is CommonJS while this project is ESM, so it must be loaded with a
 * dynamic `import()` — a bare `require()` throws `require is not defined` under
 * ESM, which is why the integration silently reported "not configured" even
 * once the keys were present. The promise is cached so the module is imported
 * once per process.
 */
async function loadClient(): Promise<ImageKitClient | null> {
  if (cachedClient !== undefined) return cachedClient;

  const publicKey = process.env.IMAGEKIT_PUBLIC_KEY || '';
  const privateKey = process.env.IMAGEKIT_PRIVATE_KEY || '';
  const urlEndpoint =
    process.env.IMAGEKIT_URL_ENDPOINT || 'https://ik.imagekit.io/fq9jsb8rr';

  if (!publicKey || !privateKey) {
    cachedClient = Promise.resolve(null);
    return cachedClient;
  }

  try {
    // The SDK is CJS; default interop gives us the constructor.
    const mod = await import('imagekit');
    const ImageKit = (mod as { default?: unknown }).default ?? mod;
    cachedClient = Promise.resolve(
      new (ImageKit as new (opts: {
        publicKey: string;
        privateKey: string;
        urlEndpoint: string;
      }) => ImageKitClient)({ publicKey, privateKey, urlEndpoint })
    );
  } catch {
    cachedClient = Promise.resolve(null);
  }
  return cachedClient;
}

/**
 * Whether the credentials are present.
 *
 * This is a configuration check, not a network check: it answers "are the keys
 * set?", which is what the status endpoint and the upload fallback need. It
 * deliberately does not import the SDK, so it stays synchronous and cheap.
 */
export function isImageKitConfigured(): boolean {
  return Boolean(process.env.IMAGEKIT_PUBLIC_KEY && process.env.IMAGEKIT_PRIVATE_KEY);
}

export function getUrlEndpoint(): string {
  return (
    process.env.IMAGEKIT_URL_ENDPOINT || 'https://ik.imagekit.io/fq9jsb8rr'
  ).replace(/\/$/, '');
}

/**
 * Upload params for browser-side uploads. The private key never leaves
 * the server: only token/expire/signature go to the client.
 */
export async function getAuthenticationParameters(): Promise<{
  token: string;
  expire: number;
  signature: string;
} | null> {
  const client = await loadClient();
  if (!client) return null;
  const token = crypto.randomBytes(16).toString('hex');
  const expire = Math.floor(Date.now() / 1000) + 30 * 60; // 30 min
  return client.getAuthenticationParameters(token, expire);
}

export type ImageKind =
  | 'students'
  | 'teachers'
  | 'users'
  | 'schools'
  | 'documents'
  | 'signatures';

export function folderFor(schoolId: string, kind: ImageKind, refId?: string): string {
  const base = `/schoolflow/${schoolId}/${kind}`;
  return refId ? `${base}/${refId}` : base;
}

export async function uploadToImageKit(
  localPath: string,
  fileName: string,
  schoolId: string,
  kind: ImageKind,
  refId?: string
): Promise<{ url: string; fileId: string; filePath: string } | null> {
  const client = await loadClient();
  if (!client) return null;
  const buffer = fs.readFileSync(localPath);
  return client.upload({
    file: buffer,
    fileName,
    folder: folderFor(schoolId, kind, refId),
    useUniqueFileName: true,
  });
}

/**
 * Store an uploaded photo: ImageKit when configured (local temp file
 * removed afterwards), otherwise the local /uploads path.
 * Never throws for ImageKit failures — falls back to local storage.
 */
export async function storePhoto(
  localPath: string,
  originalName: string,
  schoolId: string,
  kind: ImageKind,
  refId?: string
): Promise<string> {
  try {
    const uploaded = await uploadToImageKit(localPath, originalName, schoolId, kind, refId);
    if (uploaded?.url) {
      fs.promises.unlink(localPath).catch(() => undefined);
      return uploaded.url;
    }
  } catch {
    // fall through to local storage
  }
  return `/uploads/${path.basename(localPath)}`;
}
