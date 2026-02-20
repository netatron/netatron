# Netatron

Full-stack AI platform for automated business data scraping and processing.

## Architecture

- **Frontend**: React (TypeScript) + Vite
- **Backend**: FastAPI (Python 3.11)
- **Database**: PostgreSQL (Cloud SQL)
- **Deployment**: Docker → GCP Cloud Run
- **AI**: OpenAI GPT-4o-mini, Google Gemini 1.5-pro/3.0-pro

## Quick Start

### Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload
```

### Frontend

```bash
cd netatronagent_frontend-main
npm install
npm run dev
```

## Deployment

The project uses Docker containers for deployment:

- **Backend**: `backend/Dockerfile` - FastAPI service on port 8080
- **Frontend**: Can be served by backend (unified deployment) or separately

### Environment Variables

Required environment variables (see `backend/app/config.py`):

- `OPENAI_API_KEY` - OpenAI API key
- `GOOGLE_MAPS_API_KEY` - Google Maps API key
- `GEMINI_API_KEY` - Google Gemini API key (or use GOOGLE_MAPS_API_KEY)
- `GOOGLE_CSE_API_KEY` - Google Custom Search API key
- `GOOGLE_CSE_CX` - Google Custom Search Engine ID
- `DATABASE_URL` - PostgreSQL connection string
- `ALLOWED_EMAILS` - Comma-separated list of allowed user emails
- `ADMIN_EMAILS` - Comma-separated list of admin emails
- `GOOGLE_CLIENT_ID` - Google OAuth client ID

## Features

- AI-powered data extraction from web sources
- Google Maps scraping
- KPO platform integration
- Email invoice processing
- Multi-tenant architecture
- Background job processing with retry logic
