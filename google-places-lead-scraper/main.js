// This is the main entry point for your Apify Actor.
import { Actor, log } from 'apify';
import axios from 'axios';
import { extractEmails, normalizePhone, dedupePlaces, enrichPlaceDetails } from './helpers.js';

// Local sleep implementation
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Local asyncPool implementation
async function asyncPool(poolLimit, array, iteratorFn) {
    const ret = [];
    const executing = [];
    for (const item of array) {
        const p = Promise.resolve().then(() => iteratorFn(item));
        ret.push(p);
        if (poolLimit <= array.length) {
            const e = p.then(() => executing.splice(executing.indexOf(e), 1));
            executing.push(e);
            if (executing.length >= poolLimit) {
                await Promise.race(executing);
            }
        }
    }
    return Promise.all(ret);
}

// API Rate Limiting and Billing Protection
class APIRateLimiter {
    constructor(maxDailyCost = 20) {
        this.apiCalls = 0;
        this.lastCallTime = 0;
        this.maxDailyCost = maxDailyCost; // Daily cost limit in USD
        this.minInterval = 100;    // Minimum 100ms between calls
        this.startTime = Date.now();
    }

    async checkLimits() {
        const now = Date.now();
        const timeSinceLastCall = now - this.lastCallTime;
        
        // Check cost limit before making API call
        const currentCost = this.estimateCost();
        if (currentCost >= this.maxDailyCost) {
            const message = `Daily cost limit reached: $${currentCost.toFixed(2)}/$${this.maxDailyCost}. Stopping execution.`;
            log.error(message);
            throw new Error(message);
        }
        
        // Enforce minimum interval between calls
        if (timeSinceLastCall < this.minInterval) {
            await sleep(this.minInterval - timeSinceLastCall);
        }
        
        // Log cost warnings at intervals
        if (this.apiCalls > 0 && this.apiCalls % 100 === 0) {
            const runtime = (now - this.startTime) / (1000 * 60); // minutes
            log.info(`API Stats: ${this.apiCalls} calls, $${currentCost.toFixed(2)} estimated cost, ${runtime.toFixed(1)} min runtime`);
        }
        
        this.lastCallTime = Date.now();
        this.apiCalls++;
    }

    getUsageStats() {
        return {
            totalCalls: this.apiCalls,
            estimatedCost: this.estimateCost()
        };
    }

    estimateCost() {
        // Updated Google Places API pricing:
        // - Places Text Search: $32 per 1000 calls
        // - Place Details: $17 per 1000 calls  
        // - Geocoding API: $5 per 1000 calls
        const textSearchCalls = this.apiCalls * 0.6; // 60% text search
        const placeDetailsCalls = this.apiCalls * 0.35; // 35% place details
        const geocodingCalls = this.apiCalls * 0.05; // 5% geocoding
        
        const textSearchCost = (textSearchCalls / 1000) * 32;
        const placeDetailsCost = (placeDetailsCalls / 1000) * 17;
        const geocodingCost = (geocodingCalls / 1000) * 5;
        
        return textSearchCost + placeDetailsCost + geocodingCost;
    }
}

// Updated Google API key (restricted to specific services)
const GOOGLE_API_KEY = "AIzaSyDgNOk_CZnGhJK3FhCAAD4uw8tbbYcOMPA";

const GEOCODE_URL = 'https://maps.googleapis.com/maps/api/geocode/json';
// Places API (New) v1 endpoints
const PLACES_SEARCH_TEXT_URL = 'https://places.googleapis.com/v1/places:searchText';

// Helper: Chunk array
function chunk(arr, size) {
    const out = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
}

// Helper: Geocode location string to lat/lng with rate limiting
async function geocodeLocation(location, rateLimiter) {
    if (/^-?\d+\.\d+,-?\d+\.\d+$/.test(location)) {
        const [lat, lng] = location.split(',').map(Number);
        return { lat, lng };
    }
    
    await rateLimiter.checkLimits();
    const resp = await axios.get(GEOCODE_URL, {
        params: { address: location, key: GOOGLE_API_KEY },
        timeout: 10000,
    });
    if (!resp.data.results?.[0]) {
        log.error('Geocoding API response:', JSON.stringify(resp.data));
        throw new Error('Location not found');
    }
    return resp.data.results[0].geometry.location;
}

