// Main Application State
class StockAnalyzer {
    constructor() {
        this.currentStock = null;
        this.watchlist = JSON.parse(localStorage.getItem('watchlist')) || [];
        this.currentFramework = 'overview';
        this.priceChart = null;
        this.volumeChart = null;
        this.historicalData = null;
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.renderWatchlist();
    }

    setupEventListeners() {
        // Search button click
        const searchBtn = document.querySelector('.search-btn');
        if (searchBtn) {
            searchBtn.addEventListener('click', () => {
                console.log('Search button clicked');
                this.searchStock();
            });
        }

        // Search input - Enter key
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    console.log('Enter key pressed');
                    this.searchStock();
                }
            });
        }

        // Framework tabs
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.switchFramework(e.target.dataset.framework);
            });
        });
    }

    async searchStock() {
        const searchInput = document.getElementById('searchInput');
        const query = searchInput.value.trim().toUpperCase();
        
        console.log('Searching for:', query);
        
        if (!query) {
            this.showError('Please enter a stock ticker symbol');
            return;
        }

        // Show loading state
        this.showLoading();

        try {
            const stockData = await this.fetchStockData(query);
            console.log('Stock data fetched:', stockData);
            
            this.currentStock = stockData;
            await this.displayStockOverview(stockData);
            this.switchFramework('overview');
            this.updateWatchlistButton();
            
            // Hide loading
            this.hideLoading();
        } catch (error) {
            console.error('Error fetching stock data:', error);
            this.hideLoading();
            this.showError(`Unable to find stock "${query}". Please check the ticker symbol and try again.`);
        }
    }

    async fetchStockData(symbol) {
        try {
            // Try primary API first
            return await this.fetchFromYahoo(symbol);
        } catch (error) {
            console.error('Yahoo API failed, trying alternative...', error);
            // Try alternative API
            return await this.fetchFromAlternative(symbol);
        }
    }

    async fetchFromYahoo(symbol) {
        const endpoints = [
            // Chart data (30 days)
            `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=1mo&interval=1d`,
            // Quote summary
            `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${symbol}?modules=summaryDetail,defaultKeyStatistics,financialData,price,assetProfile`
        ];

        const responses = await Promise.all(
            endpoints.map(url => 
                fetch(url, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                        'Accept': 'application/json',
                    }
                }).then(response => {
                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }
                    return response.json();
                })
            )
        );

        const [chartData, quoteData] = responses;

        // Validate data
        if (!chartData.chart?.result?.[0]) {
            throw new Error('No chart data available');
        }

        return {
            symbol: symbol,
            chart: chartData.chart.result[0],
            quote: chartData.chart.result[0],
            stats: quoteData.quoteSummary?.result?.[0] || {},
            historicalData: chartData.chart.result[0]
        };
    }

    async fetchFromAlternative(symbol) {
        // Try with query2 endpoint
        const chartUrl = `https://query2.finance.yahoo.com/v8/finance/chart/${symbol}?range=1mo&interval=1d`;
        
        try {
            const response = await fetch(chartUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Accept': 'application/json',
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const chartData = await response.json();
            
            if (!chartData.chart?.result?.[0]) {
                throw new Error('No data available');
            }

            // Basic stats from chart data only
            return {
                symbol: symbol,
                chart: chartData.chart.result[0],
                quote: chartData.chart.result[0],
                stats: this.createBasicStats(chartData.chart.result[0], symbol),
                historicalData: chartData.chart.result[0]
            };
        } catch (error) {
            console.error('Alternative API also failed:', error);
            throw new Error('Unable to fetch stock data from any source');
        }
    }

    createBasicStats(chartData, symbol) {
        // Create basic stats from chart data when quote summary is unavailable
        const meta = chartData.meta || {};
        const indicators = chartData.indicators?.quote?.[0] || {};
        
        const prices = indicators.close?.filter(p => p !== null) || [];
        const volumes = indicators.volume?.filter(v => v !== null) || [];
        
        const avgVolume = volumes.length > 0 ? 
            volumes.reduce((a, b) => a + b, 0) / volumes.length : 0;
        
        const high52 = prices.length > 0 ? Math.max(...prices) : meta.regularMarketPrice;
        const low52 = prices.length > 0 ? Math.min(...prices) : meta.regularMarketPrice;

        return {
            price: {
                longName: symbol,
                exchangeName: meta.exchangeName || meta.fullExchangeName || '',
                marketCap: { raw: 0, fmt: 'N/A' },
                volume: { raw: avgVolume, fmt: this.formatVolume(avgVolume) }
            },
            summaryDetail: {
                fiftyTwoWeekHigh: { raw: high52, fmt: `$${high52.toFixed(2)}` },
                fiftyTwoWeekLow: { raw: low52, fmt: `$${low52.toFixed(2)}` },
                trailingPE: { raw: null, fmt: 'N/A' },
                dividendYield: { raw: null, fmt: 'N/A' }
            },
            defaultKeyStatistics: {
                trailingEps: { raw: null, fmt: 'N/A' },
                beta: { raw: null, fmt: 'N/A' }
            },
            financialData: {
                profitMargins: { raw: null, fmt: 'N/A' }
            },
            assetProfile: {
                sector: 'N/A',
                industry: 'N/A',
                longBusinessSummary: 'Detailed company information not available. Basic price data shown.'
            }
        };
    }

    async displayStockOverview(stockData) {
        const overview = document.getElementById('stockOverview');
        const watchlistAction = document.getElementById('watchlistAction');
        
        overview.classList.remove('hidden');
        watchlistAction.classList.remove('hidden');
        
        // Update stock header
        const stockName = stockData.stats?.price?.longName || stockData.symbol;
        document.getElementById('stockName').textContent = stockName;
        document.getElementById('stockSymbol').textContent = stockData.symbol;
        document.getElementById('stockExchange').textContent = stockData.stats?.price?.exchangeName || '';
        
        // Display OHLC data
        this.displayOHLCData(stockData);
        
        // Display quick stats
        this.displayQuickStats(stockData);
        
        // Display charts
        this.displayCharts(stockData);
    }

    displayOHLCData(stockData) {
        const chartData = stockData.chart;
        if (!chartData || !chartData.indicators || !chartData.indicators.quote) {
            console.error('No OHLC data available');
            return;
        }

        const quotes = chartData.indicators.quote[0];
        
        // Get the latest valid values
        let open = null, high = null, low = null, close = null, volume = null;
        
        for (let i = quotes.close.length - 1; i >= 0; i--) {
            if (quotes.close[i] !== null && open === null) {
                open = quotes.open[i];
                high = quotes.high[i];
                low = quotes.low[i];
                close = quotes.close[i];
                volume = quotes.volume[i];
                break;
            }
        }
        
        if (open !== null) {
            document.getElementById('openPrice').textContent = `$${open.toFixed(2)}`;
            document.getElementById('highPrice').textContent = `$${high.toFixed(2)}`;
            document.getElementById('lowPrice').textContent = `$${low.toFixed(2)}`;
            document.getElementById('prevClosePrice').textContent = `$${close.toFixed(2)}`;
            document.getElementById('volumeData').textContent = this.formatVolume(volume);
            
            // Calculate average volume
            const validVolumes = quotes.volume.filter(v => v !== null);
            const avgVolume = validVolumes.length > 0 
                ? validVolumes.reduce((a, b) => a + b, 0) / validVolumes.length 
                : 0;
            document.getElementById('avgVolume').textContent = this.formatVolume(avgVolume);
        }
        
        // Update current price and change
        const currentPrice = chartData.meta?.regularMarketPrice || close;
        const previousClose = chartData.meta?.chartPreviousClose || chartData.meta?.previousClose || close;
        const change = currentPrice - previousClose;
        const changePercent = (change / previousClose) * 100;
        
        document.getElementById('currentPrice').textContent = `$${currentPrice.toFixed(2)}`;
        const priceChange = document.getElementById('priceChange');
        priceChange.textContent = `${change >= 0 ? '+' : ''}${change.toFixed(2)} (${changePercent.toFixed(2)}%)`;
        priceChange.className = `price-change ${change >= 0 ? 'positive' : 'negative'}`;
        
        // Update last updated time
        const lastUpdate = new Date();
        document.getElementById('lastUpdated').textContent = `Last updated: ${lastUpdate.toLocaleString()}`;
    }

    displayQuickStats(stockData) {
        const stats = stockData.stats;
        const quickStats = document.getElementById('quickStats');
        
        const marketCap = stats?.price?.marketCap?.raw || 0;
        const pe = stats?.summaryDetail?.trailingPE?.fmt || 'N/A';
        const eps = stats?.defaultKeyStatistics?.trailingEps?.fmt || 'N/A';
        const high52 = stats?.summaryDetail?.fiftyTwoWeekHigh?.fmt || 'N/A';
        const low52 = stats?.summaryDetail?.fiftyTwoWeekLow?.fmt || 'N/A';
        const beta = stats?.defaultKeyStatistics?.beta?.fmt || 'N/A';
        const dividendYield = stats?.summaryDetail?.dividendYield?.fmt || 'N/A';
        const profitMargin = stats?.financialData?.profitMargins?.fmt || 'N/A';
        
        quickStats.innerHTML = `
            <div class="stat-card">
                <div class="stat-label">Market Cap</div>
                <div class="stat-value">${this.formatMarketCap(marketCap)}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">P/E Ratio</div>
                <div class="stat-value">${pe}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">EPS (TTM)</div>
                <div class="stat-value">${eps}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">52W High</div>
                <div class="stat-value">${high52}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">52W Low</div>
                <div class="stat-value">${low52}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Beta</div>
                <div class="stat-value">${beta}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Dividend Yield</div>
                <div class="stat-value">${dividendYield}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Profit Margin</div>
                <div class="stat-value">${profitMargin}</div>
            </div>
        `;
    }

    displayCharts(stockData) {
        const chartData = stockData.chart;
        if (!chartData || !chartData.timestamp || !chartData.indicators) {
            console.error('No chart data available');
            return;
        }

        const timestamps = chartData.timestamp;
        const quotes = chartData.indicators.quote[0];
        
        // Prepare data for charts
        const labels = [];
        const prices = [];
        const volumes = [];
        
        timestamps.forEach((ts, index) => {
            if (quotes.close[index] !== null) {
                const date = new Date(ts * 1000);
                labels.push(date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
                prices.push(quotes.close[index]);
                volumes.push(quotes.volume[index] || 0);
            }
        });
        
        // Destroy existing charts if they exist
        if (this.priceChart) {
            this.priceChart.destroy();
        }
        if (this.volumeChart) {
            this.volumeChart.destroy();
        }
        
        // Create price chart
        const priceCtx = document.getElementById('priceChart').getContext('2d');
        this.priceChart = new Chart(priceCtx, {
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
                    pointRadius: 0,
                    pointHoverRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return `$${context.parsed.y.toFixed(2)}`;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        ticks: {
                            callback: function(value) {
                                return '$' + value.toFixed(2);
                            }
                        }
                    }
                }
            }
        });
        
        // Create volume chart
        const volumeCtx = document.getElementById('volumeChart').getContext('2d');
        this.volumeChart = new Chart(volumeCtx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Volume',
                    data: volumes,
                    backgroundColor: volumes.map((vol, i) => {
                        if (i > 0) {
                            return prices[i] > prices[i - 1] ? 'rgba(16, 185, 129, 0.7)' : 'rgba(239, 68, 68, 0.7)';
                        }
                        return 'rgba(37, 99, 235, 0.7)';
                    }),
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return `Volume: ${formatVolume(context.parsed.y)}`;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        ticks: {
                            callback: function(value) {
                                return formatVolume(value);
                            }
                        }
                    }
                }
            }
        });
    }

    toggleWatchlist() {
        if (!this.currentStock) return;
        
        const symbol = this.currentStock.symbol;
        const index = this.watchlist.indexOf(symbol);
        
        if (index > -1) {
            this.watchlist.splice(index, 1);
            this.showToast(`${symbol} removed from watchlist`);
        } else {
            this.watchlist.push(symbol);
            this.showToast(`${symbol} added to watchlist`);
        }
        
        this.saveWatchlist();
        this.renderWatchlist();
        this.updateWatchlistButton();
    }

    updateWatchlistButton() {
        if (!this.currentStock) return;
        
        const button = document.getElementById('watchlistBtn');
        const isInWatchlist = this.watchlist.includes(this.currentStock.symbol);
        
        if (isInWatchlist) {
            button.textContent = '✓ In Watchlist';
            button.classList.add('active');
        } else {
            button.textContent = '⭐ Add to Watchlist';
            button.classList.remove('active');
        }
    }

    switchFramework(framework) {
        this.currentFramework = framework;
        
        // Update active tab
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.framework === framework);
        });
        
        if (!this.currentStock) return;
        
        const content = document.getElementById('frameworkContent');
        
        switch(framework) {
            case 'overview':
                content.innerHTML = this.getOverviewHTML();
                break;
            case 'oneil':
                content.innerHTML = window.analyzeOneil ? window.analyzeOneil(this.currentStock) : this.getPlaceholderHTML('William J. O\'Neil - CANSLIM');
                break;
            case 'blackscholes':
                content.innerHTML = window.analyzeBlackScholes ? window.analyzeBlackScholes(this.currentStock) : this.getPlaceholderHTML('Black-Scholes Model');
                break;
            case 'buffett':
                content.innerHTML = window.analyzeBuffett ? window.analyzeBuffett(this.currentStock) : this.getPlaceholderHTML('Warren Buffett Intrinsic Value');
                break;
            case 'famafrench':
                content.innerHTML = window.analyzeFamaFrench ? window.analyzeFamaFrench(this.currentStock) : this.getPlaceholderHTML('Fama-French Three Factor');
                break;
            case 'magicformula':
                content.innerHTML = window.analyzeMagicFormula ? window.analyzeMagicFormula(this.currentStock) : this.getPlaceholderHTML('Magic Formula');
                break;
            case 'piotroski':
                content.innerHTML = window.analyzePiotroski ? window.analyzePiotroski(this.currentStock) : this.getPlaceholderHTML('Piotroski F-Score');
                break;
            case 'graham':
                content.innerHTML = window.analyzeGraham ? window.analyzeGraham(this.currentStock) : this.getPlaceholderHTML('Benjamin Graham Value');
                break;
            case 'acquirer':
                content.innerHTML = window.analyzeAcquirerMultiple ? window.analyzeAcquirerMultiple(this.currentStock) : this.getPlaceholderHTML('Acquirer\'s Multiple');
                break;
            case 'minervini':
                content.innerHTML = window.analyzeMinervini ? window.analyzeMinervini(this.currentStock) : this.getPlaceholderHTML('Mark Minervini SEPA');
                break;
            case 'lynch':
                content.innerHTML = window.analyzeLynch ? window.analyzeLynch(this.currentStock) : this.getPlaceholderHTML('Peter Lynch GARP');
                break;
        }
    }

    getOverviewHTML() {
        if (!this.currentStock) return '';
        
        const stock = this.currentStock;
        const stats = stock.stats;
        
        return `
            <div class="overview-section">
                <h3>Company Overview</h3>
                <div class="metric-grid">
                    <div class="metric-card">
                        <div class="stat-label">Sector</div>
                        <div class="metric-value">${stats?.assetProfile?.sector || 'N/A'}</div>
                    </div>
                    <div class="metric-card">
                        <div class="stat-label">Industry</div>
                        <div class="metric-value">${stats?.assetProfile?.industry || 'N/A'}</div>
                    </div>
                    <div class="metric-card">
                        <div class="stat-label">Employees</div>
                        <div class="metric-value">${stats?.assetProfile?.fullTimeEmployees || 'N/A'}</div>
                    </div>
                    <div class="metric-card">
                        <div class="stat-label">Website</div>
                        <div class="metric-value">${stats?.assetProfile?.website || 'N/A'}</div>
                    </div>
                </div>
                
                <h3>Company Description</h3>
                <p class="company-description">${stats?.assetProfile?.longBusinessSummary || 'No description available.'}</p>
                
                <div class="verdict neutral">
                    <strong>📊 Overview:</strong> Select a framework tab above for detailed analysis
                </div>
            </div>
        `;
    }

    getPlaceholderHTML(title) {
        return `
            <div class="framework-placeholder">
                <h3>${title}</h3>
                <p>This framework analysis is coming soon.</p>
                <div class="verdict neutral">
                    <strong>ℹ️ Note:</strong> The core stock data is working. Framework analyses will be added in future updates.
                </div>
            </div>
        `;
    }

    addToWatchlist(symbol) {
        if (!this.watchlist.includes(symbol)) {
            this.watchlist.push(symbol);
            this.saveWatchlist();
            this.renderWatchlist();
        }
    }

    removeFromWatchlist(symbol) {
        this.watchlist = this.watchlist.filter(s => s !== symbol);
        this.saveWatchlist();
        this.renderWatchlist();
    }

    saveWatchlist() {
        localStorage.setItem('watchlist', JSON.stringify(this.watchlist));
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
            <div class="watchlist-item" onclick="analyzer.loadStock('${symbol}')">
                <span class="symbol">${symbol}</span>
                <span class="price">Loading...</span>
                <button class="remove-btn" onclick="event.stopPropagation(); analyzer.removeFromWatchlist('${symbol}')">✕</button>
            </div>
        `).join('');
        
        // Fetch prices for watchlist items
        this.watchlist.forEach(symbol => {
            this.fetchWatchlistPrice(symbol);
        });
    }

    async fetchWatchlistPrice(symbol) {
        try {
            const data = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=1d&interval=1d`, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            }).then(res => res.json());
            
            const price = data.chart?.result?.[0]?.meta?.regularMarketPrice;
            if (price) {
                const items = document.querySelectorAll('.watchlist-item');
                items.forEach(item => {
                    if (item.querySelector('.symbol').textContent === symbol) {
                        item.querySelector('.price').textContent = `$${price.toFixed(2)}`;
                    }
                });
            }
        } catch (error) {
            console.error(`Error fetching price for ${symbol}:`, error);
        }
    }

    async loadStock(symbol) {
        document.getElementById('searchInput').value = symbol;
        await this.searchStock();
    }

    formatNumber(num) {
        if (!num) return 'N/A';
        if (num >= 1e12) return `$${(num / 1e12).toFixed(2)}T`;
        if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
        if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
        if (num >= 1e3) return `$${(num / 1e3).toFixed(2)}K`;
        return `$${num.toFixed(2)}`;
    }

    formatMarketCap(value) {
        if (!value) return 'N/A';
        if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
        if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
        if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
        return `$${value.toFixed(2)}`;
    }

    formatVolume(value) {
        if (!value) return 'N/A';
        if (value >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
        if (value >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
        if (value >= 1e3) return `${(value / 1e3).toFixed(2)}K`;
        return value.toString();
    }

    showLoading() {
        // Create loading overlay
        const loadingDiv = document.createElement('div');
        loadingDiv.id = 'loadingOverlay';
        loadingDiv.innerHTML = `
            <div class="loading-spinner"></div>
            <p>Loading stock data...</p>
        `;
        loadingDiv.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(255, 255, 255, 0.9);
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            z-index: 9999;
        `;
        document.body.appendChild(loadingDiv);
    }

    hideLoading() {
        const loadingDiv = document.getElementById('loadingOverlay');
        if (loadingDiv) {
            loadingDiv.remove();
        }
    }

    showError(message) {
        // Create error toast
        const toast = document.createElement('div');
        toast.className = 'toast error';
        toast.textContent = message;
        document.body.appendChild(toast);
        
        setTimeout(() => toast.classList.add('show'), 100);
        
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 5000);
    }

    showToast(message) {
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = message;
        document.body.appendChild(toast);
        
        setTimeout(() => toast.classList.add('show'), 100);
        
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
}

// Global formatVolume function for chart tooltips
function formatVolume(value) {
    if (!value) return 'N/A';
    if (value >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
    if (value >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
    if (value >= 1e3) return `${(value / 1e3).toFixed(2)}K`;
    return value.toString();
}

// Initialize the application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.analyzer = new StockAnalyzer();
    console.log('Stock Analyzer initialized');
});
