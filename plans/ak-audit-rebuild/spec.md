# ak-audit — full rebuild spec

**Date:** 2026-08-30
**Status:** approved, in progress

## Purpose

`ak-audit` is a CLI that maps a BigQuery dataset and writes everything an
agent or a human needs to understand it, locally.

Two consumers, one output folder:

- **An agent** given the folder can answer "what is in this dataset, how do
  the tables relate, which column do I join on, what does this value look
  like" without touching BigQuery. When it does need real rows, it knows
  exactly which table, column, and partition to query.
- **A human** opens one HTML file and finds and previews anything fast.
  BigQuery's own preview UI is slow and shallow; this replaces it.

Non-goals: not an npm package, not a service, not Mixpanel-specific, not a
data-quality scorer. No Snowflake code — only a seam where it can go later.

## Verified BigQuery facts

Every design choice below rests on a probe run against real data on
2026-08-30. These are measured, not assumed.

| # | Finding | Evidence |
|---|---------|----------|
| F1 | A dry run of `SELECT * FROM <view> LIMIT 0` returns exact `referencedTables` for **0 bytes**. | Confirmed on `warehouse_connectors.complexTypes_view`. |
| F2 | `INFORMATION_SCHEMA.TABLES.ddl` holds full `CREATE` DDL for tables, views, and materialized views. | Confirmed. |
| F3 | `INFORMATION_SCHEMA.PARTITIONS` gives per-partition `total_rows` and `last_modified_time` as free metadata. | Confirmed. |
| F4 | One query, one table scan can return row count, per-column null count, NDV, min, max, top-N values, **and** an exportable HLL sketch. | Confirmed on `warehouse_connectors.events`. |
| F5 | HLL sketches exported as base64 can be merged later from SQL literals, scanning **zero source bytes**, to estimate pairwise set overlap. | Confirmed; see "Join detection". |
| F6 | Partition pruning cut a real profile query from **53.2 TB ($332) to 0.04 TB ($0.25)** — a 1,357x reduction. | `kodiak.events`, 1-day filter. |
| F7 | `TABLESAMPLE SYSTEM (n PERCENT)` **is** reflected in dry-run byte estimates (~100x cut at 1%). | Same table. Works where pruning is unavailable. |
| F8 | A query fails hard past **10,000 leaf output fields**: `Too many total leaf fields: 13531, max allowed field count: 10000`. | 3,006-column table. |
| F9 | Columnar billing means splitting a profile into chunks bills each chunk only for **its own** columns. Chunking adds no scan penalty. | Confirmed. |
| F10 | `JSON` columns cannot be grouped or aggregated. `TO_JSON_STRING(col)` works. | `APPROX_COUNT_DISTINCT` on JSON errors. |
| F11 | `ARRAY` columns cannot be aggregated at all. `ARRAY_LENGTH()` works in the main scan; element stats need `UNNEST` (a second scan). | Confirmed. |
| F12 | `nulls` is a reserved keyword and breaks generated SQL used as an alias. | Broke a probe query. |
| F13 | Real datasets here reach **552 TB / 1 trillion rows / 3,006 columns**. | `asos_ios_prod_silver`, `kodiak.events`. |

F13 is why cost control is the primary safety property of this tool, not a
feature. A naive "profile every column" run against this project would cost
tens of thousands of dollars.

## Architecture

Four stages. Only stages 1 and 2 touch BigQuery.

```
extract  --> raw/       (schema, DDL, lineage, partitions, samples)
profile  --> profile/   (column stats + HLL sketches)   [costs money]
analyze  --> analysis/  (relationships, markdown docs)  [local only]
report   --> report/    (one self-contained HTML file)  [local only]
```

`ak-audit audit` runs all four. Each stage is independently runnable and
reads the previous stage's files from disk, so re-running `analyze` and
`report` is free and instant. This is the one principle carried over from
the old tool, and it stays.

### Stage 1 — extract (cheap, metadata only)

Per dataset, using free or near-free metadata queries:

- Table list, type, row count, byte size, creation and modification time
  (`INFORMATION_SCHEMA.TABLES`, `TABLE_STORAGE`).
- Full column schema including nested paths
  (`INFORMATION_SCHEMA.COLUMN_FIELD_PATHS`), so `STRUCT` and `ARRAY` fields
  keep their real paths and types.
- DDL for every object (F2).
- Partitioning and clustering config, plus per-partition row counts and
  last-modified times (F3). This yields freshness and volume trend for free.
- Exact view and materialized-view lineage by dry-running each view (F1).
  This replaces regex SQL parsing, which was fragile and wrong.
- Sample rows. Prefer the free `tabledata.list` REST endpoint, which scans
  zero bytes and needs only read access. Fall back to a pruned `SELECT` for
  views, which the REST endpoint cannot serve.

### Stage 2 — profile (the only stage that spends money)

For each table, build one type-aware aggregate query per chunk of columns.

**Type rules** (from F10, F11, F12):

