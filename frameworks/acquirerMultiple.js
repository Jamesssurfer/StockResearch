window.analyzeAcquirerMultiple = function(stock) {
    const stats = stock.stats;
    
    // Calculate Acquirer's Multiple
    const acquirersMultiple = calculateAcquirersMultiple(stock);
    
    const metrics = {
        'Acquirer\'s Multiple': acquirersMultiple.toFixed(2),
        'Enterprise Value': stats?.defaultKeyStatistics?.enterpriseValue?.fmt || 'N/A',
        'EBITDA': stats?.financialData?.ebitda?.fmt || 'N/A',
        'Operating Income': stats?.financialData?.operatingIncome?.fmt || 'N/A',
        'P/E Ratio': stats?.summaryDetail?.trailingPE?.fmt || 'N/A',
        'P/B Ratio': stats?.defaultKeyStatistics?.priceToBook?.fmt || 'N/A'
    };
    
    const score = calculateAcquirerScore(acquirersMultiple);
    const recommendation = acquirersMultiple < 10 ? 'Deep Value' : acquirersMultiple < 15 ? 'Value' : 'Expensive';
    
    return generateHTML('Acquirer\'s Multiple Analysis', metrics, score, recommendation);
};
