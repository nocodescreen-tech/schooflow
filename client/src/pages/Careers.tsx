import { useState } from 'react';
import { motion } from 'motion/react';
import { MapPin, Clock, Briefcase, X, CheckCircle2 } from 'lucide-react';
import MarketingLayout from '../components/MarketingLayout';

interface Job {
  id: string;
  title: string;
  team: string;
  location: string;
  contract: string;
  summary: string;
  missions: string[];
  profile: string[];
}

const JOBS: Job[] = [
  {
    id: 'dev-fullstack',
    title: 'Développeur full-stack (Node / React)',
    team: 'Produit',
    location: 'Matadi (RDC) — télétravail possible',
    contract: 'Temps plein',
    summary:
      'Vous écrivez le code qui fait tourner la gestion scolaire : API Express/TypeScript, interface React, requêtes PostgreSQL. Vos décisions techniques ont un effet direct sur le quotidien de centaines d’enseignants et de parents.',
    missions: [
      'Développer et maintenir les modules métier (élèves, notes, finances, documents).',
      'Garantir que les calculs financiers et les moyennes restent côté serveur.',
      'Participer aux revues de code et à la sécurité applicative.',
    ],
    profile: [
      'TypeScript maîtrisé côté serveur et front.',
      'Expérience PostgreSQL : index, transactions, isolation multi-établissement.',
      'Sens du produit : comprendre le métier scolaire avant de coder.',
    ],
  },
  {
    id: 'devops',
    title: 'Ingénieur DevOps / Infrastructure',
    team: 'Plateforme',
    location: 'Matadi (RDC) — télétravail possible',
    contract: 'Temps plein',
    summary:
      'Vous êtes responsable de la disponibilité du logiciel : déploiement, sauvegardes PostgreSQL, supervision, et la performance vue par l’utilisateur.',
    missions: [
      'Automatiser les déploiements et les sauvegardes restaurables.',
      'Superviser la production et traiter les incidents avant qu’ils ne deviennent visibles.',
      'Maintenir l’environnement d’exécution (Node, proxy, stockage des médias).',
    ],
    profile: [
      'Linux, Docker, scripting et pratique systématique de la sauvegarde.',
      'Sens du diagnostic : remonter à la cause, pas au symptôme.',
      'Expérience de mise en production d’un service web.',
    ],
  },
  {
    id: 'support',
    title: 'Responsable support établissements',
    team: 'Accompagnement',
    location: 'Matadi (RDC)',
    contract: 'Temps plein',
    summary:
      'Vous êtes le lien entre les écoles clientes et le logiciel : installation, formation initiale, et résolution des incidents de la vie quotidienne.',
    missions: [
      'Accompagner les établissements lors de la mise en service.',
      'Former les équipes (direction, secrétariat, comptabilité, enseignants).',
      'Transformer les retours d’utilisation en demandes exploitables.',
    ],
    profile: [
      'Expérience du milieu scolaire (direction, secrétariat, comptabilité).',
      'Pédagogie et patience : expliquer sans jargon.',
      'Organisation : gérer plusieurs établissements en parallèle.',
    ],
  },
  {
    id: 'stagiaire',
    title: 'Stagiaire — développement web',
    team: 'Produit',
    location: 'Matadi (RDC)',
    contract: 'Convention de stage',
    summary:
      'Une immersion réelle dans le produit : vous contribuez à des modules en production, encadré par l’équipe technique.',
    missions: [
      'Participer au développement d’un module métier.',
      'Écrire des tests et corriger des anomalies signalées.',
      'Découvrir le métier scolaire de l’intérieur.',
    ],
    profile: [
      'Bases en JavaScript/TypeScript et en React.',
      'Curiosité et rigueur.',
      'Même niveau d’exigence sur le code que sur les études.',
    ],
  },
];

const BENEFITS = [
  'Télétravail possible selon le poste',
  'Matériel fourni et embryon de développement',
  'Interventions directes dans de vrais établissements',
  'Privité du code (aucune donnée client exploitée à des fins publicitaires)',
];

