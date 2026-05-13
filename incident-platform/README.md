# Incident Platform

A cleaned, Node.js incident management platform with webhook ingestion, monitoring, alerting, and a Dockerized observability stack.

Built with:
- Backend: Node.js + Express
- Frontend: React + Vite
- Database: PostgreSQL
- Queue/Cache: Redis
- AI: Anthropic Claude
- Background workers: BullMQ
- Monitoring: Prometheus + Grafana + Datadog instrumentation
- Alerts: Slack, generic webhook, email
- Containerization: Docker Compose

## Quick start

1. Copy `.env.example` to `.env` and fill in secrets.
2. Update `DEFAULT_ADMIN_EMAIL` and `DEFAULT_ADMIN_PASSWORD` if you want the project to create an initial admin user.
3. Run:
   ```bash
   docker-compose up --build
   ```
4. Access:
   - Backend: `http://localhost:8000`
   - Frontend: `http://localhost:5173`
   - Prometheus: `http://localhost:9090`
   - Grafana: `http://localhost:3000`

## Architecture

- `backend/app/main.js`: Express server, monitoring endpoint, WebSocket support
- `backend/app/api/webhooks.js`: webhook ingestion, duplicate detection, incident creation
- `backend/app/monitoring.js`: Prometheus metrics, Datadog StatsD integration
- `backend/app/services/alert_service.js`: Slack, webhook, and email alert delivery
- `backend/app/workers`: BullMQ background processing
- `backend/app/models`: Supabase-backed incident and user access
- `backend/app/realtime`: WebSocket manager for user events

## Monitoring and Alerts

- Prometheus scrapes backend metrics at `/metrics`
- Grafana is preconfigured with a Prometheus datasource
- Datadog instrumentation is optional via `DATADOG_API_KEY`
- Alert delivery is configurable with `SLACK_WEBHOOK_URL`, `ALERT_WEBHOOK_URL`, and `SMTP_URL`

## Notes

- Keep `.env` out of version control.
- Replace `JWT_SECRET`, `ANTHROPIC_API_KEY`, and alert integration variables in `.env` before deploying.
- The frontend Docker build is now supported by `frontend/Dockerfile`.
