# ak-audit

A comprehensive data warehouse schema auditing tool that generates detailed reports about your BigQuery datasets. Built for humans who need to understand, document, and analyze their data warehouse structure and are unhappy with the stock web UI offering.

## Overview

ak-audit is a Node.js command-line tool designed to comprehensively audit BigQuery datasets. It analyzes table schemas, retrieves sample data, identifies potential join keys, and generates interactive HTML reports with data lineage visualization.

**Key Features:**
- 🔍 **Complete Schema Analysis** - Nested fields, data types, partitioning, clustering
- 📊 **Interactive HTML Reports** - Mixpanel-themed dashboard with charts and visualizations  
- 🔗 **Smart Join Key Detection** - Identifies potential relationships between tables
- 🌐 **Data Lineage Mapping** - Visual ERD showing table dependencies and relationships
- 🚀 **Dual Permission Support** - Works with both DataViewer and JobUser roles
- 📈 **Table Analytics** - Size distributions, row counts, partition analysis
- 💾 **Multiple Output Formats** - JSON, CSV, and HTML reports

## Quick Start

```bash
# Install dependencies
npm install

# Basic audit (uses defaults)
node bigquery.js

# Full audit with custom parameters
node bigquery.js my-project my-dataset US ./output 25 "users,events,products"
```

## Installation

```bash
git clone https://github.com/yourusername/ak-audit.git
cd ak-audit
npm install
```

## Usage

### Command Syntax

```bash
node bigquery.js [PROJECT_ID] [DATASET_ID] [TABLE_FILTER] [LOCATION] [SAMPLE_LIMIT] [OUTPUT_DIR]
```

All parameters are optional and use sensible defaults for quick testing.

### Parameters

| Parameter | Position | Default | Description | Examples |
|-----------|----------|---------|-------------|----------|
| `PROJECT_ID` | 1 | `mixpanel-gtm-training` | Your Google Cloud project ID containing the BigQuery dataset | `my-company-prod`, `analytics-dev-123` |
| `DATASET_ID` | 2 | `warehouse_connectors` | The specific BigQuery dataset to audit within the project | `production_data`, `staging_warehouse`, `user_analytics` |
| `TABLE_FILTER` | 3 | `null` (all tables) | Comma-separated list of table names/patterns to audit (supports glob patterns) | `"users,events"`, `"frontend-*"`, `"*_temp,staging_*"` |
| `LOCATION` | 4 | `US` | BigQuery region where your dataset is located (affects query performance and costs) | `US`, `EU`, `us-central1`, `europe-west1` |
| `SAMPLE_LIMIT` | 5 | `10` | Maximum number of sample data rows to extract from each table | `5`, `25`, `100` (higher values = longer runtime) |
| `OUTPUT_DIR` | 6 | `./output` | Local directory where all audit reports and files will be saved | `./reports`, `~/audit-results`, `/tmp/bq-audit` |

**Parameter Notes:**
- **PROJECT_ID**: Must have BigQuery enabled and proper IAM permissions configured
- **TABLE_FILTER**: Leave empty to audit all tables, or specify patterns to focus on specific table groups - now positioned early for convenient filtering
- **LOCATION**: Should match your dataset's location for optimal performance and to avoid cross-region charges
- **SAMPLE_LIMIT**: Larger values provide more comprehensive data samples but increase processing time and BigQuery costs
- **OUTPUT_DIR**: Positioned last as it's rarely changed from the default

### Examples

```bash
# Basic usage - audit all tables with defaults
node bigquery.js

# Specify your own project and dataset
node bigquery.js my-company-prod analytics_warehouse

# Focus on specific tables with exact names
node bigquery.js my-project my-dataset "users,events,products"

# Audit tables matching patterns
node bigquery.js my-project my-dataset "frontend-*"
node bigquery.js my-project my-dataset "backend-*,api_*" 
node bigquery.js my-project my-dataset "*_events,*_users"

# EU dataset with custom location
node bigquery.js eu-project-123 user_data "" EU

# Production audit with more sample data
node bigquery.js prod-analytics warehouse "" US 50

# Development workflow - quick audit of staging tables with minimal samples
node bigquery.js dev-project staging_db "staging_*" US 5

# Mix exact names and patterns for comprehensive audit with custom output
node bigquery.js my-project my-dataset "core_users,frontend-*,temp_?,*_archive" US 15 ./custom-reports

# Multi-region setup example with custom output directory
node bigquery.js global-project emea_data "" europe-west1 20 ./emea-reports

# Clean output directory before new audit
npm run prune
```

