import requests
import time

def get_coords(address):
    url = "https://nominatim.openstreetmap.org/search"
    params = {
        "q": address,
        "format": "json",
        "limit": 1
    }
    headers = {
        "User-Agent": "ManusAgent/1.0 (contact: support@manus.im)"
    }
    try:
        response = requests.get(url, params=params, headers=headers)
        data = response.json()
        if data:
            return float(data[0]['lat']), float(data[0]['lon'])
    except Exception as e:
        print(f"Error: {e}")
    return None

if __name__ == "__main__":
    # Address from search: 부산 연제구 교대로 7
    address = "부산 연제구 교대로 7"
    coords = get_coords(address)
    if coords:
        print(f"Coordinates for '{address}': {coords[0]}, {coords[1]}")
    else:
        # Try a slightly different format if it fails
        time.sleep(1)
        address2 = "7, Gyodae-ro, Yeonje-gu, Busan"
        coords2 = get_coords(address2)
        if coords2:
            print(f"Coordinates for '{address2}': {coords2[0]}, {coords2[1]}")
        else:
            print("Could not find coordinates.")
