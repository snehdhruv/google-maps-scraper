# Apify → BigQuery → Gemini AI → Smartlead Automation

Complete event-driven pipeline that automatically processes Google Maps leads from Apify, stores them in BigQuery with deduplication, generates personalized emails using Gemini AI, and enrolls them in Smartlead campaigns.

## Architecture Overview

```
Apify Actor Completion → Webhook → n8n Workflow
    ↓
Fetch Dataset → Normalize Data → BigQuery Raw Insert
    ↓
Dedupe Query → Gemini AI Personalization → Batch Processing
    ↓
Smartlead Enrollment → Results Logging
```

## Features

✅ **Event-driven automation** - No polling, triggers on Apify completion  
✅ **AI-powered personalization** - Gemini generates custom emails per business type  
✅ **Smart deduplication** - Prevents re-contacting existing leads  
✅ **Batch processing** - Respects Smartlead API limits (100 leads/request)  
✅ **Comprehensive logging** - Full monitoring and error tracking  
✅ **Business intelligence** - Analytics views for campaign performance  

## Quick Start

### 1. Setup BigQuery

Run the setup script to create tables and views:

```bash
chmod +x bigquery-setup.sh
./bigquery-setup.sh
```

This creates:
- `leads_scraped` - Raw data from Apify
- `leads_unique` - Deduplicated leads with Smartlead status
- `processing_log` - Workflow execution monitoring
- `email_templates` - AI personalization templates

### 2. Configure n8n

1. **Import the workflow:**
   ```bash
   # Import the workflow JSON into your n8n instance
   cat apify-gemini-smartlead-workflow.json
   ```

2. **Update configuration:**
   - Replace `YOUR_PROJECT_ID` with your GCP project ID
   - Replace `YOUR_CAMPAIGN_ID` with your Smartlead campaign ID
   - Configure credentials (see below)

3. **Set up credentials:**
   - Google BigQuery OAuth2 API
   - Google Gemini API
   - No auth needed for HTTP requests (API keys in headers)

### 3. Configure Apify Webhook

In your Apify Actor/Task settings:

- **Event:** `ACTOR.RUN.SUCCEEDED` or `TASK.RUN.SUCCEEDED`
- **Request URL:** Your n8n webhook URL (shown after importing workflow)
- **Payload:** Include run ID and dataset ID

Example webhook URL: `https://your-n8n.domain.com/webhook/apify-webhook`

### 4. Test the Pipeline

Trigger a test Apify run and monitor the workflow execution in n8n.

## Configuration Details

### Environment Variables

The workflow uses these API keys (already embedded in the JSON):

```bash
# Apify
APIFY_API_KEY=your_apify_api_key_here

# Smartlead  
SMARTLEAD_API_KEY=your_smartlead_api_key_here

# Google API (for Gemini)
GOOGLE_API_KEY=your_google_api_key_here

# BigQuery
PROJECT_ID=your_project_id_here
DATASET_ID=your_dataset_id_here
TABLE_ID=your_table_id_here
```

**Important**: Create a `.env` file in the root directory with these values. The `.env` file is already in `.gitignore` and will not be pushed to GitHub.

**Environment Variable Setup:**
The scripts now use environment variables for secure configuration. Make sure to:
1. Install python-dotenv: `pip install python-dotenv`
2. Create a `.env` file with your actual API keys
3. The scripts will automatically load these environment variables

### BigQuery Project Configuration

Update these values in the workflow:
- `YOUR_PROJECT_ID` → Your GCP project ID
- `YOUR_CREDENTIAL_ID` → Your n8n BigQuery credential ID

### Smartlead Campaign Configuration

Update in the "Enroll in Smartlead" node:
- Campaign ID in the URL path
- Optional: Custom fields mapping

## Workflow Nodes Explained

### 1. Apify Webhook Trigger
- Receives POST webhooks from Apify
- Extracts `resource.defaultDatasetId` and run metadata

### 2. Fetch Apify Dataset
- Makes authenticated GET request to Apify API
- Retrieves all items from the dataset with `clean=true`

### 3. Normalize & Validate Data
- JavaScript code node that:
  - Cleans and validates email addresses
  - Filters out role-based emails (info@, admin@, etc.)
  - Standardizes address and business information
  - Adds metadata (source, timestamps, run IDs)

### 4. Insert to BigQuery Raw
- Streams all data to `leads_scraped` table
- Preserves complete raw data for audit trail

### 5. Deduplicate in BigQuery
- SQL query that:
  - Identifies new leads not in `leads_unique` table
  - Inserts only new leads
  - Returns new leads for downstream processing

