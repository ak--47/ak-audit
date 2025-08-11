/**
 * TypeScript test file to validate our type definitions
 * This file should compile without errors if our types are correct
 */

import type { 
  AuditOptions, 
  RawDataset, 
  TableMetadata, 
  SchemaField,
  AuditResult,
  WarehouseAdapter
} from '../index.d.ts';

// Test AuditOptions interface
const options: AuditOptions = {
  dwh: 'bigquery',
  project: 'my-project',
  dataset: 'my-dataset', 
  location: 'US',
  samples: 10,
  output: './output',
  filter: 'users,events*',
  credentials: './credentials.json'
};

// Test SchemaField interface
const schemaField: SchemaField = {
  column_name: 'user_id',
  ordinal_position: 1,
  is_nullable: 'NO',
  data_type: 'STRING',
  is_partitioning_column: false,
  clustering_ordinal_position: null,
  nested_field_path: 'user_id',
  nested_type: 'STRING',
  is_potential_join_key: true
};

// Test TableMetadata interface
const tableMetadata: TableMetadata = {
  table_name: 'users',
  table_type: 'TABLE',
  creation_time: '2023-01-01T00:00:00Z',
  has_permission_error: false,
  error_details: [],
  schema: [schemaField],
  row_count: 1000,
  size_bytes: 1024000,
  sample_data: [
    { user_id: '123', name: 'John Doe', email: 'john@example.com' }
  ],
  view_definition: null,
  partitioning_info: null,
  clustering_info: null
};

// Test RawDataset interface
const rawDataset: RawDataset = {
  extraction_metadata: {
    generated_at: '2023-01-01T00:00:00Z',
    project_id: 'my-project',
    dataset_id: 'my-dataset',
    region: 'US',
    permission_mode: 'jobUser',
    sample_limit: 10,
    table_filter: null
  },
  tables: [tableMetadata],
  summary: {
    total_tables: 1,
    total_views: 0,
    total_objects: 1,
    failed_objects: 0,
    total_rows_accessible: 1000
  }
};

// Test WarehouseAdapter interface implementation
class MockAdapter implements WarehouseAdapter {
  readonly warehouseType = 'mock';
  
  async extractRawData(options: AuditOptions): Promise<RawDataset> {
    return rawDataset;
  }
  
  async testConnection(options: AuditOptions): Promise<string> {
    return 'connected';
  }
}

// Test that our interfaces work together
async function testPipeline() {
  const adapter = new MockAdapter();
  const extracted = await adapter.extractRawData(options);
  
  // Verify the extracted data matches our RawDataset interface
  console.log(`Extracted ${extracted.tables.length} tables`);
  console.log(`Total rows: ${extracted.summary.total_rows_accessible}`);
  
  // Test that we can access nested properties safely
  const firstTable = extracted.tables[0];
  if (firstTable) {
    console.log(`First table: ${firstTable.table_name}`);
    console.log(`Schema fields: ${firstTable.schema.length}`);
    
    // Test schema field access
    const firstField = firstTable.schema[0];
    if (firstField) {
      console.log(`First field: ${firstField.column_name} (${firstField.data_type})`);
    }
  }
}

testPipeline().catch(console.error);

// Export to avoid "not a module" errors
export { options, rawDataset, MockAdapter };