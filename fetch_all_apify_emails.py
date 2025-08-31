#!/usr/bin/env python3

import requests
import json
import hashlib
from datetime import datetime
from google.cloud import bigquery
import os
import sys
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Configuration
APIFY_API_KEY = os.getenv("APIFY_API_KEY")
PROJECT_ID = os.getenv("PROJECT_ID", "trillboard-new")
DATASET_ID = os.getenv("DATASET_ID", "lead_pipeline")
TABLE_ID = os.getenv("TABLE_ID", "leads_scraped")

# Validate required environment variables
if not APIFY_API_KEY:
    raise ValueError("APIFY_API_KEY environment variable is required. Please set it in your .env file.")

# Initialize BigQuery client
client = bigquery.Client(project=PROJECT_ID)

def get_successful_runs():
    """Get all successful Apify runs"""
    url = f"https://api.apify.com/v2/acts/snehdhruv~google-places-lead-scraper/runs?limit=50"
    headers = {"Authorization": f"Bearer {APIFY_API_KEY}"}
    
    response = requests.get(url, headers=headers)
    response.raise_for_status()
    
    runs = response.json()["data"]["items"]
    successful_runs = [run for run in runs if run["status"] == "SUCCEEDED"]
    
    print(f"Found {len(successful_runs)} successful runs")
    return successful_runs

def fetch_dataset_items(dataset_id, limit=10000):
    """Fetch all items from an Apify dataset"""
    url = f"https://api.apify.com/v2/datasets/{dataset_id}/items"
    headers = {"Authorization": f"Bearer {APIFY_API_KEY}"}
    params = {"clean": "true", "limit": limit}
    
    response = requests.get(url, headers=headers, params=params)
    response.raise_for_status()
    
    return response.json()

def normalize_email_data(items, run_id):
    """Convert Apify items to BigQuery format"""
    normalized_data = []
    timestamp = datetime.utcnow().isoformat()
    
    # Filter out role-based emails
    role_prefixes = ['noreply', 'no-reply', 'postmaster', 'abuse', 'mailer-daemon', 
                     'bounce', 'webmaster', 'root', 'sysadmin', 'system']
    
    for item in items:
        if not item.get("emailList"):
            continue
            
        for email_raw in item["emailList"]:
            if not email_raw:
                continue
                
            email = str(email_raw).lower().strip()
            if not email:
                continue
                
            # Skip role-based emails
            if any(email.startswith(f"{prefix}@") for prefix in role_prefixes):
                continue
                
            # Skip obvious test emails
            if any(domain in email for domain in ['example.com', 'test.com', 'domain.com']):
                continue
                
            normalized_data.append({
                "email": email,
                "business_name": item.get("name", ""),
                "phone": item.get("phone", ""),
                "website": item.get("website", ""),
                "address": item.get("formattedAddress", ""),
                "city": "",
                "state": "",
                "postal_code": "",
                "country": "USA",
                "category": item.get("searchTerm", ""),
                "rating": float(item.get("rating", 0)),
                "review_count": int(item.get("userRatingsTotal", 0)),
                "place_id": item.get("placeId", ""),
                "google_maps_url": item.get("googleMapsUrl", ""),
                "latitude": float(item.get("lat", 0)),
                "longitude": float(item.get("lng", 0)),
                "opening_hours": "{}",
                "source": "apify/google-maps",
                "scraped_at": timestamp,
                "apify_run_id": run_id,
                "list_key": f"{timestamp[:10]}_bulk_import",
                "raw_data": json.dumps(item)
            })
    
    return normalized_data

def insert_to_bigquery(data):
    """Insert data into BigQuery"""
    if not data:
        print("No data to insert")
        return
        
    table_ref = client.dataset(DATASET_ID).table(TABLE_ID)
    
    # Configure insert job
    job_config = bigquery.LoadJobConfig(
        write_disposition=bigquery.WriteDisposition.WRITE_APPEND,
        autodetect=False
    )
    
    try:
        job = client.load_table_from_json(data, table_ref, job_config=job_config)
        job.result()  # Wait for the job to complete
        
        print(f"Inserted {len(data)} records into BigQuery")
        return True
    except Exception as e:
        print(f"Error inserting to BigQuery: {e}")
        return False

def main():
    print("Starting bulk import of Apify data...")
    
    # Get all successful runs
    runs = get_successful_runs()
    
    all_data = []
    processed_datasets = set()
    
    for run in runs:
        dataset_id = run["defaultDatasetId"]
        run_id = run["id"]
        started_at = run["startedAt"]
        
        # Skip if we've already processed this dataset
        if dataset_id in processed_datasets:
            print(f"Skipping already processed dataset {dataset_id}")
            continue
            
        print(f"Processing dataset {dataset_id} from run {run_id} (started {started_at})")
        
        try:
            # Fetch dataset items
            items = fetch_dataset_items(dataset_id)
            print(f"Fetched {len(items)} items from dataset {dataset_id}")
            
            # Normalize data
            normalized = normalize_email_data(items, run_id)
            print(f"Normalized {len(normalized)} email records")
            
            all_data.extend(normalized)
            processed_datasets.add(dataset_id)
            
        except Exception as e:
            print(f"Error processing dataset {dataset_id}: {e}")
            continue
    
    print(f"Total unique email records to insert: {len(all_data)}")
    
    if all_data:
        # Insert in batches to avoid timeouts
        batch_size = 1000
        for i in range(0, len(all_data), batch_size):
            batch = all_data[i:i + batch_size]
            print(f"Inserting batch {i//batch_size + 1} ({len(batch)} records)")
            
            success = insert_to_bigquery(batch)
            if not success:
                print(f"Failed to insert batch {i//batch_size + 1}")
                sys.exit(1)
    
    print("Bulk import completed successfully!")

if __name__ == "__main__":
    main()