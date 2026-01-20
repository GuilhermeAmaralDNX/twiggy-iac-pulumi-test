const aws = require("@pulumi/aws");
const {configuration} = require('./conf');

async function CreateSNSBudget() {
    const sns = await new aws.sns.Topic('budget-alert', {});
    return sns;
}

async function CreateBudgetAlert(sns) {
    const budget = await new aws.budgets.Budget('budget-alert', {
        budgetType: 'COST',
        limitAmount: configuration.budgetAlertlLimitAmount,
        limitUnit: 'USD',
        notifications: [{
            comparisonOperator: 'GREATER_THAN',
            notificationType: 'FORECASTED',
            subscriberSnsTopicArns: [sns.arn],
            threshold: 90,
            thresholdType: 'PERCENTAGE',
        }],
        timeUnit: 'MONTHLY'
    });
}

module.exports = {
    CreateBudgetAlert, CreateSNSBudget
}
