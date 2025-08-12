// Fields that should never be considered as join keys despite appearing in multiple tables
export const EXCLUDE_AS_JOIN_KEYS = [
    // Temporal fields
    "event", "event_name", "event_type", "event_time", "event_timestamp",
    "time", "timestamp", "datetime", "date",
    "created_at", "created_date", "created_time", "created_timestamp",
    "updated_at", "updated_date", "updated_time", "updated_timestamp",
    "modified_at", "modified_date", "modified_time",
    "deleted_at", "deleted_date", "deleted_time",
    "processed_at", "ingested_at", "loaded_at",
    
    // System/partition fields
    "_table_suffix", "_partitiontime", "_partitiondate", "_partition",
    "_shard", "_bucket", "_batch_id",
    
    // Generic descriptive fields
    "description", "comment", "note", "notes",
    "status", "state", "type", "category", "kind",
    "name", "title", "label",
    
    // Metrics/aggregates
    "count", "total", "sum", "avg", "average",
    "min", "max", "median", "percentile",
    
    // Version/audit fields
    "version", "revision", "audit_id", "change_id",
    "row_version", "etag", "checksum", "hash"
];

// --- Temporal/Timestamp Detection ---
export const VALID_TIMESTAMP_TYPES = new Set([
    'TIMESTAMP', 'DATETIME', 'DATE', 'TIME',
    'TIMESTAMPTZ', 'TIMESTAMP_TZ', 'TIMESTAMP WITH TIME ZONE',
    'TIMESTAMP WITHOUT TIME ZONE', 'DATETIME2', 'SMALLDATETIME'
]);

export const TIMESTAMP_FIELD_PATTERNS = /^(.*_)?(time|timestamp|ts|date|datetime|created|updated|modified|deleted|occurred|happened|event_time|logged|recorded|captured|processed|ingested|loaded|effective|expiry|expired|start|end|begin|finish|due|scheduled|completed|published|archived)(_at|_on|_date|_time|_timestamp|_ts)?(_.*)?$/i;

// Fields that look like timestamps but might be stored as numbers (epoch)
export const NUMERIC_TIMESTAMP_PATTERNS = /^(.*_)?(epoch|unix|millis|milliseconds|seconds|ticks)(_time|_timestamp|_ts)?(_.*)?$/i;

// --- Identity/Key Detection ---

// User/Actor identification patterns
export const USER_ID_PATTERNS = /^(.*_)?(user|client|customer|consumer|shopper|buyer|device|profile|account|member|subscriber|person|individual|identity|distinct|anonymous|anon|actor|visitor|guest|participant|player|uid|uuid|cuid|subject|principal|owner|creator|author|modifier|assignee|recipient)(_?)(id|guid|key|identifier|uuid|code|number|num|ref|reference)?(_.*)?$/i;

// Session/Visit patterns
export const SESSION_PATTERNS = /^(.*_)?(session|visit|browser|tab|connection|conversation|interaction|engagement)(_?)(id|uuid|key|identifier|token)?(_.*)?$/i;

// Primary/Foreign key patterns
export const PRIMARY_KEY_PATTERNS = /^(id|pk|primary_key|row_id|record_id|entity_id|object_id|_id|oid|guid|uuid)$/i;

export const FOREIGN_KEY_PATTERNS = /^(.*_)(id|key|fk|ref|reference|uuid|guid|code)$/i;

// --- Event/Activity Detection ---

// Event name/type patterns for event-driven schemas
export const EVENT_NAME_PATTERNS = /^(.*_)?(event|action|activity|operation|transaction|interaction|behavior|signal|trigger|command|message)(_?)(name|type|category|kind|class|group|family)?(_.*)?$/i;

// Event properties that often appear in event schemas
export const EVENT_PROPERTY_PATTERNS = /^(.*_)?(event|action)(_?)(properties|params|parameters|attributes|data|payload|context|metadata)(_.*)?$/i;