### 6. Gemini AI Personalization
- Uses Google Gemini 1.5 Pro model
- Generates personalized emails based on:
  - Business name and category
  - Location and ratings
  - Industry-specific value propositions
- Follows templates in `gemini-email-prompt.txt`

### 7. Prepare for Smartlead
- Formats data for Smartlead API
- Creates subject lines based on business type
- Maps custom fields for segmentation

### 8. Split in Batches
- Chunks leads into groups of 100
- Respects Smartlead API rate limits

### 9. Enroll in Smartlead
- POST request to Smartlead campaigns API
- Includes personalized content and custom fields
- Uses deduplication options

### 10. Process Results & Log
- Handles API responses
- Logs success/failure metrics to BigQuery
- Enables monitoring and analytics

## Gemini AI Personalization

The workflow generates personalized emails using business-specific prompts:

### Business Type Examples:

**Restaurants:**
```
"Show your daily specials and menu items on your screens instead of random YouTube ads"
```

**Gyms:**
```
"Display class schedules and member achievements instead of irrelevant content"
```

**Bars:**
```
"Promote happy hour and events on your TVs instead of other brands' ads"
```

### Customization:

Edit the Gemini prompt in the workflow or modify templates in BigQuery:

```sql
UPDATE `your-project.lead_pipeline.email_templates`
SET gemini_prompt = 'Your custom prompt...'
WHERE template_id = 'default_trillboards_v1';
```

## Monitoring & Analytics

### Check Processing Logs:
```sql
SELECT * FROM `your-project.lead_pipeline.processing_log`
ORDER BY timestamp DESC LIMIT 10;
```

### Campaign Performance:
```sql
SELECT * FROM `your-project.lead_pipeline.v_campaign_performance`
WHERE enrollment_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY);
```

### Duplicate Detection:
```sql
SELECT * FROM `your-project.lead_pipeline.v_duplicate_emails`
WHERE occurrence_count > 1;
```

## Troubleshooting

### Common Issues:

1. **Webhook not triggering:**
   - Check Apify webhook configuration
   - Verify n8n webhook URL is accessible
   - Test with manual webhook POST

2. **BigQuery permission errors:**
   - Ensure service account has BigQuery Data Editor role
   - Check dataset and table permissions

3. **Gemini API errors:**
   - Verify API key is valid and has Gemini access
   - Check quota limits in Google Cloud Console

4. **Smartlead enrollment failures:**
   - Verify campaign ID exists and is active
   - Check API key permissions
   - Review lead format requirements

### Debug Mode:

Enable detailed logging by adding this to any Code node:
```javascript
console.log('Debug data:', JSON.stringify($input.all(), null, 2));
```

## Data Schema

### leads_scraped (Raw Data)
```sql
email STRING
business_name STRING  
phone STRING
website STRING
address STRING
city STRING
category STRING
rating FLOAT64
review_count INT64
place_id STRING
latitude FLOAT64
longitude FLOAT64
source STRING
scraped_at TIMESTAMP
apify_run_id STRING
raw_data JSON
```

### leads_unique (Deduplicated)
```sql
-- All fields from leads_scraped plus:
email_hash STRING
first_seen TIMESTAMP
last_seen TIMESTAMP
update_count INT64
smartlead_campaign_id STRING
smartlead_lead_id STRING
smartlead_enrolled_at TIMESTAMP
smartlead_status STRING
personalized_subject STRING
personalized_email STRING
ai_personalization_version STRING
```

## Performance

- **Typical Processing Time:** 2-5 minutes for 100 leads
- **BigQuery Costs:** ~$0.01 per 1000 leads processed
- **Gemini API Costs:** ~$0.02 per 100 personalized emails
- **Throughput:** Up to 1000 leads per workflow execution

## Security

- API keys are embedded in workflow (consider using n8n environment variables)
- BigQuery uses service account authentication
- All data is encrypted in transit and at rest
- Webhook endpoint should be secured with authentication

## Contributing

To modify the workflow:

1. Export from n8n as JSON
2. Update the configuration
3. Test with validation:
   ```bash
   # Use n8n MCP tools to validate
   ```
4. Import back to n8n

## Support

For issues:
1. Check n8n execution logs
2. Review BigQuery processing_log table
3. Verify API credentials and quotas
4. Test individual nodes in isolation

---

**Next Steps:**
1. Run `./bigquery-setup.sh`
2. Import workflow to n8n
3. Configure credentials
4. Set up Apify webhook
5. Test with a sample run