# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Core Workflow Process

1. **ALWAYS start new conversation with**: `tools_documentation()` to understand best practices and available tools.

2. **Discovery Phase** - Find the right nodes:
   - Think deeply about user request and the logic you are going to build to fulfill it. Ask follow-up questions to clarify the user's intent, if something is unclear. Then, proceed with the rest of your instructions.
   - `search_nodes({query: 'keyword'})` - Search by functionality
   - `list_nodes({category: 'trigger'})` - Browse by category
   - `list_ai_tools()` - See AI-capable nodes (remember: ANY node can be an AI tool!)

3. **Configuration Phase** - Get node details efficiently:
   - `get_node_essentials(nodeType)` - Start here! Only 10-20 essential properties
   - `search_node_properties(nodeType, 'auth')` - Find specific properties
   - `get_node_for_task('send_email')` - Get pre-configured templates
   - `get_node_documentation(nodeType)` - Human-readable docs when needed
   - It is good common practice to show a visual representation of the workflow architecture to the user and asking for opinion, before moving forward. 

4. **Pre-Validation Phase** - Validate BEFORE building:
   - `validate_node_minimal(nodeType, config)` - Quick required fields check
   - `validate_node_operation(nodeType, config, profile)` - Full operation-aware validation
   - Fix any validation errors before proceeding

5. **Building Phase** - Create the workflow:
   - Use validated configurations from step 4
   - Connect nodes with proper structure
   - Add error handling where appropriate
   - Use expressions like $json, $node["NodeName"].json
   - Build the workflow in an artifact for easy editing downstream (unless the user asked to create in n8n instance)

6. **Workflow Validation Phase** - Validate complete workflow:
   - `validate_workflow(workflow)` - Complete validation including connections
   - `validate_workflow_connections(workflow)` - Check structure and AI tool connections
   - `validate_workflow_expressions(workflow)` - Validate all n8n expressions
   - Fix any issues found before deployment

7. **Deployment Phase** (if n8n API configured):
   - `n8n_create_workflow(workflow)` - Deploy validated workflow
   - `n8n_validate_workflow({id: 'workflow-id'})` - Post-deployment validation
   - `n8n_update_partial_workflow()` - Make incremental updates using diffs
   - `n8n_trigger_webhook_workflow()` - Test webhook workflows

## Key Insights

- **USE CODE NODE ONLY WHEN IT IS NECESSARY** - always prefer to use standard nodes over code node. Use code node only when you are sure you need it.
- **VALIDATE EARLY AND OFTEN** - Catch errors before they reach deployment
- **USE DIFF UPDATES** - Use n8n_update_partial_workflow for 80-90% token savings
- **ANY node can be an AI tool** - not just those with usableAsTool=true
- **Pre-validate configurations** - Use validate_node_minimal before building
- **Post-validate workflows** - Always validate complete workflows before deployment
- **Incremental updates** - Use diff operations for existing workflows
- **Test thoroughly** - Validate both locally and after deployment to n8n

## Validation Strategy

### Before Building:
1. validate_node_minimal() - Check required fields
2. validate_node_operation() - Full configuration validation
3. Fix all errors before proceeding

### After Building:
1. validate_workflow() - Complete workflow validation
2. validate_workflow_connections() - Structure validation
3. validate_workflow_expressions() - Expression syntax check

### After Deployment:
1. n8n_validate_workflow({id}) - Validate deployed workflow
2. n8n_list_executions() - Monitor execution status
3. n8n_update_partial_workflow() - Fix issues using diffs

## Response Structure

1. **Discovery**: Show available nodes and options
2. **Pre-Validation**: Validate node configurations first
3. **Configuration**: Show only validated, working configs
4. **Building**: Construct workflow with validated components
5. **Workflow Validation**: Full workflow validation results
6. **Deployment**: Deploy only after all validations pass
7. **Post-Validation**: Verify deployment succeeded

## Example Workflow

