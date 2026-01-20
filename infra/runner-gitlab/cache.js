const aws = require("@pulumi/aws");
const pulumi = require('@pulumi/pulumi');

async function CreateS3Cache(configuration) {

    const current = await aws.getCallerIdentity();


    const buildCache = await new aws.s3.Bucket(`${configuration.name}-buildCache`, {
        acl: "private",
        bucket: `${configuration.cache.bucketPrefix}-gitlab-runner-cache`,
        //tags: local.tags,
        forceDestroy: true,
        versioning: {
            enabled: false,
        },
        lifecycleRules: [{
            id: "clear",
            enabled: configuration.cache.lifecycleClear,
            prefix: configuration.cache.lifecyclePrefix,
            expiration: {
                days: configuration.cache.expirationDays,
            },
            noncurrentVersionExpiration: {
                days: configuration.cache.expirationDays,
            },
        }],
        serverSideEncryptionConfiguration: {
            rule: {
                applyServerSideEncryptionByDefault: {
                    sseAlgorithm: "AES256",
                },
            },
        },
    });

    return buildCache;

}

async function S3CachePolicy(s3,configuration) {
    const policy = await new aws.iam.Policy(`${configuration.name}-docker_machine_cache`, {
        name: `${configuration.name}-docker-machine_cache`,
        path: '/',
        description: 'Policy for docker machine instance to access cache',
        policy: pulumi.all([s3.arn]).apply(([arn]) =>
            `{
            "Version": "2012-10-17",
            "Statement": [
              {
                "Sid": "allowGitLabRunnersAccessCache",
                "Effect": "Allow",
                "Action": [
                  "s3:PutObject",
                  "s3:PutObjectAcl",
                  "s3:GetObject",
                  "s3:GetObjectAcl"
                ],
                "Resource": [
                  "${arn}/*"
                ]
              }
            ]
          }`)
    });
    return policy;
}

module.exports = {
    CreateS3Cache,
    S3CachePolicy
}

