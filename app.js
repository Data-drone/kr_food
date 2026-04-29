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
  theme: "All",
  userLocation: null,
};

const elements = {
  datasetCount: document.querySelector("#dataset-count"),
  visibleCount: document.querySelector("#visible-count"),
  sourceStamp: document.querySelector("#source-stamp"),
  searchInput: document.querySelector("#search-input"),
  districtFilters: document.querySelector("#district-filters"),
  themeFilters: document.querySelector("#theme-filters"),
  list: document.querySelector("#restaurant-list"),
  locateBtn: document.querySelector("#locate-btn"),
  resetBtn: document.querySelector("#reset-btn"),
  statusBanner: document.querySelector("#status-banner"),
  fitBtn: document.querySelector("#fit-btn"),
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
  const response = await fetch(DATA_URL);
  if (!response.ok) {
    throw new Error(`Dataset request failed: ${response.status}`);
  }

  const payload = await response.json();
  state.restaurants = payload.restaurants;
  state.visibleRestaurants = [...state.restaurants];

  elements.datasetCount.textContent = `${payload.count} places`;
  elements.sourceStamp.textContent = `Source updated ${formatFetchTime(payload.source?.fetchedAt)}`;

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
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    const matchesSearch = !search || searchable.includes(search);
    const matchesDistrict =
      state.district === "All" || restaurant.district === state.district;
    const matchesTheme = state.theme === "All" || restaurant.theme === state.theme;
    return matchesSearch && matchesDistrict && matchesTheme;
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
            [restaurant.category_en || restaurant.category, restaurant.district_en || restaurant.district].filter(Boolean).join(" · ")
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
      });
    });

    card
      .querySelector('[data-action="naver"]')
      .addEventListener("click", () => openNaver(restaurant));
    card
      .querySelector('[data-action="share"]')
      .addEventListener("click", () => shareRestaurant(restaurant));

    fragment.appendChild(card);
  });

  elements.list.appendChild(fragment);
}

function renderMarkers() {
  markerLayer.clearLayers();
  const bounds = [];

  state.visibleRestaurants.forEach((restaurant) => {
    const marker = L.marker([restaurant.lat, restaurant.lng], {
      icon: L.divIcon({
        className: "",
        html: `<div class="marker-dot" style="background:${themeColors[restaurant.theme] || "#0f5b91"}"></div>`,
        iconSize: [16, 16],
        iconAnchor: [8, 8],
      }),
    });

    marker.on("click", () => {
      state.selectedId = restaurant.id;
      renderList();
    });

    marker.bindPopup(renderPopup(restaurant), {
      maxWidth: 280,
    });

    marker.addTo(markerLayer);
    bounds.push([restaurant.lat, restaurant.lng]);

    if (restaurant.id === state.selectedId) {
      marker.openPopup();
    }
  });

  if (userMarker && state.userLocation) {
    bounds.push([state.userLocation.lat, state.userLocation.lng]);
  }

  if (bounds.length === 1) {
    map.setView(bounds[0], 15);
  }
}

function renderPopup(restaurant) {
  const wrapper = document.createElement("div");
  wrapper.className = "popup-content";
  wrapper.innerHTML = `
    <h3>${escapeHtml(restaurant.name_en || restaurant.name)}</h3>
    <p class="popup-subtitle-kr">${escapeHtml(restaurant.name)}</p>
    <p>${escapeHtml([restaurant.category_en || restaurant.category, restaurant.theme_en || restaurant.theme].filter(Boolean).join(" · "))}</p>
    <p>${escapeHtml(restaurant.address)}</p>
    <div class="popup-actions">
      <a href="${restaurant.links.googleDirections}" target="_blank" rel="noreferrer" data-kind="primary">Google</a>
      <button type="button" data-action="naver">Naver</button>
      <a href="${restaurant.links.kakaoDirections}" target="_blank" rel="noreferrer">Kakao</a>
    </div>
  `;

  wrapper.querySelector('[data-action="naver"]').addEventListener("click", () => {
    openNaver(restaurant);
  });

  return wrapper;
}

