import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useThemeStore } from './store/themeStore';
import { MotionProvider } from './components/MotionProvider';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Activate from './pages/Activate';
import Layout from './components/Layout';
import AuthLayout from './pages/AuthLayout';
import Dashboard from './pages/Dashboard';
import Students from './pages/Students';
import Teachers from './pages/Teachers';
import Classes from './pages/Classes';
import Subjects from './pages/Subjects';
import Grades from './pages/Grades';
import Attendance from './pages/Attendance';
import Fees from './pages/Fees';
import Payments from './pages/Payments';
import Cash from './pages/Cash';
import Documents from './pages/Documents';
import ReportCards from './pages/ReportCards';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import AcademicYears from './pages/AcademicYears';
import RolloverWizard from './pages/RolloverWizard';
import GradingConfig from './pages/GradingConfig';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useThemeStore((s) => s.theme);

  React.useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [theme]);

  return <>{children}</>;
}

const App = () => {
  return (
    <React.StrictMode>
      <MotionProvider>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <ThemeProvider>
              <Routes>
                <Route path="/" element={<Landing />} />
                <Route path="/auth" element={<AuthLayout />}>
                  <Route path="login" element={<Login />} />
                  <Route path="register" element={<Register />} />
                  <Route path="forgot-password" element={<ForgotPassword />} />
                  <Route path="reset-password" element={<ResetPassword />} />
                  <Route path="activate" element={<Activate />} />
                </Route>
                <Route path="/app" element={<Layout />}>
                  <Route path="dashboard" element={<Dashboard />} />
                  <Route path="students" element={<Students />} />
                  <Route path="teachers" element={<Teachers />} />
                  <Route path="classes" element={<Classes />} />
                  <Route path="subjects" element={<Subjects />} />
                  <Route path="grades" element={<Grades />} />
                  <Route path="attendance" element={<Attendance />} />
                  <Route path="fees" element={<Fees />} />
                  <Route path="payments" element={<Payments />} />
                  <Route path="cash" element={<Cash />} />
                  <Route path="documents" element={<Documents />} />
                  <Route path="report-cards" element={<ReportCards />} />
                  <Route path="reports" element={<Reports />} />
                  <Route path="settings" element={<Settings />} />
                  <Route path="academic-years" element={<AcademicYears />} />
                  <Route path="rollover" element={<RolloverWizard />} />
                  <Route path="grading-config" element={<GradingConfig />} />
                </Route>
                <Route path="login" element={<Navigate to="/auth/login" replace />} />
                <Route path="register" element={<Navigate to="/auth/register" replace />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </ThemeProvider>
          </BrowserRouter>
        </QueryClientProvider>
      </MotionProvider>
    </React.StrictMode>
  );
};

export default App;