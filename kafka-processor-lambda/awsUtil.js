const AWS = require('aws-sdk');

const region = process.env.REGION;
const secretName = process.env.SECRET_NAME;

async function getDBCredentials() {

    // Create a Secrets Manager client
    const client = new AWS.SecretsManager({ region: region });

    const data = await client.getSecretValue({ SecretId: secretName }).promise();
    const jsonData = JSON.parse(data.SecretString);
    
    return jsonData;
}

module.exports = getDBCredentials;