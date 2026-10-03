import { motion } from 'motion/react';
import { School, Users, Shield, Globe, Target, Heart } from 'lucide-react';
import MarketingLayout from '../components/MarketingLayout';

const VALUES = [
  {
    icon: School,
    title: 'Conçu pour les établissements',
    desc: 'Chaque écran correspond à une journée réelle de travail : la sonnerie, la grille de notes, l’encaissement à la récréation, le conseil de classe.',
  },
  {
    icon: Users,
    title: 'Les équipes d’abord',
    desc: 'Direction, secrétariat, enseignants, comptabilité, parents : chacun voit exactement ce dont il a besoin, et rien de plus.',
  },
  {
    icon: Shield,
    title: 'La donnée avant tout',
    desc: 'Chaque école est cloisonnée. Aucune donnée d’un établissement ne peut fuiter vers un autre, quelle que soit la configuration.',
  },
  {
    icon: Globe,
    title: 'Pensé pour le terrain',
    desc: 'Interface en français, fonctionne sur connexion lente, exportable et imprimable — parce qu’une école ne s’arrête pas quand le réseau tombe.',
  },
];

const TIMELINE = [
  { year: 'Année 1', text: 'Premier établissement équipé. Le suivi des présences et des frais remplace les registres papier.' },
  { year: 'Année 2', text: 'Les bulletins PDF, les reçus et la caisse arrivent. La comptabilité arrête de ressaisir les paiements.' },
  { year: 'Année 3', text: 'Multi-établissements, emploi du temps avec détection de conflits, journal d’audit complet.' },
  { year: 'Aujourd’hui', text: 'Éditeur de documents : l’administration compose ses propres bulletins et billets de vacances.' },
];

const STATS = [
  { value: '9', label: 'modules métier' },
  { value: '8', label: 'rôles utilisateurs' },
  { value: '100%', label: 'des calculs côté serveur' },
  { value: '0', label: 'donnée partagée entre écoles' },
];

export default function About() {
  return (
    <MarketingLayout
      title="À propos de SCHOOLFLOW"
      subtitle="SCHOOLFLOW est un logiciel de gestion scolaire conçu pour être utilisé tous les jours par les établissements, pas une démonstration."
    >
      <section className="max-w-3xl space-y-5 text-muted dark:text-gray-400 leading-relaxed">
        <p>
          SCHOOLFLOW est né d’un constat simple : la plupart des écoles gèrent encore leurs
          élèves, leurs notes et leurs finances avec plusieurs fichiers Excel, un registre
          papier et des messages WhatsApp. L’information est partout, mais elle n’est reliée nulle
          part.
        </p>
        <p>
          Nous avons construit l’outil que ces établissements méritaient : une seule application,
          des rôles clairement définis, des calculs fiables et des documents officiels générés
          automatiquement. Pas de simulateur, pas de bouton décoratif — chaque fonction est
          branchée à la base de données.
        </p>
      </section>

      <section className="mt-14 grid grid-cols-2 lg:grid-cols-4 gap-4">
        {STATS.map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.05 }}
            className="card p-5 text-center"
          >
            <div className="text-3xl font-bold text-primary-500">{s.value}</div>
            <div className="text-sm text-muted dark:text-gray-400 mt-1">{s.label}</div>
          </motion.div>
        ))}
      </section>

      <section className="mt-16">
        <h2 className="text-2xl font-bold text-text dark:text-white mb-8">Notre façon de travailler</h2>
        <div className="grid sm:grid-cols-2 gap-6">
          {VALUES.map((v, i) => {
            const Icon = v.icon;
            return (
              <motion.div
                key={v.title}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.05 }}
                className="card p-6"
              >
                <div className="w-11 h-11 rounded-xl bg-primary-500/10 flex items-center justify-center mb-4">
                  <Icon className="w-5 h-5 text-primary-500" />
                </div>
                <h3 className="font-semibold text-text dark:text-white">{v.title}</h3>
                <p className="text-sm text-muted dark:text-gray-400 mt-2 leading-relaxed">
                  {v.desc}
                </p>
              </motion.div>
            );
          })}
        </div>
      </section>

      <section className="mt-16">
        <h2 className="text-2xl font-bold text-text dark:text-white mb-8">Notre parcours</h2>
        <ol className="relative border-l-2 border-border dark:border-white/10 ml-3 space-y-8">
          {TIMELINE.map((t, i) => (
            <motion.li
              key={t.year}
              initial={{ opacity: 0, x: -8 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.06 }}
              className="ml-6"
            >
              <span className="absolute -left-[9px] w-4 h-4 rounded-full bg-primary-500 border-2 border-white dark:border-dark" />
              <div className="text-sm font-semibold text-primary-500">{t.year}</div>
              <p className="text-muted dark:text-gray-400 mt-1.5 leading-relaxed">{t.text}</p>
            </motion.li>
          ))}
        </ol>
      </section>

      <section className="mt-16 card p-8 text-center bg-background dark:bg-[#0B1120] border-primary-500/20">
        <Target className="w-8 h-8 text-primary-500 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-text dark:text-white">Notre objectif</h2>
        <p className="text-muted dark:text-gray-400 mt-3 max-w-2xl mx-auto leading-relaxed">
          Qu’une école puisse administrer ses dossiers, ses notes et ses comptes sans dépendre
          d’un tableur ni d’une disponibilité internet — et que la direction puisse répondre à
          n’importe quelle question sur sa situation en moins d’une minute.
        </p>
      </section>

      <div className="mt-8 flex items-center justify-center gap-2 text-sm text-muted dark:text-gray-400">
        <Heart className="w-4 h-4 text-primary-500" />
        Fait pour les équipes qui tiennent une école debout chaque jour.
      </div>
    </MarketingLayout>
  );
}
