import json
import time
import requests

cities_to_add = [
    ("Andhra Pradesh", "Visakhapatnam"), ("Andhra Pradesh", "Vijayawada"),
    ("Arunachal Pradesh", "Itanagar"),
    ("Assam", "Guwahati"), ("Assam", "Dispur"),
    ("Bihar", "Patna"), ("Bihar", "Gaya"),
    ("Chhattisgarh", "Raipur"), ("Chhattisgarh", "Bhilai"),
    ("Goa", "Panaji"),
    ("Gujarat", "Ahmedabad"), ("Gujarat", "Surat"), ("Gujarat", "Vadodara"), ("Gujarat", "Rajkot"),
    ("Haryana", "Gurugram"), ("Haryana", "Faridabad"),
    ("Himachal Pradesh", "Shimla"),
    ("Jharkhand", "Ranchi"), ("Jharkhand", "Jamshedpur"), ("Jharkhand", "Dhanbad"),
    ("Karnataka", "Bengaluru"), ("Karnataka", "Mysuru"), ("Karnataka", "Mangaluru"),
    ("Kerala", "Thiruvananthapuram"), ("Kerala", "Kochi"), ("Kerala", "Kozhikode"),
    ("Madhya Pradesh", "Indore"), ("Madhya Pradesh", "Bhopal"), ("Madhya Pradesh", "Jabalpur"), ("Madhya Pradesh", "Gwalior"),
    ("Maharashtra", "Mumbai"), ("Maharashtra", "Pune"), ("Maharashtra", "Nagpur"), ("Maharashtra", "Nashik"), ("Maharashtra", "Aurangabad"),
    ("Manipur", "Imphal"),
    ("Meghalaya", "Shillong"),
    ("Mizoram", "Aizawl"),
    ("Nagaland", "Kohima"), ("Nagaland", "Dimapur"),
    ("Odisha", "Bhubaneswar"), ("Odisha", "Cuttack"),
    ("Punjab", "Ludhiana"), ("Punjab", "Amritsar"), ("Punjab", "Jalandhar"),
    ("Rajasthan", "Jaipur"), ("Rajasthan", "Jodhpur"), ("Rajasthan", "Udaipur"), ("Rajasthan", "Kota"),
    ("Sikkim", "Gangtok"),
    ("Tamil Nadu", "Chennai"), ("Tamil Nadu", "Coimbatore"), ("Tamil Nadu", "Madurai"), ("Tamil Nadu", "Tiruchirappalli"),
    ("Telangana", "Hyderabad"), ("Telangana", "Warangal"),
    ("Tripura", "Agartala"),
    ("Uttar Pradesh", "Lucknow"), ("Uttar Pradesh", "Kanpur"), ("Uttar Pradesh", "Agra"), ("Uttar Pradesh", "Varanasi"), ("Uttar Pradesh", "Prayagraj"), ("Uttar Pradesh", "Noida"),
    ("Uttarakhand", "Dehradun"),
    ("West Bengal", "Kolkata"), ("West Bengal", "Howrah"), ("West Bengal", "Siliguri"),
    ("Andaman and Nicobar Islands", "Port Blair"),
    ("Chandigarh", "Chandigarh"),
    ("Dadra and Nagar Haveli", "Silvassa"),
    ("Delhi", "New Delhi"),
    ("Jammu and Kashmir", "Srinagar"), ("Jammu and Kashmir", "Jammu"),
    ("Ladakh", "Leh"),
    ("Lakshadweep", "Kavaratti"),
    ("Puducherry", "Puducherry")
]

def slugify(text):
    return text.lower().replace(" ", "-").replace("&", "and")

locations = []

for state, city in cities_to_add:
    # Handle HPCL specific slugs
    state_slug = slugify(state)
    if state_slug == "dadra-and-nagar-haveli": state_slug = "dadra-and-nagar-haveli-and-daman-and-diu"
    
    city_slug = slugify(city)
    if city_slug == "bengaluru": city_slug = "bangalore"
    if city_slug == "thiruvananthapuram": city_slug = "trivandrum"
    
    # Geocode using Nominatim
    query = f"{city}, {state}, India"
    try:
        res = requests.get(
            f"https://nominatim.openstreetmap.org/search?q={query}&format=json&limit=1",
            headers={"User-Agent": "FuelTrackerApp/1.0"}
        )
        if res.status_code == 200 and len(res.json()) > 0:
            data = res.json()[0]
            lat = data['lat']
            lon = data['lon']
            
            locations.append({
                "city": city,
                "lat": lat,
                "lon": lon,
                "state_slug": state_slug,
                "city_slug": city_slug
            })
            print(f"Geocoded: {city}, {state}")
        else:
            print(f"Failed to geocode: {city}, {state}")
    except Exception as e:
        print(f"Error geocoding {city}: {e}")
        
    time.sleep(1) # Respect Nominatim rate limits

with open('config.json', 'r') as f:
    config = json.load(f)

# Override locations
config['locations'] = locations

with open('config.json', 'w') as f:
    json.dump(config, f, indent=2)

print(f"\nSuccessfully added {len(locations)} locations to config.json")
