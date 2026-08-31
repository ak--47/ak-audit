# ak-audit

Maps a BigQuery dataset and writes everything you — or an agent — need to
understand it, locally.

Point it at a dataset. It writes a folder holding the schema, per-column
statistics, discovered relationships, sample rows, DDL, Markdown notes, and one
self-contained HTML report.

Two readers, one output:

- **An agent** given the folder can answer "what is in here, how do these tables
  relate, which column do I join on, what do the values look like" without
  touching BigQuery. When it does need real rows, it knows exactly which table,
  column, and partition to ask for.
- **A person** opens one HTML file and finds and previews anything fast.

## Install

Needs Node 22 or newer. Nothing to install:

```bash
npx @ak--47/ak-audit audit my-project.my_dataset
```

Install it once and the command is just `ak-audit`:

```bash
npm install -g @ak--47/ak-audit
ak-audit audit my-project.my_dataset
```

The package is scoped because npm holds the bare name `ak-audit` too close to
an existing `akaudit`. The command it installs is unscoped, so every example
below reads `ak-audit`.

Authentication uses Application Default Credentials:

```bash
gcloud auth application-default login
```

To use a service-account key instead, pass `--auth key.json` to any command.

## Use

```bash
ak-audit audit my-project.my_dataset
```

That runs all four stages and prints where the report landed. Stages also run
on their own:

```bash
ak-audit extract  my-project.my_dataset   # metadata; costs ~nothing
ak-audit profile  my-project.my_dataset   # column stats; costs money
ak-audit analyze                          # local, free
ak-audit report                           # local, free
```

`analyze` and `report` read from disk, so re-running them is instant. Use that
while iterating.

### Know the cost before you pay it

```bash
ak-audit audit my-project.my_dataset --estimate
```

Dry-runs every query, prints the projected scan size and cost, and executes
nothing.

```bash
ak-audit audit my-project.my_dataset --no-profile
```

Metadata only. Effectively free, and a good first look at an unfamiliar dataset.

### Options

| Flag | Default | Meaning |
|---|---|---|
| `--auth <file>` | ADC | Service-account key file |
| `--out <dir>` | `./output` | Output directory |
| `--tables <list>` | all | Comma-separated names or globs, e.g. `events*,users` |
| `--location <loc>` | detected | Dataset region |
| `--samples <n>` | 20 | Sample rows per table. `0` skips sampling entirely |
| `--max-cost <usd>` | `5` | Ceiling on what any one query may cost |
| `--max-total-cost <usd>` | `25` | Ceiling on what the whole run may cost |
| `--partitions <n>` | 3 | Recent partitions to profile |
| `--usage` | off | Read query history (see below) |
| `--usage-days <n>` | 30 | Query-history window |
| `--no-query-text` | off | Omit example SQL from usage output |
| `--full` | off | Scan whole tables instead of pruning or sampling |
| `--concurrency <n>` | 8 | Tables in parallel |
| `--force` | off | Re-fetch tables already on disk |
| `--estimate` | off | Dry run only; print cost, execute nothing |
| `--no-profile` | off | Skip column statistics |

Limits are set in dollars, because that is the unit worth reasoning in. Every
query is dry-run first and refused if it would exceed `--max-cost`. A refused
table is reported as declined, and never counted as money spent. If you would
rather think in scan size, `--max-bytes-per-table` and `--max-bytes-total`
override the dollar flags.

Runs resume. Per-table files are written as each table finishes and skipped on
a later run unless `--force`.

### Seeing how a dataset is actually used

```bash
ak-audit audit my-project.my_dataset --usage --usage-days 30
```

Schema says what a table holds. It cannot say whether anyone reads it. With
`--usage`, ak-audit reads BigQuery's job history and adds, per table: how many
times it was queried, by how many people, who those people are, how much they
scanned, when it was last read, which tables get queried alongside it, and real
example queries.

It also lists the tables nobody read at all in the window, which is usually the
most actionable thing in the report.

It excludes its own jobs. Auditing a dataset means querying most of it, so
without that the tool reads its own profiling traffic back and reports it as
usage. Excluded jobs are counted, not hidden.

Three honesty notes, all surfaced in the output rather than buried:

- **Project-wide history needs `bigquery.jobs.listAll`.** Without it, ak-audit
  falls back to your own queries only and says so, because "nobody queries this"
  and "I have not queried this" are very different claims.
