/**
 * Korea Food Guide: Busan & Seoul
 * Unified app.js with city switching, multi-category filtering, and Honors support
 */

// --- Constants & State ---
const CONFIG = {
  busan: {
    dataUrl: './data/restaurants.json',
    title: 'Busan Gastronomy Guide',
    eyebrow: 'Busan Food Guide',
    description: 'A curated guide to the top restaurants in Busan, featuring Blue Ribbon and Michelin selections.',
    source: 'Source: Visit Busan & Michelin Guide',
    center: [35.1796, 129.0756],
    zoom: 11
  },
  seoul: {
    dataUrl: './data/seoul_restaurants.json',
    title: 'Seoul Gastronomy Guide',
    eyebrow: 'Seoul Food Guide',
    description: 'A comprehensive guide to Seoul’s finest dining, featuring Taste of Seoul, Michelin Guide, and Blue Ribbon winners.',
    source: 'Source: Visit Seoul & Michelin Guide',
    center: [37.5665, 126.9780],
    zoom: 12
  }
};

let state = {
  currentCity: 'seoul',
  allRestaurants: [],
  visibleRestaurants: [],
  map: null,
  markers: [],
  selectedId: null,
  filters: {
    search: '',
    district: 'All',
    cuisine: 'All',
    meal: 'All',
    theme: 'All',
    honor: 'All'
  }
};

const elements = {
  datasetCount: document.querySelector("#dataset-count"),
  visibleCount: document.querySelector("#visible-count"),
  sourceStamp: document.querySelector("#source-stamp"),
  cityTitle: document.querySelector("#city-title"),
  cityEyebrow: document.querySelector("#city-eyebrow"),
  cityDescription: document.querySelector("#city-description"),
  searchInput: document.querySelector("#search-input"),
  districtFilters: document.querySelector("#district-filters"),
  cuisineFilters: document.querySelector("#cuisine-filters"),
  mealFilters: document.querySelector("#meal-filters"),
  themeFilters: document.querySelector("#theme-filters"),
  honorFilters: document.querySelector("#honor-filters"),
  list: document.querySelector("#restaurant-list"),
  locateBtn: document.querySelector("#locate-btn"),
  resetBtn: document.querySelector("#reset-btn"),
  fitBtn: document.querySelector("#fit-btn"),
  filterToggle: document.querySelector("#filter-toggle"),
  filterContent: document.querySelector("#filter-content"),
};

// --- Initialization ---
async function init() {
  initMap();
  setupEventListeners();
  await loadCityData('seoul');
}

function initMap() {
  state.map = L.map('map', {
    scrollWheelZoom: false,
    zoomControl: false
  }).setView(CONFIG.seoul.center, CONFIG.seoul.zoom);

  L.control.zoom({ position: 'bottomright' }).addTo(state.map);

  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO'
  }).addTo(state.map);
}

function setupEventListeners() {
  // City Tabs
  document.querySelectorAll('.city-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const city = btn.dataset.city;
      if (city === state.currentCity) return;
      
      document.querySelectorAll('.city-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      loadCityData(city);
    });
  });

  // Search
  elements.searchInput.addEventListener('input', (e) => {
    state.filters.search = e.target.value.toLowerCase();
    applyFilters();
  });

  // Main Filter Toggle
  elements.filterToggle.addEventListener('click', function() {
    const isExpanded = this.getAttribute('aria-expanded') === 'true';
    this.setAttribute('aria-expanded', !isExpanded);
    this.querySelector('.filter-toggle__text').textContent = isExpanded ? 'Show Filters' : 'Hide Filters';
    elements.filterContent.classList.toggle('is-collapsed');
  });

  // Independent Group Toggles
  document.querySelectorAll('.toolbar__toggle').forEach(btn => {
    btn.addEventListener('click', function() {
      const wrapperId = this.getAttribute('aria-controls');
      const wrapper = document.getElementById(wrapperId);
      const isExpanded = this.getAttribute('aria-expanded') === 'true';
      this.setAttribute('aria-expanded', !isExpanded);
      wrapper.classList.toggle('is-collapsed');
    });
  });

  // Action Buttons
  elements.resetBtn.addEventListener('click', () => resetFilters());
  elements.fitBtn.addEventListener('click', fitMapToMarkers);
  elements.locateBtn.addEventListener('click', useMyLocation);
}

