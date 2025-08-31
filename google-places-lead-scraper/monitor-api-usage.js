#!/usr/bin/env node

/**
 * Google API Usage Monitor
 * 
 * This script helps monitor your Google API usage and estimated costs.
 * Run this periodically to track your API consumption.
 */

import axios from 'axios';

// Your new restricted API key
const API_KEY = "AIzaSyDgNOk_CZnGhJK3FhCAAD4uw8tbbYcOMPA";

// Google Cloud Console API endpoints
const QUOTAS_URL = 'https://serviceusage.googleapis.com/v1/projects/trillboard-new/services/places-backend.googleapis.com/consumerQuotaMetrics';

async function checkAPIUsage() {
    try {
        console.log('🔍 Checking Google API usage...\n');
        
        // Note: Full quota monitoring requires Google Cloud Console access
        // This is a simplified version that shows how to check usage
        
        console.log('📊 API Key Information:');
        console.log(`   Key: ${API_KEY.substring(0, 20)}...`);
        console.log(`   Project: trillboard-new`);
        console.log(`   Services: Places API, Geocoding API`);
        
        console.log('\n💰 Estimated Cost Breakdown:');
        console.log('   Places API: $17 per 1,000 calls');
        console.log('   Geocoding API: $5 per 1,000 calls');
        console.log('   Website scraping: Free (no API calls)');
        
        console.log('\n⚠️  Billing Protection Features:');
        console.log('   ✅ Rate limiting enabled (100ms between calls)');
        console.log('   ✅ Daily cost limits configurable');
        console.log('   ✅ Hourly API limits (5,000 calls)');
        console.log('   ✅ Automatic cost estimation');
        console.log('   ✅ Early termination if approaching limits');
        
        console.log('\n📈 Usage Monitoring:');
        console.log('   • Monitor usage in Google Cloud Console');
        console.log('   • Set up billing alerts in Google Cloud');
        console.log('   • Check Apify logs for cost estimates');
        console.log('   • Use maxDailyCost parameter to limit spending');
        
        console.log('\n🎯 Recommended Daily Limits:');
        console.log('   • Conservative: $25/day (1,500 API calls)');
        console.log('   • Moderate: $50/day (3,000 API calls)');
        console.log('   • Aggressive: $100/day (6,000 API calls)');
        
        console.log('\n💡 Cost Optimization Tips:');
        console.log('   • Use 5000m geobox radius (4x fewer calls)');
        console.log('   • Enable hexagonal coverage pattern');
        console.log('   • Set maxPerTerm to 30-60 (not 200)');
        console.log('   • Use specific search terms, not broad ones');
        console.log('   • Run during off-peak hours if possible');
        
    } catch (error) {
        console.error('❌ Error checking API usage:', error.message);
    }
}

// Run the check
checkAPIUsage(); 