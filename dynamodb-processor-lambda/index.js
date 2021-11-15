const { Kafka } = require('kafkajs');
const getVaultRawCredential = require('./awsUtil');
const {
    getBaererFromRawCredentials,
    rawBearerToHeader,
    addToVaultAndFetchTokenized
} = require('./skyflowUtils');

const VAULT_URI = process.env.VAULT_URI;
const TOPIC_NAME = process.env.TOPIC_NAME;

function getBrokersArray() {
    
    if (!process.env.KAFKA_BROKERS) {
        return [''];
    }

    return process.env.KAFKA_BROKERS.split(';');
}

function transformData(data) {

    return {
        name: data.name['S'],
        street_address: data.street_address['S'],
        city: data.city['S'],
        state: data.state['S'],
        zip_code: data.zip_code['S']
    };
}

function getProducer() {

    const brokers = getBrokersArray();

    const kafka = new Kafka({
        clientId: 'SkyflowDemo',
        brokers: brokers,
        authenticationTimeout: 2500,
        retry: {
            retries: 2
        }
    });

    return kafka.producer();
}

exports.handler = async (event, context) => {

    const dataToTransform = [];

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

    const dataToEncode = dataToTransform.map(data => { return transformData(data) });

    const rawCredential = await getVaultRawCredential();
    const bearer = await getBaererFromRawCredentials(rawCredential);
    const header = rawBearerToHeader(bearer);
    const tokenizedValues = await addToVaultAndFetchTokenized(VAULT_URI, header, 'persons', dataToEncode);
    console.log(tokenizedValues);

    const producer = getProducer();

    try {
        await producer.connect();
    }
    catch (e) {
        console.log(`Failed to connect to brokers: ${e.message}`);
        return `Fail to connect to brokers.`;
    }

    const messagesToSend = tokenizedValues.map(data => { return  { value:  JSON.stringify(data) }});

    try {
        await producer.send({
            topic: TOPIC_NAME,
            messages: messagesToSend
        });

        await producer.disconnect();
    }
    catch (e) {
        console.log(`Failed to send messages: ${e.message}`);
        return `Fail to connect to send messages.`;
    }

    return `Successfully processed ${event.Records.length} records.`;
};