| Column kind | Stats collected |
|---|---|
| STRING, INT64, NUMERIC, DATE, TIMESTAMP, DATETIME | null count, NDV, min, max, top-N, HLL sketch if key candidate |
| FLOAT64 | null count, NDV, min, max |
| BOOL | null count, NDV, top-N |
| JSON | null count, NDV over `TO_JSON_STRING(col)` |
| ARRAY (REPEATED) | null count, total elements, max length |
| STRUCT | null count only (leaf fields profiled individually) |
| GEOGRAPHY, BYTES, INTERVAL | null count only |

All generated identifiers are prefixed (`c0_nullct`, `c1_ndv`) and all
column references are backtick-quoted, so no user column name or alias can
collide with a reserved word (F12).

**Chunking** (from F8, F9): the builder estimates leaf output fields per
column and splits at a 8,000-leaf ceiling, under BigQuery's 10,000 limit.
The estimator is exact — it predicted 13,531 leaves for the 3,006-column
table, matching BigQuery's error message. Chunking is free (F9).

**Cost control** — the core safety property. In order:

1. Every profile query is dry-run first. The estimate is real (F6, F7).
2. Prefer partition pruning. Pick the most recent populated partitions from
   free `PARTITIONS` metadata (F3), never a blind date range. 1,357x cheaper
   on real data (F6).
3. For large unpartitioned tables, fall back to `TABLESAMPLE SYSTEM` (F7).
4. Enforce `--max-bytes-per-table` and `--max-bytes-total`. A table over
   budget is **skipped, not truncated**, and the reason is recorded in the
   manifest so nothing silently goes missing.
5. `--estimate` runs every dry run and prints the total projected cost
   without executing anything. Answer "what will this cost" before paying.

Defaults are deliberately timid: profiling on, but budgeted, pruned, and
sampled. A user must raise the budget to spend real money.

### Join detection — the centerpiece

The old tool guessed join keys by matching column names. That produces false
positives. This one confirms them with real values, at almost no cost.

During the single profile scan, every join-key *candidate* column also emits
a HyperLogLog sketch, cast to STRING so sketches are type-compatible:

```sql
TO_BASE64(HLL_COUNT.INIT(CAST(col AS STRING), 12)) AS c7_sketch
```

Precision 12 gives a ~1.2 KB sketch. It rides along in the scan already
being paid for, so it is effectively free.

Name heuristics still run, but demoted: they only decide *which* columns get
sketched, keeping sketch volume bounded. They never decide the answer.

Then one query merges sketches from literals — referencing **no source
tables at all** (F5):

```
|A ∩ B| = |A| + |B| - |A ∪ B|      via HLL_COUNT.MERGE
containment = |A ∩ B| / min(|A|, |B|)
```

Cost is O(number of tables) scans instead of O(pairs) joins. On the probe
dataset this immediately produced correct, non-obvious results:

- `complexTypes.room_id` ∩ `rooms.room_id` = 7289 of 7289 → **100%
  containment, a genuine foreign key.**
- `users.distinct_id` ∩ `rooms.distinct_id` = 6 of 100 → names match, values
  do not. **A false positive the old name-matching approach would have
  reported as a join key.** The types even differ: STRING vs INT64.
- `rooms.distinct_id` and `rooms.room_id` are identical sets → **duplicate
  columns inside one table**, a finding worth surfacing on its own.

Containment, not Jaccard, is the ranking metric: high containment of a small
set inside a large one is exactly the child-to-parent foreign key signal.

Every reported relationship carries its evidence — both cardinalities, the
estimated intersection, the containment ratio, and the fact that HLL is an
estimate. The report never claims a join is certain.

### Stage 3 — analyze (local, free, instant)

Pure functions over stage 1 and 2 output. No network. This is where scoring
logic can be iterated on cheaply, which was the best property of the old
design.

Produces:

- A relationship graph combining confirmed value overlap with exact view
  lineage.
- Column role classification (identifier, timestamp, measure, categorical,
  free text, flag), derived from stats plus generalized name patterns.
- Notable findings: empty tables, all-null columns, constant columns,
  duplicate columns, stale tables, unpartitioned large tables, high-null
  columns.

`entities.js` is kept but stripped of Mixpanel concepts and rewritten as
typed, tested pattern tables.

### Stage 4 — report

One self-contained HTML file, no server, no external requests.

- Command-palette search (`cmd-K`) across tables and columns, instant and
  client-side.
- Per-table view: schema, stats, top values, sample rows, related tables.
- Per-column detail: null rate, NDV, min/max, top-value distribution.
- Relationship graph with containment-weighted edges.
- **Copy-as-SQL** on every table and column — emits a correct, partition-
  pruned `SELECT ... LIMIT 100`. This directly serves "make it easy to query
  only what I need."

Size guard: embedded sample bytes are capped, with truncation shown in the
UI. If total embedded data crosses a threshold, the payload is embedded
gzipped and inflated in-browser via `DecompressionStream`, keeping one file.

## Output folder

