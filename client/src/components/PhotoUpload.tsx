import { useState, useRef, useCallback } from 'react';
import { Upload, X, Camera, Loader2 } from 'lucide-react';
import { useToastStore } from './Toast';
import { cn } from '../lib/utils';

interface PhotoUploadProps {
  currentPhoto?: string;
  onUpload: (file: File) => void;
  onRemove?: () => void;
  size?: 'sm' | 'md' | 'lg';
  label?: string;
  /** ImageKit folder kind + optional reference id for organization. */
  kind?: string;
  refId?: string;
  /**
   * When true, the component uploads itself through POST /upload/imagekit
   * and passes the final URL to onUploadedUrl. When false (default), it
   * only previews locally and hands the File to onUpload (the caller
   * uploads through its own endpoint, e.g. PATCH /students/:id/photo).
   */
  autoUpload?: boolean;
  onUploadedUrl?: (url: string) => void;
}

const sizes = {
  sm: 'w-16 h-16',
  md: 'w-24 h-24',
  lg: 'w-32 h-32',
};

export default function PhotoUpload({
  currentPhoto,
  onUpload,
  onRemove,
  size = 'md',
  label = 'Photo',
  kind = 'documents',
  refId,
  autoUpload = false,
  onUploadedUrl,
}: PhotoUploadProps) {
  const [preview, setPreview] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const addToast = useToastStore((s) => s.addToast);

  const uploadPhoto = useCallback(
    async (file: File) => {
      setIsUploading(true);
      setUploadProgress(0);

      try {
        // Server-side proxy: the file transits through the backend which
        // uploads to ImageKit (or local storage as fallback) and returns
        // the final URL. The private key never leaves the server.
        const formData = new FormData();
        formData.append('file', file);
        formData.append('kind', kind);
        if (refId) formData.append('refId', refId);

        const xhr = new XMLHttpRequest();

        xhr.upload.addEventListener('progress', (event) => {
          if (event.lengthComputable) {
            setUploadProgress(Math.round((event.loaded / event.total) * 100));
          }
        });

        const uploadResult = await new Promise<{ url: string; provider: string }>(
          (resolve, reject) => {
            xhr.addEventListener('load', () => {
              if (xhr.status >= 200 && xhr.status < 300) {
                try {
                  const body = JSON.parse(xhr.responseText);
                  const url = body?.data?.file?.url ?? '';
                  const provider = body?.data?.file?.provider ?? 'local';
                  if (!url) throw new Error('Réponse invalide du serveur');
                  resolve({ url, provider });
                } catch {
                  reject(new Error('Réponse invalide du serveur'));
                }
              } else {
                try {
                  const body = JSON.parse(xhr.responseText);
                  reject(new Error(body?.error ?? `Échec du téléversement (${xhr.status})`));
                } catch {
                  reject(new Error(`Échec du téléversement (${xhr.status})`));
                }
              }
            });
            xhr.addEventListener('error', () => reject(new Error('Erreur réseau pendant le téléversement')));
            const token = localStorage.getItem('schoolflow_token') ?? '';
            xhr.open('POST', '/api/upload/imagekit');
            xhr.setRequestHeader('Authorization', `Bearer ${token}`);
            xhr.send(formData);
          }
        );

        setPreview(uploadResult.url);
        addToast(
          'success',
          uploadResult.provider === 'imagekit'
            ? 'Photo téléversée avec succès'
            : 'Photo enregistrée localement (ImageKit non configuré)'
        );
        onUploadedUrl?.(uploadResult.url);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Échec du téléversement';
        addToast('error', message);
      } finally {
        setIsUploading(false);
        setUploadProgress(0);
      }
    },
    [addToast, onUpload, kind, refId]
  );

  const handleFileSelect = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      addToast('error', 'Veuillez sélectionner un fichier image');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      addToast('error', "L'image ne doit pas dépasser 5 Mo");
      return;
    }

    // Show local preview immediately
    const reader = new FileReader();
    reader.onload = (e) => {
      setPreview(e.target?.result as string);
    };
    reader.readAsDataURL(file);

    // Hand the file to the caller (its endpoint stores it via
    // ImageKit or local fallback), unless autoUpload is enabled.
    onUpload(file);
    if (autoUpload) {
      uploadPhoto(file);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    handleFileSelect(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleRemove = () => {
    setPreview(null);
    onRemove?.();
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const displayPhoto = preview || currentPhoto;

  return (
    <div className="flex flex-col items-center gap-3">
      <div
        className={cn(
          'relative rounded-2xl overflow-hidden border-2 border-dashed transition-all cursor-pointer group',
          sizes[size],
          isDragging
            ? 'border-primary-500 bg-primary-50 dark:bg-primary-500/10'
            : 'border-border hover:border-primary-500/50 dark:border-white/20 dark:hover:border-primary-400/50',
          isUploading && 'pointer-events-none opacity-70'
        )}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => !isUploading && fileInputRef.current?.click()}
      >
        {isUploading ? (
          <div className="w-full h-full flex flex-col items-center justify-center text-primary-500 gap-1">
            <Loader2 className="w-6 h-6 animate-spin" />
            <span className="text-xs font-medium">{uploadProgress}%</span>
          </div>
        ) : displayPhoto ? (
          <>
            <img
              src={displayPhoto}
              alt={label}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <Camera className="w-6 h-6 text-white" />
            </div>
          </>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-muted dark:text-gray-500 gap-1">
            <Upload className="w-6 h-6" />
            <span className="text-xs font-medium">Cliquer ou glisser</span>
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => handleFileSelect(e.target.files?.[0])}
        />
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          className="text-xs text-primary-500 hover:text-primary-600 dark:text-primary-400 dark:hover:text-primary-300 font-medium disabled:opacity-50"
        >
          {displayPhoto ? 'Changer la photo' : 'Téléverser une photo'}
        </button>
        {displayPhoto && onRemove && (
          <>
            <span className="text-xs text-muted dark:text-gray-500">·</span>
            <button
              type="button"
              onClick={handleRemove}
              disabled={isUploading}
              className="text-xs text-danger hover:text-red-600 dark:text-red-400 font-medium flex items-center gap-1 disabled:opacity-50"
            >
              <X className="w-3 h-3" />
              Supprimer
            </button>
          </>
        )}
      </div>
    </div>
  );
}
