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

Needs Node 22 or newer.

```bash
npm install
```

Authentication uses Application Default Credentials:

```bash
gcloud auth application-default login
```

To use a service-account key instead, pass `--auth key.json` to any command.

## Use

```bash
npx tsx src/cli.ts audit my-project.my_dataset
```

That runs all four stages and prints where the report landed. Stages also run
on their own:

```bash
npx tsx src/cli.ts extract  my-project.my_dataset   # metadata; costs ~nothing
npx tsx src/cli.ts profile  my-project.my_dataset   # column stats; costs money
npx tsx src/cli.ts analyze                          # local, free
npx tsx src/cli.ts report                           # local, free
```

`analyze` and `report` read from disk, so re-running them is instant. Use that
while iterating.

### Know the cost before you pay it

```bash
npx tsx src/cli.ts audit my-project.my_dataset --estimate
```

Dry-runs every query, prints the projected scan size and cost, and executes
nothing.

```bash
npx tsx src/cli.ts audit my-project.my_dataset --no-profile
```

Metadata only. Effectively free, and a good first look at an unfamiliar dataset.

### Options

| Flag | Default | Meaning |
|---|---|---|
| `--auth <file>` | ADC | Service-account key file |
| `--out <dir>` | `./output` | Output directory |
| `--tables <list>` | all | Comma-separated names or globs, e.g. `events*,users` |
| `--location <loc>` | detected | Dataset region |
| `--samples <n>` | 20 | Sample rows per table |
| `--max-bytes-per-table <size>` | `50GB` | Skip a table's profile above this |
| `--max-bytes-total <size>` | `500GB` | Stop profiling above this |
| `--partitions <n>` | 3 | Recent partitions to profile |
| `--full` | off | Scan whole tables instead of pruning or sampling |
| `--concurrency <n>` | 8 | Tables in parallel |
| `--force` | off | Re-fetch tables already on disk |
| `--estimate` | off | Dry run only; print cost, execute nothing |
| `--no-profile` | off | Skip column statistics |

Runs resume. Per-table files are written as each table finishes and skipped on
a later run unless `--force`.

## What you get

```
output/
  catalog.md             one line per table — start here
  overview.md            shape, relationships, warnings
  ddl.sql                every CREATE statement
  manifest.json          run config, cost, and anything skipped and why
  raw/<table>.json       schema, partitions, lineage, samples
  profile/<table>.json   per-column statistics
  analysis/
    relationships.json   join candidates with their evidence
    tables/<table>.md    per-table notes, ending in a query to run
  report/index.html      the human report
```

## How it works

Four stages. Only the first two talk to BigQuery.

**extract** reads `INFORMATION_SCHEMA`, storage metadata, and DDL, and gets view
lineage by dry-running each view — which is exact and costs nothing, unlike
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

```bash
npm test          # unit tests, no network
npm run typecheck
npm run serve     # serve the built report
```

Tests use numbers measured against real BigQuery, so they document behaviour
rather than restate the implementation.
