function generateHtmlReport(data) {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>BigQuery Dataset Audit Report</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
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
        .analytics-section { margin-bottom: 40px; }
        .charts-grid { 
            display: grid; 
            grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); 
            gap: 20px; 
            margin-bottom: 30px; 
        }
        .chart-container { 
            background: var(--bg-medium); 
            border: 1px solid var(--border-color); 
            border-radius: 12px; 
            padding: 20px; 
            position: relative;
            min-height: 300px;
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
            <div class="card error"><h3>Objects with Errors</h3><div class="number" id="summaryFailedObjects">0</div></div>
        </section>
        
        <section class="analytics-section">
            <h2 style="color: var(--mint-100); font-weight: 600; margin-bottom: 20px; font-size: 1.8rem;">📊 Table Analytics</h2>
            <div class="charts-grid">
                <div class="chart-container">
                    <div class="chart-title">Table Size Distribution</div>
                    <canvas id="sizeChart"></canvas>
                </div>
                <div class="chart-container">
                    <div class="chart-title">Row Count Distribution</div>
                    <canvas id="rowCountChart"></canvas>
                </div>
                <div class="chart-container">
                    <div class="chart-title">Table Types</div>
                    <canvas id="tableTypeChart"></canvas>
                </div>
                <div class="chart-container">
                    <div class="chart-title">Partitioned vs Non-Partitioned</div>
                    <canvas id="partitionChart"></canvas>
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

            function renderSummary() {
                document.getElementById('headerProject').textContent = data.audit_metadata.project_id;
                document.getElementById('headerDataset').textContent = data.audit_metadata.dataset_id;
                document.getElementById('summaryTotalObjects').textContent = data.summary.total_objects.toLocaleString();
                document.getElementById('summaryTables').textContent = data.summary.total_tables.toLocaleString();
                document.getElementById('summaryViews').textContent = data.summary.total_views.toLocaleString();
                document.getElementById('summaryFailedObjects').textContent = data.summary.failed_objects.toLocaleString();
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
                        // Show JSON format for sample data
                        sampleHtml = \`<div class="sample-json">\${JSON.stringify(table.sample_data, null, 2)}</div>\`;
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
                                <h4>Sample Data (10 rows)</h4>
                                \${sampleHtml}
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
                });
                
                // Enhanced search functionality
                searchInput.addEventListener('input', e => {
                    const searchTerm = e.target.value.toLowerCase();
                    let hasVisibleItems = false;
                    
                    document.querySelectorAll('.table-item').forEach(item => {
                        const tableName = item.dataset.name;
                        let shouldShow = false;
                        
                        // Search in table name
                        if (tableName.includes(searchTerm)) {
                            shouldShow = true;
                        }
                        
                        // Search in table content (schema fields)
                        if (!shouldShow && searchTerm) {
                            const tableContent = item.textContent.toLowerCase();
                            shouldShow = tableContent.includes(searchTerm);
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
                // Chart.js default colors in dark theme
                Chart.defaults.color = '#a3b3cc';
                Chart.defaults.backgroundColor = 'rgba(120, 86, 255, 0.8)';
                Chart.defaults.borderColor = '#2c3a54';
                Chart.defaults.plugins.legend.labels.color = '#a3b3cc';

                // Destroy existing chart instances and reset canvas elements to prevent memory leaks and growing charts
                const existingCharts = ['sizeChart', 'rowCountChart', 'tableTypeChart', 'partitionChart'];
                existingCharts.forEach(chartId => {
                    const existingChart = Chart.getChart(chartId);
                    if (existingChart) {
                        existingChart.destroy();
                    }
                    
                    // Reset the canvas element completely with fixed dimensions
                    const canvas = document.getElementById(chartId);
                    if (canvas) {
                        const parent = canvas.parentNode;
                        const newCanvas = document.createElement('canvas');
                        newCanvas.id = chartId;
                        // Set explicit canvas size to prevent growing
                        newCanvas.width = 400;
                        newCanvas.height = 300;
                        newCanvas.style.width = '100%';
                        newCanvas.style.height = '300px';
                        parent.replaceChild(newCanvas, canvas);
                    }
                });

                // Table Size Distribution
                const sizeData = data.tables
                    .filter(t => t.size_mb > 0)
                    .sort((a, b) => b.size_mb - a.size_mb)
                    .slice(0, 10); // Top 10 largest tables
                
                new Chart(document.getElementById('sizeChart'), {
                    type: 'bar',
                    data: {
                        labels: sizeData.map(t => t.table_name),
                        datasets: [{
                            label: 'Size (MB)',
                            data: sizeData.map(t => t.size_mb),
                            backgroundColor: 'rgba(120, 86, 255, 0.6)',
                            borderColor: 'rgba(120, 86, 255, 1)',
                            borderWidth: 1
                        }]
                    },
                    options: {
                        responsive: false,
                        maintainAspectRatio: false,
                        animation: false,
                        plugins: {
                            legend: { display: false }
                        },
                        scales: {
                            y: {
                                beginAtZero: true,
                                grid: { color: '#2c3a54' },
                                ticks: { color: '#a3b3cc' }
                            },
                            x: {
                                grid: { color: '#2c3a54' },
                                ticks: { 
                                    color: '#a3b3cc',
                                    maxRotation: 45
                                }
                            }
                        }
                    }
                });

                // Row Count Distribution  
                const rowData = data.tables
                    .filter(t => t.row_count > 0)
                    .sort((a, b) => b.row_count - a.row_count)
                    .slice(0, 10);
                
                new Chart(document.getElementById('rowCountChart'), {
                    type: 'bar',
                    data: {
                        labels: rowData.map(t => t.table_name),
                        datasets: [{
                            label: 'Row Count',
                            data: rowData.map(t => t.row_count),
                            backgroundColor: 'rgba(7, 176, 150, 0.6)',
                            borderColor: 'rgba(7, 176, 150, 1)',
                            borderWidth: 1
                        }]
                    },
                    options: {
                        responsive: false,
                        maintainAspectRatio: false,
                        animation: false,
                        plugins: {
                            legend: { display: false }
                        },
                        scales: {
                            y: {
                                beginAtZero: true,
                                grid: { color: '#2c3a54' },
                                ticks: { 
                                    color: '#a3b3cc',
                                    callback: function(value) {
                                        return value.toLocaleString();
                                    }
                                }
                            },
                            x: {
                                grid: { color: '#2c3a54' },
                                ticks: { 
                                    color: '#a3b3cc',
                                    maxRotation: 45
                                }
                            }
                        }
                    }
                });

                // Table Types
                const typeCounts = data.tables.reduce((acc, table) => {
                    acc[table.table_type] = (acc[table.table_type] || 0) + 1;
                    return acc;
                }, {});

                new Chart(document.getElementById('tableTypeChart'), {
                    type: 'doughnut',
                    data: {
                        labels: Object.keys(typeCounts),
                        datasets: [{
                            data: Object.values(typeCounts),
                            backgroundColor: [
                                'rgba(120, 86, 255, 0.8)',
                                'rgba(7, 176, 150, 0.8)',
                                'rgba(248, 188, 59, 0.8)'
                            ],
                            borderColor: [
                                'rgba(120, 86, 255, 1)',
                                'rgba(7, 176, 150, 1)',
                                'rgba(248, 188, 59, 1)'
                            ],
                            borderWidth: 2
                        }]
                    },
                    options: {
                        responsive: false,
                        maintainAspectRatio: false,
                        animation: false,
                        plugins: {
                            legend: {
                                position: 'bottom',
                                labels: { color: '#a3b3cc' }
                            }
                        }
                    }
                });

                // Partitioned vs Non-Partitioned
                const partitionCounts = data.tables.reduce((acc, table) => {
                    const isPartitioned = table.partition_info && table.partition_info.length > 0;
                    acc[isPartitioned ? 'Partitioned' : 'Non-Partitioned'] = (acc[isPartitioned ? 'Partitioned' : 'Non-Partitioned'] || 0) + 1;
                    return acc;
                }, {});

                new Chart(document.getElementById('partitionChart'), {
                    type: 'pie',
                    data: {
                        labels: Object.keys(partitionCounts),
                        datasets: [{
                            data: Object.values(partitionCounts),
                            backgroundColor: [
                                'rgba(120, 86, 255, 0.8)',
                                'rgba(255, 117, 87, 0.8)'
                            ],
                            borderColor: [
                                'rgba(120, 86, 255, 1)',
                                'rgba(255, 117, 87, 1)'
                            ],
                            borderWidth: 2
                        }]
                    },
                    options: {
                        responsive: false,
                        maintainAspectRatio: false,
                        animation: false,
                        plugins: {
                            legend: {
                                position: 'bottom',
                                labels: { color: '#a3b3cc' }
                            }
                        }
                    }
                });
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