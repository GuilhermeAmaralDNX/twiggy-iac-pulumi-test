const aws = require("@pulumi/aws");
const {configuration} = require('./conf');

async function CreateCostAnomalySNSTopic() {
    const sns = new aws.sns.Topic("cost-anomaly-alerts", {});

    const topicPolicy = new aws.sns.TopicPolicy("anomalyAlertsTopicPolicy", {
        arn: sns.arn,
        policy: sns.arn.apply(arn => JSON.stringify({
            Version: "2012-10-17",
            Statement: [{
                Effect: "Allow",
                Principal: {
                    Service: "costalerts.amazonaws.com" 
                },
                Action: "SNS:Publish",
                Resource: arn,
            }],
        })),
    });
    
    return sns;
}

async function CreateEmailSubscriptionsToCostAnomalySNS(sns) {
    for (const email of configuration.costAnomalyDetection.emailsToNotify) {
        new aws.sns.TopicSubscription(`emailSubscription-${email}`, {
            topic: sns.arn,
            protocol: "email",
            endpoint: email
        });
    }
}

async function CreateCostAnomalyMonitor(organizationAccountsIds) {
    
    const monitor = new aws.costexplorer.AnomalyMonitor("CostAnomalyMonitor", {
        name: "AWSOrganizationCostAnomalyMonitor",
        monitorType: "CUSTOM",
        monitorSpecification: JSON.stringify({
            "Dimensions": {
                "Key": "LINKED_ACCOUNT",
                "Values": organizationAccountsIds
            }
        })
    })

    return monitor;
}

async function CreateCostAnomalySubscription(costAnomalyMonitor, snsTopic) {
    new aws.costexplorer.AnomalySubscription("anomalySubscription", {
        name: "AWSOrganizationCostAnomalySubscription",
        monitorArnLists: [costAnomalyMonitor.arn],
        subscribers: [{
            address: snsTopic.arn,
            type: "SNS"
        }],
        thresholdExpression: {
            dimension: {
                key: "ANOMALY_TOTAL_IMPACT_PERCENTAGE",
                values: [configuration.costAnomalyDetection.thresholdPercentage],
                matchOptions: [
                    "GREATER_THAN_OR_EQUAL"
                ]
            }
        },
        frequency: "IMMEDIATE"
    });
}

module.exports = {
    CreateCostAnomalySNSTopic,
    CreateEmailSubscriptionsToCostAnomalySNS,
    CreateCostAnomalyMonitor,
    CreateCostAnomalySubscription
}