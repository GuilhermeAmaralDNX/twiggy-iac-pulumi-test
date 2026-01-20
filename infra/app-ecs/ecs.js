const aws = require("@pulumi/aws");
const pulumi = require('@pulumi/pulumi');


async function CreateECS(capacity, gpuCapacity, configuration) {
  let capacityProv = [];
  capacityProv.push('FARGATE');
  capacityProv.push('FARGATE_SPOT');

  if (!configuration.isFargate || !configuration.isFargateOnly) {
    capacityProv.push(capacity.name);
  }

  if (gpuCapacity) {
    capacityProv.push(gpuCapacity.name);
  }

  const ecs = await new aws.ecs.Cluster(`ecs-${configuration.ecsName}-${configuration.account}-${configuration.region}`, {
    name: `ecs-${configuration.ecsName}-${configuration.account}-${configuration.region}`,
    settings: configuration.ecsSetting,
    capacityProviders: capacityProv
  }, { ignoreChanges: ['tags'] });

  await new aws.ecs.ClusterCapacityProviders(`ecs-${configuration.ecsName}-${configuration.account}-${configuration.region}`, {
    clusterName: ecs.name,
    capacityProviders: capacityProv,
  });

  return ecs;
}

async function CreateIAMEcsTask(configuration) {
  const roleEcsTask = await new aws.iam.Role("ecsTask", {
    name: `ecs-task-${configuration.ecsName}-${configuration.account}-${configuration.region}`,
    assumeRolePolicy: `{
        "Version": "2012-10-17",
        "Statement": [
          {
            "Action": "sts:AssumeRole",
            "Principal": {
              "Service": "ecs-tasks.amazonaws.com"
            },
            "Effect": "Allow",
            "Sid": ""
          }
        ]
      }
      
      `});

  const ecsTask = await new aws.iam.RolePolicyAttachment("ecsTask", {
    role: roleEcsTask.name,
    policyArn: "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy",
  });

  //logs:CreateLogGroup
  const cloudWatchLogGroup = await new aws.iam.RolePolicy("cloudWatchLogGroup", {
    role: roleEcsTask.name,
    name: `ecs-log-group-${configuration.ecsName}-${configuration.account}-${configuration.region}`,
    policy: `{
      "Version": "2012-10-17",
      "Statement": [
        {
          "Action": [
            "logs:DescribeLogGroups",
            "logs:DescribeLogStream",
            "logs:CreateLogStream",
            "logs:PutLogEvents"
          ],
          "Effect": "Allow",
          "Resource": ["arn:aws:logs:*:*:*"]
        }
      ]
    }
    `,
  });

  return roleEcsTask;

}

async function CreateIAMEcsServer(configuration) {

  const roleEcsService = await new aws.iam.Role("ecsService", {
    name: `ecs-service-${configuration.ecsName}-${configuration.account}-${configuration.region}`,
    assumeRolePolicy: `{
        "Version": "2012-10-17",
        "Statement": [
          {
            "Action": "sts:AssumeRole",
            "Principal": {
              "Service": "ecs.amazonaws.com"
            },
            "Effect": "Allow",
            "Sid": ""
          }
        ]
      }
      
      `});

  const ecsServicePolicy = await aws.iam.getPolicyDocument({
    statements: [{
      actions: [
        "elasticloadbalancing:DeregisterInstancesFromLoadBalancer",
        "elasticloadbalancing:DeregisterTargets",
        "elasticloadbalancing:Describe*",
        "elasticloadbalancing:RegisterInstancesWithLoadBalancer",
        "elasticloadbalancing:RegisterTargets",
        "ec2:Describe*",
        "ec2:AuthorizeSecurityGroupIngress",
      ],
      effect: "Allow",
      resources: ["*"],
    }],
  });

  const ecsServiceRolePolicy = await new aws.iam.RolePolicy("ecsServiceRolePolicy", {
    name: `ecs_service_role_policy-${configuration.ecsName}-${configuration.account}-${configuration.region}`,
    policy: ecsServicePolicy.json,
    role: roleEcsService.id,
  });


  return roleEcsService;
  
}

