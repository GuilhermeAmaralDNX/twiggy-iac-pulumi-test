const aws = require("@pulumi/aws");
const pulumi = require('@pulumi/pulumi');
const generator = require('generate-password');
const random = require("@pulumi/random");

async function CreateSSMCredentialsAurora(name, instance, password) {

    const credentials = pulumi.all([instance.endpoint, password.result]).apply(([address, result]) => `
{   "name": "${name}",
    "address":  "${address}"   ,
    "password": "${result}"
}` );

    await new aws.ssm.Parameter(`${name}`, {
        name: `/aurora/${name}`,
        type: 'SecureString',
        value: credentials
    });


}

async function CreateSSMCredentials(name, instance, password) {

    const credentials = pulumi.all([instance.address, password.result]).apply(([address, result]) => `
{   "name": "${name}",
    "address":  "${address}"   ,
    "password": "${result}"
}` );

    await new aws.ssm.Parameter(`${name}`, {
        name: `/rds/${name}`,
        type: 'SecureString',
        value: credentials
    });


}

async function CreateKMS() {
    const kms = new aws.kms.Key(`rds`, {
        enableKeyRotation: true,
        description: 'KMS key for use in rds instances'
    });
    return kms;
}

async function CreateSubnetGroup(subnets) {
    const subnetGroup = new aws.rds.SubnetGroup(`rds`, {
        name: 'rds',
        subnetIds: subnets
    });

    return subnetGroup;
}


async function CreateSG(name, vpcId, ingressRules, configuration, vpnAccess, appsAccess, sgApps) {
    const sg = new aws.ec2.SecurityGroup(`rds-${name}`, {
        name: `${name}-rds-sg`,
        vpcId: vpcId
    });


    if (vpnAccess)
        await new aws.ec2.SecurityGroupRule(`vpn-${name}`, {
            description: "Traffic Ingress VPN",
            type: "ingress",
            fromPort: 0,
            toPort: 0,
            protocol: "-1",
            securityGroupId: sg.id,
            sourceSecurityGroupId: configuration.vpnSG
        });

    if (appsAccess)
        await new aws.ec2.SecurityGroupRule(`acrds-${name}`, {
            description: "Traffic Ingress APPS",
            type: "ingress",
            fromPort: 0,
            toPort: 0,
            protocol: "-1",
            securityGroupId: sg.id,
            sourceSecurityGroupId: sgApps
        });



    let sgIndex = 0;
    for (const ingress of ingressRules) {
        await new aws.ec2.SecurityGroupRule(`rds-${name}-${sgIndex}`, {
            securityGroupId: sg.id,
            fromPort: parseInt(ingress.fromPort),
            toPort: parseInt(ingress.toPort),
            protocol: ingress.protocol,
            type: 'ingress',
            ...(ingress.sourceSecurityGroupId && ({ sourceSecurityGroupId: ingress.sourceSecurityGroupId })),
            ...((ingress.cidrBlocks ? ingress.cidrBlocks.length > 0 ? true : false : false) && ({ cidrBlocks: ingress.cidrBlocks }))
        });
        sgIndex++;
    }

    return sg;
}

async function CreateAurora(cluster, sg, subnetGroup, kms) {

    const password = new random.RandomPassword(`pwd-${cluster.name}`, {
        length: 12,
        special: false,
        lower: true,
        upper: true,
        number: true,
        overrideSpecial: `@`,
    });

    let tags = cluster.tags;

    const aurora = await new aws.rds.Cluster(`${cluster.name}`, {
        //allocatedStorage: cluster.allocatedStorage,
        allowMajorVersionUpgrade: cluster.allowMajorVersionUpgrade,
        applyImmediately: cluster.applyImmediately,
        availabilityZones: cluster.availabilityZones,
        backupRetentionPeriod: cluster.backupRetentionPeriod,
        clusterIdentifier: cluster.name,
        ...((!cluster.snapshotId) && { databaseName: cluster.name }),
        dbSubnetGroupName: subnetGroup,
        storageEncrypted: cluster.storageEncrypted,
        engine: cluster.engine,
        vpcSecurityGroupIds: [sg],
        engineVersion: cluster.engineVersion,
        skipFinalSnapshot: true,
        engineMode: cluster.engineMode,
        iamDatabaseAuthenticationEnabled: cluster.iamDatabaseAuthenticationEnabled || false, // Valor default
        kmsKeyId: kms,
        ...(cluster.snapshotId && { snapshotIdentifier: cluster.snapshotId }),
        ...((!cluster.snapshotId) && { masterUsername: cluster.masterUsername, masterPassword: password.result }),
        masterPassword: password.result,
        ...(cluster.serverless && {
            serverlessv2ScalingConfiguration: {
                minCapacity: cluster.serverlessMinCapacity,
                maxCapacity: cluster.serverlessMaxCapacity
            }
        }),
        tags: tags,
    }, { ignoreChanges: cluster.ignoreChanges });

    await new aws.rds.ClusterInstance(cluster.node_write.name, {
        identifierPrefix: cluster.node_write.name,
        clusterIdentifier: aurora.id,
        instanceClass: cluster.node_write.instanceClass,
        engine: cluster.node_write.engine,
        engineVersion: cluster.node_write.engineVersion,
        publiclyAccessible: cluster.node_write.publiclyAccessible,
        tags: tags
    });


    if (cluster.node_read)
        await new aws.appautoscaling.Target(`ro-${cluster.node_read.name}`, {
            minCapacity: cluster.node_read.minCapacity,
            maxCapacity: cluster.node_read.maxCapacity,
            resourceId: aurora.id.apply(id => `cluster:${id}`),
            scalableDimension: 'rds:cluster:ReadReplicaCount',
            serviceNamespace: 'rds',
        }, { ignoreChanges: ['minCapacity', 'maxCapacity'] });


    await CreateSSMCredentialsAurora(cluster.name, aurora, password);

    return aurora;
}

