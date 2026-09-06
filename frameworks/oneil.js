// William J. O'Neil's CANSLIM. Self-contained, prefixed
// oneilCalc*/oneilRender*.
//
// Two of the seven letters genuinely cannot be computed from anything in
// this pipeline, and are shown as "Data Unavailable" rather than faked:
//   I - Institutional Sponsorship needs 13F holdings data — not fetched anywhere.
//   M - Market Direction needs an index-level trend (S&P 500 etc.) — no
//       market-level data exists in this pipeline, only per-symbol data.
// The score is out of the 5 letters that ARE computable, clearly labeled as
// such — presenting a 7-letter score built from 5 inputs would be misleading.
window.analyzeOneil = function(stock) {
    const m = stock.metrics || {};
    const mp = stock.multiPeriod || {};
    const hist = stock.historicalData || [];

    const currentEarningsGrowth = parseFloat(m.earnings_growth); // yfinance's earningsGrowth (quarterly YoY)
    const annualEarningsGrowth = oneilCalcAnnualGrowth(mp.netIncome);
    const pctOffHigh = oneilCalcPctOffHigh(m);
    const volumeTrend = oneilCalcVolumeTrend(hist);
    const momentum = oneilCalcMomentum(hist);

    const criteria = [
        {
            letter: 'C', label: 'Current Earnings (quarterly)',
            current: isFinite(currentEarningsGrowth) ? `${(currentEarningsGrowth * 100).toFixed(1)}%` : 'N/A',
            target: '> 25%',
            pass: isFinite(currentEarningsGrowth) ? currentEarningsGrowth > 0.25 : null
        },
        {
            letter: 'A', label: 'Annual Earnings (YoY net income)',
            current: annualEarningsGrowth !== null ? `${(annualEarningsGrowth * 100).toFixed(1)}%` : 'N/A',
            target: '> 25%',
            pass: annualEarningsGrowth !== null ? annualEarningsGrowth > 0.25 : null
        },
        {
            letter: 'N', label: 'New Highs (price vs 52-week high)',
            current: pctOffHigh !== null ? `${pctOffHigh.toFixed(1)}% off high` : 'N/A',
            target: 'Within 10% of 52wk high',
            pass: pctOffHigh !== null ? pctOffHigh <= 10 : null
        },
        {
            letter: 'S', label: 'Supply & Demand (30-day volume trend)',
            current: volumeTrend !== null ? `${volumeTrend > 0 ? '+' : ''}${volumeTrend.toFixed(1)}%` : 'N/A',
            target: 'Rising volume',
            pass: volumeTrend !== null ? volumeTrend > 0 : null
        },
        {
            letter: 'L', label: 'Leader/Laggard (30-day price momentum, proxy for RS Rating)',
            current: momentum !== null ? `${momentum > 0 ? '+' : ''}${momentum.toFixed(1)}%` : 'N/A',
            target: 'Outperforming (proxy only — true RS Rating needs a full market universe to rank against, which this pipeline does not have)',
            pass: momentum !== null ? momentum > 0 : null
        },
        {
            letter: 'I', label: 'Institutional Sponsorship',
            current: 'Data Unavailable', target: '> 40% institutional ownership', pass: null
        },
        {
            letter: 'M', label: 'Market Direction',
            current: 'Data Unavailable', target: 'General market in confirmed uptrend', pass: null
        }
    ];

    const evaluable = criteria.filter(c => c.pass !== null);
    const passed = evaluable.filter(c => c.pass === true).length;
    const score = evaluable.length ? Math.round((passed / evaluable.length) * 100) : 0;
    const recommendation = evaluable.length < 3 ? 'Insufficient Data' : score > 70 ? 'Strong Setup' : score > 40 ? 'Developing' : 'Avoid';

    return oneilRenderHTML(criteria, score, evaluable.length, recommendation);
};

// Annual EPS growth proxy via net income YoY from the Financials sheet
// (yfinance's ticker.financials is annual by default) — genuinely different
// from earnings_growth (yfinance's own quarterly YoY figure), unlike some
// of the other frameworks that had to reuse one field for two purposes.
function oneilCalcAnnualGrowth(netIncomeSeries) {
    if (!netIncomeSeries || netIncomeSeries.latest === null || netIncomeSeries.prior === null || netIncomeSeries.prior === 0) {
        return null;
    }
    return (netIncomeSeries.latest - netIncomeSeries.prior) / Math.abs(netIncomeSeries.prior);
}

function oneilCalcPctOffHigh(m) {
    const price = parseFloat(m.current_price);
    const high = parseFloat(m['52_week_high']);
    if (!isFinite(price) || !isFinite(high) || high <= 0) return null;
    return ((high - price) / high) * 100;
}

// Compares the most recent third of the 30-day window's average volume
// against the earliest third — a simple trend read, not a formal indicator.
function oneilCalcVolumeTrend(hist) {
    if (!hist || hist.length < 6) return null;
    const volumes = hist.map(r => parseFloat(r.Volume)).filter(isFinite);
    if (volumes.length < 6) return null;
    const third = Math.floor(volumes.length / 3);
    const early = volumes.slice(0, third);
    const recent = volumes.slice(-third);
    const avg = arr => arr.reduce((a, b) => a + b, 0) / arr.length;
    const earlyAvg = avg(early), recentAvg = avg(recent);
    if (earlyAvg <= 0) return null;
    return ((recentAvg - earlyAvg) / earlyAvg) * 100;
}

function oneilCalcMomentum(hist) {
    if (!hist || hist.length < 2) return null;
    const closes = hist.map(r => parseFloat(r.Close)).filter(isFinite);
    if (closes.length < 2) return null;
    const first = closes[0], last = closes[closes.length - 1];
    if (first <= 0) return null;
    return ((last - first) / first) * 100;
}

function oneilRenderHTML(criteria, score, evaluableCount, recommendation) {
    const verdictClass = recommendation === 'Strong Setup' ? 'positive' : recommendation === 'Avoid' ? 'negative' : 'neutral';

    const rows = criteria.map(c => `
        <div class="metric-row">
            <span class="metric-label">${c.letter} — ${c.label}</span>
            <span class="metric-value">${c.current === 'Data Unavailable' ? c.current : (c.current + (c.pass === null ? '' : (c.pass ? ' ✓' : ' ✗')))}</span>
        </div>
    `).join('');

    return `
        <div class="framework-result">
            <h3>William J. O'Neil — CANSLIM</h3>
            <div class="verdict ${verdictClass}">
                <strong>${recommendation}</strong> — Score: ${score}/100 (based on ${evaluableCount}/7 letters — I and M institutional/market data isn't in this pipeline)
            </div>
            <div class="metrics-grid">${rows}</div>
        </div>
    `;
}
