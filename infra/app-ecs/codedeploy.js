const aws = require("@pulumi/aws");

async function CreateIAM(configuration) {
  const roleCodedeployService = await new aws.iam.Role("codedeployService", {
    name: `codedeploy-service-${configuration.ecsName}-${configuration.account}-${configuration.region}`,
    assumeRolePolicy: `{
        "Version": "2012-10-17",
        "Statement": [
          {
            "Action": "sts:AssumeRole",
            "Principal": {
              "Service": "codedeploy.amazonaws.com"
            },
            "Effect": "Allow",
            "Sid": ""
          }
        ]
      }
      
      `});

  const codedeployService = await new aws.iam.RolePolicyAttachment("codedeployService", {
    role: roleCodedeployService.name,
    policyArn: "arn:aws:iam::aws:policy/AWSCodeDeployRoleForECS",
  });



  return roleCodedeployService;
}

async function CreateCodeDeploy(apps,configuration) {
  let codes = new Object();
  for (const app of apps) {
    const code = await new aws.codedeploy.Application(`${configuration.ecsName}-${app.name}`, {
      name: `ecs-${configuration.ecsName}-${configuration.account}-${configuration.region}-${app.name}`,
      computePlatform: "ECS"
    });
    codes[app.name] = code;
  }
  return codes;
}

async function CreateDeploymentGroup(apps,codeDeploy,tgs,loadBalanceExeternal,loadBalanceInternal,cluster,services,configuration) {
  let groups = new Object();
  for (const app of apps) {
    const group = await new aws.codedeploy.DeploymentGroup(app.name, {
      appName: `ecs-${configuration.ecsName}-${configuration.account}-${configuration.region}-${app.name}`,
      deploymentConfigName: 'CodeDeployDefault.ECSAllAtOnce',
      deploymentGroupName: `ecs-${configuration.ecsName}-${configuration.account}-${configuration.region}-${app.name}`,
      serviceRoleArn: codeDeploy.arn,

      autoRollbackConfiguration: {
        enabled: true,
        events: ['DEPLOYMENT_FAILURE']
      },

      blueGreenDeploymentConfig: {
        deploymentReadyOption: {
          actionOnTimeout: 'CONTINUE_DEPLOYMENT',
          waitTimeInMinutes: 0,
        },

        terminateBlueInstancesOnDeploymentSuccess: {
          action: 'TERMINATE',
          terminationWaitTimeInMinutes: 0
        }
      },

      deploymentStyle: {
        deploymentOption: 'WITH_TRAFFIC_CONTROL',
        deploymentType: 'BLUE_GREEN'
      },

      ecsService: {
        clusterName: cluster.name,
        serviceName: services[app.name].name
      },

      loadBalancerInfo: {
        targetGroupPairInfo: {
          prodTrafficRoute: {
            listenerArns:  app.alb === 'external' ? [loadBalanceExeternal.prodListener.arn] : [loadBalanceInternal.prodListener.arn]
            //[listenerRules[app.name].green.arn]
          },
          testTrafficRoute: {
            listenerArns: app.alb === 'external' ? [loadBalanceExeternal.testListener.arn] : [loadBalanceInternal.testListener.arn]
            //[listenerRules[app.name].blue.arn]
          },

          targetGroups: [{
            name: tgs[`${app.name}-bl`].name
          },
          {
            name: tgs[`${app.name}-gr`].name
          }]

        }
      }

    },{dependsOn: [tgs[`${app.name}-bl`],tgs[`${app.name}-gr`],services[app.name]]});
    groups[app.name] = group;
  }
}

module.exports = {
  CreateIAM, CreateCodeDeploy, CreateDeploymentGroup
}