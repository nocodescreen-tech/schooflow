import axios from 'axios';

const api = axios.create({
  baseURL: '/api/v1',
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('schoolflow_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    if (status === 401) {
      localStorage.removeItem('schoolflow_token');
      localStorage.removeItem('schoolflow_user');
      if (window.location.pathname.startsWith('/app')) {
        window.location.href = '/login';
      }
    }
    // Forced password change: redirect once, avoiding a loop if already there.
    if (status === 428 && error.response?.data?.code === 'PASSWORD_CHANGE_REQUIRED') {
      if (window.location.pathname !== '/app/change-password') {
        window.location.href = '/app/change-password';
      }
    }
    // Disabled / suspended account: the token is refused server-side.
    if (status === 403 && typeof error.response?.data?.error === 'string') {
      const msg = error.response.data.error as string;
      if (/Compte (désactivé|suspendu|archivé)/.test(msg)) {
        localStorage.removeItem('schoolflow_token');
        localStorage.removeItem('schoolflow_user');
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;
