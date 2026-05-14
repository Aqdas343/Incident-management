import { useCallback, useEffect, useState } from 'react';
import { FiRefreshCw, FiCheckCircle, FiAlertTriangle, FiAlertCircle, FiList, FiX, FiUpload, FiPlusCircle } from 'react-icons/fi';
import { api, getUser } from '../api';
import Navbar from './Navbar';
import StatCard from './StatCard';
import SeverityBadge from './SeverityBadge';
import StatusBadge from './StatusBadge';
import LiveEvents from './LiveEvents';

const fmt = (v) => new Date(v).toLocaleString();

export default function SupportEngineerDashboard({ onLogout }) {
  const user = getUser();
  const [stats, setStats] = useState(null);
  const [incidents, setIncidents] = useState([]);
  const [filters, setFilters] = useState({ status: '', severity: '' });
  const [selected, setSelected] = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [noteContent, setNoteContent] = useState('');
  const [newStatus, setNewStatus] = useState('');
  const [actionMsg, setActionMsg] = useState('');
  const [ingestForm, setIngestForm] = useState({ service: '', message: '', timestamp: '' });
  const [ingestMsg, setIngestMsg] = useState('');
  const [logFile, setLogFile] = useState(null);
  const [logMsg, setLogMsg] = useState('');
  const [tab, setTab] = useState('incidents');

  const loadStats = useCallback(async () => {
    const res = await api.get('/dashboard/stats');
    setStats(res.data);
  }, []);

  const loadIncidents = useCallback(async () => {
    const params = {};
    if (filters.status) params.status = filters.status;
    if (filters.severity) params.severity = filters.severity;
    const res = await api.get('/incidents', { params });
    setIncidents(res.data || []);
  }, [filters]);

  useEffect(() => { loadStats(); loadIncidents(); }, [loadStats, loadIncidents]);

  const selectIncident = async (inc) => {
    setSelected(inc);
    setActionMsg('');
    setNoteContent('');
    setNewStatus(inc.status);
    const tl = await api.get(`/incidents/${inc.id}/timeline`);
    setTimeline(tl.data || []);
  };

  const flash = (msg) => { setActionMsg(msg); setTimeout(() => setActionMsg(''), 3000); };

  const handleStatusChange = async () => {
    try {
      const res = await api.put(`/incidents/${selected.id}/status`, { status: newStatus });
      setSelected(res.data);
      setIncidents((p) => p.map((i) => i.id === res.data.id ? res.data : i));
      loadStats();
      flash('Status updated');
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

  const handleIngest = async (e) => {
    e.preventDefault();
    setIngestMsg('');
    try {
      const ts = ingestForm.timestamp || new Date().toISOString();
      const res = await api.post('/webhooks/ingest', { ...ingestForm, timestamp: ts });
      setIngestMsg(`Incident created: ${res.data.incident_id}`);
      setIngestForm({ service: '', message: '', timestamp: '' });
      loadIncidents();
      loadStats();
    } catch (err) { setIngestMsg(err?.response?.data?.error || 'Failed to create incident'); }
  };

  const handleLogUpload = async (e) => {
    e.preventDefault();
    if (!logFile) return;
    setLogMsg('');
    const formData = new FormData();
    formData.append('file', logFile);
    try {
      const res = await api.post('/webhooks/upload-log', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setLogMsg(`Imported ${res.data.imported} incidents`);
      setLogFile(null);
      loadIncidents();
      loadStats();
    } catch (err) { setLogMsg(err?.response?.data?.error || 'Upload failed'); }
  };

  const onIncidentCreated = useCallback((data) => {
    setIncidents((p) => [data, ...p]);
    loadStats();
  }, [loadStats]);

  const onIncidentClassified = useCallback((data) => {
    setIncidents((p) => p.map((i) => i.id === data.incidentId ? { ...i, ...data.classification } : i));
    if (selected?.id === data.incidentId) setSelected((s) => s ? { ...s, ...data.classification } : s);
  }, [selected]);

  const TABS = [
    { key: 'incidents', label: 'Incidents', icon: <FiList size={14} /> },
    { key: 'report', label: 'Report Incident', icon: <FiPlusCircle size={14} /> },
    { key: 'upload', label: 'Upload Log', icon: <FiUpload size={14} /> },
  ];

  return (
    <div className="app">
      <Navbar user={user} onLogout={onLogout} />
      <main className="page-container">
        <div className="page-title">
          <h1>Support Engineer Dashboard</h1>
          <p>Monitor incidents, update status, add notes, and ingest new alerts</p>
        </div>

        <div className="stats-grid">
          <StatCard label="Total Incidents" value={stats?.total_incidents} color="#059669" icon={<FiList size={20} />} />
          <StatCard label="Open" value={stats?.open_count} color="#dc2626" icon={<FiAlertCircle size={20} />} />
          <StatCard label="Critical" value={stats?.critical_count} color="#ea580c" icon={<FiAlertTriangle size={20} />} />
          <StatCard label="Resolved Today" value={stats?.resolved_today} color="#16a34a" icon={<FiCheckCircle size={20} />} />
        </div>

        <div className="tabs">
          {TABS.map((t) => (
            <button key={t.key} className={`tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        <div className="two-col">
          <div>
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
                  <button className="btn-sm icon-btn" onClick={loadIncidents}><FiRefreshCw size={14} /> Refresh</button>
                </div>
                <div className="panel">
                  <h2>Incidents ({incidents.length})</h2>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr><th>Service</th><th>Severity</th><th>Status</th><th>Created</th><th></th></tr>
                      </thead>
                      <tbody>
                        {incidents.map((inc) => (
                          <tr key={inc.id} className={selected?.id === inc.id ? 'row-selected' : ''}>
                            <td>
                              <strong>{inc.service}</strong>
                              <div className="td-sub">{inc.title.slice(0, 45)}{inc.title.length > 45 ? '…' : ''}</div>
                            </td>
                            <td><SeverityBadge value={inc.severity} /></td>
                            <td><StatusBadge value={inc.status} /></td>
                            <td className="td-date">{fmt(inc.created_at)}</td>
                            <td><button className="btn-sm" onClick={() => selectIncident(inc)}>Open</button></td>
                          </tr>
                        ))}
                        {incidents.length === 0 && <tr><td colSpan={5} className="empty-row">No incidents</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}

            {tab === 'report' && (
              <div className="panel">
                <h2>Report New Incident</h2>
                <form onSubmit={handleIngest}>
                  <div className="field">
                    <label>Service</label>
                    <input value={ingestForm.service} onChange={(e) => setIngestForm((p) => ({ ...p, service: e.target.value }))} placeholder="e.g. payment-service" required />
                  </div>
                  <div className="field">
                    <label>Message</label>
                    <input value={ingestForm.message} onChange={(e) => setIngestForm((p) => ({ ...p, message: e.target.value }))} placeholder="Describe the issue" required />
                  </div>
                  <button type="submit" className="btn-primary">Submit Incident</button>
                  {ingestMsg && <p className={ingestMsg.includes('created') ? 'action-msg' : 'error-msg'}>{ingestMsg}</p>}
                </form>
              </div>
            )}

            {tab === 'upload' && (
              <div className="panel">
                <h2>Upload Log File</h2>
                <p className="hint">Format: <code>timestamp|service|message</code> (one per line)</p>
                <form onSubmit={handleLogUpload}>
                  <div className="field">
                    <label>Log File (.txt / .log)</label>
                    <input type="file" accept=".txt,.log" onChange={(e) => setLogFile(e.target.files[0])} required />
                  </div>
                  <button type="submit" className="btn-primary"><FiUpload size={14} /> Upload & Import</button>
                  {logMsg && <p className={logMsg.includes('Imported') ? 'action-msg' : 'error-msg'}>{logMsg}</p>}
                </form>
              </div>
            )}
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
                <div className="detail-row"><span>Category</span><span>{selected.category}</span></div>
                <div className="detail-row"><span>Source</span><span>{selected.source}</span></div>
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
                  <h3>Update Status</h3>
                  <div className="input-row">
                    <select value={newStatus} onChange={(e) => setNewStatus(e.target.value)}>
                      <option value="open">Open</option>
                      <option value="investigating">Investigating</option>
                      <option value="resolved">Resolved</option>
                    </select>
                    <button className="btn-primary" onClick={handleStatusChange}>Update</button>
                  </div>
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

        <LiveEvents onIncidentCreated={onIncidentCreated} onIncidentClassified={onIncidentClassified} />
      </main>
    </div>
  );
}
