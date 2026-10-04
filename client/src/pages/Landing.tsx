import { useState } from 'react';
import { motion } from 'motion/react';
import { Link } from 'react-router-dom';
import {
  GraduationCap,
  Users,
  ClipboardList,
  CalendarCheck,
  Receipt,
  CreditCard,
  FileText,
  BarChart3,
  Shield,
  Zap,
  Globe,
  ArrowRight,
  Check,
  Star,
  Rocket,
  LifeBuoy,
  Headphones,
  Server,
  Lock,
  Palette,
  Menu,
  X,
} from 'lucide-react';
import { useLanguageStore } from '../store/languageStore';
import LanguageSwitcher from '../components/LanguageSwitcher';

const modules = [
  { icon: Users, title: 'Élèves', desc: 'Gestion complète des élèves, inscriptions et dossiers' },
  { icon: ClipboardList, title: 'Notes', desc: 'Saisie et suivi des notes par classe et matière' },
  { icon: CalendarCheck, title: 'Présences', desc: 'Marquage quotidien des présences et absences' },
  { icon: Receipt, title: 'Frais', desc: 'Gestion des frais scolaires et échéances' },
  { icon: CreditCard, title: 'Paiements', desc: 'Enregistrement et suivi des paiements' },
  { icon: FileText, title: 'Bulletins', desc: 'Génération automatique des bulletins scolaires' },
];

const features = [
  { icon: BarChart3, title: 'Analytique', desc: 'Tableaux de bord et rapports en temps réel' },
  { icon: Shield, title: 'Sécurisé', desc: 'Données chiffrées et conformes RGPD' },
  { icon: Zap, title: 'Rapide', desc: 'Performance optimale, interface réactive' },
  { icon: Globe, title: 'Multilingue', desc: 'Français et anglais, extensible' },
];

const planFormation = [
  { icon: Rocket, title: 'Déploiement', desc: 'Installation et paramétrage de votre établissement, classes et utilisateurs' },
  { icon: GraduationCap, title: 'Formation', desc: 'Prise en main des équipes : direction, enseignants, secrétariat, comptabilité' },
  { icon: LifeBuoy, title: 'Assistance', desc: 'Support technique et maintenance de votre instance SCHOOLFLOW' },
];