### 1. Discovery & Configuration
search_nodes({query: 'slack'})
get_node_essentials('n8n-nodes-base.slack')

### 2. Pre-Validation
validate_node_minimal('n8n-nodes-base.slack', {resource:'message', operation:'send'})
validate_node_operation('n8n-nodes-base.slack', fullConfig, 'runtime')

### 3. Build Workflow
// Create workflow JSON with validated configs

### 4. Workflow Validation
validate_workflow(workflowJson)
validate_workflow_connections(workflowJson)
validate_workflow_expressions(workflowJson)

### 5. Deploy (if configured)
n8n_create_workflow(validatedWorkflow)
n8n_validate_workflow({id: createdWorkflowId})

### 6. Update Using Diffs
n8n_update_partial_workflow({
  workflowId: id,
  operations: [
    {type: 'updateNode', nodeId: 'slack1', changes: {position: [100, 200]}}
  ]
})

## Important Rules

- ALWAYS validate before building
- ALWAYS validate after building
- NEVER deploy unvalidated workflows
- USE diff operations for updates (80-90% token savings)
- STATE validation results clearly
- FIX all errors before proceeding

## Project Overview

This repository contains a complete B2B lead automation pipeline that:
1. **Apify Google Places Scraper** - Extracts SMB leads from Google Maps with email enrichment
2. **N8N Workflow Automation** - Processes leads through BigQuery with Gemini AI personalization  
3. **SmartLead Integration** - Enrolls personalized leads into email campaigns

The pipeline is event-driven: Apify completion → Webhook → N8N → BigQuery → Gemini AI → SmartLead

## Core Architecture

### Data Flow
```
Google Maps → Apify Actor → N8N Webhook → BigQuery (Raw) → 
Deduplication → Gemini AI → BigQuery (Processed) → SmartLead → Analytics
```

