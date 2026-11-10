"""indicators.py must reproduce pandas_ta 0.3.14b exactly (reference CSV was produced by it)."""
import numpy as np
import pandas as pd
import pytest

import indicators as ind

COLUMNS = ["RSI_14", "MACD_12_26_9", "MACDh_12_26_9", "MACDs_12_26_9", "EMA_9", "SMA_20", "EMA_50",
           "BBL_5_2.0", "BBM_5_2.0", "BBU_5_2.0", "BBB_5_2.0", "BBP_5_2.0", "STOCHk_14_3_3", "STOCHd_14_3_3"]


@pytest.fixture(scope="module")
def computed(reference_df):
    df = reference_df[["start", "open", "high", "low", "close", "volume"]].copy()
    ind.add_rsi(df); ind.add_macd(df); ind.add_ema(df, 9); ind.add_sma(df, 20); ind.add_ema(df, 50)
    ind.add_bbands(df); ind.add_stoch(df); ind.add_atr(df)
    return df


@pytest.mark.parametrize("col", COLUMNS)
def test_matches_pandas_ta_0314(computed, reference_df, col):
    np.testing.assert_allclose(computed[col], reference_df[col], rtol=1e-9, equal_nan=True)


def test_atr_matches_and_has_name_app_reads(computed, reference_df):
    # pandas_ta only ever created ATRr_14; app.py reads ATR_14. Both must exist now.
    np.testing.assert_allclose(computed["ATR_14"], reference_df["ATRr_14"], rtol=1e-9, equal_nan=True)
    np.testing.assert_allclose(computed["ATRr_14"], computed["ATR_14"], equal_nan=True)


def test_short_series_does_not_crash():
    df = pd.DataFrame({"open": [1.0] * 5, "high": [1.0] * 5, "low": [1.0] * 5, "close": [1.0] * 5, "volume": [1.0] * 5})
    ind.add_ema(df, 9); ind.add_macd(df); ind.add_rsi(df)
    assert df["EMA_9"].isna().all()
