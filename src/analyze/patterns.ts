/**
 * Generalized column-name patterns.
 *
 * These are the surviving idea from the old tool's `entities.js`, stripped
 * of its Mixpanel vocabulary. Their job here is narrower than it used to
 * be: names only decide which columns are worth measuring. Real value
 * overlap decides what is actually a join key.
 *
 * That demotion matters. On the probe dataset, `users.distinct_id` and
 * `rooms.distinct_id` share a name but overlap in only 6 of 100 values, and
 * are not even the same type. Name matching alone reports a join that does
 * not exist.
 */

/** Types that can meaningfully identify a row. */
export const KEY_TYPES = new Set(['STRING', 'INT64', 'NUMERIC', 'BIGNUMERIC']);

/** Types that represent a point in time. */
export const TEMPORAL_TYPES = new Set(['TIMESTAMP', 'DATETIME', 'DATE', 'TIME']);

/** Types that are usually measured rather than grouped. */
export const NUMERIC_TYPES = new Set(['INT64', 'FLOAT64', 'NUMERIC', 'BIGNUMERIC']);

/** A column that names an entity and holds its identifier. */
export const IDENTIFIER_PATTERN =
	/(^|_)(id|ids|key|keys|uuid|guid|ulid|cuid|pk|fk|ref|code|number|num|sku|isbn|hash|token|slug|handle|email|username|arn|urn)$/i;

/** A bare identifier column, e.g. `id`, `_id`, `pk`. */
export const BARE_IDENTIFIER_PATTERN = /^_?(id|pk|uuid|guid|oid|rowid|row_id|key)$/i;

/** A column naming a moment in time. */
export const TEMPORAL_PATTERN =
	/(^|_)(time|timestamp|ts|date|datetime|at|on|created|updated|modified|deleted|inserted|occurred|happened|logged|recorded|received|processed|ingested|loaded|started|ended|expires|expiry|scheduled|published)(_.*)?$/i;

/** A column holding a boolean-ish flag. */
export const FLAG_PATTERN = /^(is|has|can|should|was|were|did|does|allow|enable|use)_?[a-z]/i;

/** A column holding a quantity worth summing or averaging. */
export const MEASURE_PATTERN =
	/(^|_)(count|total|sum|amount|amt|value|price|cost|revenue|spend|qty|quantity|size|bytes|duration|elapsed|latency|score|rate|ratio|pct|percent|weight|height|width|length|balance|fee|tax|discount)(_.*)?$/i;

/** A column likely to hold long free text rather than a category. */
export const TEXT_PATTERN =
	/(^|_)(description|desc|comment|comments|note|notes|body|content|message|msg|text|summary|reason|detail|details|bio|about|feedback|review|answer|question)(_.*)?$/i;

/**
 * Names too generic to be join keys even when they appear in many tables.
 *
 * These match across unrelated tables by coincidence, so sketching them
 * wastes budget and floods the relationship graph with noise.
 */
export const GENERIC_NAMES = new Set([
	'name',
	'title',
	'label',
	'type',
	'kind',
	'status',
	'state',
	'category',
	'description',
	'comment',
	'note',
	'value',
	'count',
	'total',
	'amount',
	'version',
	'source',
	'target',
	'city',
	'region',
	'country',
	'state_code',
	'currency',
	'language',
	'locale',
	'timezone',
	'color',
	'colour',
	'size',
	'active',
	'enabled',
	'deleted',
	'code',
	'group',
	'level',
	'rank',
	'order',
	'position',
	'index',
]);

export function isIdentifierName(name: string): boolean {
	const leaf = name.split('.').at(-1) ?? name;
	if (GENERIC_NAMES.has(leaf.toLowerCase())) return false;
	return BARE_IDENTIFIER_PATTERN.test(leaf) || IDENTIFIER_PATTERN.test(leaf);
}

export function isTemporalName(name: string): boolean {
	const leaf = name.split('.').at(-1) ?? name;
	return TEMPORAL_PATTERN.test(leaf);
}
