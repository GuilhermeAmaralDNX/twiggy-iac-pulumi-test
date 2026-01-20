const aws = require('@pulumi/aws');

async function CreateConfigRole(configuration) {
    const bucketName = `${configuration.orgName}-audit-config-${configuration.region}`;

    const currentId = await aws.getCallerIdentity();

    const role = await new aws.iam.Role('config-role',{
        namePrefix: 'config-role-',
        assumeRolePolicy: {
            Version: '2012-10-17',
            Statement: [{
                Action: 'sts:AssumeRole',
                Principal: {
                    Service: 'config.amazonaws.com'
                },
                Effect: 'Allow',
                Sid: ''
            }]
        }
    });


    const attachPolicy = await new aws.iam.PolicyAttachment('config',{
        roles:[role.name],
        policyArn: 'arn:aws:iam::aws:policy/service-role/AWS_ConfigRole'
    })

    const policyDoc = await aws.iam.getPolicyDocument({
        statements: [{
            sid    : "1",
            effect : "Allow",
            actions : [
              "s3:PutObject"
            ],
            resources : [
              `arn:aws:s3:::${bucketName}/prefix/AWSLogs/${currentId.accountId}/*`,
            ],
            condition: [{
              test     : "StringLike",
              variable : "s3:x-amz-acl",
              values : [
                "bucket-owner-full-control"
              ]
            }]
        },{
            sid       : "2",
            effect    : "Allow",
            actions   : ["s3:GetBucketAcl"],
            resources : [`arn:aws:s3:::${bucketName}`]
        }]
    });

    const rolePolicy = await new aws.iam.RolePolicy('s3-policy',{
        name: 's3-policy',
        policy: policyDoc.json,
        role: role.name
    });

    return role;

}


async function CreateConfig(role,configuration) {
    const bucketName = `${configuration.orgName}-audit-config-${configuration.region}`;

    const configRecoder = await new aws.cfg.Recorder('default',{
        name: 'default',
        roleArn: role.arn,
        recordingGroup: {
            allSupported: true,
            includeGlobalResourceTypes: configuration.globalConfig
        }
        
    });

    const deliveryChannel = await new aws.cfg.DeliveryChannel('default',{
        name: 'default',
        s3BucketName: bucketName,
        s3KeyPrefix: '',
        snapshotDeliveryProperties: {
            deliveryFrequency: 'Three_Hours'
        }
    },{dependsOn: [configRecoder]});


    await new aws.cfg.RecorderStatus('default',{
        isEnabled: true,
        name: configRecoder.id
    },{dependsOn:[deliveryChannel]});

}

async function EnableConfig(configuration) {
    const role = await CreateConfigRole(configuration);
    await CreateConfig(role,configuration);
}


module.exports = {
    EnableConfig
}