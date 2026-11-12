const { DynamoDBClient, CreateTableCommand, DescribeTableCommand, ListTablesCommand } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');
const { S3Client, CreateBucketCommand, HeadBucketCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
require('dotenv').config();

const region = process.env.AWS_REGION || 'ap-south-1';
const credentials = {
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
};

const ddbClient = new DynamoDBClient({
  region,
  credentials,
});

const docClient = DynamoDBDocumentClient.from(ddbClient, {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});

const s3Client = new S3Client({
  region,
  credentials,
});

const USERS_TABLE = process.env.DYNAMODB_USERS_TABLE || 'MatrimonyUsers';
const PROFILES_TABLE = process.env.DYNAMODB_PROFILES_TABLE || 'MatrimonyProfiles';
const S3_BUCKET = process.env.S3_BUCKET_NAME || 'matrimony-user-uploads-ap-south-1';

/**
 * Auto-creates DynamoDB tables and S3 bucket if they don't exist yet
 */
async function initAwsInfrastructure() {
  try {
    console.log('[AWS] Checking DynamoDB tables...');
    const { TableNames = [] } = await ddbClient.send(new ListTablesCommand({}));

    // 1. Users Table
    if (!TableNames.includes(USERS_TABLE)) {
      console.log(`[AWS] Creating DynamoDB table: ${USERS_TABLE}...`);
      await ddbClient.send(
        new CreateTableCommand({
          TableName: USERS_TABLE,
          KeySchema: [{ AttributeName: 'id', KeyType: 'HASH' }],
          AttributeDefinitions: [
            { AttributeName: 'id', AttributeType: 'S' },
            { AttributeName: 'email', AttributeType: 'S' },
            { AttributeName: 'phone', AttributeType: 'S' },
          ],
          GlobalSecondaryIndexes: [
            {
              IndexName: 'email-index',
              KeySchema: [{ AttributeName: 'email', KeyType: 'HASH' }],
              Projection: { ProjectionType: 'ALL' },
              ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
            },
            {
              IndexName: 'phone-index',
              KeySchema: [{ AttributeName: 'phone', KeyType: 'HASH' }],
              Projection: { ProjectionType: 'ALL' },
              ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
            },
          ],
          ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
        })
      );
      console.log(`[AWS] Table ${USERS_TABLE} created successfully.`);
    } else {
      console.log(`[AWS] Table ${USERS_TABLE} already exists.`);
    }

    // 2. Profiles Table
    if (!TableNames.includes(PROFILES_TABLE)) {
      console.log(`[AWS] Creating DynamoDB table: ${PROFILES_TABLE}...`);
      await ddbClient.send(
        new CreateTableCommand({
          TableName: PROFILES_TABLE,
          KeySchema: [{ AttributeName: 'id', KeyType: 'HASH' }],
          AttributeDefinitions: [
            { AttributeName: 'id', AttributeType: 'S' },
            { AttributeName: 'userId', AttributeType: 'S' },
            { AttributeName: 'gender', AttributeType: 'S' },
          ],
          GlobalSecondaryIndexes: [
            {
              IndexName: 'userId-index',
              KeySchema: [{ AttributeName: 'userId', KeyType: 'HASH' }],
              Projection: { ProjectionType: 'ALL' },
              ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
            },
            {
              IndexName: 'gender-index',
              KeySchema: [{ AttributeName: 'gender', KeyType: 'HASH' }],
              Projection: { ProjectionType: 'ALL' },
              ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
            },
          ],
          ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
        })
      );
      console.log(`[AWS] Table ${PROFILES_TABLE} created successfully.`);
    } else {
      console.log(`[AWS] Table ${PROFILES_TABLE} already exists.`);
    }

    // 3. S3 Bucket
    console.log(`[AWS] Checking S3 bucket: ${S3_BUCKET}...`);
    try {
      await s3Client.send(new HeadBucketCommand({ Bucket: S3_BUCKET }));
      console.log(`[AWS] S3 bucket ${S3_BUCKET} exists and accessible.`);
    } catch (s3Err) {
      if (s3Err.name === 'NotFound' || s3Err.$metadata?.httpStatusCode === 404) {
        console.log(`[AWS] Creating S3 bucket ${S3_BUCKET} in ${region}...`);
        await s3Client.send(
          new CreateBucketCommand({
            Bucket: S3_BUCKET,
            CreateBucketConfiguration:
              region === 'us-east-1' ? undefined : { LocationConstraint: region },
          })
        );
        console.log(`[AWS] S3 bucket ${S3_BUCKET} created.`);
      } else {
        console.warn(`[AWS] S3 check warning: ${s3Err.message}`);
      }
    }
  } catch (err) {
    console.error('[AWS Infrastructure Error]', err.message);
  }
}

module.exports = {
  ddbClient,
  docClient,
  s3Client,
  USERS_TABLE,
  PROFILES_TABLE,
  S3_BUCKET,
  initAwsInfrastructure,
};

