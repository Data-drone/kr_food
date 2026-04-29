import json
from pathlib import Path
from openai import OpenAI
import time

def enrich_data():
    data_path = Path("data/restaurants.json")
    with open(data_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    client = OpenAI()
    
    # Define common cuisines for categorization
    cuisines = [
        "Korean", "Chinese", "Japanese", "Western", "Italian", "French", 
        "Thai", "Vietnamese", "Indian", "Fusion", "Dessert/Cafe", "Pub/Bar"
    ]

    for restaurant in data["restaurants"]:
        # Skip if already enriched
        if "cuisine" in restaurant and "meal_times" in restaurant:
            continue
            
        print(f"Enriching {restaurant['name']}...")
        
        prompt = f"""
        Restaurant Name: {restaurant['name']}
        Category: {restaurant['category']}
        Menu: {restaurant['menu']}
        Description: {restaurant['description']}
        Hours: {restaurant['hoursSummary']}
        
        Based on the above information, provide:
        1. The most accurate single cuisine category from this list: {', '.join(cuisines)}.
        2. Applicable meal times from this list: Breakfast, Lunch, Dinner.
        
        Return the result in JSON format:
        {{"cuisine": "Category", "meal_times": ["Time1", "Time2"]}}
        """
        
        retries = 3
        for i in range(retries):
            try:
                response = client.chat.completions.create(
                    model="gpt-4.1-mini",
                    messages=[
                        {"role": "system", "content": "You are a food data expert. Categorize the restaurant based on its details. Only return JSON."},
                        {"role": "user", "content": prompt}
                    ],
                    response_format={"type": "json_object"}
                )
                enrichment = json.loads(response.choices[0].message.content)
                restaurant["cuisine"] = enrichment.get("cuisine", "Korean")
                restaurant["meal_times"] = enrichment.get("meal_times", ["Lunch", "Dinner"])
                break
            except Exception as e:
                print(f"Attempt {i+1} failed for {restaurant['name']}: {e}")
                if i == retries - 1:
                    restaurant["cuisine"] = "Korean"
                    restaurant["meal_times"] = ["Lunch", "Dinner"]
                time.sleep(1)

    with open(data_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    
    print("Data enrichment complete.")

if __name__ == "__main__":
    enrich_data()
