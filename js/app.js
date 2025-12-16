/**
 * Brooklyn Catholic Parishes Timeline
 * Main Application JavaScript
 */

// ==================== CONFIGURATION CONSTANTS ====================
const CONFIG = {
    // Timeline boundaries
    MIN_YEAR: 1822,
    MAX_YEAR: 2025,
    
    // Map settings
    MAP_CENTER: [40.6501, -73.9496],
    MAP_DEFAULT_ZOOM: 12,
    MAP_DETAIL_ZOOM: 15,
    MAP_MAX_ZOOM: 19,
    
    // Voronoi bounding box (slightly larger than Kings County)
    VORONOI_BBOX: [-74.06, 40.56, -73.83, 40.74],
    
    // Search settings
    AUTOCOMPLETE_MIN_CHARS: 2,
    AUTOCOMPLETE_MAX_RESULTS: 8,
    AUTOCOMPLETE_HIDE_DELAY_MS: 200,
    ADDRESS_MIN_CHARS: 3,
    GEOCODE_TIMEOUT_MS: 15000,
    
    // Map tile URL
    TILE_URL: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    TILE_SUBDOMAINS: 'abcd',
    
    // Marker colors
    COLORS: {
        ACTIVE_PARISH: '#d4a853',
        CLOSED_PARISH: '#6b7280',
        SEARCH_MARKER: '#ef4444',
        MARKER_BORDER: '#16213e',
        VORONOI_FILL: '#d4a853',
        VORONOI_STROKE: 'rgba(212, 168, 83, 0.35)',
        COUNTY_BORDER: 'rgba(74, 111, 165, 0.3)'
    },
    
    // Marker sizes
    MARKER_RADIUS: 7,
    SEARCH_MARKER_RADIUS: 8,
    
    // API endpoints
    NOMINATIM_URL: 'https://nominatim.openstreetmap.org/search'
};

// ==================== UTILITY FUNCTIONS ====================

/**
 * Escapes HTML special characters to prevent XSS attacks
 * @param {string|number|null|undefined} text - The text to escape
 * @returns {string} - The escaped text safe for innerHTML
 */
function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
}

// ==================== APPLICATION STATE ====================
const AppState = {
    // Map layers
    map: null,
    layers: {
        markers: null,
        voronoi: null,
        searchMarker: null
    },
    
    // Data
    parishes: [],
    kingsCountyBoundary: null,
    currentVoronoiFeatures: null,
    
    // Filters
    filters: {
        yearStart: CONFIG.MIN_YEAR,
        yearEnd: CONFIG.MAX_YEAR,
        origin: 'all'
    },
    
    // UI state
    ui: {
        showBoundaries: true
    }
};

// ==================== DATA LOADING ====================

/**
 * Load parishes data from JSON file
 */
async function loadParishesData() {
    try {
        const response = await fetch('data/parishes.json');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        AppState.parishes = await response.json();
        return true;
    } catch (error) {
        console.error('Failed to load parishes data:', error);
        // Fallback: data might be inline
        return false;
    }
}

/**
 * Load Kings County boundary from JSON file
 */
async function loadBoundaryData() {
    try {
        const response = await fetch('data/kings-county-boundary.json');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        AppState.kingsCountyBoundary = await response.json();
        return true;
    } catch (error) {
        console.error('Failed to load boundary data:', error);
        return false;
    }
}

// ==================== MAP FUNCTIONS ====================

/**
 * Initialize the Leaflet map
 */
