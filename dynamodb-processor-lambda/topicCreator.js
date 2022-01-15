const {Kafka} = require('kafkajs');
const {TOPIC_NAME} = require('./config');

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
 * Lambda function for create a Kafka topic. This only needs to run once during setup.
 * @param {object} event Object describing the type of event that triggered the Lambda.
 * @param {object} context Object containing information about the
 * invocation, function, and execution environment.
 * @return String describing the result of the function execution.
 */
exports.handler = async (event, context) => {
  const brokers = getBrokersArray();

  const kafka = new Kafka({
    clientId: 'SkyflowDemo',
    brokers: brokers,
    authenticationTimeout: 2500,
    retry: {
      retries: 2,
    },
  });

  const admin = kafka.admin();
  await admin.connect();

  await admin.createTopics({
    topics: [{
      topic: TOPIC_NAME,
      replicationFactor: 2,
    }],
  });

  await admin.disconnect();

  return `Created topic ${TOPIC_NAME}.`;
};
