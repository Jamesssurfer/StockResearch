window.analyzeOneil = function(stock) {
    const stats = stock.stats;
    const quote = stock.quote;
    
    // CANSLIM Criteria
    const criteria = {
        'C - Current Earnings': {
            current: stats?.earningsTrend?.trend?.[0]?.growth?.fmt || '0%',
            target: '> 25%',
            score: checkEarningsGrowth(stats)
        },
        'A - Annual Earnings': {
            current: stats?.defaultKeyStatistics?.earningsGrowth?.fmt || 'N/A',
            target: '> 25%',
            score: checkAnnualEarnings(stats)
        },
        'N - New Products/Services': {
            current: stats?.defaultKeyStatistics?.priceToBook?.fmt || 'N/A',
            target: 'New highs',
            score: checkNewHighs(quote)
        },
        'S - Supply and Demand': {
            current: stats?.price?.volume?.fmt || 'N/A',
            target: 'Increasing volume',
            score: checkVolume(stats)
        },
        'L - Leader or Laggard': {
            current: stats?.defaultKeyStatistics?.relativeStrength?.fmt || 'N/A',
            target: 'RS > 80',
            score: checkRelativeStrength(stats)
        },
        'I - Institutional Sponsorship': {
            current: stats?.defaultKeyStatistics?.heldPercentInstitutions?.fmt || 'N/A',
            target: '> 40%',
            score: checkInstitutionalOwnership(stats)
        },
        'M - Market Direction': {
            current: getMarketDirection(),
            target: 'Uptrend',
            score: checkMarketDirection()
        }
    };
    
    const totalScore = calculateTotalScore(criteria);
    const recommendation = getRecommendation(totalScore);
    
    return generateHTML('William J. O\'Neil - CANSLIM', criteria, totalScore, recommendation);
};
