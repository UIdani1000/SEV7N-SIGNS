# Loaded automatically by gunicorn from the folder it starts in (Render: `gunicorn app:app`).
import os

bind = f"0.0.0.0:{os.environ.get('PORT', '10000')}"
worker_class = "gthread"   # threads let a slow AI call run without blocking other requests
workers = 1                # keeps memory within Render's free tier
threads = 4
timeout = 120              # default is 30s, too short for data fetch + AI fallback
graceful_timeout = 30
