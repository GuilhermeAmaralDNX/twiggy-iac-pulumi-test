const aws = require("@pulumi/aws");
const { CustomECSRoleTask } = require('./util');
const alb = require('./loadbalance');
const { CreateRecordExternal, CreateRecordInternal } = require('./route53');
const { CreateLogGroup } = require('./cloudwatcch');
const { CreateAppAutoScale, CreateAutoScaleCPU, CreateAutoScaleMemory } = require('./autoscale');
const codedeploy = require('./codedeploy');
const { CreateServiceDiscovery } = require('./cloudmap');
const { CreateLambdaHook } = require('./lambda');
const efs = require('./efs');

async function CreateAppGrafana(grafana) {


  let app = {
    name: grafana.name,
    alb: grafana.alb,
    launchType: grafana.launchType,
    desiredCount: 1,
    port: "3000",
    image: grafana.image,
    cpu: grafana.cpu,
    memory: grafana.memory,
    protocol: "HTTP",
    healthcheckPath: "/",
    healthcheckMatcher: "200-499",
    paths: grafana.paths,
    hostnames: grafana.hostnames,
    extraTrust: [],
    environment: grafana.environment || [],
    scaleUp: {
      enabled: "false",
      cpu: {
        enabled: "false",
      },
      memory: {
        enabled: "false"
      }
    },
    customRole: [
      {
        effect: "Allow",
        actions: [
          "cloudwatch:DescribeAlarmsForMetric",
          "cloudwatch:DescribeAlarmHistory",
          "cloudwatch:DescribeAlarms",
          "cloudwatch:ListMetrics",
          "cloudwatch:GetMetricData",
          "cloudwatch:GetInsightRuleReport"
        ],
        resources: [
          "*"
        ]
      },
      {
        effect: "Allow",
        actions: [
          "logs:DescribeLogGroups",
          "logs:GetLogGroupFields",
          "logs:StartQuery",
          "logs:StopQuery",
          "logs:GetQueryResults",
          "logs:GetLogEvents"
        ],
        resources: [
          "*"
        ]
      },
      {
        effect: "Allow",
        actions: [
          "ec2:DescribeTags",
          "ec2:DescribeInstances",
          "ec2:DescribeRegions"
        ],
        resources: [
          "*"
        ]
      },
      {
        effect: "Allow",
        actions: [
          "tag:GetResources"
        ],
        resources: [
          "*"
        ]
      }
    ]
  }

  if (grafana.extraPermssions) {
    for (const ex of grafana.extraPermssions) {
      // console.log(ex)
      app.customRole.push(ex)

    }
  }

  if (grafana.extraTrust)
      app.extraTrust.push(grafana.extraTrust);

  return app;
}


async function CreateECSService(apps, ecs, tasks, tgs, ecsServiceRole, capacity, gpuCapacity, subnets, sgs, listenRules, configuration) {
  let services = new Object();

  for (const app of apps) {
    // console.log(app);
    // Determine which capacity provider to use
    let capacityProviderName;
    if (app.launchType === "FARGATE") {
      capacityProviderName = configuration.isFargateSpot ? 'FARGATE_SPOT' : 'FARGATE';
    } else if (app.capacityProvider === "GPU" && gpuCapacity) {
      capacityProviderName = gpuCapacity.name;
    } else {
      capacityProviderName = capacity.name;
    }

    let args = {
      name: app.name,
      cluster: ecs.name,
      taskDefinition: tasks[app.name].arn,
      desiredCount: parseInt(app.desiredCount),
      //iamRole: configurationisFargate ? '' : ecsServiceRole.arn,
      healthCheckGracePeriodSeconds: 0,
      deploymentMaximumPercent: 200,
      deploymentMinimumHealthyPercent: 100,
      enableExecuteCommand: true,

      loadBalancers: [{
        targetGroupArn: tgs[`${app.name}-gr`].arn,
        containerName: app.name,
        containerPort: parseInt(app.port)
      }],

      deploymentController: {
        type: 'CODE_DEPLOY'
      },

      capacityProviderStrategies: [{
        capacityProvider: capacityProviderName,
        weight: 1,
        base: 0
      }]


    };

    if (app.launchType === "FARGATE")
      args.networkConfiguration = {
        subnets: subnets.ids,
        securityGroups: [sgs.id],
      }

    const service = await new aws.ecs.Service(app.name, args, {
      ignoreChanges:
        ['loadBalancers', 'taskDefinition', 'desiredCount', 'capacityProviderStrategies', 'networkConfiguration'],
      dependsOn: [listenRules[app.name].green]
    });

    services[app.name] = service;

    if (app.lambdaHooks)
      for (const lambdaHook of app.lambdaHooks) {
        await CreateLambdaHook(lambdaHook, app.name);
      }

  }

  return services;
}

