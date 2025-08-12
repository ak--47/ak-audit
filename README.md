# dwh-audit

A powerful, modular CLI tool for auditing data warehouses. Extract, analyze, and report on schemas, data quality, and analytics readiness with support for BigQuery (and more warehouses coming soon).

[![npm version](https://badge.fury.io/js/dwh-audit.svg)](https://www.npmjs.com/package/dwh-audit)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## 🚀 What's New: Modular Architecture

dwh-audit now uses a **3-step modular pipeline** that separates data extraction from analysis, enabling fast iteration and multi-warehouse support:

```
🔍 Extract → 🧠 Analyze → 📊 Report
bigquery.js → audit.js → rebuild.js
```

**Benefits:**
- **🔄 Fast iteration** - Change scoring algorithms without re-querying your warehouse
- **🌐 Multi-warehouse ready** - Adding Snowflake/Databricks is just implementing one interface
- **🧪 Testable** - Analyze data with mock datasets for development
- **📝 Type-safe** - Complete TypeScript definitions for all interfaces

## Overview

dwh-audit is a Node.js command-line tool designed to comprehensively audit data warehouse datasets. It analyzes table schemas, retrieves sample data, identifies potential join keys, and generates interactive HTML reports with data lineage visualization.

**Key Features:**
- 🔍 **Complete Schema Analysis** - Nested fields, data types, partitioning, clustering
- 📊 **Interactive Mixpanel-themed Reports** - Beautiful dashboards with charts and visualizations  
- 🔗 **Smart Join Key Detection** - Identifies potential relationships between tables
- 🌐 **Data Lineage Mapping** - Visual ERD showing table dependencies and relationships
- 🚀 **DataViewer Support** - Works with standard BigQuery DataViewer permissions
- 📈 **Analytics Readiness Scoring** - Mixpanel compatibility analysis
- 💾 **Multiple Output Formats** - JSON, CSV, and HTML reports
- 🏗️ **Modular Architecture** - Fast iteration and multi-warehouse support

## Installation

### Install globally via npm

```bash
npm install -g dwh-audit
```

### Use with npx (no installation required)

```bash
npx dwh-audit --project my-project --dataset my-dataset
```

## Quick Start

### One-Command Pipeline (Easy)

```bash
# Run the complete pipeline: extract → analyze → report
dwh-audit --project my-project --dataset my-dataset

# With custom options
dwh-audit --project my-project --dataset my-dataset --filter "users,events*" --samples 25
```

### Modular Pipeline (Advanced)

```bash
# Step 1: Extract raw data from warehouse (slow - queries your warehouse)
node bigquery.js my-project my-dataset

# Step 2: Run analytics analysis (fast - no warehouse queries)
node audit.js

# Step 3: Generate HTML report (fastest - just HTML generation)
node rebuild.js
```

**Pro tip:** Steps 2-3 are fast and can be run repeatedly to iterate on analysis and reporting!

## Modular Architecture

### Pipeline Overview

```
dwh-audit CLI
     ↓
bigquery.js  → dataset_raw.json → audit.js → dataset_audit.json → rebuild.js → index.html
   (extract)                     (analyze)                      (report)
```

### Individual Commands

| Command | Purpose | Speed | When to Use |
|---------|---------|-------|-------------|
| **`dwh-audit`** | Full pipeline | ⏳ Slow | First run, production |
| **`node bigquery.js`** | Extract data | ⏳ Slow | Raw data changed |
| **`node audit.js`** | Run analysis | ⚡ Fast | Scoring logic changed |
| **`node rebuild.js`** | Generate report | ⚡ Fastest | UI/report changes |

### Benefits of Modular Approach

**🔄 Fast Development Iteration:**
```bash
# Extract once (slow)
node bigquery.js my-project my-dataset

# Then iterate quickly:
# 1. Edit scoring logic in audit.js
# 2. Re-run analysis + report (fast!)
node audit.js && node rebuild.js
```

**🌐 Multi-Warehouse Support:**
Each warehouse just needs to output the same `dataset_raw.json` format:
- ✅ **BigQuery** (implemented)
- 🚧 **Snowflake** (coming soon - see [examples/](./examples/))
- 🚧 **Databricks** (roadmap)
- 🚧 **Redshift** (roadmap)

## Usage

### CLI Options

| Option | Alias | Default | Description |
|--------|-------|---------|-------------|
| `--dwh` | `-d` | `bigquery` | Data warehouse type |
| `--project` | `-p` | *required* | Project/account ID |
| `--dataset` | `-s` | *required* | Dataset/database ID |
| `--location` | `-l` | `US` | Region/location |
| `--filter` | `-f` | *none* | Table filter (comma-separated, supports globs) |
| `--samples` | `-n` | `10` | Number of sample rows per table |
| `--output` | `-o` | `./output` | Output directory |
| `--credentials` | `-c` | *none* | Path to credentials JSON |

### Examples

```bash
# Full pipeline - extract, analyze, and generate report
dwh-audit --project my-project --dataset analytics

# Focus on specific tables with more samples
dwh-audit --project my-project --dataset warehouse --filter "users,events*" --samples 25

# EU region with custom output directory
dwh-audit --project eu-project --dataset analytics --location EU --output ./eu-audit

# Development workflow - extract once, iterate on analysis
node bigquery.js my-project analytics
# Edit audit.js scoring logic...
node audit.js && node rebuild.js  # Fast iteration!
```

### Authentication

#### Option 1: Application Default Credentials (Recommended)
```bash
gcloud auth application-default login
dwh-audit --project my-project --dataset my-dataset
```

#### Option 2: Service Account Key
```bash
dwh-audit --project my-project --dataset my-dataset --credentials ./service-account.json
```

#### Required Permissions

```bash
gcloud projects add-iam-policy-binding PROJECT_ID \
  --member="user:your-email@company.com" \
  --role="roles/bigquery.dataViewer"
```

## Output Structure

The modular pipeline creates organized outputs at each step:

```
output/
├── reports/
│   ├── dataset_raw.json         # 🔍 Raw extracted data (bigquery.js output)
│   ├── dataset_audit.json       # 🧠 Analysis results (audit.js output)  
│   ├── index.html              # 📊 Interactive report (rebuild.js output)
│   ├── all_tables_summary.csv  # 📋 Table summaries
│   ├── all_schemas_catalog.csv # 📋 Schema catalog
│   └── audit_summary.csv       # 📋 High-level metrics
├── schemas/                     # 📁 Individual table schemas (CSV)
│   ├── users_schema.csv
│   └── events_schema.csv
└── samples/                     # 📁 Sample data (JSON)
    ├── users_sample.json
    └── events_sample.json
```

### Key Files

- **📊 index.html** - Interactive Mixpanel-themed dashboard with charts, lineage diagrams, and searchable tables
- **🔍 dataset_raw.json** - Clean extracted data, ready for analysis by any warehouse
- **🧠 dataset_audit.json** - Complete analysis with scoring, relationships, and insights
- **📋 CSV files** - Spreadsheet-friendly data for further analysis

## Features Deep Dive

### 🧠 Analytics Intelligence

**Mixpanel Readiness Scoring:**
- Detects timestamp, user ID, event ID fields
- Scores tables 0-10 for analytics compatibility
- Identifies event tables vs user dimension tables
- Flags potential PII fields

**Schema Complexity Analysis:**
- Nested field detection and analysis
- STRUCT/ARRAY complexity scoring
- Partitioning and clustering analysis
- Field relationship mapping

### 🔗 Smart Join Key Detection

Identifies potential table relationships by:
- Cross-table field analysis
- Data type compatibility
- Smart filtering of common fields (timestamps, event fields, etc.)
- Bidirectional relationship mapping

### 📊 Interactive Reporting

**Mixpanel-Inspired Dashboard:**
- Dark mode design matching Mixpanel product
- Summary cards with key metrics
- Interactive D3.js charts and diagrams
- Expandable table explorer with search
- Relationship diagram with zoom/pan

### 🌐 Multi-Warehouse Architecture

**Warehouse Adapter Pattern:**
```typescript
interface WarehouseAdapter {
  extractRawData(options: AuditOptions): Promise<RawDataset>;
  testConnection(options: AuditOptions): Promise<string>;
}
```

**Adding New Warehouses:**
1. Implement the `WarehouseAdapter` interface
2. Output data in the standard `RawDataset` format
3. The audit and reporting pipeline works automatically!

See [examples/snowflake-adapter.example.js](./examples/) for a complete implementation example.

## Development

### TypeScript Support

Complete TypeScript definitions are available:

```typescript
import type { AuditOptions, RawDataset, AuditResult } from 'dwh-audit';

// All interfaces are fully typed
const options: AuditOptions = {
  dwh: 'bigquery',
  project: 'my-project',
  dataset: 'analytics',
  // ... fully type-safe
};
```

### npm Scripts

```bash
npm run extract    # node bigquery.js
npm run analyze    # node audit.js  
npm run report     # node rebuild.js
npm run rebuild    # Smart rebuild (runs audit.js if needed)
npm run prune      # Clear all outputs
npm run serve      # Serve HTML report locally
```

### Pipeline Development

```bash
# Extract data once
npm run extract

# Iterate on analysis (fast)
# 1. Edit audit.js
# 2. Re-run analysis
npm run analyze && npm run report

# Iterate on reporting (fastest)
# 1. Edit buildReport.js  
# 2. Re-generate report
npm run report
```

## Troubleshooting

### Common Issues

**Permission Denied:**
```bash
gcloud auth list                    # Check authentication
gcloud projects list               # Verify project access
bq ls PROJECT:DATASET             # Test BigQuery access
```

**No Analysis Results:**
- Ensure `dataset_raw.json` exists after extraction
- Check file permissions in output directory
- Verify the extraction step completed successfully

**Missing HTML Report:**
- Run `node rebuild.js` to regenerate
- Check browser console for JavaScript errors
- Ensure `dataset_audit.json` exists

### Performance Tips

**Fast Iteration Workflow:**
```bash
# Extract once (slow - queries warehouse)
node bigquery.js my-project my-dataset

# Then iterate quickly on analysis/reporting:
node audit.js && node rebuild.js    # Fast!
```

**Table Filtering:**
Use specific patterns to reduce extraction time:
```bash
# Good: specific patterns  
--filter "prod_*,dim_*"

# Avoid: full dataset scans
--filter ""  # (will scan all tables)
```

## Roadmap

### Multi-Warehouse Support
- ✅ **BigQuery** (implemented)
- 🚧 **Snowflake** (next - interface ready)
- 🚧 **Databricks** (planned)
- 🚧 **Redshift** (planned)
- 🚧 **PostgreSQL** (planned)

### Enhanced Analytics
- 🚧 **Data quality metrics** (null rates, uniqueness)
- 🚧 **Historical change tracking**
- 🚧 **Performance recommendations**
- 🚧 **Custom scoring rules**

### Integrations
- 🚧 **Slack/Teams notifications**
- 🚧 **CI/CD pipeline integration**
- 🚧 **Data catalog syncing**

## Contributing

We welcome contributions! The modular architecture makes it easy to:

1. **Add new warehouses** - Implement the `WarehouseAdapter` interface
2. **Enhance analysis** - Modify `audit.js` scoring algorithms  
3. **Improve reporting** - Update `buildReport.js` visualizations
4. **Add integrations** - Build on the TypeScript interfaces

### Development Setup

```bash
git clone https://github.com/your-org/dwh-audit.git
cd dwh-audit
npm install

# Run the pipeline
npm run extract
npm run analyze  
npm run report
```

## License

MIT License - see LICENSE file for details.

---

**Built for data teams who need to understand their warehouse at scale.** 🚀

**Modular • Type-Safe • Multi-Warehouse • Fast Iteration**