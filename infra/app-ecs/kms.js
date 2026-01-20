const aws = require("@pulumi/aws");
//const config = require('./conf');

async function CreateKMS(configuration) {

    const current = await aws.getCallerIdentity();

    const policyDoc = await aws.iam.getPolicyDocument({
        version: '2012-10-17',
        statements: [{
            sid: 'Enable IAM User Permissions',
            effect: 'Allow',
            principals: [{
                type:'AWS',
                identifiers: [`arn:aws:iam::${current.accountId}:root`]
            }],
            actions: ['kms:*'],
            resources: ['*']
        },
        {
            sid: 'Allow service-linked role use of the customer managed key',
            effect: 'Allow',
            principals: [{
                type:'AWS',
                identifiers: [`arn:aws:iam::${current.accountId}:role/aws-service-role/autoscaling.amazonaws.com/AWSServiceRoleForAutoScaling`]                
            }],
            actions: [
                "kms:Encrypt",
                "kms:Decrypt",
                "kms:ReEncrypt*",
                "kms:GenerateDataKey*",
                "kms:DescribeKey"
            ],
            resources: ['*'],
        },
        {
            sid: 'Allow access to EFS for all principals in the account that are authorized to use EFS',
            effect: 'Allow',
            principals: [{
                type:'AWS',
                identifiers: [`*`]                
            }],
            actions: [
                "kms:Encrypt",
                "kms:Decrypt",
                "kms:ReEncrypt*",
                "kms:GenerateDataKey*",
                "kms:CreateGrant",
                "kms:DescribeKey"
            ],
            resources: ['*'],
            conditions: [{
                test: 'StringEquals',
                variable: 'kms:ViaService',
                values: [`elasticfilesystem.${configuration.region}.amazonaws.com`]                
                },
                {
                    test: 'StringEquals',
                    variable: 'kms:CallerAccount',
                    values: [`${current.accountId}`]                                    
                }
        ]
        },        
        {
            sid: "Allow attachment of persistent resources",
            effect: "Allow",
            principals: [{
                type:'AWS',
                identifiers: [`arn:aws:iam::${current.accountId}:role/aws-service-role/autoscaling.amazonaws.com/AWSServiceRoleForAutoScaling`]                
            }],
            actions: ["kms:CreateGrant"],
            resources: ['*']          
        }
    
    ]
    })

    const kms = await new  aws.kms.Key(`ecs-${configuration.ecsName}`,{
        policy: policyDoc.json,
        tags: {
            Name: `ecs-${configuration.ecsName}-${configuration.account}-${configuration.region}`
        }
    });

    return kms;
}

module.exports = {
    CreateKMS
}