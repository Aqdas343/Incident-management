import { useCallback, useEffect, useState } from 'react';
import { FiList, FiCpu, FiSliders, FiRefreshCw, FiClock, FiAlertTriangle, FiCheckCircle, FiArrowUp, FiAlertCircle, FiUsers } from 'react-icons/fi';
import { api, getUser } from '../api';
import Navbar from './Navbar';
import StatCard from './StatCard';
import SeverityBadge from './SeverityBadge';
import StatusBadge from './StatusBadge';
import LiveEvents from './LiveEvents';

const fmt = (v) => new Date(v).toLocaleString();

export default function SuperAdminDashboard({ onLogout }) {
  const user = getUser();
  const [stats, setStats] = useState(null);
  const [incidents, setIncidents] = useState([]);
  const [workerStatus, setWorkerStatus] = useState(null);
  const [escalationRules, setEscalationRules] = useState([]);
  const [timeline, setTimeline] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [filters, setFilters] = useState({ status: '', severity: '', category: '' });
  const [tab, setTab] = useState('incidents');
  const [activeUsers, setActiveUsers] = useState({ count: 0, users: [] });

  const loadStats = useCallback(async () => {
    const [s, w, r, a] = await Promise.allSettled([
      api.get('/dashboard/stats'),
      api.get('/dashboard/worker-status'),
      api.get('/dashboard/escalation-rules'),
      api.get('/dashboard/active-users'),
    ]);
    if (s.status === 'fulfilled') setStats(s.value.data);
    if (w.status === 'fulfilled') setWorkerStatus(w.value.data);
    if (r.status === 'fulfilled') setEscalationRules(r.value.data.rules || []);
    if (a.status === 'fulfilled') setActiveUsers(a.value.data);
  }, []);

  const loadIncidents = useCallback(async () => {
    const params = {};
    if (filters.status) params.status = filters.status;
    if (filters.severity) params.severity = filters.severity;
    if (filters.category) params.category = filters.category;
    const res = await api.get('/incidents', { params });
    setIncidents(res.data || []);
  }, [filters]);

  useEffect(() => { loadStats(); loadIncidents(); }, [loadStats, loadIncidents]);

  const loadTimeline = async (id) => {
    setSelectedId(id);
    const res = await api.get(`/incidents/${id}/timeline`);
    setTimeline(res.data || []);
  };

  const onIncidentCreated = useCallback((data) => {
    setIncidents((p) => [data, ...p]);
    loadStats();
  }, [loadStats]);

  const queueStatus = workerStatus?.queueStatus;

  const TABS = [
    { key: 'incidents', label: 'Incidents', icon: <FiList size={15} /> },
    { key: 'workers', label: 'Workers & Queues', icon: <FiCpu size={15} /> },
    { key: 'rules', label: 'Escalation Rules', icon: <FiSliders size={15} /> },
    { key: 'users', label: 'Active Users', icon: <FiUsers size={15} /> },
  ];

  return (
    <div className="app">
      <Navbar user={user} onLogout={onLogout} />
      <main className="page-container">
        <div className="page-title">
          <h1>Super Admin Dashboard</h1>
          <p>Full system overview — workers, queues, escalation rules, all incidents</p>
        </div>

        <div className="stats-grid">
          <StatCard label="Total Incidents" value={stats?.total_incidents} color="#7c3aed" icon={<FiList size={20} />} />
          <StatCard label="Open" value={stats?.open_count} color="#dc2626" icon={<FiAlertCircle size={20} />} />
          <StatCard label="Critical" value={stats?.critical_count} color="#ea580c" icon={<FiAlertTriangle size={20} />} />
          <StatCard label="Escalated" value={stats?.escalated_count} color="#d97706" icon={<FiArrowUp size={20} />} />
          <StatCard label="Resolved Today" value={stats?.resolved_today} color="#16a34a" icon={<FiCheckCircle size={20} />} />
          <StatCard label="Avg Resolution (s)" value={stats?.avg_resolution_time} color="#0284c7" icon={<FiClock size={20} />} />
          <StatCard label="Active Users" value={activeUsers.count} color="#6d28d9" icon={<FiUsers size={20} />} />
        </div>

        <div className="tabs">
          {TABS.map((t) => (
            <button key={t.key} className={`tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>
              {t.icon} {t.label}
            </button>
          ))}
          <button className="tab tab-refresh" onClick={() => { loadStats(); loadIncidents(); }}>
            <FiRefreshCw size={14} /> Refresh
          </button>
        </div>

        {tab === 'incidents' && (
          <>
            <div className="filter-bar">
              <select value={filters.status} onChange={(e) => setFilters((p) => ({ ...p, status: e.target.value }))}>
                <option value="">All Status</option>
                <option value="open">Open</option>
                <option value="investigating">Investigating</option>
                <option value="resolved">Resolved</option>
              </select>
              <select value={filters.severity} onChange={(e) => setFilters((p) => ({ ...p, severity: e.target.value }))}>
                <option value="">All Severity</option>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
              <select value={filters.category} onChange={(e) => setFilters((p) => ({ ...p, category: e.target.value }))}>
                <option value="">All Category</option>
                <option value="infrastructure">Infrastructure</option>
                <option value="database">Database</option>
                <option value="security">Security</option>
                <option value="payment_failure">Payment Failure</option>
                <option value="authentication">Authentication</option>
                <option value="network">Network</option>
              </select>
            </div>

            <div className="panel">
              <h2>All Incidents ({incidents.length})</h2>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Service</th><th>Title</th><th>Severity</th><th>Status</th>
                      <th>Escalation</th><th>Category</th><th>Created</th><th>Timeline</th>
                    </tr>
                  </thead>
                  <tbody>
                    {incidents.map((inc) => (
                      <tr key={inc.id}>
                        <td><strong>{inc.service}</strong></td>
                        <td className="td-title">{inc.title}</td>
                        <td><SeverityBadge value={inc.severity} /></td>
                        <td><StatusBadge value={inc.status} /></td>
                        <td><span className="badge badge-level">L{inc.escalation_level}</span></td>
                        <td>{inc.category}</td>
                        <td>{fmt(inc.created_at)}</td>
                        <td><button className="btn-sm" onClick={() => loadTimeline(inc.id)}>View</button></td>
                      </tr>
                    ))}
                    {incidents.length === 0 && <tr><td colSpan={8} className="empty-row">No incidents found</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>

            {selectedId && (
              <div className="panel">
                <div className="panel-header">
                  <h2>Timeline — #{selectedId.slice(0, 8)}</h2>
                  <button className="btn-sm" onClick={() => setSelectedId(null)}>Close</button>
                </div>
                <ul className="timeline">
                  {timeline.map((t) => (
                    <li key={t.id} className="timeline-item">
                      <span className="timeline-time">{fmt(t.created_at || t.triggered_at)}</span>
                      <span>{t.content || `Escalated: ${t.reason} (L${t.from_level}→L${t.to_level})`}</span>
                    </li>
                  ))}
                  {timeline.length === 0 && <li className="empty-row">No timeline events</li>}
                </ul>
              </div>
            )}
          </>
        )}

        {tab === 'workers' && (
          <div className="panel">
            <h2>Worker & Queue Status</h2>
            {queueStatus ? (
              <div className="queue-grid">
                {Object.entries(queueStatus).map(([name, counts]) => (
                  <div key={name} className="queue-card">
                    <h3>{name} queue</h3>
                    <div className="queue-counts">
                      {Object.entries(counts).map(([k, v]) => (
                        <div key={k} className={`queue-count ${k === 'failed' && v > 0 ? 'failed' : ''}`}>
                          <strong>{v}</strong><span>{k}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : <p className="empty-row">Queue data unavailable</p>}
          </div>
        )}

        {tab === 'rules' && (
          <div className="panel">
            <h2>Escalation Rules</h2>
            <ul className="rules-list">
              {escalationRules.map((r, i) => (
                <li key={i} className="rule-item">
                  <FiSliders size={14} className="rule-icon" />{r}
                </li>
              ))}
            </ul>
          </div>
        )}

        {tab === 'users' && (
          <div className="panel">
            <div className="panel-header">
              <h2>Active Users ({activeUsers.count})</h2>
              <button className="btn-sm" onClick={() => api.get('/dashboard/active-users').then((r) => setActiveUsers(r.data)).catch(() => {})}>
                <FiRefreshCw size={13} /> Refresh
              </button>
            </div>
            {activeUsers.users.length > 0 ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Email</th>
                      <th>Role</th>
                      <th>User ID</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeUsers.users.map((u) => (
                      <tr key={u.id}>
                        <td>{u.email}</td>
                        <td><span className="badge">{u.role}</span></td>
                        <td className="td-title" style={{ fontFamily: 'monospace', fontSize: 12 }}>{u.id}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="empty-row">No users currently connected via WebSocket</p>
            )}
          </div>
        )}

        <LiveEvents onIncidentCreated={onIncidentCreated} />
      </main>
    </div>
  );
}
