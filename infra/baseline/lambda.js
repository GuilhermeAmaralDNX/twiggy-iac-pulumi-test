const aws = require('@pulumi/aws');
const pulumi = require('@pulumi/pulumi');

async function CreateCloudWatchLog(retention) {
  const logGH =  await new aws.cloudwatch.LogGroup('gaurdduty',{
    name: 'guardduty-events',
    retentionInDays: retention,
});

await new aws.cloudwatch.LogStream('gd-stream',{
    logGroupName: logGH.name,
    name: 'default'
});

const logSH  = await new aws.cloudwatch.LogGroup('securityhub',{
    name: 'securityhub-events',
    retentionInDays: retention
});

await new aws.cloudwatch.LogStream('sh-stream',{
    logGroupName: logSH.name,
    name: 'default'
});

}



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

async function CreateLambdaNotfication(role,rule,topicAlaram,configuration) {
  const lambda = await new aws.lambda.Function("notification-guardudty", {
    code: await new pulumi.asset.FileArchive('./lambda-notifications.zip'),
    role: role.arn,
    handler: "lambda-notifications.handler",
    memorySize: 256,
    timeout: 90,
    runtime: "nodejs18.x",
    environment: {
      variables: {
        SNS_TOPIC_NAME_ALARM: 'NULL',
        SNS_TOPIC_NAME_ALARM_CSI: 'CISAlarm',
        WEBHOOK_TEAMS: configuration.notification.webhookTeams,
        WEBHOOK_GOOGLE: configuration.notification.webhookGoole,
        SLACK_CHANNEL: configuration.notification.slackChannel,
        SLACK_TOKEN: configuration.notification.slackToken,
        ENDPOINT_TYPE: configuration.notification.endpointType,
        LOG_ONLY: configuration.notification.logOnly
      },
    },
  });

  const invoke = await new aws.lambda.Permission(`lambda-permission-gd`,{
    action: 'lambda:InvokeFunction',
    principal: 'events.amazonaws.com',
    function: lambda.name,
    sourceArn: rule.arn
  });


  const withSns = await new aws.lambda.Permission("withSns", {
    action: "lambda:InvokeFunction",
    "function": lambda.name,
    principal: "sns.amazonaws.com",
    sourceArn: topicAlaram.arn,
  });

  const lambdaSubscription = await new aws.sns.TopicSubscription("lambdaSubscription", {
    topic: topicAlaram.arn,
    protocol: "lambda",
    endpoint: lambda.arn,
  });


  return lambda;
}


module.exports = {
  CreateRoleLambdaNotification,
  CreateLambdaNotfication,
  CreateCloudWatchLog
}