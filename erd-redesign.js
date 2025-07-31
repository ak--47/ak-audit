// New ERD Design - Clean and Actionable

// This is a complete replacement for the chaotic force simulation
// with a structured, hierarchical approach that's actually useful

const newERDSection = `
        <section class="lineage-section">
            <h2 style="color: var(--mint-100); font-weight: 600; margin-bottom: 20px; font-size: 1.8rem;">🔗 Table Relationships & Join Key Analysis</h2>
            
            <!-- Relationship Summary Cards -->
            <div class="relationship-summary" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 25px;">
                <div class="relationship-card" style="background: var(--bg-medium); border: 1px solid var(--border-color); border-radius: 8px; padding: 15px; text-align: center;">
                    <div style="font-size: 1.5rem; font-weight: 700; color: var(--accent);" id="totalJoinKeys">0</div>
                    <div style="font-size: 0.8rem; color: var(--text-secondary); text-transform: uppercase;">Potential Join Keys</div>
                </div>
                <div class="relationship-card" style="background: var(--bg-medium); border: 1px solid var(--border-color); border-radius: 8px; padding: 15px; text-align: center;">
                    <div style="font-size: 1.5rem; font-weight: 700; color: var(--mint-150);" id="connectedTables">0</div>
                    <div style="font-size: 0.8rem; color: var(--text-secondary); text-transform: uppercase;">Connected Tables</div>
                </div>
                <div class="relationship-card" style="background: var(--bg-medium); border: 1px solid var(--border-color); border-radius: 8px; padding: 15px; text-align: center;">
                    <div style="font-size: 1.5rem; font-weight: 700; color: var(--mustard-100);" id="viewDependencies">0</div>
                    <div style="font-size: 0.8rem; color: var(--text-secondary); text-transform: uppercase;">View Dependencies</div>
                </div>
            </div>
            
            <!-- Join Keys Analysis Table -->
            <div style="background: var(--bg-medium); border: 1px solid var(--border-color); border-radius: 12px; padding: 20px; margin-bottom: 20px;">
                <h3 style="color: var(--mint-100); font-size: 1.1rem; margin-bottom: 15px;">🔑 Join Key Analysis</h3>
                <div id="joinKeysAnalysis"></div>
            </div>
            
            <!-- Table Clusters -->
            <div style="background: var(--bg-medium); border: 1px solid var(--border-color); border-radius: 12px; padding: 20px; margin-bottom: 20px;">
                <h3 style="color: var(--mint-100); font-size: 1.1rem; margin-bottom: 15px;">🏷️ Table Clusters</h3>
                <div id="tableClustersAnalysis"></div>
                <p style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 10px; font-style: italic;">
                    Tables are grouped by shared join keys. Tables in the same cluster likely contain related data and can be joined together.
                </p>
            </div>
            
            <!-- View Dependencies -->
            <div style="background: var(--bg-medium); border: 1px solid var(--border-color); border-radius: 12px; padding: 20px;">
                <h3 style="color: var(--mint-100); font-size: 1.1rem; margin-bottom: 15px;">👁️ View Dependencies</h3>
                <div id="viewDependenciesAnalysis"></div>
            </div>
        </section>
`;

