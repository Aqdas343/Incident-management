import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { FiMail, FiLock, FiShield, FiAlertCircle } from 'react-icons/fi';
import { api } from '../api';

export default function Signup({ onLogin }) {
  const [form, setForm] = useState({ email: '', password: '', role: 'support_engineer' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const set = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.post('/auth/signup', form);
      onLogin(res.data.access_token);
      navigate('/');
    } catch (err) {
      setError(err?.response?.data?.error || 'Signup failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="auth-page">
      <div className="auth-card">
        <div className="auth-logo-icon">
          <FiAlertCircle size={36} color="#2563eb" />
        </div>
        <h1>Create Account</h1>
        <p className="auth-sub">Join the Incident Platform</p>
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label>Email</label>
            <div className="input-icon-wrap">
              <FiMail className="input-icon" size={16} />
              <input type="email" value={form.email} onChange={set('email')} required placeholder="you@company.com" />
            </div>
          </div>
          <div className="field">
            <label>Password</label>
            <div className="input-icon-wrap">
              <FiLock className="input-icon" size={16} />
              <input type="password" value={form.password} onChange={set('password')} required placeholder="Min 8 chars, upper, lower, number, symbol" />
            </div>
          </div>
          <div className="field">
            <label>Role</label>
            <div className="input-icon-wrap">
              <FiShield className="input-icon" size={16} />
              <select value={form.role} onChange={set('role')}>
                <option value="support_engineer">Support Engineer</option>
                <option value="incident_manager">Incident Manager</option>
              </select>
            </div>
          </div>
          {error && <p className="error-msg">{error}</p>}
          <button type="submit" className="btn-primary full-width" disabled={loading}>
            {loading ? 'Creating account…' : 'Create account'}
          </button>
        </form>
        <p className="auth-footer">Already have an account? <Link to="/login">Sign in</Link></p>
      </div>
    </main>
  );
}
