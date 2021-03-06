# AWS Analytics Pipeline Sample Application

This sample application provides a template that shows how to integrate Skyflow's vault API with a data ingestion platform hosted on AWS. You can use a similar approach to preserve privacy while ingesting data in your own analytics pipeline.

The project consists of an AWS CloudFormation template and two serverless AWS Lambda projects.

The CloudFormation template creates the basic infrastructure in AWS, as follows:
* A VPC
* A public subnet
* Two private subnets
* Two Kafka brokers
* A Redshift single node cluster
* A DynamoDB table
* The network-relevant security groups

The two serverless Lambda projects contain Lambda functions to process the data. The first project gets notified when data is added to DynamoDB, then it persists this data to Skyflow's vault before pushing the tokenized version to a topic in Kafka. The second Lambda project receives the data from Kafka and persists it to Redshift.

![Architecture overview](docs/img/AnalyticsArchitectureDiagram.png)

The rest of this README describes how to set up and test this sample application.

## Prerequisites

* A [Skyflow account](https://www.skyflow.com/try-skyflow) with permissions to create a vault.
* Node.js and the [Serverless](https://www.serverless.com/) framework installed globally.
* An AWS account with sufficient permissions to create the required resources (VPC, Subnets, Kafka brokers, etc.).

## Create an AWS CloudFormation Stack

You can create a new AWS CloudFormation stack and associated resources as follows:

**1.** In the AWS CloudFormation UI, choose **Create a new stack (with new resources)**.

Choose **Upload a template file**, select the `AWSCloudFormation.yaml` file, enter a name for your stack, and then fill in the following parameters:

- **DynamoDBTableName**: A name for the DynamoDB table that will hold the data and trigger the Lambda functions when data is added (e.g. analytics-table)
- **EnvironmentName**: Name of the environment that will be used when naming the resources (such as VPC subnets etc.) (e.g. test, development, production)
- **KafkaClusterName**: Resource name for the Kafka cluster (e.g., kafka-dev-cluster)
- **RedshiftAdminUsername**: Admin username for Redshift (e.g., admin)
- **RedshiftClusterName**: Resource name for the Redshift cluster (e.g., redshift-dev-cluster)
- **RedshiftDBName**: Name of the default database created in Redshift (e.g. dev)
- **RedshiftPassword**: Master password for the Redshift admin user

Wait for a few minutes while AWS CloudFormation creates all of these resources.

Take note of the following, as you will need this information later:
- The parameters entered in the CloudFormation stack
- Kafka endpoints (go to AWS MSK and check the Kafka cluster created with the provided name)
- Kafka cluster ARN
- Redshift cluster endpoint (go to AWS Redshift and check the Redshift cluster created with the provided name)
- Private subnets IDs
- DynamoDB table stream ARN (in the console go to the DynamoDB table -> exports and stream tab, and get the stream ARN from the DynamoDB stream details box)
- KafkaClient security group ID (`KafkaClientSG`)
- RedshiftClient security group ID (`RedshiftClientSG`)

**2.** Create a Redshift table. In the console, choose the Redshift cluster that was created, and use the query editing tool. After connecting to the cluster, run the following script to create a table:
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

## Create a Skyflow Data Privacy Vault

[Create a Skyflow vault](https://docs.skyflow.com/developer-portal/getting-started/creating-a-custom-vault/) with the following table name and schema so you can run the sample code. If you need a different structure, adjust the sample code accordingly.

![Vault schema](docs/img/vaultstructure.png)

In Skyflow Studio, click **Create Vault** -> **Upload Vault Schema** and then select the `vaultSchema.json` file provided in this repository.

## Set Up the Lambda Functions

First, make sure that you have a Serverless framework installed, since both Lambda projects require it for packaging and deployment.
```
npm install -g serverless
```
For the Lambda functions to work, you'll also need to install and configure the [AWS CLI](https://docs.aws.amazon.com/polly/latest/dg/setup-aws-cli.html) with credentials and options.

### DynamoDB Processor Lambda

Before setting up the DynamoDB Processor Lambda function, first [create and download](https://docs.skyflow.com/developer-portal/getting-started/api-authentication/) a service account key for your Skyflow vault.

After downloading the service account key, navigate to the [AWS Secrets Manager](https://aws.amazon.com/secrets-manager/getting-started/) in the AWS management console and create a new secret for storing your vault service account key.

![Secret Settings](docs/img/AwsSecretSettings.png)

When creating the secret, choose **Other type of secret**. In the **Key** field, enter the key name (e.g., `raw-credential`). In the **Secret vault** field, paste the contents of the downloaded vault service account key file. Click **Next** and then set the **Secret name**.

![Secret Name](docs/img/AwsSecretName.png)

You will need the secret key and secret name when setting the configuration parameters for the lambda function.

Go to the `dynamodb-processor-lambda` folder and install the dependencies, as follows:
```
npm i
```

Edit the `serverless.yml` file and replace the variables according to the resources generated by the CloudFormation script. The security group ID has to be the one for the KafkaClientSG security group, and the subnet IDs have to be the ones for the private subnets.

Replace the ARNs in the event configuration and policies in the `serverless.yaml` file with the ARNs of the resources generated by the CloudFormation script. Also, set the name of the topic in the environment variables to configure the topic where the data will be pushed to.

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

Next, set the vault URI environment variable, coupled with the secret manager secret name and the key where the vault credentials are stored, as follows:
```
environment:
    SECRET_NAME: <Secrets manager secret name>
    SECRET_KEY: <Key inside the secret where the credentials were stored>
    VAULT_URI: <URI of the vault>
    KAFKA_BROKERS: <List separated by ';' of Kafka brokers end point, with port number i.e xxx.kafa1.aws:9092;xxx.kafa2.aws:9092>
    TOPIC_NAME: <Name of the topic where data will be pushed>
```

The `SECRET_KEY` is the key you set when creating the secret in the AWS Secrets Manager to store your vault's service account key. The `SECRET_NAME` is the name of the secret.

After the variables are set, use the deploy command to build, upload the code, and create a stack for the Lambda function, as follows:
```
serverless deploy --stage dev
```

The stage option is optional and helps organize the stacks (the parameter goes in the naming).

Once the Lambdas are deployed, go to the functions list in the console and look for the `dynamodb-stream-ENVNAME-topic-creator` (where `ENVNAME` is the name set in the --stage parameter) function, and trigger it manually. It's  a convenience function to create the topic in Kafka. You don't need to use this function after running it once to create the topic in Kafka.

The DynamoDB stream processing should be ready.

### Kafka Processor Lambda

The second Lambda function gets data from the topic and persists it to Redshift.

The setup method is similar to the DynamoDB processor function. First go to the `kafka-processor-lambda` folder and run `npm i`, as in the first case, to install the node dependencies.

Create a Redshift credential entry in the Secrets Manager and use the name to set the `SECRET_NAME` environment variable.

Then edit the `serverless.yml` file with the relevant values, as follows:
```
environment:
    SECRET_NAME: <Redshift credential name in Secrets Manager>
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

After the names are set up, deploy the Lambda as follows:
```
serverless deploy --stage dev
```

## Test the Pipeline

To test if the stream is working and data is being pushed, go to the **DynamoDB** section in AWS (or create your own application if you prefer), and add an item with the following structure:

```json
{
    "name": { "S": "John Doe A" },
    "city": { "S": "Chicago" },
    "state": { "S": "IL" },
    "street_address": { "S": "Street 1" },
    "zip_code": { "S": "12345" }
}

```

Now that this sample application is configured, you can verify that the data is persisted in the vault, and tokenized data is stored in Redshift.

|Learn More|
|----------|
|To learn more about this project, check out this post on the Skyflow blog: [De-identifying Analytics Data: An AWS Sample Application](https://www.skyflow.com/post/de-identifying-analytics-data-an-aws-sample-application)|
