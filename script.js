
"use strict";

// --------------------------------------------------
// 1. Screen navigation
// --------------------------------------------------

const screens = [
    document.getElementById("welcome-screen"),
    document.getElementById("planner-screen"),
    document.getElementById("map-screen"),
    document.getElementById("report-screen")
];

const wizardNavigation = document.getElementById("wizard-navigation");
const startAppButton = document.getElementById("startAppButton");
const backButton = document.getElementById("backButton");
const nextButton = document.getElementById("nextButton");
const stepLabel = document.getElementById("step-label");
const stepTitle = document.getElementById("step-title");
const stepProgress = document.getElementById("step-progress");
const stepProgressFill = document.getElementById("step-progress-fill");
const brandHome = document.getElementById("brandHome");
const finishButton = document.getElementById("finishButton");

const stepNames = [
    "Welcome",
    "Plan your journey",
    "Explore your route",
    "Report a barrier"
];

let currentScreen = 0;
let map = null;
let routeLayer = null;
let reportLayer = null;
let routeStartMarker = null;
let routeEndMarker = null;
let mapHasBeenInitialized = false;

function showScreen(index) {
    if (index < 0 || index >= screens.length) return;

    currentScreen = index;

    screens.forEach((screen, screenIndex) => {
        const isActive = screenIndex === currentScreen;
        screen.hidden = !isActive;

        if (isActive) {
            screen.setAttribute("aria-hidden", "false");
        } else {
            screen.setAttribute("aria-hidden", "true");
        }
    });

    const isWelcome = currentScreen === 0;
    wizardNavigation.hidden = isWelcome;

    if (!isWelcome) {
        const progressStep = currentScreen;
        const totalSteps = screens.length - 1;
        const progressPercent = (progressStep / totalSteps) * 100;

        stepLabel.textContent = `Step ${progressStep} of ${totalSteps}`;
        stepTitle.textContent = stepNames[currentScreen];
        stepProgress.setAttribute("aria-valuenow", String(progressStep));
        stepProgressFill.style.width = `${progressPercent}%`;

        backButton.disabled = false;

        if (currentScreen === screens.length - 1) {
            nextButton.textContent = "Finish →";
        } else {
            nextButton.textContent = "Next →";
        }
    }

    if (currentScreen === 2) {
        initializeMap();
        window.setTimeout(() => {
            if (map) map.invalidateSize();
        }, 100);
        refreshReportMarkers();
    }

    window.scrollTo({ top: 0, behavior: "smooth" });
}

startAppButton.addEventListener("click", () => {
    showScreen(1);
});

backButton.addEventListener("click", () => {
    if (currentScreen > 0) {
        showScreen(currentScreen - 1);
    }
});

nextButton.addEventListener("click", () => {
    if (currentScreen < screens.length - 1) {
        showScreen(currentScreen + 1);
    } else {
        showScreen(0);
    }
});

brandHome.addEventListener("click", (event) => {
    event.preventDefault();
    showScreen(0);
});

finishButton.addEventListener("click", () => {
    showScreen(0);
});


// --------------------------------------------------
// 2. Map setup
// --------------------------------------------------

const mapStatus = document.getElementById("mapStatus");
const resetMapButton = document.getElementById("resetMapButton");

function initializeMap() {
    if (mapHasBeenInitialized || typeof L === "undefined") {
        return;
    }

    map = L.map("map").setView([22.9734, 78.6569], 5);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    routeLayer = L.layerGroup().addTo(map);
    reportLayer = L.layerGroup().addTo(map);

    mapHasBeenInitialized = true;
    refreshReportMarkers();
}

resetMapButton.addEventListener("click", () => {
    if (!map) initializeMap();

    if (map) {
        map.setView([22.9734, 78.6569], 5);
        mapStatus.textContent = "Showing India. Search for a route to zoom to your journey.";
    }
});


// --------------------------------------------------
// 3. Route search and geocoding
// --------------------------------------------------

const routeForm = document.getElementById("routeForm");
const startInput = document.getElementById("start");
const destinationInput = document.getElementById("destination");
const profileInput = document.getElementById("profile");
const routeButton = document.getElementById("routeButton");
const routeStatus = document.getElementById("routeStatus");
const result = document.getElementById("result");
const routeResults = document.getElementById("routeResults");
const profileMessage = document.getElementById("profileMessage");

const profileDescriptions = {
    general: "This search attempts to find a possible walking route. It does not verify pedestrian safety.",
    wheelchair: "This preference highlights the need for step-free access, kerb ramps, and suitable surfaces. These features are not verified by this prototype.",
    lowvision: "This preference highlights the need for safe crossings, tactile paving, and clear paths. These features are not verified by this prototype.",
    mobility: "This preference highlights the need for manageable walking distances and fewer obstacles. These features are not verified by this prototype."
};

profileInput.addEventListener("change", () => {
    profileMessage.textContent = profileDescriptions[profileInput.value];
});

