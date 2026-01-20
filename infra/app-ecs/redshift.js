const aws = require("@pulumi/aws");
const pulumi = require('@pulumi/pulumi');
const generator = require('generate-password');
const random = require("@pulumi/random");
const aws_native = require("@pulumi/aws-native");



async function CreateSSMCredentialsRedshift(cluster, instance, password) {

    const credentials = pulumi.all([instance.endpoint, password.result]).apply(([address, result]) => `
{   "name": "${cluster.name}",
    "address":  "${address}" ,
    "user": "${cluster.username}"
    "password": "${result}"
}` );

    await new aws.ssm.Parameter(`${cluster.name}`, {
        name: `/redhisft/${cluster.name}`,
        type: 'SecureString',
        value: credentials
    });


}

async function CreateKMS() {
    const kms = new aws.kms.Key(`rs`, {
        enableKeyRotation: true,
        description: 'KMS key for use in redshift instances'
    });
    return kms;
}

async function CreateSubnetGroup(subnets) {
    const subnetGroup = new aws.redshift.SubnetGroup(`redshift`, {
        name: 'redshift',
        subnetIds: subnets
    });

    return subnetGroup;
}

async function CreateSG(name, vpcId, ingressRules, configuration, vpnAccess, appsAccess, sgApps) {
    const sg = new aws.ec2.SecurityGroup(`rs-${name}`, {
        name: `${name}-rds-sg`,
        vpcId: vpcId.id
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
        await new aws.ec2.SecurityGroupRule(`rs-${name}-${sgIndex}`, {
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


async function CreateRedshift(cluster, kms, sg, subnetGroupName) {


    const password = new random.RandomPassword(`pwd-${cluster.name}`, {
        length: 14,
        special: false,
        lower: true,
        upper: true,
        number: true,
        overrideSpecial: `@`,
    });


    const reds = await new aws.redshift.Cluster(cluster.name, {
        clusterIdentifier: cluster.clusterIdentifier,
        nodeType: cluster.nodeType,
        allowVersionUpgrade: cluster.allowVersionUpgrade,
        applyImmediately: cluster.applyImmediately,
        clusterType: cluster.clusterType,
        numberOfNodes: cluster.numberOfNodes,
        automatedSnapshotRetentionPeriod: cluster.automatedSnapshotRetentionPeriod,
        kmsKeyId: kms.id,
        masterUsername: cluster.username,
        masterPassword: password.result,
        databaseName: cluster.name,
        encrypted: cluster.encrypted,
        skipFinalSnapshot: cluster.skipFinalSnapshot,
        vpcSecurityGroupIds: [sg.id],
        publiclyAccessible: cluster.publiclyAccessible,
        clusterSubnetGroupName: subnetGroupName,
        // clusterVersion: cluster.clusterVersion,
        tags: cluster.tags

    });

    await CreateSSMCredentialsRedshift(cluster, reds, password);


    if (cluster.scheduler.enable) {
        await new aws.redshift.ScheduledAction(`stop-${cluster.name}`, {
            enable: cluster.scheduler.enable,
            // startTime: '',
            // endTime: '',
            schedule: cluster.scheduler.cronStop,
            targetAction: {
                pauseCluster: {
                    clusterIdentifier: reds.clusterIdentifier
                }
            }

        })


        await new aws.redshift.ScheduledAction(`start-${cluster.name}`, {
            enable: cluster.scheduler.enable,
            // startTime: '',
            // endTime: '',
            schedule: cluster.scheduler.cronStart,
            targetAction: {
                resumeCluster: {
                    clusterIdentifier: reds.clusterIdentifier
                }
            }

        })
    }
    return reds;
}

async function Create(clusters, vpcId, configuration, sgApps,subnetSecure) {
    let endpoints = [];
    if (clusters.length > 0) {
        subnetGroup = await CreateSubnetGroup(subnetSecure.ids);
        kms = await CreateKMS();
    }
    for (const cluster of clusters) {
        const sg = await CreateSG(cluster.name, vpcId, cluster.ingressRules, configuration, cluster.vpnAccess, cluster.appsAccess, sgApps);
        const redshift = await CreateRedshift(cluster, kms.arn, sg, subnetGroup.name);

        // new aws.rds.Integration(``,{
        //     integrationName: '',
        //     sourceArn: '',
        //     targetArn: ''
        // })
    }

    return endpoints;
}

module.exports = {
    Create
}