async function CreateEcsTaskDefinition(apps, ecs, executionRole, taskRole, logs, configuration, fileSystem) {
  let tasks = new Object();

  let accessPointGrafana;
  if (configuration.grafana.enabled) {
    let grafanaConfig = {
      efsAccessPoints: [{
        name: 'grafana',
        posixUser: {
          enabled: "true",
          gid: "0",
          uid: "0",
          secondaryGids: ["0"]
        }
      }]
    };
    accessPointGrafana = await efs.CreateAccessPoints(fileSystem, grafanaConfig);
  }

  for (const app of apps) {

    let roleTaskCustom;
    app.customRole.push(
      {
        effect: "Allow",
        actions: [
          "logs:DescribeLogGroups",
          "logs:DescribeLogStream",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ],
        resources: [
          `arn:aws:logs:us-east-1:${configuration.account}:log-group:/ecs/ecs-${configuration.ecsName}-${configuration.account}-${configuration.region}/${app.name}:*`
        ]
      }
    );


    if (app.customRole.length > 0)
      roleTaskCustom = await CustomECSRoleTask(app, configuration);

    const task = await new aws.ecs.TaskDefinition(app.name, {
      family: ecs.name.apply(n => `${n}-${app.name}`),

      executionRoleArn: executionRole.arn,
      taskRoleArn: app.customRole.length > 0 ? roleTaskCustom.arn : taskRole.arn,

      requiresCompatibilities: [app.launchType],

      networkMode: app.launchType === "FARGATE" ? 'awsvpc' : null,
      cpu: app.launchType === "FARGATE" ? parseInt(app.cpu) : null,
      memory: app.launchType === "FARGATE" ? parseInt(app.memory) : null,

      ...((configuration.grafana.enabled && app.name === 'grafana') && {
        volumes: [{
          name: 'grafana',
          efsVolumeConfiguration: {
            fileSystemId: fileSystem.id,
            authorizationConfig: {
              accessPointId: accessPointGrafana[0].accessPointId
            },
            transitEncryption: 'ENABLED',
          }
        }],
      }),

      containerDefinitions: JSON.stringify([
        {
          name: app.name,
          image: app.image,
          memory: parseInt(app.memory),
          essential: true,
          portMappings: [{
            containerPort: parseInt(app.port)
          }],
          logConfiguration: {
            logDriver: "awslogs",
            options: {
              "awslogs-group": `/ecs/ecs-${configuration.ecsName}-${configuration.account}-${configuration.region}/${app.name}`,
              "awslogs-region": configuration.region,
              "awslogs-stream-prefix": "app"
            }
          },
          ...(app.environment && {
            environment: app.environment
          }),
          ...((configuration.grafana.enabled && app.name === 'grafana') && {
            mountPoints: [{
              sourceVolume: "grafana",
              containerPath: "/var/lib/grafana"
            }]
          })

        }])

    }, { dependsOn: logs });
    tasks[app.name] = task;
  }

  return tasks;
}

