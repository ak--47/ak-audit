function generateHtmlReport(data) {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>BigQuery Dataset Audit Report</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
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
        .search-box { margin-bottom: 25px; }
        .search-box input {
            width: 100%;
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
        <main>
            <div class="search-box">
                <input type="text" id="searchInput" placeholder="Search by table name...">
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

            function createTable(headers, rows) {
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
                    headers.forEach(header => {
                        const cell = row.insertCell();
                        let value = rowData[header];
                        if (typeof value === 'object' && value !== null) {
                            cell.textContent = JSON.stringify(value);
                        } else {
                            cell.textContent = formatValue(value);
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
                        schemaHtml = createTable(schemaHeaders, table.schema);
                    } else if (table.schema_error) {
                        schemaHtml = \`<div class="error-message">\${table.schema_error}</div>\`;
                    }
                    let sampleHtml = '';
                    if (table.sample_data && table.sample_data.length > 0) {
                        const sampleHeaders = Object.keys(table.sample_data[0]);
                        sampleHtml = createTable(sampleHeaders, table.sample_data);
                    } else if (table.sample_data_error) {
                        sampleHtml = \`<div class="error-message">\${table.sample_data_error}</div>\`;
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
                tablesContainer.addEventListener('click', e => {
                    const header = e.target.closest('.table-header');
                    if (header) {
                        header.parentElement.classList.toggle('expanded');
                    }
                });
                searchInput.addEventListener('input', e => {
                    const searchTerm = e.target.value.toLowerCase();
                    document.querySelectorAll('.table-item').forEach(item => {
                        const name = item.dataset.name;
                        item.style.display = name.includes(searchTerm) ? '' : 'none';
                    });
                });
            }

            renderSummary();
            renderTables();
            addEventListeners();
        });
    </script>
</body>
</html>
`;
}

export default generateHtmlReport;