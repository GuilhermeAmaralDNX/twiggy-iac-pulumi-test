const aws = require("@pulumi/aws");
const pulumi = require("@pulumi/pulumi");

async function createDynamoDBTable(config) {
    const dynamo = new aws.dynamodb.Table(config.tableName, {
        name: config.tableName,
        attributes: config.attributes,
        hashKey: config.partitionKey.name,
        rangeKey: config.sortKey ? config.sortKey.name : undefined,
        billingMode: config.billingMode,
        readCapacity: config.readCapacity, 
        writeCapacity: config.writeCapacity,
        tags: config.tags || {}
        
    },
    {ignore_changes:["readCapacity","writeCapacity"]});

    if(config.readScaling == true){
    const readScalingTarget = new aws.appautoscaling.Target(`${config.tableName}-ReadAutoScaling`, {
        maxCapacity: config.autoScaling.read.maxCapacity,
        minCapacity: config.autoScaling.read.minCapacity,
        resourceId: pulumi.interpolate`table/${dynamo.name}`,
        scalableDimension: "dynamodb:table:ReadCapacityUnits",
        serviceNamespace: "dynamodb",
    })

    new aws.appautoscaling.Policy(`${config.tableName}-ReadScalingPolicy`, {
        policyType: "TargetTrackingScaling",
        resourceId: readScalingTarget.resourceId,
        scalableDimension: readScalingTarget.scalableDimension,
        serviceNamespace: readScalingTarget.serviceNamespace,
        targetTrackingScalingPolicyConfiguration: {
            targetValue: config.autoScaling.read.targetUtilization,
            predefinedMetricSpecification: {
                predefinedMetricType: "DynamoDBReadCapacityUtilization",
            },
        },
    })
    };

    if(config.writeScaling == true){
    const writeScalingTarget = new aws.appautoscaling.Target(`${config.tableName}-WriteAutoScaling`, {
        maxCapacity: config.autoScaling.write.maxCapacity,
        minCapacity: config.autoScaling.write.minCapacity,
        resourceId:  pulumi.interpolate`table/${dynamo.name}`,
        scalableDimension: "dynamodb:table:WriteCapacityUnits",
        serviceNamespace: "dynamodb",
    })

    new aws.appautoscaling.Policy(`${config.tableName}-WriteScalingPolicy`, {
        policyType: "TargetTrackingScaling",
        resourceId: writeScalingTarget.resourceId,
        scalableDimension: writeScalingTarget.scalableDimension,
        serviceNamespace: writeScalingTarget.serviceNamespace,
        targetTrackingScalingPolicyConfiguration: {
            targetValue: config.autoScaling.write.targetUtilization,
            predefinedMetricSpecification: {
                predefinedMetricType: "DynamoDBWriteCapacityUtilization",
            },
        },
    })
    };

    return dynamo;
}

    async function Create(apps) {

        for (const config of apps) {
            await createDynamoDBTable(config);
        }
    }

module.exports = {
    Create,
};