function initMap() {
    AppState.map = L.map('map', {
        zoomControl: true,
        attributionControl: true
    }).setView(CONFIG.MAP_CENTER, CONFIG.MAP_DEFAULT_ZOOM);

    // Add tile layer
    L.tileLayer(CONFIG.TILE_URL, {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: CONFIG.TILE_SUBDOMAINS,
        maxZoom: CONFIG.MAP_MAX_ZOOM
    }).addTo(AppState.map);

    // Initialize layer groups
    AppState.layers.markers = L.layerGroup().addTo(AppState.map);
    AppState.layers.voronoi = L.layerGroup().addTo(AppState.map);
    AppState.layers.searchMarker = L.layerGroup().addTo(AppState.map);
    
    // Draw county boundary
    if (AppState.kingsCountyBoundary) {
        L.geoJSON(AppState.kingsCountyBoundary, {
            style: {
                fillColor: 'transparent',
                fillOpacity: 0,
                color: CONFIG.COLORS.COUNTY_BORDER,
                weight: 2,
                dashArray: '5, 5'
            }
        }).addTo(AppState.map);
    }
    
    updateMap();
}

/**
 * Get parishes filtered by current criteria
 */
function getFilteredParishes() {
    return AppState.parishes.filter(p => {
        const estYear = p.est;
        const closedYear = p.closed || CONFIG.MAX_YEAR;
        
        // Time filter
        const inTimeRange = estYear <= AppState.filters.yearEnd && closedYear >= AppState.filters.yearStart;
        
        // Origin filter
        const matchesOrigin = AppState.filters.origin === 'all' || p.origin === AppState.filters.origin;
        
        return inTimeRange && matchesOrigin;
    });
}

/**
 * Create Voronoi boundaries clipped to Kings County
 */
function createVoronoiBoundaries(activeParishes) {
    if (activeParishes.length < 3 || !AppState.kingsCountyBoundary) return null;
    
    const points = turf.featureCollection(
        activeParishes.map(p => turf.point([p.lng, p.lat], { id: p.id, name: p.name }))
    );
    
    try {
        const voronoi = turf.voronoi(points, { bbox: CONFIG.VORONOI_BBOX });
        
        if (!voronoi || !voronoi.features) {
            console.error('Voronoi generation failed');
            return null;
        }
        
        // Clip Voronoi cells to Kings County boundary
        const clippedFeatures = [];
        
        voronoi.features.forEach((feature, i) => {
            if (!feature || !feature.geometry) return;
            
            try {
                const clipped = turf.intersect(feature, AppState.kingsCountyBoundary);
                
                if (clipped) {
                    clipped.properties = activeParishes[i] ? {
                        id: activeParishes[i].id,
                        name: activeParishes[i].name,
                        parish: activeParishes[i]
                    } : {};
                    clippedFeatures.push(clipped);
                }
            } catch (e) {
                console.warn('Intersection failed for parish:', activeParishes[i]?.name, e);
            }
        });
        
        return turf.featureCollection(clippedFeatures);
    } catch (e) {
        console.error('Voronoi error:', e);
        return null;
    }
}

/**
 * Find the parish containing a given point
 */
function findParishForPoint(lat, lng) {
    if (!AppState.currentVoronoiFeatures) return null;
    
    const point = turf.point([lng, lat]);
    
    for (const feature of AppState.currentVoronoiFeatures.features) {
        if (feature && feature.geometry) {
            try {
                if (turf.booleanPointInPolygon(point, feature)) {
                    return feature.properties.parish || null;
                }
            } catch (e) {
                continue;
            }
        }
    }
    return null;
}

/**
 * Update map display based on current filters
 */