//fargate no
async function CreateIAMECS(kms,configuration) {
  const roleEcs = await new aws.iam.Role("ecs", {
    name: `ecs-${configuration.ecsName}-${configuration.account}-${configuration.region}`,
    assumeRolePolicy: `{
        "Version": "2012-10-17",
        "Statement": [
          {
            "Action": "sts:AssumeRole",
            "Principal": {
              "Service": "ec2.amazonaws.com"
            },
            "Effect": "Allow",
            "Sid": ""
          }
        ]
      }
      
      `});

  const ecsSsm = await new aws.iam.RolePolicyAttachment("ecsSsm", {
    role: roleEcs.name,
    policyArn: "arn:aws:iam::aws:policy/service-role/AmazonEC2RoleforSSM",
  });


  const ecsEcs = await new aws.iam.RolePolicyAttachment("ecsEcs", {
    role: roleEcs.name,
    policyArn: "arn:aws:iam::aws:policy/service-role/AmazonEC2ContainerServiceforEC2Role",
  });


  
  const kmsPolicy = await new aws.iam.RolePolicy("kmsPolicy", {
    role: roleEcs.name,
    name: `ecs-kms-policy-${configuration.ecsName}-${configuration.account}-${configuration.region}`,
    policy: pulumi.all([kms.arn]).apply(([kmsArn]) =>`{
      "Version": "2012-10-17",
      "Statement": [
        {
          "Effect": "Allow",
          "Action": [
            "kms:List*",
            "kms:Get*",
            "kms:Describe*",
            "kms:Decrypt",
            "kms:ReEncrypt*",
            "kms:GenerateDataKey*"
          ],
          "Resource": [
            "${kmsArn}"
          ]
        }
      ]
    }
    `),
  });


  return roleEcs;
}

async function CreateSG(vpc,configuration) {
  const sgEcsNodes = await new aws.ec2.SecurityGroup("ecsNodes", {
    name: `ecs-${configuration.ecsName}-${configuration.account}-${configuration.region}`,
    description: "SG for ECS nodes",
    vpcId: vpc.id,
    tags: {
      Name: `ecs-${configuration.ecsName}-nodes`,
    },
  });

  if(configuration.ECSVpnAccess)
    await new aws.ec2.SecurityGroupRule("vpn-ecs", {
      description: "Traffic Ingress VPN",
      type: "ingress",
      fromPort: 0,
      toPort: 0,
      protocol: "-1",
      securityGroupId: sgEcsNodes.id,
      sourceSecurityGroupId: configuration.vpnSG
    });


  //grant ssh to vpn
  // const sshFromVpnToEcsNodes = await new aws.ec2.SecurityGroupRule("sshFromVpnToEcsNodes", {
  //   description: "ssh from VPN",
  //   type: "ingress",
  //   fromPort: 22,
  //   toPort: 22,
  //   protocol: "tcp",
  //   cidrBlocks: [configuration.vpnCidr],
  //   securityGroupId: sgEcsNodes.id,
  // });


  const allFromEcsNodesToEcsNodes = await new aws.ec2.SecurityGroupRule("allFromEcsNodesToEcsNodes", {
    description: "Traffic between ECS nodes",
    type: "ingress",
    fromPort: 0,
    toPort: 0,
    protocol: "-1",
    securityGroupId: sgEcsNodes.id,
    sourceSecurityGroupId: sgEcsNodes.id,
  });
  const managedList = await aws.ec2.getManagedPrefixList({ name: `com.amazonaws.${configuration.region}.s3` })

  const allFromEcsNodesOutboundS3 = await new aws.ec2.SecurityGroupRule("allFromEcsNodesOutboundS3", {
    description: "Traffic to outbound S3",
    type: "egress",
    fromPort: 443,
    toPort: 443,
    protocol: "tcp",
    securityGroupId: sgEcsNodes.id,
    prefixListIds: [managedList.id], //edit
  });

  const allFromEcsNodesOutbound = await new aws.ec2.SecurityGroupRule("allFromEcsNodesOutbound", {
    description: `Traffic to outbound cidr`,
    type: "egress",
    fromPort: 0,
    toPort: 0,
    protocol: "-1",
    securityGroupId: sgEcsNodes.id,
    cidrBlocks: ['0.0.0.0/0'],
  });



  return sgEcsNodes;
}

async function CreateRuleSGLoadBalance(sgEcsNodes, sgAlb, sgLb,configuration) {
  //grant access to alb if
  if (configuration.albExternal)
    await new aws.ec2.SecurityGroupRule("allFromAlbToEcsNodes", {
      description: "from ALB",
      type: "ingress",
      fromPort: 0,
      toPort: 0,
      protocol: "-1",
      securityGroupId: sgEcsNodes.id,
      sourceSecurityGroupId: sgAlb.id,
    });

  //grant access to lb internal
  if (configuration.albInternal)
    await new aws.ec2.SecurityGroupRule("allFromAlbInternalToEcsNodes", {
      description: "from internal ALB",
      type: "ingress",
      fromPort: 0,
      toPort: 0,
      protocol: "-1",
      securityGroupId: sgEcsNodes.id,
      sourceSecurityGroupId: sgLb.id,
    });
}

module.exports = {
  CreateIAMEcsTask,
  CreateIAMEcsServer,
  CreateIAMECS,
  CreateSG,
  CreateECS,
  CreateRuleSGLoadBalance
}