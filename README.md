# AWS Analytics Demo

This demo provides a template to ilustrate the integration of Skyflow's vault API and a data ingestion platform hosted on AWS.

The project is composed by a cloudformation template, and 2 serverless lambda projects.

The cloudformation template creates the basic infra structure in AWS, with a VPC, 1 public subnet, 2 private subnets, 2 Kafka brokers, 1 Redshift single node cluster, a DynamoDB table and the network relevant security groups.

The 2 serverless lambda projects contains lambda functions to process the data. The first one gets notification when data is added to DynamoDB, then it persists this data to Skyflow's vault and then pushes the tokenized version to a Topic in Kafka. The second lambda, receives the data from Kafka and persists it to Redshift.

![Architecture overlook](docs/img/AnalyticsArchitectureDiagram.png)

The following sections will describe how to setup the project.

## AWS Cloudformation

Go to AWS Cloudformation and choose create a new stack (with new resources).

Give the stack a name and fill the following parameters:

- EnvironmentName: Name of the environment that will be used in naming the resources (such as VPC subnets etc.)

- DynamoDBTableName: A name for the DynamoDB table that will hold the data and trigger the lambda functions when data is added.

- KafkaClusterName: Name to be used as resource name for the Kafka cluster.

- RedshiftClusterName: Resource name for the Redshift cluster.

- RedshiftDBName: Name of the default database created in Redshift.

- RedshiftAdminUsername: Name of the admin user name for Redshift.

- RedshiftPassword: Master password for Redshift admin user.

Wait for some minutes until all the resources are created.

Take notes of the following:
- Kafka endpoints
- Kafka cluster ARN
- Redshift cluster endpoint
- Private subnets id's
- DynamoDB table stream ARN (in the console go to the DynamoDB table -> exports and stream tab, and get the stream ARN in the DynamoDB stream details box)
- KafkaClient security group id (KafkaClientSG)
- RedshiftClient security group id (RedshiftClientSG)

Create Redshift table: In the console, go select the Redshift cluster that was created, and use the query editing tool. When connected issue the following create table script.
```
create table persons (
  skyflow_id VARCHAR(256) NOT NULL,
  name VARCHAR(256) NOT NULL,
  street_address VARCHAR(256) NOT NULL,
  state VARCHAR(256) NOT NULL,
  city VARCHAR(256) NOT NULL,
  zip_code VARCHAR(256) NOT NULL,
  CONSTRAINT pk_persons PRIMARY KEY (skyflow_id)
);
```

## Skyflow vault

Create a Skyflow vault with the following table name and schema, to be able to run this demo code. If you need a different structure, adjust the code accordingly.

![Vault schema](docs/img/vaultstructure.png)


## Setting up the Lambda Functions

First, make sure that you have serverless framework installed, since both lambda projects are based on it to packaging and deployment.
```
npm install -g serverless
```
In order for it to work, you'll also need AWS CLI installed and configured (with credential and options).

### DynamoDB Processor Lambda

Go to the dynamodb-processor-lambda folder and install the dependencies.
```
npm i
```

Edit the serverless.yml file and replace the variables according to the resources generated by the cloudformation script. The security group id, has to be the one for the KafkaClientSG security group, and the subnet id's the ones of the private subnets.

In the event configuration and the policies in the serverless.yaml file, replace the arns, with the arns of the resources generated by the cloudformation script. Also set the name of the topic in the enviroment variables, this is the topic where the data will be pushed to. 

Example:
```
events:
    - stream: arn:aws:dynamodb:us-east-2:XXXXXXXX:table/analytics-test-table/stream/2021-11-12T13:33:32.698
 
 ...
 ...

- Effect: Allow
  Action:
    - kafka-cluster:*Topic*
    - kafka-cluster:WriteData
    - kafka-cluster:ReadData
  Resource:
    - arn:aws:kafka:us-east-2:XXXXXXXX:topic/kafka-test-cluster/*
```

Also set the vault URI enviroment variable, coupled with the secret manager secret name and the key where the vault crendentials were stored.
```
environment:
    SECRET_NAME: <Secrets manager secret name>
    SECRET_KEY: <Key inside the secret where the crendentials were stored>
    VAULT_URI: <URI of the vault>
    KAFKA_BROKERS: <List separated by ';' of Kafka brokers end point, with port number i.e xxx.kafa1.aws:9092;xxx.kafa2.aws:9092>
    TOPIC_NAME: <Name of the topic where data will be pushed>

```

Once the variables are set, use the deploy command to build, upload the code, and create a stack for the lambda function.
```
serverless deploy --stage dev
```

The stage option is optional and helps organize the stacks (the parameter go in the naming).

Once the Lambdas are deployed, go to the functions list in the console and look for the dynamodb-stream-envname-topic-creator function, and trigger it manually. It's just a convenience function to create the topic in Kafka, without the need of further configurations.

With all that done, the DynamoDB stream processing side should be done.

### Kafka Processor Lambda

The second lambda function does the part of getting data from the topic and persist it to Redshift.

The setup method is similar to the DynamoDB processor function. First go to the kafka-processor-lambda folder and run 'npm i', as in the first case, to install the node dependencies.

Create a Redshift credential entry in the Secrets Manager and use the name to set in the environment variable.

Then edit the serverless.yml file with the relevant values.
```
environment:
    SECRET_NAME: <Redshift crendetial name in Secrets Manager>
    DB_NAME: dev

...
...

functions:
    vpc:
      securityGroupIds:
        - <Security group id for RedshiftClientSG>
        - <Security group id for KafkaClientSG>
      subnetIds:
        - Private subnet 1 Id
        - Private subnet 2 Id
```

Once the names are setup, deploy the lambda:
```
serverless deploy --stage dev
```

## Testing the pipeline

To be able to test if the stream is working and data is being pushed, go to the DynamoDB section in AWS (or create your own application if you prefer), and add a item with the following structure:

```json
{
    "name": { "S": "John Doe A" },
    "city": { "S": "Chicago" },
    "state": { "S": "IL" },
    "street_address": { "S": "Street 1" },
    "zip_code": { "S": "12345" }
}

```

Verify that the data is persisted in the vault, and the tokenized version is in Redshift.