function updateMap() {
    AppState.layers.markers.clearLayers();
    AppState.layers.voronoi.clearLayers();
    
    const activeParishes = getFilteredParishes();
    
    // Add Voronoi boundaries
    if (AppState.ui.showBoundaries && activeParishes.length >= 3) {
        const voronoi = createVoronoiBoundaries(activeParishes);
        AppState.currentVoronoiFeatures = voronoi;
        
        if (voronoi) {
            L.geoJSON(voronoi, {
                style: {
                    fillColor: CONFIG.COLORS.VORONOI_FILL,
                    fillOpacity: 0.06,
                    color: CONFIG.COLORS.VORONOI_STROKE,
                    weight: 1.5
                },
                onEachFeature: (feature, layer) => {
                    if (feature.properties && feature.properties.name) {
                        layer.bindTooltip(feature.properties.name, {
                            permanent: false,
                            direction: 'center',
                            className: 'voronoi-tooltip'
                        });
                    }
                }
            }).addTo(AppState.layers.voronoi);
        }
    } else {
        AppState.currentVoronoiFeatures = null;
    }
    
    // Add markers
    activeParishes.forEach(parish => {
        const isClosed = parish.closed && parish.closed <= AppState.filters.yearEnd;
        const markerColor = isClosed ? CONFIG.COLORS.CLOSED_PARISH : CONFIG.COLORS.ACTIVE_PARISH;
        
        const marker = L.circleMarker([parish.lat, parish.lng], {
            radius: CONFIG.MARKER_RADIUS,
            fillColor: markerColor,
            color: CONFIG.COLORS.MARKER_BORDER,
            weight: 2,
            opacity: 1,
            fillOpacity: 0.9
        });
        
        const popupContent = `
            <div class="popup-content">
                <h3>${escapeHtml(parish.name)}</h3>
                <p>${escapeHtml(parish.address)}</p>
                ${parish.origin ? `<span class="origin-badge">${escapeHtml(parish.origin)}</span>` : ''}
                <p class="dates">
                    Est. ${escapeHtml(parish.est)}${parish.closed ? ` • Closed ${escapeHtml(parish.closed)}` : ' • Active'}
                </p>
                ${parish.note ? `<p><em>${escapeHtml(parish.note)}</em></p>` : ''}
            </div>
        `;
        
        marker.bindPopup(popupContent, { className: 'custom-popup' });
        marker.parishId = parish.id;
        marker.addTo(AppState.layers.markers);
    });
    
    // Update stats
    const activeCount = activeParishes.filter(p => !p.closed || p.closed > AppState.filters.yearEnd).length;
    const closedCount = activeParishes.filter(p => p.closed && p.closed <= AppState.filters.yearEnd).length;
    
    document.getElementById('active-count').textContent = activeCount;
    document.getElementById('closed-count').textContent = closedCount;
    
    // Update parish list
    updateParishList(activeParishes);
}

/**
 * Update the sidebar parish list
 */
function updateParishList(activeParishes) {
    const listContainer = document.getElementById('parish-list');
    const sorted = [...activeParishes].sort((a, b) => a.est - b.est);
    
    listContainer.innerHTML = `
        <div class="list-header">Parishes (${escapeHtml(sorted.length)})</div>
        ${sorted.map(p => `
            <div class="parish-item" data-id="${escapeHtml(p.id)}">
                <div class="parish-name">${escapeHtml(p.name)}</div>
                <div class="parish-meta">${escapeHtml(p.address)}</div>
                <div class="parish-badges">
                    <span class="parish-badge dates">${escapeHtml(p.est)}${p.closed ? ` – ${escapeHtml(p.closed)}` : ' – present'}</span>
                    ${p.origin ? `<span class="parish-badge origin">${escapeHtml(p.origin)}</span>` : ''}
                </div>
            </div>
        `).join('')}
    `;
    
    // Add click handlers
    document.querySelectorAll('.parish-item').forEach(item => {
        item.addEventListener('click', () => {
            const id = parseInt(item.dataset.id);
            selectParish(id);
        });
    });
}

/**
 * Select and zoom to a parish
 */
function selectParish(id) {
    const parish = AppState.parishes.find(p => p.id === id);
    if (parish) {
        AppState.map.setView([parish.lat, parish.lng], CONFIG.MAP_DETAIL_ZOOM);
        AppState.layers.markers.eachLayer(layer => {
            if (layer.parishId === id) {
                layer.openPopup();
            }
        });
    }
}

// ==================== SEARCH FUNCTIONALITY ====================

/**
 * Initialize parish search autocomplete
 */
