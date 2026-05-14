import { useCallback, useEffect, useState } from 'react';
import { FiRefreshCw, FiClock, FiAlertTriangle, FiCheckCircle, FiArrowUp, FiAlertCircle, FiList, FiX } from 'react-icons/fi';
import { api, getUser } from '../api';
import Navbar from './Navbar';
import StatCard from './StatCard';
import SeverityBadge from './SeverityBadge';
import StatusBadge from './StatusBadge';
import LiveEvents from './LiveEvents';

const fmt = (v) => new Date(v).toLocaleString();

export default function IncidentManagerDashboard({ onLogout }) {
  const user = getUser();
  const [stats, setStats] = useState(null);
  const [incidents, setIncidents] = useState([]);
  const [filters, setFilters] = useState({ status: '', severity: '', category: '' });
  const [selected, setSelected] = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [assignTo, setAssignTo] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [actionMsg, setActionMsg] = useState('');

  const loadStats = useCallback(async () => {
    const res = await api.get('/dashboard/stats');
    setStats(res.data);
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

  const selectIncident = async (inc) => {
    setSelected(inc);
    setActionMsg('');
    setNoteContent('');
    setAssignTo('');
    const tl = await api.get(`/incidents/${inc.id}/timeline`);
    setTimeline(tl.data || []);
  };

  const flash = (msg) => { setActionMsg(msg); setTimeout(() => setActionMsg(''), 3000); };

  const handleAssign = async () => {
    if (!assignTo) return;
    try {
      const res = await api.put(`/incidents/${selected.id}/assign`, { assigned_to: assignTo });
      setSelected(res.data);
      setIncidents((p) => p.map((i) => i.id === res.data.id ? res.data : i));
      flash('Assigned successfully');
    } catch (e) { flash(e?.response?.data?.error || 'Failed'); }
  };

  const handlePriority = async (priority) => {
    try {
      const res = await api.put(`/incidents/${selected.id}/priority`, { priority });
      setSelected(res.data);
      setIncidents((p) => p.map((i) => i.id === res.data.id ? res.data : i));
      flash(`Priority set to ${priority}`);
    } catch (e) { flash(e?.response?.data?.error || 'Failed'); }
  };

  const handleEscalate = async () => {
    try {
      await api.post(`/incidents/${selected.id}/escalate`);
      const res = await api.get(`/incidents/${selected.id}`);
      setSelected(res.data);
      setIncidents((p) => p.map((i) => i.id === res.data.id ? res.data : i));
      flash('Escalated successfully');
    } catch (e) { flash(e?.response?.data?.error || 'Failed'); }
  };

  const handleNote = async () => {
    if (!noteContent.trim()) return;
    try {
      await api.post(`/incidents/${selected.id}/notes`, { content: noteContent });
      const tl = await api.get(`/incidents/${selected.id}/timeline`);
      setTimeline(tl.data || []);
      setNoteContent('');
      flash('Note added');
    } catch (e) { flash(e?.response?.data?.error || 'Failed'); }
  };

  const onIncidentCreated = useCallback((data) => {
    setIncidents((p) => [data, ...p]);
    loadStats();
  }, [loadStats]);

  return (
    <div className="app">
      <Navbar user={user} onLogout={onLogout} />
      <main className="page-container">
        <div className="page-title">
          <h1>Incident Manager Dashboard</h1>
          <p>Assign, prioritize, and escalate incidents</p>
        </div>

        <div className="stats-grid">
          <StatCard label="Total Incidents" value={stats?.total_incidents} color="#0284c7" icon={<FiList size={20} />} />
          <StatCard label="Open" value={stats?.open_count} color="#dc2626" icon={<FiAlertCircle size={20} />} />
          <StatCard label="Critical" value={stats?.critical_count} color="#ea580c" icon={<FiAlertTriangle size={20} />} />
          <StatCard label="Escalated" value={stats?.escalated_count} color="#d97706" icon={<FiArrowUp size={20} />} />
          <StatCard label="Resolved Today" value={stats?.resolved_today} color="#16a34a" icon={<FiCheckCircle size={20} />} />
          <StatCard label="Avg Resolution (s)" value={stats?.avg_resolution_time} color="#7c3aed" icon={<FiClock size={20} />} />
        </div>

        <div className="two-col">
          <div>
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
              <button className="btn-sm icon-btn" onClick={loadIncidents}><FiRefreshCw size={14} /> Refresh</button>
            </div>

            <div className="panel">
              <h2>Incidents ({incidents.length})</h2>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>Service</th><th>Severity</th><th>Status</th><th>Level</th><th>Assigned</th><th></th></tr>
                  </thead>
                  <tbody>
                    {incidents.map((inc) => (
                      <tr key={inc.id} className={selected?.id === inc.id ? 'row-selected' : ''}>
                        <td>
                          <strong>{inc.service}</strong>
                          <div className="td-sub">{inc.title.slice(0, 50)}{inc.title.length > 50 ? '…' : ''}</div>
                        </td>
                        <td><SeverityBadge value={inc.severity} /></td>
                        <td><StatusBadge value={inc.status} /></td>
                        <td><span className="badge badge-level">L{inc.escalation_level}</span></td>
                        <td>{inc.assigned_to ? <FiCheckCircle size={14} color="#16a34a" /> : '—'}</td>
                        <td><button className="btn-sm" onClick={() => selectIncident(inc)}>Manage</button></td>
                      </tr>
                    ))}
                    {incidents.length === 0 && <tr><td colSpan={6} className="empty-row">No incidents</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {selected && (
            <div>
              <div className="panel">
                <div className="panel-header">
                  <h2>#{selected.id.slice(0, 8)}</h2>
                  <button className="btn-sm icon-btn" onClick={() => setSelected(null)}><FiX size={14} /></button>
                </div>
                <p className="incident-title">{selected.title}</p>
                <div className="detail-row"><span>Service</span><strong>{selected.service}</strong></div>
                <div className="detail-row"><span>Severity</span><SeverityBadge value={selected.severity} /></div>
                <div className="detail-row"><span>Status</span><StatusBadge value={selected.status} /></div>
                <div className="detail-row"><span>Escalation</span><span className="badge badge-level">Level {selected.escalation_level}</span></div>

                {selected.ai_summary && (
                  <div className="ai-box">
                    <p><strong>AI Summary:</strong> {selected.ai_summary}</p>
                    <p><strong>Root Cause:</strong> {selected.ai_root_cause}</p>
                    <p><strong>Suggested Action:</strong> {selected.ai_suggested_action}</p>
                    <p><strong>Business Impact:</strong> {selected.business_impact}</p>
                  </div>
                )}

                {actionMsg && <p className="action-msg">{actionMsg}</p>}

                <div className="action-section">
                  <h3>Assign to Engineer</h3>
                  <div className="input-row">
                    <input placeholder="User UUID" value={assignTo} onChange={(e) => setAssignTo(e.target.value)} />
                    <button className="btn-primary" onClick={handleAssign}>Assign</button>
                  </div>
                </div>

                <div className="action-section">
                  <h3>Set Priority</h3>
                  <div className="btn-group">
                    {['low', 'medium', 'high', 'critical'].map((p) => (
                      <button key={p} className={`btn-priority ${selected.severity === p ? 'active' : ''}`} onClick={() => handlePriority(p)} disabled={selected.escalation_level > 0}>{p}</button>
                    ))}
                  </div>
                  {selected.escalation_level > 0 && <p className="hint">Priority locked — incident escalated</p>}
                </div>

                <div className="action-section">
                  <h3>Manual Escalate</h3>
                  <button className="btn-danger" onClick={handleEscalate} disabled={selected.escalation_level >= 3}>
                    <FiArrowUp size={14} /> Escalate to Level {Math.min((selected.escalation_level || 0) + 1, 3)}
                  </button>
                </div>

                <div className="action-section">
                  <h3>Add Note</h3>
                  <textarea rows={3} value={noteContent} onChange={(e) => setNoteContent(e.target.value)} placeholder="Write a note…" />
                  <button className="btn-primary" onClick={handleNote}>Add Note</button>
                </div>
              </div>

              <div className="panel">
                <h2>Timeline</h2>
                <ul className="timeline">
                  {timeline.map((t) => (
                    <li key={t.id} className="timeline-item">
                      <span className="timeline-time">{fmt(t.created_at || t.triggered_at)}</span>
                      <span>{t.content || `Escalated: ${t.reason} (L${t.from_level}→L${t.to_level})`}</span>
                    </li>
                  ))}
                  {timeline.length === 0 && <li className="empty-row">No events yet</li>}
                </ul>
              </div>
            </div>
          )}
        </div>

        <LiveEvents onIncidentCreated={onIncidentCreated} />
      </main>
    </div>
  );
}
