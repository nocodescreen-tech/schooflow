import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { authenticateToken } from '../middleware/auth.js';
import { requireRole, requirePermission } from '../middleware/rbac.js';
import {
  getAuthenticationParameters,
  isImageKitConfigured,
  getUrlEndpoint,
  storePhoto,
} from '../services/imagekit.js';
import { logAudit } from '../middleware/auditLog.js';

const router = Router();

// GET /upload/status - public config state (no secrets exposed).
// Defined BEFORE authentication so monitoring can reach it.
router.get('/status',
  async (_req: Request, res: Response) => {
    return res.json({
      success: true,
      data: { imagekit: isImageKitConfigured(), urlEndpoint: getUrlEndpoint() },
    });
  }
);

router.use(authenticateToken);

const UPLOAD_ROLES = ['super_admin', 'admin', 'director', 'teacher', 'accountant', 'receptionist'] as const;

// Ensure uploads directory exists
const uploadsDir = path.resolve(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Allowed MIME types
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

// Multer storage configuration
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (_req, file, cb) => {
    const uniqueName = `${uuidv4()}${path.extname(file.originalname).toLowerCase()}`;
    cb(null, uniqueName);
  },
});

// File filter for validation
const fileFilter = (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only JPG, PNG, and WEBP are allowed.'));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE, files: 10 },
});

// GET /upload/auth - ImageKit client-side upload signature.
// The private key never leaves the server: only token/expire/signature
// are exposed, and the caller must still be authenticated.
router.get('/auth',
  async (req: Request, res: Response) => {
    try {
      const params = await getAuthenticationParameters();
      if (!params) {
        return res.status(503).json({ success: false, error: 'ImageKit non configuré' });
      }
      return res.json({ success: true, data: params });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

// POST /upload/imagekit - server-side proxy upload to ImageKit.
// The file transits through the server (validated, size-limited) so the
// private key and folder policy stay server-side. Falls back to local
// storage when ImageKit is not configured.
router.post('/imagekit',
  requireRole(...UPLOAD_ROLES),
  requirePermission('documents', 'view'),
  upload.single('file'),
  async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, error: 'No file uploaded' });
      }
      const kind = (['students', 'teachers', 'users', 'schools', 'documents', 'signatures'] as const)
        .includes(req.body.kind) ? req.body.kind : 'documents';
      const url = await storePhoto(
        req.file.path,
        req.file.originalname,
        req.user!.schoolId!,
        kind,
        req.body.refId || undefined
      );

      await logAudit(req, {
        action: 'upload',
        entity: 'photo',
        details: { file: req.file.originalname, url, provider: url.startsWith('http') ? 'imagekit' : 'local' },
      });

      return res.status(201).json({
        success: true,
        data: {
          file: {
            originalName: req.file.originalname,
            mimetype: req.file.mimetype,
            size: req.file.size,
            url,
            provider: url.startsWith('http') ? 'imagekit' : 'local',
          },
        },
      });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

// POST /upload - Single file upload
router.post('/',
  requireRole(...UPLOAD_ROLES),
  requirePermission('documents', 'view'),
  upload.single('file'),
  async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, error: 'No file uploaded' });
      }

      const fileUrl = `/uploads/${req.file.filename}`;
      return res.status(201).json({
        success: true,
        data: {
          file: {
            originalName: req.file.originalname,
            filename: req.file.filename,
            mimetype: req.file.mimetype,
            size: req.file.size,
            url: fileUrl,
          },
        },
      });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

// POST /upload/multiple - Multiple file upload
router.post('/multiple',
  requireRole(...UPLOAD_ROLES),
  requirePermission('documents', 'view'),
  upload.array('files', 10),
  async (req: Request, res: Response) => {
    try {
      const files = req.files as Express.Multer.File[] | undefined;
      if (!files || files.length === 0) {
        return res.status(400).json({ success: false, error: 'No files uploaded' });
      }

      const uploadedFiles = files.map((file) => ({
        originalName: file.originalname,
        filename: file.filename,
        mimetype: file.mimetype,
        size: file.size,
        url: `/uploads/${file.filename}`,
      }));

      return res.status(201).json({
        success: true,
        data: { files: uploadedFiles },
      });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

export default router;