function initParishSearch() {
    const parishSearch = document.getElementById('parish-search');
    const parishAutocomplete = document.getElementById('parish-autocomplete');
    
    parishSearch.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();
        
        if (query.length < CONFIG.AUTOCOMPLETE_MIN_CHARS) {
            parishAutocomplete.classList.remove('active');
            return;
        }
        
        const queryWords = query.split(/\s+/).filter(w => w.length > 0);
        
        const matches = AppState.parishes.filter(p => {
            const searchText = `${p.name} ${p.address}`.toLowerCase();
            return queryWords.every(word => searchText.includes(word));
        }).slice(0, CONFIG.AUTOCOMPLETE_MAX_RESULTS);
        
        if (matches.length > 0) {
            parishAutocomplete.innerHTML = matches.map(p => `
                <div class="autocomplete-item" data-id="${escapeHtml(p.id)}">
                    <div class="autocomplete-name">${escapeHtml(p.name)}</div>
                    <div class="autocomplete-meta">${escapeHtml(p.address)} • Est. ${escapeHtml(p.est)}</div>
                </div>
            `).join('');
            parishAutocomplete.classList.add('active');
            
            parishAutocomplete.querySelectorAll('.autocomplete-item').forEach(item => {
                item.addEventListener('click', () => {
                    const id = parseInt(item.dataset.id);
                    selectParish(id);
                    parishSearch.value = '';
                    parishAutocomplete.classList.remove('active');
                });
            });
        } else {
            parishAutocomplete.classList.remove('active');
        }
    });
    
    parishSearch.addEventListener('blur', () => {
        setTimeout(() => parishAutocomplete.classList.remove('active'), CONFIG.AUTOCOMPLETE_HIDE_DELAY_MS);
    });
}

/**
 * Initialize address search with geocoding
 */
