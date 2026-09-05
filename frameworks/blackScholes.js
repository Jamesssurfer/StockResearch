window.analyzeBlackScholes = function(stock) {
    const stats = stock.stats;
    const quote = stock.quote;
    
    // Black-Scholes Model Components
    const currentPrice = quote?.meta?.regularMarketPrice || 0;
    const riskFreeRate = 0.04; // 4% risk-free rate
    const volatility = calculateVolatility(stock);
    const dividendYield = stats?.summaryDetail?.dividendYield?.raw || 0;
    
    // Calculate theoretical option prices (example with 30-day expiration)
    const timeToExpiry = 30/365;
    const strikePrice = currentPrice * 1.1; // 10% OTM
    const d1 = calculateD1(currentPrice, strikePrice, riskFreeRate, volatility, timeToExpiry);
    const d2 = d1 - volatility * Math.sqrt(timeToExpiry);
    
    const callPrice = calculateCallPrice(currentPrice, strikePrice, riskFreeRate, timeToExpiry, d1, d2);
    const putPrice = calculatePutPrice(currentPrice, strikePrice, riskFreeRate, timeToExpiry, d1, d2);
    
    const metrics = {
        'Stock Price': `$${currentPrice.toFixed(2)}`,
        'Implied Volatility': `${(volatility * 100).toFixed(2)}%`,
        'Call Option Price': `$${callPrice.toFixed(2)}`,
        'Put Option Price': `$${putPrice.toFixed(2)}`,
        'Delta': calculateDelta(d1).toFixed(3),
        'Gamma': calculateGamma(d1, currentPrice, volatility, timeToExpiry).toFixed(3),
        'Theta': calculateTheta(currentPrice, d1, d2, volatility, timeToExpiry, riskFreeRate).toFixed(3),
        'Vega': calculateVega(currentPrice, d1, timeToExpiry).toFixed(3)
    };
    
    const fairValue = calculateFairValue(currentPrice, stats);
    const recommendation = fairValue > currentPrice * 1.05 ? 'Bullish' : fairValue < currentPrice * 0.95 ? 'Bearish' : 'Neutral';
    
    return generateOptionsHTML('Black-Scholes Option Pricing Model', metrics, recommendation);
};
