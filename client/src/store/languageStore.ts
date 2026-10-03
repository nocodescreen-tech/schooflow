import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type Language = 'fr' | 'en';

interface Translations {
  [key: string]: {
    fr: string;
    en: string;
  };
}

const translations: Translations = {
  // Navigation
  'nav.dashboard': { fr: 'Tableau de bord', en: 'Dashboard' },
  'nav.students': { fr: 'Élèves', en: 'Students' },
  'nav.classes': { fr: 'Classes', en: 'Classes' },
  'nav.teachers': { fr: 'Enseignants', en: 'Teachers' },
  'nav.grades': { fr: 'Notes', en: 'Grades' },
  'nav.attendance': { fr: 'Présences', en: 'Attendance' },
  'nav.fees': { fr: 'Frais', en: 'Fees' },
  'nav.payments': { fr: 'Paiements', en: 'Payments' },
  'nav.reportCards': { fr: 'Bulletins', en: 'Report Cards' },
  'nav.settings': { fr: 'Paramètres', en: 'Settings' },
  'nav.vacation': { fr: 'Congés', en: 'Vacation' },
  'nav.myDashboard': { fr: 'Mon Dashboard', en: 'My Dashboard' },
  'nav.myClasses': { fr: 'Mes Classes', en: 'My Classes' },
  'nav.messages': { fr: 'Messages', en: 'Messages' },
  'nav.myGrades': { fr: 'Mes Notes', en: 'My Grades' },
  'nav.myAttendance': { fr: 'Mes Présences', en: 'My Attendance' },
  'nav.mySchedule': { fr: 'Mon Emploi du Temps', en: 'My Schedule' },
  'nav.announcements': { fr: 'Annonces', en: 'Announcements' },
  'nav.myChild': { fr: 'Mon Enfant', en: 'My Child' },
  'nav.alerts': { fr: 'Alertes', en: 'Alerts' },
  'nav.reports': { fr: 'Rapports', en: 'Reports' },
  'nav.timetable': { fr: 'Emploi du temps', en: 'Timetable' },
  'nav.cash': { fr: 'Caisse', en: 'Cash' },
  'nav.documents': { fr: 'Documents', en: 'Documents' },
  'nav.documentBuilder': { fr: 'Éditeur de documents', en: 'Document Builder' },
  'nav.importExport': { fr: 'Import / Export', en: 'Import / Export' },
  'nav.roles': { fr: 'Rôles', en: 'Roles' },
  'nav.users': { fr: 'Utilisateurs', en: 'Users' },
  'nav.parents': { fr: 'Parents', en: 'Parents' },
  'nav.subjects': { fr: 'Matières', en: 'Subjects' },
  'nav.discipline': { fr: 'Discipline', en: 'Discipline' },
  'nav.calendar': { fr: 'Calendrier', en: 'Calendar' },
  'nav.auditLogs': { fr: 'Journal d’audit', en: 'Audit log' },

  // Common
  'common.search': { fr: 'Rechercher...', en: 'Search...' },
  'common.add': { fr: 'Ajouter', en: 'Add' },
  'common.edit': { fr: 'Modifier', en: 'Edit' },
  'common.delete': { fr: 'Supprimer', en: 'Delete' },
  'common.save': { fr: 'Enregistrer', en: 'Save' },
  'common.cancel': { fr: 'Annuler', en: 'Cancel' },
  'common.loading': { fr: 'Chargement...', en: 'Loading...' },
  'common.noData': { fr: 'Aucune donnée', en: 'No data' },
  'common.actions': { fr: 'Actions', en: 'Actions' },
  'common.status': { fr: 'Statut', en: 'Status' },
  'common.name': { fr: 'Nom', en: 'Name' },
  'common.email': { fr: 'Email', en: 'Email' },
  'common.phone': { fr: 'Téléphone', en: 'Phone' },
  'common.date': { fr: 'Date', en: 'Date' },
  'common.all': { fr: 'Tous', en: 'All' },
  'common.viewAll': { fr: 'Voir tout', en: 'View all' },
  'common.back': { fr: 'Retour', en: 'Back' },
  'common.next': { fr: 'Suivant', en: 'Next' },
  'common.previous': { fr: 'Précédent', en: 'Previous' },
  'common.confirm': { fr: 'Confirmer', en: 'Confirm' },
  'common.total': { fr: 'Total', en: 'Total' },
  'common.paid': { fr: 'Payé', en: 'Paid' },
  'common.pending': { fr: 'En attente', en: 'Pending' },
  'common.overdue': { fr: 'En retard', en: 'Overdue' },

  // Dashboard
  'dashboard.welcome': { fr: 'Bonjour', en: 'Welcome' },
  'dashboard.overview': { fr: 'Vue d\'ensemble', en: 'Overview' },
  'dashboard.totalStudents': { fr: 'Total Élèves', en: 'Total Students' },
  'dashboard.totalTeachers': { fr: 'Total Enseignants', en: 'Total Teachers' },
  'dashboard.attendanceRate': { fr: 'Taux de présence', en: 'Attendance Rate' },
  'dashboard.collected': { fr: 'Collecté', en: 'Collected' },
  'dashboard.outstanding': { fr: 'En attente', en: 'Outstanding' },
  'dashboard.avgGrade': { fr: 'Moyenne générale', en: 'Average Grade' },
  'dashboard.recentActivity': { fr: 'Activité récente', en: 'Recent Activity' },
  'dashboard.revenueByMonth': { fr: 'Revenus par mois', en: 'Revenue by Month' },
  'dashboard.attendanceByClass': { fr: 'Présences par classe', en: 'Attendance by Class' },
  'dashboard.gradeDistribution': { fr: 'Distribution des notes', en: 'Grade Distribution' },

  // Students
  'students.title': { fr: 'Gestion des élèves', en: 'Student Management' },
  'students.addStudent': { fr: 'Ajouter un élève', en: 'Add Student' },
  'students.firstName': { fr: 'Prénom', en: 'First Name' },
  'students.lastName': { fr: 'Nom', en: 'Last Name' },
  'students.class': { fr: 'Classe', en: 'Class' },
  'students.enrollmentDate': { fr: 'Date d\'inscription', en: 'Enrollment Date' },
  'students.details': { fr: 'Détails', en: 'Details' },
  'students.grades': { fr: 'Notes', en: 'Grades' },
  'students.attendance': { fr: 'Présences', en: 'Attendance' },
  'students.fees': { fr: 'Frais', en: 'Fees' },

  // Classes
  'classes.title': { fr: 'Gestion des classes', en: 'Class Management' },
  'classes.addClass': { fr: 'Ajouter une classe', en: 'Add Class' },
  'classes.students': { fr: 'Élèves', en: 'Students' },
  'classes.subjects': { fr: 'Matières', en: 'Subjects' },
  'classes.teacher': { fr: 'Enseignant', en: 'Teacher' },
  'classes.room': { fr: 'Salle', en: 'Room' },
  'classes.schedule': { fr: 'Emploi du temps', en: 'Schedule' },

  // Teachers
  'teachers.title': { fr: 'Gestion des enseignants', en: 'Teacher Management' },
  'teachers.addTeacher': { fr: 'Ajouter un enseignant', en: 'Add Teacher' },
  'teachers.subjects': { fr: 'Matières', en: 'Subjects' },
  'teachers.classes': { fr: 'Classes', en: 'Classes' },
  'teachers.rating': { fr: 'Évaluation', en: 'Rating' },

  // Grades
  'grades.title': { fr: 'Gestion des notes', en: 'Grade Management' },
  'grades.addGrade': { fr: 'Ajouter une note', en: 'Add Grade' },
  'grades.bulkEntry': { fr: 'Saisie en masse', en: 'Bulk Entry' },
  'grades.student': { fr: 'Élève', en: 'Student' },
  'grades.subject': { fr: 'Matière', en: 'Subject' },
  'grades.grade': { fr: 'Note', en: 'Grade' },
  'grades.date': { fr: 'Date', en: 'Date' },
  'grades.term': { fr: 'Trimestre', en: 'Term' },

  // Attendance
  'attendance.title': { fr: 'Gestion des présences', en: 'Attendance Management' },
  'attendance.markPresent': { fr: 'Marquer présent', en: 'Mark Present' },
  'attendance.markAbsent': { fr: 'Marquer absent', en: 'Mark Absent' },
  'attendance.markLate': { fr: 'Marquer en retard', en: 'Mark Late' },
  'attendance.history': { fr: 'Historique', en: 'History' },
  'attendance.statistics': { fr: 'Statistiques', en: 'Statistics' },
  'attendance.today': { fr: 'Aujourd\'hui', en: 'Today' },

  // Fees
  'fees.title': { fr: 'Gestion des frais', en: 'Fee Management' },
  'fees.addFee': { fr: 'Ajouter un frais', en: 'Add Fee' },
  'fees.amount': { fr: 'Montant', en: 'Amount' },
  'fees.dueDate': { fr: 'Date d\'échéance', en: 'Due Date' },
  'fees.markPaid': { fr: 'Marquer payé', en: 'Mark Paid' },
  'fees.overdue': { fr: 'En retard', en: 'Overdue' },
  'fees.sendReminder': { fr: 'Envoyer rappel', en: 'Send Reminder' },

  // Payments
  'payments.title': { fr: 'Gestion des paiements', en: 'Payment Management' },
  'payments.recordPayment': { fr: 'Enregistrer un paiement', en: 'Record Payment' },
  'payments.amount': { fr: 'Montant', en: 'Amount' },
  'payments.method': { fr: 'Méthode', en: 'Method' },
  'payments.history': { fr: 'Historique', en: 'History' },

  // Report Cards
  'reportCards.title': { fr: 'Bulletins scolaires', en: 'Report Cards' },
  'reportCards.generate': { fr: 'Générer', en: 'Generate' },
  'reportCards.view': { fr: 'Voir', en: 'View' },
  'reportCards.publish': { fr: 'Publier', en: 'Publish' },
  'reportCards.download': { fr: 'Télécharger', en: 'Download' },

  // Settings
  'settings.title': { fr: 'Paramètres', en: 'Settings' },
  'settings.schoolInfo': { fr: 'Informations de l\'école', en: 'School Information' },
  'settings.team': { fr: 'Équipe', en: 'Team' },
  'settings.roles': { fr: 'Rôles', en: 'Roles' },
  'settings.academicYear': { fr: 'Année scolaire', en: 'Academic Year' },

  // Auth
  'auth.login': { fr: 'Connexion', en: 'Login' },
  'auth.register': { fr: 'Inscription', en: 'Register' },
  'auth.email': { fr: 'Adresse email', en: 'Email address' },
  'auth.password': { fr: 'Mot de passe', en: 'Password' },
  'auth.forgotPassword': { fr: 'Mot de passe oublié ?', en: 'Forgot password?' },
  'auth.noAccount': { fr: 'Pas de compte ?', en: 'Don\'t have an account?' },
  'auth.hasAccount': { fr: 'Déjà un compte ?', en: 'Already have an account?' },
  'auth.schoolName': { fr: 'Nom de l\'école', en: 'School name' },
  'auth.adminName': { fr: 'Nom de l\'administrateur', en: 'Administrator name' },
  'auth.firstName': { fr: 'Prénom', en: 'First name' },
  'auth.lastName': { fr: 'Nom', en: 'Last name' },

  // Landing
  'landing.hero': { fr: 'Tout ce dont votre école a besoin. En un seul flux.', en: 'Everything your school needs. In one flow.' },
  'landing.subtitle': { fr: 'La plateforme de gestion scolaire tout-en-un pour moderniser votre établissement.', en: 'The all-in-one school management platform to modernize your institution.' },
  'landing.getStarted': { fr: 'Commencer', en: 'Get Started' },
  'landing.learnMore': { fr: 'En savoir plus', en: 'Learn More' },
  'landing.pricing': { fr: 'Tarifs', en: 'Pricing' },
  'landing.starter': { fr: 'Starter', en: 'Starter' },
  'landing.standard': { fr: 'Standard', en: 'Standard' },
  'landing.pro': { fr: 'Pro', en: 'Pro' },
  'landing.enterprise': { fr: 'Enterprise', en: 'Enterprise' },
  'landing.monthly': { fr: '/mois', en: '/month' },
  'landing.perSchool': { fr: 'par école', en: 'per school' },
  'landing.custom': { fr: 'Sur devis', en: 'Custom' },
  'landing.popular': { fr: 'Populaire', en: 'Popular' },
  'landing.modules': { fr: 'Modules', en: 'Modules' },
  'landing.features': { fr: 'Fonctionnalités', en: 'Features' },
  'landing.cta': { fr: 'Prêt à transformer votre école ?', en: 'Ready to transform your school?' },
  'landing.ctaButton': { fr: 'Démarrer gratuitement', en: 'Start for free' },

  // Parent Portal
  'parent.welcome': { fr: 'Portail Parent', en: 'Parent Portal' },
  'parent.childInfo': { fr: 'Informations de l\'enfant', en: 'Child Information' },
  'parent.grades': { fr: 'Notes', en: 'Grades' },
  'parent.attendance': { fr: 'Présences', en: 'Attendance' },
  'parent.fees': { fr: 'Frais', en: 'Fees' },
  'parent.payNow': { fr: 'Payer maintenant', en: 'Pay Now' },
  'parent.reportCard': { fr: 'Bulletin', en: 'Report Card' },

  // Onboarding (22-step wizard)
  'onboarding.back': { fr: 'Retour', en: 'Back' },
  'onboarding.continue': { fr: 'Continuer', en: 'Continue' },
  'onboarding.skip': { fr: 'Passer', en: 'Skip' },
  'onboarding.stepOf': { fr: 'Étape {i} / 22', en: 'Step {i} / 22' },
  'onboarding.enter': { fr: 'Entrer dans SchoolFlow', en: 'Enter SchoolFlow' },
  'onboarding.recommended': { fr: 'Recommandé', en: 'Recommended' },
  'onboarding.localOnly': { fr: 'Stocké localement — endpoint backend indisponible', en: 'Stored locally — backend endpoint unavailable' },
  'onboarding.modules': { fr: 'Modules', en: 'Modules' },
  'onboarding.structure': { fr: 'Structure', en: 'Structure' },
  'onboarding.verification': { fr: 'Vérification', en: 'Verification' },
  'onboarding.creation': { fr: 'Création', en: 'Creation' },

  // Settings — Structure & Modules tabs
  'settings.structure': { fr: 'Structure', en: 'Structure' },
  'settings.modules': { fr: 'Modules', en: 'Modules' },
  'settings.seedRdc': { fr: 'Pré-remplir RDC', en: 'Seed DRC defaults' },
  'settings.enable': { fr: 'Activer', en: 'Enable' },
  'settings.disable': { fr: 'Désactiver', en: 'Disable' },
  'settings.coreModule': { fr: 'Module de base (toujours actif)', en: 'Core module (always on)' },
};

interface LanguageState {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

export const useLanguageStore = create<LanguageState>()(
  persist(
    (set, get) => ({
      language: 'fr',
      setLanguage: (lang: Language) => set({ language: lang }),
      t: (key: string) => {
        const { language } = get();
        return translations[key]?.[language] || key;
      },
    }),
    {
      name: 'schoolflow-language',
    }
  )
);