async function CreateApps(cluster, roleEcsTask, roleEcsService, capacity, gpuCapacity, subnetPrivate, sgNodes, apps, vpc, loadBalanceExeternal, loadBalanceInternal, roleCodeDeploy, configuration, fileSystem) {
  if (configuration.grafana.enabled) {
    apps.push(await CreateAppGrafana(configuration.grafana));
  }
  const logs = await CreateLogGroup(apps, configuration);
  const tgs = await alb.CreateTGBlueGreen(apps, vpc, configuration);
  let listenRules = {};
  for (const app of apps) {
    // Make sure we have a valid load balancer before proceeding
    const loadBalancer = app.alb === 'external' ? loadBalanceExeternal : loadBalanceInternal;
    if (!loadBalancer || !loadBalancer.prodListener) {
      throw new Error(`Load balancer ${app.alb} not properly initialized for app ${app.name}`);
    }

    listenRules[app.name] = await alb.CreateListenersRules(
      app,
      loadBalancer,
      tgs,
      app.alb === 'external' ? '' : 'int');
  }

  const applications = await codedeploy.CreateCodeDeploy(apps, configuration);
  const tasks = await CreateEcsTaskDefinition(apps, cluster, roleEcsTask, roleEcsTask, logs, configuration, fileSystem);
  const services = await CreateECSService(apps, cluster, tasks, tgs, roleEcsService, capacity, gpuCapacity, subnetPrivate, sgNodes, listenRules, configuration);
  const codeDeploymenGroup = await codedeploy.CreateDeploymentGroup(apps, roleCodeDeploy, tgs, loadBalanceExeternal, loadBalanceInternal, cluster, services, configuration);

  for (const app of apps) {
    if (app.cloudfrount) {
      const domainNameFrount = await CreateCloudFrount(loadBalanceExeternal.alb, app, configuration)
      await CreateRecordExternal(app, domainNameFrount);
    } else {
      if (app.alb === 'external') {
        await CreateRecordExternal(app, loadBalanceExeternal.alb);
      } else {
        await CreateRecordInternal(app, loadBalanceInternal.alb)
      }
    }

  }

  const appscales = await CreateAppAutoScale(apps, services, configuration);
  await CreateAutoScaleMemory(apps, appscales);
  await CreateAutoScaleCPU(apps, appscales)

}

async function CreateCloudFrount(alb, app, configuration) {

  const cloudFrountPolicy = new aws.cloudfront.CachePolicy(app.name, {
    parametersInCacheKeyAndForwardedToOrigin: {
      cookiesConfig: {
        cookieBehavior: 'none',
      },
      headersConfig: {
        headerBehavior: "whitelist",
        headers: {
          items: ['Host'],
        }
      },
      queryStringsConfig: {
        queryStringBehavior: 'none'
      }
    }
  });


  const listAliases = app.hostnames.concat(app.external_hostnames);

  const frount = await new aws.cloudfront.Distribution(app.name, {
    enabled: true,
    aliases: listAliases,
    origins: [
      {
        domainName: alb.dnsName,
        originId: app.name,
        // customHeaders: [{
        //     name: 'Host',
        //     value:  app.hostnames[0]
        // }],
        customOriginConfig: {
          httpPort: 80,
          httpsPort: 443,
          originProtocolPolicy: "https-only",
          originSslProtocols: ["TLSv1.2"],
        }
      }
    ],

    defaultCacheBehavior: {
      cachePolicyId: cloudFrountPolicy.id,
      targetOriginId: app.name,
      viewerProtocolPolicy: "redirect-to-https",
      allowedMethods: ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"],
      cachedMethods: ["GET", "HEAD", "OPTIONS"],
      // forwardedValues: {
      //     queryString: false,
      //     cookies: {
      //         forward: "none",
      //     },
      // },
      minTtl: 0,
      defaultTtl: 86400,
      maxTtl: 31536000,
    },
    viewerCertificate: {
      acmCertificateArn: configuration.certificate,
      sslSupportMethod: "sni-only",
    },
    restrictions: {
      geoRestriction: {
        restrictionType: "none",
      },
    },
  })

  return frount.domainName
}


module.exports = {
  CreateECSService,
  CreateEcsTaskDefinition,
  CreateApps

}
