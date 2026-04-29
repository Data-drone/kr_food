const DATA_URL = "./data/restaurants.json";
const BUSAN_CENTER = [35.1796, 129.0756];

const themeColors = {
  "부산의 노포": "#8c5a2c",
  "세계음식": "#0f5b91",
  "시티투어버스 맛집": "#0a7f6f",
  "파인다이닝": "#8c2855",
  "디저트 & 커피": "#cb7b2d",
  "오션뷰 맛집": "#2f7fd8",
};

const themeOrder = [
  "부산의 노포",
  "세계음식",
  "시티투어버스 맛집",
  "파인다이닝",
  "디저트 & 커피",
  "오션뷰 맛집",
];

const state = {
  restaurants: [],
  visibleRestaurants: [],
  selectedId: null,
  search: "",
  district: "All",
  cuisine: "All",
  mealTime: "All",
  theme: "All",
  userLocation: null,
};

const elements = {
  datasetCount: document.querySelector("#dataset-count"),
  visibleCount: document.querySelector("#visible-count"),
  sourceStamp: document.querySelector("#source-stamp"),
  searchInput: document.querySelector("#search-input"),
  districtFilters: document.querySelector("#district-filters"),
  cuisineFilters: document.querySelector("#cuisine-filters"),
  mealFilters: document.querySelector("#meal-filters"),
  themeFilters: document.querySelector("#theme-filters"),
  list: document.querySelector("#restaurant-list"),
  locateBtn: document.querySelector("#locate-btn"),
  resetBtn: document.querySelector("#reset-btn"),
  statusBanner: document.querySelector("#status-banner"),
  fitBtn: document.querySelector("#fit-btn"),
  filterToggle: document.querySelector("#filter-toggle"),
  filterContent: document.querySelector("#filter-content"),
};

const map = L.map("map", {
  zoomControl: false,
});
L.control
  .zoom({
    position: "bottomright",
  })
  .addTo(map);
map.setView(BUSAN_CENTER, 11);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  maxZoom: 19,
}).addTo(map);

const markerLayer = L.layerGroup().addTo(map);
let userMarker = null;

init().catch((error) => {
  console.error(error);
  showStatus("Could not load the restaurant dataset.");
});

async function init() {
  // Main Filter Toggle
  if (elements.filterToggle && elements.filterContent) {
    elements.filterToggle.addEventListener("click", () => {
      const isExpanded = elements.filterToggle.getAttribute("aria-expanded") === "true";
      const newExpanded = !isExpanded;
      
      elements.filterToggle.setAttribute("aria-expanded", newExpanded);
      elements.filterToggle.querySelector(".filter-toggle__text").textContent = newExpanded ? "Hide Filters" : "Show Filters";
      elements.filterContent.classList.toggle("is-collapsed", !newExpanded);
    });
    
    // Auto-collapse on small screens by default
    if (window.innerWidth < 768) {
      elements.filterToggle.click();
    }
  }

  // Individual Filter Group Toggles
  document.querySelectorAll(".toolbar__toggle").forEach(toggle => {
    // Initialize state
    const targetId = toggle.getAttribute("aria-controls");
    const target = document.getElementById(targetId);
    
    // Default to expanded on desktop, collapsed on mobile
    const shouldCollapse = window.innerWidth < 768;
    
    if (shouldCollapse) {
      toggle.setAttribute("aria-expanded", "false");
      if (target) target.classList.add("is-collapsed");
    } else {
      toggle.setAttribute("aria-expanded", "true");
      if (target) target.classList.remove("is-collapsed");
    }

    toggle.addEventListener("click", () => {
      const isExpanded = toggle.getAttribute("aria-expanded") === "true";
      const newExpanded = !isExpanded;
      
      toggle.setAttribute("aria-expanded", newExpanded);
      if (target) {
        target.classList.toggle("is-collapsed", !newExpanded);
      }
    });
  });

  const response = await fetch(DATA_URL);
  if (!response.ok) {
    throw new Error(`Dataset request failed: ${response.status}`);
  }

  const payload = await response.json();
  state.restaurants = payload.restaurants;
  state.visibleRestaurants = [...state.restaurants];

  elements.datasetCount.textContent = `${payload.count} places`;
  elements.sourceStamp.textContent = `Source updated ${formatFetchTime(payload.source?.fetchedAt)}`;

  // Prepare Districts
  const districts = [
    { value: "All", label: "All" },
    ...Array.from(
      new Map(
        state.restaurants
          .filter((r) => r.district)
          .map((r) => [r.district, r.district_en || r.district])
      )
    )
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label)),
  ];

  // Prepare Cuisines
  const cuisines = [
    { value: "All", label: "All" },
    ...Array.from(new Set(state.restaurants.map(r => r.cuisine).filter(Boolean)))
      .sort()
      .map(c => ({ value: c, label: c }))
  ];

  // Prepare Meal Times
  const mealTimes = [
    { value: "All", label: "All" },
    { value: "Breakfast", label: "Breakfast" },
    { value: "Lunch", label: "Lunch" },
    { value: "Dinner", label: "Dinner" }
  ];

  // Prepare Themes
  const themes = [
    { value: "All", label: "All" },
    ...themeOrder
      .filter((theme) => state.restaurants.some((r) => r.theme === theme))
      .map((theme) => {
        const r = state.restaurants.find((r) => r.theme === theme);
        return { value: theme, label: r.theme_en || theme };
      }),
  ];

  buildChipRow(elements.districtFilters, districts, "district");
  buildChipRow(elements.cuisineFilters, cuisines, "cuisine");
  buildChipRow(elements.mealFilters, mealTimes, "mealTime");
  buildChipRow(elements.themeFilters, themes, "theme");

  elements.searchInput.addEventListener("input", (event) => {
    state.search = event.target.value.trim().toLowerCase();
    applyFilters();
  });

  elements.resetBtn.addEventListener("click", () => resetFilters());
  elements.locateBtn.addEventListener("click", () => locateUser());
  elements.fitBtn.addEventListener("click", () => fitVisibleMarkers());

  applyFilters();
  fitVisibleMarkers();
}

