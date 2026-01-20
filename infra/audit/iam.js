const aws = require('@pulumi/aws');


async function CreateSecurityAuditSaml(trustType,configuration) {

    const assumeAuditorIAM = aws.iam.getPolicyDocument({
        statements: [{
            actions: ['sts:AssumeRole'],
            principals:[{
                type: 'AWS',
                identifiers: [configuration.iamPrincipalARN]
            }]
        }]
    });
    
    const assumeAuditorSAML = aws.iam.getPolicyDocument({
        statements: [{
            actions: ['sts:AssumeRoleWithSAML'],
            conditions:[{
                test: 'StringEquals',
                variable: 'SAML:aud',
                values: ['https://signin.aws.amazon.com/saml']
            }],
            principals:[{
                type: 'Federated',
                identifiers: [configuration.samlProviderARN]
            },
            ]
        }]
    });
    


    const assumeRole = trustType === 'saml' ? assumeAuditorSAML : assumeAuditorIAM;

    const role =  await new aws.iam.Role('Auditor',{
        name: 'Auditor',
        assumeRolePolicy: assumeRole.then(assumeRole => assumeRole.json),
        inlinePolicies: [{
            name: 's3_read_logs',
            policy: JSON.stringify({
                Version: '2012-10-17',
                Statement:[
                    {
                        Action   : ['s3:GetObject*', 's3:List*'],
                        Effect   : 'Allow',
                        Resource : `arn:aws:s3:::${configuration.orgName}-audit-*`
                    },
                    {
                        Action   : ['kms:List*', 'kms:Get*', 'kms:Describe*', 'kms:Decrypt'],
                        Effect   : 'Allow',
                        Resource : '*'                        
                    }
                ]
            })
        }]
    });

    const attach = await new aws.iam.RolePolicyAttachment('SecuirtyAudit',{
        role: role.name,
        policyArn: 'arn:aws:iam::aws:policy/SecurityAudit'
    })
}

module.exports = {
    CreateSecurityAuditSaml
}