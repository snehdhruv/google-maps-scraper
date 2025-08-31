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

## Key Commands

### Development Commands
- `npm install` - Install dependencies
- `npm start` or `node main.js` - Run the scraper locally
- `npm test` - Run Jest tests with coverage
- `npm run lint` - Run ESLint for code quality checks
- `apify run -p` - Run the Actor locally with Apify CLI
- `apify push` - Deploy the Actor to Apify platform
- `node monitor-api-usage.js` - Monitor API usage and costs

### Environment Setup
- Requires `GOOGLE_API_KEY` environment variable (restricted to Places and Geocoding APIs)
- Uses ES6 modules (`"type": "module"` in package.json)

## Architecture

## Project Overview

This is a Google Places Lead Scraper built as an Apify Actor that extracts SMB (Small and Medium Business) leads from Google Places API, enriches them with email addresses from business websites, and outputs deduplicated results with billing protection.

You are an expert in n8n automation software using n8n-MCP tools. Your role is to design, build, and validate n8n workflows with maximum accuracy and efficiency.

### Core Components

1. **main.js** - Entry point containing:
   - `APIRateLimiter` class for billing protection and rate limiting
   - Geocoding and Places API integration
   - Hexagonal grid generation for efficient area coverage
   - Email extraction from business websites
   - Data deduplication and normalization

2. **helpers.js** - Utility functions:
   - `extractEmails()` - Scrapes emails from websites with business pattern detection
   - `normalizePhone()` - Converts phone numbers to E.164 format
   - `dedupePlaces()` - Removes duplicate places by placeId
   - `enrichPlaceDetails()` - Adds missing details via Place Details API
   - Email validation with disposable domain filtering

3. **input_schema.json** - Defines Actor input parameters:
   - searchTerms (comma-separated)
   - location (text or lat,lng)
   - radiusMeters
   - maxPerTerm
   - maxDailyCost ($1-$500 limit)
   - enableRateLimiting

4. **monitor-api-usage.js** - Standalone script for tracking API costs

### Key Features

- **Billing Protection**: Real-time cost tracking with configurable daily limits
- **Rate Limiting**: 100ms minimum interval between API calls
- **Hexagonal Grid Coverage**: 15% more efficient than square grid
- **Email Enrichment**: Visits business websites to extract contact emails
- **Smart Deduplication**: By placeId to avoid duplicate entries

### Data Flow

1. Parse input parameters (search terms, location, radius)
2. Geocode location if needed
3. Generate hexagonal grid of search points
4. For each search term and grid point:
   - Call Places API with rate limiting
   - Extract basic business info
   - Visit website to scrape emails
   - Normalize phone numbers
5. Deduplicate results by placeId
6. Save to Apify dataset

### Testing

- Jest test framework with Babel for ES6 modules
- Test files in `tests/` directory
- Coverage reports in `coverage/` directory
- Run with `npm test` for full coverage report

### API Integration

- Google Places Nearby Search API
- Google Geocoding API  
- Google Place Details API (for enrichment)
- All API calls include rate limiting and cost tracking

### Cost Optimization

- Default 5000m radius (4x fewer calls than 2500m)
- Hexagonal grid pattern (15% fewer points)
- Configurable daily spending limits
- Real-time cost estimation and monitoring