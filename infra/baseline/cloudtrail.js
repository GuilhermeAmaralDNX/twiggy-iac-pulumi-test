const aws = require('@pulumi/aws');

async function CreateRole() {

    const policyDoc = await aws.iam.getPolicyDocument({
        version: '2012-10-17',
        statements: [{
            actions: ['sts:AssumeRole'],
            principals: [{
                type: 'Service',
                identifiers: ['cloudtrail.amazonaws.com']
            }],
            effect: 'Allow',
            sid: ''
        }]
    });

    const role = await new aws.iam.Role('cloudtrailLogs',{
        namePrefix: 'CloudtrailLogsServiceRole',
        assumeRolePolicy: policyDoc.json
    });

    const policyDocAtach = await aws.iam.getPolicyDocument({
        version: '2012-10-17',
        statements: [{
            actions: [
                "logs:CreateLogStream",
                "logs:PutLogEvents"
            ],
            effect: 'Allow',
            sid: 'AWSCloudTrailPutLogEvents20141101',
            resources: ['*']
        }]
    });

    const rolePolicy = await new aws.iam.RolePolicy('cloudwatch',{
        namePrefix: 'cloudwatch_',
        role: role.name,
        policy: policyDocAtach.json
    });

    return role;

}

async function CreateKMS(configuration) {

    const currentId = await aws.getCallerIdentity();


    const policyDoc = await aws.iam.getPolicyDocument({
        version: '2012-10-17',
        statements: [{
            sid: 'Enable IAM User Permissions',
            effect: 'Allow',
            principals: [{
                type:'AWS',
                identifiers: [`arn:aws:iam::${currentId.accountId}:root`]
            }],
            actions: ['kms:*'],
            resources: ['*']
        },
        {
            sid: 'Allow CloudTrail to encrypt logs',
            effect: 'Allow',
            principals: [{
                type: 'Service',
                identifiers: ['cloudtrail.amazonaws.com'],                
            }],
            actions: ['kms:GenerateDataKey*'],
            resources: ['*'],
            conditions: [{
                test: 'StringLike',
                variable:'kms:EncryptionContext:aws:cloudtrail:arn',
                values: [`arn:aws:cloudtrail:*:${currentId.accountId}:trail/*`]
            }]
        },
        {
            sid: 'Allow CloudWatch Access',
            effect:'Allow',
            principals: [{
                type: 'Service',
                identifiers:['logs.amazonaws.com'],
            }],
            actions: [
                "kms:Encrypt*",
                "kms:Decrypt*",
                "kms:ReEncrypt*",
                "kms:GenerateDataKey*",
                "kms:Describe*"                
            ],
            resources: ['*']
        },
        {
            sid: 'Allow Describe Key access',
            effect: 'Allow',
            principals: [{
                type: 'Service',
                identifiers: ["cloudtrail.amazonaws.com", "lambda.amazonaws.com"]
            }],
            actions: ['kms:DescribeKey'],
            resources: ['*']

        }]
    })

    const kms = await new aws.kms.Key('cloudtrail_cloudwatch_logs',{
        deletionWindowInDays: 7,
        description: 'CloudTrail CW Logs Encryption Key',
        enableKeyRotation: true,
        policy: policyDoc.json
    })

    return kms;
}

async function CreateCLoudWatchLogs(configuration) {

    const kms = await CreateKMS();

    const logGroup = await new aws.cloudwatch.LogGroup(`${configuration.orgName}-cloudtrail`,{
        name: `${configuration.orgName}-cloudtrail`,
        kmsKeyId: kms.arn,
        retentionInDays: configuration.logGroupRetention
    });
    return logGroup;
}

async function EnabledCloudTrail(configuration) {

    const logGroup = await CreateCLoudWatchLogs(configuration);
    const role = await CreateRole(configuration);

    const trail = await new aws.cloudtrail.Trail(`${configuration.orgName}-cloudtrail`,{
        name: `${configuration.orgName}-cloudtrail`,
        includeGlobalServiceEvents: configuration.globalCloutrail,
        isMultiRegionTrail: configuration.globalCloutrail,
        enableLogFileValidation: true,
        eventSelectors: [{
            dataResources: configuration.cloudTrailDataResources
        }],
        s3BucketName: `${configuration.orgName}-audit-cloudtrail-${configuration.region}`,
        kmsKeyId: configuration.CloudTrailKmsKeyId,

        cloudWatchLogsGroupArn: logGroup.arn.apply(l=> `${l}:*`),
        cloudWatchLogsRoleArn: role.arn
    });

    return {
        trail,
        logGroup,
        role
    };
}

module.exports = {
    EnabledCloudTrail
}