import fs from 'fs/promises';
import path from 'path';
import generateHtmlReport from './buildReport.js';
import { runAudit } from './audit.js';

// ANSI color codes for terminal output
const colors = {
    yellow: '\x1b[33m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    nc: '\x1b[0m' // No Color
};

async function rebuildHtmlReport() {
    try {
        console.log(`${colors.yellow}🔄 Rebuilding HTML report from audit data...${colors.nc}`);
        
        // Check if we have raw data to process first
        const rawDataPath = path.join('./output', 'reports', 'dataset_raw.json');
        const auditDataPath = path.join('./output', 'reports', 'dataset_audit.json');
        
        let auditData;
        
        // Check if audit data exists and is newer than raw data
        try {
            const [rawStats, auditStats] = await Promise.all([
                fs.stat(rawDataPath).catch(() => null),
                fs.stat(auditDataPath).catch(() => null)
            ]);
            
            if (rawStats && (!auditStats || rawStats.mtime > auditStats.mtime)) {
                console.log(`📊 Found newer raw data, running audit analysis first...`);
                await runAudit();
            }
            
            console.log(`📖 Reading audit data from: ${auditDataPath}`);
            const auditDataContent = await fs.readFile(auditDataPath, 'utf8');
            auditData = JSON.parse(auditDataContent);
            
        } catch (error) {
            if (error.code === 'ENOENT') {
                console.error(`${colors.red}❌ Error: Audit data file not found at ${auditDataPath}${colors.nc}`);
                console.error(`${colors.red}   Please run: node bigquery.js first to extract data${colors.nc}`);
                console.error(`${colors.red}   Then run: node audit.js to analyze data${colors.nc}`);
                process.exit(1);
            } else if (error instanceof SyntaxError) {
                console.error(`${colors.red}❌ Error: Invalid JSON in audit data file${colors.nc}`);
                console.error(`${colors.red}   ${error.message}${colors.nc}`);
                process.exit(1);
            } else {
                throw error;
            }
        }
        
        // Validate the audit data structure
        if (!auditData.audit_metadata || !auditData.tables) {
            console.error(`${colors.red}❌ Error: Invalid audit data structure${colors.nc}`);
            console.error(`${colors.red}   Expected 'audit_metadata' and 'tables' properties${colors.nc}`);
            process.exit(1);
        }
        
        console.log(`✅ Loaded audit data for project: ${auditData.audit_metadata.project_id}, dataset: ${auditData.audit_metadata.dataset_id}`);
        console.log(`📊 Found ${auditData.tables.length} tables/views to process`);
        
        // Generate the HTML report
        console.log(`${colors.yellow}🎨 Generating HTML report...${colors.nc}`);
        const htmlReport = generateHtmlReport(auditData);
        
        // Write the HTML report
        const outputPath = path.join('./output', 'reports', 'index.html');
        await fs.writeFile(outputPath, htmlReport);
        
        console.log(`${colors.green}✅ HTML report successfully rebuilt!${colors.nc}`);
        console.log(`📁 Report saved to: ${outputPath}`);
        console.log(`🌐 Open in browser: file://${path.resolve(outputPath)}`);
        
    } catch (error) {
        console.error(`${colors.red}❌ Error rebuilding HTML report:${colors.nc}`);
        console.error(`${colors.red}   ${error.message}${colors.nc}`);
        if (error.stack) {
            console.error(`${colors.red}   ${error.stack}${colors.nc}`);
        }
        process.exit(1);
    }
}

// Run the rebuild if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    rebuildHtmlReport();
}

export default rebuildHtmlReport;