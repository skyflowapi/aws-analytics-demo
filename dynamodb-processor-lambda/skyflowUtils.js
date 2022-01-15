const axios = require('axios');

async function addToVaultAndFetchTokenized(vaultURI, bearerHeader, vaultEntity, recordsToPersist) {
  
  const fetchURI = `${vaultURI}/${vaultEntity}`;

  const recordsArray = recordsToPersist.map(data => { return { "fields": data } });
  
  const body = {
    "quorum": false,
    "records": recordsArray,
    "tokenization": true
  };

  const headers = {
    'Authorization': bearerHeader,
    'Content-Type': 'application/json'
  };

  const response = await axios.post(fetchURI, body, { headers: headers });

  const jsonResp =  await response.data;
  const skyflowRecords = jsonResp.records.map(data => { return {...data.tokens, skyflow_id: data.skyflow_id } });

  return skyflowRecords;
}

module.exports = { addToVaultAndFetchTokenized }