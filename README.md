# Aura Trading Bot

AI-assisted crypto market analysis dashboard. It reads public Bybit price data,
computes technical indicators, produces rule-based (ORMCR) signals with stop-loss and
take-profit levels, and uses Google Gemini to explain them in plain English.

> **Analysis only.** Aura never places trades and needs no exchange API keys.
> Signals have not been backtested — don't trade real money on them without doing so.

## Layout

| Folder | What | Hosted on |
|---|---|---|
| [`backend/`](backend/) | Flask API (Python 3.12) | Render |
| [`frontend/`](frontend/) | Next.js dashboard + Firebase | Vercel |

Earlier experiments are kept on the `archive/backend-v2` and `archive/frontend-v2` branches.

## Deployment settings

**Render (backend)**
- Repository: this repo · Branch: `main` · **Root Directory: `backend`**
- Build: `pip install -r requirements.txt` · Start: `gunicorn app:app`
- Environment: `GEMINI_API_KEY` (required for AI), `GEMINI_MODEL` (optional), `ALLOWED_ORIGINS` (optional)

**Vercel (frontend)**
- Repository: this repo · **Root Directory: `frontend`** · Framework: Next.js
- Environment: `NEXT_PUBLIC_BACKEND_BASE_URL` (the Render URL) and the `NEXT_PUBLIC_FIREBASE_*` values

## Development

```bash
# backend
cd backend && python -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt && python -m pytest && python app.py

# frontend
cd frontend && pnpm install && pnpm dev
```

A CI workflow (backend tests + frontend build) is ready at `.github/ci-workflow.yml`; move it to `.github/workflows/ci.yml` to enable it.
