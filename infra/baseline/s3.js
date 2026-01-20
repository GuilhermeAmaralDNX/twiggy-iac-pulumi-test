const aws = require("@pulumi/aws");


async function CreateKMS() {
    const kms = new aws.kms.Key(`logging`,{
        description: 'Kms for encryption buckets load balance access and s3 server access logging',
        enableKeyRotation: true
    });
    return kms;
}

async function CreateBucketServerAccessLogging(kms,configuration) { 
    const bucket = await new aws.s3.Bucket(`access-loggin-${configuration.account}`,{
        bucketPrefix: `access-loggin-${configuration.account}`,
        acl: 'private',        
        versioning: {
            enabled: false
        },
        lifecycleRules: [{
            id: "clear",
            enabled: true,
            //prefix:'/',
            expiration: {
                days: configuration.bucketAccessLogsRentition
            },
            noncurrentVersionExpiration: {
                days: configuration.bucketAccessLogsRentition,
            },            
        }],        
        serverSideEncryptionConfiguration: {
            rule: {
                bucketKeyEnabled: true,
                applyServerSideEncryptionByDefault: {
                    kmsMasterKeyId: kms.arn,
                    sseAlgorithm: 'aws:kms'
                }
            }
        }
    });

    /*await new aws.s3.BucketLoggingV2(`logging`,{
        bucket: bucket.bucket,
        targetBucket: bucket.bucket,
        targetPrefix: 'access-logging'
    });*/

    return bucket.bucket;
}


async function CreateBucketAccessLoadBalance(kms,configuration) {
    
    const bucket = await new aws.s3.Bucket(`access-elb-${configuration.account}`,{
        bucketPrefix: `access-elb-${configuration.account}`,
        acl: 'private',        
        versioning: {
            enabled: false
        },
        lifecycleRules: [{
            id: "clear",
            enabled: true,
            //prefix:'/',
            expiration: {
                days: configuration.bucketAccessLogsRentition
            },
            noncurrentVersionExpiration: {
                days: configuration.bucketAccessLogsRentition,
            },            
        }],
        serverSideEncryptionConfiguration: {
            rule: {
                bucketKeyEnabled: true,
                applyServerSideEncryptionByDefault: {
                    kmsMasterKeyId: kms.arn,
                    sseAlgorithm: 'aws:kms'
                }
            }
        }
    });

    /*await new aws.s3.BucketLoggingV2(`logging-elb`,{
        bucket: bucket.bucket,
        targetBucket: bucket.bucket,
        targetPrefix: 'access-logging'
    });*/

    return bucket.bucket;
}



module.exports = {
    CreateBucketServerAccessLogging,
    CreateBucketAccessLoadBalance,
    CreateKMS

}