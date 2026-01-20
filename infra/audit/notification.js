const aws = require('@pulumi/aws');
const pulumi = require('@pulumi/pulumi');

async function CreateCloudWatchLog(retention) {
   const logGH =  await new aws.cloudwatch.LogGroup('gaurdduty',{
        name: 'guardduty-events',
        retentionInDays: retention,
    });

    await new aws.cloudwatch.LogStream('gd-stream',{
        logGroupName: logGH.name,
        name: 'default'
    });

  const logSH  = await new aws.cloudwatch.LogGroup('securityhub',{
        name: 'securityhub-events',
        retentionInDays: retention
    });

    await new aws.cloudwatch.LogStream('sh-stream',{
        logGroupName: logSH.name,
        name: 'default'
    });    

}

async function CreateEventSH() {
    const securityHubEventRule = await new aws.cloudwatch.EventRule("securityhub", {
        description: "Captures SecurityHub New Findings",
        eventPattern: `{
      "detail-type": [
        "Security Hub Findings - Imported"
      ],
      "source": [
        "aws.securityhub"
      ],
      "detail": {
        "findings": {
          "Severity": {
            "Label": ["HIGH", "CRITICAL"]
          },
          "Workflow": {
            "Status": [
              "NEW"
            ]
          }
        }
      }
    }
    
    `,
        namePrefix: "SecurityHubFindings",
    });

    return securityHubEventRule;
}

async function CreateEventTargetSH(rule,lambda) {
    const target = await new aws.cloudwatch.EventTarget("notifications", {
        rule: rule.name,
        arn: lambda.arn,
    })
    return target;
}

async function CreateSNSTopicAlarm() {
    const sns = await new aws.sns.Topic(`alarm-notification`,{
        name: 'alarm-notification'
    });
    return sns;
}

async function CreatePolicySNS(sns,configuration) {
    for (const account of configuration.accounts) {
        console.log("Creating SNS Policy for account: ", account);
        console.log("SNS Topic ARN: ", sns.arn);
        const doc = await aws.iam.getPolicyDocument({
            version: "2012-10-17",
            statements: [
                {
                    effect: "Allow",
                    principals: [{
                        type: "AWS",
                        identifiers: ["*"],
                    }],
                    actions: ["sns:Publish"],
                    resources: [sns.arn],
                    conditions: [{
                        test: "StringEquals",
                        variable: "aws:SourceOwner",
                        values: [account.id],
                    }],
                    sid: "AllowPublishFromAccount",
                },
                {
                    effect: "Allow",
                    principals: [{
                        type: "Service",
                        identifiers: ["events.amazonaws.com"],
                    }],
                    actions: ["sns:Publish"],
                    resources: [sns.arn],
                    sid: "AllowPublishFromEventBridge",
                },
            ],
        });
        console.log("SNS Policy Document: ", doc);
        const snsPolicy = new aws.sns.TopicPolicy(`policy-${account.env}`, {
            arn: sns.arn,
            policy: doc.minifiedJson,
        });

    }
  

}

module.exports = {
    CreateSNSTopicAlarm,
    CreatePolicySNS,
    CreateEventSH,
    CreateEventTargetSH,
    CreateCloudWatchLog

}