- **A view never appears in BigQuery's referenced tables** — querying one
  resolves to its underlying tables. Views are matched by name in the query text
  instead, which is approximate and labelled as such. Without this every view
  looks dead.
- **A name can be queried and be gone.** Tables read during the window that are
  no longer in the dataset are listed separately rather than counted as dataset
  tables, because that gap is usually the interesting part.

Query history is not free metadata: roughly $0.013 per day of window. It obeys
`--max-cost` like anything else.

## What you get

```
output/
  catalog.md             one line per table — start here
  overview.md            shape, relationships, warnings
  ddl.sql                every CREATE statement
  manifest.json          run config, cost, and anything skipped and why
  usage.json             query history, if --usage was set
  raw/<table>.json       schema, partitions, lineage, samples
  profile/<table>.json   per-column statistics
  analysis/
    relationships.json   join candidates with their evidence
    tables/<table>.md    per-table notes, ending in a query to run
  report/index.html      the human report
```

## How it works

Four stages. Only the first two talk to BigQuery.

**extract** reads `INFORMATION_SCHEMA`, storage metadata, DDL, and any
hand-written table and column descriptions the warehouse carries — those are
the richest free context available, and they are indexed in the report's search
so you can find a table by what it is *about*. It gets view lineage by
dry-running each view — which is exact and costs nothing, unlike
parsing SQL with regexes. Sample rows come from the storage endpoint, which
scans zero bytes.

**profile** builds one type-aware aggregate query per table and reads null
counts, distinct counts, min/max, and top values in a single scan.

**analyze** and **report** are pure local functions over what the first two
wrote.

### Finding relationships without joining anything

During the profile scan, key-candidate columns also emit a HyperLogLog sketch.
Those sketches merge later from SQL literals, referencing no source table at
all, so comparing every pair of key columns across a dataset scans zero bytes.
Cost is proportional to the number of tables, not the number of pairs.

Column names only decide which columns get sketched. Real values decide what is
actually related, and every reported relationship carries its evidence: both
cardinalities, the estimated overlap, and the containment ratio. Cardinalities
come from sketches, so they are estimates, and the report says so.

Overlap alone produces confident nonsense in several ways, so it is filtered:
a small set landing inside a large one by chance; two generated integer keys
that overlap because both count from one; and any integer column sitting inside
a dense integer run. Each filter came from a false positive observed on a real
dataset.

### Not spending your money

Real tables reach hundreds of terabytes, so cost control is the point rather
than a feature. Every profile query is dry-run first, and a table over budget is
skipped whole and recorded with a reason — never half-profiled, because a
partial profile looks complete to whoever reads it next.

Scans are pruned to recently populated partitions, chosen from free metadata.
On a 225 TB table that took one measured query from $332 to $0.25. Where
partitioning is unavailable, large tables are sampled instead.

## Other warehouses

Only BigQuery is implemented. `src/warehouse/types.ts` defines the adapter
interface; stages 3 and 4 are warehouse-agnostic, so adding Snowflake means
writing an adapter and nothing else.

## Development

Clone it, then run the TypeScript directly. There is no build step in the
development loop:

```bash
npm install
npx tsx src/cli.ts audit my-project.my_dataset

npm test          # unit tests, no network
npm run typecheck
npm run build     # compile src/ to dist/, only needed to publish
npm run serve     # serve the built report
```

Tests use numbers measured against real BigQuery, so they document behaviour
rather than restate the implementation.

### Publishing

The published package is compiled; the repo is not. Source files import each
other with a `.ts` suffix so `tsx` can run them unbuilt, and `npm run build`
rewrites those specifiers to `.js` on the way into `dist/`.

```bash
npm version patch     # or minor / major
npm publish
```

`prepack` builds and `prepublishOnly` runs the typecheck and the tests, so a
broken `dist/` cannot reach npm. Only `dist/`, `README.md` and `LICENSE` are
packed. `publishConfig.access` is `public`, which a scoped package needs — its
default is restricted.

Two things to keep in step, both enforced by a test in `test/package.test.ts`:

- `version` in `package.json` and `TOOL_VERSION` in `src/pipeline.ts`. The
  second is written into every `manifest.json`, so a reader can tell which
  version produced an output folder. `npm version` bumps only the first, so
  edit `TOOL_VERSION` in the same commit.
- `bin` must point at `dist/cli.js`. The shebang in `src/cli.ts` is plain
  `node` because that file becomes the published entry point.
