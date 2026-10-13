import pg from 'pg';

const connectionString = process.env.RESTORE_URL || process.env.TAXICRM_DATABASE_URL || process.env.DATABASE_URL;
if (!connectionString) throw new Error('RESTORE_URL, TAXICRM_DATABASE_URL or DATABASE_URL is required');

const pool = new pg.Pool({
  connectionString,
  max: 1,
  connectionTimeoutMillis: 8000,
  ssl: connectionString.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
});

const bookingTables = [
  'Booking', 'BookingLocation', 'BookingVia', 'BookingTimelineEvent',
  'BookingSnapshot', 'WebhookEvent', 'BookingOrphanBackup_20261006',
  'BookingLocationOrphanBackup_20261006', 'BookingViaOrphanBackup_20261006',
  'BookingTimelineEventOrphanBackup_20261006', 'BookingSnapshotOrphanBackup_20261006',
  'AccountRevenueRule', 'CompanyDailyMetric',
];

const client = await pool.connect();
try {
  await client.query('BEGIN READ ONLY');
  await client.query("SET LOCAL statement_timeout = '120s'");
  const tables = (await client.query(`
    SELECT c.relname AS name, pg_total_relation_size(c.oid)::bigint AS bytes,
           c.reltuples::bigint AS estimated_rows
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
    ORDER BY c.relname
  `)).rows;
  const tableNames = new Set(tables.map(table => table.name));
  const exactRows = {};
  for (const name of bookingTables) {
    if (tableNames.has(name)) {
      // Names only come from the fixed list above, never from a request.
      exactRows[name] = Number((await client.query(`SELECT count(*)::bigint AS n FROM public."${name}"`)).rows[0].n);
    }
  }
  const financials = tableNames.has('Booking') ? (await client.query(`
    SELECT status, count(*)::bigint AS bookings,
           coalesce(sum(price), 0)::text AS price,
           coalesce(sum(cost), 0)::text AS cost,
           coalesce(sum(fare), 0)::text AS fare,
           coalesce(sum("accountAmount"), 0)::text AS account_amount,
           coalesce(sum("cashAmount"), 0)::text AS cash_amount,
           coalesce(sum("cardAmount"), 0)::text AS card_amount
    FROM public."Booking" GROUP BY status ORDER BY status
  `)).rows.map(row => ({...row, bookings: Number(row.bookings)})) : [];
  const eventState = tableNames.has('WebhookEvent') ? (await client.query(`
    SELECT status::text, count(*)::bigint AS events,
           max("receivedAt") AS latest_received_at
    FROM public."WebhookEvent" GROUP BY status ORDER BY status
  `)).rows.map(row => ({...row, events: Number(row.events)})) : [];
  const references = (await client.query(`
    SELECT c.conrelid::regclass::text AS dependent_table,
           c.confrelid::regclass::text AS referenced_table
    FROM pg_constraint c WHERE c.contype = 'f'
      AND c.confrelid IN (to_regclass('public."Booking"'), to_regclass('public."WebhookEvent"'))
    ORDER BY dependent_table, referenced_table
  `)).rows;
  const result = {
    checkedAt: new Date().toISOString(),
    database: (await client.query('SELECT current_database() AS name')).rows[0].name,
    role: (await client.query('SELECT current_user AS name')).rows[0].name,
    exactRows,
    bookingFinancialsByStatus: financials,
    webhookEventsByState: eventState,
    bookingForeignKeys: references,
    allTables: tables.map(row => ({name: row.name, bytes: Number(row.bytes), estimatedRows: Number(row.estimated_rows)})),
  };
  await client.query('COMMIT');
  console.log(JSON.stringify(result));
} catch (error) {
  await client.query('ROLLBACK').catch(() => undefined);
  console.error('Operational inventory failed:', error instanceof Error ? error.message : 'Unknown error');
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