// And the corresponding JavaScript functions
const newERDFunctions = `
            function renderLineage() {
                if (!data.lineage || !data.lineage.nodes || data.lineage.nodes.length === 0) {
                    const lineageSection = document.querySelector('.lineage-section');
                    lineageSection.innerHTML = '<div style="text-align: center; color: var(--text-secondary); padding: 50px; background: var(--bg-medium); border-radius: 12px; border: 1px solid var(--border-color);">No relationships found. Views with table dependencies and tables with shared join keys will appear here.</div>';
                    return;
                }
                
                renderRelationshipSummary();
                renderJoinKeysAnalysis();
                renderTableClustersAnalysis();
                renderViewDependenciesAnalysis();
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
                    joinKeysDiv.innerHTML = '<p style="color: var(--text-secondary); font-style: italic;">No potential join keys detected. This could mean tables use different naming conventions or have no obvious relationships.</p>';
                    return;
                }
                
                let html = '<div style="display: grid; gap: 10px;">';
                
                Object.entries(joinKeyMap)
                    .sort(function(a, b) { return b[1].size - a[1].size; })
                    .forEach(function(entry) {
                        const key = entry[0];
                        const tables = Array.from(entry[1]);
                        const connectivity = tables.length;
                        
                        let connectivityColor = 'var(--text-secondary)';
                        let connectivityLabel = 'Low';
                        if (connectivity >= 5) {
                            connectivityColor = 'var(--lava-100)';
                            connectivityLabel = 'High';
                        } else if (connectivity >= 3) {
                            connectivityColor = 'var(--mustard-100)';
                            connectivityLabel = 'Medium';
                        }
                        
                        html += '<div style="background: var(--bg-dark); border-radius: 8px; padding: 15px; border-left: 4px solid var(--mint-150);">';
                        html += '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">';
                        html += '<div style="font-weight: 600; color: var(--mint-150); font-size: 1rem;">' + key + '</div>';
                        html += '<div style="background: ' + connectivityColor + '; color: var(--bg-dark); padding: 2px 8px; border-radius: 12px; font-size: 0.75rem; font-weight: 600;">' + connectivityLabel + '</div>';
                        html += '</div>';
                        html += '<div style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 8px;">Found in ' + connectivity + ' tables</div>';
                        html += '<div style="font-size: 0.8rem; color: var(--text-primary);">' + tables.join(' • ') + '</div>';
                        html += '</div>';
                    });
                
                html += '</div>';
                joinKeysDiv.innerHTML = html;
            }
            
            function renderTableClustersAnalysis() {
                const clusters = createTableClusters();
                const clustersDiv = document.getElementById('tableClustersAnalysis');
                
                if (clusters.length === 0) {
                    clustersDiv.innerHTML = '<p style="color: var(--text-secondary); font-style: italic;">No table clusters detected. Tables appear to be isolated or use different join key naming conventions.</p>';
                    return;
                }
                
                let html = '<div style="display: grid; gap: 15px;">';
                
                clusters.forEach(function(cluster, i) {
                    const clusterSize = cluster.tables.length;
                    let sizeColor = 'var(--accent)';
                    let sizeLabel = 'Small';
                    
                    if (clusterSize >= 5) {
                        sizeColor = 'var(--lava-100)';
                        sizeLabel = 'Large';
                    } else if (clusterSize >= 3) {
                        sizeColor = 'var(--mustard-100)';
                        sizeLabel = 'Medium';
                    }
                    
                    html += '<div style="background: var(--bg-dark); border-radius: 8px; padding: 15px; border-left: 4px solid ' + sizeColor + ';">';
                    html += '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">';
                    html += '<div style="font-weight: 600; color: ' + sizeColor + '; font-size: 1rem;">Cluster ' + (i + 1) + '</div>';
                    html += '<div style="background: ' + sizeColor + '; color: var(--bg-dark); padding: 2px 8px; border-radius: 12px; font-size: 0.75rem; font-weight: 600;">' + sizeLabel + '</div>';
                    html += '</div>';
                    html += '<div style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 8px;">' + clusterSize + ' tables connected by ' + cluster.joinKeys.length + ' shared keys</div>';
                    html += '<div style="margin-bottom: 8px;">';
                    html += '<div style="font-size: 0.8rem; color: var(--mint-150); font-weight: 500; margin-bottom: 4px;">Join Keys: ' + cluster.joinKeys.join(', ') + '</div>';
                    html += '<div style="font-size: 0.8rem; color: var(--text-primary);">Tables: ' + cluster.tables.join(' • ') + '</div>';
                    html += '</div>';
                    html += '</div>';
                });
                
                html += '</div>';
                clustersDiv.innerHTML = html;
            }
            
            function renderViewDependenciesAnalysis() {
                const viewDeps = data.lineage.edges.filter(function(e) { return e.type === 'view_dependency'; });
                const viewDepsDiv = document.getElementById('viewDependenciesAnalysis');
                
                if (viewDeps.length === 0) {
                    viewDepsDiv.innerHTML = '<p style="color: var(--text-secondary); font-style: italic;">No view dependencies detected. All objects appear to be base tables.</p>';
                    return;
                }
                
                let html = '<div style="display: grid; gap: 8px;">';
                
                viewDeps.forEach(function(dep) {
                    html += '<div style="background: var(--bg-dark); border-radius: 6px; padding: 12px; border-left: 3px solid var(--mustard-100);">';
                    html += '<div style="font-size: 0.9rem; color: var(--text-primary); font-weight: 500;">';
                    html += '<span style="color: var(--mustard-100);">' + dep.target.id + '</span> depends on <span style="color: var(--mint-150);">' + dep.source.id + '</span>';
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
`;

console.log("New ERD implementation ready to replace the chaotic force simulation!");