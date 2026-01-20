"use strict";
const { AccepterSecuirtyHub } = require('./securityHub')
const { EnableConfig } = require('./config')
const { EnabledCloudTrail } = require('./cloudtrail')
const { CreateAlarms } = require('./alarm');
const { AccepterGuarDuty, CreateEventRuleGuardDuty, CreateEventTargetGD } = require('./guardDuty')
const { CreateLambdaNotfication, CreateRoleLambdaNotification, CreateCloudWatchLog } = require('./lambda')
const {EncryptionByDefaultEBS} = require('./ebs');
const {CreateKMS, CreateBucketAccessLoadBalance, CreateBucketServerAccessLogging} = require('./s3');
const {GetOutputRoot} = require('./output');
const {configuration} = require('./conf');

module.exports = async () => {

    const outputRoot = await GetOutputRoot(configuration.pulumiOrg);
    configuration.accountNumber = outputRoot.accounts.value.filter((a) => { if (a.name === configuration.account) return a })[0].account.id;
    configuration.orgName = outputRoot.orgName.value;
    configuration.auditAccountId = outputRoot.accounts.value.filter((a) => { if (a.name === 'audit') return a })[0].account.id;
    configuration.CloudTrailKmsKeyId = outputRoot.kmsAudit.value;
    
    await EncryptionByDefaultEBS();

    if (configuration.enableSecuirtyHub)
        await AccepterSecuirtyHub(configuration);

    if (configuration.enableConfig)
        await EnableConfig(configuration);

    // Always enable CloudTrail first if it's configured
    if (configuration.enableCloudtrail) {
        await EnabledCloudTrail(configuration);
    }

    // Add a delay to ensure CloudTrail and CloudWatch Logs are fully set up
    await new Promise(resolve => setTimeout(resolve, 30000));

    let topicAlarms;
    if (configuration.enableAlarms) {
        topicAlarms = await CreateAlarms(configuration);
    }

    if (configuration.enableGuardDuty)
        await AccepterGuarDuty(configuration);

    if (configuration.notification.enabled) {
        const eventRule = await CreateEventRuleGuardDuty();
        const role = await CreateRoleLambdaNotification();
        const lambda = await CreateLambdaNotfication(role, eventRule, topicAlarms,configuration);
        await CreateEventTargetGD(eventRule, lambda)
        await CreateCloudWatchLog(configuration.cloudwatchlogsRetention)
    }

    let bucketLoadBalance;
    let bucketS3;
    let kms;
    if (configuration.enableBucketAccessLogs) {
        kms = await CreateKMS();
        bucketLoadBalance  = await CreateBucketAccessLoadBalance(kms,configuration);
        bucketS3  = await CreateBucketServerAccessLogging(kms,configuration)

    }

    return {
        bucketLoadBalanceAccess: bucketLoadBalance,
        bucketAccessLogging: bucketS3,
        ...( configuration.enableBucketAccessLogs && { kmsBucketsAccess: kms.arn})
    }

}
