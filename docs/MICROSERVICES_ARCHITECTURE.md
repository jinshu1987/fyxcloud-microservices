# Fyx Cloud AI-SPM — Microservices Architecture

## Overview

The platform is decomposed into 7 independent services plus a PostgreSQL database. All services communicate via the database's `job_queue` table (no external queue broker needed) and direct HTTP where synchronous responses are required.

```
                    ┌──────────────────────────────────────┐
                    │            Internet                  │
                    └──────────────┬───────────────────────┘
                                   │
                    ┌──────────────▼───────────────────────┐
                    │         Ingress / Load Balancer       │
                    │    (nginx / AWS ALB / GKE Ingress)   │
                    └──────┬───────────────────┬───────────┘
                           │ /api*, /ws        │ /*
              ┌────────────▼──────────┐  ┌────▼──────────┐
              │     API Gateway       │  │   Frontend    │
              │     :3000             │  │   (nginx)     │
              │  Auth • Rate limit    │  │   :80         │
              │  WS proxy • Routing   │  └───────────────┘
              └──┬──┬──┬──┬──┬──┬───┘
                 │  │  │  │  │  │
    ┌────────────┘  │  │  │  │  └──────────────┐
    │  ┌────────────┘  │  │  └────────┐        │
    │  │  ┌────────────┘  └────┐      │        │
    ▼  ▼  ▼                    ▼      ▼        ▼
  auth scanner policy       notif  billing  report
  :3001 :3002  :3003         :3004   :3005   :3006

              All services share the same PostgreSQL database.
              Async jobs flow via the `job_queue` table:

              scanner ──[scan.connector]──► scanner (self-worker)
              scanner ──[policy.evaluate]──► policy-engine
              policy  ──[notification.send]──► notification
```

## Services

| Service | Port | Responsibility |
|---|---|---|
| **api-gateway** | 3000 | Single ingress, session validation, reverse proxy, WebSocket proxy |
| **auth-service** | 3001 | Login/signup/MFA, users, orgs, projects, RBAC, API keys, audit |
| **scanner-service** | 3002 | Cloud connectors, AWS/Azure/GCP/HF scanning, auto-discovery scheduler |
| **policy-engine-service** | 3003 | Policy evaluation worker, findings CRUD, compliance, remediation |
| **notification-service** | 3004 | WebSocket delivery, in-app notifications, email, webhook dispatch |
| **billing-service** | 3005 | Stripe checkout, subscription management, license validation |
| **report-service** | 3006 | PDF/CSV report generation |
| **frontend** | 80 | React SPA served via nginx |

## PostgreSQL-Based Job Queue

Jobs are rows in `job_queue`. Workers use `SELECT ... FOR UPDATE SKIP LOCKED` — no Redis or RabbitMQ needed.

**Job flow:**
1. User triggers scan → API Gateway proxies to scanner-service
2. scanner-service enqueues `scan.connector` jobs
3. scanner-service workers dequeue and run cloud scans
4. After a successful scan, scanner enqueues `policy.evaluate`
5. policy-engine-service worker dequeues, evaluates rules, writes findings
6. policy-engine enqueues `notification.send` for critical findings
7. notification-service sends WebSocket push + in-app notification + webhooks

## Directory Structure