**Real-world Usage Patterns:**

```bash
# Data team daily review - focus on summary tables
node bigquery.js analytics-prod warehouse "*_daily,*_summary"

# Schema migration planning with detailed samples
node bigquery.js staging-project new_schema "" US 25 ./migration-audit

# Compliance audit - focus on user data tables with minimal samples
node bigquery.js compliance-db pii_data "*users*,*profiles*,*customer*" US 5 ./compliance-reports

# Performance analysis - large tables only with extensive sampling
node bigquery.js perf-project analytics "events_*,logs_*" US 100 ./perf-audit

# Quick schema check - no samples needed
node bigquery.js my-project my-dataset "new_*" US 0 ./schema-check
```

### Table Filtering with Glob Patterns

The `TABLE_FILTER` parameter supports glob patterns for flexible table selection:

- **`*`** - Matches any number of characters
- **`?`** - Matches a single character  
- **Exact names** - Tables without glob characters are matched exactly
- **Mixed patterns** - Combine exact names and patterns in the same filter

**Examples:**
- `"frontend-*"` - Matches `frontend-users`, `frontend-events`, etc.
- `"*_temp"` - Matches `users_temp`, `events_temp`, etc.
- `"api_v?"` - Matches `api_v1`, `api_v2`, but not `api_v10`
- `"users,backend-*,temp_?"` - Combines exact match with patterns

**Case Insensitive:** All pattern matching is case-insensitive.

## Permission Modes

ak-audit automatically detects your BigQuery permissions and adapts its functionality accordingly.

### 🔍 DataViewer Mode
**IAM Role:** `roles/bigquery.dataViewer`

**What you get:**
- ✅ Complete schema analysis via REST API
- ✅ Table metadata (size, row counts, creation time)
- ✅ Sample data via REST API
- ✅ Join key detection
- ✅ Interactive HTML reports
- ❌ Row count queries (uses metadata instead)
- ❌ Partition-optimized sampling
- ❌ View definition extraction

**Setup:**
```bash
gcloud projects add-iam-policy-binding YOUR_PROJECT \\
  --member='user:your_name@yourdomain.com' \\
  --role='roles/bigquery.dataViewer'
```

### 🚀 DataViewer + JobUser Mode  
**IAM Roles:** `roles/bigquery.dataViewer` + `roles/bigquery.jobUser`

**What you get:**
- ✅ Everything from DataViewer mode, plus:
- ✅ Live row count queries
- ✅ Partition-optimized sample data
- ✅ View definitions and DDL
- ✅ Advanced partition analysis
- ✅ Cost-efficient sampling for large tables

**Setup:**
```bash
gcloud projects add-iam-policy-binding YOUR_PROJECT \\
  --member='user:your_name@yourdomain.com' \\
  --role='roles/bigquery.dataViewer'

gcloud projects add-iam-policy-binding YOUR_PROJECT \\
  --member='user:your_name@yourdomain.com' \\
  --role='roles/bigquery.jobUser'
```

## Output Structure

ak-audit creates a comprehensive directory structure with multiple report formats:

```
output/                          # OUTPUT_DIR parameter (default: ./output)
├── reports/                     # 📊 Main dashboard and aggregated reports
│   ├── index.html              # 🎯 Interactive dashboard (start here!)
│   ├── dataset_audit.json      # Complete audit data (machine-readable)
│   ├── all_tables_summary.csv  # High-level table metrics for spreadsheets
│   ├── all_schemas_catalog.csv # Consolidated schema catalog (all fields)
│   └── audit_summary.csv       # Dataset-level KPIs and totals
├── schemas/                     # 📋 Individual table schema files
│   ├── users.csv               # Schema for 'users' table
│   ├── events.csv              # Schema for 'events' table  
│   └── products.csv            # One CSV per audited table
└── samples/                     # 🔍 Sample data extracts
    ├── users.json              # Sample rows from 'users' table
    ├── events.json             # Sample rows from 'events' table
    └── products.json           # Actual data (respects SAMPLE_LIMIT)
```

