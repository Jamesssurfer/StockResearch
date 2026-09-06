// Black-Scholes option pricing. Self-contained, prefixed bsCalc*/bsRender*.
//
// Two things the original file got structurally wrong, fixed here rather
// than carried forward:
// 1. calculateVolatility(stock) was a phantom function — implemented for
//    real below, using actual historical (realized) volatility computed
//    from the 30-day Price_History close prices. 30 daily closes is a thin
//    sample for a volatility estimate (option desks typically use 60-252
//    days) — noted in the output rather than presented as precise.
// 2. The original had a "Bullish/Bearish" recommendation derived from a
//    phantom calculateFairValue(). Black-Scholes prices OPTIONS on a stock;
//    it does not produce a fair value for the stock itself. That
//    recommendation was conceptually wrong independent of the missing
//    function. Replaced with a volatility-regime read, which is what this
//    model actually tells you something about.
window.analyzeBlackScholes = function(stock) {
    const m = stock.metrics || {};
    const hist = stock.historicalData || [];

    const currentPrice = parseFloat(m.current_price);
    const riskFreeRate = 0.04;
    const dividendYield = isFinite(parseFloat(m.dividend_yield)) ? parseFloat(m.dividend_yield) / 100 : 0; // stored as a percent number, e.g. 0.34 = 0.34%
    const volatility = bsCalcHistoricalVolatility(hist);

    if (!isFinite(currentPrice) || currentPrice <= 0 || volatility === null) {
        return bsRenderInsufficientData();
    }

    const timeToExpiry = 30 / 365;
    const strikePrice = currentPrice * 1.1; // 10% OTM, matches original file's convention
    const d1 = bsD1(currentPrice, strikePrice, riskFreeRate, dividendYield, volatility, timeToExpiry);
    const d2 = d1 - volatility * Math.sqrt(timeToExpiry);

    const callPrice = bsCallPrice(currentPrice, strikePrice, riskFreeRate, dividendYield, timeToExpiry, d1, d2);
    const putPrice = bsPutPrice(currentPrice, strikePrice, riskFreeRate, dividendYield, timeToExpiry, d1, d2);
    const delta = bsDelta(d1, dividendYield, timeToExpiry);
    const gamma = bsGamma(d1, currentPrice, volatility, timeToExpiry, dividendYield);
    const theta = bsTheta(currentPrice, strikePrice, d1, d2, volatility, timeToExpiry, riskFreeRate, dividendYield);
    const vega = bsVega(currentPrice, d1, timeToExpiry, dividendYield);

    const metrics = {
        'Stock Price': `$${currentPrice.toFixed(2)}`,
        'Historical Volatility (30-day, annualized)': `${(volatility * 100).toFixed(2)}%`,
        'Strike (10% OTM, 30-day expiry)': `$${strikePrice.toFixed(2)}`,
        'Call Option Price': `$${callPrice.toFixed(2)}`,
        'Put Option Price': `$${putPrice.toFixed(2)}`,
        'Delta (call)': delta.toFixed(3),
        'Gamma': gamma.toFixed(4),
        'Theta (call, per day)': theta.toFixed(3),
        'Vega (per 1pt vol)': vega.toFixed(3)
    };

    const regime = volatility > 0.40 ? 'High Volatility' : volatility > 0.20 ? 'Moderate Volatility' : 'Low Volatility';

    return bsRenderHTML(metrics, regime, hist.length);
};

// Annualized realized volatility from daily log returns of Close prices.
function bsCalcHistoricalVolatility(hist) {
    const closes = hist.map(r => parseFloat(r.Close)).filter(isFinite);
    if (closes.length < 5) return null; // too few points for any meaningful estimate

    const logReturns = [];
    for (let i = 1; i < closes.length; i++) {
        if (closes[i - 1] > 0 && closes[i] > 0) {
            logReturns.push(Math.log(closes[i] / closes[i - 1]));
        }
    }
    if (logReturns.length < 4) return null;

    const mean = logReturns.reduce((a, b) => a + b, 0) / logReturns.length;
    const variance = logReturns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / (logReturns.length - 1);
    const dailyStdDev = Math.sqrt(variance);
    return dailyStdDev * Math.sqrt(252); // annualize
}

// Standard normal PDF/CDF — CDF via the Abramowitz-Stegun erf approximation
// (max error ~1.5e-7), not a library dependency.
function bsNormPDF(x) {
    return Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI);
}
function bsErf(x) {
    const sign = x < 0 ? -1 : 1;
    x = Math.abs(x);
    const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
    const t = 1 / (1 + p * x);
    const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
    return sign * y;
}
function bsNormCDF(x) {
    return 0.5 * (1 + bsErf(x / Math.sqrt(2)));
}

function bsD1(S, K, r, q, sigma, T) {
    return (Math.log(S / K) + (r - q + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
}

function bsCallPrice(S, K, r, q, T, d1, d2) {
    return S * Math.exp(-q * T) * bsNormCDF(d1) - K * Math.exp(-r * T) * bsNormCDF(d2);
}
function bsPutPrice(S, K, r, q, T, d1, d2) {
    return K * Math.exp(-r * T) * bsNormCDF(-d2) - S * Math.exp(-q * T) * bsNormCDF(-d1);
}
function bsDelta(d1, q, T) {
    return Math.exp(-q * T) * bsNormCDF(d1);
}
function bsGamma(d1, S, sigma, T, q) {
    return (Math.exp(-q * T) * bsNormPDF(d1)) / (S * sigma * Math.sqrt(T));
}
function bsTheta(S, K, d1, d2, sigma, T, r, q) {
    const term1 = -(S * bsNormPDF(d1) * sigma * Math.exp(-q * T)) / (2 * Math.sqrt(T));
    const term2 = -r * K * Math.exp(-r * T) * bsNormCDF(d2);
    const term3 = q * S * Math.exp(-q * T) * bsNormCDF(d1);
    return (term1 + term2 + term3) / 365; // per calendar day
}
function bsVega(S, d1, T, q) {
    return (S * Math.exp(-q * T) * bsNormPDF(d1) * Math.sqrt(T)) / 100; // per 1 percentage point of vol
}

function bsRenderInsufficientData() {
    return `
        <div class="framework-result">
            <h3>Black-Scholes Option Pricing Model</h3>
            <div class="verdict neutral">
                <strong>Insufficient Data</strong> — need at least 5 days of price history and a valid current price.
            </div>
        </div>
    `;
}

function bsRenderHTML(metrics, regime, historyDays) {
    const verdictClass = regime === 'High Volatility' ? 'negative' : regime === 'Low Volatility' ? 'positive' : 'neutral';

    const metricRows = Object.entries(metrics).map(([label, value]) => `
        <div class="metric-row">
            <span class="metric-label">${label}</span>
            <span class="metric-value">${value}</span>
        </div>
    `).join('');

    return `
        <div class="framework-result">
            <h3>Black-Scholes Option Pricing Model</h3>
            <div class="verdict ${verdictClass}">
                <strong>${regime}</strong> (volatility read only — this model prices options, it does not generate a buy/sell call on the stock itself)
            </div>
            <div class="metrics-grid">${metricRows}</div>
            <p style="color:var(--text-secondary); font-size:12px; margin-top:12px;">
                Volatility is realized/historical, computed from ${historyDays} days of closing prices — a thin sample
                for a volatility estimate (option desks typically use 60-252 days). Treat it as directional, not precise.
            </p>
        </div>
    `;
}
