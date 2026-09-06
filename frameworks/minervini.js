// Mark Minervini's SEPA analysis. Self-contained, prefixed
// minerviniCalc*/minerviniRender*.
//
// Minervini's core "Trend Template" requires the 50-day, 150-day, and
// 200-day simple moving averages, in a specific stacked order, plus price
// position relative to all three. fetch_stock_data.py calls
// ticker.history(period='1mo') — 30 calendar days, meaning a bit over 20
// trading days. There is no way to compute a 200-day SMA from that, and
// approximating one from 20 days of data isn't a shortcut, it's a
// fabrication. The Trend Template is shown as "Data Unavailable" rather
// than faked from insufficient history. What IS computable: 52-week
// high/low position (from the Metrics sheet, not derived from price
// history), revenue growth (from the two-period Financials data), earnings
// growth, profit margin, and a momentum proxy for RS Rating — same
// approximation and same caveat as O'Neil's "L".
window.analyzeMinervini = function(stock) {
    const m = stock.metrics || {};
    const mp = stock.multiPeriod || {};
    const hist = stock.historicalData || [];

    const pctOffHigh = minerviniCalcPctOffHigh(m);
    const pctAboveLow = minerviniCalcPctAboveLow(m);
    const revenueGrowth = minerviniCalcRevenueGrowth(mp.totalRevenue);
    const momentum = minerviniCalcMomentum(hist);

    const metrics = {
        'RS Rating (proxy: 30-day momentum)': momentum !== null ? `${momentum > 0 ? '+' : ''}${momentum.toFixed(1)}%` : 'N/A',
        '% Off 52-Week High': pctOffHigh !== null ? `${pctOffHigh.toFixed(1)}%` : 'N/A',
        '% Above 52-Week Low': pctAboveLow !== null ? `${pctAboveLow.toFixed(1)}%` : 'N/A',
        'Sales Growth (YoY)': revenueGrowth !== null ? `${(revenueGrowth * 100).toFixed(1)}%` : 'N/A',
        'Earnings Growth': isFinite(m.earnings_growth) ? `${(m.earnings_growth * 100).toFixed(1)}%` : 'N/A',
        'Profit Margin': isFinite(m.profit_margin) ? `${(m.profit_margin * 100).toFixed(1)}%` : 'N/A',
        'Market Cap': minerviniFmtMoney(parseFloat(m.market_cap)),
        'Trend Template (50/150/200-day SMA)': 'Data Unavailable — needs ~200 days of price history; this pipeline fetches 30'
    };

    const checks = [
        pctOffHigh !== null ? pctOffHigh <= 25 : null,
        pctAboveLow !== null ? pctAboveLow >= 30 : null,
        revenueGrowth !== null ? revenueGrowth > 0.15 : null,
        isFinite(m.earnings_growth) ? m.earnings_growth > 0.15 : null,
        momentum !== null ? momentum > 0 : null
    ];
    const evaluable = checks.filter(c => c !== null);
    const passed = evaluable.filter(c => c === true).length;
    const score = evaluable.length ? Math.round((passed / evaluable.length) * 100) : 0;
    const recommendation = evaluable.length < 3 ? 'Insufficient Data' : score > 70 ? 'Strong Trend' : score > 40 ? 'Developing' : 'Avoid';

    return minerviniRenderHTML(metrics, score, evaluable.length, recommendation);
};

function minerviniCalcPctOffHigh(m) {
    const price = parseFloat(m.current_price);
    const high = parseFloat(m['52_week_high']);
    if (!isFinite(price) || !isFinite(high) || high <= 0) return null;
    return ((high - price) / high) * 100;
}

function minerviniCalcPctAboveLow(m) {
    const price = parseFloat(m.current_price);
    const low = parseFloat(m['52_week_low']);
    if (!isFinite(price) || !isFinite(low) || low <= 0) return null;
    return ((price - low) / low) * 100;
}

function minerviniCalcRevenueGrowth(revenueSeries) {
    if (!revenueSeries || revenueSeries.latest === null || revenueSeries.prior === null || revenueSeries.prior === 0) {
        return null;
    }
    return (revenueSeries.latest - revenueSeries.prior) / Math.abs(revenueSeries.prior);
}

function minerviniCalcMomentum(hist) {
    if (!hist || hist.length < 2) return null;
    const closes = hist.map(r => parseFloat(r.Close)).filter(isFinite);
    if (closes.length < 2) return null;
    const first = closes[0], last = closes[closes.length - 1];
    if (first <= 0) return null;
    return ((last - first) / first) * 100;
}

function minerviniFmtMoney(v) {
    if (!isFinite(v)) return 'N/A';
    const abs = Math.abs(v);
    if (abs >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
    if (abs >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
    if (abs >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
    return `$${v.toFixed(2)}`;
}

function minerviniRenderHTML(metrics, score, evaluableCount, recommendation) {
    const verdictClass = recommendation === 'Strong Trend' ? 'positive' : recommendation === 'Avoid' ? 'negative' : 'neutral';

    const metricRows = Object.entries(metrics).map(([label, value]) => `
        <div class="metric-row">
            <span class="metric-label">${label}</span>
            <span class="metric-value">${value}</span>
        </div>
    `).join('');

    return `
        <div class="framework-result">
            <h3>Mark Minervini SEPA Analysis</h3>
            <div class="verdict ${verdictClass}">
                <strong>${recommendation}</strong> — Score: ${score}/100 (${evaluableCount}/5 available checks; the full Trend Template needs more price history than this pipeline fetches)
            </div>
            <div class="metrics-grid">${metricRows}</div>
        </div>
    `;
}