function buildChipRow(container, items, key) {
  if (!container) return;
  container.innerHTML = "";
  items.forEach((item) => {
    const value = typeof item === "string" ? item : item.value;
    const label = typeof item === "string" ? item : item.label;

    const button = document.createElement("button");
    button.type = "button";
    button.className = `chip${value === "All" ? " is-active" : ""}`;
    button.textContent = label;
    button.dataset.value = value;
    button.addEventListener("click", () => {
      state[key] = value;
      container.querySelectorAll(".chip").forEach((chip) => {
        chip.classList.toggle("is-active", chip.dataset.value === value);
      });
      applyFilters();
    });
    container.appendChild(button);
  });
}

function applyFilters() {
  const search = state.search;

  state.visibleRestaurants = state.restaurants.filter((restaurant) => {
    const searchable = [
      restaurant.name,
      restaurant.name_en,
      restaurant.district,
      restaurant.district_en,
      restaurant.address,
      restaurant.category,
      restaurant.category_en,
      restaurant.theme,
      restaurant.theme_en,
      restaurant.menu,
      restaurant.menu_en,
      restaurant.cuisine,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    const matchesSearch = !search || searchable.includes(search);
    const matchesDistrict = state.district === "All" || restaurant.district === state.district;
    const matchesCuisine = state.cuisine === "All" || restaurant.cuisine === state.cuisine;
    const matchesMealTime = state.mealTime === "All" || (restaurant.meal_times && restaurant.meal_times.includes(state.mealTime));
    const matchesTheme = state.theme === "All" || restaurant.theme === state.theme;
    
    return matchesSearch && matchesDistrict && matchesCuisine && matchesMealTime && matchesTheme;
  });

  if (state.userLocation) {
    state.visibleRestaurants = state.visibleRestaurants
      .map((restaurant) => ({
        ...restaurant,
        distanceKm: getDistanceKm(
          state.userLocation.lat,
          state.userLocation.lng,
          restaurant.lat,
          restaurant.lng
        ),
      }))
      .sort((a, b) => a.distanceKm - b.distanceKm);
  } else {
    state.visibleRestaurants = state.visibleRestaurants
      .map((restaurant) => ({ ...restaurant, distanceKm: null }))
      .sort((a, b) => a.name.localeCompare(b.name, "ko"));
  }

  if (
    state.selectedId &&
    !state.visibleRestaurants.some((restaurant) => restaurant.id === state.selectedId)
  ) {
    state.selectedId = null;
  }

  renderList();
  renderMarkers();

  elements.visibleCount.textContent = `${state.visibleRestaurants.length} visible`;

  if (state.visibleRestaurants.length) {
    hideStatus();
  } else {
    showStatus("No restaurants match the current filters.");
  }
}

function renderRibbonBadge(restaurant) {
  if (!restaurant.ribbons) {
    return '<div class="ribbon-badge"><span>Blue Ribbon selection</span></div>';
  }

  return `
    <div class="ribbon-badge" aria-label="${restaurant.ribbons} blue ribbons">
      <span class="ribbon-dots">${"•".repeat(restaurant.ribbons)}</span>
      <span>${restaurant.ribbons} Ribbon${restaurant.ribbons > 1 ? "s" : ""}</span>
    </div>
  `;
}

function renderList() {
  elements.list.innerHTML = "";

  if (!state.visibleRestaurants.length) {
    elements.list.appendChild(renderEmptyState());
    return;
  }

  const fragment = document.createDocumentFragment();
  state.visibleRestaurants.forEach((restaurant) => {
    const card = document.createElement("article");
    card.className = `restaurant-card${
      restaurant.id === state.selectedId ? " is-selected" : ""
    }`;
    card.tabIndex = 0;
    card.addEventListener("click", () => focusRestaurant(restaurant.id));
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        focusRestaurant(restaurant.id);
      }
    });

    const description = restaurant.description_en || restaurant.description || restaurant.menu_en || restaurant.menu || "";
    const shortDescription =
      description.length > 120 ? `${description.slice(0, 120)}…` : description;

    card.innerHTML = `
      <div class="restaurant-card__top">
        <div>
          <h3>${escapeHtml(restaurant.name_en || restaurant.name)}</h3>
          <p class="restaurant-card__subtitle-kr">${escapeHtml(restaurant.name)}</p>
          <p class="restaurant-card__subtitle">${escapeHtml(
            [restaurant.cuisine, restaurant.category_en || restaurant.category, restaurant.district_en || restaurant.district].filter(Boolean).join(" · ")
          )}</p>
        </div>
        ${renderRibbonBadge(restaurant)}
      </div>
      <p class="restaurant-card__meta">${escapeHtml(
        [restaurant.theme, restaurant.hours || restaurant.hoursSummary]
          .filter(Boolean)
          .join(" · ")
      )}</p>
      <p class="restaurant-card__address">${escapeHtml(restaurant.address)}</p>
      ${
        shortDescription
          ? `<p class="restaurant-card__desc">${escapeHtml(shortDescription)}</p>`
          : ""
      }
      <div class="restaurant-card__chips">
        ${
          restaurant.distanceKm != null
            ? `<span class="mini-chip">${restaurant.distanceKm.toFixed(1)} km away</span>`
            : ""
        }
        ${restaurant.phone ? `<span class="mini-chip">${escapeHtml(restaurant.phone)}</span>` : ""}
        ${
          restaurant.rating != null
            ? `<span class="mini-chip">Visit Busan ${restaurant.rating.toFixed(1)}</span>`
            : ""
        }
      </div>
      <div class="card-actions">
        <a href="${restaurant.links.googleDirections}" target="_blank" rel="noreferrer" data-kind="primary">Google</a>
        <button type="button" data-action="naver">Naver</button>
        <a href="${restaurant.links.kakaoDirections}" target="_blank" rel="noreferrer">Kakao</a>
        <button type="button" data-action="share">Share</button>
        <a href="${restaurant.visitBusanUrl}" target="_blank" rel="noreferrer">Visit Busan</a>
      </div>
    `;

    card.querySelectorAll(".card-actions a, .card-actions button").forEach((control) => {
      control.addEventListener("click", (event) => {
        event.stopPropagation();
        const action = control.dataset.action;
        if (action === "naver") {
          window.open(restaurant.links.naverMap, "_blank", "noreferrer");
        } else if (action === "share") {
          shareRestaurant(restaurant);
        }
      });
    });

    fragment.appendChild(card);
  });
  elements.list.appendChild(fragment);

  if (state.selectedId) {
    const selectedCard = elements.list.querySelector(".is-selected");
    if (selectedCard) {
      selectedCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }
}

