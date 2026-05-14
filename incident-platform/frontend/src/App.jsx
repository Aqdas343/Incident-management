import { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './components/Login';
import Signup from './components/Signup';
import SuperAdminDashboard from './components/SuperAdminDashboard';
import IncidentManagerDashboard from './components/IncidentManagerDashboard';
import SupportEngineerDashboard from './components/SupportEngineerDashboard';
import { getUser } from './api';
import './App.css';

function RoleRouter({ onLogout }) {
  const user = getUser();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'super_admin') return <SuperAdminDashboard onLogout={onLogout} />;
  if (user.role === 'incident_manager') return <IncidentManagerDashboard onLogout={onLogout} />;
  return <SupportEngineerDashboard onLogout={onLogout} />;
}

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem('incident_token'));

  const handleLogin = (newToken) => {
    localStorage.setItem('incident_token', newToken);
    setToken(newToken);
  };

  const handleLogout = () => {
    localStorage.removeItem('incident_token');
    setToken(null);
  };

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={token ? <Navigate to="/" replace /> : <Login onLogin={handleLogin} />} />
        <Route path="/signup" element={token ? <Navigate to="/" replace /> : <Signup onLogin={handleLogin} />} />
        <Route path="/" element={token ? <RoleRouter onLogout={handleLogout} /> : <Navigate to="/login" replace />} />
        <Route path="*" element={<Navigate to={token ? '/' : '/login'} replace />} />
      </Routes>
    </BrowserRouter>
  );
}
