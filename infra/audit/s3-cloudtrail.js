const aws = require('@pulumi/aws');

async function CreateKMS(configuration) {

    const identy = await aws.getCallerIdentity();

    const accountAllow = [];
    accountAllow.push(`arn:aws:cloudtrail:*:${identy.accountId}:trail/*`)

    for (const account of configuration.accounts) {
        accountAllow.push(`arn:aws:cloudtrail:*:${account.id}:trail/*`);
    }




    const policyDoc = aws.iam.getPolicyDocument({
        statements: [{
            sid: 'Enable IAM User Permissions',
            effect: 'Allow',
            principals: [{
              type: 'AWS',
              identifiers: [`arn:aws:iam::${identy.accountId}:root`],
            }],
            actions: ['kms:*'],
            resources: ['*']
        },
        {
            sid: 'Allow CloudTrail to encrypt logs',
            effect: 'Allow',
            principals: [{
              type: 'Service',
              identifiers: ['cloudtrail.amazonaws.com']
            }],
            actions: ['kms:GenerateDataKey*'],
            resources: ['*'],
            conditions: [{
                test: 'StringLike',
                variable: 'kms:EncryptionContext:aws:cloudtrail:arn',
                values: accountAllow //<==========
            }]
        },
        {
            sid: 'Allow CloudWatch Access',
            effect: 'Allow',
            principals: [{
              type        : 'Service',
              identifiers : ['logs.amazonaws.com'],
            }],
            actions: [
              'kms:Encrypt*',
              'kms:Decrypt*',
              'kms:ReEncrypt*',
              'kms:GenerateDataKey*',
              'kms:Describe*'
            ],
            resources: ['*']
        },
        {
            sid: 'Allow Describe Key access',
            effect: 'Allow',
            principals: [{
              type: 'Service',
              identifiers: ['cloudtrail.amazonaws.com', 'lambda.amazonaws.com'],
            }],
            actions: ['kms:DescribeKey'],
            resources: ['*']              
        }
    ]
    });

    const kms = await new aws.kms.Key('Cloudtrail',{
        deletionWindowInDays: 7,
        description: 'CloudTrail Log Encryption Key',
        enableKeyRotation: true,
        policy: policyDoc.then(policyDoc => policyDoc.json),
    })

    const alias = await new aws.kms.Alias('cloudtrail',{
        name: `alias/${configuration.orgName}-cloudtrail`,
        targetKeyId: kms.keyId
    });
    

    return kms;
}


async function CreateS3(configuration,bucketLogging) {

    const kms = await CreateKMS(configuration);

    const accountAllow = [];
    for (const account of configuration.accounts) {
        accountAllow.push(`arn:aws:s3:::${configuration.orgName}-audit-cloudtrail-${configuration.region}/AWSLogs/${account.id}/*`)
    }
    

    const org = await aws.organizations.getOrganization();
    
    const currentId = await aws.getCallerIdentity();

    const policyDoc = aws.iam.getPolicyDocument({
        statements: [{
            sid: "CloudTrailAclCheck",
            effect: "Allow",
            principals: [{
              type: "Service",
              identifiers: ["cloudtrail.amazonaws.com"]
            }],
            actions: ["s3:GetBucketAcl"],
            resources: [`arn:aws:s3:::${configuration.orgName}-audit-cloudtrail-${configuration.region}`]
        },
        {
            sid: "CloudTrailWriteMaster",
            effect: "Allow",
            principals: [{
              type: "Service",
              identifiers: ["cloudtrail.amazonaws.com"]
            }],
            actions: ["s3:PutObject"],
            resources: [
                `arn:aws:s3:::${configuration.orgName}-audit-cloudtrail-${configuration.region}/AWSLogs/${org.masterAccountId}/*`,
                `arn:aws:s3:::${configuration.orgName}-audit-cloudtrail-${configuration.region}/AWSLogs/${currentId.accountId}/*`
                ],
            conditions: [{
                test: 'StringEquals',
                variable: 's3:x-amz-acl',
                values: ["bucket-owner-full-control"]
            }]
        },
    {
        sid: "CloudTrailWriteAccounts",
        effect: "Allow",
        principals: [{
          type: "Service",
          identifiers: ["cloudtrail.amazonaws.com"]
        }],
        actions: ["s3:PutObject"],
        resources: accountAllow,//<=======================
        conditions: [{
            test: 'StringEquals',
            variable: 's3:x-amz-acl',
            values: ["bucket-owner-full-control"]
        }]            
    }]
    });


    const s3 = await new aws.s3.Bucket('audit-cloudtrail',{
        bucket: `${configuration.orgName}-audit-cloudtrail-${configuration.region}`,
        policy: policyDoc.then(policyDoc => policyDoc.json),
        ...(configuration.enableBucketLogging && {
            loggings: [{
                targetBucket: bucketLogging.bucket,
                targetPrefix: 'audit-cloudtrail-access'
            }]
        }),
        serverSideEncryptionConfiguration: {
            rule: {
                applyServerSideEncryptionByDefault: {
                    sseAlgorithm: 'aws:kms'
                }
            }
        },
        lifecycleRules: [{
            id: 'ARCHIVING',
            enabled: true,
            transitions: [{
                days: 30,
                storageClass: 'STANDARD_IA'
            },
            {
                days: configuration.transitionGlacierDays,
                storageClass: 'GLACIER'
            }]
        }]
    });
    return {
        s3: s3,
        kms: kms
    };
}

module.exports = {
    CreateS3
}