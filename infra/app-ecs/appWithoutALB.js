const aws = require("@pulumi/aws");
const { CreateLogGroup } = require('./cloudwatcch');
const {CreateAppAutoScale, CreateAutoScaleCPU, CreateAutoScaleMemory} = require('./autoscale');
const {CustomECSRoleTask} = require('./util');
const config = require('./conf');

async function CreateECSService(apps, ecs, tasks, ecsServiceRole,capacity,gpuCapacity,subnets,sgs,configuration) {
    let services = new Object();

    for (const app of apps) {
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
            //iamRole: configuration.isFargate ? '' : ecsServiceRole.arn,
            deploymentMaximumPercent: 100,
            deploymentMinimumHealthyPercent: 0,
            enableExecuteCommand: true,

            capacityProviderStrategies: [{
                capacityProvider: capacityProviderName,
                weight: 1,
                base: 0
            }]


        };

        if(app.launchType === "FARGATE")
        args.networkConfiguration = {
            subnets: subnets.ids ,
            securityGroups: [sgs.id] ,
        }

        const service = await new aws.ecs.Service(app.name, args, { ignoreChanges: ['taskDefinition'] });

        services[app.name] = service;
    }

    return services;
}

async function CreateEcsTaskDefinition(apps, ecs,executionRole, taskRole, logs,configuration) {
    let tasks = new Object();
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

        if( app.customRole.length > 0 )
            roleTaskCustom = await CustomECSRoleTask(app,configuration);


        const task = await new aws.ecs.TaskDefinition(app.name, {
            family: ecs.name.apply(n => `${n}-${app.name}`),

            executionRoleArn: executionRole.arn,
            taskRoleArn: app.customRole.length > 0 ? roleTaskCustom.arn : taskRole.arn,

            requiresCompatibilities: [app.launchType],

            networkMode: app.launchType === "FARGATE" ? 'awsvpc' : null,
            cpu: app.launchType === "FARGATE" ? parseInt(app.cpu) : null,
            memory: app.launchType === "FARGATE" ? parseInt(app.memory) : null,

            containerDefinitions: JSON.stringify([
                {
                name: app.name,
                image: app.image,
                memory: parseInt(app.memory),
                essential: true,
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
                ...(app.capacityProvider === "GPU" && {
                    resourceRequirements: [{
                        type: "GPU",
                        value: app.gpuCount || "1"
                    }]
                })

            }])

        },{dependsOn: logs});
        tasks[app.name] = task;
    }

    return tasks;
}

async function CreateApps(cluster, roleEcsTask, capacity, gpuCapacity, subnetPrivate, sgNodes, apps,configuration) {
    const logsWorker = await CreateLogGroup(apps,configuration);
    const tasksWorker = await CreateEcsTaskDefinition(apps,cluster,roleEcsTask, roleEcsTask,logsWorker,configuration);
    const servicesWorker = await CreateECSService(apps,cluster,tasksWorker,roleEcsTask,capacity,gpuCapacity,subnetPrivate,sgNodes,configuration);
    const appscalesWorker = await CreateAppAutoScale(apps,servicesWorker,configuration);
    await CreateAutoScaleMemory(apps,appscalesWorker);
    await CreateAutoScaleCPU(apps,appscalesWorker)

}



module.exports = {
    CreateECSService,
    CreateEcsTaskDefinition,
    CreateApps

}