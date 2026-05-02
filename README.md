# TeamFlow — Team Collaboration Tool

> Built for **Prompt Wars Chennai Hackathon** by hack2skill | May 2, 2026

[![Google Cloud Run](https://img.shields.io/badge/Google%20Cloud-Run-4285F4?logo=google-cloud)](https://cloud.google.com/run)
[![Node.js](https://img.shields.io/badge/Node.js-20-339933?logo=node.js)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

---

## Problem Statement

Design a platform that improves team coordination and communication. The system should simplify workflows and improve visibility of tasks.

## Solution

**TeamFlow** is a real-time team collaboration tool featuring:

- **Kanban Board** — visual task management with To Do / In Progress / Done columns
- **Team Chat** — instant messaging with team member presence
- **Activity Feed** — live log of all team actions
- **Member Progress** — per-member completion tracking and analytics
- **REST API** — full CRUD for tasks and messages

---

## Google Services Used

| Service | Usage |
|---|---|
| **Google Cloud Run** | Serverless container hosting, auto-scaling |
| **Google Container Registry** | Docker image storage |
| **Google Cloud Build** | CI/CD pipeline |
| **Firebase Auth** (integration-ready) | Google OAuth sign-in |
| **Firebase Firestore** (integration-ready) | Real-time database |
| **Vertex AI / Gemini** (integration-ready) | AI task assignment suggestions |

---

## Architecture

```
User Browser
    │
    ▼
Google Cloud Run (this app)
    ├── GET/POST /api/tasks        ← Task management
    ├── GET/POST /api/messages     ← Team chat
    ├── GET      /api/analytics    ← Progress stats
    └── GET      /health           ← Health probe
```

---

## Quick Start

```bash
# Clone and install
git clone https://github.com/YOUR_USERNAME/teamflow
cd teamflow
npm install

# Run locally
npm start
# → http://localhost:8080

# Run tests
npm test
```

---

## Deploy to Google Cloud Run

```bash
# 1. Build and push image
gcloud builds submit --tag gcr.io/PROJECT_ID/teamflow

# 2. Deploy to Cloud Run
gcloud run deploy teamflow \
  --image gcr.io/PROJECT_ID/teamflow \
  --platform managed \
  --region asia-south1 \
  --allow-unauthenticated \
  --port 8080

# Or use the YAML config
gcloud run services replace cloudrun.yaml
```

---

## API Reference

### Tasks

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/tasks` | List all tasks |
| GET | `/api/tasks/:id` | Get task by ID |
| POST | `/api/tasks` | Create task |
| PUT | `/api/tasks/:id` | Update task |
| DELETE | `/api/tasks/:id` | Delete task |

**POST body:**
```json
{
  "title": "Task name",
  "assignee": "Karthik A",
  "tag": "feature",
  "priority": "high",
  "description": "Optional"
}
```

### Messages

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/messages` | Get all messages |
| POST | `/api/messages` | Send message |

### Analytics

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/analytics` | Team completion stats |

---

## Features Checklist

- [x] Kanban board with drag-friendly click-to-advance
- [x] Add tasks with assignee, category, priority
- [x] Team chat with message history
- [x] Real-time activity feed
- [x] Per-member progress tracking
- [x] REST API with full CRUD
- [x] Input validation and XSS sanitization
- [x] Rate limiting (100 req/15 min)
- [x] Security headers via Helmet
- [x] CORS configuration
- [x] Accessibility (ARIA roles, keyboard nav, skip link)
- [x] Responsive design (mobile + desktop)
- [x] Health check endpoint for Cloud Run
- [x] Non-root Docker user
- [x] Multi-stage Docker build
- [x] Jest test suite (20+ tests)

---

## Evaluation Criteria

| Criteria | Implementation |
|---|---|
| **Code Quality** | Clean MVC structure, ESLint-ready, modular helpers |
| **Security** | Helmet, CORS, rate-limiting, input validation, XSS sanitization, non-root Docker |
| **Efficiency** | Alpine Docker image, multi-stage build, in-memory store |
| **Testing** | Jest + Supertest, 20+ tests covering all endpoints and edge cases |
| **Accessibility** | ARIA roles, live regions, keyboard nav, skip links, focus management |
| **Google Services** | Cloud Run ready, Firebase Auth/Firestore/Vertex AI integration paths documented |

---

## Project Structure

```
teamflow/
├── server.js          ← Express app + REST API
├── package.json       ← Dependencies and scripts
├── Dockerfile         ← Multi-stage Cloud Run optimized
├── cloudrun.yaml      ← Cloud Run service config
├── .dockerignore
├── .gitignore
├── public/
│   └── index.html     ← Frontend (single file, no build step)
├── tests/
│   └── server.test.js ← Jest test suite
└── README.md
```

---

## License

MIT © 2026 Prompt Wars Chennai Hackathon Team