export default function Careers() {
  const [selected, setSelected] = useState<Job | null>(null);

  return (
    <MarketingLayout
      title="Carrières"
      subtitle="Nous recrutons des personnes qui préfèrent les problèmes concrets aux démonstrations spectaculaires."
    >
      <div className="grid sm:grid-cols-2 gap-4 mb-12">
        {BENEFITS.map((b, i) => (
          <motion.div
            key={b}
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.05 }}
            className="flex items-start gap-3 card p-4"
          >
            <CheckCircle2 className="w-5 h-5 text-primary-500 shrink-0 mt-0.5" />
            <span className="text-sm text-muted dark:text-gray-400">{b}</span>
          </motion.div>
        ))}
      </div>

      <h2 className="text-xl font-bold text-text dark:text-white mb-6">Postes ouverts</h2>

      <div className="space-y-4">
        {JOBS.map((job, i) => (
          <motion.button
            key={job.id}
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.05 }}
            onClick={() => setSelected(job)}
            className="card w-full p-6 text-left hover:border-primary-500/40 transition-colors"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-semibold text-text dark:text-white text-lg">{job.title}</h3>
                <p className="text-sm text-muted dark:text-gray-400 mt-1.5 leading-relaxed max-w-2xl">
                  {job.summary}
                </p>
              </div>
              <span className="badge badge-info shrink-0">{job.team}</span>
            </div>

            <div className="flex flex-wrap gap-5 mt-4 text-sm text-muted dark:text-gray-400">
              <span className="flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-primary-500" /> {job.location}
              </span>
              <span className="flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-primary-500" /> {job.contract}
              </span>
              <span className="flex items-center gap-1.5">
                <Briefcase className="w-4 h-4 text-primary-500" /> {job.id}
              </span>
            </div>
          </motion.button>
        ))}
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            onClick={() => setSelected(null)}
            className="absolute inset-0 bg-dark/60 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.22 }}
            className="relative w-full max-w-2xl bg-surface dark:bg-[#1E293B] rounded-2xl shadow-2xl max-h-[88vh] overflow-y-auto"
          >
            <div className="sticky top-0 bg-surface dark:bg-[#1E293B] px-6 py-4 border-b border-border dark:border-white/10 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-text dark:text-white">
                  {selected.title}
                </h3>
                <p className="text-sm text-muted dark:text-gray-400 mt-0.5">
                  {selected.location} · {selected.contract}
                </p>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="p-2 hover:bg-gray-100 dark:hover:bg-white/10 rounded-lg"
                aria-label="Fermer"
              >
                <X className="w-5 h-5 text-muted" />
              </button>
            </div>

            <div className="px-6 py-6 space-y-6">
              <section>
                <h4 className="font-semibold text-text dark:text-white mb-2">Missions</h4>
                <ul className="space-y-2">
                  {selected.missions.map((m) => (
                    <li key={m} className="flex gap-2 text-sm text-muted dark:text-gray-400">
                      <span className="text-primary-500 mt-0.5">•</span>
                      {m}
                    </li>
                  ))}
                </ul>
              </section>

              <section>
                <h4 className="font-semibold text-text dark:text-white mb-2">Profil recherché</h4>
                <ul className="space-y-2">
                  {selected.profile.map((p) => (
                    <li key={p} className="flex gap-2 text-sm text-muted dark:text-gray-400">
                      <span className="text-primary-500 mt-0.5">•</span>
                      {p}
                    </li>
                  ))}
                </ul>
              </section>

              <section>
                <h4 className="font-semibold text-text dark:text-white mb-2">Postuler</h4>
                <p className="text-sm text-muted dark:text-gray-400 mb-4">
                  Envoyez votre CV et quelques lignes sur un problème scolaire que vous aimeriez
                  voir résolu par un logiciel.
                </p>
                <a
                  href={`mailto:recrutement@schoolflow.com?subject=${encodeURIComponent(
                    `Candidature — ${selected.title}`
                  )}`}
                  className="btn-primary inline-flex items-center gap-2"
                >
                  Envoyer ma candidature
                </a>
              </section>
            </div>
          </motion.div>
        </div>
      )}
    </MarketingLayout>
  );
}