function initAddressSearch() {
    const addressSearch = document.getElementById('address-search');
    const addressResult = document.getElementById('address-result');
    const addressSearchBtn = document.getElementById('address-search-btn');
    
    function setSearchLoading(isLoading) {
        addressSearchBtn.disabled = isLoading;
        addressSearchBtn.classList.toggle('loading', isLoading);
    }
    
    async function performAddressSearch() {
        const query = addressSearch.value.trim();
        
        if (query.length < CONFIG.ADDRESS_MIN_CHARS) {
            addressResult.innerHTML = `
                <div class="address-result-title">Error</div>
                <div class="address-result-parish" style="font-size: 0.9rem;">Please enter a full address</div>
            `;
            addressResult.classList.add('active');
            return;
        }
        
        setSearchLoading(true);
        addressResult.innerHTML = `
            <div class="address-result-title">Searching...</div>
            <div class="address-result-parish" style="font-size: 0.85rem; color: var(--text-secondary);">
                Looking up address in Brooklyn...
            </div>
        `;
        addressResult.classList.add('active');
        
        await geocodeAddress(query);
    }
    
    async function geocodeAddress(query) {
        const startTime = Date.now();
        
        try {
            const searchQuery = query.includes('Brooklyn') ? query : `${query}, Brooklyn, NY`;
            
            const params = new URLSearchParams({
                format: 'json',
                q: searchQuery,
                addressdetails: '1',
                limit: '1',
                countrycodes: 'us',
                viewbox: '-74.05,40.75,-73.82,40.55',
                bounded: '1'
            });
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), CONFIG.GEOCODE_TIMEOUT_MS);
            
            const response = await fetch(
                `${CONFIG.NOMINATIM_URL}?${params}`,
                { 
                    signal: controller.signal,
                    headers: { 'Accept': 'application/json' }
                }
            );
            
            clearTimeout(timeoutId);
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            
            if (response.status === 429) {
                setSearchLoading(false);
                addressResult.innerHTML = `
                    <div class="address-result-title">Rate Limited</div>
                    <div class="address-result-parish" style="font-size: 0.9rem; color: #f59e0b;">
                        Too many requests to the geocoding service
                    </div>
                    <div class="address-result-info">Please wait 30 seconds and try again.</div>
                `;
                return;
            }
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const results = await response.json();
            setSearchLoading(false);
            
            if (results && results.length > 0) {
                const r = results[0];
                const addr = r.address || {};
                const lat = parseFloat(r.lat);
                const lng = parseFloat(r.lon);
                
                const houseNumber = escapeHtml(addr.house_number || '');
                const road = escapeHtml(addr.road || '');
                let displayAddress = '';
                if (houseNumber && road) {
                    displayAddress = `${houseNumber} ${road}`;
                } else if (road) {
                    displayAddress = road;
                } else {
                    displayAddress = escapeHtml(r.display_name.split(',')[0]);
                }
                
                showAddressResult(lat, lng, displayAddress);
                addressSearch.value = displayAddress;
                
            } else {
                addressResult.innerHTML = `
                    <div class="address-result-title">Not Found</div>
                    <div class="address-result-parish" style="font-size: 0.9rem; color: var(--text-secondary);">
                        No address found in Brooklyn
                    </div>
                    <div class="address-result-info">Try adding more details or check spelling (${elapsed}s)</div>
                `;
            }
        } catch (error) {
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            console.error('Geocoding error:', error);
            setSearchLoading(false);
            
            let errorTitle = 'Error';
            let errorMessage = 'Something went wrong';
            let errorHint = 'Please try again';
            
            if (error.name === 'AbortError') {
                errorTitle = 'Timeout';
                errorMessage = `Request took too long (>${elapsed}s)`;
                errorHint = 'The geocoding service is slow. Try again.';
            } else if (error.message.includes('Failed to fetch')) {
                errorTitle = 'Network Error';
                errorMessage = 'Could not connect to geocoding service';
                errorHint = 'Check your internet connection.';
            }
            
            addressResult.innerHTML = `
                <div class="address-result-title">${errorTitle}</div>
                <div class="address-result-parish" style="font-size: 0.9rem; color: #ef4444;">
                    ${errorMessage}
                </div>
                <div class="address-result-info">${errorHint}</div>
            `;
        }
    }
    
    function showAddressResult(lat, lng, displayName) {
        AppState.layers.searchMarker.clearLayers();
        
        const searchMarker = L.circleMarker([lat, lng], {
            radius: CONFIG.SEARCH_MARKER_RADIUS,
            fillColor: CONFIG.COLORS.SEARCH_MARKER,
            color: '#ffffff',
            weight: 3,
            opacity: 1,
            fillOpacity: 0.9
        }).addTo(AppState.layers.searchMarker);
        
        const parish = findParishForPoint(lat, lng);
        
        if (parish) {
            addressResult.innerHTML = `
                <div class="address-result-title">Your Parish</div>
                <div class="address-result-parish">${escapeHtml(parish.name)}</div>
                <div class="address-result-info">${escapeHtml(parish.address)} • Est. ${escapeHtml(parish.est)}${parish.origin ? ` • ${escapeHtml(parish.origin)}` : ''}</div>
            `;
            
            searchMarker.bindPopup(`
                <div class="popup-content">
                    <h3>Your Parish: ${escapeHtml(parish.name)}</h3>
                    <p>${escapeHtml(parish.address)}</p>
                    <p class="dates">Est. ${escapeHtml(parish.est)}</p>
                </div>
            `, { className: 'custom-popup' }).openPopup();
        } else {
            addressResult.innerHTML = `
                <div class="address-result-title">Location Found</div>
                <div class="address-result-parish" style="color: var(--text-secondary);">Outside Parish Boundaries</div>
                <div class="address-result-info">This location is outside the current parish catchment areas.</div>
            `;
        }
        
        addressResult.classList.add('active');
        AppState.map.setView([lat, lng], CONFIG.MAP_DETAIL_ZOOM);
    }
    
    // Event listeners
    addressSearch.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            performAddressSearch();
        }
    });
    
    addressSearchBtn.addEventListener('click', performAddressSearch);
}

// ==================== FILTER CONTROLS ====================

/**
 * Initialize origin filter chips
 */
