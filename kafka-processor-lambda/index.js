const {Pool} = require('pg');
const getDBCredentials = require('./awsUtil');

const DB_NAME = process.env.DB_NAME;

/**
 * Creates database connection pool.
 * @returns The database connection pool object.
 */
async function getPool() {
  const dbCredentials = await getDBCredentials();

  const pool = new Pool({
    user: dbCredentials.username,
    host: dbCredentials.host,
    database: DB_NAME,
    password: dbCredentials.password,
    port: dbCredentials.port,
  });

  return pool;
}

/**
 * Inserts all records into Redshift.
 * @param {object} records Records from Kafka event log.
 */
async function persistRecordsInRedshift(records) {
  const pool = await getPool();

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const record of records) {
      const queryText = 'INSERT INTO persons(skyflow_id, name, street_address, state, city, zip_code) ' +
                              'VALUES($1, $2, $3, $4, $5, $6)';
      await client.query(queryText, [record.skyflow_id,
        record.name,
        record.street_address,
        record.state,
        record.city,
        record.zip_code]);
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    console.log(`Error persisting records in Redshift: ${e.message}`);
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Lambda function for processing records that have been written to Kafka and persists them to the
 * Redshift data warehouse.
 * @param {object} event Object describing the type of event that triggered the Lambda.
 * @param {object} context Object containing information about the
 * invocation, function, and execution environment.
 * @return String describing the result of the function execution.
 */
exports.handler = async (event) => {
  if (event.records.length === 0) {
    return `No records to persist.`;
  }

  const recordsToPersist = [];

  // Loop through all records in the stream
  for (const key in event.records) {
    // Iterate through records
    event.records[key].map((record) => {
      // Decode base64
      const msg = Buffer.from(record.value, 'base64').toString();
      recordsToPersist.push(JSON.parse(msg));
    });
  }

  console.log('Persisting records:');
  console.log(JSON.stringify(recordsToPersist));

  // Save all records to Redshift
  await persistRecordsInRedshift(recordsToPersist);

  return `Successfully processed ${recordsToPersist.length} records.`;
};
