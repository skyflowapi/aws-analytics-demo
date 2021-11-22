const { Kafka } = require('kafkajs');
const { TOPIC_NAME } = require('./config');

function getBrokersArray() {
    
    if (!process.env.KAFKA_BROKERS) {
        return [''];
    }

    return process.env.KAFKA_BROKERS.split(';');
}

exports.handler = async (event, context) => {

    const brokers = getBrokersArray();

    const kafka = new Kafka({
        clientId: 'SkyflowDemo',
        brokers: brokers,
        authenticationTimeout: 2500,
        retry: {
            retries: 2
        }
    });

    const admin = kafka.admin();

    await admin.connect();
    
    await admin.createTopics({ topics: [{
        topic: TOPIC_NAME,
        replicationFactor: 2
    }]});
    
    await admin.disconnect();

    return `Created topic ${TOPIC_NAME}.`
}