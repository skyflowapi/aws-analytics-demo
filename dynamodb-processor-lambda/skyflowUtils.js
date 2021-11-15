const jwt = require('jsonwebtoken');
const fetch = require('node-fetch');

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
  
    const tokenURI = creds["tokenURI"];
  
    const response = await fetch(tokenURI, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body) });
  
    return await response.text();
}

async function getBaererFromRawCredentials(rawCredential) {

    const { signedJWT, creds } = getSignedJWT(rawCredential);
    const bearer = await getBearerToken(signedJWT, creds);
    
    return bearer;
}

function rawBearerToHeader(rawBearer) {
    const cred = JSON.parse(rawBearer);
    return `Bearer ${cred['accessToken']}`;
}

async function addToVaultAndFetchTokenized(vaultURI, bearerHeader, vaultEntity, recordsToPersist) {
  
  const fetchURI = `${vaultURI}/${vaultEntity}`;

  const recordsArray = recordsToPersist.map(data => { return { "fields": data } });
  
  const body = {
    "quorum": false,
    "records": recordsArray,
    "tokenization": true
  };

  const bodyStr = JSON.stringify(body);

  const headers = {
    'Authorization': bearerHeader,
    'Content-Type': 'application/json'
  };

  const response = await fetch(fetchURI, {
    method: 'POST',
    headers: headers,
    body: bodyStr });
  
  const jsonResp =  await response.json();
  const skyflowRecords = jsonResp.records.map(data => { return {...data.tokens, skyflow_id: data.skyflow_id } });

  return skyflowRecords;
}

module.exports = {
    getBaererFromRawCredentials,
    rawBearerToHeader,
    addToVaultAndFetchTokenized
}