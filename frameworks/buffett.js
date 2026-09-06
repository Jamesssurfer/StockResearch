// Warren Buffett-style quality + intrinsic value analysis.
// Same pattern as graham.js: everything self-contained, reads stock.metrics
// (flat row from the Metrics sheet), no shared helpers with other framework
// files. Function names are prefixed buffettCalc*/buffettRender* because all
// ten framework files load as separate <script> tags into one global scope —
// an unprefixed calculateScore() in two files would silently clobber the
// first one's definition.
window.analyzeBuffett = function(stock) {
    const m = stock.metrics || {};

    const currentPrice = parseFloat(m.current_price);
    const intrinsicValue = buffettCalcIntrinsicValue(m);
    const marginOfSafety = (intrinsicValue !== null && intrinsicValue > 0 && isFinite(currentPrice))
        ? ((intrinsicValue - currentPrice) / intrinsicValue) * 100
        : null;

    const metrics = {
        'ROE': isFinite(m.roe) ? `${(m.roe * 100).toFixed(2)}%` : 'N/A',
        'Debt to Equity': isFinite(m.debt_to_equity) ? Number(m.debt_to_equity).toFixed(2) : 'N/A',
        'Current Ratio': isFinite(m.current_ratio) ? Number(m.current_ratio).toFixed(2) : 'N/A',
        'Profit Margin': isFinite(m.profit_margin) ? `${(m.profit_margin * 100).toFixed(2)}%` : 'N/A',
        'EPS Growth': isFinite(m.earnings_growth) ? `${(m.earnings_growth * 100).toFixed(2)}%` : 'N/A',
        'Dividend Yield': isFinite(m.dividend_yield) ? `${(m.dividend_yield * 100).toFixed(2)}%` : '0%'
    };

    const score = buffettCalcScore(m, intrinsicValue, currentPrice);
    const recommendation = score > 70 ? 'Bullish' : score > 40 ? 'Neutral' : 'Bearish';

    return buffettRenderHTML(metrics, score, recommendation, intrinsicValue, currentPrice, marginOfSafety);
};

// Simplified 10-year DCF on EPS as a stand-in for owner earnings — this is a
// deliberate simplification (Buffett's own method uses full owner earnings:
// net income + D&A - capex - working capital change, none of which are in
// the flat Metrics sheet). Growth is capped at 15%/yr since naively
// projecting a reported earnings_growth figure (which can be >100% off a
// low base, per the manifest data) compounded for 10 years produces
// meaningless valuations.
function buffettCalcIntrinsicValue(m) {
    const eps = parseFloat(m.eps);
    if (!isFinite(eps) || eps <= 0) return null;

    const rawGrowth = parseFloat(m.earnings_growth);
    const growthRate = isFinite(rawGrowth) ? Math.min(Math.max(rawGrowth, 0), 0.15) : 0.05;
    const discountRate = 0.09;   // required return
    const terminalGrowth = 0.03; // perpetuity growth after year 10
    const years = 10;

    let value = 0;
    let projectedEps = eps;
    for (let y = 1; y <= years; y++) {
        projectedEps *= (1 + growthRate);
        value += projectedEps / Math.pow(1 + discountRate, y);
    }

    const terminalEps = projectedEps * (1 + terminalGrowth);
    const terminalValue = terminalEps / (discountRate - terminalGrowth);
    value += terminalValue / Math.pow(1 + discountRate, years);

    return value;
}

// 0-100 score, ~16.67 points per check (6 checks), rounded. Missing data
// fails the check rather than passing it by default.
function buffettCalcScore(m, intrinsicValue, currentPrice) {
    let score = 0;
    const perCheck = 100 / 6;

    const roe = parseFloat(m.roe);
    if (isFinite(roe) && roe > 0.15) score += perCheck;

    const debtToEquity = parseFloat(m.debt_to_equity);
    if (isFinite(debtToEquity) && debtToEquity < 100) score += perCheck;

    const currentRatio = parseFloat(m.current_ratio);
    if (isFinite(currentRatio) && currentRatio > 1.5) score += perCheck;

    const profitMargin = parseFloat(m.profit_margin);
    if (isFinite(profitMargin) && profitMargin > 0.10) score += perCheck;

    const epsGrowth = parseFloat(m.earnings_growth);
    if (isFinite(epsGrowth) && epsGrowth > 0.10) score += perCheck;

    if (intrinsicValue !== null && isFinite(currentPrice) && currentPrice < intrinsicValue) {
        score += perCheck;
    }

    return Math.round(score);
}

function buffettRenderHTML(metrics, score, recommendation, intrinsicValue, currentPrice, marginOfSafety) {
    const verdictClass = recommendation === 'Bullish' ? 'positive' : recommendation === 'Bearish' ? 'negative' : 'neutral';

    const metricRows = Object.entries(metrics).map(([label, value]) => `
        <div class="metric-row">
            <span class="metric-label">${label}</span>
            <span class="metric-value">${value}</span>
        </div>
    `).join('');

    const fmtMoney = (v) => (v === null || !isFinite(v)) ? 'N/A (insufficient data)' : `$${v.toFixed(2)}`;
    const fmtPct = (v) => (v === null || !isFinite(v)) ? 'N/A' : `${v.toFixed(1)}%`;

    return `
        <div class="framework-result">
            <h3>Warren Buffett Intrinsic Value Analysis</h3>
            <div class="verdict ${verdictClass}">
                <strong>${recommendation}</strong> — Score: ${score}/100
            </div>
            <div class="metrics-grid">${metricRows}</div>
            <div class="value-comparison">
                <div class="metric-row"><span class="metric-label">Current Price</span><span class="metric-value">${fmtMoney(currentPrice)}</span></div>
                <div class="metric-row"><span class="metric-label">Intrinsic Value (10yr DCF on EPS, 9% discount)</span><span class="metric-value">${fmtMoney(intrinsicValue)}</span></div>
                <div class="metric-row"><span class="metric-label">Margin of Safety</span><span class="metric-value">${fmtPct(marginOfSafety)}</span></div>
            </div>
        </div>
    `;
}
