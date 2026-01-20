const aws = require("@pulumi/aws");


async function CreateKMS() {
    const kms = new aws.kms.Key(`dms`, {
        enableKeyRotation: true,
        description: 'KMS key for use in dms instances'
    });
    return kms;
}


async function CreateReplicationSubnetGroup(subnets,dmsRoles) {
   const subGroup =   await new aws.dms.ReplicationSubnetGroup("dms", {
        replicationSubnetGroupId: 'dms',
        replicationSubnetGroupDescription: 'dms',
        subnetIds: subnets.ids

    },{dependsOn: dmsRoles});

    return subGroup
}

async function CreateDMS(vpc,instance,subnetGroup,kms,dmsRoles) {

    const sg = await new aws.ec2.SecurityGroup(instance.instanceName, {
        name: instance.instanceName,
        vpcId: vpc.id,
    });
    
    await new aws.ec2.SecurityGroupRule(instance.instanceName, {
        type: 'egress',
        fromPort: 0,
        toPort: 0,
        protocol: '-1',
        cidrBlocks: ['0.0.0.0/0'],
        securityGroupId: sg.id
    });

    const dmsInstance = await new aws.dms.ReplicationInstance(instance.instanceName, {
        replicationInstanceClass: instance.instanceClass,
        replicationInstanceId: instance.instanceName,
        allocatedStorage: instance.allocatedStorage,
        applyImmediately: instance.applyImmediately,
        engineVersion: instance.engineVersion,
        replicationSubnetGroupId: subnetGroup.id,
        kmsKeyArn: kms.arn,
        vpcSecurityGroupIds: [sg.id],
        publiclyAccessible: instance.publiclyAccessible,        
    },{dependsOn: dmsRoles});

    return dmsInstance;
}

async function  DMSEndpointRole(){
    const policy = await new aws.iam.Policy("endpoint-policy", {
        name: "DMS_for_Secrets",
        description: "DMS for Secrets",
        policy: JSON.stringify({
            Version: "2012-10-17",
            Statement: [
            {
                Action: [
                    "secretsManager:GetSecretValue",
                    "secretsManager:List*",
                    "secretsManager:Describe*"
                ],
                Effect: "Allow",
                Resource: "*",
            },
            {
                Action: [
                    "kms:Encrypt",
                    "kms:Decrypt",
                    "kms:GenerateDataKey"
                ],
                Effect: "Allow",
                Resource: "*",
            },
            {
                Action: [
                    "s3:GetObject",
                    "s3:PutObject",
                    "s3:PutObjectAcl",
                    "s3:GetObjectAcl",
                    "s3:ListBucket",
                    "s3:ListObjects",
                    "s3:CreateBucket",
                    "s3:DeleteObject"
                ],
                Effect: "Allow",
                Resource: ["*"]
            }        
        
        ]
    })});


    const dmsAssumeRole = await aws.iam.getPolicyDocument({
        statements: [{
            actions: ["sts:AssumeRole"],
            effect: "Allow",
            principals: [{
                identifiers: ["dms.amazonaws.com", "dms.us-east-2.amazonaws.com"],
                type: "Service",
            }],
        }],
    });

    const endpointRole =  await new aws.iam.Role("role-endpoint", {
        assumeRolePolicy: dmsAssumeRole.json,
        name: "role-endpoint",
    });


    await new aws.iam.RolePolicyAttachment("attach-role-endpoint", {
        policyArn: policy.arn,
        role: endpointRole.name
    }); 

    return endpointRole;

}

async function DMSManagedAccess(){
    const policys3 = await new aws.iam.Policy("policys3dms", {
        name: "DMS_for_Secrets_s3",
        description: "DMS for Secrets",
        policy: JSON.stringify({
            Version: "2012-10-17",
            Statement: [{
                Action: [
                    "secretsManager:GetSecretValue",
                    "secretsManager:List*",
                    "secretsManager: Describe*"
                ],
                Effect: "Allow",
                Resource: "*",
            },
            {
                Action: [
                    "kms:Encrypt",
                    "kms:Decrypt",
                    "kms:GenerateDataKey"
                ],
                Effect: "Allow",
                Resource: "*",
            }       
        
        ]
    })});

    const dmsAssumeRole = await aws.iam.getPolicyDocument({
        statements: [{
            actions: ["sts:AssumeRole"],
            principals: [{
                identifiers: ["dms.amazonaws.com","dms.us-east-2.amazonaws.com","redshift.amazonaws.com","redshift.us-east-2.amazonaws.com"],
                type: "Service",
            }],
        }],
    });


    const dmsAccess = new aws.iam.Role("dms-access-for-endpoint", {
        assumeRolePolicy: dmsAssumeRole.json,
        name: "dms-access-for-endpoint",
    });

     new aws.iam.RolePolicyAttachment("dms-access-for-endpoint-AmazonDMSRedshiftS3Role", {
        policyArn: "arn:aws:iam::aws:policy/service-role/AmazonDMSRedshiftS3Role",
        role: dmsAccess.name
    });

    //KMS permisssion
    new aws.iam.RolePolicyAttachment("dms-access-for-endpoint-AmazonDMSRedshiftS3Rolee", {
        policyArn: policys3.arn,
        role: dmsAccess.name
    });


    const dmsCloudWatchLogs = new aws.iam.Role("dms-cloudwatch-logs-role", {
        assumeRolePolicy: dmsAssumeRole.json,
        name: "dms-cloudwatch-logs-role",
    });

     new aws.iam.RolePolicyAttachment("dms-cloudwatch-logs-role-AmazonDMSCloudWatchLogsRole", {
        policyArn: "arn:aws:iam::aws:policy/service-role/AmazonDMSCloudWatchLogsRole",
        role: dmsCloudWatchLogs.name
    });


    const dmsVPCRole = new aws.iam.Role("dms-vpc-role", {
        assumeRolePolicy: dmsAssumeRole.json,
        name: "dms-vpc-role",
    });

     new aws.iam.RolePolicyAttachment("dms-vpc-role-AmazonDMSVPCManagementRole", {
        policyArn: "arn:aws:iam::aws:policy/service-role/AmazonDMSVPCManagementRole",
        role: dmsVPCRole.name
    });

    const rolesDMS = [dmsAccess,dmsCloudWatchLogs,dmsVPCRole]
    return rolesDMS
}

