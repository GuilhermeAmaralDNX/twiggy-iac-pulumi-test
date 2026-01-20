const aws = require('@pulumi/aws');

async function CreateKMS(configuration) {

    const identy = await aws.getCallerIdentity();

    const policyDoc = aws.iam.getPolicyDocument({
        statements: [
            {
                sid: 'Allow GuardDuty to encrypt findings',
                actions: ['kms:GenerateDataKey'],
                resources: ['*'],
                principals: [{
                    type: 'Service',
                    identifiers: ['guardduty.amazonaws.com']
                }]
            },
            {
                sid: 'Allow account to manage key',
                actions: ['kms:*'],
                resources: [`arn:aws:kms:${configuration.region}:${identy.accountId}:key/*`],
                principals: [
                    {
                        type: 'AWS',
                        identifiers: [`arn:aws:iam::${identy.accountId}:root`]
                    }
                ]
            }]
    });

    const ksm = new aws.kms.Key('GuardDuty', {
        description: 'Guardduty S3 Key',
        deletionWindowInDays: 7,
        policy: policyDoc.then(policyDoc => policyDoc.json),
        enableKeyRotation: true
    });
    return ksm;
}

async function CreateS3(kms,configuration,bucketLogging) {

    const policyDoc = aws.iam.getPolicyDocument({
        statements: [
            {
                sid: 'Allow PutObject',
                actions: ['s3:PutObject'],
                resources: [`arn:aws:s3:::${configuration.orgName}-audit-guardduty-${configuration.region}/*`],
                principals: [{
                    type: 'Service',
                    identifiers: ['guardduty.amazonaws.com']
                }]
            },
            {
                sid: 'Allow GetBucketLocation',
                actions:['s3:GetBucketLocation'],
                resources:[`arn:aws:s3:::${configuration.orgName}-audit-guardduty-${configuration.region}`],
                principals: [{
                    type: 'Service',
                    identifiers: ['guardduty.amazonaws.com']
                }]
            },
            {
                sid: 'Deny incorrect encryption header',
                effect: 'Deny',
                actions: ['s3:PutObject'],
                resources: [`arn:aws:s3:::${configuration.orgName}-audit-guardduty-${configuration.region}/*`],
                conditions: [
                    {
                        test: 'StringNotEquals',
                        variable: 's3:x-amz-server-side-encryption-aws-kms-key-id',
                        values: [kms.arn]
                    }
                ],
                principals: [{
                    type: 'Service',
                    identifiers: ['guardduty.amazonaws.com']
                }]
            },
            {
                sid: 'Deny non-HTTPS access',
                effect: 'Deny',
                actions: ['s3:*'],
                resources: [`arn:aws:s3:::${configuration.orgName}-audit-guardduty-${configuration.region}/*`],
                condition: [{
                  test: 'Bool',
                  variable: 'aws:SecureTransport',
                  values: ['false'],
                }],
                principals: [{
                  type        : '*',
                  identifiers : ['*']
                }]                   
            }
        ]
    });

    const s3 = await new aws.s3.Bucket('GuardDuty', {
        bucket: `${configuration.orgName}-audit-guardduty-${configuration.region}`,
        acl: 'private',
        policy: policyDoc.then(policyDoc => policyDoc.json),
        ...(configuration.enableBucketLogging && {
            loggings: [{
                targetBucket: bucketLogging.bucket,
                targetPrefix: 'guardduty-access'
            }]
        }),
        lifecycleRules: [
            {
                id: 'ARCHIVING',
                enabled: true,
                transitions: [
                    {
                        days: 30,
                        storageClass: 'STANDARD_IA'
                    },
                    {
                        days: configuration.transitionGlacierDays,
                        storage_class: 'GLACIER'
                    }
                ]
            }
        ]
    });
    return s3;
}

async function EnableGuardDuty(configuration,bucketLogging) {

    const kms = await CreateKMS(configuration);

    const s3 = await CreateS3(kms,configuration,bucketLogging);

    const detector = await new aws.guardduty.Detector('GuardDuty', { enable: true });

    const publish = await new aws.guardduty.PublishingDestination('Publish', {
        detectorId: detector.id,
        destinationArn: s3.arn,
        kmsKeyArn: kms.arn
    });


    for (const account of configuration.accounts.filter((a)=> { if (a.env != 'audit') return a})) {
        const member = await new aws.guardduty.Member(account.env,{
            accountId: account.id,
            detectorId: detector.id,
            email: account.email,
            invite: true
        })
    }

}

module.exports = {
    EnableGuardDuty
}