// Helper: Fetch emails from website
async function fetchEmailsFromWebsite(url) {
    try {
        const resp = await axios.get(url, { timeout: 15000 });
        return extractEmails(resp.data);
    } catch {
        return [];
    }
}

// Helper: Build Google Maps URL
function googleMapsUrl(placeId) {
    return `https://www.google.com/maps/place/?q=place_id:${placeId}`;
}

// Helper: Generate hexagonal geobox centers for efficient coverage
function generateHexagonalGeoboxCenters(centerLat, centerLng, radiusMeters, boxRadius = 5000) {
    const earthRadius = 6378137; // meters
    const dLat = boxRadius / earthRadius * (180 / Math.PI);
    const dLng = boxRadius / (earthRadius * Math.cos(Math.PI * centerLat / 180)) * (180 / Math.PI);
    
    // Calculate number of rings needed
    const numRings = Math.ceil(radiusMeters / boxRadius);
    const centers = [];
    
    // Add center point
    centers.push({ lat: centerLat, lng: centerLng });
    
    // Generate hexagonal pattern
    for (let ring = 1; ring <= numRings; ring++) {
        const ringRadius = ring * boxRadius;
        const ringLat = ringRadius / earthRadius * (180 / Math.PI);
        const ringLng = ringRadius / (earthRadius * Math.cos(Math.PI * centerLat / 180)) * (180 / Math.PI);
        
        // Generate 6 points per ring (hexagonal pattern)
        for (let i = 0; i < 6; i++) {
            const angle = (i * Math.PI) / 3;
            const lat = centerLat + ringLat * Math.cos(angle);
            const lng = centerLng + ringLng * Math.sin(angle);
            centers.push({ lat, lng });
        }
    }
    
    return centers;
}


// Daily Cohort Processing - Fixed for proper city distribution
function calculateDailyCohort(cityCohortIndex, cohortCount, totalCities) {
    if (cityCohortIndex !== -1 && cityCohortIndex >= 0) {
        return cityCohortIndex; // Manual override
    }
    
    // Automatic daily rotation based on current date
    const today = new Date();
    const dayOfYear = Math.floor((today - new Date(today.getFullYear(), 0, 0)) / 86400000);
    return dayOfYear % cohortCount;
}

function getCitiesForCohort(allCities, cohortIndex, cohortCount) {
    // Properly distribute cities across cohorts
    const citiesPerCohort = Math.ceil(allCities.length / cohortCount);
    const startIndex = cohortIndex * citiesPerCohort;
    const endIndex = Math.min(startIndex + citiesPerCohort, allCities.length);
    
    return allCities.slice(startIndex, endIndex);
}

