# AI Lead Generation SaaS Platform - Implementation Plan

## Project Overview
- **Project Name**: LeadForge AI
- **Type**: SaaS Web Application
- **Core Functionality**: AI-powered lead generation platform that scrapes Facebook groups/pages via Apify, displays leads in a dashboard, and conducts automated outreach via Meta Messenger using LLM agents
- **Target Users**: Sales teams, marketing agencies, small businesses seeking automated lead generation

---

## Tech Stack
| Layer | Technology |
|-------|------------|
| Frontend | React.js (Vercel) |
| Backend | Node.js / Express |
| Database | Neon DB (PostgreSQL) |
| Scraping | Apify API |
| AI/LLM | OpenAI or Anthropic |
| Messaging | Meta Graph API (Messenger) |

---

## Architecture Diagram

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Frontend  │────▶│   Backend   │────▶│  Neon DB    │
│  (React.js) │     │ (Express)   │     │ (PostgreSQL)│
└─────────────┘     └─────────────┘     └─────────────┘
       │                   │
       │                   ▼
       │            ┌─────────────┐
       │            │   Apify     │
       │            │   (Scraper) │
       │            └─────────────┘
       │                   │
       │                   ▼ (Webhook)
       │            ┌─────────────┐
       │            │   Meta      │
       │            │ Graph API   │
       │            │(Messenger)  │
       │            └─────────────┘
       │                   │
       │                   ▼
       │            ┌─────────────┐
       │            │ LLM (OpenAI │
       │            │  or Claude) │
       │            └─────────────┘
```

---

## Phase 1: Database Schema (Neon DB)

### Tables

#### 1. Users
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PRIMARY KEY |
| email | VARCHAR(255) | UNIQUE, NOT NULL |
| password_hash | VARCHAR(255) | NOT NULL |
| name | VARCHAR(255) | |
| company | VARCHAR(255) | |
| api_keys | JSONB | -- Apify, Meta, OpenAI stored per user |
| created_at | TIMESTAMP | DEFAULT NOW() |
| updated_at | TIMESTAMP | DEFAULT NOW() |

#### 2. Leads
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PRIMARY KEY |
| user_id | UUID | FOREIGN KEY → Users(id) |
| name | VARCHAR(255) | NOT NULL |
| price | DECIMAL(12,2) | |
| city | VARCHAR(255) | |
| source_url | TEXT | |
| source_type | VARCHAR(50) | 'group' or 'page' |
| status | ENUM | 'new', 'engaging', 'secured', 'dead' |
| facebook_id | VARCHAR(255) | |
| metadata | JSONB | Additional scraped data |
| conversation_history | JSONB | LLM conversation log |
| created_at | TIMESTAMP | DEFAULT NOW() |
| updated_at | TIMESTAMP | DEFAULT NOW() |

#### 3. Scrape_Jobs
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PRIMARY KEY |
| user_id | UUID | FOREIGN KEY → Users(id) |
| country | VARCHAR(100) | |
| city | VARCHAR(100) | |
| keywords | TEXT[] | |
| apify_run_id | VARCHAR(255) | Apify actor run ID |
| status | ENUM | 'pending', 'running', 'completed', 'failed' |
| leads_count | INTEGER | |
| created_at | TIMESTAMP | DEFAULT NOW() |
| completed_at | TIMESTAMP | |

---

## Phase 2: Backend Services (Node.js/Express)

### API Endpoints

#### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/auth/register | Create new user |
| POST | /api/auth/login | Login user |
| GET | /api/auth/me | Get current user |

#### Leads Management
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/leads | List leads (with filters) |
| GET | /api/leads/:id | Get single lead |
| PUT | /api/leads/:id | Update lead status |
| DELETE | /api/leads/:id | Delete lead |

#### Scraping
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/scrape/trigger | Trigger Apify scraper |
| POST | /api/scrape/webhook | Apify webhook receiver |
| GET | /api/scrape/jobs | List scrape jobs |

#### AI Outreach
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/outreach/start | Start AI outreach for a lead |
| POST | /api/outreach/message | Send message to lead |
| GET | /api/outreach/conversation/:leadId | Get conversation history |
| POST | /api/outreach/intervene | Manual intervention |

### Service Modules

1. **ApifyService**
   - `triggerScraper(params)` - Start Apify actor
   - `getRunStatus(runId)` - Check scrape status
   - `getResults(runId)` - Fetch scraped data

2. **LLMService**
   - `generateOutreachMessage(leadContext)` - Create personalized message
   - `analyzeConversation(messages)` - Determine sentiment
   - `decideNextAction(lead, history)` - AI decision logic

3. **MessengerService**
   - `sendMessage(recipientId, message)` - Send via Graph API
   - `getConversation(recipientId)` - Fetch message history

4. **LeadStatusService**
   - `analyzeAndUpdateStatus(leadId)` - Auto-update based on sentiment

---

## Phase 3: Frontend Dashboard (React.js)

### Pages

1. **Login/Register** - Authentication screens
2. **Dashboard** - Overview with stats cards
3. **Leads** - Data table with filters
4. **Scrape** - Search parameter form
5. **Conversations** - Chat monitoring

### Components

| Component | Purpose |
|-----------|---------|
| StatCard | Display KPI metrics |
| LeadTable | Sortable/filterable data table |
| StatusBadge | Color-coded status indicator |
| ScrapeForm | Country/City/Keywords inputs |
| ChatPanel | Real-time conversation monitor |
| Modal | Lead details / intervention |

### State Management
- React Context for auth
- React Query for API data fetching

---

## File Structure

```
/leadforge-ai
├── backend/
│   ├── src/
│   │   ├── config/
│   │   │   └── database.js
│   │   ├── controllers/
│   │   │   ├── authController.js
│   │   │   ├── leadsController.js
│   │   │   ├── scrapeController.js
│   │   │   └── outreachController.js
│   │   ├── services/
│   │   │   ├── apifyService.js
│   │   │   ├── llmService.js
│   │   │   ├── messengerService.js
│   │   │   └── leadStatusService.js
│   │   ├── routes/
│   │   │   ├── auth.js
│   │   │   ├── leads.js
│   │   │   ├── scrape.js
│   │   │   └── outreach.js
│   │   ├── middleware/
│   │   │   └── auth.js
│   │   ├── models/
│   │   │   └── index.js
│   │   ├── utils/
│   │   │   └── helpers.js
│   │   └── index.js
│   ├── package.json
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── context/
│   │   ├── hooks/
│   │   ├── services/
│   │   ├── utils/
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── package.json
│   ├── vite.config.js
│   └── .env.example
└── README.md
```

---

## Implementation Order

1. **Week 1**: Database setup + Backend skeleton
2. **Week 2**: Apify integration + Webhook receiver
3. **Week 3**: LLM service + AI conversation engine
4. **Week 4**: Frontend dashboard with mock data
5. **Week 5**: Connect frontend to backend
6. **Week 6**: Testing + Bug fixes + Deployment

---

## Environment Variables Required

```env
# Database (Neon DB)
DATABASE_URL=

# Apify
APIFY_API_TOKEN=
APIFY_ACTOR_ID=

# Meta Graph API
META_ACCESS_TOKEN=
META_PAGE_ID=
META_APP_SECRET=

# LLM (OpenAI or Anthropic)
OPENAI_API_KEY=
# OR
ANTHROPIC_API_KEY=

# Auth
JWT_SECRET=

# App
PORT=3001
NODE_ENV=development
```

---

## Mock Data Strategy

Frontend will use mock data initially:
- 20 sample leads with varied statuses
- 5 sample scrape jobs
- Sample conversation histories

This allows UI verification before live API integration.
