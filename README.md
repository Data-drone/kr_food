# Busan Blue Ribbon 100

Static GitHub Pages site for the Busan Blue Ribbon 100 list, sourced from Visit
Busan.

## Files

- `index.html`: page shell
- `styles.css`: layout and responsive styling
- `app.js`: filtering, map rendering, geolocation, and outbound map links
- `data/restaurants.json`: generated restaurant dataset
- `scripts/fetch_busan_blue_ribbon.py`: scraper for refreshing the dataset

## Regenerate the dataset

```bash
python3 scripts/fetch_busan_blue_ribbon.py
```

The scraper expects network access to `visitbusan.net`.

## Publish on GitHub Pages

Push this directory to a GitHub repository and enable GitHub Pages from the root
of the default branch.