function setStatus(element, message, isError = false) {
    element.textContent = message;
    element.classList.toggle("error", isError);
}

async function geocodeIndia(place) {
    const url = new URL("https://nominatim.openstreetmap.org/search");

    url.searchParams.set("q", place);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("countrycodes", "in");
    url.searchParams.set("limit", "1");

    const response = await fetch(url.toString(), {
        headers: { "Accept": "application/json" }
    });

    if (!response.ok) {
        throw new Error("Location search is temporarily unavailable.");
    }

    const results = await response.json();

    if (!results.length) {
        throw new Error(`Could not find "${place}" in India. Try a more specific location.`);
    }

    return {
        lat: Number(results[0].lat),
        lon: Number(results[0].lon),
        name: results[0].display_name
    };
}

function formatDistance(metres) {
    if (metres < 1000) {
        return `${Math.round(metres)} m`;
    }

    return `${(metres / 1000).toFixed(2)} km`;
}

function formatDuration(seconds) {
    const minutes = Math.max(1, Math.round(seconds / 60));

    if (minutes < 60) {
        return `${minutes} min (estimate)`;
    }

    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;

    return remainingMinutes
        ? `${hours} hr ${remainingMinutes} min (estimate)`
        : `${hours} hr (estimate)`;
}

function clearRoute() {
    if (routeLayer) routeLayer.clearLayers();

    routeStartMarker = null;
    routeEndMarker = null;
}

function showRouteCard(route, start, destination) {
    routeResults.replaceChildren();

    const card = document.createElement("article");
    card.className = "route-card";

    const heading = document.createElement("h3");
    heading.textContent = "Possible route";

    const distance = document.createElement("p");
    distance.textContent = `Distance: ${formatDistance(route.distance)}`;

    const duration = document.createElement("p");
    duration.textContent = `Estimated time: ${formatDuration(route.duration)}`;

    const startText = document.createElement("p");
    startText.textContent = `From: ${start.name}`;

    const destinationText = document.createElement("p");
    destinationText.textContent = `To: ${destination.name}`;

    const warning = document.createElement("p");
    warning.textContent =
        "This is an experimental routing result. Footpaths, crossings, step-free access, and barrier conditions have not been verified.";

    card.append(heading, distance, duration, startText, destinationText, warning);
    routeResults.appendChild(card);
}

routeForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const startText = startInput.value.trim();
    const destinationText = destinationInput.value.trim();

    if (!startText || !destinationText) {
        setStatus(routeStatus, "Enter both a starting point and a destination.", true);
        return;
    }

    routeButton.disabled = true;
    routeButton.textContent = "Searching...";
    routeResults.replaceChildren();
    result.textContent = "";
    setStatus(routeStatus, "Finding locations in India...");
    clearRoute();

    try {
        const start = await geocodeIndia(startText);
        const destination = await geocodeIndia(destinationText);

        setStatus(routeStatus, "Requesting a possible route...");

        // Experimental public foot-routing service.
        // Availability and routing quality are not guaranteed.
        const coordinates = `${start.lon},${start.lat};${destination.lon},${destination.lat}`;
        const routingUrl =
            `https://routing.openstreetmap.de/routed-foot/route/v1/driving/${coordinates}` +
            "?overview=full&geometries=geojson&steps=false";

        const response = await fetch(routingUrl);

        if (!response.ok) {
            throw new Error("The routing service could not calculate a route. Please try again later.");
        }

        const data = await response.json();

        if (data.code !== "Ok" || !data.routes || !data.routes.length) {
            throw new Error("No route was returned. Try different locations.");
        }

        const route = data.routes[0];

        if (!route.geometry || !Array.isArray(route.geometry.coordinates)) {
            throw new Error("The route response did not contain map geometry.");
        }

        initializeMap();

        if (!map || !routeLayer) {
            throw new Error("The map library could not be loaded. Check your internet connection.");
        }

        clearRoute();

        const latLngs = route.geometry.coordinates.map(([lon, lat]) => [lat, lon]);

        L.polyline(latLngs, {
            color: "#14b8a6",
            weight: 6,
            opacity: 0.9
        }).addTo(routeLayer);

        routeStartMarker = L.marker([start.lat, start.lon])
            .bindPopup("Starting point")
            .addTo(routeLayer);

        routeEndMarker = L.marker([destination.lat, destination.lon])
            .bindPopup("Destination")
            .addTo(routeLayer);

        map.fitBounds(L.latLngBounds(latLngs), { padding: [35, 35] });

        showRouteCard(route, start, destination);

        setStatus(routeStatus, "Route loaded. Review the limitations before travelling.");
        setStatus(
            mapStatus,
            "Showing an experimental route. Accessibility and pedestrian safety are not verified."
        );

        result.textContent = "A possible route was found.";
    } catch (error) {
        setStatus(routeStatus, error.message || "Something went wrong while finding the route.", true);
        setStatus(mapStatus, "No route is currently displayed.");
        result.textContent = "Try a more specific location or try again later.";
        result.classList.add("error");
    } finally {
        routeButton.disabled = false;
        routeButton.textContent = "Find a possible route";
    }
});


