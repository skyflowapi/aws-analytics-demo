const AWS = require('aws-sdk');
const jwt = require('jsonwebtoken');
const axios = require('axios');

const {
    REGION,
    SECRET_NAME,
    SECRET_KEY
} = require('./config');

async function getVaultBearerToken() {
    // Create a Secrets Manager client
    const client = new AWS.SecretsManager({ region: REGION });

    const data = await client.getSecretValue({ SecretId: SECRET_NAME }).promise();
    console.log('raw secret data: ' + data.SecretString);
    const rawCredential = JSON.parse(data.SecretString);

    // Return the bearer token needed for Skyflow API calls
    return await getBearerFromRawCredentials(rawCredential[SECRET_KEY]);
}

function getSignedJWT(rawCredentials) {
  const creds = JSON.parse(rawCredentials);

  const claims = {
    iss: creds["clientID"],
    key: creds["keyID"], 
    aud: creds["tokenURI"], 
    exp: Math.floor(Date.now() / 1000) + (60 * 60), //JWT expires in Now + 60 minutes
    sub: creds["clientID"]
  };

  const signedJWT = jwt.sign(claims, creds["privateKey"], { algorithm: 'RS256' });

  return { signedJWT, creds };
}

async function getBearerToken(signedJWT, creds) {
  const body = {
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion: signedJWT
  }

  const headers = {
    'Accept': 'application/json',
    'Content-Type': 'application/json'
  };

  const tokenURI = creds["tokenURI"];
  const response = await axios.post(tokenURI, body, { headers: headers });

  return await response.data.accessToken;
}

async function getBearerFromRawCredentials(rawCredential) {
  const { signedJWT, creds } = getSignedJWT(rawCredential);
  const bearer = await getBearerToken(signedJWT, creds);

  return bearer;
}

module.exports = getVaultBearerToken;