
const aws = require("@pulumi/aws");


async function CreateKMS(configuration) {
    const kms = await new aws.kms.Key('',{
        description: `GitLab Runner module managed key ${configuration.name}`,
        deletionWindowInDays: null,
        enableKeyRotation: false,
        tags: {
            
        },
        policy: `
        {
            "Version": "2012-10-17",
            "Statement": [
              {
                "Sid": "Enable IAM User Permissions",
                "Effect": "Allow",
                "Principal": {
                  "AWS": [
                    "arn:aws:iam::${configuration.account}:root"
                  ]
                },
                "Action": "kms:*",
                "Resource": "*"
              },
              {
                "Sid": "allowLoggingToCloudWatch",
                "Effect": "Allow",
                "Principal": {
                  "Service": "logs.${configuration.region}.amazonaws.com"
                },
                "Action": [
                  "kms:Encrypt*",
                  "kms:Decrypt*",
                  "kms:ReEncrypt*",
                  "kms:GenerateDataKey*",
                  "kms:Describe*"
                ],
                "Resource": [
                  "*"
                ]
              }
            ]
          }
        `
    })

    return kms;
}

module.exports = {
    CreateKMS
}