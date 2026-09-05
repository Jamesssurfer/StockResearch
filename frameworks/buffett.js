window.analyzeBuffett = function(stock) {
    const stats = stock.stats;
    const financials = stock.financials;
    
    // Buffett's Criteria
    const metrics = {
        'ROE': stats?.financialData?.returnOnEquity?.fmt || 'N/A',
        'Debt to Equity': stats?.financialData?.debtToEquity?.fmt || 'N/A',
        'Current Ratio': stats?.financialData?.currentRatio?.fmt || 'N/A',
        'Profit Margin': stats?.financialData?.profitMargins?.fmt || 'N/A',
        'EPS Growth': stats?.defaultKeyStatistics?.earningsGrowth?.fmt || 'N/A',
        'Dividend Yield': stats?.summaryDetail?.dividendYield?.fmt || '0%'
    };
    
    // Calculate Intrinsic Value using DCF
    const intrinsicValue = calculateIntrinsicValue(stock);
    const currentPrice = stock.quote?.meta?.regularMarketPrice || 0;
    const marginOfSafety = ((intrinsicValue - currentPrice) / intrinsicValue) * 100;
    
    const score = calculateBuffettScore(metrics, intrinsicValue, currentPrice);
    const recommendation = score > 70 ? 'Bullish' : score > 40 ? 'Neutral' : 'Bearish';
    
    return generateValueHTML('Warren Buffett Intrinsic Value Analysis', metrics, score, recommendation, intrinsicValue, currentPrice, marginOfSafety);
};
