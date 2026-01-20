const aws = require('@pulumi/aws');
const pulumi = require('@pulumi/pulumi');

async function CreateRole() {
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
    namePrefix: "slack-notf",
    path: '/service-role/',
    managedPolicyArns: [
      "arn:aws:iam::aws:policy/AWSXrayWriteOnlyAccess",
      "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole",
      "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
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

async function CreateLambda(role, sns,rule,configuration) {
  const lambda = await new aws.lambda.Function("notifications", {
    code: await new pulumi.asset.FileArchive('./lambda-notifications.zip'),
    role: role.arn,
    handler: "lambda-notifications.handler",
    memorySize: 256,
    timeout: 90,
    runtime: "nodejs18.x",
    environment: {
      variables: {
        SNS_TOPIC_NAME_ALARM: 'NULL',
        WEBHOOK_TEAMS: configuration.notification.webhookTeams,
        WEBHOOK_GOOGLE: configuration.notification.webhookGoole,
        SLACK_CHANNEL: configuration.notification.slackChannel,
        SLACK_TOKEN: configuration.notification.slackToken,
        ENDPOINT_TYPE: configuration.notification.endpointType,
        LOG_ONLY: configuration.notification.logOnly

      },
    },
  });

  const invoke = await new aws.lambda.Permission(`lambda-permission-sh`,{
    action: 'lambda:InvokeFunction',
    principal: 'events.amazonaws.com',
    function: lambda.name,
    sourceArn: rule.arn
  });

  
  const withSns = await new aws.lambda.Permission("withSns", {
    action: "lambda:InvokeFunction",
    "function": lambda.name,
    principal: "sns.amazonaws.com",
    sourceArn: sns.arn,
  });

  const lambdaSubscription = await new aws.sns.TopicSubscription("lambdaSubscription", {
    topic: sns.arn,
    protocol: "lambda",
    endpoint: lambda.arn,
  });

  return lambda;
}

module.exports = {
  CreateRole,
  CreateLambda
}