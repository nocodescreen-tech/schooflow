import { Router, Request, Response } from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { AppError } from '../middleware/errorHandler.js';
import { User } from '../models/index.js';
import { WorkspaceService } from '../services/WorkspaceService.js';
import { getWorkspace } from '../utils/workspaces.js';

const router = Router();
router.use(authenticateToken);

/**
 * GET /workspace — the single source of truth for the client's shell.
 *
 * Returns the active workspace, every workspace the user could switch to, and
 * the navigation already filtered by module + permission + workspace. The
 * client renders what it is given; it never decides visibility itself.
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const user = await User.findByPk(req.user!.id, { attributes: ['id', 'role', 'schoolId', 'name', 'email'] });
    if (!user) throw new AppError('Utilisateur introuvable', 404);
    const preferred = (req.query.workspace as string) || null;
    const context = await WorkspaceService.resolve(user, preferred);
    return res.json({ success: true, data: context });
  } catch (error) {
    if (error instanceof AppError) return res.status(error.statusCode).json({ success: false, error: error.message });
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/** GET /workspace/available — just the switcher entries. */
router.get('/available', async (req: Request, res: Response) => {
  try {
    const user = await User.findByPk(req.user!.id, { attributes: ['id', 'role', 'schoolId'] });
    if (!user) throw new AppError('Utilisateur introuvable', 404);
    const available = await WorkspaceService.listAvailable(user);
    return res.json({ success: true, data: { available } });
  } catch (error) {
    if (error instanceof AppError) return res.status(error.statusCode).json({ success: false, error: error.message });
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/** POST /workspace/switch — changes the presentation only, never the rights. */
router.post('/switch', async (req: Request, res: Response) => {
  try {
    const { workspace } = req.body as { workspace?: string };
    if (!workspace) return res.status(400).json({ success: false, error: 'Espace requis' });
    const def = getWorkspace(workspace);
    if (!def) return res.status(404).json({ success: false, error: 'Espace inconnu' });
    const user = await User.findByPk(req.user!.id, { attributes: ['id', 'role', 'schoolId'] });
    if (!user) throw new AppError('Utilisateur introuvable', 404);
    const allowed = await WorkspaceService.canEnter(user, workspace);
    if (!allowed) {
      return res.status(403).json({ success: false, error: `Espace « ${def.name} » indisponible pour votre profil` });
    }
    const context = await WorkspaceService.resolve(user, workspace);
    return res.json({ success: true, data: context });
  } catch (error) {
    if (error instanceof AppError) return res.status(error.statusCode).json({ success: false, error: error.message });
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

export default router;
