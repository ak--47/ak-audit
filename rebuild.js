import fs from 'fs/promises';
import path from 'path';
import generateHtmlReport from './buildReport.js';

// ANSI color codes for terminal output
const colors = {
    yellow: '\x1b[33m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    nc: '\x1b[0m' // No Color
};

async function rebuildHtmlReport() {
    try {
        console.log(`${colors.yellow}🔄 Rebuilding HTML report from existing audit data...${colors.nc}`);
        
        // Read the existing audit data
        const auditDataPath = path.join('./output', 'reports', 'dataset_audit.json');
        console.log(`📖 Reading audit data from: ${auditDataPath}`);
        
        let auditData;
        try {
            const auditDataContent = await fs.readFile(auditDataPath, 'utf8');
            auditData = JSON.parse(auditDataContent);
        } catch (error) {
            if (error.code === 'ENOENT') {
                console.error(`${colors.red}❌ Error: Audit data file not found at ${auditDataPath}${colors.nc}`);
                console.error(`${colors.red}   Please run the main audit script first: node bigquery.js${colors.nc}`);
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