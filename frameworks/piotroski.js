// Piotroski F-Score: 9 binary checks across profitability, leverage, and
// efficiency, each worth 1 point. Self-contained, prefixed
// piotroskiCalc*/piotroskiRender* per the shared-global-scope convention.
//
// Every check here needs a year-over-year comparison — something none of
// the previous frameworks required. stock.multiPeriod (built by
// buildMultiPeriod() in script.js) supplies { latest, prior } for each line
// item, pulled from Balance_Sheet/Cash_Flow/Financials. If a workbook only
// has one saved period, 'prior' comes back null and the check is marked
// "N/A" rather than silently scored as a fail — a real 0 and a missing
// prior-year number are not the same thing, and shouldn't be conflated.
window.analyzePiotroski = function(stock) {
    const m = stock.metrics || {};
    const mp = stock.multiPeriod || {};

    const checks = piotroskiRunChecks(m, mp);
    const evaluable = checks.filter(c => c.result !== null);
    const passed = evaluable.filter(c => c.result === true).length;

    const fScore = passed; // out of however many were evaluable, out of 9 max
    const recommendation = evaluable.length < 5 ? 'Insufficient Data'
        : fScore >= 7 ? 'Strong' : fScore >= 4 ? 'Moderate' : 'Weak';

    return piotroskiRenderHTML(checks, fScore, evaluable.length, recommendation);
};

function piotroskiRunChecks(m, mp) {
    const checks = [];

    // --- Profitability ---
    checks.push(piotroskiCheck('Positive Net Income', mp.netIncome?.latest, v => v > 0));

    checks.push(piotroskiCheck('Positive Operating Cash Flow', mp.operatingCashFlow?.latest, v => v > 0));

    checks.push(piotroskiCheckPair('Increasing ROA', mp.netIncome, mp.totalAssets, (ni, ta) => {
        if (!ta.latest || !ta.prior) return null;
        const roaLatest = ni.latest / ta.latest;
        const roaPrior = ni.prior / ta.prior;
        return roaLatest > roaPrior;
    }));

    checks.push(piotroskiCheckPair('Operating Cash Flow > Net Income', mp.operatingCashFlow, mp.netIncome, (ocf, ni) => {
        if (ocf.latest === null || ni.latest === null) return null;
        return ocf.latest > ni.latest;
    }, true)); // only needs .latest from both, not .prior — see helper below

    // --- Leverage ---
    checks.push(piotroskiCheckSimplePair('Decreasing Debt', mp.totalDebt, (latest, prior) => latest < prior));

    checks.push(piotroskiCheckPair('Increasing Current Ratio', mp.currentAssets, mp.currentLiabilities, (ca, cl) => {
        if (!ca.latest || !cl.latest || !ca.prior || !cl.prior) return null;
        return (ca.latest / cl.latest) > (ca.prior / cl.prior);
    }));

    checks.push(piotroskiCheckSimplePair('No New Shares Issued', mp.sharesOutstanding, (latest, prior) => latest <= prior));

    // --- Efficiency ---
    checks.push(piotroskiCheckPair('Increasing Gross Margin', mp.grossProfit, mp.totalRevenue, (gp, rev) => {
        if (!gp.latest || !rev.latest || !gp.prior || !rev.prior) return null;
        return (gp.latest / rev.latest) > (gp.prior / rev.prior);
    }));

    checks.push(piotroskiCheckPair('Increasing Asset Turnover', mp.totalRevenue, mp.totalAssets, (rev, ta) => {
        if (!rev.latest || !ta.latest || !rev.prior || !ta.prior) return null;
        return (rev.latest / ta.latest) > (rev.prior / ta.prior);
    }));

    return checks;
}

// Single-value check (no prior-period comparison needed).
function piotroskiCheck(label, value, predicate) {
    if (value === null || value === undefined || !isFinite(value)) {
        return { label, result: null };
    }
    return { label, result: predicate(value) };
}

// Two related { latest, prior } series compared via a custom function that
// itself decides whether it has enough to answer (returns true/false/null).
function piotroskiCheckPair(label, seriesA, seriesB, compareFn, latestOnly) {
    if (!seriesA || !seriesB) return { label, result: null };
    const result = compareFn(seriesA, seriesB);
    return { label, result };
}

// A single { latest, prior } series compared directly (both values needed).
function piotroskiCheckSimplePair(label, series, compareFn) {
    if (!series || series.latest === null || series.prior === null) {
        return { label, result: null };
    }
    return { label, result: compareFn(series.latest, series.prior) };
}

function piotroskiRenderHTML(checks, fScore, evaluableCount, recommendation) {
    const verdictClass = recommendation === 'Strong' ? 'positive' : recommendation === 'Weak' ? 'negative' : 'neutral';

    const rows = checks.map(c => {
        const display = c.result === null ? 'N/A' : (c.result ? '✓ Pass' : '✗ Fail');
        return `
            <div class="metric-row">
                <span class="metric-label">${c.label}</span>
                <span class="metric-value">${display}</span>
            </div>
        `;
    }).join('');

    return `
        <div class="framework-result">
            <h3>Piotroski F-Score</h3>
            <div class="verdict ${verdictClass}">
                <strong>${recommendation}</strong> — F-Score: ${fScore}/9 (${evaluableCount}/9 criteria had enough data to evaluate)
            </div>
            <div class="metrics-grid">${rows}</div>
        </div>
    `;
}
