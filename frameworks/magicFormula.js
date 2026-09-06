// Joel Greenblatt's Magic Formula: rank on Earnings Yield + Return on Capital.
// Self-contained, same pattern as graham.js/buffett.js/lynch.js — prefixed
// magicCalc*/magicRender* since all framework files share global scope.
//
// Neither Earnings Yield nor Return on Capital can be computed from the
// original flat Metrics sheet alone — both need EBIT and Enterprise Value,
// which weren't captured anywhere. Fixed at the source: fetch_stock_data.py
// now saves total_revenue/enterprise_value/ebitda, and script.js's balance
// sheet extraction now also pulls Net PPE (net fixed assets).
window.analyzeMagicFormula = function(stock) {
    const m = stock.metrics || {};
    const bs = stock.balanceSheetLatest || {};

    const ebit = magicCalcEBIT(m);
    const earningsYield = magicCalcEarningsYield(ebit, m);
    const returnOnCapital = magicCalcROC(ebit, bs);

    const metrics = {
        'Earnings Yield': earningsYield !== null ? `${(earningsYield * 100).toFixed(2)}%` : 'N/A',
        'Return on Capital': returnOnCapital !== null ? `${(returnOnCapital * 100).toFixed(2)}%` : 'N/A',
        'EBIT (approx., Revenue x Op. Margin)': ebit !== null ? magicFmtMoney(ebit) : 'N/A',
        'Enterprise Value': isFinite(m.enterprise_value) ? magicFmtMoney(m.enterprise_value) : 'N/A',
        'P/E Ratio': isFinite(m.pe_ratio) ? Number(m.pe_ratio).toFixed(2) : (m.pe_ratio || 'N/A')
    };

    const score = magicCalcScore(earningsYield, returnOnCapital);
    const recommendation = score > 70 ? 'High Quality' : score > 40 ? 'Average' : 'Low Quality';

    return magicRenderHTML(metrics, score, recommendation);
};

// EBIT isn't directly available anywhere in the data pipeline (that needs
// the income statement's D&A line, which the flat Metrics sheet doesn't
// carry). Approximated as Revenue x Operating Margin — standard shorthand,
// but an approximation, not the audited figure. Flagged in the metric label
// above rather than presented as exact.
function magicCalcEBIT(m) {
    const revenue = parseFloat(m.total_revenue);
    const opMargin = parseFloat(m.operating_margin);
    if (!isFinite(revenue) || !isFinite(opMargin)) return null;
    return revenue * opMargin;
}

function magicCalcEarningsYield(ebit, m) {
    const ev = parseFloat(m.enterprise_value);
    if (ebit === null || !isFinite(ev) || ev <= 0) return null;
    return ebit / ev;
}

// Return on Capital = EBIT / (Net Working Capital + Net Fixed Assets).
// Greenblatt's own NWC excludes excess cash and non-interest-bearing current
// liabilities; this uses the simpler Current Assets - Current Liabilities,
// which is close enough for a screening score but will run a bit low for
// cash-heavy balance sheets (e.g. AAPL/MSFT).
function magicCalcROC(ebit, bs) {
    const currentAssets = parseFloat(bs.currentAssets);
    const currentLiabilities = parseFloat(bs.currentLiabilities);
    const netFixedAssets = parseFloat(bs.netFixedAssets);
    if (ebit === null || !isFinite(currentAssets) || !isFinite(currentLiabilities) || !isFinite(netFixedAssets)) {
        return null;
    }
    const investedCapital = (currentAssets - currentLiabilities) + netFixedAssets;
    if (investedCapital <= 0) return null;
    return ebit / investedCapital;
}

// 0-100 score, 50/50 split between the two Magic Formula legs. Thresholds
// are the commonly-cited Greenblatt screening cutoffs, not statistically
// derived from your dataset.
function magicCalcScore(earningsYield, returnOnCapital) {
    let score = 0;
    if (earningsYield !== null) {
        if (earningsYield > 0.10) score += 50;
        else if (earningsYield > 0.05) score += 25;
    }
    if (returnOnCapital !== null) {
        if (returnOnCapital > 0.25) score += 50;
        else if (returnOnCapital > 0.10) score += 25;
    }
    return score;
}

function magicFmtMoney(v) {
    const abs = Math.abs(v);
    if (abs >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
    if (abs >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
    if (abs >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
    return `$${v.toFixed(2)}`;
}

function magicRenderHTML(metrics, score, recommendation) {
    const verdictClass = recommendation === 'High Quality' ? 'positive' : recommendation === 'Low Quality' ? 'negative' : 'neutral';

    const metricRows = Object.entries(metrics).map(([label, value]) => `
        <div class="metric-row">
            <span class="metric-label">${label}</span>
            <span class="metric-value">${value}</span>
        </div>
    `).join('');

    return `
        <div class="framework-result">
            <h3>Joel Greenblatt Magic Formula</h3>
            <div class="verdict ${verdictClass}">
                <strong>${recommendation}</strong> — Score: ${score}/100
            </div>
            <div class="metrics-grid">${metricRows}</div>
        </div>
    `;
}
