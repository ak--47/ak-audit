import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';

describe('BigQuery Audit Integration Tests', () => {
  const testOutputDir = './test-output';
  
  beforeAll(async () => {
    // Clean up any existing test output
    try {
      await fs.rm(testOutputDir, { recursive: true, force: true });
    } catch (err) {
      // Directory might not exist, ignore
    }
  });
  
  afterAll(async () => {
    // Clean up test output after tests
    try {
      await fs.rm(testOutputDir, { recursive: true, force: true });
    } catch (err) {
      // Ignore cleanup errors
    }
  });

  it('should run full audit with default parameters and generate all expected outputs', async () => {
    // Run the audit script with test output directory
    const result = await runAuditScript([
      'mixpanel-gtm-training', // Default project
      'warehouse_connectors',  // Default dataset
      'US',                    // Default location
      testOutputDir,           // Test output directory
      '5',                     // Smaller sample limit for faster test
      null,                    // No table filter
      'dataViewer'             // Force dataViewer mode for consistent testing
    ]);

    // Check that script ran successfully
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('BigQuery Dataset Auditor');
    expect(result.stdout).toContain('Audit completed successfully');

    // Check that output directory was created
    const outputExists = await fs.access(testOutputDir).then(() => true).catch(() => false);
    expect(outputExists).toBe(true);

    // Check that main report files were generated
    const expectedFiles = [
      'reports/dataset_audit.json',
      'reports/audit_report.html',
      'reports/all_tables_summary.csv',
      'reports/all_schemas_catalog.csv',
      'reports/audit_summary.csv'
    ];

    for (const file of expectedFiles) {
      const filePath = path.join(testOutputDir, file);
      const fileExists = await fs.access(filePath).then(() => true).catch(() => false);
      expect(fileExists).toBe(true, `Expected file ${file} to exist`);
    }

    // Check that schemas and samples directories were created
    const schemasDir = path.join(testOutputDir, 'schemas');
    const samplesDir = path.join(testOutputDir, 'samples');
    
    const schemasDirExists = await fs.access(schemasDir).then(() => true).catch(() => false);
    const samplesDirExists = await fs.access(samplesDir).then(() => true).catch(() => false);
    
    expect(schemasDirExists).toBe(true);
    expect(samplesDirExists).toBe(true);

    // Validate the main audit JSON structure
    const auditJsonPath = path.join(testOutputDir, 'reports/dataset_audit.json');
    const auditData = JSON.parse(await fs.readFile(auditJsonPath, 'utf8'));
    
    expect(auditData).toHaveProperty('metadata');
    expect(auditData).toHaveProperty('tables');
    expect(auditData).toHaveProperty('analytics');
    expect(auditData).toHaveProperty('lineage');
    
    expect(auditData.metadata).toHaveProperty('projectId', 'mixpanel-gtm-training');
    expect(auditData.metadata).toHaveProperty('datasetId', 'warehouse_connectors');
    expect(auditData.metadata).toHaveProperty('location', 'US');
    expect(auditData.metadata).toHaveProperty('auditTimestamp');
    expect(auditData.metadata).toHaveProperty('mode', 'dataViewer');

    // Check that tables array is populated
    expect(Array.isArray(auditData.tables)).toBe(true);
    expect(auditData.tables.length).toBeGreaterThan(0);

    // Validate table structure
    const firstTable = auditData.tables[0];
    expect(firstTable).toHaveProperty('table_name');
    expect(firstTable).toHaveProperty('table_type');
    expect(firstTable).toHaveProperty('schema');
    expect(firstTable).toHaveProperty('creation_time');
    expect(Array.isArray(firstTable.schema)).toBe(true);

    // Check analytics structure
    expect(auditData.analytics).toHaveProperty('field_patterns');
    expect(auditData.analytics).toHaveProperty('data_quality');
    expect(Array.isArray(auditData.analytics.data_quality)).toBe(true);

    // Check lineage structure
    expect(auditData.lineage).toHaveProperty('nodes');
    expect(auditData.lineage).toHaveProperty('edges');
    expect(Array.isArray(auditData.lineage.nodes)).toBe(true);
    expect(Array.isArray(auditData.lineage.edges)).toBe(true);

    // Validate HTML report exists and contains expected content
    const htmlReportPath = path.join(testOutputDir, 'reports/audit_report.html');
    const htmlContent = await fs.readFile(htmlReportPath, 'utf8');
    
    expect(htmlContent).toContain('BigQuery Dataset Audit');
    expect(htmlContent).toContain('mixpanel-gtm-training');
    expect(htmlContent).toContain('warehouse_connectors');
    expect(htmlContent).toContain('Table Analytics');
    expect(htmlContent).toContain('Row Count Distribution');
    expect(htmlContent).toContain('Interactive Relationship Diagram');

    // Check that CSV files are properly formatted
    const summaryCSVPath = path.join(testOutputDir, 'reports/all_tables_summary.csv');
    const summaryCSV = await fs.readFile(summaryCSVPath, 'utf8');
    
    expect(summaryCSV).toContain('table_name,table_type,creation_time,row_count');
    expect(summaryCSV.split('\n').length).toBeGreaterThan(2); // Header + at least 1 data row

    // Check that sample files were generated
    const sampleFiles = await fs.readdir(samplesDir);
    expect(sampleFiles.length).toBeGreaterThan(0);
    expect(sampleFiles.some(file => file.endsWith('.json'))).toBe(true);

    // Check that schema files were generated  
    const schemaFiles = await fs.readdir(schemasDir);
    expect(schemaFiles.length).toBeGreaterThan(0);
    expect(schemaFiles.some(file => file.endsWith('.csv'))).toBe(true);
  }, 120000); // 2 minute timeout

  it('should handle force mode parameter correctly', async () => {
    const result = await runAuditScript([
      'mixpanel-gtm-training',
      'warehouse_connectors', 
      'US',
      testOutputDir + '-force',
      '2',
      null,
      'dataViewer' // Force dataViewer mode
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('🔒 Forcing dataViewer mode via command line parameter');
  }, 60000);

  it('should handle table filtering correctly', async () => {
    // Get a list of available tables first by running a quick audit
    const quickResult = await runAuditScript([
      'mixpanel-gtm-training',
      'warehouse_connectors',
      'US', 
      testOutputDir + '-quick',
      '1',
      null,
      'dataViewer'
    ]);

    expect(quickResult.exitCode).toBe(0);

    // Read the audit result to get table names
    const auditJsonPath = path.join(testOutputDir + '-quick', 'reports/dataset_audit.json');
    const auditData = JSON.parse(await fs.readFile(auditJsonPath, 'utf8'));
    
    if (auditData.tables.length > 0) {
      const firstTableName = auditData.tables[0].table_name;
      
      // Run audit with table filter
      const filteredResult = await runAuditScript([
        'mixpanel-gtm-training',
        'warehouse_connectors',
        'US',
        testOutputDir + '-filtered', 
        '2',
        firstTableName, // Filter to just one table
        'dataViewer'
      ]);

      expect(filteredResult.exitCode).toBe(0);
      expect(filteredResult.stdout).toContain(`Table Filter: ${firstTableName}`);

      // Check that only the filtered table appears in results
      const filteredAuditPath = path.join(testOutputDir + '-filtered', 'reports/dataset_audit.json');
      const filteredAuditData = JSON.parse(await fs.readFile(filteredAuditPath, 'utf8'));
      
      expect(filteredAuditData.tables.length).toBe(1);
      expect(filteredAuditData.tables[0].table_name).toBe(firstTableName);
    }
  }, 120000);
});

// Helper function to run the audit script as a child process
function runAuditScript(args) {
  return new Promise((resolve) => {
    // Convert args to CLI flags
    const cliArgs = [];
    if (args[0]) cliArgs.push('--project', args[0]);
    if (args[1]) cliArgs.push('--dataset', args[1]); 
    if (args[2]) cliArgs.push('--location', args[2]);
    if (args[3]) cliArgs.push('--output', args[3]);
    if (args[4]) cliArgs.push('--samples', args[4]);
    if (args[5]) cliArgs.push('--filter', args[5]);
    if (args[6]) cliArgs.push('--force-mode', args[6]);
    
    const child = spawn('node', ['./bin/ak-audit.js', ...cliArgs], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: process.cwd()
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      resolve({
        exitCode: code,
        stdout,
        stderr
      });
    });

    child.on('error', (error) => {
      resolve({
        exitCode: 1,
        stdout,
        stderr: stderr + error.message
      });
    });
  });
}