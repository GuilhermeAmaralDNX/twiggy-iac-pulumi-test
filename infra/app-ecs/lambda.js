const aws = require("@pulumi/aws");
const pulumi = require('@pulumi/pulumi');

async function CreateLambdaHook(lambdaHook, name) {
  const lambdaRole = new aws.iam.Role(`${name}-${lambdaHook.name}`, {
    assumeRolePolicy: aws.iam.assumeRolePolicyForPrincipal({ Service: "lambda.amazonaws.com" }),
  });

  await new aws.iam.RolePolicyAttachment(`${name}-${lambdaHook.name}`, {
    policyArn: "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole",
    role: lambdaRole,
  });



  const policy = await new aws.iam.Policy(`${name}-${lambdaHook.name}`, {
    description: "IAM policy for a lambda function hook",
    //namePrefix: "cloudwatchfull-notf",
    path: "/",
    policy: `{
          "Version": "2012-10-17",
          "Statement": [
            {
              "Action":[
                "codedeploy:PutLifecycleEventHookExecutionStatus"
              ],
              "Resource": "*",
              "Effect": "Allow"              
            },
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

  await new aws.iam.RolePolicyAttachment(`logs-${name}-${lambdaHook.name}`, {
    role: lambdaRole.name,
    policyArn: policy.arn,
  });

  const hookLambda = await new aws.lambda.Function(`${name}-${lambdaHook.name}`, {
    code: new pulumi.asset.FileArchive(lambdaHook.location),
    name: `${name}-${lambdaHook.name}`,
    memorySize: lambdaHook.memorySize,
    timeout: lambdaHook.timeout,
    handler: lambdaHook.handler,
    runtime: lambdaHook.runtime,
    role: lambdaRole.arn,
  });

  return hookLambda.arn;

}

async function CreateEventScheduler(lambda,cronConfig) {
  const rule = await new aws.cloudwatch.EventRule(`rule-${cronConfig.name}`, {
    description: `Event for call lambda ${cronConfig.name}`,
    scheduleExpression: `cron(${cronConfig.cron})`,
});

const callLambdaTarget = await new aws.cloudwatch.EventTarget(`tg-${cronConfig.name}`, {
  rule: rule.name,
  arn: lambda.arn
});

await new aws.lambda.Permission(`permison-${cronConfig.name}`, {
  action: "lambda:InvokeFunction",
  function: lambda.name,
  principal: "events.amazonaws.com",
  sourceArn: rule.arn,
});

}

async function CreateCustomLambda(lambdaConfig, subnets, vpc) {
  const lambdaRole = new aws.iam.Role(`${lambdaConfig.name}`, {
    assumeRolePolicy: aws.iam.assumeRolePolicyForPrincipal({ Service: "lambda.amazonaws.com" }),
  });

  new aws.iam.RolePolicyAttachment(`${lambdaConfig.name}`, {
    policyArn: "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole",
    role: lambdaRole,
  });



  const policy = await new aws.iam.Policy(`${lambdaConfig.name}`, {
    description: `IAM policy for a lambda ${lambdaConfig.name}`,
    //namePrefix: "cloudwatchfull-notf",
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

  await new aws.iam.RolePolicyAttachment(`logs-${lambdaConfig.name}`, {
    role: lambdaRole.name,
    policyArn: policy.arn,
  });

  if (lambdaConfig.vpcEnable) {
    await new aws.iam.RolePolicyAttachment(`vpc-${lambdaConfig.name}`, {
      role: lambdaRole.name,
      policyArn: "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole",});


  }


  let sg;
  if (lambdaConfig.vpcEnable)
    sg = await new aws.ec2.SecurityGroup(`${lambdaConfig.name}`, {
      vpcId: vpc.id,
      name: `${lambdaConfig.name}-sg`,
      egress: [{
        protocol: "-1",
        fromPort: 0,
        toPort: 0,
        cidrBlocks: ['0.0.0.0/0'],
      }]
    });

  const hookLambda = await new aws.lambda.Function(`${lambdaConfig.name}`, {
    code: new pulumi.asset.FileArchive(lambdaConfig.location),
    handler: lambdaConfig.handler,
    memorySize: lambdaConfig.memorySize,
    runtime: lambdaConfig.runtime,
    timeout: lambdaConfig.timeout,
    role: lambdaRole.arn,
    ...(lambdaConfig.vpcEnable && {
      vpcConfig: {
        securityGroupIds: [sg.id],
        subnetIds: subnets.ids      }
    })

  });


  for(const event of lambdaConfig.triggers.EventBridgeScheduler) {
    await CreateEventScheduler(hookLambda,event);
  }

  if (lambdaConfig.customRole.length > 0)
    CreateCustomRole(lambdaRole,lambdaConfig.customRole,lambdaConfig.name)

  return hookLambda.arn;

}

async function CreateCustomRole(role,customRole,name){
  let docPolicy =  await aws.iam.getPolicyDocument({
    version: '2012-10-17',
    statements: customRole
});

const customRolePolcy = await new aws.iam.RolePolicy(`CRP-${name}`, {
  role: role.name,
  name: `policy-custom-lambda${name}`,
  policy: docPolicy.json
});
}

async function Create (lambdaConfigs,subnetPrivate,vpc){
  for (const lambda of lambdaConfigs) {
    const customlambda = await CreateCustomLambda(lambda,subnetPrivate,vpc);
  }
}

module.exports = {
  CreateLambdaHook,
  Create
}