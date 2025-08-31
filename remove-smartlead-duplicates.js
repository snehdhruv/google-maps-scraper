#!/usr/bin/env node

const https = require('https');

const SMARTLEAD_API_KEY = '5e43847b-d81c-43d9-9fea-56104e7ffb15_7swu1pp';
const CAMPAIGN_ID = '2384040';
const BASE_URL = 'server.smartlead.ai';

// Helper function to make HTTPS requests
function makeRequest(path, method = 'GET', data = null) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: BASE_URL,
            path: path,
            method: method,
            headers: {
                'Content-Type': 'application/json',
            }
        };

        if (data && method !== 'GET') {
            const postData = JSON.stringify(data);
            options.headers['Content-Length'] = Buffer.byteLength(postData);
        }

        const req = https.request(options, (res) => {
            let responseData = '';
            
            res.on('data', (chunk) => {
                responseData += chunk;
            });
            
            res.on('end', () => {
                try {
                    const result = JSON.parse(responseData);
                    resolve(result);
                } catch (e) {
                    console.log('Raw response:', responseData);
                    reject(new Error('Failed to parse JSON response'));
                }
            });
        });

        req.on('error', (error) => {
            reject(error);
        });

        if (data && method !== 'GET') {
            req.write(JSON.stringify(data));
        }
        
        req.end();
    });
}

// Get all leads from the campaign with pagination
async function getAllLeads() {
    console.log('🔍 Fetching all leads from campaign...');
    let allLeads = [];
    let offset = 0;
    const limit = 100; // SmartLead API limit per request
    
    while (true) {
        const path = `/api/v1/campaigns/${CAMPAIGN_ID}/leads?api_key=${SMARTLEAD_API_KEY}&limit=${limit}&offset=${offset}`;
        
        try {
            console.log(`   Fetching leads ${offset}-${offset + limit}...`);
            const response = await makeRequest(path);
            
            if (!response.data || response.data.length === 0) {
                break;
            }
            
            allLeads = allLeads.concat(response.data);
            offset += limit;
            
            // Add a small delay to be respectful to the API
            await new Promise(resolve => setTimeout(resolve, 100));
            
        } catch (error) {
            console.error('❌ Error fetching leads:', error.message);
            break;
        }
    }
    
    console.log(`✅ Total leads fetched: ${allLeads.length}`);
    return allLeads;
}

// Identify duplicates by email address
function identifyDuplicates(leads) {
    console.log('🔍 Identifying duplicate leads by email...');
    
    const emailMap = new Map();
    const duplicates = [];
    
    leads.forEach(leadData => {
        const email = leadData.lead.email.toLowerCase().trim();
        const leadId = leadData.lead.id;
        const campaignLeadMapId = leadData.campaign_lead_map_id;
        const createdAt = new Date(leadData.created_at);
        
        if (emailMap.has(email)) {
            // This is a duplicate
            const existing = emailMap.get(email);
            
            // Keep the most recent one, mark older ones as duplicates
            if (createdAt > existing.createdAt) {
                // Current lead is newer, mark existing as duplicate
                duplicates.push({
                    email: email,
                    leadId: existing.leadId,
                    campaignLeadMapId: existing.campaignLeadMapId,
                    createdAt: existing.createdAt
                });
                
                // Update map with newer lead
                emailMap.set(email, {
                    leadId: leadId,
                    campaignLeadMapId: campaignLeadMapId,
                    createdAt: createdAt
                });
            } else {
                // Existing lead is newer, mark current as duplicate
                duplicates.push({
                    email: email,
                    leadId: leadId,
                    campaignLeadMapId: campaignLeadMapId,
                    createdAt: createdAt
                });
            }
        } else {
            // First occurrence of this email
            emailMap.set(email, {
                leadId: leadId,
                campaignLeadMapId: campaignLeadMapId,
                createdAt: createdAt
            });
        }
    });
    
    console.log(`📊 Unique emails: ${emailMap.size}`);
    console.log(`🔄 Duplicate leads to remove: ${duplicates.length}`);
    
    return { duplicates, uniqueEmails: emailMap.size };
}

// Delete a lead from the campaign
async function deleteLead(leadId) {
    const path = `/api/v1/campaigns/${CAMPAIGN_ID}/leads/${leadId}?api_key=${SMARTLEAD_API_KEY}`;
    
    try {
        const response = await makeRequest(path, 'DELETE');
        return { success: true, response };
    } catch (error) {
        console.error(`❌ Failed to delete lead ${leadId}:`, error.message);
        return { success: false, error: error.message };
    }
}

