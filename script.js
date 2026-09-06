class StaticStockAnalyzer {
    constructor() {
        this.currentStock = null;
        this.watchlist = JSON.parse(localStorage.getItem('watchlist')) || [];
        this.availableStocks = [];
        this.masterData = null; // now sourced from data/manifest.json, not master_data.csv
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

            this.currentStock = {
                symbol: symbol,
                metrics: metrics,
                historicalData: historicalData,
                balanceSheetLatest: balanceSheetLatest
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
        this.displayCharts(stock.historicalData);

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

        // Create price chart
        const priceCtx = document.getElementById('priceChart').getContext('2d');
        new Chart(priceCtx, {
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
        new Chart(volumeCtx, {
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

    // Pulls the fields Graham's NCAV calc needs out of the Balance_Sheet sheet.
    // yfinance's balance_sheet DataFrame has line-item labels as the index and
    // report dates as columns; after round-tripping through to_dict()/to_excel(),
    // SheetJS gives us rows keyed by the label column (header is blank, so SheetJS
    // names it "__EMPTY") plus one column per date string. Label wording is not
    // perfectly stable across tickers/yfinance versions, hence the alias lists
    // and the 'N/A' fallback rather than throwing.
    extractBalanceSheetLatest(workbook) {
        const rows = this.sheetToRows(workbook, 'Balance_Sheet');
        const result = { currentAssets: 'N/A', currentLiabilities: 'N/A', totalLiabilities: 'N/A' };
        if (!rows.length) return result;

        const labelKey = Object.keys(rows[0]).find(k => k === '' || k.startsWith('__EMPTY')) || Object.keys(rows[0])[0];
        const dateCols = Object.keys(rows[0]).filter(k => k !== labelKey);
        if (!dateCols.length) return result;

        // Pick the most recent report column by parsing each header as a date;
        // yfinance usually orders columns most-recent-first, but don't rely on it.
        const latestCol = dateCols.reduce((latest, col) => {
            const d = new Date(col);
            const bestD = new Date(latest);
            return (!isNaN(d) && (isNaN(bestD) || d > bestD)) ? col : latest;
        }, dateCols[0]);

        const aliases = {
            currentAssets: ['current assets'],
            currentLiabilities: ['current liabilities'],
            totalLiabilities: ['total liabilities net minority interest', 'total liab']
        };

        rows.forEach(row => {
            const label = String(row[labelKey] || '').toLowerCase();
            for (const [field, names] of Object.entries(aliases)) {
                if (names.some(n => label === n || label.includes(n))) {
                    const val = parseFloat(row[latestCol]);
                    if (!isNaN(val)) result[field] = val;
                }
            }
        });

        return result;
    }

    // Framework registry: maps a display name to the global analyze function
    // each frameworks/*.js file attaches to window. Only entries with a
    // non-null fn are wired up and clickable — the rest render as
    // "coming soon" until they're rebuilt one at a time.
    getFrameworkRegistry() {
        return [
            { name: 'Graham', fn: window.analyzeGraham || null },
            { name: 'Buffett', fn: null },
            { name: 'Lynch', fn: null },
            { name: 'Magic Formula', fn: null },
            { name: "Acquirer's Multiple", fn: null },
            { name: 'Piotroski', fn: null },
            { name: "O'Neil CANSLIM", fn: null },
            { name: 'Minervini', fn: null },
            { name: 'Fama-French', fn: null },
            { name: 'Black-Scholes', fn: null }
        ];
    }

    renderFrameworkSelector() {
        const container = document.getElementById('frameworkSelector');
        if (!container) return;

        container.innerHTML = this.getFrameworkRegistry().map(fw => `
            <button
                class="framework-tab ${fw.fn ? '' : 'disabled'}"
                ${fw.fn ? `onclick="analyzer.selectFramework('${fw.name}')"` : 'disabled'}
                title="${fw.fn ? '' : 'Coming soon'}"
            >${fw.name}</button>
        `).join('');
    }

    selectFramework(name) {
        const fw = this.getFrameworkRegistry().find(f => f.name === name);
        const target = document.getElementById('frameworkContent');
        if (!fw || !fw.fn || !this.currentStock) return;

        document.querySelectorAll('.framework-tab').forEach(el => el.classList.remove('active'));
        const btn = Array.from(document.querySelectorAll('.framework-tab')).find(el => el.textContent.trim() === name);
        if (btn) btn.classList.add('active');

        target.innerHTML = fw.fn(this.currentStock);
    }
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
