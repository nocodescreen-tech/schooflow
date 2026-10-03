import { useState } from 'react';
import { motion } from 'motion/react';
import { Calendar, Clock, ArrowRight, Search } from 'lucide-react';
import MarketingLayout from '../components/MarketingLayout';

interface Post {
  slug: string;
  title: string;
  excerpt: string;
  category: string;
  date: string;
  readingTime: string;
  body: string[];
}

const POSTS: Post[] = [
  {
    slug: 'remplacer-les-registres-papier',
    title: 'Remplacer les registres papier sans perdre la discipline',
    excerpt:
      'La grille de présence ne remplace pas l’appel : elle l’accélère. Voici comment l’adopter sans perdre le rituel.',
    category: 'Présences',
    date: '2024-11-18',
    readingTime: '6 min',
    body: [
      'Dans la plupart des établissements, l’appel se fait à l’oral dans la classe. Le problème commence après : les absences sont notées sur un cahier, saisies dans un tableur le soir, et ne sont plus jamais relues.',
      'La bonne approche consiste à garder le rituel — l’enseignant appelle les élèves — mais à tracer la présence en trois secondes depuis le téléphone ou la tablette. Le marqueur est proposé, la justification est optionnelle, et la synthèse est immédiate.',
      'Ce qui change concrètement : le directeur n’a plus à réclamer « le cahier des absences ». Les parents voient la situation de leur enfant. Et à la fin du trimestre, le nombre d’heures d’absence est déjà prêt pour le bulletin.',
    ],
  },
  {
    slug: 'bulletin-sans-ressaisie',
    title: 'Un bulletin sans double saisie',
    excerpt:
      'Le vrai coût d’un bulletin, ce n’est pas l’impression. C’est la recopie des notes depuis le tableur du professeur dans le document officiel.',
    category: 'Académique',
    date: '2024-10-29',
    readingTime: '8 min',
    body: [
      'Un bulletin scolaire comporte une dizaine de lignes : une par matière, avec un coefficient, des évaluations, une moyenne, un rang. Si ces valeurs viennent d’un tableur, il faut les recopier une par une — et chaque recopie est une occasion d’erreur.',
      'La bonne architecture part du modèle : un document est défini une fois (en-tête, tableau, signature), puis alimenté automatiquement par les notes réelles de l’élève pour la période concernée.',
      'Résultat : le bulletin généré est identique à ce que le conseil a validé, mais il ne peut plus contenir une valeur erronée, parce qu’aucune valeur n’est saisie à la main.',
    ],
  },
  {
    slug: 'encaissements-sans-casse',
    title: 'Encaisser sans perdre la trace',
    excerpt:
      'Un reçu sans numéro unique et un paiement sans journal d’audit, c’est une caisse qui ne saura plus rien prouver dans six mois.',
    category: 'Finances',
    date: '2024-10-07',
    readingTime: '5 min',
    body: [
      'La première question d’un contrôleur, d’un parent ou d’un auditeur est toujours la même : « pouvez-vous me prouver ce mouvement ? ». Cette preuve, c’est la transaction horodatée, le reçu numéroté et la ligne de journal associated.',
      'Une opération d’encaissement correcte suit toujours le même chemin : vérifier l’élève, vérifier le frais, vérifier le montant, créer le paiement, mettre à jour le solde, générer le numéro de reçu, écrire le journal — le tout dans une seule transaction. Si une étape échoue, rien n’est écrit.',
      'C’est cette atomicité qui rend la caisse défendable. Pas la vigilance d’un comptable à la fin du mois.',
    ],
  },
  {
    slug: 'emploi-du-temps-conflits',
    title: 'Détecter les conflits avant qu’ils ne deviennent des journées perdus',
    excerpt:
      'Deux classes dans la même salle, un enseignant à deux endroits : les conflits d’emploi du temps se voient à la saisie, pas le jour de l’examen.',
    category: 'Organisation',
    date: '2024-09-12',
    readingTime: '6 min',
    body: [
      'Un emploi du temps se remplit par incrémentations : on ajoute un cours, on déplace un cours, on change un enseignant. Chaque modification peut créer une impossibilité physique.',
      'La vérification se fait au moment de l’enregistrement : si l’enseignant est déjà occupé sur ce créneau, si la salle est déjà prise, si la classe a déjà cours — la création est refusée avec la raison exacte.',
      'Ce contrôle prend quelques dizaines de millisecondes. Le coût d’un conflit non détecté, lui, se compte en heures : classe déplacée, élèves bloqués, salles improvisées.',
    ],
  },
];

