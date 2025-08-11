# Examples Directory

This directory contains example implementations and tests for the dwh-audit modular architecture.

## Files

### `snowflake-adapter.example.js`
Complete reference implementation of a Snowflake warehouse adapter.

**Purpose:**
- Shows how to implement the `WarehouseAdapter` interface
- Demonstrates mapping Snowflake-specific schemas to the standard `RawDataset` format
- Provides a template for adding new warehouse support

**Key Pattern:**
```javascript
// 1. Query warehouse-specific information schema
// 2. Transform to standard RawDataset format  
// 3. audit.js works automatically with the output
```

**Usage:**
```javascript
const adapter = new SnowflakeAdapter();
const rawData = await adapter.extractRawData(options);
// Save rawData as dataset_raw.json, then run audit.js
```

### `types-test.ts`
TypeScript validation file to ensure type definitions are correct.

**Purpose:**
- Validates that all interfaces in `index.d.ts` compile correctly
- Provides usage examples for TypeScript developers
- Serves as a test for type compatibility

**Usage:**
```bash
# Compile to check for type errors
npx tsc --noEmit examples/types-test.ts

# Run to see example usage
npx tsx examples/types-test.ts
```

## Adding New Warehouses

To add support for a new data warehouse:

1. **Study `snowflake-adapter.example.js`** - Follow the same pattern
2. **Implement `WarehouseAdapter` interface** - Use TypeScript definitions from `index.d.ts`
3. **Focus on data transformation** - Map your warehouse schema to `RawDataset` format
4. **Test with audit.js** - Ensure your output works with the analysis pipeline

### Implementation Checklist

- [ ] Implement `WarehouseAdapter.extractRawData()` 
- [ ] Implement `WarehouseAdapter.testConnection()`
- [ ] Map warehouse permissions to standard permission modes
- [ ] Transform schemas to `SchemaField` format
- [ ] Handle warehouse-specific data types appropriately
- [ ] Provide sample data in standard format
- [ ] Test with `audit.js` and `rebuild.js`

### Standard Data Flow

```
Your Warehouse → Your Adapter → RawDataset → audit.js → AuditResult → rebuild.js → HTML
```

The key insight is that once you output a properly formatted `RawDataset`, the entire analytics and reporting pipeline works automatically!

## TypeScript Development

All interfaces are fully typed. Import from the main package:

```typescript
import type { 
  AuditOptions,
  WarehouseAdapter, 
  RawDataset,
  TableMetadata,
  SchemaField 
} from '../index.d.ts';
```

## Testing Your Implementation

```bash
# 1. Extract data with your adapter
node your-warehouse-adapter.js

# 2. Run analysis (should work with any warehouse)
node audit.js ./output/reports/dataset_raw.json ./output

# 3. Generate report (should work with any warehouse)
node rebuild.js
```

If steps 2-3 work, your adapter is correctly implemented!

## Contributing

When contributing new warehouse adapters:

1. **Add example implementation** to this directory
2. **Follow naming pattern**: `warehouse-adapter.example.js`
3. **Include TypeScript types** where applicable
4. **Document any warehouse-specific considerations**
5. **Test the complete pipeline** end-to-end