// Tobias Carlisle's Acquirer's Multiple = Enterprise Value / Operating
// Earnings (EBIT). Self-contained, prefixed acqCalc*/acqRender* — shares
// global scope with the other framework files.
window.analyzeAcquirerMultiple = function(stock) {
    const m = stock.metrics || {};

    const ebit = acqCalcEBIT(m);
    const acquirersMultiple = acqCalcMultiple(m, ebit);

    const metrics = {
        "Acquirer's Multiple": acquirersMultiple !== null ? acquirersMultiple.toFixed(2) : 'N/A',
        'Enterprise Value': isFinite(m.enterprise_value) ? acqFmtMoney(m.enterprise_value) : 'N/A',
        'EBITDA': isFinite(m.ebitda) ? acqFmtMoney(m.ebitda) : 'N/A',
        'Operating Income (approx.)': ebit !== null ? acqFmtMoney(ebit) : 'N/A',
        'P/E Ratio': isFinite(m.pe_ratio) ? Number(m.pe_ratio).toFixed(2) : (m.pe_ratio || 'N/A'),
        'P/B Ratio': isFinite(m.price_to_book) ? Number(m.price_to_book).toFixed(2) : (m.price_to_book || 'N/A')
    };

    const score = acqCalcScore(acquirersMultiple);
    const recommendation = acquirersMultiple === null ? 'Insufficient Data'
        : acquirersMultiple < 10 ? 'Deep Value'
        : acquirersMultiple < 15 ? 'Value'
        : 'Expensive';

    return acqRenderHTML(metrics, score, recommendation);
};

// Same EBIT approximation as magicFormula.js (Revenue x Operating Margin) —
// duplicated rather than shared, on purpose: these files are meant to be
// standalone drop-ins, and a shared helper module wasn't part of what
// you asked to rebuild.
function acqCalcEBIT(m) {
    const revenue = parseFloat(m.total_revenue);
    const opMargin = parseFloat(m.operating_margin);
    if (!isFinite(revenue) || !isFinite(opMargin)) return null;
    return revenue * opMargin;
}

function acqCalcMultiple(m, ebit) {
    const ev = parseFloat(m.enterprise_value);
    if (ebit === null || ebit <= 0 || !isFinite(ev)) return null;
    return ev / ebit;
}

// Carlisle's own bands: <10 deep value, 10-15 reasonable, >15 expensive.
// Scored on a sliding scale rather than the original file's flat brackets,
// so e.g. a multiple of 8 scores higher than one of 9.9.
function acqCalcScore(multiple) {
    if (multiple === null) return 0;
    if (multiple <= 0) return 0; // negative EBIT — multiple is meaningless, not "cheap"
    if (multiple < 10) return Math.round(100 - (multiple / 10) * 30); // 70-100
    if (multiple < 15) return Math.round(70 - ((multiple - 10) / 5) * 30); // 40-70
    return Math.max(0, Math.round(40 - (multiple - 15))); // tapers to 0
}

function acqFmtMoney(v) {
    const abs = Math.abs(v);
    if (abs >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
    if (abs >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
    if (abs >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
    return `$${v.toFixed(2)}`;
}

function acqRenderHTML(metrics, score, recommendation) {
    const verdictClass = recommendation === 'Deep Value' ? 'positive' : recommendation === 'Expensive' ? 'negative' : 'neutral';

    const metricRows = Object.entries(metrics).map(([label, value]) => `
        <div class="metric-row">
            <span class="metric-label">${label}</span>
            <span class="metric-value">${value}</span>
        </div>
    `).join('');

    return `
        <div class="framework-result">
            <h3>Acquirer's Multiple Analysis</h3>
            <div class="verdict ${verdictClass}">
                <strong>${recommendation}</strong> — Score: ${score}/100
            </div>
            <div class="metrics-grid">${metricRows}</div>
        </div>
    `;
}
