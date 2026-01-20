const aws = require("@pulumi/aws");
const config = require('./conf');

async function CreateAppAutoScale(apps, services,configuration) {
    let autoscales = new Object();
    for (const app of apps) {
        if (app.scaleUp.enabled === "true") {
            const autoscale = new aws.appautoscaling.Target(app.name, {
                maxCapacity: parseInt(app.autoscalingMax),
                minCapacity: parseInt(app.autoscalingMin),
                resourceId: services[app.name].name.apply(n=>`service/ecs-${configuration.ecsName}-${configuration.account}-${configuration.region}/${n}`) ,
                scalableDimension: "ecs:service:DesiredCount",
                serviceNamespace: "ecs",
            });
            autoscales[app.name] = autoscale;
        }

    }
    return autoscales;
}

async function CreateAutoScaleCPU(apps,autoscales) {
    for (const app of apps) {
        if (app.scaleUp.cpu.enabled === "true") {
            const scaleCpu = new aws.appautoscaling.Policy(`${app.name}-cpu`, {
                policyType: "TargetTrackingScaling",
                resourceId: autoscales[app.name].resourceId,
                scalableDimension: autoscales[app.name].scalableDimension,
                serviceNamespace: autoscales[app.name].serviceNamespace,
                targetTrackingScalingPolicyConfiguration: {
                    targetValue: app.scaleUp.cpu.value,
                    disableScaleIn: false,
                    scaleInCooldown: 300,
                    scaleOutCooldown: 300,
                    predefinedMetricSpecification: {
                        predefinedMetricType: "ECSServiceAverageCPUUtilization",
                    },
                },
            });
        }

    }
}

async function CreateAutoScaleMemory(apps,autoscales) {
    for (const app of apps) {
        if (app.scaleUp.memory.enabled === "true") {
            const scaleMemory = new aws.appautoscaling.Policy(`${app.name}-mem`, {
                policyType: "TargetTrackingScaling",
                resourceId: autoscales[app.name].resourceId,
                scalableDimension: autoscales[app.name].scalableDimension,
                serviceNamespace: autoscales[app.name].serviceNamespace,
                targetTrackingScalingPolicyConfiguration: {
                    targetValue: app.scaleUp.memory.value,
                    disableScaleIn: false,
                    scaleInCooldown: 300,
                    scaleOutCooldown: 300,
                    predefinedMetricSpecification: {
                        predefinedMetricType: "ECSServiceAverageMemoryUtilization",
                    },
                },
            });
        }

    }
}

module.exports = {
    CreateAppAutoScale, CreateAutoScaleCPU, CreateAutoScaleMemory
}