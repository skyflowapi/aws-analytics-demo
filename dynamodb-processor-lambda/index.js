const {Kafka} = require('kafkajs');
const {addToVaultAndFetchTokenized, getVaultBearerToken} = require('./skyflowUtils');

const VAULT_URI = process.env.VAULT_URI;
const TOPIC_NAME = process.env.TOPIC_NAME;

/**
 * Splits the defined Kafka brokers into an array.
 * @return Array of Kafka brokers.
 */
function getBrokersArray() {
  if (!process.env.KAFKA_BROKERS) {
    return [''];
  }

  return process.env.KAFKA_BROKERS.split(';');
}

/**
 * Converts the MongoDB data into an object to stored in the Skyflow vault.
 * @param {object} data Record from MongoDB.
 * @return Flattened object structure of a single record.
 */
function transformData(data) {
  return {
    name: data.name['S'],
    street_address: data.street_address['S'],
    city: data.city['S'],
    state: data.state['S'],
    zip_code: data.zip_code['S'],
  };
}

/**
 * Creates and returns a Kafka producer.
 * @return A Kafka producer.
 */
function getProducer() {
  const brokers = getBrokersArray();

  const kafka = new Kafka({
    clientId: 'SkyflowDemo',
    brokers: brokers,
    authenticationTimeout: 2500,
    retry: {
      retries: 2,
    },
  });

  return kafka.producer();
}

/**
 * Lambda function for taking new MongoDB records and storing them in the Skyflow vault and writing
 * the tokenized values to Kafka.
 * @param {object} event Object describing the type of event that triggered the Lambda.
 * @param {object} context Object containing information about the
 * invocation, function, and execution environment.
 * @return String describing the result of the function execution.
 */
exports.handler = async (event, context) => {
  const dataToTransform = [];

  // Adds any new records to the dataToTransform array
  for (const record of event.Records) {
    console.log(record.eventID);
    if (record.eventName !== 'INSERT') {
      continue;
    }

    console.log(record.eventName);
    dataToTransform.push(record.dynamodb.NewImage);
  }

  if (dataToTransform.length === 0) {
    return 'No data to insert.';
  }

  // Converts object structure into a format for the Skyflow vault.
  const dataToEncode = dataToTransform.map((data) => {
    return transformData(data);
  });

  const bearer = await getVaultBearerToken();
  const header = `Bearer ${bearer}`;

  // Save sensitive data to the Skyflow vault.
  const tokenizedValues = await addToVaultAndFetchTokenized(VAULT_URI, header,
      'persons', dataToEncode);
  console.log(tokenizedValues);

  const producer = getProducer();
  try {
    await producer.connect();
  } catch (e) {
    console.log(`Failed to connect to brokers: ${e.message}`);
    return `Fail to connect to brokers.`;
  }

  // Convert tokenized values of the sensitive data into messages for Kafka.
  const messagesToSend = tokenizedValues.map((data) => {
    return {value: JSON.stringify(data)};
  });

  try {
    // Write messages to the Kafka topic.
    await producer.send({
      topic: TOPIC_NAME,
      messages: messagesToSend,
    });

    await producer.disconnect();
  } catch (e) {
    console.log(`Failed to send messages: ${e.message}`);
    return `Fail to connect to send messages.`;
  }

  return `Successfully processed ${event.Records.length} records.`;
};