function renderMarkers() {
  markerLayer.clearLayers();
  state.visibleRestaurants.forEach((restaurant) => {
    const isSelected = restaurant.id === state.selectedId;
    const color = themeColors[restaurant.theme] || "#142738";

    const marker = L.circleMarker([restaurant.lat, restaurant.lng], {
      radius: isSelected ? 10 : 7,
      fillColor: color,
      color: "#fff",
      weight: 2,
      opacity: 1,
      fillOpacity: 0.9,
    });

    marker.bindPopup(`
      <div class="map-popup">
        <strong>${escapeHtml(restaurant.name_en || restaurant.name)}</strong><br>
        <small>${escapeHtml(restaurant.name)}</small><br>
        ${escapeHtml(restaurant.cuisine)} · ${escapeHtml(restaurant.district_en || restaurant.district)}
      </div>
    `);

    marker.on("click", () => focusRestaurant(restaurant.id));
    marker.addTo(markerLayer);
  });
}

function focusRestaurant(id) {
  state.selectedId = id;
  const restaurant = state.restaurants.find((r) => r.id === id);
  if (restaurant) {
    map.setView([restaurant.lat, restaurant.lng], 15, { animate: true });
  }
  renderList();
  renderMarkers();
}

function resetFilters() {
  state.search = "";
  state.district = "All";
  state.cuisine = "All";
  state.mealTime = "All";
  state.theme = "All";
  elements.searchInput.value = "";
  document.querySelectorAll(".chip").forEach((chip) => {
    chip.classList.toggle("is-active", chip.dataset.value === "All");
  });
  applyFilters();
}

