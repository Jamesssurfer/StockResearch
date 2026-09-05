window.analyzeGraham = function(stock) {
    const stats = stock.stats;
    
    // Graham's Criteria
    const metrics = {
        'P/E Ratio': stats?.summaryDetail?.trailingPE?.fmt || 'N/A',
        'P/B Ratio': stats?.defaultKeyStatistics?.priceToBook?.fmt || 'N/A',
        'Current Ratio': stats?.financialData?.currentRatio?.fmt || 'N/A',
        'Debt to Equity': stats?.financialData?.debtToEquity?.fmt || 'N/A',
        'EPS Growth': stats?.defaultKeyStatistics?.earningsGrowth?.fmt || 'N/A',
        'Dividend Yield': stats?.summaryDetail?.dividendYield?.fmt || '0%'
    };
    
    // Calculate Graham Number
    const grahamNumber = calculateGrahamNumber(stock);
    const currentPrice = stock.quote?.meta?.regularMarketPrice || 0;
    const netCurrentAssetValue = calculateNCAV(stock);
    
    const score = calculateGrahamScore(metrics, grahamNumber, currentPrice, netCurrentAssetValue);
    const recommendation = score > 70 ? 'Undervalued' : score > 40 ? 'Fair Value' : 'Overvalued';
    
    return generateValueHTML('Benjamin Graham Value Analysis', metrics, score, recommendation, grahamNumber, currentPrice, netCurrentAssetValue);
};