function focusRestaurant(id) {
  const restaurant = state.visibleRestaurants.find((item) => item.id === id);
  if (!restaurant) {
    return;
  }

  state.selectedId = id;
  renderList();
  renderMarkers();
  map.flyTo([restaurant.lat, restaurant.lng], 16, {
    duration: 0.7,
  });
}

function fitVisibleMarkers() {
  const points = state.visibleRestaurants.map((restaurant) => [restaurant.lat, restaurant.lng]);
  if (state.userLocation) {
    points.push([state.userLocation.lat, state.userLocation.lng]);
  }

  if (!points.length) {
    map.setView(BUSAN_CENTER, 11);
    return;
  }

  if (points.length === 1) {
    map.setView(points[0], 15);
    return;
  }

  map.fitBounds(points, {
    padding: [32, 32],
  });
}

function locateUser() {
  if (!navigator.geolocation) {
    showStatus("Geolocation is not available in this browser.");
    return;
  }

  elements.locateBtn.disabled = true;
  elements.locateBtn.textContent = "Locating…";

  navigator.geolocation.getCurrentPosition(
    (position) => {
      state.userLocation = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      };

      if (userMarker) {
        userMarker.remove();
      }

      userMarker = L.marker([state.userLocation.lat, state.userLocation.lng], {
        icon: L.divIcon({
          className: "",
          html: '<div class="user-marker"></div>',
          iconSize: [18, 18],
          iconAnchor: [9, 9],
        }),
      })
        .addTo(map)
        .bindPopup("Your location");

      elements.locateBtn.textContent = "Location enabled";
      hideStatus();
      applyFilters();
      fitVisibleMarkers();
    },
    () => {
      elements.locateBtn.disabled = false;
      elements.locateBtn.textContent = "Use my location";
      showStatus("Location permission was denied or unavailable.");
    },
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 300000,
    }
  );
}

function resetFilters() {
  state.search = "";
  state.district = "All";
  state.theme = "All";
  state.selectedId = null;
  elements.searchInput.value = "";
  elements.districtFilters.querySelectorAll(".chip").forEach((chip) => {
    chip.classList.toggle("is-active", chip.dataset.value === "All");
  });
  elements.themeFilters.querySelectorAll(".chip").forEach((chip) => {
    chip.classList.toggle("is-active", chip.dataset.value === "All");
  });
  applyFilters();
  fitVisibleMarkers();
}

function openNaver(restaurant) {
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  if (!isMobile) {
    window.open(restaurant.links.naverMap, "_blank", "noopener,noreferrer");
    return;
  }

  const fallback = window.setTimeout(() => {
    window.open(restaurant.links.naverMap, "_blank", "noopener,noreferrer");
  }, 900);

  window.location.href = restaurant.links.naverDirections;
  window.setTimeout(() => {
    window.clearTimeout(fallback);
  }, 1400);
}

async function shareRestaurant(restaurant) {
  const shareUrl = restaurant.links.googleSearch;
  const shareText = `${restaurant.name}\n${restaurant.address}`;
  if (navigator.share) {
    try {
      await navigator.share({
        title: restaurant.name,
        text: shareText,
        url: shareUrl,
      });
      return;
    } catch (error) {
      if (error?.name === "AbortError") {
        return;
      }
    }
  }

  const clipboardText = `${restaurant.name}\n${restaurant.address}\n${shareUrl}`;
  try {
    await navigator.clipboard.writeText(clipboardText);
    showStatus(`Copied ${restaurant.name} to the clipboard.`);
    window.setTimeout(hideStatus, 2000);
  } catch {
    window.open(shareUrl, "_blank", "noopener,noreferrer");
  }
}

function renderEmptyState() {
  const wrapper = document.createElement("div");
  wrapper.className = "empty-state";
  wrapper.innerHTML = `
    <h3>No matching places</h3>
    <p>Try a broader keyword or clear the district and theme filters.</p>
  `;
  return wrapper;
}

function showStatus(message) {
  elements.statusBanner.hidden = false;
  elements.statusBanner.textContent = message;
}

function hideStatus() {
  elements.statusBanner.hidden = true;
  elements.statusBanner.textContent = "";
}

function formatFetchTime(value) {
  if (!value) {
    return "recently";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "recently";
  }

  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

function getDistanceKm(lat1, lng1, lat2, lng2) {
  const toRad = (value) => (value * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