### File Descriptions

**📊 reports/index.html** - Interactive web dashboard featuring:
- Summary cards with total rows, size, table counts
- Horizontal bar charts for size and row distributions  
- Interactive data lineage diagram with zoom/pan
- Searchable table browser with sample data preview

**📋 schemas/[table].csv** - Per-table schema files containing:
- Column names and nested field paths
- Data types (STRING, INT64, STRUCT, etc.)
- Nullability and partitioning information
- Join key annotations for relationship mapping

**🔍 samples/[table].json** - Raw sample data files with:
- Actual table data (up to SAMPLE_LIMIT rows)
- All columns included with proper data types
- Useful for data profiling and quality assessment

**📈 Aggregated Reports:**
- `dataset_audit.json` - Complete programmatic access to all audit data
- `all_tables_summary.csv` - Spreadsheet-friendly table metrics
- `all_schemas_catalog.csv` - Master catalog of all fields across tables

## Features Deep Dive

### 📊 Interactive Dashboard

The HTML report includes:

**Summary Cards:**
- Total Objects, Tables, Views
- Total Rows across all tables
- Total Dataset Size (human-readable)
- Objects with Permission Errors

**Analytics Charts:**
- Horizontal bar charts for table size and row distributions
- Table type breakdown (pie chart)
- Partitioned vs non-partitioned tables

**Data Lineage:**
- Interactive ERD with zoom/pan controls
- View dependencies (solid arrows)
- Join key relationships (dashed lines)
- Node highlighting and connection mapping

### 🔗 Smart Join Key Detection

ak-audit intelligently identifies potential join keys by:

- ✅ **Cross-table analysis** - Fields appearing in multiple tables
- ✅ **Data type filtering** - Only STRING/INT types considered
- ✅ **Top-level fields only** - Excludes nested struct/array fields
- ✅ **Smart exclusions** - Filters out common event fields like `event_id`, `timestamp`, etc.

**Excluded Fields:**
```javascript
event, event_name, event_id, insert_id, time, timestamp, 
created_at, updated_at, event_time, _table_suffix, 
_partitiontime, _partitiondate
```

### 🎯 Partition-Aware Sampling

For JobUser mode, ak-audit optimizes sample data collection:

- **Partitioned Tables:** Queries recent partitions instead of full table scans
- **Large Tables (1M+ rows):** Uses `TABLESAMPLE` for efficiency  
- **Cost Optimization:** Minimizes BigQuery compute costs
- **Smart Fallbacks:** REST API fallback when queries fail

### 📈 Advanced Schema Analysis

**Comprehensive Field Analysis:**
- Full nested field paths (supports BigQuery STRUCT/ARRAY)
- Data types with nullability
- Partitioning and clustering information
- Join key annotations

**Multiple Data Sources:**
- `INFORMATION_SCHEMA.COLUMN_FIELD_PATHS` (JobUser mode)
- `INFORMATION_SCHEMA.TABLES` (metadata)  
- BigQuery REST API (DataViewer mode)
- Legacy `__TABLES__` (fallback)

## Authentication

ak-audit uses Google Cloud SDK authentication:

```bash
# Login with your user account
gcloud auth login

# Or use service account
export GOOGLE_APPLICATION_CREDENTIALS="path/to/service-account.json"

# Set default project
gcloud config set project YOUR_PROJECT_ID
```

## Architecture

### Core Components

**bigquery.js** - Main execution engine
- BigQuery client library integration
- Dual permission mode support
- Error handling with colored terminal output
- Sequential table processing to avoid rate limits

**buildReport.js** - HTML report generation  
- Interactive Mixpanel-themed dashboard
- Chart.js integration for analytics
- D3.js for data lineage visualization
- Responsive design with search functionality

### Processing Flow

