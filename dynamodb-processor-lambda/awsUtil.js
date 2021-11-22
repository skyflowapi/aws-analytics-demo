const AWS = require('aws-sdk');
const {
    REGION,
    SECRET_NAME,
    SECRET_KEY
} = require('./config');

async function getVaultBearerToken() {

    // Create a Secrets Manager client
    const client = new AWS.SecretsManager({ region: REGION });

    const data = await client.getSecretValue({ SecretId: SECRET_NAME }).promise();
    const jsonData = JSON.parse(data.SecretString);
    
    return jsonData[SECRET_KEY];
}

module.exports = getVaultBearerToken;