### Key Components
- **google-places-lead-scraper/**: Apify Actor for lead scraping with email enrichment
- **apify-gemini-smartlead-workflow*.json**: N8N workflow configurations
- **bigquery-setup.sh**: Database schema and views setup script
- **gemini-email-prompt.txt**: AI personalization templates

## Development Commands

### Apify Actor Development
```bash
# Local development
cd google-places-lead-scraper/
npm install
npm start                    # Run scraper locally
npm test                     # Run Jest tests with coverage
npm run lint                 # ESLint code quality checks

# Apify platform
apify run -p                 # Run locally with Apify CLI
apify push                   # Deploy to Apify platform
node monitor-api-usage.js    # Monitor API costs
```

### BigQuery Setup
```bash
chmod +x bigquery-setup.sh
./bigquery-setup.sh          # Creates datasets, tables, and views
```

### N8N Workflow Management
Use N8N MCP tools for workflow operations:
- Import workflow JSON files into N8N instance
- Configure credentials (Google BigQuery OAuth2, Gemini API)
- Set up webhooks for Apify integration

## Lead Scraper Architecture

### Core Classes
- **APIRateLimiter**: Billing protection with configurable daily limits ($1-$500)
- **Main Script**: Hexagonal grid generation, Places API integration, email extraction

### Key Features
- **Hexagonal Grid Coverage**: 15% more efficient than square grids for geographic searches
- **Email Enrichment**: Scrapes business websites to extract contact emails with pattern detection
- **Real-time Cost Tracking**: Prevents API overspend with rate limiting (100ms intervals)
- **Smart Deduplication**: By placeId to avoid duplicates across search areas

### Input Parameters (input_schema.json)
- `searchTerms`: Comma-separated business categories
- `location`: Text address or lat,lng coordinates  
- `radiusMeters`: Search radius (default 5000m for cost efficiency)
- `maxPerTerm`: Results per search term
- `maxDailyCost`: Billing protection limit
- `enableRateLimiting`: API throttling control

## N8N Workflow Structure

### Critical Nodes
1. **Apify Webhook Trigger**: Receives completion events
2. **Data Normalization**: Email validation, phone formatting (E.164)
3. **BigQuery Raw Insert**: Preserves complete audit trail
4. **Deduplication Query**: Identifies new leads only
5. **Gemini AI Personalization**: Generates subject + body based on business type
6. **Batch Processing**: Respects SmartLead API limits (100 leads/request)
7. **SmartLead Enrollment**: Campaign integration with custom fields

### Business-Specific Personalization
Gemini AI generates tailored emails based on:
- **Restaurants**: Menu specials, wait times, customer reviews
- **Gyms**: Class schedules, member achievements, workout tips  
- **Bars**: Event promotions, drink specials, social media feeds
- **Salons**: Portfolio displays, service menus, booking QR codes
- **Medical**: Wait updates, health tips, insurance info

## Database Schema

### Core Tables
- **leads_scraped**: Raw Apify data (append-only audit trail)
- **leads_unique**: Deduplicated leads with SmartLead status tracking
- **leads_with_emails**: Generated personalized content storage
- **processing_log**: Workflow execution monitoring
- **email_templates**: A/B testing templates for personalization

### Analytics Views
- **v_campaign_performance**: Enrollment metrics by date/city/category
- **v_duplicate_emails**: Quality control for duplicate detection

## Configuration Requirements

### Environment Variables
- `GOOGLE_API_KEY`: Places/Geocoding API access (embedded in workflow)
- `SMARTLEAD_API_KEY`: Campaign enrollment access  
- `APIFY_API_KEY`: Dataset fetching access

### API Keys Location
- Embedded in N8N workflow JSON files (consider moving to environment variables)
- BigQuery uses OAuth2 service account authentication
- Gemini API key included in HTTP request URLs

## Cost Optimization

### Default Settings
- **Search Radius**: 5000m (4x fewer API calls than 2500m)
- **Grid Pattern**: Hexagonal (15% fewer search points)
- **Daily Limits**: Configurable $1-$500 spending protection
- **Rate Limiting**: 100ms minimum between API calls

### Typical Costs
- **Processing**: ~$0.01 per 1000 leads (BigQuery)
- **AI Personalization**: ~$0.02 per 100 emails (Gemini)
- **Throughput**: Up to 1000 leads per workflow execution

## Key Integration Points

### Apify → N8N Webhook
- Event: `ACTOR.RUN.SUCCEEDED` or `TASK.RUN.SUCCEEDED`
- Payload: Includes run ID and dataset ID for fetching results
- URL format: `https://your-n8n.domain.com/webhook/apify-webhook`

### BigQuery Integration
- Streaming inserts for real-time processing
- SQL-based deduplication using email hashing
- Monitoring views for campaign analytics

### SmartLead Integration  
- Batch enrollment API (max 100 leads per request)
- Custom field mapping for segmentation
- Status tracking for campaign management

## Monitoring & Troubleshooting

### Key Queries
```sql
-- Processing status
SELECT * FROM `project.lead_pipeline.processing_log` ORDER BY timestamp DESC LIMIT 10;

-- Campaign performance  
SELECT * FROM `project.lead_pipeline.v_campaign_performance` 
WHERE enrollment_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY);

-- Duplicate detection
SELECT * FROM `project.lead_pipeline.v_duplicate_emails` WHERE occurrence_count > 1;
```

### Debug Approaches
- Check N8N execution logs for workflow failures
- Monitor BigQuery processing_log for data issues
- Verify API credentials and quota limits
- Test individual workflow nodes in isolation

## Gemini AI Personalization

### Prompt Engineering
- Business-specific value propositions stored in `gemini-email-prompt.txt`
- JSON response format: `{"subject": "...", "body": "..."}`
- Local tone with neighborhood references
- Industry-specific use cases and benefits

### A/B Testing Support
- Multiple email templates in BigQuery
- Performance tracking via analytics views
- Category and city-based template filtering