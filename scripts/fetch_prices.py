import json
import os
import glob
import requests
from bs4 import BeautifulSoup
from datetime import datetime
import pytz

def parse_iocl_html(html_content):
    soup = BeautifulSoup(html_content, 'html.parser')
    prices = {}
    
    fuel_mapping = {
        'icn-petrol': 'Petrol',
        'icn-diesel': 'Diesel',
        'icn-xp': 'XP100',
        'icn-xptwo': 'XP95',
        'icn-indigreen': 'XtraGreen'
    }
    
    list_items = soup.find_all('li', class_='slide-item')
    for item in list_items:
        icon_span = item.find('span', class_='fuel-icon')
        text_span = item.find('span', class_='fuel-text')
        
        if icon_span and text_span:
            classes = icon_span.get('class', [])
            for c in classes:
                if c in fuel_mapping:
                    fuel_name = fuel_mapping[c]
                    price_text = text_span.text.strip()
                    try:
                        price_val = float(price_text.replace('₹', '').replace('/ltr', '').strip())
                        prices[fuel_name] = price_val
                    except ValueError:
                        print(f"Could not parse price: {price_text}")
                    break
    return prices

def parse_iocl_dynamic(html_content, req_headers):
    soup = BeautifulSoup(html_content, 'html.parser')
    prices = {}
    
    # Extract JSON-LD script
    script_tag = soup.find('script', type='application/ld.json')
    if not script_tag:
        return prices
        
    try:
        ld_data = json.loads(script_tag.string)
        # Find ItemList containing URLs
        item_list = None
        for item in ld_data:
            if item.get('@type') == 'ItemList':
                item_list = item.get('itemListElement', [])
                break
                
        if not item_list:
            return prices
            
        for list_item in item_list:
            url = list_item.get('url', '')
            if not url: continue
            
            # URL format: https://locator.iocl.com/indianoil-...-183700/Home
            parts = url.split('/')
            if len(parts) >= 2:
                # The segment before /Home is indianoil-...-183700
                slug = parts[-2]
                slug_parts = slug.split('-')
                if slug_parts:
                    outlet_id = slug_parts[-1]
                    
                    if outlet_id.isdigit():
                        # Fetch pricing for this pump
                        price_url = f"https://locator.iocl.com/getPetrolPricesForIOCL.php?master_outlet_id=99528&outlet_id={outlet_id}"
                        try:
                            # Use custom header
                            headers = {
                                "X-Requested-With": "XMLHttpRequest",
                                "User-Agent": req_headers.get('User-Agent', 'Mozilla/5.0'),
                                "Referer": "https://locator.iocl.com/"
                            }
                            res = requests.get(price_url, headers=headers, timeout=10)
                            res.raise_for_status()
                            
                            # parse with our existing HTML parser
                            pump_prices = parse_iocl_html(res.text)
                            # Merge
                            prices.update(pump_prices)
                        except Exception as e:
                            print(f"Error fetching IOCL sub-request for {outlet_id}: {e}")
                            
    except Exception as e:
        print(f"Error parsing IOCL dynamic data: {e}")
        
    return prices

def parse_hpcl_html(html_content):
    soup = BeautifulSoup(html_content, 'html.parser')
    prices = {}
    
    list_items = soup.find_all('li', class_='slide-item')
    for item in list_items:
        name_span = item.find('span', class_='fuel_Name')
        text_span = item.find('span', class_='fuel-text')
        
        if name_span and text_span:
            fuel_name = name_span.text.strip()
            # Handle minor differences like "Power 99" vs "Power99"
            if fuel_name == "Power 99": fuel_name = "Power99"
            if fuel_name == "Power 100": fuel_name = "Power100"
            if fuel_name == "Power95": fuel_name = "Power95"
            
            price_text = text_span.text.strip()
            try:
                # Format is like "110.89 ₹/L"
                price_val = float(price_text.replace('₹/L', '').strip())
                prices[fuel_name] = price_val
            except ValueError:
                print(f"Could not parse price: {price_text}")
    return prices

import re

