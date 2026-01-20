const aws = require("@pulumi/aws");
const pulumi = require("@pulumi/pulumi");


async function CreateRole(account,region) {
    const policyDoc = await aws.iam.getPolicyDocument({
        version: '2012-10-17',
        statements: [
            {
                actions: [
                    "rds:StartDBCluster",
                    "eks:ListNodegroups",
                    "rds:StopDBCluster",
                    "ec2:DescribeInstances",
                    "ssm:GetParameters",
                    "ec2:StopInstances",
                    "rds:StopDBInstance",
                    "ssm:GetParameter",
                    "redshift:PauseCluster",
                    "redshift:ResumeCluster",
                    "rds:StartDBInstance",
                    "ecs:ListServices",
                    "ssm:PutParameter",
                    "ecs:UpdateService",
                    "eks:DescribeNodegroup",
                    "ec2:StartInstances",
                    "autoscaling:DescribeAutoScalingGroups",
                    "redshift:DescribeClusters",
                    "rds:DescribeDBInstances",
                    "autoscaling:UpdateAutoScalingGroup",
                    "ssm:GetParametersByPath",
                    "eks:ListClusters",
                    "rds:DescribeDBClusters",
                    "ecs:ListClusters",
                    "logs:CreateLogStream",
                    "logs:PutLogEvents",
                    "logs:CreateLogGroup",
                    "cloudwatch:*"
                ],
                effect: 'Allow',
                resources: ["*"]
            }
        ]
    })

    const policy = await new aws.iam.Policy(`${account}-${region}`, {
        namePrefix: 'ChuteDown',
        description: 'Policy for start/stop all resources possibles',
        policy: policyDoc.json

    });

    const role = await new aws.iam.Role(`${account}-${region}`, {
        namePrefix: 'ChuteDown',
        description: 'Role for start/stop all resources possibles used for lambda',
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
          
          `
    });

    await new aws.iam.RolePolicyAttachment(`${account}-${region}`, {
        role: role.name,
        policyArn: policy.arn
    });


    return role;
}

async function CreateEventStartStop(lambda,scheduleExpression,resources,type,account,region) {

    const eventInput = {
        type: "all",
        command: type,
        resources: resources
    }

    const event = await new aws.cloudwatch.EventRule(`${type}-all`,{
        namePrefix: `${type}-Resources`,
        scheduleExpression: scheduleExpression
    });

    await new aws.cloudwatch.EventTarget(`${type}-all`,{
        targetId: `${type}-all-${account}-${region}`,
        rule: event.name,
        arn: lambda.arn,
        input: JSON.stringify(eventInput)
        
    });

    await new aws.lambda.Permission(`${type}-all`,{
        action: "lambda:InvokeFunction",
        function: lambda.name,
        principal: "events.amazonaws.com",
        sourceArn: event.arn,
    })
}

async function CreateLambda(role,region) {
    const lambda = await new aws.lambda.Function("start-stop", {
        name: 'lambda-start-stop-resources',
        code: await new pulumi.asset.FileArchive('./chutedown.zip'),
        memorySize: 256,
        role: role.arn,
        handler: "index.handler",
        timeout: 300,
        runtime: "nodejs16.x",
        environment: {
            variables: {
                RESOURCE_REGION: region
            },
        },
    });

    return lambda;
}

async function CreateScheduler(account, region, scheduler) {
    const role = await CreateRole(account, region);
    const lambda = await CreateLambda(role,region);
    await CreateEventStartStop(lambda,scheduler.startExpression,scheduler.resources,'start',account,region);
    await CreateEventStartStop(lambda,scheduler.stopExpression,scheduler.resources,'stop',account,region);
}

module.exports = {
    CreateScheduler
}