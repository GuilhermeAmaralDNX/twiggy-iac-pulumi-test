const aws = require('@pulumi/aws');

async function AccepterGuarDuty(configuration) {
    const detector = await new aws.guardduty.Detector('member',{
        enable: true
    });

    const inviteAccepter = await new aws.guardduty.InviteAccepter('invite',{
        detectorId: detector.id,
        masterAccountId: configuration.auditAccountId
    });

}

async function CreateEventRuleGuardDuty() {
    const guardDutyEventRule = await new aws.cloudwatch.EventRule("gaurdduty", {
        description: "GuardDutyRule",
        eventPattern: `{
            "detail": {
              "severity": [4, 4, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 5, 5, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9, 6, 6, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 7, 7, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.9, 8, 8, 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 8.9]
            },
            "detail-type": ["GuardDuty Finding"],
            "source": ["aws.guardduty"]
          }`,
        namePrefix: "GuardDutyFinding",
    });

    return guardDutyEventRule;
}

async function CreateEventTargetGD(rule,lambda) {
    const target = await new aws.cloudwatch.EventTarget("notification-gaurdduty", {
        rule: rule.name,
        arn: lambda.arn,
    })
    return target;
}

module.exports = {
    AccepterGuarDuty, CreateEventRuleGuardDuty, CreateEventTargetGD
}