// --- PII Detection (Enhanced) ---
export const PII_PATTERNS = [
    // Contact Information
    { pattern: /^(.*_)?(email|e_?mail|mail|email_address|email_addr|contact_email|work_email|personal_email|business_email)(_.*)?$/i, type: 'email', sensitivity: 'high' },
    { pattern: /^(.*_)?(phone|telephone|mobile|cell|fax|contact_number|phone_number|tel|phone_num|mobile_number|cell_number|work_phone|home_phone|business_phone)(_.*)?$/i, type: 'phone', sensitivity: 'high' },
    
    // Name fields
    { pattern: /^(.*_)?(first|given|fname|f_name|forename|christian)(_?)(name)?(_.*)?$/i, type: 'first_name', sensitivity: 'medium' },
    { pattern: /^(.*_)?(last|family|surname|lname|l_name|lastname)(_?)(name)?(_.*)?$/i, type: 'last_name', sensitivity: 'medium' },
    { pattern: /^(.*_)?(middle|mname|m_name|middlename)(_?)(name|initial)?(_.*)?$/i, type: 'middle_name', sensitivity: 'medium' },
    { pattern: /^(.*_)?(full|display|complete|whole|entire)(_?)(name)(_.*)?$/i, type: 'full_name', sensitivity: 'medium' },
    { pattern: /^(.*_)?(maiden|birth|previous)(_?)(name)(_.*)?$/i, type: 'maiden_name', sensitivity: 'medium' },
    { pattern: /^(.*_)?(nick|nickname|alias|username|handle|screen)(_?)(name)?(_.*)?$/i, type: 'nickname', sensitivity: 'low' },
    
    // Address fields
    { pattern: /^(.*_)?(address|addr|street|street_address|mailing|billing|shipping|home|residence|location)(_?)(line)?(_?)(1|2|3)?(_.*)?$/i, type: 'address', sensitivity: 'high' },
    { pattern: /^(.*_)?(city|town|municipality|locality)(_.*)?$/i, type: 'city', sensitivity: 'low' },
    { pattern: /^(.*_)?(state|province|region|territory)(_.*)?$/i, type: 'state', sensitivity: 'low' },
    { pattern: /^(.*_)?(zip|zipcode|zip_code|postal|postal_code|postcode|post_code)(_.*)?$/i, type: 'postal_code', sensitivity: 'medium' },
    { pattern: /^(.*_)?(country|nation|country_code|country_name)(_.*)?$/i, type: 'country', sensitivity: 'low' },
    
    // Government IDs
    { pattern: /^(.*_)?(ssn|social|social_security|social_security_number|sin|social_insurance|tin|tax_id|national_id|national_insurance)(_?)(number|num)?(_.*)?$/i, type: 'ssn', sensitivity: 'critical' },
    { pattern: /^(.*_)?(passport|passport_number|passport_num)(_.*)?$/i, type: 'passport', sensitivity: 'critical' },
    { pattern: /^(.*_)?(driver|drivers|driving|license|licence|dl)(_?)(number|num)?(_.*)?$/i, type: 'drivers_license', sensitivity: 'critical' },
    
    // Financial
    { pattern: /^(.*_)?(credit|debit|payment|card|cc)(_?)(number|num|last4|last_four)?(_.*)?$/i, type: 'payment_card', sensitivity: 'critical' },
    { pattern: /^(.*_)?(bank|account|acct|iban|routing|swift|bic)(_?)(number|num|code)?(_.*)?$/i, type: 'bank_account', sensitivity: 'critical' },
    { pattern: /^(.*_)?(cvv|cvc|cvv2|cvc2|security_code|card_security)(_.*)?$/i, type: 'card_security', sensitivity: 'critical' },
    
    // Network/Device identifiers
    { pattern: /^(.*_)?(ip|ip_addr|ip_address|ipv4|ipv6|client_ip|server_ip|remote_ip|source_ip)(_.*)?$/i, type: 'ip_address', sensitivity: 'medium' },
    { pattern: /^(.*_)?(mac|mac_addr|mac_address|hardware_addr|ethernet)(_.*)?$/i, type: 'mac_address', sensitivity: 'low' },
    { pattern: /^(.*_)?(imei|imsi|udid|android_id|advertising_id|idfa|idfv)(_.*)?$/i, type: 'device_id', sensitivity: 'medium' },
    
    // Personal characteristics
    { pattern: /^(.*_)?(dob|birth|birthdate|birth_date|date_of_birth|birthday|born)(_.*)?$/i, type: 'date_of_birth', sensitivity: 'high' },
    { pattern: /^(.*_)?(age|years_old)(_.*)?$/i, type: 'age', sensitivity: 'medium' },
    { pattern: /^(.*_)?(gender|sex|biological_sex)(_.*)?$/i, type: 'gender', sensitivity: 'medium' },
    { pattern: /^(.*_)?(race|ethnicity|ethnic|racial)(_.*)?$/i, type: 'race_ethnicity', sensitivity: 'high' },
    
    // Health information
    { pattern: /^(.*_)?(diagnosis|medical|health|condition|illness|disease|symptom|treatment)(_.*)?$/i, type: 'health_info', sensitivity: 'critical' },
    { pattern: /^(.*_)?(medication|prescription|drug|medicine)(_.*)?$/i, type: 'medication', sensitivity: 'critical' },
    
    // Authentication/Security
    { pattern: /^(.*_)?(password|passwd|pwd|pass|secret|pin)(_.*)?$/i, type: 'password', sensitivity: 'critical' },
    { pattern: /^(.*_)?(token|api_key|apikey|access_token|refresh_token|auth_token|bearer)(_.*)?$/i, type: 'auth_token', sensitivity: 'critical' },
    { pattern: /^(.*_)?(salt|hash|hashed|encrypted)(_.*)?$/i, type: 'security_data', sensitivity: 'high' }
];