async function CreateDMSEnpointS3(s3endpoint) {
    await new aws.dms.S3Endpoint(s3endpoint.name,{
        endpointId: s3endpoint.endpointId,
        endpointType: s3endpoint.endpointType,
        bucketName: s3endpoint.bucketName,
        serviceAccessRoleArn: s3endpoint.serviceAccessRoleArn,
        dataFormat: s3endpoint.dataformat,
        includeOpForFullLoad: s3endpoint.includeOpForFullLoad,
        timestampColumnName: s3endpoint.timestampColumnName,
        addColumnName: s3endpoint.addColumnName,

    })
    
}

async function CreateDMSEndpoints(endpoint,dmsAccess) {

    const dmsEndpoints = await new aws.dms.Endpoint(endpoint.name, {
        endpointId: endpoint.endpointId,
        endpointType: endpoint.endpointType,
        engineName: endpoint.engineName,
        ...(endpoint.engineName != "s3" && {
            databaseName: endpoint.databaseName,
            secretsManagerArn: endpoint.secretArn,
            secretsManagerAccessRoleArn: dmsAccess.arn
        }),

        ...( (endpoint.engineName === "postgres" || endpoint.engineName === "aurora-postgresql") && {            postgresSettings: {       
            captureDdls: endpoint.captureDdls, //true,
            failTasksOnLobTruncation: endpoint.failTasksOnLobTruncation,//false,
            heartbeatEnable: endpoint.heartbeatEnable,//true,
            heartbeatFrequency: endpoint.heartbeatFrequency,//5,
            heartbeatSchema: endpoint.heartbeatSchema,//"public", //por como input
            mapBooleanAsBoolean: endpoint.mapBooleanAsBoolean,//true,
            mapJsonbAsClob: endpoint.mapJsonbAsClob,//true,
            pluginName: endpoint.pluginName, //"pglogical", //por como input
            // slotName: endpoint.slotName, //"dms_replication", //por como input   
            }        
        }), 
        ...(endpoint.engineName === "redshift" && {
            redshiftSettings: {
                bucketName: endpoint.bucketName,
                serviceAccessRoleArn: endpoint.serviceAccessRoleArn,
                encryptionMode: "SSE_S3",
                // serverSideEncryptionKmsKeyId: endpoint.serverSideEncryptionKmsKeyId
            }
        })
    });

    

}



async function ReplicationTask(replication,DMSInstance) {

    await new aws.dms.ReplicationTask(replication.replicationTaskId, {

        migrationType: replication.migrationType,
        replicationInstanceArn: DMSInstance.replicationInstanceArn, //referenciar da funcao da instancia
        replicationTaskId: replication.replicationTaskId,
        replicationTaskSettings: JSON.stringify(replication.replicationTaskSettings),
        sourceEndpointArn: replication.sourceEndpointArn,
        targetEndpointArn: replication.targetEndpointArn,
        tableMappings: JSON.stringify(replication.tableMappings)

    },
    {
        ignoreChanges: ["replicationTaskSettings"]
    });

}

async function Create(subnetPrivate,vpc,dmsConfig,replication) {
    
    let dmsSubnetGroup;
    let dmsRoles;
    let kms;
    let roleEndpoint;
    if(dmsConfig.length > 0 ){
        dmsRoles = await DMSManagedAccess();
        roleEndpoint = await DMSEndpointRole()
        dmsSubnetGroup = await CreateReplicationSubnetGroup(subnetPrivate,dmsRoles);
        kms = await CreateKMS();
    };

    for( const instance of dmsConfig){
        const DMSInstance = await CreateDMS(vpc,instance,dmsSubnetGroup,kms,dmsRoles)

        for (const endpointConfig of instance.endpointConfigs) {
            if (endpointConfig.engineName !== "s3") {
                await CreateDMSEndpoints(endpointConfig, roleEndpoint);
            } 
            if (endpointConfig.engineName === "s3") {
                await CreateDMSEnpointS3(endpointConfig, roleEndpoint);
            }
        }

        
        for (const taskConfig of instance.replicationTasks) {
            await ReplicationTask(taskConfig,DMSInstance);
        }
        
    };
    
}


module.exports = { Create }