// Fama-French Three-Factor Model. Self-contained, prefixed
// ffCalc*/ffRender*.
//
// A real SMB/HML factor loading comes from regressing a stock's historical
// returns against Ken French's published factor-return series — external
// data this pipeline doesn't fetch. What follows are bucketed proxies
// (size premium from market cap tier, value premium from P/B tier), not
// fitted factor loadings. They're directionally reasonable but not the
// real thing, and the metric labels say so rather than presenting them as
// equivalent.
window.analyzeFamaFrench = function(stock) {
    const m = stock.metrics || {};

    const beta = isFinite(parseFloat(m.beta)) ? parseFloat(m.beta) : 1;
    const marketRiskPremium = 0.06;
    const riskFreeRate = 0.04;
    const sizePremium = ffSizeProxy(parseFloat(m.market_cap));
    const valuePremium = ffValueProxy(parseFloat(m.price_to_book));

    const expectedReturn = riskFreeRate + beta * marketRiskPremium + sizePremium + valuePremium;

    const metrics = {
        'Beta': beta.toFixed(2),
        'Size Factor (SMB, proxy)': sizePremium.toFixed(4),
        'Value Factor (HML, proxy)': valuePremium.toFixed(4),
        'Market Risk Premium': marketRiskPremium.toFixed(4),
        'Risk-Free Rate': riskFreeRate.toFixed(4),
        'Expected Return (CAPM + proxies)': `${(expectedReturn * 100).toFixed(2)}%`
    };

    const score = ffCalcScore(expectedReturn, beta);
    const recommendation = expectedReturn > 0.10 ? 'Bullish' : expectedReturn > 0.06 ? 'Neutral' : 'Bearish';

    return ffRenderHTML(metrics, score, recommendation);
};

// Bucketed by market cap tier — historically smaller companies carry a
// higher expected-return premium (the "size effect"), though this has been
// weaker/inconsistent in mega-cap-dominated markets in recent years.
function ffSizeProxy(marketCap) {
    if (!isFinite(marketCap) || marketCap <= 0) return 0;
    if (marketCap > 200e9) return -0.02; // mega cap
    if (marketCap > 10e9) return 0;      // large/mid cap
    if (marketCap > 2e9) return 0.01;    // mid cap
    return 0.03;                         // small cap
}

// Bucketed by P/B — low P/B ("value") has historically carried a return
// premium over high P/B ("growth"), the HML effect. Direction only, not a
// fitted loading.
function ffValueProxy(priceToBook) {
    if (!isFinite(priceToBook) || priceToBook <= 0) return 0;
    if (priceToBook < 1) return 0.04;
    if (priceToBook < 3) return 0.01;
    if (priceToBook < 10) return -0.01;
    return -0.03;
}

function ffCalcScore(expectedReturn, beta) {
    let score = 0;
    if (expectedReturn > 0.12) score += 60;
    else if (expectedReturn > 0.08) score += 40;
    else if (expectedReturn > 0.04) score += 20;

    // Extreme beta (very high or very low/negative) is a risk flag, not
    // scored as automatically good or bad — moderate beta gets a small bonus
    // for being closer to "typical" market-like risk.
    if (isFinite(beta) && beta > 0.5 && beta < 1.5) score += 20;

    return Math.min(100, score + 20); // baseline so a middling result isn't 0
}

function ffRenderHTML(metrics, score, recommendation) {
    const verdictClass = recommendation === 'Bullish' ? 'positive' : recommendation === 'Bearish' ? 'negative' : 'neutral';

    const metricRows = Object.entries(metrics).map(([label, value]) => `
        <div class="metric-row">
            <span class="metric-label">${label}</span>
            <span class="metric-value">${value}</span>
        </div>
    `).join('');

    return `
        <div class="framework-result">
            <h3>Fama-French Three Factor Model</h3>
            <div class="verdict ${verdictClass}">
                <strong>${recommendation}</strong> — Score: ${score}/100
            </div>
            <div class="metrics-grid">${metricRows}</div>
            <p style="color:var(--text-secondary); font-size:12px; margin-top:12px;">
                Size/Value factors are bucketed proxies from market cap and P/B, not regression-fitted
                loadings against actual Fama-French factor-return data.
            </p>
        </div>
    `;
}