```
services/
├── shared/               # Shared TypeScript modules (db, queue, logger)
│   ├── db.ts
│   ├── queue.ts          # PostgreSQL job queue implementation
│   └── logger.ts
├── api-gateway/
│   ├── src/index.ts      # Express proxy + session + WS upgrade
│   └── Dockerfile
├── auth-service/
│   ├── src/
│   │   ├── index.ts
│   │   ├── middleware/auth.ts
│   │   ├── routes/       # auth, users, orgs, projects, admin, api-keys, audit...
│   │   └── services/     # email, audit
│   └── Dockerfile
├── scanner-service/
│   ├── src/
│   │   ├── index.ts
│   │   ├── scheduler.ts  # Auto-discovery interval checker
│   │   ├── scan-runner.ts
│   │   ├── scanners/     # aws, azure, gcp, huggingface
│   │   └── routes/       # connectors, resources, models, scan
│   └── Dockerfile
├── policy-engine-service/
│   ├── src/
│   │   ├── index.ts      # Worker + REST API
│   │   ├── evaluator.ts
│   │   └── engine/       # policy-engine, remediation-engine
│   └── Dockerfile
├── notification-service/
│   ├── src/
│   │   ├── index.ts      # WebSocket server + job worker
│   │   ├── webhook-dispatcher.ts
│   │   └── routes/       # notifications, webhooks
│   └── Dockerfile
├── billing-service/
│   ├── src/index.ts      # Stripe checkout, webhook, portal
│   └── Dockerfile
├── report-service/
│   ├── src/
│   │   ├── index.ts
│   │   └── generators/pdf.ts
│   └── Dockerfile
└── frontend/
    ├── Dockerfile        # Multi-stage: Vite build + nginx serve
    └── nginx.conf        # SPA routing + /api proxy to api-gateway

k8s/
├── base/                 # Kubernetes Deployments, Services, HPAs, Ingress
│   ├── namespace.yaml
│   ├── configmap.yaml
│   ├── secret.yaml       # Template — fill in real values
│   ├── postgres.yaml
│   ├── api-gateway.yaml
│   ├── scanner-service.yaml
│   ├── policy-engine-service.yaml
│   ├── notification-service.yaml
│   ├── billing-service.yaml
│   ├── report-service.yaml
│   ├── frontend.yaml
│   ├── ingress.yaml
│   └── kustomization.yaml
└── overlays/
    └── production/       # Production replica counts and resource patches
```

## Scaling Strategy

| Service | Scale trigger | Min | Max |
|---|---|---|---|
| api-gateway | CPU > 70% | 2 | 10 |
| scanner-service | CPU > 60% | 3 | 20 |
| policy-engine-service | CPU > 70% | 2 | 8 |
| notification-service | Fixed | 2 | 2 |
| billing-service | Fixed | 2 | 2 |
| report-service | CPU > 70% | 1 | 4 |
| frontend | CPU > 70% | 2 | 6 |

Scanner scales most aggressively because cloud scanning is CPU/IO intensive per org.

## Local Development

```bash
cp .env.example .env
# Fill in DATABASE_URL, SESSION_SECRET, ENCRYPTION_KEY, STRIPE_* values
docker compose up --build
```

Services available at:
- Frontend: http://localhost
- API: http://localhost:3000/api
- WS: ws://localhost:3000/ws

## Kubernetes Deployment

```bash
# 1. Configure secrets
kubectl apply -f k8s/base/secret.yaml   # after editing with real values

# 2. Deploy base
kubectl apply -k k8s/base

# 3. Production overlay (higher replicas)
kubectl apply -k k8s/overlays/production

# 4. Check status
kubectl get pods -n fyxcloud
kubectl get hpa -n fyxcloud
```

## Migration from Monolith

The scanner stubs in `services/scanner-service/src/scanners/` and engine stubs in `services/policy-engine-service/src/engine/` are ready for you to copy the production logic from:

| Source (monolith) | Destination (microservice) |
|---|---|
| `server/aws-scanner.ts` | `services/scanner-service/src/scanners/aws.ts` |
| `server/azure-scanner.ts` | `services/scanner-service/src/scanners/azure.ts` |
| `server/gcp-scanner.ts` | `services/scanner-service/src/scanners/gcp.ts` |
| `server/hf-scanner.ts` | `services/scanner-service/src/scanners/huggingface.ts` |
| `server/policy-engine.ts` | `services/policy-engine-service/src/engine/policy-engine.ts` |
| `server/remediation-engine.ts` | `services/policy-engine-service/src/engine/remediation-engine.ts` |

The API contracts (request/response shapes) remain identical — the frontend needs no changes.
