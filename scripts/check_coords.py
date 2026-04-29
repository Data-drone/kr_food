import json

def check_coordinates():
    with open('data/restaurants.json', 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    # Busan approximate bounds
    # Lat: 34.8 to 35.4
    # Lng: 128.7 to 129.3
    
    outliers = []
    for r in data['restaurants']:
        lat = r.get('lat')
        lng = r.get('lng')
        
        if lat is None or lng is None:
            outliers.append((r['id'], r['name'], "Missing coordinates"))
            continue
            
        if not (34.0 < lat < 36.0) or not (127.0 < lng < 130.0):
            outliers.append((r['id'], r['name'], f"Outlier: {lat}, {lng}"))
            
    if outliers:
        print("Found outliers:")
        for r_id, name, issue in outliers:
            print(f"ID: {r_id}, Name: {name}, Issue: {issue}")
    else:
        print("No outliers found within the broad Korean peninsula range.")

if __name__ == "__main__":
    check_coordinates()
