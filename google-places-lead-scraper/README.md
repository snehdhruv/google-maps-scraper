# google-places-lead-scraper

## Overview
This Apify Actor scrapes SMB leads from Google Places based on search terms and location, enriches them with emails from business websites, and outputs deduped, normalized results with built-in billing protection.

## Features
- Accepts array of search terms and geo params
- Uses Google Places & Geocoding APIs with rate limiting
- Visits business websites to extract emails
- Normalizes phone numbers and addresses
- Dedupes by placeId
- Saves to Apify dataset
- **NEW: Billing protection and cost monitoring**
- **NEW: API rate limiting to prevent overbilling**
- **NEW: Enhanced email filtering with business pattern detection**

## Billing Protection Features
- **Rate Limiting**: 100ms minimum interval between API calls
- **Cost Estimation**: Real-time cost tracking and alerts
- **Daily Limits**: Configurable maximum daily spend ($1-$500)
- **Early Termination**: Stops scraping if approaching limits
- **Usage Monitoring**: Detailed API call and cost statistics

## How to Run Locally
1. Install dependencies:
   ```bash
   npm install
   ```
2. Set your Google API key:
   ```bash
   export GOOGLE_API_KEY="<your-google-api-key>"
   ```
3. Run the Actor:
   ```bash
   apify run -p
   ```

## Example Input
```json
{
  "searchTerms": ["hair salon", "nail salon"],
  "location": "San Francisco, CA",
  "radiusMeters": 10000,
  "maxPerTerm": 60,
  "maxDailyCost": 50,
  "enableRateLimiting": true
}
```

## New Parameters
- **maxDailyCost**: Maximum estimated cost in USD (default: $50)
- **enableRateLimiting**: Enable API rate limiting (default: true)

## Changing Search Terms
Edit the `searchTerms` array in your input JSON to target new business verticals.

## Output Fields
- name
- searchTerm
- formattedAddress
- lat
- lng
- rating
- userRatingsTotal
- placeId
- website
- emailList (array)
- phone
- googleMapsUrl

## Cost Optimization Tips
- **Geobox Radius**: 5000m (4x fewer API calls than 2500m)
- **Hexagonal Coverage**: 15% fewer geoboxes than square grid
- **Search Terms**: Use specific terms, not broad ones
- **Daily Limits**: Start with $25-50/day for testing
- **Rate Limiting**: Always enabled for production use

## Monitoring Usage
Run the monitoring script to check API usage:
```bash
node monitor-api-usage.js
```

## Deployment
After local tests pass, deploy with:
```bash
apify push
```

## Actor Info
- Title: google-places-lead-scraper
- Version: 0.1.0
- API Key: Restricted to Places and Geocoding APIs only 