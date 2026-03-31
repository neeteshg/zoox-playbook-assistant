# 🚗 Zoox Playbook Assistant

An AI-powered knowledge base and SOP assistant for Zoox Rider Operations — enabling agents to find procedures in seconds, not minutes.

> **[Live Demo →](https://zoox-playbook-assistant.onrender.com)** *(free tier — may take ~30 seconds to wake up)*

---

## The Problem

Rider support agents need to access Standard Operating Procedures (SOPs) from long documents during live emergencies. As Zoox expands to multiple cities — each with its own playbook — finding the right procedure quickly becomes a real challenge.

## The Solution

Instead of searching through documents, agents type a natural language question and get a **step-by-step answer built entirely from the internal SOPs**, with **source citations** showing exactly where the information came from.

## Features

| Feature | Description |
|---------|-------------|
| 🔍 **Natural Language Query** | Ask questions like *"It's raining and the vehicle is stuck — what do I do?"* |
| 📋 **SOP-Grounded Answers** | Every answer is built from actual procedures — no hallucinated content |
| 📑 **Source Citations** | Shows which SOP document and section each answer was pulled from |
| 🏙️ **City Filter** | Filter by San Francisco, Las Vegas, Austin, or Foster City for city-specific playbooks |
| 🏷️ **Tag Filtering** | Filter by tags like `emergency`, `vehicle`, `weather`, `medical` |
| 📤 **Document Upload** | Upload PDFs, DOCX, TXT, MD, CSV, XLSX — auto-parsed into searchable sections |
| 🔒 **Admin Protection** | Knowledge base edits are password-protected; agents get read-only access |
| 📊 **Feedback Dashboard** | Satisfaction metrics, CSV export, and unhelpful query tracking |
| ⚡ **Query Caching** | Repeated queries return instantly from cache |
| 🤖 **AI-Powered** (optional) | Add an OpenAI API key for semantic search and GPT-synthesized answers |

## Tech Stack

- **Backend:** Node.js, Express, SQLite (better-sqlite3)
- **Frontend:** Vanilla JS, Vite, Marked.js
- **AI (optional):** OpenAI GPT-4o-mini + text-embedding-3-small
- **Deployment:** Render (with self-ping to prevent free tier sleep)

## Knowledge Base

Pre-loaded with **27 SOP sections** across **10 documents** covering:

- 🚨 Rider Emergency (medical, police, safety)
- 🚧 Vehicle Stuck / Blocked
- 🔍 Lost & Found
- 🌧️ Severe Weather Operations
- ♿ Accessibility & Special Needs
- 🔧 Vehicle Maintenance & Sensor Failures
- 💬 Rider Complaints & Billing
- 👋 New Rider Onboarding
- 💥 Vehicle Collision & Accident
- 🏙️ City-Specific Playbooks (SF, Las Vegas, Foster City, Austin)

## Getting Started

### Prerequisites
- Node.js 18+
- (Optional) OpenAI API key for AI-powered answers

### Run Locally

```bash
# Clone the repo
git clone https://github.com/neeteshg/zoox-playbook-assistant.git
cd zoox-playbook-assistant

# Install dependencies
cd server && npm install && cd ../client && npm install && cd ..

# (Optional) Add OpenAI key
echo "OPENAI_API_KEY=sk-your-key-here" > .env

# Start the backend
cd server && node index.js

# In another terminal, start the frontend
cd client && npx vite
```

Visit `http://localhost:5173`

### Deploy to Render

1. Push to GitHub
2. Connect the repo on [render.com](https://render.com)
3. Build command: `cd server && npm install && cd ../client && npm install && npx vite build`
4. Start command: `node server/index.js`
5. (Optional) Add `OPENAI_API_KEY` and `ADMIN_PASSWORD` as environment variables

## Architecture

```
┌──────────────┐     ┌──────────────────────────┐
│   Frontend   │────▶│     Express API Server    │
│  (Vite SPA)  │     │                          │
│              │     │  /api/query    → Search   │
│  • Query UI  │     │  /api/documents → CRUD   │
│  • KB Mgmt   │     │  /api/feedback  → Log    │
│  • Feedback  │     │  /api/admin     → Auth   │
└──────────────┘     └─────────┬────────────────┘
                               │
                    ┌──────────▼──────────┐
                    │   SQLite Database   │
                    │                     │
                    │  • documents        │
                    │  • sections (+ tags,│
                    │    city, embeddings) │
                    │  • feedback         │
                    └─────────────────────┘
```

## Future Vision

- Embed directly into Salesforce — SOPs appear on the agent's call screen automatically
- Pull from all Zoox knowledge sources (Docs, Confluence, training materials) in one unified search
- Conversation memory — the assistant remembers context across queries

---

Built by [Neetesh Gupta](https://github.com/neeteshg)
