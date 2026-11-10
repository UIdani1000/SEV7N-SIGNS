import os
import sys

import pandas as pd
import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
DATA = os.path.join(os.path.dirname(__file__), "data", "btc_h1_reference.csv")


@pytest.fixture(scope="session")
def reference_df():
    return pd.read_csv(DATA)


def _bybit_kline_payload(reference_df):
    """Reference candles in Bybit's v5 kline format: newest first, values as strings."""
    rows = []
    for r in reference_df.iloc[::-1].itertuples():
        ms = int(r.start * 1000)
        rows.append([str(ms), str(r.open), str(r.high), str(r.low), str(r.close), str(r.volume), "0"])
    return {"retCode": 0, "result": {"list": rows}}


@pytest.fixture()
def app_module(monkeypatch, reference_df):
    """Import app with no Gemini key and a fake Bybit client (no network)."""
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.delenv("GOOGLE_API_KEY", raising=False)
    monkeypatch.delenv("ALLOWED_ORIGINS", raising=False)
    sys.modules.pop("app", None)
    import app as app_mod

    payload = _bybit_kline_payload(reference_df)
    monkeypatch.setattr(app_mod.bybit_client, "get_kline", lambda **kw: payload)
    monkeypatch.setattr(app_mod.time, "sleep", lambda s: None)
    return app_mod


@pytest.fixture()
def client(app_module):
    return app_module.app.test_client()
