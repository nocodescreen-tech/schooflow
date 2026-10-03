import { type ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { motion } from 'motion/react';
import { GraduationCap, ArrowLeft, Menu, X, Mail, LifeBuoy } from 'lucide-react';
import { useState } from 'react';
import ContactForm from './ContactForm';

const NAV_LINKS = [
  { to: '/about', label: 'À propos' },
  { to: '/blog', label: 'Blog' },
  { to: '/careers', label: 'Carrières' },
  { to: '/legal/privacy', label: 'Confidentialité' },
  { to: '/legal/terms', label: 'CGU' },
  { to: '/legal/gdpr', label: 'RGPD' },
];

export default function MarketingLayout({
  children,
  title,
  subtitle,
}: {
  children: ReactNode;
  title: string;
  subtitle?: string;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [showContactForm, setShowContactForm] = useState(false);

  return (
    <div className="min-h-screen bg-white dark:bg-dark flex flex-col">
      <header className="sticky top-0 z-50 bg-white/90 dark:bg-dark/90 backdrop-blur-md border-b border-border dark:border-white/10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <span className="w-9 h-9 bg-accent rounded-xl flex items-center justify-center">
              <GraduationCap className="w-5 h-5 text-white" />
            </span>
            <span className="text-xl font-bold tracking-tight text-text dark:text-white">
              SCHOOL<span className="text-primary-500">FLOW</span>
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            {NAV_LINKS.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                className={({ isActive }) =>
                  `px-3 py-2 text-sm rounded-lg transition-colors ${
                    isActive
                      ? 'text-primary-500 bg-primary-500/10 font-medium'
                      : 'text-muted dark:text-gray-400 hover:text-text dark:hover:text-white'
                  }`
                }
              >
                {l.label}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowContactForm(true)}
              className="hidden sm:inline-flex items-center gap-2 px-3 py-2 text-sm text-muted hover:text-text dark:hover:text-white transition-colors rounded-lg hover:bg-gray-100 dark:hover:bg-white/10"
            >
              <LifeBuoy className="w-4 h-4" />
              Support
            </button>
            <Link to="/login" className="hidden sm:block btn-ghost !px-3 !py-2 text-sm">
              Connexion
            </Link>
            <Link to="/register" className="btn-primary !px-4 !py-2 text-sm">
              Créer un compte
            </Link>
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="md:hidden p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10"
              aria-label="Menu"
            >
              {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {menuOpen && (
          <nav className="md:hidden border-t border-border dark:border-white/10 py-2 px-4">
            {NAV_LINKS.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                onClick={() => setMenuOpen(false)}
                className="block px-3 py-2.5 text-sm rounded-lg text-muted dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/5"
              >
                {l.label}
              </NavLink>
            ))}
            <Link
              to="/login"
              onClick={() => setMenuOpen(false)}
              className="block px-3 py-2.5 text-sm rounded-lg text-muted dark:text-gray-400"
            >
              Connexion
            </Link>
          </nav>
        )}
      </header>

      <main className="flex-1">
        <section className="border-b border-border dark:border-white/10 bg-background dark:bg-[#0B1120]">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14 sm:py-20">
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 text-sm text-muted dark:text-gray-400 hover:text-primary-500 transition-colors mb-6"
            >
              <ArrowLeft className="w-4 h-4" /> Retour à l’accueil
            </Link>
            <motion.h1
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="text-3xl sm:text-4xl font-bold text-text dark:text-white"
            >
              {title}
            </motion.h1>
            {subtitle && (
              <motion.p
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.06 }}
                className="mt-4 text-lg text-muted dark:text-gray-400 max-w-2xl"
              >
                {subtitle}
              </motion.p>
            )}
          </div>
        </section>

        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 sm:py-16">{children}</div>
      </main>

      <footer className="bg-dark text-white border-t border-white/10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <span className="w-8 h-8 bg-accent rounded-lg flex items-center justify-center">
                  <GraduationCap className="w-5 h-5 text-white" />
                </span>
                <span className="text-lg font-bold">
                  SCHOOL<span className="text-primary-400">FLOW</span>
                </span>
              </div>
              <p className="text-sm text-gray-400 leading-relaxed">
                Le logiciel de gestion scolaire utilisé au quotidien par les établissements.
              </p>
            </div>

            <div>
              <h4 className="font-semibold mb-4 text-sm">Produit</h4>
              <ul className="space-y-2 text-sm text-gray-400">
                <li>
                  <Link to="/#modules" className="hover:text-white transition-colors">
                    Modules
                  </Link>
                </li>
                <li>
                  <Link to="/#features" className="hover:text-white transition-colors">
                    Fonctionnalités
                  </Link>
                </li>
                <li>
                  <Link to="/#accompagnement" className="hover:text-white transition-colors">
                    Accompagnement
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold mb-4 text-sm">Entreprise</h4>
              <ul className="space-y-2 text-sm text-gray-400">
                <li>
                  <Link to="/about" className="hover:text-white transition-colors">
                    À propos
                  </Link>
                </li>
                <li>
                  <Link to="/blog" className="hover:text-white transition-colors">
                    Blog
                  </Link>
                </li>
                <li>
                  <Link to="/careers" className="hover:text-white transition-colors">
                    Carrières
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold mb-4 text-sm">Légal</h4>
              <ul className="space-y-2 text-sm text-gray-400">
                <li>
                  <Link to="/legal/privacy" className="hover:text-white transition-colors">
                    Confidentialité
                  </Link>
                </li>
                <li>
                  <Link to="/legal/terms" className="hover:text-white transition-colors">
                    CGU
                  </Link>
                </li>
                <li>
                  <Link to="/legal/gdpr" className="hover:text-white transition-colors">
                    RGPD
                  </Link>
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-10 pt-6 border-t border-white/10 text-sm text-gray-500 flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
            <span>© 2024 SCHOOLFLOW. Tous droits réservés.</span>
            <div className="flex gap-4">
              <Link to="/legal/privacy" className="hover:text-white transition-colors">
                Confidentialité
              </Link>
              <Link to="/legal/terms" className="hover:text-white transition-colors">
                CGU
              </Link>
              <Link to="/legal/gdpr" className="hover:text-white transition-colors">
                RGPD
              </Link>
            </div>
          </div>
        </div>
      </footer>
      <ContactForm
        isOpen={showContactForm}
        onClose={() => setShowContactForm(false)}
        pageContext={window.location.pathname}
      />
    </div>
  );
}