// --------------------------------------------------
// 4. Local barrier reports
// --------------------------------------------------

const BARRIER_STORAGE_KEY = "pathProofsBarrierReports";
const BARRIER_EXPIRY_MS = 60 * 60 * 1000;

const barrierForm = document.getElementById("barrierForm");
const barrierInput = document.getElementById("barrier");
const locationInput = document.getElementById("location");
const barrierDetailsInput = document.getElementById("barrierDetails");
const reportButton = document.getElementById("reportButton");
const reportResult = document.getElementById("reportResult");
const reportList = document.getElementById("reportList");
const reportCount = document.getElementById("reportCount");

function loadBarrierReports() {
    try {
        const stored = JSON.parse(
            localStorage.getItem(BARRIER_STORAGE_KEY) || "[]"
        );

        if (!Array.isArray(stored)) return [];

        const now = Date.now();

        return stored.filter((item) =>
            item &&
            typeof item.id === "string" &&
            typeof item.type === "string" &&
            typeof item.location === "string" &&
            typeof item.details === "string" &&
            Number.isFinite(item.createdAt) &&
            item.createdAt <= now &&
            now - item.createdAt < BARRIER_EXPIRY_MS
        );
    } catch (error) {
        console.warn("Could not read saved reports:", error);
        return [];
    }
}

let activeBarriers = loadBarrierReports();

function saveBarrierReports() {
    try {
        localStorage.setItem(BARRIER_STORAGE_KEY, JSON.stringify(activeBarriers));
        return true;
    } catch (error) {
        console.warn("Could not save reports:", error);
        return false;
    }
}

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[character]);
}

function renderBarrierReports() {
    const now = Date.now();

    activeBarriers = activeBarriers.filter(
        (report) => now - report.createdAt < BARRIER_EXPIRY_MS
    );

    saveBarrierReports();

    reportCount.textContent = String(activeBarriers.length);
    reportList.replaceChildren();

    if (activeBarriers.length === 0) {
        const empty = document.createElement("p");
        empty.className = "empty-state";
        empty.textContent = "No recent reports. You can submit the first one.";
        reportList.appendChild(empty);
        return;
    }

    activeBarriers
        .slice()
        .sort((a, b) => b.createdAt - a.createdAt)
        .forEach((report) => {
            const item = document.createElement("article");
            item.className = "report-item";

            const heading = document.createElement("h4");
            heading.textContent = report.type;

            const location = document.createElement("p");
            location.textContent = `Location: ${report.location}`;

            const details = document.createElement("p");
            details.textContent = report.details || "No additional details provided.";

            const time = document.createElement("p");
            time.className = "report-meta";
            time.textContent = `Reported ${new Date(report.createdAt).toLocaleString()}`;

            const deleteButton = document.createElement("button");
            deleteButton.type = "button";
            deleteButton.className = "secondary-button";
            deleteButton.textContent = "Delete report";
            deleteButton.setAttribute("aria-label", `Delete report: ${report.type}`);

            deleteButton.addEventListener("click", () => {
                activeBarriers = activeBarriers.filter(
                    (entry) => entry.id !== report.id
                );

                saveBarrierReports();
                renderBarrierReports();
                refreshReportMarkers();

                setStatus(reportResult, "Report deleted from this browser.");
            });

            item.append(heading, location, details, time, deleteButton);
            reportList.appendChild(item);
        });
}

function refreshReportMarkers() {
    if (!map || !reportLayer) return;

    reportLayer.clearLayers();

    // Reports are descriptive only. They are not geocoded or placed
    // on the map unless verified coordinates are available.
    // This prototype does not collect or store report coordinates.
}

barrierForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const type = barrierInput.value;
    const location = locationInput.value.trim();
    const details = barrierDetailsInput.value.trim();

    if (!type || !location) {
        setStatus(reportResult, "Choose a barrier type and enter its location.", true);
        return;
    }

    const report = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        type,
        location,
        details,
        createdAt: Date.now()
    };

    activeBarriers.push(report);
    const saved = saveBarrierReports();

    renderBarrierReports();

    if (saved) {
        setStatus(
            reportResult,
            "Report saved in this browser. It has not been shared with other users."
        );
    } else {
        setStatus(
            reportResult,
            "The report was added for this session, but browser storage failed.",
            true
        );
    }

    barrierForm.reset();
    refreshReportMarkers();
});


// --------------------------------------------------
// 5. Start the app
// --------------------------------------------------

renderBarrierReports();
showScreen(0);

// Refresh expired reports periodically while the page is open.
window.setInterval(() => {
    renderBarrierReports();
}, 60 * 1000);
