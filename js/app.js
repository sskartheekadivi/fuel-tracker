let appData = {
    latest: null,
    history: null,
    averages: null
};

let currentChart = null;
let currentCity = 'Bengaluru'; // Default

// Theme Toggling
function initTheme() {
    const toggleBtn = document.getElementById('theme-toggle');
    const icon = document.getElementById('theme-icon');
    
    let savedTheme = localStorage.getItem('theme');
    if (!savedTheme) {
        savedTheme = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    }
    
    document.documentElement.setAttribute('data-theme', savedTheme);
    icon.textContent = savedTheme === 'light' ? '🌙' : '☀️';

    toggleBtn.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        icon.textContent = newTheme === 'light' ? '🌙' : '☀️';
        
        // re-render if chart exists
        if (currentChart) {
            router();
        }
    });
}

function getFuelIcon(fuelName) {
    const lower = fuelName.toLowerCase();
    if (lower.includes('petrol') || lower.includes('e85')) return '⛽';
    if (lower.includes('diesel')) return '🛢️';
    if (lower.includes('xp') || lower.includes('xtra') || lower.includes('speed')) return '⚡';
    return '💧';
}

function getCompanyIcon(companyName) {
    const lower = companyName.toLowerCase();
    if (lower.includes('iocl')) return '🟠';
    if (lower.includes('bpcl')) return '🟡';
    if (lower.includes('hpcl')) return '🔵';
    if (lower.includes('shell')) return '🐚';
    return '🏢';
}

function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
    lat1 = parseFloat(lat1);
    lon1 = parseFloat(lon1);
    lat2 = parseFloat(lat2);
    lon2 = parseFloat(lon2);
    
    const R = 6371; // Radius of the earth in km
    const dLat = (lat2 - lat1) * (Math.PI/180);
    const dLon = (lon2 - lon1) * (Math.PI/180); 
    const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(lat1 * (Math.PI/180)) * Math.cos(lat2 * (Math.PI/180)) * 
        Math.sin(dLon/2) * Math.sin(dLon/2); 
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
    return R * c; // Distance in km
}

