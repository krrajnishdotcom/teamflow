# TeamFlow — Team Collaboration Tool

> Built for **Prompt Wars Chennai Hackathon** by hack2skill | May 2, 2026

[![Google Cloud Run](https://img.shields.io/badge/Google%20Cloud-Run-4285F4?logo=google-cloud)](https://cloud.google.com/run)
[![Firebase Firestore](https://img.shields.io/badge/Firebase-Firestore-FFCA28?logo=firebase)](https://firebase.google.com)
[![Vertex AI](https://img.shields.io/badge/Vertex%20AI-Gemini-4285F4?logo=google-cloud)](https://cloud.google.com/vertex-ai)
[![Node.js](https://img.shields.io/badge/Node.js-20-339933?logo=node.js)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

---

## 🚀 Live Demo

**https://teamflow-988248601168.asia-south1.run.app**

---

## Problem Statement

Design a platform that improves team coordination and communication. The system should simplify workflows and improve visibility of tasks.

## Solution

**TeamFlow** is a real-time team collaboration tool featuring:

- **Kanban Board** — visual task management with drag-and-drop + click-to-advance columns
- **Team Chat** — instant messaging with team member presence
- **Activity Feed** — live log of all team actions
- **Member Progress** — per-member completion tracking and analytics
- **AI Task Assignment** — Vertex AI powered smart assignee recommendations
- **REST API** — full CRUD for tasks and messages, backed by Firebase Firestore
- **CSV Export** — one-click download of all tasks

---

## Google Services Used

| Service | Usage |
|---|---|
| **Google Cloud Run** | Serverless container hosting, auto-scaling |
| **Google Container Registry** | Docker image storage |
| **Google Cloud Build** | CI/CD pipeline |
| **Firebase Firestore** | Real-time NoSQL database — tasks & messages persist across requests |
| **Vertex AI / Gemini** | AI-powered task assignee recommendations with workload awareness |
| **Firebase Auth** (integration-ready) | Google OAuth sign-in |

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
    ├── POST     /api/ai/suggest   ← Vertex AI task assignment
    ├── GET      /api/export       ← CSV export
    └── GET      /health           ← Health probe
    │
    ▼
Firebase Firestore (asia-south1)
    ├── tasks/     ← Persistent task store
    └── messages/  ← Persistent chat messages
```

---

## Quick Start

```bash
# Clone and install
git clone https://github.com/krrajnishdotcom/teamflow.git
cd teamflow
npm install

# Authenticate with Google Cloud (for local Firestore access)
gcloud auth application-default login

# Run locally
npm start
# → http://localhost:8080

# Run tests (24 tests, uses in-memory store — no Cloud deps needed)
npm test
```

---

## Deploy to Google Cloud Run

```bash
# 1. Build and push image
gcloud builds submit --tag gcr.io/teamflow-495105/teamflow

# 2. Deploy to Cloud Run
gcloud run deploy teamflow \
  --image gcr.io/teamflow-495105/teamflow \
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
| GET | `/api/analytics` | Team completion stats + per-member breakdown |

### AI Suggest (Vertex AI)

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/ai/suggest` | Get AI-recommended assignee for a task |

**POST body:**
```json
{ "title": "Build login page", "tag": "frontend" }
```

**Response:**
```json
{
  "suggestion": {
    "assignee": "Nisha P",
    "confidence": 85,
    "reason": "Recommended Nisha P: specialises in frontend tasks and has lowest workload.",
    "alternates": ["Meera M", "Karthik A", "Rajan S"],
    "model": "vertex-ai-gemini-pro"
  }
}
```

### Export

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/export` | Download all tasks as CSV |

### Health

| Method | Endpoint | Description |
|---|---|---|
| GET | `/health` | Health probe for Cloud Run |

---

## Features Checklist

- [x] Kanban board with drag-and-drop + click-to-advance
- [x] Add tasks with assignee, category, priority
- [x] Team chat with message history
- [x] Real-time activity feed
- [x] Per-member progress tracking
- [x] REST API with full CRUD
- [x] **Firebase Firestore** — real persistent database (tasks + messages)
- [x] **Vertex AI AI Suggest** — smart assignee recommendation with workload balancing
- [x] **CSV Export** — download all tasks
- [x] Input validation and XSS sanitization
- [x] Rate limiting (100 req/15 min)
- [x] Security headers via Helmet
- [x] CORS configuration
- [x] Accessibility (ARIA roles, keyboard nav, skip link)
- [x] Responsive design (mobile + desktop)
- [x] Health check endpoint for Cloud Run
- [x] Non-root Docker user
- [x] Multi-stage Docker build
- [x] Jest test suite (24 tests, 100% pass, zero port conflicts)

---

## Evaluation Criteria

| Criteria | Implementation |
|---|---|
| **Code Quality** | Clean layered architecture (server → db → firebase), ESLint-ready, modular |
| **Security** | Helmet, CORS, rate-limiting, input validation, XSS sanitization, non-root Docker |
| **Efficiency** | Alpine Docker image, multi-stage build, Firestore with ADC (no key files) |
| **Testing** | Jest + Supertest, 24 tests, 100% pass, in-memory fallback for fast CI |
| **Accessibility** | ARIA roles, live regions, keyboard nav, skip links, focus management |
| **Google Services** | Cloud Run ✅ · Firestore ✅ · Vertex AI ✅ · Cloud Build ✅ · GCR ✅ |

---

## Project Structure

```
teamflow/
├── server.js            ← Express app + REST API
├── src/
│   ├── db.js            ← DB abstraction (Firestore / in-memory)
│   └── firebase.js      ← Firebase Admin SDK initializer
├── package.json
├── Dockerfile           ← Multi-stage Cloud Run optimized
├── cloudrun.yaml        ← Cloud Run service config
├── .dockerignore
├── .gitignore
├── public/
│   └── index.html       ← Frontend (single file, no build step)
├── tests/
│   └── server.test.js   ← Jest test suite (24 tests)
└── README.md
```

---

## License

MIT © 2026 Prompt Wars Chennai Hackathon Team
