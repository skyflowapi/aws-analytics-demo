const jwt = require('jsonwebtoken');
const fetch = require('node-fetch');

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
    body: bodyStr
  });
  
  const jsonResp =  await response.json();
  const skyflowRecords = jsonResp.records.map(data => { return {...data.tokens, skyflow_id: data.skyflow_id } });

  return skyflowRecords;
}

module.exports = { addToVaultAndFetchTokenized }