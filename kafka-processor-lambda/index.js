const { Pool } = require('pg');
const getDBCredentials = require('./awsUtil');

const DB_NAME = process.env.DB_NAME;

async function getPool() {

    const dbCredentials = await getDBCredentials();

    const pool = new Pool({
        user: dbCredentials.username,
        host: dbCredentials.host,
        database: DB_NAME,
        password: dbCredentials.password,
        port: dbCredentials.port
    });

    return pool;
}


async function persistRecordsInRedshift(records) {
    
    const pool = await getPool();

    const client = await pool.connect()
    try {

        await client.query('BEGIN');

        for (let record of records) {
            const queryText = 'INSERT INTO persons(skyflow_id, name, street_address, state, city, zip_code ) ' +
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
      client.release()
    }
}

exports.handler = async (event) => {

    if (event.records.length === 0) {
        return `No records to persist.`;
    }
    
    const recordsToPersist = [];

    for (let key in event.records) {
        // Iterate through records
        event.records[key].map((record) => {
            // Decode base64
            const msg = Buffer.from(record.value, 'base64').toString();
            recordsToPersist.push(JSON.parse(msg));
        });
    }
    
    console.log('Persisting records:');
    console.log(JSON.stringify(recordsToPersist));

    await persistRecordsInRedshift(recordsToPersist);

    return `Successfully processed ${recordsToPersist.length} records.`;
};
