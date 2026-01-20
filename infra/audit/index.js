"use strict";
const aws = require('@pulumi/aws');
const { EnableGuardDuty } = require('./guardDuty');
const { CreateSecurityHub } = require('./securityhub');
const alb = require('./s3-alb');
const cloudtrail = require('./s3-cloudtrail');
const auditConfig = require('./s3-config-audit');
const { CreateSecurityAuditSaml } = require('./iam');
const notification = require('./notification');
const lambda = require('./lambda');
const { configuration } = require('./conf');
const { GetOutputRoot } = require('./output');
const logging = require('./s3');


module.exports = async () => {

    const outputRoot = await GetOutputRoot(configuration.pulumiOrg);
    configuration.accountNumber = outputRoot.accounts.value.filter((a) => { if (a.name === configuration.account) return a })[0].account.id;
    configuration.accounts = outputRoot.accounts.value.map((a) => { return { email: a.account.email, env: a.name, id: a.account.id } });
    console.log("Configuration Accounts: ", configuration.accounts);
    configuration.orgName = outputRoot.orgName.value;

    const bucketLogging = await logging.CreateS3(configuration);

    const analyze  =  await new aws.accessanalyzer.Analyzer('analyze-audit',{
        analyzerName: 'audit-account'
    });
    
    if (configuration.enableGuardDuty)
        await EnableGuardDuty(configuration,bucketLogging);

    await alb.CreateS3(configuration,bucketLogging);

    const s3Audit = await cloudtrail.CreateS3(configuration,bucketLogging);

     await auditConfig.CreateS3Audit(configuration,bucketLogging);

    await auditConfig.CreateS3Config(configuration,bucketLogging);

    if (configuration.enableSecurityHub) {
        await CreateSecurityHub(configuration.enablePCI, configuration.enableCIS, configuration.enableFoundational,configuration);
    }

    await CreateSecurityAuditSaml(configuration.trusType,configuration);

    const eventRuleSH = await notification.CreateEventSH();
    const alarmSNSTopic = await notification.CreateSNSTopicAlarm();
    await notification.CreatePolicySNS(alarmSNSTopic,configuration);
    const roleLambda = await lambda.CreateRole();
    const lambdaNotification = await lambda.CreateLambda(roleLambda, alarmSNSTopic, eventRuleSH,configuration);
    await notification.CreateEventTargetSH(eventRuleSH, lambdaNotification);
    await notification.CreateCloudWatchLog(configuration.cloudwatchlogsRetention)

    return {
        snsTopicArnNotifications: alarmSNSTopic.arn,
        cloudTrailKmsKeyARN: s3Audit.kms.arn
    }

}