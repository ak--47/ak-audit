function generateHtmlReport(data) {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>BigQuery Dataset Audit Report</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <script src="https://cdn.jsdelivr.net/npm/d3@7"></script>
    <style>
        :root {
            --primary: #7856FF;
            --lava-150: #CC332B;
            --lava-100: #FF7557;
            --mint-150: #07B096;
            --mint-100: #80E1D9;
            --mint-40: #BCF0F0;
            --mint-20: #E0FAFA;
            --mustard-100: #F8BC3B;
            --bg-dark: #0a101a;
            --bg-medium: #121A26;
            --bg-light: #1A2433;
            --text-primary: var(--mint-20);
            --text-secondary: #a3b3cc;
            --border-color: #2c3a54;
            --accent: var(--primary);
            --accent-glow: rgba(120, 86, 255, 0.2);
            --error: var(--lava-100);
            --error-glow: rgba(255, 117, 87, 0.15);
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: "Inter", sans-serif;
            background-color: var(--bg-dark);
            color: var(--text-primary);
            line-height: 1.6;
        }
        .container { max-width: 1400px; margin: 0 auto; padding: 40px 20px; }
        header { text-align: center; margin-bottom: 40px; }
        h1 {
            font-size: 2.8rem;
            font-weight: 700;
            background: linear-gradient(90deg, var(--accent), var(--mint-100));
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            margin-bottom: 8px;
        }
        .subtitle { color: var(--text-secondary); font-size: 1.1rem; }
        .subtitle code { background: var(--bg-light); padding: 2px 6px; border-radius: 4px; font-weight: 600; color: var(--mint-100); }
        .summary-cards {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
            margin-bottom: 40px;
        }
        .card {
            background: var(--bg-medium);
            border: 1px solid var(--border-color);
            border-radius: 12px;
            padding: 25px;
            transition: transform 0.2s ease, box-shadow 0.2s ease;
        }
        .card:hover { transform: translateY(-4px); box-shadow: 0 8px 24px rgba(0,0,0,0.2); }
        .card h3 {
            color: var(--text-secondary);
            font-size: 0.9rem;
            font-weight: 500;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 10px;
        }
        .card .number { font-size: 2.5rem; font-weight: 700; color: var(--text-primary); }
        .card.error .number { color: var(--error); }
        .search-box { margin-bottom: 25px; display: flex; gap: 15px; align-items: center; }
        .search-box input {
            flex: 1;
            padding: 16px;
            font-size: 1rem;
            background: var(--bg-medium);
            border: 1px solid var(--border-color);
            border-radius: 8px;
            color: var(--text-primary);
            transition: border-color 0.2s ease, box-shadow 0.2s ease;
        }
        .search-box input:focus {
            outline: none;
            border-color: var(--accent);
            box-shadow: 0 0 0 3px var(--accent-glow);
        }
        .expand-collapse-btn {
            padding: 12px 20px;
            background: var(--accent);
            color: white;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-weight: 600;
            transition: background 0.2s ease;
            white-space: nowrap;
        }
        .expand-collapse-btn:hover {
            background: rgba(120, 86, 255, 0.8);
        }
        .table-item {
            background: var(--bg-medium);
            border: 1px solid var(--border-color);
            border-radius: 12px;
            margin-bottom: 15px;
            overflow: hidden;
            transition: background-color 0.2s ease;
        }
        .table-header { padding: 20px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; }
        .table-header:hover { background-color: var(--bg-light); }
        .table-name { font-size: 1.2rem; font-weight: 600; color: var(--accent); display: flex; align-items: center; }
        .expand-icon { transition: transform 0.2s ease; margin-right: 12px; }
        .table-item.expanded .expand-icon { transform: rotate(90deg); }
        .badges { display: flex; gap: 10px; }
        .badge {
            padding: 5px 12px;
            border-radius: 16px;
            font-size: 0.8rem;
            font-weight: 600;
            text-transform: uppercase;
        }
        .badge.table { background-color: rgba(120, 86, 255, 0.15); color: var(--accent); }
        .badge.view { background-color: rgba(7, 176, 150, 0.15); color: var(--mint-150); }
        .badge.error { background-color: var(--error-glow); color: var(--error); }
        .details { display: none; padding: 0 20px 20px; border-top: 1px solid var(--border-color); }
        .table-item.expanded .details { display: block; }
        .details-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px; }
        .detail-item strong { display: block; color: var(--text-secondary); font-size: 0.8rem; margin-bottom: 2px; text-transform: uppercase; }
        .detail-item span { font-weight: 500; }
        h4 { color: var(--mint-100); font-weight: 600; margin: 20px 0 10px; }
        pre, table {
            background: var(--bg-dark);
            border: 1px solid var(--border-color);
            border-radius: 8px;
            padding: 15px;
            font-size: 0.85rem;
            color: var(--text-secondary);
            max-height: 400px;
            overflow: auto;
            font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
        }
        table { width: 100%; border-collapse: collapse; }
        th, td { padding: 8px 12px; text-align: left; border-bottom: 1px solid var(--border-color); }
        th { color: var(--text-primary); font-weight: 600; }
        tr:hover { background-color: var(--bg-light); color: var(--text-primary); }
        tr:hover td { color: var(--text-primary); }
        .error-message { background: var(--error-glow); border: 1px solid var(--error); color: var(--error); padding: 10px; border-radius: 8px; margin-top: 10px; font-family: monospace; }
        .join-key-row { background-color: rgba(120, 86, 255, 0.1); }
        .join-key-cell { color: var(--accent); font-weight: 600; }
        .sample-json { background: var(--bg-dark); border: 1px solid var(--border-color); border-radius: 8px; padding: 15px; font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace; font-size: 0.85rem; color: var(--text-secondary); max-height: 400px; overflow: auto; white-space: pre-wrap; }
        .sample-section { margin-top: 20px; }
        .sample-toggle { color: var(--mint-100); font-weight: 600; margin: 20px 0 10px; transition: color 0.2s ease; }
        .sample-toggle:hover { color: var(--text-primary); }
        .sample-expand-icon { color: var(--mint-100); }
        .analytics-section { margin-bottom: 40px; }
        .charts-grid { 
            display: grid; 
            grid-template-columns: 1fr 1fr; 
            gap: 20px; 
            margin-bottom: 30px; 
        }
        .chart-container.full-width {
            grid-column: 1 / -1;
        }
        .chart-container { 
            background: var(--bg-medium); 
            border: 1px solid var(--border-color); 
            border-radius: 12px; 
            padding: 20px; 
            position: relative;
            height: 380px;
            overflow: hidden;
        }
        .d3-chart {
            width: 100%;
            height: calc(100% - 40px);
        }
        .d3-bar {
            transition: opacity 0.2s ease;
        }
        .d3-bar:hover {
            opacity: 0.8;
        }
        .d3-axis-text {
            fill: var(--text-secondary);
            font-family: 'Inter', sans-serif;
            font-size: 11px;
            font-weight: 400;
        }
        .d3-axis-label {
            fill: var(--text-secondary);
            font-family: 'Inter', sans-serif;
            font-size: 12px;
            font-weight: 500;
        }
        .d3-grid-line {
            stroke: rgba(44, 58, 84, 0.3);
            stroke-width: 1;
        }
        .d3-tooltip {
            position: absolute;
            background: rgba(26, 36, 51, 0.95);
            color: var(--text-primary);
            border: 1px solid var(--border-color);
            border-radius: 8px;
            padding: 8px 12px;
            font-size: 12px;
            font-family: 'Inter', sans-serif;
            pointer-events: none;
            z-index: 1000;
            opacity: 0;
            transition: opacity 0.2s ease;
        }
        .d3-pie-slice {
            transition: transform 0.2s ease;
        }
        .d3-pie-slice:hover {
            transform: scale(1.05);
        }
        .d3-legend {
            font-family: 'Inter', sans-serif;
            font-size: 12px;
            font-weight: 500;
            fill: var(--text-secondary);
        }
        .chart-title { 
            color: var(--text-primary); 
            font-size: 1.1rem; 
            font-weight: 600; 
            margin-bottom: 15px; 
            text-align: center; 
        }
        .lineage-section { margin-bottom: 40px; }
        .lineage-container {
            background: var(--bg-medium);
            border: 1px solid var(--border-color);
            border-radius: 12px;
            padding: 20px;
            min-height: 500px;
            position: relative;
        }
        .lineage-controls {
            margin-bottom: 15px;
            display: flex;
            gap: 10px;
            align-items: center;
        }
        .lineage-controls button {
            padding: 8px 16px;
            background: var(--accent);
            color: white;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 0.85rem;
            transition: background 0.2s ease;
        }
        .lineage-controls button:hover {
            background: rgba(120, 86, 255, 0.8);
        }
        .lineage-svg {
            width: 100%;
            height: 100%;
            border-radius: 8px;
        }
        .node {
            cursor: pointer;
            transition: all 0.3s ease;
        }
        .node:hover {
            stroke-width: 3px;
        }
        .node-table {
            fill: rgba(120, 86, 255, 0.8);
            stroke: rgba(120, 86, 255, 1);
        }
        .node-view {
            fill: rgba(7, 176, 150, 0.8);
            stroke: rgba(7, 176, 150, 1);
        }
        .node-text {
            fill: var(--text-primary);
            font-size: 12px;
            font-weight: 600;
            text-anchor: middle;
            pointer-events: none;
        }
        .link {
            fill: none;
        }
        .link-view-dependency {
            stroke: rgba(248, 188, 59, 0.8);
            stroke-width: 3;
            marker-end: url(#arrowhead-view);
        }
        .link-join-key {
            stroke: rgba(7, 176, 150, 0.6);
            stroke-width: 2;
            stroke-dasharray: 5,5;
        }
        .link:hover {
            stroke-width: 4;
        }
        .edge-label {
            fill: var(--text-secondary);
            font-size: 10px;
            text-anchor: middle;
            pointer-events: none;
        }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <h1>BigQuery Dataset Audit</h1>
            <p class="subtitle">Project: <code id="headerProject"></code> &nbsp;&bull;&nbsp; Dataset: <code id="headerDataset"></code></p>
        </header>
        <section class="summary-cards">
            <div class="card"><h3>Total Objects</h3><div class="number" id="summaryTotalObjects">0</div></div>
            <div class="card"><h3>Tables</h3><div class="number" id="summaryTables">0</div></div>
            <div class="card"><h3>Views</h3><div class="number" id="summaryViews">0</div></div>
            <div class="card"><h3>Total Rows</h3><div class="number" id="summaryTotalRows">0</div></div>
            <div class="card"><h3>Total Size</h3><div class="number" id="summaryTotalSize">0 B</div></div>
            <div class="card error"><h3>Objects with Errors</h3><div class="number" id="summaryFailedObjects">0</div></div>
        </section>
        
        <section class="analytics-section">
            <h2 style="color: var(--mint-100); font-weight: 600; margin-bottom: 20px; font-size: 1.8rem;">📊 Table Analytics</h2>
            <div class="charts-grid">
                <div class="chart-container full-width">
                    <div class="chart-title">Row Count Distribution (Top 15)</div>
                    <svg id="rowCountChart" class="d3-chart"></svg>
                </div>
                <div class="chart-container full-width">
                    <div class="chart-title">Table Size Distribution (Top 15)</div>
                    <svg id="sizeChart" class="d3-chart"></svg>
                </div>
                <div class="chart-container">
                    <div class="chart-title">Table Types</div>
                    <svg id="tableTypeChart" class="d3-chart"></svg>
                </div>
                <div class="chart-container">
                    <div class="chart-title">Partitioned vs Non-Partitioned</div>
                    <svg id="partitionChart" class="d3-chart"></svg>
                </div>
            </div>
        </section>
        
        <section class="lineage-section">
            <h2 style="color: var(--mint-100); font-weight: 600; margin-bottom: 20px; font-size: 1.8rem;">🔗 Entity Relationship Diagram & Data Lineage</h2>
            <div class="lineage-container">
                <div class="lineage-controls">
                    <button id="resetZoom">Reset View</button>
                    <button id="fitToView">Fit to View</button>
                    <span style="color: var(--text-secondary); font-size: 0.9rem; margin-left: 15px;">
                        Drag to pan • Scroll to zoom • Click nodes to highlight connections
                    </span>
                    <div style="margin-left: auto; display: flex; gap: 15px; font-size: 0.85rem; color: var(--text-secondary);">
                        <span><span style="display:inline-block;width:15px;height:2px;background:rgba(248,188,59,0.8);margin-right:5px;"></span>View Dependencies</span>
                        <span><span style="display:inline-block;width:15px;height:2px;background:rgba(7,176,150,0.6);border:1px dashed rgba(7,176,150,0.6);margin-right:5px;"></span>Join Keys</span>
                    </div>
                </div>
                <svg id="lineageChart" class="lineage-svg">
                    <defs>
                        <marker id="arrowhead-view" markerWidth="10" markerHeight="7" 
                                refX="9" refY="3.5" orient="auto">
                            <polygon points="0 0, 10 3.5, 0 7" fill="rgba(248, 188, 59, 0.8)" />
                        </marker>
                    </defs>
                </svg>
            </div>
        </section>
        
        <main>
            <div class="search-box">
                <input type="text" id="searchInput" placeholder="Search by table name or field name...">
                <button class="expand-collapse-btn" id="expandCollapseBtn">Expand All</button>
            </div>
            <div id="tablesContainer"></div>
        </main>
    </div>
    <script id="auditData" type="application/json">
        ${JSON.stringify(data, null, 2)}
    </script>
    <script>
        document.addEventListener('DOMContentLoaded', () => {
            const data = JSON.parse(document.getElementById('auditData').textContent);
            const tablesContainer = document.getElementById('tablesContainer');
            const searchInput = document.getElementById('searchInput');

            // Utility function for human-readable bytes
            const bytesHuman = function (bytes, dp = 2, si = true) {
                //https://stackoverflow.com/a/14919494
                const thresh = si ? 1000 : 1024;

                if (Math.abs(bytes) < thresh) {
                    return bytes + ' B';
                }

                const units = si ? ['kB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'] : ['KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB', 'ZiB', 'YiB'];
                let u = -1;
                const r = 10 ** dp;

                do {
                    bytes /= thresh;
                    ++u;
                } while (Math.round(Math.abs(bytes) * r) / r >= thresh && u < units.length - 1);

                return bytes.toFixed(dp) + ' ' + units[u];
            };

            function renderSummary() {
                document.getElementById('headerProject').textContent = data.audit_metadata.project_id;
                document.getElementById('headerDataset').textContent = data.audit_metadata.dataset_id;
                document.getElementById('summaryTotalObjects').textContent = data.summary.total_objects.toLocaleString();
                document.getElementById('summaryTables').textContent = data.summary.total_tables.toLocaleString();
                document.getElementById('summaryViews').textContent = data.summary.total_views.toLocaleString();
                document.getElementById('summaryFailedObjects').textContent = data.summary.failed_objects.toLocaleString();
                
                // Calculate total rows and size
                let totalRows = 0;
                let totalBytes = 0;
                
                data.tables.forEach(table => {
                    if (table.row_count && typeof table.row_count === 'number') {
                        totalRows += table.row_count;
                    }
                    if (table.size_mb && typeof table.size_mb === 'number') {
                        totalBytes += table.size_mb * 1024 * 1024; // Convert MB to bytes
                    }
                });
                
                document.getElementById('summaryTotalRows').textContent = totalRows.toLocaleString();
                document.getElementById('summaryTotalSize').textContent = bytesHuman(totalBytes);
            }

            function formatValue(value) {
                if (value === null || value === undefined) return 'N/A';
                if (typeof value === 'number') return value.toLocaleString();
                return value;
            }

            function createTable(headers, rows, highlightJoinKeys = false) {
                if (!rows || rows.length === 0) return '<p>No data available.</p>';
                const table = document.createElement('table');
                const thead = table.createTHead();
                const tbody = table.createTBody();
                const headerRow = thead.insertRow();
                headers.forEach(h => {
                    const th = document.createElement('th');
                    th.textContent = h.replace(/_/g, ' ');
                    headerRow.appendChild(th);
                });
                rows.forEach(rowData => {
                    const row = tbody.insertRow();
                    // Check if this row represents a join key for schema tables
                    const isJoinKey = highlightJoinKeys && rowData.is_potential_join_key === true;
                    if (isJoinKey) {
                        row.classList.add('join-key-row');
                    }
                    
                    headers.forEach(header => {
                        const cell = row.insertCell();
                        let value = rowData[header];
                        if (typeof value === 'object' && value !== null) {
                            cell.textContent = JSON.stringify(value);
                        } else {
                            cell.textContent = formatValue(value);
                        }
                        
                        // Highlight join key cells
                        if (isJoinKey && (header === 'column_name' || header === 'nested_field_path')) {
                            cell.classList.add('join-key-cell');
                        }
                    });
                });
                return table.outerHTML;
            }

            function renderTables() {
                let html = '';
                if (!data.tables || data.tables.length === 0) {
                    tablesContainer.innerHTML = '<p>No tables or views found in this dataset.</p>';
                    return;
                }
                for (const table of data.tables) {
                    const typeClass = table.table_type.toLowerCase();
                    const errorBadge = table.has_permission_error ? \`<div class="badge error">Error</div>\` : '';
                    let schemaHtml = '';
                    if (table.schema && table.schema.length > 0) {
                        const schemaHeaders = Object.keys(table.schema[0]);
                        schemaHtml = createTable(schemaHeaders, table.schema, true);
                    } else if (table.schema_error) {
                        schemaHtml = \`<div class="error-message">\${table.schema_error}</div>\`;
                    }
                    let sampleHtml = '';
                    if (table.sample_data && table.sample_data.length > 0) {
                        // Clean and format sample data for better display
                        const cleanSampleData = table.sample_data.map(row => {
                            const cleanRow = {};
                            Object.keys(row).forEach(key => {
                                let value = row[key];
                                // Handle BigQuery special values and types
                                if (value === null || value === undefined) {
                                    cleanRow[key] = null;
                                } else if (typeof value === 'object' && value !== null) {
                                    // For complex objects, stringify them properly
                                    cleanRow[key] = value;
                                } else if (typeof value === 'string' && value.trim() === '') {
                                    cleanRow[key] = '(empty string)';
                                } else {
                                    cleanRow[key] = value;
                                }
                            });
                            return cleanRow;
                        });
                        
                        // Show JSON format for sample data with better formatting
                        sampleHtml = \`<div class="sample-json">\${JSON.stringify(cleanSampleData, null, 2)}</div>\`;
                    } else if (table.sample_data_error) {
                        sampleHtml = \`<div class="error-message">\${table.sample_data_error}</div>\`;
                    } else {
                        sampleHtml = '<p>No sample data available.</p>';
                    }
                    const viewDefHtml = table.table_type === 'VIEW' && table.view_definition ? \`<h4>View Definition</h4><pre>\${table.view_definition.replace(/\\\\n/g, '\\n')}</pre>\` : '';
                    html += \`
                        <div class="table-item" data-name="\${table.table_name.toLowerCase()}">
                            <div class="table-header">
                                <span class="table-name">
                                    <svg class="expand-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6 4L10 8L6 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                                    \${table.table_name}
                                </span>
                                <div class="badges">
                                    <div class="badge \${typeClass}">\${table.table_type}</div>
                                    \${errorBadge}
                                </div>
                            </div>
                            <div class="details">
                                <div class="details-grid">
                                    <div class="detail-item"><strong>Rows</strong> <span>\${formatValue(table.row_count)}</span></div>
                                    <div class="detail-item"><strong>Columns</strong> <span>\${formatValue(table.schema?.length)}</span></div>
                                    <div class="detail-item"><strong>Size (MB)</strong> <span>\${formatValue(table.size_mb)}</span></div>
                                    <div class="detail-item"><strong>Partitions</strong> <span>\${table.partition_info ? table.partition_info.length : 0}</span></div>
                                    <div class="detail-item"><strong>Created (UTC)</strong> <span>\${table.creation_time}</span></div>
                                    \${table.has_permission_error ? \`<div class="detail-item"><strong>Errors On</strong> <span>\${table.error_details.join(', ')}</span></div>\` : ''}
                                </div>
                                \${viewDefHtml}
                                <h4>Schema</h4>
                                \${schemaHtml}
                                <div class="sample-section">
                                    <h4 class="sample-toggle" style="cursor: pointer; display: flex; align-items: center; user-select: none;">
                                        <svg class="sample-expand-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" style="margin-right: 8px; transition: transform 0.2s ease;"><path d="M6 4L10 8L6 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                                        Sample Data (10 rows)
                                    </h4>
                                    <div class="sample-content" style="display: none; margin-top: 10px;">
                                        \${sampleHtml}
                                    </div>
                                </div>
                            </div>
                        </div>
                    \`;
                }
                tablesContainer.innerHTML = html;
            }

            function addEventListeners() {
                const expandCollapseBtn = document.getElementById('expandCollapseBtn');
                let allExpanded = false;
                
                // Expand/Collapse all functionality
                expandCollapseBtn.addEventListener('click', () => {
                    const visibleItems = document.querySelectorAll('.table-item:not([style*="display: none"])');
                    if (allExpanded) {
                        visibleItems.forEach(item => item.classList.remove('expanded'));
                        expandCollapseBtn.textContent = 'Expand All';
                    } else {
                        visibleItems.forEach(item => item.classList.add('expanded'));
                        expandCollapseBtn.textContent = 'Collapse All';
                    }
                    allExpanded = !allExpanded;
                });
                
                // Table header click to expand individual items
                tablesContainer.addEventListener('click', e => {
                    const header = e.target.closest('.table-header');
                    if (header) {
                        header.parentElement.classList.toggle('expanded');
                    }
                    
                    // Sample data toggle functionality
                    const sampleToggle = e.target.closest('.sample-toggle');
                    if (sampleToggle) {
                        e.stopPropagation(); // Prevent table expansion
                        const sampleSection = sampleToggle.closest('.sample-section');
                        const sampleContent = sampleSection.querySelector('.sample-content');
                        const expandIcon = sampleSection.querySelector('.sample-expand-icon');
                        
                        if (sampleContent.style.display === 'none') {
                            sampleContent.style.display = 'block';
                            expandIcon.style.transform = 'rotate(90deg)';
                        } else {
                            sampleContent.style.display = 'none';
                            expandIcon.style.transform = 'rotate(0deg)';
                        }
                    }
                });
                
                // Enhanced search functionality with deep schema filtering
                searchInput.addEventListener('input', e => {
                    const searchTerm = e.target.value.toLowerCase().trim();
                    let hasVisibleItems = false;
                    
                    document.querySelectorAll('.table-item').forEach(item => {
                        const tableName = item.dataset.name;
                        let shouldShow = false;
                        let hasMatchingRows = false;
                        
                        if (!searchTerm) {
                            // No search term - show all tables and reset row visibility
                            shouldShow = true;
                            item.querySelectorAll('tr').forEach(row => {
                                row.style.display = '';
                            });
                            item.classList.remove('expanded'); // Collapse when clearing search
                        } else {
                            // Search in table name
                            if (tableName.includes(searchTerm)) {
                                shouldShow = true;
                                // Show all rows when table name matches
                                item.querySelectorAll('tr').forEach(row => {
                                    row.style.display = '';
                                });
                            } else {
                                // Deep search in schema rows
                                const schemaTable = item.querySelector('table');
                                if (schemaTable) {
                                    const rows = schemaTable.querySelectorAll('tbody tr');
                                    rows.forEach(row => {
                                        const rowText = row.textContent.toLowerCase();
                                        if (rowText.includes(searchTerm)) {
                                            row.style.display = '';
                                            hasMatchingRows = true;
                                        } else {
                                            row.style.display = 'none';
                                        }
                                    });
                                    
                                    if (hasMatchingRows) {
                                        shouldShow = true;
                                        // Auto-expand tables with matching schema rows
                                        item.classList.add('expanded');
                                    }
                                }
                            }
                        }
                        
                        item.style.display = shouldShow ? '' : 'none';
                        if (shouldShow) hasVisibleItems = true;
                    });
                    
                    // Update expand/collapse button state based on visible items
                    const visibleExpandedItems = document.querySelectorAll('.table-item:not([style*="display: none"]).expanded');
                    const visibleItems = document.querySelectorAll('.table-item:not([style*="display: none"])');
                    allExpanded = visibleExpandedItems.length === visibleItems.length && visibleItems.length > 0;
                    expandCollapseBtn.textContent = allExpanded ? 'Collapse All' : 'Expand All';
                });
            }

            function renderCharts() {
                // Create tooltip div for D3 charts
                const tooltip = d3.select('body')
                    .selectAll('.d3-tooltip')
                    .data([0])
                    .join('div')
                    .attr('class', 'd3-tooltip');

                // Clear existing charts
                d3.selectAll('.d3-chart').selectAll('*').remove();

                // Row Count Distribution (D3 Bar Chart)
                const rowCountData = data.tables
                    .filter(function(t) { return t.row_count > 0; })
                    .sort(function(a, b) { return b.row_count - a.row_count; })
                    .slice(0, 15);
                
                renderD3BarChart('rowCountChart', rowCountData, {
                    valueAccessor: function(d) { return d.row_count; },
                    labelAccessor: function(d) { return d.table_name; },
                    color: 'rgba(7, 176, 150, 0.8)',
                    formatValue: function(d) {
                        if (d >= 1000000) return (d / 1000000).toFixed(1) + 'M';
                        if (d >= 1000) return (d / 1000).toFixed(1) + 'K';
                        return d.toLocaleString();
                    },
                    tooltipLabel: 'Rows'
                });

                // Table Size Distribution (D3 Bar Chart)
                const sizeData = data.tables
                    .filter(function(t) { return t.size_mb > 0; })
                    .sort(function(a, b) { return b.size_mb - a.size_mb; })
                    .slice(0, 15);
                
                renderD3BarChart('sizeChart', sizeData, {
                    valueAccessor: function(d) { return d.size_mb; },
                    labelAccessor: function(d) { return d.table_name; },
                    color: 'rgba(120, 86, 255, 0.8)',
                    formatValue: function(d) { return d.toFixed(1) + ' MB'; },
                    tooltipLabel: 'Size'
                });

                

                // Table Types (D3 Pie Chart)
                const typeCounts = data.tables.reduce((acc, table) => {
                    acc[table.table_type] = (acc[table.table_type] || 0) + 1;
                    return acc;
                }, {});
                
                const typeData = Object.entries(typeCounts).map(function(entry) { return { label: entry[0], value: entry[1] }; });
                renderD3PieChart('tableTypeChart', typeData, {
                    colors: {
                        'BASE TABLE': 'rgba(120, 86, 255, 0.8)',
                        'MATERIALIZED VIEW': 'rgba(7, 176, 150, 0.8)', 
                        'VIEW': 'rgba(248, 188, 59, 0.8)'
                    }
                });

                // Partitioned vs Non-Partitioned (D3 Pie Chart)
                const partitionCounts = data.tables.reduce((acc, table) => {
                    const isPartitioned = table.partition_info && table.partition_info.length > 0;
                    acc[isPartitioned ? 'Partitioned' : 'Non-Partitioned'] = (acc[isPartitioned ? 'Partitioned' : 'Non-Partitioned'] || 0) + 1;
                    return acc;
                }, {});
                
                const partitionData = Object.entries(partitionCounts).map(function(entry) { return { label: entry[0], value: entry[1] }; });
                renderD3PieChart('partitionChart', partitionData, {
                    colors: {
                        'Partitioned': 'rgba(120, 86, 255, 0.8)',
                        'Non-Partitioned': 'rgba(255, 117, 87, 0.8)'
                    }
                });
            }

            // D3 Bar Chart Renderer
            function renderD3BarChart(elementId, data, options) {
                const svg = d3.select('#' + elementId);
                const container = svg.node().parentNode;
                const margin = { top: 20, right: 20, bottom: 40, left: 120 };
                const width = container.clientWidth - margin.left - margin.right;
                const height = 300 - margin.top - margin.bottom;
                
                svg.attr('width', container.clientWidth)
                   .attr('height', 300);
                
                const g = svg.append('g')
                    .attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');
                
                // Scales
                const xScale = d3.scaleLinear()
                    .domain([0, d3.max(data, function(d) { return options.valueAccessor(d); })])
                    .range([0, width]);
                
                const yScale = d3.scaleBand()
                    .domain(data.map(function(d) { return options.labelAccessor(d); }))
                    .range([0, height])
                    .padding(0.15);
                
                // Grid lines
                g.selectAll('.d3-grid-line')
                    .data(xScale.ticks(6))
                    .join('line')
                    .attr('class', 'd3-grid-line')
                    .attr('x1', function(d) { return xScale(d); })
                    .attr('x2', function(d) { return xScale(d); })
                    .attr('y1', 0)
                    .attr('y2', height);
                
                // Bars
                const tooltip = d3.select('.d3-tooltip');
                
                const bars = g.selectAll('.d3-bar')
                    .data(data)
                    .join('rect')
                    .attr('class', 'd3-bar')
                    .attr('x', 0)
                    .attr('y', function(d) { return yScale(options.labelAccessor(d)); })
                    .attr('width', function(d) { return xScale(options.valueAccessor(d)); })
                    .attr('height', yScale.bandwidth())
                    .attr('fill', options.color)
                    .attr('rx', 4)
                    .attr('ry', 4)
                    .style('filter', 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))')
                    .on('mouseover', function(event, d) {
                        d3.select(this).style('filter', 'drop-shadow(0 4px 8px rgba(0,0,0,0.4)) brightness(1.1)');
                        tooltip.style('opacity', 1)
                            .html('<strong>' + options.labelAccessor(d) + '</strong><br/>' + options.tooltipLabel + ': ' + options.formatValue(options.valueAccessor(d)))
                            .style('left', (event.pageX + 10) + 'px')
                            .style('top', (event.pageY - 10) + 'px');
                    })
                    .on('mousemove', function(event) {
                        tooltip.style('left', (event.pageX + 10) + 'px')
                            .style('top', (event.pageY - 10) + 'px');
                    })
                    .on('mouseout', function() {
                        d3.select(this).style('filter', 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))');
                        tooltip.style('opacity', 0);
                    });
                
                // Add value labels on bars for better readability
                g.selectAll('.d3-bar-label')
                    .data(data)
                    .join('text')
                    .attr('class', 'd3-bar-label')
                    .attr('x', function(d) { return xScale(options.valueAccessor(d)) + 8; })
                    .attr('y', function(d) { return yScale(options.labelAccessor(d)) + yScale.bandwidth() / 2; })
                    .attr('dy', '0.35em')
                    .style('fill', 'var(--text-secondary)')
                    .style('font-family', 'Inter, sans-serif')
                    .style('font-size', '11px')
                    .style('font-weight', '500')
                    .text(function(d) { return options.formatValue(options.valueAccessor(d)); });
                
                // X Axis
                const xAxis = g.append('g')
                    .attr('transform', 'translate(0,' + height + ')')
                    .call(d3.axisBottom(xScale)
                        .ticks(6)
                        .tickFormat(options.formatValue));
                
                xAxis.selectAll('text')
                    .attr('class', 'd3-axis-text');
                
                xAxis.selectAll('line')
                    .style('stroke', 'var(--text-secondary)')
                    .style('opacity', 0.3);
                
                xAxis.select('.domain')
                    .style('stroke', 'var(--text-secondary)')
                    .style('opacity', 0.3);
                
                // Y Axis
                const yAxis = g.append('g')
                    .call(d3.axisLeft(yScale)
                        .tickFormat(function(d) { return d.length > 17 ? d.substring(0, 17) + '...' : d; }));
                
                yAxis.selectAll('text')
                    .attr('class', 'd3-axis-text')
                    .style('cursor', 'default');
                
                yAxis.selectAll('line')
                    .style('stroke', 'var(--text-secondary)')
                    .style('opacity', 0.3);
                
                yAxis.select('.domain')
                    .style('stroke', 'var(--text-secondary)')
                    .style('opacity', 0.3);
            }

            // D3 Pie Chart Renderer
            function renderD3PieChart(elementId, data, options) {
                const svg = d3.select('#' + elementId);
                const container = svg.node().parentNode;
                const width = container.clientWidth;
                const height = 300;
                const radius = Math.min(width, height) / 2 - 40;
                
                svg.attr('width', width)
                   .attr('height', height);
                
                const g = svg.append('g')
                    .attr('transform', 'translate(' + (width/2) + ',' + (height/2 - 20) + ')');
                
                // Pie generator
                const pie = d3.pie()
                    .value(function(d) { return d.value; })
                    .sort(null);
                
                const arc = d3.arc()
                    .innerRadius(radius * 0.6)
                    .outerRadius(radius);
                
                const tooltip = d3.select('.d3-tooltip');
                const total = d3.sum(data, function(d) { return d.value; });
                
                // Pie slices
                g.selectAll('.d3-pie-slice')
                    .data(pie(data))
                    .join('path')
                    .attr('class', 'd3-pie-slice')
                    .attr('d', arc)
                    .attr('fill', function(d) { return options.colors[d.data.label] || 'rgba(120, 86, 255, 0.8)'; })
                    .attr('stroke', 'rgba(255, 255, 255, 0.1)')
                    .attr('stroke-width', 2)
                    .on('mouseover', function(event, d) {
                        const percentage = Math.round((d.data.value / total) * 100);
                        tooltip.style('opacity', 1)
                            .html('<strong>' + d.data.label + '</strong><br/>' + d.data.value + ' (' + percentage + '%)')
                            .style('left', (event.pageX + 10) + 'px')
                            .style('top', (event.pageY - 10) + 'px');
                    })
                    .on('mousemove', function(event) {
                        tooltip.style('left', (event.pageX + 10) + 'px')
                            .style('top', (event.pageY - 10) + 'px');
                    })
                    .on('mouseout', function() {
                        tooltip.style('opacity', 0);
                    });
                
                // Legend
                const legend = svg.append('g')
                    .attr('class', 'd3-legend')
                    .attr('transform', 'translate(20, ' + (height - 30) + ')');
                
                const legendItems = legend.selectAll('.legend-item')
                    .data(data)
                    .join('g')
                    .attr('class', 'legend-item')
                    .attr('transform', function(d, i) { return 'translate(' + (i * 120) + ', 0)'; });
                
                legendItems.append('circle')
                    .attr('r', 6)
                    .attr('fill', function(d) { return options.colors[d.label] || 'rgba(120, 86, 255, 0.8)'; });
                
                legendItems.append('text')
                    .attr('x', 12)
                    .attr('y', 0)
                    .attr('dy', '0.35em')
                    .attr('class', 'd3-legend')
                    .text(function(d) { return d.label; });
            }

            function renderLineage() {
                if (!data.lineage || !data.lineage.nodes || data.lineage.nodes.length === 0) {
                    document.querySelector('.lineage-container').innerHTML = '<p style="text-align: center; color: var(--text-secondary); margin-top: 50px;">No relationships found. Views with table dependencies and tables with shared join keys will appear here.</p>';
                    return;
                }

                const svg = d3.select('#lineageChart');
                const container = svg.node().parentNode;
                const width = container.clientWidth - 40;
                const height = 500;
                
                svg.attr('width', width).attr('height', height);
                
                // Clear any existing content
                svg.selectAll('g').remove();
                
                // Add zoom behavior
                const zoom = d3.zoom()
                    .scaleExtent([0.1, 4])
                    .on('zoom', (event) => {
                        g.attr('transform', event.transform);
                    });
                
                svg.call(zoom);
                
                const g = svg.append('g');
                
                // Create simulation
                const simulation = d3.forceSimulation(data.lineage.nodes)
                    .force('link', d3.forceLink(data.lineage.edges).id(d => d.id).distance(d => d.type === 'view_dependency' ? 150 : 100))
                    .force('charge', d3.forceManyBody().strength(-400))
                    .force('center', d3.forceCenter(width / 2, height / 2))
                    .force('collision', d3.forceCollide().radius(50));
                
                // Add links
                const link = g.append('g')
                    .selectAll('path')
                    .data(data.lineage.edges)
                    .join('path')
                    .attr('class', d => 'link link-' + d.type.replace('_', '-'))
                    .attr('stroke', d => d.type === 'view_dependency' ? 'rgba(248, 188, 59, 0.8)' : 'rgba(7, 176, 150, 0.6)')
                    .attr('stroke-width', d => d.type === 'view_dependency' ? 3 : 2)
                    .attr('stroke-dasharray', d => d.type === 'join_key' ? '5,5' : 'none')
                    .attr('fill', 'none')
                    .attr('marker-end', d => d.type === 'view_dependency' ? 'url(#arrowhead-view)' : 'none');
                
                // Add edge labels
                const edgeLabels = g.append('g')
                    .selectAll('text')
                    .data(data.lineage.edges.filter(d => d.label))
                    .join('text')
                    .attr('class', 'edge-label')
                    .text(d => d.label);
                
                // Add nodes
                const node = g.append('g')
                    .selectAll('g')
                    .data(data.lineage.nodes)
                    .join('g')
                    .attr('class', 'node')
                    .call(d3.drag()
                        .on('start', dragstarted)
                        .on('drag', dragged)
                        .on('end', dragended));
                
                // Add circles for nodes
                node.append('circle')
                    .attr('r', d => Math.max(15, Math.min(30, Math.sqrt(d.row_count / 1000))))
                    .attr('class', d => d.type === 'TABLE' ? 'node-table' : 'node-view')
                    .attr('stroke-width', 2);
                
                // Add labels
                node.append('text')
                    .attr('class', 'node-text')
                    .attr('dy', '.35em')
                    .style('font-size', '10px')
                    .text(d => d.id.length > 12 ? d.id.substring(0, 12) + '...' : d.id);
                
                // Add title for hover
                node.append('title')
                    .text(d => {
                        let title = d.id + ' (' + d.type + ')\\nRows: ' + d.row_count.toLocaleString() + '\\nSize: ' + d.size_mb + ' MB';
                        if (d.join_keys && d.join_keys.length > 0) {
                            title += '\\nJoin Keys: ' + d.join_keys.join(', ');
                        }
                        return title;
                    });
                
                // Node click handler for highlighting
                node.on('click', function(event, d) {
                    const isSelected = d3.select(this).classed('selected');
                    
                    // Reset all nodes and links
                    node.selectAll('circle').style('opacity', 0.3);
                    link.style('opacity', 0.1);
                    
                    if (!isSelected) {
                        // Highlight clicked node
                        d3.select(this).select('circle').style('opacity', 1);
                        d3.select(this).classed('selected', true);
                        
                        // Highlight connected links and nodes
                        link.filter(l => l.source.id === d.id || l.target.id === d.id)
                            .style('opacity', 1);
                        
                        const connectedNodes = new Set();
                        data.lineage.edges.forEach(edge => {
                            if (edge.source.id === d.id) connectedNodes.add(edge.target.id);
                            if (edge.target.id === d.id) connectedNodes.add(edge.source.id);
                        });
                        
                        node.filter(n => connectedNodes.has(n.id))
                            .select('circle')
                            .style('opacity', 0.8);
                    } else {
                        // Reset selection
                        node.classed('selected', false);
                        node.selectAll('circle').style('opacity', 1);
                        link.style('opacity', 1);
                    }
                });
                
                // Simulation tick
                simulation.on('tick', () => {
                    link.attr('d', d => {
                        const dx = d.target.x - d.source.x;
                        const dy = d.target.y - d.source.y;
                        const dr = Math.sqrt(dx * dx + dy * dy);
                        return 'M' + d.source.x + ',' + d.source.y + 'A' + dr + ',' + dr + ' 0 0,1 ' + d.target.x + ',' + d.target.y;
                    });
                    
                    // Position edge labels
                    edgeLabels.attr('x', d => (d.source.x + d.target.x) / 2)
                        .attr('y', d => (d.source.y + d.target.y) / 2 - 5);
                    
                    node.attr('transform', d => 'translate(' + d.x + ',' + d.y + ')');
                });
                
                // Control handlers
                document.getElementById('resetZoom').onclick = () => {
                    svg.transition().duration(750).call(
                        zoom.transform,
                        d3.zoomIdentity
                    );
                };
                
                document.getElementById('fitToView').onclick = () => {
                    const bounds = g.node().getBBox();
                    const fullWidth = width;
                    const fullHeight = height;
                    const midX = bounds.x + bounds.width / 2;
                    const midY = bounds.y + bounds.height / 2;
                    const scale = Math.min(fullWidth / bounds.width, fullHeight / bounds.height) * 0.8;
                    const translate = [fullWidth / 2 - scale * midX, fullHeight / 2 - scale * midY];
                    
                    svg.transition().duration(750).call(
                        zoom.transform,
                        d3.zoomIdentity.translate(translate[0], translate[1]).scale(scale)
                    );
                };
                
                function dragstarted(event, d) {
                    if (!event.active) simulation.alphaTarget(0.3).restart();
                    d.fx = d.x;
                    d.fy = d.y;
                }
                
                function dragged(event, d) {
                    d.fx = event.x;
                    d.fy = event.y;
                }
                
                function dragended(event, d) {
                    if (!event.active) simulation.alphaTarget(0);
                    d.fx = null;
                    d.fy = null;
                }
            }

            renderSummary();
            renderTables();
            renderCharts();
            renderLineage();
            addEventListeners();
        });
    </script>
</body>
</html>
`;
}

export default generateHtmlReport;