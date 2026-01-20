
const aws = require("@pulumi/aws");

async function CreateRoleInstance(configuration) {
    const role = await new aws.iam.Role(`${configuration.name}-instance-role`,
    {
        name: `${configuration.name}-instance-role`,
        assumeRolePolicy: `{
            "Version": "2012-10-17",
            "Statement": [
              {
                "Sid": "",
                "Effect": "Allow",
                "Principal": {
                  "Service": "ec2.amazonaws.com"
                },
                "Action": "sts:AssumeRole"
              }
            ]
          }`,
        permissionsBoundary: null
    });

    return role;
}

async function CreateInstanceProfile(role,configuration) {
    const profile = await new aws.iam.InstanceProfile(`${configuration.name}-instance-profile`,{
        name: `${configuration.name}-instance-profile`,
        role: role.name
    });
    return profile;

}

async function AttachInstancePolicies(role, policyCache,configuration) {

    // const policyLogGroup = await new aws.iam.RolePolicy(`${config.name}-instance-role`,{
    //     name: `${config.name}-instance-role`,
    //     role: role.name,
    //     policy: `{
    //         "Version": "2012-10-17",
    //         "Statement": [
    //           {
    //             "Sid": "allowLoggingToCloudWatch",
    //             "Effect": "Allow",
    //             "Action": [
    //               "logs:CreateLogGroup",
    //               "logs:CreateLogStream",
    //               "logs:PutLogEvents",
    //               "logs:DescribeLogStreams"
    //             ],
    //             "Resource": [
    //               "arn:aws:logs:*:*:*"
    //             ]
    //           }
    //         ]
    //       }`
    // });

    const policyInstanceDockerMachine = await new aws.iam.Policy(`${configuration.name}-docker-machine`,{
        name: `${configuration.name}-docker-machine`,
        path: '/',
        description: 'Policy for docker machine',
        policy: `{
            "Version": "2012-10-17",
            "Statement": [
              {
                "Action": [
                  "ec2:DescribeKeyPairs",
                  "ec2:TerminateInstances",
                  "ec2:StopInstances",
                  "ec2:StartInstances",
                  "ec2:RunInstances",
                  "ec2:RebootInstances",
                  "ec2:CreateKeyPair",
                  "ec2:DeleteKeyPair",
                  "ec2:ImportKeyPair",
                  "ec2:Describe*",
                  "ec2:CreateTags",
                  "ec2:RequestSpotInstances",
                  "ec2:CancelSpotInstanceRequests",
                  "ec2:DescribeSubnets",
                  "ec2:AssociateIamInstanceProfile",
                  "ec2:CreateSecurityGroup",
                  "ec2:AuthorizeSecurityGroupIngress",
                  "iam:PassRole",
                  "sts:AssumeRole",
                  "ecr:GetAuthorizationToken"
                ],
                "Effect": "Allow",
                "Resource": "*"
              }
            ]
          }`
    });

    await new aws.iam.RolePolicyAttachment(`${configuration.name}-pol-machine`,{
        role: role.name,
        policyArn: policyInstanceDockerMachine.arn
    });


    const policySessionManager = await new aws.iam.Policy(`${configuration.name}-session-manager`,{
        name: `${configuration.name}-session-manager`,
        path: '/',
        description: 'Policy session manager.',
        policy: `{
            "Version": "2012-10-17",
            "Statement": [
                {
                    "Effect": "Allow",
                    "Action": [
                        "ssmmessages:CreateControlChannel",
                        "ssmmessages:CreateDataChannel",
                        "ssmmessages:OpenControlChannel",
                        "ssmmessages:OpenDataChannel"
                    ],
                    "Resource": "*"
                }
            ]
        }`
    });

    await new aws.iam.RolePolicyAttachment(`${configuration.name}-pol-session`,{
        role: role.name,
        policyArn: policySessionManager.arn
    });

    await new aws.iam.RolePolicyAttachment(`${configuration.name}-ssm-machine-core`,{
        role: role.name,
        policyArn: 'arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore'
    });

    await new aws.iam.RolePolicyAttachment(`${configuration.name}-pol-cache`,{
        role: role.name,
        policyArn: policyCache.arn
    });

}


async function CreateRoleDockerMachine(configuration) {
  const role = await new aws.iam.Role(`${configuration.name}-idocker-machine-role`,
  {
      name: `${configuration.name}-docker-machine-role`,
      assumeRolePolicy: `{
        "Version": "2012-10-17",
        "Statement": [
          {
            "Sid": "",
            "Effect": "Allow",
            "Principal": {
              "Service": "ec2.amazonaws.com"
            },
            "Action": "sts:AssumeRole"
          }
        ]
      }`,
      permissionsBoundary: null
  });
  return role;
}

async function CreateInstanceProfileDockerMachine(role,configuration) {
    const profile = await new aws.iam.InstanceProfile(`${configuration.name}-docker-machine-profile`,{
        name: `${configuration.name}-docker-machine-profile`,
        role: role.name
    });

}

async function AttachDockerMachineePolicies(role,configuration){
    await new aws.iam.RolePolicyAttachment(`${configuration.name}-attach-ssm-machine`,{
        role: role.name,
        policyArn: 'arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore'
    });
}


async function CreateSSMPolicy(roleInstance,configuration) {
  const policy = await new aws.iam.Policy(`${configuration.name}-ssm`,{
    name: `${configuration.name}-ssm`,
    path: '/',
    description: 'Policy for runner token param access via SSM',
    policy: `{
      "Version": "2012-10-17",
      "Statement": [
          {
              "Effect": "Allow",
              "Action": [
                  "ssm:PutParameter"
              ],
              "Resource": "*"
          },
          {
              "Effect": "Allow",
              "Action": [
                  "ssm:GetParameters"
              ],
              "Resource": "arn:aws:ssm:*"
          }
      ]
  }`
  });

  await new aws.iam.RolePolicyAttachment(`${configuration.name}-pol-ssm`,{
    policyArn: policy.arn,
    role: roleInstance.name
  });

}

module.exports = {
  CreateRoleInstance,
  CreateInstanceProfile,
  AttachInstancePolicies,

  CreateRoleDockerMachine,
  CreateInstanceProfileDockerMachine,
  AttachDockerMachineePolicies,

  CreateSSMPolicy
}