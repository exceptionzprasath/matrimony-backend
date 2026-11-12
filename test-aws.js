require('dotenv').config();
const { ddbClient, s3Client, USERS_TABLE, PROFILES_TABLE, S3_BUCKET, initAwsInfrastructure } = require('./config/aws');
const { ListTablesCommand } = require('@aws-sdk/client-dynamodb');
const { ListBucketsCommand } = require('@aws-sdk/client-s3');

async function test() {
  console.log('--- Testing AWS Credentials ---');
  console.log('Region:', process.env.AWS_REGION);
  console.log('Access Key ID:', process.env.AWS_ACCESS_KEY_ID?.substring(0, 8) + '...');

  try {
    console.log('\n[1/3] Connecting to AWS DynamoDB (ListTables)...');
    const ddbRes = await ddbClient.send(new ListTablesCommand({}));
    console.log('✅ DynamoDB Connected! Existing tables:', ddbRes.TableNames);

    console.log('\n[2/3] Connecting to AWS S3 (ListBuckets)...');
    const s3Res = await s3Client.send(new ListBucketsCommand({}));
    console.log('✅ S3 Connected! Existing buckets:', s3Res.Buckets?.map(b => b.Name));

    console.log('\n[3/3] Initializing Matrimony Infrastructure (Tables & Bucket)...');
    await initAwsInfrastructure();
    console.log('\n🎉 ALL AWS TESTS PASSED SUCCESSFULLY!');
  } catch (err) {
    console.error('❌ AWS Connection Error:', err.message);
  }
}

test();