def parse_hpcl_dynamic(html_content, req_headers):
    soup = BeautifulSoup(html_content, 'html.parser')
    prices = {}
    
    # Find all links that look like pump links
    links = soup.find_all('a', href=True)
    outlet_ids = set()
    
    for link in links:
        href = link['href']
        # Look for the pattern ...-12345/Home
        match = re.search(r'-(\d+)/Home$', href)
        if match:
            outlet_ids.add(match.group(1))
            
    for outlet_id in outlet_ids:
        price_url = f"https://petrolpump.hpretail.in/getPetrolPricesForHPCL.php?master_outlet_id=96681&outlet_id={outlet_id}"
        try:
            headers = {
                "X-Requested-With": "XMLHttpRequest",
                "User-Agent": req_headers.get('User-Agent', 'Mozilla/5.0'),
                "Referer": "https://petrolpump.hpretail.in/"
            }
            res = requests.get(price_url, headers=headers, timeout=10)
            res.raise_for_status()
            
            pump_prices = parse_hpcl_html(res.text)
            prices.update(pump_prices)
        except Exception as e:
            print(f"Error fetching HPCL sub-request for {outlet_id}: {e}")
            
    return prices

def parse_bpcl_json(json_content):
    data = json.loads(json_content)
    prices = {}
    
    if 'pointOfServices' in data:
        for pump in data['pointOfServices']:
            if 'weekDayFuelPriceList' in pump:
                for fuel in pump['weekDayFuelPriceList']:
                    name = fuel.get('displayName', '').strip().title()
                    if name.lower() == 'petrol': name = 'Petrol'
                    if name.lower() == 'diesel': name = 'Diesel'
                    if name.lower() == 'speed': name = 'Speed'
                    if name.lower() == 'speed 97': name = 'Speed97'
                    
                    try:
                        price = float(fuel['price'])
                        prices[name] = price
                    except (ValueError, TypeError):
                        pass
    return prices

def main():
    ist = pytz.timezone('Asia/Kolkata')
    today_str = datetime.now(ist).strftime('%Y-%m-%d')
    
    history_file = 'data/history.json'
    if os.path.exists(history_file):
        with open(history_file, 'r') as f:
            history = json.load(f)
    else:
        history = []
        
    today_entry = next((entry for entry in history if entry['date'] == today_str), None)
    if not today_entry:
        today_entry = {
            'date': today_str,
            'prices': {}
        }
        history.append(today_entry)
        
    # Read from config.json
    with open('config.json', 'r') as f:
        config = json.load(f)
        
    for location in config['locations']:
        city_name = location['city']
        
        if city_name not in today_entry['prices']:
            today_entry['prices'][city_name] = {}
            
        for company_data in config['companies']:
            company = company_data['company']
            req_info = company_data['request']
            parser = company_data['parser']
            
            try:
                # Format the URL template with location variables
                url = req_info['url_template'].format(**location)
                
                print(f"Fetching data for {city_name} - {company}...")
                response = requests.request(
                    method=req_info.get('method', 'GET'),
                    url=url,
                    headers=req_info.get('headers', {}),
                    timeout=10
                )
                response.raise_for_status()
                
                prices = {}
                if parser == 'iocl_html':
                    prices = parse_iocl_html(response.text)
                elif parser == 'iocl_dynamic':
                    prices = parse_iocl_dynamic(response.text, req_info.get('headers', {}))
                elif parser == 'hpcl_html':
                    prices = parse_hpcl_html(response.text)
                elif parser == 'hpcl_dynamic':
                    prices = parse_hpcl_dynamic(response.text, req_info.get('headers', {}))
                elif parser == 'bpcl_json':
                    prices = parse_bpcl_json(response.text)
                else:
                    print(f"Unknown parser: {parser}")
                    
                if prices:
                    if company not in today_entry['prices'][city_name]:
                        today_entry['prices'][city_name][company] = {}
                    
                    # Merge or set prices for the company
                    for fuel, price in prices.items():
                        today_entry['prices'][city_name][company][fuel] = price
                        
            except Exception as e:
                print(f"Error fetching data for {city_name} - {company}: {e}")

    os.makedirs('data', exist_ok=True)
    
    with open(history_file, 'w') as f:
        json.dump(history, f, indent=2)
        
    print(f"Prices for {today_str} successfully updated in {history_file}.")
    
    # Save a latest.json for quick dashboard access
    latest_data = history[-1]
    with open('data/latest.json', 'w') as f:
        json.dump(latest_data, f, indent=2)

if __name__ == '__main__':
    main()