```
<output>/
  manifest.json          run config, per-table cost, skips + reasons
  catalog.md             one-screen index: every table, one line each
  overview.md            dataset narrative, relationships, findings
  ddl.sql                all CREATE statements (free, from F2)
  raw/<table>.json       schema, partitions, lineage, samples
  profile/<table>.json   column stats + sketches
  analysis/
    relationships.json   join edges with evidence
    tables/<table>.md    per-table markdown for agents
  report/index.html      the human report
```

JSON gives an agent exact values. Markdown gives it cheap narrative context.
`catalog.md` exists so an agent finds the right table without reading 500
files. `ddl.sql` exists because it is free and an agent writing SQL wants it.

## CLI

```
ak-audit audit    <project.dataset> [flags]   # all four stages
ak-audit extract  <project.dataset> [flags]
ak-audit profile  <project.dataset> [flags]
ak-audit analyze  [--out DIR]
ak-audit report   [--out DIR]
```

Key flags:

| Flag | Default | Meaning |
|---|---|---|
| `--auth <path>` | ADC | Service-account key file. Default is Application Default Credentials. |
| `--out <dir>` | `./output` | Output folder |
| `--tables <glob>` | all | Filter tables |
| `--location <loc>` | auto-detect | Region; detected from the dataset, not required |
| `--samples <n>` | 20 | Sample rows per table |
| `--max-bytes-per-table` | 50 GB | Skip a table's profile above this |
| `--max-bytes-total` | 500 GB | Stop profiling above this |
| `--estimate` | off | Dry-run everything, print cost, execute nothing |
| `--no-profile` | off | Metadata only, guaranteed near-zero cost |
| `--concurrency <n>` | 8 | Parallel tables |
| `--force` | off | Re-fetch tables already on disk |

**Auth**: ADC by default, since that is how the tool is normally used.
`--auth <file>` switches to a service-account key. Nothing else changes.

**Resumability**: per-table files are written as each table completes, and
existing files are skipped unless `--force`. A run over a large dataset can
be interrupted and resumed. This matters at the scale in F13.

## Tech

- TypeScript, run directly with `tsx`. No build step.
- Node 22+.
- `@google-cloud/bigquery` v9 (v8.1.1 currently installed), `commander` v15,
  `tsx` v4, `vitest` v4. TypeScript pinned to 5.x, not 7.x — the Go port is
  too new to depend on for this.
- `package.json` keeps only `type`, `dependencies`, and `scripts`. All
  publish machinery (`bin`, `files`, `main`, `.npmignore`, `post`) is deleted.

### Module layout

```
src/
  cli.ts                  subcommands, flags
  config.ts               resolved options, defaults
  warehouse/
    types.ts              WarehouseAdapter interface (the Snowflake seam)
    bigquery/
      client.ts           auth: ADC or --auth key
      metadata.ts         tables, columns, DDL, partitions
      lineage.ts          dry-run referencedTables (F1)
      samples.ts          free REST sampling
      profileSql.ts       type-aware SQL builder + leaf estimator (F8,F10-12)
      budget.ts           dry run, pruning, TABLESAMPLE, limits (F6,F7)
      sketches.ts         HLL init + literal-merge overlap (F4,F5)
  analyze/
    relationships.ts      containment ranking
    roles.ts              column role classification
    findings.ts           notable findings
    patterns.ts           generalized name patterns (ex-entities.js)
  report/
    build.ts, template.ts, assets.ts
  output/
    writers.ts            json, markdown, ddl, manifest
```

Adding Snowflake later means implementing `WarehouseAdapter` and nothing
else. Stages 3 and 4 are warehouse-agnostic by construction.

## Testing

- Unit tests, no network: SQL builder output, leaf-field estimator (asserted
  against the real 13,531 figure from F8), type rules, containment math,
  pattern tables, budget decisions.
- Fixture-based integration test: a recorded `warehouse_connectors` capture
  drives stages 3 and 4 end to end. That dataset is the right fixture — it
  has base tables, a view, a materialized view, nested STRUCT/ARRAY columns,
  a JSON column, a real foreign key, a duplicate-column pair, and a
  name-matching false positive.
- A live smoke test against `warehouse_connectors`, run manually.

## Removals

Deleted outright: `archived/`, `output/`, `test-output*/`, `saved/`,
`bin/`, `.npmignore`, `examples/`, `fetch_demos.sh`, `rebuild.js`,
`buildReport.js`, `audit.js`, `bigquery.js`, `entities.js`, `index.d.ts`,
and all Mixpanel scoring, branding, and theming.

Kept and rewritten: the pattern-matching intent of `entities.js`, and the
staged-pipeline architecture.

## Risks

| Risk | Mitigation |
|---|---|
| A profile run costs real money (F13) | Dry run first, budget caps, pruning, sampling, `--estimate`, timid defaults |
| HLL overlap is an estimate | Report cardinalities and containment as evidence; never assert certainty |
| Sketches only compare cast-to-STRING values | Documented; it is what lets INT64 and STRING keys match correctly |
| Huge dataset makes the HTML unusable | Cap embedded samples; gzip payload; `catalog.md` is the scalable index |
| Wide tables break queries (F8) | Exact leaf estimator, chunk at 8,000 |
| Long runs interrupted | Per-table files plus resume-by-default |