// --- Data Handling ---
async function loadCityData(city) {
  state.currentCity = city;
  const config = CONFIG[city];
  
  // Update UI
  elements.cityTitle.textContent = config.title;
  elements.cityEyebrow.textContent = config.eyebrow;
  elements.cityDescription.textContent = config.description;
  elements.sourceStamp.textContent = config.source;
  
  try {
    const response = await fetch(config.dataUrl);
    const data = await response.json();
    state.allRestaurants = Array.isArray(data) ? data : data.restaurants;
    
    // Reset filters and state
    state.selectedId = null;
    resetFilters(false); 
    state.map.setView(config.center, config.zoom);
    
    // Populate UI
    renderFilters();
    applyFilters();
    
    elements.datasetCount.textContent = `${state.allRestaurants.length} places`;
  } catch (err) {
    console.error('Failed to load data:', err);
    elements.list.innerHTML = '<p class="empty-state">Error loading data. Please try again.</p>';
  }
}

function renderFilters() {
  const districts = new Set(['All']);
  const cuisines = new Set(['All']);
  const themes = new Set(['All']);
  const honors = new Set(['All']);

  state.allRestaurants.forEach(r => {
    if (r.district_en) districts.add(r.district_en);
    if (r.cuisine) cuisines.add(r.cuisine);
    if (r.theme_en) themes.add(r.theme_en);
    
    // Check for honors
    if (r.michelin) {
      if (r.michelin.includes('Star')) honors.add('Michelin Star');
      if (r.michelin.includes('Bib')) honors.add('Bib Gourmand');
    }
    if (r.ribbons) {
        if (r.ribbons === 3) honors.add('Blue Ribbon (3 Ribbons)');
        else if (r.ribbons === 2) honors.add('Blue Ribbon (2 Ribbons)');
        else honors.add('Blue Ribbon');
    }
    if (r.honors && r.honors.includes('Blue Ribbon (2 Ribbons)')) honors.add('Blue Ribbon (2 Ribbons)');
    if (r.ccw_chef) honors.add('Culinary Class Wars');
  });

  renderChipRow(elements.districtFilters, Array.from(districts).sort(), 'district');
  renderChipRow(elements.cuisineFilters, Array.from(cuisines).sort(), 'cuisine');
  renderChipRow(elements.mealFilters, ['All', 'Breakfast', 'Lunch', 'Dinner'], 'meal');
  renderChipRow(elements.themeFilters, Array.from(themes).sort(), 'theme');
  
  // Sort honors specifically
  const sortedHonors = ['All'];
  if (honors.has('Michelin Star')) sortedHonors.push('Michelin Star');
  if (honors.has('Bib Gourmand')) sortedHonors.push('Bib Gourmand');
  if (honors.has('Blue Ribbon (3 Ribbons)')) sortedHonors.push('Blue Ribbon (3 Ribbons)');
  if (honors.has('Blue Ribbon (2 Ribbons)')) sortedHonors.push('Blue Ribbon (2 Ribbons)');
  if (honors.has('Blue Ribbon') && !honors.has('Blue Ribbon (3 Ribbons)') && !honors.has('Blue Ribbon (2 Ribbons)')) sortedHonors.push('Blue Ribbon');
  if (honors.has('Culinary Class Wars')) sortedHonors.push('Culinary Class Wars');
  
  renderChipRow(elements.honorFilters, sortedHonors, 'honor');
}

function renderChipRow(container, items, filterKey) {
  if (!container) return;
  container.innerHTML = '';
  
  items.forEach(item => {
    const chip = document.createElement('button');
    chip.className = `chip${state.filters[filterKey] === item ? ' is-active' : ''}`;
    chip.textContent = item;
    chip.dataset.value = item;
    chip.addEventListener('click', () => {
      state.filters[filterKey] = item;
      container.querySelectorAll('.chip').forEach(c => {
        c.classList.toggle('is-active', c.dataset.value === item);
      });
      applyFilters();
    });
    container.appendChild(chip);
  });
}

