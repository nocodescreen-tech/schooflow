import { Fragment, useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Type, Minus, Square, Squircle, Table2, TableProperties, Receipt, CalendarDays, Hash, Plus, Save, Copy, Trash2,
  Download, Printer, Search, ZoomIn, ZoomOut, X, FileText, Undo2, Redo2,
  Image as ImageIcon, Archive, RotateCcw, Eye, Loader2, Check, AlertTriangle,
  Send, List, ChevronLeft, Pencil, Layers, BookMarked, QrCode, ClipboardList,
} from 'lucide-react';
import api from '../lib/api';
import Modal from '../components/Modal';
import PageTransition from '../components/PageTransition';
import { useToastStore } from '../components/Toast';
import { cn } from '../lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ElementType =
  | 'text'
  | 'dynamic_field'
  | 'divider'
  | 'rectangle'
  | 'rounded_frame'
  | 'table'
  | 'grades_table'
  | 'grades_table_rdc'
  | 'id_boxes'
  | 'qr_code'
  | 'fees_table'
  | 'date'
  | 'page_number'
  | 'image';

// Types d'éléments connus — les types inconnus reçus du backend sont ignorés au rendu.
const KNOWN_ELEMENT_TYPES: ReadonlySet<string> = new Set([
  'text',
  'dynamic_field',
  'divider',
  'rectangle',
  'rounded_frame',
  'table',
  'grades_table',
  'grades_table_rdc',
  'id_boxes',
  'qr_code',
  'fees_table',
  'date',
  'page_number',
  'image',
]);

type Align = 'left' | 'center' | 'right' | 'justify';

interface DocElement {
  id: string;
  type: ElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  content?: string;
  field?: string;
  src?: string;
  fontSize?: number;
  color?: string;
  align?: Align;
  bold?: boolean;
  rows?: string[][];
  borderWidth?: number;
  borderColor?: string;
  backgroundColor?: string;
  radius?: number;
}

interface TemplateSchema {
  elements: DocElement[];
}

interface Template {
  id: string;
  name: string;
  description?: string | null;
  category: string;
  format: string;
  orientation: string;
  version: number;
  status: 'brouillon' | 'actif' | 'archive';
  schema?: TemplateSchema | null;
  createdAt?: string;
  updatedAt?: string;
}

interface StudentLite {
  id: string;
  firstName: string;
  lastName: string;
  studentId?: string;
  gender?: string;
  dateOfBirth?: string;
  class?: { id?: string; name?: string } | null;
}

interface ClassLite {
  id: string;
  name: string;
  level?: string;
}

interface SchoolInfo {
  name?: string;
  address?: string;
  phone?: string;
  email?: string;
  logo?: string;
  academicYear?: string;
  director?: string;
}

interface GeneratedDoc {
  id: string;
  title?: string | null;
  documentType: string;
  status: string;
  createdAt: string;
  student?: { id: string; firstName: string; lastName: string } | null;
  template?: { id: string; name: string; category: string } | null;
}

// Lignes d'aperçu (remplissage automatique) — champs lus de façon défensive,
// les champs manquants donnent des états vides plutôt qu'une erreur.
interface PreviewGrade {
  id?: string;
  subjectId?: string;
  score?: number | string;
  coefficient?: number | string;
  term?: number | string;
  subject?: { id?: string; name?: string; department?: string | null } | null;
}

interface PreviewFee {
  id?: string;
  type?: string;
  amount?: number | string;
  totalAmount?: number | string;
  paidAmount?: number | string;
  dueDate?: string;
  status?: string;
}

const FEE_TYPE_LABELS: Record<string, string> = {
  tuition: 'Scolarité',
  registration: 'Inscription',
  exam: 'Examen',
  transport: 'Transport',
  canteen: 'Cantine',
  uniform: 'Uniforme',
  other: 'Autre',
};

const FEE_STATUS_LABELS: Record<string, string> = {
  paid: 'Payé',
  pending: 'En attente',
  partial: 'Partiel',
  overdue: 'En retard',
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CATEGORIES: { id: string; label: string }[] = [
  { id: 'bulletin', label: 'Bulletin' },
  { id: 'certificat', label: 'Certificat' },
  { id: 'billet_vacances', label: 'Billet de vacances' },
  { id: 'avis_parents', label: 'Avis aux parents' },
  { id: 'document_administratif', label: 'Administratif' },
  { id: 'financier', label: 'Financier' },
  { id: 'autre', label: 'Autre' },
];

const PAGE_SIZES: Record<string, { w: number; h: number }> = {
  A4: { w: 595, h: 842 },
  A5: { w: 420, h: 595 },
  A6: { w: 298, h: 420 },
  Letter: { w: 612, h: 792 },
  Legal: { w: 612, h: 1008 },
  custom: { w: 595, h: 842 },
};

const MARGIN = 40;

const uid = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;

const newElement = (type: ElementType, y = 60): DocElement => {
  const base: DocElement = {
    id: uid(),
    type,
    x: MARGIN,
    y,
    width: 300,
    height: 24,
  };
  switch (type) {
    case 'text':
      return { ...base, content: 'Nouveau texte', fontSize: 12, color: '#111827' };
    case 'dynamic_field':
      return { ...base, field: 'student.lastName', width: 200, fontSize: 12, color: '#111827', bold: false };
    case 'divider':
      return { ...base, width: 500, height: 1, borderWidth: 1, borderColor: '#94a3b8' };
    case 'rectangle':
      return { ...base, width: 200, height: 80, borderWidth: 1, borderColor: '#cbd5e1' };
    case 'rounded_frame':
      return { ...base, width: 200, height: 80, borderWidth: 1, borderColor: '#cbd5e1', radius: 18 };
    case 'table':
      return {
        ...base,
        width: 500,
        height: 90,
        rows: [
          ['Matière', 'Coefficient', 'Moyenne'],
          ['', '', ''],
          ['', '', ''],
        ],
        fontSize: 9,
        align: 'left',
      };
    case 'date':
      return { ...base, width: 200, height: 20, fontSize: 10, color: '#475569', align: 'right' };
    case 'page_number':
      return { ...base, x: 460, width: 90, height: 20, fontSize: 9, color: '#94a3b8', align: 'right' };
    case 'image':
      return { ...base, width: 120, height: 60 };
    case 'grades_table':
      return { ...base, width: 500, height: 140, fontSize: 9, borderWidth: 0.5, borderColor: '#cbd5e1' };
    case 'grades_table_rdc':
      return { ...base, width: 500, height: 180, fontSize: 9, borderWidth: 0.5, borderColor: '#cbd5e1' };
    case 'id_boxes':
      return { ...base, field: 'student.matricule', width: 260, height: 28, fontSize: 11 };
    case 'qr_code':
      return { ...base, width: 90, height: 90, borderWidth: 1, borderColor: '#cbd5e1' };
    case 'fees_table':
      return { ...base, width: 500, height: 120, fontSize: 9, borderWidth: 0.5, borderColor: '#cbd5e1' };
    default:
      return base;
  }
};

const PALETTE: { type: ElementType; label: string; icon: typeof Type }[] = [
  { type: 'text', label: 'Texte', icon: Type },
  { type: 'dynamic_field', label: 'Champ dynamique', icon: Hash },
  { type: 'divider', label: 'Ligne', icon: Minus },
  { type: 'rectangle', label: 'Rectangle', icon: Square },
  { type: 'rounded_frame', label: 'Cadre arrondi', icon: Squircle },
  { type: 'table', label: 'Tableau', icon: Table2 },
  { type: 'grades_table', label: 'Tableau des notes', icon: TableProperties },
  { type: 'grades_table_rdc', label: 'Tableau RDC (périodes)', icon: ClipboardList },
  { type: 'id_boxes', label: 'Boîtes ID', icon: Hash },
  { type: 'qr_code', label: 'QR vérification', icon: QrCode },
  { type: 'fees_table', label: 'Tableau des frais', icon: Receipt },
  { type: 'image', label: 'Image / logo', icon: ImageIcon },
  { type: 'date', label: 'Date', icon: CalendarDays },
  { type: 'page_number', label: 'N° de page', icon: FileText },
];

const FIELD_GROUPS: { group: string; fields: { path: string; label: string }[] }[] = [
  {
    group: 'Élève',
    fields: [
      { path: 'student.lastName', label: 'Nom' },
      { path: 'student.firstName', label: 'Prénom' },
      { path: 'student.matricule', label: 'Matricule' },
      { path: 'student.className', label: 'Classe' },
      { path: 'student.dateOfBirth', label: 'Date de naissance' },
      { path: 'student.gender', label: 'Sexe' },
    ],
  },
  {
    group: 'Établissement',
    fields: [
      { path: 'school.name', label: 'Nom de l’école' },
      { path: 'school.address', label: 'Adresse' },
      { path: 'school.phone', label: 'Téléphone' },
      { path: 'school.email', label: 'Email' },
      { path: 'school.year', label: 'Année scolaire' },
    ],
  },
  {
    group: 'Période',
    fields: [
      { path: 'period', label: 'Période active' },
      { path: 'date', label: 'Date du jour' },
    ],
  },
  {
    group: 'Scolarité',
    fields: [
      { path: 'absences', label: 'Absences' },
      { path: 'lates', label: 'Retards' },
      { path: 'period', label: 'Période' },
    ],
  },
];

const STATUS_LABEL: Record<string, string> = {
  brouillon: 'Brouillon',
  actif: 'Actif',
  archive: 'Archivé',
};

const STATUS_CLASS: Record<string, string> = {
  brouillon: 'badge badge-warning',
  actif: 'badge badge-success',
  archive: 'badge',
};

const TYPE_LABEL: Record<string, string> = {
  bulletin: 'Bulletin',
  certificat: 'Certificat',
  billet_vacances: 'Billet de vacances',
  avis_parents: 'Avis',
  document_administratif: 'Administratif',
  financier: 'Financier',
  autre: 'Autre',
};

// ---------------------------------------------------------------------------
// Field resolution (mirror of the backend renderer)
// ---------------------------------------------------------------------------

type Ctx = Record<string, unknown>;

function resolveField(str: string, ctx: Ctx): string {
  return str.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, key: string) => {
    const parts = key.split('.');
    let value: unknown = ctx;
    for (const part of parts) {
      if (value && typeof value === 'object') {
        value = (value as Record<string, unknown>)[part];
      } else {
        value = undefined;
        break;
      }
    }
    if (value === undefined || value === null) return '';
    return String(value);
  });
}

function formatDateFR(d: Date): string {
  return d.toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' });
}

