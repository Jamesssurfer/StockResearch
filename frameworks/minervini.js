// Mark Minervini's SEPA analysis. Self-contained, prefixed
// minerviniCalc*/minerviniRender*.
//
// Rebuilt on real 50/150/200-day SMAs now that fetch_stock_data.py pulls a
// full year of history (was 30 days — not enough for a 200-day average at
// all). Each SMA-dependent check individually checks it has enough closes
// before computing anything; a ticker with fewer than 200 days of history
// (e.g. a recent IPO) gets "N/A" on those specific checks rather than a
// crash or a fabricated number, while checks that don't need 200 days
// (Price > 50-day SMA, 52-week high/low position) still evaluate normally.
window.analyzeMinervini = function(stock) {
    const m = stock.metrics || {};
    const mp = stock.multiPeriod || {};
    const hist = stock.historicalData || [];
    const closes = hist.map(r => parseFloat(r.Close)).filter(isFinite);

    const price = parseFloat(m.current_price);
    const sma50 = minerviniSMA(closes, 50);
    const sma150 = minerviniSMA(closes, 150);
    const sma200 = minerviniSMA(closes, 200);
    const sma200MonthAgo = minerviniSMA(closes, 200, 21); // ~1 trading month back

    const pctOffHigh = minerviniCalcPctOffHigh(m);
    const pctAboveLow = minerviniCalcPctAboveLow(m);
    const revenueGrowth = minerviniCalcRevenueGrowth(mp.totalRevenue);
    const momentum = minerviniCalcMomentum(closes.slice(-30)); // last 30 days specifically, same window as before

    // Minervini's 8-point Trend Template, in his own stated order.
    const trendChecks = [
        {
            label: 'Price above 150-day AND 200-day SMA',
            result: (isFinite(price) && sma150 !== null && sma200 !== null) ? (price > sma150 && price > sma200) : null
        },
        {
            label: '150-day SMA above 200-day SMA',
            result: (sma150 !== null && sma200 !== null) ? sma150 > sma200 : null
        },
        {
            label: '200-day SMA trending up (vs. ~1 month ago)',
            result: (sma200 !== null && sma200MonthAgo !== null) ? sma200 > sma200MonthAgo : null
        },
        {
            label: '50-day SMA above both 150-day AND 200-day SMA',
            result: (sma50 !== null && sma150 !== null && sma200 !== null) ? (sma50 > sma150 && sma50 > sma200) : null
        },
        {
            label: 'Price above 50-day SMA',
            result: (isFinite(price) && sma50 !== null) ? price > sma50 : null
        },
        {
            label: 'Price at least 30% above 52-week low',
            result: pctAboveLow !== null ? pctAboveLow >= 30 : null
        },
        {
            label: 'Price within 25% of 52-week high',
            result: pctOffHigh !== null ? pctOffHigh <= 25 : null
        },
        {
            // True RS Rating needs a percentile rank against the whole market —
            // not available here. 30-day momentum direction is a rough proxy,
            // not a substitute, and is labeled as such.
            label: 'RS proxy (30-day momentum) positive',
            result: momentum !== null ? momentum > 0 : null
        }
    ];

    const fundamentalChecks = [
        { label: 'Sales Growth (YoY) > 15%', result: revenueGrowth !== null ? revenueGrowth > 0.15 : null },
        { label: 'Earnings Growth > 15%', result: isFinite(m.earnings_growth) ? m.earnings_growth > 0.15 : null }
    ];

    const allChecks = [...trendChecks, ...fundamentalChecks];
    const evaluable = allChecks.filter(c => c.result !== null);
    const passed = evaluable.filter(c => c.result === true).length;
    const score = evaluable.length ? Math.round((passed / evaluable.length) * 100) : 0;
    const recommendation = evaluable.length < 4 ? 'Insufficient Data' : score > 70 ? 'Strong Trend' : score > 40 ? 'Developing' : 'Avoid';

    const smaMetrics = {
        'Current Price': isFinite(price) ? `$${price.toFixed(2)}` : 'N/A',
        '50-day SMA': sma50 !== null ? `$${sma50.toFixed(2)}` : ('N/A (needs 50 days, have ' + closes.length + ')'),
        '150-day SMA': sma150 !== null ? `$${sma150.toFixed(2)}` : ('N/A (needs 150 days, have ' + closes.length + ')'),
        '200-day SMA': sma200 !== null ? `$${sma200.toFixed(2)}` : ('N/A (needs 200 days, have ' + closes.length + ')'),
        'Sales Growth (YoY)': revenueGrowth !== null ? `${(revenueGrowth * 100).toFixed(1)}%` : 'N/A',
        'Earnings Growth': isFinite(m.earnings_growth) ? `${(m.earnings_growth * 100).toFixed(1)}%` : 'N/A',
        'Market Cap': minerviniFmtMoney(parseFloat(m.market_cap))
    };

    return minerviniRenderHTML(smaMetrics, trendChecks, fundamentalChecks, score, evaluable.length, allChecks.length, recommendation, closes.length);
};

// closes assumed oldest-to-newest (matches yfinance's Price_History row
// order). offset shifts the averaging window back in time — offset=0 is
// "as of today", offset=21 is "as of ~21 trading days ago" — used for the
// "is the 200-day SMA trending up" check, which needs to compare against
// itself a month back, not against a different SMA.
function minerviniSMA(closes, period, offset = 0) {
    const end = closes.length - offset;
    const start = end - period;
    if (start < 0 || end <= 0) return null;
    const slice = closes.slice(start, end);
    if (slice.length < period) return null;
    return slice.reduce((a, b) => a + b, 0) / slice.length;
}

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

function minerviniCalcMomentum(closes) {
    if (!closes || closes.length < 2) return null;
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

function minerviniRenderHTML(smaMetrics, trendChecks, fundamentalChecks, score, evaluableCount, totalChecks, recommendation, daysAvailable) {
    const verdictClass = recommendation === 'Strong Trend' ? 'positive' : recommendation === 'Avoid' ? 'negative' : 'neutral';

    const metricRows = Object.entries(smaMetrics).map(([label, value]) => `
        <div class="metric-row">
            <span class="metric-label">${label}</span>
            <span class="metric-value">${value}</span>
        </div>
    `).join('');

    const checkRow = (c) => {
        const display = c.result === null ? 'N/A' : (c.result ? '✓ Pass' : '✗ Fail');
        return `
            <div class="metric-row">
                <span class="metric-label">${c.label}</span>
                <span class="metric-value">${display}</span>
            </div>
        `;
    };

    return `
        <div class="framework-result">
            <h3>Mark Minervini SEPA Analysis</h3>
            <div class="verdict ${verdictClass}">
                <strong>${recommendation}</strong> — Score: ${score}/100 (${evaluableCount}/${totalChecks} checks had enough data; ${daysAvailable} days of price history available)
            </div>
            <div class="metrics-grid">${metricRows}</div>
            <h4 style="margin:20px 0 10px; font-size:14px;">Trend Template</h4>
            <div class="metrics-grid">${trendChecks.map(checkRow).join('')}</div>
            <h4 style="margin:20px 0 10px; font-size:14px;">Fundamentals</h4>
            <div class="metrics-grid">${fundamentalChecks.map(checkRow).join('')}</div>
        </div>
    `;
}