// --- Filtering & Rendering ---
function applyFilters() {
  state.visibleRestaurants = state.allRestaurants.filter(r => {
    const searchable = [
      r.name, r.name_en, r.district_en, r.cuisine, r.theme_en, r.description_en, r.address
    ].filter(Boolean).join(' ').toLowerCase();

    const matchesSearch = !state.filters.search || searchable.includes(state.filters.search);
    const matchesDistrict = state.filters.district === 'All' || r.district_en === state.filters.district;
    const matchesCuisine = state.filters.cuisine === 'All' || r.cuisine === state.filters.cuisine;
    const matchesMeal = state.filters.meal === 'All' || (r.meal_times && r.meal_times.includes(state.filters.meal));
    const matchesTheme = state.filters.theme === 'All' || r.theme_en === state.filters.theme;
    
    let matchesHonor = state.filters.honor === 'All';
    if (!matchesHonor) {
      if (state.filters.honor === 'Michelin Star') matchesHonor = !!(r.michelin && r.michelin.includes('Star'));
      if (state.filters.honor === 'Bib Gourmand') matchesHonor = !!(r.michelin && r.michelin.includes('Bib'));
      if (state.filters.honor === 'Blue Ribbon (3 Ribbons)') matchesHonor = r.ribbons === 3;
      if (state.filters.honor === 'Blue Ribbon (2 Ribbons)') matchesHonor = r.ribbons === 2 || (r.honors && r.honors.includes('Blue Ribbon (2 Ribbons)'));
      if (state.filters.honor === 'Blue Ribbon') matchesHonor = !!r.ribbons;
      if (state.filters.honor === 'Culinary Class Wars') matchesHonor = !!r.ccw_chef;
    }

    return matchesSearch && matchesDistrict && matchesCuisine && matchesMeal && matchesTheme && matchesHonor;
  });

  // Reorder if something is selected
  if (state.selectedId !== null) {
    const selectedIdx = state.visibleRestaurants.findIndex(r => r.id === state.selectedId);
    if (selectedIdx > -1) {
      const selected = state.visibleRestaurants.splice(selectedIdx, 1)[0];
      state.visibleRestaurants.unshift(selected);
    }
  }

  renderList();
  updateMarkers();
  elements.visibleCount.textContent = `${state.visibleRestaurants.length} visible`;
}

function renderList() {
  elements.list.innerHTML = '';

  if (state.visibleRestaurants.length === 0) {
    elements.list.innerHTML = '<div class="empty-state"><p>No restaurants match your filters.</p></div>';
    return;
  }

  state.visibleRestaurants.forEach((r, index) => {
    const card = document.createElement('article');
    card.className = 'restaurant-card';
    if (r.id === state.selectedId) card.classList.add('is-selected');
    card.id = `restaurant-${r.id}`;
    
    // Ribbon logic
    let ribbonHtml = '';
    const ribbonCount = r.ribbons || (r.honors && r.honors.includes('Blue Ribbon (2 Ribbons)') ? 2 : 0);
    if (ribbonCount > 0) {
        ribbonHtml = `<span class="badge badge--ribbon" title="${ribbonCount} Blue Ribbons">${'💙'.repeat(ribbonCount)}</span>`;
    }

    card.innerHTML = `
      <div class="restaurant-card__top">
        <div>
          <h3>${r.name_en || r.name}</h3>
          <p class="restaurant-card__subtitle-kr">${r.name}</p>
        </div>
        <div class="badges">
          ${r.michelin ? `<span class="badge badge--michelin" title="${r.michelin}">${r.michelin.includes('Star') ? '★'.repeat(parseInt(r.michelin)) : 'Bib'}</span>` : ''}
          ${ribbonHtml}
          ${r.ccw_chef ? `<span class="badge badge--ccw" title="Chef ${r.ccw_chef} from Culinary Class Wars">CCW</span>` : ''}
        </div>
      </div>
      <p class="restaurant-card__meta">${r.category_en || r.category} • ${r.district_en || r.district}</p>
      <p class="restaurant-card__address">${r.address}</p>
      <p class="restaurant-card__desc">${r.description_en || r.description || ''}</p>
      <div class="card-actions">
        <a href="${getGoogleMapsUrl(r)}" target="_blank" data-kind="primary">Google Maps</a>
        <a href="${getNaverMapUrl(r)}" target="_blank">Naver</a>
        <a href="${getKakaoMapUrl(r)}" target="_blank">Kakao</a>
      </div>
    `;
    card.addEventListener('click', () => {
      state.selectedId = r.id;
      state.map.flyTo([r.lat, r.lng], 16);
      applyFilters(); // Reorder list
    });
    elements.list.appendChild(card);
  });
}