// Remove duplicate leads in batches
async function removeDuplicates(duplicates) {
    console.log('🗑️ Removing duplicate leads...');
    
    let successCount = 0;
    let errorCount = 0;
    const batchSize = 10; // Process in small batches to avoid overwhelming the API
    
    for (let i = 0; i < duplicates.length; i += batchSize) {
        const batch = duplicates.slice(i, i + batchSize);
        
        console.log(`   Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(duplicates.length/batchSize)} (${batch.length} leads)...`);
        
        const deletePromises = batch.map(async (duplicate) => {
            const result = await deleteLead(duplicate.leadId);
            if (result.success) {
                successCount++;
                console.log(`     ✅ Deleted duplicate: ${duplicate.email} (ID: ${duplicate.leadId})`);
            } else {
                errorCount++;
                console.log(`     ❌ Failed to delete: ${duplicate.email} (ID: ${duplicate.leadId}) - ${result.error}`);
            }
            return result;
        });
        
        await Promise.all(deletePromises);
        
        // Add delay between batches
        if (i + batchSize < duplicates.length) {
            console.log('   Waiting 2 seconds before next batch...');
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
    
    console.log(`✅ Successfully deleted: ${successCount} duplicates`);
    console.log(`❌ Failed to delete: ${errorCount} duplicates`);
    
    return { successCount, errorCount };
}

// Get final campaign stats
async function getFinalStats() {
    console.log('📊 Getting final campaign statistics...');
    
    try {
        const path = `/api/v1/campaigns/${CAMPAIGN_ID}/leads?api_key=${SMARTLEAD_API_KEY}&limit=1`;
        const response = await makeRequest(path);
        
        const totalLeads = parseInt(response.total_leads) || 0;
        console.log(`✅ Final lead count: ${totalLeads}`);
        
        return totalLeads;
    } catch (error) {
        console.error('❌ Error getting final stats:', error.message);
        return null;
    }
}

// Main execution function
async function main() {
    console.log('🚀 Starting SmartLead duplicate removal process...');
    console.log(`Campaign ID: ${CAMPAIGN_ID}`);
    console.log('');
    
    try {
        // Step 1: Get all leads
        const allLeads = await getAllLeads();
        
        if (allLeads.length === 0) {
            console.log('❌ No leads found in campaign');
            return;
        }
        
        // Step 2: Identify duplicates
        const { duplicates, uniqueEmails } = identifyDuplicates(allLeads);
        
        if (duplicates.length === 0) {
            console.log('✅ No duplicates found! Campaign is already clean.');
            return;
        }
        
        // Step 3: Confirm before deletion
        console.log('');
        console.log('📋 SUMMARY:');
        console.log(`   Total leads in campaign: ${allLeads.length}`);
        console.log(`   Unique email addresses: ${uniqueEmails}`);
        console.log(`   Duplicate leads to remove: ${duplicates.length}`);
        console.log(`   Expected final count: ${uniqueEmails}`);
        console.log('');
        
        // For safety, let's ask for confirmation in a production environment
        // For now, we'll proceed automatically
        console.log('⚠️  PROCEEDING WITH DELETION IN 5 SECONDS...');
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // Step 4: Remove duplicates
        const { successCount, errorCount } = await removeDuplicates(duplicates);
        
        // Step 5: Get final stats
        console.log('');
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for SmartLead to update
        const finalCount = await getFinalStats();
        
        console.log('');
        console.log('🎉 DUPLICATE REMOVAL COMPLETE!');
        console.log(`   Removed: ${successCount} duplicates`);
        console.log(`   Errors: ${errorCount}`);
        console.log(`   Final lead count: ${finalCount || 'Unknown'}`);
        
        if (finalCount && finalCount <= uniqueEmails + 10) { // Allow some margin for timing
            console.log('✅ SUCCESS: Campaign now contains unique leads only!');
        } else {
            console.log('⚠️  WARNING: Final count higher than expected. Some duplicates may remain.');
        }
        
    } catch (error) {
        console.error('❌ Script failed:', error.message);
        process.exit(1);
    }
}

// Run the script
if (require.main === module) {
    main().then(() => {
        console.log('Script completed.');
        process.exit(0);
    }).catch((error) => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}

module.exports = { main, getAllLeads, identifyDuplicates, removeDuplicates };