# dwh-audit

A powerful CLI tool for auditing data warehouses. Extract, analyze, and report on schemas, data quality, and analytics readiness.

[![npm version](https://badge.fury.io/js/dwh-audit.svg)](https://www.npmjs.com/package/dwh-audit)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Installation

```bash
# Install globally
npm install -g dwh-audit

# Or run without installing
npx dwh-audit --project my-project --dataset my-dataset
```

## Quick Start

```bash
# Basic audit of a dataset
dwh-audit --project my-project --dataset my-dataset

# Audit specific tables with more samples
dwh-audit --project my-project --dataset my-dataset --filter "users,events*" --samples 25

# Use custom credentials
dwh-audit --project my-project --dataset my-dataset --credentials ./service-account.json
```

## CLI Options

| Option | Alias | Default | Description |
|--------|-------|---------|-------------|
| `--project` | `-p` | *required* | BigQuery project ID |
| `--dataset` | `-s` | *required* | Dataset ID to audit |
| `--filter` | `-f` | *all tables* | Table filter (comma-separated, supports globs) |
| `--samples` | `-n` | `10` | Number of sample rows per table |
| `--location` | `-l` | `US` | BigQuery region/location |
| `--output` | `-o` | `./output` | Output directory |
| `--credentials` | `-c` | *default auth* | Path to credentials JSON |

## Authentication

### Option 1: Default Credentials (Recommended)
```bash
gcloud auth application-default login
dwh-audit --project my-project --dataset my-dataset
```

### Option 2: Service Account Key
```bash
dwh-audit --project my-project --dataset my-dataset --credentials ./service-account.json
```

### Required Permissions
```bash
gcloud projects add-iam-policy-binding PROJECT_ID \
  --member="user:your-email@company.com" \
  --role="roles/bigquery.dataViewer"
```

## Output

The tool generates comprehensive reports in the `./output` directory:

- **📊 index.html** - Interactive dashboard with charts and analytics
- **📋 CSV files** - Table summaries and schema catalogs  
- **📁 Individual exports** - Per-table schemas and sample data

## Features

✅ **Complete Schema Analysis** - Nested fields, data types, partitioning  
✅ **Smart Join Key Detection** - Identifies relationships between tables  
✅ **Analytics Readiness Scoring** - Mixpanel compatibility analysis  
✅ **Interactive Reports** - Beautiful dashboards with visualizations  
✅ **DataViewer Support** - Works with standard BigQuery permissions  
✅ **Cost Efficient** - Smart sampling to minimize query costs  

## Examples

```bash
# Production audit with comprehensive sampling
dwh-audit --project prod-analytics --dataset warehouse --samples 50

# Focus on specific table patterns
dwh-audit --project my-project --dataset events --filter "events_*,users"

# EU region deployment
dwh-audit --project eu-project --dataset analytics --location EU

# Custom output location
dwh-audit --project my-project --dataset my-dataset --output ./audit-results
```

## Troubleshooting

**Permission Denied:**
```bash
gcloud auth list                    # Check authentication
gcloud projects list               # Verify project access
```

**No tables found:**
- Verify dataset exists: `bq ls PROJECT:DATASET`
- Check region/location parameter matches your dataset

**Query costs:**
- Use `--samples 5` for large tables
- Use `--filter` to limit scope to specific tables

## why?

i needed this, so i made it. also bigquery's UI does not make it easy to search through a set of schemas / columns.