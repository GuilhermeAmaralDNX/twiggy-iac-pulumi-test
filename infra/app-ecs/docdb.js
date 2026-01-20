const aws = require("@pulumi/aws");
const pulumi = require('@pulumi/pulumi');
const random = require("@pulumi/random")

async function CreateSSMDocDB(name, instance, password) {

    const credentials = pulumi.all([instance.endpoint, password.result]).apply(([address, result]) => `
{   "name": "${name}",
    "address":  "${address}"   ,
    "password": "${result}"
}` );

    await new aws.ssm.Parameter(`doc-${name}`, {
        name: `/docdb/${name}`,
        type: 'SecureString',
        value: credentials
    });


}

async function CreateKMS() {
    const kms = new aws.kms.Key(`docdb`, {
        enableKeyRotation: true,
        description: 'KMS key for use in DocDB'
    });
    return kms;
}

async function CreateSubnetGroup(subnets) {
    const subnetGroup = new aws.docdb.SubnetGroup(`docdb`, {
        subnetIds: subnets,
        namePrefix: 'docdb',
    });

    return subnetGroup;
}

async function CreateSG(name, vpcId, ingressRules, configuration, vpnAccess, appsAccess, sgApps) {
    const sg = new aws.ec2.SecurityGroup(`doc-${name}`, {
        name: `${name}-docdb-sg`,
        vpcId: vpcId
    });


    if (vpnAccess)
        await new aws.ec2.SecurityGroupRule(`vpn-doc-${name}`, {
            description: "Traffic Ingress VPN",
            type: "ingress",
            fromPort: 0,
            toPort: 0,
            protocol: "-1",
            securityGroupId: sg.id,
            sourceSecurityGroupId: configuration.vpnSG
        });


    if (appsAccess)
        await new aws.ec2.SecurityGroupRule(`acdoc-${name}`, {
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
        await new aws.ec2.SecurityGroupRule(`doc-${name}-${sgIndex}`, {
            securityGroupId: sg.id,
            fromPort: ingress.fromPort,
            toPort: ingress.toPort,
            protocol: ingress.protocol,
            type: 'ingress',
            ...(ingress.sourceSecurityGroupId && ({ sourceSecurityGroupId: ingress.sourceSecurityGroupId })),
            ...((ingress.cidrBlocks ? ingress.cidrBlocks.length > 0 ? true : false : false) && ({ cidrBlocks: ingress.cidrBlocks }))
        });
        sgIndex++;
    }

    return sg;
}

async function CreateDocDB(clusterInfo, dbSubnet, sg, kms) {

    const password = new random.RandomPassword(`pwd-doc-${clusterInfo.name}`, {
        length: 12,
        special: false,
        lower: true,
        upper: true,
        number: true,
        overrideSpecial: `@`,
    });

    const cluster = await new aws.docdb.Cluster(`${clusterInfo.name}`, {
        applyImmediately: clusterInfo.applyImmediately,
        availabilityZones: clusterInfo.availabilityZones,
        backupRetentionPeriod: clusterInfo.backupRetentionPeriod,
        clusterIdentifier: clusterInfo.clusterIdentifier,
        dbSubnetGroupName: dbSubnet,
        engine: clusterInfo.engine,
        engineVersion: clusterInfo.engineVersion,
        masterUsername: clusterInfo.masterUsername,
        masterPassword: password.result,
        kmsKeyId: kms,
        skipFinalSnapshot: clusterInfo.skipFinalSnapshot,
        storageEncrypted: true,
        vpcSecurityGroupIds: [sg],
        tags: {
            Name: clusterInfo.name
        }
    });

    await CreateSSMDocDB(clusterInfo.name, cluster, password);


    for (const instance of clusterInfo.instances) {
        await new aws.docdb.ClusterInstance(instance.name, {
            clusterIdentifier: cluster.id,
            instanceClass: instance.instanceClass,
            applyImmediately: instance.applyImmediately,
            autoMinorVersionUpgrade: instance.autoMinorVersionUpgrade,
            availabilityZone: instance.availabilityZone,
            engine: instance.engine,
            tags: {
                Name: instance.name
            }
        });
    }

    return cluster;

}

async function CreateDocDBClusters(clusters, vpcId, subnetSecure, configuration,sgApps) {

    let subnetGroupDocDB;
    let kmsDocDB;
    if (clusters.length > 0) {
        subnetGroupDocDB = await CreateSubnetGroup(subnetSecure.ids);
        kmsDocDB = await CreateKMS();
    }


    let endpoints = [];
    for (const cluster of clusters) {
        const sg = await CreateSG(cluster.name, vpcId, cluster.ingressRules, configuration, cluster.vpnAccess,cluster.appsAccess,sgApps);
        const docInstance = await CreateDocDB(cluster, subnetGroupDocDB, sg.id, kmsDocDB.arn);
        endpoints.push({
            name: cluster.name,
            endpoint: docInstance.endpoint,
            sg: sg.id
        })
    }

    return endpoints;
}


module.exports = {
    CreateDocDBClusters,
    CreateSubnetGroup,
    CreateKMS
}