const CATEGORIES = ['Tous', 'Présences', 'Académique', 'Finances', 'Organisation'];

export default function Blog() {
  const [category, setCategory] = useState('Tous');
  const [search, setSearch] = useState('');
  const [activeSlug, setActiveSlug] = useState<string | null>(null);

  const filtered = POSTS.filter((p) => {
    if (category !== 'Tous' && p.category !== category) return false;
    if (search) {
      const q = search.toLowerCase();
      return p.title.toLowerCase().includes(q) || p.excerpt.toLowerCase().includes(q);
    }
    return true;
  });

  const active = POSTS.find((p) => p.slug === activeSlug) ?? null;

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

  if (active) {
    return (
      <MarketingLayout title={active.title} subtitle={active.excerpt}>
        <article className="max-w-3xl">
          <div className="flex flex-wrap items-center gap-4 text-sm text-muted dark:text-gray-400 mb-6">
            <span className="badge badge-info">{active.category}</span>
            <span className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" /> {formatDate(active.date)}
            </span>
            <span className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" /> {active.readingTime}
            </span>
          </div>

          <div className="space-y-5 text-muted dark:text-gray-400 leading-relaxed">
            {active.body.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>

          <button
            onClick={() => setActiveSlug(null)}
            className="btn-secondary mt-10 flex items-center gap-2"
          >
            <ArrowRight className="w-4 h-4 rotate-180" /> Tous les articles
          </button>
        </article>
      </MarketingLayout>
    );
  }

  return (
    <MarketingLayout
      title="Blog"
      subtitle="Notes d’usage sur la gestion scolaire : ce qui fonctionne dans un établissement, et pourquoi."
    >
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between mb-8">
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                category === c
                  ? 'border-primary-500 text-primary-500 bg-primary-500/10 font-medium'
                  : 'border-border dark:border-white/10 text-muted dark:text-gray-400 hover:border-primary-500/40'
              }`}
            >
              {c}
            </button>
          ))}
        </div>

        <div className="relative sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un article"
            className="input-field pl-9"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-muted dark:text-gray-400 mb-4">Aucun article ne correspond.</p>
          <button
            onClick={() => {
              setSearch('');
              setCategory('Tous');
            }}
            className="btn-secondary"
          >
            Réinitialiser les filtres
          </button>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map((post, i) => (
            <motion.button
              key={post.slug}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.05 }}
              onClick={() => setActiveSlug(post.slug)}
              className="card p-6 text-left hover:border-primary-500/40 transition-colors"
            >
              <div className="flex items-center gap-3 text-xs text-muted dark:text-gray-400 mb-3">
                <span className="badge badge-info">{post.category}</span>
                <span>{formatDate(post.date)}</span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" /> {post.readingTime}
                </span>
              </div>
              <h2 className="font-semibold text-text dark:text-white leading-snug mb-2">
                {post.title}
              </h2>
              <p className="text-sm text-muted dark:text-gray-400 leading-relaxed line-clamp-3">
                {post.excerpt}
              </p>
              <span className="inline-flex items-center gap-1.5 text-sm text-primary-500 mt-4 font-medium">
                Lire l’article <ArrowRight className="w-3.5 h-3.5" />
              </span>
            </motion.button>
          ))}
        </div>
      )}
    </MarketingLayout>
  );
}