function updateMarkers() {
  state.markers.forEach(m => state.map.removeLayer(m));
  state.markers = [];

  state.visibleRestaurants.forEach((r) => {
    if (!r.lat || !r.lng) return;
    const marker = L.marker([r.lat, r.lng]).addTo(state.map);
    
    marker.on('click', () => {
      state.selectedId = r.id;
      applyFilters(); // This will move r to top of list and re-render
      elements.list.scrollTop = 0; // Ensure we are at the top to see the selected item
    });

    // Ribbon logic for popup
    let ribbonHtml = '';
    const ribbonCount = r.ribbons || (r.honors && r.honors.includes('Blue Ribbon (2 Ribbons)') ? 2 : 0);
    if (ribbonCount > 0) {
        ribbonHtml = `<span class="badge badge--ribbon" style="font-size: 10px; padding: 1px 4px;">${'💙'.repeat(ribbonCount)}</span>`;
    }

    marker.bindPopup(`
      <div class="popup-content">
        <div class="popup-header">
          <strong>${r.name_en || r.name}</strong>
          <div class="popup-badges">
            ${r.michelin ? `<span class="badge badge--michelin" style="font-size: 10px; padding: 1px 4px;">${r.michelin.includes('Star') ? '★'.repeat(parseInt(r.michelin)) : 'Bib'}</span>` : ''}
            ${ribbonHtml}
            ${r.ccw_chef ? `<span class="badge badge--ccw" style="font-size: 10px; padding: 1px 4px;">CCW</span>` : ''}
          </div>
        </div>
        <p style="font-size: 12px; color: #666; margin: 4px 0;">${r.category_en || r.category}</p>
        <p style="font-size: 13px; line-height: 1.4; margin-bottom: 8px;">${r.description_en ? r.description_en.substring(0, 80) + '...' : ''}</p>
        <div class="popup-actions" style="display: flex; gap: 8px;">
          <a href="${getGoogleMapsUrl(r)}" target="_blank" style="font-size: 11px; color: #3b82f6; text-decoration: none; font-weight: 600;">Google Maps</a>
          <a href="${getNaverMapUrl(r)}" target="_blank" style="font-size: 11px; color: #3b82f6; text-decoration: none; font-weight: 600;">Naver</a>
        </div>
      </div>
    `);
    
    state.markers.push(marker);
  });
}

// --- Helper Functions ---
function resetFilters(shouldApply = true) {
  state.filters = {
    search: '',
    district: 'All',
    cuisine: 'All',
    meal: 'All',
    theme: 'All',
    honor: 'All'
  };
  
  elements.searchInput.value = '';
  document.querySelectorAll('.chip').forEach(c => c.classList.toggle('is-active', c.dataset.value === 'All'));
  
  if (shouldApply) applyFilters();
}

function fitMapToMarkers() {
  if (state.markers.length === 0) return;
  const group = L.featureGroup(state.markers);
  state.map.fitBounds(group.getBounds(), { padding: [50, 50] });
}

function useMyLocation() {
  if (!navigator.geolocation) return alert('Geolocation is not supported by your browser.');
  
  navigator.geolocation.getCurrentPosition(pos => {
    const { latitude, longitude } = pos.coords;
    state.map.flyTo([latitude, longitude], 14);
    L.marker([latitude, longitude], {
      icon: L.divIcon({
        className: 'my-location-marker',
        html: '<div style="width: 12px; height: 12px; background: #3b82f6; border: 2px solid white; border-radius: 50%; box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.3);"></div>'
      })
    }).addTo(state.map);
  });
}

function getGoogleMapsUrl(r) {
  if (r.google_directions_url) return r.google_directions_url;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(r.name_en || r.name)}&query_place_id=${r.lat},${r.lng}`;
}

function getNaverMapUrl(r) {
  if (r.naver_map_url) return r.naver_map_url;
  return `https://map.naver.com/v5/search/${encodeURIComponent(r.name)}`;
}

function getKakaoMapUrl(r) {
  if (r.kakao_map_url) return r.kakao_map_url;
  return `https://map.kakao.com/link/search/${encodeURIComponent(r.name)}`;
}

// Start the app
document.addEventListener('DOMContentLoaded', init);
