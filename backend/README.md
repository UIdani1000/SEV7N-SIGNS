# Aura Trading Bot – Backend

Flask API behind the Aura dashboard. It reads public Bybit candles, computes indicators
(`indicators.py`), runs the rule-based ORMCR signal, and optionally asks Gemini to write
a plain-English explanation. **It never places trades and needs no exchange API key.**

## Endpoints
| Route | What it does |
|---|---|
| `GET /` | Health check |
| `GET /all_market_prices` | Price, RSI, MACD, Stoch, signal for 6 majors |
| `POST /run_ormcr_analysis` | Multi-timeframe signal + SL/TP. Works without AI; AI only adds commentary |
| `POST /chat` | AI chat (needs `GEMINI_API_KEY`) |

## Environment variables (set in Render → Environment, never in code)
| Name | Required | Notes |
|---|---|---|
| `GEMINI_API_KEY` | for AI features | From Google AI Studio |
| `GEMINI_MODEL` | no | Default `gemini-3.8-flash` |
| `ALLOWED_ORIGINS` | no | Comma-separated; defaults to the Vercel dashboard + localhost |

## Local development
```bash
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt
python -m pytest            # 26 tests, no network or keys needed
python app.py               # http://127.0.0.1:10000
```
Note: Bybit blocks some countries (including the US), so live data may not load locally
depending on where you are. Tests mock Bybit and always work.
