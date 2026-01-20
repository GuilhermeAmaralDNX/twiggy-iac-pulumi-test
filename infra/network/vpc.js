const aws = require("@pulumi/aws");

async function CreateVPC(configuration) {

    let tagsValues = new Object();
    tagsValues['Name'] = `${configuration.account}-VPC`;
    tagsValues['EnvName'] = configuration.account;

    for (const eks of configuration.eksClusters) {
        tagsValues[`kubernetes.io/cluster/${eks}`] = 'shared';
    }

    const vpc = await new aws.ec2.Vpc(`vpc-${configuration.account}`, {
        cidrBlock: configuration.cidrBlock,
        enableDnsHostnames: true,
        tags: tagsValues
    });

    return vpc;
}

async function CreateInternetGateway(vpc,configuration) {
    const ig = await new aws.ec2.InternetGateway(`${configuration.account}-IG`, {
        vpcId: vpc.id,
        tags: {
            Name: `${configuration.account}-IG`,
            EnvName: `${configuration.account}`
        }
    });
    return ig;
}

//IF
async function EnableVPCFLowLogs(vpc,configuration) {

    const vpcFlowLogsLogGroup = await new aws.cloudwatch.LogGroup("vpcFlowLogsLogGroup", {
        name: `/aws/vpc/${configuration.account}-VPC/flow-logs`,
        retentionInDays: configuration.flowLogsRetention,
        tags: {
            Name: `${configuration.account}-VPC-Flow-LogGroup`,
            EnvName: configuration.account,
        }
    });

    const vpcFlowLogsRole = await new aws.iam.Role("vpcFlowLogsRole", {
        name: `${configuration.account}-${configuration.region}-VPC-flow-logs`,
        assumeRolePolicy: `{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "",
      "Effect": "Allow",
      "Principal": {
        "Service": "vpc-flow-logs.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
`,
        tags: {
            Name: `${configuration.account}-VPC-Flow-IAM-Role`,
            EnvName: configuration.account,
            Region: configuration.region
        }
    });

    const vpcFlowLog = await new aws.ec2.FlowLog("vpc", {
        iamRoleArn: vpcFlowLogsRole.arn,
        logDestination: vpcFlowLogsLogGroup.arn,
        trafficType: "ALL",
        vpcId: vpc.id,
    });


    const vpcFlowLogPolicy = await new aws.iam.RolePolicy("vpcFlowLog", {
        name: `${configuration.account}-${configuration.region}-VPC-flow-logs`,
        role: vpcFlowLogsRole.id,
        policy: `{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Action": [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents",
        "logs:DescribeLogGroups",
        "logs:DescribeLogStreams"
      ],
      "Effect": "Allow",
      "Resource": "*"
    }
  ]
}
`,
    });

}

async function CreateVpcEndpointS3(vpc,configuration) {
    const s3 = await new aws.ec2.VpcEndpoint("s3", {
        vpcId: vpc.id,
        serviceName: `com.amazonaws.${configuration.region}.s3`,
        policy: `    {
            "Version": "2012-10-17",
            "Statement": [
                {
                    "Action": "*","Effect": "Allow","Resource": "*","Principal": "*"
                }
            ]
        }
    `,
        tags: {
            Name: `${configuration.account}-S3-Endpoint`,
            EnvName: configuration.account

        }
    });

    return s3;

}

async function CreateVpcEndpointLambda(vpc, configuration) {
    const lambda = await new aws.ec2.VpcEndpoint("lambda", {
        vpcId: vpc.id,
        serviceName: `com.amazonaws.${configuration.region}.lambda`,  // Lambda service name
        vpcEndpointType: "Interface", // Interface endpoints are required for Lambda
        policy: `{
            "Version": "2012-10-17",
            "Statement": [
                {
                    "Action": "*",
                    "Effect": "Allow",
                    "Resource": "*",
                    "Principal": "*"
                }
            ]
        }`,
        tags: {
            Name: `${configuration.account}-Lambda-Endpoint`,
            EnvName: configuration.account
        }
    });

    return lambda;
}


async function CreateVPCEndpoints() {

}

module.exports = {
    CreateVPC, CreateInternetGateway, EnableVPCFLowLogs, CreateVpcEndpointS3, CreateVpcEndpointLambda
}