// --- Geographic/Location Detection ---
export const GEOGRAPHIC_PATTERNS = [
    { pattern: /^(.*_)?(lat|latitude)(_.*)?$/i, type: 'latitude' },
    { pattern: /^(.*_)?(lon|lng|long|longitude)(_.*)?$/i, type: 'longitude' },
    { pattern: /^(.*_)?(coordinates|coords|geo|geolocation|location|position)(_.*)?$/i, type: 'coordinates' },
    { pattern: /^(.*_)?(altitude|elevation|height)(_.*)?$/i, type: 'altitude' },
    { pattern: /^(.*_)?(timezone|time_zone|tz)(_.*)?$/i, type: 'timezone' },
    { pattern: /^(.*_)?(region|area|zone|district|neighborhood|locality)(_.*)?$/i, type: 'region' }
];

// --- Business/Commerce Detection ---
export const COMMERCE_PATTERNS = [
    { pattern: /^(.*_)?(price|cost|amount|fee|charge|rate|value|subtotal|total|grand_total)(_.*)?$/i, type: 'monetary' },
    { pattern: /^(.*_)?(currency|curr|cur)(_code)?(_.*)?$/i, type: 'currency' },
    { pattern: /^(.*_)?(quantity|qty|count|units|volume|items)(_.*)?$/i, type: 'quantity' },
    { pattern: /^(.*_)?(sku|product_id|product_code|item_id|item_code|article)(_.*)?$/i, type: 'product_identifier' },
    { pattern: /^(.*_)?(order|purchase|transaction|invoice|receipt|payment)(_?)(id|number|num|code)?(_.*)?$/i, type: 'transaction_id' },
    { pattern: /^(.*_)?(discount|coupon|promo|promotion|rebate|voucher)(_.*)?$/i, type: 'discount' },
    { pattern: /^(.*_)?(tax|vat|gst|sales_tax)(_.*)?$/i, type: 'tax' },
    { pattern: /^(.*_)?(shipping|freight|delivery|handling)(_.*)?$/i, type: 'shipping' },
    { pattern: /^(.*_)?(revenue|profit|margin|commission|royalty)(_.*)?$/i, type: 'financial_metric' }
];

// --- Technical/System Metadata ---
export const SYSTEM_METADATA_PATTERNS = [
    { pattern: /^(.*_)?(version|ver|v|revision|rev)(_?)(number|num)?(_.*)?$/i, type: 'version' },
    { pattern: /^(.*_)?(build|release|deployment)(_.*)?$/i, type: 'build_info' },
    { pattern: /^(.*_)?(error|exception|err|fault|failure)(_?)(code|message|msg|text|description)?(_.*)?$/i, type: 'error' },
    { pattern: /^(.*_)?(log|logs|logging|trace|debug)(_?)(level|message|text)?(_.*)?$/i, type: 'logging' },
    { pattern: /^(.*_)?(status|state|stage|phase|step)(_?)(code|id|name)?(_.*)?$/i, type: 'status' },
    { pattern: /^(.*_)?(flag|toggle|switch|enabled|disabled|active|inactive|is_|has_|can_|should_)(.*)$/i, type: 'boolean_flag' },
    { pattern: /^(.*_)?(config|configuration|setting|preference|option)(_.*)?$/i, type: 'configuration' },
    { pattern: /^(.*_)?(metadata|meta|props|properties|attributes|tags)(_.*)?$/i, type: 'metadata' }
];

