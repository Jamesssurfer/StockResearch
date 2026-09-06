class StaticStockAnalyzer {
    constructor() {
        this.currentStock = null;
        this.watchlist = JSON.parse(localStorage.getItem('watchlist')) || [];
        this.availableStocks = [];
        this.masterData = null; // now sourced from data/manifest.json, not master_data.csv
        this.priceChartInstance = null;
        this.volumeChartInstance = null;
        this.init();
    }

    async init() {
        this.setupEventListeners();
        this.renderWatchlist();
        await this.loadManifest();
    }

    setupEventListeners() {
        // No search input anymore — navigation is entirely via the ticker
        // buttons rendered in renderAvailableStocks() / renderWatchlist(),
        // both of which call quickLoad(symbol) directly.
    }

    // Replaces the old loadMasterData() that read data/master_data.csv.
    // A static site can't list a directory over HTTP, so a manifest is the
    // only way to know which symbols exist and to bulk-populate watchlist
    // prices without opening every workbook up front.
    async loadManifest() {
        try {
            const response = await fetch('data/manifest.json');
            if (!response.ok) {
                console.log('No manifest.json found');
                return;
            }

            this.masterData = await response.json();
            this.availableStocks = this.masterData.map(row => row.symbol);
            this.renderAvailableStocks();
            this.updateWatchlistPrices();

        } catch (error) {
            console.log('Error loading manifest:', error);
        }
    }

    // Fetches one symbol's workbook and returns it parsed via SheetJS.
    async fetchWorkbook(symbol) {
        const response = await fetch(`data/${symbol}_data.xlsx`);
        if (!response.ok) {
            throw new Error(`No data found for ${symbol}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        return XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
    }

    // Reads one sheet out of a parsed workbook as an array of row objects.
    // Returns [] if the sheet doesn't exist (e.g. a symbol with no earnings data).
    sheetToRows(workbook, sheetName) {
        const sheet = workbook.Sheets[sheetName];
        if (!sheet) return [];
        return XLSX.utils.sheet_to_json(sheet, { defval: '' });
    }

    async loadStaticData(symbol) {
        symbol = (symbol || '').trim().toUpperCase();
        if (!symbol) {
            console.warn('loadStaticData called without a symbol');
            return;
        }

        try {
            const workbook = await this.fetchWorkbook(symbol);

            const metricsRows = this.sheetToRows(workbook, 'Metrics');
            if (!metricsRows.length) {
                throw new Error(`No metrics found for ${symbol}`);
            }
            const metrics = metricsRows[0];

            const historicalData = this.sheetToRows(workbook, 'Price_History');
            if (!historicalData.length) {
                throw new Error(`No historical data found for ${symbol}`);
            }

            const balanceSheetLatest = this.extractBalanceSheetLatest(workbook);
            const multiPeriod = this.buildMultiPeriod(workbook);

            this.currentStock = {
                symbol: symbol,
                metrics: metrics,
                historicalData: historicalData,
                balanceSheetLatest: balanceSheetLatest,
                multiPeriod: multiPeriod
            };

            this.displayStockData();
            this.renderFrameworkSelector();
            if (window.analyzeGraham) this.selectFramework('Graham');

        } catch (error) {
            console.error('Error loading data:', error);
            alert(`Unable to load data for ${symbol}. Make sure ${symbol}_data.xlsx exists in data/.`);
        }
    }

    displayStockData() {
        const overview = document.getElementById('stockOverview');
        overview.classList.remove('hidden');

        const stock = this.currentStock;
        const metrics = stock.metrics;

        // Display OHLC and price data
        document.getElementById('stockName').textContent = metrics.symbol;
        document.getElementById('stockSymbol').textContent = metrics.symbol;
        document.getElementById('currentPrice').textContent = `$${parseFloat(metrics.current_price).toFixed(2)}`;

        const change = parseFloat(metrics.current_price) - parseFloat(metrics.previous_close);
        const changePercent = (change / parseFloat(metrics.previous_close)) * 100;

        document.getElementById('priceChange').textContent =
            `${change >= 0 ? '+' : ''}${change.toFixed(2)} (${changePercent.toFixed(2)}%)`;
        document.getElementById('priceChange').className =
            `price-change ${change >= 0 ? 'positive' : 'negative'}`;

        // Display OHLC
        document.getElementById('openPrice').textContent = `$${parseFloat(metrics.open).toFixed(2)}`;
        document.getElementById('highPrice').textContent = `$${parseFloat(metrics.day_high).toFixed(2)}`;
        document.getElementById('lowPrice').textContent = `$${parseFloat(metrics.day_low).toFixed(2)}`;
        document.getElementById('prevClosePrice').textContent = `$${parseFloat(metrics.previous_close).toFixed(2)}`;
        document.getElementById('volumeData').textContent = this.formatVolume(metrics.volume);

        // Display quick stats
        this.displayQuickStats(metrics);

        // Display charts
        // Chart display stays windowed to the last 30 days even though
        // stock.historicalData now holds a full year — that full year is
        // needed by Minervini's SMA calculations, but a 1-year line chart
        // isn't what "30-day price history" originally meant on this page.
        this.displayCharts(stock.historicalData.slice(-30));

        // Framework content is populated by renderFrameworkSelector()/selectFramework()
        // right after this call returns. This is just the pre-selection placeholder.
        document.getElementById('frameworkContent').innerHTML = `
            <div class="verdict neutral">
                <strong>📊 Data loaded — pick a framework above</strong>
                <p>Last updated: ${metrics.last_updated || 'N/A'}</p>
            </div>
        `;
    }

    displayQuickStats(metrics) {
        const quickStats = document.getElementById('quickStats');
        quickStats.innerHTML = `
            <div class="stat-card">
                <div class="stat-label">Market Cap</div>
                <div class="stat-value">${this.formatMarketCap(metrics.market_cap)}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">P/E Ratio</div>
                <div class="stat-value">${metrics.pe_ratio || 'N/A'}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">EPS</div>
                <div class="stat-value">${metrics.eps || 'N/A'}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">52W High</div>
                <div class="stat-value">${metrics['52_week_high'] || 'N/A'}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">52W Low</div>
                <div class="stat-value">${metrics['52_week_low'] || 'N/A'}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Beta</div>
                <div class="stat-value">${metrics.beta || 'N/A'}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Dividend Yield</div>
                <div class="stat-value">${this.formatPercentFromFraction(metrics.dividend_yield)}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Profit Margin</div>
                <div class="stat-value">${metrics.profit_margin || 'N/A'}</div>
            </div>
        `;
    }

    displayCharts(historicalData) {
        // Prepare data for charts. Date comes back as a JS Date object (cellDates: true)
        // when the source cell was a real Excel date, or a string/number otherwise.
        const labels = historicalData.map(row => {
            const dateVal = row.Date instanceof Date ? row.Date : new Date(row.Date);
            return dateVal.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        });

        const prices = historicalData.map(row => parseFloat(row.Close));
        const volumes = historicalData.map(row => parseFloat(row.Volume));

        // Destroy previous chart instances before recreating — Chart.js throws
        // "Canvas is already in use" if you call new Chart() on a canvas that
        // still has a live chart attached, which is exactly what happened every
        // time a second ticker was loaded: this threw, got caught by the
        // generic try/catch in loadStaticData(), and silently aborted everything
        // after it (frameworkSelector/Graham never re-ran).
        if (this.priceChartInstance) this.priceChartInstance.destroy();
        if (this.volumeChartInstance) this.volumeChartInstance.destroy();

        // Create price chart
        const priceCtx = document.getElementById('priceChart').getContext('2d');
        this.priceChartInstance = new Chart(priceCtx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Close Price',
                    data: prices,
                    borderColor: '#2563eb',
                    backgroundColor: 'rgba(37, 99, 235, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } }
            }
        });

        // Create volume chart
        const volumeCtx = document.getElementById('volumeChart').getContext('2d');
        this.volumeChartInstance = new Chart(volumeCtx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Volume',
                    data: volumes,
                    backgroundColor: 'rgba(37, 99, 235, 0.7)'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } }
            }
        });
    }

    renderAvailableStocks() {
        const container = document.getElementById('availableStocks');
        if (!container) return;

        container.innerHTML = this.availableStocks.map(symbol => `
            <button id="chip-${symbol}" class="stock-chip" onclick="analyzer.quickLoad('${symbol}')">
                ${symbol}
            </button>
        `).join('');
    }

    // Generic reader for one workbook sheet's { rows, labelKey, cols } where
    // cols are the report-date column headers sorted most-recent-first.
    // Shared by extractBalanceSheetLatest() logic and buildMultiPeriod() below.
    getSheetPeriods(workbook, sheetName) {
        const rows = this.sheetToRows(workbook, sheetName);
        if (!rows.length) return { rows: [], labelKey: null, cols: [] };
        const labelKey = Object.keys(rows[0]).find(k => k === '' || k.startsWith('__EMPTY')) || Object.keys(rows[0])[0];
        const dateCols = Object.keys(rows[0]).filter(k => k !== labelKey);
        const cols = dateCols.slice().sort((a, b) => {
            const da = new Date(a), db = new Date(b);
            if (isNaN(da) || isNaN(db)) return 0;
            return db - da; // most recent first
        });
        return { rows, labelKey, cols };
    }

    findRowValue(rows, labelKey, col, aliases) {
        // Two-pass: an exact label match anywhere in the sheet wins over a
        // substring match, even one that appears earlier in the sheet.
        // yfinance's income statement has multiple rows containing "net
        // income" (Net Income, Net Income Common Stockholders, Net Income
        // Continuous Operations, Net Income Including Noncontrolling
        // Interests...) — picking whichever comes first in sheet order was
        // silently grabbing the wrong line for some tickers.
        for (const row of rows) {
            const label = String(row[labelKey] || '').toLowerCase();
            if (aliases.includes(label)) {
                const v = parseFloat(row[col]);
                if (!isNaN(v)) return v;
            }
        }
        for (const row of rows) {
            const label = String(row[labelKey] || '').toLowerCase();
            if (aliases.some(a => label.includes(a))) {
                const v = parseFloat(row[col]);
                if (!isNaN(v)) return v;
            }
        }
        return null;
    }

    // Pulls { latest, prior } for every line item Piotroski's F-Score needs,
    // from Balance_Sheet, Cash_Flow, and Financials (all annual periods —
    // yfinance's ticker.financials defaults to annual, not quarterly, which
    // your fetcher uses as-is). 'prior' is null if the workbook only has one
    // period saved — piotroski.js treats any check needing 'prior' as
    // not-evaluable rather than guessing, when that happens.
    buildMultiPeriod(workbook) {
        const bs = this.getSheetPeriods(workbook, 'Balance_Sheet');
        const cf = this.getSheetPeriods(workbook, 'Cash_Flow');
        const fin = this.getSheetPeriods(workbook, 'Financials');

        const twoCol = (sheet, aliases) => {
            if (!sheet.cols.length) return { latest: null, prior: null };
            return {
                latest: this.findRowValue(sheet.rows, sheet.labelKey, sheet.cols[0], aliases),
                prior: sheet.cols[1] ? this.findRowValue(sheet.rows, sheet.labelKey, sheet.cols[1], aliases) : null
            };
        };

        return {
            netIncome: twoCol(fin, ['net income']),
            operatingCashFlow: twoCol(cf, ['operating cash flow', 'cash flow from continuing operating activities', 'total cash from operating activities']),
            totalAssets: twoCol(bs, ['total assets']),
            totalDebt: twoCol(bs, ['total debt']),
            currentAssets: twoCol(bs, ['current assets']),
            currentLiabilities: twoCol(bs, ['current liabilities']),
            sharesOutstanding: twoCol(bs, ['ordinary shares number', 'share issued']),
            grossProfit: twoCol(fin, ['gross profit']),
            totalRevenue: twoCol(fin, ['total revenue'])
        };
    }

    // Pulls the fields Graham's NCAV calc needs out of the Balance_Sheet sheet.
    // yfinance's balance_sheet DataFrame has line-item labels as the index and
    // report dates as columns; after round-tripping through to_dict()/to_excel(),
    // SheetJS gives us rows keyed by the label column (header is blank, so SheetJS
    // names it "__EMPTY") plus one column per date string. Label wording is not
    // perfectly stable across tickers/yfinance versions, hence the alias lists
    // and the 'N/A' fallback rather than throwing.
    extractBalanceSheetLatest(workbook) {
        const sheet = this.getSheetPeriods(workbook, 'Balance_Sheet');
        const result = { currentAssets: 'N/A', currentLiabilities: 'N/A', totalLiabilities: 'N/A', netFixedAssets: 'N/A' };
        if (!sheet.cols.length) return result;

        const latestCol = sheet.cols[0]; // getSheetPeriods already sorts most-recent-first
        const aliasMap = {
            currentAssets: ['current assets'],
            currentLiabilities: ['current liabilities'],
            totalLiabilities: ['total liabilities net minority interest', 'total liab'],
            netFixedAssets: ['net ppe']
        };

        for (const [field, aliases] of Object.entries(aliasMap)) {
            const v = this.findRowValue(sheet.rows, sheet.labelKey, latestCol, aliases);
            if (v !== null) result[field] = v;
        }

        return result;
    }

    // Framework registry: maps a display name to the global analyze function
    // each frameworks/*.js file attaches to window. Only entries with a
    // non-null fn are wired up and clickable — the rest render as
    // "coming soon" until they're rebuilt one at a time.
    getFrameworkRegistry() {
        return [
            { name: 'Graham', fn: window.analyzeGraham || null },
            { name: 'Buffett', fn: window.analyzeBuffett || null },
            { name: 'Lynch', fn: window.analyzeLynch || null },
            { name: 'Magic Formula', fn: window.analyzeMagicFormula || null },
            { name: "Acquirer's Multiple", fn: window.analyzeAcquirerMultiple || null },
            { name: 'Piotroski', fn: window.analyzePiotroski || null },
            { name: "O'Neil CANSLIM", fn: window.analyzeOneil || null },
            { name: 'Minervini', fn: window.analyzeMinervini || null },
            { name: 'Fama-French', fn: window.analyzeFamaFrench || null },
            { name: 'Black-Scholes', fn: window.analyzeBlackScholes || null }
        ];
    }

    renderFrameworkSelector() {
        const container = document.getElementById('frameworkSelector');
        if (!container) return;

        // Built via data-framework + addEventListener rather than an inline
        // onclick="...('${fw.name}')" string — a name containing an
        // apostrophe (e.g. "Acquirer's Multiple") breaks a single-quoted JS
        // string literal built that way, which is exactly why that button
        // silently did nothing when clicked.
        container.innerHTML = this.getFrameworkRegistry().map(fw => `
            <button
                class="framework-tab ${fw.fn ? '' : 'disabled'}"
                data-framework="${fw.name}"
                ${fw.fn ? '' : 'disabled'}
                title="${fw.fn ? '' : 'Coming soon'}"
            >${fw.name}</button>
        `).join('');

        container.querySelectorAll('.framework-tab').forEach(btn => {
            if (btn.disabled) return;
            btn.addEventListener('click', () => this.selectFramework(btn.dataset.framework));
        });
    }

    selectFramework(name) {
        const fw = this.getFrameworkRegistry().find(f => f.name === name);
        const target = document.getElementById('frameworkContent');
        if (!fw || !fw.fn || !this.currentStock) return;

        document.querySelectorAll('.framework-tab').forEach(el => el.classList.remove('active'));
        const btn = Array.from(document.querySelectorAll('.framework-tab')).find(el => el.dataset.framework === name);
        if (btn) btn.classList.add('active');

        target.innerHTML = fw.fn(this.currentStock);
    }
    quickLoad(symbol) {
        this.loadStaticData(symbol);
        document.querySelectorAll('.stock-chip.active').forEach(el => el.classList.remove('active'));
        const chip = document.getElementById(`chip-${symbol}`);
        if (chip) chip.classList.add('active');
    }

    renderWatchlist() {
        const container = document.getElementById('watchlistItems');
        const count = document.getElementById('watchlistCount');

        count.textContent = this.watchlist.length;

        if (this.watchlist.length === 0) {
            container.innerHTML = '<p class="empty-watchlist">No stocks in watchlist</p>';
            return;
        }

        container.innerHTML = this.watchlist.map(symbol => `
            <div class="watchlist-item" onclick="analyzer.quickLoad('${symbol}')">
                <span class="symbol">${symbol}</span>
                <span class="price" id="watch-${symbol}">---</span>
            </div>
        `).join('');

        this.updateWatchlistPrices();
    }

    updateWatchlistPrices() {
        if (!this.masterData) return;

        this.watchlist.forEach(symbol => {
            const data = this.masterData.find(row => row.symbol === symbol);
            if (data) {
                const priceElement = document.getElementById(`watch-${symbol}`);
                if (priceElement) {
                    priceElement.textContent = `$${parseFloat(data.current_price).toFixed(2)}`;
                }
            }
        });
    }

    formatMarketCap(value) {
        if (!value || value === 'N/A') return 'N/A';
        const num = parseFloat(value);
        if (isNaN(num)) return 'N/A';
        if (num >= 1e12) return `$${(num / 1e12).toFixed(2)}T`;
        if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
        if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
        return `$${num.toFixed(2)}`;
    }

    formatVolume(value) {
        if (!value || value === 'N/A') return 'N/A';
        const num = parseFloat(value);
        if (isNaN(num)) return 'N/A';
        if (num >= 1e9) return `${(num / 1e9).toFixed(2)}B`;
        if (num >= 1e6) return `${(num / 1e6).toFixed(2)}M`;
        if (num >= 1e3) return `${(num / 1e3).toFixed(2)}K`;
        return num.toString();
    }

    formatPercentFromFraction(value) {
        const num = parseFloat(value);
        if (isNaN(num)) return 'N/A';
        return `${(num * 100).toFixed(2)}%`;
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    window.analyzer = new StaticStockAnalyzer();
});
