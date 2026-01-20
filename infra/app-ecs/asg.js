const aws = require("@pulumi/aws");

//fargate if
async function CreateASG(template,subnets,configuration) {
    const current = await aws.getCallerIdentity();

    const asg = await new aws.autoscaling.Group(`ecs-${configuration.ecsName}`,{
        name: `ecs-${configuration.ecsName}-${configuration.account}-${configuration.region}`,
        serviceLinkedRoleArn: `arn:aws:iam::${current.accountId}:role/aws-service-role/autoscaling.amazonaws.com/AWSServiceRoleForAutoScaling`,
        mixedInstancesPolicy: {
            launchTemplate: {
                launchTemplateSpecification: {
                    launchTemplateId: template.id,
                    version: '$Latest'
                },
                overrides: configuration.instanceTypes.map( function(i) {
                    return {instanceType: i}
                })
            },
            
            instancesDistribution: {
                spotInstancePools: 3,
                onDemandBaseCapacity: parseInt(configuration.onDemandBaseCapacity),
                onDemandPercentageAboveBaseCapacity: parseInt(configuration.onDemandPercentageAboveBaseCapacity)
            }

        },

        vpcZoneIdentifiers: subnets.ids,

        minSize: parseInt(configuration.minSize),
        maxSize: parseInt(configuration.maxSize),

        capacityRebalance: false,

        protectFromScaleIn: false,

        tags: [{
            key: 'Name',
            value: `ecs-${configuration.ecsName}`,
            propagateAtLaunch: true

        }],

        targetGroupArns: [],
        healthCheckGracePeriod: 300,
        defaultCooldown: 300



    });

    return asg;
}

async function CreateECSCapacityProvider(asg,configuration) {
    const capacity = await new aws.ecs.CapacityProvider(`${configuration.ecsName}-capacity-provider`,{
        name: `${configuration.ecsName}-${configuration.account}-${configuration.region}-capacity-provider`,
        autoScalingGroupProvider: {
            autoScalingGroupArn: asg.arn,
            managedTerminationProtection: 'DISABLED',
            managedScaling: {
                maximumScalingStepSize: 10,
                minimumScalingStepSize: 1,
                status: 'ENABLED',
                targetCapacity: configuration.asgTargetCapacity// 70
            }
        }
    });

    return capacity;
}

async function CreateGpuASG(template,subnets,configuration) {
    const current = await aws.getCallerIdentity();
    const gpuConfig = configuration.gpuCapacityProvider;

    const asg = await new aws.autoscaling.Group(`ecs-${configuration.ecsName}-gpu`,{
        name: `ecs-${configuration.ecsName}-gpu-${configuration.account}-${configuration.region}`,
        serviceLinkedRoleArn: `arn:aws:iam::${current.accountId}:role/aws-service-role/autoscaling.amazonaws.com/AWSServiceRoleForAutoScaling`,
        mixedInstancesPolicy: {
            launchTemplate: {
                launchTemplateSpecification: {
                    launchTemplateId: template.id,
                    version: '$Latest'
                },
                overrides: gpuConfig.instanceTypes.map( function(i) {
                    return {instanceType: i}
                })
            },

            instancesDistribution: {
                spotInstancePools: 1,
                onDemandBaseCapacity: parseInt(gpuConfig.onDemandBaseCapacity),
                onDemandPercentageAboveBaseCapacity: parseInt(gpuConfig.onDemandPercentageAboveBaseCapacity)
            }

        },

        vpcZoneIdentifiers: subnets.ids,

        minSize: parseInt(gpuConfig.minSize),
        maxSize: parseInt(gpuConfig.maxSize),

        capacityRebalance: false,

        protectFromScaleIn: false,

        tags: [{
            key: 'Name',
            value: `ecs-${configuration.ecsName}-gpu`,
            propagateAtLaunch: true

        }],

        targetGroupArns: [],
        healthCheckGracePeriod: 300,
        defaultCooldown: 300



    });

    return asg;
}

async function CreateGpuECSCapacityProvider(asg,configuration) {
    const gpuConfig = configuration.gpuCapacityProvider;

    const capacity = await new aws.ecs.CapacityProvider(`${configuration.ecsName}-gpu-capacity-provider`,{
        name: `${configuration.ecsName}-gpu-${configuration.account}-${configuration.region}-capacity-provider`,
        autoScalingGroupProvider: {
            autoScalingGroupArn: asg.arn,
            managedTerminationProtection: 'DISABLED',
            managedScaling: {
                maximumScalingStepSize: 2,
                minimumScalingStepSize: 1,
                status: 'ENABLED',
                targetCapacity: parseInt(gpuConfig.asgTargetCapacity)
            }
        }
    });

    return capacity;
}

async function CreateScheduler(asg,ecs,configuration) {
    const ecsStop = await new aws.autoscaling.Schedule("ecsStop", {
        scheduledActionName: `ecs-${configuration.ecsName}-stop`,
        minSize: 0,
        maxSize: 0,
        desiredCapacity: 0,
        autoscalingGroupName: asg.name,
        recurrence: configuration.scheduler.scheduleCronStop,
    }, {dependsOn: [ecs]});
    const ecsStart = await new aws.autoscaling.Schedule("ecsStart", {
        scheduledActionName: `ecs-${configuration.ecsName}-start`,
        minSize: parseInt(configuration.scheduler.asgMin),
        maxSize: parseInt(configuration.scheduler.asgMax),
        desiredCapacity: parseInt(configuration.scheduler.asgMin),
        autoscalingGroupName: asg.name,
        recurrence: configuration.scheduler.scheduleCronStart,
    },{dependsOn: [ecs] });
}


module.exports = {
    CreateASG,
    CreateECSCapacityProvider,
    CreateGpuASG,
    CreateGpuECSCapacityProvider,
    CreateScheduler
}