1. **Authentication Test** → Determines permission mode (DataViewer vs JobUser)
2. **Output Setup** → Creates organized directory structure  
3. **Table Discovery** → Fetches table list via SQL or REST API
4. **Join Key Analysis** → Cross-table field analysis for relationship detection
5. **Sequential Processing** → For each table:
   - Schema analysis with nested field support
   - Size/row count retrieval (method varies by permission mode)
   - Partition information gathering
   - Sample data collection with cost optimization
   - View definition extraction (JobUser only)
6. **Report Generation** → Creates JSON, CSV, and interactive HTML outputs

## Troubleshooting

### Common Issues

**Permission Denied:**
```bash
# Check your authentication
gcloud auth list

# Verify project access
gcloud projects list

# Check BigQuery permissions
bq ls YOUR_PROJECT:YOUR_DATASET
```

**No Sample Data:**
- Ensure tables have data
- Check if tables are partitioned (may need JobUser role for optimal sampling)
- Verify dataset exists and is accessible

**Charts Not Loading:**
- Check browser console for JavaScript errors
- Ensure HTML file is opened in a modern browser
- Try regenerating the report

### Performance Tips

**Parameter Optimization:**
- **`TABLE_FILTER`**: Use specific patterns like `"prod_*"` instead of auditing all tables in large datasets (100+ tables)
- **`SAMPLE_LIMIT`**: Start with `5-10` for exploration, use `25-50` for thorough analysis, avoid `100+` unless necessary
- **`LOCATION`**: Always match your dataset's region to avoid cross-region data transfer costs and latency
- **`OUTPUT_DIR`**: Use local SSD paths for faster I/O when processing large datasets

**Execution Strategies:**
- **Quick Assessment**: `node bigquery.js my-project my-dataset "" US 5`
- **Focused Audit**: `node bigquery.js my-project my-dataset "production_*" US 15`  
- **Deep Analysis**: `node bigquery.js my-project my-dataset "" US 50` (JobUser role recommended)

**Cost & Speed Considerations:**
- JobUser role provides better performance for large datasets through partition optimization
- DataViewer mode is sufficient for schema analysis and basic reporting
- Larger `SAMPLE_LIMIT` values increase BigQuery slot usage and costs
- Use glob patterns to avoid unnecessary table scans

**BigQuery Regions:**
- `US` - North America multi-region (most common)
- `EU` - Europe multi-region  
- `us-central1`, `us-east1` - Specific US regions
- `europe-west1`, `asia-southeast1` - Specific international regions

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes  
4. Test with different permission modes
5. Submit a pull request

## Roadmap

- 🔄 **Multi-warehouse support** (Snowflake, Redshift, etc.)
- 📱 **Mobile-responsive reports**
- 🔔 **Slack/email notifications**
- 📅 **Scheduled audits**
- 🔍 **Data quality checks**
- 📊 **Historical change tracking**

## Quick Reference

### Command Template
```bash
node bigquery.js [PROJECT] [DATASET] [TABLES] [REGION] [SAMPLES] [OUTPUT]
```

### Common Commands
```bash
# Quick audit with defaults
node bigquery.js

# Production dataset audit with table filtering
node bigquery.js prod-analytics warehouse "prod_*"

# Focus on specific table group with custom samples
node bigquery.js my-project my-data "user_*,event_*" US 25

# EU region with detailed sampling and custom output
node bigquery.js eu-proj analytics "" EU 50 ./eu-audit
```

### Parameter Quick Reference
| Param | Position | Purpose | Common Values |
|-------|----------|---------|---------------|
| 1 | PROJECT_ID | Project ID | `my-project`, `prod-analytics` |
| 2 | DATASET_ID | Dataset | `warehouse`, `analytics`, `staging` |  
| 3 | TABLE_FILTER | Table Filter | `"users"`, `"prod_*"`, `"*_temp"`, `""` |
| 4 | LOCATION | Region | `US`, `EU`, `us-central1` |
| 5 | SAMPLE_LIMIT | Sample Rows | `5`, `10`, `25`, `50` |
| 6 | OUTPUT_DIR | Output Dir | `./output`, `./reports` |

## License

MIT License - see LICENSE file for details.

---

**Built for humans who need to understand their data warehouse at scale.** 🚀
