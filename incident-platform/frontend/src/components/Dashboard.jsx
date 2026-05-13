import { useEffect, useMemo, useState } from 'react';
import { io } from 'socket.io-client';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

function formatDate(value) {
  return new Date(value).toLocaleString();
}

export default function Dashboard() {
  const [incidents, setIncidents] = useState([]);
  const [stats, setStats] = useState(null);
  const [messages, setMessages] = useState([]);

  const token = localStorage.getItem('incident_token');

  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);

  useEffect(() => {
    if (!token) return;

    const fetchData = async () => {
      try {
        const incidentsRes = await axios.get(`${API_URL}/incidents`, { headers });
        setIncidents(incidentsRes.data || []);
      } catch (error) {
        console.error('Failed to load incidents:', error);
      }

      try {
        const statsRes = await axios.get(`${API_URL}/dashboard/stats`, { headers });
        setStats(statsRes.data || null);
      } catch (error) {
        console.error('Failed to load dashboard stats:', error);
        setStats(null);
      }
    };

    fetchData();
  }, [headers, token]);

  useEffect(() => {
    if (!token) return;

    const socket = io(API_URL, {
      path: '/ws',
      transports: ['websocket'],
      auth: { token },
    });

    socket.on('connect', () => {
      setMessages((prev) => [...prev, 'Connected to live updates']);
    });

    socket.on('incident.classified', (payload) => {
      setMessages((prev) => [...prev, `Incident ${payload.incidentId} classified`]);
    });

    socket.on('incident.created', (newIncident) => {
      setIncidents((prev) => [newIncident, ...prev]);
      setMessages((prev) => [...prev, `Incident ${newIncident.id} created`]);
    });

    socket.on('incident.escalated', (payload) => {
      setMessages((prev) => [...prev, `Incident ${payload.incidentId} escalated to ${payload.level || 'unknown'}`]);
    });

    socket.on('disconnect', () => {
      setMessages((prev) => [...prev, 'Disconnected from live updates']);
    });

    socket.on('connect_error', (error) => {
      setMessages((prev) => [...prev, `Socket error: ${error.message}`]);
    });

    return () => socket.disconnect();
  }, [token]);

  const handleLogout = () => {
    localStorage.removeItem('incident_token');
    window.location.reload();
  };

  return (
    <main className="page-container">
      <header className="page-header">
        <div>
          <h1>Incident Dashboard</h1>
          <p>Live status, incident count, and workflow alerts.</p>
        </div>
        <button onClick={handleLogout}>Sign out</button>
      </header>

      <section className="stats-grid">
        <div className="card">
          <strong>{stats?.total_incidents ?? '-'}</strong>
          <span>Total incidents</span>
        </div>
        <div className="card">
          <strong>{stats?.open_count ?? '-'}</strong>
          <span>Open incidents</span>
        </div>
        <div className="card">
          <strong>{stats?.critical_count ?? '-'}</strong>
          <span>Critical incidents</span>
        </div>
        <div className="card">
          <strong>{stats?.escalated_count ?? '-'}</strong>
          <span>Escalated incidents</span>
        </div>
      </section>

      <section className="panel">
        <h2>Latest incidents</h2>
        <table>
          <thead>
            <tr>
              <th>Service</th>
              <th>Title</th>
              <th>Severity</th>
              <th>Status</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {incidents.map((incident) => (
              <tr key={incident.id}>
                <td>{incident.service}</td>
                <td>{incident.title}</td>
                <td>{incident.severity}</td>
                <td>{incident.status}</td>
                <td>{formatDate(incident.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="panel">
        <h2>Live events</h2>
        <ul className="event-log">
          {messages.slice(-8).map((message, index) => (
            <li key={`${message}-${index}`}>{message}</li>
          ))}
        </ul>
      </section>
    </main>
  );
}