// --- Content/Media Detection ---
export const CONTENT_PATTERNS = [
    { pattern: /^(.*_)?(url|uri|link|href|src|source|endpoint|path)(_.*)?$/i, type: 'url' },
    { pattern: /^(.*_)?(image|img|photo|picture|thumbnail|thumb|avatar|icon)(_?)(url|uri|path|src)?(_.*)?$/i, type: 'image' },
    { pattern: /^(.*_)?(video|vid|movie|clip|media)(_?)(url|uri|path|src)?(_.*)?$/i, type: 'video' },
    { pattern: /^(.*_)?(audio|sound|music|voice|recording)(_?)(url|uri|path|src)?(_.*)?$/i, type: 'audio' },
    { pattern: /^(.*_)?(file|document|doc|pdf|attachment)(_?)(name|path|url|type|size)?(_.*)?$/i, type: 'file' },
    { pattern: /^(.*_)?(mime|mimetype|mime_type|content_type|media_type)(_.*)?$/i, type: 'mime_type' },
    { pattern: /^(.*_)?(size|length|bytes|kb|mb|gb|filesize|file_size)(_.*)?$/i, type: 'file_size' }
];

// --- Analytics/Metrics Detection ---
export const ANALYTICS_PATTERNS = [
    { pattern: /^(.*_)?(pageview|page_view|view|impression|hit)s?(_.*)?$/i, type: 'pageview' },
    { pattern: /^(.*_)?(click|tap|interaction|engagement)s?(_.*)?$/i, type: 'interaction' },
    { pattern: /^(.*_)?(conversion|convert|goal|objective|outcome)(_.*)?$/i, type: 'conversion' },
    { pattern: /^(.*_)?(bounce|exit|abandon|drop)(_?)(rate)?(_.*)?$/i, type: 'bounce' },
    { pattern: /^(.*_)?(duration|time_spent|time_on|dwell|elapsed)(_.*)?$/i, type: 'duration' },
    { pattern: /^(.*_)?(referrer|referer|source|medium|campaign|channel|attribution)(_.*)?$/i, type: 'traffic_source' },
    { pattern: /^(.*_)?(utm_|gclid|fbclid|msclkid)(.*)$/i, type: 'campaign_tracking' },
    { pattern: /^(.*_)?(score|rating|rank|grade|weight|priority)(_.*)?$/i, type: 'score' }
];

// --- Organizational/HR Detection ---
export const ORGANIZATIONAL_PATTERNS = [
    { pattern: /^(.*_)?(company|organization|org|firm|business|enterprise|employer)(_?)(id|name|code)?(_.*)?$/i, type: 'organization' },
    { pattern: /^(.*_)?(department|dept|division|unit|team|group)(_?)(id|name|code)?(_.*)?$/i, type: 'department' },
    { pattern: /^(.*_)?(employee|staff|worker|contractor|personnel)(_?)(id|number|code)?(_.*)?$/i, type: 'employee_id' },
    { pattern: /^(.*_)?(manager|supervisor|lead|director|executive)(_?)(id|name)?(_.*)?$/i, type: 'manager' },
    { pattern: /^(.*_)?(role|position|title|job|designation|level|grade)(_.*)?$/i, type: 'job_role' },
    { pattern: /^(.*_)?(salary|wage|compensation|pay|earnings)(_.*)?$/i, type: 'compensation' }
];

// --- Communication/Social Detection ---
export const COMMUNICATION_PATTERNS = [
    { pattern: /^(.*_)?(message|msg|text|body|content|comment|reply|response)(_.*)?$/i, type: 'message' },
    { pattern: /^(.*_)?(subject|title|heading|headline|topic)(_.*)?$/i, type: 'subject' },
    { pattern: /^(.*_)?(sender|from|author|writer|poster|commenter)(_?)(id|name|email)?(_.*)?$/i, type: 'sender' },
    { pattern: /^(.*_)?(recipient|to|receiver|addressee)(_?)(id|name|email)?(_.*)?$/i, type: 'recipient' },
    { pattern: /^(.*_)?(thread|conversation|discussion|chat|channel)(_?)(id)?(_.*)?$/i, type: 'thread' },
    { pattern: /^(.*_)?(like|favorite|fav|star|upvote|downvote|reaction)s?(_.*)?$/i, type: 'reaction' },
    { pattern: /^(.*_)?(follow|follower|following|friend|connection|contact)s?(_.*)?$/i, type: 'social_connection' }
];
