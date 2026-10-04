import { Outlet } from 'react-router-dom';
import { motion } from 'motion/react';
import { GraduationCap, School } from 'lucide-react';
import { Link } from 'react-router-dom';

const AuthLayout = () => {
  return (
    <div className="min-h-screen bg-surface">
      <div className="flex min-h-screen flex-col items-center justify-center p-8">
        <div className="w-full max-w-md space-y-8">
          <div className="flex flex-col items-center mb-8">
            <Link to="/" className="flex items-center gap-2" aria-label="SCHOOLFLOW - Accueil">
              <div className="w-9 h-9 rounded-lg bg-accent flex items-center justify-center">
                <GraduationCap className="w-5 h-5 text-white" />
              </div>
              <span className="font-bold text-text">SCHOOL<span className="text-accent">FLOW</span></span>
            </Link>
          </div>

          <div className="w-full max-w-md">
            <div className="card p-8">
              <div className="text-center mb-6">
                <h1 className="text-xl font-bold text-text">Bienvenue</h1>
                <p className="text-sm text-text-muted mt-1">
                  Connectez-vous \u00e0 votre espace
                </p>
              </div>

              <Outlet />

              <div className="mt-6 text-center">
                <p className="text-sm text-text-muted dark:text-gray-400">
                  Vous n'avez pas de compte ?{' '}
                  <Link to="/register" className="font-medium text-accent hover:text-accent-hover transition-colors">
                    Inscription
                  </Link>
                </p>
                <p className="text-sm text-text-muted dark:text-gray-400 mt-2">
                  <Link to="/forgot-password" className="font-medium text-accent hover:text-accent-hover transition-colors">
                    Mot de passe oubli\u00e9 ?
                  </Link>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthLayout;