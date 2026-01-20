const aws = require('@pulumi/aws');

const elabPrincipal = {
    "us-east-1" : "127311923021",
    "us-east-2" : "033677994240",
    "us-west-1" : "027434742980",
    "us-west-2" : "797873946194",
    "af-south-1" : "098369216593",
    "ca-central-1" : "985666609251",
    "eu-central-1" : "054676820928",
    "eu-west-1" : "156460612806",
    "eu-west-2" : "652711504416",
    "eu-south-1" : "635631232127",
    "eu-west-3" : "009996457667",
    "eu-north-1" : "897822967062",
    "ap-east-1" : "754344448648",
    "ap-northeast-1" : "582318560864",
    "ap-northeast-2" : "600734575887",
    "ap-northeast-3" : "383597477331",
    "ap-southeast-1" : "114774131450",
    "ap-southeast-2" : "783225319266",
    "ap-south-1" : "718504428378",
    "me-south-1" : "076674570225",
    "sa-east-1" : "507241528517",
    "us-gov-west-1" : "048591011584",
    "us-gov-east-1" : "190560391635",
    "cn-north-1" : "638102146993",
    "cn-northwest-1" : "037604701340"
}


async function CreateS3(configuration,bucketLogging) {

    const accountAllow = [];
    for (const account of configuration.accounts) {
        accountAllow.push(`arn:aws:s3:::${configuration.orgName}-audit-alb-access-logs-${configuration.region}/${account.env}/AWSLogs/${account.id}/*`);
    }

    const policyDoc = aws.iam.getPolicyDocument({
        statements:[{
            sid: "s3AccessLogsPolicySid1",
            effect: "Allow",
            principals: [{
              type: "Service",
              identifiers: ["delivery.logs.amazonaws.com"],
            }],
            actions: [
              "s3:GetBucketAcl"
            ],
            resources: [`arn:aws:s3:::${configuration.orgName}-audit-alb-access-logs-${configuration.region}`]
        },
    {
        sid: "s3AccessLogsPolicySid2",
        effect: "Allow",
        principals: [{
          type: "AWS",
          identifiers: [elabPrincipal[configuration.region]]
        }],
        actions: [
          "s3:PutObject"
        ],
        resources: accountAllow
    },
{
    sid: "s3AccessLogsPolicySid3",
    effect: "Allow",
    principals: [{
      type: "Service",
      identifiers: ["delivery.logs.amazonaws.com"]
    }],
    actions: [
      "s3:PutObject"
    ],
    resources: accountAllow,
    conditions:[{
        test: 'StringEquals',
        variable: 's3:x-amz-acl',
        values: ['bucket-owner-full-control']
    }]
}]
    });

    const s3 = await new aws.s3.Bucket('S3Elb',{
        bucket: `${configuration.orgName}-audit-alb-access-logs-${configuration.region}`,
        acl: 'private',
        policy: policyDoc.then(policyDoc => policyDoc.json),
        ...(configuration.enableBucketLogging && {
            loggings: [{
                targetBucket: bucketLogging.bucket,
                targetPrefix: 's3Elb-access'
            }]
        }),
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
    return s3;
}

module.exports = {
    CreateS3
}