const aws = require("@pulumi/aws");
const {CreateLogGroup} = require('./cloudwatcch');
const {CustomECSRoleTask} = require('./util');


async function CreateIAMScheduler(configuration) {

    const policyDoc = await aws.iam.getPolicyDocument({
        statements: [{
          actions: [
            "sts:AssumeRole"
          ],
          principals: [{
            identifiers: ["events.amazonaws.com"],
            type:'Service'
          }]
        }],
      });

    const role = await new aws.iam.Role(`sch-${configuration.ecsName}`,{
        name: `sch-${configuration.ecsName}`,
        assumeRolePolicy: policyDoc.json,
        path: '/',
        description: `sch-${configuration.ecsName}`
    });


    const policyARNEvents = await aws.iam.getPolicy({
        arn: 'arn:aws:iam::aws:policy/service-role/AmazonEC2ContainerServiceEventsRole'
    });

    const policy = await new aws.iam.Policy(`sch-${configuration.ecsName}`,{
        name: `sch-${configuration.ecsName}`,
        policy: policyARNEvents.policy,
        path: '/',
        description: `sch-${configuration.ecsName}`
        
    });

    await new aws.iam.RolePolicyAttachment(`sch-${configuration.ecsName}`,{
        role: role.name,
        policyArn: policy.arn
    });

    return role;
}

async function CreateEvent(configEvent,role,sgNodes,subnets,cluster,eventIndex,configuration) {
    const eventRule = await new aws.cloudwatch.EventRule(`eventRule-${eventIndex}`,{
        name: configEvent.name,
        isEnabled: configEvent.isEnabled,
        scheduleExpression: `cron(${configEvent.scheduleExpression})`
    });
    //ecs-dev-apps-nonprod-us-east-1-
    const eventTarget = await new aws.cloudwatch.EventTarget(`eventTarget-${eventIndex}`,{
        targetId: configEvent.name,
        arn: cluster.arn,
        rule: eventRule.name,
        roleArn: role.arn,
        ecsTarget: {
            taskDefinitionArn: `arn:aws:ecs:${configuration.region}:${configuration.accountNumber}:task-definition/ecs-${configuration.ecsName}-${configuration.account}-${configuration.region}-${configEvent.name}`,
            launchType: configEvent.launchType,
            ...(configEvent.launchType === "FARGATE" && {
                networkConfiguration: {
                    subnets: subnets.ids,
                    securityGroups: [sgNodes.id],                    
                }
            })
        }
    }, {
        ignoreChanges: ['ecsTarget','input']
    });


}

async function CreateEcsTaskDefinition(apps, ecs,executionRole, taskRole, logs,configuration) {
    const current = await aws.getCallerIdentity();
    
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
                    `arn:aws:logs:${configuration.region}:${current.accountId}:log-group:/ecs/ecs-${configuration.ecsName}-${configuration.account}-${configuration.region}/${app.name}:*`
                ]
            }
        );

        if( app.customRole.length > 0 )
            roleTaskCustom = await CustomECSRoleTask(app,configuration);


        const task = await new aws.ecs.TaskDefinition(app.name, {
            family: ecs.name.apply(n => `${n}-${app.name}`),

            executionRoleArn: app.customRole.length > 0 ? roleTaskCustom.arn : executionRole.arn ,
            taskRoleArn: app.customRole.length > 0 ? roleTaskCustom.arn : taskRole.arn,

            requiresCompatibilities: [app.launchType],

            networkMode: app.launchType === "FARGATE" ? 'awsvpc' : null,
            cpu: app.launchType === "FARGATE"  ? parseInt(app.cpu) : null,
            memory: app.launchType === "FARGATE"  ? parseInt(app.memory) : null,

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
                }

            }])

        },{dependsOn: logs});
        tasks[app.name] = task;
    }

    return tasks;
}

async function CreateApps(apps,sgNodes,subnets,cluster,executionRole,taskRole,configuration) {
    if (apps.length > 0) {
        const logs = await CreateLogGroup(apps,configuration);
        const role = await CreateIAMScheduler(configuration);
        let eventIndex = 0;
        for (const app of apps) {
            await CreateEvent(app,role,sgNodes,subnets,cluster,eventIndex,configuration);
            eventIndex++;
        }
        await CreateEcsTaskDefinition(apps,cluster,executionRole,taskRole,logs,configuration)
    }


}

module.exports = {
    CreateApps
}