// Main Actor logic
Actor.main(async () => {
    const input = await Actor.getInput();
    if (!input) throw new Error('Input is required');
    let {
        searchTerms,
        location,
        radiusMeters,
        maxPerTerm,
        enableRateLimiting = true,
        useTopUSCities = true,
        maxDailyCost = 20, // Daily cost limit in USD
        // Daily cohort processing
        cohortCount = 10,
        cityCohortIndex = -1,
        // Deduplication settings
        persistDedupe = true,
        cooldownDays = 30
    } = input;
    if (typeof searchTerms === 'string') {
        searchTerms = searchTerms.split(',').map(s => s.trim()).filter(Boolean);
    }
    if (!Array.isArray(searchTerms) || !searchTerms.length) throw new Error('searchTerms required');
    if (!location) throw new Error('location required');
    if (!radiusMeters) throw new Error('radiusMeters required');
    if (!maxPerTerm) throw new Error('maxPerTerm required');

    // Initialize rate limiter with cost controls
    const rateLimiter = enableRateLimiting ? new APIRateLimiter(maxDailyCost) : null;
    
    // Get run ID for data tracking
    const runId = Actor.getEnv().actorRunId;
    
    // Initialize checkpoint system for resuming
    const checkpointStore = await Actor.openKeyValueStore('scraper-checkpoints');
    let checkpoint = await checkpointStore.getValue('current-progress') || {
        processedCities: [],
        currentCityIndex: 0,
        currentSearchTermIndex: 0
    };
    
    // Incremental save counter
    let saveCounter = 0;
    const SAVE_INTERVAL = 50; // Save every 50 leads
    
    // Function to save checkpoint
    async function saveCheckpoint(cityIndex, searchTermIndex, completedTerms = []) {
        checkpoint = {
            processedCities: checkpoint.processedCities,
            currentCityIndex: cityIndex,
            currentSearchTermIndex: searchTermIndex,
            completedTerms,
            lastUpdated: new Date().toISOString()
        };
        await checkpointStore.setValue('current-progress', checkpoint);
        log.info(`Checkpoint saved: City ${cityIndex + 1}, Search term ${searchTermIndex + 1}`);
    }
    
    // Function for incremental data saving
    async function saveLeadsIncremental(leads, searchTerm = '', city = '') {
        if (leads.length > 0) {
            // Add metadata to each lead
            const enrichedLeads = leads.map(lead => ({
                ...lead,
                // Only override searchTerm if it's not already set correctly
                searchTerm: lead.searchTerm || searchTerm,
                cityProcessed: city,
                apifyRunId: runId,
                scrapedAt: new Date().toISOString()
            }));
            
            // Save to Apify dataset
            await Actor.pushData(enrichedLeads);
            
            saveCounter += leads.length;
            log.info(`Saved ${leads.length} leads to Apify dataset (total saved: ${saveCounter})`);
        }
    }

    log.info(`Starting lead scraper with rate limiting and $${maxDailyCost} daily cost limit...`);
    log.info(`Resume checkpoint: City ${checkpoint.currentCityIndex + 1}, Search term ${checkpoint.currentSearchTermIndex + 1}`);
    // Build list of target centers
    const targetCenters = [];
    if (useTopUSCities) {
        // Top 100 US metros optimized for Trillboards - prioritized by business density and foot traffic
        // Tier 1: Highest density urban cores with maximum screen visibility potential
        const TOP_US_CITIES = [
            // Ultra-high density markets (10,000+ people/sq mi)
            'New York, NY', 'San Francisco, CA', 'Boston, MA', 'Chicago, IL', 'Philadelphia, PA',
            'Washington, DC', 'Miami, FL', 'Seattle, WA', 'Jersey City, NJ', 'Cambridge, MA',
            
            // Major downtown business districts
            'Los Angeles, CA', 'Atlanta, GA', 'Denver, CO', 'Austin, TX', 'Dallas, TX',
            'Houston, TX', 'Phoenix, AZ', 'San Diego, CA', 'Portland, OR', 'Minneapolis, MN',
            
            // High foot-traffic entertainment districts
            'Las Vegas, NV', 'Nashville, TN', 'New Orleans, LA', 'Orlando, FL', 'Miami Beach, FL',
            'San Antonio, TX', 'Tampa, FL', 'Charlotte, NC', 'Pittsburgh, PA', 'St. Louis, MO',
            
            // Dense suburban commercial hubs
            'Arlington, VA', 'Long Beach, CA', 'Oakland, CA', 'Santa Ana, CA', 'Anaheim, CA',
            'Newark, NJ', 'Irvine, CA', 'Fremont, CA', 'Glendale, CA', 'Pasadena, CA',
            
            // Growing tech/business centers
            'San Jose, CA', 'Raleigh, NC', 'Durham, NC', 'Salt Lake City, UT', 'Boise, ID',
            'Madison, WI', 'Ann Arbor, MI', 'Boulder, CO', 'Bellevue, WA', 'Redmond, WA',
            
            // Secondary dense metros
            'Detroit, MI', 'Baltimore, MD', 'Milwaukee, WI', 'Cleveland, OH', 'Cincinnati, OH',
            'Kansas City, MO', 'Columbus, OH', 'Indianapolis, IN', 'Sacramento, CA', 'Jacksonville, FL',
            
            // College towns with high business density
            'Berkeley, CA', 'Evanston, IL', 'Tempe, AZ', 'College Station, TX', 'Gainesville, FL',
            'Syracuse, NY', 'Buffalo, NY', 'Rochester, NY', 'Albany, NY', 'Hartford, CT',
            
            // Additional high-traffic commercial areas
            'Fort Lauderdale, FL', 'West Palm Beach, FL', 'Virginia Beach, VA', 'St. Petersburg, FL',
            'Riverside, CA', 'Fort Worth, TX', 'El Paso, TX', 'Memphis, TN', 'Louisville, KY',
            'Richmond, VA', 'Oklahoma City, OK', 'Tucson, AZ', 'Albuquerque, NM', 'Fresno, CA',
            
            // Dense Northeast corridor
            'Providence, RI', 'New Haven, CT', 'Bridgeport, CT', 'Stamford, CT', 'Worcester, MA',
            'Springfield, MA', 'Yonkers, NY', 'White Plains, NY', 'New Rochelle, NY', 'Mount Vernon, NY',
            
            // Additional commercial centers
            'Omaha, NE', 'Tulsa, OK', 'Wichita, KS', 'Des Moines, IA', 'Grand Rapids, MI',
            'Dayton, OH', 'Akron, OH', 'Toledo, OH', 'Lexington, KY', 'Greensboro, NC'
        ];

        // Properly distribute cities across cohorts for even rotation
        const totalCohorts = Math.max(1, parseInt(cohortCount, 10) || 1);
        let cohortIdx = parseInt(cityCohortIndex, 10);
        if (!Number.isInteger(cohortIdx) || cohortIdx < 0) {
            cohortIdx = calculateDailyCohort(cityCohortIndex, totalCohorts, TOP_US_CITIES.length);
        }
        
        // Use proper slicing instead of modulo filtering
        const selectedCities = getCitiesForCohort(TOP_US_CITIES, cohortIdx, totalCohorts);
        
        log.info(`Processing cohort ${cohortIdx + 1} of ${totalCohorts}`);
        log.info(`Cities in this cohort: ${selectedCities.join(', ')}`);

        for (let i = 0; i < selectedCities.length; i++) {
            // Skip cities that are already processed based on checkpoint
            if (i < checkpoint.currentCityIndex) {
                log.info(`Skipping already processed city: ${selectedCities[i]}`);
                continue;
            }
            
            const city = selectedCities[i];
            const { lat, lng } = await geocodeLocation(city, rateLimiter);
            targetCenters.push({ lat, lng, label: city, index: i });
        }
        log.info(`Resolved ${targetCenters.length} cities to coordinates`);
        log.info(`Daily rotation: Day ${cohortIdx + 1} of ${totalCohorts}-day cycle`);
        log.info(`Processing ${selectedCities.length} cities out of ${TOP_US_CITIES.length} total`);
    } else {
        const { lat: centerLat, lng: centerLng } = await geocodeLocation(location, rateLimiter);
        log.info(`Resolved location: ${centerLat},${centerLng}`);
        targetCenters.push({ lat: centerLat, lng: centerLng, label: String(location) });
    }

    let geoboxCenters = [];
    let boxRadius = radiusMeters;
    if (radiusMeters > 5000) {
        boxRadius = 5000; // Increased from 2500m to 5000m for efficiency
    }

    const allPlaces = new Map();

    // Persistent dedupe store
    const shouldUseDedupe = Boolean(persistDedupe);
    const dedupeStore = shouldUseDedupe ? await Actor.openKeyValueStore('leads-dedupe') : null;
    const cooldownMs = Math.max(0, (parseInt(cooldownDays, 10) || 0)) * 24 * 60 * 60 * 1000;
    let skippedDueToCooldown = 0;

    async function hasRecentPlace(placeId) {
        if (!dedupeStore || !cooldownMs) return false;
        try {
            const rec = await dedupeStore.getValue(`place:${placeId}`);
            if (!rec?.lastSeen) return false;
            const last = new Date(rec.lastSeen).getTime();
            return Number.isFinite(last) && (Date.now() - last) < cooldownMs;
        } catch {
            return false;
        }
    }

    async function markPlaceSeen(placeId) {
        if (!dedupeStore) return;
        try {
            await dedupeStore.setValue(`place:${placeId}`, { lastSeen: new Date().toISOString() });
        } catch {}
    }

    for (let cityIdx = 0; cityIdx < targetCenters.length; cityIdx++) {
        const center = targetCenters[cityIdx];
        const { lat, lng, label, index } = center;
        
        // Skip if this city was already processed
        if (index !== undefined && index < checkpoint.currentCityIndex) {
            continue;
        }
        
        geoboxCenters = [{ lat, lng }];
        if (radiusMeters > 5000) {
            geoboxCenters = generateHexagonalGeoboxCenters(lat, lng, radiusMeters, boxRadius);
            log.info(`Segmenting ${label} into ${geoboxCenters.length} hexagonal geoboxes of radius ${boxRadius}m`);
        }
        
        const batchLeads = []; // Collect leads for batch saving
        
        for (const { lat: boxLat, lng: boxLng } of geoboxCenters) {
        for (let termIdx = 0; termIdx < searchTerms.length; termIdx++) {
            const searchTerm = searchTerms[termIdx];
            
            // Skip if this search term was already processed in current city
            if (index === checkpoint.currentCityIndex && termIdx < checkpoint.currentSearchTermIndex) {
                log.info(`Skipping already processed search term: ${searchTerm} in ${label}`);
                continue;
            }
            let pageToken = undefined;
            let fetched = 0;
            do {
                // Check rate limits and billing limits before each API call
                if (rateLimiter) {
                    await rateLimiter.checkLimits();
                }
                
                // Remove problematic type mapping that causes incorrect business targeting
                // Use natural search terms without Google Places type restrictions
                const body = {
                    textQuery: `${searchTerm}`.trim(),
                    pageSize: 20,
                    pageToken: pageToken,
                    locationBias: {
                        circle: {
                            center: { latitude: boxLat, longitude: boxLng },
                            radius: boxRadius,
                        }
                    },
                };
                let places = [];
                let nextPageToken = undefined;
                try {
                    const resp = await axios.post(PLACES_SEARCH_TEXT_URL, body, {
                        headers: {
                            'X-Goog-Api-Key': GOOGLE_API_KEY,
                            'X-Goog-FieldMask': [
                                'places.id',
                                'places.displayName',
                                'places.location',
                                'places.rating',
                                'places.userRatingsTotal',
                                'places.formattedAddress',
                                'places.websiteUri',
                                'places.internationalPhoneNumber',
                                'places.googleMapsUri'
                            ].join(','),
                        },
                        timeout: 15000,
                    });
                    places = resp.data?.places || [];
                    nextPageToken = resp.data?.nextPageToken;
                } catch (err) {
                    // Fallback to legacy Nearby Search if v1 is unavailable or key restricted
                    const legacyParams = {
                        key: GOOGLE_API_KEY,
                        location: `${boxLat},${boxLng}`,
                        radius: boxRadius,
                        keyword: searchTerm,
                        pagetoken: pageToken,
                    };
                    const legacyResp = await axios.get('https://maps.googleapis.com/maps/api/place/nearbysearch/json', { params: legacyParams, timeout: 15000 });
                    const { results = [], next_page_token } = legacyResp.data || {};
                    places = results.map((r) => ({
                        id: r.place_id,
                        displayName: { text: r.name },
                        location: { latitude: r.geometry?.location?.lat, longitude: r.geometry?.location?.lng },
                        rating: r.rating,
                        userRatingsTotal: r.user_ratings_total,
                        formattedAddress: r.vicinity || r.formatted_address,
                        websiteUri: r.website,
                        internationalPhoneNumber: r.international_phone_number || r.formatted_phone_number,
                        googleMapsUri: googleMapsUrl(r.place_id),
                    }));
                    nextPageToken = next_page_token;
                }
                
                for (const p of places) {
                    // Places API (New) returns id (place_id token) and displayName.text
                    if (!p.id) continue;
                    if (await hasRecentPlace(p.id)) {
                        skippedDueToCooldown++;
                        if (skippedDueToCooldown % 10 === 0) {
                            log.info(`Skipped ${skippedDueToCooldown} places due to cooldown (already scraped within ${cooldownDays} days)`);
                        }
                        continue;
                    }
                    if (!allPlaces.has(p.id)) {
                        const place = {
                            name: p.displayName?.text || '',
                            searchTerm,
                            formattedAddress: p.formattedAddress || '',
                            lat: p.location?.latitude,
                            lng: p.location?.longitude,
                            rating: p.rating,
                            userRatingsTotal: p.userRatingsTotal,
                            placeId: p.id,
                            website: p.websiteUri || '',
                            phone: normalizePhone(p.internationalPhoneNumber || ''),
                            googleMapsUrl: p.googleMapsUri || googleMapsUrl(p.id),
                            emailList: [],
                        };
                        allPlaces.set(p.id, place);
                        batchLeads.push(place);
                        
                        // Save incrementally every SAVE_INTERVAL leads
                        if (batchLeads.length >= SAVE_INTERVAL) {
                            // Enrich with emails before saving
                            await asyncPool(2, batchLeads, async (lead) => {
                                await enrichPlaceDetails(lead, GOOGLE_API_KEY, rateLimiter);
                                await markPlaceSeen(lead.placeId);
                            });
                            
                            await saveLeadsIncremental(batchLeads, searchTerm, label);
                            await saveCheckpoint(cityIdx, termIdx);
                            batchLeads.length = 0; // Clear batch
                        }
                    }
                }
                fetched += places.length;
                pageToken = nextPageToken;
                if (pageToken) await sleep(2000);
            } while (pageToken && fetched < maxPerTerm);
            
            // Update checkpoint after each search term
            await saveCheckpoint(cityIdx, termIdx + 1);
        }
        }
        
        // Save any remaining leads from this city
        if (batchLeads.length > 0) {
            await asyncPool(2, batchLeads, async (lead) => {
                await enrichPlaceDetails(lead, GOOGLE_API_KEY, rateLimiter);
                await markPlaceSeen(lead.placeId);
            });
            
            // Don't override searchTerm - each lead already has the correct one
            await saveLeadsIncremental(batchLeads, '', label);
            batchLeads.length = 0;
        }
        
        // Mark city as completed
        checkpoint.processedCities.push(index || cityIdx);
        await saveCheckpoint(cityIdx + 1, 0);
        
        log.info(`Completed processing city: ${label}`);
    }

    // All data has been saved incrementally during processing
    // Clear checkpoint as scraping is complete
    await checkpointStore.setValue('current-progress', {
        processedCities: [],
        currentCityIndex: 0,
        currentSearchTermIndex: 0,
        completedAt: new Date().toISOString()
    });

    // Final stats
    const usageStats = rateLimiter ? rateLimiter.getUsageStats() : { totalCalls: 0, estimatedCost: 0 };
    log.info(`Scraping completed! API calls: ${usageStats.totalCalls}, Estimated cost: $${usageStats.estimatedCost.toFixed(2)}`);
    log.info(`Total leads processed: ${saveCounter}`);
    if (skippedDueToCooldown) {
        log.info(`Total places skipped due to cooldown: ${skippedDueToCooldown} (already scraped within ${cooldownDays} days)`);
        log.info(`This deduplication saved approximately $${(skippedDueToCooldown * 0.017).toFixed(2)} in API costs`);
    }
    
    // Final summary
    log.info(`Scraping complete: ${saveCounter} leads saved to Apify dataset`);
    log.info('Leads are ready for N8N workflow processing');
}); 