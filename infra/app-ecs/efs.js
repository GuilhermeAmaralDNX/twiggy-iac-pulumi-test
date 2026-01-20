const aws = require("@pulumi/aws");


async function CreateSG(vpc,sgEcsNodes,configuration) {
    const sg = await new aws.ec2.SecurityGroup(`ecs-${configuration.ecsName}-efs`,{
        name: `efs-${configuration.ecsName}-${configuration.account}-${configuration.region}`,
        description: 'for EFS to talk to ECS cluster',
        vpcId: vpc.id,
        tags: {
            Name: `ecs-efs-${configuration.ecsName}`
        }
    });

    const nfsFromEcsToEfs = await new aws.ec2.SecurityGroupRule("nfsFromEcsToEfs", {
        description: "ECS to EFS",
        type: "ingress",
        fromPort: 2049,
        toPort: 2049,
        protocol: "tcp",
        securityGroupId: sg.id,
        sourceSecurityGroupId: sgEcsNodes.id,
    });
    

    return sg;
}

async function CreateEFS(kms,configuration) {
    
    const efs = await new aws.efs.FileSystem("ecs", {
        encrypted: true,
        kmsKeyId: kms.arn,
        throughputMode: configuration.throughputMode,
        provisionedThroughputInMibps: configuration.provisionedThroughputInMibps,
        tags: {
            Name: `ecs-${configuration.ecsName}-${configuration.account}-${configuration.region}`,
            Backup: "true"
        },
    });

    return efs;
}

async function CreateMountTarget(efs,subnets,sg) {
    for (const subnet of subnets.ids) {
        await new aws.efs.MountTarget(`mount-${subnet}`,{
            fileSystemId: efs.id,
            subnetId: subnet,
            securityGroups: [sg.id]
        },{ignoreChanges: ['subnetId']});
    }
    
}

async function CreateAccessPoints(efs,configuration) {
    let efsAccesPoints = [];

    for (const accessPoint of configuration.efsAccessPoints) {
        let posixUser  = null;
        if (accessPoint.posixUser && accessPoint.posixUser.enabled === "true") {
            posixUser = {
                gid: parseInt(accessPoint.posixUser.gid),
                uid: parseInt(accessPoint.posixUser.uid),
                secondaryGids: accessPoint.posixUser.secondaryGids.map(e => parseInt(e))
            }
        }
        let rootDirectory = null;
        if (accessPoint.rootDirectory && accessPoint.rootDirectory.enabled === "true") {
            rootDirectory = {
                path: accessPoint.rootDirectory.path,
                creationInfo: {
                    ownerGid: parseInt(accessPoint.rootDirectory.ownerGid),
                    ownerUid: parseInt(accessPoint.rootDirectory.ownerUid),
                    permissions: accessPoint.rootDirectory.permissions
                }
            }
        }
        let args = {
            fileSystemId: efs.id,
            posixUser: posixUser,
            rootDirectory: rootDirectory
        }
        
        const ap = await  new aws.efs.AccessPoint(accessPoint.name, args);
        efsAccesPoints.push({
            name: accessPoint.name,
            accessPointId: ap.id,
            fileSystemId: efs.id 
        })
    }
    return efsAccesPoints;
}


module.exports = {
    CreateEFS, CreateMountTarget, CreateSG, CreateAccessPoints
}