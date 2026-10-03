import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { motion } from 'motion/react';
import {
  GraduationCap,
  ShieldAlert,
  CheckCircle2,
  Loader2,
  FileText,
  ArrowLeft,
} from 'lucide-react';
import LanguageSwitcher from '../components/LanguageSwitcher';
import api from '../lib/api';

type State = 'loading' | 'invalid' | 'valid';

interface VerifyPayload {
  type?: string;
  documentNumber?: string;
  date?: string;
  issuedAt?: string;
  school?: string | { name?: string } | null;
  schoolName?: string;
  student?: string | { firstName?: string; lastName?: string } | null;
  studentName?: string;
  academicYear?: string;
  year?: string;
  status?: string;
}

const str = (v: unknown): string | null => {
  if (typeof v === 'string' && v.trim()) return v;
  return null;
};

const schoolNameOf = (d: VerifyPayload): string =>
  str(typeof d.school === 'string' ? d.school : d.school?.name) ??
  str(d.schoolName) ??
  '—';

const studentNameOf = (d: VerifyPayload): string | null =>
  str(typeof d.student === 'string' ? d.student : null) ??
  (typeof d.student === 'object' && d.student
    ? `${d.student.firstName ?? ''} ${d.student.lastName ?? ''}`.trim() || null
    : null) ??
  str(d.studentName);

export default function Verify() {
  const { documentNumber } = useParams<{ documentNumber: string }>();
  const [state, setState] = useState<State>('loading');
  const [doc, setDoc] = useState<VerifyPayload | null>(null);

  useEffect(() => {
    if (!documentNumber) {
      setState('invalid');
      return;
    }
    let cancelled = false;
    setState('loading');
    // Public endpoint (no auth layout). 404 / network error => invalid state.
    api
      .get(`/verify/${encodeURIComponent(documentNumber)}`)
      .then((res) => {
        if (cancelled) return;
        const d = (res.data?.data ?? null) as VerifyPayload | null;
        if (res.data?.success === false || !d) {
          setState('invalid');
          return;
        }
        setDoc(d);
        setState('valid');
      })
      .catch(() => {
        if (!cancelled) setState('invalid');
      });
    return () => {
      cancelled = true;
    };
  }, [documentNumber]);

  const student = doc ? studentNameOf(doc) : null;

  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-dark">
      <div className="flex items-center justify-between p-6">
        <Link to="/" className="flex items-center gap-2">
          <div className="w-9 h-9 bg-accent rounded-xl flex items-center justify-center">
            <GraduationCap className="w-5 h-5 text-white" />
          </div>
          <span className="text-xl font-bold text-text dark:text-white">
            SCHOOL<span className="text-primary-500">FLOW</span>
          </span>
        </Link>
        <LanguageSwitcher compact />
      </div>

      <div className="flex-1 flex items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, ease: [0, 0, 0, 1] }}
          className="w-full max-w-md"
        >
          <div className="card p-8 text-center">
            {state === 'loading' && (
              <>
                <Loader2 className="w-12 h-12 text-primary-500 mx-auto mb-4 animate-spin" />
                <h1 className="text-xl font-bold text-text dark:text-white">
                  Vérification du document…
                </h1>
                <p className="text-sm text-muted dark:text-gray-400 mt-2 font-mono">
                  {documentNumber}
                </p>
              </>
            )}

            {state === 'invalid' && (
              <>
                <ShieldAlert className="w-12 h-12 text-danger mx-auto mb-4" />
                <h1 className="text-xl font-bold text-text dark:text-white">
                  Document introuvable ou invalide
                </h1>
                <p className="text-sm text-muted dark:text-gray-400 mt-2">
                  Le numéro <span className="font-mono">{documentNumber}</span> ne correspond à
                  aucun document émis.
                </p>
                <Link to="/" className="btn-secondary w-full mt-6 flex items-center justify-center gap-2">
                  <ArrowLeft className="w-4 h-4" />
                  Retour à l’accueil
                </Link>
              </>
            )}

            {state === 'valid' && doc && (
              <>
                <CheckCircle2 className="w-12 h-12 text-success mx-auto mb-4" />
                <h1 className="text-xl font-bold text-text dark:text-white">
                  Document authentique
                </h1>
                <p className="text-sm text-muted dark:text-gray-400 mt-1 font-mono">
                  {str(doc.documentNumber) ?? documentNumber}
                </p>
                <dl className="text-left text-sm mt-6 space-y-2.5">
                  <div className="flex items-center justify-between gap-4">
                    <dt className="text-muted dark:text-gray-400 flex items-center gap-2">
                      <FileText className="w-4 h-4" /> Type
                    </dt>
                    <dd className="font-medium text-text dark:text-gray-200">
                      {str(doc.type) ?? '—'}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <dt className="text-muted dark:text-gray-400">École</dt>
                    <dd className="font-medium text-text dark:text-gray-200 text-right">
                      {schoolNameOf(doc)}
                    </dd>
                  </div>
                  {student && (
                    <div className="flex items-center justify-between gap-4">
                      <dt className="text-muted dark:text-gray-400">Élève</dt>
                      <dd className="font-medium text-text dark:text-gray-200 text-right">
                        {student}
                      </dd>
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-4">
                    <dt className="text-muted dark:text-gray-400">Année</dt>
                    <dd className="font-medium text-text dark:text-gray-200">
                      {str(doc.academicYear) ?? str(doc.year) ?? '—'}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <dt className="text-muted dark:text-gray-400">Date</dt>
                    <dd className="font-medium text-text dark:text-gray-200">
                      {str(doc.date) ?? str(doc.issuedAt) ?? '—'}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <dt className="text-muted dark:text-gray-400">Statut</dt>
                    <dd>
                      <span className="badge-success badge">{str(doc.status) ?? 'Valide'}</span>
                    </dd>
                  </div>
                </dl>
                <Link to="/" className="btn-secondary w-full mt-6 flex items-center justify-center gap-2">
                  <ArrowLeft className="w-4 h-4" />
                  Retour à l’accueil
                </Link>
              </>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