async function CreateRDS(instaceInfo, sg, subnetGroup, kms) {


    const password = new random.RandomPassword(`pwd-${instaceInfo.name}`, {
        length: 12,
        special: false,
        lower: true,
        upper: true,
        number: true,
        overrideSpecial: `@`,
    });

    let tags = instaceInfo.tags;

    let parameterGroup;
    if (instaceInfo.customParameter) {
        parameterGroup = await new aws.rds.ParameterGroup(`${instaceInfo.name}-cp`, {
            family: instaceInfo.customParameter.family, 
            parameters: instaceInfo.customParameter.parameters.map(param => ({
                name: param.name,
                value: param.value,
                applyMethod: param.apply_method
            })),  
        });
    }

    const instance = new aws.rds.Instance(`${instaceInfo.name}`, {
        instanceClass: instaceInfo.instanceClass,
        allocatedStorage: instaceInfo.allocatedStorage,
        maxAllocatedStorage: instaceInfo.maxAllocatedStorage,
        allowMajorVersionUpgrade: instaceInfo.allowMajorVersionUpgrade,
        applyImmediately: instaceInfo.applyImmediately,
        autoMinorVersionUpgrade: instaceInfo.autoMinorVersionUpgrade,
        availabilityZone: instaceInfo.availabilityZone,
        backupRetentionPeriod: instaceInfo.backupRetentionPeriod,
        backupWindow: instaceInfo.backupWindow,
        iamDatabaseAuthenticationEnabled: instaceInfo.iamDatabaseAuthenticationEnabled || false, // Valor default
        dbSubnetGroupName: subnetGroup,
        ...((!instaceInfo.snapshotId) && { dbName: instaceInfo.dbName }),
        ...((!instaceInfo.snapshotId) && { engine: instaceInfo.engine }),
        ...((!instaceInfo.snapshotId) && { engineVersion: instaceInfo.engineVersion }),
        identifier: instaceInfo.name,
        kmsKeyId: kms,
        ...((instaceInfo.customParameter) && { parameterGroupName: parameterGroup.name }),
        multiAz: instaceInfo.multiAz,
        storageType: instaceInfo.storageType,
        vpcSecurityGroupIds: [sg],
        publiclyAccessible: instaceInfo.publiclyAccessible,
        skipFinalSnapshot: instaceInfo.skipFinalSnapshot,
        storageEncrypted: instaceInfo.storageEncrypted,
        ...((instaceInfo.snapshotId) && { snapshotIdentifier: instaceInfo.snapshotId }),
        ...((!instaceInfo.snapshotId) && { username: instaceInfo.username }),
        ...((!instaceInfo.snapshotId) && { password: password.result }),
        tags: tags
        // tags: {
        //     Name: instaceInfo.name,
        //     Backup: instaceInfo.backup
        // }
    }, { ignoreChanges: instaceInfo.ignoreChanges });
    

    await CreateSSMCredentials(instaceInfo.name, instance, password);

    return instance;
}

async function CreateInstances(instances, vpcId, kms, subnetGroup, configuration,sgApps) {
    let endpoints = [];

    for (const instance of instances) {
        const sg = await CreateSG(instance.name, vpcId, instance.ingressRules, configuration, instance.vpnAccess,instance.appsAccess,sgApps);
        const instanceRDS = await CreateRDS(instance, sg.id, subnetGroup.name, kms.arn);
        endpoints.push({
            name: instance.name,
            ednpoint: instanceRDS.endpoint
        });
    
    
    }

    return endpoints;
}

async function CreatClustersAurora(clusters, vpcId, kms, subnetGroup, configuration,sgApps) {
    let endpoints = [];
    for (const instance of clusters) {
        const sg = await CreateSG(instance.name, vpcId, instance.ingressRules, configuration, instance.vpnAccess,instance.appsAccess,sgApps);
        const instanceRDS = await CreateAurora(instance, sg.id, subnetGroup.name, kms.arn);
        endpoints.push({
            name: instance.name,
            ednpoint: instanceRDS.endpoint,
            sg: sg.id
        });
    }

    return endpoints;

}


async function Create(inputRDS, vpc, subnetSecure, configuration,sgApps, createKmsOnly) {
    // Handle empty or undefined input
    if (!inputRDS) {
        inputRDS = { instance: [], cluster: [] };
    }
    
    // Ensure instance and cluster arrays exist
    if (!inputRDS.instance) inputRDS.instance = [];
    if (!inputRDS.cluster) inputRDS.cluster = [];

    let subnetGroup;
    let kms;
    if (inputRDS.instance.length > 0 || inputRDS.cluster.length > 0 || createKmsOnly) {
        subnetGroup = await CreateSubnetGroup(subnetSecure.ids);
        kms = await CreateKMS();
    }
    const clustersAurora = await CreatClustersAurora(inputRDS.cluster, vpc.id, kms, subnetGroup, configuration,sgApps);
    const instancesRDS = await CreateInstances(inputRDS.instance, vpc.id, kms, subnetGroup, configuration,sgApps);
}


module.exports = {
    CreateInstances,
    CreatClustersAurora,
    CreateSubnetGroup,
    CreateKMS,
    Create
}