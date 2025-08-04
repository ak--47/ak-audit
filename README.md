# ak-audit

A powerful CLI tool for auditing BigQuery datasets. Analyze schemas, sample data, detect join keys, and generate comprehensive reports with interactive visualizations.

[![npm version](https://badge.fury.io/js/ak-audit.svg)](https://www.npmjs.com/package/ak-audit)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

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

## Installation

### Install globally via npm

```bash
npm install -g ak-audit
```

### Use with npx (no installation required)

```bash
npx ak-audit --project my-project --dataset my-dataset
```

## Quick Start

```bash
# Basic audit with default settings
ak-audit --project mixpanel-gtm-training --dataset warehouse_connectors

# Short form with aliases
ak-audit -p my-project -s my-dataset -l US -o ./results

# Filter specific tables with patterns
ak-audit --project my-project --dataset my-dataset --filter "users,events_*"
```

## Usage

### CLI Options

| Option | Alias | Default | Description |
|--------|-------|---------|-------------|
| `--dwh` | `-d` | `bigquery` | Data warehouse type (currently only BigQuery) |
| `--project` | `-p` | `mixpanel-gtm-training` | BigQuery project ID |
| `--dataset` | `-s` | `warehouse_connectors` | Dataset ID to audit |
| `--location` | `-l` | `US` | BigQuery region/location |
| `--filter` | `-f` | *none* | Comma-separated table names (supports globs) |
| `--samples` | `-n` | `10` | Number of sample rows per table |
| `--output` | `-o` | `./output` | Output directory for results |
| `--credentials` | `-c` | *none* | Path to Google Cloud credentials JSON |
| `--force-mode` | | *none* | Force permission mode (`dataViewer`/`jobUser`) |
| `--help` | `-h` | | Show help information |
| `--version` | | | Show version number |

### Authentication

#### Option 1: Application Default Credentials (Recommended)
```bash
gcloud auth application-default login
ak-audit --project my-project --dataset my-dataset
```

#### Option 2: Service Account Key
```bash
ak-audit --project my-project --dataset my-dataset --credentials ./service-account.json
```

#### Required Permissions

For **full functionality** (jobUser mode):
```bash
gcloud projects add-iam-policy-binding PROJECT_ID \
  --member="user:your-email@company.com" \
  --role="roles/bigquery.jobUser"
```

For **read-only mode** (dataViewer mode):
```bash
gcloud projects add-iam-policy-binding PROJECT_ID \
  --member="user:your-email@company.com" \
  --role="roles/bigquery.dataViewer"
```

### Examples

```bash
# Basic audit with defaults
ak-audit --project my-project --dataset my-dataset

# Short form with aliases
ak-audit -p my-project -s my-dataset -l US -o ./results

# Filter specific tables with glob patterns
ak-audit --project my-project --dataset my-dataset --filter "users,events*,orders"

# Use custom credentials file
ak-audit --project my-project --dataset my-dataset --credentials ./service-account.json

# Force specific permission mode
ak-audit --project my-project --dataset my-dataset --force-mode dataViewer

# Increase sample size for detailed analysis
ak-audit --project my-project --dataset my-dataset --samples 50

# EU region with custom output
ak-audit --project eu-project --dataset analytics --location EU --output ./eu-audit
```

**Real-world Usage Patterns:**

```bash
# Data team daily review - focus on summary tables
ak-audit --project analytics-prod --dataset warehouse --filter "*_daily,*_summary"

# Schema migration planning with detailed samples
ak-audit --project staging-project --dataset new_schema --samples 25 --output ./migration-audit

# Compliance audit - focus on user data tables with minimal samples
ak-audit --project compliance-db --dataset pii_data --filter "*users*,*profiles*,*customer*" --samples 5

# Performance analysis - large tables only with extensive sampling
ak-audit --project perf-project --dataset analytics --filter "events_*,logs_*" --samples 100

# Quick schema check - no samples needed
ak-audit --project my-project --dataset my-dataset --filter "new_*" --samples 0
```

### Table Filtering with Glob Patterns

The `--filter` option supports glob patterns for flexible table selection:

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