function locateUser() {
  if (!navigator.geolocation) {
    showStatus("Geolocation is not supported by your browser.");
    return;
  }

  showStatus("Locating...");
  navigator.geolocation.getCurrentPosition(
    (position) => {
      state.userLocation = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      };

      if (userMarker) {
        userMarker.setLatLng([state.userLocation.lat, state.userLocation.lng]);
      } else {
        userMarker = L.marker([state.userLocation.lat, state.userLocation.lng], {
          icon: L.divIcon({
            className: "user-location-marker",
            html: '<div class="user-location-dot"></div>',
          }),
        }).addTo(map);
      }

      hideStatus();
      applyFilters();
      map.setView([state.userLocation.lat, state.userLocation.lng], 13);
    },
    () => {
      showStatus("Could not determine your location.");
    }
  );
}

function fitVisibleMarkers() {
  if (!state.visibleRestaurants.length) return;
  const bounds = L.latLngBounds(
    state.visibleRestaurants.map((r) => [r.lat, r.lng])
  );
  map.fitBounds(bounds, { padding: [50, 50] });
}

function shareRestaurant(restaurant) {
  const text = `${restaurant.name_en || restaurant.name} (${restaurant.name})\n${restaurant.cuisine} in ${restaurant.district_en || restaurant.district}\n${restaurant.address}`;
  if (navigator.share) {
    navigator.share({
      title: restaurant.name_en || restaurant.name,
      text: text,
      url: window.location.href,
    });
  } else {
    navigator.clipboard.writeText(`${text}\n${window.location.href}`);
    showStatus("Restaurant details copied to clipboard.");
    setTimeout(hideStatus, 2000);
  }
}

function formatFetchTime(isoString) {
  if (!isoString) return "unknown";
  const date = new Date(isoString);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function showStatus(message) {
  elements.statusBanner.textContent = message;
  elements.statusBanner.classList.add("is-visible");
}

function hideStatus() {
  elements.statusBanner.classList.remove("is-visible");
}

function renderEmptyState() {
  const div = document.createElement("div");
  div.className = "empty-state";
  div.innerHTML = `
    <p>No restaurants found matching your criteria.</p>
    <button type="button" class="action-button action-button--ghost">Reset all filters</button>
  `;
  div.querySelector("button").addEventListener("click", () => resetFilters());
  return div;
}

function escapeHtml(str) {
  if (!str) return "";
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function getDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) *
      Math.cos(deg2rad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function deg2rad(deg) {
  return deg * (Math.PI / 180);
}
