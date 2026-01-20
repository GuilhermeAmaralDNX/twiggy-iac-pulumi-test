const aws = require('@pulumi/aws');

async function CreateS3(configuration) {

    const s3 = await new aws.s3.Bucket('audit-logging',{
        bucket: `${configuration.orgName}-audit-bucket-logging-${configuration.region}`,
        acl: 'private',
        //policy: policyDoc.json,
        serverSideEncryptionConfiguration: {
            rule: {
                applyServerSideEncryptionByDefault: {
                    sseAlgorithm: 'AES256'
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
            storage_class: 'GLACIER'
        }]
        }]
    });


    await new aws.s3.BucketLoggingV2(`logging`,{
        bucket: s3.bucket,
        targetBucket: s3.bucket,
        targetPrefix: 'access-logging'
    });

    return s3;
}

module.exports = {
    CreateS3
}