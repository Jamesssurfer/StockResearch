// Benjamin Graham value analysis.
// Rewritten to consume the actual data shape script.js builds from the
// static workbooks: stock.metrics (flat row from the Metrics sheet) and
// stock.balanceSheetLatest ({ currentAssets, currentLiabilities, totalLiabilities }).
// All calculation + rendering helpers live in this file — nothing here
// depends on functions defined elsewhere, unlike the previous version.
window.analyzeGraham = function(stock) {
    const m = stock.metrics || {};

    const currentPrice = parseFloat(m.current_price);
    const eps = parseFloat(m.eps);
    const bookValuePerShare = parseFloat(m.book_value);
    const sharesOutstanding = parseFloat(m.shares_outstanding);

    const grahamNumber = grahamCalcGrahamNumber(eps, bookValuePerShare);
    const ncav = grahamCalcNCAV(stock.balanceSheetLatest, sharesOutstanding);

    const metrics = {
        'P/E Ratio': isFinite(m.pe_ratio) ? Number(m.pe_ratio).toFixed(2) : (m.pe_ratio || 'N/A'),
        'P/B Ratio': isFinite(m.price_to_book) ? Number(m.price_to_book).toFixed(2) : (m.price_to_book || 'N/A'),
        'Current Ratio': isFinite(m.current_ratio) ? Number(m.current_ratio).toFixed(2) : (m.current_ratio || 'N/A'),
        'Debt to Equity': isFinite(m.debt_to_equity) ? Number(m.debt_to_equity).toFixed(2) : (m.debt_to_equity || 'N/A'),
        'EPS Growth': isFinite(m.earnings_growth) ? `${(m.earnings_growth * 100).toFixed(2)}%` : 'N/A',
        'Dividend Yield': isFinite(m.dividend_yield) ? `${(m.dividend_yield * 100).toFixed(2)}%` : '0%'
    };

    const score = grahamCalcScore(m, grahamNumber, currentPrice, ncav);
    const recommendation = score > 70 ? 'Undervalued' : score > 40 ? 'Fair Value' : 'Overvalued';

    return grahamRenderHTML(metrics, score, recommendation, grahamNumber, currentPrice, ncav);
};

// Graham Number = sqrt(22.5 * EPS * Book Value Per Share) — Graham's ceiling
// for a "safe" price on a defensive stock. Returns null if inputs are missing
// or EPS/book value are negative (formula is undefined there, not zero).
function grahamCalcGrahamNumber(eps, bookValuePerShare) {
    if (!isFinite(eps) || !isFinite(bookValuePerShare) || eps <= 0 || bookValuePerShare <= 0) {
        return null;
    }
    return Math.sqrt(22.5 * eps * bookValuePerShare);
}

// Net Current Asset Value per share = (Current Assets - Total Liabilities) / Shares Outstanding.
// This is Graham's stricter "net-net" test. Needs the Balance_Sheet sheet data,
// which is looked up by extractBalanceSheetLatest() in script.js — if that
// lookup failed to find a row (label wording varies by ticker), this returns null
// rather than a misleading number.
function grahamCalcNCAV(balanceSheetLatest, sharesOutstanding) {
    if (!balanceSheetLatest) return null;
    const { currentAssets, totalLiabilities } = balanceSheetLatest;
    if (!isFinite(currentAssets) || !isFinite(totalLiabilities) || !isFinite(sharesOutstanding) || sharesOutstanding <= 0) {
        return null;
    }
    return (currentAssets - totalLiabilities) / sharesOutstanding;
}

// 0-100 score. Each of the 5 checks below is worth 20 points if it passes
// Graham's classic threshold, 0 if it fails or the data is missing (missing
// data is NOT treated as a pass).
function grahamCalcScore(m, grahamNumber, currentPrice, ncav) {
    let score = 0;

    const pe = parseFloat(m.pe_ratio);
    if (isFinite(pe) && pe > 0 && pe < 15) score += 20;

    const pb = parseFloat(m.price_to_book);
    if (isFinite(pb) && pb > 0 && pb < 1.5) score += 20;

    const currentRatio = parseFloat(m.current_ratio);
    if (isFinite(currentRatio) && currentRatio > 2) score += 20;

    const debtToEquity = parseFloat(m.debt_to_equity);
    // yfinance reports debtToEquity as a percentage-scale number (e.g. 45 = 0.45x), not a fraction.
    if (isFinite(debtToEquity) && debtToEquity < 100) score += 20;

    if (grahamNumber !== null && isFinite(currentPrice) && currentPrice > 0 && currentPrice < grahamNumber) {
        score += 20;
    } else if (ncav !== null && isFinite(currentPrice) && currentPrice < ncav) {
        // Trading below net-net value is Graham's deepest-value signal —
        // award the same 20 points via this path if Graham Number wasn't computable.
        score += 20;
    }

    return score;
}

function grahamRenderHTML(metrics, score, recommendation, grahamNumber, currentPrice, ncav) {
    const verdictClass = recommendation === 'Undervalued' ? 'positive' : recommendation === 'Overvalued' ? 'negative' : 'neutral';

    const metricRows = Object.entries(metrics).map(([label, value]) => `
        <div class="metric-row">
            <span class="metric-label">${label}</span>
            <span class="metric-value">${value}</span>
        </div>
    `).join('');

    const fmtMoney = (v) => (v === null || !isFinite(v)) ? 'N/A (insufficient data)' : `$${v.toFixed(2)}`;

    return `
        <div class="framework-result">
            <h3>Benjamin Graham Value Analysis</h3>
            <div class="verdict ${verdictClass}">
                <strong>${recommendation}</strong> — Score: ${score}/100
            </div>
            <div class="metrics-grid">${metricRows}</div>
            <div class="value-comparison">
                <div class="metric-row"><span class="metric-label">Current Price</span><span class="metric-value">${fmtMoney(currentPrice)}</span></div>
                <div class="metric-row"><span class="metric-label">Graham Number (fair-value ceiling)</span><span class="metric-value">${fmtMoney(grahamNumber)}</span></div>
                <div class="metric-row"><span class="metric-label">Net Current Asset Value / share</span><span class="metric-value">${fmtMoney(ncav)}</span></div>
            </div>
        </div>
    `;
}
