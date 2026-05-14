import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { FiActivity } from 'react-icons/fi';
import { getToken, SOCKET_URL } from '../api';

export default function LiveEvents({ onIncidentCreated, onIncidentClassified, onIncidentEscalated }) {
  const [messages, setMessages] = useState([]);

  useEffect(() => {
    const token = getToken();
    if (!token) return;

    // Do NOT force transports: ['websocket'] — Socket.IO needs the initial
    // HTTP polling handshake to exchange session IDs before upgrading.
    // Forcing websocket-only skips that and causes ECONNABORTED through proxies.
    const socket = io(SOCKET_URL, {
      path: '/ws',
      auth: { token },
      // Let Socket.IO negotiate: polling first, then upgrade to websocket
      transports: ['polling', 'websocket'],
    });

    const add = (msg) => setMessages((p) => [`${new Date().toLocaleTimeString()} — ${msg}`, ...p].slice(0, 20));

    socket.on('connect',       () => add('Connected to live updates'));
    socket.on('disconnect',    () => add('Disconnected'));
    socket.on('connect_error', (e) => add(`Connection error: ${e.message}`));

    socket.on('incident.created', (data) => {
      add(`New incident: ${data.service} — ${data.title}`);
      onIncidentCreated?.(data);
    });
    socket.on('incident.classified', (data) => {
      add(`Classified #${data.incidentId?.slice(0, 8)} — severity: ${data.classification?.severity}`);
      onIncidentClassified?.(data);
    });
    socket.on('incident.escalated', (data) => {
      add(`Escalated #${data.incidentId?.slice(0, 8)} to level ${data.level}`);
      onIncidentEscalated?.(data);
    });

    return () => socket.disconnect();
  }, [onIncidentCreated, onIncidentClassified, onIncidentEscalated]);

  return (
    <div className="panel">
      <h2 className="live-header"><FiActivity size={16} /> Live Events</h2>
      <ul className="event-log">
        {messages.length === 0 && <li className="event-empty">Waiting for events…</li>}
        {messages.map((m, i) => <li key={i}>{m}</li>)}
      </ul>
    </div>
  );
}