function currentSchoolYear(): string {
  const now = new Date();
  const start = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  return `${start}-${start + 1}`;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function DocumentBuilder() {
  const navigate = useNavigate();
  const addToast = useToastStore((s) => s.addToast);
  const queryClient = useQueryClient();

  // --- Template selection / editor state -----------------------------------
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [elements, setElementsState] = useState<DocElement[]>([]);
  const elementsRef = useRef<DocElement[]>([]);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [history, setHistory] = useState<DocElement[][]>([]);
  const [future, setFuture] = useState<DocElement[][]>([]);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'dirty' | 'saving' | 'error'>('saved');
  const [zoom, setZoom] = useState(1);
  const [leftTab, setLeftTab] = useState<'templates' | 'elements' | 'fields'>('elements');
  const [view, setView] = useState<'editor' | 'generated'>('editor');
  const [templateSearch, setTemplateSearch] = useState('');
  const [previewStudentId, setPreviewStudentId] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [generateMode, setGenerateMode] = useState<'single' | 'bulk'>('single');
  const [generateStudentId, setGenerateStudentId] = useState('');
  const [generateClassId, setGenerateClassId] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<Template | null>(null);
  const [generatedPage, setGeneratedPage] = useState(1);

  // Drag state
  const dragRef = useRef<{
    mode: 'move' | 'resize';
    id: string;
    startX: number;
    startY: number;
    elX: number;
    elY: number;
    elW: number;
    elH: number;
  } | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const skipSaveRef = useRef(true);
  const timerRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pendingImageIdRef = useRef<string | null>(null);

  // --- Queries --------------------------------------------------------------

  const templatesQuery = useQuery({
    queryKey: ['doc-templates'],
    queryFn: async (): Promise<Template[]> => {
      const res = await api.get('/document-builder', { params: { search: templateSearch || undefined } });
      return (res.data?.data?.items ?? []) as Template[];
    },
  });

  const currentTemplate = useMemo(() => {
    const items = templatesQuery.data ?? [];
    return items.find((t) => t.id === selectedTemplateId) ?? null;
  }, [templatesQuery.data, selectedTemplateId]);

  const templateDetailQuery = useQuery({
    queryKey: ['doc-template', selectedTemplateId],
    enabled: !!selectedTemplateId,
    queryFn: async (): Promise<Template> => {
      const res = await api.get(`/document-builder/${selectedTemplateId}`);
      return res.data?.data?.template as Template;
    },
  });

  const studentsQuery = useQuery({
    queryKey: ['students-select'],
    queryFn: async (): Promise<StudentLite[]> => {
      const res = await api.get('/students', { params: { limit: 500 } });
      return (res.data?.data?.items ?? []) as StudentLite[];
    },
  });

  const classesQuery = useQuery({
    queryKey: ['classes-select'],
    queryFn: async (): Promise<ClassLite[]> => {
      const res = await api.get('/classes');
      return (res.data?.data?.items ?? []) as ClassLite[];
    },
  });

  const schoolQuery = useQuery({
    queryKey: ['school-info'],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<SchoolInfo | null> => {
      try {
        const res = await api.get('/settings');
        return (res.data?.data?.school ?? null) as SchoolInfo | null;
      } catch {
        return null;
      }
    },
  });

  const generatedQuery = useQuery({
    queryKey: ['generated-docs', generatedPage],
    queryFn: async () => {
      const res = await api.get('/document-builder/generated/list', {
        params: { page: generatedPage, limit: 15 },
      });
      const d = res.data?.data ?? {};
      return {
        items: (d.items ?? []) as GeneratedDoc[],
        total: (d.total ?? 0) as number,
        pages: Math.max(1, (d.pages ?? 1) as number),
      };
    },
  });

  // --- Elements state helpers ----------------------------------------------

  const applyElements = useCallback((next: DocElement[]) => {
    elementsRef.current = next;
    setElementsState(next);
  }, []);

  const pushHistory = useCallback(() => {
    setHistory((h) => [...h.slice(-49), elementsRef.current]);
    setFuture([]);
  }, []);

  const commit = useCallback(
    (next: DocElement[]) => {
      pushHistory();
      applyElements(next);
    },
    [pushHistory, applyElements]
  );

  // Load schema whenever the selected template changes
  useEffect(() => {
    const tpl = templateDetailQuery.data;
    if (!tpl || tpl.id !== selectedTemplateId) return;
    skipSaveRef.current = true;
    applyElements((tpl.schema?.elements ?? []) as DocElement[]);
    setHistory([]);
    setFuture([]);
    setSelectedElementId(null);
    setSaveStatus('saved');
  }, [templateDetailQuery.data, selectedTemplateId, applyElements]);

  // Auto-select the first template
  useEffect(() => {
    if (!selectedTemplateId && templatesQuery.data && templatesQuery.data.length > 0) {
      setSelectedTemplateId(templatesQuery.data[0].id);
    }
  }, [templatesQuery.data, selectedTemplateId]);

  // Default preview student = first real student
  useEffect(() => {
    if (!previewStudentId && studentsQuery.data && studentsQuery.data.length > 0) {
      setPreviewStudentId(studentsQuery.data[0].id);
    }
  }, [studentsQuery.data, previewStudentId]);

  // --- Autosave -------------------------------------------------------------

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTemplateId) return null;
      setSaveStatus('saving');
      const res = await api.patch(`/document-builder/${selectedTemplateId}`, {
        schema: { elements: elementsRef.current },
      });
      return res.data?.data?.template as Template;
    },
    onSuccess: () => {
      setSaveStatus('saved');
      queryClient.invalidateQueries({ queryKey: ['doc-templates'] });
    },
    onError: (err: unknown) => {
      setSaveStatus('error');
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'Impossible d’enregistrer le modèle';
      addToast('error', msg);
    },
  });

  useEffect(() => {
    if (!selectedTemplateId) return;
    if (skipSaveRef.current) {
      skipSaveRef.current = false;
      return;
    }
    setSaveStatus('dirty');
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => saveMutation.mutate(), 1100);
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elements, selectedTemplateId]);

  // --- Undo / redo ----------------------------------------------------------

  const undo = useCallback(() => {
    if (history.length === 0) return;
    const prev = history[history.length - 1];
    setFuture((f) => [elementsRef.current, ...f].slice(0, 50));
    setHistory((h) => h.slice(0, -1));
    applyElements(prev);
    setSelectedElementId(null);
  }, [history, applyElements]);

  const redo = useCallback(() => {
    if (future.length === 0) return;
    const next = future[0];
    setHistory((h) => [...h.slice(-49), elementsRef.current]);
    setFuture((f) => f.slice(1));
    applyElements(next);
    setSelectedElementId(null);
  }, [future, applyElements]);

  // --- Element operations ---------------------------------------------------

  const addElement = (type: ElementType) => {
    const lastBottom = elementsRef.current.reduce(
      (max, el) => Math.max(max, el.y + el.height),
      40
    );
    const el = newElement(type, Math.min(lastBottom + 16, 760));
    commit([...elementsRef.current, el]);
    setSelectedElementId(el.id);
    setLeftTab('elements');
  };

  const updateElement = (id: string, patch: Partial<DocElement>, withHistory = true) => {
    const next = elementsRef.current.map((el) => (el.id === id ? { ...el, ...patch } : el));
    if (withHistory) commit(next);
    else applyElements(next);
  };

  const removeElement = (id: string) => {
    commit(elementsRef.current.filter((el) => el.id !== id));
    if (selectedElementId === id) setSelectedElementId(null);
  };

  const duplicateElement = (id: string) => {
    const src = elementsRef.current.find((el) => el.id === id);
    if (!src) return;
    const copy: DocElement = {
      ...src,
      id: uid(),
      x: Math.min(src.x + 12, 500),
      y: Math.min(src.y + 12, 780),
    };
    commit([...elementsRef.current, copy]);
    setSelectedElementId(copy.id);
  };

  // --- Drag & drop ----------------------------------------------------------

  const startDrag = (
    e: React.MouseEvent,
    el: DocElement,
    mode: 'move' | 'resize'
  ) => {
    e.stopPropagation();
    e.preventDefault();
    if (!selectedTemplateId) return;
    setSelectedElementId(el.id);
    pushHistory();
    dragRef.current = {
      mode,
      id: el.id,
      startX: e.clientX,
      startY: e.clientY,
      elX: el.x,
      elY: el.y,
      elW: el.width,
      elH: el.height,
    };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const drag = dragRef.current;
    if (!drag || !canvasRef.current) return;
    const dx = (e.clientX - drag.startX) / zoom;
    const dy = (e.clientY - drag.startY) / zoom;

    if (drag.mode === 'move') {
      const nx = Math.max(0, Math.round(drag.elX + dx));
      const ny = Math.max(0, Math.round(drag.elY + dy));
      updateElement(drag.id, { x: nx, y: ny }, false);
    } else {
      const nw = Math.max(20, Math.round(drag.elW + dx));
      const nh = Math.max(8, Math.round(drag.elH + dy));
      updateElement(drag.id, { width: nw, height: nh }, false);
    }
  };

  const handleMouseUp = () => {
    dragRef.current = null;
  };

  // --- Keyboard shortcuts ---------------------------------------------------

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        !!target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if (typing) return;

      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (ctrl && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) {
        e.preventDefault();
        redo();
      } else if (ctrl && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveMutation.mutate();
      } else if (ctrl && e.key.toLowerCase() === 'd' && selectedElementId) {
        e.preventDefault();
        duplicateElement(selectedElementId);
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedElementId) {
        e.preventDefault();
        removeElement(selectedElementId);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [undo, redo, selectedElementId]);

  // --- Template CRUD --------------------------------------------------------

  const createMutation = useMutation({
    mutationFn: async (payload: {
      name: string;
      category: string;
      description: string;
      format: string;
      orientation: string;
    }) => {
      const res = await api.post('/document-builder', payload);
      return res.data?.data?.template as Template;
    },
    onSuccess: (tpl) => {
      addToast('success', `Modèle « ${tpl.name} » créé`);
      setShowCreateModal(false);
      queryClient.invalidateQueries({ queryKey: ['doc-templates'] });
      setSelectedTemplateId(tpl.id);
      setLeftTab('elements');
    },
    onError: (err: unknown) => {
      addToast(
        'error',
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
          'Impossible de créer le modèle'
      );
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.post(`/document-builder/${id}/duplicate`);
      return res.data?.data?.template as Template;
    },
    onSuccess: (tpl) => {
      addToast('success', 'Modèle dupliqué');
      queryClient.invalidateQueries({ queryKey: ['doc-templates'] });
      setSelectedTemplateId(tpl.id);
    },
    onError: () => addToast('error', 'Impossible de dupliquer le modèle'),
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: string }) => {
      const res = await api.post(`/document-builder/${id}/${action}`);
      return res.data?.data?.template as Template;
    },
    onSuccess: (_tpl, vars) => {
      const labels: Record<string, string> = {
        publish: 'Modèle publié',
        archive: 'Modèle archivé',
        restore: 'Modèle restauré',
      };
      addToast('success', labels[vars.action] ?? 'Modèle mis à jour');
      queryClient.invalidateQueries({ queryKey: ['doc-templates'] });
      queryClient.invalidateQueries({ queryKey: ['doc-template'] });
    },
    onError: (err: unknown) =>
      addToast(
        'error',
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
          'Action impossible'
      ),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/document-builder/${id}`);
    },
    onSuccess: () => {
      addToast('success', 'Modèle supprimé');
      setConfirmDelete(null);
      queryClient.invalidateQueries({ queryKey: ['doc-templates'] });
      setSelectedTemplateId(null);
    },
    onError: (err: unknown) =>
      addToast(
        'error',
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
          'Suppression impossible'
      ),
  });

  const seedMutation = useMutation({
    mutationFn: async (): Promise<{ created: number; skipped: number }> => {
      const res = await api.post('/document-builder/seed-reference-templates');
      const d = res.data?.data ?? {};
      return {
        created: Number(d.created ?? 0),
        skipped: Number(d.skipped ?? 0),
      };
    },
    onSuccess: (data) => {
      addToast('success', `${data.created} modèle(s) créé(s), ${data.skipped} déjà présent(s)`);
      queryClient.invalidateQueries({ queryKey: ['doc-templates'] });
    },
    onError: (err: unknown) =>
      addToast(
        'error',
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
          'Création des modèles de référence impossible'
      ),
  });

  // --- Generation -----------------------------------------------------------

  const generateMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTemplateId) throw new Error('Aucun modèle sélectionné');
      if (elementsRef.current.length > 0) {
        await api.patch(`/document-builder/${selectedTemplateId}`, {
          schema: { elements: elementsRef.current },
        });
      }
      if (generateMode === 'single') {
        const res = await api.post('/document-builder/generate', {
          templateId: selectedTemplateId,
          studentId: generateStudentId || undefined,
        });
        return { count: 1, doc: res.data?.data?.document as GeneratedDoc };
      }
      const res = await api.post('/document-builder/generate-bulk', {
        templateId: selectedTemplateId,
        classId: generateClassId,
      });
      return {
        count: (res.data?.data?.created ?? 0) as number,
        failed: (res.data?.data?.failed ?? []) as { studentId: string; error: string }[],
        doc: null,
      };
    },
    onSuccess: (data) => {
      const failedCount = data.failed?.length ?? 0;
      addToast(
        failedCount > 0 ? 'info' : 'success',
        `${data.count} document(s) généré(s)${failedCount > 0 ? `, ${failedCount} en échec` : ''}`
      );
      setShowGenerateModal(false);
      setGenerateStudentId('');
      setGenerateClassId('');
      setSaveStatus('saved');
      queryClient.invalidateQueries({ queryKey: ['generated-docs'] });
      queryClient.invalidateQueries({ queryKey: ['doc-templates'] });
    },
    onError: (err: unknown) =>
      addToast(
        'error',
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
          'Génération impossible'
      ),
  });

  const downloadGenerated = async (id: string, title: string) => {
    try {
      const res = await api.get(`/document-builder/generated/${id}/download`, {
        responseType: 'blob',
      });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${title || 'document'}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      addToast('success', 'Téléchargement lancé');
    } catch {
      addToast('error', 'Téléchargement impossible');
    }
  };

  const deleteGeneratedMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/document-builder/generated/${id}`);
    },
    onSuccess: () => {
      addToast('success', 'Document supprimé');
      queryClient.invalidateQueries({ queryKey: ['generated-docs'] });
    },
    onError: () => addToast('error', 'Suppression impossible'),
  });

  // --- Image upload ---------------------------------------------------------

  const uploadImageMutation = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append('file', file);
      const res = await api.post('/document-builder/upload-image', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return res.data?.data?.url as string;
    },
    onSuccess: (url) => {
      const id = pendingImageIdRef.current;
      if (id) updateElement(id, { src: url });
      pendingImageIdRef.current = null;
      addToast('success', 'Image ajoutée');
    },
    onError: () => {
      pendingImageIdRef.current = null;
      addToast('error', 'Upload impossible (type ou taille non autorisé)');
    },
  });

  const pickImage = (id: string) => {
    pendingImageIdRef.current = id;
    fileInputRef.current?.click();
  };

  // --- Preview context ------------------------------------------------------

  const previewStudent = useMemo(
    () => studentsQuery.data?.find((s) => s.id === previewStudentId) ?? null,
    [studentsQuery.data, previewStudentId]
  );

  const ctx: Ctx = useMemo(() => {
    const school = schoolQuery.data ?? {};
    const s = previewStudent;
    const now = new Date();
    const cls =
      s?.class && typeof s.class === 'object' && 'name' in s.class
        ? String((s.class as { name?: string }).name ?? '')
        : '';
    return {
      student: {
        firstName: s?.firstName ?? '',
        lastName: s?.lastName ?? '',
        matricule: s?.studentId ?? '',
        className: cls,
        dateOfBirth: s?.dateOfBirth ? formatDateFR(new Date(s.dateOfBirth)) : '',
        gender: s?.gender ?? '',
      },
      school: {
        name: school.name ?? '',
        address: school.address ?? '',
        phone: school.phone ?? '',
        email: school.email ?? '',
        year: school.academicYear ?? currentSchoolYear(),
        director: school.director ?? '',
      },
      period: `Année ${school.academicYear ?? currentSchoolYear()}`,
      date: formatDateFR(now),
      absences: '',
      lates: '',
    };
  }, [schoolQuery.data, previewStudent]);

  // --- Aperçu des tableaux automatiques (données réelles, mise en cache) -----

  const gradesPreviewQuery = useQuery({
    queryKey: ['doc-preview-grades', previewStudentId],
    enabled: !!previewStudentId,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<PreviewGrade[]> => {
      try {
        const res = await api.get('/grades', { params: { studentId: previewStudentId } });
        return (res.data?.data?.items ?? []) as PreviewGrade[];
      } catch {
        return [];
      }
    },
  });

  // Référentiel matières → domaine (regroupement RDC défensif : sans
  // `department`, l'aperçu reste à plat comme avant).
  const subjectsDirQuery = useQuery({
    queryKey: ['doc-subjects-dir'],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<{ id?: string; name?: string; department?: string | null }[]> => {
      try {
        const res = await api.get('/subjects', { params: { limit: 500 } });
        return (res.data?.data?.items ?? []) as { id?: string; name?: string; department?: string | null }[];
      } catch {
        return [];
      }
    },
  });

  const feesPreviewQuery = useQuery({
    queryKey: ['doc-preview-fees', previewStudentId],
    enabled: !!previewStudentId,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<PreviewFee[]> => {
      try {
        const res = await api.get('/fees', { params: { studentId: previewStudentId } });
        return (res.data?.data?.items ?? []) as PreviewFee[];
      } catch {
        return [];
      }
    },
  });

  interface GradePreviewRow {
    subject: string;
    coef: number;
    avg: number;
    weighted: number;
  }

  const gradesPreview = useMemo(() => {
    const items = gradesPreviewQuery.data ?? [];
    const bySubject = new Map<string, { name: string; coef: number; scores: number[] }>();
    for (const g of items) {
      if (!g || typeof g !== 'object') continue;
      const sid = String(g.subjectId ?? g.subject?.id ?? g.id ?? '');
      const name = g.subject?.name ?? (sid ? sid.slice(0, 8) : '—');
      const score = Number(g.score);
      if (!Number.isFinite(score)) continue;
      const coef = Number(g.coefficient) || 1;
      const key = sid || name;
      const entry = bySubject.get(key) ?? { name, coef, scores: [] };
      entry.scores.push(score);
      if (entry.coef === 1 && coef !== 1) entry.coef = coef;
      bySubject.set(key, entry);
    }
    const rows: GradePreviewRow[] = [...bySubject.values()].map((e) => {
      const avg = e.scores.reduce((a, b) => a + b, 0) / e.scores.length;
      return { subject: e.name, coef: e.coef, avg, weighted: avg * e.coef };
    });
    const totalCoef = rows.reduce((a, r) => a + r.coef, 0);
    const totalWeighted = rows.reduce((a, r) => a + r.weighted, 0);
    const generalAvg = totalCoef > 0 ? totalWeighted / totalCoef : 0;
    return { rows, totalCoef, totalWeighted, generalAvg, loading: gradesPreviewQuery.isLoading };
  }, [gradesPreviewQuery.data, gradesPreviewQuery.isLoading]);

  interface FeePreviewRow {
    type: string;
    total: number;
    paid: number;
    balance: number;
    due: string;
    status: string;
  }
  const feesPreview = useMemo(() => {
    const items = feesPreviewQuery.data ?? [];
    const rows: FeePreviewRow[] = [];
    for (const f of items) {
      if (!f || typeof f !== 'object') continue;
      const total = Number(f.totalAmount ?? f.amount) || 0;
      const paid = Number(f.paidAmount) || 0;
      const rawType = String(f.type ?? 'other');
      const rawStatus = String(f.status ?? 'pending');
      rows.push({
        type: FEE_TYPE_LABELS[rawType] ?? rawType,
        total,
        paid,
        balance: total - paid,
        due: f.dueDate ? new Date(f.dueDate).toLocaleDateString('fr-FR') : '—',
        status: FEE_STATUS_LABELS[rawStatus] ?? rawStatus,
      });
    }
    const totalAmount = rows.reduce((a, r) => a + r.total, 0);
    const totalPaid = rows.reduce((a, r) => a + r.paid, 0);
    return { rows, totalAmount, totalPaid, loading: feesPreviewQuery.isLoading };
  }, [feesPreviewQuery.data, feesPreviewQuery.isLoading]);

  interface RdcPreviewRow {
    subject: string;
    domain: string | null;
    coef: number;
    terms: (number | null)[];
    annual: number | null;
  }

  interface RdcPreviewGroup {
    name: string;
    rows: RdcPreviewRow[];
    totals: (number | null)[];
    maxima: number[];
    annualTotal: number | null;
    annualMaxima: number;
  }

  // Tableau RDC : moyennes par matière et par période (1/2/3) + lignes
  // MAXIMA / TOTAUX / POURCENTAGE. Le rang réel est calculé dans le PDF.
  // Regroupement par domaine (department matière) : défensif — sans domaines,
  // un seul groupe « plat » et le rendu reste inchangé.
  const rdcPreview = useMemo(() => {
    const items = gradesPreviewQuery.data ?? [];
    const deptById = new Map<string, string>();
    const deptByName = new Map<string, string>();
    for (const s of subjectsDirQuery.data ?? []) {
      const d = (s.department ?? '').trim();
      if (!d) continue;
      if (s.id) deptById.set(String(s.id), d);
      if (s.name) deptByName.set(String(s.name).toLowerCase(), d);
    }
    const bySubject = new Map<string, { sid: string; name: string; domain: string | null; coef: number; perTerm: number[][] }>();
    for (const g of items) {
      if (!g || typeof g !== 'object') continue;
      const sid = String(g.subjectId ?? g.subject?.id ?? g.id ?? '');
      const name = g.subject?.name ?? (sid ? sid.slice(0, 8) : '—');
      const score = Number(g.score);
      if (!Number.isFinite(score)) continue;
      const coef = Number(g.coefficient) || 1;
      const termIdx = Math.min(3, Math.max(1, Number(g.term) || 1)) - 1;
      const key = sid || name;
      const entry = bySubject.get(key) ?? { sid, name, domain: null as string | null, coef, perTerm: [[], [], []] };
      if (!entry.domain) {
        const embedded = (g.subject?.department ?? '').trim();
        entry.domain = embedded || deptById.get(sid) || deptByName.get(name.toLowerCase()) || null;
      }
      entry.perTerm[termIdx].push(score);
      if (entry.coef === 1 && coef !== 1) entry.coef = coef;
      bySubject.set(key, entry);
    }
    const avg = (l: number[]) => (l.length > 0 ? l.reduce((a, b) => a + b, 0) / l.length : null);
    const rows: RdcPreviewRow[] = [...bySubject.values()].map((e) => {
      const terms = e.perTerm.map(avg);
      const valid = terms.filter((t): t is number => t !== null);
      return {
        subject: e.name,
        domain: e.domain,
        coef: e.coef,
        terms,
        annual: valid.length > 0 ? valid.reduce((a, b) => a + b, 0) / valid.length : null,
      };
    });
    rows.sort((a, b) => a.subject.localeCompare(b.subject, 'fr'));
    const sumPresent = (vals: (number | null)[]): number | null => {
      const present = vals.filter((v): v is number => v !== null);
      return present.length > 0 ? present.reduce((a, b) => a + b, 0) : null;
    };
    const grouped = new Map<string, RdcPreviewRow[]>();
    for (const r of rows) {
      const label = (r.domain ?? '').trim() || 'Sans domaine';
      const list = grouped.get(label) ?? [];
      list.push(r);
      grouped.set(label, list);
    }
    const groups: RdcPreviewGroup[] = [...grouped.entries()].map(([name, list]) => ({
      name,
      rows: list,
      totals: [0, 1, 2].map((t) => sumPresent(list.map((r) => r.terms[t]))),
      maxima: [0, 1, 2].map((t) => list.filter((r) => r.terms[t] !== null).length * 20),
      annualTotal: sumPresent(list.map((r) => r.annual)),
      annualMaxima: list.filter((r) => r.annual !== null).length * 20,
    }));
    groups.sort((a, b) => a.name.localeCompare(b.name, 'fr'));
    // À plat si aucun domaine renseigné (un seul groupe « Sans domaine »).
    const flat = groups.length <= 1 && (groups.length === 0 || groups[0].name === 'Sans domaine');
    const totals = [0, 1, 2].map((t) => {
      const vals = rows.map((r) => r.terms[t]).filter((v): v is number => v !== null);
      return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) : null;
    });
    const maxima = [0, 1, 2].map((t) => rows.filter((r) => r.terms[t] !== null).length * 20);
    const annuals = rows.map((r) => r.annual).filter((v): v is number => v !== null);
    const annualTotal = annuals.length > 0 ? annuals.reduce((a, b) => a + b, 0) : null;
    const annualMaxima = rows.filter((r) => r.annual !== null).length * 20;
    const percentage = annualTotal !== null && annualMaxima > 0 ? (annualTotal / annualMaxima) * 100 : null;
    return { rows, groups, flat, totals, maxima, annualTotal, annualMaxima, percentage, loading: gradesPreviewQuery.isLoading };
  }, [gradesPreviewQuery.data, gradesPreviewQuery.isLoading, subjectsDirQuery.data]);

  // --- Geometry -------------------------------------------------------------

  const page = PAGE_SIZES[currentTemplate?.format ?? 'A4'] ?? PAGE_SIZES.A4;
  const isLandscape = currentTemplate?.orientation === 'landscape';
  const pageW = (isLandscape ? page.h : page.w) * zoom;
  const pageH = (isLandscape ? page.w : page.h) * zoom;

  const selected = useMemo(
    () => elements.find((el) => el.id === selectedElementId) ?? null,
    [elements, selectedElementId]
  );

  // --- Render helpers -------------------------------------------------------

  const renderElement = (el: DocElement, isSelected: boolean) => {
    // Types inconnus (contrat backend en cours) : ignorés sans erreur.
    if (!KNOWN_ELEMENT_TYPES.has(el.type as string)) return null;

    const style: React.CSSProperties = {
      position: 'absolute',
      left: (MARGIN + el.x) * zoom,
      top: (MARGIN + el.y) * zoom,
      width: el.width * zoom,
      height: el.height * zoom,
      cursor: 'move',
      outline: isSelected ? '1.5px solid #6366f1' : 'none',
      outlineOffset: 1,
    };

    let content: React.ReactNode = null;

    if (el.type === 'text' || el.type === 'dynamic_field') {
      const raw =
        el.type === 'text' ? el.content || '' : `{{${el.field || ''}}}`;
      content = (
        <div
          style={{
            fontSize: (el.fontSize ?? 12) * zoom,
            color: el.color || '#111827',
            textAlign: el.align || 'left',
            fontWeight: el.bold ? 700 : 400,
            lineHeight: 1.35,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            width: '100%',
            height: '100%',
            fontFamily: 'Helvetica, Arial, sans-serif',
            opacity: el.type === 'dynamic_field' && !resolveField(raw, ctx) ? 0.45 : 1,
          }}
        >
          {resolveField(raw, ctx) ||
            (el.type === 'dynamic_field' ? `{{${el.field || ''}}}` : '')}
        </div>
      );
    } else if (el.type === 'divider') {
      content = (
        <div
          style={{
            width: '100%',
            borderTop: `${Math.max(1, (el.borderWidth ?? 1) * zoom)}px solid ${
              el.borderColor || '#94a3b8'
            }`,
          }}
        />
      );
    } else if (el.type === 'rectangle') {
      content = (
        <div
          style={{
            width: '100%',
            height: '100%',
            border: `${Math.max(1, (el.borderWidth ?? 1) * zoom)}px solid ${
              el.borderColor || '#cbd5e1'
            }`,
            background: el.backgroundColor || 'transparent',
          }}
        />
      );
    } else if (el.type === 'rounded_frame') {
      content = (
        <div
          style={{
            width: '100%',
            height: '100%',
            border: `${Math.max(1, (el.borderWidth ?? 1) * zoom)}px solid ${
              el.borderColor || '#cbd5e1'
            }`,
            borderRadius: `${(el.radius ?? 18) * zoom}px`,
            background: 'transparent',
          }}
        />
      );
    } else if (el.type === 'date') {
      content = (
        <div
          style={{
            fontSize: (el.fontSize ?? 10) * zoom,
            color: el.color || '#475569',
            textAlign: el.align || 'right',
            fontFamily: 'Helvetica, Arial, sans-serif',
          }}
        >
          {String(ctx.date ?? '')}
        </div>
      );
    } else if (el.type === 'page_number') {
      content = (
        <div
          style={{
            fontSize: (el.fontSize ?? 9) * zoom,
            color: el.color || '#94a3b8',
            textAlign: 'right',
            fontFamily: 'Helvetica, Arial, sans-serif',
          }}
        >
          Page 1
        </div>
      );
    } else if (el.type === 'image') {
      content = el.src ? (
        <img
          src={el.src}
          alt=""
          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
          draggable={false}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center border border-dashed border-gray-300 text-[9px] text-gray-400">
          <ImageIcon className="w-3 h-3 mr-1" /> Image
        </div>
      );
    } else if (el.type === 'table') {
      const rows = el.rows ?? [];
      content = (
        <table
          style={{
            width: '100%',
            height: '100%',
            borderCollapse: 'collapse',
            fontSize: (el.fontSize ?? 9) * zoom,
            fontFamily: 'Helvetica, Arial, sans-serif',
            color: el.color || '#111827',
          }}
        >
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri}>
                {(row ?? []).map((cell, ci) => (
                  <td
                    key={ci}
                    style={{
                      border: `${Math.max(0.5, (el.borderWidth ?? 0.5) * zoom)}px solid ${
                        el.borderColor || '#cbd5e1'
                      }`,
                      background: ri === 0 ? el.backgroundColor || '#f1f5f9' : 'transparent',
                      fontWeight: ri === 0 ? 700 : 400,
                      padding: `${2 * zoom}px ${4 * zoom}px`,
                      textAlign: el.align || 'left',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {resolveField(cell || '', ctx)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );
    } else if (el.type === 'grades_table') {
      // Tableau rempli automatiquement (aperçu) — lecture seule, rang réel dans le PDF.
      const fs = (el.fontSize ?? 9) * zoom;
      const border = `${Math.max(0.5, (el.borderWidth ?? 0.5) * zoom)}px solid ${
        el.borderColor || '#cbd5e1'
      }`;
      const pad = `${2 * zoom}px ${4 * zoom}px`;
      const fmt = (n: number) =>
        n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      content = (
        <div
          style={{
            width: '100%',
            height: '100%',
            overflow: 'hidden',
            fontFamily: 'Helvetica, Arial, sans-serif',
            fontSize: fs,
            color: el.color || '#111827',
          }}
        >
          {gradesPreview.loading ? (
            <div style={{ padding: pad, color: '#94a3b8' }}>Chargement des notes…</div>
          ) : gradesPreview.rows.length === 0 ? (
            <div style={{ padding: pad, color: '#94a3b8' }}>
              Aucune note enregistrée pour cette période
            </div>
          ) : (
            <>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: fs }}>
                <thead>
                  <tr>
                    {['Matière', 'Coef', 'Moy /20', 'Pondéré'].map((h) => (
                      <th
                        key={h}
                        style={{
                          border,
                          background: el.backgroundColor || '#f1f5f9',
                          fontWeight: 700,
                          padding: pad,
                          textAlign: 'left',
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {gradesPreview.rows.map((r, i) => (
                    <tr key={i}>
                      <td style={{ border, padding: pad }}>{r.subject}</td>
                      <td style={{ border, padding: pad }}>{r.coef}</td>
                      <td style={{ border, padding: pad }}>{fmt(r.avg)}</td>
                      <td style={{ border, padding: pad }}>{fmt(r.weighted)}</td>
                    </tr>
                  ))}
                  <tr>
                    <td style={{ border, padding: pad, fontWeight: 700 }}>TOTAL</td>
                    <td style={{ border, padding: pad, fontWeight: 700 }}>
                      {gradesPreview.totalCoef}
                    </td>
                    <td style={{ border, padding: pad }}>—</td>
                    <td style={{ border, padding: pad, fontWeight: 700 }}>
                      {fmt(gradesPreview.totalWeighted)}
                    </td>
                  </tr>
                  <tr>
                    <td
                      colSpan={3}
                      style={{ border, padding: pad, fontWeight: 700, textAlign: 'right' }}
                    >
                      Moyenne
                    </td>
                    <td style={{ border, padding: pad, fontWeight: 700 }}>
                      {fmt(gradesPreview.generalAvg)} /20
                    </td>
                  </tr>
                </tbody>
              </table>
              <div style={{ padding: pad, color: '#94a3b8' }}>Rang : — (calculé dans le PDF)</div>
            </>
          )}
        </div>
      );
    } else if (el.type === 'grades_table_rdc') {
      // Tableau RDC multi-périodes (aperçu) — lecture seule, rang réel dans le PDF.
      const fs = (el.fontSize ?? 9) * zoom;
      const border = `${Math.max(0.5, (el.borderWidth ?? 0.5) * zoom)}px solid ${
        el.borderColor || '#cbd5e1'
      }`;
      const pad = `${2 * zoom}px ${4 * zoom}px`;
      const fmt = (n: number | null) =>
        n === null || !Number.isFinite(n)
          ? '—'
          : n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      content = (
        <div
          style={{
            width: '100%',
            height: '100%',
            overflow: 'hidden',
            fontFamily: 'Helvetica, Arial, sans-serif',
            fontSize: fs,
            color: el.color || '#111827',
          }}
        >
          {rdcPreview.loading ? (
            <div style={{ padding: pad, color: '#94a3b8' }}>Chargement des notes…</div>
          ) : rdcPreview.rows.length === 0 ? (
            <div style={{ padding: pad, color: '#94a3b8' }}>
              Aucune note enregistrée pour cette période
            </div>
          ) : (
            <>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: fs }}>
                <thead>
                  <tr>
                    {['Branches', 'P1', 'P2', 'P3', 'Moy', 'Coef'].map((h) => (
                      <th
                        key={h}
                        style={{
                          border,
                          background: el.backgroundColor || '#f1f5f9',
                          fontWeight: 700,
                          padding: pad,
                          textAlign: 'left',
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rdcPreview.flat ? (
                    <>
                      {rdcPreview.rows.map((r, i) => (
                        <tr key={i}>
                          <td style={{ border, padding: pad }}>{r.subject}</td>
                          <td style={{ border, padding: pad }}>{fmt(r.terms[0])}</td>
                          <td style={{ border, padding: pad }}>{fmt(r.terms[1])}</td>
                          <td style={{ border, padding: pad }}>{fmt(r.terms[2])}</td>
                          <td style={{ border, padding: pad, fontWeight: 700 }}>{fmt(r.annual)}</td>
                          <td style={{ border, padding: pad }}>{r.coef}</td>
                        </tr>
                      ))}
                    </>
                  ) : (
                    <>
                      {rdcPreview.groups.map((g) => (
                        <Fragment key={g.name}>
                          <tr key={`dom-${g.name}`}>
                            <td colSpan={6} style={{ border, padding: pad, fontWeight: 700 }}>
                              Domaine : {g.name}
                            </td>
                          </tr>
                          {g.rows.map((r, i) => (
                            <tr key={`row-${g.name}-${i}`}>
                              <td style={{ border, padding: pad }}>{r.subject}</td>
                              <td style={{ border, padding: pad }}>{fmt(r.terms[0])}</td>
                              <td style={{ border, padding: pad }}>{fmt(r.terms[1])}</td>
                              <td style={{ border, padding: pad }}>{fmt(r.terms[2])}</td>
                              <td style={{ border, padding: pad, fontWeight: 700 }}>{fmt(r.annual)}</td>
                              <td style={{ border, padding: pad }}>{r.coef}</td>
                            </tr>
                          ))}
                          <tr key={`sub-${g.name}`}>
                            <td style={{ border, padding: pad, fontWeight: 700 }}>Sous-total — {g.name}</td>
                            {[0, 1, 2].map((t) => (
                              <td key={t} style={{ border, padding: pad, fontWeight: 700 }}>
                                {fmt(g.totals[t])}
                              </td>
                            ))}
                            <td style={{ border, padding: pad, fontWeight: 700 }}>{fmt(g.annualTotal)}</td>
                            <td style={{ border, padding: pad }}>—</td>
                          </tr>
                          <tr key={`max-${g.name}`}>
                            <td style={{ border, padding: pad, fontWeight: 700 }}>Maxima — {g.name}</td>
                            {[0, 1, 2].map((t) => (
                              <td key={t} style={{ border, padding: pad, fontWeight: 700 }}>
                                {g.maxima[t] || '—'}
                              </td>
                            ))}
                            <td style={{ border, padding: pad, fontWeight: 700 }}>
                              {g.annualMaxima || '—'}
                            </td>
                            <td style={{ border, padding: pad }}>—</td>
                          </tr>
                        </Fragment>
                      ))}
                    </>
                  )}
                  <tr>
                    <td style={{ border, padding: pad, fontWeight: 700 }}>MAXIMA GÉNÉRAUX</td>
                    {[0, 1, 2].map((t) => (
                      <td key={t} style={{ border, padding: pad, fontWeight: 700 }}>
                        {rdcPreview.maxima[t] || '—'}
                      </td>
                    ))}
                    <td style={{ border, padding: pad, fontWeight: 700 }}>
                      {rdcPreview.annualMaxima || '—'}
                    </td>
                    <td style={{ border, padding: pad }}>—</td>
                  </tr>
                  <tr>
                    <td style={{ border, padding: pad, fontWeight: 700 }}>TOTAUX</td>
                    {[0, 1, 2].map((t) => (
                      <td key={t} style={{ border, padding: pad, fontWeight: 700 }}>
                        {fmt(rdcPreview.totals[t])}
                      </td>
                    ))}
                    <td style={{ border, padding: pad, fontWeight: 700 }}>
                      {fmt(rdcPreview.annualTotal)}
                    </td>
                    <td style={{ border, padding: pad }}>—</td>
                  </tr>
                  <tr>
                    <td style={{ border, padding: pad, fontWeight: 700 }}>POURCENTAGE</td>
                    <td colSpan={5} style={{ border, padding: pad, fontWeight: 700, textAlign: 'center' }}>
                      {rdcPreview.percentage === null
                        ? '—'
                        : `${rdcPreview.percentage.toLocaleString('fr-FR')} %`}
                    </td>
                  </tr>
                  <tr>
                    <td style={{ border, padding: pad, fontWeight: 700 }}>PLACE</td>
                    <td colSpan={5} style={{ border, padding: pad, textAlign: 'center', color: '#94a3b8' }}>
                      — (calculée dans le PDF)
                    </td>
                  </tr>
                </tbody>
              </table>
            </>
          )}
        </div>
      );
    } else if (el.type === 'id_boxes') {
      // Boîtes ID : un caractère par case, valeur résolue depuis le champ choisi.
      const raw = resolveField(`{{${el.field || 'student.matricule'}}}`, ctx);
      const chars = (raw || '').split('').slice(0, 16);
      content = (
        <div style={{ display: 'flex', gap: 2 * zoom, alignItems: 'stretch', height: '100%' }}>
          {chars.length === 0 ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '100%',
                border: '1px dashed #cbd5e1',
                color: '#94a3b8',
                fontSize: (el.fontSize ?? 11) * zoom,
                fontFamily: 'Helvetica, Arial, sans-serif',
              }}
            >
              {`{{${el.field || 'student.matricule'}}}`}
            </div>
          ) : (
            chars.map((ch, i) => (
              <div
                key={i}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: `${Math.max(1, (el.borderWidth ?? 1) * zoom)}px solid ${el.borderColor || '#0f172a'}`,
                  fontSize: (el.fontSize ?? 11) * zoom,
                  fontWeight: 700,
                  fontFamily: 'monospace',
                  color: el.color || '#111827',
                  minWidth: 0,
                }}
              >
                {ch}
              </div>
            ))
          )}
        </div>
      );
    } else if (el.type === 'qr_code') {
      // QR réel intégré dans le PDF backend ; aperçu = espace réservé étiqueté.
      content = (
        <div
          style={{
            width: '100%',
            height: '100%',
            border: `${Math.max(1, (el.borderWidth ?? 1) * zoom)}px dashed ${el.borderColor || '#94a3b8'}`,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 2 * zoom,
            color: '#64748b',
            fontFamily: 'Helvetica, Arial, sans-serif',
          }}
        >
          <QrCode style={{ width: 18 * zoom, height: 18 * zoom }} />
          <span style={{ fontSize: Math.max(7, 8 * zoom) }}>QR — vérification (PDF)</span>
        </div>
      );
    } else if (el.type === 'fees_table') {
      // Tableau rempli automatiquement (aperçu) — lecture seule.
      const fs = (el.fontSize ?? 9) * zoom;
      const border = `${Math.max(0.5, (el.borderWidth ?? 0.5) * zoom)}px solid ${
        el.borderColor || '#cbd5e1'
      }`;
      const pad = `${2 * zoom}px ${4 * zoom}px`;
      const money = (n: number) => n.toLocaleString('fr-FR');
      content = (
        <div
          style={{
            width: '100%',
            height: '100%',
            overflow: 'hidden',
            fontFamily: 'Helvetica, Arial, sans-serif',
            fontSize: fs,
            color: el.color || '#111827',
          }}
        >
          {feesPreview.loading ? (
            <div style={{ padding: pad, color: '#94a3b8' }}>Chargement des frais…</div>
          ) : feesPreview.rows.length === 0 ? (
            <div style={{ padding: pad, color: '#94a3b8' }}>Aucun frais enregistré</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: fs }}>
              <thead>
                <tr>
                  {['Type', 'Montant', 'Payé', 'Solde', 'Échéance', 'Statut'].map((h) => (
                    <th
                      key={h}
                      style={{
                        border,
                        background: el.backgroundColor || '#f1f5f9',
                        fontWeight: 700,
                        padding: pad,
                        textAlign: 'left',
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {feesPreview.rows.map((r, i) => (
                  <tr key={i}>
                    <td style={{ border, padding: pad }}>{r.type}</td>
                    <td style={{ border, padding: pad }}>{money(r.total)}</td>
                    <td style={{ border, padding: pad }}>{money(r.paid)}</td>
                    <td style={{ border, padding: pad }}>{money(r.balance)}</td>
                    <td style={{ border, padding: pad }}>{r.due}</td>
                    <td style={{ border, padding: pad }}>{r.status}</td>
                  </tr>
                ))}
                <tr>
                  <td style={{ border, padding: pad, fontWeight: 700 }}>TOTAL</td>
                  <td style={{ border, padding: pad, fontWeight: 700 }}>
                    {money(feesPreview.totalAmount)}
                  </td>
                  <td style={{ border, padding: pad, fontWeight: 700 }}>
                    {money(feesPreview.totalPaid)}
                  </td>
                  <td style={{ border, padding: pad, fontWeight: 700 }}>
                    {money(feesPreview.totalAmount - feesPreview.totalPaid)}
                  </td>
                  <td style={{ border, padding: pad }}>—</td>
                  <td style={{ border, padding: pad }}>—</td>
                </tr>
              </tbody>
            </table>
          )}
        </div>
      );
    }

    return (
      <div key={el.id} style={style} onMouseDown={(e) => startDrag(e, el, 'move')}>
        {content}
        {isSelected && (
          <div
            onMouseDown={(e) => startDrag(e, el, 'resize')}
            style={{
              position: 'absolute',
              right: -5 * zoom,
              bottom: -5 * zoom,
              width: 10 * zoom,
              height: 10 * zoom,
              background: '#6366f1',
              border: '1.5px solid #fff',
              cursor: 'nwse-resize',
              borderRadius: 2,
            }}
          />
        )}
      </div>
    );
  };

  // --- JSX ------------------------------------------------------------------

  const statusChip =
    saveStatus === 'saving' ? (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted dark:text-gray-400">
        <Loader2 className="w-3 h-3 animate-spin" /> Enregistrement…
      </span>
    ) : saveStatus === 'dirty' ? (
      <span className="inline-flex items-center gap-1.5 text-xs text-amber-500">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> Modifications non enregistrées
      </span>
    ) : saveStatus === 'error' ? (
      <span className="inline-flex items-center gap-1.5 text-xs text-danger">
        <AlertTriangle className="w-3 h-3" /> Échec de l’enregistrement
      </span>
    ) : (
      <span className="inline-flex items-center gap-1.5 text-xs text-success">
        <Check className="w-3 h-3" /> Enregistré
      </span>
    );

  return (
    <PageTransition>
      {/* print styles: only the page canvas is printed */}
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .sf-print-area, .sf-print-area * { visibility: visible !important; }
          .sf-print-area { position: absolute !important; left: 0 !important; top: 0 !important; }
          .sf-no-print { display: none !important; }
        }
      `}</style>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) uploadImageMutation.mutate(f);
          e.target.value = '';
        }}
      />

      {/* ---------------- Header ---------------- */}
      <div className="sf-no-print flex flex-wrap items-center gap-3 mb-4">
        <button
          onClick={() => navigate('/app/documents')}
          className="btn-ghost flex items-center gap-1.5 !px-3 !py-2"
          title="Retour aux documents"
        >
          <ChevronLeft className="w-4 h-4" /> Documents
        </button>

        <div className="flex items-center rounded-xl border border-border dark:border-white/10 overflow-hidden">
          <button
            onClick={() => setView('editor')}
            className={cn(
              'px-3 py-2 text-sm flex items-center gap-1.5 transition-colors',
              view === 'editor'
                ? 'bg-primary-500 text-white'
                : 'bg-white dark:bg-white/5 text-muted dark:text-gray-400'
            )}
          >
            <Pencil className="w-4 h-4" /> Éditeur
          </button>
          <button
            onClick={() => setView('generated')}
            className={cn(
              'px-3 py-2 text-sm flex items-center gap-1.5 transition-colors',
              view === 'generated'
                ? 'bg-primary-500 text-white'
                : 'bg-white dark:bg-white/5 text-muted dark:text-gray-400'
            )}
          >
            <List className="w-4 h-4" /> Documents générés
          </button>
        </div>

        {view === 'editor' && (
          <>
            <div className="min-w-0">
              <input
                value={currentTemplate?.name ?? ''}
                onChange={(e) => {
                  const name = e.target.value;
                  queryClient.setQueryData(['doc-templates'], (old: Template[] | undefined) =>
                    old?.map((t) => (t.id === selectedTemplateId ? { ...t, name } : t))
                  );
                }}
                onBlur={() => queryClient.invalidateQueries({ queryKey: ['doc-templates'] })}
                placeholder="Nom du modèle"
                className="bg-transparent text-lg font-semibold text-text dark:text-gray-100 outline-none border-b border-transparent focus:border-primary-500 min-w-[180px]"
              />
              <div className="flex items-center gap-3 mt-0.5">
                {statusChip}
                {currentTemplate && (
                  <span className={STATUS_CLASS[currentTemplate.status]}>
                    {STATUS_LABEL[currentTemplate.status]} · v{currentTemplate.version}
                  </span>
                )}
              </div>
            </div>

            <div className="ml-auto flex flex-wrap items-center gap-2">
              <button
                onClick={undo}
                disabled={history.length === 0}
                className="btn-ghost !px-2.5 !py-2 disabled:opacity-40"
                title="Annuler (Ctrl+Z)"
              >
                <Undo2 className="w-4 h-4" />
              </button>
              <button
                onClick={redo}
                disabled={future.length === 0}
                className="btn-ghost !px-2.5 !py-2 disabled:opacity-40"
                title="Rétablir (Ctrl+Y)"
              >
                <Redo2 className="w-4 h-4" />
              </button>
              <button
                onClick={() => saveMutation.mutate()}
                disabled={!selectedTemplateId || saveMutation.isPending}
                className="btn-secondary flex items-center gap-1.5 disabled:opacity-50"
                title="Enregistrer (Ctrl+S)"
              >
                {saveMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                Enregistrer
              </button>
              <button
                onClick={() => selectedTemplateId && duplicateMutation.mutate(selectedTemplateId)}
                disabled={!selectedTemplateId || duplicateMutation.isPending}
                className="btn-ghost flex items-center gap-1.5 disabled:opacity-50"
                title="Dupliquer le modèle"
              >
                <Copy className="w-4 h-4" /> Dupliquer
              </button>
              <button
                onClick={() => window.print()}
                className="btn-ghost flex items-center gap-1.5"
                title="Imprimer"
              >
                <Printer className="w-4 h-4" /> Imprimer
              </button>
              <button
                onClick={() => setShowGenerateModal(true)}
                disabled={!selectedTemplateId}
                className="btn-primary flex items-center gap-1.5 disabled:opacity-50"
              >
                <Send className="w-4 h-4" /> Générer PDF
              </button>
            </div>
          </>
        )}
      </div>

      {view === 'editor' ? (
        <div className="flex gap-4 items-start">
          {/* ---------------- Left panel ---------------- */}
          <div className="sf-no-print w-64 shrink-0 card p-0 overflow-hidden hidden lg:flex flex-col max-h-[calc(100vh-190px)]">
            <div className="flex border-b border-border dark:border-white/10">
              {(
                [
                  ['templates', 'Modèles', Layers],
                  ['elements', 'Éléments', Plus],
                  ['fields', 'Données', Hash],
                ] as const
              ).map(([key, label, Icon]) => (
                <button
                  key={key}
                  onClick={() => setLeftTab(key)}
                  className={cn(
                    'flex-1 px-2 py-2.5 text-xs font-medium flex items-center justify-center gap-1 transition-colors',
                    leftTab === key
                      ? 'text-primary-500 border-b-2 border-primary-500'
                      : 'text-muted dark:text-gray-400 hover:text-text dark:hover:text-gray-200'
                  )}
                >
                  <Icon className="w-3.5 h-3.5" /> {label}
                </button>
              ))}
            </div>

            <div className="p-3 overflow-y-auto flex-1">
              {leftTab === 'templates' && (
                <div className="space-y-3">
                  <button
                    onClick={() => setShowCreateModal(true)}
                    className="btn-primary w-full flex items-center justify-center gap-1.5"
                  >
                    <Plus className="w-4 h-4" /> Nouveau modèle
                  </button>
                  <button
                    onClick={() => seedMutation.mutate()}
                    disabled={seedMutation.isPending}
                    className="btn-secondary w-full flex items-center justify-center gap-1.5 disabled:opacity-50"
                    title="Créer les modèles de référence (bulletin, certificat…)"
                  >
                    {seedMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <BookMarked className="w-4 h-4" />
                    )}
                    {seedMutation.isPending ? 'Création…' : 'Modèles de référence'}
                  </button>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted" />
                    <input
                      value={templateSearch}
                      onChange={(e) => setTemplateSearch(e.target.value)}
                      placeholder="Rechercher…"
                      className="input-field !pl-8 !py-2 text-sm"
                    />
                  </div>

                  {templatesQuery.isLoading ? (
                    <div className="space-y-2">
                      {[0, 1, 2].map((i) => (
                        <div key={i} className="skeleton h-14 rounded-lg" />
                      ))}
                    </div>
                  ) : (templatesQuery.data ?? []).length === 0 ? (
                    <div className="text-center py-6">
                      <FileText className="w-8 h-8 text-muted mx-auto mb-2" />
                      <p className="text-xs text-muted dark:text-gray-400 mb-3">
                        Aucun modèle pour le moment
                      </p>
                      <button
                        onClick={() => setShowCreateModal(true)}
                        className="btn-secondary text-xs"
                      >
                        Créer un modèle
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {(templatesQuery.data ?? []).map((t) => (
                        <button
                          key={t.id}
                          onClick={() => setSelectedTemplateId(t.id)}
                          className={cn(
                            'w-full text-left px-3 py-2 rounded-lg border transition-colors',
                            t.id === selectedTemplateId
                              ? 'border-primary-500 bg-primary-500/10'
                              : 'border-border dark:border-white/10 hover:bg-gray-50 dark:hover:bg-white/5'
                          )}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-medium text-text dark:text-gray-200 truncate">
                              {t.name}
                            </span>
                            <span
                              className={cn(
                                'text-[10px] px-1.5 py-0.5 rounded-full shrink-0',
                                t.status === 'actif'
                                  ? 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400'
                                  : t.status === 'archive'
                                    ? 'bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-400'
                                    : 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400'
                              )}
                            >
                              {STATUS_LABEL[t.status]}
                            </span>
                          </div>
                          <div className="text-[11px] text-muted dark:text-gray-500 mt-0.5">
                            {TYPE_LABEL[t.category] ?? t.category} · {t.format} · v{t.version}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}

                  {currentTemplate && (
                    <div className="pt-2 border-t border-border dark:border-white/10 space-y-1.5">
                      {currentTemplate.status === 'brouillon' && (
                        <button
                          onClick={() => statusMutation.mutate({ id: currentTemplate.id, action: 'publish' })}
                          className="btn-secondary w-full flex items-center justify-center gap-1.5 text-xs"
                          disabled={statusMutation.isPending}
                        >
                          <Send className="w-3.5 h-3.5" /> Publier (actif)
                        </button>
                      )}
                      {currentTemplate.status === 'actif' && (
                        <button
                          onClick={() => statusMutation.mutate({ id: currentTemplate.id, action: 'archive' })}
                          className="btn-ghost w-full flex items-center justify-center gap-1.5 text-xs"
                          disabled={statusMutation.isPending}
                        >
                          <Archive className="w-3.5 h-3.5" /> Archiver
                        </button>
                      )}
                      {currentTemplate.status === 'archive' && (
                        <button
                          onClick={() => statusMutation.mutate({ id: currentTemplate.id, action: 'restore' })}
                          className="btn-secondary w-full flex items-center justify-center gap-1.5 text-xs"
                          disabled={statusMutation.isPending}
                        >
                          <RotateCcw className="w-3.5 h-3.5" /> Restaurer
                        </button>
                      )}
                      {currentTemplate.status !== 'actif' && (
                        <button
                          onClick={() => setConfirmDelete(currentTemplate)}
                          className="btn-ghost w-full flex items-center justify-center gap-1.5 text-xs text-danger hover:bg-red-50 dark:hover:bg-red-500/10"
                        >
                          <Trash2 className="w-3.5 h-3.5" /> Supprimer
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {leftTab === 'elements' && (
                <div className="space-y-1.5">
                  {!selectedTemplateId && (
                    <p className="text-xs text-muted dark:text-gray-400">
                      Sélectionnez un modèle pour commencer.
                    </p>
                  )}
                  {PALETTE.map((item) => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.type}
                        onClick={() => addElement(item.type)}
                        disabled={!selectedTemplateId}
                        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border border-border dark:border-white/10 text-sm text-text dark:text-gray-200 hover:border-primary-500 hover:bg-primary-500/5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <Icon className="w-4 h-4 text-primary-500 shrink-0" />
                        {item.label}
                      </button>
                    );
                  })}
                  <p className="text-[11px] text-muted dark:text-gray-500 pt-2">
                    Glissez les éléments sur la page. Raccourcis : Ctrl+Z annuler, Ctrl+D
                    dupliquer, Suppr supprimer.
                  </p>
                </div>
              )}

              {leftTab === 'fields' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-muted dark:text-gray-400 mb-1.5">
                      Prévisualiser avec
                    </label>
                    <select
                      value={previewStudentId}
                      onChange={(e) => setPreviewStudentId(e.target.value)}
                      className="input-field !py-2 text-sm"
                    >
                      <option value="">Aucun élève</option>
                      {(studentsQuery.data ?? []).map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.lastName} {s.firstName}
                        </option>
                      ))}
                    </select>
                    <p className="text-[11px] text-muted dark:text-gray-500 mt-1">
                      Les valeurs affichées proviennent des données réelles de l’école.
                    </p>
                  </div>

                  {FIELD_GROUPS.map((g) => (
                    <div key={g.group}>
                      <div className="text-xs font-semibold text-muted dark:text-gray-400 mb-1.5">
                        {g.group}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {g.fields.map((f) => (
                          <button
                            key={f.path}
                            onClick={() => {
                              const el = newElement('dynamic_field');
                              el.field = f.path;
                              commit([...elementsRef.current, el]);
                              setSelectedElementId(el.id);
                            }}
                            disabled={!selectedTemplateId}
                            className="px-2 py-1 text-[11px] rounded-md border border-border dark:border-white/10 text-text dark:text-gray-300 hover:border-primary-500 hover:text-primary-500 transition-colors disabled:opacity-40"
                          >
                            {f.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ---------------- Canvas ---------------- */}
          <div className="flex-1 min-w-0">
            <div className="sf-no-print flex items-center justify-between mb-2 gap-2 flex-wrap">
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.1).toFixed(2)))}
                  className="btn-ghost !px-2 !py-1.5"
                  title="Zoom arrière"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <span className="text-xs text-muted dark:text-gray-400 w-12 text-center">
                  {Math.round(zoom * 100)}%
                </span>
                <button
                  onClick={() => setZoom((z) => Math.min(2, +(z + 0.1).toFixed(2)))}
                  className="btn-ghost !px-2 !py-1.5"
                  title="Zoom avant"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setZoom(1)}
                  className="btn-ghost !px-2 !py-1.5 text-xs"
                  title="Taille réelle"
                >
                  100%
                </button>
                <button
                  onClick={() => setZoom(0.75)}
                  className="btn-ghost !px-2 !py-1.5 text-xs"
                  title="Ajuster à la page"
                >
                  Ajuster
                </button>
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={currentTemplate?.format ?? 'A4'}
                  disabled
                  className="input-field !py-1.5 text-xs w-auto opacity-70"
                  title="Format du modèle"
                >
                  <option>{currentTemplate?.format ?? 'A4'}</option>
                </select>
                <span className="text-xs text-muted dark:text-gray-400">
                  {currentTemplate?.orientation === 'landscape' ? 'Paysage' : 'Portrait'}
                </span>
                <span className="text-xs text-muted dark:text-gray-400">Page 1 / 1</span>
              </div>
            </div>

            <div className="flex justify-center overflow-auto">
              <div
                ref={canvasRef}
                className="sf-print-area relative bg-white shadow-xl"
                style={{ width: pageW, height: pageH }}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onMouseDown={() => setSelectedElementId(null)}
              >
                {templateDetailQuery.isLoading && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Loader2 className="w-6 h-6 animate-spin text-primary-500" />
                  </div>
                )}

                {!templateDetailQuery.isLoading && elements.length === 0 && selectedTemplateId && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-8 pointer-events-none">
                    <FileText className="w-10 h-10 text-gray-300 mb-3" />
                    <p className="text-sm text-gray-400 mb-1">Page vide</p>
                    <p className="text-xs text-gray-400">
                      Ajoutez des éléments depuis le panneau de gauche, ou insérez un champ de
                      données.
                    </p>
                  </div>
                )}

                {elements.map((el) => renderElement(el, el.id === selectedElementId))}
              </div>
            </div>
          </div>

          {/* ---------------- Right panel ---------------- */}
          <div className="sf-no-print w-72 shrink-0 card p-4 max-h-[calc(100vh-190px)] overflow-y-auto hidden xl:block">
            {selected ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-text dark:text-gray-100">
                    Propriétés — {PALETTE.find((p) => p.type === selected.type)?.label ?? selected.type}
                  </h3>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => duplicateElement(selected.id)}
                      className="p-1.5 hover:bg-gray-100 dark:hover:bg-white/10 rounded-md"
                      title="Dupliquer (Ctrl+D)"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => removeElement(selected.id)}
                      className="p-1.5 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-md text-danger"
                      title="Supprimer (Suppr)"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {(selected.type === 'text' || selected.type === 'dynamic_field') && (
                  <>
                    {selected.type === 'text' ? (
                      <div>
                        <label className="block text-xs font-medium text-muted dark:text-gray-400 mb-1">
                          Contenu
                        </label>
                        <textarea
                          value={selected.content ?? ''}
                          onChange={(e) => updateElement(selected.id, { content: e.target.value })}
                          rows={3}
                          className="input-field text-sm resize-y"
                          placeholder="Texte (les variables {{...}} sont résolues)"
                        />
                      </div>
                    ) : (
                      <div>
                        <label className="block text-xs font-medium text-muted dark:text-gray-400 mb-1">
                          Champ de données
                        </label>
                        <select
                          value={selected.field ?? ''}
                          onChange={(e) => updateElement(selected.id, { field: e.target.value })}
                          className="input-field text-sm"
                        >
                          {FIELD_GROUPS.flatMap((g) =>
                            g.fields.map((f) => (
                              <option key={f.path} value={f.path}>
                                {g.group} — {f.label}
                              </option>
                            ))
                          )}
                        </select>
                        <div className="mt-2 p-2 rounded-lg bg-gray-50 dark:bg-white/5 text-xs text-muted dark:text-gray-400">
                          Rendu :{' '}
                          <span className="text-text dark:text-gray-200 font-mono">
                            {resolveField(`{{${selected.field ?? ''}}}`, ctx) || '—'}
                          </span>
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs font-medium text-muted dark:text-gray-400 mb-1">
                          Taille
                        </label>
                        <input
                          type="number"
                          min={6}
                          max={72}
                          value={selected.fontSize ?? 12}
                          onChange={(e) =>
                            updateElement(selected.id, { fontSize: Number(e.target.value) || 12 })
                          }
                          className="input-field text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-muted dark:text-gray-400 mb-1">
                          Couleur
                        </label>
                        <input
                          type="color"
                          value={selected.color || '#111827'}
                          onChange={(e) => updateElement(selected.id, { color: e.target.value })}
                          className="w-full h-9 rounded-lg border border-border dark:border-white/10 bg-transparent cursor-pointer"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-muted dark:text-gray-400 mb-1">
                        Alignement
                      </label>
                      <div className="flex gap-1">
                        {(['left', 'center', 'right', 'justify'] as Align[]).map((a) => (
                          <button
                            key={a}
                            onClick={() => updateElement(selected.id, { align: a })}
                            className={cn(
                              'flex-1 py-1.5 text-xs rounded-md border transition-colors',
                              (selected.align ?? 'left') === a
                                ? 'border-primary-500 text-primary-500 bg-primary-500/10'
                                : 'border-border dark:border-white/10 text-muted dark:text-gray-400'
                            )}
                          >
                            {a === 'left' ? 'G' : a === 'center' ? 'C' : a === 'right' ? 'D' : 'J'}
                          </button>
                        ))}
                      </div>
                    </div>

                    <label className="flex items-center gap-2 text-sm text-text dark:text-gray-200">
                      <input
                        type="checkbox"
                        checked={!!selected.bold}
                        onChange={(e) => updateElement(selected.id, { bold: e.target.checked })}
                        className="rounded"
                      />
                      Gras
                    </label>
                  </>
                )}

                {selected.type === 'table' && (
                  <>
                    <div>
                      <label className="block text-xs font-medium text-muted dark:text-gray-400 mb-1">
                        Contenu du tableau
                      </label>
                      <textarea
                        value={(selected.rows ?? []).map((r) => r.join(' | ')).join('\n')}
                        onChange={(e) => {
                          const rows = e.target.value.split('\n').map((line) => line.split('|').map((c) => c.trim()));
                          updateElement(selected.id, { rows });
                        }}
                        rows={6}
                        className="input-field text-sm font-mono resize-y"
                      />
                      <p className="text-[11px] text-muted dark:text-gray-500 mt-1">
                        Une ligne par ligne, cellules séparées par « | ». Première ligne = en-tête.
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs font-medium text-muted dark:text-gray-400 mb-1">
                          Taille texte
                        </label>
                        <input
                          type="number"
                          min={6}
                          max={24}
                          value={selected.fontSize ?? 9}
                          onChange={(e) =>
                            updateElement(selected.id, { fontSize: Number(e.target.value) || 9 })
                          }
                          className="input-field text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-muted dark:text-gray-400 mb-1">
                          Épaisseur bordure
                        </label>
                        <input
                          type="number"
                          min={0}
                          max={4}
                          step={0.5}
                          value={selected.borderWidth ?? 0.5}
                          onChange={(e) =>
                            updateElement(selected.id, { borderWidth: Number(e.target.value) || 0.5 })
                          }
                          className="input-field text-sm"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs font-medium text-muted dark:text-gray-400 mb-1">
                          Fond en-tête
                        </label>
                        <input
                          type="color"
                          value={selected.backgroundColor || '#f1f5f9'}
                          onChange={(e) => updateElement(selected.id, { backgroundColor: e.target.value })}
                          className="w-full h-9 rounded-lg border border-border dark:border-white/10 bg-transparent cursor-pointer"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-muted dark:text-gray-400 mb-1">
                          Couleur texte
                        </label>
                        <input
                          type="color"
                          value={selected.color || '#111827'}
                          onChange={(e) => updateElement(selected.id, { color: e.target.value })}
                          className="w-full h-9 rounded-lg border border-border dark:border-white/10 bg-transparent cursor-pointer"
                        />
                      </div>
                    </div>
                  </>
                )}

                {(selected.type === 'grades_table' || selected.type === 'grades_table_rdc' || selected.type === 'fees_table') && (
                  <>
                    <div className="p-2.5 rounded-lg bg-blue-50 dark:bg-blue-500/10 text-xs text-blue-700 dark:text-blue-300">
                      Ce tableau est rempli automatiquement à partir des données de l’élève lors
                      de la génération du PDF. Non modifiable cellule par cellule.
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs font-medium text-muted dark:text-gray-400 mb-1">
                          Taille texte
                        </label>
                        <input
                          type="number"
                          min={6}
                          max={24}
                          value={selected.fontSize ?? 9}
                          onChange={(e) =>
                            updateElement(selected.id, { fontSize: Number(e.target.value) || 9 })
                          }
                          className="input-field text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-muted dark:text-gray-400 mb-1">
                          Épaisseur bordure
                        </label>
                        <input
                          type="number"
                          min={0}
                          max={4}
                          step={0.5}
                          value={selected.borderWidth ?? 0.5}
                          onChange={(e) =>
                            updateElement(selected.id, { borderWidth: Number(e.target.value) || 0.5 })
                          }
                          className="input-field text-sm"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-muted dark:text-gray-400 mb-1">
                        Couleur bordure
                      </label>
                      <input
                        type="color"
                        value={selected.borderColor || '#cbd5e1'}
                        onChange={(e) => updateElement(selected.id, { borderColor: e.target.value })}
                        className="w-full h-9 rounded-lg border border-border dark:border-white/10 bg-transparent cursor-pointer"
                      />
                    </div>
                  </>
                )}

                {selected.type === 'id_boxes' && (
                  <>
                    <div>
                      <label className="block text-xs font-medium text-muted dark:text-gray-400 mb-1">
                        Champ source (découpé en cases)
                      </label>
                      <select
                        value={selected.field ?? 'student.matricule'}
                        onChange={(e) => updateElement(selected.id, { field: e.target.value })}
                        className="input-field text-sm"
                      >
                        {FIELD_GROUPS.flatMap((g) =>
                          g.fields.map((f) => (
                            <option key={f.path} value={f.path}>
                              {g.group} — {f.label}
                            </option>
                          ))
                        )}
                      </select>
                      <div className="mt-2 p-2 rounded-lg bg-gray-50 dark:bg-white/5 text-xs text-muted dark:text-gray-400">
                        Valeur :{' '}
                        <span className="text-text dark:text-gray-200 font-mono">
                          {resolveField(`{{${selected.field ?? 'student.matricule'}}}`, ctx) || '—'}
                        </span>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-muted dark:text-gray-400 mb-1">
                        Couleur des cases
                      </label>
                      <input
                        type="color"
                        value={selected.borderColor || '#0f172a'}
                        onChange={(e) => updateElement(selected.id, { borderColor: e.target.value })}
                        className="w-full h-9 rounded-lg border border-border dark:border-white/10 bg-transparent cursor-pointer"
                      />
                    </div>
                  </>
                )}

                {selected.type === 'qr_code' && (
                  <div className="p-2.5 rounded-lg bg-blue-50 dark:bg-blue-500/10 text-xs text-blue-700 dark:text-blue-300">
                    Le QR réel (lien de vérification du document) est intégré dans le PDF
                    généré côté serveur. L’aperçu affiche un espace réservé étiqueté « QR ».
                  </div>
                )}

                {selected.type === 'rounded_frame' && (
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs font-medium text-muted dark:text-gray-400 mb-1">
                          Épaisseur
                        </label>
                        <input
                          type="number"
                          min={0}
                          max={8}
                          step={0.5}
                          value={selected.borderWidth ?? 1}
                          onChange={(e) =>
                            updateElement(selected.id, { borderWidth: Number(e.target.value) || 1 })
                          }
                          className="input-field text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-muted dark:text-gray-400 mb-1">
                          Couleur
                        </label>
                        <input
                          type="color"
                          value={selected.borderColor || '#cbd5e1'}
                          onChange={(e) => updateElement(selected.id, { borderColor: e.target.value })}
                          className="w-full h-9 rounded-lg border border-border dark:border-white/10 bg-transparent cursor-pointer"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-muted dark:text-gray-400 mb-1">
                        Rayon des coins (px)
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={selected.radius ?? 18}
                        onChange={(e) =>
                          updateElement(selected.id, { radius: Math.max(0, Number(e.target.value) || 0) })
                        }
                        className="input-field text-sm"
                      />
                    </div>
                  </div>
                )}

                {selected.type === 'image' && (
                  <div className="space-y-2">
                    {selected.src ? (
                      <img
                        src={selected.src}
                        alt=""
                        className="w-full h-28 object-contain bg-gray-50 dark:bg-white/5 rounded-lg"
                      />
                    ) : (
                      <div className="w-full h-28 flex items-center justify-center border border-dashed border-border dark:border-white/10 rounded-lg text-xs text-muted">
                        Aucune image
                      </div>
                    )}
                    <button
                      onClick={() => pickImage(selected.id)}
                      className="btn-secondary w-full flex items-center justify-center gap-1.5 text-sm"
                      disabled={uploadImageMutation.isPending}
                    >
                      {uploadImageMutation.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <ImageIcon className="w-4 h-4" />
                      )}
                      {selected.src ? 'Remplacer l’image' : 'Choisir une image'}
                    </button>
                    <p className="text-[11px] text-muted dark:text-gray-500">
                      PNG, JPG ou WEBP — 5 Mo max. Idéal pour logo, signature, cachet.
                    </p>
                  </div>
                )}

                {(selected.type === 'divider' || selected.type === 'rectangle') && (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-medium text-muted dark:text-gray-400 mb-1">
                        Épaisseur
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={8}
                        step={0.5}
                        value={selected.borderWidth ?? 1}
                        onChange={(e) =>
                          updateElement(selected.id, { borderWidth: Number(e.target.value) || 1 })
                        }
                        className="input-field text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-muted dark:text-gray-400 mb-1">
                        Couleur
                      </label>
                      <input
                        type="color"
                        value={selected.borderColor || '#94a3b8'}
                        onChange={(e) => updateElement(selected.id, { borderColor: e.target.value })}
                        className="w-full h-9 rounded-lg border border-border dark:border-white/10 bg-transparent cursor-pointer"
                      />
                    </div>
                  </div>
                )}

                <div className="pt-3 border-t border-border dark:border-white/10">
                  <div className="text-xs font-semibold text-muted dark:text-gray-400 mb-2">
                    Position & taille
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {(
                      [
                        ['x', 'X'],
                        ['y', 'Y'],
                        ['width', 'L'],
                        ['height', 'H'],
                      ] as const
                    ).map(([key, label]) => (
                      <div key={key}>
                        <label className="block text-[11px] text-muted dark:text-gray-500 mb-0.5">
                          {label}
                        </label>
                        <input
                          type="number"
                          value={Math.round(selected[key])}
                          onChange={(e) =>
                            updateElement(selected.id, {
                              [key]: Math.max(0, Number(e.target.value) || 0),
                            } as Partial<DocElement>)
                          }
                          className="input-field !px-2 text-sm"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-text dark:text-gray-100">
                  Paramètres du document
                </h3>
                {currentTemplate ? (
                  <div className="space-y-3 text-sm">
                    <div>
                      <label className="block text-xs font-medium text-muted dark:text-gray-400 mb-1">
                        Catégorie
                      </label>
                      <div className="text-text dark:text-gray-200">
                        {TYPE_LABEL[currentTemplate.category] ?? currentTemplate.category}
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-muted dark:text-gray-400 mb-1">
                        Format papier
                      </label>
                      <div className="text-text dark:text-gray-200">
                        {currentTemplate.format} —{' '}
                        {currentTemplate.orientation === 'landscape' ? 'Paysage' : 'Portrait'}
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-muted dark:text-gray-400 mb-1">
                        Statut
                      </label>
                      <span className={STATUS_CLASS[currentTemplate.status]}>
                        {STATUS_LABEL[currentTemplate.status]}
                      </span>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-muted dark:text-gray-400 mb-1">
                        Version
                      </label>
                      <div className="text-text dark:text-gray-200">v{currentTemplate.version}</div>
                    </div>
                    <p className="text-xs text-muted dark:text-gray-500">
                      Sélectionnez un élément pour éditer ses propriétés. Les champs dynamiques
                      affichés en gris dans l’aperçu seront remplacés par les données réelles lors
                      de la génération du PDF.
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-muted dark:text-gray-400">
                    Aucun modèle sélectionné. Choisissez un modèle dans l’onglet « Modèles » ou
                    créez-en un nouveau.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* ---------------- Generated documents view ---------------- */
        <div className="card overflow-hidden">
          <div className="px-4 py-3 border-b border-border dark:border-white/10 flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-sm font-semibold text-text dark:text-gray-100">
                Documents générés
              </h2>
              <p className="text-xs text-muted dark:text-gray-400">
                {generatedQuery.data?.total ?? 0} document(s)
              </p>
            </div>
            <button
              onClick={() => queryClient.invalidateQueries({ queryKey: ['generated-docs'] })}
              className="btn-ghost text-xs flex items-center gap-1.5"
            >
              <Eye className="w-3.5 h-3.5" /> Actualiser
            </button>
          </div>

          {generatedQuery.isLoading ? (
            <div className="p-4 space-y-3">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="skeleton h-12 rounded-lg" />
              ))}
            </div>
          ) : (generatedQuery.data?.items ?? []).length === 0 ? (
            <div className="p-10 text-center">
              <FileText className="w-10 h-10 text-muted mx-auto mb-3" />
              <p className="text-sm text-muted dark:text-gray-400 mb-1">
                Aucun document généré
              </p>
              <p className="text-xs text-muted dark:text-gray-500 mb-4">
                Sélectionnez un modèle actif puis cliquez sur « Générer PDF ».
              </p>
              <button
                onClick={() => setView('editor')}
                className="btn-primary inline-flex items-center gap-1.5"
              >
                <Pencil className="w-4 h-4" /> Ouvrir l’éditeur
              </button>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-white/5 border-b border-border dark:border-white/10">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">
                        Document
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">
                        Élève
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">
                        Type
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">
                        Modèle
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">
                        Date
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border dark:divide-white/5">
                    {(generatedQuery.data?.items ?? []).map((doc) => (
                      <tr
                        key={doc.id}
                        className="hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 bg-primary-500/10 rounded-lg flex items-center justify-center shrink-0">
                              <FileText className="w-4 h-4 text-primary-500" />
                            </div>
                            <span className="text-sm font-medium text-text dark:text-gray-200 truncate max-w-[240px]">
                              {doc.title || 'Document'}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-muted dark:text-gray-400">
                          {doc.student
                            ? `${doc.student.lastName} ${doc.student.firstName}`
                            : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <span className="badge badge-info">
                            {TYPE_LABEL[doc.documentType] ?? doc.documentType}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-muted dark:text-gray-400">
                          {doc.template?.name ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-sm text-muted dark:text-gray-400">
                          {new Date(doc.createdAt).toLocaleDateString('fr-FR')}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => downloadGenerated(doc.id, doc.title || 'document')}
                              className="p-1.5 hover:bg-green-50 dark:hover:bg-green-500/10 rounded-lg text-success transition-colors"
                              title="Télécharger le PDF"
                            >
                              <Download className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => window.print()}
                              className="p-1.5 hover:bg-blue-50 dark:hover:bg-blue-500/10 rounded-lg text-primary-500 transition-colors"
                              title="Imprimer"
                            >
                              <Printer className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => deleteGeneratedMutation.mutate(doc.id)}
                              className="p-1.5 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg text-danger transition-colors"
                              title="Supprimer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {(generatedQuery.data?.pages ?? 1) > 1 && (
                <div className="px-4 py-3 border-t border-border dark:border-white/10 flex items-center justify-between">
                  <span className="text-xs text-muted dark:text-gray-400">
                    Page {generatedPage} / {generatedQuery.data?.pages}
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setGeneratedPage((p) => Math.max(1, p - 1))}
                      disabled={generatedPage <= 1}
                      className="btn-ghost text-xs disabled:opacity-40"
                    >
                      Précédent
                    </button>
                    <button
                      onClick={() =>
                        setGeneratedPage((p) =>
                          Math.min(generatedQuery.data?.pages ?? 1, p + 1)
                        )
                      }
                      disabled={generatedPage >= (generatedQuery.data?.pages ?? 1)}
                      className="btn-ghost text-xs disabled:opacity-40"
                    >
                      Suivant
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ---------------- Create template modal ---------------- */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Nouveau modèle de document"
      >
        <CreateTemplateForm
          pending={createMutation.isPending}
          onCancel={() => setShowCreateModal(false)}
          onSubmit={(payload) => createMutation.mutate(payload)}
        />
      </Modal>

      {/* ---------------- Generate modal ---------------- */}
      <Modal
        isOpen={showGenerateModal}
        onClose={() => setShowGenerateModal(false)}
        title="Générer des documents"
      >
        <div className="space-y-4">
          <div className="flex rounded-xl border border-border dark:border-white/10 overflow-hidden">
            <button
              onClick={() => setGenerateMode('single')}
              className={cn(
                'flex-1 px-3 py-2 text-sm transition-colors',
                generateMode === 'single'
                  ? 'bg-primary-500 text-white'
                  : 'text-muted dark:text-gray-400'
              )}
            >
              Un élève
            </button>
            <button
              onClick={() => setGenerateMode('bulk')}
              className={cn(
                'flex-1 px-3 py-2 text-sm transition-colors',
                generateMode === 'bulk'
                  ? 'bg-primary-500 text-white'
                  : 'text-muted dark:text-gray-400'
              )}
            >
              Toute une classe
            </button>
          </div>

          {generateMode === 'single' ? (
            <div>
              <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">
                Élève
              </label>
              <select
                value={generateStudentId}
                onChange={(e) => setGenerateStudentId(e.target.value)}
                className="input-field"
              >
                <option value="">Sélectionner un élève</option>
                {(studentsQuery.data ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.lastName} {s.firstName}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">
                Classe
              </label>
              <select
                value={generateClassId}
                onChange={(e) => setGenerateClassId(e.target.value)}
                className="input-field"
              >
                <option value="">Sélectionner une classe</option>
                {(classesQuery.data ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted dark:text-gray-400 mt-1.5">
                Un PDF sera généré pour chaque élève actif de la classe.
              </p>
            </div>
          )}

          <div className="p-3 rounded-xl bg-gray-50 dark:bg-white/5 text-xs text-muted dark:text-gray-400">
            Modèle : <strong>{currentTemplate?.name}</strong> (v{currentTemplate?.version}) —
            statut {STATUS_LABEL[currentTemplate?.status ?? 'brouillon']}.
            {currentTemplate?.status !== 'actif' && (
              <span className="block mt-1 text-amber-600 dark:text-amber-400">
                Publiez le modèle pour activer la génération.
              </span>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setShowGenerateModal(false)} className="btn-ghost">
              Annuler
            </button>
            <button
              onClick={() => generateMutation.mutate()}
              disabled={
                generateMutation.isPending ||
                !selectedTemplateId ||
                currentTemplate?.status !== 'actif' ||
                (generateMode === 'single' ? !generateStudentId : !generateClassId)
              }
              className="btn-primary flex items-center gap-2 disabled:opacity-50"
            >
              {generateMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              {generateMutation.isPending ? 'Génération…' : 'Générer le PDF'}
            </button>
          </div>
        </div>
      </Modal>

      {/* ---------------- Delete confirmation ---------------- */}
      <Modal
        isOpen={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Confirmer la suppression"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-muted dark:text-gray-400">
            Le modèle <strong className="text-text dark:text-gray-200">« {confirmDelete?.name} »</strong>{' '}
            sera définitivement supprimé. Cette action est irréversible.
          </p>
          <div className="flex justify-end gap-3">
            <button onClick={() => setConfirmDelete(null)} className="btn-ghost">
              Annuler
            </button>
            <button
              onClick={() => confirmDelete && deleteMutation.mutate(confirmDelete.id)}
              disabled={deleteMutation.isPending}
              className="px-5 py-2.5 rounded-xl bg-danger text-white font-medium hover:bg-red-600 transition-all disabled:opacity-50"
            >
              {deleteMutation.isPending ? 'Suppression…' : 'Confirmer'}
            </button>
          </div>
        </div>
      </Modal>
    </PageTransition>
  );
}

// ---------------------------------------------------------------------------
// Create template form
// ---------------------------------------------------------------------------

function CreateTemplateForm({
  pending,
  onCancel,
  onSubmit,
}: {
  pending: boolean;
  onCancel: () => void;
  onSubmit: (payload: {
    name: string;
    category: string;
    description: string;
    format: string;
    orientation: string;
  }) => void;
}) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('certificat');
  const [description, setDescription] = useState('');
  const [format, setFormat] = useState('A4');
  const [orientation, setOrientation] = useState('portrait');
  const [touched, setTouched] = useState(false);

  const nameError = touched && !name.trim() ? 'Le nom est obligatoire' : '';

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!name.trim()) return;
    onSubmit({ name: name.trim(), category, description, format, orientation });
  };

  return (
    <form className="space-y-4" onSubmit={submit}>
      <div>
        <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">
          Nom du modèle *
        </label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => setTouched(true)}
          className={cn('input-field', nameError && '!border-danger')}
          placeholder="Ex. Bulletin Officiel 2026"
          autoFocus
        />
        {nameError && <p className="text-xs text-danger mt-1">{nameError}</p>}
      </div>

      <div>
        <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">
          Catégorie
        </label>
        <select value={category} onChange={(e) => setCategory(e.target.value)} className="input-field">
          {CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">
          Description
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="input-field resize-y"
          placeholder="Usage prévu, destinataires…"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">
            Format
          </label>
          <select value={format} onChange={(e) => setFormat(e.target.value)} className="input-field">
            {Object.keys(PAGE_SIZES).map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">
            Orientation
          </label>
          <select
            value={orientation}
            onChange={(e) => setOrientation(e.target.value)}
            className="input-field"
          >
            <option value="portrait">Portrait</option>
            <option value="landscape">Paysage</option>
          </select>
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <button type="button" onClick={onCancel} className="btn-ghost">
          Annuler
        </button>
        <button type="submit" disabled={pending} className="btn-primary disabled:opacity-50">
          {pending ? 'Création…' : 'Créer le modèle'}
        </button>
      </div>
    </form>
  );
}
