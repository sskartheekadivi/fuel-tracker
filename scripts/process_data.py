import json
import os
from datetime import datetime, timedelta

def main():
    history_file = 'data/history.json'
    if not os.path.exists(history_file):
        print("No history file found.")
        return

    with open(history_file, 'r') as f:
        history = json.load(f)

    if not history:
        return

    # Sort history by date descending
    history.sort(key=lambda x: x['date'], reverse=True)
    
    # Save latest
    latest_data = history[0]
    with open('data/latest.json', 'w') as f:
        json.dump(latest_data, f, indent=2)

    # Calculate averages
    averages = {
        'weekly': {},
        'monthly': {}
    }

    latest_date_str = history[0]['date']
    latest_date = datetime.strptime(latest_date_str, '%Y-%m-%d')
    
    # 7 days ago and 30 days ago from the latest date
    week_ago = (latest_date - timedelta(days=7)).strftime('%Y-%m-%d')
    month_ago = (latest_date - timedelta(days=30)).strftime('%Y-%m-%d')

    def aggregate(days_ago_str):
        # Filter records
        valid_records = [r for r in history if r['date'] > days_ago_str]
        
        sums = {}
        counts = {}
        
        for record in valid_records:
            for city, companies in record['prices'].items():
                if city not in sums:
                    sums[city] = {}
                    counts[city] = {}
                for company, fuels in companies.items():
                    if company not in sums[city]:
                        sums[city][company] = {}
                        counts[city][company] = {}
                    for fuel, price in fuels.items():
                        if fuel not in sums[city][company]:
                            sums[city][company][fuel] = 0
                            counts[city][company][fuel] = 0
                        sums[city][company][fuel] += price
                        counts[city][company][fuel] += 1
                        
        avgs = {}
        for city in sums:
            avgs[city] = {}
            for company in sums[city]:
                avgs[city][company] = {}
                for fuel in sums[city][company]:
                    avgs[city][company][fuel] = round(sums[city][company][fuel] / counts[city][company][fuel], 2)
        return avgs

    averages['weekly'] = aggregate(week_ago)
    averages['monthly'] = aggregate(month_ago)

    with open('data/averages.json', 'w') as f:
        json.dump(averages, f, indent=2)
    
    print("Data processing complete. Saved latest.json and averages.json.")

if __name__ == '__main__':
    main()
