import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as kinesis from "aws-cdk-lib/aws-kinesis";
import * as iam from "aws-cdk-lib/aws-iam";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as firehose from "aws-cdk-lib/aws-kinesisfirehose";

export class HelloCdkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // The code that defines your stack goes here

    // example resource
    // const queue = new sqs.Queue(this, 'HelloCdkQueue', {
    //   visibilityTimeout: cdk.Duration.seconds(300)
    // });

    // Create a VPC with one public subnet
    const vpc = new ec2.Vpc(this, "MyVpc", {
      maxAzs: 2,
      subnetConfiguration: [
        {
          name: "Public",
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24,
        },
      ],
    });

    // Create an IAM Role for the EC2 instance
    const instanceRole = new iam.Role(this, "InstanceRole", {
      assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
    });

    const ami_instance = new ec2.GenericLinuxImage({
      "ap-southeast-1": "ami-0bd55ebedabddc3c0",
    });
    // Create an EC2 instance in the public subnet
    const ec2instance = new ec2.Instance(this, "MyEc2Instance", {
      instanceType: new ec2.InstanceType("t2.micro"),
      // machineImage: "ami-0df8c184d5f6ae949",
      machineImage: ami_instance,
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      role: instanceRole,
    });

    const stream = new kinesis.Stream(this, "Iot_Data_Stream", {
      streamName: "iot-data-stream",
      shardCount: 1,
    });

    // Grant the role permissions to put records to the Kinesis stream
    instanceRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["kinesis:PutRecord"],
        resources: [stream.streamArn],
      }),
    );

    // stream.grantReadWrite(instanceRole);

    const bucket = new s3.Bucket(
      this,
      "iot_streaming_data_sink_practice_bucket",
    );

    // Create IAM Role for Firehose
    const firehoseRole = new iam.Role(this, "FirehoseRole", {
      assumedBy: new iam.ServicePrincipal("firehose.amazonaws.com"),
    });

    // Grant S3 PutObject permissions to the Firehose Role
    bucket.grantPut(firehoseRole);

    const data_firehose = new firehose.CfnDeliveryStream(this, "iot_firehose", {
      deliveryStreamName: "iot_firehose", // Unique name for your delivery stream
      s3DestinationConfiguration: {
        bucketArn: bucket.bucketArn,
        roleArn: firehoseRole.roleArn, // Replace with the ARN of your Firehose role
        bufferingHints: {
          intervalInSeconds: 60, // Buffer for 60 seconds
          sizeInMBs: 5, // Buffer up to 5 MB
        },
        compressionFormat: "GZIP",
        prefix: "iot_data/", // Optional prefix for S3 objects
      },
      kinesisStreamSourceConfiguration: {
        kinesisStreamArn: stream.streamArn,
        roleArn: firehoseRole.roleArn, // Replace with the ARN of your Firehose role
      },
    });
  }
}
