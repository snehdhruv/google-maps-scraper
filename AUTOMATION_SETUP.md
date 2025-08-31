# 🚀 Complete Daily Automation Setup Guide

## 📋 Overview
This guide sets up a fully automated daily lead generation system that:
- Runs the optimized Apify scraper daily for $20 worth of leads
- Processes email + social media contacts through N8N
- Stores enriched data in BigQuery with enhanced schema
- Feeds clean leads into SmartLead for outreach

## 🕐 Step 1: Set Up Apify Daily Scheduling

Since the Apify CLI doesn't support direct scheduling, follow these steps in the Apify Console:

### 1.1 Create a Scheduled Task
1. Go to [Apify Console](https://console.apify.com)
2. Navigate to your `google-places-lead-scraper` actor
3. Click **"Create Task"**
4. Configure the task:
   - **Name**: `daily-lead-scraper-$20`
   - **Input**: Use the `daily-automation-input.json` configuration
   - **Schedule**: Set to run daily at 8:00 AM PST: `0 8 * * *`
   - **Timeout**: 3 hours (enough for $20 worth of scraping)
   - **Memory**: 8192 MB (for faster processing)

### 1.2 Configure Daily Input
The task will use this optimized daily configuration:
```json
{
  "searchTerms": "sports bar, restaurant, hair salon, barber shop, auto repair shop, medical office, nail salon, wings restaurant, pizza place, brewery, car dealership, fitness center",
  "useTopUSCities": true,
  "maxCities": 7,
  "radiusMeters": 10000,
  "maxPerTerm": 30,
  "maxDailyCost": 20,
  "enableRateLimiting": true,
  "cohortCount": 14,
  "cityCohortIndex": -1
}
```

### 1.3 Set Up Webhook Integration
1. In the task settings, add webhook URL: `https://your-n8n-instance.com/webhook/apify-webhook`
2. Configure webhook to trigger on: `ACTOR.RUN.SUCCEEDED`

## 🔧 Step 2: Update BigQuery Schema

Run the schema update script to add support for social media contacts:

```bash
cd "/Users/snehdhruv/Documents/GitHub/Apify/googlemaps scraper"
gcloud auth login
gcloud config set project YOUR_PROJECT_ID
./update-bigquery-schema.sh
```

This adds new columns for:
- `contact_method` (email, instagram, facebook, twitter)
- `contact_value` (actual email/handle)
- `contact_priority` (100=business email, 50=personal, 30=social)
- Social platform details and enhanced analytics

## 🔄 Step 3: Deploy Enhanced N8N Workflow

### 3.1 Import the Enhanced Workflow
1. Open your N8N instance
2. Import the enhanced workflow from `enhanced-n8n-workflow.json`
3. Update the following in the workflow:
   - **Project ID**: Replace `trillboard-new` with your GCP project
   - **Apify API Key**: Update the Bearer token in the HTTP Request node
   - **BigQuery Credentials**: Configure your service account credentials

### 3.2 Key Improvements in Enhanced Workflow
- **Multi-contact processing**: Handles both emails and social media contacts
- **Priority-based sorting**: Business emails first, then personal, then social
- **Enhanced BigQuery schema**: Stores contact methods separately for better analytics
- **Backward compatibility**: Still works with existing Smartlead integration

## 📊 Step 4: Monitor & Analytics

### 4.1 BigQuery Analytics Queries

**Daily Contact Extraction Performance:**
```sql
SELECT 
  DATE(scraped_at) as date,
  COUNT(DISTINCT place_id) as businesses_found,
  COUNTIF(contact_method = 'email') as email_contacts,
  COUNTIF(contact_method LIKE '%instagram%') as instagram_contacts,
  COUNTIF(contact_method LIKE '%facebook%') as facebook_contacts,
  ROUND(COUNTIF(contact_method = 'email') / COUNT(DISTINCT place_id) * 100, 1) as email_success_rate,
  ROUND(COUNTIF(contact_method != 'none') / COUNT(DISTINCT place_id) * 100, 1) as total_contact_rate
FROM `your-project.lead_pipeline.leads_scraped`
WHERE DATE(scraped_at) >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)
GROUP BY 1 ORDER BY 1 DESC;
```

**Contact Method Performance by Business Type:**
```sql
SELECT * FROM `your-project.lead_pipeline.v_contact_analysis`
WHERE scraped_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)
ORDER BY total_contacts DESC;
```

### 4.2 Set Up Monitoring Alerts
Create BigQuery scheduled queries to monitor:
- Daily scraping volume vs. $20 budget
- Contact extraction success rates
- New unique leads discovered
- BigQuery→SmartLead pipeline health

## 🎯 Step 5: Expected Daily Results

With the optimized scraper running daily for $20:

### Volume Projections
- **~740 leads per day** ($20 ÷ $0.027 per lead)
- **~350 businesses with websites** (47% rate)
- **~220 email contacts** (30% email extraction rate)
- **~435 social media contacts** (59% social extraction rate)
- **~655 total contactable businesses** (89% combined contact rate)

### Geographic Coverage
- **7 cities per day** from top US markets
- **14-day rotation cycle** covers ~100 major cities
- **Systematic coverage** with no city overlap within 2 weeks

### Business Type Diversity
- **12 business categories** per day
- **30 leads per category** maximum
- **Balanced portfolio** across restaurants, salons, services, retail

## 🔄 Step 6: Automation Monitoring

### 6.1 Daily Health Checks
Monitor these metrics daily:
```sql
-- Today's automation health check
SELECT 
  'Apify Scraping' as process,
  COUNT(*) as records_processed,
  ROUND(SUM(CAST(JSON_EXTRACT_SCALAR(raw_data, '$.apifyRunId') IS NOT NULL AS INT64)) / COUNT(*) * 100, 1) as success_rate
FROM `your-project.lead_pipeline.leads_scraped`
WHERE DATE(scraped_at) = CURRENT_DATE()

UNION ALL

SELECT 
  'BigQuery Processing' as process,
  COUNT(*) as records_processed,
  ROUND(COUNT(*) / 740 * 100, 1) as expected_volume_percentage  
FROM `your-project.lead_pipeline.leads_unique`
WHERE DATE(first_seen) = CURRENT_DATE();
```

### 6.2 Cost Monitoring
Track daily costs to ensure $20 budget compliance:
```sql
-- Estimated daily costs based on API calls
SELECT 
  DATE(scraped_at) as date,
  COUNT(DISTINCT apify_run_id) as runs_today,
  COUNT(*) as total_leads,
  ROUND(COUNT(*) * 0.027, 2) as estimated_cost_usd
FROM `your-project.lead_pipeline.leads_scraped`
WHERE DATE(scraped_at) = CURRENT_DATE();
```

## ✅ Success Metrics

Your automated system is working correctly when you see:
- **Daily execution** at 8 AM PST without manual intervention
- **~740 new leads** processed daily
- **$20 daily cost** maintained consistently  
- **89% contact rate** (email + social combined)
- **Clean data flow** from Apify → BigQuery → SmartLead
- **No duplicate processing** across days

## 🚨 Troubleshooting

**If daily volume is low:**
- Check Apify task logs for API rate limiting
- Verify BigQuery deduplication isn't over-filtering
- Ensure webhook is triggering N8N properly

**If contact extraction drops:**
- Monitor website availability (suspended domains)
- Check DNS validation performance
- Verify social media extraction isn't failing

**If costs exceed $20:**
- Review rate limiting settings in Apify actor
- Check if hexagonal grid generation is working correctly
- Verify daily cohort rotation is preventing overlap

The system is now fully automated and will generate high-quality, contactable business leads daily without manual intervention! 🎉