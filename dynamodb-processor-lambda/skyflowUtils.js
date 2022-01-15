const AWS = require('aws-sdk');
const jwt = require('jsonwebtoken');
const axios = require('axios');

const {
  REGION,
  SECRET_NAME,
  SECRET_KEY,
} = require('./config');

/**
 * Gets the service account key from the AWS Secrets Manager and generates an auth bearer token.
 * @return An auth bearer token for making Skyflow API calls.
 */
async function getVaultBearerToken() {
  // Create a Secrets Manager client
  const client = new AWS.SecretsManager({region: REGION});
  const data = await client.getSecretValue({SecretId: SECRET_NAME}).promise();
  const rawCredential = JSON.parse(data.SecretString);

  // Return the bearer token needed for Skyflow API calls
  return await getBearerFromRawCredentials(rawCredential[SECRET_KEY]);
}

/**
 * Parses the raw service account key file to generate a signed JWT.
 * @param {string} rawCredentials Service account key JSON as a string.
 * @return Signed JWT and credentials object.
 */
function getSignedJWT(rawCredentials) {
  const creds = JSON.parse(rawCredentials);

  const claims = {
    iss: creds['clientID'],
    key: creds['keyID'],
    aud: creds['tokenURI'],
    exp: Math.floor(Date.now() / 1000) + (60 * 60), // JWT expires in Now + 60 minutes
    sub: creds['clientID'],
  };

  const signedJWT = jwt.sign(claims, creds['privateKey'], {algorithm: 'RS256'});

  return {signedJWT, creds};
}

/**
 * Creates an auth bearer token using the signed JWT and the tokenURI.
 * @param {object} signedJWT Signed JWT object.
 * @param {object} creds Service account key JSON object.
 * @return Auth bearer token.
 */
async function getBearerToken(signedJWT, creds) {
  const body = {
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion: signedJWT,
  };

  const headers = {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
  };

  const tokenURI = creds['tokenURI'];
  const response = await axios.post(tokenURI, body, {headers: headers});

  return await response.data.accessToken;
}

/**
 * Uses the raw service account key to create an auth bearer token.
 * @param {string} rawCredential The service account key contents as a string.
 * @return An auth bearer token for making Skyflow API calls.
 */
async function getBearerFromRawCredentials(rawCredential) {
  const {signedJWT, creds} = getSignedJWT(rawCredential);
  const bearer = await getBearerToken(signedJWT, creds);

  return bearer;
}

/**
 * Adds records to the vault and return the result of the insertion.
 * @param {string} vaultURI
 * @param {string} bearerHeader
 * @param {string} vaultEntity
 * @param {array} recordsToPersist
 * @return Newly inserted records with skyflow_ids and tokenized data.
 */
async function addToVaultAndFetchTokenized(vaultURI, bearerHeader, vaultEntity, recordsToPersist) {
  const postURI = `${vaultURI}/${vaultEntity}`;

  // Convert records into the format the Skyflow API expects
  const recordsArray = recordsToPersist.map((data) => {
    return {fields: data};
  });

  const body = {
    quorum: false,
    records: recordsArray,
    tokenization: true,
  };

  const headers = {
    'Authorization': bearerHeader,
    'Content-Type': 'application/json',
  };

  // Insert records into the Skyflow vault
  const response = await axios.post(postURI, body, {headers: headers});
  const jsonResp = await response.data;

  // Convert response data into flattened array format
  const skyflowRecords = jsonResp.records.map((data) => {
    return {...data.tokens, skyflow_id: data.skyflow_id};
  });

  return skyflowRecords;
}

module.exports = {addToVaultAndFetchTokenized, getVaultBearerToken};