function initOriginFilters() {
    document.getElementById('origin-filters').addEventListener('click', (e) => {
        if (e.target.classList.contains('filter-chip')) {
            document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
            e.target.classList.add('active');
            AppState.filters.origin = e.target.dataset.origin;
            updateMap();
        }
    });
}

/**
 * Initialize timeline slider
 */
function initSlider() {
    const container = document.getElementById('slider-container');
    const thumbStart = document.getElementById('thumb-start');
    const thumbEnd = document.getElementById('thumb-end');
    const range = document.getElementById('slider-range');
    
    let isDragging = null;
    
    function getPercent(year) {
        return ((year - CONFIG.MIN_YEAR) / (CONFIG.MAX_YEAR - CONFIG.MIN_YEAR)) * 100;
    }
    
    function getYear(percent) {
        return Math.round(CONFIG.MIN_YEAR + (percent / 100) * (CONFIG.MAX_YEAR - CONFIG.MIN_YEAR));
    }
    
    function updateSliderVisuals() {
        const startPercent = getPercent(AppState.filters.yearStart);
        const endPercent = getPercent(AppState.filters.yearEnd);
        
        thumbStart.style.left = `${startPercent}%`;
        thumbEnd.style.left = `${endPercent}%`;
        range.style.left = `${startPercent}%`;
        range.style.width = `${endPercent - startPercent}%`;
        
        document.getElementById('year-start').textContent = AppState.filters.yearStart;
        document.getElementById('year-end').textContent = AppState.filters.yearEnd;
    }
    
    function handleDrag(e) {
        if (!isDragging) return;
        
        const rect = container.getBoundingClientRect();
        const x = (e.clientX || e.touches[0].clientX) - rect.left;
        const percent = Math.max(0, Math.min(100, (x / rect.width) * 100));
        const year = getYear(percent);
        
        if (isDragging === 'start') {
            AppState.filters.yearStart = Math.min(year, AppState.filters.yearEnd - 1);
        } else {
            AppState.filters.yearEnd = Math.max(year, AppState.filters.yearStart + 1);
        }
        
        updateSliderVisuals();
    }
    
    function startDrag(thumb) {
        isDragging = thumb;
        document.body.style.cursor = 'grabbing';
    }
    
    function endDrag() {
        if (isDragging) {
            isDragging = null;
            document.body.style.cursor = '';
            updateMap();
        }
    }
    
    // Mouse events
    thumbStart.addEventListener('mousedown', () => startDrag('start'));
    thumbEnd.addEventListener('mousedown', () => startDrag('end'));
    document.addEventListener('mousemove', handleDrag);
    document.addEventListener('mouseup', endDrag);
    
    // Touch events
    thumbStart.addEventListener('touchstart', (e) => { e.preventDefault(); startDrag('start'); });
    thumbEnd.addEventListener('touchstart', (e) => { e.preventDefault(); startDrag('end'); });
    document.addEventListener('touchmove', handleDrag);
    document.addEventListener('touchend', endDrag);
    
    updateSliderVisuals();
}

/**
 * Initialize boundary toggle
 */
function initBoundaryToggle() {
    document.getElementById('toggle-boundaries').addEventListener('click', function() {
        AppState.ui.showBoundaries = !AppState.ui.showBoundaries;
        this.classList.toggle('active', AppState.ui.showBoundaries);
        this.textContent = AppState.ui.showBoundaries ? 'Show Boundaries' : 'Hide Boundaries';
        updateMap();
    });
}

// ==================== INITIALIZATION ====================

/**
 * Initialize the application
 */
async function initApp() {
    // Load data files
    const [parishesLoaded, boundaryLoaded] = await Promise.all([
        loadParishesData(),
        loadBoundaryData()
    ]);
    
    if (!parishesLoaded || !boundaryLoaded) {
        console.warn('Some data failed to load from external files');
    }
    
    // Initialize components
    initMap();
    initSlider();
    initParishSearch();
    initAddressSearch();
    initOriginFilters();
    initBoundaryToggle();
}

// Start application when DOM is ready
document.addEventListener('DOMContentLoaded', initApp);

