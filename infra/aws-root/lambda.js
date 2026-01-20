const aws = require('@pulumi/aws');
const pulumi = require('@pulumi/pulumi');
const {configuration} = require('./conf');

async function CreateRoleLambdaNotification() {
  const roleLambdaNotification = await new aws.iam.Role("notification", {
    assumeRolePolicy: `{
      "Version": "2012-10-17",
      "Statement": [
        {
          "Action": "sts:AssumeRole",
          "Principal": {
            "Service": "lambda.amazonaws.com"
          },
          "Effect": "Allow",
          "Sid": ""
        }
      ]
    }
    
    `,
    namePrefix: "notification",
    path: '/service-role/',
    managedPolicyArns: [
      "arn:aws:iam::aws:policy/AWSXrayWriteOnlyAccess",
      "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
    ]
  });

  const policy = await new aws.iam.Policy("notification", {
    description: "IAM policy for a lambda function",
    namePrefix: "cloudwatchfull-notf",
    path: "/",
    policy: `{
      "Version": "2012-10-17",
      "Statement": [
        {
          "Action": [
            "logs:CreateLogStream",
            "logs:PutLogEvents",
            "logs:CreateLogGroup",
            "cloudwatch:*"
          ],
          "Resource": [
            "arn:aws:logs:*:*:*",
            "arn:aws:cloudwatch:*:*:*"
          ],
          "Effect": "Allow"
        }
      ]
    }
    
    `,
  });

  const lambdaLogs = await new aws.iam.RolePolicyAttachment("lambdaLogs", {
    role: roleLambdaNotification.name,
    policyArn: policy.arn,
  });

  return roleLambdaNotification;
}

async function CreateLambdaNotfication(role, topic) {
  const lambda = await new aws.lambda.Function("notification-budget", {
    code: await new pulumi.asset.FileArchive('./lambda-notifications-aws.zip'),
    role: role.arn,
    handler: "lambda-notifications-aws.handler",
    memorySize: 256,
    timeout: 90,
    runtime: "nodejs14.x",
    environment: {
      variables: {
        SNS_TOPIC_NAME_ALARM: 'NULL',
        SNS_TOPIC_NAME_ALARM_CSI: 'CISAlarm',
        WEBHOOK_TEAMS: configuration.notification.webhookTeams,
        WEBHOOK_GOOGLE: configuration.notification.webhookGoole,
        SLACK_CHANNEL: configuration.notification.slackChannel,
        SLACK_TOKEN: configuration.notification.slackToken,
        ENDPOINT_TYPE: configuration.notification.endpointType
      },
    },
  });

  const withSns = await new aws.lambda.Permission("withSns", {
    action: "lambda:InvokeFunction",
    "function": lambda.name,
    principal: "sns.amazonaws.com",
    sourceArn: topic.arn,
  });

  const lambdaSubscription = await new aws.sns.TopicSubscription("lambdaSubscription", {
    topic: topic.arn,
    protocol: "lambda",
    endpoint: lambda.arn,
  });

  return lambda;
}

module.exports = {
  CreateRoleLambdaNotification,
  CreateLambdaNotfication
}