async function initGeolocation() {
    return new Promise((resolve) => {
        if (!navigator.geolocation) {
            resolve('Bengaluru');
            return;
        }
        navigator.geolocation.getCurrentPosition(
            async (position) => {
                try {
                    const { latitude, longitude } = position.coords;
                    const res = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`);
                    const data = await res.json();
                    
                    let detectedCity = data.city || data.locality || '';
                    let detectedState = data.principalSubdivision || '';
                    
                    const availableCities = Object.keys(appData.latest.prices);
                    const match = availableCities.find(c => c.toLowerCase() === detectedCity.toLowerCase());
                    
                    if (match) {
                        resolve(match);
                        return;
                    }
                    
                    if (appData.config && appData.config.locations) {
                        let stateLocs = appData.config.locations.filter(l => 
                            detectedState && l.state && l.state.toLowerCase() === detectedState.toLowerCase()
                        );
                        
                        if (stateLocs.length === 0) {
                            console.log(`[Geo] No match for state '${detectedState}'. Checking all 76 cities.`);
                            stateLocs = appData.config.locations;
                        } else {
                            console.log(`[Geo] Found ${stateLocs.length} cities in state '${detectedState}'.`);
                        }
                        
                        let closest = 'Bengaluru';
                        let minDistance = Infinity;
                        
                        stateLocs.forEach(loc => {
                            const dist = getDistanceFromLatLonInKm(latitude, longitude, loc.lat, loc.lon);
                            if (dist < minDistance && availableCities.includes(loc.city)) {
                                minDistance = dist;
                                closest = loc.city;
                            }
                        });
                        
                        console.log(`[Geo] Closest tracked city to user coords (${latitude}, ${longitude}) is ${closest} (${Math.round(minDistance)}km)`);
                        resolve(closest);
                        return;
                    }
                    
                    console.log("[Geo] Config missing, defaulting to Bengaluru");
                    resolve('Bengaluru');
                } catch (e) {
                    console.error("[Geo] Exception during geolocation logic:", e);
                    resolve('Bengaluru');
                }
            },
            (err) => {
                console.warn("Geolocation failed or denied. Defaulting to Bengaluru.");
                resolve('Bengaluru');
            },
            { timeout: 5000 }
        );
    });
}

async function fetchData() {
    try {
        const [latestRes, historyRes, averagesRes, configRes] = await Promise.all([
            fetch('data/latest.json'),
            fetch('data/history.json'),
            fetch('data/averages.json'),
            fetch('config.json')
        ]);
        
        appData.latest = await latestRes.json();
        appData.history = await historyRes.json();
        appData.averages = await averagesRes.json();
        appData.config = await configRes.json();
        
        appData.history.sort((a, b) => new Date(a.date) - new Date(b.date));
        
        // Get Location
        currentCity = await initGeolocation();
        
        populateLocationSelector();
        initRouter();
    } catch (error) {
        console.error("Error fetching data:", error);
        document.getElementById('app-content').innerHTML = `
            <div class="glass-panel" style="text-align: center; color: #ef4444;">
                <h2>Error loading data</h2>
                <p>Could not fetch fuel prices. Please try again later.</p>
            </div>
        `;
    }
}

function populateLocationSelector() {
    const stateSelect = document.getElementById('state-select');
    const citySelect = document.getElementById('city-select');
    
    // Build state -> cities mapping
    const stateToCities = {};
    const cityToState = {};
    
    if (appData.config && appData.config.locations) {
        appData.config.locations.forEach(loc => {
            const state = loc.state || "Other";
            if (!stateToCities[state]) {
                stateToCities[state] = [];
            }
            if (!stateToCities[state].includes(loc.city)) {
                stateToCities[state].push(loc.city);
                cityToState[loc.city] = state;
            }
        });
    } else {
        // Fallback if config is missing
        Object.keys(appData.latest.prices).forEach(c => {
            stateToCities["All"] = stateToCities["All"] || [];
            stateToCities["All"].push(c);
            cityToState[c] = "All";
        });
    }
    
    // Sort states
    const states = Object.keys(stateToCities).sort();
    
    // Populate state dropdown
    let stateHtml = '<option value="">Select State</option>';
    states.forEach(state => {
        stateHtml += `<option value="${state}">${state}</option>`;
    });
    stateSelect.innerHTML = stateHtml;
    
    // Set initial state based on geolocation currentCity
    let currentState = cityToState[currentCity];
    if (currentState) {
        stateSelect.value = currentState;
        updateCityDropdown(currentState);
        citySelect.value = currentCity;
    }
    
    // Handle State change
    stateSelect.addEventListener('change', (e) => {
        const selectedState = e.target.value;
        if (!selectedState) {
            citySelect.innerHTML = '<option value="">Select City</option>';
            return;
        }
        
        updateCityDropdown(selectedState);
        
        // If only one city, auto-select it
        const cities = stateToCities[selectedState];
        if (cities.length === 1) {
            citySelect.value = cities[0];
            citySelect.dispatchEvent(new Event('change'));
        } else {
            // Check if currentCity is in the new state, if so keep it selected
            if (cities.includes(currentCity)) {
                citySelect.value = currentCity;
            } else {
                citySelect.value = "";
            }
        }
    });
    
    // Handle City change
    citySelect.addEventListener('change', (e) => {
        if (!e.target.value) return;
        currentCity = e.target.value;
        window.location.hash = '#/';
        router();
    });
    
    function updateCityDropdown(state) {
        const cities = stateToCities[state].sort();
        let cityHtml = '<option value="">Select City</option>';
        cities.forEach(city => {
            cityHtml += `<option value="${city}">${city}</option>`;
        });
        citySelect.innerHTML = cityHtml;
    }
}

function initRouter() {
    window.addEventListener('hashchange', router);
    router();
}

function router() {
    const hash = window.location.hash || '#/';
    const contentDiv = document.getElementById('app-content');
    contentDiv.innerHTML = '';

    if (hash === '#/') {
        renderPricingCards(contentDiv);
    } else if (hash.startsWith('#/history/city/')) {
        const city = decodeURIComponent(hash.split('/')[3]);
        renderCityHistory(contentDiv, city);
    } else if (hash.startsWith('#/history/company/')) {
        const parts = hash.split('/');
        const company = decodeURIComponent(parts[3]);
        const city = decodeURIComponent(parts[4]);
        renderCompanyHistory(contentDiv, company, city);
    } else {
        renderPricingCards(contentDiv);
    }
}

// ---------------- PRICING CARDS (HOME) ----------------

function renderPricingCards(container) {
    if (!appData.latest.prices[currentCity]) {
        container.innerHTML = `<h2>Data not available for ${currentCity}</h2>`;
        return;
    }

    const cityData = appData.latest.prices[currentCity];
    const companies = Object.keys(cityData).sort();

    let html = `
        <div class="header-actions">
            <div>
                <h1 class="page-title" style="margin-bottom:0;">Fuel Prices Today</h1>
                <p class="text-muted">Prices in ${currentCity} as of ${appData.latest.date}</p>
            </div>
            <a href="#/history/city/${encodeURIComponent(currentCity)}" class="btn btn-outline" style="font-size:1.1rem; padding: 0.75rem 1.5rem;">
                📈 View City History
            </a>
        </div>
        <div class="pricing-cards-container">
    `;

    companies.forEach(company => {
        const fuels = Object.keys(cityData[company]).sort();
        
        html += `
            <div class="pricing-card">
                <div class="card-header">
                    <span class="card-company-icon">${getCompanyIcon(company)}</span>
                    <span class="card-company-name">${company}</span>
                </div>
                <div class="card-body">
        `;
        
        fuels.forEach(fuel => {
            const price = cityData[company][fuel].toFixed(2);
            const wkAvg = appData.averages?.weekly?.[currentCity]?.[company]?.[fuel];
            const isCheaperThanAvg = wkAvg && price < wkAvg;
            const priceClass = isCheaperThanAvg ? 'cheapest' : 'fuel-highlight';
            
            html += `
                <div class="fuel-item">
                    <div class="fuel-info">
                        ${getFuelIcon(fuel)} 
                        <span>${fuel}</span>
                    </div>
                    <div class="fuel-price-wrapper">
                        <div class="fuel-price ${priceClass}">₹${price}</div>
                        ${wkAvg ? `<div class="fuel-avg">7D Avg: ₹${wkAvg.toFixed(2)}</div>` : ''}
                    </div>
                </div>
            `;
        });
        
        html += `
                </div>
                <div class="card-footer">
                    <a href="#/history/company/${encodeURIComponent(company)}/${encodeURIComponent(currentCity)}" class="btn-full">View History & Averages</a>
                </div>
            </div>
        `;
    });

    html += `</div>`;
    container.innerHTML = html;
}

// ---------------- CITY HISTORY ----------------

function renderCityHistory(container, city) {
    if (!appData.latest.prices[city]) return;
    
    // Auto-update select to match
    if (currentCity !== city) {
        currentCity = city;
        document.getElementById('city-select').value = city;
    }

    let html = `
        <div class="mb-4">
            <a href="#/" class="btn btn-outline">&larr; Back to Pricing Cards</a>
        </div>
        <h1 class="page-title">${city} Historical Trends</h1>
        
        <div class="glass-panel mt-4">
            <h2 class="section-title">All Companies & Fuels</h2>
            <div class="chart-container">
                <canvas id="historyChart"></canvas>
            </div>
        </div>
        
        <div class="glass-panel mt-8">
            <h2 class="section-title">Averages Breakdown</h2>
            <div class="table-container">
                <table>
                    <thead>
                        <tr>
                            <th class="text-left">Company</th>
                            <th class="text-left">Fuel</th>
                            <th>Today</th>
                            <th>7-Day Avg</th>
                            <th>30-Day Avg</th>
                        </tr>
                    </thead>
                    <tbody>
    `;

    const cityData = appData.latest.prices[city];
    const companies = Object.keys(cityData).sort();
    
    companies.forEach(company => {
        const fuels = Object.keys(cityData[company]).sort();
        fuels.forEach((fuel, idx) => {
            const today = cityData[company][fuel].toFixed(2);
            const wkAvg = appData.averages?.weekly?.[city]?.[company]?.[fuel];
            const moAvg = appData.averages?.monthly?.[city]?.[company]?.[fuel];
            
            html += `<tr>`;
            if (idx === 0) {
                html += `<td rowspan="${fuels.length}" class="text-left">${getCompanyIcon(company)} ${company}</td>`;
            }
            html += `
                <td class="text-left" ${idx > 0 ? 'style="border-left: 1px solid var(--card-border);"' : ''}>${getFuelIcon(fuel)} ${fuel}</td>
                <td style="font-weight:600; color:var(--primary);">₹${today}</td>
                <td>${wkAvg ? '₹'+wkAvg.toFixed(2) : '-'}</td>
                <td>${moAvg ? '₹'+moAvg.toFixed(2) : '-'}</td>
            </tr>`;
        });
    });

    html += `</tbody></table></div></div>`;
    container.innerHTML = html;

    // Render Chart
    const labels = appData.history.map(entry => entry.date);
    const datasets = [];
    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6'];
    let colorIdx = 0;

    companies.forEach(company => {
        Object.keys(cityData[company]).forEach(fuel => {
            const data = appData.history.map(entry => entry.prices[city]?.[company]?.[fuel] || null);
            datasets.push({
                label: `${company} - ${fuel}`,
                data: data,
                borderColor: colors[colorIdx % colors.length],
                tension: 0.3,
                spanGaps: true
            });
            colorIdx++;
        });
    });

    renderChart('historyChart', labels, datasets);
}

// ---------------- COMPANY HISTORY ----------------

function renderCompanyHistory(container, company, city) {
    if (!appData.latest.prices[city] || !appData.latest.prices[city][company]) return;

    let html = `
        <div class="mb-4">
            <a href="#/" class="btn btn-outline">&larr; Back to Pricing Cards</a>
        </div>
        <h1 class="page-title">${getCompanyIcon(company)} ${company} in ${city}</h1>
        
        <div class="glass-panel mt-4">
            <h2 class="section-title">Price History</h2>
            <div class="chart-container">
                <canvas id="historyChart"></canvas>
            </div>
        </div>
        
        <div class="glass-panel mt-8">
            <h2 class="section-title">Averages Breakdown</h2>
            <div class="table-container">
                <table>
                    <thead>
                        <tr>
                            <th class="text-left">Fuel Type</th>
                            <th>Today</th>
                            <th>7-Day Avg</th>
                            <th>30-Day Avg</th>
                        </tr>
                    </thead>
                    <tbody>
    `;

    const fuels = Object.keys(appData.latest.prices[city][company]).sort();
    
    fuels.forEach(fuel => {
        const today = appData.latest.prices[city][company][fuel].toFixed(2);
        const wkAvg = appData.averages?.weekly?.[city]?.[company]?.[fuel];
        const moAvg = appData.averages?.monthly?.[city]?.[company]?.[fuel];
        
        html += `
            <tr>
                <td class="text-left">${getFuelIcon(fuel)} ${fuel}</td>
                <td style="font-weight:600; color:var(--primary);">₹${today}</td>
                <td>${wkAvg ? '₹'+wkAvg.toFixed(2) : '-'}</td>
                <td>${moAvg ? '₹'+moAvg.toFixed(2) : '-'}</td>
            </tr>
        `;
    });

    html += `</tbody></table></div></div>`;
    container.innerHTML = html;

    // Render Chart
    const labels = appData.history.map(entry => entry.date);
    const datasets = [];
    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];
    let colorIdx = 0;

    fuels.forEach(fuel => {
        const data = appData.history.map(entry => entry.prices[city]?.[company]?.[fuel] || null);
        datasets.push({
            label: fuel,
            data: data,
            borderColor: colors[colorIdx % colors.length],
            tension: 0.3,
            spanGaps: true
        });
        colorIdx++;
    });

    renderChart('historyChart', labels, datasets);
}

function renderChart(canvasId, labels, datasets) {
    if (currentChart) {
        currentChart.destroy();
    }
    
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    const textColor = isLight ? '#64748b' : '#94a3b8';
    const gridColor = isLight ? 'rgba(0, 0, 0, 0.05)' : 'rgba(255, 255, 255, 0.1)';
    
    Chart.defaults.color = textColor;
    Chart.defaults.font.family = "'Outfit', sans-serif";

    currentChart = new Chart(ctx.getContext('2d'), {
        type: 'line',
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom', labels: { padding: 20 } }
            },
            scales: {
                y: { grid: { color: gridColor } },
                x: { grid: { color: gridColor } }
            }
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    fetchData();
});
