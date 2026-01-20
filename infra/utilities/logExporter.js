const pulumi = require('@pulumi/pulumi');
const aws = require('@pulumi/aws');


async function CreateRoleLogExporter(randomString,configuration) {

    const current = await aws.getCallerIdentity();
    const roleLogExporter = await new aws.iam.Role("logExporter", {
        name: randomString.result.apply(r=> `log-exporter-${r}`),
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
  
  `});

    const logExporterPolicy = await new aws.iam.RolePolicy("logExporter",
        {
            name: randomString.result.apply(r=> `log-exporter-${r}`),
            role: roleLogExporter.id,
            policy: `{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Action": [
        "logs:CreateExportTask",
        "logs:Describe*",
        "logs:ListTagsLogGroup"
      ],
      "Effect": "Allow",
      "Resource": "*"
    },
    {
      "Action": [
        "ssm:DescribeParameters",
        "ssm:GetParameter",
        "ssm:GetParameters",
        "ssm:GetParametersByPath",
        "ssm:PutParameter"
      ],
      "Resource": "arn:aws:ssm:${configuration.region}:${current.accountId}:parameter/log-exporter-last-export/*",
      "Effect": "Allow"
    },
    {
      "Action": [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "arn:aws:logs:${configuration.region}:${current.accountId}:log-group:/aws/lambda/log-exporter-*",
      "Effect": "Allow"
    },
    {
        "Sid": "AllowCrossAccountObjectAcc",
        "Effect": "Allow",
        "Action": [
            "s3:PutObject",
            "s3:PutObjectACL"
        ],
        "Resource": "arn:aws:s3:::${configuration.cloudwatchLogsExportBucket}/*"
    },
    {
        "Sid": "AllowCrossAccountBucketAcc",
        "Effect": "Allow",
        "Action": [
            "s3:PutBucketAcl",
            "s3:GetBucketAcl"
        ],
        "Resource": "arn:aws:s3:::${configuration.cloudwatchLogsExportBucket}"
    }
  ]
}
`,
        });


return roleLogExporter;

}


async function CreateLambdaLogExporter(role,randomString,configuration) {

    const current = await aws.getCallerIdentity();


    const functionLogExporter = await new aws.lambda.Function("logExporter", {
        name: randomString.result.apply(r=> `log-exporter-${r}`),
        code: await new pulumi.asset.FileArchive('./cloudwatch-to-s3.zip'),
        role: role.arn,
        handler: "cloudwatch-to-s3.lambda_handler",
        timeout: 300,
        runtime: "python3.8",
        environment: {
            variables: {
                S3_BUCKET: `${configuration.orgName}-audit-logs-${configuration.region}`,
                AWS_ACCOUNT: current.accountId,
            },
        },
    });

    const logExporterEventRule = await new aws.cloudwatch.EventRule("logExporter", {
        name: randomString.result.apply(r=> `log-exporter-${r}`),
        description: "Fires periodically to export logs to S3",
        scheduleExpression: "rate(4 hours)",
    });

    const logExporterTarget = await new aws.cloudwatch.EventTarget("logExporter", {
        targetId: randomString.result.apply(r=> `log-exporter-${r}`),
        rule: logExporterEventRule.name,
        arn: functionLogExporter.arn,
    });

    const logExporter = await new aws.lambda.Permission("logExporter", {
        action: "lambda:InvokeFunction",
        function: functionLogExporter.name,
        principal: "events.amazonaws.com",
        sourceArn: logExporterEventRule.arn,
    });

}


module.exports = {
    CreateRoleLogExporter, CreateLambdaLogExporter
}