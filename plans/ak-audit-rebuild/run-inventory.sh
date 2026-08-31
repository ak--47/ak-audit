#!/usr/bin/env bash
# Overnight inventory of Mixpanel internal datasets.
#
# Priority order first: dbt_aeng and sales_intelligence are the two the
# requester cares most about (an Analytics Eng cleanup is expected to move
# names and columns in dbt_aeng, and the sales_intelligence "vouched" list
# has known holes).
#
# Budgets are deliberately tight. The metadata every table needs -- exact row
# count, column names and types, table-or-view -- is free regardless, so a
# skipped profile costs information we did not ask for, not information we
# did.
#
# Resumable: per-table files are skipped on a re-run, so this can be
# restarted safely.

set -uo pipefail
cd /Users/ak/code/ak-audit

OUT=~/tmp
LOG="$OUT/_logs"
mkdir -p "$LOG"

# dataset|project|per-table cap|run cap|recent partitions
JOBS=(
  "sales_intelligence|mixpanel-sa|20GB|150GB|3"
  "dbt_aeng|mixpanel-internal-data|20GB|250GB|3"
  "pylon_operations|mixpanel-support-sandbox|20GB|100GB|3"
  "dbt_sources|mixpanel-internal-data|20GB|250GB|3"
  "dbt|mixpanel-internal-data|20GB|300GB|2"
  # One 47 TB table dominates this dataset, so profile a single day of it.
  "p3_json_export|mixpanel-internal-data|60GB|120GB|1"
)

echo "inventory started $(date)" | tee "$LOG/_run.log"

for job in "${JOBS[@]}"; do
  IFS='|' read -r DS PROJ PER RUN PARTS <<< "$job"
  START=$(date +%s)
  echo "" | tee -a "$LOG/_run.log"
  echo "=== $PROJ.$DS  started $(date +%H:%M:%S) ===" | tee -a "$LOG/_run.log"

  npx tsx src/cli.ts audit "$PROJ.$DS" \
    --out "$OUT/$DS" \
    --max-bytes-per-table "$PER" \
    --max-bytes-total "$RUN" \
    --count-budget 10GB \
    --partitions "$PARTS" \
    --concurrency 8 \
    > "$LOG/$DS.log" 2>&1

  CODE=$?
  ELAPSED=$(( $(date +%s) - START ))
  TABLES=$(ls "$OUT/$DS/raw" 2>/dev/null | wc -l | tr -d ' ')
  echo "=== $DS finished exit=$CODE tables=$TABLES in ${ELAPSED}s ===" | tee -a "$LOG/_run.log"
done

echo "" | tee -a "$LOG/_run.log"
echo "inventory finished $(date)" | tee -a "$LOG/_run.log"