const fadeUp = {
  initial: { opacity: 0, y: 30 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-100px' },
  transition: { duration: 0.5, ease: [0.2, 0, 0, 1] as [number, number, number, number] },
};

export default function Landing() {
  const { t } = useLanguageStore();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-surface">
      {/* ── Navbar ── */}
      <nav className="fixed top-0 left-0 right-0 z-topbar bg-surface/80 backdrop-blur-xl border-b border-border dark:border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link to="/" className="flex items-center gap-2.5" aria-label="SCHOOLFLOW - Accueil">
              <div className="w-9 h-9 bg-accent rounded-xl flex items-center justify-center">
                <GraduationCap className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-bold text-text dark:text-white tracking-tight">
                SCHOOL<span className="text-accent">FLOW</span>
              </span>
            </Link>

            <div className="hidden md:flex items-center gap-8">
              <a href="#modules" className="text-sm font-medium text-text-muted hover:text-text dark:hover:text-white transition-colors">Modules</a>
              <a href="#features" className="text-sm font-medium text-text-muted hover:text-text dark:hover:text-white transition-colors">Fonctionnalités</a>
              <a href="#quotidien" className="text-sm font-medium text-text-muted hover:text-text dark:hover:text-white transition-colors">Au quotidien</a>
              <a href="#accompagnement" className="text-sm font-medium text-text-muted hover:text-text dark:hover:text-white transition-colors">Accompagnement</a>
            </div>

            <div className="flex items-center gap-3">
              <LanguageSwitcher compact />
              <Link to="/login" className="btn-ghost text-sm hidden sm:inline-flex">Connexion</Link>
              <Link to="/register" className="btn-primary text-sm hidden sm:inline-flex">Commencer</Link>
              <button
                className="md:hidden p-2 hover:bg-surface-hover rounded-xl transition-colors"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                aria-expanded={mobileMenuOpen}
                aria-label={mobileMenuOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
              >
                {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>

        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden border-t border-border dark:border-white/10 px-4 py-4 space-y-3"
          >
            <a href="#modules" className="block text-sm font-medium text-text-muted hover:text-text">Modules</a>
            <a href="#features" className="block text-sm font-medium text-text-muted hover:text-text">Fonctionnalités</a>
            <a href="#quotidien" className="block text-sm font-medium text-text-muted hover:text-text">Au quotidien</a>
            <a href="#accompagnement" className="block text-sm font-medium text-text-muted hover:text-text">Accompagnement</a>
            <div className="flex gap-2 pt-2">
              <Link to="/login" className="btn-ghost text-sm flex-1">Connexion</Link>
              <Link to="/register" className="btn-primary text-sm flex-1">Commencer</Link>
            </div>
          </motion.div>
        )}
      </nav>

      {/* ── Hero ── */}
      <section className="pt-32 pb-20 px-4 sm:px-6 lg:px-8 overflow-hidden">
        <div className="max-w-7xl mx-auto">
          <div className="text-center max-w-4xl mx-auto">
            <motion.div {...fadeUp} style={{ transitionDelay: '0ms' }}>
              <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-accent-subtle text-accent-text text-sm font-medium mb-6">
                <Star className="w-4 h-4" />
                Nouveau : Portail Parent disponible
              </span>
            </motion.div>
            <motion.h1
              {...fadeUp}
              style={{ transitionDelay: '100ms' }}
              className="text-4xl sm:text-5xl lg:text-6xl font-bold text-text dark:text-white leading-tight tracking-tight"
            >
              Gérer votre école, <span className="text-accent">en un seul flux</span>.
            </motion.h1>
            <motion.p
              {...fadeUp}
              style={{ transitionDelay: '200ms' }}
              className="mt-6 text-lg sm:text-xl text-text-muted dark:text-gray-400 max-w-2xl mx-auto leading-relaxed"
            >
              Scolarité, notes, présences, finance et documents officiels — centralisés dans une plateforme unique, conçue pour les établissements de la RDC.
            </motion.p>
            <motion.div
              {...fadeUp}
              style={{ transitionDelay: '300ms' }}
              className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4"
            >
              <Link to="/register" className="btn-primary btn-lg px-8 flex items-center gap-2">
                {t('landing.getStarted') || 'Commencer gratuitement'}
                <ArrowRight className="w-5 h-5" />
              </Link>
              <a href="#modules" className="btn-secondary btn-lg px-8">
                {t('landing.learnMore') || 'Découvrir les modules'}
              </a>
            </motion.div>
          </div>

          {/* Hero Image / Dashboard Preview */}
          <motion.div
            {...fadeUp}
            style={{ transitionDelay: '400ms' }}
            className="mt-16 relative"
          >
            <div className="relative bg-surface-raised rounded-2xl border border-border dark:border-white/10 shadow-lg overflow-hidden">
              <div className="bg-surface-sunken px-4 py-3 flex items-center gap-2 border-b border-border dark:border-white/10">
                <div className="w-3 h-3 rounded-full bg-red-400" />
                <div className="w-3 h-3 rounded-full bg-yellow-400" />
                <div className="w-3 h-3 rounded-full bg-green-400" />
                <span className="ml-4 text-xs text-text-muted">app.schoolflow.io/dashboard</span>
              </div>
              <div className="p-6 bg-surface">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { label: 'Élèves', value: '1 247', color: 'bg-accent' },
                    { label: 'Enseignants', value: '58', color: 'bg-purple-500' },
                    { label: 'Présence', value: '94,2%', color: 'bg-success' },
                    { label: 'Revenus', value: '12 450 $', color: 'bg-warning' },
                  ].map((stat, i) => (
                    <motion.div
                      key={stat.label}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.5 + i * 0.08, duration: 0.4, ease: [0.2, 0, 0, 1] as [number, number, number, number] }}
                      className="bg-surface-raised rounded-xl p-4 border border-border dark:border-white/10"
                    >
                      <div className={`w-2 h-2 ${stat.color} rounded-full mb-2`} />
                      <p className="text-2xl font-bold text-text dark:text-white">{stat.value}</p>
                      <p className="text-xs text-text-muted dark:text-gray-400 mt-1">{stat.label}</p>
                    </motion.div>
                  ))}
                </div>
                <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-surface-raised rounded-xl p-4 border border-border dark:border-white/10 md:col-span-2">
                    <p className="text-sm font-medium text-text-muted mb-3">Revenus par mois</p>
                    <div className="flex items-end gap-2 h-32">
                      {[40, 65, 45, 80, 55, 90, 70, 85, 60, 95, 75, 88].map((h, i) => (
                        <motion.div
                          key={i}
                          initial={{ height: 0 }}
                          animate={{ height: `${h}%` }}
                          transition={{ delay: 0.7 + i * 0.04, duration: 0.5, ease: [0.2, 0, 0, 1] as [number, number, number, number] }}
                          className="flex-1 bg-accent/20 rounded-t-md"
                        />
                      ))}
                    </div>
                  </div>
                  <div className="bg-surface-raised rounded-xl p-4 border border-border dark:border-white/10">
                    <p className="text-sm font-medium text-text-muted mb-3">Répartition présences</p>
                    <div className="space-y-3">
                      {[
                        { label: 'Présent', value: 85, color: 'bg-success' },
                        { label: 'Absent', value: 10, color: 'bg-danger' },
                        { label: 'Retard', value: 5, color: 'bg-warning' },
                      ].map((item) => (
                        <div key={item.label}>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-text-muted">{item.label}</span>
                            <span className="font-medium text-text">{item.value}%</span>
                          </div>
                          <div className="h-2 bg-surface-sunken rounded-full overflow-hidden">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${item.value}%` }}
                              transition={{ delay: 0.9, duration: 0.5, ease: [0.2, 0, 0, 1] as [number, number, number, number] }}
                              className={`h-full ${item.color} rounded-full`}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── Problem Section ── */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-surface-sunken dark:bg-slate-950">
        <div className="max-w-7xl mx-auto">
          <motion.div {...fadeUp} className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-text dark:text-white">
              La gestion scolaire ne devrait pas être un cauchemar
            </h2>
            <p className="mt-4 text-lg text-text-muted dark:text-gray-400 max-w-2xl mx-auto">
              Fiches papier, tableurs complexes, outils dispersés — perdez du temps sur l'administratif au lieu de vous concentrer sur l'éducation.
            </p>
          </motion.div>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { title: 'Processus manuels', desc: 'Saisie papier, erreurs fréquentes, données perdues' },
              { title: 'Outils fragmentés', desc: 'Plusieurs logiciels qui ne communiquent pas entre eux' },
              { title: 'Manque de visibilité', desc: 'Pas de tableau de bord, décisions à l\'aveugle' },
            ].map((item, i) => (
              <motion.div
                key={item.title}
                {...fadeUp}
                style={{ transitionDelay: `${i * 100}ms` }}
                className="bg-surface-raised rounded-2xl p-6 border border-border dark:border-white/10 card-hover"
              >
                <div className="w-10 h-10 bg-danger-soft dark:bg-red-500/10 rounded-xl flex items-center justify-center mb-4">
                  <span className="text-danger text-lg">✕</span>
                </div>
                <h3 className="text-lg font-semibold text-text dark:text-white mb-2">{item.title}</h3>
                <p className="text-text-muted dark:text-gray-400">{item.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Solution Flow ── */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <motion.div {...fadeUp} className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-text dark:text-white">
              Une plateforme. Tous vos besoins.
            </h2>
            <p className="mt-4 text-lg text-text-muted dark:text-gray-400 max-w-2xl mx-auto">
              SCHOOLFLOW centralise toute la gestion de votre école dans une interface unique et intuitive.
            </p>
          </motion.div>
          <div className="grid md:grid-cols-4 gap-6">
            {[
              { step: '01', title: 'Inscrivez', desc: 'Créez votre compte en 2 minutes' },
              { step: '02', title: 'Configurez', desc: 'Ajoutez classes, élèves et enseignants' },
              { step: '03', title: 'Gérez', desc: 'Notes, présences, frais au quotidien' },
              { step: '04', title: 'Analysez', desc: 'Tableaux de bord et rapports' },
            ].map((item, i) => (
              <motion.div
                key={item.step}
                {...fadeUp}
                style={{ transitionDelay: `${i * 100}ms` }}
                className="relative"
              >
                <div className="bg-surface-raised dark:bg-slate-900 rounded-2xl p-6 border border-border dark:border-white/10 h-full">
                  <span className="text-4xl font-bold text-accent/20">{item.step}</span>
                  <h3 className="text-lg font-semibold text-text dark:text-white mt-3 mb-2">{item.title}</h3>
                  <p className="text-sm text-text-muted dark:text-gray-400">{item.desc}</p>
                </div>
                {i < 3 && (
                  <div className="hidden md:block absolute top-1/2 -right-3 transform -translate-y-1/2">
                    <ArrowRight className="w-6 h-6 text-accent/30" />
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Modules Grid ── */}
      <section id="modules" className="py-20 px-4 sm:px-6 lg:px-8 bg-surface-sunken dark:bg-slate-950">
        <div className="max-w-7xl mx-auto">
          <motion.div {...fadeUp} className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-text dark:text-white">Modules complets</h2>
            <p className="mt-4 text-lg text-text-muted dark:text-gray-400">Tout ce dont votre école a besoin</p>
          </motion.div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {modules.map((mod, i) => (
              <motion.div
                key={mod.title}
                {...fadeUp}
                style={{ transitionDelay: `${i * 50}ms` }}
                className="bg-surface-raised rounded-2xl p-6 border border-border dark:border-white/10 card-hover"
              >
                <div className="w-12 h-12 bg-accent-subtle rounded-xl flex items-center justify-center mb-4">
                  <mod.icon className="w-6 h-6 text-accent" />
                </div>
                <h3 className="text-lg font-semibold text-text dark:text-white mb-2">{mod.title}</h3>
                <p className="text-sm text-text-muted dark:text-gray-400">{mod.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section id="features" className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <motion.div {...fadeUp} className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-text dark:text-white">Pourquoi SCHOOLFLOW ?</h2>
          </motion.div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((feat, i) => (
              <motion.div
                key={feat.title}
                {...fadeUp}
                style={{ transitionDelay: `${i * 100}ms` }}
                className="text-center"
              >
                <div className="w-14 h-14 bg-accent rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <feat.icon className="w-7 h-7 text-white" />
                </div>
                <h3 className="text-lg font-semibold text-text dark:text-white mb-2">{feat.title}</h3>
                <p className="text-sm text-text-muted dark:text-gray-400">{feat.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Au quotidien ── */}
      <section id="quotidien" className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <motion.div {...fadeUp} className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold text-text dark:text-white">
              Au quotidien, dans votre établissement
            </h2>
            <p className="mt-4 text-lg text-text-muted dark:text-gray-400 max-w-2xl mx-auto">
              SCHOOLFLOW ne sert pas une fois par an. Il suit le travail de vos équipes, chaque jour.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                img: '/img/scene-classroom.svg',
                title: 'Pendant le cours',
                role: 'Enseignant',
                desc: 'Marquer la présence, saisir les notes, consulter l\'emploi du temps de la classe — depuis la salle.',
              },
              {
                img: '/img/teacher-at-desk.svg',
                title: 'À la fin de la journée',
                role: 'Professeur principal',
                desc: 'Relancer les parents, vérifier les Bulletins en attente, corriger une évaluation avant le soir.',
              },
              {
                img: '/img/scene-secretary.svg',
                title: 'À la caisse',
                role: 'Secrétariat / comptabilité',
                desc: 'Enregistrer un paiement, éditer le reçu, clôturer la journée et rapprocher le solde.',
              },
            ].map((item, i) => (
              <motion.div
                key={item.title}
                {...fadeUp}
                style={{ transitionDelay: `${i * 80}ms` }}
                className="card card-hover overflow-hidden"
              >
                <div className="aspect-[6/5] overflow-hidden bg-surface-sunken">
                  <img
                    src={item.img}
                    alt={item.title}
                    loading="lazy"
                    className="w-full h-full object-cover transition-transform duration-500 hover:scale-105"
                  />
                </div>
                <div className="p-5">
                  <span className="badge badge-info">{item.role}</span>
                  <h3 className="mt-3 font-semibold text-text dark:text-white">{item.title}</h3>
                  <p className="mt-1.5 text-sm text-text-muted dark:text-gray-400 leading-relaxed">
                    {item.desc}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Accompagnement ── */}
      <section id="accompagnement" className="py-20 px-4 sm:px-6 lg:px-8 bg-surface-sunken dark:bg-slate-950">
        <div className="max-w-7xl mx-auto">
          <motion.div {...fadeUp} className="text-center mb-16">
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent-subtle text-accent-text text-xs font-medium mb-4">
              <Headphones className="w-3.5 h-3.5" /> Déploiement
            </span>
            <h2 className="text-3xl sm:text-4xl font-bold text-text dark:text-white">
              Un déploiement clé en main
            </h2>
            <p className="mt-4 text-lg text-text-muted dark:text-gray-400">
              SCHOOLFLOW est installé et paramétré pour votre établissement, sans abonnement caché
            </p>
          </motion.div>
          <div className="grid sm:grid-cols-3 gap-6">
            {planFormation.map((item, i) => {
              const Icon = item.icon;
              return (
                <motion.div
                  key={item.title}
                  {...fadeUp}
                  style={{ transitionDelay: `${i * 100}ms` }}
                  className="bg-surface-raised rounded-2xl p-6 border border-border dark:border-white/10 card-hover"
                >
                  <div className="w-12 h-12 bg-accent rounded-xl flex items-center justify-center mb-4">
                    <Icon className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-lg font-semibold text-text dark:text-white">{item.title}</h3>
                  <p className="text-sm text-text-muted dark:text-gray-400 mt-2 leading-relaxed">
                    {item.desc}
                  </p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <motion.div {...fadeUp}>
            <h2 className="text-3xl sm:text-4xl font-bold text-text dark:text-white mb-4">
              Prêt à transformer votre école ?
            </h2>
            <p className="text-lg text-text-muted dark:text-gray-400 mb-8">
              Rejoignez des centaines d'écoles qui utilisent SCHOOLFLOW au quotidien.
            </p>
            <Link to="/register" className="btn-primary btn-lg px-8 inline-flex items-center gap-2">
              {t('landing.ctaButton') || 'Créer mon établissement'}
              <ArrowRight className="w-5 h-5" />
            </Link>
          </motion.div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="bg-slate-950 text-white py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 bg-accent rounded-lg flex items-center justify-center">
                  <GraduationCap className="w-5 h-5 text-white" />
                </div>
                <span className="text-lg font-bold">SCHOOL<span className="text-accent">FLOW</span></span>
              </div>
              <p className="text-sm text-gray-400">
                La plateforme de gestion scolaire tout-en-un pour moderniser votre établissement.
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Produit</h4>
              <ul className="space-y-2 text-sm text-gray-400">
                <li><a href="#modules" className="hover:text-white transition-colors">Modules</a></li>
                <li><a href="#features" className="hover:text-white transition-colors">Fonctionnalités</a></li>
                <li><a href="#quotidien" className="hover:text-white transition-colors">Au quotidien</a></li>
                <li><a href="#accompagnement" className="hover:text-white transition-colors">Accompagnement</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Entreprise</h4>
              <ul className="space-y-2 text-sm text-gray-400">
                <li><Link to="/about" className="hover:text-white transition-colors">À propos</Link></li>
                <li><Link to="/blog" className="hover:text-white transition-colors">Blog</Link></li>
                <li><Link to="/careers" className="hover:text-white transition-colors">Carrières</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Légal</h4>
              <ul className="space-y-2 text-sm text-gray-400">
                <li><Link to="/legal/privacy" className="hover:text-white transition-colors">Confidentialité</Link></li>
                <li><Link to="/legal/terms" className="hover:text-white transition-colors">CGU</Link></li>
                <li><Link to="/legal/gdpr" className="hover:text-white transition-colors">RGPD</Link></li>
              </ul>
            </div>
          </div>
          <div className="mt-12 pt-8 border-t border-white/10 text-center text-sm text-gray-500">
            © 2025 SCHOOLFLOW. Tous droits réservés.
          </div>
        </div>
      </footer>
    </div>
  );
}
