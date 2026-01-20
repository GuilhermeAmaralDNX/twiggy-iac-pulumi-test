const aws = require("@pulumi/aws");

async function CreateKMS() {
    const kms = new aws.kms.Key(`elasticache`, {
        enableKeyRotation: true,
        description: 'KMS key for use in elasticcache instances'
    });
    return kms;
}


async function CreateSubnetGroup(subnets) {
    const subnetGroup = new aws.elasticache.SubnetGroup(`elasticache`, {
        subnetIds: subnets
    });

    return subnetGroup;
}

async function CreateSG(name, vpcId, ingressRules, kms, configuration, vpnAccess, appsAccess,sgApps) {
    const sg = new aws.ec2.SecurityGroup(`sg-${name}`, {
        name: name,
        vpcId: vpcId,
        tags: {
            Name: name
        }
    });


    if (vpnAccess)
        await new aws.ec2.SecurityGroupRule(`vpn-redis-${name}`, {
            description: "Traffic Ingress VPN",
            type: "ingress",
            fromPort: 0,
            toPort: 0,
            protocol: "-1",
            securityGroupId: sg.id,
            sourceSecurityGroupId: configuration.vpnSG
        });



    if (appsAccess)
        await new aws.ec2.SecurityGroupRule(`acredis-${name}`, {
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
        await new aws.ec2.SecurityGroupRule(`${name}-${sgIndex}`, {
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

async function CreaCluster(clusterInfo, sg, subnetGroup, kms) {
    const redis = await new aws.elasticache.ReplicationGroup(`${clusterInfo.name}`, {
        automaticFailoverEnabled: clusterInfo.automaticFailoverEnabled,
        replicationGroupId: clusterInfo.name,
        nodeType: clusterInfo.nodeType,
        description: clusterInfo.description,
        //parameterGroupName
        applyImmediately: clusterInfo.applyImmediately,
        atRestEncryptionEnabled: clusterInfo.atRestEncryptionEnabled,
        transitEncryptionEnabled: clusterInfo.transitEncryptionEnabled,
        engine: clusterInfo.engine,
        engineVersion: clusterInfo.engineVersion,
        kmsKeyId: kms,
        //authToken
        securityGroupIds: [sg],
        multiAzEnabled: clusterInfo.multiAzEnabled,
        snapshotRetentionLimit: clusterInfo.snapshotRetentionLimit,
        snapshotWindow: clusterInfo.snapshotWindow,
        autoMinorVersionUpgrade: clusterInfo.autoMinorVersionUpgrade,
        subnetGroupName: subnetGroup,

    });

    return redis;
}

async function CreateClusterRedis(redisInstances, subnets, vpcId, configuration,sgApps) {
    let subnetGroup;
    let kms;
    let redisEndpoints = [];

    if (redisInstances && redisInstances.length > 0) {
        subnetGroup = await CreateSubnetGroup(subnets);
        kms = await CreateKMS();
    }

    for (const redis of redisInstances) {
        const sg = await CreateSG(redis.name, vpcId, redis.ingressRules, null, configuration, redis.vpnAccess,redis.appsAccess,sgApps);
        const redisCluster = await CreaCluster(redis, sg.id, subnetGroup.name, kms.arn);
        redisEndpoints.push({
            name: redis.name,
            ednpoint: redisCluster.primaryEndpointAddress,
            sg: sg.id
        });
    }

    return redisEndpoints;
}

module.exports = {
    CreateClusterRedis
}