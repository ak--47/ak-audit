// HTML template tag for syntax highlighting
const html = (strings, ...values) => {
    return strings.reduce((result, string, i) => {
        return result + string + (values[i] || '');
    }, '');
};

function generateHtmlReport(data) {
    return html`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Data Warehouse Audit Report</title>
    <link rel="icon" type="image/x-icon" href="favicon.ico">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <script src="https://cdn.jsdelivr.net/npm/d3@7"></script>
    <style>
        :root {
            /* Mixpanel-inspired Dark Mode Colors */
            --bg-primary: #0D1116;
            --bg-secondary: #161B22;
            --bg-tertiary: #21262D;
            --bg-card: #161B22;
            --bg-elevated: #1C2128;
            
            --text-primary: #F0F6FC;
            --text-secondary: #8B949E;
            --text-muted: #6E7681;
            --text-accent: #FFFFFF;
            
            --border-primary: #30363D;
            --border-secondary: #21262D;
            --border-focus: #8B5CF6;
            
            /* Mixpanel Core Purple */
            --accent-purple: #8B5CF6;
            --accent-purple-hover: #7C3AED;
            --accent-purple-light: #A78BFA;
            --accent-purple-dark: #6D28D9;
            
            /* Mixpanel Brand Colors */
            --mixpanel-purple: #7856FF;
            --mixpanel-purple-light: #9B7EFF;
            --mixpanel-purple-dark: #5B3FD6;
            
            /* Status Colors */
            --success: #238636;
            --success-light: #2DA44E;
            --warning: #D1742F;
            --warning-light: #F85149;
            --error: #DA3633;
            --error-light: #FF6B6B;
            
            /* Chart Colors - Mixpanel Inspired */
            --chart-color-1: #8B5CF6;
            --chart-color-2: #06B6D4;
            --chart-color-3: #10B981;
            --chart-color-4: #F59E0B;
            --chart-color-5: #EF4444;
            --chart-color-6: #8B5A2B;
            --chart-color-7: #EC4899;
            --chart-color-8: #84CC16;
            
            /* Effects */
            --shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
            --shadow-sm: 0 2px 8px rgba(0, 0, 0, 0.3);
            --shadow-card: 0 1px 3px rgba(0, 0, 0, 0.6);
            --glow-purple: 0 0 0 3px rgba(139, 92, 246, 0.1);
            
            --font-mono: 'SF Mono', 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
            --font-sans: "Apercu Pro", "Helvetica Neue", Helvetica, Tahoma, Geneva, Arial, sans-serif;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: var(--font-sans);
            background: var(--bg-primary);
            color: var(--text-primary);
            line-height: 1.5;
            min-height: 100vh;
        }
        
        /* Header Styles */
        .container { max-width: 1440px; margin: 0 auto; padding: 32px 24px; }
        header { 
            text-align: center; 
            margin-bottom: 48px;
            padding: 40px 0;
            background: linear-gradient(135deg, var(--bg-secondary) 0%, var(--bg-tertiary) 100%);
            border-radius: 16px;
            border: 1px solid var(--border-primary);
            box-shadow: var(--shadow-card);
        }
        h1 {
            font-size: 3rem;
            font-weight: 700;
            background: linear-gradient(135deg, var(--mixpanel-purple), var(--accent-purple-light));
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
            margin-bottom: 12px;
            letter-spacing: -0.02em;
        }
        .subtitle { 
            color: var(--text-secondary); 
            font-size: 1.125rem; 
            font-weight: 400;
            max-width: 600px;
            margin: 0 auto;
        }
        .subtitle code { 
            background: var(--bg-tertiary); 
            padding: 4px 8px; 
            border-radius: 6px; 
            font-weight: 500; 
            color: var(--accent-purple-light);
            font-family: var(--font-mono);
            font-size: 0.9em;
            border: 1px solid var(--border-secondary);
        }
        /* Summary Cards */
        .summary-cards {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 24px;
            margin-bottom: 48px;
        }
        @media (max-width: 1200px) {
            .summary-cards {
                grid-template-columns: repeat(2, 1fr);
            }
        }
        @media (max-width: 600px) {
            .summary-cards {
                grid-template-columns: 1fr;
            }
        }
        .card {
            background: var(--bg-card);
            border: 1px solid var(--border-primary);
            border-radius: 12px;
            padding: 32px 24px;
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            position: relative;
            overflow: hidden;
        }
        .card::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 3px;
            background: linear-gradient(90deg, var(--mixpanel-purple), var(--accent-purple-light));
            opacity: 0;
            transition: opacity 0.2s ease;
        }
        .card:hover { 
            transform: translateY(-2px); 
            box-shadow: var(--shadow); 
            border-color: var(--border-focus);
        }
        .card:hover::before { opacity: 1; }
        .card h3 {
            color: var(--text-secondary);
            font-size: 0.875rem;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            margin-bottom: 16px;
        }
        .card .number { 
            font-size: 2.5rem; 
            font-weight: 700; 
            color: var(--text-primary);
            line-height: 1;
            margin-bottom: 8px;
        }
        .card.error .number { color: var(--error-light); }
        .card.error::before { background: linear-gradient(90deg, var(--error), var(--error-light)); }
        /* Search and Controls */
        .search-box { 
            margin-bottom: 32px; 
            display: flex; 
            gap: 16px; 
            align-items: center;
            flex-wrap: wrap;
        }
        .search-box input {
            flex: 1;
            min-width: 320px;
            padding: 16px 20px;
            font-size: 1rem;
            background: var(--bg-card);
            border: 1px solid var(--border-primary);
            border-radius: 8px;
            color: var(--text-primary);
            transition: all 0.2s ease;
            font-family: var(--font-sans);
        }
        .search-box input::placeholder {
            color: var(--text-muted);
        }
        .search-box input:focus {
            outline: none;
            border-color: var(--border-focus);
            box-shadow: var(--glow-purple);
            background: var(--bg-elevated);
        }
        .expand-collapse-btn {
            padding: 14px 24px;
            background: var(--mixpanel-purple);
            color: var(--text-accent);
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-weight: 600;
            font-family: var(--font-sans);
            transition: all 0.2s ease;
            white-space: nowrap;
        }
        .expand-collapse-btn:hover { 
            background: var(--mixpanel-purple-dark); 
            transform: translateY(-1px);
        }
        .expand-collapse-btn:active { 
            transform: translateY(0); 
        }
        /* Table Items */
        .table-item {
            background: var(--bg-card);
            border: 1px solid var(--border-primary);
            border-radius: 12px;
            margin-bottom: 20px;
            overflow: hidden;
            transition: all 0.2s ease;
            box-shadow: var(--shadow-card);
        }
        .table-item:hover {
            border-color: var(--border-focus);
            box-shadow: var(--shadow-sm);
        }
        .table-header { 
            padding: 24px; 
            cursor: pointer; 
            display: flex; 
            justify-content: space-between; 
            align-items: center;
            border-bottom: 1px solid transparent;
            transition: all 0.2s ease;
        }
        .table-header:hover { 
            background: var(--bg-elevated);
        }
        .table-item.expanded .table-header {
            border-bottom-color: var(--border-secondary);
        }
        .table-name { 
            font-size: 1.25rem; 
            font-weight: 600; 
            color: var(--mixpanel-purple-light); 
            display: flex; 
            align-items: center;
            font-family: var(--font-mono);
        }
        .expand-icon { 
            transition: transform 0.2s ease; 
            margin-right: 16px; 
            color: var(--text-secondary);
            font-size: 0.875rem;
        }
        .table-item.expanded .expand-icon { transform: rotate(90deg); }
        /* Badges */
        .badges { display: flex; gap: 12px; flex-wrap: wrap; }
        .badge {
            padding: 6px 12px;
            border-radius: 6px;
            font-size: 0.75rem;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.025em;
            border: 1px solid transparent;
        }
        .badge.table { 
            background: rgba(139, 92, 246, 0.15); 
            color: var(--accent-purple-light);
            border-color: rgba(139, 92, 246, 0.25);
        }
        .badge.view { 
            background: rgba(16, 185, 129, 0.15); 
            color: var(--chart-color-3);
            border-color: rgba(16, 185, 129, 0.25);
        }
        .badge.error { 
            background: rgba(239, 68, 68, 0.15); 
            color: var(--error-light);
            border-color: rgba(239, 68, 68, 0.25);
        }
        /* Table Details */
        .details { 
            display: none; 
            padding: 24px; 
            background: var(--bg-tertiary);
            border-top: 1px solid var(--border-secondary); 
        }
        .table-item.expanded .details { display: block; }
        .details-grid { 
            display: grid; 
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); 
            gap: 24px; 
            margin-bottom: 24px; 
        }
        .detail-item strong { 
            display: block; 
            color: var(--text-secondary); 
            font-size: 0.75rem; 
            margin-bottom: 6px; 
            text-transform: uppercase;
            font-weight: 600;
            letter-spacing: 0.05em;
        }
        .detail-item span { 
            font-weight: 500; 
            color: var(--text-primary);
            font-size: 0.9rem;
        }
        h4 { 
            color: var(--accent-purple-light); 
            font-weight: 600; 
            margin: 24px 0 16px;
            font-size: 1.1rem;
        }
        /* Tables and Code */
        pre, table {
            background: var(--bg-primary);
            border: 1px solid var(--border-primary);
            border-radius: 8px;
            padding: 16px;
            font-size: 0.875rem;
            color: var(--text-secondary);
            max-height: 400px;
            overflow: auto;
            font-family: var(--font-mono);
        }
        table { 
            width: 100%; 
            border-collapse: collapse; 
            padding: 0;
        }
        th, td { 
            padding: 12px 16px; 
            text-align: left; 
            border-bottom: 1px solid var(--border-secondary); 
            font-size: 0.875rem;
        }
        th { 
            color: var(--text-primary); 
            font-weight: 600; 
            background: var(--bg-secondary);
            position: sticky;
            top: 0;
            z-index: 1;
        }
        tr:hover { 
            background: var(--bg-elevated); 
        }
        tr:hover td { 
            color: var(--text-primary); 
        }
        /* Special States */
        .error-message { 
            background: rgba(239, 68, 68, 0.1); 
            border: 1px solid var(--error-light); 
            color: var(--error-light); 
            padding: 12px; 
            border-radius: 8px; 
            margin-top: 16px; 
            font-family: var(--font-mono);
            font-size: 0.875rem;
        }
        .join-key-row { 
            background: rgba(139, 92, 246, 0.08);
            border-left: 3px solid var(--accent-purple);
        }
        .join-key-cell { 
            color: var(--accent-purple-light); 
            font-weight: 600; 
        }
        .complex-field-row { 
            background: rgba(245, 158, 11, 0.08); 
            border-left: 3px solid var(--chart-color-4);
        }
        .complex-field-cell { 
            color: var(--chart-color-4); 
            font-weight: 600; 
        }
        .pii-field-row { 
            background: rgba(239, 68, 68, 0.12); 
            border-left: 3px solid var(--error-light);
        }
        .pii-field-cell { 
            color: var(--error-light); 
            font-weight: 600; 
        }
        .nested-field-indicator { 
            display: inline-block; 
            margin-left: 8px; 
            padding: 3px 8px; 
            background: rgba(245, 158, 11, 0.15); 
            color: var(--chart-color-4); 
            font-size: 0.7rem; 
            border-radius: 4px; 
            font-weight: 600;
            border: 1px solid rgba(245, 158, 11, 0.25);
        }
        /* Sample Data */
        .sample-json { 
            background: var(--bg-primary); 
            border: 1px solid var(--border-primary); 
            border-radius: 8px; 
            padding: 16px; 
            font-family: var(--font-mono); 
            font-size: 0.875rem; 
            color: var(--text-secondary); 
            max-height: 400px; 
            overflow: auto; 
            white-space: pre-wrap; 
        }
        .sample-section { margin-top: 24px; }
        .sample-toggle { 
            color: var(--accent-purple-light); 
            font-weight: 600; 
            margin: 24px 0 12px; 
            transition: color 0.2s ease;
            cursor: pointer;
        }
        .sample-toggle:hover { color: var(--text-primary); }
        .sample-expand-icon { color: var(--accent-purple-light); }
        
        /* Charts */
        .analytics-section { margin-bottom: 48px; }
        .charts-grid { 
            display: grid; 
            grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); 
            gap: 24px; 
            margin-bottom: 32px; 
        }
        .chart-container.full-width {
            grid-column: 1 / -1;
        }
        .chart-container { 
            background: var(--bg-card); 
            border: 1px solid var(--border-primary); 
            border-radius: 12px; 
            padding: 24px; 
            position: relative;
            max-height: 600px;
            overflow-y: auto;
            overflow-x: hidden;
            box-shadow: var(--shadow-card);
            transition: all 0.2s ease;
        }
        .chart-container:hover {
            border-color: var(--border-focus);
            box-shadow: var(--shadow-sm);
        }
        .chart-container h3 {
            color: var(--text-primary);
            font-size: 1.125rem;
            font-weight: 600;
            margin-bottom: 20px;
            padding-bottom: 12px;
            border-bottom: 1px solid var(--border-secondary);
        }
        .d3-chart {
            width: 100%;
            min-height: 300px;
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
            stroke: rgba(48, 54, 61, 0.3);
            stroke-width: 1;
        }
        .d3-tooltip {
            position: absolute;
            background: rgba(33, 38, 45, 0.95);
            color: var(--text-primary);
            border: 1px solid var(--border-primary);
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
            background: var(--bg-card);
            border: 1px solid var(--border-primary);
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
            background: var(--accent-purple);
            color: white;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 0.85rem;
            transition: background 0.2s ease;
        }
        .lineage-controls button:hover {
            background: rgba(139, 92, 246, 0.8);
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
            fill: var(--chart-color-1);
            stroke: var(--accent-purple);
        }
        .node-view {
            fill: var(--chart-color-3);
            stroke: var(--success);
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
            stroke: rgba(245, 158, 11, 0.8);
            stroke-width: 3;
            marker-end: url(#arrowhead-view);
        }
        .link-join-key {
            stroke: rgba(16, 185, 129, 0.6);
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
            <p class="subtitle">Project: <code id="headerProject"></code> &nbsp;&bull;&nbsp; Dataset: <code id="headerDataset"></code> &nbsp;&bull;&nbsp; <span id="headerErrors" style="color: var(--error-light);"></span></p>
        </header>
        <section class="summary-cards">
            <div class="card"><h3>Total Objects</h3><div class="number" id="summaryTotalObjects">0</div></div>
            <div class="card">
                <h3>Tables & Views</h3>
                <div style="display: flex; align-items: baseline; gap: 16px; justify-content: center;">
                    <div style="text-align: center;">
                        <div class="number" id="summaryTables">0</div>
                        <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 4px;">Tables</div>
                    </div>
                    <div style="color: var(--text-muted); font-size: 1.5rem;">+</div>
                    <div style="text-align: center;">
                        <div class="number" id="summaryViews">0</div>
                        <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 4px;">Views</div>
                    </div>
                </div>
            </div>
            <div class="card"><h3>Total Rows</h3><div class="number" id="summaryTotalRows">0</div></div>
            <div class="card"><h3>Total Size</h3><div class="number" id="summaryTotalSize">0 B</div></div>
        </section>
        
        <!-- Analytics Insights Section -->
        <section class="analytics-insights-section">
            <h2 style="color: var(--accent-purple-light); font-weight: 600; margin-bottom: 20px; font-size: 1.8rem;">🎯 Analytics & Data Quality Insights</h2>
            
            <!-- Mixpanel Compatibility Cards -->
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 25px;">
                <div class="card analytics-card" data-category="mixpanel_ready" style="background: linear-gradient(135deg, rgba(139, 92, 246, 0.1), rgba(139, 92, 246, 0.05)); border-color: rgba(139, 92, 246, 0.3); cursor: pointer; transition: all 0.2s ease;">
                    <h3 style="color: var(--accent-purple);">🚀 Mixpanel Ready</h3>
                    <div class="number" style="color: var(--accent-purple);" id="mixpanelReadyCount">0</div>
                    <div style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 5px;">Tables with timestamp + user ID</div>
                    <div id="mixpanelReadyList" class="table-list" style="display: none; margin-top: 10px; font-size: 0.8rem;"></div>
                </div>
                <div class="card analytics-card" data-category="event_tables" style="background: linear-gradient(135deg, rgba(16, 185, 129, 0.1), rgba(16, 185, 129, 0.05)); border-color: rgba(16, 185, 129, 0.3); cursor: pointer; transition: all 0.2s ease;">
                    <h3 style="color: var(--chart-color-3);">📅 Event Tables</h3>
                    <div class="number" style="color: var(--chart-color-3);" id="eventTablesCount">0</div>
                    <div style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 5px;">Tables with timestamp fields</div>
                    <div id="eventTablesList" class="table-list" style="display: none; margin-top: 10px; font-size: 0.8rem;"></div>
                </div>
                <div class="card analytics-card" data-category="user_tables" style="background: linear-gradient(135deg, rgba(245, 158, 11, 0.1), rgba(245, 158, 11, 0.05)); border-color: rgba(245, 158, 11, 0.3); cursor: pointer; transition: all 0.2s ease;">
                    <h3 style="color: var(--chart-color-4);">👤 User Tables</h3>
                    <div class="number" style="color: var(--chart-color-4);" id="userTablesCount">0</div>
                    <div style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 5px;">Tables with user identifiers</div>
                    <div id="userTablesList" class="table-list" style="display: none; margin-top: 10px; font-size: 0.8rem;"></div>
                </div>
                <div class="card analytics-card" data-category="pii_detected" style="background: linear-gradient(135deg, rgba(239, 68, 68, 0.1), rgba(239, 68, 68, 0.05)); border-color: rgba(239, 68, 68, 0.3); cursor: pointer; transition: all 0.2s ease;">
                    <h3 style="color: var(--error-light);">⚠️ PII Detected</h3>
                    <div class="number" style="color: var(--error-light);" id="piiTablesCount">0</div>
                    <div style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 5px;">Tables with potential PII</div>
                    <div id="piiTablesList" class="table-list" style="display: none; margin-top: 10px; font-size: 0.8rem;"></div>
                </div>
            </div>
            
            <!-- Field Pattern Analysis -->
            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; margin-bottom: 25px;">
                <div style="background: var(--bg-card); border: 1px solid var(--border-primary); border-radius: 12px; padding: 20px;">
                    <h3 style="color: var(--accent-purple-light); font-size: 1.1rem; margin-bottom: 15px;">🏷️ Common Field Patterns</h3>
                    <div id="fieldPatternsAnalysis" style="display: grid; gap: 10px;"></div>
                </div>
                <div style="background: var(--bg-card); border: 1px solid var(--border-primary); border-radius: 12px; padding: 20px;">
                    <h3 style="color: var(--accent-purple-light); font-size: 1.1rem; margin-bottom: 15px;">📊 Data Quality Overview</h3>
                    <div id="dataQualityOverview" style="display: grid; gap: 8px;"></div>
                </div>
                <div style="background: var(--bg-card); border: 1px solid var(--border-primary); border-radius: 12px; padding: 20px;">
                    <h3 style="color: var(--error-light); font-size: 1.1rem; margin-bottom: 15px;">🏗️ Schema Complexity</h3>
                    <div id="schemaComplexityOverview" style="display: grid; gap: 8px;"></div>
                </div>
            </div>
        </section>
        
        <section class="analytics-section">
            <h2 style="color: var(--accent-purple-light); font-weight: 600; margin-bottom: 20px; font-size: 1.8rem;">📊 Table Analytics</h2>
            <div class="charts-grid">
                <div class="chart-container full-width">
                    <div class="chart-title">Row Count Distribution (Top 20)</div>
                    <svg id="rowCountChart" class="d3-chart"></svg>
                </div>
                <div class="chart-container">
                    <div class="chart-title">Table Types</div>
                    <svg id="tableTypeChart" class="d3-chart"></svg>
                </div>
                <div class="chart-container">
                    <div class="chart-title">Partitioned vs Non-Partitioned</div>
                    <svg id="partitionChart" class="d3-chart"></svg>
                </div>
                <div class="chart-container">
                    <div class="chart-title">Data Freshness Distribution</div>
                    <svg id="freshnessChart" class="d3-chart"></svg>
                </div>
                <div class="chart-container">
                    <div class="chart-title">Analytics Readiness Score</div>
                    <svg id="analyticsScoreChart" class="d3-chart"></svg>
                </div>
            </div>
        </section>
        
        <section class="lineage-section">
            <h2 style="color: var(--accent-purple-light); font-weight: 600; margin-bottom: 20px; font-size: 1.8rem;">🔗 Table Relationships & Join Key Analysis</h2>
            
            <!-- Relationship Summary Cards -->
            <div class="relationship-summary" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 25px;">
                <div class="relationship-card" style="background: var(--bg-card); border: 1px solid var(--border-primary); border-radius: 8px; padding: 15px; text-align: center;">
                    <div style="font-size: 1.5rem; font-weight: 700; color: var(--accent-purple);" id="totalJoinKeys">0</div>
                    <div style="font-size: 0.8rem; color: var(--text-secondary); text-transform: uppercase;">Potential Join Keys</div>
                </div>
                <div class="relationship-card" style="background: var(--bg-card); border: 1px solid var(--border-primary); border-radius: 8px; padding: 15px; text-align: center;">
                    <div style="font-size: 1.5rem; font-weight: 700; color: var(--chart-color-3);" id="connectedTables">0</div>
                    <div style="font-size: 0.8rem; color: var(--text-secondary); text-transform: uppercase;">Connected Tables</div>
                </div>
                <div class="relationship-card" style="background: var(--bg-card); border: 1px solid var(--border-primary); border-radius: 8px; padding: 15px; text-align: center;">
                    <div style="font-size: 1.5rem; font-weight: 700; color: var(--chart-color-4);" id="viewDependencies">0</div>
                    <div style="font-size: 0.8rem; color: var(--text-secondary); text-transform: uppercase;">View Dependencies</div>
                </div>
            </div>
            
            <!-- ERD Table Selection -->
            <div style="background: var(--bg-elevated); border: 1px solid var(--border-primary); border-radius: 8px; padding: 15px; margin-bottom: 20px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                    <h4 style="color: var(--accent-purple-light); font-size: 0.95rem; margin: 0;">📊 Select Tables for Diagram</h4>
                    <div style="display: flex; gap: 8px;">
                        <button id="selectAllTables" style="padding: 4px 8px; background: var(--chart-color-3); color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.8rem;">Select All</button>
                        <button id="clearAllTables" style="padding: 4px 8px; background: var(--text-secondary); color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.8rem;">Clear All</button>
                    </div>
                </div>
                <input type="text" id="tableSearchInput" placeholder="Search tables..." style="width: 100%; padding: 8px 12px; margin-bottom: 12px; font-size: 0.85rem; background: var(--bg-primary); border: 1px solid var(--border-primary); border-radius: 4px; color: var(--text-primary);">
                <div id="tableCheckboxes" style="max-height: 150px; overflow-y: auto; display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 8px; padding: 8px; background: var(--bg-primary); border-radius: 6px;"></div>
            </div>
            
            <!-- Interactive Network Diagram -->
            <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 20px; margin-bottom: 20px;">
                <div style="background: var(--bg-card); border: 1px solid var(--border-primary); border-radius: 12px; padding: 20px; position: relative;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                        <h3 style="color: var(--accent-purple-light); font-size: 1.1rem; margin: 0;">🌐 Interactive Relationship Diagram</h3>
                        <div style="display: flex; gap: 8px; align-items: center;">
                            <button id="resetDiagram" style="padding: 4px 8px; background: var(--accent-purple); color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.8rem;">Reset</button>
                            <label style="display: flex; align-items: center; font-size: 0.8rem; color: var(--text-secondary);"><input type="checkbox" id="showLabels" checked style="margin-right: 4px;"> Labels</label>
                        </div>
                    </div>
                    <div style="height: 500px; border-radius: 8px; border: 1px solid var(--border-primary); position: relative; overflow: hidden;">
                        <svg id="networkDiagram" style="width: 100%; height: 100%;"></svg>
                        <div id="diagramTooltip" style="position: absolute; background: rgba(33, 38, 45, 0.95); color: var(--text-primary); border: 1px solid var(--border-primary); border-radius: 6px; padding: 8px 12px; font-size: 0.85rem; pointer-events: none; opacity: 0; transition: opacity 0.2s; z-index: 1000;"></div>
                    </div>
                    <div style="margin-top: 10px; font-size: 0.8rem; color: var(--text-secondary); display: flex; gap: 20px;">
                        <span><span style="display:inline-block;width:12px;height:12px;background:var(--accent-purple);border-radius:50%;margin-right:4px;"></span>Tables</span>
                        <span><span style="display:inline-block;width:12px;height:12px;background:var(--chart-color-3);border-radius:50%;margin-right:4px;"></span>Views</span>
                        <span><span style="display:inline-block;width:15px;height:2px;background:var(--chart-color-3);margin-right:4px;"></span>Join Keys</span>
                        <span><span style="display:inline-block;width:15px;height:2px;background:var(--chart-color-4);margin-right:4px;"></span>Dependencies</span>
                    </div>
                </div>
                
                <!-- Analysis Panel -->
                <div style="background: var(--bg-card); border: 1px solid var(--border-primary); border-radius: 12px; padding: 20px;">
                    <h3 style="color: var(--accent-purple-light); font-size: 1.1rem; margin-bottom: 15px;">🔍 Analysis</h3>
                    <div id="selectedNodeInfo" style="margin-bottom: 20px; padding: 12px; background: var(--bg-primary); border-radius: 6px; min-height: 60px; display: flex; align-items: center; justify-content: center; color: var(--text-secondary); font-style: italic; font-size: 0.9rem;">Click a table or view to see details</div>
                    
                    <h4 style="color: var(--chart-color-3); font-size: 0.95rem; margin-bottom: 10px;">🔑 Join Keys</h4>
                    <div id="joinKeysAnalysis" style="max-height: 200px; overflow-y: auto;"></div>
                    
                    <h4 style="color: var(--chart-color-4); font-size: 0.95rem; margin: 15px 0 10px 0;">👁️ Dependencies</h4>
                    <div id="viewDependenciesAnalysis" style="max-height: 150px; overflow-y: auto;"></div>
                </div>
            </div>
        </section>
        
        <main>
            <div style="margin-bottom: 25px;">
                <h2 style="color: var(--accent-purple-light); font-weight: 600; margin-bottom: 15px; font-size: 1.8rem;">🔍 Table Explorer</h2>
                
                <!-- Enhanced Search and Filters -->
                <div style="display: grid; grid-template-columns: 2fr 1fr auto; gap: 15px; margin-bottom: 15px;">
                    <input type="text" id="searchInput" placeholder="Search by table name, field name, or data type..." style="padding: 16px; font-size: 1rem; background: var(--bg-card); border: 1px solid var(--border-primary); border-radius: 8px; color: var(--text-primary);">
                    <select id="analyticsFilter" style="padding: 16px; font-size: 1rem; background: var(--bg-card); border: 1px solid var(--border-primary); border-radius: 8px; color: var(--text-primary);">
                        <option value="">Show All Tables</option>
                        <option value="mixpanel_ready">🚀 Mixpanel Ready</option>
                        <option value="event_tables">📅 Event Tables</option>
                        <option value="user_tables">👤 User Tables</option>
                        <option value="has_pii">⚠️ Contains PII</option>
                        <option value="high_quality">✅ High Quality</option>
                        <option value="partitioned">🗂️ Partitioned</option>
                        <option value="fresh_data">🟢 Fresh Data (≤7 days)</option>
                        <option value="stale_data">🟠 Stale Data (>30 days)</option>
                        <option value="complex_schema">🏗️ Complex Schema</option>
                        <option value="simple_schema">✅ Simple Schema</option>
                    </select>
                    <button class="expand-collapse-btn" id="expandCollapseBtn">Expand All</button>
                </div>
                
                <!-- Quick Stats for Filtered Results -->
                <div id="filterStats" style="display: none; background: var(--bg-elevated); border: 1px solid var(--border-primary); border-radius: 8px; padding: 12px; margin-bottom: 15px; font-size: 0.9rem; color: var(--text-secondary);"></div>
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

            // Populate header with project/dataset info
            const projectElement = document.getElementById('headerProject');
            const datasetElement = document.getElementById('headerDataset');
            const errorsElement = document.getElementById('headerErrors');
            
            if (data.audit_metadata) {
                projectElement.textContent = data.audit_metadata.project_id || 'Unknown';
                datasetElement.textContent = data.audit_metadata.dataset_id || 'Unknown';
            } else if (data.extraction_metadata) {
                projectElement.textContent = data.extraction_metadata.project_id || 'Unknown';
                datasetElement.textContent = data.extraction_metadata.dataset_id || 'Unknown';
            }
            
            const errorCount = data.tables ? data.tables.filter(t => t.has_permission_error).length : 0;
            errorsElement.textContent = errorCount > 0 ? errorCount + ' Errors' : 'No Errors';

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
                
                // Header errors already handled above
                
                document.getElementById('summaryTotalObjects').textContent = data.summary.total_objects.toLocaleString();
                document.getElementById('summaryTables').textContent = data.summary.total_tables.toLocaleString();
                document.getElementById('summaryViews').textContent = data.summary.total_views.toLocaleString();
                
                // Calculate total rows and size
                let totalRows = 0;
                let totalBytes = 0;
                
                data.tables.forEach(table => {
                    if (table.row_count && typeof table.row_count === 'number') {
                        totalRows += table.row_count;
                    }
                    if (table.size_bytes && typeof table.size_bytes === 'number') {
                        totalBytes += table.size_bytes; // Already in bytes
                    }
                });
                
                document.getElementById('summaryTotalRows').textContent = totalRows.toLocaleString();
                document.getElementById('summaryTotalSize').textContent = bytesHuman(totalBytes);
            }

            function renderAnalyticsInsights() {
                
                if (!data.analytics) {
                    console.log('No analytics data found');
                    // Hide analytics section if no data
                    const analyticsSection = document.querySelector('.analytics-insights-section');
                    if (analyticsSection) {
                        analyticsSection.style.display = 'none';
                    }
                    return;
                }
                
                // Update analytics cards
                const mixpanelReady = data.analytics.data_quality?.filter(t => t.mixpanel_compatibility >= 4) || [];
                const eventTables = data.analytics.event_tables || [];
                const userTables = data.analytics.user_tables || [];
                const piiTables = data.analytics.data_quality?.filter(t => t.data_quality?.potential_pii?.length > 0) || [];
                
                document.getElementById('mixpanelReadyCount').textContent = mixpanelReady.length;
                document.getElementById('eventTablesCount').textContent = eventTables.length;
                document.getElementById('userTablesCount').textContent = userTables.length;
                document.getElementById('piiTablesCount').textContent = piiTables.length;

                // Function to create table list
                function createTableList(tables, containerId) {
                    const container = document.getElementById(containerId);
                    if (tables.length === 0) {
                        container.innerHTML = '<div style="color: var(--text-secondary); font-style: italic;">No tables in this category</div>';
                        return;
                    }
                    
                    const tableLinks = tables.map((table, index) => {
                        const scoreSpan = table.mixpanel_compatibility ? 
                            '<span style="float: right; font-size: 0.7rem; opacity: 0.8;">Score: ' + table.mixpanel_compatibility + '</span>' : '';
                        const linkId = 'tableLink_' + index;
                        return '<div id="' + linkId + '" style="margin: 2px 0; padding: 4px 8px; background: rgba(255,255,255,0.1); border-radius: 4px; cursor: pointer;" ' +
                              'data-table-name="' + table.table_name.replace(/"/g, '&quot;') + '" ' +
                              'onmouseover="this.style.background=&quot;rgba(255,255,255,0.2)&quot;" ' +
                              'onmouseout="this.style.background=&quot;rgba(255,255,255,0.1)&quot;">' +
                            '📊 ' + table.table_name +
                            scoreSpan +
                        '</div>';
                    }).join('');
                    
                    container.innerHTML = tableLinks;
                    
                    // Add event delegation for table links
                    container.addEventListener('click', function(e) {
                        const clickedElement = e.target.closest('[data-table-name]');
                        if (clickedElement) {
                            const tableName = clickedElement.getAttribute('data-table-name');
                            scrollToTable(tableName);
                        }
                    });
                }

                // Populate table lists
                createTableList(mixpanelReady, 'mixpanelReadyList');
                createTableList(eventTables, 'eventTablesList');
                createTableList(userTables, 'userTablesList');
                createTableList(piiTables, 'piiTablesList');

                // Add click handlers for analytics cards
                document.querySelectorAll('.analytics-card').forEach(card => {
                    card.addEventListener('click', function() {
                        const category = this.dataset.category;
                        const tableList = this.querySelector('.table-list');
                        
                        // Toggle visibility
                        if (tableList.style.display === 'none') {
                            // Hide all other lists first
                            document.querySelectorAll('.table-list').forEach(list => list.style.display = 'none');
                            tableList.style.display = 'block';
                            this.style.transform = 'scale(1.02)';
                        } else {
                            tableList.style.display = 'none';
                            this.style.transform = 'scale(1)';
                        }
                    });
                    
                    // Add hover effects
                    card.addEventListener('mouseenter', function() {
                        if (this.querySelector('.table-list').style.display !== 'block') {
                            this.style.transform = 'scale(1.01)';
                        }
                    });
                    
                    card.addEventListener('mouseleave', function() {
                        if (this.querySelector('.table-list').style.display !== 'block') {
                            this.style.transform = 'scale(1)';
                        }
                    });
                });

                // Function to scroll to a specific table
                window.scrollToTable = function(tableName) {
                    const tableElement = document.getElementById('table-' + tableName);
                    if (tableElement) {
                        tableElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        // Highlight the table briefly
                        tableElement.style.background = 'rgba(139, 92, 246, 0.1)';
                        setTimeout(() => {
                            tableElement.style.background = '';
                        }, 2000);
                    }
                };
                
                // Render field patterns
                renderFieldPatterns();
                renderDataQualityOverview();
                renderSchemaComplexityOverview();
            }
            
            function renderFieldPatterns() {
                const container = document.getElementById('fieldPatternsAnalysis');
                
                if (!data.analytics || !data.analytics.field_patterns) {
                    container.innerHTML = '<div style="color: var(--text-secondary); font-style: italic; font-size: 0.9rem;">Analytics data not available - run a new audit to see field patterns</div>';
                    return;
                }
                
                const patterns = data.analytics.field_patterns;
                let html = '';
                
                if (patterns.timestamp_fields && patterns.timestamp_fields.length > 0) {
                    const truncated = patterns.timestamp_fields.slice(0, 3).join(', ') + (patterns.timestamp_fields.length > 3 ? ', ...' : '');
                    const full = patterns.timestamp_fields.join(', ');
                    html += \`<div style="background: var(--bg-primary); border-radius: 6px; padding: 10px; border-left: 3px solid var(--chart-color-3);">
                        <div style="font-weight: 600; color: var(--chart-color-3); font-size: 0.9rem; margin-bottom: 3px; cursor: pointer; display: flex; justify-content: space-between; align-items: center;" onclick="toggleFieldPattern('timestamp')">
                            <span>⏰ Timestamp Fields (\${patterns.timestamp_fields.length})</span>
                            <span id="timestamp-arrow" style="color: var(--chart-color-3); font-size: 0.8rem;">▶</span>
                        </div>
                        <div style="font-size: 0.8rem; color: var(--text-secondary);">
                            <div id="timestamp-truncated">\${truncated}</div>
                            <div id="timestamp-full" style="display: none;">\${full}</div>
                        </div>
                    </div>\`;
                }
                
                if (patterns.user_id_fields && patterns.user_id_fields.length > 0) {
                    const truncated = patterns.user_id_fields.slice(0, 3).join(', ') + (patterns.user_id_fields.length > 3 ? ', ...' : '');
                    const full = patterns.user_id_fields.join(', ');
                    html += \`<div style="background: var(--bg-primary); border-radius: 6px; padding: 10px; border-left: 3px solid var(--accent-purple);">
                        <div style="font-weight: 600; color: var(--accent-purple); font-size: 0.9rem; margin-bottom: 3px; cursor: pointer; display: flex; justify-content: space-between; align-items: center;" onclick="toggleFieldPattern('userid')">
                            <span>👤 User ID Fields (\${patterns.user_id_fields.length})</span>
                            <span id="userid-arrow" style="color: var(--accent-purple); font-size: 0.8rem;">▶</span>
                        </div>
                        <div style="font-size: 0.8rem; color: var(--text-secondary);">
                            <div id="userid-truncated">\${truncated}</div>
                            <div id="userid-full" style="display: none;">\${full}</div>
                        </div>
                    </div>\`;
                }
                
                if (patterns.event_id_fields && patterns.event_id_fields.length > 0) {
                    const truncated = patterns.event_id_fields.slice(0, 3).join(', ') + (patterns.event_id_fields.length > 3 ? ', ...' : '');
                    const full = patterns.event_id_fields.join(', ');
                    html += \`<div style="background: var(--bg-primary); border-radius: 6px; padding: 10px; border-left: 3px solid var(--chart-color-4);">
                        <div style="font-weight: 600; color: var(--chart-color-4); font-size: 0.9rem; margin-bottom: 3px; cursor: pointer; display: flex; justify-content: space-between; align-items: center;" onclick="toggleFieldPattern('eventid')">
                            <span>🔑 Event ID Fields (\${patterns.event_id_fields.length})</span>
                            <span id="eventid-arrow" style="color: var(--chart-color-4); font-size: 0.8rem;">▶</span>
                        </div>
                        <div style="font-size: 0.8rem; color: var(--text-secondary);">
                            <div id="eventid-truncated">\${truncated}</div>
                            <div id="eventid-full" style="display: none;">\${full}</div>
                        </div>
                    </div>\`;
                }
                
                if (patterns.session_fields && patterns.session_fields.length > 0) {
                    const truncated = patterns.session_fields.slice(0, 3).join(', ') + (patterns.session_fields.length > 3 ? ', ...' : '');
                    const full = patterns.session_fields.join(', ');
                    html += \`<div style="background: var(--bg-primary); border-radius: 6px; padding: 10px; border-left: 3px solid var(--error-light);">
                        <div style="font-weight: 600; color: var(--error-light); font-size: 0.9rem; margin-bottom: 3px; cursor: pointer; display: flex; justify-content: space-between; align-items: center;" onclick="toggleFieldPattern('session')">
                            <span>🔗 Session Fields (\${patterns.session_fields.length})</span>
                            <span id="session-arrow" style="color: var(--error-light); font-size: 0.8rem;">▶</span>
                        </div>
                        <div style="font-size: 0.8rem; color: var(--text-secondary);">
                            <div id="session-truncated">\${truncated}</div>
                            <div id="session-full" style="display: none;">\${full}</div>
                        </div>
                    </div>\`;
                }
                
                container.innerHTML = html || '<div style="color: var(--text-secondary); font-style: italic; font-size: 0.9rem;">No common patterns detected</div>';
            }
            
            function renderDataQualityOverview() {
                const container = document.getElementById('dataQualityOverview');
                
                if (!data.analytics || !data.analytics.data_quality) {
                    container.innerHTML = '<div style="color: var(--text-secondary); font-style: italic; font-size: 0.9rem;">Analytics data not available - run a new audit to see data quality metrics</div>';
                    return;
                }
                
                const qualities = data.analytics.data_quality;
                
                // Calculate quality metrics
                const highQualityTables = qualities.filter(t => t.mixpanel_compatibility >= 4).length;
                const tablesWithNonNullable = qualities.filter(t => t.data_quality?.unique_fields?.length > 0).length;
                const avgMixpanelScore = qualities.length > 0 ? qualities.reduce((sum, t) => sum + (t.mixpanel_compatibility || 0), 0) / qualities.length : 0;
                
                let html = \`
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                        <div style="background: var(--bg-primary); border-radius: 6px; padding: 8px; text-align: center;">
                            <div style="font-size: 1.2rem; font-weight: 600; color: var(--chart-color-3);">\${highQualityTables}</div>
                            <div style="font-size: 0.75rem; color: var(--text-secondary);">High Quality</div>
                        </div>
                        <div style="background: var(--bg-primary); border-radius: 6px; padding: 8px; text-align: center;">
                            <div style="font-size: 1.2rem; font-weight: 600; color: var(--accent-purple);">\${tablesWithNonNullable}</div>
                            <div style="font-size: 0.75rem; color: var(--text-secondary);">Non-nullable Fields</div>
                        </div>
                    </div>
                    <div style="background: var(--bg-primary); border-radius: 6px; padding: 8px; text-align: center; margin-top: 8px;">
                        <div style="font-size: 1.1rem; font-weight: 600; color: var(--chart-color-4);">\${avgMixpanelScore.toFixed(1)}/10</div>
                        <div style="font-size: 0.75rem; color: var(--text-secondary);">Avg Analytics Score</div>
                    </div>
                \`;
                
                container.innerHTML = html;
            }
            
            function renderSchemaComplexityOverview() {
                const container = document.getElementById('schemaComplexityOverview');
                
                if (!data.analytics || !data.analytics.data_quality) {
                    container.innerHTML = '<div style="color: var(--text-secondary); font-style: italic; font-size: 0.9rem;">Analytics data not available</div>';
                    return;
                }
                
                const qualities = data.analytics.data_quality;
                
                // Calculate complexity metrics
                const tablesWithStruct = qualities.filter(t => t.schema_complexity?.complex_fields && 
                    t.schema_complexity.complex_fields.some(f => f.type && (f.type.includes('STRUCT') || f.type.includes('RECORD') || f.type.includes('JSON')))).length;
                const tablesWithRepeated = qualities.filter(t => t.schema_complexity?.complex_fields && 
                    t.schema_complexity.complex_fields.some(f => f.type && (f.type.includes('REPEATED') || f.type.includes('ARRAY')))).length;
                const tablesWithNested = qualities.filter(t => t.schema_complexity?.nested_depth > 1).length;
                const totalComplexFields = qualities.reduce((sum, t) => 
                    sum + (t.schema_complexity?.complex_fields?.length || 0), 0);
                
                
                let html = \`
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                        <div style="background: var(--bg-primary); border-radius: 6px; padding: 8px; text-align: center;">
                            <div style="font-size: 1.2rem; font-weight: 600; color: var(--error-light);">\${tablesWithStruct}</div>
                            <div style="font-size: 0.75rem; color: var(--text-secondary);">Tables with STRUCTs</div>
                        </div>
                        <div style="background: var(--bg-primary); border-radius: 6px; padding: 8px; text-align: center;">
                            <div style="font-size: 1.2rem; font-weight: 600; color: var(--error-light);">\${tablesWithRepeated}</div>
                            <div style="font-size: 0.75rem; color: var(--text-secondary);">Tables with REPEATED</div>
                        </div>
                        <div style="background: var(--bg-primary); border-radius: 6px; padding: 8px; text-align: center;">
                            <div style="font-size: 1.2rem; font-weight: 600; color: var(--chart-color-4);">\${tablesWithNested}</div>
                            <div style="font-size: 0.75rem; color: var(--text-secondary);">Nested Fields</div>
                        </div>
                        <div style="background: var(--bg-primary); border-radius: 6px; padding: 8px; text-align: center;">
                            <div style="font-size: 1.2rem; font-weight: 600; color: var(--accent-purple);">\${totalComplexFields}</div>
                            <div style="font-size: 0.75rem; color: var(--text-secondary);">Total Complex</div>
                        </div>
                    </div>
                \`;
                
                if (totalComplexFields > 0) {
                    html += \`<div style="margin-top: 10px; padding: 8px; background: rgba(239, 68, 68, 0.1); border-radius: 6px; border-left: 3px solid var(--error-light);">
                        <div style="font-size: 0.8rem; color: var(--error-light); font-weight: 600;">⚠️ Mixpanel Incompatible Fields Detected</div>
                        <div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 2px;">Consider flattening STRUCT/REPEATED fields for analytics</div>
                    </div>\`;
                }
                
                container.innerHTML = html;
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
                
                // Standardize headers for schema tables to ensure consistency
                let displayHeaders;
                if (highlightJoinKeys) {
                    // Use consistent schema table headers for all tables
                    displayHeaders = [
                        'column_name',
                        'ordinal_position', 
                        'is_nullable',
                        'data_type',
                        'nested_field_path',
                        'nested_type',
                        'join_key',
                        'field_type'
                    ];
                } else {
                    displayHeaders = [...headers];
                }
                
                displayHeaders.forEach(h => {
                    const th = document.createElement('th');
                    
                    // Custom header mappings for better display names
                    let displayName = h;
                    if (h === 'column_name') {
                        displayName = 'column name';
                    } else if (h === 'ordinal_position') {
                        displayName = 'ordinal position';
                    } else if (h === 'is_nullable') {
                        displayName = 'is nullable';
                    } else if (h === 'data_type') {
                        displayName = 'data type';
                    } else if (h === 'nested_field_path') {
                        displayName = 'field path';
                    } else if (h === 'nested_type') {
                        displayName = 'type';
                    } else if (h === 'join_key') {
                        displayName = 'join key';
                    } else if (h === 'field_type') {
                        displayName = 'detected field types';
                    } else {
                        displayName = h.replace(/_/g, ' ');
                    }
                    
                    th.textContent = displayName;
                    headerRow.appendChild(th);
                });
                rows.forEach(rowData => {
                    const row = tbody.insertRow();
                    
                    // Check for complex fields (STRUCT, REPEATED, nested, JSON)
                    const fieldType = rowData.nested_type || '';
                    const fieldPath = rowData.nested_field_path || rowData.column_name || '';
                    const fieldName = (rowData.column_name || '').toLowerCase();
                    
                    const isComplex = fieldType.includes('STRUCT') || fieldType.includes('REPEATED') || 
                                    fieldType.startsWith('ARRAY') || fieldPath.includes('.') ||
                                    fieldType.includes('JSON') || fieldType.includes('RECORD');
                    
                    // Define Mixpanel-relevant fields
                    const mixpanelFieldPatterns = [
                        /^(.*_)?(user|client|customer|device|profile|account|member|person|identity|distinct|anonymous|anon|actor|uid|uuid)(_?)(id|guid|key|identifier)?(_.*)?$/i,
                        /^(.*_)?(time|timestamp|ts|date|datetime|created|updated|occurred|happened|event_time)(_.*)?$/i,
                        /^(.*_)?(event|action|activity|type|name|category|kind)(_?)(name|type|category|kind)?(_.*)?$/i,
                        /^(.*_)?(session|visit|browser|tab)(_?)(id|uuid|key|identifier)?(_.*)?$/i,
                        /^insert_id$/i,
                        /^distinct_id$/i
                    ];
                    
                    const isMixpanelField = mixpanelFieldPatterns.some(pattern => pattern.test(fieldName));
                    
                    // Check for PII fields based on detected types
                    const isPIIField = rowData.detected_field_types && 
                        rowData.detected_field_types.some(type => type.group === 'pii');
                    
                    if (isPIIField) {
                        row.classList.add('pii-field-row'); // Red styling for PII fields
                    } else if (isComplex) {
                        row.classList.add('complex-field-row'); // Yellow styling for complex fields (JSON, STRUCT, etc)
                    } else if (isMixpanelField) {
                        row.classList.add('join-key-row'); // Reuse the purple styling for Mixpanel fields
                    }
                    
                    displayHeaders.forEach(header => {
                        const cell = row.insertCell();
                        let value;
                        
                        // Handle the special columns
                        if (header === 'join_key') {
                            value = rowData.is_potential_join_key ? '✓' : '';
                        } else if (header === 'field_type') {
                            // Format detected field types as comma-separated list
                            if (rowData.detected_field_types && rowData.detected_field_types.length > 0) {
                                value = rowData.detected_field_types
                                    .map(typeInfo => {
                                        const typeName = typeInfo.type.replace(/_/g, ' ');
                                        const groupName = typeInfo.group;
                                        return typeName + ' (' + groupName + ')';
                                    })
                                    .join(', ');
                            } else {
                                value = '';
                            }
                        } else {
                            // Get value from rowData, default to empty string if not found
                            value = rowData[header] || '';
                        }
                        
                        if (typeof value === 'object' && value !== null) {
                            cell.textContent = JSON.stringify(value);
                        } else {
                            cell.textContent = formatValue(value);
                        }
                        
                        // Add indicators for complex fields
                        if (header === 'nested_type' && isComplex) {
                            cell.classList.add('complex-field-cell');
                            
                            // Add visual indicators
                            let indicators = '';
                            if (fieldType.includes('STRUCT') || fieldType.includes('RECORD')) {
                                indicators += '<span class="nested-field-indicator">STRUCT</span>';
                            }
                            if (fieldType.includes('REPEATED') || fieldType.startsWith('ARRAY')) {
                                indicators += '<span class="nested-field-indicator">REPEATED</span>';
                            }
                            if (fieldPath.includes('.')) {
                                indicators += '<span class="nested-field-indicator">NESTED</span>';
                            }
                            
                            if (indicators) {
                                cell.innerHTML = formatValue(value) + indicators;
                            }
                        }
                        
                        // Highlight Mixpanel field names
                        if (isMixpanelField && (header === 'column_name' || header === 'nested_field_path')) {
                            cell.classList.add('join-key-cell'); // Reuse purple styling for Mixpanel fields
                        }
                        
                        // Make nested field paths more prominent by showing the full path
                        if (header === 'nested_field_path' && value && value.includes('.')) {
                            cell.style.fontFamily = 'var(--font-mono)';
                            cell.style.fontSize = '0.85em';
                            cell.style.fontWeight = '600';
                        }
                        
                        // Style the join key column
                        if (header === 'join_key' && rowData.is_potential_join_key) {
                            cell.style.color = 'var(--chart-color-3)';
                            cell.style.fontWeight = '600';
                            cell.style.textAlign = 'center';
                        }
                        
                        // Style the field type column
                        if (header === 'field_type') {
                            cell.style.fontSize = '0.75rem';
                            cell.style.fontFamily = 'var(--font-mono)';
                            cell.style.color = 'var(--text-secondary)';
                            cell.style.width = '180px';
                            cell.style.maxWidth = '180px';
                            cell.style.minWidth = '150px';
                            cell.style.wordWrap = 'break-word';
                            cell.style.whiteSpace = 'normal';
                            cell.style.lineHeight = '1.3';
                            cell.style.padding = '12px 16px';
                            cell.style.verticalAlign = 'top';
                            cell.style.textAlign = 'left';
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
                    
                    // Get analytics insights for this table
                    const analytics = data.analytics ? data.analytics.data_quality.find(a => a.table_name === table.table_name) : null;
                    const mixpanelBadge = analytics && analytics.mixpanel_compatibility >= 4 ? \`<div class="badge" style="background: rgba(139, 92, 246, 0.15); color: var(--accent-purple);">🚀 Mixpanel Ready</div>\` : '';
                    const piiWarning = analytics && analytics.data_quality.potential_pii.length > 0 ? \`<div class="badge" style="background: rgba(255, 117, 87, 0.15); color: var(--error-light);">⚠️ PII</div>\` : '';
                    const qualityScore = analytics ? \`<div class="badge" style="background: rgba(7, 176, 150, 0.15); color: var(--chart-color-3);">Score: \${analytics.mixpanel_compatibility}/10</div>\` : '';
                    
                    // Schema complexity badges
                    let complexityBadge = '';
                    if (analytics && analytics.schema_complexity) {
                        const complexity = analytics.schema_complexity;
                        const hasComplexFields = complexity.complex_fields && complexity.complex_fields.length > 0;
                        if (hasComplexFields) {
                            const structCount = complexity.complex_fields.filter(f => f.type && (f.type.includes('STRUCT') || f.type.includes('RECORD') || f.type.includes('JSON'))).length;
                            const repeatedCount = complexity.complex_fields.filter(f => f.type && (f.type.includes('REPEATED') || f.type.includes('ARRAY'))).length;
                            const totalComplexCount = complexity.complex_fields.length;
                            complexityBadge = \`<div class="badge" style="background: rgba(255, 117, 87, 0.15); color: var(--error-light);" title="STRUCT/RECORD/JSON: \${structCount}, REPEATED/ARRAY: \${repeatedCount}, NESTED: \${complexity.nested_depth}">🏗️ Complex (\${totalComplexCount})</div>\`;
                        }
                    }
                    
                    // Data freshness badge
                    let freshnessBadge = '';
                    if (analytics && analytics.data_freshness) {
                        const freshness = analytics.data_freshness;
                        const colors = {
                            fresh: { bg: 'rgba(7, 176, 150, 0.15)', color: 'var(--chart-color-3)', icon: '🟢' },
                            recent: { bg: 'rgba(245, 158, 11, 0.15)', color: 'var(--chart-color-4)', icon: '🟡' },
                            stale: { bg: 'rgba(255, 117, 87, 0.15)', color: 'var(--error-light)', icon: '🟠' },
                            old: { bg: 'rgba(139, 92, 246, 0.15)', color: 'var(--accent-purple)', icon: '🔴' }
                        };
                        const style = colors[freshness.freshness_score] || colors.old;
                        freshnessBadge = \`<div class="badge" style="background: \${style.bg}; color: \${style.color};" title="Last updated \${freshness.newest_record_days_ago} days ago">\${style.icon} \${freshness.newest_record_days_ago}d ago</div>\`;
                    }
                    let schemaHtml = '';
                    if (table.schema && table.schema.length > 0) {
                        // Sort schema fields by ordinal position to ensure proper order
                        const sortedSchema = [...table.schema].sort((a, b) => (a.ordinal_position || 0) - (b.ordinal_position || 0));
                        // Filter out clustering column to save space
                        const allHeaders = Object.keys(table.schema[0]);
                        const schemaHeaders = allHeaders.filter(h => h !== 'clustering_ordinal_position');
                        
                        
                        schemaHtml = createTable(schemaHeaders, sortedSchema, true);
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
                        sampleHtml = '<div class="sample-json">' + JSON.stringify(cleanSampleData, null, 2) + '</div>';
                    } else if (table.sample_data_error) {
                        sampleHtml = '<div class="error-message">' + table.sample_data_error + '</div>';
                    } else {
                        sampleHtml = '<p>No sample data available.</p>';
                    }
                    const viewDefHtml = table.table_type === 'VIEW' && table.view_definition ? 
                        '<h4>View Definition</h4><pre>' + table.view_definition.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</pre>' : '';
                    html += '<div id="table-' + table.table_name + '" class="table-item" data-name="' + table.table_name.toLowerCase() + '" data-analytics="' + JSON.stringify(analytics || {}).replace(/"/g, '&quot;') + '">' +
                        '<div class="table-header">' +
                            '<span class="table-name">' +
                                '<svg class="expand-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6 4L10 8L6 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
                                table.table_name +
                            '</span>' +
                            '<div class="badges">' +
                                '<div class="badge ' + typeClass + '">' + table.table_type + '</div>' +
                                mixpanelBadge +
                                piiWarning +
                                qualityScore +
                                complexityBadge +
                                freshnessBadge +
                                errorBadge +
                            '</div>' +
                        '</div>' +
                        '<div class="details">' +
                            '<div class="details-grid">' +
                                '<div class="detail-item"><strong>Rows</strong> <span>' + formatValue(table.row_count) + '</span></div>' +
                                '<div class="detail-item"><strong>Columns</strong> <span>' + formatValue(table.schema?.length) + '</span></div>' +
                                '<div class="detail-item"><strong>Size (MB)</strong> <span>' + formatValue(table.size_bytes ? Math.round(table.size_bytes / (1024 * 1024) * 100) / 100 : 0) + '</span></div>' +
                                '<div class="detail-item"><strong>Partitions</strong> <span>' + (table.partition_info ? table.partition_info.length : 0) + '</span></div>' +
                                '<div class="detail-item"><strong>Created (UTC)</strong> <span>' + table.creation_time + '</span></div>' +
                                (table.has_permission_error ? '<div class="detail-item"><strong>Errors On</strong> <span>' + table.error_details.join(', ') + '</span></div>' : '') +
                            '</div>' +
                            viewDefHtml +
                            '<h4>Schema</h4>' +
                            schemaHtml +
                            '<div class="sample-section">' +
                                '<h4 class="sample-toggle" style="cursor: pointer; display: flex; align-items: center; user-select: none;">' +
                                    '<svg class="sample-expand-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" style="margin-right: 8px; transition: transform 0.2s ease;"><path d="M6 4L10 8L6 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
                                    'Sample Data (10 rows)' +
                                '</h4>' +
                                '<div class="sample-content" style="display: none; margin-top: 10px;">' +
                                    sampleHtml +
                                '</div>' +
                            '</div>' +
                        '</div>' +
                    '</div>';
                }
                tablesContainer.innerHTML = html;
            }

            // Toggle field pattern visibility (expand/collapse) - make globally accessible
            window.toggleFieldPattern = function(patternType) {
                const truncatedElement = document.getElementById(\`\${patternType}-truncated\`);
                const fullElement = document.getElementById(\`\${patternType}-full\`);
                const arrowElement = document.getElementById(\`\${patternType}-arrow\`);
                
                if (!truncatedElement || !fullElement || !arrowElement) return;
                
                if (fullElement.style.display === 'none') {
                    // Expand
                    truncatedElement.style.display = 'none';
                    fullElement.style.display = 'block';
                    arrowElement.textContent = '▼';
                } else {
                    // Collapse
                    truncatedElement.style.display = 'block';
                    fullElement.style.display = 'none';
                    arrowElement.textContent = '▶';
                }
            };

            function addEventListeners() {
                const expandCollapseBtn = document.getElementById('expandCollapseBtn');
                const analyticsFilter = document.getElementById('analyticsFilter');
                const searchInput = document.getElementById('searchInput');
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
                
                // Analytics filter functionality
                analyticsFilter.addEventListener('change', e => {
                    applyFilters();
                });
                
                // Enhanced search functionality with deep schema filtering
                searchInput.addEventListener('input', e => {
                    applyFilters();
                });
                
                function applyFilters() {
                    const searchTerm = searchInput.value.toLowerCase().trim();
                    const filterType = analyticsFilter.value;
                    let visibleCount = 0;
                    let totalRows = 0;
                    let totalSize = 0;
                    
                    document.querySelectorAll('.table-item').forEach(item => {
                        const tableName = item.dataset.name;
                        const analyticsData = JSON.parse(item.dataset.analytics || '{}');
                        let shouldShow = false;
                        let hasMatchingRows = false;
                        
                        // Apply analytics filter first
                        let passesAnalyticsFilter = true;
                        if (filterType) {
                            switch (filterType) {
                                case 'mixpanel_ready':
                                    passesAnalyticsFilter = analyticsData.mixpanel_compatibility >= 4;
                                    break;
                                case 'event_tables':
                                    passesAnalyticsFilter = analyticsData.required_fields?.has_timestamp;
                                    break;
                                case 'user_tables':
                                    passesAnalyticsFilter = analyticsData.required_fields?.has_user_id;
                                    break;
                                case 'has_pii':
                                    passesAnalyticsFilter = analyticsData.data_quality?.potential_pii?.length > 0;
                                    break;
                                case 'high_quality':
                                    passesAnalyticsFilter = analyticsData.mixpanel_compatibility >= 6;
                                    break;
                                case 'partitioned':
                                    const table = data.tables.find(t => t.table_name.toLowerCase() === tableName);
                                    passesAnalyticsFilter = table && table.partition_info && table.partition_info.length > 0;
                                    break;
                                case 'fresh_data':
                                    passesAnalyticsFilter = analyticsData.data_freshness && analyticsData.data_freshness.newest_record_days_ago <= 7;
                                    break;
                                case 'stale_data':
                                    passesAnalyticsFilter = analyticsData.data_freshness && analyticsData.data_freshness.newest_record_days_ago > 30;
                                    break;
                                case 'complex_schema':
                                    passesAnalyticsFilter = analyticsData.schema_complexity && 
                                        (analyticsData.schema_complexity.nested_depth > 1 || 
                                         (analyticsData.schema_complexity.complex_fields && analyticsData.schema_complexity.complex_fields.length > 0));
                                    break;
                                case 'simple_schema':
                                    passesAnalyticsFilter = !analyticsData.schema_complexity || 
                                        (analyticsData.schema_complexity.nested_depth <= 1 && 
                                         (!analyticsData.schema_complexity.complex_fields || analyticsData.schema_complexity.complex_fields.length === 0));
                                    break;
                            }
                        }
                        
                        if (!passesAnalyticsFilter) {
                            item.style.display = 'none';
                            return;
                        }
                        
                        // Apply search filter
                        if (!searchTerm) {
                            // No search term - show if passes analytics filter
                            shouldShow = true;
                            item.querySelectorAll('tr').forEach(row => {
                                row.style.display = '';
                            });
                            item.classList.remove('expanded');
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
                        
                        if (shouldShow) {
                            visibleCount++;
                            // Calculate stats for visible tables
                            const table = data.tables.find(t => t.table_name.toLowerCase() === tableName);
                            if (table) {
                                totalRows += table.row_count || 0;
                                totalSize += table.size_bytes ? table.size_bytes / (1024 * 1024) : 0;
                            }
                        }
                    });
                    
                    // Update filter stats
                    const filterStats = document.getElementById('filterStats');
                    if (searchTerm || filterType) {
                        filterStats.style.display = 'block';
                        filterStats.innerHTML = \`
                            Showing \${visibleCount} tables • 
                            Total rows: \${totalRows.toLocaleString()} • 
                            Total size: \${bytesHuman(totalSize * 1024 * 1024)}
                            \${filterType ? \` • Filter: \${analyticsFilter.options[analyticsFilter.selectedIndex].text}\` : ''}
                        \`;
                    } else {
                        filterStats.style.display = 'none';
                    }
                    
                    // Update expand/collapse button state based on visible items
                    const visibleExpandedItems = document.querySelectorAll('.table-item:not([style*="display: none"]).expanded');
                    const visibleItems = document.querySelectorAll('.table-item:not([style*="display: none"])');
                    allExpanded = visibleExpandedItems.length === visibleItems.length && visibleItems.length > 0;
                    expandCollapseBtn.textContent = allExpanded ? 'Collapse All' : 'Expand All';
                }
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
                    .slice(0, 20);
                
                renderD3BarChart('rowCountChart', rowCountData, {
                    valueAccessor: function(d) { return d.row_count; },
                    labelAccessor: function(d) { return d.table_name; },
                    color: 'rgba(16, 185, 129, 0.8)',
                    formatValue: function(d) {
                        if (d >= 1000000) return (d / 1000000).toFixed(1) + 'M';
                        if (d >= 1000) return (d / 1000).toFixed(1) + 'K';
                        return d.toLocaleString();
                    },
                    tooltipLabel: 'Rows'
                });


                

                // Table Types (D3 Pie Chart)
                const typeCounts = data.tables.reduce((acc, table) => {
                    acc[table.table_type] = (acc[table.table_type] || 0) + 1;
                    return acc;
                }, {});
                
                const typeData = Object.entries(typeCounts).map(function(entry) { return { label: entry[0], value: entry[1] }; });
                renderD3PieChart('tableTypeChart', typeData, {
                    colors: {
                        'BASE TABLE': 'var(--chart-color-1)',
                        'MATERIALIZED VIEW': 'var(--chart-color-3)', 
                        'VIEW': 'var(--chart-color-4)'
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
                        'Partitioned': 'var(--chart-color-1)',
                        'Non-Partitioned': 'var(--chart-color-5)'
                    }
                });

                // Data Freshness Distribution
                if (data.analytics && data.analytics.data_quality) {
                    const freshnessCounts = data.analytics.data_quality.reduce((acc, table) => {
                        if (table.data_freshness) {
                            const score = table.data_freshness.freshness_score;
                            acc[score] = (acc[score] || 0) + 1;
                        } else {
                            acc['no_timestamp'] = (acc['no_timestamp'] || 0) + 1;
                        }
                        return acc;
                    }, {});
                    
                    const freshnessData = Object.entries(freshnessCounts).map(function(entry) { 
                        return { 
                            label: entry[0].replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()), 
                            value: entry[1] 
                        }; 
                    });
                    
                    renderD3PieChart('freshnessChart', freshnessData, {
                        colors: {
                            'Fresh': 'var(--success)',
                            'Recent': 'var(--chart-color-4)',
                            'Stale': 'var(--warning)',
                            'Old': 'var(--chart-color-5)',
                            'No Timestamp': 'var(--text-muted)'
                        }
                    });

                    // Analytics Readiness Score Distribution
                    const scoreRanges = { '0-2': 0, '3-4': 0, '5-6': 0, '7-8': 0, '9-10': 0 };
                    data.analytics.data_quality.forEach(function(table) {
                        const score = table.mixpanel_compatibility;
                        if (score <= 2) scoreRanges['0-2']++;
                        else if (score <= 4) scoreRanges['3-4']++;
                        else if (score <= 6) scoreRanges['5-6']++;
                        else if (score <= 8) scoreRanges['7-8']++;
                        else scoreRanges['9-10']++;
                    });
                    
                    const scoreData = Object.entries(scoreRanges).map(function(entry) { 
                        return { label: entry[0], value: entry[1] }; 
                    });
                    
                    renderD3PieChart('analyticsScoreChart', scoreData, {
                        colors: {
                            '0-2': 'var(--chart-color-5)',
                            '3-4': 'var(--chart-color-4)',
                            '5-6': 'var(--chart-color-2)',
                            '7-8': 'var(--chart-color-1)',
                            '9-10': 'var(--chart-color-3)'
                        }
                    });
                }
            }

            // D3 Bar Chart Renderer
            function renderD3BarChart(elementId, data, options) {
                const svg = d3.select('#' + elementId);
                const container = svg.node().parentNode;
                const margin = { top: 20, right: 20, bottom: 40, left: 120 };
                const width = container.clientWidth - margin.left - margin.right;
                
                // Dynamic height based on number of items (minimum 25px per bar, maximum 600px)
                const barHeight = Math.max(25, Math.min(40, 600 / data.length));
                const dynamicHeight = Math.max(300, data.length * barHeight);
                const height = dynamicHeight - margin.top - margin.bottom;
                
                svg.attr('width', container.clientWidth)
                   .attr('height', dynamicHeight);
                
                const g = svg.append('g')
                    .attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');
                
                // Scales
                const maxValue = d3.max(data, function(d) { return options.valueAccessor(d); });
                const xScale = d3.scaleLinear()
                    .domain([0, maxValue * 1.1]) // Add 10% padding for labels
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
                    .attr('fill', function(d) { return options.colors[d.data.label] || 'rgba(139, 92, 246, 0.8)'; })
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
                    .attr('fill', function(d) { return options.colors[d.label] || 'rgba(139, 92, 246, 0.8)'; });
                
                legendItems.append('text')
                    .attr('x', 12)
                    .attr('y', 0)
                    .attr('dy', '0.35em')
                    .attr('class', 'd3-legend')
                    .text(function(d) { return d.label; });
            }

            function renderLineage() {
                if (!data.lineage || !data.lineage.nodes || data.lineage.nodes.length === 0) {
                    const lineageSection = document.querySelector('.lineage-section');
                    lineageSection.innerHTML = '<div style="text-align: center; color: var(--text-secondary); padding: 50px; background: var(--bg-medium); border-radius: 12px; border: 1px solid var(--border-color);"><h2 style="color: var(--accent-purple-light); margin-bottom: 15px;">🔗 Table Relationships & Join Key Analysis</h2>No relationships found. Views with table dependencies and tables with shared join keys will appear here.</div>';
                    return;
                }
                
                renderRelationshipSummary();
                renderJoinKeysAnalysis();
                renderViewDependenciesAnalysis();
                initializeTableCheckboxes();
                renderInteractiveNetworkDiagram();
                return; // Skip the old chaotic visualization
            }
            
            function renderRelationshipSummary() {
                const joinKeys = new Set();
                const connectedTables = new Set();
                let viewDeps = 0;
                
                data.lineage.edges.forEach(function(edge) {
                    if (edge.type === 'join_key') {
                        joinKeys.add(edge.label || 'unnamed');
                        connectedTables.add(edge.source.id);
                        connectedTables.add(edge.target.id);
                    } else if (edge.type === 'view_dependency') {
                        viewDeps++;
                    }
                });
                
                document.getElementById('totalJoinKeys').textContent = joinKeys.size;
                document.getElementById('connectedTables').textContent = connectedTables.size;
                document.getElementById('viewDependencies').textContent = viewDeps;
            }
            
            function renderJoinKeysAnalysis() {
                const joinKeyMap = {};
                
                data.lineage.edges.forEach(function(edge) {
                    if (edge.type === 'join_key') {
                        const key = edge.label || 'unnamed';
                        if (!joinKeyMap[key]) {
                            joinKeyMap[key] = new Set();
                        }
                        joinKeyMap[key].add(edge.source.id);
                        joinKeyMap[key].add(edge.target.id);
                    }
                });
                
                const joinKeysDiv = document.getElementById('joinKeysAnalysis');
                
                if (Object.keys(joinKeyMap).length === 0) {
                    joinKeysDiv.innerHTML = '<p style="color: var(--text-secondary); font-style: italic; font-size: 0.85rem;">No join keys found</p>';
                    return;
                }
                
                let html = '<div style="display: grid; gap: 6px;">';
                
                Object.entries(joinKeyMap)
                    .sort(function(a, b) { return b[1].size - a[1].size; })
                    .slice(0, 8) // Show top 8
                    .forEach(function(entry) {
                        const key = entry[0];
                        const tables = Array.from(entry[1]);
                        const connectivity = tables.length;
                        
                        let connectivityColor = connectivity >= 4 ? 'var(--error-light)' : connectivity >= 2 ? 'var(--chart-color-4)' : 'var(--text-secondary)';
                        
                        html += '<div style="background: var(--bg-primary); border-radius: 4px; padding: 8px; border-left: 3px solid var(--chart-color-3);">';
                        html += '<div style="font-weight: 600; color: var(--chart-color-3); font-size: 0.85rem; margin-bottom: 3px;">' + key + '</div>';
                        html += '<div style="font-size: 0.75rem; color: var(--text-secondary);">' + connectivity + ' tables</div>';
                        html += '</div>';
                    });
                
                html += '</div>';
                joinKeysDiv.innerHTML = html;
            }
            
            // Global variable to track selected tables for ERD
            let selectedTables = new Set();
            
            function initializeTableCheckboxes() {
                const checkboxContainer = document.getElementById('tableCheckboxes');
                if (!checkboxContainer) return;
                
                // Clear existing checkboxes
                checkboxContainer.innerHTML = '';
                
                // Start with no tables selected (blank diagram)
                selectedTables.clear();
                
                // Create checkboxes for all tables
                data.lineage.nodes.forEach(function(node) {
                    const checkboxDiv = document.createElement('div');
                    checkboxDiv.style.cssText = 'display: flex; align-items: center; padding: 4px 8px; background: var(--bg-medium); border-radius: 4px; border: 1px solid var(--border-color);';
                    
                    const checkbox = document.createElement('input');
                    checkbox.type = 'checkbox';
                    checkbox.id = 'table-' + node.id;
                    checkbox.value = node.id;
                    checkbox.style.marginRight = '6px';
                    checkbox.addEventListener('change', function() {
                        if (this.checked) {
                            selectedTables.add(node.id);
                        } else {
                            selectedTables.delete(node.id);
                        }
                        renderInteractiveNetworkDiagram();
                        // Update analysis panel when selection changes
                        updateGlobalAnalysis();
                    });
                    
                    const label = document.createElement('label');
                    label.htmlFor = 'table-' + node.id;
                    label.textContent = node.id;
                    label.title = node.id; // Add tooltip with full table name
                    label.style.cssText = 'cursor: pointer; font-size: 0.85rem; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;';
                    if (node.type === 'VIEW') {
                        label.style.color = 'var(--chart-color-3)';
                    } else {
                        label.style.color = 'var(--accent-purple)';
                    }
                    
                    checkboxDiv.appendChild(checkbox);
                    checkboxDiv.appendChild(label);
                    checkboxContainer.appendChild(checkboxDiv);
                });
                
                // Add event listeners for Select All and Clear All buttons
                const selectAllBtn = document.getElementById('selectAllTables');
                const clearAllBtn = document.getElementById('clearAllTables');
                
                if (selectAllBtn) {
                    selectAllBtn.addEventListener('click', function() {
                        data.lineage.nodes.forEach(function(node) {
                            selectedTables.add(node.id);
                            const checkbox = document.getElementById('table-' + node.id);
                            if (checkbox) checkbox.checked = true;
                        });
                        renderInteractiveNetworkDiagram();
                        updateGlobalAnalysis();
                    });
                }
                
                if (clearAllBtn) {
                    clearAllBtn.addEventListener('click', function() {
                        selectedTables.clear();
                        data.lineage.nodes.forEach(function(node) {
                            const checkbox = document.getElementById('table-' + node.id);
                            if (checkbox) checkbox.checked = false;
                        });
                        renderInteractiveNetworkDiagram();
                        updateGlobalAnalysis();
                    });
                }
                
                // Add search functionality
                const searchInput = document.getElementById('tableSearchInput');
                if (searchInput) {
                    searchInput.addEventListener('input', function() {
                        const searchTerm = this.value.toLowerCase().trim();
                        
                        data.lineage.nodes.forEach(function(node) {
                            const checkboxDiv = document.getElementById('table-' + node.id).parentNode;
                            const tableName = node.id.toLowerCase();
                            
                            if (tableName.includes(searchTerm)) {
                                checkboxDiv.style.display = 'flex';
                            } else {
                                checkboxDiv.style.display = 'none';
                            }
                        });
                    });
                }
            }
            
            function renderInteractiveNetworkDiagram() {
                const svg = d3.select('#networkDiagram');
                const container = svg.node().parentNode;
                const width = container.clientWidth;
                const height = container.clientHeight;
                const tooltip = d3.select('#diagramTooltip');
                
                svg.attr('width', width).attr('height', height);
                svg.selectAll('*').remove();
                
                // Filter nodes and edges based on selected tables
                const filteredNodes = data.lineage.nodes.filter(function(node) {
                    return selectedTables.has(node.id);
                });
                
                const filteredEdges = data.lineage.edges.filter(function(edge) {
                    return selectedTables.has(edge.source.id || edge.source) && 
                           selectedTables.has(edge.target.id || edge.target);
                });
                
                // Add zoom behavior
                const zoom = d3.zoom()
                    .scaleExtent([0.3, 3])
                    .on('zoom', function(event) {
                        g.attr('transform', event.transform);
                    });
                
                svg.call(zoom);
                const g = svg.append('g');
                
                // Show message if no tables selected
                if (filteredNodes.length === 0) {
                    const message = g.append('text')
                        .attr('x', width / 2)
                        .attr('y', height / 2)
                        .attr('text-anchor', 'middle')
                        .attr('fill', 'var(--text-secondary)')
                        .attr('font-size', '16px')
                        .text('Select tables above to view relationships');
                    return;
                }
                
                // Create a cleaner force simulation with filtered data (more compact/zoomed in)
                const simulation = d3.forceSimulation(filteredNodes)
                    .force('link', d3.forceLink(filteredEdges).id(function(d) { return d.id; }).distance(80).strength(0.7))
                    .force('charge', d3.forceManyBody().strength(-500))
                    .force('center', d3.forceCenter(width / 2, height / 2))
                    .force('collision', d3.forceCollide().radius(40));
                
                // Add links
                const links = g.append('g')
                    .selectAll('line')
                    .data(filteredEdges)
                    .join('line')
                    .attr('stroke', function(d) { return d.type === 'view_dependency' ? 'var(--chart-color-4)' : 'var(--chart-color-3)'; })
                    .attr('stroke-width', function(d) { return d.type === 'view_dependency' ? 2 : 1; })
                    .attr('stroke-dasharray', function(d) { return d.type === 'join_key' ? '4,4' : 'none'; })
                    .attr('opacity', 0.7);
                
                // Add link labels for join keys
                const linkLabels = g.append('g')
                    .selectAll('text')
                    .data(filteredEdges.filter(function(d) { return d.type === 'join_key' && d.label; }))
                    .join('text')
                    .attr('font-size', '10px')
                    .attr('fill', 'var(--text-secondary)')
                    .attr('text-anchor', 'middle')
                    .attr('dy', -2)
                    .text(function(d) { return d.label; })
                    .style('pointer-events', 'none');
                
                // Add nodes
                const nodes = g.append('g')
                    .selectAll('g')
                    .data(filteredNodes)
                    .join('g')
                    .attr('class', 'network-node')
                    .style('cursor', 'pointer')
                    .call(d3.drag()
                        .on('start', function(event, d) {
                            if (!event.active) simulation.alphaTarget(0.3).restart();
                            d.fx = d.x;
                            d.fy = d.y;
                        })
                        .on('drag', function(event, d) {
                            d.fx = event.x;
                            d.fy = event.y;
                        })
                        .on('end', function(event, d) {
                            if (!event.active) simulation.alphaTarget(0);
                            d.fx = null;
                            d.fy = null;
                        }));
                
                // Add circles (make them bigger for better readability)
                nodes.append('circle')
                    .attr('r', function(d) { return Math.max(18, Math.min(30, Math.sqrt(d.row_count / 5000))); })
                    .attr('fill', function(d) { return d.type === 'VIEW' ? 'var(--chart-color-3)' : 'var(--chart-color-1)'; })
                    .attr('stroke', 'var(--bg-primary)')
                    .attr('stroke-width', 3)
                    .style('filter', 'drop-shadow(0 3px 6px rgba(0,0,0,0.4))');
                
                // Add labels with better readability
                const labels = nodes.append('text')
                    .attr('text-anchor', 'middle')
                    .attr('dy', '0.3em')
                    .attr('font-size', '11px')
                    .attr('font-weight', '700')
                    .attr('fill', 'var(--text-primary)')
                    .style('pointer-events', 'none')
                    .style('text-shadow', '1px 1px 2px rgba(0,0,0,0.8), -1px -1px 2px rgba(0,0,0,0.8), 1px -1px 2px rgba(0,0,0,0.8), -1px 1px 2px rgba(0,0,0,0.8)')
                    .text(function(d) { return d.id; });
                
                // Add interaction handlers
                nodes.on('mouseover', function(event, d) {
                        tooltip.style('opacity', 1)
                            .html('<strong>' + d.id + '</strong><br/>Type: ' + d.type + '<br/>Rows: ' + d.row_count.toLocaleString() + '<br/>Size: ' + (d.size_bytes ? Math.round(d.size_bytes / (1024 * 1024) * 100) / 100 : 0) + ' MB')
                            .style('left', (event.pageX + 10) + 'px')
                            .style('top', (event.pageY - 10) + 'px');
                    })
                    .on('mouseout', function() {
                        tooltip.style('opacity', 0);
                    })
                    .on('click', function(event, d) {
                        showNodeDetails(d);
                        highlightConnections(d);
                    });
                
                // Simulation tick
                simulation.on('tick', function() {
                    links
                        .attr('x1', function(d) { return d.source.x; })
                        .attr('y1', function(d) { return d.source.y; })
                        .attr('x2', function(d) { return d.target.x; })
                        .attr('y2', function(d) { return d.target.y; });
                    
                    linkLabels
                        .attr('x', function(d) { return (d.source.x + d.target.x) / 2; })
                        .attr('y', function(d) { return (d.source.y + d.target.y) / 2; });
                    
                    nodes.attr('transform', function(d) { return 'translate(' + d.x + ',' + d.y + ')'; });
                });
                
                // Control handlers
                document.getElementById('resetDiagram').onclick = function() {
                    svg.transition().duration(750).call(zoom.transform, d3.zoomIdentity);
                    resetHighlighting();
                };
                
                document.getElementById('showLabels').onchange = function() {
                    const show = this.checked;
                    labels.style('opacity', show ? 1 : 0);
                    linkLabels.style('opacity', show ? 1 : 0);
                };
                
                function highlightConnections(selectedNode) {
                    // Reset all
                    nodes.select('circle').style('opacity', 0.3);
                    links.style('opacity', 0.1);
                    
                    // Highlight selected node
                    nodes.filter(function(d) { return d.id === selectedNode.id; })
                        .select('circle').style('opacity', 1);
                    
                    // Find and highlight connected nodes and edges
                    const connectedNodeIds = new Set([selectedNode.id]);
                    data.lineage.edges.forEach(function(edge) {
                        if (edge.source.id === selectedNode.id || edge.target.id === selectedNode.id) {
                            connectedNodeIds.add(edge.source.id);
                            connectedNodeIds.add(edge.target.id);
                        }
                    });
                    
                    nodes.filter(function(d) { return connectedNodeIds.has(d.id); })
                        .select('circle').style('opacity', 1);
                    
                    links.filter(function(d) { return d.source.id === selectedNode.id || d.target.id === selectedNode.id; })
                        .style('opacity', 1);
                }
                
                function resetHighlighting() {
                    nodes.select('circle').style('opacity', 1);
                    links.style('opacity', 0.7);
                    document.getElementById('selectedNodeInfo').innerHTML = '<div style="text-align: center; color: var(--text-secondary); font-style: italic;">Click a table or view to see details</div>';
                }
                
                function showNodeDetails(node) {
                    const connectedEdges = data.lineage.edges.filter(function(e) {
                        return e.source.id === node.id || e.target.id === node.id;
                    });
                    
                    const joinKeys = connectedEdges
                        .filter(function(e) { return e.type === 'join_key' && e.label; })
                        .map(function(e) { return e.label; });
                    
                    const dependencies = connectedEdges.filter(function(e) { return e.type === 'view_dependency'; });
                    
                    let html = '<div style="text-align: left;">';
                    html += '<h4 style="color: var(--accent-purple-light); margin: 0 0 8px 0; font-size: 1rem;">' + node.id + '</h4>';
                    html += '<div style="font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 8px;">' + node.type + ' • ' + node.row_count.toLocaleString() + ' rows</div>';
                    
                    if (joinKeys.length > 0) {
                        html += '<div style="margin-bottom: 8px;"><strong style="color: var(--chart-color-3); font-size: 0.85rem;">Join Keys:</strong><br/><span style="font-size: 0.8rem; color: var(--text-primary);">' + joinKeys.join(', ') + '</span></div>';
                    }
                    
                    if (dependencies.length > 0) {
                        html += '<div><strong style="color: var(--chart-color-4); font-size: 0.85rem;">Dependencies:</strong><br/>';
                        dependencies.forEach(function(dep) {
                            const other = dep.source.id === node.id ? dep.target.id : dep.source.id;
                            html += '<span style="font-size: 0.8rem; color: var(--text-primary);">' + other + '</span><br/>';
                        });
                        html += '</div>';
                    }
                    
                    html += '</div>';
                    document.getElementById('selectedNodeInfo').innerHTML = html;
                    
                    // Update the global analysis based on all selected tables
                    updateGlobalAnalysis();
                }
            }
            
            // Global function to analyze and display insights about all selected tables
            function updateGlobalAnalysis() {
                // Get all selected table names
                const selectedTableNames = Array.from(selectedTables);
                
                if (selectedTableNames.length === 0) {
                    document.getElementById('joinKeysAnalysis').innerHTML = '<p style="color: var(--text-secondary); font-style: italic; font-size: 0.85rem;">Select tables to see join key analysis</p>';
                    return;
                }
                
                // Find edges between selected tables
                const relevantEdges = data.lineage.edges.filter(function(edge) {
                    return selectedTableNames.includes(edge.source.id || edge.source) && 
                           selectedTableNames.includes(edge.target.id || edge.target);
                });
                
                // Group join keys and get sample data
                const joinKeyAnalysis = {};
                relevantEdges.forEach(function(edge) {
                    if (edge.type === 'join_key' && edge.label) {
                        if (!joinKeyAnalysis[edge.label]) {
                            joinKeyAnalysis[edge.label] = {
                                tables: new Set(),
                                sampleValues: new Set()
                            };
                        }
                        joinKeyAnalysis[edge.label].tables.add(edge.source.id || edge.source);
                        joinKeyAnalysis[edge.label].tables.add(edge.target.id || edge.target);
                        
                        // Get sample values from table data
                        [edge.source.id || edge.source, edge.target.id || edge.target].forEach(function(tableName) {
                            const tableData = data.tables.find(t => t.table_name === tableName);
                            if (tableData && tableData.sample_data) {
                                tableData.sample_data.slice(0, 3).forEach(function(row) { // Take first 3 samples
                                    if (row[edge.label] && row[edge.label] !== null) {
                                        joinKeyAnalysis[edge.label].sampleValues.add(String(row[edge.label]).substring(0, 20)); // Truncate long values
                                    }
                                });
                            }
                        });
                    }
                });
                
                // Render join key analysis
                let joinHtml = '';
                if (Object.keys(joinKeyAnalysis).length === 0) {
                    joinHtml = '<p style="color: var(--text-secondary); font-style: italic; font-size: 0.85rem;">No shared join keys found between selected tables</p>';
                } else {
                    joinHtml = '<div style="display: grid; gap: 8px;">';
                    
                    Object.entries(joinKeyAnalysis)
                        .sort(function(a, b) { return b[1].tables.size - a[1].tables.size; })
                        .forEach(function(entry) {
                            const joinKey = entry[0];
                            const analysis = entry[1];
                            const tableCount = analysis.tables.size;
                            const sampleValues = Array.from(analysis.sampleValues).slice(0, 3);
                            const tableNames = Array.from(analysis.tables).join(', ');
                            
                            joinHtml += '<div style="background: var(--bg-primary); border-radius: 6px; padding: 10px; border-left: 3px solid var(--chart-color-3);">';
                            joinHtml += '<div style="font-weight: 600; color: var(--chart-color-3); font-size: 0.9rem; margin-bottom: 4px;">' + joinKey + '</div>';
                            joinHtml += '<div style="font-size: 0.75rem; color: var(--text-secondary); margin-bottom: 6px;">Connects ' + tableCount + ' tables: ' + tableNames + '</div>';
                            
                            if (sampleValues.length > 0) {
                                joinHtml += '<div style="font-size: 0.75rem; color: var(--text-muted);">Sample values: <span style="color: var(--accent-purple-light);">' + sampleValues.join(', ') + (analysis.sampleValues.size > 3 ? '...' : '') + '</span></div>';
                            }
                            
                            joinHtml += '</div>';
                        });
                    
                    joinHtml += '</div>';
                }
                
                document.getElementById('joinKeysAnalysis').innerHTML = joinHtml;
            }
            
            function renderViewDependenciesAnalysis() {
                const viewDeps = data.lineage.edges.filter(function(e) { return e.type === 'view_dependency'; });
                const viewDepsDiv = document.getElementById('viewDependenciesAnalysis');
                
                if (viewDeps.length === 0) {
                    viewDepsDiv.innerHTML = '<p style="color: var(--text-secondary); font-style: italic; font-size: 0.85rem;">No view dependencies</p>';
                    return;
                }
                
                let html = '<div style="display: grid; gap: 4px;">';
                
                viewDeps.forEach(function(dep) {
                    const sourceId = dep.source && dep.source.id ? dep.source.id : (dep.source || 'unknown');
                    const targetId = dep.target && dep.target.id ? dep.target.id : (dep.target || 'unknown');
                    
                    html += '<div style="background: var(--bg-primary); border-radius: 4px; padding: 6px; border-left: 3px solid var(--chart-color-4);">';
                    html += '<div style="font-size: 0.8rem; color: var(--text-primary);">';
                    html += '<span style="color: var(--chart-color-4);">' + targetId + '</span> → <span style="color: var(--chart-color-3);">' + sourceId + '</span>';
                    html += '</div>';
                    html += '</div>';
                });
                
                html += '</div>';
                viewDepsDiv.innerHTML = html;
            }
            
            function createTableClusters() {
                const clusters = [];
                const processed = new Set();
                
                data.lineage.nodes.forEach(function(node) {
                    if (processed.has(node.id) || node.type !== 'TABLE') return;
                    
                    const cluster = {
                        tables: [node.id],
                        joinKeys: []
                    };
                    
                    // Find all tables connected to this one via join keys
                    const queue = [node.id];
                    processed.add(node.id);
                    
                    while (queue.length > 0) {
                        const currentTable = queue.shift();
                        
                        data.lineage.edges.forEach(function(edge) {
                            if (edge.type !== 'join_key') return;
                            
                            let otherTable = null;
                            if (edge.source.id === currentTable && !processed.has(edge.target.id)) {
                                otherTable = edge.target.id;
                            } else if (edge.target.id === currentTable && !processed.has(edge.source.id)) {
                                otherTable = edge.source.id;
                            }
                            
                            if (otherTable) {
                                cluster.tables.push(otherTable);
                                processed.add(otherTable);
                                queue.push(otherTable);
                                if (edge.label && !cluster.joinKeys.includes(edge.label)) {
                                    cluster.joinKeys.push(edge.label);
                                }
                            }
                        });
                    }
                    
                    if (cluster.tables.length > 1) {
                        clusters.push(cluster);
                    }
                });
                
                return clusters.sort(function(a, b) { return b.tables.length - a.tables.length; });
            }
            
            function oldRenderLineage() {
                // Old chaotic implementation - keeping for reference but not using
                if (!data.lineage || !data.lineage.nodes || data.lineage.nodes.length === 0) {
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
                    .attr('stroke', d => d.type === 'view_dependency' ? 'rgba(245, 158, 11, 0.8)' : 'rgba(16, 185, 129, 0.6)')
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
                    .style('font-size', '14px')
                    .style('font-weight', '600')
                    .style('fill', 'var(--text-primary)')
                    .style('text-shadow', '0 0 3px rgba(0,0,0,0.8), 1px 1px 2px rgba(0,0,0,0.6)')
                    .style('text-anchor', 'middle')
                    .style('pointer-events', 'none')
                    .text(d => d.id);
                
                // Add title for hover
                node.append('title')
                    .text(d => {
                        let title = d.id + ' (' + d.type + ')\\nRows: ' + d.row_count.toLocaleString() + '\\nSize: ' + (d.size_bytes ? Math.round(d.size_bytes / (1024 * 1024) * 100) / 100 : 0) + ' MB';
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
            renderAnalyticsInsights();
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