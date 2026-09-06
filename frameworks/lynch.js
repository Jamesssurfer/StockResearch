// Peter Lynch GARP (Growth At a Reasonable Price) analysis.
// Same self-contained pattern as graham.js/buffett.js — functions prefixed
// lynchCalc*/lynchRender* since this file shares global scope with the
// other nine framework scripts.
window.analyzeLynch = function(stock) {
    const m = stock.metrics || {};

    const peg = lynchCalcPEG(m);
    const earningsYield = lynchCalcEarningsYield(m);
    const dividendYield = parseFloat(m.dividend_yield);

    const metrics = {
        'PEG Ratio': peg !== null ? peg.toFixed(2) : 'N/A',
        'Earnings Yield': earningsYield !== null ? `${(earningsYield * 100).toFixed(2)}%` : 'N/A',
        'Dividend Yield': isFinite(dividendYield) ? `${(dividendYield * 100).toFixed(2)}%` : '0%',
        'P/E Ratio': isFinite(m.pe_ratio) ? Number(m.pe_ratio).toFixed(2) : (m.pe_ratio || 'N/A'),
        'EPS Growth': isFinite(m.earnings_growth) ? `${(m.earnings_growth * 100).toFixed(2)}%` : 'N/A',
        'Debt to Equity': isFinite(m.debt_to_equity) ? Number(m.debt_to_equity).toFixed(2) : 'N/A'
    };

    const score = lynchCalcScore(peg, dividendYield, m);
    const recommendation = score > 70 ? 'GARP - Buy' : score > 40 ? 'Fair Value' : 'Avoid';

    return lynchRenderHTML(metrics, score, recommendation);
};

// PEG = P/E ÷ (annual EPS growth expressed as a whole number, e.g. 15 for 15%).
// Lynch's own rule of thumb: PEG < 1 is attractive, PEG > 2 is expensive.
// Returns null rather than a misleading number when growth is flat/negative,
// since PEG is undefined (or meaningless) there.
function lynchCalcPEG(m) {
    const pe = parseFloat(m.pe_ratio);
    const growth = parseFloat(m.earnings_growth);
    if (!isFinite(pe) || pe <= 0 || !isFinite(growth) || growth <= 0) return null;
    return pe / (growth * 100);
}

// Earnings yield = EPS / Price = 1 / P/E — the inverse framing Lynch used
// to compare a stock's earnings power against bond yields.
function lynchCalcEarningsYield(m) {
    const pe = parseFloat(m.pe_ratio);
    if (!isFinite(pe) || pe <= 0) return null;
    return 1 / pe;
}

// 0-100 score. PEG carries the most weight since it's the defining GARP
// metric; debt and dividend are secondary quality/income checks.
function lynchCalcScore(peg, dividendYield, m) {
    let score = 0;

    if (peg !== null) {
        if (peg < 1) score += 50;
        else if (peg < 1.5) score += 30;
        else if (peg < 2) score += 15;
    }

    const debtToEquity = parseFloat(m.debt_to_equity);
    if (isFinite(debtToEquity) && debtToEquity < 100) score += 25;

    const epsGrowth = parseFloat(m.earnings_growth);
    if (isFinite(epsGrowth) && epsGrowth > 0.10 && epsGrowth < 0.50) {
        // Lynch was wary of "too good to be true" growth rates as much as of
        // no growth at all — a company growing >50%/yr rarely sustains it.
        score += 15;
    }

    if (isFinite(dividendYield) && dividendYield > 0) score += 10;

    return Math.round(score);
}

function lynchRenderHTML(metrics, score, recommendation) {
    const verdictClass = recommendation === 'GARP - Buy' ? 'positive' : recommendation === 'Avoid' ? 'negative' : 'neutral';

    const metricRows = Object.entries(metrics).map(([label, value]) => `
        <div class="metric-row">
            <span class="metric-label">${label}</span>
            <span class="metric-value">${value}</span>
        </div>
    `).join('');

    return `
        <div class="framework-result">
            <h3>Peter Lynch GARP Analysis</h3>
            <div class="verdict ${verdictClass}">
                <strong>${recommendation}</strong> — Score: ${score}/100
            </div>
            <div class="metrics-grid">${metricRows}</div>
        </div>
    `;
}
