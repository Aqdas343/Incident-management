import axios from 'axios';

// In dev, Vite proxies /auth, /incidents, /dashboard, /ws → localhost:8000
// so we use an empty base URL (relative). In production, set VITE_API_URL.
const API_URL = import.meta.env.VITE_API_URL || '';

export const api = axios.create({ baseURL: API_URL });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('incident_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export const getToken = () => localStorage.getItem('incident_token');
export const getUser = () => {
  const token = getToken();
  if (!token) return null;
  try {
    return JSON.parse(atob(token.split('.')[1]));
  } catch {
    return null;
  }
};
export const logout = () => {
  localStorage.removeItem('incident_token');
  window.location.href = '/login';
};

// For Socket.IO: in dev the Vite proxy handles /ws on the same origin.
// In production, point to the backend host explicitly via VITE_API_URL.
export const SOCKET_URL = import.meta.env.VITE_API_URL || window.location.origin;
