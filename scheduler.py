import schedule
import time
from fetch_stock_data import StockDataFetcher

def update_all_data():
    """Update all stock data"""
    print(f"Updating stock data at {time.strftime('%Y-%m-%d %H:%M:%S')}")
    
    fetcher = StockDataFetcher()
    
    # Your watchlist
    symbols = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'META', 'NVDA', 'JPM', 'V', 'JNJ']
    
    # Fetch and save
    results = fetcher.fetch_and_save_multiple(symbols)
    fetcher.create_master_csv(symbols)
    
    print("Data update completed!")
    print("Remember to commit and push to GitHub:")
    print("git add data/")
    print("git commit -m 'Update stock data'")
    print("git push")

def main():
    # Schedule updates
    # Update every day at 6:00 PM (after market close)
    schedule.every().day.at("18:00").do(update_all_data)
    
    # Also update at market open
    schedule.every().day.at("09:30").do(update_all_data)
    
    # Run once immediately
    update_all_data()
    
    print("Scheduler started. Press Ctrl+C to stop.")
    
    while True:
        schedule.run_pending()
        time.sleep(60)  # Check every minute

if __name__ == "__main__":
    main()
