/**
 * ImageKit configuration for photo uploads.
 * The backend proxies uploads to ImageKit via /api/v1/upload/auth.
 */
export const imagekitConfig = {
  publicKey: 'public_E4LX5ovk47iM7qTWWObohsqR9cQ=',
  urlEndpoint: 'https://ik.imagekit.io/fq9jsb8rr',
  // NOTE: '/api' prefix — Vite rewrites it to /api/v1 toward the backend.
  authenticationEndpoint: '/api/upload/auth',
  proxyUploadEndpoint: '/api/upload/imagekit',
};

export interface ImageKitAuthParams {
  token: string;
  expire: number;
  signature: string;
}

/**
 * Fetch upload auth params from the backend.
 * Falls back to empty strings when the backend is unreachable
 * so the UI can still show a meaningful error.
 */
export async function getUploadAuthParams(): Promise<ImageKitAuthParams> {
  try {
    const response = await fetch(imagekitConfig.authenticationEndpoint, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('schoolflow_token') ?? ''}`,
      },
    });
    if (!response.ok) throw new Error(`Auth failed: ${response.status}`);
    return (await response.json()) as ImageKitAuthParams;
  } catch {
    return { token: '', expire: 0, signature: '' };
  }
}

/**
 * Build a public ImageKit URL for a given path.
 */
export function getImageKitUrl(path: string, transformation?: string): string {
  const base = imagekitConfig.urlEndpoint.replace(/\/$/, '');
  const cleanPath = path.replace(/^\//, '');
  return transformation
    ? `${base}/${transformation}/${cleanPath}`
    : `${base}/${cleanPath}`;
}
