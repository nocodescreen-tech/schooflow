import { motion } from 'motion/react';
import MarketingLayout from '../components/MarketingLayout';

type LegalKind = 'privacy' | 'terms' | 'gdpr';

interface Section {
  title: string;
  paragraphs: string[];
  list?: string[];
}

const CONTENT: Record<LegalKind, { title: string; subtitle: string; updated: string; sections: Section[] }> = {
  privacy: {
    title: 'Politique de confidentialité',
    subtitle:
      'Ce que SCHOOLFLOW collecte, pourquoi, et comment les données restent cloisonnées par établissement.',
    updated: '12 novembre 2024',
    sections: [
      {
        title: 'Responsable du traitement',
        paragraphs: [
          'SCHOOLFLOW est un logiciel de gestion scolaire exploité pour le compte d’établissements. Chaque école est responsable des données qu’elle saisit ; SCHOOLFLOW agit comme sous-traitant technique, sur instruction de l’établissement.',
          'Pour toute question relative à vos données, contactez l’administration de votre école, ou écrivez à privacy@schoolflow.com.',
        ],
      },
      {
        title: 'Données collectées',
        paragraphs: ['SCHOOLFLOW traite les catégories de données suivantes :'],
        list: [
          'Données d’identification : nom, prénom, date et lieu de naissance, matricule, photographie.',
          'Données de contact : adresse, téléphone, e-mail — élèves comme responsables légaux.',
          'Données scolaires : classe, notes, moyennes, absences, sanctions, observations.',
          'Données financières : frais scolaires, paiements, reçus, situation de la caisse.',
          'Données de connexion : adresse IP, user agent, date et heure des connexions et actions sensibles.',
        ],
      },
      {
        title: 'Finalités et base légale',
        paragraphs: [
          'Les données sont traitées pour l’exécution du service scolaire contraté : gestion des dossiers, calcul des moyennes, édition des bulletins, suivi des frais et obligations comptables.',
          'Les données de connexion et le journal d’audit sont conservés pour des raisons de sécurité et de traçabilité, afin de détecter un usage abusif et de prouver l’origine d’une opération sensible.',
        ],
      },
      {
        title: 'Cloisonnement par établissement',
        paragraphs: [
          'Chaque requête API dérive l’identifiant de l’établissement depuis le jeton de session, jamais depuis le corps de la requête. Un utilisateur d’une école ne peut donc pas lire, modifier ou supprimer les données d’une autre école, y compris en appelant directement l’API.',
        ],
      },
      {
        title: 'Conservation',
        paragraphs: [
          'Les données scolaires sont conservées pendant la durée des études de l’élève, puis selon les obligations légales de l’établissement (archives administratives).',
          'Les journaux d’audit et les données de connexion sont conservés 12 mois. Les fichiers médias supprimés sont retirés du stockage dans les meilleurs délais après suppression.',
        ],
      },
      {
        title: 'Vos droits',
        paragraphs: [
          'Conformément à la réglementation applicable, vous disposez d’un droit d’accès, de rectification, d’effacement, de limitation et d’opposition.',
          'Ces droits s’exercent auprès de l’établissement qui détient la donnée. SCHOOLFLOW fournit à l’administration les outils nécessaires pour répondre à ces demandes dans les meilleurs délais.',
        ],
      },
    ],
  },

  terms: {
    title: 'Conditions générales d’utilisation',
    subtitle: 'Les règles d’utilisation du logiciel SCHOOLFLOW pour un établissement scolaire.',
    updated: '12 novembre 2024',
    sections: [
      {
        title: 'Objet',
        paragraphs: [
          'Les présentes conditions régissent l’utilisation du logiciel SCHOOLFLOW, fourni à un établissement scolaire pour la gestion de ses élèves, de son personnel, de ses évaluations et de ses finances.',
          'Toute utilisation du logiciel implique l’acceptation des présentes conditions.',
        ],
      },
      {
        title: 'Comptes et accès',
        paragraphs: ['L’accès au logiciel est personnel et nominatif. L’établissement est responsable :'],
        list: [
          'De la création des comptes et du choix des rôles (direction, secrétariat, enseignant, comptabilité, parent, élève).',
          'De la confidentialité des identifiants et de leur remise aux personnes concernées.',
          'De la désactivation immédiate d’un compte dont l’utilisateur a quitté l’établissement.',
        ],
      },
      {
        title: 'Rôles et permissions',
        paragraphs: [
          'Les droits de chaque utilisateur sont vérifiés côté serveur, à chaque requête. Une action refusée dans l’interface l’est également si elle est appelée directement via l’API.',
          'Masquer un bouton dans l’interface ne constitue pas une mesure de sécurité : c’est le contrôle serveur qui fait foi.',
        ],
      },
      {
        title: 'Obligations de l’établissement',
        paragraphs: ['L’établissement s’engage à :'],
        list: [
          'Saisir des informations exactes et les maintenir à jour.',
          'Recueillir les autorisations parentales requises pour le traitement des données des mineurs.',
          'Ne pas utiliser le logiciel pour collecte des données à des fins sans rapport avec la gestion scolaire.',
        ],
      },
      {
        title: 'Intégrité des données financières',
        paragraphs: [
          'Tout encaissement, toute annulation de paiement et toute clôture de caisse sont enregistrés dans une transaction unique. Si une étape échoue, l’opération entière est annulée : aucune écriture partielle n’est possible.',
          'Aucune suppression silencieuse d’une opération financière n’est effectuée. Les écritures sont archivées et restent traçables dans le journal d’audit.',
        ],
      },
      {
        title: 'Disponibilité',
        paragraphs: [
          'SCHOOLFLOW vise une disponibilité continue. Une interruption planifiée est annoncée à l’avance et limitée aux opérations de maintenance.',
        ],
      },
    ],
  },

  gdpr: {
    title: 'Conformité RGPD',
    subtitle: 'Comment SCHOOLFLOW met en œuvre le Règlement européen sur la protection des données.',
    updated: '12 novembre 2024',
    sections: [
      {
        title: 'Principes appliqués',
        paragraphs: ['Le traitement des données personnelles repose sur les principes du RGPD :'],
        list: [
          'Licéité, transparence et finalités : chaque usage est documenté et communiqué.',
          'Minimisation : seules les données nécessaires à la gestion scolaire sont collectées.',
          'Exactitude : les données sont modifiables par l’établissement à tout moment.',
          'Limitation de conservation : les durées de conservation sont définies et appliquées.',
          'Sécurité : chiffrement des échanges, mots de passe hachés, contrôle d’accès par rôle.',
        ],
      },
      {
        title: 'Données sensibles',
        paragraphs: [
          'SCHOOLFLOW ne traite pas de catégories particulière de données au sens de l’article 9 du RGPD (santé, opinions politiques, convictions religieuses, etc.).',
          'Lorsqu’une information de santé est nécessaire (certificat médical, aménagement d’emploi du temps), elle est déposée par l’établissement dans un espace documentaire protégé, et non saisie dans les champs de notes.',
        ],
      },
      {
        title: 'Sous-traitants',
        paragraphs: [
          'L’établissement reste responsable de traitement. SCHOOLFLOW intervient comme sous-traitant de données au sens de l’article 28 du RGPD, en application des conditions générales conclues avec lui.',
          'Les hébergeurs et prestataires techniques intervenant dans l’infrastructure sont sélectionnés selon des garanties appropriées (localisation de l’hébergement, chiffrement, sauvegardes).',
        ],
      },
      {
        title: 'Sécurité des données',
        paragraphs: [
          'Les mots de passe ne sont jamais stockés en clair : ils sont hachés avec un algorithme à sel.',
          'Les jetons de session sont signés, expirent, et sont transmis dans des cookies httpOnly afin de limiter le risque de vol par script.',
          'Les requêtes sont validées avant traitement, et l’accès à chaque ressource est contrôlé côté serveur.',
        ],
      },
      {
        title: 'Vos droits et contact',
        paragraphs: [
          'Vous pouvez exercer vos droits d’accès, de rectification, d’effacement, de limitation, d’opposition et de portabilité en vous adressant à l’établissement responsable du traitement.',
          'Pour toute question relative au RGPD ou pour déposer une réclamation : privacy@schoolflow.com.',
        ],
      },
    ],
  },
};

export default function Legal({ kind }: { kind: LegalKind }) {
  const doc = CONTENT[kind];

  return (
    <MarketingLayout title={doc.title} subtitle={doc.subtitle}>
      <p className="text-sm text-muted dark:text-gray-400 mb-10">
        Dernière mise à jour : {doc.updated}
      </p>

      <div className="max-w-3xl space-y-10">
        {doc.sections.map((section, i) => (
          <motion.section
            key={section.title}
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.04 }}
          >
            <h2 className="text-lg font-semibold text-text dark:text-white mb-3">
              {section.title}
            </h2>
            <div className="space-y-3 text-muted dark:text-gray-400 leading-relaxed">
              {section.paragraphs.map((p, pi) => (
                <p key={pi}>{p}</p>
              ))}
              {section.list && (
                <ul className="space-y-2 pt-1">
                  {section.list.map((item) => (
                    <li key={item} className="flex gap-2">
                      <span className="text-primary-500 mt-0.5">•</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </motion.section>
        ))}
      </div>
    </MarketingLayout>
  );
}
